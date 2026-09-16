# Deployment is a separate release gate

This package is not approved to hold production value. No mainnet, testnet, wallet, or contract deployment occurred. `npm run deploy` fails closed. The historical legacy-core deployment script is not an end-to-end economy deployment.

## Required evidence before an integrated testnet release

1. Install the pinned compiler/toolchain through an authorized network-enabled environment; resolve and review a dependency lock. Compile all 29 Solidity source files, address every diagnostic, inspect linking and deployed sizes, and record the compiler/settings/source hashes. No fabricated build artifacts or addresses.
2. Test the actual pinned Uniswap v4 PoolManager, not a mock called “v4.” Deploy a matching CREATE2 hook address with the correct flags. Test committed initialization, dynamic-fee pool settings, both swap directions, multihop and rounding, rejected minimum output, deadlines, unsettled deltas, unauthorized callbacks, fee collection with zero liquidity delta, blocked negative seed withdrawals, and third-party LP withdrawals.
3. Test launch failure/refund/withdrawal and successful distribution accounting. Check immutable allocation/recipient/sweep terms, timestamp boundaries, claim rounding, double claims, and liquidity seed accounting. A CCA integration is separate source and tests; it does not exist merely because v4 hooks exist.
4. Test ConsentGiftRouter with native and ordinary ERC-20 funding, same-asset offers, actual market swaps, exact allowance cleanup, output measurement, stale nonces, zero/invalid dates, unauthorized recipient, accepted recall rejection, timeout return, permissionless trigger without redirection, and TimeVault deposit failure rollback. Include a rejecting native receiver and malicious/reentrant/nonstandard assets. Explicitly test donating or forcing native currency into the router: gifts must not consume unrelated funds.
5. Re-run core NFT/account transfer, approval, session revocation, Bound/Sovereign and proof-only paths. An approved NFT transfer operator must not thereby control account funds. Revocation must work before and after escrow transfer. No UI shortcut replaces these contract checks.
6. Test exchange pre/post callback inventory verification, stale manifests, royalty handling, unowned child claims, allowance predicates, rejecting buyers, pull withdrawals, and expired cancellation. Define whether gift-router liabilities and accepted vault claims are included. The current UI restriction is not a contract invariant.
7. Test WorldLedger independently: room membership/role acceptance, custody epochs, removed users, old authorship, public versus encrypted claims, bounded storage/page retrieval, and who can emit typed activity. A router's caller address is not automatically its end user's identity.
8. Write the missing instrument wallet client. Decode actual call data, bind chain/account/deployment context, read one consistent block, simulate and review, handle wallet changes, distinguish submitted/included/finalized/reverted/stale states, and refresh balances from receipts. Never advance the original artwork's authoritative state on a fictional rehearsal event.
9. Deploy application-byte chunks only after deciding whether the artifact is a rehearsal archive or a live client. Store exact bytes with verified retrieval/hash/reassembly. Measure cost and supported resolver behavior. Archiving today's HTML will archive today's simulation, not produce a live interface.
10. Independently review code, economic assumptions, privilege paths, failure recovery, and relevant activation policy. Then conduct wallet-driven testnet scenarios before considering value-bearing use.

## Trust boundaries that must not disappear in a polished interface

An unsigned local checksum is not authentication. An RPC snapshot is not a locally verified finality proof. A code hash does not alone attest to every proxy dependency. A declared inventory is not a proof of absence of arbitrary external liabilities. A member-gated public storage contract is not private messaging. A model's output is not a spending authorization. An ONFT transport does not automatically move account-held assets. A legal-region UI switch is not contract enforcement.

## Test scope of this archive

The new browser tests and model/property checks execute the local HTML and JavaScript model. They do not run Solidity, a PoolManager, a real wallet, zero-knowledge proofs, an agent runtime, or encrypted group communication. The existing GitHub CI configuration is retained but was not invoked or observed in this turn. A future successful CI run must be inspected rather than assumed.
