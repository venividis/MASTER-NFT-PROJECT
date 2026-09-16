import {
  JsonRpcProvider,
  FetchRequest,
  formatUnits,
  ZeroAddress,
} from "../vendor/ethers.min.js";
import { LaunchChain } from "./chain.mjs";
import { CommunitySaleClient, readCommunitySale } from "./sale-client.mjs";
import {
  inspectAuction,
  auctionBidPlan,
  auctionActionPlan,
  prepareAuctionOperation,
  verifyNFTAuctionReceipt,
} from "./auction-client.mjs";
import {
  launchIdentity,
  parseLaunchHash,
  buildLaunchHash,
  buildLaunchLink,
  sameLaunch,
  recordToRoute,
} from "./links.mjs";

import { readPoolLaunch } from "./pool-participant.mjs";
import { readLaunchRecord } from "./lifecycle-client.mjs";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const json = (v) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2);
const units = (v, d = 18) =>
  v === null || v === undefined ? "Not read" : formatUnits(v, d);
const fact = (label, value) =>
  `<div class="lp-fact"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
const facts = (values) =>
  `<dl class="lp-facts">${Object.entries(values)
    .map(([k, v]) => fact(k, v))
    .join("")}</dl>`;
const button = (action, label, primary = false) =>
  `<button type="button" data-lp-action="${esc(action)}" class="lp-button${primary ? " lp-primary" : ""}">${esc(label)}</button>`;
const field = (key, label, value = "", placeholder = "") =>
  `<label class="lp-field"><span>${esc(label)}</span><input data-lp-field="${esc(key)}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${["amount", "lots", "limitPrice"].includes(key) ? 'inputmode="decimal"' : ""} autocomplete="off" spellcheck="false"></label>`;
const date = (n) =>
  new Date(Number(n) * 1000)
    .toISOString()
    .replace("T", " ")
    .replace(".000Z", " UTC");
const phaseLabels = {
  funding: "Open for contributions",
  scheduled: "Opens soon",
  settled: "Tokens ready",
  refundable: "Refunds ready",
  "awaiting-settlement": "Ready to settle",
  active: "Bidding open",
  closed: "Auction closed",
  unfunded: "Awaiting inventory",
  "expired-unfunded": "Never funded",
  "awaiting-close": "Ready to close",
};
const networkName = (id) =>
  ({ 1: "Ethereum", 42161: "Arbitrum", 137: "Polygon", 31337: "Local EVM" })[
    Number(id)
  ] || `Chain ${id}`;
const identity = (s) =>
  `${s?.address || ""}:${s?.chainId || ""}:${s?.execution?.payer || s?.address || ""}`;
const createReadProvider = (url) => {
  const request = new FetchRequest(url);
  request.timeout = 15000;
  return new JsonRpcProvider(request, undefined, {
    cacheTimeout: -1,
    batchMaxCount: 12,
  });
};

export function validateReadEndpoint(value, chainId) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw Error("Enter the HTTPS RPC endpoint you want to use.");
  }
  const local =
    Number(chainId) === 31337 &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.hash ||
    !(url.protocol === "https:" || (local && url.protocol === "http:"))
  )
    throw Error(
      "Use HTTPS for the read provider. HTTP is available only for a local development chain.",
    );
  return url.href;
}

/**
 * A participant-only launch page. Opening/rendering performs no network request.
 * Call open(route), render(), and mount(container). Unmount before returning to the owner desk.
 * Read terms requires an explicit RPC submission, an explicitly supplied provider, or wallet connection.
 */
export class LaunchParticipant {
  constructor({
    chain = new LaunchChain(),
    onExit = () => {},
    baseURL,
    providerFactory = createReadProvider,
  } = {}) {
    this.chain = chain;
    this.sales = new CommunitySaleClient(chain);
    this.onExit = onExit;
    this.baseURL = baseURL;
    this.providerFactory = providerFactory;
    this.route = null;
    this.record = null;
    this.root = null;
    this.generation = 0;
    this.working = false;
    this.message = "";
    this.error = false;
    this.values = {
      rpc: "",
      amount: "",
      lots: "",
      limitPrice: "",
      router: "",
      quoter: "",
      slippageBps: "50",
      shares: "",
      direction: "0",
      nftCollection: "",
      nftId: "",
    };
    this.wallets = [];
    this.prepared = null;
    this.readProvider = null;
    this.ownsReadProvider = false;
  }
  get payer() {
    return this.chain.payer || this.chain.address;
  }
  get native() {
    return Number(this.route?.chainId) === 137 ? "POL" : "ETH";
  }
  get connected() {
    return (
      !!this.chain.address && Number(this.chain.chainId) === this.route?.chainId
    );
  }
  get ownsPlan() {
    return !!this.prepared && this.prepared === this.chain.plan;
  }
  open(input) {
    const route =
      typeof input === "string"
        ? parseLaunchHash(input)
        : launchIdentity(input);
    if (!route) throw Error("Choose a launch link first.");
    if (!sameLaunch(route, this.route)) {
      if (this.chain.nftSession) {
        this.values.nftCollection = this.chain.execution.collection;
        this.values.nftId = this.chain.execution.tokenId;
      }
      this.chain.useWallet?.();
      if (this.ownsPlan) this.chain.invalidate();
      this.prepared = null;
      this.record = null;
      this.values.amount = "";
      this.values.lots = "";
      this.values.limitPrice = "";
      this.message = "";
      this.error = false;
      this.generation++;
      if (this.route?.chainId !== route.chainId) this.clearReadProvider();
    }
    this.route = route;
    return this;
  }
  clearReadProvider() {
    if (this.ownsReadProvider) this.readProvider?.destroy?.();
    this.readProvider = null;
    this.ownsReadProvider = false;
  }
  async useReadProvider(provider, { owned = false } = {}) {
    if (!this.route) throw Error("Open a launch link first.");
    const generation = this.generation,
      actual = (await provider.getNetwork()).chainId;
    if (generation !== this.generation)
      throw Error("Launch changed while connecting the read provider.");
    if (actual !== BigInt(this.route.chainId))
      throw Error(
        `This launch is on ${networkName(this.route.chainId)}; the RPC reports chain ${actual}.`,
      );
    this.clearReadProvider();
    this.readProvider = provider;
    this.ownsReadProvider = owned;
    return this.refresh();
  }
  async readEndpoint(value = this.values.rpc) {
    const endpoint = validateReadEndpoint(value, this.route?.chainId),
      provider = this.providerFactory(endpoint);
    try {
      return await this.useReadProvider(provider, { owned: true });
    } catch (e) {
      if (this.readProvider !== provider) provider.destroy?.();
      throw e;
    }
  }
  async refresh() {
    if (!this.route) throw Error("Open a launch link first.");
    const route = this.route,
      generation = this.generation,
      chainGeneration = this.chain.generation,
      connected = this.connected,
      account = connected ? this.payer : null,
      provider = connected ? this.chain.provider : this.readProvider;
    if (!provider)
      throw Error(
        "Read terms with an RPC endpoint, or connect a wallet on this launch’s chain.",
      );
    const actual = (await provider.getNetwork()).chainId;
    if (actual !== BigInt(route.chainId))
      throw Error("The provider network differs from the launch link.");
    if (connected) await this.chain.assertContext(chainGeneration);
    const record =
      route.kind === "pool"
        ? await readPoolLaunch(provider, {
            position: route.contract,
            chainId: route.chainId,
            account,
          })
        : route.kind === "record"
          ? await readLaunchRecord(provider, {
              registry: route.contract,
              id: route.id,
            })
          : route.kind === "community"
            ? connected
              ? await this.sales.read({
                  launchpad: route.contract,
                  id: route.id,
                })
              : await readCommunitySale(provider, {
                  chainId: route.chainId,
                  launchpad: route.contract,
                  id: route.id,
                })
            : await inspectAuction(provider, {
                auction: route.contract,
                owner: account || undefined,
              });
    if (generation !== this.generation || !sameLaunch(route, this.route))
      throw Error("Launch changed during the chain read.");
    if (connected) await this.chain.assertContext(chainGeneration);
    else if (this.readProvider !== provider)
      throw Error("Read provider changed. Refresh the launch.");
    this.record = { ...record, chainId: route.chainId };
    this.message = `Verified contract state at block ${record.blockNumber ?? record.currentBlock}.`;
    this.error = false;
    this.paint();
    return this.record;
  }
  async connect(raw) {
    const selected =
      this.wallets.find((w) => w.info.uuid === this.values.wallet) ||
      this.wallets[0];
    await this.chain.connect(raw || selected?.provider || globalThis.ethereum);
    this.chain.useWallet?.();
    if (!this.connected) {
      this.record = null;
      this.message = `This launch uses ${networkName(this.route.chainId)}. Switch your wallet network to participate.`;
      this.paint();
      return null;
    }
    return this.refresh();
  }
  matchingRecords() {
    const r = this.route;
    if (!r) return [];
    return this.chain.records.filter(
      (x) =>
        Number(x.chainId) === r.chainId &&
        x.account?.toLowerCase() === this.chain.address?.toLowerCase() &&
        (x.execution?.payer || x.account)?.toLowerCase() ===
          this.payer?.toLowerCase() &&
        (r.kind === "pool"
          ? x.summary?.position?.toLowerCase() === r.contract.toLowerCase() ||
            x.meta?.position?.toLowerCase() === r.contract.toLowerCase()
          : r.kind === "record"
            ? x.meta?.registry?.toLowerCase() === r.contract.toLowerCase()
            : r.kind === "community"
              ? x.meta?.launchpad?.toLowerCase() === r.contract.toLowerCase() &&
                String(x.meta.saleId) === r.id
              : x.meta?.auction?.toLowerCase() === r.contract.toLowerCase()),
    );
  }
  chainChanged(state) {
    const current = identity(state);
    if (current !== this.lastIdentity) {
      this.lastIdentity = current;
      this.generation++;
      this.record = null;
      this.prepared = null;
      this.message =
        state.error ||
        "Refresh this launch to read the selected wallet’s participation.";
      this.error = !!state.error;
      this.paint();
    } else this.paintStatus();
  }
  mount(root) {
    this.unmount();
    this.root = root;
    this.lastIdentity = identity(this.chain.getState());
    this.previousChange = this.chain.onChange;
    this.changeListener = (s) => {
      this.previousChange?.(s);
      this.chainChanged(s);
    };
    this.chain.onChange = this.changeListener;
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    root.addEventListener(
      "click",
      (e) => {
        const target = e.target.closest?.("[data-lp-action]");
        if (target && root.contains(target)) {
          e.preventDefault();
          this.run(() => this.act(target.dataset.lpAction));
        }
      },
      options,
    );
    root.addEventListener(
      "input",
      (e) => {
        const key = e.target.dataset.lpField;
        if (!key) return;
        this.values[key] = e.target.value;
        if (this.ownsPlan) this.chain.invalidate();
        this.prepared = null;
        this.paintStatus();
      },
      options,
    );
    root.addEventListener(
      "change",
      (e) => {
        const key = e.target.dataset.lpField;
        if (key) this.values[key] = e.target.value;
      },
      options,
    );
    root.addEventListener(
      "submit",
      (e) => {
        const form = e.target.closest?.("[data-lp-form]");
        if (form) {
          e.preventDefault();
          this.run(() => this.act(form.dataset.lpForm));
        }
      },
      options,
    );
    if (typeof window !== "undefined") {
      this.walletListener = (e) => {
        const d = e.detail;
        if (
          d?.provider?.request &&
          d.info?.uuid &&
          !this.wallets.some((w) => w.info.uuid === d.info.uuid)
        ) {
          this.wallets.push(d);
          this.paintStatus();
        }
      };
      window.addEventListener("eip6963:announceProvider", this.walletListener);
      window.dispatchEvent(new Event("eip6963:requestProvider"));
    }
    this.paint();
    return this;
  }
  unmount() {
    if (this.root) {
      this.generation++;
      if (this.ownsPlan) this.chain.invalidate();
      this.prepared = null;
    }
    this.abort?.abort();
    if (this.chain.onChange === this.changeListener)
      this.chain.onChange = this.previousChange;
    if (typeof window !== "undefined" && this.walletListener)
      window.removeEventListener(
        "eip6963:announceProvider",
        this.walletListener,
      );
    this.root = null;
    this.abort = null;
  }
  destroy() {
    this.unmount();
    this.generation++;
    this.clearReadProvider();
    if (this.ownsPlan) this.chain.invalidate();
    this.prepared = null;
  }
  async run(task) {
    if (this.working) return;
    this.working = true;
    this.error = false;
    this.message = "Reading and verifying…";
    this.paintStatus();
    try {
      await task();
    } catch (e) {
      this.error = true;
      this.message = e.shortMessage || e.message || String(e);
    } finally {
      this.working = false;
      this.paintStatus();
    }
  }
  paint() {
    if (this.root) {
      this.root.innerHTML = this.render();
      this.paintStatus();
    }
  }
  paintStatus() {
    if (!this.root) return;
    const status = this.root.querySelector("[data-lp-status]");
    if (status) {
      status.textContent = this.message;
      status.classList.toggle("lp-error", this.error);
    }
    const wallet = this.root.querySelector("[data-lp-wallet]");
    if (wallet && !wallet.contains(this.root.ownerDocument?.activeElement))
      wallet.innerHTML = this.walletHTML();
    const review = this.root.querySelector("[data-lp-review]");
    if (review) review.innerHTML = this.reviewHTML();
    const history = this.root.querySelector("[data-lp-history]");
    if (history) history.innerHTML = this.historyHTML();
    for (const el of this.root.querySelectorAll("button,input,select"))
      el.disabled = this.working || this.chain.busy;
  }
  walletHTML() {
    if (this.chain.address)
      return `<div class="lp-wallet"><span>Signing wallet <strong>${esc(this.chain.address)}</strong><small>${esc(networkName(this.chain.chainId))}</small>${this.chain.nftSession ? `<small>NFT account · ${esc(this.payer)}</small>` : ""}</span>${!this.connected ? button("switch", `Switch to ${networkName(this.route.chainId)}`, true) : ""}${button("disconnect", "Disconnect")}</div>${this.connected ? `<details class="lp-custody"><summary>Funding and claim ownership</summary><p>${this.chain.nftSession ? "The NFT account owns these funds, bids and claims. Selling the NFT transfers their control to its new owner." : "Your connected wallet supplies funds and owns its claims."}</p>${field("nftCollection", "NFT collection", this.values.nftCollection)}${field("nftId", "NFT token ID", this.values.nftId)}${button("use-nft", "Verify and use NFT account")}${button("use-wallet", "Use signing wallet")}</details>` : ""}`;
    return `<div class="lp-wallet">${this.wallets.length > 1 ? `<label>Wallet<select data-lp-field="wallet">${this.wallets.map((w) => `<option value="${esc(w.info.uuid)}" ${this.values.wallet === w.info.uuid ? "selected" : ""}>${esc(w.info.name)}</option>`).join("")}</select></label>` : ""}${button("connect", "Connect to participate", true)}</div>`;
  }
  render() {
    if (!this.route)
      return '<section class="lp-participant"><h2>Open a launch link</h2><p>A launch link identifies its chain, contract and sale.</p></section>';
    const r = this.record,
      title = r
        ? this.route.kind === "pool"
          ? `${r.token0.symbol} / ${r.token1.symbol}`
          : this.route.kind === "record"
            ? `Launch ${r.id} · ${r.mechanism}`
            : this.route.kind === "community"
              ? r.name
              : `${r.token.symbol} · Streaming auction`
        : {
            community: "Community launch",
            auction: "Streaming auction",
            pool: "Live liquidity pool",
            record: "Permanent launch record",
          }[this.route.kind];
    return `<section class="lp-participant" aria-label="Launch participation"><header class="lp-header"><div><span class="lp-eyebrow">ANIMA / ${esc(networkName(this.route.chainId))}</span><h2>${esc(title)}</h2><p>Read the terms. Choose your participation. Keep control of your wallet.</p></div><div data-lp-wallet>${this.walletHTML()}</div></header><div class="lp-toolbar">${button("exit", "Back to ANIMA")}${button("copy", "Copy launch link")}${this.readProvider || this.connected ? button("refresh", "Refresh chain state") : ""}</div><p class="lp-status" data-lp-status role="status" aria-live="polite">${esc(this.message)}</p><div data-lp-review>${this.reviewHTML()}</div>${r ? (this.route.kind === "pool" ? this.poolHTML() : this.route.kind === "record" ? this.recordHTML() : this.route.kind === "community" ? this.saleHTML() : this.auctionHTML()) : `<section class="lp-empty"><span class="lp-orbit" aria-hidden="true"></span><h3>Your launch terms are onchain.</h3><p>Read them without sharing a wallet address. Choose your read provider below, or connect a wallet.</p>${facts({ Chain: this.route.chainId, Contract: this.route.contract, ...(this.route.id ? { Sale: this.route.id } : {}) })}</section>`}<details class="lp-provider" ${!r && !this.connected ? "open" : ""}><summary>Read without connecting a wallet</summary><form data-lp-form="read">${field("rpc", "Your RPC endpoint", this.values.rpc, "https://…")}<p>Your browser will contact this provider to verify the contract and read public terms. Its endpoint stays out of the share link. No wallet connection or transaction is requested.</p><button type="submit" class="lp-button lp-primary">Read launch terms</button></form></details><div data-lp-history>${this.historyHTML()}</div><footer class="lp-footer">Public ${this.route.kind === "community" ? "contributions" : this.route.kind === "auction" ? "bids" : "launch information"} and chain activity. Every transaction is prepared, reviewed and signed separately.</footer></section>`;
  }
  recordHTML() {
    const r = this.record,
      target = recordToRoute(r);
    return `<section class="lp-card"><h3>Permanent launch provenance</h3>${facts({ Payer: r.payer, Registrar: r.registrar, Token: r.token, Mechanism: r.mechanism, "Mechanism contract": r.target, "Mechanism ID": r.mechanismId, Pool: r.poolId, "LP position": r.position, "NFT collection": r.collection, "NFT ID": r.tokenId, "Terms commitment": r.termsHash, "Created at block": r.createdBlock })}<p>${esc(r.provenance)}</p>${target ? `<a class="lp-button lp-primary" href="${esc(buildLaunchLink(target, this.baseURL))}">Open this launch</a>` : ""}${r.links.length ? `<h4>Allocations, vesting and lifecycle links</h4>${r.links.map((l) => facts({ Type: l.kind, Target: l.target, "Reference ID": l.referenceId, Asset: l.asset, Beneficiary: l.beneficiary, "Amount (base units)": l.amount, "Commitment / source transaction": l.detail })).join("")}` : "<p>No custody links have been registered.</p>"}</section>`;
  }
  poolHTML() {
    const p = this.record,
      connected =
        this.connected && p.account?.toLowerCase() === this.payer.toLowerCase(),
      input = this.values.direction === "1" ? p.token1 : p.token0,
      output = this.values.direction === "1" ? p.token0 : p.token1;
    return `<div class="lp-layout"><section class="lp-card lp-story"><span class="lp-badge">${BigInt(p.liquidity) > 0n ? "Funded Uniswap v4 pool" : "Position liquidity withdrawn"}</span><h3>${esc(p.token0.symbol)} / ${esc(p.token1.symbol)}</h3>${facts({ "LP swap fee": p.key.fee / 10000 + "%", "Creator-hook charge": p.hook ? Number(p.hook.feePpm) / 10000 + "%" : "None", "Current tick": p.tick, "Position range": p.tickLower + " to " + p.tickUpper, "Active position liquidity": p.liquidity, "LP shares issued": units(p.totalShares), "Read block": p.blockNumber })}<p>Trading uses the pool's actual liquidity and quotes. LP shares represent custody of the position's principal and fees under its contract. This page does not promise a price or profit.</p>${p.hook ? facts({ "Hook controller": p.hook.owner, "Fee recipient": p.hook.recipient, Splitter: p.hook.viaSplitter ? "Enabled" : "Disabled" }) : ""}${facts({ "Token 0": p.token0.address, "Token 1": p.token1.address, "Pool ID": p.poolId })}</section><aside class="lp-card lp-participate"><h3>Trade or manage your shares</h3>${connected ? `${facts({ Wallet: p.account, [p.token0.symbol + " balance"]: p.token0.formattedBalance, [p.token1.symbol + " balance"]: p.token1.formattedBalance, "Your LP shares": p.formattedShares })}<label class="lp-field"><span>Swap direction</span><select data-lp-field="direction"><option value="0" ${this.values.direction === "0" ? "selected" : ""}>${esc(p.token0.symbol)} → ${esc(p.token1.symbol)}</option><option value="1" ${this.values.direction === "1" ? "selected" : ""}>${esc(p.token1.symbol)} → ${esc(p.token0.symbol)}</option></select></label>${field("amount", "Input amount", this.values.amount)}${field("slippageBps", "Maximum slippage · basis points", this.values.slippageBps)}${field("router", "Verified ANIMA v4 router", this.values.router || this.chain.config.router || "")}${this.route.chainId === 31337 ? field("quoter", "Local v4 quoter", this.values.quoter || this.chain.config.quoter || "") : ""}${button("pool:swap", "Get real quote and review swap", true)}${BigInt(p.shares || 0) > 0n ? `${field("shares", "LP shares to redeem", this.values.shares)}${button("pool:redeem", "Review liquidity redemption")}${p.preview ? facts({ ["All-share redemption · " + p.token0.symbol]: p.preview.token0, ["All-share redemption · " + p.token1.symbol]: p.preview.token1 }) : ""}` : ""}` : `<p>Read pool terms without a wallet. Connect to get your balances, quote a trade or redeem shares.</p>${this.walletHTML()}`}</aside></div>${this.detailsHTML({ Position: p.position, Factory: p.factory, Manager: p.manager, Hook: p.key.hooks, "Read block hash": p.blockHash })}`;
  }
  saleHTML() {
    const s = this.record,
      personal =
        this.connected && s.account?.toLowerCase() === this.payer.toLowerCase(),
      percent = Number((BigInt(s.raised) * 10000n) / BigInt(s.hardCap)) / 100;
    return `<div class="lp-layout"><section class="lp-card lp-story"><div class="lp-heading"><span class="lp-badge">${esc(phaseLabels[s.phase] || s.phase)}</span><span>${esc(s.symbol)}</span></div><h3>${esc(s.formatted.raised)} <small>${this.native} contributed</small></h3><progress value="${percent}" max="100" aria-label="Progress toward maximum raise"></progress>${facts({ "Minimum raise": s.formatted.softCap + " " + this.native, "Maximum raise": s.formatted.hardCap + " " + this.native, Opens: date(s.opens), Closes: date(s.closes) })}${s.about ? `<p class="lp-description">${esc(s.about)}</p>` : ""}<h4>What happens to the raise</h4><p>When the window closes, anyone can settle. Meeting the minimum enables proportional token claims and permanent liquidity in the ANIMA native market. Missing it enables a full refund of your recorded contribution.</p>${facts({ "Total token supply": s.formatted.supply + " " + s.symbol, "Participant allocation": s.formatted.publicTokens + " " + s.symbol, "Liquidity tokens": s.formatted.lpTokens + " " + s.symbol, "Founder tokens": s.formatted.founderTokens + " " + s.symbol, "Raised funds to liquidity": s.liquidityBps / 100 + "%", "Founder vesting": s.vestingDays + " days; 30-day cliff", "Liquidity venue": "ANIMA native market" })}<p>You may withdraw your contribution before closing. The final amount raised determines your token allocation.</p></section><aside class="lp-card lp-participate"><h3>Your participation</h3>${personal ? `${facts({ Wallet: s.account, "Recorded contribution": s.formatted.contribution + " " + this.native, Claimable: s.formatted.claimable + " " + (s.status === 3 ? this.native : s.symbol) })}${s.actions.contribute || s.actions.withdraw ? field("amount", "Amount · " + this.native, this.values.amount, "Enter an amount") : ""}<div class="lp-actions">${s.actions.contribute ? button("sale:contribute", "Review contribution", true) : ""}${s.actions.withdraw ? button("sale:withdraw", "Review withdrawal") : ""}${s.actions.settle ? button("sale:settle", "Review settlement", true) : ""}${s.actions.claim ? button("sale:claim", s.status === 3 ? "Review full refund" : "Review token claim", true) : ""}${button("refresh", "Refresh")}</div>${!Object.values(s.actions).some(Boolean) ? "<p>No contribution or claim is currently available for this wallet.</p>" : ""}` : `<p>Connect on ${esc(networkName(this.route.chainId))} to read your contribution and available claims.</p>${this.walletHTML()}`}${this.locksHTML(s)}</aside></div>${this.detailsHTML({ Creator: s.creator, Token: s.token, Launchpad: s.launchpad, "Sale ID": s.id, Ledger: s.ledger, Market: s.market, "Vesting vault": s.vault, "Read block": s.blockNumber, "Read block hash": s.blockHash })}`;
  }
  locksHTML(s) {
    return ["founder", "treasury"]
      .map((kind) => {
        const l = s[kind + "Lock"];
        return l
          ? `<section class="lp-lock"><h4>${kind === "founder" ? "Founder vesting" : "Treasury lock"}</h4>${facts({ Beneficiary: l.beneficiary, "Vested now": l.formatted.releasable + " " + (kind === "founder" ? s.symbol : this.native), Cliff: date(l.cliff), End: date(l.end) })}${this.connected && BigInt(l.releasable) > 0n ? button("release:" + kind, "Release to fixed beneficiary") : ""}</section>`
          : "";
      })
      .join("");
  }
  auctionHTML() {
    const a = this.record,
      s = a.state,
      personal =
        this.connected && a.account?.toLowerCase() === this.payer.toLowerCase(),
      seller = personal && s.seller.toLowerCase() === this.payer.toLowerCase();
    return `<div class="lp-layout"><section class="lp-card lp-story"><div class="lp-heading"><span class="lp-badge">${esc(phaseLabels[a.phase] || a.phase)}</span><span>${a.availableSlots} bid slots available</span></div><h3>${esc(a.inventory)} <small>${esc(a.token.symbol)} offered</small></h3>${facts({ "Tokens per lot": a.lotTokens + " " + a.token.symbol, "Reserve per lot": a.reservePerLot + " " + this.native, "Lots sold": s.soldLots + " / " + s.totalLots, "Released lots": s.releasedLots, "Opening block": s.startBlock, "Closing block": s.endBlock, "Read at block": a.currentBlock, "Inventory funded": a.funded ? "Yes" : "No" })}<p>${esc(a.disclosure)}</p><p>Block timing varies. Your limit is the maximum price for one lot; your wallet escrows the number of lots multiplied by that limit.</p>${a.activeBids.length ? `<details><summary>Public standing bids · ${a.activeBids.length}</summary><div class="lp-table-wrap"><table><thead><tr><th>Sequence</th><th>Lots remaining</th><th>Limit / lot</th><th>Bidder</th></tr></thead><tbody>${a.activeBids.map((b) => `<tr><td>${esc(b.sequence)}</td><td>${esc(b.remainingLots)}</td><td>${esc(units(b.limitPrice))} ${this.native}</td><td><code>${esc(b.bidder)}</code></td></tr>`).join("")}</tbody></table></div></details>` : ""}</section><aside class="lp-card lp-participate"><h3>Your participation</h3>${personal ? `${facts({ "Funding account": this.payer, "Claimable tokens": units(a.claims.tokens, a.token.decimals) + " " + a.token.symbol, "Refundable escrow": units(a.claims.refund) + " " + this.native, ...(seller ? { "Seller proceeds": units(a.claims.proceeds) + " " + this.native } : {}) })}${a.phase === "active" ? `${field("lots", "Number of lots", this.values.lots, "Whole lots")}${field("limitPrice", "Maximum " + this.native + " per lot", this.values.limitPrice, "At least " + a.reservePerLot)}${button("auction:bid", "Review funded bid", true)}` : ""}<div class="lp-actions">${a.funded && !a.closed && BigInt(a.currentBlock) > BigInt(s.startBlock) ? button("auction:checkpoint", "Review clearing") : ""}${BigInt(a.claims.tokens) > 0n ? button("auction:claimTokens", "Review token claim", true) : ""}${BigInt(a.claims.refund) > 0n ? button("auction:claimRefund", "Review refund", true) : ""}${seller && BigInt(a.claims.proceeds) > 0n ? button("auction:claimProceeds", "Review seller proceeds") : ""}${button("refresh", "Refresh")}</div>${a.ownBids.length ? `<h4>Your standing bids</h4>${a.ownBids.map((b) => `<div class="lp-own-bid"><p>${esc(b.remainingLots)} lots · limit ${esc(units(b.limitPrice))} ${this.native} / lot</p>${button("cancel:" + b.slot + ":" + b.sequence, "Review cancellation")}</div>`).join("")}` : ""}` : `<p>Connect on ${esc(networkName(this.route.chainId))} to bid and read your token or refund claims.</p>${this.walletHTML()}`}</aside></div>${this.detailsHTML({ Seller: s.seller, "Sale token": a.token.address, "Token decimals": a.token.decimals, "Auction contract": a.auction, "Read block": a.currentBlock, "Read block hash": a.blockHash })}`;
  }
  detailsHTML(values) {
    return `<details class="lp-details"><summary>Verified identity and chain record</summary>${facts(values)}<p>Runtime code and linked contracts are checked against this edition. This identifies the implementation; it does not endorse the creator or predict demand.</p></details>`;
  }
  reviewHTML() {
    if (!this.ownsPlan) return "";
    const p = this.prepared,
      r = this.chain.review;
    return `<section class="lp-review" tabindex="-1"><span class="lp-eyebrow">${r ? "REVIEW BEFORE SIGNING" : "TRANSACTION PREPARED"}</span><h3>${esc(r?.purpose || p.purpose)}</h3>${facts({ Network: networkName(this.route.chainId), "Signing wallet": this.chain.address, "Funding / claim account": this.payer, Contract: r?.request.to || p.request.to, "Native currency sent": units(r?.request.value ?? p.request.value ?? 0n) + " " + this.native, ...(r ? { "Maximum network fee": units(r.maximumGasCost) + " " + this.native } : {}) })}${facts(Object.fromEntries(Object.entries(p.summary || {}).filter(([k, v]) => k !== "purpose" && typeof v !== "object")))}<p>The selected funding account supplies funds and owns its claims. NFT-account rights follow the NFT’s current owner; any explicitly chosen claim recipient receives the payout. Changing wallet, network, launch or amounts invalidates this review.</p><details><summary>Exact transaction data</summary><pre>${esc(json(r?.request || p.request))}</pre></details><div class="lp-actions">${r ? button("send", "Sign and submit", true) : button("review", "Check call and network fee", true)}${button("cancel-review", "Cancel review")}</div></section>`;
  }
  historyHTML() {
    const records = this.matchingRecords().slice(-8).reverse();
    return records.length
      ? `<section class="lp-history"><h3>Your transactions for this launch</h3>${records.map((r) => `<div class="lp-receipt"><strong>${esc(r.purpose)}</strong><span>${esc(r.status)}</span><code>${esc(r.hash)}</code></div>`).join("")}${records.some((r) => r.status === "pending") ? button("recover", "Check submitted receipts") : ""}</section>`
      : "";
  }
  async prepare(action) {
    if (!this.connected)
      throw Error(
        `Connect a participant wallet on ${networkName(this.route.chainId)}.`,
      );
    // The page starts with wallet funding; NFT custody is selected explicitly after ownership verification.
    this.chain.invalidate();
    this.prepared = null;
    const generation = this.chain.generation,
      route = this.route,
      pageGeneration = this.generation;
    if (route.kind === "pool") {
      await this.refresh();
      const r = this.record,
        config = {
          manager: r.manager,
          router: this.values.router || this.chain.config.router,
          quoter: this.values.quoter || this.chain.config.quoter,
          ...(r.key.hooks === ZeroAddress
            ? { factory: r.factory }
            : { hookFactory: r.factory }),
        };
      await this.chain.configure(config);
      if (action === "pool:swap") {
        const reverse = this.values.direction === "1";
        this.prepared = await this.chain.prepareSwap({
          inputToken: reverse ? r.token1.address : r.token0.address,
          outputToken: reverse ? r.token0.address : r.token1.address,
          amount: this.values.amount,
          slippageBps: this.values.slippageBps,
          fee: r.key.fee,
          tickSpacing: r.key.tickSpacing,
          hook: r.key.hooks,
        });
      } else if (action === "pool:redeem")
        this.prepared = await this.chain.prepareRedeem({
          position: r.position,
          shares: this.values.shares,
          slippageBps: this.values.slippageBps,
        });
      else throw Error("Unsupported pool action.");
    } else if (route.kind === "record") {
      throw Error("Open the recorded mechanism to participate.");
    } else if (route.kind === "community") {
      const input = {
        launchpad: route.contract,
        id: route.id,
        amount: this.values.amount,
      };
      if (action.startsWith("sale:")) {
        const method = action.slice(5);
        if (!["contribute", "withdraw", "settle", "claim"].includes(method))
          throw Error("Unsupported community action.");
        this.prepared = await this.sales[method](input);
      } else if (action.startsWith("release:"))
        this.prepared = await this.sales.release({
          ...input,
          lock: action.slice(8),
        });
      else throw Error("This is a community sale, not an auction.");
    } else {
      const input = { auction: route.contract },
        config = { chainId: route.chainId };
      let plan;
      if (action === "auction:bid")
        plan = await auctionBidPlan(
          this.chain.provider,
          config,
          {
            ...input,
            lots: this.values.lots,
            limitPrice: this.values.limitPrice,
          },
          this.payer,
        );
      else if (action.startsWith("cancel:")) {
        const [, slot, expectedSequence] = action.split(":");
        plan = await auctionActionPlan(
          this.chain.provider,
          config,
          { ...input, action: "cancel", slot, expectedSequence },
          this.payer,
        );
      } else {
        const method = action.slice(8);
        if (
          !action.startsWith("auction:") ||
          ![
            "checkpoint",
            "claimTokens",
            "claimRefund",
            "claimProceeds",
          ].includes(method)
        )
          throw Error("Unsupported auction action.");
        plan = await auctionActionPlan(
          this.chain.provider,
          config,
          { ...input, action: method, recipient: this.payer },
          this.payer,
        );
      }
      await this.chain.assertContext(generation);
      if (pageGeneration !== this.generation || !sameLaunch(route, this.route))
        throw Error("Launch changed during preparation.");
      this.prepared = await prepareAuctionOperation(this.chain, plan);
    }
    if (pageGeneration !== this.generation || !sameLaunch(route, this.route)) {
      this.chain.invalidate();
      this.prepared = null;
      throw Error("Launch changed during preparation.");
    }
    this.message =
      "Exact transaction prepared. Review the call and network fee before signing.";
    this.paintStatus();
    return this.prepared;
  }
  async act(action) {
    if (action === "connect") return this.connect();
    if (action === "use-nft") {
      await this.chain.useNFT({
        collection: this.values.nftCollection,
        tokenId: this.values.nftId,
      });
      return this.refresh();
    }
    if (action === "use-wallet") {
      this.chain.useWallet();
      return this.refresh();
    }
    if (action === "disconnect") {
      this.chain.disconnect();
      this.record = null;
      this.prepared = null;
      this.paint();
      return;
    }
    if (action === "switch") {
      await this.chain.switchChain(this.route.chainId);
      this.chain.useWallet?.();
      return this.refresh();
    }
    if (action === "read") return this.readEndpoint();
    if (action === "refresh") return this.refresh();
    if (action === "exit") {
      this.unmount();
      return this.onExit();
    }
    if (action === "copy") {
      const link = buildLaunchLink(this.route, this.baseURL);
      try {
        await globalThis.navigator.clipboard.writeText(link);
        this.message =
          "Launch link copied. It contains only the launch identity.";
      } catch {
        this.message = "Launch link: " + link;
      }
      return link;
    }
    if (action === "cancel-review") {
      if (this.ownsPlan) this.chain.invalidate();
      this.prepared = null;
      this.message = "Review cancelled.";
      return;
    }
    if (action === "review") {
      if (!this.ownsPlan)
        throw Error("Prepare a transaction for this launch first.");
      await this.chain.reviewNext();
      this.message =
        "Review the exact amount and maximum network fee, then sign when ready.";
      return;
    }
    if (action === "send") {
      if (!this.ownsPlan)
        throw Error("Prepare and review this launch action first.");
      const receipt = await this.chain.sendReviewed();
      if (receipt.status === "confirmed") {
        if (receipt.final)
          await verifyNFTAuctionReceipt(
            this.chain.provider,
            receipt,
            await this.chain.provider.getTransactionReceipt(receipt.hash),
          );
        if (receipt.final) this.prepared = null;
        await this.refresh();
        this.message = receipt.final
          ? "Confirmed on chain. Your participation has been refreshed."
          : "Approval confirmed. Review the next transaction.";
      } else
        this.message =
          "Submitted. The transaction hash is recorded below; check its receipt before starting another.";
      return receipt;
    }
    if (action === "recover") {
      await this.chain.recoverTransactions();
      await this.refresh();
      return;
    }
    return this.prepare(action);
  }
}

export { parseLaunchHash, buildLaunchHash, buildLaunchLink };
