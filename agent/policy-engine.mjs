/** Deterministic evolution proposal builder using caller-supplied context.
 * This module does not fetch or authenticate live chain state, establish the
 * canonical collection, enforce a constitution, or produce an execution proof.
 */
import {
  AbiCoder,
  Interface,
  ZeroHash,
  getAddress,
  keccak256,
  toUtf8Bytes,
} from "ethers";

const coder = AbiCoder.defaultAbiCoder();
const collectionInterface = new Interface([
  "function commitEvolution(uint256 tokenId,bytes32 newGenome,bytes32 newMemoryRoot,bytes32 evidenceHash)",
]);

export const INTENT_TYPE = "Intent(address account,uint256 chainId,address target,uint256 value,bytes32 dataHash,uint256 nonce,uint48 validAfter,uint48 validUntil,bytes32 priorStateRoot,bytes32 nextStateRoot,bytes32 nextMemoryRoot,bytes32 policyHash,bytes32 evidenceHash,uint32 verifierId)";
export const INTENT_TYPEHASH = keccak256(toUtf8Bytes(INTENT_TYPE));
export const EVOLUTION_STATE_TYPE = "EvolutionState(address collection,uint256 chainId,uint256 tokenId,bytes32 oldGenome,bytes32 newGenome,bytes32 newMemoryRoot,bytes32 evidenceHash,uint32 evolution)";
export const EVOLUTION_STATE_TYPEHASH = keccak256(toUtf8Bytes(EVOLUTION_STATE_TYPE));

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function hashConstitution(policy) {
  return keccak256(toUtf8Bytes(`IDONTFUCKINGBELIEVEIT_CONSTITUTION_V1:${stableStringify(policy)}`));
}

export function intentStatement(account, chainId, intent) {
  return keccak256(coder.encode(
    [
      "bytes32", "address", "uint256", "address", "uint256", "bytes32", "uint256",
      "uint48", "uint48", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "uint32",
    ],
    [
      INTENT_TYPEHASH,
      getAddress(account),
      BigInt(chainId),
      getAddress(intent.target),
      BigInt(intent.value),
      intent.dataHash,
      BigInt(intent.nonce),
      BigInt(intent.validAfter),
      BigInt(intent.validUntil),
      intent.priorStateRoot,
      intent.nextStateRoot,
      intent.nextMemoryRoot,
      intent.policyHash,
      intent.evidenceHash,
      Number(intent.verifierId),
    ],
  ));
}

export function deriveEvolutionStateRoot({
  collection,
  chainId,
  tokenId,
  oldGenome,
  newGenome,
  newMemoryRoot,
  evidenceHash,
  nextEvolution,
}) {
  return keccak256(coder.encode(
    ["bytes32", "address", "uint256", "uint256", "bytes32", "bytes32", "bytes32", "bytes32", "uint32"],
    [
      EVOLUTION_STATE_TYPEHASH,
      getAddress(collection),
      BigInt(chainId),
      BigInt(tokenId),
      oldGenome,
      newGenome,
      newMemoryRoot,
      evidenceHash,
      Number(nextEvolution),
    ],
  ));
}

/** Encode a proposed action. The executor must validate its authority and live context. */
export function buildEvolutionPlan(input) {
  const now = Number(input.now ?? Math.floor(Date.now() / 1000));
  const request = String(input.request ?? "evolve toward greater coherence").trim();
  if (!request) throw new Error("request is required");
  if (!input.account || !input.collection) throw new Error("account and collection are required");
  if (!input.priorStateRoot || input.priorStateRoot === ZeroHash) throw new Error("priorStateRoot is required");
  if (!input.oldGenome || input.oldGenome === ZeroHash) throw new Error("oldGenome is required");
  if (!input.policyHash || input.policyHash === ZeroHash) throw new Error("policyHash is required");

  const evidenceHash = keccak256(toUtf8Bytes(stableStringify({
    domain: "IDONTFUCKINGBELIEVEIT_EVIDENCE_V1",
    request,
    sensorRoot: input.sensorRoot ?? ZeroHash,
    witnessRoot: input.witnessRoot ?? ZeroHash,
    previousAuditRoot: input.auditRoot ?? ZeroHash,
    nonce: String(input.nonce),
  })));
  const newGenome = keccak256(coder.encode(
    ["string", "bytes32", "bytes32", "bytes32", "uint256"],
    ["IDONTFUCKINGBELIEVEIT_GENOME_EVOLUTION_V1", input.oldGenome, input.priorStateRoot, evidenceHash, BigInt(input.nonce)],
  ));
  const nextMemoryRoot = keccak256(coder.encode(
    ["string", "bytes32", "bytes32", "bytes32"],
    ["IDONTFUCKINGBELIEVEIT_SEALED_MEMORY_V1", input.memoryRoot ?? ZeroHash, evidenceHash, newGenome],
  ));
  const nextStateRoot = deriveEvolutionStateRoot({
    collection: input.collection,
    chainId: input.chainId,
    tokenId: input.tokenId,
    oldGenome: input.oldGenome,
    newGenome,
    newMemoryRoot: nextMemoryRoot,
    evidenceHash,
    nextEvolution: Number(input.evolutions) + 1,
  });
  const data = collectionInterface.encodeFunctionData("commitEvolution", [
    BigInt(input.tokenId), newGenome, nextMemoryRoot, evidenceHash,
  ]);

  const intent = {
    target: getAddress(input.collection),
    value: 0n,
    dataHash: keccak256(data),
    nonce: BigInt(input.nonce),
    validAfter: BigInt(Math.max(0, now - 1)),
    validUntil: BigInt(now + Number(input.ttlSeconds ?? 600)),
    priorStateRoot: input.priorStateRoot,
    nextStateRoot,
    nextMemoryRoot,
    policyHash: input.policyHash,
    evidenceHash,
    verifierId: Number(input.verifierId ?? 1),
  };

  return {
    intent,
    data,
    statement: intentStatement(input.account, input.chainId, intent),
    explanation: {
      request,
      decision: "EVOLVE",
      context: "Caller-supplied account, collection, chain state and policy hash; not authenticated here.",
      proposalProperties: [
        "target is the collection address supplied by the caller",
        "value transfer is zero",
        "state transition is bound to the supplied genome and state root",
        "memory output is a commitment; this builder does not encrypt payloads",
        "nonce and validity window are encoded; the executor must enforce replay protection",
      ],
    },
  };
}
