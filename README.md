# ANIMA · MASTER NFT PROJECT

An Ethereum/EVM NFT with its original blue interface, an NFT-owned account, and owner-selected programs and saved state. The contracts are Solidity. Browser programs are JavaScript/HTML stored as immutable onchain bytes and recovered in the browser.

Version 7 adds a modular system to the complete ANIMA 6.2 project. A holder can add a cartridge or install another module version on the same NFT. Each module has its own state history; publishing a new release never updates a holder's selected version automatically.

## Mint and use the complete local project

Use Node 24.19.0 and npm 11. The initial compile/build and full onchain application deployment take several minutes.

```sh
npm run setup:full
npm run master:local
```

This starts a persistent local Ethereum chain, deploys the original application and module contracts, mints NFT #1, publishes three example modules with a shared audio dependency, installs their state, and acquires a 48 KiB legacy cartridge through that NFT's account. It verifies recovery before printing the application/workbench URLs and addresses. All balances are local test funds.

Connect a separate development wallet using the printed public development mnemonic. Select its first derived account and check that its address matches the printed `owner`. Add the local network with RPC `http://127.0.0.1:8545`, chain ID `31337`, and currency symbol `ETH`. Never use that mnemonic for real assets. The original interface is at `http://127.0.0.1:4173`; use the printed workbench URL and **Connect & read** to load NFT #1 and its installed releases. Module installation, state saves and transaction proposals require owner review.

Select releases from **Discover** or **Installed** to use the published modules. The separate **Local examples** cards are browser previews. Aurora Notebook can save a browser draft; **Saved state & migration → Review chain snapshot** publishes a separately approved public snapshot. Gift of Light proposes a transfer from the NFT account and opens a transaction review. In **Journal**, paste the printed `contracts.MemoryLedger` address into **Existing MemoryLedger**, choose public or encrypted publication, and review the exact inscription. For encrypted entries, export the packet and keep its passphrase; **Recover an encrypted journal packet** opens an exact local preview.

Stop with Ctrl+C; restart the existing chain with `npm run master:start`. For a fresh edition after source changes, choose a new name: `MASTER_INSTANCE=edition-2 npm run master:local`. Restart that same edition with `MASTER_INSTANCE=edition-2 npm run master:start`; the instance name must be supplied again. Existing chain directories are retained. For automated deployment/recovery acceptance without leaving servers running: `npm run master:start -- --once`.

## Mint another NFT on the local chain

The starter already owns NFT #1. To mint another identity in that same collection:

1. Keep `master:local` or `master:start` running. In the original interface, open **Atlas → Connect NFT → Mint with commit & reveal**. Enter the printed `collection` address and choose **MINT NEW TOKEN**.
2. Export the recovery JSON, then review and sign **COMMIT AWAKENING** with the local development wallet. Keep the recovery file until the reveal succeeds.
3. After the commit is mined, run the following in a second terminal. The local chain mines on transactions; waiting alone does not advance its two-block reveal delay.

```sh
node --input-type=module <<'JS'
for (let i = 0; i < 2; i++) {
  const response = await fetch('http://127.0.0.1:8545', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: i + 1, method: 'evm_mine', params: [] })
  });
  const result = await response.json();
  if (result.error) throw Error(result.error.message);
}
JS
```

This mining command is for the local development RPC only. If you changed `CHAIN_PORT`, use that port. Return to **REVIEW REVEAL** and sign before 200 blocks have elapsed since the commit.

4. Use the token ID shown after the successful reveal. Open the printed workbench URL, change its Token ID field to the new ID, and **Connect & read** with its owner wallet.
5. New NFTs start without the starter's installations. Select a published release in **Discover**, inspect its permissions, and **Review installation**. Open the installed module, save a draft, and separately review any chain snapshot or transaction.
6. This manual mint has zero endowment. Before testing a gift or another value-spending action, send local test ETH to the new NFT account shown in the workbench. The owner wallet also needs local ETH for gas. Use the same printed `contracts.MemoryLedger` address for this NFT's journal.

## What is included

| Component | Behavior |
|---|---|
| Original NFT and account | Existing identity, renderer, interior, music and instruments retained |
| Chunked cartridge registry | Byte-exact legacy HTML backed by immutable chunks; new registry works with the existing cartridge reader |
| Archive factory and release registry | Immutable archives, exact manifests, publishers, versions, dependencies and capability commitments |
| Per-NFT module registry | Install, update, disable and paginated history with owner/epoch and stale-root checks |
| Module state store | Separate NFT/module namespaces, append-only saves, explicit staged schema migration |
| Recoverable workbench | A complete onchain HTML document with immutable service discovery; also embedded in this edition's Atlas |
| Portable SDK and CLI | Package, validate, recover, prepare unsigned deployments, deduplicate chunks and reconcile public receipts |
| Examples | Aurora Notebook, Resonant Garden and Gift of Light, with an exact shared score release |

The original swaps, launchpad, vaults, privacy integrations, Commons, Worlds, governance, recovery and research sources remain included. Their deployment and external-service requirements still apply. See [current capabilities](docs/CAPABILITIES.md) and [the implementation map](docs/MODULES-IMPLEMENTATION.md).

## Test and recover

```sh
npm run test:modules
FORGE_BIN="$(command -v forge)" npm run test:modules:native
npm run validate:release           # complete original + module JavaScript/local suite; requires Rust and C compiler
npx --no-install playwright install chromium
npm run test:browser               # current original application in Chromium
npm run test:modules:browser       # module UI and sandbox in Chromium
node test/browser/modules-native.mjs # real module UI with local native NFT/account contracts
```

The native Solidity command requires the actual Forge **1.7.1** executable on `PATH`; if it is elsewhere, set `FORGE_BIN` to that absolute path. JavaScript/shell wrappers are rejected. See [native toolchain setup](test/modules/native/README.md) for a pinned installation command. Browser tests require Chromium and its operating-system dependencies; their build inputs are prepared by `master:local` above. The native browser command uses a disposable local chain and needs no browser wallet extension.

Each command reports its own evidence. Source hashes, passing local tests and a successful local mint are not an independent security audit or mainnet certification. Current observed results and remaining gates are recorded in [the build evidence](docs/MASTER-BUILD.md). Historical reports retain their original version scope.

For modules and full state recovery, read [the SDK guide](packages/modules/README.md). For an existing public testnet collection, [the deployment guide](docs/MODULES-DEPLOYMENT.md) prepares exact unsigned Solidity deployments and recovers the workbench from its onchain address. No public contracts are deployed automatically.
