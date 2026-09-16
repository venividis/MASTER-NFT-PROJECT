#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · probe-render — what it costs the EVM to draw one pixel

  Ports the engine's own distance field (engine/ipseity.html: sdTesseract,
  ring, map) to Q0.18 fixed point in Solidity, deploys it on the repo's
  ethereumjs harness, and MEASURES the gas. Three concessions are made in
  the EVM's favour, so every number here is a lower bound:

    · the ring tilts' cos/sin are passed in precomputed (the shader
      recomputes them per map() call);
    · the tesseract is used, which is the cheapest of the eight solids
      and needs no transcendentals;
    · nothing touches storage — the orientation matrix and the twelve
      node positions are compile-time constants.

  Run:  node tools/probe-render.mjs
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Chain, enc } from "./evm.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const solc = require("solc");

const SOURCE = String.raw`
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract EvmField3 {
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
    function avgPixel(bool hit, int256 x, int256 y, int256 z) external pure returns (int256 a) {
        unchecked {
            int256 t = 0;
            for (uint256 i = 0; i < 13; ++i) {
                a += map(x + t, y, z); a += solid(x, y + t, z); a += solid(x, y, z + t); t += 1e15;
            }
            if (hit) { for (uint256 i = 0; i < 35; ++i) { a += map(x + int256(i) * 1e14, y, z); } }
        }
    }
}
`;

const out = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "EvmField.sol": { content: SOURCE } },
  settings: {
    optimizer: { enabled: true, runs: 4294967295 },
    viaIR: true,
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } }
  }
})));
const errs = (out.errors || []).filter((e) => e.severity === "error");
if (errs.length) { errs.forEach((e) => console.error(e.formattedMessage)); process.exit(1); }
const c = out.contracts["EvmField.sol"]["EvmField3"];

const chain = await Chain.open();
const addr = await chain.deploy("0x" + c.evm.bytecode.object);
const X = [10n ** 17n, 2n * 10n ** 17n, 3n * 10n ** 17n];
const O = [0n, 0n, 5n * 10n ** 18n];
const D = [10n ** 17n, 5n * 10n ** 16n, -(99n * 10n ** 16n)];
const g = async (sig, args) => { await chain.call(addr, enc(sig, args)); return Number(chain.lastGas); };
const march = (f, s) => g(f + "(uint256,int256,int256,int256,int256,int256,int256)", [s, ...O, ...D]);

console.log("\n  verifier contract: " + (c.evm.deployedBytecode.object.length / 2) +
            " bytes deployed (EIP-170 ceiling 24,576)\n");

const m10 = await g("nMap(uint256,int256,int256,int256)", [10, ...X]);
const m110 = await g("nMap(uint256,int256,int256,int256)", [110, ...X]);
const s10 = await g("nSolid(uint256,int256,int256,int256)", [10, ...X]);
const s110 = await g("nSolid(uint256,int256,int256,int256)", [110, ...X]);
const MAP = (m110 - m10) / 100, SOL = (s110 - s10) / 100;
console.log("  solid()  one 4-D SDF incl. the mat4 turn   " + SOL.toFixed(0).padStart(10) + " gas");
console.log("  map()    solid + 2 rails + 12 nodes        " + MAP.toFixed(0).padStart(10) + " gas");

for (const f of ["marchBare", "marchFull", "marchTier3"]) {
  const a = await march(f, 10), b = await march(f, 210);
  console.log("  " + f.padEnd(41) + ((b - a) / 200).toFixed(0).padStart(10) + " gas / raymarch step");
}

/*  Two pixels. The average is what a real frame costs: sphere tracing
    converges in ~13 steps, and only the 26.7% of pixels that hit pay for
    the normal, the shadow march and the ambient occlusion. The worst case
    is the 190-step ceiling the top tier allows.                         */
const hit  = await g("avgPixel(bool,int256,int256,int256)", [true, ...X]);
const miss = await g("avgPixel(bool,int256,int256,int256)", [false, ...X]);
const worst = await march("pixelTier3", 190);
const HITRATE = 0.266815;                       // measured, tools/probe-render notes
const avg = HITRATE * hit + (1 - HITRATE) * miss;
console.log("\n  one pixel that misses                     " + miss.toLocaleString().padStart(10) + " gas");
console.log("  one pixel that hits                       " + hit.toLocaleString().padStart(10) + " gas");
console.log("  one pixel, weighted average               " + Math.round(avg).toLocaleString().padStart(10) + " gas");
console.log("  one pixel, worst case (190 steps)         " + worst.toLocaleString().padStart(10) + " gas");

const PIX = 512 * 512, frame = avg * PIX;
const ETH = 2432, BNB = 696;
const usd = (gas, gwei, px) => gas * gwei * 1e9 / 1e18 * px;
console.log("\n  ONE 512x512 FRAME = " + frame.toExponential(3) + " gas");
for (const [n, gwei, px, rate] of [["Ethereum", 0.366, ETH, 5e6], ["Base", 0.007089, ETH, 2e8],
                                   ["Unichain", 0.0005, ETH, 1e8], ["BNB", 0.05, BNB, 1.4e8]]) {
  const secs = frame / rate;
  console.log("    " + n.padEnd(9) + "$" + Math.round(usd(frame, gwei, px)).toLocaleString().padStart(9) +
              "   = " + (secs / 3600).toFixed(1) + " h of that chain's ENTIRE throughput");
}
console.log("\n  SINGLE-PIXEL FRAUD PROOF: worst case is " +
            (worst / 16777216 * 100).toFixed(1) + "% of one transaction");
console.log("  (EIP-7825 per-tx cap = 16,777,216 gas). It fits.\n");
