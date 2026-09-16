# DAVE HELD — v1.8 core (Foundry)

Certificates of Conviction on Robinhood Chain (4663).
Scope: the moat only — hub, seal-vault, renderer, conviction pool,
patronage, icon registry, site kernel, timelock. Everything deferred
(constitution/launchpad, par scrip, mandate module, heredity) docks
into sockets this repo deploys cold. See ARCHITECTURE at bottom.

## Status — read before anything else
- Written to compile under solc 0.8.24; NOT compiled in the authoring
  sandbox (no network). Expect minor first-compile fixups.
- Unaudited. Genesis holds real value: audit Vault + Hub + Patronage
  before mainnet. Fuzz/invariant suites included are a floor, not a proof.
- On mainnet the canonical ERC-6551 registry
  0x000000006551c19487814612e58FE06813775758 is used; tests deploy the
  bundled reference copy in src/vendor.

## Install & run
    curl -L https://foundry.paradigm.xyz | bash && foundryup
    forge install vectorized/solady chiru-labs/ERC721A foundry-rs/forge-std
    forge build
    forge test -vvv

## Deploy (testnet first)
    export PK=... TREASURY=... MULTISIG=...
    forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast

## Contracts
| file | role |
|---|---|
| src/DaveHeld.sol | ERC721A hub: genesis seal-to-mint, tranches, rank engraving, 4906/2981, sockets |
| src/DaveVault.sol | ERC-6551 account + covenant: ratchet seal, ragequit 4.20%, temper, bags |
| src/BagRenderer.sol | on-chain SVG + animation_url bootloader (timelock-swappable) |
| src/ConvictionPool.sol | ETH accumulator paid pro-rata to sealed conviction weight |
| src/Patronage.sol | seal-bounty board: escrow, streamed accrual, forfeit-to-the-room |
| src/IconRegistry.sol | paid glyph listings for bag rendering |
| src/SiteKernel.sol | SSTORE2-chunked JS runtime for token websites |
| src/Bourse.sol | Codicil VII — the floor: every Dave an NFT-AMM stall-keeper |
| src/Charter.sol | Codicil VIII — the token venue: every Dave a chartered x·y=k pool |
| src/Wake.sol | Codicil IX — MEV as bearer rent: Harberger keeper seats on stall aftermath |
| src/House.sol | Codicil X — perps: the vault as counterparty, four solvency fences |
| src/Registry.sol | Codicil XI — RWA dealer desk: NAV±band lots, per-lot compliance |
| src/Chambers.sol | Codicil XII — the sovereign lane: bearer-docked modules, cured 7d, sealed boundary |
| src/Codex.sol | Codicil XIII — code as inscription: leaves, editions, the forge, the recital |
| src/Wager.sol | Codicil XIV — binary event books: the vault as bookmaker, void-refunds, escheat |
| src/Counter.sol | Codicil XV — the credit desk: flash loans from the till, whole-Dave pawns |
| src/Granary.sol | Codicil XVI — vetted ERC-4626 yield routing, every flow pinned vault-ward |
| src/Scrivener.sol | Codicil XVII — covered options in full ink: no oracle, physical settlement |
| src/Indenture.sol | Codicil XVIII — covenant bonds: fully-funded zero-coupon notes, maturity pinned to the seal |
| src/Strips.sol | Codicil XIX — principal/yield separation on blessed silos; fixed rates on the Dave's own floor |
| src/Surety.sol | Codicil XX — restaking: conviction as security, slashes pay the covenant's penal split |
| src/Issue.sol | Codicil XXI — basket funds: carved prospectus, eternal exit, issuer's cut in shares |
| src/lib/MockERC4626.sol | minimal proportional silo for tests |
| site/floor.html | THE TRADING FLOOR — single-file premises console for all thirteen desks |
| src/lib/Curves.sol | pure stall curves: FLAT / LINEAR / EXPO, sudoswap conventions |
| src/lib/Oracles.sol | IOracle / IAllowlist + mocks for feeds and compliance modules |
| src/lib/Timelock.sol | minimal 7-day timelock owning all admin paths |

## Sockets (v1 ships them cold)
- Hub: `approvedModules` / `approvedTargets` (timelock) → future Mandate module (Codicil VI)
- Hub: `hooks[]` afterRagequit fan-out → Patronage today, more later
- Hub: `flagsOf` reserved per-token word → faculties/heredity (Codicil V)
- Hub: renderer pointer (timelock) → richer faces without migration
- Vault: `moduleCall` gated to approvedTargets only; ragequit/execute bearer-only forever

## Codicil VII — THE BOURSE (v1.1)
The Daves do not get a DEX; they ARE the DEX. A bearer opens a STALL:
a bonding-curve pool in any ERC-721 collection, quoted in ETH or any
ERC-20 (Robinhood Stock Tokens included). Sudoswap re-derived on the
covenant — Codicil V collections graduate straight into Dave-kept floors.

| doctrine | meaning |
|---|---|
| Dave-is-the-pool | stall ownership follows `hub.ownerOf` — sell the Dave, sell the book |
| Sides | SELL: asks walk up, proceeds INTO the vault (born locked). BUY: a bid wall; every fill is swallowed INTO the vault — the Dave eats the floor. DUAL: both sides recycle, stall fee compounds as liquidity |
| The bond | a sealed Dave bonds a stall to `unlockAt` (ratchet-only). While bonded: no pulls, no drains, no repricing, no close — only additive stock/fund. Traders can rely on a bonded floor |
| Bond survives ragequit | the promise was made to the FLOOR. Ragequit tolls the stall's quote 4.20% (69/31) and the bond stands to its stated date |
| Vault-ward | every Bourse exit pays INTO the vault — proceeds, pulls, drains, closes. Never the bearer's wallet |
| The toll | 0.42% of notional every swap, 69% ConvictionPool / 31% treasury — every sealed Dave earns from all NFT volume. ERC-2981 honored both directions, clamped 10% |

Fee rule follows sudoswap discipline: the stall fee (≤10%) exists on
DUAL only — one-sided stalls price their margin into the curve.

Stated asymmetries: NFT inventory can't be tolled fractionally at
ragequit (indivisible — the standing bond is the remainder of the
price); royalty is looked up once per trade against the first id;
fee-on-transfer quote tokens are unsupported.

## Codicil VIII — THE CHARTER (v1.2)
The Bourse gave the Daves the NFT floor; the Charter gives them the
token floor. A bearer charters a constant-product pool in any two
ERC-20s (or against ETH) — Robinhood Stock Tokens included. The pool
belongs to the Dave: sell the Dave, sell the venue. Uniswap-v4-shaped
by doctrine, self-contained by construction — on a chain carrying v4
the same doctrines port into one hook contract; here they ARE the venue.

| doctrine | meaning |
|---|---|
| The Dave is the LP | house liquidity only. Enters from the bearer (additive any time), exits VAULT-WARD, only past the bond |
| Universal toll | 0.42% of every swap's input, 69/31 — the sealed earn from token volume too |
| Conviction fee tier | present a sealed Dave you bear → pool fee discounts to 80%. Pool fee (≤3%) stays in reserves — the fee is the Dave's earn |
| The bond | ratchet-only to `unlockAt`; freezes withdrawal, fee, policy, close. Ragequit tolls BOTH reserves 4.20% (69/31); the charter stands |
| Compliance hook | per-pool `IAllowlist` module — permissioned pairs trade behind a gate, stay composable |
| The observatory | 8-slot, 5-min TWAP ring per pool — the mark other codicils stand on |

## Codicil IX — THE WAKE (v1.2)
Every price-moving trade leaves a wake — the stall is briefly mispriced
against the world, and the first transaction behind it collects the
difference. Elsewhere that leaks to latency races. Here the stall sells
its own aftermath. Docked into the Bourse once, by the timelock.

| doctrine | meaning |
|---|---|
| The seat | a bearer enrolls a stall; after any swap, the next N blocks (≤8) belong to the WAKEKEEPER — only the keeper trades inside the window |
| Harberger terms | keeper names its own seat price, streams rent against it (4.20%/yr), anyone may seize at the named price, any time. Self-priced, always for sale, never squattable |
| Rent is vault-ward | the stream pays the stall's own vault (less the 0.42% toll, 69/31) — a second revenue line on the same volume |
| Wake-as-armor | a sandwich needs its back leg; the back leg needs the seat. Attacks either can't close or pre-pay the vault. Enforced in-venue: no relay, no private mempool |
| Lapse | dry escrow → anyone may `poke()` and evict. Armor cannot be squatted rent-free |

## Codicil X — THE HOUSE (v1.2)
Perpetuals, single-owner-venue architecture: no orderbook, no external
LPs — peer-to-pool, and the pool is the Dave. Desks mark on oracle
feeds (Stock Token NAV first among them); stock tokens mark around the
clock, so a Dave running a desk runs weekend price discovery on
equities — the venue the old world structurally cannot operate.

| doctrine | meaning |
|---|---|
| Four fences | per-side OI ≤ charterable % of backing; leverage ≤ 20×; trader profit ≤ 9× margin; stale feed → Charter TWAP fallback or the desk will not trade |
| The house cannot run | backing NEVER leaves while a position stands, bond or no bond. Exits are vault-ward only |
| Never tolled below its book | ragequit tolls FREE backing only (backing − larger side of the book) at 4.20%, 69/31. The bond stands |
| The toll, levered | 0.42% of notional on open AND close — leverage multiplies notional; the sealed earn hardest here |
| The desk earns | spread (≤2%), skew-proportional funding (≤10%/day), liquidations (5% bounty to the caller, remainder of equity home to the trader, the rest to backing) |

## Codicil XI — THE REGISTRY (v1.2)
The Bourse already trades RWAs — a deed, an invoice, a T-bill wrapper
is just an ERC-721. What a curve cannot do is price them. The Registry
is the dealer desk: lots quote off a NAV oracle, buy at NAV−band, sell
at NAV+band — the band is the dealer's margin, transparent and
charterable, in place of curve and fee both.

| doctrine | meaning |
|---|---|
| NAV±band | oracle-pegged two-way quotes; the band (≤20%) replaces the curve. A T-bill does not price like a JPEG |
| Stale paper does not trade | NAV older than 1 day → the desk will not deal |
| Compliance per lot | optional `IAllowlist` gate — securities-adjacent paper trades lawfully, stays composable |
| Every Bourse doctrine | sides (SELL/BUY/DUAL), the bond (ratchet, freezes exits, survives ragequit at 4.20% on the quote), vault-ward exits, the 0.42% toll 69/31, 2981 clamped 10% |

## Codicil XII — THE CHAMBERS (v1.3)
Every codicil before this one extended ALL Daves at once, through the
covenant's timelock. The Chambers extends ONE Dave at a time, through
its bearer alone: dock any contract on the chain as a module of your
own token — an agent, a strategy, a broker, code that will not exist
for years. Owner-programmable, for life, no global admin in the loop.

| doctrine | meaning |
|---|---|
| The cure | a bearer's docking proposal cures 7 days on-chain — visible, cancelable. A stolen key cannot flash-dock a drain; a buyer reads the chamber roster like the bond ledger. Undocking is instant: removing power never waits |
| The sealed boundary | while sealed, chamber acts are MEASURED, not trusted: the tracked estate (ETH + every bag) may only grow, except one declared spend per act, capped and checked against live balances after the call |
| The sealed may only trade where the toll lives | sealed spends and value flow only into hub-approved covenant venues (Charter, Bourse, House, Registry, Patronage). Sealed capital churns inside the covenant economy — captive orderflow for every other sealed Dave |
| Allowance is an exit | calls to a bag token itself may only be `approve()`, and only toward an approved venue |
| Unsealed: the full arm | the boundary lifts entirely — that is what unsealed means. The cure still stands |
| Organs transfer with the body | modules persist through transfer; a new bearer inherits the roster and may `purge()` in one stroke |

Vault surface added for this codicil (pre-genesis, by design — this is
why it ships now): `DaveVault.chamberCall`, callable only by the hub's
ONE Chambers singleton, docked once via `hub.dockChambers` and never
swappable. The vault does not judge chamber calls; the immutable
Chambers does, in one audited place for all 100k vaults.

## Codicil XIII — THE CODEX (v1.4)
A Dave can hold code the way it holds bags — and run it. Raw bytes are
INSCRIBED as leaves (SSTORE2 contract bytecode: immutable the block
they land, author-Dave engraved forever, public material any Dave may
bind — a shared library written by a hundred thousand authors). A
bearer BINDS leaves into ordered, immutable EDITIONS; a new ordering
is a new edition and every prior edition stays readable forever.

| doctrine | meaning |
|---|---|
| The forge | FORGE editions are EVM initcode: `forge()` concatenates the leaves and CREATE2-deploys FROM THE VAULT ITSELF — the program's address derives from the token's own address (`DaveVault.codexCreate`, gated to the one Codex, docked once). The forge births code, never capital: no value rides a deploy |
| Programs are organs | a forged program holds no power until docked through the Chambers' 7-day cure, like anything else |
| The recital | RECITE editions are VERSE — a covenant-native strategy language: HALT / SWAP_CHARTER / TWAP_GT / TWAP_LT / WAIT_UNTIL / REQUIRE_SEALED / REQUIRE_UNSEALED / SEND / SEAL. The interpreter routes every venue op through the Chambers as a docked module — the Codex takes no private lane; recitals are measured like any act |
| The grammar is the wall | the verse can price, gate, wait, swap, seal — it has no word for an unmeasured exit. SEND dies on the sealed boundary and becomes the testament op once the covenant is served; SEAL recites only where the bearer mandates the Codex |
| Open recitals | an edition bound open may be recited by anyone — keeper-style automation where the verse's own gates decide when it fires (dead-man testaments, limit strategies) |
| The strategy is a bearer asset | vault = capital, venues = exchange, codex = the readable, provably-unmodified algorithm, event log = track record. Sell the Dave, sell the fund — manager included |

## Hardening pass (v1.4.1)
A security sweep of the sovereign lane (XII–XIII), attacker-first. Six findings, all closed:

| # | finding | fix |
|---|---|---|
| S1 | Sealed boundary keyed off *bag membership* — a token not yet acknowledged as a bag skipped the approve-gate, and a `transferFrom` pulling from a standing allowance read as accretive | THE SELECTOR FIREWALL: while sealed, transfer-family words (ERC-20/721/1155, incl. batch) are refused on ANY target — what cannot be enumerated cannot be measured. Approval-family words speak only toward hub-approved venues |
| S2 | `House.liquidate` computed `margin − equity` unsigned — a position whose equity drifted above margin via funding could underflow and become unliquidatable | signed settle: below margin the house keeps the difference, above it the house pays the excess from backing (clamped). No position is ever unliquidatable |
| S3 | `SEAL` verse op in an OPEN edition let a stranger ratchet the bearer's covenant | `SEAL` recites bearer-only even in open editions |
| S4 | open recitals (keeper automation) had no replay latch | added `ONCE` (0x09): a per-edition one-shot latch for single-fire testaments |
| S5 | Chambers measured at most 32 bags; a cap divergence could silently skip a bag | measurement bound to the vault's own `MAX_BAGS`; refuses (`BagOverflow`) rather than skip |
| S6 | reentrancy across `act → chamberCall → target` and `recite → act` | confirmed closed: `act` and `recite` each hold their own `nonReentrant` lock; forged-constructor callbacks reach only guarded or permissionless-but-undocked paths |

Dead-code sweep: no unreferenced internals; per-desk/pool/lot `bondedNow` and `*Length` views retained as the premises console's read surface.

## Codicil XIV — THE WAGER (v1.5)
Yes or no, priced in cents — the oldest market, as a bearer instrument.
A Dave opens a BOOK on any resolvable question, quotes its own odds,
and takes every ticket against its backing.

| doctrine | meaning |
|---|---|
| Solvency at every sale | backing + premiums must cover the worst-case side in full before a ticket sells. The house can never sell what it cannot pay |
| The named judge | the resolver is fixed at opening — buyers read who judges before buying. Odds freeze at closeTime |
| Void is a refund, never a rug | a judge who misses resolveBy lets anyone void; every ticket refunds at cost |
| The escheat | winners have 90 days; unclaimed purses fall INTO THE VAULT |
| The covenant | exits vault-ward, bond ratchets and freezes, ragequit tolls FREE backing only, 0.42% toll on every premium |

## Codicil XV — THE COUNTER (v1.5)
Two kinds of credit. THE TILL: flash loans of the drawer — capital that
returns within the transaction never truly left, the seal-native loan;
fees compound in the till, the toll rides the fee. THE PAWN: a borrower
pledges their ENTIRE Dave into escrow and names terms; the lender reads
the bags and the temper — the on-chain credit history — and underwrites
with no oracle. While pawned the Dave is INERT (it answers to no
bearer). Repay and it walks home; default and it forfeits INTO THE
LENDER'S VAULT. The covenant keeps what its debtors abandon.

## Codicil XVI — THE GRANARY (v1.5)
The seal locks value in; it never said the value must idle. Vault
capital routes into ERC-4626 silos the timelock has BLESSED — because a
rotten silo is an exit wearing a yield costume. Both flows are PINNED:
sow() deposits with the receiver hard-wired to the Dave's vault; reap()
redeems the same way. No parameter exists that could point either flow
elsewhere. Sealed Daves farm through the Chambers, measured like any
act. 0.42% toll on assets sown.

## Codicil XVII — THE SCRIVENER (v1.5)
Options written in full ink: every contract is covered before it sells —
CALLs escrow the underlying, PUTs escrow the strike. No oracle, no
liquidation engine; exercise is physical, American-style, and every
flow the quill earns — premiums, strike payments, delivered stock —
lands INTO THE VAULT the block it happens. Past expiry the paper dies
and the cover walks home. Ragequit tolls FREE ink only — never below
the sold book. Sealed capital writes covered calls through the
Chambers: income on locked bags with settlement risk of zero.

## Codicil XVIII — THE INDENTURE (v1.6)
The first bond whose maturity is a mechanism, not a promise. A sealed
Dave opens a tranche of zero-coupon notes; maturity is read off the
covenant — `unlockAt` at issue — and PINNED: the bearer may ratchet the
seal longer, and the paper does not move. Face value is escrowed in a
sinking fund before a single note sells; a note only sells against fund
not yet spoken for, so no default state is reachable. Notes sell at the
bearer's discount and every subscription pays INTO THE VAULT, born
locked — the Dave converts sealed future into liquid present, and the
present locks itself into the same covenant. Committed fund answers to
the paper alone; free fund draws vault-ward; 90 days past maturity the
unredeemed falls home. An indenture is born bonded: ragequit tolls free
fund only, never below the outstanding paper's face.

## Codicil XIX — THE STRIPS (v1.7)
The oldest trick on the bond desk — Separate Trading of Registered
Interest and Principal — rebuilt on the covenant. A bearer opens a
series on any Granary-blessed silo; anyone brings yield-bearing shares
to the shears and leaves holding two papers: PT (one asset unit at
maturity — buy the discount, and the discount IS your fixed rate) and
YT (everything the silo earns until maturity, streamed by index). Both
are plain ERC-20s — list the PT on the Charter and the Dave runs a
fixed-rate market on its own floor, tolling paper the shears created.
Honest accounting, three rules: a HIGH-WATER index (drawdowns never
un-accrue what YT earned; recovery to the prior mark adds nothing);
every YT transfer checkpoints both parties (yield follows whoever held
through the accrual); and an impaired silo haircuts PT PRO-RATA — the
strip is exactly as good as the silo, said out loud. 0.42% toll on
shares brought to the shears. Unstrip recombines any time before
maturity; settlement fixes the rate at first touch after the stroke.

## Codicil XX — THE SURETY (v1.8)
Restaking, covenant-shaped: a Dave underwrites an outside ward by
escrowing stake behind its correctness, with an adjudicator fixed at
underwriting and a term that only lengthens. THE SLASH FEEDS THE
FAITHFUL: cuts pay 69% to the ConvictionPool and 31% to treasury —
one Dave's failure pays every sealed Dave; the security budget never
exits the system it secures. The underwriting résumé is public
(`credential`: temper, paper hands, live conviction, rank, total
staked). Stake is committed through the term and survives ragequit —
past it, home INTO THE VAULT. No adjudicator = an attestation:
unslashable, locked, pure reputation weight. Premiums land vault-ward
less the 0.42% toll.

## Codicil XXI — THE ISSUE (v1.8)
The ETF re-derived: a bearer publishes a prospectus (tokens + exact
amounts per share), the Issue deploys the share class, and the machine
runs in-kind: create by delivering the basket, redeem for the basket
back — fully backed at every block by arithmetic. Two carvings make it
un-ruggable: THE PROSPECTUS IS CARVED (recipe immutable from the first
share; a new thesis is a new fund) and THE EXIT IS ETERNAL (creations
may halt; redemption can never be closed, paused, or gated). The
issuer's cut is paid in its own product — fee shares mint INTO THE
VAULT, so the Dave accumulates its own ETF as it operates it — and the
0.42% toll rides both directions in shares. Supply equals baskets
held, always.

## Invariants that matter
1. A seal's unlock time never decreases (ratchet-only).
2. Sealed bags leave a vault only via ragequit tax math (69/31 of 4.20%).
3. Rank engraves at most once per token.
4. Patronage never pays out more than escrowed pot per campaign.
5. A stall's bondUntil never decreases, and no exit path exists while it holds.
6. A buy-then-sell round trip against any stall never nets the trader positive.
7. The Bourse pays vault-ward only: no path moves stall assets to an EOA except a trader's own swap payout.
8. Charter, House, and Registry exits are vault-ward only, and every bond ratchets and survives ragequit.
9. A wake window never exceeds 8 blocks; wake rent only ever flows toward the stall's vault (less the toll).
10. House backing never exits while a position stands, and ragequit never tolls the house below its book.
11. The Registry never deals on NAV staler than a day.
12. No chamber module acts without a 7-day cured, bearer-signed docking; undocking is always instant.
13. While sealed, no chamber act shrinks any bag or the vault's ETH beyond its single declared, capped spend — and spends land only in covenant venues.
14. A leaf, once inscribed, is immutable and permanently readable; an edition never changes after binding.
15. The forge deploys only from the vault, only bearer-signed, and never carries value; recitals move assets only through the Chambers' measured lane.
16. While sealed, no transfer-family selector executes through a chamber on any target; approval-family selectors reach only hub-approved venues.
17. No House position is ever unliquidatable: liquidation settles signed and clamps to backing.
18. The Wager never sells a ticket the purse cannot pay, and a missed judgment always refunds at cost.
19. Flash capital returns plus fee in the same transaction or the whole flash reverts; a pawned Dave answers to no bearer until repaid or seized.
20. The Granary's silos are timelock-blessed only, and both sow and reap are receiver-pinned to the Dave's vault.
21. The Scrivener never sells beyond its ink, and ragequit never tolls the cover below the sold book.
22. An Indenture note never issues beyond the sinking fund, its maturity never moves after issue, and committed fund pays no one but the paper.
23. Strips yield only ever accrues upward on the high-water index, follows the YT through every transfer, and freezes at settlement; PT never redeems more than the silo honestly holds.
24. Surety stake never leaves before its term, slashes pay only the covenant's own 69/31 split, and attestation pledges are unslashable by anyone.
25. An Issue fund's share supply equals baskets held at every block, its recipe never changes after opening, and redemption is never closable.
