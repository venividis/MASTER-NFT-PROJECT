#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · look at the site

  Deploys the whole collection into an in-process EVM, opens a market with
  real inventory, lists the token for rent, then fetches each route over
  ERC-5219 and writes the bytes to dist/site/. Open them in a browser.

  What you get is exactly what a `web3://` client would be handed — these
  are not mock-ups, they are the contract's own output. The one thing that
  will not work from a file:// URL is the wallet, because a wallet needs an
  origin; served over web3:// or a gateway it connects.

    node tools/preview-site.mjs
    node tools/preview-site.mjs --serve 8080     and read them over http
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, artifact } from "./compile.mjs";
import * as evm from "./evm.mjs";
import { Chain, encodeAddressArg, decUint, decAddr } from "./evm.mjs";
import { deploySite, getter } from "./site.mjs";
import { createAddressFromString } from "@ethereumjs/util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist", "site");
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";
const w = (n) => BigInt(n).toString(16).padStart(64, "0");
const encS = (t) => w(t.length) + Buffer.from(t).toString("hex").padEnd(64, "0");

console.log("\n  \x1b[1mIPSEITY · the site, rendered\x1b[0m");

const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();

const tmpReg = await c.deploy(A("test/mocks/ERC6551Registry.sol", "ERC6551Registry").bytecode);
await c.vm.stateManager.putCode(createAddressFromString(REGISTRY),
  await c.vm.stateManager.getCode(createAddressFromString(tmpReg)));

const engine = await c.deploy(A("src/Engine.sol", "Engine").bytecode, "0".repeat(63) + "1");
const sigil = await c.deploy(A("src/Sigil.sol", "Sigil").bytecode);
const renderer = await c.deploy(A("src/Renderer.sol", "Renderer").bytecode,
  encodeAddressArg(engine) + encodeAddressArg(sigil));
const nft = await c.deploy(A("src/Ipseity.sol", "Ipseity").bytecode,
  encodeAddressArg(renderer) +
  encodeAddressArg(await c.deploy(A("src/IpseityAccount.sol", "IpseityAccount").bytecode)) +
  encodeAddressArg(await c.deploy(A("src/GripVault.sol", "GripVault").bytecode)) + (1).toString(16).padStart(64, "0") + (4096).toString(16).padStart(64, "0"));

/* the real document, so /live is the real instrument */
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "dist/shards.json"), "utf8"));
for (const sh of plan.head) await c.exec(engine, "loadHead(bytes)", [sh.data]);
for (const sh of plan.body) await c.exec(engine, "loadBody(bytes)", [sh.data]);
await c.exec(engine, "setInflatedSize(uint32)", [plan.inflatedSize]);
await c.exec(engine, "freeze()", []);

const pool = await c.deploy(A("src/Pool.sol", "Pool").bytecode,
  encodeAddressArg(nft) + w(10n ** 30n) + encodeAddressArg(c.from.toString()) + w(0), "Pool");
await c.exec(nft, "setPool(address)", [pool]);
const lease = await c.deploy(A("src/Lease.sol", "Lease").bytecode, encodeAddressArg(nft));

/*──── a market with something in it, and a token for rent ────*/
for (let i = 0; i < 3; i++) await c.exec(nft, "mint()", [], { value: 10n ** 16n });

const mk20 = async (name, sym, dec) => c.deploy(
  A("test/mocks/MockERC20.sol", "MockERC20").bytecode,
  w(0xa0) + w(0xe0) + w(dec) + w(0) + w(0) + encS(name) + encS(sym), sym);
const weth = await mk20("Wrapped Ether", "WETH", 18);
const usdc = await mk20("USD Coin", "USDC", 6);

await c.exec(weth, "mint(address,uint256)", [c.from.toString(), 10n ** 24n]);
await c.exec(usdc, "mint(address,uint256)", [c.from.toString(), 10n ** 18n]);
await c.exec(weth, "approve(address,uint256)", [pool, (1n << 255n)]);
await c.exec(usdc, "approve(address,uint256)", [pool, (1n << 255n)]);
await c.exec(pool, "openMarket(uint256,address,address,uint16)", [1, weth, usdc, 30]);
await c.exec(pool, "deposit(uint256,uint256,uint256)",
  [1, 40n * 10n ** 18n, 120_000n * 10n ** 6n]);

/*  A second and third market, so the picker has something to pick. They
    are on later tokens on purpose: the directory walks the pool's own list
    now, and a reader should be able to see that it finds them.          */
const dai = await mk20("Dai Stablecoin", "DAI", 18);
const wbtc = await mk20("Wrapped Bitcoin", "WBTC", 8);
for (const t of [2, 3]) {
  await c.exec(weth, "mint(address,uint256)", [c.from.toString(), 10n ** 22n]);
}
await c.exec(dai, "mint(address,uint256)", [c.from.toString(), 10n ** 24n]);
await c.exec(wbtc, "mint(address,uint256)", [c.from.toString(), 10n ** 12n]);
await c.exec(dai, "approve(address,uint256)", [pool, 1n << 255n]);
await c.exec(wbtc, "approve(address,uint256)", [pool, 1n << 255n]);
await c.exec(pool, "openMarket(uint256,address,address,uint16)", [2, weth, dai, 5]);
await c.exec(pool, "deposit(uint256,uint256,uint256)",
  [2, 12n * 10n ** 18n, 36_000n * 10n ** 18n]);
await c.exec(pool, "openMarket(uint256,address,address,uint16)", [3, wbtc, usdc, 100]);
await c.exec(pool, "deposit(uint256,uint256,uint256)",
  [3, 3n * 10n ** 8n, 200_000n * 10n ** 6n]);

await c.exec(nft, "setLeaseAgent(uint256,address)", [1, lease]);
await c.exec(lease, "list(uint256,uint128,uint32,uint32)", [1, 10n ** 16n, 1, 30]);

const site = await deploySite(c, A, { hub: nft, pool, lease, sigil });

/*  A conversation with something in it. The chat pages read the archive in
    the browser, so a preview opened off disk shows the shell and an empty
    room — the messages below are what makes the shell worth looking at
    once it is served somewhere a provider exists.                       */
await c.exec(site.parley, "speak(uint256,uint256,uint8,bytes)",
  [0, 1, 0, "0x" + Buffer.from("the first thing anybody said here").toString("hex")]);
await c.exec(site.parley, "speak(uint256,uint256,uint8,bytes)",
  [0, 2, 0, "0x" + Buffer.from("and the second").toString("hex")]);
await c.exec(site.parley, "found(uint256,string,bool)", [1, "the workshop", true]);
await c.exec(site.parley, "whisper(uint256,uint256,uint8,bytes)",
  [1, 2, 0, "0x" + Buffer.from("just between us").toString("hex")]);
const GET = getter(c, site.premises);

/*──── fetch and write ────*/
fs.mkdirSync(OUT, { recursive: true });
const pages = [
  [[], "index.html", "the collection"],
  /*  The console, at all three of its shapes. Every state of it is a real
      URL, so every state of it is a file here, and a walk into another
      token is a thing you can send somebody rather than a thing that only
      exists inside one tab's history.                                  */
  [["c"], "c.html", "the console, on the first token"],
  [["c", "1"], "c-1.html", "the console"],
  [["c", "1", "hand"], "c-1-hand.html", "the console, opened on HAND IT ON"],
  [["c", "1", "turn"], "c-1-turn.html", "the console, opened on TURN IT"],
  [["c", "1", "hold"], "c-1-hold.html", "the console, opened on PUT SOMETHING IN IT"],
  [["c", "1", "look"], "c-1-look.html", "the console, opened on LOOK AT ANOTHER ONE"],
  [["token", "1"], "token-1.html", "the counter"],
  [["token", "1", "market"], "token-1-market.html", "the swap card"],
  [["token", "1", "pool"], "token-1-pool.html", "the holder's side"],
  [["token", "1", "rent"], "token-1-rent.html", "renting"],
  [["token", "1", "vault"], "token-1-vault.html", "the two hands"],
  [["token", "1", "sigil.svg"], "token-1-sigil.svg", "the still"],
  [["open"], "open.html", "open markets"],
  [["terminal"], "terminal.html", "every function, one line at a time"],
  [["gallery"], "gallery.html", "the collection, wearing its stills"],
  [["launch"], "launch.html", "the launchpad: token, hook, pool"],
  [["lock"], "lock.html", "the vault: ten years on a slider"],
  [["projector"], "projector.html", "the 4-D renderer, free for anyone"],
  [["seal"], "seal.html", "the three seals"],
  [["keys"], "keys.html", "session keys"],
  [["name"], "name.html", "a name bound to a token"],
  [["swap"], "swap.html", "any pair, on the venue with the liquidity"],
  [["chat"], "chat.html", "the commons"],
  [["rooms"], "rooms.html", "the groups"],
  [["room", "1"], "room-1.html", "one group"],
  [["dm", "2"], "dm-2.html", "one token to another"],
  [["token", "1", "services.json"], "token-1-services.json", "machine-readable"],
  [["services.json"], "services.json", "the directory, machine-readable"]
];

console.log("");
for (const [route, file, what] of pages) {
  const r = await GET(route);
  /*  Written with root-relative links rewritten to the flat filenames, so
      the pages can be opened straight off disk. Nothing else is touched —
      what is inside every one of these is the contract's own bytes.     */
  let body = r.body;
  if (file.endsWith(".html")) {
    body = body
      .replace(/href="\/"/g, 'href="index.html"')
      .replace(/href="\/open"/g, 'href="open.html"')
      .replace(/href="\/terminal"/g, 'href="terminal.html"')
      .replace(/href="\/gallery\/(\d+)"/g, 'href="gallery.html"')
      .replace(/href="\/gallery"/g, 'href="gallery.html"')
      .replace(/href="\/launch"/g, 'href="launch.html"')
      .replace(/href="\/lock"/g, 'href="lock.html"')
      .replace(/href="\/name"/g, 'href="name.html"')
      .replace(/href="\/keys"/g, 'href="keys.html"')
      .replace(/href="\/seal"/g, 'href="seal.html"')
      .replace(/href="\/projector"/g, 'href="projector.html"')
      .replace(/href="\/swap"/g, 'href="swap.html"')
      .replace(/href="\/chat"/g, 'href="chat.html"')
      .replace(/href="\/rooms"/g, 'href="rooms.html"')
      .replace(/href="\/room\/(\d+)"/g, 'href="room-$1.html"')
      .replace(/href="\/dm\/(\d+)"/g, 'href="dm-$1.html"')
      .replace(/href="\/services\.json"/g, 'href="services.json"')
      .replace(/(href|src)="\/token\/(\d+)\/services\.json"/g, '$1="token-$2-services.json"')
      .replace(/(href|src)="\/token\/(\d+)\/sigil\.svg"/g, '$1="token-$2-sigil.svg"')
      .replace(/(href|src)="\/token\/(\d+)\/([a-z]+)"/g, '$1="token-$2-$3.html"')
      .replace(/(href|src)="\/token\/(\d+)"/g, '$1="token-$2.html"');
  }
  fs.writeFileSync(path.join(OUT, file), body);
  console.log(`  ${String(r.status)}  ${file.padEnd(28)} ${String(body.length).padStart(7)} B` +
              `  \x1b[2m${what}\x1b[0m`);
}

console.log(`\n  wrote ${pages.length} files to dist/site/`);
console.log("  \x1b[2mopen dist/site/chat.html — the archive needs a provider, so the");
console.log("  conversation loads over web3:// or a gateway, not off file://\x1b[0m\n");

const serveAt = process.argv.indexOf("--serve");
if (serveAt > 0) {
  const port = Number(process.argv[serveAt + 1] || 8080);
  const http = await import("node:http");
  const types = { ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml" };
  http.createServer((req, res) => {
    const name = (req.url === "/" ? "/index.html" : req.url).split("?")[0];
    const f = path.join(OUT, path.basename(name));
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end("no such section"); }
    res.writeHead(200, { "Content-Type": types[path.extname(f)] || "text/plain" });
    res.end(fs.readFileSync(f));
  }).listen(port, () => console.log(`  serving dist/site on http://localhost:${port}\n`));
}
