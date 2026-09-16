# Deployment gates — v1.6

**No deployment is approved. `npm run deploy` deliberately exits without submitting anything.** Existing deployed contracts, if any, are unchanged. This source has not successfully compiled in the authoring runtime.

## What can run now

`npm run validate:ui` rebuilds the single-file HTML and runs dependency-free Node tests. `npm run test:browser` runs two real Chromium suites through Python Playwright. `node scripts/operating-package-check.mjs` checks source-text/import tripwires and writes complete Solidity standard-JSON input. `npm run app:archive` prepares local application chunks, not transactions.

## Compiler and EVM separation

The pinned dependency remains solc 0.8.30. `npm run compile` targets Cancun, with viaIR and optimizer runs 1000. Its compiler-input equivalent is `reports/v1.6/compiler-input.json`. Compilation and EIP-170 runtime size checks must actually succeed; account/factory growth may require splitting code, and no size result is assumed.

`npm run compile:local` explicitly targets Shanghai for the Ganache 7.9.2 local harness, avoiding the inherited mismatch between Cancun-generated instructions and a Shanghai test VM. `npm run test:operating:contracts` contains five **prepared, unexecuted** EVM tests. This harness uses test tokens/accounts and checks the basket, matched exits, closed-entry exits, covered exercise, and cell epoch/allowance behavior. It does not use a real v4 PoolManager and does not establish full operating-account/exchange integration.

The inherited test suite still needs execution and correction where necessary. Run actual pinned Uniswap PoolManager integration on a Cancun-compatible EVM separately. Never substitute the reserve approximation or an ABI-shaped mock for this gate. Dependency installation/lock generation failed in this runtime; no fabricated package lock or EVM receipt is supplied.

## Constructor and deployment-order changes

New immutable account code requires newly deployed compatible account/factory/collection infrastructure. No in-place account upgrade is attempted. The revised exchange now takes `(ledger, commitmentIndex)`. The gift router and finite instrument router now each take `(ledger, market, vault)`; they may be constructed before ledger sealing but refuse entry before the ledger is sealed with the exact matching dependencies. This removes the earlier exchange → index → router → sealed-ledger cycle.

A valid **proposed**, not executed, ordering is:

1. Deploy and verify the compatible core collection/account infrastructure and external test dependencies, including the correct real PoolManager.
2. Deploy WorldLedger, TimeVault, GenesisLaunchpad and V4GenesisMarket. Deploy the hook at a mined, matching-permission address and install it before sealing.
3. Deploy EditionRegistry, CommissionEscrow, cell factory, default-closed ExperimentGate, and each immutable experimental adapter with supported asset/strategy addresses and fixed terms. Exclude test harness contracts from the deployment manifest.
4. Deploy the gift and instrument routers with explicit dependencies. Deploy the commitment index with the cell factory and sorted unique module addresses. The roster must include TimeVault, gift router, finite router, registry, work escrow, shelf and every experimental contract whose claims can exist. Cell inventory is included independently of this roster.
5. Deploy EstateExchange using that index; configure it on the still-unsealed ledger; seal the original market/vault/launchpad set. Check every getter, codehash and callback binding.
6. Run the complete state-machine, callback and changing-custody tests with these real deployed local dependencies. Keep all experimental entry gates closed until their own admission tests pass. Any necessary new index/module universe is a new explicit deployment, not a hidden roster update.

No script in this release claims this sequence succeeded. No canonical ERC-6551 compliance or identity-preserving migration is inferred from a custom deterministic factory.

## Necessary adversarial integration tests

Real account old/new owners and malicious NFT receivers; grant replay/expiry/nonce/exact calldata/cumulative budgets; existing sessions and token allowances; simultaneous beneficiary claims and listing refresh; changes in cell-held credit/options while root is escrowed; absent/reverting/expensive commitment adapter; external proxy implementations; malicious 6/8/18-decimal tokens; nonstandard fee/rebase/false returns; no principal loss disguised as yield; pull-payment receivers; gate closure with exits still available; returned unspent input and minimum output; ledger activity caller attribution; hook-address flags, initialization, zero-liquidity fee collection, large price moves and PoolManager delta settlement.

Onchain output obligations must be reconciled with their model differences: pull claims versus instant local credits, ERC-20 versus simulated native ETH, actual strategy-share value versus illustrative loss, and a bounded declared manifest versus a model's complete known inventory.

## User-facing prerequisites

The new live wallet client, transaction decoder, chain-specific configuration, nonce/account-change handling, wrapped-native flows, verified module-receipt social feed, actual gas/fee display, public-state read recovery, contract source verification and testnet transaction evidence are missing. None is silently supplied by importing this HTML. Testnet/mainnet availability and jurisdictional rules are separate from mechanical permission and security gates.
