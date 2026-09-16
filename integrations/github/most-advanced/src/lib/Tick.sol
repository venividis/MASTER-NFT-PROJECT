// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  Tick — the price ladder a v3 pool actually stores

  A Uniswap v3 pool does not store a price. It stores a tick: an integer `t`
  meaning the price 1.0001^t. Every boundary of every liquidity position is
  one of these integers, the oracle records them rather than prices, and the
  only price a pool will accept when it is created is the square root of one
  of them in Q64.96.

  So three of the things this site offers cannot be built without the
  conversion:

    · the chart, which reads ticks out of the pool's own oracle and has to
      turn each one into a number a person can read;
    · creating a pool, which needs `sqrtPriceX96` for the starting price;
    · a range order — a one-sided position that fills as the price crosses
      it, which is what a limit order is when nobody is running a server —
      whose two bounds are ticks and whose real fill price is whatever those
      ticks mean, not whatever the person typed.

  ── why this is on chain and not in the browser ──

  The client can find the *approximate* tick for a price with a logarithm in
  double precision, and that is fine, because a tick is a choice and being
  one tick out is being 0.01% out on a number the person is about to be
  shown. What must not happen is the page telling someone their order fills
  at the price they typed. So the browser picks a tick and this contract
  says what that tick is exactly worth, and the page shows the second number.

  Approximate to choose, exact to display. The half of the job that needs a
  logarithm is the half where being slightly wrong costs nothing.

  ── the table ──

  `sqrtAt` is Uniswap's own `TickMath.getSqrtRatioAtTick`, reproduced here
  rather than imported because this collection compiles from `src/` with no
  dependency tree. It is a binary decomposition: sqrt(1.0001) raised to each
  power of two is a constant, and multiplying together the constants whose
  bit is set in |tick| gives sqrt(1.0001^|tick|) in Q128.128. A negative
  tick is the reciprocal, taken at the end. The magic numbers are the
  constants, and they are the same nineteen values the pools themselves use
  — a different set would price every position on this site differently from
  the pool it is sent to.
───────────────────────────────────────────────────────────────────────────*/
library Tick {
    /// @dev log base 1.0001 of 2**-128 and 2**128. Past these a pool cannot
    ///      represent the price at all.
    int24 internal constant MIN_TICK = -887272;
    int24 internal constant MAX_TICK = 887272;

    uint160 internal constant MIN_SQRT = 4295128739;
    uint160 internal constant MAX_SQRT =
        1461446703485210103287273052203988822378723970342;

    error TickOutOfRange();

    /// @notice sqrt(1.0001^tick) · 2^96, exactly as the pool computes it.
    function sqrtAt(int24 tick) internal pure returns (uint160 sqrtPriceX96) {
        unchecked {
            uint256 a = tick < 0 ? uint256(-int256(tick)) : uint256(int256(tick));
            if (a > uint256(uint24(MAX_TICK))) revert TickOutOfRange();

            uint256 r = a & 0x1 != 0
                ? 0xfffcb933bd6fad37aa2d162d1a594001
                : 0x100000000000000000000000000000000;
            if (a & 0x2 != 0) r = (r * 0xfff97272373d413259a46990580e213a) >> 128;
            if (a & 0x4 != 0) r = (r * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
            if (a & 0x8 != 0) r = (r * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
            if (a & 0x10 != 0) r = (r * 0xffcb9843d60f6159c9db58835c926644) >> 128;
            if (a & 0x20 != 0) r = (r * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
            if (a & 0x40 != 0) r = (r * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
            if (a & 0x80 != 0) r = (r * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
            if (a & 0x100 != 0) r = (r * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
            if (a & 0x200 != 0) r = (r * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
            if (a & 0x400 != 0) r = (r * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
            if (a & 0x800 != 0) r = (r * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
            if (a & 0x1000 != 0) r = (r * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
            if (a & 0x2000 != 0) r = (r * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
            if (a & 0x4000 != 0) r = (r * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
            if (a & 0x8000 != 0) r = (r * 0x31be135f97d08fd981231505542fcfa6) >> 128;
            if (a & 0x10000 != 0) r = (r * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
            if (a & 0x20000 != 0) r = (r * 0x5d6af8dedb81196699c329225ee604) >> 128;
            if (a & 0x40000 != 0) r = (r * 0x2216e584f5fa1ea926041bedfe98) >> 128;
            if (a & 0x80000 != 0) r = (r * 0x48a170391f7dc42444e8fa2) >> 128;

            if (tick > 0) r = type(uint256).max / r;

            /*  Q128.128 to Q128.96, rounding up — so that the inverse
                conversion in the pool lands back on the same tick rather
                than one below it. A truncating shift here would make a
                position's lower bound occasionally one tick lower than the
                page said, which is a real difference in what fills.     */
            sqrtPriceX96 = uint160((r >> 32) + (r % (1 << 32) == 0 ? 0 : 1));
        }
    }

    /*═══════════════════ the grid ═══════════════════*/

    /// @notice How far apart the usable ticks are at a given fee tier.
    /// @dev    A position boundary must be a multiple of this. The pool
    ///         rejects anything else, so a page that lets a person choose a
    ///         boundary must round to it before showing them a price — not
    ///         after, or the price shown is not the price they get.
    ///         Zero means "not a tier this factory knows".
    function spacing(uint24 fee) internal pure returns (int24) {
        if (fee == 100) return 1;
        if (fee == 500) return 10;
        if (fee == 3000) return 60;
        if (fee == 10000) return 200;
        return 0;
    }

    /// @notice The nearest tick a position may actually use, clamped to the
    ///         representable range.
    /// @dev    Rounds to nearest rather than down, which is what Uniswap's
    ///         own `nearestUsableTick` does; rounding one way only would
    ///         bias every range a person asks for in the same direction.
    function usable(int24 tick, int24 sp) internal pure returns (int24) {
        unchecked {
            if (sp <= 0) return tick;
            if (tick > MAX_TICK) tick = MAX_TICK;
            if (tick < MIN_TICK) tick = MIN_TICK;

            int24 c = tick / sp;
            int24 rem = tick % sp;
            if (rem * 2 >= sp) ++c;
            else if (rem * 2 <= -sp) --c;

            int24 r = c * sp;
            // the outermost multiples of sp that are still inside the range
            int24 hi = (MAX_TICK / sp) * sp;
            if (r > hi) r = hi;
            if (r < -hi) r = -hi;
            return r;
        }
    }

    /*═══════════════════ what the oracle returns ═══════════════════*/

    /// @notice The arithmetic mean tick between two of a pool's cumulative
    ///         readings, taken over `elapsed` seconds.
    /// @dev    The rounding guard is not decoration. Integer division in
    ///         Solidity truncates toward zero, so a negative mean rounds
    ///         *up* — and a chart drawn from that has every point below
    ///         parity nudged the wrong way by up to one tick. Uniswap's own
    ///         OracleLibrary carries the same correction; this is that
    ///         correction, and the reason it is here rather than assumed.
    function meanTick(int56 cumulativeBefore, int56 cumulativeAfter, uint32 elapsed)
        internal pure returns (int24)
    {
        unchecked {
            if (elapsed == 0) return 0;
            int56 d = cumulativeAfter - cumulativeBefore;
            int56 e = int56(uint56(elapsed));
            int56 t = d / e;
            if (d < 0 && d % e != 0) --t;           // always toward -infinity
            if (t > int56(MAX_TICK)) t = int56(MAX_TICK);
            if (t < int56(MIN_TICK)) t = int56(MIN_TICK);
            return int24(t);
        }
    }
}
