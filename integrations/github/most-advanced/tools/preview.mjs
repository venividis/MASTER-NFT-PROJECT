#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · preview

  Writes dist/preview.html — the engine exactly as written, with a state
  block injected into the same gap tokenURI() writes into. Open it in a
  browser and you are looking at what a holder looks at; the only thing
  missing is a chain to write back to.

    node tools/preview.mjs
    node tools/preview.mjs --form 5 --hue 200 --w 0.4
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARGV = process.argv.slice(2);
const arg = (f, d) => { const i = ARGV.indexOf(f); return i < 0 ? d : ARGV[i + 1]; };

const TAU = Math.PI * 2;
const angleToU16 = (a) => Math.round((a / TAU) * 65536) % 65536;
const wToU16 = (w) => Math.max(0, Math.min(65535, Math.round(((w + 1.6) / 3.2) * 65535)));

/* A 24-cell, turned well out of the viewer's own 3-space so that two of the
   three planes containing w are doing visible work, and the section is cut
   just off centre where the shape is least symmetric. */
const form = Number(arg("--form", 2));
const hue  = Number(arg("--hue", 33));
const w    = Number(arg("--w", 0.22));
const rot  = [0.42, 1.90, 0.00, 0.96, 0.31, 2.35].map(angleToU16);

let word = 0n;
rot.forEach((a, i) => { word |= BigInt(a) << BigInt(i * 16); });
word |= BigInt(wToU16(w)) << 96n;
word |= BigInt(form & 0xff) << 112n;
word |= BigInt(hue & 0xff) << 120n;

const seed = "0x" + crypto.createHash("sha256").update("IPSEITY preview").digest("hex");

const state =
  "<script>window.IPSE={" +
  `id:1,collection:"0x00000000000000000000000000000000000f0451",chainId:1,` +
  `owner:"0x000000000000000000000000000000000000dead",` +
  `account:"0x0000000000000000000000000000000000000acc",` +
  `seed:"${seed}",word:"${word}",rot:[${rot.join(",")}],` +
  `w:${wToU16(w)},form:${form},hue:${hue},` +
  "ops:17,strata:6,xfers:2,open:2047,locked:0,block:21000000,depth:0,rpc:\"\"" +
  "}<\/script>";

const src = fs.readFileSync(path.join(ROOT, "engine/ipseity.html"), "utf8");
const cut = src.indexOf("</head>") + "</head>".length;
if (cut < 7) throw new Error("no </head> in the engine");

const page = src.slice(0, cut) + state + src.slice(cut);
fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "dist/preview.html"), page);

const FORMS = ["Tesseract", "Hexadecachoron", "Icositetrachoron", "Duocylinder",
               "Clifford torus", "Tiger", "Ditorus", "Quaternion Julia"];
console.log(`
  wrote dist/preview.html  (${(page.length / 1024).toFixed(1)} KB)

  solid    ${FORMS[form]}
  hue      ${hue}
  w        ${w >= 0 ? "+" : ""}${w.toFixed(3)}
  word     0x${word.toString(16).padStart(32, "0")}

  Every node is open in this preview, so every instrument can be looked at.
  Nothing can be signed - there is no chain behind it.
`);
