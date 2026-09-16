#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the whole thing, on a testnet

  Deploys the collection and the site to a real node over JSON-RPC — signed
  transactions, mined blocks, receipts — then reads it all back through the
  same wire a stranger's browser would use. Nothing in this file touches an
  in-process EVM; if the node lies, this fails.

      npx hardhat node                          # in another terminal
      node tools/testnet.mjs                    # local, hardhat keys

      RPC_URL=https://… PRIVATE_KEY=0x… \
        node tools/testnet.mjs                  # a public testnet.
                                                # ~35 transactions, ~30M gas
                                                # total — have the ether.

  On a public testnet the ERC-6551 registry is expected at its canonical
  address (it is deployed on every serious chain); locally it is placed
  there with hardhat_setCode, exactly as the in-process suite places it.

  What gets seeded is a real conversation: two holders, the commons, a
  group, a whisper — spread across blocks, so the back-link walk has
  something to walk.
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, artifact } from "./compile.mjs";
import { enc, sel, decUint, decAddr, decBool, decString, encodeAddressArg } from "./evm.mjs";
import { RpcChain, DEV_KEYS } from "./rpc.mjs";
import { deploySite, getter, UNISWAP, bandArgs, bandOrWhole, bandFor } from "./site.mjs";
import { keccak256 } from "ethereum-cryptography/keccak.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.RPC_URL || "http://127.0.0.1:8545";
const KEY = process.env.PRIVATE_KEY || DEV_KEYS[0];
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${name}`);
  if (!cond && detail !== undefined) console.log(`      ${detail}`);
};
const eq = (name, got, want) =>
  ok(name, String(got) === String(want), `got ${got}\n      want ${want}`);
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);
const note = (s) => console.log(`      \x1b[2m${s}\x1b[0m`);
const w = (n) => BigInt(n).toString(16).padStart(64, "0");
const mgas = (n) => (Number(n) / 1e6).toFixed(2) + "M";

console.log("\n  \x1b[1mIPSEITY · testnet\x1b[0m");

/*──────────────── the node ────────────────*/
head("the node");
const c = await RpcChain.open(RPC, KEY);
const chainId = c.chainId;
const bal = await c.balanceOf(c.from.toString());
console.log(`      ${RPC}`);
console.log(`      chain ${chainId} · deployer ${c.from.toString()}`);
console.log(`      balance ${(Number(bal) / 1e18).toFixed(4)} ETH`);

/*  What this run actually needs, priced at this chain's own gas: two mints
    at 0.01 ether each, ~70M gas of deployment with a 3x margin for fee
    drift and any L2's data fee. On Base Sepolia at its usual fraction of a
    gwei that lands near 0.021 ETH, almost all of it the mint value.     */
const gasPrice = BigInt(await c.rpc("eth_gasPrice"));
/*  1.5x on the gas half: enough for fee drift without demanding a faucet
    grant three times the run. The two seed mints dominate anyway.       */
const need = 2n * 10n ** 14n + (90_000_000n * gasPrice * 15n) / 10n;
if (bal < need) {
  throw new Error(
    `fund the deployer first: it needs about ${(Number(need) / 1e18).toFixed(4)} ETH ` +
    `on chain ${chainId} and holds ${(Number(bal) / 1e18).toFixed(4)}`);
}

const local = chainId === 31337;
const bob = local ? await c.as(DEV_KEYS[1]) : null;

/*──────────────── the registry ────────────────*/
head("the ERC-6551 registry");
const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);
if ((await c.codeSize(REGISTRY)) === 0) {
  if (!local) {
    throw new Error(
      "no code at the canonical ERC-6551 registry on this chain. It is " +
      "deployed on every serious network; if yours truly lacks it, deploy " +
      "the reference registry via its published CREATE2 transaction first.");
  }
  const tmp = await c.deploy(A("test/mocks/ERC6551Registry.sol", "ERC6551Registry").bytecode,
    "", "registry");
  await c.rpc("hardhat_setCode", [REGISTRY, await c.rpc("eth_getCode", [tmp, "latest"])]);
}
ok("code at the canonical address", (await c.codeSize(REGISTRY)) > 0);

/*──────────────── the collection ────────────────*/
head("the collection");
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "dist/shards.json"), "utf8"));
if (plan.mode !== "packed") throw new Error("rebuild the shards without --raw first");

const engine = await c.deploy(A("src/Engine.sol", "Engine").bytecode, w(1), "Engine");
let loadGas = 0n;
for (const s of plan.head) loadGas += (await c.exec(engine, "loadHead(bytes)", [s.data], { label: "load" })).gas;
for (const s of plan.body) loadGas += (await c.exec(engine, "loadBody(bytes)", [s.data], { label: "load" })).gas;
await c.exec(engine, "setInflatedSize(uint32)", [plan.inflatedSize]);
await c.exec(engine, "freeze()", []);
note(`document on chain: ${plan.storedBytes.toLocaleString("en-US")} bytes, ${mgas(loadGas)} gas to load`);

const sigil = await c.deploy(A("src/Sigil.sol", "Sigil").bytecode, "", "Sigil");
const renderer = await c.deploy(A("src/Renderer.sol", "Renderer").bytecode,
  encodeAddressArg(engine) + encodeAddressArg(sigil), "Renderer");
const reach = await c.deploy(A("src/IpseityAccount.sol", "IpseityAccount").bytecode, "", "Reach");
const grip = await c.deploy(A("src/GripVault.sol", "GripVault").bytecode, "", "Grip");
/*  The band this chain issues from, read from the one table rather than
    typed here. A mainnet chain gets its slice of the edition; a testnet
    is a rehearsal and takes the whole range, because the point of a
    rehearsal is to exercise every id and no token on it is ever the
    token it is pretending to be.                                      */
const band = bandOrWhole(chainId);
console.log(`      band  ${band.name} · #${band.first}–#${band.last} ` +
            `(${band.last - band.first + 1} of 4096)` +
            (bandFor(chainId) ? "" : "  \x1b[2m— rehearsal, not part of the edition\x1b[0m"));
const nft = await c.deploy(A("src/Ipseity.sol", "Ipseity").bytecode,
  encodeAddressArg(renderer) + encodeAddressArg(reach) + encodeAddressArg(grip) +
  bandArgs(chainId), "Ipseity");
{
  const f = decUint(await c.read(nft, "FIRST_ID()")), l = decUint(await c.read(nft, "LAST_ID()"));
  if (f !== BigInt(band.first) || l !== BigInt(band.last))
    throw new Error(`the hub took band ${f}..${l}, not the ${band.first}..${band.last} it was given`);
  ok(`the hub issues #${band.first}–#${band.last} and refuses past it`, true);
}
const pool = await c.deploy(A("src/Pool.sol", "Pool").bytecode,
  encodeAddressArg(nft) + w(10n ** 27n) + encodeAddressArg(c.from.toString()) + w(0), "Pool");
await c.exec(nft, "setPool(address)", [pool]);
const lease = await c.deploy(A("src/Lease.sol", "Lease").bytecode, encodeAddressArg(nft), "Lease");
ok("engine frozen", decBool(await c.read(engine, "frozen()")));
note(`Ipseity ${nft}`);

/*──────────────── the site ────────────────*/
head("the site");
const uni = UNISWAP[chainId];
const site = await deploySite(c, A,
  { hub: nft, pool, lease, sigil, ...(uni ? { uniswap: uni } : {}) });
ok("thirteen contracts deployed", (await c.codeSize(site.premises)) > 0);
note(`Premises ${site.premises}`);
note(`Parley   ${site.parley}`);

/*──────────────── two holders, and a conversation ────────────────*/
head("two holders, and a conversation");
/*  Seed mints at testnet pricing. The default 0.01 ether is a statement
    about mainnet; on a chain whose ether comes from faucets it only turns
    a one-visit funding into two. The curator can always re-price.       */
await c.exec(nft, "setPricing(uint256,uint256)", [10n ** 14n, 10n ** 13n], { label: "setPricing" });
const mintPrice = decUint(await c.read(nft, "price()"));
await c.exec(nft, "mint()", [], { value: mintPrice, label: "mint" });     // #1
await c.exec(nft, "mint()", [], { value: mintPrice, label: "mint" });     // #2
const second = local ? bob.from.toString() : c.from.toString();
if (local) {
  await c.exec(nft, "transferFrom(address,address,uint256)",
    [c.from.toString(), second, 2], { label: "transfer" });
}
await c.exec(nft, "embody(uint256)", [1], { label: "embody" });

const say = (actor, room, from, text) =>
  actor.exec(site.parley, "speak(uint256,uint256,uint8,bytes)",
    [room, from, 0, "0x" + Buffer.from(text, "utf8").toString("hex")], { label: "speak" });

await say(c, 0n, 1n, "the first thing said on this chain");
await say(c, 0n, 1n, "and the second, from the same token");
const speaker2 = local ? bob : c;
await say(speaker2, 0n, 2n, "a second holder, a second voice");
await c.exec(site.parley, "found(uint256,string,bool)", [1, "the surveyors", true],
  { label: "found" });
const groupKey = decUint(await c.read(site.parley, "groupKey(uint256)", [1]));
await speaker2.exec(site.parley, "join(uint256,uint256)", [groupKey, 2], { label: "join" });
await speaker2.exec(site.parley, "speak(uint256,uint256,uint8,bytes)",
  [groupKey, 2, 0, "0x" + Buffer.from("reporting in").toString("hex")], { label: "speak" });
await c.exec(site.parley, "whisper(uint256,uint256,uint8,bytes)",
  [1, 2, 0, "0x" + Buffer.from("just between our two tokens").toString("hex")],
  { label: "whisper" });
ok("seven messages across three rooms",
   Number(decUint(await c.read(site.parley, "stateOf(uint256)", [0]), 1)) === 3);

/*──────────────── read it all back through the wire ────────────────*/
head("read back over JSON-RPC — no in-process EVM anywhere in this");

eq("resolveMode() is the exact ERC-6944 word",
   String(await c.read(site.premises, "resolveMode()")).toLowerCase(),
   "0x3532313900000000000000000000000000000000000000000000000000000000");

const GET = getter(c, site.premises);
for (const [p, type] of [
  [[], "text/html"], [["chat"], "text/html"], [["rooms"], "text/html"],
  [["room", "1"], "text/html"], [["dm", "2"], "text/html"],
  [["token", "1"], "text/html"], [["token", "1", "live"], "text/html"],
  [["token", "1", "sigil.svg"], "image/svg+xml"],
  [["services.json"], "application/json"]
]) {
  const r = await GET(p);
  ok(`/${p.join("/")}`.padEnd(22) + ` ${String(r.body.length).padStart(7)} B`,
     r.status === 200 && r.headers[0][1].startsWith(type),
     `status ${r.status} type ${r.headers[0] && r.headers[0][1]}`);
}

const live = await GET(["token", "1", "live"]);
ok("the instrument came over the wire whole",
   live.body.startsWith("<!DOCTYPE html>") && live.body.includes("$IPSE"));

const uri = decString(await c.read(nft, "tokenURI(uint256)", [1]));
ok("tokenURI answers through the node's eth_call",
   uri.startsWith("data:application/json;base64,"),
   uri.slice(0, 60));
note(`${(uri.length / 1024).toFixed(1)} KB through eth_call`);

/*──────────────── the walk, against a real eth_getLogs ────────────────*/
head("the walk, against the node's own eth_getLogs");
const SAID = "0x" + Buffer.from(keccak256(Buffer.from(
  "Said(uint256,uint256,uint64,uint64,uint64,uint8,bytes)"))).toString("hex");

let asked = 0;
const walk = async (room, want = 50) => {
  let at = decUint(await c.read(site.parley, "stateOf(uint256)", [room]), 0);
  const msgs = [];
  let guard = 0;
  while (at > 0n && msgs.length < want && guard++ < 64) {
    asked++;
    const ls = await c.getLogs({
      address: site.parley,
      fromBlock: "0x" + at.toString(16), toBlock: "0x" + at.toString(16),
      topics: [SAID, "0x" + w(room)]
    });
    if (!ls.length) break;
    const read = ls.map((l) => {
      const d = l.data.replace(/^0x/, "");
      const off = Number(BigInt("0x" + d.slice(4 * 64, 5 * 64))) * 2;
      const len = Number(BigInt("0x" + d.slice(off, off + 64)));
      return {
        from: BigInt(l.topics[2]),
        prev: BigInt("0x" + d.slice(0, 64)),
        body: Buffer.from(d.slice(off + 64, off + 64 + len * 2), "hex").toString("utf8"),
        block: BigInt(l.blockNumber)
      };
    });
    for (let i = read.length - 1; i >= 0; --i) msgs.push(read[i]);
    const step = read[0].prev;
    if (!(step < at)) break;
    at = step;
  }
  return msgs.reverse();
};

asked = 0;
const commons = await walk(0n);
eq("the commons reads back in order",
   commons.map((m) => m.body).join(" | "),
   "the first thing said on this chain | and the second, from the same token | " +
   "a second holder, a second voice");
eq("attributed to the tokens that said them", commons.map((m) => m.from).join(","), "1,1,2");
ok(`read in ${asked} single-block eth_getLogs queries, no range scan`, asked === 3,
   `${asked} queries`);

asked = 0;
const dm = await walk(decUint(await c.read(site.parley, "pairKey(uint256,uint256)", [1, 2])));
eq("the pair room reads back", dm.map((m) => m.body).join(""), "just between our two tokens");

/*──────────────── who may speak, enforced by the chain ────────────────*/
if (local) {
  head("the gate is the contract, not the page");
  let refused = false;
  try { await say(bob, 0n, 1n, "I am not #1's holder"); } catch { refused = true; }
  ok("a live node refuses a wallet speaking as a token it does not hold", refused);
}

/*──────────────── remember where everything is ────────────────*/
const record = {
  rpc: RPC, chainId,
  deployer: c.from.toString(),
  /*  Every address, not a hand-picked thirteen. The list below used to be
      written out by name, which meant each page added to deploySite was a
      page this record silently stopped mentioning — and dist/ is ignored,
      so a container reclaimed overnight took the page addresses with it.
      Spreading the site keeps the record honest by construction.       */
  contracts: {
    engine, sigil, renderer, reach, grip, ipseity: nft, pool, lease,
    ...site
  },
  holders: { "1": c.from.toString(), "2": second },
  urls: {
    door: `web3://${site.premises}${chainId === 1 ? "" : ":" + chainId}/`,
    chat: `web3://${site.premises}${chainId === 1 ? "" : ":" + chainId}/chat`,
    instrument: `web3://${site.premises}${chainId === 1 ? "" : ":" + chainId}/token/1/live`
  }
};
fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "dist/testnet.json"), JSON.stringify(record, null, 1));
/*  And a per-chain record that survives in the repository, so a clone can
    point the gateway at a deployment nobody has to redo.                */
const SLUGS = { 84532: "base-sepolia", 11155111: "eth-sepolia" };
if (SLUGS[chainId]) {
  fs.mkdirSync(path.join(ROOT, "deployments"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, `deployments/${SLUGS[chainId]}.json`),
    JSON.stringify(record, null, 1));
}

head("gas, as the node metered it");
for (const [k, v] of Object.entries(c.gas).sort((a, b) => Number(b[1] - a[1])))
  console.log(`      ${k.padEnd(10)} ${mgas(v).padStart(8)}`);
console.log(`      ${"total".padEnd(10)} ${mgas(Object.values(c.gas).reduce((a, b) => a + b, 0n)).padStart(8)}`);

head("where it lives");
console.log(`      ${record.urls.door}`);
console.log(`      ${record.urls.chat}`);
console.log(`      ${record.urls.instrument}`);
note("dist/testnet.json holds every address · tools/gateway.mjs serves it over HTTP");

console.log(`\n  ${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
