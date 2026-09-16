# Confluence 2.0 validation — 2026-09-06

## Fresh results

- **222/222** inherited UI/model/crypto/field/controller tests passed through `npm run validate:ui`.
- **2/2** additional archive tests passed: SHA-256 boundary vectors, chain/block-pinned chunk recovery, digest rejection, complete local restore, mixed-origin rejection and quota rollback. Total fresh named tests: **245**.
- **21/21** combined Confluence and EVM/agent/verifier tests passed. The exact run output is `reports/confluence/evm-and-core-tests.txt`.
- **103 Solidity compilation entries** built with `solc 0.8.30`, optimizer 1,000 runs, viaIR, Shanghai. This count includes interfaces and libraries; it is not 103 separately deployed products. Runtime size checks passed below EIP-170. Largest runtime was the master collection at 19,823 bytes. Exact sizes are in `reports/contract-sizes.json`.
- New tests verify deterministic chain-qualified identities across 256 seeds with equal capabilities; bounded projection; integer allocation conservation including large values and dust; unrestricted recipient policy; game completion and score accounting; world connectivity; native zero-address ABI encoding.
- New real local EVM tests verify NFT-owned fee configuration, immutable earned claims across configuration and custody changes, owned onchain cartridge publishing and controller changes, threshold-two setup and distinct signatures, and Base64 vectors across short/aligned/partial byte groups.
- Existing EVM tests now pass through awakening, owner/session actions, sovereignty, proof actions, custody changes and tokenURI JSON/SVG decoding. Operating tests cover reserve rounding, loss sharing, credit/option exits and transfer-invalidated compartment permissions.
- Build verification passed for authored JavaScript syntax, referenced HTML assets, all 25 onchain chunk hashes, full archive hash, gzip expansion and the ten embedded module imports.
- The static heuristic scan permits intentional assembly storage only in three exact-hash-pinned upstream Solady files. This is documented in `test/confluence/vendor-storage-pins.json`, not a blanket vendor exception or independent security audit.

## Failures that led to repairs

The supplied V4GenesisMarket did not parse. The original Base64 encoder skipped its first 32 bytes and broke metadata JSON. Both are fixed and exercised by fresh tests. A threshold-two verifier could not bootstrap; current invitations could survive a room-owner epoch change; unsafe root-account nesting and conflicting agent metadata were possible. Source corrections are listed in ARCHITECTURE.md.

The original EVM fixtures relied on unsupported Ganache personal_sign, cached rejected estimateGas requests and unbuffered gas estimates. Fixtures now use locally generated test keys, disabled RPC cache and an explicit gas margin. Ganache’s optional native uWS package is unavailable for Node 24; its JavaScript fallback runs successfully.

The retained IPSEITY donor contains a truncated standalone pool probe. It is not imported by the master application. The authored-source gate does not certify unmodified donor trees.

## Scope limits

No live public-chain transactions were submitted. No browser end-to-end, real-wallet, responsive screenshot, GPU execution or secure-browser memory tests were run in this session. CPU-only particle projections were used to inspect geometry; the system EGL library was unavailable, so those images are not browser/GPU evidence. Responsive layouts, reduced motion and keyboard controls are implemented but need device review.

The separately pinned Uniswap v4 donor includes real PoolManager source/tests and its original evidence. Those Cancun-specific tests were inspected, not rerun under the master Shanghai suite. Pool creation/liquidity, converters and every economic panel are not universally live-connected. ZkVM adapter tests use mock proof gateways, not a production proof system.

The complete ephemeral deployment succeeded: 25 AppChunks, 567,846 runtime bytes and 43 named deployed addresses, including the collection, account factory, runtime/renderer, proof components, fee router, launch factory, cartridge binding/registry and supporting economic modules. Raw stored bytes matched the source, tokenURI JSON parsed, both inline loader scripts parsed, and the actual compact reader recovered every byte through local RPC with the expected SHA-256. Evidence is in `reports/confluence/local-deployment.json`; these addresses are ephemeral local fixtures and must never be presented as live deployments.

## 2.0.1 mobile startup correction

The user supplied a Brave/Android screenshot showing shader link rejection: shared `halo` precision differed between vertex and fragment stages. The earlier 245 tests did not execute these WebGL shaders and did not catch this defect. Shared `halo`, `light` and `tint` declarations now explicitly use matching mediump precision.

Four new regression checks pass: strict shared shader interface matching, failed-link recovery on a fresh 2D canvas, context-loss/restoration failure recovery, and initial WebGL unavailability. Fallback camera pitch and zoom now affect projection. A startup failure reopens the original experience with a working retry action. The mobile decorative caption is hidden to avoid the Memory portal overlap visible in the supplied screenshot.

These checks use controlled graphics/context test doubles; they are not real-device or GPU execution evidence. Browser/phone rendering has not been reverified by the agent.
