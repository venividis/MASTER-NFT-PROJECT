# Anima Genesis 5.2 — implemented build and project review

Build date: 2026-09-12. Source baseline: registered Anima Genesis commit `511eb6c` (the complete uploaded archive's authored files match this source). This report describes new work and fresh evidence; historical reports elsewhere retain their original scope.

## What was inspected

The complete 1,886-entry input archive was extracted and inventoried. Its authored source was compared to the registered project's current repository. The current source, all module families in `system-manifest.json`, the build/archive/deployment scripts, CI, Genesis renderer/creation code, wallet adapters, source architecture and release documents, and tests were inspected. The GitHub connection was used to resolve the user's available repositories; the archive already retains the cited ANIMA, IPSEITY, console and Dave source trees.

All current JavaScript tests were discovered and run, including the older optical/model tests and the newer Confluence, Spirit, Begins, Genesis, memory, operating, vesting and mint-wallet suites. All Solidity sources in `contracts/src` were freshly compiled. Donor integrations are retained as source/reference trees; they are not all active parts of Genesis and did not all undergo new line-by-line review. This is implementation review and regression evidence, not a claim that every historical line was formally audited.

## Gaps found and changes made

| Finding in supplied release | Implemented result |
| --- | --- |
| “Enter the object” opened the trade panel | Opens a real 3D interior rendered in the original blue object's shader program |
| No free navigation through an interior | Bounded free flight, touch movement, drag look, eight destinations, guided travel and an immediate return to the original |
| Geometry at home did not follow all visual seed previews | Validated preview identity now reaches the underlying optical renderer; returning restores the original identity |
| Generated identity could be left invalid after a rejected input | Invalid seeds do not replace the current preview identity |
| Expanded audio stayed tuned to an earlier seed | Live oscillator frequencies retune smoothly with the selected identity |
| Several real contracts were accessible only through raw calldata composition | Typed Onchain instruments desk for swaps, atomic trade inscriptions, deposits/releases, public memories and room messages |
| Wallet reviews were not bound to custody epochs | Prepared transactions are invalidated after transfer out and back, disconnection, or network/account changes |
| Failed reconnects could retain the previous connected status | Reconnect closes old authority first; a new context is installed only when verified |
| Slow preparation could restore a review after disconnect or changed terms | Revision/epoch checks and form-generation checks discard stale results |
| Duplicate sending could reuse a review during asynchronous checks | A send consumes its review before simulation and wallet signing |
| Receipt labels could use a new wallet context after an in-flight send | Receipts retain the reviewed chain, account, collection and token |
| Local deployment sealed WorldLedger without its estate exchange | EstateExchange is installed before sealing; the shared fixture verifies installation |
| Commitment roster omitted several deployed operating obligations | The local stack includes vault, exits, editions, work, shelves, gifts, instruments, and mandatory cell inventory |
| The complete local fixture disappeared at exit | Added a persistent developer command sharing the verified stack deployment logic |
| CI's optical job omitted dependency installation; the main gate missed new modules | Locked install and a complete recursively discovered test suite now run in CI |
| Start instructions described Confluence rather than Genesis | Replaced with accurate entry, exploration, local runtime, wallet and verification instructions |

## Interior implementation

The exterior radiance function and the approved original HTML are unchanged. At depth zero, the extended shader takes the original path. Entering the object moves through a 2.4-second optical transition into a three-dimensional distance field: a luminous source, translucent central veils, curved meridian ribs, columns, suspended rings and a standing-wave floor. Geometry is evaluated procedurally; the scene uses no rendered background image.

The identity's sixteen bounded axes select radial symmetry, radius, height, rib twist and spectral phase. Camera position, yaw and pitch determine the rendered viewpoint. Eight chamber viewpoints lead back into the existing instruments. Camera input is time-normalized, diagonals are normalized, large time steps are clamped, and radial/vertical bounds keep navigation inside the scene. The camera floats through visual architecture; this is not a collision-physics game.

On a device without WebGL, perspective-projected line geometry preserves the same navigable space and destinations at reduced detail. Reduced motion makes destination transitions immediate. Touch cancellation, lost pointer capture, focus loss, and hidden documents clear held movement. Audio is opt-in and its measured amplitude modulates the floor's standing waves.

## Onchain desk implementation

The desk validates current NFT ownership, collection association, deployed module code and the sealed WorldLedger's installed market/vault. Token amounts use decimals read from the token and integer arithmetic; a swap quote yields an exact minimum output. Temporary ERC20 allowance is cleared within the NFT account's atomic utility call. Native output returns to the NFT account.

An optional publicly acknowledged trade note uses MemoryLedger and its installed JournalSwapRouter. The client checks that the router connects that journal to the reviewed market. The before-note, swap and actual measured fill are atomic. NativeMarket is the tested quotation/settlement implementation here; this work does not present it as Uniswap v4.

The vault desk supports cliff locks and continuous vesting with the NFT account as beneficiary. The release desk rejects another beneficiary's lock and refuses zero currently releasable amounts. A standalone public memory uses an explicit personal owner signature, preserving personal authorship. World messages use the NFT account and retain onchain room access and slow-mode checks. Publication consent must be checked for text submissions. Private encrypted memories retain the existing local workflow.

The generic account composer, original minting path, onchain vesting-exit desk, fee distribution, owner-selected fixed-supply token launch and cartridge loading remain available.

## Fresh evidence

- **326 JavaScript tests pass, zero failures or skips.** The original baseline was 319. Added coverage includes deterministic interior geometry, bounded/frame-rate-stable navigation, destination transitions and perspective clipping; actual local EVM workflows; wrong-module/publication rejection; custody-epoch invalidation and interrupted preparation.
- The actual live desk settles native→token and token→native swaps on NativeMarket, binds a journaled fill, checks zero residual allowances, deposits/releases a real token lock, writes a personal memory and posts from the NFT account. These tests exercise the shipped client adapters, not a separate model implementation.
- **16 native blue-projection cases pass:** ten zero-formation comparisons remain byte-identical across state/viewport changes, with six additional formation renders.
- **Six additional native 3D renders pass:** desktop, portrait, elevated observatory, alternative identity, entry transition and opposite-side view. Rendered pixels were visually inspected. These are native Mesa GLES renders, not browser screenshots.
- Solidity compiles with solc 0.8.30, optimizer/viaIR and Shanghai. The compiler emits 110 entries, including interfaces/libraries. The largest deployed runtime is the master NFT at 19,823 bytes, below the 24,576-byte EIP-170 limit.
- The expanded local stack deploys **59 named entries**, including immutable app chunks and a seeded local test token. The NFT metadata loader recovers the complete application byte-for-byte from local chain storage. Estate module registration is verified before use.
- The archive has **31 immutable chunks** and embeds **32 ES modules**. Exact current bytes and SHA-256 are recorded in `onchain-app/confluence/manifest.json`; runtime recovery evidence is in `reports/confluence/local-deployment.json`.
- JavaScript syntax, local HTML asset references, embedded imports, chunk hashes and gzip expansion pass. The pinned static Solidity heuristic scan passes.
- The proof-kernel Rust suite could not run in this environment because `cargo` is unavailable. Its source was unchanged; CI retains the Rust check.

No browser/device or injected real-wallet end-to-end test was performed in this build. The managed Sites preview workflow only permits browser QA when explicitly requested. Native rendering and Node/EVM tests do not certify all browser layout, GPU drivers or wallet extensions. The persistent command shares the exercised deployment helper; a multi-session user-wallet trial of the persistent process has not been performed.

## What remains separate

| Area | Current boundary |
| --- | --- |
| Public-chain deployment | No public transactions were submitted. Hosted app and local EVM are available; live panels require compatible deployed addresses. |
| Uniswap v4 | Source and donor tests are retained; real PoolManager liquidity and full v4 client integration are not newly implemented here. |
| Fully onchain application | The runtime is recoverable from immutable local-chain chunks. The hosted URL is conventional hosting; this release is not a public-chain mint. |
| Full shared multiplayer / encrypted rooms | Local games and public onchain room posting exist. Network multiplayer and MLS encrypted chat remain integrations. |
| Private agent memory, omnichain transport, production zk proving | Research/adapters are retained; no production end-to-end system is asserted. |
| House / Wager / Wake | Specifications remain specifications; no executor is silently represented as complete. |
| Experimental strategies | Existing local models and source remain. The new deployment does not invent a live strategy, collateral set or promised yield. |
| Hosted exit executor | Source and operator setup remain; no funded, continuously hosted keeper is provisioned. |
| Visual uniqueness | Full identities are deterministic; visual projections are finite and are not guaranteed collision-free. |

## Files and reproducibility

`web/genesis/interior-*` defines geometry and GLSL, `interior.mjs` manages exploration, and `interior.css` styles the functional controls. `live-protocol.mjs` contains real adapters and `live-desk.mjs` renders their forms. `web/confluence/wallet.mjs` holds review/custody fixes.

`npm run validate:genesis` is the complete release gate. `npm run genesis:local` starts the persistent local stack. `scripts/lib/genesis-stack.mjs` is shared by that command and the ephemeral deployment/recovery gate. The complete download retains original references, every integration tree, tests, documentation, source, compiled artifacts and the standalone runtime. `SOURCE-SHA256.json` identifies the final packaged files.
