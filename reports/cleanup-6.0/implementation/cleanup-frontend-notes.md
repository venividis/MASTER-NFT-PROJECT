# Frontend cleanup implemented

Worktree: `/workspace/scratch/3b7470161c8a/ANIMA-NFT-cleanup`.

## Delivered

- Added `web/confluence/selected-context.mjs`: one read-only selected visual identity with explicit local-preview, visual-preview, minted-snapshot, confirmed-chain and chain-stale provenance. It holds no keys and exposes a shared global for the earlier-loaded memory renderer.
- Fixed the reproduced mixed-life bug in both renderer entry points. Memory life targets AND currently interpolating values zero immediately outside local mode; Genesis blue projection also zeros those parameters at draw time. Local past-history comparisons remain protected. New-wallet connection no longer permits rehearsal deformations on a minted seed.
- Corrected generic-runtime legacy selection: a legacy connected snapshot now wins over local state, while minted binding still rejects a different legacy token.
- Wallet refresh reads owner, NFT account, render snapshot and balance at one block; validates current account/network and selection revision; publishes fresh roots after confirmed transactions and when the page becomes visible again. Explicit refresh is available in Connect. Read failures mark the last snapshot stale; custody/context changes clear authority and snapshot. An included transaction receipt remains successful and recoverable even if the follow-up read fails.
- Original mutation dispatch cannot silently apply a local rehearsal to a selected chain NFT. Legacy and modern workflows retain their distinct signing/review mechanisms and need matching identity for an original mutation.
- Added `web/confluence/capabilities.mjs` as primary navigation authority. Swap, Launch, Vault, Memory, Commons, Worlds and Atlas drive the dock and interior function list. Historical route aliases still resolve. Technical exact-call forms, raw identity roots, authority configuration, specialist instruments and old simulations have a deliberate Advanced entrance. Removed duplicate Swap/Launch shortcuts from the original-entry strip. Preserved Original controls and all optical equations.
- Memory now offers three explicit paths: encrypted recoverable notebook, consented public inscription and nonrecoverable salted hash seal. No new storage format or crypto implementation was introduced.
- Export labels now say “local experience”; exports add a versioned `scope` manifest declaring included data and omitted private/burner recovery, service settings and onchain content. Existing archive schema/import compatibility preserved. The UI explicitly says to retain notebook passphrase separately.
- Removed unreachable legacy `launchPage`, its form branch and factory-launch action. Current v4 Launch remains the active route; archived saved launch definitions still import/export compatibly.
- Formation defaults to 0.8 seconds (close 1.1 seconds), retains an optional 12-second first reveal per panel/mode, and never makes prepared inputs/buttons inert. Button/field labels stay visible and usable during formation. Private text remains excluded from particle rasterization. Focus/draft/reduced-motion behavior retained.
- Removed ineffective Genesis exterior quality-scale tuning; retained FPS reporting and the separate effective interior quality controller.
- Replaced memory and Confluence background polling intervals with throttled subscribers on the original renderer's visible frame lifecycle (the renderer hook is authored by source_build). The audio analyser updates on this lifecycle; source reconciliation remains throttled to 400ms.
- Unified Confluence, Original and interior audio onto one `OrganismAudio` instance, exposed by the original client, with one analyser. Removed duplicate Confluence oscillators/context. Sound identity now follows selected chain/preview provenance, supplying complete phenotype inputs from the selected root. This does not claim to generate a unique developed composition per NFT.
- Fixed paused Kingdom camera changes not marking the scene dirty. Mouse/keyboard/wheel changes now repaint once while paused, then return idle.
- Formatted touched frontend modules and tests with the existing Prettier installation. Large line-count changes are intentional readability improvements.

## Coordination

- source_build owns current app composition, original `web/app.js` guards and `web/renderer.js` subscriber hook. Only an `audio` property was added to `web/app.js` by this agent after coordination.
- source_build moves original `#ascend` into an advanced details section. Confluence's Advanced developer panel reads `account.sovereignAuthorityReady()` (bool, no args), coordinated with repair_core.
- No contract, privacy, v4, extension, global build, package-install or release scripts changed by this agent.

## Verification

- 43 affected targeted tests passed after final formatting. Output: `/workspace/scratch/3b7470161c8a/cleanup-frontend-tests.txt`.
- Earlier broader affected test run: 73/73 passed, including existing local Ganache Confluence contract and Genesis native market/lock/journal/Commons integration tests plus wallet transaction review regressions. These tests used existing generated artifacts; no global build was started by this agent.
- New meaningful regressions cover actual memory bridge reset under modern wallet selection; selected mode and immutability; Original mutation context guard; selected audio identity; block-pinned refresh; stale snapshots; in-flight selection races; receipt preservation on refresh failure; seven coherent route names; optional first ceremony; always-usable native controls; quick repeat formation; and paused-camera redraw.
- Browser smoke/visual checks must use the final source_build output. Suggested routes: boot Original, Atlas, Memory (all three choices), Advanced, developer authority readiness, interior entry/return, sound synchronization, and mobile seven-item navigation. No new live-chain transactions or physical-device testing were performed here.

## Boundaries retained

- Advanced financial instruments and external privacy/game/proof services remain available behind explicit entry; not silently deleted.
- The original client's state machine and Confluence NFT client are still separate execution adapters. Selection is coordinated and mismatched original mutations are rejected; adapters are not merged into a new signing engine.
- Legacy local archive remains limited in scope. Complete private wallet/burner recovery uses their own authenticated exports; the primary local archive no longer claims completeness.
- CSS received formatting and narrow navigation overflow protection. A computed-style comparison and broad cascade rewrite were not attempted.

## Final copy/provenance review requested by root

- Replaced the primary Launch “on your terms” description with the exact current scope: token creation with shared liquidity fees, chosen LP fee and funding. Advanced Distribution now explicitly configures a separate OwnerFeeRouter and does not attach a custom fee hook to the standard v4 launch. The v4 desk already states the no-hook limitation plainly.
- Independently rechecked all selected modes and both renderer backends. Found and corrected a related remaining inheritance: selected seed/root previously retained local sovereignty, activity pulse, atmosphere event count and child orbits. The projection now takes sovereignty/nonce/available lineage only from the selected snapshot, suppresses pulses belonging to another subject, and restores the underlying legacy renderer state after each draw. Root/sovereignty changes also dirty a paused renderer immediately.
- Added one regression spanning minted-snapshot/confirmed-chain/chain-stale/visual-preview modes, ordinary/Original GL projection, CPU uniforms and atmosphere, plus paused root updates. 12 targeted selection/projection tests passed; no broad suite rerun required.
