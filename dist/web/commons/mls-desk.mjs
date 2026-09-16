import { MlsCommonsClient } from "./mls-client.mjs";
import { formatEther } from "../vendor/ethers.min.js";
const e = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const b = (action, label, extra = "") =>
  `<button type="button" data-mls="${action}" ${extra}>${e(label)}</button>`;
const f = (name, label, value = "", type = "text") =>
  `<label>${e(label)}<input name="${name}" type="${type}" value="${e(value)}" autocomplete="off"></label>`;
const short = (x) => (x ? `${x.slice(0, 8)}…${x.slice(-6)}` : "—");
export class MlsCommonsDesk {
  constructor({ chain, provider = () => globalThis.ethereum }) {
    this.chain = chain;
    this.provider = provider;
    this.notice = "";
    this.selected = null;
    this.list = [];
    this.next = null;
    this.busy = false;
    this.revision = 0;
    this.client = new MlsCommonsClient({ chain, onLock: () => this.clear() });
    this.walletChanged = () => {
      this.lock();
      this.client.chat = null;
      this.list = [];
      this.selected = null;
      this.paint();
    };
  }
  render() {
    return '<section class="mls-desk" data-private-surface="true"></section>';
  }
  mount(container) {
    this.root = container.querySelector(".mls-desk") || container;
    this.paint();
    if (this.raw !== this.chain.raw) {
      for (const event of ["accountsChanged", "chainChanged", "disconnect"])
        this.raw?.removeListener?.(event, this.walletChanged);
      this.raw = this.chain.raw;
      for (const event of ["accountsChanged", "chainChanged", "disconnect"])
        this.raw?.on?.(event, this.walletChanged);
    }
    return this;
  }
  clear() {
    this.revision++;
    if (this.selected) this.selected = { ...this.selected, local: null };
    for (const field of this.root?.querySelectorAll("input,textarea") || [])
      field.value = "";
    for (const message of this.root?.querySelectorAll("[data-mls-text]") || [])
      message.textContent = "";
  }
  lock() {
    this.client.lock();
    this.notice =
      "MLS keys, passphrase and displayed text are locked. Only an encrypted current state remains on this device.";
  }
  unmount() {
    this.lock();
    this.root = null;
  }
  val(name) {
    return this.root?.querySelector(`[name="${name}"]`)?.value || "";
  }
  async refresh({ sync = true } = {}) {
    if (!this.client.chat) return;
    const page = await this.client.groups();
    this.list = page.groups;
    this.next = page.next;
    if (this.selected) {
      if (sync && this.client.unlocked)
        await this.client.sync(this.selected.id);
      this.selected = await this.client.group(this.selected.id);
    }
  }
  async run(task) {
    if (this.busy) return;
    this.busy = true;
    const revision = this.revision;
    this.paintBusy();
    try {
      await task();
    } catch (error) {
      if (revision === this.revision) this.notice = error.message;
    } finally {
      this.busy = false;
      this.paint();
    }
  }
  paintBusy() {
    for (const button of this.root?.querySelectorAll("button") || [])
      if (button.dataset.mls !== "lock") button.disabled = this.busy;
  }
  paint() {
    if (!this.root) return;
    const connected = !!this.chain.address,
      c = this.client,
      u = c.unlocked,
      g = this.selected,
      data = c.vault?.data,
      pending = data?.pending,
      ours = this.chain.plan?.kind?.startsWith("commons-mls"),
      review = ours ? this.chain.review : null;
    this.root.innerHTML = `<header><span class="commons-eyebrow">RFC 9420 · FORWARD-SECURE CONVERSATIONS</span><h3>Let yesterday’s keys disappear.</h3><p>Each message advances a ratchet. Fresh member updates renew the group’s encryption. Legacy conversations remain in the other tab.</p></header>
 <p class="commons-status" role="status">${e(this.notice)}</p>
 <div class="commons-actions">${!connected ? b("connect", "Connect wallet") : ""}${c.chat ? b("refresh", "Refresh groups") : ""}${u ? b("lock", "Lock encrypted state") : ""}</div>
 <details ${c.chat ? "" : "open"}><summary>1 · Verified conversation transport</summary>${f("transport", "MLS contract address", c.address || "")}<div class="commons-actions">${b("configure", "Verify and connect", connected ? "" : "disabled")}${b("deploy", "Deploy MLS transport", connected ? "" : "disabled")}${b("recover", "Recover deployment / receipts", connected ? "" : "disabled")}</div><p>Share this contract address and group ID with recipients. The contract authenticates wallet consent and orders ciphertext; each browser verifies the MLS protocol.</p></details>
 ${c.chat ? `<details ${u ? "" : "open"}><summary>2 · Encrypted state and recovery</summary>${f("passphrase", "State passphrase · at least 16 characters", "", "password")}${b("unlock", "Unlock or create device state")}<label>Restore an encrypted current-state backup<input name="backup" type="file" accept=".json,application/json"></label>${b("restore", "Restore encrypted backup")}${u ? `${b("backup", "Download current-state backup")}<label><input type="checkbox" name="retainHistory" ${data.retainHistory ? "checked" : ""}> Keep an encrypted local transcript</label>${b("history-policy", "Save transcript preference")}<p>Default: no saved plaintext transcript and no old message/epoch keys. Keeping a transcript makes those saved messages recoverable after a device-state compromise. An older backup retains the keys it captured; delete obsolete copies after verifying a current backup. Restoring on two devices at once can fork a sender ratchet.</p>` : ""}</details>` : ""}
 ${u ? `<details><summary>3 · Fresh invitation keys</summary><div class="commons-actions">${b("new-key", "Create one-use KeyPackage")}${b("register", "Register this KeyPackage", data.keyPackage ? "" : "disabled")}${b("create", "Create new group", data.keyPackage ? "" : "disabled")}</div><p>Use a fresh registered KeyPackage for every new group or re-invitation. Its private part is erased after joining. Wallet signatures authenticate the matching public package.</p></details>` : ""}
 ${c.chat ? `<div class="commons-layout"><aside class="commons-list"><h3>Groups and invitations</h3>${this.list.map((x) => b("select", `${short(x.id)} · ${x.invited ? "Invited" : x.roster.length + " members"}`, `data-group="${e(x.id)}"`)).join("") || "<p>No groups loaded.</p>"}${this.next ? b("more", "Earlier groups") : ""}${f("groupId", "Open group ID")}${b("open", "Open group")}</aside><section class="commons-conversation">${g ? this.groupView(g, u) : "<p>Choose a group, or create a fresh one after registering an invitation key.</p>"}</section></div>` : ""}
 ${this.chain.pending() ? `<div class="commons-callout"><p>Waiting for a transaction receipt.</p><p class="commons-address">${e(this.chain.pending().hash)}</p>${b("recover", "Recover transaction")}</div>` : ""}
 ${pending ? `<div class="commons-callout"><p>Encrypted ${e(pending.kind)} prepared. Its future state is saved in the encrypted transaction journal. Resolve it before preparing another.</p>${b("recover", "Recover confirmed operation")}${b("cancel-pending", "Cancel unsent operation")}</div>` : ""}
 ${review ? `<section class="commons-review"><h3>${e(review.purpose)}</h3><p>${e(this.chain.plan.summary?.description)}</p><dl><dt>Signer</dt><dd>${e(review.account)}</dd><dt>Network</dt><dd>${e(review.chainId)}</dd><dt>Destination</dt><dd>${e(review.request.to || "New immutable contract")}</dd><dt>Maximum gas estimate</dt><dd>${e(formatEther(review.maximumGasCost))}</dd></dl>${b("sign", "Confirm in wallet")}</section>` : ""}
 <details><summary>Protection and protocol details</summary><p>RFC 9420 MLS with ts-mls 1.6.4, P-256, AES-128-GCM and SHA-256. The protocol library has not had a formal security audit. These local tests are implementation evidence, not an independent security certification.</p><p>Membership, sender, timing and approximate size stay public on chain. Members can retain or share messages. Forward secrecy depends on erasing old state; browsers cannot guarantee hardware-level memory erasure. A fresh update by the previously compromised member can heal a past state snapshot once the attacker no longer controls that device. An active compromise is not cured automatically.</p><p>Messages follow finalized chain order. A reorganization beyond the stored checkpoint freezes the local group and requires a fresh invitation rather than restoring erased keys. Selling the NFT never transfers chat state.</p></details>`;
    const messages =
      g && u ? c.messages.get(g.id) || g.local?.history || [] : [];
    for (const message of messages) {
      const host = this.root.querySelector(
        `[data-mls-text="${message.index}"]`,
      );
      if (host) host.textContent = message.text;
    }
    this.root.onclick = (event) => {
      const node = event.target.closest("[data-mls]");
      if (node && this.root.contains(node)) {
        event.preventDefault();
        event.stopPropagation();
        this.dispatch(node.dataset.mls, node.dataset);
      }
    };
    this.paintBusy();
  }
  groupView(g, u) {
    const messages = u
      ? this.client.messages.get(g.id) || g.local?.history || []
      : [];
    return `<h3>Group ${e(short(g.id))}</h3><p class="commons-address">${e(g.id)}</p><p>Epoch ${e(g.epoch)} · ${g.roster.length}/32 members · ${g.closed ? "Closed" : g.needsCommit ? "Fresh manager commit required" : "Active"}</p>${g.invited ? b("accept", "Accept invitation", u ? "" : "disabled") : ""}${g.accepted && !g.member ? "<p>Consent recorded. Ask the manager to commit your fresh invitation key.</p>" : ""}${!g.local && g.member ? b("sync", "Join from encrypted Welcome", u ? "" : "disabled") : ""}${g.local?.frozen ? "<p>State frozen after a chain-history change. Leave, ask for removal, then reset and accept a fresh invitation.</p>" : ""}${!g.member && g.local ? b("reset-group", "Reset removed membership for a fresh invitation") : ""}
 <div class="commons-history">${messages.map((x) => `<article class="commons-message"><header>${e(short(x.sender))} · #${x.index}</header><p data-mls-text="${x.index}"></p></article>`).join("") || "<p>No retained decrypted messages.</p>"}</div>
 ${u && g.member && !g.closed ? `<label>Your message<textarea name="message" maxlength="6000" autocomplete="off"></textarea></label><div class="commons-actions">${b("post", "Encrypt and review", g.needsCommit ? "disabled" : "")}${b("refresh-path", "Refresh my encryption path")}</div>` : ""}
 <details><summary>Membership and manager handover</summary>${g.roster.map((w) => `<p class="commons-address">${e(w)}${w.toLowerCase() === g.manager.toLowerCase() ? " · Manager" : ""}</p>`).join("")}${g.isManager ? `${f("recipient", "Recipient or proposed manager wallet")}<div class="commons-actions">${b("invite", "Invite")}${b("add", "Commit accepted member")}${b("remove", "Remove and rekey")}${b("revoke", "Revoke invitation")}${b("propose-manager", "Propose manager")}${b("cancel-manager", "Cancel manager proposal")}${b("close", "Close group")}</div><p>New members receive future epochs. Removed members keep what they already read. A proposed manager must consent and create a fresh update path before posting resumes.</p>` : g.member ? b("leave", "Leave group") : ""}${g.proposedManager?.toLowerCase() === this.chain.address?.toLowerCase() ? b("accept-manager", "Accept management and pause for fresh keys") : ""}</details>
 ${g.isManager ? `<details><summary>Migrate a legacy conversation</summary>${f("legacyChat", "Verified legacy EpochGroupChat address")}${f("legacyRoom", "Legacy group number", "", "number")}${b("migrate", "Authenticate migration to this group")}<p>This records the legacy manager’s chosen successor group. Invite each member with fresh MLS keys and obtain consent. Read old messages in Legacy conversations. Close the legacy group separately when its members have moved.</p></details>` : ""}`;
  }
  dispatch(action, dataset = {}) {
    if (action === "lock") {
      this.lock();
      this.paint();
      return;
    }
    const id = this.selected?.id,
      recipient = this.val("recipient"),
      text = this.val("message"),
      pass = this.val("passphrase"),
      address = this.val("transport"),
      openId = this.val("groupId"),
      legacyChat = this.val("legacyChat"),
      legacyRoom = this.val("legacyRoom"),
      file = this.root.querySelector('[name="backup"]')?.files?.[0],
      retain = this.root.querySelector('[name="retainHistory"]')?.checked;
    const operationRevision = this.revision;
    return this.run(async () => {
      if (action === "connect") {
        await this.chain.connect(await this.provider());
        this.mount(this.root);
        return;
      }
      if (action === "deploy") {
        await this.client.prepareDeploy();
        await this.chain.reviewNext();
        return;
      }
      if (action === "configure") {
        await this.client.configure(address);
        await this.refresh();
        this.notice =
          "MLS runtime verified. Unlock or create your encrypted state.";
        return;
      }
      if (action === "unlock" || action === "restore") {
        let backup;
        if (action === "restore") {
          if (!file || file.size > 8 * 1024 * 1024)
            throw Error("Select an encrypted MLS backup under 8 MiB.");
          backup = JSON.parse(await file.text());
          if (operationRevision !== this.revision || !this.root)
            throw Error(
              "Restoration cancelled because the private surface was locked.",
            );
        }
        await this.client.unlock(pass, backup);
        this.notice =
          "Encrypted current state unlocked. Refresh to load finalized messages. Only this device should operate this copy.";
        await this.refresh({ sync: false });
        return;
      }
      if (action === "new-key") {
        await this.client.newKey();
        this.notice =
          "Fresh KeyPackage encrypted on this device. Register it before accepting a new group.";
        return;
      }
      if (action === "history-policy") {
        const data = this.client.require();
        data.retainHistory = !!retain;
        if (!retain)
          for (const group of Object.values(data.groups)) group.history = [];
        await this.client.vault.save(data);
        this.notice = retain
          ? "Future displayed messages may be retained in the encrypted local transcript."
          : "Saved transcripts erased from current state. Previously exported backups retain their contents.";
        return;
      }
      if (action === "backup") {
        const backup = await this.client.vault.backup(),
          url = URL.createObjectURL(
            new Blob([JSON.stringify(backup)], { type: "application/json" }),
          ),
          a = document.createElement("a");
        a.href = url;
        a.download = "anima-mls-current-state.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        this.notice =
          "Encrypted current-state backup downloaded. Delete obsolete snapshots after verifying recovery.";
        return;
      }
      if (action === "select" || action === "open") {
        this.selected = await this.client.group(
          action === "select" ? dataset.group : openId.trim(),
        );
        await this.refresh();
        return;
      }
      if (action === "more") {
        const p = await this.client.groups({ before: this.next });
        this.list.push(...p.groups);
        this.next = p.next;
        return;
      }
      if (action === "refresh" || action === "sync") {
        await this.refresh();
        return;
      }
      if (action === "reset-group") {
        await this.client.resetGroup(id);
        this.selected = await this.client.group(id);
        this.notice =
          "Removed membership state cleared. Register a fresh KeyPackage and accept a new invitation.";
        return;
      }
      if (action === "cancel-pending") {
        await this.client.cancelPending();
        this.notice =
          "Unsent operation resolved. Any prepared application generation remains consumed.";
        return;
      }
      if (action === "sign") {
        const r = await this.chain.sendReviewed();
        if (r.contractAddress && r.kind === "commons-mls-deploy")
          await this.client.configure(r.contractAddress);
        if (this.client.unlocked) await this.client.finalize();
        if (this.client.chat) await this.refresh();
        this.notice =
          "Transaction submitted. MLS state advances after confirmation; recover again after the next block if needed.";
        return;
      }
      if (action === "recover") {
        await this.chain.recoverTransactions();
        if (!this.client.chat) {
          const r = this.chain.records.findLast(
            (r) =>
              r.kind === "commons-mls-deploy" &&
              r.status === "confirmed" &&
              Number(r.chainId) === Number(this.chain.chainId),
          );
          if (r?.contractAddress)
            await this.client.configure(r.contractAddress);
        }
        if (this.client.unlocked) await this.client.finalize();
        if (this.client.chat) await this.refresh();
        this.notice = "Receipts and ordered encrypted state refreshed.";
        return;
      }
      await this.client.prepare(
        action === "refresh-path" ? "refresh" : action,
        { id, recipient, text, legacyChat, legacyRoom },
      );
      await this.chain.reviewNext();
      this.notice = "Review the operation and confirm in your wallet.";
    });
  }
}
