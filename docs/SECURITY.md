# Security model

## Status

This is a research implementation. Iteration 1.2 has tested local interface components and mocked provider flows, but its revised Solidity was not compiled in the release environment. It is **not independently audited** and must not custody material value before professional review, invariant fuzzing, real verifier integration, operational rehearsal, and chain-specific analysis.

## Trusted components by phase

### Bound mode

Trusted:

- current NFT holder and active approvals;
- any explicitly created session key within its scope;
- collection bytecode;
- account bytecode and deterministic factory;
- chain consensus.

The proof router is not needed for ordinary bound execution, but it becomes critical at Ascension.

### Sovereign mode

Trusted:

- immutable collection/account/factory bytecode;
- the proof router and configured verifier contracts;
- signer or zkVM trust assumptions of the selected verifier ID;
- constitution compiler correctness;
- chain consensus;
- remote adapters for any witness used as evidence.

The current NFT holder is **not** trusted to authorize actions directly after Ascension.

## Administrative powers

### Collection administrator

Can:

- configure the account factory exactly once;
- change royalty recipient/rate until royalties are frozen;
- transfer collection administration through a two-step process.

Cannot:

- mint directly;
- change the renderer, proof router, or witness registry;
- alter token genome/state/memory/audit roots;
- reverse Ascension;
- execute a sovereign account;
- bypass sovereign transfer rules;
- overwrite reserved metadata.

### Proof router administrator

Can replace verifier mappings **until the router is frozen**. Every mapping stores and checks runtime code hash, but the administrator can intentionally select a different verifier before freeze.

### Threshold verifier administrator

Can change signers and threshold **until the verifier is frozen**.

### Witness registry administrator

Can change domain adapters **until the registry is frozen**.

**Operational rule:** a holder should not Ascend a valuable organism unless the exact verifier path and required configuration have been reviewed and frozen, or unless the constitution/proof design explicitly tolerates governance.

## Attack analysis

### Replay across account or chain

Mitigation: action statement includes account address and chain ID. It also includes the exact next nonce and validity window.

### Replaying the same intent

Mitigation: exact nonce equality; nonce increments in the same transaction.

### Relayer substitution

A relayer has no authority. Any address can submit a valid proof. The target sees the organism account as `msg.sender`. The audit root still records the relayer for attribution.

### Calldata substitution

Mitigation: `keccak256(calldata)` must equal `intent.dataHash`.

### Policy substitution

Mitigation: `intent.policyHash` must equal the immutable `constitutionHash` installed at Ascension.

### State desynchronization

Mitigation: intent prior root must equal current account root. Canonical evolution additionally requires the collection's independently derived evolution root to equal the account's already-advanced state root.

### Session privilege escalation

Mitigation: exact target and selector, per-call value limit, validity window, maximum calls, Bound-only mode, and epoch invalidation at Ascension. Sessions cannot call the account itself.

### Reentrancy

All three execution paths use one account-level guard. State changes revert if the target call fails. No delegatecall exists. Value-bearing calls still require target-level security analysis.

### NFT transferred to its own account

Mitigation: transfers to the token's own account, collection, or account factory are rejected. This avoids a self-ownership deadlock for the direct account.

### Malicious receiver callback during mint/transfer

Mint initializes organism state and account before the ERC-721 receiver callback. A receiver rejection reverts all state, account deployment, and endowment movement. Transfer follows checks/effects/callback semantics and the entire transfer reverts on rejection.

### Verifier metamorphosis

Mitigation: verifier runtime code hash is stored by the router and checked for every verification. ZkVM adapters and composite verifiers also pin child/gateway code hashes. This does not defend against a proxy whose runtime code remains constant while implementation storage changes; production configuration should prefer immutable verifier deployments or separately commit proxy implementation state.

### Threshold duplicate signatures

Mitigation: recovered signer addresses must be strictly increasing. Repeated or unordered signatures fail.

### Front-running birth entropy

Commit/reveal hides the secret at commitment time. Seed derivation also uses a delayed block hash and `prevrandao`. This reduces user/observer selection but is not an unbiasable randomness beacon. High-value rarity allocation should add a VRF or distributed beacon adapter.

### Private-memory disclosure

Only a root is stored. This contract does not encrypt data or manage keys. A weak encryption/key-release system can still disclose the plaintext. Use audited encryption, authenticated ciphertext, independent key shares, and explicit recovery/deletion policy.

### Cross-chain spoofing

The registry trusts each configured adapter. It only ensures caller authentication and monotonicity; it does not prove the adapter's transport is sound. Verify peer configuration, finality assumptions, DVN/validator sets, and message parsing in the concrete adapter.

### Renderer denial of service

The renderer is immutable and bounded to nine ring iterations. `tokenURI` is a view call and does not affect ownership or account execution. Frontends should tolerate rendering failure independently of asset custody.

### Constitution compiler mismatch

A human-readable policy can be misleading if its hash was produced from different canonical bytes. The included planner uses sorted-key canonical JSON, but production must publish the canonical policy bytes and compiler hash. The native kernel should verify public inputs against the exact constitution commitment.

## Required pre-mainnet work

1. Independent Solidity audit with special attention to ERC-721 edge cases, account self-reference, receiver callbacks, and proof router governance.
2. Stateful fuzzing of all invariants in `docs/PROTOCOL.md`.
3. Differential tests among Solidity, JavaScript, Rust, and each zkVM guest.
4. Real SP1 and/or RISC Zero guest build, verifier deployment, proof generation, and gas benchmarking.
5. Independent TEE attestation verification rather than generic operator signatures if TEEs are used.
6. Concrete cross-chain adapter audit and remote-peer configuration review.
7. Formal policy schema, canonical serialization, upgrade/versioning rules, and emergency design.
8. Economic analysis of sovereign transfer, lost proof infrastructure, liveness, griefing, and relayer incentives.
9. Public testnet deployment and recovery rehearsal.
10. Reproducible builds and verified source publication.

## Disclosure

Do not publish an exploitable report against a value-bearing deployment. Contact the deployment operator privately and include transaction traces, affected invariants, and a minimal reproduction.


## Iteration 1.2 client boundary

See [protocol revisions](PROTOCOL-CHANGES-1.2.md) and [deployment guide](DEPLOYMENT.md). Preview receipts are unsigned SHA-256 consistency records. The renderer, audio, memory traces and local Ascension do not execute contracts. A separate, explicit testnet client can request wallet transactions; it has no production-key access and blocks mainnet. Its mocked-provider tests do not prove deployed EVM behavior. The exact archived original remains a visual reference with historical simulation labels, not a verified proof UI.
