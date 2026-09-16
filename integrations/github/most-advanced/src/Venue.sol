// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Mul} from "./lib/Mul.sol";
import {Tick} from "./lib/Tick.sol";
import {Look, PoolState} from "./interfaces/Site.sol";

interface IV3Factory {
    function getPool(address a, address b, uint24 fee) external view returns (address);
    function feeAmountTickSpacing(uint24 fee) external view returns (int24);
}

interface IV3Pool {
    function slot0() external view returns (
        uint160 sqrtPriceX96, int24 tick,
        uint16 observationIndex, uint16 observationCardinality,
        uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked
    );
    function liquidity() external view returns (uint128);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function tickSpacing() external view returns (int24);
    function factory() external view returns (address);
    function observe(uint32[] calldata secondsAgos) external view returns (
        int56[] memory tickCumulatives,
        uint160[] memory secondsPerLiquidityCumulativeX128s
    );
    function observations(uint256 index) external view returns (
        uint32 blockTimestamp, int56 tickCumulative,
        uint160 secondsPerLiquidityCumulativeX128, bool initialized
    );
}

/*═══════════════════════════════════════════════════════════════════════════

  VENUE — the rest of the chain, held as seven addresses and read carefully

  This is the one contract in the collection that knows Uniswap exists. It
  holds the addresses, it does the reading, and it has no function that
  moves anything.

  ── two different jobs, and only one of them routes ──

  On a token's own market page this is a *comparison*. Every token in this
  collection is its own exchange: the holder is its only liquidity provider,
  the fee is theirs, and the price curve is set by how far the artwork has
  been turned through the fourth axis. Routing that page's trades to Uniswap
  would delete all of it — the token would earn nothing, the curve would
  price nothing, and the most original mechanism here would become decoration
  on what is really a Uniswap front end. So that page shows both prices side
  by side and says which is better, and the button still trades the token's
  own market.

  A market shown beside the deepest venue on chain, and still chosen, has
  been chosen for a reason. It also hands the holder the one signal they were
  missing — that their fee is too high, or their curve too tight — on the
  page they already use to manage it.

  Everything under `/swap`, `/pools`, `/explore`, `/earn` and `/vote` is the
  other job: ordinary assets, nothing to do with any token, routed to
  Uniswap because that is where the liquidity is. They are separate pages
  precisely so the two are never confused.

  ── this contract itself only reads ──

  `getPool`, `slot0`, `liquidity`, `token0`, `observe`: view calls, no
  approvals, no allowance, nothing to sign. It holds the router's and the
  position manager's addresses so a page can print them and a client can
  send to them, and it has no function that moves anything. Every
  transaction this site offers goes from the visitor's wallet straight to a
  Uniswap contract — nothing here stands in the middle of anybody's money,
  and there is no function here that could.

  ── the addresses are arguments, and every page prints them ──

  Nothing is hardcoded. All seven are constructor arguments, and every page
  that uses one also shows it, so a viewer can check it against Uniswap's
  own published deployments rather than against this contract's word. This
  matters more than it looks: the four v3 addresses are the same on Ethereum,
  Arbitrum, Optimism and Polygon and are *different on Base*, so a contract
  that hardcoded mainnet's would be quietly wrong on exactly one chain.

  On a chain with no Uniswap deployment, pass zero: every read degrades to
  "no venue" and the pages say so instead of failing.

  ── the oracle, which is the part nobody uses ──

  `history` reads the pool's own ring buffer of observations. That is where
  a price chart comes from when there is no indexer and no subgraph: the
  pool has been recording a cumulative tick since it was created, and the
  difference between any two of those readings divided by the time between
  them is the time-weighted average price over that interval — computed by
  the pool, not by a server, and not falsifiable by whoever is serving the
  page.

  The catch is real and the page says it out loud: a pool is created with
  room for exactly one observation, so most pools can answer for the current
  block and nothing further back. Anyone may pay to lengthen that buffer,
  and the chart page offers the button, because "this pool has no memory"
  is a fixable condition rather than an excuse.

═══════════════════════════════════════════════════════════════════════════*/
contract Venue {
    /// @notice The v3 factory this contract reads. Zero means no venue here.
    address public immutable FACTORY;
    /// @notice QuoterV2. Never called from Solidity — it is `nonpayable`, so
    ///         it cannot be a view read — but a browser reaches it with
    ///         `eth_call`, which executes without committing, and that is
    ///         how the quote on the page is obtained.
    address public immutable QUOTER;
    /// @notice The one router this site will send to.
    address public immutable ROUTER;
    /// @notice Which router that is, and therefore what its calldata means.
    /// @dev    This is the single most dangerous fact in the contract and it
    ///         is why the address and the shape are stored together.
    ///
    ///         Two Uniswap routers have an `exactInputSingle` and they do not
    ///         share a struct:
    ///
    ///           KIND_V3 (0)  v3-periphery SwapRouter
    ///                        exactInputSingle((address,address,uint24,
    ///                          address,uint256,uint256,uint256,uint160))
    ///                        eight words, `deadline` at index 4
    ///
    ///           KIND_02 (1)  SwapRouter02
    ///                        exactInputSingle((address,address,uint24,
    ///                          address,uint256,uint256,uint160))
    ///                        seven words, no deadline at all
    ///
    ///         Send one shape to the other router and it does not fail. It
    ///         shifts `recipient` and every amount by one word and executes
    ///         something nobody asked for. That is the most plausible way a
    ///         page like this loses somebody's money, so the kind travels
    ///         with the address, the selector is derived from that kind's own
    ///         signature string, and the page prints both.
    ///
    ///         Neither is "the right one": SwapRouter02 is what Uniswap's own
    ///         interface uses, and the older router is the only one whose
    ///         deadline a client with no ABI coder can reach, because
    ///         SwapRouter02's deadline lives behind `multicall(uint256,
    ///         bytes[])` and that argument is a dynamic array of dynamic
    ///         bytes. Base has no v3-periphery SwapRouter deployed at all.
    ///         So it is a deployment choice, and the page says which was made
    ///         and what was given up.
    uint8 public immutable ROUTER_KIND;

    uint8 public constant KIND_V3 = 0;
    uint8 public constant KIND_02 = 1;
    /// @notice NonfungiblePositionManager: liquidity, ranges, and the
    ///         one-sided position that is a limit order without a server.
    address public immutable POSITIONS;
    /// @notice The chain's wrapped native token, so a page can offer ETH.
    address public immutable WRAPPED;
    /// @notice The governor, where a proposal is voted on rather than
    ///         described.
    address public immutable GOVERNOR;
    /// @notice The token that governor counts.
    address public immutable GOV_TOKEN;
    /// @notice The v4 PoolManager, where a pool with a hook is created.
    /// @dev    Zero on a chain with no v4 deployment, and the launch page
    ///         then offers a hookless launch and says so. v4's `initialize`
    ///         is the one v4 entry point a client with no ABI coder can
    ///         reach on its own: `PoolKey` is five static fields, so
    ///         `initialize((address,address,uint24,int24,address),uint160)`
    ///         is six flat words with no offset. Adding liquidity is not —
    ///         that goes through `modifyLiquidities(bytes,uint256)`, whose
    ///         argument is a dynamic array of dynamic bytes.
    address public immutable POOL_MANAGER;
    /// @dev Seven addresses as seven arguments is seven chances to transpose
    ///      two of them at deployment and not notice until a page prints the
    ///      quoter where the router should be. A named struct makes the call
    ///      site say which is which.
    struct Wiring {
        address factory;
        address quoter;
        address router;
        uint8   routerKind;
        address positions;
        address wrapped;
        address governor;
        address govToken;
        address poolManager;
    }

    error UnknownRouterKind();

    constructor(Wiring memory w) {
        /*  A kind this contract does not understand would mean a selector
            nobody checked, so it is refused at deployment rather than
            defaulted. There is no safe default here: both values are
            legitimate routers and picking one silently is picking one of
            the two ways to be wrong.                                    */
        if (w.routerKind > KIND_02) revert UnknownRouterKind();
        FACTORY = w.factory;
        QUOTER = w.quoter;
        ROUTER = w.router;
        ROUTER_KIND = w.routerKind;
        POSITIONS = w.positions;
        WRAPPED = w.wrapped;
        GOVERNOR = w.governor;
        GOV_TOKEN = w.govToken;
        POOL_MANAGER = w.poolManager;
    }

    /// @notice Whether v4 is wired up here, separately from v3.
    /// @dev    A chain can have one and not the other, and the launch page
    ///         needs to say which rather than offering a hook field that
    ///         leads nowhere.
    function hasV4() external view returns (bool) {
        return POOL_MANAGER != address(0) && POOL_MANAGER.code.length > 0;
    }

    /// @notice Whether this chain has a venue wired up at all.
    function present() external view returns (bool) {
        return FACTORY != address(0) && FACTORY.code.length > 0;
    }

    /// @notice The standard v3 fee tiers, in hundredths of a basis point:
    ///         0.01%, 0.05%, 0.3%, 1%. A pair usually has a pool at one or
    ///         two of them and nothing at the rest.
    function tiers() external pure returns (uint24[4] memory t) {
        t[0] = 100; t[1] = 500; t[2] = 3000; t[3] = 10000;
    }

    /*═══════════════════ finding a pool ═══════════════════*/

    /// @notice The deepest v3 pool for a pair, and what it prices at.
    /// @dev Deepest by `liquidity()`, which is the in-range liquidity at the
    ///      current tick — the number that actually decides what a trade of
    ///      ordinary size costs. Total value locked would be the wrong
    ///      measure: a pool can hold a great deal of it parked in ranges the
    ///      price is nowhere near.
    function best(address base, address quote, uint8 baseDecimals)
        external view returns (Look memory L)
    {
        Look[4] memory all = survey(base, quote, baseDecimals);
        for (uint256 i; i < 4; ++i) {
            /*  A pool that exists but holds nothing at the current tick is
                a real answer to "which tiers exist" and the wrong answer to
                "where should this trade go" — it would price a trade it
                cannot fill. `survey` reports it; `best` steps over it.   */
            if (!all[i].found || all[i].liquidity == 0) continue;
            if (L.found && all[i].liquidity <= L.liquidity) continue;
            L = all[i];
        }
    }

    /// @notice All four tiers at once, found or not.
    /// @dev The page that picks a fee tier needs to show the ones that do
    ///      not exist as well as the ones that do — "there is no 1% pool for
    ///      this pair" is the answer to a question, and a list that silently
    ///      omits it looks like a list of every tier there is.
    function survey(address base, address quote, uint8 baseDecimals)
        public view returns (Look[4] memory out)
    {
        if (FACTORY == address(0) || base == address(0) || quote == address(0)) return out;
        if (base == quote) return out;

        uint24[4] memory t = this.tiers();
        uint256 unit = baseDecimals > 36 ? 1 : 10 ** uint256(baseDecimals);

        for (uint256 i; i < 4; ++i) {
            address p = poolAt(base, quote, t[i]);
            if (p == address(0)) continue;
            PoolState memory s = state(p);
            if (!s.ok || s.sqrtPriceX96 == 0) continue;
            out[i] = Look({
                found: true,
                pool: p,
                fee: t[i],
                liquidity: s.liquidity,
                sqrtPriceX96: s.sqrtPriceX96,
                tick: s.tick,
                spot: Mul.priceFromSqrt(s.sqrtPriceX96, unit, s.token0 == base)
            });
        }
    }

    /*  Every external read is a raw staticcall with a stipend.

        The factory address is chosen by whoever deployed this contract, and
        a pool address comes back from that factory — so on a misconfigured
        deployment these are calls into whatever happens to be there. A page
        that reverts because one of them misbehaved is a page that a bad
        address can switch off, and the card underneath the comparison is
        the part that actually matters.                                   */
    function poolAt(address a, address b, uint24 fee) public view returns (address) {
        if (FACTORY == address(0) || FACTORY.code.length == 0) return address(0);
        (bool ok, bytes memory out) = FACTORY.staticcall{gas: 60_000}(
            abi.encodeWithSelector(IV3Factory.getPool.selector, a, b, fee));
        if (!ok || out.length < 32) return address(0);
        address p = abi.decode(out, (address));
        return p.code.length == 0 ? address(0) : p;
    }

    /// @notice Everything about a pool that a page or a client needs, in one
    ///         read, with every part of it optional.
    function state(address p) public view returns (PoolState memory s) {
        if (p == address(0) || p.code.length == 0) return s;

        /*  slot0 returns seven values and only two are wanted, but the
            *shape* still has to be right: reading word 1 as the tick is only
            correct because slot0's second return value is the tick. A
            contract that answers `slot0()` with a different shape gives a
            wrong tick rather than a failure, so the length is checked and
            the price is sanity-checked against the representable range.  */
        (bool a, bytes memory w) =
            p.staticcall{gas: 60_000}(abi.encodeWithSelector(IV3Pool.slot0.selector));
        if (!a || w.length < 224) return s;
        (uint256 sq, uint256 tk, , uint256 card) =
            abi.decode(w, (uint256, uint256, uint256, uint256));
        if (sq == 0 || sq > uint256(Tick.MAX_SQRT)) return s;
        s.sqrtPriceX96 = uint160(sq);
        s.tick = int24(int256(tk));
        if (s.tick > Tick.MAX_TICK || s.tick < Tick.MIN_TICK) return s;
        s.cardinality = card > type(uint16).max ? type(uint16).max : uint16(card);

        s.liquidity = uint128(_word(p, IV3Pool.liquidity.selector, 40_000));
        s.token0 = address(uint160(_word(p, IV3Pool.token0.selector, 40_000)));
        s.token1 = address(uint160(_word(p, IV3Pool.token1.selector, 40_000)));
        if (s.token0 == address(0) || s.token1 == address(0)) return s;
        s.fee = uint24(_word(p, IV3Pool.fee.selector, 40_000));
        s.spacing = int24(int256(_word(p, IV3Pool.tickSpacing.selector, 40_000)));

        /*  The pool names its own factory, so ask it.

            `poolAt` gets its addresses from the factory and cannot return a
            stranger, but this function is also reachable with an address a
            visitor pasted, and a page that will describe any address as "a
            Uniswap pool" is a page that can be used to describe a fake one.
            One extra read turns the claim from "this contract says so" into
            "the contract at that address agrees it belongs to the factory
            this page printed at the bottom".                             */
        (bool f, bytes memory fo) =
            p.staticcall{gas: 40_000}(abi.encodeWithSelector(IV3Pool.factory.selector));
        if (!f || fo.length < 32) return s;
        if (abi.decode(fo, (address)) != FACTORY) return s;

        s.ok = true;
    }

    /// @notice The tick spacing a fee tier is enabled at, or zero if the
    ///         factory does not know it.
    /// @dev    Not a constant, and assuming it is one is a real bug: the v3
    ///         factory's constructor enables exactly three tiers — 500, 3000
    ///         and 10000 — and the 0.01% tier exists only where an owner
    ///         later called `enableFeeAmount`. A page offering to create a
    ///         0.01% pool on a chain where nobody enabled it is offering a
    ///         transaction that reverts. Tiers can never be removed, so the
    ///         answer is stable once read.
    function enabled(uint24 fee) public view returns (int24) {
        if (FACTORY == address(0) || FACTORY.code.length == 0) return 0;
        (bool ok, bytes memory out) = FACTORY.staticcall{gas: 40_000}(
            abi.encodeWithSelector(IV3Factory.feeAmountTickSpacing.selector, fee));
        if (!ok || out.length < 32) return 0;
        int24 sp = int24(int256(abi.decode(out, (uint256))));
        return sp > 0 && sp < 16384 ? sp : int24(0);
    }

    /// @notice The tick spacing of each standard tier on THIS chain, zero
    ///         where the tier is not enabled.
    function spacings() external view returns (int24[4] memory out) {
        uint24[4] memory t = this.tiers();
        for (uint256 i; i < 4; ++i) out[i] = enabled(t[i]);
    }

    function _word(address p, bytes4 selector, uint256 stipend)
        private view returns (uint256)
    {
        (bool ok, bytes memory out) =
            p.staticcall{gas: stipend}(abi.encodeWithSelector(selector));
        if (!ok || out.length < 32) return 0;
        return abi.decode(out, (uint256));
    }

    /*═══════════════════ the pool's own memory ═══════════════════*/

    /// @notice `points` time-weighted average ticks, evenly spaced across
    ///         the last `window` seconds, read from the pool's own oracle.
    /// @dev    `ok` is false rather than reverting when the pool cannot
    ///         answer, which is the common case and not an error: a pool is
    ///         created with room for one observation, and `observe` reverts
    ///         with "OLD" for anything further back than it has stored. A
    ///         page that reverted there would be a page that most pools
    ///         switch off.
    /// @return ok    whether the pool answered
    /// @return ticks one mean tick per interval, oldest first
    /// @return step  the number of seconds each one covers
    function history(address p, uint32 window, uint8 points)
        external view
        returns (bool ok, int24[] memory ticks, uint32 step)
    {
        ticks = new int24[](0);
        if (p == address(0) || p.code.length == 0) return (false, ticks, 0);
        if (points == 0 || points > 48 || window == 0) return (false, ticks, 0);
        step = window / points;
        if (step == 0) return (false, ticks, 0);
        /*  The window is trimmed to a whole number of steps.

            It was not, and the consequence was one wrong bar on every chart
            whose window did not divide evenly: the last interval spanned
            `step + (window % points)` seconds while `meanTick` was still
            handed `step`, so the final point — the most recent one, the one
            a reader looks at first — was scaled by (step + r)/step. A chart
            is a claim about a rate; dividing by the wrong duration is not a
            rounding error, it is a different number.                     */
        window = step * uint32(points);

        uint32[] memory agos = new uint32[](uint256(points) + 1);
        for (uint256 i; i <= points; ++i) {
            agos[i] = window - uint32(i) * step;
        }

        (bool call_, bytes memory out) = p.staticcall{gas: 2_000_000}(
            abi.encodeWithSelector(IV3Pool.observe.selector, agos));
        if (!call_) return (false, ticks, step);

        /*  Decoded by hand rather than with abi.decode, for the same reason
            `Web._label` is: `abi.decode` on a length this contract did not
            choose will happily try to allocate whatever the callee claimed,
            and memory is charged quadratically. Every bound is checked
            against the buffer that actually arrived, and a failure is
            "no chart" rather than a revert.                              */
        uint256 n = uint256(points) + 1;
        if (out.length < 96) return (false, ticks, step);
        uint256 off;
        assembly ("memory-safe") { off := mload(add(out, 32)) }
        if (off != 0x40) return (false, ticks, step);       // canonical only
        uint256 len;
        assembly ("memory-safe") { len := mload(add(out, 96)) }
        if (len != n) return (false, ticks, step);
        if (out.length < 128 + n * 32) return (false, ticks, step);

        ticks = new int24[](points);
        for (uint256 i; i < points; ++i) {
            uint256 lo;
            uint256 hi;
            assembly ("memory-safe") {
                lo := mload(add(out, add(128, mul(i, 32))))
                hi := mload(add(out, add(160, mul(i, 32))))
            }
            ticks[i] = Tick.meanTick(int56(int256(lo)), int56(int256(hi)), step);
        }
        ok = true;
    }

    /// @notice How far back this pool can actually answer, in seconds.
    /// @dev    The chart used to ask for a fixed day of history and take
    ///         "no" for an answer, which meant a pool remembering fifty
    ///         minutes drew nothing at all — and the page then recommended
    ///         buying three hundred observations, which on a busy pool is
    ///         about an hour and would not have helped either. Asking the
    ///         pool how much it remembers turns both of those into a chart
    ///         of whatever there is.
    ///
    ///         The oldest observation is the one *after* the newest in the
    ///         ring, unless the buffer has not filled yet — in which case
    ///         that slot is uninitialised and slot zero is the oldest. This
    ///         is what Uniswap's own `getOldestObservationSecondsAgo` does.
    function oldest(address p) external view returns (bool ok, uint32 secondsAgo) {
        if (p == address(0) || p.code.length == 0) return (false, 0);
        (bool a, bytes memory w) =
            p.staticcall{gas: 60_000}(abi.encodeWithSelector(IV3Pool.slot0.selector));
        if (!a || w.length < 224) return (false, 0);
        (, , uint256 index, uint256 card) =
            abi.decode(w, (uint256, uint256, uint256, uint256));
        if (card == 0) return (false, 0);

        (bool b, uint32 at, bool init) = _observation(p, (index + 1) % card);
        if (!b) return (false, 0);
        if (!init) {
            (b, at, init) = _observation(p, 0);
            if (!b || !init) return (false, 0);
        }
        if (at == 0 || uint256(at) > block.timestamp) return (false, 0);
        return (true, uint32(block.timestamp - uint256(at)));
    }

    function _observation(address p, uint256 i)
        private view returns (bool, uint32, bool)
    {
        (bool ok, bytes memory out) = p.staticcall{gas: 40_000}(
            abi.encodeWithSelector(IV3Pool.observations.selector, i));
        if (!ok || out.length < 128) return (false, 0, false);
        (uint256 at, , , uint256 init) =
            abi.decode(out, (uint256, uint256, uint256, uint256));
        if (at > type(uint32).max) return (false, 0, false);
        return (true, uint32(at), init != 0);
    }

    /*═══════════════════ arithmetic the client should not do ═══════════════════*/

    /// @notice sqrt(1.0001^tick) · 2^96 — the only form a pool accepts.
    function sqrtAt(int24 tick) external pure returns (uint160) {
        return Tick.sqrtAt(tick);
    }

    /// @notice What a tick is worth, exactly.
    /// @dev    The client picks a tick with a logarithm in double precision,
    ///         which is fine because a tick is a choice. It then asks this
    ///         what that choice means, and shows the answer — so nobody is
    ///         ever told their order fills at the price they typed when it
    ///         fills at the nearest tick to it.
    function priceAt(int24 tick, uint256 unit, bool baseIsToken0)
        external pure returns (uint256)
    {
        return Mul.priceFromSqrt(Tick.sqrtAt(tick), unit, baseIsToken0);
    }

    function spacing(uint24 fee) external pure returns (int24) {
        return Tick.spacing(fee);
    }

    function usable(int24 tick, int24 sp) external pure returns (int24) {
        return Tick.usable(tick, sp);
    }
}
