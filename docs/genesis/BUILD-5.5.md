# Genesis 5.5 — private execution integration and v4 lifecycle

The navigation from 5.4 remains: no destinations, pinch and double-tap movement, panning and flight through either side of the original mathematical object.

## Delivered

- Default-selected private execution toggle, isolated RAILGUN/Waku worker, current SDK broadcaster submission, no public-wallet fallback, bounded review/proof validity and encrypted pending-submission recovery.
- AES-256-GCM wallet backups, encrypted settings/notes/launch drafts/receipts, voluntary network startup, hidden private addresses, background/idle locking and Hide screen. The original testnet, NFT and new v4 signing sessions are invalidated by screen locking; already approved/submitted external-wallet transactions cannot be cancelled by the app.
- Genuine Uniswap v4 fixed-supply launch, deterministic token/position creation, atomic pool funding, return of unused budgets, exact-input swaps, redeemable ERC20 liquidity shares, fee-aware withdrawal previews and fair final redemption.
- A reviewable deployment CLI. All planned requests validate before the first broadcast. Public-chain sending requires the explicit broadcast command and deployer credentials.
- Grouped application calls and return shields, plus a failed-launch fallback that refunds existing inputs without querying token addresses whose deployment reverted.

## Validation

- **348 project tests passed**, zero failures/skips, including 13 privacy UI/storage/integrity/math tests.
- **10 v4 launchpad scenarios passed** against the actual pinned PoolManager and official V4Quoter on local Anvil/Cancun, including the unsigned-plan/altered-plan/deployment CLI lifecycle.
- **9 retained OwnerV4FeeHook scenarios passed** on a genuine local PoolManager.
- The browser-compiled upstream cryptography passed real private-wallet derivation, encrypted mnemonic recovery, fresh-database restoration and encrypted return-note/RelayAdapt ABI checks in Node VM.
- Source syntax, HTML assets, embedded imports, static heuristic checks and archive hash reconstruction passed.
- A fresh local NFT deployment minted and recovered the exact final runtime: **744,221 bytes, 33 chunks, 43 embedded modules**. SHA-256: `b412bdc9de19218c970845b1949797e38f7c386a55705ce9aace3b056e675716`.
- Original optical source hashes remain unchanged. No browser automation or physical mobile-device certification was performed.

The optional privacy worker is **15,010,237 bytes**, SHA-256 `bfce5d1b1ca272157cf7ef03d4617727dc03d968b918ced6a3a0ecaca3640c7d`. It is downloaded separately and hash-verified before execution. The onchain archive includes its integrity pin, not the full SDK/prover bundle.

## Explicit production limits

No public-chain factory/router deployment, funded RAILGUN end-to-end transaction or independent security audit has been completed. The local relay accounting harness does not verify a zero-knowledge proof. Private execution remains unavailable until the required deployment, private wallet, service settings, spendable funds and compatible broadcaster are ready. Public pool data and network metadata remain observable.

The dependency audit still has 51 installed-tree findings. Remaining high/critical findings are outside the worker input graph; twelve included packages carry low/moderate findings. File inclusion does not determine exploitability. See [privacy protections, dependency findings and activation](PRIVACY-AND-V4.md) and `reports/privacy/dependencies.json`.

The broader Anima research/design proposal has not been implemented.

## Reproduce the additional checks

```sh
npm ci --prefix integrations/console/protocol/v4-hook
npm ci --prefix packages/privacy --ignore-scripts
npm run test:v4
node integrations/console/protocol/fee-router/scripts/compile.cjs
npm test --prefix integrations/console/protocol/v4-hook
npm run privacy:build
npm run test:privacy
npm run validate:genesis
```
