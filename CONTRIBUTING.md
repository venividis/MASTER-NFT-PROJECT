# Contributing

Work in authored source and preserve the original blue visual vocabulary. Regenerate `dist/`, contract artifacts and embedded runtime bytes from recorded inputs. Historical HTML is comparison material, not the active JavaScript source.

## Setup and gate

```sh
npm ci
npm run setup:validation
npm run validate:genesis
```

The isolated extension, prover and v4 dependencies are required by the main JavaScript gate. DOM coverage is required and fails clearly if its dependency is missing. Never count skipped checks as passes. Distinguish fixtures, native renders, browser interaction and chain execution in the release record.

For additional SDK/toolchain checks:

```sh
npm run setup:full
npm run test:privacy
cargo test --manifest-path proof-kernel/Cargo.toml
python test/genesis/blue_projection.py
python test/genesis/interior_render.py
```

Rust requires Cargo. Native rendering requires Python, NumPy, Pillow and Mesa EGL/GLES; it is distinct from browser/device testing. The v4 local-chain test uses its pinned Anvil package. Routine installation/testing must not regenerate development proving keys.

## Integrity

Build before archive creation. Verify source freshness, module closure, immutable bytes and pinned resources. Compiler artifacts have source-qualified identities, including libraries sharing a basename. Deployment inputs must match compiler fingerprints and immutable reference maps.

Checksums must verify in an extracted ZIP as well as git. Generate the source manifest after intentional edits, then verify it. Preserve historical evidence under its original version.

Review consequential changes with regressions for the actual invariant. Preserve transaction review, ownership epochs, liability checks and encrypted recovery. Changed immutable contracts need new deployments. A source cleanup does not authorize public deployment or publication. Keep real secrets and personal records out of fixtures and packages.
