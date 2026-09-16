# Security boundary and required review / 1.4

**Do not custody real value with this release.** Solidity compilation did not start because the compiler dependency was unavailable. No new contract was deployed, no EVM integration test ran, and no independent audit occurred. Local browser/model tests cannot certify contract security.

## Authority and transfer

Transfer approval is not equivalent to account spending permission. The 1.3 owner-only authority changes are preserved in the working source. The 1.4 exchange relies on transfer invalidating account sessions; this dependency must be tested on the exact deployed account implementation. Old deployed immutable accounts do not acquire these rules simply because the source ZIP changed.

Sovereign authority must stay proof-gated. No administrative convenience key may be introduced to bypass irreversible Ascension. This exchange rejects sovereign listings; a future proof-authorized trading path needs a separately verified policy. Renting presence does not permit account execution, role changes, vault release acceleration, or NFT sale.

Escrow reduces former-owner execution risk but cannot revoke arbitrary allowances already recorded on external token contracts. Known allowance pairs are checked only when declared. Global child-NFT operators, rebasing behavior, proxies, malicious balance getters, transfer callbacks, and hidden liabilities need separate assessment. A manifest is bounded predicate enforcement, not a universal proof of a solvent or unencumbered estate.

## v4 and custody

Verify the manager's deployed bytecode, chain, canonical provenance, and compatibility. A contract that merely responds to the same selectors is not sufficient. Verify the CREATE2 init-code hash, constructor arguments, salt, permission bits, pool key, and fee flag. Compiler metadata or arguments changing invalidates a previously mined address.

Fuzz signed BalanceDelta decoding, min/max prices, exact-input semantics, native/ERC-20 settlement, small amounts, full-range seed rounding, uint112/uint128 limits, extreme ratios, and reentrancy across every asset and receiver callback. Our Python arithmetic probe translates one integer square-root algorithm; it does not run Solidity overflow semantics or liquidity math.

The seed position and rounding dust are deliberately nonwithdrawable. There is no emergency principal recovery. Review that tradeoff before locking anything. Verify zero-delta harvest works in the actual PoolManager, while a negative delta for the seed adapter is rejected. Verify other LPs are not accidentally locked. A schedule-based fee does not prevent sandwiches, sequencer manipulation, front-running, or bots.

The auction remains a batch sale. Cap participation can favor early contributors. A failed sale must refund exact recorded contributions; pro-rata rounding and residual token dust need explicit accounting. A successful launch is not evidence of token value, fairness, legitimacy, or regulatory approval.

## Social data and identity

All current contract message content is publicly readable and persistent. Do not enter private, identifying, or sensitive information. Removing a member prevents future authorized posts; it does not erase past content, stop public reading, or revoke copied information. Display hiding and personal block lists are not consensus-level erasure.

A custodian-at-time is not proof that a specific human personally wrote a message. Smart accounts and explicitly permitted agents may act. Separate signature authority, artifact affiliation, and human-readable profile labels. Do not sell personal credentials with an estate or present prior-owner reputation as the new owner's accomplishment.

Membership consent and role epochs require tests for transfers, escrow, cancel, return, moderator acceptance, stale invitations, reacceptance, bans, and slow-mode bypass via multiple wallets. Onchain identity does not supply Sybil resistance. Activity is module-scoped, not surveillance of all crypto activity by that user.

The hook avoids external chat calls, but adapter/launch/vault operations still record to the configured ledger atomically. A bug or revert in that ledger can therefore block those adapter operations. Immutable wiring removes an admin change surface but makes deployment errors difficult to recover from. External pool users are not necessarily represented in the ledger's attributed feed.

## Browser and data

The application intentionally makes no automatic wallet or network calls in the new layer. The archived legacy interface still includes its old optional client, which is not a validated route to the v4 economy. UI imports check bounded types and text, but checksums are unsigned and not proof of ownership or history authenticity. Cross-tab interference and file-origin persistence need real target-browser testing; the browser suite uses an in-memory storage adapter.

Canvas glass is a visual metaphor. Brightness, feathers, particles, a folded camera, or a glowing receipt are not cryptographic proof. Timeglass cannot change a release schedule. The model's separate rehearsal-clock controls do not correspond to any onchain function.

## Release gates

Compilation with the pinned compiler and Cancun target; runtime/init-code size review; full inherited regression suite; actual pinned-v4 integration and fork tests; economic invariant fuzzing; malicious token/receiver tests; transfer and stale-authority tests; wallet-driven testnet flows including reorgs; code and deployment verification; independent security review; and explicit operational decisions about immutable failure recovery. None of those may be inferred from the JavaScript/browser pass counts.
