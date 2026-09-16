import test from "node:test";
import assert from "node:assert/strict";
import {
  ExitEngine,
  normalizeExit,
  exitSlices,
} from "../../web/exit/engine.mjs";
import { MemoryEngine, memoryCategory } from "../../web/memory/engine.mjs";
import { memorySeal, memoryBody } from "../../web/memory/crypto.mjs";
import { wei, fingerprint } from "../../web/kingdom/model.mjs";
import { liveExitTerms, humanExitTerms } from "../../web/exit/live.mjs";
const now = 1788643200,
  origin = "0x" + "11".repeat(32),
  anchor = "0x" + "22".repeat(32),
  fresh = () => new ExitEngine(now, origin);
const terms = (n = 2, min = "1") => ({
  asset: "ETH",
  rows: Array.from({ length: n }, (_, i) => ({
    offsetDays: i * 7,
    bps: 10000 / n,
    minOut: min,
    graceDays: 3,
  })),
});
const raw = (exit = terms()) => ({
  kind: "SWAP",
  input: "ETH",
  output: "AUR",
  amount: String(wei("0.1")),
  minOut: "1",
  days: 1,
  recipient: null,
  exit,
});
const funded = (exit = terms()) => {
  const e = fresh(),
    p = e.prepare(raw(exit), anchor);
  e.execute(p, anchor);
  return e;
};
function roundtrip(e) {
  assert.deepEqual(ExitEngine.restore(e.export()).export(), e.export());
}
test("original archives migrate without rewriting memories, locks or custody", () => {
  const old = new MemoryEngine(now, origin);
  old.world.deposit("AUR", wei("10"), 3);
  const original = old.export(),
    e = ExitEngine.restore(original, origin);
  assert.deepEqual(e.export().remembering, original);
  assert.equal(e.exits.length, 0);
});
test("normal buy-AUR/sell-ETH schedule funds exact escrow, not free or ordinary lock balances", () => {
  const e = fresh(),
    before = BigInt(e.world.identity().balances.AUR),
    locks = e.world.s.locks.length,
    p = e.prepare(raw(), anchor);
  e.execute(p, anchor);
  assert.equal(e.world.identity().balances.AUR, String(before));
  assert.equal(e.world.s.locks.length, locks);
  assert.equal(e.exits[0].total, p.preview.received);
  assert.equal(
    e.exits[0].slices.reduce((n, s) => n + BigInt(s.amount), 0n),
    BigInt(p.preview.received),
  );
  roundtrip(e);
});
test("journal + swap + funding commit atomically and every later fill traces the original decision", () => {
  const e = fresh(),
    p = e.prepare(raw(), anchor);
  const note = memorySeal(e.memoryHeader({ phase: "before", plan: p.digest }), {
    mode: "public",
    body: memoryBody({
      thesis: "Observe adoption before changing the position.",
    }),
  });
  e.executeNoted(p, anchor, note);
  assert.equal(e.mem.bindings[0].result.exitPlanId, 1);
  e.world.advance(86400);
  const fill = e.executeExit(1, 0);
  const trace = e.trace(fill.receipt);
  assert(trace.some((x) => x.event.kind === "MEMORY_INSCRIBED"));
  assert(trace.some((x) => x.event.kind === "EXIT_FUNDED"));
  assert.equal(e.mem.entries.length, 1);
  roundtrip(e);
});
test("time and projections never execute sales", () => {
  const e = funded(),
    before = e.exits[0].slices[0].status;
  e.project(1, now + 86400 * 180);
  e.world.advance(86400);
  assert.equal(e.exits[0].slices[0].status, before);
  assert.equal(e.exitStatus(e.exits[0], e.exits[0].slices[0]), "eligible");
});
test("minimum failures leave pools, free funds, escrow, notes and receipts byte-identical", () => {
  const e = funded(terms(2, String(wei("100"))));
  e.world.advance(86400);
  const before = e.export();
  assert.throws(() => e.executeExit(1, 0), /Minimum/);
  assert.deepEqual(e.export(), before);
});
test("keeper cannot execute early, repeat a slice, or redirect proceeds", () => {
  const e = funded();
  assert.throws(() => e.executeExit(1, 0));
  e.world.advance(86400);
  e.world.setActor("guest");
  e.world.select(2);
  const before = BigInt(e.world.identity(1).balances.ETH),
    guest = structuredClone(e.world.identity(2).balances);
  const s = e.executeExit(1, 0);
  assert.equal(
    e.world.identity(1).balances.ETH,
    String(before + BigInt(s.received)),
  );
  assert.deepEqual(e.world.identity(2).balances, guest);
  assert.equal(e.world.s.selected, 2);
  assert.throws(() => e.executeExit(1, 0));
  roundtrip(e);
});
test("cancellation preserves original maturity, recovery is fixed and repeat-proof", () => {
  const e = funded();
  e.changeExit(1, "cancel");
  assert.throws(() => e.recoverExit(1, 0));
  assert.throws(() => e.changeExit(1, "resume"));
  e.world.advance(86400);
  e.world.setActor("guest");
  const before = BigInt(e.world.identity(1).balances.AUR);
  e.recoverExit(1, 0);
  assert.equal(
    e.world.identity(1).balances.AUR,
    String(before + BigInt(e.exits[0].slices[0].amount)),
  );
  assert.throws(() => e.recoverExit(1, 0));
  assert.throws(() => e.recoverExit(1, 1));
  roundtrip(e);
});
test("expiry excludes a sale and enables matured-token recovery", () => {
  const e = funded();
  e.world.advance(4 * 86400);
  assert.equal(e.exitStatus(e.exits[0], e.exits[0].slices[0]), "expired");
  assert.throws(() => e.executeExit(1, 0));
  e.recoverExit(1, 0);
  roundtrip(e);
});
test("listing includes funded exits; changed custody requires reauthorization then resume", () => {
  const e = funded(),
    listing = e.world.listEstate(1, wei("1"), 7);
  assert(e.op.covenants[listing.id]);
  e.world.setActor("guest");
  e.world.select(2);
  e.world.buy(listing.id, listing.manifest);
  e.world.advance(86400);
  assert.throws(() => e.executeExit(1, 0));
  assert.throws(() => e.changeExit(1, "resume"));
  e.changeExit(1, "reauthorize");
  assert.throws(() => e.executeExit(1, 0));
  e.changeExit(1, "resume");
  e.executeExit(1, 0);
  roundtrip(e);
});
test("changes to exit state invalidate an already-reviewed swap", () => {
  const e = funded(),
    p = e.prepare({ ...raw(), exit: terms() }, anchor);
  e.changeExit(1, "pause");
  assert.throws(() => e.execute(p, anchor), /changed/);
});
test("vault projections disclose escrow and only add cancelled/expired matured recovery", () => {
  const e = funded();
  let p = e.project(1, now + 86400);
  assert(
    p.claims.some((c) => c.type === "vesting-exit" && c.available === "0"),
  );
  e.changeExit(1, "cancel");
  p = e.project(1, now + 86400);
  assert.equal(
    p.claims.find((c) => c.type === "vesting-exit").available,
    e.exits[0].slices[0].amount,
  );
});
test("percentages, nonzero minima, dates, zero-sized allocations and dust are bounded", () => {
  assert.throws(() =>
    normalizeExit(
      {
        ...terms(),
        rows: [{ offsetDays: 0, bps: 9999, minOut: "1", graceDays: 1 }],
      },
      1,
    ),
  );
  assert.throws(() => normalizeExit(terms(2, "0"), 1));
  const spec = {
    asset: "ETH",
    rows: [
      { offsetDays: 0, bps: 3333, minOut: "1", graceDays: 1 },
      { offsetDays: 1, bps: 3333, minOut: "1", graceDays: 1 },
      { offsetDays: 2, bps: 3334, minOut: "1", graceDays: 1 },
    ],
  };
  assert.deepEqual(
    exitSlices(10, spec, now).map((s) => s.amount),
    ["3", "3", "4"],
  );
  assert.throws(() => exitSlices(1, spec, now));
});
test("rehashed outer archive cannot invent state or erase its funded schedule", () => {
  const e = funded(),
    x = e.export();
  x.exits[0].slices[0].status = "sold";
  const { checksum, ...body } = x;
  x.checksum = fingerprint(body);
  assert.throws(() => ExitEngine.restore(x));
  assert.throws(() => ExitEngine.restore(e.export().remembering));
});
test("exit funding/control/recovery grow only the commitment channel", () => {
  for (const kind of ["EXIT_FUNDED", "EXIT_CONTROL", "EXIT_RECOVERED"])
    assert.equal(memoryCategory(kind), 1);
});
test("live schedule compiler uses raw units and actual chain timestamp, bounded distinct dates", () => {
  const p = liveExitTerms("30, 3, 1, 7\n37, 7, 2, 7", now);
  assert.equal(p.total, "10");
  assert.equal(p.slices[0].due, now + 30 * 86400);
  assert.throws(() => liveExitTerms("1, 1, 0, 7", now));
  assert.throws(() => liveExitTerms("1, 1, 1, 7\n1, 1, 1, 7", now));
});

test("schedule controls round-trip whole and fractional minima and cannot opt out of a dedicated exit silently", async () => {
  const { readFileSync } = await import("node:fs"),
    { createContext, runInContext } = await import("node:vm");
  const context = createContext({
    assets: () => "",
    field: () => "",
    B: () => "",
  });
  runInContext(
    readFileSync(new URL("../../web/exit/app.js", import.meta.url), "utf8"),
    context,
  );
  for (const n of [
    1n,
    999999999999999999n,
    1000000000000000000n,
    1000000000000000000000n,
  ])
    assert.equal(wei(context.exDecimal(n)), n);
  assert.match(context.exEditor(true), /checked disabled/);
});

test("human schedule amounts preserve distinct token decimals and enforce original schedule bounds", () => {
  const terms = humanExitTerms(
    "30, 0.025, 50.12, 7\n37, 0.075, 150.5, 7",
    now,
    18,
    6,
  );
  assert.equal(terms.total, "100000000000000000");
  assert.equal(terms.slices[0].amount, "25000000000000000");
  assert.equal(terms.slices[0].minOut, "50120000");
  assert.throws(() => humanExitTerms("30, 1, 0.0000001, 7", now, 18, 6));
  assert.throws(() => humanExitTerms("30, 1, 0, 7", now, 18, 6));
  assert.throws(() => humanExitTerms("30, -1, 2, 7", now, 18, 6));
});
