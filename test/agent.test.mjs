import assert from "node:assert/strict";
import test from "node:test";
import { ZeroAddress, keccak256, toUtf8Bytes } from "ethers";
import { buildEvolutionPlan, hashConstitution, stableStringify } from "../agent/policy-engine.mjs";
import { handleMcp } from "../agent/server.mjs";

const state = {
  account: "0x1111111111111111111111111111111111111111",
  collection: "0x2222222222222222222222222222222222222222",
  chainId: 1337,
  tokenId: 1,
  nonce: 9,
  evolutions: 3,
  priorStateRoot: keccak256(toUtf8Bytes("state")),
  oldGenome: keccak256(toUtf8Bytes("genome")),
  memoryRoot: keccak256(toUtf8Bytes("memory")),
  auditRoot: keccak256(toUtf8Bytes("audit")),
  policyHash: keccak256(toUtf8Bytes("policy")),
  verifierId: 1,
  now: 1_900_000_000,
};

test("agent planning is deterministic, ABI-ready, and sensitive to evidence", () => {
  const first = buildEvolutionPlan({ ...state, request: "become stranger without exceeding policy" });
  const second = buildEvolutionPlan({ ...state, request: "become stranger without exceeding policy" });
  assert.equal(first.statement, second.statement);
  assert.equal(first.data, second.data);
  assert.equal(first.intent.value, 0n);
  assert.equal(first.intent.target.toLowerCase(), state.collection.toLowerCase());
  assert.notEqual(first.intent.nextStateRoot, state.priorStateRoot);
  assert.notEqual(first.intent.nextMemoryRoot, state.memoryRoot);

  const changed = buildEvolutionPlan({ ...state, request: "preserve the old genome" });
  assert.notEqual(changed.statement, first.statement);
  assert.notEqual(changed.intent.evidenceHash, first.intent.evidenceHash);
});

test("constitutional hashing ignores object insertion order", () => {
  const a = { maxValue: "0", allowedSelectors: ["0x12345678"], objective: "survive" };
  const b = { objective: "survive", allowedSelectors: ["0x12345678"], maxValue: "0" };
  assert.equal(stableStringify(a), stableStringify(b));
  assert.equal(hashConstitution(a), hashConstitution(b));
});

test("MCP surface exposes tools and produces a serializable plan", async () => {
  const listed = await handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.equal(listed.result.tools.length, 3);
  const called = await handleMcp({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "organism.plan_evolution", arguments: { ...state, request: "prove one mutation" } },
  });
  const parsed = JSON.parse(called.result.content[0].text);
  assert.equal(parsed.intent.target.toLowerCase(), state.collection.toLowerCase());
  assert.match(parsed.data, /^0x/);
});
