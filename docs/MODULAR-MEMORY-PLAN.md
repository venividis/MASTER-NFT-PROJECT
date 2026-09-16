# ANIMA: expandable memory and modules on the same NFT

Design review · 16 September 2026 · Proposed work, not an implemented upgrade

## Recommendation

Keep ANIMA's original NFT, account, artwork and built-in application permanent. Give that same account a growing collection of immutable module releases, with an owner-controlled selection of which releases to use. Store each module's saved state separately from its program. Reuse existing onchain chunks instead of republishing the entire application.

There are two practical stages:

1. **Extend the existing cartridge route.** A new ABI-compatible registry can potentially assemble larger self-contained HTML tools from immutable onchain chunks for the existing launcher. Prove this against an unchanged minted runtime first.
2. **Add a separately recoverable extension workbench.** This new host can support lazy loading, saved module state and explicitly reviewed actions for the same NFT/account. A future ANIMA edition can include that host directly. An already immutable edition cannot acquire new host powers merely by loading a cartridge.

This gives us useful Lego-like expansion without making the original artwork replaceable by a publisher. It does not create unlimited EVM storage, free publishing or unlimited browser memory.

## What the current source actually supports

The current source was reviewed from the saved `ANIMA-Onchain-Launchpad-complete.zip`, SHA-256 `4538894773518622bc553fa15107f9ee84b297199e298f67b4611f9620152a57`. Paths below refer to files inside that project. This review did not rerun its suites, deploy contracts or modify application code.

| Concern | Already present | Remaining gap |
|---|---|---|
| Large application storage | Immutable chunks of up to 23,000 payload bytes; bounded v1/v2 archive readers | Publishing/read costs still grow with bytes |
| Reusable code | Independently compressed feature archives; stored/expanded SHA-256; exact dependency versions; reuse across editions | Current feature groups are not independently installable applications |
| Startup | Full edition recovery and verification before execution | Lazy loading of only a chosen extension and its dependencies |
| Same-NFT additions | An existing cartridge screen loads new owned HTML/JavaScript cartridges | Seamless installation, discovery and larger chunk-backed cartridges |
| Rich generated tools | Reviewed source can receive an explicit snapshot and propose an exact preapproved transaction | This host is not the host used by ordinary onchain cartridge recovery |
| Personal memory | `MemoryLedger` stores attributed, append-only public or client-encrypted bytes, with stale-head protection | Generic namespaced application state and migrations |
| Published content | `EditionRegistry` stores immutable leaves and editions with parent references | Publication/adoption is not a UI installer or automatic authority |
| Identity and original experience | Immutable collection renderer and runtime bindings | Built-in code cannot be patched on an already minted immutable edition |

A correction to the earlier explanation: **an existing NFT can gain new executable interfaces through its cartridge host.** What stays fixed is its original built-in runtime and that host's capabilities.

### Existing host boundaries

`web/confluence/wallet.mjs` accepts a selected registry address and cartridge ID, calls `launchManifest`, checks the current holder/controller, fetches `contentOf` at the same block and checks SHA-256. `web/confluence/app.js` then runs the returned HTML in an iframe.

| Route | Current bound | Available interaction |
|---|---|---|
| Current onchain `CartridgeRegistry` | 24,576 stored content bytes | Self-contained HTML/JS; no host message bridge |
| Existing generic HTML launcher | 1,048,576 HTML bytes | Same isolated presentation environment; this is not proof that a 1 MiB RPC response is practical |
| Generated instrument host | 24,576 program bytes; 8 KiB committed snapshot; at most five minutes per frame | Optional snapshot read and an exact, separately granted transaction proposal |

The generated instrument proposal prepares a wallet review; it does not send a transaction. Its full deliverable JSON is needed to reconstruct the richer host's request and review data. The current onchain cartridge manifest does not preserve that whole request, so ordinary cartridge recovery does not restore these capabilities automatically.

The existing owner-call client also rejects proof-authorized account mode. Compatibility with that mode needs a separately tested integration.

## First implementation: larger cartridges for an unchanged NFT

Build a standalone **`ChunkedCartridgeRegistry`** with the existing `launchManifest` return layout and `contentOf` interface. This is a new companion contract, not a change to the deployed registry or master NFT.

- Bind ownership to the same canonical `ArtifactBinding`/collection/account relationship used by the current deployment. Derive the current controller and custody epoch from that relationship.
- Reuse `AppChunk` and `OnchainApp` for immutable bytes. Start with raw, self-contained HTML to avoid needing a new decompression or RPC capability inside the old sandbox.
- Return the assembled HTML through `contentOf`; publish its exact SHA-256 in the launch manifest. Freeze each release's manifest and content binding.
- Let the existing ANIMA account hold the cartridge. An updated release can be another cartridge; replacing the master NFT is unnecessary.
- Publish and acquire this first cartridge through separately reviewed generic transactions or a new publishing tool. The current Workshop client checks exact deployed runtime fingerprints, including the registry; ABI compatibility does not make a new registry compatible with that commissioning UI. The initial compatibility target is the existing generic owned-cartridge launcher.
- Keep the legacy output below the launcher's existing 1 MiB bound, and impose a smaller practical limit established by measured RPC/view-call costs.
- Do not add external script URLs, wallet injection or unrestricted networking to get around the old host's restrictions.

**Why this may work:** the current launcher selects a registry by address and consumes its ABI, rather than hardcoding the original registry deployment. It already launches HTML larger than the original registry's storage cap. This is a source-based compatibility inference, not a passing integration result.

**First proof:** mint an ANIMA NFT before deploying the new registry. Publish a useful 48 KiB cartridge across three existing-size chunks, acquire it into that NFT account, and launch it using the exact old runtime. Confirm the collection, token ID, account, original runtime commitment and original artwork state are unchanged. Then publish another release and show both remain recoverable.

This first proof establishes larger onchain add-ons. It does **not** establish lazy chain reads, generic saved state or new transaction capabilities inside that old host. The old loader still fetches the complete cartridge before execution.

## The full module architecture

| Layer | Responsibility | Authority |
|---|---|---|
| Original ANIMA | Identity, original artwork, original runtime | Existing contract rules |
| Immutable release store | Program bytes, assets, manifests and exact dependency commitments | Publication does not activate code |
| NFT installation registry | Active release choices and installation history | Current NFT account/controller under explicit existing rules |
| Extension workbench | Verify, load and isolate selected programs | Narrow, versioned capabilities |
| Module state store | Persistent namespaced app data and migration roots | Explicit state permissions, separate from spending |

The new workbench must itself be recoverable from immutable onchain bytes. Existing holders can open it independently and connect the same NFT/account. A future edition can expose it as a built-in entrance. Loading it inside the old restricted iframe would not grant it capabilities that iframe lacks.

### Proposed release manifest

Use a canonical, versioned `anima.extension-release/1` format with a precisely specified encoding and hash domain. Include:

- Publisher namespace and module identity; human-readable name/version as labels.
- Archive schema, chain/address location, stored hash/length and expanded hash/length.
- Entrypoint, runtime type, host API version and supported capabilities.
- Exact dependency **release hashes**, ordered deterministically; never resolve `latest`.
- State namespace/schema, optional predecessor and migration commitment.
- Resource limits and immutable provenance/build metadata where available.

Distinguish the payload hash from the complete release hash. The same immutable program bytes can be reused in two releases with different dependency selections. A manifest hash proves identity, not safety, compatibility or publisher honesty.

### Installation and permissions

`TokenModuleRegistry` should record an append-only installation history and a current active selection keyed by collection, token ID and module identity. Include expected previous root and custody epoch in updates, so stale reviews cannot overwrite newer choices. Use bounded pages to enumerate the catalog; do not make every launch traverse its lifetime history.

Installing a program must grant no spending allowance. Transaction requests go through existing owner review or explicit, bounded account grants. Retain the existing seven-day instrument-adoption delay wherever that account route applies. Disable/revoke must be available without cooperation from the module publisher. Transfers invalidate former-owner permissions even if public installed releases remain associated with the NFT.

Use ordinary calls to external modules, not arbitrary `delegatecall` into the NFT account. A proxy's unchanged runtime code hash alone does not pin its implementation behavior; either require immutable execution targets or explicitly bind and monitor the relevant implementation/control assumptions.

### Lazy loading and state

The new host resolves only the chosen extension's complete dependency closure, reads it at a consistent chain snapshot, verifies it and then starts that extension. Keep dependencies inside that extension's execution environment. Unrelated optional modules must not block the original experience. Reject cyclic install graphs initially; deliberately package inseparable cycles as one release.

Cache verified bytes by content hash as an optimization. Cold recovery must work without caches or project servers. Bound reads, responses, expanded bytes, graph size and execution resources. Release frames, object URLs and workers when a module closes. A sandbox is a containment measure, not a guarantee against every browser flaw or resource-exhaustion attack. [Browser sandbox reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe).

Keep three kinds of persistence separate:

1. **Program memory:** immutable code and assets in archive chunks.
2. **Application state:** namespaced records keyed by NFT/module/schema, with expected-head writes and explicit migrations.
3. **Personal journal:** the existing attributed `MemoryLedger`, with publication/encryption choices kept explicit.

Small app state can live directly in a state contract. Large snapshots can use immutable chunks plus a committed descriptor, with state heads activated only after all required bytes exist. Store required recoverable bytes onchain; a hash alone is not storage. Private payloads require client-side encryption and recoverable keys. Selling the NFT cannot make a previous holder forget plaintext they already knew.

For upgrades, prepare new immutable state first, then atomically select the release and compatible state root. A failed migration must leave the old selection intact. Reopening old code must not imply reversal of payments or restoration of incompatible state; support explicit historical branches where necessary.

## What I would implement, in priority order

Everything below is proposed work. Existing primitives should be reused instead of reimplemented.

| # | Priority | Addition | Concrete outcome |
|---|---|---|---|
| 1 | P0 | Legacy cartridge compatibility fixture | Prove new content executes in the exact already-minted runtime |
| 2 | P0 | Chunk-backed cartridge registry | Larger self-contained onchain tools without reminting the master NFT |
| 3 | P0 | Immutable release manifest and validator | One exact definition of program, dependencies, host compatibility and permissions |
| 4 | P0 | Module packaging/build command | Produce archives, dependency lock data, hashes and unsigned deployment plans |
| 5 | P0 | Original-experience regression fixture | Verify installation does not silently change the original art, music assets or core state |
| 6 | P1 | Per-NFT installation registry | Owner-selected versions, install/disable history, stale-review rejection and pagination |
| 7 | P1 | Recoverable extension workbench | A host that existing NFT holders can use and future editions can embed |
| 8 | P1 | Lazy verified dependency loading | Download only the selected module and its dependencies; reuse cached verified bytes |
| 9 | P1 | Unified onchain package recovery | Recover full capability/request data as well as HTML, instead of relying on an unsaved deliverable JSON |
| 10 | P1 | Versioned capability bridge | Explicit identity/snapshot/state reads and reviewed transaction proposals; no implicit wallet authority |
| 11 | P1 | Namespaced module state | Persistent saves without one extension overwriting another's data or the personal journal |
| 12 | P1 | Migration and version-history UI | Preview changes, activate compatible state, disable modules and reopen supported earlier versions |
| 13 | P1 | Transfer and revocation handling | Retain intended NFT-owned content/state while retiring previous-owner permissions |
| 14 | P1 | Onchain service discovery | Machine-readable capabilities, addresses, versions, signatures and bounded catalog queries |
| 15 | P1 | Independent full recovery command | Rebuild installed releases and state from public chain data, without a deployer key |
| 16 | P1 | Incremental deploy/recovery receipts | Record public hashes, addresses and completed transactions; detect conflicts and resume deliberately |
| 17 | P1 | Resource and deployment budgets | Enforce code/initcode/read/response bounds; measure bytes, latency, memory and incremental cost |
| 18 | P1 | Adversarial lifecycle suite | Corruption, incompatible dependencies, malicious messages, stale permissions and failed migrations |
| 19 | P2 | Portable module SDK and conformance suite | Developers can build a compatible brick independently of ANIMA's source-tree layout |
| 20 | P2 | Reusable typed visual/audio parts | Owner-selected interior additions with separate presentation state and a preserved original view |
| 21 | P2 | Explicit journal integration | Optional, correctly attributed memories of module use; public/encrypted choice before publishing |
| 22 | P2 | Release provenance and compatibility reports | Show source/build identity and verified test results without implying that a hash is an audit |

P0 establishes the central promise. P1 makes it a usable and recoverable module system. P2 expands its creative and developer capabilities after the foundation works.

## What the reference repository contributes

Reviewed `venividis/Most-Advanced-NFT-Possible` at default-branch commit [`22671108d7bb7a1675f1f3f1dce31f16282259b1`](https://github.com/venividis/Most-Advanced-NFT-Possible/tree/22671108d7bb7a1675f1f3f1dce31f16282259b1). Its included ANIMA snapshot was not treated as a substitute for reading this revision.

| Reference idea | Evidence/status at that revision | ANIMA decision |
|---|---|---|
| Bytecode shards and browser decompression | Implemented in [Engine.sol](https://github.com/venividis/Most-Advanced-NFT-Possible/blob/22671108d7bb7a1675f1f3f1dce31f16282259b1/src/Engine.sol) and [build-engine.mjs](https://github.com/venividis/Most-Advanced-NFT-Possible/blob/22671108d7bb7a1675f1f3f1dce31f16282259b1/tools/build-engine.mjs) | ANIMA already has more granular archive/version/dependency machinery. Retain it. |
| Machine-readable services | Implemented in [PageManifest.sol](https://github.com/venividis/Most-Advanced-NFT-Possible/blob/22671108d7bb7a1675f1f3f1dce31f16282259b1/src/PageManifest.sol) | Adapt explicit signatures, selectors, capabilities and identity context to module discovery. |
| Separate front door and pages | Implemented in [Premises.sol](https://github.com/venividis/Most-Advanced-NFT-Possible/blob/22671108d7bb7a1675f1f3f1dce31f16282259b1/src/Premises.sol) | A separately recoverable workbench can serve the same NFT. Its own immutable route table is not an unlimited plug-in mechanism. |
| Rebuild deployment records from public pointers | Implemented in [recover-record.mjs](https://github.com/venividis/Most-Advanced-NFT-Possible/blob/22671108d7bb7a1675f1f3f1dce31f16282259b1/tools/recover-record.mjs) | Extend ANIMA's existing runtime recovery to module catalog/state and conflicting deployment pointers. |
| Small typed parts and shared runtimes | Proposed in [COMPOSABILITY.md](https://github.com/venividis/Most-Advanced-NFT-Possible/blob/22671108d7bb7a1675f1f3f1dce31f16282259b1/COMPOSABILITY.md) | Use strict part schemas, bounded reads and separate presentation state; validate cost and isolation. |
| Permanent writings with selectable displays | Proposed in [INSCRIPTION.md](https://github.com/venividis/Most-Advanced-NFT-Possible/blob/22671108d7bb7a1675f1f3f1dce31f16282259b1/INSCRIPTION.md) | Reuse ANIMA's existing journal; borrow separation of preserved content and current display. |
| Exact-release readiness and receipts | Documented in [MAINNET_READINESS.md](https://github.com/venividis/Most-Advanced-NFT-Possible/blob/22671108d7bb7a1675f1f3f1dce31f16282259b1/MAINNET_READINESS.md) | Tie evidence to exact release artifacts, rehearse recovery and keep production gates explicit. |

The reference's proposed `Etch`, `Cartridge`, `Gate` and `Stage` systems are not implemented contracts in the reviewed tree. Its engine can be frozen, and its collection has a renderer-change path before sealing; that does not provide a renderer-change path in ANIMA. Its readiness document identifies it as a testnet release candidate. Treat it as an architectural reference, not an audited replacement.

I would not import a lifetime inscription cap that eventually prevents future owners adding content, claims of perfect shader/browser isolation, automatic publisher-selected upgrades, or hash-only storage for data we promise to recover. The relevant learning is separation of identity, preserved bytes, selection and execution—not the addition of unrelated financial features that ANIMA already has.

## Acceptance tests before calling this solved

1. **Same NFT:** mint first, install two modules later, update one, disable it and reopen the original experience. Identity/account/core bindings and unapproved artwork state remain unchanged.
2. **Legacy compatibility:** launch the 48 KiB chunk-backed cartridge using the exact existing loader; verify ABI layout, owner binding, SHA-256, view-call budget and actual browser execution.
3. **Reuse:** unchanged payloads require zero duplicate chunk deployments in an update.
4. **Lazy loading:** opening module A fetches none of unrelated module B's payloads in the new host.
5. **Integrity:** altered chunks, wrong release hashes, missing dependencies, unsupported host APIs, malformed paths and decompression overruns fail before affected code executes.
6. **Failure containment:** a broken optional module leaves the original experience and other extensions usable.
7. **Authority:** unauthorized installs/state writes, stale approvals, former-owner grants, cross-module writes and undeclared spending fail.
8. **State:** reload and upgrade preserve the intended saves; migration failure leaves the prior release/state active; incompatible rollback is rejected or explicitly branched.
9. **Transfer:** intended public NFT-owned state remains available; old permissions stop; private key handover stays a separate action.
10. **Recovery:** a fresh client with only chain, collection/token and the explicit module-registry anchor recovers code, installation history and required state, without project-server files or private deployer credentials. A legacy token cannot advertise a newly created registry pointer it never stored; retain/export that anchor explicitly.
11. **Limits:** measure runtime and creation-code size, RPC response bytes, call gas, time to usable UI, peak memory and cleanup. Ethereum's relevant limits include 24,576 runtime-code bytes and 49,152 initcode bytes; sharding does not remove them. [EIP-170](https://eips.ethereum.org/EIPS/eip-170), [EIP-3860](https://eips.ethereum.org/EIPS/eip-3860).
12. **Release evidence:** run the relevant native contract, integration and actual-browser tests against the exact release and preserve results. This design review is not such a run.

Existing project limits remain explicit: 32 entries per functional directory, 64 MiB aggregate stored/expanded bounds, 32 KiB per journal entry and 16 leaves of up to 16 KiB per content edition. Expand the catalog above these bounded units rather than silently removing bounds.

## Source map for implementation

- `contracts/src/protocol/OnchainApp.sol`, `OnchainAppDirectory.sol`, `OnchainModuleDirectory.sol`: existing archive storage and commitments.
- `scripts/lib/runtime-modules.mjs`, `web/confluence/module-loader.mjs`: current package grouping and eager recovery.
- `contracts/src/confluence/ArtifactBinding.sol`, `cartridges/CartridgeRegistry.sol`, `cartridges/CommissionedCartridges.sol`: parent-account binding, cartridge content and acquisition.
- `web/confluence/wallet.mjs`, `web/confluence/app.js`: actual owned-cartridge read/launch route.
- `web/worlds/instruments.mjs`, `web/extensions/worlds.mjs`: separate generated-instrument host and exact proposal grants.
- `contracts/src/memory/MemoryLedger.sol`, `contracts/src/operating/EditionRegistry.sol`: existing journal and immutable published content.
- `contracts/src/core/SovereignAccount.sol`: execution, temporary allowances, adoption, grants and custody epochs.
- `contracts/src/core/IDontFuckingBelieveIt.sol`, `contracts/src/confluence/ConfluenceRenderer.sol`: immutable core renderer/runtime bindings.
- `scripts/recover-runtime.mjs`, `docs/FUNCTIONAL-ONCHAIN-MODULES.md`, `docs/genesis/extensions/WORLDS.md`: recovery and documented boundaries.

**The next concrete milestone is the 48 KiB cartridge proof against an unchanged minted ANIMA.** It tests the main promise before investing in the full installation and state system.
