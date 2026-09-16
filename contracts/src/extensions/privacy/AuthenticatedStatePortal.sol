// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IPrivacyCollection, IPrivacyAccount} from "./PrivacyKeys.sol";

// LayerZero V2 wire ABI, from LayerZero-Labs/LayerZero-v2 ILayerZeroEndpointV2/ILayerZeroReceiver.
struct PortalOrigin { uint32 srcEid; bytes32 sender; uint64 nonce; }
struct PortalMessagingParams { uint32 dstEid; bytes32 receiver; bytes message; bytes options; bool payInLzToken; }
struct PortalMessagingFee { uint256 nativeFee; uint256 lzTokenFee; }
struct PortalMessagingReceipt { bytes32 guid; uint64 nonce; PortalMessagingFee fee; }
struct PortalSetConfigParam { uint32 eid; uint32 configType; bytes config; }
struct PortalUlnConfig { uint64 confirmations; uint8 requiredDVNCount; uint8 optionalDVNCount; uint8 optionalDVNThreshold; address[] requiredDVNs; address[] optionalDVNs; }
struct PortalExecutorConfig { uint32 maxMessageSize; address executor; }
interface IPortalEndpointV2 {
    function eid() external view returns(uint32);
    function quote(PortalMessagingParams calldata params,address sender) external view returns(PortalMessagingFee memory);
    function send(PortalMessagingParams calldata params,address refundAddress) external payable returns(PortalMessagingReceipt memory);
    function isRegisteredLibrary(address lib) external view returns(bool);
    function setSendLibrary(address oapp,uint32 eid,address lib) external;
    function setReceiveLibrary(address oapp,uint32 eid,address lib,uint256 gracePeriod) external;
    function getSendLibrary(address oapp,uint32 eid) external view returns(address);
    function getReceiveLibrary(address oapp,uint32 eid) external view returns(address,bool);
    function isDefaultSendLibrary(address oapp,uint32 eid) external view returns(bool);
    function setConfig(address oapp,address lib,PortalSetConfigParam[] calldata params) external;
    function getConfig(address oapp,address lib,uint32 eid,uint32 configType) external view returns(bytes memory);
}
interface IPortalWitnessRegistry {
    function submitWitness(bytes32 identity,uint32 remoteDomain,uint64 nonce,bytes32 stateRoot,bytes32 messageId) external;
}

/// @notice An immutable, read-only state bridge. Never grants execution, mints a second purse or moves funds across chains.
/// @dev Endpoint/DVN verification supplies cross-chain trust; the local delay alone is NOT a consensus finality proof.
contract AuthenticatedStatePortal {
    IPortalEndpointV2 public immutable endpoint;
    IPrivacyCollection public immutable collection;
    uint32 public immutable localEid;
    uint32 public immutable remoteEid;
    uint256 public immutable remoteChainId;
    bytes32 public immutable peer;
    address public immutable remoteCollection;
    IPortalWitnessRegistry public immutable registry;
    uint16 public immutable confirmations;
    address public immutable configurator;
    address public sendLibrary;
    address public receiveLibrary;
    bytes32 public sendUlnHash;
    bytes32 public receiveUlnHash;
    bytes32 public executorHash;
    bool public isSealed;
    struct Snapshot {
        uint256 chainId; address collectionAddress; uint256 tokenId; address owner;
        uint64 custodyEpoch; uint64 sequence; uint64 sourceBlock; uint64 expires;
        bytes32 stateRoot; bytes32 memoryRoot;
    }
    mapping(uint256 => Snapshot) public queued;
    mapping(uint256 => uint64) public outgoingSequence;
    mapping(bytes32 => bool) public consumed;
    mapping(bytes32 => Snapshot) private _remote;
    mapping(bytes32 => uint64) public transportNonce;
    mapping(bytes32 => uint64) public receivedAt;
    event Queued(uint256 indexed tokenId,uint64 sequence,uint64 sourceBlock,uint64 custodyEpoch);
    event Dispatched(uint256 indexed tokenId,bytes32 indexed guid,uint64 sequence);
    event Observed(bytes32 indexed identity,bytes32 indexed guid,uint64 sequence,uint64 custodyEpoch);
    event TransportConfigured(address sendLibrary,address receiveLibrary,bytes32 sendUlnHash,bytes32 receiveUlnHash,bytes32 executorHash);
    event TransportSealed();
    error InvalidState();
    constructor(address endpoint_,address collection_,uint32 remoteEid_,uint256 remoteChainId_,bytes32 peer_,address remoteCollection_,address registry_,uint16 confirmations_) {
        if(endpoint_.code.length == 0 || collection_.code.length == 0 || remoteEid_ == 0 || remoteChainId_ == 0 || peer_ == 0 || remoteCollection_ == address(0) || confirmations_ == 0 || confirmations_ > 200 || (registry_ != address(0) && registry_.code.length == 0)) revert InvalidState();
        endpoint = IPortalEndpointV2(endpoint_); collection = IPrivacyCollection(collection_); localEid = endpoint.eid();
        if(localEid == remoteEid_) revert InvalidState();
        remoteEid = remoteEid_; remoteChainId = remoteChainId_; peer = peer_; remoteCollection = remoteCollection_;
        registry = IPortalWitnessRegistry(registry_); confirmations = confirmations_;
        configurator = msg.sender;
    }
    /// @notice Pin explicit endpoint libraries, ULN confirmations/DVNs and executor before irreversibly sealing.
    /// @dev ABI-encoded official UlnConfig and ExecutorConfig. No DEFAULT field aliases are accepted.
    function configureTransport(address sendLibrary_,address receiveLibrary_,bytes calldata sendUln,bytes calldata receiveUln,bytes calldata executorConfig) external {
        if(msg.sender != configurator || isSealed || sendLibrary_.code.length == 0 || receiveLibrary_.code.length == 0 || !endpoint.isRegisteredLibrary(sendLibrary_) || !endpoint.isRegisteredLibrary(receiveLibrary_)) revert InvalidState();
        sendUlnHash = _explicitUln(sendUln); receiveUlnHash = _explicitUln(receiveUln);
        PortalExecutorConfig memory execution = abi.decode(executorConfig,(PortalExecutorConfig));
        if(execution.executor.code.length == 0 || execution.maxMessageSize < 1024) revert InvalidState();
        executorHash = keccak256(abi.encode(execution)); sendLibrary = sendLibrary_; receiveLibrary = receiveLibrary_;
        endpoint.setSendLibrary(address(this),remoteEid,sendLibrary_); endpoint.setReceiveLibrary(address(this),remoteEid,receiveLibrary_,0);
        PortalSetConfigParam[] memory sending = new PortalSetConfigParam[](2);
        sending[0] = PortalSetConfigParam(remoteEid,2,sendUln); sending[1] = PortalSetConfigParam(remoteEid,1,executorConfig);
        endpoint.setConfig(address(this),sendLibrary_,sending);
        PortalSetConfigParam[] memory receiving = new PortalSetConfigParam[](1); receiving[0] = PortalSetConfigParam(remoteEid,2,receiveUln);
        endpoint.setConfig(address(this),receiveLibrary_,receiving);
        _assertConfiguration(); emit TransportConfigured(sendLibrary_,receiveLibrary_,sendUlnHash,receiveUlnHash,executorHash);
    }
    function _explicitUln(bytes memory encoded) private view returns(bytes32) {
        PortalUlnConfig memory config = abi.decode(encoded,(PortalUlnConfig));
        if(config.confirmations < confirmations || config.confirmations == type(uint64).max || config.requiredDVNCount == 0 || config.requiredDVNCount > 127 || config.requiredDVNs.length != config.requiredDVNCount) revert InvalidState();
        if(config.optionalDVNCount == type(uint8).max) {
            if(config.optionalDVNs.length != 0 || config.optionalDVNThreshold != 0) revert InvalidState();
            config.optionalDVNCount = 0; // Endpoint getConfig returns the effective NONE value.
        } else if(config.optionalDVNCount == 0 || config.optionalDVNCount > 127 || config.optionalDVNs.length != config.optionalDVNCount || config.optionalDVNThreshold == 0 || config.optionalDVNThreshold > config.optionalDVNCount) revert InvalidState();
        address previous;
        for(uint256 i; i < config.requiredDVNs.length; ++i){address dvn=config.requiredDVNs[i];if(dvn <= previous || dvn.code.length == 0) revert InvalidState();previous=dvn;}
        previous = address(0);
        for(uint256 i; i < config.optionalDVNs.length; ++i){address dvn=config.optionalDVNs[i];if(dvn <= previous || dvn.code.length == 0) revert InvalidState();previous=dvn;}
        return keccak256(abi.encode(config));
    }
    function _assertConfiguration() private view {
        (address receiving,bool defaults) = endpoint.getReceiveLibrary(address(this),remoteEid);
        if(sendLibrary == address(0) || defaults || endpoint.isDefaultSendLibrary(address(this),remoteEid) || endpoint.getSendLibrary(address(this),remoteEid) != sendLibrary || receiving != receiveLibrary ||
           keccak256(endpoint.getConfig(address(this),sendLibrary,remoteEid,2)) != sendUlnHash || keccak256(endpoint.getConfig(address(this),receiveLibrary,remoteEid,2)) != receiveUlnHash || keccak256(endpoint.getConfig(address(this),sendLibrary,remoteEid,1)) != executorHash) revert InvalidState();
    }
    function sealTransport() external {
        if(msg.sender != configurator || isSealed) revert InvalidState(); _assertConfiguration(); isSealed = true; emit TransportSealed();
    }
    function _ready() private view { if(!isSealed) revert InvalidState(); _assertConfiguration(); }
    /// @notice Capture a Bound owner's state; permissionless dispatch occurs only after the configured block delay.
    function queue(uint256 id,uint64 expires) external {
        _ready();
        address owner = collection.ownerOf(id); IPrivacyAccount account = IPrivacyAccount(collection.accountOf(id));
        if(msg.sender != owner || account.mode() != 0 || expires <= block.timestamp + 60 || expires > block.timestamp + 1 hours) revert InvalidState();
        uint64 sequence = ++outgoingSequence[id];
        queued[id] = Snapshot(block.chainid,address(collection),id,owner,account.sessionEpoch(),sequence,uint64(block.number),expires,account.stateRoot(),account.memoryRoot());
        emit Queued(id,sequence,uint64(block.number),account.sessionEpoch());
    }
    function _payload(uint256 id) private view returns(bytes memory) {
        _ready();
        Snapshot memory s = queued[id]; IPrivacyAccount account = IPrivacyAccount(collection.accountOf(id));
        if(s.sequence == 0 || block.number < uint256(s.sourceBlock) + confirmations || block.number > uint256(s.sourceBlock) + 255 || block.timestamp >= s.expires || collection.ownerOf(id) != s.owner || account.sessionEpoch() != s.custodyEpoch || account.mode() != 0 || blockhash(s.sourceBlock) == 0) revert InvalidState();
        return abi.encode(s);
    }
    function quote(uint256 id,bytes calldata options) external view returns(PortalMessagingFee memory) {
        return endpoint.quote(PortalMessagingParams(remoteEid,peer,_payload(id),options,false),address(this));
    }
    function dispatch(uint256 id,bytes calldata options) external payable returns(bytes32 guid) {
        bytes memory payload = _payload(id); uint64 sequence = queued[id].sequence;
        // Checks-effects-interactions; failed sends restore queue atomically.
        delete queued[id];
        PortalMessagingReceipt memory receipt = endpoint.send{value:msg.value}(PortalMessagingParams(remoteEid,peer,payload,options,false),msg.sender);
        guid = receipt.guid; if(guid == 0) revert InvalidState(); emit Dispatched(id,guid,sequence);
    }
    function allowInitializePath(PortalOrigin calldata origin) external view returns(bool) { return origin.srcEid == remoteEid && origin.sender == peer; }
    // Zero selects unordered endpoint delivery. Application rejects older per-token snapshots itself.
    function nextNonce(uint32,bytes32) external pure returns(uint64) { return 0; }
    function lzReceive(PortalOrigin calldata origin,bytes32 guid,bytes calldata message,address,bytes calldata) external payable {
        _ready();
        if(msg.sender != address(endpoint) || msg.value != 0 || origin.srcEid != remoteEid || origin.sender != peer || origin.nonce == 0 || guid == 0 || consumed[guid]) revert InvalidState();
        Snapshot memory s = abi.decode(message,(Snapshot));
        bytes32 identity = keccak256(abi.encode(s.chainId,s.collectionAddress,s.tokenId)); Snapshot storage old = _remote[identity];
        if(s.chainId != remoteChainId || s.collectionAddress != remoteCollection || s.owner == address(0) || s.tokenId == 0 || s.custodyEpoch == 0 || s.stateRoot == 0 || s.sequence <= old.sequence || s.custodyEpoch < old.custodyEpoch || origin.nonce <= transportNonce[identity] || s.expires <= block.timestamp || s.expires > block.timestamp + 1 hours) revert InvalidState();
        consumed[guid] = true; transportNonce[identity] = origin.nonce; _remote[identity] = s; receivedAt[identity] = uint64(block.timestamp);
        if(address(registry) != address(0)) registry.submitWitness(identity,remoteEid,s.sequence,s.stateRoot,guid);
        emit Observed(identity,guid,s.sequence,s.custodyEpoch);
    }
    /// @return snapshot Authenticated historical observation. Owner may have changed since source dispatch.
    /// @return fresh Merely within its expiry window, never a grant of current remote custody or spending authority.
    function observation(bytes32 identity) external view returns(Snapshot memory snapshot,bool fresh) {
        snapshot = _remote[identity]; fresh = snapshot.sequence != 0 && block.timestamp < snapshot.expires;
    }
}
