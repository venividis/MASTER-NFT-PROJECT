import test from "node:test";
import assert from "node:assert/strict";
import { createHostBridge, connectCartridge, PROTOCOL } from "../bridge/message-channel.mjs";

const HOST = "https://host.example";
const GAME = "https://game.example";
const tick = () => new Promise(resolve => setTimeout(resolve, 15));

function eventEndpoint(origin) {
  const listeners = new Map();
  return {
    location: { origin },
    addEventListener(type, fn) { const list = listeners.get(type) ?? new Set(); list.add(fn); listeners.set(type, list); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, event) { for (const fn of [...(listeners.get(type) ?? [])]) fn(event); }
  };
}

function fixture() {
  const hostWindow = eventEndpoint(HOST);
  const gameWindow = eventEndpoint(GAME);
  const sentToGame = [];
  const sentToHost = [];
  const hostProxy = { postMessage(data, targetOrigin, ports = []) {
    if (targetOrigin !== HOST) throw new Error("Incorrect target host origin");
    sentToHost.push(data);
    queueMicrotask(() => hostWindow.emit("message", { data, ports, source: gameProxy, origin: GAME }));
  } };
  const gameProxy = { postMessage(data, targetOrigin, ports = []) {
    if (targetOrigin !== GAME) throw new Error("Incorrect target game origin");
    sentToGame.push({ data, ports });
    queueMicrotask(() => gameWindow.emit("message", { data, ports, source: hostProxy, origin: HOST }));
  } };
  gameWindow.parent = hostProxy;
  const iframe = { ...eventEndpoint(GAME), contentWindow: gameProxy };
  return { hostWindow, gameWindow, iframe, hostProxy, gameProxy, sentToGame, sentToHost };
}

test("versioned channel handshake executes only owner-granted methods", async () => {
  const f = fixture();
  const connection = connectCartridge({ expectedParentOrigin: HOST, window: f.gameWindow });
  const host = createHostBridge({ iframe: f.iframe, expectedOrigin: GAME, window: f.hostWindow, handlers: { "game.echo": params => ({ echoed: params.value }) } });
  host.start();
  const client = await connection;
  try {
    assert.equal(client.protocol, PROTOCOL);
    assert.deepEqual(await client.request("game.echo", { value: "hello" }), { echoed: "hello" });
    assert.equal(host.connected, true);
    await assert.rejects(client.request("wallet.sign", {}), /not been granted/);
    await assert.rejects(client.request("game.echo", { value: "x".repeat(70000) }), /message budget/);
    assert.deepEqual(await client.request("game.echo", { value: "still connected" }), { echoed: "still connected" });
  } finally { client.close(); host.close(); }
});

test("window handshake rejects spoofed sources and origins on both sides", async () => {
  const f = fixture();
  const connection = connectCartridge({ expectedParentOrigin: HOST, window: f.gameWindow });
  const hello = { protocol: PROTOCOL, kind: "hello", session: "spoof", nonce: "spoof" };
  f.gameWindow.emit("message", { data: hello, source: {}, origin: HOST });
  f.gameWindow.emit("message", { data: hello, source: f.hostProxy, origin: "https://attacker.example" });
  assert.equal(f.sentToHost.length, 0);
  const host = createHostBridge({ iframe: f.iframe, expectedOrigin: GAME, window: f.hostWindow, handlers: {} });
  host.start();
  const actual = f.sentToGame[0].data;
  const ready = { ...actual, kind: "ready" };
  f.hostWindow.emit("message", { data: ready, source: {}, origin: GAME });
  f.hostWindow.emit("message", { data: ready, source: f.gameProxy, origin: "https://attacker.example" });
  assert.equal(f.sentToGame.filter(message => message.data.kind === "connect").length, 0);
  const client = await connection;
  client.close(); host.close();
});

test("old sessions and replayed sequence numbers cannot rerun handlers", async () => {
  const f = fixture();
  let calls = 0;
  const connection = connectCartridge({ expectedParentOrigin: HOST, window: f.gameWindow });
  const host = createHostBridge({ iframe: f.iframe, expectedOrigin: GAME, window: f.hostWindow, handlers: { "game.count": () => ++calls } });
  host.start(); const client = await connection;
  try {
    assert.equal(await client.request("game.count", {}), 1);
    const gamePort = f.sentToGame.find(message => message.data.kind === "connect").ports[0];
    gamePort.postMessage({ protocol: PROTOCOL, kind: "request", session: client.session, sequence: 1, id: "replay", method: "game.count", params: {} });
    gamePort.postMessage({ protocol: PROTOCOL, kind: "request", session: "old-session", sequence: 2, id: "stale", method: "game.count", params: {} });
    await tick();
    assert.equal(calls, 1);
    assert.equal(await client.request("game.count", {}), 2);
  } finally { client.close(); host.close(); }
});

test("opaque and untrusted same-origin cartridges are not silently accepted", () => {
  const f = fixture();
  assert.throws(() => createHostBridge({ iframe: f.iframe, expectedOrigin: "null", window: f.hostWindow, handlers: {} }), /URL|origin/);
  assert.throws(() => createHostBridge({ iframe: f.iframe, expectedOrigin: HOST, window: f.hostWindow, handlers: {} }), /dedicated origin/);
});
