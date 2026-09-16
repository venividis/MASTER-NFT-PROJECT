#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · build the document into shards

  Two ways to put a 120 KB interface on chain.

  RAW      the document is stored as text, split at </head> so tokenURI()
           can write each token's state into the gap. Simple, and every
           byte on chain is the byte a reader will run. About 26M gas.

  PACKED   the document is gzipped whole and stored as bytes; the shards
           are prefixed by a short loader that hands them to the browser's
           own DecompressionStream. About a fifth of the size, so about a
           fifth of the gas, and a tokenURI() response small enough that
           indexers do not choke on it. DecompressionStream has shipped in
           every major browser since 2023 and is part of the platform, so
           nothing is fetched either way.

    node tools/build-engine.mjs                 packed + minified (default)
    node tools/build-engine.mjs --raw           store the text as written
    node tools/build-engine.mjs --no-min        skip minification
    node tools/build-engine.mjs --chunk 20000   shard size in bytes
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { minify } from "terser";
import { shaders, check } from "./glsl-check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARGV = process.argv.slice(2);
const has = (f) => ARGV.includes(f);
const arg = (f, d) => { const i = ARGV.indexOf(f); return i < 0 ? d : ARGV[i + 1]; };

const PACKED = !has("--raw");
const MINIFY = !has("--no-min");
const CHUNK  = Number(arg("--chunk", 20000));
const MAX_SHARD = 24575;                     // EIP-170 minus the STOP prefix

if (CHUNK > MAX_SHARD) throw new Error(`--chunk ${CHUNK} exceeds the EIP-170 ceiling`);

/* The page the loader lands in before it replaces itself. Kept deliberately
   plain: if inflation fails this is what a reader is left looking at. */
const PROLOGUE =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,' +
  'maximum-scale=1,user-scalable=no"><meta name="color-scheme" content="dark">' +
  "<title>IPSEITY</title><style>html,body{margin:0;height:100%;background:#04050a;" +
  "color:#5d6780;font:12px ui-monospace,SFMono-Regular,Menlo,monospace}</style>" +
  "</head><body>";

/*──────────────────────── minification ────────────────────────*/

async function shrink(html) {
  const scriptRe = /<script>([\s\S]*?)<\/script>/;
  const styleRe = /<style>([\s\S]*?)<\/style>/;

  const js = html.match(scriptRe);
  if (!js) throw new Error("no <script> block found in the engine");

  const out = await minify(js[1], {
    ecma: 2022,
    module: false,
    compress: { passes: 2, unsafe_arrows: true, drop_debugger: true },
    mangle: { toplevel: true, reserved: ["IPSE"] },
    format: { comments: false, ascii_only: false }
  });
  if (out.error) throw out.error;

  // the minified engine must still parse, or nothing downstream is worth doing
  new vm.Script(out.code, { filename: "engine.min.js" });

  let css = html.match(styleRe)[1];
  css = css
    .replace(/\/\*[\s\S]*?\*\//g, "")        // comments
    .replace(/\s*([{}:;,>])\s*/g, "$1")      // space around punctuation
    .replace(/;}/g, "}")
    .replace(/\s+/g, " ")
    .trim();

  // NB: function replacements, not strings. The minified engine contains
  // "$1" (it rewrites a hex string with a capture reference of its own), and
  // a string replacement would expand that against *this* regex, splicing
  // the original unminified script back in.
  return html
    .replace(styleRe, () => "<style>" + css + "</style>")
    .replace(scriptRe, () => "<script>" + out.code + "</script>")
    // collapse the whitespace between tags, but never inside them
    .replace(/>\s*\n\s*</g, "><")
    .trim();
}

/*──────────────────────── shards ────────────────────────*/

const chunk = (buf) => {
  const out = [];
  for (let i = 0; i < buf.length; i += CHUNK) out.push(buf.subarray(i, i + CHUNK));
  return out;
};
const hex = (b) => "0x" + Buffer.from(b).toString("hex");

/* Calldata is 16 gas per non-zero byte and 4 per zero byte since EIP-2028;
   code deposit is 200 gas per byte. The rest is the CREATE and the call. */
const gasFor = (b) => {
  let g = 21000 + 32000;
  for (const x of b) g += x === 0 ? 4 : 16;
  return g + b.length * 200 + 6000;
};

/*──────────────────────── build ────────────────────────*/

const srcPath = path.join(ROOT, "engine/ipseity.html");
const source = fs.readFileSync(srcPath, "utf8");

if (/window\.IPSE\s*=/.test(source.slice(0, source.indexOf("</head>"))))
  throw new Error("state must be injected by the contract, not baked into the head");
if (!/window\.IPSE/.test(source))
  throw new Error("the engine never reads window.IPSE");

/* A shader is a string until a GPU touches it, so nothing else in this
   pipeline can tell a working one from a broken one. Check before building:
   there is no point shipping a document that renders a black screen. */
{
  const S = shaders(srcPath);
  const broken = [];
  for (const [name, glsl] of Object.entries(S)) {
    if (typeof glsl !== "string") continue;
    const problems = check(name, glsl);
    if (problems.length) broken.push(`${name}: ${problems[0]}`);
  }
  if (broken.length) {
    console.error("\n  the shaders would not compile:\n");
    for (const b of broken) console.error("    " + b);
    console.error("\n  run node tools/glsl-check.mjs for the full report\n");
    process.exit(1);
  }
}

const doc = MINIFY ? await shrink(source) : source;

/* the minifier must not have broken the document's shape */
if (!/<\/head>/.test(doc)) throw new Error("minifier ate the </head>");
if (!/window\.IPSE/.test(doc)) throw new Error("minifier ate the state hook");

let headBuf, bodyBuf, note;
if (PACKED) {
  headBuf = Buffer.from(PROLOGUE, "utf8");
  bodyBuf = zlib.gzipSync(Buffer.from(doc, "utf8"), { level: 9 });
  // prove the browser will get back exactly what went in
  const back = zlib.gunzipSync(bodyBuf).toString("utf8");
  if (back !== doc) throw new Error("gzip round trip did not reproduce the document");
  note = "gzip, inflated in the browser by DecompressionStream";
} else {
  const cut = doc.indexOf("</head>") + "</head>".length;
  headBuf = Buffer.from(doc.slice(0, cut), "utf8");
  bodyBuf = Buffer.from(doc.slice(cut), "utf8");
  note = "plain text, split at </head>";
}

const H = chunk(headBuf);
const B = chunk(bodyBuf);

const plan = {
  mode: PACKED ? "packed" : "raw",
  minified: MINIFY,
  chunkBytes: CHUNK,
  sourceBytes: Buffer.byteLength(source, "utf8"),
  documentBytes: Buffer.byteLength(doc, "utf8"),
  storedBytes: headBuf.length + bodyBuf.length,
  inflatedSize: PACKED ? Buffer.byteLength(doc, "utf8") : 0,
  note,
  head: H.map((b, i) => ({ i, bytes: b.length, gas: gasFor(b), data: hex(b) })),
  body: B.map((b, i) => ({ i, bytes: b.length, gas: gasFor(b), data: hex(b) }))
};

fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "dist/shards.json"), JSON.stringify(plan, null, 1));
fs.writeFileSync(path.join(ROOT, "dist/ipseity.min.html"), doc);

/*──────────────────────── report ────────────────────────*/
const all = [...plan.head, ...plan.body];
const totalGas = all.reduce((a, x) => a + x.gas, 0);
// the animation_url is base64 of the document, and the JSON around it is
// base64'd again on the way out of tokenURI()
const b64 = Math.ceil(plan.storedBytes / 3) * 4;
const uriKB = Math.ceil((b64 * 1.37 + 3000) / 1024);
const pct = (a, b) => ((a / b) * 100).toFixed(1) + "%";

console.log(`
  IPSEITY · shard plan
  ───────────────────────────────────────────────────────────────
  source              ${plan.sourceBytes.toLocaleString()} bytes
  after minifying     ${plan.documentBytes.toLocaleString()} bytes   ${pct(plan.documentBytes, plan.sourceBytes)} of source
  stored on chain     ${plan.storedBytes.toLocaleString()} bytes   ${pct(plan.storedBytes, plan.sourceBytes)} of source
  mode                ${plan.note}
  ───────────────────────────────────────────────────────────────
  head                ${headBuf.length.toLocaleString()} bytes -> ${H.length} shard(s)
  body                ${bodyBuf.length.toLocaleString()} bytes -> ${B.length} shard(s)
  transactions        ${all.length} load(s) + 1 freeze
  storage gas         ~${(totalGas / 1e6).toFixed(2)}M
  tokenURI response   ~${uriKB} KB
  ───────────────────────────────────────────────────────────────`);
all.forEach((s, i) => console.log(
  `  ${String(i).padStart(2, "0")}  ${i < H.length ? "loadHead" : "loadBody"}  ` +
  `${String(s.bytes).padStart(6)} bytes   ~${(s.gas / 1e6).toFixed(2)}M gas`));
console.log(`
  wrote dist/shards.json and dist/ipseity.min.html
  feed each .data to loadHead()/loadBody() in order, check document()
  against the source, then freeze().
`);
