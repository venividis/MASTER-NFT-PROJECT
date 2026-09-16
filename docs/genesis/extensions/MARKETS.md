# ANIMA markets: F01, F06 and F17

These are new deployable Solidity implementations with typed browser actions and local EVM integration tests. They do not alter an already minted immutable edition, deploy themselves, migrate existing liquidity, or claim that local verification is an external security audit.

| Entry | What now runs | Essential boundary |
| --- | --- | --- |
| F01 | A funded streaming uniform-price auction, standing bids, incremental settlement, cancellation, token claims and quote refunds | ANIMA's bounded mechanism; not a deployment of Uniswap's CCA protocol, not a v4 migration adapter |
| F06 | A funded quadratic matching round, immutable identity policy, pre-start registry, donor exits, finalization and payouts | Trusts the registrar's one-human attestation and collusion review; it does not solve permissionless Sybil resistance |
| F17 | Immutable custody of the actual master NFT, transferable ERC20 shares, locked-share buyout voting and whole-NFT redemption | Accepts only an unused Bound account, freezes its execution, and conveys no private keys or unenumerated offchain rights |

## F01: a launch clears while it runs

Imagine a seller placing new baskets of tokens on the table each block. Buyers leave orders saying how many baskets they want and their maximum price. Anyone can ring the clearing bell. The baskets already released are allocated at one price for that checkpoint. The next checkpoint can have a different price.

`ContinuousClearingAuction` fixes the seller, ERC20 sale token, token base units per lot, number of lots, start/end blocks and reserve price at deployment. The seller approves and deposits the exact token inventory before the start. Native currency is the only quote asset. A bid escrows `lots × limitPrice` native wei, bounded to uint112. The contract maintains at most 64 simultaneous standing orders; retired slots can be reused with a new monotonic sequence ID.

Released lots at block `b` are `floor(totalLots × (min(b,end)−start)/(end−start))`. A checkpoint considers the released but unsold inventory. Orders sort by descending limit price and then arrival sequence. If demand covers supply, every filled order pays the marginal accepted limit price; otherwise all fills pay the reserve. Earlier prices are final. Unsold released inventory remains available for a later checkpoint. A new order or cancellation first settles prior standing orders, preventing it from retroactively changing their fills. This is a block-discrete streaming auction with lazy checkpoints, not a single end-of-sale batch. Clearing frequency can affect prices and allocations; users should not assume timing neutrality, MEV immunity or Uniswap-equivalent economics.

Fills reduce each order's remaining quantity and escrow exactly once. Purchased tokens are pull claims; unspent quote funds become refunds when the order is filled, cancelled, or the auction ends. The seller can withdraw only settled proceeds. End-of-sale processing returns unsold inventory to the seller and retires all remaining orders. Before start, the seller can cancel and reclaim inventory. No administrator can retune the auction after deployment.

The accounting equations are:

- Native balance is at least `outstandingQuote`, which is active bid escrows plus bidder refunds plus seller proceeds. Only successful native payouts decrease it.
- Before closure, token balance is unallocated inventory plus outstanding purchased token claims. After closure, all remaining inventory is allocated to token claims and their sum equals `outstandingTokens`.
- Each order's actual cost never exceeds its escrow or limit price times filled quantity. `soldLots` never exceeds released supply or total lots.

Supply and token transfers use the existing strict `ProtocolAssets` checks. Fee-on-transfer and rebasing tokens are unsupported. The 64-order cap gives bounded clearing work and is a real capacity constraint, not a claim of unlimited throughput. There is no automatic Uniswap pool creation or liquidity migration: sale proceeds and unsold inventory have explicit claims that can subsequently fund a separately reviewed launch.

## F06: a community matching pot

Imagine a sponsor offering a jar of coins to help projects many different people support. More different supporters can earn a larger match. Sending many transactions from the same registered person does not create extra supporters.

`PublicGoodsMatching` escrows its entire native matching budget in the constructor. Its sponsor is the deploying address. The constructor fixes a separate registrar, a nonzero identity-policy hash, up to 32 distinct project recipients, start/end times, and a per-person contribution cap. Before the start, the registrar may register up to 256 wallet/identity pairs. Neither a wallet nor a person identifier may be registered twice. Registry changes stop at the start. There is no undisclosed administrator who can edit scoring or recipients after contributions arrive.

Registration is a trusted human attestation. The policy document should explain how people are checked, how collusion and shared-benefit accounts are reviewed, and who is accountable for the attestations. Hashing an identifier does not verify the person and does not make public contribution relationships private. Dishonest registrars or colluding registered humans can manipulate quadratic funding; the fixed budget and donor exit rights bound the mechanism's funds, not its truthfulness.

For project `j`, contribution `c_ij` combines all of person `i`'s donations. The contract tracks `s_j = Σ floor(sqrt(c_ij × 10^18))` and score `q_j = max(floor(s_j² / 10^18) − Σc_ij, 0)`. At finalization each project receives `floor(budget × q_j / Σq_j)` matching wei, in addition to its donations. Rounding residue returns to the sponsor; if every score is zero, the full matching pot returns. These operations use integers and total contribution bounds that keep every intermediate within uint256.

Donors can withdraw their full project contribution before the deadline; its amount and square-root weight are removed. The sponsor can cancel before the deadline. Cancellation permanently prevents finalization and lets every donor reclaim donations, even after the old deadline; the sponsor reclaims only its own matching budget. After a live round ends, anyone can finalize and trigger project claims to the immutable project recipients. No payout is routed through the caller. Claims are single-use and failed native transfers revert their accounting changes.

## F17: shares backed by the actual master NFT

Imagine placing the whole NFT and the key to its onchain purse in a transparent locked chest. Shares are tickets to that chest's economic value. No issuer keeps a secret handle that can empty it. Whoever collects every ticket may take the NFT back. Alternatively, shareholders can accept a fully funded purchase offer and exchange tickets for its proceeds.

`WholeNFTShares` fixes one real collection/token ID, its canonical account, the issuer, share supply, property-disclosure hash, approval threshold (66.67–100 percent) and voting period (1–30 days). The issuer approves that precise NFT and calls `deposit`. The wrapper validates account identity against collection/token ID, Bound mode, controller, zero action nonce, and zero instrument grants. Used accounts are rejected because previous arbitrary execution could have left unenumerated token allowances, debts, hooks or delegated rights. The NFT transfer must increase the account's session epoch exactly once and make the wrapper the controller. The actual collection also clears token approval and rental user on transfer. Prior session grants therefore cannot follow the asset into custody.

The wrapper has no account executor, signing interface, upgrade authority or issuer withdrawal. Account execution is frozen while shares exist. Funds and token rights that accrue to the account stay with the NFT; shareholders cannot individually extract an asset or run a module. Newly minted NFT metadata, assets already sent to a fresh account, and external contractual restrictions must be disclosed. The no-execution check is a conservative admission rule, not a universal proof that no third party ever assigned an obligation. Copyright, legal promises, externally controlled admin rights, other wallets' keys, encrypted-memory secrets and inaccessible offchain content are not manufactured by this wrapper.

Shares support ERC20 balances, transfer, approval and transferFrom. A buyout proposer escrows the full native price and fixes an NFT recipient. Shareholders support an offer by locking real shares until resolution; locked shares cannot be transferred or counted twice. They may withdraw support before the deadline. After the deadline anyone resolves the offer against the fixed threshold and original supply. A successful offer transfers the NFT to its recipient and reserves the entire price for shareholders. A rejecting recipient makes that offer fail and refunds its bidder, so hostile receiver code cannot trap the NFT. The NFT callback gas is capped. Unsuccessful proposals also refund their entire price; all votes can then be unlocked.

Accepted buyouts can force the economic exit of dissenting minority holders at the advertised threshold. This is an explicit governance rule, not unanimous consent. Shareholders unlock their votes and burn shares to claim pro-rata proceeds. The final outstanding shares receive any rounding residue; aggregate payouts cannot exceed funded proceeds. A holder of all original unlocked shares can instead redeem the NFT in kind immediately. An active offer is atomically rejected and its bidder credited a full refund, preventing outsiders from trapping unanimous ownership with repeated dust offers. NFT-account authority follows the redeemed NFT to its new owner through the original collection mechanism.

## Deployment and client integration

| Contract | Constructor arguments, in order | Native value | Follow-up |
| --- | --- | --- | --- |
| `ContinuousClearingAuction` | `seller, saleToken, lotSize:uint112, totalLots:uint64, startBlock:uint64, endBlock:uint64, reservePrice:uint96` | 0 | Seller approves exact sale-token amount to auction, then `fund()` before start |
| `PublicGoodsMatching` | `registrar, identityPolicyHash:bytes32, recipients:address[], startTime:uint64, endTime:uint64, perPersonCap:uint112` | Full matching budget | Registrar registers distinct wallet/person IDs before start |
| `WholeNFTShares` | `collection, tokenId, issuer, supply:uint112, propertyDisclosure:bytes32, approvalBps:uint16, votingPeriod:uint64` | 0 | Issuer approves exact NFT to wrapper, then `deposit()` |

`web/extensions/markets.mjs` exports the complete `ACTIONS` lifecycle for the extension workbench, `DEPLOYMENTS`, a typed `marketAction` encoder, an unsigned `prepareMarketReview` and `readMarketState`. Native amounts and token amounts are raw integer base units. Prepare simulates and estimates a transaction, binds wallet/chain context, and returns a review; it never broadcasts or signs. Root workbench sending must revalidate context and contract identity. Shareholder wallet actions deliberately do not require personal ownership of the now-escrowed NFT.

Reads use a pinned block, validate the returned ABI shapes and check the block hash again. Auction orders are bounded to 64; matching projects are bounded to 32. State consumers should display the actual token's decimals and the lot size, and make the native-wei price unit explicit.

## Validation

Run `node --test test/extensions/markets.test.mjs` after the core artifacts are compiled. The test compiles these owned contracts in memory with Solidity 0.8.30, optimizer/viaIR and Shanghai, checks EIP-170 sizes, and runs local Ganache transactions. Eight tests cover incremental allocation, limit escrow and end refunds, reserve clearing, unstarted cancellation, identity replay rejection, transaction splitting, exact matching budget, donor/sponsor exits, actual collection/account custody, retired-session rejection, account-use rejection, share allowances, buyout double counting, rejected receiver recovery, exact proceeds and typed reviews. No public-chain deployment is claimed.

## Primary sources reviewed

Uniswap describes CCA as onchain price discovery with continuous clearing and liquidity launch integration; its deployed design has its own algorithm and interfaces. This implementation deliberately identifies its independent bounded mechanism rather than claiming compatibility with those contracts. [Uniswap CCA source repository](https://github.com/Uniswap/continuous-clearing-auction).

The quadratic matching formula and importance of contributor breadth follow the primary Gitcoin explanation and implementation. Identity and collusion assumptions are stated separately because a scoring equation cannot authenticate human uniqueness. [Gitcoin mechanism](https://gitcoin.co/mechanisms/quadratic-funding), [Gitcoin quadratic-funding source](https://github.com/gitcoinco/quadratic-funding), [Gitcoin Sybil-resistance analysis](https://gitcoin.co/research/quadratic-funding-sybil-resistance).
