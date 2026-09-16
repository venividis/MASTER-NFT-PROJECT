// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20, IVaultViews} from "./lib/Interfaces.sol";
import {Curves} from "./lib/Curves.sol";

interface IHubB {
    function ownerOf(uint256 id) external view returns (address);
    function vaultOf(uint256 id) external view returns (address);
    function pool() external view returns (address);
    function treasury() external view returns (address);
    function timelock() external view returns (address);
}
interface IWakeB { function checkAndNote(uint256 stallId, address trader) external; }
interface IERC721B {
    function transferFrom(address from, address to, uint256 id) external;
    function safeTransferFrom(address from, address to, uint256 id) external;
}
interface IERC2981B {
    function royaltyInfo(uint256 id, uint256 salePrice) external view returns (address, uint256);
}
interface IVaultAck { function acknowledge(address t) external; }

/// @title Bourse — Codicil VII. The floor. Every Dave a market-maker.
///
/// @notice The Daves do not get a DEX; they ARE the DEX. A bearer opens a
///         STALL on the floor: a bonding-curve pool in some ERC-721
///         collection, quoted in ETH or any ERC-20 (Robinhood Stock Tokens
///         included). Traders swap against the stall; the stall belongs to
///         the Dave — sell the Dave, sell the book.
///
///         Sides:
///           SELL — shelf of NFTs, asks walk up the curve. Proceeds pay
///                  INTO the vault: born locked if sealed.
///           BUY  — a wall of quote, bids walk down the curve. Every NFT
///                  bought is swallowed INTO the vault. The Dave eats
///                  the floor.
///           DUAL — both sides; inventory and quote recycle through the
///                  stall and the stall fee compounds as liquidity.
///
///         THE BOND. A sealed Dave may bond a stall to its covenant:
///         bondUntil ratchets to the vault's unlockAt. While bonded,
///         nothing exits and nothing is repriced — only additive ops
///         (stock, fund) are allowed. The market can rely on a bonded
///         floor the way the pool relies on a seal. The bond is a promise
///         to the FLOOR, not to the vault: ragequit does not release it —
///         it tolls the stall's quote at the covenant rate (4.20%, 69/31)
///         and the bond stands to its stated date.
///
///         VAULT-WARD DOCTRINE. The Bourse only ever pays toward the
///         vault. Proceeds, pulled shelves, drained quote, closed stalls —
///         everything the Dave earns or reclaims lands inside the
///         covenant, never in the bearer's wallet.
///
///         THE TOLL. 0.42% of notional on every swap, 69% to the
///         ConvictionPool, 31% to treasury. Every sealed Dave on the chain
///         earns from all NFT volume. ERC-2981 royalties are honored both
///         directions, clamped at 10%.
///
/// @dev    Known asymmetries, stated plainly: (1) NFT inventory cannot be
///         tolled fractionally at ragequit — indivisible; only the quote
///         side pays, and the standing bond is the remainder of the price.
///         (2) Royalty is looked up once per trade against the first id —
///         per-token royalty schedules are approximated. (3) Fee-on-transfer
///         quote tokens are unsupported.
contract Bourse {
    // ─── constants ────────────────────────────────────────────────────
    uint8   public constant SELL = 0;
    uint8   public constant BUY  = 1;
    uint8   public constant DUAL = 2;

    uint16  public constant TOLL_BPS        = 42;     // 0.42% every swap
    uint16  public constant POOL_SHARE      = 69;     // of the toll / the rage tax
    uint16  public constant RAGE_BPS        = 420;    // 4.20% of bonded quote
    uint16  public constant MAX_FEE_BPS     = 1_000;  // stall fee cap (DUAL only)
    uint16  public constant MAX_ROYALTY_BPS = 1_000;  // 2981 clamp
    uint256 public constant MAX_SHELF       = 256;    // ids per stall

    address public immutable hub;
    address public wake;                    // Codicil IX gate; 0 until docked

    // ─── stalls ───────────────────────────────────────────────────────
    struct Stall {
        uint64  daveId;
        uint8   curve;        // Curves.FLAT / LINEAR / EXPO
        uint8   side;         // SELL / BUY / DUAL
        bool    closed;
        uint16  feeBps;       // DUAL only
        uint64  bondUntil;    // 0 = unbonded
        address collection;
        address quote;        // address(0) = ETH
        uint128 spot;
        uint128 delta;
        uint128 quoteBal;     // escrowed quote (BUY / DUAL)
    }

    Stall[] public stalls;
    mapping(uint256 => uint256[]) private _shelf;      // stallId => nft ids
    mapping(uint256 => mapping(uint256 => uint256)) private _shelfIdx; // stallId => id => idx+1
    mapping(uint256 => uint256[]) private _stallsOf;   // daveId => stallIds

    uint256 private _lock = 1;

    // ─── errors / events ─────────────────────────────────────────────
    error NotBearer(); error NotHub(); error Closed_(); error WrongSide();
    error BondHolds(); error NotSealed(); error RatchetOnly(); error FeeRule();
    error ShelfFull(); error NotOnShelf(); error Slippage(); error Empty();
    error EthMismatch(); error QuoteDry(); error Overflow(); error Reentry();
    error Docked(); error NotTimelock();

    event StallOpened(uint256 indexed stallId, uint256 indexed daveId, address collection, address quote, uint8 curve, uint8 side, uint128 spot, uint128 delta, uint16 feeBps);
    event Stocked(uint256 indexed stallId, uint256 n);
    event Funded(uint256 indexed stallId, uint256 amount);
    event Repriced(uint256 indexed stallId, uint128 spot, uint128 delta, uint16 feeBps);
    event Bonded(uint256 indexed stallId, uint64 bondUntil);
    event Bought(uint256 indexed stallId, address indexed trader, uint256 n, uint256 gross, uint256 paid);
    event Sold(uint256 indexed stallId, address indexed trader, uint256 n, uint256 gross, uint256 received);
    event Pulled(uint256 indexed stallId, uint256 n);
    event Drained(uint256 indexed stallId, uint256 amount);
    event StallClosed(uint256 indexed stallId);
    event RagequitToll(uint256 indexed stallId, uint256 tax);
    event WakeDocked(address wake_);

    constructor(address hub_) { hub = hub_; }

    /// @notice dock the Wake (Codicil IX). Once, by the covenant's own
    ///         timelock — the floor's rules change only the slow way.
    function dock(address wake_) external {
        if (msg.sender != IHubB(hub).timelock()) revert NotTimelock();
        if (wake != address(0)) revert Docked();
        wake = wake_;
        emit WakeDocked(wake_);
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentry();
        _lock = 2; _; _lock = 1;
    }
    modifier onlyBearer(uint256 stallId) {
        if (msg.sender != IHubB(hub).ownerOf(stalls[stallId].daveId)) revert NotBearer();
        _;
    }
    modifier open_(uint256 stallId) {
        if (stalls[stallId].closed) revert Closed_();
        _;
    }

    // ─── keeping a stall (the bearer) ────────────────────────────────
    function openStall(
        uint256 daveId, address collection, address quote_,
        uint8 curve, uint8 side, uint128 spot, uint128 delta, uint16 feeBps
    ) external returns (uint256 stallId) {
        if (msg.sender != IHubB(hub).ownerOf(daveId)) revert NotBearer();
        Curves.validate(curve, spot, delta);
        if (side > DUAL) revert WrongSide();
        if (feeBps != 0 && side != DUAL) revert FeeRule();   // sudoswap discipline:
        if (feeBps > MAX_FEE_BPS) revert FeeRule();          // fee is a two-sided thing
        stallId = stalls.length;
        Stall memory s;
        s.daveId = uint64(daveId);
        s.collection = collection; s.quote = quote_;
        s.curve = curve; s.side = side;
        s.spot = spot; s.delta = delta; s.feeBps = feeBps;
        stalls.push(s);
        _stallsOf[daveId].push(stallId);
        emit StallOpened(stallId, daveId, collection, quote_, curve, side, spot, delta, feeBps);
    }

    /// @notice put NFTs on the shelf. Additive: allowed even while bonded.
    function stock(uint256 stallId, uint256[] calldata ids)
        external nonReentrant onlyBearer(stallId) open_(stallId)
    {
        Stall storage st = stalls[stallId];
        if (st.side == BUY) revert WrongSide();
        if (ids.length == 0) revert Empty();
        if (_shelf[stallId].length + ids.length > MAX_SHELF) revert ShelfFull();
        for (uint256 i; i < ids.length; ++i) {
            IERC721B(st.collection).transferFrom(msg.sender, address(this), ids[i]);
            _shelfAdd(stallId, ids[i]);
        }
        emit Stocked(stallId, ids.length);
    }

    /// @notice add quote liquidity. Additive: allowed even while bonded.
    function fund(uint256 stallId, uint256 amount)
        external payable nonReentrant onlyBearer(stallId) open_(stallId)
    {
        Stall storage st = stalls[stallId];
        if (st.side == SELL) revert WrongSide();
        if (amount == 0) revert Empty();
        if (st.quote == address(0)) {
            if (msg.value != amount) revert EthMismatch();
        } else {
            if (msg.value != 0) revert EthMismatch();
            require(IERC20(st.quote).transferFrom(msg.sender, address(this), amount), "pull");
        }
        st.quoteBal = _add128(st.quoteBal, amount);
        emit Funded(stallId, amount);
    }

    /// @notice reprice the curve. Frozen while the bond holds.
    function reprice(uint256 stallId, uint128 spot, uint128 delta, uint16 feeBps)
        external onlyBearer(stallId) open_(stallId)
    {
        Stall storage st = stalls[stallId];
        if (_bonded(st)) revert BondHolds();
        Curves.validate(st.curve, spot, delta);
        if (feeBps != 0 && st.side != DUAL) revert FeeRule();
        if (feeBps > MAX_FEE_BPS) revert FeeRule();
        st.spot = spot; st.delta = delta; st.feeBps = feeBps;
        emit Repriced(stallId, spot, delta, feeBps);
    }

    /// @notice bond the stall to the Dave's seal. Ratchet-only, like the
    ///         seal itself. Requires the vault sealed NOW; bondUntil takes
    ///         the vault's unlockAt. Survives ragequit.
    function bond(uint256 stallId) external onlyBearer(stallId) open_(stallId) {
        Stall storage st = stalls[stallId];
        IVaultViews v = IVaultViews(IHubB(hub).vaultOf(st.daveId));
        uint64 u = v.unlockAt();
        if (u <= uint64(block.timestamp)) revert NotSealed();
        if (u <= st.bondUntil) revert RatchetOnly();
        st.bondUntil = u;
        emit Bonded(stallId, u);
    }

    // ─── exits: only past the bond, only vault-ward ──────────────────
    /// @notice pull NFTs off the shelf — INTO THE VAULT.
    function pull(uint256 stallId, uint256[] calldata ids)
        external nonReentrant onlyBearer(stallId)
    {
        Stall storage st = stalls[stallId];
        if (_bonded(st)) revert BondHolds();
        if (ids.length == 0) revert Empty();
        address vault = IHubB(hub).vaultOf(st.daveId);
        for (uint256 i; i < ids.length; ++i) {
            _shelfRemove(stallId, ids[i]);
            IERC721B(st.collection).safeTransferFrom(address(this), vault, ids[i]);
        }
        emit Pulled(stallId, ids.length);
    }

    /// @notice drain quote — INTO THE VAULT.
    function drain(uint256 stallId, uint256 amount)
        external nonReentrant onlyBearer(stallId)
    {
        Stall storage st = stalls[stallId];
        if (_bonded(st)) revert BondHolds();
        if (amount == 0 || amount > st.quoteBal) revert QuoteDry();
        st.quoteBal -= uint128(amount);
        address vault = IHubB(hub).vaultOf(st.daveId);
        _payStrict(st.quote, vault, amount);
        _ack(vault, st.quote);
        emit Drained(stallId, amount);
    }

    /// @notice fold the stall. Shelf and quote — INTO THE VAULT.
    function close(uint256 stallId)
        external nonReentrant onlyBearer(stallId) open_(stallId)
    {
        Stall storage st = stalls[stallId];
        if (_bonded(st)) revert BondHolds();
        st.closed = true;
        address vault = IHubB(hub).vaultOf(st.daveId);
        uint256[] storage shelf = _shelf[stallId];
        uint256 n = shelf.length;
        for (uint256 i; i < n; ++i) {
            uint256 id = shelf[shelf.length - 1];
            _shelfRemove(stallId, id);
            IERC721B(st.collection).safeTransferFrom(address(this), vault, id);
        }
        uint256 q = st.quoteBal;
        if (q > 0) {
            st.quoteBal = 0;
            _payStrict(st.quote, vault, q);
            _ack(vault, st.quote);
        }
        emit StallClosed(stallId);
    }

    // ─── trading the stall (anyone) ──────────────────────────────────
    /// @notice buy NFTs off the shelf. Pays gross + toll + royalty
    ///         (+ stall fee on DUAL). SELL proceeds go INTO the vault;
    ///         DUAL proceeds and fee recycle as stall liquidity.
    function buy(uint256 stallId, uint256[] calldata ids, uint256 maxIn)
        external payable nonReentrant open_(stallId)
    {
        Stall storage st = stalls[stallId];
        if (st.side == BUY) revert WrongSide();
        if (ids.length == 0) revert Empty();
        if (wake != address(0)) IWakeB(wake).checkAndNote(stallId, msg.sender);
        uint256 gross = _walkUp(st, stallId, ids);
        _settleBuy(st, stallId, ids, gross, maxIn);
    }

    /// @dev curve walk + shelf removal (effects only).
    function _walkUp(Stall storage st, uint256 stallId, uint256[] calldata ids)
        internal returns (uint256 gross)
    {
        uint128 s = st.spot;
        for (uint256 i; i < ids.length; ++i) {
            _shelfRemove(stallId, ids[i]);
            (uint128 g, uint128 nu) = Curves.up(st.curve, s, st.delta);
            gross += g; s = nu;
        }
        st.spot = s;
    }

    /// @dev fee math, collection, distribution, delivery.
    function _settleBuy(
        Stall storage st, uint256 stallId, uint256[] calldata ids,
        uint256 gross, uint256 maxIn
    ) internal {
        uint256 toll = gross * TOLL_BPS / 10_000;
        (address royTo, uint256 roy) = _royalty(st.collection, ids[0], gross);
        uint256 fee = st.side == DUAL ? gross * st.feeBps / 10_000 : 0;
        uint256 paid = gross + toll + roy + fee;
        if (paid > maxIn) revert Slippage();

        // effects
        if (st.side == DUAL) st.quoteBal = _add128(st.quoteBal, gross + fee);

        // interactions: collect, distribute, deliver
        if (st.quote == address(0)) {
            if (msg.value < paid) revert EthMismatch();
        } else {
            if (msg.value != 0) revert EthMismatch();
            require(IERC20(st.quote).transferFrom(msg.sender, address(this), paid), "pull");
        }
        _splitToll(st.quote, toll);
        if (roy > 0) _payStrict(st.quote, royTo, roy);
        if (st.side == SELL) {
            address vault = IHubB(hub).vaultOf(st.daveId);
            _payStrict(st.quote, vault, gross);
            _ack(vault, st.quote);
        }
        for (uint256 i; i < ids.length; ++i) {
            IERC721B(st.collection).transferFrom(address(this), msg.sender, ids[i]);
        }
        if (st.quote == address(0) && msg.value > paid) {
            (bool ok,) = msg.sender.call{value: msg.value - paid}(""); require(ok, "refund");
        }
        emit Bought(stallId, msg.sender, ids.length, gross, paid);
    }

    /// @notice sell NFTs to the stall. Receives spot − toll − royalty
    ///         (− stall fee on DUAL). BUY swallows the NFTs into the
    ///         vault; DUAL reshelves them.
    function sell(uint256 stallId, uint256[] calldata ids, uint256 minOut)
        external nonReentrant open_(stallId)
    {
        Stall storage st = stalls[stallId];
        if (st.side == SELL) revert WrongSide();
        if (ids.length == 0) revert Empty();
        if (wake != address(0)) IWakeB(wake).checkAndNote(stallId, msg.sender);
        uint256 gross = _walkDown(st, ids.length);
        _settleSell(st, stallId, ids, gross, minOut);
    }

    /// @dev curve walk (effects only).
    function _walkDown(Stall storage st, uint256 n) internal returns (uint256 gross) {
        uint128 s = st.spot;
        for (uint256 i; i < n; ++i) {
            (uint128 g, uint128 nu) = Curves.down(st.curve, s, st.delta);
            gross += g; s = nu;
        }
        st.spot = s;
    }

    /// @dev fee math, escrow debit, NFT placement, payout.
    function _settleSell(
        Stall storage st, uint256 stallId, uint256[] calldata ids,
        uint256 gross, uint256 minOut
    ) internal {
        uint256 toll = gross * TOLL_BPS / 10_000;
        (address royTo, uint256 roy) = _royalty(st.collection, ids[0], gross);
        uint256 fee = st.side == DUAL ? gross * st.feeBps / 10_000 : 0;
        uint256 out = gross - toll - roy - fee;
        if (out < minOut) revert Slippage();

        // the escrow pays everything except the fee, which stays as liquidity
        if (st.quoteBal < gross - fee) revert QuoteDry();
        st.quoteBal -= uint128(gross - fee);

        // interactions: take NFTs, place them, pay out
        if (st.side == DUAL && _shelf[stallId].length + ids.length > MAX_SHELF) revert ShelfFull();
        for (uint256 i; i < ids.length; ++i) {
            IERC721B(st.collection).transferFrom(msg.sender, address(this), ids[i]);
            if (st.side == BUY) {
                IERC721B(st.collection).safeTransferFrom(
                    address(this), IHubB(hub).vaultOf(st.daveId), ids[i]
                );
            } else {
                _shelfAdd(stallId, ids[i]);
            }
        }
        _payStrict(st.quote, msg.sender, out);
        _splitToll(st.quote, toll);
        if (roy > 0) _payStrict(st.quote, royTo, roy);
        emit Sold(stallId, msg.sender, ids.length, gross, out);
    }

    // ─── Law III on the floor: the hub hook ──────────────────────────
    /// @notice ragequit tolls every BONDED stall's quote at the covenant
    ///         rate — 4.20%, 69/31 — and the bond STANDS. The promise was
    ///         made to the floor; the floor keeps it. Best-effort payment:
    ///         a broken quote token never bricks a ragequit.
    function onRagequit(uint256 daveId) external {
        if (msg.sender != hub) revert NotHub();
        uint256[] storage ids = _stallsOf[daveId];
        for (uint256 i; i < ids.length; ++i) {
            Stall storage st = stalls[ids[i]];
            if (st.closed || !_bonded(st)) continue;
            uint256 tax = uint256(st.quoteBal) * RAGE_BPS / 10_000;
            if (tax == 0) continue;
            st.quoteBal -= uint128(tax);
            uint256 toPool = tax * POOL_SHARE / 100;
            uint256 kept;
            if (!_payLenient(st.quote, IHubB(hub).pool(), toPool)) kept += toPool;
            if (!_payLenient(st.quote, IHubB(hub).treasury(), tax - toPool)) kept += tax - toPool;
            if (kept > 0) st.quoteBal = _add128(st.quoteBal, kept);
            emit RagequitToll(ids[i], tax - kept);
        }
    }

    // ─── the trader's readout ────────────────────────────────────────
    /// @notice total cost to buy n items now: (gross, paid, newSpot).
    function quoteBuy(uint256 stallId, uint256 n) external view returns (uint256 gross, uint256 paid, uint128 nu) {
        Stall storage st = stalls[stallId];
        uint128 s = st.spot;
        for (uint256 i; i < n; ++i) { (uint128 g, uint128 x) = Curves.up(st.curve, s, st.delta); gross += g; s = x; }
        nu = s;
        (, uint256 roy) = _royaltyView(st.collection, gross);
        uint256 fee = st.side == DUAL ? gross * st.feeBps / 10_000 : 0;
        paid = gross + gross * TOLL_BPS / 10_000 + roy + fee;
    }

    /// @notice total payout to sell n items now: (gross, received, newSpot).
    function quoteSell(uint256 stallId, uint256 n) external view returns (uint256 gross, uint256 out, uint128 nu) {
        Stall storage st = stalls[stallId];
        uint128 s = st.spot;
        for (uint256 i; i < n; ++i) { (uint128 g, uint128 x) = Curves.down(st.curve, s, st.delta); gross += g; s = x; }
        nu = s;
        (, uint256 roy) = _royaltyView(st.collection, gross);
        uint256 fee = st.side == DUAL ? gross * st.feeBps / 10_000 : 0;
        out = gross - gross * TOLL_BPS / 10_000 - roy - fee;
    }

    /// @notice the covenant readout traders price the stall by.
    function trust(uint256 stallId) external view returns (
        uint64 bondUntil, bool sealedNow, uint8 tier, uint32 temper, uint32 paperHands
    ) {
        Stall storage st = stalls[stallId];
        IVaultViews v = IVaultViews(IHubB(hub).vaultOf(st.daveId));
        bondUntil = st.bondUntil;
        sealedNow = v.unlockAt() > uint64(block.timestamp);
        tier = v.tier(); temper = v.temper(); paperHands = v.paperHands();
    }

    function shelf(uint256 stallId) external view returns (uint256[] memory) { return _shelf[stallId]; }
    function shelfLength(uint256 stallId) external view returns (uint256) { return _shelf[stallId].length; }
    function stallsOf(uint256 daveId) external view returns (uint256[] memory) { return _stallsOf[daveId]; }
    function stallsLength() external view returns (uint256) { return stalls.length; }
    function bondedNow(uint256 stallId) external view returns (bool) { return _bonded(stalls[stallId]); }

    // ─── internals ───────────────────────────────────────────────────
    function _bonded(Stall storage st) internal view returns (bool) {
        return st.bondUntil > uint64(block.timestamp);
    }

    function _shelfAdd(uint256 stallId, uint256 id) internal {
        uint256[] storage arr = _shelf[stallId];
        if (arr.length >= MAX_SHELF) revert ShelfFull();
        arr.push(id);
        _shelfIdx[stallId][id] = arr.length;
    }

    function _shelfRemove(uint256 stallId, uint256 id) internal {
        uint256 idx = _shelfIdx[stallId][id];
        if (idx == 0) revert NotOnShelf();
        uint256[] storage arr = _shelf[stallId];
        uint256 last = arr[arr.length - 1];
        arr[idx - 1] = last;
        _shelfIdx[stallId][last] = idx;
        arr.pop();
        delete _shelfIdx[stallId][id];
    }

    /// @dev ERC-2981, clamped to MAX_ROYALTY_BPS; absent or broken = zero.
    function _royalty(address coll, uint256 id, uint256 gross) internal view returns (address to, uint256 amt) {
        try IERC2981B(coll).royaltyInfo(id, gross) returns (address r, uint256 a) {
            if (r == address(0) || a == 0) return (address(0), 0);
            uint256 cap = gross * MAX_ROYALTY_BPS / 10_000;
            return (r, a > cap ? cap : a);
        } catch { return (address(0), 0); }
    }
    function _royaltyView(address coll, uint256 gross) internal view returns (address to, uint256 amt) {
        return _royalty(coll, 0, gross);
    }

    function _splitToll(address quote_, uint256 toll) internal {
        if (toll == 0) return;
        uint256 toPool = toll * POOL_SHARE / 100;
        _payStrict(quote_, IHubB(hub).pool(), toPool);
        _payStrict(quote_, IHubB(hub).treasury(), toll - toPool);
    }

    function _payStrict(address quote_, address to, uint256 amt) internal {
        if (amt == 0) return;
        if (quote_ == address(0)) {
            (bool ok,) = to.call{value: amt}(""); require(ok, "pay.e");
        } else {
            require(IERC20(quote_).transfer(to, amt), "pay.t");
        }
    }

    function _payLenient(address quote_, address to, uint256 amt) internal returns (bool) {
        if (amt == 0) return true;
        if (quote_ == address(0)) {
            (bool ok,) = to.call{value: amt}("");
            return ok;
        }
        (bool s, bytes memory ret) = quote_.call(abi.encodeCall(IERC20.transfer, (to, amt)));
        return s && (ret.length == 0 || abi.decode(ret, (bool)));
    }

    /// @dev index the deposit so the bag renders; never let a full bag
    ///      rack (MAX_BAGS) brick a swap.
    function _ack(address vault, address quote_) internal {
        if (quote_ == address(0)) return;
        try IVaultAck(vault).acknowledge(quote_) {} catch {}
    }

    function _add128(uint128 a, uint256 b) internal pure returns (uint128) {
        uint256 c = uint256(a) + b;
        if (c > type(uint128).max) revert Overflow();
        return uint128(c);
    }

    receive() external payable {}
}
