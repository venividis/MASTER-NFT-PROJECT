#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the gallery page

  Takes what tools/gallery.mjs pulled off the chain and binds it into one
  self-contained page: the eight stills, the four elevations, the traits,
  the state blocks, and the instrument itself — the real document, carried
  base64 and handed to a sandboxed frame on demand.

  Nothing is fetched at run time except the typefaces.

    node tools/gallery.mjs && node tools/gallery-page.mjs
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "dist/gallery");
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");
const b64 = (f) => Buffer.from(read(f), "utf8").toString("base64");

const man = JSON.parse(read("gallery.json"));

/*  The state block, exactly as the renderer wrote it, broken at the commas
    that separate fields rather than the ones inside rot[]. Nothing is
    reformatted — only newlines are added. */
function unfold(src) {
  let depth = 0, quoted = false, out = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) { out += ch; if (ch === '"' && src[i - 1] !== "\\") quoted = false; continue; }
    if (ch === '"') { quoted = true; out += ch; continue; }
    if (ch === "[" || ch === "{") depth++;
    if (ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 1) { out += ",\n  "; continue; }
    if (ch === "{" && depth === 1) { out += "{\n  "; continue; }
    if (ch === "}" && depth === 0) { out += "\n}"; continue; }
    out += ch;
  }
  return out;
}

function stateOf(html) {
  const m = html.match(/self\.\$IPSE=\["((?:[^"\\]|\\.)*)"/);
  if (!m) throw new Error("no state block in the document");
  const block = JSON.parse('"' + m[1].replace(/\\x3c/g, "<") + '"');
  const body = block.replace(/^<script>/, "").replace(/<\/script>$/, "");
  return unfold(body.replace(/^window\.IPSE=/, "IPSE = "));
}

const traitOf = (t, k) => (t.attributes.find((a) => a.trait_type === k) || {}).value;

const tokens = man.tokens.map((t) => {
  const doc = read(`token-${t.id}.html`);
  return {
    id: t.id, name: t.name, solid: String(traitOf(t, "Solid")),
    word: t.word, open: t.open, hue: t.hue, deg: t.deg, w: t.w, account: t.account,
    attributes: t.attributes, bytes: t.bytes, gas: t.gas,
    state: stateOf(doc),
    sigil: b64(`sigil-${t.id}.svg`),
    quartet: b64(`quartet-${t.id}.svg`),
    doc: Buffer.from(doc, "utf8").toString("base64")
  };
});

/*  A field that goes missing here does not break anything loudly - it tints
    the page with `undefined`, which CSS ignores, and every plate comes out
    the same colour as the first. Say so instead. */
for (const t of tokens)
  for (const k of ["id", "name", "solid", "hue", "deg", "w", "open", "state", "sigil", "quartet", "doc"])
    if (t[k] === undefined || t[k] === null || t[k] === "")
      throw new Error(`token ${t.id} is missing ${k}`);

const data = {
  storedBytes: man.storedBytes, inflatedSize: man.inflatedSize,
  collection: man.collection, tokens
};

const tpl = fs.readFileSync(path.join(ROOT, "tools/gallery.tpl.html"), "utf8");
if (!tpl.includes("__DATA__")) throw new Error("the template has no __DATA__ slot");
const page = tpl.replace("__DATA__", JSON.stringify(data).replace(/<\//g, "<\\/"));

const dest = path.join(DIR, "gallery.html");
fs.writeFileSync(dest, page);

console.log(`
  wrote dist/gallery/gallery.html  (${(page.length / 1024 / 1024).toFixed(2)} MB)

  ${tokens.length} plates, each carrying its own still, its four elevations,
  its traits, its state block, and the whole document.
`);
