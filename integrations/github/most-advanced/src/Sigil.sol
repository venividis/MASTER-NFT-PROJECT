// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Trig} from "./lib/Trig.sol";
import {LibNum} from "./lib/LibNum.sol";
import {Section} from "./lib/Types.sol";

/*═══════════════════════════════════════════════════════════════════════════

  SIGIL — the whole solid, drawn by the chain

  The living document shows a three-dimensional section: the part of the
  solid that the holder's 3-space currently cuts through. This contract
  draws the other thing — the whole four-dimensional object, all of it,
  projected down to a plane, turned by exactly the six angles the holder
  committed.

  So the two faces of a token are complementary. The animation is what you
  can stand inside and never all of it; the still is all of it and nothing
  you can stand inside. Both come out of the same 256-bit word.

  The projection
    A point in R⁴ is turned by six Givens rotations in the order the token
    stores them, projected to R³ by dividing through by distance along w
    (so the parts of the solid that are further away in the fourth
    dimension are drawn smaller — the same trick that makes a cube look
    like a cube on paper), then flattened to the page.

  What is drawn
    · forms 0–2 are polytopes, so their vertices and edges are enumerated
    · forms 3–6 are products of circles, so they are swept parametrically
    · form 7 is a quaternion Julia set, so what is drawn is the orbit
      itself: z ← z² + c, from a ring of starting points, cut where it
      escapes. The shape of the drawing is the shape of the dynamics.

═══════════════════════════════════════════════════════════════════════════*/
contract Sigil {
    using LibNum for uint256;

    int256 private constant ONE = 1e9;
    int256 private constant VIEW = 500;      // half the canvas, in SVG units

    /// @dev `drop` names the axis that is projected along. Dropping w gives
    ///      the ordinary view; dropping x, y or z gives the three other
    ///      elevations of the same object — drawings that only exist because
    ///      there are four axes to choose from.
    struct Rot { int256[6] c; int256[6] s; uint8 drop; }

    /*───────────────────── projection ─────────────────────*/

    function _rot(uint256 word) private pure returns (Rot memory r) {
        for (uint256 p; p < 6; ++p) {
            int256 a = Trig.fromU16(Section.angle(word, p));
            r.c[p] = Trig.cos(a);
            r.s[p] = Trig.sin(a);
        }
    }

    /// @dev The same six planes, in the same order, as the shader uses:
    ///      xy, xz, yz, xw, yw, zw.
    ///
    ///      Written out rather than driven by a table. The table was
    ///      `uint8[2][6] memory ij = [[0,1],[0,2],...]`, a nested memory
    ///      array literal, and it was rebuilt on every call — which is once
    ///      per point drawn, two hundred times for a swept form, eight
    ///      hundred for the quartet. Allocating and filling it cost more
    ///      than the twelve multiplications it was there to index, and came
    ///      to roughly half the gas of drawing the whole solid. With the
    ///      indices constant the compiler folds every offset away.
    ///
    ///      The four coordinates are then held in locals for the duration.
    ///      Read through the array, each of the twenty-four reads and
    ///      twenty-four writes carries a bounds check and a memory access;
    ///      here there are four of each, at the ends.
    ///
    ///      The arithmetic is unchanged: same planes, same order, same
    ///      truncation. All 144 drawings the collection can produce were
    ///      captured before and after and compared byte for byte.
    function _turn(int256[4] memory v, Rot memory r) private pure returns (int256[4] memory) {
        int256 x = v[0];
        int256 y = v[1];
        int256 z = v[2];
        int256 w = v[3];
        int256 c;
        int256 s;
        int256 a;

        c = r.c[0]; s = r.s[0]; a = x;                  // xy
        x = (c * a - s * y) / ONE;  y = (s * a + c * y) / ONE;
        c = r.c[1]; s = r.s[1]; a = x;                  // xz
        x = (c * a - s * z) / ONE;  z = (s * a + c * z) / ONE;
        c = r.c[2]; s = r.s[2]; a = y;                  // yz
        y = (c * a - s * z) / ONE;  z = (s * a + c * z) / ONE;
        c = r.c[3]; s = r.s[3]; a = x;                  // xw
        x = (c * a - s * w) / ONE;  w = (s * a + c * w) / ONE;
        c = r.c[4]; s = r.s[4]; a = y;                  // yw
        y = (c * a - s * w) / ONE;  w = (s * a + c * w) / ONE;
        c = r.c[5]; s = r.s[5]; a = z;                  // zw
        z = (c * a - s * w) / ONE;  w = (s * a + c * w) / ONE;

        v[0] = x; v[1] = y; v[2] = z; v[3] = w;
        return v;
    }

    /// @dev R⁴ → the page. The w-divide is what makes the picture read as a
    ///      solid seen from outside rather than a tangle of lines.
    function _flat(int256[4] memory v) private pure returns (int256 x, int256 y) {
        int256 d = 3 * ONE - v[3];                 // eye at w = 3
        if (d < ONE / 4) d = ONE / 4;              // never fold through the eye
        int256 k = (2 * ONE * ONE) / d;            // 4D perspective factor

        int256 px = (v[0] * k) / ONE;
        int256 py = (v[1] * k) / ONE;
        int256 pz = (v[2] * k) / ONE;

        // a fixed three-quarter view so the third axis is legible on paper
        int256 sx = (px * 924 - pz * 383) / 1000;
        int256 sy = (py * 900 - (px * 383 + pz * 924) * 300 / 1000) / 1000;

        x = 500 + (sx * VIEW) / (2 * ONE);
        y = 500 - (sy * VIEW) / (2 * ONE);
    }

    function _pt(int256[4] memory v, Rot memory r) private pure returns (string memory) {
        int256[4] memory t = _turn(v, r);
        if (r.drop != 3) { (t[r.drop], t[3]) = (t[3], t[r.drop]); }
        (int256 x, int256 y) = _flat(t);
        return string(abi.encodePacked(LibNum.strInt(x), ",", LibNum.strInt(y)));
    }

    /*───────────────────── the polytopes ─────────────────────*/

    /// @dev 16 vertices of the tesseract, as ±1 in each coordinate.
    function _tesseract(Rot memory r) private pure returns (bytes memory out) {
        int256[4][16] memory V;
        for (uint256 i; i < 16; ++i) {
            V[i] = [
                (i & 1) == 0 ? -ONE : ONE,
                (i & 2) == 0 ? -ONE : ONE,
                (i & 4) == 0 ? -ONE : ONE,
                (i & 8) == 0 ? -ONE : ONE
            ];
        }
        // an edge joins two vertices differing in exactly one coordinate
        for (uint256 i; i < 16; ++i) {
            for (uint256 b; b < 4; ++b) {
                uint256 j = i ^ (1 << b);
                if (j <= i) continue;
                out = abi.encodePacked(out, "M", _pt(_copy(V[i]), r), "L", _pt(_copy(V[j]), r));
            }
        }
    }

    /// @dev 8 vertices of the 16-cell: ±1 along each axis, every pair joined
    ///      except the two that are opposite. 24 edges.
    function _sixteenCell(Rot memory r) private pure returns (bytes memory out) {
        int256[4][8] memory V;
        for (uint256 a; a < 4; ++a) {
            int256[4] memory p;
            p[a] = ONE + ONE / 2;
            V[a * 2] = p;
            int256[4] memory q;
            q[a] = -(ONE + ONE / 2);
            V[a * 2 + 1] = q;
        }
        for (uint256 i; i < 8; ++i) {
            for (uint256 j = i + 1; j < 8; ++j) {
                if (i / 2 == j / 2) continue;                 // opposite pair
                out = abi.encodePacked(out, "M", _pt(_copy(V[i]), r), "L", _pt(_copy(V[j]), r));
            }
        }
    }

    /// @dev 24 vertices: every permutation of (±1, ±1, 0, 0). Two vertices
    ///      share an edge when they are at the minimum distance apart, which
    ///      for this normalisation is a squared distance of 2.
    function _twentyFourCell(Rot memory r) private pure returns (bytes memory out) {
        int256[4][24] memory V;
        uint256 n;
        for (uint256 a; a < 4; ++a) {
            for (uint256 b = a + 1; b < 4; ++b) {
                for (uint256 sa; sa < 2; ++sa) {
                    for (uint256 sb; sb < 2; ++sb) {
                        int256[4] memory p;
                        p[a] = sa == 0 ? ONE : -ONE;
                        p[b] = sb == 0 ? ONE : -ONE;
                        V[n++] = p;
                    }
                }
            }
        }
        for (uint256 i; i < 24; ++i) {
            for (uint256 j = i + 1; j < 24; ++j) {
                int256 d2;
                for (uint256 k; k < 4; ++k) {
                    int256 dd = (V[i][k] - V[j][k]) / 1e6;    // to units of 1e3
                    d2 += dd * dd;
                }
                if (d2 > 1_900_000 && d2 < 2_100_000) {       // 2·(1e3)² ± tolerance
                    out = abi.encodePacked(out, "M", _pt(_copy(V[i]), r), "L", _pt(_copy(V[j]), r));
                }
            }
        }
    }

    /*───────────────────── the swept forms ─────────────────────*/

    /// @dev Constants, not locals: the step count is an array size below,
    ///      and a memory array's length has to be known at compile time.
    uint256 private constant RINGS = 8;
    uint256 private constant STEPS = 24;

    /// @dev Products of two circles. The duocylinder's ridge and the Clifford
    ///      torus are the same surface at different radii; the tiger and the
    ///      ditorus put a third circle on top of it.
    function _swept(Rot memory r, uint8 form) private pure returns (bytes memory out) {
        (int256 r1, int256 r2, int256 r3) =
            form == 3 ? (ONE,          ONE,          int256(0)) :          // duocylinder
            form == 4 ? (ONE * 8 / 10, ONE * 8 / 10, ONE * 3 / 10) :       // Clifford torus
            form == 5 ? (ONE * 9 / 10, ONE * 6 / 10, ONE * 25 / 100)       // tiger
                      : (ONE * 9 / 10, ONE * 4 / 10, ONE * 18 / 100);      // ditorus

        /*  The inner angle depends only on k, and the ring loop walks the
            same twenty-five values of k eight times over. Evaluated in
            place that is four hundred series evaluations to produce fifty
            distinct numbers. Hoisted, it is fifty.                       */
        int256[STEPS + 1] memory ca;
        int256[STEPS + 1] memory sa;
        for (uint256 k; k <= STEPS; ++k) {
            int256 a = (Trig.TWO_PI * int256(k)) / int256(STEPS);
            ca[k] = Trig.cos(a);
            sa[k] = Trig.sin(a);
        }

        for (uint256 ring; ring < RINGS; ++ring) {
            int256 b = (Trig.TWO_PI * int256(ring)) / int256(RINGS);
            int256 cb = Trig.cos(b);
            int256 sb = Trig.sin(b);

            // a ring of radius r1 in the xy plane, carried around the zw
            // plane at radius r2, thickened by r3 out of the b direction
            int256 rr = r1 + (r3 * cb) / ONE;
            int256 ss = r2 + (r3 * sb) / ONE;
            int256 pz = (ss * cb) / ONE;
            int256 pw = (ss * sb) / ONE;

            for (uint256 k; k <= STEPS; ++k) {
                int256[4] memory v = [
                    (rr * ca[k]) / ONE, (rr * sa[k]) / ONE, pz, pw
                ];
                out = abi.encodePacked(out, k == 0 ? "M" : "L", _pt(v, r));
            }
        }
    }

    /*───────────────────── the fractal ─────────────────────*/

    /// @dev z ← z² + c in the quaternions, from a ring of starting points.
    ///      The polyline is cut the moment the orbit escapes, so what is
    ///      drawn is exactly the part of the dynamics that stays bounded.
    function _julia(Rot memory r, bytes32 seed) private pure returns (bytes memory out) {
        int256[4] memory c = _juliaC(seed);
        for (uint256 o; o < 9; ++o) {
            out = abi.encodePacked(out, _orbit(r, c, o));
        }
    }

    function _juliaC(bytes32 seed) private pure returns (int256[4] memory) {
        return [
            -(ONE * 44 / 100) + (int256(uint256(uint8(seed[0]))) - 128) * ONE / 750,
             (ONE * 34 / 100) + (int256(uint256(uint8(seed[1]))) - 128) * ONE / 750,
             (ONE * 10 / 100) + (int256(uint256(uint8(seed[2]))) - 128) * ONE / 900,
             (ONE *  6 / 100) + (int256(uint256(uint8(seed[3]))) - 128) * ONE / 900
        ];
    }

    /// @dev Hamilton square plus c, iterated until the orbit escapes.
    function _orbit(Rot memory r, int256[4] memory c, uint256 o)
        private pure returns (bytes memory out)
    {
        int256 a = (Trig.TWO_PI * int256(o)) / 9;
        int256[4] memory z = [
            (Trig.cos(a) * 7) / 10, (Trig.sin(a) * 7) / 10,
            (Trig.sin(a * 2 / 3) * 4) / 10, (Trig.cos(a * 2 / 3) * 4) / 10
        ];
        bool started;
        for (uint256 k; k < 14; ++k) {
            z = _qstep(z, c);
            if (_norm2(z) > 4 * 1e10) break;                    // escaped
            out = abi.encodePacked(out, started ? "L" : "M", _pt(_copy(z), r));
            started = true;
        }
    }

    /// @dev (x, u) -> (x^2 - u.u, 2xu) + c, the quaternion square.
    function _qstep(int256[4] memory z, int256[4] memory c)
        private pure returns (int256[4] memory)
    {
        int256 x = z[0];
        int256 d = ((z[1] * z[1]) + (z[2] * z[2]) + (z[3] * z[3])) / ONE;
        return [
            (x * x) / ONE - d       + c[0],
            (2 * x * z[1]) / ONE    + c[1],
            (2 * x * z[2]) / ONE    + c[2],
            (2 * x * z[3]) / ONE    + c[3]
        ];
    }

    function _norm2(int256[4] memory z) private pure returns (int256 m2) {
        for (uint256 q; q < 4; ++q) m2 += (z[q] / 1e4) * (z[q] / 1e4);
    }

    function _copy(int256[4] memory v) private pure returns (int256[4] memory) {
        return [v[0], v[1], v[2], v[3]];
    }

    /*───────────────────── the drawing ─────────────────────*/

    /// @notice The projected wireframe of the whole solid, as SVG path data.
    function path(uint256 word, bytes32 seed) public pure returns (bytes memory) {
        return pathAlong(word, seed, 3);
    }

    /// @notice The same solid, projected along a chosen axis.
    function pathAlong(uint256 word, bytes32 seed, uint8 drop)
        public pure returns (bytes memory)
    {
        Rot memory r = _rot(word);
        r.drop = drop % 4;
        uint8 f = Section.form(word);
        if (f == 0) return _tesseract(r);
        if (f == 1) return _sixteenCell(r);
        if (f == 2) return _twentyFourCell(r);
        if (f == 7) return _julia(r, seed);
        return _swept(r, f);
    }

    string[8] private NAMES = [
        "Tesseract", "Hexadecachoron", "Icositetrachoron", "Duocylinder",
        "Clifford torus", "Tiger", "Ditorus", "Quaternion Julia"
    ];
    /*  These go into SVG text and into JSON, and neither is escaped on the
        way out, so a character that means something to a parser cannot
        appear here. "z<-z2+c" did: a bare `<` is not character data, so the
        eighth solid's image was not an SVG at all - every client that asked
        for the thumbnail got a parse error. The arrow is the same glyph the
        instrument uses for the same map, and it is data in both formats. */
    string[8] private SCHLAFLI = [
        "{4,3,3}", "{3,3,4}", "{3,4,3}", "D2 x D2", "S1 x S1", "((II)(II))", "(((II)I)I)",
        unicode"z \u2190 z\u00b2 + c"
    ];

    function solidName(uint8 f) external view returns (string memory) {
        return NAMES[f % 8];
    }

    function solidNotation(uint8 f) external view returns (string memory) {
        return SCHLAFLI[f % 8];
    }

    /*───────────────────── the SVG ─────────────────────*/

    function svg(uint256 id, uint256 word, bytes32 seed, uint32 strata)
        external view returns (bytes memory)
    {
        return abi.encodePacked(
            _ground(word),
            '<g fill="none" stroke="hsl(', _hue(word), ',88%,64%)" stroke-width="1.4" ',
              'stroke-linecap="round" stroke-linejoin="round" opacity=".92" filter="url(#g)">',
              '<path d="', path(word, seed), '"/></g>',
            _plate(id, word, strata, _hue(word), _alt(word)),
            '</svg>'
        );
    }

    function _hue(uint256 word) private pure returns (string memory) {
        return ((uint256(Section.hue(word)) * 360) / 255).str();
    }

    function _alt(uint256 word) private pure returns (string memory) {
        return (((uint256(Section.hue(word)) * 360) / 255 + 186) % 360).str();
    }

    function _ground(uint256 word) private pure returns (bytes memory) {
        // the 3-space this token's section is cut in, seen edge-on
        string memory y = LibNum.strInt(
            500 + (int256(uint256(Section.offsetW(word))) - 32768) * 300 / 32768);
        return abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">',
            '<defs><radialGradient id="v" cx="50%" cy="46%" r="62%">',
              '<stop offset="0%" stop-color="hsl(', _hue(word), ',34%,9%)"/>',
              '<stop offset="100%" stop-color="#04050a"/></radialGradient>',
            '<filter id="g" x="-30%" y="-30%" width="160%" height="160%">',
              '<feGaussianBlur stdDeviation="7" result="b"/>',
              '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
            '</defs>',
            '<rect width="1000" height="1000" fill="url(#v)"/>',
            _rings(_alt(word)),
            '<line x1="70" y1="', y, '" x2="930" y2="', y, '" stroke="hsl(', _alt(word),
              ',60%,52%)" stroke-width="1" stroke-dasharray="2 9" opacity=".5"/>'
        );
    }

    /*───────────────── the quartet ─────────────────
      A four-dimensional object has four elevations, not three. This draws
      all of them: the same solid at the same committed orientation,
      projected along x, along y, along z, and along w. Three of those
      drawings are of something no three-dimensional object could cast.  */
    function quartet(uint256 id, uint256 word, bytes32 seed)
        external view returns (bytes memory out)
    {
        uint256 hue = (uint256(Section.hue(word)) * 360) / 255;
        string memory h = hue.str();
        string[4] memory label = ["along x", "along y", "along z", "along w"];

        out = abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">',
            '<rect width="1000" height="1000" fill="#04050a"/>',
            '<g stroke="#151a26" stroke-width="1">',
              '<line x1="500" y1="60" x2="500" y2="940"/>',
              '<line x1="60" y1="500" x2="940" y2="500"/></g>'
        );

        for (uint8 a; a < 4; ++a) {
            uint256 cx = (a % 2) == 0 ? 40 : 500;   // `tx` shadows a builtin
            uint256 cy = a < 2 ? 40 : 500;
            out = abi.encodePacked(out,
                '<g transform="translate(', cx.str(), ',', cy.str(), ') scale(0.46)">',
                '<path d="', pathAlong(word, seed, a),
                '" fill="none" stroke="hsl(', h, ',88%,64%)" stroke-width="2.6" ',
                'stroke-linecap="round" stroke-linejoin="round" opacity="', a == 3 ? ".95" : ".62", '"/></g>',
                '<text x="', (cx + 24).str(), '" y="', (cy + 448).str(),
                '" font-family="ui-monospace,Menlo,monospace" font-size="15" ',
                'letter-spacing="4" fill="#5d6780">', label[a], '</text>'
            );
        }

        out = abi.encodePacked(out,
            '<g font-family="ui-monospace,Menlo,monospace" font-size="17">',
            '<text x="500" y="34" text-anchor="middle" fill="#8b95ad" letter-spacing="8">IPSEITY #',
              id.str(), '</text>',
            '<text x="500" y="978" text-anchor="middle" fill="#3f4759" letter-spacing="3" font-size="13">',
              'four elevations of ', NAMES[Section.form(word) % 8],
              ' - three of them cast by nothing three-dimensional</text></g></svg>'
        );
    }

    function _rings(string memory h2) private pure returns (bytes memory) {
        return abi.encodePacked(
            '<circle cx="500" cy="500" r="404" fill="none" stroke="hsl(', h2,
              ',24%,20%)" stroke-width="1"/>',
            '<circle cx="500" cy="500" r="318" fill="none" stroke="hsl(', h2,
              ',24%,15%)" stroke-width="1"/>'
        );
    }

    function _plate(uint256 id, uint256 word, uint32 strata, string memory h, string memory h2)
        private view returns (bytes memory)
    {
        return abi.encodePacked(
            '<g font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="19">',
            '<text x="58" y="76" fill="#8b95ad" letter-spacing="9">IPSEITY</text>',
            '<text x="58" y="946" fill="hsl(', h, ',88%,68%)" letter-spacing="7">#',
              id.str(), '</text>',
            '<text x="942" y="946" text-anchor="end" fill="#5d6780" letter-spacing="4">',
              NAMES[Section.form(word) % 8], '</text>',
            '<text x="942" y="76" text-anchor="end" fill="#5d6780" letter-spacing="4">',
              SCHLAFLI[Section.form(word) % 8], '</text>',
            '<text x="58" y="908" fill="#3f4759" font-size="14" letter-spacing="3">',
              'w ', LibNum.fixed1(
                (int256(uint256(Section.offsetW(word))) * 3200000 / 65535) - 1600000, 6),
              '  strata ', uint256(strata).str(), '</text>',
            '<text x="942" y="908" text-anchor="end" fill="#3f4759" font-size="14" letter-spacing="3">',
              'the whole solid; the section is elsewhere</text>',
            '</g>'
        );
    }
}
