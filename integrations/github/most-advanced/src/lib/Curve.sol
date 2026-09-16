// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Section} from "./Types.sol";
import {Trig} from "./Trig.sol";

/*───────────────────────────────────────────────────────────────────────────
  CURVE — the shape of the solid is the shape of the market

  A pool needs an invariant: a rule saying what combinations of the two
  reserves are equivalent, so that any trade can be priced by moving along
  it. The plain constant product is x·y = k.

  This one is

      (x + vx)·(y + vy) = k

  where vx and vy are *virtual* reserves — liquidity the curve prices
  against but does not actually hold. Adding them flattens the curve near
  the current price, which is what a market maker means by "concentrating"
  liquidity: trades near the middle move the price less, and the same
  inventory does more work.

  vx and vy come from the token's section word — and specifically from the
  SECTION, which is the thing you are looking at:

      a wide section     →  vx, vy ≈ 0     →  plain constant product,
                                              a wide, forgiving market
      a thin sliver      →  vx, vy large   →  a tight market that holds
                                              its price

  Rotating the artwork re-prices the market. The picture is not a picture
  of the pool; it is a readout of it — and now that is true rather than
  merely claimed.

  ── what this replaced, and why ──

  This used to be the sum of the three w-plane angles' distance from rest.
  Two things were wrong with that, both measured against the engine's own
  rotation code before it was changed.

  It ignored the solid and the offset entirely. `form` and `offsetW` were
  read by the renderer and by one metadata trait and by nothing else, so a
  Tesseract and a Ditorus and a Julia produced a byte-identical market.
  "The curve is the solid" was false; all eight were the same slider.

  And a sum of angles is not a function of the cut. The plane you see is
  determined by u = R·e_w, and turning π in two w-planes returns u exactly
  where it started. So:

      angles (0,0,0)             u = (0,0,0, 1)   old concentration 0.00x
      angles (π,π,0)             u = (0,0,0, 1)   old concentration 5.33x
      angles (π,π,π)             u = (0,0,0,−1)   old concentration 8.00x

  The second row is the same cut plane as rest — the artwork renders
  completely unturned while the market sits at two thirds of maximum. The
  third is the mirror plane, an identical section for seven of the eight
  solids, at maximum. A holder could max out their own market while the
  token looked untouched. Under the rule that a control never lies, that
  was a control that lied.

  ── how the section is priced now ──

  The plane is ⟨x, u⟩ = w with u = R·e_w, which works out in closed form:

      u = (−s₃, −s₄c₃, −s₅c₄c₃, c₅c₄c₃)

  for the three w-plane angles. The three NON-w planes leave u fixed — the
  engine applies them first and they never touch index 3 — so spinning the
  picture without changing its shape leaves the market alone, which is
  exactly the right set of degrees of freedom and is now the reason rather
  than a coincidence.

  What that plane cuts is then looked up. The slice volume was measured off
  the engine's own distance functions, and the surprise is worth recording:
  u_w alone — "how far it is turned out of your 3-space", the quantity the
  old code was trying to express — explains almost nothing (R² ≤ 0.28 on
  every solid). Two invariants do the work, and they split the family in
  half:

      m = max|uᵢ|        the polytopes   (Tesseract R² 0.86, 16-cell 0.71)
      p = u_z² + u_w²    the tori        (Ditorus R² 0.81, Tiger 0.58)

  The 24-cell is explained by neither, because it is self-dual and its
  slice barely varies with direction at all — 238..255 across the whole
  table, which is the table honestly recording an isotropy rather than
  failing to find a pattern.

  The number is an approximation and is meant to be read as one: sixteen
  direction cells and four offsets per solid, linearly interpolated. What
  it is not is arbitrary — it is a real function of the plane, so the same
  cut always prices the same, and it differs between solids because their
  sections genuinely differ.

  ── why this family and not a prettier one ──

  The tempting move is to let the six angles drive an arbitrary invariant.
  They cannot. An invariant has to be monotonic and convex or a trader can
  walk the curve back on itself and take the reserves for nothing. This
  family is constant product with a change of origin, so it inherits
  constant product's proof: the invariant is a hyperbola for every legal
  parameter, and no rotation the holder can commit will bend it into a
  shape that leaks.

  The one thing virtual reserves do break is the guarantee that the pool
  can pay. A curve that prices against liquidity it does not hold will
  happily quote an output larger than the real balance. That is not fixed
  by cleverness, it is fixed by refusing the trade — see MAX_OUT_BPS in
  Pool.sol. The pool has a maximum trade size, and says so.
───────────────────────────────────────────────────────────────────────────*/
library Curve {
    /// @dev Reserves are uint112 as in Uniswap v2, so x + vx stays under
    ///      2^120 and the product under 2^240 with room to spare.
    uint256 internal constant MAX_RESERVE = type(uint112).max;

    /// @dev Virtual reserves cap at 8x real. Beyond that the curve is so
    ///      flat that the maximum payable trade becomes uselessly small.
    uint256 internal constant MAX_CONCENTRATION = 80_000;   // 8.0000x, in bps
    uint256 internal constant BPS = 10_000;

    error ReserveOverflow();
    error NoLiquidity();
    error ZeroInput();

    /*───────────────── the section, read as a market ─────────────────*/

    /*  How far each cut is from the one the solid sits at when nothing has
        been turned — 255 at rest, falling to 0 at the cut that differs
        most. Measured off the engine's own distance functions.

        DEVIATION, not size, and the difference is the whole design. The
        obvious rule is "thin section, tight market", and it is wrong here:
        a tesseract cut square across an axis gives the SMALLEST slice it
        has, so under that rule every freshly minted tesseract would open
        at maximum concentration. Measured, not assumed — rest is the
        narrowest cut for the Tesseract, the widest for the 16-cell, the
        Ditorus and the Julia, and somewhere between for the rest.

        So the reference is rest, and the market widens or tightens by how
        far you have moved from it in either direction. An untouched token
        is plain constant product, which is the promise the contract has
        always made; turning it in any direction tightens the market; and
        the amount it tightens per degree turned is different for every
        solid, because their sections deviate differently. That last part
        is "the curve is the solid", and it is now arithmetic rather than
        a claim.

        Sixteen cells per solid: four buckets of m = max|uᵢ| crossed with
        four of p = u_z² + u_w², row-major in m. A cell no unit vector can
        land in carries its nearest measured neighbour, so a lookup never
        returns a hole.                                                  */
    bytes internal constant SLICE =
        hex"0000101015100b0b7a404560e44045ff"   // Tesseract
        hex"0c0c0000252c323e70384457c73844ff"   // 16-cell
        hex"efefffff3050601020003040700030ff"   // 24-cell
        hex"10100000c52908cede2131bdef2131ff"   // Duocylinder
        hex"09090000d1140bdfdd1d39d4fc1d39ff"   // Clifford
        hex"d6d6343446da30b93bae00a329ae00ff"   // Tiger
        hex"1b1b4949072754f5111d66f3001d66ff"   // Ditorus
        hex"070775757500608a225a91acc15a91ff";  // Julia

    /*  And how fast the slice shrinks as the cut moves off centre, at
        w = 0, 0.45, 0.90, 1.35, averaged over direction. The shapes
        differ in a way you can read: the Clifford torus is still 55% of
        itself two thirds of the way out because a torus keeps meeting the
        plane, while the Julia set has all but vanished by the first step. */
    bytes internal constant FALLOFF =
        hex"ffb93401" hex"ffa10500" hex"ffb61c00" hex"ffc03300"
        hex"ffe28e06" hex"ffd57b00" hex"ffd45501" hex"ff620000";

    /// @dev The section plane's normal, u = R·e_w, in units of 1e9.
    ///      Closed form: the three planes that do not contain w never
    ///      touch index 3, so only the w-planes appear.
    function cutDirection(uint256 word)
        internal pure returns (int256 ux, int256 uy, int256 uz, int256 uw)
    {
        int256 a3 = Trig.fromU16(Section.angle(word, 3));
        int256 a4 = Trig.fromU16(Section.angle(word, 4));
        int256 a5 = Trig.fromU16(Section.angle(word, 5));
        int256 c3 = Trig.cos(a3);
        int256 c4 = Trig.cos(a4);
        ux = -Trig.sin(a3);
        uy = (-Trig.sin(a4) * c3) / Trig.ONE;
        int256 c43 = (c4 * c3) / Trig.ONE;
        uz = (-Trig.sin(a5) * c43) / Trig.ONE;
        uw = (Trig.cos(a5) * c43) / Trig.ONE;
    }

    /// @notice How tightly this token's market is concentrated, in bps of
    ///         the real reserves — a function of the plane the section is
    ///         cut on, where along it the cut sits, and which solid is
    ///         being cut. The same cut always prices the same.
    /// @return bps 0 (plain constant product) .. MAX_CONCENTRATION
    function concentration(uint256 word) internal pure returns (uint256 bps) {
        (int256 ux, int256 uy, int256 uz, int256 uw) = cutDirection(word);

        int256 ax = ux < 0 ? -ux : ux;
        int256 ay = uy < 0 ? -uy : uy;
        int256 az = uz < 0 ? -uz : uz;
        int256 aw = uw < 0 ? -uw : uw;
        int256 m = ax; if (ay > m) m = ay; if (az > m) m = az; if (aw > m) m = aw;
        /*  m runs [0.5, 1] over the sphere, so it is rebased before
            bucketing or three of the four cells would never be reached. */
        uint256 mi = uint256(m) <= 5e8 ? 0 : ((uint256(m) - 5e8) * 4) / 5e8;
        if (mi > 3) mi = 3;
        uint256 p = uint256((az * az) / Trig.ONE + (aw * aw) / Trig.ONE);
        uint256 pi_ = (p * 4) / uint256(Trig.ONE);
        if (pi_ > 3) pi_ = 3;

        uint256 f = uint256(Section.form(word));
        if (f > 7) f = 7;
        uint256 open = uint256(uint8(SLICE[f * 16 + mi * 4 + pi_]));

        /*  The offset, folded to a distance from centre so a cut at +w and
            one at −w price alike — they are mirror sections of the same
            size, and the picture shows them as such.                    */
        uint256 raw = uint256(Section.offsetW(word));
        uint256 d = raw > 32768 ? raw - 32768 : 32768 - raw;   // 0 .. 32768
        uint256 step = (d * 3) / 32768;                        // which pair
        if (step > 2) step = 2;
        uint256 frac = ((d * 3) % 32768);
        uint256 lo = uint256(uint8(FALLOFF[f * 4 + step]));
        uint256 hi = uint256(uint8(FALLOFF[f * 4 + step + 1]));
        uint256 fall = (lo * (32768 - frac) + hi * frac) / 32768;

        /*  Two independent ways to be away from rest — the direction of
            the cut and its distance along w — combined so that either one
            alone tightens the market and both together tighten it more. */
        uint256 open_ = (open * fall) / 255;                   // 255 at rest
        return ((255 - open_) * MAX_CONCENTRATION) / 255;
    }

    /// @notice The virtual reserves this section adds to each side.
    /// @notice The offsets a market anchors to, computed once from the
    ///         reserves as they stand at that moment.
    /// @dev    ANCHORING, not deriving. This is called when liquidity or the
    ///         curve changes and the result is stored; it is never called
    ///         from a trade.
    ///
    ///         It used to be called on every quote, from the live reserves,
    ///         and that was a critical bug. Virtual reserves proportional to
    ///         live reserves re-anchor the curve after every trade: k is
    ///         conserved *within* a trade and not *across* two, so buying
    ///         and selling straight back extracted the difference. At 8x
    ///         concentration and a trade worth a third of the reserve, 400
    ///         units in came back as 718. The fuzz suite found it — see
    ///         tools/fuzz.mjs, "a round trip never profits".
    ///
    ///         Held as an offset, the curve stays where it was put, and the
    ///         only thing that moves it is the holder deliberately moving
    ///         it.
    function anchor(uint256 word, uint256 rBase, uint256 rQuote)
        internal pure returns (uint256 vBase, uint256 vQuote)
    {
        uint256 c = concentration(word);
        vBase = (rBase * c) / BPS;
        vQuote = (rQuote * c) / BPS;
    }

    /*───────────────── pricing ─────────────────*/

    /// @notice How much comes out for `amountIn` going in.
    /// @dev    The fee is taken off the amount used for pricing but the whole
    ///         input still lands in the reserves, so k rises on every trade
    ///         and the fee accrues to whoever holds the token. Rounding is
    ///         always toward the pool.
    /// @param vIn  the anchored offset on the incoming side
    /// @param vOut the anchored offset on the outgoing side
    /// @dev   Both are passed in rather than derived. The caller holds them;
    ///        see `anchor` for why that distinction is the whole ballgame.
    function amountOut(
        uint256 amountIn,
        uint256 rIn,
        uint256 rOut,
        uint256 vIn,
        uint256 vOut,
        uint256 feeBps
    ) internal pure returns (uint256 out) {
        if (amountIn == 0) revert ZeroInput();
        if (rIn == 0 || rOut == 0) revert NoLiquidity();

        uint256 x = rIn + vIn;
        uint256 y = rOut + vOut;
        uint256 k = x * y;

        uint256 inAfterFee = (amountIn * (BPS - feeBps)) / BPS;
        uint256 xNew = x + inAfterFee;

        // round the pool's remaining balance up, so the trader never gains
        // the rounding dust
        uint256 yNew = (k + xNew - 1) / xNew;
        out = y > yNew ? y - yNew : 0;
    }

    /// @notice What one unit of the input side is worth right now, scaled by
    ///         1e18. For display only — a real trade moves the price.
    function spot(uint256 rIn, uint256 rOut, uint256 vIn, uint256 vOut)
        internal pure returns (uint256)
    {
        if (rIn == 0 || rOut == 0) return 0;
        return ((rOut + vOut) * 1e18) / (rIn + vIn);
    }

    /// @notice The invariant, for tests that need to prove it never falls.
    /// @dev    Takes the anchored offsets, so what it measures is the
    ///         quantity trading actually conserves rather than a quantity
    ///         that moves underneath it.
    function invariant(uint256 rIn, uint256 rOut, uint256 vIn, uint256 vOut)
        internal pure returns (uint256)
    {
        return (rIn + vIn) * (rOut + vOut);
    }
}
