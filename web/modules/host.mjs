/** Permission boundary for isolated module runtimes. This file has no wallet or RPC imports. */
export const HOST_API = 'anima.host/1';
export const HOST_LIMITS = Object.freeze({ requestBytes: 16_384, packageBytes: 65_536, stateBytes: 65_536, requests: 512, concurrent: 4, keys: 64, valueDepth: 12, reviewMs: 180_000 });
const encoder = new TextEncoder();
const address = /^0x[0-9a-f]{40}$/i;
const hash = /^0x[0-9a-f]{64}$/i;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
export function boundedJSON(value, maxBytes = HOST_LIMITS.requestBytes, depth = 0) {
  if (depth > HOST_LIMITS.valueDepth) throw Error('Module data is nested too deeply.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    if (typeof value === 'string' && value.length > maxBytes) throw Error('Module data exceeds its byte limit.');
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error('Module data must contain finite numbers.');
  } else if (Array.isArray(value)) {
    if (value.length > 1024) throw Error('Module array exceeds its item limit.');
    for (const item of value) boundedJSON(item, maxBytes, depth + 1);
  } else if (plain(value)) {
    const keys = Object.keys(value);
    if (keys.length > 256 || keys.some(key => forbidden.has(key))) throw Error('Unsafe module object key.');
    for (const key of keys) boundedJSON(value[key], maxBytes, depth + 1);
  } else throw Error('Module data must be plain JSON.');
  const text = JSON.stringify(value);
  if (encoder.encode(text).length > maxBytes) throw Error('Module data exceeds its byte limit.');
  return JSON.parse(text);
}
const exact = (value, keys) => {
  if (!plain(value) || Object.keys(value).some(key => !keys.includes(key))) throw Error('Unexpected module request fields.');
};
const lower = value => String(value).toLowerCase();
export function identityKey(identity) {
  if (!identity || !address.test(identity.collection) || !address.test(identity.account) || !address.test(identity.registry) || !address.test(identity.owner)) throw Error('Invalid NFT host identity.');
  for (const key of ['chainId', 'tokenId', 'epoch']) if (!/^\d+$/.test(String(identity[key]))) throw Error('Invalid NFT identity number.');
  return [String(identity.chainId), lower(identity.collection), String(identity.tokenId), lower(identity.account), lower(identity.registry)].join(':');
}
export function sameAuthority(a, b) {
  try { return identityKey(a) === identityKey(b) && lower(a.owner) === lower(b.owner) && String(a.epoch) === String(b.epoch); } catch { return false; }
}
export function stateNamespace(identity, moduleKey, stateSchema) {
  if (!hash.test(moduleKey) || !hash.test(stateSchema)) throw Error('Invalid module state identity.');
  return ['anima:module-state:1', identityKey(identity), lower(moduleKey), lower(stateSchema)].join(':');
}
export function normalizeProposal(input) {
  exact(input, ['to', 'value', 'data', 'description']);
  if (!address.test(input.to) || /^0x0{40}$/i.test(input.to)) throw Error('A proposal needs an exact nonzero destination.');
  if (!/^\d{1,78}$/.test(String(input.value ?? '0')) || BigInt(input.value ?? '0') >= 2n ** 256n) throw Error('Proposal value must be uint256 wei.');
  if (!/^0x(?:[0-9a-f]{2}){0,4096}$/i.test(input.data ?? '0x')) throw Error('Proposal calldata exceeds 4096 bytes or is malformed.');
  if (typeof input.description !== 'string' || !input.description.trim() || encoder.encode(input.description).length > 240) throw Error('A proposal needs a short description.');
  return Object.freeze({ to: lower(input.to), value: BigInt(input.value ?? '0').toString(), data: lower(input.data ?? '0x'), description: input.description });
}
/** Local drafts are bound by host-owned keys; a frame never supplies its namespace. */
export class ModuleState {
  constructor({ storage, identity, moduleKey, stateSchema, maxBytes = HOST_LIMITS.stateBytes }) {
    if (!storage?.getItem || !storage?.setItem) throw Error('Persistent browser storage is unavailable.');
    this.storage = storage; this.namespace = stateNamespace(identity, moduleKey, stateSchema);
    if (!Number.isSafeInteger(Number(maxBytes)) || Number(maxBytes) < 0) throw Error('Invalid state resource limit.');
    this.maxBytes = Math.min(HOST_LIMITS.stateBytes, Number(maxBytes));
  }
  read() {
    const text = this.storage.getItem(this.namespace);
    if (text === null) return {};
    if (encoder.encode(text).length > this.maxBytes + 1024) throw Error('Stored module draft exceeds its limit.');
    const record = JSON.parse(text);
    if (record.schema !== 'anima.module-state/1' || record.namespace !== this.namespace) throw Error('Stored module draft identity does not match.');
    const value = boundedJSON(record.value, this.maxBytes);
    if (!plain(value) || Object.keys(value).length > HOST_LIMITS.keys) throw Error('Invalid module draft.');
    return value;
  }
  replace(value) {
    const copy = boundedJSON(value, this.maxBytes);
    if (!plain(copy) || Object.keys(copy).length > HOST_LIMITS.keys) throw Error('A module draft needs at most 64 named values.');
    this.storage.setItem(this.namespace, JSON.stringify({ schema: 'anima.module-state/1', namespace: this.namespace, value: copy }));
    return copy;
  }
  get(key) { this.assertKey(key); return this.read()[key] ?? null; }
  set(key, value) { this.assertKey(key); const state = this.read(); state[key] = boundedJSON(value, this.maxBytes); this.replace(state); return { saved: true, persistence: 'browser-draft' }; }
  assertKey(key) { if (typeof key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(key) || forbidden.has(key)) throw Error('Invalid state key.'); }
}
export function previewMigration({ source, destination, value }) {
  const before = source.read(), after = boundedJSON(value, destination.maxBytes);
  if (!plain(after)) throw Error('Migration output must be a plain JSON object.');
  return Object.freeze({ schema: 'anima.state-migration-preview/1', from: source.namespace, to: destination.namespace, before, after, sourceJSON: JSON.stringify(before), destinationJSON: JSON.stringify(destination.read()), afterJSON: JSON.stringify(after), changedKeys: [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])) });
}
export function commitMigration(preview, source, destination) {
  if (preview.from !== source.namespace || preview.to !== destination.namespace || preview.sourceJSON !== JSON.stringify(source.read()) || preview.destinationJSON !== JSON.stringify(destination.read()) || preview.afterJSON !== JSON.stringify(preview.after)) throw Error('Module state changed after the migration preview. Preview again.');
  destination.replace(preview.after); return { committed: true, persistence: 'browser-draft', retainedSource: source.namespace !== destination.namespace };
}
/** Every request is authorized afresh. onProposal/onJournal create a review, never send. */
export class ModuleHostSession {
  constructor({ identity, releaseId, moduleKey, manifest, files = [], dependencies = [], storage, verifyContext, onProposal, onJournal, onState, now = () => Date.now() }) {
    identityKey(identity);
    if (!hash.test(releaseId) || !hash.test(moduleKey) || !hash.test(manifest?.stateSchema)) throw Error('Invalid release or module identity.');
    if (!Array.isArray(manifest.capabilities)) throw Error('Module capability manifest is missing.');
    this.identity = Object.freeze({ ...identity }); this.releaseId = lower(releaseId); this.moduleKey = lower(moduleKey);
    this.capabilities = new Set(manifest.capabilities); this.verifyContext = verifyContext;
    this.packages = new Map([[lower(releaseId), files], ...dependencies.map(item => [lower(item.releaseId), item.files])]);
    this.state = new ModuleState({ storage, identity, moduleKey, stateSchema: manifest.stateSchema, maxBytes: manifest.resources?.maxStateBytes });
    this.onProposal = onProposal; this.onJournal = onJournal; this.onState = onState; this.now = now;
    this.closed = false; this.generation = 0; this.requests = 0; this.inflight = 0; this.seen = new Set(); this.cleanups = new Set(); this.pendingProposal = false;
  }
  async fresh(generation = this.generation) {
    if (this.closed || generation !== this.generation) throw Error('Module session is closed.');
    const current = await this.verifyContext(this.identity, this.releaseId, this.moduleKey);
    if (this.closed || generation !== this.generation || !sameAuthority(this.identity, current)) { this.close(); throw Error('NFT ownership, custody epoch or module installation changed. Reopen the module.'); }
  }
  async handle(message) {
    if (this.closed) throw Error('Module session is closed.');
    exact(message, ['id', 'method', 'params']); boundedJSON(message);
    if (typeof message.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(message.id) || this.seen.has(message.id)) throw Error('Invalid or replayed module request ID.');
    if (++this.requests > HOST_LIMITS.requests || this.inflight >= HOST_LIMITS.concurrent) { this.close(); throw Error('Module request budget exceeded.'); }
    this.seen.add(message.id); this.inflight++; const generation = this.generation;
    try {
      const methods = { 'identity.read': 'identity.read', 'module.read': 'identity.read', 'package.read': 'identity.read', 'state.get': 'state.read', 'state.set': 'state.write', 'transaction.propose': 'transaction.propose', 'journal.propose': 'journal.propose' };
      const capability = methods[message.method];
      if (!capability || !this.capabilities.has(capability)) throw Error('This module has no permission for ' + String(message.method).slice(0,80) + '.');
      await this.fresh(generation);
      const p = message.params ?? {};
      if (message.method === 'identity.read') { exact(p, []); return boundedJSON(this.identity); }
      if (message.method === 'module.read') { exact(p, []); return { releaseId: this.releaseId, moduleKey: this.moduleKey, capabilities: [...this.capabilities], dependencies: [...this.packages.keys()].filter(id => id !== this.releaseId) }; }
      if (message.method === 'package.read') {
        exact(p, ['releaseId', 'path']);
        if (!hash.test(p.releaseId) || typeof p.path !== 'string' || !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(p.path) || p.path.split('/').some(part => part === '.' || part === '..')) throw Error('Invalid immutable package reference.');
        const file = this.packages.get(lower(p.releaseId))?.find(file => file.path === p.path);
        if (!file) throw Error('That file is outside this verified dependency closure.');
        if (!(file.bytes instanceof Uint8Array) || file.bytes.length > HOST_LIMITS.packageBytes) throw Error('Package read exceeds its 64 KiB limit.');
        let binary = ''; for (let offset = 0; offset < file.bytes.length; offset += 8192) binary += String.fromCharCode(...file.bytes.subarray(offset, offset + 8192));
        return { releaseId: lower(p.releaseId), path: file.path, mime: file.mime, base64: btoa(binary), bytes: file.bytes.length };
      }
      if (message.method === 'state.get') { exact(p, ['key']); return this.state.get(p.key); }
      if (message.method === 'state.set') { exact(p, ['key', 'value']); const saved = this.state.set(p.key, p.value); this.onState?.(); return saved; }
      if (this.pendingProposal) throw Error('This module already has a transaction awaiting review.');
      this.pendingProposal = true;
      try {
        let result;
        if (message.method === 'transaction.propose') result = await this.onProposal(normalizeProposal(p), { identity: this.identity, releaseId: this.releaseId, moduleKey: this.moduleKey });
        else {
          exact(p, ['text']); if (typeof p.text !== 'string' || !p.text.trim() || encoder.encode(p.text).length > 4096) throw Error('Journal text must contain 1–4096 bytes.');
          result = await this.onJournal({ text: p.text }, { identity: this.identity, releaseId: this.releaseId });
        }
        await this.fresh(generation);
        return boundedJSON(result ?? { queued: true, sent: false });
      } finally { this.pendingProposal = false; }
    } finally { this.inflight--; }
  }
  attachPort(port) {
    if (this.closed) throw Error('Module session is closed.');
    let pending = Promise.resolve(), queued = 0;
    port.onmessage = event => {
      // Serialize the transport; the finite budget also closes spammy sessions.
      if (++queued > HOST_LIMITS.concurrent) { this.close(); return; }
      const message = event.data;
      pending = pending.then(async () => {
        try { const result = await this.handle(message); if (!this.closed) port.postMessage({ id: message.id, ok: true, result }); }
        catch (error) { if (!this.closed) port.postMessage({ id: typeof message?.id === 'string' ? message.id.slice(0,64) : null, ok: false, error: String(error.message).slice(0,240) }); }
        finally { queued--; }
      });
    };
    port.start?.(); this.cleanups.add(() => { port.onmessage = null; port.close(); });
  }
  close() { if (this.closed) return; this.closed = true; this.generation++; for (const cleanup of this.cleanups) { try { cleanup(); } catch {} } this.cleanups.clear(); }
}
/** The only object allowed to commit a reviewed host transaction. Single-use even on rejection. */
export class ReviewedAction {
  constructor({ verifyContext, prepare, send, cancel = () => {}, now = () => Date.now() }) { Object.assign(this, { verifyContext, prepare, send, cancel, now }); this.pending = null; this.revision = 0; }
  invalidate() { this.pending = null; this.revision++; this.cancel(); }
  async review(intent, identity) {
    this.invalidate(); const revision = this.revision;
    const current = await this.verifyContext(identity);
    if (!sameAuthority(identity, current)) throw Error('NFT custody changed before review.');
    const prepared = await this.prepare(intent);
    if (revision !== this.revision || !sameAuthority(identity, await this.verifyContext(identity))) { this.invalidate(); throw Error('NFT or review changed during preparation.'); }
    this.pending = Object.freeze({ intent: boundedJSON(intent), identity: Object.freeze({ ...identity }), prepared, createdAt: this.now(), revision });
    return this.pending;
  }
  async confirm() {
    const pending = this.pending; this.pending = null;
    if (!pending || pending.revision !== this.revision || this.now() - pending.createdAt > HOST_LIMITS.reviewMs) { this.cancel(); throw Error('This review expired or has already been used.'); }
    try { if (!sameAuthority(pending.identity, await this.verifyContext(pending.identity))) throw Error('NFT custody changed after review.'); return await this.send(pending.prepared, pending.intent); }
    catch (error) { this.cancel(); throw error; }
  }
}
