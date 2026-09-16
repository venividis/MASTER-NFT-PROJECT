import { hex, bytes, wipe } from "./mls-protocol.mjs";
const te = new TextEncoder(),
  td = new TextDecoder();
/** One encrypted current ratchet snapshot; CAS prevents two browser tabs from reusing a generation. */
export class MlsStateStore {
  async db() {
    if (!this.promise)
      this.promise = new Promise((resolve, reject) => {
        const r = indexedDB.open("anima-mls-v1", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("vaults");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    return this.promise;
  }
  async read(id) {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("vaults", "readonly"),
        r = tx.objectStore("vaults").get(id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  }
  async compareAndSet(id, version, record) {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("vaults", "readwrite"),
        s = tx.objectStore("vaults"),
        r = s.get(id);
      r.onsuccess = () => {
        if ((r.result?.version || 0) !== version) {
          tx.abort();
          return;
        }
        s.put(record, id);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(
          Error(
            "Another tab advanced this conversation. Lock and reopen its current state before continuing.",
          ),
        );
      tx.onerror = () => reject(tx.error);
    });
  }
}
export class MlsVault {
  constructor(id, { store = new MlsStateStore() } = {}) {
    this.id = id;
    this.store = store;
    this.revision = 0;
    this.version = 0;
    this.key = null;
    this.data = null;
  }
  lock() {
    this.revision++;
    this.key = null;
    wipe(this.data);
    if (this.data) {
      for (const group of Object.values(this.data.groups || {})) {
        group.state = null;
        group.history = [];
      }
      this.data.keyPackage = null;
      this.data.pending = null;
      this.data.groups = {};
    }
    this.data = null;
  }
  async derive(pass, salt) {
    if (typeof pass !== "string" || pass.length < 16)
      throw Error("Use a passphrase of at least 16 characters.");
    const material = await crypto.subtle.importKey(
      "raw",
      te.encode(pass),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: 600000 },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }
  aad() {
    return te.encode(JSON.stringify(["anima.mls.vault/1", this.id]));
  }
  async unlock(pass, backup) {
    this.lock();
    const revision = this.revision,
      stored = await this.store.read(this.id),
      record = backup || stored,
      salt = record
        ? bytes(record.salt)
        : crypto.getRandomValues(new Uint8Array(32));
    if (
      record &&
      (record.schema !== "anima.mls.vault/1" ||
        record.id !== this.id ||
        salt.length !== 32 ||
        bytes(record.iv).length !== 12 ||
        bytes(record.ciphertext).length > 4 * 1024 * 1024)
    )
      throw Error("Invalid MLS vault or different wallet/network/contract.");
    const key = await this.derive(pass, salt);
    let data = {
      groups: {},
      keyPackage: null,
      pending: null,
      retainHistory: false,
    };
    if (record) {
      const plain = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: bytes(record.iv), additionalData: this.aad() },
          key,
          bytes(record.ciphertext),
        ),
      );
      try {
        data = JSON.parse(td.decode(plain));
      } finally {
        wipe(plain);
      }
    }
    if (revision !== this.revision)
      throw Error("Unlock cancelled by privacy lock.");
    this.key = key;
    this.salt = salt;
    this.version = stored?.version || 0;
    this.data = data;
    if (!stored || backup) await this.save(data);
    return data;
  }
  async save(data) {
    if (!this.key) throw Error("Unlock MLS state first.");
    const revision = this.revision,
      key = this.key,
      version = this.version,
      iv = crypto.getRandomValues(new Uint8Array(12)),
      plain = te.encode(JSON.stringify(data));
    if (plain.length > 3 * 1024 * 1024) {
      wipe(plain);
      this.lock();
      throw Error(
        "Encrypted conversation state exceeds the recoverable device limit. Restore the current backup and clear retained transcripts before continuing.",
      );
    }
    let cipher;
    try {
      cipher = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: this.aad() },
          key,
          plain,
        ),
      );
    } finally {
      wipe(plain);
    }
    if (revision !== this.revision || key !== this.key)
      throw Error("State write cancelled by privacy lock.");
    const record = {
      schema: "anima.mls.vault/1",
      id: this.id,
      version: version + 1,
      salt: hex(this.salt),
      iv: hex(iv),
      ciphertext: hex(cipher),
    };
    try {
      await this.store.compareAndSet(this.id, version, record);
    } catch (error) {
      this.lock();
      throw error;
    }
    if (revision !== this.revision) throw Error("Private state locked.");
    this.version = version + 1;
    this.data = data;
    return record;
  }
  async backup() {
    if (!this.key) throw Error("Unlock MLS state first.");
    return this.store.read(this.id);
  }
}
