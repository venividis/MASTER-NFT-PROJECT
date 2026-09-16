# 1.2.0 — Recorded validation

**Project:** i dont fucking believe it!  
**Release scope:** optical interface, local study model, explicit testnet-client implementation, and research-protocol revisions.  
**Not a production certification.** The frontend gates passed; Solidity compilation and EVM integration were blocked.

## Results actually obtained

| Gate | Result | Evidence and scope |
|---|---|---|
| `npm run validate:ui` | **59 passed, 0 failed** | `ui-validation.log`: local model, Wasm execution, ABI/Keccak, mock-provider client, verifier CLI and server |
| Browser interaction sequence | **49 passed** | `browser-results.json`: actual standalone HTML, Chromium 144.0.7559.96, WASM optical field |
| Unhandled browser exceptions | **0 observed** | During the recorded sequence, not an exhaustive guarantee |
| Independent native C / JavaScript Keccak comparison | **22 passed** | `keccak-reference.json`; adapted CC0 XKCP reference, up to 8192 bytes and rate-boundary inputs |
| Native GLES / Wasm framebuffer comparison | **6 passed** | `field-parity.json`; same inputs, 240 × 160; largest RGB channel difference **1/255** |
| Downloaded receipt-book verification | **5 receipts consistent** | `receipt-verification.json`; unsigned local consistency, not authenticity |
| Original v1.0 preservation | **Byte-identical** | `source-comparison.json`; original HTML is embedded and available in the new interface |
| Revised Solidity | **NOT COMPILED** | `npm test` stopped at missing `solc`; did not reach EVM tests |
| Rust kernel | **NOT RUN** | Rust/Cargo absent |
| Real wallet/public-chain execution | **NOT PERFORMED** | EIP-1193 client exercised with mocks only |
| ZK/TEE proofs and independent audit | **NOT PERFORMED** | No production/security guarantee inferred |

## Actual user-facing captures

The bound, evolved, folded, lineage, immersed, sovereign and mobile PNGs are screenshots from the running inline browser artifact. They are not generated concept art or native renders composited behind an interface. The browser used the compiled WebAssembly field and normal Canvas display. Final bound, sovereign and mobile captures were visually inspected directly.

`interface-demo.mp4` contains 28 actual browser captures over 23.72 seconds with acquisition-based durations. It is a silent local preview, not a frame-rate benchmark. Events include evolution, the fourth-axis view, spawning, and Ascension. The source preview hash matches the tested artifact.

## Graphics tests and limitations

Browser WebGL was unavailable in this managed environment. No policy was bypassed. Playwright loaded the actual final inline HTML with `set_content`; embedded Wasm executed the field rather than replacing it with the previous wireframe.

Separately, the generated GLSL compiled and rendered under native OpenGL ES 3.2 Mesa. Its framebuffer was compared with actual Wasm output for bound, sovereign, folded, genome-change, evolution-event and ascension-event inputs. The acceptance criterion was mean absolute RGB error at most 2/255 per case; observed mean error was approximately 0.5/255 and maximum error was 1/255. Floating-point implementations need not be bit-identical. Six examples do not establish equivalence for every possible state or every device. This does not certify end-to-end browser GPU behavior.

The CPU renderer uses bounded resolution, workers, and interpolation between completed fields. It is not a claimed 60-frames-per-second physical simulation. Quality and performance depend on the browser and device; no unmeasured hardware claims are attached.

## Browser coverage

The 49 checks cover visible field pixels, opt-in sound/mute, evolution, non-blocking actions, memory editor disposal/non-markup handling, inherited and distinct child genomes, read-only descendant and history views, unchanged parent roots, camera-only folding, immersive controls, consent/cancellation for Ascension, epoch advancement, blocked direct entropy afterward, receipt and portrait downloads, independent local receipt checks, corrupt and valid import handling, saved-state reconstruction, original-reference access, explicit connection settings, connection errors, reduced motion, and narrow-screen control access.

Storage checks used an injected in-memory Web Storage adapter because the test page has an opaque origin. They establish application restoration and corrupt-save handling, not real file-origin/HTTPS storage behavior or cross-tab locking. Native browser GPU, physical mobile hardware, audio perception, wallet extensions, and real network finality still require target-environment tests.

## Protocol and wallet boundaries

Three of 16 inherited Solidity files changed. The revisions add atomic Bound evolution and invalidate sessions on NFT transfer. Regression assertions were added but **were not executed**. See `docs/PROTOCOL-CHANGES-1.2.md` for reasoning and remaining risks. Source review and JavaScript parsing are not Solidity validation.

The explicit client supports configured local/test networks, preflight simulation, context rechecks, confirmation, transaction submission, receipt status, and post-receipt snapshots. Its unit tests use controlled provider mocks. No wallet transaction or deployment was performed here. The deployment script rejects non-allowlisted chain IDs before broadcasting, but that runtime path was not exercised against a real network.

The inherited full gate was actually attempted and failed:

```text
npm test
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'solc'
```

The network-restricted runtime could not install the missing packages; no dependency lock existed in the received archive. A successful network-enabled install, reviewed lock, complete compilation/test run, and independent security review remain required. Do not use this release to custody production value.

The default page is an unsigned local study. It does not authenticate a wallet owner, establish onchain finality, verify AI computation, or generate ZK/TEE proofs. Its salted memory trace is not encrypted recoverable storage. Its fourth-axis effect is an art-directed mathematical deformation, not a claim about physical extra dimensions.

## Reproducibility

```sh
npm run validate:ui
node test/reference/crosscheck.mjs
node scripts/verify-study.mjs reports/browser-export.json
python test/visual/field_parity.py
python test/browser/optical_browser.py
```

The first command needs only the pinned source, included Wasm, and Node built-ins. The native C comparison requires a C compiler. Pixel comparison requires native EGL/GLES, NumPy and Pillow. Browser tests require Playwright and Chromium; they do not override policy restrictions.

`npm run field:build` regenerates Wasm/GLSL with Clang's wasm32 target. `npm run ui:build` rebuilds the standalone HTML. `npm run report:release` records source hashes only; it does not infer tests or issue a PASS verdict.

A separate clean-extraction report accompanies the final ZIP. It records actual CRC checking, fresh-extraction UI tests, rebuild equality and archive SHA-256 rather than assuming them.

## Fingerprints

- Tested standalone HTML SHA-256: `6b1fb23f63cf5aa65283b8be2f1446dddae38622b7ea8c164249c8cc74146bb6`
- Embedded original preview SHA-256: `978c11fd51756d66416eaf2b4ac644bdc356056586189271a4499f60b6962d59`

Fingerprints identify bytes. They do not prove authenticity, artistic quality, safety, or correctness.
