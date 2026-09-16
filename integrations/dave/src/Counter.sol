// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./lib/Interfaces.sol";

interface IHubN {
    function ownerOf(uint256 id) external view returns (address);
    function vaultOf(uint256 id) external view returns (address);
    function pool() external view returns (address);
    function treasury() external view returns (address);
}
interface IVaultViewsN { function unlockAt() external view returns (uint64); }
interface IVaultAckN { function acknowledge(address t) external; }
interface IERC721N {
    function transferFrom(address from, address to, uint256 id) external;
    function safeTransferFrom(address from, address to, uint256 id) external;
}
/// @dev ERC-3156-shaped borrower callback.
interface IFlashBorrower {
    function onFlashLoan(
        address initiator, address token, uint256 amount, uint256 fee, bytes calldata data
    ) external returns (bytes32);
}

/// @title Counter — Codicil XV. The credit desk. Conviction is collateral.
///
/// @notice Two kinds of credit, both bearer-kept:
///
///         THE TILL — flash credit. A bearer opens a TILL of quote
///         liquidity; anyone may flash-borrow the whole of it, provided
///         every unit returns plus the fee within the transaction. The
///         flash loan is the covenant's native credit instrument: the
///         capital leaves and returns atomically, so it never truly
///         exits — lending with zero exit risk. Fees compound in the
///         till (the Dave is the lender); the toll — 0.42% of the fee,
///         69/31 — rides every flash. Till exits are VAULT-WARD, frozen
///         by THE BOND, tolled 4.20% on FREE liquidity at ragequit
///         (never below principal out on loan).
///
///         THE PAWN — whole-Dave credit. A borrower pledges their ENTIRE
///         Dave — the token itself, bags, venues, temper and all — into
///         escrow, and names terms: principal, a flat fee, a term. The
///         till's bearer reads the collateral like a ledger (the bags
///         are public, the temper is a credit history engraved on-chain)
///         and accepts or does not. While pawned, the Dave is INERT: it
///         answers to no bearer — no venue op, no ragequit, no exit.
///         Repay by the due date and it returns whole. Default, and the
///         Dave FORFEITS INTO THE LENDER'S VAULT — the covenant keeps
///         what its debtors abandon. No oracle prices the collateral;
///         two bearers do, the way credit was always priced.
///
/// @dev    Interest is a flat fee for the term (pawn-desk convention).
///         Flash borrower must return `keccak256("Counter.flash")`.
///         Fee-on-transfer quote unsupported. ERC-20 quote only.
contract Counter {
    // ─── constants ────────────────────────────────────────────────────
    uint16  public constant TOLL_BPS      = 42;     // of flash fee / pawn fee
    uint16  public constant POOL_SHARE    = 69;
    uint16  public constant RAGE_BPS      = 420;
    uint16  public constant MAX_FLASH_BPS = 100;    // flash fee ≤ 1%
    uint16  public constant MAX_PAWN_BPS  = 5_000;  // flat fee ≤ 50%
    uint32  public constant MAX_TERM      = 365 days;
    bytes32 public constant FLASH_ACK     = keccak256("Counter.flash");

    address public immutable hub;

    // ─── tills ────────────────────────────────────────────────────────
    struct Till {
        uint64  daveId;
        bool    closed;
        uint16  flashFeeBps;
        uint64  bondUntil;      // 0 = unbonded
        address quote;          // ERC-20 only
        uint128 liquidity;      // in the drawer
        uint128 onLoan;         // pawn principal outstanding
    }
    // ─── pawns ────────────────────────────────────────────────────────
    struct Pawn {
        uint64  tillId;
        uint64  collateralDave;
        address borrower;
        uint8   state;          // 0 none, 1 proposed, 2 live, 3 repaid, 4 seized, 5 canceled
        uint64  dueAt;
        uint32  term;
        uint16  feeBps;         // flat, on principal
        uint128 principal;
    }

    Till[] public tills;
    Pawn[] public pawns;
    mapping(uint256 => uint256[]) private _tillsOf;   // daveId => tillIds
    mapping(uint256 => uint256[]) private _pawnsOf;   // tillId => pawnIds

    uint256 private _lock = 1;

    // ─── errors / events ─────────────────────────────────────────────
    error NotBearer(); error NotBorrower(); error NotHub(); error Closed_();
    error BondHolds(); error NotSealed(); error RatchetOnly(); error Params();
    error Empty(); error TillDry(); error FlashFail(); error WrongState();
    error NotDue(); error PastDue(); error LoansLive(); error Overflow();
    error Reentry();

    event TillOpened(uint256 indexed tillId, uint256 indexed daveId, address quote, uint16 flashFeeBps);
    event TillFunded(uint256 indexed tillId, uint256 amount);
    event TillDrawn(uint256 indexed tillId, uint256 amount);
    event Bonded(uint256 indexed tillId, uint64 bondUntil);
    event TillClosed(uint256 indexed tillId);
    event Flashed(uint256 indexed tillId, address indexed borrower, uint256 amount, uint256 fee);
    event PawnProposed(uint256 indexed pawnId, uint256 indexed tillId, uint256 indexed collateralDave, uint128 principal, uint16 feeBps, uint32 term);
    event PawnCanceled(uint256 indexed pawnId);
    event PawnAccepted(uint256 indexed pawnId, uint64 dueAt);
    event PawnRepaid(uint256 indexed pawnId, uint256 paid);
    event PawnSeized(uint256 indexed pawnId);
    event RagequitToll(uint256 indexed tillId, uint256 tax);

    constructor(address hub_) { hub = hub_; }

    modifier nonReentrant() { if (_lock != 1) revert Reentry(); _lock = 2; _; _lock = 1; }
    modifier onlyBearer(uint256 tillId) {
        if (msg.sender != IHubN(hub).ownerOf(tills[tillId].daveId)) revert NotBearer();
        _;
    }

    // ─── keeping a till (the bearer) ─────────────────────────────────
    function openTill(uint256 daveId, address quote_, uint16 flashFeeBps)
        external returns (uint256 tillId)
    {
        if (msg.sender != IHubN(hub).ownerOf(daveId)) revert NotBearer();
        if (quote_ == address(0) || flashFeeBps > MAX_FLASH_BPS) revert Params();
        tillId = tills.length;
        Till memory t;
        t.daveId = uint64(daveId); t.quote = quote_; t.flashFeeBps = flashFeeBps;
        tills.push(t);
        _tillsOf[daveId].push(tillId);
        emit TillOpened(tillId, daveId, quote_, flashFeeBps);
    }

    /// @notice fill the drawer. Additive: allowed even while bonded, and
    ///         open to any payer (a sealed vault funds through the
    ///         Chambers; the till is a venue).
    function fundTill(uint256 tillId, uint256 amount) external nonReentrant {
        Till storage t = tills[tillId];
        if (t.closed) revert Closed_();
        if (amount == 0) revert Empty();
        require(IERC20(t.quote).transferFrom(msg.sender, address(this), amount), "pull");
        t.liquidity = _add128(t.liquidity, amount);
        emit TillFunded(tillId, amount);
    }

    /// @notice draw the drawer — INTO THE VAULT. Only past the bond;
    ///         principal out on pawn cannot be drawn.
    function drawTill(uint256 tillId, uint256 amount)
        external nonReentrant onlyBearer(tillId)
    {
        Till storage t = tills[tillId];
        if (_bonded(t)) revert BondHolds();
        if (amount == 0 || amount > t.liquidity) revert TillDry();
        t.liquidity -= uint128(amount);
        address vault = IHubN(hub).vaultOf(t.daveId);
        require(IERC20(t.quote).transfer(vault, amount), "pay");
        _ack(vault, t.quote);
        emit TillDrawn(tillId, amount);
    }

    function bond(uint256 tillId) external onlyBearer(tillId) {
        Till storage t = tills[tillId];
        if (t.closed) revert Closed_();
        uint64 u = IVaultViewsN(IHubN(hub).vaultOf(t.daveId)).unlockAt();
        if (u <= uint64(block.timestamp)) revert NotSealed();
        if (u <= t.bondUntil) revert RatchetOnly();
        t.bondUntil = u;
        emit Bonded(tillId, u);
    }

    /// @notice fold the till. Drawer — INTO THE VAULT. No live pawns.
    function closeTill(uint256 tillId)
        external nonReentrant onlyBearer(tillId)
    {
        Till storage t = tills[tillId];
        if (t.closed) revert Closed_();
        if (_bonded(t)) revert BondHolds();
        if (t.onLoan != 0) revert LoansLive();
        t.closed = true;
        uint256 amt = t.liquidity; t.liquidity = 0;
        if (amt > 0) {
            address vault = IHubN(hub).vaultOf(t.daveId);
            require(IERC20(t.quote).transfer(vault, amt), "pay");
            _ack(vault, t.quote);
        }
        emit TillClosed(tillId);
    }

    // ─── the flash (anyone, atomically) ──────────────────────────────
    /// @notice borrow the drawer; return it plus the fee before the
    ///         transaction ends. Capital that returns never left — the
    ///         seal-native loan. Fee compounds in the till less the toll.
    function flash(uint256 tillId, uint256 amount, address receiver, bytes calldata data)
        external nonReentrant
    {
        Till storage t = tills[tillId];
        if (t.closed) revert Closed_();
        if (amount == 0 || amount > t.liquidity) revert TillDry();
        uint256 fee = amount * t.flashFeeBps / 10_000;

        uint256 pre = IERC20(t.quote).balanceOf(address(this));
        require(IERC20(t.quote).transfer(receiver, amount), "lend");
        if (
            IFlashBorrower(receiver).onFlashLoan(msg.sender, t.quote, amount, fee, data)
            != FLASH_ACK
        ) revert FlashFail();
        require(IERC20(t.quote).transferFrom(receiver, address(this), amount + fee), "repay");
        if (IERC20(t.quote).balanceOf(address(this)) < pre + fee) revert FlashFail();

        uint256 toll = fee * TOLL_BPS / 10_000;
        _splitToll(t.quote, toll);
        t.liquidity = _add128(t.liquidity, fee - toll);
        emit Flashed(tillId, msg.sender, amount, fee);
    }

    // ─── the pawn (two bearers, no oracle) ───────────────────────────
    /// @notice pledge your WHOLE Dave and name your terms. The token
    ///         moves into escrow now; while escrowed it is inert.
    function proposePawn(
        uint256 tillId, uint256 collateralDave,
        uint128 principal, uint16 feeBps, uint32 term
    ) external nonReentrant returns (uint256 pawnId) {
        Till storage t = tills[tillId];
        if (t.closed) revert Closed_();
        if (msg.sender != IHubN(hub).ownerOf(collateralDave)) revert NotBearer();
        if (principal == 0 || feeBps > MAX_PAWN_BPS || term == 0 || term > MAX_TERM) revert Params();
        IERC721N(hub).transferFrom(msg.sender, address(this), collateralDave);
        pawnId = pawns.length;
        pawns.push(Pawn({
            tillId: uint64(tillId), collateralDave: uint64(collateralDave),
            borrower: msg.sender, state: 1, dueAt: 0,
            term: term, feeBps: feeBps, principal: principal
        }));
        _pawnsOf[tillId].push(pawnId);
        emit PawnProposed(pawnId, tillId, collateralDave, principal, feeBps, term);
    }

    /// @notice unpledge an unaccepted proposal; the Dave walks home.
    function cancelPawn(uint256 pawnId) external nonReentrant {
        Pawn storage p = pawns[pawnId];
        if (msg.sender != p.borrower) revert NotBorrower();
        if (p.state != 1) revert WrongState();
        p.state = 5;
        IERC721N(hub).safeTransferFrom(address(this), p.borrower, p.collateralDave);
        emit PawnCanceled(pawnId);
    }

    /// @notice the till's bearer underwrites: reads the bags, reads the
    ///         temper, takes the terms. Principal leaves the drawer; the
    ///         toll rides the flat fee's promise at origination.
    function acceptPawn(uint256 pawnId) external nonReentrant {
        Pawn storage p = pawns[pawnId];
        Till storage t = tills[p.tillId];
        if (msg.sender != IHubN(hub).ownerOf(t.daveId)) revert NotBearer();
        if (p.state != 1) revert WrongState();
        if (t.closed) revert Closed_();
        if (p.principal > t.liquidity) revert TillDry();
        p.state = 2;
        p.dueAt = uint64(block.timestamp) + p.term;
        t.liquidity -= p.principal;
        t.onLoan = _add128(t.onLoan, p.principal);
        require(IERC20(t.quote).transfer(p.borrower, p.principal), "lend");
        emit PawnAccepted(pawnId, p.dueAt);
    }

    /// @notice repay principal + flat fee by the due date; the Dave
    ///         returns whole. Fee compounds in the till less the toll.
    function repay(uint256 pawnId) external nonReentrant {
        Pawn storage p = pawns[pawnId];
        Till storage t = tills[p.tillId];
        if (msg.sender != p.borrower) revert NotBorrower();
        if (p.state != 2) revert WrongState();
        if (block.timestamp > p.dueAt) revert PastDue();
        uint256 fee = uint256(p.principal) * p.feeBps / 10_000;
        uint256 owed = p.principal + fee;
        p.state = 3;
        require(IERC20(t.quote).transferFrom(msg.sender, address(this), owed), "pull");
        uint256 toll = fee * TOLL_BPS / 10_000;
        _splitToll(t.quote, toll);
        t.onLoan -= p.principal;
        t.liquidity = _add128(t.liquidity, owed - toll);
        IERC721N(hub).safeTransferFrom(address(this), p.borrower, p.collateralDave);
        emit PawnRepaid(pawnId, owed);
    }

    /// @notice past due, the Dave forfeits — INTO THE LENDER'S VAULT.
    ///         The covenant keeps what its debtors abandon.
    function seize(uint256 pawnId) external nonReentrant {
        Pawn storage p = pawns[pawnId];
        Till storage t = tills[p.tillId];
        if (msg.sender != IHubN(hub).ownerOf(t.daveId)) revert NotBearer();
        if (p.state != 2) revert WrongState();
        if (block.timestamp <= p.dueAt) revert NotDue();
        p.state = 4;
        t.onLoan -= p.principal;                              // written off; paper taken
        IERC721N(hub).safeTransferFrom(
            address(this), IHubN(hub).vaultOf(t.daveId), p.collateralDave
        );
        emit PawnSeized(pawnId);
    }

    // ─── Law III at the desk: the hub hook ───────────────────────────
    /// @notice ragequit tolls FREE liquidity only — the drawer, never
    ///         principal out on loan — 4.20%, 69/31.
    function onRagequit(uint256 daveId) external {
        if (msg.sender != hub) revert NotHub();
        uint256[] storage ids = _tillsOf[daveId];
        for (uint256 i; i < ids.length; ++i) {
            Till storage t = tills[ids[i]];
            if (t.closed || !_bonded(t)) continue;
            uint256 tax = uint256(t.liquidity) * RAGE_BPS / 10_000;
            if (tax == 0) continue;
            t.liquidity -= uint128(tax);
            uint256 toPool = tax * POOL_SHARE / 100;
            _payLenient(t, toPool, IHubN(hub).pool());
            _payLenient(t, tax - toPool, IHubN(hub).treasury());
            emit RagequitToll(ids[i], tax);
        }
    }

    // ─── views ────────────────────────────────────────────────────────
    function flashFee(uint256 tillId, uint256 amount) external view returns (uint256) {
        return amount * tills[tillId].flashFeeBps / 10_000;
    }
    function pawnOwed(uint256 pawnId) external view returns (uint256) {
        Pawn storage p = pawns[pawnId];
        return uint256(p.principal) + uint256(p.principal) * p.feeBps / 10_000;
    }
    function tillsOf(uint256 daveId) external view returns (uint256[] memory) { return _tillsOf[daveId]; }
    function pawnsOf(uint256 tillId) external view returns (uint256[] memory) { return _pawnsOf[tillId]; }
    function tillsLength() external view returns (uint256) { return tills.length; }
    function pawnsLength() external view returns (uint256) { return pawns.length; }
    function bondedNow(uint256 tillId) external view returns (bool) { return _bonded(tills[tillId]); }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // ─── plumbing ─────────────────────────────────────────────────────
    function _bonded(Till storage t) internal view returns (bool) {
        return t.bondUntil > uint64(block.timestamp);
    }
    function _splitToll(address token, uint256 toll) internal {
        if (toll == 0) return;
        uint256 toPool = toll * POOL_SHARE / 100;
        require(IERC20(token).transfer(IHubN(hub).pool(), toPool), "toll");
        require(IERC20(token).transfer(IHubN(hub).treasury(), toll - toPool), "toll");
    }
    function _payLenient(Till storage t, uint256 amt, address to) internal {
        if (amt == 0) return;
        try IERC20(t.quote).transfer(to, amt) returns (bool ok) {
            if (!ok) t.liquidity = _add128(t.liquidity, amt);
        } catch { t.liquidity = _add128(t.liquidity, amt); }
    }
    function _ack(address vault, address token) internal {
        try IVaultAckN(vault).acknowledge(token) {} catch {}
    }
    function _add128(uint128 a, uint256 b) internal pure returns (uint128) {
        uint256 c = uint256(a) + b;
        if (c > type(uint128).max) revert Overflow();
        return uint128(c);
    }
}
