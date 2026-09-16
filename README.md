# ANIMA · MASTER NFT PROJECT

An Ethereum/EVM NFT with its original blue interface, an NFT-owned account, and owner-selected programs and saved state. The contracts are Solidity. Browser programs are JavaScript/HTML stored as immutable onchain bytes and recovered in the browser.

Version 7 adds a modular system to the complete ANIMA 6.2 project. A holder can add a cartridge or install another module version on the same NFT. Each module has its own state history; publishing a new release never updates a holder's selected version automatically.

## Mint and use the complete local project

Use Node 24.19.0 and npm 11. The initial compile/build and full onchain application deployment take several minutes.

```sh
npm run setup:full
npm run master:local
```

This starts a persistent local Ethereum chain, deploys the original application and module contracts, mints NFT #1, publishes three example modules with a shared audio dependency, installs their state, and acquires a 48 KiB legacy cartridge through that NFT's account. It verifies recovery before printing the application/workbench URLs and addresses. All balances are local test funds.

Connect a separate development wallet using the printed public development mnemonic, RPC `http://127.0.0.1:8545`, and chain ID `31337`. Never use that mnemonic for real assets. The original interface is at `http://127.0.0.1:4173`; use the printed workbench URL to prefill the module registry and NFT. Module installation, state saves and transaction proposals require owner review.

Stop with Ctrl+C; restart the existing chain with `npm run master:start`. For a fresh edition after source changes, choose a new name: `MASTER_INSTANCE=edition-2 npm run master:local`. Existing chain directories are retained. For automated deployment/recovery acceptance without leaving servers running: `npm run master:start -- --once`.

## What is included

| Component | Behavior |
|---|---|
| Original NFT and account | Existing identity, renderer, interior, music and instruments retained |
| Chunked cartridge registry | Byte-exact legacy HTML backed by immutable chunks; new registry works with the existing cartridge reader |
| Archive factory and release registry | Immutable archives, exact manifests, publishers, versions, dependencies and capability commitments |
| Per-NFT module registry | Install, update, disable and paginated history with owner/epoch and stale-root checks |
| Module state store | Separate NFT/module namespaces, append-only saves, explicit staged schema migration |
| Recoverable workbench | A complete onchain HTML document with immutable service discovery; also embedded in this edition's Atlas |
| Portable SDK and CLI | Package, validate, recover, prepare unsigned deployments, deduplicate chunks and reconcile public receipts |
| Examples | Aurora Notebook, Resonant Garden and Gift of Light, with an exact shared score release |

The original swaps, launchpad, vaults, privacy integrations, Commons, Worlds, governance, recovery and research sources remain included. Their deployment and external-service requirements still apply. See [current capabilities](docs/CAPABILITIES.md) and [the implementation map](docs/MODULES-IMPLEMENTATION.md).

## Test and recover

```sh
npm run test:modules
npm run test:modules:native          # requires native Forge 1.7.1
npm run validate:release           # complete original + module JavaScript/local suite; requires Rust and C compiler
npm run test:browser               # requires installed Playwright Chromium
npm run test:modules:browser
```

Each command reports its own evidence. Source hashes, passing local tests and a successful local mint are not an independent security audit or mainnet certification. Current observed results and remaining gates are recorded in [the build evidence](docs/MASTER-BUILD.md). Historical reports retain their original version scope.

For modules and full state recovery, read [the SDK guide](packages/modules/README.md). For an existing public testnet collection, [the deployment guide](docs/MODULES-DEPLOYMENT.md) prepares exact unsigned Solidity deployments and recovers the workbench from its onchain address. No public contracts are deployed automatically.
