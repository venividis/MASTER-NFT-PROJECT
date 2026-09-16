> **Historical research architecture.** This document is retained for context, not as evidence that every described component was tested or deployed. Read [the current release](../README.md), [1.2 changes](PROTOCOL-CHANGES-1.2.md), and [recorded validation](../reports/VALIDATION.md).

# Research lineage and standards boundary

Research was used as raw material, not as authority. Every adopted idea was challenged against the project's core invariants: deterministic identity, no hidden authority after Ascension, proof/state synchronization, replay resistance, and explicit trust boundaries.

The links below are primary specifications or official project documentation consulted for the architecture.

## Ethereum identity, accounts, and agents

### ERC-6551 — Non-fungible Token Bound Accounts

- Specification: https://eips.ethereum.org/EIPS/eip-6551
- Adopted idea: an NFT can have a deterministic account whose authority follows ownership.
- Deliberate divergence: this project uses a purpose-built CREATE2 factory rather than the canonical ERC-6551 registry. It exposes compatible concepts (`token`, `state`, `isValidSigner`) without claiming registry-level interoperability.

### ERC-4337 — Account Abstraction

- Specification: https://eips.ethereum.org/EIPS/eip-4337
- Adopted idea: relayers/bundlers should not be the authority; validation should be separable from execution.
- Current boundary: no EntryPoint/UserOperation adapter is included. Sovereign intents are directly relayed to the account.

### ERC-7579 — Minimal Modular Smart Accounts

- Specification: https://eips.ethereum.org/EIPS/eip-7579
- Adopted idea: narrow module roles and explicit execution modes are safer than ad hoc extension points.
- Deliberate divergence: there is no arbitrary module/delegatecall installation. Proof verification is routed through a dedicated immutable account reference.

### ERC-8004 — Trustless Agents

- Specification: https://eips.ethereum.org/EIPS/eip-8004
- Adopted idea: agent identity, reputation, validation, wallets, and discoverable endpoints should be distinct surfaces.
- Current boundary: this collection records a one-time registry/agent binding and endpoint metadata. Reputation and validation registries remain external.

### ERC-8048 — Onchain Token Metadata

- Specification: https://eips.ethereum.org/EIPS/eip-8048
- Adopted idea: composable key/value metadata should be readable directly from the token contract.
- Implementation: `metadata`, `getMetadata`, and `setMetadata`, with virtual reserved keys backed by canonical state.

### ERC-8217 — Agent and Master NFT Binding

- Specification: https://eips.ethereum.org/EIPS/eip-8217
- Adopted idea: an agent identity can be immutably bound to the NFT that represents its master object.
- Current boundary: `bindERC8004` creates an irreversible local binding record. Full ERC-8217 ecosystem behavior requires deployment against the canonical external registries/binding contract.

### ERC-8196 — AI Agent Wallets

- Specification: https://eips.ethereum.org/EIPS/eip-8196
- Adopted ideas: policy-bound execution, agent authentication, and an auditable action chain.
- Implementation: constitution commitment, proof-only authority, target/data/value binding, and append-only audit root.

## Private and verifiable AI state

### ERC-7857 — Intelligent NFTs with Private Metadata

- Specification: https://eips.ethereum.org/EIPS/eip-7857
- Adopted idea: AI-agent memory/model state should be represented by private metadata commitments and verified transitions rather than public plaintext.
- Current boundary: this repository commits a memory root and provides proof hooks. It does not implement encrypted blob custody, re-encryption, or key transfer.

### ERC-7992 — ZKML Model Registry

- Specification: https://eips.ethereum.org/EIPS/eip-7992
- Adopted idea: model identity and inference verification should be modular and independently addressable.
- Current boundary: verifier routing can point at ZKML adapters; a model registry is not bundled.

## Proof systems

### Succinct SP1

- Official documentation: https://docs.succinct.xyz/docs/sp1/introduction
- Adopted idea: execute a deterministic policy/state-transition program and verify its receipt onchain.
- Implementation: native Rust kernel plus `SP1ActionVerifier`, which requires the public values to be exactly the sovereign action statement.

### RISC Zero zkVM

- Official documentation: https://dev.risczero.com/api/zkvm/
- Adopted idea: independent zkVM implementations can reduce monoculture risk.
- Implementation: `RiscZeroActionVerifier`, which requires the journal to be exactly the action statement and verifies its journal digest.

### Hybrid proof composition

The project goes beyond choosing one proof system. `CompositeActionVerifier` can require M-of-N independently pinned verifiers. A deployment can require a zkVM receipt plus a TEE quorum, or two independent zkVM implementations, before the account acts.

## Cross-chain systems

### LayerZero V2 / ONFT and OApp

- Official documentation: https://docs.layerzero.network/v2/developers/evm/onft/quickstart
- Adopted idea: cross-chain identity needs explicit trusted peers, authenticated transport, and monotonic message handling.
- Deliberate architecture: the core stores transport-neutral witnesses instead of hard-coding one bridge. A LayerZero adapter can be configured per remote domain.

## Solana portability

### Metaplex Core and plugins

- Official documentation: https://developers.metaplex.com/core
- Adopted idea: asset behavior can be expressed through explicit plugins rather than monolithic token logic.
- Current boundary: the shipped implementation is EVM-native. A Solana port should map organism state to a Core asset/plugin set and use compressed assets only where proof/update economics justify them.

## Metadata, users, and royalties

- ERC-4906 metadata update events: https://eips.ethereum.org/EIPS/eip-4906
- ERC-4907 rentable/user role: https://eips.ethereum.org/EIPS/eip-4907
- ERC-2981 royalty information: https://eips.ethereum.org/EIPS/eip-2981

## Assumptions rejected

1. **“The owner must always control the NFT.”** Rejected after Ascension; custody and constitutional agency are separated.
2. **“AI autonomy means putting an LLM onchain.”** Rejected; reasoning can remain probabilistic, while the accepted action must be deterministic and provable.
3. **“Private metadata means hiding a URI.”** Rejected; only cryptographic commitments enter the core state.
4. **“Omnichain means hard-coding one bridge.”** Rejected; remote truth is represented by adapter-authenticated witnesses.
5. **“Upgradeable means advanced.”** Rejected for the organism core; immutability and explicit frozen trust roots are treated as features.
6. **“Dynamic NFT means a mutable image server.”** Rejected; phenotype is generated from live contract state.
7. **“One proof system is enough.”** Rejected; immutable M-of-N composition is first-class.
8. **“A wallet signature is the final authority.”** Rejected in sovereign mode; a valid proof is the authority and any relayer may submit it.
