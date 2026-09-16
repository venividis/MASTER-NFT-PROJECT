import test from "node:test";
import assert from "node:assert/strict";
import ganache from "ganache";
import {
  BrowserProvider,
  parseEther,
  Interface,
  Transaction,
  getAddress,
} from "ethers";
import {
  MintVault,
  validateBurnerKeystore,
  codeSnapshot,
  discoverMintedTokens,
} from "../../web/burners/vault.mjs";
import { openSealedData, sealPrivateData } from "../../web/privacy/vault.mjs";
import { BurnerDesk } from "../../web/burners/desk.mjs";
import {
  mintData,
  checkSpend,
  checkSite,
  burnerPolicy,
} from "../../web/burners/policy.mjs";
import { deployContract } from "../../scripts/lib/deploy-stack.mjs";
const storage = () => {
  const values = new Map();
  return {
    getItem: (k) => values.get(k) || null,
    setItem: (k, v) => values.set(k, v),
    values,
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
test("mint grammar refuses broad spending and always fixes supported recipient arguments", () => {
  const recipient = "0x" + "12".repeat(20),
    iface = new Interface(["function mint(address,uint256)"]);
  const decoded = iface.decodeFunctionData(
    "mint",
    mintData("mint(address,uint256)", 2, recipient),
  );
  assert.equal(decoded[0], getAddress(recipient));
  assert.equal(decoded[1], 2n);
  for (const name of [
    "approve(address,uint256)",
    "setApprovalForAll(address,bool)",
    "execute(address,bytes)",
    "multicall(bytes[])",
    "permit(address,uint256)",
    "eth_sign",
    "wallet_sendCalls",
  ])
    assert.throws(() => mintData(name, 1, recipient));
  assert.throws(() => mintData("mint()", 2, recipient));
});
test("origin and gas-budget gates reject mismatches, insecure URLs, disguised suffixes and unsupported fee models", () => {
  const origin = "https://mint.example";
  assert.equal(checkSite(origin, origin + "/drop/1").matches, true);
  assert.equal(
    checkSite(origin, "https://mint.example.attacker.test").matches,
    false,
  );
  assert.throws(() => checkSite(origin, "http://mint.example"));
  assert.throws(() => checkSite(origin, "https://name:secret@mint.example"));
  assert.throws(() =>
    checkSpend({
      budget: "100",
      spent: "10",
      value: "80",
      gas: "2",
      fee: "6",
      balance: "1000",
    }),
  );
  assert.equal(
    checkSpend({
      budget: "100",
      spent: "10",
      value: "60",
      gas: "2",
      fee: "10",
      balance: "100",
    }),
    "80",
  );
  assert.throws(() =>
    burnerPolicy({
      name: "x",
      chainId: "8453",
      target: "0x" + "11".repeat(20),
      recovery: "0x" + "22".repeat(20),
      budget: "1",
      origin,
      rpc: origin,
    }),
  );
});
test("independent encrypted project wallet mints, inspects, preserves uncertain broadcasts and recovers without the mint target", async (t) => {
  const rpc = ganache.provider({
    chain: { chainId: 31337, hardfork: "shanghai" },
    logging: { quiet: true },
  });
  t.after(() => rpc.disconnect());
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 10;
  const owner = await provider.getSigner(0),
    recovery = await provider.getSigner(1),
    contract = await deployContract("MintSanctuaryHarness", owner),
    store = storage(),
    vault = new MintVault({
      storage: store,
      locks: locks(),
      providerFactory: () => provider,
    });
  t.after(() => vault.lock());
  const password = "One entirely separate ember password 2049";
  const policy = {
    name: "Test project",
    origin: "https://mint.example",
    chainId: "31337",
    rpc: "http://localhost:8545",
    target: contract.target,
    recovery: await recovery.getAddress(),
    budget: String(parseEther("0.05")),
  };
  const created = await vault.create(policy, password),
    id = created.id;
  assert.notEqual(created.address, await owner.getAddress());
  assert.notEqual(created.address, policy.recovery);
  assert.equal(vault.list()[0].unlocked, false);
  assert.throws(() => vault.exportEncryptedKey(id), /Unlock/);
  const backup = vault.backup(id);
  const opened = await openSealedData(backup.envelope, password),
    record = opened.data.record;
  assert(record.keystore.includes("ciphertext"));
  for (const value of [
    record.address,
    policy.origin,
    policy.rpc,
    policy.recovery,
    policy.name,
    policy.target,
    policy.budget,
  ])
    assert(!JSON.stringify(backup).includes(value), "backup hides " + value);
  assert.deepEqual(vault.list(), [{ id, unlocked: false, legacy: false }]);
  assert(!JSON.stringify(backup).includes(password));
  assert(!Object.hasOwn(record, "privateKey"));
  validateBurnerKeystore(record.keystore);
  const tamperedRecord = structuredClone(record);
  tamperedRecord.policy.recovery = await owner.getAddress();
  const tampered = {
    ...backup,
    envelope: (await sealPrivateData({ record: tamperedRecord }, password))
      .envelope,
  };
  const tamperVault = new MintVault({
    storage: storage(),
    locks: locks(),
    providerFactory: () => provider,
  });
  await assert.rejects(
    tamperVault.importBackup(JSON.stringify(tampered), password),
    /policy signature/,
  );
  const bad = JSON.parse(record.keystore);
  (bad.crypto || bad.Crypto).kdfparams.n = 2 ** 28;
  assert.throws(() => validateBurnerKeystore(JSON.stringify(bad)));
  await assert.rejects(vault.unlock(id, "incorrect encryption password"));
  await vault.unlock(id, password);
  assert.equal(vault.exportEncryptedKey(id), record.keystore);
  await (
    await owner.sendTransaction({
      to: created.address,
      value: parseEther("0.2"),
    })
  ).wait();
  let release, arrived;
  const blocked = new Promise((resolve) => (release = resolve)),
    reached = new Promise((resolve) => (arrived = resolve)),
    feeData = provider.getFeeData.bind(provider);
  provider.getFeeData = async () => {
    arrived();
    await blocked;
    return feeData();
  };
  const interrupted = vault.prepare(id, {
    site: policy.origin,
    method: "mint()",
  });
  await reached;
  vault.lock();
  release();
  await assert.rejects(interrupted, /locked while preparing/);
  provider.getFeeData = feeData;
  await vault.unlock(id, password);
  await assert.rejects(
    vault.prepare(id, { site: "https://evil.example", method: "mint()" }),
    /origin mismatch/,
  );
  await assert.rejects(
    vault.prepare(id, {
      site: policy.origin,
      method: "approve(address,uint256)",
    }),
    /Unsupported/,
  );
  await assert.rejects(
    vault.prepare(id, {
      site: policy.origin,
      method: "mint()",
      value: String(parseEther("0.1")),
    }),
    /budget/,
  );
  const review = await vault.prepare(id, {
    site: policy.origin,
    method: "mint(address,uint256)",
    quantity: 2,
    value: String(parseEther("0.001")),
  });
  review.transaction.to = policy.recovery;
  review.value = "999999";
  const hash = await vault.execute(review.digest);
  assert.equal(await contract.ownerOf(1), created.address);
  assert.equal(await contract.ownerOf(2), created.address);
  assert.equal(vault.list()[0].pending.hash, hash);
  await assert.rejects(
    vault.prepare(id, { site: policy.origin, method: "mint()" }),
    /pending/,
  );
  await rpc.request({ method: "evm_mine", params: [] });
  const status = await vault.checkPending(id);
  assert.equal(status.state, "confirmed");
  assert.equal(status.result.tokens.length, 2);
  const inspected = await vault.inspect(id, 1);
  assert.equal(inspected.held, true);
  assert.equal(inspected.codeUnchanged, true);
  assert.match(inspected.metadata, /Not fetched/);
  assert(BigInt(vault.list()[0].spent) > parseEther("0.001"));
  const transfer = await vault.prepare(id, {
    kind: "transfer",
    tokenId: "1",
    standard: "ERC721",
  });
  await vault.execute(transfer.digest);
  assert.equal(await contract.ownerOf(1), policy.recovery);
  await rpc.request({ method: "evm_mine", params: [] });
  await vault.checkPending(id);
  // A write to another tab makes the reviewed record stale, even with the same signer.
  const stale = await vault.prepare(id, {
    site: policy.origin,
    method: "mint()",
  });
  const key = [...store.values.keys()][0],
    records = JSON.parse(store.getItem(key));
  const altered = (await openSealedData(records[0].envelope, password)).data
    .record;
  altered.spent = String(BigInt(altered.spent) + 1n);
  records[0].envelope = (
    await sealPrivateData({ record: altered }, password)
  ).envelope;
  store.setItem(key, JSON.stringify(records));
  await assert.rejects(vault.execute(stale.digest), /state changed/);
  await vault.unlock(id, password);
  // Simulate a transport failure before the node receives signed bytes; reserve and rebroadcast the exact bytes.
  const retry = await vault.prepare(id, {
      site: policy.origin,
      method: "mint()",
    }),
    broadcast = provider.broadcastTransaction.bind(provider);
  provider.broadcastTransaction = async () => {
    throw Error("transport interrupted");
  };
  await assert.rejects(vault.execute(retry.digest), /Reservation retained/);
  const pending = (await openSealedData(vault.backup(id).envelope, password))
    .data.record.pending;
  assert(!JSON.stringify(vault.backup(id)).includes(pending.hash));
  assert.equal(Transaction.from(pending.raw).hash, pending.hash);
  assert.equal((await vault.checkPending(id)).state, "pending");
  provider.broadcastTransaction = broadcast;
  await vault.rebroadcast(id);
  await rpc.request({ method: "evm_mine", params: [] });
  assert.equal((await vault.checkPending(id)).state, "confirmed");
  const source = await provider.getCode(contract.target);
  await rpc.request({
    method: "evm_setAccountCode",
    params: [contract.target, "0x60006000f3"],
  });
  await assert.rejects(
    vault.prepare(id, { site: policy.origin, method: "mint()" }),
    /changed/,
  );
  const recoveryBefore = await provider.getBalance(policy.recovery);
  const sweep = await vault.prepare(id, { kind: "sweep" });
  assert.equal(sweep.target, policy.recovery);
  assert.equal(sweep.pin, null);
  await vault.execute(sweep.digest);
  await rpc.request({ method: "evm_mine", params: [] });
  await vault.checkPending(id);
  assert((await provider.getBalance(policy.recovery)) > recoveryBefore);
  await rpc.request({
    method: "evm_setAccountCode",
    params: [contract.target, source],
  });
  vault.lock();
  assert.equal(vault.list()[0].unlocked, false);
  await assert.rejects(
    vault.prepare(id, { site: policy.origin, method: "mint()" }),
    /Unlock/,
  );
  const restoreStore = storage(),
    restored = new MintVault({
      storage: restoreStore,
      locks: locks(),
      providerFactory: () => provider,
    });
  t.after(() => restored.lock());
  const imported = vault.backup(id);
  await restored.importBackup(JSON.stringify(imported), password);
  assert.equal(restored.list()[0].address, undefined);
  await restored.unlock(id, password);
  assert.equal(restored.list()[0].address, created.address);
  await assert.rejects(
    restored.importBackup(JSON.stringify(imported), password),
    /already exists/,
  );
  const legacyStore = storage();
  legacyStore.setItem(key, JSON.stringify([record]));
  const legacy = new MintVault({
    storage: legacyStore,
    locks: locks(),
    providerFactory: () => provider,
  });
  t.after(() => legacy.lock());
  assert.deepEqual(legacy.list(), [{ id, unlocked: false, legacy: true }]);
  assert.throws(() => legacy.backup(id), /Unlock this legacy/);
  await assert.rejects(legacy.unlock(id, "incorrect encryption password"));
  assert(
    JSON.stringify([...legacyStore.values.values()]).includes(policy.origin),
  );
  await legacy.unlock(id, password);
  assert(
    !JSON.stringify([...legacyStore.values.values()]).includes(policy.origin),
  );
  assert.equal(legacy.backup(id).schema, "anima.encrypted-mint-wallet/2");
  legacy.lock();
  await legacy.unlock(id, password);
  assert.equal(legacy.list()[0].address, created.address);
  const legacyImport = new MintVault({
    storage: storage(),
    locks: locks(),
    providerFactory: () => provider,
  });
  t.after(() => legacyImport.lock());
  await legacyImport.importBackup(
    JSON.stringify({ schema: "anima.encrypted-mint-wallet/1", record }),
    password,
  );
  assert.equal(legacyImport.backup(id).schema, "anima.encrypted-mint-wallet/2");
});
test("receipt discovery ignores unrelated contracts and reports transfers without certifying safety", () => {
  const nft = "0x" + "12".repeat(20),
    user = "0x" + "34".repeat(20),
    iface = new Interface([
      "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
    ]),
    log = iface.encodeEventLog("Transfer", ["0x" + "00".repeat(20), user, 42]);
  const receipt = { logs: [{ address: nft, ...log }] };
  assert.deepEqual(discoverMintedTokens(receipt, nft, user), [
    { standard: "ERC721", tokenId: "42", amount: "1" },
  ]);
  assert.deepEqual(
    discoverMintedTokens(receipt, "0x" + "56".repeat(20), user),
    [],
  );
});

test("locking the mint desk replaces already rendered sensitive metadata", () => {
  const before = globalThis.document;
  let rendered = "private project history and recovery address";
  const element = {
    set outerHTML(value) {
      rendered = value;
    },
  };
  globalThis.document = {
    addEventListener() {},
    querySelectorAll: () => [element],
  };
  try {
    const desk = new BurnerDesk({ storage: storage(), locks: locks() });
    desk.lock();
    assert(!rendered.includes("private project history"));
    assert(rendered.includes("burner-desk"));
    assert(rendered.includes("data-private-surface"));
  } finally {
    globalThis.document = before;
  }
});
