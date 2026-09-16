# AWE Open Console: source audit and integration map

Audit date: 2026-09-06. Source root: `/workspace/scratch/c7aa8be8e5c4/sources/console/awe-open-console`.

This is a read-only source review for the master project integration, not a security audit or a fresh claim of passing runtime tests. I inspected the application execution paths, all original Solidity contracts, pure rules/validation, API/storage implementation, both game bridges, EVM adapter, liquidity encoder, representative contract/application tests and supplied test evidence. Third-party vendored libraries are dependencies, not original AWE functionality; their full audit reports were not independently reassessed.

## Main finding

The Console has substantive reusable EVM ownership, cartridges, creator editions, flexible fee accounting and playable game code. Its older Realm shell contains attractive navigation and local games, but its swap, vault, social, agent and market claims are rehearsal/demo surfaces. The master project should preserve the IDFBI central object and consume the Console's independent contracts, rules and bridges. Copying the old full shell would introduce misleading simulated status, duplicate navigation and a less expressive visual core.

The Console does not implement unique root genomes, memory journaling or usage-dependent morphology. Those must come from the base project or new work. It also does not contain deployed production swap routing, production conversion, non-EVM programs, universal game compatibility or a full ERC-6551 account.

## Actual feature map

| Feature | Source and concrete behavior | Classification / integration decision |
|---|---|---|
| Root NFT custody | `protocol/runtime-contracts/src/AWEArtifact.sol`: permissionless `mint(to, metadataURI)` creates ERC721 and a new `ArtifactAccount`; `accountFor(id)` maps custody; `ownershipEpoch(id)` changes on transfer. | Implemented Solidity + browser wallet deployment. Reuse custody model or adapt to existing master NFT identity. |
| Owner execution | Same file, `ArtifactAccount.execute(target,value,data)` uses CALL, current root owner only, reentrancy guard; receives native/ERC721/ERC1155 assets. | Implemented. Full owner-selected contract calls; no prescribed business category. |
| Transfer-bound signatures | `signatureDigest(hash)` binds chain, account, ownership epoch and hash; `isValidSignature` uses ERC1271 magic value. | Implemented, but raw domain digest must be signed correctly; personal_sign is not equivalent. Third-party approvals persist across NFT ownership changes. |
| NFT nesting | Account can hold external NFTs and cartridge NFTs. Root collection forbids transfer to any of its own registered accounts via `_beforeTokenTransfer`, including unsafe transfers. | Implemented custody, not ERC7401 parent acceptance/equipment semantics; external cross-collection ownership cycles are not solved. |
| Game cartridge NFTs | `CartridgeRegistry.sol`: manifest JSON, SHA256 executable commitment, revisions, optional freeze, onchain content up to 24,576 bytes, current controller resolution through registered root account. | Strong reuse candidate. NFT ownership and game execution are correctly separated. |
| Creator ERC1155 editions | `CreatorItems.sol`: create edition, chosen standard ERC20/native price, receiving address, supply (0 means unlimited), update sale, quote revision checks, freeze metadata and transfer creator authority. | Implemented. Normal-flow tests include direct creator-selected payments and mint to an NFT account. Not an earned reward verifier. |
| Fee splits | `protocol/fee-router/src/OwnerFeeRouter.sol`: arbitrary owner-selected recipients/weights; claims attributed on deposit and retained across configuration changes; partial claims and permissionless payout to beneficiary. | Implemented. No platform percentage. Contract max 64 recipients and weight 1e18; app limit is 32 and frontend weight regex is narrower. |
| Payment token conversion | `depositConverted` and `claimConverted` use owner-enabled `ISettlementConverter`, deadline, min output and balance measurement; exact input consumed; allowances cleared. | Conversion interface/accounting is implemented, production DEX converter is absent. A preferred output token in the UI does not automatically convert each share. |
| Fixed supply launches | `OwnerLaunchFactory.sol`: `launch(name,symbol,supply,recipient,Configuration)`, standard 18-decimal ERC20 and metadata commitments to selected hook/pool policy. | Implemented. Launching does not create a pool, sell tokens, implement a curve, lock liquidity or prove a recorded hook is deployed. |
| v4 hook | `protocol/v4-hook/src/OwnerV4FeeHook.sol`: actual PoolManager before/after swap accounting, ERC6909 claims, owner fee/receiver config, permissionless historical-recipient flush. | Implemented with supplied real-PoolManager local test evidence. Exact-input full-fill only; hookData required. |
| Hook deployment | `HookCreate2Factory.sol`, `app/components/v4-workbench.tsx`: mines address permission bits, deploys chosen constructor config with CREATE2. | Implemented browser construction. Permission flags 0x00c8. No public deployment supplied. |
| Pool initialization | Workbench builds `PoolManager.initialize(PoolKey,sqrtPriceX96)`, validates sorted currencies, computes price with integer sqrt and decimals. | Real wallet operation. Requires chain-correct existing manager. Pool has no liquidity until supplied. |
| Liquidity positions | `lib/v4-position-encoder.mjs`: exact official mint/settle/sweep action encoding, explicit NFT/refund recipients, max raw amounts, deadline and Permit2 approval preparation. | Source/ABI verified in supplied evidence; actual PositionManager mint not exercised by that suite. Useful encoder, separate integration gate. |
| Prism Relay | `lib/console-core.ts`: 9×9 territory, adjacent moves, prisms worth 4, 36 move cap, pass when blocked; world connectivity checks and deterministic opponent. | Complete local game and authoritative server rules. Reuse pure functions directly. |
| Onchain Prism Relay | `protocol/onchain-game/contracts/PrismRelay.sol`: create/join/move/getMatch/getLegalMoves, authoritative board and scoring. | Complete onchain turn game, no stakes/rewards/referee. Three-match supplied test evidence compares 103 transitions. |
| Hosted multiplayer | `lib/console-api.ts` + D1 schema: rooms, hashed opaque player secrets, conditional revision updates, shared state, 1.5 second UI polling. | Implemented server-validated turn multiplayer, not realtime MMO. Requires authenticated host identity and D1 binding. |
| World workshop | Console editor paints plain/wall/prism, validates connected start corners with at least 30 traversable cells, persists document, exports JSON and playtests. | Complete for this grid world schema. Extend engine-agnostically via cartridge manifests, not by claiming arbitrary 3D worlds fit this schema. |
| Standalone Lumen Drift | `public/cartridges/lumen-drift.html`: pointer/keyboard gather 30 lights, moving hazards, 3 lives and restart. | Complete small local game, readily portable and sandboxable. Random positions are client-local; no chain reward. |
| Single HTML import | `/upload` accepts up to 1M characters; stores owner-scoped HTML. `/publish` publishes SHA256-addressed copy; authenticated users can fetch published bytes. | Implemented hosted package path. UTF8 byte limits differ from character limits; add actual byte checks if preserving the 1MB product limit. |
| Isolated runtime | `game-console.tsx`: iframe sandbox `allow-scripts allow-pointer-lock`, no same-origin privileges; CSP for srcDoc self-contained HTML, SHA256 verifies packaged/onchain bytes. | Reuse with lifecycle cleanup. Remote HTTPS frames are expressly not integrity-verified. |
| Console game bridge | Live host supports `world.read` when listed and `console.info`; source window check, per-session MessagePort. | Real narrow bridge. A manifest's other capability names do not implement/grant them. No wallet/provider handed to games. |
| Rich connection SDK | `protocol/chain-adapters/src` and `bridge/message-channel.mjs`: chain-qualified identities, unsigned transaction intents, exact-origin grant bridge, sequence/session/size/inflight limits, Godot callbacks. | Useful reusable protocol, but separate from deployed Console v1 wire format. |
| Non-EVM adapters | `src/descriptors.ts`: Solana, Sui and Starknet capabilities all `planned`, implementation `research-only`. | Specifications only, not programs or cross-chain custody. |
| Citadel exploration | `app/components/citadel-interior.tsx`: procedural first-person canvas nave, columns/pointed arches, collision, movement/turn/interaction, three shrines and portal doors, local shrine persistence. | Actual local exploration. Excellent experience idea to bind to central-object portal entry; no shared state/NFT seed. |
| Dimensional world | `dimensional-world.tsx`: perspective-projected 3D districts, WASD, orbit camera, zoom, temporal phase interpolation, sound/fullscreen, genuine 4D tesseract plane rotations projected into 3D/2D. | Actual local renderer/navigation, not historic chain replay or simulated market futures. |
| Bannerfall / Sigil / Convergence | `launch-arena.tsx`: small local scenario/counterpick/checkpoint games with scores and reset. | Reuse as optional games or teaching experiences. Scores/priority/curves/commit-reveal have no economic enforcement. |
| Marketplace | `auction-house.tsx`: static listing catalogue, local filters/favorites, three educational encounters, callback to rehearsal review. | No listing protocol, auction settlement, live inventory, or real orders. |
| Swap / vault / agent | `awe-os.tsx`: fixed SOL price/balances; computed mock quote; static positions; simulated agent plan. Confirmation only toasts. | Rehearsal. Do not expose fixed figures or simulation checks as live chain results. |
| Social | `awe-os.tsx`: fixed rooms/feed/trust metrics. Send button toasts and clears text. No persistence, send request or encryption. | Demo only, despite labels such as published, E2EE, live, compressed proofs. |
| Journal and morphology | No trade journal or memory record module. `LivingCore` draws identical 108-point Fibonacci sphere; only mode color/intensity/pointer motion vary. Console root mint metadata is identical for every token. | New work required. `Memory` shrine is a local puzzle label, not a memory/journal system. |

## APIs worth preserving

### Pure game/data module

`lib/console-core.ts` exports:

```ts
type World = { name: string; terrain: ('plain'|'wall'|'prism')[] }
type Match = {
  world: World; cells: number[]; turn: number; moves: number;
  scores: number[]; winner: number|null;
  log: {player:number; cell:number}[]
}
defaultWorld(): World
validateWorld(input: unknown): World
initialMatch(world?: World): Match
neighbors(cell: number): number[]
legalMoves(match: Match, player?: number): number[]
playMove(match: Match, cell: number, player?: number): Match
botMove(match: Match): number|undefined
validateManifest(input: unknown): Manifest
validateRoutes(routes: FeeRoute[]): FeeRoute[]
splitUnits(amount: bigint, routes: FeeRoute[]): bigint[]
```

These need no React or ethers. `splitUnits` conserves integer base units, final recipient takes rounding remainder. `FeeRoute.outputToken` is a UI preference only and is not an argument to onchain `configureSplit`.

### Root and account

```solidity
AWEArtifact.mint(address to, string metadataURI) returns (uint256 id, address account)
AWEArtifact.accountFor(uint256 id) returns (address)
AWEArtifact.ownerOf(uint256 id) returns (address)
AWEArtifact.ownershipEpoch(uint256 id) returns (uint256)
AWEArtifact.setTokenURI(uint256 id, string metadataURI)
ArtifactAccount.execute(address target, uint256 value, bytes data) payable returns (bytes)
ArtifactAccount.signatureDigest(bytes32 hash) returns (bytes32)
```

Registry constructor takes the root contract, then `mint(account, manifestJSON, bytes32Hash)`. `launchManifest(id,player)` returns JSON, contentHash, manifestHash, revision, frozen, holder, controller, parentArtifactId, parentOwnershipEpoch, authorized and onchainContentAvailable. Call it again at launch. Content mutation from a held cartridge must execute through the parent account because `_onlyOwner` checks the immediate token holder, not the outer user wallet.

### Fee router and v4

```solidity
OwnerFeeRouter(owner, recipients[], weights[])
configureSplit(recipients[], weights[])
depositNative() payable
depositToken(token, amount)
claimable(token, recipient) returns (uint256)
claim(token, amount, destination)
claimFor(token, beneficiary)
allocateSurplus(token)
setConverter(converter, allowed)
depositConverted(Conversion) payable
claimConverted(Conversion, destination)
// Conversion: tokenIn, amountIn, tokenOut, converter, minAmountOut, deadline, route
```

`ISettlementConverter.convert(tokenIn,tokenOut,amountIn,minAmountOut,deadline,route)` must return output to caller. Native uses address zero. Hook accepts `abi.encode(uint24 maxAcceptedHookFeePpm, uint64 deadline)` as swap hookData and rejects every exact-output or partial-fill swap. LP fee and hook fee are independent. `flush(currency,earnedRecipient,viaSplitter,amount)` retains the original hook recipient, but if that recipient is a mutable splitter its weights apply at flush time.

### Hosted API

`consoleAPI(req, { DB, BUCKET })` is mounted by `worker/index.ts` for `/api/console/*`.

| Endpoint | Input / output |
|---|---|
| GET `/documents` | Current host user documents, max 200. |
| POST `/documents` | `{id?, kind, payload}`; kinds world/cartridge/routing/chain/item. Upsert scoped by `(id, owner_id)`. |
| POST `/upload` | `{name,html}` → owner-scoped entry and SHA256. |
| POST `/publish` | `{id}` → content-addressed published entry and hash. |
| GET `/files/:id` | Current uploader's HTML only. |
| GET `/content/:hash` | Published HTML available to any authenticated site user. |
| POST `/rooms` | `{world}` → match + seat 1 + opaque secret. |
| POST `/rooms/:id/join` | Empty body → seat 2 + opaque secret; conditional update prevents double-join. |
| POST `/rooms/:id/move` | `{secret, revision, cell}` → validated updated board; stale revisions reject 409. |
| GET `/rooms/:id` | Shared board; excludes secret hashes. |

Writes require exact same-origin `Origin`. All endpoints require trusted host `oai-authenticated-user-id`. This authentication is host identity, not proof of wallet/NFT ownership. For NFT-gated multiplayer add a nonce/expiry/domain-bound wallet challenge and bind room seat authority to the selected NFT/controller epoch.

## Integration traps to fix deliberately

1. **Account ABI mismatch:** `chain-adapters/src/evm.ts::prepareAccountExecution` builds optional ERC6551 `execute(address,uint256,bytes,uint8)` (selector 0x51945447). Console `ArtifactAccount` has `execute(address,uint256,bytes)`. `readAccountBinding()` calls `token()` but this account exposes `artifact()` and `artifactId()`. Use actual contract ABI or explicit account-kind adapter.
2. **Profile mismatch:** Console uses `{spec,name,engine,entry,capabilities,settlement}` while generic SDK uses `{schemaVersion,id,title,runtime,entrypoint,requestedCapabilities,settlement:{...}}`. The tests even mint a third illustrative manifest schema because contract stores arbitrary JSON. Passing contract tests does not prove that manifest loads in this UI. Use `importConsoleProfile`/`exportConsoleProfile` with explicit identity/settlement enrichment and maintain world sidecar.
3. **Unenforced preference fields:** Preferred output token on each route and free-text pool policy are not automatically enforced contracts. The launch factory only stores selected hook and configuration hashes. Preserve that distinction in UI state and transaction preview.
4. **Owner-following configuration:** Router/hook constructors use the current wallet as owner in current UI. Transfer of the NFT does not transfer those separately owned contracts. If master economics should follow the NFT, deploy them with its account as owner and route configuration calls through that account, or add an authority adapter. Item creator similarly defaults to calling wallet.
5. **Source authentication assumptions:** Hosted API trusts platform-supplied user header and requires DB even for content reads. Do not deploy it behind an untrusted proxy accepting user-supplied identity headers. Normalize missing BUCKET checks for publish/content/files paths; currently they produce caught 400 failures instead of deliberate storage 503.
6. **Content boundary:** Onchain content limit is 24KiB storage, not a general game engine. Large HTML remains R2-hosted. Remote HTTPS dependencies are not verified. Add dependency-aware packaging/chunk resolution for a real fully-onchain large application.
7. **Legacy honesty:** Replace old hardcoded balances, 24,912 order count, mock trust graph, mainnet-read toast, static verification marks and publish successes with actual state or explicit local mode. Old social post is lost immediately.
8. **No lifetime game authorization:** Console checks cartridge control on load, not continuously. External NFT loader trusts saved `chain.account` when checking holder and does not reread root controller. This doesn't bypass contract execution, but service authorization should recheck current root owner/epoch, especially after transfer.
9. **Bridge lifecycle:** Current narrow Console host checks session/source/id but does not enforce message byte, inflight or replay sequence budgets like the richer bridge. Upgrading it to spending/item requests requires stronger grant validation and onchain authority, not merely adding handler names. Built-in games send only one initial handshake; using retrying `connectConsoleV1` avoids effect/frame startup races.
10. **World movement lifecycle:** DimensionalWorld retains active keyboard state after initial focus and lacks blur/visibility clearing that CitadelInterior does have. Clear keys on blur and stop capture while typing; honor reduced motion. Realm harvest persists a boolean forever while displaying 'returns tomorrow'; no date reset exists.
11. **Independent transaction stages:** Root mint, cartridge mint, publish bytes, token launch, pool initialize, approvals and LP mint are separate transactions. Persist each receipt/address before next step; recover partial completion rather than reporting a whole workflow failed after a successful transaction.
12. **Approval persistence:** NFT transfer changes account owner and signatures, not ERC20/ERC721 approvals recorded externally. An owner-directed transfer UX should inspect/revoke relevant allowances or deliberately migrate custody. Do not claim epoch alone cures approval exposure.

## Recommended synthesis on top of IDFBI

- Retain one authoritative master NFT identity with deterministic visual seed, versioned genome and stable function registry. Let token-specific seed change geometry, palette, harmonic ratios, portal topology and transition trajectory without removing functions or changing economic permissions.
- Treat modes as target fields for the central particle object: exchange flow as two streams, launch as an emerging lattice, vault as nested shells, journal as memory filaments, game cartridge as a formed traversable portal. The Console supplies economic/game mechanics; the base supplies continuity and visual identity.
- Port `console-core`, byte/hash validation, actual ABIs and owner account transaction helpers before porting any Console JSX. Reuse `Lumen Drift` and `PrismRelay` in isolated cartridge mode; make CitadelInterior a themed experience rather than a second full shell.
- Bind user-authored journal entry to a transaction intent or confirmed chain receipt with clear `local`/`chain` evidence. A general memory can share the same schema. Derive bounded cosmetic growth from event categories and digest; preserve immutable origin seed so experiences are reproducible.
- For open economics, expose editable recipients/weights, token input/output, hook address/parameters, amount ceilings/deadline, initial token recipient and raw account execute. Route output conversion needs a configured converter; users choose arrangements without imposed AWE fees.
- Share invite links, exported worlds and verifiable cartridge versions as the implemented network mechanisms. Add referral/market/social systems only when actual persistence and ownership semantics are defined; fake community counters provide no real network effect.

## Supplied verification and remaining scope

I read source tests and recorded evidence; did not execute these tests during this delegated read-only audit.

| Area | Supplied evidence | What it establishes |
|---|---|---|
| NFT runtime | `protocol/runtime-contracts/test/runtime.cjs`, `test-results.json`: 10 checks | Local Ganache deploy/custody/transfer epoch signatures/manifests/items/native execution. Predominantly normal flows, not adversarial assurance. |
| Router/launch | `protocol/fee-router/test/normal-flows.cjs`, artifacts result: 11 scenarios | Accounting conservation, claims, standard token conversion, quote rejection, ownership handover, fixed token launch. Converter is a test implementation. |
| Game | `protocol/onchain-game/tests/integration.cjs`, artifacts result | 103 transitions over plain draw, prism-scoring match and exhausted 33-cell board with passes. |
| v4 hook | `protocol/v4-hook/test/normal-flows.cjs`, artifacts result: 9 scenarios | Real pinned PoolManager on local Anvil/Cancun, correct currency fee accounting, old recipients, zero fees, quote and partial-fill rejection. |
| Position encoder | `POSITION_MANAGER.md`, `artifacts/position-encoder-verification.json` | ABI/source/decoder offset and fixture checks. Explicitly not a runtime PositionManager mint. |
| Console/API | `tests/console.test.mjs`: 6 tests | BigInt split, deterministic world/game, authenticated document isolation, room revision control, published bytes cross-user, invalid manifest scheme. |
| SDK | EVM, profile and bridge tests under `protocol/chain-adapters/test` | Chain/ABI fixtures, session local filters, message boundary and schema conversions. Non-EVM execution remains absent. |

The expected master validation gate is: independent semantic checks for seed-to-interface determinism and function parity; real local gameplay; no false transaction success; ABI-correct owner execution; responsive visual interactions; and clearly recorded configured/deployed/local modes. Production deployments, market liquidity, unsupported adapters and stronger security review are separate concrete work, not implied by a beautiful interface.
