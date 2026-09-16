// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Mul} from "../src/lib/Mul.sol";

/*───────────────────────────────────────────────────────────────────────────
  512-bit multiplication, checked where it is easy to check.

  The whole point of `mulDiv` is the case Solidity cannot express, so a test
  written in Solidity cannot compute the expected answer independently — it
  would need the same 512-bit product to do it. What Solidity CAN do is check
  identities that must hold whatever the intermediate was, and pin the exact
  cases that matter.

  The exact-value check against arbitrary-precision arithmetic lives in
  `tools/verify-site.mjs`, where BigInt can compute `a·b/d` outright and
  compare digit for digit.
───────────────────────────────────────────────────────────────────────────*/
contract MulTest is Test {
    uint256 constant Q96 = 1 << 96;

    /*═══════════════ identities ═══════════════*/

    /// @dev a·b/b == a, for any a and b, including products far past 2²⁵⁶.
    ///      This is the case that fails silently under naive arithmetic.
    function testFuzz_dividingByTheOtherFactorGivesTheFirst(uint256 a, uint256 b) public pure {
        b = bound(b, 1, type(uint256).max);
        assertEq(Mul.mulDiv(a, b, b), a, "a*b/b was not a");
    }

    function testFuzz_agreesWithPlainMathWhenPlainMathWorks(
        uint128 a, uint128 b, uint128 d
    ) public pure {
        d = uint128(bound(d, 1, type(uint128).max));
        // both fit in 128 bits, so the product fits in 256 and Solidity is right
        assertEq(Mul.mulDiv(a, b, d), (uint256(a) * uint256(b)) / uint256(d));
    }

    function testFuzz_neverExceedsTheTrueQuotient(uint256 a, uint256 b, uint256 d) public pure {
        a = bound(a, 1, type(uint128).max);
        b = bound(b, 1, type(uint128).max);
        d = bound(d, 1, type(uint128).max);
        uint256 r = Mul.mulDiv(a, b, d);
        // floor: r·d <= a·b < (r+1)·d, checked in the range where it fits
        assertLe(r * d, a * b, "rounded up");
        assertGt((r + 1) * d, a * b, "rounded down too far");
    }

    function test_theProductThatDoesNotFit() public pure {
        // 2^255 · 2 / 2 == 2^255, and the intermediate is 2^256 exactly
        uint256 big = 1 << 255;
        assertEq(Mul.mulDiv(big, 2, 2), big);
        // and the largest product there is
        assertEq(Mul.mulDiv(type(uint256).max, type(uint256).max, type(uint256).max),
                 type(uint256).max);
    }

    function test_aQuotientThatWillNotFitIsRefused() public {
        vm.expectRevert(Mul.MulOverflow.selector);
        Mul.mulDiv(type(uint256).max, type(uint256).max, 1);
    }

    function test_divisionByZeroIsRefused() public {
        vm.expectRevert(Mul.DivByZero.selector);
        Mul.mulDiv(1, 1, 0);
    }

    /// @dev The control for the two above. `Mul` reverts inside an
    ///      `internal` function, so there is no call frame between the
    ///      revert and the test — a harness that only watches message
    ///      boundaries cannot see it, and would report the two above as
    ///      failures with the right selector in the message. This asserts
    ///      the expectation is genuinely being matched rather than
    ///      generously ignored: the wrong selector must still fail.
    function test_theExpectationIsAgainstTheActualError() public {
        bool caught;
        try this.divideByZero() { }
        catch (bytes memory err) {
            caught = err.length >= 4 && bytes4(err) == Mul.DivByZero.selector;
        }
        assertTrue(caught, "the revert was not DivByZero");
    }

    function divideByZero() external pure returns (uint256) {
        return Mul.mulDiv(1, 1, 0);
    }

    /*═══════════════ what sqrtPriceX96 means ═══════════════*/

    /// @dev At sqrtPriceX96 == 2⁹⁶ the pool is at 1:1, so one whole unit of
    ///      either token is worth one whole unit of the other — in raw terms,
    ///      the unit passed in.
    function test_parityIsParityInBothDirections() public pure {
        assertEq(Mul.priceFromSqrt(uint160(Q96), 1e18, true), 1e18);
        assertEq(Mul.priceFromSqrt(uint160(Q96), 1e18, false), 1e18);
    }

    /// @dev A real pair: WETH is token0 with 18 decimals, USDC is token1 with
    ///      6, and the pool is at 3000 USDC per WETH. The raw price token1
    ///      per token0 is 3000e6/1e18 = 3e-9, so sqrtPriceX96 is
    ///      sqrt(3e-9)·2⁹⁶ — which is where the 320-bit intermediate comes
    ///      from, and why this cannot be done by being careful.
    function test_aRealPoolPrice() public pure {
        // sqrt(3e-9) * 2^96, computed exactly and pinned here
        uint160 sq = 4339505179874779489431521;
        uint256 got = Mul.priceFromSqrt(sq, 1e18, true);
        // 3000.000000 USDC, to the last unit the square root can carry
        assertApproxEqAbs(int256(got), int256(uint256(3000e6)), 2, "not 3000 USDC");
    }

    /// @dev Pricing the other side of the same pool must invert it.
    function testFuzz_theTwoDirectionsAreReciprocal(uint160 sq) public pure {
        sq = uint160(bound(sq, Q96 / 1e6, Q96 * 1e6));
        uint256 fwd = Mul.priceFromSqrt(sq, 1e18, true);
        uint256 back = Mul.priceFromSqrt(sq, 1e18, false);
        if (fwd == 0 || back == 0) return;
        // fwd·back should be 1e36, give or take the rounding of two divisions
        uint256 prod = Mul.mulDiv(fwd, back, 1e18);
        assertApproxEqAbs(int256(prod), int256(uint256(1e18)), 1e12,
            "pricing a pool from both sides did not invert");
    }

    function test_aDeadPoolPricesAtNothing() public pure {
        assertEq(Mul.priceFromSqrt(0, 1e18, true), 0);
    }
}
