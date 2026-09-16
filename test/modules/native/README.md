# Native module contract tests

Run the checked-in Solidity fixtures in Forge's native EVM, using the project's locked Solidity compiler:

```sh
npm ci
npm install --prefix /tmp/anima-forge-toolchain --no-save --ignore-scripts @foundry-rs/forge-linux-amd64@1.7.1
FORGE_BIN=/tmp/anima-forge-toolchain/node_modules/@foundry-rs/forge-linux-amd64/bin/forge node scripts/test-modules-native.mjs
```

The installation example targets Linux x64 (including Ubuntu CI). On another supported platform, install that platform's `@foundry-rs/forge-*` package at the same exact version and point `FORGE_BIN` at its native executable. The project runner does not install tools or download a compiler. Root `npm ci` supplies `solc@0.8.30`; the checked-in adapter passes standard JSON unchanged to that compiler and rejects another version. Forge's npm JavaScript wrapper is deliberately rejected because its child exit status is not reliably propagated in version 1.7.1.

`--forge=/absolute/path/to/forge` replaces the environment variable. `--output=/path` changes the default `.local-genesis/modules-native` evidence directory. Each invocation creates a unique directory with stdout, stderr, native artifacts and `results.json`. The runner requires nonempty, parseable test results, no failed/skipped cases, and successful native process exit. The fixed offline configuration uses Shanghai, via IR, optimizer 1,000, and 64 reproducible fuzz runs. It compiles module fixtures and their import closure only. Timeout or interruption terminates the process group on POSIX; an external force-kill can leave the checkpoint marked `running`, which is not a pass.

The native cartridge fixtures exercise code substitution, ordering/digest/size failures, frozen releases, safe-mint rollback, ownership/epoch behavior and fuzzed byte recovery. Their small ownership test doubles are explicitly unit fixtures. The separate genuine-native integration command is:

```sh
TMPDIR=/dev/shm node --test test/modules/cartridges.integration.test.mjs
```

That integration mints the actual native ANIMA first, then deploys the new registry, acquires a 48 KiB three-chunk edition through the unchanged wallet, and executes the unchanged launcher function in a Node DOM harness. It checks the real ownership transfer/epoch and retained old edition. Its bounded original runtime fixture is not the entire production Genesis application; the launcher harness is not a real browser rendering test. Original art source, seed, genome, proof state and renderer/runtime bindings remain unchanged. Ordinary reviewed account activity advances its nonce and audit root and therefore changes live activity artwork as designed. These are local contract results, not deployment or production certification.
