/* IPSEITY — the economic envelope. All inputs measured 2026-08-22. */
const ETH = 2432, BNB = 696;                       // USD, 3 independent sources
const MAX_SHARD = 24575;                            // src/lib/SSTORE2.sol MAX_SHARD
const TX_GAS_CAP = 16_777_216;                      // EIP-7825, Final, live on L1+Base+BSC
const RPC_GASCAP = 50_000_000;                      // geth eth/ethconfig/config.go:74

/* chains: gwei = all-in L2/L1 execution gas price; l1wei = marginal L1 DA cost per calldata byte */
const CH = [
  { n:"Ethereum", gwei:0.366,   l1wei:0,        px:ETH, note:"base 0.1994 + tip 0.1664 (1024-block median)" },
  { n:"Base",     gwei:0.007089,l1wei:16.41e6,  px:ETH, note:"base 0.005765 + tip 0.001324 (200-block median)" },
  { n:"Unichain", gwei:0.000500,l1wei:14.16e6,  px:ETH, note:"base 0.0005 (floor) + tip ~0" },
  { n:"BNB",      gwei:0.050,   l1wei:0,        px:BNB, note:"base 0 + tip 0.05 (200-block median)" }
];

/* WRITE, fitted to measurement (Osaka, incompressible payload, Engine.loadBody path):
   1024->325,414  4096->973,945  8192->1,861,733  16384->3,638,268  24575->5,415,874 */
const W_MARGINAL = 218.02, W_FIXED = 104_076;   // marginal from LIVE eth_estimateGas on all four chains
                                                // (1,024 B -> 278,189 gas ; 24,575 B -> 5,412,653 gas, identical on ETH/Base/Unichain/BSC)
                                                // W_FIXED is the factory+registry path measured on ethereumjs @ Osaka; a bare
                                                // create-tx with no bookkeeping has W_FIXED = 54,937 instead.
const shards = N => Math.ceil(N / MAX_SHARD);
function writeGas(N){ const k = shards(N); return Math.round(W_MARGINAL*N + W_FIXED*k); }
function writeCalldata(N){ return N + 100*shards(N); }   // 4-byte sel + offset + len + padding

/* READ, fitted to measurement (optimal single-pass EXTCODECOPY, no base64):
   24575->18,193  1,056,725->9,069,883  2,113,450->35,178,310  4,202,325->136,917,883  8,404,650->543,299,494 */
const readGas = N => Math.round(0.5205*N + N*N/131072);            // lsq fit, <=4.4% at 24KB, <0.1% above
/* data: URI (read + repo Base64.sol + return), fitted to the same run */
const uriGas  = N => Math.round(84.7609*N + N*N/20972);           // lsq fit, <0.1% everywhere

const usd = (gas, cdBytes, c) => (gas*c.gwei*1e9 + cdBytes*c.l1wei) / 1e18 * c.px;
const money = v => v < 0.01 ? "$"+v.toFixed(5) : v < 1000 ? "$"+v.toFixed(2) : "$"+Math.round(v).toLocaleString();
const gasS = g => g >= 1e6 ? (g/1e6).toFixed(2)+"M" : Math.round(g).toLocaleString();

function row(label, N){
  const g = writeGas(N), cd = writeCalldata(N), k = shards(N);
  const txs = Math.max(k===0?0:Math.ceil(g/(TX_GAS_CAP-25000)), Math.ceil(k/Math.floor((TX_GAS_CAP-25000)/(W_MARGINAL*MAX_SHARD+W_FIXED))));
  const cells = CH.map(c => money(usd(g, cd, c)).padStart(12)).join("");
  console.log(`${label.padEnd(28)}${String(N.toLocaleString()).padStart(11)}${String(k).padStart(7)}${String(txs).padStart(6)}${gasS(g).padStart(10)}${cells}`);
}
const hdr = t => { console.log("\n"+t); console.log("item".padEnd(28)+"bytes".padStart(11)+"shards".padStart(7)+"txs".padStart(6)+"gas".padStart(10)+CH.map(c=>c.n.padStart(12)).join("")); };

hdr("PART 1 — WRITE: cost to put N bytes on chain permanently (SSTORE2 data contracts)");
for (const [l,n] of [["1 KB",1024],["32 KB",32768],["256 KB",262144],["1 MB",1048576],["8 MB",8388608]]) row(l,n);

hdr("PART 4 — THE NAMED ARTEFACTS (write cost)");
const ITEMS = [
  ["MP3 320kbps, 3:00",              7_200_000],
  ["MOD, chiptune (measured)",          23_734],
  ["MOD, sample-based typical",        200_000],
  ["MOD, 'Space Debris' class",        700_000],
  ["MIDI score, 3:00 (POP909 med)",     13_465],
  ["Sonant-X score, gz (measured)",        951],
  ["Sonant-X score+synth, gz",           2_729],
  ["CHIP-8 ROM (median of 107)",           286],
  ["CHIP-8 ROM (largest of 107)",        3_582],
  ["NES ROM (SMB / NROM-256)",          40_976],
  ["NES ROM (median of 290)",           40_976],
  ["NES ROM (p90 of 290)",              65_552],
  ["Game Boy ROM (Tetris, 32K)",        32_768],
  ["Game Boy ROM (1 MB, MBC5)",      1_048_576],
  ["SNES ROM (Super Mario World)",     524_288],
  ["SNES ROM (Tales of Phantasia)",  6_291_456],
  ["CHIP-8 interp JS, min (meas.)",      5_776],
  ["CHIP-8 interp JS, min+gz",           2_020],
  ["jsnes 2.1.0 min (measured)",       135_545],
  ["jsnes 2.1.0 min+gz (measured)",     31_505],
  ["IPSEITY document, minified",       118_383],
  ["IPSEITY source html, raw",         199_963],
  ["IPSEITY engine ON CHAIN today",     41_057]
];
for (const [l,n] of ITEMS) row(l,n);

console.log("\n\nPART 2 — READ: gas to get N bytes back out of a view call");
console.log("bytes".padStart(11)+"shards".padStart(7)+"raw read".padStart(12)+"as data: URI".padStart(14)+"  vs geth rpc.gascap 50M");
for (const N of [1024,32768,262144,450_000,1048576,2_500_000,8388608]){
  const r = readGas(N), u = uriGas(N);
  console.log(String(N.toLocaleString()).padStart(11)+String(shards(N)).padStart(7)+gasS(r).padStart(12)+gasS(u).padStart(14)+
    "   raw "+(r<RPC_GASCAP?"OK ":"FAIL")+" / uri "+(u<RPC_GASCAP?"OK":"FAIL"));
}
/* solve ceilings */
const solve = (f) => { let lo=1, hi=20e6; for(let i=0;i<80;i++){const m=(lo+hi)/2; if(f(m)<RPC_GASCAP) lo=m; else hi=m;} return Math.round(lo); };
console.log(`\nceiling at 50M gas:  raw read  ${solve(readGas).toLocaleString()} bytes    data: URI  ${solve(uriGas).toLocaleString()} bytes`);
const solve10 = (f,cap) => { let lo=1, hi=20e6; for(let i=0;i<80;i++){const m=(lo+hi)/2; if(f(m)<cap) lo=m; else hi=m;} return Math.round(lo); };
console.log(`ceiling at 10M gas:  raw read  ${solve10(readGas,10e6).toLocaleString()} bytes    data: URI  ${solve10(uriGas,10e6).toLocaleString()} bytes`);
console.log(`ceiling at 100M gas: raw read  ${solve10(readGas,100e6).toLocaleString()} bytes    data: URI  ${solve10(uriGas,100e6).toLocaleString()} bytes`);

console.log("\n\nPART 1b — Ethereum sensitivity: same write cost at other gas prices");
console.log("bytes".padStart(11)+["0.366 gwei (now)","1 gwei","5 gwei","30 gwei","100 gwei"].map(s=>s.padStart(18)).join(""));
for (const [l,n] of [["1 KB",1024],["32 KB",32768],["256 KB",262144],["1 MB",1048576],["8 MB",8388608]]){
  const g = writeGas(n);
  console.log(String(n.toLocaleString()).padStart(11)+[0.366,1,5,30,100].map(p=>money(g*p*1e9/1e18*ETH).padStart(18)).join(""));
}
console.log("\nper-byte all-in write gas at 24,575-byte shards: "+(writeGas(MAX_SHARD)/MAX_SHARD).toFixed(2)+" gas/byte");
console.log("max shards per transaction under EIP-7825: "+Math.floor((TX_GAS_CAP-21000)/(W_MARGINAL*MAX_SHARD+W_FIXED-21000)));
