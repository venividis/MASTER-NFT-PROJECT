// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {SSTORE2} from "solady/utils/SSTORE2.sol";
import {IERC20} from "./lib/Interfaces.sol";

interface IHubK {
    function ownerOf(uint256 id) external view returns (address);
    function vaultOf(uint256 id) external view returns (address);
}
interface IVaultK {
    function codexCreate(bytes calldata initCode, bytes32 salt) external returns (address);
    function unlockAt() external view returns (uint64);
    function seal(uint8 t) external;
}
interface IChambersK {
    function act(
        uint256 daveId, address target, uint256 value,
        bytes calldata data, address spendToken, uint256 maxSpend
    ) external returns (bytes memory);
}
interface ICharterK {
    function pools(uint256 poolId) external view returns (
        uint64 daveId, bool closed, uint16 feeBps, uint64 bondUntil,
        address base, address quote, address allowlist, uint128 rBase, uint128 rQuote
    );
    function twap(uint256 poolId, uint32 window) external view returns (uint256);
}

/// @title Codex — Codicil XIII. Code as inscription. The book that runs.
///
/// @notice A Dave can now HOLD code the way it holds bags — and run it.
///
///         LEAVES. Anyone bearing a Dave may inscribe a LEAF: raw bytes
///         written into contract bytecode (SSTORE2), immutable the block
///         it lands, author-Dave engraved forever. Inscription is
///         authorship, not enclosure: every leaf is public material any
///         Dave may bind — a shared library written one page at a time
///         by a hundred thousand authors.
///
///         EDITIONS. A bearer BINDS leaves — theirs or anyone's — into
///         an ordered EDITION. Editions are immutable; a new ordering is
///         a new edition, and every prior edition stays readable forever.
///         Two kinds:
///
///         FORGE editions are EVM initcode. forge() concatenates the
///         leaves and CREATE2-deploys them FROM THE VAULT ITSELF — the
///         program's address derives from the token's own address; its
///         provenance is the token. The forge births code, never
///         capital (no value rides the deploy). A forged program holds
///         no power until the bearer docks it through the Chambers'
///         7-day cure, like any organ.
///
///         RECITE editions are VERSE: a covenant-native strategy
///         language. recite() walks the ops and acts them out — and the
///         Codex takes no private lane onto the estate: every venue op
///         routes through the Chambers as a docked module, measured by
///         the sealed boundary like any act. The grammar itself is
///         covenant-shaped: it can price, gate, wait, swap, seal — it
///         has no word for an unmeasured exit.
///
///         THE VERSE (fixed-width, big-endian):
///           0x00 HALT
///           0x01 SWAP_CHARTER  u64 poolId, u8 baseIn, u128 amtIn, u128 minOut
///           0x02 TWAP_GT       u64 poolId, u32 window, u128 px   (else revert)
///           0x03 TWAP_LT       u64 poolId, u32 window, u128 px   (else revert)
///           0x04 WAIT_UNTIL    u64 ts                            (else revert)
///           0x05 REQUIRE_SEALED
///           0x06 REQUIRE_UNSEALED
///           0x07 SEND          address token, address to, u128 amt   (token 0 = ETH)
///           0x08 SEAL          u8 tier      (needs the Codex mandated on the vault;
///                                            recites BEARER-ONLY even in open editions —
///                                            a stranger must never ratchet your covenant)
///           0x09 ONCE          (per-edition latch: the edition recites one time, ever)
///
///         SEND while sealed dies on the Chambers wall (as it must);
///         unsealed it is the testament op — a Dave that executes its
///         own estate. SEAL recites only where the bearer has set the
///         Codex as the vault's mandate: a strategy that extends its own
///         covenant. WAIT_UNTIL makes dead-man verses; TWAP gates make
///         limit strategies; together with SWAP_CHARTER a Dave runs a
///         readable, provably-unmodified trading policy whose track
///         record is its own event log. Sell the Dave, sell the fund —
///         manager included.
///
/// @dev    Recitals require the bearer to have docked THIS Codex as a
///         chamber module for the Dave (one cure, once). Editions may be
///         bound open (anyone may recite — keeper-style automation; the
///         verse's own gates decide when it fires) or closed (bearer
///         recites alone). MAX_OPS bounds every recital; malformed verse
///         reverts whole. Leaf data is capped by SSTORE2 (~24kb).
contract Codex {
    // ─── constants ────────────────────────────────────────────────────
    uint8  public constant FORGE  = 0;
    uint8  public constant RECITE = 1;
    uint256 public constant MAX_LEAVES_PER_EDITION = 32;
    uint256 public constant MAX_OPS = 64;

    address public immutable hub;
    address public immutable chambers;
    address public immutable charter;

    // ─── the book ─────────────────────────────────────────────────────
    struct Leaf   { address pointer; uint64 authorDave; uint64 at; }
    struct Edition { uint64 daveId; uint8 kind; bool openRecital; uint64 at; uint256[] leafIds; }

    Leaf[] public leaves;
    Edition[] private _editions;
    mapping(uint256 => uint256[]) private _leavesOf;     // daveId => leafIds
    mapping(uint256 => uint256[]) private _editionsOf;   // daveId => editionIds
    mapping(uint256 => address[]) private _forgedOf;     // daveId => programs
    mapping(uint256 => bool) public spent;               // editionId => ONCE latch

    uint256 private _lock = 1;

    // ─── errors / events ─────────────────────────────────────────────
    error NotBearer(); error EmptyLeaf(); error BadEdition(); error WrongKind();
    error NoLeaf(); error TooManyLeaves(); error VerseFalse(); error BadVerse();
    error NotOpen(); error Reentry(); error Spent();

    event Inscribed(uint256 indexed leafId, uint256 indexed authorDave, address pointer, uint256 bytes_);
    event Bound(uint256 indexed editionId, uint256 indexed daveId, uint8 kind, uint256 nLeaves, bool openRecital);
    event Forged(uint256 indexed editionId, uint256 indexed daveId, address program, bytes32 salt);
    event Recited(uint256 indexed editionId, uint256 indexed daveId, address reciter, uint256 ops);

    constructor(address hub_, address chambers_, address charter_) {
        hub = hub_; chambers = chambers_; charter = charter_;
    }

    modifier nonReentrant() { if (_lock != 1) revert Reentry(); _lock = 2; _; _lock = 1; }
    modifier onlyBearer(uint256 daveId) {
        if (msg.sender != IHubK(hub).ownerOf(daveId)) revert NotBearer();
        _;
    }

    // ─── inscription (any bearer) ────────────────────────────────────
    function inscribe(uint256 daveId, bytes calldata data)
        external onlyBearer(daveId) returns (uint256 leafId)
    {
        if (data.length == 0) revert EmptyLeaf();
        leafId = leaves.length;
        address ptr = SSTORE2.write(data);
        leaves.push(Leaf(ptr, uint64(daveId), uint64(block.timestamp)));
        _leavesOf[daveId].push(leafId);
        emit Inscribed(leafId, daveId, ptr, data.length);
    }

    // ─── binding (a bearer, any leaves) ──────────────────────────────
    function bind(uint256 daveId, uint256[] calldata leafIds, uint8 kind, bool openRecital)
        external onlyBearer(daveId) returns (uint256 editionId)
    {
        if (kind > RECITE) revert WrongKind();
        if (leafIds.length == 0 || leafIds.length > MAX_LEAVES_PER_EDITION) revert TooManyLeaves();
        for (uint256 i; i < leafIds.length; ++i)
            if (leafIds[i] >= leaves.length) revert NoLeaf();
        editionId = _editions.length;
        Edition storage e = _editions.push();
        e.daveId = uint64(daveId); e.kind = kind;
        e.openRecital = openRecital; e.at = uint64(block.timestamp);
        e.leafIds = leafIds;
        _editionsOf[daveId].push(editionId);
        emit Bound(editionId, daveId, kind, leafIds.length, openRecital);
    }

    /// @notice the whole text: leaves concatenated in bound order.
    function read(uint256 editionId) public view returns (bytes memory out) {
        Edition storage e = _editions[editionId];
        for (uint256 i; i < e.leafIds.length; ++i)
            out = bytes.concat(out, SSTORE2.read(leaves[e.leafIds[i]].pointer));
    }

    // ─── the forge (bearer) ──────────────────────────────────────────
    /// @notice deploy a FORGE edition FROM THE VAULT — the program's
    ///         address derives from the token's own. Births code, never
    ///         capital. Dock it through the Chambers to give it hands.
    function forge(uint256 daveId, uint256 editionId, bytes32 salt)
        external nonReentrant onlyBearer(daveId) returns (address program)
    {
        Edition storage e = _editions[editionId];
        if (e.daveId != daveId) revert BadEdition();
        if (e.kind != FORGE) revert WrongKind();
        address vault = IHubK(hub).vaultOf(daveId);
        program = IVaultK(vault).codexCreate(read(editionId), _salt(daveId, editionId, salt));
        _forgedOf[daveId].push(program);
        emit Forged(editionId, daveId, program, salt);
    }

    /// @notice where a forge will land, before it does.
    function forgedAddressOf(uint256 daveId, uint256 editionId, bytes32 salt)
        external view returns (address)
    {
        address vault = IHubK(hub).vaultOf(daveId);
        return address(uint160(uint256(keccak256(abi.encodePacked(
            hex"ff", vault, _salt(daveId, editionId, salt), keccak256(read(editionId))
        )))));
    }

    // ─── the recital (bearer, or anyone if bound open) ───────────────
    /// @notice walk a RECITE edition and act it out — through the
    ///         Chambers, behind the boundary, like any organ.
    function recite(uint256 daveId, uint256 editionId)
        external nonReentrant returns (uint256 ops)
    {
        Edition storage e = _editions[editionId];
        if (e.daveId != daveId) revert BadEdition();
        if (e.kind != RECITE) revert WrongKind();
        if (!e.openRecital && msg.sender != IHubK(hub).ownerOf(daveId)) revert NotOpen();

        bytes memory verse = read(editionId);
        address vault = IHubK(hub).vaultOf(daveId);
        uint256 p;
        while (p < verse.length) {
            if (++ops > MAX_OPS) revert BadVerse();
            uint8 op = uint8(verse[p]); ++p;
            if (op == 0x00) break;
            else if (op == 0x01) p = _opSwap(vault, daveId, verse, p);
            else if (op == 0x02 || op == 0x03) p = _opTwap(op, verse, p);
            else if (op == 0x04) {
                uint64 ts = uint64(_num(verse, p, 8)); p += 8;
                if (block.timestamp < ts) revert VerseFalse();
            }
            else if (op == 0x05) { if (IVaultK(vault).unlockAt() <= block.timestamp) revert VerseFalse(); }
            else if (op == 0x06) { if (IVaultK(vault).unlockAt() > block.timestamp) revert VerseFalse(); }
            else if (op == 0x07) p = _opSend(vault, daveId, verse, p);
            else if (op == 0x08) {
                uint8 tier = uint8(_num(verse, p, 1)); p += 1;
                // a stranger must never ratchet your covenant
                if (msg.sender != IHubK(hub).ownerOf(daveId)) revert NotOpen();
                IVaultK(vault).seal(tier);            // only lands if Codex holds the mandate
            }
            else if (op == 0x09) {
                if (spent[editionId]) revert Spent();
                spent[editionId] = true;
            }
            else revert BadVerse();
        }
        emit Recited(editionId, daveId, msg.sender, ops);
    }

    // ─── verse ops ────────────────────────────────────────────────────
    function _opSwap(address, uint256 daveId, bytes memory v, uint256 p)
        internal returns (uint256)
    {
        uint64 poolId = uint64(_num(v, p, 8)); p += 8;
        bool baseIn = _num(v, p, 1) != 0; p += 1;
        uint128 amtIn = uint128(_num(v, p, 16)); p += 16;
        uint128 minOut = uint128(_num(v, p, 16)); p += 16;
        (,,,, address base, address quote,,,) = ICharterK(charter).pools(poolId);
        address tokIn = baseIn ? base : quote;
        bytes memory call_ = abi.encodeWithSignature(
            "swap(uint256,bool,uint256,uint256,uint256)",
            uint256(poolId), baseIn, uint256(amtIn), uint256(minOut), uint256(0)
        );
        if (tokIn == address(0)) {
            IChambersK(chambers).act(daveId, charter, amtIn, call_, address(0), amtIn);
        } else {
            IChambersK(chambers).act(
                daveId, tokIn, 0,
                abi.encodeWithSelector(0x095ea7b3, charter, uint256(amtIn)),
                address(0), 0
            );
            IChambersK(chambers).act(daveId, charter, 0, call_, tokIn, amtIn);
        }
        return p;
    }

    function _opTwap(uint8 op, bytes memory v, uint256 p) internal view returns (uint256) {
        uint64 poolId = uint64(_num(v, p, 8)); p += 8;
        uint32 window = uint32(_num(v, p, 4)); p += 4;
        uint128 px = uint128(_num(v, p, 16)); p += 16;
        uint256 t = ICharterK(charter).twap(poolId, window);
        if (op == 0x02 ? t <= px : t >= px) revert VerseFalse();
        return p;
    }

    function _opSend(address, uint256 daveId, bytes memory v, uint256 p)
        internal returns (uint256)
    {
        address token = address(uint160(_num(v, p, 20))); p += 20;
        address to = address(uint160(_num(v, p, 20))); p += 20;
        uint128 amt = uint128(_num(v, p, 16)); p += 16;
        if (token == address(0)) {
            IChambersK(chambers).act(daveId, to, amt, "", address(0), amt);
        } else {
            IChambersK(chambers).act(
                daveId, token, 0,
                abi.encodeWithSelector(0xa9059cbb, to, uint256(amt)),
                token, amt
            );
        }
        return p;
    }

    // ─── views ────────────────────────────────────────────────────────
    function leafText(uint256 leafId) external view returns (bytes memory) {
        return SSTORE2.read(leaves[leafId].pointer);
    }
    function edition(uint256 editionId)
        external view
        returns (uint64 daveId, uint8 kind, bool openRecital, uint64 at, uint256[] memory leafIds)
    {
        Edition storage e = _editions[editionId];
        return (e.daveId, e.kind, e.openRecital, e.at, e.leafIds);
    }
    function leavesOf(uint256 daveId) external view returns (uint256[] memory) { return _leavesOf[daveId]; }
    function editionsOf(uint256 daveId) external view returns (uint256[] memory) { return _editionsOf[daveId]; }
    function forgedOf(uint256 daveId) external view returns (address[] memory) { return _forgedOf[daveId]; }
    function leavesLength() external view returns (uint256) { return leaves.length; }
    function editionsLength() external view returns (uint256) { return _editions.length; }

    // ─── plumbing ─────────────────────────────────────────────────────
    function _salt(uint256 daveId, uint256 editionId, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(daveId, editionId, salt));
    }

    /// @dev big-endian read of `n` bytes at `p` (n ≤ 32); reverts short verse.
    function _num(bytes memory v, uint256 p, uint256 n) internal pure returns (uint256 x) {
        if (p + n > v.length) revert BadVerse();
        for (uint256 i; i < n; ++i) x = (x << 8) | uint8(v[p + i]);
    }
}
