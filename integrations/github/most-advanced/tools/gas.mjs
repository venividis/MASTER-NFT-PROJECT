#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the gas budget, measured against the caps that actually exist

  A view function costs nobody any ether. That is exactly why it is easy to
  write one nobody can call. `eth_call` is executed by a node, and every
  node puts a ceiling on how much work it will do for a call it is not
  being paid for:

    geth           --rpc.gascap          50,000,000   (its default)
    erigon         --rpc.gascap          50,000,000
    nethermind     JsonRpc.GasCap        100,000,000
    reth           --rpc.gascap          50,000,000
    hosted RPC     varies, and is often much lower

  So the number that matters for tokenURI() is not the block gas limit. It
  is the smallest gascap on the path between a wallet and this contract,
  and past that ceiling the call does not return an error about gas — it
  returns "out of gas", which reads to a marketplace as a broken token.

  This measures every read path against those ceilings and says which of
  them are reachable from where. It runs in `npm run check`, so a change
  that pushes a face over a cap is caught in the commit that does it,
  rather than by a user whose wallet renders a grey square.

    node tools/gas.mjs
    node tools/gas.mjs --json        machine-readable, for CI
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, artifact } from "./compile.mjs";
import { Chain, enc, sel, encodeAddressArg, decAddr, decUint } from "./evm.mjs";
import { deploySite, encRequest } from "./site.mjs";
import { createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = process.argv.includes("--json");
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";

/*  The ceilings, cheapest first. "reachable" means every node at or above
    this cap will run the call; below it, the call fails.                 */
const CAPS = [
  { at: 10_000_000n,  who: "a cautious hosted RPC" },
  { at: 30_000_000n,  who: "a node capped at one block" },
  { at: 50_000_000n,  who: "geth, erigon and reth, at their defaults" },
  { at: 100_000_000n, who: "nethermind, at its default" }
];
const FLOOR = CAPS[2].at;          // the one that decides "works by default"

const M = (n) => (Number(n) / 1e6).toFixed(2) + "M";
const W = (v) => BigInt(v).toString(16).padStart(64, "0");
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);

/*──────────────────── a world with one token in it ────────────────────*/
const plan = (() => {
  const p = path.join(ROOT, "dist/shards.json");
  if (!fs.existsSync(p)) throw new Error("run tools/build-engine.mjs first");
  return JSON.parse(fs.readFileSync(p, "utf8"));
})();

const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = {
  Engine:   artifact(out, "src/Engine.sol", "Engine"),
  Sigil:    artifact(out, "src/Sigil.sol", "Sigil"),
  Renderer: artifact(out, "src/Renderer.sol", "Renderer"),
  Ipseity:  artifact(out, "src/Ipseity.sol", "Ipseity"),
  Registry: artifact(out, "test/mocks/ERC6551Registry.sol", "ERC6551Registry"),
  Account:  artifact(out, "src/IpseityAccount.sol", "IpseityAccount"),
  Grip:     artifact(out, "src/GripVault.sol", "GripVault")
};

if (!JSON_OUT) console.log("\n  \x1b[1mIPSEITY · the gas budget\x1b[0m");

const c = await Chain.open();
const tmp = await c.deploy(A.Registry.bytecode, "", "registry");
await c.vm.stateManager.putCode(
  createAddressFromString(REGISTRY),
  await c.vm.stateManager.getCode(createAddressFromString(tmp)));

const engine = await c.deploy(A.Engine.bytecode, "0".repeat(63) + "1", "Engine");
const sigil = await c.deploy(A.Sigil.bytecode, "", "Sigil");
const renderer = await c.deploy(
  A.Renderer.bytecode, encodeAddressArg(engine) + encodeAddressArg(sigil), "Renderer");
const nft = await c.deploy(A.Ipseity.bytecode,
  encodeAddressArg(renderer) +
  encodeAddressArg(await c.deploy(A.Account.bytecode, "", "acct")) +
  encodeAddressArg(await c.deploy(A.Grip.bytecode, "", "grip")) + (1).toString(16).padStart(64, "0") + (4096).toString(16).padStart(64, "0"), "Ipseity");

for (const s of plan.head) await c.exec(engine, "loadHead(bytes)", [s.data]);
for (const s of plan.body) await c.exec(engine, "loadBody(bytes)", [s.data]);
await c.exec(engine, "setInflatedSize(uint32)", [plan.inflatedSize]);
await c.exec(engine, "freeze()", []);
await c.exec(nft, "mint()", [], { value: 10n ** 16n });

/*  Gas is measured on the call itself, not on a transaction wrapping it,
    because eth_call is what a wallet actually issues — no 21,000 intrinsic
    cost, no calldata pricing, just the execution.                        */
async function measure(to, sig, args = []) {
  const res = await c.vm.evm.runCall({
    to: createAddressFromString(to),
    caller: createAddressFromString(c.from.toString()),
    origin: createAddressFromString(c.from.toString()),
    data: hexToBytes(enc(sig, args)), gasLimit: 3_000_000_000n, value: 0n,
    block: (await import("./evm.mjs")).BLOCK
  });
  if (res.execResult.exceptionError) {
    return { gas: null, bytes: 0, err: res.execResult.exceptionError.error };
  }
  return {
    gas: res.execResult.executionGasUsed,
    bytes: (res.execResult.returnValue || new Uint8Array()).length
  };
}

const READS = [
  ["tokenURI(uint256)",              [1],    "the pinned face — what every wallet calls"],
  ["tokenURIAt(uint256,uint256)",    [1, 0], "face 0, the instrument: the whole GUI"],
  ["tokenURIAt(uint256,uint256)",    [1, 1], "face 1, the still: one sigil"],
  ["tokenURIAt(uint256,uint256)",    [1, 2], "face 2, the quartet: four sigils"],
  ["tokenURIs(uint256)",             [1],    "ERC-7160: every face at once"],
  ["contractURI()",                  [],     "ERC-7572: collection metadata"],
  ["viewOf(uint256)",                [1],    "the state the engine reads"],
  ["ownerOf(uint256)",               [1],    "plain ERC-721"]
];

const rows = [];
for (const [sig, args, note] of READS) {
  const r = await measure(nft, sig, args);
  const label = sig.startsWith("tokenURIAt")
    ? `tokenURIAt(id,${args[1]})` : sig.replace(/\(.*/, "()");
  rows.push({ label, sig, note, ...r });
}

/*──────────────────── the site, route by route ────────────────────*/
/*  Premises serves the same document over ERC-5219 without the base64
    data: URI wrapper, and it serves a shopfront besides. Both belong in
    this table: a service page nobody's node will run is a shop with the
    lights off, and it fails the same silent way tokenURI does.         */
const routes = [];
{
  const poolAddr = await c.deploy(artifact(out, "src/Pool.sol", "Pool").bytecode,
    encodeAddressArg(nft) + "0".repeat(63) + "1" +
    encodeAddressArg(c.from.toString()) + "0".repeat(64), "Pool");
  await c.exec(nft, "setPool(address)", [poolAddr]);
  const leaseAddr = await c.deploy(artifact(out, "src/Lease.sol", "Lease").bytecode,
    encodeAddressArg(nft), "Lease");
  const M = (f, n) => artifact(out, `test/mocks/${f}`, n).bytecode;
  const encS = (t) => W(t.length) + Buffer.from(t).toString("hex").padEnd(64, "0");
  const wethAddr = await c.deploy(M("MockERC20.sol", "MockERC20"),
    W(0xa0) + W(0xe0) + W(18) + W(0) + W(0) + encS("Wrapped Ether") + encS("WETH"), "WETH");
  const usdcAddr = await c.deploy(M("MockERC20.sol", "MockERC20"),
    W(0xa0) + W(0xe0) + W(6) + W(0) + W(0) + encS("USD Coin") + encS("USDC"), "USDC");

  /* one market, so the directory is not empty */
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const someId = decUint(await c.read(nft, "totalSupply()"));
  await c.exec(poolAddr, "openMarket(uint256,address,address,uint16)",
    [someId, wethAddr, usdcAddr, 30]);

  const site = await deploySite(c, (f, n) => artifact(out, f, n),
    { hub: nft, pool: poolAddr, lease: leaseAddr, sigil });

  /*  A conversation with something in it, because an empty room is cheap
      and the page that renders one is not the page anybody will load. The
      rooms are read by the client rather than by the contract, so what is
      measured here is the shell — which is the point: the shell is what a
      node has to serve, and the archive is what a node already has.    */
  const parley = site.parley;
  await c.exec(parley, "speak(uint256,uint256,uint8,bytes)",
    [0, someId, 0, "0x" + Buffer.from("measuring the room").toString("hex")], { label: "speak" });
  await c.exec(parley, "found(uint256,string,bool)", [someId, "the workshop", true],
    { label: "found" });

  const { BLOCK } = await import("./evm.mjs");
  const hit = async (path) => {
    const r = await c.vm.evm.runCall({
      to: createAddressFromString(site.premises),
      caller: createAddressFromString(c.from.toString()),
      origin: createAddressFromString(c.from.toString()),
      data: hexToBytes(encRequest(path)), gasLimit: 3_000_000_000n, value: 0n, block: BLOCK
    });
    if (r.execResult.exceptionError) return { gas: null, bytes: 0, err: r.execResult.exceptionError.error };
    return { gas: r.execResult.executionGasUsed, bytes: r.execResult.returnValue.length };
  };
  for (const [path, label, note] of [
    [[], "/", "the collection, and what it offers"],
    [["token", "1"], "/token/1", "one token's counter, with live service status"],
    [["token", "1", "live"], "/token/1/live", "the instrument, on a real origin"],
    [["token", "1", "market"], "/token/1/market", "the swap card"],
    [["token", "1", "pool"], "/token/1/pool", "the holder's side: inventory, fee, bond, curve"],
    [["token", "1", "rent"], "/token/1/rent", "lease the instrument by the day"],
    [["token", "1", "vault"], "/token/1/vault", "the two hands, give, draw, verify"],
    [["token", "1", "services.json"], "/token/1/services.json", "the same, machine-readable"],
    [["open"], "/open", "every token open for business (24 at a time)"],
    [["services.json"], "/services.json", "the directory, machine-readable"],
    /*  Where the tokens talk. These are the cheapest pages on the site and
        that is the design rather than an accident: the conversation is in
        the logs, which a node already has indexed, so the contract renders
        a shell and the client does the reading. A chat that cost a node
        what a chart costs would be a chat nobody could host.           */
    [["chat"], "/chat", "the commons: one room, every token"],
    [["rooms"], "/rooms", "the groups a token has entered"],
    [["room", "1"], "/room/1", "one group"],
    [["dm", "1"], "/dm/1", "the room two tokens share"],
    [["terminal"], "/terminal", "every function, one line at a time"],
    [["gallery"], "/gallery", "the collection, wearing its stills"],
    [["launch"], "/launch", "the launchpad: token, hook, pool"],
    [["lock"], "/lock", "the vault: ten years on a slider"],
    [["projector"], "/projector", "the 4-D renderer, free for anyone"],
    [["seal"], "/seal", "the three seals"],
    [["keys"], "/keys", "session keys"],
    [["name"], "/name", "a name bound to a token"],
    [["swap"], "/swap", "the Uniswap card (venueless on this bare chain)"]
  ]) {
    routes.push({ label, note, ...(await hit(path)) });
  }
}

/*──────────────────── report ────────────────────*/
const over = rows.concat(routes).filter((r) => r.gas !== null && r.gas > FLOOR);

if (JSON_OUT) {
  console.log(JSON.stringify({
    floor: String(FLOOR),
    rows: rows.concat(routes).map((r) => ({ ...r, gas: r.gas === null ? null : String(r.gas) })),
    overFloor: over.map((r) => r.label)
  }, null, 2));
} else {
  head("what a read costs, and who will run it");
  console.log("      \x1b[2m" + "call".padEnd(24) + "gas".padStart(9) +
              "  returned".padStart(11) + "   runs on\x1b[0m");
  for (const r of rows) {
    if (r.gas === null) {
      console.log(`      ${r.label.padEnd(24)}${"reverted".padStart(9)}  ${r.err}`);
      continue;
    }
    const runs = CAPS.filter((k) => r.gas <= k.at);
    const colour = r.gas > FLOOR ? "\x1b[31m" : r.gas > CAPS[0].at ? "\x1b[33m" : "\x1b[32m";
    const where = runs.length === CAPS.length ? "everywhere"
                : runs.length === 0 ? "nowhere — over every cap measured"
                : "nodes at " + M(runs[0].at) + " and above";
    console.log(`      ${r.label.padEnd(24)}${colour}${M(r.gas).padStart(9)}\x1b[0m` +
                `  ${(r.bytes.toLocaleString() + " B").padStart(9)}   \x1b[2m${where}\x1b[0m`);
    console.log(`      \x1b[2m${" ".repeat(24)}${r.note}\x1b[0m`);
  }

  head("the site, over ERC-5219");
  for (const r of routes) {
    if (r.gas === null) { console.log(`      ${r.label.padEnd(24)}${"reverted".padStart(9)}  ${r.err}`); continue; }
    const runs = CAPS.filter((k) => r.gas <= k.at);
    const colour = r.gas > FLOOR ? "\x1b[31m" : r.gas > CAPS[0].at ? "\x1b[33m" : "\x1b[32m";
    console.log(`      ${r.label.padEnd(24)}${colour}${M(r.gas).padStart(9)}\x1b[0m` +
                `  ${(r.bytes.toLocaleString() + " B").padStart(9)}   \x1b[2m` +
                `${runs.length === CAPS.length ? "everywhere" : "nodes at " + M(runs[0].at) + " and above"}\x1b[0m`);
    console.log(`      \x1b[2m${" ".repeat(24)}${r.note}\x1b[0m`);
  }
  console.log(`      \x1b[2m/live is the same document tokenURI base64s, one step earlier —` +
              `\n      no data: URI wrapper, so it is the cheaper route to the identical` +
              `\n      page and the one a web3:// gateway takes.\x1b[0m`);

  head("verdict");
  if (over.length === 0) {
    console.log(`      \x1b[32mevery read is under ${M(FLOOR)}\x1b[0m — a default geth, ` +
                `erigon or reth\n      will serve all of them.`);
  } else {
    for (const r of over) {
      console.log(`      \x1b[31m${r.label} needs ${M(r.gas)}\x1b[0m, over the ` +
                  `${M(FLOOR)} default.`);
    }
    console.log(`\n      \x1b[2mA call over the cap does not fail politely. The node` +
                `\n      returns "out of gas" and the caller cannot tell that from a` +
                `\n      broken contract.\x1b[0m`);
  }
  console.log("");
}

process.exit(over.length === 0 ? 0 : 1);
