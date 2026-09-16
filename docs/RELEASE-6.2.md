# ANIMA 6.2 — complete audit scope

The original implementation plan and its former “add later” section are both included in this release. New source, browser routes and local execution evidence are delivered together. This is not a security certification or evidence of a funded public Ethereum deployment.

## What you can open

- **Launch → Create:** direct v4 pools, permanent launch records, optional token/LP allocations, community sales, ANIMA streaming auctions, official Uniswap CCA and Doppler. The selected wallet or eligible NFT account and each operation’s actual recipients are shown before signing.
- **Launch → Manage:** positions, fee-only collection, payout conversion, reinvestment, optional committed hook/split policies, token/LP locks, funded scheduled exits and revocable fee compounding.
- **Launch → Economics:** conserved ANIMA pool, community-sale and streaming-auction sequences; actual pinned-contract CCA and Doppler scenarios through the included isolated scenario service. These scenarios use test participants and never request your wallet funds.
- **Commons:** RFC 9420 MLS conversations, fresh invitations, member changes, key refresh, encrypted local state and deliberate manager migration. Legacy encrypted history stays available through its separate implementation.
- **Atlas → Operating shared ownership:** voting shares, exact proposed actions, spending limits, voting checkpoints, execution delays, revocable operators and a funded buyout exit. Existing frozen custody shares keep their original promise.
- **Atlas → Cross-chain:** verified OFT lanes, actual source transfers, authenticated destination delivery and payout or TimeVault action, destination history, retry/refund and receipts from both chains.
- **Atlas → Authority and recovery:** exact delegated grants, revocation, current external agent-token ownership, unreadable asset isolation and recovery.
- **Shared worlds:** persistent SQLite state, atomic receipts, idempotent commands, paginated regions and reconnectable authenticated updates.

The blue artwork and continuous camera are preserved. Navigating the new desks does not invent a second NFT object or alter the minted seed. No preview label was added to the artwork.

## Contract and custody changes

New NFT editions reject the old selector-only session execution path. Delegation and sponsored actions use the same account grant, binding exact calldata, target runtime, native value, one chosen asset’s debit budget, expiry and action count. NFT transfer invalidates earlier authority. A one-asset budget is not a certificate of every external liability.

Optional launch allocations execute atomically. A public launch registry and append-only relationships preserve creation, pools, beneficiaries and later lifecycle events after browser storage loss. Registration explicitly discloses public funding/identity linkage and is not silently added to shielded launches.

LP shares carry their proportional uncollected fees when transferred. Fee-only collection preserves liquidity principal, reinvestment issues the corresponding shares, and final redemption clears position rounding. Irreversible fee promises and splitter weights are deliberate options. The existing shielded creator-hook path retains strict private execution and output recovery.

Functional software archives replace the former single-archive capacity ceiling: each immutable module has a version, content hash and pinned dependencies, resolved by an onchain directory and verified loader. Required modules are verified before execution; this is not a lazy-loading claim. Editing this release or the hosted app cannot modify an already minted immutable software edition.

## Former “add later” features delivered

| Feature | Delivered implementation | Practical boundary |
|---|---|---|
| Official Uniswap CCA / Liquidity Launcher | Pinned CCA v2.1.0, bids, checkpoints, exits, refunds, claims and actual v4 migration / migration-failure recovery | Exact deployed versions and migration dependencies must verify; CCA protocol fee policy is disclosed. |
| Official Doppler | Pinned Airlock factories, dynamic v4 trading, failed-raise redemption, v2 migration, fee collection, vesting and matured LP exit | The selected official migrator imposes its 5% LP / one-year lock and protocol fee rights; these are shown. |
| Forward-secure messaging | Actual RFC 9420 MLS, fresh key packages, state erasure, membership commits, encrypted durable state and authenticated migration | Membership/traffic metadata remain public. Retained transcripts and backups affect exposure. The pinned MLS library has no formal audit. |
| Operating shared NFT ownership | Separate governance custody, fixed voting supply, checkpoint votes, budgets, delay, bounded operators and funded minority exit | Not an unrestricted executor for existing frozen shares; explicit obligations cannot discover every external debt. |
| Scheduled v4 exits / automation | Actual compatible contracts, prefunded slices/rewards, minimum outputs, pause/cancel, recovery, compounding and keeper | A funded, running executor is required; creating a schedule does not start one. |
| Larger persistent worlds | Durable atomic state and receipts, crash recovery, bounded region paging, authenticated updates and reconnect | Requires a running server; this is not unlimited-scale networking, nor automatically redeemable game currency. |
| Cross-chain operations | Pinned LayerZero OFT transport and verified destination payout/vault action, history and recovery | Local two-chain transport does not prove public DVN delivery or public lane funding. |

## Verification and remaining external steps

Release evidence includes real locally minted NFT launches and transfers, real PoolManager asset accounting, official protocol lifecycle and conserved sequence execution, MLS cryptography and onchain transport, operating governance, worlds persistence, two-chain OFT delivery, and immutable module recovery through a locally minted NFT. The final release report records the exact build/runtime hashes and test commands.

Before calling a public Ethereum edition operational, deploy/configure the chosen release, fund it and its external services, and retain public receipts. Funded RAILGUN proofs/broadcasting, public LayerZero delivery, running keepers/world/scenario services and physical phone gesture testing remain explicit environment requirements. No funds were spent on a public network as part of this release.

## Source guides

- `docs/IMPLEMENTATION-PLAN-6.2.md` — complete scope ledger.
- `docs/CAPABILITIES.md` — generated from the same capability inventory displayed in Atlas.
- `docs/LAUNCH-LIFECYCLE-6.2.md` — NFT funding, permanent records and atomic allocations.
- `docs/FEE-STRATEGIES-AND-AUTOMATION.md` — fee economics, exits and keeper.
- `integrations/official-launch/README.md` — exact official source pins, licenses and protocol commands.
- `docs/CONTRACT-SCENARIOS.md` — isolated service setup, scenario controls and recovery.
- `docs/FORWARD-SECURE-COMMONS.md` — MLS and migration guarantees.
- `docs/OPERATING-SHARED-OWNERSHIP.md` — governance and exits.
- `docs/CROSSCHAIN.md` and `docs/genesis/extensions/WORLDS.md` — required services and recovery.
- `docs/FUNCTIONAL-ONCHAIN-MODULES.md` — immutable module directory and recovery.
- `docs/OWNER-AUTHORITY-AND-RECOVERY.md` — permission, identity and broken-asset changes.
