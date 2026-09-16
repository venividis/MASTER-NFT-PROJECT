import { recoverResource, resourceSha256 } from "./recover-resource.mjs";
import { PRIVACY_RUNTIME } from "./runtime-integrity.mjs";
export async function verifiedRuntime(url, signal) {
  const response = await fetch(url, {
    credentials:
      new URL(url).origin === location.origin ? "same-origin" : "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    signal,
  });
  if (!response.ok || !response.body)
    throw Error("The privacy runtime could not be downloaded.");
  const reader = response.body.getReader(),
    chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > PRIVACY_RUNTIME.bytes)
        throw Error("Privacy runtime size mismatch.");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  }
  if (length !== PRIVACY_RUNTIME.bytes)
    throw Error("Privacy runtime is incomplete.");
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  const hash = globalThis.crypto?.subtle
    ? Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (v) => v.toString(16).padStart(2, "0"),
      ).join("")
    : resourceSha256(bytes);
  if (hash !== PRIVACY_RUNTIME.sha256)
    throw Error("Privacy runtime integrity check failed.");
  return bytes;
}
export async function privacyRuntimeBytes(settings, { signal, progress } = {}) {
  if (settings.runtimeURL) {
    const url = new URL(settings.runtimeURL);
    if (url.protocol !== "https:" || url.username || url.password)
      throw Error("Use an HTTPS runtime location.");
    return verifiedRuntime(url.href, signal);
  }
  const minted = globalThis.window?.AWE_CHAIN_IDENTITY;
  if (minted) {
    if (!minted.privacyResource)
      throw Error(
        "This older edition has no archived privacy worker. Set an explicitly chosen, verified HTTPS mirror.",
      );
    const request =
      window.AWE_CHAIN_RPC ||
      (window.ethereum?.request ? (p) => window.ethereum.request(p) : null);
    if (!request)
      throw Error(
        "Recover this edition with a read-only RPC for its home chain " +
          minted.chainId +
          ".",
      );
    return recoverResource(
      request,
      {
        resource: minted.privacyResource,
        chainId: minted.chainId,
        sha256: PRIVACY_RUNTIME.sha256,
        byteLength: PRIVACY_RUNTIME.bytes,
      },
      { signal, progress },
    );
  }
  if (!/^https?:$/.test(location.protocol))
    throw Error(
      "Open the minted NFT loader to recover its onchain privacy worker.",
    );
  return verifiedRuntime(
    new URL(PRIVACY_RUNTIME.path, new URL(".", location.href)).href,
    signal,
  );
}
export class PrivacyBridge {
  constructor(event = () => {}) {
    this.event = event;
    this.pending = new Map();
    this.sequence = 0;
    this.generation = 0;
    this.worker = null;
    this.info = null;
  }
  async start(data) {
    this.lock();
    const generation = this.generation;
    this.abort = new AbortController();
    const bytes = await privacyRuntimeBytes(data.settings, {
      signal: this.abort.signal,
      progress: (p) => this.event({ type: "runtime-recovery", ...p }),
    });
    if (generation !== this.generation) throw Error("Wallet locked.");
    const objectURL = URL.createObjectURL(
      new Blob([bytes], { type: "text/javascript" }),
    );
    this.objectURL = objectURL;
    const worker = new Worker(objectURL);
    this.worker = worker;
    worker.onmessage = async ({ data }) => {
      if (generation !== this.generation) return;
      if (data.ready) {
        URL.revokeObjectURL(objectURL);
        return;
      }
      if (data.event) {
        try {
          await this.event(data.event);
          if (data.eventId && generation === this.generation)
            worker.postMessage({
              persistenceAck: true,
              eventId: data.eventId,
              ok: true,
            });
        } catch {
          if (data.eventId && generation === this.generation)
            worker.postMessage({
              persistenceAck: true,
              eventId: data.eventId,
              ok: false,
            });
          this.event({
            type: "error",
            message:
              "Private submission recovery could not be saved. Keep this wallet locked against new orders until reconciled.",
          });
        }
        return;
      }
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      data.error ? p.reject(Error(data.error)) : p.resolve(data.result);
    };
    worker.onerror = () => {
      if (generation !== this.generation) return;
      this.lock();
      this.event({
        type: "error",
        message: "The privacy worker stopped. Unlock to try again.",
      });
    };
    const info = await this.call("initialize", data);
    if (generation !== this.generation) throw Error("Wallet locked.");
    this.info = info;
    return info;
  }
  call(method, params) {
    if (!this.worker)
      return Promise.reject(
        Error("Unlock and start the private wallet first."),
      );
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, method, params });
    });
  }
  invalidate() {
    if (this.worker) this.call("invalidate").catch(() => {});
  }
  lock() {
    this.generation++;
    this.abort?.abort();
    this.worker?.terminate();
    this.worker = null;
    this.info = null;
    if (this.objectURL) URL.revokeObjectURL(this.objectURL);
    this.objectURL = null;
    for (const p of this.pending.values())
      p.reject(Error("The private wallet was locked."));
    this.pending.clear();
  }
}
