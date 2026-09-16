# Genesis deployment preparation

`scripts/genesis-deployment.mjs` prepares the current **unminted Genesis native stack**, including its immutable application and privacy worker archives. It produces concrete unsigned CREATE and configuration requests with predicted addresses. It does not connect to an RPC, read signing credentials, estimate fees, mint an NFT, or submit a transaction.

This closes a gap between the complete local Genesis fixture and `deploy:legacy-core`, which deploys only the older core. A generated plan is **offline preparation**, not a deployed collection or proof that a public release is ready. `scripts/lib/genesis-stack.mjs` remains the local development fixture and retains its chain-31337 restriction.

## Prepare the exact build

From the repository root, with the reviewed privacy worker present and its digest matching `web/privacy/runtime-integrity.mjs`:

```sh
npm ci
npm run compile
npm run build
npm run archive:confluence
node scripts/archive-privacy-resource.mjs
```

`npm run compile` targets Cancun. Use `npm run compile:local` for the Shanghai-only Ganache tests. All deployment artifacts in a plan must have one consistent compiler version and EVM target; rebuild the entire stack after changing either. The selected public chain and its EVM support still need live verification before deployment.

The application archive is compressed inside an HTML bootstrap; the recorded `storedBytes` includes that bootstrap and base64 payload. The planner decompresses the embedded gzip and checks the exact expanded byte count. The privacy archive is gzip bytes split into immutable chunks and shards. The plan reports both separately, plus total compressed bytes, total stored archive bytes, total chunks, calldata bytes and transaction count. It reports **gas and fees as unestimated**. Zero transaction value means no ETH is transferred by these requests; deploying the code still costs gas.

## Choose configuration explicitly

Create a JSON configuration with these fields. Addresses below are placeholders to replace with addresses you control or deliberately select. The example selects Sepolia; Base Sepolia is `84532`, and isolated local testing is `31337`. Mainnet is rejected.

```json
{
  "chainId": 11155111,
  "deployer": "REPLACE_WITH_DEPLOYER_EOA_ADDRESS",
  "startingNonce": 0,
  "attesters": ["REPLACE_WITH_ATTESTER_ADDRESS"],
  "threshold": 1,
  "royaltyReceiver": "REPLACE_WITH_ROYALTY_RECEIVER_ADDRESS",
  "royaltyBps": 500,
  "freezeTrustRoots": false,
  "experimentGuardian": "REPLACE_WITH_EXPERIMENT_GUARDIAN_ADDRESS"
}
```

There are no implicit choices for these fields. Set `startingNonce` to the intended EOA's verified **pending nonce** on the selected chain; `0` is only an example. That deployer also becomes the initial administrator for the core, proof router and verifier, and the one-time publisher/configurator for the manifest and ledger. A contract wallet uses different deployment semantics and is not supported by this planner.

Attesters are deduplicated by rejecting duplicates and ordered numerically. The threshold must be achievable with the selected list. `freezeTrustRoots: true` includes permanent freeze calls after configuring the signer set and proof-kind-1 router entry; `false` leaves those administration capabilities available. This is a trust decision, not a security rating. The collection currently enforces a maximum royalty of 1,000 basis points; the planner validates that existing constructor limit.

Do not put a private key, RPC URL, mint secret or gas payment information in this configuration. Unknown fields are rejected.

```sh
node scripts/genesis-deployment.mjs --config genesis-config.json --output genesis-plan.json
node scripts/genesis-deployment.mjs --verify genesis-plan.json
```

Choose a fresh output filename; existing files and symlink targets are never overwritten. The output contains exact calldata, chain ID, sender, nonce, zero value, and either a predicted CREATE address or a configuration target. Every configuration call consumes a nonce too; later CREATE addresses account for those calls. The plan has no gas limit, fee, signature or broadcast command.

Verification reconstructs the complete plan from the current artifacts and validated archive bytes and compares all fields. It does not merely trust the saved `planSha256`. Changing calldata, value, nonces, order, modules, archive content, compiler artifacts or unrecognized transaction fields invalidates the saved plan. A fresh plan after a deliberate configuration/build change needs a fresh review. The digest detects changes; it is not an approval signature.

## What the sequence contains

| Stage | Contracts and configuration |
| --- | --- |
| Immutable resources | Application `AppChunk` contracts and `OnchainApp`; privacy worker chunks, `OnchainApp` shards, and `ShardedResource` |
| NFT foundation | `GenesisManifest`, `ConfluenceRenderer`, `ProofRouter`, `ThresholdAttestationVerifier`, `OmnichainWitnessRegistry`, collection, and `SovereignAccountFactory`; signer/router configuration and one-time factory installation |
| Native activity | `WorldLedger`, `NativeMarket`, `TimeVault`, `GenesisLaunchpad`, `MemoryLedger`, `JournalSwapRouter` and journal-router installation |
| Ownership and obligations | `VestedExitVault`, `ExperimentCellFactory`, `EditionRegistry`, `CommissionEscrow`, `ExperimentGate`, `BondedShelf`, `ConsentGiftRouter`, `InstrumentRouter` |
| Art and cartridges | `ArtifactBinding`, `CartridgeRegistry`, `CommissionedCartridges` |
| Whole NFT market | `CommitmentIndex` with the eight tracked obligation modules, `EstateExchange`, estate installation **before** ledger sealing |
| Final publication | `OwnerLaunchFactory` and one-time `GenesisManifest.publish` for market, vault, memory, world ledger, cartridges and vesting exits |

The collection begins with zero minted tokens. Owner accounts are created through the collection's normal mint flow. `OwnerFeeRouter` requires a real owner/account and owner-chosen recipients/weights, so it is a separate per-owner action. No predictable fixture secret, 25 ETH development deposit, seeded launch or simulated swap is included.

Uniswap v4 contracts and liquidity use their separate integration/deployment workflow. Archiving the privacy worker does not deploy the RAILGUN network or put its external circuit files onchain. Keepers, workshop providers and other offchain services also require separate setup. These boundaries are included in every generated plan.

## Before a public deployment

An operator must still verify the live chain, actual EOA identity, pending nonce, EVM compatibility, balance and fees; simulate the exact sequence; and review all contracts and immutable choices. Recheck nonces immediately before each operation. An unrelated sender transaction or any inserted/omitted operation changes the predicted address sequence and requires stopping and reconstructing the remaining deployment from confirmed state. There is no resume/broadcast implementation in this tool.

After a separately authorized deployment, receipt success alone is insufficient. Verify every deployed address and constructor binding, the installed factory, proof configuration, sealed world modules, sorted commitment roster and six manifest entries. Recover the application and worker from the chain and compare their full digests and exact bytes. Only then create a live deployment record and exercise a deliberately funded mint with its metadata and owner interface. `--verify` performs build comparison locally; it does not make any of those onchain claims.

## Validation

```sh
npm run compile:local
node --test test/genesis/deployment-plan.test.mjs
```

The tests reject incomplete or invalid choices and altered plans, catch archive corruption/substitution, check nonce shifts from configuration calls, and execute every generated operation in an isolated chain-31337 EVM. They verify predicted CREATE addresses, an unminted collection, factory/renderer bindings, the two-attester threshold and chosen freezes, sealed ledger/estate wiring, all six manifest entries, permanent publication, the commitment roster, and exact application/privacy archive recovery. Small purpose-built archives keep this execution test bounded; generating a real release plan validates the full built archives separately.
