// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  Mul — a·b/d without losing the middle

  A Uniswap v3 pool states its price as `sqrtPriceX96`, a uint160 fixed-point
  number, and the price it means is that value squared over 2^192. Squaring a
  uint160 needs 320 bits. There is no way to do it in a uint256 by being
  careful about the order of operations; the intermediate genuinely does not
  fit, and every arrangement that appears to work is throwing away bits and
  hoping the answer is close enough.

  So: the full 512-bit product, then a division that reduces it back. This is
  Remco Bloemen's method, the same one Uniswap's own FullMath uses, and it is
  reproduced here rather than imported because the whole collection compiles
  from `src/` with no dependency tree.

  How it works, briefly, because assembly that is not explained is assembly
  nobody can check:

    · `mulmod(a, b, 2^256 - 1)` recovers the high 256 bits of a·b, which
      Solidity's `a * b` discards. Together with the low word that is the
      whole product.
    · if the high word is zero the product fit after all, and it is one
      division.
    · otherwise: divide the 512-bit numerator by the largest power of two in
      the denominator (a shift), which makes what remains odd; an odd number
      is invertible modulo 2^256, and Newton-Raphson finds that inverse in
      six doublings from a three-bit seed. Multiplying by the inverse is the
      division.
───────────────────────────────────────────────────────────────────────────*/
library Mul {
    error MulOverflow();
    error DivByZero();

    /// @notice floor(a · b / d), exact, for any a, b, d whose result fits.
    function mulDiv(uint256 a, uint256 b, uint256 d) internal pure returns (uint256 r) {
        unchecked {
            // the 512-bit product, as two 256-bit words
            uint256 lo;
            uint256 hi;
            assembly {
                let mm := mulmod(a, b, not(0))
                lo := mul(a, b)
                hi := sub(sub(mm, lo), lt(mm, lo))
            }

            if (hi == 0) {
                if (d == 0) revert DivByZero();
                return lo / d;
            }
            // the quotient has to fit in 256 bits
            if (d <= hi) revert MulOverflow();

            // subtract the remainder, so the numerator divides exactly
            uint256 rem;
            assembly {
                rem := mulmod(a, b, d)
                hi := sub(hi, gt(rem, lo))
                lo := sub(lo, rem)
            }

            // factor the powers of two out of d, and shift the numerator by
            // the same amount
            uint256 twos = d & (~d + 1);
            assembly {
                d := div(d, twos)
                lo := div(lo, twos)
                // the bits of hi that shift down into lo
                twos := add(div(sub(0, twos), twos), 1)
            }
            lo |= hi * twos;

            // d is odd now, so it has an inverse mod 2^256. Six Newton steps
            // take a correct-to-3-bits seed to correct-to-256.
            uint256 inv = (3 * d) ^ 2;
            inv *= 2 - d * inv;   //   8
            inv *= 2 - d * inv;   //  16
            inv *= 2 - d * inv;   //  32
            inv *= 2 - d * inv;   //  64
            inv *= 2 - d * inv;   // 128
            inv *= 2 - d * inv;   // 256

            r = lo * inv;
        }
    }

    /// @notice What `sqrtPriceX96` actually means: how many of the other
    ///         token one whole unit of this one is worth.
    /// @param sqrtPriceX96 the pool's slot0 price
    /// @param unit         one whole unit of the token being priced, 10**dec
    /// @param baseIsToken0 whether the token being priced is the pool's token0
    /// @return the value of `unit`, in the other token's smallest unit
    /// @dev    price(token1 per token0) = sqrtPriceX96² / 2¹⁹². Taken in two
    ///         halves so neither intermediate needs more than 512 bits.
    function priceFromSqrt(uint160 sqrtPriceX96, uint256 unit, bool baseIsToken0)
        internal pure returns (uint256)
    {
        uint256 p = uint256(sqrtPriceX96);
        if (p == 0) return 0;
        uint256 Q96 = 1 << 96;
        if (baseIsToken0) {
            // unit · p / 2^96 · p / 2^96
            return mulDiv(mulDiv(unit, p, Q96), p, Q96);
        }
        // unit · 2^96 / p · 2^96 / p
        return mulDiv(mulDiv(unit, Q96, p), Q96, p);
    }
}
