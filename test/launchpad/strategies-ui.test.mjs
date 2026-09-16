import test from "node:test";
import assert from "node:assert/strict";
import { StrategiesDesk } from "../../web/launchpad/strategies.mjs";
import { EconomicsDesk } from "../../web/launchpad/economics.mjs";
import { defaults } from "../../web/launchpad/model.mjs";
const chain = () => ({
  generation: 0,
  plan: null,
  invalidate() {
    this.generation++;
    this.plan = null;
  },
});
test("changing strategy context or leaving its surface cannot reopen stale transaction review", async () => {
  const c = chain();
  let resolve,
    reviewed = 0;
  const d = new StrategiesDesk(c, { onPrepared: () => reviewed++ });
  d.client = { collect: () => new Promise((r) => (resolve = r)) };
  const pending = d.action("collect");
  d.configure({ position: "new-position" });
  const plan = { kind: "lp-collect-fees" };
  c.plan = plan;
  resolve(plan);
  await pending;
  assert.equal(reviewed, 0);
  assert.equal(c.plan, null);
  const leaving = d.action("collect");
  d.unmount();
  c.plan = plan;
  resolve(plan);
  await leaving;
  assert.equal(reviewed, 0);
  assert.equal(c.plan, null);
});
test("late readonly results for a replaced funding account are discarded", async () => {
  const c = chain();
  let resolve;
  const d = new StrategiesDesk(c);
  d.client = { inspectExit: () => new Promise((r) => (resolve = r)) };
  const pending = d.action("inspectExit");
  c.invalidate();
  resolve({ owner: "old-owner" });
  await pending;
  assert.equal(d.result, null);
});
test("strategy surface exposes custody, actual converter bounds and irreversible commitments clearly", () => {
  const d = new StrategiesDesk(chain()),
    html = d.render();
  for (const text of [
    "Review fee-only collection",
    "Review payout conversion",
    "Review irreversible hook policy",
    "Review irreversible splitter weights",
    "Review funded schedule",
    "Optional automatic reinvestment",
    "Cancel &amp; recover",
  ])
    assert.ok(
      html.includes(text) || html.includes(text.replace("&amp;", "&")),
      text,
    );
  assert.doesNotMatch(html, /preview label|guaranteed return/i);
});
test("economic export uses exact units, correct filename and source terms", () => {
  let output;
  const d = new EconomicsDesk({
    getDraft: () => defaults(),
    onExport: (data, name) => (output = { data, name }),
  });
  assert.ok(d.run().complete);
  d.export();
  assert.equal(output.name, "anima-economic-scenario.json");
  const data = JSON.parse(output.data);
  assert.equal(data.schema, "anima.economics-scenario/1");
  assert.equal(typeof data.state.model.supply, "string");
  assert.equal(data.conservation.token.total, data.conservation.token.expected);
  assert.equal(data.draft.name, defaults().name);
});
test("official mechanism panes preserve their own step surface and clear credentials when leaving", () => {
  const d = new EconomicsDesk();
  d.chooseMechanism("cca");
  assert.match(d.render(), /Uniswap CCA · exact contract laboratory/);
  assert.match(d.render(), /data-private-surface/);
  assert.doesNotMatch(d.render(), /data-economic-run/);
  assert.equal(
    d.run(),
    null,
    "official contracts cannot fall through to the pool calculator",
  );
  let closed = 0;
  d.officialDesk.client = { close: () => closed++ };
  d.officialDesk.values.accessCode = "sensitive-code";
  d.officialDesk.snapshot = { privateSession: true };
  d.chooseMechanism("doppler");
  assert.equal(closed, 1);
  assert.equal(d.officialDesk.values.accessCode, "");
  assert.equal(d.officialDesk.snapshot, null);
  assert.equal(d.officialDesk.mechanism, "doppler");
  assert.match(d.render(), /Doppler · exact contract laboratory/);
  d.officialDesk.values.accessCode = "another-secret";
  d.officialDesk.client = { close: () => closed++ };
  d.chooseMechanism("pool");
  assert.equal(closed, 2);
  assert.equal(d.officialDesk.values.accessCode, "");
  assert.match(d.render(), /data-economic-run/);
});
test("mounting a rerendered economics surface cannot retain stale official service credentials", () => {
  const d = new EconomicsDesk();
  d.chooseMechanism("cca");
  d.officialDesk.values.accessCode = "stale-secret";
  const child = {
    innerHTML: d.officialDesk.render(),
    querySelectorAll() {
      return [];
    },
  };
  const root = {
    querySelector: (selector) =>
      selector === "[data-economic-official]" ? child : null,
    addEventListener() {},
  };
  assert.match(child.innerHTML, /stale-secret/);
  d.mount(root);
  assert.doesNotMatch(child.innerHTML, /stale-secret/);
  assert.equal(d.officialDesk.root, child);
  d.unmount();
  assert.equal(d.officialDesk.root, null);
});
