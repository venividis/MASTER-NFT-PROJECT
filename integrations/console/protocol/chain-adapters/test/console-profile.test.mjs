import test from "node:test";
import assert from "node:assert/strict";
import { validateConsoleProfile, importConsoleProfile, exportConsoleProfile } from "../dist/index.js";
import { connectConsoleV1 } from "../bridge/console-v1-client.mjs";

const digest = "a".repeat(64);
const world = { name: "Test world", terrain: Array(81).fill("plain") };
const consoleManifest = { spec: "awe.cartridge/1", name: "Test", version: "1.0.0", engine: "html", entry: `/api/console/content/${digest}`, contentHash: `sha256:${digest}`, capabilities: ["world.read"], settlement: "server", world };
const context = { id: "test", runtime: "web", gameAdapter: "test-adapter", rulesVersion: "1", compatibleChains: [], settlement: { mode: "server-attested", authority: "configured-test-authority" }, capabilityReasons: { "world.read": "Load the selected world" }, hashBinding: "same-single-html-bytes" };

test("Console profile import and explicit lossy export preserve the actual wire profile", () => {
  const imported = importConsoleProfile(consoleManifest, context);
  assert.equal(imported.manifest.contentHash, `0x${digest}`);
  assert.equal(imported.manifest.settlement.authority, "configured-test-authority");
  assert.deepEqual(imported.consoleProfile.world, world);
  const exported = exportConsoleProfile(imported.manifest, { acknowledgeMetadataLoss: true, hashBinding: "same-single-html-bytes", world: imported.consoleProfile.world });
  assert.deepEqual(exported.manifest, consoleManifest);
  assert.ok(exported.omitted.includes("settlement.authority"));
  assert.ok(exported.notes.some(note => note.includes("not enforce")));
});

test("conversion never invents hashes, settlement authorities or matching semantics", () => {
  const { contentHash: _, ...unhashed } = consoleManifest;
  assert.throws(() => importConsoleProfile(unhashed, context), /Hash the actual/);
  assert.throws(() => importConsoleProfile(consoleManifest, { ...context, settlement: { mode: "server-attested" } }), /authority/);
  assert.throws(() => importConsoleProfile(consoleManifest, { ...context, settlement: { mode: "local" } }), /contradicts/);
  assert.throws(() => importConsoleProfile(consoleManifest, { ...context, capabilityReasons: {} }), /reason/);
  const source = importConsoleProfile(consoleManifest, context).manifest;
  assert.throws(() => exportConsoleProfile(source, { hashBinding: "same-single-html-bytes" }), /acknowledgement/);
  assert.throws(() => exportConsoleProfile({ ...source, runtime: "native-client" }, { acknowledgeMetadataLoss: true, hashBinding: "same-single-html-bytes" }), /native-client/);
});

test("Console validator checks hashes and actual world connectivity", () => {
  assert.throws(() => validateConsoleProfile({ ...consoleManifest, contentHash: "sha256:invalid" }), /contentHash/);
  const blocked = [...world.terrain];
  for (let x = 0; x < 9; x++) blocked[36 + x] = "wall";
  assert.throws(() => validateConsoleProfile({ ...consoleManifest, world: { ...world, terrain: blocked } }), /connect both corners/);
  assert.throws(() => validateConsoleProfile({ ...consoleManifest, settlement: { toString: () => "server" } }), /Invalid Console/);
});

test("Console opaque client interoperates with the deployed v1 wire messages", async () => {
  const listeners = new Set();
  const hostOrigin = "https://console.example";
  let hostPort;
  let transferred = false;
  const session = "console-session";
  const parent = { postMessage(data, targetOrigin) {
    assert.equal(targetOrigin, hostOrigin);
    assert.deepEqual(data, { type: "awe:hello", version: 1 });
    if (transferred) return;
    transferred = true;
    const channel = new MessageChannel();
    hostPort = channel.port1;
    hostPort.onmessage = ({ data: request }) => {
      assert.equal(request.session, session);
      // The deployed host has no sequence/nonce field on requests or responses.
      hostPort.postMessage({ id: request.id, session: "stale-session", result: "ignored" });
      hostPort.postMessage(request.method === "console.info"
        ? { id: request.id, session, result: { version: "1.0", walletAccess: false } }
        : { id: request.id, session, error: "This capability is not granted by the host." });
    };
    hostPort.start();
    queueMicrotask(() => {
      for (const listener of listeners) {
        // Both spoofed acknowledgements must be ignored before the real port arrives.
        listener({ source: {}, origin: hostOrigin, data: { type: "awe:connected", version: 1, session }, ports: [] });
        listener({ source: parent, origin: "https://attacker.example", data: { type: "awe:connected", version: 1, session }, ports: [] });
        listener({ source: parent, origin: hostOrigin, data: { type: "awe:connected", version: 1, session }, ports: [channel.port2] });
      }
    });
  } };
  const gameWindow = { parent, addEventListener(type, callback) { listeners.add(callback); }, removeEventListener(type, callback) { listeners.delete(callback); } };
  const client = await connectConsoleV1({ expectedParentOrigin: hostOrigin, window: gameWindow });
  try {
    assert.equal(client.profile, "awe.console.opaque/1");
    assert.deepEqual(await client.request("console.info"), { version: "1.0", walletAccess: false });
    await assert.rejects(client.request("wallet.sign"), /not granted/);
  } finally { client.close(); hostPort?.close(); }
});
