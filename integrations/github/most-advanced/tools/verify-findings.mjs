#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · reproducing what the adversary panel claimed

  Five adversary lenses were asked to attack this collection and returned
  nineteen sharpened strategies. A strategy is a claim, not a finding. This
  file tries to make each one actually happen against the real compiled
  contracts, and reports which reproduce.

  A claim that reproduces is a bug in this repository.
  A claim that does not is a bug in the claim, and is recorded as such,
  because a panel that is never wrong is a panel nobody checked.

    node tools/verify-findings.mjs
───────────────────────────────────────────────────────────────────────────*/
import { compile, artifact } from "./compile.mjs";
import { Chain, enc, decUint, decAddr, decBool, encodeAddressArg } from "./evm.mjs";
import { createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";

const REPRO = [], SAFE = [];
const WAD = 10n ** 18n;
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";
const FOREVER = 2n ** 40n;
const MAX = (1n << 256n) - 1n;
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);
const reproduced = (name, detail) => {
  REPRO.push({ name, detail });
  console.log(`  \x1b[31m● REPRODUCES\x1b[0m  ${name}\n      ${detail}`);
};
const refuted = (name, detail) => {
  SAFE.push({ name, detail });
  console.log(`  \x1b[32m○ refuted\x1b[0m     ${name}\n      \x1b[2m${detail}\x1b[0m`);
};

const evm = await import("./evm.mjs");
const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();
const me = c.from.toString();

const tmpReg = await c.deploy(A("test/mocks/ERC6551Registry.sol", "ERC6551Registry").bytecode);
await c.vm.stateManager.putCode(createAddressFromString(REGISTRY),
  await c.vm.stateManager.getCode(createAddressFromString(tmpReg)));

const acctImpl = await c.deploy(A("src/IpseityAccount.sol", "IpseityAccount").bytecode);
const gripImpl = await c.deploy(A("src/GripVault.sol", "GripVault").bytecode);
const engine = await c.deploy(A("src/Engine.sol", "Engine").bytecode, "0".repeat(64));
const sigil = await c.deploy(A("src/Sigil.sol", "Sigil").bytecode);
const renderer = await c.deploy(A("src/Renderer.sol", "Renderer").bytecode,
  encodeAddressArg(engine) + encodeAddressArg(sigil));
const nft = await c.deploy(A("src/Ipseity.sol", "Ipseity").bytecode,
  encodeAddressArg(renderer) + encodeAddressArg(acctImpl) + encodeAddressArg(gripImpl) + (1).toString(16).padStart(64, "0") + (4096).toString(16).padStart(64, "0"));

const CAP = 10n ** 27n;
const pool = await c.deploy(A("src/Pool.sol", "Pool").bytecode,
  encodeAddressArg(nft) + CAP.toString(16).padStart(64, "0") +
  encodeAddressArg(me) + "0".repeat(64));

const mock = A("test/mocks/MockERC20.sol", "MockERC20").bytecode;
const encStr = (s) => {
  const b = Buffer.from(s, "utf8");
  return b.length.toString(16).padStart(64, "0") + b.toString("hex").padEnd(64, "0");
};
const mkToken = async (name, sym) => {
  const nameEnc = encStr(name);
  return c.deploy(mock,
    (0xa0).toString(16).padStart(64, "0") +
    BigInt(0xa0 + nameEnc.length / 2).toString(16).padStart(64, "0") +
    (18).toString(16).padStart(64, "0") + "0".repeat(64) + "0".repeat(64) +
    nameEnc + encStr(sym));
};
const BASE = await mkToken("Base", "BASE");
const QUOTE = await mkToken("Quote", "QUOTE");
await c.exec(pool, "bless(address,bool)", [BASE, true]);
await c.exec(pool, "bless(address,bool)", [QUOTE, true]);

const bob = "0x" + "b0b".padStart(40, "0");
const asOf = async (who, to, sig, args = [], value = 0n) => {
  const r = await c.vm.evm.runCall({
    to: createAddressFromString(to), caller: createAddressFromString(who),
    origin: createAddressFromString(who), data: hexToBytes(enc(sig, args)),
    gasLimit: 60_000_000n, value, block: evm.BLOCK
  });
  if (r.execResult.exceptionError) {
    const e = new Error(r.execResult.exceptionError.error);
    e.data = bytesToHex(r.execResult.returnValue || new Uint8Array());
    throw e;
  }
  return bytesToHex(r.execResult.returnValue);
};
const bal = async (t, w) => decUint(await c.read(t, "balanceOf(address)", [w]));
const mkt = async (id) => {
  const raw = await c.read(pool, "marketOf(uint256)", [id]);
  return { rB: decUint(raw, 2), rQ: decUint(raw, 3), bond: decUint(raw, 6),
           vB: decUint(raw, 8), vQ: decUint(raw, 9) };
};
/* six 16-bit angles; planes 3,4,5 are the ones containing w */
const maxConcWord = (1n << 48n) * 32768n + (1n << 64n) * 32768n + (1n << 80n) * 32768n;

/*═══════════ CLAIM 1 — the bond can be drained through the curve ═══════════

  "deposit() has no _unbonded gate and DOES call _reanchor, so a bonded
   market's curve can still be re-shaped by its holder — and the holder can
   pull inventory out of a bonded market as trading profit."                */
head("claim 1 · a bonded market can be drained through its own curve");
{
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const id = decUint(await c.read(nft, "totalSupply()"));
  await c.exec(nft, "commit(uint256,uint256)", [id, maxConcWord]);
  await c.exec(BASE, "mint(address,uint256)", [me, 10n ** 8n * WAD]);
  await c.exec(QUOTE, "mint(address,uint256)", [me, 10n ** 8n * WAD]);
  await c.exec(BASE, "approve(address,uint256)", [pool, MAX]);
  await c.exec(QUOTE, "approve(address,uint256)", [pool, MAX]);
  await c.exec(pool, "openMarket(uint256,address,address,uint16)", [id, BASE, QUOTE, 30]);
  await c.exec(pool, "deposit(uint256,uint256,uint256)", [id, 1_000_000n * WAD, 1_000_000n * WAD]);
  await c.exec(pool, "bond(uint256,uint64)", [id, evm.GENESIS_TIME + 300n * 86400n]);

  const m0 = await mkt(id);
  console.log(`      bonded with ${m0.rB / WAD} / ${m0.rQ / WAD}, offsets ${m0.vB / WAD} / ${m0.vQ / WAD}`);

  // the four advertised doors are shut
  let anyDoor = false;
  for (const [n, f] of [
    ["withdraw", () => c.exec(pool, "withdraw(uint256,uint256,uint256,address)", [id, 1n, 1n, me])],
    ["closeMarket", () => c.exec(pool, "closeMarket(uint256)", [id])],
    ["setFee", () => c.exec(pool, "setFee(uint256,uint16)", [id, 100])],
    ["syncCurve", () => c.exec(pool, "syncCurve(uint256)", [id])]
  ]) { try { await f(); anyDoor = true; console.log(`      !! ${n} opened`); } catch {} }

  // does deposit re-anchor while bonded?
  await c.exec(BASE, "mint(address,uint256)", [bob, 10n ** 8n * WAD]);
  await c.exec(QUOTE, "mint(address,uint256)", [bob, 10n ** 8n * WAD]);
  await asOf(bob, BASE, "approve(address,uint256)", [pool, MAX]);
  await asOf(bob, QUOTE, "approve(address,uint256)", [pool, MAX]);

  const b0 = await bal(BASE, bob), q0 = await bal(QUOTE, bob);
  let cycles = 0;
  for (let i = 0; i < 6; i++) {
    const m = await mkt(id);
    const inAmt = m.rB / 3n;
    try {
      await asOf(bob, pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
        [id, true, inAmt, 0, bob, FOREVER]);
      await c.exec(pool, "deposit(uint256,uint256,uint256)", [id, 1n, 0]);   // the lever
      const m2 = await mkt(id);
      await asOf(bob, pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
        [id, false, m2.rQ / 3n, 0, bob, FOREVER]);
      cycles++;
    } catch (e) { break; }
  }
  const b1 = await bal(BASE, bob), q1 = await bal(QUOTE, bob);
  const m1 = await mkt(id);
  const gainedB = b1 - b0, gainedQ = q1 - q0;

  console.log(`      after ${cycles} cycles: reserves ${m1.rB / WAD} / ${m1.rQ / WAD}`);
  console.log(`      the accomplice is ${gainedB / WAD} base, ${gainedQ / WAD} quote`);

  if (gainedB > 0n && gainedQ > 0n) {
    reproduced("a bonded market can be drained through the curve",
      `an accomplice ended +${gainedB / WAD} base AND +${gainedQ / WAD} quote while bondUntil ` +
      `was live; reserves fell ${m0.rB / WAD}→${m1.rB / WAD} and ${m0.rQ / WAD}→${m1.rQ / WAD}`);
  } else if (m1.rB < m0.rB && m1.rQ < m0.rQ) {
    reproduced("a bond does not hold both reserves",
      `${m0.rB / WAD}/${m0.rQ / WAD} → ${m1.rB / WAD}/${m1.rQ / WAD} under a live bond`);
  } else {
    refuted("a bonded market can be drained through the curve",
      `the accomplice ended ${gainedB / WAD} base / ${gainedQ / WAD} quote — ` +
      `profit on both sides is what the claim needs and it did not happen`);
  }

  // the narrower claim: does deposit move a term while bonded?
  const before = await mkt(id);
  await c.exec(pool, "deposit(uint256,uint256,uint256)", [id, 1000n * WAD, 0]);
  const after = await mkt(id);
  if (after.vB !== before.vB || after.vQ !== before.vQ) {
    reproduced("deposit re-anchors the curve while bonded",
      `offsets moved (${before.vB},${before.vQ}) → (${after.vB},${after.vQ}) with bondUntil live, ` +
      `while syncCurve — the function that exists to move them — is refused`);
  } else {
    refuted("deposit re-anchors the curve while bonded", "the offsets did not move");
  }
}

/*═══════════ CLAIM 2 — free supply through cloneWithKernel ═══════════*/
head("claim 2 · the whole supply can be minted for free once a verifier exists");
{
  const verifier = await c.deploy(A("test/mocks/MockVerifier.sol", "MockVerifier").bytecode);
  await c.exec(nft, "setVerifier(address)", [verifier]);

  const paidBefore = (await c.vm.stateManager.getAccount(createAddressFromString(nft))).balance;
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const parent = decUint(await c.read(nft, "totalSupply()"));

  const H = "0x" + "11".repeat(32), KEY = "0x" + "22".repeat(32);
  await c.send({ to: nft, data: "0x" + evm.sel("sealKernel(uint256,bytes32[],bytes32)").slice(2) +
    parent.toString(16).padStart(64, "0") + (0x60).toString(16).padStart(64, "0") +
    KEY.slice(2) + (1).toString(16).padStart(64, "0") + H.slice(2) });

  const proof = "0x" + H.slice(2) + H.slice(2) + KEY.slice(2);
  const supply0 = decUint(await c.read(nft, "totalSupply()"));
  let minted = 0;
  for (let i = 0; i < 8; i++) {
    try {
      await c.exec(nft, "cloneWithKernel(address,uint256,bytes)", [me, parent, proof]);
      minted++;
    } catch (e) { break; }
  }
  const supply1 = decUint(await c.read(nft, "totalSupply()"));
  const paidAfter = (await c.vm.stateManager.getAccount(createAddressFromString(nft))).balance;

  console.log(`      supply ${supply0} → ${supply1}; the contract took ` +
              `${(paidAfter - paidBefore) / (10n ** 16n)} × the mint price for ${supply1 - supply0 + 1n} tokens`);

  if (minted > 0 && paidAfter === paidBefore + 10n ** 16n) {
    reproduced("cloneWithKernel issues supply without payment",
      `${minted} extra tokens were drawn from one paid mint, each of them immediately ` +
      `clonable in turn — nothing bounds how many times a paid token may be drawn from`);
  } else {
    refuted("cloneWithKernel issues supply without payment",
      minted === 0 ? "no clone succeeded" : "the contract was paid for each");
  }
}

/*═══════════ CLAIM 3 — a session key survives an ownership cycle ═══════════

  "OwnershipCycle is enforced only inside onlySigner, and executeAsSession
   never calls owner() — so a token transferred into its own Reach leaves
   the session live and unrevokable forever."                               */
head("claim 3 · a session key that nobody can ever revoke");
{
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const id = decUint(await c.read(nft, "totalSupply()"));
  const reach = decAddr(await c.read(nft, "account(uint256)", [id]));
  await c.exec(nft, "embody(uint256)", [id]);
  await c.exec(BASE, "mint(address,uint256)", [reach, 1_000n * WAD]);

  const keeper = "0x" + "e".repeat(40);
  const MAXU64 = (1n << 64n) - 1n;
  let forever = false;
  try {
    await c.exec(reach, "grantSession(address,uint64,uint128,address[],bytes4[])",
      [keeper, MAXU64, 0, [BASE], ["0xa9059cbb"]]);
    forever = true;
  } catch { /* a ceiling refused it */ }
  if (forever) {
    reproduced("a session may be granted an expiry nobody can outlive",
      `grantSession accepted expires=2^64-1 with no ceiling, while seal has MAX_SEAL=365d ` +
      `and bond has MAX_BOND=365d — the one time-promise here that does not cap`);
  } else {
    refuted("a session may be granted an expiry nobody can outlive",
      "grantSession refused 2^64-1; the expiry is capped like every other promise here");
    await c.exec(reach, "grantSession(address,uint64,uint128,address[],bytes4[])",
      [keeper, evm.GENESIS_TIME + 300n * 86400n, 0, [BASE], ["0xa9059cbb"]]);
  }

  // move the token into its own account
  let cycled = false;
  try {
    await c.exec(nft, "transferFrom(address,address,uint256)", [me, reach, id]);
    cycled = decAddr(await c.read(nft, "ownerOf(uint256)", [id])).toLowerCase() === reach.toLowerCase();
  } catch {}
  console.log(`      the token now owned by its own Reach: ${cycled}`);

  if (cycled) {
    let canRevoke = false;
    try { await c.exec(reach, "revokeSession(address)", [keeper]); canRevoke = true; } catch {}
    let sessionActs = false;
    try {
      await asOf(keeper, reach, "executeAsSession(address,uint256,bytes)",
        [BASE, 0, enc("transfer(address,uint256)", [bob, 1_000n * WAD])]);
      sessionActs = true;
    } catch (e) { console.log("      " + String(e.message).slice(0, 80)); }

    if (sessionActs && !canRevoke) {
      reproduced("a session key outlives every way of revoking it",
        `the token owns its own Reach, so every onlySigner path reverts OwnershipCycle — ` +
        `but executeAsSession never calls owner() and moved ${await bal(BASE, bob) / WAD} base out. ` +
        `Nobody can revoke it, ever.`);
    } else if (!sessionActs) {
      refuted("a session key outlives every way of revoking it",
        "executeAsSession also refused under the cycle");
    } else {
      refuted("a session key outlives every way of revoking it", "revokeSession still worked");
    }
  } else {
    refuted("a session key outlives every way of revoking it",
      "the token could not be moved into its own account");
  }
}

/*═══════════ CLAIM 4 — the MEASURED high bit collides ═══════════

  "_verify masks MEASURED off the pre value but compares it against a raw
   post value, so a token that sets bit 255 makes `now_ < pre` always
   false and the seal stops constraining that asset."                       */
head("claim 4 · a guarded token that sets bit 255 escapes the seal");
{
  const HIBIT = await c.deploy(A("test/mocks/HighBit.sol", "HighBit").bytecode);
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const id = decUint(await c.read(nft, "totalSupply()"));
  const reach = decAddr(await c.read(nft, "account(uint256)", [id]));
  await c.exec(nft, "embody(uint256)", [id]);
  await c.exec(HIBIT, "mint(address,uint256)", [reach, 1_000n * WAD]);
  await c.exec(reach, "guard(address)", [HIBIT]);
  await c.exec(reach, "seal(uint64)", [evm.GENESIS_TIME + 100n * 86400n]);

  const raw0 = decUint(await c.read(HIBIT, "rawBalance(address)", [reach]));
  await c.exec(HIBIT, "setTaint(bool)", [true]);
  let drained = false;
  try {
    await c.exec(reach, "execute(address,uint256,bytes,uint8)",
      [HIBIT, 0, enc("transfer(address,uint256)", [bob, 1_000n * WAD]), 0]);
    drained = true;
  } catch (e) { console.log("      " + String(e.message).slice(0, 90)); }
  const raw1 = decUint(await c.read(HIBIT, "rawBalance(address)", [reach]));

  if (drained && raw1 < raw0) {
    reproduced("a token setting bit 255 walks out of a sealed vault",
      `rawBalance ${raw0 / WAD} → ${raw1 / WAD} while sealedUntil was live. _verify compares ` +
      `a masked pre against an unmasked post, so (1<<255) < 1000e18 is false and Shrank never fires`);
  } else {
    refuted("a token setting bit 255 walks out of a sealed vault",
      drained ? "the call went through but nothing moved" : "the seal refused the call");
  }
}

/*═══════════ CLAIM 5 — blind at snapshot means exempt from the check ═══════*/
head("claim 5 · an asset unreadable at snapshot is exempt from its own drain");
{
  const WINK = await c.deploy(A("test/mocks/Winker.sol", "Winker").bytecode);
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const id = decUint(await c.read(nft, "totalSupply()"));
  const reach = decAddr(await c.read(nft, "account(uint256)", [id]));
  await c.exec(nft, "embody(uint256)", [id]);
  await c.exec(WINK, "mint(address,uint256)", [reach, 500n * WAD]);
  await c.exec(reach, "guard(address)", [WINK]);
  await c.exec(reach, "seal(uint64)", [evm.GENESIS_TIME + 100n * 86400n]);

  // control: while readable, the drain must be refused
  let control = false;
  try {
    await c.exec(reach, "execute(address,uint256,bytes,uint8)",
      [WINK, 0, enc("pull(address,uint256)", [bob, 100n * WAD]), 0]);
    control = true;
  } catch {}

  await c.exec(WINK, "pause()", []);
  const blind = decUint(await c.read(reach, "unmeasurable()"), 1);
  const raw0 = decUint(await c.read(WINK, "rawBalance(address)", [reach]));
  let slipped = false;
  try {
    await c.exec(reach, "execute(address,uint256,bytes,uint8)",
      [WINK, 0, enc("pull(address,uint256)", [bob, 500n * WAD]), 0]);
    slipped = true;
  } catch (e) { console.log("      " + String(e.message).slice(0, 90)); }
  const raw1 = decUint(await c.read(WINK, "rawBalance(address)", [reach]));

  console.log(`      unmeasurable() reported ${blind} asset(s) before the call`);
  if (!control && slipped && raw1 < raw0) {
    reproduced("blind at snapshot means exempt for the whole call",
      `the identical call is refused while the asset is readable and goes through while it is ` +
      `not — ${raw0 / WAD} → ${raw1 / WAD}. The call that empties it is also the call that ` +
      `restores its readability, and _verify skipped it on the pre[i]==0 rule`);
  } else {
    refuted("blind at snapshot means exempt for the whole call",
      control ? "the control drain also succeeded — the fixture is wrong"
              : slipped ? "the call went through but nothing moved" : "the seal refused it");
  }
}

/*═══════════ CLAIM 6 — reentrant syncCurve inside a swap ═══════════*/
head("claim 6 · a token hook re-anchors the curve inside somebody else's swap");
{
  const HOOK = await c.deploy(A("test/mocks/Hooked.sol", "Hooked").bytecode);
  await c.exec(pool, "bless(address,bool)", [HOOK, true]);
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const id = decUint(await c.read(nft, "totalSupply()"));
  await c.exec(nft, "commit(uint256,uint256)", [id, maxConcWord]);
  await c.exec(HOOK, "mint(address,uint256)", [me, 10n ** 8n * WAD]);
  await c.exec(HOOK, "approve(address,uint256)", [pool, MAX]);
  await c.exec(pool, "openMarket(uint256,address,address,uint16)", [id, HOOK, QUOTE, 30]);
  await c.exec(pool, "deposit(uint256,uint256,uint256)", [id, 500_000n * WAD, 500_000n * WAD]);

  await c.exec(HOOK, "mint(address,uint256)", [bob, 10n ** 6n * WAD]);
  await asOf(bob, HOOK, "approve(address,uint256)", [pool, MAX]);

  const q = decUint(await c.read(pool, "quote(uint256,bool,uint256)", [id, true, 100_000n * WAD]));
  // arm: during _pull, re-anchor to concentration zero
  await c.exec(HOOK, "arm(address,address,uint256)", [pool, nft, id]);

  const before = await mkt(id);
  let got = 0n, reverted = false;
  try {
    const r = await asOf(bob, pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
      [id, true, 100_000n * WAD, 0, bob, FOREVER]);
    got = decUint(r);
  } catch (e) { reverted = true; console.log("      " + String(e.message).slice(0, 90)); }
  const after = await mkt(id);

  console.log(`      quoted ${q / WAD}, received ${got / WAD}`);
  console.log(`      offsets ${before.vB / WAD}/${before.vQ / WAD} → ${after.vB / WAD}/${after.vQ / WAD}`);

  if (!reverted && (before.vB !== after.vB || before.vQ !== after.vQ)) {
    reproduced("a trade moved the curve it was trading against",
      `the only Pool entry point in that transaction was swap(), and the anchored offsets ` +
      `changed across it — invariant 16b says a trade moves along the curve and never moves ` +
      `it. The trader received ${got / WAD} against a same-transaction quote of ${q / WAD}`);
  } else {
    refuted("a trade moved the curve it was trading against",
      reverted ? "the reentrant call reverted the swap" : "the offsets did not move");
  }
}


/*═══════════ CLAIM 7 — revoke deletes the struct, not the authority ═══════*/
head("claim 7 · a revoked key remembers everything it was ever allowed");
{
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const id = decUint(await c.read(nft, "totalSupply()"));
  const reach = decAddr(await c.read(nft, "account(uint256)", [id]));
  await c.exec(nft, "embody(uint256)", [id]);
  await c.exec(BASE, "mint(address,uint256)", [reach, 1_000n * WAD]);
  await c.exec(QUOTE, "mint(address,uint256)", [reach, 1_000n * WAD]);

  const key = "0x" + "c0ffee".padStart(40, "0");
  const soon = evm.GENESIS_TIME + 300n * 86400n;

  // granted BASE only, then revoked
  await c.exec(reach, "grantSession(address,uint64,uint128,address[],bytes4[])",
    [key, soon, 0, [BASE], ["0xa9059cbb"]]);
  await c.exec(reach, "revokeSession(address)", [key]);
  // re-granted for QUOTE only — BASE was never mentioned again
  await c.exec(reach, "grantSession(address,uint64,uint128,address[],bytes4[])",
    [key, soon, 0, [QUOTE], ["0xa9059cbb"]]);

  const stillAllowed = decBool(await c.read(reach, "sessionAllows(address,address,bytes4)",
    [key, BASE, "0xa9059cbb"]));
  let moved = false;
  try {
    await asOf(key, reach, "executeAsSession(address,uint256,bytes)",
      [BASE, 0, enc("transfer(address,uint256)", [bob, 500n * WAD])]);
    moved = true;
  } catch (e) { console.log("      " + String(e.message).slice(0, 80)); }

  if (stillAllowed || moved) {
    reproduced("a re-granted key resurrects every permission it ever had",
      `the second grant named only QUOTE, and the key ${moved ? "moved BASE anyway" : "still reads as allowed on BASE"}. ` +
      `revokeSession deletes sessionOf and leaves sessionTarget/sessionSelector standing`);
  } else {
    refuted("a re-granted key resurrects every permission it ever had",
      "the old allowlist did not survive the revoke");
  }
}

/*═══════════ CLAIM 8 — balanceOf is a count, for an ERC-721 ═══════════*/
head("claim 8 · a sealed vault swaps a valuable NFT for a worthless one");
{
  const NFT721 = await c.deploy(A("test/mocks/MockERC721.sol", "MockERC721").bytecode);
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const id = decUint(await c.read(nft, "totalSupply()"));
  const reach = decAddr(await c.read(nft, "account(uint256)", [id]));
  await c.exec(nft, "embody(uint256)", [id]);

  const BROKER = await c.deploy(A("test/mocks/Broker.sol", "Broker").bytecode);
  await c.exec(NFT721, "mint(address,uint256)", [reach, 1]);      // the good one
  await c.exec(NFT721, "mint(address,uint256)", [me, 9999]);      // the junk one
  await c.exec(NFT721, "setApprovalForAll(address,bool)", [BROKER, true]);
  await c.exec(reach, "guard(address)", [NFT721]);
  /* the approval is granted BEFORE the seal, which is the realistic case: a
     venue the vault already used, still approved when the seal went on. A
     sealed account cannot grant a NEW one on a manifest asset, but nothing
     retracts the ones it already gave. */
  await c.exec(reach, "execute(address,uint256,bytes,uint8)",
    [NFT721, 0, enc("setApprovalForAll(address,bool)", [BROKER, true]), 0]);
  /* the identity list, which is the thing under test — a COUNT cannot say
     "this vault holds THAT one", and the swap below never touches the
     collection directly, so deny-by-default has nothing to refuse */
  await c.exec(reach, "guardNFT(address,uint256)", [NFT721, 1]);
  await c.exec(reach, "seal(uint64)", [evm.GENESIS_TIME + 200n * 86400n]);

  /*  The control, and it is the whole point of the claim: an identical
      vault that guards the COLLECTION but not the PIECE. If the swap goes
      through there and is refused here, the count-based manifest is proven
      blind and the identity list is proven to be what sees it.            */
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const cid = decUint(await c.read(nft, "totalSupply()"));
  const creach = decAddr(await c.read(nft, "account(uint256)", [cid]));
  await c.exec(nft, "embody(uint256)", [cid]);
  await c.exec(NFT721, "mint(address,uint256)", [creach, 77]);
  await c.exec(NFT721, "mint(address,uint256)", [me, 78]);
  await c.exec(creach, "guard(address)", [NFT721]);          // the count only
  await c.exec(creach, "execute(address,uint256,bytes,uint8)",
    [NFT721, 0, enc("setApprovalForAll(address,bool)", [BROKER, true]), 0]);
  await c.exec(creach, "seal(uint64)", [evm.GENESIS_TIME + 200n * 86400n]);
  let controlSwapped = false;
  try {
    await c.exec(creach, "execute(address,uint256,bytes,uint8)",
      [BROKER, 0, enc("swapPieces(address,uint256,uint256,address)", [NFT721, 77, 78, bob]), 0]);
    controlSwapped = decAddr(await c.read(NFT721, "ownerOf(uint256)", [77])).toLowerCase()
      === bob.toLowerCase();
  } catch (e) { console.log("      control: " + String(e.message).slice(0, 70)); }
  console.log(`      control (count only, no identity list): swap ${controlSwapped ? "SUCCEEDED" : "refused"}`);

  const held0 = decAddr(await c.read(NFT721, "ownerOf(uint256)", [1]));
  /* one approval and one venue call — neither of them a word said to the
     manifest asset, so the sealed account's selector rule never fires */
  let swapped = false;
  try {
    await c.exec(reach, "executeBatch((address,uint256,bytes)[])", []).catch(() => {});
    await c.exec(reach, "execute(address,uint256,bytes,uint8)",
      [BROKER, 0, enc("swapPieces(address,uint256,uint256,address)",
        [NFT721, 1, 9999, bob]), 0]);
    swapped = true;
  } catch (e) { console.log("      " + String(e.message).slice(0, 80)); }
  const held1 = decAddr(await c.read(NFT721, "ownerOf(uint256)", [1]));
  const count = decUint(await c.read(NFT721, "balanceOf(address)", [reach]));

  console.log(`      the vault's count is still ${count}; token #1 owner ${held0.slice(0,10)} → ${held1.slice(0,10)}`);
  if (swapped && held1.toLowerCase() !== held0.toLowerCase()) {
    reproduced("the seal protects how many NFTs, not which",
      `token #1 left a sealed vault and #9999 arrived, balanceOf 1 → 1 throughout. ` +
      `The manifest measures a COUNT for an ERC-721 and the comment claimed one manifest ` +
      `covered both`);
  } else if (!controlSwapped) {
    refuted("the seal protects how many NFTs, not which",
      "INCONCLUSIVE — the control was refused too, so something other than the identity " +
      "list is doing the work and this test proves nothing about guardNFT");
  } else {
    refuted("the seal protects how many NFTs, not which",
      "the control swapped freely with only the collection guarded, and this one was refused " +
      "with the piece guarded — so a count is blind to identity and the identity list is what sees it");
  }
}

/*═══════════ CLAIM 9 — uint112 truncation of the anchored offsets ═══════*/
head("claim 9 · the anchored offsets truncate at uint112");
{
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const id = decUint(await c.read(nft, "totalSupply()"));
  await c.exec(nft, "commit(uint256,uint256)", [id, maxConcWord]);
  const HUGE = (1n << 112n) - 1n;
  await c.exec(BASE, "mint(address,uint256)", [me, HUGE]);
  await c.exec(QUOTE, "mint(address,uint256)", [me, HUGE]);
  await c.exec(pool, "openMarket(uint256,address,address,uint16)", [id, BASE, QUOTE, 30]);
  await c.exec(pool, "deposit(uint256,uint256,uint256)", [id, 10n ** 24n, 10n ** 24n]);

  /*  One enormous trade is refused by the output cap — out would exceed half
      the quote reserve. So the quote side is drained first, in halves; once
      it is small, an arbitrarily large base-in trade produces a tiny output
      and sails past the cap. The base reserve is what the offsets scale
      from, and it is the one nothing bounds but MAX_RESERVE.              */
  for (let i = 0; i < 60; i++) {
    const m = await mkt(id);
    if (m.rB > HUGE / 7n) break;
    let grew = false;
    for (const size of [m.rB, m.rB / 2n, m.rB / 8n, m.rB / 64n]) {
      if (size === 0n) continue;
      try {
        await c.exec(pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
          [id, true, size, 0, me, FOREVER]);
        grew = true; break;
      } catch {}
    }
    if (!grew) break;
  }

  const before = await mkt(id);
  console.log(`      rBase ${before.rB}, MAX_RESERVE/8 ${HUGE / 8n}`);
  let truncated = false;
  try {
    await c.exec(pool, "syncCurve(uint256)", [id]);     // re-anchors, no deposit cap
    const after = await mkt(id);
    const wanted = after.rB * 80000n / 10000n;
    truncated = wanted > HUGE && after.vB !== wanted;
    console.log(`      offsets should be ${wanted}, are ${after.vB}`);
  } catch (e) { console.log("      sync: " + String(e.message).slice(0, 70)); }

  if (truncated) {
    reproduced("the anchored offsets truncate silently at uint112",
      `an 8x concentration on a reserve above MAX_RESERVE/8 overflows the uint112 the offset ` +
      `is stored in, and Solidity 0.8 does not revert on an explicit downcast — the curve ` +
      `becomes a different curve than the one committed`);
  } else {
    refuted("the anchored offsets truncate silently at uint112",
      "the reserve could not be driven high enough, or the cast held");
  }
}

/*═══════════ CLAIM 10 — an approval word the enumeration never heard of ═══*/
head("claim 10 · standing custody granted under a selector nobody listed");
{
  const P2 = await c.deploy(A("test/mocks/Permit2ish.sol", "Permit2ish").bytecode);
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const id = decUint(await c.read(nft, "totalSupply()"));
  const reach = decAddr(await c.read(nft, "account(uint256)", [id]));
  await c.exec(nft, "embody(uint256)", [id]);
  await c.exec(P2, "mint(address,uint256)", [reach, 1_000n * WAD]);
  await c.exec(reach, "guard(address)", [P2]);
  await c.exec(reach, "seal(uint64)", [evm.GENESIS_TIME + 200n * 86400n]);

  // the listed word is refused
  let plain = false;
  try {
    await c.exec(reach, "execute(address,uint256,bytes,uint8)",
      [P2, 0, enc("approve(address,uint256)", [bob, MAX]), 0]);
    plain = true;
  } catch {}

  // the unlisted one, same authority
  let sneaky = false;
  try {
    await c.exec(reach, "execute(address,uint256,bytes,uint8)",
      [P2, 0, enc("approve(address,address,uint160,uint48)",
        [P2, bob, (1n << 160n) - 1n, 0]), 0]);
    sneaky = true;
  } catch (e) { console.log("      " + String(e.message).slice(0, 80)); }

  const allowed = decUint(await c.read(P2, "allowance(address,address)", [reach, bob]));
  if (!plain && sneaky && allowed > 0n) {
    reproduced("an approval under an unlisted selector goes through a seal",
      `approve(address,uint256) is refused and approve(address,address,uint160,uint48) is not. ` +
      `Standing custody of ${allowed / WAD} granted from inside a live seal — the approval ` +
      `defence is an enumeration, which this file's own comment says cannot be completed`);
  } else {
    refuted("an approval under an unlisted selector goes through a seal",
      plain ? "the listed word was not refused — fixture wrong" : "the unlisted word was refused too");
  }
}

/*═══════════ CLAIM 11 — a manifest token can brick a sealed vault ═══════*/
head("claim 11 · a guarded token can shut a sealed vault for the length of its seal");
{
  const TRAP = await c.deploy(A("test/mocks/Trap.sol", "Trap").bytecode);
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const id = decUint(await c.read(nft, "totalSupply()"));
  const reach = decAddr(await c.read(nft, "account(uint256)", [id]));
  await c.exec(nft, "embody(uint256)", [id]);
  await c.exec(TRAP, "mint(address,uint256)", [reach, WAD]);
  await c.exec(BASE, "mint(address,uint256)", [reach, 10_000n * WAD]);
  await c.exec(reach, "guard(address)", [TRAP]);
  await c.exec(reach, "guard(address)", [BASE]);
  await c.exec(reach, "seal(uint64)", [evm.GENESIS_TIME + 300n * 86400n]);

  const benign = () => c.exec(reach, "execute(address,uint256,bytes,uint8)",
    [BASE, 0, enc("balanceOf(address)", [reach]), 0]);
  let before = 0; for (let i = 0; i < 3; i++) { try { await benign(); before++; } catch {} }

  await c.exec(TRAP, "arm(address)", [reach]);
  let after = 0; for (let i = 0; i < 3; i++) { try { await benign(); after++; } catch {} }

  // every escape, in the same state
  const escapes = [];
  for (const [n, f] of [
    ["unguard", () => c.exec(reach, "unguard(address)", [TRAP])],
    ["shorten the seal", () => c.exec(reach, "seal(uint64)", [evm.GENESIS_TIME + 1n])]
  ]) { try { await f(); escapes.push(n); } catch {} }

  console.log(`      benign calls: ${before}/3 before arming, ${after}/3 after; escapes: ${escapes.length}`);
  if (before === 3 && after === 0 && escapes.length === 0) {
    reproduced("a guarded token can shut the account and leave no way out",
      `three identical harmless calls succeeded, then none did, and neither unguard nor a ` +
      `seal change is available. The account is unusable for the seal's full length and the ` +
      `asset chose the moment`);
  } else {
    refuted("a guarded token can shut the account and leave no way out",
      after > 0 ? "the account kept working" : `an escape was available: ${escapes.join(", ")}`);
  }
}

/*═══════════ CLAIM 12 — an attestation that never expires ═══════════*/
head("claim 12 · an attestation signature is replayable forever");
{
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const id = decUint(await c.read(nft, "totalSupply()"));
  const reach = decAddr(await c.read(nft, "account(uint256)", [id]));
  await c.exec(nft, "embody(uint256)", [id]);
  await c.exec(reach, "seal(uint64)", [evm.GENESIS_TIME + 300n * 86400n]);

  const abi = A("src/IpseityAccount.sol", "IpseityAccount").abi;
  const dig = abi.find((f) => f.name === "attestationDigest");
  const args = dig ? dig.inputs.map((i) => i.name + ":" + i.type).join(", ") : "(absent)";
  console.log(`      attestationDigest(${args})`);

  const hasNonce = /nonce|deadline|expir/i.test(args);
  if (!hasNonce) {
    reproduced("an attestation carries no nonce and no expiry",
      `the digest is a pure function of (purpose, payload) and the account address, so one ` +
      `signature authenticates the same statement forever, to everyone, with no way to retire ` +
      `it short of the seal lapsing`);
  } else {
    refuted("an attestation carries no nonce and no expiry", `the struct is ${args}`);
  }
}

/*═══════════ CLAIM 13 — trading locks the holder out of deposit ═══════════*/
head("claim 13 · trading past the cap locks the holder out of their own market");
{
  await c.exec(nft, "mint()", [], { value: 10n ** 16n });
  const id = decUint(await c.read(nft, "totalSupply()"));
  await c.exec(pool, "openMarket(uint256,address,address,uint16)", [id, BASE, QUOTE, 30]);
  await c.exec(pool, "deposit(uint256,uint256,uint256)", [id, CAP, CAP]);   // exactly at the cap

  let pushed = false;
  try {
    await c.exec(pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
      [id, true, 10n * WAD, 0, me, FOREVER]);
    pushed = (await mkt(id)).rB > CAP;
  } catch (e) { console.log("      " + String(e.message).slice(0, 70)); }

  let locked = false;
  if (pushed) {
    try { await c.exec(pool, "deposit(uint256,uint256,uint256)", [id, 0, 1n]); }
    catch { locked = true; }
  }
  console.log(`      rBase ${(await mkt(id)).rB} vs cap ${CAP}; quote-only deposit ${locked ? "refused" : "accepted"}`);

  if (pushed && locked) {
    reproduced("trading past maxDeposit locks the holder out of deposit entirely",
      `swap never consults maxDeposit, so a trade pushed rBase above it — and deposit then ` +
      `re-checks the untouched side, so even a 1-wei quote-only top-up is refused. Under a ` +
      `live bond the market becomes fully inoperable for its owner`);
  } else {
    refuted("trading past maxDeposit locks the holder out of deposit entirely",
      pushed ? "deposit still worked" : "the trade did not push the reserve past the cap");
  }
}

/*───────────────────────────────────────────────────────────────────────────*/
console.log("");
if (REPRO.length === 0) {
  console.log(`  \x1b[32mnone of the ${SAFE.length} claims reproduced\x1b[0m\n`);
  process.exit(0);
}
console.log(`  \x1b[31m${REPRO.length} of ${REPRO.length + SAFE.length} claims reproduced\x1b[0m`);
for (const r of REPRO) console.log(`    · ${r.name}`);
console.log("");
process.exit(1);
