#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the instrument is not a browser

  A deck used to live in this document: up to four contract-rendered pages,
  live, inside the instrument. It worked. It was the wrong idea, and the
  property worth testing now is its absence.

  Opening a surface left two documents running, each with its own loop, one
  of them showing a DIFFERENT token from the one you were inside. That is
  not a performance bug with a throttle for an answer — it is a design
  where the place you were going had to fit inside the thing you were
  leaving.

  So: no iframe is ever created, whatever you click. A node opens its own
  control or the plate, both drawn here. And the one way out is `/connect`,
  which binds a wallet and then LEAVES, so the loop ends with the document
  rather than being paced down behind another one.

  Absence is the hardest thing to test, because a suite that checks a
  feature is gone passes just as well when the whole page is broken. So
  this drives the instrument first — nodes, palette, keys — and only then
  asserts what did not happen.

    node tools/verify-instrument.mjs
───────────────────────────────────────────────────────────────────────────*/
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { chromium } from "playwright";

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${n}`);
  if (!c && d !== undefined) console.log(`      ${d}`);
};
const eq = (n, g, w) => ok(n, String(g) === String(w), `got ${g}\n      want ${w}`);
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);

const DOC = "dist/ipseity.min.html";
if (!existsSync(DOC)) { console.error("run tools/build-engine.mjs first"); process.exit(1); }
const engine = readFileSync(DOC, "utf8");

/*  window.IPSE is written between <head> and <body> by tokenURI(); the
    built document has none, so the harness supplies one exactly as the
    contract would.                                                     */
const STATE = `<script>window.IPSE={id:7,collection:"0x${"11".repeat(20)}",chainId:84532,` +
  `owner:"0x${"22".repeat(20)}",seed:"0x${"33".repeat(32)}",hue:34,form:0,` +
  `rot:[0,0,0,0,0,0],w:32768,ops:3,xfers:1,strata:2,open:0}</script>`;

const served = [];
const srv = createServer((req, res) => {
  const path = req.url.split("?")[0];
  if (path === "/" ) {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(engine.replace("</head>", STATE + "</head>"));
  }
  served.push(path);
  res.writeHead(200, { "Content-Type": "text/html" });
  /*  Every stub carries an input, so the "something is typed in it" guard
      has something real to find.                                       */
  res.end(`<!doctype html><title>${path}</title><body style="background:#030206;color:#ddd">` +
          `<h1 id=who>${path}</h1><input id=f><script>document.title=${JSON.stringify(path)}</script>`);
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${srv.address().port}`;

/*  The image pins a browser build that this Playwright version does not
    name the same way, so the binary is given explicitly rather than
    resolved — a resolver that guesses wrong prints an install banner and
    looks like a missing dependency instead of a version mismatch.     */
const EXE = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
             "/opt/pw-browsers/chromium/chrome-linux/chrome"].find((p) => existsSync(p));
const browser = await chromium.launch({
  executablePath: EXE,
  args: ["--use-gl=swiftshader", "--no-sandbox", "--disable-dev-shm-usage"]
});
/*  Small enough that a software rasteriser can keep up. The deck's
    geometry is checked against this width, not against a desktop's, so
    the numbers below are the ones this viewport produces.            */
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
const page = await ctx.newPage();

/*  Let the instrument boot, then stop its frame loop.

    The deck is a DOM system: tabs, iframes, a CSS inset. None of it needs
    the raymarcher to have drawn anything. But this machine has no GPU, and
    a 4-D distance field at 900x700 through a software rasteriser pins the
    main thread hard enough that `evaluate` never returns — which reads
    exactly like a page that failed to boot, and cost an hour to tell
    apart. Three frames is enough for initGL, the first resize and the
    quality ladder's first reading; after that the loop is a no-op and the
    thread belongs to the test.

    Nothing in the engine knows about this. It is done from outside, before
    the document's own script runs, so no byte of the shipped instrument
    exists to make it testable.                                         */
await page.addInitScript(() => {
  const raf = window.requestAnimationFrame.bind(window);
  let n = 0;
  window.requestAnimationFrame = (cb) => (n++ < 3 ? raf(cb) : 0);
});
/*  A provider, announced the EIP-6963 way, because `/connect` is the
    behaviour under test and it does nothing without one. It answers the
    three calls the instrument makes and nothing else: a fake that
    implemented more would be a fake that could disagree with a wallet in
    ways this file would then be asserting.                            */
await page.addInitScript(() => {
  const ACCT = "0x2222222222222222222222222222222222222222";
  const provider = {
    request: async ({ method }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [ACCT];
      if (method === "eth_chainId") return "0x14a34";
      return null;
    },
    on: () => {}, removeListener: () => {}
  };
  const info = { uuid: "test", name: "Probe", icon: "data:,", rdns: "test.probe" };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider",
    { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  window.ethereum = provider;
  addEventListener("load", announce);
});

const errs = [];
page.on("pageerror", (e) => errs.push(String(e.message)));
/*  Kept apart on purpose. A thrown exception is a defect; a console
    resource error is not necessarily one — closing a pane sets its src to
    about:blank and removes it, and a document still fetching when that
    happens reports ERR_CONNECTION_RESET. That is the tear-down working. */
const noise = [];
page.on("console", (m) => { if (m.type() === "error") noise.push(m.text()); });
/*  The instrument compiles a raymarching shader before it is interactive
    and this may be a software rasteriser, so the wait is generous and the
    marker is a thing the document owns rather than a load event.     */
await page.goto(base + "/", { waitUntil: "commit", timeout: 90000 });
/*  Timer polling, not the default. `waitForFunction` polls on
    requestAnimationFrame, and this document's own render loop owns every
    frame — under a software rasteriser the poll is starved for as long as
    you are willing to wait, which reads exactly like a page that never
    booted.                                                              */
/*  An explicit evaluate loop rather than waitForFunction. The latter polls
    on requestAnimationFrame by default and this document's render loop owns
    every frame; under a software rasteriser the poll is starved for as long
    as you care to wait, which reads exactly like a page that never booted.
    An evaluate runs as an ordinary task and gets through.               */
{
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    up = await Promise.race([
      page.evaluate(() => typeof window.__palette === "function").catch(() => false),
      new Promise((r) => setTimeout(() => r(false), 5000))
    ]);
    if (!up) await new Promise((r) => setTimeout(r, 500));
    if (!up && i % 10 === 9) {
      const st = await Promise.race([
        page.evaluate(() => document.readyState).catch((e) => "eval:" + e.message.slice(0, 40)),
        new Promise((r) => setTimeout(() => r("blocked"), 4000))]);
      console.log(`      still waiting (${i + 1}) readyState=${st} errs=${errs.length ? errs[0].slice(0, 120) : "none"}`);
    }
  }
  if (!up) { console.error("  the instrument never became responsive"); process.exit(1); }
}
await page.waitForTimeout(1500);

head("the instrument comes up over a real origin");
ok("no uncaught error while booting", errs.length === 0, errs.join("\n      "));
ok("and no deck element is in the document at all", await page.evaluate(() =>
  !document.getElementById("deck") && !document.getElementById("dkrail") &&
  !document.getElementById("dkwrap") && !document.getElementById("dkhead")),
  "a deck element survived the excision");
ok("the veil is gone entirely", await page.evaluate(() =>
  !document.getElementById("veil") && !document.getElementById("veilf")));

/*  The deck's own functions are module-scope inside one <script>, so the
    harness reaches them the way a person does: through the palette and
    through the nodes.                                                  */
const pal = async (text) => {
  await page.evaluate(() => window.__palette());
  await page.fill("#palq", text);
  await page.waitForTimeout(150);
  return page.$$eval("#pallist .pi", (els) => els.map((e) => ({
    t: e.querySelector(".pt").textContent, d: e.querySelector(".pd").textContent })));
};
/*  Frames that LOAD A ROUTE, which is the thing the instrument must never
    do again. The discriminator is the attribute, and it is exact rather
    than convenient: a deck pane was `src="/swap"` — a document fetched
    from the origin — while the NEST sets `srcdoc` from metadata this
    document already holds and never asks the origin for anything.

    So `src` present means the instrument went and got a page. That is the
    property under test. Whether the nest should exist at all is a separate
    question about the artwork, and a test that conflated the two would
    answer it by accident.                                             */
const frames = () => page.$$eval("iframe[src]", (els) => els.map((e) => e.getAttribute("src")));
const anyFrames = () => page.$$eval("iframe", (els) => els.length);

head("the instrument works");
{
  const n = await page.$$eval("#nodes .nd", (els) => els.length);
  ok("its nodes are in orbit", n > 0, "no nodes rendered at all");
  ok("the palette opens", (await pal("")).length > 0, "the palette produced no rows");
  await page.keyboard.press("Escape");
  ok("and the field has a canvas", await page.evaluate(() => !!document.querySelector("canvas")));
}

head("no node opens a web page");
{
  /*  Every node, clicked, one after another. The old behaviour branched
      four ways on conditions no viewer could see and two of them loaded a
      document; the property now is that none of them can.            */
  const clicked = await page.evaluate(async () => {
    const els = Array.from(document.querySelectorAll("#nodes .nd"));
    for (const e of els) { e.click(); await new Promise((r) => setTimeout(r, 60)); }
    return els.length;
  });
  await page.waitForTimeout(400);
  ok(`all ${clicked} nodes were clicked`, clicked > 0);
  eq("and not one of them fetched a page from the origin", (await frames()).length, 0);
  /*  Reported rather than asserted, because it is the nest and the nest is
      a decision not a defect. A number here that is not 0 or 1 would mean
      something else opened, and that WOULD be a defect.              */
  const total = await anyFrames();
  ok("and the only frame that exists is the nest, if it was opened", total <= 1,
     total + " frames exist — something other than the nest opened one");
  console.log("      " + total + " frame(s) in the document, none loaded from the origin");

  /*  Something answered, though — silence would pass this test and would
      also mean the nodes had stopped working.                         */
  const answered = await page.evaluate(() =>
    document.getElementById("sheet").classList.contains("open") ||
    !document.getElementById("plate").hidden);
  ok("but a node still answers, in this document", answered,
     "clicking every node produced nothing at all");
}

head("the door ring is gone with the deck it opened");
{
  const doors = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#nodes .nd")).map((e) => e.textContent.trim()));
  for (const gone of ["Swap", "Launch", "Lock", "Social", "Gallery", "Archive"])
    ok(`no "${gone}" node orbits any more`, !doors.includes(gone), doors.join(" "));
  console.log(`      ${doors.length} nodes, all the instrument's own`);
}

head("the palette has no vocabulary for opening surfaces");
{
  const o = await pal("open");
  ok("`open` reaches nothing", !o.some((r) => /^open (swap|door|chat)/.test(r.t)),
     JSON.stringify(o.map((r) => r.t).slice(0, 5)));
  const c = await pal("close");
  ok("`close` reaches nothing", !c.some((r) => /^close/.test(r.t)),
     JSON.stringify(c.map((r) => r.t).slice(0, 5)));
  await page.keyboard.press("Escape");
}

head("`/connect` binds a wallet and then leaves");
{
  const rows = await pal("/connect");
  ok("typing /connect finds it, slash and all", rows.length > 0, "no row matched");
  ok("and it says it will leave",
     rows.some((r) => /leave/i.test(r.d)), JSON.stringify(rows.map((r) => r.d)));

  /*  The navigation is the assertion. Waited for rather than polled,
      because it is the whole point: the loop ends with the document.  */
  /*  `/c/7`, not `/door`, and the id is the assertion rather than a detail.
      This waited on /door for as long as the flat site's front page was
      where /connect went — one address for every token in the edition, so
      a holder who had just been turning #7 arrived somewhere that did not
      know which token they were holding. The label above it already read
      "for the console" while the pattern below it still read /door, which
      is how a test goes on passing after the thing it describes has
      changed underneath it.                                            */
  const gone = page.waitForURL(/\/c\/7$/, { timeout: 15000 }).then(() => true).catch(() => false);
  await page.evaluate(() => document.querySelectorAll("#pallist .pi")[0].click());
  ok("pressing it leaves the instrument for THIS token's console", await gone,
     "still on " + page.url());
  ok("and the instrument is not left running underneath",
     await page.evaluate(() => !document.querySelector("canvas")),
     "the field survived the navigation");
}

head("no error the whole way through");
ok("nothing threw", errs.length === 0, errs.slice(0, 4).join("\n      "));

await browser.close();
srv.close();
console.log(`\n  ${fail ? "\x1b[31m" : "\x1b[32m"}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
