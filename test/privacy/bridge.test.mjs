import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  verifiedRuntime,
  PrivacyBridge,
  privacyRuntimeBytes,
} from "../../web/privacy/bridge.mjs";
import { PRIVACY_RUNTIME } from "../../web/privacy/runtime-integrity.mjs";
test("privacy worker downloads omit referrers and reject altered or oversized code before execution", async () => {
  const oldFetch = globalThis.fetch,
    oldLocation = globalThis.location;
  globalThis.location = { origin: "https://anima.example" };
  const bytes = fs.readFileSync(
    new URL("../../web/privacy/railgun-worker.js", import.meta.url),
  );
  let options;
  try {
    globalThis.fetch = async (url, o) => {
      options = o;
      return new Response(bytes);
    };
    assert.equal(
      (await verifiedRuntime("https://runtime.example/worker.js")).length,
      PRIVACY_RUNTIME.bytes,
    );
    assert.equal(options.credentials, "omit");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.equal(options.redirect, "error");
    const changed = Buffer.from(bytes);
    changed[10] ^= 1;
    globalThis.fetch = async () => new Response(changed);
    await assert.rejects(
      verifiedRuntime("https://runtime.example/worker.js"),
      /integrity/,
    );
    globalThis.fetch = async () =>
      new Response(Buffer.alloc(PRIVACY_RUNTIME.bytes + 1));
    await assert.rejects(
      verifiedRuntime("https://runtime.example/worker.js"),
      /size/,
    );
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.location = oldLocation;
  }
});
test("locking terminates the worker, rejects pending requests and clears session identity", async () => {
  const bridge = new PrivacyBridge();
  let terminated = 0;
  bridge.worker = {
    postMessage() {},
    terminate() {
      terminated++;
    },
  };
  bridge.info = { address: "private-test-address" };
  const pending = bridge.call("prove", { id: "proof" });
  bridge.lock();
  await assert.rejects(pending, /locked/);
  assert.equal(terminated, 1);
  assert.equal(bridge.worker, null);
  assert.equal(bridge.info, null);
  await assert.rejects(bridge.call("send", { id: "proof" }), /Unlock/);
});

test("minted resource failure cannot silently fetch or execute an HTTPS worker", async () => {
  const beforeWindow = globalThis.window,
    beforeFetch = globalThis.fetch;
  let fetched = false;
  try {
    globalThis.window = {
      AWE_CHAIN_IDENTITY: {
        chainId: "31337",
        privacyResource: "0x" + "ab".repeat(20),
      },
      AWE_CHAIN_RPC: async () => "0x1",
    };
    globalThis.fetch = async () => {
      fetched = true;
      throw Error("Unexpected mirror");
    };
    await assert.rejects(privacyRuntimeBytes({}), /wrong chain/);
    assert.equal(fetched, false);
    delete window.AWE_CHAIN_IDENTITY.privacyResource;
    await assert.rejects(privacyRuntimeBytes({}), /older edition/);
    assert.equal(fetched, false);
  } finally {
    if (beforeWindow === undefined) delete globalThis.window;
    else globalThis.window = beforeWindow;
    globalThis.fetch = beforeFetch;
  }
});

test("worker receives a persistence acknowledgment only after encrypted receipt storage completes", async () => {
  const old = {
    fetch: globalThis.fetch,
    location: globalThis.location,
    Worker: globalThis.Worker,
    window: globalThis.window,
  };
  const bytes = fs.readFileSync(
    new URL("../../web/privacy/railgun-worker.js", import.meta.url),
  );
  const sent = [];
  let release, arrived;
  const wait = new Promise((resolve) => (release = resolve)),
    reached = new Promise((resolve) => (arrived = resolve));
  class Worker {
    postMessage(message) {
      sent.push(message);
      if (message.method === "initialize")
        queueMicrotask(() =>
          this.onmessage({
            data: { id: message.id, result: { address: "private" } },
          }),
        );
    }
    terminate() {}
  }
  const bridge = new PrivacyBridge(async (event) => {
    if (event.type === "submission") {
      arrived();
      await wait;
    }
  });
  try {
    globalThis.fetch = async () => new Response(bytes);
    globalThis.location = {
      origin: "https://anima.example",
      protocol: "https:",
      href: "https://anima.example/",
    };
    globalThis.Worker = Worker;
    delete globalThis.window;
    await bridge.start({ settings: {} });
    const processing = bridge.worker.onmessage({
      data: { event: { type: "submission" }, eventId: 7 },
    });
    await reached;
    assert.equal(sent.filter((message) => message.persistenceAck).length, 0);
    release();
    await processing;
    assert.deepEqual(
      sent.find((message) => message.persistenceAck),
      { persistenceAck: true, eventId: 7, ok: true },
    );
  } finally {
    bridge.lock();
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
