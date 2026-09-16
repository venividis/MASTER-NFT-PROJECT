# ANIMA onchain launchpad

This edition connects the same launchpad interface to real Ethereum transactions in both the NFT runtime and the hosted object. Opening the interface does not connect a wallet or send a transaction. The account shown in the launchpad is the actual signing account; a displayed NFT sample is not proof that this wallet owns a minted NFT. Supported v4 launches can use either the signing wallet or an explicitly verified NFT account. The signing wallet pays network fees; the selected payer funds the launch and receives its issued assets. Community-sale identity zero deliberately makes no NFT ownership assertion.

## Use it

1. Open **Launch → Connect wallet**. Ethereum, Arbitrum and Polygon are supported; disposable local EVM tests use chain 31337.
2. In **Setup**, deploy the ANIMA launch factory from your wallet, or verify a compatible existing address. Deploy the swap router when you want to trade. The wallet reviews and signs each setup transaction separately.
3. Enter the paired ERC20 address and read its actual decimals, symbol and your available balance. Native USDC presets use Circle’s published addresses. For native funding, enter the network’s canonical wrapped-native token and review its deposit transaction.
4. In **Create**, choose supply, price, actual funding budgets, range and LP fee. The event replay uses conserved integer arithmetic for one fixed liquidity position, with no protocol fees or outside liquidity. It is an explicit scenario, not a market forecast. The transaction review reads the chain and resolves the real token ordering.
5. Choose **Prepare onchain launch**, review exact approvals, then sign the creation transaction. **My launches** shows receipt-derived token and position addresses. Trade against the actual Quoter, inspect shares, or redeem principal and earned fees.

If the creator-fee option is enabled, **Fee streams** leads through hook factory, CREATE2 factory, recipient splitter and hook deployment. Once configured, return to Create. The hook fee is additional to the LP fee; its owner can change future fees and their route. Swap plans cap the accepted fee. Hook fees accrue in the input asset, then are flushed to the recipient splitter and claimed separately. Splitter weights apply when funds arrive; existing deposited claims cannot be reassigned. No automatic currency conversion is supplied.

**Community** verifies an existing sealed Genesis launchpad or walks through ledger, NativeMarket, TimeVault, launchpad and final installation. This infrastructure needs an existing collection address. A new sale opens five minutes after preparation; its exact opening and closing times appear before signing. Contributors may withdraw before close. After close, anyone can settle: a successful raise seeds the built-in ANIMA market with permanent liquidity and creates the selected founder and treasury locks; an unsuccessful raise enables full refunds. Claims and matured releases pay the committed beneficiaries. This is not a Uniswap pool.

**Auctions** deploys the existing ANIMA streaming auction for a token you already hold. Fund inventory before its opening block. Bid, cancel a remaining order, checkpoint released lots, and claim tokens, refunds or seller proceeds. There are 64 active bid slots; earlier sequence breaks equal-price ties. There is no minimum-raise guarantee or automatic DEX migration. This contract is not Uniswap CCA v2.

## Privacy

**Private wallet** is the actual existing RAILGUN integration. Its encrypted wallet, RPC, proof service, broadcaster fee signer and fee token require explicit configuration and an available funded shielded balance. Starting the session is explicit. The ordinary v4 launch supports this path, including human range limits resolved for the actual private execution payer. Creator-fee launches, swaps and liquidity redemption also support shielded composition with verified hook settings and exact return assets. The hook owner and fee recipients are public. There is no public fallback when private execution is requested.

Shielding can protect the funding linkage and private recipient. Token creation, pool state, launch amounts, price and timing remain public. Community-sale rooms and contributions are public. Encrypted group chats are available separately in primary Commons; ordinary public rooms remain clearly separate. Local encrypted drafts are separate from onchain funding privacy.

## What changes when an NFT is minted

The current authored runtime is included by the build and archive pipeline. Deploying this new edition’s verified chunks and contracts is a separate onchain process. Updating a hosted page or downloading source does not replace immutable bytes of an already minted edition. No public-chain deployment address is invented in this package.

## Verification

The focused launchpad suite executes the actual contracts in local Ethereum VMs and checks the semantic GUI routes. It covers deterministic deployment, exact allowance reset/approval, token creation, real PoolManager liquidity, quoted swaps, LP redemption, pending-receipt recovery, stale account/draft rejection, sale success/failure and claims, founder/treasury releases, auction conservation, and private contract-payer token ordering. A separate hooked-launch integration checks actual PoolManager fee claims, fee splitting and recipient withdrawals. These tests do not claim a public-chain transaction or a full live RAILGUN proof/broadcaster session.

```sh
npm run compile:local
npm run compile:v4
npm run build
npm run test:launchpad
npm run test:launchpad:hooks
npm run archive:confluence
npm run verify:confluence
```

The approved optical source remains byte-identical. The canonical camera now uses the continuous field across entry and return, with the original drag semantics. Physical phone/browser testing remains outstanding.

## Funding, participation and optional locks

Open **Funding & custody** to verify the current NFT or a collection/token pair. Ownership, account bytecode, binding, authority mode and epoch are checked; supported operations set and clear exact allowances in the same NFT-account transaction. Selling the NFT transfers control of its account assets. External fee recipients and personal encryption keys remain separate. Community and auction actions currently use wallet funding.

Community and auction details provide shareable participant links. Public terms can be read through an explicitly selected HTTPS RPC before wallet connection. The participant page verifies the canonical deployed contract and reads contribution/claim state directly, including on a fresh device. Sharing a link does not change the hosting audience.

**Locks & vesting** supports real TimeVault deposits and fixed-beneficiary releases. Locking LP shares locks both principal redemption and proportional LP fees. It does not create compounding or a separate fee-withdrawal right.
