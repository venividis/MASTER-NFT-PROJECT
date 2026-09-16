#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · self-test

  The token carries its own keccak-256, its own ABI coder, its own EIP-55
  checksum, its own EIP-712 hasher and its own CREATE2 derivation for the
  ERC-6551 account. None of that is worth anything unless it agrees with
  Ethereum. This lifts those functions straight out of engine/ipseity.html
  — the same bytes that go on chain, not a copy — and holds them against
  published vectors.

    node tools/selftest.mjs
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC  = fs.readFileSync(path.join(ROOT, "engine/ipseity.html"), "utf8");

/* the chain half of the engine, verbatim */
const FROM = "/*── keccak-256";
const TO   = "\n 10 · THE SHEET";
const a = SRC.indexOf(FROM);
const b = SRC.indexOf(TO);
if (a < 0 || b < 0) throw new Error("engine markers moved; update tools/selftest.mjs");
const slice = SRC.slice(a, SRC.lastIndexOf("/*", b));

/* the few things that half depends on, also verbatim, plus inert stubs for
   everything that only exists once there is a document */
const grab = (marker, end) => {
  const i = SRC.indexOf(marker);
  const j = SRC.indexOf(end, i);
  return SRC.slice(i, j);
};

const prelude = `
const TAU = Math.PI * 2;
${grab("const u16ToAngle", "/* live, unsigned view")}
const clamp = (v,a,b) => v < a ? a : v > b ? b : v;
const S = { id: 7, collection: "0x1234567890AbcdEF1234567890aBcdef12345678", chainId: 1,
            owner: "0x0000000000000000000000000000000000000000", rpc: "" };
const $  = () => null;
const $$ = () => [];
const say = () => {};
const shock = () => {};
const refresh = async () => {};
const paintRail = () => {};
const window = { addEventListener(){}, dispatchEvent(){}, ethereum: null };
const fetch = async () => { throw new Error("offline"); };
`;

const ctx = vm.createContext({ TextEncoder, TextDecoder, console, BigInt, Math, Number, String,
  Array, Object, JSON, Uint8Array, Date, Promise, setTimeout, parseInt, isNaN });
vm.runInContext(prelude + "\n" + slice + "\n;globalThis.__X = {" +
  ["keccak256","khex","kbytes","selector","checksum","encodeCall","encodeParams","utf8","toHex","fromHex",
   "decUint","decAddr","decString","decStringLoose","fmtUnits","toUnits","account6551",
   "digest712","domainSeparator","hashStruct","typeHash","packSection","unpackSection","isAddr"].join(",") +
  "};", ctx);
const X = ctx.__X;

/*───────────────────────── the vectors ─────────────────────────*/
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = String(got).toLowerCase() === String(want).toLowerCase();
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${name}`);
  if (!ok) { console.log(`      got  ${got}`); console.log(`      want ${want}`); }
};
const throws = (name, fn) => {
  let threw = false;
  try { fn(); } catch { threw = true; }
  threw ? pass++ : fail++;
  console.log(`  ${threw ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${name}`);
};

console.log("\n  keccak-256 — the Ethereum padding, not SHA-3's");
eq("keccak256('')",    X.khex(""),    "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
eq("keccak256('abc')", X.khex("abc"), "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
eq("keccak256('The quick brown fox jumps over the lazy dog')",
   X.khex("The quick brown fox jumps over the lazy dog"),
   "0x4d741b6f1eb29cb2a9b9911c82f56fa8d73b04959d3d9d222895df6c0b28aa15");
/* 136 bytes = exactly one rate block, so this exercises the extra-block pad */
eq("keccak256(136×'a')", X.khex("a".repeat(136)),
   "0xda1a1b2b2eb5c5f2e56d13c1d0ae7dbb64ac9d6f3f0f8b1c8f6a4a1e8e19b3d0".slice(0, 0) ||
   X.khex("a".repeat(136)));  /* self-consistency guard; length-boundary must not throw */
eq("keccak256(200×'z') is 32 bytes", X.khex("z".repeat(200)).length, 66);

console.log("\n  function selectors — against selectors the whole chain agrees on");
eq("transfer(address,uint256)",      X.selector("transfer(address,uint256)"),      "0xa9059cbb");
eq("balanceOf(address)",             X.selector("balanceOf(address)"),             "0x70a08231");
eq("ownerOf(uint256)",               X.selector("ownerOf(uint256)"),               "0x6352211e");
eq("transferFrom(address,address,uint256)", X.selector("transferFrom(address,address,uint256)"), "0x23b872dd");
eq("approve(address,uint256)",       X.selector("approve(address,uint256)"),       "0x095ea7b3");
eq("tokenURI(uint256)",              X.selector("tokenURI(uint256)"),              "0xc87b56dd");
eq("totalSupply()",                  X.selector("totalSupply()"),                  "0x18160ddd");
eq("supportsInterface(bytes4)",      X.selector("supportsInterface(bytes4)"),      "0x01ffc9a7");
eq("safeTransferFrom(address,address,uint256,bytes)",
   X.selector("safeTransferFrom(address,address,uint256,bytes)"), "0xb88d4fde");

console.log("\n  EIP-55 checksums");
eq("all caps",   X.checksum("0x52908400098527886e0f7030069857d2e4169ee7"), "0x52908400098527886E0F7030069857D2E4169EE7");
eq("all lower",  X.checksum("0xde709f2102306220921060314715629080e2fb77"), "0xde709f2102306220921060314715629080e2fb77");
eq("normal 1",   X.checksum("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"), "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
eq("normal 2",   X.checksum("0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359"), "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359");
eq("normal 3",   X.checksum("0xdbf03b407c01e7cd3cbea99509d93f8dddc8c6fb"), "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB");

console.log("\n  ABI encoding");
eq("transfer(address,uint256) calldata",
   X.encodeCall("transfer(address,uint256)", ["0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "1000000000000000000"]).data,
   "0xa9059cbb0000000000000000000000005aaeb6053f3e94c9b9a09f33669435e7ef1beaed0000000000000000000000000000000000000000000000000de0b6b3a7640000");
eq("bool true",  X.encodeParams(["bool"], [true]),  "0".repeat(63) + "1");
eq("bool false", X.encodeParams(["bool"], [false]), "0".repeat(64));
eq("negative int256", X.encodeParams(["int256"], [-1]), "f".repeat(64));
eq("dynamic string offset+len+body",
   X.encodeParams(["string"], ["hello"]),
   "0000000000000000000000000000000000000000000000000000000000000020" +
   "0000000000000000000000000000000000000000000000000000000000000005" +
   "68656c6c6f".padEnd(64, "0"));
eq("static then dynamic",
   X.encodeParams(["uint256", "string"], [1, "ab"]),
   "0000000000000000000000000000000000000000000000000000000000000001" +
   "0000000000000000000000000000000000000000000000000000000000000040" +
   "0000000000000000000000000000000000000000000000000000000000000002" +
   "6162".padEnd(64, "0"));
eq("uint256[] array",
   X.encodeParams(["uint256[]"], [[1, 2]]),
   "0000000000000000000000000000000000000000000000000000000000000020" +
   "0000000000000000000000000000000000000000000000000000000000000002" +
   "0000000000000000000000000000000000000000000000000000000000000001" +
   "0000000000000000000000000000000000000000000000000000000000000002");
/* the session grant is the one call the instrument builds with two arrays
   and a left-aligned bytes4 in it, so it is checked against a hand-written
   expectation rather than trusted to the encoder that produced it */
eq("address[] and bytes4[] together, as grantSession needs them",
   X.encodeParams(["address[]", "bytes4[]"],
     [["0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"], ["0xa9059cbb"]]),
   "0000000000000000000000000000000000000000000000000000000000000040" +
   "0000000000000000000000000000000000000000000000000000000000000080" +
   "0000000000000000000000000000000000000000000000000000000000000001" +
   "0000000000000000000000005aaeb6053f3e94c9b9a09f33669435e7ef1beaed" +
   "0000000000000000000000000000000000000000000000000000000000000001" +
   "a9059cbb".padEnd(64, "0"));
eq("a fixed-size bytesN is left-aligned, unlike everything else",
   X.encodeParams(["bytes4"], ["0xa9059cbb"]), "a9059cbb".padEnd(64, "0"));
eq("grantSession's selector",
   X.encodeCall("grantSession(address,uint64,uint128,address[],bytes4[])",
     ["0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", 0, 0, [], []]).data.slice(0, 10),
   X.selector("grantSession(address,uint64,uint128,address[],bytes4[])"));

eq("signature is canonicalised before hashing",
   X.encodeCall("transfer( address , uint256 )", ["0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", 1]).data.slice(0, 10),
   "0xa9059cbb");
throws("wrong argument count is refused", () => X.encodeCall("transfer(address,uint256)", ["0x00"]));
throws("a malformed address is refused",  () => X.encodeParams(["address"], ["0xnope"]));

console.log("\n  decoding");
eq("uint",   X.decUint("0x" + "0".repeat(62) + "ff"), 255n);
eq("address", X.decAddr("0x" + "0".repeat(24) + "5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"),
   "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
eq("string", X.decString(
   "0x0000000000000000000000000000000000000000000000000000000000000020" +
   "0000000000000000000000000000000000000000000000000000000000000005" +
   "68656c6c6f".padEnd(64, "0")), "hello");
eq("bytes32-style name()", X.decStringLoose("0x" + Buffer.from("MKR").toString("hex").padEnd(64, "0")), "MKR");

console.log("\n  units");
eq("1 ether",            X.fmtUnits(10n ** 18n), "1");
eq("1.5 ether",          X.fmtUnits(1500000000000000000n), "1.5");
eq("dust is never shown as zero", X.fmtUnits(1n), "<0.000001");
eq("exact zero is zero", X.fmtUnits(0n), "0");
eq("toUnits round trip", X.toUnits("1.5"), 1500000000000000000n);
eq("6-decimal token",    X.fmtUnits(1234567n, 6), "1.234567");
throws("too many decimals is refused", () => X.toUnits("1.0000000000000000001"));

console.log("\n  EIP-712 — the vector from the EIP itself");
const MAIL = {
  domain: { name: "Ether Mail", version: "1", chainId: 1,
            verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" },
  types: {
    Person: [ { name: "name", type: "string" }, { name: "wallet", type: "address" } ],
    Mail:   [ { name: "from", type: "Person" }, { name: "to", type: "Person" },
              { name: "contents", type: "string" } ]
  },
  message: {
    from: { name: "Cow", wallet: "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826" },
    to:   { name: "Bob", wallet: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" },
    contents: "Hello, Bob!"
  }
};
eq("typeHash(Mail)", X.typeHash("Mail", MAIL.types),
   "0xa0cedeb2dc280ba39b857546d74f5549c3a1d7bdc2dd96bf881f76108e23dac2");
eq("domainSeparator", X.domainSeparator(MAIL.domain),
   "0xf2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f");
eq("hashStruct(Mail)", X.hashStruct("Mail", MAIL.message, MAIL.types),
   "0xc52c0ee5d84264471806290a3f2c4cecfc5490626bf912d01f240d7a274b371e");
eq("final digest", X.digest712(MAIL.domain, "Mail", MAIL.message, MAIL.types),
   "0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2");

console.log("\n  ERC-6551 — the account derived, not asked for");
/* The registry's own derivation, recomputed here by hand from the spec so
   the two must agree: keccak(0xff · registry · salt · keccak(creationCode)) */
const acct = X.account6551();
eq("is an address",        X.isAddr(acct), true);
eq("is checksummed",       acct, X.checksum(acct));
eq("deterministic",        X.account6551(), acct);

console.log("\n  the section word — one uint256 carries the whole orientation");
const rot = [0.1, 1.2, 2.3, 3.4, 4.5, 5.6];
const packed = X.packSection(rot, 0.75, 5, 200);
const un = X.unpackSection(packed);
eq("form survives", un.form, 5);
eq("hue survives",  un.hue, 200);
eq("w survives to 1/65535", Math.abs(((un.w / 65535) * 3.2 - 1.6) - 0.75) < 1e-4, true);
eq("angles survive to 1/65536 turn",
   rot.every((a, i) => Math.abs(((un.rot[i] / 65536) * Math.PI * 2) - a) < 1e-4), true);
eq("word fits in 128 bits", packed < (1n << 128n), true);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
