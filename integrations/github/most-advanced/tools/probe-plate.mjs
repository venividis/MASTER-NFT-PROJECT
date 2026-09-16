#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · probe-plate — real gas for the permanence market in probe/Plate.sol

  Builds a genuine 512x512 Merkle tree (262,144 leaves, depth 18), posts a
  frame as contract code, and refutes one pixel by re-executing the
  fixed-point reference field on chain. Every number below is measured.

  Run:  node tools/probe-plate.mjs     (~2 min: the tree is real)
───────────────────────────────────────────────────────────────────────────*/
import { compile, artifact } from "./compile.mjs";
import { Chain, encodeAddressArg, decUint } from "./evm.mjs";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { hexToBytes, bytesToHex } from "ethereum-cryptography/utils.js";

const out = compile({ quiet: true, dirs: ["src", "probe"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();
const G = {};
const run = async (label, p) => { const r = await p; G[label] = r.gas; return r; };
const w = (n) => BigInt(n).toString(16).padStart(64, "0");

const assay = await c.deploy(A("probe/Plate.sol", "Assay").bytecode);
const plate = await c.deploy(A("probe/Plate.sol", "Plate").bytecode, encodeAddressArg(assay));

/* ── the reference field, priced on its own ── */
const PARAMS = "0x" + "5a".repeat(32);
const W = 512, H = 512;
for (const steps of [13, 49, 190]) {
  await run(`Assay.pixelAt  steps=${String(steps).padStart(3)}`, c.exec(assay,
    "pixelAt(bytes32,uint32,uint32,uint32,uint32,uint256)", [PARAMS, 211, 307, W, H, steps]));
}

/* ── a real 512x512 tree, depth 18 ── */
const N = W * H;
console.log(`  building a ${W}x${H} tree (${N} leaves) ...`);
const t0 = Date.now();
const cat = (a, b) => { const o = new Uint8Array(64); o.set(a, 0); o.set(b, 32); return o; };
const u256 = (n) => hexToBytes(w(n));
/*  leaves are deliberately WRONG, so the refutation path is the one that
    runs. The pixel challenged below is not what the field computes.     */
let level = new Array(N);
for (let i = 0; i < N; i++) {
  const leaf = u256(BigInt(i) * 7919n % (1n << 64n));
  level[i] = keccak256(cat(u256(i), leaf));
}
const LEAF_AT = (i) => u256(BigInt(i) * 7919n % (1n << 64n));
const levels = [level];
while (level.length > 1) {
  const next = new Array(level.length >> 1);
  for (let i = 0; i < next.length; i++) next[i] = keccak256(cat(level[2 * i], level[2 * i + 1]));
  levels.push(next); level = next;
}
const ROOT = "0x" + bytesToHex(levels[levels.length - 1][0]);
console.log(`  tree built in ${((Date.now() - t0) / 1000).toFixed(1)}s, depth ${levels.length - 1}, root ${ROOT.slice(0, 18)}...`);

const proofFor = (index) => {
  const p = []; let idx = index;
  for (let L = 0; L < levels.length - 1; L++) { p.push("0x" + bytesToHex(levels[L][idx ^ 1])); idx >>= 1; }
  return p;
};

/* ── the market ── */
const REWARD = 5n * 10n ** 16n;
const BOND   = 2n * 10n ** 15n;
const r = await run("Plate.commission", c.exec(plate, "commission(bytes32,uint32,uint32,uint32,uint64)",
  [PARAMS, W, H, 190, 6 * 3600], { value: REWARD }));
const JOB = "0x" + bytesToHex(keccak256(hexToBytes(
  "0x" + w(1) + plate.slice(2).padStart(64, "0") + w(0))));

/* post: one full EIP-170 shard of pixels, then read it back */
const CHUNK = "0x" + "ab".repeat(24575);
await run("Plate.post    (1 shard, 24,575 B)", c.exec(plate, "post(bytes32,bytes32,bytes)",
  [JOB, ROOT, CHUNK], { value: BOND }));
await run("Plate.addShard (a second, 24,575 B)", c.exec(plate, "addShard(bytes32,bytes)", [JOB, CHUNK]));
const back = await c.read(plate, "frame(bytes32)", [JOB]);
console.log(`  frame() returned ${(back.length - 2 - 128) / 2} bytes (head 64)`);

/* refute pixel (211, 307) — index 307*512 + 211 */
const X = 211, Y = 307, IDX = Y * W + X;
const PROOF = proofFor(IDX);
const challenger = await c.as("0x" + "e5".repeat(32));
await run(`Plate.challenge (depth ${PROOF.length}, steps=190)`, challenger.exec(plate,
  "challenge(bytes32,uint32,uint32,bytes32,bytes32[])",
  [JOB, X, Y, "0x" + bytesToHex(LEAF_AT(IDX)), PROOF]));
await run("Plate.withdraw (the challenger takes the bond)", challenger.exec(plate, "withdraw()", []));

console.log("\n  runtime bytecode");
for (const n of ["Assay", "Plate"]) {
  const b = (A("probe/Plate.sol", n).deployed.length - 2) / 2;
  console.log(`    ${n.padEnd(9)} ${String(b).padStart(6)} B   ${(100 * b / 24576).toFixed(1)}% of EIP-170`);
}
console.log("\n  gas");
for (const [k, v] of Object.entries(G)) console.log(`    ${k.padEnd(44)} ${String(v).padStart(10)}`);
console.log(`\n    challenger owed after refuting: ${decUint(await c.read(plate, "owed(address)", [challenger.from.toString()]))} wei (the bond)`);
