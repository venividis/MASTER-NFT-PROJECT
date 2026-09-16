# Experimental extension contracts — specifications, not executors

These interfaces define where the remaining Dave mechanisms would fit. No financial runtime, quote, contract ABI certification or readiness is implied. Each must consume only explicit cell funds and expose a per-account commitment to the immutable deployment index. New risk can close independently from settlement and exits. None can use a root session, root NFT custody or an arbitrary callback to increase its budget.

## Shared admission contract

A future adapter needs `accountCommitment(account)` plus a readable version/dependency manifest, exact asset units, actor/counterparty/beneficiary attribution, explicit input limits, fixed or bounded outputs, validity dates, idempotent exits, a supported-token policy and bounded work. The cell checks caller, epoch, target/codehash, full calldata, nonce, input ceilings and required output balances. Immutable edition content and permission remain separate. Unknown adapters are not automatically included in a marketplace snapshot.

## House — oracle-based leveraged exposure

**Not implemented.** Proposed state transitions: prefund isolated backing → offer bounded exposure → accept margin and payout cap → update with a defined oracle → settle a whole epoch/loss waterfall → permit claims. It cannot promise unlimited mark-to-market profits from finite backing. Equal-priority claims require an order-independent insolvency rule; “pay the first closer, clamp the rest” is rejected. Entry requires the specified fresh normalized oracle, adequate liquidity/history, stale-feed handling, and a complete settlement rule. Exit when the oracle is unavailable needs a predetermined emergency process, not a discretionary price improvised by an operator.

Required tests include simultaneous winners beyond backing, adverse gaps, 6/8/18 decimal normalization, stale/future timestamp, price-source mutation, first/last exit comparisons, reentrancy, funding accrual in views, and honest insolvency reporting. No claim of fully collateralized profit or automatic solvency is made.

## Wager — contingent outcome book

**Not implemented.** Proposed immutable terms bind the exact question bytes/hash, outcomes, resolver, resolution source, dispute method, cutoff, refund conditions and claim deadline. Resolver authority ends strictly before the public void route begins. Money remains in outcome-specific escrow; World can discuss the question but cannot resolve it by posting an unsupported claim. A named resolver/evidence hash is not an objective proof. A timeout requires someone to submit a valid settlement transaction.

Tests must cover the last permitted resolver timestamp, the first void timestamp, no overlapping authority, losing/winning/void claims, duplicate claims, absent resolver, disputes, residual funds and recipient-specific claim expiration. Existing gifts must not acquire this book's escheat rule.

## Wake — exclusive keeper-seat experiment

**Not implemented.** Proposed terms have fixed rent arithmetic, fractional carry, an explicit price floor/lot policy, permission boundaries, takeover eligibility and expiry. Forced takeover credits the old holder in a pull ledger; it cannot require the incumbent to accept an ETH callback. Taking a seat never grants a root allowance. Exclusivity is a disclosed mechanism choice, not a claim of universal MEV elimination or fair access.

Required tests include a rejecting incumbent, zero/sub-unit rent accumulation across partitioned calls, seat expiry/funding races, equal payment accounting under frequent accrual, denied trading paths, and takeover/grant epoch changes.

## Registry and independent income trading

Oracle-based collateral quotes and independent PT/YT trading remain separate research integrations. The working matched-rights experiment is not a substitute for the full income-accrual and impairment waterfall. Neither raw share counts nor a codehash establish the market value of backing.

## Future release gate

Each proposed adapter must independently pass compilation, EVM adversarial tests, economic loss/exit simulations, bytecode size/gas bounds, source verification, a live wallet client, permission/deployment checks and security review before it is considered runnable. Chain-specific and jurisdiction-specific availability remains a separate product/legal configuration that is not implemented by this specification or by `ExperimentGate`.
