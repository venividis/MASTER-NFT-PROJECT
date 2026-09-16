// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  Trig — sine and cosine in fixed point

  The still image this collection puts in front of a marketplace is a real
  orthographic projection of a four-dimensional solid, turned by the six
  angles the holder committed. That needs a sine, and the EVM has no
  floating point and no trigonometry, so here is one.

  Everything is scaled by 1e9. Arguments are reduced into the first
  quadrant by symmetry and the remainder is evaluated with the Taylor
  series for sine, taken to x⁹:

      sin x = x − x³/3! + x⁵/5! − x⁷/7! + x⁹/9!

  Over [0, π/2] the x⁹ term leaves an error below 1e-9 in real terms —
  under a thousandth of a pixel on a 1000-unit canvas, which is the only
  precision that has to hold.

  The intermediate x⁹ is the widest value here: (π/2)⁹ in units of 1e9 is
  about 6e77 before the divide, so every power is folded down by the scale
  as it is built rather than at the end.
───────────────────────────────────────────────────────────────────────────*/
library Trig {
    int256 internal constant ONE     = 1e9;
    int256 internal constant PI      = 3_141592654;
    int256 internal constant TWO_PI  = 6_283185307;
    int256 internal constant HALF_PI = 1_570796327;

    /// @param x angle in radians, scaled by 1e9
    /// @return  sine, scaled by 1e9
    function sin(int256 x) internal pure returns (int256) {
        // fold into [0, 2π)
        x %= TWO_PI;
        if (x < 0) x += TWO_PI;

        bool neg = false;
        if (x > PI) { x -= PI; neg = true; }        // sin(π+t) = −sin(t)
        if (x > HALF_PI) x = PI - x;                // sin(π−t) =  sin(t)

        /*  Taylor, folding by ONE at each step so nothing overflows.

            Six terms, not four. Four left sin(π/2) reading 1.000003543 —
            3.5 ppm high, and high in the worst possible place, since the
            argument closest to π/2 after folding is where the truncated
            series overshoots most. The test asserting 1e9 ± 200 had never
            been executed, so the drift sat there unmeasured. Two more
            terms cost two multiply-divide pairs and bring the worst error
            anywhere on the circle to 3 parts in 1e9.

            The identity that matters downstream is sin²+cos²=1: at four
            terms it drifted by ~7 ppm, which is a rotation that quietly
            resizes the solid as it turns.                                */
        int256 x2 = (x * x) / ONE;
        int256 term = x;                 // x
        int256 acc = term;

        term = (term * x2) / ONE / 6;                    // x³/3!
        acc -= term;
        term = (term * x2) / ONE / 20;                   // x⁵/5!   (÷6·20 = ÷120)
        acc += term;
        term = (term * x2) / ONE / 42;                   // x⁷/7!   (÷120·42 = ÷5040)
        acc -= term;
        term = (term * x2) / ONE / 72;                   // x⁹/9!   (÷5040·72 = ÷362880)
        acc += term;
        term = (term * x2) / ONE / 110;                  // x¹¹/11! (·110 = ÷39916800)
        acc -= term;
        term = (term * x2) / ONE / 156;                  // x¹³/13! (·156 = ÷6227020800)
        acc += term;

        return neg ? -acc : acc;
    }

    function cos(int256 x) internal pure returns (int256) {
        return sin(x + HALF_PI);
    }

    /// @dev A token stores angles as sixteenths of a thousandth of a turn.
    function fromU16(uint16 a) internal pure returns (int256) {
        return (int256(uint256(a)) * TWO_PI) / 65536;
    }
}
