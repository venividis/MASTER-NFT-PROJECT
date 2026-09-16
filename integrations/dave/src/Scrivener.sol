// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./lib/Interfaces.sol";

interface IHubS {
    function ownerOf(uint256 id) external view returns (address);
    function vaultOf(uint256 id) external view returns (address);
    function pool() external view returns (address);
    function treasury() external view returns (address);
}
interface IVaultViewsS { function unlockAt() external view returns (uint64); }
interface IVaultAckS { function acknowledge(address t) external; }

/// @title Scrivener — Codicil XVII. Options, written in full ink.
///
/// @notice The cleanest derivative on the floor: every contract the
///         Scrivener sells is COVERED IN FULL before it is sold. No
///         oracle, no mark, no liquidation engine, no funding — the
///         escrow IS the solvency proof, and exercise is PHYSICAL: the
///         asset itself changes hands at the strike.
///
///         A bearer opens a QUILL: a series in one underlying, one
///         quote, one strike, one expiry, CALL or PUT, American-style.
///         Cover comes first — CALLs escrow the underlying, PUTs escrow
///         the strike value in quote — and a contract can only be sold
///         against cover not yet spoken for. Premiums pay INTO THE
///         VAULT the block they are earned: born locked, like every
///         floor's proceeds. Exercise proceeds land the same way —
///         strike payments on CALLs, delivered underlying on PUTs, all
///         vault-ward. Past expiry, unexercised paper dies worthless
///         and the untouched cover walks home — INTO THE VAULT.
///
///         Sealed capital writes covered calls through the Chambers:
///         cover moves from vault to quill against a declared spend, and
///         everything the quill ever pays flows back into the covenant.
///         Income on locked bags, with settlement risk of exactly zero.
///
///         THE BOND freezes premium policy, reclaim, and close — a
///         bonded quill's terms are its word. Ragequit tolls only FREE
///         cover — cover beyond the sold book — 4.20%, 69/31. The
///         Scrivener is never tolled below its ink.
///
/// @dev    One contract = 1e18 underlying units. ERC-20 both legs.
///         Fee-on-transfer tokens unsupported. Premiums are bearer-
///         quoted, not modeled: the writer prices vol, the chain
///         enforces cover.
contract Scrivener {
    // ─── constants ────────────────────────────────────────────────────
    uint8   public constant CALL = 0;
    uint8   public constant PUT  = 1;

    uint16  public constant TOLL_BPS   = 42;
    uint16  public constant POOL_SHARE = 69;
    uint16  public constant RAGE_BPS   = 420;
    uint256 public constant ONE        = 1e18;      // one contract, in underlying

    address public immutable hub;

    // ─── quills ───────────────────────────────────────────────────────
    struct Quill {
        uint64  daveId;
        uint8   kind;           // CALL / PUT
        bool    closed;
        uint64  bondUntil;      // 0 = unbonded
        uint64  expiry;
        address underlying;     // ERC-20
        address quote;          // ERC-20
        uint128 strike;         // quote per ONE underlying
        uint128 premium;        // quote per contract
        uint128 escrow;         // CALL: underlying units; PUT: quote units
        uint128 sold;           // contracts outstanding (1e18 units)
    }

    Quill[] public quills;
    mapping(uint256 => mapping(address => uint128)) public heldOf;   // quillId => holder => contracts
    mapping(uint256 => uint256[]) private _quillsOf;                 // daveId => quillIds

    uint256 private _lock = 1;

    // ─── errors / events ─────────────────────────────────────────────
    error NotBearer(); error NotHub(); error Closed_(); error BondHolds();
    error NotSealed(); error RatchetOnly(); error Params(); error Empty();
    error Expired(); error NotExpired(); error OverInk(); error Slippage();
    error NotHolder(); error PaperLive(); error Overflow(); error Reentry();

    event QuillOpened(uint256 indexed quillId, uint256 indexed daveId, uint8 kind, address underlying, address quote, uint128 strike, uint64 expiry, uint128 premium);
    event Inked(uint256 indexed quillId, uint256 amount);
    event Premium(uint256 indexed quillId, uint128 premium);
    event Bonded(uint256 indexed quillId, uint64 bondUntil);
    event Written(uint256 indexed quillId, address indexed holder, uint256 n, uint256 paid);
    event Exercised(uint256 indexed quillId, address indexed holder, uint256 n);
    event Reclaimed(uint256 indexed quillId, uint256 amount);
    event QuillClosed(uint256 indexed quillId);
    event RagequitToll(uint256 indexed quillId, uint256 tax);

    constructor(address hub_) { hub = hub_; }

    modifier nonReentrant() { if (_lock != 1) revert Reentry(); _lock = 2; _; _lock = 1; }
    modifier onlyBearer(uint256 quillId) {
        if (msg.sender != IHubS(hub).ownerOf(quills[quillId].daveId)) revert NotBearer();
        _;
    }

    // ─── keeping a quill (the bearer) ────────────────────────────────
    function openQuill(
        uint256 daveId, uint8 kind, address underlying_, address quote_,
        uint128 strike_, uint64 expiry_, uint128 premium_
    ) external returns (uint256 quillId) {
        if (msg.sender != IHubS(hub).ownerOf(daveId)) revert NotBearer();
        if (kind > PUT) revert Params();
        if (underlying_ == address(0) || quote_ == address(0) || underlying_ == quote_) revert Params();
        if (strike_ == 0 || expiry_ <= block.timestamp) revert Params();
        quillId = quills.length;
        Quill memory q;
        q.daveId = uint64(daveId); q.kind = kind;
        q.underlying = underlying_; q.quote = quote_;
        q.strike = strike_; q.expiry = expiry_; q.premium = premium_;
        quills.push(q);
        _quillsOf[daveId].push(quillId);
        emit QuillOpened(quillId, daveId, kind, underlying_, quote_, strike_, expiry_, premium_);
    }

    /// @notice ink the cover. Additive: allowed even while bonded, from
    ///         any payer — a sealed vault inks through the Chambers.
    function ink(uint256 quillId, uint256 amount) external nonReentrant {
        Quill storage q = quills[quillId];
        if (q.closed || block.timestamp >= q.expiry) revert Closed_();
        if (amount == 0) revert Empty();
        address t = q.kind == CALL ? q.underlying : q.quote;
        require(IERC20(t).transferFrom(msg.sender, address(this), amount), "pull");
        q.escrow = _add128(q.escrow, amount);
        emit Inked(quillId, amount);
    }

    /// @notice re-quote the premium for FUTURE sales. Frozen while the
    ///         bond holds — a bonded quill's terms are its word.
    function setPremium(uint256 quillId, uint128 premium_)
        external onlyBearer(quillId)
    {
        Quill storage q = quills[quillId];
        if (q.closed || block.timestamp >= q.expiry) revert Closed_();
        if (_bonded(q)) revert BondHolds();
        q.premium = premium_;
        emit Premium(quillId, premium_);
    }

    function bond(uint256 quillId) external onlyBearer(quillId) {
        Quill storage q = quills[quillId];
        if (q.closed) revert Closed_();
        uint64 u = IVaultViewsS(IHubS(hub).vaultOf(q.daveId)).unlockAt();
        if (u <= uint64(block.timestamp)) revert NotSealed();
        if (u <= q.bondUntil) revert RatchetOnly();
        q.bondUntil = u;
        emit Bonded(quillId, u);
    }

    /// @notice past expiry, the untouched cover walks home — INTO THE
    ///         VAULT. Unexercised paper died worthless at the stroke.
    function reclaim(uint256 quillId)
        external nonReentrant onlyBearer(quillId)
    {
        Quill storage q = quills[quillId];
        if (block.timestamp < q.expiry) revert NotExpired();
        if (_bonded(q)) revert BondHolds();
        uint256 amt = q.escrow; q.escrow = 0;
        if (amt == 0) revert Empty();
        address t = q.kind == CALL ? q.underlying : q.quote;
        address vault = IHubS(hub).vaultOf(q.daveId);
        require(IERC20(t).transfer(vault, amt), "pay");
        _ack(vault, t);
        emit Reclaimed(quillId, amt);
    }

    /// @notice fold an unsold or expired quill. Cover — INTO THE VAULT.
    function closeQuill(uint256 quillId)
        external nonReentrant onlyBearer(quillId)
    {
        Quill storage q = quills[quillId];
        if (q.closed) revert Closed_();
        if (_bonded(q)) revert BondHolds();
        if (q.sold != 0 && block.timestamp < q.expiry) revert PaperLive();
        q.closed = true;
        uint256 amt = q.escrow; q.escrow = 0;
        if (amt > 0) {
            address t = q.kind == CALL ? q.underlying : q.quote;
            address vault = IHubS(hub).vaultOf(q.daveId);
            require(IERC20(t).transfer(vault, amt), "pay");
            _ack(vault, t);
        }
        emit QuillClosed(quillId);
    }

    // ─── the counter (anyone) ────────────────────────────────────────
    /// @notice buy contracts. Only cover not yet spoken for may be sold.
    ///         Premiums pay INTO THE VAULT the block they are earned.
    function write(uint256 quillId, uint256 n, uint256 maxCost)
        external nonReentrant
    {
        Quill storage q = quills[quillId];
        if (q.closed || block.timestamp >= q.expiry) revert Closed_();
        if (n == 0) revert Empty();
        uint256 need = _cover(q, uint256(q.sold) + n);
        if (need > q.escrow) revert OverInk();

        uint256 due = n * q.premium / ONE;
        uint256 toll = due * TOLL_BPS / 10_000;
        if (due + toll > maxCost) revert Slippage();

        q.sold = _add128(q.sold, n);
        heldOf[quillId][msg.sender] = _add128(heldOf[quillId][msg.sender], n);

        require(IERC20(q.quote).transferFrom(msg.sender, address(this), due + toll), "pull");
        _splitToll(q.quote, toll);
        address vault = IHubS(hub).vaultOf(q.daveId);
        if (due > 0) { require(IERC20(q.quote).transfer(vault, due), "pay"); _ack(vault, q.quote); }
        emit Written(quillId, msg.sender, n, due + toll);
    }

    /// @notice American exercise, any time before the stroke of expiry.
    ///         CALL: pay strike, take the asset — strike INTO THE VAULT.
    ///         PUT: deliver the asset — INTO THE VAULT — take the strike.
    function exercise(uint256 quillId, uint256 n) external nonReentrant {
        Quill storage q = quills[quillId];
        if (block.timestamp >= q.expiry) revert Expired();
        uint128 held = heldOf[quillId][msg.sender];
        if (n == 0 || n > held) revert NotHolder();
        heldOf[quillId][msg.sender] = held - uint128(n);
        q.sold -= uint128(n);

        uint256 strikeVal = n * q.strike / ONE;
        uint256 toll = strikeVal * TOLL_BPS / 10_000;
        address vault = IHubS(hub).vaultOf(q.daveId);

        if (q.kind == CALL) {
            q.escrow -= uint128(n);                            // underlying out of ink
            require(IERC20(q.quote).transferFrom(msg.sender, address(this), strikeVal + toll), "pull");
            _splitToll(q.quote, toll);
            require(IERC20(q.quote).transfer(vault, strikeVal), "pay");
            _ack(vault, q.quote);
            require(IERC20(q.underlying).transfer(msg.sender, n), "deliver");
        } else {
            q.escrow -= uint128(strikeVal);                    // quote out of ink
            require(IERC20(q.underlying).transferFrom(msg.sender, address(vault), n), "deliver");
            _ack(vault, q.underlying);
            uint256 out_ = strikeVal - toll;
            _splitToll(q.quote, toll);
            require(IERC20(q.quote).transfer(msg.sender, out_), "pay");
        }
        emit Exercised(quillId, msg.sender, n);
    }

    // ─── Law III at the desk: the hub hook ───────────────────────────
    /// @notice ragequit tolls FREE cover only — ink beyond the sold
    ///         book — 4.20%, 69/31. Never tolled below the ink.
    function onRagequit(uint256 daveId) external {
        if (msg.sender != hub) revert NotHub();
        uint256[] storage ids = _quillsOf[daveId];
        for (uint256 i; i < ids.length; ++i) {
            Quill storage q = quills[ids[i]];
            if (q.closed || !_bonded(q)) continue;
            uint256 need = _cover(q, q.sold);
            if (q.escrow <= need) continue;
            uint256 tax = (uint256(q.escrow) - need) * RAGE_BPS / 10_000;
            if (tax == 0) continue;
            q.escrow -= uint128(tax);
            address t = q.kind == CALL ? q.underlying : q.quote;
            uint256 toPool = tax * POOL_SHARE / 100;
            _payLenient(q, t, toPool, IHubS(hub).pool());
            _payLenient(q, t, tax - toPool, IHubS(hub).treasury());
            emit RagequitToll(ids[i], tax);
        }
    }

    // ─── views ────────────────────────────────────────────────────────
    function costOf(uint256 quillId, uint256 n) external view returns (uint256) {
        uint256 due = n * quills[quillId].premium / ONE;
        return due + due * TOLL_BPS / 10_000;
    }
    function capacity(uint256 quillId) external view returns (uint256) {
        Quill storage q = quills[quillId];
        uint256 need = _cover(q, q.sold);
        uint256 spare = q.escrow > need ? q.escrow - need : 0;
        return q.kind == CALL ? spare : spare * ONE / q.strike;
    }
    function quillsOf(uint256 daveId) external view returns (uint256[] memory) { return _quillsOf[daveId]; }
    function quillsLength() external view returns (uint256) { return quills.length; }
    function bondedNow(uint256 quillId) external view returns (bool) { return _bonded(quills[quillId]); }

    // ─── plumbing ─────────────────────────────────────────────────────
    function _cover(Quill storage q, uint256 soldN) internal view returns (uint256) {
        return q.kind == CALL ? soldN : soldN * q.strike / ONE;
    }
    function _bonded(Quill storage q) internal view returns (bool) {
        return q.bondUntil > uint64(block.timestamp);
    }
    function _splitToll(address token, uint256 toll) internal {
        if (toll == 0) return;
        uint256 toPool = toll * POOL_SHARE / 100;
        require(IERC20(token).transfer(IHubS(hub).pool(), toPool), "toll");
        require(IERC20(token).transfer(IHubS(hub).treasury(), toll - toPool), "toll");
    }
    function _payLenient(Quill storage q, address token, uint256 amt, address to) internal {
        if (amt == 0) return;
        try IERC20(token).transfer(to, amt) returns (bool ok) {
            if (!ok) q.escrow = _add128(q.escrow, amt);
        } catch { q.escrow = _add128(q.escrow, amt); }
    }
    function _ack(address vault, address token) internal {
        try IVaultAckS(vault).acknowledge(token) {} catch {}
    }
    function _add128(uint128 a, uint256 b) internal pure returns (uint128) {
        uint256 c = uint256(a) + b;
        if (c > type(uint128).max) revert Overflow();
        return uint128(c);
    }
}
