import { units } from "./model.mjs";
const ensure = (ok, message) => {
    if (!ok) throw Error(message);
  },
  sum = (a) => a.reduce((x, y) => x + y, 0n);
const raw = (v, max = (1n << 64n) - 1n) => {
  ensure(/^\d+$/.test(String(v)), "Use a whole number.");
  const n = BigInt(v);
  ensure(n <= max, "Value exceeds the contract field.");
  return n;
};
const person = (id) => {
  ensure(
    /^[A-Za-z][\w:.-]{0,80}$/.test(String(id)),
    "Use a short participant name.",
  );
  return String(id);
};
const balance = (s, id) =>
  s.accounts[id] || (s.accounts[id] = { token: 0n, quote: 0n });
export const AUCTION_ECONOMICS_SCOPE =
  "Exact integer lifecycle replay of ANIMA’s ContinuousClearingAuction.sol. Each bid/cancel checkpoints first; lots stream by block, standing bids sort by price then sequence, and a checkpoint uses one clearing price. Token inventory, bid escrow, seller proceeds, refunds and claims are conserved. This is ANIMA’s mechanism, not Uniswap CCA or Doppler.";
export function initialAuctionEconomics(d = {}) {
  const lotSize = units(d.lotSize || "100"),
    totalLots = raw(d.totalLots || "1000"),
    start = raw(d.auctionStartBlock || "10"),
    end = raw(d.auctionEndBlock || "110"),
    reserve = units(d.reservePrice || "0.001"),
    inventory = lotSize * totalLots;
  ensure(
    totalLots > 0n &&
      start > 0n &&
      end > start &&
      end - start <= 10000000n &&
      reserve < 1n << 96n &&
      inventory < 1n << 112n,
    "Invalid auction terms.",
  );
  return {
    terms: { lotSize, totalLots, start, end, reserve, inventory },
    block: 0n,
    accounts: { creator: { token: inventory, quote: 0n } },
    quoteIntroduced: 0n,
    vaultToken: 0n,
    vaultQuote: 0n,
    funded: false,
    closed: false,
    soldLots: 0n,
    sequence: 0n,
    lastClearingPrice: 0n,
    sellerCredit: 0n,
    outstandingQuote: 0n,
    outstandingTokens: 0n,
    bids: Array(64).fill(null),
    refunds: {},
    tokenClaims: {},
    fills: [],
  };
}
export function auctionEconomicsConservation(s) {
  const token =
      sum(Object.values(s.accounts).map((a) => a.token)) + s.vaultToken,
    quote = sum(Object.values(s.accounts).map((a) => a.quote)) + s.vaultQuote,
    liabilities =
      s.sellerCredit +
      sum(Object.values(s.refunds)) +
      sum(s.bids.filter(Boolean).map((b) => b.escrow)),
    tokenClaims = sum(Object.values(s.tokenClaims));
  ensure(
    token === s.terms.inventory,
    "Auction token inventory is not conserved.",
  );
  ensure(quote === s.quoteIntroduced, "Auction ETH is not conserved.");
  ensure(
    liabilities === s.vaultQuote && s.outstandingQuote === s.vaultQuote,
    "Auction ETH liabilities do not match custody.",
  );
  ensure(
    tokenClaims === s.outstandingTokens && tokenClaims <= s.vaultToken,
    "Auction token claims exceed custody.",
  );
  for (const a of Object.values(s.accounts))
    ensure(a.token >= 0n && a.quote >= 0n, "Negative auction account balance.");
  return {
    balanced: true,
    token: { total: token, expected: s.terms.inventory },
    quote: { total: quote, expected: s.quoteIntroduced },
    quoteLiabilities: liabilities,
    outstandingTokens: tokenClaims,
  };
}
function checkpoint(s) {
  if (!s.funded || s.closed || s.block <= s.terms.start) return [];
  const released =
    s.block >= s.terms.end
      ? s.terms.totalLots
      : (s.terms.totalLots * (s.block - s.terms.start)) /
        (s.terms.end - s.terms.start);
  let available = released - s.soldLots;
  const order = s.bids
    .map((bid, slot) => ({ bid, slot }))
    .filter((x) => x.bid)
    .sort((a, b) =>
      a.bid.limit === b.bid.limit
        ? a.bid.sequence < b.bid.sequence
          ? -1
          : 1
        : a.bid.limit > b.bid.limit
          ? -1
          : 1,
    );
  let demand = 0n,
    price = s.terms.reserve;
  for (const { bid } of order) {
    demand += bid.remaining;
    if (available !== 0n && demand >= available) {
      price = bid.limit;
      break;
    }
  }
  if (demand < available) price = s.terms.reserve;
  const fills = [];
  if (available !== 0n && order.length) {
    for (const { bid, slot } of order) {
      if (available === 0n) break;
      const lots = bid.remaining < available ? bid.remaining : available,
        cost = lots * price,
        tokens = lots * s.terms.lotSize;
      ensure(cost <= bid.escrow, "Clearing cost exceeds bid escrow.");
      bid.remaining -= lots;
      bid.escrow -= cost;
      available -= lots;
      s.soldLots += lots;
      s.sellerCredit += cost;
      s.tokenClaims[bid.bidder] = (s.tokenClaims[bid.bidder] || 0n) + tokens;
      s.outstandingTokens += tokens;
      const fill = {
        sequence: bid.sequence,
        bidder: bid.bidder,
        lots,
        price,
        cost,
        tokens,
        block: s.block,
      };
      fills.push(fill);
      s.fills.push(fill);
      if (bid.remaining === 0n) {
        s.refunds[bid.bidder] = (s.refunds[bid.bidder] || 0n) + bid.escrow;
        s.bids[slot] = null;
      }
    }
    s.lastClearingPrice = price;
  }
  if (s.block >= s.terms.end) {
    s.closed = true;
    for (let i = 0; i < 64; i++) {
      const bid = s.bids[i];
      if (bid) {
        s.refunds[bid.bidder] = (s.refunds[bid.bidder] || 0n) + bid.escrow;
        s.bids[i] = null;
      }
    }
    const unsold = (s.terms.totalLots - s.soldLots) * s.terms.lotSize;
    s.tokenClaims.creator = (s.tokenClaims.creator || 0n) + unsold;
    s.outstandingTokens += unsold;
  }
  return fills;
}
export function applyAuctionEconomics(s, text) {
  const [op, ...a] = String(text).trim().split(/\s+/),
    arity = (n) => ensure(a.length === n, `${op} expects ${n} arguments.`),
    result = { kind: op };
  if (op === "fund-quote") {
    arity(2);
    const n = units(a[1]);
    balance(s, person(a[0])).quote += n;
    s.quoteIntroduced += n;
  } else if (op === "fund") {
    arity(1);
    ensure(
      a[0] === "creator" && !s.funded && !s.closed && s.block < s.terms.start,
      "Only the seller can fund once before start.",
    );
    const owner = balance(s, "creator");
    ensure(owner.token >= s.terms.inventory, "Seller lacks the inventory.");
    owner.token -= s.terms.inventory;
    s.vaultToken += s.terms.inventory;
    s.funded = true;
  } else if (op === "advance") {
    arity(1);
    s.block += raw(a[0]);
  } else if (op === "at") {
    arity(1);
    const n = raw(a[0]);
    ensure(n >= s.block, "Block number cannot move backward.");
    s.block = n;
  } else if (op === "bid") {
    arity(3);
    const id = person(a[0]),
      lots = raw(a[1]),
      limit = units(a[2]),
      value = lots * limit;
    ensure(
      s.funded &&
        !s.closed &&
        s.block >= s.terms.start &&
        s.block < s.terms.end &&
        lots > 0n &&
        lots <= s.terms.totalLots &&
        limit >= s.terms.reserve &&
        limit < 1n << 96n &&
        value < 1n << 112n,
      "Invalid bid terms or auction phase.",
    );
    ensure(
      balance(s, id).quote >= value,
      "Bidder does not hold enough scenario ETH.",
    );
    result.fills = checkpoint(s);
    const slot = s.bids.findIndex((x) => x === null);
    ensure(slot >= 0, "All 64 standing-order slots are occupied.");
    s.sequence++;
    s.bids[slot] = {
      bidder: id,
      remaining: lots,
      limit,
      escrow: value,
      sequence: s.sequence,
    };
    balance(s, id).quote -= value;
    s.vaultQuote += value;
    s.outstandingQuote += value;
    result.slot = slot;
    result.sequence = s.sequence;
  } else if (op === "cancel") {
    arity(3);
    const id = person(a[0]),
      slot = Number(raw(a[1], 63n)),
      sequence = raw(a[2]),
      bid = s.bids[slot];
    ensure(
      bid && bid.bidder === id && bid.sequence === sequence,
      "Stale slot or another bidder’s order.",
    );
    result.fills = checkpoint(s);
    const remaining = s.bids[slot];
    if (remaining) {
      s.refunds[id] = (s.refunds[id] || 0n) + remaining.escrow;
      s.bids[slot] = null;
      result.refund = remaining.escrow;
    }
  } else if (op === "checkpoint") {
    arity(0);
    result.fills = checkpoint(s);
  } else if (op === "cancel-before-start") {
    arity(1);
    ensure(
      a[0] === "creator" && !s.closed && s.block < s.terms.start,
      "Only the seller can cancel before start.",
    );
    s.closed = true;
    if (s.funded) {
      s.tokenClaims.creator = (s.tokenClaims.creator || 0n) + s.terms.inventory;
      s.outstandingTokens += s.terms.inventory;
    }
  } else if (
    op === "claim-tokens" ||
    op === "claim-refund" ||
    op === "claim-proceeds"
  ) {
    ensure(a.length === 1 || a.length === 2, "Claim: account [recipient].");
    const id = person(a[0]),
      to = person(a[1] || id);
    if (op === "claim-tokens") {
      const n = s.tokenClaims[id] || 0n;
      ensure(n > 0n, "No token claim.");
      s.tokenClaims[id] = 0n;
      s.outstandingTokens -= n;
      s.vaultToken -= n;
      balance(s, to).token += n;
      result.amount = n;
    } else if (op === "claim-refund") {
      const n = s.refunds[id] || 0n;
      ensure(n > 0n, "No refund claim.");
      s.refunds[id] = 0n;
      s.outstandingQuote -= n;
      s.vaultQuote -= n;
      balance(s, to).quote += n;
      result.amount = n;
    } else {
      ensure(id === "creator", "Only seller may claim proceeds.");
      const n = s.sellerCredit;
      ensure(n > 0n, "No seller proceeds.");
      s.sellerCredit = 0n;
      s.outstandingQuote -= n;
      s.vaultQuote -= n;
      balance(s, to).quote += n;
      result.amount = n;
    }
  } else throw Error("Unknown auction lifecycle event.");
  auctionEconomicsConservation(s);
  return result;
}
export function replayAuctionEconomics(d, text) {
  let state = initialAuctionEconomics(d);
  const history = [];
  ensure(
    typeof text === "string" && text.length <= 24000,
    "Keep the sequence below 24,000 characters.",
  );
  const lines = text
    .split(/\r?\n/)
    .map((text, i) => ({ text: text.trim(), line: i + 1 }))
    .filter((x) => x.text && !x.text.startsWith("#"));
  ensure(lines.length <= 250, "Use at most 250 events.");
  for (const e of lines) {
    const next = structuredClone(state);
    try {
      const result = applyAuctionEconomics(next, e.text);
      state = next;
      history.push({
        ...e,
        ...result,
        status: "applied",
        block: state.block,
        conservation: auctionEconomicsConservation(state),
      });
    } catch (error) {
      history.push({ ...e, status: "rejected", error: error.message });
      break;
    }
  }
  return {
    mechanism: "anima-auction",
    scope: AUCTION_ECONOMICS_SCOPE,
    state,
    history,
    complete: history.every((e) => e.status === "applied"),
    conservation: auctionEconomicsConservation(state),
  };
}
