# Fee strategies and funded v4 automation

This release adds actual v4 contract operations. All financial submissions use the shared wallet/NFT account review. Deployment bytecode and immutable dependencies are verified. Local tests execute the pinned Uniswap v4 PoolManager; they are not public Ethereum deployment or funded private-proof evidence.

## Position earnings

New `GenesisV4Position` deployments support `collectFees`, `reinvestFees`, `addLiquidity`, `pendingFees`, `previewReinvest` and holder-specific `previewRedeemFor`.

Fee-only collection realizes PoolManager fees and pays only the calling holder's earnings. It does not burn shares or remove principal. Per-share fee checkpoints prevent a holder from collecting the same earnings repeatedly. Uncollected earnings transfer proportionally with shares, including transfers into and out of TimeVault. This preserves the existing vesting custody relationship.

Reinvestment consumes only the caller's fee credits and adds actual liquidity to the same position and range. Shares are minted at the existing liquidity/share ratio. Minting checkpoints old earnings first so a new deposit cannot acquire prior earnings for free. Both token budgets are enforced after the PoolManager operation; an insufficient budget reverts the entire transaction. Unused budget units return to the payer. Additional liquidity is unavailable after full redemption; a closed position cannot be reseeded.

Core fee-growth rounding can leave sub-token units in PoolManager custody. Fractional holder dividends accumulate in position custody until the final redemption, which receives the remaining position-level rounding. Every fully exited holder has already moved or withdrawn their whole-unit fee claim; there is no administrator sweep. Both kinds of rounding are included in scenario accounting. Tests exercise partial transfers, partial redemption, collection, reinvestment and final principal recovery. New source does not mutate any older deployed position.

The legacy `previewRedeem(shares)` obtains holder information from the call sender. Calls without an identified sender return a conservative principal estimate. Use `previewRedeemFor(holder, shares)` when the paying wallet/NFT account is known.

## Beneficiary payout conversion

`V4SettlementConverter` implements the existing `OwnerFeeRouter` converter interface. It performs one exact-input swap through the verified Genesis v4 router and an explicit PoolKey. The route binds input/output assets, direction, price limit and hook quote data. The converter pins the router code hash and PoolManager. The caller receives all actual output.

The beneficiary chooses the earned input amount, output minimum, expiry and payout destination. Other beneficiaries' claims remain reserved. Token approvals are exact and reset to zero. Native ETH must first be wrapped for these ERC20 pool routes. This is an actual pool conversion, with no guaranteed exchange rate.

## Optional irrevocable promises

`OwnerV4FeeHook.commitPolicy(maximumFee, recipient, splitterMode, exactFee)` permanently fixes the destination and either a maximum or exact creator fee. Existing mutable hooks remain mutable until their owner explicitly commits. Ownership transfers do not undo a commitment. Hook fee accrual already earned remains attached to its recorded recipient bucket.

`OwnerFeeRouter.commitSplit()` permanently fixes future deposit recipients and weights. Deposited claims were already immutable. A hook that commits only a splitter address does not by itself freeze the splitter's weights. The GUI exposes these as separate, explicitly irreversible reviews. Converter allowlisting is separate and revocable.

## Optional automatic compounding

`V4FeeCompounder` is a single-owner, fixed-position custody vault. The owner explicitly deposits LP shares and can withdraw them, with their uncollected fees, at any time. The vault is not a time lock. Its fixed owner may be the NFT account, in which case the account's operating right follows NFT ownership.

The owner selects per-execution fee budgets, minimum liquidity increment, execution interval, policy expiry and keeper reward. The policy is revocable. An external caller may execute only a due policy. Actual reinvestment uses the current position's available fee balances, with a 1% budget margin, and mints shares back to the vault. A keeper cannot choose another pool or redirect principal, earnings or refunds. Unused token budgets pay the fixed owner. Rewards are prepaid and credited only after success. The owner can recover unused reward funding; credited rewards use a pull withdrawal to avoid a reverting recipient blocking other work.

Automatic means an external process submits transactions. A browser timer is not the executor, and funding rewards does not guarantee someone will execute.

## Funded scheduled exits

`V4ScheduledExit.create` escrows the exact token input and the complete initial keeper-reward budget. The plan commits its output beneficiary, route, number of slices, timing, expiry and aggregate minimum output. Every slice enforces a proportional minimum rounded upward. Only due, funded slices execute, with exact input consumption and all output paid to the recorded beneficiary.

The creating wallet/NFT account may pause, resume or change its own minimum, and cancel to recover remaining input plus unearned reward credit. A caller cannot redirect output. A failed trade leaves inputs and rewards in place. Anyone may submit a due slice, but a funded executor must pay gas. An expired or uneconomic plan remains cancellable. Hook quote caps remain enforced through the scheduled route.

## Operator

`agent/v4-exit-keeper.mjs` is read-only by default. `--execute` enables explicit bounded signing; `--watch` repeats scans every 15 seconds; `--compound` selects the compounding-vault lifecycle instead of scheduled exits.

Configure:

- `ANIMA_V4_STRATEGY_RPC`: explicit RPC endpoint.
- `ANIMA_V4_STRATEGY_CHAIN_ID`: expected chain ID.
- `ANIMA_V4_STRATEGY_VAULT`: verified exit or compounder contract.
- `ANIMA_V4_STRATEGY_IDS`: comma-separated exit plan IDs; unused in compounder mode.
- `ANIMA_V4_STRATEGY_STATE`: durable local state path.
- `ANIMA_V4_STRATEGY_KEEPER_KEY`: separately funded executor key, required only for execution.
- `ANIMA_V4_STRATEGY_GAS_BUDGET_WEI`: maximum execution-gas budget for the process.
- `ANIMA_V4_STRATEGY_MAX_FEE_GWEI`: maximum accepted gas price.

The corresponding older `ANIMA_V4_EXIT_*` names remain accepted. No key or RPC credential is written to the receipt journal. The executor fsyncs a transaction identity before broadcasting, checks canonical confirmations, discovers mined nonce replacements within a bounded block scan, and refuses additional signing while a prior submission is unresolved. A crash before broadcast can leave an intentionally unresolved identity; inspect it before clearing state. It never silently lowers a price floor or blindly resends after an uncertain receipt. The operator supports Ethereum execution-gas accounting; L2 data-fee budgeting requires a dedicated adapter.

## Economic simulator

`EconomicsDesk` follows the selected ANIMA v4 launch terms with exact integer custody conservation. It includes trades, fee-only collection, LP-share transfers/redemption, fee reinvestment, beneficiary conversions, immutable promises, token/LP allocations, vesting and funded exit execution/cancellation. Rejected events roll back and stop the sequence. Quote/native funding, principal, PoolManager fee dust, position fee custody, pending creator fees, beneficiary claims and keeper rewards remain separately accounted for.

The swap calculation models one position, standard ERC20 assets, zero protocol fee and no outside transactions/liquidity. Actual PoolManager tests reconcile modeled swap outputs, collected fees and minted reinvestment shares. This does not predict markets. The mechanism selector also exposes the existing community-sale replay and a new exact ANIMA streaming-auction lifecycle replay. The latter reproduces block-based release, pre-bid/pre-cancel checkpoints, price/sequence ordering, uniform checkpoint pricing, remaining bid escrow, refunds, seller proceeds and unsold inventory claims, reconciled action by action with actual contract executions. Official CCA and Doppler are available in the same mechanism selector through their pinned-contract scenario service. They execute real local contract lifecycles rather than substituting an ANIMA pool curve. Run `node agent/scenarios/server.mjs` and enter its private access code in the selected protocol pane. A hosted interface also requires `ANIMA_SCENARIO_ORIGIN` to match its origin. Each session has its own local chain and funded test actors; no browser wallet or real funds are used. Switching mechanism or leaving the panel closes the session and clears its credentials. Protocol balances, gas burn, fees, claims, migration and LP custody come from the actual local chain; scenario exports contain snapshots, not service credentials.

## Verification

- `node integrations/console/protocol/v4-hook/test/strategy-flows.cjs`: genuine pinned PoolManager, fee/principal conservation, partial transfer/redemption, payout conversion, immutable promises, compounding and exit recovery.
- `node --test test/launchpad/strategy-keeper.test.mjs`: durable submission identity, canonical/reorganized/replaced receipt handling and read-only status.
- `node --test test/launchpad/economics-auction.test.mjs`: actual-contract streaming-auction reconciliation, equal-price priority, stale-slot rejection, unsold inventory and refund conservation.
- `node --test test/launchpad/economics.test.mjs`: integer conservation, privacy-independent economic ownership, atomic rejection, vesting and reward recovery.
- `node --test test/launchpad/strategies-ui.test.mjs`: stale-review rejection, async funding-account isolation, explicit custody/commitment review, exact exports and official scenario credential clearing.

Underlying v4 mechanics: [Uniswap unlock callbacks and deltas](https://developers.uniswap.org/docs/protocols/v4/guides/unlock-callback-and-deltas), [liquidity increases](https://developers.uniswap.org/docs/protocols/v4/guides/managing-liquidity/increase-liquidity). Those references describe protocol behavior; they are not audits of this implementation.
