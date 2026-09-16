import {
  Contract,
  ContractFactory,
  keccak256,
  getAddress,
  ZeroAddress,
} from "../vendor/ethers.min.js";
import * as m from "./mls-protocol.mjs";
import { MlsVault } from "./mls-vault.mjs";
import { MLS_ARTIFACT } from "./mls-artifacts.mjs";
import { verifyCommonsContract } from "./client.mjs";
const low = (x) => String(x).toLowerCase(),
  same = (a, b) => low(a) === low(b),
  ZERO = "0x" + "00".repeat(32);
const pack = (p) => ({
  publicPackage: m.publicPackage(p),
  privatePackage: Object.fromEntries(
    Object.entries(p.privatePackage).map(([k, v]) => [k, m.hex(v)]),
  ),
});
const unpack = (p) => ({
  publicPackage: m.decodeWire(p.publicPackage).keyPackage,
  privatePackage: Object.fromEntries(
    Object.entries(p.privatePackage).map(([k, v]) => [k, m.bytes(v)]),
  ),
});
/** MLS state never rolls backwards to handle a reorg. A changed checkpoint freezes the group and
 * requires removal/re-invitation with fresh state. Old encrypted backups retain old compromise exposure.
 */
export class MlsCommonsClient {
  constructor({ chain, store, confirmations = 2, onLock = () => {} }) {
    this.chain = chain;
    this.store = store;
    this.confirmations = confirmations;
    this.onLock = onLock;
    this.revision = 0;
    this.chat = null;
    this.vault = null;
    this.messages = new Map();
    this.binding = "";
  }
  lock() {
    this.revision++;
    this.chain.invalidate();
    this.vault?.lock();
    this.messages.clear();
    this.onLock();
  }
  get unlocked() {
    return !!this.vault?.key;
  }
  get address() {
    return this.chat?.target || null;
  }
  context() {
    return `${this.chain.chainId}:${low(this.chain.address)}:${low(this.address)}`;
  }
  async assert(revision = this.revision) {
    await this.chain.assertContext();
    if (revision !== this.revision || this.binding !== this.context())
      throw Error(
        "MLS operation cancelled because wallet, network or private state changed.",
      );
  }
  async configure(address) {
    await this.chain.assertContext();
    address = getAddress(address);
    const context = {
      provider: this.chain.provider,
      chainId: this.chain.chainId,
      wallet: this.chain.address,
      revision: this.revision,
    };
    if (
      keccak256(await this.chain.provider.getCode(address)) !==
      MLS_ARTIFACT.runtimeHash
    )
      throw Error("MLS transport runtime does not match this edition.");
    await this.chain.assertContext();
    if (
      context.provider !== this.chain.provider ||
      context.chainId !== this.chain.chainId ||
      context.wallet !== this.chain.address ||
      context.revision !== this.revision
    )
      throw Error("MLS setup cancelled because the wallet or network changed.");
    this.lock();
    this.chat = new Contract(address, MLS_ARTIFACT.abi, this.chain.provider);
    this.binding = this.context();
    this.vault = new MlsVault(this.binding, { store: this.store });
    return address;
  }
  async unlock(pass, backup) {
    await this.assert();
    this.lock();
    const revision = this.revision;
    const result = await this.vault.unlock(pass, backup);
    await this.assert(revision);
    return result;
  }
  require() {
    if (!this.unlocked) throw Error("Unlock your encrypted MLS state first.");
    return this.vault.data;
  }
  async authenticate(wallet, signature) {
    if (!/^0x[0-9a-f]{40}$/i.test(wallet)) return false;
    return this.chat.authenticatedSignature(
      getAddress(wallet),
      keccak256(signature),
    );
  }
  state(record) {
    return m.importState(record.state, (w, s) => this.authenticate(w, s));
  }
  async newKey() {
    const data = this.require(),
      revision = this.revision;
    if (data.pending)
      throw Error("Resolve the pending message or commit first.");
    const p = await m.newPackage(this.chain.address);
    await this.assert(revision);
    data.keyPackage = pack(p);
    m.wipe(p);
    await this.vault.save(data);
    return data.keyPackage;
  }
  async prepareDeploy() {
    await this.chain.assertContext();
    if (keccak256(MLS_ARTIFACT.bytecode) !== MLS_ARTIFACT.creationHash)
      throw Error("MLS deployment bytes changed.");
    return this.chain.prepareExternal({
      kind: "commons-mls-deploy",
      request: await new ContractFactory(
        MLS_ARTIFACT.abi,
        MLS_ARTIFACT.bytecode,
      ).getDeployTransaction(),
      summary: {
        purpose: "Deploy RFC 9420 conversation transport",
        description:
          "Immutable ordered ciphertext delivery with consent and manager handover. Cryptographic validity is verified by recipients.",
      },
      meta: { mlsDeploy: true },
    });
  }
  meta(group, index, epoch, kind, sender = this.chain.address) {
    return {
      chainId: this.chain.chainId,
      contract: this.address,
      group,
      index: String(index),
      epoch: String(epoch),
      kind,
      sender,
    };
  }
  async group(id) {
    await this.assert();
    const [g, roster, count, member, accepted, invite] = await Promise.all([
      this.chat.groups(id),
      this.chat.rosterOf(id),
      this.chat.packetCount(id),
      this.chat.member(id, this.chain.address),
      this.chat.accepted(id, this.chain.address),
      this.chat.invitation(id, this.chain.address),
    ]);
    if (same(g.manager, ZeroAddress)) throw Error("MLS group not found.");
    return {
      id,
      manager: g.manager,
      proposedManager: g.proposedManager,
      epoch: String(g.epoch),
      needsCommit: g.needsCommit,
      closed: g.closed,
      transcript: g.transcript,
      roster: [...roster],
      count: Number(count),
      member,
      accepted,
      invited: invite > BigInt(Math.floor(Date.now() / 1000)),
      isManager: same(g.manager, this.chain.address),
      local: this.vault?.data?.groups?.[id] || null,
    };
  }
  async groups({ before, limit = 24 } = {}) {
    const total = Number(await this.chat.groupCount()),
      end = Math.min(before ?? total, total),
      start = Math.max(0, end - limit),
      groups = [];
    for (let i = end - 1; i >= start; i--) {
      const group = await this.group(await this.chat.groupAt(i));
      if (group.member || group.invited || group.accepted || group.local)
        groups.push(group);
    }
    return { groups, next: start };
  }
  async resetGroup(id) {
    const data = this.require(),
      g = await this.group(id);
    if (g.member)
      throw Error(
        "Leave and have the manager remove this membership before resetting its ratchet.",
      );
    if (data.pending) throw Error("Resolve the pending operation first.");
    delete data.groups[id];
    this.messages.delete(id);
    await this.vault.save(data);
  }
  async prepare(action, { id, recipient, text, legacyChat, legacyRoom } = {}) {
    await this.assert();
    const revision = this.revision,
      data = this.require();
    if (data.pending)
      throw Error(
        "Recover or cancel the existing encrypted operation before preparing another.",
      );
    let request, description, pending;
    if (action === "register") {
      if (!data.keyPackage)
        throw Error("Create a fresh one-use KeyPackage first.");
      request = await this.chat.registerKey.populateTransaction(
        m.hex(
          m.decodeWire(data.keyPackage.publicPackage).keyPackage.leafNode
            .signaturePublicKey,
        ),
        data.keyPackage.publicPackage,
      );
      description =
        "Publish your wallet-authenticated MLS KeyPackage. Its private part remains encrypted on this device.";
    } else if (action === "create") {
      if (!data.keyPackage)
        throw Error("Create and register a fresh KeyPackage first.");
      const k = await this.chat.keyOf(this.chain.address);
      if (
        k.consumed ||
        !same(keccak256(k.package), keccak256(data.keyPackage.publicPackage))
      )
        throw Error("Register this unused KeyPackage before creating a group.");
      id = m.hex(crypto.getRandomValues(new Uint8Array(32)));
      const p = unpack(data.keyPackage),
        s = await m.create(id, p, (w, key) => this.authenticate(w, key));
      pending = {
        kind: "create",
        id,
        state: m.exportState(s),
        index: 0,
        transcript: await m.fingerprint(s),
      };
      m.wipe(s);
      m.wipe(p);
      request = await this.chat.create.populateTransaction(
        id,
        pending.transcript,
      );
      description =
        "Create a fresh MLS group. Previous conversation history and encryption keys are not imported.";
    } else {
      const g = await this.group(id);
      if (action === "invite") {
        request = await this.chat.invite.populateTransaction(
          id,
          getAddress(recipient),
          BigInt((await this.chain.provider.getBlock("latest")).timestamp) +
            6n * 86400n,
        );
        description =
          "The invited wallet must register a fresh KeyPackage and accept before membership can be committed.";
      } else if (action === "accept")
        request = await this.chat.accept.populateTransaction(id);
      else if (action === "revoke")
        request = await this.chat.revoke.populateTransaction(
          id,
          getAddress(recipient),
        );
      else if (action === "leave")
        request = await this.chat.leave.populateTransaction(id);
      else if (action === "close")
        request = await this.chat.close.populateTransaction(id);
      else if (action === "propose-manager") {
        request = await this.chat.proposeManager.populateTransaction(
          id,
          getAddress(recipient),
        );
        description =
          "The candidate must accept with their wallet, then publish a fresh MLS path before messaging resumes.";
      } else if (action === "accept-manager")
        request = await this.chat.acceptManager.populateTransaction(id);
      else if (action === "cancel-manager")
        request = await this.chat.cancelManager.populateTransaction(id);
      else if (action === "migrate") {
        const legacy = new Contract(
          getAddress(legacyChat),
          ["function keys() view returns(address)"],
          this.chain.provider,
        );
        const keys = await legacy.keys();
        await verifyCommonsContract(this.chain.provider, keys, "PrivacyKeys");
        await verifyCommonsContract(
          this.chain.provider,
          legacyChat,
          "EpochGroupChat",
          keys,
        );
        request = await this.chat.announceMigration.populateTransaction(
          legacyChat,
          BigInt(legacyRoom),
          id,
        );
        description =
          "Authenticate the old manager’s migration to this fresh MLS group. Members must explicitly join with fresh keys. Legacy history stays readable under its old encryption; old group closure is a separate deliberate action.";
      } else if (["post", "refresh", "add", "remove"].includes(action)) {
        await this.sync(id);
        const local = data.groups[id];
        if (!local || local.frozen)
          throw Error("Join or recover this group state before sending.");
        const current = await this.group(id);
        if (
          local.cursor !== current.count ||
          String(this.state(local).groupContext.epoch) !== current.epoch
        )
          throw Error("Wait for finalized ordered messages, then sync again.");
        const state = this.state(local),
          meta = this.meta(
            id,
            current.count,
            current.epoch,
            action === "post" ? 2 : 1,
          );
        if (action === "post") {
          if ((local.cancelled || 0) >= 16)
            throw Error(
              "Refresh your encryption path after repeated unsent drafts before posting again.",
            );
          const out = await m.send(state, text, meta);
          pending = {
            kind: "post",
            id,
            index: current.count,
            state: m.exportState(out.state),
            body: out.body,
            text,
          };
          m.wipe(out.state);
          request = await this.chat.post.populateTransaction(
            id,
            current.epoch,
            current.count,
            out.body,
          );
        } else {
          let add = [];
          if (action === "add") {
            recipient = getAddress(recipient);
            const k = await this.chat.keyOf(recipient);
            if (k.consumed || !(await this.chat.accepted(id, recipient)))
              throw Error(
                "The recipient must accept with a fresh unused KeyPackage.",
              );
            add = [{ wallet: recipient, wire: k.package }];
          }
          const out = await m.commit(state, {
            add,
            remove: action === "remove" ? [getAddress(recipient)] : [],
            meta,
          });
          const generations = [];
          for (const who of out.roster)
            generations.push((await this.chat.keyOf(who)).generation);
          pending = {
            kind: "commit",
            cancelState: out.cancelState,
            id,
            index: current.count,
            state: m.exportState(out.state),
            body: out.body,
            transcript: out.transcript,
          };
          m.wipe(out.state);
          request = await this.chat.commit.populateTransaction(
            id,
            current.epoch,
            current.count,
            out.roster,
            generations,
            out.body,
            out.welcome,
            out.transcript,
          );
        }
        description =
          action === "post"
            ? "Encrypt with a fresh MLS application generation. Old receiving keys are not retained."
            : action === "refresh"
              ? "Commit a fresh MLS update path. This refresh is part of recovery after a past state compromise."
              : "Commit the exact changed membership and a new encryption epoch.";
      } else throw Error("Unknown MLS action.");
    }
    await this.assert(revision);
    if (pending) {
      if (pending.kind === "post")
        data.groups[pending.id].state = pending.state;
      if (pending.kind === "commit")
        data.groups[pending.id].state = pending.cancelState;
      data.pending = pending;
      await this.vault.save(data);
    }
    try {
      return await this.chain.prepareExternal({
        kind: "commons-mls-action",
        request,
        meta: {
          mlsAction: action,
          group: id,
          payloadHash: pending?.body ? keccak256(pending.body) : undefined,
        },
        summary: {
          purpose: `MLS · ${action.replaceAll("-", " ")}`,
          description,
          group: id,
          recipient,
        },
      });
    } catch (e) {
      if (pending) {
        if (pending.kind === "post") {
          data.groups[pending.id].state = pending.state;
          data.groups[pending.id].cancelled =
            (data.groups[pending.id].cancelled || 0) + 1;
        }
        if (pending.kind === "commit")
          data.groups[pending.id].state = pending.cancelState;
        data.pending = null;
        await this.vault.save(data);
      }
      throw e;
    }
  }
  async finalize() {
    const data = this.require(),
      p = data.pending,
      revision = this.revision;
    if (!p) return false;
    await this.assert();
    let confirmed = false;
    const events = await this.chat.queryFilter(
      p.kind === "create"
        ? this.chat.filters.GroupCreated(p.id)
        : this.chat.filters.Delivered(p.id, p.index),
    );
    const event = events.at(-1);
    if (
      !event ||
      Number(await this.chain.provider.getBlockNumber()) -
        event.blockNumber +
        1 <
        this.confirmations
    )
      return false;
    const checkpoint = { number: event.blockNumber, hash: event.blockHash };
    if (p.kind === "create") {
      const g = await this.chat.groups(p.id);
      await this.assert(revision);
      confirmed =
        same(g.manager, this.chain.address) && g.transcript === p.transcript;
      if (confirmed)
        data.groups[p.id] = {
          state: p.state,
          cursor: 0,
          checkpoint,
          history: [],
        };
    } else {
      if (Number(await this.chat.packetCount(p.id)) <= p.index) return false;
      const packet = await this.chat.packetOf(p.id, p.index);
      await this.assert(revision);
      if (
        !same(packet.sender, this.chain.address) ||
        keccak256(packet.body) !== keccak256(p.body)
      )
        return false;
      confirmed = true;
      const local = data.groups[p.id];
      local.state = p.state;
      local.cursor = p.index + 1;
      local.checkpoint = checkpoint;
      if (p.kind === "commit") local.cancelled = 0;
      if (p.text) {
        const list = this.messages.get(p.id) || [];
        list.push({ index: p.index, sender: this.chain.address, text: p.text });
        this.messages.set(p.id, list);
        if (data.retainHistory) local.history = list;
      }
    }
    if (confirmed) {
      if (p.kind === "create") data.keyPackage = null;
      data.pending = null;
      await this.vault.save(data);
    }
    return confirmed;
  }
  verifyCredentials(state, packet) {
    for (let i = 0; i < packet.roster.length; i++) {
      const address = low(packet.roster[i]),
        leaf = state.ratchetTree.find(
          (n) =>
            n?.nodeType === "leaf" &&
            new TextDecoder()
              .decode(n.leaf.credential.identity)
              .toLowerCase() === address,
        )?.leaf;
      if (!leaf || keccak256(leaf.signaturePublicKey) !== packet.credentials[i])
        throw Error(
          "MLS member signature does not match the wallet-authorized KeyPackage at admission.",
        );
    }
  }
  async cancelPending() {
    const data = this.require();
    if (!data.pending) return;
    const p = data.pending;
    if (this.chain.pending())
      throw Error(
        "Recover the submitted transaction before cancelling its encrypted state.",
      );
    if (await this.finalize()) return;
    if (
      p.kind !== "create" &&
      Number(await this.chat.packetCount(p.id)) > p.index
    ) {
      const packet = await this.chat.packetOf(p.id, p.index);
      if (keccak256(packet.body) === keccak256(p.body))
        throw Error("This ciphertext is already on chain. Recover it.");
    }
    if (p.kind === "post") {
      data.groups[p.id].state = p.state;
      data.groups[p.id].cancelled = (data.groups[p.id].cancelled || 0) + 1;
    }
    if (p.kind === "commit") data.groups[p.id].state = p.cancelState;
    data.pending = null;
    await this.vault.save(data);
    this.chain.invalidate();
  }
  async sync(id) {
    const data = this.require(),
      revision = this.revision;
    if (data.pending?.id === id) {
      await this.finalize();
      if (data.pending) return;
    }
    let local = data.groups[id];
    if (local?.frozen)
      throw Error(
        "This state is frozen. Leave, have the manager remove you, then reset and accept a fresh invitation.",
      );
    const latest = await this.chain.provider.getBlockNumber(),
      safe = latest - Math.max(0, this.confirmations - 1);
    if (safe < 0) return;
    if (local?.checkpoint) {
      const b = await this.chain.provider.send("eth_getBlockByNumber", [
        "0x" + local.checkpoint.number.toString(16),
        false,
      ]);
      if (!b || b.hash !== local.checkpoint.hash) {
        local.frozen = true;
        await this.vault.save(data);
        throw Error(
          "Chain history changed after this MLS state advanced. Fresh removal and re-invitation are required; erased keys are never rolled back.",
        );
      }
    }
    const count = Number(await this.chat.packetCount(id, { blockTag: safe }));
    let cursor = local?.cursor || 0,
      state = local ? this.state(local) : null,
      history = this.messages.get(id) || local?.history || [];
    for (; cursor < count; cursor++) {
      const packet = await this.chat.packetOf(id, cursor, { blockTag: safe });
      if (!state) {
        if (
          packet.kind !== 1n ||
          !packet.roster.some((w) => same(w, this.chain.address)) ||
          !data.keyPackage
        )
          continue;
        const p = unpack(data.keyPackage);
        try {
          try {
            state = await m.join(packet.welcome, p, id, (w, s) =>
              this.authenticate(w, s),
            );
          } catch (error) {
            continue;
          }
          if (
            (await m.fingerprint(state)) !== packet.transcript ||
            JSON.stringify(m.roster(state)) !==
              JSON.stringify([...packet.roster].map(low).sort())
          )
            throw Error("Welcome transcript or membership mismatch.");
          this.verifyCredentials(state, packet);
          data.keyPackage = null;
        } finally {
          m.wipe(p);
        }
      } else {
        const result = await m.receive(
          state,
          packet.body,
          this.meta(
            id,
            cursor,
            packet.epoch,
            Number(packet.kind),
            packet.sender,
          ),
          [...packet.roster],
        );
        state = result.state;
        if (Number(packet.kind) === 1) this.verifyCredentials(state, packet);
        if (
          Number(packet.kind) === 1 &&
          (await m.fingerprint(state)) !== packet.transcript
        )
          throw Error("MLS transcript differs from transport commitment.");
        if (result.text !== undefined)
          history.push({
            index: cursor,
            sender: packet.sender,
            text: result.text,
          });
      }
      await this.assert(revision);
      const block = await this.chain.provider.getBlock(safe);
      await this.assert(revision);
      local = {
        state: m.exportState(state),
        cursor: cursor + 1,
        checkpoint: { number: safe, hash: block.hash },
        history: data.retainHistory ? history : [],
      };
      data.groups[id] = local;
      await this.vault.save(data);
    }
    if (!state && count > 0)
      throw Error(
        "No finalized Welcome opens with this KeyPackage. Wait for the manager’s commit or restore its matching state backup.",
      );
    if (state) m.wipe(state);
    await this.assert(revision);
    this.messages.set(id, history);
    return { local, history };
  }
}
