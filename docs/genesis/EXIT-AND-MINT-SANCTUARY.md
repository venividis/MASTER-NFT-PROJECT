# Anima Genesis — remembered exits and mint sanctuary

This release keeps the original blue object, original workflows and Atlas. The existing formation coordinator draws public controls and words. Mint-wallet and private-execution surfaces are excluded from particle rasterization so private labels, addresses, reviews and passwords do not become cached canvas text.

## What can be used

| Path | Implemented behavior | Execution boundary |
| --- | --- | --- |
| Trade → Lock → Sell as the lock matures | One sale at maturity, equal installments, or custom date/percentage/minimum rows | Local rehearsal; the optional journal entry, initial swap and dedicated funding are atomic in this model |
| Atlas → Vesting exits | Inspect escrow, pause/cancel, run eligible slices, recover matured cancelled/expired tokens, export and trace decisions | Local rehearsal; advancing its clock never executes a sale |
| Atlas → Onchain vesting exits | Configure an actual VestedExitVault, fund through the NFT account’s exact-allowance utility call, inspect and operate plans | Explicit external-wallet review; requires deployed compatible contracts and an owned bound-mode NFT account |
| Exit executor | Discover eligible installments and submit their fixed contract calls under a separate keeper gas budget | Supplied operator CLI; no service is automatically provisioned, funded or running |
| Atlas → Mint sanctuary | Independent encrypted EOA per direct collection project; restricted minting, receipt inspection, exact rebroadcast and recovery | Real keys and real transactions when explicitly signed; Ethereum, Sepolia and local Ethereum development chains |

No public blockchain deployment or user-fund transaction was performed while building this release. The local fixture addresses in reports do not identify deployed public contracts.

## The combinations selected

1. **Decision → commitment → outcome → reflection.** A journaled swap funds a schedule whose successful installments link to both the funding receipt and original journal binding. Automatic fills never impersonate a new human-authored note. The original journal links to the schedule; the schedule links back to the decision and receipts.
2. **Escrow → ownership manifest.** Rehearsal exit principal is excluded from free balances and included in operating sale commitments. A custody epoch change retires sale authority. Reauthorization pauses the plan; resumption requires another instruction. Solidity exposes `accountCommitment`, and the new deployment fixture includes it in a newly configured immutable CommitmentIndex/EstateExchange. Existing deployed immutable indexes are not retroactively updated.
3. **Mint → observe → isolate → recover.** The mint receipt identifies supported ERC-721/1155 transfers from the pinned collection. Contract-reported ownership is inspected without loading unknown media. Moving a token or recovering native funds requires another exact review. Recovery is never automatically promoted into the master NFT.

Principal distributions and new proceeds locks were intentionally kept as separate decisions. Existing fee-recipient settings do not authorize sending principal to those recipients.

## Vesting semantics

- An existing TimeVault lock retains its original beneficiary and dates. A sell schedule uses a separate funded vault; it is not a hidden permission over free balances or a mutation of an old lock.
- Local percentages sum to exactly 10,000 basis points. Each nonfinal input slice floors its share; the final slice receives the remainder. Zero-sized slices are refused. Minimum outputs are separately specified positive quantities in the destination asset.
- Each installment has a due date, exclusive expiry, fixed input amount, fixed minimum output and a fixed artifact-account proceeds recipient.
- Before due: no sale or recovery. During the authorized window: an actual execution may sell. After cancellation: sale cannot resume, and recovery still waits for maturity. After expiry: no sale; matured principal can be returned.
- Failed minimums, partial input consumption, unexpected output locks, inconsistent market return values and custody changes revert the whole installment. Exact ERC20 allowance is reset in the same transaction. The caller cannot change the asset pair, amount, route adapter, minimum or recipient.
- The contract accepts only the canonical NFT account when funding, checks bound mode and custody after funding callbacks, and checks owner/epoch/mode before and after sale callbacks and delivery. Transfer away and back still changes the epoch.
- Before trusting collection or market getters, the live desk matches the deployed vault runtime against the compiled release template, normalizing only compiler-declared immutable slots. It then binds the collection and market-code hash. A lookalike contract exposing the same getter names is rejected.
- The live composer accepts ordinary decimal token amounts and reads each asset’s decimals from the connected chain. It preserves the original integer amount bounds, distinct dates, minimums and vesting invariants. Deployment addresses and public memory digests are advanced settings.
- The live desk supports the included NativeMarket quote preview and the included V4GenesisMarket’s seeded-route check. It does not invent a v4 price quote. A current quote is not a future guarantee.
- The live journal, original swap and exit funding are separate reviewed transactions. A public memory digest can be included as the schedule’s decision commitment; private note text is not sent to the contract.

## Minting-wallet protection

Each project uses cryptographically random EOA key material created independently of the original NFT seed or primary wallet. Ethers encrypts it into a version-3 JSON keystore. Creation decrypts the result and verifies the derived address before persistence. The password must have at least 16 characters. Imported files have bounded scrypt parameters before decryption. The new key signs an internal, domain-separated policy statement covering its project, chain, target, recovery address, original budget and code pin; altered backup policies are refused. This internal policy signature is not a website signing interface.

New wallets and successfully migrated legacy wallets persist an opaque wallet ID plus one authenticated AES-256-GCM envelope containing the entire signed policy, inner Ethers keystore, project and recovery addresses, RPC, budget, pending signed transaction and history. PBKDF2-SHA256 uses 600,000 iterations, a fresh 256-bit salt at creation, and a fresh 96-bit IV on each save. Locked lists reveal only opaque IDs and whether legacy migration is needed. Legacy plaintext metadata is not magically erased before its password is provided: successful unlock migrates that record in place, while legacy backup import verifies and encrypts it before storing. Other still-locked legacy records remain recoverable and display the migration notice.

Default exports use `anima.encrypted-mint-wallet/2`; both version-1 and version-2 backups remain importable after password and policy-signature verification. An unlocked user can explicitly export the encrypted inner Ethers key through Advanced recovery for another wallet. That exceptional key file includes the public address and does not carry the application’s spending policy.

Private signer objects remain in private session fields; no main NFT archive, journal, console or global application API receives them. Locking cancels in-flight unlock/preparation and prevents a pending signature from being broadcast when cancellation wins the race. Session references are discarded after two minutes or when the page is hidden, and rendered addresses, project details, balances, history and inspection results are replaced immediately. Late network inspection results are rejected after lock. JavaScript does not guarantee physical memory zeroization; a compromised browser remains outside this boundary.

The restricted direct mint grammar is:

- `mint()`
- `mint(uint256)`
- `mint(address,uint256)`
- `publicMint(uint256)`
- `safeMint(address)`

Recipient arguments are constructed from the burner address. The desk does not expose arbitrary calldata, transaction batches, permits, operator approvals, message signing, deployment, or EIP-7702 authorization requests. Allowlist proofs, mint routers delivering a different collection and other signatures require a new reviewed adapter; unsupported calls are refused.

The desk compares the HTTPS project origin the user enters with its immutable pinned origin. It does not monitor MetaMask or other browser tabs. A matching domain is not an anti-phishing certificate. The mint target’s code, ERC-1967 implementation/admin/beacon slots and detected implementation code are pinned and checked again before signing. Other proxy patterns and adversarial storage behavior are not exhaustively discovered.

Transaction reviews bind chain, sender, destination, data, value, nonce, gas limits, fee caps, expiry, policy state and code pin. Execution checks these again. Ethereum execution gas is budgeted as value plus maximum gas cost; unsupported L2 data-fee models are refused. Recovery gas contributes to the spending history, but budget exhaustion does not prevent an explicit recovery. The creation form requires a regular EOA recovery recipient without contract/delegated code.

A signed transaction is reserved before broadcasting. Timeout does not release its budget or enable another nonce. The exact signed bytes can be rebroadcast; their signature, sender, chain, nonce, target, value and data must match the reserved record. If a contract changes while a mint is pending, rebroadcast is refused. Cancelling or replacing that nonce through an external wallet may be necessary; the encrypted backup provides recovery. No stale timeout is treated as proof of failure.

A receipt needs two confirmations before its reservation is settled. Supported transfer logs are observations, followed by contract-reported ownership checks. Unknown metadata, SVG, HTML, animation URLs and links are not fetched or opened. Token-specific approval reads do not exhaustively discover operator approvals. Unexpected airdrops outside the pinned direct-mint collection are not automatically enumerated. The regular recovery address can receive an explicitly reviewed NFT transfer; this is not a claim that the token is safe to interact with elsewhere.

## Residual limits

The EOA spending cap is enforced by this application. Exported keys, old restored budget state, other signing applications or compromised browser code can bypass it. A small independently funded wallet is the real containment boundary. Funding transactions can publicly link a burner to its funding wallet. A successful simulation does not guarantee execution, a mint, contract honesty or future token behavior. This release is development software, not an independent security audit.

## Primary references reviewed

- [Ethers wallet and encrypted keystore APIs](https://docs.ethers.org/v6/api/wallet/)
- [Ethereum eth_call](https://ethereum.github.io/execution-apis/api/methods/eth_call/) — simulation is an RPC observation
- [ERC-1967](https://eips.ethereum.org/EIPS/eip-1967) — known proxy slots
- [ERC-721](https://eips.ethereum.org/EIPS/eip-721), [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155) — transfer/ownership interfaces
- [ERC-2612](https://eips.ethereum.org/EIPS/eip-2612), [ERC-4494](https://eips.ethereum.org/EIPS/eip-4494) — offchain approvals excluded from this signer
- [WalletConnect Verify](https://docs.walletconnect.network/wallet-sdk/web/verify) — origin validation is not a safety certificate; WalletConnect sessions are not implemented here
- [MetaMask NFT airdrop guidance](https://support.metamask.io/stay-safe/protect-yourself/nfts/nft-airdrop-scams/)
- [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) — cross-tab serialization
- [Uniswap swap concepts](https://developers.uniswap.org/docs/get-started/concepts/traders/swaps) — minimum output and deadline boundaries
- [OpenZeppelin vesting](https://docs.openzeppelin.com/contracts/5.x/api/finance) — release schedules do not themselves execute trades
- [ERC-6551 fraud considerations](https://eips.ethereum.org/EIPS/eip-6551#fraud-prevention) — review account obligations across ownership changes
