# Agent operations, service purchases and provider discovery

These are implemented extensions for section 17 F03, F11 and F12. Local integration tests deploy and execute the actual contracts, the original `SovereignAccount`, and a development ERC20. No public-chain deployment or external purchase was made by this implementation task.

## What the NFT owner can do

| Function | Like you are five | What actually enforces it |
| --- | --- | --- |
| Approve a repeating task | Give your helper permission to press one particular button. | `SovereignAccount.createSession` chooses the guard, target and selector. |
| Set the helper's exact instructions | Tell the helper exactly what to do, how often, how many times, and how much coin it may use. | `AgentPolicyGuard.grant` fixes calldata hash, worker, target runtime code hash, native value, total native budget, call count and interval. |
| Run a continuous helper | The helper checks whether it is time and performs the approved task. | `BoundedOperator.run` polls the configured chain; `run` checks the current nonce and grants again in the mined transaction. |
| Stop the helper | Remove its permission to press the button. | Revoke the session or the guard grant. Stopping a host process alone does not revoke its onchain authority. |
| Buy work with a judge | Put tokens in a box until the chosen judge accepts the worker's finished work. | `AgentCommerce` implements the ERC-8183 draft's Open, Funded, Submitted, Completed, Rejected and Expired states. |
| Return money after timeout | If work is still unsettled when the clock runs out, send the tokens back. | Permissionless `claimRefund`; fixed client recipient. |
| Buy one paid web answer | Agree to one service's price, sign its exact token payment, then check the receipt. | Official x402 SDK, pinned scope, durable budget reservation, and independent configured-chain receipt verification. |
| Publish a provider card | Sign a card saying which wallet offers a service. | EIP-712/1271 signature, chain and registry domain, update nonce and expiry. |
| Find providers | Look through registered cards and check their exact file hashes. | Paged onchain directory reads; optional caller-configured metadata transport. |
| Review paid work | The customer can leave one attributable review for a settled paid job. | Client-only job-linked feedback and revocation. Ratings are filtered to reviewers chosen by the reader. |

## F03: owner-authorized continuous operation

Deploy `AgentPolicyGuard`. The current NFT owner first calls `createSession` on their account with the guard as session key and the intended target, selector, maximum value, time window and call count. Next, the owner calls `grant` on the guard with that account, the worker wallet, exact target and calldata, value per call, total native coin budget, start/end time, call limit and minimum interval. Both permissions are required. ERC20 movement, if embedded in the approved calldata, is fixed by that calldata and bounded by the call count; `budget` is explicitly a native-coin budget.

`run(id, expectedNonce, data)` is callable only by the assigned worker. Before and after its account session call, the guard checks current NFT owner, session epoch, Bound mode and nonce. Transfer invalidates outstanding grants. Revoking the native account session also blocks the guard. Target runtime bytecode is pinned; that pin does not certify a proxy's implementation or the safety of its behavior. An operator never receives blanket owner authority.

The Node operator supports a deterministic scheduler and an optional proposal endpoint chosen in the local configuration. The proposal endpoint receives public state and may propose `{grantId, expectedNonce, data}`. Different calldata, nonce or grant is rejected. It receives no signing key and cannot select an RPC or transaction target. Onchain `ActionExecuted` receipts form an account audit hash chain. The standalone runner also writes an integrity-checked local receipt journal.

The worker pays transaction gas from its own wallet. Per-action gas and gas-price caps are checked before submission (`maxGasPerAction`, default 1,000,000 gas; `maxGasPriceWei`, default 100,000,000,000 wei). A failed authorization or execution check stops the loop instead of repeatedly consuming gas.

```sh
node agent/extensions/run-operator.mjs operator-config.json
node agent/extensions/run-operator.mjs operator-config.json --execute
```

Without `--execute`, this runner simulates. A continuously running OS process remains necessary; an NFT contract cannot wake itself up. This implementation handles owner-issued Bound-mode sessions. It does not assert that an LLM is a proof verifier, does not autonomously promote the NFT, and does not implement an unrestricted Sovereign-mode proof-generation service.

Example operator configuration (replace every placeholder with the reviewed local deployment):

```json
{
  "rpcUrl": "http://127.0.0.1:8545",
  "chainId": 31337,
  "guard": "DEPLOYED_AGENT_POLICY_GUARD_ADDRESS",
  "grantId": "1",
  "data": "EXACT_REVIEWED_HEX_CALLDATA",
  "signerFile": "worker.key",
  "receiptFile": "operator-receipts.jsonl",
  "intervalMs": 5000
}
```

The signer file must have mode `0600`. Do not commit key, token or ledger files. Never reuse the unrestricted NFT owner key as a convenience for a session worker.

## F11: two separate service-payment paths

### ERC-8183 draft jobs

`AgentCommerce` is a new minimal, non-hooked kernel using one immutable standard ERC20 token. It is not a relabeling of the older `CommissionEscrow`. The flow is:

1. Client creates the job with provider, evaluator, deadline and description. Provider can be zero initially.
2. Client selects a missing provider. Client or provider sets an Open job's proposed budget.
3. Client funds with the exact expected budget. A changed price causes a revert.
4. Provider submits the deliverable hash.
5. Evaluator accepts and pays, or rejects and refunds. Client cannot unilaterally pull back a submitted job unless it is also the chosen evaluator.
6. Anyone can trigger a full refund after expiry while Funded or Submitted.

Use the account's `executeUtility` for funding: exact token approval → encoded `fund` call → reset allowance, atomically. Native currency, transfer-tax/rebasing tokens, hooks, fees, gasless forwarding and upgrades are not enabled in this kernel. Provider and evaluator roles are fixed addresses, so a funding NFT transfer does not secretly reassign their keys. The evaluator is explicitly trusted; hashes alone do not prove quality or authorship. The adapter follows the published draft's core lifecycle; it is not a certification against every optional or future revision of ERC-8183.

### x402 HTTP service purchases

`agent/extensions/x402.mjs` uses the official `@x402/evm` **2.25.0** SDK, with a separate local package lock. Supported scope is x402 **v2 HTTP**, **exact**, **EVM EIP-3009 TransferWithAuthorization**, one known chain and token domain, a known payee, and a configured exact URL. The adapter rejects Permit2, other schemes, unknown domains, unexpected extensions, redirects, changed resource URLs and prices over the reviewed maximum. There is no blanket token allowance or facilitator spender approval in this supported payment scheme; the signature authorizes the exact recipient and amount.

The flow is a real HTTP `402` challenge, SDK payment authorization in `PAYMENT-SIGNATURE`, and a `PAYMENT-RESPONSE`. Receipt verification reads the configured chain and requires successful settlement, sufficient confirmations, a matching token `Transfer`, and the exact payer's `AuthorizationUsed` nonce event. Service delivery remains the service's promise; a settled payment is not a quality guarantee or escrow refund mechanism.

The payment signer is a **separate funded EOA service wallet**, not an impersonated NFT account. The selected EIP-3009 token must actually support these authorizations. No NFT-session signature is silently substituted for an owner signature. Budget and purchase-count reservations are written before signing, and replayed purchase IDs are blocked across restarts. A timeout or forged/missing receipt does **not** automatically release the reserved budget because the authorization may still settle. Inspect the ledger and chain before consciously issuing another purchase. No private keys or payment signatures are written to the payment ledger.

```sh
npm ci --prefix agent/extensions --ignore-scripts
node agent/extensions/start-host.mjs agent-host-config.json --execute
```

Host example (all addresses and scopes must be deliberately filled before use):

```json
{
  "rpcUrl": "http://127.0.0.1:8545",
  "chainId": 31337,
  "port": 8793,
  "accessTokenFile": "host-access-token.txt",
  "allowedOrigins": ["http://127.0.0.1:4173"],
  "payment": {
    "signerFile": "service-wallet.key",
    "ledgerFile": "service-payments.json",
    "budget": "1000000",
    "maxPurchases": 10,
    "confirmations": 1,
    "services": [{
      "label": "One map",
      "url": "http://127.0.0.1:8794/map",
      "network": "eip155:31337",
      "asset": "REVIEWED_EIP3009_TOKEN_ADDRESS",
      "payTo": "REVIEWED_SERVICE_RECEIVER_ADDRESS",
      "name": "LocalUSD",
      "version": "1",
      "maxAmount": "100000",
      "maxTimeoutSeconds": 120
    }]
  }
}
```

The host binds loopback, uses a bearer token read from a `0600` file and allows only configured browser origins. It has a separate review step showing the payment wallet, exact recipient, token, network and maximum price. Review IDs expire after 60 seconds and are single-use. The host request cannot override the configured URL or recipient. `mountAgentsDesk` supplies inspect, operator start/stop, review and purchase controls; the bearer token stays in page memory. The browser rejects remote plaintext HTTP, credential-bearing URLs, query strings, fragments and non-root paths before calling fetch. Remote hosts require HTTPS; local development accepts exact loopback origins. Requests forbid redirects, omit cookies and suppress referrers. Closing the desk aborts pending requests and clears its token, output and purchase review; changing the host, token or selected service invalidates the prior purchase review. A deployed HTTPS viewer may require an appropriate local host connection setup before a browser allows a loopback connection.

## F12: directory and reputation

`ProviderDirectory` is an **ANIMA-native signed directory**, not an ERC-8004 identity or reputation registry. Anyone can relay a provider's signed card update, but the signature is bound to its wallet, exact metadata bytes, URI hash, capabilities, nonce, expiry, chain and contract. There is no privileged provider allowlist. Discovery paginates at most 100 records, omits expired/inactive cards and verifies metadata hashes when metadata retrieval is explicitly configured.

The Agents desk now includes the directory browser itself: previous/next pages, a filter for the current page, inactive-card visibility, and a comparison table for up to eight providers. Each row shows the signing wallet and snapshot block. Select a provider to inspect its signed hash and URI; paste or upload its metadata file, or decode its embedded onchain JSON, to verify and display the complete service card and endpoints. These operations do not contact provider endpoints. Selected-chain or registry changes clear cached comparisons.

The same desk reads actual paid-job feedback over a bounded block range. Individual records show the reviewer, score, evidence, transaction, client, evaluator, budget and terminal job result. Choose trusted reviewer wallets to calculate an average; withdrawn reviews stay visible with their status and do not count. The browser verifies that the chosen commerce contract is the directory's immutable job source and that feedback matches a funded terminal job.

Publishing a provider card has a practical browser workflow: fill its exact JSON, capability name, URI and expiry; optionally encode the JSON directly into its URI; prepare the signing review; check consent; sign with the connected provider wallet; then review the publication transaction. Wallet, chain, registry, nonce, expiry and exact metadata are checked again before publication. Editing the card invalidates the signing review. The generic relay action remains available for externally prepared signatures.

`providers.mjs` also offers `inspectERC8004` for a chosen external identity registry and chain. It reads actual owner, URI and agent-wallet fields; it does not treat a string in an ANIMA card as verified external identity or automatic permission to purchase a service. Endpoint ownership remains unverified unless separately checked.

Feedback is one record per actual funded, terminal `AgentCommerce` job and only the paying client may leave it. Self-wallet reviews are excluded; different wallets can still collude. Readers choose trusted reviewer addresses before an average is calculated. Reviewer count, individual evidence hashes, job IDs and transaction hashes remain visible. Revoked reviews disappear from current calculations but stay in chain history. This is attributable reputation with explicit trust limits, not proof of unique humanity, honest work or Sybil resistance.

## Verification and source boundaries

```sh
node --test test/extensions/agents.contracts.test.mjs test/extensions/agents.host.test.mjs test/extensions/agents.directory.test.mjs
```

The contract integration file compiles the extension contracts and the actual `SovereignAccount` with `solc`, deploys them to a local Ganache chain, and covers:

- Operator execution, wrong calldata, stale nonce, minimum interval, budget exhaustion, native-session revocation and NFT transfer invalidation.
- Job budget mismatch, unset provider, role impersonation, accepted/rejected deliveries, expiry refunds and terminal replay.
- Provider signature impersonation/replay, metadata tampering, paid-client feedback checks and review revocation.
- Official x402 SDK authorization with real local token settlement, token nonce replay, price cap, durable budget exhaustion, wrong URL, revoked authority and a forged settlement transaction.
- Host authentication, origin pinning, review scope and one-use purchase approval.
- Browser directory pagination, filtering, comparison, full metadata verification, paid-feedback source checks, registration signing scope and explicit consent. The browser signing helper is also tested against the actual deployed directory contract.

Public deployment, funding a service wallet, running an external provider and paying any real provider remain explicit operational steps. Current public production interoperability has not been exercised by these local tests.

Primary references checked on 2026-09-12:

- [ERC-8183 draft: Agentic Commerce](https://eips.ethereum.org/EIPS/eip-8183) — lifecycle and optional extensions.
- [ERC-8004 draft: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004) — external identity and reputation distinctions.
- [Official x402 buyer guide](https://docs.x402.org/getting-started/quickstart-for-buyers) — SDK integration.
- [Official x402 v2 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md) — HTTP payment structures and exact payment flow.
