# Module deployment and recovery

The complete working local path is `npm run setup:full` followed by `npm run master:local`. It deploys real Solidity contracts on a persistent Ganache chain, mints the original ANIMA, then adds the module system to that same NFT. Use local test funds and the printed workbench URL. `npm run master:start -- --once` performs the same acceptance flow without retaining running servers.

## Deployments to a public testnet

The new module-system planner supports Ethereum Sepolia (11155111), Base Sepolia (84532), and local chain 31337. It prepares exact unsigned transactions. It does not contact a wallet, estimate fees, sign, or broadcast.

Start from an existing deployed native ANIMA collection. For a new collection, the preserved [Genesis deployment guide](genesis/GENESIS-DEPLOYMENT.md) prepares its full original application and privacy resources. Use its predicted collection and the next unused EOA nonce when composing the module plan; finish and verify collection deployment before executing module transactions.

Build the selected compiler profile and workbench first. Shanghai is the tested core profile here; the existing v4 integration has its separate Cancun profile:

```sh
npm run compile:local
npm run compile:v4
npm run build
npm run archive:confluence
```

Create a configuration containing the actual funded **testnet** deployer EOA, intended native collection, and next pending EOA nonce:

```json
{
  "chainId": 11155111,
  "deployer": "REPLACE_WITH_YOUR_EOA_ADDRESS",
  "startingNonce": 0,
  "collection": "REPLACE_WITH_NATIVE_COLLECTION_ADDRESS"
}
```

Then prepare and verify a fresh plan:

```sh
npm run modules:deployment -- --config modules-config.json --output modules-plan.json
npm run modules:deployment -- --verify modules-plan.json
```

The plan binds compiled source, compiler identity, contract creation bytes, ordered nonces, predicted EOA/internal creation addresses, complete workbench bytes and input hashes. It checks EIP-170 runtime and EIP-3860 initcode bounds. The workbench bytes are independently rebuilt in memory to reject stale or altered outputs. Review the plan's chain, collection, account, constructor arguments, gas estimates, and simulations in the wallet/deployment tool that will sign it. Submit and reconcile each transaction in order; do not use the publicly known local development account.

The plan creates an archive factory, immutable releases registry, per-NFT installations/state store, chunked legacy cartridge registry and binding, workbench chunks/archive, and the immutable workbench anchor. Installing programs is a separate NFT owner action. Saving a publisher release never grants access to the NFT account.

## Build and publish another module

Use [the SDK packaging and deployment guide](../packages/modules/README.md). A package contains the complete canonical manifest, raw or compressed archive, deduplicated chunks and public packaging receipt. Dependencies refer to exact deployed release IDs; publish a shared part before packaging a dependent module.

The SDK's `planArchiveDeployment` emits ordered unsigned chunk/archive calls. `validateDeploymentPlan` checks the current chain, pending publisher nonce, factory creation nonce and reused chunk bytes. After the archive is mined and verified, `preparePublishRecipe` creates the exact registry publication call from the complete manifest. Install that published release through the workbench using the NFT's owner review.

The command-line entry exposes both phases and optional verified chunk reuse:

```sh
npm run modules:plan -- --package ./module-package --rpc https://YOUR_RPC --chain 11155111 --factory FACTORY_ADDRESS --publisher PUBLISHER_ADDRESS --output archive-plan.json
# After signing, mining and reconciling the archive transactions:
npm run modules:plan -- --package ./module-package --rpc https://YOUR_RPC --chain 11155111 --registry RELEASE_REGISTRY_ADDRESS --archive ARCHIVE_ADDRESS --schema 1 --output publish-plan.json
```

Add `--reuse chunks.json` to the archive phase to reuse a mapping of payload SHA-256 hashes to existing chunk addresses; every reused byte is checked. Both commands read the chain without signing, never overwrite an output, and omit RPC URLs from their receipts.

For an independently consumable SDK, run `npm run modules:sdk` and `npm pack ./packages/modules`. The package exports its self-contained browser ESM API and a smaller core API without source-tree imports or runtime npm dependencies. Publishing that package to a registry is a separate operation.

`createDeploymentJournal`, `appendDeploymentReceipt` and `reconcileDeploymentJournal` preserve and recheck transaction, block, address and bytecode evidence. Resume stops on conflicts. The permissionless archive factory uses CREATE; another publisher can advance its creation nonce between review and execution. Recheck immediately before each transaction and stop on divergence. A conflict can consume testnet gas before detection; the current helper does not guarantee atomic deployment across concurrent publishers. Fresh system deployments use their own factory.

## Recover without the original server or deployer key

Retain the chain ID and immutable workbench address from the public deployment record. Recover the document and anchored service addresses:

```sh
npm run modules:recover-workbench -- \
  --rpc https://YOUR_RPC \
  --chain 11155111 \
  --workbench WORKBENCH_ADDRESS \
  --token-id 1 \
  --output ./recovered-workbench
```

Optional `--expect-sha256` and `--expect-code-hash` bind independently retained pins. Recovery checks contract code, service relationships, exact ordered chunks and full SHA-256 at one consistent block. It saves `index.html` and `recovery.json`; it never executes the recovered code. Serve that recovered directory on a trusted local origin to use a browser wallet, then select the recovered module registry and NFT.

Recover the full installed/staged module history and state from the installation registry:

```sh
npm run modules:recover -- \
  --rpc https://YOUR_RPC \
  --chain 11155111 \
  --registry TOKEN_MODULE_REGISTRY_ADDRESS \
  --token 1 \
  --output ./recovered-token
```

For a single release, use the release registry and `--release RELEASE_ID` instead of `--token`. Recovery preserves selected packages and exact dependency closures, retained releases, module history roots, state records, complete original payloads and chain snapshot. Pre-activation staged state is independently enumerable even when a browser receipt is lost. Unsupported/corrupted packages or inconsistent chain data fail verification.

RPC access is read-only, bounded and tied to a block hash. It still trusts the selected RPC's chain view; this is not a consensus/light-client proof. Personal encrypted state needs its independent decryption key backup. Onchain bytes, including public state, cannot be erased; forgetting a key is not a universal deletion guarantee.

The workbench anchor discovers the NFT, installations, releases, state store, factory and document. The legacy cartridge companion is recorded separately in the deployment plan/receipt. Recovering the workbench does not itself recover every original external service or private wallet secret.
