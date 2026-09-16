# Official Uniswap CCA and Doppler integration

This package executes the pinned official protocols, alongside ANIMA's existing launch mechanisms. Its browser client prepares real transactions for the shared NFT/wallet review system. Its economic scenario runner executes those same contracts on a separate, funded local Anvil chain. No scenario uses the owner's wallet, a public RPC, or public funds.

## Exact sources

| Component | Pin | License retained |
|---|---|---|
| [Uniswap CCA v2.1.0](https://github.com/Uniswap/continuous-clearing-auction/tree/a56d42231e7bf048136d9d88fa61e8518c10c5ff) | `a56d42231e7bf048136d9d88fa61e8518c10c5ff` | MIT source; dependencies retain their licenses |
| [CCA-paired Liquidity Launcher](https://github.com/Uniswap/liquidity-launcher/tree/3a3103543f50a13a0ae52a253bb98a925d72146f) | `3a3103543f50a13a0ae52a253bb98a925d72146f` | Original package/source licenses retained |
| [Doppler](https://github.com/whetstoneresearch/doppler/tree/5754c7ee01f1bdbd6f07c62be721e1223b725ecd) | `5754c7ee01f1bdbd6f07c62be721e1223b725ecd` | BUSL-1.1 for core; original dependency and interface licenses retained |

`source-lock.json` lists nineteen repository commits and SHA-256 hashes for all 537 retained source/document/license files. Sources are unchanged. The build validates those hashes, resolves imports into deterministic compiler inputs, and records every input hash and compiler setting in `artifacts/build-manifest.json`.

Doppler's retained BUSL terms distinguish non-production use from production use and reference `doppler-license-grants.whetstoneresearch.eth` for additional grants. This implementation does not claim a new license grant or verify that an arbitrary production deployment qualifies. See `vendor/doppler/LICENSE`. ANIMA's own periphery is MIT.

CCA's published production commit `7d7602d257733315434570f2a0c2f94f1c7b207a` was compared with the v2.1.0 tag: `src`, `lib`, and `foundry.toml` were identical. The compiler emits both the ANIMA no-CBOR profile and the published CCA profile; the client accepts only an explicitly pinned executable profile, masking compiler-declared immutable locations and checking repeated immutable consistency.

## Build and tests

From the project root, with the root dependencies and existing v4-hook package dependencies installed:

```sh
npm ci --prefix integrations/official-launch
node integrations/official-launch/scripts/build.mjs
node --test integrations/official-launch/test/*.test.mjs
```

Solidity 0.8.26 is read from the existing v4-hook package. Actual Permit2 uses the isolated, locked 0.8.17 compiler. The build targets Cancun except Permit2's London profile. All produced runtime bytecode respects the EIP-170 size limit. Cached builds require matching source/compiler settings and matching hashes for every generated artifact; `--force` recompiles everything.

Generated browser modules are `web/launchpad/protocols-artifacts.mjs` and `protocols-deployments.mjs`. The latter contains actual creation bytecode and belongs in the versioned launch module, not an unrelated renderer. `protocols.css` must be included by the application style build. `scripts/networks.mjs` rebuilds the published address suggestions from the retained official manifests.

`test/lifecycle.test.mjs` deploys the actual CCA factory, auction, Liquidity Launcher, PositionManager, Permit2, PoolManager, Airlock, Doppler hook, token factory, governance factory, top-up distributor, v2 migrator, real v2 factory/pair, quote lens and bounded router. It exercises actual creation, approvals, trades, settlement, claims, refunds, migration, recovery, slippage rejection, callback rejection, and native/ERC20 custody. Every prepared final transaction passes the same receipt verifier used by the owner interface.

`test/scenario.test.mjs` exercises complete conserved sequences for CCA success, failed minimum and migration failure, plus Doppler success and failed minimum. Two participants act independently. Each action verifies token supply, native currency including miner/burned gas, and LP supply when present. It also verifies protocol/integrator fee withdrawal, a 10% proceeds split and the actual one-year LP exit. Failures remain visible and the session remains usable.

Evidence is written to `artifacts/lifecycle-evidence.json` and `artifacts/scenario-evidence.json`. Both identify a local development chain, **31337**. They are not public Ethereum transaction receipts or a security audit.

## Browser interface

`new ProtocolsDesk({chain,onChange,storage?})` provides `render()`, `mount(root)`, `unmount()`, `openRoute(route)` and asynchronous `read()`/`receipt(record)`.

The shared launcher must deliver confirmed official receipts to `receipt()` whether its outer review or the desk's review signs the operation. The shared transaction tracker must call asynchronous `verifyProtocolReceipt(provider,record,receipt)` before confirming final `official-*` operations. Successful wallet broadcast is not sufficient. Call synchronous `rollback(record)` if an official receipt is reorganized: it removes only matching configured deployment addresses on that chain, preserves a different manual address, and invalidates the affected launch view/link/migration success. The desk also applies rollback during its own recovery and replacement flows.

Participant routes:

- `#launch/cca/<chainId>/<auction>`
- `#launch/doppler/<chainId>/<airlock>/<asset>`

Read-only participants may select an HTTPS RPC, or a loopback HTTP RPC. Chain ID and exact executable profile are verified. CCA bid history has explicit from/to blocks, bid offset/limit, next/previous bids and bounded earlier/later history. Event queries bind both the exact contract address and resolved event topics; ethers PreparedTopicFilter objects are never spread into log queries. Partial bid exits follow the contract’s stored checkpoint links, independently of how many blocks have elapsed since the auction. More than 2,048 checkpoint hops require explicit hints, which are validated by the actual contract before review. A funded regression recovers a real partially filled bid while historical event RPC access is unavailable; recovery does not depend on elapsed block history.

Creation supports the NFT account through the existing shared `prepareExternal(...,{nftCompatible:true})` route. Infrastructure deployment uses the selected signing wallet because ordinary CREATE address prediction is wallet-nonce based. Beneficiaries, the Doppler integrator, proceeds splits and migration recipients remain explicit.

A created launch can be explicitly registered in ANIMA's launch registry. A verified migration exposes an explicit append action: CCA links its actual PoolManager/poolId; Doppler links its actual v2 pair. Registry publication is deliberate and public.

## Economic boundaries the UI preserves

**CCA:** maximum-price bids, exact block issuance schedule, checkpointing, exited-bid refunds and claims, creator-only unsold recovery, recipient-only proceeds sweep, and optional committed v4 liquidity migration. Controller fees are queried at sweep time and can change. `MigrationFailed` plus `FundsRecovered` is a recovery outcome, not pool creation. Repeated empty claims and repeated empty LP exits are rejected before transaction preparation.

**Doppler:** the selected mechanism is its actual dynamic Uniswap v4 auction followed by its official Uniswap v2 migrator. It is not a CCA or ANIMA's streaming auction. The exact quote lens executes the real PoolManager/hook and rolls back, so quote output includes actual swap fee effects. A swap enforces input budget, minimum output, deadline and recipient. Migration fees are assessed separately.

The selected v2 migrator locks 5% of LP for one year, gives the remaining LP to the selected recipient, and sends the locked slice's earned fees to the Airlock owner when exited. The principal goes to the committed recipient. Optional proceeds splitting is capped at 50% by this official migrator and requires its top-up distributor to enable the migrator. The deployment desk includes that owner action. Airlock owner/integrator fee collection is available in the participant panel.

A failed Doppler minimum opens its token-sale refund curve. It does not guarantee the participant's historical purchase price as a refund. The actual scenario tracks that distinction rather than substituting invented arithmetic.

These official routes are public. Shielded execution belongs to the separately integrated shielded launch route; this package does not relabel a public CCA or Doppler launch as private.

## Isolated scenario API

```js
import {createOfficialScenario} from './scenario/runner.mjs';
const session = await createOfficialScenario({
  mechanism: 'cca', // or doppler
  outcome: 'success', // failed-minimum; CCA also migration-failure
  options: {protocolFeePips: 10000}
}, {signal});
await session.step({action:'advance',phase:'start'});
await session.step({action:'bid',actor:0,amount:'1',maxPrice:'0.001'});
const snapshot = await session.snapshot();
await session.close();
```

`SCENARIO_LIMITS` exports the finite options/actions. Each session starts a dedicated loopback Anvil, deploys its own exact stack, uses two local participant wallets plus separate creator/protocol/integrator wallets, and accepts no arbitrary address, RPC URL, key, shell command or calldata. Abort closes the local chain. The secure service and browser client are in `agent/scenarios/` and `web/launchpad/scenario-client.mjs`.

Snapshots contain actual terms, phase, participants, balances, bid states, protocol fees, migration/LP custody, full finite action history, and conservation residuals. Every balance includes native/token deltas and a native economic delta with that account's gas paid removed. Quote commands do not mutate balances. Rejected operations are recorded and later valid recovery steps can still execute.

## Deployment evidence

Published address suggestions come from the pinned Doppler `Deployments.json` and the retained [official Uniswap deployment manifest](https://developers.uniswap.org/deployments.json), generated 2026-07-15 at Uniswap/contracts commit `37936185dee7decf681360ec799c124e0e034672`. Suggested addresses are not accepted merely because they are listed. Different public compiler/version profiles will be rejected until an exact independently verified profile is bundled, or the exact pinned stack is deployed.

A public Ethereum RPC check in this environment returned HTTP 403. No public runtime compatibility, funded launch, deployed privacy service, or successful Ethereum production release is claimed by these local tests. The local setup and live transaction paths are implemented and exercised; using a public deployment still requires a reachable RPC, an exact compatible deployment and the user's actual signing account.
