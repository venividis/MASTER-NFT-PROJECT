import test from "node:test";
import assert from "node:assert/strict";
import { ConfluenceWallet } from "../../web/confluence/wallet.mjs";
const owner = "0x" + "1".repeat(40),
  account = "0x" + "2".repeat(40),
  collection = "0x" + "3".repeat(40);
function fixture() {
  const events = [],
    calls = [],
    wallet = new ConfluenceWallet((message, event) =>
      events.push({ message, event }),
    ),
    snapshot = Array(17).fill(0);
  snapshot[1] = "new-seed";
  snapshot[2] = "new-genome";
  snapshot[3] = "new-root";
  snapshot[13] = 9n;
  snapshot[14] = false;
  Object.assign(wallet, {
    connected: true,
    revision: 1,
    address: owner,
    chainId: 1n,
    account,
    collection,
    tokenId: 2n,
    snapshot: { seed: "old", root: "old" },
  });
  wallet.raw = {
    request: async ({ method }) => (method === "eth_chainId" ? "0x1" : [owner]),
  };
  wallet.provider = {
    getBlockNumber: async () => 123,
    getBalance: async (a, b) => {
      calls.push(["balance", b]);
      return 5n;
    },
  };
  wallet.core = {
    renderSnapshot: async (t, o) => {
      calls.push(["snapshot", o.blockTag]);
      return snapshot;
    },
    ownerOf: async (t, o) => {
      calls.push(["owner", o.blockTag]);
      return owner;
    },
    accountOf: async (t, o) => {
      calls.push(["account", o.blockTag]);
      return account;
    },
  };
  return { wallet, events, calls };
}
test("confirmed refresh pins render, custody and balance to the same block and publishes new visual roots", async () => {
  const { wallet, events, calls } = fixture();
  const fresh = await wallet.refreshSnapshot();
  assert.equal(fresh.root, "new-root");
  assert.equal(fresh.nonce, "9");
  assert.equal(fresh.block, 123);
  assert.ok(calls.every((x) => x[1] === 123));
  assert.equal(fresh.stale, false);
  assert.equal(events.at(-1).event, "snapshot");
});
test("unavailable refresh keeps a marked stale snapshot; custody change discards authority and selection", async () => {
  const first = fixture();
  first.wallet.core.renderSnapshot = async () => {
    throw Error("RPC unavailable");
  };
  await assert.rejects(first.wallet.refreshSnapshot(), /RPC/);
  assert.equal(first.wallet.snapshot.stale, true);
  assert.equal(first.events.at(-1).event, "snapshot-stale");
  const second = fixture();
  second.wallet.core.ownerOf = async () => collection;
  await assert.rejects(second.wallet.refreshSnapshot(), /custody/);
  assert.equal(second.wallet.connected, false);
  assert.equal(second.wallet.snapshot, null);
  assert.equal(second.wallet.plan, null);
});
test("an in-flight refresh cannot replace a newly selected NFT", async () => {
  const { wallet } = fixture();
  wallet.core.renderSnapshot = async () => {
    wallet.revision++;
    wallet.snapshot = { root: "other" };
    return Array(17).fill(0);
  };
  await assert.rejects(wallet.refreshSnapshot(), /selection changed/);
  assert.equal(wallet.snapshot.root, "other");
  assert.equal(wallet.snapshot.stale, undefined);
});
test("included receipt survives failed snapshot refresh, while a successful send updates the source immediately", async () => {
  for (const failure of [false, true]) {
    const { wallet } = fixture();
    wallet.plan = {
      createdAt: Date.now(),
      revision: 1,
      execution: "external",
      chainId: "1",
      account: owner,
      target: account,
      codeHash:
        "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      transaction: { to: account },
      gas: "100",
    };
    wallet.provider.getCode = async () => "0x";
    wallet.provider.call = async () => "0x";
    wallet.signer = {
      sendTransaction: async () => ({
        hash: "tx",
        wait: async () => ({ status: 1, blockNumber: 122, logs: [] }),
      }),
    };
    if (failure)
      wallet.core.renderSnapshot = async () => {
        throw Error("offline");
      };
    const receipt = await wallet.send();
    assert.equal(receipt.hash, "tx");
    assert.equal(receipt.snapshotStatus, failure ? "unavailable" : "refreshed");
    assert.equal(wallet.snapshot.root, failure ? "old" : "new-root");
  }
});
