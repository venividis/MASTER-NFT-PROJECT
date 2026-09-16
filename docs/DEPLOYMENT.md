# Development deployment — 1.2

## Status before running

No public contract was deployed for this release. The compiler dependency was missing in the execution environment and the revised Solidity was **not compiled**. The browser adapter has mock-provider coverage, not a successful live-chain rehearsal. Do not fund a production deployment based on this package.

## Install the protocol toolchain in a network-enabled development environment

Node 22 and Rust/Cargo are required for the complete inherited validation command. Top-level dependencies are exactly specified, but the inherited package supplied no lockfile; transitive installation reproducibility is not established. Generate and review a lock before a deployment build, then retain it and use `npm ci` subsequently.

```sh
npm install
npm run validate
```

Do not proceed if compilation, bytecode size, static checks, contract integration, verifier, agent, web or Rust tests fail. Passing local UI tests alone is insufficient.

## Local deployment

After the full suite passes:

```sh
npm run world
```

This launches Ganache chain **31337**, deploys the stack, creates a genesis NFT, starts the local agent and serves the interface. The terminal prints the actual collection, token and account addresses. No fixed address is promised here.

The mnemonic printed by this script is a well-known **development-only** mnemonic. Do not use any derived account on a public network. Import the printed holder's development account into an isolated wallet profile only. Connect the wallet to the printed local RPC, open the interface, choose **Connect**, and enter the printed collection and token ID. The new interface remains in preview until that explicit connection.

New minting has a commit and reveal transaction. The reveal must wait the contract's minimum block delay. An idle development chain may need two additional mined blocks; use the local development RPC tooling, not a production RPC. Do not alter client receipts to pretend that blocks were mined.

## Public testnets

Client allows Sepolia **11155111** and Base Sepolia **84532**. Obtain test gas independently and deploy only after successful local rehearsal and source review. Never put a private key in the HTML, repository, chat, screenshot or browser storage.

The inherited deployment script reads `RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `ATTESTER_ADDRESS`, `ROYALTY_RECEIVER`, `ROYALTY_BPS`, and `FREEZE_TRUST_ROOTS`. Its complete production configuration has not been validated here. The deployment script also checks the same three chain IDs before sending. This source guard is not a substitute for reviewing the RPC, signing wallet, compiler output and deployed contracts.

## Browser transaction sequence

1. Explicit account permission; chain allowlist; require contract bytecode.
2. Read a single-block snapshot. A block hash is recorded, not declared finalized.
3. Build exact calldata; use `eth_call` and `eth_estimateGas` before presenting a review.
4. Review destination, action, zero native value and estimated gas cost.
5. Recheck chain/account, re-simulate, then request wallet submission.
6. Show submitted hash. Wait for a receipt with successful status and matching block identity before refreshing chain state.

Rejections, reverts, account changes, chain changes, and timeouts do not advance the local display as though execution succeeded. A timeout includes the submitted hash; inspect it before submitting again. RPC data remains a trust boundary and one included receipt is not finality.

## Mint recovery and Sovereign proofs

The commit/reveal mint uses a random **mint secret**, not a wallet key. Save the recovery JSON before committing. It binds secret, recipient, chain and deployment; anyone obtaining it may observe its content. Losing it can prevent revealing that commitment. The UI sends no mint endowment.

Sovereign evolution produces an exact proof request with calldata hash, nonce, validity window, roots, constitution, deployment and verifier ID. The user must obtain a proof from an actually configured prover. Importing that proof does not execute automatically; the client simulates the contract's verification and asks for a separate transaction confirmation.

The HTML does not itself generate SP1/RISC Zero proofs or attestations. Do not Ascend until the selected verifier path and constitution are independently reviewed and exercised. Ascension cannot be reversed and can strand control when the prover is absent.
