import { StrategiesClient } from "./strategies-client.mjs";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const button = (action, label) =>
  `<button type="button" class="lp-button" data-strategy-action="${action}">${label}</button>`;
const shown = (v) =>
  typeof v === "object"
    ? JSON.stringify(v, (_, x) => (typeof x === "bigint" ? String(x) : x))
    : String(v);
export class StrategiesDesk {
  constructor(chain, { onPrepared = () => {}, onError = () => {} } = {}) {
    this.chain = chain;
    this.client = new StrategiesClient(chain);
    this.onPrepared = onPrepared;
    this.onError = onError;
    this.d = {
      compounder: "",
      compoundOwner: "",
      maximum0: "",
      maximum1: "",
      minimumLiquidity: "1",
      rewardAmount: "0.0001",
      position: "",
      router: "",
      converter: "",
      exit: "",
      splitter: "",
      hook: "",
      inputToken: "",
      amount: "",
      minimumOutput: "",
      recipient: "",
      beneficiary: "",
      liquidity: "",
      maximumFeePpm: "",
      exactFee: false,
      slices: "12",
      intervalSeconds: "86400",
      start: "",
      expiry: "",
      rewardPerSlice: "0.0001",
      id: "",
    };
    this.root = null;
    this.abort = null;
    this.result = null;
    this.busy = false;
    this.error = "";
    this.generation = 0;
  }
  configure(values = {}) {
    let changed = false;
    for (const [k, v] of Object.entries(values))
      if (k in this.d && v !== undefined && v !== null) {
        const next = k === "exactFee" ? Boolean(v) : String(v);
        if (this.d[k] !== next) {
          this.d[k] = next;
          changed = true;
        }
      }
    if (changed) {
      this.generation++;
      this.result = null;
      this.chain.invalidate?.();
    }
    return this;
  }
  field(k, label, help = "") {
    return `<label class="lp-field">${label}<input data-strategy-field="${k}" value="${esc(this.d[k])}" autocomplete="off" spellcheck="false">${help ? `<small>${help}</small>` : ""}</label>`;
  }
  render(context) {
    if (context) this.configure(context);
    return `<section class="lp-strategies"><header><span class="lp-eyebrow">Economics you control</span><h3>Earn, direct, grow.</h3><p>Collect earned fees, convert your payout, reinvest in your pool, or fund a sell schedule. Every operation enters the same transaction review with the selected wallet or NFT account.</p></header>
 <p class="lp-note">Funding and authority: ${esc(this.chain.payer || this.chain.address || "Connect a wallet and select the funding account in Launch.")}</p>
 ${this.field("position", "Anima v4 position", "Use the deployed LP-share address. Its pool and tokens are verified from chain state.")}
 <details open><summary>Liquidity earnings</summary><p>Uncollected earnings follow LP shares, including shares held in vesting. Collecting fees leaves principal and your share balance unchanged.</p><div class="lp-actions">${button("inspectPosition", "Read liquidity & earnings")}${button("collect", "Review fee-only collection")}</div>${this.field("liquidity", "Advanced liquidity increment · optional", "Leave empty to calculate from your real earned balances and current pool price, with a 1% budget margin. Optional overrides use raw liquidity units; insufficient fees revert without spending.")}${button("reinvest", "Review fee reinvestment")}<p class="lp-note">Reinvestment adds actual liquidity and proportional LP shares in this same range. Unused fee budgets return to your funding account. It does not guarantee a return.</p></details>
 <details><summary>Optional automatic reinvestment</summary><p>Move LP shares into your own revocable compounding vault. The position and owner are fixed. You can withdraw shares and their earnings at any time; an external keeper only compounds within your policy.</p>${this.field("compounder", "Your fee-compounder address")}${this.field("compoundOwner","Fixed owner for a new compounder","Leave empty for the setup wallet. To attach custody to your NFT, enter its verified account address here before deployment.")}<div class="lp-fields">${this.field("maximum0", "Maximum token0 fees per execution")}${this.field("maximum1", "Maximum token1 fees per execution")}${this.field("rewardAmount", "Keeper reward or funding · ETH")}${this.field("minimumLiquidity", "Minimum liquidity increment · raw units")}</div><p class="lp-note">The interval and expiry fields in Scheduled exits also apply to the compounding policy. With expiry empty, a new policy expires after 30 days. LP custody actions use the Amount field above, interpreted as LP shares.</p><div class="lp-actions">${button("compound-read", "Read policy & earnings")}${button("compound-configure", "Review enabled policy")}${button("compound-pause", "Pause compounding")}${button("compound-fund", "Deposit LP shares")}${button("compound-withdraw", "Withdraw LP shares")}${button("compound-fundRewards", "Fund keeper rewards")}${button("compound-refundRewards", "Recover unused rewards")}${button("compound-execute", "Execute due compounding")}${button("compound-collect", "Collect fees instead")}${button("compound-reward", "Withdraw earned reward")}</div></details>
 <details><summary>Convert creator-fee payouts</summary><div class="lp-fields">${this.field("splitter", "Fee splitter address")}${this.field("converter", "Verified v4 converter address")}</div><div class="lp-fields">${this.field("inputToken", "Earned input-token address")}${this.field("amount", "Amount of earned fees")}${this.field("minimumOutput", "Minimum payout amount", "In the other token of the selected pool. This is your execution bound, not a forecast.")}${this.field("recipient", "Payout recipient", "Leave empty to pay the selected funding account.")}</div><div class="lp-actions">${button("convert", "Review payout conversion")}${button("enableConverter", "Owner: enable converter")}</div><p class="lp-note">Each beneficiary converts only their own earned claims. Wrapped native currency is supported; wrap ETH before using an ERC20 pool.</p></details>
 <details><summary>Commit participant promises</summary>${this.field("hook", "Creator-fee hook address")}${this.field("maximumFeePpm", "Maximum creator fee · ppm", "1,000 ppm = 0.1%. Your current rate cannot exceed this ceiling.")}<label class="lp-check"><input type="checkbox" data-strategy-field="exactFee" ${this.d.exactFee ? "checked" : ""}> Fix the fee at this exact rate, rather than only its ceiling</label><p class="lp-note">Committing is irreversible. The hook recipient and splitter mode become fixed; a later owner cannot change them. A splitter’s recipient weights require their own separate commitment.</p><div class="lp-actions">${button("commit", "Review irreversible hook policy")}${button("commitSplit", "Review irreversible splitter weights")}</div></details>
 <details><summary>Fund scheduled v4 exits</summary>${this.field("exit", "Scheduled-exit contract address")}<p>Use the selected position, input token, amount and minimum output above. The minimum is the price floor for the entire input; each slice enforces its proportional floor.</p>${this.field("beneficiary", "Fixed output beneficiary", "Leave empty to use the funding account.")}<div class="lp-fields">${this.field("slices", "Number of slices")}${this.field("intervalSeconds", "Seconds between slices")}${this.field("start", "Start · Unix seconds", "Leave empty to start five minutes after preparation.")}${this.field("expiry", "Expiry · Unix seconds", "Leave empty for one day after the last planned slice.")}${this.field("rewardPerSlice", "Executor reward per slice · ETH", "Prepaid with the plan; a reward is earned only after a successful slice.")}</div>${button("createExit", "Review funded schedule")}<p class="lp-note">An external funded keeper or another caller submits each due transaction. A low minimum price or unavailable executor can leave slices pending. You may pause or cancel. Cancellation returns unsold input and credits unused rewards to the creating account.</p><div class="lp-fields">${this.field("id", "Existing plan ID")}</div><div class="lp-actions">${button("inspectExit", "Read plan & keeper status")}${button("execute", "Review one due slice")}${button("pause", "Pause")}${button("resume", "Resume")}${button("cancel", "Cancel & recover")}${button("withdraw", "Withdraw reward credit")}</div></details>
 <details><summary>Verified strategy setup</summary>${this.field("router", "Genesis v4 router address", "Deploy with wallet funding. Newly deployed addresses appear in the transaction record; enter them above after confirmation.")}<div class="lp-actions">${button("setup-converter", "Review converter deployment")}${button("setup-exit", "Review exit contract deployment")}${button("setup-compounder", "Review compounder deployment")}</div><p class="lp-note">The converter pins the router bytecode and PoolManager. The exit contract pins its converter. No deployment is assumed.</p></details>
 <p data-strategy-status class="lp-message" role="status" aria-live="polite">${esc(this.error || (this.busy ? "Reading verified chain state…" : ""))}</p><div data-strategy-result>${this.results()}</div></section>`;
  }
  results() {
    if (!this.result) return "";
    return `<dl class="strategy-facts">${Object.entries(this.result)
      .filter(([k]) => !["key", "token0", "token1"].includes(k))
      .map(
        ([k, v]) =>
          `<div><dt>${esc(k.replace(/([A-Z])/g, " $1"))}</dt><dd>${esc(shown(v))}</dd></div>`,
      )
      .join("")}</dl>`;
  }
  mount(root) {
    this.unmount();
    this.root = root;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    root.addEventListener(
      "input",
      (e) => {
        const key = e.target.dataset.strategyField;
        if (key && key in this.d) {
          this.d[key] = key === "exactFee" ? e.target.checked : e.target.value;
          this.generation++;
          this.chain.invalidate?.();
          this.result = null;
          this.refresh();
        }
      },
      { signal },
    );
    root.addEventListener(
      "click",
      (e) => {
        const b = e.target.closest("[data-strategy-action]");
        if (!b) return;
        e.preventDefault();
        this.action(b.dataset.strategyAction).catch((err) => {
          this.error = err.shortMessage || err.message;
          this.onError(err);
          this.refresh();
        });
      },
      { signal },
    );
  }
  unmount() {
    this.abort?.abort();
    this.abort = null;
    this.root = null;
    this.generation++;
  }
  refresh() {
    if (!this.root) return;
    const status = this.root.querySelector("[data-strategy-status]"),
      result = this.root.querySelector("[data-strategy-result]");
    if (status)
      status.textContent =
        this.error || (this.busy ? "Reading verified chain state…" : "");
    if (result) result.innerHTML = this.results();
    for (const b of this.root.querySelectorAll("[data-strategy-action]"))
      b.disabled = this.busy;
  }
  async action(action) {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    this.refresh();
    const d = { ...this.d },
      generation = this.generation,
      chainGeneration = this.chain.generation;
    try {
      let plan, result;
      if (["inspectPosition", "inspectExit"].includes(action))
        result = await this.client[action](d);
      else if (action.startsWith("compound-")) {
        const kind = action.slice(9),
          value = await this.client.compoundAction({
            ...d,
            action: kind === "pause" ? "configure" : kind,
            enabled: kind !== "pause",
            maximum0: d.maximum0 || "0",
            maximum1: d.maximum1 || "0",
          });
        if (kind === "read") result = value;
        else plan = value;
      } else if (
        action === "setup-converter" ||
        action === "setup-exit" ||
        action === "setup-compounder"
      )
        plan = await this.client.setup({ ...d, kind: action.slice(6) });
      else if (
        ["execute", "pause", "resume", "cancel", "withdraw"].includes(action)
      )
        plan = await this.client.exitAction({
          ...d,
          action: action === "resume" ? "pause" : action,
          paused: action === "pause",
        });
      else if (
        [
          "collect",
          "reinvest",
          "convert",
          "enableConverter",
          "commit",
          "commitSplit",
          "createExit",
        ].includes(action)
      )
        plan = await this.client[action](d);
      else throw Error("Unknown strategy action.");
      if (
        generation !== this.generation ||
        (result && chainGeneration !== this.chain.generation)
      ) {
        if (plan && this.chain.plan === plan) this.chain.invalidate();
        return;
      }
      if (result) this.result = result;
      if (plan) await this.onPrepared(plan);
    } finally {
      this.busy = false;
      this.refresh();
    }
  }
}
