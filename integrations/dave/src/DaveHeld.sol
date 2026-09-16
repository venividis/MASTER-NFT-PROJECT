// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721A} from "erc721a/ERC721A.sol";
import {MerkleProofLib} from "solady/utils/MerkleProofLib.sol";
import {Tiers} from "./lib/Tiers.sol";
import {IERC20, IRenderer, IRagequitHook} from "./lib/Interfaces.sol";

interface IRegistry6551 {
    function createAccount(address, bytes32, uint256, address, uint256) external returns (address);
    function account(address, bytes32, uint256, address, uint256) external view returns (address);
}
interface IVaultHubSide {
    function hubSeal(uint8 t) external;
    function acknowledge(address t) external;
}
interface IPoolHubSide { function setWeight(uint256 id, uint32 mult_) external; }

/// @title DaveHeld — the hub. 100,000 Certificates of Conviction.
/// @notice ERC-721A + ERC-4906 + ERC-2981. Genesis is seal-to-mint: free in
///         money, priced in conviction — mint, vault, deposit, seal, one tx.
///         Serials are sequential; RANK (the engraved conviction standing)
///         is posted once by Merkle root after the window closes.
contract DaveHeld is ERC721A {
    // ─── wiring (set once) ───────────────────────────────────────────
    address public immutable registry;      // canonical 6551 on mainnet
    address public immutable accountImpl;   // DaveVault
    address public immutable timelock;
    address public immutable deployer;      // may wire ONCE, pre-timelock
    bool    public wired;
    bytes32 public constant SALT = keccak256("DAVE_HELD_V1");

    address public pool;                    // ConvictionPool
    address public treasury;
    address public renderer;                // timelock-swappable
    address public chambers;                // Codicil XII singleton; docked ONCE
    address public codex;                   // Codicil XIII singleton; docked ONCE

    // ─── sockets ─────────────────────────────────────────────────────
    mapping(address => bool) public approvedModule;   // Codicil VI dock
    mapping(address => bool) public approvedTarget;   // moduleCall lane
    mapping(uint256 => uint256) public flagsOf;       // Codicil V dock (reserved)
    address[] public hooks;                           // afterRagequit fan-out

    // ─── supply & genesis ────────────────────────────────────────────
    uint256 public constant MAX_SUPPLY   = 100_000;
    uint256 public constant GENESIS_CAP  = 10_000;
    uint256 public constant OPEN_PRICE   = 0.0015 ether;
    uint64  public windowStart;
    uint64  public windowEnd;               // 72h book
    uint256 public genesisMinted;

    struct Tranche { bytes32 root; uint16 cap; uint16 minted; uint8 minTier; }
    Tranche[4] public tranches;             // 0 open · 1 GREG · 2 natives · 3 partners
    mapping(uint256 => mapping(uint8 => bool)) private _claimedLeaf; // leafIndex per tranche

    // ─── rank (engraved once) ────────────────────────────────────────
    bytes32 public rankRoot;
    mapping(uint256 => uint32) public rankOf;

    error NotTimelock(); error WindowClosed(); error WindowOpenAlready();
    error TrancheFull(); error BadProof(); error TierLow(); error ZeroBag();
    error SoldOut(); error BadPrice(); error RankSet(); error RootSet();
    error NotVault(); error AlreadyClaimed();

    event GenesisClaim(uint256 indexed id, address indexed to, uint8 tranche, uint8 tier, address token, uint256 amount);
    event RankEngraved(uint256 indexed id, uint32 rank);
    event MetadataUpdate(uint256 _tokenId);            // ERC-4906
    event BatchMetadataUpdate(uint256 _from, uint256 _to);

    constructor(
        address registry_, address accountImpl_, address timelock_,
        address treasury_
    ) ERC721A("DAVE HELD", "DAVE") {
        registry = registry_; accountImpl = accountImpl_;
        timelock = timelock_; treasury = treasury_;
        deployer = msg.sender;
    }
    modifier onlyTimelock() { if (msg.sender != timelock) revert NotTimelock(); _; }

    function _startTokenId() internal pure override returns (uint256) { return 1; }

    // ─── admin (all behind the 7-day lock) ───────────────────────────
    /// @dev one-shot bootstrap by deployer (deploy script), or timelock.
    ///      All CHANGES thereafter go through the 7-day lock.
    function wire(address pool_, address renderer_) external {
        require(!wired && (msg.sender == deployer || msg.sender == timelock), "wired");
        wired = true;
        pool = pool_; renderer = renderer_;
    }
    /// @notice dock the Chambers (Codicil XII). Once, ever — the sovereign
    ///         lane's enforcer is as immutable as the covenant it guards.
    function dockChambers(address c) external {
        require(chambers == address(0) && (msg.sender == deployer || msg.sender == timelock), "chambered");
        chambers = c;
    }

    /// @notice dock the Codex (Codicil XIII). Once, ever.
    function dockCodex(address c) external {
        require(codex == address(0) && (msg.sender == deployer || msg.sender == timelock), "codexed");
        codex = c;
    }

    function setRenderer(address r) external onlyTimelock {
        renderer = r; emit BatchMetadataUpdate(1, _nextTokenId() - 1);
    }
    function setModule(address m, bool ok) external onlyTimelock { approvedModule[m] = ok; }
    function setTarget(address t, bool ok) external onlyTimelock { approvedTarget[t] = ok; }
    function addHook(address h) external onlyTimelock { hooks.push(h); }
    function setTreasury(address t) external onlyTimelock { treasury = t; }

    function openWindow(
        uint64 start, uint64 end,
        bytes32 gregRoot, bytes32 nativeRoot, bytes32 partnerRoot
    ) external onlyTimelock {
        if (windowStart != 0) revert WindowOpenAlready();
        windowStart = start; windowEnd = end;
        tranches[0] = Tranche(bytes32(0), 6000, 0, 1);   // open · IRON+
        tranches[1] = Tranche(gregRoot,   2000, 0, 0);   // $GREG · PAPER ok
        tranches[2] = Tranche(nativeRoot, 1200, 0, 0);   // natives
        tranches[3] = Tranche(partnerRoot, 500, 0, 1);   // partners · IRON+
    }

    /// @dev treasury tranche: 300, OBSIDIAN, sealed in public view.
    function mintTreasury(address token_, uint256 amtEach) external onlyTimelock {
        for (uint256 i; i < 300; ++i) {
            uint256 id = _nextTokenId();
            _mint(treasury, 1);
            address v = _deployVault(id);
            if (token_ != address(0) && amtEach > 0) {
                require(IERC20(token_).transferFrom(msg.sender, v, amtEach), "pull");
                IVaultHubSide(v).acknowledge(token_);
            }
            IVaultHubSide(v).hubSeal(3);                  // OBSIDIAN
            genesisMinted++;
        }
    }

    // ─── genesis: seal-to-mint ───────────────────────────────────────
    function claimGenesis(
        uint8 trancheId, uint256 leafIndex, bytes32[] calldata proof,
        uint8 tier, address token_, uint256 amount
    ) external returns (uint256 id) {
        if (block.timestamp < windowStart || block.timestamp > windowEnd || windowStart == 0)
            revert WindowClosed();
        if (genesisMinted >= GENESIS_CAP) revert SoldOut();
        Tranche storage tr = tranches[trancheId];
        if (tr.minted >= tr.cap) revert TrancheFull();
        if (tier < tr.minTier) revert TierLow();
        if (amount == 0) revert ZeroBag();
        if (trancheId != 0) {
            if (_claimedLeaf[leafIndex][trancheId]) revert AlreadyClaimed();
            bytes32 leaf = keccak256(abi.encodePacked(leafIndex, msg.sender));
            if (!MerkleProofLib.verifyCalldata(proof, tr.root, leaf)) revert BadProof();
            _claimedLeaf[leafIndex][trancheId] = true;
        }
        tr.minted++; genesisMinted++;
        id = _nextTokenId();
        _mint(msg.sender, 1);
        address v = _deployVault(id);
        require(IERC20(token_).transferFrom(msg.sender, v, amount), "pull");
        IVaultHubSide(v).acknowledge(token_);
        IVaultHubSide(v).hubSeal(tier);                   // atomic: born holding
        emit GenesisClaim(id, msg.sender, trancheId, tier, token_, amount);
    }

    // ─── open press: 90,000 @ 0.0015 ───────────────────────────────—
    function mint(uint256 qty) external payable {
        require(windowEnd != 0 && block.timestamp > windowEnd, "genesis first");
        if (_nextTokenId() + qty - 1 > MAX_SUPPLY) revert SoldOut();
        if (msg.value != OPEN_PRICE * qty) revert BadPrice();
        uint256 first = _nextTokenId();
        _mint(msg.sender, qty);
        for (uint256 i; i < qty; ++i) _deployVault(first + i);
        (bool ok,) = treasury.call{value: msg.value}(""); require(ok, "tre");
    }

    // ─── rank: posted once, engraved once ────────────────────────────
    function postRankRoot(bytes32 root) external onlyTimelock {
        require(block.timestamp > windowEnd && windowEnd != 0, "book open");
        if (rankRoot != bytes32(0)) revert RootSet();
        rankRoot = root;
    }
    function engraveRank(uint256 id, uint32 rank, bytes32[] calldata proof) external {
        if (rankOf[id] != 0) revert RankSet();
        bytes32 leaf = keccak256(abi.encodePacked(id, rank));
        if (!MerkleProofLib.verifyCalldata(proof, rankRoot, leaf)) revert BadProof();
        rankOf[id] = rank;
        emit RankEngraved(id, rank);
        emit MetadataUpdate(id);
    }

    // ─── vault plumbing ──────────────────────────────────────────────
    function vaultOf(uint256 id) public view returns (address) {
        return IRegistry6551(registry).account(accountImpl, SALT, block.chainid, address(this), id);
    }
    function _deployVault(uint256 id) internal returns (address) {
        return IRegistry6551(registry).createAccount(accountImpl, SALT, block.chainid, address(this), id);
    }
    modifier onlyVault(uint256 id) { if (msg.sender != vaultOf(id)) revert NotVault(); _; }

    function onSealChanged(uint256 id, uint32 mult_) external onlyVault(id) {
        if (pool != address(0)) IPoolHubSide(pool).setWeight(id, mult_);
        emit MetadataUpdate(id);
    }
    function afterRagequit(uint256 id) external onlyVault(id) {
        uint256 n = hooks.length;
        for (uint256 i; i < n; ++i) {
            try IRagequitHook(hooks[i]).onRagequit(id) {} catch {}
        }
        emit MetadataUpdate(id);
    }
    function pokeMetadata(uint256 id) external onlyVault(id) { emit MetadataUpdate(id); }

    // ─── faces & royalties ───────────────────────────────────────────
    function tokenURI(uint256 id) public view override returns (string memory) {
        require(_exists(id), "no dave");
        return IRenderer(renderer).tokenURI(id);
    }
    function royaltyInfo(uint256, uint256 salePrice) external view returns (address, uint256) {
        return (treasury, salePrice * 500 / 10_000);      // 5%
    }
    function supportsInterface(bytes4 iid) public view override returns (bool) {
        return iid == 0x2a55205a /*2981*/ || iid == 0x49064906 /*4906*/ || super.supportsInterface(iid);
    }
}
