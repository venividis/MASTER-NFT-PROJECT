# ANIMA module SDK

The SDK publishes immutable programs and recovers them for the same NFT/account. It does not replace an existing NFT renderer, execute package source during packaging, hold a private key, or submit transactions.

## Entry points

- `sdk.mjs`: browser-safe public exports from `core.mjs` and `chain.mjs`. Uses the project's existing bundled ethers implementation for ABI encoding and Keccak; no Node imports.
- `core.mjs`: canonical manifests, byte hashing, deterministic package envelopes, archive verification, bounded dependency graphs, and chunk deduplication.
- `chain.mjs`: exact registry ABI, manifest/record cross-checks, read-only recovery, bounded catalog pages, state recovery, and unsigned owner-call descriptions.
- `deployment.mjs`: Node deployment plans, address prediction, reused-chunk checks, public receipt journals and deliberate resume/conflict handling. Never imported into the browser SDK.

## Use outside this repository

The standalone package is `@anima/modules` version `1.0.0`. Build and pack it from the project root:

```sh
node scripts/build-module-sdk.mjs
npm pack ./packages/modules --pack-destination ./
```

Install that local tarball in another project:

```sh
npm install /absolute/path/anima-modules-1.0.0.tgz
```

```js
import {packageFiles, recoverRelease, readRegistry} from '@anima/modules';
// The smaller package/manifest-only entry point is also available:
import {canonicalManifest} from '@anima/modules/core';
```

The package includes standalone browser ESM bundles with no runtime dependencies or imports back into ANIMA's source tree. Node consumers need the project's supported modern Node runtime for native compression primitives. `deployment.mjs` and operator CLIs remain repository tools. This work creates a distributable package; it does not publish the package to the npm registry.

## Package a brick

Create a metadata JSON file:

```json
{
  "name": "notes",
  "version": 1,
  "publisher": "0x1111111111111111111111111111111111111111",
  "entrypoint": "index.html",
  "capabilities": ["identity.read"]
}
```

Use the actual publishing account address, then:

```sh
node scripts/modules-package.mjs --input ./my-module --metadata ./module-options.json --output ./module-package --compression gzip
node scripts/modules-package.mjs --legacy-html ./standalone.html --metadata ./module-options.json --output ./legacy-package --compression raw
```

Both outputs contain canonical `manifest.json`, `archive.bin`, deduplicated chunk files, and a receipt. Existing output directories and symlinks are rejected. The directory packager parses JavaScript and inline HTML module imports without executing source. Dependencies must be literal, resolvable local package paths. The portable core validates declared file paths/import closure; the CLI additionally inspects actual JavaScript imports. Neither constitutes a security audit of source.

Gzip bytes are deterministic for repeated builds using the same compressor/runtime; the committed stored-byte hash remains authoritative across different implementations. File order and JSON key order are deterministic. Files remain byte-exact after expansion. External legacy resources are flagged in the receipt and may be unavailable in the restricted offline host.

## Canonical release identity

`canonicalManifest(manifest)` returns UTF-8 JSON text with object keys sorted by Unicode code-unit order, no whitespace, no unsupported fields, and only safe integer numbers. Arrays retain their specified order; dependencies and capabilities must be sorted and unique. The versioned `schema` field is included in the hashed bytes.

The portable **manifest hash** is SHA-256 of those canonical bytes. Packaging returns `manifestHash` and `contentId`, which currently have that same value. It cannot know a deployed release ID before archive addresses exist.

The deployed **release ID** exactly matches `ExtensionReleaseRegistry.hashRelease`:

```text
keccak256(abi.encode(
  keccak256("anima.extension-release/1"),
  publisher,
  ReleaseInput,
  manifestHash
))
```

`releaseInput(manifest, descriptor)` binds these fields:

| ABI field | Canonical manifest binding |
|---|---|
| `moduleId` | SHA-256 of UTF-8 module name |
| `version` | Manifest version |
| `payload` | Trusted archive location/schema/code hash plus both byte lengths and SHA-256 hashes |
| `runtime` | SHA-256 of format, `files` or `html` |
| `hostAPI` | SHA-256 of `anima.host/1` |
| `stateSchema` | Exact schema commitment, zero for stateless modules |
| `capabilities` | Sorted SHA-256 values of approved capability names |
| `dependencies` | Sorted exact **deployed release IDs**, not portable manifest hashes |

The host also checks the manifest's publisher and computed module namespace. The contract treats JSON as opaque; clients must not skip these cross-checks. Predecessor, entrypoint, compression, resource profile and optional source/build provenance are committed through the manifest hash. A provenance hash identifies bytes; it is not an audit or a claim that tests passed.

`resolveReleaseGraph` is the portable resolver: by default its callback supplies manifests identified by their portable manifest hashes. Its explicit `identityFor` adapter supports another authenticated identity system. `recoverRelease` supplies the strict onchain record validator, recomputes each deployed ID, and resolves deployed dependency IDs. Call `recoverRelease` for registry packages rather than feeding chain IDs into the default portable resolver.

## Capabilities and shared parts

The host profile accepts `identity.read`, `state.read`, `state.write`, `transaction.propose`, and `journal.propose`. State capabilities require a nonzero schema. Installing any capability creates no spending grant.

Dependencies stay in separate namespaces. The host's `package.read` request, under `identity.read`, can return a bounded file from the already verified selected/dependency closure. `readVerifiedFile(recovered, releaseId, path)` enforces the closure and path/size bound and returns a copy. This supports shared typed scores, visuals, data and recipes without arbitrary URLs or ambiguous cross-release file imports. A package cannot fetch an unrelated release through that bridge.

## Recover packages and saved state

```sh
node scripts/modules-recover.mjs --rpc https://YOUR_RPC --chain 1 --registry RELEASE_REGISTRY --release RELEASE_ID --output ./recovered-release
node scripts/modules-recover.mjs --rpc https://YOUR_RPC --chain 1 --registry TOKEN_MODULE_REGISTRY --token 1 --output ./recovered-token
```

The release form saves root and dependency manifests, compressed/raw archives and original files. The token form verifies installation history roots and current selections, recovers retained historical release/dependency packages, and recovers state history from the union of the installed-module catalog and the independent state-namespace catalog. This includes snapshots staged before a module was ever activated, even when the original transaction receipt has been lost. It saves context, public receipts, state records and exact payloads. The state catalog is paginated separately and does not change the active installation root or activate code.

Recovery uses one chain/block-number snapshot, checks its block hash again before returning, and rejects wrong chain, changed blocks, metadata mismatches, substituted bytes and unsupported formats. Every `eth_call` has a 10,000,000 gas cap and a bounded response. The CLI restricts methods to reads, rejects redirects, streams JSON with a 3 MiB per-response cap, and times out after 30 seconds. URLs and credentials are not written to receipts. Recovery trusts the chosen RPC's chain data; it is not an independent consensus/light-client proof.

Archive state is raw only when its stored/expanded lengths and hashes match; otherwise this host profile requires gzip, bounded to the committed expanded length and verified digest. Unsupported encoding fails. Direct state may be empty; its exact SHA-256 still participates in its commitment.

## Installation and migration reviews

`readRegistry` returns owner, account, epoch, mode, action nonce, current catalog root, bounded module/history pages, registry addresses and snapshot. `encodeInstall`/`encodeActivate`, `encodeDisable`, `encodeWriteState`, and `encodeStageState` return unsigned `account.execute` calls plus review preconditions. `assertCurrentContext` rechecks owner/account/epoch/root/action nonce/mode immediately before the external wallet review. The wallet remains responsible for the explicit signing action.

These owner-call recipes support Bound mode. Proof-authorized account mode requires its separate authorization flow and is intentionally rejected by this adapter.

Compatible same-schema updates reuse the selected state head. A schema change stages explicit immutable bytes first, then a reviewed `activate` call selects the new release and prepared state atomically. Staging changes no active selection. Activation rechecks parent/root/epoch. No migration JavaScript runs implicitly, and a code rollback never claims to undo payments. Incompatible historical state must be restaged as an explicit new branch. NFT transfer invalidates former-owner review authority; retained public module state remains attached to its NFT namespace.

## Deployment and public receipts

Prepare the archive calls from a verified package and the current chain nonces:

```sh
node scripts/modules-plan-package.mjs --package ./module-package --rpc https://YOUR_RPC --chain 11155111 --factory FACTORY_ADDRESS --publisher YOUR_PUBLISHER_ADDRESS --output archive-plan.json
```

To reuse already deployed chunks, add `--reuse ./chunk-addresses.json`, a JSON object mapping payload SHA-256 hashes to `AppChunk` addresses. The CLI verifies those bytes onchain. It compiles the local `AppChunk` source with the project's pinned Solidity compiler and records the source hash, compiler version and exact settings. No transaction is sent. Review and execute the exact ordered calls through the appropriate wallet; preserve their receipts.

Once the archive exists, prepare its publication:

```sh
node scripts/modules-plan-package.mjs --package ./module-package --rpc https://YOUR_RPC --chain 11155111 --registry RELEASE_REGISTRY --archive DEPLOYED_ARCHIVE_ADDRESS --schema 1 --output publish-plan.json
```

Use archive schema `2` for a directory plan. This phase verifies all deployed archive bytes, checks registration in the release registry's trusted factory, and simulates the exact publication to detect version or dependency conflicts. It emits the unsigned call and expected deployed release ID. Both phases require a fresh output file, bound read responses and exclude RPC URLs/signing material. The archive phase also records the factory code hash and explicit publisher/factory nonces; concurrent deployments require another reviewed plan.

`planArchiveDeployment` emits ordered unsigned chunk/factory calls, predicts addresses from explicit publisher/factory nonces, and reuses matching chunk hashes. V1 wraps up to 64 chunks; larger archives use up to 16 trusted leaves of 32 chunks. New payload chunks and wrapper readers remain distinct deployment costs. A publisher who reuses every payload still deploys a wrapper unless it explicitly reuses an already trusted archive.

Run `validateDeploymentPlan` immediately before review: it checks chain, pending publisher nonce, factory creation nonce, existing bytecode and reused chunk bytes. `preparePublishRecipe` is a separate concrete phase after the archive is deployed and its actual code hash can be read. `createDeploymentJournal`, `appendDeploymentReceipt` and `reconcileDeploymentJournal` record and reverify public transaction/receipt/block/code evidence. A nonce or reorganization conflict stops resume; the helper never silently regenerates or broadcasts a replacement.

## Host bounds and conformance

This host profile is deliberately narrower than some underlying contracts:

| Resource | SDK bound |
|---|---:|
| Canonical manifest | 16 KiB |
| File entries per package | 512 |
| Stored archive | 512 × 23,000 bytes |
| Expanded package | 16 MiB |
| Direct release dependencies | 16 |
| Selected dependency closure | 64 releases, depth 16, 64 MiB expanded |
| Catalog/history page | 64 records |
| Default full token export | 4,096 records per bounded collection; 256 MiB recovered bytes |
| Direct state record | 32 KiB |
| Default shared-file response | 64 KiB |

The archive factory accepts an expanded descriptor up to 64 MiB, but this SDK rejects a single expanded package/state above 16 MiB. This is a documented interoperability/resource profile, not a claim that the contract or the NFT has infinite memory.

Run the focused conformance evidence:

```sh
node --test test/modules/sdk.test.mjs test/modules/sdk.integration.test.mjs
```

The native integration fixture uses actual ANIMA NFT/account contracts. It covers deployed/portable hash separation, selected dependency recovery, manifest/ABI substitution, same-NFT installation, state migration/history recovery, corruption/reorganization rejection, real deduplicated deployment plans and public receipt reconciliation. Compiler-derived chain tests are local evidence; no funded public deployment is implied.
