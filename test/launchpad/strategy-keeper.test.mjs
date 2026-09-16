import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  saveKeeperState,
  recoverV4ExitTransaction,
  scanV4Exits,
} from "../../agent/v4-exit-keeper.mjs";
const pending = { hash: "0xaaa", sender: "0xowner", nonce: 3, blockNumber: 12 };
const receipt = {
  hash: "0xaaa",
  status: 1,
  blockNumber: 14,
  blockHash: "0xblock",
  gasUsed: 10n,
  gasPrice: 2n,
};
test("keeper resumes a canonical receipt and refuses orphaned or underconfirmed observations", async () => {
  const provider = {
    getTransactionReceipt: async () => receipt,
    getBlock: async () => ({ hash: "0xblock" }),
    getBlockNumber: async () => 15,
  };
  assert.deepEqual(await recoverV4ExitTransaction(provider, pending), {
    status: "confirmed",
    hash: "0xaaa",
    replacement: null,
    blockNumber: 14,
    blockHash: "0xblock",
    gasPaid: "20",
    resolved: true,
  });
  provider.getBlock = async () => ({ hash: "0xorphan" });
  assert.equal(
    (await recoverV4ExitTransaction(provider, pending)).status,
    "reorganized",
  );
  provider.getBlock = async () => ({ hash: "0xblock" });
  provider.getBlockNumber = async () => 14;
  assert.equal(
    (await recoverV4ExitTransaction(provider, pending)).status,
    "confirming",
  );
});
test("keeper finds a mined nonce replacement but never treats an unresolved nonce as execution success", async () => {
  const replacement = { ...receipt, hash: "0xbb" },
    provider = {
      getTransactionReceipt: async (h) => (h === "0xbb" ? replacement : null),
      getTransactionCount: async () => 4,
      getBlockNumber: async () => 15,
      getBlock: async () => ({
        hash: "0xblock",
        prefetchedTransactions: [{ hash: "0xbb", from: "0xOWNER", nonce: 3 }],
      }),
    };
  const result = await recoverV4ExitTransaction(provider, pending);
  assert.equal(result.status, "replaced");
  assert.equal(result.hash, "0xbb");
  assert.equal(result.resolved, true);
  provider.getBlock = async () => ({
    hash: "0xblock",
    prefetchedTransactions: [],
  });
  assert.equal(
    (await recoverV4ExitTransaction(provider, pending)).status,
    "nonce-used-receipt-unresolved",
  );
  provider.getTransactionCount = async () => 3;
  assert.equal(
    (await recoverV4ExitTransaction(provider, pending)).status,
    "pending-or-unbroadcast",
  );
});
test("pre-broadcast journal persists exact transaction identity and never requires a private key", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v4-keeper-"));
  try {
    const file = path.join(dir, "state.json");
    saveKeeperState(file, { pending, receipts: [] });
    assert.deepEqual(
      JSON.parse(fs.readFileSync(file, "utf8")).pending,
      pending,
    );
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.existsSync(file + ".next"), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("status exposes funded rewards, due state and fixed beneficiary without broadcasting", async () => {
  const vault = {
    plan: async () => ({
      owner: "owner",
      beneficiary: "beneficiary",
      remaining: 21n,
      executed: 1n,
      slices: 3n,
      rewardPerSlice: 4n,
      rewardRemaining: 8n,
      paused: true,
      cancelled: false,
    }),
    nextSlice: async () => [7n, 6n, 100n, false],
  };
  const [result] = await scanV4Exits(vault, ["1"]);
  assert.equal(result.executable, false);
  assert.equal(result.beneficiary, "beneficiary");
  assert.equal(result.rewardRemaining, "8");
  assert.equal(result.minimumOutput, "6");
});
