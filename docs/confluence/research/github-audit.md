# GitHub source audit for the master NFT

Review date: 2026-09-06. Read-only review of both repositories supplied by the owner. GitHub plugin metadata, recursive trees, workflow runs, job logs, and local clones were used. No remote repository was changed.

## Exact sources and coverage

| Repository | Default branch reviewed | Commit | Inventory |
|---|---|---|---|
| [Cutting-edge-technologically-advanced-NFT](https://github.com/venividis/Cutting-edge-technologically-advanced-NFT) | `main` | `35a725ee817dc52ec87300a0514c95fb82045631` | 139 files, 1,539,495 bytes, 53 Solidity files, 34 branches |
| [Most-Advanced-NFT-Possible](https://github.com/venividis/Most-Advanced-NFT-Possible) | `claude/advanced-3d-nft-gui-6490lk` | `ef1b0e3ac65cf7bf3c75b023ee4043515384cff2` | 210 files, 3,280,768 bytes, 110 Solidity files, 3 branches |

Every default-branch file was acquired and hashed. Complete recursive trees are stored beside this report, together with SHA-256/source-URL manifests, source symbol inventories and file deltas for every branch head. Both trees explicitly returned `truncated: false`. All branch heads were fetched locally; these shallow clones preserve head source, not full historical commit ancestry.

This is a source-informed integration review, not a claim that every line received a formal security audit. Focused line-level reading covered the identity, accounts, session authority, render engines, launch/hook, pool, fee-routing, work, social, lock and bridge boundaries, plus architecture/readiness documents. Large research documents, generated pages, test harnesses and historical branches were inventoried and selectively examined. Existing deployment addresses and transaction receipts were read as repository evidence; their live chain state was not reverified in this review. No real transactions were sent.

Local source directories:

- `research/github/cutting-edge/`: complete default-branch ANIMA source.
- `research/github/most-advanced/`: complete default-branch IPSEITY source.
- `research/github/cutting-edge-commons/`: selected meaningful additions from the unmerged Commons branch.
- `*-source-manifest.json`: every default-branch file, git blob ID, SHA-256, size and immutable source URL.
- `*-branch-deltas.json`: all branch head identities and file changes against the inspected default branch.
- `*-symbol-inventory.json`: contract/library/interface names and function inventories.

## What each project actually contributes

ANIMA is strongest as an accountable agent protocol. IPSEITY is strongest as an NFT that emits its own executable interface and contains a practical economic system. The requested IDFBI project should remain the visual and ownership foundation. These repositories contribute separable economic and verification components, not a replacement landing page.

### ANIMA: identity, work and delegated economic execution

| Capability | Concrete source | Integration judgment |
|---|---|---|
| ERC-721 identity with manifests, declared models, brain commitments, leases, lifecycle and fingerprints | `contracts/core/AnimaAgent.sol`, `contracts/interfaces/IAnima.sol` | Useful reference for explicit capability/state boundaries. Avoid replacing IDFBI identity with a second unrelated core token. |
| Immutable diamond partition | `contracts/diamond/*`, `sdk/src/index.ts::deriveFacetCut` | Constructor-fixed selector routing and ABI coverage checking are useful if master code exceeds EIP-170. This is not a freely upgradable diamond. |
| Token-bound account | `contracts/account/AgentAccount.sol` | Execution, batched calls, audit hash chain, session keys, ERC-1271 and an ERC-4337 path are concrete. Adapt authority rules carefully; see ownership-epoch issue below. |
| Token-specific trading budgets | `contracts/market/AgentSwapRouter.sol` | Strong reusable pattern: native-value limits alone do not restrict ERC-20 spending. Verify recipient balance deltas, temporarily approve exact input, clear approval, return only this swap's residual input. |
| Agent jobs with enforceable settlement | `contracts/work/WorkEscrow.sol` | Offered → Active → Delivered/Disputed → Settled/Cancelled; collateral reservation, deadline defaults, review window, validator chosen at offer, snapshotted payee. Useful for creator commissions, agent work and game-building bounties. |
| Inference/payment channels | `contracts/work/InferenceMeter.sol` | Escrow once, accept cumulative EIP-712 vouchers, settle receipt batches with request/response/model hashes, allow delayed closure. Suitable for usage-based agent services; not proof of model intelligence. |
| Collateral, reputation and validation | `contracts/registry/BondVault.sol`, `ReputationRegistry.sol`, `ValidationRegistry.sol` | Distinguish settled/attested work from self-asserted reputation. Keep validators and bonded coverage visible as separate facts. |
| Signed NFT market and rental | `contracts/market/AgentMarket.sol` | Noncustodial EIP-712 orders with integrity snapshots. Preserve expected account state and mutable NFT fingerprint at quote/settlement. |
| Agent token and curve launch | `contracts/market/AgentToken.sol`, `AgentLaunchpad.sol` | Redemption treasury and curve accounting are real, but their fixed economic choices conflict with the owner’s requested flexibility. Adapt, do not copy policy. |
| Revenue policy commitments | `contracts/economy/RevenueRouter.sol` | Snapshot accepted fee policy so later changes cannot rewrite existing agreements. Useful pattern; fixed asset and mandatory allocation limits must not silently become master policy. |
| Private/paid communications | `contracts/comms/AgentComms.sol`, `core/EncryptionKeyRegistry.sol`, SDK envelope hashes | Priced inboxes, replies, refunds, public broadcasts and committed ciphertext transports. Encryption happens in clients; public-chain ciphertext is not deletion or retroactive secrecy. |
| External identities and roles | `AgentHandles.sol`, `AnimaBindings.sol`, `AnimaRoles.sol` | Useful connection layer for a master NFT and its agent identity. Binding does not itself transfer every account permission. |
| Escrow-and-mirror bridge | `contracts/omni/OmniAgentHome.sol`, `OmniAgentMirror.sol`, `AnimaOApp.sol` | Keeps home-chain accountability but does not migrate account assets. Treat as a separate explicitly configured module. |
| Canonical machine interface | `schemas/anima-agent-manifest-v1.schema.json`, `sdk/src/index.ts`, `cli/anima.mjs`, `public/llms.txt` | Canonical JSON commitments, receipt roots, private-envelope domain separation, audit replay and typed order/voucher schemas are practical reusable foundations. |

Important ANIMA source links:

- [AgentAccount](https://github.com/venividis/Cutting-edge-technologically-advanced-NFT/blob/35a725ee817dc52ec87300a0514c95fb82045631/contracts/account/AgentAccount.sol)
- [AgentSwapRouter](https://github.com/venividis/Cutting-edge-technologically-advanced-NFT/blob/35a725ee817dc52ec87300a0514c95fb82045631/contracts/market/AgentSwapRouter.sol)
- [WorkEscrow](https://github.com/venividis/Cutting-edge-technologically-advanced-NFT/blob/35a725ee817dc52ec87300a0514c95fb82045631/contracts/work/WorkEscrow.sol)
- [RevenueRouter](https://github.com/venividis/Cutting-edge-technologically-advanced-NFT/blob/35a725ee817dc52ec87300a0514c95fb82045631/contracts/economy/RevenueRouter.sol)
- [SDK](https://github.com/venividis/Cutting-edge-technologically-advanced-NFT/blob/35a725ee817dc52ec87300a0514c95fb82045631/sdk/src/index.ts)

### IPSEITY: a token that carries the instrument and the economy

| Capability | Concrete source | Integration judgment |
|---|---|---|
| Editable geometric identity | `src/Ipseity.sol`, `src/lib/Types.sol` | Six 16-bit plane angles, 16-bit w offset, 8-bit form and 8-bit hue fit in 128 bits. `commit` updates geometry and emits metadata changes. Add immutable identity influence when adapting; editable geometry alone cannot guarantee distinct appearances. |
| Live 4D instrument | `engine/ipseity.html` | Real WebGL2 SDF rendering, not an image. Six-plane 4D rotations, eight forms, camera/picking, temporal accumulation, bloom pyramid, quality tiers, idle convergence, reduced-motion handling and nested frame throttling. |
| On-chain app payload | `src/Engine.sol`, `Renderer.sol`, `lib/SSTORE2.sol`, `tools/build-engine.mjs` | Store gzip/minified engine in bytecode shards, inject token state before startup, emit self-contained `data:` HTML through metadata. Freeze shards and renderer independently after verification. |
| On-chain visual metadata | `src/Sigil.sol`, `Renderer.sol`, `lib/Trig.sol` | Deterministic Solidity 4D projection and SVG, including four orthographic elevations. Keep preview, public SVG and live state driven from the same genome. |
| Website routes | `src/Premises.sol`, `Page*.sol`, `Desk*.sol`, `Chrome.sol` | Actual request routing and HTML generated on chain; pages cover swaps, launches, pools, locks, leases, market, chat, groups, keys, names, estate and services. These are distinct from the instrument renderer. |
| Working account with timed seal | `src/IpseityAccount.sol` | Measured asset manifest, post-call balance invariants, token/NFT guards, session execution, transfer counter binding and owner attestation controls. Adapt bounded manifest semantics; no universal guarantee over unlisted or dishonest assets. |
| Permanent receiving account | `src/GripVault.sol` | A separate salt gives an account with no exit/execute function. Optional permanent provenance/custody mechanism, not a default vault destination. |
| NFT-owned market | `src/Pool.sol`, `lib/Curve.sol` | Single-owner liquidity, virtual-reserve constant product, owner-set fee, reserve custody following NFT ownership, explicit curve synchronization and ratcheting bond. No shared LP ownership. |
| Standard DEX integration | `src/Venue.sol`, `DeskUni.sol`, `DeskTrade.sol`, `PageSwap.sol` | Venue introspection, v3 fee/range/quote configuration and v4 capability reporting. Addresses are chain-specific constructor/configuration inputs. |
| Token and hook factory | `src/Kiln.sol`, `src/Facet.sol`, `lib/Hook.sol`, `PageLaunch.sol` | Concrete fixed-supply token deployment, CREATE2 hook address search, permission-bit equality checks, Gate hook and geometry-driven dynamic fee Facet hook. Pool initialization and liquidity provision are separate transactions to the configured Uniswap contracts. |
| Time locks | `src/Locker.sol` | ERC-20 positions measured on arrival; transferable claim ownership; extensions only; 10-year maximum in this implementation. Can give a lock position to the NFT’s account so the claim follows the NFT. |
| Paid rentals | `src/Lease.sol` | Per-NFT terms, escrowed rent, earned balance follows NFT, refund logic for broken leases. Native-currency implementation with no protocol fee; configurable alternate lease agents are part of the design. |
| Asset-aware custody market | `src/Consign.sol` | Custody/listing and payment splitting are separate from ANIMA’s signed-order model. Useful as an alternative market adapter, not the same flow. |
| Succession | `src/Succession.sol` | Last-seen/grace/claim stages with heir and chain-observed activity. Separate optional user-selected module. |
| Native social graph | `src/Parley.sol`, `Roster.sol`, `DeskTalk.sol`, `PageTalk.sol`, `PageRooms.sol` | Commons, groups and pairs. Back-linked block/event heads support narrow log walks without a range-scanning indexer. Owner/account may speak; renter lacks speech authority. |
| Cross-chain speech | `src/ParleyPort.sol` | Federation relays commons speech separately from local speech. No NFT custody bridge in this system. Correct endpoint ABI and once-configured security are explicit concerns. |
| Naming and program discovery | `src/Nameplate.sol`, `PageManifest.sol`, `PageKeys.sol`, `PageKey.sol`, `PageTerminal.sol` | ENS-style routes, services manifest with selectors derived on chain, bounded session key discovery/check/act/revoke. Preserve one semantic registry for both visual and programmatic access. |

Important IPSEITY source links:

- [Engine source](https://github.com/venividis/Most-Advanced-NFT-Possible/blob/ef1b0e3ac65cf7bf3c75b023ee4043515384cff2/engine/ipseity.html)
- [Packed geometry](https://github.com/venividis/Most-Advanced-NFT-Possible/blob/ef1b0e3ac65cf7bf3c75b023ee4043515384cff2/src/lib/Types.sol)
- [Geometry-derived market](https://github.com/venividis/Most-Advanced-NFT-Possible/blob/ef1b0e3ac65cf7bf3c75b023ee4043515384cff2/src/lib/Curve.sol)
- [Launch/hook factory](https://github.com/venividis/Most-Advanced-NFT-Possible/blob/ef1b0e3ac65cf7bf3c75b023ee4043515384cff2/src/Kiln.sol)
- [Dynamic fee hook](https://github.com/venividis/Most-Advanced-NFT-Possible/blob/ef1b0e3ac65cf7bf3c75b023ee4043515384cff2/src/Facet.sol)
- [Account](https://github.com/venividis/Most-Advanced-NFT-Possible/blob/ef1b0e3ac65cf7bf3c75b023ee4043515384cff2/src/IpseityAccount.sol)
- [Parley](https://github.com/venividis/Most-Advanced-NFT-Possible/blob/ef1b0e3ac65cf7bf3c75b023ee4043515384cff2/src/Parley.sol)

## Additional branch worth preserving

ANIMA’s default branch does not contain all useful existing work. `upgrade/sanctuary-commons-3d-20260904` at `80312cdb27d2a87fe12afee3b953463d48f37328` adds 28 changed files, including `contracts/comms/AnimaCommons.sol` and `src/commons/*`.

`AnimaCommons` is a concrete public social contract with circles, membership/invitations, moderators/bans, slow mode, typed posts, replies, revisions, withdrawal/tombstone flags, reactions, accepted answers, links to work jobs and a history commitment. It does not custody money. Optional agent attribution snapshots the current agent owner and state fingerprint. Human membership and stewardship remain tied to wallet principals. This avoids transferring a human’s prior social identity merely by selling an NFT.

Its WebGL sanctuary contains procedural geometry, projected HTML labels, camera manipulation, context loss handling, reduced motion and a CPU perspective fallback. It uses one fixed scene seed and therefore is not itself the requested per-mint unique world. The model ships clearly tagged sample/local data; local drafts and UI state are not on-chain records. The base master can reuse its validation and wallet-versus-token social distinction without importing the sample people or static garden as the final experience.

[Commons source at exact branch head](https://github.com/venividis/Cutting-edge-technologically-advanced-NFT/blob/80312cdb27d2a87fe12afee3b953463d48f37328/contracts/comms/AnimaCommons.sol)

`fix/utility-workflows-20260904` adds an apply workflow and opaque utility payload parts on top of this source. Those workflow payloads are not needed for product integration. `build/idfbi-isolated-toolchain-20260904` adds only a workflow. Most-Advanced’s `idfbi-isolated-ci-20260904` is likewise an isolated IDFBI testing branch, not the main IPSEITY engine implementation.

## Boundaries that must survive the combination

### Owner-defined economics

The owner explicitly requested arbitrary fee recipients, allocation manners and payout tokens. Several upstream rules are author preferences rather than required protocol mathematics:

- ANIMA `AgentLaunchpad` fixes one immutable `QUOTE` asset, permits one launch per agent, fixes a three-leg fee split and caps combined base fees at 3%; the split is globally owner-configurable, not a per-launch arbitrary recipient list.
- ANIMA `RevenueRouter` fixes `ASSET`, requires at least 50% operating allocation, caps referrals at 5% and uses named treasury/bond/referral/commons destinations with a 2-day policy delay.
- IPSEITY `Kiln` intentionally only manufactures fixed-supply tokens and two built-in hook recipes; custom existing token/pool addresses are a separate route.
- IPSEITY `Pool` uses one market and one liquidity owner per NFT, with no LP share accounting.
- IPSEITY `Locker`, Reach seal, market bond and session grants each impose particular maximum terms.

Do not present these choices as universal restrictions in the master builder. Preserve necessary accounting properties—allocation totals, integer arithmetic, explicit rate denominators, refund/output invariants and quote commitments—while making user economics explicit configuration. Conversion into a different payout asset additionally requires a real route, allowance, price quote, minimum output and deadline; changing a display symbol is not a conversion.

### Transfer and delegated authority

IPSEITY binds sessions to a monotonic NFT transfer counter and revokes allowlist epochs on regrant/revoke. ANIMA’s core increments an operator epoch, but its `AgentAccount` sessions and allowed-call map bind to `grantedBy`/current owner address. Static inference: an A → B → A ownership round trip can restore an unexpired old A account session when A restores active status/policy. This was not reproduced by an EVM test in this review; it is a visible distinction in the authorization predicates. Use monotonic ownership epoch binding throughout the master’s session grants, policy references, signatures and authority-bearing configuration. Address equality is insufficient to prove unchanged ownership history.

Both source accounts document that native-value caps do not bound ERC-20 spending. IPSEITY’s independent target and selector allowlists authorize the Cartesian product, not exact target-selector pairs. Master policy should express exact pairs when that is what the owner chooses. ANIMA’s target leaves already represent `(target,selector)` pairs.

### Geometry and economic behavior

IPSEITY’s pool copies the accepted section and allows only the holder to synchronize it. This closes the case where an ERC-4907 renter changes artwork and thereby reprices the owner’s reserves. A master particle animation must not implicitly authorize price, fee or permission mutations. An owner can intentionally commit an economic geometry rule; the preview must show which economic field that rule controls.

IPSEITY’s `Facet` reads live geometry to override a v4 dynamic fee inside owner-selected floor/ceiling parameters. Its callback rejects a non-dynamic-fee pool, sets the v4 override bit, and returns zero accounting delta. It does not distribute arbitrary fees into arbitrary output assets. That distribution is additional implementation work.

The geometric market uses `(x + vx)(y + vy) = k`; virtual reserves are an approximation of section-dependent concentration. It is not an oracle. Actual balances still bound outputs. A visually sophisticated curve must retain monotonicity/convexity, safe integer rounding and minimum-output checks.

### Unique experiences, equal functions

IPSEITY derives a seed from block data, sender, contract and token ID; this is not unbiased VRF randomness. Mutable geometry may be set identically on two tokens. Per-mint uniqueness should therefore be rooted in an immutable domain-separated genome, with contract/chain/token identity included, which continuously influences particle topology, ornament, trajectories, material, sound and spatial arrangement even after users edit geometry.

Keep one stable capability registry independent of genome. A token’s visual realization can rearrange the routes, yet `swap`, `launch`, `lock`, `social`, `memory`, `game`, `market`, `agent`, and other actions must resolve to the same definitions, validation and adapter methods. A searchable semantic fallback is necessary when a unique spatial arrangement makes a function hard to find. The user asked for equal functions, so random rarity must not remove functionality.

### Holding NFTs and running games

Both token-bound accounts can receive ERC-721/ERC-1155 assets. That proves holding, not safe execution of arbitrary nested HTML or games. IPSEITY’s Nest loads the same tokenURI recursively with `MAX_DEPTH = 3`; it is not a general game package runtime. A master cartridge should separately declare content hash, renderer entry point, version, deterministic simulation schema, save-state format and requested capabilities. Wallet/account authority must remain outside untrusted game frames and require the owner’s selected grant. Never equate owning a game NFT with executing its content as privileged application code.

### On-chain boundaries and privacy

On-chain byte storage can make the interface reproducible, but a preview hosted from ordinary files is not yet an inscribed deployment. RPC availability, gas ceilings, wallet injection and browser decompression/WebGL support remain operational dependencies. The chain stores data and commitments; the browser performs rendering and most game simulation.

Public chain state and plaintext logs remain readable even when only an owner may execute writes. Owner-only UI controls cannot make public data secret. ANIMA’s NullTransferVerifier returns true and only claims a commitment-level policy. Its attester quorum verifier verifies signed attestations; it does not independently verify hardware quotes on chain. IPSEITY’s ERC-7857-inspired kernel is explicitly not a full conformance claim and deployment without a verifier refuses proved transfer/clone operations.

## Readiness evidence, observed rather than repeated

| Check | Result and scope |
|---|---|
| GitHub metadata/tree/branch acquisition | Both accessible; complete default branch file sets acquired; all branch heads inventoried. |
| ANIMA current default-branch CI | Latest run at the inspected head compiled and passed production dependency audit, then failed one node test at `test/FiatMintGateway.test.ts:42` due to lowercase versus checksum-case address comparison. This is not evidence of a transfer failure. [Run](https://github.com/venividis/Cutting-edge-technologically-advanced-NFT/actions/runs/33949874219) |
| IPSEITY CI | The sole returned workflow run was on `idfbi-isolated-ci-20260904`, not the default branch. It failed compiling isolated `contracts/renderer/ImpossibleRenderer.sol:130` because `" · XP "` lacked Solidity’s Unicode string prefix. It does not establish IPSEITY default source compilation status. [Run](https://github.com/venividis/Most-Advanced-NFT-Possible/actions/runs/33923797961) |
| IPSEITY local cryptographic/encoding selftest | `node tools/selftest.mjs`: 55 passed, 0 failed. This checks functions lifted from the actual inline engine. One 136-byte keccak case is a self-consistency check rather than an independent reference vector; do not treat it as independent cryptographic validation. |
| ANIMA economic model tests | `node --test test/EconomySim.test.mjs`: 4 passed, 0 failed. Determinism, conservation/domain, anti-abuse tradeoffs, invalid controls. These are local simulation tests, not market outcome predictions. |
| Full local Solidity builds/security suites | Not rerun as part of this read-only integration audit. Existing passing historical test counts are not substituted for current verification. |
| Mainnet readiness | Not established. ANIMA records live testnet exercises, but launch graduation used `MockLiquidityDeployer`, swaps `MockVenue`, derivatives `MockPerpVenue`; these do not establish external venue integration. Existing deployment keys may be unavailable according to repository documentation. |

Exact workflow logs and local test output are saved beside this report. The existing test suites contain valuable failure cases—recipient balance delta, reentrancy, ownership transfer, session revocation, same-address buyback, cross-chain ABI, seal measurement and curve bounds—but test count alone is not an audit.

## License and provenance

ANIMA has a repository MIT `LICENSE`, copyright 2026 ANIMA contributors, and MIT SPDX headers in Solidity. Preserve that license and attribution if copying substantial code. Its OpenZeppelin/Solady dependencies have their own notices and should remain tied to the resolved lockfile.

IPSEITY Solidity files carry MIT SPDX identifiers. No root `LICENSE` file was present in the complete inspected default tree, and its package metadata does not provide a license field. Keep file-level identifiers and origin/commit attribution; do not invent a broader license grant for unmarked engine/document files. The user owns the source repository and requested combination, but upstream source notices must still be preserved. Any extracted/adapted functions should be named in the master’s NOTICE with exact origin and revision.

Minimal Uniswap/LayerZero-compatible interfaces are not the same as bundling those protocols’ implementations. This review did not acquire or relicense their source. Do not add upstream protocol source without preserving its applicable license/version provenance.

## Concrete integration order

1. Preserve IDFBI core identity, memory and particle experience. Add a stable capability manifest and separate user-selected genome from authority-bearing configuration.
2. Make the central particle object morph into spatial entry points while every action uses the same deterministic validation/model path as its accessible form.
3. Adapt measured swap outputs, token-specific budget accounting, exact temporary approvals, immutable quote parameters and transfer-epoch authority reset.
4. Expose user-defined launches, fee recipients, payout assets and hook settings. Use v4 hook flag/CREATE2 verification and show concrete deployment/calldata stages.
5. Add ERC-20 lock positions and NFT holdings/game cartridges with explicit ownership and capability boundaries. Persist memory commitments and activity-driven morphology without forging chain activity from a local preview.
6. Use Parley’s bounded log-walk transport for NFT speech and Commons’ wallet/agent attribution distinction for human social identity. Connect commissions to real job escrow state machines when deployed.
7. Add agent work, usage receipts, marketplace settlement fingerprints, name resolution and cross-chain modules as adapters with chain-specific capability checks.
8. Build the self-contained engine archive and measure shard/runtime byte sizes; only call it on chain after actual deployment, byte verification and route loading succeed.

The strongest combination is a singular visual organism with explicit economic instruments behind it. The architectural gain comes from retaining the useful invariants in these sources while removing duplicate identities, contradictory fee policies, static demo facts and unsupported readiness claims.
