# House, Wager and Wake — implemented experimental executors

F08, F09 and F10 now have Solidity executors, typed wallet actions and real local EVM tests. This is source and local execution evidence. It is **not** a public-chain deployment, financial production certification or security audit. The existing `ExperimentGate` only enables new entries on chain IDs 31337, 84532 and 11155111. All gates initially remain closed.

All three adapters expose `accountCommitment(account)`, `version()`, named immutable dependencies, per-asset escrow totals, per-recipient pull claims and reserve inspection. They accept exact-transfer ERC-20 tokens. Fee-on-transfer, rebasing, confiscating and callback-dependent token semantics are not supported as safe backing. Unsolicited donations appear as surplus and cannot be swept by an administrator. Settlement never needs an incumbent, winner, treasury or other beneficiary to accept a callback.

The exact identity of the **caller** owns positions and claims. A wallet, the NFT account and its isolated experimental cell are different callers. A cell must explicitly fund and adopt the adapter, with expected nonce, ownership epoch and exact input limits; a root account session is never implicitly granted. Individual experiments do not gain the root NFT or root purse. The deployment index must separately adopt and certify each module before its claims participate in any wider asset snapshot.

## F08 — House: borrow to buy an isolated real spot position

Like you are five: you put some coins on the table. Someone lends more coins. Together those coins buy an asset that stays in this box. When the box sells the asset, it pays the lender first and gives you the rest. If the asset falls too far, both you and the lender can lose money.

### Exact behavior

1. `offer(terms)` pulls the borrower's **quote-token collateral**. Immutable offer terms specify collateral, lender principal, fixed total debt, minimum base purchase, minimum and maximum entry price, acceptance deadline and maturity. Principal is at most four times collateral: initial funded spot exposure is at most five times contributed equity. Debt cannot exceed the initial quote funding.
2. `fund(id, minimumBase, deadline)` pulls a separate lender's exact principal. It swaps collateral plus principal through the immutable venue and records the **actual base-token balance received**. Both the borrower and the lender have a minimum fill. The normalized, fresh price must satisfy the borrower's immutable entry range and leave the position above the immutable maintenance ratio. All input approvals return to zero.
3. The borrower can `close` at any time. Anyone can close after maturity, or when fresh marked position value is at or below `debt × maintenanceBps / 10000`. The sale must satisfy the greater of the caller's minimum and the current oracle-based slippage floor. A stale feed, a changed pinned dependency, an inadequate fill or an invented venue receipt rejects the operation atomically.
4. Sale proceeds pay `min(actual proceeds, fixed debt)` to the lender's pull claim. The borrower gets the remaining actual proceeds. `debtShortfall = fixed debt − lender payment` is recorded on the position. There is no off-box claim against the borrower and no hidden draw on another position.
5. `repay` lets the borrower contribute the exact fixed quote debt and recover **all purchased base** without consulting either oracle or venue.
6. `cancel` returns an unfilled offer's collateral. The borrower can cancel; after acceptance expires, anyone can trigger its refund.
7. After `maturity + exitGrace`, anyone can use `settleInKind`. It allocates `min(heldBase, ceil(fixedDebt × baseUnit / entryPrice))` base units to the lender, and the remainder to the borrower. This predetermined conversion uses the agreed **entry price**, even if all external dependencies fail. It is not a claim about current market value or current debt recovery. Participants must explicitly accept this fallback before funding; a new edition would be needed for a different fallback rule.

### Conservation and loss order

For each position:

`collateral + principal = quote tokens actually spent purchasing held base`

`realized sale proceeds = lender quote claim + borrower quote claim`

`held base = lender base claim + borrower base claim` for an in-kind close.

Every position has separate acquired inventory and a separate lender. There are no equal-priority pooled LP claims to allocate across closers. A profitable position must receive the money from its **actual venue sale**; an oracle mark does not create spendable money. If the venue cannot pay or fill, the sale fails, and repayment or the predetermined in-kind route remains available. The local tests settle equal positions in reversed order and compare their loss allocation.

Example in a 6-decimal quote token and 18-decimal base token: 1,000 contributed quote units plus a 2,000 loan buys 1.5 base units at 2,000. Fixed debt is 2,020. A sale at 2,500 receives 3,750: lender 2,020, borrower 1,730. A gap to 800 receives 1,200: lender 1,200, borrower zero, disclosed debt shortfall 820. This arithmetic illustrates the mechanism; it is not a return forecast.

### Concrete integrations and limits

- `HouseNativeMarketVenue` adapts the existing ANIMA `swap(input, output, amount, minimum, deadline, identity=0, lockUntil=0)` interface. It pins market code, consumes an exact transient approval, verifies exact input/output changes, rejects unexpected locked output and returns the purchased asset to its caller. Existing onchain market pools must have liquidity for the chosen route. Base and quote must both be ERC-20 contracts.
- `HouseFeedRatio` reads two named price feeds with the **same numeraire** and divides their prices. It normalizes feed decimals and quote-token decimals, and rejects nonpositive values, stale/future timestamps and a changed decimal definition. It supports decimals through 18; the EVM tests cover 6, 8 and 18 decimal outputs. `baseUnit` in House must be one whole base token in raw units. The dependency review must confirm the feed identities, units and freshness settings.
- A fresh price is not proof that its source is economically manipulation-resistant. A bytecode hash does not certify oracle coverage, history, liquidity or the implementation behind an upgradeable proxy. A production deployment needs appropriate source selection, heartbeat and circuit-breaker choices, and chain-specific sequencer checks. They are not fabricated by this module.
- The fixed debt includes the whole agreed financing charge. There is **no time-varying funding accrual** or hidden funding rate. The read returns the same debt before and after checkpoints. No short positions, synthetic perps or unlimited synthetic mark-to-market profits are offered.

This is an explicit, narrower replacement for the unimplemented pooled exposure sketch in `docs/v1.6/EXPERIMENTAL-SPECS.md`. It implements real leverage, realized cashflows, borrower-first/lender-second loss, freshness guards and terminal exits. The original pooled synthetic epoch architecture remains a different mechanism.

## F09 — Wager: funded, tradable binary outcomes

Like you are five: two people put agreed coins into a box and choose opposite answers to one exact question. A named answer-giver says what happened. If someone objects, another named judge decides. The winner gets the coins; if the people responsible for answering disappear, the box returns each side's own coins.

### Immutable market terms and custody

Each market stores the exact question digest, resolution-source digest, resolver address, separate arbiter address, maker and taker stake amounts, dispute bond, acceptance cutoff, event close time, proposal cutoff, arbitration cutoff, challenge duration and whether the maker owns YES. Store and verify the full question and source text corresponding to the hashes before funding. A hash is a commitment, not readable source availability or proof of truth.

The creator deposits the maker stake. `accept` deposits the fixed taker stake before `acceptBy`. The two sides may have different sizes, but **every stake that can be paid is already held**. An unmatched offer can be cancelled by its maker or refunded by anyone at/after its acceptance cutoff.

Before event close, a holder can list its funded side with `offerSide`. `buySide` checks the exact expected seller and price, optionally enforces a reserved buyer, pulls the buyer's payment into a seller pull claim and transfers that side's payout/refund rights atomically. It cannot spend the underlying pooled stake. Holders may also give a side away using `transferSide`; this is a gift of its refund rights as well as its potential winning payout. A holder can cancel a listing while the entry gate is closed.

### Resolution, dispute and liveness

| State | Who may act | Exact resulting money |
| --- | --- | --- |
| Matched, event closed, before `proposeBy` | Named resolver posts a bond and an answer/evidence digest | Stakes stay escrowed during the whole challenge window |
| Proposed, before `proposedAt + challengeSeconds` | A current side holder challenges with another bond and evidence | Both stakes and both bonds remain held pending the named arbiter |
| Proposed, at/after challenge-window end | Anyone calls `finalize` | Winning holder gets both stakes; resolver gets its original bond back |
| Challenged, strictly before `arbitrateBy` | Named arbiter returns NO or YES | Winning holder gets both stakes; correct proposed/challenged answer gets both bonds |
| Challenged, strictly before `arbitrateBy` | Named arbiter declares invalid | Each current side holder gets its original side stake; each bond returns to its poster |
| Matched, at/after `proposeBy`, with no proposal | Anyone calls `voidExpired` | Each current side holder gets its original side stake |
| Challenged, at/after `arbitrateBy`, without arbitration | Anyone calls `voidExpired` | Each current side holder gets its original side stake; both bonds return to their posters |

The last valid proposal is at `proposeBy − 1`. The no-proposal refund begins exactly at `proposeBy`. A proposal made at that last valid second still receives its **entire** challenge window. Arbiter authority ends strictly before public dispute timeout begins. A transaction must execute these transitions; a clock alone does not submit one.

Credits are permanent until withdrawn, with **no claim expiration, sweep or treasury escheat**. This deliberately selects a simpler claim policy than the optional expiring-claim sketch. Existing gifts acquire no expiration rule. The resolver and arbiter remain trusted question-specific authorities. Neither their signatures, hashes nor the public social layer constitutes an objective truth proof. The marketplace can expose the question and source, but cannot silently resolve the wager itself.

## F10 — Wake: rent and take over a keeper seat

Like you are five: a helper pays rent for the first turn at a job. Another helper can buy that turn at the written price. If the first helper stops doing the work, others can help after the waiting time. When the turn ends, unused rent goes back to the helper.

### Terms and arithmetic

Immutable deployment terms name the rent ERC-20, treasury, fixed task adapter, minimum self-assessed seat price, takeover price increment, lease duration, exclusive liveness window and rational rent rate.

`exact rent = seatPrice × rentNumerator × elapsedSeconds / rentDenominator`

An incoming holder pays the ceiling of full-duration rent in advance. During a live takeover it also pays the incumbent's current seat price as compensation. The new self-assessed price must be at least `oldPrice + priceIncrement`; with no active seat it must meet `priceFloor`. `maximumPayment`, transaction deadline and `expectedEpoch` protect the reviewed purchase from state changes.

Checkpoints credit only whole elapsed rent and retain the remainder in `fractionalRent`. At takeover, release or expiry, one final remaining fractional raw unit is rounded up and credited to the treasury. Any unused prepaid **whole** units go back to the incumbent. Thus partitioning one lease into many checkpoints cannot alter its charge. Separate completed leases each settle their own last fraction. Views include elapsed rent before a transaction posts it.

The incumbent's self-assessed seat price is **not** refundable capital owed by Wake. It is paid only when a later incoming holder chooses a valid takeover. Initial seat acquisition needs rent but no incumbent compensation. There is no guaranteed purchaser, investment return or keeper revenue.

### Work, ownership and exits

- `take` activates or replaces a seat and changes its epoch. Incumbent compensation and unused rent become pull claims, so a rejecting recipient cannot veto takeover.
- `release(expectedEpoch)` ends the holder's lease and refunds unused prepaid rent. `checkpoint` ends a lease that reached its fixed expiry. Both remain available with entries disabled.
- `run(task, data, expectedEpoch)` invokes only the immutable task adapter. It never sends native value, grants token allowances or borrows root-account authority. The target must separately bind and authenticate its Wake caller and validate/deduplicate the task.
- The current holder has access during the exclusive window. Others gain access when the holder has not completed work for `exclusiveGrace`, when the fixed lease expires or when there is no holder. A successful incumbent task restarts only the short exclusivity window; it **cannot extend the prepaid lease's expiry**. Failed tasks roll back counters and timing. The current task adapter determines which completed tasks are valid; a malicious or trivial adapter is not made meaningful by the lease wrapper.
- `WakeExitTask` is a concrete adapter for the existing vested-exit vault. Its installer binds one Wake address once. Task bytes are the ABI encoding of `(planId, sliceId)` and the task ID is their Keccak-256 digest. It checks eligibility and executes the selected exit slice. It cannot redirect the exit beneficiary. Binding another Wake later is impossible.

**Exclusivity applies to this adapter route.** The underlying vested-exit vault deliberately retains its direct permissionless execution route. Renting Wake cannot prevent someone from calling such a public route elsewhere. This release does not claim universal MEV exclusion, market-wide exclusive execution, fair access, a keeper reward subsidy or guaranteed jobs.

## Wallet preparation and deployment

`web/extensions/experimental.mjs` exports `ACTIONS` for the workbench and `prepareExperimentalAction` for a typed review. The helper reads the actual executor version, test network, entry gate, immutable assets/dependencies, position/market/lease terms, caller, exact input spend and fixed withdrawal recipient. It encodes a concrete transaction but does not sign one. Root-account or cell execution must preserve that caller's ownership and nonce checks. The designated resolver and arbiter need to execute with the exact named account or wallet.

Deploy in dependency order:

1. A supported `ExperimentGate`; leave each new executor disabled while inspecting dependencies.
2. House price feeds/normalized oracle and liquidity-bearing ANIMA market/venue adapter; then House with reviewed units, bounds, freshness and maintenance terms.
3. Wager with the intended exact-transfer stake token.
4. A compatible task adapter, then Wake with the reviewed rent terms; for `WakeExitTask`, call the one-time `bind(wake)` using its installer.
5. Verify deployed source and chain configuration, inspect/fund the **separate cell**, adopt adapter code and tracked output assets, and register the relevant commitment endpoints. Enable specific experiment entries only after their dependency review.

No mock price feed, token, liquidity venue, task, signing key, public-chain address or funded account is silently supplied. The unit-test fixtures are named `Experimental*Mock` and live under `test/`, outside deployment sources.

## Validation evidence

Run `node --test test/extensions/experimental-contracts.test.mjs`. It compiles only the relevant dependency graph with Solidity 0.8.30, optimizer/viaIR and Shanghai, and executes transactions against a real local EVM. It does not overwrite the project's production artifacts.

Coverage includes actual funded purchases through the ANIMA swap adapter, profit and gap-loss settlement, reversed position-closing order, fixed-debt repayment, deterministic emergency distribution, unfilled refunds, stale/future/zero/out-of-bound prices, dishonest receipts, inadequate fills, 6/8/18 normalization, feed-decimal mutation, reentrant transfer/withdrawal attempts, paid outcome-side transfer, winning/losing/invalid outcomes, challenge and authority deadlines, absent authority refunds, duplicate actions, perpetual claims, fractional rent across partitioned checkpoints, rejecting incumbents, takeover and expiry epochs, liveness fallback, task failure/replay and concrete exit-adapter execution. It also verifies runtime sizes and typed-review ABI/cashflow consistency.

These tests establish the specified local mechanics. They do not establish an external oracle's economic security, production pool liquidity, an arbiter's honesty, an external task's value or correct chain deployment.

## Primary references used for mechanism boundaries

- [Aave — Health Factor & Liquidations](https://aave.com/help/borrowing/liquidations): collateral value relative to debt determines liquidation eligibility. House uses its own explicit fixed-debt threshold and loss waterfall; it is not an Aave implementation.
- [Chainlink — Data Feeds API Reference](https://docs.chain.link/data-feeds/api-reference): feed decimals and update timestamps must be interpreted from the selected feed; proxy/aggregator configuration must be reviewed. The adapter uses `latestRoundData`, normalized units and freshness checks. It does not treat the deprecated `answeredInRound` field as an objective freshness guarantee.
