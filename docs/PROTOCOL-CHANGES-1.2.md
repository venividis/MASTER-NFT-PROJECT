# Protocol revisions in 1.2

**Status: source changes and regression assertions are included; the Solidity compiler and EVM integration suite did not run successfully in this environment.** These are reasoned fixes, not audited or empirically proven repairs. Deploy a fresh local/testnet stack only after the full suite passes. The immutable v1.0 account cannot be patched in place.

## Bound evolution

In the inherited implementation, collection `commitEvolution` required the token account as caller and required the account's `stateRoot` to equal the derived next evolution root. Ordinary account `execute` did not advance that root. `executeVerified` could advance it, but was Sovereign-only. Thus the normal Bound execution path could not complete an evolution.

`SovereignAccount.evolveBound(expectedNonce, newGenome, newMemoryRoot, evidenceHash)` now checks Bound controller authority and nonce, asks the collection to derive the next root, updates account state/memory/nonce, calls collection `commitEvolution`, and appends the account audit entry. Any collection rejection reverts the entire transaction. It is explicitly **owner/approved-controller authorization**, not a ZK proof.

The internal `_call` accepts `bytes memory` so it can receive the locally ABI-encoded call. The collection interface exposes the two existing evolution methods used by this path.

## Sessions at transfer

The old epoch invalidation existed for Ascension and explicit invalidation but not ordinary NFT transfer. A still-active session could otherwise outlive its granting owner.

Collection `_transfer` now calls `invalidateSessionsOnTransfer()` on that token's account. Only the immutable collection can call this new method. It advances the epoch for transfers, including transfer-back. It intentionally has no independent reentrancy guard because proof-authorized transfers can call back from inside account execution; authorization remains collection-only and effects remain transactional.

## New regression assertions

The integration test adds assertions for unauthorized Bound evolution, accepted synchronized roots, stale-nonce rejection, rollback after collection rejection, transfer and transfer-back epoch advancement, rejection of old sessions, rejection of unauthorized epoch invalidation, and rejection of Bound evolution after Ascension.

**These assertions are not counted among the passed local UI tests.** Their runtime behavior, compiler output, gas, bytecode size and interaction with every inherited invariant still need EVM validation.

## Deployment compatibility and remaining risks

No proxy upgrade is supplied. A new deployment uses new account bytecode and therefore different CREATE2 addresses. Never assume a v1.0 address has the new method. Recompile, deploy, query snapshots, rehearse mint/evolution/transfer/Ascension, and retain deployment manifests.

Bound controllers include the NFT holder and active approvals in the inherited authority model. Approval can therefore grant account powers beyond a conventional marketplace transfer; use isolated development wallets. Nested account-ownership cycles, untrusted targets, malicious verifier gateways, mutable administrative trust roots, and proof-system soundness require independent review. Code-hash pinning does not by itself prove the immutability of a proxy's implementation or external dependencies.
