# Operating shared ownership

This optional edition adds a separate operating custodian for one ANIMA NFT. It does not alter `WholeNFTShares` or its promise to freeze the account.

`OperatingNFTGovernance` owns the NFT. `OperatingVotingShares` represents a fixed initial distribution of transferable voting and buyout rights. The NFT's existing account continues to hold its native currency, tokens and other property. The custodian calls that account's existing `executeUtility`; it does not add an account system, proxy, unrestricted signing service or sovereign promotion path.

## Creation and ownership

1. Choose an unused Bound ANIMA NFT and the initial share allocations.
2. Choose immutable quorum, approval, proposal threshold, voting period, execution delay, buyout approval threshold and minimum funded buyout price.
3. Choose up to 16 fungible tokens whose account balances must be protected around every operation, and commit a property/obligation disclosure.
4. Deploy the custodian and its fixed-distribution voting token. Deploying does not move the NFT.
5. Approve that exact NFT and deposit it. Shares activate only after the NFT transfer and account epoch change succeed.

The fresh-account requirement rejects accounts with an earlier action or instrument grant. This avoids silently importing old approvals and previously executed borrowing arrangements. It cannot certify the absence of every offchain obligation. Shareholders need the full disclosure text as well as its public commitment.

The browser checks the exact normalized custodian, voting token, collection and account runtimes before enabling this edition's workflow. A differently compiled or deployed edition requires its own reviewed artifacts; addresses alone are insufficient.

## Votes and operations

The voting snapshot is the block immediately preceding proposal creation. A later share transfer cannot recycle those votes into a second wallet. Each snapshot holder votes once. Ordinary proposals must satisfy both the configured share-supply quorum and approval fraction among votes cast. Quorum includes both for and against votes. There is no delegated voting, abstain mode, minting after activation, administrator veto, policy upgrade or automatic execution.

After voting ends, anyone may queue a successful proposal. Execution begins only after the configured delay and expires seven days after that time. Proposers can cancel before any votes are cast; anyone may close failed, expired or post-exit proposals. Native buyout escrow is refunded through a separate pull-payment balance.

A voted operation binds:

- Exact target address, executable code hash and calldata.
- Current account nonce, custody epoch and deadline.
- One permitted fungible input and maximum allowance/debit, or a maximum native input/value.
- An output asset and minimum **net balance increase**, when an output minimum is selected.
- An optional exact static-call precondition, its target code hash and expected encoded return hash.
- Prior and next public obligation commitments.

The account installs an exact allowance, calls the target and resets the allowance atomically. The custodian independently verifies protected balances. A deficit in any other tracked token, excess native debit, missing output, failed target, changed precondition, stale account nonce or changed custody reverts the complete operation. A proxy's implementation is not pinned merely by its proxy code hash: use a suitable implementation/state precondition when proposing a proxy operation.

Operations targeting the custodian, underlying account, controlling collection or a protected token contract are rejected. Blocking direct protected-token calls prevents a zero-value proposal from leaving an approval that a spender could use later without budget checks. Governance cannot use this surface to install a different account owner, transfer the controlling NFT, promote sovereignty or give itself an unchecked arbitrary executor. NFT transfer happens only through the explicit complete-share recovery and approved buyout exits.

## Repeat operators

A separate proposal installs an operator for exact calldata and the same asset/precondition constraints. It adds a finite total input budget, at most 100 calls and expiry within 60 days of proposal creation. Each execution uses the current nonce while preserving the voted action. Operators cannot update the obligation commitment. An operator can immediately renounce its own permission; shareholders can revoke through the normal voting and delay process. There is no undisclosed emergency administrator.

Revocation takes the configured governance time; an already approved operator may continue within its finite budget during that interval. Choose budgets and expiry accordingly. A successful buyout or whole-share recovery stops every operator because operating custody has ended.

## Exits and minority rights

Any bidder may escrow at least the immutable minimum buyout price. Approval also requires the chosen buyout fraction of **all** shares, never less than two thirds rounded upward. The interface initially suggests unanimity; the creator chooses the disclosed policy. The offer binds the account nonce and obligation commitment, so an intervening account operation prevents execution at stale terms.

Successful execution transfers the real NFT and its account control to the selected recipient. The existing collection invalidates the previous account epoch. All shareholders, including dissenting minority holders, retain proportional claims on the fully funded native-currency proceeds. Claims burn shares; the final outstanding claim receives the remaining rounding residue. Account assets are not used to pay the purchase price. Rejected or expired offers remain liabilities of their separate escrow until refunded.

A holder who gathers every outstanding share may recover the NFT directly. An outsider cannot prevent that recovery by opening a refundable buyout offer. After recovery, anyone can cancel each outstanding offer so its bidder can withdraw funding. A rejecting NFT receiver causes only that execution to revert; the offer can subsequently expire for refund.

This mechanism does not guarantee a market appraisal, immediate unilateral partial redemption, a liquid share market or minority control over a valid majority operation. The price floor, buyout threshold, snapshot, exact budget review and delay are enforceable protections. Partial pro-rata withdrawal of arbitrary NFT/account property is intentionally unavailable because indivisible assets and external obligations cannot be safely valued by this generic contract.

## Asset and obligation boundaries

The implementation protects native currency and the explicitly registered fungible token balances. Newly received fungible assets must be added through a voted tracking proposal before they can be the approved input/output token. Native fees have no unbounded gas-spending authority: wallet signers pay the transaction gas, and the voted native value is bounded.

An obligation commitment records what a proposal discloses; it does not prove every external debt, legal claim, oracle value or offchain promise. Exact calldata is visible to voters. New borrowing or collateral arrangements require proper disclosure and suitable preconditions. Untracked collectibles and protocol positions are not automatically valued or classified as liabilities. A reverting tracked token fails balance-checked account operations closed; governance's voting, escrow refund and NFT exit paths remain separate from those token reads.

## Interface and integration

- Import `GovernanceDesk` from `web/governance/desk.mjs`; construct with `{chain, provider?, onChange?}` and use `render()`, `mount(root)` and `unmount()`.
- Include `web/governance/desk.css` in the onchain runtime styles.
- Run `scripts/build-governance.mjs` after canonical compilation to generate verified browser artifacts.
- `GovernanceClient.configure(address)` verifies and opens an existing deployment.
- `snapshot({before?})` reads actual chain state and paginates proposals, including decoded operation budgets and conditions.
- `prepareDeploy(...)` and `prepare(action, input)` prepare operations through the shared wallet review and recovery lifecycle. They do not silently sign or submit transactions.
- The desk supports creation, exact NFT approval/deposit, proposals, vote/queue/execute/cancel, tracked assets, bounded operators/revocation, share transfer, fully funded buyouts, refund withdrawal, proportional redemption and whole-share recovery.

The specialist operation editor accepts exact contract calldata and reads real token decimals for entered amounts. It is not a claim that arbitrary calldata is self-explanatory; the decoded proposal also exposes its target, input/output budgets, expected nonce, deadline and state condition. A higher-level instrument may prepare these same fields from its existing reviewed plan.

## Verification

`node --test test/governance/contracts.integration.test.mjs` deploys real ANIMA collection/account contracts and the new operating custodian on Ganache. It exercises ownership/epoch transfer, rejection of the previous owner, checkpoint voting after transfers, quorum/delay/replay, atomic allowance reset, excessive input, insufficient output, unauthorized tracked-asset loss, stale nonce/precondition, bounded operators and revocation, funded supermajority/minority redemption accounting, rejecting recipients, stale offers, refunds and unanimous recovery.

These are local transactions. They do not establish public Ethereum deployment, economic fairness or an independent security audit.

The design uses the established snapshot and timelock principles described in [OpenZeppelin's governance documentation](https://docs.openzeppelin.com/contracts/5.x/governance). These are project-specific contracts; they are not presented as OpenZeppelin Governor, its audited implementation, or an implementation of a governance interoperability standard.
