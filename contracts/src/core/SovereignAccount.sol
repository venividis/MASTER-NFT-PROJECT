// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProtocolAssets} from "../protocol/ProtocolPrimitives.sol";

import {
    IERC721Control,
    IERC165,
    IOrganismCollection,
    IProofRouter
} from "../interfaces/Interfaces.sol";
import {SignatureChecker} from "../lib/Crypto.sol";
import {ProofRouter} from "./ProofRouter.sol";

/// @notice Deterministic account whose controller follows an NFT until irreversible sovereign promotion.
contract SovereignAccount is IERC165 {
    enum Mode {
        Bound,
        Sovereign
    }

    struct Session {
        address target;
        bytes4 selector;
        uint96 maxValuePerCall;
        uint48 validAfter;
        uint48 validUntil;
        uint32 maxCalls;
        uint32 calls;
        uint64 epoch;
        bool active;
    }

    struct Intent {
        address target;
        uint256 value;
        bytes32 dataHash;
        uint256 nonce;
        uint48 validAfter;
        uint48 validUntil;
        bytes32 priorStateRoot;
        bytes32 nextStateRoot;
        bytes32 nextMemoryRoot;
        bytes32 policyHash;
        bytes32 evidenceHash;
        uint32 verifierId;
    }

    bytes32 public constant OWNER_ACTION_TYPEHASH = keccak256(
        "OwnerAction(address account,uint256 chainId,address target,uint256 value,bytes32 dataHash,uint256 nonce,address operator)"
    );
    bytes32 public constant SESSION_ACTION_TYPEHASH = keccak256(
        "SessionAction(address account,uint256 chainId,address key,address target,uint256 value,bytes32 dataHash,uint256 nonce,uint64 epoch)"
    );
    bytes32 public constant INTENT_TYPEHASH = keccak256(
        "Intent(address account,uint256 chainId,address target,uint256 value,bytes32 dataHash,uint256 nonce,uint48 validAfter,uint48 validUntil,bytes32 priorStateRoot,bytes32 nextStateRoot,bytes32 nextMemoryRoot,bytes32 policyHash,bytes32 evidenceHash,uint32 verifierId)"
    );

    bytes4 public constant ERC1271_MAGICVALUE = 0x1626ba7e;
    bytes4 public constant ERC6551_VALID_SIGNER = 0x523e3260;

    address public immutable collection;
    uint256 public immutable tokenId;
    IProofRouter public immutable proofRouter;

    Mode public mode;
    bytes32 public constitutionHash;
    bytes32 public stateRoot;
    bytes32 public memoryRoot;
    bytes32 public auditRoot;
    uint256 public actionNonce;
    uint64 public sessionEpoch = 1;
    uint48 public lastActionAt;
    uint96 public maxValuePerAction;
    uint32 public minActionDelay;
    uint32 public sovereignVerifierId;
    address public sovereignVerifier;
    bytes32 public sovereignVerifierCodeHash;
    uint64 public sovereignVerifierEpoch;
    event SovereignVerifierConfigured(uint32 indexed id, address indexed verifier, uint64 epoch);

    mapping(address => Session) public sessions;
    mapping(bytes32 => bool) public proofApprovedDigest;

    bool private _entered;

    event Executed(
        uint256 indexed nonce,
        address indexed operator,
        address indexed target,
        uint256 value,
        bytes32 statement,
        bytes32 resultHash,
        bytes32 newAuditRoot
    );
    event SessionConfigured(
        address indexed key,
        address indexed target,
        bytes4 selector,
        uint48 validUntil,
        uint32 maxCalls,
        uint64 epoch
    );
    event SessionRevoked(address indexed key, uint64 epoch);
    event SessionEpochInvalidated(uint64 epoch);
    event Ascended(
        bytes32 indexed constitutionHash,
        uint96 maxValuePerAction,
        uint32 minActionDelay,
        uint64 newSessionEpoch,
        bytes32 newAuditRoot
    );
    event VerifiedIntentExecuted(
        uint256 indexed nonce,
        uint32 indexed verifierId,
        bytes32 indexed statement,
        bytes32 priorStateRoot,
        bytes32 nextStateRoot,
        bytes32 evidenceHash
    );

    error Unauthorized();
    error InvalidTarget();
    error InvalidSession();
    error SessionExpired();
    error SessionExhausted();
    error AlreadySovereign();
    error SovereignOnly();
    error BoundOnly();
    error InvalidIntent();
    error InvalidProof();
    error ValueLimitExceeded();
    error CooldownActive();
    error Reentrancy();

    constructor(address collection_, uint256 tokenId_, address proofRouter_) {
        if (collection_ == address(0) || proofRouter_ == address(0)) revert InvalidTarget();
        collection = collection_;
        tokenId = tokenId_;
        proofRouter = IProofRouter(proofRouter_);
        (bytes32 initialState, bytes32 initialMemory) = IOrganismCollection(collection_).initialStateOf(tokenId_);
        stateRoot = initialState;
        memoryRoot = initialMemory;
        auditRoot = keccak256(
            abi.encodePacked(
                "IDONTFUCKINGBELIEVEIT_AUDIT_GENESIS_V1",
                block.chainid,
                address(this),
                tokenId_,
                initialState,
                initialMemory
            )
        );
    }

    modifier nonReentrant() {
        if (_entered) revert Reentrancy();
        _entered = true;
        _;
        _entered = false;
    }

    modifier onlyController() {
        if (!_isController(msg.sender)) revert Unauthorized();
        _;
    }

    modifier onlyBound() {
        if (mode != Mode.Bound) revert BoundOnly();
        _;
    }

    function currentOwner() public view returns (address) {
        return IERC721Control(collection).ownerOf(tokenId);
    }

    /// @notice Legacy selector sessions cannot express token budgets. New editions reject them.
    /// Existing immutable deployments are unaffected. Use grantAction/executeInstrument.
    function createSession(address,address,bytes4,uint96,uint48,uint48,uint32)
        external onlyController onlyBound { revert InvalidSession(); }

    function revokeSession(address key) external onlyController onlyBound {
        delete sessions[key];
        ++instrumentRevision;
        emit SessionRevoked(key, sessionEpoch);
    }

    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external payable onlyController onlyBound nonReentrant returns (bytes memory result) {
        _validateTarget(target);
        uint256 nonce = actionNonce;
        bytes32 statement = keccak256(
            abi.encode(
                OWNER_ACTION_TYPEHASH,
                address(this),
                block.chainid,
                target,
                value,
                keccak256(data),
                nonce,
                msg.sender
            )
        );
        unchecked { actionNonce = nonce + 1; }
        result = _call(target, value, data);
        _appendAudit(nonce, msg.sender, target, value, statement, result);
    }

    event UtilityExecuted(uint256 indexed nonce,address indexed target,address indexed asset,uint256 allowance,uint256 value,bytes32 calldataHash);

    function utilityVersion() external pure returns (bytes32) {
        return keccak256("idfbi/four-chambers/1.3");
    }

    /// @notice One approved action: exact allowance -> call -> allowance reset, atomically.
    /// @dev No signature bypass. Owner-only in Bound mode; sovereign authority uses executeVerified.
    ///      Existing NFT account balances fund value. Optional msg.value is an explicit top-up.
    function executeUtility(
        uint256 expectedNonce,uint48 deadline,address asset,address target,
        uint256 value,bytes calldata data,uint256 allowanceAmount
    ) external payable onlyController onlyBound nonReentrant returns (bytes memory result) {
        if(expectedNonce!=actionNonce || block.timestamp>deadline) revert InvalidIntent();
        _validateTarget(target);
        if(target.code.length==0 || target==asset || (asset==address(0) && allowanceAmount!=0)) revert InvalidTarget();
        address holder=currentOwner(); uint64 epoch=sessionEpoch; uint256 nonce=actionNonce;
        if(value>address(this).balance) revert ValueLimitExceeded();
        unchecked {actionNonce=nonce+1;}
        if(asset!=address(0)) ProtocolAssets.approveExact(asset,target,allowanceAmount);
        result=_call(target,value,data);
        if(asset!=address(0)) ProtocolAssets.approveExact(asset,target,0);
        // A callback cannot transfer the NFT mid-recipe then continue spending its new owner's funds.
        if(currentOwner()!=holder || sessionEpoch!=epoch || mode!=Mode.Bound) revert InvalidIntent();
        bytes32 statement=keccak256(abi.encode("IDFBI_UTILITY_1_3",address(this),block.chainid,nonce,deadline,asset,target,value,keccak256(data),allowanceAmount));
        _appendAudit(nonce,msg.sender,target,value,statement,result);
        emit UtilityExecuted(nonce,target,asset,allowanceAmount,value,keccak256(data));
    }

    // 1.6 bounded instrument grants. Content adoption is separate from authority.
    // Existing accounts are immutable; this source does NOT patch deployed instances.
    struct InstrumentAdoption {address registry;bytes32 edition;bytes32 contentHash;bytes32 registryCodeHash;uint64 readyAt;}
    struct InstrumentGrant {
        bytes32 adoption;address caller;address target;address asset;
        bytes32 dataHash;bytes32 targetCodeHash;
        uint112 perCall;uint112 remaining;uint96 value;
        uint48 expires;uint64 epoch;uint32 callsRemaining;bool revoked;
    }
    mapping(bytes32=>InstrumentAdoption) public adoptedInstruments;
    mapping(uint256=>InstrumentGrant) public instrumentGrants;
    uint256 public instrumentGrantCount;
    uint256 public instrumentRevision;
    event InstrumentAdopted(bytes32 indexed adoption,address indexed registry,bytes32 indexed edition,uint64 readyAt);
    event InstrumentGranted(uint256 indexed grant,bytes32 indexed adoption,address indexed caller,uint64 epoch,uint112 budget,uint48 expires);
    event InstrumentUsed(uint256 indexed grant,uint256 indexed nonce,uint256 debit,bytes32 resultHash);
    event InstrumentPermissionRevoked(uint256 indexed grant);

    function adoptInstrument(address registry,bytes32 edition) external onlyController onlyBound returns(bytes32 key){
        if(registry.code.length==0)revert InvalidTarget();
        (bool ok,bytes memory ret)=registry.staticcall(abi.encodeWithSignature("editionCommitment(bytes32)",edition));
        if(!ok||ret.length!=32||abi.decode(ret,(bytes32))==0)revert InvalidIntent();
        key=keccak256(abi.encode(registry,edition));if(adoptedInstruments[key].registry!=address(0))revert InvalidIntent();
        uint64 ready=uint64(block.timestamp+7 days);adoptedInstruments[key]=InstrumentAdoption(registry,edition,abi.decode(ret,(bytes32)),registry.codehash,ready);
        ++instrumentRevision;emit InstrumentAdopted(key,registry,edition,ready);
    }
    function grantInstrument(bytes32 adoption,address caller,address target,address asset,bytes32 dataHash,uint112 perCall,uint112 budget,uint96 value,uint48 expires,uint32 maxCalls) external onlyController onlyBound returns(uint256 id){
        InstrumentAdoption storage a=adoptedInstruments[adoption];
        if(a.registry==address(0)||block.timestamp<a.readyAt||a.registry.codehash!=a.registryCodeHash)revert InvalidIntent();
        (bool ok,bytes memory ret)=a.registry.staticcall(abi.encodeWithSignature("editionCommitment(bytes32)",a.edition));
        if(!ok||ret.length!=32||abi.decode(ret,(bytes32))!=a.contentHash)revert InvalidIntent();
        return _grantAction(adoption,caller,target,asset,dataHash,perCall,budget,value,expires,maxCalls);
    }
    /// @notice Explicit owner-reviewed exact calldata, one asset budget, bounded lifetime and calls.
    /// Asset zero monitors native ETH; token grants authorize no native value. Proxy behavior
    /// can change without runtime hash changes: the owner must review the selected target.
    function grantAction(address caller,address target,address asset,bytes32 dataHash,uint112 perCall,uint112 budget,uint96 value,uint48 expires,uint32 maxCalls) external onlyController onlyBound returns(uint256 id){
        return _grantAction(bytes32(0),caller,target,asset,dataHash,perCall,budget,value,expires,maxCalls);
    }
    function _grantAction(bytes32 adoption,address caller,address target,address asset,bytes32 dataHash,uint112 perCall,uint112 budget,uint96 value,uint48 expires,uint32 maxCalls) private returns(uint256 id){
        if(target.code.length==0||target==asset||target==address(this)||caller==address(0)||dataHash==0||perCall==0||budget<perCall||expires<=block.timestamp||expires>block.timestamp+30 days||maxCalls==0||maxCalls>100||(asset==address(0)?value>perCall:value!=0)||(asset!=address(0)&&asset.code.length==0))revert InvalidIntent();
        id=++instrumentGrantCount;instrumentGrants[id]=InstrumentGrant(adoption,caller,target,asset,dataHash,target.codehash,perCall,budget,value,expires,sessionEpoch,maxCalls,false);
        ++instrumentRevision;emit InstrumentGranted(id,adoption,caller,sessionEpoch,budget,expires);
    }
    function actionGrant(uint256 id) external view returns(InstrumentGrant memory){return instrumentGrants[id];}
    function revokeInstrument(uint256 id) external onlyController onlyBound{InstrumentGrant storage g=instrumentGrants[id];if(g.caller==address(0))revert InvalidIntent();g.revoked=true;++instrumentRevision;emit InstrumentPermissionRevoked(id);}
    function executeInstrument(uint256 id,uint256 expectedNonce,bytes calldata data) external onlyBound nonReentrant returns(bytes memory result){
        InstrumentGrant storage g=instrumentGrants[id];
        if(g.revoked||g.caller!=msg.sender||g.epoch!=sessionEpoch||block.timestamp>=g.expires||g.callsRemaining==0||g.remaining==0||g.value>g.remaining||expectedNonce!=actionNonce||g.target.codehash!=g.targetCodeHash||keccak256(data)!=g.dataHash)revert InvalidIntent();
        address holder=currentOwner();uint64 epoch=sessionEpoch;uint256 beforeInput=ProtocolAssets.balance(g.asset,address(this));
        --g.callsRemaining;uint256 nonce=actionNonce++;if(g.asset!=address(0))ProtocolAssets.approveExact(g.asset,g.target,g.remaining<g.perCall?g.remaining:g.perCall);
        result=_call(g.target,g.value,data);if(g.asset!=address(0))ProtocolAssets.approveExact(g.asset,g.target,0);
        uint256 afterInput=ProtocolAssets.balance(g.asset,address(this));uint256 spent=beforeInput>afterInput?beforeInput-afterInput:0;
        if(spent>g.perCall||spent>g.remaining||currentOwner()!=holder||sessionEpoch!=epoch||mode!=Mode.Bound)revert InvalidIntent();
        g.remaining-=uint112(spent);++instrumentRevision;bytes32 statement=keccak256(abi.encode("IDFBI_INSTRUMENT_1_6",block.chainid,address(this),id,nonce,epoch,g.adoption,g.dataHash));
        _appendAudit(nonce,msg.sender,g.target,g.value,statement,result);emit InstrumentUsed(id,nonce,spent,keccak256(result));
    }

    /// @notice Atomic Bound-mode evolution. The NFT validates the same next root.
    /// @dev expectedNonce prevents a stale UI review from evolving a different head.
    /// All state changes revert if the collection rejects the proposed transition.
    function evolveBound(
        uint256 expectedNonce,
        bytes32 newGenome,
        bytes32 newMemoryRoot,
        bytes32 evidenceHash
    ) external onlyController onlyBound nonReentrant {
        if (expectedNonce != actionNonce || newGenome == bytes32(0) ||
            newMemoryRoot == bytes32(0) || evidenceHash == bytes32(0)) revert InvalidIntent();
        bytes32 nextRoot = IOrganismCollection(collection).deriveEvolutionStateRoot(
            tokenId, newGenome, newMemoryRoot, evidenceHash
        );
        bytes32 statement = keccak256(abi.encode(
            "IDONTFUCKINGBELIEVEIT_BOUND_EVOLUTION_V1_2", address(this), block.chainid,
            expectedNonce, msg.sender, stateRoot, nextRoot, newGenome, newMemoryRoot, evidenceHash
        ));
        actionNonce = expectedNonce + 1;
        stateRoot = nextRoot;
        memoryRoot = newMemoryRoot;
        bytes memory data = abi.encodeCall(IOrganismCollection.commitEvolution,
            (tokenId, newGenome, newMemoryRoot, evidenceHash));
        bytes memory result = _call(collection, 0, data);
        _appendAudit(expectedNonce, msg.sender, collection, 0, statement, result);
    }

    /// @notice Old session keys must not follow the NFT to its new owner.
    /// @dev No nonReentrant modifier: a proof-authorized transfer calls back here
    /// from inside executeVerified. Only the immutable collection may invalidate.
    function invalidateSessionsOnTransfer() external {
        if (msg.sender != collection) revert Unauthorized();
        ++sessionEpoch;
        emit SessionEpochInvalidated(sessionEpoch);
    }

    function executeSession(address,uint256,bytes calldata)
        external payable onlyBound returns (bytes memory) { revert InvalidSession(); }

    /// @notice Select proof authority explicitly before irreversible promotion.
    function configureSovereignVerifier(uint32 id) external {
        if (mode != Mode.Bound || msg.sender != currentOwner()) revert Unauthorized();
        address verifier = proofRouter.verifierOf(id);
        if (id == 0 || verifier.code.length == 0) revert InvalidProof();
        sovereignVerifierId = id;
        sovereignVerifier = verifier;
        sovereignVerifierCodeHash = verifier.codehash;
        sovereignVerifierEpoch = sessionEpoch;
        emit SovereignVerifierConfigured(id, verifier, sessionEpoch);
    }

    /// @notice Called exactly once by the NFT contract. There is no transition back to Bound mode.
    function promoteSovereign(
        bytes32 constitutionHash_,
        uint96 maxValuePerAction_,
        uint32 minActionDelay_
    ) external {
        if (msg.sender != collection) revert Unauthorized();
        if (mode == Mode.Sovereign) revert AlreadySovereign();
        if (constitutionHash_ == bytes32(0)) revert InvalidIntent();
        if (sovereignVerifierId == 0 || sovereignVerifierEpoch != sessionEpoch ||
            proofRouter.verifierOf(sovereignVerifierId) != sovereignVerifier ||
            sovereignVerifier.codehash != sovereignVerifierCodeHash ||
            !sovereignAuthorityReady()) revert InvalidProof();

        mode = Mode.Sovereign;
        constitutionHash = constitutionHash_;
        maxValuePerAction = maxValuePerAction_;
        minActionDelay = minActionDelay_;
        unchecked { ++sessionEpoch; }

        bytes32 statement = keccak256(
            abi.encodePacked(
                "IDONTFUCKINGBELIEVEIT_ASCENSION_V1",
                address(this),
                block.chainid,
                constitutionHash_,
                maxValuePerAction_,
                minActionDelay_,
                sessionEpoch
            )
        );
        auditRoot = keccak256(abi.encode(auditRoot, statement));
        emit Ascended(
            constitutionHash_,
            maxValuePerAction_,
            minActionDelay_,
            sessionEpoch,
            auditRoot
        );
    }

    function intentStatement(Intent calldata intent) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                INTENT_TYPEHASH,
                address(this),
                block.chainid,
                intent.target,
                intent.value,
                intent.dataHash,
                intent.nonce,
                intent.validAfter,
                intent.validUntil,
                intent.priorStateRoot,
                intent.nextStateRoot,
                intent.nextMemoryRoot,
                intent.policyHash,
                intent.evidenceHash,
                intent.verifierId
            )
        );
    }

    /// @notice Anyone may relay a valid proof; authority comes from the proof, not the relayer.
    function executeVerified(
        Intent calldata intent,
        bytes calldata data,
        bytes calldata proof
    ) external payable nonReentrant returns (bytes memory result) {
        if (mode != Mode.Sovereign) revert SovereignOnly();
        _validateTarget(intent.target);
        if (
            intent.dataHash != keccak256(data) ||
            intent.nonce != actionNonce ||
            intent.validUntil < block.timestamp ||
            intent.validAfter > block.timestamp ||
            intent.validUntil <= intent.validAfter ||
            intent.priorStateRoot != stateRoot ||
            intent.nextStateRoot == bytes32(0) ||
            intent.nextMemoryRoot == bytes32(0) ||
            intent.policyHash != constitutionHash ||
            intent.evidenceHash == bytes32(0) ||
            intent.verifierId != sovereignVerifierId ||
            proofRouter.verifierOf(intent.verifierId) != sovereignVerifier ||
            sovereignVerifier.codehash != sovereignVerifierCodeHash
        ) revert InvalidIntent();
        if (intent.value > maxValuePerAction) revert ValueLimitExceeded();
        if (
            minActionDelay != 0 &&
            lastActionAt != 0 &&
            block.timestamp < uint256(lastActionAt) + minActionDelay
        ) revert CooldownActive();

        bytes32 statement = intentStatement(intent);
        if (!proofRouter.verify(intent.verifierId, statement, proof)) revert InvalidProof();

        uint256 nonce = actionNonce;
        unchecked { actionNonce = nonce + 1; }
        stateRoot = intent.nextStateRoot;
        memoryRoot = intent.nextMemoryRoot;
        lastActionAt = uint48(block.timestamp);
        proofApprovedDigest[statement] = true;

        result = _call(intent.target, intent.value, data);
        _appendAudit(nonce, msg.sender, intent.target, intent.value, statement, result);
        emit VerifiedIntentExecuted(
            nonce,
            intent.verifierId,
            statement,
            intent.priorStateRoot,
            intent.nextStateRoot,
            intent.evidenceHash
        );
    }

    function token() external view returns (uint256 chainId, address tokenContract, uint256 id) {
        return (block.chainid, collection, tokenId);
    }

    function state() external view returns (uint256) {
        return actionNonce;
    }

    function isValidSigner(address signer, bytes calldata) external view returns (bytes4) {
        // A target/selector grant is not general external signing authority.
        // Callers needing a scoped action must use executeInstrument.
        if (mode == Mode.Bound && _isController(signer)) return ERC6551_VALID_SIGNER;
        return bytes4(0);
    }

    /// @notice Readiness for the narrowly supported irreversible attestation route.
    /// @dev Only the concrete non-proxy router and frozen threshold verifier qualify.
    /// This does not promise signer availability, honest decisions, or zk soundness.
    function sovereignAuthorityReady() public view returns (bool) {
        if (address(proofRouter).codehash != keccak256(type(ProofRouter).runtimeCode)) return false;
        return ProofRouter(address(proofRouter)).frozenAuthority(sovereignVerifierId);
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        if (mode == Mode.Bound) {
            return SignatureChecker.isValidSignatureNow(currentOwner(), hash, signature)
                ? ERC1271_MAGICVALUE
                : bytes4(0xffffffff);
        }
        return proofApprovedDigest[hash] ? ERC1271_MAGICVALUE : bytes4(0xffffffff);
    }

    /// @notice Accept external collectibles without granting them any execution authority.
    /// @dev Same-root-collection safe nesting remains disabled until ownership-cycle rules
    /// are separately implemented. Existing unsafe ERC721 transfer paths are not certified.
    function onERC721Received(address,address,uint256,bytes calldata) external view returns(bytes4) {
        if(msg.sender==collection) revert InvalidTarget();
        return 0x150b7a02;
    }
    function onERC1155Received(address,address,uint256,uint256,bytes calldata) external pure returns(bytes4) {return 0xf23a6e61;}
    function onERC1155BatchReceived(address,address,uint256[] calldata,uint256[] calldata,bytes calldata) external pure returns(bytes4) {return 0xbc197c81;}

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == 0x1626ba7e ||
            interfaceId == 0x6faff5f1 ||
            interfaceId == 0x4e2312e0;
    }

    receive() external payable {}

    // ERC-721 sale/operator approvals are NOT spending or policy authority.
    function _isController(address operator) internal view returns (bool) {
        return operator == IERC721Control(collection).ownerOf(tokenId);
    }

    function _validateTarget(address target) internal view {
        if (target == address(0) || target == address(this)) revert InvalidTarget();
    }

    function _selector(bytes calldata data) internal pure returns (bytes4 selector) {
        if (data.length < 4) return bytes4(0);
        assembly ("memory-safe") {
            selector := calldataload(data.offset)
        }
    }

    function _call(
        address target,
        uint256 value,
        bytes memory data
    ) internal returns (bytes memory result) {
        (bool ok, bytes memory returned) = target.call{value: value}(data);
        if (!ok) {
            assembly ("memory-safe") {
                revert(add(returned, 32), mload(returned))
            }
        }
        return returned;
    }

    function _appendAudit(
        uint256 nonce,
        address operator,
        address target,
        uint256 value,
        bytes32 statement,
        bytes memory result
    ) internal {
        bytes32 resultHash = keccak256(result);
        auditRoot = keccak256(
            abi.encode(
                auditRoot,
                nonce,
                operator,
                target,
                value,
                statement,
                resultHash,
                block.number,
                block.timestamp
            )
        );
        emit Executed(nonce, operator, target, value, statement, resultHash, auditRoot);
    }
}
