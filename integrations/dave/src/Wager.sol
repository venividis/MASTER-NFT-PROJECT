// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./lib/Interfaces.sol";

interface IHubG {
    function ownerOf(uint256 id) external view returns (address);
    function vaultOf(uint256 id) external view returns (address);
    function pool() external view returns (address);
    function treasury() external view returns (address);
}
interface IVaultViewsG { function unlockAt() external view returns (uint64); }
interface IVaultAckG { function acknowledge(address t) external; }

/// @title Wager — Codicil XIV. Binary event books. The vault is the bookmaker.
///
/// @notice Yes or no, priced in cents on the dollar — the oldest market
///         there is, and the parent house's fastest-growing line. Here it
///         is a bearer instrument: a Dave opens a BOOK on any resolvable
///         question, quotes its own odds, and takes every ticket against
///         its own backing. Sell the Dave, sell the book.
///
///         MECHANICS. A ticket pays UNIT (1e18 quote) if its side wins,
///         zero if it loses. The bearer quotes pYes in bps; NO is priced
///         at the complement. Odds may move until closeTime; after that
///         the book is frozen and awaits its RESOLVER — an address the
///         bearer named at opening (an oracle adapter, an optimistic
///         settlement contract, a trusted judge; the buyer can read
///         exactly who judges before buying a single ticket).
///
///         SOLVENCY BY CONSTRUCTION: at every sale, backing + premiums
///         collected must cover the worst-case side in full — the house
///         can never sell a ticket it cannot pay. Backing never leaves
///         while tickets are outstanding: the house cannot run mid-wager.
///
///         VOID IS A REFUND, NEVER A RUG: if the resolver misses its
///         resolveBy deadline, anyone may void the book and every ticket
///         refunds at its purchase cost. The judge failing to show pays
///         the bettors, not the house.
///
///         THE ESCHEAT: winners have ESCHEAT_DAYS to claim; unclaimed
///         purses then fall to the house — INTO THE VAULT, as everything
///         does. The covenant doctrines hold: exits vault-ward only, the
///         bond ratchets and freezes them, ragequit tolls only FREE
///         backing (never below worst-case liability), and the toll —
///         0.42%, 69/31 — rides every premium.
contract Wager {
    // ─── constants ────────────────────────────────────────────────────
    uint8   public constant YES = 1;
    uint8   public constant NO  = 2;
    uint8   public constant VOID = 3;

    uint16  public constant TOLL_BPS   = 42;
    uint16  public constant POOL_SHARE = 69;
    uint16  public constant RAGE_BPS   = 420;
    uint256 public constant UNIT       = 1e18;      // payout per ticket
    uint32  public constant ESCHEAT    = 90 days;

    address public immutable hub;

    // ─── books ────────────────────────────────────────────────────────
    struct Book {
        uint64  daveId;
        uint8   outcome;        // 0 = open/unresolved, else YES/NO/VOID
        bool    closed;         // folded by bearer (only while ticketless)
        uint16  pYesBps;        // 100..9900
        uint64  closeTime;      // sales stop
        uint64  resolveBy;      // past this, anyone may void
        uint64  resolvedAt;
        address quote;          // ERC-20 or address(0) = ETH
        address resolver;       // sole judge
        uint128 backing;
        uint128 collected;      // premiums held
        uint128 yesTickets;
        uint128 noTickets;
        uint128 purse;          // set at resolution; winners draw from it
    }

    Book[] public books;
    mapping(uint256 => mapping(address => uint128)) public yesOf;
    mapping(uint256 => mapping(address => uint128)) public noOf;
    mapping(uint256 => mapping(address => uint128)) public costYesOf;   // for void refunds
    mapping(uint256 => mapping(address => uint128)) public costNoOf;
    mapping(uint256 => uint256[]) private _booksOf;                     // daveId => bookIds

    uint256 private _lock = 1;

    // ─── errors / events ─────────────────────────────────────────────
    error NotBearer(); error NotHub(); error NotResolver(); error Closed_();
    error BondHolds(); error NotSealed(); error RatchetOnly(); error Params();
    error Empty(); error SalesOver(); error SalesLive(); error OverBook();
    error Slippage(); error Unresolved(); error Resolved_(); error NothingOwed();
    error TooEarly(); error TicketsLive(); error EthMismatch(); error Overflow();
    error Reentry();

    event BookOpened(uint256 indexed bookId, uint256 indexed daveId, address quote, address resolver, uint64 closeTime, uint64 resolveBy, uint16 pYesBps);
    event Backed(uint256 indexed bookId, uint256 amount, bool added);
    event Priced(uint256 indexed bookId, uint16 pYesBps);
    event Bonded(uint256 indexed bookId, uint64 bondUntil_);
    event TicketsBought(uint256 indexed bookId, address indexed trader, uint8 side, uint256 n, uint256 cost);
    event ResolvedBook(uint256 indexed bookId, uint8 outcome);
    event Claimed(uint256 indexed bookId, address indexed trader, uint256 amount);
    event Escheated(uint256 indexed bookId, uint256 amount);
    event BookClosed(uint256 indexed bookId);
    event RagequitToll(uint256 indexed bookId, uint256 tax);

    mapping(uint256 => uint64) public bondUntil;    // bookId => 0 = unbonded

    constructor(address hub_) { hub = hub_; }
    receive() external payable {}

    modifier nonReentrant() { if (_lock != 1) revert Reentry(); _lock = 2; _; _lock = 1; }
    modifier onlyBearer(uint256 bookId) {
        if (msg.sender != IHubG(hub).ownerOf(books[bookId].daveId)) revert NotBearer();
        _;
    }

    // ─── keeping a book (the bearer) ─────────────────────────────────
    function openBook(
        uint256 daveId, address quote_, address resolver_,
        uint64 closeTime_, uint64 resolveBy_, uint16 pYesBps_
    ) external returns (uint256 bookId) {
        if (msg.sender != IHubG(hub).ownerOf(daveId)) revert NotBearer();
        if (resolver_ == address(0)) revert Params();
        if (closeTime_ <= block.timestamp || resolveBy_ <= closeTime_) revert Params();
        if (pYesBps_ < 100 || pYesBps_ > 9_900) revert Params();
        bookId = books.length;
        Book memory b;
        b.daveId = uint64(daveId);
        b.quote = quote_; b.resolver = resolver_;
        b.closeTime = closeTime_; b.resolveBy = resolveBy_;
        b.pYesBps = pYesBps_;
        books.push(b);
        _booksOf[daveId].push(bookId);
        emit BookOpened(bookId, daveId, quote_, resolver_, closeTime_, resolveBy_, pYesBps_);
    }

    /// @notice back the book. Additive: allowed even while bonded.
    function fundBacking(uint256 bookId, uint256 amount)
        external payable nonReentrant onlyBearer(bookId)
    {
        Book storage b = books[bookId];
        if (b.closed || b.outcome != 0) revert Closed_();
        if (amount == 0) revert Empty();
        _pullIn(b.quote, amount);
        b.backing = _add128(b.backing, amount);
        emit Backed(bookId, amount, true);
    }

    /// @notice withdraw backing — INTO THE VAULT. Only past the bond,
    ///         only what solvency spares. The house cannot run mid-wager.
    function withdrawBacking(uint256 bookId, uint256 amount)
        external nonReentrant onlyBearer(bookId)
    {
        Book storage b = books[bookId];
        if (_bonded(bookId)) revert BondHolds();
        if (b.outcome != 0) revert Resolved_();               // post-resolution: sweep path only
        if (amount == 0 || amount > b.backing) revert Empty();
        uint256 worst = _worstCase(b);
        if (uint256(b.backing) - amount + b.collected < worst) revert OverBook();
        b.backing -= uint128(amount);
        address vault = IHubG(hub).vaultOf(b.daveId);
        _payStrict(b.quote, vault, amount);
        _ack(vault, b.quote);
        emit Backed(bookId, amount, false);
    }

    /// @notice re-quote the odds. Frozen once sales close, and while bonded
    ///         only additive ops stand — a bonded book's odds are its word.
    function setPrice(uint256 bookId, uint16 pYesBps_)
        external onlyBearer(bookId)
    {
        Book storage b = books[bookId];
        if (b.closed || b.outcome != 0) revert Closed_();
        if (_bonded(bookId)) revert BondHolds();
        if (block.timestamp >= b.closeTime) revert SalesOver();
        if (pYesBps_ < 100 || pYesBps_ > 9_900) revert Params();
        b.pYesBps = pYesBps_;
        emit Priced(bookId, pYesBps_);
    }

    /// @notice bond the book to the Dave's seal. Ratchet-only. Survives
    ///         ragequit.
    function bond(uint256 bookId) external onlyBearer(bookId) {
        Book storage b = books[bookId];
        if (b.closed) revert Closed_();
        uint64 u = IVaultViewsG(IHubG(hub).vaultOf(b.daveId)).unlockAt();
        if (u <= uint64(block.timestamp)) revert NotSealed();
        if (u <= bondUntil[bookId]) revert RatchetOnly();
        bondUntil[bookId] = u;
        emit Bonded(bookId, u);
    }

    /// @notice fold an untouched book. Backing — INTO THE VAULT.
    function closeBook(uint256 bookId)
        external nonReentrant onlyBearer(bookId)
    {
        Book storage b = books[bookId];
        if (b.closed || b.outcome != 0) revert Closed_();
        if (b.yesTickets != 0 || b.noTickets != 0) revert TicketsLive();
        if (_bonded(bookId)) revert BondHolds();
        b.closed = true;
        uint256 amt = b.backing; b.backing = 0;
        if (amt > 0) {
            address vault = IHubG(hub).vaultOf(b.daveId);
            _payStrict(b.quote, vault, amt);
            _ack(vault, b.quote);
        }
        emit BookClosed(bookId);
    }

    // ─── the window (anyone) ─────────────────────────────────────────
    /// @notice buy tickets. Cost = n × price + toll. At every sale the
    ///         house must cover the worst case in full.
    function buy(uint256 bookId, uint8 side, uint256 n, uint256 maxCost)
        external payable nonReentrant
    {
        Book storage b = books[bookId];
        if (b.closed || b.outcome != 0) revert Closed_();
        if (block.timestamp >= b.closeTime) revert SalesOver();
        if (n == 0 || (side != YES && side != NO)) revert Empty();

        uint256 px = side == YES ? uint256(b.pYesBps) : 10_000 - b.pYesBps;
        uint256 premium = n * UNIT * px / 10_000;
        uint256 toll = premium * TOLL_BPS / 10_000;
        uint256 cost = premium + toll;
        if (cost > maxCost) revert Slippage();

        // solvency fence BEFORE the money moves
        if (side == YES) b.yesTickets = _add128(b.yesTickets, n);
        else             b.noTickets  = _add128(b.noTickets, n);
        b.collected = _add128(b.collected, premium);
        if (uint256(b.backing) + b.collected < _worstCase(b)) revert OverBook();

        if (side == YES) {
            yesOf[bookId][msg.sender] = _add128(yesOf[bookId][msg.sender], n);
            costYesOf[bookId][msg.sender] = _add128(costYesOf[bookId][msg.sender], premium);
        } else {
            noOf[bookId][msg.sender] = _add128(noOf[bookId][msg.sender], n);
            costNoOf[bookId][msg.sender] = _add128(costNoOf[bookId][msg.sender], premium);
        }

        _pullIn(b.quote, cost);
        _splitToll(b.quote, toll);
        emit TicketsBought(bookId, msg.sender, side, n, cost);
    }

    // ─── judgment ─────────────────────────────────────────────────────
    /// @notice the named judge rules, once, after sales close.
    function resolve(uint256 bookId, uint8 outcome_) external {
        Book storage b = books[bookId];
        if (msg.sender != b.resolver) revert NotResolver();
        if (b.outcome != 0 || b.closed) revert Resolved_();
        if (block.timestamp < b.closeTime) revert SalesLive();
        if (outcome_ != YES && outcome_ != NO && outcome_ != VOID) revert Params();
        _settle(b, bookId, outcome_);
    }

    /// @notice a judge who misses the deadline pays the bettors: anyone
    ///         may void, and every ticket refunds at cost.
    function voidExpired(uint256 bookId) external {
        Book storage b = books[bookId];
        if (b.outcome != 0 || b.closed) revert Resolved_();
        if (block.timestamp <= b.resolveBy) revert TooEarly();
        _settle(b, bookId, VOID);
    }

    function _settle(Book storage b, uint256 bookId, uint8 outcome_) internal {
        b.outcome = outcome_;
        b.resolvedAt = uint64(block.timestamp);
        b.purse = _add128(0, uint256(b.backing) + b.collected);
        b.backing = 0; b.collected = 0;
        emit ResolvedBook(bookId, outcome_);
    }

    /// @notice winners draw UNIT per ticket; a void draws cost back.
    function claim(uint256 bookId) external nonReentrant returns (uint256 owed) {
        Book storage b = books[bookId];
        if (b.outcome == 0) revert Unresolved();
        if (b.outcome == YES) {
            uint128 n = yesOf[bookId][msg.sender];
            yesOf[bookId][msg.sender] = 0;
            owed = uint256(n) * UNIT;
        } else if (b.outcome == NO) {
            uint128 n = noOf[bookId][msg.sender];
            noOf[bookId][msg.sender] = 0;
            owed = uint256(n) * UNIT;
        } else {
            owed = uint256(costYesOf[bookId][msg.sender]) + costNoOf[bookId][msg.sender];
            costYesOf[bookId][msg.sender] = 0;
            costNoOf[bookId][msg.sender] = 0;
        }
        if (owed == 0) revert NothingOwed();
        if (owed > b.purse) owed = b.purse;                   // dust-rounding fence
        b.purse -= uint128(owed);
        _payStrict(b.quote, msg.sender, owed);
        emit Claimed(bookId, msg.sender, owed);
    }

    /// @notice after the escheat window, the unclaimed purse falls to the
    ///         house — INTO THE VAULT.
    function sweep(uint256 bookId) external nonReentrant onlyBearer(bookId) {
        Book storage b = books[bookId];
        if (b.outcome == 0) revert Unresolved();
        if (block.timestamp < uint256(b.resolvedAt) + ESCHEAT) revert TooEarly();
        uint256 amt = b.purse; b.purse = 0;
        if (amt == 0) revert NothingOwed();
        address vault = IHubG(hub).vaultOf(b.daveId);
        _payStrict(b.quote, vault, amt);
        _ack(vault, b.quote);
        emit Escheated(bookId, amt);
    }

    // ─── Law III at the window: the hub hook ─────────────────────────
    /// @notice ragequit tolls FREE backing only — backing beyond the
    ///         worst-case book — 4.20%, 69/31. Never below the book.
    function onRagequit(uint256 daveId) external {
        if (msg.sender != hub) revert NotHub();
        uint256[] storage ids = _booksOf[daveId];
        for (uint256 i; i < ids.length; ++i) {
            Book storage b = books[ids[i]];
            if (b.closed || b.outcome != 0 || !_bonded(ids[i])) continue;
            uint256 worst = _worstCase(b);
            uint256 covered = uint256(b.backing) + b.collected;
            if (covered <= worst) continue;
            uint256 free = covered - worst;
            if (free > b.backing) free = b.backing;           // only backing is the house's to toll
            uint256 tax = free * RAGE_BPS / 10_000;
            if (tax == 0) continue;
            b.backing -= uint128(tax);
            uint256 toPool = tax * POOL_SHARE / 100;
            _payLenient(b, toPool, IHubG(hub).pool());
            _payLenient(b, tax - toPool, IHubG(hub).treasury());
            emit RagequitToll(ids[i], tax);
        }
    }

    // ─── views ────────────────────────────────────────────────────────
    function quoteCost(uint256 bookId, uint8 side, uint256 n) external view returns (uint256) {
        Book storage b = books[bookId];
        uint256 px = side == YES ? uint256(b.pYesBps) : 10_000 - b.pYesBps;
        uint256 premium = n * UNIT * px / 10_000;
        return premium + premium * TOLL_BPS / 10_000;
    }
    function worstCase(uint256 bookId) external view returns (uint256) { return _worstCase(books[bookId]); }
    function booksOf(uint256 daveId) external view returns (uint256[] memory) { return _booksOf[daveId]; }
    function booksLength() external view returns (uint256) { return books.length; }
    function bondedNow(uint256 bookId) external view returns (bool) { return _bonded(bookId); }

    // ─── plumbing ─────────────────────────────────────────────────────
    function _worstCase(Book storage b) internal view returns (uint256) {
        uint256 side = b.yesTickets > b.noTickets ? b.yesTickets : b.noTickets;
        return side * UNIT;
    }
    function _bonded(uint256 bookId) internal view returns (bool) {
        return bondUntil[bookId] > uint64(block.timestamp);
    }
    function _pullIn(address token, uint256 amount) internal {
        if (token == address(0)) {
            if (msg.value != amount) revert EthMismatch();
        } else {
            if (msg.value != 0) revert EthMismatch();
            require(IERC20(token).transferFrom(msg.sender, address(this), amount), "pull");
        }
    }
    function _splitToll(address token, uint256 toll) internal {
        if (toll == 0) return;
        uint256 toPool = toll * POOL_SHARE / 100;
        _payStrict(token, IHubG(hub).pool(), toPool);
        _payStrict(token, IHubG(hub).treasury(), toll - toPool);
    }
    function _payStrict(address token, address to, uint256 amt) internal {
        if (amt == 0) return;
        if (token == address(0)) {
            (bool ok,) = to.call{value: amt}(""); require(ok, "eth");
        } else {
            require(IERC20(token).transfer(to, amt), "erc20");
        }
    }
    function _payLenient(Book storage b, uint256 amt, address to) internal {
        if (amt == 0) return;
        if (b.quote == address(0)) {
            (bool ok,) = to.call{value: amt}("");
            if (!ok) b.backing = _add128(b.backing, amt);
        } else {
            try IERC20(b.quote).transfer(to, amt) returns (bool ok) {
                if (!ok) b.backing = _add128(b.backing, amt);
            } catch { b.backing = _add128(b.backing, amt); }
        }
    }
    function _ack(address vault, address token) internal {
        if (token == address(0)) return;
        try IVaultAckG(vault).acknowledge(token) {} catch {}
    }
    function _add128(uint128 a, uint256 bAmt) internal pure returns (uint128) {
        uint256 c = uint256(a) + bAmt;
        if (c > type(uint128).max) revert Overflow();
        return uint128(c);
    }
}
