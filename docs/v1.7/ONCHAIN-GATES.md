# v1.7 — Onchain integration and security gates

Status: source written, not compiled or executed. This list is not a passing test report. Existing operating modules remain as documented in v1.6.

## Deployment dependency and authority

Construct MemoryLedger against the actual collection; construct JournalSwapRouter against that ledger and the pinned genuine v4 market; call the one-time installRouter. Verify all actual interfaces, bytecode, identities and chain IDs. An absent router disables the journaled route. There is no mutable adapter roster in this new ledger.

The NFT account is the router's caller and output beneficiary. Account execution policy still determines whether that caller can be activated; the router does not add a direct-owner sovereign bypass. The ledger also permits personal notes directly from the current custodian and historical-author reflections. Those personal note writes are not financial account execution.

An account-triggered note stores executor and custodian-at-time, with author zero. Do not label the custodian as the proven human operator. A signature/delegation scheme is needed for stronger personal attribution from an automated or account-triggered route.

## Required actual EVM tests (NOT RUN)

| Area | Required assertion |
|---|---|
| Configuration | Router install unauthorized/repeated/zero/EOA targets rejected; legitimate dependency order succeeds |
| Payload | Public/full ciphertext stored byte-identically; zero/oversized/malformed mode rejected; no decryption key received |
| Head/nonce | Stale journal head, router nonce, changed custody and replay all fail without mutation |
| Atomicity | Failing market or min output reverts note, nonce, allowances, asset movement and binding |
| Receiver | Output always reaches originating account, including hostile cross-account calldata attempts |
| Accounting | Exact 6/8/18-decimal raw units; input consumption and measured output; fee/rebase/false-return/callback token behavior |
| Approvals | Exact temporary approval, reset on success; preexisting and nonstandard approval behavior reviewed |
| Reentrancy | Native/token callbacks cannot bind a second fill, change intended beneficiary or steal existing router dust |
| Custody | NFT transfer during the operation causes revert; reflections retain personal authorship after sale |
| Form | Each intended typed record admitted once, correct category, no double-counted binding, no fake router identity |
| Source scope | Plain journaled swap succeeds; swap-and-lock is NOT advertised until its distinct vault route is implemented |
| Actual v4 | Exercise against pinned real PoolManager, pool/hook address flags, settle/take accounting and exact received assets |
| Size/gas | Compiler diagnostics, runtime size, payload/storage costs, maximum contract return sizes and bounds |

No `pure` arithmetic reference, JavaScript engine run, text search or mocked interface can substitute for these actual contract tests.

## Complete client work still needed

Specify a chain-oriented encrypted envelope whose authenticated header includes the final chain/collection/account, operation nonce, recipient, and exact plan. The local SHA-256 archive and Solidity Keccak records are different formats. A live adapter must encode the real calldata, simulate, present the transaction, submit only after approval, decode the actual configured receipt, and handle pending/reverted/replaced/reorganized transactions without creating a false success.

All module records require an explicitly authenticated event universe. The source ledger currently traces only its own notes and journaled fills, not the entire local operating system. External user prose is not a protocol event. Deduplicate by chain, contract, transaction and log identity; pin block identity and confirmation/finality policy; replay from accepted checkpoints after reorgs. A foreign receipt or transient RPC answer must not permanently mutate the canonical form.

Link this history to the NFT's onchain rendering/metadata under a declared version and migration policy. ERC-4906 notification alone supplies neither an event index nor a renderer. Full historical playback needs base-genome snapshots and activity snapshots at the same point; current local playback only projects past activity on the current genome.

The current estate manifest does not promise private body availability or key transfer. Ciphertext and its header can be observed independently of who owns the artifact. A sale must not claim to convey personal decryption rights. A future opt-in encrypted-data sale is a separate protocol with key delivery and verification assumptions.

## Privacy/readiness gates

Test browser-native encrypt/decrypt in actual supported secure browsers, permission changes while crypto is pending, tab hiding, lock, reload, wallet change, malformed imports and storage quota failures. An independent review should examine the envelope, passphrase KDF, IV generation, dependency integrity, DOM text handling, session cleanup and recovery limitations. Encryption does not make metadata anonymous or protect an unlocked compromised device. No cryptographic key handover, group sharing, forward secrecy, trusted hardware or AI inference is asserted.
