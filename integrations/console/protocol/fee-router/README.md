# AWE owner-defined routing and launch contracts

Executable local implementation, version 0.1.0. Owners choose their own recipients,
relative weights, converters, launched token parameters and descriptive hook/pool
configuration. There is no platform allocation and no required company, equity,
community or game category.

## Implemented

| Contract | Executable behavior |
| --- | --- |
| `OwnerFeeRouter` | Native/standard-ERC20 deposits, arbitrary weighted recipients, retained historical claims, partial withdrawal, optional exact-input conversion, two-step ownership transfer |
| `OwnerLaunchToken` | Fixed-supply, 18-decimal ERC20 with owner-chosen name, symbol, supply and initial recipient |
| `OwnerLaunchFactory` | Permissionless token creation and creator-authored hook/pool/metadata commitments |
| `ISettlementConverter` | Adapter interface for real external conversion routes |

`artifacts/*.json` contain ABI, creation bytecode and runtime bytecode. Interfaces
have empty bytecode and cannot be deployed. `NormalFlowConverter` is a test-only,
pre-funded exchange; it is not a real DEX adapter or a market price source.

## Build and verification

```sh
npm install
npm run build
npm test
```

Compiler: Solidity 0.8.24, optimizer 200 runs, Shanghai target. Dependencies are
pinned in `package.json`. The workspace test runner also accepts an existing
dependency directory through `AWE_FEE_ROUTER_DEPS` and uses the reviewed workspace
dependency installation as a fallback. A fresh installation can use ordinary npm.

Tests execute normal transactions against an in-process Ganache chain. They do not
broadcast transactions to any external network. Results and compiler settings are
written into `artifacts/test-results.json` and `artifacts/build-summary.json`.

## Fee-router API

Native currency is represented by `address(0)`. All amounts are raw base units.

```js
const router = await new ethers.ContractFactory(
  routerArtifact.abi, routerArtifact.bytecode, signer
).deploy(owner, recipients, weights);
await router.waitForDeployment();

// Any positive integer ratio works: [60, 40], [3, 2], [1, 1, 1], etc.
await (await router.configureSplit(recipients, weights)).wait();
await (await router.depositNative({ value: amount })).wait();
await (await inputToken.approve(await router.getAddress(), amount)).wait();
await (await router.depositToken(await inputToken.getAddress(), amount)).wait();

// Connect as the beneficiary for a redirected/partial withdrawal.
await (await router.claim(tokenAddress, amount, chosenDestination)).wait();
// Anyone may trigger payment directly to the beneficiary's own address.
await (await router.claimFor(tokenAddress, beneficiary)).wait();
```

Deposits allocate under the split active at the deposit transaction. Reconfiguring
recipients only affects later deposits. Previous claims remain payable even after a
recipient is removed, ownership changes, or a conversion adapter is disabled.
The router owner has no withdrawal path for another recipient's existing claim.

Recipient arrays support 1–64 distinct nonzero addresses; the router itself cannot
be a recipient. Each weight is 1–10^18. Weights need not add to 100. Allocations use
integer token units and the final configured recipient receives the rounding
remainder, which can matter for repeated very small deposits. All units are
allocated and total claims remain backed by held assets.

### Choose a settlement token

```js
const request = {
  tokenIn, amountIn, tokenOut,
  converter: ownerSelectedAdapter,
  minAmountOut,                 // nonzero for an actual conversion
  deadline,                    // Unix timestamp, based on a current quote
  route                        // adapter-specific ABI-encoded route
};

// Owner selects available adapters. No adapter is enabled by default.
await (await router.setConverter(ownerSelectedAdapter, true)).wait();

// Convert this recipient's earned claim, then pay their chosen destination.
await (await router.claimConverted(request, chosenDestination)).wait();

// Or convert a new payment first, then split the resulting output asset.
// For ERC20 input approve amountIn first; for native input attach amountIn.
await (await router.depositConverted(request, {
  value: tokenIn === ethers.ZeroAddress ? amountIn : 0n
})).wait();
```

Any standard ERC20 output address or native currency can be selected if the chosen
adapter has a working route and enough liquidity. Selecting an output token does
not create a market for it. Same-token requests pass through without an adapter.
The payer can choose the output asset of a new converted payment; beneficiaries
can independently choose output assets when withdrawing their own shares.

The converter receives approval for exactly the input amount, must consume that
amount, and must return output to the router. The router measures the received
output, verifies `minAmountOut` and the deadline, clears approval, and completes
the allocation or withdrawal atomically. Native output must be sent by the
converter itself, not an unrelated internal route contract. The adapter should
collect native route output locally and forward it to the router.

This version does not store per-recipient automatic swap schedules or signed
delegated conversion orders. Applications can already automate plain `claimFor`
payments. Future automation for a recipient's conversion must carry their chosen
route and price constraints rather than let an arbitrary caller choose them.

### Direct-transfer accounting

Normal native sends invoke `receive()` and allocate immediately. Standard ERC20
integrations must call `depositToken` or `depositConverted`. An unsolicited ERC20
transfer cannot communicate which historical split should apply. Such transfers,
and forced native transfers, stay outside earned claims until someone calls
`allocateSurplus(token)`. That function attributes the surplus under the split
current at that later call. It never spends reserved claims.

Rebasing and transfer-tax assets are outside this implementation's standard-ERC20
assumption. Deposit and payment balance checks reject ordinary transfer-tax
behavior; no balance checks can make arbitrary token economics equivalent to a
standard ERC20. Use a deliberately designed wrapper or asset adapter for those.

## Launch API

```js
const factory = await new ethers.ContractFactory(
  factoryArtifact.abi, factoryArtifact.bytecode, signer
).deploy();
await factory.waitForDeployment();

const configuration = {
  selectedHook: arbitraryChosenHookOrZero,
  poolConfigurationHash: ethers.keccak256(encodedPoolConfiguration),
  metadataHash: ethers.keccak256(encodedLaunchManifest)
};

const receipt = await (await factory.launch(
  'My World', 'WORLD', ethers.parseUnits('1000000', 18),
  chosenInitialRecipient, configuration
)).wait();
// Decode TokenLaunched to discover the created token address.
```

Names may contain 1–128 bytes and symbols 1–32 bytes. Supply is positive, fixed
at creation and sent entirely to the chosen recipient. The token has no further
mint authority, transfer tax or administrator transfer privilege. Users can
distribute the supply themselves or choose another contract as initial recipient.
This release deliberately implements only the fixed-supply primitive; optional
mint-authority designs need a separately chosen implementation.

The launch creator can update the descriptive configuration with
`recordConfiguration(token, configuration)`. This does not alter the token's
supply or the behavior of a pool. Commitments should hash a versioned manifest
with chain ID, full pool key, initialization plan, fee recipients, amounts and
owner choices. The application must retain or publish the manifest bytes so
others can verify the commitment; the factory stores hashes, not those bytes.

## Relationship to Uniswap v4

These contracts are independent, reusable building blocks. **They do not deploy,
initialize or add liquidity to a Uniswap v4 pool.** A selected hook address or
pool commitment is descriptive data and is not checked against PoolManager.

A real owner-selected hook can account for its fees using the v4 accounting
model, obtain the settled currency through the appropriate PoolManager flow,
and use this router's deposit functions. Conversion can happen later through a
dedicated adapter, keeping arbitrary DEX execution out of the synchronous swap
callback. A real integration still needs pinned v4-core/v4-periphery dependencies,
valid hook permission/address flags, exact callback implementation, settlement,
liquidity position construction and integration verification.

Hooks are optional and selected as part of the pool key at pool creation. Owners
can choose a hook, a configurable/composable hook implementation, or no hook. An
existing pool's hook cannot simply be replaced by editing application metadata;
a different hook means a different pool key. Individual hook implementations may
offer their own configurable behavior. See the official
[v4 hooks documentation](https://developers.uniswap.org/docs/protocols/v4/concepts/hooks)
and [custom accounting documentation](https://developers.uniswap.org/docs/protocols/v4/guides/custom-accounting).

LP fees remain distinct from a separately routed hook/service fee. This router
does not claim another LP's earnings or manufacture liquidity or yield. It routes
funds actually deposited to recipients chosen by the owner.

## Integration status

Compiled contract artifacts and local execution tests are provided. No network
deployments, real DEX conversion adapter or live v4 liquidity integration is
included. There is no assertion of a production audit. Wallet UI should distinguish
these real executable contract actions from metadata-only configuration steps.
