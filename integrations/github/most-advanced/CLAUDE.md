# CLAUDE.md

Guidance for AI assistants working in this repository. Read this before
changing anything; most of what looks odd here is deliberate, documented,
and enforced by a test.

## What this is

IPSEITY — a fully on-chain ERC-721 whose `tokenURI` emits its own control
surface: a self-contained WebGL2 4D renderer plus wallet client, stored as
contract bytecode, returned as a `data:` URI. The same contracts serve an
entire website over `web3://` (ERC-5219), run a per-token AMM whose price
curve *is* the artwork's orientation, and give every token two ERC-6551
accounts. One edition of 4096 tokens is partitioned across five chains by
disjoint id bands with no bridge for the tokens themselves.

There is no server, no IPFS, no indexer, no external dependency anywhere —
on chain or off. That absence is the product. Do not introduce one.

## The build system is not what it looks like

The layout is Foundry-shaped (`foundry.toml`, `src/`, `test/*.t.sol`,
`script/*.s.sol`, `remappings.txt`) but **the `forge` binary is not used and
is typically not installable in this environment** (no route to Foundry's
installer, GitHub, or crates.io). Everything runs through Node:

- `tools/compile.mjs` — compiles `src/` with solc-js (0.8.36, viaIR,
  optimizer 800, cancun — mirroring `foundry.toml`), honours
  `remappings.txt`, and **fails any contract over the EIP-170 24,576-byte
  ceiling** (default CLI invocation only — `--quiet` and library use skip
  the size gate). Writes `out/solc.json`.
- `tools/evm.mjs` — an in-process EVM harness on `@ethereumjs/vm`: deploy,
  call, read, account for gas. All `verify-*` tools run on it.
- `tools/forge.mjs` — **runs the Foundry test suite without Foundry**: a
  cheatcode precompile at the hevm address plus VM hooks implement `prank`,
  `expectRevert`, `warp`, `roll`, `deal`, `etch`. It writes its own minimal
  `forge-std` shim into `lib/forge-std/src/` when none is present (the
  repo's `.gitignore` anchors `/lib/` — do not "fix" that to `lib/`, it
  would swallow `src/lib/`). Supports `--match <substr>`, `--runs`,
  `--seed`, `FORGE_TRACE=1`. It is strictly less than forge: no invariant
  campaigns, no coverage, no traces. If real Foundry is reachable, prefer
  `forge test`.
- `hardhat` exists for exactly one thing: `npx hardhat node` (chain 31337,
  hardfork pinned to cancun — the config comment explains why). Its
  `sources` points at the empty `.hh-empty/` so it never compiles anything.

## Commands

```bash
npm install                      # once; solc, terser, @ethereumjs/*, playwright

npm run shaders                  # tools/glsl-check.mjs — parse/type-check all six GLSL shaders
npm run selftest                 # engine's own keccak/ABI/EIP-712/CREATE2 vs published vectors
npm run build                    # tools/build-engine.mjs — minify → gzip → shards → dist/
npm run forge                    # the .t.sol suites (see above); --match via: node tools/forge.mjs --match seal
npm run fuzz                     # tools/fuzz.mjs — seeded, shrinking property tests
npm run verify                   # tools/verify.mjs — deploy on the in-process EVM, round-trip tokenURI byte-for-byte
npm run gas                      # gas report

npm run check                    # the full 26-step battery; run before claiming anything works
```

Per-subsystem verifiers (each is an adversarial suite for one contract
family): `npm run verify:pool | verify:vault | verify:kernel |
verify:premises | verify:site | verify:parley | verify:timelock |
verify:recover | verify:console | verify:plate | verify:thermal |
verify:instrument`. Some have no npm alias — run directly:
`node tools/verify-curve.mjs`, `verify-port.mjs`, `verify-estate.mjs`,
`verify-launch.mjs`, `verify-portal.mjs`.

Browser-dependent (launch Playwright Chromium): `shots.mjs`,
`testnet-drive.mjs`, `verify-console.mjs`, `verify-instrument.mjs`,
`verify-thermal.mjs`, `probe-emulator.mjs`. Of these, `verify-console`,
`verify-instrument` and `verify-thermal` are inside `npm run check`, so a
full check needs a Playwright browser (`npx playwright install chromium`, or
point `PLAYWRIGHT_BROWSERS_PATH` at an existing one).

Local end-to-end over a real wire:

```bash
npx hardhat node                 # real blocks, real eth_getLogs
node tools/testnet.mjs           # deploy everything + seed + verify over JSON-RPC
node tools/gateway.mjs           # http://localhost:8080 — every GET is an eth_call
node tools/testnet-drive.mjs     # Chromium + injected wallet walks the whole site
```

`tools/testnet.mjs` with `RPC_URL=… PRIVATE_KEY=0x…` deploys to a public
testnet (~40 tx, ~69M gas). `node tools/recover-record.mjs
deployments/<chain>.json` re-reads a recorded deployment off the chain and
exits non-zero on any disagreement. `node tools/port.mjs
status|deploy|quote|echo|walk` deploys and drives the LayerZero commons
port on real chains (same-address-everywhere via a fresh nonce-0 key;
see `OMNICHAIN.md` §5).

## Layout

```
src/                  all Solidity; zero external dependencies, ever
  Ipseity.sol           the token ("the hub") — state, ~12 ERC standards, sealed kernel
  Engine.sol            the HTML document as SSTORE2 shards (head + gap + body), freeze() one-way
  Renderer.sol          tokenURI: three faces, JSON, the gzip loader
  Sigil.sol             on-chain SVG of the 4D solid (fixed-point, 1e9)
  IpseityAccount.sol    "the Reach" — ERC-6551 account: seal, manifests, session keys
  GripVault.sol         "the Grip" — second 6551 account; NO outbound function exists, by design
  Pool.sol              per-token AMM; virtual reserves from the artwork via lib/Curve.sol
  Lease.sol Locker.sol Consign.sol Succession.sol   rentals, timelocks, consignment, inheritance
  Venue.sol             read-only Uniswap v3/v4 aggregator (never routes token-market trades)
  Kiln.sol Facet.sol    memecoin launchpad + Uniswap v4 hooks (Gate, Facet)
  Parley.sol            on-chain messaging: logs only, back-linked, indexer-free; never redeploy
  ParleyPort.sol Roster.sol Nameplate.sol           LayerZero commons bridge, membership reads, ENS
  Premises.sol          the web3:// router (ERC-5219); pages are immutable constructor args
  Chrome.sol Desk*.sol Page*.sol                    site shell / JS clients / HTML pages
  PageConsole.sol ConsoleRead.sol ConsoleSkin.sol   the /c/<id> console
  lib/                  hand-rolled SSTORE2, Base64, Trig, Curve, Tick, Mul, Timelock, Web, Types
  interfaces/           every ERC hand-declared, with the reasoning (Standards.sol, Site.sol)
engine/
  ipseity.html          THE ARTWORK — one self-contained file; this is deployable source, no bundler
  console.js console-lanes.js console.css           the /c console client (separate surface)
test/                 *.t.sol suites + mocks/; run via `npm run forge`, not forge
script/               Forge deploy scripts; Site.s.sol is STALE — tools/site.mjs is authoritative
tools/                the actual build/test/verify/deploy toolchain (~70 scripts)
probe/                measurements, not machinery: nothing here ships or runs in `npm run check`
deployments/          machine-checked deployment records (the authoritative ones)
```

## Architecture in brief

- **Rendering**: `Ipseity.viewOf(id)` → `Renderer.facetURI` → JSON whose
  `animation_url` is the entire HTML app as a nested `data:` URI. The
  engine reads all state from `window.IPSE`, which `tokenURI` writes into
  the gap between Engine's head and body shards. Face 0 is the live
  instrument, face 1 the still SVG sigil, face 2 the quartet. Use
  `tokenURIAt(id, index)` in tests/scripts — `tokenURIs()` returns every
  face at once (~129 KB, dominated by the ~104 KB face 0 document).
- **Two vaults per token**: the Reach (`account(id)`) can act — sealable
  (balance-measurement enforcement, not enumeration), grants bounded
  session keys (`grantSession`: expiry, spend cap, target and selector
  allowlists, all checked every call). The Grip (`grip(id)`) can only
  receive; its security is the *absence* of any spend path.
- **The site**: `Premises.request()` is the whole HTTP surface. Artwork
  routes (`/token/<id>/raw|live|face/<n>|sigil.svg`) are served by Premises
  itself, never through a page — a compromised page can frame the artwork
  but not alter it. Everything else delegates to immutable page addresses;
  adding a page means a new Premises. Pages render HTML server-side; Desks
  carry the browser JS as Solidity string constants plus a JSON config
  block with *on-chain-computed selectors* — the browser ships no keccak,
  no ABI coder, and no floating point for any amount (all amounts are
  BigInt).
- **The market**: one pool per token, holder is the sole LP, the curve's
  virtual reserves derive from the token's orientation word. The curve is
  **anchored** — recomputed only on `openMarket`/`deposit`/`withdraw`/
  `syncCurve`, *never* during a swap (deriving it per-trade was a real,
  fuzz-caught extraction bug). The bond is a ratchet that survives sale.
- **Messaging**: Parley messages are event logs carrying `prev` block
  pointers, so clients walk history with single-block `eth_getLogs` — no
  range scans, no indexer. The archive lives in that contract; redeploying
  Parley ends the conversation. `ParleyPort` federates the commons (room 0
  only) over LayerZero V2 — real receiver ABI (`lzReceive(Origin,…)`,
  `allowInitializePath`, `nextNonce`), no admin/delegate ever, security
  config pinnable only at construction; tokens never bridge
  (`OMNICHAIN.md` argues both halves).
- **Multi-chain**: 4096 ids in five per-chain bands (arithmetic in
  `Nameplate.sol`, mirrored by `BANDS` in `tools/site.mjs` — keep them in
  lockstep). Testnet deployments are rehearsals holding the whole edition.
  Satellites (Pool, Lease, console…) do not exist on every chain — reads
  must degrade like `ConsoleRead` (try/catch **plus** `extcodesize`; `try`
  alone does not survive a codeless address).

## Conventions

- **No external Solidity dependencies.** No OpenZeppelin, no Uniswap
  imports — everything is reproduced in `src/lib/`. Never add an import
  from outside `src/` (tests may import `forge-std/Test.sol` only).
  Peripheral contracts declare their own minimal local interfaces to the
  hub instead of sharing a common file; only site pages use
  `interfaces/Site.sol`. Uniswap v4 structs are deliberately duplicated
  locally in `Kiln.sol` and `Facet.sol` for selector identity — do not
  deduplicate them.
- **Custom errors only** — terse nouns (`Underpaid`, `Shrank`, `SoldOn`).
  No `require(..., "string")`.
- **Comments are load-bearing.** Long narrative box-headers (`/*───…───*/`)
  argue the design and record past bugs in past tense — they are the
  changelog and often quoted by tests. Read them before touching the code
  they guard; never "simplify" code back into a documented bug; match the
  style when editing. The same applies to `engine/*.js/html`.
- **Size discipline**: EIP-170 is the design force. When a contract is
  near the ceiling (DeskTerm ~97%), add a companion contract (the
  `TERM.def(...)` extension point, a split config/script pair, or an
  SSTORE2 shard store) — never grow the file. `via_ir = true` in
  `foundry.toml` is mandatory (the comment explains why); multi-value
  returns get packed into memory structs (`MarketView`) to survive
  stack limits.
- **Escaping is a hard rule**: every string from chain or user passes
  `Web.esc` (HTML) or `Web.jsonEsc` (JSON) on the way out; browser-side
  chain strings reach the DOM through `textContent` only; ERC-20 metadata
  is read through `Web.symbolOf`/`decimalsOf` (staticcall-tolerant,
  bytes32-tolerant). Nothing unescaped may enter SVG or JSON — including
  `Sigil.NAMES`/`SCHLAFLI` (a literal `z<-z2+c` once broke every
  thumbnail).
- **"Zero" and "no answer" are different facts** everywhere — in
  `ConsoleRead.Clocks.reported`, in `_measure`, in the console UI. Never
  collapse them.
- **Money moves by pull** (`owed`/`earned` ledgers). Strict-owner checks
  in money/estate contracts (Lease, Consign, Succession) deliberately
  exclude operators and renters; the hub's `onlyOwner(id)` means holder or
  the token's own Reach — not Ownable. Exact-value patterns (`buy(agreed)`,
  rent's `msg.value`, `minOut` + `deadline`) are front-running defenses.
- **Tests read like statements**: `test_aRaisedPriceMakesTheRentFailRatherThanCostMore`,
  `testFuzz_roundTripNeverProfits`. New tests go in the existing `.t.sol`
  suites (or a new one importing `forge-std/Test.sol`), named as the
  sentence they prove, run with `npm run forge`. Only cheatcodes
  `tools/forge.mjs` implements are available. `INVARIANTS.md` maps every
  numbered invariant to the exact tool and assertion string that enforces
  it — **when you change behavior, update INVARIANTS.md in the same
  change**.
- **Commit messages are declarative sentences**, not conventional-commit
  prefixes: "The console runs, and a browser is the only thing that could
  prove it". Bodies carry measured evidence (addresses, byte counts, what
  was verified vs. assumed). Docs are essayistic, every claim either
  measured or named against its test; refusals are documented as
  prominently as features. No emoji. Match this voice.

## Traps

1. **`engine/ipseity.html` is deployable source.** No bundler. The GLSL
   block between `` const VS3 = ` `` and `const cvs = $("#field")` is
   sliced by marker by `glsl-check.mjs` — don't move it. Terser mangles
   toplevel with `reserved: ["IPSE"]` — a new global that must survive by
   name goes in that list (`tools/build-engine.mjs`). The gzip loader must
   declare **nothing** at global scope (`document.open()` keeps the
   Window; a loader `const` once collided with the minified engine and
   every packed token rendered black while 900 assertions passed). Never
   bake `window.IPSE=` into the head — the build errors on it.
2. **The instrument and the console are separate surfaces.** The
   instrument (`ipseity.html`, modern JS, WebGL2) ships via
   Engine/Renderer; the console (`console.js`/`-lanes.js`/`.css`,
   deliberately conservative ES5-style, no WebGL) ships via SSTORE2 stores
   loaded by `tools/site.mjs`. A site redeploy does not update the
   instrument, nor vice versa.
3. **The console verb words exist twice** — `WORDS` in
   `engine/console.js` and `verbWord` in `PageConsole.sol` — held equal
   string-for-string by `verify-console.mjs` (the JS-only `ALIAS` table is
   checked only in that every alias key names one of the seven words).
   Edit both. Console CSS is stored raw (never gzip it: a script-inflated
   stylesheet means a flash of unstyled console); the JS lives in its own
   single store (ConsoleCore — `console.js` and `console-lanes.js`
   concatenated), separate from the CSS store.
4. **Never**: make any swap path move the curve anchors; turn Pool's
   `curveWord` copy into a live `sectionOf` read; shorten a bond or seal
   (ratchets); add any outbound/admin path to `GripVault`; add admin,
   delegate, or peer mutation to `ParleyPort`; add fees or curators to
   Lease/Locker/Consign; hardcode a `0x` selector in a Desk (selectors are
   keccak'd on chain in `_sel`; the one existing literal is DeskLaunch's
   `decimals()` fallback for chains without DeskUni); claim ERC-7857
   conformance for the sealed
   kernel (`interfaces/Standards.sol` explains why not); remove
   `Premises.resolveMode()`.
5. **`script/Site.s.sol` is stale.** The authoritative site deployment is
   `tools/site.mjs` (`deploySite()` — its `EXPECTED` list must name every
   contract; ordering constraints inside are load-bearing, including a
   nonce-predicted Nameplate address). `script/Deploy.s.sol` exists for
   real Foundry deploys; the README's `Seal.s.sol` reference is stale —
   the file does not exist.
6. **`deployments/*.json` is the truth about what is live**, checked by
   `recover-record.mjs`. `DEPLOYMENTS.md` is an append-only prose log and
   its "Live now" block can lag the JSONs. Never rewrite its history.
7. **`INSCRIPTION.md` is a forward spec** — the contracts it describes
   (`Etch.sol`, `Vitrine.sol`, `lib/Shard.sol`) do not exist yet. Do not
   treat them as code. `probe/` likewise: measurement prototypes with
   known, deliberately unfixed holes (`probe/README.md`), compiled under
   `dirs: ["src","probe"]` but never shipped.
8. **Numbers in the docs drift** (engine byte counts, test counts, gas).
   The verify tools measure; the docs quote a past run. When citing a
   number, re-measure rather than propagating one.
9. `freeze()`, `sealRenderer()`, `setVerifier`, ConsoleSkin `freeze()` are
   one-way; `IpseityAccount`'s address derives from its implementation, so
   that code can never be redeployed. Treat any change near these as
   permanent-by-construction and test accordingly.

## Where to look things up

| Question | File |
|---|---|
| What is this project / commands / measured numbers | `README.md` (esp. "Building it", "Layout", "What was and was not run here") |
| Will this change break a stated guarantee | `INVARIANTS.md` — invariant → exact test that enforces it |
| Console behavior, verbs, layout, refusals | `CONSOLE.md` |
| The human/agent interaction redesign: what shipped, /k, services/2 | `INTERFACE.md` |
| Holding/running other tokens' code, shader splice roadmap | `COMPOSABILITY.md` |
| LayerZero/ONFT research, the port's protocol ABI, federation runbook | `OMNICHAIN.md` |
| Etch/inscription system (unbuilt spec) | `INSCRIPTION.md` |
| What is deployed where, deployment history | `deployments/*.json`, then `DEPLOYMENTS.md` |
| Agent integration: session keys, sealed kernel, ERC-7857 stance | `AGENT.md` |
| Why a standard is or is not claimed | `src/interfaces/Standards.sol` |
