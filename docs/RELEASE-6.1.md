# ANIMA 6.1 — audit-driven implementation

13 September 2026. This release follows the actual NFT audit in `ACTUAL-NFT-AUDIT.md`, preserving that document as a dated implementation inventory. It is not a new security certification.

## The plan changed

The audit showed that shielded transactions and encrypted groups already existed. The priority became exposing their real routes, completing deployment-aware interfaces and integrating the NFT account. Building another imitation of those functions would have repeated the original mistake. The revised plan is in `IMPLEMENTATION-PLAN-6.1.md`; the complete current inventory is in `CAPABILITIES-6.1.md`.

## Delivered

| Area | Implemented behavior | Reason |
|---|---|---|
| Primary navigation | Swap, Launch, Vault and Commons open their canonical interfaces. Public rooms are separate from encrypted conversations. | Visible commands must correspond to actual capabilities. |
| Encrypted Commons | Deploy or verify the two required contracts; discover groups/invitations; accept, rotate, post, decrypt, paginate and recover encrypted backups. | Chat should be usable without unrelated memory-handover configuration. |
| Camera and interface | One continuous original optical field, original drag controls and uninterrupted pinch/wheel navigation; panels preserve the camera. Independent readable surfaces replace text-driven formation in the primary interface. | Opening a function or changing distance must not substitute another object or gesture model. |
| NFT funding | Explicit verification and selection of the NFT account for supported launch, swap, LP redemption, fee and vault operations; exact atomic allowances. | Wallet signatures and ownership of the assets must be distinguished. |
| Private creator fees | Shielded creator-hook launch, swap and LP redemption composition; exact return assets and submission recovery. | Creator economics and private funding should compose where the actual contracts support them. |
| Participants | Stable community/auction links, disconnected verified terms, actual contributions, bids, refunds and claims. | A participant should not need the creator's browser history or NFT ownership. |
| Economic scenarios | Conserved integer event sequences, fees, recipient changes, claims, settlement and explicit unlock sales; differential checks against PoolManager. | Understand consequences without presenting imagined future prices as facts. |
| Optional vesting | Real TimeVault deposits and releases, including LP-share locks. | A visual lock schedule must be distinguishable from assets actually placed in a vault. |
| Recovery | Wallet transaction replacement/cancellation/reorg reconciliation; immutable archive directory beyond 64 chunks; complete hash verification before execution. | Unknown transaction outcomes and growing app size must not break recovery. |
| Hosted entry | Canonical financial, privacy and camera modules shared byte-for-byte, with recorded sample selection and existing screen concealment retained. | Eliminate the simulator's separate disabled-wallet implementation and route gate. |

## Removed or changed

- Removed primary routing into local swap/launch models and the hosted wallet-disable stubs. Explicit local economic tools remain available.
- Removed competing interior flight controls and automatic object reconstruction/crossfade. Navigation does not change the seed or genome.
- Removed private-text harvesting from the primary panel system; lock clears sensitive fields and invalidates unfinished decrypt/restore operations.
- Changed private draft import to preserve the encrypted session's network. Changed contract settings require an explicit restart. Lock/Hide stay available while work is busy.
- Replaced blanket privacy implications with the actual boundaries of each action.

## Kept outside this release

Official Uniswap CCA/Doppler integration needs its own tested contracts and deployment workflow; the existing ANIMA auction is not relabeled as either product. Automatic payout conversion and compounding need executable strategies and slippage/custody rules. Forward-secure messaging requires a protocol migration, not a new toggle. Operating shareholder governance is different from frozen NFT custody shares. New cross-chain execution, general autonomous reasoning and arbitrary EVM proofs remain separate projects. The earlier baseline's broken-asset retirement, external identity verification and old native-only session API still need their own compatibility work.

## Verification and operating boundaries

The delivered evidence includes actual local NFT/PoolManager launch, swap and redemption; ownership transfer and stale-nonce rejection; transaction replacement/cancellation/reorg recovery; actual encrypted group lifecycles and backups; real sale/auction participant operations; real vault deposits/releases; private-hook contract accounting with SDK-encrypted return notes; native optical and CPU/GPU parity; archive corruption rejection; and source/build/module closure checks.

The private adapter tests do **not** verify a funded public-chain ZK proof or a live broadcaster transaction. Public Ethereum deployment, funded shielded balances, compatible contracts, RPC/POI/circuits/broadcaster configuration and the owner's wallet signatures remain required. Token/pool data and chat membership/activity metadata remain public. Encryption keys and existing external fee claims do not automatically transfer with the NFT.

Physical phone/browser interaction acceptance remains outstanding. Native rendering and actual input-controller tests passed; those are not a claim that every handset has been tested. Editing this website or source cannot rewrite an already minted immutable edition.

See `reports/implementation-6.1/`, `reports/runtime-directory/verification.json`, `reports/cleanup-6.0/native-rendering.json` and `reports/cleanup-6.0/interior/results.json` for the recorded checks and their scopes.
