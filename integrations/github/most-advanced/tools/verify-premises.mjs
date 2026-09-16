#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the front door

  Every token is already a website. This is the thing that was missing:
  somewhere to send a person who does not own one yet.

  The claim under test is not "the index works". It is the constraint that
  makes an index safe to have at all:

      PREMISES NEVER SERVES THE ARTWORK.

  It serves a document that names the artwork, by emitting the token's own
  data: URI read from the hub at request time, and it stores none of it.

  Be exact about what that buys. Premises composes the whole page, so a
  compromised Premises could put anything in that frame — no assertion here
  can prevent that, and claiming otherwise would be the kind of guarantee
  this project exists not to make. What it buys is that the ARTWORK is
  untouched: the bytes live in the collection, anyone can call tokenURI
  directly, /raw hands back the URI to check against, and every token
  renders identically whether this contract exists, is abandoned, or is
  replaced by something else entirely. The index is convenience. Nothing
  depends on it, which is the only reason it is safe to have one.

  So the assertions are: the honest deployment emits exactly tokenURI(id),
  and the deployed code contains none of the document — a reader can verify
  both against the source.

  Also under test: a request for nonsense is a 404, not a revert. A client
  asking for a path that does not exist deserves an answer.

    node tools/verify-premises.mjs
───────────────────────────────────────────────────────────────────────────*/
import { compile, artifact } from "./compile.mjs";
import { Chain, decUint, encodeAddressArg } from "./evm.mjs";
import { deploySite, getter } from "./site.mjs";
import { createAddressFromString } from "@ethereumjs/util";

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${n}`);
  if (!c && d !== undefined) console.log(`      ${d}`);
};
const eq = (n, g, w) => ok(n, String(g) === String(w), `got ${g}\n      want ${w}`);
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";

const evm = await import("./evm.mjs");
const w = (n) => BigInt(n).toString(16).padStart(64, "0");
const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();

const GET = (path) => getter(c, premises)(path);

/*──────────────── deploy ────────────────*/
head("deploy");
const tmpReg = await c.deploy(A("test/mocks/ERC6551Registry.sol", "ERC6551Registry").bytecode);
await c.vm.stateManager.putCode(createAddressFromString(REGISTRY),
  await c.vm.stateManager.getCode(createAddressFromString(tmpReg)));

const impl = await c.deploy(A("src/IpseityAccount.sol", "IpseityAccount").bytecode);
const gripImpl = await c.deploy(A("src/GripVault.sol", "GripVault").bytecode);
const engine = await c.deploy(A("src/Engine.sol", "Engine").bytecode, "0".repeat(63) + "1");
const sigil = await c.deploy(A("src/Sigil.sol", "Sigil").bytecode);
const renderer = await c.deploy(A("src/Renderer.sol", "Renderer").bytecode,
  encodeAddressArg(engine) + encodeAddressArg(sigil));
const nft = await c.deploy(A("src/Ipseity.sol", "Ipseity").bytecode,
  encodeAddressArg(renderer) + encodeAddressArg(impl) + encodeAddressArg(gripImpl) + (1).toString(16).padStart(64, "0") + (4096).toString(16).padStart(64, "0"));

/* a small real document, so tokenURI returns something whole */
const doc = Buffer.from("<!doctype html><title>x</title><body>the instrument</body>", "utf8");
const { gzipSync } = await import("node:zlib");
const packed = gzipSync(doc, { level: 9 });
const loadArg = (b) => w(0x20) + w(b.length) + b.toString("hex").padEnd(Math.ceil(b.length / 32) * 64, "0");
await c.send({ to: engine, data: evm.sel("loadHead(bytes)") + loadArg(packed) });
await c.send({ to: engine, data: evm.sel("loadBody(bytes)") + loadArg(packed) });
await c.exec(engine, "setInflatedSize(uint32)", [doc.length]);

const pool = await c.deploy(A("src/Pool.sol", "Pool").bytecode,
  encodeAddressArg(nft) + w(10n ** 30n) + encodeAddressArg(c.from.toString()) + w(0), "Pool");
await c.exec(nft, "setPool(address)", [pool]);
const lease = await c.deploy(A("src/Lease.sol", "Lease").bytecode, encodeAddressArg(nft), "Lease");

const site = await deploySite(c, A, { hub: nft, pool, lease, sigil });
const premises = site.premises;
ok("deployed", (await c.codeSize(premises)) > 0);
console.log(`      router   ${premises}`);
console.log(`      pages    token ${site.pToken.slice(0, 10)}  market ${site.pMarket.slice(0, 10)}` +
            `  services ${site.pServices.slice(0, 10)}  manifest ${site.pManifest.slice(0, 10)}`);

await c.exec(nft, "mint()", [], { value: 10n ** 16n });
await c.exec(nft, "mint()", [], { value: 10n ** 16n });

/*──────────────── the index ────────────────*/
head("the index answers HTTP, from a contract");
/*  The root is the instrument now — a link to an NFT arrives at the NFT —
    so what used to be asked of `/` is asked of `/door`, and `/` is asked
    the one question that distinguishes the artwork from a page about it. */
const idx = await GET([]);
eq("200", idx.status, 200);
eq("Content-Type", idx.headers[0][1], "text/html; charset=utf-8");
eq("Cache-Control", idx.headers[1][0], "Cache-Control");
ok("the root is the instrument, not a page about it",
   idx.body.includes("IPSE") && !idx.body.includes('href="/token/2"'),
   idx.body.slice(0, 80));

const flat = await GET(["door"]);
eq("the flat page answers at /door", flat.status, 200);
ok("it is a document", flat.body.startsWith("<!doctype html>"));
ok("it names the collection", flat.body.includes("IPSEITY"));
ok("it counts what has been issued", flat.body.includes("2 of 4096"));
ok("and lists the most recent", flat.body.includes('href="/token/2"'));
console.log(`      ${idx.body.length} bytes at the root, ${flat.body.length} at the door`);

/*──────────────── one token ────────────────*/
head("a token's page");
const one = await GET(["token", "1"]);
eq("200", one.status, 200);
ok("it names the token", one.body.includes("IPSEITY #1"));
ok("it reports the hands", one.body.toLowerCase().includes("reach") && one.body.toLowerCase().includes("grip"));
ok("and the kernel", one.body.includes("kernel"));

/*════════════ the constraint that makes this safe ════════════*/
head("what the page hands you is the token's own bytes");
const uri = await c.read(nft, "tokenURI(uint256)", [1]);
const tokenUri = (() => {
  const h = uri.replace(/^0x/, "");
  const off = Number(BigInt("0x" + h.substr(0, 64))) * 2;
  const len = Number(BigInt("0x" + h.substr(off, 64)));
  return Buffer.from(h.substr(off + 64, len * 2), "hex").toString("utf8");
})();

/*  The page used to inline the whole instrument as a data: URI, and the
    assertion here was that the embedded src equalled tokenURI(1) byte for
    byte. It no longer inlines it, for a reason measurement settled: the
    counter page cost 21M gas of eth_call to show a preview a viewer cannot
    use, because a data: document gets an opaque origin and no wallet
    injects into one. It links instead, and the link is the usable one.

    So the claim moves rather than disappears. What has to be true is that
    the routes handing over the artwork hand over the token's own bytes,
    and those are /raw and /live — both checked below, both answered by
    Premises itself without touching a page contract.                    */
ok("the page does not inline the artwork", !one.body.includes("data:application/json;base64,"));
ok("it links to the instrument on a real origin", one.body.includes('href="/token/1/live"'));
ok("and to the URI itself, to check", one.body.includes('href="/token/1/raw"'));

const raw = await GET(["token", "1", "raw"]);
eq("/raw returns the URI itself", raw.body, tokenUri);
eq("as text/plain", raw.headers[0][1], "text/plain; charset=utf-8");

/*════════════ the one that decides whether it is usable ════════════

  A `data:` document gets an opaque origin, and wallet extensions do not
  inject into one. So the frame on the token page renders the instrument
  perfectly and cannot connect to anything — it can be looked at, not used.
  /live serves the same bytes one step earlier, as a first-class HTML
  response on a real origin, where EIP-6963 discovery works.               */
head("the instrument, on an origin a wallet will talk to");
const live = await GET(["token", "1", "live"]);
eq("200", live.status, 200);
eq("served as html, not as a URI in a page", live.headers[0][1], "text/html; charset=utf-8");
ok("the body is a document, not a data: URI", !live.body.startsWith("data:"));

/* the bytes must be the same ones — one step before base64, not a rebuild */
const inner = (() => {
  const m2 = tokenUri.match(/^data:application\/json;base64,(.*)$/);
  const json = JSON.parse(Buffer.from(m2[1], "base64").toString("utf8"));
  return Buffer.from(json.animation_url.replace(/^data:text\/html;base64,/, ""), "base64")
    .toString("utf8");
})();
eq("and they are exactly what tokenURI base64s", live.body, inner);
console.log("      same document, one step earlier — a real origin instead of");
console.log("      an opaque one, which is the difference between look and use");

/*──────────────── nonsense gets an answer ────────────────*/
head("a request for nonsense is a 404, never a revert");
for (const [name, path] of [
  ["a token that does not exist", ["token", "9999"]],
  ["a path that is not a number", ["token", "abc"]],
  ["a number too long to be an id", ["token", "99999999999"]],
  ["a route nobody defined", ["nonsense"]],
  ["token with nothing after it", ["token"]],
  ["an empty segment", ["token", ""]]
]) {
  let r = null;
  try { r = await GET(path); } catch (e) { /* a revert is the failure */ }
  ok(name, r !== null && r.status === 404,
     r === null ? "it reverted instead of answering" : `status ${r.status}`);
}

/*──────────────── the shape ────────────────*/
head("read off the compiled ABI and the deployed code");
const abi = A("src/Premises.sol", "Premises").abi;
const writes = abi.filter((f) => f.type === "function" &&
  f.stateMutability !== "view" && f.stateMutability !== "pure");
eq("there is no state-changing function at all", writes.length, 0);
ok("nothing that could hold or move an asset",
   !abi.some((f) => /transfer|withdraw|approve|execute|receive|admin|owner|set/i.test(f.name || "")),
   "a front door is a reader; anything else is a liability with a URL");

/* the independence claim, checked rather than asserted: the artwork is not
   inside this contract, so it cannot be changed by changing this contract */
const code = await c.vm.stateManager.getCode(createAddressFromString(premises));
const engineCode = await c.vm.stateManager.getCode(createAddressFromString(engine));
const hay = Buffer.from(code).toString("hex");
const needle = Buffer.from(engineCode.slice(1, 33)).toString("hex");
ok("it holds none of the artwork's bytes", !hay.includes(needle),
   "the index has a copy of the document — then it is infrastructure, not convenience");
console.log("      the tokens render identically whether this contract exists,");
console.log("      is abandoned, or is replaced by something else entirely");

console.log(`\n  ${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
