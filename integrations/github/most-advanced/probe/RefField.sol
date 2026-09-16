
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract RefField {
    int256 internal constant ONE = 1e18;

    function isqrt(uint256 a) internal pure returns (uint256 r) {
        if (a == 0) return 0;
        uint256 aa = a;
        r = 1;
        if (aa >= 0x100000000000000000000000000000000) { aa >>= 128; r <<= 64; }
        if (aa >= 0x10000000000000000) { aa >>= 64; r <<= 32; }
        if (aa >= 0x100000000) { aa >>= 32; r <<= 16; }
        if (aa >= 0x10000) { aa >>= 16; r <<= 8; }
        if (aa >= 0x100) { aa >>= 8; r <<= 4; }
        if (aa >= 0x10) { aa >>= 4; r <<= 2; }
        if (aa >= 0x4) { r <<= 1; }
        unchecked {
            r = (r + a / r) >> 1;
            r = (r + a / r) >> 1;
            r = (r + a / r) >> 1;
            r = (r + a / r) >> 1;
            r = (r + a / r) >> 1;
            r = (r + a / r) >> 1;
            r = (r + a / r) >> 1;
            uint256 q = a / r;
            return r < q ? r : q;
        }
    }

    function len2(int256 x, int256 y) internal pure returns (int256) {
        unchecked { return int256(isqrt(uint256(x * x + y * y))); }
    }
    function len3(int256 x, int256 y, int256 z) internal pure returns (int256) {
        unchecked { return int256(isqrt(uint256(x * x + y * y + z * z))); }
    }
    function len4(int256 x, int256 y, int256 z, int256 w) internal pure returns (int256) {
        unchecked { return int256(isqrt(uint256(x * x + y * y + z * z + w * w))); }
    }
    function fmul(int256 a, int256 b) internal pure returns (int256) {
        unchecked { return (a * b) / ONE; }
    }
    function ab(int256 a) internal pure returns (int256) { return a < 0 ? -a : a; }
    function mx(int256 a, int256 b) internal pure returns (int256) { return a > b ? a : b; }
    function mn(int256 a, int256 b) internal pure returns (int256) { return a < b ? a : b; }

    int256 internal constant R0=1e18; int256 internal constant R1=21e16; int256 internal constant R2=0; int256 internal constant R3=0;
    int256 internal constant R4=-21e16; int256 internal constant R5=1e18; int256 internal constant R6=0; int256 internal constant R7=0;
    int256 internal constant R8=0; int256 internal constant R9=0; int256 internal constant R10=1e18; int256 internal constant R11=13e16;
    int256 internal constant R12=0; int256 internal constant R13=0; int256 internal constant R14=-13e16; int256 internal constant R15=1e18;
    int256 internal constant WL=17e16;
    int256 internal constant B=82e16;

    function solid(int256 px, int256 py, int256 pz) internal pure returns (int256) {
        unchecked {
            int256 w = WL;
            int256 qx = fmul(R0, px) + fmul(R4, py) + fmul(R8, pz) + fmul(R12, w);
            int256 qy = fmul(R1, px) + fmul(R5, py) + fmul(R9, pz) + fmul(R13, w);
            int256 qz = fmul(R2, px) + fmul(R6, py) + fmul(R10, pz) + fmul(R14, w);
            int256 qw = fmul(R3, px) + fmul(R7, py) + fmul(R11, pz) + fmul(R15, w);
            int256 b = B;
            int256 dx = ab(qx) - b;
            int256 dy = ab(qy) - b;
            int256 dz = ab(qz) - b;
            int256 dw = ab(qw) - b;
            int256 l = len4(mx(dx, 0), mx(dy, 0), mx(dz, 0), mx(dw, 0));
            int256 vm = mx(mx(dx, dy), mx(dz, dw));
            return l + mn(vm, 0);
        }
    }

    int256 internal constant cA = 94e16; int256 internal constant sA = 33e16;
    int256 internal constant cB = 71e16; int256 internal constant sB = 70e16;
    int256 internal constant cC = 71e16; int256 internal constant sC = -70e16;
    int256 internal constant cD = 88e16; int256 internal constant sD = 47e16;

    function ring(int256 px, int256 py, int256 pz,
                  int256 rad, int256 tube,
                  int256 c1, int256 s1, int256 c2, int256 s2)
        internal pure returns (int256)
    {
        unchecked {
            int256 qy = fmul(c1, py) - fmul(s1, pz);
            int256 qz = fmul(s1, py) + fmul(c1, pz);
            int256 qx = fmul(c2, px) - fmul(s2, qz);
            qz        = fmul(s2, px) + fmul(c2, qz);
            int256 a  = len2(qx, qz) - rad;
            return len2(a, qy) - tube;
        }
    }

    int256 internal constant K = 52e15;

    function map(int256 px, int256 py, int256 pz) internal pure returns (int256) {
        unchecked {
            int256 res = solid(px, py, pz);
            int256 rA = ring(px, py, pz, 262e16, 40e14, cA, sA, cB, sB);
            int256 rB = ring(px, py, pz, 202e16, 32e14, cC, sC, cD, sD);
            int256 r = mn(rA, rB);
            if (r < res) res = r;
            int256 k = K;
            for (uint256 i = 0; i < 12; ++i) {
                int256 j = int256(i);
                int256 d = len3(px - (j * 21e16 - 12e17), py - (j * 13e16 - 8e17), pz - (j * 17e16 - 10e17)) - k;
                if (d < res) res = d;
            }
            return res;
        }
    }

    function marchFull(uint256 steps, int256 ox, int256 oy, int256 oz,
                       int256 dx, int256 dy, int256 dz)
        external pure returns (int256 t)
    {
        unchecked {
            for (uint256 i = 0; i < steps; ++i) {
                int256 d = map(ox + fmul(dx, t), oy + fmul(dy, t), oz + fmul(dz, t));
                t += d > 0 ? d : -d;
                if (t > 40 * ONE) t = ONE;
            }
        }
    }

    function marchBare(uint256 steps, int256 ox, int256 oy, int256 oz,
                       int256 dx, int256 dy, int256 dz)
        external pure returns (int256 t)
    {
        unchecked {
            for (uint256 i = 0; i < steps; ++i) {
                int256 d = solid(ox + fmul(dx, t), oy + fmul(dy, t), oz + fmul(dz, t));
                t += d > 0 ? d : -d;
                if (t > 40 * ONE) t = ONE;
            }
        }
    }

    function marchTier3(uint256 steps, int256 ox, int256 oy, int256 oz,
                        int256 dx, int256 dy, int256 dz)
        external pure returns (int256 t)
    {
        unchecked {
            for (uint256 i = 0; i < steps; ++i) {
                int256 x = ox + fmul(dx, t);
                int256 y = oy + fmul(dy, t);
                int256 z = oz + fmul(dz, t);
                int256 d = map(x, y, z);
                int256 g1 = solid(x, y + ONE / 3, z);
                int256 g2 = solid(x, y, z + ONE / 7);
                t += d > 0 ? d : -d;
                t += (g1 > 0 ? g1 : -g1) / 1000000;
                t += (g2 > 0 ? g2 : -g2) / 1000000;
                if (t > 40 * ONE) t = ONE;
            }
        }
    }

    /// one full pixel at tier 3: N march steps + grad3(4 map) + shadow(26 map) + ao(5 map)
    function pixelTier3(uint256 steps, int256 ox, int256 oy, int256 oz,
                        int256 dx, int256 dy, int256 dz)
        public pure returns (int256 t)
    {
        unchecked {
            for (uint256 i = 0; i < steps; ++i) {
                int256 x = ox + fmul(dx, t);
                int256 y = oy + fmul(dy, t);
                int256 z = oz + fmul(dz, t);
                int256 d = map(x, y, z);
                int256 g1 = solid(x, y + ONE / 3, z);
                int256 g2 = solid(x, y, z + ONE / 7);
                t += d > 0 ? d : -d;
                t += (g1 > 0 ? g1 : -g1) / 1000000;
                t += (g2 > 0 ? g2 : -g2) / 1000000;
                if (t > 40 * ONE) t = ONE;
            }
            // grad3: 4 taps
            for (uint256 i = 0; i < 4; ++i) {
                int256 v = map(ox + int256(int8(int256(i))) * 1e14, oy, oz);
                t += (v > 0 ? v : -v) / 1000000;
            }
            // shadow: 26 taps
            for (uint256 i = 0; i < 26; ++i) {
                int256 v = map(ox, oy + int256(int8(int256(i))) * 1e14, oz);
                t += (v > 0 ? v : -v) / 1000000;
            }
            // ao: 5 taps
            for (uint256 i = 0; i < 5; ++i) {
                int256 v = map(ox, oy, oz + int256(int8(int256(i))) * 1e14);
                t += (v > 0 ? v : -v) / 1000000;
            }
            // leanW: 2 solid taps
            t += solid(ox, oy, oz) / 1000000;
            t += solid(ox + 1e14, oy, oz) / 1000000;
        }
    }


    function nMap(uint256 n, int256 x, int256 y, int256 z) external pure returns (int256 a) {
        unchecked { for (uint256 i = 0; i < n; ++i) { a += map(x + int256(i), y, z); } }
    }
    function nSolid(uint256 n, int256 x, int256 y, int256 z) external pure returns (int256 a) {
        unchecked { for (uint256 i = 0; i < n; ++i) { a += solid(x + int256(i), y, z); } }
    }
    /// one pixel with the MEASURED average work: 13 march steps (1 map + 2 solid each)
    /// plus, on the 26.7% of pixels that hit, 35 further map taps.
    function avgPixel(bool hit, int256 x, int256 y, int256 z) public pure returns (int256 a) {
        unchecked {
            int256 t = 0;
            for (uint256 i = 0; i < 13; ++i) {
                a += map(x + t, y, z); a += solid(x, y + t, z); a += solid(x, y, z + t); t += 1e15;
            }
            if (hit) { for (uint256 i = 0; i < 35; ++i) { a += map(x + int256(i) * 1e14, y, z); } }
        }
    }
}
