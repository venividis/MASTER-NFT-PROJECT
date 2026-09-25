# Prism Cathedral mint simulator

Prism Cathedral is the application shipped inside the NFT runtime archive. The simulator mints the real contracts on persistent local chain **31337**, obtains `tokenURI(1)`, recovers its immutable application using the production archive reader, and compares every recovered byte against the built application. It also recovers the immutable module workbench and all installed packages, shared dependencies and module state history.

The default instance is `prism-cathedral`. Its addresses, seed, genome and state root come from the actual local mint. No randomly invented preview identity is substituted. A future mint will have its own seed and resulting object; this simulator proves the application and recovery path, not that two different mints have the same identity.

## Run a complete local edition

```sh
npm run setup:validation
npm run compile:local
npm run compile:v4
npm run build
npm run archive:confluence
npm run verify:confluence
npm run simulator:start
```

The existing local deployment path deploys the original protocols, application archive, immutable module system, example releases with a shared dependency, and the 48 KiB local cartridge fixture. The first launch takes several minutes. It only uses development funds on chain 31337 and never deploys to a public network.

Open `http://127.0.0.1:4173/` for the minted application. The server listens on loopback. `http://127.0.0.1:4173/simulator` opens the edition and recovery panel. Keep the terminal running while exploring. Use `CHAIN_PORT` and `PORT` for different local ports.

```sh
MASTER_INSTANCE=prism-next-edition CHAIN_PORT=8546 PORT=4174 npm run simulator:start
```

State lives in `.local-genesis/<instance>/`. A restart validates saved contract code, the runtime hash, the workbench hash and the exact source build manifest. If source changed, select a fresh instance name; the simulator refuses to present an old minted edition as the current build. An interrupted deployment preserves its checkpoint and refuses unsafe automatic transaction repetition.

## Recovery surfaces

| Route | Result |
| --- | --- |
| `/` and `/token/1/live` | Mint-bound application recovered from immutable storage |
| `/simulator` | Edition, recovery links and evidence |
| `/token/1/loader` | Original `animation_url` HTML, unchanged |
| `/token/1/recover` | Original loader inside a protected read-only host; leave RPC blank and choose Unfold |
| `/token/1/runtime` | Exact recovered runtime, without a simulator prefix |
| `/token/1/metadata` | Original onchain JSON metadata |
| `/token/1/provenance` | Seed, archive commitments, expanded byte hashes, snapshot block and verification |
| `/modules.html` | Recovered immutable workbench with this NFT's registry parameters |
| `/simulator/snapshot` | Complete verified snapshot for a portable export |

The identity prefix is copied directly from the original NFT loader. Host wrappers begin with a doctype and open the recovered document in standards mode. They isolate browser wallet providers before running the application; failed isolation leaves the host inert. Both conventional injected providers and EIP-6963 discovery are blocked in the read-only replay, including after the loader replaces its document.

## Fidelity and authority

Application and workbench recovery must pass full byte equality, not only a title, screenshot or sample comparison. The evidence records the local block number and hash. Every read is pinned to that block, so the GUI and proof describe one consistent edition. The original NFT metadata portrait is the contract's existing SVG; the interactive GUI is its animation document.

The HTTP bridge exposes selected reads only. It rejects accounts, signatures, transaction submission, state overrides, mining, unlocked-account operations, cross-origin requests and non-loopback hosts. Read-only previews cannot impersonate owner approval. Controls that require ownership still use the real application's review and wallet flow and cannot complete through this bridge.

For live owner transactions on your own local chain, connect a separate development wallet directly to the local RPC and use the existing `npm run master:local` workflow. Never use the public development mnemonic with real funds. Public testnet or mainnet deployment remains a separate operation with its own deployment configuration.

## Verification

```sh
npm run test:simulator
```

The simulator tests actually deploy and mint the production renderer and NFT contracts, recover the application and immutable workbench, verify installed packages, and exercise the bridge's refusal of chain mutation. They also test identity parsing without code evaluation, stale-edition rejection, standards-mode wrappers and wallet-discovery isolation.

For a portable hosted replay with the same recovered bytes and recorded chain reads, see [the frozen export guide](PRISM-FROZEN-EXPORT.md).
