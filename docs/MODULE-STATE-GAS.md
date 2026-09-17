# Direct state within the transaction gas budget

`ModuleStateStore` accepts the same 32 KiB direct snapshot and exposes the same `record`, `dataOf` and history ABI. New deployments store nonempty direct payloads in one or two canonical `AppChunk` contracts. Each chunk starts with STOP and holds at most 23,000 payload bytes, below EIP-170's runtime size limit. Empty snapshots create no chunks. The state record still commits the complete SHA-256 digest, namespace, schema, parent and custody epoch.

This fixes a concrete deployment blocker. [EIP-7825](https://eips.ethereum.org/EIPS/eip-7825) caps a transaction's gas limit at 16,777,216 regardless of the block limit. The former storage-slot implementation needed a 29,172,440 gas limit, including the wallet's 20% headroom, to stage a full nonzero 32 KiB payload through the genuine NFT account.

The focused [gas and recovery regression](../test/modules/state-gas.integration.test.mjs) measured the replacement:

| Action | Payload bytes | Gas used | Submitted gas limit, including headroom |
|---|---:|---:|---:|
| Stage snapshot | 32,768 | 7,713,661 | 9,461,092 |
| Stage snapshot | 23,001 | 5,476,498 | 6,777,358 |
| Stage snapshot | 23,000 | 5,442,605 | 6,737,595 |
| Stage snapshot | 1 | 323,341 | 417,588 |
| Stage snapshot | 0 | 244,430 | 322,895 |
| Write active snapshot | 32,768 | 7,871,459 | 9,602,817 |

The test uses varying nonzero bytes, verifies the exact recovered payload and digest, activates a staged snapshot, checks the subsequent parent/head relationship, and rereads every earlier snapshot after the later writes. It rejects a gas limit above the cap before sending. The full browser acceptance also checks that every reviewed transaction's submitted gas limit fits the cap.

These measurements come from a disposable Shanghai EVM with an explicit transaction budget; they are not measurements from a public deployment or a current-fork node. Later gas schedules, wallet policies and RPC constraints still need their own deployment checks.

The registry remains the only writer. Chunk creation is part of the same atomic state transaction, and callers cannot substitute external code addresses for direct data. Larger archive-backed states continue using the existing verified archive descriptor. Public bytes remain public unless the caller encrypts them.

Existing immutable state stores are unchanged. Their bytes remain recoverable through the existing ABI. Obtaining the new backing storage requires deploying the updated companion contracts; publishing new source cannot upgrade an old deployed contract.
