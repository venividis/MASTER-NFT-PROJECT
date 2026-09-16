import {
  connectedExitVault,
  prepareLiveExit,
  exitAsset,
  formatExitAmount,
} from "./live.mjs";
import { ZeroAddress } from "../vendor/ethers.min.js";
const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const button = (key, title) =>
  `<button type="button" class="cf-button" data-do="exit-live:${key}">${title}</button>`;
const f = (id, title, value) =>
  `<label for="exit-live-${id}">${title}</label><input id="exit-live-${id}" value="${esc(value)}">`;
export class LiveExitDesk {
  constructor(wallet, show, read, saved) {
    this.wallet = wallet;
    this.show = show;
    this.read = read;
    this.saved = saved;
  }
  render() {
    return `<span class="cf-tag">ONCHAIN · CONFIGURED CONTRACT REQUIRED</span><h3>Fund a living schedule.</h3><p>After a swap, place a chosen balance into a VestedExitVault. An executor may sell each vested installment during its window, at its fixed minimum. No executor is running merely because this page is open.</p>${this.wallet.connected ? `<p>Artifact account <code>${esc(this.wallet.account)}</code></p>` : '<button class="cf-button" data-do="nav:connect">Connect an owned NFT</button>'}<form id="exit-live-create"><details><summary>Advanced · verified vault deployment</summary>${f("vault", "Exit vault address", this.wallet.modules?.exit || this.read("exit-vault", ""))}<p>The complete runtime must match this release before funding is prepared.</p></details>${f("input", "Funded asset address · zero for native", ZeroAddress)}${f("output", "Receive asset address", ZeroAddress)}<label for="exit-live-rows">Each row: days from now, amount to sell, minimum tokens received, sale window days</label><textarea id="exit-live-rows" rows="5" placeholder="30, 0.025, YOUR_MINIMUM, 7" required></textarea><p class="cf-small">Use ordinary token amounts, such as 0.025 ETH or 25 USDC. Each token’s decimals are read from the connected chain. Choose a meaningful minimum for every installment.</p><details><summary>Advanced · attach a public memory commitment</summary>${f("decision", "Memory digest", "0x" + "0".repeat(64))}</details><button class="cf-button primary" type="submit">Simulate & review funded schedule</button></form><div id="cf-exit-terms"></div><div id="cf-transaction-review"></div><h3>Inspect or operate an existing schedule</h3>${f("id", "Onchain plan ID", "1")}${button("load", "Read schedule from chain")}<div id="cf-exit-live-plan"></div><details><summary>Execution, custody & cancellation</summary><p>Funding uses your NFT account’s exact-allowance utility call. It clears ERC20 allowance in the same transaction. Live swap, journal and schedule funding remain separate explicit transactions; no local receipt claims they were atomically executed onchain.</p><p>The supplied executor runs against the deployed vault. Its transaction pays gas; your fixed recipient and minimums cannot be changed by it. A failed sale leaves the installment pending. There is no promise of a fill, price or execution time.</p><p>Pause or permanently cancel sales. Cancellation keeps original vesting dates. NFT transfers retire old authority; a new owner must reauthorize, then resume. Existing immutable marketplace indexes must be replaced with a roster that includes this vault before relying on their inventory checks.</p></details>`;
  }
  async submit(container) {
    const val = (n) => container.querySelector("#exit-live-" + n).value;
    const result = await prepareLiveExit(this.wallet, {
      vault: val("vault"),
      input: val("input"),
      output: val("output"),
      rows: val("rows"),
      decision: val("decision"),
    });
    this.saved("exit-vault", val("vault"));
    container.querySelector("#cf-exit-terms").innerHTML =
      `<h4>Exact funded commitment</h4><p>${esc(formatExitAmount(result.total, result.inputAsset))}. Sales pay ${esc(result.output)} to this artifact account.</p><div class="ex-slices">${result.slices.map((s, i) => `<article><span>${new Date(s.due * 1000).toLocaleString()}</span><strong>${esc(formatExitAmount(s.amount, result.inputAsset))} → at least ${esc(formatExitAmount(s.minOut, result.outputAsset))}</strong><small>Current adapter quote: ${result.quotes[i] === null ? "Unavailable for this v4 adapter; your fixed minimum still applies" : esc(formatExitAmount(result.quotes[i], result.outputAsset))} · window ends ${new Date(s.expires * 1000).toLocaleString()}</small></article>`).join("")}</div>`;
    this.show(result.plan);
  }
  async action(key, container) {
    const val = (n) => container.querySelector("#exit-live-" + n).value,
      [act, index] = key.split(":"),
      id = BigInt(val("id")),
      vault = await connectedExitVault(this.wallet, val("vault")),
      p = await vault.plans(id);
    if (p.account.toLowerCase() !== this.wallet.account.toLowerCase())
      throw Error("Schedule is not funded by this selected artifact account.");
    if (act === "load") {
      const [inputAsset, outputAsset] = await Promise.all([
        exitAsset(this.wallet.provider, p.input),
        exitAsset(this.wallet.provider, p.output),
      ]);
      const n = Number(await vault.sliceCount(id)),
        rows = [];
      if (n > 64) throw Error("Unsupported schedule length.");
      for (let i = 0; i < n; i++) {
        const s = await vault.sliceAt(id, i),
          eligible = await vault.eligible(id, i);
        rows.push(
          `<article><span>INSTALLMENT ${i + 1} · ${s.status === 1n ? "SOLD" : s.status === 2n ? "RECOVERED" : eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}</span><strong>${esc(formatExitAmount(s.amount, inputAsset))} → minimum ${esc(formatExitAmount(s.minOut, outputAsset))}</strong><small>${new Date(Number(s.due) * 1000).toLocaleString()} · expires ${new Date(Number(s.expires) * 1000).toLocaleString()}</small>${s.status === 1n ? `<p>Actually received ${esc(formatExitAmount(s.received, outputAsset))}.</p>` : s.status === 0n ? `${eligible ? button("sell:" + i, "Review installment execution") : ""}${button("recover:" + i, "Review matured recovery")}` : ""}</article>`,
        );
      }
      container.querySelector("#cf-exit-live-plan").innerHTML =
        `<p>Authority epoch ${p.epoch} · ${p.cancelled ? "Cancelled" : p.paused ? "Paused" : "Authorized"} · proceeds ${esc(p.account)}</p><div class="cf-actions">${button("pause", "Pause")}${button("resume", "Resume")}${button("cancel", "Cancel future sales")}${button("reauthorize", "Reauthorize & pause")}</div><div class="ex-slices">${rows.join("")}</div>`;
      return;
    }
    const data = ["sell", "recover"].includes(act)
      ? vault.interface.encodeFunctionData(
          act === "sell" ? "executeSlice" : "recover",
          [id, Number(index)],
        )
      : vault.interface.encodeFunctionData("control", [
          id,
          { pause: 0, resume: 1, cancel: 2, reauthorize: 3 }[act],
        ]);
    this.show(
      await this.wallet.prepareUtility({
        target: vault.target,
        asset: ZeroAddress,
        amount: "0",
        value: "0",
        data,
      }),
    );
  }
}
