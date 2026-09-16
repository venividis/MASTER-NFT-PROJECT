// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Tiers} from "./lib/Tiers.sol";
import {AccountFooter} from "./lib/AccountFooter.sol";
import {IERC20, IHub} from "./lib/Interfaces.sol";

/// @title DaveVault — the covenant. ERC-6551 account + ratchet seal.
/// @notice The bearer commands everything; while sealed, nothing leaves —
///         not for the bearer, not for a module, not for anyone. The only
///         early exit is ragequit: 4.20% tax (69% ConvictionPool / 31%
///         treasury) and a permanent stamp. Seals only ever EXTEND.
/// @dev    Deployed behind the ERC-6551 registry proxy; (chainId, hub, id)
///         are read from the proxy footer. One implementation, 100k proxies.
contract DaveVault {
    using Tiers for uint8;

    // ─── covenant state ───────────────────────────────────────────────
    uint64  public unlockAt;        // 0 = unsealed
    uint64  public sealSpan;        // span of the CURRENT seal (tier witness)
    uint64  private lastAccrue;     // conviction checkpoint
    uint128 public convictionAcc;   // accrued mult-seconds (finished time)
    uint32  public paperHands;      // ragequit stamps, forever
    uint32  public temper;          // seals served to natural expiry
    bool    private expiryCounted;  // temper guard for the current seal
    uint256 public state;           // ERC-6551 nonce

    // ─── bags ─────────────────────────────────────────────────────────
    address[] private _bags;
    mapping(address => bool) private _seen;
    uint256 public constant MAX_BAGS = 32;

    // ─── mandate socket (Codicil VI docks here; cold in v1) ──────────
    address public mandate;

    uint16 public constant RAGE_BPS = 420;   // 4.20%
    uint16 public constant POOL_SHARE = 69;  // of the tax

    error NotBearer(); error NotHub(); error BagsSealed(); error NotSealed();
    error RatchetOnly(); error TooManyBags(); error BadOp(); error NotModule();
    error AlreadySealed();

    event Sealed(uint256 indexed id, uint8 tier, uint64 unlockAt);
    event Ragequit(uint256 indexed id, uint32 stamp);
    event Deposited(uint256 indexed id, address token, uint256 amount);
    event Swept(uint256 indexed id, address to);
    event TemperEarned(uint256 indexed id, uint32 temper);
    event MandateSet(uint256 indexed id, address module);

    // ─── identity ─────────────────────────────────────────────────────
    function token() public view returns (uint256 chainId, address hub, uint256 id) {
        return AccountFooter.token();
    }
    function _hub() internal view returns (IHub h, uint256 id) {
        (uint256 cid, address hub_, uint256 id_) = token();
        require(cid == block.chainid, "chain");
        return (IHub(hub_), id_);
    }
    function bearer() public view returns (address) {
        (IHub h, uint256 id) = _hub();
        return h.ownerOf(id);
    }
    modifier onlyBearer() { if (msg.sender != bearer()) revert NotBearer(); _; }

    // ─── deposits: ratchet in, never out while sealed ─────────────────
    function deposit(address t, uint256 amount) external {
        require(IERC20(t).transferFrom(msg.sender, address(this), amount), "pull");
        _ack(t);
        (, uint256 id) = _hub();
        emit Deposited(id, t, amount);
        _poke();
    }
    /// @notice index a token that arrived by direct transfer.
    function acknowledge(address t) external { _ack(t); _poke(); }
    function _ack(address t) internal {
        if (_seen[t]) return;
        if (IERC20(t).balanceOf(address(this)) == 0) return;
        if (_bags.length >= MAX_BAGS) revert TooManyBags();
        _seen[t] = true; _bags.push(t);
    }
    receive() external payable {}

    // ─── the seal: ratchet-only ───────────────────────────────────────
    function seal(uint8 t) external {
        (IHub h, uint256 id) = _hub();
        bool byBearer = msg.sender == h.ownerOf(id);
        bool byModule = mandate != address(0) && msg.sender == mandate && h.approvedModule(mandate);
        if (!byBearer && !byModule) revert NotBearer();
        _seal(t, h, id);
    }
    /// @dev genesis path: hub seals atomically at mint. Once, from zero.
    function hubSeal(uint8 t) external {
        (IHub h, uint256 id) = _hub();
        if (msg.sender != address(h)) revert NotHub();
        if (unlockAt != 0) revert AlreadySealed();
        _seal(t, h, id);
    }
    function _seal(uint8 t, IHub h, uint256 id) internal {
        _accrue(h, id);
        uint64 nu = uint64(block.timestamp) + t.span();
        if (nu <= unlockAt) revert RatchetOnly();
        unlockAt = nu;
        sealSpan = t.span();
        expiryCounted = false;
        lastAccrue = uint64(block.timestamp);
        h.onSealChanged(id, t.mult());
        emit Sealed(id, t, nu);
    }

    // ─── conviction: mult-seconds, lazily accrued ─────────────────────
    function _accrue(IHub h, uint256 id) internal {
        if (sealSpan != 0) {
            uint64 upto = uint64(block.timestamp) < unlockAt ? uint64(block.timestamp) : unlockAt;
            if (upto > lastAccrue) {
                convictionAcc += uint128(uint256(upto - lastAccrue) * Tiers.mult(Tiers.tierOfSpan(sealSpan)));
                lastAccrue = upto;
            }
            if (uint64(block.timestamp) >= unlockAt && !expiryCounted) {
                expiryCounted = true;
                unchecked { temper += 1; }
                h.onSealChanged(id, 0);        // weight retires with the seal
                emit TemperEarned(id, temper);
            }
        }
    }
    /// @notice anyone may settle an expired seal (retires pool weight, earns temper).
    function settle() external { (IHub h, uint256 id) = _hub(); _accrue(h, id); _poke(); }

    function convictionLive() external view returns (uint256 c) {
        c = convictionAcc;
        if (sealSpan != 0) {
            uint64 upto = uint64(block.timestamp) < unlockAt ? uint64(block.timestamp) : unlockAt;
            if (upto > lastAccrue) c += uint256(upto - lastAccrue) * Tiers.mult(Tiers.tierOfSpan(sealSpan));
        }
    }

    // ─── the exit that costs: 4.20%, 69/31, the stamp ─────────────────
    function ragequit() external onlyBearer {
        if (uint64(block.timestamp) >= unlockAt || unlockAt == 0) revert NotSealed();
        (IHub h, uint256 id) = _hub();
        _accrue(h, id);
        address pool_ = h.pool();
        address tre = h.treasury();
        uint256 n = _bags.length;
        for (uint256 i; i < n; ++i) {
            address t = _bags[i];
            uint256 bal = IERC20(t).balanceOf(address(this));
            if (bal == 0) continue;
            uint256 tax = bal * RAGE_BPS / 10_000;
            uint256 toPool = tax * POOL_SHARE / 100;
            if (toPool > 0) require(IERC20(t).transfer(pool_, toPool), "pool");
            if (tax - toPool > 0) require(IERC20(t).transfer(tre, tax - toPool), "tre");
        }
        uint256 ebal = address(this).balance;
        if (ebal > 0) {
            uint256 tax = ebal * RAGE_BPS / 10_000;
            uint256 toPool = tax * POOL_SHARE / 100;
            (bool a,) = pool_.call{value: toPool}(""); require(a, "pool.e");
            (bool b,) = tre.call{value: tax - toPool}(""); require(b, "tre.e");
        }
        unchecked { paperHands += 1; }
        unlockAt = 0; sealSpan = 0; expiryCounted = true;
        h.onSealChanged(id, 0);
        h.afterRagequit(id);
        emit Ragequit(id, paperHands);
    }

    // ─── acting while unsealed: the bearer, and only the bearer ───────
    function execute(address to, uint256 value, bytes calldata data, uint8 op)
        external payable onlyBearer returns (bytes memory out)
    {
        if (op != 0) revert BadOp();
        if (unlockAt > uint64(block.timestamp)) revert BagsSealed();
        unchecked { ++state; }
        bool ok; (ok, out) = to.call{value: value}(data);
        require(ok, "call");
    }

    /// @notice module lane (Codicil VI socket): a hub-approved module holding
    ///         this vault's mandate may call ONLY hub-approved targets
    ///         (Patronage today; Constitution later). Never token contracts,
    ///         never execute, never ragequit — those are bearer flesh forever.
    function moduleCall(address target, bytes calldata data)
        external returns (bytes memory out)
    {
        (IHub h,) = _hub();
        if (msg.sender != mandate || mandate == address(0)) revert NotModule();
        if (!h.approvedModule(msg.sender)) revert NotModule();
        if (!h.approvedTarget(target)) revert NotModule();
        unchecked { ++state; }
        bool ok; (ok, out) = target.call(data);
        require(ok, "mcall");
    }
    /// @notice chamber lane (Codicil XII): the hub's ONE immutable Chambers
    ///         singleton may act for this vault — sealed or not. The vault
    ///         does not judge the call; the Chambers does. Sealed-era
    ///         boundary (bags only ever grow, spends only into covenant
    ///         venues, declared and measured) is enforced there, in one
    ///         audited place, for all 100k vaults at once.
    function chamberCall(address target, uint256 value, bytes calldata data)
        external returns (bytes memory out)
    {
        (IHub h,) = _hub();
        address c = h.chambers();
        if (msg.sender != c || c == address(0)) revert NotModule();
        unchecked { ++state; }
        bool ok; (ok, out) = target.call{value: value}(data);
        require(ok, "chamber");
    }

    /// @notice forge lane (Codicil XIII): the hub's ONE immutable Codex may
    ///         CREATE2-deploy inscribed bytecode FROM this vault — so a
    ///         forged program's address derives from the token's own
    ///         address. No value may ride along: the forge births code,
    ///         never capital. Funding a program is a chamber act, behind
    ///         the boundary, like any other spend.
    function codexCreate(bytes calldata initCode, bytes32 salt)
        external returns (address program)
    {
        (IHub h,) = _hub();
        address c = h.codex();
        if (msg.sender != c || c == address(0)) revert NotModule();
        unchecked { ++state; }
        bytes memory ic = initCode;
        assembly { program := create2(0, add(ic, 0x20), mload(ic), salt) }
        require(program != address(0), "forge");
    }

    function setMandate(address m) external onlyBearer {
        mandate = m;
        (, uint256 id) = _hub();
        emit MandateSet(id, m);
    }

    // ─── views ────────────────────────────────────────────────────────
    function tier() external view returns (uint8) { return Tiers.tierOfSpan(sealSpan); }
    function sealed_() public view returns (bool) { return unlockAt > uint64(block.timestamp); }
    function bagAmount(address t) external view returns (uint256) { return IERC20(t).balanceOf(address(this)); }
    function bagsLength() external view returns (uint256) { return _bags.length; }
    function bagAt(uint256 i) external view returns (address) { return _bags[i]; }

    function _poke() internal { (IHub h, uint256 id) = _hub(); h.pokeMetadata(id); }

    // ─── ERC-6551 / receiver plumbing ─────────────────────────────────
    function isValidSigner(address signer, bytes calldata) external view returns (bytes4) {
        return signer == bearer() ? bytes4(0x523e3260) : bytes4(0);
    }
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }
    function supportsInterface(bytes4 iid) external pure returns (bool) {
        return iid == 0x01ffc9a7 /*165*/ || iid == 0x6faff5f1 /*6551 account*/;
    }
}
