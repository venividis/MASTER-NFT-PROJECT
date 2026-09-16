# ANIMA 6.0 cleanup record

The first cleanup pass preserves ANIMA's procedural blue identity, interior, formed interface, NFT-owned account and recoverable code. It removes conflicting authority, misleading completion claims, brittle build dependencies and unnecessary primary navigation. The supplied archive remains the historical baseline.

Original archive SHA-256: `ff1814055c345bfc9ea78525e51c54f3c7b89ed4e9ee3ffcc747f5d20d7658c0`.

## First principles

1. **Identity needs one authoritative state.** A selected NFT must render its chain state; local rehearsal cannot alter that claim.
2. **Authority must follow custody and explicit consent.** Former owners and session keys retain only the permissions they were actually given.
3. **A private record includes its metadata.** Encrypting a key while leaving its project, policies and recovery history exposed is incomplete.
4. **A confirmed transaction and a refreshed screen are separate events.** Keep the receipt even if a later read fails; reconcile uncertain submissions before retrying.
5. **Recoverability starts with reproducible source.** Build from authored modules, record exact inputs and verify recovered bytes.
6. **Every feature has a cost and a boundary.** Keep useful modules available, but reserve the main navigation for ordinary goals and label research accurately.

## Implemented changes

| Area | Change | Result |
| --- | --- | --- |
| Compiler artifacts | Explicit immutable maps, source-qualified index, duplicate Base64 preservation, atomic outputs and freshness fingerprints | Deployment planning sees the metadata it requires and cannot silently use stale source |
| v4 artifacts | Compiler/import/output fingerprints checked before UI generation | Token/pool runtime templates remain tied to current dependency sources |
| UI build | Real module bundling/import discovery and structural HTML composition | Authored source drives the app; historical inline HTML is no longer the JavaScript source |
| Runtime/recovery | Exact module closure, clean output staging, resource checks and source freshness | Missing imports, orphan output and stale archive bytes are rejected |
| Canonical memory | Collection getters and renderer use the account root | Non-evolution memory actions remain consistent across public views |
| Former-owner reflections | Separate author branches | Old owners can write reflections without changing a current owner's pre-reviewed canonical journal head |
| Social consent | Recipient custody epochs included in invitation/moderator acceptance | Transfer cannot inherit another owner's accepted room authority |
| Sessions | Owner-only external valid signer; post-call custody epoch check | Scoped keys do not become general signers or retain authority through an NFT transfer callback |
| Sovereign promotion | Recognized frozen router and threshold-verifier code required | Irreversible custody cannot enter an administrator-mutable or counterfeit frozen route |
| Research policy kernel | Policy-rule and calldata-preimage binding; restored vectors | Evaluator checks the supplied policy/selector commitments and documents unauthenticated state assumptions |
| NFT UI provenance | Explicit selection modes, one-block refresh and stale snapshot state | Local history cannot color a minted NFT; successful receipts survive refresh failure |
| Navigation | Shared primary destinations, Memory storage choice, Advanced entry, accurate export scope | Ordinary actions are easier to find; all retained modules remain reachable |
| Rendering/audio | Shared visible-frame subscribers, paused-camera invalidation, shared organism audio, short repeat formation | Less duplicate scheduling/audio; original object and first ceremony retained |
| Mint sanctuary | Whole-record encryption, unlock-only legacy migration, opaque locked index and encrypted backup | Policy, recovery and project metadata are protected with the key |
| Private submission | Durable fingerprint/hash/status, persistence acknowledgement and exact recovery | Lock/restart can reconcile pending submissions without blind resending or public fallback |
| Exit/v4 configuration | Pinned runtime templates and advanced deployment controls | Compatible-looking getters alone are insufficient for contract identity |
| Shared worlds | Concurrent session cap, retained character state and hashed guest resume | Ordinary churn no longer exhausts lifetime player slots; orders and inventory survive disconnection |
| Agent services | HTTPS for remote bearer credentials, loopback HTTP allowance, redirect/referrer restrictions | Credentials are not sent to arbitrary plaintext remote endpoints |
| Proof setup | Guard committed artifacts as well as transient manifests | A fresh checkout cannot silently replace the existing development proving setup |
| Validation/docs | Required isolated dependencies and DOM coverage; current entry points and licensing notices | Missing coverage fails clearly, and historical claims no longer masquerade as the current release |

## Removed from the active path

- Dependency on a historical HTML file as the source of current controller behavior.
- Silent basename overwrites and missing immutable-reference metadata.
- Local rehearsal traits leaking into a selected minted identity.
- Former-owner writes advancing the current canonical journal.
- Unrestricted signer status for scoped session keys.
- Plaintext burner project/policy/recovery records after migration.
- Duplicate top-level technical destinations, broad “export everything” wording and ordinary-flow feature numbers.
- A permanent player-admission count that treated offline characters as active sessions.
- Claims that bounded proofs, frozen custody shares or separate creator-fee hooks complete their broader ambitions.

Historical experiences, reports, imported research and redundant generated payloads are separated from active source/runtime distribution, with manifests. Necessary optical comparison fixtures and active v4 dependencies remain. Historical entry-point documents are preserved in `docs/history/5.9-entrypoints/`.

## Deliberately unfinished

| Work | Why it needs another design pass |
| --- | --- |
| Creator-choice launch economics and private hook integration | The current launch desk is no-hook. A coherent creator-fee design must specify recipients, fee authority, liquidity custody and shielded compatibility together |
| Recovery from a reverting tracked token | Skipping a broken asset could hide liabilities and weaken estate-sale consent |
| Operational shareholder governance | Current shares represent frozen custody; turning them into an operating account changes authority fundamentally |
| Production arbitrary-execution proofs | Authenticated state, complete execution claims, reviewed circuits/guests and deployment-specific trust are absent |
| Forward-secure group messaging | Existing epoch encryption does not provide forward secrecy |
| Large-scale multiplayer storage | Active sessions are fixed, but the single-snapshot World service retains a documented storage bound |
| Public deployment and funded shielded validation | These are separate chain/service operations; no such action is implied by this cleanup |

Frozen threshold authority is a deliberate fixed-attester trust model. It is not a claim of trustless computation. Existing immutable contracts do not receive source fixes automatically; new compatible deployments are required.

## Validation

Verified in the cleanup workspace on 2026-09-13:

| Check | Result |
| --- | --- |
| Full JavaScript suite | **543 passed; 0 failed; 0 skipped**. Includes real local contract lifecycles, DOM workflows, cryptography/recovery and final two-tab receipt regressions |
| Rust kernel | **9 passed** with official Rust 1.98.1 installed only for this check; dependency lock retained |
| Real v4 chain flows | **10 scenarios passed** on local Anvil/Cancun with pinned PoolManager, including launch, swap, two-holder redemption, failure/refund grouping and deployment-plan tamper rejection |
| Native original projection | **16 cases passed**; zero-formation original pixels byte-identical in desktop and portrait comparisons |
| Native interior | **9 render cases and 3 CPU/GPU parity cases passed** |
| Source/static checks | Authored JavaScript syntax and JSON passed; static heuristic scan passed. Neither is a security audit |
| Compiler/deployment regressions | **15 focused checks passed**, including both Base64 sources, immutable maps, imported v4 source drift and actual prepared deployments; these overlap the full suite |
| Final local NFT deployment/recovery | Passed: 49 app chunks, parsed minted metadata, sealed module directory, estate module and exact recovered app bytes; the privacy worker also round-tripped through 199 chunks in 7 shards |
| Offline privacy SDK | Wallet derivation, encrypted recovery, return notes and RelayAdapt grouping passed; no funded shielded transaction |
| Live browser smoke | **Incomplete**: the browser could not reach isolated preview servers; the environment rejected the request for a reachable temporary server. Native/DOM coverage is not browser/device certification |

Full-suite tests overlap targeted agent checks; their totals are not added together. Generated worker whitespace belongs to upstream template strings and is preserved byte-for-byte. Authored diffs pass whitespace checks.

Final application archive: **1,123,901 bytes in 49 chunks**, with **66 ESM modules**. App SHA-256: `1374b40cb8f87ece65035e2e317e4fbeffbadf88a08fc51470a29face9dadb26`. The privacy worker is separately pinned at `f99adbb7e692b7cd31f5ec8601362eecb787537863baf95a8a2a99c11c2b1b2b` and recovers 15,012,667 exact bytes.

Maximum deployed runtime is the account factory at 23,142 bytes, below the 24,576-byte EVM limit; preserve its remaining headroom when changing account code.

Fresh source-package validation **passed**: real locked installation from the extracted ZIP, source checks, independent main and v4 compilation, build, archive and recovered-source verification. All **163 contract artifacts** and the final app runtime match the working tree byte-for-byte. **13 clean build tests** and **7 planner compatibility/freshness tests** passed with no skips; these checks overlap other suites and are not additive. The final planner also rejects a default archive whose internally valid bytes no longer match current source.

The clean install caught and repaired a Linux `fsevents` optional-lock metadata error that an installed working tree concealed.

Raw evidence, implementation notes and the pre-cleanup audits are in `reports/cleanup-6.0/` in the reference package. Historical audits describe the supplied baseline, not the repaired state.


## Deliverables

- `ANIMA-source.zip`: current working source, dependencies pinned by lockfiles, necessary optical fixtures, setup/build/test instructions and current documentation. Approximately 10.4 MB compressed.
- `ANIMA-runtime.zip`: current static app and onchain app/privacy-resource archives. This is generated output; use the source package to change it.
- `ANIMA-reference.zip`: retained research trees, historical reports/experiences, supporting documentation and cleanup evidence. It is reference material, not the source to start a new build from.

Every package has its own file manifest and SHA-256 integrity manifest. `PACKAGES.json` records final ZIP sizes, entry counts and SHA-256 values. A temporary abandoned packaging directory was found and excluded during independent checks; package generation now excludes its own output/staging trees.

Browser/device smoke testing remains unfinished because of the execution environment's access restriction. Public deployment, funded shielded validation and the separately listed design work remain outside this completed first cleanup pass.


## Downloads

- `ANIMA-source.zip`: current source, required fixtures/dependencies, tests, instructions and notices; generated contract artifacts and dormant donor trees excluded.
- `ANIMA-runtime.zip`: current HTTP app plus both onchain app/worker resource archives and notices.
- `ANIMA-reference.zip`: retained historical experiences, research/vendor evidence, earlier reports and detailed cleanup evidence.

Each ZIP contains `PACKAGE-MANIFEST.json`, `SOURCE-SHA256.json` and `PACKAGE-START-HERE.md`. `PACKAGES.json` beside the downloads records their whole-file hashes. Hashes establish integrity, not a production security certification.
