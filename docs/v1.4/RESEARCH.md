# The Interior — standards research and synthesis
## i dont fucking believe it! / 1.4.0 / reviewed 5 September 2026

**Evidence boundary:** the 1.4 browser experience is an unsigned local rehearsal. New Solidity source is written but has not compiled or executed in an EVM here. This report separates (1) the supplied project's documented behavior, (2) external primary-source research, and (3) our design decisions. A protocol specification is not a production certification; researching an interface is not implementing it.

## 1. The question is not “how many standards fit inside one contract?”

The user's image of a crystalline phoenix carrying them into a kingdom supplies a design brief: an object should reveal an unexpected interior with relationships, inhabitants, possessions, rules, and a future. This is an artistic interpretation, not a claim about the origin or physical nature of that experience. The new application uses computed crystal facets, a moving camera, a floating architectural composition, and state-dependent light. It is not an image-generation output, a photograph, or an assertion of physically accurate glass optics.

The supplied 1.2 project already distinguishes persistent identity from viewpoint. Fold Space and camera motion change what the viewer sees, not the token's authoritative state. History is read-only. Seal Memory retains a salted digest and discards the thought and salt. Its custom deterministic account is not the canonical ERC-6551 registry/proxy construction. Its full browser application was not stored onchain. Those facts are preserved rather than quietly rewritten into stronger claims. See `docs/legacy-1.2/START-HERE.md`, the original `reports/VALIDATION.md`, and `docs/RESEARCH-1.2.md`; the original user-supplied research remains the authority for that release.

The useful synthesis is a **living estate**. One NFT is the enduring addressable object. Its account holds ordinary assets. Its vault claims describe contractual time. Its rooms organize conversation. Every receipt distinguishes the artifact, the acting address, and the custodian at the time. A sale can then specify exactly which declared contents and rights the buyer expects, rather than hiding behind a thumbnail.

The research below covers the main relevant families and several adjacent ecosystems. It is not an exhaustive census of every proposal, abandoned draft, bridge implementation, or proprietary NFT API ever published. Standard status was checked on the linked primary pages; status is only explicitly stated below where it was material to a decision.

## 2. iNFT is a family of ideas, not a single magic capability

Three different questions must be answered separately: how an agent is described, who owns or may use its private data, and what authorizes its transactions.

[ERC-7857](https://eips.ethereum.org/EIPS/eip-7857), currently Final, addresses verifiable ownership and transfer of private agent metadata. It separates an onchain verifier from an offchain prover and includes transfer, cloning, and authorized usage. Its compatibility section explicitly does not inherit existing NFT standards, although an implementation can additionally support ERC-721. A pointer to a model and a token transfer therefore do not establish encrypted-data handover. The next holder must obtain the intended data under the selected verification and key-delivery assumptions. The reference also leaves its sealed executor outside the standard's scope. This release does not implement that prover, private-data handover, or sealed execution. Our future “memory chamber” must add them explicitly; it cannot recover the original application's discarded thoughts.

[ERC-7662](https://eips.ethereum.org/EIPS/eip-7662) examines AI-agent NFT metadata. Describing an agent is different from proving its inference, securing its tools, or paying for its runtime. A rich metadata document may be useful to a marketplace, but it must not imply that a model is running inside an EVM.

[ERC-8004](https://eips.ethereum.org/EIPS/eip-8004), currently Draft, proposes identity, reputation, and validation registries for agents. Its identity and service-discovery approach is relevant to a phoenix steward; its transfer-related agent-wallet handling is an important reminder that an identity change must not silently leave the seller's runtime in control. Reputation is not a universal truth score. An agent can have signed feedback and still be unskilled or malicious. No ERC-8004 registry integration, registered agent, or validation service is deployed in 1.4.

Alethea's [CharacterGPT FAQ](https://medium.com/alethea-ai/charactergpt-faq-9ab0d8b13da9) uses an Intelligence Pod / fusion architecture for iNFT functionality. That is a specific protocol design, not proof that every asset called iNFT has the same interface or execution guarantees. Its useful lesson here is separating a collectible's identity from a capability-bearing module; its runtime is not transplanted into this release.

**Design decision: a future steward gets capabilities, not blanket ownership.** Public identity, authorized tools, spending limits, time bounds, output-verification policy, and owner revocation should be separate. A model-generated instruction must never itself be sufficient authorization to spend. Changing a prompt should not change a vault release rule. An artifact sale should revoke the former custodian's sessions and require reauthorization of external runtime credentials. These are design requirements, not claims of completed AI autonomy.

## 3. Ownership, accounts, composition, use, and presentation

The linked interfaces solve different problems. They should not be accumulated through multiple inheritance without resolving their transfer and approval semantics.

| Primary source | What it contributes | Decision for this NFT |
|---|---|---|
| [ERC-721](https://eips.ethereum.org/EIPS/eip-721) | Unique token ownership and transfer interfaces | Retain the existing collection's identity anchor. |
| [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155) | Multiple fungible/non-fungible token types and batch operations | Suitable future room passes or editions; not newly implemented. |
| [ERC-20](https://eips.ethereum.org/EIPS/eip-20) | Fungible balances, transfers, allowances | Existing launch token and declared estate balances use this interface. Nonstandard token behavior remains a risk. |
| [ERC-6551](https://eips.ethereum.org/EIPS/eip-6551) | Token-bound accounts with a specified registry/proxy architecture | Borrow the account-owned-estate model, but do not relabel the inherited custom account as canonical compliance. |
| [ERC-7656](https://eips.ethereum.org/EIPS/eip-7656) | Generalized token-linked contract creation/registry concepts | Possible future capability/service contracts without stuffing every behavior into the identity token. |
| [ERC-998](https://eips.ethereum.org/EIPS/eip-998) | Composable token ownership trees | Review ownership-cycle and approval hazards; not a claim that an account holding children implements ERC-998. |
| [ERC-7401](https://eips.ethereum.org/EIPS/eip-7401) | Parent-governed NFT nesting | Potential rooms, buildings, and child artifacts with explicit acceptance and transfer rules. Not implemented. |
| [ERC-5773](https://eips.ethereum.org/EIPS/eip-5773) | Multiple context-dependent representations of one NFT | A portrait, interactive interior, and agent-readable manifest can describe one identity. The new scene is not itself a compliant multi-asset registry. |
| [ERC-6220](https://eips.ethereum.org/EIPS/eip-6220) | Catalog-based equippable parts and composition | Future installable rooms or instruments. A visual feather is not an executable privilege. |
| [ERC-4907](https://eips.ethereum.org/EIPS/eip-4907) | Expiring user role separate from ownership | Retain the core's use-role concept and demonstrate temporary presence without treasury authority. An active user blocks this exchange's listing path. |
| [ERC-5006](https://eips.ethereum.org/EIPS/eip-5006) | ERC-1155 use records | Future multi-seat room or edition access; not needed for the current single-identity rehearsal. |
| [ERC-3525](https://eips.ethereum.org/EIPS/eip-3525) | Semi-fungible value associated with token IDs and slots | Potential future claims with explicit units. Not a reason to fractionalize the root NFT or imply guaranteed yield. |
| [ERC-7631](https://eips.ethereum.org/EIPS/eip-7631) | Linked ERC-20 / ERC-721 token pairs | Evaluated but not adopted; fungible trading should not unexpectedly transfer social authority or nested contents. |
| [ERC-2981](https://eips.ethereum.org/EIPS/eip-2981) | Royalty information | Exchange snapshots and checks the indicated royalty. The standard does not force every other venue to pay. |
| [ERC-4494](https://eips.ethereum.org/EIPS/eip-4494) | Permit-style NFT approvals | Deferred until exact nonce, ownership-transition, and contract-signature semantics are tested. |
| [ERC-4906](https://eips.ethereum.org/EIPS/eip-4906) | Metadata update events | Corrected the source's event parameter indexing and added its interface identifier. Still awaiting compilation. |
| [ERC-8048](https://eips.ethereum.org/EIPS/eip-8048) | Onchain metadata interface proposal | Existing source has related metadata shapes; no broad certification is asserted. The linked proposal is Draft. |
| [ERC-5192](https://eips.ethereum.org/EIPS/eip-5192) | Minimal soulbound signaling | Potential nontransferable achievements; should not accidentally bind the entire tradable estate. |
| [ERC-5484](https://eips.ethereum.org/EIPS/eip-5484) | Consensual soulbound tokens and burn authority | Consent matters for personal reputation. Buying an estate should not buy somebody else's nontransferable credentials. |
| [ERC-4973](https://eips.ethereum.org/EIPS/eip-4973) | Account-bound token ideas | Relevant to person-bound credentials, separate from an artifact's public history. |

The distinction between **representation, possession, and permission** is fundamental. An ERC-5773 representation can be a document or a model of the phoenix. An ERC-721 child can be something the account owns. A scoped session can allow a program to perform a specific operation. None of those implies the other two. The marketplace's declared inventory checks actual account-owned assets and vault records; it does not infer ownership from a rendered castle or infer authority from an installed image.

The ERC-6551 security discussion is especially relevant to purchases of accounts with contents. An NFT can be advertised with assets that disappear before settlement. The new exchange therefore holds the root NFT in escrow and verifies a content covenant at execution. That is our custom trading design, not a claim that the standard itself supplies a safe exchange.

## 4. Accounts and execution: convenience cannot flatten permissions

| Primary source | Relevance and adoption boundary |
|---|---|
| [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337) | Account-abstraction execution and sponsorship can reduce interaction friction. Bundlers and paymasters still have availability, policy, and funding assumptions. Not integrated in the new GUI. |
| [ERC-7579](https://eips.ethereum.org/EIPS/eip-7579) | Modular account interfaces are attractive for explicit validators/executors. Installing a module can be a serious authority change. Deferred pending compatibility and security work. |
| [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) | EOA code delegation is not a substitute for the NFT's ownership rules. An authorization to delegate code is not merely “connect wallet.” Not used. |
| [EIP-712](https://eips.ethereum.org/EIPS/eip-712) | Structured signing improves inspectability, but signatures still need correct domain binding, replay limits, and expiry. Existing protocol intent work is separate from this local GUI. |
| [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) | Contract signatures depend on current account policy. A seller's formerly valid authorization must not remain usable after transfer. The escrow deliberately exposes no general signature-approval surface. |
| [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) | Wallet account/network changes invalidate prepared actions. The inherited testnet adapter remains archived; the new v4 interface does not pretend to have a finished wallet adapter. |
| [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) | A tokenized vault interface, not a synonym for any contract holding coins. The existing TimeVault is a custody/vesting vault, not a yield-bearing ERC-4626 strategy. |
| [ERC-7540](https://eips.ethereum.org/EIPS/eip-7540) | Asynchronous vault request/claim flows could support future strategies. They add withdrawal scheduling and integration complexity, so they are not hidden behind today's “Lock” button. |

The preserved Bound/Sovereign distinction is not bypassed for convenience. Direct-owner marketplace listings reject the sovereign mode. The code does not manufacture proofs or install a fallback owner key after irreversible Ascension. The legacy sealed-memory digest is not presented as transferable encrypted agent memory.

## 5. ONFT and other cross-chain models

[LayerZero ONFT](https://docs.layerzero.network/v2/developers/evm/onft/quickstart) offers a protocol-specific model for cross-chain NFTs, including burn/mint and adapter escrow patterns. That movement concerns the configured token representation and messaging path. It does not automatically move account-held assets, scheduled claims, room administration, or private data. Remote chain safety additionally depends on peer configuration, verification, replay controls, and finality assumptions. No LayerZero endpoint, peer, DVN configuration, bridge, or remote execution is deployed in this package.

[ICS-721](https://github.com/cosmos/ibc/blob/main/spec/app/ics-721-nft-transfer/README.md) provides an IBC NFT transfer protocol, with different transport and trace semantics. [CW-721](https://github.com/CosmWasm/cw-nfts/tree/main/packages/cw721) is a CosmWasm NFT interface family rather than an EVM ABI. These are alternatives to study at chain boundaries, not traits to add to a Solidity inheritance list.

**Proposed first omnichain step: one authoritative home, many read-only portals.** A remote view can expose an authenticated home-state commitment with explicit height/age and verification assumptions. It should not show a second active owner-execution surface while the home account still spends. Genuine authority migration would require a defined lock/burn transition, global identity, custody epoch, replay domain, message authentication, destination activation rule, and a plan for assets left behind. A static hash alone proves none of that. Remote portals and migration remain design work, not working features in 1.4.

## 6. Lessons outside EVM

[Metaplex Core](https://www.metaplex.com/docs/smart-contracts/core) demonstrates an asset/plugin design. [Token Metadata](https://www.metaplex.com/docs/smart-contracts/token-metadata) and its programmable NFT mechanisms address a different Solana asset model. [Bubblegum v2](https://www.metaplex.com/docs/smart-contracts/bubblegum-v2) uses compressed asset structures; the existence of a Merkle commitment does not mean every metadata byte and its retrieval infrastructure live inside that commitment. Compression is not adopted by declaring an EVM token “compressed.”

[Sui Kiosk](https://docs.sui.io/onchain-finance/kiosk/) and [TransferPolicy](https://docs.sui.io/develop/objects/transfers/transfer-policies) are useful commerce references: explicit policy satisfaction can be part of atomic trading. The transferable lesson is a sale with executable conditions, not copying Move ownership semantics into an account ABI. [Aptos Digital Asset](https://aptos.dev/build/smart-contracts/digital-asset) uses object-oriented collection/token structures with capability choices. Capabilities and mutation policy deserve separate inspection from the picture a token displays.

[Ordinals inscriptions](https://docs.ordinals.com/inscriptions.html) and [recursion](https://docs.ordinals.com/inscriptions/recursion.html) are relevant to self-contained, composable presentation. Reusing onchain resources can support rich browser experiences without asserting that Bitcoin executes the browser's graphics or this EVM launchpad. No Solana, Sui, Aptos, Cosmos, or Bitcoin deployment or adapter was built here.

## 7. The implemented v4 direction

The relevant sources are Uniswap's [architecture](https://developers.uniswap.org/docs/protocols/v4/concepts/architecture), [dynamic fees](https://developers.uniswap.org/docs/protocols/v4/concepts/dynamic-fees), [swap hooks](https://developers.uniswap.org/docs/protocols/v4/guides/hooks/swap-hooks), [hook deployment](https://developers.uniswap.org/docs/protocols/v4/guides/hooks/hook-deployment), and [unlock callbacks](https://developers.uniswap.org/docs/protocols/v4/guides/unlock-callback-and-deltas). Source-level ABI review was pinned to [v4-core commit d153b048868a60c2403a3ef5b2301bb247884d46](https://github.com/Uniswap/v4-core/tree/d153b048868a60c2403a3ef5b2301bb247884d46).

**Written source, not an executed integration:** `PhoenixLaunchHook` uses before-initialization, before-removal, before-swap, and after-swap callbacks. Its required low-address flags are `0x22c0`; a matching CREATE2 address is required by the constructor. The market commits its intended native/token pool and initialization price before initialization. The hook permits that initializer and uses a fixed time-based LP-fee schedule: 1.00% at birth, decreasing to 0.30% over 24 hours. Fees are expressed in v4 units; 10,000 means 1%, not 10,000 basis points.

The changing fee is an explicit economic choice, not a proof of fair launch, bot resistance, or best execution. It has no owner-controlled surprise tax or later fee setter. The after-swap observation is tied to the pool and router; it does not treat caller-provided hookData as a trustworthy end-user identity. The hook performs no external chat call, so chat policy changes cannot themselves block core swaps.

`V4GenesisMarket` uses actual PoolManager unlock, modify-liquidity, swap, sync, settle, and take calls through an ABI boundary. It is not the old NativeMarket with a new label. Initial full-range seed principal is deliberately nonwithdrawable through this adapter. Fees can be harvested to the recorded creator. When that creator is the NFT's account, future harvested fees accrue to the same account across custody changes. This does not guarantee trading activity or income.

A specific source-review finding changed implementation: [Hooks.sol](https://github.com/Uniswap/v4-core/blob/d153b048868a60c2403a3ef5b2301bb247884d46/src/libraries/Hooks.sol) routes zero-liquidity-delta fee collection through the removal callback. Blocking every removal callback would also block fee harvesting. The hook now blocks only negative liquidity deltas for the seed adapter. This is a reviewed branch condition, not an EVM-tested security guarantee.

The launch auction is still a time-boxed pro-rata batch sale, with withdrawal before close, refunds on failure, immutable allocations, and post-success pool initialization. Uniswap's [Continuous Clearing Auction](https://developers.uniswap.org/docs/liquidity/liquidity-launchpad/concepts/cca) is a distinct mechanism involving budgets, maximum prices, and clearing through time. Adding v4 hooks does not implement CCA. CCA integration remains a separate workstream.

## 8. The whole-estate marketplace

The creative step is to sell an explicit set of future and present rights while preserving the artifact's continuity. In the scene, a time-locked claim can be inspected before it becomes spendable. In source, the exchange checks declared native/ERC-20 floors, child ownership, listed allowance pairs, account state, royalties, and exact vault-record hashes.

A buyer commits to a manifest including chain, exchange, listing, NFT, account, seller, price, expiry, content predicates, and state snapshot. Listing escrows the root NFT, invalidating the former owner's account sessions. Buying checks the predicates before transfer and again after the buyer's receiver callback. Seller and royalty proceeds use pull withdrawals. Active use grants block listing; sovereign identities do not gain an owner bypass.

A sale does not sell a human identity, accelerate a vesting cliff, reveal erased/private data, or promise yield. Undeclared liabilities and previously authorized third-party spenders remain outside the checked inventory unless specifically covered. Account codehash does not certify a proxy's implementation or the behavior of every external asset. The package includes these limitations rather than calling an inventory hash a universal balance-sheet proof.

**Important implementation distinction:** the local model hashes its small, known fictional inventory exactly; the Solidity exchange uses bounded declared predicates and exact lock records. The browser model is not an EVM emulator or a proof that the contract checks run successfully.

## 9. Social architecture: relationships need their own rules

[Lens](https://lens.xyz/docs/protocol) provides useful separation among accounts, graphs, groups, feeds, rules, and actions. [Farcaster's architecture](https://docs.farcaster.xyz/learn/architecture/overview) separates its onchain foundations from offchain social data. [XMTP's glossary](https://docs.xmtp.org/fund-agents-apps/glossary) distinguishes offchain message broadcast from blockchain settlement. These are valuable references, but neither a decentralized messaging label nor a blockchain identity is equivalent to storing every message body in EVM state.

The source here takes the stricter path for public chat: complete message bytes, room configuration, membership, reactions, preferences, and protocol activity are contract state. This incurs storage and transaction costs. It is not free, private, or Discord-speed by definition. The demo posts instantly because it is local, not because those blockchain costs disappeared.

There are three separate social boundaries. **World** is the public shared conversation, with each viewer's own follow/block filters. **Rooms** have their own posting policies, invitation acceptance, moderators, slow mode, and optional member-only writing. **Protocol activity** is appended only by installed trusted modules for their permitted event kinds. A typed “I LAUNCHED a coin” remains a message, not a launch receipt.

Each recorded action can be discussed as a specific receipt. A sale preserves historical custody attribution: a new owner does not become the author of the previous owner's posts. Room administration can follow the artifact, but accepted people are not property. Stale invitations and epoch-bound moderator privileges require attention after custody changes. The new source binds invitation and moderator authority to the issuing epoch and requires role acceptance.

For genuinely confidential rooms, [MLS / RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html) supplies a protocol-level model for group keys and membership changes. A future design could keep ciphertext onchain and use proper group key evolution, with explicit membership-metadata leakage and availability costs. Removing someone cannot make them forget plaintext they previously saw. MLS, key packages, cryptographic private rooms, and encrypted attachment storage are **not implemented** in this release.

Do not assign universal social status from swap volume. Wash trading can manufacture activity, and wallets are not unique humans. More interesting future credentials would attest to a specific completed task, method, and dispute process. An AI steward's feedback, a person's credentials, and an estate's onchain operating history should remain distinguishable.

## 10. Fully onchain must be specified layer by layer

[ERC-5169](https://eips.ethereum.org/EIPS/eip-5169) concerns client-script discoverability. [ERC-4804](https://eips.ethereum.org/EIPS/eip-4804), [ERC-6860](https://eips.ethereum.org/EIPS/eip-6860), [ERC-5219](https://eips.ethereum.org/EIPS/eip-5219), and [ERC-6944](https://eips.ethereum.org/EIPS/eip-6944) concern contract-backed web/resource interfaces. A discoverable URI is not itself permanent byte storage. A browser also still needs a compatible resolver, provider, and a security policy for executing recovered code.

The inherited `OnchainApp` / `AppChunk` source stores complete application bytes as immutable data-code chunks and verifies their assembled SHA-256 digest. This release prepares the exact new HTML as local chunks and verifies byte-identical reassembly. No chunk or archive root was deployed. Deploying that exact archive would preserve the **rehearsal application**, not silently turn its fictional balances into live chain reads.

A complete future release needs separate evidence for asset ownership, custody and release logic, market execution, public social data, application-byte availability, client transaction decoding, RPC/light-client trust, finality, agent data availability, and any offchain model computation. A seed onchain is not every shader byte onchain. A hash of chat is not the chat stored onchain. Proof of private-data transfer is not proof of useful AI inference.

## 11. What was selected and what was deliberately deferred

**Implemented and browser-tested locally:** enterable procedural interior; whole-estate inspection and purchase rehearsal; future-unlock visualization; launch/settle/swap/lock flows; receipt-linked conversation; member acceptance; custody-aware historical messages; scoped presence; export/restore; original organism access.

**Written Solidity, uncompiled:** genuine v4 PoolManager adapter and hook; launchpad seed-interface refactor; whole-estate escrow exchange; expanded onchain social attribution and consent; metadata-event fix; internal account call-data fix.

**Prepared but not deployed:** immutable HTML chunk payloads and offline hook-address mining tool. **Researched, not implemented:** canonical ERC-6551 migration, 5773/7401/6220 conformance, ERC-7857 private-data prover/executor, ERC-8004 integration, encrypted MLS rooms, cross-chain authority migration, CCA, live v4 quote/wallet GUI, account-abstraction sponsorship.

The next release gate is actual Solidity compilation, size review, tests against the pinned real PoolManager, hostile-token/callback/escrow tests, and a wallet-driven testnet integration. The ambition is an artifact whose internal economy and community remain inspectable and coherent. The evidence delivered here is a tested interaction study and an explicitly unvalidated contract implementation—not an operating autonomous kingdom or a production custody system.
