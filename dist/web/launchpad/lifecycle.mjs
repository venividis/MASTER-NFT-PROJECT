import { ZeroAddress, hexlify, randomBytes } from "../vendor/ethers.min.js";
import {
  LaunchLifecycleClient,
  verifyLifecycleReceipt,
} from "./lifecycle-client.mjs";
import { buildLaunchLink, recordToRoute } from "./links.mjs";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const json = (v) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? String(x) : x), 2);
const field = (k, label, v = "", type = "text") =>
  `<label class="ll-field"><span>${esc(label)}</span><input data-ll-field="${esc(k)}" type="${type}" value="${esc(v)}" autocomplete="off" spellcheck="false"></label>`;
const button = (a, label) =>
  `<button type="button" data-ll-action="${esc(a)}">${esc(label)}</button>`;
const facts = (x) =>
  `<dl class="ll-facts">${Object.entries(x)
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join("")}</dl>`;
export class LaunchLifecycleDesk {
  constructor({ chain, getDraft, onOpen = () => {} } = {}) {
    this.chain = chain;
    this.client = new LaunchLifecycleClient(chain);
    this.getDraft = getDraft;
    this.onOpen = onOpen;
    this.values = {
      registry: chain.config?.registry || "",
      composer: chain.config?.composer || "",
      auctionFactory: chain.config?.auctionFactory || "",
      vault: "",
      payer: "",
      id: "",
      kind: "community",
      target: "",
      mechanismId: "",
      name: "",
      symbol: "",
      supply: "1000000",
      tokenBudget: "800000",
      quoteBudget: "",
      price: "",
      quoteToken: "",
      hook: "",
      fee: "3000",
    };
    this.allocations = [];
    this.message = "";
    this.records = [];
    this.record = null;
    this.busy = false;
    this.root = null;
    this.plan = null;
    this.appliedReceipts = new Set();
  }
  configure(values) {
    Object.assign(this.values, values);
    return this;
  }
  render() {
    const v = this.values;
    return `<section class="ll-desk" aria-label="Launch lifecycle"><header><span class="ll-eyebrow">ANIMA / LAUNCH CONTINUITY</span><h2>Every launch has a home.</h2><p>Recover its contracts, beneficiaries and custody from the chain. Choose exactly where the new tokens and liquidity shares belong.</p></header><p data-ll-status role="status">${esc(this.message)}</p><div class="ll-grid"><section class="ll-card"><h3>Discover your launches</h3>${field("registry", "Verified registry address", v.registry)}${field("payer", "Payer or NFT account", v.payer || this.chain.payer || "")}<div class="ll-actions">${button("discover", "Read permanent records")}${button("more", "Next page")}</div><p>Discovery reads the registry’s own index. Changing devices or clearing browser history does not remove these records.</p>${this.records.map((r) => `<button class="ll-record" data-ll-action="record:${esc(r.id)}"><strong>Launch ${esc(r.id)} · ${esc(r.mechanism)}</strong><span>${esc(r.token)}</span><small>${esc(new Date(r.createdAt * 1000).toISOString())}</small></button>`).join("")}${field("id", "Open a record by ID", v.id)}${button("read", "Read record")}</section><section class="ll-card"><h3>One atomic launch</h3>${field("composer", "Verified allocation composer", v.composer)}<p>Your reviewed launch, token allocations, LP custody and permanent record succeed together. Any failed step reverses the entire transaction.</p>${this.getDraft ? "<p>Uses the token, liquidity and hook choices in your main launch form.</p>" : `${field("name", "Token name", v.name)}${field("symbol", "Symbol", v.symbol)}${field("supply", "Total supply", v.supply)}${field("tokenBudget", "Tokens offered to liquidity", v.tokenBudget)}${field("quoteToken", "Quote token", v.quoteToken)}${field("quoteBudget", "Quote funding", v.quoteBudget)}${field("price", "Starting quote price per token", v.price)}${field("hook", "Optional creator hook", v.hook)}`}
 <div class="ll-allocations">${this.allocations.map((a, i) => `<fieldset><legend>Allocation ${i + 1}</legend><label class="ll-field"><span>Asset</span><select data-ll-allocation="${i}" data-ll-key="asset"><option value="token" ${a.asset === "token" ? "selected" : ""}>Retained tokens</option><option value="lp" ${a.asset === "lp" ? "selected" : ""}>Liquidity shares</option></select></label>${["amount", "beneficiary", "days", "cliffDays"].map((k) => `<label class="ll-field"><span>${{ amount: "Amount or percentage (for example 25%)", beneficiary: "Beneficiary", days: "Days locked (0 = direct transfer)", cliffDays: "Cliff days" }[k]}</span><input data-ll-allocation="${i}" data-ll-key="${k}" value="${esc(a[k])}" autocomplete="off"></label>`).join("")}<label><input type="checkbox" data-ll-allocation="${i}" data-ll-key="linear" ${a.linear ? "checked" : ""}> Release gradually after the cliff</label>${button("remove:" + i, "Remove allocation")}</fieldset>`).join("")}</div><div class="ll-actions">${button("add", "Add an allocation")}${button("compose", "Review atomic launch")}</div><p>Unallocated tokens, LP shares and refunds return to the selected funding account. Percentages apply to guaranteed retained tokens or newly issued liquidity shares. Fixed beneficiaries can be wallets or NFT accounts. Selling an NFT transfers control of assets and beneficiary rights held by its account; it cannot accelerate a vault schedule.</p></section></div>${this.recordHTML()}<details class="ll-card"><summary>Register an existing launch</summary><p>The verified original LP recipient, community creator or auction seller publishes an observation of existing terms. This does not rewrite the historical funding transaction.</p><label class="ll-field"><span>Mechanism</span><select data-ll-field="kind"><option value="community" ${v.kind === "community" ? "selected" : ""}>Community sale</option><option value="auction" ${v.kind === "auction" ? "selected" : ""}>ANIMA streaming auction</option><option value="v4" ${v.kind === "v4" ? "selected" : ""}>Direct v4 pool</option></select></label>${field("target", "Launch contract or v4 LP position", v.target)}${field("mechanismId", "Community sale ID", v.mechanismId)}${button("register", "Verify source and review registration")}</details><details class="ll-card"><summary>Deploy and authorize infrastructure</summary><p>Deploy these once on the selected chain. All addresses are verified against this release before use. Registering records publishes payer linkage; keep shielded launches in their separate privacy flow unless you deliberately choose that disclosure.</p>${button("setup-registry", "Review registry deployment")}${button("setup-auction-factory", "Review NFT auction factory deployment")}${field("vault", "Installed TimeVault", v.vault)}${button("setup-composer", "Review composer deployment")}<div class="ll-actions">${button("authorize", "Authorize composer records")}${button("revoke", "Revoke composer records")}</div><p>Registrar authorization permits public records and links. Token spending has its own exact approval and transaction review.</p></details><div data-ll-review>${this.reviewHTML()}</div></section>`;
  }
  recordHTML() {
    const r = this.record;
    if (!r) return "";
    const participant = recordToRoute(r);
    return `<section class="ll-card"><h3>Launch ${esc(r.id)} · ${esc(r.mechanism)}</h3>${facts({ Token: r.token, "Recorded payer": r.payer, Registrar: r.registrar, "Mechanism contract": r.target, "Mechanism ID": r.mechanismId, "NFT collection": r.collection, "NFT ID": r.tokenId, "Liquidity position": r.position, "Pool ID": r.poolId, "Terms commitment": r.termsHash, "Creation block": r.createdBlock })}<p>${esc(r.provenance)}</p>${r.links.length ? `<h4>Custody, beneficiaries and lifecycle links</h4>${r.links.map((l) => facts({ Type: l.kind, Contract: l.target, "Reference ID": l.referenceId, Asset: l.asset, Beneficiary: l.beneficiary, "Amount (base units)": l.amount, "Commitment / source transaction": l.detail })).join("")}` : "<p>No additional custody or lifecycle links have been published.</p>"}<div class="ll-actions">${participant ? `<a href="${esc(buildLaunchLink(participant))}">Open participant page</a>` : ""}${button("history", "Read transaction history")}${button("copy-record", "Copy permanent record link")}</div>${this.history ? `<pre>${esc(json(this.history))}</pre>` : ""}<details><summary>Link a later token or LP custody deposit</summary><p>Verify a real TimeVault lock funded by this payer or its recorded composer, then append its fixed beneficiary and schedule commitment.</p>${field("linkVault", "Verified TimeVault", this.values.linkVault || this.values.vault)}${field("linkLock", "Vault lock ID", this.values.linkLock || "")}${button("append-vault", "Verify lock and review permanent link")}</details></section>`;
  }
  reviewHTML() {
    if (!this.plan || this.plan !== this.chain.plan) return "";
    return `<section class="ll-review"><h3>${esc(this.plan.purpose)}</h3><pre>${esc(json(this.plan.summary))}</pre>${this.chain.review ? facts({ "Maximum network fee (wei)": String(this.chain.review.maximumGasCost), Contract: this.chain.review.request.to || "New deployment" }) : ""}<div class="ll-actions">${button(this.chain.review ? "send" : "review", this.chain.review ? "Sign reviewed transaction" : "Check transaction and gas")}${button("cancel", "Cancel")}</div></section>`;
  }
  mount(root) {
    this.unmount();
    this.root = root;
    this.abort = new AbortController();
    root.addEventListener(
      "input",
      (e) => {
        const el = e.target;
        if (el.dataset.llField) this.values[el.dataset.llField] = el.value;
        if (el.dataset.llAllocation !== undefined) {
          const a = this.allocations[Number(el.dataset.llAllocation)];
          if (a)
            a[el.dataset.llKey] =
              el.type === "checkbox" ? el.checked : el.value;
        }
        if (this.plan === this.chain.plan) this.chain.invalidate();
        this.plan = null;
      },
      { signal: this.abort.signal },
    );
    root.addEventListener(
      "click",
      (e) => {
        const b = e.target.closest("[data-ll-action]");
        if (b && root.contains(b)) {
          e.preventDefault();
          this.run(() => this.act(b.dataset.llAction));
        }
      },
      { signal: this.abort.signal },
    );
    return this;
  }
  unmount() {
    this.abort?.abort();
    this.root = null;
  }
  paint() {
    if (this.root) {
      this.root.innerHTML = this.render();
      for (const field of this.root.querySelectorAll("button,input,select"))
        field.disabled = this.busy;
    }
  }
  async run(fn) {
    if (this.busy) return;
    this.busy = true;
    this.message = "Reading and verifying…";
    this.paint();
    try {
      await fn();
    } catch (e) {
      this.message = e.shortMessage || e.message || String(e);
    } finally {
      this.busy = false;
      this.paint();
    }
  }
  async applyReceipt(record) {
    if (
      !record?.kind?.startsWith("lifecycle-") ||
      record.status !== "confirmed" ||
      !record.final ||
      Number(record.chainId) !== Number(this.chain.chainId)
    )
      return false;
    const provider = this.chain.provider,
      hash = record.effectiveHash || record.hash,
      identity = `${record.chainId}:${hash}:${record.blockHash || ""}`;
    if (this.appliedReceipts.has(identity)) return false;
    const receipt = await provider.getTransactionReceipt(hash);
    if (!receipt || Number(receipt.status) !== 1)
      throw Error("The lifecycle transaction has no successful receipt.");
    const block = await provider.getBlock(receipt.blockNumber);
    if (
      !block ||
      block.hash !== receipt.blockHash ||
      (record.blockHash && record.blockHash !== receipt.blockHash)
    )
      throw Error("The lifecycle receipt changed. Recover transactions first.");
    await verifyLifecycleReceipt(provider, record, receipt);
    if (
      provider !== this.chain.provider ||
      Number(record.chainId) !== Number(this.chain.chainId) ||
      record.status !== "confirmed"
    )
      throw Error("The network or receipt changed during lifecycle recovery.");
    if (record.kind === "lifecycle-setup") {
      const key = {
        LaunchRegistry: "registry",
        LaunchAllocationComposer: "composer",
        NFTAuctionFactory: "auctionFactory",
      }[record.meta.contractName];
      if (!key) throw Error("Unknown lifecycle deployment.");
      this.values[key] = record.contractAddress;
      this.chain.config = {
        ...this.chain.config,
        [key]: record.contractAddress,
      };
      this.chain.deployments[String(this.chain.chainId)] = {
        ...this.chain.config,
      };
      this.chain.persist();
    }
    if (record.launchRecord) {
      this.record = record.launchRecord;
      this.values.registry = record.launchRecord.registry;
    }
    this.appliedReceipts.add(identity);
    if (!this.chain.plan) this.plan = null;
    this.message = "Transaction confirmed and its lifecycle result verified.";
    return true;
  }
  async act(action) {
    const v = this.values;
    if (action === "add") {
      if (this.allocations.length >= 32)
        throw Error("The composer supports at most 32 allocations.");
      this.allocations.push({
        asset: "token",
        amount: "",
        beneficiary: this.chain.payer || "",
        days: "0",
        cliffDays: "0",
        linear: false,
      });
      this.message = "Choose the asset, beneficiary and optional schedule.";
      return;
    }
    if (action.startsWith("remove:")) {
      this.allocations.splice(Number(action.split(":")[1]), 1);
      this.message = "Allocation removed.";
      return;
    }
    if (action === "discover" || action === "more") {
      const result = await this.client.discover({
        registry: v.registry,
        address: v.payer || this.chain.payer,
        offset: action === "more" ? (this.next ?? 0) : 0,
      });
      this.records = result.records;
      this.next = result.next;
      this.message = `${result.total} permanent records; read block ${result.blockNumber}.`;
      return;
    }
    if (action === "read" || action.startsWith("record:")) {
      const id = action === "read" ? v.id : action.split(":")[1];
      this.record = await this.client.read({ registry: v.registry, id });
      this.history = null;
      this.message = "Record and custody links recovered from the chain.";
      return;
    }
    if (action === "history") {
      if (!this.record) throw Error("Open a record first.");
      this.history = await this.client.history({
        registry: v.registry,
        id: this.record.id,
        fromBlock: this.history?.next,
      });
      this.message =
        "Registry transaction history read. Each transaction links to its underlying calls and events.";
      return;
    }
    if (action === "copy-record") {
      const url = new URL(globalThis.location.href);
      url.search = "";
      url.hash = `launch/record/${this.record.chainId}/${this.record.registry}/${this.record.id}`;
      await navigator.clipboard.writeText(url.href);
      this.message = "Permanent record link copied.";
      return;
    }
    if (
      action === "setup-registry" ||
      action === "setup-composer" ||
      action === "setup-auction-factory"
    )
      this.plan = await this.client.setup({ ...v, kind: action.slice(6) });
    else if (action === "authorize" || action === "revoke")
      this.plan = await this.client.authorize({
        ...v,
        allowed: action === "authorize",
      });
    else if (action === "append-vault") {
      if (!this.record) throw Error("Open a launch record first.");
      this.plan = await this.client.appendVault({
        registry: v.registry,
        id: this.record.id,
        vault: v.linkVault || v.vault,
        lockId: v.linkLock,
      });
    } else if (action === "register")
      this.plan = await this.client.registerObserved({
        registry: v.registry,
        kind: v.kind,
        target: v.target,
        id: v.mechanismId,
      });
    else if (action === "compose") {
      const draft = this.getDraft
          ? await this.getDraft()
          : { ...v, creatorHook: !!v.hook, salt: hexlify(randomBytes(32)) },
        block = await this.chain.provider.getBlock("latest"),
        start = block.timestamp + 600,
        allocations = this.allocations.map((a) => {
          const days = Number(a.days),
            cliffDays = Number(a.cliffDays);
          if (
            !Number.isInteger(days) ||
            days < 0 ||
            !Number.isInteger(cliffDays) ||
            cliffDays < 0 ||
            cliffDays > days
          )
            throw Error(
              "Use whole schedule days with the cliff inside the duration.",
            );
          return {
            asset: a.asset,
            amount: a.amount,
            beneficiary: a.beneficiary,
            start: days ? start : 0,
            cliff: days ? start + (a.linear ? cliffDays : days) * 86400 : 0,
            end: days ? start + days * 86400 : 0,
            linear: days && a.linear,
          };
        });
      this.plan = await this.client.compose({
        composer: v.composer,
        draft,
        allocations,
      });
    } else if (action === "review") {
      await this.chain.reviewNext();
      this.message = "Exact call, spending and gas reviewed.";
      return;
    } else if (action === "send") {
      const record = await this.chain.sendReviewed();
      if (record.status === "confirmed" && record.final) {
        await this.applyReceipt(record);
      } else {
        this.plan = this.chain.plan;
        this.message =
          record.status === "confirmed"
            ? "Approval confirmed. Review the remaining exact call."
            : `Transaction ${record.status}.`;
      }
      return;
    } else if (action === "cancel") {
      this.chain.invalidate();
      this.plan = null;
      this.message = "Review cancelled.";
      return;
    } else throw Error("Unknown launch lifecycle action.");
    this.message = "Prepared for review. No transaction has been sent.";
  }
}
