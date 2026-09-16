# Operating a funded exit vault

No keeper is deployed or running by default. The website provides a separate onchain exit desk; local clock controls are not an automation service.

## Contract setup

Deploy `VestedExitVault(collection, market)` for a new or otherwise explicitly reviewed deployment. The market must be the reviewed immutable NativeMarket or compatible V4GenesisMarket adapter. Verify deployed code, collection, market and canonical account addresses independently. The local fixture is reproducible with `npm run compile:local`, `npm run build`, `npm run archive:confluence`, and `npm run deploy:confluence:local`; it uses ephemeral Ganache and produces no public addresses.

For marketplace accounting, deploy a new `CommitmentIndex` with the exit vault in its sorted module roster, plus all other relevant obligations, and a corresponding new `EstateExchange`. The fixture demonstrates a bounded roster containing TimeVault and VestedExitVault plus mandatory cell inventory. It is not a claim to discover every possible external liability. Existing indexes cannot be amended.

Connect the owned NFT in Atlas, then open **Onchain vesting exits**. Set the verified vault, asset addresses, ordinary decimal token amounts, individual minimums and dates. The desk authenticates the vault runtime against the current compiled release before binding collection and market, and reads token decimals for exact integer encoding. Deployment details remain available under Advanced. Its utility call funds the plan and clears the exact ERC20 allowance atomically. Record the `Funded` event’s plan ID. Inspect this ID through the desk before provisioning a keeper.

## Read-only inspection

Set these environment variables through your runtime’s secret/configuration facility:

- `EXIT_RPC_URL`: trusted Ethereum RPC
- `EXIT_CHAIN_ID`: exact chain ID
- `EXIT_VAULT`: verified deployed vault
- `EXIT_PLAN_IDS`: explicit comma-separated positive plan IDs, at most 32

Run:

```sh
npm run keeper:exits
```

It only reports eligible installments. It does not submit a transaction or change any minimum.

## Explicit execution

Additionally configure:

- `EXIT_KEEPER_PRIVATE_KEY`: a separate keeper key with only the gas funds needed; never the NFT owner’s key
- `EXIT_VAULT_CODE_HASH`: independently verified deployed code hash
- `EXIT_MAX_FEE_GWEI`: maximum accepted execution gas price
- `EXIT_MAX_RUN_GAS_WEI`: total maximum gas spend for this one process invocation

Run:

```sh
npm run keeper:exits -- --execute
```

The keeper can submit only `executeSlice(plan,index)`. It cannot redirect proceeds or loosen terms. It checks eligibility, simulation, chain, deployed code and operator gas limits. It waits for two confirmations before recording a confirmed execution. A failed estimate leaves the slice pending. Broadcast or receipt uncertainty stops the process instead of blindly retrying. Inspect its transaction hash before restarting.

To operate repeatedly, provision a service scheduler with a cadence shorter than the chosen execution windows, durable logs, funded gas, monitoring and a **separate daily/monthly infrastructure spending limit**. The per-run gas budget resets at each invocation. No such service, funds or monitoring was provisioned by this build. The CLI is one-shot deliberately; repeated scheduling is an explicit operator action.

The current fee calculation supports Ethereum, Sepolia and local Ethereum development nodes. Other fee models need a separate adapter. Public mempool submission remains visible to other traders; fixed minimums bound accepted output but do not eliminate MEV, downtime, front-running or missed fills.

Pause or cancel through the NFT account. Cancelled slices recover only after their original maturity; expiry also permits recovery. After a custody change, reauthorization leaves the schedule paused, and a separate resume is required. Always inspect the new owner’s obligations before purchasing an NFT account.
