import { MlsCommonsDesk } from "./mls-desk.mjs";
import { CommonsClient } from "./client.mjs";
import { formatEther } from "../vendor/ethers.min.js";

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const short = (address) =>
  address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—";
const button = (action, label, extra = "") =>
  `<button type="button" data-commons-action="${action}" ${extra}>${escape(label)}</button>`;
const input = (name, label, value = "", type = "text", extra = "") =>
  `<label>${escape(label)}<input name="${name}" type="${type}" value="${escape(value)}" autocomplete="off" ${extra}></label>`;

/** Mount this beside public Commons. Its entire subtree is excluded from formation effects.
 * Use the shared LaunchChain. Call lock() on global privacy lock and unmount() on navigation.
 */
export class CommonsDesk {
  constructor({
    chain,
    provider = () => globalThis.ethereum,
    onChange = () => {},
  } = {}) {
    this.chain = chain;
    this.provider = provider;
    this.onChange = onChange;
    this.tab = "secure";
    this.notice = "";
    this.groups = [];
    this.nextGroup = null;
    this.selected = null;
    this.history = [];
    this.nextMessage = 0;
    this.members = [];
    this.busy = false;
    this.viewRevision = 0;
    this.inputRevision = 0;
    this.mls = new MlsCommonsDesk({ chain, provider });
    this.client = new CommonsClient({
      chain,
      onLock: () => this.clearSecrets(),
    });
  }
  render() {
    return '<section class="commons-desk" data-private-surface="true" aria-label="Encrypted conversations"></section>';
  }
  mount(container) {
    this.root = container.matches?.(".commons-desk")
      ? container
      : container.querySelector(".commons-desk");
    if (!this.root) throw Error("Conversation surface is missing.");
    this.paint();
    if (this.chain.address)
      this.run(async () => {
        await this.client.recoverDeployments();
        if (this.client.configured) await this.refresh();
      });
    return this;
  }
  unmount() {
    this.mls.unmount();
    this.viewRevision++;
    this.client.lock();
    this.root?.replaceChildren();
    this.root = null;
  }
  lock() {
    this.client.lock();
    this.notice =
      "Encryption keys, messages, passphrases and pending private reviews cleared.";
    this.paint();
  }
  clearSecrets() {
    this.mls?.lock();
    this.history = [];
    this.nextMessage = 0;
    this.inputRevision++;
    for (const element of this.root?.querySelectorAll("input,textarea") || [])
      element.value = "";
    for (const element of this.root?.querySelectorAll(
      "[data-private-message]",
    ) || [])
      element.textContent = "";
  }
  value(name) {
    return this.root?.querySelector(`[name="${name}"]`)?.value || "";
  }
  async run(job) {
    if (this.busy) return;
    this.busy = true;
    const revision = this.viewRevision;
    this.setBusy();
    try {
      await job();
      if (revision !== this.viewRevision) return;
    } catch (error) {
      if (revision === this.viewRevision)
        this.notice = error.message || "This operation could not be completed.";
    } finally {
      this.busy = false;
      if (revision === this.viewRevision) this.paint();
      this.onChange(this.state());
    }
  }
  state() {
    return {
      connected: !!this.chain.address,
      configured: this.client.configured,
      unlocked: this.client.unlocked,
      chainId: this.chain.chainId ? String(this.chain.chainId) : null,
      keys: this.client.config.keys || null,
      chat: this.client.config.chat || null,
      mls: {
        configured: !!this.mls.client.chat,
        unlocked: this.mls.client.unlocked,
        transport: this.mls.client.address,
      },
    };
  }
  setBusy() {
    if (this.busy)
      for (const b of this.root?.querySelectorAll("button") || [])
        if (b.dataset.commonsAction !== "lock") b.disabled = true;
  }
  async refresh({ more = false } = {}) {
    if (!this.client.configured) return;
    const page = await this.client.groups({
      before: more ? this.nextGroup : undefined,
    });
    this.groups = more
      ? [
          ...new Map(
            [...this.groups, ...page.groups].map((g) => [g.id, g]),
          ).values(),
        ]
      : page.groups;
    this.nextGroup = page.next;
    if (this.selected) {
      this.selected = await this.client.group(this.selected.id);
      this.members = await this.client.members(this.selected.id);
      this.selected.dirty = await this.client.rotationRequired(
        this.selected.id,
        this.members,
      );
      if (this.client.unlocked) {
        const page = await this.client.history(this.selected.id);
        this.history = page.messages;
        this.nextMessage = page.next;
      } else this.history = [];
    }
  }
  async review(action, options = {}) {
    const revision = this.inputRevision;
    await this.client.prepare(action, options);
    if (revision !== this.inputRevision) {
      this.chain.invalidate();
      throw Error("The conversation input changed. Prepare the action again.");
    }
    await this.chain.reviewNext();
    this.notice = "Review the transaction below, then confirm in your wallet.";
  }
  paint() {
    if (!this.root) return;
    const connected = !!this.chain.address,
      configured = this.client.configured,
      unlocked = this.client.unlocked,
      config = { ...this.client.deployment(), ...this.client.config },
      review = this.chain.review,
      plan = this.chain.plan;
    const ours =
      plan?.kind?.startsWith("commons-") &&
      !plan.kind.startsWith("commons-mls");
    this.root.innerHTML = `<header class="commons-heading"><div><span class="commons-eyebrow">COMMONS · ENCRYPTED CONVERSATIONS</span><h2>Words for your circle.</h2><p>Messages are encrypted before your wallet sees the transaction.</p></div>${connected ? `<span class="commons-connection">${escape(short(this.chain.address))} · Chain ${escape(this.chain.chainId)}</span>` : button("connect", "Connect wallet")}</header>
  <p class="commons-boundary">Message contents are encrypted. Wallet addresses, membership, sender, timing and approximate size remain public. Encryption keys belong to your wallet; selling an NFT does not transfer your private history.</p>
  ${this.chain.execution?.mode === "nft" ? `<div class="commons-callout"><p>Your launchpad currently uses NFT funding. Conversations use your signing wallet and its separate encryption identity.</p>${button("wallet-mode", "Use signing wallet for conversations")}</div>` : ""}
  <nav class="commons-tabs" aria-label="Conversation tools">${[
    ["secure", "Forward-secure conversations"],
    ["groups", "Legacy conversations"],
    ["keys", "Legacy encryption keys"],
    ["setup", "Legacy setup"],
  ]
    .map(([tab, label]) =>
      button(
        "tab",
        label,
        `data-tab="${tab}" aria-pressed="${this.tab === tab}"`,
      ),
    )
    .join("")}${button("lock", "Lock")}</nav>
  <p class="commons-status" role="status">${escape(this.notice || (this.tab === "secure" ? "Open a forward-secure group below, or use the legacy tabs for existing conversations." : configured ? (unlocked ? "Encryption identity is unlocked on this device." : "Restore your encryption key to read conversations.") : connected ? "Connect verified conversation contracts in Setup, or deploy them with your wallet." : "Connect your wallet to discover its conversations."))}</p>
  ${this.tab === "secure" ? this.mls.render() : this.tab === "groups" ? this.groupsView(configured, unlocked) : this.tab === "keys" ? this.keysView(configured, unlocked) : this.setupView(config, connected)}
  ${ours && review ? `<section class="commons-review"><span class="commons-eyebrow">WALLET REVIEW</span><h3>${escape(review.purpose)}</h3><p>${escape(plan.summary?.description || "Deploy the source-verified communication contract with this wallet.")}</p><dl><dt>Signer</dt><dd>${escape(review.account)}</dd><dt>Network</dt><dd>${escape(review.chainId)}</dd><dt>Destination</dt><dd>${escape(review.request.to || plan.meta.predictedAddress)}</dd><dt>Maximum gas estimate</dt><dd>${escape(formatEther(review.maximumGasCost))} native currency</dd></dl>${button("sign", "Confirm in wallet")}${button("cancel", "Cancel review")}</section>` : ""}
  ${this.tab !== "secure" && this.chain.pending() ? `<section class="commons-review"><h3>Waiting for confirmation</h3><p class="commons-address">${escape(this.chain.pending().hash)}</p>${button("recover", "Recover receipt")}</section>` : ""}
  ${this.recentTransactions()}`;
    this.root.onclick = (event) => {
      const target = event.target.closest("[data-commons-action]");
      if (target && this.root.contains(target)) {
        event.preventDefault();
        this.dispatch(target.dataset);
      }
    };
    if (this.tab === "secure") this.mls.mount(this.root);
    this.root.oninput = () => {
      this.inputRevision++;
      if (this.chain.plan?.kind?.startsWith("commons-")) {
        this.chain.invalidate();
        this.root.querySelector(".commons-review")?.remove();
      }
    };
    for (const message of this.history) {
      const host = this.root.querySelector(
        `[data-message-id="${message.index}"] [data-private-message]`,
      );
      if (host)
        host.textContent = message.readable ? message.text : message.reason;
    }
    this.setBusy();
  }
  groupsView(configured, unlocked) {
    if (!configured)
      return (
        '<section class="commons-empty"><h3>Your conversations, recovered from the chain.</h3><p>Setup needs an encryption-key registry and a conversation contract. No memory-handover contract is required.</p>' +
        button("tab", "Open setup", 'data-tab="setup"') +
        "</section>"
      );
    const invitations = this.groups.filter((g) => g.invited),
      groups = this.groups.filter((g) => g.member || g.isManager),
      selected = this.selected;
    return `<div class="commons-layout"><aside class="commons-list"><div class="commons-actions">${button("refresh", "Refresh")}${button("create", "New group", unlocked ? "" : "disabled")}</div><h3>Invitations${invitations.length ? ` · ${invitations.length}` : ""}</h3>${invitations.length ? invitations.map((g) => `<article><strong>Group ${escape(g.id)}</strong><span>From ${escape(short(g.manager))}</span>${button("select", "View invitation", `data-room="${g.id}"`)}</article>`).join("") : "<p>No active invitations in the groups scanned.</p>"}<h3>Your groups</h3>${groups.map((g) => `<button type="button" class="commons-group" data-commons-action="select" data-room="${g.id}" aria-pressed="${selected?.id === g.id}"><strong>Group ${g.id}</strong><span>${g.members} members · ${g.closed ? "Closed" : g.dirty ? "Key rotation needed" : `Epoch ${g.epoch}`}</span></button>`).join("") || "<p>No joined groups in this page.</p>"}${this.nextGroup && this.nextGroup !== "0" ? button("more-groups", "Scan earlier groups") : ""}<details><summary>Open a group by number</summary>${input("groupNumber", "Group number", "", "number", 'min="1"')}${button("open", "Open group")}</details></aside>
   <section class="commons-conversation">${selected ? this.conversationView(selected, unlocked) : '<div class="commons-empty"><h3>A quiet place for your circle.</h3><p>Select a conversation, accept an invitation, or create a group. Group names and messages can be shared inside encrypted conversation content.</p></div>'}</section></div>`;
  }
  conversationView(g, unlocked) {
    return `<header class="commons-conversation-heading"><div><h3>Group ${g.id}</h3><p>${g.members}/32 members · ${g.closed ? "Closed" : g.dirty ? "Waiting for key rotation" : `Epoch ${g.epoch}`} · ${g.messageCount} messages</p></div>${g.isManager ? '<span class="commons-chip">You manage this group</span>' : ""}</header>
   ${g.invited ? `<div class="commons-callout"><p>${escape(short(g.manager))} invited you. Accepting makes your membership public. The manager must rotate keys before you receive future messages.</p>${button("join", "Accept invitation", `data-room="${g.id}" ${unlocked ? "" : "disabled"}`)}</div>` : ""}
   ${g.dirty && !g.closed ? `<div class="commons-callout"><p>Membership or a registered encryption key changed. Messages pause until the manager encrypts a fresh epoch key for every accepted member.</p>${g.isManager ? button("rotate", "Rotate group keys", `data-room="${g.id}" ${unlocked ? "" : "disabled"}`) : ""}</div>` : ""}
   ${!unlocked ? `<div class="commons-callout"><p>Restore your encryption identity to read available message history.</p>${button("tab", "Open encryption keys", 'data-tab="keys"')}</div>` : ""}
   ${this.nextMessage > 0 ? button("more-messages", "Load earlier messages") : ""}
   <div class="commons-history" aria-label="Conversation history">${this.history.map((m) => `<article class="commons-message ${m.readable ? "" : "commons-unavailable"}" data-message-id="${m.index}"><header><strong>${escape(short(m.sender))}</strong><span>#${m.index} · Epoch ${escape(m.epoch)}</span></header><p data-private-message="true"></p></article>`).join("") || '<p class="commons-empty">No decrypted messages are displayed.</p>'}</div>
   ${g.member && !g.closed ? `<label class="commons-compose">Your message<textarea name="message" autocomplete="off" placeholder="Write to this circle…" maxlength="6000" ${unlocked && !g.dirty ? "" : "disabled"}></textarea></label><div class="commons-actions">${button("post", "Encrypt and review", `data-room="${g.id}" ${unlocked && !g.dirty ? "" : "disabled"}`)}<small>Maximum 6,000 UTF-8 bytes. Only ciphertext is submitted.</small></div>` : ""}
   <details class="commons-members"><summary>Members and group settings</summary><p>Existing recipients may keep old messages. This protocol does not provide forward secrecy. Save encrypted backups before replacing keys.</p>${this.members.map((who) => `<div class="commons-member"><span class="commons-address">${escape(who)}${who.toLowerCase() === g.manager.toLowerCase() ? " · Manager" : ""}</span>${g.isManager && !g.closed && who.toLowerCase() !== g.manager.toLowerCase() ? button("remove", "Remove", `data-room="${g.id}" data-recipient="${escape(who)}"`) : ""}</div>`).join("")}
   ${g.isManager && !g.closed ? `${input("recipient", "Wallet address to invite or revoke")}${button("invite", "Invite wallet", `data-room="${g.id}"`)}${button("revoke", "Revoke invitation", `data-room="${g.id}"`)}${!g.dirty ? button("rotate", "Rotate encryption epoch", `data-room="${g.id}" ${unlocked ? "" : "disabled"}`) : ""}<details><summary>Close this group</summary><p>Closing permanently stops new invitations and messages. Existing history remains.</p>${button("close", "Review permanent closure", `data-room="${g.id}"`)}</details>` : g.member && !g.closed ? button("leave", "Leave group", `data-room="${g.id}"`) : ""}</details>`;
  }
  keysView(configured, unlocked) {
    return `<section class="commons-key-panel"><h3>Your encryption identity</h3><p>Your wallet signs transactions. A separate encryption key reads your messages. The key stays in memory until you lock or leave this screen; keep an encrypted backup to recover it.</p>${!configured ? "<p>Complete Setup before creating or restoring an identity.</p>" : `${unlocked ? `<p class="commons-address">Public encryption key: ${escape(this.client.publicKey)}</p>` : ""}<div class="commons-actions">${button("identity", "Create new identity")}${button("identity-status", "Check registered key")}</div>${input("passphrase", "Backup passphrase · at least 16 characters", "", "password", 'minlength="16" data-secret="true"')}<div class="commons-actions">${button("backup", "Download encrypted backup", unlocked ? "" : "disabled")}${button("register", "Review public-key registration", unlocked ? "" : "disabled")}</div><label>Restore an encrypted identity backup<input name="backupFile" type="file" accept="application/json,.json" autocomplete="off" data-secret="true"></label>${button("restore", "Restore identity")}<p>Replacing a registered key pauses existing epochs until each manager rotates keys. Old encrypted backups may still be needed for earlier history. Backups are passphrase-encrypted; the passphrase is never sent to the chain.</p>`}</section>`;
  }
  setupView(config, connected) {
    return `<section class="commons-setup"><h3>Connect your conversations</h3><p>Reuse the same verified addresses with friends. These two contracts are enough for encrypted chat.</p>${input("keysAddress", "Encryption-key registry", config.keys || "")}${input("chatAddress", "Conversation contract", config.chat || "")}${input("deploymentBlock", "Deployment block · optional, helps membership recovery", config.fromBlock ?? 0, "number", 'min="0"')}<div class="commons-actions">${button("configure", "Verify and connect", connected ? "" : "disabled")}${button("recover", "Recover confirmed setup", connected ? "" : "disabled")}</div><details><summary>Deploy conversation contracts with your wallet</summary><p>Deploy the key registry first, then the conversation contract. Each operation shows its network, destination and gas before requesting your signature.</p><div class="commons-actions">${button("deploy-keys", "Deploy key registry", connected && !this.client.config.keys ? "" : "disabled")}${button("deploy-chat", "Deploy conversation contract", connected && this.client.config.keys && !this.client.config.chat ? "" : "disabled")}</div></details><p>No conversation text or private encryption key is stored in browser preferences. Contract addresses and transaction receipts are public.</p></section>`;
  }
  recentTransactions() {
    const records = this.chain.records
      .filter(
        (r) =>
          r.kind?.startsWith("commons-") &&
          Number(r.chainId) === Number(this.chain.chainId) &&
          r.account?.toLowerCase() === this.chain.address?.toLowerCase(),
      )
      .slice(-5)
      .reverse();
    return records.length
      ? `<details class="commons-receipts"><summary>Conversation transactions</summary>${records.map((r) => `<p><strong>${escape(r.purpose)}</strong> · ${escape(r.status)}<br><span class="commons-address">${escape(r.hash)}</span></p>`).join("")}${button("recover", "Refresh receipts")}</details>`
      : "";
  }
  dispatch(data) {
    const action = data.commonsAction;
    if (action === "lock") {
      this.lock();
      return;
    }
    if (this.busy) return;
    if (action === "tab") {
      if (this.tab === "secure" && data.tab !== "secure") this.mls.unmount();
      this.tab = data.tab;
      this.paint();
      return;
    }
    if (action === "cancel") {
      this.chain.invalidate();
      this.paint();
      return;
    }
    const room = data.room || this.selected?.id;
    return this.run(async () => {
      if (action === "wallet-mode") {
        this.chain.useWallet();
        this.notice =
          "Conversation transactions now use your signing wallet. Your NFT assets remain in its account.";
        return;
      }
      if (action === "connect") {
        await this.chain.connect(await this.provider());
        await this.client.recoverDeployments();
        this.notice = "Wallet connected. Encryption identity remains separate.";
        if (this.client.configured) await this.refresh();
        return;
      }
      if (action === "configure") {
        await this.client.configure({
          keys: this.value("keysAddress").trim(),
          chat: this.value("chatAddress").trim() || undefined,
          fromBlock: this.value("deploymentBlock") || 0,
        });
        this.notice = this.client.configured
          ? "Both contracts verified. Open Encryption keys to create or restore your identity."
          : "Key registry verified. Deploy or enter the conversation contract next.";
        if (this.client.configured) await this.refresh();
        return;
      }
      if (action === "deploy-keys" || action === "deploy-chat") {
        await this.client.prepareDeploy(
          action === "deploy-keys" ? "PrivacyKeys" : "EpochGroupChat",
        );
        await this.chain.reviewNext();
        this.notice = "Review this contract deployment before signing.";
        return;
      }
      if (action === "sign") {
        const record = await this.chain.sendReviewed();
        if (record.status === "confirmed") {
          await this.client.recoverDeployments();
          this.notice = "Transaction confirmed on chain.";
          if (record.meta?.commonsAction === "create") {
            const p = this.client.requireChat(),
              event = record.receipt.logs
                .map((log) => {
                  try {
                    return log.address.toLowerCase() ===
                      this.client.config.chat.toLowerCase()
                      ? p.chat.interface.parseLog(log)
                      : null;
                  } catch {
                    return null;
                  }
                })
                .find((event) => event?.name === "RoomCreated");
            if (event)
              this.selected = await this.client.group(event.args.roomId);
          }
          if (this.client.configured) await this.refresh();
        } else
          this.notice =
            "Transaction submitted. Recover its receipt before sending another.";
        return;
      }
      if (action === "recover") {
        await this.chain.recoverTransactions();
        await this.client.recoverDeployments();
        if (this.client.configured) await this.refresh();
        this.notice =
          "Transaction receipts and verified configuration refreshed.";
        return;
      }
      if (action === "identity") {
        await this.client.newIdentity();
        this.notice =
          "New encryption key created in memory. Download its encrypted backup before registering.";
        return;
      }
      if (action === "backup") {
        const backup = await this.client.backup(this.value("passphrase")),
          url = URL.createObjectURL(
            new Blob([JSON.stringify(backup)], { type: "application/json" }),
          ),
          link = document.createElement("a");
        link.href = url;
        link.download = "anima-encrypted-identity.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        this.notice =
          "Encrypted backup downloaded. Keep its passphrase separately.";
        return;
      }
      if (action === "restore") {
        const file = this.root.querySelector('[name="backupFile"]').files[0],
          passphrase = this.value("passphrase"),
          revision = this.inputRevision;
        if (!file || file.size > 16384)
          throw Error(
            "Select an encrypted identity backup smaller than 16 KiB.",
          );
        const encoded = await file.text();
        if (revision !== this.inputRevision || !this.root)
          throw Error(
            "Identity restoration cancelled because the private surface was locked or changed.",
          );
        await this.client.restore(JSON.parse(encoded), passphrase);
        this.notice =
          "Identity restored in memory. It may open historical epochs even if you registered a newer key.";
        if (this.selected) await this.refresh();
        return;
      }
      if (action === "identity-status") {
        const status = await this.client.identityStatus();
        this.notice =
          status.generation === "0"
            ? "No encryption key is registered for this wallet."
            : status.matches
              ? `Unlocked identity matches registered generation ${status.generation}.`
              : "The loaded identity differs from the registered key. It can still read historical epochs addressed to it; restore the current key before posting.";
        return;
      }
      if (action === "refresh" || action === "more-groups") {
        await this.refresh({ more: action === "more-groups" });
        this.notice =
          this.nextGroup === "0"
            ? "Group scan complete."
            : "Loaded this page of groups. Scan earlier groups to continue discovery.";
        return;
      }
      if (action === "select" || action === "open") {
        this.selected = await this.client.group(
          action === "open" ? this.value("groupNumber") : room,
        );
        await this.refresh();
        return;
      }
      if (action === "more-messages") {
        const page = await this.client.history(this.selected.id, {
          before: this.nextMessage,
        });
        this.history = [...page.messages, ...this.history];
        this.nextMessage = page.next;
        return;
      }
      await this.review(action, {
        room: action === "create" || action === "register" ? undefined : room,
        recipient:
          data.recipient || this.value("recipient").trim() || undefined,
        text: action === "post" ? this.value("message") : undefined,
      });
    });
  }
}
