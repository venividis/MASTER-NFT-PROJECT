// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IHubW {
    function ownerOf(uint256 id) external view returns (address);
    function vaultOf(uint256 id) external view returns (address);
    function pool() external view returns (address);
    function treasury() external view returns (address);
}
interface IBourseW {
    function stalls(uint256 stallId) external view returns (
        uint64 daveId, uint8 curve, uint8 side, bool closed, uint16 feeBps,
        uint64 bondUntil, address collection, address quote,
        uint128 spot, uint128 delta, uint128 quoteBal
    );
}

/// @title Wake — Codicil IX. MEV, cut into a bearer right.
///
/// @notice Every price-moving trade leaves a wake: the stall is now
///         mispriced against every other venue, and the first transaction
///         to land behind it collects the difference. Elsewhere that value
///         leaks to whoever wins a latency race. Here the stall SELLS its
///         own aftermath.
///
///         A bearer ENROLLS a stall. From then on, after any swap, the
///         next N blocks belong to the WAKEKEEPER — only the keeper may
///         trade the stall inside the window. The seat is held on
///         Harberger terms: the keeper names its own price, streams rent
///         against it (4.20% a year — the covenant number), and anyone
///         may seize the seat at the named price, any time. Self-priced,
///         always for sale, never squattable.
///
///         RENT IS VAULT-WARD. The stream pays into the stall's own vault
///         (less the universal 0.42% toll, 69/31). The toll taxed the
///         trade; the wake taxes its echo — a second revenue line on the
///         same volume.
///
///         THE WAKE IS ALSO ARMOR. A sandwich needs its back leg; the
///         back leg now needs the seat. Attackers either cannot close, or
///         must pre-pay the vault for the privilege. The exclusivity that
///         monetizes benign backruns is the same exclusivity that converts
///         attacks into rent — enforced in the venue itself, no relay, no
///         private mempool, no sequencer favors. Day one of any chain.
///
/// @dev    Rent is denominated in ETH regardless of stall quote. A lapsed
///         seat (escrow dry) is open to poke(): anyone may evict, then the
///         floor trades free until the seat is taken again. The keeper's
///         own trades restart the window — the aftermath belongs to the
///         seat for as long as the seat keeps trading it.
contract Wake {
    // ─── constants ────────────────────────────────────────────────────
    uint16  public constant RENT_BPS_YEAR = 420;   // 4.20%/yr of seat price
    uint16  public constant TOLL_BPS      = 42;    // 0.42% of rent
    uint16  public constant POOL_SHARE    = 69;
    uint16  public constant MAX_WINDOW    = 8;     // blocks
    uint32  public constant MIN_TERM      = 1 days;

    address public immutable hub;
    address public immutable bourse;

    struct Seat {
        bool    enrolled;
        uint16  windowBlocks;
        address keeper;        // 0 = vacant
        uint128 price;         // self-assessed, ETH
        uint128 escrow;        // prepaid rent, ETH
        uint64  lastAccrual;
        uint64  lastTradeBlock;
    }
    mapping(uint256 => Seat) public seats;   // stallId => seat

    uint256 private _lock = 1;

    // ─── errors / events ─────────────────────────────────────────────
    error NotBearer(); error NotBourse(); error NotKeeper(); error NotEnrolled();
    error SeatTaken(); error WakeHolds(); error BadWindow(); error ThinEscrow();
    error EthMismatch(); error Reentry(); error ZeroPrice();

    event Enrolled(uint256 indexed stallId, uint16 windowBlocks);
    event Disenrolled(uint256 indexed stallId);
    event Taken(uint256 indexed stallId, address indexed keeper, uint128 price, uint128 escrow);
    event Priced(uint256 indexed stallId, uint128 price);
    event ToppedUp(uint256 indexed stallId, uint128 escrow);
    event Vacated(uint256 indexed stallId);
    event Lapsed(uint256 indexed stallId);
    event RentPaid(uint256 indexed stallId, uint256 toVault, uint256 toll);

    constructor(address hub_, address bourse_) { hub = hub_; bourse = bourse_; }

    modifier nonReentrant() { if (_lock != 1) revert Reentry(); _lock = 2; _; _lock = 1; }

    function _bearerOf(uint256 stallId) internal view returns (address, uint64) {
        (uint64 daveId,,,,,,,,,,) = IBourseW(bourse).stalls(stallId);
        return (IHubW(hub).ownerOf(daveId), daveId);
    }

    // ─── enrollment (the bearer) ─────────────────────────────────────
    function enroll(uint256 stallId, uint16 windowBlocks) external {
        (address bearer,) = _bearerOf(stallId);
        if (msg.sender != bearer) revert NotBearer();
        if (windowBlocks == 0 || windowBlocks > MAX_WINDOW) revert BadWindow();
        Seat storage s = seats[stallId];
        s.enrolled = true;
        s.windowBlocks = windowBlocks;
        emit Enrolled(stallId, windowBlocks);
    }

    /// @dev only when the seat is vacant — a keeper's paid-for right
    ///      cannot be erased under it.
    function disenroll(uint256 stallId) external {
        (address bearer,) = _bearerOf(stallId);
        if (msg.sender != bearer) revert NotBearer();
        Seat storage s = seats[stallId];
        if (s.keeper != address(0)) revert SeatTaken();
        s.enrolled = false;
        emit Disenrolled(stallId);
    }

    // ─── the seat (Harberger) ────────────────────────────────────────
    /// @notice take the seat at the incumbent's named price; name your
    ///         own; prepay rent. msg.value = incumbent price + new escrow.
    function take(uint256 stallId, uint128 newPrice) external payable nonReentrant {
        Seat storage s = seats[stallId];
        if (!s.enrolled) revert NotEnrolled();
        if (newPrice == 0) revert ZeroPrice();
        _accrue(stallId, s);
        uint256 cost = s.keeper != address(0) ? s.price : 0;
        if (msg.value < cost) revert EthMismatch();
        uint128 escrow = uint128(msg.value - cost);
        if (escrow < _rentFor(newPrice, MIN_TERM)) revert ThinEscrow();
        address old = s.keeper;
        uint128 oldEscrow = s.escrow;
        s.keeper = msg.sender;
        s.price = newPrice;
        s.escrow = escrow;
        s.lastAccrual = uint64(block.timestamp);
        if (old != address(0)) {
            (bool ok,) = old.call{value: cost + oldEscrow}(""); require(ok, "payout");
        }
        emit Taken(stallId, msg.sender, newPrice, escrow);
    }

    /// @notice re-assess. Higher price, higher rent; lower price, easier
    ///         to be seized. Honest by construction.
    function setPrice(uint256 stallId, uint128 newPrice) external nonReentrant {
        Seat storage s = seats[stallId];
        if (msg.sender != s.keeper) revert NotKeeper();
        if (newPrice == 0) revert ZeroPrice();
        _accrue(stallId, s);
        if (s.keeper == address(0)) revert NotKeeper();          // lapsed mid-call
        if (s.escrow < _rentFor(newPrice, MIN_TERM)) revert ThinEscrow();
        s.price = newPrice;
        emit Priced(stallId, newPrice);
    }

    function topUp(uint256 stallId) external payable nonReentrant {
        Seat storage s = seats[stallId];
        if (s.keeper == address(0)) revert NotKeeper();
        _accrue(stallId, s);
        s.escrow = uint128(uint256(s.escrow) + msg.value);
        emit ToppedUp(stallId, s.escrow);
    }

    function vacate(uint256 stallId) external nonReentrant {
        Seat storage s = seats[stallId];
        if (msg.sender != s.keeper) revert NotKeeper();
        _accrue(stallId, s);
        uint256 back = s.escrow;
        s.keeper = address(0); s.price = 0; s.escrow = 0;
        if (back > 0) { (bool ok,) = msg.sender.call{value: back}(""); require(ok, "refund"); }
        emit Vacated(stallId);
    }

    /// @notice anyone may bill the seat. A dry escrow lapses the keeper —
    ///         armor cannot be squatted rent-free.
    function poke(uint256 stallId) external nonReentrant {
        _accrue(stallId, seats[stallId]);
    }

    // ─── the gate (the Bourse) ───────────────────────────────────────
    /// @notice called by the Bourse on every swap of an enrolled stall:
    ///         inside a wake, only the keeper passes; every swap restarts
    ///         the wake.
    function checkAndNote(uint256 stallId, address trader) external {
        if (msg.sender != bourse) revert NotBourse();
        Seat storage s = seats[stallId];
        if (!s.enrolled) return;
        if (
            s.keeper != address(0) &&
            s.lastTradeBlock != 0 &&
            block.number <= uint256(s.lastTradeBlock) + s.windowBlocks &&
            trader != s.keeper
        ) revert WakeHolds();
        s.lastTradeBlock = uint64(block.number);
    }

    // ─── views ────────────────────────────────────────────────────────
    function inWake(uint256 stallId) external view returns (bool) {
        Seat storage s = seats[stallId];
        return s.enrolled && s.keeper != address(0) && s.lastTradeBlock != 0
            && block.number <= uint256(s.lastTradeBlock) + s.windowBlocks;
    }

    function rentOwed(uint256 stallId) public view returns (uint256) {
        Seat storage s = seats[stallId];
        if (s.keeper == address(0)) return 0;
        return _rentFor(s.price, uint64(block.timestamp) - s.lastAccrual);
    }

    // ─── plumbing ─────────────────────────────────────────────────────
    function _rentFor(uint128 price, uint256 dt) internal pure returns (uint128) {
        return uint128(uint256(price) * RENT_BPS_YEAR * dt / 10_000 / 365 days);
    }

    /// @dev bill the seat: rent vault-ward less the toll; dry escrow lapses.
    function _accrue(uint256 stallId, Seat storage s) internal {
        if (s.keeper == address(0)) { s.lastAccrual = uint64(block.timestamp); return; }
        uint256 owed = _rentFor(s.price, uint64(block.timestamp) - s.lastAccrual);
        s.lastAccrual = uint64(block.timestamp);
        if (owed == 0) return;
        bool lapse;
        if (owed >= s.escrow) { owed = s.escrow; lapse = true; }
        s.escrow -= uint128(owed);
        if (owed > 0) {
            (, uint64 daveId) = _bearerOf(stallId);
            uint256 toll = owed * TOLL_BPS / 10_000;
            uint256 toPool = toll * POOL_SHARE / 100;
            _pay(IHubW(hub).pool(), toPool);
            _pay(IHubW(hub).treasury(), toll - toPool);
            _pay(IHubW(hub).vaultOf(daveId), owed - toll);
            emit RentPaid(stallId, owed - toll, toll);
        }
        if (lapse) {
            s.keeper = address(0); s.price = 0;
            emit Lapsed(stallId);
        }
    }

    function _pay(address to, uint256 amt) internal {
        if (amt == 0) return;
        (bool ok,) = to.call{value: amt}(""); require(ok, "eth");
    }
}
