# ANIMA cleanup audit — integrations and historical documentation

Reviewed the extracted attachment at `review/ANIMA-NFT--752926ec2bc8cdc405ee5462aeb8bca4646c73f4`. No project source was changed. This is a source/dependency/packaging review, not an independent smart-contract security audit or a current public deployment verification.

## Scope and evidence limits

- Complete path, size, extension, import and duplicate inventory for `integrations/`, except substantive v4-hook review delegated to the v4 agent. Assigned integrations comprise **486 files, 6,009,445 bytes**. The full integrations directory is 1,122 files / 36,921,747 bytes; v4-hook alone contributes 636 files / 30,912,302 bytes.
- Inventoried the 51 non-Genesis `docs/` files, 732,411 bytes. Read the main historical architecture, protocol, security, deployment, API, Confluence architecture/validation/provenance and relevant donor audit reports. Scanned all other historic Markdown headings and implementation/absence/change statements.
- Read source in detail for chain adapter types/EVM/profile/descriptors; both MessageChannel implementations; standalone ArtifactAccount/AWEArtifact; PrismRelay; DaveVault/SiteKernel and relevant BagRenderer paths; IPSEITY Engine/GripVault/Facet/Types/Curve; ANIMA AgentAccount authority/validation paths and RevenueRouter; source/package build configuration and active dependency references. Reviewed source-level findings against current files where described below.
- Inventoried all donor source/test/tool files and scanned Solidity imports and license headers. The large IPSEITY Page/Desk suite, all donor tests and all old rendering code were **not line-by-line re-audited** in this pass. Existing audit documents contain broad historical reviews, but their claims are not substituted for work executed now. Third-party Solady source was inventoried and compared by hash, not independently security audited.
- No donor deployment transactions were sent, no remote balances or explorer claims were checked, and no browser/GPU review of donor renderers was performed.

## Main conclusion

The integration tree is principally a source museum surrounding a smaller active application. Preserve its useful ideas and provenance, but remove it from the distributable runtime and main development surface. **Do not delete `integrations/console/protocol/v4-hook`: it is actively consumed by the current build.** The other donor folders have no direct root runtime/compiler imports in the searched authored scripts/contracts/web/package paths. Their actively adopted parts have been copied/adapted under `contracts/src/confluence` and `web/confluence`.

`scripts/compile.mjs` recursively compiles `contracts/src`, not donor sources. `package.json:61–62`, `scripts/build-v4.mjs` and `scripts/v4-deployment.mjs` explicitly reach into v4-hook. Search used strict authored code directories and omitted bundled output to avoid counting embedded historical text as a live dependency.

## Cleanup decisions

| Material | Recommendation | Reason / evidence |
|---|---|---|
| `integrations/github/most-advanced` | Preserve as a separate, versioned reference archive; remove from ordinary runtime/source distribution | Competing IPSEITY collection, account, render stack, web server and economy; no root import. 210 files / 3,280,768 bytes. All 210 files match the stored source manifest hashes exactly. |
| `integrations/github/cutting-edge` | Preserve as a separate, versioned reference archive | Competing AnimaAgent monolith AND immutable diamond, account, bridge and economy; no root import. 139 files / 1,539,495 bytes. All 139 match stored manifest hashes. |
| `integrations/github/cutting-edge-commons` | Preserve as a **partial branch extract**, or recover a reproducible donor snapshot before calling it buildable | 15 files / 197,438 bytes; its `AnimaCommons.sol` imports missing local `../interfaces/IAnima.sol` and `../work/WorkEscrow.sol`; no package manifest. Current test cannot load `viem` here. |
| `integrations/dave` | Preserve as a **partial, defective reference extract**, never merge wholesale | 50 files / 486,269 bytes. Missing internal libraries contradict the retained audit's restored-source claim. Known global-seal weaknesses still visible, hardcoded toll policy differs from user requirements. |
| `integrations/console/protocol/fee-router` | Keep canonical adopted production sources; archive duplicate donor package and its original tests/evidence | OwnerFeeRouter, OwnerLaunchFactory and ISettlementConverter are byte-identical to current `contracts/src/confluence/fees` copies. |
| `integrations/console/protocol/runtime-contracts` | Keep canonical adopted cartridge/item sources and binding adapter; archive standalone competing root/account package | CartridgeRegistry is byte-identical to active counterpart. Standalone AWEArtifact/ArtifactAccount is a separate identity/account ABI. |
| `integrations/console/protocol/chain-adapters` | Keep as a small optional SDK only if actively adopting its bridge; otherwise archive with tests | Real useful EVM/profile/bridge code, but not wired to current application. Solana/Sui/Starknet are planned descriptors, not execution adapters. |
| `integrations/console/protocol/onchain-game` | Keep as optional game reference/adapter, with clear independent deployment status | Real bounded PrismRelay rules contract, but standalone and not root-compiled. No timeout/resignation; every move requires a transaction. |
| `integrations/console/lib` | Preserve useful pure rules/encoding functions once; archive old server/UI wrappers | console-core, PositionManager encoder, hosted Console API are separate integration models, not automatically active functionality. |
| `docs/v1.*`, `docs/legacy-1.2`, `docs/confluence` | Consolidate into versioned historical documentation with an index; preserve original audits and evidence | Historical status statements conflict with current release when presented as operational instructions. |
| Root `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/AGENT_API.md`, `NOTICE.md` | Replace operational front doors with verified current content and link archived originals | Specific stale/contradictory statements below. |

## Concrete findings

### 1. Dave snapshot completeness regressed after an earlier audit

`docs/confluence/research/dave-audit.md` says all 32 Dave Solidity sources were read and the missing `src/lib` directory was recovered. **The present ZIP has only 23 `src/*.sol` files**, no `src/lib` and no `src/vendor`. Import scan identifies absent Tiers, AccountFooter, Interfaces, Curves, Oracles, Timelock, ERC20/ERC721/ERC4626 mocks and other expected donor paths. `README.md` still advertises these libraries and registry files.

Do not say the attachment holds a complete buildable Dave v1.8 just because an older audit had that source. Record partial coverage explicitly, retain its originating archive/hash if recoverable, and avoid duplicating broken skeletons in the working application.

### 2. Dave's assumptions should not become ANIMA defaults

`DaveVault.sol:36–37` fixes 4.20% early-exit tax and 69% pool share. Most economic desks fix 42 bps tolls and 69/31 beneficiaries. The README describes four mandatory seal tiers, captive venues and whole-account restrictions. These are product policy choices, not first-principle requirements.

Prefer current owner-configured fees/recipients, individual escrowed locks and isolated experimental cells. Keep the useful principles: obligations survive later owner choices; content ownership does not grant spending authority; committed funds remain distinct from spendable funds; assets and payments use exact units.

The actual donor remains unsafe to adopt unchanged: `DaveVault.acknowledge` is permissionless; `_bags` caps at 32 with no removal; `ragequit` hard-requires every listed token's balance/transfer, so junk or failing tokens can block early exit. The view and execution code still lacks a batch ERC1155 receiver and account-level reentrancy guard. These defects are confined to the dormant donor, not demonstrated vulnerabilities in current ANIMA.

`BagRenderer` still embeds one fixed RPC and evaluates the returned runtime via `new Function`; it calls selector `0x9a3b6c14` while retained prior audits record actual `runtime()` selector `0x54d75aa6`. `SiteKernel.runtime()` concatenates every mutable chunk; current bounded, immutable archive design is the better reusable foundation. The separate V2 document is a design proposal, not a supplied repaired implementation.

### 3. Multiple account/manifest protocols are incompatible

- Chain SDK `prepareAccountExecution` encodes `execute(address,uint256,bytes,uint8)` and reads `token()` (ERC6551-style).
- Console standalone account exposes `execute(address,uint256,bytes)` and `artifact()/artifactId()`.
- Main ANIMA uses its own SovereignAccount methods.
- Dave uses `vaultOf()/bearer()` and footer identity.
- IPSEITY has Reach, permanent Grip and a separate NFT-owned pool.

Retain one main identity/account architecture and explicit typed adapters. Do not flatten these into one generic adapter by renaming functions.

The Console v1 manifest and richer SDK both say `awe.cartridge/1` but use different fields and settlement meanings. The package correctly implements explicit lossy conversion and tests it. If this SDK becomes active, use distinct profile identifiers or fully normalized canonical schema, retaining the conversion's warnings and hash-byte-scope requirement. A proof-verified SDK manifest projected to the Console's broad `onchain` flag no longer carries the proof requirement.

### 4. Owner-address equality is weaker than ownership epoch

ANIMA donor `AgentAccount._enforceSession` and `_enforceSessionMemory` use `s.grantedBy != owner()`; allowlists are namespaced by owner address. There is no ownership epoch inside the session. After A→B→A, an unexpired A-granted session can become eligible again once status/policy are restored. This is a source-derived conditional finding, not an EVM exploit reproduced in this pass. Preserve monotonic transfer-epoch authorization in the current system; do not replace it with donor code.

Similarly, `RevenueRouter.policyOf` invalidates only by `configuredBy` versus current owner. Its otherwise useful historical-policy commitment machinery comes with fixed ASSET, minimum 50% operating share, maximum 5% referral, 2-day delay and named destinations. These do not meet arbitrary per-owner economics automatically.

### 5. Retained documentation gives contradictory current instructions

- `docs/AGENT_API.md:90–99` advertises optional threshold signature/proof and instructs configuring `ATTESTER_PRIVATE_KEY`. `docs/confluence/ARCHITECTURE.md:50` says caller-controlled private-key attestation was removed and the planner emits unsigned proposals.
- `docs/DEPLOYMENT.md` describes v1.2 missing compiler/no lockfile/uncompiled Solidity; `docs/SECURITY.md` opens with the same stale release state. These should not be the canonical current operational docs.
- `NOTICE.md` says all other project code was authored in the repo unless stated and claims no upstream PoolManager is bundled. The archive now contains complete donor trees and v4-core/vendor sources. `docs/confluence/CONFLUENCE.md` separately acknowledges donor origin and third-party licenses.
- Many old audit documents refer to scratch paths and reports not copied to this ZIP. Keep findings with source revision/date, not as evidence of current passing builds or live deployment.

Use one maintained current status matrix: capability → actual code path → execution mode → supported configuration → evidence/check date → known limits. Archive the prior originals without editing away history.

### 6. License/provenance cleanup is a metadata correction

Both source manifests validate byte-for-byte: IPSEITY commit `ef1b0e3ac65cf7bf3c75b023ee4043515384cff2`; ANIMA donor commit `35a725ee817dc52ec87300a0514c95fb82045631`.

All scanned donor Solidity carries MIT SPDX (44 Dave Solidity including tests/script, 53 cutting-edge, 110 most-advanced, 1 commons). Cutting-edge has its own root MIT LICENSE; IPSEITY lacks a root license file and its engine/docs do not obtain broader licensing from Solidity headers. Preserve existing notices and source attribution. Do not assert every byte of the combined archive has the root license. The v4 agent owns detailed vendor-license inventory.

## High-value material to preserve

1. **OwnerFeeRouter:** claim balances attributed when funds arrive; later fee configuration cannot rewrite already-earned claims. Exact amounts and temporary conversion approvals are valuable invariants. Already adopted canonically.
2. **CartridgeRegistry and sandbox design:** hash-committed executable bytes, content/version freeze, owner/controller resolution and explicit authority separation. Already adopted; retain one implementation.
3. **MessageChannel SDK:** exact origins/source checks, per-session nonce/sequence, grant list, message-size and inflight budgets, abortable lifecycle. Its 14 tests passed freshly.
4. **PrismRelay rules:** bounded grid, deterministic legal moves, honest player scores and independent JS comparison. Optional cartridge/example is useful; its existence is not an MMO implementation.
5. **IPSEITY render/identity ideas:** packed six-plane rotations and offset/form/hue, deterministic SVG preview, onchain application shards, original SDF object family. Preserve as comparative visual reference; do not ship a competing main interface/account set.
6. **IPSEITY semantic discovery:** onchain service selectors and one human/machine action definition are useful for the requested AI-agent compatibility.
7. **IPSEITY economic geometry:** explicitly committed market parameters can affect appearance, but ordinary camera/music/gesture changes must not silently change fees, prices or permissions. Its virtual reserve arithmetic is an alternative AMM, not Uniswap v4 liquidity.
8. **Dave selective concepts:** immutable editions, obligations pinned at agreement, separate adoption/authorization, prefunded work and bounded experimental compartments. Preserve concept→current implementation mapping instead of copying old desks.
9. **Sanctuary Commons:** preserve distinction between a person's authorship/social identity and NFT controller authority, revisions/tombstones, accepted replies and explicit escrow links. A sale should not rewrite human history.

Permanent `GripVault` locking, global whole-account seals, perps/oracle desks, fixed 69/31 tolls, mock populations/balances and alternate identity roots should not enter the default experience merely because donor source exists. Keep optional experiments recoverable in references where appropriate.

## Fresh verification

Executed on Node v24.19.0 without package installation or project edits:

| Check | Result | Limit |
|---|---|---|
| Chain-adapters tests | 14 passed | EVM RPC/ABI/profile/bridge fixtures, not real wallets/chains |
| IPSEITY tools/selftest.mjs | 55 passed | Encoding/crypto/unit helpers extracted from engine; includes some self-consistency checks; not a graphics or Solidity audit |
| Cutting-edge EconomySim | 4 passed | Deterministic/conserving local economy model, not actual market prediction |
| CommonsModel | Could not load | `viem` unavailable in the extracted partial branch's dependency context |
| GitHub source-manifest hashes | 349/349 exact | Provenance integrity, not correctness |
| Adopted source hash comparison | 11 identical donor→active file pairs | OwnerFeeRouter, OwnerLaunchFactory, ISettlementConverter, CartridgeRegistry, Solady license and 6 Solady source files |

The economy test first failed when invoked from the master root because it spawns a relative script; rerunning in its proper donor working directory passed 4/4. That is a cwd assumption, not a product arithmetic defect. No attempt was made to install a second donor toolchain solely to make archival tests green.

## Proposed migration sequence

1. Freeze the attachment and its complete file manifest as the recoverable reference.
2. Define the one main product/runtime, one account authority model and one capability/status registry.
3. Move dormant donors and historical docs into a separate reproducible reference archive or development-only location, preserving commits/hashes/notices and marking partial extracts.
4. Keep active extracted source and the v4 build dependency intact; move v4 only with import/build/deployment updates.
5. Consolidate repeated code, schemas and current operational docs; identify compatible optional cartridges/SDK packages explicitly.
6. Rebuild/test the current application after relocation; confirm imports, onchain archive content, deployment artifact paths and artifact identity are unchanged where intended.

No deletions are recommended without first preserving the source and verifying the active dependency graph after the move.
