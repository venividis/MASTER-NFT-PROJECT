// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  A Uniswap v3 deployment, only as far as this collection reads and writes it.

  Faithful in the ways that decide whether the real thing would work:

    · every function signature and return shape is the one the real contract
      has, including the seven values of `slot0` and the two arrays of
      `observe`;
    · `getPool` is symmetric in its first two arguments, the way the real
      factory's mapping is, and returns zero for a pair with no pool;
    · a pool names its own factory, so the reader's self-check has something
      to check;
    · **the routers decode their params struct and record every field**,
      which is the whole point of them being here. Two Uniswap routers have
      an `exactInputSingle` and their structs differ by one field. The wrong
      shape does not revert — it shifts `recipient` and every amount by a
      word. A mock that simply performed the trade would pass either way.
      These record what they decoded, so the test can assert that the word
      the client put in `amountIn` arrived as `amountIn`.

  Everything else — ticks, positions, the real curve — is absent, because
  nothing here computes against it.

  Plus the misbehaving ones. The factory address is chosen by whoever
  deploys Venue and a pool address comes back from that factory, so on a
  wrong or hostile configuration these are calls into whatever happens to be
  there. A page a bad address can switch off is a page a bad address
  controls.
───────────────────────────────────────────────────────────────────────────*/

interface IERC20ish {
    function transferFrom(address f, address t, uint256 v) external returns (bool);
    function transfer(address t, uint256 v) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

/*═══════════════════ the pool ═══════════════════*/

contract MockV3Pool {
    address public token0;
    address public token1;
    uint24  public fee;
    int24   public tickSpacing;
    address public factory;
    uint128 public liquidity;
    uint160 public sqrtPriceX96;
    int24   public tick;
    uint16  public cardinality = 1;

    /// @dev How far back `observe` will answer. A real pool is created with
    ///      room for one observation and reverts "OLD" past whatever its
    ///      buffer holds; this reproduces that, because a chart page that
    ///      was only ever tested against a pool with infinite history is a
    ///      chart page that has never met a real one.
    uint32 public depth;

    /*  Ticks per second, so the recorded price can actually move.

        A pool whose tick never changes produces a flat chart, and a flat
        chart cannot tell a correct renderer from one drawing it upside
        down — which is exactly the bug that shipped. With a slope the
        series has a direction, and a direction is a thing a test can be
        wrong about.                                                      */
    int56 public slope;
    uint32 public base;

    constructor(
        address a, address b, uint24 f, int24 sp, uint160 sq, int24 tk, uint128 liq
    ) {
        (token0, token1) = a < b ? (a, b) : (b, a);
        fee = f;
        tickSpacing = sp;
        sqrtPriceX96 = sq;
        tick = tk;
        liquidity = liq;
        factory = msg.sender;
    }

    function setLiquidity(uint128 l) external { liquidity = l; }
    function setPrice(uint160 s, int24 t) external { sqrtPriceX96 = s; tick = t; }
    function setHistory(uint32 d, uint16 c) external {
        depth = d;
        cardinality = c;
        base = uint32(block.timestamp) - d;
    }

    /// @notice Make the tick drift, so the chart has a slope to get wrong.
    function setSlope(int56 s) external { slope = s; }

    /// @dev The real slot0 returns seven values. Two are read and the rest
    ///      are ignored, but the shape has to match or a reader that decodes
    ///      properly would be reading the wrong word.
    function slot0() external view returns (
        uint160, int24, uint16, uint16, uint16, uint8, bool
    ) {
        return (sqrtPriceX96, tick, uint16(0), cardinality, cardinality, uint8(0), true);
    }

    /*  The oracle. A real pool accumulates `tick × seconds`; this does the
        same from a constant tick, which is enough to check that the reader
        divides by the right interval and rounds a negative mean the right
        way. `OLD` is the real revert string and the reason `history`
        returns "no chart" rather than propagating a failure.             */
    function observe(uint32[] calldata secondsAgos)
        external view
        returns (int56[] memory tickCumulatives, uint160[] memory perLiq)
    {
        tickCumulatives = new int56[](secondsAgos.length);
        perLiq = new uint160[](secondsAgos.length);
        for (uint256 i; i < secondsAgos.length; ++i) {
            require(secondsAgos[i] <= depth, "OLD");
            uint256 at = block.timestamp - secondsAgos[i];
            /*  The integral of a tick that drifts linearly: the mean tick
                over [a,b] comes out as tick + slope*((a-base)+(b-base))/2,
                which rises with time when the slope is positive.        */
            int56 e = at > base ? int56(uint56(at - base)) : int56(0);
            tickCumulatives[i] = int56(tick) * int56(uint56(at)) + (slope * e * e) / 2;
            perLiq[i] = uint160(at);
        }
    }

    function increaseObservationCardinalityNext(uint16 next) external {
        if (next > cardinality) { cardinality = next; depth = uint32(next) * 12; }
    }

    /*  The ring buffer, only as far as the reader walks it. A real pool's
        oldest observation is the slot after the newest, unless the buffer
        has not filled — in which case that slot is uninitialised and slot
        zero is the oldest. Both branches are reachable here: index is 0 and
        cardinality is whatever `setHistory` said, so slot 1 is
        uninitialised whenever the buffer is short.                       */
    function observations(uint256 i) external view returns (
        uint32 blockTimestamp, int56 tickCumulative,
        uint160 secondsPerLiquidityCumulativeX128, bool initialized
    ) {
        if (depth == 0) return (0, 0, 0, false);
        // slot 0 holds the oldest reading this pool still remembers
        if (i == 0) {
            uint256 at = block.timestamp > depth ? block.timestamp - depth : 1;
            return (uint32(at), int56(tick) * int56(uint56(at)), uint160(at), true);
        }
        // and every other slot is uninitialised, so the reader must fall back
        return (0, 0, 0, false);
    }
}

contract MockV3Factory {
    mapping(bytes32 => address) private _pools;
    mapping(uint24 => int24) public feeAmountTickSpacing;

    /// @dev The three the real factory's constructor enables. The 0.01% tier
    ///      is deliberately absent: it exists only where an owner later
    ///      called `enableFeeAmount`, and a page that assumed otherwise
    ///      would offer a pool creation that reverts.
    constructor() {
        feeAmountTickSpacing[500] = 10;
        feeAmountTickSpacing[3000] = 60;
        feeAmountTickSpacing[10000] = 200;
    }

    function enableFeeAmount(uint24 f, int24 sp) external { feeAmountTickSpacing[f] = sp; }

    function _key(address a, address b, uint24 f) private pure returns (bytes32) {
        (address x, address y) = a < b ? (a, b) : (b, a);
        return keccak256(abi.encode(x, y, f));
    }

    /// @notice Create a pool the way the real factory does, and return it.
    function make(address a, address b, uint24 f, uint160 sq, int24 tk, uint128 liq)
        external returns (address p)
    {
        int24 sp = feeAmountTickSpacing[f];
        require(sp != 0, "tier not enabled");
        p = address(new MockV3Pool(a, b, f, sp, sq, tk, liq));
        _pools[_key(a, b, f)] = p;
    }

    function getPool(address a, address b, uint24 f) external view returns (address) {
        return _pools[_key(a, b, f)];
    }
}

/*═══════════════════ what a quote costs, in one place ═══════════════════*/

/*  The quoter and the router share this, so a quote the page shows and a
    trade the page sends cannot disagree for a reason the test invented.  */
contract MockBook {
    /// @dev How many smallest units of `out` one smallest unit of `in` buys,
    ///      scaled by 1e18. Per direction and per tier, like a real pool.
    mapping(bytes32 => uint256) public rate;

    function key(address a, address b, uint24 f) public pure returns (bytes32) {
        return keccak256(abi.encode(a, b, f));
    }

    function set(address a, address b, uint24 f, uint256 r) external {
        rate[key(a, b, f)] = r;
    }

    function quote(address a, address b, uint24 f, uint256 amountIn)
        public view returns (uint256)
    {
        uint256 r = rate[key(a, b, f)];
        if (r == 0 || amountIn == 0) return 0;
        return (amountIn * r) / 1e18;
    }
}

/// @dev QuoterV2, including the part that matters: it is NOT `view`. The
///      real one works by making the pool swap and catching the revert, so
///      a browser can run it with `eth_call` and a `view` page contract
///      cannot run it at all. Declaring this `view` would let a test pass
///      that the real deployment fails.
contract MockQuoter {
    MockBook public immutable BOOK;
    constructor(MockBook b) { BOOK = b; }

    struct Params {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24  fee;
        uint160 sqrtPriceLimitX96;
    }

    /// @dev Field order follows QuoterV2's struct *declaration*, which is
    ///      what the ABI encodes — not its NatSpec comment, which lists them
    ///      differently and is a real trap.
    function quoteExactInputSingle(Params memory p)
        external
        returns (uint256 amountOut, uint160 after_, uint32 crossed, uint256 gasEstimate)
    {
        amountOut = BOOK.quote(p.tokenIn, p.tokenOut, p.fee, p.amountIn);
        require(amountOut > 0, "no liquidity");
        return (amountOut, uint160(1), uint32(0), uint256(90_000));
    }
}

/*═══════════════════ the two routers ═══════════════════*/

/*  Both record what they decoded. If the client emits the other router's
    word order, `recipient` and every amount arrive shifted by one word and
    these fields are visibly wrong — which is the failure the mock exists to
    make visible, because performing the trade regardless would hide it.  */
struct Seen {
    bool    called;
    address tokenIn;
    address tokenOut;
    uint24  fee;
    address recipient;
    uint256 deadline;
    uint256 amountIn;
    uint256 amountOutMinimum;
    uint160 sqrtPriceLimitX96;
}

/// @dev The v3-periphery SwapRouter: eight fields, `deadline` at index 4.
contract MockRouterV3 {
    MockBook public immutable BOOK;
    Seen public last;
    constructor(MockBook b) { BOOK = b; }

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata p)
        external payable returns (uint256 amountOut)
    {
        last = Seen(true, p.tokenIn, p.tokenOut, p.fee, p.recipient, p.deadline,
                    p.amountIn, p.amountOutMinimum, p.sqrtPriceLimitX96);
        require(block.timestamp <= p.deadline, "Transaction too old");
        amountOut = BOOK.quote(p.tokenIn, p.tokenOut, p.fee, p.amountIn);
        require(amountOut >= p.amountOutMinimum, "Too little received");
        IERC20ish(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        IERC20ish(p.tokenOut).transfer(p.recipient, amountOut);
    }
}

/// @dev SwapRouter02: seven fields, no deadline anywhere — and the sentinel
///      that makes a zero `amountIn` dangerous rather than merely useless.
contract MockRouter02 {
    MockBook public immutable BOOK;
    Seen public last;
    constructor(MockBook b) { BOOK = b; }

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata p)
        external payable returns (uint256 amountOut)
    {
        last = Seen(true, p.tokenIn, p.tokenOut, p.fee, p.recipient, 0,
                    p.amountIn, p.amountOutMinimum, p.sqrtPriceLimitX96);
        /*  Constants.CONTRACT_BALANCE == 0. On the real SwapRouter02 an
            `amountIn` of zero does not mean "trade nothing" — it means
            "trade this router's entire balance of tokenIn, already paid".
            Reproduced so that a client which stopped refusing zero would
            fail here rather than on chain.                               */
        uint256 amt = p.amountIn == 0 ? IERC20ish(p.tokenIn).balanceOf(address(this))
                                      : p.amountIn;
        amountOut = BOOK.quote(p.tokenIn, p.tokenOut, p.fee, amt);
        require(amountOut >= p.amountOutMinimum, "Too little received");
        if (p.amountIn != 0) IERC20ish(p.tokenIn).transferFrom(msg.sender, address(this), amt);
        IERC20ish(p.tokenOut).transfer(p.recipient, amountOut);
    }
}

/*───────────────── the ones that do not behave ─────────────────*/

/// @dev Says a pool exists at an address with no code.
contract PhantomFactory {
    function getPool(address, address, uint24) external pure returns (address) {
        return address(0xdead);
    }
    function feeAmountTickSpacing(uint24) external pure returns (int24) { return 60; }
}

/// @dev Refuses to answer at all.
contract SilentFactory {
    function getPool(address, address, uint24) external pure returns (address) {
        revert("no");
    }
    function feeAmountTickSpacing(uint24) external pure returns (int24) { revert("no"); }
}

/// @dev Burns every drop of gas it is given rather than answering. The
///      reason each read carries a stipend instead of forwarding all of it.
contract GreedyFactory {
    function getPool(address, address, uint24) external view returns (address) {
        uint256 x;
        while (gasleft() > 2000) { x = uint256(keccak256(abi.encode(x))); }
        return address(uint160(x));
    }
    function feeAmountTickSpacing(uint24) external view returns (int24) {
        uint256 x;
        while (gasleft() > 2000) { x = uint256(keccak256(abi.encode(x))); }
        return int24(int256(x));
    }
}

/// @dev A pool that answers `slot0` but reverts on `liquidity`, so the
///      partial-read path is exercised rather than assumed.
contract HalfPool {
    function slot0() external pure returns (
        uint160, int24, uint16, uint16, uint16, uint8, bool
    ) {
        return (uint160(1) << 96, int24(0), uint16(0), uint16(1), uint16(1), uint8(0), true);
    }
    function liquidity() external pure returns (uint128) { revert("no"); }
    function token0() external pure returns (address) { return address(1); }
}

contract HalfPoolFactory {
    address public immutable P;
    constructor() { P = address(new HalfPool()); }
    function getPool(address, address, uint24) external view returns (address) { return P; }
    function feeAmountTickSpacing(uint24) external pure returns (int24) { return 60; }
}

/// @dev A pool that answers everything correctly except which factory it
///      belongs to. The point of the reader's self-check: an address that
///      looks exactly like a Uniswap pool, is not one, and would otherwise
///      be described as one on a page a visitor is about to trade from.
contract ImpostorPool {
    function slot0() external pure returns (
        uint160, int24, uint16, uint16, uint16, uint8, bool
    ) {
        return (uint160(1) << 96, int24(0), uint16(0), uint16(1), uint16(1), uint8(0), true);
    }
    function liquidity() external pure returns (uint128) { return 1e18; }
    function token0() external pure returns (address) { return address(1); }
    function token1() external pure returns (address) { return address(2); }
    function fee() external pure returns (uint24) { return 3000; }
    function tickSpacing() external pure returns (int24) { return 60; }
    function factory() external pure returns (address) { return address(0xbad); }
}

/*═══════════════════ the position manager ═══════════════════*/

/*  Records what it decoded, like the routers, and for the same reason —
    with one addition that matters more here than anywhere else on the site.

    `tickLower` and `tickUpper` are int24, and every pair priced below parity
    has a negative current tick, so a real range is routinely two negative
    numbers.

    A client that reinterprets the low 24 bits fails loudly: -201240 becomes
    16575976, which is not a legal int24, and the decoder rejects it. The one
    that does not fail loudly is a client that DROPS the sign — +201240 is a
    perfectly legal tick about nine million times the intended price, the
    position mints in a range nobody chose, and nothing reverts because
    nothing is wrong with the number.

    Recording the ticks as signed and asserting on them is the only way that
    second failure becomes visible.                                        */
contract MockPositions {
    struct Minted {
        bool    called;
        address token0;
        address token1;
        uint24  fee;
        int24   tickLower;
        int24   tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }
    Minted public last;

    struct Made { bool called; address token0; address token1; uint24 fee; uint160 sqrt; }
    Made public lastPool;

    /// @dev tokenId => owner, and the flat position record `positions` returns
    uint256 public nextId = 1;
    mapping(address => uint256[] ) private _owned;
    mapping(uint256 => Minted) private _pos;
    mapping(uint256 => uint128) public liquidityOf;

    struct MintParams {
        address token0;
        address token1;
        uint24  fee;
        int24   tickLower;
        int24   tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function mint(MintParams calldata p)
        external payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        require(p.token0 < p.token1, "unsorted pair");
        require(block.timestamp <= p.deadline, "Transaction too old");
        last = Minted(true, p.token0, p.token1, p.fee, p.tickLower, p.tickUpper,
                      p.amount0Desired, p.amount1Desired, p.amount0Min, p.amount1Min,
                      p.recipient, p.deadline);
        tokenId = nextId++;
        _pos[tokenId] = last;
        _owned[p.recipient].push(tokenId);
        liquidity = uint128(p.amount0Desired + p.amount1Desired);
        liquidityOf[tokenId] = liquidity;
        if (p.amount0Desired > 0) {
            IERC20ish(p.token0).transferFrom(msg.sender, address(this), p.amount0Desired);
        }
        if (p.amount1Desired > 0) {
            IERC20ish(p.token1).transferFrom(msg.sender, address(this), p.amount1Desired);
        }
        return (tokenId, liquidity, p.amount0Desired, p.amount1Desired);
    }

    function createAndInitializePoolIfNecessary(
        address token0, address token1, uint24 fee, uint160 sqrtPriceX96
    ) external payable returns (address) {
        require(token0 < token1, "unsorted pair");
        require(sqrtPriceX96 > 0, "no price");
        lastPool = Made(true, token0, token1, fee, sqrtPriceX96);
        return address(this);
    }

    function balanceOf(address who) external view returns (uint256) {
        return _owned[who].length;
    }

    function tokenOfOwnerByIndex(address who, uint256 i) external view returns (uint256) {
        return _owned[who][i];
    }

    /// @dev Twelve flat static words, in the order the real one returns them.
    function positions(uint256 id) external view returns (
        uint96, address, address, address, uint24, int24, int24,
        uint128, uint256, uint256, uint128, uint128
    ) {
        Minted memory m = _pos[id];
        return (uint96(0), address(0), m.token0, m.token1, m.fee,
                m.tickLower, m.tickUpper, liquidityOf[id],
                uint256(0), uint256(0), uint128(7), uint128(11));
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }
    CollectParams public lastCollect;

    function collect(CollectParams calldata p)
        external payable returns (uint256, uint256)
    {
        lastCollect = p;
        return (7, 11);
    }

    struct DecreaseParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }
    DecreaseParams public lastDecrease;

    function decreaseLiquidity(DecreaseParams calldata p)
        external payable returns (uint256, uint256)
    {
        require(block.timestamp <= p.deadline, "Transaction too old");
        lastDecrease = p;
        liquidityOf[p.tokenId] -= p.liquidity;
        return (0, 0);
    }
}

/*═══════════════════ a vault, and a governor ═══════════════════*/

/// @dev The four ERC-4626 reads the earn page verifies a vault with, and the
///      two writes it offers. Nothing else — the page never asks for more.
contract MockVault {
    address public immutable asset;
    uint8 public constant decimals = 18;
    string public constant symbol = "gtUSDC";
    string public constant name = "A Vault";
    mapping(address => uint256) public balanceOf;
    uint256 public totalSupply;
    uint256 public totalAssets;

    constructor(address a) { asset = a; totalAssets = 1_000_000e6; totalSupply = 1e24; }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return totalSupply == 0 ? shares : (shares * totalAssets) / totalSupply;
    }
    function maxRedeem(address who) external view returns (uint256) { return balanceOf[who]; }

    function deposit(uint256 assets, address to) external returns (uint256 shares) {
        IERC20ish(asset).transferFrom(msg.sender, address(this), assets);
        shares = totalAssets == 0 ? assets : (assets * totalSupply) / totalAssets;
        totalAssets += assets;
        totalSupply += shares;
        balanceOf[to] += shares;
    }

    function redeem(uint256 shares, address to, address owner)
        external returns (uint256 assets)
    {
        require(balanceOf[owner] >= shares, "no shares");
        assets = convertToAssets(shares);
        balanceOf[owner] -= shares;
        totalSupply -= shares;
        totalAssets -= assets;
        IERC20ish(asset).transfer(to, assets);
    }
}

/// @dev Governor Bravo, only as far as the page reads it — including the
///      part that matters: `proposals()` is an auto-generated getter and
///      returns ten STATIC words, silently omitting the struct's four
///      dynamic arrays and its receipts mapping. A mock returning the full
///      struct would let a reader that decoded the wrong words pass.
contract MockGovernor {
    struct Vote { bool called; uint256 id; uint8 support; address who; }
    Vote public lastVote;

    function proposalCount() external pure returns (uint256) { return 3; }
    function quorumVotes() external pure returns (uint256) { return 40_000_000e18; }

    function proposals(uint256 id) external pure returns (
        uint256, address, uint256, uint256, uint256,
        uint256, uint256, uint256, bool, bool
    ) {
        return (id, address(0xA11CE), 0, 100, 200,
                1_000_000e18, 500_000e18, 1_000e18, false, false);
    }

    /// @dev 1 = active, 3 = defeated, in the enum's own numbering.
    function state(uint256 id) external pure returns (uint8) {
        return id == 3 ? 1 : 3;
    }

    function castVote(uint256 id, uint8 support) external {
        lastVote = Vote(true, id, support, msg.sender);
    }
}

contract MockVotes {
    mapping(address => address) public delegates;
    mapping(address => uint256) private _votes;

    function delegate(address to) external {
        delegates[msg.sender] = to;
        _votes[to] += 1_000e18;
    }
    function getCurrentVotes(address a) external view returns (uint256) { return _votes[a]; }
    function balanceOf(address) external pure returns (uint256) { return 1_000e18; }
}

/*───────────────────────────────────────────────────────────────────────────
  v4's PoolManager, as far as the launch page sends to it: `initialize`
  with a five-field static PoolKey and a starting price. It records what it
  DECODED, field by field, because the assertion worth having is that the
  client's six flat words landed as the six fields they were named — a
  manager that merely accepted the call would pass a client that shifted
  every field by a word.
───────────────────────────────────────────────────────────────────────────*/
contract MockManager {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24  fee;
        int24   tickSpacing;
        address hooks;
    }

    bool    public inited;
    address public c0;
    address public c1;
    uint24  public fee;
    int24   public spacing;
    address public hooks;
    uint160 public sqrtPrice;

    function initialize(PoolKey calldata k, uint160 sqrtPriceX96)
        external returns (int24)
    {
        inited = true;
        c0 = k.currency0;
        c1 = k.currency1;
        fee = k.fee;
        spacing = k.tickSpacing;
        hooks = k.hooks;
        sqrtPrice = sqrtPriceX96;
        return 0;
    }

    function last()
        external view
        returns (bool, address, address, uint24, int24, address, uint160)
    {
        return (inited, c0, c1, fee, spacing, hooks, sqrtPrice);
    }
}
