#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · what the instrument costs to hold

  Reported as a phone getting hot. That is not a bug you can read out of
  the source, because nothing in it is wrong — the loop is correct, the
  quality ladder is correct, and together they ask a device for everything
  it has for as long as the page is open.

  Two facts made it:

    · The loop never stopped. After ninety-six still frames the
      accumulator blends each new one at a ninety-seventh, so the picture
      is finished — and it kept computing a whole one, sixty times a
      second, to add almost nothing to it.

    · The ladder climbs while the frame rate holds. A capable phone holds
      sixty frames at the top tier, so the ladder settles at a hundred and
      ninety raymarch steps per pixel at full resolution and stays there.
      Sustaining sixty frames and being pleasant to hold are different
      goals and it only knew the first.

  Neither is visible in a screenshot and neither is measurable by reading.
  So this counts the thing that actually costs: draw calls that reach the
  GPU. `drawArrays` is hooked before the document loads, the loop is left
  alone to run at its own rate, and the rate is measured — idle, and
  while the solid is being turned.

    node tools/verify-thermal.mjs
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
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);

/*  Overridable, so the same measurement can be pointed at the document a
    chain is actually serving rather than at the one just built. A local
    build passing tells you the file is right, not that the deployment
    has it.                                                            */
const DOC = process.env.DOC || "dist/ipseity.min.html";
if (!existsSync(DOC)) { console.error("run tools/build-engine.mjs first"); process.exit(1); }
const engine = readFileSync(DOC, "utf8");
const STATE = `<script>window.IPSE={id:7,collection:"0x${"11".repeat(20)}",chainId:84532,` +
  `owner:"0x${"22".repeat(20)}",seed:"0x${"33".repeat(32)}",hue:34,form:0,` +
  `rot:[0,0,0,0,0,0],w:32768,ops:3,xfers:1,strata:2,open:0}</script>`;

const srv = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  const path = req.url.split("?")[0];
  if (path === "/") return res.end(engine.replace("</head>", STATE + "</head>"));
  /*  A stub that animates, because the thing under test is whether a pane
      nobody is looking at keeps thinking. A static stub would pass by
      having nothing to stop.                                          */
  res.end(`<h1 id=who>${path}</h1><input id=f><script>
    window.__ticks = 0;
    (function loop(){ window.__ticks++; requestAnimationFrame(loop); })();
  </script>`);
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${srv.address().port}`;

const EXE = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
             "/opt/pw-browsers/chromium/chrome-linux/chrome"].find((p) => existsSync(p));
/*  Tiny on purpose, and this is the whole reason the measurement is
    possible at all. This machine has no GPU: a 4-D distance field at any
    real size through a software rasteriser pins the main thread so hard
    that `evaluate` never returns, which is why the deck's harness throttles
    the loop to three frames and measures nothing about pacing.

    Here the loop must be left alone — its pacing IS the thing under test —
    so the field is made small enough that a rasteriser can keep up. What
    is measured is the RATIO between idle and in-use, and a ratio does not
    care how big the picture was.                                       */
const browser = await chromium.launch({
  executablePath: EXE,
  args: ["--use-gl=swiftshader", "--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage({ viewport: { width: 200, height: 160 } });

/*  Count what costs, before the document that will do it exists. Every
    pass of the field, the accumulator, the bloom pyramid and the
    composite ends in a drawArrays; counting them counts GPU work in the
    only unit this file has.

    rAF is deliberately NOT throttled here, unlike the deck's harness —
    the loop's own pacing is the thing under test, and a harness that
    paced it would be measuring itself.                                */
await page.addInitScript(() => {
  window.__draws = 0;
  const patch = (proto) => {
    if(!proto) return;
    const d = proto.drawArrays;
    proto.drawArrays = function(...a){ window.__draws++; return d.apply(this, a); };
  };
  patch(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  patch(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
});

await page.goto(base + "/", { waitUntil: "domcontentloaded" });

/*  Long enough for the accumulator to converge (ninety-six frames) and
    for the ladder to have made at least one decision.                 */
await page.waitForTimeout(9000);

const rate = async (ms) => {
  const a = await page.evaluate(() => window.__draws);
  await page.waitForTimeout(ms);
  const b = await page.evaluate(() => window.__draws);
  return (b - a) / (ms / 1000);
};

head("the field draws when there is something to draw");
{
  const idle = await rate(2500);
  console.log(`      idle: ${idle.toFixed(1)} draw calls/sec`);

  /*  Counted in draw calls, not frames: one frame is the field, the
      accumulator, both halves of the bloom pyramid and the composite —
      about thirteen. So the number to read is the RATIO, which is what a
      battery feels, and an absolute threshold here would be a threshold
      on how many passes the renderer happens to have.               */
  ok("but it is not frozen either, because the shader moves on time",
     idle > 0, "nothing drew at all");

  /*  And it must wake instantly. A throttle that had to be waited out
      would read as lag on the first touch, which is worse than heat. */
  const box = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  const before = await page.evaluate(() => window.__draws);
  for (let i = 0; i < 24; i++) {
    await page.mouse.move(box.x + i * 6, box.y + i * 3);
    await page.waitForTimeout(40);
  }
  const after = await page.evaluate(() => window.__draws);
  await page.mouse.up();
  const moving = (after - before) / (24 * 0.04);
  console.log(`      turning the solid: ${moving.toFixed(1)} draw calls/sec`);

  const ratio = moving / Math.max(idle, 0.01);
  ok("a converged, untouched field costs a fraction of one being turned",
     ratio > 4, `only ${ratio.toFixed(1)}x — the throttle is not biting`);
  ok("and turning it brings the field straight back, with no wake-up lag",
     moving > idle * 1.8,
     `idle ${idle.toFixed(1)}/sec vs turning ${moving.toFixed(1)}/sec — no wake`);
  console.log(`      ${ratio.toFixed(1)}x the work only while it is being used`);
}

head("the ladder has a ceiling it may not climb past");
{
  /*  Read from the source rather than from the page. The engine's
      top-level bindings are not reachable from an injected evaluate, and
      exporting them onto window purely to be testable would put a byte in
      the shipped instrument that exists for this file's benefit — which
      the deck's harness already refuses to do, for the same reason.   */
  const src = readFileSync("engine/ipseity.html", "utf8");
  ok("the ladder's climb is bounded by a tier ceiling",
     /tier\s*<\s*TIER_CEIL/.test(src),
     "the ladder still climbs to TIERS.length - 1 regardless of device");
  ok("and by a scale ceiling",
     /Math\.min\(SCALE_CEIL/.test(src), "scale still climbs to 1 regardless of device");
  ok("the ceiling is lower on something held in a hand",
     /HANDHELD\s*\?\s*2/.test(src) && /pointer:coarse/.test(src), "no handheld ceiling");
  ok("lower again when the reader asked for less motion",
     /prefers-reduced-motion/.test(src) && /CALM\s*\?/.test(src), "reduced motion is ignored");
  /*  The bug this one is for: the ladder starts at tier 2, which is ABOVE
      the reduced-motion ceiling, and would only ever have come down by
      failing to keep up — the ceiling would have been silently useless
      for the readers who most needed it.                             */
  ok("and the tier it starts at is clamped to its own ceiling",
     /let tier = Math\.min\(2, TIER_CEIL\)/.test(src),
     "tier starts at a fixed 2 and can begin above the ceiling");
}

head("a page nobody is looking at stops");
{
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { get: () => true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hidden = await rate(1500);
  console.log(`      hidden: ${hidden.toFixed(1)} draw calls/sec`);
  ok("hiding the document stops the field entirely", hidden === 0,
     `${hidden.toFixed(1)}/sec while hidden`);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { get: () => false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(400);
  const back = await rate(1200);
  ok("and coming back starts it again", back > 0, "it never woke up");
}

head("the copy inside the token yields the thread to it");
{
  /*  The deck is gone and with it the four panes this block used to
      drive. What survives of the same fault is the one place two
      complete raymarchers still run on one main thread: the token
      opened inside itself. No throttle of the host's own could reach
      that, and the idle throttle in particular could not — the host is
      not idle while an inner section is open, it is being turned, which
      is precisely the state the idle path declines to slow.

      Driven through the class the real open sets, because that IS the
      state: `on` is what puts the inner section on the screen and what
      the yield reads, one fact in one place. Opening it the whole way
      would need a chain to answer tokenURI, which is not a dependency a
      thermal measurement should carry — and the frame it would load is
      a second software raymarcher on a machine with no GPU, which on
      this machine measures the rasteriser and not the engine.       */
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { get: () => false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(600);

  const box = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  /*  Turned, both times, and for the same duration. A host measured
      still against a host measured moving would credit the yield with
      work the idle throttle was already doing.                      */
  const turning = async () => {
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    const a = await page.evaluate(() => window.__draws);
    for (let i = 0; i < 24; i++) {
      await page.mouse.move(box.x + i * 6, box.y + i * 3);
      await page.waitForTimeout(40);
    }
    const b = await page.evaluate(() => window.__draws);
    await page.mouse.up();
    await page.waitForTimeout(250);
    return (b - a) / (24 * 0.04);
  };

  const alone = await turning();
  console.log(`      turning it with nothing else open: ${alone.toFixed(1)} draw calls/sec`);

  const opened = await page.evaluate(() => {
    const n = document.getElementById("nest");
    if (!n) return false;
    n.classList.add("on");
    return n.classList.contains("on");
  });
  ok("the inner section has somewhere to open into", opened,
     "#nest is not in the document");

  const sharing = await turning();
  console.log(`      turning it with a section open inside: ${sharing.toFixed(1)} draw calls/sec`);

  const yielded = alone / Math.max(sharing, 0.01);
  ok("the host drops to a walking pace while a section is open inside it",
     yielded > 2.5,
     `only ${yielded.toFixed(1)}x less work — the host is still running flat out`);

  /*  Yielding, not stopping. An inner section hangs in the middle of the
      host's field; a host frozen mid-turn behind it reads as a crash,
      and a test that accepted zero here would pass a worse instrument. */
  ok("and it yields rather than stopping, so the field behind it still moves",
     sharing > 0, "the host froze completely behind the inner section");

  await page.evaluate(() => document.getElementById("nest").classList.remove("on"));
  await page.waitForTimeout(500);
  const back = await turning();
  console.log(`      after closing it: ${back.toFixed(1)} draw calls/sec`);
  ok("and it takes the thread back when the section is closed",
     back > sharing * 1.8,
     `${back.toFixed(1)}/sec after closing against ${sharing.toFixed(1)}/sec while open`);
  console.log(`      ${yielded.toFixed(1)}x less work while two documents share one thread`);

  /*  The ladder, read from source for the same reason as the block
      above: a climb measured in frames per second cannot tell a slow
      device from a busy one, and with a section open it would read the
      copy's cost as the phone failing.                              */
  const src = readFileSync("engine/ipseity.html", "utf8");
  ok("and the quality ladder does not climb on the borrowed thread",
     /nestUp\(\)\s*&&\s*tier > 0/.test(src),
     "the ladder still climbs while an inner section holds the thread");
  ok("the yield reads the same class that puts the section on the screen",
     !/nestLive/.test(src) && /classList\.contains\("on"\)/.test(src),
     "there is a second flag beside the class that can fall out of step");
}

await browser.close();
srv.close();
console.log(`\n  ${fail ? "\x1b[31m" : "\x1b[32m"}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);