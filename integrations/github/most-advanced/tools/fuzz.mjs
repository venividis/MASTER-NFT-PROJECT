#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · properties, under random attack

  The Foundry suite states nine properties as `testFuzz_` functions and has
  never executed one of them — Foundry's installer host is unreachable from
  the environment this was built in, and GitHub, codeload and the crates.io
  API are all refused too. A property nobody has run is a comment.

  So the properties are run here instead, against the same EVM everything
  else in tools/ uses, with the same contracts compiled by the same solc.
  This is not a re-implementation of the properties in JavaScript: every
  assertion below calls the real Solidity, and the arithmetic under test is
  the arithmetic that would be deployed. What JavaScript does is choose
  hostile inputs and keep score.

  ── what it does that forge does not ──

  The generator is a seeded PRNG and the seed is printed on every run, so a
  failure is reproducible by anyone with the seed rather than only by
  whoever happened to hit it. On failure it shrinks: the failing input is
  repeatedly simplified — halved, zeroed, truncated — for as long as it
  keeps failing, so what gets printed is a small case rather than the
  256-bit number that happened to trip it.

  ── what it does not do that forge does ──

  No invariant/stateful campaigns, no coverage-guided corpus, no cheatcodes.
  These are stateless property tests with a bias toward boundaries, which
  is what the nine targets in test/ actually are.

    node tools/fuzz.mjs                 256 runs per property
    node tools/fuzz.mjs --runs 2000     more
    node tools/fuzz.mjs --seed 12345    reproduce a reported failure
───────────────────────────────────────────────────────────────────────────*/
import { compile, artifact } from "./compile.mjs";
import { Chain, enc, decUint, decAddr, decBool, encodeAddressArg } from "./evm.mjs";
import { createAddressFromString, hexToBytes, bytesToHex } from "@ethereumjs/util";

/*──────────────── the dice ────────────────*/

const arg = (name, dflt) => {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const RUNS = Number(arg("runs", 256));
const SEED = BigInt(arg("seed", String(Math.floor(Math.random() * 2 ** 31))));

/* xoshiro-ish: small, deterministic, and good enough to find edges. The
   point is reproducibility, not cryptography. */
let s0 = SEED ^ 0x9e3779b97f4a7c15n, s1 = SEED * 0xbf58476d1ce4e5b9n + 1n;
const M = (1n << 64n) - 1n;
function next() {
  s1 = (s1 ^ (s1 << 13n)) & M;
  s1 = s1 ^ (s1 >> 7n);
  s1 = (s1 ^ (s1 << 17n)) & M;
  s0 = (s0 + 0x9e3779b97f4a7c15n) & M;
  return (s0 ^ s1) & M;
}

/// @notice A 256-bit draw, built from four 64-bit ones.
function rand256() {
  let v = 0n;
  for (let i = 0; i < 4; i++) v = (v << 64n) | next();
  return v;
}

/* Uniform sampling never finds the interesting inputs. A quarter of every
   draw is pulled from the edges of the range instead — the values a human
   would try first and a uniform generator would take millions of runs to
   reach. */
function pick(lo, hi) {
  lo = BigInt(lo); hi = BigInt(hi);
  if (hi <= lo) return lo;
  const span = hi - lo + 1n;
  const r = next() % 4n;
  if (r === 0n) {
    const edges = [lo, lo + 1n, hi, hi - 1n, (lo + hi) / 2n];
    return edges[Number(next() % BigInt(edges.length))];
  }
  return lo + (rand256() % span);
}

const bool = () => (next() & 1n) === 1n;

/*──────────────── the scoreboard ────────────────*/

let pass = 0, fail = 0;
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);

/*  Shrinking: keep the failure, make the input smaller. Each candidate is
    re-run, and it is only kept if it still fails — so what is reported is
    never a different bug from the one that was found. */
function shrinkCandidates(v) {
  if (typeof v === "bigint") {
    const out = [];
    if (v > 0n) out.push(0n, 1n, v / 2n, v - 1n);
    return out.filter((x) => x >= 0n && x !== v);
  }
  if (typeof v === "boolean") return [!v];
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      for (const c of shrinkCandidates(v[i])) {
        const copy = v.slice(); copy[i] = c; out.push(copy);
      }
    }
    if (v.length > 1) out.push(v.slice(0, Math.floor(v.length / 2)));
    return out;
  }
  return [];
}

async function property(name, gen, check, runs = RUNS) {
  let counterexample = null, why = "";
  for (let i = 0; i < runs && !counterexample; i++) {
    const input = gen();
    try {
      const r = await check(input);
      if (r === false) { counterexample = input; why = "the property did not hold"; }
      else if (typeof r === "string") { counterexample = input; why = r; }
    } catch (e) {
      counterexample = input;
      why = "threw: " + String(e.message || e).slice(0, 120);
    }
  }

  if (!counterexample) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}  \x1b[2m${runs} runs\x1b[0m`);
    return;
  }

  // shrink for as long as a smaller input still fails
  let best = counterexample, moved = true, budget = 300;
  while (moved && budget-- > 0) {
    moved = false;
    for (const cand of shrinkCandidates(best)) {
      if (budget-- <= 0) break;
      let failed = false;
      try {
        const r = await check(cand);
        failed = r === false || typeof r === "string";
      } catch { failed = true; }
      if (failed) { best = cand; moved = true; break; }
    }
  }

  fail++;
  console.log(`  \x1b[31m✗\x1b[0m ${name}`);
  console.log(`      ${why}`);
  console.log(`      shrunk to ${JSON.stringify(best, (_, x) => typeof x === "bigint" ? x.toString() : x)}`);
  console.log(`      reproduce with --seed ${SEED}`);
}

/*──────────────── the world ────────────────*/

const evm = await import("./evm.mjs");
const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();
const me = c.from.toString();
const WAD = 10n ** 18n;
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";
const FOREVER = 2n ** 40n;

console.log(`\n  \x1b[1mIPSEITY · properties\x1b[0m   seed ${SEED}   ${RUNS} runs each`);

const tmpReg = await c.deploy(A("test/mocks/ERC6551Registry.sol", "ERC6551Registry").bytecode);
await c.vm.stateManager.putCode(createAddressFromString(REGISTRY),
  await c.vm.stateManager.getCode(createAddressFromString(tmpReg)));

const probe = await c.deploy(A("test/mocks/Probe.sol", "Probe").bytecode);
const impl = await c.deploy(A("src/IpseityAccount.sol", "IpseityAccount").bytecode);
const gripImpl = await c.deploy(A("src/GripVault.sol", "GripVault").bytecode);
const engine = await c.deploy(A("src/Engine.sol", "Engine").bytecode, "0".repeat(64));
const sigil = await c.deploy(A("src/Sigil.sol", "Sigil").bytecode);
const renderer = await c.deploy(A("src/Renderer.sol", "Renderer").bytecode,
  encodeAddressArg(engine) + encodeAddressArg(sigil));
const nft = await c.deploy(A("src/Ipseity.sol", "Ipseity").bytecode,
  encodeAddressArg(renderer) + encodeAddressArg(impl) + encodeAddressArg(gripImpl) + (1).toString(16).padStart(64, "0") + (4096).toString(16).padStart(64, "0"));

const MAX_CONC = decUint(await c.read(probe, "MAX_CONCENTRATION()"));

/* a word the collection would accept: nothing above bit 128, solid in 0..7 */
const validWord = () => {
  let w = rand256() & ((1n << 128n) - 1n);
  w = (w & ~(0xffn << 112n)) | ((next() % 8n) << 112n);
  return w;
};

/*═══════════════════ the section word ═══════════════════*/
head("the section word");

await property("six angles, an offset, a solid and a hue survive the round trip",
  () => [pick(0, 65535), pick(0, 65535), pick(0, 65535), pick(0, 65535), pick(0, 65535),
         pick(0, 65535), pick(0, 65535), pick(0, 7), pick(0, 255)],
  async (v) => {
    const [a0, a1, a2, a3, a4, a5, w, f, h] = v.map(BigInt);
    const form = f % 8n;
    const packed = decUint(await c.read(probe,
      "pack(uint16,uint16,uint16,uint16,uint16,uint16,uint16,uint8,uint8)",
      [a0 & 0xffffn, a1 & 0xffffn, a2 & 0xffffn, a3 & 0xffffn, a4 & 0xffffn, a5 & 0xffffn,
       w & 0xffffn, form, h & 0xffn]));
    const back = await c.read(probe, "unpack(uint256)", [packed]);
    const angles = [0, 1, 2, 3, 4, 5].map((i) => decUint(back, i));
    const want = [a0, a1, a2, a3, a4, a5].map((x) => x & 0xffffn);
    for (let i = 0; i < 6; i++) if (angles[i] !== want[i]) return `angle ${i} came back ${angles[i]}, not ${want[i]}`;
    if (decUint(back, 6) !== (w & 0xffffn)) return "the w offset changed";
    if (decUint(back, 7) !== form) return "the solid changed";
    if (decUint(back, 8) !== (h & 0xffn)) return "the hue changed";
    if (!decBool(back, 9)) return "a word built by pack() is not valid()";
    if (packed >> 128n !== 0n) return "something was written above bit 128";
    return true;
  });

/*═══════════════════ SSTORE2 ═══════════════════*/
head("SSTORE2");

/* Bounded at 3 KB rather than the 24,575-byte ceiling: each run is a real
   CREATE plus a real EXTCODECOPY, and the property is about the prologue
   and the offset, which a short blob exercises exactly as well. */
await property("a blob written to code comes back byte for byte",
  () => Array.from({ length: Number(pick(1, 3000)) }, () => Number(next() & 0xffn)),
  async (bytes) => {
    if (bytes.length === 0) return true;
    const hex = Buffer.from(bytes).toString("hex");
    const r = await c.exec(probe, "roundTrip(bytes)", [hex]);
    const back = r.ret.replace(/^0x/, "");
    const len = Number(BigInt("0x" + back.substr(64, 64)));
    const body = back.substr(128, len * 2);
    if (len !== bytes.length) return `wrote ${bytes.length} bytes, read ${len} back`;
    if (body !== hex) return "the bytes changed on the way through";
    return true;
  }, Math.max(24, Math.floor(RUNS / 8)));

/*═══════════════════ minting ═══════════════════*/
head("minting");

await property("every token is born renderable, whatever the block",
  () => [pick(0, (1n << 64n) - 1n)],
  async ([salt]) => {
    evm.warp(evm.GENESIS_TIME + (salt % 100000n));
    const r = await c.exec(nft, "mint()", [], { value: 10n ** 16n });
    const id = decUint(await c.read(nft, "totalSupply()"));
    const word = decUint(await c.read(nft, "sectionOf(uint256)", [id]));
    if (word >> 128n !== 0n) return "a bit above the section word was set at mint";
    const form = (word >> 112n) & 0xffn;
    if (form > 7n) return `minted solid ${form}, which does not exist`;
    return true;
  }, Math.max(16, Math.floor(RUNS / 16)));
evm.warp(evm.GENESIS_TIME);

/*═══════════════════ the pricing, as pure arithmetic ═══════════════════*/
head("the curve");

const anchorOf = async (word, rB, rQ) => {
  const r = await c.read(probe, "anchor(uint256,uint256,uint256)", [word, rB, rQ]);
  return [decUint(r, 0), decUint(r, 1)];
};
const outOf = (a, ri, ro, vi, vo, fee) =>
  c.read(probe, "amountOut(uint256,uint256,uint256,uint256,uint256,uint256)",
    [a, ri, ro, vi, vo, fee]).then(decUint);


await property("concentration is bounded, at every word there is",
  () => [rand256()],
  async ([word]) => {
    const conc = decUint(await c.read(probe, "concentration(uint256)", [word]));
    if (conc > MAX_CONC) return `concentration ${conc} is above the ceiling ${MAX_CONC}`;
    return true;
  });

/*  This used to assert that with the three w-planes at zero the price was
    exactly zero, which encoded the old implementation rather than a
    property: concentration was a sum of the w-angles and nothing else, so
    the solid and the offset could not reach it. Both do now, and should —
    moving the cut off centre genuinely makes the section smaller.

    The invariant that was actually meant, and that survives, is the one
    about degrees of freedom: the three planes NOT containing w only spin
    the picture. They are applied before the others and never touch index
    3, so the cut plane, and therefore the market, is untouched by them.  */
await property("the three planes that do not contain w never move the price",
  () => [pick(0, 65535), pick(0, 65535), pick(0, 65535),
         pick(0, 65535), pick(0, 65535), pick(0, 65535),
         pick(0, 65535), pick(0, 65535), pick(0, 65535),
         pick(0, 7), pick(0, 255), pick(0, 65535)],
  async (v) => {
    const b = v.map(BigInt);
    const [xy1, xz1, yz1, xy2, xz2, yz2, xw, yw, zw, f, h, w] = b;
    const mk = (a, bb, cc) =>
      (a & 0xffffn) | ((bb & 0xffffn) << 16n) | ((cc & 0xffffn) << 32n) |
      ((xw & 0xffffn) << 48n) | ((yw & 0xffffn) << 64n) | ((zw & 0xffffn) << 80n) |
      ((w & 0xffffn) << 96n) | ((f % 8n) << 112n) | ((h & 0xffn) << 120n);
    const one = decUint(await c.read(probe, "concentration(uint256)", [mk(xy1, xz1, yz1)]));
    const two = decUint(await c.read(probe, "concentration(uint256)", [mk(xy2, xz2, yz2)]));
    if (one !== two)
      return `spinning the picture repriced the market: ${one} vs ${two}`;
    return true;
  });

await property("more in never means less out",
  () => [pick(10n ** 6n, 250n * WAD), pick(10n ** 6n, 333n * WAD), rand256(), pick(0, 500)],
  async (v) => {
    const rIn = 1000n * WAD, rOut = 3_000_000n * WAD;
    let [a, b] = [BigInt(v[0]), BigInt(v[1])];
    if (a > b) [a, b] = [b, a];
    const word = BigInt(v[2]), fee = BigInt(v[3]) % 501n;
    const [vIn, vOut] = await anchorOf(word, rIn, rOut);
    const [oa, ob] = [await outOf(a, rIn, rOut, vIn, vOut, fee),
                      await outOf(b, rIn, rOut, vIn, vOut, fee)];
    if (oa > ob) return `${a} got ${oa} out but the larger ${b} got only ${ob}`;
    return true;
  });

await property("the quote never exceeds the reserve it is priced against",
  () => [pick(1, 10n ** 30n), rand256(), pick(0, 500)],
  async (v) => {
    const rIn = 1000n * WAD, rOut = 3_000_000n * WAD;
    const [amt, word, fee] = [BigInt(v[0]), BigInt(v[1]), BigInt(v[2]) % 501n];
    const [vIn, vOut] = await anchorOf(word, rIn, rOut);
    const o = await outOf(amt, rIn, rOut, vIn, vOut, fee);
    if (o >= rOut + vOut) return `quoted ${o} against a priced reserve of ${rOut + vOut}`;
    return true;
  });

/*  Two different things get called "the invariant" here, and conflating
    them is how a curve with virtual reserves gets misread.

    `amountOut` prices against virtual reserves computed from the reserves
    as they stand *before* the trade, and it preserves k with respect to
    those. That is the arithmetic guarantee, and it is what the first
    property below checks.

    A pool that recomputes its virtual reserves from the new real reserves
    afterwards is measuring a different quantity, and that one is not
    conserved: the virtuals are a fixed multiple of the reserves, so a trade
    that moves the reserves moves both sides of the product too. It can fall
    on a single large trade at high concentration, and it does — under this
    generator, at roughly 30% of the reserve with the solid turned well into
    w. That is a property of scaling virtual reserves, not a leak on its own.

    What decides whether it is a leak is the second property: buy, then
    immediately sell back, with the reserves and the virtuals recomputed in
    between exactly as the live pool does it. If that can ever come out
    ahead, the curve is a faucet. It is run across the whole concentration
    range, which is the region the 200-trade walk in verify-pool.mjs never
    reaches, because that walk caps every trade at 2.5% of the reserve.  */

await property("k never falls, measured against the offsets the market anchored",
  () => [pick(1, 300n * WAD), rand256(), pick(0, 500)],
  async (v) => {
    const rIn = 1000n * WAD, rOut = 3_000_000n * WAD;
    const [amt, word, fee] = [BigInt(v[0]), BigInt(v[1]), BigInt(v[2]) % 501n];
    const [vIn, vOut] = await anchorOf(word, rIn, rOut);
    const o = await outOf(amt, rIn, rOut, vIn, vOut, fee);
    if (o > rOut) return "the quote exceeded the whole real reserve";
    const before = (rIn + vIn) * (rOut + vOut);
    // the whole input lands in the reserve; only the pricing saw it net of fee
    const after = (rIn + vIn + amt) * (rOut + vOut - o);
    if (after < before) return `k fell from ${before} to ${after}`;
    return true;
  });

/*  The property that caught it. Buy, then sell straight back along the same
    anchored curve — which is what a market that does not re-anchor on a
    trade actually offers. Run across the whole concentration range and up to
    40% of the reserve, because the failure only appeared above roughly a
    quarter, and the 200-trade walk in verify-pool.mjs caps at 2.5%.        */
await property("a round trip never profits, at any concentration, at any size",
  () => [pick(1, 400n * WAD), rand256(), pick(0, 500)],
  async (v) => {
    const rIn = 1000n * WAD, rOut = 3_000_000n * WAD;
    const [amt, word, fee] = [BigInt(v[0]), BigInt(v[1]), BigInt(v[2]) % 501n];
    const [vIn, vOut] = await anchorOf(word, rIn, rOut);

    const got = await outOf(amt, rIn, rOut, vIn, vOut, fee);
    if (got === 0n || got >= rOut) return true;
    // sell back along the SAME curve — the offsets do not move on a trade
    const back = await outOf(got, rOut - got, rIn + amt, vOut, vIn, fee);
    if (back > amt) return `put in ${amt}, got ${back} back — a profit of ${back - amt}`;
    return true;
  });

/*═══════════════════ the market, as a live pool ═══════════════════*/
head("the market");

const encStr = (s) => {
  const b = Buffer.from(s, "utf8");
  return b.length.toString(16).padStart(64, "0") + b.toString("hex").padEnd(64, "0");
};
const mkToken = async (name, sym) => {
  const nameEnc = encStr(name);
  return c.deploy(A("test/mocks/MockERC20.sol", "MockERC20").bytecode,
    (0xa0).toString(16).padStart(64, "0") +
    BigInt(0xa0 + nameEnc.length / 2).toString(16).padStart(64, "0") +
    (18).toString(16).padStart(64, "0") + "0".repeat(64) + "0".repeat(64) +
    nameEnc + encStr(sym));
};

const pool = await c.deploy(A("src/Pool.sol", "Pool").bytecode,
  encodeAddressArg(nft) + (10n ** 12n * WAD).toString(16).padStart(64, "0") +
  encodeAddressArg(me) + "0".repeat(63) + "1");
const BASE = await mkToken("Base", "BASE");
const QUOTE = await mkToken("Quote", "QUOTE");
const MID = decUint(await c.read(nft, "totalSupply()"));   // a token we already own

await c.exec(pool, "bless(address,bool)", [BASE, true]);
await c.exec(pool, "bless(address,bool)", [QUOTE, true]);
await c.exec(BASE,  "mint(address,uint256)", [me, 10n ** 9n * WAD]);
await c.exec(QUOTE, "mint(address,uint256)", [me, 10n ** 9n * WAD]);
await c.exec(BASE,  "approve(address,uint256)", [pool, (1n << 255n)]);
await c.exec(QUOTE, "approve(address,uint256)", [pool, (1n << 255n)]);
await c.exec(pool, "openMarket(uint256,address,address,uint16)", [MID, BASE, QUOTE, 30]);
await c.exec(pool, "deposit(uint256,uint256,uint256)", [MID, 1_000_000n * WAD, 3_000_000n * WAD]);

const reserves = async () => {
  const m = await c.read(pool, "market(uint256)", [MID]);
  return [decUint(m, 2), decUint(m, 3)];
};
/*  Measured against the offsets the market is actually anchored to, read
    out of its own storage — not recomputed from the live reserves, which is
    the mistake that hid the bug this suite found. marketOf's generated
    getter returns them in declaration order — base, quote, rBase, rQuote,
    feeBps, open, bondUntil, curveWord, vBase, vQuote — so the offsets are
    words 8 and 9.                                                         */
const anchored = async () => {
  const m = await c.read(pool, "marketOf(uint256)", [MID]);
  return [decUint(m, 8), decUint(m, 9)];
};
const k = async () => {
  const [rb, rq] = await reserves();
  const [vb, vq] = await anchored();
  return decUint(await c.read(probe, "invariant(uint256,uint256,uint256,uint256)",
    [rb, rq, vb, vq]));
};

await property("a live swap never lowers the invariant, at any curve a holder can commit",
  () => [rand256(), bool(), pick(1, 300_000n * WAD)],
  async (v) => {
    const word = validWord.call ? (BigInt(v[0]) & ((1n << 128n) - 1n)) : 0n;
    const shaped = (word & ~(0xffn << 112n)) | ((next() % 8n) << 112n);
    await c.exec(nft, "commit(uint256,uint256)", [MID, shaped]);
    await c.exec(pool, "syncCurve(uint256)", [MID]);

    const [rb, rq] = await reserves();
    const baseIn = v[1];
    const cap = (baseIn ? rb : rq) / 3n;
    if (cap === 0n) return true;
    const amount = (BigInt(v[2]) % cap) + 1n;

    const before = await k();
    try {
      await c.exec(pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
        [MID, baseIn, amount, 0, me, FOREVER]);
    } catch {
      const after = await k();
      if (after !== before) return "a refused trade still moved the reserves";
      return true;
    }
    const after = await k();
    if (after < before) return `the invariant fell from ${before} to ${after}`;
    return true;
  }, Math.max(24, Math.floor(RUNS / 8)));

await property("buying and selling straight back never comes out ahead",
  () => [rand256(), pick(10n ** 12n, 200_000n * WAD)],
  async (v) => {
    const word = (BigInt(v[0]) & ((1n << 128n) - 1n) & ~(0xffn << 112n)) | ((next() % 8n) << 112n);
    await c.exec(nft, "commit(uint256,uint256)", [MID, word]);
    await c.exec(pool, "syncCurve(uint256)", [MID]);

    const [rb] = await reserves();
    const amount = (BigInt(v[1]) % (rb / 4n)) + 10n ** 12n;

    const start = decUint(await c.read(BASE, "balanceOf(address)", [me]));
    let got = 0n;
    try {
      const r = await c.exec(pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
        [MID, true, amount, 0, me, FOREVER]);
      got = decUint(r.ret);
    } catch { return true; }
    if (got === 0n) return true;
    try {
      await c.exec(pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
        [MID, false, got, 0, me, FOREVER]);
    } catch { return true; }

    const end = decUint(await c.read(BASE, "balanceOf(address)", [me]));
    if (end > start) return `a round trip made ${end - start} out of nothing`;
    return true;
  }, Math.max(24, Math.floor(RUNS / 8)));

await property("the pool never pays out more than it holds",
  () => [pick(1, 10n ** 26n), bool()],
  async (v) => {
    const [rb, rq] = await reserves();
    const baseIn = v[1];
    const held = baseIn ? rq : rb;
    try {
      const r = await c.exec(pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
        [MID, baseIn, BigInt(v[0]), 0, me, FOREVER]);
      const o = decUint(r.ret);
      if (o >= held) return `paid out ${o} while holding ${held}`;
    } catch { /* refusing an oversized trade is the correct outcome */ }
    return true;
  }, Math.max(24, Math.floor(RUNS / 8)));

/*═══════════════════ custody ═══════════════════*/
head("custody");

await property("locked() and isTransferable() never disagree",
  () => [bool()],
  async ([bind]) => {
    await c.exec(nft, "mint()", [], { value: 10n ** 16n });
    const id = decUint(await c.read(nft, "totalSupply()"));
    if (bind) await c.exec(nft, "lock(uint256)", [id]);
    const locked = decBool(await c.read(nft, "locked(uint256)", [id]));
    const movable = decBool(await c.read(nft, "isTransferable(uint256,address,address)",
      [id, me, "0x" + "b0".padStart(40, "0")]));
    if (locked !== bind) return `locked() said ${locked} after bind=${bind}`;
    if (movable === locked) return "one flag, two answers — the collection tells two stories";
    return true;
  }, Math.max(16, Math.floor(RUNS / 16)));

/*═══════════════════ the seal ═══════════════════*/
head("the seal");

await property("a sealed vault's manifest never shrinks, whatever is called",
  () => [pick(1, 1000), pick(0, 3)],
  async (v) => {
    await c.exec(nft, "mint()", [], { value: 10n ** 16n });
    const id = decUint(await c.read(nft, "totalSupply()"));
    const vault = decAddr(await c.read(nft, "account(uint256)", [id]));
    await c.exec(nft, "embody(uint256)", [id]);
    await c.exec(BASE, "mint(address,uint256)", [vault, 1000n * WAD]);
    await c.exec(vault, "guard(address)", [BASE]);
    await c.exec(vault, "seal(uint64)", [evm.GENESIS_TIME + 30n * 86400n]);

    const before = decUint(await c.read(BASE, "balanceOf(address)", [vault]));
    const amount = BigInt(v[0]) * WAD;
    const shapes = [
      enc("transfer(address,uint256)", [me, amount]),
      enc("transferFrom(address,address,uint256)", [vault, me, amount]),
      enc("approve(address,uint256)", [me, amount]),
      enc("take(address,uint256)", [BASE, amount])       // a word on no list
    ];
    try {
      await c.exec(vault, "execute(address,uint256,bytes,uint8)",
        [BASE, 0, shapes[Number(BigInt(v[1]) % 4n)], 0]);
    } catch { /* refusal is the correct outcome */ }
    const after = decUint(await c.read(BASE, "balanceOf(address)", [vault]));
    if (after < before) return `the seal held ${before} and now holds ${after}`;
    return true;
  }, Math.max(16, Math.floor(RUNS / 16)));

/*──────────────── the tally ────────────────*/
console.log(`\n  ${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} properties held, ${fail} broken\x1b[0m`);
console.log(`  \x1b[2mseed ${SEED} — pass --seed ${SEED} to run exactly this again\x1b[0m\n`);
process.exit(fail === 0 ? 0 : 1);
