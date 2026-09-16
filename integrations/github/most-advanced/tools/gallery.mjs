#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the gallery

  Everything else in tools/ measures the collection. This one looks at it.

  It stands the whole thing up on a real EVM exactly as tools/verify.mjs
  does — Engine, Sigil, Renderer, Ipseity, the document loaded shard by
  shard and frozen — then mints one token per solid, turns each one to a
  different orientation, and pulls all three facets back out of the chain:

      facet 0   the instrument   the page a holder opens
      facet 1   the still        the SVG a marketplace shows in a grid
      facet 2   the quartet      four elevations of the same section

  Nothing here is drawn by this script. Every byte it writes came out of
  a contract call.

    node tools/gallery.mjs
    node tools/gallery.mjs --tokens 8
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, artifact } from "./compile.mjs";
import { Chain, decUint, decAddr, decString, encodeAddressArg } from "./evm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARGV = process.argv.slice(2);
const arg = (f, d) => { const i = ARGV.indexOf(f); return i < 0 ? d : ARGV[i + 1]; };
const OUT = path.join(ROOT, "dist/gallery");
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";

const TAU = Math.PI * 2;
const u16 = (a) => Math.round((a / TAU) * 65536) & 0xffff;
const wU16 = (w) => Math.max(0, Math.min(65535, Math.round(((w + 1.6) / 3.2) * 65535)));
/*  The hue held on chain is a byte. The engine spreads it across the circle
    — `--h = round(hue * 360 / 255)` — so anything that wants to be the same
    colour as the token has to do the same arithmetic. */
const degOf = (hue) => Math.round((hue * 360) / 255);

const pack = ({ rot, w, form, hue }) => {
  let x = 0n;
  rot.forEach((a, i) => { x |= BigInt(u16(a)) << BigInt(i * 16); });
  return x | (BigInt(wU16(w)) << 96n) | (BigInt(form & 0xff) << 112n) | (BigInt(hue & 0xff) << 120n);
};

/*  One per solid. The orientations are chosen, not random: each puts a
    different pair of the three planes that contain w to work, so the
    section is doing something visibly different in every one. `all` opens
    every node — the difference between a token at birth and a token whose
    holder has paid to unseal it is worth being able to see. */
const PLAN = [
  { form: 0, hue:  24, w:  0.22, rot: [0.42, 1.90, 0.00, 0.96, 0.31, 2.35], all: true  },
  { form: 1, hue:  62, w: -0.35, rot: [1.05, 0.20, 2.60, 0.44, 1.72, 0.08], all: false },
  { form: 2, hue:  98, w:  0.48, rot: [0.77, 2.41, 1.13, 0.05, 0.62, 1.88], all: true  },
  { form: 3, hue: 128, w:  0.00, rot: [2.10, 0.35, 0.90, 1.55, 0.12, 0.71], all: false },
  { form: 4, hue: 152, w:  0.61, rot: [0.18, 1.27, 2.05, 0.83, 2.90, 0.46], all: true  },
  { form: 5, hue: 186, w: -0.12, rot: [1.44, 0.66, 0.29, 2.71, 1.03, 0.51], all: false },
  { form: 6, hue: 212, w:  0.33, rot: [0.05, 2.18, 1.60, 0.24, 0.88, 3.01], all: true  },
  { form: 7, hue: 240, w: -0.55, rot: [2.63, 0.49, 0.14, 1.36, 2.22, 0.93], all: false }
];

const N = Math.max(1, Math.min(PLAN.length, Number(arg("--tokens", PLAN.length))));
const step = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);
const note = (s) => console.log(`      \x1b[2m${s}\x1b[0m`);
const mb = (n) => (Number(n) / 1e6).toFixed(2) + "M";
const kb = (n) => (n / 1024).toFixed(1) + " KB";

/*──────────────────── build ────────────────────*/
step("build");
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "dist/shards.json"), "utf8"));
if (plan.mode !== "packed") throw new Error('dist/shards.json is "' + plan.mode + '"; rebuild without --raw');
const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = {
  Engine:   artifact(out, "src/Engine.sol", "Engine"),
  Sigil:    artifact(out, "src/Sigil.sol", "Sigil"),
  Renderer: artifact(out, "src/Renderer.sol", "Renderer"),
  Ipseity:  artifact(out, "src/Ipseity.sol", "Ipseity"),
  Registry: artifact(out, "test/mocks/ERC6551Registry.sol", "ERC6551Registry"),
  Account:  artifact(out, "src/IpseityAccount.sol", "IpseityAccount"),
  Grip:     artifact(out, "src/GripVault.sol", "GripVault")
};
note("contracts compiled");

/*──────────────────── deploy ────────────────────*/
step("deploy");
const c = await Chain.open();
{
  const tmp = await c.deploy(A.Registry.bytecode, "", "registry");
  const { createAddressFromString } = await import("@ethereumjs/util");
  const code = await c.vm.stateManager.getCode(createAddressFromString(tmp));
  await c.vm.stateManager.putCode(createAddressFromString(REGISTRY), code);
}
const engine = await c.deploy(A.Engine.bytecode, "0".repeat(63) + "1", "Engine");
const sigil = await c.deploy(A.Sigil.bytecode, "", "Sigil");
const renderer = await c.deploy(A.Renderer.bytecode, encodeAddressArg(engine) + encodeAddressArg(sigil), "Renderer");
const acctImpl = await c.deploy(A.Account.bytecode, "", "IpseityAccount");
const gripImpl = await c.deploy(A.Grip.bytecode, "", "GripVault");
const nft = await c.deploy(A.Ipseity.bytecode,
  encodeAddressArg(renderer) + encodeAddressArg(acctImpl) + encodeAddressArg(gripImpl) + (1).toString(16).padStart(64, "0") + (4096).toString(16).padStart(64, "0"), "Ipseity");
note(`Ipseity ${nft}`);

for (const s of plan.head) await c.exec(engine, "loadHead(bytes)", [s.data]);
for (const s of plan.body) await c.exec(engine, "loadBody(bytes)", [s.data]);
await c.exec(engine, "setInflatedSize(uint32)", [plan.inflatedSize]);
await c.exec(engine, "freeze()", []);
note(`document loaded and frozen — ${plan.storedBytes.toLocaleString()} bytes on chain`);

/*──────────────────── mint, turn, unseal ────────────────────*/
step(`${N} tokens`);
const tokens = [];
for (let i = 0; i < N; i++) {
  const id = i + 1;
  const spec = PLAN[i];
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const word = pack(spec);
  await c.exec(nft, "commit(uint256,uint256)", [id, word]);
  await c.exec(nft, "embody(uint256)", [id]);
  if (spec.all) {
    for (let node = 0; node < 12; node++) {
      const open = Number(decUint(await c.read(nft, "statsOf(uint256)", [id]), 3));
      if (open & (1 << node)) continue;
      await c.exec(nft, "openNode(uint8)".replace("(uint8)", "(uint256,uint8)"), [id, node],
                   { value: 2n * 10n ** 15n });
    }
  }
  const held = decUint(await c.read(nft, "sectionOf(uint256)", [id]));
  if (held !== word) throw new Error(`token ${id}: chain holds ${held}, wrote ${word}`);
  const open = Number(decUint(await c.read(nft, "statsOf(uint256)", [id]), 3));
  /*  Read the orientation back out of the word rather than echoing the plan.
      hue is one byte, so a plan asking for 282 would be recorded here as 26
      and the page would tint itself a colour the token is not. */
  const form = Number((held >> 112n) & 0xffn);
  const hue = Number((held >> 120n) & 0xffn);
  const wOut = (Number((held >> 96n) & 0xffffn) / 65535) * 3.2 - 1.6;
  tokens.push({ id, word: word.toString(), open, spec,
                form, hue, deg: degOf(hue), w: wOut,
                account: decAddr(await c.read(nft, "account(uint256)", [id])) });
  console.log(`  \x1b[32m·\x1b[0m #${id}  form ${spec.form}  hue ${spec.hue}  ` +
              `w ${spec.w >= 0 ? "+" : ""}${spec.w.toFixed(2)}  open 0x${open.toString(16)}`);
}

/*──────────────────── pull all three facets back out ────────────────────*/
step("read the facets back off the chain");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const facet = async (id, i) => {
  const uri = decString(await c.read(nft, "tokenURIAt(uint256,uint256)", [id, i]));
  const meta = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString("utf8"));
  return { meta, gas: c.lastGas };
};
const media = (u) => Buffer.from(u.split(",")[1], "base64").toString("utf8");

for (const t of tokens) {
  const inst = await facet(t.id, 0);
  const still = await facet(t.id, 1);
  const quart = await facet(t.id, 2);

  const html = media(inst.meta.animation_url);
  const svg = media(still.meta.image);
  const four = media(quart.meta.image);
  if (!html.startsWith("<!DOCTYPE html>")) throw new Error(`token ${t.id}: not a document`);
  if (!svg.startsWith("<svg ")) throw new Error(`token ${t.id}: still is not an SVG`);

  /*  An SVG is XML, and XML has exactly two characters that cannot appear
      raw in character data. One of them was in the eighth solid's notation,
      which made that token's image a parse error rather than a picture. */
  for (const [what, doc] of [["still", svg], ["elevations", four]]) {
    const text = doc.replace(/<[^>]*>/g, "");
    const loose = text.match(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/);
    if (text.includes("<") || loose)
      throw new Error(`token ${t.id}: the ${what} is not well-formed XML — ` +
                      `${text.includes("<") ? "a bare <" : "a bare &"} in character data`);
  }

  fs.writeFileSync(path.join(OUT, `token-${t.id}.html`), html);
  fs.writeFileSync(path.join(OUT, `sigil-${t.id}.svg`), svg);
  fs.writeFileSync(path.join(OUT, `quartet-${t.id}.svg`), four);
  fs.writeFileSync(path.join(OUT, `token-${t.id}.json`), JSON.stringify(inst.meta, null, 1));

  t.name = inst.meta.name;
  t.description = inst.meta.description;
  t.attributes = inst.meta.attributes;
  t.bytes = { instrument: html.length, still: svg.length, quartet: four.length };
  t.gas = { instrument: Number(inst.gas), still: Number(still.gas), quartet: Number(quart.gas) };
  console.log(`  \x1b[32m✓\x1b[0m #${t.id} ${String(t.name).padEnd(14)} ` +
              `instrument ${kb(html.length).padStart(9)} / ${mb(inst.gas).padStart(6)}   ` +
              `still ${kb(svg.length).padStart(8)} / ${mb(still.gas).padStart(6)}   ` +
              `quartet ${kb(four.length).padStart(8)}`);
}

const manifest = {
  collection: nft, chainId: 1, engine, sigil, renderer,
  storedBytes: plan.storedBytes, inflatedSize: plan.inflatedSize,
  tokens: tokens.map((t) => ({
    id: t.id, name: t.name, word: t.word, open: t.open,
    form: t.form, hue: t.hue, deg: t.deg, w: t.w, account: t.account,
    attributes: t.attributes, bytes: t.bytes, gas: t.gas
  }))
};
fs.writeFileSync(path.join(OUT, "gallery.json"), JSON.stringify(manifest, null, 1));

step("wrote");
console.log(`      dist/gallery/  ${fs.readdirSync(OUT).length} files, ` +
            kb(fs.readdirSync(OUT).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0)));
console.log(`
  Every file above came back out of a contract call. Open any
  dist/gallery/token-N.html in a browser and you are looking at exactly
  what a marketplace receives — the document inflates itself, reads the
  state block the renderer wrote into it, and draws.
`);
