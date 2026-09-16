# Current application browser regression

`current-app.mjs` tests **`dist/index.html`**, the application assembled from the current authored modules. It never reads or serves historical `preview.html`.

The default command verifies contract compilation, v4 compilation and build provenance before and after the browser run. It serves only `dist` on an ephemeral loopback port, creates fresh browser contexts and rejects external requests. It never deploys a contract, contacts a real RPC, reads credentials or imports an existing browser profile.

## Run

Use the project's locked dependencies and a Playwright Chromium installation. The test uses the `playwright` package (the plain browser library, not `@playwright/test`). After installing the pinned dependency:

```sh
npx playwright install --with-deps chromium
npm run build
node test/browser/current-app.mjs
```

Compilation and nested build dependencies must already satisfy the normal project setup. Do not use `--supplied-dist` to make a release check pass when those requirements fail.

To inspect an uploaded, already built artifact independently of its source:

```sh
node test/browser/current-app.mjs --supplied-dist --output=reports/production/browser-supplied-dist
```

This mode labels results `supplied-dist-only`. It cannot establish that the tested bytes correspond to the latest source. Both modes record hashes of the HTML and build manifest and fail if they change during the run. Keep compilation and build mutations sequential with browser testing.

An environment with a preinstalled package may set `ANIMA_PLAYWRIGHT_MODULE` to the absolute path of its `playwright/index.mjs`; ordinary CI should use the project's pinned package. This override affects module resolution only. It does not disable browser policies, change launch flags or supply a browser executable.

## Checks

| Case                                          | Evidence required                                                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop, phone and landscape **emulation**    | Current app boots; original Wasm/WebGL renderer initializes; primary instruments open; dialog fits horizontally; no page/console/resource errors                                  |
| Interior navigation                           | Enter the original object, zoom using the original canvas, open Atlas, return to the saved interior camera and exit using Escape                                                  |
| Original identity                             | Opening instruments and navigating inside preserve the seed, visual identity digest and original audit history                                                                    |
| No wallet                                     | Connecting displays the missing-wallet state; preparing an account operation exposes no signing control and creates no receipt                                                    |
| Rejected connection                           | Only the explicit Connect submission requests an account; EIP-1193 rejection leaves the app disconnected                                                                          |
| Reviewed, cancelled and rejected account call | Exact account, recipient, chain and gas appear before signature request; cancellation sends nothing; rejected signature creates no receipt; retry cannot replay a consumed review |
| Local rehearsal                               | Swap review shows a minimum output without changing local balances/history; cancellation preserves the state and makes no wallet calls                                            |

The wallet cases use an explicitly simulated EIP-1193 provider with deterministic addresses and read results encoded from the actual `IDontFuckingBelieveIt` and `SovereignAccount` artifact ABIs. The named `renderSnapshot` tuple retains the contract's account-before-owner order. Its signing method **always rejects** with code 4001. Unsupported requests fail the test. Passing these cases proves browser handling of those responses; it does **not** prove contract execution, network integration, real wallet behavior or real ownership.

Every invocation creates a unique timestamped subdirectory under `reports/production/browser` (or `--output`). That directory contains its own `results.json` and screenshots; previous evidence is never overwritten or imported. The CLI prints the exact report path. A first report is written before dependency loading or artifact inspection, so a missing package, missing asset or stale build produces a final failed report identifying the failed phase and cases that did not run. Context, browser and server cleanup each receive an independent bounded attempt; cleanup failures also fail the run and remain in its report.

Screenshots support human visual review; there is no claim of artistic or pixel-level approval. There is no physical-phone, extension-wallet, hardware-wallet, external-service, multi-browser or mainnet coverage.

## Runner regression tests

```sh
node --test test/browser/current-app-runner.test.mjs
```

These Node tests verify the exact Solidity/ABI field mapping, a real CLI failure caused by a missing dependency entry, separate evidence directories across failed reruns, missing-asset and stale-build reports, and cleanup rejection/timeout handling. The cleanup tests use plain JavaScript fixture objects and a disposable loopback HTTP server; they do not launch or control a browser. Injected dependency hooks are recorded in their reports and are not used by the ordinary browser CLI. Passing these tests is evidence about the runner, not a browser acceptance pass.

## Initial implementation status

The runner was authored during the September 14, 2026 production baseline. In that session the approved managed browser connected, but attempting to open the local application at `http://127.0.0.1:4174` returned `net::ERR_BLOCKED_BY_CLIENT`. The browser's documented troubleshooting provided no allowed local transport recovery. No browser pass is claimed from that session. The runner must execute in an allowed local/CI browser environment before this gate can be marked complete.
