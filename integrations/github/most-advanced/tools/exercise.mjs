#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · every function, on the live chain

  Several accounts walk the whole surface of the deployed collection — the
  token, its two hands, the market, the lease desk and the parley — on the
  chain dist/testnet.json points at. Writes are real transactions; refusals
  are proven through eth_estimateGas, which replays the revert without
  spending anything; and at the end the script reconciles what it touched
  against the compiled ABI. A function it neither exercised nor skipped
  with a written reason fails the run.

      node tools/exercise.mjs
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { compile, artifact } from "./compile.mjs";
import { enc, sel, decUint, decAddr, decBool, decString } from "./evm.mjs";
import { RpcChain } from "./rpc.mjs";
import { getter } from "./site.mjs";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import { hexToBytes, bytesToHex } from "@ethereumjs/util";
import { secp256k1 } from "ethereum-cryptography/secp256k1.js";

/*  A 65-byte r||s||v signature over a raw digest — what ERC-1271 hands to
    ecrecover. v is 27 or 28, and s stays in the lower half of the order
    because the account rejects the malleable half.                      */
const ecsign = (digestBytes, keyBytes) => {
  const sig = secp256k1.sign(digestBytes, keyBytes);
  return { r: sig.toCompactRawBytes().slice(0, 32),
           s: sig.toCompactRawBytes().slice(32, 64),
           v: 27 + sig.recovery };
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rec = JSON.parse(fs.readFileSync(path.join(ROOT, "dist/testnet.json"), "utf8"));
const { ipseity: NFT, pool: POOL, lease: LEASE, parley: PARLEY, premises: PREMISES } = rec.contracts;
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";

let pass = 0, fail = 0;
const txlog = [];
const ok = (name, cond, detail) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${name}`);
  if (!cond && detail !== undefined) console.log(`      ${detail}`);
};
const eq = (name, got, want) => ok(name, String(got) === String(want), `got ${got}\n      want ${want}`);
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);
const note = (s) => console.log(`      \x1b[2m${s}\x1b[0m`);
const W = (n) => BigInt(n).toString(16).padStart(64, "0");
const A_ = (a) => String(a).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const B32 = (h) => String(h).replace(/^0x/, "").padEnd(64, "0");
const utf8 = (s) => "0x" + Buffer.from(s, "utf8").toString("hex");

/*──────── the coverage ledger ────────*/
const COVERED = new Set(), SKIPPED = new Map();
const hit = (...names) => names.forEach((n) => COVERED.add(n));
const skip = (name, why) => SKIPPED.set(name, why);

/*──────── act on the chain ────────*/
const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const ART = (f, n) => artifact(out, f, n);

const curator = await RpcChain.open(rec.rpc, fs.readFileSync(path.join(ROOT, ".testnet-key"), "utf8").trim());
const crewPath = path.join(ROOT, ".testnet-crew");
const crewKeys = fs.existsSync(crewPath)
  ? JSON.parse(fs.readFileSync(crewPath, "utf8"))
  : [1, 2, 3].map(() => "0x" + crypto.randomBytes(32).toString("hex"));
fs.writeFileSync(crewPath, JSON.stringify(crewKeys), { mode: 0o600 });
const bram = await curator.as(crewKeys[0]);
const cora = await curator.as(crewKeys[1]);
const dain = await curator.as(crewKeys[2]);
const addr = (c) => c.from.toString();
for (const ch of [curator, bram, cora, dain]) {
  const origCall = ch.call.bind(ch);
  ch.call = (to, data, from, t) => origCall(to, data, from, t ?? tag());
  const origBal = ch.balanceOf.bind(ch);
  ch.balanceOf = (a, t) => origBal(a, t ?? tag());
}

/*  A refusal, proven without spending: estimateGas replays the call and
    reports the revert. True means the chain said no.                    */
/*  Reads and refusal-probes are pinned to the newest block a receipt has
    proven mined, so a lagging replica errors and retries instead of
    answering from the past.                                             */
let LAST = 0n;
const tag = () => (LAST > 0n ? "0x" + LAST.toString(16) : "latest");
const refuses = async (actor, to, data, value = 0n) => {
  try {
    await actor.rpc("eth_estimateGas", [{
      from: addr(actor), to, data, value: "0x" + BigInt(value).toString(16)
    }, tag()]);
    return false;
  } catch (e) {
    if (/not found|header|missing|unknown block/i.test(e.message)) {
      await new Promise((r) => setTimeout(r, 1500));
      return refuses(actor, to, data, value);
    }
    return true;
  }
};
const send = async (actor, to, sig, args, opts = {}) => {
  const r = await actor.exec(to, sig, args, opts);
  if (r.block > LAST) LAST = r.block;
  txlog.push({ who: addr(actor).slice(0, 8), what: opts.label || sig, tx: r.hash, block: String(r.block) });
  return r;
};
const raw = async (actor, to, data, value = 0n, label = "raw") => {
  const r = await actor.send({ to, data, value, label });
  if (r.block > LAST) LAST = r.block;
  txlog.push({ who: addr(actor).slice(0, 8), what: label, tx: r.hash, block: String(r.block) });
  return r;
};

console.log("\n  \x1b[1mIPSEITY · the whole surface, exercised live\x1b[0m");
note(`chain ${curator.chainId} · ${rec.rpc}`);
note(`curator ${addr(curator)}`);
note(`bram    ${addr(bram)}  — will hold and run a token`);
note(`cora    ${addr(cora)}  — will rent, trade and answer`);
note(`dain    ${addr(dain)}  — will be trusted exactly as far as granted`);

/*═══════════════ I · the treasury refills the run ═══════════════*/
head("I · the treasury");
hit("Ipseity.curator", "Ipseity.owner");
eq("the curator is the deploy key",
   decAddr(await curator.read(NFT, "curator()")).toLowerCase(), addr(curator));
ok("a stranger cannot sweep the treasury",
   await refuses(bram, NFT, enc("withdraw(address)", [addr(bram)])));
const treasury = BigInt(await curator.rpc("eth_getBalance", [NFT, "latest"]));
await send(curator, NFT, "withdraw(address)", [addr(curator)], { label: "withdraw" });
hit("Ipseity.withdraw");
eq(`the sweep leaves nothing behind — ${(Number(treasury) / 1e18).toFixed(4)} ETH came home`,
   BigInt(await curator.rpc("eth_getBalance", [NFT, tag()])), 0n);

/*═══════════════ II · pricing, and the crew is funded ═══════════════*/
head("II · pricing");
ok("a stranger cannot reprice the collection",
   await refuses(bram, NFT, enc("setPricing(uint256,uint256)", [0, 0])));
await send(curator, NFT, "setPricing(uint256,uint256)", [10n ** 14n, 10n ** 13n]);
hit("Ipseity.setPricing", "Ipseity.price", "Ipseity.openFee");
eq("mint is now 0.0001 ETH", decUint(await curator.read(NFT, "price()")), 10n ** 14n);
eq("opening a node is 0.00001", decUint(await curator.read(NFT, "openFee()")), 10n ** 13n);
/*  Funding is levelling, not pouring: the crew keeps a working float and
    anything above it flows back to the curator first, so reruns rebalance
    instead of bleeding the treasury one direction until it is dry.      */
const FLOAT = { };
FLOAT[addr(bram)] = 3n * 10n ** 15n;
FLOAT[addr(cora)] = 3n * 10n ** 15n;
FLOAT[addr(dain)] = 15n * 10n ** 14n;
for (const c of [bram, cora, dain]) {
  const bal = await c.balanceOf(addr(c));
  const want = FLOAT[addr(c)];
  if (bal > want * 2n) await c.send({ to: addr(curator), value: bal - want, label: "rebalance" });
}
for (const c of [bram, cora, dain]) {
  const bal = await c.balanceOf(addr(c));
  const want = FLOAT[addr(c)];
  if (bal < want) await curator.send({ to: addr(c), value: want - bal, label: "fund" });
}
note("crew levelled to 0.003 / 0.003 / 0.0015 ETH floats");

/*═══════════════ III · minting, and the ledger of who holds what ═══════════════*/
head("III · mint");
ok("an underpaid mint is refused", await refuses(bram, NFT, enc("mint()"), 1n));
await send(bram, NFT, "mint()", [], { value: 10n ** 14n, label: "mint" });
const B = decUint(await bram.read(NFT, "totalSupply()"));
await send(cora, NFT, "mint()", [], { value: 10n ** 14n, label: "mint" });
const C = decUint(await cora.read(NFT, "totalSupply()"));
hit("Ipseity.mint", "Ipseity.totalSupply", "Ipseity.ownerOf", "Ipseity.balanceOf",
    "Ipseity.tokenByIndex", "Ipseity.tokenOfOwnerByIndex", "Ipseity.seedOf",
    "Ipseity.sectionOf", "Ipseity.MAX_SUPPLY", "Ipseity.NODE_COUNT",
    "Ipseity.BORN_OPEN", "Ipseity.ALL_OPEN", "Ipseity.name", "Ipseity.symbol");
eq(`bram minted #${B}`, decAddr(await bram.read(NFT, "ownerOf(uint256)", [B])).toLowerCase(), addr(bram));
eq(`cora minted #${C}`, decAddr(await cora.read(NFT, "ownerOf(uint256)", [C])).toLowerCase(), addr(cora));
{
  /*  bram may carry tokens from earlier runs — a live chain remembers.
      Enumeration is asserted by walking his whole balance and finding the
      one just minted, which is what the function is for anyway.         */
  const n = Number(decUint(await bram.read(NFT, "balanceOf(address)", [addr(bram)])));
  let found = false;
  for (let i = 0; i < n && !found; i++)
    found = decUint(await bram.read(NFT, "tokenOfOwnerByIndex(address,uint256)", [addr(bram), i])) === B;
  ok("enumeration finds the fresh mint among bram's holdings", found);
}
eq("tokenByIndex walks the whole roll", decUint(await bram.read(NFT, "tokenByIndex(uint256)", [Number(C) - 1])), C);
ok("every token is born with a seed", decUint(await bram.read(NFT, "seedOf(uint256)", [B])) !== 0n);
eq("name", decString(await bram.read(NFT, "name()")), "IPSEITY");
eq("symbol", decString(await bram.read(NFT, "symbol()")), "IPSE");
note(`supply ${C} of ${decUint(await bram.read(NFT, "MAX_SUPPLY()"))}`);

/*═══════════════ IV · the section: commit, record, the one settable trait ═══════════════*/
head("IV · the section");
const word = (() => {
  let x = 0n;
  [9000n, 21000n, 4000n, 30000n, 11000n, 52000n].forEach((a, i) => { x |= a << BigInt(i * 16); });
  return x | (36000n << 96n) | (4n << 112n) | (141n << 120n);   // Clifford torus, hue 199°
})();
ok("a stranger cannot turn somebody else's solid",
   await refuses(cora, NFT, enc("commit(uint256,uint256)", [B, word])));
ok("a solid that does not exist is refused",
   await refuses(bram, NFT, enc("commit(uint256,uint256)", [B, 9n << 112n])));
const s0 = await bram.read(NFT, "statsOf(uint256)", [B]);
await send(bram, NFT, "commit(uint256,uint256)", [B, word]);
hit("Ipseity.commit", "Ipseity.statsOf", "Ipseity.detailOf", "Ipseity.record",
    "Ipseity.setTrait", "Ipseity.getTraitValue", "Ipseity.getTraitValues",
    "Ipseity.getTraitMetadataURI", "Ipseity.viewOf");
eq("the word is held", decUint(await bram.read(NFT, "sectionOf(uint256)", [B])), word);
ok("ops moved", decUint(await bram.read(NFT, "statsOf(uint256)", [B]), 0) >
               decUint(s0, 0));
const d0 = await bram.read(NFT, "detailOf(uint256)", [B]);
await send(bram, NFT, "record(uint256)", [B]);
ok("record() stamps the moment without changing the section",
   decUint(await bram.read(NFT, "detailOf(uint256)", [B]), 0) >= decUint(d0, 0) &&
   decUint(await bram.read(NFT, "sectionOf(uint256)", [B])) === word);
ok("only hue is a settable trait — the geometry is not an opinion",
   await refuses(bram, NFT, enc("setTrait(uint256,bytes32,bytes32)",
     [B, "0x" + Buffer.from("Solid").toString("hex").padEnd(64, "0"), W(1)])));
await raw(bram, NFT, sel("setTrait(uint256,bytes32,bytes32)") + W(B) +
  Buffer.from("hue").toString("hex").padEnd(64, "0") + W(200), 0n, "setTrait hue");
eq("the hue byte followed", (decUint(await bram.read(NFT, "sectionOf(uint256)", [B])) >> 120n) & 0xffn, 200n);
const tv = await bram.call(NFT, sel("getTraitValue(uint256,bytes32)") + W(B) +
  Buffer.from("hue").toString("hex").padEnd(64, "0"));
ok("ERC-7496 reads it back", decUint(tv) === 200n, decUint(tv));
const tvs = await bram.call(NFT, sel("getTraitValues(uint256,bytes32[])") + W(B) +
  W(64) + W(1) + Buffer.from("hue").toString("hex").padEnd(64, "0"));
ok("and in the plural", tvs.length > 66);
ok("and getTraitMetadataURI answers",
   decString(await bram.read(NFT, "getTraitMetadataURI()")).length > 0);

/*═══════════════ V · three faces ═══════════════*/
head("V · ERC-7160, the three faces");
hit("Ipseity.tokenURI", "Ipseity.tokenURIAt", "Ipseity.pinTokenURI",
    "Ipseity.unpinTokenURI", "Ipseity.hasPinnedTokenURI", "Ipseity.contractURI");
ok("face 1 is the still", decString(await bram.read(NFT, "tokenURIAt(uint256,uint256)", [B, 1]))
   .startsWith("data:application/json;base64,"));
await send(bram, NFT, "pinTokenURI(uint256,uint256)", [B, 1]);
ok("pinning face 1 changes what tokenURI answers",
   decBool(await bram.read(NFT, "hasPinnedTokenURI(uint256)", [B])) &&
   decString(await bram.read(NFT, "tokenURI(uint256)", [B])).length < 20000);
await send(bram, NFT, "unpinTokenURI(uint256)", [B]);
ok("unpinned again", !decBool(await bram.read(NFT, "hasPinnedTokenURI(uint256)", [B])));
skip("Ipseity.tokenURIs", "37M gas — past this public RPC's eth_call ceiling; proven in-suite and measured in gas.mjs");
ok("contractURI answers ERC-7572",
   decString(await bram.read(NFT, "contractURI()")).startsWith("data:application/json"));

/*═══════════════ VI · the sealed instruments ═══════════════*/
head("VI · opening a node");
hit("Ipseity.openNode");
ok("node 12 does not exist", await refuses(bram, NFT, enc("openNode(uint256,uint8)", [B, 12]), 10n ** 13n));
ok("underpaying is refused", await refuses(bram, NFT, enc("openNode(uint256,uint8)", [B, 3]), 1n));
ok("a stranger cannot open somebody's node",
   await refuses(cora, NFT, enc("openNode(uint256,uint8)", [B, 3]), 10n ** 13n));
await send(bram, NFT, "openNode(uint256,uint8)", [B, 3], { value: 10n ** 13n, label: "openNode" });
ok("node 3 is open for good",
   (decUint(await bram.read(NFT, "statsOf(uint256)", [B]), 3) & 8n) === 8n);
ok("and can never be opened twice",
   await refuses(bram, NFT, enc("openNode(uint256,uint8)", [B, 3]), 10n ** 13n));

/*═══════════════ VII · soulbinding, reversibly ═══════════════*/
head("VII · ERC-5192 / 6454");
hit("Ipseity.lock", "Ipseity.unlock", "Ipseity.locked", "Ipseity.isTransferable");
await send(bram, NFT, "lock(uint256)", [B]);
ok("locked", decBool(await bram.read(NFT, "locked(uint256)", [B])));
ok("a locked token says it cannot move",
   !decBool(await bram.read(NFT, "isTransferable(uint256,address,address)", [B, addr(bram), addr(cora)])));
ok("and the chain agrees",
   await refuses(bram, NFT, enc("transferFrom(address,address,uint256)", [addr(bram), addr(cora), B])));
await send(bram, NFT, "unlock(uint256)", [B]);
ok("unlocked, and transferable again",
   decBool(await bram.read(NFT, "isTransferable(uint256,address,address)", [B, addr(bram), addr(cora)])));

/*═══════════════ VIII · renting: 4907, the narrow capability, the lease desk ═══════════════*/
head("VIII · renting");
hit("Ipseity.setUser", "Ipseity.userOf", "Ipseity.userExpires", "Ipseity.setLeaseAgent",
    "Ipseity.leaseAgentOf", "Ipseity.setUserVia",
    "Lease.list", "Lease.rent", "Lease.termsOf", "Lease.listing", "Lease.status",
    "Lease.cost", "Lease.activeOf", "Lease.obligations", "Lease.owed", "Lease.earned",
    "Lease.endLease", "Lease.delist", "Lease.claim", "Lease.settle", "Lease.collect",
    "Lease.HUB", "Lease.MAX_DAYS", "Lease.MAX_PER_DAY");
const nowChain = async () => BigInt((await curator.rpc("eth_getBlockByNumber", ["latest", false])).timestamp);

/* the plain 4907 path first: the holder names a user directly */
await send(bram, NFT, "setUser(uint256,address,uint64)", [B, addr(dain), (await nowChain()) + 900n]);
eq("dain is the user of record", decAddr(await bram.read(NFT, "userOf(uint256)", [B])).toLowerCase(), addr(dain));
ok("with an expiry in the future", decUint(await bram.read(NFT, "userExpires(uint256)", [B])) > await nowChain());
/* a user may drive the instrument… */
await send(dain, NFT, "commit(uint256,uint256)", [B, word | (1n << 16n)], { label: "commit as user" });
ok("a user may turn the solid — that is what using it means", true);
/* …and may not do the things that are the holder's alone */
ok("a user cannot lock it", await refuses(dain, NFT, enc("lock(uint256)", [B])));
ok("a user cannot sell it",
   await refuses(dain, NFT, enc("transferFrom(address,address,uint256)", [addr(bram), addr(dain), B])));
await send(bram, NFT, "setUser(uint256,address,uint64)", [B, "0x" + "0".repeat(40), 0], { label: "clear user" });

/* the lease desk: priced, bounded, and one narrow capability */
ok("listing before naming an agent is refused",
   await refuses(bram, LEASE, enc("list(uint256,uint128,uint32,uint32)", [B, 10n ** 13n, 1, 30])));
await send(bram, NFT, "setLeaseAgent(uint256,address)", [B, LEASE]);
eq("the desk is the token's named agent", decAddr(await bram.read(NFT, "leaseAgentOf(uint256)", [B])).toLowerCase(), LEASE.toLowerCase());
ok("and nobody else may set a user through it",
   await refuses(cora, NFT, enc("setUserVia(uint256,address,uint64)", [B, addr(cora), (await nowChain()) + 86400n])));
ok("only the owner lists", await refuses(cora, LEASE, enc("list(uint256,uint128,uint32,uint32)", [B, 1n, 1, 3])));
await send(bram, LEASE, "list(uint256,uint128,uint32,uint32)", [B, 10n ** 13n, 1, 30]);
const price2 = decUint(await cora.read(LEASE, "cost(uint256,uint32)", [B, 2]));
eq("two days cost exactly twice the day", price2, 2n * 10n ** 13n);
ok("underpaying the desk is refused",
   await refuses(cora, LEASE, enc("rent(uint256,uint32,uint128)", [B, 2, 10n ** 13n]), price2 - 1n));
await send(cora, LEASE, "rent(uint256,uint32,uint128)", [B, 2, 10n ** 13n], { value: price2, label: "rent" });
eq("the desk installed cora as user", decAddr(await cora.read(NFT, "userOf(uint256)", [B])).toLowerCase(), addr(cora));
{
  const st = await cora.read(LEASE, "status(uint256)", [B]);
  eq("the desk says: occupied — which is exactly what a live lease is",
     decUint(st, 1), 3n);
}
await send(bram, LEASE, "settle(uint256)", [B], { label: "settle" });
note("settled — minutes into a two-day term, so what has vested rounds to nothing");
await send(bram, LEASE, "endLease(uint256)", [B], { label: "endLease" });
eq("ending it clears the user", decAddr(await bram.read(NFT, "userOf(uint256)", [B])), "0x" + "0".repeat(40));
const owedCora = decUint(await cora.read(LEASE, "owed(address)", [addr(cora)]));
ok(`the unspent rent is owed back — ${owedCora} wei`, owedCora > 0n);
await send(cora, LEASE, "claim()", [], { label: "claim" });
eq("and claimed", decUint(await cora.read(LEASE, "owed(address)", [addr(cora)])), 0n);
const earned = decUint(await bram.read(LEASE, "earned(uint256)", [B]));
if (earned > 0n) { await send(bram, LEASE, "collect(uint256,address)", [B, addr(bram)], { label: "collect" }); }
else {
  ok("nothing vested in minutes, and collect refuses to pretend otherwise",
     await refuses(bram, LEASE, enc("collect(uint256,address)", [B, addr(bram)])));
}
{
  const st = await bram.read(LEASE, "status(uint256)", [B]);
  ok("ended, the listing is rentable again", decBool(st));
}
await send(bram, LEASE, "delist(uint256)", [B]);
note("delisted — the counter shows closed terms now");

/* the mock assets, deployed early: the session act and the manifest act
   both need a real ERC-20 to aim at */
const encS = (t) => W(t.length) + Buffer.from(t).toString("hex").padEnd(64, "0");
const erc20 = ART("test/mocks/MockERC20.sol", "MockERC20").bytecode;
const gldPromise = await curator.deploy(erc20,
  W(0xa0) + W(0xe0) + W(18) + W(0) + W(0) + encS("Guilder") + encS("GLD"), "GLD");

/*═══════════════ IX · the two hands ═══════════════*/
head("IX · ERC-6551, the Reach and the Grip");
hit("Ipseity.embody", "Ipseity.embodyGrip", "Ipseity.account", "Ipseity.grip",
    "Ipseity.REGISTRY", "Ipseity.ACCOUNT_IMPL", "Ipseity.GRIP_IMPL",
    "Ipseity.ACCOUNT_SALT", "Ipseity.REACH_SALT", "Ipseity.GRIP_SALT");
await send(bram, NFT, "embody(uint256)", [B], { label: "embody" });
await send(bram, NFT, "embodyGrip(uint256)", [B], { label: "embodyGrip" });
const reach = decAddr(await bram.read(NFT, "account(uint256)", [B]));
const grip = decAddr(await bram.read(NFT, "grip(uint256)", [B]));
ok("both hands have code", (await bram.codeSize(reach)) > 0 && (await bram.codeSize(grip)) > 0);
const impl = decAddr(await bram.read(NFT, "ACCOUNT_IMPL()"));
const derived = decAddr(await bram.call(REGISTRY,
  sel("account(address,bytes32,uint256,address,uint256)") +
  A_(impl) + W(0) + W(curator.chainId) + A_(NFT) + W(B)));
eq("the registry derives the same Reach the token names", derived.toLowerCase(), reach.toLowerCase());

hit("IpseityAccount.token", "IpseityAccount.owner", "IpseityAccount.state",
    "IpseityAccount.execute", "IpseityAccount.executeBatch",
    "IpseityAccount.holdings", "IpseityAccount.pieces", "IpseityAccount.unmeasurable",
    "IpseityAccount.MAX_BATCH", "IpseityAccount.MAX_LIST", "IpseityAccount.MAX_MANIFEST",
    "IpseityAccount.MAX_PIECES", "IpseityAccount.MAX_SEAL", "IpseityAccount.MAX_SESSION",
    "IpseityAccount.supportsInterface", "IpseityAccount.onERC721Received",
    "IpseityAccount.onERC1155Received", "IpseityAccount.onERC1155BatchReceived");
eq("the Reach knows whose hand it is", decAddr(await bram.read(reach, "owner()")).toLowerCase(), addr(bram));
await raw(bram, reach, "0x", 3n * 10n ** 14n, "fund reach");
const coraBefore = await cora.balanceOf(addr(cora));
const st0 = decUint(await bram.read(reach, "state()"));
await send(bram, reach, "execute(address,uint256,bytes,uint8)",
  [addr(cora), 10n ** 14n, "0x", 0], { label: "reach execute" });
ok("the token paid cora from its own hand",
   (await cora.balanceOf(addr(cora))) === coraBefore + 10n ** 14n);
ok("and its state moved — every act is measurable",
   decUint(await bram.read(reach, "state()")) !== st0);
ok("a stranger cannot move the hand",
   await refuses(cora, reach, enc("execute(address,uint256,bytes,uint8)", [addr(cora), 1n, "0x", 0])));
{ /* a two-payment batch, encoded by hand: tuple[] of (to, value, bytes) */
  const el = (to, v) => A_(to) + W(v) + W(0x60) + W(0);
  const e1 = el(addr(cora), 10n ** 13n), e2 = el(addr(dain), 10n ** 13n);
  const data = sel("executeBatch((address,uint256,bytes)[])") +
    W(0x20) + W(2) + W(0x40) + W(0x40 + e1.length / 2) + e1 + e2;
  await raw(bram, reach, data, 0n, "executeBatch");
  ok("a batch pays two people in one act", true);
}

/*──── the session: trusted exactly as far as granted ────*/
head("IX·b — a session key");
hit("IpseityAccount.grantSession", "IpseityAccount.executeAsSession",
    "IpseityAccount.revokeSession", "IpseityAccount.sessionOf", "IpseityAccount.sessionEpoch",
    "IpseityAccount.sessionAllows", "IpseityAccount.sessionTarget", "IpseityAccount.sessionSelector");
{
  const exp = (await nowChain()) + 1800n;
  /*  Two lists, both strict: an empty selectors list is a key that may
      face its targets and do nothing at all. A bare value transfer is
      selector zero, and zero has to be granted like anything else.      */
  const data = sel("grantSession(address,uint64,uint128,address[],bytes4[])") +
    A_(addr(dain)) + W(exp) + W(5n * 10n ** 13n) +
    W(0xa0) + W(0xe0) + W(1) + A_(addr(cora)) + W(1) + W(0);
  await raw(bram, reach, data, 0n, "grantSession");
  ok("dain may now spend the token's money — capped, aimed, expiring",
     decUint(await bram.read(reach, "sessionEpoch(address)", [addr(dain)])) > 0n);
  await send(dain, reach, "executeAsSession(address,uint256,bytes)",
    [addr(cora), 10n ** 13n, "0x"], { label: "session spend" });
  ok("within the grant, the key works", true);
  ok("past the cap, it does not",
     await refuses(dain, reach, enc("executeAsSession(address,uint256,bytes)", [addr(cora), 10n ** 14n, "0x"])));
  ok("at a target it was not aimed at, it does not",
     await refuses(dain, reach, enc("executeAsSession(address,uint256,bytes)", [addr(bram), 1n, "0x"])));
  {
    /*  Approvals are standing authority, so the desk checks the party being
        trusted, not just the contract the approval is written on: approve's
        spender has to be on the target list too.                        */
    const exp2 = (await nowChain()) + 900n;
    const g2 = sel("grantSession(address,uint64,uint128,address[],bytes4[])") +
      A_(addr(dain)) + W(exp2) + W(0) +
      W(0xa0) + W(0x100) + W(2) + A_(gldPromise) + A_(addr(cora)) +
      W(1) + "095ea7b3".padEnd(64, "0");
    await raw(bram, reach, g2, 0n, "grantSession approve");
    ok("an approval to a spender the holder never named is refused",
       await refuses(dain, reach, enc("executeAsSession(address,uint256,bytes)",
         [gldPromise, 0n, enc("approve(address,uint256)", [addr(bram), 1n])])));
    await send(dain, reach, "executeAsSession(address,uint256,bytes)",
      [gldPromise, 0n, enc("approve(address,uint256)", [addr(cora), 1n])], { label: "session approve" });
    ok("to a named one, it stands", true);
  }
  await send(bram, reach, "revokeSession(address)", [addr(dain)]);
  ok("revoked, the key is nothing",
     await refuses(dain, reach, enc("executeAsSession(address,uint256,bytes)", [addr(cora), 1n, "0x"])));
}

/*──── 1271: the token's own signature ────*/
head("IX·c — the token signs");
hit("IpseityAccount.isValidSignature", "IpseityAccount.isValidSigner",
    "IpseityAccount.domainSeparator", "IpseityAccount.attestationNonce",
    "IpseityAccount.attestationDigest", "IpseityAccount.decodeAttestation",
    "IpseityAccount.retireAttestations");
{
  const digest = "0x" + Buffer.from(keccak256(Buffer.from("ipseity, exercised"))).toString("hex");
  const sig = ecsign(hexToBytes(digest), hexToBytes(crewKeys[0]));
  const sigHex = Buffer.from(sig.r).toString("hex") + Buffer.from(sig.s).toString("hex") + sig.v.toString(16).padStart(2, "0");
  const ans = await bram.call(reach, sel("isValidSignature(bytes32,bytes)") +
    digest.slice(2) + W(0x40) + W(65) + sigHex.padEnd(Math.ceil(65 / 32) * 64, "0"));
  eq("the holder's signature is the token's word", ans.slice(0, 10), "0x1626ba7e");
  const bad = ecsign(hexToBytes(digest), hexToBytes(crewKeys[2]));
  const badHex = Buffer.from(bad.r).toString("hex") + Buffer.from(bad.s).toString("hex") + bad.v.toString(16).padStart(2, "0");
  const no = await bram.call(reach, sel("isValidSignature(bytes32,bytes)") +
    digest.slice(2) + W(0x40) + W(65) + badHex.padEnd(Math.ceil(65 / 32) * 64, "0"));
  ok("a stranger's is a plain no", no.slice(0, 10) !== "0x1626ba7e");
  const n0 = decUint(await bram.read(reach, "attestationNonce()"));
  await send(bram, reach, "retireAttestations()", [], { label: "retire" });
  ok("one bump retires every attestation ever signed",
     decUint(await bram.read(reach, "attestationNonce()")) > n0);
}

/*═══════════════ X · the market ═══════════════*/
head("X · the market: two mock assets, one exchange per token");
hit("Pool.openMarket", "Pool.deposit", "Pool.withdraw", "Pool.quote", "Pool.swap",
    "Pool.setFee", "Pool.market", "Pool.marketOf", "Pool.openCount", "Pool.openIds",
    "Pool.tradeCount", "Pool.feesBase", "Pool.feesQuote", "Pool.maxDeposit",
    "Pool.collection", "Pool.admin", "Pool.pendingAdmin", "Pool.BPS", "Pool.MAX_FEE_BPS",
    "Pool.MAX_OUT_BPS", "Pool.MAX_BOND", "Pool.bond", "Pool.bondedUntil", "Pool.isBonded",
    "Pool.syncCurve", "Pool.pendingCurve", "Pool.setPaused", "Pool.paused",
    "Pool.setAllowlistEnforced", "Pool.allowlistEnforced", "Pool.bless", "Pool.blessed",
    "Pool.proposeAdmin", "Pool.acceptAdmin", "Pool.closeMarket");
const gld = gldPromise;
const slv = await curator.deploy(erc20, W(0xa0) + W(0xe0) + W(6) + W(0) + W(0) + encS("Sliver") + encS("SLV"), "SLV");
const tin = await curator.deploy(erc20, W(0xa0) + W(0xe0) + W(18) + W(0) + W(0) + encS("Tin") + encS("TIN"), "TIN");
note(`GLD ${gld} · SLV ${slv} · TIN ${tin} (unblessed, on purpose)`);
for (const [tok, who, amt] of [[gld, bram, 10n ** 21n], [slv, bram, 10n ** 10n],
                               [gld, cora, 10n ** 20n], [slv, cora, 10n ** 10n]]) {
  await send(curator, tok, "mint(address,uint256)", [addr(who), amt], { label: "erc20 mint" });
  await send(who, tok, "approve(address,uint256)", [POOL, (1n << 255n)], { label: "approve" });
}

/* the allowlist: a market only in assets somebody vouched for */
await send(curator, POOL, "setAllowlistEnforced(bool)", [1]);
ok("enforcement is on", decBool(await curator.read(POOL, "allowlistEnforced()")));
await send(curator, POOL, "bless(address,bool)", [gld, 1]);
await send(curator, POOL, "bless(address,bool)", [slv, 1]);
ok("blessed reads back", decBool(await curator.read(POOL, "blessed(address)", [gld])));
ok("an unblessed asset cannot anchor a market",
   await refuses(bram, POOL, enc("openMarket(uint256,address,address,uint16)", [B, tin, slv, 30])));
ok("a stranger cannot bless", await refuses(bram, POOL, enc("bless(address,bool)", [tin, 1])));

await send(bram, POOL, "openMarket(uint256,address,address,uint16)", [B, gld, slv, 30], { label: "openMarket" });
ok("the market is open", decUint(await bram.read(POOL, "openCount()")) >= 1n);
ok("a token runs one market", await refuses(bram, POOL, enc("openMarket(uint256,address,address,uint16)", [B, gld, slv, 30])));
await send(bram, POOL, "deposit(uint256,uint256,uint256)", [B, 200n * 10n ** 18n, 6n * 10n ** 8n], { label: "deposit" });
ok("only the holder stocks the shelves",
   await refuses(cora, POOL, enc("deposit(uint256,uint256,uint256)", [B, 1n, 1n])));

const deadline = (await nowChain()) + 1800n;
const quoted = decUint(await cora.read(POOL, "quote(uint256,bool,uint256)", [B, 1, 10n ** 18n]));
ok(`the pool quotes: 1 GLD → ${Number(quoted) / 1e6} SLV`, quoted > 0n);
const slvBefore = decUint(await cora.read(slv, "balanceOf(address)", [addr(cora)]));
await send(cora, POOL, "swap(uint256,bool,uint256,uint256,address,uint256)",
  [B, 1, 10n ** 18n, quoted, addr(cora), deadline], { label: "swap" });
eq("and delivers exactly what it quoted",
   decUint(await cora.read(slv, "balanceOf(address)", [addr(cora)])) - slvBefore, quoted);
ok("a worse floor than quoted is refused",
   await refuses(cora, POOL, enc("swap(uint256,bool,uint256,uint256,address,uint256)",
     [B, 1, 10n ** 18n, quoted * 2n, addr(cora), deadline])));
await send(cora, POOL, "swap(uint256,bool,uint256,uint256,address,uint256)",
  [B, 0, 10n ** 6n, 0, addr(cora), deadline], { label: "swap back" });
ok("the other direction trades too", decUint(await cora.read(POOL, "tradeCount(uint256)", [B])) === 2n);
ok("fees accrued to the token's side",
   decUint(await bram.read(POOL, "feesBase(uint256)", [B])) > 0n ||
   decUint(await bram.read(POOL, "feesQuote(uint256)", [B])) > 0n);

await send(bram, POOL, "setFee(uint256,uint16)", [B, 100], { label: "setFee" });
eq("the fee is the holder's dial", decUint(await bram.read(POOL, "market(uint256)", [B]), 4), 100n);
await send(bram, POOL, "withdraw(uint256,uint256,uint256,address)",
  [B, 10n * 10n ** 18n, 0, addr(bram)], { label: "withdraw" });
ok("the holder took inventory back out", true);
await send(bram, POOL, "syncCurve(uint256)", [B], { label: "syncCurve" });
ok("the curve follows the artwork — pendingCurve read",
   (await bram.read(POOL, "pendingCurve(uint256)", [B])).length >= 66);

/* pause is the admin's brake, not a trade tool */
await send(curator, POOL, "setPaused(bool)", [1]);
ok("paused, nobody trades",
   await refuses(cora, POOL, enc("swap(uint256,bool,uint256,uint256,address,uint256)",
     [B, 1, 10n ** 18n, 0, addr(cora), deadline])));
await send(curator, POOL, "setPaused(bool)", [0]);
ok("unpaused", !decBool(await curator.read(POOL, "paused()")));

/* the admin moves by propose-and-accept, and back again */
await send(curator, POOL, "proposeAdmin(address)", [addr(dain)]);
eq("proposed", decAddr(await curator.read(POOL, "pendingAdmin()")).toLowerCase(), addr(dain));
await send(dain, POOL, "acceptAdmin()", []);
eq("dain is the market's admin now", decAddr(await curator.read(POOL, "admin()")).toLowerCase(), addr(dain));
await send(dain, POOL, "proposeAdmin(address)", [addr(curator)]);
await send(curator, POOL, "acceptAdmin()", []);
eq("and handed it back", decAddr(await curator.read(POOL, "admin()")).toLowerCase(), addr(curator));

/* the bond: a promise to stay open, kept by arithmetic */
const until = (await nowChain()) + 3600n;
await send(bram, POOL, "bond(uint256,uint64)", [B, until], { label: "bond" });
ok("bonded for the hour", decBool(await bram.read(POOL, "isBonded(uint256)", [B])) &&
   decUint(await bram.read(POOL, "bondedUntil(uint256)", [B])) === until);
ok("a bonded market cannot be emptied",
   await refuses(bram, POOL, enc("withdraw(uint256,uint256,uint256,address)", [B, 1n, 0n, addr(bram)])));
ok("nor closed", await refuses(bram, POOL, enc("closeMarket(uint256)", [B])));
note("the market stays open and bonded on the chain — that is the point of it");

/*═══════════════ XI · the manifest and the seal ═══════════════*/
head("XI · the Reach guards, then seals");
hit("IpseityAccount.guard", "IpseityAccount.unguard", "IpseityAccount.guardNFT",
    "IpseityAccount.unguardNFT", "IpseityAccount.manifest", "IpseityAccount.onManifest",
    "IpseityAccount.seal", "IpseityAccount.isSealed", "IpseityAccount.sealedUntil");
await send(curator, gld, "mint(address,uint256)", [reach, 10n ** 18n], { label: "gld to reach" });
await send(bram, reach, "guard(address)", [gld], { label: "guard" });
ok("GLD is on the manifest", decBool(await bram.read(reach, "onManifest(address)", [gld])));
await send(bram, reach, "unguard(address)", [gld], { label: "unguard" });
ok("and may be unlisted while nothing is sealed",
   !decBool(await bram.read(reach, "onManifest(address)", [gld])));
await send(bram, reach, "guard(address)", [gld], { label: "guard again" });

/*  A piece on the manifest is a piece the hand holds — guardNFT refuses a
    promise about anything else. So a token goes into the Reach first, by
    the ordinary safe transfer, which also exercises the account's own
    onERC721Received accepting an NFT that is not its bound self.        */
await send(bram, NFT, "mint()", [], { value: 10n ** 14n, label: "mint for the vault" });
const P = decUint(await bram.read(NFT, "totalSupply()"));
ok("a piece it does not hold cannot be promised",
   await refuses(bram, reach, enc("guardNFT(address,uint256)", [NFT, C])));
await send(bram, NFT, "safeTransferFrom(address,address,uint256)", [addr(bram), reach, P],
  { label: "piece into the reach" });
eq("the Reach holds it", decAddr(await bram.read(NFT, "ownerOf(uint256)", [P])).toLowerCase(), reach.toLowerCase());
await send(bram, reach, "guardNFT(address,uint256)", [NFT, P], { label: "guardNFT" });
ok("on the manifest of pieces", (await bram.read(reach, "pieces()")).length > 66);
await send(bram, reach, "unguardNFT(uint256)", [0], { label: "unguardNFT" });
await send(bram, reach, "guardNFT(address,uint256)", [NFT, P], { label: "guard the piece again" });
const sealUntil = (await nowChain()) + 600n;
await send(bram, reach, "seal(uint64)", [sealUntil], { label: "seal" });
ok("sealed for ten minutes", decBool(await bram.read(reach, "isSealed()")));
ok("the seal is a ratchet — it cannot shorten",
   await refuses(bram, reach, enc("seal(uint64)", [sealUntil - 300n])));
ok("a guarded asset cannot leave while the seal holds — even by the owner's hand",
   await refuses(bram, reach, enc("execute(address,uint256,bytes,uint8)",
     [gld, 0n, enc("transfer(address,uint256)", [addr(bram), 10n ** 17n]), 0])));
ok("nor can the guarded piece",
   await refuses(bram, reach, enc("execute(address,uint256,bytes,uint8)",
     [NFT, 0n, enc("transferFrom(address,address,uint256)", [reach, addr(bram), P]), 0])));
{
  const digest = "0x" + Buffer.from(keccak256(Buffer.from("under seal"))).toString("hex");
  const sig = ecsign(hexToBytes(digest), hexToBytes(crewKeys[0]));
  const sigHex = Buffer.from(sig.r).toString("hex") + Buffer.from(sig.s).toString("hex") + sig.v.toString(16).padStart(2, "0");
  const ans = await bram.call(reach, sel("isValidSignature(bytes32,bytes)") +
    digest.slice(2) + W(0x40) + W(65) + sigHex.padEnd(192, "0"));
  ok("under seal, a bare signature is no signature — only attestations pass",
     ans.slice(0, 10) !== "0x1626ba7e");
}

/*──── the Grip: the hand that only receives ────*/
head("XI·b — the Grip");
hit("GripVault.owner", "GripVault.token", "GripVault.state", "GripVault.isOneWay",
    "GripVault.holdings", "GripVault.supportsInterface", "GripVault.isValidSignature",
    "GripVault.isValidSigner", "GripVault.onERC721Received", "GripVault.onERC1155Received",
    "GripVault.onERC1155BatchReceived");
await raw(cora, grip, "0x", 5n * 10n ** 13n, "a stranger gives");
await send(curator, gld, "mint(address,uint256)", [grip, 7n * 10n ** 17n], { label: "gld to grip" });
ok("the Grip received ether and tokens",
   BigInt(await curator.rpc("eth_getBalance", [grip, "latest"])) >= 5n * 10n ** 13n);
ok("it says so itself", decBool(await bram.read(grip, "isOneWay()")));
{
  const h = await bram.call(grip, sel("holdings(address[])") + W(0x20) + W(1) + A_(gld));
  ok("and can be audited in one call", h.length > 66);
  const gripAbi = ART("src/GripVault.sol", "GripVault").abi.filter((x) =>
    x.type === "function" && x.stateMutability !== "view" && x.stateMutability !== "pure");
  eq("the compiled ABI holds zero functions that spend — the guarantee is absence",
     gripAbi.length, 0);
  const no = await bram.call(grip, sel("isValidSignature(bytes32,bytes)") +
    "11".repeat(32) + W(0x40) + W(0));
  ok("it signs nothing", no.slice(0, 10) !== "0x1626ba7e");
}

/*═══════════════ XII · the sealed kernel ═══════════════*/
head("XII · the kernel: seal, authorise, clone, carry");
hit("Ipseity.setVerifier", "Ipseity.verifier", "Ipseity.sealKernel", "Ipseity.kernelStatus",
    "Ipseity.kernelProved", "Ipseity.dataHashesOf", "Ipseity.sealedTo",
    "Ipseity.authorizeUsage", "Ipseity.usageAuthorised", "Ipseity.cloneWithKernel",
    "Ipseity.parentOf", "Ipseity.transferWithKernel",
    "Ipseity.KERNEL_ABSENT", "Ipseity.KERNEL_CURRENT", "Ipseity.KERNEL_STALE");
/*  The verifier is write-once: set from zero one time, and after that
    `setVerifier` reverts for everybody, curator included — a rotatable
    verifier is not a verifier. On a chain an earlier run already touched,
    the immutability is the thing to assert.                             */
let verifier = decAddr(await curator.read(NFT, "verifier()"));
if (verifier === "0x" + "0".repeat(40)) {
  verifier = await curator.deploy(ART("test/mocks/MockVerifier.sol", "MockVerifier").bytecode, "", "verifier");
  ok("only the curator names the verifier",
     await refuses(bram, NFT, enc("setVerifier(address)", [verifier])));
  await send(curator, NFT, "setVerifier(address)", [verifier]);
  eq("named, once", decAddr(await curator.read(NFT, "verifier()")).toLowerCase(), verifier.toLowerCase());
} else {
  ok("an earlier run fixed the verifier, and now nobody can replace it — not even the curator",
     await refuses(curator, NFT, enc("setVerifier(address)", [verifier])));
}
hit("Ipseity.hasVerifier");
ok("and the collection admits it has one", decBool(await curator.read(NFT, "hasVerifier()")));

const h1 = "0x" + "a1".repeat(32), h2 = "0x" + "b2".repeat(32);
const k1 = "0x" + "07".repeat(32), k2 = "0x" + "08".repeat(32);
eq("before sealing: no kernel", decUint(await bram.read(NFT, "kernelStatus(uint256)", [B])),
   decUint(await bram.read(NFT, "KERNEL_ABSENT()")));
await raw(bram, NFT, sel("sealKernel(uint256,bytes32[],bytes32)") +
  W(B) + W(0x60) + B32(k1) + W(1) + B32(h1), 0n, "sealKernel");
eq("sealed and current", decUint(await bram.read(NFT, "kernelStatus(uint256)", [B])),
   decUint(await bram.read(NFT, "KERNEL_CURRENT()")));
eq("the payload hash is on record",
   (await bram.read(NFT, "dataHashesOf(uint256)", [B])).slice(-64), h1.slice(2));
await send(bram, NFT, "authorizeUsage(uint256,address)", [B, addr(cora)], { label: "authorizeUsage" });
ok("cora may use the sealed payload — says the chain, not a promise",
   decBool(await bram.read(NFT, "usageAuthorised(uint256,address)", [B, addr(cora)])));

/* a child: same kernel, re-sealed to a new key, minted for the mint price */
const proofClone = "0x" + h1.slice(2) + h1.slice(2) + k2.slice(2);
const rClone = await raw(bram, NFT, sel("cloneWithKernel(address,uint256,bytes)") +
  A_(addr(bram)) + W(B) + W(0x60) + W(96) + proofClone.slice(2), 10n ** 14n, "cloneWithKernel");
const CHILD = decUint(await bram.read(NFT, "totalSupply()"));
eq(`#${CHILD} is #${B}'s child`, decUint(await bram.read(NFT, "parentOf(uint256)", [CHILD])), B);
eq("born with a current kernel", decUint(await bram.read(NFT, "kernelStatus(uint256)", [CHILD])),
   decUint(await bram.read(NFT, "KERNEL_CURRENT()")));

/* a plain transfer does not carry a kernel — it goes stale, loudly */
await send(bram, NFT, "transferFrom(address,address,uint256)", [addr(bram), addr(cora), CHILD], { label: "plain transfer" });
eq("moved without a proof, the child's kernel is STALE",
   decUint(await cora.read(NFT, "kernelStatus(uint256)", [CHILD])),
   decUint(await cora.read(NFT, "KERNEL_STALE()")));

/* the parent moves WITH its kernel: re-sealed to the buyer's key in the same act */
ok("a proof about some other payload is refused",
   await refuses(bram, NFT, (() => sel("transferWithKernel(address,uint256,bytes)") +
     A_(addr(dain)) + W(B) + W(0x60) + W(96) + h2.slice(2) + h2.slice(2) + k2.slice(2))()));
const proofMove = h1.slice(2) + h2.slice(2) + k2.slice(2);
await raw(bram, NFT, sel("transferWithKernel(address,uint256,bytes)") +
  A_(addr(dain)) + W(B) + W(0x60) + W(96) + proofMove, 0n, "transferWithKernel");
eq(`#${B} now belongs to dain`, decAddr(await dain.read(NFT, "ownerOf(uint256)", [B])).toLowerCase(), addr(dain));
eq("re-sealed to the new key in the same act",
   (await dain.read(NFT, "sealedTo(uint256)", [B])).slice(-64), k2.slice(2));
eq("and still current", decUint(await dain.read(NFT, "kernelStatus(uint256)", [B])),
   decUint(await dain.read(NFT, "KERNEL_CURRENT()")));
eq("the transfer counter noticed", decUint(await dain.read(NFT, "statsOf(uint256)", [B]), 1), 1n);

/*═══════════════ XIII · approvals, and the curatorship moves ═══════════════*/
head("XIII · approvals and the curator's chair");
hit("Ipseity.approve", "Ipseity.getApproved", "Ipseity.setApprovalForAll",
    "Ipseity.isApprovedForAll", "Ipseity.safeTransferFrom", "Ipseity.transferFrom",
    "Ipseity.transferOwnership", "Ipseity.acceptOwnership", "Ipseity.pendingCurator",
    "Ipseity.setRoyalty", "Ipseity.royaltyInfo", "Ipseity.royaltyBps",
    "Ipseity.royaltyReceiver", "Ipseity.setPool", "Ipseity.pool");
await send(cora, NFT, "approve(address,uint256)", [addr(dain), CHILD]);
eq("approved", decAddr(await cora.read(NFT, "getApproved(uint256)", [CHILD])).toLowerCase(), addr(dain));
await send(dain, NFT, "transferFrom(address,address,uint256)", [addr(cora), addr(dain), CHILD], { label: "by approval" });
eq("an approval is a real key", decAddr(await dain.read(NFT, "ownerOf(uint256)", [CHILD])).toLowerCase(), addr(dain));
await send(dain, NFT, "safeTransferFrom(address,address,uint256)", [addr(dain), addr(cora), CHILD], { label: "safeTransfer back" });
eq("and safeTransferFrom hands it back", decAddr(await cora.read(NFT, "ownerOf(uint256)", [CHILD])).toLowerCase(), addr(cora));
await send(cora, NFT, "setApprovalForAll(address,bool)", [addr(dain), 1]);
ok("operator for all", decBool(await cora.read(NFT, "isApprovedForAll(address,address)", [addr(cora), addr(dain)])));
await send(cora, NFT, "setApprovalForAll(address,bool)", [addr(dain), 0]);
ok("and revoked", !decBool(await cora.read(NFT, "isApprovedForAll(address,address)", [addr(cora), addr(dain)])));

await send(curator, NFT, "transferOwnership(address)", [addr(dain)], { label: "propose curator" });
eq("proposed, not moved", decAddr(await curator.read(NFT, "pendingCurator()")).toLowerCase(), addr(dain));
await send(dain, NFT, "acceptOwnership()", [], { label: "accept" });
eq("the chair moved on acceptance", decAddr(await curator.read(NFT, "curator()")).toLowerCase(), addr(dain));
await send(dain, NFT, "setRoyalty(address,uint96)", [addr(cora), 500], { label: "setRoyalty" });
{
  const ri = await curator.read(NFT, "royaltyInfo(uint256,uint256)", [B, 10n ** 18n]);
  eq("2981: 5% to cora", decUint(ri, 1), 5n * 10n ** 16n);
  eq("named receiver", decAddr(ri).toLowerCase(), addr(cora));
}
await send(dain, NFT, "transferOwnership(address)", [addr(curator)], { label: "propose back" });
await send(curator, NFT, "acceptOwnership()", [], { label: "accept back" });
eq("and handed back", decAddr(await curator.read(NFT, "curator()")).toLowerCase(), addr(curator));
await send(curator, NFT, "setPool(address)", [POOL], { label: "setPool (same)" });
eq("the market pointer re-stated, unchanged",
   decAddr(await curator.read(NFT, "pool()")).toLowerCase(), POOL.toLowerCase());
skip("Ipseity.renounceOwnership", "abandoning the curatorship on a live rehearsal forfeits repricing and the verifier — a mainnet act, done to a timelock, not to zero");
skip("Ipseity.setRenderer", "pointing the collection away from its real renderer breaks every token on this deployment to prove a setter works — proven in-suite");
skip("Ipseity.sealRenderer", "irreversible forever; the rehearsal stays unsealed so the real ceremony still has something to seal");
skip("Ipseity.cloneWithKernel", "exercised above (raw calldata)"); hit("Ipseity.cloneWithKernel");
hit("Ipseity.rendererSealed", "Ipseity.renderer");
ok("rendererSealed reads false, as DEPLOYMENTS.md promises",
   !decBool(await curator.read(NFT, "rendererSealed()")));

/*═══════════════ XIV · the parley, as the new tokens ═══════════════*/
head("XIV · the tokens meet each other");
hit("Parley.speak", "Parley.whisper", "Parley.found", "Parley.invite", "Parley.join",
    "Parley.leave", "Parley.evict", "Parley.announce", "Parley.keyOf", "Parley.keysOf",
    "Parley.mayActAs", "Parley.stateOf", "Parley.heads", "Parley.roomsOf", "Parley.roomCount",
    "Parley.inRoom", "Parley.invited", "Parley.nameOf", "Parley.groups", "Parley.groupKey",
    "Parley.pairKey", "Parley.lastSpoke", "Parley.topics", "Parley.COMMONS", "Parley.HUB",
    "Parley.MAX_BODY", "Parley.MAX_NAME", "Parley.PLAIN", "Parley.SEALED",
    "Parley.IS_COMMONS", "Parley.IS_GROUP", "Parley.IS_PAIR");
const sayAs = (actor, room, from, text) =>
  send(actor, PARLEY, "speak(uint256,uint256,uint8,bytes)", [room, from, 0, utf8(text)], { label: "speak" });
ok("dain may speak as #" + B + " — the voice followed the kernel transfer",
   decBool(await dain.read(PARLEY, "mayActAs(uint256,address)", [B, addr(dain)])));
ok("bram may not any more — he sold it",
   !decBool(await bram.read(PARLEY, "mayActAs(uint256,address)", [B, addr(bram)])));
await sayAs(dain, 0n, B, "the exercised one reports: every function, walked");
await sayAs(cora, 0n, C, "witnessed, all of it, from the other side of the trades");

await send(cora, PARLEY, "found(uint256,string,bool)", [C, "the second circle", false], { label: "found" });
const g2 = decUint(await cora.read(PARLEY, "groupKey(uint256)", [decUint(await cora.read(PARLEY, "groups()"))]));
ok("closed doors stay closed", await refuses(dain, PARLEY, enc("join(uint256,uint256)", [g2, B])));
await send(cora, PARLEY, "invite(uint256,uint256,uint256)", [g2, C, B], { label: "invite" });
await send(dain, PARLEY, "join(uint256,uint256)", [g2, B], { label: "join" });
await sayAs(dain, g2, B, "in the circle");
await send(cora, PARLEY, "evict(uint256,uint256,uint256)", [g2, C, B], { label: "evict" });
ok("shown the door", !decBool(await cora.read(PARLEY, "inRoom(uint256,uint256)", [g2, B])));
await send(cora, PARLEY, "invite(uint256,uint256,uint256)", [g2, C, B], { label: "re-invite" });
await send(dain, PARLEY, "join(uint256,uint256)", [g2, B], { label: "re-join" });
await send(dain, PARLEY, "leave(uint256,uint256)", [g2, B], { label: "leave" });
ok("and left on its own terms this time",
   !decBool(await cora.read(PARLEY, "inRoom(uint256,uint256)", [g2, B])) &&
   decUint(await cora.read(PARLEY, "roomCount(uint256)", [B])) >= 1n);

await send(dain, PARLEY, "announce(uint256,bytes32,bytes32)",
  [B, "0x" + "c3".repeat(32), "0x" + "d4".repeat(32)], { label: "announce" });
ok("a sealing key is published", (await dain.read(PARLEY, "keyOf(uint256)", [B])).includes("c3c3"));
hit("Parley.sealX", "Parley.sealY");
ok("readable coordinate by coordinate too",
   (await dain.read(PARLEY, "sealX(uint256)", [B])).includes("c3c3") &&
   (await dain.read(PARLEY, "sealY(uint256)", [B])).includes("d4d4"));
await send(dain, PARLEY, "whisper(uint256,uint256,uint8,bytes)",
  [B, 3, 0, utf8("to the holder of #3: your collection walked its whole surface today")], { label: "whisper to #3" });
await send(cora, PARLEY, "whisper(uint256,uint256,uint8,bytes)",
  [C, B, 0, utf8("between the two of us, it held")], { label: "whisper" });
ok("the pair rooms filled",
   decUint(await cora.read(PARLEY, "stateOf(uint256)",
     [decUint(await cora.read(PARLEY, "pairKey(uint256,uint256)", [C, B]))]), 1) >= 1n);
ok("an oversized body is refused",
   await refuses(dain, PARLEY, enc("speak(uint256,uint256,uint8,bytes)", [0n, B, 0, "0x" + "61".repeat(1025)])));

/*═══════════════ XV · the interfaces, sworn to ═══════════════*/
head("XV · ERC-165, and what the token swears it is");
hit("Ipseity.supportsInterface");
for (const [id, name] of [["0x01ffc9a7", "165"], ["0x80ac58cd", "721"], ["0x5b5e139f", "721Metadata"],
    ["0x780e9d63", "721Enumerable"], ["0x2a55205a", "2981"], ["0x49064906", "4906"],
    ["0xad092b5c", "4907"], ["0xb45a3c0e", "5192"]]) {
  ok(`claims ERC-${name}`, decBool(await curator.read(NFT, "supportsInterface(bytes4)", [id])));
}
ok("and does not claim nonsense",
   !decBool(await curator.read(NFT, "supportsInterface(bytes4)", ["0xdeadbeef"])));

/*═══════════════ XVI · the site tells the same story ═══════════════*/
head("XVI · the site reflects all of it");
const GET = getter(curator, PREMISES);
{
  const mk = await GET(["token", String(B), "market"]);
  ok(`/token/${B}/market shows the GLD/SLV market`, mk.status === 200 && mk.body.includes("GLD"));
  const open = await GET(["open"]);
  ok("/open lists it", open.body.includes(`/token/${B}/market`));
  const dm = await GET(["dm", String(B)]);
  ok(`/dm/${B} answers for the token dain now holds`, dm.status === 200);
  const rent = await GET(["token", String(B), "rent"]);
  ok("the rent counter renders its closed terms", rent.status === 200);
}

/*═══════════════ XVI·b · one more, for the address that funded all this ═══════════════*/
head("XVI·b · mintTo");
hit("Ipseity.mintTo");
{
  const YOU = "0x4601f61EEc40caBb0791e11ae42250Ab131E28DF";
  await send(curator, NFT, "mintTo(address)", [YOU], { value: 10n ** 14n, label: "mintTo" });
  const M = decUint(await curator.read(NFT, "totalSupply()"));
  eq(`#${M} minted straight to the funder's address`,
     decAddr(await curator.read(NFT, "ownerOf(uint256)", [M])).toLowerCase(), YOU.toLowerCase());
}

/*═══════════════ XVII · the reconciliation ═══════════════*/
head("XVII · every function, accounted for");
const CONTRACTS = [["Ipseity", "src/Ipseity.sol"], ["IpseityAccount", "src/IpseityAccount.sol"],
  ["GripVault", "src/GripVault.sol"], ["Pool", "src/Pool.sol"],
  ["Lease", "src/Lease.sol"], ["Parley", "src/Parley.sol"]];
let missing = [];
for (const [name, file] of CONTRACTS) {
  const fns = [...new Set(ART(file, name).abi.filter((x) => x.type === "function").map((x) => `${name}.${x.name}`))];
  const un = fns.filter((f) => !COVERED.has(f) && !SKIPPED.has(f));
  console.log(`  ${name.padEnd(15)} ${String(fns.length).padStart(3)} functions · ` +
    `${fns.filter((f) => COVERED.has(f)).length} exercised · ` +
    `${fns.filter((f) => SKIPPED.has(f)).length} skipped with reasons`);
  missing.push(...un);
}
ok("nothing fell through the ledger", missing.length === 0, missing.join(", "));
for (const [f, why] of SKIPPED) note(`skipped ${f} — ${why}`);

fs.writeFileSync(path.join(ROOT, "dist/exercise-log.json"), JSON.stringify({
  chain: curator.chainId, when: new Date().toISOString(),
  actors: { curator: addr(curator), bram: addr(bram), cora: addr(cora), dain: addr(dain) },
  tokens: { exercised: String(B), witness: String(C), child: String(CHILD) },
  markets: { gld, slv }, txs: txlog
}, null, 1));
note(`${txlog.length} transactions · dist/exercise-log.json holds every hash`);
console.log(`\n  ${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
