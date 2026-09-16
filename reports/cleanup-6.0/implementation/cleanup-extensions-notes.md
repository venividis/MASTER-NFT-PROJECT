# Cleanup: extensions, Worlds, and research proof

Implemented in `/workspace/scratch/3b7470161c8a/ANIMA-NFT-cleanup`. No contract semantics, public ABI, storage layouts, cryptographic setup keys, verifier bytes, or generated release artifacts were changed by this agent. Internal F-number action identifiers are preserved for compatibility; their numbering is no longer ordinary navigation copy.

## Changes

- `worlds/model.mjs`: durable character creation is no longer limited by the historical number of identities. No possessions, orders, towns or NFT characters are deleted.
- `agent/worlds/server.mjs`: active-session admission is serialized with persistence and publication, defaults to 128 identities and can be configured lower. Concurrent joins cannot overbook. Logout/expiry frees a slot; a reconnect replaces the identity's prior bearer even at capacity. NFT ownership and epoch are checked again at serialized login as well as command execution.
- Guests receive a random 256-bit private resume capability; only its SHA-256 hash is persisted in the private portion of `world.json`. A valid code reconnects the same character after logout, expiry or restart; malformed/unknown codes and caller-supplied identity impersonation do not succeed. Previous sessions retire. Authentication hashes are stripped from all API world snapshots and receipt state fingerprints. Receipts bind the public game world.
- Guest inventory, coins, towns and open orders persist indefinitely; offline sellers can receive proceeds and resume later. Existing pre-upgrade guests remain preserved; no identity-only recovery shortcut was introduced.
- `worlds/client.*`: active presence count and map rendering are distinct from historical characters. The guest UI exposes a private code field/copy action, explains retention/control, remembers it only within tab session storage, supports resume, and clears the player's panels on leaving. Remote plaintext origins/redirects are rejected before credentials are sent.
- New `web/extensions/service-origin.mjs` centralizes HTTPS-or-exact-loopback origin validation. Agent host requests additionally omit cookies/referrers, reject redirects and cross-origin routes, validate tokens, abort on desk closure, and clear obsolete purchase reviews on configuration changes. The proof client retains its stricter 127.0.0.1 host requirement for the bundled local prover.
- Extension navigation defaults to Names & sponsored gas. Normal task categories are separate from collapsed specialist finance/custody/proof navigation. Raw ABI/deployment/manual allowance controls are grouped in a closed Developer console; raw sponsored-call encoding is also under a developer workflow.
- Explicit product names describe frozen NFT custody shares, public-arithmetic proof research with development setup, and a small separate world maintained by one operator. The generated-source workshop retains its source review, grants and isolated execution boundaries. The duplicate proof transaction-review container was removed so the main review surface remains authoritative.
- New `packages/rehearsal-proof/setup-guard.mjs` detects committed and transient proof/setup artifacts, including partial setup keys and the generated verifier. Replacement needs the existing explicit flag even in a fresh checkout. `--compile-only` emits circuit check outputs in an isolated `build/compile-check` directory without replacing setup metadata, verifier or published artifacts.
- Updated Worlds, Proof and Agents documentation to describe these boundaries and recovery behavior.

## Verification

**28 focused tests passed, zero failures or skips:**

1. `node --test test/extensions/service-origin.test.mjs test/extensions/proof-setup-guard.test.mjs test/extensions/worlds-runtime.test.mjs test/extensions/agents.host.test.mjs test/extensions/desk-dom.test.mjs test/extensions/desk.test.mjs` — 20 tests, including real contract-backed allowance resets/funding, immutable/codehash defenses, stale-review rejection, DOM controls, real HTTP World gameplay and guest/capacity security regressions.
2. `node --test test/extensions/proof.integration.test.mjs test/extensions/worlds-instruments.test.mjs` — 8 tests covering real Groth16 generation/tampering/circuit rejection/onchain swap binding, authenticated prover, and real commissioned-cartridge escrow/acquisition/refunds.
3. Reran all 5 Worlds runtime tests after separating receipt fingerprints from private guest authentication state; all passed.
4. Syntax checks passed for 11 touched authored modules.
5. Ran the real circom compiler with `node packages/rehearsal-proof/setup.mjs --compile-only`. Compilation succeeded; SHA-256 of all six published artifacts/metadata/verifier files remained unchanged. Removed the temporary `build/compile-check` output afterward. No setup was regenerated.

The Ganache suites used the package's normal Node.js fallback because its optional native µWS binary does not match this Node build. This did not skip tests. Expected circuit-rejection diagnostics occurred in negative proof tests.

## Remaining bounds / integration handoff

- The World remains a centralized small game with single-file snapshots and the existing 4 MB startup read limit. Removing a historical 128-character cap does not make storage unbounded or scalable. A later indexed-store migration must preserve characters, orders and guest credentials together; no pruning workaround was introduced.
- Guest codes currently have no rotation, expiry, or recovery if lost. They authorize only guest game state; old guest identities without a code have no unsafe self-service recovery. Resume capabilities and the retention rule are explicit in the UI and documentation.
- Existing per-IP polling/rate limits and live RPC ownership checks remain; no unverified event-stream/indexer architecture was added.
- The specialist market tools are still advanced exact contract workflows, now honestly grouped in the developer/specialist area. No new governance/execution powers were added to frozen custody shares.
- Ensure the current application build/archive includes new `web/extensions/service-origin.mjs`; it is imported by agents, Worlds, proof, and the standalone World client. The World server explicitly serves that module under its existing restrictive static allowlist.
- `agent/policy-engine.mjs` was outside this agent's ownership and still needs its caller-supplied canonical-collection guarantee wording corrected if not handled by the parent/core agent. Parent was notified.
- This agent did not run a complete project build, install packages, commit, use the network, deploy, or modify the uploaded ZIP.

## Authored files changed

`agent/worlds/server.mjs`; `worlds/model.mjs`; `worlds/client.mjs`; `worlds/client.html`; `web/extensions/service-origin.mjs` (new); `web/extensions/agents.mjs`; `web/extensions/proof.mjs`; `web/extensions/worlds.mjs`; `web/extensions/desk.mjs`; `web/extensions/access.mjs`; `web/extensions/markets.mjs`; `packages/rehearsal-proof/setup.mjs`; `packages/rehearsal-proof/setup-guard.mjs` (new); `test/extensions/service-origin.test.mjs` (new); `test/extensions/proof-setup-guard.test.mjs` (new); `test/extensions/worlds-runtime.test.mjs`; `test/extensions/desk-dom.test.mjs`; `docs/genesis/extensions/WORLDS.md`; `docs/genesis/extensions/PROOF.md`; `docs/genesis/extensions/AGENTS.md`.
