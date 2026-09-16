# Launch continuity, atomic allocations and NFT participation

This implementation connects actual launch contracts to an enumerable onchain record. It also gives the existing community-sale and ANIMA streaming-auction mechanisms explicit NFT-account execution. It does not register shielded launches automatically.

## Persistent identity and discovery

`LaunchRegistry` stores one immutable base record per payer, token, mechanism, mechanism contract and mechanism ID. Its identity includes the chain and registry address. Records enumerate globally, by payer and by token; there is no dependency on the creator's browser transaction history. The base record commits the token, mechanism, funding account, optional verified collection/account binding, pool, liquidity position and exact source terms or recipe hash. It records who published it and when. Up to 256 append-only links connect allocations, actual vault locks, protocol or strategy references and settlement observations.

An ordinary registration is a payer-authored observation. A registry is not a security certification of an arbitrary token or protocol. A registrar needs explicit authorization from that payer. For an ANIMA account, the authorization commits its owner and permission epoch; changing either invalidates the old authorization. Registration cannot edit an existing record. Authorized additions cannot replace old links.

The atomic composer records actual funding inside the same transaction that creates the pool. Historical direct-pool registration finds the position's creation block without browser receipts, verifies the factory event and initial LP-share mint recipient, and commits the original transaction input. Owning purchased LP shares does not establish original funding. Community and auction registrations independently verify the recorded creator or seller.

`LaunchLifecycleClient.discover` accepts the registry and a payer or token; `readLaunchRecord` accepts the registry and record ID. Permanent links use `#launch/record/<chain>/<registry>/<id>`. The registry address is part of the link, deployment configuration or NFT runtime configuration, like any other onchain application dependency. It is not guessed from a wallet.

History reads bounded block ranges and joins registry, token transfers, position, pool, mechanism and linked vault events. Event receipts recover transaction hashes, blocks and exact raw logs. A provider may require smaller ranges or archival reads for old state; an unavailable provider does not delete the record.

Official CCA and Doppler records reopen their exact participant routes. Doppler history filters Airlock creation and migration by the launched asset, and reads the underlying hook and PoolManager events. An explicitly appended `pool` link can continue history after migration: a v4 link identifies its manager and pool ID; a v2 link identifies the pair address.

## Atomic launch allocations

`LaunchAllocationComposer` has immutable registry, installed TimeVault, no-hook factory and optional hooked factory dependencies. It supports only the existing typed v4 launch operation, with no general executor or delegatecall.

1. The payer explicitly authorizes the composer to publish registry records.
2. The reviewed launch approves exactly the quote-token budget.
3. The composer receives exact quote funding and calls the selected v4 factory.
4. It distributes up to 32 caller-selected retained-token or LP-share allocations. Each can be a direct payment, cliff lock or linear vesting schedule into the real installed TimeVault.
5. It resets temporary allowances, returns every unallocated token/share and quote refund to the payer, and publishes the permanent record and custody links.

Any failed token transfer, unsupported schedule, unavailable registry permission or failed record write reverses the entire transaction, including token/pool creation. Preexisting unrelated quote donations are not counted as this launch's refund. There is no administrative withdrawal mechanism.

The interface accepts absolute amounts or percentages. Token percentages use the guaranteed retained allocation, `supply - tokenBudget`; LP percentages use the newly issued liquidity-share supply. Integer division rounds down, and the remainder stays with the payer. Unused token seed budget also returns to the payer. The interface rejects aggregate allocations beyond these reviewed budgets.

Beneficiaries can be ordinary wallets or NFT accounts. Fixed-beneficiary vault schedules cannot be accelerated by selling the NFT. If the beneficiary is the NFT account, control of assets after release follows its current owner. Hook ownership and external fee recipients follow their own explicit configuration; the composer does not silently change them.

The composer is a public funding route. A public registry record explicitly discloses payer/NFT linkage. The private launch flow remains separate, and registry publication is never silently added to a shielded transaction.

## NFT-owned community sales and auctions

The community client uses the selected `chain.payer`, which is either the signing wallet or an independently verified NFT account. Only the client's verified sale create, contribution, withdrawal, settlement, claim and related vault-release operations enter the NFT route. Infrastructure deployment/sealing remains a signing-wallet operation. Community sale allocations and fixed founder/treasury beneficiaries can therefore belong to the NFT account without a second account system.

`NFTAuctionFactory` creates the existing ANIMA streaming auction with its actual caller as immutable seller. An NFT calls it through the existing bounded account utility route. Inventory funding is a separate exact-token approval and auction call before the opening block. Auction creation does not claim that inventory is already funded.

`prepareAuctionOperation` validates an explicit operation allowlist, exact runtime, selector, creation terms, seller and deterministic prediction. Funding must approve exactly the auction's fixed inventory; a bid's native amount must equal its quantity times limit price; unrelated methods cannot spend additional assets. Claims verify their explicitly reviewed recipient. General arbitrary external calls do not gain NFT eligibility through this helper.

Auction inventory control, standing bids, token/refund credits and seller proceeds held by the NFT account follow NFT ownership. Already paid external recipients keep their received assets. Changing ownership or permission epoch invalidates a prepared transaction; the new owner connects, re-verifies the account, and prepares a fresh action.

Participant pages default to the signing wallet even when opened from an owner desk that was using NFT custody. The user can explicitly verify and select an NFT account under Funding and claim ownership. Actual account balances and rights are then read from chain state. This choice is distinct from private funding.

## Participant routes

- `#launch/community/<chain>/<launchpad>/<sale-id>`
- `#launch/auction/<chain>/<auction>`
- `#launch/pool/<chain>/<position>`
- `#launch/record/<chain>/<registry>/<record-id>`
- Official strategy routing: `#launch/cca/<chain>/<auction>` and `#launch/doppler/<chain>/<airlock>/<asset>`; these are handled by the official-protocol desk.

The pool page verifies the position, factory, manager, hook and token metadata, reads pinned pool state, obtains actual swap quotes, and prepares swaps or liquidity redemption through the shared wallet/NFT transaction path. Reading terms is possible without a wallet through an explicitly selected provider. RPC credentials and query state never enter a generated share link.

## Integration points

Build `scripts/build-launch-lifecycle.mjs` after canonical compilation. It exports verified `LaunchRegistry`, `LaunchAllocationComposer` and `NFTAuctionFactory` browser artifacts.

Use `new LaunchLifecycleDesk({chain, getDraft})`, then `render`, `mount` and `unmount`. `mainDraftToLifecycle(chain, studioDraft)` maps the main launch form while verifying actual quote units, liquidity range and exact live hook fee/recipient weights. It rejects private and community-sale drafts instead of changing their mechanism or funding privacy.

The shared receipt handler calls `verifyLifecycleReceipt` and `verifyNFTAuctionReceipt` before marking the relevant final transaction confirmed. Creator auction actions pass through `prepareAuctionOperation`; passing a generic `nftCompatible` boolean is not the auction integration API.

After shared signing or recovery, `await lifecycleDesk.applyReceipt(record)` installs verified registry/composer/NFT-auction-factory addresses and updates the displayed launch record. The same idempotent handler serves the lifecycle panel's own Sign button. It checks the selected chain and canonical receipt block before applying results, and a new desk hydrates its configured infrastructure from the shared chain state.

## Verification

`test/launchpad/lifecycle.integration.test.mjs` exercises actual local Anvil PoolManager launches with and without creator hooks, atomic real TimeVault allocations, complete rollback, allowance reset, fresh-client recovery, original-launch discovery, verified public pool reads/trades and registry authorization invalidation. Existing community/auction participant regressions exercise actual funding, cancellation, refunds and claims.

`test/launchpad/nft-sale-auction.integration.test.mjs` uses actually minted canonical NFT accounts for community creation/contribution/withdrawal/settlement/claims and NFT-owned auction creation/funding/bidding/claims. It checks explicit participant custody and invalidation after NFT transfer.

Final local verification on 13 September 2026 passed all eight tests across the lifecycle, NFT sale/auction and participant integration files. The tests used the regenerated canonical and v4 browser/runtime artifacts. Shared-sign receipt regressions also cover setup configuration, repeated application, cold-desk hydration and rejection of a changed receipt block. Source fingerprints, commands and final logs are recorded under `reports/launch-lifecycle/`.

These are local contract and client tests. They are not public Ethereum deployment receipts, funded shielded-proof execution evidence, or physical-phone interaction testing.
