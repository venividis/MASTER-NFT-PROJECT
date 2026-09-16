#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · the market, on a real EVM

  This is money code, so the tests are written to break it rather than to
  demonstrate it. The three that matter:

    · the invariant never falls, over hundreds of random trades
    · a round trip always loses money, so there is no free arbitrage to
      take out of the curve
    · nobody but the holder can move the inventory, including a renter

  Everything else is plumbing.

    node tools/verify-pool.mjs
───────────────────────────────────────────────────────────────────────────*/
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, artifact } from "./compile.mjs";
import { Chain, enc, decUint, decAddr, decBool, encodeAddressArg } from "./evm.mjs";
import { createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";
const MAX = (1n << 256n) - 1n;
const DEADLINE = 4102444800n;

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${name}`);
  if (!cond && detail !== undefined) console.log(`      ${detail}`);
};
const eq = (name, got, want) => ok(name, String(got) === String(want), `got ${got}\n      want ${want}`);
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);
const WAD = 10n ** 18n;
const fmt = (v, d = 18) => {
  const n = BigInt(v);
  const w = n / 10n ** BigInt(d);
  const f = (n % 10n ** BigInt(d)).toString().padStart(d, "0").slice(0, 4);
  return `${w}.${f}`;
};

/*──────────────────── deploy ────────────────────*/
head("deploy");
const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();

const tmpReg = await c.deploy(A("test/mocks/ERC6551Registry.sol", "ERC6551Registry").bytecode);
await c.vm.stateManager.putCode(
  createAddressFromString(REGISTRY),
  await c.vm.stateManager.getCode(createAddressFromString(tmpReg)));

const engine = await c.deploy(A("src/Engine.sol", "Engine").bytecode, "0".repeat(64));
const sigil = await c.deploy(A("src/Sigil.sol", "Sigil").bytecode);
const renderer = await c.deploy(A("src/Renderer.sol", "Renderer").bytecode,
  encodeAddressArg(engine) + encodeAddressArg(sigil));
const acctImpl = await c.deploy(A("src/IpseityAccount.sol", "IpseityAccount").bytecode);
const gripImpl = await c.deploy(A("src/GripVault.sol", "GripVault").bytecode);
const nft = await c.deploy(A("src/Ipseity.sol", "Ipseity").bytecode,
  encodeAddressArg(renderer) + encodeAddressArg(acctImpl) + encodeAddressArg(gripImpl) + (1).toString(16).padStart(64, "0") + (4096).toString(16).padStart(64, "0"));

const CAP = 10n ** 24n;   // 1,000,000 tokens per side while unaudited
const timelock = await c.deploy(A("src/lib/Timelock.sol", "Timelock").bytecode,
  encodeAddressArg(c.from.toString()), "Timelock");
// admin is the deployer here so the suite can exercise the switches directly;
// in production it is the Timelock, and tools/verify-timelock.mjs covers that
const pool = await c.deploy(A("src/Pool.sol", "Pool").bytecode,
  encodeAddressArg(nft) + BigInt(CAP).toString(16).padStart(64, "0") +
  encodeAddressArg(c.from.toString()) + "0".repeat(64), "Pool");

const mock = A("test/mocks/MockERC20.sol", "MockERC20").bytecode;
const encStr = (s) => {
  const b = Buffer.from(s, "utf8");
  return b.length.toString(16).padStart(64, "0") + b.toString("hex").padEnd(64, "0");
};
/* constructor(string,string,uint8,uint256,bool) — the two strings are
   dynamic, so the head carries their offsets and the tail carries the data */
const mkToken = async (name, sym, dec, feeBps, silent) => {
  const nameEnc = encStr(name);
  const symOff = 0xa0 + nameEnc.length / 2;
  const args =
    (0xa0).toString(16).padStart(64, "0") +
    BigInt(symOff).toString(16).padStart(64, "0") +
    BigInt(dec).toString(16).padStart(64, "0") +
    BigInt(feeBps).toString(16).padStart(64, "0") +
    (silent ? "1" : "0").padStart(64, "0") +
    nameEnc + encStr(sym);
  return c.deploy(mock, args);
};

const WETH = await mkToken("Wrapped Ether", "WETH", 18, 0, false);
const USDC = await mkToken("USD Coin", "USDC", 18, 0, false);
const USDT = await mkToken("Tether", "USDT", 18, 0, true);      // returns nothing
const FEET = await mkToken("FeeOnTransfer", "FOT", 18, 100, false); // takes 1%

ok("contracts deployed", true);
console.log(`      Pool ${pool}`);
console.log(`      deposit cap ${fmt(CAP)} per side`);

/*──────────────────── set up a market ────────────────────*/
head("token #1 opens a market");
await c.exec(nft, "mint()", [], { value: 10n ** 16n });
const me = c.from.toString();
for (const t of [WETH, USDC, USDT, FEET]) {
  await c.exec(t, "mint(address,uint256)", [me, 10n ** 27n]);
  await c.exec(t, "approve(address,uint256)", [pool, MAX]);
}

// a plain, unturned section: 24-cell, mid-slice, no rotation through w
await c.exec(nft, "commit(uint256,uint256)",
  [1, (2n << 112n) | (33n << 120n) | (32768n << 96n)]);

await c.exec(pool, "openMarket(uint256,address,address,uint16)", [1, WETH, USDC, 30], { label: "openMarket" });
await c.exec(pool, "deposit(uint256,uint256,uint256)", [1, 100n * WAD, 300000n * WAD], { label: "deposit" });

const m0 = await c.read(pool, "market(uint256)", [1]);
eq("base reserve", decUint(m0, 2), 100n * WAD);
eq("quote reserve", decUint(m0, 3), 300000n * WAD);
eq("fee", decUint(m0, 4), 30);
ok("market is open", decBool(m0, 5));
console.log(`      spot: 1 WETH = ${fmt(decUint(m0, 7))} USDC`);
console.log(`      concentration: ${decUint(m0, 6)} bps (section unturned)`);

/*──────────────────── a stranger trades ────────────────────*/
head("anyone may trade against it");
const bob = "0x" + "b0b".padStart(40, "0");
await c.fund(bob, 10n ** 20n);
await c.exec(WETH, "mint(address,uint256)", [bob, 10n ** 24n]);

const asBob = async (to, sig, args, value = 0n) => {
  const r = await c.vm.evm.runCall({
    to: createAddressFromString(to),
    caller: createAddressFromString(bob), origin: createAddressFromString(bob),
    data: hexToBytes(enc(sig, args)), gasLimit: 30_000_000n, value,
    block: (await import("./evm.mjs")).BLOCK
  });
  if (r.execResult.exceptionError) {
    const e = new Error(r.execResult.exceptionError.error);
    e.data = bytesToHex(r.execResult.returnValue || new Uint8Array());
    throw e;
  }
  return bytesToHex(r.execResult.returnValue);
};

await asBob(WETH, "approve(address,uint256)", [pool, MAX]);
const q = decUint(await c.read(pool, "quote(uint256,bool,uint256)", [1, true, WAD]));
console.log(`      quote: 1 WETH -> ${fmt(q)} USDC`);
ok("a quote is under the spot price (the curve charges for size)", q < decUint(m0, 7));

const before = decUint(await c.read(USDC, "balanceOf(address)", [bob]));
await asBob(pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
  [1, true, WAD, 0, bob, DEADLINE]);
const after = decUint(await c.read(USDC, "balanceOf(address)", [bob]));
eq("the trader was paid exactly what was quoted", after - before, q);
eq("the trade counter moved", decUint(await c.read(pool, "tradeCount(uint256)", [1])), 1);

/*──────────────────── the invariant ────────────────────*/
head("the invariant never falls");
/* Read the anchored offsets out of the market rather than recomputing them
   from the live reserves. Recomputing is what hid the round-trip leak that
   tools/fuzz.mjs found: virtual reserves proportional to live reserves move
   the curve on every trade, so k measured that way is not the quantity the
   pricing conserves. marketOf returns them in declaration order, words 8
   and 9. */
const inv = async () => {
  const m = await c.read(pool, "market(uint256)", [1]);
  const raw = await c.read(pool, "marketOf(uint256)", [1]);
  const rb = decUint(m, 2), rq = decUint(m, 3);
  const vb = decUint(raw, 8), vq = decUint(raw, 9);
  return { k: (rb + vb) * (rq + vq), rb, rq };
};

let k = (await inv()).k;
let worst = null;
// a deterministic walk of trades in both directions, of wildly varying size
let seed = 123456789n;
const rnd = (n) => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); return seed % n; };

for (let i = 0; i < 200; i++) {
  const baseIn = rnd(2n) === 0n;
  const r = await inv();
  const cap = baseIn ? r.rb : r.rq;
  const amount = 1n + rnd(cap / 40n === 0n ? 1n : cap / 40n);
  try {
    await asBob(pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
      [1, baseIn, amount, 0, bob, DEADLINE]);
  } catch { continue; }   // refused trades are fine; they change nothing
  const now = (await inv()).k;
  if (now < k) { worst = { i, before: k, after: now }; break; }
  k = now;
}
ok("k never decreased across 200 random trades", worst === null,
   worst && `fell at trade ${worst.i}: ${worst.before} -> ${worst.after}`);
console.log(`      k grew to ${(Number(k) / Number((await inv()).k) * 100).toFixed(1)}% of final`);

/*──────────────────── no free money ────────────────────*/
head("a round trip always loses money");
let leaks = 0;
for (const size of [WAD / 1000n, WAD / 10n, WAD, 3n * WAD]) {
  const b0 = decUint(await c.read(WETH, "balanceOf(address)", [bob]));
  let gotUsdc;
  try {
    gotUsdc = decUint(await asBob(pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
      [1, true, size, 0, bob, DEADLINE]));
  } catch { continue; }
  await asBob(USDC, "approve(address,uint256)", [pool, MAX]);
  try {
    await asBob(pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
      [1, false, gotUsdc, 0, bob, DEADLINE]);
  } catch { continue; }
  const b1 = decUint(await c.read(WETH, "balanceOf(address)", [bob]));
  const profit = b1 > b0;
  if (profit) leaks++;
  console.log(`      in ${fmt(size)} WETH -> out ${fmt(b1 - b0 + size)} WETH  ` +
              `${profit ? "\x1b[31mPROFIT\x1b[0m" : "loss"}`);
}
ok("no round trip ever came back with more than it started", leaks === 0);

/*──────────────────── the shape is the curve ────────────────────*/
head("rotating the solid re-prices the market");
const priceNow = () => c.read(pool, "quote(uint256,bool,uint256)", [1, true, WAD]).then(decUint);
/*  Anchor at the reserves as they stand before measuring anything. The
    trades above moved them, and the stored offsets are from before that —
    so without this the comparison below is between a stale anchor and a
    fresh one, and reports re-anchoring as if it were concentration.    */
await c.exec(pool, "syncCurve(uint256)", [1], { label: "syncCurve" });
const flat = await priceNow();
const cFlat = decUint(await c.read(pool, "market(uint256)", [1]), 6);

/*  A QUARTER turn in the w-planes, not a half.

    This fixture used to set all three to 32768 — half a turn — and called
    it "edge on". It is not: half a turn about each w-plane returns the cut
    plane exactly where it started, so the section is identical to rest and
    the picture shows an unturned solid. The old concentration was a sum of
    angles, which happened to read that as maximal, and the fixture was
    built to match. Both were wrong in the same direction, which is how a
    test comes to certify a bug.

    A quarter turn genuinely tips the cut plane out of the holder's
    3-space, and the section really does narrow.                         */
const turned = (16384n << 48n) | (16384n << 64n) | (16384n << 80n) |
               (32768n << 96n) | (2n << 112n) | (33n << 120n);
await c.exec(nft, "commit(uint256,uint256)", [1, turned], { label: "commit (re-price)" });
ok("the market has not moved yet — the curve is a copy", (await priceNow()) === flat);
await c.exec(pool, "syncCurve(uint256)", [1], { label: "syncCurve" });
const tight = await priceNow();
const cTight = decUint(await c.read(pool, "market(uint256)", [1]), 6);

console.log(`      unturned  concentration ${cFlat.toString().padStart(5)} bps   1 WETH -> ${fmt(flat)} USDC`);
console.log(`      edge on   concentration ${cTight.toString().padStart(5)} bps   1 WETH -> ${fmt(tight)} USDC`);
ok("turning through w raised the concentration", cTight > cFlat);
ok("and that changed the price a trader is quoted", tight !== flat);
ok("a concentrated curve gives a better price for the same size", tight > flat,
   `${tight} vs ${flat}`);

/*──────────────────── protections ────────────────────*/
head("what it refuses");
const refuses = async (name, fn, why) => {
  let threw = false, msg = "";
  try { await fn(); } catch (e) { threw = true; msg = e.data || e.message; }
  ok(name, threw, "it allowed it — " + why);
};

await refuses("a trade below the trader's minimum", () =>
  asBob(pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
    [1, true, WAD, 10n ** 30n, bob, DEADLINE]), "slippage protection is not working");

await refuses("a trade past its deadline", () =>
  asBob(pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
    [1, true, WAD, 0, bob, 1n]), "the deadline is not checked");

await refuses("a trade larger than half the reserve", () =>
  asBob(pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
    [1, true, 10n ** 24n, 0, bob, DEADLINE]), "the pool can be asked to overpay");

await refuses("a stranger withdrawing the inventory", () =>
  asBob(pool, "withdraw(uint256,uint256,uint256,address)", [1, 1n, 1n, bob]),
  "anyone can take the liquidity");

await refuses("a stranger opening a market on someone else's token", () =>
  asBob(pool, "openMarket(uint256,address,address,uint16)", [1, WETH, USDC, 30]),
  "markets are not owned");

await refuses("a fee above the cap", () =>
  c.exec(pool, "setFee(uint256,uint16)", [1, 501]), "the fee cap is not enforced");

await refuses("a deposit past the cap", () =>
  c.exec(pool, "deposit(uint256,uint256,uint256)", [1, CAP * 2n, 0]), "the cap is not enforced");

await refuses("closing a market that still holds inventory", () =>
  c.exec(pool, "closeMarket(uint256)", [1]), "inventory can be orphaned");

/*──────────────────── awkward tokens ────────────────────*/
head("tokens that break naive pools");
await c.exec(nft, "mint()", [], { value: 10n ** 16n });
await c.exec(pool, "openMarket(uint256,address,address,uint16)", [2, USDT, FEET, 30]);
await c.exec(pool, "deposit(uint256,uint256,uint256)", [2, 1000n * WAD, 1000n * WAD]);
const m2 = await c.read(pool, "market(uint256)", [2]);
eq("a token that returns nothing from transfer is accepted", decUint(m2, 2), 1000n * WAD);
ok("a token that takes a cut is credited only what arrived",
   decUint(m2, 3) === 990n * WAD, `credited ${fmt(decUint(m2, 3))}, sent 1000`);

/*──────────────────── the market travels with the token ────────────────────*/
head("selling the token sells the market");
const carol = "0x" + "ca201".padStart(40, "0");
await c.exec(nft, "transferFrom(address,address,uint256)", [c.from.toString(), carol, 1]);
eq("the token moved", decAddr(await c.read(nft, "ownerOf(uint256)", [1])).toLowerCase(), carol);

const mAfter = await c.read(pool, "market(uint256)", [1]);
ok("the reserves went with it", decUint(mAfter, 2) > 0n && decUint(mAfter, 3) > 0n,
   `${fmt(decUint(mAfter, 2))} / ${fmt(decUint(mAfter, 3))}`);

await refuses("the old owner can no longer touch the inventory", () =>
  c.exec(pool, "withdraw(uint256,uint256,uint256,address)", [1, 1n, 0n, c.from.toString()]),
  "the market did not transfer");

const asCarol = async (sig, args) => {
  const r = await c.vm.evm.runCall({
    to: createAddressFromString(pool),
    caller: createAddressFromString(carol), origin: createAddressFromString(carol),
    data: hexToBytes(enc(sig, args)), gasLimit: 30_000_000n, value: 0n,
    block: (await import("./evm.mjs")).BLOCK
  });
  if (r.execResult.exceptionError) throw new Error(r.execResult.exceptionError.error);
  return bytesToHex(r.execResult.returnValue);
};
const cBefore = decUint(await c.read(WETH, "balanceOf(address)", [carol]));
await asCarol("withdraw(uint256,uint256,uint256,address)", [1, WAD, 0n, carol]);
const cAfter = decUint(await c.read(WETH, "balanceOf(address)", [carol]));
eq("and the new owner can", cAfter - cBefore, WAD);

/*──────────────────── the renter ────────────────────*/
head("a renter operates the artwork but never the money");
await c.exec(nft, "mint()", [], { value: 10n ** 16n });
await c.exec(pool, "openMarket(uint256,address,address,uint16)", [3, WETH, USDC, 30]);
await c.exec(pool, "deposit(uint256,uint256,uint256)", [3, 10n * WAD, 100n * WAD]);
await c.exec(nft, "setUser(uint256,address,uint64)", [3, bob, DEADLINE]);
eq("bob is the renter", decAddr(await c.read(nft, "userOf(uint256)", [3])).toLowerCase(), bob);

const quoteBefore = decUint(await c.read(pool, "quote(uint256,bool,uint256)", [3, true, WAD]));

// the renter turns the solid hard through w — which, on a live read, would
// concentrate the curve and hand them a better rate on the owner's inventory
let renterTurned = false;
try {
  await asBob(nft, "commit(uint256,uint256)",
    [3, (32768n << 48n) | (32768n << 64n) | (32768n << 80n) | (32768n << 96n) | (2n << 112n)]);
  renterTurned = true;
} catch { /* ignore */ }
ok("the renter can turn the solid — that is what renting the artwork means", renterTurned);

const quoteAfter = decUint(await c.read(pool, "quote(uint256,bool,uint256)", [3, true, WAD]));
ok("but the market did not move with it", quoteAfter === quoteBefore,
   `the renter re-priced someone else's liquidity: ${quoteBefore} -> ${quoteAfter}`);

const pend = await c.read(pool, "pendingCurve(uint256)", [3]);
ok("the pool reports the drift instead of acting on it", decBool(pend, 0));
console.log(`      market holds ${decUint(pend, 1)} bps, artwork now shows ${decUint(pend, 2)} bps`);

await refuses("the renter cannot sync the curve either", () =>
  asBob(pool, "syncCurve(uint256)", [3]), "a renter can re-price the owner's market");

// the holder syncs deliberately, and only then does the market follow
await c.exec(pool, "syncCurve(uint256)", [3], { label: "syncCurve" });
const quoteSynced = decUint(await c.read(pool, "quote(uint256,bool,uint256)", [3, true, WAD]));
ok("the holder syncing is what moves the market", quoteSynced !== quoteBefore);

await refuses("and the renter still cannot withdraw a penny", () =>
  asBob(pool, "withdraw(uint256,uint256,uint256,address)", [3, 1n, 0n, bob]),
  "a renter can steal the inventory");

/*──────────────────── the bond ────────────────────*/
head("the bond — a promise a buyer can check");
await c.exec(nft, "mint()", [], { value: 10n ** 16n });
await c.exec(pool, "openMarket(uint256,address,address,uint16)", [4, WETH, USDC, 30]);
await c.exec(pool, "deposit(uint256,uint256,uint256)", [4, 10n * WAD, 30000n * WAD]);

const NOW = 1733000000n;                        // the harness block timestamp
ok("unbonded to begin with", !decBool(await c.read(pool, "isBonded(uint256)", [4])));
await c.exec(pool, "bond(uint256,uint64)", [4, NOW + 86400n], { label: "bond" });
ok("bonded now", decBool(await c.read(pool, "isBonded(uint256)", [4])));
eq("the date is readable by anyone", decUint(await c.read(pool, "bondedUntil(uint256)", [4])), NOW + 86400n);

await refuses("withdrawing while bonded", () =>
  c.exec(pool, "withdraw(uint256,uint256,uint256,address)", [4, 1n, 0n, me]),
  "the bond does not hold the inventory");
await refuses("closing the market while bonded", () =>
  c.exec(pool, "closeMarket(uint256)", [4]), "a bond can be escaped by closing");
await refuses("re-pricing the fee while bonded", () =>
  c.exec(pool, "setFee(uint256,uint16)", [4, 100]), "a bonded market can still be repriced");
await refuses("re-shaping the curve while bonded", () =>
  c.exec(pool, "syncCurve(uint256)", [4]),
  "a bond that lets its maker reshape the curve is the same rug with more steps");
await refuses("shortening the bond", () =>
  c.exec(pool, "bond(uint256,uint64)", [4, NOW + 100n]), "the ratchet turns backwards");
await refuses("a bond longer than anyone can outlive", () =>
  c.exec(pool, "bond(uint256,uint64)", [4, NOW + 400n * 86400n]), "the bond has no ceiling");

// additive operations must still work, or a bonded market cannot be topped up
let deposited = true;
try { await c.exec(pool, "deposit(uint256,uint256,uint256)", [4, WAD, 0n]); }
catch { deposited = false; }
ok("depositing into a bonded market still works", deposited);
let traded = true;
try {
  await asBob(pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
    [4, true, WAD / 10n, 0, bob, DEADLINE]);
} catch { traded = false; }
ok("and so does trading against it", traded);

await c.exec(pool, "bond(uint256,uint64)", [4, NOW + 172800n]);
eq("the bond extends", decUint(await c.read(pool, "bondedUntil(uint256)", [4])), NOW + 172800n);

// and it survives the sale — that is the entire point
await c.exec(nft, "transferFrom(address,address,uint256)", [me, carol, 4]);
eq("the bond survives the sale", decUint(await c.read(pool, "bondedUntil(uint256)", [4])), NOW + 172800n);
await refuses("and binds the new owner too", () =>
  asCarol("withdraw(uint256,uint256,uint256,address)", [4, 1n, 0n, carol]),
  "the buyer can empty what they promised to keep");

/*──────────────────── the pause ────────────────────*/
head("the pause halts trade, never custody");
await c.exec(pool, "setPaused(bool)", [true], { label: "setPaused" });
await refuses("trading while paused", () =>
  asBob(pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
    [1, true, WAD, 0, bob, DEADLINE]), "the pause does not stop trading");
await refuses("depositing while paused", () =>
  c.exec(pool, "deposit(uint256,uint256,uint256)", [1, WAD, 0n]), "the pause does not stop deposits");

// the one thing a pause must never do
let withdrew = true;
try { await asCarol("withdraw(uint256,uint256,uint256,address)", [1, WAD, 0n, carol]); }
catch (e) { withdrew = false; }
ok("but withdrawal still works — a pause that traps money is a slower theft", withdrew);
await c.exec(pool, "setPaused(bool)", [false]);

/*──────────────────── the allowlist ────────────────────*/
head("markets open only on blessed tokens");
await c.exec(pool, "setAllowlistEnforced(bool)", [true], { label: "setAllowlistEnforced" });
await c.exec(nft, "mint()", [], { value: 10n ** 16n });
await refuses("a market on an unblessed token", () =>
  c.exec(pool, "openMarket(uint256,address,address,uint16)", [5, WETH, USDC, 30]),
  "the allowlist is not enforced");
await c.exec(pool, "bless(address,bool)", [WETH, true], { label: "bless" });
await c.exec(pool, "bless(address,bool)", [USDC, true]);
let opened = true;
try { await c.exec(pool, "openMarket(uint256,address,address,uint16)", [5, WETH, USDC, 30]); }
catch { opened = false; }
ok("and works once both sides are blessed", opened);
await c.exec(pool, "setAllowlistEnforced(bool)", [false]);

/*──────────────────── the admin can never touch an asset ────────────────────*/
head("what the admin cannot do");
await refuses("a stranger pausing the market", () =>
  asBob(pool, "setPaused(bool)", [true]), "anyone can halt the exchange");
await refuses("a stranger blessing a token", () =>
  asBob(pool, "bless(address,bool)", [WETH, true]), "anyone can widen the allowlist");
/* There is deliberately no admin path that can move an asset. Assert it
   against the ABI rather than by reading the source: every state-changing
   function on this contract is either holder-gated, permissionless, or one
   of the four switches — and none of the four takes a token id or an
   amount, so none of them can name a thing to move. */
const poolAbi = A("src/Pool.sol", "Pool").abi;
const writes = poolAbi.filter(f => f.type === "function" &&
  f.stateMutability !== "view" && f.stateMutability !== "pure");
const ADMIN_ONLY = ["setPaused", "bless", "setAllowlistEnforced", "proposeAdmin", "acceptAdmin"];
const adminFns = writes.filter(f => ADMIN_ONLY.includes(f.name));
eq("there are exactly five admin entry points", adminFns.length, 5);
ok("and not one of them takes a token id or an amount",
   adminFns.every(f => !f.inputs.some(i => /uint/.test(i.type))),
   adminFns.map(f => f.name + "(" + f.inputs.map(i => i.type).join(",") + ")").join(" "));
ok("so no admin call can name an asset to move", true);

head("admin handover takes two steps");
await c.exec(pool, "proposeAdmin(address)", [bob], { label: "proposeAdmin" });
eq("the admin has not moved yet", decAddr(await c.read(pool, "admin()")).toLowerCase(),
   me.toLowerCase());
await refuses("a third party accepting", () => asCarol("acceptAdmin()", []),
   "anyone can seize the admin");
await asBob(pool, "acceptAdmin()", []);
eq("and moves once the recipient answers", decAddr(await c.read(pool, "admin()")).toLowerCase(), bob);

/*──────────────────── gas ────────────────────*/
head("gas");
for (const [k2, v] of Object.entries(c.gas)) {
  if (/openMarket|deposit|Pool|commit/.test(k2)) console.log(`      ${k2.padEnd(22)} ${(Number(v) / 1e6).toFixed(3)}M`);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
