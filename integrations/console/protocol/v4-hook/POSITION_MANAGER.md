# Official v4 liquidity-position encoding

`scripts/position-manager-encoder.mjs` prepares a real production PositionManager
`modifyLiquidities` request. It never sends liquidity to the test driver. The
requested recipient receives the actual ERC721 LP position from PositionManager.

The encoder is **ABI/source verified** against official v4-periphery commit
`dce236d4e2057422d0791d9a973a58765eb46f65` and that repository's Permit2 dependency
`cc56ad0f3439c502c246fc5cfcc3db92bb8b7219`. Verification compiled official interfaces,
checked the action constants and optimized mint decoder's byte offsets, and
decoded ERC20/native fixtures. **An actual PositionManager mint transaction has
not been run for this encoder.** This differs from the hook's completed runtime
tests against real PoolManager.

## Browser integration

```js
import { createPositionManagerEncoder } from './position-manager-encoder.mjs';
const encoder = createPositionManagerEncoder(ethers);

const plan = encoder.buildMintPosition({
  positionManager: verifiedPositionManagerAddress,
  permit2: verifiedPermit2Address,
  poolKey: { currency0, currency1, fee, tickSpacing, hooks: selectedHook },
  tickLower, tickUpper,
  liquidity,                 // explicit liquidity units, from a current quote
  amount0Max, amount1Max,     // maximum raw token amounts the user authorizes
  recipient: chosenNftAccountOrWallet,
  refundRecipient: chosenRefundAddress,
  deadline,
  permitExpiration: deadline,
  hookData: '0x'
});

// This is read-only: compare configured bindings before approvals/submission.
const positionManager = new ethers.Contract(
  verifiedPositionManagerAddress, encoder.positionInterface, provider
);
if ((await positionManager.poolManager()) !== verifiedPoolManagerAddress) {
  throw new Error('PositionManager is bound to a different PoolManager.');
}
if ((await positionManager.permit2()) !== verifiedPermit2Address) {
  throw new Error('PositionManager is bound to a different Permit2.');
}

const approvals = await encoder.prepareApprovals(provider, await signer.getAddress(), plan);
// Show the exact spending limits and submit each required approval sequentially.
for (const approval of approvals) {
  await (await signer.sendTransaction(approval.request)).wait();
}

// Simulate only after prerequisites are satisfied; this does not send a transaction.
await provider.call({ ...plan.request, from: await signer.getAddress() });
const receipt = await (await signer.sendTransaction(plan.request)).wait();
```

Normalize addresses with `ethers.getAddress` before comparing bindings. Read the
connected chain and validate the chosen deployment addresses against the intended
chain. The example leaves the wallet's actual confirmation to the application.
The helper itself never sends transactions or reads a private key.

The underlying pool must already be initialized. Use a current pool price and
proper liquidity math or a quote to obtain the explicit liquidity amount and
maximum inputs; the encoder does not manufacture those economic inputs or
pretend a position exists after preparing calldata. Core still checks per-tick
liquidity limits and pool validity at execution.

## Encoded actions

| Pair | Action bytes | Value attached |
| --- | --- | --- |
| ERC20/ERC20 | `0x020d`: MINT_POSITION, SETTLE_PAIR | Zero |
| Native/ERC20 | `0x020d14`: MINT_POSITION, SETTLE_PAIR, SWEEP | `amount0Max` |

Mint parameters are exactly:

```solidity
abi.encode(poolKey, tickLower, tickUpper, uint256(liquidity),
    uint128(amount0Max), uint128(amount1Max), recipient, hookData)
```

Settle parameters are `abi.encode(currency0, currency1)`. Native sweep parameters
are `abi.encode(address(0), refundRecipient)`. The outer unlock payload is
`abi.encode(actions, params)`, passed to `modifyLiquidities(unlockData, deadline)`.
The sweep recovers excess native currency in the same call.

This uses explicit `MINT_POSITION`, not the delta-based mint action deprecated in
the pinned upstream implementation. The helper validates tick order/alignment,
sorted currencies, numeric bounds, and literal nonzero recipients. PositionManager
reserves addresses 1 and 2 as sentinels, so this helper rejects them rather than
silently substituting a different actual recipient.

Liquidity is a positive `uint256` in the periphery ABI, but the helper caps a
single change at `int128.max`, matching core's cast of liquidity changes. Maximum
token amounts use uint128. Amounts are raw base units; use the actual token
decimals before constructing them.

## Approval model

For each non-native input with a positive maximum, payments require:

1. ERC20 allowance from the paying account to Permit2.
2. Permit2 allowance from that account for PositionManager as spender.

`prepareApprovals` reads both allowances. It returns an ERC20 zero-reset when
necessary, then the exact maximum approval, and a Permit2 approval only when its
amount or expiration is insufficient. It does not choose unlimited approvals.
Permit2's `approve` signature is:

```solidity
approve(address token, address spender, uint160 amount, uint48 expiration)
```

The paying account must execute the approvals and PositionManager call. If an
NFT-owned account is the payer, that account executes these calls. If a user
wallet pays and gives the LP NFT to an NFT-owned account, the user's wallet makes
the payments and the chosen NFT account is simply the mint recipient. An
aggregating intermediary cannot assume the user's allowances apply to itself.

The fee hook's swap quote data is `abi.encode(uint24 maxFeePpm, uint64 deadline)`.
That is swap callback data. This hook does not permission liquidity callbacks,
so ordinary mint-position hook data can be empty. Other owner-selected hooks may
require their own liquidity callback data.

## Verification and sources

```sh
npm run verify:encoder
```

Artifacts `IPositionManager.json` and `IAllowanceTransfer.json` contain ABIs
compiled from the official interfaces, with empty bytecode. The complete fixture
evidence is `artifacts/position-encoder-verification.json`.

- [Official mint-position guide](https://developers.uniswap.org/docs/protocols/v4/guides/managing-liquidity/mint-position)
- [Pinned PositionManager](https://github.com/Uniswap/v4-periphery/blob/dce236d4e2057422d0791d9a973a58765eb46f65/src/PositionManager.sol)
- [Pinned actions](https://github.com/Uniswap/v4-periphery/blob/dce236d4e2057422d0791d9a973a58765eb46f65/src/libraries/Actions.sol)
- [Pinned calldata decoder](https://github.com/Uniswap/v4-periphery/blob/dce236d4e2057422d0791d9a973a58765eb46f65/src/libraries/CalldataDecoder.sol)
- [Pinned Permit2 allowance interface](https://github.com/Uniswap/permit2/blob/cc56ad0f3439c502c246fc5cfcc3db92bb8b7219/src/interfaces/IAllowanceTransfer.sol)
