#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · shots

  Opens the documents the chain returned in a real browser, drives them,
  and writes stills. This is the only tool in here that renders anything —
  everything else reads bytes. It exists because a WebGL instrument that
  compiles is not the same claim as a WebGL instrument that draws.

  Console errors and page errors are collected and reported; a document
  that throws fails the run.

    node tools/shots.mjs
    node tools/shots.mjs --tokens 1,3,5
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "dist/gallery");
const SHOTS = path.join(DIR, "shots");
const ARGV = process.argv.slice(2);
const arg = (f, d) => { const i = ARGV.indexOf(f); return i < 0 ? d : ARGV[i + 1]; };

const man = JSON.parse(fs.readFileSync(path.join(DIR, "gallery.json"), "utf8"));
const want = String(arg("--tokens", man.tokens.map((t) => t.id).join(",")))
  .split(",").map(Number);

fs.mkdirSync(SHOTS, { recursive: true });

let fail = 0;
const ok = (name, cond, detail) => {
  cond ? 0 : fail++;
  console.log(`  ${cond ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${name}`);
  if (!cond && detail) console.log(`      ${detail}`);
};

/*  The container ships its own Chromium; use it rather than asking
    Playwright to fetch a matching build. */
const CHROME = (() => {
  if (process.env.PW_CHROME) return process.env.PW_CHROME;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  const hit = fs.existsSync(base) && fs.readdirSync(base)
    .filter((d) => d.startsWith("chromium-"))
    .map((d) => path.join(base, d, "chrome-linux/chrome"))
    .find((f) => fs.existsSync(f));
  return hit || undefined;
})();

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader",
         "--ignore-gpu-blocklist", "--enable-webgl", "--allow-file-access-from-files"]
});

/*  Anything the document says out loud, kept per page so a failure names
    the document that produced it. */
function watch(page, bag) {
  page.on("console", (m) => { if (m.type() === "error") bag.push("console: " + m.text()); });
  page.on("pageerror", (e) => bag.push("threw: " + e.message));
  page.on("frameattached", (f) => f);
}

/*──────────────────── the instrument, one token at a time ────────────────────*/
console.log("\n  \x1b[1mthe instrument\x1b[0m");
for (const id of want) {
  const t = man.tokens.find((x) => x.id === id);
  const bag = [];
  /*  SwiftShader is doing the raymarching here, so keep the pixel count
      honest — a 2x buffer at desktop size drops the frame rate far enough
      that the screenshot's own wait for a settled frame times out. */
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(120000);
  watch(page, bag);
  await page.goto(pathToFileURL(path.join(DIR, `token-${id}.html`)).href);

  // the document inflates itself and then rewrites the whole page
  await page.waitForFunction(() => !!window.IPSE, null, { timeout: 20000 }).catch(() => {});
  const drew = await page.waitForFunction(() => {
    const c = document.getElementById("field");
    if (!c) return false;
    const gl = c.getContext("webgl2");
    return !!gl && c.width > 0 && document.body.classList.contains("up");
  }, null, { timeout: 30000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(2500);

  const shot = path.join(SHOTS, `instrument-${id}.png`);
  await page.screenshot({ path: shot, timeout: 120000 });

  const seen = await page.evaluate(() => ({
    id: window.IPSE && window.IPSE.id,
    form: window.IPSE && window.IPSE.form,
    hue: window.IPSE && window.IPSE.hue,
    deg: getComputedStyle(document.documentElement).getPropertyValue("--h").trim(),
    canvas: !!document.getElementById("field")
  }));

  ok(`#${id} ${String(t.name).padEnd(11)} draws  ` +
     `(form ${seen.form}, hue ${seen.hue} → ${seen.deg}°)`, drew && seen.id === id,
     bag.slice(0, 3).join("\n      "));
  /*  The hue on chain is a byte and the interface is tinted in degrees.
      Anything that reports a token's colour has to agree with the document
      about which one it is. */
  ok(`    and is tinted ${t.deg}°, the same as the record says`,
     Number(seen.deg) === t.deg && seen.hue === t.hue,
     `document ${seen.hue}/${seen.deg}°, record ${t.hue}/${t.deg}°`);
  if (bag.length) console.log(`      \x1b[2m${bag.length} message(s): ${bag[0]}\x1b[0m`);
  await page.close();
}

/*──────────────────── the gallery page ────────────────────*/
console.log("\n  \x1b[1mthe gallery page\x1b[0m");
{
  const bag = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(120000);
  watch(page, bag);
  await page.goto(pathToFileURL(path.join(DIR, "gallery.html")).href);
  await page.waitForSelector(".plate");

  ok("eight plates rendered", (await page.locator(".plate").count()) === man.tokens.length);
  ok("the strip is populated", (await page.locator(".cell").count()) >= 4);
  ok("traits are listed", (await page.locator("#traits .row").count()) >= 10);
  ok("the state block is not empty",
     (await page.locator("#state").innerText()).includes("collection"));

  const hue1 = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--h").trim());
  await page.locator(".plate").nth(2).click();
  await page.waitForTimeout(900);
  const hue2 = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--h").trim());
  ok("picking a plate retints the page", hue1 !== hue2, `${hue1} then ${hue2}`);
  ok("and moves the record",
     (await page.locator("#recname").innerText()).includes(man.tokens[2].name));

  /*  An SVG that will not parse is still an <img> in the DOM; only decoding
      it says so. The eighth solid's still was a parse error for a while and
      every assertion that counted elements was happy about it. */
  const undecodable = await page.evaluate(async () => {
    const bad = [];
    for (const i of document.querySelectorAll(".plate img, #quartet, #coverimg")) {
      if (!i.getAttribute("src")) continue;
      try { await i.decode(); } catch { bad.push(i.alt || i.id); }
    }
    return bad;
  });
  ok("every still and every elevation decodes as an image", undecodable.length === 0,
     undecodable.join(", "));

  await page.locator(".plate").first().click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, "gallery-top.png"), timeout: 120000 });

  await page.locator("#start").click();
  ok("pressing start takes the cover down", await page.locator("#cover").isHidden());

  /*  Not "a canvas appeared" — the frame has to have inflated the document,
      read its state block, taken a WebGL2 context and finished coming up.
      A cheaper assertion here is the assertion that let a broken loader
      through in the first place. */
  const child = await (await page.locator("#frame").elementHandle()).contentFrame();
  const alive = await child.waitForFunction(() => {
    const c = document.getElementById("field");
    return !!c && !!c.getContext("webgl2") && document.body.classList.contains("up");
  }, null, { timeout: 40000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(3000);
  ok("the stage runs the real document in a sandboxed frame", alive,
     bag.slice(0, 3).join("\n      "));

  await page.locator("#stage").screenshot({ path: path.join(SHOTS, "stage.png"), timeout: 120000 });

  await page.locator('.views button[data-view="phone"]').click();
  await page.waitForTimeout(2500);
  await page.locator("#stage").screenshot({ path: path.join(SHOTS, "stage-phone.png"), timeout: 120000 });

  await page.locator('.views button[data-view="desk"]').click();
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById("rail").scrollIntoView());
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, "gallery-rail.png"), timeout: 120000 });

  if (bag.length) console.log(`      \x1b[2m${bag.length} message(s): ${bag[0]}\x1b[0m`);
  await page.close();
}

/*──────────────────── the site viewer ────────────────────*/
const viewer = path.join(ROOT, "dist/site/viewer.html");
if (fs.existsSync(viewer)) {
  console.log("\n  \x1b[1mthe site viewer\x1b[0m");
  const bag = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(120000);
  watch(page, bag);
  await page.goto(pathToFileURL(viewer).href);
  await page.waitForSelector(".rail button");

  const n = await page.locator(".rail button").count();
  ok(`every route is on the rail (${n})`, n >= 10);
  ok("and the first one is showing", (await page.locator("#path").innerText()) === "/");

  /*  The one mechanism in this page that is not just markup: a link inside
      a sandboxed frame has nowhere to navigate, so it asks the page around
      it to switch. If that ever stops working the site is a set of dead
      ends and nothing about the markup would say so.                    */
  const frame = await (await page.locator("#frame").elementHandle()).contentFrame();
  await frame.locator('a[href="chat.html"]').first().click();
  await page.waitForTimeout(600);
  ok("a link inside a frame moves the page around it",
     (await page.locator("#path").innerText()) === "/chat",
     await page.locator("#path").innerText());

  await page.locator(".rail button").nth(12).click();
  await page.waitForTimeout(400);
  ok("and a route that is not a page is shown as what it is",
     await page.locator("#raw").isVisible());

  await page.locator(".rail button").first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, "site-door.png"), timeout: 120000 });
  await page.locator(".rail button").nth(1).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, "site-commons.png"), timeout: 120000 });

  if (bag.length) console.log(`      \x1b[2m${bag.length} message(s): ${bag[0]}\x1b[0m`);
  await page.close();
}

await browser.close();

const files = fs.readdirSync(SHOTS);
console.log(`\n  \x1b[1mwrote\x1b[0m`);
for (const f of files.sort())
  console.log(`      dist/gallery/shots/${f}  ` +
              `${(fs.statSync(path.join(SHOTS, f)).size / 1024).toFixed(0)} KB`);
console.log(fail ? `\n  \x1b[31m${fail} failed\x1b[0m\n` : "\n  \x1b[32mall clear\x1b[0m\n");
process.exit(fail ? 1 : 0);
