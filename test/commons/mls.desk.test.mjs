import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { MlsCommonsDesk } from "../../web/commons/mls-desk.mjs";
const require = createRequire(
    new URL("../../agent/extensions/package.json", import.meta.url),
  ),
  { parseHTML } = require("linkedom"),
  wallet = "0x" + "11".repeat(20),
  group = "0x" + "ab".repeat(32);
const chain = () => ({
  address: wallet,
  chainId: 31337,
  records: [],
  pending: () => null,
  assertContext: async () => {},
  invalidate() {
    this.plan = null;
    this.review = null;
  },
});
test("MLS messages stay text-only inside private surface; lock clears state, text, passphrases and review", () => {
  const { document } = parseHTML("<main></main>"),
    desk = new MlsCommonsDesk({ chain: chain() }),
    host = document.querySelector("main");
  host.innerHTML = desk.render();
  desk.mount(host);
  desk.client.chat = { target: wallet };
  desk.client.vault = {
    key: {},
    data: { groups: {}, retainHistory: false },
    lock() {
      this.key = null;
      this.data = null;
    },
  };
  desk.selected = {
    id: group,
    epoch: "1",
    roster: [wallet],
    member: true,
    isManager: true,
    manager: wallet,
    local: {
      state: "never display this private state",
      history: [
        { index: 2, sender: wallet, text: "Retained history must lock too" },
      ],
    },
    proposedManager: wallet,
  };
  const text = "<img src=x onerror=alert(1)> Secret circle";
  desk.client.messages.set(group, [{ index: 1, sender: wallet, text }]);
  desk.paint();
  assert.equal(host.querySelector("[data-mls-text]").textContent, text);
  assert.equal(host.querySelector("img"), null);
  assert.ok(!host.textContent.includes("never display this private state"));
  host.querySelector('[name="passphrase"]').value = "Secret backup password";
  host.querySelector('[name="message"]').value = "Draft secret";
  desk.chain.plan = { kind: "commons-mls-action" };
  desk.chain.review = {};
  desk.lock();
  desk.paint();
  assert.equal(desk.client.unlocked, false);
  assert.equal(desk.chain.review, null);
  assert.equal(host.querySelector('[name="passphrase"]').value, "");
  assert.ok(!host.textContent.includes(text));
  assert.ok(!host.textContent.includes("Retained history must lock too"));
});
test("a delayed MLS backup read cannot unlock after local privacy lock", async () => {
  const { document } = parseHTML("<main></main>"),
    desk = new MlsCommonsDesk({ chain: chain() }),
    host = document.querySelector("main");
  host.innerHTML = desk.render();
  desk.mount(host);
  desk.client.chat = { target: wallet };
  desk.paint();
  let release, entered;
  const gate = new Promise((r) => (release = r)),
    waiting = new Promise((r) => (entered = r)),
    file = {
      size: 100,
      text: async () => {
        entered();
        await gate;
        return "{}";
      },
    };
  Object.defineProperty(host.querySelector('[name="backup"]'), "files", {
    value: [file],
  });
  let restored = false;
  desk.client.unlock = async () => {
    restored = true;
  };
  host.querySelector('[name="passphrase"]').value = "Secret long password";
  const operation = desk.dispatch("restore");
  await waiting;
  desk.lock();
  release();
  await operation;
  assert.equal(restored, false);
  assert.equal(host.querySelector('[name="passphrase"]').value, "");
});
