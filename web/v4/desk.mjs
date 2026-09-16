import {
  Wallet,
  Mnemonic,
  getAddress,
  parseUnits,
  formatUnits,
  Contract,
  Interface,
} from "../vendor/ethers.min.js";
import { PrivateVault } from "../privacy/vault.mjs";
import {
  persistSubmission,
  validateSubmission,
  releaseUnsubmitted,
} from "../privacy/submission.mjs";
import { PrivacyBridge } from "../privacy/bridge.mjs";
import { PublicV4Session } from "./public-session.mjs";
import { TOKEN_ABI, inspectPosition } from "./client.mjs";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const button = (key, label) =>
  `<button type="button" class="cf-button" data-do="v4:${key}">${label}</button>`;
const field = (key, label, value = "", type = "text") =>
  `<label for="v4-${key}">${label}</label><input id="v4-${key}" name="${key}" type="${type}" value="${esc(value)}" autocomplete="off" spellcheck="false">`;
const facts = (o) =>
  Object.entries(o)
    .map(
      ([k, v]) =>
        `<div class="cf-stat"><span>${esc(k.replace(/([a-z])([A-Z])/g, "$1 $2"))}</span><b>${esc(v)}</b></div>`,
    )
    .join("");
const rand = () =>
  "0x" +
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
const defaults = () => ({
  chainId: 1,
  rpc: "",
  poi: "https://ppoi.fdi.network",
  trustedFeeSigner: "",
  factory: "",
  hookFactory: "",
  hook: "",
  router: "",
  feeToken: "",
  runtimeURL: "",
});
const json = (o) =>
  JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
export class V4Desk {
  constructor({ notify = () => {}, download = () => {} } = {}) {
    this.notify = notify;
    this.download = download;
    this.vault = new PrivateVault();
    this.bridge = new PrivacyBridge((e) => this.event(e));
    this.public = new PublicV4Session((m) => {
      this.invalidate();
      this.notify(m);
    });
    this.private = true;
    this.kind = "swap";
    this.view = "operation";
    this.settings = defaults();
    this.values = {};
    this.generation = 0;
    this.review = null;
    this.lastActive = Date.now();
    this.cover = null;
  }
  attach() {
    const cover = document.createElement("div");
    cover.id = "anima-privacy-cover";
    cover.hidden = true;
    cover.setAttribute("role", "dialog");
    cover.setAttribute("aria-modal", "true");
    cover.setAttribute("aria-label", "Screen hidden");
    cover.innerHTML =
      '<p>Anima Genesis</p><button type="button">Return to the object</button>';
    document.body.append(cover);
    this.cover = cover;
    cover.querySelector("button").onclick = () => {
      cover.hidden = true;
      document.body.classList.remove("anima-screen-hidden");
      this.onReturn?.();
    };
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && (this.vault.key || this.bridge.worker))
        this.lock(true);
    });
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        this.lock(true);
      }
    });
    for (const name of ["pointerdown", "keydown"])
      document.addEventListener(name, () => (this.lastActive = Date.now()), {
        passive: true,
      });
    this.timer = setInterval(() => {
      if (
        (this.vault.key || this.bridge.worker) &&
        Date.now() - this.lastActive > 300000
      )
        this.lock(true);
    }, 15000);
    addEventListener("pagehide", () => this.lock(false));
  }
  lock(hide = false) {
    this.invalidate();
    this.bridge.lock();
    this.vault.lock();
    this.public.disconnect();
    try {
      this.onLock?.();
    } catch {}
    this.settings = defaults();
    this.values = {};
    this.view = "wallet";
    this.status = "Locked";
    this.balances = null;
    this.reveal = false;
    const privateContainer = globalThis.document?.querySelector("#ld-private");
    const content = globalThis.document?.querySelector("#cf-content");
    if (privateContainer?.querySelector(".anima-private-desk"))
      privateContainer.innerHTML = this.render();
    else if (content?.querySelector(".anima-private-desk"))
      content.replaceChildren();
    if (hide && this.cover) {
      this.cover.hidden = false;
      document.body.classList.add("anima-screen-hidden");
      this.cover.querySelector("button").focus();
    }
  }
  invalidate() {
    this.generation++;
    this.review = null;
    this.bridge.invalidate();
    this.public.invalidate();
    globalThis.document?.querySelector("#v4-review")?.replaceChildren();
  }
  async event(e) {
    const generation = this.generation;
    if (e.type === "submission") {
      await persistSubmission(this.vault, e);
      if (generation !== this.generation) return;
      this.status =
        "Submission recorded securely. Waiting for two confirmations…";
    }
    if (e.type === "runtime-recovery")
      this.status =
        e.phase === "chunks"
          ? "Recovering privacy tools " + e.completed + " / " + e.total
          : e.phase === "verified"
            ? "Privacy tools verified. Starting…"
            : "Opening recovered privacy tools…";
    if (e.type === "scan")
      this.status =
        "Synchronizing " + Math.round(Number(e.progress || 0) * 100) + "%";
    if (e.type === "broadcaster") this.status = "Broadcaster: " + e.status;
    if (e.type === "proof")
      this.status =
        "Generating proof " +
        Math.round(Math.min(100, Math.max(0, Number(e.progress) || 0))) +
        "%";
    if (e.type === "error") this.status = e.message;
    const node = globalThis.document?.querySelector("#v4-status");
    if (node) node.textContent = this.status || "";
  }
  get data() {
    return this.vault.data;
  }
  read(container) {
    const output = {};
    for (const el of container.querySelectorAll('[id^="v4-"]'))
      if (el.name)
        output[el.name] = el.type === "checkbox" ? el.checked : el.value;
    return output;
  }
  capture(container) {
    const v = this.read(container);
    this.values = { ...this.values, ...v };
    return v;
  }
  async importLaunchDraft({values, chainId, factory, router, hookFactory, hook}) {
    const current = {...defaults(), ...(this.data?.settings || this.settings)};
    const activeChain = Number(this.bridge.info?.chainId ?? current.chainId);
    if (this.bridge.info && activeChain !== Number(current.chainId))
      throw Error("The running private session differs from its saved network. Lock it and explicitly restart from the saved settings.");
    if (chainId !== undefined && chainId !== null && Number(chainId) !== activeChain)
      throw Error("The private wallet uses chain " + activeChain + ". Change its network explicitly in Private wallet → Advanced setup before importing a launch from chain " + chainId + ".");
    const settings = {...current};
    for (const [key, value] of Object.entries({factory, router, hookFactory, hook}))
      if (value) settings[key] = getAddress(value);
    const changed = ["factory", "router", "hookFactory", "hook"].some(key =>
      String(settings[key] || "").toLowerCase() !== String(current[key] || "").toLowerCase());
    this.invalidate();
    const generation = this.generation;
    if (changed) this.bridge.lock();
    this.settings = settings;
    if (changed && this.data) {
      this.data.settings = settings;
      await this.vault.save();
      if (generation !== this.generation) throw Error("The private wallet was locked or changed while importing the launch.");
    }
    this.private = true;
    this.kind = "launch";
    this.view = "operation";
    this.values = structuredClone(values);
    if (changed) this.status = "Launch contracts updated. Explicitly start the private network session to use them.";
    return {chainId: activeChain, restartRequired: changed || !this.bridge.info};
  }
  render(kind) {
    if (kind && kind !== this.kind) {
      this.invalidate();
      this.kind = kind;
      this.view = "operation";
      this.values = {};
    }
    const nav = [
      ["swap", "Swap"],
      ["launch", "Launch"],
      ["redeem", "Withdraw"],
      ["wallet", "Private wallet"],
      ["settings", "Advanced setup"],
    ];
    return `<section class="anima-private-desk" data-private-surface><div class="anima-privacy-bar"><label><input id="v4-private" type="checkbox" ${this.private ? "checked" : ""}> Private execution</label>${button("hide", "Hide screen")}${button("lock", "Lock")}</div><p>${this.private ? "Use shielded funds and return tokens to your private wallet. Public signing is never used as a fallback." : "Public execution: your signing address, transfers, balances and activity can be linked onchain."}</p><nav class="ag-live-tabs">${nav.map(([k, l]) => button("tab:" + k, l)).join("")}</nav><p id="v4-status" role="status">${esc(this.status || "No network connection started")}</p>${this.view === "wallet" ? this.walletPage() : this.view === "settings" ? this.settingsPage() : this.operationPage()}<div id="v4-review" aria-live="polite"></div><details><summary>What privacy protects</summary><p>Shielded execution separates the funding notes and private recipient from the public transaction. Pool addresses, token creation, amounts, prices and timing remain public. Deposits, public withdrawals, address reuse, small anonymity sets and distinctive amounts can reveal links.</p><p>RPC, proof service and network peers can observe connection metadata. This app does not provide Tor, erase existing onchain history, or protect a compromised or unlocked device. A broadcaster can still charge for a failed application call; the refund path returns its input to the shielded wallet.</p><p>Keep your encrypted backup and password separately. Locking ends the worker and removes access to decrypted app data; JavaScript cannot promise forensic erasure from device memory.</p></details></section>`;
  }
  settingsPage() {
    const s = this.data?.settings || this.settings;
    return `<form id="v4-settings-form">${field("chainId", "Chain ID · Ethereum 1, Arbitrum 42161, Polygon 137", s.chainId, "number")}${field("factory", "Deployed GenesisV4Launchpad", s.factory)}${field("hookFactory", "Deployed GenesisV4HookLaunchpad · optional", s.hookFactory)}${field("hook", "Creator-fee hook · optional", s.hook)}${field("router", "Deployed GenesisV4Router", s.router)}${field("rpc", "Trusted HTTPS RPC endpoint", s.rpc, "password")}${field("poi", "RAILGUN proof service HTTPS endpoint", s.poi)}${field("trustedFeeSigner", "Trusted broadcaster fee signer · verified 0zk address", s.trustedFeeSigner)}${field("feeToken", "ERC20 token for broadcaster fees", s.feeToken)}<details><summary>Recovered onchain edition</summary>${field("runtimeURL", "Optional HTTPS privacy runtime location", s.runtimeURL)}<p>The worker is checked against this edition’s SHA-256 before it runs. New minted editions recover the worker lazily from immutable home-chain shards. Proving circuit files and network services still require external connections. An HTTPS mirror is used only if you explicitly enter one.</p></details><button class="cf-button" type="submit">Save settings</button></form><p>Contract bytecode and PoolManager are verified against this build. Deployments are not inferred from an address label. Settings are encrypted when your private vault is unlocked; otherwise they last for this session only.</p><p>Opening the private wallet connects to your RPC, the configured proof service, RAILGUN public synchronization services, and Waku peers. Proof artifacts are downloaded as needed. No analytics or price-tracking requests are added.</p>`;
  }
  walletPage() {
    if (!this.data)
      return `<p>Your private recovery data, drafts and notes are encrypted on this device.</p><form id="v4-unlock-form">${field("password", this.vault.exists ? "Encryption password" : "New encryption password · at least 16 characters", "", "password")}${this.vault.exists ? "" : field("confirm", "Repeat password", "", "password") + `<details><summary>Restore from a recovery phrase</summary>${field("mnemonic", "12 or 24 word RAILGUN recovery phrase · optional", "", "password")}<p>Leave blank to generate a new private wallet. Never enter an existing public wallet’s recovery phrase here.</p></details>`}<button type="submit" class="cf-button">${this.vault.exists ? "Unlock encrypted vault" : "Create wallet & download encrypted backup"}</button></form><details><summary>Restore an encrypted backup</summary><p>Restore into an empty browser profile. The existing encrypted wallet is never overwritten.</p><input id="v4-backup-file" type="file" accept=".json,application/json">${field("backupPassword", "Backup password", "", "password")}${button("restore", "Verify & restore encrypted backup")}</details>`;
    return `${this.data.pending ? "<h3>Reserved private submission</h3><p>This order blocks new submissions until its exact transaction is reconciled. An absent receipt or changed balance does not prove failure.</p>" + facts({ operation: this.data.pending.kind, state: this.data.pending.state || "unknown", hash: this.data.pending.hash || "No hash recorded" }) + (this.data.pending.hash ? "" : field("recoveryHash", "Transaction hash from the original broadcaster, if available")) + button("recover-pending", "Inspect the original transaction") : ""}<p>Encrypted vault unlocked. ${this.bridge.info ? "Private network session open." : "Review settings, then explicitly start the private network session."}</p><div class="cf-actions">${button("start", "Start private network session")}${button("backup", "Download encrypted backup")}${button("reveal", this.reveal ? "Hide private address" : "Show private address")}</div>${this.reveal && this.bridge.info ? `<code>${esc(this.bridge.info.address)}</code>` : ""}<form id="v4-balance-form">${field("balanceToken", "Check spendable shielded balance · ERC20 address")}<button type="submit" class="cf-button">Check balance</button></form><div id="v4-balance-result"></div><details><summary>Deposit into the shielded wallet</summary><p>Depositing is public. Your funding address, token, amount and timing will be visible. A deposit may need time and protocol proof processing before it becomes spendable.</p><form id="v4-shield-form">${field("shieldToken", "ERC20 to deposit")}${field("shieldAmount", "Amount")}<label><input id="v4-depositConsent" name="depositConsent" type="checkbox" required> I understand that this deposit is public.</label><button type="submit" class="cf-button">Prepare public deposit</button></form></details><h3>Encrypted notes</h3><form id="v4-note-form"><textarea id="v4-note" name="note" rows="5" autocomplete="off" spellcheck="false">${esc(this.data.note || "")}</textarea><button type="submit" class="cf-button">Save encrypted note</button></form><h3>Sealed launch drafts</h3>${this.data.drafts.length ? this.data.drafts.map((d, i) => button("draft:" + i, d.input.name || "Untitled launch")).join("") : "<p>No saved drafts.</p>"}<details><summary>Encrypted transaction receipts</summary>${this.data.receipts?.length ? this.data.receipts.map((r) => facts({ operation: r.kind, hash: r.hash, block: r.blockNumber })).join("") : "<p>No locally recorded receipts. Synchronize your private balance after restoring a backup.</p>"}</details>`;
  }
  operationPage() {
    const v = this.values;
    let fields;
    if (this.kind === "launch")
      fields =
        "<h3>Launch with shared liquidity fees</h3><p>Choose ordinary LP fees, or add your verified creator-fee hook. Shielded funding returns retained tokens, liquidity shares and unused quote funds to your private wallet.</p>" +
        field("name", "Token name", v.name) +
        field("symbol", "Symbol", v.symbol) +
        field("supply", "Fixed supply · whole tokens", v.supply || "1000000") +
        field(
          "tokenBudget",
          "Maximum tokens for initial liquidity",
          v.tokenBudget || "800000",
        ) +
        field(
          "quoteToken",
          "Quote ERC20 address · use wrapped native currency",
          v.quoteToken,
        ) +
        field(
          "quoteBudget",
          "Maximum quote tokens for initial liquidity",
          v.quoteBudget,
        ) +
        field("price", "Initial quote tokens per new token", v.price) +
        field("humanLowerPrice", "Lower quote tokens per new token · optional", v.humanLowerPrice ?? v.range?.lower ?? v.range?.min) +
        field("humanUpperPrice", "Upper quote tokens per new token · optional", v.humanUpperPrice ?? v.range?.upper ?? v.range?.max) +
        "<p>Set both price limits to concentrate liquidity. Limits round outward to the pool’s available price steps. Leave both blank to use the range ticks below.</p>" +
        `<details><summary>Pool range and fees</summary>${field("fee", "Immutable LP fee · parts per million", v.fee ?? "3000", "number")}${field("tickSpacing", "Tick spacing", v.tickSpacing ?? "60", "number")}${field("tickLower", "Lower tick · used without human price limits", v.tickLower ?? "-887220", "number")}${field("tickUpper", "Upper tick · used without human price limits", v.tickUpper ?? "887220", "number")}</details>` +
        `<details ${v.creatorHook ? "open" : ""}><summary>Creator-fee hook</summary><label><input id="v4-creatorHook" name="creatorHook" type="checkbox" ${v.creatorHook ? "checked" : ""}> Add the selected creator-fee hook</label>${field("hookFactory", "Deployed GenesisV4HookLaunchpad", v.hookFactory || this.settings?.hookFactory)}${field("hook", "Verified creator-fee hook", v.hook || this.settings?.hook)}${field("expectedHookOwner", "Expected hook owner · optional", v.expectedHookOwner)}${field("expectedHookFeePpm", "Expected additional creator fee · parts per million", v.expectedHookFeePpm, "number")}<p>The review checks executable contract code, manager, actual fee, owner and recipients. Hook ownership and recipients remain public and can link launches; the shared funding adapter is not asserted to be the creator. The owner can change future fee settings.</p></details>` +
        "<details><summary>Advanced · unique launch identifier</summary>" +
        field("salt", "Launch salt", v.salt || (this.values.salt = rand())) +
        button("salt", "Generate new salt") +
        "</details>" +
        "<p>The full supply belongs to the caller. Unused tokens and quote funds return automatically. The liquidity position has no administrator and no later share issuance; each share can withdraw its proportion of principal and fees.</p>";
    else if (this.kind === "redeem")
      fields =
        field("position", "Anima v4 liquidity share address", v.position) +
        field("hookFactory", "Hooked factory · only for creator-hook positions", v.hookFactory || this.settings?.hookFactory) +
        field("shares", "Shares to redeem · 18 decimals", v.shares) +
        field(
          "minimum0",
          "Minimum currency0 received · whole tokens",
          v.minimum0 || "0",
        ) +
        field(
          "minimum1",
          "Minimum currency1 received · whole tokens",
          v.minimum1 || "0",
        ) +
        button("inspect", "Preview withdrawal & set 0.5% slippage limits") +
        '<div id="v4-position-preview"></div><p>Set at least one nonzero minimum. Your proportional accrued fees are included in the withdrawal. In private mode, protocol fees apply to unshielded shares and reshielded outputs.</p>';
    else
      fields =
        field("inputToken", "Input ERC20 address", v.inputToken) +
        field("outputToken", "Output ERC20 address", v.outputToken) +
        field("amount", "Amount to swap", v.amount) +
        "<details><summary>Advanced · pool and slippage settings</summary>" +
        field(
          "fee",
          "Pool LP fee · parts per million",
          v.fee || "3000",
          "number",
        ) +
        field(
          "tickSpacing",
          "Pool tick spacing",
          v.tickSpacing || "60",
          "number",
        ) +
        field(
          "slippageBps",
          "Maximum slippage · basis points, 50 = 0.5%",
          v.slippageBps || "50",
          "number",
        ) +
        field("hook", "Creator-fee hook · leave blank for a pool without hooks", v.hook) +
        field("maximumHookFeePpm", "Maximum creator fee · parts per million, required with a hook", v.maximumHookFeePpm, "number") +
        "</details><p>Quotes come from Uniswap’s Quoter for the exact selected pool and hook. Execution enforces a minimum output, rejects partial fills and caps the accepted creator fee.</p>";
    return `${this.private && !this.bridge.info ? `<p>Open your private wallet and configure a supported deployment before preparing a shielded transaction.</p>${button("tab:wallet", "Open private wallet")}` : ""}${!this.private ? button("connect", "Connect public signing wallet") : ""}<form id="v4-operation-form">${fields}<button type="submit" class="cf-button primary">${this.private ? "Review shielded " + this.kind : "Review public " + this.kind}</button>${this.kind === "launch" ? button("save-draft", "Seal this launch draft") : ""}</form>`;
  }
  repaint(container) {
    container.innerHTML = this.render();
  }
  async action(key, container) {
    if (key === "hide") {
      this.lock(true);
      return;
    }
    if (key === "lock") {
      this.lock();
      this.repaint(container);
      return;
    }
    if (key.startsWith("tab:")) {
      this.capture(container);
      this.invalidate();
      const next = key.slice(4);
      if (["swap", "launch", "redeem"].includes(next)) {
        this.kind = next;
        this.view = "operation";
        this.values = {};
      } else this.view = next;
      this.repaint(container);
      return;
    }
    if (key === "salt") {
      this.capture(container);
      this.values.salt = rand();
      this.invalidate();
      this.repaint(container);
      return;
    }
    if (key === "backup") {
      this.download(
        this.vault.exportBackup(),
        "anima-private-encrypted-backup.json",
      );
      return;
    }
    if (key === "clear-pending")
      throw Error(
        "Inspect and reconcile the exact original transaction before creating another order.",
      );
    if (key === "recover-pending") {
      if (!this.data?.pending) throw Error("No reserved submission.");
      const generation = this.generation,
        pending = validateSubmission({
          ...this.data.pending,
          hash:
            this.data.pending.hash ||
            container.querySelector("#v4-recoveryHash")?.value?.trim(),
        });
      const result = await this.bridge.call("recover", pending);
      if (generation !== this.generation) return;
      if (
        ["confirmed", "reverted", "application-reverted"].includes(result.state)
      ) {
        this.data.receipts ??= [];
        this.data.receipts.push({
          ...result,
          kind: pending.kind,
          recovered: true,
        });
        delete this.data.pending;
      } else
        this.data.pending = {
          ...this.data.pending,
          hash: pending.hash,
          state: result.state,
        };
      await this.vault.save();
      this.status = "Original submission: " + result.state;
      this.repaint(container);
      return;
    }
    if (key === "reveal") {
      this.reveal = !this.reveal;
      this.repaint(container);
      return;
    }
    if (key === "start") {
      if (!this.data) throw Error("Unlock the encrypted vault first.");
      this.invalidate();
      const generation = this.generation;
      this.status = "Verifying and starting the privacy worker…";
      this.event({});
      try {
        await this.bridge.start({
          mnemonic: this.data.mnemonic,
          settings: this.data.settings,
        });
        if (generation !== this.generation) return;
        this.status =
          "Private network session open. Synchronization may still be running.";
      } catch (e) {
        if (generation !== this.generation) return;
        this.bridge.lock();
        throw e;
      }
      this.repaint(container);
      return;
    }
    if (key === "restore") {
      const file = container.querySelector("#v4-backup-file")?.files?.[0],
        password = container.querySelector("#v4-backupPassword")?.value;
      if (!file || file.size > 14000000)
        throw Error("Choose an encrypted backup up to 14 MB.");
      const generation = this.generation,
        raw = await file.text();
      if (generation !== this.generation)
        throw Error("Wallet locked during restore.");
      await this.vault.importBackup(raw, password);
      this.settings = this.data.settings;
      this.repaint(container);
      return;
    }
    if (key === "save-draft") {
      if (!this.data) throw Error("Unlock the private vault to seal a draft.");
      this.capture(container);
      const input = {...this.values};
      this.data.drafts.push({ input, created: Date.now() });
      await this.vault.save();
      this.notify("Launch draft encrypted. Nothing was published.");
      return;
    }
    if (key.startsWith("draft:")) {
      const draft = this.data?.drafts[Number(key.slice(6))];
      if (!draft) throw Error("Draft unavailable.");
      this.invalidate();
      this.kind = "launch";
      this.view = "operation";
      this.values = { ...draft.input };
      this.repaint(container);
      return;
    }
    if (key === "connect") {
      const context = await this.public.connect();
      this.notify(
        "Public wallet connected on chain " +
          context.chainId +
          ". Its activity is linkable.",
      );
      return;
    }
    if (key === "prove") {
      const r = this.review;
      if (!r?.id) throw Error("Review private terms first.");
      const generation = this.generation;
      const proof = await this.bridge.call("prove", { id: r.id });
      if (generation !== this.generation) return;
      r.proof = proof;
      container
        .querySelector("#v4-review")
        .insertAdjacentHTML(
          "beforeend",
          button("send-private", "Submit through private broadcaster"),
        );
      return;
    }
    if (key === "send-private") {
      const r = this.review;
      if (!r?.id || !r.proof)
        throw Error("Generate the reviewed private proof first.");
      if (this.sending || this.data?.pending)
        throw Error(
          "A private submission is already reserved. Reconcile it before sending another.",
        );
      if (!this.data) throw Error("Unlock the vault first.");
      const generation = this.generation;
      this.sending = true;
      try {
        await this.vault.reserveSubmission({
          ...validateSubmission(r.proof, { requireHash: false }),
          kind: r.kind,
          state: "reserved",
          created: Date.now(),
        });
        if (generation !== this.generation) return;
        const receipt = await this.bridge.call("send", { id: r.id });
        if (generation !== this.generation) return;
        if (receipt.state === "not-submitted") {
          await releaseUnsubmitted(this.vault, receipt);
          this.review = null;
          container.querySelector("#v4-review").innerHTML =
            "<h3>Transaction was not submitted</h3><p>" + esc(receipt.message) + "</p><p>Review the updated terms to continue.</p>";
          return;
        }
        this.review = null;
        if (this.data) {
          delete this.data.pending;
          this.data.receipts ??= [];
          this.data.receipts.push({ ...receipt, kind: r.kind });
          await this.vault.save();
        }
        container.querySelector("#v4-review").innerHTML =
          "<h3>Confirmed private execution</h3>" + facts(receipt);
      } finally {
        this.sending = false;
      }
      return;
    }
    if (key === "next-public") {
      const r = await this.public.reviewNext();
      container.querySelector("#v4-review").innerHTML =
        "<h3>Review public transaction</h3>" +
        facts({
          purpose: r.purpose,
          account: r.account,
          chain: r.chainId,
          target: r.request.to,
          gas: r.gas.toString(),
        }) +
        "<code>" +
        esc(r.request.data) +
        "</code>" +
        button("send-public", "Request wallet signature");
      return;
    }
    if (key === "send-public") {
      const receipt = await this.public.sendReviewed();
      container.querySelector("#v4-review").innerHTML =
        "<h3>Public transaction confirmed</h3>" +
        facts(receipt) +
        (receipt.final ? "" : button("next-public", "Review next transaction"));
      return;
    }
    if (key === "inspect") {
      const v = this.capture(container),
        generation = this.generation;
      const result = this.private
        ? await this.bridge.call("inspect", v)
        : await inspectPosition(
            this.public.provider,
            this.data?.settings || this.settings,
            {...v,holder:this.public.address},
          );
      if (generation !== this.generation) return;
      const minimum0 = formatUnits(
          (result.amount0 * 995n) / 1000n,
          result.decimals0,
        ),
        minimum1 = formatUnits(
          (result.amount1 * 995n) / 1000n,
          result.decimals1,
        );
      container.querySelector("#v4-minimum0").value = minimum0;
      container.querySelector("#v4-minimum1").value = minimum1;
      container.querySelector("#v4-position-preview").innerHTML = facts({
        currency0: result.currency0,
        currency1: result.currency1,
        currentAmount0: formatUnits(result.amount0, result.decimals0),
        currentAmount1: formatUnits(result.amount1, result.decimals1),
      });
      this.values.minimum0 = minimum0;
      this.values.minimum1 = minimum1;
      this.invalidate();
      return;
    }
    if (key === "deposit-next") {
      return this.depositNext(container);
    }
    if (key === "deposit-send") {
      return this.depositSend(container);
    }
  }
  async submit(name, container) {
    const v = this.read(container),
      generation = this.generation;
    if (name === "v4-unlock-form") {
      if (this.vault.exists) await this.vault.unlock(v.password);
      else {
        if (v.password !== v.confirm) throw Error("Passwords do not match.");
        const mnemonic =
          v.mnemonic?.trim() || Wallet.createRandom().mnemonic.phrase;
        if (
          !Mnemonic.isValidMnemonic(mnemonic) ||
          ![12, 24].includes(mnemonic.split(/\s+/).length)
        )
          throw Error("Enter a valid 12 or 24 word recovery phrase.");
        await this.vault.create(
          {
            mnemonic,
            settings: this.settings,
            drafts: [],
            note: "",
            receipts: [],
          },
          v.password,
        );
        if (generation !== this.generation) return;
        this.download(
          this.vault.exportBackup(),
          "anima-private-encrypted-backup.json",
        );
      }
      if (generation !== this.generation) return;
      this.settings = { ...defaults(), ...this.data.settings };
      this.lastActive = Date.now();
      this.repaint(container);
      return;
    }
    if (name === "v4-settings-form") {
      this.invalidate();
      this.bridge.lock();
      this.settings = { ...defaults(), ...v, chainId: Number(v.chainId) };
      if (this.data) {
        this.data.settings = this.settings;
        await this.vault.save();
      }
      this.notify(
        this.data
          ? "Settings encrypted. Restart the private network session to use them."
          : "Settings kept for this session.",
      );
      return;
    }
    if (name === "v4-note-form") {
      if (!this.data) throw Error("Unlock the vault first.");
      this.data.note = v.note;
      await this.vault.save();
      this.notify("Note encrypted.");
      return;
    }
    if (name === "v4-balance-form") {
      const balance = await this.bridge.call("balanceView", v.balanceToken);
      if (generation !== this.generation) return;
      container.querySelector("#v4-balance-result").innerHTML = facts({
        token: v.balanceToken,
        "Spendable balance":
          formatUnits(balance.amount, balance.decimals) + " " + balance.symbol,
      });
      return;
    }
    if (name === "v4-operation-form") {
      this.capture(container);
      this.invalidate();
      const current = this.generation;
      let result;
      if (this.private) {
        if (this.data?.pending)
          throw Error(
            "A previous submission has an uncertain outcome. Check your private wallet before preparing another transaction.",
          );
        result = await this.bridge.call("prepare", {
          kind: this.kind,
          input: {...this.values, ...v},
          feeToken: (this.data?.settings || this.settings).feeToken,
        });
        if (current !== this.generation) return;
        this.review = result;
        container.querySelector("#v4-review").innerHTML =
          "<h3>Review shielded transaction</h3>" +
          facts(result.summary) +
          facts({
            "Unshield fee": Number(result.unshieldFeeBps) / 100 + "%",
            "Reshield fee": Number(result.shieldFeeBps) / 100 + "%",
            "Maximum broadcaster fee":
              formatUnits(result.fee.amount, result.fee.decimals) +
              " " +
              result.fee.symbol,
            "Fee token": result.fee.tokenAddress,
            expires: new Date(result.expires).toLocaleTimeString(),
          }) +
          "<p>" +
          esc(result.disclosure) +
          "</p><p>These minimum swap or redemption outputs apply before reshielding fees. Protocol fees and a broadcaster fee may also apply if the application call fails.</p>" +
          button("prove", "Generate this proof");
      } else {
        result = await this.public.prepare(
          this.kind,
          this.data?.settings || this.settings,
          v,
        );
        if (current !== this.generation) return;
        this.review = result;
        container.querySelector("#v4-review").innerHTML =
          "<h3>Review public transaction terms</h3>" +
          facts(result.summary) +
          "<p>Your wallet address and this activity will be publicly linked.</p>" +
          button("next-public", "Simulate next transaction");
      }
      return;
    }
    if (name === "v4-shield-form") {
      if (!v.depositConsent) throw Error("Confirm that the deposit is public.");
      const context = await this.public.connect();
      if (BigInt(context.chainId) !== BigInt(this.bridge.info?.chainId || 0))
        throw Error("Public wallet and private wallet chains must match.");
      const c = new Contract(
          getAddress(v.shieldToken),
          TOKEN_ABI,
          this.public.provider,
        ),
        decimals = Number(await c.decimals()),
        amount = parseUnits(v.shieldAmount, decimals);
      this.deposit = await this.bridge.call("shield", {
        tokenAddress: v.shieldToken,
        amount,
      });
      this.deposit.generation = this.generation;
      container.querySelector("#v4-review").innerHTML =
        "<h3>Public deposit</h3><p>" +
        esc(this.deposit.disclosure) +
        "</p>" +
        facts({
          token: v.shieldToken,
          amount: v.shieldAmount,
          fundingWallet: context.address,
        }) +
        button("deposit-next", "Review deposit transaction");
      return;
    }
  }
  async depositNext(container) {
    const d = this.deposit;
    if (!d || d.generation !== this.generation)
      throw Error("Prepare the deposit again.");
    await this.public.assertContext();
    const token = new Contract(d.tokenAddress, TOKEN_ABI, this.public.provider),
      allowance = await token.allowance(this.public.address, d.spender),
      iface = new Interface(TOKEN_ABI);
    const final = allowance >= d.amount,
      request = final
        ? d.transaction
        : {
            to: d.tokenAddress,
            data: iface.encodeFunctionData("approve", [
              d.spender,
              allowance ? 0n : d.amount,
            ]),
            value: 0n,
          };
    await this.public.provider.call({ ...request, from: this.public.address });
    const gas = await this.public.provider.estimateGas({
      ...request,
      from: this.public.address,
    });
    this.depositStep = {
      request,
      final,
      gas,
      generation: this.generation,
      publicGeneration: this.public.generation,
      created: Date.now(),
    };
    container.querySelector("#v4-review").innerHTML =
      facts({
        purpose: final ? "Public shielding deposit" : "Exact deposit approval",
        from: this.public.address,
        to: request.to,
        gas: String(gas),
      }) +
      "<code>" +
      esc(request.data) +
      "</code>" +
      button("deposit-send", "Request public wallet signature");
  }
  async depositSend(container) {
    const step = this.depositStep;
    this.depositStep = null;
    if (
      !step ||
      step.generation !== this.generation ||
      Date.now() - step.created > 180000
    )
      throw Error("Deposit review expired.");
    await this.public.assertContext(step.publicGeneration);
    await this.public.provider.call({
      ...step.request,
      from: this.public.address,
    });
    await this.public.assertContext(step.publicGeneration);
    const sent = await this.public.signer.sendTransaction({
        ...step.request,
        gasLimit: (step.gas * 120n) / 100n,
      }),
      receipt = await sent.wait();
    if (receipt?.status !== 1)
      throw Error("Public deposit transaction did not succeed.");
    if (step.generation !== this.generation) return;
    container.querySelector("#v4-review").innerHTML =
      "<h3>Public transaction confirmed</h3>" +
      facts({ hash: sent.hash, block: receipt.blockNumber }) +
      (step.final
        ? "<p>Wait for shielded synchronization and protocol proof processing before spending.</p>"
        : button("deposit-next", "Review next deposit transaction"));
  }
  change(target, container) {
    if (target.id === "v4-private") {
      this.capture(container);
      this.private = target.checked;
      this.invalidate();
      this.public.disconnect();
      this.repaint(container);
    } else if (target.id?.startsWith("v4-") && target.id !== "v4-note")
      this.invalidate();
  }
}
