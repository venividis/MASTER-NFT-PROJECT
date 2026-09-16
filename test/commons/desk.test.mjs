import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { CommonsDesk } from "../../web/commons/desk.mjs";
import { mountPrivacyDesk } from "../../web/extensions/privacy/desk.mjs";
const require = createRequire(
    new URL("../../agent/extensions/package.json", import.meta.url),
  ),
  { parseHTML } = require("linkedom");
const address = "0x" + "1".repeat(40);
function chain() {
  return {
    address: null,
    chainId: 31337n,
    records: [],
    plan: null,
    review: null,
    pending: () => null,
    invalidate() {
      this.plan = null;
      this.review = null;
    },
    assertContext: async () => {},
  };
}

test("encrypted content renders only as text inside the private surface and lock erases every sensitive field", async (t) => {
  const { document } = parseHTML("<html><body><main></main></body></html>");
  globalThis.document = document;
  t.after(() => delete globalThis.document);
  const wallet = chain(),
    desk = new CommonsDesk({ chain: wallet }),
    host = document.querySelector("main");
  host.innerHTML = desk.render();
  desk.mount(host);
  assert.equal(
    host.querySelector(".commons-desk").getAttribute("data-private-surface"),
    "true",
  );
  wallet.address = address;
  desk.client.binding = `31337:${address}`;
  desk.client.privacy = {
    identity: { publicKey: "0x04" },
    lock() {
      this.identity = null;
    },
  };
  desk.client.config = { keys: address, chat: address };
  desk.selected = {
    id: "1",
    manager: address,
    isManager: true,
    epoch: "1",
    members: 1,
    member: true,
    closed: false,
    dirty: false,
    messageCount: 1,
  };
  desk.tab = "groups";
  const secret = '<img src=x onerror="alert(1)"> Secret message';
  desk.history = [
    { index: 0, sender: address, epoch: "1", readable: true, text: secret },
  ];
  desk.paint();
  assert.equal(
    host.querySelector("[data-private-message]").textContent,
    secret,
  );
  assert.equal(host.querySelector("img"), null);
  host.querySelector('[name="message"]').value = "Unsent private words";
  desk.tab = "keys";
  desk.paint();
  host.querySelector('[name="passphrase"]').value =
    "Sensitive passphrase to clear";
  desk.lock();
  assert.equal(desk.history.length, 0);
  assert.equal(desk.client.unlocked, false);
  assert.equal(host.querySelector('[name="passphrase"]').value, "");
  assert.ok(!host.textContent.includes(secret));
  desk.unmount();
  assert.equal(host.querySelector(".commons-desk").children.length, 0);
});

test("legacy privacy panel can mount chat alone and its immediate lock also clears passphrases and pending creation", async (t) => {
  const { document } = parseHTML("<html><body><main></main></body></html>");
  globalThis.document = document;
  t.after(() => delete globalThis.document);
  const contract = async (name) => {
      if (["PrivacyKeys", "EpochGroupChat"].includes(name)) return {};
      throw Error("Not configured");
    },
    panel = await mountPrivacyDesk(document.querySelector("main"), {
      contract,
      identity: { chainId: 31337, owner: address },
      review: () => {},
    });
  assert.equal(
    document
      .querySelector(".privacy-extension-desk")
      .getAttribute("data-private-surface"),
    "true",
  );
  const labels = [...document.querySelectorAll("label")],
    password = labels
      .find((label) => label.textContent.includes("passphrase"))
      .querySelector("input");
  password.value = "Private backup passphrase";
  const message = labels
    .find((label) => label.textContent === "Private message")
    .querySelector("textarea");
  message.value = "Private plaintext";
  const creation = panel.client.newIdentity();
  panel.lock();
  await assert.rejects(creation, /cancelled/);
  assert.equal(password.value, "");
  assert.equal(message.value, "");
  assert.ok(
    document
      .querySelector("main")
      .textContent.includes("Encrypted conversations do not require it"),
  );
  panel.destroy();
  assert.equal(document.querySelector("main").children.length, 0);
});

test("editing a private review invalidates its transaction without remounting the typed field", () => {
  const { document } = parseHTML("<html><body><main></main></body></html>"),
    wallet = chain(),
    desk = new CommonsDesk({ chain: wallet }),
    host = document.querySelector("main");
  host.innerHTML = desk.render();
  desk.mount(host);
  desk.tab = "setup";
  desk.paint();
  const field = host.querySelector('[name="keysAddress"]');
  wallet.plan = { kind: "commons-action" };
  wallet.review = { old: true };
  field.value = address;
  desk.root.oninput();
  assert.equal(wallet.plan, null);
  assert.equal(wallet.review, null);
  assert.equal(host.querySelector('[name="keysAddress"]'), field);
  assert.equal(field.value, address);
});

test("a late backup-file read cannot restore private keys after the user locks the panel", async (t) => {
  const { document } = parseHTML("<html><body><main></main></body></html>");
  globalThis.document = document;
  t.after(() => delete globalThis.document);
  const wallet = chain(),
    desk = new CommonsDesk({ chain: wallet }),
    host = document.querySelector("main");
  host.innerHTML = desk.render();
  desk.mount(host);
  wallet.address = address;
  desk.client.binding = `31337:${address}`;
  desk.client.privacy = { identity: null, lock() {} };
  desk.client.config = { keys: address, chat: address };
  desk.tab = "keys";
  desk.paint();
  let release, arrived;
  const reading = new Promise((resolve) => (arrived = resolve)),
    gate = new Promise((resolve) => (release = resolve));
  const file = {
    size: 100,
    text: async () => {
      arrived();
      await gate;
      return "{}";
    },
  };
  Object.defineProperty(host.querySelector('[name="backupFile"]'), "files", {
    value: [file],
  });
  host.querySelector('[name="passphrase"]').value =
    "Long private backup passphrase";
  let restored = false;
  desk.client.restore = async () => {
    restored = true;
  };
  const pending = desk.dispatch({ commonsAction: "restore" });
  await reading;
  desk.lock();
  release();
  await pending;
  assert.equal(restored, false);
  assert.match(host.textContent, /restoration cancelled/);
  assert.equal(host.querySelector('[name="passphrase"]').value, "");
  assert.equal(
    host.querySelector('[data-commons-action="register"]').disabled,
    true,
    "locked action remains disabled after paint",
  );
});
