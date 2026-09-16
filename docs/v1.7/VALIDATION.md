# v1.7 — Recorded validation

**Scope:** preserved original optical NFT plus an additive journal, native cryptographic routines, activity-derived field, and uncompiled Solidity. No deployment, production custody, trading-performance result, personal authentication, independent audit or artistic-quality certification is asserted.

## Current results

| Gate | Actual result | Boundary |
|---|---|---|
| Combined `npm run validate:ui` | **222 passed, 0 failed** | 178 inherited + 39 memory/model/crypto/field + 5 controller lifecycle checks |
| Memory engine/crypto/field suite | **39 passed** | Included in 222; native Node Web Crypto, actual Wasm pixels, local model |
| Controller cleanup/race suite | **5 passed** | Included in 222; actual controller functions with narrow VM UI/async stubs, not browser crypto |
| Actual Chromium inherited workflow | **64 passed, 0 failed** | Exact current HTML |
| Actual Chromium operating workflow | **66 passed, 0 failed** | Exact current HTML, library/work/all five laboratory mechanisms |
| Actual Chromium new memory workflow | **41 passed, 0 failed** | Public journal, ciphertext preservation and crypto-unavailable refusal, morphology, mobile and export |
| Uncaught browser exceptions | **0 observed** | Recorded scenarios, not exhaustive proof |
| Automatic wallet or network requests | **0 observed** | Recorded local flows; optional inherited testnet client remains separate |
| Native GLES versus lived Wasm field | **6 passed, 0 failed** | Mean RGB error criterion <= 2/255 at 180 x 120; not browser WebGL |
| Original preservation | **Byte-identical after removing the additive layer** | Original shader, Wasm, reference HTML and original source unchanged |
| Zero-life actual Wasm image | **Byte-identical to original field in tested case** | Included in model suite; not all-platform equivalence |
| Application archive | **18 local chunks; exact reassembly** | 409,658 bytes; all deployed addresses remain null |
| Solidity compilation attempt | **Failed before compiler execution** | `ERR_MODULE_NOT_FOUND: solc`; exit 1 |
| Actual EVM / real PoolManager / wallet transactions | **Not run** | No claim based on JavaScript, native math or source inspection |
| Secure-browser encrypted end-to-end | **Not run** | Managed browser's permitted opaque origin has no native `crypto.subtle` |
| Independent security audit | **Not performed** | Native crypto primitives and tests do not constitute an audit |

The browser totals are **171 checks**, not additional contract tests. Source files were reviewed and a complete compiler input for 42 Solidity source files was prepared; this is not parsing or compilation. Actual build and reassembly/fresh-extraction evidence are separately recorded in packaging metadata.

## Hash binding

Final HTML SHA-256: `1a08e36afe93c0233ed58220b0f2bc62245c22fb765989df013a5aced0b1025c`  
Original approved HTML SHA-256: `6b1fb23f63cf5aa65283b8be2f1446dddae38622b7ea8c164249c8cc74146bb6`

All three current browser JSON reports identify the final HTML hash above. `reports/v1.7/preservation.json` identifies original embedded assets; `component-hashes.json` identifies the new modules and field. Fingerprints identify bytes, not authentic ownership, independent publication, security, value or beauty.

## What the new checks actually exercise

The model/crypto suite covers optional swaps; drafts without spending; actual AES-GCM Unicode roundtrip; random salt/IV separation; padded ciphertext; wrong password, changed header and damaged ciphertext rejection; explicit public mode; unknown/oversized fields; standalone memory without a debit; imprint opt-out; exact-plan note/fill order and rollback; stale audit/context and replay; append-only reflections; historical author after sale without acquiring the new owner's form authority; ciphertext-only restoration; structural/inner-hash checks; fabricated fill values; explicit old-archive migration; order-sensitive deterministic morphology; separate artifacts/categories; bounded repeated input; read-only projections; original-vs-zero lived Wasm pixels; and genuine changed luminance structure.

One additional regression proves that an opted-out memory does not indirectly affect a subsequent otherwise identical swap projection. The reducer intentionally excludes unrelated global receipt-chain sequence references when deriving its selected visual input, while retaining the actual full audit history independently.

Controller lifecycle tests exercise clearing private reviews, bodies, passphrases, drafts and search references; leaving unrelated trade reviews intact; and rejecting late encrypt/decrypt results after lock or persona changes. These tests stub asynchronous completion so the branch is deterministic. Actual cryptography is tested separately, not faked by those stubs.

The new browser flow uses real controls to write a reason, review, swap, inspect received quantities, append a reflection, write a general memory, omit its form influence, perform an unjournaled swap and lock, post conversation, inspect historical activity, compare original, return present, export fills, download and restore an archive, import an encrypted fixture and verify refusal without native crypto, change persona and inspect 390 x 844 layouts. It also tests literal markup-like text rather than executing it.

## Rendering evidence and limits

The new native field is compiled from common scalar source to GLSL and Wasm. Six parity cases test zero parameters, a decision-like vector, mixed activity, negative and positive bounds, and alternating bounds. Observed mean RGB errors range from **0.4609 to 0.5032 out of 255**. Maximum per-channel errors range from **5 to 22 out of 255** in those cases. The accepted criterion is mean <= 2/255, not exact per-pixel equivalence. These results do not inherit the earlier v1.2 report's maximum-one-level assertion.

Chromium ran the actual embedded Wasm optical field. Native GLES compilation/rendering is separate evidence; browser WebGL and GPU context restoration are not certified by it. The field updates geometry/density coordinates, not just a hue. Actual desktop/mobile screenshots were inspected. The original and lived-form screenshots use recorded app states; they are not generated artwork. Screenshots may contain intentionally hostile-looking test text as literal text.

Smooth presentation and finite render buffers do not establish a universal frame rate. Numeric differences across GPUs, larger activity histories, physical devices and long-duration sessions require additional testing. Historical form playback means past **activity on the current base genome**, not a complete combined replay of original Evolve snapshots.

## Browser and privacy limits

Managed Chromium 144.0.7559.96 permits the exact release HTML through `set_content`; `file://` and localhost navigation were policy-blocked. In-memory Web Storage is explicitly installed for repeatable storage tests. No rendering or secure-context restriction was bypassed. These tests do not establish file-origin persistence, real concurrent tabs, HTTPS wallet extensions, physical mobile hardware, or durable custody.

Native Web Crypto is absent in that permitted opaque page. Browser tests confirm that encrypted save/decrypt refuses rather than producing plaintext. An encrypted fixture produced by the actual Node crypto module is imported through the UI and remains opaque. Encryption/decryption roundtrip itself passed under native Node Web Crypto; browser-native private creation/read/reload in a real secure context remains an outstanding gate.

Private session clearing removes application references and redraws relevant views, but is not guaranteed secure memory erasure. Export excludes passphrases and decrypted bodies. Public headers and approximate ciphertext sizes remain visible. Rewriting an entire local history can create a new internally consistent archive; checksums are not signatures or chain finality. Replacing the demo actor is not authentication.

## Source and unresolved chain work

`MemoryLedger.sol` and `JournalSwapRouter.sol` are new, uncompiled source. Their full-byte storage and exact-input journaled swap cannot be called a tested onchain implementation. Local swap-and-lock is supported, while the new source router's output-to-TimeVault integration is explicitly missing. The new source ledger traces its own note/fill events only; protocol-wide authenticated event admission, reorg handling, finality and onchain rendering/metadata linkage remain absent.

Original account/Sovereign/history guards are preserved. The local memory model is stricter than the personal-note Solidity path, which permits authorized personal notes independent of account spending. No old contract or immutable account was upgraded by creating this ZIP.

## Reproduce

```sh
npm run validate:ui
npm run test:memory
npm run field:life
npm run test:life-parity
npm run test:browser
npm run app:archive
npm run compile
```

The first command uses Node built-ins. Browser and graphics commands need the documented tools. Compilation requires the missing pinned solc dependency. See `ONCHAIN-GATES.md` for the actual integration tests and source/data differences still required. Historical reports under other version directories describe their own versions only.
