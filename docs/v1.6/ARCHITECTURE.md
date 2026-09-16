# Operating Instruments — v1.6

**Delivery:** the original optical NFT with an additive operating interface; executable local models; new and revised **uncompiled Solidity source**. No wallet integration for the new instruments, deployment, economic certification, or independent audit is claimed.

## One artifact, four different kinds of continuity

An NFT's identity is not its owner's personal identity. Published code is not authorization. A loan or an accepted gift is not a freely spendable balance. A laboratory's funds are not a standing allowance over the root account.

This release makes four kinds of records explicit: **content** (editions), **authority** (epoch-bound grants), **commitments** (independent lifecycle and fixed counterparties), and **evidence** (typed action records with historical authorship). They share one interface and one local archive without sharing unrestricted financial authority.

The visual foundation is unchanged. `web/reference/approved-1.2.html` is byte-identical after removing this build's added layer; the shader, original shader, Wasm and archived reference HTML hashes are recorded in `reports/v1.6/preservation.json`. Fold Space remains a view change. Seal Memory remains an unrecoverable salted trace. The new interface refuses to write in an original historical/descendant view, a connected-chain view, or Sovereign mode without its missing utility proof adapter.

## 1. The operating model

`OperatingEngine` extends, rather than replaces, v1.5's `InstrumentEngine`. Its export embeds the unchanged v1.5 instrument envelope within an `idfbi/operating/1.6` envelope. Old archives can be imported explicitly; browser storage is separately keyed by original genesis and version. A corrupt save is not silently overwritten. Import is a local replacement, not a blockchain migration or an authenticated history.

A record can have one or more causal predecessors: publication, adoption, grant, execution, commission, delivery, payment, credit, and option lifecycle. World displays those typed events independently of prose. A statement somebody writes does not generate an action receipt. The receipt graph represents known model causality; it does not infer every trade on every chain.

All new buttons use the existing review, rollback, storage conflict and original-state guards. Core Trade/Lock/Give plans have typed context commitments. Administrative/simple reviews bind the whole current local checksum. An unrelated chat message therefore can invalidate a simple administrative review while not necessarily invalidating a core financial plan. This is a conservative interaction difference, not universal intent execution.

### Authorship

The actual triggering persona remains the event author even when using another account's permitted recipe. The artifact and its custodian-at-time are separate. A sale retires old grant authority but does not rewrite the author of an edition or message. A commission's named human reviewer and worker remain those people after a sale; refunds go to the funding account, whose control can change.

## 2. Library — Codex's publication model, not an arbitrary interpreter

**Local behavior:** publish a finite typed recipe, adopt its immutable edition, wait a seven-day local review period, then grant an explicit caller a per-call and lifetime budget, call count and expiry. Immediate revocation and custody-epoch rejection apply. Publication and adoption do not debit funds. The GUI publishes an exact AUR reserve-lock recipe; the model API accepts the existing finite Trade/Lock/Give vocabulary. No eval, uploaded JavaScript, arbitrary bytecode or model inference runs.

**Solidity:** `EditionRegistry` stores public immutable byte leaves and ordered editions with authorship/custody metadata. `SovereignAccount` adds adoption and exact-calldata grants. `InstrumentRouter` implements a bounded direct-lock or swap-and-lock route with the caller account as beneficiary. The grant commits to the exact target, input, calldata, budget, caller, nonce, expiry and epoch; it is not proof that arbitrary adopted content obeys its description. The owner is still responsible for authorizing a reviewed target. Codehash pinning alone does not pin a proxy implementation.

There is no unrestricted onchain Codex VM, installable agent runtime, autonomous scheduler, arbitrary CREATE2 program deployment, or completed fee-harvest recipe in this release. A date does not spontaneously execute an EVM transaction.

## 3. Work — prefunded commissions, not a reputation or insurance score

A sponsor funds an exact amount before offering a job. A distinct worker explicitly accepts. Submission has a deadline. The fixed personal reviewer can accept/pay or reject/refund until a three-day review grace expires. Unaccepted/undelivered jobs can refund at their submission deadline; submitted but undecided jobs refund after review expiry.

The local model binds delivery to the worker's own published edition. `CommissionEscrow` stores a deliverable digest and **does not verify its quality or authorship**. Onchain payouts use pull claims; the model credits its local personal/account ledger immediately. There is no appeal, objective-work oracle, anonymous evaluator or automatic worker payment for a silent reviewer. The worker accepts the disclosed trust/refund policy before starting.

This adapts the prefunding and explicit-counterparty ideas from Patronage/Surety. It does not transplant conviction weights, seal-based rewards, slashes paid to a treasury, or raw-wealth reputation.

## 4. Commitment-aware marketplace

The local marketplace now binds the known gift, installation, grant, commission, collectible, shelf, cell, credit, option and application records in addition to the original asset/lock inventory. Both sample listings are assigned fresh operating manifests with explicit events, not retroactively rewritten historical receipts.

Counterparty actions remain possible while a root NFT is escrowed: a recipient may accept a gift, or a worker/reviewer can settle an existing commission. These changes invalidate the offered manifest. The seller can refresh it, and the buyer must review the new commitment. This is deliberate liveness: listing the sponsor's NFT must not freeze another person's already-accepted rights.

`CommitmentIndex` provides the source-level counterpart: an immutable, bounded list of module adapters and their codehashes, plus the cell factory. Root and associated-cell module commitments are included. The cell inventory commitment is **mandatory even if the factory is not redundantly listed as an adapter**. `EstateExchange` checks that root before and after the NFT receiver callback, alongside declared balances, child ownership, lock records, selected allowances, instrument revision and account action nonce. Changing grants/sessions or calling the account during the callback invalidates the purchase.

This is NOT a universal proof of no liabilities or approvals. Unknown external contracts, untracked assets, proxy upgrades, or dishonest external token balance reports are not magically discovered. The index has a finite deployment universe. Adding another module requires an explicit new index/exchange migration, not a mutable surprise roster. Unavailable configured adapters fail closed for purchase; cancellation is a separate path. Valuation and price movements are not guaranteed by a commitment.

Old v1.5 active listings imported without a v1.6 covenant cannot be purchased silently; cancel/relist or explicitly refresh as seller. Onchain old immutable accounts and exchanges are **not upgraded in place** by this package.

## 5. Bonded operating shelves

The local Library can create a fictional collectible referring to a public edition; collecting it grants no exclusive copyright. The artifact can put it on a fixed-price shelf with a fixed bond end. Purchase moves the item while its ETH proceeds remain in the shelf until that end. The owner-account, not a hard-coded former owner's wallet, receives released proceeds.

`BondedShelf` contains the corresponding source for one ERC-721 item and a native-currency fixed ask. It deliberately rejects the project's root NFT collection, which requires `EstateExchange` content checks. It is not Bourse's complete buy-wall, two-sided curve market, royalty engine, or a universal child-NFT safety checker. Local collectible creation has no equivalent deployed mint in this build. The revised account adds ERC-721 and ERC-1155 receiver callbacks for external collectibles without granting execution power. Safe nesting of the root collection itself is deliberately rejected; ownership-cycle protection for arbitrary nested root transfers remains a separate, incomplete workstream.

## 6. Experimental cells — compatible interfaces, separate capital

**New-risk path:** explicit root allocation → separate cell balance → module-specific opt-in → reviewed operation. The cell has no root execution target or delegatecall path. It cannot silently request a root token allowance. Root-owned claims and existing liabilities remain visible in the marketplace. The experimental module contracts can also be called directly by an EOA or a Bound owner-authorized root executor; they do not enforce exclusive cell membership. Isolation is guaranteed only by the reviewed cell execution path and its explicit funding boundary, not by freezing every independent transaction an owner might authorize outside that path. The shipped local UI uses the cell path only.

**Exit path:** module entry can be disabled without disabling its repayment, withdrawal or settlement function. Custody change invalidates old cell adapter grants. The local UI permits new-owner exits without enabling new risk; the Solidity cell requires the new owner to explicitly re-adopt the target adapter before calling an exit. That re-adoption does not override the module's closed entry gate.

The single cell has a shared free pool and explicit module escrow/position records. Modules are not advertised as five separately insured accounts. Credit loss or strategy loss is confined to the assets actually allocated or explicitly escrowed, under the stated supported-token assumptions. Unknown malicious tokens or contracts remain a risk.

### Implemented experimental primitives

| Dave idea | Local model and new source | Deliberate simplification |
|---|---|---|
| Granary | Receiver-pinned strategy shares; exact receipt/minimum output source checks | No live strategy or simulated yield promise. External ERC-4626 strategy risk remains. |
| Issue | Fixed two-asset basket; ceiling inputs and floored redemption | No arbitrary index basket, management fees, rebalancing or price oracle. Onchain last dust pays an immutable beneficiary; local final dust returns to its cell. |
| Strips | Proportional matched-right recombination, including before maturity | No independently transferable PT/YT or live income accrual. Source holds strategy shares; local stress changes illustrative backing. |
| Counter | Negotiated fixed-term collateralized credit, exact repayment and nonoverlapping default cutoff | No root-NFT pawn, flash loans, oracle valuation, floating rate or dynamic liquidation. |
| Scrivener | Physically covered calls with fixed premium/strike and expiry | No naked options, margining, oracle pricing or automatic exercise. |

Credit/options sources accept two ERC-20 contracts, not native ETH. The local demonstration uses fictional ETH/AUR. A live client would need explicit wrapped-native handling and reviewed token units; no adapter is silently assumed. Counterparty principal, cover and payments become module pull claims onchain, whereas local balances update immediately.

`ExperimentGate` is default-closed. Its guardian can enable entry only on the configured local/test chain IDs 31337, 84532 and 11155111. This is a source-level readiness gate, **not jurisdictional eligibility, a license, or an audit**. Source remains uncompiled. There are no deployed cells, gates or module addresses.

### Defined but not runnable

House, Wager and Wake have architecture slots and explicit interfaces/invariants in `EXPERIMENTAL-SPECS.md`. No executor, enabled financial button or profitable scenario is fabricated for them. The reviewed House loss allocation, Wager deadline/oracle semantics, and Wake takeover liveness cannot be repaired by hiding a button. Oracle-based Registry positions likewise remain outside this release. Their inclusion in the architecture is not a claim of implementation.

## 7. v4 and social integration boundaries

The existing real-PoolManager-call adapter and narrow hook source are retained, not replaced by Dave's self-contained “v4-shaped” Charter. The browser remains a reserve approximation, not a v4 tick simulation. The hook name inherited from the rejected v1.4 source does not introduce phoenix visuals. Seed rights, fee beneficiaries and fixed policies remain as previously documented. CCA, a universal aggregator and production MEV guarantees remain absent.

New operating Solidity modules expose their own events/commitments. They do **not** all append the new local actions into the old WorldLedger activity storage; that contract still trusts its sealed original protocol callers. A live social client must verify and combine receipts from the explicitly configured module contracts, or a separately reviewed future ledger must admit the exact module/event bindings. The local feed is implemented and tested; live indexing/receipt decoding is not.

## 8. Application editions and permanence

An application edition recorded in the new UI commits to a SHA-256 and byte count. It does not upload, fetch, evaluate or deploy code. Separately, the actual release HTML is split into local immutable-archive payloads with exact reassembly and expected data-code hashes. Their deployed-address fields are null.

The complete client is recoverable from this ZIP. Storing that client onchain would still store a **rehearsal** until its live adapter is completed. Browsers, RPC/wallet/resolver trust, finality and proof infrastructure are separate from application byte availability.

## 9. Implementation map

`web/operating/engine.mjs`: unified local records, grants, commitments and experiments.  
`web/operating/app.js`: additive Library/Work/Commitments/Lab and operating shelf/application pages.  
`web/instruments/app.js`: original instrument interaction layer, new entry points and social integration.  
`contracts/src/operating/`: edition, commitment index, commission, finite router, cell/gate, strategy/basket/matched-rights, credit/options and shelf source.  
`contracts/src/core/SovereignAccount.sol`: new bounded grants and revision tracking.  
`contracts/src/kingdom/EstateExchange.sol`: commitment-aware revised exchange.  
`contracts/src/protocol/TimeVault.sol`, `contracts/src/instruments/ConsentGiftRouter.sol`: beneficiary/donor commitment updates.  
`test/operating/`: executed local tests/browser flows and separately marked, unexecuted EVM tests.  
`system-manifest.json`: source/readiness and activation boundaries.  
`reports/v1.6/`: exact recorded evidence.

## Source basis

Dave Held v1.8 as supplied, SHA-256 `7499e37a0d4509c3de18c91ef04141d50cadc1dedde3d110b6a2ffd051db4054`; prior full review `docs/v1.6/DAVE-REVIEW.md`. This release selectively adapts its architectural ideas. It does not import Dave's complete vulnerable execution roster, generic root sealing, issuance, leveraged trading, or static floor UI. Baseline v1.5 is preserved as the supplied starting archive, not silently called an onchain deployment.

External interface references checked for the implementation: ERC-4626 (https://eips.ethereum.org/EIPS/eip-4626), ERC-7579 (https://eips.ethereum.org/EIPS/eip-7579), Solidity security considerations (https://docs.soliditylang.org/en/latest/security-considerations.html). These are references, not conformance claims or a substitute for compiling this source.
