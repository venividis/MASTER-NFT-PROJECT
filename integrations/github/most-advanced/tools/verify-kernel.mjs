#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the sealed kernel

  The claim under test: a token can carry a payload that is not public — the
  disposition an agent runs under — without anyone being able to lie to a
  buyer about it.

  ERC-7857's guarantee is that transfer and re-encryption are atomic and
  proved. That guarantee is real and it is implemented here, but it has a
  hole that is easy to miss: `transferFrom` still exists. It has to, or the
  token stops being an ERC-721. An ordinary transfer moves the token and
  leaves the payload sealed to whoever held it before, and nothing is
  violated — the buyer simply owns a pointer to a ciphertext they cannot
  open, and no event says so.

  So the suite attacks the seam rather than the happy path:

    · the derivation     does an ordinary transfer show up as STALE
    · the conflation     is "there is a kernel" kept apart from "somebody
                         proved it", or can one be read as the other
    · the oracle         can it be swapped for one that approves anything
    · the proof          is it checked against *this* token's hashes
    · the honest null    with no verifier, does the contract refuse or wave

    node tools/verify-kernel.mjs
───────────────────────────────────────────────────────────────────────────*/
import { compile, artifact } from "./compile.mjs";
import { Chain, enc, decUint, decAddr, decBool, encodeAddressArg } from "./evm.mjs";
import { createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";
import { keccak256 } from "ethereum-cryptography/keccak.js";

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${n}`);
  if (!c && d !== undefined) console.log(`      ${d}`);
};
const eq = (n, g, w) => ok(n, String(g) === String(w), `got ${g}\n      want ${w}`);
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";
const ZERO = "0x" + "0".repeat(40);

const evm = await import("./evm.mjs");
const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();
const me = c.from.toString();

const refuses = async (name, fn, why) => {
  let threw = false;
  try { await fn(); } catch { threw = true; }
  ok(name, threw, "IT WENT THROUGH — " + why);
};
const h32 = (s) => "0x" + Buffer.from(keccak256(Buffer.from(s, "utf8"))).toString("hex");
const bytes32Arr = (arr) =>
  (0x20).toString(16).padStart(64, "0") +
  arr.length.toString(16).padStart(64, "0") +
  arr.map((x) => x.replace(/^0x/, "")).join("");

/*──────────────── deploy ────────────────*/
head("deploy");
const tmpReg = await c.deploy(A("test/mocks/ERC6551Registry.sol", "ERC6551Registry").bytecode);
await c.vm.stateManager.putCode(createAddressFromString(REGISTRY),
  await c.vm.stateManager.getCode(createAddressFromString(tmpReg)));

const impl = await c.deploy(A("src/IpseityAccount.sol", "IpseityAccount").bytecode);
const gripImpl = await c.deploy(A("src/GripVault.sol", "GripVault").bytecode);
const engine = await c.deploy(A("src/Engine.sol", "Engine").bytecode, "0".repeat(64));
const sigil = await c.deploy(A("src/Sigil.sol", "Sigil").bytecode);
const renderer = await c.deploy(A("src/Renderer.sol", "Renderer").bytecode,
  encodeAddressArg(engine) + encodeAddressArg(sigil));
const nft = await c.deploy(A("src/Ipseity.sol", "Ipseity").bytecode,
  encodeAddressArg(renderer) + encodeAddressArg(impl) + encodeAddressArg(gripImpl) + (1).toString(16).padStart(64, "0") + (4096).toString(16).padStart(64, "0"), "Ipseity");
ok("deployed", (await c.codeSize(nft)) > 0);

await c.exec(nft, "mint()", [], { value: 10n ** 16n });
const buyer = "0x" + "b0197a".padStart(40, "0");

/*──────────────── the honest null ────────────────*/
head("this collection deploys with no oracle, and does not imply one");
ok("hasVerifier() is false", !decBool(await c.read(nft, "hasVerifier()")));
eq("verifier reads back as zero", decAddr(await c.read(nft, "verifier()")), ZERO);
eq("a token with no kernel is ABSENT", decUint(await c.read(nft, "kernelStatus(uint256)", [1])), 0);
ok("and nothing about it is proved", !decBool(await c.read(nft, "kernelProved(uint256)", [1])));

/*──────────────── sealing ────────────────*/
head("sealing a kernel");
const H1 = [h32("the strategy nobody else gets to read")];
const KEY_A = h32("holder A's public key");

await refuses("a stranger cannot seal onto someone else's token", async () => {
  const r = await c.vm.evm.runCall({
    to: createAddressFromString(nft), caller: createAddressFromString(buyer),
    origin: createAddressFromString(buyer),
    data: hexToBytes("0x" + evm.sel("sealKernel(uint256,bytes32[],bytes32)").slice(2) +
      (1).toString(16).padStart(64, "0") + (0x60).toString(16).padStart(64, "0") +
      KEY_A.replace(/^0x/, "") + H1.length.toString(16).padStart(64, "0") +
      H1.map(x => x.replace(/^0x/, "")).join("")),
    gasLimit: 20_000_000n, value: 0n, block: evm.BLOCK
  });
  if (r.execResult.exceptionError) throw new Error(r.execResult.exceptionError.error);
}, "anyone could overwrite the kernel of any token");

const sealCall = (id, hashes, to_) =>
  "0x" + evm.sel("sealKernel(uint256,bytes32[],bytes32)").slice(2) +
  BigInt(id).toString(16).padStart(64, "0") +
  (0x60).toString(16).padStart(64, "0") +
  to_.replace(/^0x/, "") +
  hashes.length.toString(16).padStart(64, "0") +
  hashes.map(x => x.replace(/^0x/, "")).join("");

await c.send({ to: nft, data: sealCall(1, H1, KEY_A), label: "sealKernel" });

eq("status is CURRENT", decUint(await c.read(nft, "kernelStatus(uint256)", [1])), 1);
eq("the hash is on chain", "0x" + (await c.read(nft, "dataHashesOf(uint256)", [1]))
   .replace(/^0x/, "").substr(128, 64), H1[0]);
eq("and the key handle it was sealed to",
   "0x" + (await c.read(nft, "sealedTo(uint256)", [1])).replace(/^0x/, ""), KEY_A);

head("but sealed is not proved, and they are asked separately");
ok("kernelProved is false", !decBool(await c.read(nft, "kernelProved(uint256)", [1])),
   "the holder asserted these hashes and nobody checked them");
console.log("      sealKernel asserts; only a transfer through a verifier proves");

/*──────────────── the seam: an ordinary transfer ────────────────*/
head("the seam — transferFrom still exists, because it has to");
await c.exec(nft, "transferFrom(address,address,uint256)", [me, buyer, 1]);
eq("the token moved", decAddr(await c.read(nft, "ownerOf(uint256)", [1])).toLowerCase(), buyer);
eq("and the kernel went STALE by itself",
   decUint(await c.read(nft, "kernelStatus(uint256)", [1])), 2);
console.log("      no hook fired, no gas was spent, no transaction was needed");

eq("the key handle is unchanged — nothing was rewritten",
   "0x" + (await c.read(nft, "sealedTo(uint256)", [1])).replace(/^0x/, ""), KEY_A);
ok("still not proved", !decBool(await c.read(nft, "kernelProved(uint256)", [1])));
eq("the ERC-7496 trait reports it too",
   decUint(await c.read(nft, "getTraitValue(uint256,bytes32)",
     [1, "0x" + Buffer.from("kernel", "utf8").toString("hex").padEnd(64, "0")])), 2);
console.log("      a marketplace reading traits is told, not left to guess");

await refuses("and the seller can no longer re-seal it",
  () => c.send({ to: nft, data: sealCall(1, H1, KEY_A) }),
  "the old owner still controls the kernel");

/*──────────────── with no oracle, the proved path refuses ────────────────*/
head("with no oracle, the atomic path refuses rather than waving through");
await c.exec(nft, "mint()", [], { value: 10n ** 16n });
await c.send({ to: nft, data: sealCall(2, H1, KEY_A) });
await refuses("transferWithKernel on a live kernel", () =>
  c.exec(nft, "transferWithKernel(address,uint256,bytes)", [buyer, 2, "0x"]),
  "a kernel'd token transferred with no proof and no verifier");
await refuses("cloneWithKernel likewise", () =>
  c.exec(nft, "cloneWithKernel(address,uint256,bytes)", [buyer, 2, "0x"]),
  "a kernel was copied with nobody checking");

await c.exec(nft, "mint()", [], { value: 10n ** 16n });
let plainWent = false;
try {
  await c.exec(nft, "transferWithKernel(address,uint256,bytes)", [buyer, 3, "0x"]);
  plainWent = true;
} catch {}
ok("a token with no kernel still transfers through it", plainWent);
eq("it simply moved", decAddr(await c.read(nft, "ownerOf(uint256)", [3])).toLowerCase(), buyer);

/*──────────────── the oracle ────────────────*/
head("the verifier is chosen once and never rotated");
const verifier = await c.deploy(A("test/mocks/MockVerifier.sol", "MockVerifier").bytecode);
const verifier2 = await c.deploy(A("test/mocks/MockVerifier.sol", "MockVerifier").bytecode);

await refuses("it cannot be set to zero", () =>
  c.exec(nft, "setVerifier(address)", [ZERO]),
  "zero would read as 'no oracle' while claiming one was chosen");

await c.exec(nft, "setVerifier(address)", [verifier], { label: "setVerifier" });
ok("hasVerifier() now says so", decBool(await c.read(nft, "hasVerifier()")));

await refuses("and it can never be swapped", () =>
  c.exec(nft, "setVerifier(address)", [verifier2]),
  "whoever holds the curator key can install an oracle that approves anything");
console.log("      a rotatable verifier is not a verifier, it is a curator");

/*──────────────── the proof ────────────────*/
head("the proof has to be about this token's payload");
const H2 = [h32("re-encrypted to the buyer's key")];
const KEY_B = h32("holder B's public key");
/* The mock reports back whatever the proof says, so what is under test is
   the token's own check rather than the oracle's honesty — which is the
   right way round: the oracle is the part this deployment does not have. */
const mkProof = (oldH, newH, to_) => "0x" +
  oldH.replace(/^0x/, "") + newH.replace(/^0x/, "") + to_.replace(/^0x/, "");

await refuses("a proof about a different payload is rejected", () =>
  c.exec(nft, "transferWithKernel(address,uint256,bytes)",
    [buyer, 2, mkProof(h32("some other token's data"), H2[0], KEY_B)]),
  "a proof can be lifted from one token and replayed against another");

await refuses("and a malformed proof is not read optimistically", () =>
  c.exec(nft, "transferWithKernel(address,uint256,bytes)", [buyer, 2, "0xdeadbeef"]),
  "a short proof was padded into something the verifier accepted");

await c.exec(nft, "transferWithKernel(address,uint256,bytes)",
  [buyer, 2, mkProof(H1[0], H2[0], KEY_B)], { label: "transferWithKernel" });

eq("a proved transfer moves the token", decAddr(await c.read(nft, "ownerOf(uint256)", [2])).toLowerCase(), buyer);
eq("the kernel stays CURRENT across it", decUint(await c.read(nft, "kernelStatus(uint256)", [2])), 1);
ok("and it is proved", decBool(await c.read(nft, "kernelProved(uint256)", [2])));
eq("re-sealed to the buyer's key",
   "0x" + (await c.read(nft, "sealedTo(uint256)", [2])).replace(/^0x/, ""), KEY_B);

head("and a proof does not survive the next plain transfer");
const asBuyer = async (sig, args) => {
  const r = await c.vm.evm.runCall({
    to: createAddressFromString(nft), caller: createAddressFromString(buyer),
    origin: createAddressFromString(buyer), data: hexToBytes(enc(sig, args)),
    gasLimit: 20_000_000n, value: 0n, block: evm.BLOCK
  });
  if (r.execResult.exceptionError) throw new Error(r.execResult.exceptionError.error);
  return bytesToHex(r.execResult.returnValue);
};
await asBuyer("transferFrom(address,address,uint256)", [buyer, me, 2]);
eq("STALE again", decUint(await c.read(nft, "kernelStatus(uint256)", [2])), 2);
ok("and proved goes with it", !decBool(await c.read(nft, "kernelProved(uint256)", [2])),
   "a stale kernel still reads as proved, which is the worst of both");

/*──────────────── delegating use ────────────────*/
head("lending the use without lending the secret");
await c.exec(nft, "authorizeUsage(uint256,address)", [2, buyer], { label: "authorizeUsage" });
ok("the holder may authorise a user",
   decBool(await c.read(nft, "usageAuthorised(uint256,address)", [2, buyer])));
await refuses("a stranger may not authorise themselves", () =>
  asBuyer("authorizeUsage(uint256,address)", [2, buyer]),
  "anyone could grant themselves the use of any kernel");

/*──────────────── the shape ────────────────*/
head("read off the compiled ABI");
const abi = A("src/Ipseity.sol", "Ipseity").abi;
const has = (n) => abi.some(f => f.name === n);
ok("kernelStatus, kernelProved and hasVerifier are all separately askable",
   has("kernelStatus") && has("kernelProved") && has("hasVerifier"));
ok("there is no setter that clears a kernel's staleness",
   !abi.some(f => /setKernelStatus|markCurrent|refresh|touch/i.test(f.name || "")),
   "staleness must be derived, or it is just another number a seller controls");
ok("and no ERC-165 id is registered for 7857",
   !JSON.stringify(abi).includes("7857"),
   "the standard defines no interface id, so anything advertising one is inventing it");

head("gas");
for (const [k, v] of Object.entries(c.gas)) {
  console.log(`      ${k.padEnd(28)} ${v.toLocaleString()}`);
}

console.log(`\n  ${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
