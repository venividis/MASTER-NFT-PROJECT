#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · can a game emulator actually run on each path the token has?

  Three questions the specifications do not answer for you, so this measures
  them in a real Chromium instead.

    · WebAssembly. A modern emulator is a wasm binary. Does it compile on a
      `data:` document — the tokenURI path a marketplace loads — and what
      does a Content-Security-Policy do to it? It compiles fine on `data:`.
      A CSP carrying any script-src or default-src KILLS it, with a bare
      CompileError, unless 'wasm-unsafe-eval' is listed. So the CSP the
      sandbox finding asks for and the emulator the owner asks for are in
      direct conflict unless exactly one keyword is written correctly.

    · SharedArrayBuffer. Threaded cores and shared-memory audio ring buffers
      need it; it needs cross-origin isolation; that needs two HTTP response
      headers. A `data:` URI has neither headers nor an origin, so tokenURI
      can never be isolated. Premises.request() returns headers, so it can.

    · The nest's sandbox. `allow-scripts` and `allow-same-origin` together
      are not a sandbox. Measured below: the inner document reaches
      parent.document AND removes the sandbox attribute from its own frame,
      which is indistinguishable from having written no sandbox at all.
      Dropping allow-same-origin blocks both and costs the emulator nothing
      — wasm still compiles and AudioContext still constructs.

    node tools/probe-emulator.mjs
───────────────────────────────────────────────────────────────────────────*/
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { createServer } from "node:http";

/*  The smallest legal wasm module: (func (export "add") (param i32 i32)
    (result i32) local.get 0 local.get 1 i32.add). Nothing about the result
    depends on the module being large — a CompileError is a CompileError.  */
const WASM = new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,
                             7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,106,11]);
const B64 = Buffer.from(WASM).toString("base64");

const PROBE = `<scr` + `ipt>
(async () => {
  const r = [];
  const b = Uint8Array.from(atob("${B64}"), c => c.charCodeAt(0));
  try { const m = await WebAssembly.instantiate(b); r.push("wasm=" + m.instance.exports.add(2,3)); }
  catch (e) { r.push("wasm=ERR:" + e.constructor.name); }
  try { const a = new (window.AudioContext || window.webkitAudioContext)(); r.push("audio=" + a.state); }
  catch (e) { r.push("audio=ERR:" + e.name); }
  r.push("SharedArrayBuffer=" + typeof SharedArrayBuffer);
  r.push("crossOriginIsolated=" + window.crossOriginIsolated);
  r.push("origin=" + location.origin);
  console.log("PROBE " + r.join(" | "));
})();
</scr` + `ipt>`;

const NESTED = `<!doctype html><body>` + PROBE.replace(
  'r.push("origin=" + location.origin);',
  `try { void parent.document.title; r.push("parentDOM=REACHED"); } catch (e) { r.push("parentDOM=blocked"); }
   try { parent.document.getElementById("f").removeAttribute("sandbox"); r.push("canUnsandboxSelf=YES"); }
   catch (e) { r.push("canUnsandboxSelf=no"); }`);

const DOC = `<!doctype html><title>probe</title>` + PROBE;
const esc = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SANDBOXES = [
  ['srcdoc sandbox="allow-scripts allow-same-origin"  (BUILD.NEST ships this)', ' sandbox="allow-scripts allow-same-origin"'],
  ['srcdoc sandbox="allow-scripts"                    (real isolation)',        ' sandbox="allow-scripts"'],
  ['srcdoc with no sandbox attribute at all',                                   '']
];
const nestHost = sb => `<!doctype html><title>host</title><iframe id="f"${sb} srcdoc="${esc(NESTED)}"></iframe>`;

/*  Headers are the whole point of three of these rows, so they are set on a
    real socket rather than simulated. `/csp` is the policy a security review
    would write without thinking about wasm; `/cspwasm` is the same policy
    with the one keyword that keeps an emulator alive.                     */
const srv = createServer((req, res) => {
  const path = req.url.split("?")[0];
  const h = { "Content-Type": "text/html; charset=utf-8" };
  if (path === "/csp")     h["Content-Security-Policy"] = "default-src 'self'; script-src 'unsafe-inline'";
  if (path === "/cspwasm") h["Content-Security-Policy"] = "default-src 'self'; script-src 'unsafe-inline' 'wasm-unsafe-eval'";
  if (path === "/iso") { h["Cross-Origin-Opener-Policy"] = "same-origin"; h["Cross-Origin-Embedder-Policy"] = "require-corp"; }
  res.writeHead(200, h);
  if (path.startsWith("/nest")) return res.end(nestHost(SANDBOXES[Number(path.slice(5)) || 0][1]));
  res.end(DOC);
});
await new Promise(r => srv.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + srv.address().port;

const EXE = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
             "/opt/pw-browsers/chromium/chrome-linux/chrome"].find(p => existsSync(p));
const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

const run = async (label, go) => {
  const page = await browser.newPage();
  let line = "(no probe output)";
  page.on("console", m => { const t = m.text(); if (t.startsWith("PROBE ")) line = t.slice(6); });
  await go(page);
  await page.waitForTimeout(1200);
  console.log("  " + label.padEnd(56) + " -> " + line);
  await page.close();
};

console.log("\n  \x1b[1mwhere the emulator is allowed to exist\x1b[0m");
await run("data:text/html  (tokenURI animation_url, as marketplaces load it)",
          p => p.goto("data:text/html;base64," + Buffer.from(DOC).toString("base64")));
await run("http origin, no headers  (/token/N/live today)", p => p.goto(base + "/"));
await run("+ CSP with script-src but NOT 'wasm-unsafe-eval'", p => p.goto(base + "/csp"));
await run("+ CSP WITH 'wasm-unsafe-eval'", p => p.goto(base + "/cspwasm"));
await run("+ COOP: same-origin, COEP: require-corp", p => p.goto(base + "/iso"));

console.log("\n  \x1b[1mand whether the frame it sits in is a sandbox\x1b[0m");
for (let i = 0; i < SANDBOXES.length; i++) await run(SANDBOXES[i][0], p => p.goto(base + "/nest" + i));

console.log("\n  Read it as: wasm runs on every path, so the emulator is not the constraint.");
console.log("  SharedArrayBuffer and crossOriginIsolated turn on for exactly one row, and");
console.log("  that row is the one where a contract chose the response headers.\n");

await browser.close();
srv.close();
