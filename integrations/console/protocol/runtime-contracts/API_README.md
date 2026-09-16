# AWE runtime contracts · v0.1

This package implements the first EVM custody and cartridge layer: a parent NFT owns an account, the account holds executable game cartridge NFTs and ERC-1155 items, and the current parent owner controls account transactions. Creators select item prices, payment tokens and receiving addresses. There is no platform admin or mandatory platform fee.

**Implemented and locally exercised:** deployment, root mint/account creation, cartridge custody and ownership resolution, owner execution, versioned onchain manifests, optional hash-checked onchain executable bytes, transfer-epoch signature invalidation, native/ERC-20 item sales and item transfers.

**Not implemented here:** the browser sandbox, game simulation, multiplayer service, cross-chain transport, Uniswap v4 hooks, fee splitting/conversion or claim that these contracts are audited. Other project components connect through the ABIs below. No live-chain deployment has been made.

## Build and verification

```sh
npm install
npm run compile
npm test
```

The source package vendors only the required Solady 0.1.26 files and their MIT license; OpenZeppelin was not installed in the supplied workspace. Solidity 0.8.24, optimizer 200 runs, Shanghai target. The build script also detects the existing workspace compiler/test dependencies when running in this supplied workspace.

`test-results.json` records 10 passing normal-flow checks against a private, in-memory Ganache chain. The test ERC-20 is a fixture only. Ganache used its ordinary JavaScript fallback because the installed native µWS binary did not match the available Node version; this did not change the EVM assertions.

`artifacts/*.json` contains `abi`, deployable `bytecode`, runtime-bytecode template and compiler metadata. Constructors with immutable values produce deployment-specific runtime bytes. `artifacts/index.json` lists only the four production contracts.

## Deployment order

| Step | Contract | Constructor |
|---|---|---|
| 1 | `AWEArtifact` | none |
| 2 | `CartridgeRegistry` | `address artifact` from step 1 |
| 3 | `CreatorItems` | none |

Do not manually deploy `ArtifactAccount` for ordinary use. `AWEArtifact.mint` creates and records one for each parent NFT. Its public constructor accepts `(address artifact,uint256 id)` for reproducibility, but only accounts recorded by the canonical `AWEArtifact` qualify for nested-cartridge ownership resolution.

## Parent NFT and its account

```solidity
AWEArtifact.mint(address to, string metadataURI)
    returns (uint256 id, address account);
AWEArtifact.accountFor(uint256 id) returns (address);
AWEArtifact.artifactIdOfAccount(address account) returns (uint256);
AWEArtifact.ownershipEpoch(uint256 id) returns (uint256);
AWEArtifact.setTokenURI(uint256 id, string metadataURI);
AWEArtifact.bumpOwnershipEpoch(uint256 id);

ArtifactAccount.owner() returns (address);
ArtifactAccount.ownershipEpoch() returns (uint256);
ArtifactAccount.execute(address target, uint256 value, bytes data)
    payable returns (bytes result);
ArtifactAccount.signatureDigest(bytes32 hash) returns (bytes32);
ArtifactAccount.isValidSignature(bytes32 hash, bytes signature)
    returns (bytes4);
```

Minting is permissionless and has no contract mint fee; callers pay chain gas. Standard ERC-721 transfers and approvals are inherited. Metadata edits are current-token-owner-only. ERC-4906 metadata update signaling is supported.

The account receives native currency, ERC-721s and ERC-1155s; ordinary ERC-20 transfers also work. Execution uses `CALL`, runs only when `msg.sender` is the current parent NFT owner, and bubbles target reverts. No delegatecall, modules, persistent session keys, arbitrary platform executor or account upgrade path exists here.

The parent collection rejects transfer into any account it created, preventing root-to-root ownership cycles within this collection. It can still hold cartridge NFTs and external NFTs. This first package deliberately does not resolve arbitrary recursive external ownership trees.

**External approvals are separate state.** ERC-20 allowances and NFT operator approvals that an owner creates through `execute` may survive sale of the parent. Epoch changes invalidate this account's domain-bound signatures; they do not revoke approvals inside other token contracts. A future asset-transfer flow must inventory/revoke approvals or move assets to fresh custody. This package must not be presented as having a sealed account sale guarantee.

## Executable cartridges

```solidity
CartridgeRegistry.mint(address to, string manifestJSON, bytes32 contentHash)
    returns (uint256 id);
CartridgeRegistry.updateManifest(uint256 id, string manifestJSON, bytes32 contentHash);
CartridgeRegistry.freezeManifest(uint256 id);
CartridgeRegistry.publishContent(uint256 id, bytes content);
CartridgeRegistry.contentOf(uint256 id) returns (bytes);
CartridgeRegistry.manifestOf(uint256 id) returns (Cartridge);
CartridgeRegistry.launchManifest(uint256 id, address player) returns (LaunchManifest);
CartridgeRegistry.canLaunch(uint256 id, address player) returns (bool);
```

`Cartridge = (string manifestJSON, bytes32 contentHash, uint64 revision, bool frozen)`.

`LaunchManifest` fields, in ABI order:

| Field | Meaning |
|---|---|
| `manifestJSON` | Exact JSON bytes stored onchain |
| `contentHash` | SHA-256 of the exact executable/bundle bytes |
| `manifestHash` | Keccak-256 of exact manifest JSON bytes |
| `revision` | Starts at 1, increments on manifest update |
| `frozen` | Owner has permanently frozen the manifest and executable commitment |
| `holder` | Address returned by the cartridge's `ownerOf` |
| `controller` | Direct holder or current owner of a registered parent NFT |
| `parentArtifactId` | Parent token ID, or zero for direct wallet ownership |
| `parentOwnershipEpoch` | Parent's current epoch, or zero for direct ownership |
| `authorized` | Nonzero `player` equals the resolved controller |
| `onchainContentAvailable` | Matching executable bytes have been published in this registry |

`tokenURI` is a base64 JSON data URI generated from the stored manifest. The publisher supplies valid JSON; the contract preserves creator fields without parsing them. Authoring clients must perform JSON/schema validation. Put ordinary NFT metadata fields and runtime descriptors in the same object, for example:

```json
{
  "name": "My First World",
  "description": "A creator-owned mini game",
  "schema": "awe.cartridge/1",
  "runtime": "html",
  "entry": "contract:contentOf",
  "content": { "algorithm": "sha256", "sha256": "0x..." },
  "capabilities": ["input.keyboard"],
  "multiplayer": { "mode": "local" }
}
```

The optional direct-storage publisher supports a complete executable up to 24,576 bytes, subject to chain transaction gas limits. It accepts only bytes whose SHA-256 matches the committed hash. For larger games, the same manifest can point to a content-addressed bundle; that does **not** make the bundle itself fully onchain. A future chunked storage adapter can preserve the manifest contract.

If an update changes the content hash, previously published content is cleared. Freezing locks the manifest and hash permanently. Matching content can still be published after freezing, since doing so cannot replace the committed game bytes.

When a cartridge is in the parent account, updates and publication are transactions through `ArtifactAccount.execute` with the registry call encoded as `data`. Registry NFT approvals permit transfers, not metadata editing.

`launchManifest` is a current-chain ownership query, not an offline cryptographic attestation or DRM. Public executable bytes remain public. A multiplayer service should verify a fresh wallet-signed, domain-bound challenge and re-read the relevant chain state at the chosen finality before allowing ownership-gated actions. The account exposes ERC-1271 validation for smart-account controllers; its `signatureDigest` must be signed as a raw digest, and incorporates account address, chain and ownership epoch. Challenges must themselves contain expiry and nonce; the view call cannot consume them. This is a custom NFT-owned account, **not full ERC-6551**.

## Creator item editions

```solidity
CreatorItems.createItem(
    string metadataURI, address paymentToken, uint256 unitPrice,
    address receiver, uint256 maxSupply
) returns (uint256 id);

CreatorItems.item(uint256 id) returns (Item);
CreatorItems.configureSale(
    uint256 id, address paymentToken, uint256 unitPrice,
    address receiver, bool active
);
CreatorItems.mintItem(
    uint256 id, address to, uint256 amount, address expectedPaymentToken,
    uint64 expectedRevision, uint256 maxTotalPrice
) payable;

CreatorItems.setMetadataURI(uint256 id, string metadataURI);
CreatorItems.freezeMetadata(uint256 id);
CreatorItems.transferCreator(uint256 id, address nextCreator);
```

`Item` fields in ABI order: `creator`, `paymentToken`, `receiver`, `unitPrice`, `maxSupply`, `minted`, `saleRevision`, `saleActive`, `metadataFrozen`, `metadataURI`.

- `paymentToken == address(0)` means the chain's native currency. Other values select a compatible ERC-20 contract. Prices are integer base units, not human decimal strings.
- A creator chooses any nonzero receiving address, including their parent account or a separate split/distribution contract. This package neither invents nor imposes the recipient's distribution rules.
- `maxSupply == 0` means unlimited. A nonzero edition cap is fixed when created. All issuance goes through the published sale path; creators can configure zero-priced issuance if desired.
- Native purchases send exactly `unitPrice × amount` as `msg.value`. ERC-20 purchases approve this `CreatorItems` address for that amount and send zero native value.
- Receipts route directly to the configured receiver, atomically with minting. There is no retained platform fee. ERC-20 balance changes must match the expected receipt (or zero for self-payment), so transfer-tax and incompatible rebasing behavior is not silently accepted.
- A buyer pins the quoted payment token, sale revision and maximum total. Changes to price, receiver, token or active state increment the revision and require a new reviewed quote.
- Creator authority can be transferred to any chosen nonzero address, including a parent account. Selling item copies does not transfer creator authority.

Royalty enforcement, item authenticity across unrelated games, arbitrary token conversion, creator splits and backend award permissions are separate adapters. An ERC-1155 item can be held/transferred onchain, but a game must explicitly define what that item does. Tokenization does not automatically make every old game's assets interoperable.

## Minimal browser sequence

1. Connect an EVM wallet and show its actual chain.
2. Load the production artifacts and deploy only after an explicit wallet transaction confirmation.
3. Mint a parent NFT; use the `ArtifactCreated` event to read its ID/account.
4. Mint a cartridge to that account with validated JSON and the executable SHA-256.
5. Optionally publish the exact executable bytes through the account.
6. Before launch, read `launchManifest(id,connectedWallet)`, verify the returned hash against the bytes, then load them in the host's isolated runtime.
7. Create item editions, retrieve the exact current sale quote and build transactions with the buyer's chosen recipient and expected terms.

Contract ownership does not make an embedded game trusted. The browser host must isolate executable content and mediate wallet requests through explicit host permissions. Multiplayer authority and game-result settlement are intentionally separate from this ownership/custody layer.
