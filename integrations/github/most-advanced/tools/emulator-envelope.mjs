#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · what an emulator costs

  Every byte count below was measured on this machine on 2026-08-22 — npm
  tarballs unpacked and run through the repo's own terser, wasm binaries
  extracted from EmulatorJS's 7-zip core bundles, ROM corpora cloned and
  stat'ed. Nothing here is an estimate unless the row says so.

  The gas model is lifted unchanged from tools/envelope.mjs so the two
  documents cannot drift.

    node tools/emulator-envelope.mjs
───────────────────────────────────────────────────────────────────────────*/
const ETH = 2432, BNB = 696;
const MAX_SHARD = 24575, TX_GAS_CAP = 16_777_216, RPC_GASCAP = 50_000_000;
const CH = [
  { n:"Ethereum", gwei:0.366,    l1wei:0,       px:ETH },
  { n:"Base",     gwei:0.007089, l1wei:16.41e6, px:ETH },
  { n:"Unichain", gwei:0.000500, l1wei:14.16e6, px:ETH },
  { n:"BNB",      gwei:0.050,    l1wei:0,       px:BNB }
];
const W_MARGINAL = 218.02, W_FIXED = 104_076;
const shards = N => Math.ceil(N / MAX_SHARD);
const writeGas = N => Math.round(W_MARGINAL*N + W_FIXED*shards(N));
const writeCalldata = N => N + 100*shards(N);
const readGas = N => Math.round(0.5205*N + N*N/131072);
const uriGas  = N => Math.round(84.7609*N + N*N/20972);
const usd = (g, cd, c) => (g*c.gwei*1e9 + cd*c.l1wei) / 1e18 * c.px;
const money = v => v < 0.01 ? "$"+v.toFixed(5) : v < 1000 ? "$"+v.toFixed(2) : "$"+Math.round(v).toLocaleString();
const gasS = g => g >= 1e6 ? (g/1e6).toFixed(2)+"M" : Math.round(g).toLocaleString();
const txs = N => { const g = writeGas(N), k = shards(N);
  return Math.max(k===0?0:Math.ceil(g/(TX_GAS_CAP-25000)),
    Math.ceil(k/Math.floor((TX_GAS_CAP-25000)/(W_MARGINAL*MAX_SHARD+W_FIXED)))); };

function row(label, N){
  console.log(`${label.padEnd(34)}${String(N.toLocaleString()).padStart(10)}${String(shards(N)).padStart(5)}${String(txs(N)).padStart(5)}${gasS(writeGas(N)).padStart(9)}` +
    CH.map(c => money(usd(writeGas(N), writeCalldata(N), c)).padStart(12)).join(""));
}
const hdr = t => { console.log("\n"+t);
  console.log("item".padEnd(34)+"bytes".padStart(10)+"shrd".padStart(5)+"txs".padStart(5)+"gas".padStart(9)+CH.map(c=>c.n.padStart(12)).join("")); };

/* ── measured emulator cores ─────────────────────────────────────────── */
hdr("A · THE MACHINE (one blob, shared by all 4096 tokens) — stored gzipped");
const CORES = [
  ["Octo CHIP-8 core, min+gz",              3_318],   // JohnEarnest/Octo js/emulator.js
  ["Octo CHIP-8 core+asm, min+gz",          5_267],
  ["WASM-4 fantasy console, min+gz",       24_001],   // wasm4.org/embed/wasm4.js
  ["wasmboy GB core .wasm, gz",            16_667],   // dist/core/core.untouched.wasm
  ["gameboy-emulator (JS) min+gz",         18_201],   // npm gameboy-emulator@1.1.2
  ["GameBoy-Online (JS) min+gz",           19_508],   // npm serverboy@0.0.7 core
  ["jsnes 2.1.0 (JS) min+gz",              31_524],   // npm jsnes@2.1.0
  ["binjgb GB .wasm + glue, gz",           35_507],   // 31,605 wasm + 3,902 js
  ["IodineGBA core (JS) min+gz",           64_346],   // taisel/IodineGBA, 46 files
  ["gambatte libretro .wasm, gz",       1_248_321],   // EmulatorJS stable core
  ["fceumm libretro .wasm, gz",         1_361_295],
  ["mgba libretro .wasm, gz",           1_368_829],
  ["snes9x libretro .wasm, gz",         1_480_265],
  ["+ libretro emscripten glue, gz",       66_158],   // identical (±425 B) across all four
];
for (const [l,n] of CORES) row(l,n);

hdr("B · THE CARTRIDGE (one inscription per game) — stored raw, uncompressed");
const CARTS = [
  ["CHIP-8, chip8Archive median",           2_270],   // 103 CC0 programs
  ["CHIP-8, chip8Archive p90",             33_005],
  ["CHIP-8, chip8Archive max (XO)",        65_024],
  ["CHIP-8, kripod median of 107",            286],
  ["WASM-4 cartridge, spec ceiling",       65_536],   // 64 KB hard limit
  ["Game Boy, ROM-only (32 KB)",           32_768],
  ["Game Boy, gb-test-roms max",           65_536],
  ["Game Boy, MBC5 ceiling",            8_388_608],
  ["NES, NROM-256",                        40_976],
  ["NES, p90 of 290 test ROMs",            65_552],
  ["GBA, smallest commercial (4 Mbit)",   524_288],
  ["GBA, typical (8 Mbit)",             1_048_576],
  ["GBA, ceiling (32 Mbit)",           33_554_432],
  ["SNES, Super Mario World (4 Mbit)",    524_288],
  ["SNES, largest cart (48 Mbit)",      6_291_456],
];
for (const [l,n] of CARTS) row(l,n);

/* ── whole systems ───────────────────────────────────────────────────── */
hdr("C · A WHOLE SYSTEM, machine + one cartridge, on one chain");
const SYS = [
  ["CHIP-8: Octo + median cart",       3_318 +  2_270],
  ["CHIP-8: Octo + p90 cart",          3_318 + 33_005],
  ["WASM-4: runtime + full 64 KB cart",24_001 + 65_536],
  ["Game Boy: wasmboy + 32 KB ROM",   16_667 + 32_768],
  ["Game Boy: JS core + 32 KB ROM",   18_201 + 32_768],
  ["NES: jsnes + NROM-256",           31_524 + 40_976],
  ["GBA: IodineGBA + 8 Mbit ROM",     64_346 + 1_048_576],
  ["SNES: snes9x wasm + SMW",      1_480_265 + 66_158 + 524_288],
];
for (const [l,n] of SYS) row(l,n);

/* ── reading it back ─────────────────────────────────────────────────── */
console.log("\n\nD · READ — can a browser actually GET it? (eth_call, geth rpc.gascap 50,000,000)");
console.log("payload".padEnd(34)+"bytes".padStart(10)+"web3:// request()".padStart(20)+"tokenURI data:".padStart(17)+"   verdict");
const READS = [
  ["Octo + median CHIP-8 cart",         3_318 + 2_270],
  ["wasmboy + 32 KB Game Boy ROM",     16_667 + 32_768],
  ["jsnes + NES NROM-256",             31_524 + 40_976],
  ["IodineGBA + 8 Mbit GBA ROM",       64_346 + 1_048_576],
  ["snes9x wasm + glue + SMW",      1_480_265 + 66_158 + 524_288],
  ["IPSEITY engine as shipped today",         41_057],
  ["IPSEITY engine + jsnes + NES ROM", 41_057 + 31_524 + 40_976],
];
for (const [l,N] of READS){
  const r = readGas(N), u = uriGas(N);
  console.log(l.padEnd(34)+String(N.toLocaleString()).padStart(10)+gasS(r).padStart(20)+gasS(u).padStart(17)+
    "   web3 "+(r<RPC_GASCAP?"OK  ":"FAIL")+" / tokenURI "+(u<RPC_GASCAP?"OK":"FAIL"));
}

/* ── the shared-blob argument ────────────────────────────────────────── */
console.log("\n\nE · SHARED BLOB vs PER-TOKEN COPY (4,096 tokens)");
for (const [l,n] of [["Octo CHIP-8 core",3_318],["wasmboy GB core",16_667],["jsnes",31_524],["IodineGBA",64_346],["snes9x libretro",1_480_265+66_158]]){
  const one = writeGas(n), many = writeGas(n)*4096;
  console.log(`${l.padEnd(24)} one copy ${gasS(one).padStart(9)} = ${money(usd(one,writeCalldata(n),CH[0])).padStart(10)} on L1` +
    `   ·   4,096 copies ${gasS(many).padStart(10)} = ${money(usd(many,writeCalldata(n)*4096,CH[0])).padStart(12)}`);
}
console.log("\n(EXTCODECOPY from a shared address costs the reader the same as from a private one:");
console.log(" 2,600 cold-account gas + 3 per word. Sharing is free at read time and 4,096x cheaper at write time.)");
