# Independently versioned onchain feature modules

The current archive is `awe.onchain-runtime/3`. Each functional feature is stored in its own immutable archive, with its own name, numeric version, stored-byte SHA-256, expanded-byte SHA-256 and exact dependency versions. This replaces the earlier single-application capacity sharding as the default for new editions. V1 and v2 recovery and deployment planning remain supported.

The complete NFT application remains stored onchain. The browser reads and verifies it; the browser does not execute JavaScript inside the EVM. This change neither patches already minted immutable editions nor claims that a hosted update changes them.

## What is stored

`OnchainModuleDirectory` pins up to 32 named feature archives. Features follow the runtime's actual source groups: launchpad, Commons, governance, privacy, exterior/interior rendering, workshop, shared vendor dependencies and other module directories. Root-level web modules form a foundation package. A separate core-shell package contains the HTML, styles, bundled resources and exact import order.

Each feature contains its actual rewritten JavaScript files and explicit import dependencies. Each feature is gzip-compressed independently and stored as a canonical envelope in `AppChunk`/`OnchainApp`. A large feature may itself use the existing bounded `OnchainAppDirectory` v2 reader. The privacy proving worker retains its separately verified large-resource archive.

The directory root commits the module identities, versions, stored/expanded hashes, lengths, shell index and exact dependency versions. Deployment addresses are excluded from that content commitment: a later directory can reference the same already deployed immutable feature archive when its bytes are unchanged. Each actual archive address and code hash is fixed by the directory constructor, and its declared byte length and digest must match.

Changed feature contents increment that feature's version relative to the previous archive manifest. Unchanged feature bytes retain their version and digest. Dependency versions are pinned by each complete edition, including when an unchanged feature is reused with a changed dependency. No mutable update key, automatic latest-version lookup or CDN participates in recovery.

## Recovery

The token animation embeds its chain, collection, NFT number, seed/genome/state and exact runtime root. Schema 3 first recovers the entire module directory at one block, verifies its content commitment and dependency versions, and then reads each feature archive at the same block. It checks stored hashes, bounded decompression, expanded hashes, module identities, safe paths, duplicate files, complete imports and the shell's exact file order. Only after all features pass does it construct the import map and open the application.

Recovery is currently eager: every feature is verified before application execution. Independently stored/versioned features are real; this is not a claim of lazy first-use loading. A missing, corrupted or incompatible feature blocks that edition rather than silently substituting a hosted implementation.

The generated recovery program is held in immutable `AppChunk` data created by the renderer constructor. The renderer reads those exact bytes with `extcodecopy`. This removes the complete JavaScript recovery program from the renderer's executable runtime and preserves EIP-170 capacity. The constructor signature is unchanged, and the initial code plus constructor parameters stays under EIP-3860. The loader data itself must fit the enforced 23,000-byte `AppChunk` payload limit.

## Build and deployment

- `scripts/lib/runtime-modules.mjs` packages, verifies and reconstructs functional archives.
- `scripts/archive-confluence.mjs` now emits schema 3 by default. `--legacy` retains the earlier v1/v2 single-archive producer when needed.
- `scripts/lib/genesis-deployment.mjs` reads either archive family and produces concrete unsigned deployment calldata, including feature archives and their immutable directory.
- `scripts/lib/genesis-stack.mjs` deploys the actual feature edition in the local mint/recovery fixture and checks exact recovery from the minted token's directory.
- `scripts/verify-confluence.mjs` verifies the reconstructed application, source freshness, complete import closure, all chunks and executable syntax.
- `web/confluence/chain-loader.mjs` dispatches archive versions 1, 2 and 3. `module-loader.mjs` implements functional verification and reconstruction.
- `scripts/recover-runtime.mjs` offers the same read-only recovery outside the browser. Use `--help` for either an NFT collection/number or explicit archive address/hash. It does not request wallet authority or overwrite existing output.

The standard offline plan deploys a complete edition for deterministic reproducibility. The underlying module-directory constructor also accepts reused immutable archives; the integration tests deploy a second edition that reuses three unchanged feature archives. No existing NFT is automatically migrated. To use a changed feature edition, deploy its immutable directory and mint through a renderer bound to that new root.

## Verification

`test/confluence/functional-modules.test.mjs` checks exact reconstruction, independent version increments, unchanged hashes, dependency changes, absent imports, unsafe paths, corrupted chunks and bounded decompression.

`test/confluence/functional-directory.integration.test.mjs` deploys actual immutable feature archives and directories, recovers two different editions, reuses unchanged feature archives, rejects incompatible dependencies and altered bytes, and verifies all archive reads use one pinned block. It also mints a real ANIMA NFT, reads its onchain metadata and executes the embedded recovery program to reconstruct that feature edition. Runtime and initial-code size limits are checked.

Legacy `archive-loader.test.mjs` still exercises the original 64-chunk limit, the v2 512-chunk limit, version/length checks, chain identity and full digest verification. These tests are local verification, not evidence of a funded public deployment.
