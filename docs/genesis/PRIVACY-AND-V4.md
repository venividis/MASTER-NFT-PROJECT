# Privacy and v4 execution — current cleanup behavior

This release implements an opt-in RAILGUN v2 shielded execution integration and a genuine Uniswap v4 launch lifecycle. No public-chain Genesis v4 deployment or funded RAILGUN end-to-end transaction has been performed. Independent contract and integration audits are still outstanding. The published interface starts with private execution selected and fails closed until its deployment, private wallet, network, spendable funds and broadcaster are ready.

## What is protected

- Private swaps never use the connected NFT account, NativeMarket, WorldLedger or an injected public signer. Private mode has no public fallback. The user reviews amounts and fees, generates a proof, then explicitly submits through Waku's broadcaster client.
- Inputs originate from shielded balances. All output tokens, new launch tokens, liquidity shares and input refunds return to the private wallet. Swaps, approvals and return shields are grouped in a require-success RelayAdapt self-multicall. The outer fallback shields only pre-existing inputs, including when a new-token launch fails before its token exists. A failed application call can still incur protocol and broadcaster fees.
- Private launch drafts, notes, settings, pending submissions and local receipts are encrypted using native AES-256-GCM. Passwords derive nonextractable encryption keys through PBKDF2-SHA256 with 600,000 iterations and a random 256-bit salt. Every save uses a fresh 96-bit IV. Backup authentication, work-factor bounds and generation checks reject tampering and unlock/lock races.
- The RAILGUN wallet database, decrypted balances, Merkle indexes and proof state stay in a dedicated worker's RAM. Locking terminates the worker; it does not leave a persistent decrypted balance database. This intentionally requires synchronization again after unlocking. Public proving artifacts are held in memory as well.
- Backgrounding the page or five minutes without input locks an open private vault. Hide screen and Ctrl+Shift+L cover the entire interface, lock the private and mint wallets and disconnect the app's NFT/public signing sessions. This also invalidates the original testnet client’s signing session. An external wallet extension has its own lock controls; app locking cannot cancel a transaction already approved or submitted.
- Private addresses are hidden until explicitly revealed. Recovery phrases are never rendered by the wallet interface. Private form contents are excluded from the optical text rasterizer, so private notes or drafts are not baked into particle/canvas caches. Notes and settings never enter the ordinary public/local Confluence export.
- A private submission reserves its operation ID, chain, relay and exact transaction-data hash in encrypted storage before broadcast. Web Locks serialize competing tabs, and stale encrypted revisions are rejected. As soon as the broadcaster supplies a transaction hash, the worker waits for an encrypted-persistence acknowledgment before waiting for its receipt. Receipt persistence decrypts and merges into the latest authenticated envelope under the shared lock, preserving legitimate note edits from other tabs. A receipt save already in progress can finish after locking without reopening keys or decrypted UI data.
- After unlock or restart, the wallet inspects the original transaction and checks its destination, data fingerprint, zero native value, chain and two confirmations. It distinguishes a successful application call, an application revert, a transaction revert, pending and confirming states. New submissions remain blocked until terminal reconciliation; a balance change or missing receipt never clears the reservation. If the page closes before the broadcaster supplies a hash, the reservation remains: an independently recovered hash can be entered and checked against the original fingerprint. Older backups lacking that fingerprint require independent reconciliation and cannot be cleared by the new UI.
- The optional worker is bundled locally and SHA-256 verified before execution. No runtime code is loaded from an npm CDN. Web requests from the loader omit referrers; external runtime downloads omit credentials. General page referrers are disabled.

## What remains observable

| Surface | Observable information |
| --- | --- |
| Uniswap pool | Token addresses, supply, pool creation, price, ticks, liquidity, traded amounts and timing |
| Public deposit | Funding wallet, deposited asset, amount, time and prior wallet history |
| Public withdrawal or public trading mode | Recipient or signer, transfers and linkable account activity |
| Creator authority | This launchpad uses an immutable LP fee and no owner/hook administrator; it does not create a hidden administrator |
| Connection providers | RPC, proof services, public synchronization services and Waku peers may observe IP/connection metadata |
| Local device | An unlocked session, malicious extension, compromised operating system, clipboard or screen capture can disclose information |
| Correlation | Distinctive amounts, timing, address reuse and a small anonymity set can weaken privacy |

Waku does not provide a guarantee that every peer cannot observe an IP address. This build is not a Tor client. It does not erase public chain history or guarantee physical safety. A same-origin malicious application update can affect the interface; an independently verified onchain edition provides a stronger integrity anchor for its pinned optional worker. JavaScript cannot guarantee forensic zeroization of operating-system memory.

## Complete launch lifecycle

`GenesisV4Launchpad.launch` atomically deploys a deterministic fixed-supply ERC20, initializes a real v4 pool, and funds `GenesisV4Position`. Every unused token or quote unit returns to the caller. No platform allocation, transfer tax, extra mint authority or token administrator exists.

The position is represented by transferable ERC20 shares over an immutable pool and range. Uncollected fees follow shares proportionally, including through TimeVault custody. Fee-only collection leaves principal and share supply unchanged. Adding or reinvesting actual liquidity issues only proportional new shares, preserving existing claims. `previewRedeemFor(holder,shares)` includes that holder's earnings; a holder-less preview is a conservative principal quote. Execution enforces minimum outputs and a deadline.

`GenesisV4Router` performs exact-input ERC20 swaps with minimum outputs, deadlines and full-fill enforcement. Native currency uses its wrapped ERC20. Public and shielded composition supports either a zero-hook pool or an explicitly selected compatible creator-fee hook. Shielding protects funding/recipient linkage; public hook ownership, destinations, fee terms, token and pool activity are not hidden. Creator policies and splitter weights may remain mutable or be explicitly committed under the selected contracts.

Supported production configurations in this UI are Ethereum, Arbitrum and Polygon. The exact deployed Genesis factory and router are verified against normalized runtime fingerprints from the pinned source, and their immutable PoolManager is checked. Arbitrary lookalike contracts are rejected. Quotes and contract reads still trust the user's chosen RPC and the chain state they report.

## Deployment and private wallet setup

The required contract bytecode, browser code, compiled worker and local tests are included. To rebuild:

```sh
npm ci
npm ci --prefix integrations/console/protocol/v4-hook
npm ci --prefix packages/privacy --ignore-scripts
npm run compile:v4
npm run privacy:build
npm run build
```

Keep install scripts disabled for the privacy dependency tree. The two small browser adapters select the upstream WASM implementations and embed their original bytes; they do not replace cryptography. The optional browser worker is about 15 MB. Its source, lockfile and dependency inclusion report are supplied.

Prepare unsigned deployment transactions without sending:

```sh
ANIMA_V4_RPC='https://your-rpc' node scripts/v4-deployment.mjs \
  --chain 1 --deployer YOUR_PUBLIC_DEPLOYER_ADDRESS --output v4-deployment-plan.json
```

The plan records predicted contract addresses, nonce, bytecode, gas budgets and a maximum gas cost. It never stores the RPC URL or signing key. Only an explicitly invoked `--broadcast --plan ...` invocation uses `ANIMA_V4_DEPLOYER_KEY` and sends real transactions. Review chain, gas, signer and the complete plan first. Broadcasting is not performed by this release's build or tests.

In Advanced setup, supply the confirmed factory/router addresses, HTTPS RPC, a current RAILGUN proof service, a verified trusted broadcaster fee signer, and the fee token. Create a fresh private wallet or restore a compatible RAILGUN phrase. Save and verify its encrypted backup before funding. Starting the network session is explicit. SDK proof-of-innocence requirements and spendability checks are retained; there is no override or bypass.

A public deposit has its own disclosure, simulation and wallet signature. Once shielded balance and required proofs are ready, a private operation requires review → generate proof → submit to broadcaster. Expired fees or changed terms require a new review/proof. No live availability or funded cryptographic end-to-end success is claimed by the local checks.

The ordinary onchain HTML archive includes the app, private UI and worker integrity pin. Minted editions with a privacy-resource descriptor recover the pinned optional worker lazily from immutable home-chain shards through a read-only RPC. An explicitly configured HTTPS mirror is optional and must match the same SHA-256; failed shard recovery never silently chooses a mirror. Older editions without the descriptor need an explicitly chosen verified HTTPS mirror. Proving artifacts, RPC, proof services and peers still require external network connections. Worker recovery, wallet unlock, network synchronization and spendability remain separate states.

## Historical dependency report and remaining work

The bundled historical dependency audit reports 51 findings in the installed SDK tree: 27 low, 17 moderate, 6 high and 1 critical. The remaining high/critical packages are not inputs to the shipped browser worker according to esbuild's inclusion metadata. Twelve included packages still carry low or moderate findings, including inherited UUID and elliptic advisories. File inclusion is not proof of exploitability or non-exploitability, and this is not an independent security audit. See `reports/privacy/dependencies.json` for the exact findings and primary advisory links.

Compatible updates pin Axios, dset, js-yaml, ws, form-data and bn.js through the isolated privacy lockfile. The real SDK wallet/return-note checks pass with those updates. Major cryptographic dependency substitutions were not made to silence audit output. Review the remaining SDK and Waku dependency findings with upstream maintainers before production activation.

Before funded operation, validate the deployed contracts and full shielded swap, launch, failed-launch refund and share-redemption paths on the chosen chain with a controlled balance. The included local accounting harness exercises call grouping and refunds, but does not execute a RAILGUN proof. Also obtain an independent review of the new contracts and integration, and test supported mobile wallet/browser combinations. These are explicit outstanding production checks.

## Source verification

Primary references checked for this implementation:

- [RAILGUN cross-contract calls](https://docs.railgun.org/developer-guide/wallet/transactions/cross-contract-calls): shielded smart-contract execution and return shields.
- [RAILGUN broadcasters](https://docs.railgun.org/developer-guide/wallet/broadcasters): Waku discovery and broadcaster submission. Current installed type declarations were checked because the prose example has an older `BroadcasterTransaction.create` argument list.
- [RAILGUN engine initialization](https://docs.railgun.org/developer-guide/wallet/getting-started/5.-start-the-railgun-privacy-engine): wallet database, prover artifacts, network scans and POI setup.
- [RAILGUN prover setup](https://docs.railgun.org/developer-guide/wallet/getting-started/6.-load-a-groth16-prover-for-each-platform): snarkjs integration.
- [Uniswap v4 overview](https://developers.uniswap.org/docs/protocols/v4/overview) and [official deployments](https://developers.uniswap.org/docs/protocols/v4/deployments): pool architecture and supported deployment addresses.

This document describes the current source behavior and preserves historical dependency evidence. Creator-hook composition is supported in the public and shielded routes; selected fee ownership and recipient terms remain public. Funded public-chain verification is separate.
