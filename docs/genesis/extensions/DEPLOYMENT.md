# Preparing and verifying extension deployments

The extension planner produces complete unsigned constructor and configuration transactions. It preserves the existing sealed Genesis manifest and writes a separate extension directory. It does not accept a private key, sign, send transactions, fund wallets, choose external trust roots, or claim a source module has already been deployed.

The catalog in `deployment.example.json` covers every new contract family and identifies factory-created contracts and offchain services. Select one group's `config`, replace its visible placeholders with verified chain-specific values, and save that as a new configuration file. Each group is independent. Choose the actual pending nonce for the deploying wallet; do not reuse the catalog's placeholder nonce across groups. Choose start blocks and deadlines that allow all setup transactions to finish.

```sh
node scripts/extensions-deployment.mjs prepare config.json extension-plan.json
node scripts/extensions-deployment.mjs verify extension-plan.json
```

`prepare` and `verify` are fully offline. They load the current compiled artifacts, encode every constructor and configuration call through its actual ABI, predict each CREATE address, and account for the nonce consumed by configuration calls. `$Name` arguments reference a previously deployed module or explicitly pinned external contract. Forward references, duplicate names, unknown configuration fields, imprecise numeric inputs, empty/unlinked bytecode, unsupported chains, missing immutable-reference data, nonpayable value, view-only configuration calls and over-limit initcode/runtime fail before a plan is written.

Plans include explicit native value on every transaction, total native commitment, constructor arguments, exact calldata hashes, artifact hashes, compiler/EVM identity, expected addresses and a canonical plan hash. Gas and fees remain unestimated until the actual chain state can be simulated. Constructor encoding does not prove that the chosen external contracts, roles, balances, time windows or runtime dependencies are valid. Each real transaction still needs normal simulation and wallet review. The planner deliberately exposes all setup calls; it does not silently grant allowances or change governance.

External dependencies have `{address, contractName, runtimeCodeHash}` pins. `contractName` supplies the reviewed ABI; the runtime hash supplies the exact deployed-code identity. This does not by itself freeze a proxy implementation or mutable configuration. Such dependencies need their normal protocol-specific checks.

For example, a safe two-contract sequence can deploy privacy keys and then their group-chat registry:

```json
{
  "schema": "anima.extensions-deployment-config/1",
  "chainId": 31337,
  "deployer": "<YOUR_ACTUAL_NONZERO_WALLET_ADDRESS>",
  "startingNonce": 0,
  "externals": {},
  "steps": [
    {"kind": "deploy", "name": "PrivacyKeys", "contractName": "PrivacyKeys", "args": [], "value": "0"},
    {"kind": "deploy", "name": "EpochGroupChat", "contractName": "EpochGroupChat", "args": ["$PrivacyKeys"], "value": "0"}
  ]
}
```

The address placeholder must be replaced and the nonce must match the wallet. No ready-to-broadcast public-chain address or authorization is invented here.

## Observed runtime directory

Constructor immutables are inserted into deployed runtime bytecode. Therefore the hash of a compiler's zero-filled runtime template is generally **not** the contract's actual code hash. An unsigned plan marks runtime hashes as pending.

After independently reviewed transactions have been mined, save a JSON mapping from every plan request ID to its actual transaction hash. For example:

```json
{
  "PrivacyKeys": "<ACTUAL_DEPLOYMENT_TRANSACTION_HASH>",
  "EpochGroupChat": "<ACTUAL_DEPLOYMENT_TRANSACTION_HASH>"
}
```

Then verify the actual transactions and contracts through a configured read-only RPC:

```sh
node scripts/extensions-deployment.mjs inspect extension-plan.json receipts.json ANIMA_EXTENSION_RPC extension-directory.json
```

`ANIMA_EXTENSION_RPC` is the name of an environment variable containing your chosen HTTP(S) RPC URL. `inspect` never requests a signer or submits a transaction. It verifies the plan again, chain ID, every successful receipt, sender, nonce, destination, exact calldata, native value and canonical block. It compares actual runtime against the reviewed compiler template while allowing only the compiler-declared immutable byte ranges. Exact deployment transaction matching separately binds the constructor arguments. It verifies every external code pin again and anchors the whole inspection to a stable block.

The resulting `anima.extensions-directory/1` contains the real addresses, observed runtime code hashes, deployment transaction/block identities and complete verified request list. It leaves the core manifest unchanged. The JavaScript `verifyExtensionsDeploymentReceipts` function also accepts a configurable confirmation count; the CLI checks inclusion with one confirmation and does not claim cross-chain finality. Runtime verification authenticates reviewed code and deployment transactions, not every semantic property of external protocols.

The compiler must retain `immutableReferences` in all deployment artifacts. Core artifact files from an older compile may omit them; compile current source before preparing an extension plan. The CLI uses exclusive output creation and refuses to overwrite an existing plan or directory.

## Required setup beyond constructors

- Auction inventory and matching budgets must really be funded. The example shows their exact native values and token approvals.
- Whole-NFT custody requires the issuer's exact NFT approval and a fresh Bound account. Deposit transfers ownership, so subsequent share actions use shareholder wallet authority.
- Experimental gate activation, isolated-cell approval, quote/base liquidity, price feeds and keeper bindings must be selected and verified. The catalog keeps activation a separate explicit action.
- Portal peers are configured per chain with real endpoint libraries, DVNs, executors and confirmations. Configure and seal only after reviewing those dependencies. Optional witness registration requires unfrozen registry authority.
- ENS naming requires real parent/subdomain control. A factory creates each user's personal mint session; it does not grant the deployer a user's mint key.
- Native quote proof generation requires the exact pinned proving artifacts and generated verifier. The current setup remains marked single-machine development only and is not an account-spending authorization verifier.
- Generated instruments and persistent multiplayer services require their configured offchain runtime, storage and operator endpoints. See `WORLDS.md`; deploying contracts does not start those services.

## Checks

`node --test test/extensions/deployment.test.mjs` verifies nonce sequencing, dependencies, canonical tamper rejection, strict configuration errors, nonpayable checks, required immutable metadata, local CREATE/configure transactions, exact observed immutable code hashes, receipt mismatch and confirmation rejection, and external code pins. The fixtures use a local ephemeral EVM; they do not submit public-chain transactions.
