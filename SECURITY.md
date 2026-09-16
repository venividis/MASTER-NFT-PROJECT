# Security boundaries · 6.2

This is a development release. Local EVM tests and artifact checks validate specific invariants; they are not a production audit. No public deployment or funded shielded end-to-end transaction is established by this cleanup.

## Custody and authority

The current owner controls a Bound NFT account. New editions use exact-calldata instrument grants with a selected-asset net-debit budget, expiry, bounded call count and custody epoch. Legacy selector sessions explicitly revert. Operator scheduling and sponsorship use the same account permission. This is not a certificate covering every asset, proxy implementation or external liability. Custody-changing callbacks invalidate and roll back delegated execution. See [owner authority and recovery](docs/OWNER-AUTHORITY-AND-RECOVERY.md).

Sovereign promotion is irreversible. The supported route requires recognized non-proxy ProofRouter and ThresholdAttestationVerifier code, with routing and signer configuration frozen. This is fixed attester trust, not a zero-knowledge proof of arbitrary EVM execution. Merely returning `frozen() = true` is insufficient. Other proof adapters remain research and cannot qualify for promotion.

Former owners may append their own reflection branches; only current authority advances canonical memory. Room invitations and moderator consent bind the relevant custody epochs. Recipient transfer requires renewed consent.

## Privacy and recovery

Public inscriptions, room posts and chain transactions are observable. Encryption does not hide public timing, membership, routing or transaction metadata. The new Commons transport uses RFC 9420 MLS and erases consumed message state; the selected implementation has no formal security audit. Legacy ECDH group encryption does not provide forward secrecy. Retained transcripts, old backups and compromise timing affect protection. See [communication guarantees](docs/FORWARD-SECURE-COMMONS.md). Personal keys do not follow NFT transfers automatically.

Mint sanctuary encrypts whole records, including policy and recovery state, and retains an opaque locked index. Legacy plaintext records migrate only after successful unlock. Retain verified encrypted backups before clearing browser storage. Lock clears application secrets and visible project metadata; it cannot erase copies already obtained from an unlocked browser, prior backup or compromised device.

Private submission records a fingerprint and status for reconciliation. Ambiguous outcomes must not be resent blindly. RPC, prover, broadcaster and operator availability remain external dependencies. Runtime code pins check contract identity, not service availability or every economic assumption.

## Implemented boundaries and remaining research

- ExperimentCell snapshots retain unreadable assets as unresolved. Owner-approved quarantine permits unrelated operations while preserving visibility; controller recovery back to the NFT remains available.
- Original NFT custody shares freeze an unused Bound account. Separate operating governance adds voting, budgets, delays and funded exits; it monitors selected fungible assets and explicit obligation commitments rather than inferring all external liabilities.
- The NativeMarket Groth16 proof uses a development trusted setup and proves bounded arithmetic plus checked context, not complete execution or state authenticity.
- The Rust kernel binds policy and calldata preimages but remains a research evaluator without authenticated state witnesses or a production zkVM guest.
- Public and shielded v4 launch composition supports selected creator-fee hooks, output recovery and explicit recipient terms. Hooks and recipient policies are publicly observable. Funded public-chain shielded proving still requires configured external services.

Changed immutable account and module code requires a new compatible deployment. Existing contracts do not acquire fixes by replacing a website or source ZIP. Review chain-specific constructor arguments, verifier trust and asset behavior before deployment.

- Cross-chain source inclusion is not destination completion. Immutable lane checks authenticate the configured OFT/Endpoint path; public DVNs and executors remain external dependencies.
- Official CCA and Doppler retain their own economics and trust boundaries. Scenario execution and local tests do not establish public deployment or predict prices.
- Optional fee commitments are irreversible; ordinary mutable fee configuration remains separately available. Automated compounding and scheduled exits require prepaid rewards and an executing caller.
