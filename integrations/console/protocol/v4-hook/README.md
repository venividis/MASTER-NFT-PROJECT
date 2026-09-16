# AWE configurable Uniswap v4 fee hook

This package implements a real, optional v4 hook template. The owner chooses its
fee, receiving address and whether that receiver is a fee splitter. This is one
available hook implementation; AWE owners may choose other hooks or no hook when
creating their pool. There is no built-in platform allocation or required token
business model.

For production PositionManager mint/settle/sweep calldata and Permit2 approval
preparation, see [POSITION_MANAGER.md](./POSITION_MANAGER.md). That encoder is
separately ABI/source verified and does not route liquidity to the test driver.

## Verified execution

Nine normal-flow scenarios passed on local Anvil 1.7.1 with Cancun enabled,
against the **unmodified official PoolManager**, pinned at
`46c6834698c48bc4a463a86d8420f4eb1d7f3b75`. Both ERC20 directions, native input,
actual fee claims, redemption into `OwnerFeeRouter`, configuration changes, zero
fee, quote limits and explicitly unsupported order types were exercised.

This is local integration verification, not a public deployment, full production
audit or a complete wallet launch/liquidity workflow. The included test driver
provides actual liquidity to core pools for verification; it is not a production
PositionManager replacement.

## Contracts and artifacts

| File | Purpose |
| --- | --- |
| `src/OwnerV4FeeHook.sol` | Genuine v4 `beforeSwap`, `afterSwap` and unlock settlement logic |
| `src/HookCreate2Factory.sol` | CREATE2 deployment of the correctly encoded creation payload |
| `scripts/mine-salt.cjs` | Finds a salt yielding the required hook address permission bits |
| `artifacts/OwnerV4FeeHook.json` | ABI, creation bytecode and runtime bytecode |
| `artifacts/HookCreate2Factory.json` | ABI, creation bytecode and runtime bytecode |
| `artifacts/test-results.json` | Executed scenario evidence |
| `dependencies.json` | Official repository and transitive dependency commit pins |

The hook compiles with Solidity 0.8.26, Cancun target and 200 optimizer runs. Its
runtime is 6,607 bytes; the factory runtime is 480 bytes. Compiling the official
PoolManager for integration tests produces Solidity's general transient-storage
warning in upstream `CurrencyReserves`; it is retained in the build summary.
No upstream core source was changed to obtain a passing test.

## How accounting works

For a gross exact input `G` and owner-selected hook rate `r` in parts per million:

```text
hook fee = floor(G * r / 1,000,000)
input passed into the pool swap = G - hook fee
```

The ordinary pool LP fee applies through the official core swap implementation.
The hook does not replace pool pricing or invent a second liquidity ledger.

During `beforeSwap`, the hook mints a real ERC6909 currency claim to itself through
`PoolManager.mint` and returns a positive specified-currency `BeforeSwapDelta`.
These deltas offset in PoolManager's accounting. The caller's final swap delta
includes the hook fee, so a full fill debits exactly the gross order input.

`afterSwap` verifies that the pool consumed the entire net input. Exact-output
orders and price-limited partial fills revert atomically. This explicit boundary
avoids charging the quoted full-order hook fee against a partially executed order.
Both supported directions use their actual input currency, including native ETH.

The hook stores each fee's recipient and forwarding mode when that fee accrues.
Changing the owner configuration affects later fees; it cannot redirect existing
claims to the new recipient. Amounts can subsequently be flushed by anyone, but
only to their recorded recipient and mode.

`flush` opens a separate manager unlock, burns the recorded ERC6909 amount and
takes the corresponding currency. It either pays the recipient directly or calls
`OwnerFeeRouter.depositNative/depositToken`. ERC20 approval is exact and cleared.
The final PoolManager deltas must reconcile before the unlock can finish.

**Splitter timing is explicit:** the hook fixes the splitter address when fees
accrue. The splitter's internal recipient weights apply when the fee is flushed
and deposited, not retroactively at swap time. For a fixed per-swap split policy,
use a dedicated splitter whose configuration remains fixed for that policy, or
extend the receiver with versioned allocations. This version does not pretend to
snapshot an external splitter's future configuration.

## Owner controls

```solidity
configure(uint24 nextFeePpm, address nextRecipient, bool viaSplitter)
proposeOwner(address next)
acceptOwnership()
```

`nextFeePpm` may be zero and must be less than 1,000,000. The owner chooses the
economics within that executable range. One deployed hook instance has one
current policy shared by pools using it. Deploy separate instances for independent
policies. Recipient addresses are arbitrary nonzero addresses except the hook and
PoolManager itself; splitter mode requires contract code.

Fees accrue in the input currency. To distribute another asset, route through
the separate fee-router package's conversion path and a real owner-selected DEX
adapter. This hook deliberately does not run arbitrary conversions during swaps.
No live DEX adapter is provided by this package.

## Swap integration

The pool's selected hook address must equal this deployment. The caller supplies:

```js
const hookData = ethers.AbiCoder.defaultAbiCoder().encode(
  ['uint24', 'uint64'],
  [maximumAcceptedHookFeePpm, deadlineUnixSeconds]
);
```

The hook verifies the current fee is at most the accepted fee cap and that the
deadline has not passed. Empty hook data is rejected. These values bound the hook
charge; a production swap router must also enforce the user's minimum output,
price limit and input/payment authorization. There is no global promise that all
Uniswap frontends or routers will discover and route to this custom hook.

The actual official callback signatures are imported from the pinned core types:

```solidity
beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params,
    bytes calldata hookData) returns (bytes4, BeforeSwapDelta, uint24)
afterSwap(address sender, PoolKey calldata key, SwapParams calldata params,
    BalanceDelta delta, bytes calldata hookData) returns (bytes4, int128)
```

Only the configured PoolManager may call callbacks. The required low 14 address
bits are `0x00c8`: beforeSwap, afterSwap and beforeSwapReturnDelta. The constructor
uses the official `Hooks.validateHookPermissions` to reject a mismatched address.
Unused callbacks are not permissioned and are not implemented.

## CREATE2 deployment preparation

First deploy `HookCreate2Factory` through a wallet on the intended test chain.
Then construct the full hook init code, including constructor arguments, and mine
against that exact factory address:

```js
const hookFactory = new ethers.ContractFactory(hookABI, hookBytecode, signer);
const { data: initCode } = await hookFactory.getDeployTransaction(
  officialManagerAddress, chosenOwner, feePpm, chosenRecipient, viaSplitter
);

// Node helper; browser code can use the same ethers CREATE2 calculations.
const { mine } = require('./scripts/mine-salt.cjs');
const plan = mine(create2FactoryAddress, initCode);
// Assert the address is currently unused on the intended chain before submission.
// OwnerV4FeeHook constructor also validates all permission bits.
await (await create2Factory.deploy(plan.salt, initCode)).wait();
```

Changing the factory address, bytecode or any constructor argument changes the
predicted address and requires mining again. The helper prepares deployment data;
it does not submit a transaction. A hook address is part of the pool key, so
changing a pool to a different hook requires creating a different pool.

## Reproduce

From the AWE build directory, retain this package beside `fee-router`, because
the integration suite deploys that package's compiled token and splitter artifacts.

```sh
npm install
npm run build
npm test
```

The test suite starts its own Anvil node on `127.0.0.1:23947` with chain ID 31337
and stops it on completion. It never uses an external RPC or a user wallet key.
No code-size limit is disabled. If that port is occupied, stop that existing local
test process or change the test's explicitly local port before running.

Vendored official sources are pinned in `dependencies.json`; retain their license
files when redistributing. If restoring dependencies from a source-only package:

```sh
git clone https://github.com/Uniswap/v4-core.git vendor/v4-core
git -C vendor/v4-core checkout 46c6834698c48bc4a463a86d8420f4eb1d7f3b75
git -C vendor/v4-core submodule update --init lib/solmate
```

Official references used:

- [v4 hooks and permission bits](https://developers.uniswap.org/docs/protocols/v4/concepts/hooks)
- [Custom accounting](https://developers.uniswap.org/docs/protocols/v4/guides/custom-accounting)
- [Pinned PoolManager implementation](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/PoolManager.sol)
- [Pinned hook callback definitions](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/interfaces/IHooks.sol)
- [Pinned return-delta handling](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/libraries/Hooks.sol)
