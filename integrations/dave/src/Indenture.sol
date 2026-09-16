// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./lib/Interfaces.sol";

interface IHubI {
    function ownerOf(uint256 id) external view returns (address);
    function vaultOf(uint256 id) external view returns (address);
    function pool() external view returns (address);
    function treasury() external view returns (address);
}
interface IVaultViewsI { function unlockAt() external view returns (uint64); }
interface IVaultAckI { function acknowledge(address t) external; }

/// @title Indenture — Codicil XVIII. Debt with a maturity the chain enforces.
///
/// @notice The first bond whose maturity date is not a promise but a
///         mechanism. A sealed Dave opens a TRANCHE of zero-coupon
///         NOTES; the maturity is read off the covenant itself —
///         `unlockAt`, at the moment of issue — and PINNED. The bearer
///         may ratchet the seal longer afterward, as bearers do; the
///         paper does not move. Conviction can deepen; the debt still
///         comes due on the day it said.
///
///         FULLY FUNDED, ALWAYS: face value is escrowed in the
///         indenture's SINKING FUND before a single note sells, and a
///         note can only be sold against fund not yet spoken for. There
///         is no default state in this contract because none is
///         reachable — the money that redeems the paper is locked the
///         day the paper is born, and committed fund answers to the
///         paper alone until maturity.
///
///         WHY A BEARER SELLS: the discount. Notes sell below face —
///         the bearer prices its own credit — and every sale's proceeds
///         pay INTO THE VAULT, born locked. The Dave converts sealed
///         future into liquid present, and the present locks itself
///         into the same covenant. Debt as deeper conviction.
///
///         Notes are bearer paper inside the book: transferable by a
///         word, redeemable at face by whoever holds them at maturity.
///         The escheat holds as everywhere — 90 days past maturity,
///         unredeemed fund falls INTO THE VAULT. Ragequit tolls FREE
///         fund only (fund beyond the outstanding paper's face), 4.20%,
///         69/31: an indenture is born bonded — its promise was made to
///         the noteholders the day it opened. The toll — 0.42% — rides
///         every subscription.
///
/// @dev    ERC-20 quote only. One note redeems `face` quote units.
///         Notes are internal balances (an ERC-1155 wrap can front them
///         later); price is bearer-quoted for FUTURE sales only.
contract Indenture {
    // ─── constants ────────────────────────────────────────────────────
    uint16  public constant TOLL_BPS   = 42;
    uint16  public constant POOL_SHARE = 69;
    uint16  public constant RAGE_BPS   = 420;
    uint32  public constant ESCHEAT    = 90 days;

    address public immutable hub;

    // ─── tranches ─────────────────────────────────────────────────────
    struct Tranche {
        uint64  daveId;
        bool    closed;
        uint64  maturity;       // unlockAt at issue — PINNED
        address quote;          // ERC-20
        uint128 face;           // quote per note
        uint128 price;          // quote per note, future sales
        uint128 fund;           // sinking fund held here
        uint128 outstanding;    // notes issued, unredeemed
    }

    Tranche[] public tranches;
    mapping(uint256 => mapping(address => uint128)) public notesOf;   // trancheId => holder
    mapping(uint256 => uint256[]) private _tranchesOf;                // daveId => trancheIds

    uint256 private _lock = 1;

    // ─── errors / events ─────────────────────────────────────────────
    error NotBearer(); error NotHub(); error Closed_(); error NotSealed();
    error Params(); error Empty(); error OverFund(); error Slippage();
    error NotMature(); error Matured(); error TooEarly(); error PaperLive();
    error NotHolder(); error Overflow(); error Reentry();

    event TrancheOpened(uint256 indexed trancheId, uint256 indexed daveId, address quote, uint128 face, uint128 price, uint64 maturity);
    event FundInked(uint256 indexed trancheId, uint256 amount);
    event Priced(uint256 indexed trancheId, uint128 price);
    event Subscribed(uint256 indexed trancheId, address indexed holder, uint256 n, uint256 paid);
    event NotesMoved(uint256 indexed trancheId, address indexed from, address indexed to, uint256 n);
    event Redeemed(uint256 indexed trancheId, address indexed holder, uint256 n, uint256 amount);
    event FreeDrawn(uint256 indexed trancheId, uint256 amount);
    event Escheated(uint256 indexed trancheId, uint256 amount);
    event TrancheClosed(uint256 indexed trancheId);
    event RagequitToll(uint256 indexed trancheId, uint256 tax);

    constructor(address hub_) { hub = hub_; }

    modifier nonReentrant() { if (_lock != 1) revert Reentry(); _lock = 2; _; _lock = 1; }
    modifier onlyBearer(uint256 trancheId) {
        if (msg.sender != IHubI(hub).ownerOf(tranches[trancheId].daveId)) revert NotBearer();
        _;
    }

    // ─── issuance (the bearer) ───────────────────────────────────────
    /// @notice open a tranche. Maturity is the covenant's unlockAt, read
    ///         NOW and pinned — later ratchets deepen the seal, not the
    ///         debt.
    function openTranche(uint256 daveId, address quote_, uint128 face_, uint128 price_)
        external returns (uint256 trancheId)
    {
        if (msg.sender != IHubI(hub).ownerOf(daveId)) revert NotBearer();
        if (quote_ == address(0) || face_ == 0 || price_ == 0 || price_ > face_) revert Params();
        uint64 u = IVaultViewsI(IHubI(hub).vaultOf(daveId)).unlockAt();
        if (u <= uint64(block.timestamp)) revert NotSealed();
        trancheId = tranches.length;
        Tranche memory t;
        t.daveId = uint64(daveId); t.quote = quote_;
        t.face = face_; t.price = price_; t.maturity = u;
        tranches.push(t);
        _tranchesOf[daveId].push(trancheId);
        emit TrancheOpened(trancheId, daveId, quote_, face_, price_, u);
    }

    /// @notice fill the sinking fund. Additive, from any payer.
    function inkFund(uint256 trancheId, uint256 amount) external nonReentrant {
        Tranche storage t = tranches[trancheId];
        if (t.closed || block.timestamp >= t.maturity) revert Matured();
        if (amount == 0) revert Empty();
        require(IERC20(t.quote).transferFrom(msg.sender, address(this), amount), "pull");
        t.fund = _add128(t.fund, amount);
        emit FundInked(trancheId, amount);
    }

    /// @notice re-price FUTURE sales. Sold paper's face never moves.
    function setPrice(uint256 trancheId, uint128 price_)
        external onlyBearer(trancheId)
    {
        Tranche storage t = tranches[trancheId];
        if (t.closed || block.timestamp >= t.maturity) revert Matured();
        if (price_ == 0 || price_ > t.face) revert Params();
        t.price = price_;
        emit Priced(trancheId, price_);
    }

    /// @notice draw UNCOMMITTED fund — INTO THE VAULT. Fund behind
    ///         outstanding paper answers to the paper alone.
    function drawFree(uint256 trancheId, uint256 amount)
        external nonReentrant onlyBearer(trancheId)
    {
        Tranche storage t = tranches[trancheId];
        uint256 committed = uint256(t.outstanding) * t.face;
        if (amount == 0 || uint256(t.fund) < committed + amount) revert OverFund();
        t.fund -= uint128(amount);
        address vault = IHubI(hub).vaultOf(t.daveId);
        require(IERC20(t.quote).transfer(vault, amount), "pay");
        _ack(vault, t.quote);
        emit FreeDrawn(trancheId, amount);
    }

    /// @notice fold a tranche with no paper out. Fund — INTO THE VAULT.
    function closeTranche(uint256 trancheId)
        external nonReentrant onlyBearer(trancheId)
    {
        Tranche storage t = tranches[trancheId];
        if (t.closed) revert Closed_();
        if (t.outstanding != 0) revert PaperLive();
        t.closed = true;
        uint256 amt = t.fund; t.fund = 0;
        if (amt > 0) {
            address vault = IHubI(hub).vaultOf(t.daveId);
            require(IERC20(t.quote).transfer(vault, amt), "pay");
            _ack(vault, t.quote);
        }
        emit TrancheClosed(trancheId);
    }

    // ─── subscription (anyone) ───────────────────────────────────────
    /// @notice buy notes at the quoted discount. A note only sells
    ///         against fund not yet spoken for. Proceeds — INTO THE
    ///         VAULT, born locked.
    function subscribe(uint256 trancheId, uint256 n, uint256 maxCost)
        external nonReentrant
    {
        Tranche storage t = tranches[trancheId];
        if (t.closed || block.timestamp >= t.maturity) revert Matured();
        if (n == 0) revert Empty();
        uint256 committed = (uint256(t.outstanding) + n) * t.face;
        if (committed > t.fund) revert OverFund();

        uint256 due = n * t.price;
        uint256 toll = due * TOLL_BPS / 10_000;
        if (due + toll > maxCost) revert Slippage();

        t.outstanding = _add128(t.outstanding, n);
        notesOf[trancheId][msg.sender] = _add128(notesOf[trancheId][msg.sender], n);

        require(IERC20(t.quote).transferFrom(msg.sender, address(this), due + toll), "pull");
        _splitToll(t.quote, toll);
        address vault = IHubI(hub).vaultOf(t.daveId);
        require(IERC20(t.quote).transfer(vault, due), "pay");
        _ack(vault, t.quote);
        emit Subscribed(trancheId, msg.sender, n, due + toll);
    }

    /// @notice bearer paper moves by a word.
    function transferNotes(uint256 trancheId, address to, uint256 n) external {
        uint128 held = notesOf[trancheId][msg.sender];
        if (n == 0 || n > held || to == address(0)) revert NotHolder();
        notesOf[trancheId][msg.sender] = held - uint128(n);
        notesOf[trancheId][to] = _add128(notesOf[trancheId][to], n);
        emit NotesMoved(trancheId, msg.sender, to, n);
    }

    // ─── maturity ─────────────────────────────────────────────────────
    /// @notice at maturity, face per note, from the fund. No default
    ///         state exists; none is reachable.
    function redeem(uint256 trancheId, uint256 n) external nonReentrant {
        Tranche storage t = tranches[trancheId];
        if (block.timestamp < t.maturity) revert NotMature();
        uint128 held = notesOf[trancheId][msg.sender];
        if (n == 0 || n > held) revert NotHolder();
        notesOf[trancheId][msg.sender] = held - uint128(n);
        t.outstanding -= uint128(n);
        uint256 owed = n * t.face;
        t.fund -= uint128(owed);
        require(IERC20(t.quote).transfer(msg.sender, owed), "pay");
        emit Redeemed(trancheId, msg.sender, n, owed);
    }

    /// @notice 90 days past maturity, what nobody claimed falls home —
    ///         INTO THE VAULT.
    function escheat(uint256 trancheId) external nonReentrant onlyBearer(trancheId) {
        Tranche storage t = tranches[trancheId];
        if (block.timestamp < uint256(t.maturity) + ESCHEAT) revert TooEarly();
        uint256 amt = t.fund; t.fund = 0;
        t.outstanding = 0;                                    // stragglers escheated
        if (amt == 0) revert Empty();
        address vault = IHubI(hub).vaultOf(t.daveId);
        require(IERC20(t.quote).transfer(vault, amt), "pay");
        _ack(vault, t.quote);
        emit Escheated(trancheId, amt);
    }

    // ─── Law III at the book: the hub hook ───────────────────────────
    /// @notice an indenture is born bonded — its promise was made to the
    ///         noteholders at issue. Ragequit tolls FREE fund only —
    ///         fund beyond the outstanding paper's face — 4.20%, 69/31.
    function onRagequit(uint256 daveId) external {
        if (msg.sender != hub) revert NotHub();
        uint256[] storage ids = _tranchesOf[daveId];
        for (uint256 i; i < ids.length; ++i) {
            Tranche storage t = tranches[ids[i]];
            if (t.closed) continue;
            uint256 committed = uint256(t.outstanding) * t.face;
            if (t.fund <= committed) continue;
            uint256 tax = (uint256(t.fund) - committed) * RAGE_BPS / 10_000;
            if (tax == 0) continue;
            t.fund -= uint128(tax);
            uint256 toPool = tax * POOL_SHARE / 100;
            _payLenient(t, toPool, IHubI(hub).pool());
            _payLenient(t, tax - toPool, IHubI(hub).treasury());
            emit RagequitToll(ids[i], tax);
        }
    }

    // ─── views ────────────────────────────────────────────────────────
    function costOf(uint256 trancheId, uint256 n) external view returns (uint256) {
        uint256 due = n * tranches[trancheId].price;
        return due + due * TOLL_BPS / 10_000;
    }
    function capacityNotes(uint256 trancheId) external view returns (uint256) {
        Tranche storage t = tranches[trancheId];
        uint256 committed = uint256(t.outstanding) * t.face;
        return t.fund > committed ? (uint256(t.fund) - committed) / t.face : 0;
    }
    function tranchesOf(uint256 daveId) external view returns (uint256[] memory) { return _tranchesOf[daveId]; }
    function tranchesLength() external view returns (uint256) { return tranches.length; }

    // ─── plumbing ─────────────────────────────────────────────────────
    function _splitToll(address token, uint256 toll) internal {
        if (toll == 0) return;
        uint256 toPool = toll * POOL_SHARE / 100;
        require(IERC20(token).transfer(IHubI(hub).pool(), toPool), "toll");
        require(IERC20(token).transfer(IHubI(hub).treasury(), toll - toPool), "toll");
    }
    function _payLenient(Tranche storage t, uint256 amt, address to) internal {
        if (amt == 0) return;
        try IERC20(t.quote).transfer(to, amt) returns (bool ok) {
            if (!ok) t.fund = _add128(t.fund, amt);
        } catch { t.fund = _add128(t.fund, amt); }
    }
    function _ack(address vault, address token) internal {
        try IVaultAckI(vault).acknowledge(token) {} catch {}
    }
    function _add128(uint128 a, uint256 b) internal pure returns (uint128) {
        uint256 c = uint256(a) + b;
        if (c > type(uint128).max) revert Overflow();
        return uint128(c);
    }
}
