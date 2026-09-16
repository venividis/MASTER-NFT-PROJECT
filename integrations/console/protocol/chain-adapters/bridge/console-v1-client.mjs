/**
 * Deployed Console v1 opaque-frame client. Deliberately a separate wire profile
 * from awe.cartridge.rpc/1. The host checks the iframe source and uses targetOrigin
 * '*' only to transfer a port into its sandboxed opaque-origin frame.
 */
export function connectConsoleV1({ expectedParentOrigin, window: gameWindow = globalThis.window, timeoutMs = 10000, retryMs = 300 }) {
  const origin = new URL(expectedParentOrigin);
  if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== expectedParentOrigin) throw new Error("Configure the exact parent HTTP(S) origin");
  if (!gameWindow || gameWindow.parent === gameWindow) return Promise.reject(new Error("Console cartridge must be framed by its configured host"));
  return new Promise((resolve, reject) => {
    let port;
    let session;
    let connected = false;
    let closed = false;
    const pending = new Map();
    let retries;
    const timeout = setTimeout(() => close(new Error("Console v1 handshake timed out")), timeoutMs);
    const fits = value => { try { return new TextEncoder().encode(JSON.stringify(value)).length <= 65536; } catch { return false; } };
    function close(error = new Error("Console v1 bridge closed")) {
      if (closed) return;
      closed = true; clearTimeout(timeout); clearInterval(retries); port?.close();
      gameWindow.removeEventListener("message", onMessage);
      for (const request of pending.values()) { clearTimeout(request.timeout); request.reject(error); }
      pending.clear(); reject(error);
    }
    function hello() {
      if (!closed && !connected) gameWindow.parent.postMessage({ type: "awe:hello", version: 1 }, expectedParentOrigin);
    }
    function onMessage(event) {
      if (closed || connected || event.source !== gameWindow.parent || event.origin !== expectedParentOrigin) return;
      const data = event.data;
      if (data?.type !== "awe:connected" || data.version !== 1 || typeof data.session !== "string" || !data.session || data.session.length > 128 || event.ports?.length !== 1) return;
      connected = true; session = data.session; port = event.ports[0];
      clearTimeout(timeout); clearInterval(retries);
      port.onmessage = ({ data: response }) => {
        if (closed || response?.session !== session || typeof response.id !== "string" || !fits(response)) return;
        const request = pending.get(response.id);
        if (!request || (typeof response.error !== "string" && !Object.prototype.hasOwnProperty.call(response, "result"))) return;
        pending.delete(response.id); clearTimeout(request.timeout);
        if (typeof response.error === "string") request.reject(new Error(response.error)); else request.resolve(response.result);
      };
      port.start();
      resolve({
        profile: "awe.console.opaque/1",
        get session() { return session; },
        request(method, params = {}) {
          if (closed) return Promise.reject(new Error("Console v1 bridge is closed"));
          if (typeof method !== "string" || !method || method.length > 60) return Promise.reject(new Error("Invalid Console method"));
          if (pending.size >= 8) return Promise.reject(new Error("Too many pending Console requests"));
          const id = globalThis.crypto.randomUUID();
          const message = { id, session, method, params };
          if (!fits(message)) return Promise.reject(new Error("Console request exceeds JSON byte budget"));
          return new Promise((resolveRequest, rejectRequest) => {
            const requestTimeout = setTimeout(() => { pending.delete(id); rejectRequest(new Error("Console request timed out; reconnect after a host session change")); }, timeoutMs);
            pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timeout: requestTimeout });
            port.postMessage(message);
          });
        },
        close
      });
    }
    gameWindow.addEventListener("message", onMessage);
    retries = setInterval(hello, retryMs);
    hello();
  });
}

/** Uses the same JSON callback surface consumed by examples/godot/AWEBridge.gd. */
export function installConsoleV1GodotBridge(options) {
  const gameWindow = options.window ?? globalThis.window;
  const connection = connectConsoleV1(options);
  const errorText = error => error instanceof Error ? error.message.slice(0, 512) : "Console request failed";
  gameWindow.AWEGameBridge = {
    ready(callback) {
      connection.then(async client => {
        await client.request("console.info");
        callback(JSON.stringify({ ok: true, methods: ["console.info"] }));
      }).catch(error => callback(JSON.stringify({ ok: false, error: errorText(error) })));
    },
    requestJson(method, paramsJson, requestId, callback) {
      connection.then(async client => {
        try { callback(JSON.stringify({ requestId, ok: true, result: await client.request(method, JSON.parse(paramsJson)) })); }
        catch (error) { callback(JSON.stringify({ requestId, ok: false, error: errorText(error) })); }
      }).catch(error => callback(JSON.stringify({ requestId, ok: false, error: errorText(error) })));
    }
  };
  return connection;
}
