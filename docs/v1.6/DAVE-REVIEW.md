# Dave Held v1.8 → i dont fucking believe it! v1.5
## Complete supplied-archive review and selective integration plan

**Verdict:** Yes. Dave Held contains valuable architectural work, especially **Codex + Chambers**, NFT-owned venues, fixed external commitments, and separate accounting for free funds versus obligations. Its main contribution is making the NFT an operating account with a persistent business history—not its certificate-themed interface and not the sheer number of financial products.

**Recommendation:** adapt the best mechanisms into the existing organism and its Instruments layer. Do not replace the appearance, transplant the root account, import every contract, or describe the source as deployed functionality. The most important synthesis is: **commitments travel with the artifact; old spending permissions do not.**

### Scope and evidence

I read all **58 regular files** in the supplied ZIP: **22 primary contract files**, **9 supporting library/mock files**, **1 reference registry**, **1 deployment script**, **20 test files**, the README, the HTML floor, and three configuration files. They contain **10,265 physical text lines / 481,795 bytes**. The tests declare **146 test functions and 2 invariant functions**; these are declarations, not a passing-test count.

The review includes authorization, money flow, time and ownership transitions, component composition, oracle and integer-accounting assumptions, renderer/runtime wiring, test assertions, deployment setup, and comparison with selected v1.5 account, exchange, vault, gift and client source. It does not claim to review the absent third-party dependencies or every possible execution state.

The original archive is **148,524 bytes**, SHA-256:

`7499e37a0d4509c3de18c91ef04141d50cadc1dedde3d110b6a2ffd051db4054`

All ZIP members passed CRC checking. Extraction rejected escaping paths and symlinks. Original files were not edited. The source and this report are separate from the NFT build.

**Evidence classes:** source-derived behavior is cited below by exact relative file and original line number; design proposals are labeled proposals; selected arithmetic/branch calculations were independently exercised; Chromium was used to inspect the actual supplied floor. **Solidity compilation, EVM integration, deployment, economic simulation at scale and an independent security audit were not completed.** `forge build` stopped before compilation because Foundry is not installed; solc and the third-party dependency directory are also absent. The ZIP does not include pinned dependency revisions or a dependency lock.

Useful companion files: `SOURCE-EXCERPTS.md`, `evidence/findings.json`, `evidence/review-checks.json`, `evidence/floor-browser.json`, `evidence/source-manifest.json`, and the untouched `source/` tree. Source references below resolve within that tree. No external web research was substituted for reviewing the supplied project.

---

## 1. What Dave Held actually is

The core is an NFT collection with deterministic accounts, time seals, an early-exit penalty, recorded history and a fee accumulator. It adds a family of account-owned trading venues, funded claims, programmable modules and onchain code editions. Much of the code routes revenues and returned capital **vault-ward**: to the NFT account rather than directly to its present controller.

That provides a common organizing idea across Bourse, Charter, House, Indenture and the later modules. A venue identifies an NFT; authorization consults its current holder; assets or fees return to that NFT’s account. Ownership can therefore change without recreating every associated position.

Three distinctions must accompany that idea:

**First, code exists but is not proven to run.** The README itself states that the project was not compiled in its authoring sandbox. Its test and deployment scripts are not execution receipts.

**Second, the floor is a mock ledger.** Its visible positions, prices, trades, yield numbers, people and keeper activity are literal sample data. The 16 tabs navigate, but the 48 finance/action buttons have no handlers. It is not a connected app or even a state-changing local finance rehearsal.

**Third, its promises have different strengths.** A fixed record, a branch condition, an external module, and a marketing sentence do not provide the same guarantee. Several strong README claims fail under source-level counterexamples documented later in this report.

Sources: `README.md:1–59`; `site/floor.html:163–336`; `src/DaveHeld.sol`; `src/DaveVault.sol`; all venue contracts.

## 2. The most valuable material to bring across

### 2.1 Codex: an NFT can carry a library of executable instruments

**What is present.** A holder inscribes immutable byte leaves. An ordered set of leaves becomes an immutable edition. Other holders can reuse existing leaves in new editions. Forge editions can deploy initcode deterministically from the NFT account. Recital editions use a bounded instruction language with swaps, time/price conditions, seal-state checks, sending, sealing and an optional one-shot latch. Deployment does not automatically grant execution authority: a separate Chambers step is required.

Sources: `src/Codex.sol:136–237`, `src/Codex.sol:240–321`; `src/DaveVault.sol:211–226`.

**Why this is useful here.** v1.5 already prepares explicit typed outcomes and receipts. Codex supplies a useful next abstraction: preserve a reviewed procedure as an identifiable, inspectable edition that another NFT can adopt. The artifact would carry not only assets and history, but useful tools that remain reproducible across owners.

**Proposed synthesis — an instrument library.** A creator publishes an edition. World can discuss that exact edition and its simulation results. A user inspects the required assets, recipients, maximum spend, minimum receipts, deadlines and external dependencies. Adoption installs the code as content; a separate grant authorizes a limited use. The agent, when eventually implemented, may propose or trigger only those bounded plans.

Examples are a one-shot swap-to-gift, a fee-harvest-and-lock procedure, a funded release schedule, or a launch settlement checklist. These examples are proposals; Dave does not already implement all those verbs and no new library was integrated during this review.

Immutable bytes establish which program is being referenced. They do **not** establish safety, runtime usefulness, exclusive commercial rights, or correct behavior of external contracts. `WAIT_UNTIL` is a time gate, not a dead-man/inactivity detector. A transaction still has to trigger the procedure. `ONCE` is optional in the supplied language, not a universal replay policy.

### 2.2 Chambers: separate possessing code from granting it power

**What is present.** Module installation has a seven-day visible delay. Removing a docked module is immediate. The sealed execution path takes a balance snapshot, blocks selected transfer/approval patterns, runs the call and checks that the registered balances did not fall beyond one declared spend.

Sources: `src/Chambers.sol:114–189`, `src/Chambers.sol:201–247`.

**What to adopt.** The separation of inscription, deployment and permission; deliberate installation; fast revocation; a bounded execution interface; and checking effects after the call rather than relying on names or descriptions.

**What must change.** The supplied module chooses its own `maxSpend`. The grant does not encode an owner-defined asset budget, beneficiary, minimum output, period or ownership epoch. Registering an approved venue does not prove that a call to it benefits the originating account. The Granary counterexample makes that concrete.

The NFT’s existing account has session epochs, nonce checks and a temporary exact-allowance utility route. Those are preferable starting boundaries; Dave’s unrestricted persistent roster must not silently replace them. The existing Sovereign mode must not gain a new direct-owner/module bypass.

**Proposed rule:** installed code may remain part of the artifact’s history; permission to spend must be reviewed again after custody changes. A new owner may explicitly retain suitable automation, but the seller’s authority must not survive by default.

### 2.3 Bourse and Charter: the NFT can own the market, not merely access it

**What is present.** Bourse has sell shelves, buy walls and two-sided NFT pools, with flat, linear or exponential pricing. Charter has account-owned token pools. The holder can operate the venue subject to its bond and other terms; proceeds and eligible withdrawals return to the NFT’s account. A Bourse bond fixes its end date and blocks relevant withdrawals or repricing while active.

Sources: `src/Bourse.sol:135–275`, `src/Bourse.sol:278–395`; `src/lib/Curves.sol`; `src/Charter.sol:117–194`.

**Why this changes the marketplace.** A whole-artifact sale can include an operating venue, not just the assets currently visible in a wallet. A buyer needs to inspect the book’s inventory, liabilities, fee rights, modules, withdrawal restrictions and future dates.

That extends v1.5’s declared-inventory exchange rather than replacing it. Bourse itself is **not** a whole-estate conditional exchange; it prices NFTs and does not automatically inspect every asset and power inside each traded NFT.

**Proposed synthesis:** add venue-specific manifest adapters. An estate listing commits to the identified venue, relevant reserves/claims, frozen terms, fee beneficiary and active obligations. A settlement must reject material changes outside the agreed predicates. It must also distinguish a trader’s owned ticket or balance from the estate’s free assets.

A bond cannot guarantee a price floor, demand, continuous liquidity, or future profits. “Sell the venue” means transfer specified operating rights and obligations, not sell the independent traders or their identities.

### 2.4 Indenture: your new choices cannot rewrite promises to other people

**What is present.** An Indenture tranche records maturity from the seal at issuance. Extending the owner’s seal later does not extend the note’s maturity. Face-value obligations consume the prefunded sinking fund; only the uncommitted portion can be withdrawn through `drawFree`.

Sources: `src/Indenture.sol:105–155`, `src/Indenture.sol:176–226`.

This is one of the best principles in the archive: **an owner may change their own future choices without changing an already-issued counterparty claim.** It applies directly to accepted gifts, room funding, launch vesting, contributor payments and marketplace transfers.

**Proposed synthesis — a commitment ledger.** The existing future lens could distinguish free capital, committed outgoing amounts, receivable claims and contingent liabilities. Every new action would declare which bucket it touches. Selling the NFT changes the operator, but not a contributor’s signed release date or a beneficiary’s existing claim.

Do not misread Indenture as capital appearing from nowhere: it is prefunded discounted paper. The issuer bears the economic cost of the discount. Also, its late-claim/escheat terms are different from an indefinite gift claim and must not be copied silently.

### 2.5 Patronage and Surety: make World capable of organizing work

**What is present.** Patronage has prefunded seal-incentive campaigns with time-based accrual and forfeiture rules. Surety has term-bound stakes, a named adjudicator, recorded slashes and vault-directed premiums. No-adjudicator pledges are explicitly unslashable.

Sources: `src/Patronage.sol:54–173`; `src/Surety.sol:104–205`.

**What to adapt.** Funds committed before rewards are advertised; explicit eligibility and claim boundaries; inspectable commitments and outcomes; and payments linked to an enduring artifact account.

**Proposed synthesis:** a World conversation can become a funded commission, with a deliverable, acceptance rule, deadline, authorized reviewers, release/refund paths and receipt-linked discussion. A creator could publish a tested instrument edition into that process. Personal authorship and controller-at-time stay distinct from the NFT’s transferable operating history.

This is not already a commission system. Patronage measures its recorded seal/amount weight, not task completion. Surety’s evidence hash is not a proof verifier. Its slashes pay the pool and treasury, not necessarily anyone harmed. A task-bond or customer-protection mechanism needs its own adjudication and payout design.

Do not convert “temper,” “paper hands,” token balances or trade count into a universal human reputation score. A sold artifact may retain a factual operating record; it must not make its new holder the author of the old holder’s work.

### 2.6 Granary, Issue and Strips: useful specialized instruments, separate from the core

**Granary** suggests controlled asset transformation: input assets become a specific account’s strategy shares, and redemptions return to a specified destination. Its current account-binding defect must be corrected, and users need minimum shares/assets, deadlines and strategy assumptions.

**Issue** suggests a different launch template: publish an immutable basket recipe and issue/redeem an asset-backed share class. That could be useful for an artifact whose product is a collection or basket rather than a conventional token sale. The current rounding defect blocks direct adoption.

**Strips** separates principal and future yield rights, and banks earned yield around token transfers. That suggests a useful distinction between selling an enduring object, its principal claims, and a bounded future income right. It is not a guarantee of income or principal safety. Its current early-exit loss allocation needs redesign.

Sources: `src/Granary.sol`, `src/Issue.sol`, `src/Strips.sol`. None of these was added to v1.5 in this review.

## 3. The launchpad and v4 boundary

Dave’s `Charter.sol` describes itself as **v4-shaped** but self-contained. It is a constant-product implementation with its own reserves and observation ring. It is not a PoolManager integration, not a Uniswap v4 hook deployment, not concentrated liquidity and not a launch auction. The README even lists the constitution/launchpad among deferred sockets near its beginning.

Do not replace the current project’s actual v4-source direction with Charter and call that progress. The useful material to port is economic intent: explicit fee rules, who owns the seed position, which claims remain locked, where fees go, and which terms survive a sale. Those must be expressed against the existing hook/PoolManager boundary, compiled and tested there.

A possible future launch plan is: commit sale terms and seed ownership → execute the chosen auction → initialize the actual v4 pool → assign fee rights to the artifact account → record commitments in the listing manifest → publish verifiable activity into World. Dave supplies pieces of that ownership model, not the completed sequence.

Sources: `README.md:1–6,89–104`; `src/Charter.sol:20–40,117–194`; NFT baseline `contracts/src/kingdom/V4GenesisMarket.sol`, `PhoenixLaunchHook.sol`, `EstateExchange.sol`.

## 4. What I would not import as the default experience

The certificate/green-and-gold presentation is a different art direction. There is no reason to substitute it for the approved optical organism. The useful interface lesson is displaying positions, terms and state together—not its typography or decorative seal.

Wake’s paid exclusive trading window is an interesting mechanism experiment, but restricts who can trade and has liveness defects. Its existence is not evidence of sandwich elimination or universally better execution.

House, Wager, Counter’s pawn lending, Scrivener and Registry introduce leverage, outcome resolution, collateral seizure, exercise rules, oracle dependencies or asset-policy assumptions. They should be independently reviewable experiments with isolated capital, not hidden new powers of the root NFT. An inactive frontend button is not a contract-level feature lock.

A module can remain represented in a research catalog without pretending it is implemented, safe, legally cleared, or deployable everywhere. For this project, eligibility policy and readiness status must be separate from security and custody guarantees.

## 5. Source-level findings that block a wholesale merge

The following classifications are this review’s prioritization, not an independent audit rating. All refer to the exact supplied source; none claims an exploit against a deployed system. Reference calculations are not bytecode execution.

### F01 — A seal does not revoke pre-existing token allowances

**Release blocker.** DaveVault.execute can approve a spender while the account is unsealed. The later _seal transition changes time/weight fields but neither revokes nor bounds that external allowance. The spender can subsequently call the token directly, without going through the vault or Chambers. A freeze on the vault’s own transfer entrypoint does not freeze token-level approvals. This also matters at an NFT sale.

**Integration requirement:** Do not substitute DaveVault’s seal for the existing fixed-beneficiary TimeVault. Use isolated escrow for committed principal, tracked authorization policy, and transfer-time reauthorization. Enumerating all historical external approvals is a separate problem.

Source: `src/DaveVault.sol:84–108`; `src/DaveVault.sol:169–176`.

### F02 — The approved Granary can send a sealed account’s value to another account

**Release blocker.** Chambers.act lets the docked module supply spendToken and maxSpend on each call. It checks registered pre/post balances, but no required output or beneficiary. Granary.sow/reap accept daveId from that call and send the proceeds to hub.vaultOf(daveId), without binding daveId to the paying account. A malicious docked module can approve the approved Granary, spend account A’s assets within its self-declared allowance, and mint silo shares to account B. The README’s claim that a rogue module can feed only the vault it serves is not enforced by this composition.

**Integration requirement:** Bind the originating account, beneficiary account, output asset, minimum output, and budget to an owner-authorized capability and exact calldata. A venue allowlist is not a substitute for those constraints. Add a hostile-module cross-account integration test.

Source: `src/Chambers.sol:155–189`; `src/Chambers.sol:226–247`; `src/Granary.sol:74–107`.

### F03 — A sale or pawn does not retire old module authority

**Release blocker.** Chambers deliberately retains its roster across transfers. Proposals and grants carry no ownership epoch; Codex open editions have no per-edition revocation or custody epoch. Counter’s pawn takes NFT custody but does not turn off those independent execution routes. Blocking the previous bearer’s direct call is not the same thing as making the account inert.

**Integration requirement:** Keep installed code and history as inspectable heritage, but invalidate spending capabilities on custody change. Existing economic obligations must survive independently of operator permissions. Escrow must have an explicit no-new-risk mode and pre/post manifest checks.

Source: `src/Chambers.sol:114–165`; `src/Codex.sol:198–237`; `src/Counter.sol:188–278`.

### F04 — Issue’s downward-rounded deposits can mint more claims than the basket funds

**Release blocker.** Issue.create computes each deposit with floor(amountPerShare * grossShares / 1e18). Redemption aggregates shares and floors later. With one raw asset unit per 1e18 shares and zero issuer fees, two creations of 1.9 shares cost two raw units in total. After both 0.42% protocol tolls, the combined redeemable amount still rounds to three raw units. Existing pooled reserves can pay the extra unit. The included reference calculation reproduces this even without nonstandard tokens.

**Integration requirement:** Round required deposits up, constrain meaningful minimum lots, measure actual receipt, and prove reserve coverage across arbitrary mint/redeem partitioning and funds sharing a custody address. Do not market this implementation as always fully backed.

Source: `src/Issue.sol:136–175`.

### F05 — Strips’ pre-maturity loss allocation favors the first exit

**Release blocker.** After equal deposits at rate 1 and the entry toll, two holders each have 49.79 PT and YT and the series holds 99.58 silo shares. If the silo rate halves before maturity, the first holder’s unstrip(49.79) requests all 99.58 shares. The second holder gets zero. The pro-rata impairment branch exists in redeemPrincipal after settlement, but not in the earlier recombination path.

**Integration requirement:** Use a coherent loss waterfall for every exit path, including pre-maturity recombination and yield claims. Compare early and late exit ordering in randomized multi-holder tests. Keep principal/yield decomposition as research until corrected.

Source: `src/Strips.sol:157–198`; `src/Strips.sol:213–249`; `src/Strips.sol:284–311`.

### F06 — Expired conviction weight remains active until someone settles it

**Accounting defect.** ConvictionPool receive/claim uses stored weight with no expiry input. DaveVault retires the weight only when _accrue is reached, including permissionless settle. An expired position therefore continues to receive later fees while nobody triggers retirement. Calling settle later banks the intervening accumulated entitlement; it does not undo it.

**Integration requirement:** Account for expiry at distribution boundaries using an explicit schedule/epoch mechanism, or define and disclose a keeper-dependent eligibility model. Do not describe the current accumulator as automatically rewarding only unexpired seals.

Source: `src/ConvictionPool.sol:31–62`; `src/DaveVault.sol:110–127`.

### F07 — Charter can count empty-pool time as valid price history

**Release blocker.** Pool creation initializes lastTs. During the first liquidity addition, _observe does not advance lastTs when rBase is zero. Once reserves exist, twap extrapolates that new price back to the old lastTs. The first funding checkpoint can have cumulative zero even though later extrapolation charges time back to creation. In the reference sequence (creation t=100, first funding t=3700, query t=5500), the 1800-second average reports three times the unchanged actual price. Price history must distinguish elapsed wall time from time with usable liquidity.

**Integration requirement:** Advance timestamps through empty intervals without inventing price observations; require adequate initialized liquidity history, normalized pair units, and independently reviewed manipulation assumptions. Do not use this oracle for leverage, permissions, or automated gifts as-is.

Source: `src/Charter.sol:106–154`; `src/Charter.sol:287–320`.

### F08 — House solvency includes cutting winners’ profits to remaining backing

**Mechanism limitation.** House.close clamps positive net PnL to d.backing. Its entry open-interest cap does not bound all future profit obligations. Two positions can enter within the cap and later have claims whose combined profits exceed backing. The reference example gives the first closer 1000 units of profit and the second zero, before exit tolls, despite equal positions. Avoiding a negative backing variable is not guaranteeing the advertised mark-to-market payout.

**Integration requirement:** Specify a loss-allocation and settlement policy, funding/valuation assumptions, and payout bounds before integrating. Isolate this experiment from the root treasury and social balances; do not represent it as a production perp engine.

Source: `src/House.sol:233–245`; `src/House.sol:256–293`; `src/House.sol:403–428`.

### F09 — Wake’s compulsory takeover depends on the incumbent accepting payment

**Release blocker.** Wake.take pushes the old seat price plus escrow to the prior keeper and requires that call to succeed. A keeper contract that rejects ETH can make a later takeover revert. The incumbent can continue funding the seat and block the intended forced-sale path. In addition, repeated accrual floors away rent fractions; a very small self-price can produce zero rent under the integer rule.

**Integration requirement:** Use pull-based proceeds, meaningful minimum terms, carried fractional rent, and an explicit liveness model. More fundamentally, an exclusive post-trade window is not a proof of MEV elimination; the keeper itself has privileged trading access.

Source: `src/Wake.sol:123–141`; `src/Wake.sol:179–196`; `src/Wake.sol:212–242`.

### F10 — Wager’s late resolver races the public void path

**Deadline defect.** After resolveBy, voidExpired is allowed but resolve still lacks an upper-time check. The resolver can resolve first after its deadline, defeating the promised automatic availability of a cost-refund outcome. The source also does not bind question text or a question hash in its book-opening record, although the mock UI displays a human question.

**Integration requirement:** Bind the exact question, resolution source, dispute assumptions, and cutoff in the commitment. Make expired resolver and void authority nonoverlapping. Treat voiding as a transaction path, not spontaneous execution.

Source: `src/Wager.sol:120–169`; `src/Wager.sol:248–273`; `site/floor.html:212–218`.

### F11 — The treasury tranche can be minted repeatedly

**Privileged issuance defect.** mintTreasury is timelock-only, but each invocation mints another 300 NFTs. It has no one-shot flag and no total-supply check in that path. Empty funding is permitted. This contradicts treating the 300 treasury tranche and collection scarcity as mechanically fixed by this function.

**Integration requirement:** Enforce a one-shot allocation and a common hard cap across every mint path. Test repeated authorized calls as well as unauthorized callers. Genesis collateral eligibility is a separate policy: arbitrary tokens and raw amounts do not establish meaningful economic backing.

Source: `src/DaveHeld.sol:124–176`.

### F12 — Anyone can fill or poison the bounded bag registry

**Availability defect.** acknowledge is permissionless, accepts a token reporting a nonzero balance, and permanently appends it to a rack capped at 32. No removal path is provided. A third party can fill that rack with junk; a token whose balanceOf later reverts or consumes excessive gas can disrupt Chambers snapshots and other loops. A finite list makes loops bounded but does not make its contents trustworthy.

**Integration requirement:** Separate observed inventory from assets opted into enforcement. Give the custodian an explicit quarantine policy while preserving actual encumbrances; handle failed balance queries as unknown rather than silently zero or universally fatal.

Source: `src/DaveVault.sol:62–79`; `src/Chambers.sol:201–218`.

### F13 — Token units and actual transferred amounts are not consistently normalized

**Integration blocker.** Registry normalizes oracle answers to 1e18 and treats the result as raw quote units. Its mock USDC uses 18 decimals. BagRenderer similarly divides all bag balances by 1e18. Many custody paths trust the requested ERC-20 amount after a successful transfer call without checking the actual balance delta. Some modules document unsupported tokens; that limitation still needs enforcement at the integration boundary.

**Integration requirement:** Use explicit asset-unit metadata, normalized prices, carefully chosen rounding, supported-token restrictions, and exact receipt checks. Add 6/8/18-decimal, false-return, fee-on-transfer, rebasing, reverting and callback-token cases. Do not silently advertise arbitrary assets.

Source: `src/Registry.sol:343–367`; `src/BagRenderer.sol:122–126`; `src/Granary.sol:77–105`; `src/lib/MockERC20.sol:1–20`.

### F14 — The floor is a static ledger and wiring specification, not a dapp

**Product mismatch.** floor.html explicitly calls D a mock ledger. Sixteen tabs render fixed rows. Action buttons are created without handlers, and the ticker is a literal event list. A Chromium review visited all 16 tabs and clicked all 48 action buttons: the corresponding folio and mock ledger remained unchanged. External font requests were blocked for the check.

**Integration requirement:** Use its desk organization only as a reference. Keep the current organism and existing reviewed interaction flows. Build transaction preparation and receipt-backed state for any adopted feature instead of importing display-only buttons.

Source: `site/floor.html:163–182`; `site/floor.html:273–336`.

### F15 — The onchain website bootloader calls the wrong selector

**Runtime blocker.** BagRenderer sends eth_call data 0x9a3b6c14 for SiteKernel.runtime(). Independent C and JavaScript Keccak calculations both yield 0x54d75aa6 for runtime(). The supplied SiteKernel has no matching fallback. The bootloader also byte-decodes UTF-8 with String.fromCharCode, silently catches runtime errors, and has no self-contained L0 image when its optional URL argument is absent. The deploy checklist mentions shipping the whole HTML, whereas the bootloader expects a JavaScript function body.

**Integration requirement:** Generate ABI selectors, test retrieval through the actual bootloader, decode UTF-8 correctly, pin a known application manifest/version, and show failures. SiteKernel’s timelocked mutable active chunk set is a different policy from v1.5’s planned immutable application archive.

Source: `src/BagRenderer.sol:141–157`; `src/SiteKernel.sol:19–35`; `script/Deploy.s.sol:100–116`.

### F16 — Several supplied tests would not establish their named property

**Evidence limitation.** House and Registry set an oracle timestamp before _openWindow, whose timelock helper advances seven days. Ordinary tests then use that stale feed. House’s funding-view test expects elapsed funding to affect equityOf although the view uses the stored index without projection. A Wake test expects vacant-seat escrow to exclude a price no incumbent received. The monotonicity invariant compares current unlock with a historical maximum, which also permits decreases.

**Integration requirement:** Repair fixtures and assertions before using test counts as evidence. Expand the invariant handler to cover approvals, transfers, docked modules, pooled liabilities, receivers, and expiry ordering. The 146 test and 2 invariant function declarations in this ZIP were not executed in an EVM here.

Source: `test/Base.t.sol:56–69`; `test/House.t.sol:21–34`; `test/House.t.sol:73–89`; `test/Registry.t.sol:22–37`; `test/Wake.t.sol:1–110`; `test/Invariants.t.sol:1–100`.

### F17 — Patronage and Surety are not verified contribution or insurance systems

**Semantic limitation.** Patronage rewards a campaign’s recorded seal/amount weight, not completion of a creative task. That snapshot can diverge from later holdings. Surety accepts a named adjudicator and an evidence hash but supplies no dispute/proof-verification process; a no-adjudicator pledge is deliberately unslashable. Slashed assets pay the pool and treasury, not an injured customer. Aggregate raw stake across different tokens is not a comparable value or universal reputation score.

**Integration requirement:** For World, show specific fulfilled commitments, authors, custody-at-time, method of verification, and dispute outcomes. A future task-bounty or service bond needs its own consent, acceptance, payout and adjudication rules. Do not infer social status from wealth or recycling trades.

Source: `src/Patronage.sol:75–135`; `src/Surety.sol:104–163`; `src/Surety.sol:209–231`.

### F18 — Global configuration and external policies can still change

**Integration limitation.** A seven-day timelock controls many hub/venue dependencies. A bond can freeze a stored policy address without freezing the code or permissions behind an external policy. SiteKernel replaces its active chunk array at each ship. Token-level roster grants and global target approvals are distinct governance surfaces; a global approveTarget change can change what an already-docked module can do.

**Integration requirement:** Show every relevant administrator, implementation dependency, and update delay in capability and listing manifests. Pin immutable terms where required, define migration explicitly, and distinguish identity-preserving upgrades from an unchanging application.

Source: `src/lib/Timelock.sol:1–47`; `src/DaveHeld.sol:70–122`; `src/Charter.sol:156–194`; `src/SiteKernel.sol:27–35`.

### F19 — Escheat deadlines are product terms, not interchangeable with indefinite gifts

**Lifecycle limitation.** Wager and Indenture permit sweeping unclaimed funds after specified late-claim windows. Those are choices about claim expiry and administration. They must not be inherited silently by v1.5’s accepted gifts or fixed-beneficiary locks. Indenture correctly pins its maturity at issuance rather than moving it with later seal extensions, but its actual claim window must accompany that date.

**Integration requirement:** Expose principal, maturity, claim deadline, recipient and expired-claim destination in a machine-readable schedule. Preserve the semantics of existing gifts. Never interpret an NFT sale, relock, or new edition as consent from an external creditor.

Source: `src/Indenture.sol:105–131`; `src/Indenture.sol:213–256`; `src/Wager.sol:276–322`.

### F20 — Best-effort ragequit fan-out can skip venue-specific consequences

**Failure-handling limitation.** The hub iterates registered hooks and catches their failures. An individual venue penalty can fail without preventing the root ragequit from completing. Dynamic histories in some hook implementations also create growing work. This is a liveness tradeoff, not a universal guarantee that every promised penalty and reward adjustment always happened.

**Integration requirement:** Record failed settlement obligations explicitly, bound and batch work, and make retries idempotent. Prefer venue-held, independently enforceable liabilities to relying on a successful callback chain at a root ownership transition.

Source: `src/DaveHeld.sol:197–212`; `src/Patronage.sol:138–161`.

## 6. Recommended integration order

### First: add the missing authority and obligation boundaries

Keep v1.5’s organism and account as the baseline. Before adding financial modules, define the distinction between **installed content**, **permission to execute**, **existing obligations**, and **observable history**. The first is portable heritage, the second is owner-epoch-bound, the third survives custody changes under its own rules, and the fourth retains historical authorship.

The current v1.5 exchange already acknowledges that its manifest does not cover pending gift-module rights. Adding Dave’s pools, debt, recipes and collateral before extending that manifest would make the same gap much larger. Finish gift/obligation-aware manifests and escrow behavior before importing more sources of liabilities.

### Second: adapt Codex as an instrument library, not an arbitrary transaction interpreter

Start with a small set of existing, testable v1.5 actions. A proposed edition descriptor should bind its schema, ordered content hash, input and output asset types, operation count, dependencies, and simulation description. A separate execution grant should bind the chain, NFT account, custody epoch, exact targets/selectors, recipient, per-call and cumulative spend, minimum outputs, expiry, nonce/repetition policy and allowed caller.

A content hash does not pin every proxy implementation or external policy. Those dependencies need explicit treatment. A one-time instruction cannot substitute for grant expiry. A public trigger should never have discretion over an omitted receiver.

The first integrated recipe should be narrow—for example, harvest specified fees to the same account and put an explicitly selected portion into a fixed-beneficiary lock. Only after that route has real contract tests should broader plans be considered.

### Third: connect editions, commitments and receipts to World

World should be able to distinguish a published recipe, a proposed grant, an accepted commitment, an executed transaction, a failed attempt and a disputed result. A room can discuss each as a structured object without treating a chat assertion as execution evidence.

A future commission can reference a deliverable edition and its tested behaviors. Personal author identity, custody-at-time and the enduring artifact are separate records. An NFT purchase must not purchase the people, their private conversations, or their former author identity. Dave supplies a code-publication record and economic events, not a private messaging protocol or moderation system.

### Fourth: make the marketplace understand operating instruments

Extend the existing exchange with reviewed manifest adapters for one module at a time. Each adapter identifies what is free, what is reserved, what can be changed by whom, what must survive transfer, and what happens on expiry/default. A listing must say whether its automation is stopped, restarted with buyer consent, or constrained to completing already accepted obligations.

A buyer could inspect a launch’s fee rights, a venue’s outstanding book, an instrument’s exact edition and a fixed future schedule before acquiring control. That is a more meaningful whole-NFT market than placing a folder of arbitrary contracts behind a thumbnail.

### Fifth: keep the remaining desks as isolated research modules

After repairs and integration tests, evaluate one of Granary, Issue, Patronage-style campaigns or explicitly funded notes against a concrete user need. Keep House, Wager, Wake, covered options and pawn credit outside the default root-account grant. A policy switch may decide availability, but it cannot make an untested financial model correct or repair missing custody checks.

No module or new version was implemented during this review. These are the recommended workstreams derived from the supplied sources.

## 7. Validation performed in this review

**Archive:** 64 ZIP entries / 58 regular files; CRC succeeded; every extracted file hashed. Full source remained unchanged after inspection.

**Code-reading coverage:** all 58 supplied files. All primary contract paths and tests were read, including the later Strips, Surety and Issue additions—not only the early README scope. Supporting libraries, renderer, bootstrap, deployment and configuration were included. External libraries named by imports were not supplied and were not reviewed.

**Reference checks:** ten observations were reproduced across independent selector calculation, integer accounting, source-branch examples and script syntax. Highlights:

| Check | Observed result | Boundary |
|---|---|---|
| `runtime()` selector, C and JavaScript Keccak | Both `0x54d75aa6`; supplied bootloader uses `0x9a3b6c14` | Selector calculation, not deployed call |
| Issue deposit/redeem partitioning | Two raw units paid; three redeemable after protocol fees under the stated case | Integer translation of source |
| Strips drawdown before maturity | First equal holder can take all 99.58 remaining shares; second gets zero | Two-holder reference state |
| Expired ConvictionPool weight | Unsettled expired 3-weight position receives 3 of a new 43 ETH distribution against weights 3+40 | Stored-weight accumulator example |
| Charter empty-interval accounting | Constant actual price 2 is reported as 6 in the specified initial sequence | Timestamp/cumulative reference model |
| House underfunded profitable exits | Equal positions receive different profits depending on close order | Payout branch, before tolls |
| Wager deadline | Resolver and public void paths both allowed after resolveBy | Predicate comparison |
| Floor inline script | Node syntax check succeeds | Does not make its buttons functional |

Other observations record Wake’s vacant-seat escrow and per-accrual fractional rent loss. The small integer rent difference is not claimed to be an economically profitable attack after transaction costs.

**Browser:** Chromium 144.0.7559.96 loaded the original HTML using `page.set_content`, with all outbound requests aborted and no wallet injected. All 16 tabs were visited and 48 action buttons clicked. The associated folio and mock ledger stayed unchanged after action clicks. There were no page exceptions in these scenarios. The Google Fonts request was blocked; this is not a font-accurate aesthetic review, network deployment test or wallet test.

**Solidity attempt:** `forge build` exited 127, `forge: command not found`. No compiler or EVM tests ran. There is no inferred PASS for the 146 supplied test functions. No contract address, transaction hash, bytecode artifact, gas measurement or audit certificate was produced.

The reproduction scripts and raw JSON are in this package. Re-running them requires the documented local Python/Node/C/browser tools; none needs a wallet or network connection. The executable C helper is a test-only attributed CC0 Keccak adaptation from the supplied NFT baseline, not new protocol code.

## 8. The idea to retain

The strongest outcome is not an NFT with sixteen more buttons. It is an artifact that carries **useful programs, inspectable operating rights and meaningful commitments**, while keeping their permissions distinct.

An owner could discover an instrument in a conversation, inspect it, authorize a bounded use, observe a real receipt, attach a fixed promise to its result and later transfer the artifact without rewriting either the promise or the past. That composition is a proposal drawn from both projects, not a claim that the current archive already does all of it.

The right transplant is Dave’s mechanism vocabulary and coherent ownership model, with stronger authorization and accounting—not Dave’s appearance or its absolute marketing claims.

---

## Appendix A — primary component decisions

| Source | Useful material | Decision for the NFT |
|---|---|---|
| DaveHeld | Identity hub, deterministic account wiring, issue paths and sockets | Reference only; keep current identity and repair supply/epoch assumptions before reuse |
| DaveVault | Separation of account, seal, history and module entrypoints | Do not replace TimeVault/account with this seal; approvals and inherited permissions need redesign |
| BagRenderer | Onchain metadata and a lightweight bootstrap | Keep current organism; fix selector, UTF-8 and amount formatting before considering bootstrap reuse |
| ConvictionPool | Index-based funded fee distribution | Adapt only with correct expiry and eligibility handling; ERC-20 distribution is not implemented by the ETH index |
| Patronage | Prefunded campaigns, accrual, explicit forfeiture | Candidate for a separately designed commission/reward module, not contribution proof |
| IconRegistry | Small public registry with paid entries | Low priority; overwritable labels/glyphs must not be trusted metadata or unsanitized display code |
| SiteKernel | Chunked onchain application material | Compare immutable edition manifests with its mutable active runtime; do not silently replace current archive policy |
| Bourse | NFT-owned shelves, bid walls, curves and venue bonds | High-value market-ownership model; extend whole-estate manifests rather than use it as the entire marketplace |
| Charter | NFT-owned token venue, fees, bonds and observation structure | Economic reference only; not v4, and observation accounting needs repair |
| Wake | Explicit ownership and rental of an execution privilege | Research-only; takeover liveness and rent accounting fail desired guarantees |
| House | Isolated position/backing accounting and explicit exposure limits | Not a ready perp product; clarify profit haircuts, oracles and settlement before any integration |
| Registry | Pair-specific oracle and allowlist interfaces | Adapter research; units, quote completeness and external dependencies need review |
| Chambers | Delayed installation, instant removal, post-call measurements | High priority as a pattern; redesign grants around outputs, budgets and custody epochs |
| Codex | Immutable leaves/editions, code deployment separate from authorization, bounded recipes | Highest-priority creative primitive; adapt existing typed plans instead of copying its interpreter blindly |
| Wager | Prefunded contingent claims and void concept | Research-only; bind question/rules and fix deadline conflict and asset units |
| Counter | Same-transaction flash repayment and whole-artifact collateral concept | Keep isolated; collateral must actually disable independent permissions and disclose contents/liabilities |
| Granary | Controlled conversions and explicit account-directed destinations | Useful adapter concept after fixing paying-account/recipient binding and minimum outputs |
| Scrivener | Physically covered claim accounting, maturity and reserved cover | Optional specialized experiment; covered does not mean risk-free or a root-account default |
| Indenture | Fixed maturity, prefunded obligations, free versus committed accounting | High-value commitment pattern; keep claim expiry/discount economics explicit |
| Strips | Separate principal/future income and historical accrual at transfers | Conceptual value; do not use implementation until loss-ordering defects are resolved |
| Surety | Funded service commitment, term and adjudicator records | Task-specific future use; not insurance, objective truth or a universal résumé |
| Issue | Immutable in-kind basket recipe and separate creation/redemption policy | Potential alternative launch instrument; blocked by rounding and custody-accounting issues |

## Appendix B — every supplied file

This ledger records what was read, not execution success. Exact sizes and SHA-256 hashes are in `evidence/source-manifest.json`.

| File | Lines | Review coverage |
|---|---:|---|
| `.gitignore` | 5 | Build/dependency exclusions; no executable logic. |
| `README.md` | 326 | All codicils and claimed invariants cross-checked against implementations; early scope text lags later modules. |
| `foundry.toml` | 14 | Compiler, optimizer, RPC aliases and fuzz/invariant configuration; not proof of an installed toolchain. |
| `remappings.txt` | 3 | External dependency resolution; pinned source revisions absent. |
| `script/Deploy.s.sol` | 116 | Wiring and timelock follow-up checklist; not executed; no deployment receipts. |
| `site/floor.html` | 338 | Full CSS/markup/JS read; 16-tab static mock ledger; 48 action buttons have no execution handlers. |
| `src/BagRenderer.sol` | 173 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/Bourse.sol` | 541 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/Chambers.sol` | 260 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/Charter.sol` | 400 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/Codex.sol` | 321 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/ConvictionPool.sol` | 70 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/Counter.sol` | 367 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/DaveHeld.sol` | 226 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/DaveVault.sol` | 257 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/Granary.sol` | 129 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/House.sol` | 467 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/IconRegistry.sol` | 32 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/Indenture.sol` | 299 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/Issue.sol` | 226 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/Patronage.sol` | 177 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/Registry.sol` | 434 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/Scrivener.sol` | 317 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/SiteKernel.sol` | 37 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/Strips.sol` | 329 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/Surety.sol` | 244 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/Wager.sol` | 400 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/Wake.sol` | 244 | Full implementation read: authority, flows, lifecycle, dependencies and reuse decision in Appendix A / findings. |
| `src/lib/AccountFooter.sol` | 19 | Account binding/footer decoding; relevant only with its matching proxy format. |
| `src/lib/Curves.sol` | 55 | Flat, linear and exponential curve arithmetic; fees/rounding and units need integrated checks. |
| `src/lib/Interfaces.sol` | 38 | Minimal local token/account interfaces; not a general standards-conformance certificate. |
| `src/lib/MockERC20.sol` | 11 | Mock uses 18 decimals; does not cover 6-decimal or adversarial tokens. |
| `src/lib/MockERC4626.sol` | 36 | Proportional silo mock; full loss/liquidity/hostile-token behavior not established. |
| `src/lib/MockERC721.sol` | 84 | Simple mintable royalty mock; not whole-account transfer safety. |
| `src/lib/Oracles.sol` | 34 | Minimal oracle/allowlist abstractions and mocks; external policy and unit assumptions. |
| `src/lib/Tiers.sol` | 31 | Seal spans and weights; duration is not human identity or contribution. |
| `src/lib/Timelock.sol` | 47 | Queue/execute/cancel and admin update surface; delay alone does not prove a target safe. |
| `src/vendor/ERC6551Registry.sol` | 52 | Bundled reference registry code; compare proxy/footer construction, not drop-in migration. |
| `test/Base.t.sol` | 81 | Shared mocks, wiring and seven-day timelock helper; central to oracle fixture-age issue. |
| `test/Bourse.t.sol` | 319 | Full test source read; assertions and fixture assumptions reviewed. Not EVM-executed. |
| `test/Chambers.t.sol` | 192 | Module balance/firewall paths and inherited roster tested by source; receiver-binding attack not covered. |
| `test/Charter.t.sol` | 168 | Full test source read; assertions and fixture assumptions reviewed. Not EVM-executed. |
| `test/Codex.t.sol` | 285 | Inscription/forge/recital and optional ONCE examples; no automatic per-edition epoch/revoke. |
| `test/Counter.t.sol` | 156 | Direct former-bearer restriction tested; does not prove pawned module/allowance inactivity. |
| `test/Genesis.t.sol` | 103 | Full test source read; assertions and fixture assumptions reviewed. Not EVM-executed. |
| `test/Granary.t.sol` | 117 | Full test source read; assertions and fixture assumptions reviewed. Not EVM-executed. |
| `test/House.t.sol` | 246 | Stale initial feed, non-projected funding expectation and payout/clamping assertions reviewed. |
| `test/Indenture.t.sol` | 145 | Full test source read; assertions and fixture assumptions reviewed. Not EVM-executed. |
| `test/Invariants.t.sol` | 73 | Only seal/warp/rage handler; monotonicity assertion permits decreases; composition not exercised. |
| `test/Patronage.t.sol` | 105 | Full test source read; assertions and fixture assumptions reviewed. Not EVM-executed. |
| `test/Pool.t.sol` | 54 | Full test source read; assertions and fixture assumptions reviewed. Not EVM-executed. |
| `test/Registry.t.sol` | 157 | Stale initial feed and mock quote/royalty expectations reviewed; all quote assets are 18-decimal mocks. |
| `test/Scrivener.t.sol` | 159 | Full test source read; assertions and fixture assumptions reviewed. Not EVM-executed. |
| `test/Strips.t.sol` | 141 | Principal/yield scenarios; pre-maturity drawdown exit-order counterexample absent. |
| `test/SuretyIssue.t.sol` | 193 | Stake/basket happy paths; no general adversarial partition-rounding proof. |
| `test/Vault.t.sol` | 118 | Full test source read; assertions and fixture assumptions reviewed. Not EVM-executed. |
| `test/Wager.t.sol` | 151 | Full test source read; assertions and fixture assumptions reviewed. Not EVM-executed. |
| `test/Wake.t.sol` | 143 | Vacant-seat payment expectations conflict with current cost branch; no rejecting-incumbent case. |

## Appendix C — package and reproducibility

Run `python run_review_checks.py` for the source inventory, selector cross-check and reference examples. Run `python check_floor_browser.py` with Python Playwright and Chromium installed for the static UI check. These scripts do not install packages or broadcast transactions. `build_review.py` reconstructs the findings JSON and verbatim source-excerpt document.

`reference-keccak.c` retains its source attribution and CC0 notice. `reference-evm.mjs` is the dependency-free codec from the supplied v1.5 baseline; it is used only for an independent selector comparison, not to contact a wallet.

Inputs were left unchanged. This is a review handoff, not a patched release, a new NFT interface, a deployed protocol, or an independent security audit.
