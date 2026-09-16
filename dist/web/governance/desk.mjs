import { GovernanceClient } from "./client.mjs";
import {
  Contract,
  formatEther,
  formatUnits,
  parseEther,
  parseUnits,
  ZeroAddress,
  keccak256,
  toUtf8Bytes,
} from "../vendor/ethers.min.js";

const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const short = (v) => (v ? `${v.slice(0, 6)}…${v.slice(-4)}` : "—");
const button = (action, label, extra = "") =>
  `<button type="button" data-governance="${action}" ${extra}>${esc(label)}</button>`;
const input = (name, label, value = "", extra = "") =>
  `<label>${esc(label)}<input name="${name}" value="${esc(value)}" autocomplete="off" ${extra}></label>`;
const kinds = [
  "Account operation",
  "Bounded operator",
  "Revoke operator",
  "Funded buyout",
  "Track asset",
];
const printable = (v) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? String(x) : x), 2);

export class GovernanceDesk {
  constructor({
    chain,
    provider = () => globalThis.ethereum,
    onChange = () => {},
  } = {}) {
    this.chain = chain;
    this.provider = provider;
    this.onChange = onChange;
    this.client = new GovernanceClient({ chain });
    this.tab = "overview";
    this.state = null;
    this.notice = "";
    this.draft = {};
    this.busy = false;
    this.revision = 0;
  }
  render() {
    return '<section class="governance-desk" aria-label="Operating shared ownership"></section>';
  }
  mount(container) {
    this.root = container.matches?.(".governance-desk")
      ? container
      : container.querySelector(".governance-desk");
    if (!this.root) throw Error("Ownership surface is missing.");
    this.paint();
    return this;
  }
  unmount() {
    this.capture();
    this.revision++;
    if (this.chain.plan?.kind?.startsWith("governance-"))
      this.chain.invalidate();
    this.root?.replaceChildren();
    this.root = null;
  }
  capture() {
    for (const e of this.root?.querySelectorAll(
      "input[name],textarea[name],select[name]",
    ) || [])
      this.draft[e.name] = e.value;
  }
  value(name) {
    return (
      this.root?.querySelector(`[name="${name}"]`)?.value ??
      this.draft[name] ??
      ""
    );
  }
  field(name, label, value = "", extra = "") {
    return input(name, label, this.draft[name] ?? value, extra);
  }
  async run(job) {
    if (this.busy) return;
    this.capture();
    this.busy = true;
    const revision = this.revision;
    this.paint();
    try {
      await job();
    } catch (e) {
      this.notice =
        e.message || "This ownership operation could not be completed.";
    } finally {
      this.busy = false;
      if (revision === this.revision) this.paint();
      this.onChange(this.state);
    }
  }
  async refresh() {
    if (this.client.contract) this.state = await this.client.snapshot();
  }
  async review(action, values = {}) {
    await this.client.prepare(action, values);
    await this.chain.reviewNext();
    this.notice =
      "Read the exact operation below, then confirm in your wallet.";
  }
  paint() {
    if (!this.root) return;
    const s = this.state,
      review =
        this.chain.plan?.kind?.startsWith("governance-") && this.chain.review;
    this.root.innerHTML = `<header><div><span class="governance-eyebrow">SHARED OWNERSHIP · OPERATING CUSTODY</span><h2>One Anima. A shared direction.</h2><p>Shareholders vote on exact operations, with visible budgets and time to respond.</p></div>${this.chain.address ? `<span>${esc(short(this.chain.address))} · Chain ${esc(this.chain.chainId)}</span>` : button("connect", "Connect wallet")}</header>
 <p class="governance-boundary">This optional contract gives shareholders operating authority. Existing frozen whole-NFT shares keep their original custody promise. Private keys, offchain rights and chat history are not transferred.</p>
 ${this.chain.execution?.mode === "nft" ? `<p>Ownership votes use your signing wallet. ${button("wallet", "Use signing wallet")}</p>` : ""}
 <div class="governance-open">${this.field("address", "Ownership contract", s?.address || "")}${button("open", "Verify and open")}${s ? button("refresh", "Refresh chain state") : ""}</div>
 <nav aria-label="Ownership tools">${[
   ["overview", "Ownership"],
   ["proposals", "Proposals"],
   ["create", "Create shared ownership"],
   ["exit", "Shares and exits"],
 ]
   .map(([key, label]) =>
     button(
       "tab",
       label,
       `data-tab="${key}" aria-pressed="${this.tab === key}"`,
     ),
   )
   .join("")}</nav>
 <p role="status">${esc(this.notice)}</p>
 ${this.tab === "create" ? this.createView() : !s ? '<div class="governance-empty"><h3>Choose how this NFT will be governed.</h3><p>Open a deployed ownership contract or create one for an unused NFT you own. Every transaction is reviewed before a wallet signature.</p></div>' : this.tab === "overview" ? this.overview() : this.tab === "proposals" ? this.proposalsView() : this.exitView()}
 ${review ? `<section class="governance-review"><h3>${esc(review.purpose)}</h3><dl><dt>Signer</dt><dd>${esc(review.account)}</dd><dt>Network</dt><dd>${esc(review.chainId)}</dd><dt>Destination</dt><dd>${esc(review.request.to || this.chain.plan.meta?.predictedAddress)}</dd><dt>Native value</dt><dd>${esc(formatEther(review.request.value || 0))}</dd><dt>Maximum gas estimate</dt><dd>${esc(formatEther(review.maximumGasCost))}</dd></dl><details><summary>Exact operation and policy</summary><pre>${esc(printable(this.chain.plan.summary))}</pre><code>${esc(review.request.data)}</code></details>${button("sign", "Confirm in wallet")}${button("cancel-review", "Cancel review")}</section>` : ""}
 ${this.chain.pending() ? `<section class="governance-review"><h3>Transaction awaiting recovery</h3><code>${esc(this.chain.pending().hash)}</code>${button("recover", "Recover receipt")}</section>` : ""}`;
    this.root.onclick = (e) => {
      const b = e.target.closest("[data-governance]");
      if (b && this.root.contains(b)) {
        e.preventDefault();
        this.dispatch(b.dataset);
      }
    };
    this.root.oninput = () => {
      this.capture();
      if (this.chain.plan?.kind?.startsWith("governance-")) {
        this.chain.invalidate();
        this.root.querySelector(".governance-review")?.remove();
      }
    };
    if (this.busy)
      for (const b of this.root.querySelectorAll("button")) b.disabled = true;
  }
  overview() {
    const s = this.state;
    return `<div class="governance-stats"><article><small>Your voting shares</small><strong>${esc(formatUnits(s.balance, 18))}</strong><span>of ${esc(formatUnits(s.originalSupply, 18))}</span></article><article><small>Voting period</small><strong>${Number(s.votingPeriod) / 86400} days</strong><span>Then ${Number(s.executionDelay) / 3600} hours before execution</span></article><article><small>Buyout protection</small><strong>${Number(s.buyoutBps) / 100}% of all shares</strong><span>Minimum ${esc(formatEther(s.minimumBuyoutPrice))} native currency</span></article></div><dl><dt>Collection / NFT</dt><dd>${esc(s.collection)} / ${esc(s.tokenId)}</dd><dt>Account</dt><dd>${esc(s.account)}</dd><dt>Transferable voting token</dt><dd>${esc(s.shares)}</dd><dt>Ordinary vote</dt><dd>${Number(s.quorumBps) / 100}% quorum · ${Number(s.supportBps) / 100}% support among votes cast</dd><dt>Proposal threshold</dt><dd>${Number(s.proposalBps) / 100}% of all shares</dd><dt>Custody</dt><dd>${s.exited ? "Exited" : s.deposited ? "Operating shared ownership" : "Awaiting NFT deposit"}</dd><dt>Read at block</dt><dd>${esc(s.block)}</dd></dl>${!s.deposited ? `<p>Approval selects this exact NFT. Deposit transfers it and distributes all shares under the immutable policy.</p>${button("approve", "Review NFT approval")}${button("deposit", "Review custody and share distribution")}` : ""}<details><summary>Protected assets and obligations</summary><p>Native currency and these fungible balances are checked around every operation. Inputs cannot exceed their voted budget. Outputs must meet the voted minimum. Registered obligation commitments are disclosures; they do not automatically detect external debt.</p><ul>${s.assets.map((a) => `<li><code>${esc(a)}</code></li>`).join("") || "<li>No fungible assets registered yet.</li>"}</ul><p>Obligations commitment: <code>${esc(s.obligationsRoot)}</code></p><p>Initial property disclosure: <code>${esc(s.disclosure)}</code></p>${this.field("trackAsset", "Token contract to add")}${button("track", "Propose tracking this asset")}</details>`;
  }
  createView() {
    return `<section><h3>Set the rules before sharing ownership.</h3><p>Use a new, unused Bound NFT. Initial allocations and voting policies are immutable. A majority can approve spending within each proposal, and the chosen buyout supermajority can sell the NFT above the minimum price.</p><div class="governance-grid">${this.field("collection", "NFT collection")}${this.field("tokenId", "NFT number", "1")}${this.field("quorum", "Quorum · % of all shares", "50")}${this.field("support", "Support · % of votes cast", "66.67")}${this.field("buyoutThreshold", "Buyout approval · % of all shares", "100")}${this.field("proposalThreshold", "Minimum shareholding to propose · %", "1")}${this.field("votingDays", "Voting period · days", "3")}${this.field("delayHours", "Execution delay · hours", "24")}${this.field("minimumBuyout", "Minimum funded buyout · native currency", "1")}</div><label>Initial holders · one wallet address and share amount per line<textarea name="holders" rows="4" placeholder="0x… 60&#10;0x… 40">${esc(this.draft.holders || "")}</textarea></label><label>Protected fungible token addresses · one per line, up to 16<textarea name="assets" rows="2">${esc(this.draft.assets || "")}</textarea></label><label>Property and obligation disclosure · text committed onchain<textarea name="disclosure" rows="3" placeholder="Describe what belongs to this NFT, known obligations and the chosen operating policy.">${esc(this.draft.disclosure || "")}</textarea></label>${button("deploy", "Review ownership contract deployment")}</section>`;
  }
  proposalsView() {
    const s = this.state;
    return `<div class="governance-proposals">${s.proposals.map((p) => `<article><header><h3>#${p.id} · ${esc(kinds[p.kind])}</h3><span>${p.executed ? "Executed" : p.cancelled ? "Cancelled" : Number(p.voteEnd) > s.timestamp ? "Voting" : p.eta !== "0" ? "Queued" : p.successful ? "Passed" : "Did not pass"}</span></header><p>${esc(formatUnits(p.yes, 18))} for · ${esc(formatUnits(p.no, 18))} against · snapshot block ${esc(p.snapshot)}</p><p>Voting ends ${esc(new Date(Number(p.voteEnd) * 1000).toISOString())}${p.eta !== "0" ? ` · executable after ${esc(new Date(Number(p.eta) * 1000).toISOString())}` : ""}</p><details><summary>Exact operation, asset budgets and conditions</summary><pre>${esc(printable(p.details))}</pre><code>${esc(p.payload)}</code></details><div class="governance-actions">${!p.executed && !p.cancelled ? `${button("yes", "Vote for", `data-id="${p.id}" ${p.voted || Number(p.voteEnd) <= s.timestamp ? "disabled" : ""}`)}${button("no", "Vote against", `data-id="${p.id}" ${p.voted || Number(p.voteEnd) <= s.timestamp ? "disabled" : ""}`)}${button("queue", "Queue", `data-id="${p.id}" ${!p.successful || p.eta !== "0" ? "disabled" : ""}`)}${button("execute", "Execute", `data-id="${p.id}" ${!p.successful || p.eta === "0" || Number(p.eta) > s.timestamp ? "disabled" : ""}`)}${button("cancel", "Cancel or expire", `data-id="${p.id}"`)}` : ""}</div></article>`).join("") || "<p>No proposals have been created.</p>"}${s.nextProposal !== "0" ? button("more", "Load earlier proposals") : ""}</div><details class="governance-compose"><summary>Propose an account operation</summary><p>Choose exact contract calldata and the asset movement you authorize. This is a specialist interface: every shareholder can inspect the exact bytes before voting.</p><div class="governance-grid">${this.field("target", "Operation contract")}${this.field("inputAsset", "Input token · empty means native currency")}${this.field("maxInput", "Maximum input · token units", "0")}${this.field("nativeValue", "Native value · native currency", "0")}${this.field("outputAsset", "Output token · empty means native currency")}${this.field("minOutput", "Minimum net output · token units", "0")}${this.field("validDays", "Operation deadline · days from now", "14")}</div><label>Exact calldata<textarea name="data" rows="3" placeholder="0x…">${esc(this.draft.data || "")}</textarea></label><details><summary>Bind a contract state precondition</summary>${this.field("conditionTarget", "Contract to read")}${this.field("conditionData", "Exact read calldata", "0x")}${this.field("conditionResultHash", "Expected keccak256 of encoded return bytes")}${this.field("nextObligations", "New obligation commitment · optional")}</details>${button("propose", "Review exact-operation proposal")}<details><summary>Authorize a bounded repeat operator</summary><p>The operator can repeat only these exact bytes, within the same per-call budget, output minimum and state precondition. It cannot change the obligation commitment.</p>${this.field("operatorCaller", "Operator wallet or contract")}${this.field("operatorBudget", "Total input budget · token units")}${this.field("operatorCalls", "Maximum number of calls", "3")}${this.field("operatorDays", "Operator expiry · days from now", "21")}${button("operator", "Review bounded-operator proposal")}</details></details><details><summary>Existing operator controls</summary>${this.field("operatorId", "Operator proposal number")}${button("operator-run", "Execute approved call")}${button("operator-renounce", "Renounce my operator permission")}${button("revoke", "Propose revocation")}</details>`;
  }
  exitView() {
    const s = this.state;
    return `<div class="governance-grid"><section><h3>Transfer ownership shares</h3><p>Shares carry future voting power and the right to buyout proceeds. Existing proposal snapshots do not move with transfers.</p>${this.field("shareRecipient", "Recipient wallet")}${this.field("shareAmount", "Shares to transfer")}${button("transfer", "Review share transfer")}</section><section><h3>Fund a buyout</h3><p>Offer at least ${esc(formatEther(s.minimumBuyoutPrice))} native currency. Approval needs ${Number(s.buyoutBps) / 100}% of all shares. The account nonce and obligation commitment must remain unchanged through execution; a stale offer can expire for refund.</p>${this.field("buyoutRecipient", "NFT recipient", this.chain.address || "")}${this.field("buyoutPrice", "Funded price · native currency")}${button("buyout", "Review funded offer")}</section><section><h3>Claim or recover</h3><p>Remaining buyout proceeds: ${esc(formatEther(s.redemptionPool))} native currency. Your refundable offers: ${esc(formatEther(s.refund))}.</p>${this.field("exitRecipient", "Recipient wallet", this.chain.address || "")}${this.field("redeemShares", "Shares to redeem", formatUnits(s.balance, 18))}${button("redeem", "Redeem buyout proceeds", !s.exited ? "disabled" : "")}${button("refund", "Withdraw refundable offer", s.refund === "0" ? "disabled" : "")}${button("whole", "Recover NFT with all shares", s.exited || s.balance !== s.originalSupply ? "disabled" : "")}</section></div>`;
  }
  async units(value, asset) {
    if (!asset || asset.toLowerCase() === ZeroAddress)
      return parseEther(value || "0");
    const token = new Contract(
      asset,
      ["function decimals() view returns(uint8)"],
      this.chain.provider,
    );
    const decimals = Number(await token.decimals());
    if (decimals > 36) throw Error("Unsupported token precision.");
    return parseUnits(value || "0", decimals);
  }
  async actionInput() {
    const inputAsset = this.value("inputAsset").trim(),
      outputAsset = this.value("outputAsset").trim(),
      block = await this.chain.provider.getBlock("latest");
    return {
      target: this.value("target").trim(),
      inputAsset,
      outputAsset,
      maxInput: await this.units(this.value("maxInput"), inputAsset),
      minOutput: await this.units(this.value("minOutput"), outputAsset),
      value: parseEther(this.value("nativeValue") || "0"),
      deadline: Math.floor(
        block.timestamp + Number(this.value("validDays")) * 86400,
      ),
      data: this.value("data").trim(),
      conditionTarget: this.value("conditionTarget").trim(),
      conditionData: this.value("conditionData").trim(),
      conditionResultHash:
        this.value("conditionResultHash").trim() || undefined,
      nextObligations: this.value("nextObligations").trim() || undefined,
    };
  }
  dispatch(data) {
    if (this.busy) return;
    this.capture();
    const action = data.governance;
    if (action === "tab") {
      this.tab = data.tab;
      this.paint();
      return;
    }
    if (action === "cancel-review") {
      this.chain.invalidate();
      this.paint();
      return;
    }
    return this.run(async () => {
      if (action === "connect") {
        await this.chain.connect(await this.provider());
        this.notice = "Wallet connected.";
        return;
      }
      if (action === "wallet") {
        this.chain.useWallet();
        this.notice = "Votes and setup now use your signing wallet.";
        return;
      }
      if (action === "open") {
        this.state = await this.client.configure(this.value("address").trim());
        this.notice = "Ownership and voting-share runtimes verified.";
        return;
      }
      if (action === "more") {
        const previous = this.state.proposals,
          page = await this.client.snapshot({
            before: this.state.nextProposal,
          });
        this.state = { ...page, proposals: [...previous, ...page.proposals] };
        return;
      }
      if (action === "refresh") {
        await this.refresh();
        this.notice = "Read current chain state.";
        return;
      }
      if (action === "recover") {
        await this.chain.recoverTransactions();
        await this.refresh();
        this.notice = "Transaction recovery complete.";
        return;
      }
      if (action === "sign") {
        const record = await this.chain.sendReviewed();
        this.notice =
          record.status === "confirmed"
            ? "Transaction confirmed."
            : "Transaction submitted; recover its receipt.";
        if (
          record.status === "confirmed" &&
          record.kind === "governance-deploy"
        ) {
          this.draft.address =
            record.contractAddress || record.meta.predictedAddress;
          this.state = await this.client.configure(this.draft.address);
          this.tab = "overview";
        } else if (record.status === "confirmed") await this.refresh();
        return;
      }
      if (action === "deploy") {
        const allocations = this.value("holders")
          .trim()
          .split(/\n/)
          .filter(Boolean)
          .map((line) => line.trim().split(/\s+/));
        if (allocations.some((row) => row.length !== 2))
          throw Error(
            "Each allocation line needs one address and one share amount.",
          );
        const text = this.value("disclosure").trim();
        if (text.length < 20)
          throw Error("Write a meaningful property and obligation disclosure.");
        await this.client.prepareDeploy({
          collection: this.value("collection").trim(),
          tokenId: this.value("tokenId"),
          holders: allocations.map((x) => x[0]),
          amounts: allocations.map((x) => parseUnits(x[1], 18)),
          assets: this.value("assets").split(/\s+/).filter(Boolean),
          policy: {
            quorum: parseUnits(this.value("quorum"), 2),
            support: parseUnits(this.value("support"), 2),
            buyout: parseUnits(this.value("buyoutThreshold"), 2),
            proposal: parseUnits(this.value("proposalThreshold"), 2),
            voting: Math.round(Number(this.value("votingDays")) * 86400),
            delay: Math.round(Number(this.value("delayHours")) * 3600),
            minimumBuyout: parseEther(this.value("minimumBuyout")),
          },
          disclosure: keccak256(toUtf8Bytes(text)),
        });
        await this.chain.reviewNext();
        this.notice =
          "Review all immutable policies and allocations before deployment. Keep your full disclosure text with the project records.";
        return;
      }
      let values = { id: data.id };
      if (action === "propose" || action === "operator") {
        values = await this.actionInput();
        if (action === "operator") {
          const block = await this.chain.provider.getBlock("latest");
          Object.assign(values, {
            caller: this.value("operatorCaller").trim(),
            budget: await this.units(
              this.value("operatorBudget"),
              values.inputAsset,
            ),
            maxCalls: this.value("operatorCalls"),
            expires: Math.floor(
              block.timestamp + Number(this.value("operatorDays")) * 86400,
            ),
          });
        }
      } else if (action === "track")
        values = { asset: this.value("trackAsset").trim() };
      else if (action === "buyout")
        values = {
          recipient: this.value("buyoutRecipient").trim(),
          price: parseEther(this.value("buyoutPrice")).toString(),
        };
      else if (action === "transfer")
        values = {
          recipient: this.value("shareRecipient").trim(),
          amount: parseUnits(this.value("shareAmount"), 18),
        };
      else if (["redeem", "refund", "whole"].includes(action))
        values = {
          recipient: this.value("exitRecipient").trim(),
          amount: parseUnits(this.value("redeemShares") || "0", 18),
        };
      else if (["revoke", "operator-run", "operator-renounce"].includes(action))
        values = { id: this.value("operatorId") };
      await this.review(action, values);
    });
  }
}
