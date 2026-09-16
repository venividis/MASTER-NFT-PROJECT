#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · end to end, on a real EVM

  Compiles the contracts, deploys the whole collection into an in-process
  EVM at Cancun, loads the document shard by shard, freezes it, mints,
  and then pulls tokenURI() back out and takes it apart: base64 → JSON →
  base64 → gzip → the document. The document that comes back has to be the
  same bytes that went in, and the state written into it has to be the
  state the contract actually holds.

  Then it turns the solid, commits, and checks that what comes back has
  changed in exactly the ways it should have.

    node tools/verify.mjs
    node tools/verify.mjs --raw     verify the uncompressed storage mode
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { compile, artifact } from "./compile.mjs";
import {
  Chain, enc, sel, decUint, decAddr, decBool, decString, decStringArray, encodeAddressArg
} from "./evm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = process.argv.includes("--raw");
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${name}`);
  if (!cond && detail !== undefined) console.log(`      ${detail}`);
};
const eq = (name, got, want) =>
  ok(name, String(got) === String(want), `got ${got}\n      want ${want}`);
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);
const gas = (n) => (Number(n) / 1e6).toFixed(2) + "M";

/*──────────────────── build ────────────────────*/
head("build");
const plan = (() => {
  const p = path.join(ROOT, "dist/shards.json");
  if (!fs.existsSync(p)) throw new Error("run tools/build-engine.mjs first");
  return JSON.parse(fs.readFileSync(p, "utf8"));
})();
const wantMode = RAW ? "raw" : "packed";
if (plan.mode !== wantMode)
  throw new Error(`dist/shards.json is "${plan.mode}"; rebuild with ${RAW ? "--raw" : "(no flag)"}`);
const DOC = fs.readFileSync(path.join(ROOT, "dist/ipseity.min.html"), "utf8");
ok(`shard plan is ${plan.mode}`, true);
console.log(`      ${plan.storedBytes.toLocaleString()} bytes on chain across ` +
            `${plan.head.length + plan.body.length} shard(s)`);

const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = {
  Engine:   artifact(out, "src/Engine.sol", "Engine"),
  Sigil:    artifact(out, "src/Sigil.sol", "Sigil"),
  Renderer: artifact(out, "src/Renderer.sol", "Renderer"),
  Ipseity:  artifact(out, "src/Ipseity.sol", "Ipseity"),
  Registry: artifact(out, "test/mocks/ERC6551Registry.sol", "ERC6551Registry"),
  Verifier: artifact(out, "test/mocks/MockVerifier.sol", "MockVerifier"),
  Receiver: artifact(out, "test/mocks/MockReceiver.sol", "MockReceiver"),
  Account:  artifact(out, "src/IpseityAccount.sol", "IpseityAccount"),
  Grip:     artifact(out, "src/GripVault.sol", "GripVault")
};
ok("contracts compile", true);

/*──────────────────── deploy ────────────────────*/
head("deploy");
const c = await Chain.open();

// the canonical 6551 registry lives at a fixed address; put the reference
// implementation there so derivations are checked against the real thing
const tmpRegistry = await c.deploy(A.Registry.bytecode, "", "registry");
{
  const { createAddressFromString } = await import("@ethereumjs/util");
  const code = await c.vm.stateManager.getCode(createAddressFromString(tmpRegistry));
  await c.vm.stateManager.putCode(createAddressFromString(REGISTRY), code);
}
ok("ERC-6551 registry placed at the canonical address", (await c.codeSize(REGISTRY)) > 0);

const engine = await c.deploy(A.Engine.bytecode, RAW ? "0".repeat(64) : "0".repeat(63) + "1", "Engine");
const sigil = await c.deploy(A.Sigil.bytecode, "", "Sigil");
const renderer = await c.deploy(
  A.Renderer.bytecode, encodeAddressArg(engine) + encodeAddressArg(sigil), "Renderer");
const acctImpl = await c.deploy(A.Account.bytecode, "", "IpseityAccount");
const gripImpl = await c.deploy(A.Grip.bytecode, "", "GripVault");
const nft = await c.deploy(A.Ipseity.bytecode,
  encodeAddressArg(renderer) + encodeAddressArg(acctImpl) + encodeAddressArg(gripImpl) + (1).toString(16).padStart(64, "0") + (4096).toString(16).padStart(64, "0"), "Ipseity");
console.log(`      Engine ${engine}\n      Sigil  ${sigil}\n      Renderer ${renderer}\n      Ipseity ${nft}`);

/*──────────────────── load the document ────────────────────*/
head("load the document into contract state");
let loadGas = 0n;
for (const s of plan.head) {
  const r = await c.exec(engine, "loadHead(bytes)", [s.data], { label: "loadHead" });
  loadGas += r.gas;
}
for (const s of plan.body) {
  const r = await c.exec(engine, "loadBody(bytes)", [s.data], { label: "loadBody" });
  loadGas += r.gas;
}
if (!RAW) await c.exec(engine, "setInflatedSize(uint32)", [plan.inflatedSize]);
await c.exec(engine, "freeze()", []);

const sizes = await c.read(engine, "sizes()");
eq("head bytes stored", decUint(sizes, 0), plan.head.reduce((a, s) => a + s.bytes, 0));
eq("body bytes stored", decUint(sizes, 1), plan.body.reduce((a, s) => a + s.bytes, 0));
ok("engine is frozen", decBool(await c.read(engine, "frozen()")));
console.log(`      real cost of loading: ${gas(loadGas)} gas ` +
            `(the plan estimated ~${(plan.head.concat(plan.body).reduce((a, s) => a + s.gas, 0) / 1e6).toFixed(2)}M)`);

let threw = false;
try { await c.exec(engine, "loadBody(bytes)", ["0xdeadbeef"]); } catch { threw = true; }
ok("a frozen engine refuses more shards", threw);

/*──────────────────── mint ────────────────────*/
head("mint");
const mint = await c.exec(nft, "mint()", [], { value: 10n ** 16n, label: "mint" });
eq("totalSupply", decUint(await c.read(nft, "totalSupply()")), 1);
eq("owner of #1", decAddr(await c.read(nft, "ownerOf(uint256)", [1])).toLowerCase(),
   c.from.toString().toLowerCase());
console.log(`      mint cost ${gas(mint.gas)} gas`);

const word0 = decUint(await c.read(nft, "sectionOf(uint256)", [1]));
ok("section word is inside 128 bits", word0 < (1n << 128n), word0.toString(16));
const form0 = Number((word0 >> 112n) & 0xffn);
ok("solid is one of the eight", form0 < 8, "form=" + form0);

let underpaid = false;
try { await c.exec(nft, "mint()", [], { value: 1n }); } catch { underpaid = true; }
ok("an underpaid mint is refused", underpaid);

/*──────────────────── the document comes back ────────────────────*/
head("tokenURI round trip");
const uriRaw = await c.read(nft, "tokenURI(uint256)", [1]);
const uri = decString(uriRaw);
ok("tokenURI is a data URI", uri.startsWith("data:application/json;base64,"));
console.log(`      ${(uri.length / 1024).toFixed(1)} KB returned`);

/* The binding read limit is the node's eth_call gas cap. go-ethereum
   defaults to 50M; the engineering target is well under 30M. */
const uriGas = c.lastGas;
const gasCap = RAW ? 45_000_000n : 30_000_000n;
ok(`tokenURI reads for under ${Number(gasCap) / 1e6}M gas` +
   (RAW ? " (raw storage costs more to read — this is why packed is the default)"
        : " — inside every node's eth_call cap"),
   uriGas < gasCap, `${(Number(uriGas) / 1e6).toFixed(2)}M`);
console.log(`      tokenURI costs ${(Number(uriGas) / 1e6).toFixed(2)}M gas to read`);

const meta = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString("utf8"));
ok("metadata parses as JSON", !!meta.name);
eq("name", meta.name, "IPSEITY #1");
ok("has an image", String(meta.image || "").startsWith("data:image/svg+xml;base64,"));
ok("has an animation", String(meta.animation_url || "").startsWith("data:text/html;base64,"));
ok("has attributes", Array.isArray(meta.attributes) && meta.attributes.length >= 10);

const html = Buffer.from(meta.animation_url.split(",")[1], "base64").toString("utf8");
console.log(`      document: ${(html.length / 1024).toFixed(1)} KB`);

let recovered;
if (RAW) {
  ok("the head is intact", html.startsWith("<!DOCTYPE html>"));
  // the injected state sits between </head> and <body>; lift it back out
  recovered = html.replace(/<script>window\.IPSE=\{[\s\S]*?\}<\/script>/, "");
} else {
  const m = html.match(/,"([A-Za-z0-9+/=]+)"\];<\/script>/);
  ok("the loader carries a payload", !!m);
  recovered = zlib.gunzipSync(Buffer.from(m[1], "base64")).toString("utf8");
  ok("the loader calls DecompressionStream", html.includes("DecompressionStream"));

  /*  document.open() clears the document and keeps the Window. Anything the
      loader declares at the top level is therefore still declared while the
      engine is being written in - and the engine is minified, so its own
      top-level names are single letters. A `const D` on both sides is one
      binding declared twice, and document.write() throws before anything is
      drawn. The loader must put its payload on a property and read it from
      inside a function. */
  const loader = html.slice(html.indexOf("<script>self.$IPSE="));
  const outside = loader.replace(/\(async\(\)=>\{[\s\S]*\}\)\(\)/, "");
  ok("the loader hands the payload over on a property, not a global binding",
     loader.startsWith("<script>self.$IPSE=["));
  ok("and declares nothing at all in global scope — a name declared here is " +
     "still declared after document.open(), and would collide with the engine",
     !/\b(?:const|let|var|function|class)\b/.test(outside),
     outside.slice(0, 160));
}

ok("the document that comes back is byte-for-byte the document that went in",
   recovered === DOC,
   `chain ${recovered.length} bytes vs source ${DOC.length} bytes`);

/*──────────────────── the state written into it ────────────────────*/
head("state injected into the document");
const stateSrc = RAW
  ? (html.match(/window\.IPSE=\{[\s\S]*?\}<\/script>/) || [])[0]
  : (html.match(/self\.\$IPSE=\["((?:[^"\\]|\\.)*)"/) || [])[1];
ok("a state block was written into the gap", !!stateSrc);

const stateJson = RAW
  ? stateSrc.replace(/^window\.IPSE=/, "").replace(/<\/script>$/, "")
  : JSON.parse('"' + stateSrc.replace(/\\x3c/g, "<") + '"')
      .replace(/^<script>window\.IPSE=/, "").replace(/<\/script>$/, "");

const IPSE = new Function("return (" + stateJson + ")")();
eq("state.id", IPSE.id, 1);
eq("state.collection", IPSE.collection.toLowerCase(), nft.toLowerCase());
eq("state.owner", IPSE.owner.toLowerCase(), c.from.toString().toLowerCase());
eq("state.word", IPSE.word, word0.toString());
eq("state.form", IPSE.form, form0);
eq("state.hue", IPSE.hue, Number((word0 >> 120n) & 0xffn));
eq("state.rot has six angles", IPSE.rot.length, 6);
ok("state.rot matches the packed word",
   IPSE.rot.every((a, i) => BigInt(a) === ((word0 >> BigInt(i * 16)) & 0xffffn)),
   JSON.stringify(IPSE.rot));
/*  Derived from the rule rather than typed, because a hand-typed mask is
    what let this drift: the constant said 0x587 — Market born open, Nest
    sealed — while the comment above it and the principle it states both
    said the opposite. An assertion that repeats the number cannot catch
    the number being wrong.                                            */
{
  const NODES = ["Self", "Rotate", "Section", "Send", "Assets", "Call",
                 "Sign", "Scan", "Vault", "Issue", "Market", "Nest"];
  const LOOKS_ONLY = ["Self", "Rotate", "Section", "Scan", "Vault", "Nest"];
  const want = LOOKS_ONLY.reduce((m, n) => m | (1 << NODES.indexOf(n)), 0);
  eq("state.open is the birth bitmap", IPSE.open, want);
  eq("and the birth bitmap is exactly the instruments that only look",
     "0x" + want.toString(16), "0x987");
  const born = NODES.filter((_, i) => (want >> i) & 1);
  ok("no instrument that moves value is born open",
     !born.some((n) => ["Send", "Assets", "Call", "Sign", "Issue", "Market"].includes(n)),
     born.join(", "));
  console.log("      born open: " + born.join(", "));
}
eq("state.depth", IPSE.depth, 0);

const acct = decAddr(await c.read(nft, "account(uint256)", [1]));
eq("bound account agrees with the registry", IPSE.account.toLowerCase(), acct.toLowerCase());
ok("the document is not empty of engine", recovered.includes("#version 300 es"));

/*──────────────────── the loop closes ────────────────────*/
head("the token rewrites what it renders");
const newWord =
  (1234n) | (5678n << 16n) | (9012n << 32n) |
  (30000n << 48n) | (40000n << 64n) | (50000n << 80n) |
  (48000n << 96n) | (2n << 112n) | (200n << 120n);
const commit = await c.exec(nft, "commit(uint256,uint256)", [1, newWord], { label: "commit" });
eq("section word was rewritten", decUint(await c.read(nft, "sectionOf(uint256)", [1])), newWord);
console.log(`      commit cost ${gas(commit.gas)} gas`);

const stats = await c.read(nft, "statsOf(uint256)", [1]);
eq("ops", decUint(stats, 0), 1);
eq("strata", decUint(stats, 2), 1);

const uri2 = decString(await c.read(nft, "tokenURI(uint256)", [1]));
ok("tokenURI changed after the commit", uri2 !== uri);
const meta2 = JSON.parse(Buffer.from(uri2.split(",")[1], "base64").toString("utf8"));
const traitVal = (m, k) => (m.attributes.find((a) => a.trait_type === k) || {}).value;
eq("the Solid trait followed the word", traitVal(meta2, "Solid"), "Icositetrachoron");
eq("the Hue trait followed the word", traitVal(meta2, "Hue"), 200);
eq("turned through w", traitVal(meta2, "Turned through w"), "nearly edge on");
ok("the still image changed too", meta2.image !== meta.image);

const html2 = Buffer.from(meta2.animation_url.split(",")[1], "base64").toString("utf8");
const doc2 = RAW
  ? html2.replace(/<script>window\.IPSE=\{[\s\S]*?\}<\/script>/, "")
  : zlib.gunzipSync(Buffer.from(html2.match(/,"([A-Za-z0-9+/=]+)"\];<\/script>/)[1], "base64")).toString("utf8");
ok("the engine itself did not change — only the state around it", doc2 === DOC);

let badForm = false;
try { await c.exec(nft, "commit(uint256,uint256)", [1, 8n << 112n]); } catch { badForm = true; }
ok("a solid that does not exist cannot be committed", badForm);
let overflow = false;
try { await c.exec(nft, "commit(uint256,uint256)", [1, 1n << 200n]); } catch { overflow = true; }
ok("bits above the section word are refused", overflow);

/*──────────────────── the still image ────────────────────*/
head("the sigil, drawn on chain");
const svg = Buffer.from(meta2.image.split(",")[1], "base64").toString("utf8");
ok("is an svg", svg.startsWith("<svg"));
ok("has a path with real geometry", /<path d="M-?\d/.test(svg), svg.slice(0, 200));
const coords = (svg.match(/-?\d+,-?\d+/g) || []);
ok("the projection produced points", coords.length > 40, coords.length + " points");
const inRange = coords.every((p) => {
  const [x, y] = p.split(",").map(Number);
  return x > -3000 && x < 4000 && y > -3000 && y < 4000;
});
ok("every projected point is on a sane canvas", inRange);

for (let f = 0; f < 8; f++) {
  const w = (BigInt(f) << 112n) | (32768n << 96n) | 4000n | (9000n << 48n);
  const raw = await c.read(sigil, "path(uint256,bytes32)", [w, "0x" + "ab".repeat(32)]);
  const d = decString(raw);
  ok(`solid ${f} projects to a non-empty path`, d.length > 20, `${d.length} chars`);
}

/*──────────────────── standards ────────────────────*/
head("standards");
const IDS = {
  "ERC-165": "0x01ffc9a7", "ERC-721": "0x80ac58cd", "ERC-721Metadata": "0x5b5e139f",
  "ERC-721Enumerable": "0x780e9d63", "ERC-2981": "0x2a55205a", "ERC-4906": "0x49064906",
  "ERC-4907": "0xad092b5c", "ERC-5192": "0xb45a3c0e", "ERC-6454": "0x91a6262f",
  "ERC-7572": "0xe8a3d485", "ERC-7160": "0x06e1bc5b", "ERC-7496": "0xaf332f3e",
  "ERC-173": "0x7f5828d0"
};
for (const [name, id] of Object.entries(IDS)) {
  const r = await c.call(nft, sel("supportsInterface(bytes4)") + id.slice(2).padEnd(64, "0"));
  ok(`declares ${name}`, decBool(r));
}
const bogus = await c.call(nft, sel("supportsInterface(bytes4)") + "ffffffff".padEnd(64, "0"));
ok("refuses 0xffffffff, as ERC-165 requires", !decBool(bogus));

head("ERC-173 · collection administration");
eq("owner() is the curator", decAddr(await c.read(nft, "owner()")).toLowerCase(),
   c.from.toString().toLowerCase());

head("ERC-2981 royalties");
const roy = await c.read(nft, "royaltyInfo(uint256,uint256)", [1, 10n ** 18n]);
eq("5% of 1 ether", decUint(roy, 1), 5n * 10n ** 16n);

head("ERC-7160 · the solid has more than one face");
const faces = decStringArray(await c.read(nft, "tokenURIs(uint256)", [1]), 1);
eq("three faces", faces.length, 3);
const f1 = JSON.parse(Buffer.from(faces[1].split(",")[1], "base64").toString("utf8"));
const f2 = JSON.parse(Buffer.from(faces[2].split(",")[1], "base64").toString("utf8"));
eq("face 1 is the sigil", f1.name, "IPSEITY #1 - The sigil");
ok("face 1 carries no animation", f1.animation_url === undefined);
eq("face 2 is the quartet", f2.name, "IPSEITY #1 - The quartet");
const quartet = Buffer.from(f2.image.split(",")[1], "base64").toString("utf8");
ok("the quartet draws four elevations", (quartet.match(/<path d="M/g) || []).length === 4,
   (quartet.match(/<path d="M/g) || []).length + " paths");
const single = decString(await c.read(nft, "tokenURIAt(uint256,uint256)", [1, 1]));
eq("tokenURIAt serves one face without pulling all three", single, faces[1]);
ok("not pinned to begin with", !decBool(await c.read(nft, "hasPinnedTokenURI(uint256)", [1])));
await c.exec(nft, "pinTokenURI(uint256,uint256)", [1, 1], { label: "pin" });
ok("pinning takes", decBool(await c.read(nft, "hasPinnedTokenURI(uint256)", [1])));
const pinnedUri = JSON.parse(
  Buffer.from(decString(await c.read(nft, "tokenURI(uint256)", [1])).split(",")[1], "base64").toString("utf8"));
eq("tokenURI now serves the pinned face", pinnedUri.name, "IPSEITY #1 - The sigil");
await c.exec(nft, "unpinTokenURI(uint256)", [1]);

head("ERC-7496 · traits read straight off the chain");
const trait = (k) => c.read(nft, "getTraitValue(uint256,bytes32)",
  [1, "0x" + Buffer.from(k, "utf8").toString("hex").padEnd(64, "0")]);
eq("solid", decUint(await trait("solid")), 2);
eq("hue", decUint(await trait("hue")), 200);
eq("strata", decUint(await trait("strata")), 1);
eq("nodes open", decUint(await trait("nodes")), 6);
eq("section word", decUint(await trait("section")), newWord);
await c.exec(nft, "setTrait(uint256,bytes32,bytes32)",
  [1, "0x" + Buffer.from("hue", "utf8").toString("hex").padEnd(64, "0"), 77], { label: "setTrait" });
eq("hue is settable", decUint(await trait("hue")), 77);
let notSettable = false;
try {
  await c.exec(nft, "setTrait(uint256,bytes32,bytes32)",
    [1, "0x" + Buffer.from("strata", "utf8").toString("hex").padEnd(64, "0"), 9]);
} catch { notSettable = true; }
ok("a derived trait refuses to be set, as ERC-7496 requires", notSettable);
ok("trait metadata is a data URI",
   decString(await c.read(nft, "getTraitMetadataURI()")).startsWith("data:application/json;base64,"));

head("ERC-7572 · the collection itself");
const cURI = decString(await c.read(nft, "contractURI()"));
const cMeta = JSON.parse(Buffer.from(cURI.split(",")[1], "base64").toString("utf8"));
eq("collection name", cMeta.name, "IPSEITY");
ok("collection has an image", String(cMeta.image).startsWith("data:image/svg+xml;base64,"));

/*  A token handed to its own hand can never be moved again: the account
    asks whether the caller holds the token, and the holder would be the
    account. The hub refuses both hands rather than documenting the hole. */
head("the hands cannot hold the token that made them");
{
  const reach = decAddr(await c.read(nft, "account(uint256)", [1]));
  const grip  = decAddr(await c.read(nft, "grip(uint256)", [1]));
  ok("a token is not transferable to its own Reach",
     !decBool(await c.read(nft, "isTransferable(uint256,address,address)",
       [1, c.from.toString(), reach])), reach);
  ok("nor to its own Grip",
     !decBool(await c.read(nft, "isTransferable(uint256,address,address)",
       [1, c.from.toString(), grip])), grip);
  let froze = false;
  try {
    await c.exec(nft, "transferFrom(address,address,uint256)",
      [c.from.toString(), reach, 1]);
  } catch { froze = true; }
  ok("and the transfer itself reverts, not merely the view", froze);
  ok("while an ordinary address is still fine",
     decBool(await c.read(nft, "isTransferable(uint256,address,address)",
       [1, c.from.toString(), "0x" + "33".repeat(20)])));
}

head("ERC-5192 / ERC-6454 · binding");
ok("transferable to begin with",
   decBool(await c.read(nft, "isTransferable(uint256,address,address)",
     [1, c.from.toString(), "0x" + "22".repeat(20)])));
await c.exec(nft, "lock(uint256)", [1], { label: "lock" });
ok("locked() says so", decBool(await c.read(nft, "locked(uint256)", [1])));
ok("and it is no longer transferable",
   !decBool(await c.read(nft, "isTransferable(uint256,address,address)",
     [1, c.from.toString(), "0x" + "22".repeat(20)])));
let blocked = false;
try {
  await c.exec(nft, "transferFrom(address,address,uint256)",
    [c.from.toString(), "0x" + "22".repeat(20), 1]);
} catch { blocked = true; }
ok("a bound token will not move", blocked);
await c.exec(nft, "unlock(uint256)", [1]);

head("ERC-4907 · lending the instrument");
const renter = "0x" + "33".repeat(20);
await c.exec(nft, "setUser(uint256,address,uint64)",
  [1, renter, 4102444800n], { label: "setUser" });
eq("userOf", decAddr(await c.read(nft, "userOf(uint256)", [1])).toLowerCase(), renter);
await c.fund(renter, 10n ** 18n);
// the renter can turn the solid…
const renterCommit = await c.vm.evm.runCall({
  to: (await import("@ethereumjs/util")).createAddressFromString(nft),
  caller: (await import("@ethereumjs/util")).createAddressFromString(renter),
  origin: (await import("@ethereumjs/util")).createAddressFromString(renter),
  data: (await import("@ethereumjs/util")).hexToBytes(enc("commit(uint256,uint256)", [1, newWord])),
  gasLimit: 5_000_000n, value: 0n
});
ok("the borrower can operate the instrument", !renterCommit.execResult.exceptionError);
// …but cannot give it away
const renterMove = await c.vm.evm.runCall({
  to: (await import("@ethereumjs/util")).createAddressFromString(nft),
  caller: (await import("@ethereumjs/util")).createAddressFromString(renter),
  origin: (await import("@ethereumjs/util")).createAddressFromString(renter),
  data: (await import("@ethereumjs/util")).hexToBytes(
    enc("transferFrom(address,address,uint256)", [c.from.toString(), renter, 1])),
  gasLimit: 5_000_000n, value: 0n
});
ok("but cannot transfer it", !!renterMove.execResult.exceptionError);

head("ERC-6551 · the bound account");
const embody = await c.exec(nft, "embody(uint256)", [1], { label: "embody" });
ok("the account now exists", (await c.codeSize(acct)) > 0, `${await c.codeSize(acct)} bytes`);
console.log(`      ${acct}`);

head("transfers");
const bob = "0x" + "44".repeat(20);
await c.exec(nft, "transferFrom(address,address,uint256)", [c.from.toString(), bob, 1],
  { label: "transferFrom" });
eq("new owner", decAddr(await c.read(nft, "ownerOf(uint256)", [1])).toLowerCase(), bob);
eq("transfer counter moved", decUint(await c.read(nft, "statsOf(uint256)", [1]), 1), 1);
eq("the lease did not survive the sale",
   decAddr(await c.read(nft, "userOf(uint256)", [1])), "0x" + "0".repeat(40));
eq("balance of the old owner", decUint(await c.read(nft, "balanceOf(address)", [c.from.toString()])), 0);
eq("balance of the new owner", decUint(await c.read(nft, "balanceOf(address)", [bob])), 1);
eq("tokenOfOwnerByIndex", decUint(await c.read(nft, "tokenOfOwnerByIndex(address,uint256)", [bob, 0])), 1);
eq("tokenByIndex", decUint(await c.read(nft, "tokenByIndex(uint256)", [0])), 1);

head("enumeration holds under churn");
for (let i = 0; i < 4; i++) await c.exec(nft, "mint()", [], { value: 10n ** 16n, label: "mint" });
eq("supply", decUint(await c.read(nft, "totalSupply()")), 5);
eq("minter holds four", decUint(await c.read(nft, "balanceOf(address)", [c.from.toString()])), 4);
await c.exec(nft, "transferFrom(address,address,uint256)", [c.from.toString(), bob, 3]);
await c.exec(nft, "transferFrom(address,address,uint256)", [c.from.toString(), bob, 5]);
const mine = [];
for (let i = 0; i < 2; i++)
  mine.push(Number(decUint(await c.read(nft, "tokenOfOwnerByIndex(address,uint256)", [c.from.toString(), i]))));
eq("owner index is still consistent", mine.sort().join(","), "2,4");
const theirs = [];
for (let i = 0; i < 3; i++)
  theirs.push(Number(decUint(await c.read(nft, "tokenOfOwnerByIndex(address,uint256)", [bob, i]))));
eq("and so is the recipient's", theirs.sort((a, b) => a - b).join(","), "1,3,5");
let oob = false;
try { await c.read(nft, "tokenOfOwnerByIndex(address,uint256)", [bob, 3]); } catch { oob = true; }
ok("reading past the end reverts", oob);

head("safeTransferFrom");
const receiver = await c.deploy(A.Receiver.bytecode, "", "MockReceiver");
await c.exec(nft, "safeTransferFrom(address,address,uint256)", [c.from.toString(), receiver, 2],
  { label: "safeTransferFrom" });
eq("a contract that accepts gets the token",
   decAddr(await c.read(nft, "ownerOf(uint256)", [2])).toLowerCase(), receiver.toLowerCase());
let rejected = false;
try {
  await c.exec(nft, "safeTransferFrom(address,address,uint256)", [c.from.toString(), engine, 4]);
} catch { rejected = true; }
ok("a contract that does not implement the hook is refused", rejected);

head("the sealed kernel (ERC-7857 in spirit, not in name)");
const verifier = await c.deploy(A.Verifier.bytecode, "", "MockVerifier");
await c.exec(nft, "setVerifier(address)", [verifier], { label: "setVerifier" });
const h1 = "0x" + "aa".repeat(32);
const h2 = "0x" + "bb".repeat(32);
await c.exec(nft, "sealKernel(uint256,bytes32[],bytes32)", [4, [h1], "0x" + "01".repeat(32)],
  { label: "sealKernel" });
eq("data hash recorded", decUint(await c.read(nft, "dataHashesOf(uint256)", [4]), 2),
   BigInt(h1));
// a proof that re-seals h1 -> h2 for a new key
const proof = "0x" + [h1, h2, "0x" + "02".repeat(32)].map((x) => x.slice(2)).join("");
let wrongProof = false;
try {
  const bad = "0x" + [h2, h2, "0x" + "02".repeat(32)].map((x) => x.slice(2)).join("");
  await c.exec(nft, "transferWithKernel(address,uint256,bytes)", [bob, 4, bad]);
} catch { wrongProof = true; }
ok("a proof about some other payload is rejected", wrongProof);
await c.exec(nft, "transferWithKernel(address,uint256,bytes)", [bob, 4, proof], { label: "kernel transfer" });
eq("the token moved", decAddr(await c.read(nft, "ownerOf(uint256)", [4])).toLowerCase(), bob);
eq("and the kernel was re-sealed",
   decUint(await c.read(nft, "sealedTo(uint256)", [4])), BigInt("0x" + "02".repeat(32)));
eq("to the new payload hash", decUint(await c.read(nft, "dataHashesOf(uint256)", [4]), 2), BigInt(h2));

/*──────────────────── curation ────────────────────*/
head("curation");
let notCurator = false;
try {
  const { createAddressFromString, hexToBytes } = await import("@ethereumjs/util");
  const r = await c.vm.evm.runCall({
    to: createAddressFromString(nft),
    caller: createAddressFromString(bob), origin: createAddressFromString(bob),
    data: hexToBytes(enc("setPricing(uint256,uint256)", [0, 0])),
    gasLimit: 5_000_000n, value: 0n
  });
  notCurator = !!r.execResult.exceptionError;
} catch { notCurator = true; }
ok("a stranger cannot reprice the collection", notCurator);
await c.exec(nft, "sealRenderer()", [], { label: "sealRenderer" });
let sealed = false;
try { await c.exec(nft, "setRenderer(address)", [renderer]); } catch { sealed = true; }
ok("a sealed renderer can never be replaced", sealed);

/*──────────────────── the two formats every label lands in ────────────────────*/
head("labels are safe in both formats they are written into");
console.log("      (the notation is dropped into SVG character data and into JSON,");
console.log("       and neither is escaped on the way out)");
for (let f = 0; f < 8; f++) {
  const n = decString(await c.read(sigil, "solidNotation(uint8)", [f]));
  ok(`solid ${f} · ${n}`, !/[<&]/.test(n),
     "a bare < or & here is a parse error in the still, not a stray character");
}
for (let f = 0; f < 8; f++) {
  const n = decString(await c.read(sigil, "solidName(uint8)", [f]));
  ok(`name ${f} · ${n}`, !/[<&"\\]/.test(n), "and this one also lands in a JSON string");
}

/*──────────────────── the preview ────────────────────*/
head("artefacts");
fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
const finalUri = decString(await c.read(nft, "tokenURI(uint256)", [1]));
const finalMeta = JSON.parse(Buffer.from(finalUri.split(",")[1], "base64").toString("utf8"));
const finalHtml = Buffer.from(finalMeta.animation_url.split(",")[1], "base64").toString("utf8");
fs.writeFileSync(path.join(ROOT, "dist/token-1.html"), finalHtml);
fs.writeFileSync(path.join(ROOT, "dist/token-1.json"), JSON.stringify(finalMeta, null, 1));
fs.writeFileSync(path.join(ROOT, "dist/sigil-1.svg"),
  Buffer.from(finalMeta.image.split(",")[1], "base64").toString("utf8"));
const q = JSON.parse(Buffer.from(
  decStringArray(await c.read(nft, "tokenURIs(uint256)", [1]), 1)[2].split(",")[1],
  "base64").toString("utf8"));
fs.writeFileSync(path.join(ROOT, "dist/quartet-1.svg"),
  Buffer.from(q.image.split(",")[1], "base64").toString("utf8"));
console.log("      dist/token-1.html   the document exactly as a marketplace receives it");
console.log("      dist/token-1.json   the metadata");
console.log("      dist/sigil-1.svg    the still, drawn on chain");
console.log("      dist/quartet-1.svg  four elevations");

/*──────────────────── gas ────────────────────*/
/*  Found by writing the page that sells this seal, and measured before it
    was fixed: `onlyHolder` admits an approved operator, so a thief holding
    a phished approval could call `unlock` and then take the token. A bolt
    an attacker can lift stops nobody, so the bolt now answers to the
    holder alone. This is the attack, run every time.                    */
head("the bolt survives a stolen approval");
{
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const bolted = Number(decUint(await c.read(nft, "totalSupply()")));
  const thief = await c.as("0x" + "7d".repeat(32));
  await c.exec(nft, "lock(uint256)", [bolted]);
  ok("the token is bolted", decBool(await c.read(nft, "locked(uint256)", [bolted])));

  await c.exec(nft, "approve(address,uint256)", [thief.from.toString(), bolted]);
  let lifted = false;
  try { await thief.exec(nft, "unlock(uint256)", [bolted]); lifted = true; } catch {}
  ok("an approved operator cannot lift it", !lifted);

  let taken = false;
  try {
    await thief.exec(nft, "transferFrom(address,address,uint256)",
      [c.from.toString(), thief.from.toString(), bolted]);
    taken = true;
  } catch {}
  ok("and therefore cannot take it", !taken);
  eq("the token did not move", decAddr(await c.read(nft, "ownerOf(uint256)", [bolted]))
     .toLowerCase(), c.from.toString().toLowerCase());

  await c.exec(nft, "unlock(uint256)", [bolted]);
  ok("while the holder lifts it whenever they like",
     !decBool(await c.read(nft, "locked(uint256)", [bolted])));
  await c.exec(nft, "approve(address,uint256)", ["0x" + "00".repeat(20), bolted]);
}

/*════════════ one collection, several chains, one numbering ════════════

  The edition is four thousand and ninety-six and it is cut into contiguous
  bands, one per chain, fixed in the constructor. A token minted on Base is
  numbered inside Base's band, so #1337 names exactly one token in the world
  and nothing has to be asked of another chain to know it — no bridge, no
  oracle, no shared counter, and nothing to trust. The whole mechanism is a
  constructor argument and a bounds check, which is the point: the cheapest
  correct answer beat the expensive one.

  What is tested here is the arithmetic, because the arithmetic is the
  guarantee. A band that could start at zero, run backwards, or run past the
  edition would let two chains issue the same number, and the number is the
  only thing this design says is global.
*/
head("a chain owns a band, and can issue nothing outside it");
{
  const band = async (first, last) => c.deploy(A.Ipseity.bytecode,
    encodeAddressArg(renderer) + encodeAddressArg(acctImpl) + encodeAddressArg(gripImpl) +
    BigInt(first).toString(16).padStart(64, "0") +
    BigInt(last).toString(16).padStart(64, "0"));

  const refused = async (name, first, last) => {
    let threw = false;
    try { await band(first, last); } catch { threw = true; }
    ok(name, threw, "it deployed");
  };
  await refused("a band starting at zero is refused", 0, 10);
  await refused("a band that runs backwards is refused", 10, 5);
  await refused("and one that runs past the edition is refused", 4000, 4097);

  /*  The second chain's band. Nothing about this deployment knows the
      first one exists, which is exactly what makes it free.           */
  const two = await band(1025, 2048);
  eq("the edition is the same everywhere", decUint(await c.read(two, "COLLECTION()")), 4096n);
  eq("this chain may issue its band and no more",
     decUint(await c.read(two, "MAX_SUPPLY()")), 1024n);
  eq("and it says where its band starts", decUint(await c.read(two, "FIRST_ID()")), 1025n);
  eq("and ends", decUint(await c.read(two, "LAST_ID()")), 2048n);

  await c.exec(two, "mint()", [], { value: 10n ** 16n });
  eq("the first token it issues is the first of its band",
     decUint(await c.read(two, "tokenByIndex(uint256)", [0])), 1025n);
  eq("held by whoever minted it",
     decAddr(await c.read(two, "ownerOf(uint256)", [1025])).toLowerCase(), c.from.toString().toLowerCase());
  await c.exec(two, "mint()", [], { value: 10n ** 16n });
  eq("and the next is the next", decUint(await c.read(two, "tokenByIndex(uint256)", [1])), 1026n);
  eq("while its own supply counts from zero, as ERC-721 expects",
     decUint(await c.read(two, "totalSupply()")), 2n);

  /*  The ids this chain will never issue are not merely unminted here —
      they are somebody else's, and asking about one is a plain refusal
      rather than an empty answer that could be mistaken for a free id. */
  let vacant = false;
  try { await c.read(two, "ownerOf(uint256)", [1]); } catch { vacant = true; }
  ok("a number outside the band belongs to no token here", vacant);

  /*  And the hands are derived from the id, so two chains that shared a
      number would derive the same account address for two different
      tokens. The band is what stops that, one level down.            */
  const a1 = decAddr(await c.read(two, "account(uint256)", [1025]));
  const a2 = decAddr(await c.read(nft, "account(uint256)", [1]));
  ok("and two tokens on two chains never derive the same hand",
     a1.toLowerCase() !== a2.toLowerCase(), `${a1} vs ${a2}`);
  console.log("      bands are a constructor argument and a bounds check \u2014 no bridge, nothing to trust");
}

head("gas, measured");
console.log("      (totals across every call the run made)");
const order = ["Engine", "Sigil", "Renderer", "Ipseity", "loadHead", "loadBody", "mint",
               "commit", "setTrait", "pin", "lock", "setUser", "embody", "transferFrom",
               "safeTransferFrom", "sealKernel", "kernel transfer"];
for (const k of order) if (c.gas[k]) console.log(`      ${k.padEnd(20)} ${gas(c.gas[k]).padStart(8)}`);
const deployTotal = ["Engine", "Sigil", "Renderer", "Ipseity"].reduce((a, k) => a + (c.gas[k] || 0n), 0n);
console.log(`      ${"—".repeat(28)}`);
console.log(`      ${"deployment".padEnd(20)} ${gas(deployTotal).padStart(8)}`);
console.log(`      ${"document".padEnd(20)} ${gas(loadGas).padStart(8)}`);
console.log(`      ${"total to launch".padEnd(20)} ${gas(deployTotal + loadGas).padStart(8)}`);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
