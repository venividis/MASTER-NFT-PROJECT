# Complete Ethereum Sepolia deployment and mint

The `sepolia` command turns the existing verified unsigned Genesis and module planners into a deliberately gated, resumable Ethereum Sepolia workflow. It deploys the immutable application, privacy-worker archive, native contracts, and module workbench, then supports the collection's real two-transaction mint. It rejects mainnet and every chain other than Sepolia (`11155111`). It does **not** deploy optional Uniswap v4 liquidity, RAILGUN infrastructure, cross-chain lanes, keepers, or hosted world services.

## 1. Prepare the release build

Use Node 24.19.0 and npm 11. From a clean checkout:

```sh
npm ci
npm run compile
npm run compile:v4
npm run build
npm run archive:confluence
node scripts/archive-privacy-resource.mjs
npm run validate:release
```

Review the source, test output, compiler pins, and security boundaries before spending testnet ETH. The full archives require many transactions; obtain enough Sepolia ETH and expect deployment to take time.

## 2. Prepare an offline-reviewed plan from live nonce data

Choose a funded EOA and a trusted Sepolia RPC. The deployer becomes the initial administrator. The attester, royalty receiver, and experiment guardian are explicit trust choices; they may be the same EOA for initial testing.

```sh
export SEPOLIA_RPC='https://YOUR_SEPOLIA_RPC'
export DEPLOYER='0xYOUR_FUNDED_EOA'

npm run sepolia -- prepare \
  --rpc "$SEPOLIA_RPC" \
  --deployer "$DEPLOYER" \
  --attester "$DEPLOYER" \
  --royalty-receiver "$DEPLOYER" \
  --guardian "$DEPLOYER" \
  --royalty-bps 500 \
  --freeze-trust-roots false \
  --output sepolia-plan.json
```

The command reads only the chain ID and pending nonce. It creates no signature and sends nothing. Review `sepolia-plan.json`, especially the addresses, trust settings, hashes, transaction count, and predicted collection/workbench addresses. Do not use the deployer for any other transaction after planning; a changed nonce invalidates the address sequence.

## 3. Deploy and resume safely

Provide the key only through the process environment. Do not place it in JSON, `.env`, shell history, or this repository. Prefer a temporary testnet-only key. The literal confirmation prevents an accidental invocation.

```sh
read -rsp 'Sepolia deployer private key: ' SEPOLIA_DEPLOYER_PRIVATE_KEY; export SEPOLIA_DEPLOYER_PRIVATE_KEY; echo
npm run sepolia -- deploy \
  --rpc "$SEPOLIA_RPC" \
  --plan sepolia-plan.json \
  --journal sepolia-journal.json \
  --confirm DEPLOY_ANIMA_TO_SEPOLIA
unset SEPOLIA_DEPLOYER_PRIVATE_KEY
```

Before every transaction the runner checks the pending nonce, estimates that exact operation, adds 20% gas-limit headroom, and waits for successful inclusion. It records the transaction hash before waiting. If the process stops, rerun the same command with the same plan and journal. A recorded pending transaction is never resent automatically. If the nonce or predicted address differs, the runner stops instead of improvising a new deployment.

Keep the plan and journal as public deployment evidence. They contain no private key. Verify the resulting addresses in a Sepolia explorer and recover the workbench independently as described in [the module deployment guide](MODULES-DEPLOYMENT.md).

## 4. Mint NFT #1

Minting uses commit/reveal. The recovery file contains the random reveal secret and is written **before** the commit is submitted. Keep it private until minting finishes.

```sh
read -rsp 'Sepolia deployer private key: ' SEPOLIA_DEPLOYER_PRIVATE_KEY; export SEPOLIA_DEPLOYER_PRIVATE_KEY; echo
npm run sepolia -- mint \
  --rpc "$SEPOLIA_RPC" \
  --plan sepolia-plan.json \
  --recovery sepolia-mint.json \
  --recipient 0xINTENDED_NFT_OWNER \
  --endowment-wei 0 \
  --confirm MINT_ANIMA_ON_SEPOLIA
```

If two blocks have not elapsed, the command exits safely and prints the required block. Run the identical command again after that block. Reveal must occur no later than 200 blocks after commitment. On completion it prints the token ID and NFT-owned account. The default endowment is zero; any nonzero value is deposited into the new NFT account.

`--recipient` is mandatory on both the first invocation and every recovery invocation. The runner checks it against the recovery file before submitting anything, so an operator cannot accidentally resume a mint for a different owner.

The plan, journal, and mint recovery filenames are ignored by Git by default. Back them up securely. The private key is never stored by the runner.

## 5. Use and recover it

Recover the module workbench using the address printed by deployment:

```sh
npm run modules:recover-workbench -- \
  --rpc "$SEPOLIA_RPC" \
  --chain 11155111 \
  --workbench WORKBENCH_ADDRESS \
  --token-id 1 \
  --output ./recovered-workbench
```

Serve the recovered directory from a trusted local origin and connect a wallet on Sepolia. Publishing the bundled example modules and installing them are separate publisher/owner transactions; deployment of the base system does not silently grant a module control over the NFT account.

The current public Sepolia collection and module-system deployment is recorded in [the live deployment record](deployments/sepolia-11155111.json). That record contains public addresses and transaction hashes only; it contains no signing key or mint secret.
