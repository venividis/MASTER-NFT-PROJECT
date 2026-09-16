> **Genesis 5.9:** Open Atlas → New instruments for the section 17 implementations. See [the exact capability matrix](docs/genesis/FUNCTIONS-EXPLAINED.md#17-implemented-extensions-from-the-unfinished-integration-backlog), [setup](docs/genesis/extensions/DEPLOYMENT.md), and [validation](docs/genesis/BUILD-5.9.md). Install the isolated service/prover dependencies with `npm run extensions:setup` before extension tests. No public deployment or hosted-site update is implied.

# Anima Genesis — start here

**New in 5.8:** Open **Atlas → Commons** for public onchain room browsing, replies, creation, invitations and membership/moderator controls. **Atlas → Capability map** explains 43 feature groups and their current implementation status. Read [the complete simple-language function guide](docs/genesis/FUNCTIONS-EXPLAINED.md).

Run the current source locally using the commands below. The [hosted comparison version](https://anima-genesis.edwincardenas.chatgpt.site) has not been republished by this source update.

The [Genesis deployment planner](docs/genesis/GENESIS-DEPLOYMENT.md) prepares concrete unsigned requests for the full unminted native stack and both immutable archives. It requires explicit configuration and sends no transactions. Public deployment and funded shielded validation remain outstanding.

**New in 5.6:** Open **Atlas → Instrument workshop** to preview and commission a deterministic release-calendar cartridge for your minted NFT. **Onchain instruments → Rehearse exact effects** executes supported unsigned actions on a disposable local fork and shows the measured effects before signing. See [setup, scope and the broader roadmap](docs/genesis/BROADER-ANIMA.md).

**Swap** now opens the v4 desk with **Private execution** selected. **Launch** creates a fixed-supply token, real v4 pool and redeemable liquidity shares when the configured contracts are deployed. **Withdraw** previews and redeems principal plus earned fees. Private mode requires a shielded wallet, supported deployment, RPC/proof services and a compatible broadcaster; it never falls back to public signing.

**Private wallet** stores encrypted recovery data, notes and launch drafts. Save its encrypted backup before depositing. **Hide screen** or Ctrl+Shift+L hides the interface and locks app signing sessions. An open private wallet also locks when backgrounded or idle for five minutes.

Read [privacy protections, limits and deployment setup](docs/genesis/PRIVACY-AND-V4.md). The contract suite is tested locally; no funded shielded end-to-end transaction or public-chain deployment has been performed.

- **Enter the object** travels into the blue object's three-dimensional interior. Drag to look, use W/A/S/D to move and Q/E to descend or rise. Pinch or spread to move back or closer; double-tap moves closer and a two-finger tap moves back. Two-finger drag pans. You can cross the membrane in either direction. Use **View whole object** to recenter, **Pause motion** to hold the field or **Hide controls** to see it unobstructed. Escape returns to the original object.
- **Atlas** exposes the retained instruments, original controls, identity previews, games, archive import/export and the new **Onchain instruments** desk.
- **Atlas** opens the instruments. **Complete formation** makes their controls available immediately. Reduced motion skips automatic transitions.
- **Onchain instruments** provides real, explicitly reviewed calls to compatible deployed Genesis contracts: swap, optional atomic trade inscription, lock, release, public memory and public room posting. Connect the NFT owner's wallet and supply the deployment's contract addresses.
- The existing Trade / Vault / Commons / Lab panels retain their local rehearsal state. Their balances are not public-chain assets. Public-chain deployment is not included in this build.

## Open the complete project locally

Install Node.js 22 or newer, then run:

```sh
npm ci
npm start
```

The local interface is served at http://127.0.0.1:4173. Keep the terminal open.

`onchain-app/confluence/runtime.html` is the standalone, embedded application. It requires a modern browser with import maps and gzip decompression. The normal local HTTP server is the recommended way to explore the source build.

## Run actual contracts locally

```sh
npm run genesis:local
```

This compiles and archives the application, starts a local chain, deploys the complete Genesis development stack, mints an NFT and seeds a test-token market. It prints your collection, NFT account, module addresses, token address and test-only wallet setup. The local chain and deployment persist in `.local-genesis/`.

1. Add local RPC `http://127.0.0.1:8545`, chain ID `31337`, to a separate test wallet.
2. Import the public development mnemonic printed by the command and use its first account. These addresses must never hold real funds.
3. Open **Connect NFT**, enter the printed collection and token ID `1`.
4. Open **Atlas → Onchain instruments** and enter the printed Market, TimeVault, MemoryLedger and WorldLedger addresses.
5. Swap a small amount of test ETH into `localToken`, inscribe a trade, or try a lock. Transaction results are genuine local EVM receipts.

Stop with Ctrl+C. Restarting retains the same contracts and balances. A previously archived onchain application is immutable; the development server serves the current source build. A new source edition does not silently replace old onchain bytes.

## Verify

```sh
npm ci --prefix integrations/console/protocol/v4-hook
npm run validate:genesis
```

This compiles Solidity, builds the site, checks sources, runs every JavaScript test, reconstructs the immutable runtime, and deploys/mints/recovers it on an ephemeral local EVM. Native rendering checks additionally use Python, NumPy, Pillow and Mesa EGL/GLES:

```sh
python test/genesis/blue_projection.py
python test/genesis/interior_render.py
```

See `docs/genesis/BUILD-5.6.md` for the audit, exact changes, evidence and remaining integrations. Original sources, donor trees, tests and historical reports remain in the complete package.
