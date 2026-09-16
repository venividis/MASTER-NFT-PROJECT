#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · probe-economy — real gas for the settlement layer in probe/Bourse.sol

  Deploys the whole collection (hub, reach, grip, renderer) plus Berth, Wire,
  Quorum, Purse and two witnesses on the repo's own EVM, then drives every
  path a sale can take: local, filler, seller-fill, refund. Numbers, not
  adjectives.

  Run:  node tools/probe-economy.mjs
───────────────────────────────────────────────────────────────────────────*/
import { compile, artifact } from "./compile.mjs";
import { Chain, encodeAddressArg, decAddr, decUint, warp, GENESIS_TIME } from "./evm.mjs";
import { createAddressFromString } from "@ethereumjs/util";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { hexToBytes, bytesToHex } from "ethereum-cryptography/utils.js";

const REGISTRY = "0x000000006551c19487814612e58FE06813775758";
const out = compile({ quiet: true, dirs: ["src", "test/mocks", "probe"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();
const me = c.from.toString();
const w = (n) => BigInt(n).toString(16).padStart(64, "0");
const G = {};
const run = async (label, p) => { const r = await p; G[label] = r.gas; return r; };

/* ── the collection ── */
const tmpReg = await c.deploy(A("test/mocks/ERC6551Registry.sol", "ERC6551Registry").bytecode);
await c.vm.stateManager.putCode(createAddressFromString(REGISTRY),
  await c.vm.stateManager.getCode(createAddressFromString(tmpReg)));
const impl   = await c.deploy(A("src/IpseityAccount.sol", "IpseityAccount").bytecode);
const grip   = await c.deploy(A("src/GripVault.sol", "GripVault").bytecode);
const engine = await c.deploy(A("src/Engine.sol", "Engine").bytecode, "0".repeat(64));
const sigil  = await c.deploy(A("src/Sigil.sol", "Sigil").bytecode);
const rend   = await c.deploy(A("src/Renderer.sol", "Renderer").bytecode,
  encodeAddressArg(engine) + encodeAddressArg(sigil));
const nft    = await c.deploy(A("src/Ipseity.sol", "Ipseity").bytecode,
  encodeAddressArg(rend) + encodeAddressArg(impl) + encodeAddressArg(grip) + w(1) + w(4096));
/* a royalty so the split is exercised rather than skipped */
await c.exec(nft, "setRoyalty(address,uint96)", [me, 500]);

/* ── the settlement layer ── */
const dep = async (name, args = "") => {
  const a = A("probe/Bourse.sol", name);
  const r = await c.send({ data: a.bytecode + args, label: "deploy." + name });
  G["deploy." + name] = r.gas;
  return r.address;
};
const berth = await dep("Berth", encodeAddressArg(nft));
const ep    = await dep("StubEndpoint");
/* one peer: dstEid 30184 (Base), receiver = the away witness, set below */
const wire  = await c.send({ data: A("probe/Bourse.sol", "Wire").bytecode
  + encodeAddressArg(berth) + encodeAddressArg(ep) + w(0x80) + w(0xc0) + w(1) + w(30184) + w(1) + "11".repeat(32) })
  .then(r => { G["deploy.Wire"] = r.gas; return r.address; });

const wit1 = await dep("StubWitness", encodeAddressArg(me));
const wit2 = await dep("StubWitness", encodeAddressArg(me));
const quorum = await c.send({ data: A("probe/Bourse.sol", "Quorum").bytecode
  + encodeAddressArg(me) + w(0x40) + w(2) + encodeAddressArg(wit1) + encodeAddressArg(wit2) })
  .then(r => { G["deploy.Quorum"] = r.gas; return r.address; });
const purse = await dep("Purse", encodeAddressArg(quorum));
const lz    = await c.send({ data: A("probe/Bourse.sol", "LzWitness").bytecode
  + encodeAddressArg(ep) + encodeAddressArg(me) + w(0x80) + w(0xc0) + w(1) + w(30101) + w(1) + "22".repeat(32) })
  .then(r => { G["deploy.LzWitness"] = r.gas; return r.address; });

const seller = await c.as("0x" + "a1".repeat(32));
const buyer  = await c.as("0x" + "b2".repeat(32));
const filler = await c.as("0x" + "c3".repeat(32));
for (let i = 0; i < 6; i++) await seller.exec(nft, "mint()", [], { value: 10n ** 16n });

const T0 = GENESIS_TIME;
const FAR = T0 + 20n * 86400n;
const PRICE = 2n * 10n ** 17n;

/* ═════ path A · an ordinary local sale (the baseline) ═════ */
await run("A. approve", seller.exec(nft, "approve(address,uint256)", [berth, 1]));
const r1 = await run("A. list", seller.exec(berth, "list(address,uint256,uint96,uint64)", [nft, 1, PRICE, FAR]));
const lotId = (n) => "0x" + bytesToHex(keccak256(hexToBytes(
  "0x" + w(1) + berth.slice(2).padStart(64, "0") + seller.from.toString().slice(2).padStart(64, "0") + w(n))));
const L1 = lotId(0), L2 = lotId(1), L3 = lotId(2), L4 = lotId(3);
await run("A. buyFor (local, to self)", buyer.exec(berth,
  "buyFor(bytes32,uint96,address,bytes32,uint96,uint64)",
  [L1, PRICE, buyer.from.toString(), "0x" + "00".repeat(32), 0, 0], { value: PRICE }));
await run("A. withdraw (seller)", seller.exec(berth, "withdraw()", []));

/* ═════ path B · seller-fill: money on the away chain, no capital moves ═════ */
const O1 = "0x" + "77".repeat(32);
await seller.exec(nft, "approve(address,uint256)", [berth, 2]);
await run("B. list", seller.exec(berth, "list(address,uint256,uint96,uint64)", [nft, 2, PRICE, FAR]));
await run("B. commit  (AWAY: buyer locks money)", buyer.exec(purse,
  "commit(bytes32,uint32,address,bytes32,address,uint64,uint8)",
  [O1, 1, berth, L2, buyer.from.toString(), FAR, 2], { value: PRICE }));
await run("B. fillFromAway (HOME: seller delivers)", seller.exec(berth,
  "fillFromAway(bytes32,bytes32,address,uint96,uint64)", [L2, O1, buyer.from.toString(), PRICE, FAR]));
const D1 = await c.read(berth, "digestOf(bytes32)", [O1]);
await run("B. Wire.speak  (HOME: one transport)", c.exec(wire, "speak(bytes32,uint32,bytes)",
  [O1, 30184, "0x"], { value: 10n ** 14n }));
await run("B. witness 1 lands (AWAY)", c.exec(wit1, "witness(bytes32)", [D1]));
await run("B. witness 2 lands (AWAY)", c.exec(wit2, "witness(bytes32)", [D1]));
const roy = PRICE * 5n / 100n;
await run("B. claim   (AWAY: 2 of 2 witnesses)", c.exec(purse, "claim(bytes32,address,address,uint96)",
  [O1, seller.from.toString(), me, roy]));
await run("B. withdraw (AWAY: seller's money)", seller.exec(purse, "withdraw()", []));

/* ═════ path C · a filler serves the buyer at the speed of one block ═════ */
const O2 = "0x" + "88".repeat(32);
await seller.exec(nft, "approve(address,uint256)", [berth, 3]);
await run("C. list", seller.exec(berth, "list(address,uint256,uint96,uint64)", [nft, 3, PRICE, FAR]));
await run("C. commit  (AWAY)", buyer.exec(purse,
  "commit(bytes32,uint32,address,bytes32,address,uint64,uint8)",
  [O2, 1, berth, L3, buyer.from.toString(), FAR, 1], { value: PRICE }));
await run("C. buyFor  (HOME: filler pays+binds the order)", filler.exec(berth,
  "buyFor(bytes32,uint96,address,bytes32,uint96,uint64)",
  [L3, PRICE, buyer.from.toString(), O2, PRICE, FAR], { value: PRICE }));
const D2 = await c.read(berth, "digestOf(bytes32)", [O2]);
await run("C. witness 1 lands (AWAY)", c.exec(wit1, "witness(bytes32)", [D2]));
await run("C. claim   (AWAY: 1 of 2 witnesses)", c.exec(purse, "claim(bytes32,address,address,uint96)",
  [O2, filler.from.toString(), "0x" + "00".repeat(40), 0]));

/* ═════ path D · nothing ever lands ═════ */
const O3 = "0x" + "99".repeat(32);
await run("D. commit  (AWAY)", buyer.exec(purse,
  "commit(bytes32,uint32,address,bytes32,address,uint64,uint8)",
  [O3, 1, berth, L4, buyer.from.toString(), T0 + 13n * 3600n, 2], { value: PRICE }));
warp(T0 + 14n * 3600n);
await run("D. refund  (AWAY: permissionless)", filler.exec(purse, "refund(bytes32)", [O3]));
await seller.exec(nft, "approve(address,uint256)", [berth, 4]);
await run("D. list (a lot nobody buys)", seller.exec(berth, "list(address,uint256,uint96,uint64)",
  [nft, 4, PRICE, T0 + 14n * 3600n + 86500n]));
warp(T0 + 14n * 3600n + 90000n);
await run("D. reclaim (HOME: permissionless)", filler.exec(berth, "reclaim(bytes32)", [lotId(3)]));

/* ═════ sizes ═════ */
console.log("\n  runtime bytecode");
let tot = 0;
for (const n of ["Berth", "Wire", "Quorum", "Purse", "LzWitness", "StubWitness"]) {
  const b = (A("probe/Bourse.sol", n).deployed.length - 2) / 2; tot += b;
  console.log(`    ${n.padEnd(13)} ${String(b).padStart(6)} B   ${(100 * b / 24576).toFixed(1)}% of EIP-170`);
}
console.log(`    ${"TOTAL".padEnd(13)} ${String(tot).padStart(6)} B   ${(100 * tot / 24576).toFixed(1)}% of one shard`);

console.log("\n  gas");
for (const [k, v] of Object.entries(G)) console.log(`    ${k.padEnd(42)} ${String(v).padStart(9)}`);

console.log("\n  end state");
console.log("    owner of #1 (local sale)      ", decAddr(await c.read(nft, "ownerOf(uint256)", [1])), "buyer:", buyer.from.toString());
console.log("    owner of #2 (seller fill)     ", decAddr(await c.read(nft, "ownerOf(uint256)", [2])));
console.log("    owner of #3 (filler)          ", decAddr(await c.read(nft, "ownerOf(uint256)", [3])));
console.log("    owner of #4 (reclaimed)       ", decAddr(await c.read(nft, "ownerOf(uint256)", [4])), "seller:", seller.from.toString());
console.log("    purse owed to filler          ", decUint(await c.read(purse, "owed(address)", [filler.from.toString()])));
console.log("    ops on #1 after sale          ", decUint(await c.read(nft, "statsOf(uint256)", [1]), 0));
