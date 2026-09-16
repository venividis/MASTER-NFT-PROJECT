# The Interior / 1.4 architecture

## Status and provenance

This release contains two different executable domains. The standalone browser app executes now and was tested with Chromium. The Solidity extension source has **not compiled or executed** in this environment. The browser's numerical simulation is not evidence of contract correctness. No live v4 wallet UI, deployed hook, public chain, agent proof, encrypted room, or bridge exists here.

The project was reconstructed from the original 1.2 ZIP plus the surviving 1.3 HTML and contract files. The exact 1.3 inline application is preserved as `web/reference/four-chambers-1.3.html`. Its modular source was not available, so the new builder embeds that archive and adds an isolated new application closure. The original 1.0 renderer is also preserved. Older top-level technical documents are historical, not 1.4 certification. `docs/v1.4/` is the current extension specification.

## Domain model: one artifact, several kinds of truth

```
NFT identity ── current custodian ── ownership epoch
     │
     ├── custom deterministic account ── spendable native / ERC-20 / NFTs
     ├── claims payable to account ── original timelocks and vesting schedules
     ├── rooms administered by account ── consenting members, epoch-bound roles
     ├── state / memory / audit commitments ── original semantics preserved
     ├── application representation ── optical organism + crystalline interior
     └── operating history ── actor + artifact + custodian-at-time + receipt
```

A current owner is not the author of all previous posts. A locked claim is not a current spendable balance. A user's presence grant is not spending authority. A rendered building is not proof of a position in a liquidity pool. The UI names these distinctions rather than collapsing them into an “owned” badge.

## Browser separation

`web/kingdom/model.mjs` is deterministic business logic over fictional personas and balances. Monetary values use BigInt decimal integers. Mutating flows snapshot and restore local state on failure. Exports contain an unsigned integrity chain, not an owner signature. Import validation checks data types and bounded structures even when the outer checksum has been recomputed. A wholly fabricated but internally coherent history can still be constructed; checksums are not authentication.

`scene.js` computes crystal geometry and projected facets on Canvas, using local identity, view, and lock-projection inputs. It is art-directed, not a physical refraction simulation. `app.js` handles dialogs, human-facing review, permissions, room flows, and state persistence. `styles.css` and `shell.html` supply responsive layout, focus affordances, a mobile rehearsal label, reduced motion, and no automatic audio. There are no new HTTP, WebSocket, CDN, model, or wallet calls.

The old renderer pauses while the Interior is open. ORGANISM returns to the actual archived interface; ENTER THE INTERIOR returns without rewriting its original identity. The new rehearsal uses a separate storage key. Export it independently. The six sections are Sanctum, Launch, Swap, Vault, Marketplace, and World.

## Timeglass versus time

Timeglass is an argument to a read-only projection of vested amounts. It does not modify the model clock, genesis, vesting parameters, balances, or receipts. Early release stays disabled even while viewing a future date. Separate, explicitly labeled rehearsal-clock controls make launch settlement and release paths testable without waiting days. There is no corresponding arbitrary-time write in Solidity; contracts use the chain timestamp.

## v4 launch source

The original launch token allocation/refund mechanism remains. `GenesisLaunchpad` now invokes a small `IGenesisMarket.seed` interface instead of depending on the custom constant-product class. The sealed ledger's market address selects `V4GenesisMarket` for the new configuration. Do not wire the old NativeMarket and claim a v4 pool exists.

The adapter registers a pool covenant, initializes the actual PoolManager, and opens an authenticated unlock callback. Callback data is hash-bound and one-use. Each token debt is settled and each positive delta taken through the manager's API. Exact-input swaps that fail to fully consume the intended amount revert. ERC-20 routes use token/native pools and token/token routes traverse native. Deadline and minimum-output bounds are mandatory. This is a deliberately constrained router, not an aggregator, Quoter, intent auction, or best-price system.

The hook address encodes four permissions (`0x22c0`). The hook binds the configured adapter, native/token key, dynamic-fee flag, spacing, intended initial price, and launch manifest. Its fee moves from 1% to 0.3% over 24 hours. The economic observation stream identifies the router, not a supposed human from arbitrary hook data. Activity attributed to a wallet/account is recorded separately by the authenticated protocol adapter.

Initial principal and seed rounding dust have no withdrawal path. A fee harvest is a zero-delta liquidity operation, permitted by the negative-only principal guard. Harvest always pays the original launch creator address, which is the NFT account when it created the launch. This keeps the future beneficiary attached to the account, without promising any future fees. Other LPs' withdrawal rights are not intentionally restricted by the seed-adapter guard.

The boundary file uses ABI-equivalent address/int256 declarations for upstream user-defined types. It is not a replacement PoolManager and it does not establish source-type compatibility with every upstream SDK. Actual v4 interface, fee, delta, tick, gas, bytecode-size, and deployment tests are required.

## Whole-estate exchange source

`EstateExchange` is specialized to the exact configured collection and its account/epoch behavior. A listing escrows the root NFT. The account's current controller becomes the exchange, whose code exposes neither generic account execution nor contract-signature approval. The prior owner's account sessions are invalidated by transfer. Sovereign tokens and active use grants are rejected by this listing path.

The bounded manifest commits to native and ERC-20 minimum balances, specified child NFTs, exact TimeVault lock hashes, specified zero-allowance pairs, identity/account snapshot, royalty terms, seller, price, expiry, chain, and exchange. Purchase checks before and after the buyer's receiver callback. Funds become pull-withdrawable credits. Returning an expired listing always targets the recorded seller, not whoever invoked cleanup.

This does not prove absence of external liabilities or arbitrary approvals. Child `getApproved` checks do not discover every `isApprovedForAll` spender. Codehash does not describe a proxy's entire dependency graph. A permissionless vault release changes an exact lock hash even if it increases the account balance; an old listing may need cancellation and relisting. Those conservative failures are preferable to silently changing the sold covenant.

The local model instead checks its finite fictional inventory directly. It has no arbitrary tokens, RPC, storage proofs, gas, or malicious contract callbacks. A local purchase is not a contract integration test.

## Social source

WorldLedger stores public message bytes, room state, preferences, replies, reactions, and permitted module activity. Public World has no room-owner moderation authority. Member-only rooms restrict writing, not public read access. Invitations require acceptance. Stale invitation/moderator epochs do not silently survive a change of artifact custodian. Accepted membership is not the ownership of a person; participants can decline or leave.

Messages and activity have separate custody-at-time sidecars. Protocol events do not arise from parsing chat prose. `postWithReceipt` references a real existing activity ID. Estate exchange activities use the collection as `asset`, token ID as `referenceId`, and `identity=0`; the exchange events contain the detailed custody transition. A future indexer must follow that schema, not treat the local UI model's direct identity field as an ABI match.

The new ledger version is `idfbi/constellation/1.4`; old clients must not assume version or route compatibility. Real deployments require sealed module addresses. New UI behavior is tested against its local model only.

## Onchain application archive

`OnchainApp` and `AppChunk` were inherited as uncompiled development source. The archive builder divides the actual new HTML into at most 32 payloads of 23,000 bytes and independently reassembles them. Runtime chunk layout is STOP plus payload. The root verifies an assembled SHA-256 digest. Addresses remain null in the local manifest because nothing was deployed. A stored application still renders in a browser, and this particular application still runs a rehearsal until a real client is implemented.

## Explicitly absent

No canonical ERC-6551 migration; no 5773/7401/6220 conformance layer; no private-data iNFT transfer or model inference; no ERC-8004 registration; no MLS encryption; no CCA implementation; no authenticated omnichain transport; no deployed mainnet/testnet economy; no new live-wallet v4 quote/review/submission flow. These are researched extensions, not hidden working functions.
