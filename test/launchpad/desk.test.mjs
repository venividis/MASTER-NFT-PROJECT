// Semantic UI routing checks only. Fixtures are never submitted or described as deployed evidence.
// Real contract deployment, accounting and signature lifecycles are exercised by the separate EVM tests.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { LaunchDesk } from "../../web/launchpad/desk.mjs";
import { defaults } from "../../web/launchpad/model.mjs";
import { ZeroAddress } from "../../web/vendor/ethers.min.js";
const addr = (n) => "0x" + n.toString(16).padStart(40, "0");
const [
  account,
  recipient,
  manager,
  factory,
  router,
  quote,
  saleLaunchpad,
  positionAddress,
  auctionAddress,
  importedAuction,
] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(addr);
class RoutingChain {
  constructor() {
    this.generation = 0;
    this.address = account;
    this.chainId = 1n;
    this.config = { chainId: 1, manager, factory, router, saleLaunchpad };
    this.records = [];
    this.calls = [];
    this.plan = null;
    this.review = null;
    this.busy = false;
    this.error = null;
    this.storage = null;
    this.provider = {
      getBlock: async () => ({ number: 100, timestamp: 1800000000 }),
    };
  }
  getState() {
    return {
      connected: !!this.address,
      address: this.address,
      chainId: Number(this.chainId),
      network: "Ethereum",
      config: this.config,
      plan: this.plan,
      review: this.review,
      busy: this.busy,
      error: this.error,
      pending: null,
      records: this.records,
      payer: this.payer,
      execution: this.execution,
    };
  }
  invalidate() {
    this.generation++;
    this.plan = null;
    this.review = null;
  }
  async assertContext(g = this.generation) {
    if (g !== this.generation) throw Error("Wallet context or draft changed.");
  }
  async readToken(address) {
    return {
      address,
      symbol: "WETH",
      decimals: 18,
      balance: "100000000000000000000",
      formattedBalance: "100",
    };
  }
  async prepareLaunch(input) {
    this.calls.push({ method: "prepareLaunch", input });
    return input;
  }
  get payer() {
    return this.nft?.account || this.address;
  }
  get execution() {
    return this.nft
      ? {
          mode: "nft",
          payer: this.nft.account,
          tokenId: String(this.nft.tokenId),
        }
      : { mode: "wallet", payer: this.address };
  }
  async useNFT(identity) {
    this.nft = { ...identity, account: identity.account || positionAddress };
    this.invalidate();
    return this.getState();
  }
  useWallet() {
    this.nft = null;
    this.invalidate();
    return this.getState();
  }
  async prepareExternal(plan, options) {
    this.calls.push({ method: "prepareExternal", plan, options });
    return plan;
  }
  async connect() {
    this.calls.push({ method: "connect" });
    return this.getState();
  }
  persist() {
    this.calls.push({ method: "persist" });
  }
  pending() {
    return null;
  }
}
const setup = () => {
  const chain = new RoutingChain();
  return { chain, desk: new LaunchDesk({ chain, storage: null }) };
};
test("shared receipt recovery updates official participant links and retries an interrupted read", async () => {
  const { chain, desk } = setup();
  const record = {
    kind: "official-cca-create", status: "confirmed", final: true,
    chainId: 1, hash: "0xcca", blockHash: "0xblock1",
  };
  chain.records.push(record);
  const receipt = { hash: record.hash, logs: [] };
  chain.provider.getTransactionReceipt = async () => receipt;
  let attempts = 0;
  desk.protocolsDesk.receipt = async result => {
    attempts++;
    assert.equal(result.receipt, receipt);
    if (attempts === 1) throw Error("RPC read interrupted");
  };
  await assert.rejects(desk.reconcile(), /RPC read interrupted/);
  await desk.reconcile();
  await desk.reconcile();
  assert.equal(attempts, 2);
  record.blockHash = "0xblock2";
  await desk.reconcile();
  assert.equal(attempts, 3);
});
test("shared recovery applies lifecycle setup and invalidates reorganized official state", async () => {
  const { chain, desk } = setup();
  const setupRecord = {kind: "lifecycle-setup", status: "confirmed", final: true, chainId: 1, hash: "0xsetup"};
  const reorgRecord = {kind: "official-setup", status: "pending", reorgs: 1, chainId: 1, hash: "0xold"};
  chain.records.push(setupRecord, reorgRecord);
  desk.reconciledProtocols = new Set(["1:0xold:0xblock"]);
  const applied = [], rolledBack = [];
  desk.lifecycleDesk.applyReceipt = async r => applied.push(r);
  desk.protocolsDesk.rollback = r => rolledBack.push(r);
  await desk.reconcile();
  assert.deepEqual(applied, [setupRecord]);
  assert.deepEqual(rolledBack, [reorgRecord]);
  assert.equal(desk.reconciledProtocols.size, 0);
});
const draft = (overrides) => ({
  ...defaults(),
  quoteToken: quote,
  recipients: [
    {
      recipient: account,
      label: "Founder",
      weight: "1",
      outputToken: ZeroAddress,
    },
  ],
  ...overrides,
});
const token = (address, symbol, decimals = 18) => ({
  address,
  symbol,
  decimals,
  balance: "0",
  formattedBalance: "0",
});
const positionFixture = () => ({
  position: positionAddress,
  factory,
  poolId: "0x" + "1".repeat(64),
  shares: "1000000000000000000",
  formattedShares: "1",
  totalSupply: "1000000000000000000",
  liquidity: "1000000000000000000",
  tickLower: -600,
  tickUpper: 600,
  tick: 0,
  sqrtPriceX96: "79228162514264337593543950336",
  key: {
    currency0: quote,
    currency1: recipient,
    fee: 3000,
    tickSpacing: 60,
    hooks: ZeroAddress,
  },
  token0: token(quote, "QUOTE", 6),
  token1: token(recipient, "TOKEN"),
  preview: {
    amount0: "1250000",
    amount1: "2000000000000000000",
    formatted0: "1.25",
    formatted1: "2",
    includes: "Current liquidity principal and proportional earned fees",
  },
  blockNumber: 100,
});
const saleFixture = () => ({
  id: "1",
  name: "Fixture Community",
  symbol: "FIX",
  about: "<script>must be escaped</script>",
  token: recipient,
  creator: account,
  identity: "0",
  supply: "1000000000000000000000000",
  raised: "2000000000000000000",
  softCap: "1000000000000000000",
  hardCap: "4000000000000000000",
  opens: 1800000000,
  closes: 1800086400,
  status: 1,
  phase: "funding",
  room: "1",
  publicTokens: "450000000000000000000000",
  lpTokens: "450000000000000000000000",
  founderTokens: "100000000000000000000000",
  liquidityBps: 10000,
  vestingSeconds: 15552000,
  vestingDays: 180,
  founderLock: null,
  treasuryLock: null,
  account,
  contribution: "500000000000000000",
  claimed: false,
  claimable: "0",
  claimAsset: recipient,
  contributionPrice: {
    native: "2000000000000000000",
    tokens: "450000000000000000000000",
  },
  formatted: {
    supply: "1000000",
    raised: "2",
    softCap: "1",
    hardCap: "4",
    publicTokens: "450000",
    lpTokens: "450000",
    founderTokens: "100000",
    contribution: "0.5",
    claimable: "0",
  },
  actions: { contribute: true, withdraw: true, settle: false, claim: false },
  launchpad: saleLaunchpad,
  ledger: addr(11),
  market: addr(12),
  vault: addr(13),
  collection: addr(14),
  chainId: 1,
  blockNumber: 100,
  blockHash: "0x" + "2".repeat(64),
  timestamp: 1800000000,
});
const auctionFixture = () => ({
  kind: "auction",
  target: auctionAddress,
  owner: account,
  block: "0x64",
  blockHash: "0x" + "2".repeat(64),
  auction: auctionAddress,
  label: "ANIMA streaming auction",
  currentBlock: "100",
  phase: "active",
  funded: true,
  closed: false,
  token: token(quote, "QUOTE", 6),
  state: {
    funded: "1",
    closed: "0",
    totalLots: "1000",
    soldLots: "2",
    releasedLots: "4",
    startBlock: "90",
    endBlock: "1000",
    reservePrice: "1000000000000000",
    lastClearingPrice: "1000000000000000",
    sellerCredit: "2000000000000000",
    outstandingQuote: "0",
    outstandingTokens: "200000000",
    refunds: "1000000000000000",
    tokenClaims: "200000000",
    seller: account,
    saleToken: quote,
    lotSize: "100000000",
    bids: [],
  },
  terms: {
    seller: account,
    saleToken: quote,
    lotSize: "100000000",
    totalLots: "1000",
    startBlock: "90",
    endBlock: "1000",
    reservePrice: "1000000000000000",
  },
  inventory: "100000",
  lotTokens: "100",
  reservePerLot: "0.001",
  activeBids: [],
  ownBids: [
    {
      slot: 0,
      bidder: account,
      remainingLots: "2",
      limitPrice: "1000000000000000",
      escrow: "2000000000000000",
      sequence: "1",
    },
  ],
  availableSlots: 63,
  claims: {
    tokens: "200000000",
    refund: "1000000000000000",
    proceeds: "2000000000000000",
  },
  disclosure: "Standing quantity-limit bids; no automatic liquidity migration.",
});

test("all launch tabs render the verified clients’ actual result shapes without changing object controls", () => {
  const { desk } = setup();
  desk.position = positionFixture();
  desk.sale = saleFixture();
  desk.saleList = [desk.sale];
  desk.saleNext = "2";
  desk.auction = auctionFixture();
  desk.hookInfo = {
    hook: addr(15),
    owner: account,
    feePpm: 5000n,
    recipient,
    viaSplitter: true,
    formattedAccrued: "1 QUOTE",
  };
  desk.splitterInfo = { formattedClaimable: "0.5 QUOTE" };
  for (const tab of [
    "create",
    "positions",
    "sales",
    "auction",
    "fees",
    "locks",
    "private",
    "settings",
  ]) {
    desk.tab = tab;
    const html = desk.render({ seed: "unchanged-object-seed" });
    assert.match(html, /class="ld-desk"/);
    assert.match(
      html,
      new RegExp('data-ld="tab:' + tab + '" aria-current="page"'),
    );
    assert.doesNotMatch(html, /\bNaN\b|\[object Object\]|>undefined</);
    if (tab === "sales") {
      assert.match(html, /Fixture Community/);
      assert.match(html, /&lt;script&gt;/);
      assert.doesNotMatch(html, /<script>/);
      assert.match(html, /data-ld="sale-contribute"/);
      assert.doesNotMatch(html, /data-ld="sale-settle"/);
    }
    if (tab === "auction") {
      assert.match(html, /200(?:\.0)? QUOTE/);
      assert.match(html, /auction-cancel:0:1/);
      assert.match(html, /data-ld="auction-bid"/);
    }
  }
  const source = fs.readFileSync(
    new URL("../../web/launchpad/desk.mjs", import.meta.url),
    "utf8",
  );
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
    (m) => m[1],
  );
  assert.ok(
    imports.every(
      (s) => !/(?:interior|original-runtime|camera|gestures|controls)/.test(s),
    ),
  );
});

test("public pool routing preserves human amounts and converts only fee units", async () => {
  const { desk, chain } = setup();
  const input = draft({
    name: "Routing fixture",
    symbol: "RTE",
    supply: "1234567.89",
    tokenBudget: "450000.123",
    quoteBudget: "2.75",
    price: "0.000006",
    feePercent: "0.47",
    range: "custom",
    lowerPrice: "0.000002",
    upperPrice: "0.000018",
    tickSpacing: "10",
  });
  await desk.prepareDraft(input);
  assert.equal(desk.error, false, desk.message);
  assert.equal(chain.calls.length, 1);
  const got = chain.calls[0];
  assert.equal(got.method, "prepareLaunch");
  assert.deepEqual(
    { ...got.input, salt: undefined },
    {
      name: input.name,
      symbol: input.symbol,
      supply: input.supply,
      quoteToken: quote,
      tokenBudget: input.tokenBudget,
      quoteBudget: input.quoteBudget,
      price: input.price,
      fee: 4700,
      tickSpacing: 10,
      range: { lower: input.lowerPrice, upper: input.upperPrice },
      salt: undefined,
    },
  );
  assert.match(got.input.salt, /^0x[0-9a-f]{64}$/);
  assert.deepEqual(desk.continueDraft, input);
});

test("metadata mismatch stops a public launch and exposes the actual quote units for review", async () => {
  const { desk, chain } = setup();
  chain.readToken = async (address) => ({
    address,
    symbol: "USDC",
    decimals: 6,
    balance: "10000000",
    formattedBalance: "10",
  });
  await desk.prepareDraft(draft());
  assert.equal(chain.calls.length, 0);
  assert.equal(desk.error, true);
  assert.equal(desk.studio.d.quoteSymbol, "USDC");
  assert.equal(desk.studio.d.quoteDecimals, "6");
  assert.match(desk.message, /review price and budgets/i);
});
test("ordinary pool preparation rejects a draft changed during the metadata read", async () => {
  const { desk, chain } = setup();
  let finish, started;
  const reading = new Promise((resolve) => (started = resolve));
  const read = new Promise((resolve) => (finish = resolve));
  chain.readToken = async (address) => {
    started();
    await read;
    return { address, symbol: "WETH", decimals: 18 };
  };
  const preparing = desk.prepareDraft(draft());
  await reading;
  chain.invalidate();
  finish();
  await preparing;
  assert.equal(
    chain.calls.length,
    0,
    "Stale terms must not reach the launch builder.",
  );
  assert.equal(desk.error, true);
  assert.match(desk.message, /context or draft changed/);
});

test("temporary composer disable state is released after a failed preparation", () => {
  const { desk } = setup(),
    button = { dataset: {}, disabled: true };
  desk.root = { querySelector: () => null, querySelectorAll: () => [button] };
  desk.working = true;
  desk.refreshStatus();
  assert.equal(button.disabled, true);
  desk.working = false;
  desk.refreshStatus();
  button.disabled = false;
  desk.refreshStatus();
  assert.equal(
    button.disabled,
    false,
    "A later state refresh must not permanently disable the composer’s retry action.",
  );
});

test("community sale routing preserves raise amounts, basis points and vesting days", async () => {
  const { desk, chain } = setup();
  let captured;
  desk.sales = {
    create: async (input) => {
      captured = input;
    },
  };
  const input = draft({
    mode: "sale",
    supply: "999999",
    name: "Community Fixture",
    symbol: "COM",
    purpose: "Public description",
    soft: "1.25",
    hard: "12.5",
    hours: "48",
    founderPercent: "12.5",
    liquidityPercent: "65.25",
    vestingDays: "365",
  });
  await desk.prepareDraft(input);
  assert.equal(desk.error, false, desk.message);
  assert.deepEqual(captured, {
    launchpad: saleLaunchpad,
    name: "Community Fixture",
    symbol: "COM",
    about: "Public description",
    supply: "999999",
    opens: 1800000300,
    closes: 1800000300 + 48 * 3600,
    softCap: "1.25",
    hardCap: "12.5",
    founderBps: 1250,
    liquidityBps: 6525,
    vestingDays: 365,
  });
  assert.equal(chain.calls.length, 0);
});

test("shielded routing preserves ranges and creator fee expectations without a public transaction", async () => {
  const { desk, chain } = setup();
  const input = draft({
    funding: "private",
    range: "custom",
    lowerPrice: "0.000001",
    upperPrice: "0.00005",
  });
  await desk.prepareDraft(input);
  assert.equal(desk.tab, "private", desk.message);
  assert.equal(desk.privateDesk.private, true);
  assert.equal(desk.privateDesk.kind, "launch");
  assert.equal(desk.privateDesk.values.humanLowerPrice, input.lowerPrice);
  assert.equal(desk.privateDesk.values.humanUpperPrice, input.upperPrice);
  assert.equal(desk.privateDesk.values.quoteBudget, input.quoteBudget);
  assert.equal(chain.calls.length, 0);
  await desk.prepareDraft({ ...input, hookEnabled: true });
  assert.equal(desk.error, false, desk.message);
  assert.equal(desk.tab, "private");
  assert.equal(desk.privateDesk.values.creatorHook, true);
  assert.equal(desk.privateDesk.values.expectedHookFeePpm, "5000");
  assert.equal(desk.privateDesk.values.expectedHookOwner, undefined);
  assert.deepEqual(desk.privateDesk.values.expectedSplitRecipients, [account]);
  assert.equal(desk.privateDesk.values.expectedHookViaSplitter, true);
  assert.equal(chain.calls.length, 0);
  const other = setup();
  await other.desk.prepareDraft(draft({ hookEnabled: true }));
  assert.equal(other.desk.tab, "fees", other.desk.message);
  assert.match(other.desk.message, /Deploy the fee infrastructure/);
  assert.equal(other.chain.calls.length, 0);
});

test("signing review exposes recipient weights and the current approval destination", () => {
  const { desk, chain } = setup();
  chain.plan = {
    kind: "split-configure",
    request: { to: factory, data: "0xabcd", value: 0n },
    summary: {
      purpose: "Recipient weights",
      recipients: [account, recipient],
      weights: ["1", "3"],
    },
  };
  chain.review = {
    purpose: "Approve the exact budget",
    final: false,
    request: { to: quote, data: "0x1234", value: 0n },
    maximumGasCost: 42000n,
    approval: { amount: "1000000", spender: factory },
  };
  const html = desk.reviewHTML();
  assert.match(
    html,
    new RegExp("<span>Contract</span><strong>" + quote + "</strong>"),
  );
  assert.match(html, /recipients/);
  assert.ok(html.includes(account) && html.includes(recipient));
  assert.match(html, /weights/);
  assert.match(html, /&quot;1&quot;/);
  assert.match(html, /&quot;3&quot;/);
  assert.match(html, /Sign exact approval/);
});

test("a completed external builder cannot revive terms invalidated while it was running", async () => {
  const { desk, chain } = setup();
  let complete, start;
  const started = new Promise((resolve) => (start = resolve));
  const built = new Promise((resolve) => (complete = resolve));
  const plan = {
    kind: "semantic-plan",
    request: { to: factory, data: "0x", value: 0n },
    spend: [],
  };
  const pending = desk.external(async () => {
    start();
    await built;
    return plan;
  });
  await started;
  chain.invalidate();
  complete();
  await assert.rejects(pending, /context or draft changed/);
  assert.equal(chain.calls.length, 0);
  const accepted = await desk.external(async () => plan);
  assert.deepEqual(accepted, { ...plan, payer: account });
  assert.equal(chain.calls[0].method, "prepareExternal");
  assert.equal(chain.calls[0].options.nftCompatible, false);
});

test("reconciling already integrated historical deployments preserves an imported auction selection", async () => {
  const { desk, chain } = setup();
  chain.records = [
    {
      status: "confirmed",
      final: true,
      chainId: 1,
      kind: "auction-deploy",
      integrated: true,
      meta: { predictedAddress: auctionAddress },
    },
  ];
  chain.provider.getTransactionReceipt = async () => {
    throw Error("Already integrated deployment should not be re-read.");
  };
  desk.values.auctionAddress = importedAuction;
  desk.auction = { ...auctionFixture(), auction: importedAuction };
  await desk.reconcile();
  assert.equal(desk.values.auctionAddress, importedAuction);
  assert.equal(desk.auction.auction, importedAuction);
  assert.deepEqual(chain.calls, [{ method: "persist" }]);
});

test("singleton startup tolerates unavailable storage without a browser or injected wallet", () => {
  const script =
    'Object.defineProperty(globalThis,"localStorage",{get(){throw new DOMException("Opaque origin", "SecurityError")}});const {launchDesk}=await import(' +
    JSON.stringify(
      new URL("../../web/launchpad/desk.mjs", import.meta.url).href,
    ) +
    ');if(launchDesk.state.connected)throw Error("Unexpected connection");';
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      stdio: "pipe",
    }),
  );
});

test("NFT custody is explicit, uses verified account selection, and exposes signer and atomic allowance in review", async () => {
  const { desk, chain } = setup();
  const identity = {
    collection: addr(25),
    tokenId: 7,
    account: positionAddress,
    chainId: 1,
  };
  desk.render({ nft: () => identity });
  assert.equal(chain.execution.mode, "wallet");
  await desk.action("funding-current-nft");
  assert.equal(chain.payer, positionAddress);
  assert.equal(chain.address, account);
  assert.equal(desk.context().address, positionAddress);
  chain.plan = {
    kind: "launch",
    payer: positionAddress,
    execution: chain.execution,
    request: { to: factory, data: "0x1234", value: 0n },
    summary: { token: recipient },
  };
  chain.review = {
    final: true,
    purpose: "Create pool",
    request: { to: positionAddress, data: "0xabcd", value: 0n },
    innerRequest: chain.plan.request,
    execution: { ...chain.execution, target: factory, value: "0", nonce: "3" },
    allowance: {
      token: quote,
      spender: factory,
      amount: "1000000",
      atomic: true,
      resetAfter: true,
    },
    maximumGasCost: 42000n,
  };
  const html = desk.reviewHTML();
  assert.match(html, /NFT 7 account; recipients and rights follow the terms below/);
  assert.ok(html.includes(account) && html.includes(positionAddress));
  assert.match(
    html,
    /Exact allowance set and cleared inside this one transaction/,
  );
  assert.match(html, /nftOperation/);
  await desk.action("funding-wallet");
  assert.equal(chain.payer, account);
  assert.equal(chain.plan, null);
});
test("LP lock shortcut carries actual share asset and selected NFT beneficiary into the vault desk", async () => {
  const { desk, chain } = setup();
  await chain.useNFT({
    collection: addr(25),
    tokenId: 7,
    account: positionAddress,
  });
  desk.position = positionFixture();
  chain.config.saleVault = addr(26);
  await desk.action("lock-position");
  assert.equal(desk.tab, "locks");
  assert.equal(desk.vaultDesk.d.asset, positionAddress);
  assert.equal(desk.vaultDesk.d.amount, "1");
  assert.equal(desk.vaultDesk.d.beneficiary, positionAddress);
  assert.equal(desk.vaultDesk.d.vault, addr(26));
});

test("private emergency lock remains immediate while launch or proof work is busy", async () => {
  const { desk, chain } = setup(),
    handlers = {};
  let locked = 0;
  const button = {
    dataset: { do: "v4:lock" },
    disabled: true,
    closest: () => null,
  };
  const root = {
    addEventListener: (name, fn) => {
      handlers[name] = fn;
    },
    querySelector: (selector) => (selector === "#ld-private" ? {} : null),
    querySelectorAll: () => [button],
  };
  desk.privateDesk.action = async (action) => {
    assert.equal(action, "lock");
    locked++;
  };
  desk.mount(root);
  desk.working = true;
  chain.busy = true;
  desk.refreshStatus();
  assert.equal(button.disabled, false);
  handlers.click({
    target: {
      closest: (selector) => (selector === "[data-ld]" ? null : button),
    },
    preventDefault() {},
    stopPropagation() {},
  });
  await Promise.resolve();
  assert.equal(locked, 1);
  desk.unmount();
});
