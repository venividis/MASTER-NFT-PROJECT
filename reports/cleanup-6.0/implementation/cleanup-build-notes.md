# Build and release cleanup notes

Implemented in `/workspace/scratch/3b7470161c8a/ANIMA-NFT-cleanup`.

## Compiler and planning

- Production Solidity writer always emits immutableReferences (including `{}`) and both link-reference maps.
- `contracts/artifacts/index.json` records source-qualified artifact identities, source/compiler recipe hashes, compiler settings/input hash, artifact hashes, and unique compatibility names. Both real Base64 libraries survive under qualified paths; ambiguous `Base64.json` is intentionally absent. Unique deployment imports retain their existing paths without duplicate artifact bytes.
- Compile publishes only a complete size-checked staged artifact set and preserves prior outputs on failure.
- `verify-compilation.mjs` checks source inventory, compiler build recipe, all emitted bytes, alias identities and unlisted artifacts. Genesis and extension deployment planning enforce source freshness when using the default root artifact directory. Explicit fixture directories still work for offline integration tests.
- v4 compiler captures its actual imported source closure, compiler/package recipe hashes and all emitted source contract artifacts in `artifacts/compilation-inputs.json`. `verifyV4Compilation` catches changed upstream code and stale generated runtime pins; current build invokes it, and build-v4 enforces it.
- `scripts/build-exit.mjs` produces `web/exit/artifacts.mjs` containing the real VestedExitVault ABI and immutable-masked runtime hash for contract identity checks.

## Setup, tests and CI

- Root dev dependencies pinned and installed: esbuild 0.25.12, es-module-lexer 1.7.0, parse5 7.3.0, prettier 3.6.2. Package/lock engines now require Node >=22.11.
- `setup:validation` installs root + agent/extensions (including DOM) + rehearsal-proof + v4 locked dependencies. `setup:full` additionally installs privacy SDK; `setup:ui` installs root + agent/extensions. Supports explicit `--offline`. V4 lifecycle is enabled for the pinned Anvil binary; other dependency installs use ignore-scripts.
- `test:javascript` (and compatibility alias `test:all`) means every `.test.mjs` under `test`, with concurrency 2. Missing DOM/prover/service dependencies fail explicitly. UI mode is a clearly named selected subset with required real DOM. Browser/Python, Rust, v4 lifecycle and privacy offline SDK are named separately.
- `validate:local`: root compile for Shanghai, v4 compile Cancun, current build, syntax, static heuristics, all JS tests, archive recovery and disposable local deployment.
- `validate:full`: local gate plus v4 lifecycle, real privacy SDK offline and locked Rust tests. It does not claim Python/browser/device or funded/public-network verification.
- CI installs the full locked dependency closure of every job. Main job validates local protocol/DOM/archive + v4 lifecycle + Rust; separate privacy SDK offline job executes the pinned library.
- Root historical world now compiles Shanghai for its Shanghai local Ganache.

## Integrity and packaging

- SOURCE-SHA256 generator enumerates regular files directly, so it works with or without Git. Explicit exclusion policy omits dependency installs, Git/cache/local state, environment secrets, logs and itself. It includes generated runtime, current source, references and evidence.
- `integrity:generate` writes a deterministic current manifest; `integrity:verify` detects changed/missing/unlisted bytes and changed exclusion policy. `--root <extracted-directory>` supported.
- Syntax checker is labeled JavaScript syntax/JSON parsing rather than incorrectly claiming hash integrity.
- `report:release` is read-only and checks integrity + compiler freshness without overwriting historical evidence. Public `deploy` message uses current package version, names actual explicit plan workflows, and sends no transaction.
- Coordinated source_build's current build/serve/history/release package names in package scripts. Independently reviewed source package omission patterns: authored JS tests use retained original fixtures, generated compile/build/archive outputs, or disposable test fixtures; no historical reports/donor imports found in active JS tests. Flagged old Python preview/report-dependent commands for explicit historical naming.
- Requested source_build include verified per-package SOURCE-SHA256 after PACKAGE-MANIFEST and runtime-specific start instructions. Clean extracted-source validation must compile local+v4 and build/archive before running suites because generated root artifacts are intentionally excluded from the source ZIP.

## Fresh verification evidence

`node --test --test-concurrency=2 test/build/compiler-artifacts.test.mjs test/build/source-integrity.test.mjs test/extensions/deployment.test.mjs`: 8 passed, 0 failed, 0 skipped. Includes real Base64 library production emission, source/output/recipe mutations, no-Git manifest parity and tampering checks, all four formerly blocked real extension artifacts, exact local deployment receipt validation and negative cases.

This run preceded default-planner freshness guard addition and v4 manifest addition. Rerun focused deployment/genesis/build tests after source_build's coordinated final root/v4 compilation. New `test/build/v4-compilation.test.mjs` copies the actual compiler-emitted import closure and proves upstream-source and artifact tampering detection. Root-wide validation remains coordinated by root to avoid parallel compiler mutation.

## Final focused rerun after guarded planners and fresh main/v4 compilation

`node --test --test-concurrency=2 test/build/compiler-artifacts.test.mjs test/build/source-integrity.test.mjs test/build/v4-compilation.test.mjs test/extensions/deployment.test.mjs test/genesis/deployment-plan.test.mjs`: **15 passed, 0 failed, 0 skipped**, 7.7 seconds. Includes complete real isolated Genesis deployment/archive/constructor wiring test and default root-artifact freshness guards.

`node scripts/verify-compilation.mjs`: **163 source-qualified artifacts verified** against current source and Shanghai compiler recipe. `verifyV4Compilation(process.cwd())`: **33 actual source inputs verified** from v4 compiler closure.

Also added v4 deployment CLI source freshness preflight before any provider or signer is created. Main/source archive/serve now enforce root and v4 source freshness through source_build integration. Public `--help` remains usable without compiled outputs.

Root authorized renaming stale Python browser and historical report-inspection aliases to `history:test:browser` and `history:inspect:operating`. Current root README/START-HERE commands match the clean source setup. The old versioned docs preserve their historical text.

## Independent clean source package rebuild (completed)

- Independently verified both PACKAGE-MANIFEST and SOURCE-SHA256 for the final code source ZIP: 1,117 entries, 10,414,305 bytes; ZIP SHA256 `a618b51b129ba8864069bc4f5ecfa343a1a4a67c33bb437d9a2db6ba8136c920` (a later docs-only repack may change ZIP identity).
- A true clean offline `setup:validation` uncovered npm's dev-dependency update stripping the inherited optional marker from Ganache's Darwin-only fsevents dependency. Restored the original `optional:true` lock metadata (chokidar already declares fsevents optional), changing no dependency version. Clean offline installation then passed all four locked package trees: root 360 packages, agent/extensions 31, rehearsal-proof 68, v4 20. No node_modules symlink/copy shortcut was used.
- Extracted source syntax/JSON check passed, 515 files initially inspected.
- Fresh extracted-source Shanghai compilation passed; all **163 source-qualified artifact byte hashes and the complete compiler input matched the main project exactly**.
- Fresh extracted-source Cancun v4 compilation passed using retained actual upstream source dependencies.
- Overlaid final authored-only code/lock/classification edits, removed vendor reports relocated to reference package, and preserved the independently installed dependencies and independently compiled contract/v4 artifacts. No generated contract artifacts or main dist output was copied into this clean build.
- Clean current runtime build passed: 467,825-byte composed HTML, 66 modules, 78 distribution files, approved original comparison unchanged.
- Clean archive and full recovery verification passed: **49 chunks, 1,123,901 stored bytes, 2,805,607 expanded bytes**, archive SHA256 **`1374b40cb8f87ece65035e2e317e4fbeffbadf88a08fc51470a29face9dadb26`** exactly equals the main project's final runtime.
- Clean `node --test --test-concurrency=2 test/build/*.test.mjs`: **13 passed, 0 failed, 0 skipped**. Covers composition, dependency graph, stale outputs, atomic writes, source/v4 integrity, archive freshness and packaging boundaries.
- Default Genesis planner now verifies its archived runtime against the current source build using existing expandedRuntime logic, compares build fingerprint/module graph/recovered HTML, and validates current v4 source before planning. Explicit alternate archive paths retain historical/test use. Focused `test/build/deployment-source.test.mjs` plus `test/genesis/deployment-plan.test.mjs`: **7 passed, 0 failed, 0 skipped**, including complete isolated local deployment and new self-consistent-but-stale archive rejection.

Package review additionally fixed source inclusion of abandoned atomic staging outputs; exactly reserved release/dist/confluence stage/previous paths are excluded. The regression proves similarly named authored directories elsewhere remain included. Package-specific guides now avoid overwriting the original START-HERE after hashing, and final guides use Node >=22.11.
