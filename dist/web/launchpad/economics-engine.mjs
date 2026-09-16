import { poolModel, poolTrade, units, decimal, defaults } from "./model.mjs";
import { liquidityForBudgets, Q96 } from "../v4/math.mjs";
const Q128 = 1n << 128n,
  ASSETS = ["token", "quote"],
  sum = (a) => a.reduce((x, y) => x + y, 0n),
  ceil = (a, b) => (a + b - 1n) / b;
const funds = () => ({
  token: 0n,
  quote: 0n,
  native: 0n,
  shares: 0n,
  last: { token: 0n, quote: 0n },
  credit: { token: 0n, quote: 0n },
  fraction: { token: 0n, quote: 0n },
});
const actor = (s, id) => s.accounts[id] || (s.accounts[id] = funds());
const check = (v, message) => {
  if (!v) throw Error(message);
};
const name = (v) => {
  check(/^[A-Za-z][\w:.-]{0,80}$/.test(String(v)), "Use a short account name.");
  return String(v);
};
const raw = (v, label = "Raw amount") => {
  check(/^\d+$/.test(String(v)), `${label} must be a whole number.`);
  return BigInt(v);
};
const amount = (s, v, asset) =>
  units(v, asset === "quote" ? s.model.qd : 18, { zero: false });
const take = (a, k, n) => {
  check(n >= 0n && a[k] >= n, `Insufficient ${k} balance.`);
  a[k] -= n;
};
const add = (a, k, n) => {
  check(n >= 0n, "Negative credit.");
  a[k] += n;
};
export const ECONOMICS_SCOPE =
  "Conserved, integer execution model for the selected ANIMA v4 single position: no outside liquidity or transactions, zero protocol fee, standard ERC20 assets. Fee collection, share transfer, reinvestment, vesting and scheduled-exit accounting follow the implemented contracts. Scenario trades are calculations under these assumptions, never live quotes or market predictions.";
export function initialEconomics(d = defaults(), { model } = {}) {
  model = model || poolModel(d, d.scenarioTokenOrder !== "token1");
  const s = {
    model: structuredClone(model),
    now: 0,
    accounts: { creator: funds() },
    reserves: { token: model.usedToken, quote: model.usedQuote },
    poolFees: { token: 0n, quote: 0n },
    poolGrowth: { token: 0n, quote: 0n },
    lastPoolGrowth: { token: 0n, quote: 0n },
    position: { token: 0n, quote: 0n },
    feeGrowth: { token: 0n, quote: 0n },
    hookPending: { token: 0n, quote: 0n },
    claims: {},
    totalShares: model.l,
    quoteIntroduced: model.quoteBudget,
    nativeIntroduced: 0n,
    locks: [],
    exits: [],
    recipients: (d.recipients || [{ weight: "1" }]).map((r, i) => ({
      id: String(i + 1),
      account: `recipient:${i + 1}`,
      weight: raw(r.weight || "1"),
    })),
    splitCommitted: false,
    hookPolicy: null,
  };
  s.accounts.creator.token = model.retained;
  s.accounts.creator.quote = model.quoteRefund;
  s.accounts.creator.shares = model.l;
  check(
    s.recipients.length > 0 &&
      s.recipients.length <= 64 &&
      s.recipients.every((r) => r.weight > 0n && r.weight <= 10n ** 18n),
    "Invalid split weights.",
  );
  economicsConservation(s);
  return s;
}
export function economicsConservation(s) {
  const accountValues = Object.values(s.accounts),
    result = { balanced: true };
  for (const asset of ASSETS) {
    const total =
      sum(accountValues.map((a) => a[asset])) +
      s.reserves[asset] +
      s.poolFees[asset] +
      s.position[asset] +
      s.hookPending[asset] +
      sum(Object.values(s.claims).map((a) => a[asset]));
    const expected = asset === "token" ? s.model.supply : s.quoteIntroduced;
    check(total === expected, `${asset} custody is not conserved.`);
    result[asset] = { total, expected };
  }
  const native = sum(accountValues.map((a) => a.native));
  check(
    native === s.nativeIntroduced,
    "Keeper reward custody is not conserved.",
  );
  result.native = { total: native, expected: s.nativeIntroduced };
  const shares = sum(accountValues.map((a) => a.shares));
  check(shares === s.totalShares, "LP shares are not conserved.");
  result.shares = { total: shares, expected: s.totalShares };
  for (const a of accountValues)
    for (const asset of [...ASSETS, "native", "shares"])
      check(a[asset] >= 0n, "Negative custody.");
  for (const x of [s.reserves, s.poolFees, s.position, s.hookPending])
    for (const k of ASSETS) check(x[k] >= 0n, "Negative pool custody.");
  for (const asset of ASSETS)
    check(
      sum(accountValues.map((a) => a.credit[asset])) <= s.position[asset],
      "Fee claims exceed position custody.",
    );
  return result;
}
function harvest(s) {
  if (s.model.l === 0n || s.totalShares === 0n) return;
  for (const asset of ASSETS) {
    const realized =
      ((s.poolGrowth[asset] - s.lastPoolGrowth[asset]) * s.model.l) / Q128;
    take(s.poolFees, asset, realized);
    add(s.position, asset, realized);
    s.feeGrowth[asset] += (realized * Q128) / s.totalShares;
    s.lastPoolGrowth[asset] = s.poolGrowth[asset];
  }
}
function checkpoint(s, id) {
  const a = actor(s, id);
  for (const asset of ASSETS) {
    const delta = s.feeGrowth[asset] - a.last[asset],
      scaled = a.shares * delta + a.fraction[asset];
    a.credit[asset] += scaled / Q128;
    a.fraction[asset] = scaled % Q128;
    a.last[asset] = s.feeGrowth[asset];
  }
  return a;
}
function transferShares(s, from, to, n) {
  check(n > 0n, "Share transfer must be positive.");
  harvest(s);
  const a = checkpoint(s, from),
    b = checkpoint(s, to);
  check(a.shares >= n, "Insufficient LP shares.");
  if (from !== to)
    for (const asset of ASSETS) {
      const moved = (a.credit[asset] * n) / a.shares,
        frac = (a.fraction[asset] * n) / a.shares;
      a.credit[asset] -= moved;
      b.credit[asset] += moved;
      a.fraction[asset] -= frac;
      const f = b.fraction[asset] + frac;
      b.credit[asset] += f / Q128;
      b.fraction[asset] = f % Q128;
    }
  take(a, "shares", n);
  add(b, "shares", n);
}
function principal(s, l, up) {
  const { p, a, b, tokenIs0 } = s.model;
  let v0 = 0n,
    v1 = 0n;
  if (p < b) {
    const lo = p > a ? p : a;
    v0 = up
      ? ceil(ceil(l * Q96 * (b - lo), b), lo)
      : (l * Q96 * (b - lo)) / b / lo;
  }
  if (p > a) {
    const hi = p < b ? p : b;
    v1 = up ? ceil(l * (hi - a), Q96) : (l * (hi - a)) / Q96;
  }
  return tokenIs0 ? { token: v0, quote: v1 } : { token: v1, quote: v0 };
}
function trade(s, id, direction, input, minimum = 0n, recipient = id) {
  const a = actor(s, id),
    b = actor(s, recipient),
    asset = direction === "buy" ? "quote" : "token",
    output = asset === "token" ? "quote" : "token";
  const t = poolTrade(
    s.model,
    direction,
    decimal(input, asset === "quote" ? s.model.qd : 18),
  );
  check(t.out >= minimum, "The selected minimum output rejects this trade.");
  take(a, asset, t.gross);
  take(s.reserves, output, t.out);
  add(b, output, t.out);
  add(s.reserves, asset, t.net);
  add(s.poolFees, asset, t.lpFee);
  s.poolGrowth[asset] += t.feeGrowthX128;
  add(s.hookPending, asset, t.hookFee);
  s.model = { ...s.model, p: t.next, tick: t.tick, price: t.after };
  return {
    ...t,
    inputAsset: asset,
    outputAsset: output,
    outputDecimals: output === "quote" ? s.model.qd : 18,
  };
}
function collect(s, id) {
  harvest(s);
  const a = checkpoint(s, id),
    out = { token: a.credit.token, quote: a.credit.quote };
  check(out.token + out.quote > 0n, "No earned fees to collect.");
  for (const asset of ASSETS) {
    take(s.position, asset, out[asset]);
    add(a, asset, out[asset]);
    a.credit[asset] = 0n;
  }
  return out;
}
function reinvest(s, id, increment) {
  harvest(s);
  const a = checkpoint(s, id),
    budget = { ...a.credit };
  let l;
  if (increment && increment !== "auto")
    l = raw(increment, "Liquidity increment");
  else {
    const { p, a: lower, b, tokenIs0 } = s.model;
    l =
      (liquidityForBudgets(
        p,
        lower,
        b,
        tokenIs0 ? budget.token : budget.quote,
        tokenIs0 ? budget.quote : budget.token,
      ) *
        99n) /
      100n;
  }
  check(
    l > 0n && s.model.l > 0n && s.model.l + l < 1n << 127n,
    "Unsupported liquidity increment.",
  );
  const spent = principal(s, l, true),
    minted = (l * s.totalShares) / s.model.l;
  check(minted > 0n, "Reinvestment is below one share.");
  for (const asset of ASSETS) {
    check(
      spent[asset] <= budget[asset],
      "Earned fees cannot fund this liquidity increment.",
    );
    a.credit[asset] = 0n;
    take(s.position, asset, budget[asset]);
    add(s.reserves, asset, spent[asset]);
    add(a, asset, budget[asset] - spent[asset]);
  }
  s.model.l += l;
  s.totalShares += minted;
  a.shares += minted;
  return { liquidity: l, shares: minted, spent };
}
function redeem(s, id, shares) {
  harvest(s);
  const a = checkpoint(s, id),
    n = shares === "all" ? a.shares : raw(shares, "LP shares");
  check(n > 0n && n <= a.shares, "Insufficient redemption shares.");
  const removed =
    n === s.totalShares ? s.model.l : (s.model.l * n) / s.totalShares;
  check(removed > 0n, "Dust shares cannot redeem liquidity.");
  const out = principal(s, removed, false),
    fees = {};
  for (const asset of ASSETS) {
    const finalRedemption = n === s.totalShares;
    fees[asset] = finalRedemption
      ? s.position[asset]
      : (a.credit[asset] * n) / a.shares;
    if (finalRedemption) a.credit[asset] = 0n;
    else a.credit[asset] -= fees[asset];
    take(s.position, asset, fees[asset]);
    take(s.reserves, asset, out[asset]);
    add(a, asset, out[asset] + fees[asset]);
  }
  a.shares -= n;
  s.totalShares -= n;
  s.model.l -= removed;
  return { shares: n, liquidity: removed, principal: out, fees };
}
export function applyEconomics(s, line) {
  const [op, ...a] = String(line).trim().split(/\s+/),
    arity = (n) => check(a.length === n, `${op} expects ${n} arguments.`);
  let result = { kind: op };
  if (op === "fund") {
    arity(3);
    const who = actor(s, name(a[0])),
      asset = a[1];
    check(
      asset === "quote" || asset === "native",
      "External scenario funding is quote or native currency.",
    );
    const n = amount(s, a[2], asset);
    add(who, asset, n);
    if (asset === "quote") s.quoteIntroduced += n;
    else s.nativeIntroduced += n;
  } else if (op === "buy" || op === "sell") {
    check(
      a.length === 2 || a.length === 3,
      "Trade: account amount [minimum output].",
    );
    const input = op === "buy" ? "quote" : "token",
      output = input === "token" ? "quote" : "token";
    result.trade = trade(
      s,
      name(a[0]),
      op,
      amount(s, a[1], input),
      a[2] ? amount(s, a[2], output) : 0n,
    );
  } else if (op === "shares") {
    arity(3);
    transferShares(s, name(a[0]), name(a[1]), raw(a[2]));
  } else if (op === "collect") {
    arity(1);
    result.collected = collect(s, name(a[0]));
  } else if (op === "reinvest") {
    check(
      a.length === 1 || a.length === 2,
      "Reinvest: holder [raw liquidity or auto].",
    );
    result.reinvested = reinvest(s, name(a[0]), a[1]);
  } else if (op === "redeem") {
    arity(2);
    result.redeemed = redeem(s, name(a[0]), a[1]);
  } else if (op === "flush") {
    arity(0);
    const weight = sum(s.recipients.map((r) => r.weight));
    for (const asset of ASSETS) {
      let left = s.hookPending[asset];
      s.recipients.forEach((r, i) => {
        const n =
          i === s.recipients.length - 1
            ? left
            : (s.hookPending[asset] * r.weight) / weight;
        left -= n;
        const c =
          s.claims[r.account] ||
          (s.claims[r.account] = { token: 0n, quote: 0n });
        add(c, asset, n);
      });
      s.hookPending[asset] = 0n;
    }
  } else if (op === "claim") {
    arity(1);
    const id = `recipient:${a[0]}`,
      c = s.claims[id];
    check(c && c.token + c.quote > 0n, "No recipient claims.");
    for (const asset of ASSETS) {
      add(actor(s, id), asset, c[asset]);
      c[asset] = 0n;
    }
  } else if (op === "convert") {
    arity(4);
    const id = `recipient:${a[0]}`,
      asset = a[1],
      n = amount(s, a[2], asset);
    check(ASSETS.includes(asset), "Choose token or quote.");
    const c = s.claims[id];
    check(c && c[asset] >= n, "Recipient does not own enough earned fees.");
    take(c, asset, n);
    add(actor(s, id), asset, n);
    result.trade = trade(
      s,
      id,
      asset === "quote" ? "buy" : "sell",
      n,
      amount(s, a[3], asset === "token" ? "quote" : "token"),
    );
  } else if (op === "weights") {
    check(!s.splitCommitted, "Recipient weights were irrevocably committed.");
    check(a.length === s.recipients.length, "Supply every recipient weight.");
    s.recipients.forEach((r, i) => {
      const w = raw(a[i]);
      check(w > 0n && w <= 10n ** 18n, "Invalid split weight.");
      r.weight = w;
    });
  } else if (op === "commit-split") {
    arity(0);
    check(!s.splitCommitted, "Split already committed.");
    s.splitCommitted = true;
  } else if (op === "hook-fee") {
    arity(1);
    const fee = raw(a[0]);
    check(fee < 1000000n, "Hook fee too large.");
    if (s.hookPolicy)
      check(
        fee <= s.hookPolicy.maximum &&
          (!s.hookPolicy.exact || fee === s.hookPolicy.maximum),
        "Fee violates the committed policy.",
      );
    s.model.hookFee = Number(fee);
  } else if (op === "commit-hook") {
    arity(2);
    check(!s.hookPolicy, "Hook already committed.");
    const maximum = raw(a[0]),
      exact = a[1] === "exact";
    check(a[1] === "exact" || a[1] === "ceiling", "Choose exact or ceiling.");
    check(
      BigInt(s.model.hookFee) <= maximum &&
        maximum < 1000000n &&
        (!exact || BigInt(s.model.hookFee) === maximum),
      "Current rate does not fit the promised policy.",
    );
    s.hookPolicy = { maximum, exact };
  } else if (op === "advance") {
    arity(1);
    const n = raw(a[0]);
    check(n <= 315360000n, "Advance at most ten years.");
    s.now += Number(n);
  } else if (op === "allocate") {
    arity(7);
    const [from, to, asset, value, start, cliff, end] = a;
    check(
      [...ASSETS, "shares"].includes(asset),
      "Allocation asset is token, quote or shares.",
    );
    const n = asset === "shares" ? raw(value) : amount(s, value, asset),
      id = s.locks.length + 1,
      escrow = `lock:${id}`,
      begins = Number(raw(start)),
      cliffs = Number(raw(cliff)),
      ends = Number(raw(end));
    check(
      n > 0n &&
        begins <= cliffs &&
        cliffs <= ends &&
        ends > begins &&
        ends <= 315360000,
      "Invalid vesting schedule.",
    );
    if (asset === "shares") transferShares(s, name(from), escrow, n);
    else {
      take(actor(s, name(from)), asset, n);
      add(actor(s, escrow), asset, n);
    }
    s.locks.push({
      id,
      from: name(from),
      beneficiary: name(to),
      asset,
      amount: n,
      released: 0n,
      start: begins,
      cliff: cliffs,
      end: ends,
      escrow,
    });
    result.lockId = id;
  } else if (op === "release") {
    arity(1);
    const l = s.locks[Number(raw(a[0])) - 1];
    check(l, "Unknown vesting allocation.");
    const vested =
        s.now < l.cliff
          ? 0n
          : s.now >= l.end
            ? l.amount
            : (l.amount * BigInt(s.now - l.start)) / BigInt(l.end - l.start),
      n = vested - l.released;
    check(n > 0n, "No vested allocation is releasable.");
    if (l.asset === "shares") transferShares(s, l.escrow, l.beneficiary, n);
    else {
      take(actor(s, l.escrow), l.asset, n);
      add(actor(s, l.beneficiary), l.asset, n);
    }
    l.released += n;
    result.released = n;
  } else if (op === "exit") {
    arity(10);
    const [
      from,
      to,
      asset,
      value,
      min,
      parts,
      start,
      interval,
      expires,
      reward,
    ] = a;
    check(ASSETS.includes(asset), "Exit asset is token or quote.");
    const n = amount(s, value, asset),
      minimum = amount(s, min, asset === "token" ? "quote" : "token"),
      slices = Number(raw(parts)),
      begins = Number(raw(start)),
      every = Number(raw(interval)),
      end = Number(raw(expires)),
      fee = units(reward, 18, { zero: true }),
      id = s.exits.length + 1,
      escrow = `exit:${id}`,
      owner = name(from);
    check(
      slices > 0 &&
        slices <= 10000 &&
        n >= BigInt(slices) &&
        every > 0 &&
        begins >= s.now &&
        end >= begins + every * (slices - 1) &&
        end <= 315360000,
      "Invalid exit schedule.",
    );
    take(actor(s, owner), asset, n);
    add(actor(s, escrow), asset, n);
    take(actor(s, owner), "native", fee * BigInt(slices));
    add(actor(s, escrow), "native", fee * BigInt(slices));
    s.exits.push({
      id,
      owner,
      beneficiary: name(to),
      asset,
      total: n,
      remaining: n,
      minimum,
      slices,
      executed: 0,
      start: begins,
      interval: every,
      expires: end,
      reward: fee,
      paused: false,
      cancelled: false,
      escrow,
    });
    result.exitId = id;
  } else if (op === "execute") {
    arity(2);
    const p = s.exits[Number(raw(a[0])) - 1];
    check(
      p && !p.cancelled && !p.paused && p.remaining > 0n,
      "Exit is not executable.",
    );
    check(
      s.now >= p.start + p.interval * p.executed && s.now <= p.expires,
      "Exit is not due or has expired.",
    );
    const n =
        p.executed + 1 === p.slices ? p.remaining : p.total / BigInt(p.slices),
      minimum = ceil(n * p.minimum, p.total);
    result.trade = trade(
      s,
      p.escrow,
      p.asset === "quote" ? "buy" : "sell",
      n,
      minimum,
      p.beneficiary,
    );
    take(actor(s, p.escrow), "native", p.reward);
    add(actor(s, name(a[1])), "native", p.reward);
    p.remaining -= n;
    p.executed++;
  } else if (op === "pause" || op === "resume" || op === "cancel") {
    arity(2);
    const p = s.exits[Number(raw(a[1])) - 1];
    check(
      p && !p.cancelled && p.owner === name(a[0]),
      "Only the creating owner can control this exit.",
    );
    if (op === "cancel") {
      const escrow = actor(s, p.escrow),
        owner = actor(s, p.owner);
      take(escrow, p.asset, p.remaining);
      add(owner, p.asset, p.remaining);
      add(owner, "native", escrow.native);
      escrow.native = 0n;
      p.remaining = 0n;
      p.cancelled = true;
    } else p.paused = op === "pause";
  } else throw Error("Unknown economic event.");
  economicsConservation(s);
  return result;
}
export function replayEconomics(d, text, { model } = {}) {
  let state = initialEconomics(d, { model });
  const history = [];
  check(
    typeof text === "string" && text.length <= 24000,
    "Keep the sequence below 24,000 characters.",
  );
  const lines = text
    .split(/\r?\n/)
    .map((text, i) => ({ text: text.trim(), line: i + 1 }))
    .filter((x) => x.text && !x.text.startsWith("#"));
  check(lines.length <= 250, "Use at most 250 events.");
  for (const e of lines) {
    const next = structuredClone(state);
    try {
      const result = applyEconomics(next, e.text);
      state = next;
      history.push({
        ...e,
        ...result,
        status: "applied",
        conservation: economicsConservation(state),
      });
    } catch (error) {
      history.push({ ...e, status: "rejected", error: error.message });
      break;
    }
  }
  return {
    scope: ECONOMICS_SCOPE,
    state,
    history,
    complete: history.every((e) => e.status === "applied"),
    conservation: economicsConservation(state),
  };
}
export const economyJSON = (value) =>
  JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? String(v) : v)),
  );
