# Frozen mint export

`npm run simulator:export -- --output simulator-export` exports the edition currently served by the local mint simulator at `http://127.0.0.1:4173`. Start it with `npm run simulator:start` first. Use `--url http://127.0.0.1:PORT` for another local port. The output directory must not already exist; each export is a separate edition. The exporter compares the recovered runtime and workbench with the current checkout's complete release bytes before writing anything.

Serve the resulting directory with a static HTTP server or a static host. Its `index.html` opens the minted application directly. Desktop and Phone controls resize the same application frame, preserving its state; Phone uses a 390-pixel viewport bounded by the available screen. “Edition details” links to the original metadata portrait, exact loader, recovered workbench, provenance and SHA-256 manifest.

The minted application is unchanged. A small host installs a recorded, read-only provider and then writes the original identity prefix and original runtime document into the same window. The wrapper begins with a DOCTYPE to preserve standards mode. The runtime and workbench sources, token metadata and original loader are also exported as separate unchanged files. Every exported file has a length and SHA-256 commitment in `export-manifest.json`.

## Recovery through the original NFT loader

Open “Recover from NFT loader” from the edition page. Leave the RPC input empty and select **Unfold**. The original, unchanged loader reads through the recorded provider, verifies its immutable fragments and then writes the recovered application. It retains the same seed, genome and state root as the direct view. Entering another RPC is unnecessary; external connections are constrained by the host's Content Security Policy.

`document.open()` clears event listeners, so the host restores its wallet-discovery barrier synchronously before the original loader writes the application. EIP-6963 announcements and discovery requests are suppressed before application listeners can see a live wallet. If a browser extension has already installed a nonconfigurable provider, the host stops before writing any application code and explains that a wallet-free browser profile is needed. It never silently continues with that wallet.

## Fidelity and limits

This is a real mint on local chain **31337**, recovered at the recorded block hash. Its source bytes, identity, onchain SVG portrait, installed module history and recorded reads originate from that edition. A future mint uses the same release code but receives its own seed and identity, so its visual form can differ.

Only recorded reads can succeed. Missing reads produce an explicit “not recorded” error; the player never fabricates chain results or silently contacts another RPC. Wallet accounts, connections, signatures, chain changes and transaction submission are rejected. Actions requiring live quotes, external services, publication or fresh chain state require a separately running local edition or a live deployment. The exported site is not a public-chain mint and does not demonstrate public-chain gas costs or production service availability.

The frozen host is a playback adapter outside the immutable NFT payload. To inspect the actual originals, download `runtime-source.html`, `workbench-source.html` and `token-1-loader.html` and compare them with the hashes in the manifest. `metadata.json` preserves the original `animation_url` and image. The GUI and static metadata portrait are distinct artifacts and are both displayed without replacing either one.

An existing verified JSON snapshot can be replayed with `--snapshot /path/to/snapshot.json`; the same current-build byte comparison still runs. No private key, wallet mnemonic or signing capability is included in the frozen package.
