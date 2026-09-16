#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the site, in one page

  Takes what tools/preview-site.mjs pulled out of the contracts and binds it
  into a single self-contained document: every route, carried base64 and
  handed to a sandboxed frame, with what each one costs a node to serve.

  Nothing here is a mock-up. Each frame holds the bytes an ERC-5219 client
  receives from `request()`, root-relative links rewritten so they resolve
  against each other rather than against a server that is not there.

    node tools/preview-site.mjs && node tools/site-viewer.mjs
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "dist/site");
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");

/*  route · file · what it is · what it cost to serve, from tools/gas.mjs.
    The gas numbers are measured, not estimated; a route with none is one
    the budget does not walk.                                            */
const ROUTES = [
  ["/", "index.html", "the door: connect, and what you hold opens", "0.31M"],
  ["/chat", "chat.html", "the commons: one room, every token in it", "0.23M"],
  ["/rooms", "rooms.html", "the groups a token has entered", "0.24M"],
  ["/room/1", "room-1.html", "one group, numbered from 1", "0.29M"],
  ["/dm/2", "dm-2.html", "the room two tokens share, derived not founded", "0.24M"],
  ["/token/1", "token-1.html", "one token's counter", "0.17M"],
  ["/token/1/market", "token-1-market.html", "the swap card", "0.28M"],
  ["/token/1/pool", "token-1-pool.html", "the holder's side", "0.25M"],
  ["/token/1/rent", "token-1-rent.html", "lease the instrument by the day", "0.25M"],
  ["/token/1/vault", "token-1-vault.html", "the two hands: give, draw, verify", "0.18M"],
  ["/open", "open.html", "every market that exists, from the pool's own list", "0.08M"],
  ["/token/1/sigil.svg", "token-1-sigil.svg", "the still, drawn on chain", "3.32M"],
  ["/services.json", "services.json", "the whole site, for a program", "0.11M"],
  ["/token/1/services.json", "token-1-services.json", "one token, for a program", "0.17M"]
];

/*  A frame is its own opaque origin, so a link inside one cannot navigate
    to a sibling file — there is no server and no directory. Each page gets
    a few lines appended that catch the click and hand the filename to the
    page around it, which looks it up in the list below and swaps the frame.
    The parent trusts nothing but an exact match against a name it wrote
    itself: a frame can ask to be sent somewhere, and cannot say where. */
const HOP =
  "<script>addEventListener('click',e=>{" +
  "const a=e.target.closest&&e.target.closest('a[href]');if(!a)return;" +
  "const h=a.getAttribute('href')||'';" +
  "if(/^(https?:|data:|mailto:|#)/.test(h))return;" +
  "e.preventDefault();parent.postMessage({ipseity:h},'*')});<\/script>";

const pages = ROUTES.map(([route, file, what, gas]) => {
  const body = read(file);
  const html = !file.endsWith(".json") && !file.endsWith(".svg");
  return {
    route, file, what, gas,
    bytes: body.length,
    kind: file.endsWith(".json") ? "json" : file.endsWith(".svg") ? "svg" : "html",
    b64: Buffer.from(html ? body + HOP : body, "utf8").toString("base64")
  };
});

const manifest = JSON.parse(read("services.json"));
const total = pages.reduce((a, p) => a + p.bytes, 0);

const tpl = fs.readFileSync(path.join(ROOT, "tools/site-viewer.tpl.html"), "utf8");
const page = tpl
  .replace("__PAGES__", JSON.stringify(pages).replace(/<\//g, "<\\/"))
  .replace("__FACTS__", JSON.stringify({
    routes: pages.length, bytes: total,
    parley: manifest.parley ? manifest.parley.at : null,
    said: manifest.parley ? manifest.parley.said : null,
    chainId: manifest.chainId
  }).replace(/<\//g, "<\\/"));

const dest = path.join(DIR, "viewer.html");
fs.writeFileSync(dest, page);
console.log(`
  wrote dist/site/viewer.html  (${(page.length / 1024 / 1024).toFixed(2)} MB)

  ${pages.length} routes, ${total.toLocaleString("en-US")} bytes of contract output.
`);
