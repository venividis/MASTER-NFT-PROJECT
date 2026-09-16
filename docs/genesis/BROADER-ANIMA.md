# Broader ANIMA · first implementation milestone

The canonical project is [venividis/ANIMA-NFT-](https://github.com/venividis/ANIMA-NFT-), starting from the complete Genesis 5.5 source. The trailing hyphen is part of the repository name. Version 5.6 adds two implemented paths from the approved research proposal while preserving the original blue object, mathematical interior, unrestricted camera gestures, privacy controls and v4 lifecycle.

## Rehearsal: inspect an action before signing

Open **Atlas → Onchain instruments**. Prepare a NativeMarket swap or TimeVault lock/release and select **Rehearse exact effects**. This submits the exact unsigned NFT-account intent to a service you run locally. The service pins a source block, creates a disposable Anvil fork, executes the account transaction there, and reads actual balances, allowances, locks and account authority before and after execution.

The source RPC sits behind a read-method allowlist. Signing, impersonation and transaction methods cannot pass through it. Only the disposable fork receives those commands. No wallet private key is requested. The browser keeps the service token in memory, cancels stale work on edits/navigation, and clears it on app locking or wallet invalidation. The service binds to loopback, requires a random session token and allows only configured web origins. It does not persist requests or reports.

```sh
npm ci
npm ci --prefix integrations/console/protocol/v4-hook
npm run genesis:local
```

In a second terminal, for the local development chain:

```sh
ANIMA_REHEARSAL_RPC=http://127.0.0.1:8545 npm run rehearsal
```

Paste the printed **session token** into the optional Rehearsal connection in Onchain instruments. The default endpoint is `http://127.0.0.1:8788`. Use the local interface at `http://127.0.0.1:4173` if the browser restricts access from the hosted page to loopback. A public-chain source requires an appropriate HTTPS RPC with historical state support. Its credentials stay in the service environment. `ANIMA_REHEARSAL_ORIGINS` accepts a comma-separated exact origin list; `ANIMA_REHEARSAL_PORT` changes the loopback port.

The report binds to the chain, collection, token, owner, account epoch and exact calldata. Before a rehearsed plan reaches signing, the wallet rechecks its source block, account nonce, two-minute review validity, owner and epoch. A reverted or mismatched report cannot become a rehearsed review. Only a subsequently included owner-signed transaction is recorded as completed.

**Scope:** the runner uses Anvil 1.7.1 and a Cancun EVM. Its estimates describe that pinned simulation, including fork gas pricing. Future block conditions, other transactions, liquidity, gas prices and chain-specific execution rules may differ. Report integrity relies on the local runner; it is not a zero-knowledge proof. Explicit minimum output, deadlines, account checks and fresh pre-sign simulation still apply. Installed module linkage is checked and the target code hash is reported; this is not an independent audit of a deployment. Private RAILGUN payloads never enter this public-intent service.

## Instrument workshop: acquire a useful executable

Open **Atlas → Instrument workshop** after connecting a minted NFT. Supply the deployment's CommissionedCartridges and TimeVault addresses. A fresh `genesis:local` stack prints both. Older deployed stacks require an explicitly deployed publisher and compatible existing escrow/cartridge registry; their immutable code is not upgraded automatically.

1. Read up to 48 selected public lock records at a pinned block. Preview the deterministic release calendar and its exact raw-integer cliff/linear mathematics. Its time slider explores future availability relative to the snapshot's already-released amounts. Export an ordinary calendar file if useful.
2. Consent to sharing those selected public records, then export the provider request. Choose a provider, evaluator, payment asset, fixed budget and submission deadline. The default evaluator is the NFT account, controlled by its current owner. Review the separate funding transaction.
3. The provider accepts the commission and submits the expected deliverable hash. The client recomputes the entire output from the selected snapshot; altered HTML, manifest, compiler identity or hashes fail validation. Preview before approving. Rejection of an incorrect provider digest remains available.
4. Approval credits the fixed payment in CommissionEscrow. Anyone can trigger withdrawal to its fixed recipient. Rejection or expiry credits a refund to the funding NFT account. A selected external evaluator must use its own signing flow; the owner cannot impersonate it.
5. Review a separate acquisition transaction. CommissionedCartridges checks that the work is paid, the caller is its canonical funding NFT account, and the manifest/content exactly match the accepted commitment. It mints a cartridge, publishes its bytes, freezes the manifest, and transfers that cartridge to the NFT account. A work ID can be acquired only once.
6. Open **Worlds**, enter the returned CartridgeRegistry and cartridge ID, and launch the owned instrument. Ownership, current controller and content hash are re-read. It executes in the existing isolated frame with no wallet or network access.

The calendar is deliberately a read-only instrument. Acquisition does not create an account session, instrument grant or automatic release transaction. Spending permission and content adoption remain separate existing owner-controlled mechanisms. Transferring the main NFT changes the cartridge's controller and invalidates old owner reviews. The onchain artifact and manifest are public; the workshop never exports shielded wallet data, recovery keys or private notes.

The publisher has no administrator, payment function or grant function. The escrow evaluator remains an explicit trust choice: an accepted digest proves commitment to bytes, not usefulness, authorship or safety. The supplied deterministic recipe and isolated launcher make this initial job reviewable. Arbitrary generated code, open provider discovery and hosted agents are not enabled by this release.

### Provider tools

Providers can reproduce the exact instrument without a model service, API key or wallet key:

```sh
node scripts/workshop-provider.mjs build anima-calendar-request.json ./calendar-output
node scripts/workshop-provider.mjs verify ./calendar-output/deliverable.json
node scripts/workshop-provider.mjs plan ./calendar-output/deliverable.json ./calendar-output ESCROW_ADDRESS WORK_ID CHAIN_ID
```

The first command writes the self-contained HTML, deliverable JSON and `.ics` calendar. The plan command writes unsigned `accept` and `submit` requests. It does not read or attest to an escrow deployment: the provider must verify chain, contract, fixed worker/evaluator, terms, amount and deadlines before separately signing. Acceptance must be included before submission. No automatic service purchase occurs.

## Research decisions carried forward

The original proposal separated useful capabilities from speculative integrations. This milestone implements actual fork rehearsal and deterministic commissioned instruments using existing account and escrow authority.

| Candidate | Decision | Reason |
| --- | --- | --- |
| [ERC-8183 agent commerce](https://eips.ethereum.org/EIPS/eip-8183) | Future adapter | The proposal remains Draft. Existing CommissionEscrow already supports fixed provider/evaluator, deliverable commitment, payment and expiry; it is not presented as ERC-8183 compliant. |
| [ERC-8004 agent identity and reputation](https://eips.ethereum.org/EIPS/eip-8004) | Optional discovery later | Discovery and reputation must not grant account authority or certify arbitrary output as safe. |
| [x402](https://docs.x402.org/) | Later immediate-purchase adapter | Requires explicit budget and deployed asset/signature compatibility before account-funded purchases. This milestone does not pretend that escrow and instant HTTP payment are interchangeable. |
| Hosted model/agent execution | Later, explicit consent | Requires selected provider, disclosed data and fixed budget. The first instrument is reproducible locally. |
| Proof-backed rehearsal | Benchmark first | A local fork report is useful now; claiming cryptographic correctness would require a separately implemented and verified proof path. |
| Shielded swaps and launches | Retained 5.5 integration | Public deployments, funded end-to-end validation and independent review remain required before production activation. |

The project is built around NFTs that can actually be minted. Local EVM fixtures mint distinct master NFTs, execute their account transactions, acquire executable cartridge NFTs, and verify custody after transfer. No public NFT mint, public launch, funded shielded transaction or independent audit is claimed by this development milestone.
