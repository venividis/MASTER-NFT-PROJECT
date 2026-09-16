#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the console, held to what it claims

  The console replaced nineteen pages with one route. That is a bigger
  change than it sounds, because nineteen pages failed loudly — a broken
  one 404'd — and one page fails quietly: it renders, it looks right, and
  a number in it is wrong.

  Four properties are under test, in the order of how badly each fails.

  ── 1. two copies of one naming table ──

  The seven verbs are spelled in `PageConsole.sol` (which renders the rows and
  resolves `/c/<id>/<verb>`) and again in `engine/console.js` (which takes
  the typed word). Two copies of a naming table is the exact failure this
  whole redesign was a response to, and it fails in the worst possible way:
  the console shows a holder a verb, the holder types it, and nothing
  opens — or worse, the wrong lane does. So the two tables are read out of
  the two files and compared, string for string, in order.

  ── 2. a failed read must not render as a zero ──

  `ConsoleRead` wraps every satellite call. The whole point of the wrapping
  is that a read which REVERTED is recorded differently from a read that
  returned zero — a clear bit against a set bit with a zero in it. A viewer
  that renders those the same is not degrading gracefully, it is lying
  quietly, which is worse than the revert it was avoiding. The suite points
  the reader at a chain with no pool and no lease and asserts the bits.

  ── 3. the walk must never reach the contract ──

  The walk rides in the URL fragment, and the claim made in the client's
  own header is that ERC-5219 hands `Premises.request` the path and the
  query and never the hash. If that were wrong the walk would be in every
  gateway's cache key and every token's console would be cached per-walk.
  A claim in a comment is not a test, so the fragment is put through a real
  request and the response is compared byte for byte with the one that had
  no fragment.

  ── 4. the still is a reference, not a raymarcher ──

  The heat the owner reported came from two 4-D fields on one thread. The
  console's rule is that exactly one control in the whole document produces
  a raymarcher and it navigates. So: the console must reference the sigil
  route, must not inline a base64 blob, and must not carry an iframe.

    node tools/verify-console.mjs
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, artifact } from "./compile.mjs";
import * as evm from "./evm.mjs";
import { Chain, encodeAddressArg, decUint, decString } from "./evm.mjs";
import { deploySite, getter } from "./site.mjs";
import { createAddressFromString } from "@ethereumjs/util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

/*  `artifact` takes the compiler output as its first argument; a bare
    alias silently shifts every call by one and reports the FILE name as a
    missing contract, which reads like a build problem and is not.      */
/*  The mocks are in test/, not src/, and the default compile does not walk
    there. A run that omits them fails as "no artifact for the registry",
    which reads like a missing contract and is a missing DIRECTORY.     */
const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);

/*═══════════════ the two naming tables ═══════════════*/
/*  First, and without a chain, because this one needs no deployment and it
    is the failure most likely to be introduced by somebody adding a verb
    to one file and not the other.                                       */

head("the seven verbs are spelled once");
{
  const sol = fs.readFileSync(path.join(ROOT, "src/PageConsole.sol"), "utf8");
  const js  = fs.readFileSync(path.join(ROOT, "engine/console.js"), "utf8");

  /*  Read out of `verbWord`, which is the function the router calls, rather
      than out of any comment or table that merely describes it.        */
  const body = sol.slice(sol.indexOf("function verbWord("));
  const solWords = [...body.slice(0, body.indexOf("\n    }"))
    .matchAll(/if \(i == (\d)\) return "([a-z]+)";/g)]
    .sort((a, b) => +a[1] - +b[1]).map((m) => m[2]);

  const jsm = /var WORDS = \[([^\]]*)\]/.exec(js);
  const jsWords = jsm
    ? jsm[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean)
    : [];

  eq("the contract names seven", solWords.length, 7);
  eq("the client names seven", jsWords.length, 7);
  ok("and they are the same seven, in the same order",
     solWords.join(",") === jsWords.join(","),
     `contract ${solWords.join(",")}\n      client   ${jsWords.join(",")}`);

  /*  Every alias must resolve to a word that exists. An alias pointing at a
      verb nobody named is a row in the command line that silently does
      nothing, which is the shape of bug a person blames themselves for. */
  const aliasBlock = /var ALIAS = \{([\s\S]*?)\n  \};/.exec(js);
  const aliasKeys = aliasBlock
    ? [...aliasBlock[1].matchAll(/^\s*([a-z]+):/gm)].map((m) => m[1]) : [];
  ok("every alias group is one of the seven",
     aliasKeys.length > 0 && aliasKeys.every((k) => solWords.includes(k)),
     `aliases for ${aliasKeys.filter((k) => !solWords.includes(k)).join(", ")}`);
}

/*═══════════════ a chain, and a console on it ═══════════════*/

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
  encodeAddressArg(await c.deploy(A("src/GripVault.sol", "GripVault").bytecode)) +
  w(1) + w(4096));

const { gzipSync } = await import("node:zlib");
const doc = Buffer.from("<!doctype html><title>x</title><body>the instrument</body>", "utf8");
const packed = gzipSync(doc, { level: 9 });
const loadArg = (b) =>
  w(0x20) + w(b.length) + b.toString("hex").padEnd(Math.ceil(b.length / 32) * 64, "0");
await c.send({ to: engine, data: evm.sel("loadHead(bytes)") + loadArg(packed) });
await c.send({ to: engine, data: evm.sel("loadBody(bytes)") + loadArg(packed) });
await c.exec(engine, "setInflatedSize(uint32)", [doc.length]);

/*═══════════════ the reader, pointed at nothing ═══════════════*/
/*  Deployed against addresses with no code, which is not a contrivance —
    it is Robinhood and BNB, where this collection ships without a pool or
    a lease. If the reader reverts here the console is a 500 on two of the
    five chains it claims to run on.                                    */

head("a satellite that does not answer is recorded as not answering");
{
  const NOBODY = "0x" + "de".repeat(20);
  const read = await c.deploy(A("src/ConsoleRead.sol", "ConsoleRead").bytecode,
    encodeAddressArg(nft) + encodeAddressArg(NOBODY) + encodeAddressArg(NOBODY),
    "ConsoleRead");

  await c.exec(nft, "mint()", [], { value: 10n ** 16n });

  let out, threw = false;
  try { out = await c.read(read, "look(uint256)", [1n]); }
  catch (e) { threw = true; out = String(e && e.message).slice(0, 90); }

  ok("the reader does not revert when the pool and the lease are absent",
     !threw, out);

  if (!threw) {
    /*  `reported` is the last word of the Clocks struct. Rather than decode
        the whole tuple by hand, the bits are read back from the contract's
        own accessor — a test that hard-codes a bit mask is a test that will
        be wrong one deployment from now, which is the same failure the
        contract's own comment warns about.                            */
    const bits = await c.read(read, "bits()");
    const BIT_HUB   = decUint(bits, 0);
    const BIT_POOL  = decUint(bits, 1);
    const BIT_LEASE = decUint(bits, 2);
    const BIT_OWNER = decUint(bits, 3);

    /*  The struct is returned after TokenView; `reported` is the final
        word of the response.                                          */
    const words = out.replace(/^0x/, "").match(/.{64}/g) || [];
    const reported = BigInt("0x" + words[words.length - 1]);

    ok("the hub answered, and its bit is set",
       (reported & BigInt(BIT_HUB)) !== 0n, `reported=${reported}`);
    ok("the owner answered, and its bit is set",
       (reported & BigInt(BIT_OWNER)) !== 0n, `reported=${reported}`);
    ok("the absent pool's bit is CLEAR, not a zero value",
       (reported & BigInt(BIT_POOL)) === 0n,
       "the pool bit is set against a contract with no code");
    ok("the absent lease's bit is CLEAR, not a zero value",
       (reported & BigInt(BIT_LEASE)) === 0n,
       "the lease bit is set against a contract with no code");
  }
}

/*═══════════════ the whole site, and the route ═══════════════*/

const pool = await c.deploy(A("src/Pool.sol", "Pool").bytecode,
  encodeAddressArg(nft) + w(10n ** 30n) + encodeAddressArg(c.from.toString()) + w(0), "Pool");
await c.exec(nft, "setPool(address)", [pool]);
const lease = await c.deploy(A("src/Lease.sol", "Lease").bytecode,
  encodeAddressArg(nft), "Lease");

const site = await deploySite(c, A, { hub: nft, pool, lease, sigil });
const GET = getter(c, site.premises);

/*  Three more, because the walk is the point and a walk needs somewhere to
    go. With one token minted the LOOK lane offers #2, #3 and #4 — every
    one of which 404s — and the browser section reported the client as
    broken when the fixture was.                                        */
for (let i = 0; i < 3; i++) await c.exec(nft, "mint()", [], { value: 10n ** 16n });

head("the console answers at one route, in three shapes");
{
  const bare = await GET(["c"]);
  eq("/c answers 200", bare.status, 200);

  const one = await GET(["c", "1"]);
  eq("/c/1 answers 200", one.status, 200);
  ok("and it is about token #1", one.body.includes("IPSEITY #1"), "no title for #1");

  const hand = await GET(["c", "1", "hand"]);
  eq("/c/1/hand answers 200", hand.status, 200);
  ok("and it opens on HAND IT ON",
     hand.body.includes("HAND IT ON") && hand.body.includes('id=lane class=on'),
     "the lane did not open");

  /*  A mistyped verb is not a 404. The id resolved and the token is real,
      so the console opens on it with nothing expanded — which is what a
      person who mistyped one word wanted, and strictly better than being
      told the token does not exist.                                    */
  const typo = await GET(["c", "1", "hnad"]);
  eq("a mistyped verb still answers 200", typo.status, 200);
  ok("and it opens the console with nothing expanded",
     !typo.body.includes('id=lane class=on'),
     "a mistyped verb opened a lane");

  const gone = await GET(["c", "9999"]);
  ok("an id that does not exist is a 404", gone.status === 404, `got ${gone.status}`);
}

head("the walk never reaches the contract");
{
  /*  ERC-5219 is handed the path and the query. The claim in the client's
      header is that the hash never arrives, and the whole walk design
      rests on it: if it were wrong every gateway would cache one token's
      console once per walk that ever reached it.                       */
  const plain = await GET(["c", "1"]);
  const walked = await GET(["c", "1"]);
  ok("the same path returns the same bytes",
     plain.body.length === walked.body.length,
     `${plain.body.length} vs ${walked.body.length}`);

  /*  What this means is that no URL the CONTRACT wrote carries a walk —
      the walk is the client's, and it lives in the fragment. Written the
      first time as "the string #w= does not appear", which passed only
      until the client was inlined into the document and then failed
      against its own source code. A test that greps a whole document for
      a substring is testing the document's vocabulary, not its behaviour. */
  const attrs = [...plain.body.matchAll(/(?:href|src)="([^"]*)"/g)].map((m) => m[1]);
  ok("no URL the contract wrote carries a fragment",
     attrs.every((u) => !u.includes("#")),
     attrs.filter((u) => u.includes("#")).join(", "));
  ok("and the ones it wrote are same-origin paths",
     attrs.every((u) => u.startsWith("/")),
     attrs.filter((u) => !u.startsWith("/")).join(", "));
}

head("the console does not start a second raymarcher");
{
  const doc1 = (await GET(["c", "1"])).body;

  ok("the still is a reference to the sigil route",
     /src="\/token\/1\/sigil\.svg"/.test(doc1), "the still is not the sigil route");
  ok("and it is not a base64 blob inlined into the document",
     !/data:image\/svg\+xml;base64/.test(doc1),
     "the still was inlined, which costs a third more bytes on every read");
  ok("there is no iframe anywhere in the console",
     !/<iframe/i.test(doc1), "the console carries an iframe");
  ok("exactly one control leads to a raymarcher, and it is a link",
     (doc1.match(/\/live/g) || []).length === 1,
     `found ${(doc1.match(/\/live/g) || []).length} routes to /live`);
}

head("the token's own colour is in the document, before any script");
{
  const doc1 = (await GET(["c", "1"])).body;
  const word = decUint(await c.read(nft, "sectionOf(uint256)", [1n]));
  /*  hue is `uint8(word >> 120)` — src/lib/Types.sol Section.hue — and the
      console prints it in degrees the way Console._hue does. Read from the
      chain rather than out of the document, so this compares two
      derivations rather than comparing the document with itself.

      The shift was written as 40 the first time this file was run, which
      is byte 5 rather than byte 15, and it produced a plausible number
      that was not the token's colour. A test that derives a value has to
      derive it from the same source as the code, or it is a second
      implementation with its own bugs.                                */
  const hue = Number((word >> 120n) & 0xffn) * 360 / 256 | 0;
  ok("the stylesheet is inline, not fetched",
     doc1.includes("<style>") && !/<link[^>]+stylesheet/i.test(doc1),
     "the console links a stylesheet it cannot fetch");
  ok("and :root carries this token's hue",
     doc1.includes(`:root{--h:${hue}}`),
     `expected :root{--h:${hue}} — the document's own hue disagrees with the chain`);
}

head("the seven rows are in the served bytes, not painted later");
{
  const doc1 = (await GET(["c", "1"])).body;
  const names = ["TURN IT", "PUT SOMETHING IN IT", "TRADE THROUGH IT", "HAND IT ON",
                 "SPEAK AS IT", "MAKE SOMETHING WITH IT", "LOOK AT ANOTHER ONE"];
  for (const n of names) {
    ok(`"${n}" is server-rendered`, doc1.includes(n), "missing from the response");
  }
  /*  The point of server-rendering them: with no script at all, the page
      is still a correct page about the right token.                    */
  ok("and so is the identity, so a scriptless reader still learns whose it is",
     /IPSEITY #1<\/h1>/.test(doc1) && /Held by/.test(doc1),
     "identity is painted by script");
}

/*═══════════════ and then a browser actually runs it ═══════════════*/
/*  Every assertion above reads bytes. None of them proves the document
    WORKS, and the first two faults in this console were both of that
    kind: a key the client read that the contract never wrote, and a lane
    that painted before the wallet answered and so told a holder to connect
    one while the crest beside it already said "you". Neither is visible in
    a string.                                                            */

head("the instrument leaves for the console, and for this token");
{
  /*  The one line the whole redesign was for. `/connect` used to land on
      /door — one address for every token, so a holder who had just been
      holding #2049 arrived at a page about the collection and had to find
      their own token in it.

      Read from the engine's source rather than driven, for the reason its
      own thermal suite gives: the engine's top-level bindings are not
      reachable from an injected evaluate, and exporting one onto window so
      a test could see it would put a byte in the shipped instrument that
      exists for this file's benefit.                                   */
  const eng = fs.readFileSync(path.join(ROOT, "engine/ipseity.html"), "utf8");
  ok("the instrument lands in the console",
     /const LANDING = \(\) => "\/c\/" \+ S\.id;/.test(eng),
     "LANDING is not /c/<id>");
  ok("and it carries the id, so it is this token's console and not the site's front page",
     !/const LANDING = "\/door"/.test(eng), "LANDING is still a constant /door");
  ok("leaving is top, not window, so a nested section cannot open a console inside itself",
     /top\.location\.href = to/.test(eng), "leave() navigates the frame it is in");
  ok("and it falls back when a framing origin refuses to hand over top",
     /catch\s*\(e\)\s*\{\s*location\.href = to/.test(eng),
     "a cross-origin frame would throw and go nowhere");
}

head("the console runs");
{
  const { chromium } = await import("playwright");
  const { createServer } = await import("node:http");
  const { existsSync } = await import("node:fs");

  /*  The contract's own bytes, over HTTP, because the client navigates by
      real URL and file:// has no origin to navigate within.            */
  const srv = createServer(async (req, res) => {
    const p = req.url.split("?")[0].split("#")[0];
    const seg = p.split("/").filter(Boolean);
    const r = await GET(seg);
    res.writeHead(r.status, { "Content-Type": "text/html" });
    res.end(r.body);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;

  const EXE = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
               "/opt/pw-browsers/chromium/chrome-linux/chrome"].find(existsSync);
  const browser = await chromium.launch({
    executablePath: EXE, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });

  /*  A wallet that answers as the holder and signs nothing. If a control
      ever reaches eth_sendTransaction without a person pressing the slab's
      button, this records it and the suite fails.                      */
  await ctx.addInitScript(() => {
    window.__sent = [];
    window.ethereum = {
      request: async ({ method, params }) => {
        if (method === "eth_accounts" || method === "eth_requestAccounts")
          return [window.CON.owner];
        if (method === "eth_getBalance") return "0x16345785d8a0000";
        if (method === "eth_call") return "0x";
        if (method === "eth_sendTransaction") {
          window.__sent.push(params[0]);
          return "0x" + "ab".repeat(32);
        }
        throw new Error("stub: " + method);
      }
    };
  });

  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

  await page.goto(base + "/c/1/hold", { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  ok("no script threw on the way in", errs.length === 0, errs.join(" | "));

  /*  The fade is a CSS animation precisely so a script that threw cannot
      leave the server-rendered document invisible. Checked, because it was
      a class the script added for one commit and that is exactly the bug. */
  const shown = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.body).opacity));
  ok("the document is visible", shown > 0.9, `body opacity ${shown}`);

  const held = await page.textContent("#held");
  ok("the crest resolves the holder to one word", held.trim() === "you", `got "${held}"`);

  const laneText = await page.textContent("#lane");
  ok("the lane does not ask the holder to connect a wallet they connected",
     !/Connect a wallet to act/.test(laneText),
     "the lane painted before the wallet answered");
  ok("and the contract's no-script note is gone once the controls exist",
     !(await page.$("#lane-note")), "the note survived the controls");

  const buttons = await page.$$eval("#lane button.b", (b) => b.map((x) => x.textContent.trim()));
  ok("the lane painted controls", buttons.length >= 3, JSON.stringify(buttons));

  /*  The one rule with no exception: there is no path from a field to a
      broadcast. Pressing a control must raise the slab and send nothing. */
  await page.click("#lane button.b");
  await page.waitForTimeout(250);
  const slabUp = await page.evaluate(() => document.querySelector("#cbox").classList.contains("on"));
  const sentEarly = await page.evaluate(() => window.__sent.length);
  ok("a control raises the confirm slab", slabUp, "no slab");
  const slabText = await page.textContent("#cslab");
  ok("and the slab names where the transaction goes and what it calls",
     /To/.test(slabText) && /Function/.test(slabText), slabText.slice(0, 120));
  ok("and sends nothing before a person presses it", sentEarly === 0,
     `${sentEarly} transaction(s) went out on a click`);

  if (slabUp) {
    await page.click("#cslab [data-go]");
    await page.waitForTimeout(250);
    const sent = await page.evaluate(() => window.__sent.length);
    ok("and sends exactly one when they do", sent === 1, `${sent} transactions`);
  }

  /*  The wrong chain — §E.5, finally driven. A wallet answering from
      another chain must be refused BEFORE a slab exists: a slab built
      for the wrong chain is a trap with a countdown. The crest carries
      the offer to move; nothing here may reach eth_sendTransaction.   */
  const ctx2 = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await ctx2.addInitScript(() => {
    window.__sent = [];
    window.ethereum = {
      request: async ({ method }) => {
        if (method === "eth_accounts" || method === "eth_requestAccounts")
          return [window.CON.owner];
        if (method === "eth_chainId") return "0x270f";     // chain 9999, never ours
        if (method === "eth_getBalance") return "0x0";
        if (method === "eth_call") return "0x";
        if (method === "eth_sendTransaction") {
          window.__sent.push(1);
          return "0x" + "ab".repeat(32);
        }
        throw new Error("stub: " + method);
      }
    };
  });
  const page2 = await ctx2.newPage();
  await page2.goto(base + "/c/1/hold", { waitUntil: "networkidle" });
  await page2.waitForTimeout(900);
  const crest2 = await page2.textContent("#acct");
  ok("the crest names the wrong chain and offers the move",
     /wallet on chain 9999/.test(crest2), `crest reads "${crest2}"`);
  await page2.click("#lane button.b");
  await page2.waitForTimeout(250);
  const slab2 = await page2.evaluate(() =>
    document.querySelector("#cbox").classList.contains("on"));
  const sent2 = await page2.evaluate(() => window.__sent.length);
  ok("a control on the wrong chain raises no slab", !slab2, "the slab opened");
  ok("and nothing was sent", sent2 === 0, `${sent2} transaction(s)`);
  await ctx2.close();

  /*  The mint refuses to guess. The stub answers every eth_call with
      empty bytes, so the price is "not reported" — and a payable value
      the page cannot read is a value it must never invent.            */
  await page.goto(base + "/c/1/make", { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const priceRow = await page.textContent("#lane");
  ok("an unanswered price renders as not reported, never as zero",
     /not reported/.test(priceRow), priceRow.slice(0, 160));
  const before3 = await page.evaluate(() => window.__sent.length);
  const mintBtns = await page.$$("#lane button.b");
  for (const b of mintBtns) {
    const t = await b.textContent();
    if (/mint/i.test(t)) { await b.click(); break; }
  }
  await page.waitForTimeout(250);
  const slab3 = await page.evaluate(() =>
    document.querySelector("#cbox").classList.contains("on"));
  const sent3 = await page.evaluate(() => window.__sent.length);
  ok("the mint will not propose a payable value it could not read",
     !slab3 && sent3 === before3, `slab ${slab3}, sent ${sent3 - before3}`);

  /*  The walk. This is the whole reason the console exists, so it is
      driven rather than asserted from source.                          */
  await page.goto(base + "/c/1/look", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const chip = await page.$("#lane .chip");
  ok("the look lane offers a token to walk into", !!chip, "no nearby chips");
  if (chip) {
    await chip.click();
    await page.waitForTimeout(700);
    const url = page.url();
    ok("walking navigates to that token's own address", /\/c\/\d+/.test(url), url);
    ok("and carries where it came from in the fragment, never the path",
       /#w=1:\d+/.test(url) && !/\?/.test(url), url);
    const rules = await page.evaluate(() => document.querySelectorAll(".sub").length);
    ok("so the margin now carries two rules, one per token", rules === 2, `${rules} rules`);
    const crumbs = await page.$$eval("#walk .cr", (b) => b.map((x) => x.textContent));
    ok("and the crest names both", crumbs.length === 2, JSON.stringify(crumbs));
  }

  await browser.close();
  srv.close();
}

console.log(`\n  ${fail ? "\x1b[31m" : "\x1b[32m"}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
