import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  mountAccessDesk,
  sponsorDomain,
} from "../../web/extensions/access.mjs";
import {
  Interface,
  keccak256,
  ZeroAddress,
  ZeroHash,
} from "../../web/vendor/ethers.min.js";
const require = createRequire(
    new URL("../../agent/extensions/package.json", import.meta.url),
  ),
  { parseHTML } = require("linkedom");
const owner = "0x" + "11".repeat(20),
  relay = "0x" + "22".repeat(20),
  account = "0x" + "33".repeat(20),
  target = "0x" + "44".repeat(20),
  data = "0x12345678",
  code = "0x60006000";
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const abi = new Interface([
  "function instrumentGrantCount() view returns(uint256)",
  "function actionGrant(uint256) view returns(tuple(bytes32 adoption,address caller,address target,address asset,bytes32 dataHash,bytes32 targetCodeHash,uint112 perCall,uint112 remaining,uint96 value,uint48 expires,uint64 epoch,uint32 callsRemaining,bool revoked))",
  "function currentOwner() view returns(address)",
]);
function fixture() {
  const { document, window } = parseHTML("<main></main>"),
    container = document.querySelector("main");
  let signed = 0;
  const state = {
    epoch: 2n,
    grantEpoch: 2n,
    code,
    remaining: 10n,
    value: 5n,
    connect: async () => {},
    sign: async () => {
      signed++;
      return "0x" + "aa".repeat(65);
    },
  };
  const provider = {
    getBlock: async () => ({ timestamp: 1000 }),
    getCode: async () => state.code,
    call: async (tx) => {
      const call = abi.parseTransaction({ data: tx.data });
      if (call.name === "instrumentGrantCount")
        return abi.encodeFunctionResult(call.name, [1]);
      if (call.name === "currentOwner")
        return abi.encodeFunctionResult(call.name, [owner]);
      return abi.encodeFunctionResult(call.name, [
        [
          ZeroHash,
          relay,
          target,
          ZeroAddress,
          keccak256(data),
          keccak256(code),
          10n,
          state.remaining,
          state.value,
          4000n,
          state.grantEpoch,
          2n,
          false,
        ],
      ]);
    },
  };
  const signer = { signTypedData: (...args) => state.sign(...args) },
    wallet = {
      address: owner,
      account,
      chainId: 31337n,
      provider,
      signer,
      assertOwner: async () => {},
      connectSigner: () => state.connect(),
      contract: {
        sessionEpoch: async () => state.epoch,
        actionNonce: async () => 0n,
      },
    };
  const destroy = mountAccessDesk(container, {
      wallet,
      contract: async () => ({ getAddress: async () => relay }),
      review: async () => {},
    }),
    $ = (id) => container.querySelector("#ax-" + id);
  const capsule = {
    schema: "anima.sponsor-request/2",
    domain: sponsorDomain(31337, relay),
    data,
    request: {
      account,
      target,
      value: "5",
      dataHash: keccak256(data),
      epoch: "2",
      accountNonce: "0",
      nonce: "1",
      deadline: "2000",
      sponsor: owner,
      relayer: owner,
      callGas: "300000",
      maxGasPrice: "10",
      maxRefund: "1000",
      instrumentId: "1",
    },
  };
  $("capsule").value = JSON.stringify(capsule);
  $("sign-consent").checked = true;
  for (const [name, value] of Object.entries({
    target,
    data,
    value: "5",
    sponsor: owner,
    relayer: owner,
  }))
    $(name).value = value;
  return { state, wallet, $, container, destroy, window, signed: () => signed };
}
async function idle(f) {
  for (let i = 0; i < 50 && f.$("request")?.disabled; i++) await flush();
}

test("sponsor request rejects stale custody epochs, changed target runtime and insufficient native permission budget", async () => {
  for (const invalid of [
    { grantEpoch: 1n },
    { code: "0x60016000" },
    { remaining: 4n },
  ]) {
    const f = fixture();
    Object.assign(f.state, invalid);
    f.$("capsule").value = "";
    f.$("request").click();
    await idle(f);
    assert.equal(f.$("capsule").value, "");
    assert.match(f.$("status").textContent, /exact account permission/);
    f.destroy();
  }
  const f = fixture();
  f.$("capsule").value = "";
  f.$("request").click();
  await idle(f);
  const produced = JSON.parse(f.$("capsule").value);
  assert.equal(produced.request.epoch, "2");
  assert.equal(produced.request.instrumentId, "1");
  f.destroy();
});

test("editing or closing while connection resolves never opens a stale sponsor signature prompt", async () => {
  for (const close of [false, true]) {
    const f = fixture();
    let release, arrived;
    const waiting = new Promise((r) => (arrived = r)),
      gate = new Promise((r) => (release = r));
    f.state.connect = async () => {
      arrived();
      await gate;
    };
    f.$("sponsor-sign").click();
    await waiting;
    if (close) f.destroy();
    else {
      f.$("capsule").value = "edited terms";
      f.$("capsule").dispatchEvent(
        new f.window.Event("input", { bubbles: true }),
      );
    }
    release();
    await flush();
    await flush();
    assert.equal(f.signed(), 0);
    if (!close) {
      assert.equal(f.$("capsule").value, "edited terms");
      assert.match(f.$("status").textContent, /Terms changed/);
      f.destroy();
    }
  }
});

test("a returned signature is discarded if input or signing wallet changes while the wallet prompt is open", async () => {
  for (const walletChanged of [false, true]) {
    const f = fixture();
    let release, arrived;
    const waiting = new Promise((r) => (arrived = r)),
      gate = new Promise((r) => (release = r));
    f.state.sign = async () => {
      arrived();
      await gate;
      return "0x" + "bb".repeat(65);
    };
    f.$("sponsor-sign").click();
    await waiting;
    const before = f.$("capsule").value;
    if (walletChanged) f.wallet.address = "0x" + "55".repeat(20);
    else {
      f.$("target").value = "0x" + "66".repeat(20);
      f.$("target").dispatchEvent(
        new f.window.Event("input", { bubbles: true }),
      );
    }
    release();
    await idle(f);
    assert.equal(f.$("capsule").value, before);
    assert.equal(JSON.parse(before).sponsorSignature, undefined);
    assert.match(f.$("status").textContent, /Terms changed|discarded/);
    f.destroy();
  }
});
