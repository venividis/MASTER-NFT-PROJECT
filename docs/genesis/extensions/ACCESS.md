# Sponsored transactions and ENS mint entry

Open **Atlas → New instruments → Sponsored gas & names**. These are deployed-contract workflows with exact wallet reviews. The local tests exercise real Genesis collections and accounts. Public deployment is not claimed.

## F07: someone else funds transaction gas

`SessionSponsor` is a native Genesis session relay. The NFT owner grants the relay one target, selector, maximum value, expiry and call count using the existing account permission system. The owner and gas sponsor then sign an EIP-712 request that fixes every calldata byte, value, account nonce, custody epoch, deadline, relayer and gas/refund limit.

The relayer submits the transaction and pays its gas. The contract reserves the request's maximum refund from that sponsor's deposited balance, executes the account session, then credits the bounded measured reimbursement to the relayer. The NFT pays only the explicitly signed call value. Relayer credit and unused sponsor deposits have separate withdrawals to chosen recipients. Owner or sponsor can cancel an exact voucher.

1. Deploy `SessionSponsor()` and import its inspected directory.
2. Sponsor deposits native currency with **Fund sponsored gas**.
3. NFT owner prepares the exact request and reviews the one-call session grant.
4. Owner signs the displayed request. The public JSON can be copied to the sponsor; it contains no wallet private key. The sponsor independently reviews and signs the same request.
5. The named relayer loads the signed JSON and reviews submission. After inclusion, inspect the `Relayed` event's success flag: transaction inclusion alone does not mean the inner action succeeded.
6. Relayer claims accrued credit; sponsor can reclaim unused deposit. An expired request cannot spend.

A failed authorized inner call consumes its voucher once and can still earn a refund. The signed cap protects the sponsor; it is not a promise of full relayer-cost reimbursement. Accounting uses measured execution gas plus a fixed 45,000-gas overhead and does not calculate variable intrinsic calldata or rollup/L1 publication costs. Large calldata can leave the relayer under-reimbursed. No ERC-4337 EntryPoint, paymaster, ERC-2771 forwarding or arbitrary account abstraction compliance is claimed. The chosen account session remains independently necessary.

Source: [`SessionSponsor.sol`](../../../contracts/src/extensions/access/SessionSponsor.sol), [`access.mjs`](../../../web/extensions/access.mjs). Signature format follows [EIP-712](https://eips.ethereum.org/EIPS/eip-712); contract-wallet signatures use the existing ERC-1271 checker. Tests reject changed calldata/value, wrong relayer, replay, cancellation, stale custody, missing funds and expired vouchers; they verify deposit/credit conservation, actual NFT value spending and unchanged owner-wallet balance.

## F16: an ENS name that follows the NFT

`GenesisNames(registry, collection, parentNode)` owns an explicitly delegated ENS parent and its deterministic `anima-TOKEN_ID` children. `bind(tokenId)` is permissionless for a real minted token. It never overwrites an existing child. Each child resolves to the token's account; `nftRecord` returns the chain, collection, token, account and current owner. Owner/identity text and avatar records are derived from the NFT, so transfer needs no stale-owner record update.

Deploy `NamedMintFactory(names)` after the registrar. **Create a named mint entry** creates a separate `NamedMintSession` for each wallet. The original collection's commit/reveal rules remain unchanged. The session reveals through the original collection and calls `names.bind` atomically; unavailable parent or collision rolls back the mint. The endowment flows into the newly minted NFT account.

1. Choose the real ENS registry and an unwrapped parent intended for this registrar. Deploy the registrar and factory. Explicitly delegate that parent to `GenesisNames` through its current ENS manager. This deployment has no function to return control of the parent; use a dedicated parent and review this choice.
2. Import the deployment directory. Create your personal mint entry and wait for its receipt.
3. Select recipient and endowment, download the random mint-secret backup, and confirm that it is saved. The backup is sensitive until reveal; no wallet private key is included.
4. Review the commitment. Reveal after at least two blocks and no later than 200 blocks. Mint and name bind either both succeed or both revert.
5. If reveal expires, select your personal session address and use **Cancel expired named mint**, then **Recover cancelled mint endowment**. Recovering to an alternate recipient supports wallets that reject native transfers.
6. In the resolution panel, enter the registry and complete ENS name. The client checks the resolver's record against the collection's actual `ownerOf`/`accountOf` before offering to connect. An already minted edition still enforces its own collection/token/chain binding.

The [ENS registry](https://docs.ens.domains/registry/ens/) records owners and resolvers; this custom resolver exposes standard address/text interfaces and a project-specific NFT record. It does not purchase `.eth` names, perform reverse registration, renew parents, override NameWrapper rules or remove ancestor powers. ENS DNS/web gateway behavior is external. It provides an in-application name-to-NFT entry and deterministic named mint, not a universal browser protocol handler.

Source: [`GenesisNames.sol`](../../../contracts/src/extensions/access/GenesisNames.sol). Test command: `node --test test/extensions/access.test.mjs`.

## Authority and runtime boundaries

Extension addresses are selected explicitly. The workbench checks compiled runtime templates and imported inspected hashes. Immutable constructor settings, signer roles and external dependencies still require review. Account actions keep the original owner/custody checks. Direct wallet actions support sponsors, recipients and shareholders independently of NFT ownership; their chain, selected signer, code and sealed transaction terms are checked again before sending.
