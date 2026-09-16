import {
  Wallet,
  JsonRpcProvider,
  Contract,
  Interface,
  getAddress,
  keccak256,
  ZeroAddress,
  Transaction,
  toUtf8Bytes,
  toBeHex,
  verifyMessage,
} from "../vendor/ethers.min.js";
import {
  sealPrivateData,
  openSealedData,
  resealData,
} from "../privacy/vault.mjs";
import {
  burnerPolicy,
  burnHash,
  mintData,
  checkSite,
  checkSpend,
} from "./policy.mjs";
const STORE = "anima.genesis.burners.1",
  ZERO = "0x" + "0".repeat(64);
const SLOTS = ["implementation", "admin", "beacon"].map((name) =>
  toBeHex(BigInt(keccak256(toUtf8Bytes("eip1967.proxy." + name))) - 1n, 32),
);
export async function codeSnapshot(provider, target) {
  const code = await provider.getCode(target);
  if (code === "0x")
    throw Error("The mint target has no contract code on this chain.");
  const slots = (
      await Promise.all(SLOTS.map((s) => provider.getStorage(target, s)))
    ).map((s) => {
      if (!/^0x[0-9a-f]{0,64}$/i.test(s))
        throw Error("RPC returned an invalid proxy storage word.");
      return "0x" + s.slice(2).padStart(64, "0").toLowerCase();
    }),
    implementations = [];
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] === ZERO) continue;
    const address = getAddress("0x" + slots[i].slice(-40));
    if (i === 0)
      implementations.push([
        address,
        keccak256(await provider.getCode(address)),
      ]);
    if (i === 2) {
      const b = new Contract(
        address,
        ["function implementation() view returns(address)"],
        provider,
      );
      const impl = getAddress(await b.implementation());
      implementations.push([
        address,
        keccak256(await provider.getCode(address)),
        impl,
        keccak256(await provider.getCode(impl)),
      ]);
    }
  }
  const snapshot = {
    codeHash: keccak256(code),
    slots,
    implementations,
    minimalProxy: /^0x363d3d373d3d3d363d73/i.test(code),
  };
  return {
    ...snapshot,
    fingerprint: burnHash(snapshot),
    proxy: implementations.length > 0 || snapshot.minimalProxy,
  };
}
const clone = (v) => structuredClone(v);
export function validateBurnerKeystore(value) {
  if (typeof value !== "string" || value.length > 100000)
    throw Error("Invalid encrypted key file.");
  const k = JSON.parse(value),
    c = k.crypto || k.Crypto,
    p = c?.kdfparams;
  if (
    k.version !== 3 ||
    c?.cipher !== "aes-128-ctr" ||
    c.kdf !== "scrypt" ||
    !p ||
    p.r !== 8 ||
    p.p !== 1 ||
    p.dklen !== 32 ||
    !Number.isInteger(p.n) ||
    p.n < 16384 ||
    p.n > 131072 ||
    (p.n & (p.n - 1)) !== 0 ||
    !/^([0-9a-f]{64})$/i.test(c.ciphertext) ||
    !/^([0-9a-f]{64})$/i.test(c.mac) ||
    !/^([0-9a-f]{64})$/i.test(p.salt) ||
    !/^([0-9a-f]{32})$/i.test(c.cipherparams?.iv)
  )
    throw Error(
      "Unsupported or excessive encrypted-key parameters. Use an Anima-generated backup.",
    );
  return k;
}
const policyStatement = (r) =>
  "Anima Genesis mint-wallet policy v1\n" +
  JSON.stringify({
    id: r.id,
    address: r.address,
    created: r.created,
    policy: r.policy,
    pin: r.pin.fingerprint,
  });
function validStore(records) {
  if (!Array.isArray(records) || records.length > 32)
    throw Error("Invalid mint-wallet archive.");
  const ids = new Set();
  for (const r of records) {
    if (
      typeof r.id !== "string" ||
      ids.has(r.id) ||
      typeof r.keystore !== "string" ||
      r.keystore.length > 100000 ||
      !/^\d+$/.test(r.spent) ||
      !Array.isArray(r.history) ||
      r.history.length > 2000
    )
      throw Error("Invalid mint-wallet record.");
    ids.add(r.id);
    r.policy = burnerPolicy(r.policy);
    r.address = getAddress(r.address);
    validateBurnerKeystore(r.keystore);
    if (!r.pin || !/^0x[\da-f]{64}$/i.test(r.pin.fingerprint))
      throw Error("Invalid contract pin.");
    const { codeHash, slots, implementations, minimalProxy } = r.pin;
    if (
      burnHash({ codeHash, slots, implementations, minimalProxy }) !==
        r.pin.fingerprint ||
      r.pin.proxy !== (implementations.length > 0 || minimalProxy)
    )
      throw Error("Contract pin was changed.");
    if (
      !Number.isSafeInteger(r.created) ||
      r.created < 1 ||
      typeof r.policySignature !== "string" ||
      verifyMessage(policyStatement(r), r.policySignature) !== r.address
    )
      throw Error(
        "Immutable wallet policy signature failed. Recovery address, budget and target must match creation.",
      );
    if (
      r.pending &&
      (!/^0x[\da-f]{64}$/i.test(r.pending.hash) ||
        !/^\d+$/.test(r.pending.worst))
    )
      throw Error("Invalid pending transaction.");
  }
  return records;
}
const ARCHIVE_SCHEMA = "anima.encrypted-mint-wallet/2";
function isSealed(entry) {
  return entry?.schema === ARCHIVE_SCHEMA;
}
function validIndex(entries) {
  if (!Array.isArray(entries) || entries.length > 32)
    throw Error("Invalid mint-wallet archive.");
  const ids = new Set();
  for (const entry of entries) {
    if (typeof entry?.id !== "string" || ids.has(entry.id))
      throw Error("Invalid mint-wallet index.");
    ids.add(entry.id);
    if (isSealed(entry)) {
      if (
        !entry.envelope ||
        typeof entry.envelope.ciphertext !== "string" ||
        entry.envelope.ciphertext.length > 14000000
      )
        throw Error("Invalid encrypted mint-wallet record.");
    } else validStore([entry]);
  }
  return entries;
}
/** Only opaque IDs and authenticated ciphertext persist for new or migrated wallets. */
export class MintVault {
  #wallet = null;
  #id = null;
  #record = null;
  #key = null;
  #entry = null;
  #review = null;
  #timer = null;
  #version = 0;
  constructor({
    storage = globalThis.localStorage,
    providerFactory = (url) =>
      new JsonRpcProvider(url, undefined, { cacheTimeout: -1 }),
    locks = globalThis.navigator?.locks,
    onLock = () => {},
  } = {}) {
    this.storage = storage;
    this.providerFactory = providerFactory;
    this.locks = locks;
    this.onLock = onLock;
  }
  #read() {
    const raw = this.storage.getItem(STORE);
    return raw ? validIndex(JSON.parse(raw)) : [];
  }
  #stored(id) {
    const entry = this.#read().find((x) => x.id === id);
    if (!entry) throw Error("Unknown project wallet.");
    return entry;
  }
  #get(id) {
    if (this.#id !== id || !this.#record || !this.#key)
      throw Error("Unlock this project wallet first.");
    if (JSON.stringify(this.#stored(id)) !== JSON.stringify(this.#entry))
      throw Error(
        "Wallet state changed in another tab. Unlock again before reviewing.",
      );
    return clone(this.#record);
  }
  #replace(entry) {
    const all = this.#read(),
      index = all.findIndex((x) => x.id === entry.id);
    if (index < 0) {
      if (all.length >= 32) throw Error("Maximum 32 project wallets.");
      all.push(entry);
    } else all[index] = entry;
    this.storage.setItem(STORE, JSON.stringify(validIndex(all)));
  }
  async #save(record) {
    const version = this.#version,
      key = this.#key,
      entry = this.#entry;
    this.#get(record.id);
    validStore([record]);
    const envelope = await resealData({ record }, key, entry.envelope);
    if (version !== this.#version || this.#id !== record.id || !this.#key)
      throw Error("Wallet locked before changes were saved.");
    this.#get(record.id);
    const next = { schema: ARCHIVE_SCHEMA, id: record.id, envelope };
    this.#replace(next);
    this.#entry = next;
    this.#record = clone(record);
  }
  async #exclusive(fn) {
    if (!this.locks?.request)
      throw Error(
        "This browser needs Web Locks to serialize wallet operations.",
      );
    return this.locks.request(STORE, fn);
  }
  list() {
    return this.#read().map((entry) => {
      if (entry.id === this.#id && this.#record) {
        const { keystore, ...record } = this.#get(entry.id);
        return { ...record, unlocked: true };
      }
      return { id: entry.id, unlocked: false, legacy: !isSealed(entry) };
    });
  }
  exportEncryptedKey(id) {
    return this.#get(id).keystore;
  }
  backup(id) {
    const entry = this.#stored(id);
    if (!isSealed(entry))
      throw Error(
        "Unlock this legacy wallet once to encrypt its complete record before exporting.",
      );
    return {
      ...clone(entry),
      warning:
        "Keep this encrypted backup and its password separately. Exported keys and restored backups can bypass local spending limits.",
    };
  }
  lock() {
    this.#version++;
    this.#wallet = null;
    this.#id = null;
    this.#record = null;
    this.#key = null;
    this.#entry = null;
    this.#review = null;
    clearTimeout(this.#timer);
    this.onLock();
  }
  #touch() {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.lock(), 120000);
  }
  async create(raw, password) {
    if (typeof password !== "string" || password.length < 16)
      throw Error(
        "Use a unique password of at least 16 characters; never enter a wallet seed.",
      );
    const version = this.#version,
      policy = burnerPolicy(raw),
      provider = this.providerFactory(policy.rpc);
    if (String((await provider.getNetwork()).chainId) !== policy.chainId)
      throw Error("RPC chain does not match the chosen chain.");
    if ((await provider.getCode(policy.recovery)) !== "0x")
      throw Error(
        "Use a regular EOA recovery address without contract or delegated code. This desk does not support contract recovery recipients.",
      );
    const pin = await codeSnapshot(provider, policy.target),
      wallet = Wallet.createRandom(),
      keystore = await wallet.encrypt(password),
      check = await Wallet.fromEncryptedJson(keystore, password);
    if (check.address !== wallet.address)
      throw Error("Encrypted backup verification failed.");
    const record = {
      id: crypto.randomUUID(),
      address: wallet.address,
      policy,
      pin,
      keystore,
      created: Date.now(),
      spent: "0",
      pending: null,
      history: [],
    };
    record.policySignature = await wallet.signMessage(policyStatement(record));
    const { envelope } = await sealPrivateData({ record }, password);
    await this.#exclusive(() => {
      if (version !== this.#version)
        throw Error("Wallet locked during creation.");
      this.#replace({ schema: ARCHIVE_SCHEMA, id: record.id, envelope });
    });
    return clone({ ...record, keystore: undefined });
  }
  async importBackup(text, password) {
    if (typeof text !== "string" || text.length > 14000000)
      throw Error("Backup exceeds 14 MB.");
    const version = this.#version,
      input = JSON.parse(text);
    let record, entry;
    if (isSealed(input)) {
      const opened = await openSealedData(input.envelope, password);
      record = opened.data.record;
      if (record?.id !== input.id)
        throw Error("Encrypted wallet identity mismatch.");
      entry = {
        schema: ARCHIVE_SCHEMA,
        id: input.id,
        envelope: input.envelope,
      };
    } else if (input.schema === "anima.encrypted-mint-wallet/1") {
      record = input.record;
    } else throw Error("Use an encrypted Anima mint-wallet backup.");
    validStore([record]);
    const wallet = await Wallet.fromEncryptedJson(record.keystore, password);
    if (wallet.address !== getAddress(record.address))
      throw Error("Backup address does not match its encrypted key.");
    if (!entry)
      entry = {
        schema: ARCHIVE_SCHEMA,
        id: record.id,
        envelope: (await sealPrivateData({ record }, password)).envelope,
      };
    await this.#exclusive(() => {
      if (version !== this.#version)
        throw Error("Wallet locked during restore.");
      if (this.#read().some((r) => r.id === record.id))
        throw Error(
          "This wallet already exists; use its current budget and pending state.",
        );
      this.#replace(entry);
    });
    return wallet.address;
  }
  async unlock(id, password) {
    this.lock();
    const version = this.#version,
      stored = this.#stored(id);
    let record, key, entry;
    if (isSealed(stored)) {
      const opened = await openSealedData(stored.envelope, password);
      record = opened.data.record;
      key = opened.key;
      entry = stored;
    } else {
      record = clone(stored);
    }
    validStore([record]);
    if (record.id !== id) throw Error("Encrypted wallet identity mismatch.");
    const wallet = await Wallet.fromEncryptedJson(record.keystore, password);
    if (wallet.address !== getAddress(record.address))
      throw Error("Encrypted key does not match this wallet.");
    if (!entry) {
      const sealed = await sealPrivateData({ record }, password);
      key = sealed.key;
      entry = { schema: ARCHIVE_SCHEMA, id, envelope: sealed.envelope };
    }
    await this.#exclusive(() => {
      if (version !== this.#version) throw Error("Unlock was cancelled.");
      if (JSON.stringify(this.#stored(id)) !== JSON.stringify(stored))
        throw Error("Wallet state changed during unlock. Try again.");
      if (!isSealed(stored)) this.#replace(entry);
      this.#wallet = wallet;
      this.#id = id;
      this.#record = record;
      this.#key = key;
      this.#entry = entry;
      this.#touch();
    });
    return wallet.address;
  }
  async #provider(r) {
    const p = this.providerFactory(r.policy.rpc);
    if (String((await p.getNetwork()).chainId) !== r.policy.chainId)
      throw Error("RPC chain changed.");
    if ((await p.getCode(r.address)) !== "0x")
      throw Error(
        "This address has delegated or contract code. Minting is disabled.",
      );
    return p;
  }
  async prepare(
    id,
    {
      kind = "mint",
      method = "mint(uint256)",
      quantity = 1,
      value = "0",
      site,
      tokenId,
      standard = "ERC721",
      amount = "1",
    } = {},
  ) {
    this.#review = null;
    const version = this.#version,
      r = this.#get(id);
    if (r.pending)
      throw Error("Resolve the pending transaction before preparing another.");
    if (this.#id !== id || !this.#wallet)
      throw Error("Unlock this project wallet first.");
    const provider = await this.#provider(r),
      pin =
        kind === "sweep"
          ? { fingerprint: null, proxy: false }
          : await codeSnapshot(provider, r.policy.target);
    if (kind !== "sweep" && pin.fingerprint !== r.pin.fingerprint)
      throw Error(
        "Contract code or a detected proxy setting changed. This wallet refuses new calls.",
      );
    let target = r.policy.target,
      data,
      n = BigInt(value);
    if (n < 0n) throw Error("Negative transaction value.");
    if (kind === "mint") {
      const siteReport = checkSite(r.policy.origin, site);
      if (!siteReport.matches)
        throw Error("Project origin mismatch. No transaction was prepared.");
      data = mintData(method, quantity, r.address);
    } else if (kind === "sweep") {
      target = r.policy.recovery;
      data = "0x";
      n = 0n;
    } else if (kind === "transfer") {
      n = 0n;
      const nft = await this.inspect(id, tokenId, standard);
      if (!nft.held)
        throw Error(
          "The contract does not report this NFT in your mint wallet.",
        );
      if (standard === "ERC721")
        data = new Interface([
          "function safeTransferFrom(address,address,uint256)",
        ]).encodeFunctionData("safeTransferFrom", [
          r.address,
          r.policy.recovery,
          tokenId,
        ]);
      else {
        if (BigInt(amount) < 1n || BigInt(amount) > BigInt(nft.balance))
          throw Error("Invalid NFT transfer quantity.");
        data = new Interface([
          "function safeTransferFrom(address,address,uint256,uint256,bytes)",
        ]).encodeFunctionData("safeTransferFrom", [
          r.address,
          r.policy.recovery,
          tokenId,
          amount,
          "0x",
        ]);
      }
    } else
      throw Error(
        "Only reviewed mint, NFT recovery and native recovery calls are supported.",
      );
    const balance = await provider.getBalance(r.address, "pending"),
      nonce = await provider.getTransactionCount(r.address, "pending"),
      fees = await provider.getFeeData();
    const fee = fees.maxFeePerGas || fees.gasPrice,
      priority = fees.maxPriorityFeePerGas || 0n;
    if (!fee || fee <= 0n)
      throw Error("RPC did not provide a usable gas price.");
    let tx = {
      from: r.address,
      to: target,
      data,
      value: n,
      nonce,
      chainId: BigInt(r.policy.chainId),
    };
    if (kind === "sweep") {
      if ((await provider.getCode(target)) !== "0x")
        throw Error(
          "Native recovery currently supports an EOA recovery address only.",
        );
      tx.value = 1n;
    }
    await provider.call(tx);
    const gas = ((await provider.estimateGas(tx)) * 120n) / 100n + 1n;
    if (kind === "sweep") {
      n = balance - gas * fee;
      if (n <= 0n) throw Error("No native balance remains after maximum gas.");
      tx.value = n;
    }
    const worst =
      kind === "mint"
        ? checkSpend({
            budget: r.policy.budget,
            spent: r.spent,
            value: n,
            gas,
            fee,
            balance,
          })
        : String(n + gas * fee);
    if (BigInt(worst) > balance)
      throw Error("This wallet cannot cover recovery plus maximum gas.");
    tx = {
      ...tx,
      gasLimit: gas,
      ...(fees.maxFeePerGas
        ? { type: 2, maxFeePerGas: fee, maxPriorityFeePerGas: priority }
        : { type: 0, gasPrice: fee }),
    };
    await provider.call(tx);
    const reviewed = {
      id,
      kind,
      method: kind === "mint" ? method : kind,
      quantity: kind === "mint" ? quantity : undefined,
      site: kind === "mint" ? projectSafeSite(site) : null,
      address: r.address,
      chainId: r.policy.chainId,
      target,
      data,
      value: String(n),
      nonce,
      gasLimit: String(gas),
      maxFeePerGas: String(fee),
      worst,
      expires: Date.now() + 90000,
      pin: pin.fingerprint,
      recordHash: burnHash(r),
      proxy: pin.proxy,
      transaction: JSON.parse(
        JSON.stringify(tx, (_, v) => (typeof v === "bigint" ? String(v) : v)),
      ),
    };
    if (version !== this.#version || this.#id !== id || !this.#wallet)
      throw Error("Wallet locked while preparing the transaction.");
    reviewed.digest = burnHash(reviewed);
    this.#review = clone(reviewed);
    this.#touch();
    return clone(reviewed);
  }
  async execute(digest) {
    return this.#exclusive(async () => {
      const review = this.#review;
      if (
        !review ||
        review.digest !== digest ||
        Date.now() > review.expires ||
        !this.#wallet ||
        this.#id !== review.id
      )
        throw Error("The exact wallet review expired. Prepare it again.");
      const r = this.#get(review.id);
      if (r.pending || burnHash(r) !== review.recordHash)
        throw Error("Wallet state changed. Review again.");
      const provider = await this.#provider(r);
      if (
        (review.kind !== "sweep" &&
          (await codeSnapshot(provider, r.policy.target)).fingerprint !==
            review.pin) ||
        (await provider.getTransactionCount(r.address, "pending")) !==
          review.nonce
      )
        throw Error("Contract or pending nonce changed. Review again.");
      if (
        review.kind === "sweep" &&
        (await provider.getCode(r.policy.recovery)) !== "0x"
      )
        throw Error(
          "Recovery address now has code. Review recovery separately.",
        );
      const tx = clone(review.transaction);
      await provider.call(tx);
      if (
        (await provider.getBalance(r.address, "pending")) < BigInt(review.worst)
      )
        throw Error("Wallet balance changed.");
      if (review.kind === "mint")
        checkSpend({
          budget: r.policy.budget,
          spent: r.spent,
          value: review.value,
          gas: review.gasLimit,
          fee: review.maxFeePerGas,
          balance: await provider.getBalance(r.address, "pending"),
        });
      if (
        Date.now() > review.expires ||
        this.#id !== review.id ||
        !this.#wallet
      )
        throw Error("Wallet locked or review expired during checks.");
      const version = this.#version,
        signed = await this.#wallet.signTransaction(tx);
      if (
        version !== this.#version ||
        !this.#wallet ||
        this.#id !== review.id ||
        Date.now() > review.expires
      )
        throw Error("Signing was cancelled before broadcast.");
      const parsed = Transaction.from(signed);
      if (parsed.from !== r.address) throw Error("Unexpected signing address.");
      // Reserve BEFORE broadcast. A timeout is not proof that a signed transaction failed.
      r.pending = {
        raw: signed,
        hash: keccak256(signed),
        nonce: review.nonce,
        kind: review.kind,
        value: review.value,
        worst: review.worst,
        created: Date.now(),
        target: review.target,
        data: review.data,
      };
      await this.#save(r);
      this.#review = null;
      this.#touch();
      if (version !== this.#version || !this.#wallet)
        throw Error(
          "Wallet locked after reservation. Check pending status before rebroadcasting.",
        );
      try {
        await provider.broadcastTransaction(signed);
      } catch {
        throw Error(
          "Broadcast status is uncertain. Reservation retained; use Check pending transaction. Do not retry in another wallet.",
        );
      }
      if (version !== this.#version)
        throw Error(
          "Wallet locked after broadcast. Unlock to check the encrypted reservation.",
        );
      return r.pending.hash;
    });
  }
  async checkPending(id) {
    return this.#exclusive(async () => {
      const version = this.#version,
        r = this.#get(id);
      if (!r.pending) return { state: "none" };
      const provider = await this.#provider(r),
        receipt = await provider.getTransactionReceipt(r.pending.hash);
      if (version !== this.#version)
        throw Error("Wallet locked during receipt inspection.");
      if (!receipt) return { state: "pending", hash: r.pending.hash };
      const confirmations = await receipt.confirmations();
      if (version !== this.#version)
        throw Error("Wallet locked during receipt inspection.");
      if (confirmations < 2)
        return { state: "confirming", confirmations, hash: r.pending.hash };
      const paid =
        receipt.gasUsed * receipt.gasPrice +
        (receipt.status === 1 ? BigInt(r.pending.value) : 0n);
      r.spent = String(
        BigInt(r.spent) +
          receipt.gasUsed * receipt.gasPrice +
          (r.pending.kind === "mint" && receipt.status === 1
            ? BigInt(r.pending.value)
            : 0n),
      );
      const { raw, ...pending } = r.pending;
      const discovered = discoverMintedTokens(
        receipt,
        r.policy.target,
        r.address,
      );
      const result = {
        ...pending,
        tokens: discovered,
        status: receipt.status,
        block: receipt.blockNumber,
        paid: String(paid),
        confirmed: Date.now(),
      };
      r.history.push(result);
      r.pending = null;
      await this.#save(r);
      return { state: receipt.status === 1 ? "confirmed" : "reverted", result };
    });
  }
  async rebroadcast(id) {
    return this.#exclusive(async () => {
      const version = this.#version,
        r = this.#get(id),
        pending = r.pending;
      if (!pending?.raw)
        throw Error(
          "No signed payload available. Inspect the pending hash independently.",
        );
      const tx = Transaction.from(pending.raw);
      if (
        keccak256(pending.raw) !== pending.hash ||
        tx.from !== r.address ||
        tx.to !== pending.target ||
        tx.nonce !== pending.nonce ||
        String(tx.chainId) !== r.policy.chainId ||
        String(tx.value) !== pending.value ||
        tx.data !== pending.data
      )
        throw Error("Pending payload does not match its recorded review.");
      const provider = await this.#provider(r);
      if (
        pending.kind !== "sweep" &&
        (await codeSnapshot(provider, r.policy.target)).fingerprint !==
          r.pin.fingerprint
      )
        throw Error(
          "Mint contract changed; do not rebroadcast. Recover the encrypted key in a wallet to cancel or replace the pending nonce.",
        );
      if (await provider.getTransactionReceipt(pending.hash))
        throw Error("A receipt exists. Check its confirmation status.");
      if (version !== this.#version)
        throw Error("Wallet locked before rebroadcast.");
      await provider.broadcastTransaction(pending.raw);
      if (version !== this.#version)
        throw Error(
          "Wallet locked after rebroadcast. Unlock to check the encrypted reservation.",
        );
      return pending.hash;
    });
  }
  async inspect(id, tokenId, standard = "ERC721") {
    const version = this.#version;
    if (!/^\d{1,78}$/.test(String(tokenId)) || BigInt(tokenId) >= 1n << 256n)
      throw Error("Enter an unsigned token ID.");
    if (!["ERC721", "ERC1155"].includes(standard))
      throw Error("Choose ERC-721 or ERC-1155.");
    const r = this.#get(id),
      p = await this.#provider(r),
      block = await p.getBlockNumber(),
      pin = await codeSnapshot(p, r.policy.target);
    let held, balance, approval;
    if (standard === "ERC721") {
      const c = new Contract(
        r.policy.target,
        [
          "function ownerOf(uint256) view returns(address)",
          "function getApproved(uint256) view returns(address)",
        ],
        p,
      );
      held =
        getAddress(await c.ownerOf(tokenId, { blockTag: block })) === r.address;
      balance = held ? "1" : "0";
      try {
        approval = getAddress(
          await c.getApproved(tokenId, { blockTag: block }),
        );
      } catch {
        approval = "unavailable";
      }
    } else {
      const c = new Contract(
        r.policy.target,
        ["function balanceOf(address,uint256) view returns(uint256)"],
        p,
      );
      balance = String(
        await c.balanceOf(r.address, tokenId, { blockTag: block }),
      );
      held = BigInt(balance) > 0n;
      approval = "Operator approvals require a named operator check.";
    }
    if (version !== this.#version)
      throw Error("Wallet locked during NFT inspection.");
    return {
      contract: r.policy.target,
      tokenId: String(tokenId),
      standard,
      block,
      held,
      balance,
      approval,
      codeUnchanged: pin.fingerprint === r.pin.fingerprint,
      metadata:
        "Not fetched. Unknown images, scripts, animation URLs and links remain unopened.",
      scope:
        "Contract-reported state through your RPC. This is not a safety certificate; unknown operator approvals are not exhaustively enumerated.",
    };
  }
  async balance(id) {
    const version = this.#version,
      r = this.#get(id),
      provider = await this.#provider(r),
      balance = await provider.getBalance(r.address, "pending");
    if (version !== this.#version)
      throw Error("Wallet locked during balance inspection.");
    return String(balance);
  }
}
function projectSafeSite(site) {
  return new URL(site).origin;
}

export function discoverMintedTokens(receipt, target, recipient) {
  const iface = new Interface([
    "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
    "event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)",
    "event TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values)",
  ]);
  const found = [];
  for (const log of receipt.logs || []) {
    if (getAddress(log.address) !== getAddress(target)) continue;
    try {
      const event = iface.parseLog(log);
      if (getAddress(event.args.to) !== getAddress(recipient)) continue;
      if (event.name === "Transfer")
        found.push({
          standard: "ERC721",
          tokenId: String(event.args.tokenId),
          amount: "1",
        });
      else if (event.name === "TransferSingle")
        found.push({
          standard: "ERC1155",
          tokenId: String(event.args.id),
          amount: String(event.args.value),
        });
      else
        for (let i = 0; i < event.args.ids.length && found.length < 100; i++)
          found.push({
            standard: "ERC1155",
            tokenId: String(event.args.ids[i]),
            amount: String(event.args[4][i]),
          });
    } catch {}
  }
  return found.slice(0, 100);
}
