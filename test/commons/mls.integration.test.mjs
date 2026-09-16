import test from "node:test";
import assert from "node:assert/strict";
import ganache from "ganache";
import { LaunchChain } from "../../web/launchpad/chain.mjs";
import { MlsCommonsClient } from "../../web/commons/mls-client.mjs";
import { MlsVault } from "../../web/commons/mls-vault.mjs";
import { CommonsClient } from "../../web/commons/client.mjs";
import { keccak256, AbiCoder } from "../../web/vendor/ethers.min.js";
class MemoryStore {
  constructor() {
    this.records = new Map();
  }
  async read(id) {
    return structuredClone(this.records.get(id) || null);
  }
  async compareAndSet(id, version, value) {
    if ((this.records.get(id)?.version || 0) !== version)
      throw Error("Another tab advanced this conversation.");
    this.records.set(id, structuredClone(value));
  }
}
const pass = "A strong separate current state passphrase";
async function setup(t) {
  const rpc = ganache.provider({
      logging: { quiet: true },
      wallet: { totalAccounts: 4, defaultBalance: 100 },
      chain: { chainId: 31337, hardfork: "shanghai" },
    }),
    accounts = await rpc.request({ method: "eth_accounts", params: [] }),
    clients = [],
    chains = [];
  for (const account of accounts.slice(0, 3)) {
    const raw = {
        request: (args) =>
          ["eth_accounts", "eth_requestAccounts"].includes(args.method)
            ? Promise.resolve([account])
            : rpc.request(args),
      },
      chain = new LaunchChain({
        storage: null,
        receiptTimeout: 10000,
        pollInterval: 10,
      });
    await chain.connect(raw);
    chains.push(chain);
    clients.push(
      new MlsCommonsClient({
        chain,
        store: new MemoryStore(),
        confirmations: 1,
      }),
    );
  }
  t.after(async () => {
    for (const c of clients) c.lock();
    for (const c of chains) c.disconnect();
    await rpc.disconnect();
  });
  const send = async (c) => {
    await c.chain.reviewNext();
    const record = await c.chain.sendReviewed();
    assert.equal(record.status, "confirmed");
    if (c.unlocked) await c.finalize();
    return record;
  };
  await clients[0].prepareDeploy();
  const deployed = await send(clients[0]);
  for (const c of clients) {
    await c.configure(deployed.contractAddress);
    await c.unlock(pass);
    await c.newKey();
    await c.prepare("register");
    await send(c);
  }
  return { clients, chains, rpc, send };
}

test("real MLS contracts and encrypted device state: consent, ordered ratchets, manager consent/rekey, exclusion, recovery and legacy migration", async (t) => {
  const {
    clients: [a, b, c],
    send,
    rpc,
  } = await setup(t);
  await a.prepare("create");
  const id = a.vault.data.pending.id;
  await send(a);
  assert.ok(a.vault.data.groups[id]);
  assert.equal(a.vault.data.keyPackage, null);
  await a.prepare("invite", { id, recipient: b.chain.address });
  await send(a);
  assert.equal((await b.groups()).groups[0].invited, true);
  await assert.rejects(async () => {
    await c.prepare("accept", { id });
    await send(c);
  });
  await b.prepare("accept", { id });
  await send(b);
  await a.prepare("add", { id, recipient: b.chain.address });
  await send(a);
  await b.sync(id);
  assert.ok(b.vault.data.groups[id]);
  assert.equal(b.vault.data.keyPackage, null);
  await a.prepare("post", { id, text: "An unsent draft" });
  await a.cancelPending();
  await a.prepare("refresh", { id });
  await a.cancelPending();
  await a.prepare("refresh", { id });
  await send(a);
  await b.sync(id);
  const secret = "<img src=x> encrypted across actual EVM delivery";
  await a.prepare("post", { id, text: secret });
  assert.ok(
    !a.chain.plan.request.data.includes(Buffer.from(secret).toString("hex")),
  );
  assert.ok(!JSON.stringify(a.chain.records).includes(secret));
  await send(a);
  await b.sync(id);
  assert.equal(b.messages.get(id).at(-1).text, secret);
  const encrypted = await b.vault.backup();
  assert.ok(!JSON.stringify(encrypted).includes(secret));
  b.lock();
  await b.unlock(pass);
  assert.equal(b.messages.size, 0, "history off by default");
  await b.sync(id);
  assert.equal(
    b.messages.get(id).length,
    0,
    "erased older messages cannot be re-opened from current state",
  );
  await b.prepare("post", {
    id,
    text: "Bob can sign after restoring a current state.",
  });
  await send(b);
  await a.sync(id);
  assert.equal(
    a.messages.get(id).at(-1).text,
    "Bob can sign after restoring a current state.",
  );
  await a.prepare("propose-manager", { id, recipient: b.chain.address });
  await send(a);
  await assert.rejects(async () => {
    await c.prepare("accept-manager", { id });
    await send(c);
  });
  await b.prepare("accept-manager", { id });
  await send(b);
  assert.equal((await b.group(id)).needsCommit, true);
  await assert.rejects(async () => {
    await b.prepare("post", { id, text: "Must first refresh" });
    await send(b);
  });
  // Failure during a prepared send must not leave a blocking stale plan.
  if (b.vault.data.pending) await b.cancelPending();
  await b.prepare("refresh", { id });
  await send(b);
  await a.sync(id);
  assert.equal((await b.group(id)).needsCommit, false);
  await b.prepare("remove", { id, recipient: a.chain.address });
  await send(b);
  await assert.rejects(a.sync(id));
  assert.equal((await b.group(id)).roster.length, 1);
  await a.resetGroup(id);
  await a.newKey();
  await a.prepare("register");
  await send(a);
  await b.prepare("invite", { id, recipient: a.chain.address });
  await send(b);
  await a.prepare("accept", { id });
  await send(a);
  await b.prepare("add", { id, recipient: a.chain.address });
  await send(b);
  await a.sync(id);
  assert.equal(
    a.messages.get(id).length,
    0,
    "fresh identity does not recover old Welcome histories",
  );
  await a.prepare("post", {
    id,
    text: "A fresh signing and recipient identity after re-invitation.",
  });
  await send(a);
  await b.sync(id);
  assert.equal(
    b.messages.get(id).at(-1).text,
    "A fresh signing and recipient identity after re-invitation.",
  );
  // Legacy source is authenticated using its real deployed manager, with no mutation of old bytes.
  const legacy = new CommonsClient({ chain: b.chain, storage: null });
  await legacy.prepareDeploy("PrivacyKeys");
  await send(b);
  await legacy.recoverDeployments();
  await legacy.prepareDeploy("EpochGroupChat");
  await send(b);
  await legacy.recoverDeployments();
  await legacy.newIdentity();
  await legacy.prepare("register");
  await send(b);
  await legacy.prepare("create");
  await send(b);
  await b.prepare("migrate", {
    id,
    legacyChat: legacy.config.chat,
    legacyRoom: "1",
  });
  await send(b);
  const source = keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256"],
      [legacy.config.chat, 1],
    ),
  );
  assert.equal(await b.chat.migrationTarget(source), id);
  assert.equal((await legacy.group(1)).closed, false);
  await assert.rejects(async () => {
    await c.prepare("migrate", {
      id,
      legacyChat: legacy.config.chat,
      legacyRoom: "1",
    });
    await send(c);
  });
  const snapshot = await rpc.request({ method: "evm_snapshot", params: [] });
  await b.prepare("post", { id, text: "Finalized then reorganized" });
  await send(b);
  await rpc.request({ method: "evm_revert", params: [snapshot] });
  await assert.rejects(b.sync(id), /Chain history changed/);
  assert.equal(b.vault.data.groups[id].frozen, true);
});

test("encrypted vault CAS, backup boundary and lock cancellation", async () => {
  const store = new MemoryStore(),
    a = new MlsVault("31337:wallet:contract", { store }),
    b = new MlsVault("31337:wallet:contract", { store });
  await a.unlock(pass);
  a.data.groups.secret = { state: "private-ratchet-bytes" };
  await a.save(a.data);
  const backup = await a.backup();
  assert.ok(!JSON.stringify(backup).includes("private-ratchet-bytes"));
  await b.unlock(pass);
  await a.save({ ...a.data, changed: true });
  await assert.rejects(b.save(b.data), /Another tab/);
  b.lock();
  assert.equal(b.data, null);
  await b.unlock(pass);
  assert.equal(b.data.changed, true);
  const savedVersion = (await b.backup()).version;
  await assert.rejects(
    b.save({ ...b.data, oversize: "x".repeat(3 * 1024 * 1024) }),
    /recoverable device limit/,
  );
  assert.equal(b.key, null);
  await b.unlock(pass);
  assert.equal((await b.backup()).version, savedVersion);
  assert.equal(b.data.oversize, undefined);
  const wrong = new MlsVault("31337:other-wallet:contract", { store });
  await assert.rejects(wrong.unlock(pass, backup), /different wallet/);
  let release;
  const gate = new Promise((r) => (release = r)),
    late = new MlsVault("late", {
      store: {
        read: async () => {
          await gate;
          return null;
        },
        compareAndSet: async () => {
          throw Error("Must not write after lock");
        },
      },
    });
  const pending = late.unlock(pass);
  late.lock();
  release();
  await assert.rejects(pending, /cancelled/);
  assert.equal(late.key, null);
});
