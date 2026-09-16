# ANIMA: what the actual NFT project contains

Source audit, 13 September 2026. This distinguishes the canonical NFT project in `ANIMA-NFT-cleanup` from the hosted `ANIMA-NFT-simulator`. It is an implementation inventory, not a security certification or proof of a live Ethereum deployment.

**The actual source does include shielded launches and encrypted group chat. The simulator omitted their routes. Its cosmetic Privacy control was not an accurate inventory of the project's privacy features.**

## Privacy: exactly what is implemented

| Feature | Actual implementation | What remains visible or required | Hosted simulator |
|---|---|---|---|
| Private swaps | RAILGUN SDK preparation, proving and broadcasting path; shielded inputs/outputs through the configured integration | Requires compatible deployments, RPC/POI access, circuits, synchronized shielded funds and broadcaster. Pool activity and network metadata are not universally hidden. No automatic public fallback. | Local swap arithmetic; private execution is blocked. No real funds move. |
| Private launches | Shielded funding route through shared RelayAdapt into a Uniswap v4 launch factory; issued token, LP shares and refunds can return to a shielded recipient | The launched ERC20, name, symbol, supply, pool, amounts, price and timing are public. “Private launch” means shielding funding/recipient linkage; it does not create a secret token or invisible pool. Service and deployment configuration is required. | A local launch model. It does not execute the implemented shielded launch. |
| Encrypted group chat | On-chain invitation/acceptance, up to 32 members, encrypted epoch keys and messages, removal/leave, rotation, replay checks and closure; encrypted backup files downloaded by the browser | Message contents are encrypted. Wallet identities, membership, sender, timing, epoch/sequence and approximate size remain public. Contracts must be deployed/configured and users must register encryption keys. | The encrypted-chat route was omitted. |
| Ordinary Commons rooms | WorldLedger public messages with optional membership restrictions on posting | Invitation-only posting does **not** make messages unreadable to outsiders. This is separate from encrypted group chat. | Local rooms/messages. |
| Private memory | Encrypted local notebook; public inscription and hash-only sealing paths; optional on-chain ciphertext publication and recipient-accepted NFT/memory handover | The private handover client encrypts before publishing ciphertext. Public inscription publishes plaintext. Optional extension deployment, keys, backups and the selected path determine protection. | Encrypted local notes plus local activity models. |
| Screen privacy | Hide amounts or cover the current screen | This changes what someone beside the screen can see. It does not encrypt chain transactions or make chat private. | Implemented cosmetic controls. |

### Shielded launch details

The canonical Launch route calls `web/v4/desk.mjs`; private mode is the default there. `web/v4/client.mjs` prepares the launch plan and contract calls. `packages/privacy/src/runtime.mjs` contains the RAILGUN/Waku integration. `integrations/console/protocol/v4-hook/src/GenesisV4Launchpad.sol` creates the fixed-supply token, initializes a real no-hook Uniswap v4 pool, seeds liquidity atomically, issues redeemable LP shares and handles refunds.

The shielded route makes the shared adapter the factory caller, without an NFT/creator ledger in this factory. That limits direct public attribution but is not a guarantee of anonymity: deposits, withdrawals, unique amounts, timing and network observations can still establish links.

Creator-fee hooks and OwnerFeeRouter exist separately. This particular launchpad uses a zero hook. There is no integrated shielded creator-split launch in this route. OwnerLaunchFactory commitments or hook metadata alone do not prove a liquidity pool was created.

The reviewed evidence includes ten local Anvil scenarios with the pinned PoolManager. The private accounting scenario uses a RelayAdapt harness that **does not verify ZK proofs**. Separate SDK checks cover offline derivation, recovery and encrypted notes. These are useful implementation tests, not a funded Ethereum shielded launch receipt.

### Encrypted group chat details

Canonical navigation: **Atlas / Advanced → Specialist instruments → Private communication**. The desk is wired through `web/extensions/desk.mjs` and `web/extensions/privacy/desk.mjs`; `web/extensions/privacy.mjs` implements key rotation, opening epochs, posting and decryption. Contracts are `EpochGroupChat.sol`, `PrivacyKeys.sol`, and `PrivateMemoryHandover.sol` under `contracts/src/extensions/privacy/`.

The client uses P-256 ECDH, HKDF-SHA256 and AES-256-GCM with a random group key per epoch, individually encrypted recipient packages, and message padding in 256-byte buckets. Membership changes freeze posting until the manager rotates keys. Replacing a registered member key also invalidates the current epoch for posting.

Removed members retain messages/keys from epochs they were allowed to read. New members do not receive earlier epoch packages. Compromise of a long-term recipient private key can expose historical addressed key packages: this is **not forward secrecy**, MLS or a Double Ratchet. Members can retain or share decrypted contents. Contract checks enforce recipient/generation/commitment structure, not the honesty of every manager-generated encryption package.

Chat identity is a wallet plus its encryption keys. Selling the NFT does not automatically transfer chat keys or private history. The desk currently requires all three privacy-extension addresses, even if the immediate goal is only chat. The default extension directory is empty and the core NFT deployment does not deploy those extensions automatically.

Existing Ganache + real WebCrypto integration evidence covers consent, encryption/decryption, rotation, removed-member exclusion, replay protection, backup and key replacement (`test/extensions/privacy.integration.test.mjs`). Those tests were reviewed, not rerun as a new public deployment during this audit.

## The rest of the actual project

“Implemented” below means code exists in the reviewed project. Availability to an owner depends on the deployed version, configuration, funded account and any external service listed.

| Capability | What the code provides | Boundary / unfinished work | Main source |
|---|---|---|---|
| NFT mint and recovery | Commit/reveal mint; deterministic account; expired-commit cancellation/refund | Local/testnet interface and deployment evidence do not prove a public Ethereum release | `contracts/src/core/IDontFuckingBelieveIt.sol`, `web/evm.mjs` |
| NFT-owned wallet | Receive ETH, ERC20, ERC721 and ERC1155; owner execution; scoped sessions with target, selector, value, count and time limits | Ownership and transfer invalidate old delegated authority; this is not unrestricted agent access | `contracts/src/core/SovereignAccount.sol` |
| Owner transaction interface | Wallet connection, owner verification, preparation/review and submission | The NFT artwork and on-chain app bytes are public; owner-only actions do not make the entire app secret | `web/confluence/wallet.mjs` |
| Living artwork | Seed/genome/state-driven optical rendering, motion, audio, portrait export, evolution and lineage | Browser executes renderer; wallet thumbnail and interactive experience are distinct outputs | `render/living/field.inc`, `web/genesis/`, collection evolution methods |
| On-chain app and recovery | App chunks, runtime loader, token boot page and SVG fallback | The exact deployed app archive determines a minted NFT's software. Editing a hosted simulator does not replace immutable app bytes | `contracts/src/protocol/OnchainApp.sol`, `contracts/src/confluence/ConfluenceRenderer.sol`, `GenesisSVG.sol` |
| Vaults | Deposits and timed/cliff/linear release | Requires deployed vault and real funded transactions | `TimeVault.sol`, live desk |
| Scheduled exits | Funded exit plans, slice execution, plan control/recovery | An external funded keeper or caller must execute slices | `VestedExitVault.sol`, `web/exit/live-ui.mjs`, `agent/exit-keeper.mjs` |
| Market, gifts, editions and work | Marketplace listings/buy/cancel; consent gifts; editions; commissions; bonded shelf; commitments | Several retained screens are local models, with incomplete dedicated live UI coverage for every contract action | `EstateExchange.sol`, `ConsentGiftRouter.sol`, `EditionRegistry.sol`, `CommissionEscrow.sol`, `BondedShelf.sol`, `CommitmentIndex.sol` |
| Games and cartridges | Local games and board editor; isolated HTML execution; ownership and exact-byte checks for connected cartridges; frozen commissioned executables | A game running in the NFT interface is not inherently a blockchain game or redeemable currency | Confluence cartridge routes, `CartridgeRegistry.sol`, `CommissionedCartridges.sol`, `web/workshop/desk.mjs` |
| Shared worlds | Persistent server-based characters, towns, trade and a multiplayer slice | Needs a running external server. Game coins are not automatically withdrawable on-chain assets | `web/extensions/worlds.mjs`, `agent/worlds/` |
| Agents and paid services | Manual review, scoped repeat operators, policy grants/revocation, host/provider registry, feedback and paid job mechanisms | Requires configured operators/providers. No unrestricted autonomous intelligence or automatic Sovereign proof production | `AgentPolicyGuard.sol`, `ProviderDirectory.sol`, `agent/extensions/` |
| Mint sanctuary | Separate encrypted wallets/backups, pending transaction reconciliation, code-policy checks and mint review | Device/key custody and actual network configuration remain necessary | `web/burners/desk.mjs`, `vault.mjs` |
| Names | Delegated ENS-parent named minting, deterministic `anima-ID` subnames and NFT/account resolution | Depends on parent delegation and deployment | `GenesisNames.sol`, `NamedMintSession.sol` |
| Sponsorship | Scoped sponsored-session mechanism | Needs a separately funded relay/sponsor | `SessionSponsor.sol` |
| Specialist modules | Configurable auctions, public-goods matching, frozen custody shares/buyout, House leverage, Wager, Wake and bounded quote proofs | Optional contracts and services. Quote proof covers bounded NativeMarket arithmetic, not general EVM execution; fixed-attester trust remains in Sovereign paths. Custody shares freeze the account and do not give shareholders general operating governance | `contracts/src/extensions/`, specialist desks and proof fixtures |

## What has actually been demonstrated

The deployment records reviewed in `reports/confluence/local-deployment.json` and `reports/cleanup-6.0/local-deployment.json` identify chain **31337**, a local development chain. They demonstrate local contract/runtime/metadata/loader round trips. They do not establish that these features are currently deployed, configured and funded on public Ethereum.

The simulator uses six recorded local mint/evolution pairs. Its wallet methods are disabled, its network policy does not permit arbitrary chain/service calls, and its trade/launch/vault activity is local. A source implementation, a local passing test, a deployed contract and a connected owner interface are four different milestones. The earlier presentation blurred them.

## What should change next

1. Keep shielded swaps/launches and encrypted chat, but expose their actual canonical routes in a deployment-aware owner interface. Show which dependencies are configured and stop private operations if they are unavailable; never fall back to public execution silently.
2. Keep screen concealment separate from transaction privacy and encrypted messaging. Replace any blanket implication that a single toggle protects everything.
3. Do not describe invitation-only Commons rooms as confidential. Use the encrypted chat implementation for confidential message contents.
4. Configure and deploy the optional privacy contracts/services and complete funded end-to-end verification before calling the Ethereum product operational. Preserve receipts, chain IDs and exact runtime hashes.
5. Consolidate the local instrument models and live screens around the same capability registry, with explicit behavior at execution/review. The simulator's route gate currently hides implemented functionality.
6. Keep the actual seed/genome/state fixed during navigation. Use one optical field and change the camera, without reconstructing a second spherical object or crossfading between different renderings.

## Navigation change delivered with this audit

The simulator now uses the original volume density, color, exposure and original exterior glow. Its formerly two-dimensional glow is continued as a fixed thin emissive layer, whose integral reproduces the original exterior view; it is no longer rebuilt as another spherical corona. This is an explicit depth continuation of the original 2D contribution, not a claim that the original artwork uniquely specified a 3D interior.

Pinch/spread and wheel move a single camera through the fixed scene. There is no image crossfade at the surface and no distance-triggered reset to a separate object. Reverse movement stays in the same scene. “View whole object” returns the camera to its captured home position. The CPU path shares the same optical kernel and screen coordinates. Home touch capture has also been enabled.

These are hosted simulator changes. They do not modify an already minted NFT or establish that this updated renderer is in a deployed Ethereum runtime. Physical phone/browser interaction testing remains outstanding; validation here covers actual native GLES rendering, software rendering, source checks and gesture/controller fixtures.
