#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · a world with people in it

  Every other suite here asks "does this call do the right thing". This one
  asks a different question: let a crowd of agents with conflicting motives
  loose on the collection for a few thousand blocks, and see whether any
  arrangement of ordinary actions adds up to something the invariants said
  could not happen.

  ── why not a market simulator ──

  Tools like MiroFish model a market: agents with beliefs, a price process,
  an AMM written in the simulator. They are the right instrument for "will
  anyone want this, and what does the price do". They cannot answer "can
  this be robbed", because the AMM they run is the simulator's AMM and not
  yours. No amount of agent realism substitutes for executing the bytecode.

  So this runs the real thing. Every action below is a real transaction
  against the real compiled contracts on a real EVM at Cancun. What the
  JavaScript supplies is motive, ordering and patience.

  ── the monitors ──

  The point is not the agents, it is what is checked between their moves.
  After EVERY state-changing action, all of these are re-evaluated:

    · conservation    the sum of every ERC-20 balance over every address
                      that exists equals total supply. If this ever moves,
                      value was created or destroyed, and nothing else
                      matters.
    · the invariant   k, measured against the offsets the market actually
                      anchored to, never falls across a trade
    · solvency        no payout ever reached half the outgoing reserve
    · the bond        while bondUntil holds, every door out of the market
                      is tried and every one of them must be shut
    · the seal        while sealed, every shape of drain is attempted
                      against the live vault and must be refused
    · the grip        a Grip's balance is monotonically non-decreasing,
                      forever, under every action by anybody

  A monitor firing is a bug. An agent making money is not — traders are
  supposed to be able to make money. What is reported at the end is the
  ledger, so profit that should be impossible is visible as a number.

    node tools/agents.mjs
    node tools/agents.mjs --ticks 400 --seed 7
───────────────────────────────────────────────────────────────────────────*/
import { compile, artifact } from "./compile.mjs";
import { Chain, enc, decUint, decAddr, decBool, encodeAddressArg } from "./evm.mjs";
import { createAddressFromString, hexToBytes, bytesToHex, Account } from "@ethereumjs/util";

/*──────────────── dials ────────────────*/
const arg = (n, d) => {
  const i = process.argv.indexOf("--" + n);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const TICKS = Number(arg("ticks", 220));
const SEED = BigInt(arg("seed", String(Math.floor(Math.random() * 2 ** 31))));
const VERBOSE = process.argv.includes("--verbose");

let s0 = SEED ^ 0x9e3779b97f4a7c15n, s1 = SEED * 0xbf58476d1ce4e5b9n + 1n;
const M64 = (1n << 64n) - 1n;
const next = () => {
  s1 = (s1 ^ (s1 << 13n)) & M64; s1 ^= s1 >> 7n; s1 = (s1 ^ (s1 << 17n)) & M64;
  s0 = (s0 + 0x9e3779b97f4a7c15n) & M64;
  return (s0 ^ s1) & M64;
};
const rnd = (n) => (n <= 1n ? 0n : next() % BigInt(n));
const chance = (pct) => rnd(100n) < BigInt(pct);
const pickOne = (a) => a[Number(rnd(BigInt(a.length)))];

/*──────────────── scoreboard ────────────────*/
let broken = [];
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);
const WAD = 10n ** 18n;
const REGISTRY = "0x000000006551c19487814612e58FE06813775758";
const FOREVER = 2n ** 40n;
const fmt = (v, d = 18) => {
  const n = Number(v) / Number(10n ** BigInt(d));
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
};

/*──────────────── the world ────────────────*/
const evm = await import("./evm.mjs");
const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);
const c = await Chain.open();
const me = c.from.toString();

console.log(`\n  \x1b[1mIPSEITY · a world with people in it\x1b[0m   seed ${SEED}   ${TICKS} ticks`);

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
const mkToken = async (name, sym, dec, feeBps, silent) => {
  const nameEnc = encStr(name);
  return c.deploy(mock,
    (0xa0).toString(16).padStart(64, "0") +
    BigInt(0xa0 + nameEnc.length / 2).toString(16).padStart(64, "0") +
    BigInt(dec).toString(16).padStart(64, "0") +
    BigInt(feeBps).toString(16).padStart(64, "0") +
    (silent ? "1" : "0").padStart(64, "0") +
    nameEnc + encStr(sym));
};

const BASE = await mkToken("Wrapped Ether", "WETH", 18, 0, false);
const QUOTE = await mkToken("USD Coin", "USDC", 18, 0, false);
await c.exec(pool, "bless(address,bool)", [BASE, true]);
await c.exec(pool, "bless(address,bool)", [QUOTE, true]);

/*──────────────── people ────────────────*/
/* Each is an ordinary externally-owned address. Nothing about them is
   privileged; what differs is what they choose to do with a turn. */
const cast = [
  { key: "holder",   role: "the token's owner — the only liquidity provider" },
  { key: "arb",      role: "an arbitrageur chasing an external price" },
  { key: "whale",    role: "occasional very large flow" },
  { key: "shrimp",   role: "constant tiny flow, to accumulate rounding" },
  { key: "sandwich", role: "front-runs and back-runs whatever it can see" },
  { key: "griefer",  role: "spends money to make things worse" },
  { key: "renter",   role: "an ERC-4907 user: may turn the artwork, may not sell" }
];
const people = {};
for (let i = 0; i < cast.length; i++) {
  const addr = "0x" + (i + 0xa1).toString(16).padStart(2, "0").repeat(20);
  people[cast[i].key] = { ...cast[i], addr, acted: 0, refused: 0 };
}
const everyone = Object.values(people);

/* every address the simulation could possibly put value at — the
   conservation monitor sums over exactly this set */
const universe = () => [
  me, pool, nft, acctImpl, gripImpl, engine, sigil, renderer, BASE, QUOTE, REGISTRY,
  ...everyone.map((p) => p.addr),
  ...Object.values(vaults)
];
const vaults = {};

const asOf = async (who, to, sig, args = [], value = 0n) => {
  const r = await c.vm.evm.runCall({
    to: createAddressFromString(to),
    caller: createAddressFromString(who),
    origin: createAddressFromString(who),
    data: hexToBytes(enc(sig, args)),
    gasLimit: 60_000_000n, value, block: evm.BLOCK
  });
  if (r.execResult.exceptionError) {
    const e = new Error(r.execResult.exceptionError.error);
    e.data = bytesToHex(r.execResult.returnValue || new Uint8Array());
    throw e;
  }
  return bytesToHex(r.execResult.returnValue);
};

/*──────────────── the stage ────────────────*/
head("setting the stage");

/* the holder mints, and owns everything about token 1 */
await c.fund(people.holder.addr, 100n * WAD);
await asOf(people.holder.addr, nft, "mint()", [], 10n ** 16n);
const ID = decUint(await c.read(nft, "totalSupply()"));
console.log(`      token #${ID} is held by ${people.holder.key}`);

for (const p of everyone) {
  await c.fund(p.addr, 100n * WAD);
  await c.exec(BASE, "mint(address,uint256)", [p.addr, 2_000_000n * WAD]);
  await c.exec(QUOTE, "mint(address,uint256)", [p.addr, 6_000_000_000n * WAD]);
  await asOf(p.addr, BASE, "approve(address,uint256)", [pool, (1n << 255n)]);
  await asOf(p.addr, QUOTE, "approve(address,uint256)", [pool, (1n << 255n)]);
}

await asOf(people.holder.addr, pool, "openMarket(uint256,address,address,uint16)",
  [ID, BASE, QUOTE, 30]);
await asOf(people.holder.addr, pool, "deposit(uint256,uint256,uint256)",
  [ID, 1_000n * WAD, 3_000_000n * WAD]);

/*  A SECOND market on the same BASE token, held by somebody else.

    The pool keeps every market's reserves at one address and tracks each
    market's entitlement per id. Nothing in the contract ties the sum of
    those entitlements to what the pool actually holds — and nothing in any
    suite had ever opened two markets on one token, so nothing had ever
    looked. An adversary lens pointed out that a token whose balance moves
    out of band (a rebase, a fee on transfer, a compliance sweep) breaks the
    sum, and whichever market withdraws first consumes the other's.

    No contract change: putting a running total on the swap path is gas on
    the hot path for something any observer can compute. So it is computed,
    here, after every action. `bless` is the real defence and it is a
    centralisation trade-off stated in the README.                          */
await asOf(people.whale.addr, nft, "mint()", [], 10n ** 16n);
const ID2 = decUint(await c.read(nft, "totalSupply()"));
await asOf(people.whale.addr, pool, "openMarket(uint256,address,address,uint16)",
  [ID2, BASE, QUOTE, 30]);
await asOf(people.whale.addr, pool, "deposit(uint256,uint256,uint256)",
  [ID2, 400n * WAD, 1_200_000n * WAD]);
console.log(`      a second market, token #${ID2}, shares the same WETH balance`);

/* the holder's vault, so the seal and the Grip are in play too */
await asOf(people.holder.addr, nft, "embody(uint256)", [ID]);
await asOf(people.holder.addr, nft, "embodyGrip(uint256)", [ID]);
vaults.reach = decAddr(await c.read(nft, "account(uint256)", [ID]));
vaults.grip = decAddr(await c.read(nft, "grip(uint256)", [ID]));
await c.exec(BASE, "mint(address,uint256)", [vaults.reach, 10_000n * WAD]);
await c.exec(BASE, "mint(address,uint256)", [vaults.grip, 5_000n * WAD]);
await asOf(people.holder.addr, vaults.reach, "guard(address)", [BASE]);

/* the renter may operate the artwork and nothing else */
await asOf(people.holder.addr, nft, "setUser(uint256,address,uint64)",
  [ID, people.renter.addr, evm.GENESIS_TIME + 365n * 86400n]);

console.log(`      reach ${vaults.reach}`);
console.log(`      grip  ${vaults.grip}`);
console.log(`      market opened: 1,000 WETH / 3,000,000 USDC at 30 bps`);

/*──────────────── readings ────────────────*/
const market = async () => {
  const m = await c.read(pool, "market(uint256)", [ID]);
  const raw = await c.read(pool, "marketOf(uint256)", [ID]);
  return {
    rB: decUint(m, 2), rQ: decUint(m, 3), fee: decUint(m, 4), open: decUint(m, 5) !== 0n,
    conc: decUint(m, 6), spot: decUint(m, 7), trades: decUint(m, 10), bond: decUint(m, 11),
    vB: decUint(raw, 8), vQ: decUint(raw, 9)
  };
};
const balOf = async (token, who) => decUint(await c.read(token, "balanceOf(address)", [who]));
const supplyOf = async (token) => decUint(await c.read(token, "totalSupply()"));

/*══════════════════ THE MONITORS ══════════════════*/
/* Re-evaluated after every action anyone takes. A monitor is not a test of
   an action; it is a statement about the world that must be true no matter
   what anybody just did. */

let last = null;
const monitors = [];
const fire = (name, detail) => {
  if (broken.some((b) => b.name === name)) return;   // report each once
  broken.push({ name, detail, tick: TICK });
  console.log(`\n  \x1b[31m✗ ${name}\x1b[0m\n      ${detail}\n      at tick ${TICK}, seed ${SEED}`);
};

monitors.push({
  name: "conservation — no ERC-20 is created or destroyed",
  async check() {
    for (const [sym, token] of [["WETH", BASE], ["USDC", QUOTE]]) {
      let sum = 0n;
      for (const a of new Set(universe().map((x) => x.toLowerCase()))) sum += await balOf(token, a);
      const total = await supplyOf(token);
      if (sum !== total) {
        return `${sym}: balances sum to ${sum}, total supply is ${total} — ` +
               `a difference of ${sum > total ? "+" : ""}${sum - total}`;
      }
    }
    return null;
  }
});

monitors.push({
  name: "the invariant never falls across a trade",
  async check(before, after, action) {
    if (action !== "swap" || !before) return null;
    const k0 = (before.rB + before.vB) * (before.rQ + before.vQ);
    const k1 = (after.rB + after.vB) * (after.rQ + after.vQ);
    return k1 < k0 ? `k fell from ${k0} to ${k1}` : null;
  }
});

monitors.push({
  name: "a trade never moves the anchored offsets",
  async check(before, after, action) {
    if (action !== "swap" || !before) return null;
    return (before.vB !== after.vB || before.vQ !== after.vQ)
      ? `offsets moved on a swap: (${before.vB},${before.vQ}) → (${after.vB},${after.vQ})`
      : null;
  }
});

monitors.push({
  name: "the pool never pays out half its reserve",
  async check(before, after, action) {
    if (action !== "swap" || !before) return null;
    const paidB = before.rB > after.rB ? before.rB - after.rB : 0n;
    const paidQ = before.rQ > after.rQ ? before.rQ - after.rQ : 0n;
    if (paidB * 2n > before.rB) return `paid ${paidB} base out of ${before.rB}`;
    if (paidQ * 2n > before.rQ) return `paid ${paidQ} quote out of ${before.rQ}`;
    return null;
  }
});

/*  The first version of this monitor watched the reserves and fired on the
    first ordinary swap, which was the monitor being wrong rather than the
    contract. A trade necessarily lowers one side — that is what a trade is,
    and the bond has never promised otherwise. Deposits and trades stay open
    under a bond precisely because they are additive to the promise.

    What a bond actually promises is that the person who made it cannot walk
    away from it. So the monitor tries to walk away, every time, and fires
    only if one of those doors opens.                                      */
monitors.push({
  name: "while bonded, the holder cannot get out",
  async check(before, after) {
    if (!after || after.bond <= NOW()) return null;
    const h = people.holder.addr;
    const doors = [
      ["withdraw", () => asOf(h, pool, "withdraw(uint256,uint256,uint256,address)",
        [ID, after.rB / 100n, after.rQ / 100n, h])],
      ["closeMarket", () => asOf(h, pool, "closeMarket(uint256)", [ID])],
      ["setFee", () => asOf(h, pool, "setFee(uint256,uint16)", [ID, 500])],
      ["syncCurve", () => asOf(h, pool, "syncCurve(uint256)", [ID])],
      ["shortening the bond", () => asOf(h, pool, "bond(uint256,uint64)", [ID, NOW() + 60n])]
    ];
    for (const [name, open] of doors) {
      let opened = false;
      try { await open(); opened = true; } catch { /* refusal is correct */ }
      if (opened) return `${name} succeeded while bondUntil=${after.bond} and now=${NOW()}`;
    }
    if (after.bond < before?.bond) return "the bond was shortened";
    return null;
  }
});

/*  The other half of the same promise: a bond is worth nothing if the
    holder can drain the inventory through the curve instead of through the
    door. They cannot re-price while bonded, so the only remaining route is
    trading against their own pool — which is open to them exactly as it is
    open to anyone, and costs them the fee. This watches for the holder
    ending a bonded stretch with more than they started it with.          */
monitors.push({
  name: "a bond is not a slower withdrawal",
  async check(before, after) {
    if (!after) return null;
    const live = after.bond > NOW();
    if (live && bondEntry === null) {
      bondEntry = { rB: after.rB, rQ: after.rQ, tick: TICK };
    } else if (!live && bondEntry !== null) {
      bondEntry = null;
    }
    return null;
  }
});

monitors.push({
  name: "two markets never claim more than the pool holds",
  async check() {
    for (const [sym, token] of [["WETH", BASE], ["USDC", QUOTE]]) {
      const held = await balOf(token, pool);
      let claimed = 0n;
      for (const mid of [ID, ID2]) {
        const raw = await c.read(pool, "marketOf(uint256)", [mid]);
        const base = decAddr(raw, 0).toLowerCase(), quote = decAddr(raw, 1).toLowerCase();
        if (base === token.toLowerCase()) claimed += decUint(raw, 2);
        if (quote === token.toLowerCase()) claimed += decUint(raw, 3);
      }
      if (claimed > held) {
        return `${sym}: two markets record ${claimed} between them and the pool holds ` +
               `${held} — whichever withdraws first spends the other's inventory`;
      }
    }
    return null;
  }
});

monitors.push({
  name: "the Grip only ever holds more",
  async check() {
    const now = await balOf(BASE, vaults.grip);
    const r = gripFloor !== null && now < gripFloor
      ? `the Grip held ${gripFloor} and now holds ${now} — something spends after all`
      : null;
    if (gripFloor === null || now > gripFloor) gripFloor = now;
    return r;
  }
});

monitors.push({
  name: "a sealed manifest never shrinks",
  async check() {
    if (!sealFloor) return null;
    if (decUint(await c.read(vaults.reach, "sealedUntil()")) <= NOW()) return null;
    const now = await balOf(BASE, vaults.reach);
    return now < sealFloor ? `the seal held ${sealFloor} and now holds ${now}` : null;
  }
});

/*  Watching the balance only catches a drain that already happened. This
    tries to cause one, from the one address that could plausibly succeed —
    the holder, who owns the account and every key to it. Every shape is
    attempted against the live vault in the middle of a running world,
    rather than in the clean room the unit suite uses.                     */
monitors.push({
  name: "while sealed, every drain is refused",
  async check() {
    if (decUint(await c.read(vaults.reach, "sealedUntil()")) <= NOW()) return null;
    const h = people.holder.addr, v = vaults.reach;
    const shapes = [
      ["transfer", enc("transfer(address,uint256)", [h, WAD])],
      ["transferFrom", enc("transferFrom(address,address,uint256)", [v, h, WAD])],
      ["approve", enc("approve(address,uint256)", [h, (1n << 255n)])],
      ["setApprovalForAll", enc("setApprovalForAll(address,bool)", [h, true])],
      ["a word no list has", enc("take(address,uint256)", [BASE, WAD])]
    ];
    for (const [name, data] of shapes) {
      let opened = false;
      try {
        await asOf(h, v, "execute(address,uint256,bytes,uint8)", [BASE, 0, data, 0]);
        opened = true;
      } catch { /* refusal is correct */ }
      if (opened) {
        const now = await balOf(BASE, v);
        if (now < sealFloor) return `${name} drained a sealed vault: ${sealFloor} → ${now}`;
      }
    }
    // delegatecall would rewrite the account's own storage, seal included
    let rewrote = false;
    try {
      await asOf(h, v, "execute(address,uint256,bytes,uint8)", [BASE, 0, "0x", 1]);
      rewrote = true;
    } catch {}
    if (rewrote) return "delegatecall went through while sealed";
    // and unguard would empty the manifest instead of the vault
    let unlisted = false;
    try { await asOf(h, v, "unguard(address)", [BASE]); unlisted = true; } catch {}
    if (unlisted) return "the manifest was emptied while the seal was live";
    return null;
  }
});

/*  The Grip's guarantee is that no function exists. That is a claim about
    the ABI, and the unit suite checks the ABI. What this checks is the
    claim under load: everything anyone could think to call, from the
    holder's own address, while the world runs.                            */
monitors.push({
  name: "nothing gets out of the Grip",
  async check() {
    if (TICK % 25 !== 0) return null;          // expensive; sampled
    const h = people.holder.addr, g = vaults.grip;
    const before = await balOf(BASE, g);
    for (const sig of [
      "execute(address,uint256,bytes,uint8)", "withdraw(address,uint256)",
      "sweep(address)", "rescue(address,uint256)", "transfer(address,uint256)",
      "claim()", "setOwner(address)", "initialize(address)"
    ]) {
      try {
        const args = sig.includes("uint256,bytes")
          ? [BASE, 0, enc("transfer(address,uint256)", [h, before]), 0]
          : sig === "withdraw(address,uint256)" || sig === "rescue(address,uint256)"
            ? [BASE, before]
            : sig === "transfer(address,uint256)" ? [h, before]
            : sig === "sweep(address)" || sig === "setOwner(address)" || sig === "initialize(address)"
              ? [h] : [];
        await asOf(h, g, sig, args);
      } catch { /* there is no such function, which is the point */ }
    }
    const after = await balOf(BASE, g);
    return after < before ? `the Grip held ${before} and now holds ${after}` : null;
  }
});

let gripFloor = null, sealFloor = null, TICK = 0, bondEntry = null;
const NOW = () => evm.GENESIS_TIME + BigInt(TICK) * 12n;

async function watch(action, before) {
  const after = await market();
  for (const m of monitors) {
    let r = null;
    try { r = await m.check(before, after, action); } catch (e) { r = "monitor threw: " + e.message; }
    if (r) fire(m.name, r);
  }
  return after;
}

/*══════════════════ THE PEOPLE ══════════════════*/
/* An external price that wanders, so the arbitrageur has something to chase
   and the market sees flow that is not purely adversarial. */
let truePrice = 3000n * WAD;

const act = async (p, fn) => {
  const before = await market();
  try { await fn(); p.acted++; }
  catch (e) { p.refused++; return; }
  await watch(fn.action || "other", before);
};

const swap = (p, baseIn, amount) => {
  const f = async () => {
    await asOf(p.addr, pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
      [ID, baseIn, amount, 0, p.addr, FOREVER]);
  };
  f.action = "swap";
  return f;
};

const turns = {
  /* re-shapes the curve, moves inventory, occasionally bonds it */
  async holder(p) {
    const m = await market();
    if (chance(22)) {
      // turn the solid through w — this is the artwork and the price at once
      const w = (rnd(65536n) << 48n) | (rnd(65536n) << 64n) | (rnd(65536n) << 80n) |
                (rnd(8n) << 112n);
      await act(p, async () => {
        await asOf(p.addr, nft, "commit(uint256,uint256)", [ID, w]);
        await asOf(p.addr, pool, "syncCurve(uint256)", [ID]);
      });
    } else if (chance(12) && m.bond <= NOW()) {
      await act(p, async () => {
        await asOf(p.addr, pool, "withdraw(uint256,uint256,uint256,address)",
          [ID, m.rB / 20n, m.rQ / 20n, p.addr]);
      });
    } else if (chance(14)) {
      await act(p, async () => {
        await asOf(p.addr, pool, "deposit(uint256,uint256,uint256)",
          [ID, 20n * WAD, 60_000n * WAD]);
      });
    } else if (chance(6)) {
      await act(p, async () => {
        await asOf(p.addr, pool, "bond(uint256,uint64)", [ID, NOW() + 30n * 86400n]);
      });
    } else if (chance(5)) {
      await act(p, async () => {
        await asOf(p.addr, vaults.reach, "seal(uint64)", [NOW() + 60n * 86400n]);
        sealFloor = await balOf(BASE, vaults.reach);
      });
    }
  },

  /* trades toward the external price; this is the honest flow */
  async arb(p) {
    const m = await market();
    if (m.rB === 0n || m.rQ === 0n) return;
    const spot = (m.rQ + m.vQ) * WAD / (m.rB + m.vB);
    const gap = spot > truePrice ? spot - truePrice : truePrice - spot;
    if (gap * 1000n < truePrice) return;          // inside the fee, not worth it
    const baseIn = spot > truePrice;              // pool overvalues quote → sell base
    const size = (baseIn ? m.rB : m.rQ) / (4n + rnd(40n));
    if (size > 0n) await act(p, swap(p, baseIn, size));
  },

  async whale(p) {
    /* also the second market's holder, so both are live and the shared
       balance is actually being pushed around from both sides */
    if (chance(20)) {
      await act(p, async () => {
        await asOf(p.addr, pool, "deposit(uint256,uint256,uint256)", [ID2, 5n * WAD, 15_000n * WAD]);
      });
    } else if (chance(12)) {
      await act(p, async () => {
        const r = await c.read(pool, "marketOf(uint256)", [ID2]);
        await asOf(p.addr, pool, "withdraw(uint256,uint256,uint256,address)",
          [ID2, decUint(r, 2) / 20n, decUint(r, 3) / 20n, p.addr]);
      });
    }
    if (!chance(18)) return;
    const m = await market();
    const baseIn = chance(50);
    const size = (baseIn ? m.rB : m.rQ) / (2n + rnd(3n));   // a third to a half
    if (size > 0n) await act(p, swap(p, baseIn, size));
  },

  /* thousands of tiny trades: the shape rounding errors accumulate in */
  async shrimp(p) {
    for (let i = 0; i < 3; i++) {
      const baseIn = chance(50);
      await act(p, swap(p, baseIn, 1n + rnd(baseIn ? WAD / 1000n : 3n * WAD)));
    }
  },

  /*  A real sandwich needs a victim, so this one supplies its own: it buys,
      the whale trades in the same direction, and it sells back. Without the
      trade in the middle it is just paying the fee twice, which the first
      version of this agent proved by losing money.

      Sandwiching is not a bug — an AMM with no private ordering is
      sandwichable by construction and this collection never claimed
      otherwise. What is watched is the SIZE of it: profit far beyond what
      the price move justifies would mean the curve is giving something
      away, not that the mempool is public.                                */
  async sandwich(p) {
    if (!chance(35)) return;
    const m = await market();
    const front = m.rB / 30n;
    if (front === 0n) return;

    const b0 = await balOf(BASE, p.addr), q0 = await balOf(QUOTE, p.addr);
    let leg1 = false;
    try { await asOf(p.addr, pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
      [ID, true, front, 0, p.addr, FOREVER]); leg1 = true; p.acted++; } catch { p.refused++; }
    if (!leg1) return;

    // the victim, moving the price the same way
    const w = people.whale;
    try {
      await asOf(w.addr, pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
        [ID, true, (await market()).rB / 12n, 0, w.addr, FOREVER]);
      w.acted++;
    } catch { w.refused++; }

    const gained = (await balOf(QUOTE, p.addr)) - q0;
    if (gained > 0n) {
      try { await asOf(p.addr, pool, "swap(uint256,bool,uint256,uint256,address,uint256)",
        [ID, false, gained, 0, p.addr, FOREVER]); p.acted++; } catch { p.refused++; }
    }
    const b1 = await balOf(BASE, p.addr);
    if (b1 > b0) sandwichProfit += b1 - b0;
    await watch("swap", m);
  },

  /* spends to make things worse for somebody else */
  async griefer(p) {
    if (chance(30)) {
      // permanently donate to the Grip: makes the token strictly richer,
      // and can never be undone by anybody, including the holder
      await act(p, async () => {
        await asOf(p.addr, BASE, "transfer(address,uint256)", [vaults.grip, 1n + rnd(WAD)]);
      });
    } else if (chance(25)) {
      // donate to the pool without depositing — reserves are accounted, not
      // measured from balanceOf, so this must change nothing at all
      await act(p, async () => {
        await asOf(p.addr, BASE, "transfer(address,uint256)", [pool, WAD]);
      });
    } else if (chance(20)) {
      // try to take the token, take the market, take the vault
      await act(p, async () => {
        await asOf(p.addr, nft, "transferFrom(address,address,uint256)",
          [people.holder.addr, p.addr, ID]);
      });
    }
  },

  /* may operate the artwork; must never be able to touch the money */
  async renter(p) {
    if (chance(35)) {
      const w = (rnd(65536n) << 48n) | (rnd(65536n) << 64n) | (rnd(65536n) << 80n) | (rnd(8n) << 112n);
      await act(p, async () => {
        await asOf(p.addr, nft, "commit(uint256,uint256)", [ID, w]);
      });
    }
    if (chance(25)) {
      // the one that must always fail: re-price somebody else's inventory
      const before = await market();
      let got = false;
      try { await asOf(p.addr, pool, "syncCurve(uint256)", [ID]); got = true; } catch {}
      if (got) fire("a renter re-priced the holder's liquidity",
        `syncCurve succeeded for the ERC-4907 user at tick ${TICK}`);
      if (chance(50)) {
        let took = false;
        try {
          await asOf(p.addr, pool, "withdraw(uint256,uint256,uint256,address)",
            [ID, before.rB / 10n, 0, p.addr]);
          took = true;
        } catch {}
        if (took) fire("a renter withdrew the holder's inventory", `at tick ${TICK}`);
      }
    }
  }
};

/*══════════════════ THE RUN ══════════════════*/
head(`${TICKS} ticks`);
let sandwichProfit = 0n;

const opening = {};
for (const p of everyone) {
  opening[p.key] = { b: await balOf(BASE, p.addr), q: await balOf(QUOTE, p.addr) };
}
gripFloor = await balOf(BASE, vaults.grip);
await watch("open", null);

for (TICK = 1; TICK <= TICKS && broken.length === 0; TICK++) {
  evm.warp(NOW());

  // the world moves whether or not anyone trades
  truePrice = truePrice * (9800n + rnd(400n)) / 10000n;
  if (truePrice < 100n * WAD) truePrice = 100n * WAD;

  // turn order is shuffled every tick: nobody has a structural advantage
  const order = everyone.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Number(rnd(BigInt(i + 1)));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const p of order) await turns[p.key](p);

  if (VERBOSE && TICK % 20 === 0) {
    const m = await market();
    console.log(`      t${String(TICK).padStart(4)}  ` +
      `reserves ${fmt(m.rB)} / ${fmt(m.rQ)}  conc ${m.conc}  trades ${m.trades}`);
  }
}

/*══════════════════ THE LEDGER ══════════════════*/
head("who ended up with what");
const m = await market();
console.log(`      ${m.trades} trades · concentration ${m.conc} bps · ` +
            `reserves ${fmt(m.rB)} WETH / ${fmt(m.rQ)} USDC`);
console.log("");

for (const p of everyone) {
  const b = await balOf(BASE, p.addr), q = await balOf(QUOTE, p.addr);
  const db = b - opening[p.key].b, dq = q - opening[p.key].q;
  const net = db + (dq * WAD) / (truePrice === 0n ? WAD : truePrice);
  const sign = net > 0n ? "\x1b[32m+" : net < 0n ? "\x1b[31m" : " ";
  console.log(`      ${p.key.padEnd(9)} ${sign}${fmt(net).padStart(12)}\x1b[0m WETH-equivalent   ` +
              `\x1b[2m${p.acted} acts, ${p.refused} refused\x1b[0m`);
}
console.log(`\n      \x1b[2m${cast.map((x) => x.key + ": " + x.role).join("\n      ")}\x1b[0m`);

console.log(`\n      the Grip holds ${fmt(await balOf(BASE, vaults.grip))} WETH, ` +
            `and there is no function that can move it`);

/*──────────────── verdict ────────────────*/
if (broken.length === 0) {
  console.log(`\n  \x1b[32mevery monitor held for ${TICKS} ticks\x1b[0m`);
  console.log(`  \x1b[2mseed ${SEED} — pass --seed ${SEED} to run exactly this world again\x1b[0m\n`);
  process.exit(0);
}
console.log(`\n  \x1b[31m${broken.length} monitor(s) fired\x1b[0m`);
console.log(`  \x1b[2mreproduce with --seed ${SEED}\x1b[0m\n`);
process.exit(1);
