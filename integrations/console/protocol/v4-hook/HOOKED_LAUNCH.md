# Opt-in hooked launches

`GenesisV4HookLaunchpad` connects the existing `OwnerV4FeeHook` to an actual token launch. The original `GenesisV4Launchpad`, `GenesisV4Router`, `GenesisFixedToken` and `GenesisV4Position` source and executable bytecode are unchanged.

The new factory accepts the same `Terms` fields with an explicit additional `hooks` address:

- `predict(terms, payer, hooks)` returns deterministic token and position addresses.
- `launch(terms, hooks)` creates the fixed-supply token, creates the position with the selected hook in its PoolKey, pulls the exact quote budget, initializes the genuine v4 pool, seeds liquidity, and returns the token allocation plus unused budget to the payer atomically.
- The CREATE2 salt namespace includes payer, user salt and hook address. Another payer cannot consume the same deterministic addresses.
- LP shares retain all principal and ordinary LP fees. The separate hook fee does not become an administrator right to LP principal.

The factory verifies hook permission bits and the hook's PoolManager getter. This is compatibility validation, **not an arbitrary-hook audit**. The browser client additionally pins the complete executable runtime, excluding only the compiled immutable manager locations, then checks the actual manager, owner and selected recipient scope. A custom on-chain caller remains responsible for the hook address they explicitly pass.

## Actual fee path

The input currency is charged at the hook's selected parts-per-million rate. The hook mints real PoolManager ERC6909 claims. An exact-input swap carries its maximum accepted hook fee and expiry in `hookData`; a fee increase past the cap rejects atomically. Partial fills and exact-output swaps reject.

Anyone can flush an accrued bucket only to its recorded recipient. Direct routes pay that recipient. Splitter routes fund `OwnerFeeRouter`, which records independently withdrawable recipient claims. Hook configuration changes do not rewrite previously accrued recipient buckets. Splitter weights apply **when fees are flushed into the splitter**; split changes cannot rewrite claims already deposited there. Recipients retain exclusive control of their own claim withdrawals.

The hook owner can change future fee rates and routes. The splitter owner can change future allocations. These authorities are visible in the client. There is no conversion to another currency in this launch UI; deposits and claims remain in the actual input currency.

## Browser integration

`web/launchpad/hook-client.mjs` produces unsigned plans for the shared `LaunchChain.prepareExternal(plan)` → `reviewNext()` → `sendReviewed()` workflow. It does not request accounts, sign, send transactions, or hold keys.

Infrastructure setup is separate and explicit:

1. `hookInfrastructurePlan(..., {kind:'factory'}, payer)` creates the hooked launch factory.
2. `hookInfrastructurePlan(..., {kind:'create2'}, payer)` creates the reusable CREATE2 helper.
3. `hookInfrastructurePlan(..., {kind:'splitter', owner, recipients, weights}, payer)` creates the fee splitter when that route is chosen.
4. `hookDeployPlan(..., {create2, owner, feePpm, recipient, viaSplitter}, payer, {signal, onProgress})` mines the required low 14 address bits asynchronously and prepares hook deployment.
5. `verifyHookContract(provider, predictedAddress, verification.name, verification)` verifies the deployed runtime and configuration after each receipt before retaining its address.

`hookedLaunchPlan` accepts the ordinary launch draft plus `config.hookFactory` and `config.hook`. Human price ranges are converted to sorted pool ticks only after token address prediction and quote-decimal discovery. `hookedSwapPlan` returns a real-quoter-backed swap plan. `inspectHook`, `inspectSplitter`, `hookFlushPlan`, `hookClaimPlan`, `configureHookPlan` and `configureSplitPlan` expose earned fees and owner-directed configuration.

## Build and evidence

From the project root:

```sh
node integrations/console/protocol/fee-router/scripts/compile.cjs
node integrations/console/protocol/v4-hook/scripts/compile.cjs
node scripts/build-v4.mjs
node scripts/build-hook-launch.mjs
node integrations/console/protocol/v4-hook/test/hooked-launch-flows.cjs
```

The hooked-flow test compiles and runs the pinned real v4 PoolManager and V4Quoter on disposable local Anvil/Cancun chain 31337. It uses the actual browser unsigned builders for deployment, launch, swaps, fee forwarding and claims. The machine-readable result is `artifacts/hooked-launch-test-results.json`.

This implementation supplies a wallet-signable public-chain path. It does not itself deploy anything on a public network. The new hooked route does not yet build a RAILGUN private-funding proof/RelayAdapt group. The original separate no-hook private route remains distinct. Token addresses, pool data, transactions, hook authority and recipient addresses are public chain data.
