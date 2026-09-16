# 1.4.0 — Recorded validation

Project: **i dont fucking believe it! / The Interior**  
Release: interactive browser study plus **uncompiled, undeployed Solidity source**.  
No production custody, autonomous AI, privacy, omnichain, or onchain-deployment certification.

## Results actually obtained

| Gate | Result | Exact scope |
|---|---|---|
| Combined `npm run validate:ui` | **99 passed, 0 failed** | 59 inherited model/codec/field/CLI checks rerun plus 40 new kingdom checks; source syntax/JSON check |
| New `model.test.mjs` | **40 passed, 0 failed** | Local BigInt economy, fee schedule, permissions, receipts, rollback, transfer history, import validation; subset of 99 |
| Actual Chromium interaction suite | **65 passed, 0 failed** | Exact standalone HTML through `set_content`, desktop and 390×844 mobile |
| Unhandled browser errors | **0 observed** | Only the recorded scenarios |
| Automatic HTTP/socket/wallet calls | **0 observed** | Recorded new-UI flows, not a claim that archived optional clients have no network code |
| Source-boundary probes | **13 passed** | Source-text tripwires plus translated integer square-root comparison; not Solidity execution |
| Arithmetic comparison | **5,011 inputs matched `math.isqrt`** | One translated sqrt algorithm; not EVM overflow, TickMath, liquidity accounting, or formal verification |
| Local application archive | **19 chunks; byte-identical reassembly** | STOP-prefixed runtime hashes prepared locally; no deployed addresses |
| Solidity compilation attempt | **FAILED before compiler execution** | `ERR_MODULE_NOT_FOUND: solc`; exit 1; `solidity-attempt.log` |
| EVM/v4 integration, bytecode size and gas tests | **NOT RUN** | No compiled artifacts or actual PoolManager execution |
| Rust kernel / real wallet / public-chain transactions | **NOT RUN** | No new proof or deployment result |
| Independent security audit | **NOT PERFORMED** | Source review and local tests do not imply one |

## Browser scenarios

The suite used Chromium **144.0.7559.96**. It exercised the new overlay boot, computed visible scene pixels, reduced motion, opt-in audio, camera-motion pause, six navigation sections, launch review/allocation/contribution/close/settle/claim, swap-and-lock, native vault deposit, whole-estate manifest/purchase/listing, guest acquisition, original custody-at-time history, removed member posting rejection, invitation acceptance, profile filters, reactions, cross-receipt discussion, literal markup handling, custom room configuration, actual export download, restored storage, corrupt storage preservation, original organism access and return, and mobile viewport/composer/manifest behavior.

A read-only future projection was explicitly verified not to modify state or enable early release. Changing the separate rehearsal clock is a distinct labeled operation. All people and balances were fictional local data. Successful UI flows do not execute the supplied Solidity. The local swap is reserve math, not a v4 tick model or live quote.

## Browser limitations

Managed Chromium disallows `file://` navigation. Tests used `page.set_content` with the **exact release HTML bytes** and an injected in-memory Web Storage adapter, without bypassing browser policy or forcing WebGL. This establishes the tested application behavior, not native file-origin persistence, cross-tab safety, wallet extensions, or HTTPS deployment behavior. The new scene uses Canvas 2D procedural projected facets. The archived original renderer's backend is not an end-to-end GPU certification for this release.

Desktop/mobile screenshots were captured from the actual browser app; they are not generated concept images. Clean presentation captures use a fresh fictional state from the same final HTML after the interaction suite. No smooth-frame-rate, all-device, physical refraction, or aesthetic-quality guarantee is inferred from these checks.

## Source review findings and changes

The v4 hook's seed-principal guard originally risked blocking fee collection. Official pinned `Hooks.sol` routes zero liquidity delta through beforeRemoveLiquidity. The guard now rejects **negative** deltas for the seed adapter, while allowing zero-delta fee pokes. This branch was reviewed and source-checked; actual fee harvesting has not been EVM-tested.

The inherited metadata update events incorrectly indexed token-ID arguments for ERC-4906. The event declarations are now unindexed and the interface ID is exposed. The account's internal `_call` accepts memory bytes to match constructed calls. Both are source changes awaiting compilation and integration regression.

## Fingerprints

- Final HTML bytes: **422,850**
- Final HTML SHA-256: `9c68a6d83fd39d7f0f46bf77c83a5ba2e3d2035ff2cd985f00e6416442ae0402`
- Archived v1.3 HTML SHA-256: `feb5cda81c801d626dbcd58ddb30cdfe09a2ff61daed60691df5cc333e92b5cd`
- Original v1.2 input archive SHA-256: `0e2605904e82561a344d49bd5f677b90b25fcff9e0ec7bcc4d0544e1b43fb98d`

Fingerprints identify bytes and bind this report to the tested artifact; they are not proof of ownership, authenticity, safety, or artistic quality. Original version reports elsewhere in the package remain historical and do not certify the new source.

## Reproduction

```sh
npm run validate:ui
npm run test:kingdom
npm run inspect:boundaries
npm run test:browser
npm run app:archive
```

Browser tooling is additional to Node built-ins. `npm run compile` requires the external pinned compiler; it did not run successfully here. Read `docs/v1.4/DEPLOYMENT.md` for the actual-v4, wallet, and migration gates still required. Release packaging results are recorded separately in `packaging.json` after clean ZIP extraction.
