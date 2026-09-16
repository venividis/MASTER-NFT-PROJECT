# IDFBI 1.7 base audit and integration map

Reviewed 2026-09-06 from `sources/base/i-dont-fucking-believe-it` for the master NFT integration. This is an implementation review of the supplied source, not an independent security audit. Source findings below distinguish directly observable defects from risks whose exploitability depends on configuration or user-granted permissions.

## Findings that should shape the implementation

The strongest reusable foundation is the combination of immutable NFT identity, a deterministic account, account-executed actions with rolling audit roots, temporary exact token approvals, custody epochs, explicit module commitments, consent-based counterparties, and locally executable models. The existing optical field and memory reducer are useful visual inputs; they are not a chain-integrated rendering system yet.

The package truthfully identifies its latest Solidity as source written without completed compilation or EVM execution. `system-manifest.json`, `docs/v1.7/ONCHAIN-GATES.md` and `docs/v1.7/VALIDATION.md` are considerably more accurate about the current release than several older README/security descriptions. Its current `deploy` command deliberately refuses deployment. Existing immutable account code cannot be upgraded merely by combining source files into a new project.

The product should preserve the original central object while giving all minted identities the same capability vocabulary. Identity-derived layout, palette, spatial order, transitions and particle geometry can vary. Spending permissions, action names, accessibility, units, and discoverability should remain stable. Do not use the model's three fixed demo identities or three fixed colors as the uniqueness mechanism.

## Source map: every substantive contract layer

Paths below are relative to the reviewed base source.

| Source | Implemented behavior | Reuse / boundary |
|---|---|---|
| `contracts/src/core/IDontFuckingBelieveIt.sol` | Custom ERC-721; two-transaction commit/reveal; deterministic account creation; parent-account spawning; evolution linked to account roots; irreversible sovereignty; metadata and identity binding; leases; royalties; transfer epoch invalidation | Preserve owner-only mutable authority and separation from sale approvals. Fix unsafe nesting and binding metadata consistency. Royalty range is currently capped at 10%. |
| `core/SovereignAccount.sol` | Bound owner execution; target/selector sessions; exact-approval utility execution; delayed edition adoption; calldata-hash instrument grants; bound evolution; sovereign proof execution; ERC-1271; external NFT receivers | This is the main execution boundary. Owner is the current ERC-721 holder only. No delegatecall. Bound grants retire after every custody transfer. Sovereign verifier policy and delegated asset effects require stronger definition. |
| `core/SovereignAccountFactory.sol` | CREATE2 account deployment whose salt includes chain, collection, token ID | Custom factory, not canonical ERC-6551 registry construction. Preserve deterministic prediction; do not relabel standards compliance. |
| `core/ProofRouter.sol` | Admin-configured verifier IDs with runtime code hashes and permanent freeze | Good explicit dispatch; any registered ID is presently acceptable to every sovereign account. Code hashes do not pin proxy implementation storage. |
| `core/ThresholdAttestationVerifier.sol` | Sorted unique recovered signer addresses, threshold verification, freeze | Has a threshold >1 bootstrap defect. Signatures prove signer assent; no hardware attestation is implemented. |
| `core/ZkVmVerifierAdapters.sol` | SP1 adapter; RISC Zero adapter; M-of-N composite; public journal must equal exact 32-byte intent statement | ABI integration surfaces, not real guest/prover implementations. Gateway code hash pinning is useful but insufficient for mutable proxy gateways. |
| `core/OmnichainWitnessRegistry.sol` | One authorized adapter per domain; monotonically increasing nonce per identity/domain; remote root and message ID storage | No LayerZero/Hyperlane/IBC transport, light client, proof verification, sender binding or finality adapter exists here. EOAs may be configured as adapters. |
| `core/OnchainRenderer.sol` | Metadata JSON and animated SVG entirely from onchain snapshot; seeded color/radius/dash changes | Metadata renders rings and a star, not the browser optical field. `animation_url` is the same SVG as `image`. It does not call the memory ledger or load archived application bytes. |
| `protocol/ProtocolPrimitives.sol` | Reentrancy guard; account identity checks; native/ERC-20 exact transfer helpers; exact allowance reset | Worth reusing. Rejects taxed/rebasing transfer effects rather than silently accepting accounting drift. A malicious token can still lie about its balance API. |
| `protocol/GenesisToken.sol` | Fixed-supply 18-decimal ERC-20; no owner mint/tax/blacklist | Useful simple issued asset; does not address ERC-20s with arbitrary decimal units. |
| `protocol/GenesisLaunchpad.sol` | Time-boxed pro-rata sale; withdrawals before close; soft/hard cap; refunds; matched initial liquidity; founder vesting; treasury lock | Real bounded mechanism source, not CCA. Economics are preordained: founder <=20%, liquidity >=50%, minimum 30-day vesting. A customizable master launch mechanism must explicitly change these rules. |
| `protocol/NativeMarket.sol` | Constant-product market only for its launchpad's native/ERC-20 pairs; token-to-token via native; optional output lock | 0.30% fixed fee retained in reserves. No liquidity principal withdrawal. Useful local/EVM reference, not Uniswap v4. |
| `protocol/TimeVault.sol` | Exact funding; fixed-beneficiary cliff locks and linear vesting; permissionless scheduled release; cliff extension | Valuable custody-following claims: NFT account as beneficiary transfers economic rights with the NFT without changing release times. No early withdrawal. |
| `protocol/WorldLedger.sol` | Public message bytes, rooms, invitations, moderators, replies, reactions, local filters, profiles, protocol events and custody-at-time attribution | Actual onchain public storage source. Gated rooms gate writing, not reading. Accepted membership epoch checks are incomplete. Sealed roster limits module activity admission. |
| `protocol/OnchainApp.sol` | STOP-prefixed immutable code chunks, <=23,000 payload bytes each; up to 32 chunks; SHA-256 whole archive validation and read APIs | Actual archive contracts, but not deployed and not connected to renderer output. Onchain bytes are executed by a browser offchain. Maximum payload is about 736 KB. |
| `kingdom/V4Boundary.sol` | Local ABI definitions for PoolManager, pool keys, swap/liquidity params, signed delta decoding and permission flags | Explicitly names pinned upstream v4-core revision `d153b048868a60c2403a3ef5b2301bb247884d46`. Real PoolManager integration tests remain needed. |
| `kingdom/PhoenixLaunchHook.sol` | Committed init price; per-pool dynamic 1.00% to 0.30% daily ramp; seed principal lock; router-level economic observations | Four hook flags: beforeInitialize, beforeRemoveLiquidity, beforeSwap, afterSwap. Correctly does not pretend `sender` is end user. No customizable revenue allocation or hook tax. |
| `kingdom/V4GenesisMarket.sol` | Genuine v4 unlock/callback, modifyLiquidity, swap, sync/settle/take source; exact input must fully fill; full-range seed position; harvest to fixed creator | Preserve callback data hash/single-use guard and signed settlement checks. Supports only launchpad native/ERC-20 pools. No arbitrary assets/routes or live quoting API. No funded-asset fee distribution mechanism. |
| `kingdom/HookDeployer.sol` | Generic CREATE2 bytecode deployer | Required hook-address flag mining utility; no privileged deployment policy. |
| `kingdom/EstateExchange.sol` | NFT escrow, declared token floors, child ownership/approval checks, vault hash checks, known module snapshot, royalty covenant, pre/post inventory checks, cancellation, pull proceeds | Stronger than token-ID-only sale. Does not discover all external allowances/liabilities; child `isApprovedForAll` is not checked. Tests against real collection/operating modules are missing. |
| `instruments/ConsentGiftRouter.sol` | Direct asset or swap-to-escrow gift; exact reviewed recipient; recipient acceptance; fixed-date vault allocation; donor cancel before acceptance; expiry refund | Useful composable gift flow, tracks commitments for both counterparties. Temporary allowances reset. No forced community membership. |
| `operating/EditionRegistry.sol` | Immutable <=16 KB leaves; <=16 ordered leaves per edition; parent editions; custodian-at-time provenance; content commitments | Valuable publication primitive. Edition content is not execution permission. No child ERC-721 game standard or embedded game runtime is implemented. |
| `operating/InstrumentRouter.sol` | Finite swap-and-lock or direct-lock recipe with fixed funding caller beneficiary | Good narrow adapter for a typed module. Cannot execute arbitrary uploaded code. Must be wired to sealed ledger market and vault. |
| `operating/CommitmentIndex.sol` | Immutable <=16 module roster; module codehash checks; root and cell claim roots; mandatory cell inventory | Useful marketplace sale covenant universe. Availability depends on bounded static calls to every module. It is not universal liability discovery. |
| `operating/CommissionEscrow.sol` | Prefunded work; worker acceptance; fixed reviewer; deliverable hash; review deadline; rejection/timeout refund; pull claims | Useful work market. Contract digest is not proof of authored edition, unlike the stricter local model. Reviewer can reject; terms must make that explicit. |
| `operating/ExperimentCell.sol` | Separately funded root-associated compartment; codehash/epoch adapter adoption; per-asset input maxima/output minima; tracked asset effects; root custody/mode checks; withdraw to root | Good isolation pattern. Owner can still use generic root execution elsewhere. Factory accepts any contract exposing account APIs, not only canonical collection accounts. Global tracked-asset loop can be poisoned by a subsequently reverting token. |
| `operating/ExperimentGate.sol` | Guardian opens new entry only on chains 31337/84532/11155111; exits remain module-controlled | Actual readiness gate. Do not silently remove or bypass it while claiming production readiness. User-controlled protocol policy and deployment readiness are different concerns. |
| `operating/ExperimentalAdapters.sol: ReceiverPinnedStrategy` | Fixed ERC-4626 vault deposit/redeem; caller receiver; min shares/assets; codehash guard | Useful deterministic conversion pattern; external vault solvency/liquidity remain external. Mutable proxy code is not frozen by codehash alone. |
| `operating/ExperimentalAdapters.sol: FixedBasket` | Two ERC-20 basket with upward-rounded mint costs and downward-rounded redemptions; dust recipient; share transfers | Useful solvency-preserving issuance. Source uses two ERC-20s whereas local model uses ETH/AUR; source dust recipient differs from local model. |
| `operating/ExperimentalAdapters.sol: MatchedRightsVault` | Proportional shares/pairs into a single ERC-20 share asset; loss-sharing recombination; maturity cutoff for entry | Preserves proportional losses. Does not issue separately tradable principal and yield claims. Maturity does not prevent earlier matched recombination. |
| `operating/NegotiatedMarkets.sol: FixedTermCredit` | Fixed collateral and loan ERC-20 assets; collateral escrow; named lender; principal/repayment; term; repayment/default nonoverlap; pull claims | No oracle liquidation, root NFT pawn or dynamic credit assessment. Local model uses different asset representation. |
| `operating/NegotiatedMarkets.sol: CoveredCallBook` | Physical full-cover escrow; fixed strike/premium; buyer exercise before expiry; close/default pull claims | No naked exposure or oracle price. Exit paths remain open when new-risk gate is disabled. |
| `operating/BondedShelf.sol` | One child NFT fixed-price shelf; asset and sale proceeds bonded until date; reject root collection | Useful child asset market; not a two-sided venue or proof of child asset safety. |
| `memory/MemoryLedger.sol` | Full public bytes or supplied ciphertext; append-only heads; original-author reflection; account-routed pre-swap note; fill binding; form roots | Good source record primitive. No cryptographic encryption verification, key handoff, personal signature for account-triggered notes, or generic live event admission. |
| `memory/JournalSwapRouter.sol` | Atomic before-note -> exact-input swap -> output measurement -> caller-account payment -> fill binding | Exact nonce and head; only canonical account caller; custody check; no leftover input. Narrow route has no swap-and-lock vault output. |
| `lib/Administrated.sol` | Two-step owner handover | Simple admin primitive used for configurable/freezeable trust components. |
| `lib/Crypto.sol` | Low-s ECDSA; 65-byte v27/28 signatures; ERC-1271 smart-owner fallback | Does not implement compact signatures, account abstraction or passkeys; normal supported scope. |
| `lib/Base64.sol`, `lib/Strings.sol` | Encoding helpers | Supporting self-contained metadata machinery. |
| `interfaces/Interfaces.sol`, `operating/OperatingInterfaces.sol` | Explicit collection, account, verifier, renderer and module API boundaries | Reference these actual signatures for adapters. |
| `mocks/*`, `test/OperatingHarness.sol` | Targets, reentrancy probe, fake verifier gateways, test token/account | Testing aids only. Never deploy a mock gateway as a production evidence verifier. |

## Authorization and proof defects

### B1 — Sovereign verifier choice is not pinned to the NFT constitution (high, configuration-dependent)

`SovereignAccount.executeVerified` accepts any nonzero `intent.verifierId` that `ProofRouter.verify` accepts. It checks `intent.policyHash == constitutionHash`, but neither contract binds the chosen verifier to a permitted verifier set, and a threshold verifier simply signs a statement. If the global router contains a weaker/demonstration verifier beside a stronger composite verifier, a relayer can use the weaker ID for any sovereign account. The account's intention to require SP1 AND quorum is not enforced by its constitution hash.

Fix: explicitly pin one immutable verifier ID/code commitment, or a constitution-bound verifier policy root at promotion, and enforce it before dispatch. If changing the ABI, add a new promotion path and document version compatibility. Test two verifier IDs where the weaker accepts; account configured for the stronger must reject the weaker even when statement policy hash is correct. Require real working verifier configuration before irreversible promotion.

### B2 — Rust policy witness is unbound to authenticated policy and calldata (high, if used as real zkVM guest)

`proof-kernel/src/lib.rs::evaluate` compares `witness.constitution_hash` with `intent.policy_hash`, but both are supplied input hashes. It never hashes policy rule fields into that constitution commitment. `allowed_targets`, `forbidden_targets`, `allowed_selectors`, limits and current context are witness data. The witness's four-byte `selector` is checked against a witness-provided allowlist but not derived from bytes whose Keccak equals `intent.data_hash`. A guest that merely runs this evaluator would prove that a claimant supplied a permissive witness, not that the action obeyed the installed constitution.

Fix: define an exact versioned policy encoding; recompute its commitment in the guest; supply actual calldata and derive both hash and selector; bind authenticated chain/account configuration and state inputs; use full uint256 representation for uint256 ABI fields. Current Rust `value` and `nonce` parsing caps at u128 while Solidity uses uint256; chainId uses u64 and valid-time fields do not explicitly enforce uint48. Separate the rule proof from any optional model-inference provenance proof.

There is no SP1/RISC Zero guest target or proof-generation SDK dependency in `proof-kernel/Cargo.toml`; this is an ordinary Rust JSON evaluator. Its test references `proof-kernel/fixtures/statement.txt`, absent from the supplied tree. The current JSON `ProofJournal` is not the exact raw 32-byte journal expected by the Solidity adapters. A real guest wrapper must emit that statement only after evaluation succeeds.

### B3 — Optional HTTP attester signs unverified caller-supplied context (high, if key-enabled)

`agent/server.mjs` POST `/intent` calls `buildEvolutionPlan(input)` and signs when `ATTESTER_PRIVATE_KEY` and `input.verifier` exist. It does not fetch the account's canonical collection, verify owner/nonce/head, resolve the installed constitution, or constrain the supplied verifier to deployment configuration. `policy-engine.mjs` accepts `input.collection`, `policyHash` and state fields as facts. The returned guarantee that target is the canonical collection is therefore overstated.

The server binds localhost but permits CORS `*`, has no authentication or authorized-origin allowlist, and no rate limit. A key-enabled local service can become a browser-accessible signing oracle. It currently emits only evolution-shaped calldata, but caller-supplied target selection still means the attester is not enforcing its advertised deployment/policy restrictions.

Fix: keep planning unprivileged; place signing behind authenticated origin/token and deployment configuration; derive canonical contract/state inputs from pinned RPC at a single block; check complete policy and verifier trust path before signing; constrain target and selector from verified account config; return explicit proposal provenance. Never use an LLM's prose as authorization.

### B4 — Threshold >1 verifier cannot bootstrap (definite functional defect)

`ThresholdAttestationVerifier` constructor permits `threshold_=2` (or higher) with zero signers. `setSigner` increments the first signerCount to 1, then reverts because `threshold > signerCount && signerCount != 0`. Every first signer addition reverts; that configuration can never be initialized. Existing deployment helper initializes threshold 1, which hides the defect.

Fix: constructor accepts and validates a complete initial signer set, or use an explicit setup phase that can temporarily hold fewer signers than threshold while verify remains false and freeze enforces sufficiency. Test constructor threshold 2 with three distinct signers, duplicate/reordered signatures, removal effects, and permanent freeze. Also bound signerCount instead of unchecked uint16 growth.

### B5 — Unsafe same-collection transfers permit ownership cycles (definite lock risk)

`SovereignAccount.onERC721Received` refuses NFTs from its root collection, but only safe transfers invoke that callback. `IDontFuckingBelieveIt._transfer` blocks a token's own account, collection and factory, not another root account. Example: transfer token A unsafely into B's account; use B's account to transfer B unsafely into A's account. Both owners then become the other account with no external controller able to start an execution. Nested ERC-1271 owner recursion can also become unusable. This is why the code itself disclaims unsafe nesting.

Fix: enforce the nesting rule in the collection's transfer path, which applies to both safe and unsafe transfers. Maintain a canonical account registry/reverse identity map. For current implementation reject all root-collection account destinations; if proper nesting is required, implement bounded cycle detection and explicit authority semantics. External child NFTs can remain receivable without granting them code execution.

### B6 — Delegated grants measure one asset, not all effects (high integration risk)

`executeInstrument` enforces exact calldata/target codehash, grant caller, epoch, expiry, count and a net debit of one `g.asset`. Those are useful protections. It does not enforce that the adopted edition's recipe is the executed calldata, nor constrain approvals or transfers of other assets. An owner-approved instrument target can be an unrelated ERC-20 `approve` call while `g.asset` is native/another token, so the advertised one-asset budget does not describe subsequent allowance exposure. Net-debit budgets also differ from gross turnover limits.

This is not an unauthorized-owner-spend bug: the current owner selects the exact dataHash. It is a dangerous mismatch if the product portrays arbitrary edition installation as a general budget firewall. The same limitation applies to legacy selector sessions: `maxValuePerCall` is native value, not ERC-20 spend.

Fix: have standard grants target typed adapters with known recipient/asset semantics, or declare a complete multi-asset effect and approval policy. Keep arbitrary owner execution as an explicit advanced capability. Record/admit code and calldata independently; do not imply a content commitment is a safety proof. For grants, test approval creation, root transfer/ascension selectors, nondeclared asset spend, hostile refunds and preexisting allowances.

### B7 — Accepted room membership ignores custody epoch (definite model/source mismatch)

`WorldLedger.acceptInvitation` checks invitation epoch against the room admin's current epoch. `moderatorActive` also checks an epoch. But `post` and `react` allow `member[room][sender] && accepted[room][sender]` without checking invitation epoch. A member that accepted before the room's artifact is transferred keeps writing after transfer, despite local tests and narrative expecting invitations/membership to retire.

Fix: shared `_memberActive(room, who)` must check allowed + accepted + not banned + current relevant custody epoch; call it in post/react/moderator logic. Decide deliberately whether member accounts carry membership with their own transfer, and bind member epoch if personal consent must expire too. Add source EVM tests for both administrator-artifact transfer and member-artifact transfer.

### B8 — Identity metadata can disagree with its one-time binding (definite integrity issue)

`bindERC8004` writes `agent.registry`, `agent.id`, and `agent.bindingProofHash`, but `_isReservedKey` reserves only the unrelated `agent-binding` key. An authorized metadata writer can later overwrite the displayed three fields while immutable `Organism.agentRegistry/agentId/bindingProofHash` remain unchanged. The binding itself checks only nonzero registry and hash, not registry code or agent ownership proof. It is a declaration, not a verified cross-registry relationship.

Fix: derive these metadata getters from the stored binding or reserve the three actual keys; label the binding as claimed unless a specific registry verifier checks it. Separately, `metadata('core.memoryRoot')` returns collection storage while `renderSnapshot` uses account memoryRoot; arbitrary verified actions can change account memoryRoot without changing collection memoryRoot. Choose one canonical meaning and test consistency.

### B9 — Runtime codehash does not freeze upgradeable proxy behavior (trust assumption)

Proof routers, zk gateways, strategies, instrument targets, edition registries and commitment modules pin `address.codehash`. This detects replacement of runtime code but not an implementation/admin slot change behind unchanged proxy runtime. Their immutable behavior claims must either reject mutable proxies, bind a verified implementation policy, or explicitly include the external upgrade authority in trust assumptions.

### B10 — Receipt and archive integrity are not live authentication (boundary)

The browser models use deterministic hashes, fixed demo actors and replay checks. Someone who controls the archive can construct a new internally consistent history. The source documentation correctly says these are unsigned rehearsals. Never let local imported receipts mutate canonical minted identity state, balances, capabilities, or accepted onchain form.

## Actual model APIs and what they mean

| Model | Existing API / data | Integration instruction |
|---|---|---|
| `web/model.mjs` | `genesis`, `transition`, `checkAction`, `makeBundle`, `verifyBundle`, `phenotype`; ENTROPY/EVOLVE/SPAWN/SEAL_MEMORY/ASCEND; SHA-256 receipts, 192-receipt/24-child local caps | Preserve as an offline deterministic study. It has no shared state with the financial world except bridges in controllers. `phenotype` exposes 8 scalar influences; not unique interface generation. |
| `web/kingdom/model.mjs: KingdomModel` | Identities, balances, constant-product pools, launch sales, vault locks, estate listings, rooms, messages and events; integer raw units; fixed actors; transactional rollback | Useful financial/domain reference. Its seeded initial ETH/AUR allocations are fictional. Its trade math is not real v4 ticks. All `wei`/`format` amounts assume 18 decimals. |
| `web/instruments/engine.mjs: InstrumentEngine` | `normalize`, `prepare`, `execute`, `apply`; SWAP/LOCK/GIFT; cloned previews; audit anchor/context/digest/deadline; consent gifts; projections; causal trace; export/restore | Good UI-to-domain boundary. Reuse reviewed action plans, atomic rollback and caller-fixed recipients. Do not convert its JSON plan directly into a signed chain transaction without an explicit ABI adapter. |
| `web/operating/engine.mjs: OperatingEngine` | Immutable typed editions; adopt/grant/revoke/run; commissions; collectibles/shelves; allocated experiment cell; five finite experiments; loan/options; app manifests; module snapshots; estate refresh | Complete local state machines provide much more substance than a tab mockup. Callable methods are the integration surface; do not reimplement ad hoc balance changes in UI. |
| `web/memory/engine.mjs: MemoryEngine` | Extends OperatingEngine; `memoryHeader`, `appendMemory`, `executeNoted`, `form`, `export`, `restore`; original-author reflections; exact note/swap binding | Good journal semantics. Before-swap notes only enter via atomic execution. Import validates entry/event/fill linkage, not external authorship. |
| `web/memory/engine.mjs: memoryForm` | Six categories; 8 output traits; order-sensitive hash chain; bounded decay and saturation; optional note imprint; no prose interpretation | Reuse as the activity input to a new central morphing object. Current historical projection uses the current genome, not full historic genome snapshots. It starts at memory chapter boundary, so earlier activities are not reconstructed. |
| `web/memory/crypto.mjs` | Browser native AES-256-GCM, 600,000-round PBKDF2-SHA256, random 16-byte salt/12-byte IV, authenticated header, padded 1 KB blocks, canonical field limits | Actual recoverable encrypted local memory unlike old discarded Seal Memory. Encryption refuses if native WebCrypto missing. No keys in archive. Live chain envelope needs explicit chain/collection/account/nonce binding. |
| `web/evm.mjs: TestnetClient` | Injected EIP-1193 provider; known test chain restriction; same-block `renderSnapshot`; simulate/estimate/review/send; receipt success and block identity check; bound evolution; proof request/import; spawn; metadata seal; ascend | This is the only real network client. Core mint commit/reveal encoding lives in `web/app.js`. Economic/module/memory live adapters are absent. One included block is not finality; no persistent replacement/reorg event index. |
| `agent/policy-engine.mjs` | Stable JSON hash constitution; Solidity ABI-exact statement and evolution-root derivation; deterministic evolution plan | There is no AI model API/inference here. Natural-language `request` is hashed into evidence, not understood or executed by a model. |
| `agent/server.mjs` | HTTP health/agent-card/MCP-shaped JSON-RPC tools and /intent; optional local attester signature | Useful tool proposal boundary after B3 fix. No scheduler, wallet submission, model inference, tool-verification or real A2A task lifecycle. |
| `proof-kernel` | Rust JSON deterministic witness evaluator and statement hash | Requires B2 redesign and a real guest/prover wrapper to support cryptographic execution-policy claims. |

Additional client defects/gaps: `web/evm.mjs::address` rejects zero addresses and static ABI `address` encoding calls it, so native-token sentinel address cannot be encoded for future economic calls. Separate general ABI address encoding from nonzero destination validation. `prepare` hardcodes transaction value 0. Snapshot nonce is converted to JS safe integer. Account/collection connection only checks nonzero code, not a deployment manifest/code identity. Adapter work needs raw-unit decimal registries, chain manifests, expected code identity, amount-bearing transaction plans, receipts by configured emitting contract/event signature, replacement state, confirmations and reorg rollback.

## Mint uniqueness and experience design

Onchain mint seed hashes chainId, collection, caller, recipient, committed secret, delayed blockhash, reveal-block prevrandao and next token ID. Identity uniqueness is cryptographically strong under usual hash assumptions because token IDs differ, but unbiased randomness is not proved: user may wait among reveal blocks or abandon reveals, and validators influence reveal inclusion/entropy. It is fine to promise individualized deterministic minted objects; do not claim unbiasable rarity.

Descendant seed includes parent identity/genome/evolution, caller, salt and child token ID. There is no supply cap. Every mint creates a new full SovereignAccount rather than a minimal proxy, so mint gas and factory runtime size deserve measurement. Finite visual traits can collide even when identities do not. Use the complete 256-bit genesis identity to derive independent domains for object geometry, palette, typography accent, node graph, portal motion and world grammar; preserve a permanent identity fingerprint and shared function schema. Include renderer/interface version commitments so replay remains stable after renderer upgrades.

Old `OnchainRenderer` rings do not implement the desired live particle experience. `OnchainApp` archives are not returned by token metadata. `MemoryLedger.formRoot` is not consumed by collection renderSnapshot. Connecting these three is real remaining work, separate from visually improving the browser preview.

## Requirements that remain genuinely absent

- Arbitrary user-configured fee recipients, basis-point allocations, payout tokens and swap/vesting/gift routing for launch fee streams. Current fixed hook merely changes LP fee rate and harvest sends fee assets to creator.
- Generic asset swaps or aggregators; existing v4 routes support this launchpad's native pairs only.
- NFT-owned game/cartridge manifest, integrity checking, actual sandboxed game runtime, rights checks and bounded gameplay-to-protocol intent bridge. External ERC-721/1155 receipt alone is storage, not game loading.
- ERC-4337 bundler/paymaster, ERC-7579 adapters, passkeys/session wallets, owner gas sponsorship.
- Real proof guests, prover jobs, hardware attestation verification, authenticated AI agent runtime or model-inference provenance.
- Authenticated bridge transports, one-home authority policy, remote sender/finality enforcement or Solana programs.
- ENS/domain resolution to the NFT application and a live immutable application loader tied to token metadata.
- Encrypted group chat/key membership protocols; private memory ownership/key transfer; durable encrypted data availability beyond locally exported bytes.
- Protocol-wide confirmed event admission/reorg rollback for visual evolution and historic genome-plus-activity playback.
- Actual complete protocol deployment wiring: legacy deploy stack deploys only core router/verifier/renderer/witness/collection/factory, not every current module.

## Verification performed now and existing coverage

Fresh command executed on the supplied source copy:

```sh
node --test test/web.test.mjs test/evm.test.mjs test/kingdom/model.test.mjs test/instruments/engine.test.mjs test/operating/engine.test.mjs test/memory/engine.test.mjs test/memory/controller.test.mjs
```

Result: **191 tests passed, 0 failed, 0 skipped**, approximately 4.5 seconds. This includes real deterministic model behavior, Node native WebCrypto tests and mocked-provider client tests. It does not execute Solidity, contact a wallet, validate real v4, or certify the original pixels on a physical GPU. The package's historical combined UI report says 222 tests including further field/sensory/study suites; that historical total was not substituted for this fresh run.

Contract tests present in source:

- `test/contracts.integration.test.mjs`: one long core lifecycle test (mint/account funding; owner action; bound evolution; rollback; custody epoch/session invalidation; scope; spawn; agent metadata; ascend; sovereign action/metadata/transfer; renderer; witnesses; freeze).
- `test/verifiers.test.mjs`: SP1/RISC Zero statement adapters against fake gateways and composite behavior, not cryptographic proofs.
- `test/operating/contracts.integration.test.mjs`: five focused cases covering basket ceiling solvency, proportional impaired exits, disabled gate not blocking loan repayment, disabled gate not blocking call exercise, cell epoch/readoption/allowance reset. The last uses a mock root account, not the real collection/SovereignAccount integration.
- No actual MemoryLedger/JournalSwapRouter EVM test file exists in the supplied tree. No actual real PoolManager integration test file exists. No dedicated core test covers B1, B4, B5, B7 or B8.
- `scripts/static-audit.mjs` only scans four forbidden text patterns (tx.origin, selfdestruct, delegatecall, assembly sstore); a passing result is not a security audit.
- `scripts/compile.mjs` is a real solc pipeline using viaIR/optimizer and an EIP-170 runtime-size check. Dependencies were not present in this source copy during review. No new Solidity execution result is asserted here.
- Rust test fixture mentioned above is absent. Historical reports under version folders must not be read as evidence that the latest integrated source compiled.

## Recommended implementation order

1. Preserve original source with provenance and reproducible build. Add a shared capability schema to control discovery and keep every minted NFT functionally equivalent.
2. Fix B4, B7, B8, unsafe root account nesting and the zero-address ABI codec before new live integrations. Add focused adversarial tests for these exact failures.
3. Build configurable fee-stream/launch economics as a distinct well-specified module: conserve allocation totals in integer raw units; per-recipient claim accounting; supported arbitrary payout asset routes with exact input/minimum output/deadline; owner-selected terms; immutable per-launch configuration or explicit governed change semantics. Do not expose knobs the contracts ignore.
4. Implement actual typed adapters for funded bound-account swap, launch, vault, gift and journal calls; verify deploy manifests and configured emitting contracts. Keep transaction submitted/included/confirmed states distinct.
5. Bind identity seed, accepted module activity and renderer version into the new live center object and per-identity portal grammar. Add recoverable local preview and clear source status without flooding normal user flows with implementation text.
6. Add a sandboxed collectible/game runtime whose only economic output is a typed proposal to the same capability executor. Publishing/owning a game never silently grants root account spending.
7. Redesign the proof witness, canonical signer service and account verifier policy together (B1-B3). Enable sovereign promotion only against an actually working configured path. Add real v4 and end-to-end account/module tests before any production-value deployment.

