import {
  replayAuctionEconomics,
  AUCTION_ECONOMICS_SCOPE,
} from "./economics-auction.mjs";
import { replaySale } from "./scenarios.mjs";
import { OfficialScenarioDesk } from "./scenario-client.mjs";
import { defaults, decimal } from "./model.mjs";
import {
  replayEconomics,
  economyJSON,
  ECONOMICS_SCOPE,
} from "./economics-engine.mjs";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const PRESETS = {
  earnings:
    "fund alice quote 1\nbuy alice 0.1\nsell alice 100\ncollect creator\nbuy alice 0.1\nsell alice 100\nreinvest creator auto\nflush",
  allocations:
    "allocate creator team token 1000 0 86400 2592000\nfund alice quote 1\nbuy alice 0.1\nadvance 1296000\nrelease 1\nsell team 100\nflush",
  exits:
    "fund creator native 0.003\nexit creator treasury token 300 0.00001 3 100 100 1000 0.001\nadvance 100\nexecute 1 keeper\nadvance 100\nexecute 1 keeper\ncancel creator 1",
};
export class EconomicsDesk {
  constructor({ getDraft = () => defaults(), onExport } = {}) {
    this.getDraft = getDraft;
    this.onExport = onExport;
    this.sequence = PRESETS.earnings;
    this.mechanism = "pool";
    this.officialDesk = new OfficialScenarioDesk({ mechanism: "cca" });
    this.auctionDraft = {
      lotSize: "100",
      totalLots: "1000",
      reservePrice: "0.001",
      auctionStartBlock: "10",
      auctionEndBlock: "110",
    };
    this.result = null;
    this.error = "";
    this.root = null;
    this.abort = null;
    this.override = null;
  }
  configure(draft) {
    this.override = draft;
    return this;
  }
  currentDraft() {
    return this.override || this.getDraft();
  }
  isOfficial() {
    return this.mechanism === "cca" || this.mechanism === "doppler";
  }
  mechanismSelector() {
    return `<label class="lp-field">Mechanism<select data-economic-mechanism>${Object.entries(
      {
        pool: "ANIMA v4 pool and strategies",
        sale: "ANIMA community sale",
        auction: "ANIMA streaming auction",
        cca: "Uniswap CCA · actual contract scenario",
        doppler: "Doppler · actual contract scenario",
      },
    )
      .map(
        ([value, label]) =>
          `<option value="${value}" ${this.mechanism === value ? "selected" : ""}>${label}</option>`,
      )
      .join("")}</select></label>`;
  }
  render(draft) {
    if (draft) this.configure(draft);
    const header = `<header><span class="lp-eyebrow">Follow every asset</span><h3>What happens next?</h3><p>Change a rule, play a sequence, and see where tokens, LP shares, fee claims and executor rewards move. ${this.isOfficial() ? "Official protocol scenarios execute their pinned contracts with the terms below on an isolated local chain." : "The ANIMA pool uses the token supply, range and fees selected in the launch designer."}</p></header>${this.mechanismSelector()}`;
    if (this.isOfficial())
      return `<section class="lp-economics">${header}<div data-economic-official>${this.officialDesk.render()}</div></section>`;
    return `<section class="lp-economics">${header}${
      this.mechanism === "auction"
        ? `<div class="lp-fields">${Object.entries({
            lotSize: "Tokens per lot",
            totalLots: "Total lots",
            reservePrice: "Reserve ETH per lot",
            auctionStartBlock: "Start block",
            auctionEndBlock: "End block",
          })
            .map(
              ([k, label]) =>
                `<label class="lp-field">${label}<input data-economic-auction="${k}" value="${esc(this.auctionDraft[k])}"></label>`,
            )
            .join("")}</div>`
        : ""
    }<div class="lp-actions">${Object.entries({
      earnings: "Earn & reinvest",
      allocations: "Allocate & vest",
      exits: "Schedule & recover",
    })
      .map(
        ([k, v]) =>
          `<button type="button" class="lp-button" data-economic-preset="${k}">${v}</button>`,
      )
      .join(
        "",
      )}</div><label class="lp-field">Event sequence<textarea data-economic-sequence rows="10" spellcheck="false">${esc(this.sequence)}</textarea></label><div class="lp-actions"><button type="button" class="lp-button lp-primary" data-economic-run>Calculate this sequence</button><button type="button" class="lp-button" data-economic-export>Export exact accounting</button></div><p class="lp-note">${this.mechanism === "auction" ? AUCTION_ECONOMICS_SCOPE : this.mechanism === "sale" ? "Conserved lifecycle of the existing ANIMA community-sale contract: contributions, withdrawals, settlement, failure refunds, claims and fixed vesting." : ECONOMICS_SCOPE}</p><details><summary>Commands and account names</summary><p>Creator starts with retained tokens, unused quote funding and the issued LP shares. Account names are scenario participants. Token amounts use token decimals; LP-share and liquidity arguments below use raw integers. Time uses seconds from the scenario start.</p><pre class="economic-help">${
      this.mechanism === "auction"
        ? `fund creator
fund-quote alice 5
at 10
bid alice 500 0.002
at 40
checkpoint
cancel alice SLOT SEQUENCE
at 110
checkpoint
claim-tokens alice [recipient]
claim-refund alice [recipient]
claim-proceeds creator [recipient]
claim-tokens creator [recipient]
cancel-before-start creator`
        : this.mechanism === "sale"
          ? `contribute alice 1
withdraw alice 0.1
close
settle
claim alice
advance 180
release`
          : `fund alice quote 1
fund creator native 0.01
buy alice 0.1 [minimum tokens]
sell alice 100 [minimum quote]
shares creator alice RAW_SHARES
collect creator
reinvest creator auto
redeem creator all
flush
claim 1
convert 1 quote 0.0001 0.1
weights 3 1
commit-split
commit-hook 10000 ceiling
hook-fee 5000
allocate creator team token 1000 START CLIFF END
allocate creator team shares RAW_SHARES START CLIFF END
advance SECONDS
release LOCK_ID
exit creator treasury token AMOUNT MIN_OUTPUT SLICES START INTERVAL EXPIRY REWARD_ETH
execute PLAN_ID keeper
pause creator PLAN_ID
resume creator PLAN_ID
cancel creator PLAN_ID`
    }</pre><p class="lp-note">An allocation releases linearly after its cliff. Set cliff equal to end for a cliff lock. Hook split weights apply when fees are flushed. Changing weights preserves previously deposited claims. Irrevocable policies reject later incompatible changes. No transaction is submitted from this calculator.</p></details><p role="status" aria-live="polite" data-economic-status class="lp-message">${esc(this.error)}</p><div data-economic-result>${this.results()}</div></section>`;
  }
  results() {
    const r = this.result;
    if (!r) return "";
    if (this.mechanism !== "pool") return this.lifecycleResults(r);
    const s = r.state,
      qd = s.model.qd,
      fmt = (n, d = 18) => decimal(n, d),
      accounts = Object.entries(s.accounts).filter(
        ([, a]) => a.token + a.quote + a.native + a.shares > 0n,
      ),
      claimRows = Object.entries(s.claims).filter(
        ([, a]) => a.token + a.quote > 0n,
      );
    return `<div class="economic-balance"><strong>Every asset is accounted for.</strong><span>${r.complete ? "Sequence completed" : `Stopped at event ${r.history.at(-1)?.line}; rejected action made no changes`}</span><span>${s.now.toLocaleString()} seconds elapsed · ${fmt(s.totalShares)} total LP shares</span></div><div class="economic-table-wrap"><table><thead><tr><th>Custody or account</th><th>Token</th><th>Quote</th><th>LP shares</th><th>Reward ETH</th></tr></thead><tbody>${accounts.map(([id, a]) => `<tr><th>${esc(id)}</th><td>${esc(fmt(a.token))}</td><td>${esc(fmt(a.quote, qd))}</td><td>${esc(fmt(a.shares))}</td><td>${esc(fmt(a.native))}</td></tr>`).join("")}${[["Pool principal", s.reserves], ["Unrealized LP fees / rounding", s.poolFees], ["Position fee custody", s.position], ["Unflushed creator fees", s.hookPending], ...claimRows.map(([id, a]) => ["Fee claim · " + id, a])].map(([id, a]) => `<tr><th>${esc(id)}</th><td>${esc(fmt(a.token))}</td><td>${esc(fmt(a.quote, qd))}</td><td>—</td><td>—</td></tr>`).join("")}</tbody></table></div><ol class="economic-events">${r.history.map((e) => `<li class="${e.status === "rejected" ? "economic-rejected" : ""}"><code>${esc(e.text)}</code><span>${e.status === "rejected" ? esc(e.error) : e.trade ? `Received ${esc(fmt(e.trade.out, e.trade.outputDecimals))} ${esc(e.trade.outputAsset)}; exact custody balanced` : e.collected ? "Fees collected; principal preserved" : e.reinvested ? "Earned fees became additional liquidity and shares" : "Applied; exact custody balanced"}</span></li>`).join("")}</ol>`;
  }
  lifecycleResults(r) {
    const s = r.state,
      auction = this.mechanism === "auction",
      accounts = Object.entries(s.accounts),
      custody = auction
        ? [
            ["Auction inventory", s.vaultToken, 0n],
            ["Auction ETH escrow", 0n, s.vaultQuote],
          ]
        : [
            ["Sale inventory", s.saleTokens, 0n],
            ["Contribution escrow", 0n, s.escrow],
            ["Seeded liquidity", s.lpToken, s.lpQuote],
            ["Vested founder/treasury", s.founderLocked, s.treasuryLocked],
          ];
    return `<div class="economic-balance"><strong>Every tracked token and ETH unit is accounted for.</strong><span>${r.complete ? "Sequence completed" : "Stopped before the rejected action changed state"}</span><span>${auction ? "Block " + s.block + " · " + s.soldLots + " lots sold · " + (s.closed ? "closed" : "open") : "Status: " + s.status}</span></div><div class="economic-table-wrap"><table><thead><tr><th>Account / custody</th><th>Token</th><th>ETH</th></tr></thead><tbody>${[...accounts.map(([id, a]) => [id, a.token, a.quote]), ...custody].map(([id, token, quote]) => `<tr><th>${esc(id)}</th><td>${esc(decimal(token))}</td><td>${esc(decimal(quote))}</td></tr>`).join("")}</tbody></table></div>${auction ? `<p class="lp-note">Seller proceeds owed: ${esc(decimal(s.sellerCredit))} ETH · Refunds and token claims remain in escrow until explicitly claimed.</p>` : ""}<ol class="economic-events">${r.history
      .map(
        (e) =>
          `<li class="${e.status === "rejected" ? "economic-rejected" : ""}"><code>${esc(e.text)}</code><span>${
            e.status === "rejected"
              ? esc(e.error)
              : e.fills?.length
                ? e.fills
                    .map(
                      (f) =>
                        `${f.bidder}: ${f.lots} lots at ${decimal(f.price)} ETH per lot`,
                    )
                    .map(esc)
                    .join("; ")
                : "Applied; exact custody balanced"
          }</span></li>`,
      )
      .join("")}</ol>`;
  }
  chooseMechanism(value) {
    if (!["pool", "sale", "auction", "cca", "doppler"].includes(value))
      throw Error("Choose an implemented mechanism.");
    const root = this.root;
    this.unmount();
    this.mechanism = value;
    if (this.isOfficial()) this.officialDesk.setMechanism(value);
    this.result = null;
    this.error = "";
    this.sequence =
      value === "pool"
        ? PRESETS.earnings
        : value === "sale"
          ? defaults().saleSequence
          : "fund creator\nfund-quote alice 5\nfund-quote bob 5\nat 10\nbid alice 500 0.002\nat 40\ncheckpoint\nbid bob 400 0.0015\nat 110\ncheckpoint\nclaim-tokens alice\nclaim-tokens bob\nclaim-tokens creator\nclaim-refund alice\nclaim-refund bob\nclaim-proceeds creator";
    if (root) {
      root.innerHTML = this.render();
      this.mount(root);
    }
    return this;
  }
  mount(root) {
    this.unmount();
    this.root = root;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    const officialRoot = root.querySelector("[data-economic-official]");
    if (officialRoot) {
      officialRoot.innerHTML = this.officialDesk.render();
      this.officialDesk.mount(officialRoot);
    }
    root.addEventListener(
      "input",
      (e) => {
        if (e.target.matches("[data-economic-mechanism]")) {
          this.chooseMechanism(e.target.value);
          return;
        }
        if (e.target.dataset.economicAuction) {
          this.auctionDraft[e.target.dataset.economicAuction] = e.target.value;
          this.result = null;
          this.refresh();
          return;
        }
        if (e.target.matches("[data-economic-sequence]")) {
          this.sequence = e.target.value;
          this.result = null;
          this.refresh();
        }
      },
      { signal },
    );
    root.addEventListener(
      "click",
      (e) => {
        const preset = e.target.closest("[data-economic-preset]");
        if (preset) {
          if (this.mechanism !== "pool") this.chooseMechanism("pool");
          this.sequence = PRESETS[preset.dataset.economicPreset];
          const t = root.querySelector("[data-economic-sequence]");
          if (t) t.value = this.sequence;
          this.run();
        } else if (e.target.closest("[data-economic-run]")) this.run();
        else if (e.target.closest("[data-economic-export]")) this.export();
      },
      { signal },
    );
  }
  unmount() {
    this.officialDesk.unmount();
    this.abort?.abort();
    this.abort = null;
    this.root = null;
  }
  refresh() {
    if (!this.root) return;
    const status = this.root.querySelector("[data-economic-status]"),
      result = this.root.querySelector("[data-economic-result]");
    if (status) status.textContent = this.error;
    if (result) result.innerHTML = this.results();
  }
  run() {
    if (this.isOfficial()) {
      this.error =
        "Use the selected protocol scenario controls to execute its contracts.";
      return null;
    }
    this.error = "";
    try {
      this.result =
        this.mechanism === "auction"
          ? replayAuctionEconomics(this.auctionDraft, this.sequence)
          : this.mechanism === "sale"
            ? replaySale(
                { ...this.currentDraft(), mode: "sale" },
                this.sequence,
              )
            : replayEconomics(this.currentDraft(), this.sequence);
    } catch (error) {
      this.result = null;
      this.error = error.message;
    }
    this.refresh();
    return this.result;
  }
  export() {
    const r = this.result || this.run();
    if (!r) return;
    const data = JSON.stringify(
      economyJSON({
        schema: "anima.economics-scenario/1",
        draft: this.currentDraft(),
        sequence: this.sequence,
        ...r,
      }),
      null,
      2,
    );
    if (this.onExport) {
      this.onExport(data, "anima-economic-scenario.json", "application/json");
      return;
    }
    const url = URL.createObjectURL(
        new Blob([data], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "anima-economic-scenario.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
