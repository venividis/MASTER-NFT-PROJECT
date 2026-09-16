const SCHEMA = "anima.encrypted-private-wallet/1",
  ITERATIONS = 600000;
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
const b64 = (bytes) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 16384)
    out += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(out);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function validate(envelope) {
  if (
    !envelope ||
    envelope.schema !== SCHEMA ||
    envelope.kdf !== "PBKDF2-SHA256" ||
    envelope.iterations !== ITERATIONS ||
    envelope.cipher !== "AES-256-GCM"
  )
    throw Error("Unsupported encrypted backup.");
  for (const field of ["salt", "iv", "ciphertext"])
    if (
      typeof envelope[field] !== "string" ||
      envelope[field].length > 14000000 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(envelope[field])
    )
      throw Error("Invalid encrypted backup.");
  if (
    unb64(envelope.salt).length !== 32 ||
    unb64(envelope.iv).length !== 12 ||
    unb64(envelope.ciphertext).length < 16
  )
    throw Error("Invalid encrypted backup.");
  return envelope;
}
async function derive(password, salt) {
  if (
    typeof password !== "string" ||
    password.length < 16 ||
    password.length > 1024
  )
    throw Error("Use a password of 16–1024 characters.");
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function sealPrivateData(data, password) {
  const salt = crypto.getRandomValues(new Uint8Array(32)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password, salt);
  return { key, envelope: await sealWithKey(data, key, salt, iv) };
}
async function sealWithKey(
  data,
  key,
  salt,
  iv = crypto.getRandomValues(new Uint8Array(12)),
) {
  const bytes = encoder.encode(JSON.stringify(data));
  if (bytes.length > 10485760) throw Error("Private data exceeds 10 MiB.");
  try {
    return {
      schema: SCHEMA,
      kdf: "PBKDF2-SHA256",
      iterations: ITERATIONS,
      cipher: "AES-256-GCM",
      salt: b64(salt),
      iv: b64(iv),
      ciphertext: b64(
        new Uint8Array(
          await crypto.subtle.encrypt(
            { name: "AES-GCM", iv, additionalData: encoder.encode(SCHEMA) },
            key,
            bytes,
          ),
        ),
      ),
    };
  } finally {
    bytes.fill(0);
  }
}
export async function openSealedData(envelope, password) {
  validate(envelope);
  const key = await derive(password, unb64(envelope.salt));
  return { key, data: await openDataWithKey(envelope, key) };
}
async function openDataWithKey(envelope, key) {
  validate(envelope);
  let bytes;
  try {
    bytes = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: unb64(envelope.iv),
          additionalData: encoder.encode(SCHEMA),
        },
        key,
        unb64(envelope.ciphertext),
      ),
    );
    const data = JSON.parse(decoder.decode(bytes));
    if (!data || typeof data !== "object") throw Error();
    return data;
  } catch {
    throw Error(
      "The password is incorrect or the encrypted backup was changed.",
    );
  } finally {
    bytes?.fill(0);
  }
}
/** Reuse the authenticated envelope without storing a password in the session. */
export function resealData(data, key, envelope) {
  validate(envelope);
  return sealWithKey(data, key, unb64(envelope.salt));
}
export async function openPrivateData(envelope, password) {
  const opened = await openSealedData(envelope, password),
    { data } = opened;
  if (
    typeof data.mnemonic !== "string" ||
    !data.settings ||
    !Array.isArray(data.drafts)
  )
    throw Error("Unsupported private-wallet data.");
  return opened;
}
export class PrivateVault {
  constructor(storage, { locks = globalThis.navigator?.locks } = {}) {
    if (storage === undefined) {
      try {
        storage = globalThis.localStorage;
      } catch {
        storage = null;
      }
    }
    this.storage = storage;
    this.locks = locks;
    this.revision = null;
    this.storageKey = "anima:private-vault:v1";
    this.key = null;
    this.data = null;
    this.envelope = null;
    this.generation = 0;
    this.writes = Promise.resolve();
  }
  get exists() {
    return !!this.storage?.getItem(this.storageKey);
  }
  async create(data, password) {
    if (!this.storage || !crypto.subtle)
      throw Error(
        "Private wallets require secure browser storage and native encryption. Open the HTTPS app or a local secure origin.",
      );
    if (this.exists)
      throw Error(
        "An encrypted wallet already exists. Unlock it or restore a backup in a separate browser profile.",
      );
    const generation = ++this.generation;
    const sealed = await sealPrivateData(data, password);
    if (generation !== this.generation)
      throw Error("Wallet locked during creation.");
    const commit = () => {
      if (this.exists)
        throw Error(
          "An encrypted wallet was created in another tab. Unlock it or restore separately.",
        );
      if (generation !== this.generation)
        throw Error("Wallet locked during creation.");
      this.storage.setItem(this.storageKey, JSON.stringify(sealed.envelope));
    };
    if (this.locks?.request) await this.locks.request(this.storageKey, commit);
    else commit();
    if (generation !== this.generation)
      throw Error("Wallet locked during creation.");
    this.key = sealed.key;
    this.envelope = sealed.envelope;
    this.revision = JSON.stringify(sealed.envelope);
    this.data = structuredClone(data);
  }
  async unlock(password) {
    const generation = ++this.generation;
    await this.writes;
    if (generation !== this.generation)
      throw Error("Wallet locked during decryption.");
    const envelope = validate(
      JSON.parse(this.storage.getItem(this.storageKey) || "null"),
    );
    const { key, data } = await openPrivateData(envelope, password);
    if (generation !== this.generation)
      throw Error("Wallet locked during decryption.");
    this.key = key;
    this.data = data;
    this.envelope = envelope;
    this.revision = JSON.stringify(envelope);
    return data;
  }
  reserveSubmission(pending) {
    if (!this.locks?.request)
      throw Error(
        "This browser needs Web Locks to serialize private submissions.",
      );
    if (!this.data || !this.key)
      throw Error("Unlock the private wallet first.");
    if (this.data.pending)
      throw Error("A private submission is already reserved.");
    this.data.pending = structuredClone(pending);
    return this.save();
  }
  save({ completeAfterLock = false } = {}) {
    if (!this.key || !this.data)
      throw Error("Unlock the private wallet first.");
    const generation = this.generation,
      key = this.key,
      salt = unb64(this.envelope.salt),
      data = structuredClone(this.data),
      expected = this.revision;
    const save = async () => {
      if (this.storage.getItem(this.storageKey) !== expected)
        throw Error(
          "Private wallet changed since this edit. Unlock again and reconcile its pending submission.",
        );
      const next = await sealWithKey(data, key, salt);
      if (!completeAfterLock && generation !== this.generation)
        throw Error("Wallet locked before changes were saved.");
      if (this.storage.getItem(this.storageKey) !== expected)
        throw Error(
          "Private wallet changed since this edit. Unlock again and reconcile its pending submission.",
        );
      const serialized = JSON.stringify(next);
      this.storage.setItem(this.storageKey, serialized);
      this.revision = serialized;
      // A receipt already being encrypted may finish after lock; it must never reopen the session.
      if (generation === this.generation && this.key === key)
        this.envelope = next;
    };
    const run = () =>
      this.locks?.request ? this.locks.request(this.storageKey, save) : save();
    const task = this.writes.then(run, run);
    this.writes = task.catch(() => {});
    return task;
  }
  /** Merge observed receipt facts into the newest authenticated record, even after local lock. */
  updateReceipt(mutator) {
    if (!this.key || !this.data)
      throw Error("Unlock the private wallet first.");
    const key = this.key,
      salt = this.envelope.salt,
      generation = this.generation;
    const merge = async () => {
      const original = this.storage.getItem(this.storageKey),
        envelope = validate(JSON.parse(original || "null"));
      if (envelope.salt !== salt)
        throw Error(
          "Private wallet encryption identity changed. Preserve the original submission backup.",
        );
      const latest = await openDataWithKey(envelope, key);
      if (
        typeof latest.mnemonic !== "string" ||
        !latest.settings ||
        !Array.isArray(latest.drafts)
      )
        throw Error("Unsupported private-wallet data.");
      const data = mutator(latest),
        next = await sealWithKey(data, key, unb64(salt));
      if (this.storage.getItem(this.storageKey) !== original)
        throw Error(
          "Private wallet changed during receipt persistence. Reconcile the original transaction.",
        );
      const serialized = JSON.stringify(next);
      this.storage.setItem(this.storageKey, serialized);
      this.revision = serialized;
      if (generation === this.generation && this.key === key) {
        this.envelope = next;
        this.data = data;
      }
    };
    const run = () =>
      this.locks?.request
        ? this.locks.request(this.storageKey, merge)
        : merge();
    const task = this.writes.then(run, run);
    this.writes = task.catch(() => {});
    return task;
  }
  async importBackup(raw, password) {
    if (this.exists)
      throw Error(
        "Restore into an empty browser profile to preserve your existing wallet.",
      );
    if (typeof raw !== "string" || raw.length > 14000000)
      throw Error("Invalid encrypted backup size.");
    const envelope = validate(JSON.parse(raw));
    const generation = ++this.generation;
    const { key, data } = await openPrivateData(envelope, password);
    if (generation !== this.generation)
      throw Error("Wallet locked during restore.");
    const commit = () => {
      if (this.exists)
        throw Error(
          "An encrypted wallet was created in another tab. Restore separately.",
        );
      if (generation !== this.generation)
        throw Error("Wallet locked during restore.");
      this.storage.setItem(this.storageKey, JSON.stringify(envelope));
    };
    if (this.locks?.request) await this.locks.request(this.storageKey, commit);
    else commit();
    if (generation !== this.generation)
      throw Error("Wallet locked during restore.");
    this.envelope = envelope;
    this.revision = JSON.stringify(envelope);
    this.key = key;
    this.data = data;
  }
  exportBackup() {
    const value = this.storage.getItem(this.storageKey);
    if (!value) throw Error("No encrypted backup is available.");
    validate(JSON.parse(value));
    return value;
  }
  lock() {
    this.generation++;
    this.key = null;
    this.data = null;
    this.envelope = null;
  }
}
