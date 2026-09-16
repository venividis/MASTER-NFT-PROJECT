// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Curve} from "./lib/Curve.sol";

interface IIpseity {
    function ownerOf(uint256 id) external view returns (address);
    function sectionOf(uint256 id) external view returns (uint256);
    function userOf(uint256 id) external view returns (address);
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
}

/*═══════════════════════════════════════════════════════════════════════════

  POOL — every token is its own exchange

  One market per token. The holder of token #7 is the sole liquidity
  provider of market #7: they put both sides in, they set the fee, they
  take the fee, and they can take the inventory back out. Anyone at all may
  trade against it.

  Because the right to that inventory is "whoever ownerOf() says", selling
  the NFT sells the market — the reserves, the fee income and the price
  curve go with it in the same transaction, with no migration and no
  wrapper. That is the whole reason this is a separate contract keyed by
  token id rather than a fork of Uniswap with an NFT bolted on.

  The curve comes from the artwork. See lib/Curve.sol: how far the solid
  has been turned out of the holder's 3-space sets how concentrated the
  liquidity is. Committing a rotation re-prices the market, which is why
  every swap takes a minOut and a deadline — see "the holder can move the
  curve" below.

  ── deliberately not built ──

  There are no LP shares. A single provider per market removes share
  accounting, the first-depositor donation attack, and every rounding
  question that comes with dividing a pool between people. It also means
  this cannot aggregate deep liquidity, which is a real limitation and the
  honest cost of the design.

  There is no oracle, no TWAP and no flash loan. A pool whose curve its
  owner can move on demand has no business being read as a price feed by
  anything else, and this contract should not make that mistake easy.

  ── the curve is a copy, not a live read ──

  The obvious thing is for the pool to read sectionOf(id) on every swap, so
  that turning the artwork instantly re-prices the market. That is wrong,
  and the test suite caught it: a token can be rented out under ERC-4907,
  a renter may operate the artwork, and a live read would therefore let a
  renter re-shape a curve holding somebody else's inventory — concentrate
  it, trade through it at the improved rate, and hand the token back.

  So the market keeps its own copy of the section word, and only the holder
  can update it, with syncCurve(). The artwork still sets the shape of the
  market; the holder decides when. pendingCurve() reports when the two have
  drifted apart, so a front end can offer to sync.

  ── the holder can move the curve ──

  Committing a new section changes the pricing. A holder can therefore
  watch a pending swap and re-shape the curve to take more of it. This is
  not preventable in a design where the art and the curve are the same
  numbers — so it is bounded instead: every swap carries a minOut that the
  trader sets, checked after the fact. A trader who sets it is unharmed. A
  trader who passes zero has chosen to be.

  ── THE BOND ──

  "Selling the token sells the market" is mechanically true the moment
  ownerOf changes. It is not, on its own, a promise anyone can rely on: a
  buyer agrees a price for a token holding inventory, and between the
  handshake and the settlement the seller withdraws every asset. The buyer
  gets an empty exchange. Nothing in the accounting is violated.

  So a holder may BOND a market: a timestamp before which no inventory
  leaves and no term is changed. Taken from the Dave Held core, where a
  stall bonds to the covenant's seal and "bondUntil never decreases, and
  no exit path exists while it holds".

  It ratchets. A bond can be extended and never shortened, by anyone,
  including the holder, including through a transfer. That single property
  is what makes it worth anything: a buyer reads bondUntil, sees a date,
  and knows the floor under it cannot move before then — because the only
  operation the contract offers is one that pushes it further away.

  While bonded, only additive operations are allowed. Deposit, yes. Trade,
  yes. Withdraw, close, reprice the fee, re-shape the curve: no. A bond
  that let its maker re-price would promise inventory and deliver a curve
  that hands it away, which is the same rug with extra steps.

  ── the pause ──

  The admin may halt trading and deposits. It may NEVER halt withdrawal,
  and there is no path by which it can move or seize an asset. A pause
  that traps money is not a safety measure, it is a slower theft. The most
  a compromised admin can do here is stop the market working.

  ── this has not been audited ──

  It holds other people's money and it has never been reviewed by anyone.
  See MAX_DEPOSIT and the README.

═══════════════════════════════════════════════════════════════════════════*/
contract Pool {
    using Curve for uint256;

    IIpseity public immutable collection;

    /// @dev A ceiling on what any one market can hold, so an unaudited
    ///      contract cannot quietly accumulate a life-changing amount of
    ///      somebody's money. Raise it only after review.
    uint256 public immutable maxDeposit;

    /// @dev A pool priced against virtual reserves can quote more than it
    ///      holds. Rather than pretend otherwise, no single trade may take
    ///      more than this share of the real outgoing reserve.
    uint256 public constant MAX_OUT_BPS = 5_000;      // half the reserve
    uint256 public constant MAX_FEE_BPS = 500;        // 5%
    /// @dev A bond longer than this is a promise nobody can outlive.
    uint64  public constant MAX_BOND = 365 days;
    uint256 public constant BPS = 10_000;

    struct Market {
        address base;
        address quote;
        uint112 rBase;
        uint112 rQuote;
        uint16  feeBps;
        bool    open;
        /// @dev Ratchet-only. Before this, nothing leaves and no term moves.
        uint64  bondUntil;
        /// @dev A *copy* of the section word, not a live read of it. See
        ///      syncCurve: the artwork drives the curve, but only when the
        ///      holder says so.
        uint256 curveWord;
        /// @dev The anchored virtual reserves. Absolute offsets, set when
        ///      liquidity or the curve changes and never by a trade.
        ///
        ///      These were once derived from the live reserves on every
        ///      quote, which meant the curve re-anchored itself after each
        ///      trade and a round trip could extract the difference. Held
        ///      here instead, the curve stays where the holder put it. See
        ///      Curve.anchor.
        /*  uint128, not uint112. An offset is up to eight times a reserve,
            and a reserve is already a uint112 — so `uint112(rBase * 8)`
            truncates silently for any reserve above MAX_RESERVE/8, and
            Solidity does not revert on an explicit downcast. I could not
            drive a reserve that high through the shipped caps, so this is a
            latent hazard rather than a reproduced bug; a cast that can
            quietly produce a different curve than the one committed is
            worth four bytes to remove rather than an argument to have.    */
        uint128 vBase;
        uint128 vQuote;
    }
    mapping(uint256 => Market) public marketOf;

    /// @notice Lifetime fee income, in each token, for whoever holds the id.
    mapping(uint256 => uint256) public feesBase;
    mapping(uint256 => uint256) public feesQuote;
    mapping(uint256 => uint256) public tradeCount;

    event MarketOpened(uint256 indexed id, address base, address quote, uint16 feeBps);
    event MarketClosed(uint256 indexed id);
    event Deposited(uint256 indexed id, uint256 amountBase, uint256 amountQuote);
    event Withdrawn(uint256 indexed id, uint256 amountBase, uint256 amountQuote);
    event FeeSet(uint256 indexed id, uint16 feeBps);
    event CurveSynced(uint256 indexed id, uint256 word, uint256 concentrationBps);
    /// @dev Emitted wherever the curve is re-anchored, so the one thing a
    ///      trade must never do is visible in the log when it happens.
    event CurveAnchored(uint256 vBase, uint256 vQuote);
    event BondSet(uint256 indexed id, uint64 bondUntil);
    event PausedSet(bool paused);
    event Blessed(address indexed token, bool ok);
    event AllowlistEnforced(bool enforced);
    event AdminHandover(address indexed from, address indexed to);
    event Swapped(
        uint256 indexed id, address indexed trader, bool baseIn,
        uint256 amountIn, uint256 amountOut, uint112 rBase, uint112 rQuote
    );

    error NotHolder();
    error MarketNotOpen();
    error MarketAlreadyOpen();
    error MarketNotEmpty();
    error SameToken();
    error ZeroAddress();
    error ZeroAmount();
    error MoreThanHeld();
    error FeeTooHigh();
    error DepositCap();
    error ReserveOverflow();
    error TradeTooLarge();
    error Slippage(uint256 got, uint256 wanted);
    error Expired();
    error TransferFailed();
    error Reentrancy();
    error Bonded(uint64 until);
    error RatchetOnly();
    error BondTooLong();
    error Paused();
    error NotAdmin();
    error NotBlessed(address token);

    /// @notice Intended to be a Timelock. Can halt trading and bless tokens;
    ///         can never touch an asset.
    address public admin;
    address public pendingAdmin;

    /// @notice Trading and deposits only. Withdrawal is never pausable.
    bool public paused;

    /// @notice Markets may only be opened on blessed tokens while enforced.
    ///         A market is a promise to strangers, and a token contract that
    ///         lies about its own balances breaks every guarantee below it.
    bool public allowlistEnforced;
    mapping(address => bool) public blessed;

    uint256 private _lock = 1;
    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @dev Liquidity is the holder's alone. A renter may operate the
    ///      artwork (ERC-4907) but must never be able to move the inventory.
    modifier onlyHolder(uint256 id) {
        if (collection.ownerOf(id) != msg.sender) revert NotHolder();
        _;
    }

    modifier before(uint256 deadline) {
        if (block.timestamp > deadline) revert Expired();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    /// @dev Deliberately absent from withdraw().
    modifier notPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor(IIpseity collection_, uint256 maxDeposit_, address admin_, bool enforce) {
        if (admin_ == address(0)) revert ZeroAddress();
        collection = collection_;
        maxDeposit = maxDeposit_;
        admin = admin_;
        allowlistEnforced = enforce;
        emit AdminHandover(address(0), admin_);
        emit AllowlistEnforced(enforce);
    }

    /*═══════════════════ administration ═══════════════════

      Everything here is meant to sit behind a Timelock. None of it can
      move an asset; the worst a stolen admin key achieves is a market
      that will not trade.                                            */

    function setPaused(bool p) external onlyAdmin {
        paused = p;
        emit PausedSet(p);
    }

    function bless(address token, bool ok) external onlyAdmin {
        blessed[token] = ok;
        emit Blessed(token, ok);
    }

    function setAllowlistEnforced(bool enforce) external onlyAdmin {
        allowlistEnforced = enforce;
        emit AllowlistEnforced(enforce);
    }

    /// @notice Two steps, because a one-step handover to a mistyped address
    ///         is a permanent loss of every switch above.
    function proposeAdmin(address next) external onlyAdmin {
        pendingAdmin = next;
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotAdmin();
        emit AdminHandover(admin, pendingAdmin);
        admin = pendingAdmin;
        pendingAdmin = address(0);
    }

    /*═══════════════════ which markets exist ═══════════════════*/

    /*  Membership is exactly `marketOf[id].open`, and it changes in exactly
        two places, so it can be enumerated for the cost of one push and one
        swap-and-pop.

        Without this the only way to find markets is to walk token ids, and
        a collection capped at 4096 with three markets on it — on tokens
        3000, 3500 and 4000 — is a directory that shows nothing for its
        first hundred and twenty pages. A reader concludes there is no
        market anywhere. That is not a slow answer, it is a wrong one.

        Order is not stable: closing a market moves the last entry into its
        place, so a reader paging through while someone closes one can miss
        an entry. That is the standard cost of swap-and-pop against a linked
        list, it is worth it here, and it is written down rather than
        discovered.                                                        */
    uint256[] private _openMarkets;
    /// @dev index + 1; zero means absent
    mapping(uint256 => uint256) private _openAt;

    function openCount() external view returns (uint256) {
        return _openMarkets.length;
    }

    /// @notice A window of the ids that have an open market, in no
    ///         particular order.
    function openIds(uint256 from, uint256 count)
        external view returns (uint256[] memory ids)
    {
        uint256 len = _openMarkets.length;
        if (from >= len) return new uint256[](0);
        if (from + count > len) count = len - from;
        ids = new uint256[](count);
        for (uint256 i; i < count; ++i) ids[i] = _openMarkets[from + i];
    }

    function _remember(uint256 id) private {
        _openMarkets.push(id);
        _openAt[id] = _openMarkets.length;
    }

    function _forget(uint256 id) private {
        uint256 at = _openAt[id];
        if (at == 0) return;
        uint256 last = _openMarkets[_openMarkets.length - 1];
        _openMarkets[at - 1] = last;
        _openAt[last] = at;
        _openMarkets.pop();
        delete _openAt[id];
    }

    /*═══════════════════ the market ═══════════════════*/

    function openMarket(uint256 id, address base, address quote, uint16 feeBps)
        external onlyHolder(id)
    {
        Market storage m = marketOf[id];
        if (m.open) revert MarketAlreadyOpen();
        if (base == address(0) || quote == address(0)) revert ZeroAddress();
        if (base == quote) revert SameToken();
        if (feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        if (allowlistEnforced) {
            if (!blessed[base]) revert NotBlessed(base);
            if (!blessed[quote]) revert NotBlessed(quote);
        }

        m.base = base;
        m.quote = quote;
        m.feeBps = feeBps;
        m.open = true;
        m.curveWord = collection.sectionOf(id);
        _reanchor(m);
        _remember(id);
        emit MarketOpened(id, base, quote, feeBps);
        emit CurveSynced(id, m.curveWord, Curve.concentration(m.curveWord));
    }

    /// @notice Close a market so the pair can be changed. Take the inventory
    ///         out first; this will not do it for you, because a function
    ///         that both closes and pays out is a function that can fail
    ///         halfway.
    function closeMarket(uint256 id) external onlyHolder(id) {
        Market storage m = marketOf[id];
        if (!m.open) revert MarketNotOpen();
        _unbonded(m);
        if (m.rBase != 0 || m.rQuote != 0) revert MarketNotEmpty();
        delete marketOf[id];
        _forget(id);
        emit MarketClosed(id);
    }

    function setFee(uint256 id, uint16 feeBps) external onlyHolder(id) {
        if (feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        Market storage m = marketOf[id];
        if (!m.open) revert MarketNotOpen();
        _unbonded(m);
        m.feeBps = feeBps;
        emit FeeSet(id, feeBps);
    }

    /// @notice Promise that nothing leaves this market before `until`.
    /// @dev    Ratchet-only and permanent in the direction it moves. It
    ///         survives transfer, because it is a promise to whoever reads
    ///         it and not to whoever made it.
    function bond(uint256 id, uint64 until) external onlyHolder(id) {
        Market storage m = marketOf[id];
        if (!m.open) revert MarketNotOpen();
        if (until <= block.timestamp) revert RatchetOnly();
        if (until <= m.bondUntil) revert RatchetOnly();
        // an unbounded bond is indistinguishable from burning the inventory
        if (until > block.timestamp + MAX_BOND) revert BondTooLong();
        m.bondUntil = until;
        emit BondSet(id, until);
    }

    function bondedUntil(uint256 id) external view returns (uint64) {
        return marketOf[id].bondUntil;
    }

    function isBonded(uint256 id) public view returns (bool) {
        return marketOf[id].bondUntil > block.timestamp;
    }

    function _unbonded(Market storage m) internal view {
        if (m.bondUntil > block.timestamp) revert Bonded(m.bondUntil);
    }

    /*═══════════════════ liquidity ═══════════════════*/

    function deposit(uint256 id, uint256 amountBase, uint256 amountQuote)
        external onlyHolder(id) nonReentrant notPaused
    {
        Market storage m = marketOf[id];
        if (!m.open) revert MarketNotOpen();
        if (amountBase == 0 && amountQuote == 0) revert ZeroAmount();

        // measure what actually arrived: a token that takes a cut on
        // transfer must not be able to overstate the reserve
        uint256 gotBase = amountBase == 0 ? 0 : _pull(m.base, amountBase);
        uint256 gotQuote = amountQuote == 0 ? 0 : _pull(m.quote, amountQuote);

        uint256 nb = uint256(m.rBase) + gotBase;
        uint256 nq = uint256(m.rQuote) + gotQuote;

        /*  Only the side being added to is capped.

            `swap` never consults `maxDeposit` — it only guards MAX_RESERVE —
            so ordinary trading can push a reserve above the cap. This then
            re-checked BOTH sides, so once that happened even a one-wei
            quote-only top-up was refused on account of the base reserve it
            had not touched. An adversarial review locked a holder out of
            their own market that way, and under a live bond it left them
            with no operable function at all.

            The cap is there to bound how much a holder may PUT IN while this
            is unaudited. Refusing a deposit because of a number the deposit
            does not move was never that.                                   */
        if (gotBase != 0 && nb > maxDeposit) revert DepositCap();
        if (gotQuote != 0 && nq > maxDeposit) revert DepositCap();
        if (nb > Curve.MAX_RESERVE || nq > Curve.MAX_RESERVE) revert ReserveOverflow();

        m.rBase = uint112(nb);
        m.rQuote = uint112(nq);
        _reanchor(m);
        emit Deposited(id, gotBase, gotQuote);
    }

    function withdraw(uint256 id, uint256 amountBase, uint256 amountQuote, address to)
        external onlyHolder(id) nonReentrant
    {
        Market storage m = marketOf[id];
        if (!m.open) revert MarketNotOpen();
        _unbonded(m);
        if (to == address(0)) revert ZeroAddress();
        if (amountBase > m.rBase || amountQuote > m.rQuote) revert MoreThanHeld();

        // state first, then the outside world
        m.rBase = uint112(uint256(m.rBase) - amountBase);
        m.rQuote = uint112(uint256(m.rQuote) - amountQuote);
        _reanchor(m);

        if (amountBase != 0) _push(m.base, to, amountBase);
        if (amountQuote != 0) _push(m.quote, to, amountQuote);
        emit Withdrawn(id, amountBase, amountQuote);
    }

    /// @dev Re-anchor the curve to the reserves as they now stand. Called
    ///      from every path that changes liquidity or the curve, and from no
    ///      path that trades — which is the entire distinction that makes
    ///      the pricing sound.
    function _reanchor(Market storage m) private {
        /*  A bond freezes the curve, and that has to include the doors
            nobody thought of as doors.

            `syncCurve` — the function whose entire job is to move these
            offsets — is gated by `_unbonded`. `deposit` is not, deliberately,
            because deposits are additive to the promise and refusing them
            would punish the one person keeping it. But deposit called this,
            and this moved the offsets. So a bonded market's curve could be
            re-shaped by its holder through the one entry point left open,
            while the function built for the purpose was refused. An
            adversarial review found it and it is a term moving under a
            promise that no term moves.

            Under a live bond the offsets stay where the bond found them.
            Deposits still land; the curve simply does not follow them,
            which is what "frozen" was always supposed to mean. The effect
            on a depositor is that their new liquidity prices wider than the
            committed shape — worse for them, never for a trader, and it
            ends when the bond does.                                       */
        if (m.bondUntil > block.timestamp) return;

        (uint256 vb, uint256 vq) = Curve.anchor(m.curveWord, m.rBase, m.rQuote);
        m.vBase = uint128(vb);
        m.vQuote = uint128(vq);
        emit CurveAnchored(vb, vq);
    }

    /*═══════════════════ trading ═══════════════════*/

    /// @notice What this market would pay for `amountIn` right now.
    /// @dev    A view, and only a view: the holder may re-shape the curve in
    ///         the next block. Never trade on this without a minOut.
    function quote(uint256 id, bool baseIn, uint256 amountIn)
        public view returns (uint256 out)
    {
        Market memory m = marketOf[id];
        if (!m.open) revert MarketNotOpen();
        (uint256 rIn, uint256 rOut) = baseIn
            ? (uint256(m.rBase), uint256(m.rQuote))
            : (uint256(m.rQuote), uint256(m.rBase));
        (uint256 vIn, uint256 vOut) = baseIn
            ? (uint256(m.vBase), uint256(m.vQuote))
            : (uint256(m.vQuote), uint256(m.vBase));
        out = Curve.amountOut(amountIn, rIn, rOut, vIn, vOut, m.feeBps);
        if (out > (rOut * MAX_OUT_BPS) / BPS) revert TradeTooLarge();
    }

    /// @notice Trade against this token's market.
    /// @param  minOut the least you will accept. Setting zero is a decision.
    function swap(
        uint256 id,
        bool baseIn,
        uint256 amountIn,
        uint256 minOut,
        address to,
        uint256 deadline
    ) external before(deadline) nonReentrant notPaused returns (uint256 out) {
        Market storage m = marketOf[id];
        if (!m.open) revert MarketNotOpen();
        if (to == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert ZeroAmount();

        address tokenIn = baseIn ? m.base : m.quote;
        address tokenOut = baseIn ? m.quote : m.base;

        // what actually arrived, not what was asked for
        uint256 got = _pull(tokenIn, amountIn);

        uint256 rIn = baseIn ? m.rBase : m.rQuote;
        uint256 rOut = baseIn ? m.rQuote : m.rBase;
        uint256 vIn = baseIn ? m.vBase : m.vQuote;
        uint256 vOut = baseIn ? m.vQuote : m.vBase;

        // the offsets are read, never rewritten: a trade moves along the
        // curve and does not move the curve
        out = Curve.amountOut(got, rIn, rOut, vIn, vOut, m.feeBps);

        // the curve prices against liquidity the pool does not hold, so the
        // pool states its maximum trade rather than promising what it cannot pay
        if (out > (rOut * MAX_OUT_BPS) / BPS) revert TradeTooLarge();
        if (out < minOut) revert Slippage(out, minOut);
        if (out == 0) revert ZeroAmount();

        uint256 newIn = rIn + got;
        uint256 newOut = rOut - out;
        if (newIn > Curve.MAX_RESERVE) revert ReserveOverflow();

        // the fee never leaves; it stays as reserve for whoever holds the id
        uint256 fee = (got * m.feeBps) / BPS;
        if (baseIn) {
            m.rBase = uint112(newIn);
            m.rQuote = uint112(newOut);
            feesBase[id] += fee;
        } else {
            m.rQuote = uint112(newIn);
            m.rBase = uint112(newOut);
            feesQuote[id] += fee;
        }
        unchecked { tradeCount[id] += 1; }

        _push(tokenOut, to, out);

        emit Swapped(id, msg.sender, baseIn, got, out, m.rBase, m.rQuote);
    }

    /// @notice Bring the market's curve up to date with the artwork.
    /// @dev    Holder only, and deliberately not automatic — see the note at
    ///         the top about renters.
    function syncCurve(uint256 id) external onlyHolder(id) {
        Market storage m = marketOf[id];
        if (!m.open) revert MarketNotOpen();
        // a bond that let its maker re-price would promise the inventory and
        // then hand it away through the curve: the same rug, more steps
        _unbonded(m);
        uint256 word = collection.sectionOf(id);
        m.curveWord = word;
        _reanchor(m);
        emit CurveSynced(id, word, Curve.concentration(word));
    }

    /// @notice Whether the artwork has been turned since the market last
    ///         took a copy of it, and what syncing would change.
    function pendingCurve(uint256 id)
        external view returns (bool drifted, uint256 nowBps, uint256 wouldBeBps)
    {
        Market memory m = marketOf[id];
        /*  Nothing has drifted from a market that never took a copy of
            anything. See `market` above for why an unset word must not be
            priced.                                                      */
        if (!m.open) return (false, 0, 0);
        uint256 live = collection.sectionOf(id);
        return (live != m.curveWord, Curve.concentration(m.curveWord), Curve.concentration(live));
    }

    /*═══════════════════ reading ═══════════════════*/

    /// @notice Everything a front end needs in one call.
    function market(uint256 id)
        external view
        returns (
            address base, address quote,
            uint112 rBase, uint112 rQuote,
            uint16 feeBps, bool open,
            uint256 concentrationBps,
            uint256 spotBaseInQuote,
            /*  These are OUTPUT caps and were named as though they were
                input limits. The guard in `swap` is `out > rOut *
                MAX_OUT_BPS / BPS` — it bounds what leaves, never what
                arrives — so `maxBaseIn` was a number a front end would take
                as "the most you may send" and use to build a trade the
                contract then refuses for an unrelated reason.

                Renamed rather than repurposed. A true maximum INPUT is the
                inverse of the curve at half the outgoing reserve; it is
                computable, and it is a different number that belongs in a
                different function. What was here was always the output cap,
                so the output cap is what it is called. (Return-parameter
                names are not part of the selector, so nothing that already
                decodes this by position is broken.)                       */
            uint256 maxBaseOut, uint256 maxQuoteOut,
            uint256 trades, uint64 bondUntil
        )
    {
        Market memory m = marketOf[id];
        /*  A market that was never opened has an unset curveWord, and zero
            is not the rest word: `offsetW` 0 is the far edge of w, not the
            centre, so the honest reading of word zero is a steep curve.
            Reporting it beside `open = false` and reserves of nothing
            describes a market that does not exist as though it were priced
            steeply. Every mutating path already refuses on `open`; these
            two reads are the only ones that answer anyway, so they answer
            zero — not as a sentinel, since zero is also the true price of a
            centred token, but because a market that is not open has no
            curve to report.                                             */
        uint256 word = m.open ? m.curveWord : 0;
        return (
            m.base, m.quote, m.rBase, m.rQuote, m.feeBps, m.open,
            m.open ? Curve.concentration(word) : 0,
            Curve.spot(m.rBase, m.rQuote, m.vBase, m.vQuote),
            (uint256(m.rBase) * MAX_OUT_BPS) / BPS,
            (uint256(m.rQuote) * MAX_OUT_BPS) / BPS,
            tradeCount[id], m.bondUntil
        );
    }

    /*═══════════════════ ERC-20, defensively ═══════════════════*/

    /// @dev Plenty of real tokens return nothing at all from transfer.
    ///      Accept an empty return, reject an explicit false.
    function _push(address token, address to, uint256 amount) private {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _pull(address token, uint256 amount) private returns (uint256 received) {
        uint256 before_ = IERC20(token).balanceOf(address(this));
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, msg.sender, address(this), amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
        received = IERC20(token).balanceOf(address(this)) - before_;
        if (received == 0) revert ZeroAmount();
    }
}
