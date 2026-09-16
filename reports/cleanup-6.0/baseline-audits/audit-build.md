# Build, release, and packaging audit

Read-only assessment of `ANIMA-NFT--752926ec2bc8cdc405ee5462aeb8bca4646c73f4`; no source files changed and no build or deployment was run by this reviewer.

## Coverage and evidence limits

Read all 43 authored `scripts/**/*.mjs` files (1,463 lines), the root package manifest (81 lines), root lockfile identity/dependency records, `.github/workflows/ci.yml`, `.gitignore`, `VERSION`, full `system-manifest.json` architecture/capability metadata, and related current deployment/build instructions. Parsed both onchain manifests, reconstructed both runtime archives, decoded and compared every embedded current module, compared every `web` file with `dist/web`, and checked every recorded `SOURCE-SHA256.json` hash against the attachment. Inspected all compiled artifact identities, EVM targets, immutable metadata presence, ABI relationships, and file sizes programmatically. Inspected the tests which explain the concrete deployment and CI findings. Vendored SDK/minified bytes were treated as generated/dependency artifacts and hashed/compared, not represented as line-by-line authored-code security review. Root coordinated contracts, UI, services and donor-tree reviews separately.

Root reports that source checking, static heuristics and current archive verification pass, and that 344 selected dependency-free tests pass. Full Solidity/EVM, npm dependency installs, browser rendering, funded external integrations and Rust were not rerun in this environment. Historical test-count claims are not new validation evidence.

## Keep

- Keep the original blue-object reference and optical baseline. `scripts/build-instruments.mjs:3-5` pins its hash; lines 15-18 verify original embedded assets and exact removal of the additive layer. Simplifying the release does not require discarding the approved artwork.
- Keep hash-checked chunk recovery and exact transaction-plan reconstruction. `scripts/lib/genesis-deployment.mjs:46-74` validates the archive envelope, chunk order, sizes, hashes, path containment and gzip recovery; lines 205-210 reconstruct a proposed plan against current artifacts instead of trusting a supplied hash. `scripts/lib/extensions-deployment.mjs:94-115` verifies receipts and runtime code against a stable chain block.
- Keep explicit separation between offline preparation, local fixtures and public broadcast. The newer Genesis and extension planning CLIs do not broadcast; the v4 tool requires a separate broadcast path and validates both requests before sending (`scripts/v4-deployment.mjs:30-56`).

## Change first: real defects and test-gate failures

### B1 — Documented extension deployment example cannot be prepared

**High confidence, exact source/artifact mismatch.**

`scripts/compile.mjs:73-83` constructs every compiled artifact, but line 75 conditionally adds `immutableReferences` only when the map contains at least one immutable variable. A perfectly valid contract with zero immutable variables therefore has no field at all.

`scripts/lib/extensions-deployment.mjs:48-54`, function `deploymentArtifact(a)`, requires an object at `a.immutableReferences`; line 52 throws `Compile artifacts with immutableReferences for all contracts before planning.` This function is unconditionally called for a planned deployment at line 69.

The attached deployable artifacts `PrivacyKeys.json`, `AgentPolicyGuard.json`, `NativeQuoteGroth16Verifier.json` and `SessionSponsor.json` have no immutable-reference field. They consequently cannot be planned by this code. The very first deployment in the documented example is `PrivacyKeys` (`docs/genesis/extensions/DEPLOYMENT.md:18-29`). Recompilation with the current script does not fix it, contrary to the advice at document line 59.

The test misses this real integration: `test/extensions/deployment.test.mjs:12-14` compiles custom fixtures and always attaches the map, including `{}`; it does not feed a real artifact emitted by `scripts/compile.mjs` through the planner.

**Change:** always retain `immutableReferences: {}` when empty. Keep the planner's strict check, and add one integration check using a real empty-map extension (the documented PrivacyKeys sequence is suitable). No deployment or funded test is needed to expose this bug.

### B2 — Clean CI omits dependencies required by the suite it runs

`.github/workflows/ci.yml:32-42` installs only the root package plus `integrations/console/protocol/v4-hook`, then calls `validate:genesis`. Root `package.json:59` invokes `test:all`; `scripts/test-all.mjs:3-5` recursively includes every `test/**/*.test.mjs`.

`test/extensions/proof.integration.test.mjs:9` imports `../../packages/rehearsal-proof/node_modules/snarkjs/main.js`. The isolated prover installation is provided by `package.json:72` (`extensions:setup`), which CI does not call. Therefore the clean checkout is missing a directly imported module. The DOM workbench test separately becomes skipped when linkedom is absent (`test/extensions/desk-dom.test.mjs:9-14`). This contradicts using that CI gate as evidence equivalent to the documented 497/497 manual run.

`docs/genesis/BUILD-5.9.md:33-41` describes the actual dependency setup, explicit DOM installation and `--test-concurrency=2`. Current `test-all` neither establishes that setup nor uses its concurrency limit.

**Change:** declare/install service and prover dependencies in a reproducible aggregate setup (npm workspaces or an explicit setup command), call it from CI, require DOM coverage in the designated UI job, and make the supported full-suite command identical in docs and CI. Explicitly fail a required missing dependency rather than silently skip a release gate.

### B3 — Solidity artifacts collide by contract name

`scripts/compile.mjs:71-86` writes `${contractName}.json` for every source contract. Two distinct `Base64` libraries are compiled (`contracts/src/confluence/vendor/solady/utils/Base64.sol` and `contracts/src/lib/Base64.sol`). `reports/contract-sizes.json` contains 160 entries but the artifact directory contains 159 files; the later `Base64.json` overwrites the earlier one. This is a packaging identity defect, not evidence that the runtime libraries are currently mislinked.

**Change:** identify artifacts by source-qualified name, or reject basename collisions during compile with an explicit reviewed alias mapping. Preserve source names in ABI export and deployment lookups.

### B4 — Root integrity manifest is stale

Mechanical comparison found:

| Metric | Attachment result |
|---|---:|
| Actual files | 2,290 |
| Hash entries in `SOURCE-SHA256.json` | 2,009 |
| Matching entries | 1,874 |
| Changed entries | 135 |
| Missing entries | 0 |
| Unlisted actual files, excluding the manifest itself | 280 |

Mismatches include `.github/workflows/ci.yml`, package manifests, authored Solidity/browser code, index HTML and archive bytes. New extension files and other current source are unlisted. This is stale release bookkeeping, not evidence of tampering.

`scripts/source-manifest.mjs:3` obtains names from `git ls-files`; the uploaded source archive has no Git metadata. That generator cannot directly regenerate the manifest in an ordinary extracted release. `scripts/check-source.mjs:26-33` merely parses JSON; it does not validate the recorded file hashes. `reports/source-manifest.json` is explicitly historical version 1.2.0 with `dependencyLockPresent:false`.

**Change:** make one current integrity manifest with an explicit exclusion policy; generate it after the final build and include a read-only verification command which works in both Git and an extracted ZIP. Move historical inventories under versioned history. Do not call syntax checking an integrity check in user-facing output unless hashes are also checked.

## Change next: reduce ambiguity and duplication

### B5 — Four builders overwrite the same `preview.html`

`build-preview.mjs:21`, `build-kingdom.mjs:15`, and `build-instruments.mjs:13` each write `preview.html` from different entry sources; the current `build-confluence.mjs:6-8` invokes the instruments builder, reads that output, and adds another client/shell. The current build additionally writes both `index.html` and `dist/index.html`, copies the full web tree, and writes `dist/original.html` (`build-confluence.mjs:20-22`). `npm demo` serves the old `web/` root (`scripts/serve.mjs:5`), whereas `npm start` builds/serves current `dist` (`package.json:17,57`, `serve-confluence.mjs:2`).

**Change:** give current Genesis one entrypoint/build/serve command. Archive old builders and demos under clearly versioned examples. Keep the visual reference accessible for comparison, but do not let unrelated builds silently overwrite the same release target. Prefer an ordinary module bundler/HTML composition step over nested regular-expression surgery of a historical complete application. Retain explicit preservation tests for the blue object while changing composition.

### B6 — Build steps silently reuse generated dependencies

`npm build` runs `build-confluence.mjs`, which consumes existing compiled contract artifacts, `render/living/field.*`, and browser v4 artifacts; it does not build the Solidity/v4/privacy/field dependency chain. `build-v4.mjs:3-5` and `build-workshop.mjs:3-7` produce code fingerprints from compiled bytecode, not from the source currently under review. Current main-contract artifacts all target Shanghai; the default compile targets Cancun (`compile.mjs:28`). `package.json:20` (`world`) compiles that Cancun default and then `local-world.mjs:21` runs Shanghai Ganache, an EVM-target mismatch risk.

**Change:** declare one build graph, separate outputs per EVM target, rebuild dependencies in topological order, and verify source/compiler/input hashes before deploying or serving generated fingerprints. Make `world` use the local target. Do not require a full expensive rebuild for every small edit; use a reliable source-hash cache rather than implicit reuse.

### B7 — Existing verifier checks self-consistency, not source freshness

`verify-confluence.mjs:5` checks manifest hashes, gzip lengths and embedded static imports. It does not compare embedded source modules, CSS or compiled fingerprints against current source, or require `runtime.html` to equal chunk concatenation. `check-source.mjs:7` excludes `integrations` and `dist` entirely. Archive dependency discovery/rewrite uses only `from 'relative-path'` regular expressions (`archive-confluence.mjs:6-7`), so side-effect imports and dynamic imports are not covered by that traversal.

The current attachment is coherent despite this gate weakness: all 66 embedded modules match their current rewritten source; all 104 `web` files match `dist/web`; root and dist indexes match; `dist/original.html` matches `preview.html`; the current runtime HTML matches concatenated chunks.

**Change:** use parser/bundler dependency resolution and compare output content hashes against declared build inputs; run a recovered-archive smoke test. Do not treat a stale but internally consistent archive as a current release.

### B8 — Generated output directories are never cleaned

`build-confluence.mjs:20-22` creates/copies into `dist` without removing files no longer present in source. `archive-confluence.mjs:13` similarly leaves obsolete chunk files behind if a later archive shrinks. The current attachment has no extra stale `dist/web` files; the concern is the next cleanup producing orphaned release content.

**Change:** build into a new temporary directory, verify it, then atomically replace the output. Archive through a manifest-aware packager, not recursive inclusion of old generated directories.

### B9 — CI scope is narrower than the product

`validate:genesis` covers the recursively discovered `.test.mjs` tests, but does not run the separate `test:v4` launch lifecycle command, `packages/privacy/test/offline.mjs`, Python browser regression, native optical rendering or Rust (Rust is a separate CI step). `test-all` means all matching files under `test`, not all project tests. The legacy `validate:ui` route does not include the newer extension real-DOM job.

**Change:** name suites accurately and define release gates by claims: source/contracts, real local v4 lifecycle, archived app recovery, exact supported browser interaction, and supported private runtime checks. Keep funded public/privacy lifecycle as separately recorded unmet evidence until performed. Remove redundant historic screenshots from the runtime release, not the important tests.

## Concrete remove/archive list

| Item | Proposal | Reason |
|---|---|---|
| Legacy `onchain-app/chunks` and root legacy manifest | Move to `archive/v1.7` or a separate historical release | 18 chunks / 409,658 bytes self-verify but differ from current 455,670-byte preview; current Genesis uses `onchain-app/confluence` |
| `build-preview.mjs`, `build-kingdom.mjs`, legacy serve/deploy commands | Archive or rename explicitly by historical version | Multiple entrypoints overwrite the same path or serve a different product |
| Full `dist/web` source copy in source ZIP | Generate the runtime distribution separately | Duplicates the complete source tree, including historical HTML and bundle checks |
| `dist/web/kingdom/bundle.check.js`, `dist/web/instruments/bundle.check.js`, historical reference HTML, developer/mock ABIs | Exclude from ordinary runtime distribution unless an actual runtime graph requires them | `build-confluence.mjs` currently copies everything and exports every artifact ABI, including mocks and interfaces |
| Historical inventories/reports in current root | Move under versioned history or a separate evidence bundle | Avoid confusing v1.2/v1.7 measurements with v5.9 current state |
| `SOURCE-SHA256.json` as currently shipped | Replace after final generation; keep old copy only with its original version | 135 mismatches and 280 unlisted files |
| Hard-coded `release-gate.mjs` message | Update to the real current gate status and keep it automatic | It says “Confluence 2.0” and missing “real v4 liquidity integration” regardless of current code (`release-gate.mjs:1`); removing stale wording does not establish deployment readiness |

Do not blindly remove donor source, tests, licenses, original visual references or immutable-deployment evidence. Extract the active dependency closure first, preserve exact donor commit/source identity, then place unused research and historical binaries outside the current runtime package.

## Size and onchain deployment implications

The extracted attachment contains 122,697,835 bytes. Exact duplicate contents account for 19,206,955 redundant bytes across 125 duplicate groups, mostly the source/runtime copies. `dist` is 19,414,721 bytes; `web` is 18,084,893; the largest duplicate is the 15,010,237-byte RAILGUN worker. Historical reports alone occupy 32,409,202 bytes.

Current compressed application storage is 1,111,273 bytes / 49 chunks, expanding to 2,689,512 bytes / 66 embedded modules. The mandatory local Genesis path also creates a separate worker archive (`scripts/lib/genesis-stack.mjs:18-22`), reported as 4,570,220 stored bytes / 199 chunks / seven directory shards. Together that is **248 archive chunks and 5,681,493 stored archive bytes**, before normal modules and directory contracts. This is a collection/shared runtime deployment cost, not a demonstrated per-mint cost.

Privacy chunk binaries are intentionally excluded from the source ZIP (`.gitignore:21-22`) and regenerated from the pinned tracked worker. `genesis-deployment` requires them and its help does explain the extra archive command (`scripts/genesis-deployment.mjs:12-14`).

**First-principles choice:** preserve a small permanent identity/account/art/recovery core; make large services and advanced instruments explicit independently versioned modules. Reuse an immutable resource deployment across compatible editions when reviewed, instead of making every new stack redeploy every optional dependency. Keep worker bytes recoverable if that is the chosen onchain promise, but do not confuse recoverable code with self-sufficient private execution: circuits, RPC, broadcasters and services still have separate requirements.

## Safe read-only validation commands

From the extracted project root, without building, deploying or installing:

```sh
node scripts/check-source.mjs
node scripts/static-audit.mjs
node scripts/verify-confluence.mjs
```

These establish syntax/heuristic/archive self-consistency only. Root has already run them successfully. The integrity/duplication/source-to-generated comparisons above were direct Python reads of the attachment, not test assertions inferred from old reports.

When the pinned root dependencies are available, the documented PrivacyKeys planner example can be prepared entirely offline to reproduce B1. Do not run any broadcast command for this audit. A minimal reproduction can call `prepareExtensionsDeployment` with chainId 31337, a fixed nonzero test address, nonce 0, empty externals, and one zero-value `PrivacyKeys` deployment; it throws at the missing immutable metadata before constructing a plan.

## Independent adversarial review of two core findings

### C1 — Rust policy witness binding: confirmed, with deployment conditions

Reviewed the entire Rust evaluator/CLI/Cargo manifest, the JS constitution hashing helper, SovereignAccount's verified execution, verifier adapters, selected deployment path and relevant tests. **The evaluator cannot establish that an action satisfies the installed constitution.** `proof-kernel/src/lib.rs:28-41` receives the policy rule lists and selector as witness fields. `evaluate` only compares the two supplied policy hashes at lines 115-117; it never hashes those rule fields into that commitment. A caller can leave allowed lists empty (skipping the checks at 143-160), remove forbidden targets, or replace the rules without changing either hash. The selector is independently parsed at line 101; no actual calldata is supplied, so the kernel never checks that selector against bytes whose Keccak equals `intent.data_hash`. Including it in a generated `decision_root` at 164-173 does not authenticate it.

`agent/policy-engine.mjs:26-28` does have a domain-separated canonical policy hash, but that derivation is not reproduced by the Rust evaluator. The Rust “rejects policy substitution” test changes only the hash (`proof-kernel/src/lib.rs:302-306`), not the rules while preserving the hash, and therefore misses this defect.

**Scope qualification:** this is a high-impact blocker to using this evaluator as a trusted zkVM policy guest, not demonstrated unauthorized execution against a deployed account. The Rust package is an ordinary JSON CLI (`Cargo.toml:12-21`, `src/main.rs:20-26`), with no SP1/RISC Zero guest/prover wiring. The supplied local stack installs a threshold attestation verifier (`scripts/lib/deploy-stack.mjs:21-24`), whose authority depends on configured signer signatures, not this Rust witness. Current Confluence documentation already admits unfinished witness binding (`docs/confluence/ARCHITECTURE.md:58`). It would be an overclaim to call the currently supplied evaluator a sound cryptographic constitution engine, or conversely to say this gap alone lets anybody drain the current threshold-controlled stack.

The account independently binds `keccak256(data)`, nonce, live validity window, prior state and installed policy hash (`SovereignAccount.sol:467-489`) and pins the chosen verifier before accepting proof (`:480-492`). Its onchain native-value limit and cooldown therefore remain enforced even if a future guest has this witness defect. Target/selector policy restrictions beyond its generic target check would remain dependent on a sound verifier. A correctly authorized target list and actual calldata must be inputs to a versioned policy/commitment scheme, recomputed inside the guest; authenticated state context and adversarial rule-substitution/calldata tests are required. This finding is separate from the new bounded NativeQuote Groth16 circuit.

### C2 — Former-author reflections can stale the new owner's trade review: confirmed, limited to liveness

`MemoryLedger.appendPersonal` deliberately permits a historical author to reflect on an entry after NFT transfer (`contracts/src/memory/MemoryLedger.sol:64-72`). A personal entry admits its original `author`; an account-routed entry admits its `custodianAtTime` (`:67-69`). The former holder cannot alter the new form because imprint is forced false when sender is not the current custodian (`:72`). However, **every** permitted reflection reaches `_append`, checks the shared `head[identity]` (`:95`) and replaces that same shared head (`:99`). It has no per-author or per-custody-era head.

The live journaled swap reads that shared head into immutable reviewed calldata (`web/genesis/live-protocol.mjs:69-74`). `JournalSwapRouter.swapAndInscribe` calls `journal.beforeSwap` with it (`contracts/src/memory/JournalSwapRouter.sol:41-47`), which reaches the same head check (`MemoryLedger.sol:74-78,95`). If an eligible former author appends with the latest head after the buyer prepared a journaled swap but before it executes, that reviewed swap becomes stale. They can repeat reflections on their eligible historical parent; each successful reflection requires its own transaction and current expected head.

**Conditions/limits:** an existing parent must belong to that former author/custodian; an unrelated stranger cannot do this. The main UI requires current ownership, but the authorized former author can call the public contract directly. The wallet resimulates before sending (`web/confluence/wallet.mjs:62-64`), so an already included reflection normally causes a preflight rejection and re-review, not gas loss. A reflection included after that final simulation but before the swap can cause an onchain revert. Router atomicity rolls back the swap/note/nonce together (`JournalSwapRouter.sol:64`); this does not authorize asset theft, edit old words, or unconditionally freeze all trading. An unjournaled swap bypasses this shared-head dependency (`live-protocol.mjs:73`), and a new review can succeed if no competing write wins the race.

Current local model test checks that post-sale reflection does not change form (`test/memory/engine.test.mjs:34`); the real live-protocol integration tests cover normal journaled fills and changed-custody reviews, but not a former-author reflection interleaving (`test/genesis/live-protocol.test.mjs:26-49`). **Change:** preserve historical authorship in a separate append-only reflection stream, while deriving execution freshness from a current-custody/account journal head; add a transfer → review → historical reflection → execute regression. Do not remove authors' historical reflection rights solely to avoid designing the correct state boundary.
