#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · each token's shopfront, and the rent it collects

  The front door was already verified by `verify-premises.mjs`, against the
  one claim that makes an index safe to have: it never serves the artwork.
  This is the other half — the part where a stranger can actually *use* a
  token, and where the token gets paid.

  Three things are under test, in order of how badly each would fail.

  ── 1. an injected script would be same-origin with a wallet ──

  A market's pair is two ERC-20 addresses the token holder chose, and
  `symbol()` on them returns a string that holder wrote. Those strings go on
  a page. That page is served by the same contract, on the same origin, as
  `/token/<id>/live` — which exists precisely so wallet extensions *will*
  inject into it.

  So a `<script>` surviving into a market page is not a cosmetic bug. It is
  script execution next to a connected wallet. The suite deploys a token
  whose symbol is a script tag and asserts it comes out inert.

  ── 2. a page that reverts is a shop with the shutters down ──

  Five more hostile tokens: one that refuses to answer, one that answers in
  `bytes32` like MKR, one that answers with eight kilobytes, one that
  declares a length longer than the payload it sent, and one that claims 200
  decimals so `10 ** decimals` overflows. Each is put into a real market and
  every route is fetched. A page that dies on one row is a directory nobody
  can read.

  ── 3. the rent has to add up ──

  `Lease` holds ether belonging to two different parties at once, and the
  interesting case is the lease cut short: the token is sold mid-term, the
  ERC-4907 user is cleared, and what was paid has to split by elapsed time
  without either side being able to take the other's part. The invariant
  checked after every operation is that the contract's balance covers
  everything it owes.

    node tools/verify-site.mjs
───────────────────────────────────────────────────────────────────────────*/
import { compile, artifact } from "./compile.mjs";
import * as evm from "./evm.mjs";
import { Chain, encodeAddressArg, decUint, decAddr, decBool, decString, warp } from "./evm.mjs";
import { deploySite, getter, BANDS, assertTiles } from "./site.mjs";
import { createAddressFromString } from "@ethereumjs/util";
import { keccak256 } from "ethereum-cryptography/keccak.js";

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${n}`);
  if (!c && d !== undefined) console.log(`      \x1b[31m${d}\x1b[0m`);
};
const eq = (n, g, w) => ok(n, String(g) === String(w), `got ${g}\n      want ${w}`);
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);
const w = (n) => BigInt(n).toString(16).padStart(64, "0");
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";
const WAD = 10n ** 18n;

process.on("unhandledRejection", (e) => console.log("  UNHANDLED:", String(e && e.stack || e).slice(0, 300)));
const refuses = async (name, fn, want) => {
  try { await fn(); ok(name, false, "it went through"); }
  catch (e) { ok(name, !want || String(e.message).includes(want), e.message.slice(0, 120)); }
};

console.log("\n  \x1b[1mIPSEITY · the shopfront\x1b[0m");

/*──────────────── deploy ────────────────*/
head("a collection, a market, a lease and a site");
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

/* a small real document, so tokenURI returns something whole */
const { gzipSync } = await import("node:zlib");
const doc = Buffer.from("<!doctype html><title>x</title><body>the instrument</body>", "utf8");
const packed = gzipSync(doc, { level: 9 });
const loadArg = (b) =>
  w(0x20) + w(b.length) + b.toString("hex").padEnd(Math.ceil(b.length / 32) * 64, "0");
await c.send({ to: engine, data: evm.sel("loadHead(bytes)") + loadArg(packed) });
await c.send({ to: engine, data: evm.sel("loadBody(bytes)") + loadArg(packed) });
await c.exec(engine, "setInflatedSize(uint32)", [doc.length]);

const pool = await c.deploy(A("src/Pool.sol", "Pool").bytecode,
  encodeAddressArg(nft) + w(10n ** 30n) + encodeAddressArg(c.from.toString()) + w(0), "Pool");
await c.exec(nft, "setPool(address)", [pool]);
const lease = await c.deploy(A("src/Lease.sol", "Lease").bytecode, encodeAddressArg(nft), "Lease");

/*──────────────── a Uniswap v3 deployment to point the site at ────────────────

  Every signature and return shape is the real one, and both routers record
  the struct they decoded rather than merely acting on it — because the two
  routers' structs differ by one field, the wrong shape does not revert, and
  a mock that just performed the trade would pass either way.             */
/* constructor(string n, string s, uint8 d, uint256 feeBps, bool silent) */
const encS = (t) => w(t.length) + Buffer.from(t).toString("hex").padEnd(64, "0");
const weth = await c.deploy(A("test/mocks/MockERC20.sol", "MockERC20").bytecode,
  w(0xa0) + w(0xe0) + w(18) + w(0) + w(0) + encS("Wrapped Ether") + encS("WETH"), "WETH");
const usdc = await c.deploy(A("test/mocks/MockERC20.sol", "MockERC20").bytecode,
  w(0xa0) + w(0xe0) + w(6) + w(0) + w(0) + encS("USD Coin") + encS("USDC"), "USDC");

const uniFactory = await c.deploy(A("test/mocks/UniV3.sol", "MockV3Factory").bytecode, "", "v3Factory");
const uniBook = await c.deploy(A("test/mocks/UniV3.sol", "MockBook").bytecode, "", "book");
const uniQuoter = await c.deploy(A("test/mocks/UniV3.sol", "MockQuoter").bytecode,
  encodeAddressArg(uniBook), "QuoterV2");
const uniRouterV3 = await c.deploy(A("test/mocks/UniV3.sol", "MockRouterV3").bytecode,
  encodeAddressArg(uniBook), "SwapRouter");
const uniRouter02 = await c.deploy(A("test/mocks/UniV3.sol", "MockRouter02").bytecode,
  encodeAddressArg(uniBook), "SwapRouter02");

/*  Two tiers with pools, at different depths, so "quote every tier and take
    the best" has something to get wrong. The 0.05% pool is shallow and
    prices worse; the 0.3% pool is deep and prices better.                */
/*  A pool prices token1 per token0, and token0 is whichever address sorts
    first — which for two freshly deployed mocks is whichever this run
    happened to produce. Three thousand USDC per WETH is tick -196256 when
    WETH is token0 and +196256 when it is not, and hardcoding one of them
    would give the pool a price that is the reciprocal of the one the test
    means half the time.                                                  */
const WETH_FIRST = weth.toLowerCase() < usdc.toLowerCase();
const POOL_TICK = WETH_FIRST ? -196256n : 196256n;
await c.exec(uniFactory, "make(address,address,uint24,uint160,int24,uint128)",
  [weth, usdc, 500n, 1n << 96n, POOL_TICK, 10n ** 6n]);
await c.exec(uniFactory, "make(address,address,uint24,uint160,int24,uint128)",
  [weth, usdc, 3000n, 1n << 96n, POOL_TICK, 9n * 10n ** 18n]);
/* 1 WETH buys 2900 USDC through the shallow pool, 2995 through the deep one */
await c.exec(uniBook, "set(address,address,uint24,uint256)", [weth, usdc, 500n, 2900n * 10n ** 6n]);
await c.exec(uniBook, "set(address,address,uint24,uint256)", [weth, usdc, 3000n, 2995n * 10n ** 6n]);
await c.exec(uniBook, "set(address,address,uint24,uint256)",
  [usdc, weth, 3000n, 333_000_000_000n]);
/* the routers pay out of their own inventory */
await c.exec(usdc, "mint(address,uint256)", [uniRouterV3, 10n ** 15n]);
await c.exec(usdc, "mint(address,uint256)", [uniRouter02, 10n ** 15n]);
await c.exec(weth, "mint(address,uint256)", [uniRouterV3, 10n ** 24n]);

const uniPositions = await c.deploy(A("test/mocks/UniV3.sol", "MockPositions").bytecode,
  "", "NonfungiblePositionManager");

/*  A v4 PoolManager that records the PoolKey it DECODED, field by field —
    the same discipline as the routers, for the same reason: `initialize`
    is six flat words from a client with no ABI coder, and a manager that
    merely accepted the call would pass a client that shifted every field
    by a word.                                                            */
const uniManager = await c.deploy(A("test/mocks/UniV3.sol", "MockManager").bytecode,
  "", "PoolManager");

const UNI = {
  name: "the test chain", factory: uniFactory, quoter: uniQuoter,
  router: uniRouterV3, routerKind: 0, positions: uniPositions,
  wrapped: weth,
  /*  No governor: Uniswap's governance lives on Ethereum mainnet and
      nowhere else, so "this chain has no governor" is the ordinary case
      and the only one this site still describes.                       */
  governor: "0x0000000000000000000000000000000000000000",
  govToken: "0x0000000000000000000000000000000000000000",
  poolManager: uniManager
};

const site = await deploySite(c, A, { hub: nft, pool, lease, sigil, uniswap: UNI });
const GET = getter(c, site.premises);
ok("the site is deployed", (await c.codeSize(site.premises)) > 0);

/* the holder is the deployer; a renter and a buyer are other people */
const renter = await c.as("0x" + "22".repeat(32));
const buyer = await c.as("0x" + "33".repeat(32));

for (let i = 0; i < 3; i++) await c.exec(nft, "mint()", [], { value: 10n ** 16n });
ok("three tokens issued", true);

/*════════════════ 1 · the escaping ════════════════*/
head("a token whose symbol is a script tag");

const nasty = await c.deploy(A("test/mocks/Nasty.sol", "ScriptToken").bytecode, "", "ScriptToken");

await c.exec(pool, "openMarket(uint256,address,address,uint16)", [1, nasty, weth, 30]);

const mk = await GET(["token", "1", "market"]);
eq("the market page still answers 200", mk.status, 200);
ok("the raw script tag is gone", !mk.body.includes("<script>alert"));
ok("it survives as inert text", mk.body.includes("&lt;script&gt;alert"));
/*  The app ships a JSON config block and two script blocks, so counting
    tags proves nothing on its own. What has to be true is that every
    <script> the page opens is one the contract wrote: tags balance, and
    nothing attacker-supplied contributed a bracket.                     */
ok("every script tag the page opens is closed by one it wrote",
   (mk.body.match(/<script/g) || []).length === (mk.body.match(/<\/script>/g) || []).length,
   `${(mk.body.match(/<script/g) || []).length} open, ` +
   `${(mk.body.match(/<\/script>/g) || []).length} closed`);
ok("the hostile symbol contributed no bracket to the document",
   !mk.body.includes("<script>alert") && !mk.body.includes("</script>alert"));

/* the attribute context: name() is `" onerror="alert(1)` */
ok("a quote-breaking name cannot escape an attribute",
   !/ onerror=/.test(mk.body.replace(/&quot;/g, "")) || !mk.body.includes('" onerror="'));

const tok = await GET(["token", "1"]);
eq("the token page too", tok.status, 200);
ok("no raw script there either", !tok.body.includes("<script>alert"));

/*  The counter page must stay cheap. It used to embed the whole instrument
    as a data: URI and cost 21M gas of eth_call — the most expensive page on
    the site, to show a preview a viewer cannot use, because a data: frame
    has an opaque origin and no wallet injects into one.                  */
ok("the counter page does not inline the whole instrument",
   !tok.body.includes("data:application/json;base64,"),
   "a data: URI is embedded in the page again");
ok("it points at the still as its own request",
   tok.body.includes('src="/token/1/sigil.svg"'));
const svgR = await GET(["token", "1", "sigil.svg"]);
eq("which is served as an image", svgR.headers[0][1], "image/svg+xml");
ok("and is an SVG", svgR.body.startsWith("<svg"));

const js = await GET(["token", "1", "services.json"]);
eq("and the manifest", js.status, 200);
ok("no unescaped angle bracket inside the JSON strings", !js.body.includes("<script>"));
let parsed = null;
try { parsed = JSON.parse(js.body); ok("the manifest is valid JSON", true); }
catch (e) { ok("the manifest is valid JSON", false, e.message); }
if (parsed) {
  const trade = parsed.services.find((s) => s.id === "trade");
  /*  The parsed value may legitimately contain `<` — that is what \u003c
      decodes to, and a JSON consumer wants the real string. The property
      that matters is about the BYTES: a document containing a literal
      `</script>` inside a string ends a script block when the JSON is
      pasted into HTML, which is where JSON usually ends up.            */
  ok("the raw bytes escape the angle brackets", js.body.includes("\\u003c"));
  ok("and contain no literal < at all", !js.body.includes("<"));
  ok("while a consumer still gets the real string",
     trade && typeof trade.base.symbol === "string" && trade.base.symbol.includes("<script>"));
  ok("truncated to a label length a page can survive",
     trade && trade.base.symbol.length <= 32, `${trade && trade.base.symbol.length} chars`);
  console.log(`      symbol came through as: ${JSON.stringify(trade && trade.base.symbol)}`);
}

/*════════════════ 2 · tokens that answer badly ════════════════*/
head("five more ways an ERC-20 can refuse to behave");

const kinds = [
  ["SilentToken", "reverts when asked"],
  ["Bytes32Token", "answers in bytes32, like MKR"],
  ["HugeToken", "answers with eight kilobytes"],
  ["LiarToken", "declares a length longer than it sent"],
  ["MadDecimalsToken", "claims 200 decimals"],

  ["GasBurnerToken", "burns every drop of gas it is given"],
  ["OffsetBombToken", "points its ABI offset 33 MB past the buffer", w(0x02000000)],
  ["OffsetBombToken", "and the same at the top of the old bound", w(0xfffffffe)]
];
/*  One fresh token per hostile pair. The first version of this loop cycled
    two ids, so `openMarket` reverted MarketAlreadyOpen from the second kind
    onward and six of the eight cases never reached a page at all — they
    passed because nothing ran, which is the failure mode this whole suite
    exists to catch.                                                      */
let openFail = "";
for (const [name, what, arg] of kinds) {
  const bad = await c.deploy(A("test/mocks/Nasty.sol", name).bytecode, arg || "", name);
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const id = Number(decUint(await c.read(nft, "totalSupply()")));

  let opened = true;
  try {
    await c.exec(pool, "openMarket(uint256,address,address,uint16)", [id, bad, weth, 30]);
  } catch (e) { opened = false; openFail = e.message.slice(0, 90); }

  const p = await GET(["token", String(id), "market"]);
  const gasUsed = c.lastGas;
  const j = await GET(["token", String(id), "services.json"]);
  let jsonOk = true;
  try { JSON.parse(j.body); } catch { jsonOk = false; }

  /*  The gas bound is the assertion that matters, not the status. These
      pages are read with a three-billion-gas ceiling so a route can be
      measured rather than merely survive — and an offset bomb "succeeds"
      at that ceiling while costing 2,151M, which no node on earth will
      serve. A suite that only checks for a revert walks straight past it. */
  ok(`${name} — ${what}`,
     opened && p.status === 200 && j.status === 200 && jsonOk && gasUsed < 10_000_000n,
     opened
       ? `market ${p.status}, json ${j.status}, parses ${jsonOk}, ` +
         `gas ${(Number(gasUsed) / 1e6).toFixed(2)}M`
       : `the market never opened, so the page never read it: ${openFail}`);
}

head("and the directory, with all of them in it");
const dir = await GET(["open"]);
eq("200", dir.status, 200);
ok("it renders", dir.body.includes("open for business"));
ok("no raw script", !dir.body.includes("<script>alert"));
ok("it says how much of the real list it showed",
   /Showing \d+ of \d+ open market/.test(dir.body),
   "the directory no longer states its window");
ok("and warns that swap-and-pop can move an entry under a reader",
   /Closing a market moves the last entry/.test(dir.body));
console.log(`      ${dir.body.length} bytes`);

/*════════════════ 3 · every route answers ════════════════*/
head("every route");
const routes = [
  [[], "text/html", "the index"],
  [["open"], "text/html", "/open"],
  [["open", "0"], "text/html", "/open/0"],
  [["services.json"], "application/json", "/services.json"],
  [["services.json", "0"], "application/json", "/services.json/0"],
  [["token", "1"], "text/html", "/token/1"],
  [["token", "1", "faces"], "text/html", "/token/1/faces"],
  [["token", "1", "market"], "text/html", "/token/1/market"],
  [["token", "1", "pool"], "text/html", "/token/1/pool"],
  [["chat"], "text/html", "/chat"],
  [["terminal"], "text/html", "/terminal"],
  [["gallery"], "text/html", "/gallery"],
  [["gallery", "0"], "text/html", "/gallery/0"],
  [["launch"], "text/html", "/launch"],
  [["lock"], "text/html", "/lock"],
  [["door"], "text/html", "/door"],
  [["projector"], "text/html", "/projector"],
  [["seal"], "text/html", "/seal"],
  [["keys"], "text/html", "/keys"],
  [["name"], "text/html", "/name"],
  [["estate"], "text/html", "/estate"],
  [["hook"], "text/html", "/hook"],
  [["swap"], "text/html", "/swap"],
  [["rooms"], "text/html", "/rooms"],
  [["dm", "1"], "text/html", "/dm/1"],
  [["token", "1", "rent"], "text/html", "/token/1/rent"],
  [["token", "1", "vault"], "text/html", "/token/1/vault"],
  [["token", "1", "services.json"], "application/json", "/token/1/services.json"],
  [["token", "1", "raw"], "text/plain", "/token/1/raw"],
  [["token", "1", "live"], "text/html", "/token/1/live"],
  [["token", "1", "face", "1"], "text/plain", "/token/1/face/1"],
  [["token", "1", "sigil.svg"], "image/svg+xml", "/token/1/sigil.svg"],
  [["c", "1"], "text/html", "/c/1"],
  [["k", "1", "0x00000000000000000000000000000000000000cd"], "text/html", "/k/1/<key>"]
];
for (const [path, type, label] of routes) {
  const r = await GET(path);
  ok(`${label.padEnd(26)} ${String(r.body.length).padStart(7)} bytes`,
     r.status === 200 && r.headers[0][1].startsWith(type),
     `status ${r.status}, type ${r.headers[0][1]}`);
}

/*════════════════ ERC-6860: how a client finds any of this ════════════════*/
head("the four bytes that make web3:// resolve at all");
/*  ERC-6944 does not ask for a word that starts with "5219"; it asks for
    exactly this word. Checking the first four bytes would pass a return
    with anything at all in the other twenty-eight, and a strict client
    comparing the whole word would then read the site as an unsupported
    mode — which looks like the contract not existing.                  */
const mode = await c.read(site.premises, "resolveMode()");
eq("resolveMode() returns the exact word ERC-6944 specifies",
   String(mode).toLowerCase(),
   "0x3532313900000000000000000000000000000000000000000000000000000000");
console.log("      without it ERC-6860 falls back to auto mode, where web3://<addr>/");
console.log("      is an empty call to a contract with no fallback, and /token/1 is a");
console.log("      call to a method named `token` — both revert, and the site is");
console.log("      reachable only from a gateway that hard-codes 5219, i.e. a server");

head("one resource, one URL");
for (const [name, path] of [
  ["a trailing slash is the same page", ["token", "1", ""]],
  ["and on a collection route too", ["open", ""]]
]) {
  const r = await GET(path);
  ok(name, r.status === 200, `got ${r.status}`);
}
for (const [name, path] of [
  ["junk after a leaf is not the leaf", ["token", "1", "market", "anything"]],
  ["nor after the token", ["token", "1", "extra", "more", "still"]],
  ["a leading zero is not a second address for token 1", ["token", "0000000001"]],
  ["nor for a page number", ["open", "00"]],
  ["face takes exactly one index", ["token", "1", "face", "1", "2"]]
]) {
  const r = await GET(path);
  ok(name, r.status === 404, `got ${r.status}`);
}
console.log("      every response carries a Cache-Control, so a page reachable at");
console.log("      unboundedly many URLs is a gateway cache waiting to be flooded");

head("and nonsense is still a 404");
for (const [name, path] of [
  [["token", "1", "nope"], "an undefined leaf"],
  [["token", "1", "face"], "face with no index"],
  [["token", "1", "face", "x"], "face with a non-numeric index"],
  [["open", "x"], "a page that is not a number"],
  [["services.json", "x"], "a json page that is not a number"]
].map(([p, n]) => [n, p])) {
  const r = await GET(path);
  ok(name, r.status === 404, `got ${r.status}`);
}

/*════════════════ 4 · the manifest is actionable ════════════════*/

/*════════════ the manifest describes the whole site, not half of it ════════════

  The manifest's entire argument is that a program should be able to find out
  what this site offers without a hosted API. It listed the per-token services
  and said nothing about the eight collection-wide routes or the addresses they
  send to — so a program reading it would have concluded that half the site did
  not exist. An index that is silently partial is worse than one that is
  obviously small.
*/
head("and it describes the collection-wide surface too");
{
  const m = JSON.parse((await GET(["services.json"])).body);

  /*════════════ the partition, from both ends ════════════

    The edition is one run of 4096 split into five contiguous bands, one
    per chain, fixed in each hub's constructor. Nothing crosses and nothing
    is trusted: two chains cannot issue the same number because neither can
    issue outside its own band.

    That promise is written down twice — in `tools/site.mjs`, which is what
    the deploy reads, and in `PageManifest.EDITION`, which is what the
    world reads. Two copies of one fact is a bug waiting for a redeploy, so
    they are checked against each other here, and against what this hub
    actually enforces.                                                  */
  ok("the manifest publishes the whole edition, not just this chain's band",
     Array.isArray(m.edition) && m.edition.length === Object.keys(BANDS).length,
     JSON.stringify(m.edition || null).slice(0, 120));
  {
    const pub = {};
    for (const e of m.edition || []) pub[e.chainId] = { name: e.name, first: e.first, last: e.last };
    eq("and it says exactly what the deploy table says",
       JSON.stringify(pub, Object.keys(pub).sort()),
       JSON.stringify(BANDS, Object.keys(pub).sort()));
    ok("which tiles the edition exactly once, checked by the same guard the deploy uses",
       assertTiles(pub));
    /*  The published map is only worth anything if this hub is actually
        inside the band the map assigns it. A rehearsal takes the whole
        range, so it is checked against that instead.                   */
    const mine = m.band;
    ok("and this hub issues inside the range it publishes for itself",
       mine.first >= 1 && mine.last <= mine.collection && mine.first <= mine.last,
       JSON.stringify(mine));
  }

  ok("every flat route the site answers is in the manifest",
     ["/", "/door", "/terminal", "/chat", "/lock", "/projector", "/name",
      "/keys", "/seal", "/estate"].every((r) => (m.routes || []).some((x) => x.path === r)),
     JSON.stringify((m.routes || []).map((r) => r.path)));
  ok("the routes are listed", Array.isArray(m.routes) && m.routes.length >= 11,
     JSON.stringify(m.routes || null).slice(0, 120));
  const paths = (m.routes || []).map((r) => r.path);
  for (const p of ["/", "/door", "/terminal", "/chat", "/rooms", "/room/<n>", "/dm/<id>",
                   "/gallery", "/launch", "/lock", "/projector", "/seal", "/keys", "/name", "/hook/<address>", "/swap", "/open",
                   "/services.json"]) {
    ok(`  ${p} is discoverable`, paths.includes(p), paths.join(" "));
  }

  /*  Every path the manifest advertises must actually answer. A directory
      that names a route the router does not have is the same defect as one
      that omits a route the router does have. The two that take a number
      are asked for a real one rather than for the placeholder.           */
  for (const r of m.routes || []) {
    if (r.path === "/services.json") continue;
    const seg = r.path === "/room/<n>" ? ["room", "1"]
              : r.path === "/dm/<id>" ? ["dm", "1"]
              : r.path === "/hook/<address>" ? ["hook", weth.toLowerCase()]
              : r.path === "/c/<id>" ? ["c", "1"]
              : r.path === "/k/<id>/<key>"
                  ? ["k", "1", "0x00000000000000000000000000000000000000cd"]
              : r.path.split("/").filter(Boolean);
    const got = await GET(seg);
    ok(`  and ${r.path} actually answers`, got.status === 200, `status ${got.status}`);
  }

  /*  The manifest is not a convenience for a browser; it is the instruction
      manual for replacing one. A program holding the contract, the topic
      and the walk can read the whole archive with `eth_getLogs` and never
      load a page of this site.                                           */
  ok("the place the tokens talk is described rather than left out", m.parley !== undefined);
  eq("with the contract the site was deployed against",
     String(m.parley.at).toLowerCase(), site.parley.toLowerCase());
  ok("and the topic a program filters on",
     /^0x[0-9a-f]{64}$/.test(String(m.parley.said)), String(m.parley.said));
  eq("which is the topic the contract itself derives",
     String(m.parley.said).toLowerCase(),
     "0x" + Buffer.from(keccak256(Buffer.from(
       "Said(uint256,uint256,uint64,uint64,uint64,uint8,bytes)"))).toString("hex"));
  ok("and how to walk backwards through it", /block of the one before/.test(m.parley.walk));

  ok("the venue is described rather than left out", m.venue !== undefined);
  eq("with the factory the site was deployed against",
     String(m.venue.factory).toLowerCase(), uniFactory.toLowerCase());
  eq("and the router", String(m.venue.router).toLowerCase(), uniRouterV3.toLowerCase());
  /*  The field that decides whether a program builds eight words or seven.
      Without it a caller reading this manifest has an address and no way to
      know which of the two incompatible structs it takes.               */
  eq("and the router's calldata shape, which is the part a program needs",
     m.venue.routerKind, 0);
  ok("and whether there is a venue there at all", m.venue.present === true);
  console.log("      a program can now find /swap and know the router takes eight " +
              "words with a deadline at index 4");
}

head("the manifest tells a program how to call, not just what exists");
const m1 = JSON.parse((await GET(["token", "1", "services.json"])).body);
eq("it declares its schema", m1.schema, "ipseity.services/2");
ok("it names the chain", typeof m1.chainId === "number");
ok("it lists six services — the session surface joined in /2",
   m1.services.length === 6, `got ${m1.services.map((s) => s.id).join(",")}`);

const sel4 = (sig) =>
  "0x" + Buffer.from(keccak256(Buffer.from(sig, "utf8"))).toString("hex").slice(0, 8);
let selOk = 0, selBad = [];
for (const s of m1.services) {
  for (const k of ["read", "quote", "invoke", "also", "grant", "act", "check", "revoke"]) {
    const call = s[k];
    if (!call || !call.sig) continue;
    if (sel4(call.sig) === call.selector) selOk++;
    else selBad.push(`${s.id}.${k}: ${call.sig} -> ${call.selector} (want ${sel4(call.sig)})`);
  }
  /*  The rented powers ride inside rent.use — /2's sharpest addition:
      the manifest that sells the lease now teaches its use.            */
  for (const k of Object.keys(s.use || {})) {
    const call = s.use[k];
    if (!call || !call.sig) continue;
    if (sel4(call.sig) === call.selector) selOk++;
    else selBad.push(`${s.id}.use.${k}: ${call.sig} -> ${call.selector}`);
  }
}
ok(`every selector matches keccak of its signature (${selOk} checked)`,
   selBad.length === 0, selBad.join("\n      "));
console.log("      a caller holding these needs an RPC endpoint and nothing else");

ok("the grip is named as one-way",
   m1.services.find((s) => s.id === "give").oneWay === true);
ok("rent says who is paid",
   m1.services.find((s) => s.id === "rent").paidTo === "token");
ok("draw says nobody is paid",
   m1.services.find((s) => s.id === "draw").paidTo === null);

const rentSvc = m1.services.find((s) => s.id === "rent");
ok("rent teaches the powers it grants — commit and setTrait, on the hub",
   rentSvc.use && rentSvc.use.commit && rentSvc.use.setTrait &&
   rentSvc.use.commit.sig === "commit(uint256,uint256)",
   JSON.stringify(rentSvc.use || null));
const sessSvc = m1.services.find((s) => s.id === "session");
ok("the session surface is discoverable: grant, act, check, revoke, and its door",
   sessSvc && sessSvc.grant && sessSvc.act && sessSvc.check && sessSvc.revoke &&
   /^\/k\/1\//.test(sessSvc.door),
   JSON.stringify(sessSvc || null));

const mIdx = JSON.parse((await GET(["services.json"])).body);
ok("the index sells the mint with its door, not only its price",
   mIdx.mint && sel4(mIdx.mint.invoke.sig) === mIdx.mint.invoke.selector &&
   /exactly/.test(mIdx.mint.value), JSON.stringify(mIdx.mint || null));
ok("the terminal desk is one read away for an RPC-only agent",
   /^0x[0-9a-f]{40}$/.test(mIdx.deskTerm || ""), String(mIdx.deskTerm));
ok("parley teaches speak, not only the walk",
   mIdx.parley.invoke && sel4(mIdx.parley.invoke.sig) === mIdx.parley.invoke.selector,
   JSON.stringify(mIdx.parley.invoke || null));
ok("the routes name the console and the key's door",
   mIdx.routes.some((r) => r.path === "/c/<id>") &&
   mIdx.routes.some((r) => r.path === "/k/<id>/<key>"));

/*════════════ /k — the granted key's own door ════════════*/
head("/k — the one surface where the actor is not the holder");
{
  const KEY = "0x00000000000000000000000000000000000000cd";
  const page = await GET(["k", "1", KEY]);
  ok("it serves, and says whose door it is",
     page.status === 200 && /a key to #1/.test(page.body),
     `status ${page.status}`);
  ok("an unembodied account is a stated fact, never a zero",
     /not yet embodied/.test(page.body));
  const mixed = await GET(["k", "1", "0x00000000000000000000000000000000000000CD"]);
  ok("a checksummed spelling is sent to the one URL", mixed.status === 301,
     `status ${mixed.status}`);
  const bad = await GET(["k", "999999", KEY]);
  ok("a token that does not exist has no keys to show", bad.status === 404,
     `status ${bad.status}`);
  const kCfg = /<script type="application\/json" id="KEY">([\s\S]*?)<\/script>/.exec(page.body);
  const kc = JSON.parse(kCfg[1]);
  ok("its selectors are computed on chain, and they are the account's",
     sel4("executeAsSession(address,uint256,bytes)") === kc.sel.exec &&
     sel4("sessionAllows(address,address,bytes4)") === kc.sel.allows &&
     sel4("revokeSession(address)") === kc.sel.revoke,
     JSON.stringify(kc.sel));
}

/*════════════ 5 · the calldata, and where the browser gets it ════════════*/
head("the app is handed selectors a contract computed");

const cfgOf = (body) => {
  const m = body.match(/<script type="application\/json" id="D">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
};

const cfg = cfgOf(mk.body);
ok("the swap page carries a config block", cfg !== null);
if (cfg) {
  ok("naming the pool, the market and the chain",
     cfg.pool && cfg.id === 1 && typeof cfg.chain === "number");
  ok("with both sides' decimals, so the browser never guesses",
     typeof cfg.base.d === "number" && typeof cfg.quote.d === "number");

  const want = {
    quote: "quote(uint256,bool,uint256)",
    swap: "swap(uint256,bool,uint256,uint256,address,uint256)",
    approve: "approve(address,uint256)",
    allowance: "allowance(address,address)",
    balanceOf: "balanceOf(address)",
    deposit: "deposit(uint256,uint256,uint256)",
    withdraw: "withdraw(uint256,uint256,uint256,address)",
    setFee: "setFee(uint256,uint16)",
    bond: "bond(uint256,uint64)",
    syncCurve: "syncCurve(uint256)",
    openMarket: "openMarket(uint256,address,address,uint16)",
    closeMarket: "closeMarket(uint256)"
  };
  const bad = [];
  for (const [k, sig] of Object.entries(want)) {
    if (cfg.sel[k] !== sel4(sig)) bad.push(`${k}: ${cfg.sel[k]} != ${sel4(sig)} (${sig})`);
  }
  ok(`every pool selector matches keccak of its signature (${Object.keys(want).length})`,
     bad.length === 0, bad.join("\n      "));

  const lwant = {
    rent: "rent(uint256,uint32,uint128)",
    list: "list(uint256,uint128,uint32,uint32)",
    delist: "delist(uint256)",
    collect: "collect(uint256,address)",
    endLease: "endLease(uint256)",
    settle: "settle(uint256)",
    claim: "claim()",
    agent: "setLeaseAgent(uint256,address)"
  };
  const lbad = [];
  for (const [k, sig] of Object.entries(lwant)) {
    if (cfg.lease.sel[k] !== sel4(sig)) lbad.push(`${k}: ${cfg.lease.sel[k]} != ${sel4(sig)}`);
  }
  ok(`and every lease selector too (${Object.keys(lwant).length})`,
     lbad.length === 0, lbad.join("\n      "));
  console.log("      the browser never computes a selector, so it needs no keccak");
}

/*  The config is JSON inside a <script> block, which is the one place a
    symbol containing `</script>` would end the document early. That is
    exactly why jsonEsc escapes `<` and `>` and not only the two characters
    JSON requires.                                                        */
ok("a symbol cannot end the config block it appears in",
   cfg !== null && typeof cfg.base.s === "string",
   "the block did not parse, so something in it terminated early");
if (cfg) console.log(`      base symbol parsed back as: ${JSON.stringify(cfg.base.s)}`);

head("the app itself");
for (const [what, needle] of [
  ["parses decimals into BigInt base units", "const parse=(s,d)=>"],
  ["formats them back the same way", "const fmt=(v,d,p)=>"],
  ["refuses a value that will not fit a word", "does not fit in a word"],
  ["checks the chain before it sends", "your wallet is on chain "],
  ["quotes live, debounced", "setTimeout(refresh,220)"],
  ["knows whether it is approving or swapping", "al<amt?('Approve "],
  ["computes the floor from a slippage tolerance", "BigInt(10000-slip)/10000n"]
]) {
  ok(what, mk.body.includes(needle), "not found in the page");
}
ok("and no keccak or ABI coder was shipped",
   !/keccak|ethers|web3\.js/i.test(mk.body));

const pl = await GET(["token", "1", "pool"]);
/*  The client is contract code. A syntax error in it is permanent, and
    would be invisible to every assertion above — the page would render,
    the bytes would be right, and nothing on it would work. So the script
    blocks are parsed.                                                    */
/*════════════ the picker: which markets can actually be traded ════════════*/
head("the market picker, and the token list that is not fetched");
{
  const total = Number(decUint(await c.read(pool, "openCount()")));
  ok("the pool enumerates its own open markets", total > 0, `openCount() = ${total}`);

  /*  The defect this replaced: /open walked token IDS, so a collection with
      markets only on high ids showed an empty first page and a reader
      concluded there were none. Prove the directory finds one that a scan
      of the first window would have missed.                              */
  while (Number(decUint(await c.read(nft, "totalSupply()"))) < 40) {
    await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  }
  const far = Number(decUint(await c.read(nft, "totalSupply()")));
  const dai = await c.deploy(A("test/mocks/MockERC20.sol", "MockERC20").bytecode,
    w(0xa0) + w(0xe0) + w(18) + w(0) + w(0) + encS("Dai") + encS("DAI"), "DAI");
  await c.exec(pool, "openMarket(uint256,address,address,uint16)", [far, weth, dai, 30]);

  const dir = await GET(["open"]);
  ok(`a market on token #${far} appears on the first page of the directory`,
     dir.body.includes(`/token/${far}/market`),
     "walking token ids would have needed a page for every 24 of them");

  const swapPage = await GET(["token", "1", "market"]);
  ok("the swap card carries a market picker", swapPage.body.includes("id=mkt"));
  const opts = [...swapPage.body.matchAll(/<option value="(\d+)"/g)].map((m) => m[1]);
  ok("listing markets the pool says exist", opts.length > 0, "no options rendered");
  ok("including the far one", opts.includes(String(far)), opts.join(","));
  ok("and marking the one you are on", swapPage.body.includes("selected"));

  /*  The property a hosted token list cannot offer: everything offered is
      tradeable, because it was read from the thing that would trade it.  */
  let allOpen = true;
  for (const o of opts) {
    const mkt = await c.read(pool, "market(uint256)", [Number(o)]);
    if (decUint(mkt, 5) !== 1n) { allOpen = false; break; }
  }
  ok("every market it offers is genuinely open", allOpen,
     "the picker listed a market the pool says is closed");

  /*  Closing a market has to remove it, or the picker offers a market that
      cannot be traded — which is the exact failure a fetched list has.   */
  await c.exec(pool, "closeMarket(uint256)", [far]);
  eq("closing one drops it from the count",
     Number(decUint(await c.read(pool, "openCount()"))), total + 1 - 1);
  const dir2 = await GET(["open"]);
  ok("and from the directory",
     !dir2.body.includes(`href="/token/${far}/market"`),
     "a closed market is still being offered");
}

head("the app parses as JavaScript");
const scriptsOf = (body) =>
  [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
for (const [label, body] of [
  ["the flat door", (await GET(["door"])).body],
  ["the terminal", (await GET(["terminal"])).body],
  ["the launchpad", (await GET(["launch"])).body],
  ["the vault", (await GET(["lock"])).body],
  ["the projector", (await GET(["projector"])).body],
  ["the seals", (await GET(["seal"])).body],
  ["the keys", (await GET(["keys"])).body],
  ["the nameplate page", (await GET(["name"])).body],
  ["the estate", (await GET(["estate"])).body],
  ["the commons", (await GET(["chat"])).body],
  ["the rooms", (await GET(["rooms"])).body],
  ["a direct message", (await GET(["dm", "1"])).body],
  ["the swap card", (await GET(["swap"])).body],
  ["the market page", mk.body],
  ["the pool page", (await GET(["token", "1", "pool"])).body],
  ["the rent page", (await GET(["token", "1", "rent"])).body],
  ["the vault page", (await GET(["token", "1", "vault"])).body]
]) {
  const blocks = scriptsOf(body);
  let bad = null;
  for (const b of blocks) {
    try { new Function(b); } catch (e) { bad = e.message; break; }
  }
  ok(`${label} — ${blocks.length} block(s)`, blocks.length > 0 && bad === null,
     bad || "no script blocks found at all");
}
/*  The counter still ships none, which is the right answer rather than an
    oversight: it is a page of links about a token, and a client that does
    nothing is bytes a node serves for no reason.

    The door does ship one now, and that is the change: it used to be a
    document about the collection and it is the way in. It reads which
    tokens the connected wallet holds and hands over the instrument, so it
    has something to do before anybody clicks a link.                     */
for (const [label, path] of [["the counter", ["token", "1"]]]) {
  const b = (await GET(path)).body;
  /*  The lore folder rides on every foot now — it touches paragraphs and
      nothing else. The claim this test keeps is the one that matters: no
      script on a read-only page can reach a wallet.                    */
  const signing = scriptsOf(b).filter((j) =>
    /ethereum|request\(|IPW|window\.IP\b/.test(j));
  ok(`${label} ships no signing client, because it has nothing to sign`,
     signing.length === 0, `${signing.length} wallet-touching block(s)`);
}
{
  const b = (await GET(["door"])).body;
  ok("the flat door ships one, because it is a way in",
     scriptsOf(b).length > 0 && b.includes("balanceOf"),
     "the door cannot tell you what you hold");
}

head("the holder's side is on the site too");
eq("200", pl.status, 200);
for (const [what, needle] of [
  ["add liquidity", "id=add"],
  ["remove liquidity", "id=rm"],
  ["set the fee", "id=fee"],
  ["bond the market", "id=bond"],
  ["sync the curve to the artwork", "id=sync"]
]) ok(what, pl.body.includes(needle));
ok("and it says whose page it is", pl.body.includes("the holder of #1"));

const rp = await GET(["token", "1", "rent"]);
head("the holder's side of the rental counter");
for (const [what, needle] of [
  ["names the lease agent", "id=agt"],
  ["publishes terms", "id=ls"],
  ["collects", "id=col"],
  ["ends a lease properly", "id=end"],
  ["and brings the books up to date", "id=set2"]
]) ok(what, rp.body.includes(needle));
ok("while an unlisted token shows no rent card, rather than a dead one",
   !rp.body.includes("id=rg"));


/*  The invariant Lease exists to keep. Every wei it holds is spoken for by
    exactly one of three ledgers, and the balance has to cover all of them
    at once — not at the end, at every step. Asserting it once at the close
    would pass for a contract that was briefly insolvent in the middle.   */
const PARTIES = [];      // every address that could be owed
const TOKENS = [1, 2, 3];  // every token that could hold rent
const OBLIGED = async (label) => {
  let owedTotal = 0n;
  for (const a of [c, renter, buyer, ...PARTIES])
    owedTotal += decUint(await c.read(lease, "owed(address)", [a.from.toString()]));
  let held = 0n;
  for (const t of TOKENS) {
    held += decUint(await c.read(lease, "earned(uint256)", [t]));
    const act = await c.read(lease, "activeOf(uint256)", [t]);
    held += decUint(act, 3);              // renter, start, until, paid, seen
  }
  const bal = await c.balanceOf(lease);
  ok(`solvent: ${label}`, bal >= owedTotal + held,
     `balance ${bal} < obligations ${owedTotal + held}`);
  return bal - (owedTotal + held);
};

/*  A DOM small enough to read: elements by id, two attribute selectors,
    and events. Enough to run the contract's own client, which is the only
    way to find out whether the calldata it assembles means what the page
    says it means.                                                        */
let byId = new Map();

/*  Elements built by a script rather than by the page.

    The fee-tier row on the Uniswap card is written with `innerHTML` and
    then wired up with `querySelectorAll` on the same element — which is
    ordinary DOM and was, until this, something the shim silently did not
    do. A shim that answers "no children" to that question does not fail
    loudly; it hands back an empty list and the buttons are never wired,
    so a test asserting the row works would pass against a row nobody can
    press. So assigning innerHTML re-parses, and the parse is cached on the
    string so that listeners attached to a child survive until the parent's
    markup actually changes.                                              */
const matches = (el, q) => {
  const d = q.match(/^\[data-([\w-]+)\]$/);
  if (d) return d[1].replace(/-(\w)/g, (x, y) => y.toUpperCase()) in el.dataset;
  if (q.startsWith(".")) return el.className.split(/\s+/).includes(q.slice(1));
  return el.tagName === q;
};

let ALL = [];
const mkEl = (tag, attrs) => {
  const el = {
    tagName: tag, value: "",
    disabled: false, hidden: false, className: "", placeholder: "",
    href: "", src: "", alt: "", title: "", tabIndex: 0, checked: false,
    scrollTop: 0, scrollHeight: 0, style: {},
    dataset: {}, _on: {}, _html: "", _kids: null, _text: "", children: [],
    /*  Real textContent is the concatenation of every descendant's text,
        and setting it removes the children. The chat client builds a
        message out of four elements and never assigns markup, so a shim
        that treated textContent as a plain string would report the right
        answer for the wrong reason — and would keep reporting it after
        somebody switched the client to innerHTML.                       */
    get textContent() {
      return this._text + this.children.map((k) => k.textContent).join("");
    },
    set textContent(v) { this._text = String(v); this.children.length = 0; },
    append(...nodes) {
      for (const n of nodes) {
        this.children.push(n);
        if (n && n.tagName) ALL.push(n);
      }
    },
    setAttribute(k, v) { if (k in this) this[k] = v; else this.dataset[k] = v; },
    getAttribute(k) { return k in this ? this[k] : this.dataset[k]; },
    get innerHTML() { return this._html; },
    set innerHTML(v) { if (v !== this._html) { this._html = String(v); this._kids = null; } },
    querySelectorAll(q) {
      if (this._kids === null) {
        this._kids = [];
        for (const m of String(this._html).matchAll(/<(\w+)([^>]*)>/g)) {
          this._kids.push(mkEl(m[1], m[2]));
        }
      }
      return this._kids.filter((e) => matches(e, q));
    },
    addEventListener(k, f) { (this._on[k] = this._on[k] || []).push(f); },
    focus() {}, blur() {}, click() { return this.fire("click"); },
    dispatchEvent(e) { return this.fire(e && e.type); },
    async fire(k) { for (const f of this._on[k] || []) await f(); }
  };
  el.classList = {
    add: (k) => { if (!el.className.split(/\s+/).includes(k))
                    el.className = (el.className + " " + k).trim(); },
    remove: (k) => { el.className =
      el.className.split(/\s+/).filter((x) => x && x !== k).join(" "); },
    contains: (k) => el.className.split(/\s+/).includes(k),
    /*  Standard, and its absence was not a bug in the page — it was the
        shim silently lacking a method every browser has, which surfaces as
        a TypeError inside the client and reads exactly like a real defect.
        A stub that is missing something is worse than one that is small,
        because the failure it produces points at the wrong file.        */
    toggle: (k, force) => {
      const has = el.className.split(/\s+/).includes(k);
      const want = force === undefined ? !has : !!force;
      if (want && !has) el.className = (el.className + " " + k).trim();
      if (!want && has) {
        el.className = el.className.split(/\s+/).filter((x) => x && x !== k).join(" ");
      }
      return want;
    }
  };
  for (const m of (attrs || "").matchAll(/data-([\w-]+)(?:=["']?([^"'\s>]*)["']?)?/g)) {
    el.dataset[m[1].replace(/-(\w)/g, (x, y) => y.toUpperCase())] = m[2] ?? "";
  }
  const v = (attrs || "").match(/\bvalue=["']?([^"'\s>]*)["']?/);
  if (v) el.value = v[1];
  /*  href, because the door's map derives window.DOORS from its own
      anchors — the one-source cure for three drifted door lists — and a
      shim that drops the attribute would report the cure as the disease. */
  const hr = (attrs || "").match(/\bhref=["']?([^"'\s>]*)["']?/);
  if (hr) el.href = hr[1];
  const cl = (attrs || "").match(/\bclass=["']?([^"'>]*)["']?/);
  if (cl) el.className = cl[1].trim();
  return el;
};
function mount(html) {
  byId = new Map();
  const all = [];
  ALL = all;
  for (const m of html.matchAll(/<(\w+)([^>]*)>/g)) {
    const el = mkEl(m[1], m[2]);
    all.push(el);
    const id = (m[2].match(/\bid=["']?([\w.-]+)["']?/) || [])[1];
    if (id && !byId.has(id)) byId.set(id, el);
  }
  /*  Every JSON config block, not just the one this shim was first written
      for. It used to look up `id="D"` by name, so a page carrying a second
      block — the launchpad carries its own, deliberately, because it
      describes this collection's contract rather than Uniswap's — handed
      the client an empty string and JSON.parse threw before a single
      listener attached. A shim that knows one id is a shim that silently
      stops modelling the page the moment a second appears.             */
  for (const m of html.matchAll(
      /<script type="application\/json" id="(\w+)">([\s\S]*?)<\/script>/g)) {
    if (byId.get(m[1])) byId.get(m[1]).textContent = m[2];
  }
  const listeners = {};
  globalThis.addEventListener = (k, f) => { (listeners[k] = listeners[k] || []).push(f); };
  globalThis.dispatchEvent = (e) => { for (const f of listeners[e.type] || []) f(e); };
  globalThis.Event = class { constructor(t) { this.type = t; } };
  /*  A body, because the gate is a class on it; a createElement, because
      the chat client builds every message out of elements rather than out
      of a string; and a `hidden`, because the poll stops when the tab is
      not being looked at.                                              */
  const body = mkEl("body", "");
  globalThis.document = {
    body: body,
    hidden: false,
    createElement: (t) => mkEl(t, ""),
    getElementById: (i) => byId.get(i) || null,
    querySelectorAll: (q) => all.filter((e) => matches(e, q))
  };
  /*  Storage exists but forgets between pages, which is what a fresh
      browser looks like and the harder case for the client.           */
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
  return byId;
}
const runScripts = (html) => {
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(m[1])();
};
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const wallet = (actor) => {
  let n = 0;
  const filters = [];
  /*  One request at a time. The in-process EVM is not a node: two
      interleaved runCalls corrupt each other's checkpoints and neither
      returns. A page is entitled to fire overlapping reads — its boot
      chain and a click chain race in real browsers too — and a real RPC
      endpoint absorbs that; this queue is the shim's version of a node's
      front door.                                                        */
  let q = Promise.resolve();
  const seq = (f) => { const p = q.then(f, f); q = p.then(() => {}, () => {}); return p; };
  globalThis.window = globalThis;
  globalThis.window.ethereum = {
    request: async ({ method, params }) => {
      if (method === "eth_chainId") return "0x1";
      if (method === "eth_requestAccounts" || method === "eth_accounts")
        return [actor.from.toString()];
      /*  Deterministic per (actor, message) — which is the only property
          the seal client relies on (RFC 6979 in a real wallet). The bytes
          are entropy to the page, never verified as a signature.        */
      if (method === "personal_sign") {
        const h1 = Buffer.from(keccak256(Buffer.from(
          actor.from.toString() + String(params[0]), "utf8")));
        const h2 = Buffer.from(keccak256(h1));
        return "0x" + h1.toString("hex") + h2.toString("hex") + "1b";
      }
      if (method === "eth_call")
        return seq(() => c.call(params[0].to, params[0].data, actor.from.toString()));
      /*  The conversation is read from logs, so the provider has to answer
          for them. The ledger is the same one the transactions above wrote
          into, filtered the way a node filters.                        */
      if (method === "eth_getLogs") { filters.push(params[0]); return seq(() => c.getLogs(params[0])); }
      if (method === "eth_sendTransaction") {
        n++;
        const t = params[0];
        await seq(() => actor.send({ to: t.to, data: t.data,
                           value: t.value ? BigInt(t.value) : 0n, label: "app" }));
        return "0x" + "ab".repeat(32);
      }
      throw new Error("unexpected method " + method);
    }
  };
  return { sent: () => n, filters: () => filters };
};

/*════════════ the app, actually driven ════════════

  Everything above checks that the page says the right things. This runs
  it. The two script blocks the contract emitted are executed against a
  DOM shim and a provider wired straight to the same in-process EVM, so a
  swap performed by pressing the button on the page is a swap performed by
  the contract — and the numbers the card shows are checked against what
  `Pool.quote` says at the same block.

  This is the only test here that would catch the client being wrong. A
  page can render perfectly, carry the right selectors, parse as
  JavaScript, and still assemble calldata that means something else.
*/
let DRIVEN = 0;
head("driving the swap card");
{
  /*  Its own token and its own pair. Token 1's market is the hostile one
      from the escaping tests and has no real balances behind it; a driver
      pointed at that would be testing the mock, not the app.            */
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const T = Number(decUint(await c.read(nft, "totalSupply()")));
  DRIVEN = T;
  await c.exec(weth, "mint(address,uint256)", [c.from.toString(), 10n ** 24n]);
  await c.exec(usdc, "mint(address,uint256)", [c.from.toString(), 10n ** 18n]);
  await c.exec(weth, "approve(address,uint256)", [pool, 1n << 255n]);
  await c.exec(usdc, "approve(address,uint256)", [pool, 1n << 255n]);
  await c.exec(pool, "openMarket(uint256,address,address,uint16)", [T, weth, usdc, 30]);
  await c.exec(pool, "deposit(uint256,uint256,uint256)",
    [T, 40n * 10n ** 18n, 120_000n * 10n ** 6n]);

  const page = await GET(["token", String(T), "market"]);

  mount(page.body);
  const trader = await c.as("0x" + "44".repeat(32));
  await c.exec(weth, "mint(address,uint256)", [trader.from.toString(), 10n ** 21n]);
  const W1 = wallet(trader);
  const sent = () => W1.sent();
  runScripts(page.body);
  await nap(30);
  ok("the client loaded against the page's own config", !!globalThis.IP);

  /*──── a quote appears, and it is the pool's ────*/
  const $ = (i) => byId.get(i);
  $("si").value = "1";
  await $("si").fire("input");
  await nap(400);

  const IN = 10n ** 18n;
  const expect = decUint(await c.read(pool, "quote(uint256,bool,uint256)", [T, true, IN]));
  const shown = $("so").value.replace(/,/g, "");
  ok("typing an amount produced a quote", shown.length > 0, "the field stayed empty");
  const shownRaw = BigInt(Math.round(Number(shown) * 1e6));
  ok("and it is what Pool.quote says, to the displayed precision",
     shownRaw > expect - 2n && shownRaw < expect + 2n,
     `card ${shown} (${shownRaw}) vs pool ${expect}`);
  console.log(`      1 WETH in, the card says ${shown} USDC, the pool says ` +
              `${(Number(expect) / 1e6).toFixed(6)}`);

  ok("the details name a rate, a floor and the fee",
     /rate/.test($("det").innerHTML) && /receive at least/.test($("det").innerHTML)
     && /fee/.test($("det").innerHTML));
  ok("and the button knows an approval is needed first",
     /^Approve /.test($("go").textContent), $("go").textContent);

  /*──── press it: approve, then swap ────*/
  await $("go").fire("click");
  eq("pressing it sent one transaction", sent(), 1);
  const allowed = decUint(await c.read(weth, "allowance(address,address)",
                                       [trader.from.toString(), pool]));
  ok("which was the approval, and it landed", allowed > 0n);

  await $("si").fire("input");
  await nap(400);
  ok("now the button offers the swap",
     /^Swap /.test($("go").textContent), $("go").textContent);

  const before = decUint(await c.read(usdc, "balanceOf(address)", [trader.from.toString()]));
  await $("go").fire("click");
  eq("pressing it again sent a second transaction", sent(), 2);
  const after = decUint(await c.read(usdc, "balanceOf(address)", [trader.from.toString()]));
  ok("and the trader was actually paid", after > before, `${before} -> ${after}`);
  ok("at no worse than the floor the card promised",
     after - before >= expect * 9950n / 10000n,
     `received ${after - before}, floor was about ${expect * 9950n / 10000n}`);
  console.log(`      received ${(Number(after - before) / 1e6).toFixed(6)} USDC ` +
              `\u2014 the card, the pool and the balance all agree`);

  /*──── the flip, and the guards ────*/
  await $("flip").fire("click");
  await nap(400);
  eq("flipping turns the pair round", $("ts").textContent, "USDC");

  $("si").value = "not a number";
  await $("si").fire("input");
  await nap(300);
  ok("nonsense in the amount field is refused rather than sent",
     $("go").disabled === true && $("so").value === "",
     `button "${$("go").textContent}", output "${$("so").value}"`);

  globalThis.window.ethereum.request = (async ({ method, params }) => {
    if (method === "eth_chainId") return "0x2105";           // some other chain
    if (method === "eth_requestAccounts") return [trader.from.toString()];
    throw new Error("unexpected " + method);
  });
  $("si").value = "1";
  let refused = false;
  try { await globalThis.IP.connect(); } catch (e) { refused = /on chain/.test(e.message); }
  ok("a wallet on the wrong chain is told so rather than used", refused);

}


/*════════════ the conversation, actually driven ════════════

  A page can carry the right topic, the right selectors and a composer that
  looks like a composer, and still put a stranger's message into the DOM as
  markup — on the same origin a wallet is injected into. Or read the room
  with a range query that a public endpoint answers once and then rate-limits
  for an hour.

  Neither of those is visible in the markup. Both are visible here.
*/
head("driving the commons");
{
  const page = await GET(["chat"]);
  mount(page.body);
  const W = wallet(c);
  runScripts(page.body);
  await nap(80);
  ok("the talking client loaded against the page's own config", !!globalThis.IPT);

  const $ = (i) => byId.get(i);
  await $("go").fire("click");
  await nap(120);

  const me = globalThis.IPT.me();
  ok("connecting found the tokens this wallet holds",
     globalThis.IPT.mine().length > 0, "it found none");
  ok("and it is speaking as one of them", me !== null && me > 0n, String(me));
  ok("the gate opened", document.body.classList.contains("held"));
  eq("and the page says which token is speaking",
     $("as").children.length, globalThis.IPT.mine().length);

  /*  The hostile body again, this time all the way through the client. If
      it ever reaches the DOM as markup it does so on the same origin as
      /token/<id>/live, where a wallet is injected.                      */
  const HOSTILE = "</script><img src=x onerror=alert(1)> & <b>bold</b>";
  const before = decUint(await c.read(site.parley, "stateOf(uint256)", [0]), 1);
  $("say").value = HOSTILE;
  await $("send").fire("click");
  await nap(120);
  const after = decUint(await c.read(site.parley, "stateOf(uint256)", [0]), 1);
  eq("pressing send put a message on the chain", after, before + 1n);

  /*  Two more, in two later blocks, so the walk has somewhere to walk to.
      One message in one block would let a client that only ever reads the
      head block pass this section without ever following a pointer.     */
  for (const text of ["and another", "and one more"]) {
    evm.roll(evm.BLOCK.header.number + 7n);
    $("say").value = text;
    await $("send").fire("click");
    await nap(120);
  }

  await globalThis.IPT.paint();
  await nap(80);
  const rows = $("log").children;
  ok("and the conversation came back onto the page", rows.length > 0,
     "nothing was rendered");

  eq("all three messages are on the page, oldest first", rows.length, 3);
  const first = rows[0];
  const body = first.children[first.children.length - 1];
  eq("the hostile one reads exactly as it was typed", body.textContent, HOSTILE);
  eq("and the newest is at the bottom",
     rows[2].children[rows[2].children.length - 1].textContent, "and one more");
  const last = rows[rows.length - 1];
  eq("and it is text, not markup — nothing was parsed out of it",
     body.children.length, 0);
  ok("because the client never assigned innerHTML to it",
     body.innerHTML === "", JSON.stringify(body.innerHTML));
  ok("the sender is named by token, not by address",
     last.children[0].textContent.startsWith("#"), last.children[0].textContent);

  /*  And how it was read. One query per block, never a range: `fromBlock`
      and `toBlock` are the same block every time. A client that scanned
      would work perfectly here and be refused by every public endpoint in
      production, which is the kind of defect a test has to look for on
      purpose.                                                           */
  const asked = W.filters();
  ok("the archive was read by following pointers, not by reading one block",
     asked.length >= 3, `${asked.length} quer(y|ies) for three blocks of messages`);
  ok("and every one of them asked for exactly one block",
     asked.every((f) => f.fromBlock === f.toBlock),
     JSON.stringify(asked.find((f) => f.fromBlock !== f.toBlock)));
  ok("filtered to the room, by a topic the contract computed",
     asked.every((f) => f.topics && f.topics.length === 2 &&
                        String(f.topics[0]).length === 66));
  console.log(`      ${asked.length} single-block queries, no range scan`);
}

head("driving a direct message, and the room nobody founded");
{
  const page = await GET(["dm", "2"]);
  mount(page.body);
  wallet(c);
  runScripts(page.body);
  await nap(80);
  await byId.get("go").fire("click");
  await nap(140);

  const key = decUint(await c.read(site.parley, "pairKey(uint256,uint256)",
    [globalThis.IPT.me(), 2]));
  eq("the client derived the pair room rather than being told it",
     globalThis.IPT.room(), key);

  const before = decUint(await c.read(site.parley, "stateOf(uint256)", [key]), 1);
  const commonsWas = decUint(await c.read(site.parley, "stateOf(uint256)", [0]), 1);
  byId.get("say").value = "one to one";
  await byId.get("send").fire("click");
  await nap(140);
  eq("and a whisper lands in it",
     decUint(await c.read(site.parley, "stateOf(uint256)", [key]), 1), before + 1n);
  const commonsNow = decUint(await c.read(site.parley, "stateOf(uint256)", [0]), 1);
  eq("without touching the commons", commonsNow, commonsWas);
}

/*  The root used to be a page about the collection with the artwork on a
    link. It is the artwork now: a visitor who follows a link to an NFT
    arrives at the NFT, and the flat pages sit behind its doors.        */
head("the front page is the instrument");
{
  const root = await GET([]);
  eq("/ answers 200", root.status, 200);
  /*  The instrument arrives packed: a short loader, then the document as
      gzip the browser inflates itself. So the proof it is the artwork and
      not a page about the artwork is the loader and its shards, not the
      word "canvas" — which is inside the compressed body where no string
      match can reach it.                                              */
  ok("and what it answers with is the instrument, not a page about one",
     /\$IPSE\s*=\s*\[/.test(root.body) && /DecompressionStream/.test(root.body),
     root.body.slice(0, 100));
  ok("carrying the token's own state rather than a placeholder",
     /IPSE\s*=|window\.IPSE/.test(root.body), "no injected state found");
  const flat = await GET(["door"]);
  eq("and the flat front page still answers at /door", flat.status, 200);
  ok("with the whole row of surfaces on it", flat.body.includes("/swap")
     && flat.body.includes("/lock") && flat.body.includes("/gallery"));
}

head("the door is the map, in a person's words");
{
  const page = await GET(["door"]);
  /*  The tesseract was the symptom and it is gone; what fronts the door
      now is the task map, server-rendered, one row per way in — and the
      mint, priced in its own label, running the terminal's own word.  */
  ok("the ways in are on the door, rendered by the contract",
     page.body.includes("id=ways") && page.body.includes("OPEN A CONSOLE"));
  ok("and the mint stands at the gate with its price in the label",
     /id=mint1>mint the next one/.test(page.body));
  ok("and the terminal speaks from the door itself",
     page.body.includes("id=tin") && page.body.includes("id=tout"));
  ok("and the lore folds itself behind stars, script willing",
     page.body.includes("lore"));

  mount(page.body);
  globalThis.location = { href: "/" };
  wallet(c);
  runScripts(page.body);
  await nap(120);

  /*  The tesseract is gone — the console's specification called it the
      symptom and this suite now holds the door to that ruling. What
      replaced it is one server-rendered map whose anchors ARE the data:
      window.DOORS is derived from the DOM, so the list a program walks
      cannot drift from the list a person read.                          */
  ok("the tesseract is gone, and nothing else answers to its name", !globalThis.TESS);
  ok("the doors exist as data derived from the page itself",
     Array.isArray(globalThis.DOORS) && globalThis.DOORS.length >= 8,
     globalThis.DOORS ? String(globalThis.DOORS.length) : "no DOORS");
  ok("every door names a route, and the routes are the site's",
     globalThis.DOORS.every((d) => /^\//.test(d.path)) &&
     globalThis.DOORS.some((d) => d.path === "/swap") &&
     globalThis.DOORS.some((d) => d.path === "/keys"),
     JSON.stringify(globalThis.DOORS));

  ok("the terminal came up on the door", !!globalThis.TERM);
  globalThis.location.href = "/";
  const walked = await globalThis.TERM.run("go lock");
  ok("`go` walks by word", /\/lock/.test(walked), walked);
  eq("to the same place the node leads", globalThis.location.href, "/lock");
  const lost = await globalThis.TERM.run("go nowhere");
  ok("and a wrong word lists the right ones", /go where/.test(lost), lost);
  delete globalThis.location;
}

head("the door hands over what the wallet holds");
{
  const page = await GET(["door"]);
  mount(page.body);
  wallet(c);
  runScripts(page.body);
  await nap(80);
  await byId.get("go").fire("click");
  await nap(140);

  const yours = byId.get("yours");
  ok("the door listed the tokens this wallet holds", yours.children.length > 0,
     "it listed none");
  const row = yours.children[0];
  const links = row.children.filter((k) => k.tagName === "span")
    .flatMap((k) => k.children).filter((k) => k.tagName === "a");
  ok("each one offers its instrument", links.some((a) => /\/live$/.test(a.href)),
     links.map((a) => a.href).join(" "));
  ok("its counter", links.some((a) => /^\/token\/\d+$/.test(a.href)));
  ok("and its messages", links.some((a) => /^\/dm\/\d+$/.test(a.href)));
}

/*════════════ the terminal, actually driven ════════════

  The terminal claims one code path for fingers and for agents. So it is
  driven the way an agent would drive it: TERM.run(line), assert against
  the chain. A command that composes calldata wrongly fails here against
  the same contracts a person would hit.
*/
head("driving the terminal");
{
  const page = await GET(["terminal"]);
  eq("/terminal answers", page.status, 200);
  mount(page.body);
  wallet(c);
  runScripts(page.body);
  await nap(60);
  ok("the terminal came up", !!globalThis.TERM);

  const cmds2 = () => globalThis.TERM.commands();
  const cmds = cmds2();
  ok(`and publishes its table as data — ${cmds.length} commands`,
     Array.isArray(cmds) && cmds.length >= 20);
  ok("each entry says whether it writes",
     cmds.every((x) => typeof x.writes === "boolean" && x.usage && x.what));

  const help = await globalThis.TERM.run("help");
  ok("help is the same table, for people", help.includes("mint") && help.includes("launch"));

  const supply0 = decUint(await c.read(nft, "totalSupply()"));
  await globalThis.TERM.run("mint");
  await nap(30);
  eq("`mint` minted", decUint(await c.read(nft, "totalSupply()")), supply0 + 1n);
  await globalThis.TERM.run(`use ${supply0 + 1n}`);

  const commons0 = decUint(await c.read(site.parley, "stateOf(uint256)", [0]), 1);
  await globalThis.TERM.run("say hello from the terminal");
  await nap(30);
  eq("`say` reached the commons", decUint(await c.read(site.parley, "stateOf(uint256)", [0]), 1),
     commons0 + 1n);

  await globalThis.TERM.run("launch TermCoin TERM 1000000000000000000000000");
  await nap(30);
  eq("`launch` fired through the kiln, signed by the active token",
     decUint(await c.read(site.kiln, "coinCount()")), 1n);
  const termCoin = decAddr(await c.read(site.kiln, "recent(uint256,uint256)", [0, 1]), 2);
  eq("and the kiln remembers which token signed it",
     decUint(await c.read(site.kiln, "launchedBy(address)", [termCoin])),
     supply0 + 1n);

  const out = await globalThis.TERM.run("launched");
  ok("`launched` lists it with its address", /0x[0-9a-f]{40}/.test(out), out);

  /*  The vault, from the same prompt. Two transactions in one command —
      the exact approve the lock needs, then the lock — and the list read
      back off the chain, not off a variable.                            */
  await c.exec(weth, "mint(address,uint256)", [c.from.toString(), 10n ** 20n]);
  const locked = await globalThis.TERM.run(`lockup ${weth} 1000000 7`);
  ok("`lockup` locked and says until when", /locked until 20/.test(locked), locked);
  const ls = await globalThis.TERM.run("lockups");
  ok("`lockups` reads it back off the vault", /#\d+ .*1000000/.test(ls), ls);

  /*  The estate's words, registered from a third contract through the same
      `def` the built-ins use. `DeskTerm` is at ninety-seven per cent, so
      these could not live there — and the point of the split is that from
      the prompt there is no way to tell.                                */
  const active = supply0 + 1n;
  ok("the estate's words joined the same table",
     ["will", "knock", "inherit", "consign", "window", "price", "home"]
       .every((w) => cmds2().some((x) => x.usage.startsWith(w))),
     JSON.stringify(cmds2().map((x) => x.usage.split(" ")[0])));

  const none = await globalThis.TERM.run(`will ${active}`);
  ok("`will` on a token with no plan says so", /nothing arranged/.test(none), none);
  await globalThis.TERM.run(`will ${active} ${renter.from.toString()} 90 14`);
  await nap(30);
  const plan = await c.read(site.succession, "planOf(uint256)", [active]);
  eq("`will` wrote the arrangement the words asked for",
     decAddr(plan, 1).toLowerCase(), renter.from.toString().toLowerCase());
  eq("with the silence in days, turned into seconds", decUint(plan, 3), 90n * 86400n);
  const said = await globalThis.TERM.run(`will ${active}`);
  ok("and reading it back names the heir and why it cannot fire yet",
     /not approved/.test(said), said);
  await globalThis.TERM.run(`approve-will ${active}`);
  await nap(30);
  ok("`approve-will` is the one grant it needs",
     /in use/.test(await globalThis.TERM.run(`will ${active}`)));
  await globalThis.TERM.run(`unwill ${active}`);
  await nap(30);
  await c.exec(nft, "approve(address,uint256)", ["0x" + "00".repeat(20), active]);

  const win = await globalThis.TERM.run(
    `consign ${active} ${renter.from.toString()} 0.25 7.5 45`);
  await nap(30);
  ok("`consign` states the floor it committed to", /never below 0.25 ETH/.test(win), win);
  const note = await c.read(site.consign, "noteOf(uint256)", [active]);
  eq("a percentage typed as 7.5 arrives as 750 basis points", decUint(note, 5), 750n);
  eq("and the floor as wei", decUint(note, 2), 25n * 10n ** 16n);
  const read = await globalThis.TERM.run(`window ${active}`);
  ok("`window` reads the note back off the chain",
     /not offered yet/.test(read) && /0\.25/.test(read), read);
  await renter.exec(site.consign, "release(uint256)", [active]);
}

head("the new tabs render what the terminal did");
{
  const co = await GET(["launch"]);
  ok("/launch lists the terminal's coin, address first",
     co.body.includes("TERM") && /0x[0-9a-f]{40}/.test(co.body));
  ok("with a copy button and a watch button",
     co.body.includes("class=copy") && co.body.includes("class=watch"));
  ok("and names the token that signed it", />#\d+</.test(co.body.replace(/\s/g, "")) ||
     co.body.includes("<td>#"), "no by-token column");
  const ga = await GET(["gallery"]);
  const cells = [...ga.body.matchAll(/class=gcell/g)].length;
  const supply = Number(decUint(await c.read(nft, "totalSupply()")));
  eq("/gallery wears one still per token (up to a page)",
     cells, Math.min(supply, 24));
}

/*════════════ the Uniswap card, actually driven ════════════

  This is the section that would catch the one mistake on this whole site
  that costs somebody money.

  Two Uniswap routers have an `exactInputSingle`. Their params structs
  differ by exactly one field — the older one carries a `deadline` at index
  4 and SwapRouter02 does not — and sending one shape to the other router
  does not revert. It shifts `recipient` and every amount by one word and
  executes something nobody asked for.

  So the mocks do not merely perform the trade. They decode the struct and
  record every field, and the assertions below check field by field that the
  word the client wrote into `amountIn` arrived as `amountIn`. Then the
  whole thing is done again against a second deployment wired to the other
  router with the other kind, because a page that is right about one shape
  and silent about the other is a page that is right by accident.
*/
head("driving the Uniswap card");
{
  const page = await GET(["swap"]);
  eq("/swap answers 200", page.status, 200);

  mount(page.body);
  const uniTrader = await c.as("0x" + "aa".repeat(32));
  await c.exec(weth, "mint(address,uint256)", [uniTrader.from.toString(), 10n ** 21n]);
  const W = wallet(uniTrader);
  runScripts(page.body);
  await nap(30);
  const $ = (i) => byId.get(i);

  ok("the shared client loaded", !!globalThis.IP);
  ok("and the Uniswap client on top of it", !!globalThis.UNI);

  /*──── the config carries the addresses, not a copy of them ────*/
  const U = globalThis.UNI.U;
  eq("the factory in the page is the factory the site was deployed with",
     U.factory.toLowerCase(), uniFactory.toLowerCase());
  eq("and the router", U.router.toLowerCase(), uniRouterV3.toLowerCase());
  eq("and the router's calldata shape travels with it", U.kind, 0);

  /*  The selectors, checked against keccak here rather than trusted. This
      is the check a reader can do by hand from the page source.        */
  const s4 = (sig) => "0x" + Buffer.from(keccak256(Buffer.from(sig, "utf8")))
    .toString("hex").slice(0, 8);
  eq("the v3 router selector is the hash of the v3 router's own signature",
     U.sel.swapV3,
     s4("exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))"));
  eq("and SwapRouter02's is a different function entirely",
     U.sel.swap02,
     s4("exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))"));
  ok("which are not the same four bytes", U.sel.swapV3 !== U.sel.swap02);
  /*  QuoterV2's NatSpec lists its struct fields in a different order from
      the declaration. The declaration is what the ABI encodes.        */
  eq("the quoter selector follows the struct declaration, not the comment",
     U.sel.quote, s4("quoteExactInputSingle((address,address,uint256,uint24,uint160))"));
  ok("and not the order its own documentation gives",
     U.sel.quote !== s4("quoteExactInputSingle((address,address,uint24,uint256,uint160))"));

  /*──── the dropdown is derived from the chain ────*/
  const syms = U.assets.map((a) => a.s);
  ok("the offered assets were derived from open markets, not fetched",
     syms.includes("WETH") && syms.includes("USDC"), syms.join(","));
  ok("and every one of them carries its own decimals",
     U.assets.every((a) => typeof a.d === "number" && a.d <= 36));
  ok("the page offers a box for anything not on that list",
     /paste an address/.test(page.body));

  /*──── a quote, from the tier that prices best ────*/
  $("ta").value = weth.toLowerCase();
  await $("ta").fire("change");
  $("tb").value = usdc.toLowerCase();
  await $("tb").fire("change");
  await nap(300);

  $("si").value = "1";
  await $("si").fire("input");
  await nap(900);

  const shown = $("so").value.replace(/,/g, "");
  ok("typing an amount produced a quote", shown.length > 0, "the field stayed empty");
  ok("and it came from the deepest tier rather than the first one that answered",
     Math.abs(Number(shown) - 2995) < 0.01,
     `card says ${shown}, the 0.3% pool pays 2995 and the 0.05% pool pays 2900`);
  ok("the card names which pool it quoted through",
     /0\.3%/.test($("det").innerHTML), $("det").innerHTML.slice(0, 200));
  console.log(`      quoted every tier that had a pool and took ${shown} over 2900`);



  /*──── approve, then swap ────*/
  await $("go").fire("click");                       // connects
  await nap(200);
  await $("go").fire("click");                       // approves
  await nap(200);
  const allow = decUint(await c.read(weth, "allowance(address,address)",
    [uniTrader.from.toString(), uniRouterV3]));
  ok("the first press approved the router and nothing else", allow > 0n);

  const usdcBefore = decUint(await c.read(usdc, "balanceOf(address)",
    [uniTrader.from.toString()]));
  await $("go").fire("click");                       // swaps
  await nap(400);

  const seen = await c.read(uniRouterV3, "last()");
  ok("the swap reached the router", decBool(seen, 0), "it never arrived");

  /*  Field by field. Any one of these being off by a word is the failure
      the two-router trap produces, and it produces no revert.          */
  eq("tokenIn arrived as tokenIn", decAddr(seen, 1).toLowerCase(), weth.toLowerCase());
  eq("tokenOut arrived as tokenOut", decAddr(seen, 2).toLowerCase(), usdc.toLowerCase());
  eq("the fee tier arrived as the fee tier", decUint(seen, 3), 3000n);
  eq("the recipient is the person who pressed the button",
     decAddr(seen, 4).toLowerCase(), uniTrader.from.toString().toLowerCase());
  ok("the deadline is in the future and not decades away",
     decUint(seen, 5) > 0n && decUint(seen, 5) < BigInt(Math.floor(Date.now() / 1000)) + 7200n,
     `deadline ${decUint(seen, 5)}`);
  eq("one WETH typed as text arrived as one WETH in base units",
     decUint(seen, 6), WAD);
  eq("and the floor is the quote less the slippage tolerance, to the wei",
     decUint(seen, 7), (2995n * 10n ** 6n * 9950n) / 10000n);
  eq("with no price limit, which is what zero means there", decUint(seen, 8), 0n);

  const usdcAfter = decUint(await c.read(usdc, "balanceOf(address)",
    [uniTrader.from.toString()]));
  eq("and the tokens actually moved", usdcAfter - usdcBefore, 2995n * 10n ** 6n);

  /*──── the override, which used to be a highlight and nothing else ────*/

  /*  The page says the tier "can be overridden". Before this it could not:
      pressing a tier moved a class and `quoteAll` still scanned every pool
      and took the best, so the trade went where the router wanted while the
      interface said otherwise. A control that lies about what it does is
      worse than no control, so this presses the WORSE tier and requires the
      trade to actually go there.                                          */
  {
    const worse = $("rt").querySelectorAll("[data-fee]").find((b) => b.dataset.fee === "500");
    ok("the shallower tier is offered as a choice", !!worse,
       $("rt").innerHTML.slice(0, 160));
    await worse.fire("click");
    await nap(800);
    const forced = $("so").value.replace(/,/g, "");
    ok("choosing it changes the quote to that tier's price",
       Math.abs(Number(forced) - 2900) < 0.01,
       `after pressing 0.05% the card says ${forced}, and that tier pays 2900`);

    await $("go").fire("click");
    await nap(400);
    const s2 = await c.read(uniRouterV3, "last()");
    eq("and the trade goes through the tier that was chosen, not the best one",
       decUint(s2, 3), 500n);
    console.log(`      pressed 0.05%: quote 2995 -> ${forced}, and the swap went ` +
                `through the 0.05% pool rather than the 0.3% one`);
  }

  /*──── the sentinel ────*/
  $("si").value = "0";
  await $("si").fire("input");
  await nap(400);
  ok("an amount of zero cannot be sent",
     $("go").disabled === true || /Enter an amount/.test($("go").textContent),
     `button says "${$("go").textContent}", disabled=${$("go").disabled}`);
  const before0 = W.sent();
  await $("go").fire("click");
  await nap(200);
  eq("and pressing anyway sends nothing", W.sent(), before0);
  console.log("      zero is CONTRACT_BALANCE on SwapRouter02 — " +
              "\"swap everything the router holds\", not \"swap nothing\"");

  /*──── a token nobody vetted ────*/
  $("ta").value = "?";
  $("tax").value = nasty;
  await $("tax").fire("change");
  await nap(300);
  const tick = $("ts").textContent;
  ok("a pasted token's ticker is stripped to something inert",
     !/[<>&"']/.test(tick), `rendered as ${JSON.stringify(tick)}`);
  console.log(`      a symbol of "<script>alert(1)</script>" renders as ` +
              `${JSON.stringify(tick)}`);

  /*  The same hazard on the collection's own market card, which is where it
      was found. Token 1's pair is the script-tag token. The JSON escaper
      stops that symbol ending the config block; it does not stop the string
      coming back out of JSON.parse with its angle brackets intact, and the
      quote panel builds itself with innerHTML.                          */
  const hostile = await GET(["token", "1", "market"]);
  mount(hostile.body);
  wallet(uniTrader);
  runScripts(hostile.body);
  await nap(30);
  const sym = globalThis.IP.D.base.s;
  ok("and the market card's own config is scrubbed the same way",
     !/[<>&"']/.test(sym), `the client holds ${JSON.stringify(sym)}`);
  console.log(`      after JSON.parse the raw symbol is back \u2014 so every ` +
              `ticker in the config is put through the whitelist once, centrally`);
}

/*════════════ the other router, the other shape ════════════*/
head("the same page wired to the other router");
{
  /*  A whole second front door would be wasteful; the page contract answers
      directly. What is under test is the calldata, and the calldata comes
      from the config, and the config comes from the Venue.               */
  const venue02 = await c.deploy(A("src/Venue.sol", "Venue").bytecode,
    encodeAddressArg(uniFactory) + encodeAddressArg(uniQuoter) +
    encodeAddressArg(uniRouter02) + w(1) + encodeAddressArg(uniRouter02) +
    encodeAddressArg(weth) + w(0) + w(0) + w(0), "Venue02");
  const deskU02 = await c.deploy(A("src/DeskUni.sol", "DeskUni").bytecode,
    encodeAddressArg(venue02) + encodeAddressArg(pool), "DeskUni02");
  const pSwap02 = await c.deploy(A("src/PageSwap.sol", "PageSwap").bytecode,
    encodeAddressArg(site.chrome) + encodeAddressArg(pool) + encodeAddressArg(site.desk) +
    encodeAddressArg(deskU02) + encodeAddressArg(site.deskT) + encodeAddressArg(venue02),
    "PageSwap02");

  const body = decString(await c.read(pSwap02, "swap()"));
  ok("the page says which router it is wired to and what that costs",
     /SwapRouter02/.test(body) && /no deadline field/.test(body));
  ok("rather than showing a deadline box that quietly does nothing",
     /shown as inert/.test(body));

  mount(body);
  const t2 = await c.as("0x" + "bb".repeat(32));
  await c.exec(weth, "mint(address,uint256)", [t2.from.toString(), 10n ** 21n]);
  wallet(t2);
  runScripts(body);
  await nap(30);
  const $ = (i) => byId.get(i);
  eq("the client picked up the other shape", globalThis.UNI.U.kind, 1);

  $("ta").value = weth.toLowerCase();
  await $("ta").fire("change");
  $("tb").value = usdc.toLowerCase();
  await $("tb").fire("change");
  await nap(300);
  $("si").value = "2";
  await $("si").fire("input");
  await nap(900);

  await $("go").fire("click");
  await nap(200);
  await $("go").fire("click");
  await nap(200);
  await $("go").fire("click");
  await nap(400);

  const seen = await c.read(uniRouter02, "last()");
  ok("the swap reached SwapRouter02", decBool(seen, 0));
  eq("tokenIn is still tokenIn with a field removed",
     decAddr(seen, 1).toLowerCase(), weth.toLowerCase());
  eq("and the recipient did not shift by a word",
     decAddr(seen, 4).toLowerCase(), t2.from.toString().toLowerCase());
  eq("and two WETH is two WETH", decUint(seen, 6), 2n * WAD);
  console.log("      seven words instead of eight, and every field still " +
              "landed where its name says");

  /*  The negative control. If the mock accepted anything, every assertion
      above would be theatre — so the wrong shape is sent deliberately and
      must arrive wrong.                                                 */
  const wrong = globalThis.UNI.S.swap02 +
    encodeAddressArg(weth) + encodeAddressArg(usdc) + w(3000) +
    encodeAddressArg(t2.from.toString()) +
    w(Math.floor(Date.now() / 1000) + 600) +          // the extra deadline word
    w(WAD) + w(0) + w(0);
  let mangled = false;
  try {
    await t2.send({ to: uniRouter02, data: wrong, label: "wrong shape" });
    const bad = await c.read(uniRouter02, "last()");
    mangled = decUint(bad, 6) !== WAD;
  } catch (e) { mangled = true; }
  ok("sending the eight-word shape to the seven-word router does NOT arrive intact",
     mangled,
     "the mock accepted the wrong shape unchanged, so the checks above prove nothing");
  console.log("      which is exactly why the kind is stored beside the address");
}


/*════════════ the launchpad, actually driven ════════════

  Four transactions with every choice in front of them, driven the way a
  visitor would: bars dragged, boxes typed, buttons pressed. The mocks
  record what they decoded, so every field the client wrote is asserted to
  have landed under its own name — the v4 `initialize` is six flat words
  from a client with no ABI coder, which is exactly the shape of mistake
  the router drives above exist to catch.
*/
/*════════════ the seals, actually thrown ════════════

  The soulbind is the one seal a thief meets, so it is driven the way a
  thief would: bolt it, then try to move the token with an approval that
  was granted before the bolt went down. An approval is exactly what a
  drained wallet has given away, and the point of this seal is that it
  does not care.
*/

/*════════════ membership you can see, and remove ════════════

  The room page promised for a long time that a steward "can invite tokens
  to it and show them out of it", and the interface offered only half of
  that: invite was wired, evict was not even published as a selector, and
  nothing anywhere could say who was in a room to begin with — membership
  is a mapping, and a mapping is not a list.

  The fix reads the mapping directly, a window of tokens per call, from a
  companion contract that changes nothing about the archive. So this drives
  the whole loop against the chain: invite, join, see them listed, show
  them out, see them gone — and checks that the one who may do it is the
  steward and nobody else.
*/
head("who is in the room, and who may show them out");
{
  const keeper = DRIVEN;
  const guest = decUint(await c.read(nft, "totalSupply()")) > 2n ? 2 : 1;

  await c.exec(site.parley, "found(uint256,string,bool)",
    [keeper, "the drawing room", false]);
  const index = decUint(await c.read(site.parley, "groups()"));
  const key = decUint(await c.read(site.parley, "groupKey(uint256)", [index]));

  const bit = async (room, from) =>
    decUint(await c.read(site.roster, "inWindow(uint256,uint256)", [room, from]));

  ok("the steward is in the room it founded",
     (await bit(key, 1)) & (1n << BigInt(keeper - 1)));
  ok("and the guest is not", !((await bit(key, 1)) & (1n << BigInt(guest - 1))));

  /*  Invited is not the same as in: the invitation records permission and
      the token still walks in itself, because a list a stranger can grow
      is a list a stranger can fill.                                    */
  await c.exec(site.parley, "invite(uint256,uint256,uint256)", [key, keeper, guest]);
  const pending = decUint(await c.read(site.roster,
    "invitedInWindow(uint256,uint256)", [key, 1]));
  ok("an invitation shows as invited, not as present",
     (pending & (1n << BigInt(guest - 1))) !== 0n &&
     !((await bit(key, 1)) & (1n << BigInt(guest - 1))));

  await c.exec(site.parley, "join(uint256,uint256)", [key, guest]);
  ok("once it walks in, the roster says so",
     ((await bit(key, 1)) & (1n << BigInt(guest - 1))) !== 0n);
  const listed = await c.read(site.roster, "membersOf(uint256,uint256)", [key, 1]);
  ok("and the same answer arrives as a list, for a caller that would rather not shift",
     decUint(listed, 1) === 2n, `${decUint(listed, 1)} members listed`);

  await refuses("a token that does not keep the room cannot show anyone out",
    () => renter.exec(site.parley, "evict(uint256,uint256,uint256)", [key, guest, keeper]));

  await c.exec(site.parley, "evict(uint256,uint256,uint256)", [key, keeper, guest]);
  ok("the steward can, and the roster empties",
     !((await bit(key, 1)) & (1n << BigInt(guest - 1))));

  /*  And the rooms a token keeps are derivable from the token alone —
      group keys are keccak(1, index) and the indices run from one, so
      there is nothing to replay and no registry to keep in step.      */
  const mine = await c.read(site.roster, "stewardedBy(uint256,uint256,uint256)",
    [keeper, 1, 32]);
  ok("the rooms a token keeps are found from the token alone",
     decUint(mine, 2) >= 1n, `${decUint(mine, 2)} rooms`);

  /*  The commons is not a room anyone joined. Parley waves every token
      through it by key alone and never writes the mapping, so a roster
      that consulted the mapping would report the room holding the entire
      collection as empty — and it did, live on Base Sepolia, before this.
      The bug is worth a test of its own because the wrong answer is not a
      revert or a blank: it is a confident sentence saying nobody is here,
      about a room containing everybody.                                */
  const supply = decUint(await c.read(nft, "totalSupply()"));
  const commons = await bit(0n, 1);
  let everyone = true;
  for (let i = 0n; i < supply && i < 256n; i++)
    if (!((commons >> i) & 1n)) everyone = false;
  ok("the commons holds every token, not none of them",
     everyone && commons !== 0n, `${supply} minted, bitmap ${commons.toString(16)}`);
  ok("and a token nobody minted is not in it",
     !((commons >> supply) & 1n));

  /*  Which is only safe to say because the four cases are told apart. An
      unfounded key reads back with kind zero from Parley, and kind zero is
      also the commons — so a reader who did not ask would be told an
      invented key names the room that holds everybody.               */
  const kind = async (r) => decUint(await c.read(site.roster, "kindOf(uint256)", [r]));
  ok("the commons, a group and a key nobody founded are three different answers",
     (await kind(0n)) === 0n && (await kind(key)) === 1n &&
     (await kind(0xf00dn)) === 3n,
     `${await kind(0n)} / ${await kind(key)} / ${await kind(0xf00dn)}`);
  ok("and a room nobody founded holds nobody",
     (await bit(0xf00dn, 1)) === 0n);
  console.log("      invited, joined, listed, shown out \u2014 over a Parley nothing changed");
}

head("driving the seals");
{
  const page = await GET(["seal"]);
  eq("/seal answers 200", page.status, 200);
  mount(page.body);
  wallet(c);
  runScripts(page.body);
  await nap(60);
  const $ = (i) => byId.get(i);

  await $("zbolt").fire("click");            // the first press only connects
  await nap(200);
  $("zid").value = String(DRIVEN);
  await $("zid").fire("change");
  await nap(400);
  ok("it reads the token's three states", /\w/.test(String($("zst").textContent || "") +
     String($("zst").innerHTML || "")), "the state block stayed empty");

  const was = decBool(await c.read(nft, "locked(uint256)", [DRIVEN]));
  await $("zbolt").fire("click");
  await nap(300);
  eq("the bolt flips on chain, not on screen",
     decBool(await c.read(nft, "locked(uint256)", [DRIVEN])), !was);

  /*  The drain that this defeats: an operator who already holds an
      approval, which is what a phished signature hands over.          */
  await c.exec(nft, "approve(address,uint256)", [renter.from.toString(), DRIVEN]);
  await refuses("a bolted token will not move even for an approved operator",
    () => renter.exec(nft, "transferFrom(address,address,uint256)",
      [c.from.toString(), renter.from.toString(), DRIVEN]));
  ok("and the thief cannot unbolt it, because they do not hold it",
     !(await (async () => { try {
       await renter.exec(nft, "unlock(uint256)", [DRIVEN]); return true;
     } catch { return false; } })()));

  await $("zbolt").fire("click");
  await nap(300);
  eq("the holder lifts it again, as many times as they like",
     decBool(await c.read(nft, "locked(uint256)", [DRIVEN])), was);
  await c.exec(nft, "approve(address,uint256)", ["0x" + "00".repeat(20), DRIVEN]);
  console.log("      bolted, refused an approved operator, refused the thief, lifted");
}


/*════════════ the estate, driven ════════════

  Two arrangements that move a token when its holder is not standing next
  to it, so both are worth driving through the page rather than through the
  ABI: the page builds its own calldata out of selectors it read off a
  contract, and the only proof that it built the right words is asking the
  contract afterwards what it thinks it was told.

  The interesting assertion is the last one. `arrange` takes an address and
  a token id and the page decides which the person meant from what they
  typed; get that backwards and somebody's estate goes to address zero
  without a revert anywhere.
*/
head("driving the estate");
{
  /*  The page computes every date from the browser's wall clock, because
      that is the clock a person reads. This chain starts well behind it,
      so a thirty-day term measured from wall-now is more than two years
      away measured from the chain — past the ceiling, and refused. The
      page is right; the harness is the thing that is out of step, so the
      harness is what moves. (The session-key drive below does the same,
      for the same reason, and warping forward twice is harmless.)     */
  warp(BigInt(Math.floor(Date.now() / 1000)));

  const page = await GET(["estate"]);
  eq("/estate answers 200", page.status, 200);
  ok("the page names both contracts it drives",
     page.body.includes(site.succession.slice(2).toLowerCase()) &&
     page.body.includes(site.consign.slice(2).toLowerCase()));
  mount(page.body);
  wallet(c);
  runScripts(page.body);
  await nap(60);
  const $ = (i) => byId.get(i);

  const ESTATE = DRIVEN;
  await $("qarr").fire("click");              // the first press only connects
  await nap(200);
  $("qid").value = String(ESTATE);
  await $("qid").fire("input");
  await nap(400);
  ok("it reads who holds the token and whether the succession is approved",
     /held by/.test(String($("qst").innerHTML || "")), String($("qst").innerHTML || "").slice(0, 80));

  /*  A token number in the heir box means a token, not an address parsed
      as one. Nothing reverts if this is wrong — the estate simply goes to
      a wallet nobody has the key to.                                   */
  $("qto").value = "#2";
  await $("qto").fire("input");
  $("qqR").value = "60";
  await $("qqR").fire("input");
  $("qnR").value = "30";
  await $("qnR").fire("input");
  await nap(200);
  await $("qarr").fire("click");
  await nap(400);

  const plan = await c.read(site.succession, "planOf(uint256)", [ESTATE]);
  eq("the arrangement landed, made by the holder",
     decAddr(plan, 0).toLowerCase(), c.from.toString().toLowerCase());
  eq("and a token number in the heir box arrived as a token, not as an address",
     decUint(plan, 2), 2n);
  eq("the address slot is left empty, as it must be when a token is named",
     decAddr(plan, 1).toLowerCase(), "0x" + "00".repeat(20));
  eq("the silence is the one the bar was dragged to",
     decUint(plan, 3), 60n * 86400n);
  eq("and the heir resolves to whoever holds that token",
     decAddr(await c.read(site.succession, "heirOf(uint256)", [ESTATE])).toLowerCase(),
     decAddr(await c.read(nft, "ownerOf(uint256)", [2])).toLowerCase());

  /*  With no approval standing, the plan is inert and the page must say
      which of the nine things is wrong rather than looking healthy.   */
  eq("with no approval the contract reports the plan as unable to move anything",
     decUint(await c.read(site.succession, "wouldPass(uint256)", [ESTATE])), 3n);
  await $("qapp").fire("click");
  await nap(400);
  eq("and the page's own approve button fixes exactly that",
     decAddr(await c.read(nft, "getApproved(uint256)", [ESTATE])).toLowerCase(),
     site.succession.toLowerCase());

  /*  Both tokens are held by the same wallet here, so the heir resolves to
      the owner — which is not an inheritance, and the contract says so
      rather than waiting to revert on the day. Worth asserting: a plan
      that leaves a token to its own holder is the quiet failure this
      status code exists to catch.                                     */
  eq("an heir token held by the owner is reported as no inheritance at all",
     decUint(await c.read(site.succession, "wouldPass(uint256)", [ESTATE])), 6n);

  /*  The other shape of the same field: an address, typed as an address. */
  $("qto").value = renter.from.toString();
  await $("qto").fire("input");
  await nap(300);
  await $("qarr").fire("click");
  await nap(400);
  const plan2 = await c.read(site.succession, "planOf(uint256)", [ESTATE]);
  eq("an address in the same box arrives as an address",
     decAddr(plan2, 1).toLowerCase(), renter.from.toString().toLowerCase());
  eq("with the token slot empty this time", decUint(plan2, 2), 0n);
  eq("and now the plan waits on silence and nothing else",
     decUint(await c.read(site.succession, "wouldPass(uint256)", [ESTATE])), 7n);

  await c.exec(site.succession, "revoke(uint256)", [ESTATE]);
  await c.exec(nft, "approve(address,uint256)", ["0x" + "00".repeat(20), ESTATE]);

  /*  The window. One press has to do two transactions — an approval alone
      is meaningless here — and the terms have to arrive as written.   */
  $("cid").value = String(ESTATE);
  await $("cid").fire("input");
  $("cag").value = renter.from.toString();
  await $("cag").fire("input");
  $("cfl").value = "0.5";
  await $("cfl").fire("input");
  $("ccR").value = "1000";
  await $("ccR").fire("input");
  $("ctR").value = "30";
  await $("ctR").fire("input");
  await nap(400);
  await $("ccon").fire("click");
  await nap(800);

  const note = await c.read(site.consign, "noteOf(uint256)", [ESTATE]);
  eq("the token is in escrow",
     decAddr(await c.read(nft, "ownerOf(uint256)", [ESTATE])).toLowerCase(),
     site.consign.toLowerCase());
  eq("consigned by the holder", decAddr(note, 0).toLowerCase(), c.from.toString().toLowerCase());
  eq("to the agent that was typed", decAddr(note, 1).toLowerCase(),
     renter.from.toString().toLowerCase());
  eq("with the floor the field carried, in wei", decUint(note, 2), 5n * 10n ** 17n);
  eq("and the cut the bar was dragged to", decUint(note, 5), 1000n);
  eq("while the seller keeps the use of it",
     decAddr(await c.read(nft, "userOf(uint256)", [ESTATE])).toLowerCase(),
     c.from.toString().toLowerCase());

  await renter.exec(site.consign, "release(uint256)", [ESTATE]);
  eq("and the agent hands it back",
     decAddr(await c.read(nft, "ownerOf(uint256)", [ESTATE])).toLowerCase(),
     c.from.toString().toLowerCase());
  console.log("      a will written through the page, and a consignment opened and closed");
}

/*════════════ session keys, actually granted ════════════

  The grant is two dynamic arrays in one call, and the two are encoded
  differently: an address is right-aligned in its word and a bytes4 is
  left-aligned. Getting that backwards does not revert — it grants a
  permission nobody chose. So the page's own grant is sent, and then the
  account is asked what it believes it permits, selector by selector.
*/
head("driving the session keys");
{
  const page = await GET(["keys"]);
  eq("/keys answers 200", page.status, 200);
  ok("and says the two things that have bitten people",
     /empty/i.test(page.body) && /bytes4\(0\)|bare value/i.test(page.body));

  mount(page.body);
  wallet(c);
  runScripts(page.body);
  await nap(60);
  const $ = (i) => byId.get(i);

  /*  The card computes its expiry from the clock in front of the person,
      and this chain is born a year and a half behind that. An expiry the
      slider calls "tomorrow" is therefore eighteen months out to the
      account, which refuses anything past MAX_SESSION — so the two clocks
      are brought into agreement before a session is asked for at all.
      Nothing about the page is being adjusted here; the harness is.    */
  warp(BigInt(Math.floor(Date.now() / 1000)));

  const reach = decAddr(await c.read(nft, "account(uint256)", [DRIVEN]));
  if ((await c.codeSize(reach)) === 0) {
    await c.exec(nft, "embody(uint256)", [DRIVEN]);
  }

  await $("kgo").fire("click");              // the first press only connects
  await nap(200);
  $("ktok").value = String(DRIVEN);
  await $("ktok").fire("change");
  await nap(400);
  ok("the page found the token's Reach",
     String($("kacct").textContent || $("kacct").innerHTML || "")
       .toLowerCase().includes(reach.slice(2, 10).toLowerCase()),
     String($("kacct").textContent || $("kacct").innerHTML || "").slice(0, 80));

  const keyAddr = "0x" + "5a".repeat(20);
  $("kkey").value = keyAddr;
  await $("kkey").fire("input");
  $("ktgt").value = pool;
  await $("ktgt").fire("input");

  /*  One chip, pressed: the pool's own swap. Whatever the page grants
      must be exactly this and nothing adjacent.                       */
  const chips = globalThis.document.querySelectorAll("[data-sel]");
  ok("the permissions are offered as chips carrying their selectors",
     chips.length >= 4, `${chips.length} chips`);
  const swapSel = evm.sel("swap(uint256,bool,uint256,uint256,address,uint256)");
  const chip = chips.find((x) => String(x.dataset.sel || "").toLowerCase() === swapSel);
  ok("including the pool's swap, hashed on chain", !!chip,
     chips.map((x) => x.dataset.sel).join(" "));
  await chip.fire("click");
  await nap(60);

  await $("kgo").fire("click");
  await nap(500);

  const allows = async (target, s) => decBool(await c.read(reach,
    "sessionAllows(address,address,bytes4)", [keyAddr, target, s]));
  ok("the account permits exactly the selector that was chosen",
     await allows(pool, swapSel));
  ok("and not one the person never pressed",
     !(await allows(pool, evm.sel("withdraw(uint256,uint256,uint256,address)"))));
  ok("and not the same selector at another address",
     !(await allows(nft, swapSel)));
  console.log("      granted one permission at one address, and the account agrees");

  await $("krev").fire("click");
  await nap(400);
  ok("revoking takes it back", !(await allows(pool, swapSel)));
}


/*════════════ a name, actually bound ════════════

  The client builds DNS wire format with string arithmetic because it
  carries no keccak — so the proof that it built it right is that the
  contract, which does hash, agrees about which node it meant.
*/
head("driving the nameplate page");
{
  /*  The site's own resolver has no registry on this chain, and the page
      must say so rather than offer buttons that always revert.        */
  const bare = await GET(["name"]);
  eq("/name answers 200", bare.status, 200);
  ok("with no registry here, it says so instead of offering controls",
     /no ENS|no registry|not deployed/i.test(bare.body), "no honest refusal found");

  /*  And the same page against a resolver that does have one.        */
  const mockEns2 = await c.deploy(A("test/mocks/MockENS.sol", "MockENS").bytecode, "", "MockENS2");
  const plate2 = await c.deploy(A("src/Nameplate.sol", "Nameplate").bytecode,
    encodeAddressArg(mockEns2) + encodeAddressArg(nft) + encodeAddressArg(site.premises),
    "Nameplate3");
  const pName2 = await c.deploy(A("src/PageName.sol", "PageName").bytecode,
    encodeAddressArg(site.chrome) + encodeAddressArg(site.desk) +
    encodeAddressArg(plate2) + encodeAddressArg(nft), "PageName2");

  const body = decString(await c.read(pName2, "namePage()"));
  ok("with a registry, the page offers to bind", /bind/i.test(body));

  const dnsOf = (nm) => "0x" + nm.split(".").map(
    (l) => l.length.toString(16).padStart(2, "0") +
           Buffer.from(l, "utf8").toString("hex")).join("") + "00";
  const wire = dnsOf("mine.eth");
  const node = await c.read(plate2, "nodeOf(bytes)", [wire]);
  await c.exec(mockEns2, "setOwner(bytes32,address)", [node, c.from.toString()]);

  mount(body);
  wallet(c);
  runScripts(body);
  await nap(60);
  const $ = (i) => byId.get(i);

  await $("ngo").fire("click");              // the first press only connects
  await nap(200);
  $("nnm").value = "mine.eth";
  await $("nnm").fire("input");
  await nap(700);
  ok("the client shows the very bytes the test encoded independently",
     String($("nwire").innerHTML || "").toLowerCase().includes(wire.slice(2)),
     `${String($("nwire").innerHTML || "").slice(0, 80)} vs ${wire}`);

  $("ntok").value = String(DRIVEN);
  await $("ntok").fire("input");
  await $("ngo").fire("click");
  await nap(500);

  eq("the name the client encoded is the name the contract hashed",
     decUint(await c.read(plate2, "tokenForName(bytes)", [wire])), BigInt(DRIVEN));
  eq("and it answers with the token's own account",
     decAddr(await c.read(plate2, "addr(bytes32)", [node])).toLowerCase(),
     decAddr(await c.read(nft, "account(uint256)", [DRIVEN])).toLowerCase());

  const cc = decString(await c.read(plate2, "text(bytes32,string)", [node, "contentcontract"]));
  ok("and carries the ERC-6821 record that points a browser at this site",
     cc.toLowerCase().includes(site.premises.toLowerCase().slice(2)), cc);

  await $("nun").fire("click");
  await nap(400);
  eq("unbinding gives the name back", decUint(await c.read(plate2, "tokenForName(bytes)", [wire])), 0n);
  console.log("      built the wire by hand, and the contract that hashes agreed");

  /*───── the clock, driven ─────*/
  /*  Every assertion above still passing is itself the proof the script
      did not die on load — which is how the last page bug hid behind six
      green string tests. What is checked here is the new control's own
      behaviour: that it refuses honestly before it is told where renewals
      go, and reads a real date once a registrar exists.               */
  ok("the page offers a renewal", /Renew a name/i.test(body));
  ok("and says plainly that anyone may pay it",
     /permissionless/i.test(body) && /anyone/i.test(body));

  $("nrn").value = "mine.eth";
  await $("nrn").fire("input");
  await nap(700);
  const noRenewer = String($("nrdet").innerHTML || "");
  ok("with no renewer set it refuses rather than building a transaction to nowhere",
     /no renewer set/i.test(noRenewer), noRenewer.slice(0, 120));
  eq("and the button stays disabled", $("nrgo").disabled, true);

  /*  Now a registrar, so the date is real. The registry is the authority
      on which registrar is current, so that is where it is put.       */
  const reg2 = await c.deploy(A("test/mocks/MockRegistrar.sol", "MockRegistrar").bytecode, "", "Registrar3");
  const ethNode = "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae";
  await c.exec(mockEns2, "setOwner(bytes32,address)", [ethNode, reg2]);
  const lh2 = "0x" + Buffer.from(keccak256(Buffer.from("mine", "utf8"))).toString("hex");
  const then = Number(evm.BLOCK.header.timestamp) + 86400 * 400;
  await c.exec(reg2, "setExpiry(uint256,uint256)", [BigInt(lh2), then]);

  $("nry").value = "3";
  await $("nry").fire("input");
  await nap(800);
  const dated = String($("nrdet").innerHTML || "");
  ok("with a registrar, the page shows the date the name lapses",
     dated.includes(new Date(then * 1000).toISOString().slice(0, 10)), dated.slice(0, 160));
  ok("and still says where it cannot renew", /no renewer set/i.test(dated), dated.slice(0, 160));
  console.log("      the expiry is read from the registrar the registry names");
}

head("driving the launchpad");
let gateAt = null;
{
  const page = await GET(["launch"]);
  eq("/launch answers 200", page.status, 200);
  ok("the bars are real controls, not pictures",
     (page.body.match(/type=range/g) || []).length >= 4,
     `${(page.body.match(/type=range/g) || []).length} range inputs`);

  mount(page.body);
  const W = wallet(c);
  runScripts(page.body);
  await nap(60);
  const $ = (i) => byId.get(i);

  /* the terminal minted this token and c holds it — it signs the launch */
  const myTok = decUint(await c.read(nft, "totalSupply()"));
  $("ct").value = String(myTok);
  $("cn").value = "Launch Coin";
  $("cs").value = "LNCH";

  /*  The hook picker. It was added with its first paint bound beside its
      own definition, where it reached a `const` that had not been reached
      yet — and because that throws at load rather than on click, it took
      every other button on the page down with it. Nothing in the markup
      looked wrong; the script simply never finished. So the picker is
      driven here, in a page that has actually run.                     */
  ok("the page offers a choice of hook", !!$("hk"),
     "no hook picker — the launchpad can only ever mine a gate");
  ok("the gate's controls are the ones showing at rest",
     $("hkg") && $("hkg").style.display !== "none");
  ok("and the fee band is put away until it is asked for",
     $("hkf") && $("hkf").style.display === "none");

  $("hk").value = "1";
  await $("hk").fire("change");
  await nap(60);
  ok("choosing the Facet brings out the fee band",
     $("hkf") && $("hkf").style.display !== "none",
     "the band controls stayed hidden — the picker did not switch");
  ok("and puts the gate's dates away",
     $("hkg") && $("hkg").style.display === "none");
  ok("the band has a floor, a ceiling and a token to read them against",
     !!($("ffl") && $("fcl") && $("ft")));

  $("hk").value = "0";
  await $("hk").fire("change");
  await nap(60);
  ok("and it switches back", $("hkg") && $("hkg").style.display !== "none");

  $("cvR").value = "120";
  await $("cvR").fire("input");
  eq("the supply bar is logarithmic and writes the box", $("cv").value, "1000000000000");
  $("cv").value = "1000000";
  await $("cv").fire("input");

  await $("cchk").fire("click");
  await nap(60);
  const landed = ($("cpre").innerHTML.match(/0x[0-9a-f]{40}/) || [])[0];
  ok("`where would it land` answered from the kiln, nothing sent",
     !!landed, $("cpre").innerHTML.slice(0, 120));

  /*──── the dynamic-fee guard, before any hook exists ────*/
  $("pq").value = usdc.toLowerCase();
  $("pp").value = "1";
  $("pfd").checked = true;
  await $("pfd").fire("change");
  eq("the dynamic checkbox writes the sentinel fee", $("pf").value, "8388608");
  const sent0 = W.sent();
  await $("pgo").fire("click");
  await nap(60);
  eq("a dynamic fee with no hook sends nothing — a pool nothing can ever price",
     W.sent(), sent0);
  ok("and the manager was never reached",
     !decBool(await c.read(uniManager, "last()"), 0));
  $("pfd").checked = false;
  await $("pfd").fire("change");

  /*──── the gate on the kiln itself ────*/
  $("ct").value = "999999";
  await $("cgo").fire("click");
  await nap(150);
  eq("a token you do not hold cannot sign a launch",
     decUint(await c.read(site.kiln, "coinCount()")), 1n);
  $("ct").value = String(myTok);

  await $("cgo").fire("click");
  await nap(200);
  eq("the launch fired through the kiln", decUint(await c.read(site.kiln, "coinCount()")), 2n);
  const coin = decAddr(await c.read(site.kiln, "recent(uint256,uint256)", [0, 1]), 2);
  eq("and landed exactly where the page said it would", coin.toLowerCase(), landed);
  eq("attributed to the signing token",
     decUint(await c.read(site.kiln, "launchedBy(address)", [coin])), myTok);
  eq("with the whole supply in the launcher's wallet",
     decUint(await c.read(coin, "balanceOf(address)", [c.from.toString()])),
     1_000_000n * WAD);

  /*──── the hook: the ten-year bar, the mine, the deploy ────*/
  $("hlR").value = "3650";
  await $("hlR").fire("input");
  eq("the liquidity bar runs to ten years and writes the box", $("hl").value, "3650");
  ok("and the page says both dates out loud",
     /trading opens/.test($("hsum").innerHTML) && /liquidity unlocks/.test($("hsum").innerHTML),
     $("hsum").innerHTML.slice(0, 160));
  $("hl").value = "30"; await $("hl").fire("input");
  $("ho").value = "1";  await $("ho").fire("input");

  await $("hmine").fire("click");
  await nap(600);
  ok("the salt was mined by the node itself, under eth_call",
     /found after/.test($("hmined").innerHTML), $("hmined").innerHTML.slice(0, 160));
  gateAt = ($("hmined").innerHTML.match(/the hook would live at<\/span><b>(0x[0-9a-f]{40})/) || [])[1]
        || ($("hmined").innerHTML.match(/0x[0-9a-f]{40}/g) || []).pop();
  ok("and the deploy button armed", $("hgo").disabled === false);

  await $("hgo").fire("click");
  await nap(200);
  ok("the gate was deployed at the mined address", (await c.codeSize(gateAt)) > 0);
  eq("whose low fourteen bits are exactly beforeSwap + beforeRemoveLiquidity",
     "0x" + (BigInt(gateAt) & 0x3fffn).toString(16), "0x280");
  const opens = decUint(await c.read(gateAt, "OPENS()"));
  const unlocks = decUint(await c.read(gateAt, "UNLOCKS()"));
  ok("both timestamps immutable, the unlock after the open",
     opens > 0n && unlocks > opens, `opens ${opens} unlocks ${unlocks}`);
  const st = await c.read(gateAt, "status()");
  ok("and the gate reports shut, because only the clock opens it",
     !decBool(st, 0) && !decBool(st, 1));

  /*──── the fee bar, then the pool, field by field ────*/
  $("pfR").value = "400";
  await $("pfR").fire("input");
  eq("the fee bar is logarithmic: 400 of 600 lands on 1.00%", $("pf").value, "10000");
  eq("and the label says so", $("pfl").textContent, "1.00%");
  $("pf").value = "3000";
  await $("pf").fire("input");
  eq("typing snaps the label back", $("pfl").textContent, "0.30%");

  $("ps").value = "60"; await $("ps").fire("input");
  await $("pgo").fire("click");
  await nap(300);

  const seen = await c.read(uniManager, "last()");
  ok("initialize reached the PoolManager", decBool(seen, 0), "it never arrived");
  const lo = coin.toLowerCase() < usdc.toLowerCase() ? coin : usdc;
  const hi = lo === coin ? usdc : coin;
  eq("currency0 is the lower address", decAddr(seen, 1).toLowerCase(), lo.toLowerCase());
  eq("currency1 is the higher", decAddr(seen, 2).toLowerCase(), hi.toLowerCase());
  eq("the fee arrived as the fee", decUint(seen, 3), 3000n);
  eq("the spacing arrived as the spacing", decUint(seen, 4), 60n);
  eq("the hook is the gate that was just mined", decAddr(seen, 5).toLowerCase(), gateAt);
  /* one LNCH = one USDC, mirrored through the same arithmetic the client runs */
  const d0 = lo === coin ? 18 : 6, d1 = lo === coin ? 6 : 18;
  const tick = Math.round(Math.log(Math.pow(10, d1 - d0)) / Math.log(1.0001));
  const snapped = Math.round(tick / 60) * 60;
  const w2c = (v) => ((1n << 256n) + BigInt(v)).toString(16).padStart(64, "0").slice(-64);
  const sq = decUint(await c.call(site.venue, evm.sel("sqrtAt(int24)") + w2c(snapped)));
  eq("and the price is the venue's own sqrt of the snapped tick", decUint(seen, 6), sq);
  console.log("      six flat words: currencies sorted, fee, spacing, the mined hook, the price");
}

/*════════════ the hook reader ════════════*/
head("what the address already says");
{
  const hp = await GET(["hook", gateAt]);
  eq("/hook/<the gate> answers 200", hp.status, 200);
  ok("and reads both powers off the address, with no call",
     /CAN REFUSE OR REPRICE EVERY SWAP/.test(hp.body) &&
     /CAN REFUSE LIQUIDITY BEING TAKEN OUT/.test(hp.body));
  ok("and says the half that is not reassuring",
     /same address shape/.test(hp.body));

  const mixed = "0x" + gateAt.slice(2).toUpperCase();
  const mv = await GET(["hook", mixed]);
  eq("a checksummed spelling is a different URL and gets moved", mv.status, 301);
  ok("to the one canonical address", JSON.stringify(mv.headers).includes(gateAt));

  const ask = await GET(["hook"]);
  ok("bare /hook explains itself", /read a hook/i.test(ask.body));

  const inert = await GET(["hook", "0x" + "1".repeat(36) + "0000"]);
  ok("an address with no flag bits is called what it is: not a hook",
     /not a hook/.test(inert.body));
}

/*════════════ the vault, actually driven ════════════

  Ten years on a slider, and then the only three facts that matter, each
  proven the hard way: it cannot come out early, it cannot come out to
  anyone else, and at term it comes out to the wei. The clock is moved
  forward rather than waited on, which is the one luxury a test chain has.
*/
head("driving the vault");
{
  const page = await GET(["lock"]);
  eq("/lock answers 200", page.status, 200);
  ok("ten years sits on the bar itself", /max=3650/.test(page.body));

  mount(page.body);
  const saver = await c.as("0x" + "cc".repeat(32));
  await c.exec(weth, "mint(address,uint256)", [saver.from.toString(), 10n ** 20n]);
  const W = wallet(saver);
  runScripts(page.body);
  await nap(60);
  const $ = (i) => byId.get(i);

  $("ldR").value = "3650";
  await $("ldR").fire("input");
  eq("the bar writes the box", $("ld").value, "3650");
  ok("and the page answers with a date, not a number",
     /until 20\d\d-\d\d-\d\d/.test($("ldd").textContent), $("ldd").textContent);
  $("ld").value = "365";
  await $("ld").fire("input");
  eq("typing writes the bar back", $("ldR").value, "365");

  $("lt").value = weth.toLowerCase();
  await $("lt").fire("change");
  await nap(150);
  ok("the token was asked what it is", /WETH/.test($("ltok").innerHTML),
     $("ltok").innerHTML.slice(0, 120));

  $("la").value = "5";
  await $("la").fire("input");

  await $("lgo").fire("click");                     // connect, then approve
  await nap(250);
  eq("the first press approved the vault for exactly the amount",
     decUint(await c.read(weth, "allowance(address,address)",
       [saver.from.toString(), site.locker])), 5n * WAD);

  await $("lgo").fire("click");                     // lock
  await nap(250);
  eq("the lock is in the vault", decUint(await c.read(site.locker, "count()")), 2n);
  eq("and the ledger holds both locks to the wei",
     decUint(await c.read(site.locker, "totalLocked(address)", [weth])),
     5n * WAD + 1_000_000n);

  const at = await c.read(site.locker, "lockAt(uint256)", [1]);
  eq("recorded at what arrived", decUint(at, 2), 5n * WAD);
  const until = decUint(at, 3);

  await refuses("it cannot come out early — no such function exists to call",
    () => saver.exec(site.locker, "claim(uint256)", [1]), "0x1c9cc458");   // NotYet()
  await refuses("it cannot come out to anyone else",
    () => renter.exec(site.locker, "claim(uint256)", [1]), "0x4a636d30");   // NotYours()
  await refuses("the date cannot be brought nearer",
    () => saver.exec(site.locker, "extend(uint256,uint64)", [1, until - 1000n]), "0x227d0670");   // OnlyLonger()
  await refuses("and nothing locks past ten years from now",
    () => saver.exec(site.locker, "lock(address,uint256,uint64)",
      [weth, 1n, until + 3651n * 86400n]), "0x4ee45b56");   // TooLong()

  warp(until + 1n);
  const before = decUint(await c.read(weth, "balanceOf(address)", [saver.from.toString()]));
  await saver.exec(site.locker, "claim(uint256)", [1]);
  eq("at term, the clock lets it out to the wei",
     decUint(await c.read(weth, "balanceOf(address)", [saver.from.toString()])) - before,
     5n * WAD);
  await refuses("and only once",
    () => saver.exec(site.locker, "claim(uint256)", [1]), "0x646cf558");   // AlreadyClaimed()
  eq("the ledger followed it out",
     decUint(await c.read(site.locker, "totalLocked(address)", [weth])), 1_000_000n);
  console.log("      locked, refused early, refused to a stranger, out at term to the wei");

  /*──── a lock is a position, and a position changes hands ────*/
  /*  The chain was just warped a year past the wall clock, and the page
      computes its date from the wall — so the bar must reach past the
      warp for the vault to see a future at all.                        */
  $("ld").value = "800";
  await $("ld").fire("input");
  $("la").value = "3";
  await $("la").fire("input");
  await $("lgo").fire("click");                    // approve (fresh amount)
  await nap(250);
  await $("lgo").fire("click");                    // lock → id 2
  await nap(250);
  eq("a second lock landed", decUint(await c.read(site.locker, "count()")), 3n);

  const giveBtn = $("llist").querySelectorAll("button")
    .find((b) => b.dataset.act === "give" && b.dataset.id === "2");
  ok("the open lock offers to be given", !!giveBtn);
  await giveBtn.fire("click");
  ok("which reveals the hand-over panel", $("gpanel").hidden === false);
  $("gto").value = renter.from.toString();
  await $("ggo").fire("click");
  await nap(250);

  const l2 = await c.read(site.locker, "lockAt(uint256)", [2]);
  eq("the vault now answers to the new owner",
     decAddr(l2, 1).toLowerCase(), renter.from.toString().toLowerCase());
  await refuses("and no longer to the old one",
    () => saver.exec(site.locker, "claim(uint256)", [2]), "0x4a636d30");   // NotYours()
  const u2 = decUint(l2, 3);
  warp(u2 + 1n);
  const rBefore = decUint(await c.read(weth, "balanceOf(address)", [renter.from.toString()]));
  await renter.exec(site.locker, "claim(uint256)", [2]);
  eq("who claims it at term, to the wei",
     decUint(await c.read(weth, "balanceOf(address)", [renter.from.toString()])) - rBefore,
     3n * WAD);
  await refuses("a claimed lock cannot be given",
    () => renter.exec(site.locker, "give(uint256,address)",
      [2, buyer.from.toString()]), "0x646cf558");                          // AlreadyClaimed()

  /*──── the permit path fails soft, exactly as designed ────*/

  /*  This token has no permit. lockWithPermit swallows the failed permit
      call and proceeds on whatever allowance exists — so with one it
      locks, and without one it refuses at the transfer, which is the
      difference between resilient and credulous.                       */
  await saver.exec(weth, "approve(address,uint256)", [site.locker, WAD]);
  const nowChain = evm.BLOCK.header.timestamp;
  await saver.exec(site.locker,
    "lockWithPermit(address,uint256,uint64,uint256,uint8,bytes32,bytes32)",
    [weth, WAD, nowChain + 86400n, 0n, 27n, "0x" + "11".repeat(32), "0x" + "22".repeat(32)]);
  eq("a dead permit does not kill a lock that has its allowance",
     decUint(await c.read(site.locker, "count()")), 4n);
  await refuses("and without the allowance the lock refuses at the transfer",
    () => saver.exec(site.locker,
      "lockWithPermit(address,uint256,uint64,uint256,uint8,bytes32,bytes32)",
      [weth, WAD, nowChain + 86400n, 0n, 27n, "0x" + "11".repeat(32), "0x" + "22".repeat(32)]),
    "0x90b8ec18");   // TransferFailed()
  console.log("      given away, claimed by its new owner, and the permit path fails soft");
}


/*════════════ the nameplate, actually resolved ════════════

  ENS asks a resolver three questions and believes the answers. So the
  answers are checked against the chain the way an ENS client would ask
  them — including the ENSIP-10 wildcard path with a DNS-encoded name,
  because a namehash computed one byte off is a name that resolves for
  nobody and reverts for no one.
*/
head("the nameplate answers for the collection");
{
  /*  The site's own nameplate deployed with no registry: binding refuses
      and says why, which is what an L2 without ENS should hear.        */
  await refuses("with no registry here, binding refuses honestly",
    () => c.exec(site.nameplate, "bind(bytes32,uint256)", ["0x" + "ab".repeat(32), 1]),
    "0x88f0c90d");   // NoRegistryHere()

  /*  And one wired to a registry, for the full conversation. */
  const mockEns = await c.deploy(A("test/mocks/MockENS.sol", "MockENS").bytecode, "", "MockENS");
  const plate = await c.deploy(A("src/Nameplate.sol", "Nameplate").bytecode,
    encodeAddressArg(mockEns) + encodeAddressArg(nft) + encodeAddressArg(site.premises),
    "Nameplate2");

  const label = (t) => "0x" + Buffer.from(keccak256(Buffer.from(t, "utf8"))).toString("hex");
  const nhash = (parts) => parts.reduceRight(
    (node, p) => "0x" + Buffer.from(keccak256(Buffer.from(
      node.slice(2) + label(p).slice(2), "hex"))).toString("hex"),
    "0x" + "00".repeat(32));
  const dns = (nm) => "0x" + nm.split(".").map(
    (l) => l.length.toString(16).padStart(2, "0") +
           Buffer.from(l, "utf8").toString("hex")).join("") + "00";

  const myNode = nhash(["mine", "eth"]);
  await refuses("a name you do not own cannot be bound",
    () => renter.exec(plate, "bind(bytes32,uint256)", [myNode, 1]), "0x5b209b83");   // NotTheNameOwner()
  await c.exec(mockEns, "setOwner(bytes32,address)", [myNode, renter.from.toString()]);
  await refuses("owning the name is not enough without the token",
    () => renter.exec(plate, "bind(bytes32,uint256)", [myNode, 1]), "0xdb970f63");   // NotTheTokenHolder()

  await c.exec(mockEns, "setOwner(bytes32,address)", [myNode, c.from.toString()]);
  await c.exec(plate, "bind(bytes32,uint256)", [myNode, 1]);
  eq("bound, the name answers with the token's own account",
     decAddr(await c.read(plate, "addr(bytes32)", [myNode])).toLowerCase(),
     decAddr(await c.read(nft, "account(uint256)", [1])).toLowerCase());

  const cc = decString(await c.read(plate, "text(bytes32,string)", [myNode, "contentcontract"]));
  eq("text(contentcontract) is the ERC-6821 record, chain-scoped, to this site",
     cc, "eth:" + site.premises.toLowerCase());
  ok("which is an ERC-3770 chain-specific address, not a CAIP identifier",
     !cc.startsWith("eip155:") && cc.split(":").length === 2, cc);
  const av = decString(await c.read(plate, "text(bytes32,string)", [myNode, "avatar"]));
  ok("and the avatar is the token itself, as ENS apps draw one",
     av === "eip155:1/erc721:" + nft.toLowerCase() + "/1", av);

  /*──── the wildcard: every token has a name the moment it exists ────*/
  const parent = nhash(["ipseity", "eth"]);
  await refuses("the parent slot needs the parent's owner",
    () => renter.exec(plate, "claimParent(bytes32)", [parent]), "0x5b209b83");   // NotTheNameOwner()
  await c.exec(mockEns, "setOwner(bytes32,address)", [parent, c.from.toString()]);
  await c.exec(plate, "claimParent(bytes32)", [parent]);
  await refuses("and is written once",
    () => c.exec(plate, "claimParent(bytes32)", [parent]), "0x368c18e3");   // ParentAlreadyClaimed()

  const sub = dns("2.ipseity.eth");
  eq("2.ipseity.eth means token 2, with no registration at all",
     decUint(await c.read(plate, "tokenForName(bytes)", [sub])), 2n);
  const addrCall = evm.sel("addr(bytes32)") + "00".repeat(32);
  const res = await c.read(plate, "resolve(bytes,bytes)", [sub, addrCall]);
  /* resolve() returns abi-encoded bytes; the answer sits one layer in */
  const inner = "0x" + String(res).slice(2 + 128);
  eq("and ENSIP-10 resolve hands back its account",
     ("0x" + inner.slice(26, 66)).toLowerCase(),
     decAddr(await c.read(nft, "account(uint256)", [2])).toLowerCase());
  eq("a token that does not exist resolves to nobody",
     decUint(await c.read(plate, "tokenForName(bytes)", [dns("999999.ipseity.eth")])), 0n);
  console.log("      bound, wildcarded, and the ERC-6821 record points a name at this site");
}

/*════════════ the seal, actually used ════════════

  Parley has carried the kind byte and the per-token point since it was
  written; this drives the half a browser does. Two tokens, two wallets:
  each derives its key from a signature, publishes the point, and what
  crosses the chain after that is ciphertext — asserted by reading it
  back as a stranger and finding bytes, then as the other end and
  finding words.
*/
head("two tokens whisper through a sealed room");
{
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const tokA = decUint(await c.read(nft, "totalSupply()"));
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const tokB = decUint(await c.read(nft, "totalSupply()"));
  await c.exec(nft, "transferFrom(address,address,uint256)",
    [c.from.toString(), buyer.from.toString(), tokB]);

  /*──── side A publishes ────*/
  let page = await GET(["dm", String(tokB)]);
  mount(page.body);
  wallet(c);
  runScripts(page.body);
  await nap(200);
  const $ = (i) => byId.get(i);
  ok("the DM page grew a seal bar", !!$("sealbar"));
  ok("and the page itself warns that a key belongs to a wallet, not a token",
     /changed hands|belongs to the wallet/.test(page.body),
     "the contract-rendered page makes no mention of the gap");
  {
    const sel = $("as");
    sel.value = String(tokA);
    await sel.fire("change");
    await nap(300);
    ok("it says the key is missing and offers to publish",
       $("sealpub").hidden === false, $("sealst").textContent);
    await $("sealpub").fire("click");
    await nap(400);
    const k = await c.read(site.parley, "keyOf(uint256)", [tokA]);
    ok("one press derived from a signature and published the point",
       decUint(k, 0) > 0n && decUint(k, 1) > 0n);
  }

  /*──── side B publishes ────*/
  page = await GET(["dm", String(tokA)]);
  mount(page.body);
  wallet(buyer);
  runScripts(page.body);
  await nap(200);
  {
    const sel = byId.get("as");
    sel.value = String(tokB);
    await sel.fire("change");
    await nap(300);
    await byId.get("sealpub").fire("click");
    await nap(400);
    ok("the other side published too",
       decUint(await c.read(site.parley, "keyOf(uint256)", [tokB]), 0) > 0n);
  }

  /*──── A seals a message ────*/
  page = await GET(["dm", String(tokB)]);
  mount(page.body);
  wallet(c);
  runScripts(page.body);
  await nap(200);
  {
    const sel = byId.get("as");
    sel.value = String(tokA);
    await sel.fire("change");
    await nap(500);
    const claim = byId.get("sealst").textContent;
    ok("with both points on chain, the room arms itself", /^sealed/.test(claim), claim);

    /*  The banner used to say "only #a and #b can read what is said here"
        after checking nothing but the sender's own key. The private half is
        derived from a wallet signature, so a token sold after publishing
        leaves a key its previous holder can still derive — and a message
        sealed to it is readable by the person who left. These two tokens
        have never moved, so the honest claim is available and made; what
        must never appear is the old promise about the other end.       */
    /*  The claim must agree with the chain rather than with a hope: a token
        that has never moved may be called settled, and one that has moved
        must say how many times. Asserting the count rather than a case is
        what makes this a test of the banner and not of the fixture.    */
    const farMoved = decUint(await c.read(nft, "statsOf(uint256)", [tokB]), 1);
    ok("and its claim agrees with what the chain says about that token",
       farMoved === 0n
         ? /never|since it was minted/.test(claim)
         : new RegExp("changed hands " + farMoved + "\\b").test(claim),
       `chain says ${farMoved} transfers; bar says: ${claim}`);
    ok("rather than promising something about the far end it never checked",
       !/only #\d+ and #\d+ can read/.test(claim), claim);
    byId.get("say").value = "the quiet part, out loud to exactly one token";
    await byId.get("send").fire("click");
    await nap(400);
  }

  /*──── an eavesdropper reads the chain itself ────*/

  /*  A stranger cannot even open this room through the page — a pair room
      is derived from BOTH ids and a non-holder has no "me" — so the
      honest eavesdropper is an indexer with the raw log, which is public
      to anyone with a node. The bytes are there; the words must not be. */
  {
    const room = decUint(await c.read(site.parley,
      "pairKey(uint256,uint256)", [tokA, tokB]));
    const logs = await c.getLogs({ address: site.parley });
    const inRoom = logs.filter((l) => l.topics && l.topics[1]
      && BigInt(l.topics[1]) === room);
    ok("the pair room's log is there for anyone with a node", inRoom.length >= 1,
       `${inRoom.length} logs in the room`);
    const data = String(inRoom[inRoom.length - 1].data).replace(/^0x/, "");
    eq("and the envelope says sealed out loud",
       Number(BigInt("0x" + data.slice(3 * 64, 4 * 64))), 1);
    ok("and the words are not in the bytes",
       !Buffer.from(data, "hex").toString("utf8").includes("quiet part"));
  }

  /*──── B reads words ────*/
  page = await GET(["dm", String(tokA)]);
  mount(page.body);
  wallet(buyer);
  runScripts(page.body);
  await nap(300);
  {
    const sel = byId.get("as");
    sel.value = String(tokB);
    await sel.fire("change");
    /*  Decryption is async per row and lands after the repaint; under a
        loaded pipeline 800ms was occasionally not enough. Poll for the
        words rather than trusting one nap.                             */
    let read = false;
    for (let t = 0; t < 20 && !read; t++) {
      await nap(300);
      const rows2 = [];
      const walk2 = (e) => { if (!e) return; rows2.push(e); (e.children || []).forEach(walk2); };
      walk2(byId.get("log"));
      read = rows2.some((e) => /quiet part, out loud/.test(String(e.textContent || "")));
    }
    ok("the other end derives the same secret and reads it", read,
       byId.get("sealst") ? byId.get("sealst").textContent : "no status");
  }
  /*──── the case the old banner lied about ────*/
  {
    /*  tokB changes hands. Its published point stays exactly where it was,
        and the wallet that derived it still can — so a sender must be told
        that sealing to it seals to somebody who has left.              */
    const before = decUint(await c.read(nft, "statsOf(uint256)", [tokB]), 1);
    await buyer.exec(nft, "transferFrom(address,address,uint256)",
      [buyer.from.toString(), renter.from.toString(), tokB]);
    eq("the far token has moved again", 
       decUint(await c.read(nft, "statsOf(uint256)", [tokB]), 1), before + 1n);

    const p = await GET(["dm", String(tokB)]);
    mount(p.body);
    wallet(c);
    runScripts(p.body);
    await nap(200);
    const sel = byId.get("as");
    sel.value = String(tokA);
    await sel.fire("change");
    let said = "";
    for (let t = 0; t < 16; t++) {
      await nap(250);
      said = String(byId.get("sealst").textContent || "");
      if (/changed hands/.test(said)) break;
    }
    ok("a key published before a sale is called out, not sealed over in silence",
       /changed hands/.test(said), said);
    ok("and the bar says so as a warning rather than as reassurance",
       /det only w|\bw\b/.test(String(byId.get("sealbar").className || "")),
       String(byId.get("sealbar").className));
    console.log("      a sold token keeps its published key \u2014 and the page says whose it is");
  }
  console.log("      derived from a signature, sealed with WebCrypto, bytes to everyone else");
}


/*════════════ the projector, actually turned ════════════*/
head("the projector answers anyone");
{
  const page = await GET(["projector"]);
  eq("/projector answers 200", page.status, 200);
  ok("and arrives with the picture already drawn", page.body.includes("<svg"));
  ok("eight solids on chips, every number on a bar",
     (page.body.match(/type=range/g) || []).length >= 9 &&
     (page.body.match(/<button class=\"chip cf/g) || []).length === 8,
     (page.body.match(/type=range/g) || []).length + ' bars, ' +
     (page.body.match(/<button class=\"chip cf/g) || []).length + ' chips');

  mount(page.body);
  wallet(c);
  runScripts(page.body);
  await nap(80);
  const $ = (i) => byId.get(i);

  $("chue").value = "200";
  await $("chue").fire("input");
  await nap(600);
  const drawn = String($("stage").innerHTML || "");
  ok("moving a bar redraws through the caller's own node",
     drawn.includes("svg") && drawn.length > 200, `stage holds ${drawn.length} chars`);

  const chips = globalThis.document.querySelectorAll("[data-f]");
  ok("the chips carry their solids as data", chips.length === 8);
  await chips[5].fire("click");
  await nap(600);
  const redrawn = String($("stage").innerHTML || "");
  ok("a different solid is a different picture",
     redrawn.includes("svg") && redrawn !== drawn,
     `lens ${drawn.length} -> ${redrawn.length}`);
  console.log("      drawn by the chain, redrawn by the chain, free either way");
}


head("driving the holder's side");
{
  const pg = await GET(["token", String(DRIVEN), "pool"]);
  mount(pg.body);
  const W = wallet(c);
  runScripts(pg.body);
  await nap(30);
  const $ = (i) => byId.get(i);

  const before = await c.read(pool, "market(uint256)", [DRIVEN]);
  $("db").value = "1.5";
  $("dq").value = "4500";
  await $("add").fire("click");
  ok("Add liquidity sent a transaction", W.sent() >= 1);
  const after = await c.read(pool, "market(uint256)", [DRIVEN]);
  ok("and the inventory actually grew",
     decUint(after, 2) > decUint(before, 2) && decUint(after, 3) > decUint(before, 3),
     `base ${decUint(before, 2)} -> ${decUint(after, 2)}`);
  console.log(`      1.5 WETH typed as text became ${decUint(after, 2) - decUint(before, 2)}` +
              ` base units \u2014 no float anywhere in that`);

  $("fb").value = "1.25";
  await $("fee").fire("click");
  eq("setting the fee from a percentage lands as bps",
     decUint(await c.read(pool, "market(uint256)", [DRIVEN]), 4), 125);

  $("wb").value = "0.5";
  $("wq").value = "0";
  await $("rm").fire("click");
  ok("Remove liquidity works too",
     decUint(await c.read(pool, "market(uint256)", [DRIVEN]), 2) <
     decUint(after, 2));
}

head("driving the rental counter");
{
  await c.exec(nft, "setLeaseAgent(uint256,address)", [DRIVEN, lease]);
  await c.exec(lease, "list(uint256,uint128,uint32,uint32)", [DRIVEN, WAD / 100n, 1, 30]);

  const pg = await GET(["token", String(DRIVEN), "rent"]);
  mount(pg.body);
  const hirer = await c.as("0x" + "55".repeat(32));
  PARTIES.push(hirer);
  if (!TOKENS.includes(DRIVEN)) TOKENS.push(DRIVEN);
  const W = wallet(hirer);
  runScripts(pg.body);
  await nap(30);
  const $ = (i) => byId.get(i);

  $("rd").value = "5";
  await $("rd").fire("input");
  ok("choosing five days prices it exactly",
     $("rc").textContent.startsWith("0.05 ETH for 5 days"), $("rc").textContent);

  const held = await c.balanceOf(lease);
  await $("rg").fire("click");
  eq("renting sent one transaction", W.sent(), 1);
  eq("carrying exactly the wei the card showed", (await c.balanceOf(lease)) - held, WAD / 20n);
  eq("and ERC-4907 now names the renter",
     decAddr(await c.read(nft, "userOf(uint256)", [DRIVEN])).toLowerCase(),
     hirer.from.toString().toLowerCase());

  $("rd").value = "400";
  await $("rd").fire("input");
  ok("a term outside the holder's range is refused before it is sent",
     $("rg").disabled === true, $("rc").textContent);
}

for (const g of ["window", "document", "addEventListener", "dispatchEvent", "Event", "IP"]) {
  delete globalThis[g];
}


/*════════════════ 6 · renting ════════════════*/
head("renting: the narrow capability");
const PER_DAY = WAD / 100n;                       // 0.01 ETH a day

await refuses("listing before naming a lease agent is refused",
  () => c.exec(lease, "list(uint256,uint128,uint32,uint32)", [1, PER_DAY, 1, 30]));

await c.exec(nft, "setLeaseAgent(uint256,address)", [1, lease]);
await c.exec(lease, "list(uint256,uint128,uint32,uint32)", [1, PER_DAY, 1, 30]);
ok("the holder names an agent and lists", true);

const listing = await c.read(lease, "listing(uint256)", [1]);
eq("it reads back as rentable", decUint(listing, 0), 1);

/*  and only now does the counter open. A card that renders whether or not
    anything is for sale is a card that will one day take money for
    nothing.                                                             */
const rp2 = await GET(["token", "1", "rent"]);
ok("the rent card appears once there are terms", rp2.body.includes("id=rg"));
ok("with a day field", rp2.body.includes("id=rd"));
ok("and a place for the exact wei", rp2.body.includes("id=rc"));
ok("priced from the terms just published", rp2.body.includes("0.01 ETH / day"),
   "the page did not show the price that was listed");

await refuses("a stranger cannot list someone else's token",
  () => renter.exec(lease, "list(uint256,uint128,uint32,uint32)", [1, PER_DAY, 1, 30]));

const leaseAbi = A("src/Lease.sol", "Lease").abi.map((f) => f.name).filter(Boolean);
ok("Lease's ABI contains no transfer, approve or lock of any kind",
   !leaseAbi.some((n) => /transfer|approve|lock|seal|execute/i.test(n)),
   leaseAbi.join(","));

/*──── the capability is exactly one function, tested by a contract that
       genuinely holds it and genuinely tries to use it for more ────*/
head("a lease agent that wants more than it was given");
const rogue = await c.deploy(A("test/mocks/Nasty.sol", "RogueAgent").bytecode, "", "RogueAgent");
await c.exec(nft, "setLeaseAgent(uint256,address)", [3, rogue]);

await c.exec(rogue, "setUser(address,uint256,address,uint64)",
  [nft, 3, buyer.from.toString(), 4102444800n]);
eq("it really is the agent — setUserVia goes through",
   decAddr(await c.read(nft, "userOf(uint256)", [3])).toLowerCase(),
   buyer.from.toString().toLowerCase());

for (const [sig, args, what] of [
  ["trySteal(address,uint256,address,address)",
   [nft, 3, c.from.toString(), rogue], "transfer the token"],
  ["tryApprove(address,uint256)", [nft, 3], "approve itself"],
  ["tryLock(address,uint256)", [nft, 3], "lock it"],
  ["trySetUserDirect(address,uint256)", [nft, 3], "call setUser directly"],
  ["tryRetarget(address,uint256)", [nft, 3], "name itself agent on another token"]
]) {
  const r = await c.read(rogue, sig, args);
  ok(`it cannot ${what}`, decUint(r) === 0n, "the call succeeded");
}
eq("and the token is still the holder's",
   decAddr(await c.read(nft, "ownerOf(uint256)", [3])).toLowerCase(),
   c.from.toString().toLowerCase());
console.log("      an ERC-721 approval would have carried transferFrom with it;");
console.log("      this is why the narrow power got its own name");

head("renting, continued");

const before = await c.balanceOf(lease);
await renter.exec(lease, "rent(uint256,uint32,uint128)", [1, 7, PER_DAY],
  { value: PER_DAY * 7n });
ok("a stranger rents it for seven days", true);
await OBLIGED("rent taken");
eq("the contract now holds the rent", (await c.balanceOf(lease)) - before, PER_DAY * 7n);
eq("and ERC-4907 says the renter is the user",
   decAddr(await c.read(nft, "userOf(uint256)", [1])).toLowerCase(),
   renter.from.toString().toLowerCase());

await refuses("nobody can rent it twice", () =>
  buyer.exec(lease, "rent(uint256,uint32,uint128)", [1, 1, PER_DAY], { value: PER_DAY }));

await refuses("and the payment must be exact", () =>
  buyer.exec(lease, "rent(uint256,uint32,uint128)", [2, 1, PER_DAY], { value: PER_DAY + 1n }));

head("what the renter may and may not do");
const wordBefore = decUint(await c.read(nft, "sectionOf(uint256)", [1]));
await renter.exec(nft, "commit(uint256,uint256)", [1, (wordBefore + 1n) & ((1n << 128n) - 1n)]);
ok("the renter drives the instrument — commit goes through", true);
ok("and the state really moved",
   decUint(await c.read(nft, "sectionOf(uint256)", [1])) !== wordBefore);

await refuses("the renter cannot sell it", () =>
  renter.exec(nft, "transferFrom(address,address,uint256)",
    [c.from.toString(), renter.from.toString(), 1]));
await refuses("nor lock it", () => renter.exec(nft, "lock(uint256)", [1]));
await refuses("nor set a user of their own", () =>
  renter.exec(nft, "setUser(uint256,address,uint64)", [1, buyer.from.toString(), 99999999999n]));

/*════════════════ 7 · the books ════════════════*/
head("a lease that runs its term");
evm.warp(evm.BLOCK.header.timestamp + 8n * 86400n);
await c.exec(lease, "settle(uint256)", [1]);
eq("all of it vested to the token", decUint(await c.read(lease, "earned(uint256)", [1])), PER_DAY * 7n);
await OBLIGED("term completed");

const holderBefore = await c.balanceOf(c.from.toString());
await c.exec(lease, "collect(uint256,address)", [1, c.from.toString()]);
ok("the holder collected it", (await c.balanceOf(c.from.toString())) > holderBefore - WAD);
eq("and nothing is left owing on that token", decUint(await c.read(lease, "earned(uint256)", [1])), 0);
/*  Not "the contract is empty" — by this point the app driver above has a
    real five-day lease running on another token, and its escrow is exactly
    where it should be. What has to be true is narrower and is the actual
    claim: nothing is left held against THIS token.                      */
eq("nothing is left held against token 1",
   decUint(await c.read(lease, "activeOf(uint256)", [1]), 3), 0);
await OBLIGED("after collection");

head("a lease cut short by the sale of the token");
await c.exec(nft, "setLeaseAgent(uint256,address)", [1, lease]);
await c.exec(lease, "list(uint256,uint128,uint32,uint32)", [1, PER_DAY, 1, 30]);
await renter.exec(lease, "rent(uint256,uint32,uint128)", [1, 10, PER_DAY],
  { value: PER_DAY * 10n });
const paid = PER_DAY * 10n;

evm.warp(evm.BLOCK.header.timestamp + 2n * 86400n);           // two days in
await c.exec(lease, "settle(uint256)", [1]);                  // seen running
await c.exec(nft, "transferFrom(address,address,uint256)",
  [c.from.toString(), buyer.from.toString(), 1]);
eq("the sale cleared the ERC-4907 user",
   decAddr(await c.read(nft, "userOf(uint256)", [1])),
   "0x0000000000000000000000000000000000000000");
eq("and cleared the standing permission to grant one",
   decAddr(await c.read(nft, "leaseAgentOf(uint256)", [1])),
   "0x0000000000000000000000000000000000000000");

await c.exec(lease, "settle(uint256)", [1]);
const vested = decUint(await c.read(lease, "earned(uint256)", [1]));
const refund = decUint(await c.read(lease, "owed(address)", [renter.from.toString()]));
ok("two days of ten vested to the token",
   vested >= paid / 5n - PER_DAY / 100n && vested <= paid / 5n + PER_DAY / 100n,
   `vested ${vested}, expected about ${paid / 5n}`);
eq("and every remaining wei is the renter's", vested + refund, paid);
await OBLIGED("lease cut short");
console.log(`      ${vested} vested, ${refund} refundable, ${paid} paid — nothing lost`);

const newHolder = await buyer.balanceOf(buyer.from.toString());
await buyer.exec(lease, "collect(uint256,address)", [1, buyer.from.toString()]);
ok("the BUYER collects the vested rent, not the seller",
   (await buyer.balanceOf(buyer.from.toString())) > newHolder - WAD);
console.log("      rent accrues to the token, so selling it sells the income");

const renterBefore = await renter.balanceOf(renter.from.toString());
await renter.exec(lease, "claim()", []);
ok("and the renter reclaims the time they did not get",
   (await renter.balanceOf(renter.from.toString())) > renterBefore - WAD / 10n);
eq("and nothing against it a second time",
   decUint(await c.read(lease, "activeOf(uint256)", [1]), 3) +
   decUint(await c.read(lease, "earned(uint256)", [1])), 0);

head("the invariant that matters");
const surplus = await OBLIGED("at rest");
eq("and nothing is stranded: the balance is exactly what is owed, to the wei",
   surplus, 0n);
console.log("      checked after every operation above, not only at the end — a");
console.log("      contract briefly insolvent in the middle passes a closing check");

/*════════════════ 8 · what the site cannot do ════════════════*/
head("read off the compiled ABI");
for (const [file, name] of [
  ["src/PageToken.sol", "PageToken"], ["src/PageMarket.sol", "PageMarket"],
  ["src/PageServices.sol", "PageServices"], ["src/PageManifest.sol", "PageManifest"],
  ["src/Chrome.sol", "Chrome"], ["src/Premises.sol", "Premises"],
  /*  And every contract that renders the conversation. `DeskTalk` is the
      one that matters most: it holds the client, so it is the obvious place
      for a function that stands between a person and their wallet — and the
      claim these pages make is that there is no such function anywhere
      here, not that there is one nobody calls.                          */
  ["src/PageDoor.sol", "PageDoor"], ["src/PageTalk.sol", "PageTalk"],
  ["src/PageRooms.sol", "PageRooms"], ["src/DeskTalk.sol", "DeskTalk"],
  ["src/PageTerminal.sol", "PageTerminal"], ["src/PageGallery.sol", "PageGallery"],
  ["src/PageLaunch.sol", "PageLaunch"], ["src/PageLock.sol", "PageLock"],
  ["src/PageHook.sol", "PageHook"], ["src/DeskLaunch.sol", "DeskLaunch"],
  ["src/DeskSeal.sol", "DeskSeal"], ["src/Roster.sol", "Roster"],
  ["src/DeskRooms.sol", "DeskRooms"], ["src/PageCast.sol", "PageCast"], ["src/PageSeal.sol", "PageSeal"],
  ["src/PageKeys.sol", "PageKeys"], ["src/PageName.sol", "PageName"],
  ["src/PageEstate.sol", "PageEstate"], ["src/DeskEstate.sol", "DeskEstate"],
  ["src/PageSwap.sol", "PageSwap"], ["src/DeskUni.sol", "DeskUni"],
  ["src/DeskTrade.sol", "DeskTrade"], ["src/Venue.sol", "Venue"],
  ["src/DeskTerm.sol", "DeskTerm"],
  ["src/Desk.sol", "Desk"]
]) {
  const abi = A(file, name).abi;
  const writes = abi.filter((f) =>
    f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure");
  ok(`${name} has no state-changing function`, writes.length === 0,
     writes.map((f) => f.name).join(","));
}

const leaseWrites = A("src/Lease.sol", "Lease").abi
  .filter((f) => f.type === "function" && f.stateMutability === "payable")
  .map((f) => f.name);
ok("Lease takes ether through exactly one function", leaseWrites.length === 1 && leaseWrites[0] === "rent",
   leaseWrites.join(","));
ok("and has neither receive nor fallback",
   !A("src/Lease.sol", "Lease").abi.some((f) => f.type === "receive" || f.type === "fallback"));

console.log(`\n  ${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
