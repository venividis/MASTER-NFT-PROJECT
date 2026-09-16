import test from "node:test";
import assert from "node:assert/strict";
import { defaults, units } from "../../web/launchpad/model.mjs";
import {
  initialEconomics,
  applyEconomics,
  replayEconomics,
  economicsConservation,
  economyJSON,
} from "../../web/launchpad/economics-engine.mjs";
const draft = () => ({
  ...defaults(),
  hookEnabled: true,
  recipients: [{ weight: "3" }, { weight: "1" }],
});
test("fee collection, repeated-claim refusal and reinvestment preserve exact account custody and LP principal", () => {
  const s = initialEconomics(draft());
  applyEconomics(s, "fund creator quote 10");
  applyEconomics(s, "buy creator 0.1");
  applyEconomics(s, "sell creator 100");
  const shares = s.totalShares,
    liq = s.model.l,
    before = s.accounts.creator.quote;
  const collected = applyEconomics(s, "collect creator").collected;
  assert.ok(collected.quote > 0n);
  assert.equal(s.totalShares, shares);
  assert.equal(s.model.l, liq);
  assert.equal(s.accounts.creator.quote - before, collected.quote);
  assert.throws(() => applyEconomics(s, "collect creator"), /No earned fees/);
  applyEconomics(s, "buy creator 0.1");
  applyEconomics(s, "sell creator 100");
  const result = applyEconomics(s, "reinvest creator auto");
  assert.ok(result.reinvested.liquidity > 0n);
  assert.equal(s.totalShares, shares + result.reinvested.shares);
  assert.equal(economicsConservation(s).balanced, true);
});
test("fee-bearing LP allocations retain earnings across partial vesting and collection", () => {
  const s = initialEconomics(draft()),
    half = s.totalShares / 2n;
  applyEconomics(s, `allocate creator alice shares ${half} 0 100 200`);
  applyEconomics(s, "fund bob quote 1");
  applyEconomics(s, "buy bob 0.1");
  applyEconomics(s, "sell bob 100");
  applyEconomics(s, "advance 100");
  applyEconomics(s, "release 1");
  assert.equal(s.accounts.alice.shares, half / 2n);
  const principal = s.model.l;
  applyEconomics(s, "collect alice");
  assert.equal(s.model.l, principal);
  assert.ok(s.accounts["lock:1"].credit.quote > 0n);
  assert.equal(economicsConservation(s).balanced, true);
});
test("beneficiary payout conversion spends only owned claims and newly accrued hook fees remain separate", () => {
  const s = initialEconomics(draft());
  applyEconomics(s, "fund trader quote 1");
  applyEconomics(s, "buy trader 0.2");
  applyEconomics(s, "flush");
  const other = s.claims["recipient:2"].quote,
    before = s.claims["recipient:1"].quote;
  const r = applyEconomics(s, "convert 1 quote 0.0001 0.1");
  assert.ok(r.trade.out > 0n);
  assert.equal(s.claims["recipient:2"].quote, other);
  assert.equal(s.claims["recipient:1"].quote, before - units("0.0001"));
  assert.ok(s.hookPending.quote > 0n);
  assert.equal(economicsConservation(s).balanced, true);
});
test("scheduled exits respect time, per-slice minimum, beneficiary and prepaid executor rewards", () => {
  const s = initialEconomics(draft());
  applyEconomics(s, "fund creator native 0.03");
  applyEconomics(s, "exit creator alice token 300 0.001 3 100 100 500 0.01");
  assert.throws(() => applyEconomics(s, "execute 1 keeper"), /not due/);
  applyEconomics(s, "advance 100");
  applyEconomics(s, "execute 1 keeper");
  assert.equal(s.accounts.keeper.native, units("0.01"));
  assert.ok(s.accounts.alice.quote > 0n);
  assert.equal(s.exits[0].remaining, units("200"));
  applyEconomics(s, "cancel creator 1");
  assert.equal(s.accounts.creator.native, units("0.02"));
  assert.equal(economicsConservation(s).balanced, true);
});
test("failed scenario actions are atomic and irreversible fee policy constraints are enforced", () => {
  const d = draft(),
    before = replayEconomics(d, "fund alice quote 1\ncommit-split");
  const failed = replayEconomics(
    d,
    "fund alice quote 1\ncommit-split\nweights 1 3\nbuy alice 0.1",
  );
  assert.equal(failed.complete, false);
  assert.deepEqual(economyJSON(failed.state), economyJSON(before.state));
  assert.equal(failed.history.length, 3);
  const policy = replayEconomics(
    d,
    "commit-hook 10000 ceiling\nhook-fee 10001",
  );
  assert.equal(policy.complete, false);
  assert.match(policy.history[1].error, /committed/);
  const slippage = replayEconomics(
    d,
    "fund alice quote 1\nbuy alice 0.1 1000000",
  );
  assert.equal(slippage.complete, false);
  assert.equal(slippage.state.accounts.alice.quote, units("1"));
  assert.equal(slippage.conservation.balanced, true);
});
