# Running the production validation work

This workflow establishes local test evidence for a specific ANIMA candidate. A successful local run does not certify browser/device behavior, public integrations, deployment configuration, or security.

## Start from a reviewed candidate

Preserve the received archive and its `SOURCE-SHA256.json` before editing. Use a versioned working copy. Verify the received inventory before generating any replacement inventory:

```sh
npm run integrity:verify
```

After intentional edits, inspect the source diff and generated artifacts. Generate a new candidate inventory as an explicit release preparation step, then verify it. CI never regenerates an inventory to conceal an unexpected mismatch.

```sh
npm run integrity:generate
npm run integrity:verify
```

The inventory includes distributable generated outputs and evidence as well as source. Builds and integration tests can change those outputs. Preserve the run evidence, review those changes, and create the final distribution inventory after the final build. The source fingerprint recorded by the validation runner separately detects unexpected authored-input changes during a run.

## Complete local run

The checked-in CI configuration pins Node 24.19.0, Rust 1.98.1 and Ubuntu 24.04. Local native Keccak comparison also requires a C compiler (`cc`, or set `CC`). Install from the checked-in lockfiles:

```sh
npm run test:validation-runner
npm run validate:release -- --install
```

`--install` runs the existing full dependency installer. If the exact locked dependencies are already installed, omit it. The runner executes explicit leaf commands for root JavaScript tests, compiler/build verification, archive recovery and local minting, active protocol suites, offline privacy cryptography, native Keccak comparison and Rust. Use `--list` to see the authoritative stage inventory.

```sh
npm run validate:release -- --list
npm run validate:release -- --stages=communication,rust
```

A selected-stage result is partial evidence and may reuse pre-existing prerequisites. It does not replace a complete run. Each invocation creates a new evidence directory under `.local-genesis/validation/`, or an explicitly selected output directory outside the project. Keep the JSON status and both output logs. Skips, TODOs, cancellations, empty or malformed test summaries, timeouts and missing dependencies must remain visible.

If an executor forcibly destroys the process before finalization, the last durable status may still be `running`. Such a report is incomplete; only an explicitly completed successful report establishes a pass. Do not infer completion from existing generated reports or screenshots.

## Filesystem requirements

Ganache needs a writable temporary filesystem with functioning database I/O. On the Work Mode environment used for the first baseline, the default `/tmp` filesystem returned `Input/output error` during LevelUP database creation. A bounded startup-and-transfer reproducer confirmed that setting `TMPDIR` to a task-specific directory on `/dev/shm` resolved that local simulator failure. Rust toolchain installation also needed a filesystem with functioning `fsync`.

On an affected Linux executor, create a disposable directory and export its path **before** starting Node:

```sh
anima_test_tmp=$(mktemp -d /dev/shm/anima-tests.XXXXXX)
export TMPDIR="$anima_test_tmp"
npm run validate:release
```

Record this environment choice. Temporary memory storage is suitable for disposable local chain fixtures; it does not demonstrate durable service persistence or crash recovery. Run persistence acceptance on the intended disk/database configuration. Do not change production storage or weaken database durability to obtain a test pass.

## Browser and device acceptance

The current application entry is `dist/index.html`. Build the current candidate and run the independent browser job on an executor that permits local browser access:

```sh
npm run validate:release -- --install --stages=integrity,syntax,compile-core,compile-v4,build,verify-compilation
npx --no-install playwright install --with-deps chromium
npm run test:browser
```

See `test/browser/README.md` for scope and evidence. The harness uses deterministic wallet responses with rejected signing, and does not transact real funds. Passing its Node regression tests validates the harness; it does not mean its seven browser scenarios have run. Chromium emulation also does not replace Firefox/WebKit, physical phones, actual wallets, accessibility, or performance acceptance.

The managed browser in the first Work Mode baseline rejected localhost access with `net::ERR_BLOCKED_BY_CLIENT`. Browser execution remains unverified in that environment. Use the supported CI/browser environment; do not treat a policy block as application success.

## Remaining production gates

- Run stateful campaigns for all supported asset and liability models, including malicious callbacks/tokens, LP/fee accounting and cross-chain terminal-state conservation. The new owner-authority regression covers two deterministic seeds and one ordinary token model.
- Validate exact target-chain compiler settings, deployed code, immutable parameters and custody/service configuration.
- Exercise real privacy proofs and broadcasting, public transport delivery, keepers and authenticated services where promised. Local/offline fixtures cannot establish those outcomes.
- Demonstrate backup restoration, process/disk failure recovery, monitoring and incident actions on the intended service environment.
- Review dependency advisories against actual reachability. Avoid blanket audit fixes that change pinned compilers, protocol packages or proving material without compatibility evidence.
- Obtain independent security review of the exact source and deployment configuration, then regression-test any repairs.

Keep each gate tied to its actual candidate, environment and evidence. The development release's documented trust assumptions and research limitations continue to apply.
