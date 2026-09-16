# Core cleanup implementation notes

Scope: contracts/src excluding extensions/vendor, proof-kernel, associated contract regressions. These are new source changes; immutable deployed accounts are not patched.

## Implemented

- `IDontFuckingBelieveIt.metadata(..., "core.memoryRoot")` and `organismOf(...).memoryRoot` now read the account's canonical root, matching `renderSnapshot`. The internal organism bootstrap/evolution snapshot remains stored for constructor bootstrap compatibility; it is not presented as the current root.
- `MemoryLedger` preserves former authors' reflections in an append-only per-identity/per-author `reflectionHead`. Their entries do not move `head` or imprint `formRoot`, so they cannot invalidate a current owner's pre-reviewed journaled trade. Existing `appendPersonal` argument layout and canonical `expectedHead` precondition are unchanged. Added getter and `ReflectionBranched` event; `Inscribed.head` remains the canonical head. A former author still must reference their own historical entry, and a new owner cannot impersonate that author. Returning ownership uses the canonical branch again; historical entries remain intact.
- `WorldLedger` offers bind the room administrator's epoch AND recipient account epoch. `invitationRecipientEpoch`, `moderatorRecipientEpoch`, and `memberActive` are additive getters. Posting, reactions, invitation acceptance, and moderator actions honor both epochs. Every renewed offer clears acceptance, so a transferred NFT cannot silently inherit a prior human's group or moderator permission. Room administration itself remains an authority belonging to the room's administering NFT account.
- `SovereignAccount.isValidSigner` recognizes only the current owner in Bound mode. A scoped session is never an unconstrained external signer. `executeSession` rolls back calls that change custody or its epoch mid-execution. Legacy sessions still bind target/selector/native-ETH limit only; token-budgeted exact-calldata instrument grants remain the preferred delegation route. This limitation is now explicit at the creation API.
- Irreversible sovereignty now requires the exact concrete `ProofRouter` runtime and exact concrete `ThresholdAttestationVerifier` runtime, both frozen, with a nonzero satisfiable signer quorum. `ProofRouter.frozenAuthority(id)` and `SovereignAccount.sovereignAuthorityReady()` expose the check. Arbitrary `frozen()` claims, proxies, SP1/R0 adapters and composites do not qualify. Their adapter code is preserved for research. This narrow check fixes mutable authority/configuration; it does NOT guarantee signer availability, honest policy decisions, recovery, or zk proof soundness.
- Removed obsolete compiled/deployed claims from the touched MemoryLedger, JournalSwapRouter, and ConsentGiftRouter comments. Legacy SVG metadata now describes public commitments and encryption-dependent payload privacy precisely.
- Rust host evaluator requires actual `calldata` and binds its hash/selector. The versioned policy commitment covers native cap, delay, target allow/deny lists and selectors with documented canonical serialization. Malformed policy entries and uint48 window overflow fail. Restored original independent JS statement fixture and added an independent V2 policy fixture. `proof-kernel/README.md` documents incompatibility with historical free-form policy hashes, numeric subset limits, unauthenticated witness facts, and unfinished real zkVM integration. It remains research; no production agent/constitution is silently migrated.

## Deliberately unresolved

- ExperimentCell's append-only token roster can still be poisoned by a balanceOf implementation that begins reverting. Skipping a failed token or deleting it would let an estate covenant omit assets/liabilities silently. Functioning individual assets can still be withdrawn with `withdraw`; unrelated execution and covenant snapshots may remain blocked. A complete retirement design needs a manifest-visible retired/unknown asset state and settlement refusal/explicit buyer acceptance. No unsafe skip-balance shortcut was introduced.
- Legacy broad token session calldata is still unrestricted beyond target/selector; stronger instrument grants exist, but a breaking onchain migration was not invented.
- Immutable threshold authority is still irreversible and dependent on living signers. Unsupported zk/proxy/composite trust dependencies are intentionally barred from irreversible promotion.
- Public historical chat bytes, account-authored message attribution, royalty/agent registry claim verification, launch integration, and complex recovery designs are not silently redefined by these targeted repairs.

## Verification

- Node syntax checks passed for both modified/new EVM test files.
- Original statement fixture regenerated using the existing ethers-based script and independently with the dependency-free web ABI codec: `0xff51d669fb89a7bec589b39ff7588deca31d7c7334272704fb9f1132599fb76b`.
- Independent V2 policy fixture: `0x1b1ad46bab026173c034426f8a36427bdb41be86c0177cf7564c71ce8a87a8f1`.
- Added EVM regressions in `test/core-cleanup.contracts.test.mjs`; expanded `test/contracts.integration.test.mjs`. They require freshly compiled artifacts including the new test-only `CoreCleanupHarness.sol`.
- Added nine Rust tests in total (four original tests updated, five new tests) covering acceptance, stale windows, policy substitution, calldata/selector substitution, width/malformed inputs, canonical serialization, and independent cross-language fixtures.
- Root agent is coordinating compilation, production runtime-size checks, and EVM execution. Rust toolchain was unavailable during initial local inspection. Execution results will be appended when available.

### Completed EVM verification

Fresh root-coordinated compilation succeeded. Deployed runtime sizes: SovereignAccount 21,225 bytes; SovereignAccountFactory 23,142; ProofRouter 4,793; ThresholdAttestationVerifier 2,586. Both account and factory remain below the 24,576-byte EIP-170 limit (factory headroom: 1,434 bytes).

- `test/contracts.integration.test.mjs`: PASS, complete actual local EVM lifecycle including the new signer, custody-change rollback, immutable authority and canonical-root assertions (16.3 seconds).
- `test/core-cleanup.contracts.test.mjs`: PASS, 2/2 new local EVM regressions (3.4 seconds), including former-author branching plus prepared swap-head stability and renewed membership/moderator consent after both sides' custody changes.
- Initial memory-test comparison used ethers `Result` objects directly and failed despite equal serialized fields; normalized both results to plain arrays and reran the complete new suite successfully. This was a test representation fix, not a Solidity change.
- `git diff --check` and Node syntax checks passed for the edited scope.
- Logs: `/workspace/scratch/3b7470161c8a/cleanup-core-tests.log` (initial combined run: main/social passed, memory assertion representation failed) and `/workspace/scratch/3b7470161c8a/cleanup-core-regressions.log` (final new suite: all passed).
- Ganache uses its JavaScript fallback because its optional native µWS binary is unavailable for this Node version. Local EVM assertions executed; this is not a skipped test.
- Rust test execution remains unverified because no Rust toolchain is installed. The fixtures were cross-checked as stated; do not report the nine Rust tests as passed.

### Final Rust and proposal-label verification (supersedes toolchain-unavailable notes)

No preinstalled Cargo/rustc was found in PATH, common toolchain locations, or the primary runtime. Downloaded the official rustup installer from static.rust-lang.org, verified its published SHA-256, and installed the minimal official Rust 1.98.1 toolchain entirely under `/workspace/scratch/3b7470161c8a/rust-check` with `--no-modify-path`. No system packages or shell profiles were changed. Cargo registry/cache and compilation target directory also stayed in scratch, outside the project.

`cargo test --manifest-path proof-kernel/Cargo.toml`: **PASS, 9 tests, 0 failures**. Binary and documentation test targets also passed (no test cases). Log: `/workspace/scratch/3b7470161c8a/cleanup-rust-tests.log`. Added generated `proof-kernel/Cargo.lock` to preserve the dependency versions used for this verification. The research-only boundary and untrusted dynamic witness limitations remain; passing these host tests does not constitute zk verification.

Relabeled `agent/policy-engine.mjs` as a deterministic proposal builder using caller-supplied context. Its returned explanation now uses `proposalProperties` in place of the misleading `guarantees` field, explicitly identifies supplied collection/genome/root inputs, and describes replay checks as the executor's responsibility. Commitment output is not described as encrypted memory. There were no consumers of the old explanation field in the repository. The existing agent/MCP test suite passed **3/3** after the text/schema-label change. No action encoding, hashes, target selection or execution authority was changed.
