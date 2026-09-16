import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import {
  BrowserProvider,
  ContractFactory,
  parseUnits,
  formatUnits,
} from "ethers";
import { AUCTION_ARTIFACT } from "../../web/launchpad/auction-artifacts.mjs";
import {
  initialAuctionEconomics,
  applyAuctionEconomics,
  replayAuctionEconomics,
  auctionEconomicsConservation,
} from "../../web/launchpad/economics-auction.mjs";
import { economyJSON } from "../../web/launchpad/economics-engine.mjs";
import { EconomicsDesk } from "../../web/launchpad/economics.mjs";
const wei = (n) => formatUnits(BigInt(n), 18);
test("ANIMA auction model reconciles every actual checkpoint, cancel, refund, proceeds and unsold token claim", async (t) => {
  const rpc = ganache.provider({
      chain: { chainId: 31337, hardfork: "shanghai" },
      wallet: { totalAccounts: 4 },
      logging: { quiet: true },
    }),
    provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 10;
  t.after(async () => {
    provider.destroy();
    await rpc.disconnect();
  });
  const signers = await Promise.all(
      [0, 1, 2].map((i) => provider.getSigner(i)),
    ),
    addresses = await Promise.all(signers.map((s) => s.getAddress()));
  const a = JSON.parse(
      fs.readFileSync(
        new URL("../../contracts/artifacts/GenesisToken.json", import.meta.url),
      ),
    ),
    token = await new ContractFactory(a.abi, a.bytecode, signers[0]).deploy(
      "Auction model",
      "AM",
      parseUnits("1000", 18),
      addresses[0],
    );
  await token.waitForDeployment();
  const start =
      Number(BigInt(await rpc.request({ method: "eth_blockNumber" }))) + 20,
    end = start + 30;
  const c = await new ContractFactory(
    AUCTION_ARTIFACT.abi,
    AUCTION_ARTIFACT.bytecode,
    signers[0],
  ).deploy(addresses[0], token.target, parseUnits("10", 18), 30, start, end, 2);
  await c.waitForDeployment();
  const state = initialAuctionEconomics({
    lotSize: "10",
    totalLots: "30",
    reservePrice: wei(2),
    auctionStartBlock: String(start),
    auctionEndBlock: String(end),
  });
  applyAuctionEconomics(state, "fund-quote alice " + wei(1000));
  applyAuctionEconomics(state, "fund-quote bob " + wei(1000));
  const names = ["creator", "alice", "bob"];
  async function compare() {
    for (const field of [
      "soldLots",
      "sequence",
      "lastClearingPrice",
      "sellerCredit",
      "outstandingQuote",
      "outstandingTokens",
    ])
      assert.equal(state[field], await c[field](), field);
    assert.equal(state.closed, await c.closed());
    assert.equal(state.funded, await c.funded());
    assert.equal(state.vaultToken, await token.balanceOf(c.target));
    assert.equal(state.vaultQuote, await provider.getBalance(c.target));
    for (let i = 0; i < 3; i++) {
      assert.equal(
        state.tokenClaims[names[i]] || 0n,
        await c.tokenClaims(addresses[i]),
        names[i] + " token claim",
      );
      assert.equal(
        state.refunds[names[i]] || 0n,
        await c.refunds(addresses[i]),
        names[i] + " refund",
      );
    }
    for (let i = 0; i < 4; i++) {
      const actual = await c.bids(i),
        expected = state.bids[i];
      assert.equal(actual.remainingLots, expected?.remaining || 0n);
      assert.equal(actual.escrow, expected?.escrow || 0n);
      assert.equal(actual.sequence, expected?.sequence || 0n);
    }
    assert.equal(auctionEconomicsConservation(state).balanced, true);
  }
  async function send(p, event) {
    const r = await (await p).wait();
    applyAuctionEconomics(state, "at " + r.blockNumber);
    applyAuctionEconomics(state, event);
    await compare();
    return r;
  }
  async function mineBefore(n) {
    while (
      Number(BigInt(await rpc.request({ method: "eth_blockNumber" }))) <
      n - 1
    )
      await rpc.request({ method: "evm_mine", params: [] });
  }
  await (await token.approve(c.target, parseUnits("300", 18))).wait();
  await send(c.fund(), "fund creator");
  await mineBefore(start);
  await send(
    c.connect(signers[1]).bid(12, 5, { value: 60 }),
    "bid alice 12 " + wei(5),
  );
  await send(
    c.connect(signers[2]).bid(12, 4, { value: 48 }),
    "bid bob 12 " + wei(4),
  );
  await mineBefore(start + 8);
  await send(c.checkpoint(), "checkpoint");
  await send(c.connect(signers[1]).cancel(0, 1), "cancel alice 0 1");
  await mineBefore(end);
  await send(c.checkpoint(), "checkpoint");
  assert.ok(
    state.tokenClaims.creator > 0n,
    "Unsold lots return to the seller as a token claim.",
  );
  for (let i = 0; i < 3; i++)
    if (state.tokenClaims[names[i]] > 0n)
      await send(
        c.connect(signers[i]).claimTokens(addresses[i]),
        "claim-tokens " + names[i],
      );
  for (let i = 1; i < 3; i++)
    if (state.refunds[names[i]] > 0n)
      await send(
        c.connect(signers[i]).claimRefund(addresses[i]),
        "claim-refund " + names[i],
      );
  await send(c.claimProceeds(addresses[0]), "claim-proceeds creator");
  assert.equal(state.vaultQuote, 0n);
  assert.equal(state.vaultToken, 0n);
});
test("auction equal-price priority, stale cancellation and failed actions preserve prior finalized allocations", () => {
  const d = {
      lotSize: "1",
      totalLots: "10",
      reservePrice: "0.1",
      auctionStartBlock: "10",
      auctionEndBlock: "20",
    },
    prefix =
      "fund creator\nfund-quote alice 10\nfund-quote bob 10\nat 10\nbid alice 5 0.2\nbid bob 5 0.2\nat 13\ncheckpoint";
  const before = replayAuctionEconomics(d, prefix);
  assert.equal(before.complete, true);
  assert.equal(before.state.tokenClaims.alice, parseUnits("3"));
  assert.equal(before.state.tokenClaims.bob || 0n, 0n);
  const failed = replayAuctionEconomics(
    d,
    prefix + "\ncancel bob 0 1\nat 20\ncheckpoint",
  );
  assert.equal(failed.complete, false);
  assert.deepEqual(economyJSON(failed.state), economyJSON(before.state));
  assert.match(failed.history.at(-1).error, /another bidder/);
  const refund = replayAuctionEconomics(
    d,
    "fund creator\ncancel-before-start creator\nclaim-tokens creator",
  );
  assert.equal(refund.complete, true);
  assert.equal(refund.state.accounts.creator.token, parseUnits("10"));
  assert.equal(refund.state.vaultToken, 0n);
});
test("economics mechanism selector exposes successful community and streaming-auction lifecycle examples", () => {
  const desk = new EconomicsDesk();
  for (const kind of ["sale", "auction"]) {
    desk.chooseMechanism(kind);
    assert.equal(desk.run().complete, true);
    assert.match(desk.render(), /Every tracked token and ETH unit/);
  }
  assert.match(desk.render(), /not Uniswap CCA or Doppler/);
});
