# i dont fucking believe it! — Instruments
## Research, synthesis, and implementation boundaries / 5 September 2026

**The artistic constraint:** the meditation is a metaphor for discovery, not a scene to illustrate. No phoenix, castle, crystal mesh, replacement organism, or new cosmology is introduced. The approved v1.2 optical field is the actual starting application, not a link behind a redesign.

**The engineering result:** an additive, working local interaction study; typed outcome reviews; consent-based future gifts; connected launch/swap/lock/market/social controls; preserved original assets; an experimental Solidity gift router alongside the inherited uncompiled v4 and account contracts. There is no deployment, verified AI execution, live v4 quote, private group cryptography, or cross-chain authority migration in this release.

This report distinguishes **source findings**, **design inference**, and **implementation**. Standards research is not a conformance certificate. “All NFT standards” is treated as a landscape investigation, not a false claim to have exhausted every proprietary interface, chain-specific convention, obsolete draft, or future proposal. The official [ERC registry](https://eips.ethereum.org/erc) and the research paper [Understanding NFTs from EIP Standards](https://arxiv.org/html/2508.07190v1) are useful discovery maps; individual specifications remain the authority.

---

## 1. Start below the feature list

The useful first principles are not “an NFT should have every crypto button.” They are questions about an enduring object:

- What identifies it through time, and which observations are only views?
- Who may cause which state transition, with whose money, under what constraints?
- Which promises survive a transfer of custody?
- Which people, memories, credentials, and relationships must **not** be treated as possessions?
- What can an independent observer actually verify?

The original project already separates viewpoint from authority. Its Fold Space is a visual coordinate transformation. Its historical forms are read-only. Its Seal Memory retains a salted digest and discards the words and salt. Its full browser application was not deployed onchain, and its custom account factory was not canonical ERC-6551. These are supplied-project facts, not gaps to fill with stronger marketing. See the preserved `web/reference/approved-1.2.html`, `docs/RESEARCH-1.2.md`, and original validation report.

The synthesis is **a persistent artifact with composable commitments**. Identity, custody, balances, time-based claims, execution permissions, authored messages, and representations are related but different records. A coherent upgrade composes them without collapsing them into one notion of “ownership.”

This produces a more demanding definition of surprise: a familiar action reveals a useful capability, while its consequences remain understandable. A swap can create a gift with consent. A purchase can be conditioned on what the artifact contains. A chat entry can expose the specific transaction it discusses. A future view can reveal contractual availability without pretending that time or market prices have already changed.

## 2. Crypto culture: several traditions, not a single audience

### Privacy and self-determination

Eric Hughes's [A Cypherpunk's Manifesto](https://erichughes.org/) emphasizes selective disclosure and systems that let people act without unnecessary centralized permission. Vitalik Buterin's [Make Ethereum Cypherpunk Again](https://vitalik.eth.limo/general/2023/12/28/cypherpunk.html) argues for a broader ecosystem than financial speculation. These are influential participant perspectives, not survey evidence that every crypto user shares the same values.

**Design inference:** the artifact should open without a wallet demand, provide inspectable records, and make exits and permissions visible. A public room must not be advertised as confidential. An AI interface must not smuggle spending authority into an ordinary conversation.

### Memes, play, identity, and participation

Buterin's [discussion of memecoins](https://vitalik.eth.limo/general/2024/03/29/memecoins.html) distinguishes playful participation from purely extractive outcomes and considers public-good-oriented alternatives. The useful lesson is not to eliminate play. It is to avoid making manipulation, constant trading, or exclusion the only meaningful activities.

**Design inference:** World should accommodate jokes, collaboration, creations, and gifts alongside market activity. There is no global score equating trading volume with virtue, skill, or humanity. A receipt proves the reported action under its verification assumptions—not that its actor is a good person.

### Generative art and open-ended interpretation

[Art Blocks' protocol documentation](https://docs.artblocks.io/protocol/overview/) treats generative code and reproducible inputs as central to an artwork. [Loot](https://www.lootproject.com/) deliberately leaves interpretation and downstream creation open. These are different ways for an artifact to contain more than a pre-rendered picture.

**Design inference:** preserve this project's actual procedural renderer. Open-endedness belongs in composable instruments, documented interfaces, and voluntary community creations. It does not require imposing a fantasy world on the owner.

### Collective resources and credible exits

[Nouns](https://nouns.wtf/) links recurring NFT auctions and a community treasury. [Moloch/DAOhaus](https://daohaus.club/moloch) and its [membership documentation](https://docs.daohaus.club/contracts/membership) distinguish voting and financial rights and make exit an important design concern. [Optimism's retro-funding documentation](https://github.com/ethereum-optimism/community-hub/blob/main/pages/citizens-house/how-retro-funding-works.mdx) centers rewards for demonstrated contribution rather than only promises of future work.

**Design inference:** an artifact's future commons could have bounded budgets, explicit beneficiaries, transparent decision rules, and an exit process appropriate to that pool. A chat moderator should not thereby control the treasury. A financial share should not imply ownership over participants.

### Permanence is a systems property

Jacob Horne's [Hyperstructures](https://jacob.energy/hyperstructures.html) offers an ambitious account of persistent, open protocol infrastructure. It is an architectural perspective, not proof that any given app will operate forever.

**Design inference:** permanence requires examining byte availability, dependencies, keys, economics, upgrades, and read access. An onchain URI pointing to a missing service is not the same as a recoverable application. A beautiful interface with no functioning exit is not the desired achievement.

## 3. NFT and adjacent standard families

Each entry below is a researched interface or protocol family, not a claim that the release implements it. Status changes are possible. Three particularly relevant status checks on 5 September 2026 were **ERC-7857 Final**, **ERC-6551 Review**, and **ERC-8004 Draft**. “Final” still does not mean a particular implementation has been audited.

### Identity and quantities

| Specification | Useful distinction | Decision for this project |
|---|---|---|
| [ERC-165](https://eips.ethereum.org/EIPS/eip-165) | Interface discovery | Check actual behavior, not just a positive interface response. |
| [ERC-721](https://eips.ethereum.org/EIPS/eip-721) | Unique-token custody | Retain an enduring identity anchor. |
| [ERC-20](https://eips.ethereum.org/EIPS/eip-20) | Fungible balances and allowances | Financial assets; do not confuse transfer approvals with account control. |
| [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155) | Multiple token types and batches | Potential editions or passes; not permission to spend the root treasury. |
| [ERC-6909](https://eips.ethereum.org/EIPS/eip-6909) | Minimal multi-token accounting | Useful internal claim accounting; distinct from NFT receiver semantics. |
| [ERC-3525](https://eips.ethereum.org/EIPS/eip-3525) | Values within token IDs and slots | Possible typed claims; units and transfer rights need explicit meaning. |
| [ERC-7631](https://eips.ethereum.org/EIPS/eip-7631) | Linked fungible and non-fungible pairs | Do not let ordinary coin trading unexpectedly move the social artifact. |

**Selection:** the root remains an NFT with an account. Additional quantities should use the simplest appropriate interface. Dual-nature token mechanics are not adopted merely because they look unusual.

### Possession, representation, and use

| Specification | Useful distinction | Decision |
|---|---|---|
| [ERC-6551](https://eips.ethereum.org/EIPS/eip-6551) | Token-bound account registry/proxy construction | The existing custom factory is not relabeled as conformant. |
| [ERC-7656](https://eips.ethereum.org/EIPS/eip-7656) | General token-linked service contracts | Candidate for separate instruments rather than an oversized root contract. |
| [ERC-998](https://eips.ethereum.org/EIPS/eip-998) | Composable ownership trees | Review cycles, root authority, and child transfer semantics. |
| [ERC-7401](https://eips.ethereum.org/EIPS/eip-7401) | Parent-governed nesting | Potential child instruments with explicit acceptance; not implemented here. |
| [ERC-5773](https://eips.ethereum.org/EIPS/eip-5773) | Several representations for one asset | Portrait, accessible view, live interface, and machine-readable description may differ. |
| [ERC-6220](https://eips.ethereum.org/EIPS/eip-6220) | Equippable composition | A visual part and an execution permission must remain separate. |
| [ERC-7160](https://eips.ethereum.org/EIPS/eip-7160) | Multiple metadata entries | Another representation approach; do not implement conflicting semantics blindly. |
| [ERC-4907](https://eips.ethereum.org/EIPS/eip-4907) | Expiring user distinct from owner | Temporary use without treasury control; existing market rejects active grants. |
| [ERC-5006](https://eips.ethereum.org/EIPS/eip-5006) | Use records for multi-token assets | Potential seats or access units, separately metered and revocable as specified. |

The marketplace implication is important: holding child assets in a token account is not automatically ERC-998 or ERC-7401 conformance. Similarly, shipping several HTML views is not automatically ERC-5773 conformance. These interfaces require their specified state and calls.

### Authorship, permissions, and updates

| Specification | Contribution | Consequence |
|---|---|---|
| [ERC-2981](https://eips.ethereum.org/EIPS/eip-2981) | Royalty information | A marketplace can honor it; it does not force every other venue to do so. |
| [ERC-4494](https://eips.ethereum.org/EIPS/eip-4494) | NFT permit approvals | Nonces, domains, and custody transitions matter. Deferred integration. |
| [ERC-4906](https://eips.ethereum.org/EIPS/eip-4906) | Metadata update signaling | Preserve the source correction to unindexed token-ID event parameters. |
| [ERC-5192](https://eips.ethereum.org/EIPS/eip-5192) | Minimal locked-token signal | Potential personal achievements, not a universal identity or truth certificate. |
| [ERC-5484](https://eips.ethereum.org/EIPS/eip-5484) | Consensual nontransferable credentials | Consent and burn authority matter for reputation. |
| [ERC-4973](https://eips.ethereum.org/EIPS/eip-4973) | Account-bound association | A person-bound credential must not be silently sold with an artifact. |
| [EIP-712](https://eips.ethereum.org/EIPS/eip-712) | Structured signing | A digest without a signature is only a commitment, as in this rehearsal. |
| [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) | Contract signature validation | Validity depends on current account policy, not just a signature's historical existence. |

**Selection:** preserve historical author and custodian-at-time separately. Buying the artifact changes its controller; it does not rewrite old speech or buy somebody's reputation.

### iNFTs and agents

“iNFT” is not one universal ABI or one level of intelligence. Three independent concerns are often merged: describing a model, transferring private data, and authorizing actions.

[ERC-7662](https://eips.ethereum.org/EIPS/eip-7662) addresses agent-related NFT metadata. [ERC-7007](https://eips.ethereum.org/EIPS/eip-7007) concerns verifiable AI-generated content. Neither means a useful autonomous service is operating simply because an NFT advertises it.

[ERC-7857](https://eips.ethereum.org/EIPS/eip-7857) provides private-data ownership/transfer concepts with prover and verifier roles. The standard does not itself supply all encrypted-data availability, model hosting, or sealed execution. It also does not inherit ERC-721 automatically. A private-memory transfer module would need actual cryptographic handover; this project's discarded Seal Memory text cannot be reconstructed into that module.

[ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) separates agent identity, feedback, and validation registries. Its transfer behavior clears the configured agent wallet, requiring new verification. That supports an important design principle: an NFT sale must not quietly leave the old runtime's spending credentials active. Registry entries and reputation signals are not guarantees that advertised capabilities work or that a model is trustworthy.

**Proposed steward, not implemented:** a runtime that may propose typed plans; a separately authorized module that constrains targets, assets, budget, duration, and selectors; verification appropriate to the task; explicit revocation on custody change. A successful language-model answer cannot extend a vault's permissions. A model service, a proof service, key availability, and compute funding are independent dependencies.

### Account infrastructure and vault interfaces

[ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) enables an account-abstraction path including sponsorship; [ERC-7579](https://eips.ethereum.org/EIPS/eip-7579) defines modular account interfaces; [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) permits EOA delegation. They can improve usability, but none makes an unbounded executor safe. Sponsorship also needs an actual budget and policy.

[ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) standardizes tokenized vault shares. [ERC-7540](https://eips.ethereum.org/EIPS/eip-7540) addresses asynchronous request flows. This project's TimeVault is a time-lock/vesting system, not a yield strategy merely because its name contains “vault.” Withdrawal timing, share valuation, and strategy risk must not be added invisibly.

### Executable resources and onchain delivery

[ERC-5169](https://eips.ethereum.org/EIPS/eip-5169) helps discover client scripts. [ERC-4804](https://eips.ethereum.org/EIPS/eip-4804) and [ERC-6860](https://eips.ethereum.org/EIPS/eip-6860) address web3 URL/call translation. [ERC-5219](https://eips.ethereum.org/EIPS/eip-5219) and [ERC-6944](https://eips.ethereum.org/EIPS/eip-6944) address contract-backed resource responses and resolution.

These solve retrieval interfaces, not every storage or execution problem. Application bytes can live in immutable contract data while the browser still renders them locally. A wallet/RPC/resolver remains a dependency. The local chunking tool preserves bytes; it does not turn the rehearsal's fictional balances into blockchain state.

### ONFTs and other chain families

[LayerZero ONFT](https://docs.layerzero.network/v2/developers/evm/onft/quickstart) is a protocol-specific cross-chain NFT approach. Its token movement is not automatic migration of everything an NFT account owns. Its [security stack](https://docs.layerzero.network/v2/concepts/modular-security/security-stack-dvns) makes message verification an explicit configuration problem.

[ICS-721](https://github.com/cosmos/ibc/blob/main/spec/app/ics-721-nft-transfer/README.md) is an IBC transfer specification with its own channel, trace, and escrow semantics. Neither protocol should be represented as a switch that creates globally consistent ownership without transport and replay checks.

| Ecosystem reference | Useful lesson, not an implemented adapter |
|---|---|
| [Metaplex Core](https://www.metaplex.com/docs/smart-contracts/core) | Asset plugins and authorities can remain modular. |
| [Bubblegum v2](https://www.metaplex.com/docs/smart-contracts/bubblegum-v2) | Compressed commitments require associated proof/data infrastructure. |
| [Sui Kiosk](https://docs.sui.io/onchain-finance/kiosk/) | Commerce can require policy satisfaction within a transaction. |
| [Aptos Digital Asset](https://aptos.dev/build/smart-contracts/digital-asset) | Object capabilities and mutation authority deserve separate analysis. |
| [Ordinals recursion](https://docs.ordinals.com/inscriptions/recursion.html) | Onchain resources can compose rich presentation without Bitcoin running this EVM application. |
| [Cardano CIP-68](https://cips.cardano.org/cip/CIP-0068) | Reference-token metadata patterns differ from EVM URI conventions. |
| [Tezos FA2](https://docs.tezos.com/architecture/tokens/FA2) | A common multi-asset interface does not erase chain-specific custody semantics. |

**Proposed first step:** one authoritative home and authenticated remote views with chain, block, age, and verification status. Authority migration later requires a defined lock/burn and destination-activation protocol. No bridge, global state synchronization, or transport verifier is implemented in v1.5.

## 4. Mechanism design: choose the game before decorating its controls

Mechanism design asks which rules produce desired outcomes under actual participant incentives and private information; see the [Nobel committee's explanation](https://www.nobelprize.org/prizes/economic-sciences/2007/9276-mechanism-design-theory/). A sophisticated formula can still optimize the wrong objective.

The comparison below focuses on the decisions this project actually faces. The status column is ours, not a judgment that a mechanism is universally good or bad.

| Mechanism / primary reference | Useful objective | Main question or attack | Decision |
|---|---|---|---|
| Fixed supply + batch/pro-rata sale; supplied GenesisLaunchpad | Simple allocations with a closing point | Hard cap can privilege early arrivals; rounding dust | Retained local/source path. |
| [Continuous clearing auction](https://developers.uniswap.org/docs/liquidity/liquidity-launchpad/concepts/cca) | Spread price discovery and supply through time | Budget/price limits, clearing, claims, adversarial timing | High-priority integration research, not implemented. |
| [CCA liquidity strategies](https://developers.uniswap.org/docs/liquidity/liquidity-launchpad/concepts/liquidity-strategies) | Transition from sale into a market | Seed ownership, residual tokens, allowed sweep destinations | Integrate only with explicit post-sale obligations. |
| [Weight-shifting LBP](https://docs.balancer.fi/concepts/explore-available-balancer-pools/liquidity-bootstrapping-pool/liquidity-bootstrapping-pool.html) | Time-varying relative token weight | Manager powers and changing price paths | Alternative template, not a universal fair-launch claim. |
| [GDA](https://www.paradigm.xyz/writing/gda) | Sell illiquid supply gradually | Price decay versus execution quality | Useful future editions mechanism. |
| [VRGDA](https://www.paradigm.xyz/writing/vrgda) | Match issuance to a target schedule | Demand assumptions, extreme price response | Suitable research for descendants, not root-treasury control. |
| [UniswapX](https://developers.uniswap.org/docs/liquidity/uniswapx/overview) | Competing execution of constrained orders | Filler competition, delays, authorization, expiry | Study outcome-based execution; no live adapter here. |
| [CoW batch auctions](https://cow.fi/learn/understanding-batch-auctions) | Joint execution and coincident demand | Solver behavior, liveness, user constraints | Separate execution option, not mislabeled as our AMM. |
| [TWAMM](https://www.paradigm.xyz/writing/twamm) | Spread a large order through time | Cancellation, price path and MEV | Do not promise a price or instant completion. |
| [v4 dynamic LP fees](https://developers.uniswap.org/docs/protocols/v4/concepts/dynamic-fees) | Predeclared fee behavior | Manipulable feedback or arbitrary fee setters | Retained simple time schedule; source uncompiled. |
| [Sablier cancellation design](https://docs.sablier.com/concepts/cancelability) | Distinguish revocable and irrevocable streams | Whose unvested funds are recallable? | New gift makes acceptance the irreversible boundary. |
| [Sablier transferability](https://docs.sablier.com/concepts/transferability) | Transfer a claim without changing its schedule | Buyer misunderstands beneficiary/control | Explicit person-account versus NFT-account destination. |
| [Quadratic funding](https://arxiv.org/abs/1809.06421) | Amplify breadth of support | Sybils, reciprocal donations, scarce match budgets | No deployment without identity/collusion design. |
| [QF empirical analysis](https://arxiv.org/abs/2010.01193) | Examine actual strategic behavior | Budget distortion and reciprocal support | Treat as a constraint, not a cosmetic anti-bot checkbox. |
| [Retro funding](https://github.com/ethereum-optimism/community-hub/blob/main/pages/citizens-house/how-retro-funding-works.mdx) | Reward observed contribution | Measuring causation, evaluator bias, gaming | Proposed bounded patronage pool. |
| [Conviction voting](https://blog.giveth.io/conviction-voting-34019bd17b10) | Weight sustained preferences | Capital concentration, path dependence, withdrawal rules | Research for a separate commons, not control of private wallets. |
| [Moloch membership/exit](https://docs.daohaus.club/contracts/membership) | Separate economic and voting rights | Exit timing, encumbered assets, conflicting claims | Useful governance principle, not implemented here. |
| [Dominant assurance contracts](https://gitcoin.co/mechanisms/dominant-assurance-contracts) | Reduce coordination failure in threshold funding | Refund bonus must be funded; success does not itself deliver real-world work | Possible commissioned instrument; no guaranteed “win-win” claim. |
| [Committed public-goods percentage](https://gitcoin.co/mechanisms/percent-for-public-goods) | Predictable contribution policy | Hidden taxes or mutable recipients | Future explicit opt-in, bounded beneficiary rule. |
| [Prediction-market AMM research](https://www.paradigm.xyz/writing/pm-amm) | Match market math to outcome assets | Resolution oracles, losses, dispute and liquidation | Research-only; no financial mechanism hidden behind an art action. |

I also surveyed Gitcoin's wider [mechanism directory](https://gitcoin.co/mechanisms) as a discovery source for curation, bounties, mutual aid, matching, and governance variants. That directory is not evidence that all of its entries are implemented or appropriate. The selected table uses protocol documentation, mechanism authors, or original research for the design claims that matter.

### A concrete calculation: fairness is not a label

For supply `S`, bids `b_i`, and total `B`, this release tests the simple allocation

`a_i = floor(S * b_i / B)`, with `dust = S - sum(a_i)`.

The dust is explicit rather than awarded to the first claimant. For positive integer bids the dust is nonnegative and less than the number of bids. Splitting one bid does not increase that bidder's aggregate floored allocation, because `floor(x)+floor(y) <= floor(x+y)`. The included tests cover 5,000 deterministic randomized vectors and 398 split-bid cases. These are narrow arithmetic results, not a proof of auction fairness, resistance to manipulation, or participant uniqueness.

Contrast idealized quadratic funding: a single contribution of 100 has squared-root sum squared of 100; one hundred contributions of 1 yield 10,000 before budget normalization. That is intentional amplification of broad support **only when the identities represent the intended independent participants**. Creating more wallets is not evidence of more people. The implication for World is to avoid converting raw transaction counts or addresses into moral authority.

## 5. “Deeper” mathematics: composition, invariants, and what survives change

There is no established mathematical level that automatically produces transcendent beauty. There are, however, tools more useful than piling up visually exotic equations.

### A. Compositional reasoning

[Compositional Game Theory](https://arxiv.org/abs/1603.04641) studies how interacting games can be built from parts. Its lesson for this design is methodological: separately sensible modules can create unexpected incentives when combined. A market, a gift, and a reputation system could create wash-trading rewards if every self-generated action earns status.

**Our application:** define the interface of each operation as preconditions, effects, authority, and possible exits. This is not an implementation of the paper's categorical machinery. It is a disciplined use of its compositional perspective.

A typed path looks like:

`Spendable(asset A) -> Swap(minimum B) -> OfferedGift(B, recipient, dates)`

`OfferedGift + RecipientConsent -> FixedClaim`

`FixedClaim + TimeReached -> BeneficiaryBalance`

The state transition from offer to accepted claim deliberately removes a power: donor recall. The user sees that loss before acceptance. Adding capabilities does not always mean increasing everyone's authority.

### B. Safety and liveness are different

Lamport's [TLA+ materials](https://lamport.azurewebsites.net/tla/tutorial/session9.html) distinguish invariants about what must never happen from progress properties about what can eventually happen.

For this gift, proposed invariants include conservation of tracked assets, no early release, no donor recall after acceptance, no redirection by a third-party trigger, and no duplicate release. A liveness route is equally important: an unanswered offer must have a return path. Time reaching a date does not cause an EVM contract to spontaneously execute; a valid transaction still triggers the release.

The JavaScript suite exercises these local properties. It is not a TLA+ proof, a Solidity proof, or a proof about arbitrary malicious tokens. A future formal model should include stalled execution, censored transactions, callback failure, and changing account controllers.

### C. Partial order rather than a noisy activity stream

The receipt explorer treats events as a directed acyclic dependency graph. A swap precedes the offer it funds; acceptance references that offer; a release cannot precede acceptance. A message references a particular receipt rather than merely repeating a symbol.

**Implemented locally:** causal gift links, launch/settlement dependencies, lock links, and receipt discussions. The graph describes known local causality. It does not reconstruct arbitrary events across every exchange or infer private intentions. A topological relationship is not a claim that the people involved agree about its meaning.

### D. Projection versus execution

A schedule can be evaluated at a chosen time `t` without mutating its authoritative state. For a cliff lock, available principal is zero before the cliff and the unreleased amount after it. For a linear schedule, the vested amount is proportional to elapsed time within the specified interval, subject to its cliff and prior releases.

**Implemented locally:** the future lens computes scheduled claimability, with no price model, no promised yield, and no clock change. Tests assert that its checksum does not change and that an actual early release still fails.

### E. Optics is not a reason to replace a successful body

[Physically Based Rendering's transmittance treatment](https://pbr-book.org/4ed/Volume_Scattering/Transmittance) and [equation of transfer](https://www.pbr-book.org/4ed/Light_Transport_II_Volume_Rendering/The_Equation_of_Transfer) are useful references for light moving through participating media. Domain warping and coordinate transformations are legitimate sources of procedural variety. They are not proof that an image carries spiritual significance.

The existing field already uses repeated folds, bounded volumetric integration, and state-dependent spectra. This release keeps those exact assets. The deeper lesson here is restraint: investigate alternative fields separately, preserve a known reference, compare at the same scale and state, and let the user's judgment determine whether the appearance improved. More dimensions, more particles, or more bloom do not establish better taste.

## 6. The implemented synthesis: instruments, not a replacement world

### Outcome-bound reviews

Trade, Lock, and Give create explicit plans containing their input/output types, quantities, minimum output, schedule, recipient type, and the original organism's full audit anchor. The context also binds the selected local artifact, current controller, authority epoch, nonce, relevant balances and pools, and gift rights.

The engine simulates a copy before showing the review. Confirmation checks the plan digest, context, expiry, and projected result, then applies the operation atomically to the local model. Invalid paths roll back balances, pools, gifts, and receipts together. An unrelated chat entry is not automatically a changed market; a changed pool or controller is.

**Scope:** a small typed execution specification, not an autonomous natural-language planner or universal transaction compiler. The digest is unsigned. Local consistency does not authenticate the owner or prove blockchain execution.

### A consent-based future gift

The recipient may be a personal wallet or an NFT account. The distinction is visible because the rights differ. A personal-wallet claim does not become another artifact's asset just because its owner trades an NFT. An account-held claim follows control of that account without changing the release date.

The local sequence is `swap, if needed -> offer -> recipient acceptance -> fixed-date release`. Before acceptance, the donor may recall. After the acceptance window expires, anyone may trigger return to the donor account. After acceptance, there is no early release or recall. No chat membership, follow, endorsement, or public credential is attached automatically.

The **new Solidity source** `ConsentGiftRouter.sol` implements the analogous boundaries around a configured market and TimeVault: exact funding, current nonce, input constraints, actual output-balance measurement, temporary exact allowances, acceptance by the named recipient, and fixed-beneficiary deposit. It is uncompiled and untested in an EVM. The local model stores accepted gifts in its own records; the contract would create a TimeVault claim and record its lock ID. These are not identical storage layouts.

### A marketplace that discloses what is—and is not—being sold

The inherited exchange source checks declared inventory and schedule commitments, escrows the root NFT, invalidates old sessions through the existing transfer path, and checks content both before and after the recipient callback. This attempts to address a real token-account sale problem: the contents may change between advertisement and settlement.

This release puts that model into the original organism's instrument panel, with review, purchase, listing, cancellation, and scheduled future inspection. Personal messages keep their original authors. A listing does not gain an early-release exception.

**Important limitation discovered at the integration boundary:** the existing exchange manifest does not cover the new pending gift module. The UI therefore refuses new local listings with active donor/recipient gift rights until they are resolved. That UI restriction is not an onchain security invariant. A contract-level gift-aware manifest or explicit exclusion/inclusion policy remains necessary before integrating this module into a live exchange.

### Social activity that can be inspected, not merely believed

World distinguishes typed protocol activity from prose. Rooms require accepted invitations when configured that way. View filters are personal; they do not ban other people from World. Removing a member prevents future authorized posting but does not erase previous speech. The original speaker and custody epoch remain recorded after ownership changes.

[The Lens protocol](https://lens.xyz/docs/protocol) provides a useful example of separating accounts, graphs, groups, feeds, and rules. [Farcaster's architecture](https://docs.farcaster.xyz/learn/architecture/overview) and [XMTP's glossary](https://docs.xmtp.org/fund-agents-apps/glossary) also show why decentralized social infrastructure must not automatically be described as every message byte stored in an EVM contract.

The inherited WorldLedger source stores public message bytes. Its local interface posts instantly because it is a simulation. Full public-chain storage has transaction, availability, and cost implications. Private-room cryptography would require a real implementation such as an appropriate [MLS/RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html) stack, key management, and membership epochs. Removing somebody cannot erase plaintext they already obtained. No encrypted rooms are implemented here.

## 7. The v4 launch path: useful hooks have narrow responsibilities

Uniswap v4 [hooks](https://developers.uniswap.org/docs/protocols/v4/concepts/hooks) are pool-operation callbacks with permissions encoded in the hook address. The hook address of an existing pool cannot simply be replaced. A new policy that changes the hook generally requires another pool and an explicit migration decision. One hook can serve many pools; configuration must remain pool-specific.

The retained experimental source uses the reviewed v4-core ABI boundary at commit `d153b048868a60c2403a3ef5b2301bb247884d46`. `PhoenixLaunchHook` is a historical filename, **not a visual direction**. It could be renamed only with the corresponding deployment/mining implications understood.

Its intended policy remains deliberately narrow: committed initialization, no negative seed-position liquidity change by the seed adapter, a fixed LP-fee ramp of 1.00% to 0.30% over 24 hours, and pool observations that do not treat user-supplied hook data as a trusted person's identity. There is no external chat call in the hook. Social moderation should not make a swap fail.

The zero-liquidity fee-collection case is preserved: the official callback dispatch routes a zero delta through removal handling, so a blanket removal ban would incorrectly disable fee harvesting. The guard rejects negative principal changes for the seed adapter while allowing its zero-delta fee operation. That is source-reviewed logic, not an executed PoolManager result.

The retained adapter uses real PoolManager call shapes, including unlock, liquidity modification, swap, synchronization, settlement, and taking credits. The [unlock/delta documentation](https://developers.uniswap.org/docs/protocols/v4/guides/unlock-callback-and-deltas) is especially important: unsettled deltas make the operation revert. A UI estimate is not that accounting.

Seed fees, if any, are intended for the recorded creator account. There is no guarantee that trading or fee revenue occurs. Locked seed principal and rounding dust also create a real opportunity cost and must be disclosed.

**Not implemented in the browser:** actual v4 tick quotes, wallet execution for these instruments, CCA integration, route competition, MEV guarantees, or a production deployment. A time-varying LP fee alone does not create a fair auction. CCA's allocation, liquidity-strategy, recipient, and sweep rules require their own integrated tests.

## 8. Further original synthesis, explicitly proposed rather than shipped

### A fulfillment record, not a social credit score

A future optional credential could say: a particular offered gift was accepted, its fixed claim became available, and its release transaction was observed. The receiver chooses whether to associate it with their profile. It must not say that the donor is universally trustworthy, that the recipient is a unique human, or that self-gifting deserves funding.

Its useful composition is narrow: a patronage pool might inspect relevant completed commitments alongside independent contribution evidence. The pool defines the evidence and dispute process. Raw activity volume never becomes automatic authority. No such credential or patronage pool is deployed in this release.

### A living manifest with separate slices

A future marketplace manifest should distinguish spendable assets, fixed-time claims, revocable claims, externally dependent rights, use grants, installed executors, immutable code commitments, and personal records excluded from sale. The user should be able to compare what changes with custody and what does not.

This is more interesting than claiming to trade “the whole NFT” while ignoring its obligations. It also needs bounded verification: enumerating every possible external approval or liability is not generally supplied by a token standard. The manifest must disclose what it checked and what it did not.

### Small commons with explicit resources

The launch's conversation could host a voluntary, separately funded project commons. A bounded committed fee share, direct grants, simple matching, or retroactive reward process may fit different communities. If participant uniqueness cannot be established credibly, a simple capped match or reviewed grant can be more honest than quadratic funding with a cosmetic Sybil badge.

The root artifact should not have to become a universal government. Treasury authority, room moderation, voting delegation, membership, and economic rights can be separate modules. Dissolving a project or leaving a room should not require abandoning unrelated assets.

### Agents as interpreters of constrained opportunities

A steward could inspect a claim schedule, propose an affordable gift, explain a marketplace manifest, or find the receipt behind a conversation. Its proposed plan is checked independently. Permission to explain is not permission to transfer. Private-memory keys need a separately verified handover on sale; the original salted trace is not that handover.

### Remote views with visible age

A remote portal should say which home-chain state it observed, the relevant finality policy, and how old the observation is. Unknown verification must look unknown. An omnichain badge should not conceal a second active spending authority.

These proposals form a coherent direction, but none is represented as a completed feature hidden behind a launch switch.

## 9. Feature readiness and permission are different dimensions

The capability catalog separates `LOCAL_AND_UNCOMPILED_SOURCE` from `RESEARCH_NOT_IMPLEMENTED`. It is deliberately not a list of green “ready” modules. A future activation model should bind chain/deployment, code identity, audited configuration, permissions, economic limits, dependencies, and the applicable product policy.

Geography is not reliably established by a wallet address, a language, or an IP alone. A hidden button cannot enforce a contract rule. Conversely, a future feature can remain architecturally available without being activated everywhere. This report does not determine legality in any jurisdiction or provide an evasion mechanism.

Any real permission gate belongs at the relevant trust boundary. Disabling a strategy must not casually remove an already promised withdrawal route. An administrator's feature switch cannot be allowed to turn an accepted, fixed-beneficiary gift back into donor property.

## 10. Release evidence and what remains

The reproducible paths are `npm run validate:ui`, `npm run test:browser`, `npm run compile`, and the v1.5 preservation report. See `VALIDATION.md` for actual results and limitations. Current compilation stops before Solidity execution because `solc` is missing and dependency retrieval is unavailable in this runtime.

The real next engineering gate is not another visual reinvention. It is a successful pinned compiler run, ABI/type and bytecode-size inspection, tests against the pinned real PoolManager, malicious receiver/token scenarios, gift acceptance/return/vault integration, transfer/approval regression, wallet-driven testnet execution, and an independent review before real custody. The repo's historical tests and source comments are not substitutes for that gate.

What this iteration contributes is a constrained, tested interaction model and an additive contract module—not a production financial system. The visual body remains the user's approved artifact. The new direction makes discovery happen through useful relationships among actions, rights, and people rather than through a literal illustration of an experience nobody else can claim to have seen.
