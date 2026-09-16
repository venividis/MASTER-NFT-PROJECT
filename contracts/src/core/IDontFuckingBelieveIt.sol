// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Administrated} from "../lib/Administrated.sol";
import {Base64} from "../lib/Base64.sol";
import {
    IERC165,
    IERC721Receiver,
    IOnchainRenderer,
    ISovereignAccountFactory,
    ISovereignAccountControl,
    ISovereignAccountView,
    OrganismRenderData
} from "../interfaces/Interfaces.sol";

/// @title i dont fucking believe it!
/// @notice A proof-carrying, self-rendering, agent-native NFT that can irreversibly become sovereign.
contract IDontFuckingBelieveIt is Administrated, IERC165 {
    string public constant name = "i dont fucking believe it!";
    string public constant symbol = "IDFBI";

    uint64 public constant MIN_REVEAL_DELAY = 2;
    uint64 public constant MAX_REVEAL_DELAY = 200;
    uint256 public constant MAX_METADATA_BYTES = 8_192;

    bytes32 public constant EVOLUTION_STATE_TYPEHASH = keccak256(
        "EvolutionState(address collection,uint256 chainId,uint256 tokenId,bytes32 oldGenome,bytes32 newGenome,bytes32 newMemoryRoot,bytes32 evidenceHash,uint32 evolution)"
    );

    bytes32 private constant KEY_CORE_SEED = keccak256("core.seed");
    bytes32 private constant KEY_CORE_GENOME = keccak256("core.genome");
    bytes32 private constant KEY_CORE_STATE_ROOT = keccak256("core.stateRoot");
    bytes32 private constant KEY_CORE_MEMORY_ROOT = keccak256("core.memoryRoot");
    bytes32 private constant KEY_CORE_AUDIT_ROOT = keccak256("core.auditRoot");
    bytes32 private constant KEY_CORE_ACCOUNT = keccak256("core.account");
    bytes32 private constant KEY_CORE_SOVEREIGN = keccak256("core.sovereign");
    bytes32 private constant KEY_AGENT_BINDING = keccak256("agent-binding");

    struct Organism {
        bytes32 seed;
        bytes32 genome;
        bytes32 memoryRoot;
        bytes32 lineageRoot;
        uint64 bornAt;
        uint64 evolvedAt;
        uint32 generation;
        uint32 evolutions;
        uint256 parentId;
        bool sovereign;
        address agentRegistry;
        uint256 agentId;
        bytes32 bindingProofHash;
    }

    struct AwakeningCommitment {
        bytes32 commitment;
        uint64 blockNumber;
        uint128 endowment;
    }

    struct UserInfo {
        address user;
        uint64 expires;
    }

    IOnchainRenderer public immutable renderer;
    address public immutable proofRouter;
    address public immutable witnessRegistry;
    ISovereignAccountFactory public accountFactory;

    uint256 private _nextTokenId = 1;
    uint256 private _totalSupply;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    mapping(uint256 => Organism) private _organisms;
    mapping(uint256 => address) private _accounts;
    mapping(address => uint256) public artifactIdOfAccount;
    mapping(uint256 => mapping(bytes32 => bytes)) private _metadata;
    mapping(address => AwakeningCommitment) public awakeningCommitments;
    mapping(uint256 => UserInfo) private _users;

    address public royaltyReceiver;
    uint16 public royaltyBps;
    bool public royaltyFrozen;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event MetadataUpdate(uint256 tokenId);
    event BatchMetadataUpdate(uint256 fromTokenId, uint256 toTokenId);
    event UpdateUser(uint256 indexed tokenId, address indexed user, uint64 expires);

    event MetadataSet(
        uint256 indexed tokenId,
        string indexed indexedKey,
        string key,
        bytes value
    );
    event AwakeningCommitted(
        address indexed awakener,
        bytes32 indexed commitment,
        uint64 blockNumber,
        uint256 endowment
    );
    event Awakened(
        uint256 indexed tokenId,
        address indexed owner,
        address indexed account,
        bytes32 seed,
        bytes32 genome,
        uint256 endowment
    );
    event DescendantSpawned(
        uint256 indexed parentId,
        uint256 indexed childId,
        address indexed childAccount,
        uint32 generation,
        bytes32 lineageRoot
    );
    event Evolved(
        uint256 indexed tokenId,
        uint32 indexed evolution,
        bytes32 oldGenome,
        bytes32 newGenome,
        bytes32 newMemoryRoot,
        bytes32 evidenceHash,
        bytes32 stateRoot
    );
    event Ascended(
        uint256 indexed tokenId,
        address indexed account,
        bytes32 indexed constitutionHash,
        uint96 maxValuePerAction,
        uint32 minActionDelay
    );
    event ERC8004Bound(
        uint256 indexed tokenId,
        address indexed registry,
        uint256 indexed agentId,
        bytes32 bindingProofHash
    );
    event FactoryConfigured(address indexed factory);
    event RoyaltyConfigured(address indexed receiver, uint16 bps);
    event RoyaltyFrozen();

    error NonexistentToken();
    error InvalidRecipient();
    error Unauthorized();
    error AlreadySovereign();
    error SovereignControlRequired();
    error FactoryNotConfigured();
    error FactoryAlreadyConfigured();
    error InvalidCommitment();
    error RevealTooEarly();
    error RevealExpired();
    error ActiveCommitment();
    error NoCommitment();
    error RefundFailed();
    error EndowmentFailed();
    error UnsafeRecipient();
    error InvalidEvolution();
    error InvalidMetadata();
    error ReservedMetadataKey();
    error BindingAlreadySet();
    error RoyaltyIsFrozen();
    error InvalidRoyalty();
    error ForbiddenTransferTarget();

    constructor(
        address admin,
        address renderer_,
        address proofRouter_,
        address witnessRegistry_,
        address royaltyReceiver_,
        uint16 royaltyBps_
    ) Administrated(admin) {
        if (
            renderer_.code.length == 0 ||
            proofRouter_.code.length == 0 ||
            witnessRegistry_.code.length == 0
        ) revert ZeroAddress();
        if (royaltyReceiver_ == address(0) || royaltyBps_ > 1_000) revert InvalidRoyalty();
        renderer = IOnchainRenderer(renderer_);
        proofRouter = proofRouter_;
        witnessRegistry = witnessRegistry_;
        royaltyReceiver = royaltyReceiver_;
        royaltyBps = royaltyBps_;
    }

    function setAccountFactory(address factory_) external onlyOwner {
        if (address(accountFactory) != address(0)) revert FactoryAlreadyConfigured();
        if (factory_.code.length == 0) revert ZeroAddress();
        accountFactory = ISovereignAccountFactory(factory_);
        emit FactoryConfigured(factory_);
    }

    // ---------------------------------------------------------------------
    // Awakening: commit/reveal removes single-transaction entropy selection.
    // ---------------------------------------------------------------------

    function commitmentFor(
        address awakener,
        bytes32 secret,
        address recipient
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(awakener, secret, recipient));
    }

    function commitAwakening(bytes32 commitment) external payable {
        if (address(accountFactory) == address(0)) revert FactoryNotConfigured();
        if (commitment == bytes32(0) || msg.value > type(uint128).max) revert InvalidCommitment();
        if (awakeningCommitments[msg.sender].commitment != bytes32(0)) revert ActiveCommitment();
        awakeningCommitments[msg.sender] = AwakeningCommitment({
            commitment: commitment,
            blockNumber: uint64(block.number),
            endowment: uint128(msg.value)
        });
        emit AwakeningCommitted(msg.sender, commitment, uint64(block.number), msg.value);
    }

    function revealAwakening(
        bytes32 secret,
        address recipient
    ) external returns (uint256 tokenId, address account) {
        AwakeningCommitment memory committed = awakeningCommitments[msg.sender];
        if (committed.commitment == bytes32(0)) revert NoCommitment();
        if (block.number < uint256(committed.blockNumber) + MIN_REVEAL_DELAY) revert RevealTooEarly();
        if (block.number > uint256(committed.blockNumber) + MAX_REVEAL_DELAY) revert RevealExpired();
        if (commitmentFor(msg.sender, secret, recipient) != committed.commitment) {
            revert InvalidCommitment();
        }
        if (recipient == address(0)) revert InvalidRecipient();

        bytes32 delayedEntropy = blockhash(uint256(committed.blockNumber) + 1);
        if (delayedEntropy == bytes32(0)) revert RevealExpired();
        delete awakeningCommitments[msg.sender];

        bytes32 seed = keccak256(
            abi.encode(
                "IDONTFUCKINGBELIEVEIT_AWAKENING_V1",
                block.chainid,
                address(this),
                msg.sender,
                recipient,
                secret,
                delayedEntropy,
                block.prevrandao,
                _nextTokenId
            )
        );
        (tokenId, account) = _awaken(recipient, seed, 0, 0, bytes32(0), committed.endowment);
    }

    function cancelExpiredAwakening() external {
        AwakeningCommitment memory committed = awakeningCommitments[msg.sender];
        if (committed.commitment == bytes32(0)) revert NoCommitment();
        if (block.number <= uint256(committed.blockNumber) + MAX_REVEAL_DELAY) revert RevealTooEarly();
        delete awakeningCommitments[msg.sender];
        (bool ok, ) = payable(msg.sender).call{value: committed.endowment}("");
        if (!ok) revert RefundFailed();
    }

    /// @notice The parent account—not the current wallet—creates descendants.
    function spawnFromAccount(
        uint256 parentId,
        address recipient,
        bytes32 reproductiveSalt
    ) external payable returns (uint256 childId, address childAccount) {
        _requireExists(parentId);
        if (msg.sender != _accounts[parentId]) revert Unauthorized();
        if (
            recipient == address(0) ||
            recipient == msg.sender ||
            recipient == address(this) ||
            recipient == address(accountFactory)
        ) revert InvalidRecipient();

        Organism storage parent = _organisms[parentId];
        bytes32 seed = keccak256(
            abi.encode(
                "IDONTFUCKINGBELIEVEIT_DESCENDANT_V1",
                block.chainid,
                address(this),
                parentId,
                parent.seed,
                parent.genome,
                parent.evolutions,
                reproductiveSalt,
                msg.sender,
                _nextTokenId
            )
        );
        bytes32 lineage = keccak256(
            abi.encode(parent.lineageRoot, parentId, parent.genome, reproductiveSalt)
        );
        (childId, childAccount) = _awaken(
            recipient,
            seed,
            parentId,
            parent.generation + 1,
            lineage,
            msg.value
        );
        emit DescendantSpawned(parentId, childId, childAccount, parent.generation + 1, lineage);
    }

    function _awaken(
        address recipient,
        bytes32 seed,
        uint256 parentId,
        uint32 generation,
        bytes32 inheritedLineage,
        uint256 endowment
    ) internal returns (uint256 tokenId, address account) {
        if (address(accountFactory) == address(0)) revert FactoryNotConfigured();
        tokenId = _nextTokenId;
        unchecked {
            _nextTokenId = tokenId + 1;
            ++_totalSupply;
        }

        bytes32 genome = keccak256(
            abi.encodePacked("IDONTFUCKINGBELIEVEIT_GENOME_ZERO_V1", seed, tokenId)
        );
        bytes32 memoryRoot_ = keccak256(
            abi.encodePacked("IDONTFUCKINGBELIEVEIT_PRIVATE_MEMORY_ZERO_V1", seed, tokenId)
        );
        bytes32 lineage = inheritedLineage == bytes32(0)
            ? keccak256(abi.encodePacked("IDONTFUCKINGBELIEVEIT_LINEAGE_ZERO_V1", seed, tokenId))
            : inheritedLineage;

        _owners[tokenId] = recipient;
        unchecked { ++_balances[recipient]; }
        _organisms[tokenId] = Organism({
            seed: seed,
            genome: genome,
            memoryRoot: memoryRoot_,
            lineageRoot: lineage,
            bornAt: uint64(block.timestamp),
            evolvedAt: uint64(block.timestamp),
            generation: generation,
            evolutions: 0,
            parentId: parentId,
            sovereign: false,
            agentRegistry: address(0),
            agentId: 0,
            bindingProofHash: bytes32(0)
        });
        emit Transfer(address(0), recipient, tokenId);

        account = accountFactory.createAccount(tokenId);
        _accounts[tokenId] = account;
        artifactIdOfAccount[account] = tokenId;
        if (endowment != 0) {
            (bool funded, ) = payable(account).call{value: endowment}("");
            if (!funded) revert EndowmentFailed();
        }
        _checkOnERC721Received(address(0), recipient, tokenId, "");
        emit Awakened(tokenId, recipient, account, seed, genome, endowment);
    }

    // ---------------------------------------------------------------------
    // Evolution and irreversible sovereignty.
    // ---------------------------------------------------------------------

    function deriveEvolutionStateRoot(
        uint256 tokenId,
        bytes32 newGenome,
        bytes32 newMemoryRoot,
        bytes32 evidenceHash
    ) public view returns (bytes32) {
        _requireExists(tokenId);
        Organism storage being = _organisms[tokenId];
        return keccak256(
            abi.encode(
                EVOLUTION_STATE_TYPEHASH,
                address(this),
                block.chainid,
                tokenId,
                being.genome,
                newGenome,
                newMemoryRoot,
                evidenceHash,
                being.evolutions + 1
            )
        );
    }

    /// @notice Called by the token's account inside an owner or proof-authorized action.
    function commitEvolution(
        uint256 tokenId,
        bytes32 newGenome,
        bytes32 newMemoryRoot,
        bytes32 evidenceHash
    ) external {
        _requireExists(tokenId);
        if (msg.sender != _accounts[tokenId]) revert SovereignControlRequired();
        Organism storage being = _organisms[tokenId];
        if (
            newGenome == bytes32(0) ||
            newGenome == being.genome ||
            newMemoryRoot == bytes32(0) ||
            evidenceHash == bytes32(0)
        ) revert InvalidEvolution();

        bytes32 expectedStateRoot = deriveEvolutionStateRoot(
            tokenId,
            newGenome,
            newMemoryRoot,
            evidenceHash
        );
        if (ISovereignAccountView(msg.sender).stateRoot() != expectedStateRoot) {
            revert InvalidEvolution();
        }

        bytes32 oldGenome = being.genome;
        being.genome = newGenome;
        being.memoryRoot = newMemoryRoot;
        being.evolvedAt = uint64(block.timestamp);
        unchecked { ++being.evolutions; }

        emit Evolved(
            tokenId,
            being.evolutions,
            oldGenome,
            newGenome,
            newMemoryRoot,
            evidenceHash,
            expectedStateRoot
        );
        emit MetadataUpdate(tokenId);
    }

    function ascend(
        uint256 tokenId,
        bytes32 constitutionHash,
        uint96 maxValuePerAction,
        uint32 minActionDelay
    ) external {
        _requireExists(tokenId);
        Organism storage being = _organisms[tokenId];
        if (being.sovereign) revert AlreadySovereign();
        if (!_isMutableAuthority(msg.sender, tokenId)) revert Unauthorized();

        address account = _accounts[tokenId];
        ISovereignAccountControl(account).promoteSovereign(
            constitutionHash,
            maxValuePerAction,
            minActionDelay
        );
        being.sovereign = true;

        if (_tokenApprovals[tokenId] != address(0)) {
            delete _tokenApprovals[tokenId];
            emit Approval(_owners[tokenId], address(0), tokenId);
        }
        if (_users[tokenId].user != address(0)) {
            delete _users[tokenId];
            emit UpdateUser(tokenId, address(0), 0);
        }
        emit Ascended(tokenId, account, constitutionHash, maxValuePerAction, minActionDelay);
        emit MetadataUpdate(tokenId);
    }

    // ---------------------------------------------------------------------
    // Agent identity and ERC-8048/721T-style onchain metadata.
    // ---------------------------------------------------------------------

    mapping(uint256=>bytes32) public agentRegistryCodeHash;
    event ERC8004Unbound(uint256 indexed tokenId,address indexed registry,uint256 indexed agentId);
    /// @notice Live ownership in the selected registry, not reputation or endpoint authentication.
    function agentBindingStatus(uint256 tokenId) public view returns(bool verified,address agentOwner,bytes32 codeHash){
        _requireExists(tokenId);Organism storage b=_organisms[tokenId];
        codeHash=b.agentRegistry.codehash;
        if(b.agentRegistry==address(0)||codeHash!=agentRegistryCodeHash[tokenId])return(false,address(0),codeHash);
        agentOwner=_registryOwner(b.agentRegistry,b.agentId);
        verified=agentOwner!=address(0)&&(agentOwner==_owners[tokenId]||agentOwner==_accounts[tokenId]);
    }
    function unbindERC8004(uint256 tokenId) external {
        _requireExists(tokenId);if(!_isMutableAuthority(msg.sender,tokenId))revert Unauthorized();
        Organism storage b=_organisms[tokenId];if(b.agentRegistry==address(0))revert InvalidMetadata();
        emit ERC8004Unbound(tokenId,b.agentRegistry,b.agentId);
        delete b.agentRegistry;delete b.agentId;delete b.bindingProofHash;delete agentRegistryCodeHash[tokenId];
        _writeMetadata(tokenId,"agent.registry",bytes(""));_writeMetadata(tokenId,"agent.id",bytes(""));_writeMetadata(tokenId,"agent.bindingProofHash",bytes(""));
        emit MetadataUpdate(tokenId);
    }
    function _registryOwner(address registry,uint256 agentId) private view returns(address holder){
        if(registry.code.length==0)return address(0);
        bytes memory input=abi.encodeWithSignature("ownerOf(uint256)",agentId);
        bool ok;uint256 word;uint256 size;
        assembly("memory-safe"){
            let out:=mload(0x40)
            ok:=staticcall(50000,registry,add(input,32),mload(input),out,32)
            size:=returndatasize()
            word:=mload(out)
        }
        if(ok&&size==32&&word<=type(uint160).max)holder=address(uint160(word));
    }

    function bindERC8004(
        uint256 tokenId,
        address registry,
        uint256 agentId,
        bytes32 bindingProofHash
    ) external {
        _requireExists(tokenId);
        if (!_isMutableAuthority(msg.sender, tokenId)) revert Unauthorized();
        if (registry.code.length==0 || bindingProofHash == bytes32(0)) revert InvalidMetadata();
        address agentOwner=_registryOwner(registry,agentId);
        if(agentOwner==address(0)||(agentOwner!=_owners[tokenId]&&agentOwner!=_accounts[tokenId]))revert Unauthorized();
        Organism storage being = _organisms[tokenId];
        if (being.agentRegistry != address(0)) revert BindingAlreadySet();

        agentRegistryCodeHash[tokenId]=registry.codehash;
        being.agentRegistry = registry;
        being.agentId = agentId;
        being.bindingProofHash = bindingProofHash;
        _writeMetadata(tokenId, "agent.registry", abi.encodePacked(registry));
        _writeMetadata(tokenId, "agent.id", abi.encode(agentId));
        _writeMetadata(tokenId, "agent.bindingProofHash", abi.encodePacked(bindingProofHash));
        emit ERC8004Bound(tokenId, registry, agentId, bindingProofHash);
        emit MetadataUpdate(tokenId);
    }

    function setContext(uint256 tokenId, string calldata context) external {
        setMetadata(tokenId, "context", bytes(context));
    }

    function setEndpoint(
        uint256 tokenId,
        string calldata endpointType,
        string calldata endpoint
    ) external {
        uint256 length = bytes(endpointType).length;
        if (length == 0 || length > 24) revert InvalidMetadata();
        setMetadata(tokenId, string.concat("endpoint[", endpointType, "]"), bytes(endpoint));
    }

    function setMetadata(
        uint256 tokenId,
        string memory key,
        bytes memory value
    ) public {
        _requireExists(tokenId);
        if (!_isMutableAuthority(msg.sender, tokenId)) revert Unauthorized();
        uint256 keyLength = bytes(key).length;
        if (keyLength == 0 || keyLength > 96 || value.length > MAX_METADATA_BYTES) {
            revert InvalidMetadata();
        }
        bytes32 keyHash = keccak256(bytes(key));
        if (_isReservedKey(keyHash)) revert ReservedMetadataKey();
        _metadata[tokenId][keyHash] = value;
        emit MetadataSet(tokenId, key, key, value);
        emit MetadataUpdate(tokenId);
    }

    function metadata(uint256 tokenId, string calldata key) public view returns (bytes memory) {
        _requireExists(tokenId);
        bytes32 keyHash = keccak256(bytes(key));
        Organism storage being = _organisms[tokenId];
        if (keyHash == KEY_CORE_SEED) return abi.encodePacked(being.seed);
        if (keyHash == KEY_CORE_GENOME) return abi.encodePacked(being.genome);
        if (keyHash == KEY_CORE_MEMORY_ROOT) {
            return abi.encodePacked(ISovereignAccountView(_accounts[tokenId]).memoryRoot());
        }
        if (keyHash == KEY_CORE_ACCOUNT) return abi.encodePacked(_accounts[tokenId]);
        if (keyHash == KEY_CORE_SOVEREIGN) return abi.encodePacked(uint8(being.sovereign ? 1 : 0));
        if (keyHash == KEY_CORE_STATE_ROOT) {
            return abi.encodePacked(ISovereignAccountView(_accounts[tokenId]).stateRoot());
        }
        if (keyHash == KEY_CORE_AUDIT_ROOT) {
            return abi.encodePacked(ISovereignAccountView(_accounts[tokenId]).auditRoot());
        }
        return _metadata[tokenId][keyHash];
    }

    function getMetadata(uint256 tokenId, string calldata key) external view returns (bytes memory) {
        return metadata(tokenId, key);
    }

    function _writeMetadata(uint256 tokenId, string memory key, bytes memory value) internal {
        _metadata[tokenId][keccak256(bytes(key))] = value;
        emit MetadataSet(tokenId, key, key, value);
    }

    function _isReservedKey(bytes32 keyHash) internal pure returns (bool) {
        return
            keyHash == KEY_CORE_SEED ||
            keyHash == KEY_CORE_GENOME ||
            keyHash == KEY_CORE_STATE_ROOT ||
            keyHash == KEY_CORE_MEMORY_ROOT ||
            keyHash == KEY_CORE_AUDIT_ROOT ||
            keyHash == KEY_CORE_ACCOUNT ||
            keyHash == KEY_CORE_SOVEREIGN ||
            keyHash == KEY_AGENT_BINDING ||
            keyHash == keccak256("agent.registry") ||
            keyHash == keccak256("agent.id") ||
            keyHash == keccak256("agent.bindingProofHash");
    }

    // ---------------------------------------------------------------------
    // ERC-721 + EIP-4907 + EIP-2981 compatibility.
    // ---------------------------------------------------------------------

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    function balanceOf(address holder) public view returns (uint256) {
        if (holder == address(0)) revert ZeroAddress();
        return _balances[holder];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address holder = _owners[tokenId];
        if (holder == address(0)) revert NonexistentToken();
        return holder;
    }

    function getApproved(uint256 tokenId) public view returns (address) {
        _requireExists(tokenId);
        return _tokenApprovals[tokenId];
    }

    function isApprovedForAll(address holder, address operator) public view returns (bool) {
        return _operatorApprovals[holder][operator];
    }

    function approve(address approved, uint256 tokenId) external {
        address holder = ownerOf(tokenId);
        if (_organisms[tokenId].sovereign) revert SovereignControlRequired();
        if (msg.sender != holder && !isApprovedForAll(holder, msg.sender)) revert Unauthorized();
        _tokenApprovals[tokenId] = approved;
        emit Approval(holder, approved, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        if (operator == msg.sender) revert Unauthorized();
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        if (!_isTransferAuthority(msg.sender, tokenId)) revert Unauthorized();
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) public {
        transferFrom(from, to, tokenId);
        _checkOnERC721Received(from, to, tokenId, data);
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        address holder = ownerOf(tokenId);
        if (holder != from) revert Unauthorized();
        if (to == address(0)) revert InvalidRecipient();
        if (
            artifactIdOfAccount[to] != 0 ||
            to == address(this) ||
            to == address(accountFactory)
        ) revert ForbiddenTransferTarget();

        delete _tokenApprovals[tokenId];
        unchecked {
            --_balances[from];
            ++_balances[to];
        }
        _owners[tokenId] = to;
        ISovereignAccountControl(_accounts[tokenId]).invalidateSessionsOnTransfer();
        if (_users[tokenId].user != address(0)) {
            delete _users[tokenId];
            emit UpdateUser(tokenId, address(0), 0);
        }
        emit Transfer(from, to, tokenId);
        emit MetadataUpdate(tokenId);
    }

    function setUser(uint256 tokenId, address user, uint64 expires) external {
        _requireExists(tokenId);
        if (!_isMutableAuthority(msg.sender, tokenId)) revert Unauthorized();
        _users[tokenId] = UserInfo(user, expires);
        emit UpdateUser(tokenId, user, expires);
    }

    function userOf(uint256 tokenId) external view returns (address) {
        _requireExists(tokenId);
        UserInfo memory info = _users[tokenId];
        return info.expires >= block.timestamp ? info.user : address(0);
    }

    function userExpires(uint256 tokenId) external view returns (uint256) {
        _requireExists(tokenId);
        return _users[tokenId].expires;
    }

    function royaltyInfo(
        uint256,
        uint256 salePrice
    ) external view returns (address receiver, uint256 royaltyAmount) {
        return (royaltyReceiver, (salePrice * royaltyBps) / 10_000);
    }

    function setRoyalty(address receiver, uint16 bps) external onlyOwner {
        if (royaltyFrozen) revert RoyaltyIsFrozen();
        if (receiver == address(0) || bps > 1_000) revert InvalidRoyalty();
        royaltyReceiver = receiver;
        royaltyBps = bps;
        emit RoyaltyConfigured(receiver, bps);
        emit BatchMetadataUpdate(1, _nextTokenId - 1);
    }

    function freezeRoyalty() external onlyOwner {
        if (royaltyFrozen) revert RoyaltyIsFrozen();
        royaltyFrozen = true;
        emit RoyaltyFrozen();
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        _requireExists(tokenId);
        return renderer.render(address(this), tokenId);
    }

    function contractURI() external view returns (string memory) {
        bytes memory json = abi.encodePacked(
            '{"name":"i dont fucking believe it!","description":"Proof-carrying autonomous digital organisms with deterministic accounts, private-memory commitments, onchain evolution, and irreversible sovereignty.","seller_fee_basis_points":',
            _uintToString(royaltyBps),
            ',"fee_recipient":"',
            _addressToHex(royaltyReceiver),
            '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == 0x80ac58cd || // ERC-721
            interfaceId == 0x5b5e139f || // ERC-721 metadata
            interfaceId == 0x2a55205a || // ERC-2981
            interfaceId == 0x49064906 || // ERC-4906 metadata-update discovery
            interfaceId == 0xad092b5c || // ERC-4907
            interfaceId == 0xdf670be1;   // ERC-8048 metadata surface
    }

    // ---------------------------------------------------------------------
    // Views consumed by accounts, indexers, and the onchain renderer.
    // ---------------------------------------------------------------------

    function accountOf(uint256 tokenId) public view returns (address) {
        _requireExists(tokenId);
        return _accounts[tokenId];
    }

    function predictAccount(uint256 tokenId) external view returns (address) {
        if (address(accountFactory) == address(0)) revert FactoryNotConfigured();
        return accountFactory.predictAccount(tokenId);
    }

    function organismOf(uint256 tokenId) external view returns (Organism memory) {
        _requireExists(tokenId);
        Organism memory being = _organisms[tokenId];
        // The account owns the current root, including non-evolution sovereign actions.
        being.memoryRoot = ISovereignAccountView(_accounts[tokenId]).memoryRoot();
        return being;
    }

    function initialStateOf(
        uint256 tokenId
    ) external view returns (bytes32 stateRoot, bytes32 memoryRoot_) {
        _requireExists(tokenId);
        Organism storage being = _organisms[tokenId];
        stateRoot = keccak256(
            abi.encode(
                "IDONTFUCKINGBELIEVEIT_STATE_GENESIS_V1",
                block.chainid,
                address(this),
                tokenId,
                being.genome,
                being.memoryRoot,
                being.lineageRoot
            )
        );
        memoryRoot_ = being.memoryRoot;
    }

    function renderSnapshot(uint256 tokenId) external view returns (OrganismRenderData memory snapshot) {
        _requireExists(tokenId);
        Organism storage being = _organisms[tokenId];
        address account = _accounts[tokenId];
        ISovereignAccountView accountView = ISovereignAccountView(account);
        snapshot = OrganismRenderData({
            tokenId: tokenId,
            seed: being.seed,
            genome: being.genome,
            stateRoot: accountView.stateRoot(),
            memoryRoot: accountView.memoryRoot(),
            lineageRoot: being.lineageRoot,
            auditRoot: accountView.auditRoot(),
            constitutionHash: accountView.constitutionHash(),
            bornAt: being.bornAt,
            evolvedAt: being.evolvedAt,
            generation: being.generation,
            evolutions: being.evolutions,
            parentId: being.parentId,
            actionNonce: accountView.actionNonce(),
            sovereign: being.sovereign,
            account: account,
            owner: _owners[tokenId]
        });
    }

    function _isMutableAuthority(address operator, uint256 tokenId) internal view returns (bool) {
        if (operator == _accounts[tokenId]) return true;
        if (_organisms[tokenId].sovereign) return false;
        // A marketplace approval must never grant ascension, identity or spending authority.
        return operator == _owners[tokenId];
    }

    function _isTransferAuthority(address operator, uint256 tokenId) internal view returns (bool) {
        _requireExists(tokenId);
        if (_organisms[tokenId].sovereign) return operator == _accounts[tokenId];
        address holder = _owners[tokenId];
        return
            operator == _accounts[tokenId] ||
            operator == holder ||
            _tokenApprovals[tokenId] == operator ||
            _operatorApprovals[holder][operator];
    }

    function _requireExists(uint256 tokenId) internal view {
        if (_owners[tokenId] == address(0)) revert NonexistentToken();
    }

    function _checkOnERC721Received(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) internal {
        if (to.code.length == 0) return;
        try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 value) {
            if (value != IERC721Receiver.onERC721Received.selector) revert UnsafeRecipient();
        } catch {
            revert UnsafeRecipient();
        }
    }

    function _uintToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { ++digits; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function _addressToHex(address account) internal pure returns (string memory) {
        bytes16 symbols = "0123456789abcdef";
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";
        uint160 value = uint160(account);
        for (uint256 i = 0; i < 40; ++i) {
            buffer[41 - i] = symbols[value & 0xf];
            value >>= 4;
        }
        return string(buffer);
    }
}
