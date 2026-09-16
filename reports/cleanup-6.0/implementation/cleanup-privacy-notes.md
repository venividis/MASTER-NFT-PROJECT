# Privacy, mint wallets, v4 and exit cleanup — implementation notes

All edits are within `/workspace/scratch/3b7470161c8a/ANIMA-NFT-cleanup`. No network transaction, funded operation, external deployment, signer credential access, or commit was performed.

## Implemented

- Mint wallets now persist version-2 envelopes containing the complete signed record (key keystore, origin/RPC, collection/recovery addresses, budget, pending signed bytes and transaction history). Persistent locked index exposes only random ID, encryption envelope and migration state. Existing version-1 records migrate in place only after successful password/key/policy verification; both old and new backups import, and duplicate IDs/stale tab state remain rejected. Failed legacy unlock preserves the recoverable original. Export defaults to full ciphertext; an explicit unlocked advanced recovery action can export the original encrypted Ethers keystore for another wallet.
- Mint locking clears session key/record/review state and replaces already-rendered wallet metadata. Async inspection results are rejected after lock. Sensitive mint surfaces now use `data-private-surface`, preventing the existing formation collector from caching project/address/review text in canvas particles. Scope remains an independently funded EOA and a local policy, not an onchain spending-cap claim.
- Private submission reserves exact operation ID, chain, relay and transaction-data fingerprint in encrypted storage before any broadcaster send. Web Locks serialize reservations; stale private vault revisions cannot overwrite another tab's reservation. Duplicate send attempts and blind `clear-pending` are rejected.
- Worker sends observed broadcaster hash immediately and waits for storage acknowledgement before waiting for two confirmations. Receipt persistence decrypts and merges into the newest authenticated encrypted record under the shared Web Lock, preserving unrelated concurrent notes. Already-started receipt persistence completes after lock without restoring key/data/envelope. A queued stale local save cannot erase the receipt.
- Recovery verifies the original hash's transaction destination, calldata hash, native value, chain and two confirmations, distinguishing confirmed, transaction-reverted, application-reverted, pending and confirming. Confirmed terminal recovery archives a local receipt; absent receipt never releases a reservation. Unknown hash may be entered from the original broadcaster and must match the stored fingerprint. Old pending records without a fingerprint remain blocked for independent reconciliation.
- `VestedExitVault` funding now matches deployed normalized runtime against generated `EXIT_ARTIFACT` before trusting its getter bindings, then checks collection and current pinned market code. `repair_build` supplies `scripts/build-exit.mjs` and the artifact; `source_build` wires generation.
- Exit composer accepts normal decimal token amounts (distinct input/output decimals), preserves existing integer and date bounds, and formats funded/received/minimum amounts in token units. Manual vault and public memory digest fields moved to Advanced details. Keeper remains explicit one-shot operation, never portrayed as running because a page is open.
- v4 reviews display decimal output/balance amounts and percent fees. Broadcaster fee metadata uses its token decimals. Pool ticks, slippage raw settings and launch salt are under Advanced details. Launch accurately describes no-hook LP-shareholder economics and points out creator splitters need the separate hook instrument; no shielded launch is silently rerouted through a creator-owned hook.
- Authored modified JS files formatted with pinned Prettier. Privacy manifest now declares directly used ethers/assert/crypto-browserify at versions already pinned in its lock. Existing worker cryptography and provider boundaries retained.
- Updated current behavior in `docs/genesis/PRIVACY-AND-V4.md`, `EXIT-AND-MINT-SANCTUARY.md`, `EXIT-OPERATOR.md`; removed obsolete mandatory-mirror assertion, retaining explicit shard recovery/mirror/network dependency distinctions.

## Verification

Final targeted groups passed:

- 18 tests across privacy vault, desk, submission recovery and bridge (including encrypted receipt ACK, lock/restart recovery, duplicate prevention, cross-tab reservation, immediate lock completion, stale-tab note merge and queued snapshot rejection).
- 5 burner tests, including actual local Ganache create/fund/mint/inspect/recovery, policy tampering, stale state, signed reservation/exact rebroadcast, complete-record concealment, failed/successful legacy migration, v1/v2 import, encrypted-key recovery and DOM scrubbing.
- 24 exit tests, including actual local contract accounting/custody/minimum/cancellation invariants, runtime counterfeit rejection, collection/market mismatch, decimal-unit composer and legacy local replay.
- Existing privacy math/resource recovery tests also passed during initial combined run; an early exit import failure was resolved by generation of the new trusted artifact. One early DOM assertion matched generic explanatory copy; corrected to assert private sentinel removal and surface markup.
- Real SDK offline harness passed wallet derivation, encrypted mnemonic round-trip, restored address, multi-token encrypted return notes and exact RelayAdapt require-success grouping. This is offline cryptography, not a funded shielded transaction.
- `repair_extensions` independently reproduced stale tab A + tab B note edit + immediate lock during hash merge: both hash and note survive, locked data/key/envelope remain null, conflicting replacement hash is refused.

Privacy worker regenerated deterministically after source changes:

- bytes: `15012667`
- SHA-256: `f99adbb7e692b7cd31f5ec8601362eecb787537863baf95a8a2a99c11c2b1b2b`

New authored modules: `web/privacy/submission.mjs`, `test/privacy/submission.test.mjs`.

## Remaining product/protocol work

- The existing creator fee hook and private no-hook launch route are intentionally still separate. A shared fully configurable launch integration needs deliberate router/contract design, not a label change; no new protocol economics were introduced in this cleanup.
- Live scheduling now uses human amounts but local rehearsal's percentage/date composer and deployed funding still represent separate execution models. This does not claim live swap/journal/funding is one atomic transaction.
- Closing the page before the broadcaster returns any hash cannot make that missing hash known. The exact encrypted reservation remains and blocks repetition; recovery accepts independently obtained matching hashes. Legacy pending markers lacking fingerprints require independent reconciliation.
- Legacy locked burner records still contain their historical plaintext metadata until that record's password is provided; it cannot be encrypted or reliably scrubbed without the password. New writes/default backups have full-record encryption.
- Deployed contract and shielded network readiness were not verified through funded/public-chain calls. RPC observations and external network availability remain explicit dependencies.
- Generated `railgun-worker.js` inherits upstream template-string trailing whitespace. Do not strip it merely to silence `git diff --check`; hash refers to exact regenerated bytes. Authored source whitespace checks are clean.
