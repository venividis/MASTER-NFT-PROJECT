import test from "node:test";
import assert from "node:assert/strict";
import { keccak256 } from "../../web/vendor/ethers.min.js";
import { PrivateVault } from "../../web/privacy/vault.mjs";
import {
  inspectSubmission,
  persistSubmission,
  releaseUnsubmitted,
} from "../../web/privacy/submission.mjs";
import { V4Desk } from "../../web/v4/desk.mjs";

const hash = "0x" + "12".repeat(32),
  relay = "0x" + "34".repeat(20),
  data = "0x1234";
const pending = {
  id: "proof-id",
  kind: "launch",
  chainId: 1,
  relay,
  requestHash: keccak256(data),
  state: "reserved",
};
const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
};
const locks = () => {
  let tail = Promise.resolve();
  return {
    request: (_, fn) => {
      const next = tail.then(fn);
      tail = next.catch(() => {});
      return next;
    },
  };
};
test("a verified pre-broadcast rejection releases only its exact unsent reservation", async () => {
  const store = storage(), vault = new PrivateVault(store), password = "A separate private recovery password";
  await vault.create({mnemonic: "test fixture", settings: {}, drafts: [], note: "keep me", pending}, password);
  const result = {...pending, state: "not-submitted", broadcastAttempted: false};
  await assert.rejects(releaseUnsubmitted(vault, {...result, broadcastAttempted: true}), /pre-broadcast/);
  await assert.rejects(releaseUnsubmitted(vault, {...result, requestHash: keccak256("0xabcd")}), /exact reserved/);
  assert.ok(vault.data.pending);
  await releaseUnsubmitted(vault, result);
  assert.equal(vault.data.pending, undefined);
  assert.equal(vault.data.note, "keep me");
  await vault.reserveSubmission(pending);
  await persistSubmission(vault, {...pending, hash});
  await assert.rejects(releaseUnsubmitted(vault, result), /exact reserved/);
  assert.equal(vault.data.pending.hash, hash);
});
function provider({
  confirmations = 2,
  status = 1,
  logs = [],
  transaction = { to: relay, data, value: 0n },
  receipt = true,
} = {}) {
  return {
    getNetwork: async () => ({ chainId: 1n }),
    getTransaction: async () => transaction,
    getTransactionReceipt: async () =>
      receipt
        ? {
            status,
            logs,
            blockNumber: 42,
            confirmations: async () => confirmations,
          }
        : null,
  };
}
test("recovery requires the exact reviewed relay transaction, matching chain and two confirmations", async () => {
  assert.equal(
    (await inspectSubmission(provider(), { ...pending, hash })).state,
    "confirmed",
  );
  assert.equal(
    (
      await inspectSubmission(provider({ receipt: false }), {
        ...pending,
        hash,
      })
    ).state,
    "pending",
  );
  assert.equal(
    (
      await inspectSubmission(provider({ transaction: null }), {
        ...pending,
        hash,
      })
    ).state,
    "pending",
  );
  assert.equal(
    (
      await inspectSubmission(provider({ confirmations: 1 }), {
        ...pending,
        hash,
      })
    ).state,
    "confirming",
  );
  assert.equal(
    (await inspectSubmission(provider({ status: 0 }), { ...pending, hash }))
      .state,
    "reverted",
  );
  assert.equal(
    (await inspectSubmission(provider(), { ...pending, hash }, () => true))
      .state,
    "application-reverted",
  );
  await assert.rejects(
    inspectSubmission(
      provider({ transaction: { to: relay, data: "0xabcd" } }),
      { ...pending, hash },
    ),
    /does not match/,
  );
  await assert.rejects(
    inspectSubmission(
      { ...provider(), getNetwork: async () => ({ chainId: 137n }) },
      { ...pending, hash },
    ),
    /network does not match/,
  );
  await assert.rejects(
    inspectSubmission(provider(), { kind: "launch", created: 1, hash }),
    /no verifiable/,
  );
});
test("broadcaster hash persists inside encryption and remains recoverable after lock and restart", async () => {
  const store = storage(),
    vault = new PrivateVault(store),
    password = "A separate private recovery password";
  await vault.create(
    { mnemonic: "test fixture", settings: {}, drafts: [], pending },
    password,
  );
  await persistSubmission(vault, { ...pending, type: "submission", hash });
  assert(!vault.exportBackup().includes(hash));
  assert(!vault.exportBackup().includes(relay));
  vault.lock();
  assert.equal(vault.data, null);
  const restored = new PrivateVault(store);
  await restored.unlock(password);
  assert.equal(restored.data.pending.hash, hash);
  assert.equal(restored.data.pending.state, "submitted");
  await assert.rejects(
    persistSubmission(restored, { ...pending, id: "another-order", hash }),
    /unavailable/,
  );
  await assert.rejects(
    persistSubmission(restored, {
      ...pending,
      requestHash: keccak256("0x5678"),
      hash,
    }),
    /does not match/,
  );
  restored.lock();
});
test("private desk reserves before broadcast and refuses duplicate submissions or blind pending clearing", async () => {
  const before = globalThis.document;
  globalThis.document = { querySelector: () => null };
  const desk = new V4Desk();
  desk.vault = new PrivateVault(storage(), { locks: locks() });
  try {
    await desk.vault.create(
      { mnemonic: "test fixture", settings: {}, drafts: [] },
      "A separate private recovery password",
    );
    desk.review = { id: pending.id, kind: "launch", proof: pending };
    let release, called;
    const arrived = new Promise((resolve) => (called = resolve)),
      wait = new Promise((resolve) => (release = resolve));
    desk.bridge.call = async (method) => {
      assert.equal(method, "send");
      assert.equal(desk.data.pending.id, pending.id);
      called();
      await wait;
      throw Error("receipt timeout");
    };
    const request = desk.action("send-private", {});
    await arrived;
    await assert.rejects(desk.action("send-private", {}), /already reserved/);
    await desk.event({ ...pending, type: "submission", hash });
    release();
    await assert.rejects(request, /receipt timeout/);
    assert.equal(desk.data.pending.hash, hash);
    await assert.rejects(desk.action("clear-pending", {}), /exact original/);
  } finally {
    desk.vault.lock();
    globalThis.document = before;
  }
});

test("only one tab can reserve from the same encrypted private-wallet revision", async () => {
  const store = storage(),
    lockManager = locks(),
    first = new PrivateVault(store, { locks: lockManager }),
    second = new PrivateVault(store, { locks: lockManager }),
    password = "A separate private recovery password";
  await first.create(
    { mnemonic: "test fixture", settings: {}, drafts: [] },
    password,
  );
  await second.unlock(password);
  const results = await Promise.allSettled([
    first.reserveSubmission(pending),
    second.reserveSubmission({ ...pending, id: "other-order" }),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.match(
    results.find((result) => result.status === "rejected").reason.message,
    /changed since this edit/,
  );
  first.lock();
  second.lock();
  await second.unlock(password);
  assert.equal(second.data.pending.id, pending.id);
  second.lock();
});
test("an observed broadcaster receipt completes its encrypted save after lock without reopening keys", async () => {
  const store = storage(),
    vault = new PrivateVault(store, { locks: locks() }),
    password = "A separate private recovery password";
  await vault.create(
    { mnemonic: "test fixture", settings: {}, drafts: [], pending },
    password,
  );
  const saving = persistSubmission(vault, {
    ...pending,
    type: "submission",
    hash,
  });
  vault.lock();
  await saving;
  assert.equal(vault.key, null);
  assert.equal(vault.data, null);
  assert.equal(vault.envelope, null);
  await vault.unlock(password);
  assert.equal(vault.data.pending.hash, hash);
  vault.lock();
});

test("observed broadcaster hash merges across a legitimate second-tab note edit without losing either", async () => {
  const store = storage(),
    lockManager = locks(),
    a = new PrivateVault(store, { locks: lockManager }),
    b = new PrivateVault(store, { locks: lockManager }),
    password = "A separate private recovery password";
  await a.create(
    { mnemonic: "test fixture", settings: {}, drafts: [], note: "initial" },
    password,
  );
  await a.reserveSubmission(pending);
  await b.unlock(password);
  b.data.note = "Legitimate concurrent edit";
  await b.save();
  await persistSubmission(a, { ...pending, type: "submission", hash });
  a.lock();
  b.lock();
  await b.unlock(password);
  assert.equal(b.data.note, "Legitimate concurrent edit");
  assert.equal(b.data.pending.hash, hash);
  b.lock();
});
test("a queued stale note snapshot cannot overwrite an observed receipt merged in the same tab", async () => {
  const vault = new PrivateVault(storage(), { locks: locks() }),
    password = "A separate private recovery password";
  await vault.create(
    { mnemonic: "test fixture", settings: {}, drafts: [], pending },
    password,
  );
  const receipt = persistSubmission(vault, {
    ...pending,
    type: "submission",
    hash,
  });
  vault.data.note = "Queued edit";
  const note = vault.save();
  await receipt;
  await assert.rejects(note, /changed since this edit/);
  vault.lock();
  await vault.unlock(password);
  assert.equal(vault.data.pending.hash, hash);
  vault.lock();
});
