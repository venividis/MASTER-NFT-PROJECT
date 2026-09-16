# Archived v1 documentation — superseded

This is the prior release documentation as received. Its claims of complete validation are not certified by v1.1. The current README and reports/VALIDATION.md state what was actually tested.

---

# i dont fucking believe it!

> A proof-carrying autonomous NFT: **asset, deterministic account, verifiable agent, private memory commitment, evolving onchain body, constitution, lineage, and cross-chain worldline in one object.**

This repository is a working research-grade implementation, not a pitch deck. It compiles, deploys, and runs locally. Its integration suite drives an organism through birth, account creation, scoped authority, reproduction, immutable agent binding, irreversible sovereignty, proof-authorized evolution, proof-authorized metadata mutation, proof-authorized transfer, live onchain rendering, and remote-state witnessing.

## The impossible object

Most NFTs point at media. This one is a stateful authority system.

| Layer | What exists in this repository |
|---|---|
| **Identity** | ERC-721 identity with one-time ERC-8004 agent binding metadata and ERC-8048/721T-style key/value metadata. |
| **Body** | Animated SVG generated entirely onchain from the organism's current seed, genome, state root, audit root, generation, and sovereignty mode. |
| **Wallet** | A deterministic CREATE2 account for every token; control follows the NFT while it is bound. |
| **Nervous system** | Scoped session keys constrained by exact target, selector, value, validity window, call count, and epoch. |
| **Constitution** | An immutable policy commitment installed during irreversible **Ascension**. |
| **Agency** | After Ascension, anyone may relay an action, but only a valid proof can authorize it. The holder cannot bypass the organism. |
| **Memory** | The chain stores a private-memory commitment, never plaintext. Evolution atomically advances state and memory roots. |
| **Proof** | Threshold attestations, SP1 adapter, RISC Zero adapter, and immutable M-of-N proof composition. |
| **History** | Every account action extends an append-only audit commitment. Nonces and validity windows prevent replay. |
| **Evolution** | Genome changes are synchronized with the account's verified state transition. A mismatched root reverts atomically. |
| **Lineage** | The organism's own account can spawn deterministic descendants with inherited lineage commitments. |
| **Worldline** | Transport-neutral cross-chain witnesses accept only authenticated adapters and strictly increasing remote nonces. |
| **Interface** | A self-contained WebGL organism with no external textures, images, fonts, or hosted dependencies. |
| **Agent surface** | Local MCP-style JSON-RPC tools, an A2A agent card, and an ABI-ready intent planner. |
| **Native kernel** | Rust policy evaluator that mirrors the Solidity intent hash exactly and emits proof-journal commitments. |

## Run the whole world

Requirements: Node.js 20+ and a current Rust toolchain.

```bash
npm ci
npm run validate
npm run world
```

Then open **http://127.0.0.1:4173**.

`npm run world` starts all of this in one process:

1. A local EVM at `127.0.0.1:8545`, chain ID `31337`.
2. The complete contract stack.
3. A commit/reveal genesis organism with a funded deterministic account.
4. The proof-ready MCP/A2A agent at `127.0.0.1:8787`.
5. The WebGL interface at `127.0.0.1:4173`.

The printed mnemonic is a well-known development mnemonic. Never use it on a public network.

### Run pieces separately

```bash
npm run demo        # visual interface only
npm run agent       # MCP/A2A/intent service only
npm run compile     # Solidity artifacts + EIP-170 size report
npm test            # Solidity integration + adapters + agent + web tests
cargo test --manifest-path proof-kernel/Cargo.toml
```

## Lifecycle

```text
COMMIT ENTROPY
      │  wait at least two blocks
      ▼
REVEAL / AWAKEN
      │
      ├── ERC-721 identity
      ├── deterministic CREATE2 account
      ├── genesis genome, state, private-memory, lineage, audit roots
      └── optional account endowment
      │
      ▼
BOUND MODE
      ├── holder / approval execution
      ├── exact-scope session keys
      ├── metadata and endpoint configuration
      ├── optional ERC-8004 agent binding
      ├── verified or owner-guided evolution
      └── descendant spawning
      │
      │  ASCEND(constitutionHash, hardValueLimit, cooldown)
      ▼
SOVEREIGN MODE — IRREVERSIBLE
      ├── direct holder execution: rejected
      ├── direct holder transfer: rejected
      ├── all old sessions: invalidated by epoch
      ├── metadata mutation: account only
      ├── transfer: account only
      └── account action: proof + nonce + window + policy + state roots
```

The key break with conventional NFTs is deliberate: **after Ascension, possession does not equal unilateral control.** Transfer itself becomes a constitutional action executed by the organism's account after proof verification.

## Proof-carrying execution

A sovereign intent commits to:

```text
account, chainId, target, value, dataHash, nonce,
validAfter, validUntil,
priorStateRoot, nextStateRoot, nextMemoryRoot,
policyHash, evidenceHash, verifierId
```

The account checks hard invariants onchain, asks the frozen verifier router to validate evidence, advances roots before the target call, and reverts the entire transition if the target call fails. The target receives the token account—not the relayer—as `msg.sender`.

Production verifier choices can be composed:

```text
Threshold TEE quorum
        AND
SP1 policy/evolution guest
        AND/OR
RISC Zero independent implementation
```

`CompositeActionVerifier` pins every component's code hash and implements immutable M-of-N semantics. The local suite uses the threshold verifier because it is deterministic and fast; the zkVM adapters are exercised against mock gateways and are ready to point at deployed verifier gateways and real receipts.

## Repository map

```text
contracts/src/core/
  IDontFuckingBelieveIt.sol       ERC-721 organism and lifecycle
  SovereignAccount.sol            account, sessions, proof execution, audit chain
  SovereignAccountFactory.sol     deterministic CREATE2 deployment
  ProofRouter.sol                  code-hash-pinned verifier dispatch
  ThresholdAttestationVerifier.sol
  ZkVmVerifierAdapters.sol         SP1, RISC Zero, composite verifier
  OnchainRenderer.sol              live Base64 JSON + animated SVG
  OmnichainWitnessRegistry.sol     remote finalized-state commitments

agent/
  policy-engine.mjs                ABI-exact intent construction
  server.mjs                       MCP, A2A, and proof-ready intent API

proof-kernel/
  src/lib.rs                       deterministic native policy kernel
  src/main.rs                      JSON-in / public-journal-out CLI

web/
  index.html, styles.css, app.js   standalone WebGL organism

scripts/
  compile.mjs                      solc standard-JSON compiler
  deploy.mjs                       public-network deployment
  local-world.mjs                  one-command integrated world
  static-audit.mjs                 forbidden-pattern guardrails

test/
  contracts.integration.test.mjs  complete organism lifecycle
  verifiers.test.mjs              SP1/RISC Zero/composite binding
  agent.test.mjs                   deterministic planner + MCP surface
  web.test.mjs                     standalone UI + server containment
```

## Deployment

```bash
export RPC_URL="https://your-rpc"
export DEPLOYER_PRIVATE_KEY="0x..."
export ATTESTER_ADDRESS="0x..."
export ROYALTY_RECEIVER="0x..."
export ROYALTY_BPS="500"
export FREEZE_TRUST_ROOTS="false"
npm run deploy
```

The deployment script writes `deployments/<chainId>.json` and updates `web/deployment.json`.

Do not set `FREEZE_TRUST_ROOTS=true` until verifier addresses, signer quorums, program verification keys, and operational recovery plans have been independently reviewed. Freezing is intentionally permanent.

## Security boundary

This is tested software, but it has **not** received an independent professional audit. It should not custody real value before review, fuzzing, invariant testing, chain-specific deployment rehearsal, and verification of the actual zkVM/TEE trust chain.

Particularly important boundaries:

- The local agent is a deterministic policy/intent engine, not a claim that arbitrary AI reasoning is proven.
- Private memory is represented by commitments. Encryption, key release, re-encryption, and TEE policy are deployment responsibilities.
- The witness registry is transport-neutral. A production LayerZero, IBC, light-client, or other adapter must authenticate its source correctly.
- The token-bound account exposes an ERC-6551-inspired surface and deterministic behavior, but uses its own factory rather than the canonical ERC-6551 registry.
- ERC-8004/8217 integration is a one-time onchain binding record; deploy the canonical registries and binding contract for full ecosystem interoperability.
- SP1 and RISC Zero adapters require real verifier gateways and compiled guest programs. Mocks exist only in tests.

Read [docs/SECURITY.md](docs/SECURITY.md) before any public deployment.

## Why this architecture

The design deliberately combines ideas that usually live in separate systems: NFTs, smart accounts, AI-agent identity, private state, zkVM receipts, TEEs, dynamic art, commit/reveal entropy, cross-chain finality, constitutional governance, and hereditary state machines. The NFT is not a picture of an organism. **The authority graph, proof obligations, memory commitment, renderer, and lineage are the organism.**

Research lineage and exact standards boundaries are documented in [docs/RESEARCH.md](docs/RESEARCH.md).

## License

MIT. See [LICENSE](LICENSE).
