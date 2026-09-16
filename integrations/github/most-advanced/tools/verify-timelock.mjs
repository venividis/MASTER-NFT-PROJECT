#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the delay

  A timelock is only worth the attacks it survives, so this tries them:
  executing early, executing after the grace window, executing something
  never queued, re-queueing to move an eta underneath a watcher, rotating
  the admin without the delay, and calling any of it as a stranger.

  Then it takes the whole thing for a walk: hands the collection's curator
  role to the timelock and shows that a change to the collection now takes
  seven days and announces itself first.

    node tools/verify-timelock.mjs
───────────────────────────────────────────────────────────────────────────*/
import { compile, artifact } from "./compile.mjs";
import { Chain, enc, decUint, decAddr, decBool, encodeAddressArg } from "./evm.mjs";
import { createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${n}`);
  if (!c && d !== undefined) console.log(`      ${d}`);
};
const eq = (n, g, w) => ok(n, String(g) === String(w), `got ${g}\n      want ${w}`);
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);

const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();
const me = c.from.toString();
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";

head("deploy");
const tmpReg = await c.deploy(A("test/mocks/ERC6551Registry.sol", "ERC6551Registry").bytecode);
await c.vm.stateManager.putCode(createAddressFromString(REGISTRY),
  await c.vm.stateManager.getCode(createAddressFromString(tmpReg)));

const engine = await c.deploy(A("src/Engine.sol", "Engine").bytecode, "0".repeat(64));
const sigil = await c.deploy(A("src/Sigil.sol", "Sigil").bytecode);
const renderer = await c.deploy(A("src/Renderer.sol", "Renderer").bytecode,
  encodeAddressArg(engine) + encodeAddressArg(sigil));
const acctImpl = await c.deploy(A("src/IpseityAccount.sol", "IpseityAccount").bytecode);
const gripImpl = await c.deploy(A("src/GripVault.sol", "GripVault").bytecode);
const nft = await c.deploy(A("src/Ipseity.sol", "Ipseity").bytecode,
  encodeAddressArg(renderer) + encodeAddressArg(acctImpl) + encodeAddressArg(gripImpl) + (1).toString(16).padStart(64, "0") + (4096).toString(16).padStart(64, "0"));
const lock = await c.deploy(A("src/lib/Timelock.sol", "Timelock").bytecode, encodeAddressArg(me));
ok("deployed", true);

const DELAY = 7n * 24n * 3600n;
const GRACE = 14n * 24n * 3600n;
eq("the delay is seven days", decUint(await c.read(lock, "DELAY()")), DELAY);
eq("queued operations expire after a fortnight", decUint(await c.read(lock, "GRACE()")), GRACE);

/* the harness runs every call against one fixed block, so time is moved by
   rewriting that block's timestamp rather than by mining */
const evm = await import("./evm.mjs");
const at = (t) => evm.warp(t);
const T0 = evm.GENESIS_TIME;

const refuses = async (name, fn, why) => {
  let threw = false;
  try { await fn(); } catch { threw = true; }
  ok(name, threw, "it allowed it — " + why);
};

/*──────────────── the mechanism ────────────────*/
head("a queued operation waits");
const target = nft;
const data = enc("setPricing(uint256,uint256)", [12345n, 678n]);
const salt = "0x" + "01".repeat(32);

const opHash = await c.read(lock, "opHash(address,uint256,bytes,bytes32)",
  [target, 0, data, salt]);

await refuses("executing something never queued", () =>
  c.exec(lock, "execute(address,uint256,bytes,bytes32)", [target, 0, data, salt]),
  "unqueued operations execute");

await c.exec(lock, "queue(address,uint256,bytes,bytes32)", [target, 0, data, salt], { label: "queue" });
const eta = decUint(await c.read(lock, "eta(bytes32)", [opHash]));
eq("the eta is a week out", eta, BigInt(T0) + DELAY);
ok("not ready yet", !decBool(await c.read(lock, "ready(bytes32)", [opHash])));

await refuses("executing before the delay is up", () =>
  c.exec(lock, "execute(address,uint256,bytes,bytes32)", [target, 0, data, salt]),
  "the delay is not enforced");

await refuses("re-queueing to move the eta underneath a watcher", () =>
  c.exec(lock, "queue(address,uint256,bytes,bytes32)", [target, 0, data, salt]),
  "an eta can be pushed around after it is published");

/*──────────────── the delay elapses ────────────────*/
head("and then it lands");
at(BigInt(T0) + DELAY + 1n);
ok("ready once the week has passed", decBool(await c.read(lock, "ready(bytes32)", [opHash])));

// the collection has to be under the lock for the call to be allowed through
await c.exec(nft, "transferOwnership(address)", [lock]);
eq("the handover is proposed, not done", decAddr(await c.read(nft, "owner()")).toLowerCase(), me.toLowerCase());

// the timelock accepts on its own behalf, which itself takes a week
const acc = enc("acceptOwnership()", []);
const saltA = "0x" + "02".repeat(32);
await c.exec(lock, "queue(address,uint256,bytes,bytes32)", [nft, 0, acc, saltA]);
at(BigInt(T0) + 2n * DELAY + 2n);
await c.exec(lock, "execute(address,uint256,bytes,bytes32)", [nft, 0, acc, saltA], { label: "execute" });
eq("the collection is now administered by the delay",
   decAddr(await c.read(nft, "owner()")).toLowerCase(), lock.toLowerCase());

await c.exec(lock, "execute(address,uint256,bytes,bytes32)", [target, 0, data, salt]);
eq("and the queued change took effect", decUint(await c.read(nft, "price()")), 12345n);
eq("the queue slot is cleared", decUint(await c.read(lock, "eta(bytes32)", [opHash])), 0);

await refuses("replaying the same operation", () =>
  c.exec(lock, "execute(address,uint256,bytes,bytes32)", [target, 0, data, salt]),
  "an executed operation can be replayed");

/*──────────────── expiry ────────────────*/
head("a forgotten operation dies");
const stale = enc("setPricing(uint256,uint256)", [999n, 1n]);
const saltS = "0x" + "03".repeat(32);
const opS = await c.read(lock, "opHash(address,uint256,bytes,bytes32)", [nft, 0, stale, saltS]);
const T1 = BigInt(T0) + 2n * DELAY + 2n;
at(T1);
await c.exec(lock, "queue(address,uint256,bytes,bytes32)", [nft, 0, stale, saltS]);

at(T1 + DELAY + GRACE + 10n);
ok("no longer ready", !decBool(await c.read(lock, "ready(bytes32)", [opS])));
await refuses("executing a year-old proposal", () =>
  c.exec(lock, "execute(address,uint256,bytes,bytes32)", [nft, 0, stale, saltS]),
  "a forgotten proposal stays live forever");
eq("the collection was not changed", decUint(await c.read(nft, "price()")), 12345n);

/*──────────────── the admin ────────────────*/
head("the admin cannot slip out from under the delay");
const bob = "0x" + "b0b".padStart(40, "0");
await c.fund(bob, 10n ** 18n);
const asBob = async (to, sig, args) => {
  const r = await c.vm.evm.runCall({
    to: createAddressFromString(to), caller: createAddressFromString(bob),
    origin: createAddressFromString(bob), data: hexToBytes(enc(sig, args)),
    gasLimit: 20_000_000n, value: 0n, block: evm.BLOCK
  });
  if (r.execResult.exceptionError) throw new Error(r.execResult.exceptionError.error);
  return bytesToHex(r.execResult.returnValue);
};

await refuses("a stranger queueing", () =>
  asBob(lock, "queue(address,uint256,bytes,bytes32)", [nft, 0, data, "0x" + "04".repeat(32)]),
  "anyone can queue");
await refuses("a stranger cancelling", () =>
  asBob(lock, "cancel(bytes32)", [opHash]), "anyone can cancel");
await refuses("the admin rotating itself directly", () =>
  c.exec(lock, "setAdmin(address)", [bob]),
  "the admin can escape the delay by rotating out of it");

// rotation has to go through the queue like anything else
const rot = enc("setAdmin(address)", [bob]);
const saltR = "0x" + "05".repeat(32);
const T2 = T1 + DELAY + GRACE + 10n;
await c.exec(lock, "queue(address,uint256,bytes,bytes32)", [lock, 0, rot, saltR]);
at(T2 + DELAY + 1n);
await c.exec(lock, "execute(address,uint256,bytes,bytes32)", [lock, 0, rot, saltR]);
eq("rotation lands, seven days later", decAddr(await c.read(lock, "admin()")).toLowerCase(), bob);
await refuses("and the old admin is finished", () =>
  c.exec(lock, "queue(address,uint256,bytes,bytes32)", [nft, 0, data, "0x" + "06".repeat(32)]),
  "a rotated-out admin still has the keys");

/*──────────────── cancelling ────────────────*/
head("a proposal can be pulled");
const saltC = "0x" + "07".repeat(32);
const opC = await c.read(lock, "opHash(address,uint256,bytes,bytes32)", [nft, 0, data, saltC]);
const asBobTx = async (sig, args) => {
  const r = await c.vm.evm.runCall({
    to: createAddressFromString(lock), caller: createAddressFromString(bob),
    origin: createAddressFromString(bob), data: hexToBytes(enc(sig, args)),
    gasLimit: 20_000_000n, value: 0n, block: evm.BLOCK
  });
  if (r.execResult.exceptionError) throw new Error(r.execResult.exceptionError.error);
  return bytesToHex(r.execResult.returnValue);
};
await asBobTx("queue(address,uint256,bytes,bytes32)", [nft, 0, data, saltC]);
ok("queued", decUint(await c.read(lock, "eta(bytes32)", [opC])) > 0n);
await asBobTx("cancel(bytes32)", [opC]);
eq("and cancelled", decUint(await c.read(lock, "eta(bytes32)", [opC])), 0);

at(T0);   // leave the shared block as we found it
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
