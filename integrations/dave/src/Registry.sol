// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./lib/Interfaces.sol";
import {IOracle, IAllowlist} from "./lib/Oracles.sol";

interface IHubR {
    function ownerOf(uint256 id) external view returns (address);
    function vaultOf(uint256 id) external view returns (address);
    function pool() external view returns (address);
    function treasury() external view returns (address);
}
interface IVaultViewsR { function unlockAt() external view returns (uint64); }
interface IVaultAckR { function acknowledge(address t) external; }
interface IERC721R {
    function transferFrom(address from, address to, uint256 id) external;
    function safeTransferFrom(address from, address to, uint256 id) external;
}
interface IERC2981R {
    function royaltyInfo(uint256 id, uint256 salePrice) external view returns (address, uint256);
}

/// @title Registry — Codicil XI. Real-world assets, dealt at the desk.
///
/// @notice The Bourse already trades RWAs — a deed, an invoice, a T-bill
///         wrapper, a carbon credit is just an ERC-721, and the stalls
///         already quote in Robinhood Stock Tokens, the chain's native
///         real-world paper. What a curve cannot do is price them: a
///         T-bill does not price like a JPEG. The Registry is the missing
///         half — the DEALER DESK.
///
///         A bearer opens a LOT: a two-way market in one collection,
///         priced off a NAV ORACLE instead of a curve. The lot buys at
///         NAV − band and sells at NAV + band; the band is the dealer's
///         margin, transparent and charterable, in place of curve and
///         fee both. If the feed goes stale past a day, the desk simply
///         will not deal — stale paper does not trade here.
///
///         COMPLIANCE, where it belongs: each lot may carry an allowlist
///         module. Permissioned assets — securities-adjacent paper,
///         KYC-gated instruments — trade behind the gate while remaining
///         fully composable objects. The venue is lawful per-lot, not
///         crippled per-chain.
///
///         The doctrines hold on this floor as on every floor. Sides:
///         SELL shelves paper, proceeds vault-ward, born locked; BUY is a
///         standing bid, every fill swallowed into the vault — the Dave
///         eats the paper; DUAL recycles both. THE BOND: ratchet-only to
///         unlockAt, freezes every exit and every policy, survives
///         ragequit (which tolls the lot's quote 4.20%, 69/31, and the
///         bond stands). VAULT-WARD: every exit pays into the covenant.
///         THE TOLL: 0.42% of notional, 69/31 — the sealed earn from the
///         real world too. ERC-2981 honored both ways, clamped at 10%.
///
/// @dev    Stated limits: NAV is per-unit and uniform across the
///         collection — heterogeneous ids want one lot each, or an
///         appraisal oracle per lot; royalty is looked up once per trade
///         against the first id; fee-on-transfer quote unsupported.
contract Registry {
    // ─── constants ────────────────────────────────────────────────────
    uint8   public constant SELL = 0;
    uint8   public constant BUY  = 1;
    uint8   public constant DUAL = 2;

    uint16  public constant TOLL_BPS        = 42;
    uint16  public constant POOL_SHARE      = 69;
    uint16  public constant RAGE_BPS        = 420;
    uint16  public constant MAX_BAND_BPS    = 2_000;   // dealer margin ≤ 20%
    uint16  public constant MAX_ROYALTY_BPS = 1_000;
    uint256 public constant MAX_SHELF       = 256;
    uint32  public constant NAV_STALE       = 1 days;

    address public immutable hub;

    // ─── lots ─────────────────────────────────────────────────────────
    struct Lot {
        uint64  daveId;
        uint8   side;
        bool    closed;
        uint16  bandBps;
        uint64  bondUntil;      // 0 = unbonded
        address collection;
        address quote;          // ERC-20 or address(0) = ETH
        address oracle;         // NAV per unit, quote terms
        address allowlist;      // 0 = open desk
        uint128 quoteBal;
    }

    Lot[] public lots;
    mapping(uint256 => uint256[]) private _shelf;
    mapping(uint256 => mapping(uint256 => uint256)) private _shelfIdx;  // id => idx+1
    mapping(uint256 => uint256[]) private _lotsOf;                      // daveId => lotIds

    uint256 private _lock = 1;

    // ─── errors / events ─────────────────────────────────────────────
    error NotBearer(); error NotHub(); error Closed_(); error WrongSide();
    error BondHolds(); error NotSealed(); error RatchetOnly(); error BandRule();
    error ShelfFull(); error NotOnShelf(); error Slippage(); error Empty();
    error EthMismatch(); error QuoteDry(); error Overflow(); error Reentry();
    error NotAllowed(); error StaleNAV();

    event LotOpened(uint256 indexed lotId, uint256 indexed daveId, address collection, address quote, address oracle, uint8 side, uint16 bandBps, address allowlist);
    event Stocked(uint256 indexed lotId, uint256 n);
    event Funded(uint256 indexed lotId, uint256 amount);
    event Policy(uint256 indexed lotId, uint16 bandBps, address allowlist);
    event Bonded(uint256 indexed lotId, uint64 bondUntil);
    event Dealt(uint256 indexed lotId, address indexed trader, bool bought, uint256 n, uint256 gross, uint256 moved);
    event Pulled(uint256 indexed lotId, uint256 n);
    event Drained(uint256 indexed lotId, uint256 amount);
    event LotClosed(uint256 indexed lotId);
    event RagequitToll(uint256 indexed lotId, uint256 tax);

    constructor(address hub_) { hub = hub_; }
    receive() external payable {}

    modifier nonReentrant() { if (_lock != 1) revert Reentry(); _lock = 2; _; _lock = 1; }
    modifier onlyBearer(uint256 lotId) {
        if (msg.sender != IHubR(hub).ownerOf(lots[lotId].daveId)) revert NotBearer();
        _;
    }
    modifier open_(uint256 lotId) { if (lots[lotId].closed) revert Closed_(); _; }
    modifier admitted(uint256 lotId) {
        address a = lots[lotId].allowlist;
        if (a != address(0) && !IAllowlist(a).isAllowed(msg.sender)) revert NotAllowed();
        _;
    }

    // ─── keeping a lot (the bearer) ──────────────────────────────────
    function openLot(
        uint256 daveId, address collection, address quote_, address oracle_,
        uint8 side, uint16 bandBps, address allowlist
    ) external returns (uint256 lotId) {
        if (msg.sender != IHubR(hub).ownerOf(daveId)) revert NotBearer();
        if (side > DUAL) revert WrongSide();
        if (bandBps > MAX_BAND_BPS) revert BandRule();
        lotId = lots.length;
        Lot memory l;
        l.daveId = uint64(daveId);
        l.collection = collection; l.quote = quote_; l.oracle = oracle_;
        l.side = side; l.bandBps = bandBps; l.allowlist = allowlist;
        lots.push(l);
        _lotsOf[daveId].push(lotId);
        emit LotOpened(lotId, daveId, collection, quote_, oracle_, side, bandBps, allowlist);
    }

    /// @notice shelve paper. Additive: allowed even while bonded.
    function stock(uint256 lotId, uint256[] calldata ids)
        external nonReentrant onlyBearer(lotId) open_(lotId)
    {
        Lot storage l = lots[lotId];
        if (l.side == BUY) revert WrongSide();
        if (ids.length == 0) revert Empty();
        if (_shelf[lotId].length + ids.length > MAX_SHELF) revert ShelfFull();
        for (uint256 i; i < ids.length; ++i) {
            IERC721R(l.collection).transferFrom(msg.sender, address(this), ids[i]);
            _shelfAdd(lotId, ids[i]);
        }
        emit Stocked(lotId, ids.length);
    }

    /// @notice fund the bid. Additive: allowed even while bonded.
    function fund(uint256 lotId, uint256 amount)
        external payable nonReentrant onlyBearer(lotId) open_(lotId)
    {
        Lot storage l = lots[lotId];
        if (l.side == SELL) revert WrongSide();
        if (amount == 0) revert Empty();
        if (l.quote == address(0)) {
            if (msg.value != amount) revert EthMismatch();
        } else {
            if (msg.value != 0) revert EthMismatch();
            require(IERC20(l.quote).transferFrom(msg.sender, address(this), amount), "pull");
        }
        l.quoteBal = _add128(l.quoteBal, amount);
        emit Funded(lotId, amount);
    }

    /// @notice band + gate policy. Frozen while the bond holds.
    function setPolicy(uint256 lotId, uint16 bandBps, address allowlist)
        external onlyBearer(lotId) open_(lotId)
    {
        Lot storage l = lots[lotId];
        if (_bonded(l)) revert BondHolds();
        if (bandBps > MAX_BAND_BPS) revert BandRule();
        l.bandBps = bandBps; l.allowlist = allowlist;
        emit Policy(lotId, bandBps, allowlist);
    }

    /// @notice bond the lot to the Dave's seal. Ratchet-only. Survives
    ///         ragequit.
    function bond(uint256 lotId) external onlyBearer(lotId) open_(lotId) {
        Lot storage l = lots[lotId];
        uint64 u = IVaultViewsR(IHubR(hub).vaultOf(l.daveId)).unlockAt();
        if (u <= uint64(block.timestamp)) revert NotSealed();
        if (u <= l.bondUntil) revert RatchetOnly();
        l.bondUntil = u;
        emit Bonded(lotId, u);
    }

    // ─── exits: only past the bond, only vault-ward ──────────────────
    function pull(uint256 lotId, uint256[] calldata ids)
        external nonReentrant onlyBearer(lotId)
    {
        Lot storage l = lots[lotId];
        if (_bonded(l)) revert BondHolds();
        if (ids.length == 0) revert Empty();
        address vault = IHubR(hub).vaultOf(l.daveId);
        for (uint256 i; i < ids.length; ++i) {
            _shelfRemove(lotId, ids[i]);
            IERC721R(l.collection).safeTransferFrom(address(this), vault, ids[i]);
        }
        emit Pulled(lotId, ids.length);
    }

    function drain(uint256 lotId, uint256 amount)
        external nonReentrant onlyBearer(lotId)
    {
        Lot storage l = lots[lotId];
        if (_bonded(l)) revert BondHolds();
        if (amount == 0 || amount > l.quoteBal) revert QuoteDry();
        l.quoteBal -= uint128(amount);
        address vault = IHubR(hub).vaultOf(l.daveId);
        _payStrict(l.quote, vault, amount);
        _ack(vault, l.quote);
        emit Drained(lotId, amount);
    }

    function closeLot(uint256 lotId)
        external nonReentrant onlyBearer(lotId) open_(lotId)
    {
        Lot storage l = lots[lotId];
        if (_bonded(l)) revert BondHolds();
        l.closed = true;
        address vault = IHubR(hub).vaultOf(l.daveId);
        uint256[] storage shelf = _shelf[lotId];
        uint256 n = shelf.length;
        for (uint256 i; i < n; ++i) {
            uint256 id = shelf[shelf.length - 1];
            _shelfRemove(lotId, id);
            IERC721R(l.collection).safeTransferFrom(address(this), vault, id);
        }
        uint256 q = l.quoteBal;
        if (q > 0) {
            l.quoteBal = 0;
            _payStrict(l.quote, vault, q);
            _ack(vault, l.quote);
        }
        emit LotClosed(lotId);
    }

    // ─── dealing (anyone the lot admits) ─────────────────────────────
    /// @notice buy paper off the shelf at NAV + band, plus toll and
    ///         royalty. SELL proceeds vault-ward; DUAL recycles.
    function buy(uint256 lotId, uint256[] calldata ids, uint256 maxIn)
        external payable nonReentrant open_(lotId) admitted(lotId)
    {
        Lot storage l = lots[lotId];
        if (l.side == BUY) revert WrongSide();
        if (ids.length == 0) revert Empty();
        uint256 gross = _nav(l) * (10_000 + l.bandBps) / 10_000 * ids.length;
        for (uint256 i; i < ids.length; ++i) _shelfRemove(lotId, ids[i]);

        uint256 toll = gross * TOLL_BPS / 10_000;
        (address royTo, uint256 roy) = _royalty(l.collection, ids[0], gross);
        uint256 paid = gross + toll + roy;
        if (paid > maxIn) revert Slippage();

        if (l.side == DUAL) l.quoteBal = _add128(l.quoteBal, gross);

        if (l.quote == address(0)) {
            if (msg.value < paid) revert EthMismatch();
        } else {
            if (msg.value != 0) revert EthMismatch();
            require(IERC20(l.quote).transferFrom(msg.sender, address(this), paid), "pull");
        }
        _splitToll(l.quote, toll);
        if (roy > 0) _payStrict(l.quote, royTo, roy);
        if (l.side == SELL) {
            address vault = IHubR(hub).vaultOf(l.daveId);
            _payStrict(l.quote, vault, gross);
            _ack(vault, l.quote);
        }
        for (uint256 i; i < ids.length; ++i)
            IERC721R(l.collection).transferFrom(address(this), msg.sender, ids[i]);
        if (l.quote == address(0) && msg.value > paid) {
            (bool ok,) = msg.sender.call{value: msg.value - paid}(""); require(ok, "refund");
        }
        emit Dealt(lotId, msg.sender, true, ids.length, gross, paid);
    }

    /// @notice sell paper to the desk at NAV − band, less toll and
    ///         royalty. BUY swallows into the vault; DUAL reshelves.
    function sell(uint256 lotId, uint256[] calldata ids, uint256 minOut)
        external nonReentrant open_(lotId) admitted(lotId)
    {
        Lot storage l = lots[lotId];
        if (l.side == SELL) revert WrongSide();
        if (ids.length == 0) revert Empty();
        uint256 gross = _nav(l) * (10_000 - l.bandBps) / 10_000 * ids.length;

        uint256 toll = gross * TOLL_BPS / 10_000;
        (address royTo, uint256 roy) = _royalty(l.collection, ids[0], gross);
        uint256 out = gross - toll - roy;
        if (out < minOut) revert Slippage();
        if (l.quoteBal < gross) revert QuoteDry();
        l.quoteBal -= uint128(gross);

        if (l.side == DUAL && _shelf[lotId].length + ids.length > MAX_SHELF) revert ShelfFull();
        for (uint256 i; i < ids.length; ++i) {
            IERC721R(l.collection).transferFrom(msg.sender, address(this), ids[i]);
            if (l.side == BUY) {
                IERC721R(l.collection).safeTransferFrom(
                    address(this), IHubR(hub).vaultOf(l.daveId), ids[i]
                );
            } else {
                _shelfAdd(lotId, ids[i]);
            }
        }
        _payStrict(l.quote, msg.sender, out);
        _splitToll(l.quote, toll);
        if (roy > 0) _payStrict(l.quote, royTo, roy);
        emit Dealt(lotId, msg.sender, false, ids.length, gross, out);
    }

    // ─── Law III at the desk: the hub hook ───────────────────────────
    function onRagequit(uint256 daveId) external {
        if (msg.sender != hub) revert NotHub();
        uint256[] storage ids = _lotsOf[daveId];
        for (uint256 i; i < ids.length; ++i) {
            Lot storage l = lots[ids[i]];
            if (l.closed || !_bonded(l)) continue;
            uint256 tax = uint256(l.quoteBal) * RAGE_BPS / 10_000;
            if (tax == 0) continue;
            l.quoteBal -= uint128(tax);
            uint256 toPool = tax * POOL_SHARE / 100;
            _payLenient(l, toPool, IHubR(hub).pool());
            _payLenient(l, tax - toPool, IHubR(hub).treasury());
            emit RagequitToll(ids[i], tax);
        }
    }

    // ─── views ────────────────────────────────────────────────────────
    function nav(uint256 lotId) external view returns (uint256) { return _nav(lots[lotId]); }
    function quoteBuy(uint256 lotId, uint256 n) external view returns (uint256) {
        Lot storage l = lots[lotId];
        uint256 g = _nav(l) * (10_000 + l.bandBps) / 10_000 * n;
        return g + g * TOLL_BPS / 10_000;
    }
    function quoteSell(uint256 lotId, uint256 n) external view returns (uint256) {
        Lot storage l = lots[lotId];
        uint256 g = _nav(l) * (10_000 - l.bandBps) / 10_000 * n;
        return g - g * TOLL_BPS / 10_000;
    }
    function shelf(uint256 lotId) external view returns (uint256[] memory) { return _shelf[lotId]; }
    function lotsOf(uint256 daveId) external view returns (uint256[] memory) { return _lotsOf[daveId]; }
    function lotsLength() external view returns (uint256) { return lots.length; }
    function bondedNow(uint256 lotId) external view returns (bool) { return _bonded(lots[lotId]); }

    // ─── plumbing ─────────────────────────────────────────────────────
    function _nav(Lot storage l) internal view returns (uint256) {
        IOracle o = IOracle(l.oracle);
        int256 a = o.latestAnswer();
        if (a <= 0 || o.updatedAt() + NAV_STALE < block.timestamp) revert StaleNAV();
        return uint256(a) * 1e18 / (10 ** o.decimals());
    }

    function _royalty(address coll, uint256 id, uint256 gross)
        internal view returns (address to, uint256 amt)
    {
        try IERC2981R(coll).royaltyInfo(id, gross) returns (address r, uint256 a) {
            uint256 cap = gross * MAX_ROYALTY_BPS / 10_000;
            if (r != address(0) && a > 0) { to = r; amt = a > cap ? cap : a; }
        } catch {}
    }

    function _bonded(Lot storage l) internal view returns (bool) {
        return l.bondUntil > uint64(block.timestamp);
    }

    function _shelfAdd(uint256 lotId, uint256 id) internal {
        _shelf[lotId].push(id);
        _shelfIdx[lotId][id] = _shelf[lotId].length;
    }
    function _shelfRemove(uint256 lotId, uint256 id) internal {
        uint256 ix = _shelfIdx[lotId][id];
        if (ix == 0) revert NotOnShelf();
        uint256[] storage sh = _shelf[lotId];
        uint256 last = sh[sh.length - 1];
        sh[ix - 1] = last;
        _shelfIdx[lotId][last] = ix;
        sh.pop();
        delete _shelfIdx[lotId][id];
    }

    function _splitToll(address token, uint256 toll) internal {
        if (toll == 0) return;
        uint256 toPool = toll * POOL_SHARE / 100;
        _payStrict(token, IHubR(hub).pool(), toPool);
        _payStrict(token, IHubR(hub).treasury(), toll - toPool);
    }

    function _payStrict(address token, address to, uint256 amt) internal {
        if (amt == 0) return;
        if (token == address(0)) {
            (bool ok,) = to.call{value: amt}(""); require(ok, "eth");
        } else {
            require(IERC20(token).transfer(to, amt), "erc20");
        }
    }

    function _payLenient(Lot storage l, uint256 amt, address to) internal {
        if (amt == 0) return;
        if (l.quote == address(0)) {
            (bool ok,) = to.call{value: amt}("");
            if (!ok) l.quoteBal = _add128(l.quoteBal, amt);
        } else {
            try IERC20(l.quote).transfer(to, amt) returns (bool ok) {
                if (!ok) l.quoteBal = _add128(l.quoteBal, amt);
            } catch { l.quoteBal = _add128(l.quoteBal, amt); }
        }
    }

    function _ack(address vault, address token) internal {
        if (token == address(0)) return;
        try IVaultAckR(vault).acknowledge(token) {} catch {}
    }

    function _add128(uint128 a, uint256 b) internal pure returns (uint128) {
        uint256 c = uint256(a) + b;
        if (c > type(uint128).max) revert Overflow();
        return uint128(c);
    }
}
