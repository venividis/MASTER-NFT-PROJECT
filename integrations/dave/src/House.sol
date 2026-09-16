// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./lib/Interfaces.sol";
import {IOracle} from "./lib/Oracles.sol";

interface IHubH {
    function ownerOf(uint256 id) external view returns (address);
    function vaultOf(uint256 id) external view returns (address);
    function pool() external view returns (address);
    function treasury() external view returns (address);
}
interface IVaultViewsH { function unlockAt() external view returns (uint64); }
interface IVaultAckH { function acknowledge(address t) external; }
interface ICharterH { function twap(uint256 poolId, uint32 window) external view returns (uint256); }

/// @title House — Codicil X. The vault is the counterparty.
///
/// @notice Perpetuals, single-owner-venue architecture: no orderbook, no
///         external LPs — peer-to-pool, and the pool is the Dave. A bearer
///         opens a DESK on any oracle-marked asset (Robinhood Stock Token
///         NAV feeds first among them), backs it from the covenant, and
///         the house takes every trade. Traders post quote-token margin
///         and take leveraged exposure either way; the desk earns the
///         spread, the funding imbalance, the liquidations, and the toll.
///         Stock tokens mark around the clock — a Dave running this desk
///         runs weekend price discovery on equities, the venue the
///         old world structurally cannot operate.
///
///         SOLVENCY BY CONSTRUCTION, four fences: open interest per side
///         is capped to a charterable fraction of backing; leverage is
///         capped; trader profit is capped at 9× margin; and the mark
///         must be fresh — a stale feed falls back to the Charter's TWAP
///         (Codicil VIII) or the desk simply will not trade.
///
///         THE BOND at the house: while bonded, backing cannot leave —
///         and independent of the bond, backing NEVER leaves while a
///         single position stands. The house cannot run mid-trade; that
///         is the whole point of a house. Ragequit tolls only FREE
///         backing — backing in excess of the outstanding book — at the
///         covenant rate, 4.20%, 69/31. The house is never tolled below
///         its book. The bond survives, as it does on every floor.
///
///         VAULT-WARD: backing exits only into the vault. Losses become
///         backing; backing becomes the vault's. The desk is a revenue
///         organ of the covenant, not a wallet.
///
///         THE TOLL: 0.42% of notional, on open and on close, 69/31 —
///         leverage multiplies notional, so the sealed earn from the
///         desks' volume harder than from any floor before this one.
///
/// @dev    Stated limits: quote must be ERC-20 (margin in stock tokens or
///         stables — that is the thesis); funding is skew-proportional and
///         desk-capped per day; profit clamps to 9× margin and, at the
///         last fence, to available backing; oracle answers are
///         normalized to 1e18 and trusted as configured by the charterer.
contract House {
    // ─── constants ────────────────────────────────────────────────────
    uint16  public constant TOLL_BPS      = 42;     // 0.42% of notional
    uint16  public constant POOL_SHARE    = 69;
    uint16  public constant RAGE_BPS      = 420;    // on FREE backing only
    uint8   public constant MAX_PROFIT_X  = 9;      // net win ≤ 9× margin
    uint16  public constant BOUNTY_BPS    = 500;    // 5% of equity to liquidator
    uint32  public constant ORACLE_STALE  = 1 hours;
    uint32  public constant TWAP_WINDOW   = 30 minutes;

    address public immutable hub;
    address public immutable charter;    // Codicil VIII, TWAP fallback

    // ─── desks ────────────────────────────────────────────────────────
    struct Desk {
        uint64  daveId;
        bool    closed;
        uint8   maxLevX;        // 1..20
        uint16  spreadBps;      // ≤ 200
        uint16  maintBps;       // 100..2000
        uint16  oiCapBps;       // ≤ 5000, per side, of backing
        uint16  fundingBpsDay;  // ≤ 1000, cap at full one-sided skew
        uint64  bondUntil;      // 0 = unbonded
        uint64  charterPoolP1;  // charter poolId + 1; 0 = no fallback
        address quote;          // ERC-20 margin token
        address oracle;         // IOracle, base priced in quote
        uint128 backing;
        uint128 longOI;         // quote-notional at entry
        uint128 shortOI;
        int256  fundingIdx;     // 1e18 fraction of notional; longs pay +
        uint64  lastFunding;
    }
    struct Position {
        address trader;
        uint64  deskId;
        bool    isLong;
        bool    open;
        uint128 sizeBase;       // 1e18 base units
        uint128 margin;
        uint128 entryPx;        // 1e18 quote per base
        uint128 notional;       // at entry, for OI accounting
        int256  entryIdx;
    }

    Desk[] public desks;
    Position[] public positions;
    mapping(uint256 => uint256[]) private _desksOf;   // daveId => deskIds

    uint256 private _lock = 1;

    // ─── errors / events ─────────────────────────────────────────────
    error NotBearer(); error NotHub(); error NotTrader(); error Closed_();
    error BondHolds(); error NotSealed(); error RatchetOnly(); error Params();
    error Empty(); error OverLevered(); error OverCap(); error Slippage();
    error StaleMark(); error BookOpen(); error NotOpen(); error Healthy();
    error Overflow(); error Reentry();

    event DeskOpened(uint256 indexed deskId, uint256 indexed daveId, address quote, address oracle);
    event Backed(uint256 indexed deskId, uint256 amount, bool added);
    event Bonded(uint256 indexed deskId, uint64 bondUntil);
    event DeskClosed(uint256 indexed deskId);
    event Opened(uint256 indexed posId, uint256 indexed deskId, address indexed trader, bool isLong, uint128 sizeBase, uint128 margin, uint128 entryPx);
    event ClosedPos(uint256 indexed posId, uint256 payout, int256 pnl);
    event Liquidated(uint256 indexed posId, address indexed liquidator, uint256 bounty);
    event FundingSettled(uint256 indexed deskId, int256 idx);
    event RagequitToll(uint256 indexed deskId, uint256 tax);

    constructor(address hub_, address charter_) { hub = hub_; charter = charter_; }

    modifier nonReentrant() { if (_lock != 1) revert Reentry(); _lock = 2; _; _lock = 1; }
    modifier onlyBearer(uint256 deskId) {
        if (msg.sender != IHubH(hub).ownerOf(desks[deskId].daveId)) revert NotBearer();
        _;
    }

    // ─── keeping a desk (the bearer) ─────────────────────────────────
    function openDesk(
        uint256 daveId, address quote_, address oracle_,
        uint8 maxLevX, uint16 spreadBps, uint16 maintBps,
        uint16 oiCapBps, uint16 fundingBpsDay, uint64 charterPoolP1
    ) external returns (uint256 deskId) {
        if (msg.sender != IHubH(hub).ownerOf(daveId)) revert NotBearer();
        if (quote_ == address(0) || oracle_ == address(0)) revert Params();
        if (maxLevX == 0 || maxLevX > 20) revert Params();
        if (spreadBps > 200 || maintBps < 100 || maintBps > 2000) revert Params();
        if (oiCapBps == 0 || oiCapBps > 5000 || fundingBpsDay > 1000) revert Params();
        deskId = desks.length;
        Desk memory d;
        d.daveId = uint64(daveId);
        d.quote = quote_; d.oracle = oracle_;
        d.maxLevX = maxLevX; d.spreadBps = spreadBps; d.maintBps = maintBps;
        d.oiCapBps = oiCapBps; d.fundingBpsDay = fundingBpsDay;
        d.charterPoolP1 = charterPoolP1;
        d.lastFunding = uint64(block.timestamp);
        desks.push(d);
        _desksOf[daveId].push(deskId);
        emit DeskOpened(deskId, daveId, quote_, oracle_);
    }

    /// @notice back the house. Additive: allowed even while bonded.
    function fundBacking(uint256 deskId, uint256 amount)
        external nonReentrant onlyBearer(deskId)
    {
        Desk storage d = desks[deskId];
        if (d.closed) revert Closed_();
        if (amount == 0) revert Empty();
        require(IERC20(d.quote).transferFrom(msg.sender, address(this), amount), "pull");
        d.backing = _add128(d.backing, amount);
        emit Backed(deskId, amount, true);
    }

    /// @notice withdraw backing — INTO THE VAULT. Only past the bond, and
    ///         NEVER while a position stands. The house cannot run.
    function withdrawBacking(uint256 deskId, uint256 amount)
        external nonReentrant onlyBearer(deskId)
    {
        Desk storage d = desks[deskId];
        if (_bonded(d)) revert BondHolds();
        if (d.longOI != 0 || d.shortOI != 0) revert BookOpen();
        if (amount == 0 || amount > d.backing) revert Empty();
        d.backing -= uint128(amount);
        address vault = IHubH(hub).vaultOf(d.daveId);
        require(IERC20(d.quote).transfer(vault, amount), "pay");
        _ack(vault, d.quote);
        emit Backed(deskId, amount, false);
    }

    /// @notice bond the desk to the Dave's seal. Ratchet-only. Survives
    ///         ragequit.
    function bond(uint256 deskId) external onlyBearer(deskId) {
        Desk storage d = desks[deskId];
        if (d.closed) revert Closed_();
        uint64 u = IVaultViewsH(IHubH(hub).vaultOf(d.daveId)).unlockAt();
        if (u <= uint64(block.timestamp)) revert NotSealed();
        if (u <= d.bondUntil) revert RatchetOnly();
        d.bondUntil = u;
        emit Bonded(deskId, u);
    }

    /// @notice fold the desk. Backing — INTO THE VAULT. No open book, no
    ///         bond.
    function closeDesk(uint256 deskId)
        external nonReentrant onlyBearer(deskId)
    {
        Desk storage d = desks[deskId];
        if (d.closed) revert Closed_();
        if (_bonded(d)) revert BondHolds();
        if (d.longOI != 0 || d.shortOI != 0) revert BookOpen();
        d.closed = true;
        uint256 b = d.backing; d.backing = 0;
        if (b > 0) {
            address vault = IHubH(hub).vaultOf(d.daveId);
            require(IERC20(d.quote).transfer(vault, b), "pay");
            _ack(vault, d.quote);
        }
        emit DeskClosed(deskId);
    }

    // ─── trading the house (anyone) ──────────────────────────────────
    /// @notice open a position. Entry at mark ± spread; toll on notional.
    /// @param  pxLimit long: max acceptable entry; short: min acceptable.
    function open(
        uint256 deskId, bool isLong, uint128 sizeBase,
        uint128 margin, uint256 pxLimit
    ) external nonReentrant returns (uint256 posId) {
        Desk storage d = desks[deskId];
        if (d.closed) revert Closed_();
        if (sizeBase == 0 || margin == 0) revert Empty();
        _settleFunding(deskId, d);

        uint256 px = mark(deskId);
        uint256 entry = isLong
            ? px * (10_000 + d.spreadBps) / 10_000
            : px * (10_000 - d.spreadBps) / 10_000;
        if (isLong ? entry > pxLimit : entry < pxLimit) revert Slippage();

        uint256 notional = uint256(sizeBase) * entry / 1e18;
        if (notional == 0) revert Empty();
        if (notional > uint256(margin) * d.maxLevX) revert OverLevered();
        uint256 cap = uint256(d.backing) * d.oiCapBps / 10_000;
        uint256 sideOI = isLong ? d.longOI : d.shortOI;
        if (sideOI + notional > cap) revert OverCap();

        uint256 toll = notional * TOLL_BPS / 10_000;
        require(IERC20(d.quote).transferFrom(msg.sender, address(this), uint256(margin) + toll), "pull");
        _splitToll(d.quote, toll);

        if (isLong) d.longOI = _add128(d.longOI, notional);
        else        d.shortOI = _add128(d.shortOI, notional);

        posId = positions.length;
        positions.push(Position({
            trader: msg.sender, deskId: uint64(deskId), isLong: isLong, open: true,
            sizeBase: sizeBase, margin: margin, entryPx: _to128(entry),
            notional: _to128(notional), entryIdx: d.fundingIdx
        }));
        emit Opened(posId, deskId, msg.sender, isLong, sizeBase, margin, _to128(entry));
    }

    /// @notice close your position. Exit at mark ∓ spread; toll on exit
    ///         notional; profit paid from backing, loss paid to backing.
    /// @param  pxLimit long: min acceptable exit; short: max acceptable.
    function close(uint256 posId, uint256 pxLimit) external nonReentrant {
        Position storage q = positions[posId];
        if (!q.open) revert NotOpen();
        if (msg.sender != q.trader) revert NotTrader();
        Desk storage d = desks[q.deskId];
        _settleFunding(q.deskId, d);

        uint256 px = mark(q.deskId);
        uint256 exit_ = q.isLong
            ? px * (10_000 - d.spreadBps) / 10_000
            : px * (10_000 + d.spreadBps) / 10_000;
        if (q.isLong ? exit_ < pxLimit : exit_ > pxLimit) revert Slippage();

        (int256 net,) = _netPnl(q, d, exit_);
        _release(q, d);

        // settle against the house
        uint256 payout;
        if (net >= 0) {
            uint256 win = uint256(net);
            if (win > d.backing) win = d.backing;         // last fence
            d.backing -= uint128(win);
            payout = uint256(q.margin) + win;
        } else {
            uint256 loss = uint256(-net);
            if (loss > q.margin) loss = q.margin;
            d.backing = _add128(d.backing, loss);
            payout = uint256(q.margin) - loss;
        }

        uint256 toll = uint256(q.sizeBase) * exit_ / 1e18 * TOLL_BPS / 10_000;
        if (toll > payout) toll = payout;
        payout -= toll;
        q.open = false;
        _splitToll(d.quote, toll);
        if (payout > 0) require(IERC20(d.quote).transfer(q.trader, payout), "pay");
        emit ClosedPos(posId, payout, net);
    }

    /// @notice liquidate an underwater position. 5% of remaining equity
    ///         to the caller; margin less equity to the house; remainder
    ///         of equity back to the trader. Marked at raw price, no
    ///         spread — the fence is honest.
    function liquidate(uint256 posId) external nonReentrant {
        Position storage q = positions[posId];
        if (!q.open) revert NotOpen();
        Desk storage d = desks[q.deskId];
        _settleFunding(q.deskId, d);

        uint256 px = mark(q.deskId);
        (int256 net, uint256 markNotional) = _netPnl(q, d, px);
        int256 equityS = int256(uint256(q.margin)) + net;
        uint256 equity = equityS > 0 ? uint256(equityS) : 0;
        if (equity * 10_000 >= markNotional * d.maintBps) revert Healthy();

        _release(q, d);
        q.open = false;

        // signed settle: below margin, the house keeps the difference;
        // above it (funding drift), the house owes the excess — paid
        // from backing, clamped to backing. No path underflows; no
        // position is ever unliquidatable.
        if (equity <= q.margin) {
            d.backing = _add128(d.backing, uint256(q.margin) - equity);
        } else {
            uint256 owe = equity - q.margin;
            if (owe > d.backing) { owe = d.backing; equity = uint256(q.margin) + owe; }
            d.backing -= uint128(owe);
        }
        uint256 bounty = equity * BOUNTY_BPS / 10_000;
        uint256 back = equity - bounty;
        if (bounty > 0) require(IERC20(d.quote).transfer(msg.sender, bounty), "pay");
        if (back > 0)   require(IERC20(d.quote).transfer(q.trader, back), "pay");
        emit Liquidated(posId, msg.sender, bounty);
    }

    // ─── funding: the skew pays ──────────────────────────────────────
    /// @dev longs pay shorts when long-heavy, at fundingBpsDay × skew
    ///      ratio, accrued continuously on desk interaction.
    function _settleFunding(uint256 deskId, Desk storage d) internal {
        uint64 nowTs = uint64(block.timestamp);
        uint256 dt = nowTs - d.lastFunding;
        d.lastFunding = nowTs;
        if (dt == 0) return;
        uint256 tot = uint256(d.longOI) + d.shortOI;
        if (tot == 0) return;
        int256 skew = int256(uint256(d.longOI)) - int256(uint256(d.shortOI));
        // 1e18-scaled fraction of notional accrued over dt
        int256 delta = skew * int256(uint256(d.fundingBpsDay)) * int256(dt) * 1e18
                     / int256(tot) / 10_000 / 1 days;
        d.fundingIdx += delta;
        emit FundingSettled(deskId, d.fundingIdx);
    }

    // ─── Law III at the house: the hub hook ──────────────────────────
    /// @notice ragequit tolls FREE backing only — backing beyond the
    ///         larger side of the book — 4.20%, 69/31. The house is never
    ///         tolled below its book; the bond stands.
    function onRagequit(uint256 daveId) external {
        if (msg.sender != hub) revert NotHub();
        uint256[] storage ids = _desksOf[daveId];
        for (uint256 i; i < ids.length; ++i) {
            Desk storage d = desks[ids[i]];
            if (d.closed || !_bonded(d)) continue;
            uint256 book = d.longOI > d.shortOI ? d.longOI : d.shortOI;
            if (d.backing <= book) continue;
            uint256 tax = (uint256(d.backing) - book) * RAGE_BPS / 10_000;
            if (tax == 0) continue;
            d.backing -= uint128(tax);
            uint256 toPool = tax * POOL_SHARE / 100;
            _payLenient(d, toPool, IHubH(hub).pool());
            _payLenient(d, tax - toPool, IHubH(hub).treasury());
            emit RagequitToll(ids[i], tax);
        }
    }

    // ─── marking ──────────────────────────────────────────────────────
    /// @notice the desk's price: fresh oracle, else Charter TWAP, else
    ///         the desk does not trade.
    function mark(uint256 deskId) public view returns (uint256) {
        Desk storage d = desks[deskId];
        IOracle o = IOracle(d.oracle);
        (bool ok, uint256 px) = _tryOracle(o);
        if (ok) return px;
        if (d.charterPoolP1 != 0 && charter != address(0)) {
            try ICharterH(charter).twap(d.charterPoolP1 - 1, TWAP_WINDOW) returns (uint256 t) {
                if (t > 0) return t;
            } catch {}
        }
        revert StaleMark();
    }

    function _tryOracle(IOracle o) internal view returns (bool, uint256) {
        try o.latestAnswer() returns (int256 a) {
            if (a <= 0) return (false, 0);
            try o.updatedAt() returns (uint64 t) {
                if (t + ORACLE_STALE < block.timestamp) return (false, 0);
                uint8 dec = o.decimals();
                return (true, uint256(a) * 1e18 / (10 ** dec));
            } catch { return (false, 0); }
        } catch { return (false, 0); }
    }

    // ─── views ────────────────────────────────────────────────────────
    function equityOf(uint256 posId) external view returns (int256) {
        Position storage q = positions[posId];
        if (!q.open) return 0;
        Desk storage d = desks[q.deskId];
        (int256 net,) = _netPnl(q, d, mark(q.deskId));
        return int256(uint256(q.margin)) + net;
    }
    function desksOf(uint256 daveId) external view returns (uint256[] memory) { return _desksOf[daveId]; }
    function desksLength() external view returns (uint256) { return desks.length; }
    function positionsLength() external view returns (uint256) { return positions.length; }
    function bondedNow(uint256 deskId) external view returns (bool) { return _bonded(desks[deskId]); }

    // ─── plumbing ─────────────────────────────────────────────────────
    /// @dev pnl at price, net of funding; clamped to +9× margin.
    function _netPnl(Position storage q, Desk storage d, uint256 px)
        internal view returns (int256 net, uint256 markNotional)
    {
        markNotional = uint256(q.sizeBase) * px / 1e18;
        int256 raw = q.isLong
            ? int256(markNotional) - int256(uint256(q.notional))
            : int256(uint256(q.notional)) - int256(markNotional);
        int256 fund = int256(uint256(q.notional)) * (d.fundingIdx - q.entryIdx) / 1e18;
        if (!q.isLong) fund = -fund;              // longs pay positive idx
        net = raw - fund;
        int256 capN = int256(uint256(q.margin)) * int256(uint256(MAX_PROFIT_X));
        if (net > capN) net = capN;
    }

    function _release(Position storage q, Desk storage d) internal {
        if (q.isLong) d.longOI -= q.notional;
        else          d.shortOI -= q.notional;
    }

    function _bonded(Desk storage d) internal view returns (bool) {
        return d.bondUntil > uint64(block.timestamp);
    }

    function _splitToll(address token, uint256 toll) internal {
        if (toll == 0) return;
        uint256 toPool = toll * POOL_SHARE / 100;
        require(IERC20(token).transfer(IHubH(hub).pool(), toPool), "toll");
        require(IERC20(token).transfer(IHubH(hub).treasury(), toll - toPool), "toll");
    }

    function _payLenient(Desk storage d, uint256 amt, address to) internal {
        if (amt == 0) return;
        try IERC20(d.quote).transfer(to, amt) returns (bool ok) {
            if (!ok) d.backing = _add128(d.backing, amt);
        } catch { d.backing = _add128(d.backing, amt); }
    }

    function _ack(address vault, address token) internal {
        try IVaultAckH(vault).acknowledge(token) {} catch {}
    }

    function _to128(uint256 x) internal pure returns (uint128) {
        if (x > type(uint128).max) revert Overflow();
        return uint128(x);
    }
    function _add128(uint128 a, uint256 b) internal pure returns (uint128) {
        uint256 c = uint256(a) + b;
        if (c > type(uint128).max) revert Overflow();
        return uint128(c);
    }
}
