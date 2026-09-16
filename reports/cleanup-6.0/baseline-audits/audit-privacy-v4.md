# Privacy, v4, mint wallets and vesting exits — read-only review

Reviewed extracted snapshot: `ANIMA-NFT--752926ec2bc8cdc405ee5462aeb8bca4646c73f4`. No source files changed, no external RPC queried, no transactions submitted.

## Main judgment

Keep the actual financial mechanisms and their careful transaction boundaries. The cleanup should remove duplicated entry points, conflicting descriptions, manual deployment plumbing from ordinary user flows, and implications that local rehearsal or locally tested integrations are already usable live services. Privacy is a separate property at each layer; hiding a screen, encrypting a key, shielding balances, and concealing network metadata are four different mechanisms.

The v4 material is substantial implemented work, not merely a set of button labels: there is atomic token/pool/position creation, exact-input swaps, proportional LP redemption, an independent configurable fee hook, real upstream PoolManager accounting tests, and a separate PositionManager encoder. However, these are separate routes with different ownership and execution semantics. They are not one complete integrated configurable launchpad in the main UI.

## Prioritized recommendations

### 1. Integrate the existing configurable hook deliberately; do not delete it because the current launchpad excludes it

- `web/v4/client.mjs:40` hardcodes `hooks:ZeroAddress` for swaps; `:46` submits empty hook data.
- `integrations/console/protocol/v4-hook/src/GenesisV4Launchpad.sol:212–216` constructs only a no-hook pool.
- `web/v4/desk.mjs:46` offers fixed token supply, initial liquidity, immutable LP fee and ticks. There is no hook recipient/splitter editor in that route.
- `OwnerV4FeeHook.sol:90–107` implements owner configuration and ownership transfer; `:109–147` charges exact-input fees with a fee cap/deadline; `:150–190` preserves earned recipients and flushes to a receiver/splitter.
- `v4-hook/README.md:76–81` correctly explains that splitter weights apply at flush time; they are not snapshotted at swap time. `:91–100` says one hook has one policy, fees accrue in the input currency, and this package supplies no live conversion adapter.

Recommendation: one Launch action with explicitly chosen ordinary LP fees or configurable hook economics. Preserve user-selected receiver/weights/token-routing as an advanced mode with its actual dependency status. Keep the administrator-free shielded launch route as an honest separate economic policy. Do not label the present no-hook route as fulfilling arbitrary user-selected fee flows, and do not automatically connect a public creator address to a route intended to shield the creator.

### 2. Replace address-and-RPC setup forms with verified deployment configuration

- `web/v4/desk.mjs:11` has blank factory/router/RPC/fee-signer settings. `:40` exposes chain ID, two deployment addresses, RPC, POI endpoint, broadcaster fee signer, fee token and optional runtime URL.
- `web/v4/client.mjs:13–18` already verifies normalized deployed runtime and immutable PoolManager binding; keep it.
- `web/exit/live.mjs:15` only checks nonempty vault code, its self-reported collection and its self-reported market-code hash. A lookalike contract can answer those getters. This is weaker authentication than the v4 verifier; it is not a demonstrated exploit because the user must select that address and approve funding.
- `web/exit/live-ui.mjs:8` currently asks ordinary users to supply deployed vault and raw token amounts.

Recommendation: a versioned verified-deployment registry, a network selector, token metadata, normal decimal amounts and derived advanced settings. Bring exit-vault runtime/immutable binding checks up to the existing v4 standard before enabling funding. Retain manual deployment imports in an operator/developer screen, including their verification result.

### 3. Fix mint-wallet privacy inconsistency

- `web/privacy/vault.mjs:16–35` encrypts mnemonic, settings, drafts, notes and receipts as a single authenticated envelope.
- `web/burners/vault.mjs:17,24,34` instead stores the encrypted key inside plaintext outer JSON with address, RPC URL, project origin, collection, fixed recovery address, budget and history. `:65,68` also persist pending signed transaction and receipt metadata there.
- The minted-key encryption itself is real: `:31–34` encrypts then decrypts to check the address; `:17` verifies immutable policy signatures.
- `web/burners/desk.mjs:12–14` discards key/review references on background/lock, but its own lock method does not erase already rendered wallet metadata. The full-app v4 hide mechanism covers the screen, while the standalone mint-wallet “Lock all keys” still renders addresses/history (`:19`, `:16`).

Recommendation: encrypt the entire project-wallet record, with a minimal nonsensitive locked index if needed; scrub sensitive rendered content on Lock/Hide using one shared privacy lifecycle. Keep the small independently funded wallet boundary. Do not call the local budget an onchain enforcement mechanism: `web/burners/policy.mjs:21` checks it in JavaScript, and `vault.mjs:27` correctly warns restored backups/other signing apps can bypass it. Funding links remain public (`desk.mjs:16`).

### 4. Keep lazy privacy loading and describe its actual dependency boundary

- `web/privacy/runtime-integrity.mjs:2`: the shipped worker is exactly 15,010,237 bytes, SHA-256 `bfce5d1b1ca272157cf7ef03d4617727dc03d968b918ced6a3a0ecaca3640c7d`. Recomputed from attached bytes; Python gzip compression is 4,636,501 bytes.
- `packages/privacy/bundle-inputs.json` lists 3,275 bundle inputs; lockfile contains 1,138 package entries. Do not pretend all of this authored code was individually audited.
- `web/privacy/bridge.mjs:3–23` verifies bytes before use; minted editions can recover a pinned worker from onchain shards and only use a mirror when explicitly configured.
- `packages/privacy/src/runtime.mjs:20–38` still needs RPC, POI service, RAILGUN providers and Waku peers; `:28–30` initializes the proving engine and artifact store. Browser circuits/services are not eliminated by archiving worker bytes.
- `runtime.mjs:76–77` explicitly states pool/token addresses, amounts, price and timing remain public; `:92–97` uses a broadcaster and waits for receipts; there is no injected public signer fallback.

Recommendation: keep the worker as an optional pinned capability shared across editions, preserve onchain recovery, and show “code archived / external network needed / service ready” as separate states. A broad “fully onchain private app” badge hides necessary distinctions. Do not move the whole worker into initial visual rendering, or write new cryptography merely to reduce its size.

### 5. Make private submission recovery a real flow

- `web/v4/desk.mjs:65` records only `{kind,created}` before broadcast; it writes a receipt after worker completion.
- `packages/privacy/src/runtime.mjs:92–98` gets a transaction hash before waiting, but sends no interim hash event back to the desk. A lock/termination or receipt timeout leaves only the pending marker.
- `desk.mjs:43,57` asks users to inspect balances and then clear pending themselves. Restored backups have local receipts but no detailed chain-derived private history UI.

Recommendation: persist encrypted submission status/hash as soon as obtained, support resume inspection, explain broadcaster/application failure independently, and prevent creating a second order until the original is reconciled. Keep the existing no-blind-resubmission guard. The burner wallet’s signed reservation and exact rebroadcast mechanism (`web/burners/vault.mjs:64–69`) is a good operational model, although private proofs require their own recovery rules.

### 6. One schedule composer and status view, with explicit execution modes

- `web/exit/app.js:2–5` uses human percentages and dates in a local rehearsal; `web/exit/live-ui.mjs:8–11` instead uses comma-separated raw-unit rows in a separate live desk.
- `web/exit/engine.mjs:19,35–45` correctly makes time create eligibility, never a sale. Cancelling preserves maturity; custody changes suspend execution and reauthorization leaves plans paused.
- `agent/exit-keeper.mjs:7–23` is a one-shot CLI, read-only by default, requires a separately funded execution key and explicit budget/hash configuration. It is not a running service. `docs/genesis/EXIT-OPERATOR.md:45–49` says a scheduler/monitoring/funding must be provisioned separately.
- `docs/genesis/EXIT-AND-MINT-SANCTUARY.md:19,34` correctly distinguishes atomic local journal/swap/funding from separate reviewed live transactions.

Recommendation: reuse one user-facing composer for both rehearsal and deployed schedules; render tokens in human units; show keeper status, funding and missed/expired fills. Keep the real vault custody, minimum, cancellation and maturity invariants. Replace any “auto-sell is running” implication with actual executor state.

### 7. Simplify review amounts before adding more transaction features

- `web/v4/desk.mjs:47–48` exposes tick spacing, ppm, basis points, token addresses and positional currency0/currency1.
- `:79,82` renders raw private balances and broadcaster fee units; minimums are before reshielding fees.
- `web/v4/client.mjs:43–46` already gets a real quote and derives minimum output.

Recommendation: main view shows “you spend / expected receive / minimum after fees / all fees / destination / network.” Derive ticks and token units; allow edit in advanced details. Give separate clear choices for public funds and shielded funds, while preserving their separate signing implementations. Avoid hiding the small but material distinction between minimum pool output and minimum balance returned after shielding fees.

### 8. Remove duplicate and historical implementation plumbing

- Exact byte-identical duplicate: `integrations/console/protocol/v4-hook/scripts/position-manager-encoder.mjs` and `integrations/console/lib/v4-position-encoder.mjs` are both 7,169 bytes, SHA-256 `5030a65430e8d85d11e3e5061a8a35fd419bd5d1b2f4b49374551272de1dedb8`.
- `v4-hook/scripts/dependency.cjs:5–7` falls back to historical `../../../tmp/code-review` when local dependency resolution fails. Remove this implicit development path in favor of explicit workspace dependencies.
- `packages/privacy/src/runtime.mjs:7` imports `ethers`, and `packages/privacy/build.mjs:3` resolves `assert` and `crypto-browserify`, without those packages being direct dependencies in its package manifest. Declare directly used packages rather than relying on flattening of transitive dependencies.
- `v4-hook/package.json:7–11` only names the old normal-flow suite as `test`; launchpad tests exist separately. Root scripts may invoke them, but the subpackage default is easy to misunderstand. Make its explicit test matrix authoritative.
- `v4-hook/README.md:38–40` gives obsolete hook/factory sizes 6,607/480 bytes; shipped build-summary lists 5,427/412. `docs/genesis/PRIVACY-AND-V4.md:68` describes older mandatory HTTPS worker recovery whereas current bridge supports shard recovery. These should be historic milestone documents, not the source of current setup truth.

Recommendation: single source for encoder and ABI definitions; a generated current capabilities/deployments/build manifest; historic documents clearly archived. Retain upstream licenses, source pins and useful tests. Vendor audit PDFs/broadcast snapshots belong in dependency/reference material, not evidence that ANIMA itself is audited or deployed.

### 9. Make dense authored code reviewable

Most new JS functions and tests are written as long single lines. `web/burners/vault.mjs` fits key creation, approvals, budgeting, signing, receipts and recovery into 85 dense lines; `web/v4/desk.mjs` puts a whole wallet/transaction UX into 94 dense lines. Format authored source normally and separate storage, transaction planning, execution state and rendering modules. This is a prerequisite for reliable maintenance, not a request for a wholesale rewrite. Preserve behavior with the existing meaningful invariant tests.

## Keep without weakening

- Exact budget approvals, context invalidation, review expiry and pre-send simulation (`web/v4/public-session.mjs:8–15`).
- Private no-public-fallback boundary and worker termination (`packages/privacy/src/runtime.mjs:64–65,94`; `web/privacy/bridge.mjs:38`).
- Authenticated encrypted backups, generation checks and strict runtime integrity checks (`web/privacy/vault.mjs`, `bridge.mjs`, `recover-resource.mjs`).
- Fair LP fee apportionment and final-holder dust (`GenesisV4Launchpad.sol:118–156`), immutable position parameters, no later share minting.
- Fee-hook earned recipient accounting and capped quote acceptance (`OwnerV4FeeHook.sol:117–147,152–179`).
- Burner whitelist, direct-to-burner mint recipients, independent random keys, exact signed reservation, and avoidance of unknown NFT media (`web/burners/policy.mjs:13–17`; `vault.mjs:30–37,63–75`).
- Time never auto-executes trades; fixed minimum/recipient and custody gates stay intact. These are product guarantees, not disposable warnings.

## Verification and coverage

Freshly ran on Node v24.19.0: `node --test test/privacy/bridge.test.mjs test/privacy/desk.test.mjs test/privacy/math.test.mjs test/privacy/resource-recovery.test.mjs test/privacy/vault.test.mjs test/exit/engine.test.mjs` — **59 passed, 0 failed**, approximately 3.86 seconds. These are independent local tests; they do not execute a funded ZK transaction or prove public-chain availability. No dependency installation performed by this reviewer.

Fully read authored text source:

- All `.mjs` under `web/privacy` and all source under `web/v4`, `web/burners`, `web/exit` (generated artifacts inspected structurally/hash metadata rather than treated as authored source).
- All `packages/privacy/src/*`, its build script, package manifest and offline SDK test.
- All four authored Solidity source files under `v4-hook/src`, both test harnesses, both CJS integration suites, all five authored scripts, README and PositionManager documentation.
- All tests under `test/privacy`, `test/burners` and `test/exit`.
- `agent/exit-keeper.mjs`; `docs/genesis/PRIVACY-AND-V4.md`, `EXIT-AND-MINT-SANCTUARY.md`, `EXIT-OPERATOR.md`.
- Parsed package lockfiles, bundle inclusion manifest, build/scenario reports and privacy dependency report; independently hashed bundled worker and encoder copies.
- Inspected relevant upstream PoolManager `unlock/swap/mint/burn` and Hooks before/after-swap delta accounting to trace custom hook calls. Entire vendor tree inventoried (636 files total in v4 package including authored files and reports; about 30.9 MB), not an independent audit of all upstream code/PDFs.

Limits: Did not rerun Anvil/Ganache contract suites, full SDK browser/network startup, actual PositionManager mint, public deployment, browser visual workflows, or funded shielded end-to-end operations. Existing reports honestly label local-only 9 hook scenarios, 10 launchpad scenarios and offline SDK checks. Other review agents cover main protocol contracts, extension privacy modules, main archive/deployment scripts, and surrounding UI integration. This review finds cleanup priorities and concrete validation gaps; it does not certify production safety.
