# Extension, agent, rehearsal and world audit

Scope: read-only review of the supplied ZIP at `review/ANIMA-NFT--752926ec2bc8cdc405ee5462aeb8bca4646c73f4`. Evidence below uses paths relative to that root. No project files were changed, no service was started, no packages were installed, and no public-chain or external-provider transactions were attempted.

## Main judgment

This is a substantial collection of working, bounded implementations, but it is several products presented as one feature list. The repository is often more candid than its broad labels: extension docs expressly disclose operator authority, escrow arbitration, frozen NFT custody, development proof setup, and read-only cross-chain observations. Preserve that honesty while reducing the default product surface.

A coherent core needs identity/custody, an intelligible permission model, exact transaction review, useful account activity and recoverable private memory. A generic menu of seventeen unrelated capabilities does not make that core stronger. Keep the capability plumbing, but move the game, research proof, financial experiments and specialist issuance mechanisms into independently maintained optional packages. Remove a feature from the default user journey before deleting tested source that may still have archival or research value.

## Confirmed defects and specific changes

### 1. Worlds fills permanently after 128 distinct historical identities

Evidence: `worlds/model.mjs:2` sets `maxPlayers: 128`; `worlds/model.mjs:12-18` enforces it against the entire persistent `world.players` dictionary. There is no player removal or active-presence distinction. `agent/worlds/server.mjs:110-115` creates a fresh persistent identity on every guest sign-in; `:117` removes only the bearer session at logout. The world reloads from disk at `:47-48`, while sessions start empty at `:51`.

Effect: the guest demo eventually refuses all new visitors, even with no active visitors. NFT-owner mode similarly accepts only its first 128 distinct NFT identities. Restarting does not free capacity. The docs call this an active-player cap (`docs/genesis/extensions/WORLDS.md:37`), which is inaccurate.

Verification: imported only the deterministic model, joined 128 guest identities, then attempted a 129th. Result was `{"historicalPlayers":128,"nextGuest":"World is full."}`. This reproduces the model defect without running a server. Existing runtime tests exercise two clients, transfer/epoch invalidation and a graceful restart, not historical churn (`test/extensions/worlds-runtime.test.mjs:19-47`).

Change: separate durable characters from active-session capacity. Give guests an explicit retention/resume policy, and define how archived characters' market orders and inventories are handled. Do not simply delete real NFT characters and their possessions to satisfy a connection limit. Add a churn/reconnect test.

### 2. Agent host UI allows bearer authority over remote plaintext HTTP

Evidence: `web/extensions/agents.mjs:143` permits any `http:` or `https:` host and sends `Authorization: Bearer ...`. The same bearer controls operator start/tick/stop and service-purchase review/commit (`:145-153`; `agent/extensions/host.mjs:17-36`). The separate payment wallet is budget-capped and service-pinned, but the bearer is enough to initiate the permitted purchases.

Effect: if a user configures a remote HTTP host, someone able to observe that connection can obtain the bearer and exercise its configured authority. This is conditional on remote plaintext configuration; the supplied host launcher binds loopback by default (`agent/extensions/start-host.mjs:23`), so this is not a claim that the default local setup publicly exposes a wallet key.

Change: reuse the existing HTTPS-or-loopback URL policy already present in the world/proof connection flows (`web/extensions/worlds.mjs:19`; `web/extensions/proof.mjs:18-21`). Continue keeping tokens in memory and retaining exact service pins and purchase reviews. Test rejection of a remote HTTP URL at the UI boundary.

### 3. Proof setup replacement guard misses a fresh checkout's existing artifacts

Evidence: `packages/rehearsal-proof/setup.mjs:15-17` requires `--replace-development-setup` only if `build/manifest.json` exists. Its later steps replace the generated Solidity verifier, root setup manifest and checked-in proof artifacts (`:27-44`). A fresh checkout already has `setup-manifest.json` and `artifacts/manifest.json`, but not the ignored build manifest. The documentation says replacing an existing setup requires the explicit flag (`docs/genesis/extensions/PROOF.md:71`).

Change: detect existing committed setup artifacts as well as the transient build directory before overwriting them. Treat compile-only/build checks separately from creation of a new trusted setup. This is an implementation/documentation mismatch, not a claim that existing proof files are corrupted.

### 4. Claims around the older policy agent exceed its actual reasoning

Evidence: `agent/policy-engine.mjs:82-149` deterministically builds an evolution proposal by hashing supplied text/state/evidence. Its receipt always labels the decision `EVOLVE` (`:142`); it does not interpret a constitution, choose among competing actions, inspect real-world evidence, or obtain canonical chain state itself. It nevertheless lists a canonical-collection guarantee (`:143-149`) while using the supplied collection address. `agent/server.mjs:89-95` correctly labels the output as an unsigned local proposal.

Change: call this a deterministic proposal builder, remove guarantees that cannot follow from caller-provided fields, and put verified context acquisition ahead of it. Consolidate around the newer bounded operator for actual scheduled execution. There is no need to retain multiple overlapping public-facing meanings of “agent.”

## Product decisions by subsystem

| Subsystem | What the source actually provides | Recommended decision |
|---|---|---|
| Exact review and scoped operator | An owner-granted worker can repeat an exact code-pinned call within native budget, time and interval limits; mode, owner, epoch and nonce checks surround execution. | Keep and make revocation/remaining authority visible. |
| Fork rehearsal | Executes supported public account swaps and vault operations on disposable Anvil state and reports balance/allowance/lock/authority changes. | Keep as the practical transaction-rehearsal path. |
| Generated instruments | Exact HTML/manifest commitments, escrowed work, separate approval/payment/acquisition, and a restricted iframe capable of proposing separately reviewed transactions. | Keep as an optional workshop. Describe it as source commissioning and a restricted runtime. |
| Private memory and encrypted groups | Real client encryption, recipient receipt-based handover, managed room epochs and public metadata. | Keep if communication/memory is a core use case; consolidate memory concepts and clearly disclose metadata/recovery limits. |
| ENS entry and gas sponsor | Dedicated delegated names and bounded sponsorship primitives; not general name ownership or free unlimited gas. | Keep as onboarding options when real deployments and funding exist. |
| Continuous auction | A custom 64-bid-slot native-escrow streaming auction. | Defer unless a particular launch actually needs it. |
| Public goods matching | A fixed round with a trusted identity registrar and finite sponsors/projects. | Isolate as a grant-round app. |
| Whole NFT shares | Frozen custody of an unused Bound NFT with share transfers, buyout voting and redemption. | Remove from the active/shared-NFT story; retain only as a separately named frozen-custody product. |
| House, Wager, Wake | Oracle/venue and resolver-dependent experimental finance and a rented keeper seat wrapper. | Keep behind a laboratory boundary; remove from normal onboarding and NFT utility menus. |
| Groth16 native quote | A real proof of small public quote arithmetic using development-only setup. | Move to research; remove from the ordinary swap path. |
| Cross-chain portal | Authenticated, delayed, read-only state observations under explicitly configured external transport trust. | Keep as an optional observer adapter; avoid implying cross-chain ownership or execution. |
| Shared world | A centralized persistent small multiplayer game with NFT-owner sign-in and operator-signed receipts. | Separate application; do not make its server a core NFT dependency. |

### Preserve the bounded operator; separate service spending from NFT authority

`contracts/src/extensions/agents/AgentPolicyGuard.sol:31-37` grants an exact calldata/codehash/worker/budget/interval scope. `:44-56` validates the before/after authority context and updates its audit trail. `agent/extensions/operator.mjs:27-51` reads current chain state, checks its worker, constructs the exact proposal, simulates and applies a gas cap before optional submission. These are valuable limits rather than merely UI promises.

`agent/extensions/host.mjs:21,27` correctly distinguishes stopping a local process from revoking onchain authority. Keep this distinction in the primary UX: stop is operational; revoke is authoritative.

The x402 payer is a separately configured wallet, not spending magically performed by immutable NFT code. `agent/extensions/x402.mjs:34-61` pins exact service URLs, token/domain/recipient/network, reserves budget before authorizing, checks the signature's scope, and requires independently verified settlement. `:70-76` verifies relevant receipt events. Preserve those safeguards. `AgentCommerce` is a scoped escrow/jobs implementation, and `ProviderDirectory` authenticates providers' own metadata; registration and signed claims do not certify service quality. The docs explicitly explain these boundaries (`docs/genesis/extensions/AGENTS.md`).

Operational hardening: `PurchaseLedger.change` uses an exclusive lock, temporary write and rename (`agent/extensions/x402.mjs:16-22`), with reservation before signing (`:47-58`). This is good fail-closed process behavior, but has no file/directory fsync or transaction database, and a crash can leave a stale lock. Avoid treating it as guaranteed storage-device crash durability. If real money depends on this host, define synced persistence, reconciliation and stale-lock recovery; a timeout must continue to consume budget until settlement is reconciled. This is a storage/operational limitation, not a demonstrated ordinary-restart budget bypass.

### Keep fork rehearsal and stop treating public arithmetic as the same feature

`agent/rehearsal/engine.mjs:12-41` restricts requests to the connected NFT account and installed sealed market/vault; `:54-73` pins a source block, executes only in the fork, compares before/after observations, rechecks source canonicality and closes the fork. `agent/rehearsal/fork.mjs:8-23` limits upstream RPC to read methods; impersonation/transactions go to local Anvil (`engine.mjs:62-65`). This is useful evidence of the consequences of the exact supported call at a particular state. It remains a simulation whose assumptions and supported operations should stay visible.

By comparison, the circuit has six public inputs and four public outputs (`packages/rehearsal-proof/native-quote.circom:9-18`); its arithmetic and range constraints are `:23-61`. There is no private witness. A direct BigInt calculation already exists at `packages/rehearsal-proof/prover.mjs:11-24`. Genuine proof generation occurs at `:36-42`. `contracts/src/extensions/proof/NativeQuoteRehearsal.sol:26-31` explicitly makes this read-only, development setup and `productionReady=false`; `:68-92` checks live context and the proof. It is not fake cryptography, but a poor complexity trade for elementary public quote arithmetic unless a specific research objective justifies it.

`packages/rehearsal-proof/setup.mjs:18-24` generates a single-machine development setup. The browser's checker-codehash/context/expiry checks are useful (`web/extensions/proof.mjs:23-69`), but do not turn it into an arbitrary EVM proof or production trust ceremony. Remove F14 from the primary swap decision path and use the practical rehearsal path there.

Artifact verification performed: SHA-256 of the checked-in WASM, zkey and verification key, plus the circuit and generated Solidity verifier, all exactly match `packages/rehearsal-proof/artifacts/manifest.json`. The verification key reports `groth16`, `bn128`, and ten public signals. This validates supplied artifact consistency, not toxic-waste destruction or proving-system soundness. `packages/rehearsal-proof/cli.mjs` DOES exist in this ZIP and was read (17 lines); any missing-CLI finding is a false positive.

### WholeNFTShares freezes precisely the useful thing an active NFT would need

`contracts/src/extensions/markets/WholeNFTShares.sol:20-23` explicitly excludes arbitrary execution. Deposit requires an unused Bound account with zero action nonce and zero instrument grants (`:64-70`). Thereafter shares may transfer, vote on buyouts and redeem (`:73-109`), but cannot operate the NFT account. The test confirms old owners/sessions cannot operate it while wrapped (`test/extensions/markets.test.mjs:78-87`). This is an intentional custody boundary, not a missing modifier.

If the goal is shared ownership of a living/operating NFT, this implementation changes the product into a frozen underlying asset. Either retain and name that product honestly, or design governance/revenue-sharing as a separate future specification. Do not add an unrestricted executor to “fix” it: that would invalidate the custody assurance and expose minority holders' assets. The majority buyout also intentionally allows forced sale of minority interests, as the documentation explains (`docs/genesis/extensions/MARKETS.md:45-51`).

### Financial mechanisms need a customer and a distinct reason to exist

The auction uses fixed bid limits, escrow and bounded settlement (`contracts/src/extensions/markets/ContinuousClearingAuction.sol:50-97`). It is a custom implementation, not automatic Uniswap liquidity creation. Its checkpoint timing changes execution, and the docs acknowledge timing/MEV considerations (`docs/genesis/extensions/MARKETS.md:17`). Keep it only if the launch design requires this exact market mechanism.

`PublicGoodsMatching.sol:32-63` contains real round arithmetic and native-budget distribution, but the registrar chooses identities. A trusted registrar is a product input, not solved identity/Sybil resistance. Put the grant application outside the wallet's default workflow.

House depends on external prices and execution venues, Wager on resolver/arbiter choices, and Wake on a rented task wrapper. The corresponding docs and tests are explicit about these dependencies. In particular `contracts/src/extensions/experimental/WakeExitTask.sol:9-11` admits the underlying exit vault remains permissionless: renting exclusive rights to this wrapper does not stop someone else invoking the vault directly. Remove the keeper-seat economic mechanism from the default product unless an actual scarce right/reward justifies its rent and foreclosure complexity. Preserve useful keeper scheduling separately.

The deployment example is a template catalog, not a ready-to-send deployment. It explicitly identifies placeholder replacement, pending nonce management, funding and post-deployment actions. Its Wake example charges seven times seat price over seven days (100% daily rent), and expressly disclaims this as an economic default. It should never be silently promoted into product defaults.

### Encrypted content is not anonymous metadata or guaranteed memory recovery

`web/extensions/privacy/crypto.mjs:11-40` implements native P-256 ECDH/HKDF/AES-GCM envelopes with contextual/padded group payloads; `:47-57` implements PBKDF2-protected backup. This is genuine encryption. However, the contracts publish membership, public keys and encrypted envelopes, and epoch keys are distributed by a manager (`contracts/src/extensions/privacy/EpochGroupChat.sol:54-76`). Long-term member-key compromise can decrypt archived epoch packages; this is not a forward-secret messaging protocol. Docs disclose the limitations (`docs/genesis/extensions/PRIVACY.md:25-33`). A manager has no ownership-transfer/recovery method, so long-lived groups need an explicit migration/recovery policy.

Private handover checks a random receipt delivered inside ciphertext, current recipient key generation, custody epoch and exact memory version before transfer (`contracts/src/extensions/privacy/PrivateMemoryHandover.sol:48-60`). It demonstrates receipt possession, not comprehension, seller erasure or a guarantee that future memory is safely backed up. Its `_memories` map is separate state (`:33-36,67`); it does not automatically update the account's native memory root/journal. Consolidate these concepts in the UI and define which record is canonical for each purpose. If strong secure messaging is a major product, use a separately justified and reviewed protocol instead of allowing this small bespoke scheme to acquire stronger claims over time.

### Generated instruments should remain proposals under an exact permission boundary

`worlds/instruments.mjs:8-30` bounds request size, HTML bytes and the two allowed capabilities, then commits to source, manifest and terms. `worlds/commissions.mjs:10-35` separates funding, reviewer decision, paid acquisition and refund, binding each step to the NFT account and exact terms. `agent/worlds/provider.mjs:6-18` packages/verifies supplied source and produces unsigned escrow actions; it is not itself an AI source generator or quality verifier.

The browser runtime in `web/extensions/worlds.mjs` uses an opaque-origin script-only sandbox, capability-limited messages and separately reviewed transaction proposals. The docs correctly state that exact-byte local approval is neither a signature nor a safety certificate (`docs/genesis/extensions/WORLDS.md:57-61`). Keep these separations. Do not market “generated instruments” as autonomous arbitrary wallet execution; source generation/provider hosting is a separate dependency.

### The shared world should be its own product

The deterministic world is 28×20 tiles, three gathered resources, one blade recipe, one wisp creature, town founding and a game-coin order book (`worlds/model.mjs:2-10,40-84`). Those actions work as a small multiplayer slice. This is not evidence of a comprehensive MMORPG, persistent onchain simulation, robust game economy or language subsystem; the docs explicitly list the missing breadth (`docs/genesis/extensions/WORLDS.md:91`).

The authority boundary is clear: one server serializes state and writes snapshots (`agent/worlds/server.mjs:47-55`), verifies EOA owner signatures (`:93-103`), checks current ownership/epoch on authenticated requests and again at mutation (`:56-63,121-127`), and signs operator receipts (`:125-127`). The client pins a server key and verifies receipts (`worlds/client.mjs:8-19,77-80`). These are useful operator attestations, not chain consensus. EIP-1271 contract-wallet or delegated agent login is not implemented.

After fixing permanent capacity exhaustion, address scaling honestly: the client polls every 600 ms (`worlds/client.mjs:83`); each owner-authenticated `/state` call performs a fresh chain ownership lookup (`agent/worlds/server.mjs:56-62,118`). The default per-IP rate cap is 24 requests/s (`:35,65-69`). Shared-NAT users can contend for that limit well below 128 clients, and chain RPC load scales with polling. This is an architectural inference from the code, not a load-test result. An event stream and appropriately reorg-aware indexed/cached identity state would be a more coherent next step than adding many more game mechanics.

### Portal is an observer, not a second ownership universe

`contracts/src/extensions/privacy/AuthenticatedStatePortal.sol:30-31` explicitly transfers no authority/assets. Its transport is configured and sealed with library/DVN/executor settings (`:74-111`); messages are delayed and source/endpoint/peer/nonce/domain/context checked (`:113-147`). Keep its external trust assumptions visible. The tests use a transport fixture, not a deployed LayerZero integration (`test/extensions/privacy.integration.test.mjs:13-30`). This is useful scaffolding for read-only remote state, not demonstrated live omnichain execution.

## Simplify the product and source organization

1. Remove the Section-17/F01–F17 taxonomy from normal product copy. `web/extensions/desk.mjs:20-39,72` exposes implementation numbering and seven unrelated feature groups. Users need named tasks and available deployments, not a checklist of completed specification sections.
2. Move generic ABI forms, raw integer allowances, manual deployment addresses, raw tuples and arbitrary wallet/account sender choices into an internal developer console (`web/extensions/desk.mjs:72,82-90`). Build normal flows around concrete roles, token decimals, deadlines, understandable approvals and confirmed capabilities.
3. Use one transaction encoder/review layer across desks. `web/extensions/markets.mjs:34-59` has parallel transaction-building logic while the generic desk uses ethers; retaining multiple paths invites behavior drift. Preserve existing codehash and authority checks during consolidation.
4. Split distribution and CI by actual independent products: core wallet/account, optional workshop/privacy/access, agent host, world service, finance laboratory and proof research. Avoid requiring cryptographic setup or game-server dependencies for a normal wallet build.
5. Preserve candid trust documentation, then reduce repeated explanation in user flows by making each module's authority, data location and lifecycle explicit in one consistent capability model.
6. Improve source formatting before larger changes. Many contracts and browser/service files compress multiple control-flow decisions onto one line. Security-sensitive code becomes easier to reason about when each validation/state update/external call is legible. This is maintainability work, not a reason to rewrite already tested semantics wholesale.

## Coverage and verification limits

Complete authored-source reading for assigned areas:

- All 20 Solidity files under `contracts/src/extensions`: access (GenesisNames/NamedMint and SessionSponsor), agents (AgentCommerce, AgentPolicyGuard, ProviderDirectory), experimental (ExperimentalLedger, House, HouseDependencies, Wager, Wake, WakeExitTask), markets (ContinuousClearingAuction, PublicGoodsMatching, WholeNFTShares), privacy (AuthenticatedStatePortal, EpochGroupChat, PrivacyKeys, PrivateMemoryHandover), and proof (NativeQuoteRehearsal and generated NativeQuoteGroth16Verifier).
- All authored browser files under `web/extensions`: access, agents, desk, experimental, markets, privacy, proof, worlds, privacy crypto/desk and the declaration file. The 513,051-byte generated `artifacts.mjs` was parsed as structured data: 27 contract ABIs/runtimes, 751 ABI entries, compiler/immutable metadata. Its generated machine code was not independently reverse-engineered or formally reaudited.
- All 13 authored `.mjs` files under `agent` except the separately assigned `agent/exit-keeper.mjs`: the original server/policy engine; six extension operator/host/provider/payment files; three rehearsal files; and two world-provider/server files. The extension package manifest and 32-entry lockfile were structurally inspected.
- All six files under `worlds`: model, browser client, HTML client, generated instruments, commission integration and browser-check script.
- All authored proof package source: circuit, CLI, prover, server and setup script. Package manifests/69-entry lockfile, setup/artifact manifests and verification key were inspected; WASM/zkey/key/circuit/verifier hashes were checked as described above. The license is standard GPL-3.0 text; no separate legal analysis was performed.
- All 15 files in `test/extensions`, all three in `test/rehearsal`, the workshop test, and additionally `test/agent.test.mjs` (57 lines). Tests were read for intended invariants and fixture boundaries. Contract tests use real compiled code/in-memory EVM mechanics but mock external feeds/transports/providers where shown.
- All eight extension Markdown docs, including `docs/genesis/extensions/AGENTS.md`, plus all 654 lines of the structured deployment catalog. The AGENTS document describes the feature/trust model, not additional agent workflow instructions.

Not claimed: independent audit of bundled ethers/snarkjs/circom/x402 dependencies, formal proof of Solidity correctness, financial viability, production key ceremony, live LayerZero/ENS/oracle/facilitator compatibility, public deployment verification, actual browser execution, load testing, or full EVM integration-test execution. Dependencies were absent for those broader tests. The parent reviewer separately ran selected dependency-free tests; this subreview does not relabel that as an end-to-end pass.

The source does not support a claim that every extension is production-ready. It also does not justify calling the whole extension set empty scaffolding: there is considerable real implementation and meaningful boundary testing. The clean-up should remove product ambiguity and unsupported coupling first, fix the concrete defects above, then deepen only the few capabilities needed for a clearly selected user journey.

