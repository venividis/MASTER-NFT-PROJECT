/** AWE cartridge RPC v1. No wallet/provider object or secret crosses this bridge. */
export const PROTOCOL = "awe.cartridge.rpc/1";
const MAX_BYTES = 64 * 1024;
const MAX_PENDING = 8;

function checkOrigin(origin) {
  if (typeof origin !== "string") throw new Error("An exact origin is required");
  const url = new URL(origin);
  if (!["https:", "http:"].includes(url.protocol) || url.origin !== origin) throw new Error("Use an exact HTTP(S) origin; opaque origins are unsupported");
  return origin;
}
function isMessage(data, kind) { return !!data && typeof data === "object" && data.protocol === PROTOCOL && data.kind === kind; }
function fitsJson(value) {
  try { return new TextEncoder().encode(JSON.stringify(value)).length <= MAX_BYTES; } catch { return false; }
}
function token() { return globalThis.crypto.randomUUID(); }
function errorText(error) { return error instanceof Error ? error.message.slice(0, 512) : "Request failed"; }

/**
 * handlers is the owner's explicit grant list, not the manifest's requested list.
 * Serve cartridge code from a dedicated origin. A same-origin untrusted iframe can
 * otherwise bypass messaging and access its parent directly.
 */
export function createHostBridge({ iframe, expectedOrigin, handlers, window: hostWindow = globalThis.window, onReady = () => {}, timeoutMs = 10000, trustedSameOrigin = false }) {
  checkOrigin(expectedOrigin);
  if (expectedOrigin === hostWindow?.location?.origin && !trustedSameOrigin) throw new Error("Untrusted cartridges need a dedicated origin; same-origin content requires explicit trust");
  const methods = new Map(Object.entries(handlers));
  for (const [method, handler] of methods) if (typeof handler !== "function" || method.length > 128) throw new Error("Invalid handler grant");
  let session = "";
  let nonce = "";
  let state = "idle";
  let port = null;
  let sequence = 0;
  let inflight = 0;
  let timer;
  let abort = new AbortController();
  let disposed = false;

  function closeSession() {
    clearTimeout(timer);
    abort.abort();
    abort = new AbortController();
    port?.close();
    port = null;
    sequence = 0;
    inflight = 0;
    state = "idle";
  }
  function start() {
    if (disposed) throw new Error("Bridge is disposed");
    closeSession();
    session = token(); nonce = token(); state = "hello";
    iframe.contentWindow?.postMessage({ protocol: PROTOCOL, kind: "hello", session, nonce }, expectedOrigin);
    timer = setTimeout(closeSession, timeoutMs);
  }
  function onWindowMessage(event) {
    if (disposed || state !== "hello" || event.source !== iframe.contentWindow || event.origin !== expectedOrigin) return;
    const message = event.data;
    if (!isMessage(message, "ready") || message.session !== session || message.nonce !== nonce) return;
    state = "connecting";
    const channel = new MessageChannel();
    port = channel.port1;
    const activePort = port;
    const activeSession = session;
    const activeSignal = abort.signal;
    activePort.onmessage = async ({ data }) => {
      if (disposed || activePort !== port || data?.session !== activeSession || data?.protocol !== PROTOCOL) return;
      if (state === "connecting" && isMessage(data, "connected") && data.nonce === nonce) {
        state = "connected"; clearTimeout(timer); onReady({ session: activeSession, methods: [...methods.keys()] }); return;
      }
      if (state !== "connected" || !isMessage(data, "request") || !fitsJson(data)) return;
      if (!Number.isSafeInteger(data.sequence) || data.sequence !== sequence + 1 || typeof data.id !== "string" || data.id.length > 128 || typeof data.method !== "string") return;
      sequence = data.sequence;
      const reply = (ok, value) => {
        if (activePort !== port || activeSignal.aborted) return;
        const response = { protocol: PROTOCOL, kind: "response", session: activeSession, sequence: data.sequence, id: data.id, ok, ...(ok ? { result: value } : { error: value }) };
        if (fitsJson(response)) activePort.postMessage(response);
        else activePort.postMessage({ protocol: PROTOCOL, kind: "response", session: activeSession, sequence: data.sequence, id: data.id, ok: false, error: "Response exceeds JSON message budget" });
      };
      const handler = methods.get(data.method);
      if (!handler) { reply(false, "Method has not been granted by the owner"); return; }
      if (inflight >= MAX_PENDING) { reply(false, "Too many pending requests"); return; }
      inflight++;
      try { reply(true, await handler(data.params, { session: activeSession, signal: activeSignal })); }
      catch (error) { reply(false, errorText(error)); }
      finally { if (activePort === port) inflight--; }
    };
    activePort.start();
    iframe.contentWindow.postMessage({ protocol: PROTOCOL, kind: "connect", session, nonce, methods: [...methods.keys()] }, expectedOrigin, [channel.port2]);
  }
  hostWindow.addEventListener("message", onWindowMessage);
  iframe.addEventListener("load", start);
  return {
    start,
    get connected() { return state === "connected"; },
    close() {
      disposed = true; closeSession();
      hostWindow.removeEventListener("message", onWindowMessage);
      iframe.removeEventListener("load", start);
    }
  };
}

export function connectCartridge({ expectedParentOrigin, window: gameWindow = globalThis.window, timeoutMs = 10000 }) {
  checkOrigin(expectedParentOrigin);
  if (!gameWindow || gameWindow.parent === gameWindow) return Promise.reject(new Error("Cartridge must run inside its configured host"));
  return new Promise((resolve, reject) => {
    let session = "";
    let nonce = "";
    let port = null;
    let sequence = 0;
    let state = "waiting";
    const pending = new Map();
    const timer = setTimeout(() => close(new Error("Host handshake timed out")), timeoutMs);
    function close(error = new Error("Cartridge bridge closed")) {
      if (state === "closed") return;
      state = "closed"; clearTimeout(timer); port?.close();
      gameWindow.removeEventListener("message", onWindowMessage);
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
      pending.clear(); reject(error);
    }
    function onWindowMessage(event) {
      if (event.source !== gameWindow.parent || event.origin !== expectedParentOrigin || state === "closed") return;
      const data = event.data;
      if (isMessage(data, "hello") && typeof data.session === "string" && data.session.length <= 128 && typeof data.nonce === "string" && data.nonce.length <= 128) {
        if (state === "connected") { close(new Error("Host started a new session; reconnect cartridge")); return; }
        session = data.session; nonce = data.nonce; state = "ready";
        gameWindow.parent.postMessage({ protocol: PROTOCOL, kind: "ready", session, nonce }, expectedParentOrigin);
        return;
      }
      if (state !== "ready" || !isMessage(data, "connect") || data.session !== session || data.nonce !== nonce || event.ports?.length !== 1 || !Array.isArray(data.methods) || data.methods.some(method => typeof method !== "string" || method.length > 128)) return;
      const methods = new Set(data.methods);
      port = event.ports[0];
      port.onmessage = ({ data: response }) => {
        if (state !== "connected" || !isMessage(response, "response") || response.session !== session || !fitsJson(response)) return;
        const entry = pending.get(response.id);
        if (!entry || response.sequence !== entry.sequence || typeof response.ok !== "boolean") return;
        pending.delete(response.id); clearTimeout(entry.timer);
        if (response.ok) entry.resolve(response.result); else entry.reject(new Error(typeof response.error === "string" ? response.error : "Host rejected request"));
      };
      port.start(); state = "connected"; clearTimeout(timer);
      port.postMessage({ protocol: PROTOCOL, kind: "connected", session, nonce });
      resolve({
        protocol: PROTOCOL,
        get session() { return session; },
        methods: Object.freeze([...methods]),
        request(method, params) {
          if (state !== "connected") return Promise.reject(new Error("Bridge is not connected"));
          if (!methods.has(method)) return Promise.reject(new Error("Method has not been granted by the owner"));
          if (pending.size >= MAX_PENDING) return Promise.reject(new Error("Too many pending requests"));
          const id = token();
          const nextSequence = sequence + 1;
          const request = { protocol: PROTOCOL, kind: "request", session, sequence: nextSequence, id, method, params };
          if (!fitsJson(request)) return Promise.reject(new Error("Request exceeds JSON message budget"));
          sequence = nextSequence;
          return new Promise((resolveRequest, rejectRequest) => {
            const requestTimer = setTimeout(() => { pending.delete(id); rejectRequest(new Error("Host request timed out")); }, timeoutMs);
            pending.set(id, { sequence, resolve: resolveRequest, reject: rejectRequest, timer: requestTimer });
            port.postMessage(request);
          });
        },
        close
      });
    }
    gameWindow.addEventListener("message", onWindowMessage);
  });
}

/** Install in a Godot web export's surrounding HTML, before the Godot scene starts. */
export function installGodotBridge(options) {
  const gameWindow = options.window ?? globalThis.window;
  const connection = connectCartridge(options);
  // Godot consumes JSON callbacks; no Promise/private key/provider objects are exposed.
  gameWindow.AWEGameBridge = {
    ready(callback) { connection.then(client => callback(JSON.stringify({ ok: true, methods: client.methods }))).catch(error => callback(JSON.stringify({ ok: false, error: errorText(error) }))); },
    requestJson(method, paramsJson, requestId, callback) {
      connection.then(async client => {
        try { callback(JSON.stringify({ requestId, ok: true, result: await client.request(method, JSON.parse(paramsJson)) })); }
        catch (error) { callback(JSON.stringify({ requestId, ok: false, error: errorText(error) })); }
      }).catch(error => callback(JSON.stringify({ requestId, ok: false, error: errorText(error) })));
    }
  };
  return connection;
}
