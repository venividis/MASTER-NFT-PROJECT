# v1.5 — Recorded validation

**Scope:** approved v1.2 optical presentation plus additive instruments, local outcome/gift model, research, and experimental uncompiled Solidity. This report does not certify artistic quality, a blockchain deployment, or production custody.

## Results actually obtained

| Gate | Result | Evidence and boundary |
|---|---|---|
| `npm run validate:ui` | **135 passed; 0 failed** | `reports/v1.5/ui-tests.log`: original model/codec/field/server checks, inherited financial model, 36 new instrument checks; includes current source syntax validation |
| New instrument suite alone | **36 passed; 0 failed** | `engine-tests.log`; subset of the 135, not additional tests |
| Actual Chromium interactions | **64 passed; 0 failed** | `browser-results.json`, actual standalone HTML; Chromium 144.0.7559.96 |
| Uncaught browser exceptions | **0 observed** | Recorded scenarios only |
| Automatic network or wallet requests | **0 observed** | Recorded new-instrument scenarios; original optional testnet client remains optional |
| Original preservation | **Byte-identical after removal of the one added layer** | `preservation.json`; original HTML fingerprint and every embedded optical asset checked |
| Local HTML archive | **13 chunks; exact reassembly** | `onchain-app/manifest.json`; every deployed-address field is null |
| Solidity compilation | **Failed before compiler execution** | `solidity-attempt.log`: `ERR_MODULE_NOT_FOUND: solc` |
| EVM, real PoolManager, wallet-driven testnet, ZK/TEE, bridge, private-room cryptography | **Not performed** | No inferred success from JavaScript checks |
| Independent security audit | **Not performed** | Neither source review nor an invariant test suite constitutes an audit |

## What the model checks cover

Typed input validation; unmodified original assets; read-only planning; audit/context/nonce binding; expired and stale reviews; harmless unrelated chat versus changed financial state; minimum-output failure rollback; swap-to-lock; gift offer/acceptance/return/release; recipient authority; rejection of early or duplicate release; donor recall removed after acceptance; recipient-account versus personal-wallet semantics; causal receipt links; receipt discussion; historical authorship; room invitation epochs; archive consistency and tamper rejection.

One test executes **100 sequential swap/gift lifecycle trials** and checks conservation of the tracked ETH and AUR supplies at each step. Another checks **5,000 proportional-allocation input vectors**, explicit dust, and a separate test checks **398 split-bid comparisons**. The LP-fee test examines each integer second from zero through 86,401. These are deterministic model/arithmetic checks, not a formal proof about arbitrary EVM behavior, auctions, prices, or malicious assets.

## What the browser checks cover

Actual app boot and original renderer; initially closed instruments; review-before-mutation; swap-and-lock; direct lock; view-only time projection; gift recipient acceptance and fixed-beneficiary release; causal receipts and discussions; literal untrusted text; accepted room invitations and member removal; retained authorship; World access independent of room removal; launch/contribution/withdrawal/close/settle/claim; commons navigation; estate inventory inspection/acquisition/listing/cancellation; capability status; real file download; storage restoration; corrupt-save preservation and explicit valid import recovery; original Evolve; read-only history and Sovereign refusal; mobile layouts for all six tabs; no automatic wallet/network calls.

## Browser and rendering limitations

Managed Chromium is exercised with `page.set_content` using the exact final HTML. Storage scenarios use an injected in-memory Web Storage adapter. They do not certify native file-origin storage, HTTPS cross-tab locking, extensions, or physical mobile devices. Persona and selected-view changes alone are ephemeral until another saved operation; reconstruction is checked against the actual persisted snapshot.

WebGL was unavailable in this browser environment. The original embedded **WebAssembly optical field** ran; no policy bypass or replacement renderer was used. Actual screenshots of the default organism and new desktop/mobile instruments were inspected. These do not establish hardware frame rates or guarantee anyone's aesthetic judgment.

## Errors found and corrected during this iteration

The initial bundle had a helper-name collision with the original codec; the helper was renamed before the final checks. An inaccessible Storage API initially looked like corrupt data; the UI now distinguishes those cases and offers explicit validated import recovery. Removed members initially had an enabled composer despite model rejection; the composer now shows their lack of posting permission. The market now exposes listing cancellation. Gift archive validation now checks origin data, phase receipts, identifiers, times, and recipient types rather than trusting a recomputed outer checksum alone.

The gift-aware marketplace integration is still incomplete: the inherited contract manifest does not verify pending gift-module rights. The new interface blocks affected listings, but that interface rule is **not** an onchain guarantee. The new Solidity gift router remains uncompiled; it is not a certified fix or deployed capability.

## Fingerprints

- Final HTML: **280,441 bytes**
- Final HTML SHA-256: `90c544548f8bf5b6b2e26aa8978cb912fb788ca84c264f187ce47f45948caea0`
- Approved v1.2 HTML SHA-256: `6b1fb23f63cf5aa65283b8be2f1446dddae38622b7ea8c164249c8cc74146bb6`
- Optical asset hashes: `reports/v1.5/preservation.json`

Hashes identify bytes. They are not signatures, ownership proofs, chain finality, a security audit, or a measure of beauty.

## Reproduction

```sh
npm run validate:ui
npm run test:browser
npm run app:archive
npm run compile
```

The first command uses Node built-ins. Browser testing requires additional Python Playwright/Chromium tooling. Compilation requires the missing pinned package. No prior report's test count has been silently promoted to a current blockchain result. Clean-extraction packaging evidence accompanies the final archive separately.
