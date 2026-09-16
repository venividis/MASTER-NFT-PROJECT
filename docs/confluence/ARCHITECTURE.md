# AWE Confluence 2.0 — source and implementation map

Confluence extends the supplied I don’t fucking believe it 1.7 source. It is a working local application, with chain-reading and owner-reviewed transaction adapters, compiled EVM modules, and a private hosted interface. No public-chain deployment or funded production launch is claimed.

## One identity, equal capabilities

The identity domain hashes the version, chain ID, collection address, token ID and full 256-bit origin seed. Sixteen normalized coordinates derive from that domain. The same capability registry is returned for every identity. Seed differences alter the particle target field, palette, harmonic ratios, phase, aspect, portal positions and motion. Names and visible images can collide; the full identity digest identifies the origin.

Eight Givens rotations act on sixteen coordinates before a bounded three-dimensional projection. These are ordinary mathematical operations in a parameter space. They make no claim about physical dimensions, divinity, rarity, profitability or access privileges. Pointer orbit is a separate three-dimensional rotation, and the viewport applies perspective projection.

Every particle has a stable index across modes. The simulation relaxes its position toward a target with `1-exp(-rate*dt)`, preserving temporal continuity while the target field becomes a current, launch spiral, time vault, memory rosette, market loop, world terrain or harmonic trajectory. Additive particle and halo passes form the luminous body. Reduced-motion preference disables continuous evolution and settles transitions immediately. WebGL falls back to a lower-density canvas rendering.

The inherited MemoryEngine derives a bounded activity vector from event categories and commitments. Words and private plaintext are not interpreted as geometry. This vector deforms the current particle field. Local events never change an onchain genome. The original optical renderer, shaders, WebAssembly and interface remain available through Original.

## Shared state machines

`MemoryEngine → OperatingEngine → InstrumentEngine → KingdomModel` remains the executable economic and social model. Its review digests, prior-state checks, custody checks, integer accounting, rollback and append-only memory rules are retained. The new interface calls these models through the existing instrument controller; it does not turn simulated success into chain receipts.

The original fixed-policy launch rehearsal remains separately accessible. Confluence’s primary Genesis defines a fixed supply and initial recipient, arbitrary route recipients/weights, hook choice and fee commitment. No AWE share is mandatory. `OwnerLaunchFactory` creates the token and records terms; those terms alone do not initialize liquidity or enforce an arbitrary curve.

`OwnerFeeRouter` assigns claims when a deposit arrives. Later configuration changes cannot rewrite existing claims. The NFT account is the router owner, so its configuration authority follows NFT custody. Token conversion requires an explicitly enabled converter, deadline, minimum output and measured exact transfers. Preferred output addresses in a saved plan are not automatic conversions.

## Wallet boundary

`web/confluence/wallet.mjs` reads the wallet network, collection, actual token owner, account and snapshot. It rejects a wallet that does not own the selected NFT. Owner calls are simulated, gas-estimated, displayed for review, rechecked before sending and recorded only after an included receipt. Wallet/network changes invalidate prepared calls and close running cartridges. Core sovereignty requires proof-authorized execution and has no owner-call bypass.

The owner can compose an arbitrary target/value/calldata account action. Distribution and Genesis generate typed ABI calls to supplied deployed contracts. New UI does not assert market prices or create mainnet balances. The inherited core commit/reveal mint client remains restricted to local/Sepolia/Base Sepolia; it requires real deployed addresses and two explicit wallet transactions.

## Cartridge runtime

The master’s reverse account registry and `ArtifactBinding` expose current parent NFT ownership and transfer epoch to `CartridgeRegistry`. External ERC721/ERC1155 assets remain receivable. Root-collection nesting is blocked in the collection transfer path to prevent same-collection ownership cycles even on unsafe transferFrom.

An onchain cartridge load rereads parent account/controller at a block, verifies its executable’s SHA-256 and runs the recovered HTML in a script-only sandbox. It receives no wallet, same-origin privileges or network permission. The bundled Lumen Drift is loaded through the same local sandbox. Prism Relay shares the donor’s validated 9×9 rules, score accounting and world connectivity rules. Games are local in this hosted release; the supplied server/onchain game sources are included as integrations, not advertised as active multiplayer.

## Onchain application archive

`npm run archive:confluence` packages all required scripts, CSS, shaders, Wasm, Lumen Drift and cartridge ABI into a standalone HTML runtime. ESM imports resolve through an embedded import map. A gzip bootstrap keeps the payload within the existing OnchainApp limit of 32 immutable 23,000-byte chunks. The manifest records whole-file and per-chunk SHA-256.

`ConfluenceRenderer` combines this immutable application with the collection’s actual chain-qualified identity and retains the onchain SVG preview. `animation_url` is a compact data HTML loader containing the token identity, immutable runtime address and digest. It reads each chunk at one block through the selected wallet provider or an explicitly supplied HTTPS RPC, verifies SHA-256 locally, then unfolds the application. Reading requests no account permission, signature or transaction. Embedding the full application twice in tokenURI exceeded practical RPC execution limits; the compact loader avoids that large metadata allocation. Application bytes can therefore be onchain while browser rendering still happens offchain. The hosted preview itself is conventional hosting. The archive and renderer have not been deployed to a public chain, and renderer RPC response limits and marketplace data-URL compatibility require target-specific verification. Browser gzip decompression and import maps are required. Marketplace viewers without wallet injection require a CORS-enabled read-only RPC and must permit data-HTML execution; an onchain SVG preview remains available.

## Source corrections

- Corrected invalid comma-separated declarations in V4GenesisMarket so Solidity compiles.
- Corrected Base64 input iteration, which skipped the first 32 payload bytes and broke token metadata.
- Added a canonical account reverse map and transfer-level rejection of same-collection account destinations.
- Reserved the actual agent binding metadata keys against later conflicting writes.
- Required current invitation epochs for gated room posting and reactions.
- Allowed threshold verifier bootstrap while preventing an under-threshold freeze or signer removal.
- Added owner-selected, epoch-bound verifier ID/address/codehash before irreversible sovereignty. Other registered verifier IDs are no longer automatically accepted.
- Removed caller-controlled private-key attestation from the local planner. It emits unsigned proposals; a real attester needs authenticated requests and canonical chain/policy inputs.
- Allowed zero addresses as ABI values for native-token arguments while preserving nonzero connection validation.
- Updated EVM fixtures to disable stale RPC request caching, sign with local generated fixture keys and apply a gas buffer.

## Deliberate remaining integrations

A public deployment and a complete indexed chain UI remain separate. The new wallet supports core reading, account-call composition, configurable token launch, fee configuration and owned onchain cartridge loading. Existing Trade/Memory/Vault/Market/Commons/Work/Lab panels still use the retained local models. Real v4 PoolManager/PositionManager liquidity, per-recipient conversion, complete live economic adapters, network multiplayer, authenticated cross-chain transport, ERC-6551 canonical deployment, ERC-7401 nesting and verified ERC-8004 binding are not silently claimed.

The proof-kernel reference remains a research component: its witness/policy binding and real zkVM guest/prover integration are unfinished. A pinned verifier is not proof that its policy is sound. Source code hashes alone do not freeze the implementation behind an upgradeable proxy.

## Local archive recovery

Atlas exports and imports the complete organism receipt book, memory/instrument engine, routes, launch definition, world and historical chain receipt records. Import replays the origin receipts, checks the instrument checksum and origin, validates plans/worlds, previews the replacement, downloads a backup, and reloads after saving. Storage failures roll back the touched keys. Imported records confer no chain authority or authentication.
