# Dave source coverage and integration findings

Reviewed 2026-09-06. Scope: the supplied Dave v1.8 attachment, the supplied DAVE V2 architecture document, and the relevant I Don't Fucking Believe It v1.7 contract APIs. This is a source and compatibility review, not an independent security audit or certification. No exploit code was written or executed, no deployment occurred, and no Site files were changed.

## Provenance and actual coverage

- Original donor: `upload/dave-held-v1.8(1).zip`, extracted into `sources/dave`.
- Design supplement: `upload/DAVE-V2-ARCHITECTURE (1).md` (395 lines), read in full. It is a proposal with findings and standards choices, not a supplied V2 implementation.
- Base: `sources/base/i-dont-fucking-believe-it/contracts`.
- Read all 32 Dave Solidity source files, all 20 test files, README, deployment script, Foundry configuration, remappings, and the complete trading-floor HTML.
- The initial extraction omitted `src/lib`; the original ZIP does contain all nine internal library/mock files. Those exact bytes were restored from the archive before review. The earlier suspicion of an incomplete attachment was incorrect.
- No live deployment addresses or chain availability were established. The document's Robinhood-chain and draft-standard assertions are source claims, not newly verified external facts.

## Compile status observed

An isolated compilation used Solidity 0.8.24, Solady 0.1.26, and ERC721A 4.3.0. The donor does not pin library commits; these were explicit probe versions.

1. Unchanged source fails: `Charter.sol:283` emits `RagequitToll(id, tb + tq)`, while its declaration requires `(poolId, taxBase, taxQuote)`.
2. With only that event call corrected **in compiler memory**, compilation using the supplied `via_ir = false` configuration fails with stack-too-deep in `BagRenderer.sol:115`.
3. The same in-memory event correction with optimizer and `viaIR = true` compiles all 32 source files. No generated runtime was above the probe's 24,000-byte threshold. This does not establish deployability on any particular chain or passing tests.
4. The Foundry test suite was read but not run. The README correctly reports that its original author had not compiled it.

The probe is `research/compile-dave.cjs`; final compiler output is `research/dave-compile.json`. Neither changes donor source. The two code changes above remain unapplied to donor files.

## Complete source coverage map

| Source | Mechanics understood | Useful contribution / integration decision |
|---|---|---|
| `DaveHeld.sol` | ERC721A hub; four genesis tranches, atomic deposit/seal mint, paid open mint, rank Merkle root, singleton Chambers/Codex, hooks, renderer and royalty pointers | Transferable economic identity and provenance. Retain the base collection; this is a competing hub, not a drop-in module. |
| `DaveVault.sol` | ERC-6551 footer identity; owner authority; four ratcheting seals; time-weighted conviction; expiry temper; early-exit tax; bag list; mandate, Chambers and CREATE2 lanes | Optional commitment history and visible time boundaries are valuable. Do not replace the base account or impose a global seal on every asset. |
| `ConvictionPool.sol` | ETH accumulator per active seal multiplier; buffered receipts when no weight; vault-directed claims; administrative ERC-20 sweep | Shared reward accounting idea; distribution assets and recipients must follow the user's configurable policy. |
| `Patronage.sol` | Sponsor-funded streaming campaign; token balance × tier snapshot; seal must cover campaign duration; forfeiture redistribution; unused-residue refund | Creator sponsorship and campaigns with clear committed funding and lifecycle. |
| `Bourse.sol` | NFT shelves with buy, sell or dual inventory; flat/linear/exponential curves; fees, royalties, bonds, vault-directed exits | NFT market-making as an NFT-owned business. Base `BondedShelf` covers only fixed-price shelves; full curves are an additional implementation. |
| `Charter.sol` | Owner-liquidity constant-product markets; optional allowlist; seal discount; reserve bonds; eight-observation TWAP ring | Market policies and pooled liquidity. This is not Uniswap v4. Use the base v4 integration where v4 behavior is required. |
| `Wake.sol` | Harberger-priced exclusive keeper seat; prepaid ETH rent; up-to-eight-block trade window; takeover, vacancy and lapse | An optional experimental venue policy, not a general sandwich-prevention guarantee. |
| `House.sol` | Oracle/TWAP-marked perpetual positions; entry spread; leverage/OI limits; funding index; close/liquidation; backing accounting | Concept donor for a future derivatives desk. The base has no equivalent fully implemented perpetual engine. |
| `Registry.sol` | NFT lots priced at oracle NAV ± dealer spread; optional allowlist; bonded inventory/quote; royalties | A specialized dealer interface, contingent on explicit feed and asset semantics. |
| `Chambers.sol` | Seven-day owner module adoption; immediate revoke/purge; tracked-balance bounds; selector firewall; unrestricted unsealed module execution | Separate content adoption from spending authority. Base adoption plus exact grants is stronger than copying this module. |
| `Codex.sol` | Public immutable SSTORE2 leaves; ordered editions; account-origin CREATE2; bounded strategy interpreter with TWAP/time/state/send/seal/once opcodes | Immutable authored content, composable strategies and provenance. Base `EditionRegistry` already imports the durable-content concept. Execution must remain separately authorized. |
| `Wager.sol` | Binary fixed-odds tickets; funded worst-side liability; named resolver; timeout void; claims and 90-day escheat | Resolvable event markets with transparent terms. No base equivalent was identified. |
| `Counter.sol` | Owner tills; atomic flash lending; whole-root-NFT pawn offers, acceptance, repayment and seizure; till bonds | Fixed-term credit maps to base `FixedTermCredit`; whole-root collateral and flash lending are separate additions. |
| `Granary.sol` | Curated ERC-4626 adapters; caller-funded sow/reap; recipient pinned to selected vault | Base `ReceiverPinnedStrategy` improves this with exact receipts, minimum outputs, deadlines and allowance resets. |
| `Scrivener.sol` | Fully covered calls and puts; quoted premium; physical American exercise; expiry recovery; bonded terms | Base `CoveredCallBook` supplies a smaller negotiated call lifecycle. A PUT book and fractional series remain additional scope. |
| `Indenture.sol` | Fully funded zero-coupon notes; maturity copied once from seal; subscriptions to vault; transferable internal notes; escheat | Explicit, fixed maturity and separated committed/free backing. Base `TimeVault` is not itself a note issuer. |
| `Strips.sol` | ERC-20 PT/YT; high-water yield index; transfer checkpoints; strip/recombine; maturity settlement and loss haircuts | Base `MatchedRightsVault` gives proportional actual-share recombination, not independently tradable PT/YT. Do not label it as full STRIPS. |
| `Surety.sol` | Fixed adjudicator; term-bound stake; evidence-linked slashes; unslashable attestation option; premiums and credentials | Optional underwriting/attestation module with per-asset exposure reporting. No base equivalent was identified. |
| `Issue.sol` | Immutable multi-token basket recipe; transferable shares; issue/redeem fees paid in shares; creations haltable, redemption not administratively gated | Base `FixedBasket` corrects key rounding/custody choices but supports exactly two assets and zero fees. An N-asset configurable issuer requires additional work. |
| `BagRenderer.sol` | Chain-derived certificate SVG, six visible bags, ranked serial, conviction attributes, HTML kernel loader | Real state should influence the living object's form. The existing loader is broken; do not reuse it unchanged. |
| `SiteKernel.sol` | Timelock-replaced runtime stored in SSTORE2 leaves; concatenated read | Base `OnchainApp` has bounded immutable chunks, SHA-256 verification and individual reads. Prefer that archive architecture. |
| `IconRegistry.sol` | Paid token glyph/hue assignment and admin seeding | Token icon registry concept; glyphs must be safely escaped and identity/provenance should be clear. |
| `vendor/ERC6551Registry.sol` | Reference CREATE2 account registry with token footer | Useful reference implementation; changing account implementation changes derived account addresses. |
| `lib/AccountFooter.sol` | Fixed-offset decoding of ERC-6551 salt, chain, collection, token | Only compatible with the exact footer-bearing proxy layout. Base accounts use immutable constructor identity. |
| `lib/Curves.sol` | Explicit up/down price recurrences for flat, linear and exponential NFT curves | Reusable math after integration-specific rounding and boundary tests. |
| `lib/Interfaces.sol` | Hub, vault views, minimal ERC-20, renderer and hook interfaces | Reveals the hard ABI coupling to Dave's hub and seal model. |
| `lib/Tiers.sol` | 30/180/365/1460 days and 1/3/8/40 multipliers | Donor defaults; optional commitment products, not universal master-NFT restrictions. |
| `lib/Timelock.sol` | Single-admin seven-day queue/execute/cancel | Governance pattern; operational ownership and all queued parameters must be reviewable. |
| `lib/Oracles.sol` | Minimal feed/allowlist interfaces plus mocks | Test adapters only; not production feed integrations. |
| `lib/MockERC20.sol`, `lib/MockERC721.sol`, `lib/MockERC4626.sol` | Open mint, settable royalty and proportional test silo | Test-only fixtures; not production token/strategy implementations. |

## Test and presentation coverage

All test logic was read, including helpers and assertions:

| Files | Coverage represented |
|---|---|
| `Base.t.sol`, `Genesis.t.sol`, `Vault.t.sol`, `Pool.t.sol`, `Patronage.t.sol`, `Invariants.t.sol` | Shared deployment, genesis gates, Merkle/rank flows, seal/exit arithmetic, reward shares, campaign accounting, stateful seal handler |
| `Bourse.t.sol`, `Charter.t.sol`, `Wake.t.sol`, `House.t.sol`, `Registry.t.sol` | Market sides/fees/royalties/bonds, swap math, timing/keeper seats, perps/feed/funding, dealer/allowlist behavior |
| `Chambers.t.sol`, `Codex.t.sol` | Adoption delay/revocation, balances/firewall, transferred modules, leaves/editions/forge, strategy opcodes and ONCE |
| `Wager.t.sol`, `Counter.t.sol`, `Granary.t.sol`, `Scrivener.t.sol` | Funding and settlement lifecycles, credit, flash callbacks, pinned strategies, covered options |
| `Indenture.t.sol`, `Strips.t.sol`, `SuretyIssue.t.sol` | Fixed note maturity, yield ownership/checkpointing, impairment, slashing, share creation/redemption |

These tests are evidence of intended behavior, not evidence that it passes. Several assertions/fixtures need correction: House/Registry feed timestamps precede an additional seven-day setup warp; the House funding view does not accrue pending funding as its test expects; a Patronage test expects an unlocked-vault error after the campaign has already expired; Counter/Indenture ragequit expectations omit tax on proceeds already returned to the vault; Wake tests treat a vacant seat's initial value as including a purchase price when the implementation assigns all of it to escrow. The monotonicity invariant compares the current unlock time to the maximum already observed, which is not a meaningful proof that it never decreases.

`site/floor.html` is a mock ledger with 16 tabs, static balances, a seal dial, textual contract wiring hints and an animated event tape. Tab switching works; the financial action buttons have no handlers. It has no wallet, RPC, transaction preparation, ownership enforcement or genuine market data. Its useful design contribution is coherent financial information hierarchy and readable named venues, not functional integration.

`script/Deploy.s.sol` deploys and wires the core singletons, then prints deferred timelock actions for hooks, venues, silos, kernel, icons, genesis and rank. It does not finish those actions or upload the website. README describes the full conceptual economy, but its original opening scope is stale relative to the many modules subsequently added.

## Concrete compatibility and correctness findings

The main defects identified by reading the code are retained here as integration constraints, without exploit implementation:

- **Account transfer authority:** Dave's docked modules and mandate survive token transfer. This conflicts with the Counter claim that a pawned Dave is inert. Preserve base `invalidateSessionsOnTransfer()` and epoch-bound grants; a new owner may adopt content again, but former spending authority must expire.
- **Global seal limitations:** bag admission is permissionless and capped at 32 with no removal; a hostile/broken bag can block balance enumeration or ragequit. Existing allowances created before sealing also remain externally usable. Per-asset escrowed locks are a better fit for the base than claiming arbitrary account inventory cannot leave.
- **Token behavior:** most Dave venues account for requested ERC-20 amounts without verifying exact receipt. Several use strict Boolean-return transfers, and some low-level approvals ignore returned `false`. Base `ProtocolAssets` exact transfer and allowance-reset helpers should remain the common implementation.
- **Basket rounding:** Issue floors each creation's component requirement while minting fractional shares. Aggregation can violate backing requirements. Base `FixedBasket` correctly uses ceiling deposits and floor redemption entitlements with explicit reserves.
- **Yield loss allocation:** Strips recombination before maturity uses nominal assets converted at current rate and clamps to remaining shares, creating order-dependent loss allocation. Base `MatchedRightsVault` distributes actual shares proportionally.
- **Yield routing:** Granary has no minimum-share/minimum-asset or deadline parameters. It also gates both entry and redemption on current blessing. Base strategy adapters separate entry readiness from exit and enforce minimum receipts.
- **Reward expiry:** ConvictionPool keeps weight until an explicit vault settlement; expired seals can remain in the active accumulator. A production reward design must checkpoint expiry consistently and handle all supported reward assets.
- **Perpetual claims:** House's payout clamp prevents transfers beyond current backing but does not guarantee all advertised gains can be paid. Its read-only equity does not include pending funding; feed normalization and fallback-pair semantics need explicit contracts. Do not describe its four fences as a solvency proof.
- **Keeper seat lifecycle:** Wake pays the incumbent synchronously on takeover; its top-up path can cross into lapse without establishing a new keeper. Terms can also change while a keeper exists. These are reasons to retain it as an experiment until redesigned.
- **Kernel boot failure:** `runtime()` hashes to selector `0x54d75aa6` (verified with ethers), but BagRenderer sends `0x9a3b6c14`. The fallback image depends on a query parameter absent from the generated animation URL. The runtime expects JavaScript, whereas the supplied floor is a complete HTML document.
- **Presentation accuracy:** renderer quantities assume 18 decimals; Surety credentials sum raw stake across potentially unrelated assets; Registry quote helpers omit royalties. The master interface should display actual units, per-asset exposures and all payment components.

## DAVE V2 architecture: adopt principles, verify claims

The supplement correctly identifies the immutable account migration constraint, bag-list denial of service, fragile ragequit transfers, missing ERC-1155 batch receipt, missing ERC-1271 and weak runtime delivery. Its strongest transferable ideas are per-file integrity commitments, parallel chunk reads, transport fallback, immutable authored site editions, capability-aware signatures, and live trait getters.

No V2 contract code accompanies the document. Draft interface IDs, ERC-7066/5192/4494/7496 compatibility, ERC-5219 request handling, ERC-5018 file interfaces and ERC-4804/6860 routing therefore remain unimplemented/unverified here. Adding `executeBatch` alone is not an implementation of wallet RPC EIP-5792. ERC-2309 usage outside the proper mint context should not be adopted from prose. A wallet-injected provider can still use remote RPC; it is not inherently free of third parties. Integrity checks need an authenticated root commitment: retrieving both data and the expected hash from one untrusted endpoint does not itself authenticate either. Compression requires browser capability detection and a fallback.

## Safe confluence with the selected base

| User-facing capability | Base API to retain/use | Dave extension boundary |
|---|---|---|
| NFT identity and account | `IDontFuckingBelieveIt`, `accountOf`, `SovereignAccount.currentOwner` | Dave expects `vaultOf`/`bearer` and footer identity; direct ABI substitution is incorrect. |
| Owner actions and agents | `executeUtility`, `adoptInstrument`, `grantInstrument`, `executeInstrument`, `revokeInstrument` | Exact allowances, exact calldata hashes, budgets, expiry, nonces and owner epochs remain authoritative. |
| Experimental multi-asset actions | `ExperimentCellFactory`, `ExperimentCell.adopt/execute/withdraw` | Separate funded cell; declared inputs/outputs, observed balances and epoch reset. Preserve this isolation. |
| Published programs and games | `EditionRegistry.inscribe/publish/edition/leaf` | Edition ownership/provenance does not grant asset authority. UI game execution needs a distinct sandbox/runtime and explicit action requests. |
| Native asset locks | `TimeVault.deposit/release/extend/lockInfo` | These are individual escrowed schedules; do not rename them Dave's whole-account seal. |
| Swap and memory | `JournalSwapRouter.swapAndInscribe`, `MemoryLedger.appendPersonal`, `InstrumentRouter.swapAndLock` | Use confirmed events to evolve the visual history; commitment-only entries do not reveal their contents. |
| Launch and v4 markets | `GenesisLaunchpad`, `V4GenesisMarket`, `PhoenixLaunchHook` | Charter is a different AMM. The base's existing fixed native/token pool and fee choices do not yet mean arbitrary configured v4 hooks. |
| Yield, baskets, matched rights | `ReceiverPinnedStrategy`, `FixedBasket`, `MatchedRightsVault` | More limited than all Dave desk descriptions, with better bounded accounting. Label actual functionality precisely. |
| Credit and calls | `FixedTermCredit`, `CoveredCallBook` | Fixed ERC-20 collateral and negotiated calls; no implied root-NFT pawn, perps, binary book or PUT series. |
| NFT shelves and estate sale | `BondedShelf`, `EstateExchange`, `CommitmentIndex` | The exchange commits to configured inventory/permissions/module state; it does not certify arbitrary external liabilities. |
| Creator commissions | `CommissionEscrow` | Clear funded work/accept/submit/review/refund lifecycle complements Patronage campaign ideas. |
| Onchain application bytes | `AppChunk`, `OnchainApp.readChunk/contentSha256` | Bounded immutable archive; browser execution remains offchain. |

The user's fee and asset sovereignty supersedes Dave's fixed 69/31 splits, 42 bps tolls, four seals, fee ceilings and compulsory venue roster. Those are donor product policies, not master-project requirements. Use explicit owner-configured terms; once an instrument has counterparties, preserve the terms they accepted.

For the living particle interface, map each economic action to a stable capability and vary its geometry, palette, orientation and transition through the NFT's deterministic identity seed. Let verified histories influence morphology while keeping every NFT's functions discoverable through consistent labels and keyboard-accessible controls. Time locks can form visible temporal shells; content editions can form nested worlds; executed strategies can leave traceable paths. These are interface mappings, not new claims about financial performance or higher-dimensional physics.

The immediate integration opportunity is to expose the base's already implemented instruments coherently through the central object. Preserve Dave's richer desks as explicit source-backed additions where no equivalent exists; do not count static mock panels or design prose as completed economic functionality.
