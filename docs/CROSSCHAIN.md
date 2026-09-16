# Actual cross-chain asset execution

ANIMA now has an OFT source router and an authenticated destination composer. This is separate from `AuthenticatedStatePortal`, which remains an observation/proof interface. A portal observation never counts as a transferred asset.

The shipped operation bridges an existing compatible OFT asset, then transfers it to a chosen destination recipient or deposits an exact chosen portion into ANIMA's real TimeVault. The rest goes directly to the recipient. An NFT account may be the payer or beneficiary when the selected chain actually has that verified account. A wallet switch invalidates the prior NFT context. There is no assumption that identical token IDs or addresses prove the same identity on different chains.

## Protocol and trust

The integration uses the official LayerZero v2 OFT ABI and message format. `packages/crosschain/package-lock.json` pins `@layerzerolabs/oft-evm` 4.0.1, protocol and message-library packages 3.0.168, and OpenZeppelin 4.9.6. Exact minimal MIT interfaces live alongside the production Solidity. The official packages provide the protocol contracts used by the integration test; the bridge does not substitute an ANIMA attester for LayerZero.

Primary sources:

- [LayerZero OFT quickstart and composing token arrivals](https://docs.layerzero.network/v2/developers/evm/oft/quickstart)
- [LayerZero OFT patterns and extensions](https://docs.layerzero.network/v2/developers/evm/oft/oft-patterns-extensions)
- [Official LayerZero v2 protocol source](https://github.com/LayerZero-Labs/LayerZero-v2)
- [Official OFT source](https://github.com/LayerZero-Labs/devtools/tree/main/packages/oft-evm)

The asset issuer still chooses its OFT implementation, peers, messaging libraries, DVNs, executor and upgrade controls. ANIMA verifies its own source/composer runtime and immutable lane settings, checks paired OFT peers/endpoints, shows the chosen messaging-library addresses and enforces exact asset budgets. That does not certify the issuer or remove the configured transport's trust. A proxy's unchanged outer code hash cannot prove an unchanged implementation.

## Asset and execution invariants

- `AnimaOFTSource` fixes one OFT, endpoint, destination EID, destination OFT peer and composer. The source chain ID and destination chain ID are read independently; EIDs are not Ethereum chain IDs.
- The user approves the exact router spend. It pulls the exact amount, rejects nonexact transfers, gives a compatible OFT adapter an exact temporary allowance, debits through `IOFT.send`, clears the allowance and returns OFT decimal dust. The source event must agree with the actual source debit.
- Messaging fees have a reviewed native-currency cap. LayerZero refunds unused native fees to the source payer. No bridge-token refund is fabricated on the source after sending.
- The destination accepts composition only from its pinned Endpoint, for its pinned OFT, with the expected source EID, source OFT peer and source router in the official OFT compose envelope. A GUID is credited once.
- The claimed destination amount must already be backed by unallocated tokens. Existing recoverable deliveries remain covered by `liability`.
- The original recipient, destination minimum, exact lock allocation, deadline and schedule are immutable for that delivery. All original action fields remain readable onchain through `deliveryAction(guid)`.
- An action failure does not discard the received assets. It records a pending recipient-owned credit. Anyone may retry the same terms. Only the recipient may refund the credit to that recipient, on the destination chain.
- A successful lock uses the deployed TimeVault with no permanent approval. The vault fixes the beneficiary and schedule; selling an NFT beneficiary can transfer that right, but cannot accelerate the lock.
- Source deadline and destination deadline are distinct concerns. The default browser action expires after 24 hours. A delayed delivery with expired terms can be refunded after composition records the credit. The source remains debited while a message awaits real transport delivery.

These operations support conventional ERC20/OFT assets. They do not support rebasing or fee-on-transfer tokens, arbitrary destination calldata, implicit NFT ownership teleportation, or a timeout that can double-refund an in-flight bridge. Arbitrary remote account execution is not claimed by this asset-transfer interface.

## Deployment

The token issuer must first supply a configured reciprocal OFT lane. ANIMA cannot create a canonical representation of someone else's asset by choosing an address.

The Cross-chain passage desk now includes **Set up a verified lane**. Enter both chain IDs and read providers, both issuer OFTs, the deployment wallets and an optional destination TimeVault. The GUI checks chain IDs, OFT message versions, endpoint IDs, reciprocal peers and the optional vault's exact runtime/sealed ledger. It prepares the two immutable deployment plans together, then provides separate source and destination wallet reviews through the shared transaction system. Each review checks the expected wallet and nonce; an already deployed component must match its exact runtime and every planned immutable. The wallet signatures remain separate, and the resulting lane must pass **Verify both ends** before funding a passage.

The plans use ordinary deployment wallets. Subsequent funding and recipient actions may use a verified NFT account. If a nonce changes, stop and replan before deploying either component; a component already deployed with a different immutable counterpart cannot be edited in place.

The equivalent unsigned CLI workflow remains available:

1. Install reproducible protocol dependencies: `npm ci --prefix packages/crosschain --ignore-scripts`.
2. Build pinned browser deployment/verification artifacts: `node packages/crosschain/build.mjs`.
3. Create a private operator config with `sourceRPC`, `destinationRPC`, `sourceChainId`, `destinationChainId`, `sourceOFT`, `destinationOFT`, `sourceDeployer`, `destinationDeployer`, and optional `timeVault` (zero disables destination locks).
4. Run `node packages/crosschain/deployment.mjs plan config.json lane-plan.json`. The tool verifies RPC chain IDs and reciprocal issuer peers. It creates **unsigned** source and destination transactions with the predicted deployment addresses and exact constructor fields. The output omits RPC URLs.
5. Submit each reviewed transaction on its corresponding chain. If either deployer nonce changes, regenerate both plans before deploying; immutable counterpart addresses must agree.
6. Run `node packages/crosschain/deployment.mjs verify config.json lane-plan.json` after both receipts are canonical. Configure the existing OFT's production verification/executor settings through its issuer and fund the actual operation.
7. In the NFT's Cross-chain passage desk, select the source router and both read providers. Independent source and destination RPCs retain both receipts after wallet switching. Review the exact source spend, remote recipient, minimum, optional lock and fee cap.

Existing owner transaction review handles approvals, wallet/NFT funding, gas review, replacements and cancellations. `verifyCrosschainReceipt` validates the resulting operation. A verified source receipt is explicitly labeled as a source debit awaiting independent destination verification. It is never an automatic destination success.

## Recovery and evidence

`deliveryRecord` checks the source receipt against its canonical block hash, counts source confirmations, parses the exact bridge event, and reads the destination delivery at an identified block/hash. Destination recipient history is discoverable using `deliveryCount(recipient)` and `deliveryId(recipient,index)`, with `deliveryAction(guid)` restoring retry terms after browser storage is lost.

In **Your destination arrivals**, enter the destination composer and recipient address, then read its bounded, newest-first history. No source transaction hash, delivery GUID, local archive or source-chain connection is needed. Selecting a deferred arrival restores its exact recipient, minimum, amount and schedule from the verified composer. Switch to the destination wallet or verified destination NFT account and review retry/refund. History reads pin a destination block and include its hash; earlier pages use an explicit cursor. This history reader has its own provider, so opening it does not destroy the source/destination readers used by the two-chain receipt view.

CLI receipt inspection: `node packages/crosschain/deployment.mjs receipt config.json lane-plan.json SOURCE_TX_HASH`.

If source delivery is pending, inspect the configured LayerZero message path. Once tokens arrive at the destination OFT but composition is still pending, the original Endpoint compose message is permissionlessly retryable under LayerZero's authenticated queue. If ANIMA records `BridgeDeferred`, retry its unchanged action or use the recipient's destination refund. A refunded destination token can be bridged back only through a separately configured reverse lane with a separate review and fee.

`test/crosschain/bridge.integration.test.mjs` runs two independent EVM chains with the **official EndpointV2 and official OFT implementations**. Their official `SimpleMessageLib` uses one whitelisted local relayer. This is a deliberate local trust boundary: it exercises real protocol queues, token burning/minting, peer authentication, TimeVault locking, replay exclusion, deferred action retry and recipient refunds. It does not implement or verify production DVN consensus. Receipts are saved in `reports/crosschain/local-two-chain.json` with that boundary stated.

The same two-chain test verifies the GUI's paired deployment preparation and recipient history pagination, including recovery of the original deferred action. DOM tests check fresh-device recovery selection without a remembered source hash and destination switching without a source lane.

Public Ethereum/other-chain deployments, real funded public bridge receipts, production DVN/executor availability and physical-device testing are not established by the local test.
