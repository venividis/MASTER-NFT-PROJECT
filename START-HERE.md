# Start here

For version 7's complete local mint, module examples and persistent Ethereum chain:

```sh
npm run setup:full
npm run master:local
```

Use the printed workbench URL and local wallet configuration. Restart with `npm run master:start`. [README.md](README.md) describes the new module system; [the implementation map](docs/MODULES-IMPLEMENTATION.md) maps the approved plan to source and tests. The original application instructions follow.

Install Node.js 22.13 or newer (Node 24 is recommended):

```sh
npm run setup:validation
npm run compile:local
npm run compile:v4
npm start
```

For later launches, run `npm start` again. Open `http://127.0.0.1:4173` and keep the terminal open. Enter the blue object to explore its interior; Atlas opens the instruments. Complete formation makes controls usable immediately. Reduced motion skips automatic transitions; repeat visits use a short formation.

| Destination | Use |
| --- | --- |
| Swap | Review an exchange and explicitly select its privacy route |
| Launch | Compose pools, optional allocations, sales, auctions, official CCA/Doppler, fee strategies and economic scenarios |
| Vault | Inspect locks and releases |
| Memory | Choose encrypted notes, public inscriptions or hash-only seals |
| Commons | Forward-secure conversations, legacy encrypted history and separate public rooms |
| Worlds | Explore local worlds or owned, content-pinned cartridges |
| Atlas | Find shared NFT governance, cross-chain operations, authority/recovery and original controls |
| Advanced | Configure deployments, specialist instruments and developer tools |

Local exploration remains local. Minted previews and connected NFTs use selected identity state without importing rehearsal traits. Confirmed account actions refresh their snapshot from one block. Failed refreshes retain the receipt and visibly mark the old snapshot stale.

## Real local contracts

```sh
npm run genesis:local
```

This builds and archives the app, starts a development chain, deploys the Genesis stack, mints an NFT and seeds a test-token market. Use the printed RPC, chain ID, collection, token and module addresses with a separate development wallet. Printed test keys are public and must never hold real assets. Stop with Ctrl+C; local chain state is retained for restart.

Connect NFT selects the NFT account. Original connection remains in Original. These remain distinct workflows with explicit provenance; neither imports rehearsal balances into the chain account.

## Back up the right thing

Save a private-wallet encrypted backup before funding it. Mint sanctuary backups separately contain encrypted project records, limits and recovery state. Public memory is not a private backup. Application export does not contain all secrets or external service state.

Private execution requires compatible contracts, shielded resources and a broadcaster. It never silently switches to a public route. A pending submission must be reconciled; locking the screen does not cancel a transaction.

Read [generated current capabilities](docs/CAPABILITIES.md), [changes and validation](CLEANUP.md), [security boundaries](SECURITY.md), [privacy/v4 setup](docs/genesis/PRIVACY-AND-V4.md), [exit and mint sanctuary](docs/genesis/EXIT-AND-MINT-SANCTUARY.md), and [extension deployment](docs/genesis/extensions/DEPLOYMENT.md).

Versioned reports and older experiences are historical references. This source release neither republishes their sites nor upgrades deployed immutable contracts.

## Complete 6.2 dependencies and services

`npm run setup:validation` installs the locked browser communication, official launch protocol, v4, cross-chain integration and local test packages. Use `npm run setup:full` to add the shielded privacy SDK dependencies. Rebuild with the pinned local compilers before creating a new onchain edition.

Public use requires configuring and funding the actual deployments and external services. Read [forward-secure Commons](docs/FORWARD-SECURE-COMMONS.md), [fee strategies and keepers](docs/FEE-STRATEGIES-AND-AUTOMATION.md), [cross-chain transfers](docs/CROSSCHAIN.md), and [operating shared ownership](docs/OPERATING-SHARED-OWNERSHIP.md). These modules preserve separate source, local-test and public-deployment evidence.
