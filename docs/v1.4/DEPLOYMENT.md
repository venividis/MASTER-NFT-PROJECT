# Deployment and migration / 1.4

## This is a review procedure, not a successful deployment record

`npm run compile` was attempted and exited 1 before Solidity execution: missing `solc`. There are no new compiled artifacts, deployed contract addresses, transaction hashes, salt candidates, or testnet receipts in this release. The UI is local. Do not use a deployment from another version as though it were this one.

The default `npm run deploy` stops with this boundary. The inherited `deploy:legacy-core` script is retained for reference, but it deploys the research core, not the new v4 economy. An external full-toolchain environment and explicit testnet-only wallet authorization are required. No private key is included or needed for browser exploration.

## Reproduce what already works

```sh
npm run ui:build
npm run validate:ui
npm run inspect:boundaries
npm run app:archive
npm run demo
```

The first four commands need Node built-ins and Python for the source-boundary probe, not npm-installed Solidity tooling. The server serves `preview.html`. Browser tests additionally require Python Playwright and a compatible Chromium installation:

```sh
npm run test:browser
```

The recorded managed-browser test loads exact HTML with `set_content` because file navigation is disallowed there. It does not override browser policy or claim native file-origin persistence coverage.

## Compilation and actual v4 testing — not completed here

The package pins `solc` 0.8.30, `ethers` 6.15.0, and `ganache` 7.9.2, but no successful install or reviewed transitive dependency lock was produced. In a network-enabled development environment, install and inspect dependencies, record a lock, compile, and address every error and runtime-size failure. The legacy Ganache suite is not an adequate substitute for a Cancun-capable actual-v4 test environment. Use a compatible EVM with the pinned upstream PoolManager and its real hooks/settlement behavior. Nothing in this document says those suites already pass.

The referenced upstream source is Uniswap/v4-core commit `d153b048868a60c2403a3ef5b2301bb247884d46`. Do not silently replace it with a newer default branch and infer identical behavior. Respect upstream licenses when vendoring or deploying dependencies. The included boundary is our small ABI declaration, not a bundled PoolManager.

## Intended configuration order, after successful compiler/EVM gates

1. Establish a reviewed testnet core collection/account deployment with the exact 1.4 transfer-epoch and authority behavior. Follow the inherited core constructor dependencies and verify actual implementation addresses; this document does not assume an old deployment is compatible.
2. Deploy `WorldLedger(collection)` from the intended one-time configurator. Deploy `TimeVault(ledger)`, `GenesisLaunchpad(ledger)`, `V4GenesisMarket(ledger, verifiedPoolManager)`, `EstateExchange(ledger)`, and `HookDeployer`.
3. Compile `PhoenixLaunchHook` with fixed constructor arguments `(verifiedPoolManager, v4Market)`. Mine a CREATE2 candidate offline with the actual deployer and exact compiled bytecode:

```sh
npm run hook:mine -- <HookDeployerAddress> <PoolManagerAddress> <V4GenesisMarketAddress>
```

The command reads the compiled `PhoenixLaunchHook.json`, appends ABI constructor parameters, and searches for address low bits `0x22c0`. It does not sign or broadcast. Save its full init-code hash and arguments. Review before a separate, authorized call to `HookDeployer.deploy(salt, initCode)`.

4. Verify deployed hook flags, code, manager, market, and fee constants. Call `V4GenesisMarket.installHook(hook)` from its installer. Call `WorldLedger.configureEstateMarket(exchange)` from the configurator. Both must happen before the next step.
5. Check every module's immutable ledger/collection/manager relationships. Only then call the actual wiring method `WorldLedger.sealModules(v4Market, vault, launchpad)`. There is no `configureModules` API. Sealing is irreversible in this source.
6. Test a zero-production-value identity and small testnet launch all the way through contribution, settlement, pool initialization, claim, swap, lock, harvest, social activity, estate escrow, cancellation, and purchase. Preserve real receipts and verify event schemas; a mock provider is insufficient.

There is not yet a new browser ABI/Quoter/wallet adapter for these contracts. Build it against actual compiled artifacts and a tested pool, not the old reserve quote API. It needs context invalidation, decoded calls, finality/reorg handling, ERC-20 approval review, actual v4 quotes, and transaction-by-transaction user authorization.

## Onchain application payloads

Run `npm run app:archive` after the final UI build. `onchain-app/manifest.json` records complete HTML SHA-256, payload sizes, expected STOP-prefixed runtime hashes, and **null** deployed addresses. It currently prepares 19 local chunks. Verify the exact final manifest rather than treating this number as a permanent limit.

After compiling/reviewing the inherited `AppChunk` and `OnchainApp`, deploy payload chunks, verify code hashes, construct a root with their addresses and expected SHA-256, and verify retrieval through the intended resource interface. No such deployment happened here. Large constructor assembly, gas, RPC response limits, and code-size behavior still need testing. Archiving this preview archives a rehearsal; it does not wire its UI to live contracts.

## Immutable-version migration

An uploaded source update is not an in-place NFT upgrade. Existing immutable accounts/factories/ledgers may be incompatible. Do not replace an address in a config file and claim continuity. A migration must inventory old ownership, permissions, balances, claims, proofs, application code, and outstanding signatures; choose an explicitly supported path; obtain the owner's consent; and preserve cross-version provenance. Sovereign tokens cannot gain a silent owner bypass. Frozen trust roots cannot be edited through documentation. No migration transaction was executed.

## Minimum actual-v4 test matrix

Reject wrong manager/callback origin, altered callback commitment, callback replay, wrong hook-address bits, wrong initializer, duplicate registration, wrong pool key, static/dynamic flag mismatch, and incorrect init price. Check fee endpoints and per-pool separation. Exercise seed and swap rounding at small/extreme values, native settlement, token/token route settlement, min-output/deadline reverts, full-fill requirements, and swap-to-lock atomicity. Prove zero-delta harvest, fixed fee beneficiary, and negative seed-principal rejection against the actual PoolManager. Test malicious token and receiver reentrancy and router-versus-human attribution. Then test whole-estate changes between listing and buy, active user grants, stale sessions, declared allowance changes, and post-receiver inventory checks. No results for this matrix are claimed here.
