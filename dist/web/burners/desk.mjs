import { MintVault } from "./vault.mjs";
import { MINT_METHODS, nativeBudget, checkSite } from "./policy.mjs";
import { parseEther, formatEther } from "../vendor/ethers.min.js";
const h = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const button = (key, title, cls = "") =>
  `<button type="button" class="cf-button ${cls}" data-do="burner:${h(key)}">${title}</button>`;
const field = (name, label, value = "", type = "text") =>
  `<label for="burner-${name}">${label}</label><input id="burner-${name}" name="${name}" type="${type}" value="${h(value)}" ${type === "password" ? 'autocomplete="new-password" spellcheck="false"' : 'autocomplete="off"'}>`;
const stat = (name, value) =>
  `<div class="cf-stat"><span>${h(name)}</span><strong>${h(value)}</strong></div>`;
function download(value, name) {
  const url = URL.createObjectURL(
      new Blob(
        [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
        { type: "application/json" },
      ),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
/** This desk offers its own narrow signer. It is not an injected provider for other websites. */
export class BurnerDesk {
  #vault;
  #selected = null;
  #review = null;
  #inspection = null;
  #message = "";
  #busy = false;
  constructor(options) {
    this.#vault = new MintVault({ ...options, onLock: () => this.#scrub() });
    globalThis.document?.addEventListener("visibilitychange", () => {
      if (document.hidden) this.lock();
    });
    globalThis.addEventListener?.("pagehide", () => this.lock());
  }
  #scrub() {
    this.#review = null;
    this.#inspection = null;
    this.#message = "";
    let markup;
    try {
      markup = this.render();
    } catch {
      markup =
        '<section class="burner-desk" data-private-surface><p>Locked. The encrypted wallet index could not be read.</p></section>';
    }
    for (const desk of globalThis.document?.querySelectorAll?.(
      ".burner-desk",
    ) || [])
      desk.outerHTML = markup;
  }
  lock() {
    this.#vault.lock();
  }
  render() {
    const wallets = this.#vault.list(),
      r = wallets.find((w) => w.id === this.#selected);
    return `<section class="burner-desk" data-private-surface><span class="cf-tag">MINT SANCTUARY · REAL WALLET KEYS</span><h3>One project. One small ember.</h3><p>Give each mint its own independent wallet. Keep only a small native balance inside it. The master NFT and its keys stay separate.</p><p class="cf-small">This desk checks calls made here. It cannot watch MetaMask connections on other tabs. Simulation, code checks and isolation reduce exposure; they do not certify a project or make a compromised browser safe.</p><div class="cf-actions">${button("new", "New project wallet")}${button("lock", "Lock all keys")}${button("import", "Restore encrypted backup")}</div><div class="burner-wallets">${wallets.map((w, i) => button("select:" + w.id, w.unlocked ? h(w.policy.name) + "<span>" + h(w.address.slice(0, 8)) + "…" + h(w.address.slice(-4)) + " · unlocked</span>" : "Locked project wallet " + (i + 1) + (w.legacy ? " · migration needed" : ""), w.id === this.#selected ? "primary" : "")).join("")}</div>${this.#message ? `<p class="burner-report" role="status">${h(this.#message)}</p>` : ""}${r ? this.#walletPage(r) : this.#createPage()}<details class="burner-boundaries"><summary>Understand this wallet’s protection</summary><p>Each key is randomly generated. New and migrated wallets encrypt their entire record, including project details, addresses, budget and history, with your password. Its project, target, recovery address and original budget are signed by that key so altered backup policies are rejected. No main-wallet signature or NFT seed derives it. Keys lock after two minutes and when this page is hidden. Keep the encrypted backup and password separately.</p><p>The desk accepts only the listed mint methods, or explicit recovery to your fixed address. It never requests permits, operator approvals, arbitrary message signatures, batches or wallet delegation. Contract and detected ERC-1967 proxy changes stop new calls. Other proxy patterns and malicious contract behavior may escape these checks.</p><p>The spending limit is enforced by this application, not by an EOA onchain. Exported keys, restored backups, another application or compromised browser code can bypass it. A minimally funded independent wallet is the actual containment boundary.</p><p>Unknown NFT media remains unopened. Contract-reported ownership and a successful simulation are observations, not guarantees. Inspect a token before choosing whether to move it.</p></details></section>`;
  }
  #createPage() {
    return `<form id="burner-create"><h3>Kindle a project wallet</h3>${field("name", "Project name")}${field("origin", "Exact project HTTPS URL", "https://")}${field("chain", "Chain ID · Ethereum 1, Sepolia 11155111 or local 31337", "1", "number")}${field("rpc", "Trusted HTTPS RPC endpoint")}${field("target", "Collection mint contract address · direct mint only")}${field("recovery", "Recovery address · regular EOA, no Safe or contract account")}${field("budget", "Total mint budget including gas · native asset", "0.02")}${field("password", "New encryption password · at least 16 characters", "", "password")}${field("confirm", "Repeat the encryption password", "", "password")}<label class="burner-consent"><input id="burner-isolated" type="checkbox" required> I will use a new password and fund only what I am willing to expose to this project.</label><button type="submit" class="cf-button primary">Create & verify encrypted backup</button><p class="cf-small">This creates an EOA. It does not mint anything, fund the address, connect to the project website or grant the project permission.</p></form>`;
  }
  #walletPage(r) {
    if (!r.unlocked)
      return `<h3>Encrypted project wallet</h3><p>${r.legacy ? "This older wallet still has plaintext metadata on this device. Unlock once to migrate its complete record to encrypted storage." : "Its address, project details, budget and transaction history stay encrypted until you unlock."}</p><form id="burner-unlock">${field("password", "Unlock with this wallet’s password", "", "password")}<button type="submit" class="cf-button">Unlock for two minutes</button></form>${r.legacy ? "" : button("backup", "Download encrypted backup")}`;
    if (this.#review) return this.#reviewPage(r);
    const p = r.policy;
    return `<h3>${h(p.name)}</h3>${stat("Wallet", r.address)}${stat("Chain", p.chainId)}${stat("Pinned project", p.origin)}${stat("Mint contract", p.target)}${stat("Recovery address", p.recovery)}${stat("Mint budget / spent", formatEther(p.budget) + " / " + formatEther(r.spent) + " native")}${stat("Code pin", r.pin.codeHash)}${r.pin.proxy ? '<p class="burner-report">A proxy pattern was detected. Its settings and implementation code are checked again before signing; this is not a contract audit.</p>' : ""}<div class="cf-actions">${button("backup", "Download encrypted backup")}${button("copy", "Copy funding address")}${button("balance", "Read wallet balance")}</div><details><summary>Advanced · recover through another wallet</summary><p>This encrypted key file includes the public address. Importing it in another application bypasses this desk’s spending limits and mint restrictions.</p>${button("key-backup", "Export encrypted key for recovery")}</details><p class="cf-small">Save the backup first. Send only a small amount from your wallet. Funding publicly links the source and burner addresses; isolation is not anonymity.</p>${r.pending ? `<article class="burner-report"><h4>Transaction reserved</h4><code>${h(r.pending.hash)}</code><p>No further transaction can be signed until this receipt is resolved. Timeouts do not release its budget.</p>${button("pending", "Check pending transaction")}${button("rebroadcast", "Rebroadcast the same signed transaction")}</article>` : ""}${!r.unlocked ? `<form id="burner-unlock">${field("password", "Unlock with this wallet’s password", "", "password")}<button type="submit" class="cf-button">Unlock for two minutes</button></form>` : `<form id="burner-mint"><h3>Review a direct mint</h3>${field("site", "Project URL you are using", p.origin)}${button("site", "Compare project address")}<label for="burner-method">Supported mint function</label><select id="burner-method">${MINT_METHODS.map((m) => `<option>${h(m)}</option>`).join("")}</select>${field("quantity", "Quantity", "1", "number")}${field("value", "Total mint payment · native asset, excluding gas", "0")}<label class="burner-consent"><input id="burner-backup-confirmed" type="checkbox" required> I saved my encrypted backup and understand the project contract can still behave maliciously.</label><button type="submit" class="cf-button primary">Simulate & prepare exact mint</button><p class="cf-small">For allowlist proofs or other function signatures, this restricted desk refuses the call. It never guesses missing contract parameters.</p></form><div class="cf-actions">${button("sweep", "Review native balance recovery")}</div>`}<form id="burner-inspect"><h3>Inspect before you carry it home</h3>${field("token", "Token ID reported by the mint receipt", "1")}<label for="burner-standard">Token standard</label><select id="burner-standard"><option value="ERC721">ERC-721</option><option value="ERC1155">ERC-1155</option></select><button type="submit" class="cf-button">Inspect without opening media</button></form>${this.#inspection ? this.#inspectPage(this.#inspection, r) : ""}<h4>Confirmed activity</h4>${
      r.history.length
        ? r.history
            .slice(-10)
            .reverse()
            .map(
              (t) =>
                stat(
                  t.kind + " · " + (t.status === 1 ? "confirmed" : "reverted"),
                  t.hash,
                ) +
                (t.tokens || [])
                  .map(
                    (n) =>
                      `<p class="cf-small">Receipt reports ${h(n.standard)} #${h(n.tokenId)} · ${h(n.amount)} units. Inspect its current holding below.</p>`,
                  )
                  .join(""),
            )
            .join("")
        : '<p class="cf-small">No confirmed transaction yet.</p>'
    }`;
  }
  #reviewPage(r) {
    const q = this.#review;
    return `<span class="cf-tag">EXACT TRANSACTION REVIEW</span><h3>${q.kind === "mint" ? "Mint within this ember." : q.kind === "sweep" ? "Return unused native funds." : "Transfer this inspected NFT."}</h3>${stat("From", q.address)}${stat("To", q.target)}${stat("Chain / nonce", q.chainId + " / " + q.nonce)}${stat("Function", q.method)}${stat("Native value", formatEther(q.value))}${stat("Maximum transaction cost", formatEther(q.worst) + " native")}${stat("Gas limit / maximum fee", q.gasLimit + " / " + q.maxFeePerGas + " wei")}${stat("Review expires", new Date(q.expires).toLocaleTimeString())}${stat("Recovery recipient", q.kind === "mint" ? "Mint method uses this wallet where a recipient is supported" : r.policy.recovery)}<details><summary>Exact data & review digest</summary><code>${h(q.data)}</code><code>${h(q.digest)}</code></details><p class="burner-report">RPC simulation succeeded. This does not guarantee a mint, execution outcome, fair pricing, contract safety or future NFT behavior. Contract state can change before mining.</p><div class="cf-actions">${button("execute", "Sign & send this exact transaction", "primary")}${button("back", "Discard review")}</div>`;
  }
  #inspectPage(n, r) {
    return `<article class="burner-report"><h4>Inspection at block ${h(n.block)}</h4>${stat("Contract-reported holding", n.held ? n.balance + " token unit(s)" : "Not held")}${stat("Code matches pinned snapshot", n.codeUnchanged ? "Yes" : "No — new calls blocked")}${stat("Token approval", n.approval)}<p>${h(n.metadata)}</p><p class="cf-small">${h(n.scope)}</p>${n.held && n.codeUnchanged && r.unlocked ? `${field("transfer-amount", "Token units to recover", "1", "number")}${button("transfer", "Review NFT transfer to recovery address")}` : ""}</article>`;
  }
  async action(key, container, notice) {
    if (key === "lock") {
      this.#vault.lock();
      this.#review = null;
      this.#message =
        "Session keys discarded. Any pending unlock or new signature was cancelled.";
      container.innerHTML = this.render();
      return;
    }
    if (this.#busy) throw Error("A wallet operation is already running.");
    this.#busy = true;
    const val = (n) => container.querySelector("#burner-" + n)?.value;
    try {
      const [act, id] = key.split(":");
      if (act === "new") {
        this.#selected = null;
        this.#review = null;
        this.#inspection = null;
        this.#message = "";
      } else if (act === "select") {
        this.#selected = id;
        this.#review = null;
        this.#inspection = null;
        this.#message = "";
      } else if (act === "lock") {
        this.#vault.lock();
        this.#review = null;
        this.#message =
          "Session keys discarded. Encrypted backups remain unchanged.";
      } else if (act === "backup") {
        download(
          this.#vault.backup(this.#selected),
          "anima-mint-wallet-" + this.#selected + ".json",
        );
        this.#message =
          "Encrypted backup download requested. Verify that you saved it before funding this address.";
      } else if (act === "key-backup") {
        download(
          this.#vault.exportEncryptedKey(this.#selected),
          "anima-recovery-key-" + this.#selected + ".json",
        );
        this.#message =
          "Encrypted recovery-key download requested. Keep its password separate.";
      } else if (act === "copy") {
        await navigator.clipboard.writeText(
          this.#vault.list().find((w) => w.id === this.#selected).address,
        );
        notice("Funding address copied.");
        return;
      } else if (act === "balance") {
        this.#message =
          "Current wallet balance: " +
          formatEther(await this.#vault.balance(this.#selected)) +
          " native.";
      } else if (act === "site") {
        const r = this.#vault.list().find((w) => w.id === this.#selected),
          report = checkSite(r.policy.origin, val("site"));
        notice(
          report.matches
            ? "Entered origin matches the pinned origin. This is not a site safety verdict."
            : "ORIGIN MISMATCH — do not continue.",
        );
        return;
      } else if (act === "pending") {
        const result = await this.#vault.checkPending(this.#selected);
        let inspectionFailure = "";
        if (result.state === "confirmed" && result.result.tokens?.length) {
          const token = result.result.tokens[0];
          try {
            this.#inspection = await this.#vault.inspect(
              this.#selected,
              token.tokenId,
              token.standard,
            );
          } catch {
            inspectionFailure =
              " Receipt confirmed, but current NFT ownership could not be verified. Keep the asset isolated and inspect the receipt independently.";
          }
        }
        this.#message =
          "Transaction state: " +
          result.state +
          (result.hash ? " · " + result.hash : "") +
          (result.state === "confirmed"
            ? inspectionFailure ||
              (result.result.tokens?.length
                ? ". Receipt token inspected below."
                : ". No supported NFT transfer was found; success does not prove a mint.")
            : "");
      } else if (act === "rebroadcast") {
        this.#message =
          "Exact signed transaction rebroadcast: " +
          (await this.#vault.rebroadcast(this.#selected));
      } else if (act === "back") {
        this.#review = null;
      } else if (act === "execute") {
        const hash = await this.#vault.execute(this.#review?.digest);
        this.#review = null;
        this.#message =
          "Submitted: " +
          hash +
          ". Check its pending status before calling it a successful mint.";
      } else if (act === "sweep") {
        this.#review = await this.#vault.prepare(this.#selected, {
          kind: "sweep",
        });
      } else if (act === "transfer") {
        this.#review = await this.#vault.prepare(this.#selected, {
          kind: "transfer",
          tokenId: this.#inspection.tokenId,
          standard: this.#inspection.standard,
          amount: val("transfer-amount"),
        });
      } else if (act === "import") {
        container.innerHTML = `<h3>Restore an encrypted mint wallet</h3><form id="burner-restore"><label>Encrypted Anima backup JSON</label><input id="burner-file" type="file" accept=".json,application/json" required>${field("password", "Backup password", "", "password")}<p>Restoring an old backup can restore stale local spending limits. Keep this wallet minimally funded and review pending transactions independently.</p><button class="cf-button primary" type="submit">Decrypt & verify backup</button></form>`;
        return;
      }
      container.innerHTML = this.render();
    } finally {
      this.#busy = false;
    }
  }
  async submit(form, container, notice) {
    if (this.#busy) throw Error("A wallet operation is already running.");
    this.#busy = true;
    const val = (n) => container.querySelector("#burner-" + n)?.value;
    try {
      if (form === "burner-create") {
        if (val("password") !== val("confirm"))
          throw Error("Passwords do not match.");
        if (!container.querySelector("#burner-isolated")?.checked)
          throw Error("Confirm your project isolation choice.");
        notice(
          "Checking the chain and contract; creating and verifying encrypted key material…",
        );
        const r = await this.#vault.create(
          {
            name: val("name"),
            origin: val("origin"),
            chainId: val("chain"),
            rpc: val("rpc"),
            target: val("target"),
            recovery: val("recovery"),
            budget: nativeBudget(val("budget")),
          },
          val("password"),
        );
        this.#selected = r.id;
        download(
          this.#vault.backup(r.id),
          "anima-mint-wallet-" + r.id + ".json",
        );
        this.#message =
          "Wallet created; encrypted backup verified by decrypting it and matching the address. Save the download before funding.";
      } else if (form === "burner-unlock") {
        await this.#vault.unlock(this.#selected, val("password"));
        this.#message =
          "Unlocked for up to two minutes. Each transaction still needs its own review.";
      } else if (form === "burner-mint") {
        if (!container.querySelector("#burner-backup-confirmed")?.checked)
          throw Error("Confirm that you saved your backup.");
        notice("Checking code, chain, nonce, budget and simulation…");
        this.#review = await this.#vault.prepare(this.#selected, {
          method: val("method"),
          quantity: Number(val("quantity")),
          value: String(parseEther(val("value"))),
          site: val("site"),
        });
      } else if (form === "burner-inspect") {
        this.#inspection = await this.#vault.inspect(
          this.#selected,
          val("token"),
          val("standard"),
        );
      } else if (form === "burner-restore") {
        const f = container.querySelector("#burner-file")?.files?.[0];
        if (!f || f.size > 14000000)
          throw Error("Choose a backup smaller than 14 MB.");
        await this.#vault.importBackup(await f.text(), val("password"));
        this.#message =
          "Encrypted backup verified and restored. Recheck its current chain state before funding.";
      }
      notice("");
      container.innerHTML = this.render();
    } finally {
      for (const input of container.querySelectorAll("input[type=password]"))
        input.value = "";
      this.#busy = false;
    }
  }
}
