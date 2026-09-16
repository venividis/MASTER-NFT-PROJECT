import { LaunchChain, resolveHumanRange } from "./chain.mjs";
import { LaunchStudio } from "./studio.mjs";
import { rate } from "./model.mjs";
import { V4Desk } from "../v4/desk.mjs";
import { CommunitySaleClient, verifySaleContract } from "./sale-client.mjs";
import { renderSaleDetail, renderSaleSetup } from "./sale-ui.mjs";
import { SALE_ARTIFACTS } from "./sale-artifacts.mjs";
import { buildLaunchLink } from "./links.mjs";
import { VaultStrategyDesk } from "./vault-ui.mjs";
import { LaunchLifecycleDesk } from "./lifecycle.mjs";
import { mainDraftToLifecycle } from "./lifecycle-client.mjs";
import { StrategiesDesk } from "./strategies.mjs";
import { EconomicsDesk } from "./economics.mjs";
import { ProtocolsDesk } from "./protocols.mjs";
import * as hooks from "./hook-client.mjs";
import * as auctions from "./auction-client.mjs";
import { HOOK_ARTIFACTS } from "./hook-artifacts.mjs";
import {
  Interface,
  getAddress,
  formatUnits,
  hexlify,
  randomBytes,
  ZeroAddress,
} from "../vendor/ethers.min.js";

const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const safeStorage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};
const short = (a) =>
  a ? String(a).slice(0, 8) + "…" + String(a).slice(-6) : "—";
const json = (v) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2);
const fmt = (v, d = 6) =>
  Number(v).toLocaleString("en-US", { maximumFractionDigits: d });
const amount = (v, d = 18) => formatUnits(BigInt(v ?? 0), d);
const fact = (k, v) =>
  `<div class="ld-fact"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`;
const facts = (o) =>
  Object.entries(o)
    .map(([k, v]) => fact(k, typeof v === "object" ? json(v) : v))
    .join("");
const B = (key, label, primary = false) =>
  `<button type="button" data-ld="${esc(key)}" class="ld-button ${primary ? "ld-primary" : ""}">${label}</button>`;
const F = (key, label, value = "", help = "", type = "text") =>
  `<div class="ld-field"><label for="ld-${key}">${label}</label><input id="ld-${key}" data-ld-field="${key}" name="${key}" value="${esc(value)}" type="${type}" autocomplete="off" spellcheck="false">${help ? `<small>${help}</small>` : ""}</div>`;
const select = (key, label, values, value) =>
  `<div class="ld-field"><label for="ld-${key}">${label}</label><select id="ld-${key}" data-ld-field="${key}" name="${key}">${values.map(([v, l]) => `<option value="${esc(v)}" ${String(value) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
const EXPLORERS = {
  1: "https://etherscan.io",
  42161: "https://arbiscan.io",
  137: "https://polygonscan.com",
};
const USDC = {
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};
const link = (chain, hash, label = "View transaction ↗") =>
  EXPLORERS[chain] && /^0x[\da-f]{64}$/i.test(hash)
    ? `<a href="${EXPLORERS[chain]}/tx/${hash}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`
    : `<code>${esc(hash)}</code>`;
const time = (t) => (t ? new Date(Number(t) * 1000).toLocaleString() : "—");
const tabs = [
  ["create", "Create"],
  ["positions", "My launches"],
  ["lifecycle", "Records & allocations"],
  ["protocols", "Price discovery"],
  ["strategies", "Strategies"],
  ["economics", "Simulate economics"],
  ["sales", "Community"],
  ["auction", "Auctions"],
  ["fees", "Fee streams"],
  ["locks", "Locks & vesting"],
  ["private", "Private wallet"],
  ["settings", "Setup"],
];

const tabGroups = [
  {
    id: "create",
    label: "Create",
    tabs: ["create", "lifecycle", "sales", "auction", "protocols", "economics"],
  },
  {
    id: "manage",
    label: "Manage",
    tabs: ["positions", "fees", "locks", "strategies"],
  },
  { id: "wallet", label: "Wallet & setup", tabs: ["private", "settings"] },
];
/** One live execution surface shared by the NFT edition and the hosted object. */
export class LaunchDesk {
  constructor({ chain, storage = safeStorage() } = {}) {
    this.tab = "create";
    this.root = null;
    this.values = {
      slippageBps: "50",
      swapAmount: "0.1",
      saleId: "1",
      saleAmount: "0.1",
      auctionLots: "1",
      auctionLimit: "0.001",
      lotSize: "100",
      totalLots: "1000",
      reservePrice: "0.001",
    };
    this.message = "";
    this.error = false;
    this.working = false;
    this.wallets = [];
    this.chain =
      chain ||
      new LaunchChain({ storage, onChange: () => this.refreshStatus() });
    this.studio = new LaunchStudio();
    this.sales = new CommunitySaleClient(this.chain);
    this.vaultDesk = new VaultStrategyDesk(this.chain, {
      onPrepared: () => {
        this.refreshStatus();
        this.focusReview();
      },
      onError: (error) => this.notice(error.message, true),
    });
    this.economicsDesk = new EconomicsDesk({
      getDraft: () => this.studio.d,
      onExport: (value, name) => this.download(value, name),
    });
    this.lifecycleDesk = new LaunchLifecycleDesk({
      chain: this.chain,
      getDraft: () => mainDraftToLifecycle(this.chain, this.studio.d),
    });
    this.protocolsDesk = new ProtocolsDesk({
      chain: this.chain,
      storage,
      onChange: () => this.refreshStatus(),
    });
    this.strategiesDesk = new StrategiesDesk(this.chain, {
      onPrepared: () => {
        this.refreshStatus();
        this.focusReview();
      },
      onError: (error) => this.notice(error.message, true),
    });
    this.privateDesk = new V4Desk({
      notify: (m) => this.notice(m),
      download: (data, name) => this.download(data, name),
    });
    this.privateDesk.onLock = () => {
      if (this.tab === "private") this.paint();
    };
    this.privateDesk.onReturn = () => {
      this.tab = "create";
      this.paint();
    };
  }
  usePrivateDesk(desk) {
    this.privateDesk = desk;
    this.sharedPrivate = true;
  }
  get state() {
    return this.chain.getState();
  }
  attach() {
    if (this.attached || typeof window === "undefined") return;
    this.attached = true;
    if (!this.sharedPrivate) this.privateDesk.attach();
    window.addEventListener("eip6963:announceProvider", (e) => {
      const d = e.detail;
      if (
        d?.provider?.request &&
        d.info?.uuid &&
        !this.wallets.some((w) => w.info.uuid === d.info.uuid)
      ) {
        this.wallets.push(d);
        this.refreshStatus();
      }
    });
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }
  clearFundingViews() {
    this.position = null;
    this.asset = null;
    this.hookInfo = null;
    this.splitterInfo = null;
    this.sale = null;
    this.auction = null;
  }
  fundingHTML() {
    if (this.tab === "private")
      return '<p class="ld-note">Shielded operations use the encrypted wallet selected below. Public wallet and NFT funding selections do not replace private funding.</p>';
    const current = this.state.execution || {
        mode: "wallet",
        payer: this.chain.address,
      },
      identity =
        typeof this.outer?.nft === "function" || this.outer?.nft?.collection;
    return `<details class="ld-panel"><summary>Funding & custody · ${current.mode === "nft" ? "NFT " + esc(current.tokenId) : "Connected wallet"}</summary><p>Choose where funding comes from and where newly issued tokens, liquidity shares and refunds stay.</p><div class="ld-actions">${B("funding-wallet", "Use wallet funds")}${identity ? B("funding-current-nft", "Use this NFT account", true) : ""}</div><div class="ld-two">${F("nftCollection", "NFT collection", this.values.nftCollection || "")}${F("nftTokenId", "NFT number", this.values.nftTokenId || "")}${F("nftAccount", "Expected NFT account · optional", this.values.nftAccount || "")}</div>${B("funding-nft", "Verify & use NFT account ↗")}<p class="ld-note">NFT funding supports v4 launches, swaps, liquidity withdrawals, fee operations and compatible vault deposits. Compatible community sales and auctions also support NFT custody; infrastructure deployment uses your signing wallet. ${current.mode === "nft" ? "Selling this NFT transfers control of the assets in its account. Existing external fee recipients keep their own claims." : ""}</p></details>`;
  }
  participantLink(kind, contract, id) {
    try {
      const href = buildLaunchLink({
        kind,
        chainId: this.chain.chainId,
        contract,
        ...(id ? { id } : {}),
      });
      return `<a class="ld-button" href="${esc(href)}">Open participant page ↗</a><p class="ld-note">Share this link so participants can read the chain terms and use their own wallet.</p>`;
    } catch {
      return "";
    }
  }
  context() {
    return {
      seed: this.outer?.seed,
      address: this.chain.payer || this.chain.address,
      prepareLaunch: (d) => this.prepareDraft(d),
      onDraftChange: () => {
        this.chain.invalidate();
        this.continueDraft = null;
      },
    };
  }
  render(context = {}) {
    this.unmount();
    this.outer = context;
    return this.html();
  }
  mount(root) {
    if (!root) return;
    this.root = root;
    this.attach();
    this.abort = new AbortController();
    const o = { signal: this.abort.signal };
    root.addEventListener(
      "click",
      (e) => {
        const b = e.target.closest("[data-ld]");
        if (b) {
          e.preventDefault();
          e.stopPropagation();
          this.run(() => this.action(b.dataset.ld));
          return;
        }
        const p = e.target.closest('[data-do^="v4:"]');
        if (p) {
          e.preventDefault();
          e.stopPropagation();
          const action = p.dataset.do.slice(3);
          if (["lock", "hide"].includes(action)) {
            Promise.resolve(
              this.privateDesk.action(action, this.privateContainer()),
            ).catch((error) => this.notice(error.message, true));
          } else
            this.run(() =>
              this.privateDesk.action(action, this.privateContainer()),
            );
        }
      },
      o,
    );
    root.addEventListener(
      "submit",
      (e) => {
        if (e.target.id?.startsWith("v4-")) {
          e.preventDefault();
          e.stopPropagation();
          this.run(() =>
            this.privateDesk.submit(e.target.id, this.privateContainer()),
          );
        }
      },
      o,
    );
    root.addEventListener(
      "input",
      (e) => {
        const k = e.target.dataset.ldField;
        if (k) {
          this.values[k] = e.target.value;
          this.chain.invalidate();
          if (k === "auctionAddress") {
            this.auction = null;
            root.querySelector(".ld-auction-detail")?.remove();
          }
          if (k === "position") {
            this.position = null;
            root.querySelector(".ld-position-detail")?.remove();
          }
          if (["saleId", "saleLaunchpad"].includes(k)) {
            this.sale = null;
            root.querySelector(".ld-sale-detail")?.remove();
          }
          if (["hook", "feeCurrency"].includes(k)) {
            this.hookInfo = null;
            this.splitterInfo = null;
            root.querySelector(".ld-fee-detail")?.remove();
          }
          this.refreshStatus();
        }
        if (e.target.id?.startsWith("v4-"))
          this.privateDesk.change(e.target, this.privateContainer());
      },
      o,
    );
    root.addEventListener(
      "change",
      (e) => {
        if (e.target.id === "v4-private")
          this.privateDesk.change(e.target, this.privateContainer());
      },
      o,
    );
    const composer = root.querySelector("#ld-composer");
    if (composer) this.studio.mount(composer);
    const locks = root.querySelector("#ld-locks");
    if (locks) this.vaultDesk.mount(locks);
    for (const [id, desk] of [
      ["economics", this.economicsDesk],
      ["lifecycle", this.lifecycleDesk],
      ["strategies", this.strategiesDesk],
      ["protocols", this.protocolsDesk],
    ]) {
      const surface = root.querySelector("#ld-" + id);
      if (surface) desk.mount(surface);
    }
    this.refreshStatus();
  }
  unmount() {
    this.abort?.abort();
    this.abort = null;
    this.studio.unmount();
    this.vaultDesk.unmount();
    this.economicsDesk.unmount();
    this.lifecycleDesk.unmount();
    this.protocolsDesk.unmount();
    this.strategiesDesk.unmount();
    this.root = null;
  }
  paint() {
    if (!this.root) return;
    const root = this.root;
    const scroll = root.scrollTop;
    this.unmount();
    root.innerHTML = this.html();
    this.mount(root);
    root.scrollTop = scroll;
  }
  privateContainer() {
    return this.root?.querySelector("#ld-private");
  }
  notice(message, error = false) {
    this.message = message;
    this.error = error;
    const n = this.root?.querySelector("#ld-status");
    if (n) {
      n.textContent = message;
      n.classList.toggle("ld-error", error);
    }
  }
  refreshStatus() {
    if (!this.root) return;
    const s = this.state;
    const n = this.root.querySelector("#ld-wallet");
    if (n) n.innerHTML = this.walletHTML();
    const review = this.root.querySelector("#ld-review");
    if (review) review.innerHTML = this.reviewHTML();
    if (s.error) this.notice(s.error, true);
    this.root.querySelectorAll("button,input,select,textarea").forEach((b) => {
      if (
        b.closest?.("#ld-lifecycle,#ld-strategies,#ld-protocols,#ld-economics")
      )
        return;
      const missing = (b.dataset.ldNeeds || "")
        .split(/\s+/)
        .filter(Boolean)
        .some(
          (k) =>
            !/^0x[\da-f]{40}$/i.test(
              this.values[k] ?? this.chain.config[k] ?? "",
            ) ||
            /^0x0{40}$/i.test(this.values[k] ?? this.chain.config[k] ?? ""),
        );
      const emergency = ["v4:lock", "v4:hide"].includes(b.dataset.do);
      b.disabled = emergency
        ? false
        : missing ||
          !!this.working ||
          s.busy ||
          !!(b.closest?.("#ld-composer") && this.studio.busy);
    });
  }
  async run(fn) {
    if (this.working || this.state.busy) return;
    this.working = true;
    this.notice("");
    this.refreshStatus();
    try {
      await fn();
    } catch (e) {
      this.notice(e.shortMessage || e.reason || e.message || String(e), true);
    } finally {
      this.working = false;
      this.refreshStatus();
    }
  }
  html() {
    const group =
      tabGroups.find((g) => g.tabs.includes(this.tab)) || tabGroups[0];
    return `<section class="ld-desk"><header class="ld-header"><div><span class="ld-eyebrow">ANIMA / LAUNCHPAD</span><h2>Bring an idea to life.</h2></div><div id="ld-wallet">${this.walletHTML()}</div></header><nav class="ld-groups" aria-label="Launchpad sections">${tabGroups.map((g) => `<button type="button" data-ld="group:${g.id}" aria-pressed="${g.id === group.id}">${g.label}</button>`).join("")}</nav><nav class="ld-nav" aria-label="Launchpad">${tabs
      .filter(([k]) => group.tabs.includes(k))
      .map(
        ([k, l]) =>
          `<button type="button" data-ld="tab:${k}" ${k === this.tab ? 'aria-current="page"' : ""}>${l}</button>`,
      )
      .join(
        "",
      )}</nav><p id="ld-status" class="ld-status ${this.error ? "ld-error" : ""}" role="status" aria-live="polite">${esc(this.message)}</p><div id="ld-review">${this.reviewHTML()}</div><div class="ld-content">${this.fundingHTML()}${this.tab === "create" ? `<div id="ld-composer">${this.studio.render(this.context())}</div>` : this.tab === "economics" ? `<div id="ld-economics">${this.economicsDesk.render()}</div>` : this.tab === "lifecycle" ? `<div id="ld-lifecycle">${this.lifecycleDesk.render()}</div>` : this.tab === "strategies" ? `<div id="ld-strategies">${this.strategiesDesk.render()}</div>` : this.tab === "protocols" ? `<div id="ld-protocols">${this.protocolsDesk.render()}</div>` : this.tab === "positions" ? this.positionsHTML() : this.tab === "sales" ? this.salesHTML() : this.tab === "auction" ? this.auctionHTML() : this.tab === "fees" ? this.feesHTML() : this.tab === "locks" ? `<div id="ld-locks">${this.vaultDesk.render()}</div>` : this.tab === "private" ? `<div id="ld-private">${this.privateDesk.render()}</div>` : this.settingsHTML()}</div></section>`;
  }
  walletHTML() {
    const s = this.state;
    return s.connected
      ? `<span class="ld-chain-dot"></span><span>${esc(s.network || "Chain " + s.chainId)}<small title="${esc(s.address)}">${esc(short(s.address))}</small><small>${s.execution?.mode === "nft" ? "NFT " + esc(s.execution.tokenId) + " · " + esc(short(s.payer)) : "Wallet funding"}</small></span>${B("disconnect", "Disconnect")}`
      : `${this.wallets.length > 1 ? `<select aria-label="Ethereum wallet" data-ld-field="wallet">${this.wallets.map((w) => `<option value="${esc(w.info.uuid)}" ${this.values.wallet === w.info.uuid ? "selected" : ""}>${esc(w.info.name)}</option>`).join("")}</select>` : ""}${B("connect", "Connect wallet ↗", true)}`;
  }
  reviewHTML() {
    const s = this.state,
      p = s.plan,
      r = s.review,
      pending = s.pending,
      approval = r?.approval || r?.allowance,
      execution = r?.execution || p?.execution || s.execution;
    if (pending)
      return `<section class="ld-transaction"><span class="ld-eyebrow">TRANSACTION SUBMITTED</span><h3>${esc(pending.purpose)}</h3><p>${esc(pending.recoveryMessage || (pending.reorgs ? "The previous inclusion was reorganized. Checking the original transaction and any wallet replacement." : "Waiting for the chain to confirm."))} ${this.chain.storage ? "The transaction hash is saved on this device." : "Copy the transaction hash; persistent browser storage is unavailable."}</p>${link(pending.chainId, pending.effectiveHash || pending.hash)}${B("recover", "Check confirmation")}<details><summary>Replaced or cancelled in your wallet?</summary>${F("replacementHash", "Replacement transaction hash", this.values.replacementHash || "")}${B("recover-replacement", "Reconcile wallet transaction")}</details></section>`;
    if (!p) return "";
    return `<section class="ld-transaction" tabindex="-1"><span class="ld-eyebrow">${r ? "REVIEW BEFORE SIGNING" : "TRANSACTION PREPARED"}</span><h3>${esc(r?.purpose || p.purpose || p.summary?.purpose || "Your onchain launch")}</h3><div class="ld-two"><div>${facts({ Network: s.network || s.chainId, "Signing account": s.address, "Funding account": p.payer || s.payer || s.address, "Execution authority": execution?.mode === "nft" ? "NFT " + execution.tokenId + " account; recipients and rights follow the terms below" : "Connected wallet; recipients and rights follow the terms below", Contract: r?.request.to || p.request.to || "New deployment" })}${Object.entries(
      p.summary || {},
    )
      .filter(([k]) => !["purpose", "creationHash", "compiler"].includes(k))
      .map(([k, v]) => fact(k, typeof v === "object" ? json(v) : v))
      .join(
        "",
      )}</div><div>${r ? facts({ Step: r.final ? "Execute operation" : "Token approval", "Maximum network fee": amount(r.maximumGasCost) + " " + this.native(), "Native currency sent": amount(r.request.value) + " " + this.native(), "Approval amount": approval ? (this.approvalToken ? amount(approval.amount, this.approvalToken.decimals) + " " + this.approvalToken.symbol : approval.amount + " raw token units") : "No additional approval", "Approval spender": approval?.spender || "—", "Approval duration": approval?.atomic ? "Exact allowance set and cleared inside this one transaction" : approval ? "Until spent or revoked" : "—", ...(execution?.mode === "nft" ? { "Native paid by NFT": amount(execution.value || 0) + " " + this.native(), "NFT action nonce": execution.nonce || "Read at review", "Inner target": execution.target || p.request.to } : {}) }) : "<p>The next step checks the exact call, token permissions, balance and estimated network fee.</p>"}<p class="ld-note">Your wallet signs each transaction. Changing terms or accounts invalidates this review. ${p.kind?.includes("hook") ? "Each swap enforces its accepted creator-fee maximum. Any committed fee policy is shown in the operation terms." : ""}</p></div></div><details><summary>Exact transaction data</summary><pre>${esc(json({ walletTransaction: r?.request || p.request, ...(r?.innerRequest ? { nftOperation: r.innerRequest } : {}) }))}</pre></details><div class="ld-actions">${r ? B("send", r.final ? "Sign & submit ↗" : "Sign exact approval ↗", true) : B("review", "Review next transaction ↗", true)}${B("cancel-review", "Cancel review")}</div></section>`;
  }
  native() {
    return Number(this.chain.chainId) === 137 ? "POL" : "ETH";
  }
  settingsHTML() {
    const c = this.chain.config,
      v = this.values;
    return `<div class="ld-section-heading"><span>01 / CONNECTION</span><h3>Your chain. Your infrastructure.</h3><p>Connect once. Deploy the required ANIMA contracts here, or verify an existing deployment. Each deployment is a separate wallet transaction.</p></div><div class="ld-two"><section class="ld-panel">${select(
      "network",
      "Network",
      [
        [1, "Ethereum"],
        [42161, "Arbitrum"],
        [137, "Polygon"],
      ],
      v.network || this.state.chainId || 1,
    )}${B("switch", "Switch wallet network")}<div class="ld-facts">${facts({ PoolManager: c.manager || "Connect to load", Quoter: c.quoter || "Connect to load" })}</div><p class="ld-note">Addresses follow the <a href="https://developers.uniswap.org/deployments" target="_blank" rel="noopener noreferrer">Uniswap deployment registry</a>.</p></section><section class="ld-panel"><h4>Pool infrastructure</h4>${["factory", "router"].map((k) => `<div class="ld-setup-row"><div><b>${k === "factory" ? "Launch factory" : "Swap router"}</b><small>${esc(c[k] || "Not deployed for this workspace")}</small></div>${!c[k] ? B("setup:" + k, "Deploy ↗") : ""}</div>`).join("")}<p class="ld-note">The launch factory creates the fixed-supply token and funded pool atomically. The router handles subsequent swaps.</p>${this.continueDraft ? B("continue-draft", "Continue my launch ↗", true) : ""}</section></div><details class="ld-panel"><summary>Use existing deployments</summary><div class="ld-two">${[
      ["factory", "ANIMA pool factory"],
      ["router", "ANIMA swap router"],
      ["hookFactory", "Hooked pool factory"],
      ["create2", "Hook address factory"],
      ["hook", "Creator-fee hook"],
      ["splitter", "Fee splitter"],
    ]
      .map(([k, l]) => F(k, l, v[k] ?? c[k] ?? ""))
      .join(
        "",
      )}</div>${B("configure", "Verify & save addresses", true)}<p class="ld-note">Contract code and its linked authority are checked. An address alone is not accepted as a compatible contract.</p></details><section class="ld-panel"><h4>Funding asset</h4><div class="ld-two">${F("asset", "Paired ERC20 address", v.asset || this.studio.d.quoteToken, "Its symbol, decimals and your balance are read from the selected chain.")}${F("wrapAmount", "Amount of native currency to wrap", v.wrapAmount || "")}</div><div class="ld-actions">${B("read-asset", "Read asset & use in composer")}${USDC[Number(this.chain.chainId)] ? B("usdc", "Use native USDC") : ""}${B("wrap", "Review wrap transaction")}</div>${this.asset ? facts({ Token: this.asset.symbol, Decimals: this.asset.decimals, "Selected funding balance": this.asset.formattedBalance }) : ""}<p class="ld-note">Wrapping calls deposit() on the entered wrapped-native contract. Use the canonical wrapped token for this network; a ticker is not proof of identity.</p></section>`;
  }
  positionsHTML() {
    const entries = this.chain.records.filter(
      (r) =>
        r.status === "confirmed" &&
        r.final &&
        r.launch &&
        Number(r.chainId) === this.state.chainId,
    );
    return `<div class="ld-section-heading"><span>02 / AFTER THE LAUNCH</span><h3>A market you can manage.</h3><p>Inspect live balances, trade through your pool, or redeem the liquidity shares you own.</p></div><div class="ld-two"><section class="ld-panel"><h4>Your confirmed launches</h4>${
      entries.length
        ? entries
            .slice()
            .reverse()
            .map(
              (r) =>
                `<button type="button" class="ld-launch-row" data-ld="position:${esc(r.launch.position)}"><span>${esc(r.summary.symbol || r.summary.name || "Token launch")}<small>${esc(short(r.launch.token))}</small></span><span>Manage ↗</span></button>`,
            )
            .join("")
        : "<p>No confirmed launches recorded on this device for the connected chain.</p>"
    }${F("position", "Open a liquidity-share contract", this.values.position || "")}${B("inspect-position", "Inspect position", true)}<p class="ld-note">You can import a position created elsewhere. Ownership and balances come from the chain.</p></section><section class="ld-panel"><h4>Transaction history</h4>${B("recover", "Refresh receipts")}${this.historyHTML()}</section></div>${this.position ? this.positionHTML() : ""}`;
  }
  historyHTML() {
    const rows = this.chain.records.filter(
      (r) => Number(r.chainId) === this.state.chainId,
    );
    return rows.length
      ? rows
          .slice(-15)
          .reverse()
          .map(
            (r) =>
              `<div class="ld-history"><div><b>${esc(r.purpose)}</b><span class="ld-badge ${r.status === "confirmed" ? "ld-good" : ""}">${esc(r.status)}${r.status === "confirmed" ? " · " + esc(r.confirmationState || "included") : ""}</span></div><small>${link(r.chainId, r.effectiveHash || r.hash, short(r.effectiveHash || r.hash) + " ↗")}${r.replacementHash ? " · wallet replacement" : ""}${r.confirmations ? " · " + esc(r.confirmations) + " confirmation(s)" : ""}</small></div>`,
          )
          .join("")
      : "<p>Signed operations and their real receipts appear here.</p>";
  }
  positionHTML() {
    const p = this.position,
      v = this.values;
    return `<section class="ld-panel ld-position-detail"><div class="ld-panel-heading"><h3>${esc(p.token0.symbol)} / ${esc(p.token1.symbol)}</h3>${B("inspect-position", "Refresh from chain")}</div><div class="ld-metrics">${facts({ "Your LP shares": p.formattedShares, [p.token0.symbol + " redeemable"]: p.preview.formatted0, [p.token1.symbol + " redeemable"]: p.preview.formatted1, "Pool fee": p.key.fee / 10000 + "%" })}</div><p class="ld-note">Redeemable amounts include principal and earned LP fees. Shares are transferable and withdrawable; they are not permanently locked.</p><div class="ld-two"><section><h4>Trade this market</h4>${select(
      "swapDirection",
      "Pay with",
      [
        [p.token0.address, p.token0.symbol],
        [p.token1.address, p.token1.symbol],
      ],
      v.swapDirection || p.token0.address,
    )}${F("swapAmount", "Amount", v.swapAmount)}${F("slippageBps", "Maximum slippage · basis points", v.slippageBps, "50 = 0.5%. Each quote is checked by the actual v4 Quoter.")}${B("swap", "Get quote & prepare swap ↗", true)}</section><section><h4>Withdraw liquidity</h4>${F("redeemShares", "LP shares to redeem", v.redeemShares || p.formattedShares)}<div class="ld-actions">${B("max-shares", "Use all my shares")}${B("redeem", "Review withdrawal ↗", true)}${B("lock-position", "Lock these LP shares")}</div>${facts({ Position: p.position, "Token 0": p.token0.address, "Token 1": p.token1.address, Hook: p.key.hooks === ZeroAddress ? "None" : p.key.hooks, "Read at block": p.blockNumber })}</section></div></section>`;
  }
  salesHTML() {
    return `<div class="ld-section-heading"><span>03 / COMMUNITY CAPITAL</span><h3>One raise. A shared beginning.</h3><p>Contribute while a sale is open, withdraw before its close, then settle and claim tokens or a full refund.</p></div><section class="ld-panel"><div class="ld-two">${F("saleId", "Sale number", this.values.saleId)}</div><div class="ld-actions">${B("list-sales", "Browse verified sales", true)}${B("read-sale", "Open this sale")}${B("create-sale", "Create a sale")}</div></section><div id="ld-sales-list">${(this.saleList || []).map((s) => this.saleCard(s)).join("")}${this.saleNext ? B("sale-next", "Next page →") : ""}</div>${this.sale ? this.saleDetailHTML() : ""}${renderSaleSetup({ config: this.chain.config, values: this.values, account: this.chain.address })}`;
  }
  saleCard(s) {
    return `<button class="ld-sale-row" data-ld="sale:${esc(s.id)}" type="button"><span>Sale ${esc(s.id)}<small>${esc(s.name || s.token?.symbol || short(s.token?.address || s.token))}</small></span><span>${esc(s.phase || s.state || s.status)} ↗</span></button>`;
  }
  saleDetailHTML() {
    return (
      renderSaleDetail(this.sale, {
        amount: this.values.saleAmount,
        native: this.native(),
      }) + this.participantLink("community", this.sale.launchpad, this.sale.id)
    );
  }

  auctionHTML() {
    const v = this.values,
      a = this.auction;
    return `<div class="ld-section-heading"><span>04 / PRICE DISCOVERY</span><h3>Let demand find its price.</h3><p>ANIMA’s streaming auction releases token lots over a block schedule. Standing bids reserve native currency; clearing, cancellations and claims are executable onchain.</p></div><section class="ld-panel"><div class="ld-two">${F("auctionAddress", "Auction contract", v.auctionAddress || "")}${F("auctionRecipient", "Claim recipient", v.auctionRecipient || this.chain.address || "")}</div>${B("inspect-auction", "Open auction", true)}</section>${a ? this.auctionDetailHTML() : ""}<details class="ld-panel"><summary>Create a streaming auction</summary><p>Choose an existing token you own. Deployment is followed by a separate exact-budget funding transaction; bidding opens only when the contract is funded and its start block arrives.</p><div class="ld-two">${F("auctionToken", "Token contract", v.auctionToken || "")}${F("lotSize", "Tokens per lot", v.lotSize)}${F("totalLots", "Number of lots", v.totalLots)}${F("reservePrice", "Reserve price · " + this.native() + " per lot", v.reservePrice)}${F("startBlock", "Opening block", v.startBlock || "")}${F("endBlock", "Closing block", v.endBlock || "")}</div><div class="ld-actions">${B("auction-block", "Read current block")}${B("auction-deploy", "Review auction deployment ↗", true)}</div><p class="ld-note">This is the ANIMA auction contract in your edition. It has 64 active bid slots and no automatic DEX migration. Seller proceeds and unsold inventory are claimed separately.</p></details>`;
  }
  auctionDetailHTML() {
    const a = this.auction,
      v = this.values,
      s = a.state;
    const seller = s.seller.toLowerCase() === this.chain.payer?.toLowerCase();
    return `<section class="ld-panel ld-auction-detail"><div class="ld-panel-heading"><h3>${esc(a.token.symbol)} · Streaming auction</h3><span class="ld-badge">${esc(a.phase)}</span></div><div class="ld-metrics">${facts({ Funded: a.funded ? "Yes" : "No", "Tokens per lot": a.lotTokens, "Released lots": s.releasedLots, "Sold lots": s.soldLots, "Total lots": s.totalLots, "Reserve / lot": a.reservePerLot + " " + this.native() })}</div><p class="ld-note">${esc(a.disclosure)}</p><div class="ld-two"><section><h4>${a.phase === "active" ? "Place a standing bid" : "Auction schedule"}</h4>${facts({ "Opening block": s.startBlock, "Closing block": s.endBlock, "Read at block": a.currentBlock, "Available bid slots": a.availableSlots })}${a.phase === "active" ? F("auctionLots", "Lots", v.auctionLots) + F("auctionLimit", "Maximum " + this.native() + " per lot", v.auctionLimit) + B("auction-bid", "Review funded bid ↗", true) : ""}</section><section><h4>Settle & receive</h4>${facts({ "Claimable tokens": amount(a.claims.tokens, a.token.decimals) + " " + a.token.symbol, "Your refundable funds": amount(a.claims.refund) + " " + this.native(), ...(seller ? { "Seller proceeds": amount(a.claims.proceeds) + " " + this.native() } : {}) })}<div class="ld-actions">${a.funded && !a.closed && BigInt(a.currentBlock) > BigInt(s.startBlock) ? B("auction:checkpoint", "Clear released lots") : ""}${BigInt(a.claims.tokens) > 0n ? B("auction:claimTokens", "Claim tokens") : ""}${BigInt(a.claims.refund) > 0n ? B("auction:claimRefund", "Claim refund") : ""}${BigInt(a.claims.proceeds) > 0n && seller ? B("auction:claimProceeds", "Claim seller proceeds") : ""}${a.phase === "unfunded" && seller ? B("auction-fund", "Fund auction", true) : ""}${seller && !a.closed && BigInt(a.currentBlock) < BigInt(s.startBlock) ? B("auction:cancelBeforeStart", "Cancel before opening") : ""}${B("inspect-auction", "Refresh")}</div></section></div>${a.ownBids.length ? `<h4>Your standing bids</h4>${a.ownBids.map((b) => `<div class="ld-setup-row"><span>Slot ${esc(b.slot)} · ${esc(b.remainingLots ?? b.lots)} lots · ${esc(amount(b.limitPrice))} ${this.native()} / lot</span>${B("auction-cancel:" + b.slot + ":" + b.sequence, "Cancel remaining bid")}</div>`).join("")}` : ""}${this.participantLink("auction", a.auction)}<details><summary>Exact contract state</summary><pre>${esc(json(a))}</pre></details></section>`;
  }

  feesHTML() {
    const c = this.chain.config,
      v = this.values,
      h = this.hookInfo;
    return `<div class="ld-section-heading"><span>05 / FLOW OF VALUE</span><h3>Give every fee a destination.</h3><p>Creator fees accrue in the traded input asset. Flush them to the chosen recipient or splitter, then each beneficiary claims their share.</p></div><section class="ld-panel"><div class="ld-two">${F("hook", "Creator-fee hook", v.hook ?? c.hook ?? "")}${F("feeCurrency", "Earned token address", v.feeCurrency || this.position?.token0.address || this.studio.d.quoteToken || "")}</div>${B("inspect-fees", "Read fee stream", true)}${h ? `<div class="ld-fee-detail"><div class="ld-facts">${facts({ Owner: h.owner, "Creator fee": Number(h.feePpm) / 10000 + "%", Recipient: h.recipient, Route: h.viaSplitter ? "Weighted recipient claims" : "Direct recipient", "Accrued in hook": h.formattedAccrued ?? h.accrued ?? "Choose an asset", "Your splitter claim": this.splitterInfo?.formattedClaimable ?? "—" })}</div><div class="ld-actions">${B("flush-fees", "Review fee distribution ↗", true)}${h.viaSplitter ? B("claim-fees", "Claim my earned share") : ""}</div><p class="ld-note">Existing splitter claims belong to their beneficiaries. Updating weights affects future deposits, including accrued hook fees when they are flushed.</p></div>` : ""}</section><details class="ld-panel"><summary>Hook setup & future fee configuration</summary><div class="ld-setup-list">${[
      ["hookFactory", "Hooked launch factory", "factory"],
      ["create2", "Hook address factory", "create2"],
      ["splitter", "Weighted fee splitter", "splitter"],
    ]
      .map(
        ([k, l, act]) =>
          `<div class="ld-setup-row"><div><b>${l}</b><small>${esc(c[k] || "Not deployed")}</small></div>${!c[k] ? B("hook-setup:" + act, "Deploy ↗") : ""}</div>`,
      )
      .join(
        "",
      )}</div><p>Recipient addresses, weights and creator fee are taken from your launch composition.</p><div class="ld-actions">${!c.hook ? B("deploy-hook", "Find address & prepare hook ↗", true) : B("configure-hook", "Apply composer fee to future swaps")}${c.splitter ? B("configure-split", "Apply composer recipient weights") : ""}${B("tab:create", "Edit fee composition")}</div><p class="ld-note">The hook owner can change future fees and their destination. It cannot seize existing token balances or liquidity shares. This additional fee is independent of the immutable pool fee.</p></details>`;
  }
  async connect() {
    const selected =
      this.wallets.find((w) => w.info.uuid === this.values.wallet) ||
      this.wallets[0];
    await this.chain.connect(selected?.provider || globalThis.ethereum);
    await this.reconcile();
    this.position = null;
    this.sale = null;
    this.auction = null;
    this.hookInfo = null;
    this.splitterInfo = null;
    this.notice(
      "Connected to " +
        this.state.network +
        ". Your wallet signs only after a transaction review.",
    );
    this.paint();
  }
  async prepareDraft(d) {
    if (this.working) throw Error("Finish the current operation first.");
    return this.run(async () => {
      this.continueDraft = structuredClone(d);
      if (d.funding === "private" && d.mode === "pool") {
        await this.openPrivateDraft(d);
        return;
      }
      if (!this.chain.address) {
        await this.connect();
      }
      if (d.mode === "sale") {
        if (!this.chain.config.saleLaunchpad && !this.values.saleLaunchpad) {
          this.tab = "sales";
          this.paint();
          throw Error(
            "Deploy the community infrastructure below or load your existing sealed launchpad, then return to Create.",
          );
        }
        const block = await this.chain.provider.getBlock("latest");
        await this.sales.create({
          launchpad:
            this.values.saleLaunchpad || this.chain.config.saleLaunchpad,
          name: d.name,
          symbol: d.symbol,
          about: d.purpose,
          supply: d.supply,
          opens: block.timestamp + 300,
          closes: block.timestamp + 300 + Number(d.hours) * 3600,
          softCap: d.soft,
          hardCap: d.hard,
          founderBps: rate(d.founderPercent, 200000) / 100,
          liquidityBps: rate(d.liquidityPercent, 1000000) / 100,
          vestingDays: Number(d.vestingDays || 180),
        });
      } else {
        await this.preparePool(d);
      }
      this.notice(
        "Onchain terms prepared. Review the next transaction before signing.",
      );
      this.paint();
      this.focusReview();
    });
  }
  async preparePool(d) {
    const generation = this.chain.generation;
    if (!d.quoteToken) {
      this.tab = "settings";
      this.paint();
      throw Error(
        "Choose the actual paired token in Setup so its balance and decimals can be read.",
      );
    }
    const input = {
      name: d.name,
      symbol: d.symbol,
      supply: d.supply,
      quoteToken: d.quoteToken,
      tokenBudget: d.tokenBudget,
      quoteBudget: d.quoteBudget,
      price: d.price,
      fee: rate(d.feePercent),
      tickSpacing: Number(d.tickSpacing),
      range:
        d.range === "full"
          ? { mode: "full" }
          : { lower: d.lowerPrice, upper: d.upperPrice },
      salt: hexlify(randomBytes(32)),
    };
    const actualQuote = await this.chain.readToken(d.quoteToken);
    await this.chain.assertContext(generation);
    if (
      actualQuote.decimals !== Number(d.quoteDecimals) ||
      actualQuote.symbol !== d.quoteSymbol
    ) {
      Object.assign(this.studio.d, {
        quoteDecimals: String(actualQuote.decimals),
        quoteSymbol: actualQuote.symbol,
      });
      this.tab = "create";
      this.paint();
      throw Error(
        "The paired contract is " +
          actualQuote.symbol +
          " with " +
          actualQuote.decimals +
          " decimals. The composer now shows its actual units; review price and budgets before continuing.",
      );
    }
    if (!d.hookEnabled) {
      if (!this.chain.config.factory) {
        this.tab = "settings";
        this.paint();
        throw Error(
          "Deploy the launch factory below, then continue your saved launch.",
        );
      }
      await this.chain.prepareLaunch(input);
    } else {
      const c = this.chain.config;
      if (!c.hookFactory || !c.hook) {
        this.tab = "fees";
        this.paint();
        throw Error(
          "Deploy the fee infrastructure below. Each step is a wallet transaction; your launch composition stays saved.",
        );
      }
      const configured = await hooks.inspectHook(this.chain.provider, c, {});
      input.expectedHookOwner = configured.owner;
      input.expectedHookFeePpm = String(rate(d.hookPercent, 999999));
      input.expectedHookRecipient = configured.recipient;
      input.expectedHookViaSplitter = configured.viaSplitter;
      if (Number(configured.feePpm) !== rate(d.hookPercent, 999999))
        throw Error(
          "The deployed hook fee differs from your composition. Apply the composer fee in Fee streams first.",
        );
      if (!configured.viaSplitter || !configured.splitter)
        throw Error(
          "This composition requires the configured recipient splitter.",
        );
      const recipients = d.recipients.map((r) => getAddress(r.recipient)),
        weights = d.recipients.map((r) => BigInt(r.weight));
      input.expectedSplitRecipients = recipients;
      input.expectedSplitWeights = weights.map(String);
      if (
        json(configured.splitter.recipients) !== json(recipients) ||
        json(configured.splitter.weights.map(String)) !==
          json(weights.map(String))
      )
        throw Error(
          "The deployed recipient weights differ. Apply the composer weights in Fee streams first.",
        );
      const quote = await this.chain.readToken(d.quoteToken);
      const initial = await hooks.hookedLaunchPlan(
        this.chain.provider,
        c,
        input,
        this.chain.payer || this.chain.address,
      );
      const ticks = resolveHumanRange(
        input.range,
        quote.decimals,
        BigInt(initial.summary.token) < BigInt(d.quoteToken),
        input.tickSpacing,
      );
      const plan = await hooks.hookedLaunchPlan(
        this.chain.provider,
        c,
        { ...input, ...ticks },
        this.chain.payer || this.chain.address,
      );
      plan.summary = {
        ...plan.summary,
        name: d.name,
        symbol: d.symbol,
        supply: d.supply,
      };
      await this.chain.assertContext(generation);
      await this.chain.prepareExternal(
        { ...plan, payer: this.chain.payer || this.chain.address },
        { nftCompatible: true },
      );
    }
  }
  async openPrivateDraft(d) {
    const values = {
      name: d.name,
      symbol: d.symbol,
      supply: d.supply,
      quoteToken: d.quoteToken,
      tokenBudget: d.tokenBudget,
      quoteBudget: d.quoteBudget,
      price: d.price,
      fee: rate(d.feePercent),
      tickSpacing: Number(d.tickSpacing),
      creatorHook: Boolean(d.hookEnabled),
      ...(d.hookEnabled
        ? {
            hookFactory:
              this.values.hookFactory || this.chain.config.hookFactory || "",
            hook: this.values.hook || this.chain.config.hook || "",
            expectedHookFeePpm: String(rate(d.hookPercent, 999999)),
            expectedHookViaSplitter: true,
            expectedSplitRecipients: d.recipients.map((r) =>
              getAddress(r.recipient),
            ),
            expectedSplitWeights: d.recipients.map((r) => String(r.weight)),
            ...(this.values.splitter || this.chain.config.splitter
              ? {
                  expectedHookRecipient:
                    this.values.splitter || this.chain.config.splitter,
                }
              : {}),
            ...(this.chain.config.hookOwner
              ? { expectedHookOwner: this.chain.config.hookOwner }
              : {}),
          }
        : {}),
    };
    if (d.range !== "full")
      Object.assign(values, {
        humanLowerPrice: d.lowerPrice,
        humanUpperPrice: d.upperPrice,
      });
    const imported = await this.privateDesk.importLaunchDraft({
      values,
      ...(this.state.chainId ? { chainId: this.state.chainId } : {}),
      factory: this.chain.config.factory,
      router: this.chain.config.router,
      hookFactory: this.values.hookFactory || this.chain.config.hookFactory,
      hook: this.values.hook || this.chain.config.hook,
    });
    this.tab = "private";
    this.notice(
      imported.restartRequired
        ? "Shielded launch selected. Open your encrypted wallet and explicitly start its configured private network session."
        : "Shielded launch selected for the current private network session. Review its funding, hook and recipients before proving.",
    );
    this.paint();
  }
  async external(builder) {
    const generation = this.chain.generation;
    await this.chain.assertContext(generation);
    const plan = await builder();
    await this.chain.assertContext(generation);
    if (plan.kind?.startsWith("auction-"))
      return auctions.prepareAuctionOperation(this.chain, plan);
    const nftCompatible = [
      "hooked-launch",
      "hooked-swap",
      "hook-flush",
      "hook-claim",
      "hook-configure",
      "split-configure",
    ].includes(plan.kind);
    return this.chain.prepareExternal(
      {
        ...plan,
        payer: nftCompatible
          ? this.chain.payer || this.chain.address
          : this.chain.address,
      },
      { nftCompatible },
    );
  }
  async setupHook(kind) {
    const d = this.studio.d;
    const input = {
      kind,
      owner: this.chain.address,
      recipients: d.recipients.map((r) => r.recipient),
      weights: d.recipients.map((r) => r.weight),
    };
    await this.external(() =>
      hooks.hookInfrastructurePlan(
        this.chain.provider,
        this.chain.config,
        input,
        this.chain.address,
      ),
    );
  }
  focusReview() {
    this.root?.querySelector(".ld-transaction")?.focus();
    this.root
      ?.querySelector("#ld-review")
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  async reconcile() {
    for (const r of this.chain.records.filter(
      (r) => r.status !== "confirmed" && r.reorgs,
    )) {
      delete r.sale;
      delete r.integrated;
      if (r.kind?.startsWith("official-")) {
        this.protocolsDesk.rollback(r);
        const prefix = `${r.chainId}:${r.effectiveHash || r.hash}:`;
        for (const key of this.reconciledProtocols || [])
          if (key.startsWith(prefix)) this.reconciledProtocols.delete(key);
      }
    }
    for (const r of this.chain.records.filter(
      (r) =>
        r.status === "confirmed" &&
        r.final &&
        Number(r.chainId) === this.state.chainId,
    )) {
      if (r.kind?.startsWith("lifecycle-"))
        await this.lifecycleDesk.applyReceipt(r);
      if (r.kind?.startsWith("official-")) {
        const receiptKey = `${r.chainId}:${r.effectiveHash || r.hash}:${r.blockHash || ""}`;
        this.reconciledProtocols ||= new Set();
        if (!this.reconciledProtocols.has(receiptKey)) {
          const receipt = await this.chain.provider.getTransactionReceipt(
            r.effectiveHash || r.hash,
          );
          if (receipt) {
            await this.protocolsDesk.receipt({ ...r, receipt });
            this.reconciledProtocols.add(receiptKey);
          }
        }
      }
      if (
        (r.kind === "hook-setup" || r.kind === "hook-deploy") &&
        !r.integrated
      ) {
        const v = r.meta.verification || r.verification,
          a = r.meta.predictedAddress;
        await hooks.verifyHookContract(this.chain.provider, a, v.name, v);
        const map = {
          factory: "hookFactory",
          create2: "create2",
          splitter: "splitter",
          hook: "hook",
        };
        await this.chain.configure({ [map[r.meta.deploymentType]]: a });
        r.integrated = true;
      }
      if (r.kind === "hooked-launch" && !r.launch) {
        const receipt = await this.chain.provider.getTransactionReceipt(
          r.effectiveHash || r.hash,
        );
        const iface = new Interface(HOOK_ARTIFACTS.GenesisV4HookLaunchpad.abi);
        const event = receipt.logs
          .filter(
            (l) =>
              l.address.toLowerCase() ===
              (r.innerRequest?.to || r.request.to).toLowerCase(),
          )
          .map((l) => {
            try {
              return iface.parseLog(l);
            } catch {
              return null;
            }
          })
          .find((e) => e?.name === "Launched");
        if (
          !event ||
          getAddress(event.args.token) !== getAddress(r.summary.token) ||
          getAddress(event.args.position) !== getAddress(r.summary.position)
        )
          throw Error(
            "Confirmed launch event does not match the reviewed addresses.",
          );
        r.launch = {
          token: getAddress(event.args.token),
          position: getAddress(event.args.position),
          hook: r.summary.hook,
        };
      }
      if (r.kind === "sale-setup" && !r.integrated) {
        const kind = r.meta.setupKind;
        if (kind !== "seal") {
          const receipt = await this.chain.provider.getTransactionReceipt(
              r.effectiveHash || r.hash,
            ),
            address = getAddress(receipt.contractAddress);
          if (address !== getAddress(r.meta.predictedAddress))
            throw Error(
              "Community deployment address differs from its receipt.",
            );
          const contract = await verifySaleContract(
            this.chain.provider,
            address,
            r.meta.contractName,
          );
          if (kind === "ledger") {
            if (
              getAddress(await contract.collection()) !==
              getAddress(r.summary.collection)
            )
              throw Error(
                "Ledger collection differs from the reviewed address.",
              );
          } else if (
            getAddress(await contract.ledger()) !== getAddress(r.summary.ledger)
          )
            throw Error("Community module uses another ledger.");
          const field = {
            ledger: "saleLedger",
            market: "saleMarket",
            vault: "saleVault",
            launchpad: "saleLaunchpad",
          }[kind];
          await this.chain.configure({
            [field]: address,
            ...(kind === "ledger"
              ? { saleCollection: r.summary.collection }
              : {}),
          });
          this.values[field] = address;
          r.contractAddress = address;
        } else {
          const scope = await this.sales.verify(r.summary.launchpad);
          await this.chain.configure({
            saleLaunchpad: scope.launchpad,
            saleLedger: scope.ledger,
            saleMarket: scope.market,
            saleVault: scope.vault,
            saleCollection: scope.collection,
          });
        }
        r.integrated = true;
      }
      if (r.kind === "sale-create" && !r.sale) {
        const receipt = await this.chain.provider.getTransactionReceipt(
            r.effectiveHash || r.hash,
          ),
          iface = new Interface(SALE_ARTIFACTS.GenesisLaunchpad.abi);
        const events = receipt.logs
          .filter(
            (l) =>
              l.address.toLowerCase() ===
              (r.innerRequest?.to || r.request.to).toLowerCase(),
          )
          .map((l) => {
            try {
              return iface.parseLog(l);
            } catch {
              return null;
            }
          })
          .filter((e) => e?.name === "Launched");
        if (
          events.length !== 1 ||
          getAddress(events[0].args.creator) !==
            getAddress(r.payer || r.account)
        )
          throw Error("The confirmed sale did not match its creation receipt.");
        r.sale = {
          id: String(events[0].args.id),
          token: getAddress(events[0].args.token),
          launchpad: r.innerRequest?.to || r.request.to,
        };
      }
      if (r.kind === "auction-deploy" && !r.integrated) {
        const address = r.meta.predictedAddress;
        const receipt = await this.chain.provider.getTransactionReceipt(
          r.effectiveHash || r.hash,
        );
        if (getAddress(receipt.contractAddress) !== getAddress(address))
          throw Error(
            "Auction receipt address differs from the reviewed deployment.",
          );
        await auctions.verifyAuctionContract(
          this.chain.provider,
          address,
          r.meta.verification,
        );
        r.contractAddress = address;
        r.integrated = true;
      }
    }
    this.chain.persist();
  }
  async action(key) {
    const c = this.chain,
      v = this.values;
    if (key.startsWith("group:")) {
      const group = tabGroups.find((g) => g.id === key.slice(6));
      if (!group) throw Error("Unknown launch section.");
      return this.action("tab:" + group.tabs[0]);
    }
    if (key.startsWith("tab:")) {
      c.invalidate();
      this.tab = key.slice(4);
      if (this.tab === "private") this.privateDesk.view = "wallet";
      if (this.tab === "lifecycle")
        this.lifecycleDesk.configure({
          vault:
            v.saleVault ||
            c.config.saleVault ||
            this.lifecycleDesk.values.vault,
          payer: c.payer || c.address,
        });
      if (this.tab === "strategies")
        this.strategiesDesk.configure({
          position:
            this.position?.position ||
            this.position?.address ||
            v.position ||
            this.strategiesDesk.d.position,
          router: c.config.router,
          splitter: c.config.splitter,
          hook: c.config.hook,
        });
      if (this.tab === "locks")
        this.vaultDesk.configure({
          vault: v.saleVault || c.config.saleVault,
          beneficiary: c.payer || c.address,
        });
      this.paint();
      return;
    }
    if (key === "connect") return this.connect();
    if (key === "disconnect") {
      c.disconnect();
      this.position = null;
      this.sale = null;
      this.auction = null;
      this.hookInfo = null;
      this.paint();
      return;
    }
    if (key === "switch") {
      await c.switchChain(Number(v.network || 1));
      this.position = null;
      this.sale = null;
      this.auction = null;
      this.paint();
      return;
    }
    if (key === "funding-wallet") {
      c.useWallet();
      this.clearFundingViews();
      this.notice(
        "Wallet funding selected. This wallet receives the launch assets.",
      );
      this.paint();
      return;
    }
    if (key === "funding-current-nft" || key === "funding-nft") {
      if (!c.address) await this.connect();
      const identity =
        key === "funding-current-nft"
          ? typeof this.outer?.nft === "function"
            ? await this.outer.nft()
            : this.outer?.nft
          : {
              collection: v.nftCollection,
              tokenId: v.nftTokenId,
              account: v.nftAccount || undefined,
            };
      if (!identity?.collection || identity.tokenId === undefined)
        throw Error(
          "Connect an owned NFT in the owner interface, or enter its collection and token number below.",
        );
      await c.useNFT(identity);
      this.clearFundingViews();
      this.notice(
        "NFT account verified. Its balances fund supported operations; your wallet signs and pays network fees.",
      );
      this.paint();
      return;
    }
    if (key === "recover-replacement") {
      await c.recoverReplacement(
        v.originalHash || c.pending()?.hash,
        v.replacementHash,
      );
      await this.reconcile();
      this.paint();
      return;
    }
    if (key === "review") {
      this.approvalToken = null;
      const review = await c.reviewNext();
      if (review.approval || review.allowance)
        this.approvalToken = await c.readToken(
          (review.approval || review.allowance).token,
        );
      this.refreshStatus();
      this.focusReview();
      return;
    }
    if (key === "cancel-review") {
      c.invalidate();
      return;
    }
    if (key === "send") {
      const result = await c.sendReviewed();
      await this.reconcile();
      const record = c.records.find((r) => r.hash === result.hash) || result;
      this.notice(
        record.status === "confirmed"
          ? record.final
            ? "Confirmed on chain."
            : "Exact approval confirmed. Review the next transaction."
          : "Submitted; waiting for confirmation.",
      );
      if (record.status === "confirmed" && record.final) {
        if (record.launch) {
          v.position = record.launch.position;
          this.position = await c.inspectPosition(record.launch.position);
          this.tab = "positions";
        } else if (record.sale) {
          v.saleId = record.sale.id;
          v.saleLaunchpad = record.sale.launchpad;
          this.sale = await this.sales.read({
            launchpad: v.saleLaunchpad,
            id: v.saleId,
          });
          this.tab = "sales";
        } else if (record.kind === "auction-deploy") {
          v.auctionAddress = record.contractAddress;
          this.auction = await auctions.inspectAuction(c.provider, {
            auction: v.auctionAddress,
            owner: c.payer,
          });
          this.tab = "auction";
        } else if (record.kind.startsWith("sale-") && record.meta.saleId) {
          this.sale = await this.sales.read({
            launchpad: record.meta.launchpad,
            id: record.meta.saleId,
          });
        } else if (record.kind.startsWith("auction-") && record.meta.auction) {
          v.auctionAddress = record.meta.auction;
          this.auction = await auctions.inspectAuction(c.provider, {
            auction: v.auctionAddress,
            owner: c.payer,
          });
        } else if (
          ["swap", "hooked-swap", "redeem"].includes(record.kind) &&
          this.position
        ) {
          this.position = await c.inspectPosition(this.position.position);
          v.redeemShares = this.position.formattedShares;
        } else if (
          record.kind.startsWith("hook-") ||
          record.kind === "split-configure"
        ) {
          this.hookInfo = null;
          this.splitterInfo = null;
        }
      }
      this.paint();
      return;
    }

    if (key === "recover") {
      await c.recoverTransactions();
      await this.reconcile();
      if (this.position) {
        try {
          this.position = await c.inspectPosition(this.position.position);
        } catch {
          this.position = null;
        }
      }
      this.sale = null;
      this.auction = null;
      this.notice(
        c.pending()
          ? "Still awaiting confirmation."
          : "Transaction receipts refreshed.",
      );
      this.paint();
      return;
    }
    if (key.startsWith("setup:")) {
      await c.prepareSetup(key.slice(6));
      this.focusReview();
      return;
    }
    if (key === "continue-draft") {
      const d = structuredClone(this.continueDraft || this.studio.d);
      if (d.mode === "sale") {
        throw Error("Return to the composer to prepare your community sale.");
      }
      await this.preparePool(d);
      this.paint();
      return;
    }
    if (key === "configure") {
      const config = {};
      for (const k of [
        "factory",
        "router",
        "hookFactory",
        "create2",
        "hook",
        "splitter",
        "saleLaunchpad",
      ])
        if (v[k]?.trim()) config[k] = getAddress(v[k].trim());
      for (const [k, name] of [
        ["hookFactory", "GenesisV4HookLaunchpad"],
        ["create2", "HookCreate2Factory"],
        ["hook", "OwnerV4FeeHook"],
        ["splitter", "OwnerFeeRouter"],
      ])
        if (config[k])
          await hooks.verifyHookContract(c.provider, config[k], name, {
            ...(["hookFactory", "hook"].includes(k)
              ? { manager: c.config.manager }
              : {}),
          });
      if (config.saleLaunchpad) await this.sales.verify(config.saleLaunchpad);
      await c.configure(config);
      this.notice("Deployment code and linked contracts verified.");
      this.paint();
      return;
    }
    if (key === "usdc") {
      v.asset = USDC[Number(c.chainId)];
    }
    if (key === "read-asset" || key === "usdc") {
      this.asset = await c.readToken(v.asset);
      Object.assign(this.studio.d, {
        quoteToken: this.asset.address,
        quoteSymbol: this.asset.symbol,
        quoteDecimals: String(this.asset.decimals),
      });
      if (this.continueDraft)
        Object.assign(this.continueDraft, {
          quoteToken: this.asset.address,
          quoteSymbol: this.asset.symbol,
          quoteDecimals: String(this.asset.decimals),
        });
      this.notice(
        "Read " +
          this.asset.symbol +
          " from chain. Available: " +
          this.asset.formattedBalance +
          ". Price and funding amounts were not converted.",
      );
      this.paint();
      return;
    }
    if (key === "wrap") {
      await c.prepareWrap(v.wrapAmount, v.asset);
      return;
    }
    if (key.startsWith("position:")) {
      v.position = key.slice(9);
      key = "inspect-position";
    }
    if (key === "inspect-position") {
      this.position = await c.inspectPosition(v.position);
      v.swapDirection = this.position.token0.address;
      v.redeemShares = this.position.formattedShares;
      this.paint();
      return;
    }
    if (key === "lock-position") {
      if (!this.position)
        throw Error("Inspect a position before choosing its lock.");
      this.vaultDesk.configure({
        vault: v.saleVault || c.config.saleVault,
        asset: this.position.position,
        beneficiary: c.payer || c.address,
      });
      this.vaultDesk.d.amount = this.position.formattedShares;
      this.tab = "locks";
      c.invalidate();
      this.paint();
      return;
    }
    if (key === "max-shares") {
      v.redeemShares = this.position.formattedShares;
      this.paint();
      return;
    }
    if (key === "swap") {
      const p = this.position,
        inputToken = v.swapDirection || p.token0.address,
        outputToken =
          inputToken.toLowerCase() === p.token0.address.toLowerCase()
            ? p.token1.address
            : p.token0.address,
        input = {
          inputToken,
          outputToken,
          amount: v.swapAmount,
          fee: p.key.fee,
          tickSpacing: p.key.tickSpacing,
          slippageBps: Number(v.slippageBps),
        };
      if (p.key.hooks !== ZeroAddress)
        await this.external(() =>
          hooks.hookedSwapPlan(
            c.provider,
            { ...c.config, hook: p.key.hooks },
            input,
          ),
        );
      else await c.prepareSwap(input);
      this.focusReview();
      return;
    }
    if (key === "redeem") {
      await c.prepareRedeem({
        position: this.position.position,
        shares: v.redeemShares || this.position.formattedShares,
        slippageBps: Number(v.slippageBps),
      });
      return;
    }
    if (key === "create-sale") {
      this.studio.d.mode = "sale";
      this.studio.step = 0;
      this.tab = "create";
      this.paint();
      return;
    }
    if (key.startsWith("sale:")) {
      v.saleId = key.slice(5);
      key = "read-sale";
    }
    const sale = {
      launchpad: v.saleLaunchpad || c.config.saleLaunchpad,
      id: v.saleId,
    };
    if (key === "sale-next") {
      v.saleStart = this.saleNext;
      key = "list-sales";
    }
    if (key === "list-sales") {
      const page = await this.sales.list({
        launchpad: sale.launchpad,
        start: v.saleStart || "1",
      });
      this.saleList = page.sales;
      this.saleNext = page.next;
      this.paint();
      return;
    }
    if (key === "read-sale") {
      this.sale = await this.sales.read(sale);
      this.paint();
      return;
    }
    if (key === "sale-load") {
      const scope = await this.sales.verify(
        v.saleLaunchpad || c.config.saleLaunchpad,
      );
      const config = {
        saleLaunchpad: scope.launchpad,
        saleLedger: scope.ledger,
        saleMarket: scope.market,
        saleVault: scope.vault,
        saleCollection: scope.collection,
      };
      await c.configure(config);
      Object.assign(v, config);
      this.saleList = (
        await this.sales.list({ launchpad: scope.launchpad })
      ).sales;
      this.notice("Sealed community infrastructure verified.");
      this.paint();
      return;
    }
    if (key.startsWith("sale-setup:")) {
      const input = {
        kind: key.slice(11),
        collection: v.saleCollection || c.config.saleCollection,
        ledger: v.saleLedger || c.config.saleLedger,
        market: v.saleMarket || c.config.saleMarket,
        vault: v.saleVault || c.config.saleVault,
        launchpad: v.saleLaunchpad || c.config.saleLaunchpad,
      };
      await this.sales.setup(input);
      return;
    }
    if (key.startsWith("sale-release:")) {
      await this.sales.release({ ...sale, lock: key.split(":")[1] });
      return;
    }
    if (key.startsWith("sale-")) {
      const method = {
        "sale-contribute": "contribute",
        "sale-withdraw": "withdraw",
        "sale-settle": "settle",
        "sale-claim": "claim",
      }[key];
      if (method) {
        await this.sales[method]({ ...sale, amount: v.saleAmount });
        this.focusReview();
        return;
      }
    }
    if (key === "auction-block") {
      const block = await c.provider.getBlock("latest");
      v.startBlock = String(block.number + 100);
      v.endBlock = String(block.number + 7300);
      this.notice(
        "Current block " +
          block.number +
          ". Review the opening and closing blocks; wall-clock timing varies by chain.",
      );
      this.paint();
      return;
    }
    if (key === "auction-deploy") {
      await this.external(() =>
        auctions.auctionDeployPlan(
          c.provider,
          c.config,
          {
            saleToken: v.auctionToken,
            lotSize: v.lotSize,
            totalLots: v.totalLots,
            reservePrice: v.reservePrice,
            startBlock: v.startBlock,
            endBlock: v.endBlock,
          },
          c.payer,
        ),
      );
      return;
    }
    if (key === "inspect-auction") {
      this.auction = await auctions.inspectAuction(c.provider, {
        auction: v.auctionAddress,
        owner: c.payer,
      });
      this.paint();
      return;
    }
    if (key === "auction-fund") {
      await this.external(() =>
        auctions.auctionFundPlan(
          c.provider,
          c.config,
          { auction: v.auctionAddress },
          c.payer,
        ),
      );
      return;
    }
    if (key === "auction-bid") {
      await this.external(() =>
        auctions.auctionBidPlan(
          c.provider,
          c.config,
          {
            auction: v.auctionAddress,
            lots: v.auctionLots,
            limitPrice: v.auctionLimit,
          },
          c.payer,
        ),
      );
      return;
    }
    if (key.startsWith("auction:") || key.startsWith("auction-cancel:")) {
      const parts = key.split(":"),
        input = {
          auction: v.auctionAddress,
          action: key.startsWith("auction-cancel:") ? "cancel" : parts[1],
          recipient: v.auctionRecipient || c.payer,
          slot: parts[1],
          expectedSequence: parts[2],
        };
      await this.external(() =>
        auctions.auctionActionPlan(c.provider, c.config, input, c.payer),
      );
      return;
    }
    if (key.startsWith("hook-setup:")) return this.setupHook(key.slice(11));
    if (key === "deploy-hook") {
      this.notice("Finding a compatible hook address…");
      await this.external(() =>
        hooks.hookDeployPlan(
          c.provider,
          c.config,
          {
            owner: c.address,
            feePpm: rate(this.studio.d.hookPercent, 999999),
            recipient: c.config.splitter,
            viaSplitter: true,
          },
          c.address,
          {
            onProgress: (p) =>
              this.notice(
                "Finding a compatible hook address · " +
                  p.attempts +
                  " checked",
              ),
          },
        ),
      );
      return;
    }
    if (key === "inspect-fees") {
      const currency =
        v.feeCurrency ||
        this.position?.token0.address ||
        this.studio.d.quoteToken;
      const token = await c.readToken(currency);
      this.hookInfo = await hooks.inspectHook(c.provider, c.config, {
        hook: v.hook || c.config.hook,
        currency,
      });
      this.hookInfo.formattedAccrued =
        amount(this.hookInfo.accrued, token.decimals) + " " + token.symbol;
      if (this.hookInfo.viaSplitter) {
        this.splitterInfo = await hooks.inspectSplitter(c.provider, {
          splitter: this.hookInfo.recipient,
          currency,
          beneficiary: c.payer || c.address,
        });
        this.splitterInfo.formattedClaimable =
          amount(this.splitterInfo.claimable, token.decimals) +
          " " +
          token.symbol;
      }
      v.feeCurrency = currency;
      this.paint();
      return;
    }
    if (key === "flush-fees") {
      await this.external(() =>
        hooks.hookFlushPlan(c.provider, c.config, {
          hook: v.hook || c.config.hook,
          currency: v.feeCurrency,
        }),
      );
      return;
    }
    if (key === "claim-fees") {
      await this.external(() =>
        hooks.hookClaimPlan(
          c.provider,
          c.config,
          { splitter: this.hookInfo.recipient, currency: v.feeCurrency },
          c.payer || c.address,
        ),
      );
      return;
    }
    if (key === "configure-hook") {
      await this.external(() =>
        hooks.configureHookPlan(
          c.provider,
          c.config,
          {
            hook: c.config.hook,
            feePpm: rate(this.studio.d.hookPercent, 999999),
            recipient: c.config.splitter,
            viaSplitter: true,
          },
          c.payer || c.address,
        ),
      );
      return;
    }
    if (key === "configure-split") {
      await this.external(() =>
        hooks.configureSplitPlan(
          c.provider,
          c.config,
          {
            splitter: c.config.splitter,
            recipients: this.studio.d.recipients.map((r) => r.recipient),
            weights: this.studio.d.recipients.map((r) => r.weight),
          },
          c.payer || c.address,
        ),
      );
      return;
    }
    throw Error("Unknown launchpad action.");
  }
  download(data, name) {
    const url = URL.createObjectURL(
        new Blob([json(data)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
export const launchDesk = new LaunchDesk();
