# Core contracts / onchain storage / proof-kernel review

Read-only source review of `ANIMA-NFT--752926ec2bc8cdc405ee5462aeb8bca4646c73f4`. No project file was changed. These are temporary working notes, not an independent security certification. Findings below are grounded in the supplied source, with production consequences conditional on a corresponding deployment/configuration.

## Main conclusion

The strongest coherent product is **one owner-controlled NFT, one deterministic account, one recoverable onchain application, and a small set of explicitly selected capabilities**. The code has useful foundations for that. It also contains several overlapping generations of launch, permission, memory, market and experimental-finance systems. The cleanup should reduce the active product surface while preserving valuable research and historical deployment evidence.

Do not erase the blue Genesis object or the underlying account/container concept to simplify the repository. Simplify authority, canonical state, deployment paths, and what each screen claims to do.

## Findings requiring changes

### C1. The proof kernel does not bind policy rules or selector to the committed action (high, conditional on use as a prover program)

Evidence: `proof-kernel/src/lib.rs:27-42` accepts `allowed_targets`, `forbidden_targets`, `allowed_selectors`, and `selector` as caller-supplied witness fields. Lines 115-117 only compare a supplied `constitution_hash` to the intent's `policy_hash`. Lines 135-161 enforce whichever allowlists the witness supplies; empty allowlists permit all values. There is no hash of the actual allowlist/policy document checked against `constitution_hash`. No calldata exists in `ProofInput`; the supplied selector is never derived from bytes whose hash equals `intent.data_hash`.

Consequence: a future zk proof of this evaluator would prove acceptance of the prover's chosen witness, not faithful enforcement of the NFT's committed target/selector policy. A caller could leave allowlists empty, or supply a permitted selector unrelated to the executed calldata. Current Solidity independently checks nonce, time, roots, constitution hash and native value, but cannot repair absent policy bindings inside a guest program.

Change: archive this as a policy-evaluator prototype until policy serialization and commitment, calldata preimage/hash/selector binding, public-input widths, program image/vkey, and adversarial proof vectors are complete. Do not describe the current Rust binary as a deployed zk proving system. It emits JSON; it has no SP1/RISC Zero guest dependencies in `proof-kernel/Cargo.toml`.

### C2. Irreversible sovereignty can retain mutable administrator authority or become permanently unavailable (high, configuration dependent)

Evidence: `SovereignAccount.sol:388-411` pins verifier address and code hash before `promoteSovereign`, but does not require router or verifier configuration to be frozen. `ThresholdAttestationVerifier.sol:29-46` permits the administrator to alter signers and threshold until `freeze`; these storage changes do not alter bytecode hash. `ProofRouter.sol:21-27` permits changing the verifier mapping until frozen. `SovereignAccount.sol:481-482` subsequently requires the original mapping/address, so a router mapping change blocks every sovereign action. There is no transition back to Bound mode or alternate recovery path. `scripts/deploy.mjs:26-30` only freezes when `FREEZE_TRUST_ROOTS === "true"`; `scripts/lib/deploy-stack.mjs:23-25` defaults to one attester. The integration test promotes before freezing, explicitly demonstrating that this configuration is possible.

Consequence: a mode presented as sovereign can actually be controlled by a mutable guardian administrator, or frozen indefinitely when a routing/admin/prover dependency becomes unavailable. Pinning a proxy's bytecode also does not pin implementation or mutable configuration.

Change: move irreversible ascension out of the ordinary owner product. Keep it as an explicit experimental capability until its trust, recovery and liveness requirements are decided. If retained, require a verifiable immutable policy authority (not merely immutable code bytes), show the actual signer quorum and dependency state before promotion, and resolve failure recovery deliberately. This is not a reason to remove owner-controlled agent delegation.

### C3. Legacy sessions permit broader authority than their apparent spending limits (high design risk)

Evidence: `SovereignAccount.sol:176-205` grants target, selector, native value, dates and call count; `executeSession` at lines 351-365 checks only those fields. ERC20 transfer amounts/recipients or approval amounts inside calldata are unrestricted. A grant to token `transfer(address,uint256)` with `maxValuePerCall = 0` can transfer the entire token balance; a grant to `approve` can authorize a permanent external spender. There is no post-execution ownership/epoch check on this older route. `isValidSigner` at lines 521-532 ignores its `bytes` context entirely and returns the signer magic value for every live session, without checking which target/selector/value is under consideration.

Change: retire broad session creation from the ordinary UI and converge on one explicit capability representation. The newer `InstrumentGrant` at lines 273-313 has exact calldata hash, asset, per-call and aggregate budget, code hash, expiry, call count and epoch checks; `executeUtility` at lines 237-256 has exact temporary allowance and post-call custody checks. Reuse those principles rather than keeping three differently safe permission vocabularies. External signature authority must not silently inherit action-specific session privileges.

### C4. A former owner can change the new owner's canonical memory head (medium, correctness/griefing)

Evidence: `MemoryLedger.sol:61-71` deliberately permits a former author, or the old custodian of an account-routed entry, to add reflections after sale. `_append` at lines 95-101 writes the same `head[identity]` used for current-owner work. `JournalSwapRouter.sol:29,47` uses `expectedJournalHead` in its atomic before-note and swap.

Consequence: retaining historical authorship is sensible, but the old author can repeatedly append to the new owner's canonical head and invalidate an already reviewed journal/swap transaction. This is not a direct theft path; it is unwanted continuing mutation authority and a possible race/griefing surface.

Change: keep historical attribution but write former-owner reflections into separate author/ownership-epoch branches, or require current-owner acceptance before such entries affect the canonical head. Current ownership should determine authority over current artifact state.

### C5. There are several incompatible launch products, and the owner-configurable one does not initialize its chosen pool (major product mismatch)

Evidence:

- `protocol/GenesisLaunchpad.sol:33` mandates founder allocation <=20%, liquidity allocation >=50%, vesting >=30 days, time-window limits, etc. Its constructor-sealed flow creates its own GenesisToken, seeds one market and deposits fixed founder/treasury schedules.
- `kingdom/PhoenixLaunchHook.sol:12-14,35-40` fixes a one-day fee ramp from 1.00% to 0.30%. It is not owner-authored fee routing.
- `confluence/fees/OwnerLaunchFactory.sol:62-90` mints a fixed-supply token and records selected-hook/pool/metadata commitments. It never calls PoolManager initialization, adds liquidity or wires a fee distribution contract. Its own comment correctly says these are metadata, not proof of a pool.
- `confluence/fees/OwnerFeeRouter.sol:13-15` correctly describes itself as a standalone fee splitter, not a v4 hook.
- `protocol/NativeMarket.sol:7-8` is a separate custom constant-product AMM; `kingdom/V4GenesisMarket.sol` is the actual limited v4 adapter for this launchpad's native/token pairs.

Change: decide one canonical launch lifecycle that reflects the user's creator-choice requirement: author terms, choose/create compatible hook, deploy token, initialize pool, fund liquidity, bind fee recipients/conversion routes, verify resulting onchain configuration. Until this exists, label owner token creation and pool configuration as distinct stages. Keep the prescriptive Genesis launch as an optional named preset/reference example. Keep NativeMarket under local/reference testing, not as an interchangeable v4 market. Do not delete its useful tests.

### C6. Core memory has two values that can disagree (medium correctness)

Evidence: `SovereignAccount.sol:496-497` accepts a new memory root on any valid sovereign action. `IDontFuckingBelieveIt.sol:421` updates `Organism.memoryRoot` only during `commitEvolution`. `metadata(...,"core.memoryRoot")` at line 532 reads the organism's value, while `renderSnapshot` at line 773 reads the account's value.

Consequence: a valid non-evolution sovereign action may make the metadata getter and renderer report different “core memory roots.” This is a concrete canonical-state duplication bug, even if the current common test path happens to keep them equal.

Change: choose one canonical memory root and derive all public views from it, or make all transitions update both atomically. Avoid naming both account roots, journal heads and form roots simply “memory” in the UI; these have different semantics.

### C7. `bindERC8004` records a claim, not verified registry ownership or registration (medium claim/identity issue)

Evidence: `IDontFuckingBelieveIt.sol:472-492` checks only nonzero registry and proof hash, then stores the registry, ID and hash. It does not require contract code, call an identity registry, verify ownership, or verify the purported binding proof. `test/contracts.integration.test.mjs:211-219` intentionally binds to a MockTarget called `fakeAgentRegistry`.

Change: either implement verified registry binding and return its verified status, or rename the capability to “declare external agent identity” and make unverified status explicit. A nonzero hash is not evidence that the claimed identity exists or belongs to the account. This does not require removing agent compatibility.

### C8. Membership/Moderator grants expire on the room administrator's transfer, but not on the member's transfer (medium, conditional on intended semantics)

Evidence: `WorldLedger.sol:106,111-112` stamps invitation/moderator grants with `_epoch(r.admin)`. `moderatorActive` at lines 148-149 checks only the room admin's epoch. A member/moderator NFT account remains the same address after its own NFT is sold; `accepted` remains true.

Consequence: the buyer of an invited/moderator NFT inherits writing/moderation rights without a new consent action, even though the design carefully invalidates grants when the administrator NFT changes hands. Public-readable room bytes are already disclosed; the issue is write/moderation authority, not secret-chat decryption.

Change: explicitly choose whether room grants belong to transferable accounts or current humans. For human privileges, record both grantor and grantee ownership epochs and require renewed acceptance after either relevant transfer. Make the same choice consistently across social, worker, agent and account modules.

### C9. Tracked experimental assets can permanently poison unrelated cell operations (medium liveness)

Evidence: `ExperimentCell.sol:25-26` reads every tracked token balance before every execute; lines 32-33 repeat the reads; `snapshot` at line 42 does the same. `_track` at line 40 only adds assets, up to a lifetime maximum of 32. There is no removal/replacement/recovery path for a token whose `balanceOf` later reverts. `CommitmentIndex.sol:23-26` requires the cell snapshot to succeed; EstateExchange depends on this commitment snapshot.

Consequence: deliberately adopting or accidentally selecting one broken/upgradeable token can block all subsequent cell recipes and covenant snapshots, even when the failing token is unrelated to the desired action. Per-asset withdrawal still exists for functioning assets, so do not describe this as every fund being unrecoverable.

Change: add a carefully scoped asset-retirement/recovery design that cannot silently omit liabilities from a sale manifest. Keep the separate funded experiment cell; it is a good boundary, but it needs manageable asset lifecycle rather than an append-only roster forever.

### C10. Remove outdated or overbroad implementation claims

Evidence: `MemoryLedger.sol:6`, `JournalSwapRouter.sol:10`, and `ConsentGiftRouter.sol:14` still say UNCOMPILED/UNTESTED/UNDEPLOYED while matching generated artifacts exist in the archive; source-era comments are not a reliable release-status source. The legacy renderer at `OnchainRenderer.sol:22` states memory is “private”, although it stores only commitments and encryption depends on separate client behavior. `WorldLedger.sol` correctly states all messages, including member-gated channels, are publicly readable. `OnchainApp.sol:14` correctly distinguishes onchain storage from browser execution.

Change: keep one machine-readable capability/deployment status manifest with source, compiled, tested, simulated, deployed, and reachable status. Use precise product language: onchain bytes, owner-controlled transactions, encrypted payloads where actually encrypted. Public code cannot be made secret merely by checking NFT ownership in a GUI.

## Worth keeping

1. **NFT-account custody boundary.** Owner-only `_isController` (`SovereignAccount.sol:568-570`) does not treat marketplace approvals as spending/policy authority. `IDontFuckingBelieveIt._isMutableAuthority` likewise distinguishes approvals from mutation rights. Transfers invalidate account session epochs even if the NFT later returns to the same wallet.
2. **Deterministic account addresses and immutable content.** CREATE2 factory and hash-verified AppChunk/OnchainApp/ConfluenceRenderer loader provide a coherent durable artifact identity. `ShardedResource` correctly requires clients to verify compressed and expanded hashes; do not replace this with hosted-only assets if fully stored content is a requirement.
3. **Genesis portrait and full artifact renderer.** `GenesisSVG` uses the actual seed/genome/state/audit snapshot, while `ConfluenceRenderer` embeds chain-qualified identity and recoverable runtime. Keep the legacy renderer for historical deployments/reference, reduce duplicate user entry points.
4. **Exact temporary approvals and accounting.** ProtocolAssets rejects silent false returns and transfer-fee/rebasing differences; executeUtility and newer instrument grants clear allowances and verify custody after callbacks. These deserve to become canonical rules.
5. **TimeVault and VestedExitVault separation.** TimeVault is ordinary nonaccelerable lock/vesting; VestedExitVault requires eligibility, min-output, unchanged custody, and fixed-recipient settlement. A scheduled date is not a guaranteed fill; the code describes this correctly.
6. **Fee rights survive reconfiguration.** OwnerFeeRouter attributes earned claims immediately; changing the future split does not rewrite existing recipient balances. Pull-based claims avoid requiring every recipient to accept during deposit.
7. **Estate covenant honesty.** EstateExchange protects declared balances, child ownership, selected allowance pairs, vault locks and configured module commitments. It explicitly does not claim to prove absence of all external approvals/liabilities. Preserve that distinction.
8. **Cartridge content and authority separation.** CartridgeRegistry can hold public content hashes/bytes and ownership-linked launch eligibility without granting account spending access. CommissionedCartridges acquires a frozen paid deliverable separately from permission grants.
9. **Disabled entry must not disable exits.** Operating experiment gates block new risk, while refunds, repayments, exercise and recovery paths remain independently available. Preserve those invariants when reducing the active menu.

## Keep active / archive / remove guidance

| Area | Recommended treatment | Reason |
|---|---|---|
| Collection, deterministic account, transfer epochs, explicit utility execution | Keep and simplify | Core identity and custody |
| OnchainApp/AppChunk, sharded resource verification, Genesis SVG, Confluence runtime loader | Keep | Core onchain artwork/application promise |
| Memory/journal, swap, lock/vesting, social, cartridge container | Keep as product capabilities, fix issues above | Directly matches intended NFT functions |
| OwnerFeeRouter and flexible launch configuration | Keep and finish coherent end-to-end wiring | Creator-defined economic flows |
| NativeMarket and prescriptive Genesis launch | Archive as named reference/test preset | Useful implementation, currently competes with actual-v4/owner-authored flow |
| Legacy OnchainRenderer | Preserve historical source, remove duplicate primary navigation | Existing deployment compatibility and visual comparison |
| Irreversible sovereignty, proof evaluator, attestations/zk adapters | Research/experimental area until trust/proof model complete | Unnecessary authority/liveness risk in ordinary owner mode |
| FixedBasket, MatchedRightsVault, FixedTermCredit, CoveredCallBook, BondedShelf | Optional separately deployed experimental modules | Broad finance product expansion, not fundamental to an NFT OS |
| ExperimentCell/CommitmentIndex | Keep as isolation infrastructure if any experiments remain | Funded isolation and explicit inventory commitments |
| Duplicate string/encoding helpers and redundant self-authored token implementations | Consolidate carefully | IDontFuckingBelieveIt has private copies of conversions already in Strings; GenesisToken and OwnerLaunchToken duplicate fixed supply logic |
| Stale readiness claims and confusing identity/proof labels | Replace/remove | They cause users/reviewers to mistake a recorded hash for a verified action |
| Historical deployment addresses/artifact hashes, licenses, generated provenance | Preserve | Required to trace immutable deployed versions and dependencies |

Do not remove raw source/history merely because a feature is hidden from the ordinary user flow. Avoid deploying all optional finance modules as mandatory companions to every NFT.

## Verification and coverage

- Read all **56** Solidity files under `contracts/src`, excluding `extensions` (assigned to another reviewer) and vendored Solady dependencies. Total 5,057 physical lines, including generated ConfluenceLoader; many lines contain entire minified functions.
- Read both Rust source files and `proof-kernel/Cargo.toml` in full.
- Read seven test files in full: `test/evm.test.mjs`, `test/contracts.integration.test.mjs`, `test/verifiers.test.mjs`, `test/exit/contracts.test.mjs`, `test/confluence/contracts.test.mjs`, `test/confluence/archive-loader.test.mjs`, `test/operating/contracts.integration.test.mjs`.
- Read `scripts/deploy.mjs` and `scripts/lib/deploy-stack.mjs` as targeted supporting evidence.
- Executed `node --test test/evm.test.mjs`: **22 passed, 0 failed**. This suite uses a mocked wallet provider; it proves local ABI, wallet-state and receipt-handling regressions, not deployed contract safety.
- No cargo binary and no repository/runtime ethers, ganache or solc packages were available in this reviewer environment. Did not install dependencies or run network transactions. Other reviewers may provide broader execution results.
- Static packaging failure confirmed: `proof-kernel/src/lib.rs:318` includes `../fixtures/statement.txt`, but `proof-kernel/fixtures/statement.txt` is absent from this archive. Rust test compilation will require restoring the fixture. Normal non-test compilation does not include this line.
- Reviewed verifier tests: SP1/RISC Zero tests use mock gateways whose behavior checks supplied proof hashes, not real zk proof validity (`contracts/src/mocks/MockZkGateways.sol`, `test/verifiers.test.mjs`). Treat these as adapter/ABI tests.
- Inspected generated artifact sizes, without claiming recompilation: collection runtime 19,823 bytes; SovereignAccount 16,369; ConfluenceRenderer 21,635; factory 18,279; V4GenesisMarket 11,453. These sizes alone do not indicate a contract-size blocker.
- Vendored Solady was treated as a dependency boundary, not independently security audited. Generated artifacts were inspected for existence/size rather than every byte semantically reviewed.

### Full assigned Solidity reading inventory

`confluence/ArtifactBinding.sol`, `confluence/ConfluenceLoader.sol`, `confluence/ConfluenceRenderer.sol`, `confluence/GenesisManifest.sol`, `confluence/GenesisSVG.sol`, `confluence/cartridges/CartridgeRegistry.sol`, `confluence/cartridges/CommissionedCartridges.sol`, `confluence/fees/OwnerFeeRouter.sol`, `confluence/fees/OwnerLaunchFactory.sol`, `confluence/fees/interfaces/ISettlementConverter.sol`;

`core/IDontFuckingBelieveIt.sol`, `core/OmnichainWitnessRegistry.sol`, `core/OnchainRenderer.sol`, `core/ProofRouter.sol`, `core/SovereignAccount.sol`, `core/SovereignAccountFactory.sol`, `core/ThresholdAttestationVerifier.sol`, `core/ZkVmVerifierAdapters.sol`;

`instruments/ConsentGiftRouter.sol`, `interfaces/Interfaces.sol`;

`kingdom/EstateExchange.sol`, `kingdom/HookDeployer.sol`, `kingdom/PhoenixLaunchHook.sol`, `kingdom/V4Boundary.sol`, `kingdom/V4GenesisMarket.sol`;

`lib/Administrated.sol`, `lib/Base64.sol`, `lib/Crypto.sol`, `lib/Strings.sol`;

`memory/JournalSwapRouter.sol`, `memory/MemoryLedger.sol`;

`mocks/MockTarget.sol`, `mocks/MockZkGateways.sol`, `mocks/ReentrantProbe.sol`;

`operating/BondedShelf.sol`, `operating/CommissionEscrow.sol`, `operating/CommitmentIndex.sol`, `operating/EditionRegistry.sol`, `operating/ExperimentCell.sol`, `operating/ExperimentGate.sol`, `operating/ExperimentalAdapters.sol`, `operating/InstrumentRouter.sol`, `operating/NegotiatedMarkets.sol`, `operating/OperatingInterfaces.sol`;

`protocol/GenesisLaunchpad.sol`, `protocol/GenesisToken.sol`, `protocol/NativeMarket.sol`, `protocol/OnchainApp.sol`, `protocol/ProtocolPrimitives.sol`, `protocol/ShardedResource.sol`, `protocol/TimeVault.sol`, `protocol/VestedExitVault.sol`, `protocol/WorldLedger.sol`;

`test/EncodingHarness.sol`, `test/ExitHarness.sol`, `test/OperatingHarness.sol`.

## Appendix: Kingdom frontend source review

Read in full after the contract pass: `web/kingdom/model.mjs` (113 lines), `app.js` (118), `scene.js` (52), `shell.html` (10), `styles.css` (18). These five files are authored inputs. Also read `scripts/build-kingdom.mjs` and inspected/compared the generated `bundle.check.js` (327 lines). The generated bundle contains exact copies of the current model, scene and app, but a stale version of the shared EVM codec. No duplicate kingdom test suite was run.

### K1. Reduced-motion/manual camera controls fail to redraw (confirmed source reproduction)

`scene.js:7` updates `tyaw`, `tpitch` and `tzoom` in pointer, wheel and keyboard handlers without setting `dirty`. `scene.js:49` only draws when `motion || dirty`. When Drift is off or reduced motion is preferred, moving/zooming the camera changes internal coordinates but leaves the displayed image unchanged until another action invalidates the scene.

A read-only Node VM reproduction executed the actual class with rendering stubs: wheel input changed zoom from 1 to 1.035, `dirty` stayed false and draw count stayed 0. Change: mark manual camera changes dirty and redraw immediately while decorative motion is disabled. Reduced motion should remove involuntary animation, not user navigation.

### K2. Kingdom membership model contradicts the Solidity transfer policy (confirmed source reproduction)

`model.mjs:76` checks only bans, room openness, administrator status and `member.accepted`; it never compares the invitation's epoch to the current room-admin artifact epoch. `accept()` checks the epoch once, so previously accepted members continue posting across later admin NFT transfers/escrow. The Solidity `WorldLedger.post` checks the admin's current epoch on every post.

A direct model reproduction invited guest at epoch 1, accepted, then listed the administrator's NFT (epoch 2). `_canPost(room,guest)` remained true with an epoch-1 invitation. Change: share or faithfully mirror the actual authorization predicates. A locally passing rehearsal must not teach a permission rule that the chain rejects.

### K3. “The Interior” has a camera-limited illustration, not interior traversal

`scene.js:7` limits wheel zoom to 0.78–1.22 and pointer yaw/pitch to narrow angles. It supports one pointer drag, wheel, arrows, plus/minus. There is no multi-touch pinch, double tap, movement through an object, doorway selection, interior camera transition or explorable interior scene graph in these files. `app.js:25` describes “places to enter”; `enter-estate` merely selects an identity and returns to the same Sanctum scene.

The procedure-generated faceted phoenix and architecture are useful art assets, but they do not fulfill deep interior exploration. Preserve this as a gallery/alternative scene and connect to one actual exploration engine. Avoid presenting a change of decorative background as entering a living world. The backdrop sky is fixed to seed 17 (`scene.js:10`), while architecture uses the selected example identity's seed; it is not a fully unique cosmos per NFT.

### K4. Fixed economics persist throughout the rehearsal

`model.mjs:41-56` repeats 20% founder and >=50% liquidity rules; settlement hardcodes 180-day founder/treasury schedules and 30-day founder cliff. `app.js:27` exposes those restricted form ranges and a fixed allocation graphic; `fees()` repeatedly explains the fixed 1%-to-0.3% fee ramp. These are a specific example launch design, not the user's freely authored fee/receiver/token framework.

Additional source/model drift: UI/model permits 2–12-character ASCII tickers (`model.mjs:42` and `app.js:27`), while `GenesisToken.sol:13` restricts symbol length to <=10 bytes. The local model's cap/vesting choices also do not exactly match all Solidity input constraints. Unify terms validation from a single selected capability schema; keep economic defaults as optional presets, not hidden rules.

### K5. Local-vs-chain boundary is mostly honest but excessively repeated and historically stale

The module is explicitly local: `app.js:1-3`, review modals, badges, balances, persona choices, exports and receipt views repeatedly state unsigned rehearsal. Its world participants are fictional; there are no live users behind the chat. Its quote function labels constant-product reserve arithmetic an illustrative approximation, not a v4 tick simulation (`model.mjs:59`). Keep those distinctions.

However, `app.js:26,43,57,118` embeds old “uncompiled / not deployed / not exercised” status; the archive now contains corresponding compiled artifacts. The boundary copy also tells users to return to an archived v1.3 experience and warns that its wallet ABI is incompatible with the new market. This is evidence of accumulated product generations.

Change: one concise persistent mode indicator, one source-of-truth capability status screen, and one active product route. Archive the old Kingdom rehearsal as a named comparison, rather than forcing every current feature to explain its relationship to v1.3/v1.4.

### K6. Generated kingdom bundle is out of sync with shared codec

Reconstructed the expected bundle string exactly from `scripts/build-kingdom.mjs` without writing anything. It does not equal `web/kingdom/bundle.check.js`. Current model, scene and app strings are all exact substrings of that stored bundle; current `web/evm.mjs` after export removal is not. The first difference occurs around byte offset 2657: current ABI address encoding validates a 40-hex-digit address directly (including zero); stored bundle instead calls `address(value)` which rejects zero.

This Kingdom app only imports the codec for hashing, so this specific stale embedded client is not evidence of live financial execution. It demonstrates that checked-in generated bundles are not reliably regenerated together. Remove redundant generated “check” bundles from authored source navigation or regenerate them under a deterministic build gate; preserve final release artifacts with hashes.

### K7. Source maintainability and optional aesthetic improvements

The 118-line `app.js` is over 54 KB and contains entire screens, inline styling, money review modals and event dispatch in single lines. `scene.js` is over 11 KB in 52 lines. Reformat these as maintainable source, break screen modules along real responsibilities, and stop bundling an unused full wallet client into a local illustration just to obtain a hash function.

Use the Kingdom artwork as one deliberate visual branch. Its standard overlay panels and separate full-screen layer (`styles.css:1-6`) do not implement the user's preferred object-forming interface. Unifying the product should preserve the preferred original blue object and smooth interior travel, then allow alternate gallery scenes rather than replacing the identity with several competing wrappers.

## Appendix: historical Four Chambers HTML

### Reading coverage

Inspected `web/reference/four-chambers-1.3.html` in full structural scope: 290,058 bytes, 856 physical lines. Read all HTML markup, all unique Four Chambers CSS (18,276 bytes), and the complete unique JavaScript section (extracted runtime lines 424–774; original HTML lines 506–856), including the flat ABI codec, local financial/social state machine, ProtocolClient and every UI action/render/installation function. No tests run for this appendix.

Deduplication established that the first embedded ASSETS script (65,243 bytes) is byte-for-byte `web/assets.js`; the first 21,397 bytes of CSS are exactly current `web/styles.css`. The current `web/model.mjs`, `web/renderer.js`, and `web/audio.js`, after stripping module syntax, are exact substrings of the historical runtime. The current `web/app.js` differs only at the exposed `window.__idfbi` API line: the archived 1.3 export additionally exposes `connectNFT`, `refreshNFT`, `disconnectNFT`, and `protocolPulse`. These duplicates were compared structurally, not counted as newly authored unread logic. The embedded historical EVM codec is stale relative to current `web/evm.mjs`. Generated base64 WebAssembly bytes and the duplicated embedded original HTML asset were identified, not semantically audited as fresh authored source; root separately read the original HTML. No claim of binary/security audit of those assets.

### H1. This apparent archive is still an active build dependency

`scripts/build-kingdom.mjs:6` reads the whole historical file as the base and adds Kingdom above it. The old file contains a fully active local financial model, testnet wallet client, dialogs, event listeners and rendering loop. Its unique `ProtocolClient` and `pCreateWorld` implementations do not have separate authored module files outside historical/generated HTML. It cannot simply be deleted as dead history without first removing this build dependency or extracting the required source.

Change: build the chosen current product from explicit source modules. Retain a frozen historical artifact for comparison; do not use a historical full application as the shell of each next generation. Consolidate the useful wallet review, exact allowance, receipt finality and authority-context checks into one maintained client.

### H2. Historical wallet flow deliberately rejects the current ledger

`four-chambers-1.3.html:621,632` requires `keccak256('idfbi/four-chambers/1.3')` from `ledger.version()`. Current `contracts/src/protocol/WorldLedger.sol:63` returns `keccak256('idfbi/constellation/1.4')`. The archived client also expects old custom-market `poolInfo(address)` result types (`HTML:658`), rather than the current v4 market interface. The guard is useful: do not “fix” only the version comparison and assume interoperability. This is a separate generation of application/contract semantics, requiring either a complete tested adapter or archived-only status.

The old UI generally identifies local rehearsal versus real testnet correctly, blocks mainnet and requires explicit wallet review. Preserve these boundaries while reducing repeated version warnings from normal product screens.

### H3. Hidden legacy drawing continues under Kingdom

`four-chambers-1.3.html:832` installation enables `p-economy`; `:842` starts its own `requestAnimationFrame(orbitLoop)`. `:828` checks document visibility and legacy economy/immersed flags but never checks whether Kingdom covers the old canvas. `web/kingdom/app.js:113,117` pauses only the original organism renderer by setting `renderer.motion=false`. The separate historical orbit loop still clears and redraws the hidden canvas every frame (with time fixed at zero in reduced motion). CSS's reduced-motion handling for the orbit canvas only changes opacity (`HTML:59`).

Change: one active scene lifecycle, with hidden scenes completely suspended and a dirty-frame path for reduced motion. This follows directly from the retained loop conditions; no browser performance benchmark was performed.

### H4. Repeated financial models and UI shells are the clearest removable layer

The old model hardcodes a constant 0.3% swap fee (`HTML:547`, multiplier 9970/10000), while Kingdom uses a launch-age fee ramp and explicitly approximate reserve arithmetic. The real v4 contract path is another source of pricing truth. Each generation carries separate launch, vault, social, review and storage-schema UI machinery. Their simulated equations are useful as named fixtures, but should not all remain current product implementations.

Change: choose one current authority/capability and transaction model, one contract-matched schema, one client and one default scene. Retain historical versions as snapshots outside the active build and preserve test fixtures that explain migrations. The legacy page's window/sidebar/dialog CSS is ordinary interface scaffolding; it is not necessary to preserve it as part of the original optical artwork.
