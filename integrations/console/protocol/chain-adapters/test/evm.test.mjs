import test from "node:test";
import assert from "node:assert/strict";
import { EvmAdapter, CHAIN_DESCRIPTORS } from "../dist/index.js";

const OWNER = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const COLLECTION = "0x3333333333333333333333333333333333333333";
const ACCOUNT = "0x4444444444444444444444444444444444444444";
const asset = { chain: "eip155:1", standard: "erc721", collection: COLLECTION, id: "42" };
// Independent ABI fixtures generated with ethers 6.17.0 Interface, not this encoder.
const TRANSFER = "0x42842e0e00000000000000000000000011111111111111111111111111111111111111110000000000000000000000002222222222222222222222222222222222222222000000000000000000000000000000000000000000000000000000000000002a";
const EXECUTE = "0x519454470000000000000000000000003333333333333333333333333333333333333333000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006442842e0e00000000000000000000000011111111111111111111111111111111111111110000000000000000000000002222222222222222222222222222222222222222000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000000000000000000000000000000000000";

test("owner reads use chain checks and a concrete block, with no signing RPC", async () => {
  const calls = [];
  const adapter = new EvmAdapter({ async request(call) {
    calls.push(call);
    if (call.method === "eth_chainId") return "0x1";
    if (call.method === "eth_getBlockByNumber") return { number: "0x64" };
    if (call.method === "eth_call") return "0x0000000000000000000000001111111111111111111111111111111111111111";
    throw new Error("Unexpected RPC");
  } }, 1n);
  const state = await adapter.resolveController(asset);
  assert.equal(state.owner, OWNER);
  assert.equal(state.block, "0x64");
  assert.equal(state.evidence, "rpc-observation");
  assert.equal(calls.find(call => call.method === "eth_getBlockByNumber").params[0], "finalized");
  const call = calls.find(call => call.method === "eth_call");
  assert.equal(call.params[1], "0x64");
  assert.equal(call.params[0].data, "0x6352211e000000000000000000000000000000000000000000000000000000000000002a");
});

test("wrong-chain RPC and unsupported finality do not silently fall back", async () => {
  const wrong = new EvmAdapter({ async request() { return "0x89"; } }, 1n);
  await assert.rejects(wrong.resolveController(asset), /chain does not match/);
  const unavailable = new EvmAdapter({ async request({ method }) { return method === "eth_chainId" ? "0x1" : null; } }, 1n);
  await assert.rejects(unavailable.resolveController(asset), /block is unavailable/);
});

test("ERC-721 transfer and optional account execution match independent ABI fixtures", () => {
  const adapter = new EvmAdapter({ request() { throw new Error("Preparation must not call RPC or wallet"); } }, 1n);
  const transfer = adapter.prepareERC721Transfer(asset, OWNER, RECIPIENT);
  assert.equal(transfer.transaction.data, TRANSFER);
  assert.equal(transfer.status, "unsigned");
  const execution = adapter.prepareAccountExecution(ACCOUNT, transfer);
  assert.equal(execution.transaction.to, ACCOUNT);
  assert.equal(execution.transaction.data, EXECUTE);
  assert.equal(execution.transaction.value, "0x0");
});

test("session grants reject wrong targets, selectors, value, chain and expiry", () => {
  const adapter = new EvmAdapter({ request() { throw new Error("unused"); } }, 1n, () => 1000);
  const action = { chain: "eip155:1", target: COLLECTION, calldata: TRANSFER, value: 3n, description: "Chosen action" };
  const grant = { chain: "eip155:1", expiresAt: 2000, allowedCalls: [{ target: COLLECTION, selector: "0x42842e0e" }], maxValuePerCall: 3n };
  assert.equal(adapter.prepareAction(action, grant).transaction.value, "0x3");
  assert.throws(() => adapter.prepareAction({ ...action, target: OWNER }, grant), /not been granted/);
  assert.throws(() => adapter.prepareAction({ ...action, calldata: "0xdeadbeef" }, grant), /not been granted/);
  assert.throws(() => adapter.prepareAction({ ...action, value: 4n }, grant), /value limit/);
  assert.throws(() => adapter.prepareAction(action, { ...grant, expiresAt: 1000 }), /expired/);
  assert.throws(() => adapter.prepareAction(action, { ...grant, chain: "eip155:10" }), /chain mismatch/);
});

test("malformed owners and uint256 overflow fail closed", async () => {
  const adapter = new EvmAdapter({ async request({ method }) {
    if (method === "eth_chainId") return "0x1";
    if (method === "eth_getBlockByNumber") return { number: "0x1" };
    return "0x";
  } }, 1n);
  await assert.rejects(adapter.resolveController(asset), /Malformed ownerOf/);
  assert.throws(() => adapter.prepareERC721Transfer({ ...asset, id: (1n << 256n).toString() }, OWNER, RECIPIENT), /uint256/);
});

test("non-EVM descriptors do not advertise live implementations", () => {
  for (const family of ["solana", "sui", "starknet"]) {
    assert.equal(CHAIN_DESCRIPTORS[family].implementation, "research-only");
    assert.ok(CHAIN_DESCRIPTORS[family].capabilities.every(capability => capability.status === "planned"));
  }
});
