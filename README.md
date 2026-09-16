# ANIMA NFT · Genesis 6.2

ANIMA is a collectible identity with a procedural blue interface, an NFT-owned account, public memory and optional instruments. The original object and its continuous interior share one optical field; readable controls open independently around it.

This edition brings launch ownership, permanent records, allocations, fee strategies, official launch protocols, MLS conversations, shared governance and cross-chain recovery into the NFT interface. Exact owner permissions and unresolved-asset recovery remain central. See [the revised implementation plan](docs/IMPLEMENTATION-PLAN-6.2.md) and [current capabilities](docs/CAPABILITIES.md). The cleanup makes authored source authoritative, separates rehearsal from selected NFT state, repairs custody and privacy boundaries, and gives the project one current entry point. Start with [START-HERE.md](START-HERE.md). Read [the cleanup record](CLEANUP.md) for changes, validation and outstanding work.

## Run

Use Node.js 22.13 or newer:

```sh
npm run setup:validation
npm run compile:local
npm run compile:v4
npm start
```

For later launches, run `npm start` again. Open `http://127.0.0.1:4173`. Exploration starts locally without requesting a wallet. The main navigation is Swap, Launch, Vault, Memory, Commons, Worlds and Atlas. Advanced contains specialist instruments, developer configuration and irreversible authority research.

## Sources of truth

| Layer | Responsibility | Authority |
| --- | --- | --- |
| Identity and account | Ownership, custody, permissions, canonical NFT state | Deployed contracts at the selected block |
| Blue interface | Original object, interior, animation and usable controls | Authored files in `web/` and `render/` |
| Local exploration | Rehearsal, local worlds and optional local memory | This browser |
| Optional instruments | Markets, vaults, rooms, agents and extensions | Each explicitly configured contract or service |
| Recovery archive | Embedded app, source and pinned resources | Verified archive manifest |

Public inscriptions and public room posts are public. Personal encryption keys do not transfer automatically with the NFT. Private wallet and mint sanctuary require their own encrypted backups. Exporting the app is not a backup of every wallet, service or browser record.

Live instruments require compatible deployments and explicit review. The launchpad now executes direct v4 launches, opt-in creator-fee hooks, pro-rata community sales and the ANIMA streaming auction. It supports reviewed wallet deployment, real approvals and receipts, swaps, LP redemption, fee claims, refunds and vesting releases. See [LAUNCHPAD.md](LAUNCHPAD.md) for the exact paths and operating requirements. The arithmetic proof is bounded research using a development setup. NFT custody shares freeze the account; they do not implement operational shareholder governance. See [current capability boundaries](docs/genesis/CURRENT-CAPABILITIES.md).

## Validate

```sh
npm run setup:validation
npm run validate:genesis
```

Additional privacy SDK, Rust and native rendering checks are described in [CONTRIBUTING.md](CONTRIBUTING.md). Results actually obtained are recorded in [CLEANUP.md](CLEANUP.md).

Historical reports describe their own versions. Approved original HTML remains a comparison fixture; active builds read authored source. This package does not update a hosted site or public blockchain.
