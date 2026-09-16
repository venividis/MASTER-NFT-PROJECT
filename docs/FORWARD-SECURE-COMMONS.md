# Forward-secure Commons implementation

## What was added

The canonical Commons desk now offers **Forward-secure conversations** alongside the original **Legacy conversations**, **Legacy encryption keys**, and **Legacy setup**. The original `EpochGroupChat` and `PrivacyKeys` contracts were not changed. Existing encrypted history and old backups continue to use their original protocol.

New conversations run actual RFC 9420 MLS using pinned `ts-mls` **1.6.4**, `@hpke/core` **1.9.0**, and `@noble/curves` **2.0.1**. The supported suite is **MLS_128_DHKEMP256_AES128GCM_SHA256_P256 (0x0002)**. Its P-256 signature keys use the 65-byte uncompressed encoding required by RFC 9420 §5.1.1; signatures use DER encoding. The protocol tree, transcript authentication, Welcome processing, membership proposals, update paths, secret trees, and per-sender message ratchets come from that implementation. ANIMA adds wallet authentication, ordered onchain delivery, encrypted persistence, and its user interface. It does not rename the legacy epoch-key scheme “forward secure”.

[RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html) specifies MLS forward secrecy and post-compromise security. The [implementation’s upstream repository](https://github.com/LukaJCB/ts-mls) explicitly says it has **not undergone a formal security audit**. These integrations and local tests are not an independent security certification. The pinned package API differs from the upstream development-branch examples; the adapter uses the installed version’s source and declarations.

## Actual user journeys

1. Connect the existing signing wallet, deploy or verify `MLSGroupChat`, and open encrypted device state with a passphrase of at least 16 characters. Conversations use the signing wallet; NFT ownership and sale do not move chat keys.
2. Create a fresh, one-use MLS KeyPackage. Register its public bytes and signing key through a real wallet transaction. Its private material is encrypted in the device vault.
3. Create a group, or accept the manager’s onchain invitation. A manager adds only a consenting recipient with an unused current KeyPackage. The recipient joins by verifying the onchain Welcome, group identity, transcript and exact public roster.
4. Write a message and review its actual transaction. Encryption occurs before the shared wallet controller receives the request. The plaintext and private state never enter public receipt metadata.
5. Sync messages in confirmed chain order. Sending and receiving erase consumed key arrays, retain zero old application generations and zero historical epochs, and overwrite the encrypted current state. Repeated receipt synchronization never decrypts a previously consumed message again.
6. Use **Refresh my encryption path** for a genuine MLS update-path commit. Any accepted member can refresh without changing the roster. Changes to membership remain a manager operation.
7. A removed member retains what they already read but cannot obtain the new epoch. To replace both signing and recipient keys, have the manager remove that membership, reset its old local state, create/register a fresh KeyPackage, accept a fresh invitation, and receive a new Welcome. Older Welcome messages are skipped until the one addressed to the fresh package is found.

## Management and migration

Manager handover is explicit and consented: the existing manager proposes an existing accepted member; the candidate accepts through their own wallet. Acceptance pauses posting. The new manager must publish a fresh MLS update path before messages resume. The former manager remains an ordinary member until deliberately removed; management transfer alone does not falsely promise to remove their access. The proposal can be cancelled.

Legacy migration creates a **fresh MLS group**, then its manager calls `announceMigration(legacyChat, legacyRoom, targetGroup)`. The transport reads the legacy contract’s actual manager and requires that same wallet to authenticate the migration. The client additionally verifies the exact legacy contract and key-registry runtimes. The migration pointer is immutable and discoverable on chain. Every recipient still registers fresh MLS material and explicitly accepts a new invitation. Legacy plaintext or old encryption keys are not automatically transferred into MLS.

Read old messages in the legacy tab. Closing the old room is a separate deliberate transaction once members have moved. Runtime verification rejects different executable code. An exact code clone still has a different address; runtime verification alone does not identify a user’s intended room. Participants must verify the intended shared contract and room addresses.

## Authentication and transport

`MLSGroupChat` is an immutable ordered delivery contract. The contract does not verify an MLS proof or decrypt anything. It enforces wallet authorization, invitation consent, current one-use KeyPackages for added members, a maximum 32-member roster, manager authority for roster changes, expected epoch and packet index, and bounds on ciphertext/Welcome sizes. It records the wallet-authenticated signing-key fingerprint of each admitted member. Every commit packet snapshots that credential roster, which recipients compare against the authenticated MLS tree. An old registered signing key cannot silently substitute for a new admission package.

MLS authenticated additional data binds each packet to the chain ID, transport contract, group ID, ordered packet index, epoch, packet kind, and submitting wallet. MLS commit senders must match the submitting wallet’s leaf. Application envelopes must also match their submitting wallet. Welcome recipients verify the actual group ID, transcript and complete credential roster before saving any group state. Invalid protocol packets cause client rejection; transport liveness is not a guarantee that all members are honest.

Wallet identities, membership, senders, timing, packet order, encrypted metadata and approximate sizes remain publicly observable. The cryptography protects contents, not these public facts. Fixed additional padding is applied by the MLS implementation; it is not a constant-size traffic concealment scheme.

## Persistence, backups, and failure behavior

`MlsVault` stores a single passphrase-encrypted current snapshot in IndexedDB. The key uses PBKDF2-HMAC-SHA256 with 600,000 iterations, a random 32-byte salt, AES-256-GCM, a fresh 12-byte IV for each write, and authenticated wallet/network/contract context. The key remains in memory only while unlocked. IndexedDB compare-and-set prevents two tabs from successfully saving updates from the same starting vault version. A conflict locks the current state rather than silently overwriting a newer ratchet. Writes are capped at 3 MiB of plaintext state so a produced encrypted backup remains within the supported recovery bounds.

Before a wallet request is prepared, an encrypted pending-operation journal stores the prospective state and exact ciphertext. A confirmed matching packet advances the saved state. An unsent application generation is consumed even when the user cancels it, preventing reuse. An abandoned commit likewise advances its old epoch’s handshake ratchet using the protocol library’s own primitive; it does not restore a used handshake key. After 16 cancelled application drafts, the client requires a fresh encryption-path commit before further messages, within its bounded receiver catch-up window.

Two confirmations are required by default before applying received packets or finalizing the local journal; tests deliberately use one on the local chain. A stored block-hash checkpoint is checked using a fresh RPC call. A changed history freezes that group instead of restoring erased ratchet keys. Recovery is removal, local reset, fresh KeyPackage, consent, and re-invitation. The wallet controller retains its existing receipt replacement/cancellation recovery; a pending encrypted operation is resolved against its actual contract packet and body hash.

An encrypted transcript is optional and **off by default**. With it off, locking removes the displayed history and current ratchet state cannot reopen erased older messages. Enabling transcript retention intentionally makes those saved messages recoverable after compromise of the decrypted device vault. Clearing current transcripts does not erase previously exported backups.

Backups contain the current ratchet snapshot, not just a reusable long-term identity. An old backup retains any secrets and transcript it captured. Keeping snapshots weakens the erasure guarantees for their captured periods. Restore on one active device, reconcile chain state, verify the new backup, and delete obsolete copies. Simultaneously operating duplicated backups can fork sender state. JavaScript clears retained key arrays and references on lock, but cannot promise hardware-level or browser-heap forensic erasure.

The tested post-compromise scenario is a stolen state snapshot followed by an honest fresh update from that previously compromised member after the attacker loses device control. The old snapshot cannot process the fresh update or decrypt later messages. This does not claim protection against an attacker who still controls a device, retained plaintext, or deliberate message sharing.

## Build and integration

- `packages/communication/package.json` and lockfile pin the protocol dependencies in isolation.
- `node packages/communication/build.mjs` bundles only the supported browser cryptography and generates `web/commons/mls-protocol.mjs` and `web/commons/mls-artifacts.mjs`. It must run before the canonical runtime graph/archive build.
- The generated browser bundle is approximately **151 kB (148 KiB)** uncompressed. No CDN, external JavaScript import, or alternate application loader is required.
- `MLSGroupChat.sol` has an independently reproducible deployment artifact generated with solc 0.8.30, optimizer 200, via-IR, Shanghai, and metadata bytecode hashes disabled. The client checks its exact runtime hash.
- The existing `CommonsDesk` constructor/render/mount/unmount/lock API is preserved. Its state additionally exposes `mls: {configured, unlocked, transport}`.
- `MlsCommonsClient` exposes `configure`, `unlock`, `newKey`, `prepareDeploy`, `prepare`, `groups`, `group`, `sync`, `finalize`, `cancelPending`, `resetGroup`, and `lock`.

## Verification

Commands:

```sh
node packages/communication/build.mjs
node --test packages/communication/test/protocol.test.mjs
node --test test/commons/mls.integration.test.mjs test/commons/mls.desk.test.mjs test/commons/desk.test.mjs
```

The crypto test exercises real MLS add/join, exact roster agreement, authenticated plaintext recovery, replay and cross-sender rejection, erased-message failure under a current-state compromise, update-path healing from a stolen snapshot, removed-member exclusion, and new-member inability to open prior history.

The integration test deploys actual contracts to Ganache and submits actual transactions through the shared wallet review/controller. It covers invalid consent, KeyPackage consumption, current-state restore and bidirectional sending, unsent-generation cancellation, manager acceptance/rekey, removal and complete key replacement/re-invitation, authenticated legacy migration, and a reverted chain checkpoint that freezes state. The vault test covers encryption, wrong-context backup rejection, compare-and-set conflict, and cancellation during unlock. DOM tests cover safe text insertion, private-surface isolation, cleared passphrases and reviews, and a delayed backup read after locking.

Public Ethereum deployment, a physical-browser/device review, and independent cryptographic security review remain distinct external evidence. None is represented here as completed by local tests.
