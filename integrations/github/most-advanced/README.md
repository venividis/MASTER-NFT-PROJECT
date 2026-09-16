# IPSEITY

*ipseity, n. — the property of being oneself; selfhood as distinct from any of its appearances.*

A four-dimensional solid, and the instrument for turning it, are the same token.

---

## What it is

What a holder sees is a **three-dimensional section of a 4-polytope**. The solid is
never on screen — only the 3-space that currently cuts through it. Slide that space
along the fourth axis and a tesseract passes through cube, truncated cube, hexagon,
point. Nothing about the solid changed. Only where you stood.

The orientation of that cut — six plane angles, a position along `w`, which solid,
and the colour the interface takes from it — is **one 256-bit word** in the
contract's storage.

`tokenURI()` returns the instrument for editing that word. It is a WebGL2 engine, a
keccak-256, an ABI coder and a wallet client, held in the chain's state as contract
bytecode and handed back as a `data:` URI. It connects a wallet, reads the contract,
encodes its own calldata, and signs transactions — including transactions against
the token, which change the word, which changes what it renders the next time
anyone opens it.

Nothing is fetched. No IPFS, no gateway, no CDN, no font, no library, no build step
at read time.

---

## The commons, heard on the other chains

The five chains issue one edition and nothing crosses between them. What
crosses is speech, and only speech.

`Parley.speak` is untouched — free, local, no dependency on any of this. It
works on a chain where the port was never deployed, never funded, or has
stopped answering. Federation is a *separate payable call*: `echo` pays the
LayerZero fee and carries a copy outward. A social layer that needs a message
to arrive before anyone can talk has a single point of silence, so the local
commons is never behind the bridge.

Only the commons crosses, and there is no function for anything else. A group
carries a steward, and a steward is an authority — carrying it across would
mean trusting a message to say who may speak. A pair room is derived from two
token ids, and under the partition those two ids may live on different chains,
so a federated pair room would be a room that means different things in
different places. There is no correct way to do it, so there is no function.

The port cannot write into Parley at all, and asks for no privilege there.
What arrives is emitted under the port's own event, tagged with the chain it
came from, so each chain's archive stays exactly what it was: a record of what
was said by someone standing on that chain. A reader who wants the whole
conversation reads two logs and can always tell which is which.

The back-link is rewritten at the border. Parley's walk works because every
message carries the block number of the previous one, so a client steps
backwards with single-block `eth_getLogs` and never scans a range. Block
21,000,000 on Ethereum is not block 21,000,000 anywhere else, so the sender's
pointer is dropped and the port writes its own in the receiving chain's
numbering.

Two protocol properties are the reason this was admissible at all, and both
were verified live rather than read off a page. An unwired lane fails at
**quote** time — the default verifier is a small contract whose entire
behaviour is to revert with *"Please set your OApp's DVNs and/or Executor"* —
so a lane nobody configured refuses loudly instead of accepting a message that
would never arrive. And delivery is **permissionless**: the endpoint's receive
path has no access control, so once the DVNs have attested anyone can deliver.
The paid executor is a convenience and never a dependency, which means no
server is required for any of it.

Nobody can re-point the port's security, and what floats is named. LayerZero
lets an OApp choose which DVNs must attest and lets a delegate change that
later — a delegate is an admin key. The port calls `setDelegate(address(0))`
at construction and carries no function that could set it, or any
configuration, again. An earlier version of this paragraph claimed the
verifier set was therefore as immutable as the bytecode, and that was wrong:
an OApp that pins nothing runs on the endpoint's *default* libraries and DVN
set, which LayerZero Labs can roll forward without asking. So the pin is a
constructor argument now — lane libraries and raw config entries, written
once by the OApp itself and never writable again — and a deployment that
passes none floats on the defaults as a stated choice, admissible for speech
in a way it would never be for custody. The port also speaks the protocol's
actual ABI — `lzReceive` taking `Origin` as a static tuple, plus
`allowInitializePath` and `nextNonce`, the two questions the endpoint and
its executor ask before a lane will carry anything — which for one stretch
it did not: the suite's mock had been written in the port's own invented
dialect and vouched for it fluently. `tools/probe-port-abi.mjs` measured the
three protocol selectors answering `revert 0x` at the deployed bytecode; the
full story is in `OMNICHAIN.md`, and the mock now performs the real
handshake.

## One edition, five chains, no bridge

The collection is one run of 4096, cut into five contiguous bands and issued
from five chains. Each hub is handed its band in the constructor as an
`immutable`, and `mint` issues `FIRST_ID + totalSupply` and refuses past
`LAST_ID`.

```
Ethereum    #1    – #1024     1024      the first band, where #1 should be
Base        #1025 – #2048     1024
Unichain    #2049 – #3072     1024      cheapest place to turn a solid
BNB         #3073 – #3584      512
Robinhood   #3585 – #4096      512      sends and receives; no lzRead
```

Two tokens can never be numbered the same, and nothing has to be trusted for
that to hold: neither chain is able to issue outside its own band, so there
is no message to miss, no quorum to compromise, and no bridge. Nothing
crosses. There is one edition and five places it is issued from, the way one
print run can be signed in five cities.

The bands are powers of two on power-of-two boundaries because the edition is
2^12 and a split you can check in your head is a split a buyer can audit.

Robinhood's is the smallest, and the reason needs stating precisely because
it is easy to get wrong. LayerZero *is* integrated there: the mainnet
endpoint carries SendUln302 and ReceiveUln302 at v3.0.2, and a production
OApp quotes Robinhood to Ethereum at 3.709e-4 ETH today. It sends and it
receives. What it does not carry is ReadLib1002, the library behind lzRead —
so it can neither ask another chain a question nor be asked one. Every other
chain of the five can. That matters because reading is seventeen times
cheaper than messaging (1.957e-5 ETH against 3.404e-4, measured from
Unichain, because the answer lands on the chain that asked), so the cheap way
for this collection to see all of itself at once reaches four of the five and
not the fifth. The smallest band is the honest size for the least connected
place — and "least connected" means exactly that one thing, not that the
chain is worse.

The partition is written down twice, which is a bug waiting for a redeploy
unless something checks: `tools/site.mjs` holds the table the deploy reads,
`PageManifest.EDITION` holds the one the world reads, and the suite asserts
they are the same table and that it tiles 1..4096 exactly once. The guard
itself is tested against an overlap, a hole, an unexhausted edition, a band
that runs backwards, and an empty table — a guard nothing has ever seen fail
is a guard nobody has checked.

Every chain's `/services.json` publishes the whole map, so a program that
finds one chain can find the other four. Reading only `ceiling` would tell it
this chain is the entire collection, and it would be wrong by a factor of
four.

## What is actually new here

Plenty of NFTs put HTML on chain. These are the parts that are not just that.

**The state is the geometry, and the geometry is editable.** Most on-chain
generative work fixes a seed at mint and renders a function of it forever. Here the
seed only decides where a token *starts*. The six rotation angles are live, holder-
writable state, and three of those six planes contain `w` — turning in those does
not spin the picture, it changes **what shape the section is**. The artwork has a
control surface because the artwork is a parameterised object and the parameters are
on chain.

**The still image is the complement of the animation, not a thumbnail of it.**
`Sigil.sol` is a 4D projector written in Solidity. It takes the token's committed
orientation, turns sixteen 4-vectors by six Givens rotations, divides through by
distance along `w`, and emits SVG path data. So the animation shows *the section and
never the whole*, and the still shows *the whole and nothing you could stand inside*.
Both are computed from the same word. There is no off-chain renderer anywhere in the
pipeline, including for the marketplace thumbnail.

**Four elevations.** A 3D object has three orthographic views. A 4D object has four.
`quartet()` draws the same solid projected along x, along y, along z, and along w —
three of those are drawings that nothing three-dimensional could cast. It is exposed
as an ERC-7160 face, so a holder can pin it as the token's public face.

**Gzip, inflated by the browser's own decompressor.** The document is stored as gzip
bytes and `tokenURI()` emits a short loader that hands them to
`DecompressionStream("gzip")` — part of the web platform since 2023, so nothing is
fetched. This is not a micro-optimisation: it is the difference between **8.4M and
23.6M gas** to put the document on chain, and between a 70 KB and a 193 KB
`tokenURI` response.

**It opens itself, inside itself.** The Nest instrument calls `tokenURI()` on chain,
decodes the base64, raises a depth counter, and mounts the result in a frame
positioned in the same 3-space as the solid. The instance inside can do it again.

**It checks the contract rather than believing it.** Both of a token's ERC-6551
addresses are re-derived inside the frame — registry, implementation, chain, contract,
token id, through the page's own keccak and CREATE2 — and then compared against what
the contract reported. They have never disagreed. The point of asking is that a viewer
which only renders what it is handed cannot tell a correct answer from a convenient
one.

---

## The market — every token is its own exchange

A token can hold two assets and let **anyone** trade against them. The holder is the
sole liquidity provider: they put the inventory in, they set the fee, they take the
fee, they take it back out. Because the right to all of that is "whoever `ownerOf()`
says", **selling the NFT sells the exchange** — reserves, fee income and price curve,
in one transaction, with no migration.

**The curve is the solid.** The pool prices on constant product with *virtual
reserves*, and those come from how far the artwork has been turned through `w` — the
same three rotation planes that change the shape of the section:

```
solid barely turned    →  concentration 0       →  a wide, forgiving market
solid turned edge on   →  concentration 80,000  →  a tight market that holds its price
```

Spinning the section (`xy`, `xz`, `yz`) does nothing to the market, exactly as it does
nothing to the shape. Only the three planes that reach into `w` matter, to the picture
and to the price alike.

This is safe because it is still constant product with a change of origin: the
invariant is a hyperbola for every rotation a holder can commit, so no shape anyone can
make will bend it into something that leaks. The one thing virtual reserves genuinely
break is the promise that the pool can pay — a curve pricing against liquidity it does
not hold will happily quote too much. That is not solved by cleverness. The pool
refuses: no single trade may take more than half the real reserve, and it says so.

**The offsets are anchored, and a trade never moves them.** This is the subtle part,
and it was got wrong first. The virtual reserves used to be derived from the live
reserves on every quote — which sounds equivalent and is not. Offsets proportional to
live reserves re-anchor the curve after every trade, so `k` is conserved *within* a
trade and not *across* two, and buying then selling straight back extracts the
difference: at eight-times concentration and a trade worth a third of the reserve,
**400 units in came back as 718**. They are stored on the market now, written only by
`openMarket`, `deposit`, `withdraw` and `syncCurve`, and read by `swap`. Every write
emits `CurveAnchored`, so the one thing a trade must never do is visible in the log if
it ever happens.

That bug survived two test suites, because both recomputed `k` the same wrong way and
the 200-trade walk caps every trade at 2.5% of the reserve, where the fee hides it. It
was found the first time the stated properties were actually run against random inputs
— see `tools/fuzz.mjs`, which exists for that reason.

**The curve is a copy, not a live read** — and that distinction is a bug the test suite
caught. A token can be rented out under ERC-4907, and a renter may operate the artwork.
With a live read, a renter could concentrate a curve holding *someone else's* inventory,
trade through it at the improved rate, and hand the token back. So the market keeps its
own copy of the section word, only the holder can update it with `syncCurve()`, and
`pendingCurve()` reports when the two have drifted apart.

Deliberately absent: no LP shares (one provider per market removes share accounting and
the first-depositor attack, at the honest cost of not aggregating deep liquidity), no
oracle or TWAP (a curve its owner can move has no business being read as a price feed),
no flash loans.

## The website is the door, and the door is the token's

`tokenURI` was always a website — a whole WebGL2 application in a `data:` URI.
What was missing is somewhere to **stand**: a place to open the instrument you
own, and a place where the objects can talk to each other.

`Premises` is an ERC-5219 contract, so a `web3://` client reaches it with no DNS
at all:

```
web3://<premises>/                      the door: the 4-polytope itself, its
                                        eight vertices the site's eight doors,
                                        with the terminal as its voice
web3://<premises>/terminal              every function, one line at a time —
                                        window.TERM.run() for agents
web3://<premises>/swap                  any ERC-20 with a v3 pool, against the
                                        chain's own Uniswap
web3://<premises>/gallery               the collection, wearing its stills
web3://<premises>/launch                a v4 launchpad: fixed-supply token,
                                        mined hook, pool — sliders included
web3://<premises>/hook/0x…              what a hook's address already says,
                                        read with no call at all
web3://<premises>/lock                  the vault: tokens in, a date on a bar
                                        (up to ten years), no early exit
web3://<premises>/projector             the 4-D renderer, free for anyone:
                                        any word, any seed, the picture
web3://<premises>/seal                  the three seals: soulbind, account,
                                        kernel
web3://<premises>/keys                  session keys: scoped, expiring
web3://<premises>/name                  bind an ENS name to a token
web3://<premises>/estate                succession (a token that outlives
                                        its holder) and consignment
                                        (escrow with a floor)
web3://<premises>/chat                  the commons: one room, every token in it
web3://<premises>/rooms                 the groups this token has entered
web3://<premises>/room/3                one group
web3://<premises>/dm/42                 the room two tokens share
web3://<premises>/open                  every market that exists, from the pool's list
web3://<premises>/token/42              one token's counter
web3://<premises>/token/42/market       the swap card
web3://<premises>/token/42/pool         the holder's side: inventory, fee, bond
web3://<premises>/token/42/rent         lease the instrument by the day
web3://<premises>/token/42/vault        the two hands: give, draw, verify
web3://<premises>/token/42/live         the instrument, on a real origin
web3://<premises>/token/42/services.json  all of it, machine-readable
```

A name resolves to it through ERC-6821: set the **`contentcontract` TEXT
record** on the ENS resolver to the Premises address — plain `0x…`, or ERC-3770
chain-scoped as `eth:0x…` — and `web3://ipseity.eth/chat` reaches this contract
with no DNS in the path. Not `contenthash`: ERC-6821 deliberately uses a text
record you can read off a block explorer. With the record unset a client falls
back to the name's ordinary ERC-137 address, so pointing the name straight at
the contract works too.

A gateway is a convenience for everyone else, and stays a convenience: when it
is down, the tokens are unaffected.

**The door.** Open it in a browser with a wallet, press connect, and the page
reads `balanceOf` and walks `tokenOfOwnerByIndex` — so it learns what you hold
from the collection rather than from a list somebody keeps. Every token it finds
gets a row: open its instrument, open its counter, open its messages. `/live`
exists precisely so that instrument runs on a real origin, where EIP-6963
discovery works and the wallet injects — a `data:` frame has an opaque origin and
can be looked at but not used.

The gate in front of the composer is a **courtesy, not a lock**, and the page
says so. Everything behind it is a log on a public chain; there is no version of
this where holding a token is what lets you *read*. What holding a token buys is
the right to *write*, and that is enforced in a contract, where enforcement means
something, rather than in a page, where it would mean a CSS class.

### What one token will do for a stranger

| service | what anyone may do | who is paid |
|---|---|---|
| **trade** | swap against the token's own two-asset market | the token, as a fee |
| **rent** | operate the instrument by the day — turn the solid, commit orientations — never sell it | the token, as rent |
| **give** | pay into a vault with no spend function in its bytecode | the token, permanently |
| **draw** | call the on-chain 4D projector with any word and any seed | nobody, it is free |
| **verify** | check a signature the token made as itself | nobody, it is free |

Before this, exactly one of those was reachable by a stranger. A collection of
four thousand autonomous objects that between them offered the public a single
service was not a network of businesses; it was four thousand paintings with a
vending machine bolted to one wall.

### Renting, and why it needed a new capability

ERC-4907 has been in the token since the beginning, and the line it draws was
already the interesting part: `onlyOperator` includes the user, so a renter may
turn the solid and commit orientations — may *drive the instrument* — and may
never sell it. That was a rental with no price and no way for a stranger to ask.

`Lease.sol` is the counter. What it needed from the token was the power to set
the ERC-4907 user, and the obvious way to grant that is an ERC-721 approval —
which is wrong, because **an approval carries `transferFrom` with it**. Handing a
rental contract the right to sell your token so that it can lend your token is a
capability an order of magnitude wider than the thing it authorises, and this
collection has spent its whole design arguing against exactly that: the Grip has
no spend function, the seal denies by default, the manifest is measured rather
than enumerated.

So the narrow power got its own name. `leaseAgentOf` is a per-token address the
holder sets; the named agent may set the user and nothing else. There is no
blessed singleton and no curator involvement, so a better lease market is one
transaction away — and it is cleared on transfer, because a buyer inherits a
token, not the seller's arrangements about it.

**Rent accrues to the token, not to the holder.** Same rule the market already
runs on: fees land in the market's reserves, so selling the NFT sells the
exchange. Sell mid-term and the unpaid rent goes with it, because the business
was never the seller's. There is no protocol fee, no treasury address, and no
switch to add one.

**A lease that is cut short refunds.** A transfer clears the ERC-4907 user — that
was always right, and was harmless while renting was free. With money on the
table it is a way to take some, so rent is escrowed and vests over the term: run
to the end and it vests whole; broken early and the elapsed fraction is the
token's while the rest is the renter's to reclaim. Nobody declares a lease
broken. It is read off the token, from the expiry the token still carries.

### The manifest, for things that are not people

A website whose services can only be used by a person clicking is half a
website. `/token/42/services.json` is the same shopfront, generated by the same
contract from the same reads in the same block, listing every service with its
price, its live status, and **the selector of the call that invokes it**. A
caller holding that selector needs an RPC endpoint and nothing else — no
indexer, no subgraph, no API, no documentation site, no continued existence of
this contract. That is the smallest a dependency gets.

### The pages are an exchange, not a spec sheet

The first version was honest and nobody could have used it. "Approve the pool
first" was a sentence rather than a button. "Amounts are integers in the token's
own smallest unit" asked a visitor to type `1500000000000000000` and to know that
the number of zeroes depends on which token they picked. The floor a trade would
accept had to be worked out by hand, in those units, before the quote was known.

So `/token/42/market` is a swap card: type an amount, watch the quote arrive from
`Pool.quote` at the block you are looking at, set a slippage tolerance and the
floor is computed for you, and press a button that says which of the two
transactions it is about to send. The approve-then-swap step is the one most
front ends hide and the one most worth showing, because a person who does not
know it is two transactions will think the first one failed.

`/token/42/pool` is the other side, which the site did not have at all: add and
remove inventory, set the fee, bond the market, and sync the curve to the
artwork. One provider per market is what keeps it short — no LP shares to mint,
no proportional-deposit maths, no first-depositor attack, no position NFT. The
holder puts assets in and takes them out, and whoever holds the token is the
holder.

`/token/42/rent` is both sides of the rental counter: a renter picks days and
sees the exact wei, a holder names their lease agent, publishes terms, collects,
and ends a lease properly. The holder's controls render for everyone and are
refused by the contract for everyone else — hiding them would mean the page never
told you the instrument has an owner who decides these things.

## The tokens talk to each other

Every other messaging system for NFTs is a server with a wallet button on it. The
message goes to a database, the database decides who may read it, and the token
is a login. Turn the database off and the conversation was never there.

`Parley` has no database. A message is a log, the log is the archive, and the
archive is wherever the chain is. There are three kinds of room:

| room | key | who may write |
|---|---|---|
| **the commons** | `0` | every token in the collection |
| **a group** | `keccak(1, n)` | its members; founded by a token, joined by invitation or an open door |
| **a pair** | `keccak(2, min, max)` | exactly those two tokens — never founded, it exists the moment either uses it |

### The part that is actually hard

Logs are cheap to write and famously miserable to read. `eth_getLogs` over a
range wide enough to hold a conversation is the first request a public endpoint
rate-limits, and the usual answer is an indexer — a server, which is the thing
this collection exists not to need.

So **every message carries the block number of the message before it**, and the
room stores where the newest one is. A client reads `last`, asks for exactly that
one block, gets the message and the pointer to the block before, and walks.

```
stateOf(room).last ──▶ block 21_000_405 ──▶ prev 21_000_005 ──▶ prev 21_000_000 ──▶ 0
```

Forty messages is forty **single-block** queries — the narrowest request
`eth_getLogs` accepts — and no range scan at any point. The chain is the index.
It costs one `SSTORE` to a warm slot per message to make it so. The harness
measures this rather than asserting it: 405 blocks of history, read in three
queries, and every query in the shipped client checked to have `fromBlock ==
toBlock`.

The same back-link runs through a token — `lastSpoke[id]`, and `prevFrom` in the
event — so "everything this token has ever said, anywhere" is the same walk down
a different chain.

**The guard that makes it terminate.** Two messages in one block is the case that
breaks a naive walker: the second one's pointer *is* its own block, because the
head had already moved, and a client that followed it asks the node for the same
block forever. The walk follows the **oldest** log in a block, whose pointer is
necessarily earlier. `tools/verify-parley.mjs` asserts that it terminates *and*
runs the naive version to watch it loop, because a rule nobody has seen fail is a
rule nobody knows they need.

### Who is allowed to be a token

The owner, and the token's own ERC-6551 account. **Not the renter.** Leasing the
instrument buys its use for a while; it does not buy the right to speak in its
name, and a reputation is not a thing you can hand back at the end of the day.
The bound account is included because it is the token acting for itself — its
session keys are the owner's own delegation, made narrowly and revocably.

### A list a stranger can grow is a list a stranger can fill

`roomsOf(token)` is the only unbounded array in the protocol, and the reason it
is safe is a design choice rather than a limit: an invitation **records
permission**, and joining is the token's own transaction. A steward cannot push a
token into a room. Nothing anybody else does makes your list longer.

Eviction is the matching restraint in the other direction. A steward can show a
token the door, and cannot delete a message, edit one, or stop anyone reading —
those are not powers this contract has to give.

### Addressed is not private

A pair room is derived from two token ids, so anyone who knows two numbers can
read every byte of it. That is what a public chain is, and the page says so in
those words rather than calling it a DM and hoping.

`announce(token, x, y)` is the answer: a token publishes a P-256 point, and a
client that finds one on both sides of a pair derives a shared secret with ECDH
in the browser, seals the body with AES-GCM, and sends ciphertext. `kind` says
the body is sealed; the contract cannot read it, and neither can anybody else
with a node. **The registry is deployed and the sealing client is not yet
written** — so today a message marked sealed is one this client will not pretend
to render, and every plain message is exactly as public as the chain it is on.

### What the client will not do

Three refusals, each for a reason:

**No keccak.** A page that hashes its own event signatures is a page you have to
audit a hash function in. `Parley.topics()` returns them, derived on chain from
the same signature strings the compiler hashes, and they arrive in the config
block already computed. Same for every selector.

**No `innerHTML` for anything that came off the chain.** A room name and a
message body are chosen by whoever sent them, and these pages run on the same
origin as `/token/<id>/live`, where a wallet is injected. Every string that came
from a log or a call reaches the DOM through `textContent`. There is no escaping
function to get wrong, because there is no place a mistake could be made — and
the site verifier sends `</script><img src=x onerror=alert(1)>` through the real
client and checks that the element it lands in has no children and was never
assigned markup.

**No range scans**, for the reason above.

### What this replaced

An earlier version of this site was a Uniswap front end: swap, pools, limit
orders as range orders, an explore page with a chart drawn in Solidity, an
ERC-4626 vault reader, a governance page, and a v4 launchpad that mined hook
addresses with a `view` function. All of it worked and all of it is in this
repository's history.

It was the wrong site. A collection whose thesis is that *each token is its own
exchange* does not need to be a worse front end for somebody else's, and a
website whose job is to be the door to an instrument should not spend nine tenths
of itself on trading pairs the instrument has nothing to do with. What the tokens
did not have was a way to reach each other. Now they have one, and the site is
the door.

One card came back, deliberately smaller. `/swap` is a single exactInputSingle
card against the chain's own Uniswap v3 — no pools page, no orders, no
governance reader — because "trade a tokenized stock for ETH" is a thing a
door should be able to do without becoming a trading floor again. It checks
the pool for whatever address you paste rather than carrying a token list,
so anything with v3 liquidity on that chain trades, and anything without gets
an honest "no pool". The same contracts deploy per chain from one wiring
table (the four v3 addresses differ on Base, which is exactly why the table
exists), and the door's chain switcher moves the wallet between them —
moving *value* between chains is a bridge's job, and this site will never
quietly be one.

The launchpad came back too, and it is the honest version of the thing the
coin pourer was a sketch of. `/launch` walks four transactions with every
choice on a bar or in a box: a fixed-supply token with no owner (signed by a
token of this collection you hold), a v4 **hook** whose address is mined by
your own node under `eth_call` — v4 puts a hook's permissions in the low
fourteen bits of its address, so deploying one means searching CREATE2 salts,
and a `view` function does it for free — then the pool itself, six flat
words to the chain's real PoolManager. The shipped hook is a `Gate`: trading
opens at one time, liquidity unlocks at another, both immutable, so "locked
until" is enforced by the pool rather than promised. `/hook/<address>` reads
any hook's powers off its address — the bits are the mechanism, not a claim
— and says the unreassuring half out loud: a lock and a trap have the same
address shape. And `/lock` is the vault: any ERC-20, a slider that runs to
ten years, no owner, no rescue path, extend-only — the amount recorded is
the amount that arrived, and the only key is the clock. A lock is also a
*position*: `give` hands the claim to any address without moving the date,
and handing it to a token's own account makes a locked treasury travel with
the token when the token is sold. Where a token speaks EIP-2612, one
signature replaces the approve press, and a permit that dies falls back to
the two-press flow instead of taking the lock down with it.

Three more things came across from a sibling of this project
(`venividis/Launchpad-nft`, the Tesseract branch), each rebuilt to this
site's rules rather than copied. The **Nameplate** is an ENS resolver with
nobody's hands on it: bind a name you own to a token you hold and the name
answers with the token's account, the sigil as its avatar, and — the record
Tesseract's resolver never had — ERC-6821's `contentcontract`, so a
web3:// browser resolves the name straight into this site with no IPFS
pin and no gateway; claim the wildcard parent once and `7.yourname.eth`
is token 7's address forever. And the DMs learned to **seal**: Parley has
carried a kind byte and a per-token P-256 point since it was written, and
the missing client half now exists — the key is derived from a wallet
signature (the same key in every browser, nothing to back up), the public
point is recovered through WebCrypto's own import (no curve arithmetic
shipped), and what crosses the chain is AES-GCM ciphertext that renders as
"sealed · N bytes" to every wallet but the two that share the room.

## Security

Approached the way the Dave Held core approaches it: write down what must be
true, then attack it. [INVARIANTS.md](INVARIANTS.md) lists one hundred and thirty-nine such
statements and names the test for each, plus thirteen known limitations that are
documented rather than defended.

Writing an invariant down is not the same as running it. Nine of these were
stated as Foundry `testFuzz_` properties and had never been executed, because
Foundry cannot be installed in this environment. `tools/fuzz.mjs` runs them
here instead, against the real contracts on a real EVM with a seeded generator
and a shrinker — and the first serious run found a leak in the pricing that
both existing suites had passed over. The details are under *The market* above,
and the fix is in `Curve.anchor`.

Nor had the other sixty-four Solidity tests. `tools/forge.mjs` now runs all 73
of them by supplying the pieces Foundry would: a cheatcode precompile at the
address `forge-std` points `vm` at, VM hooks for `prank` and `expectRevert`,
and a block header that is not frozen so `warp` can move the clock mid-call.
Running them found a four-term Taylor series where the projection needed six.

The lesson from building it is the one worth keeping. Its first version
reported 72 passing tests while executing no EVM code whatsoever — funding the
test contract erased its code, so every call succeeded having done nothing. A
deliberately-failing control is what caught it, and the runner now refuses to
report on the suite at all unless it can watch a contract made only of `REVERT`
revert *while burning gas*, because an empty account also does not revert.

**A seven-day timelock.** `src/lib/Timelock.sol` is meant to own every
privileged path. Not because a delay makes a bad change good, but because it
makes one *visible* before it lands. The threat model is a stolen key, not a
dishonest curator: without a delay a compromise is an instant loss discovered
afterwards, and with one it is a queued transaction sitting in public for a week
with its full calldata in an event. Adapted with three changes — the admin can
rotate but only through its own queue, queued operations expire after a
fortnight so a forgotten proposal is not a live weapon, and an eta cannot be
re-queued out from under a watcher.

**Privilege never moves in one step.** Both the collection's curator and the
market's admin hand over by propose-and-accept. A one-step transfer to a
mistyped address is how a collection loses its admin permanently; this deviates
from a literal reading of ERC-173 and says so.

**The vault seals too.** ERC-6551 makes the registry canonical and the
*implementation* a parameter. Most collections pass the reference
implementation and inherit its one structural gap: the holder can empty the
vault between agreeing a price for the token and settling it. This one passes
`src/IpseityAccount.sol` instead, which carries the same ratcheting promise the
market does.

How "nothing leaves" is enforced matters more than that it is. Not by listing
the calls that move assets — that list cannot be completed, because `transfer`
is on it but so is any protocol's `withdrawTo`, `redeem`, `exit`, or a function
nobody has written yet. The account **measures**: it records its balance of
every manifest asset before a sealed call and checks that none fell after. What
the call did is irrelevant; what is left is not. The suite proves this with a
drainer whose function name was invented for the test and appears on no list
anywhere.

Measurement has exactly one blind spot, and it is covered separately: an
approval moves nothing at the moment it is granted, so the loss lands in a later
block where no same-transaction check can see it. So while sealed, approvals,
ether transfers and ERC-1271 signatures are refused outright — those being the
three authorities whose effect escapes the measurement window.

A sealed vault can still act. Anything that leaves it no poorer goes through,
because a vault that cannot act is a safe.

**The other hand.** Look at what the seal cost: a manifest, a snapshot, a
verification pass, an approval blocklist, a delegatecall ban, an ERC-1271
refusal, and a documented blind spot for assets nobody thought to list. Every
one of those exists because the capability to spend exists and is being
policed.

So every token has a **second** ERC-6551 account, at a second salt, running
`src/GripVault.sol`. It receives and it does not spend. There is no `execute`,
no withdraw, no sweep, no rescue, no owner override, no admin — read the ABI:
there is no function on that contract that moves an asset out of it, for
anybody, ever. Nothing is policed because nothing is possible, and the test
for it is an assertion against the compiled ABI rather than a list of attacks
that bounced.

Two hands, on purpose. The **Reach** is working capital: it acts, and it is
guarded. The **Grip** is what a buyer prices the token on: `holdings()` there
is a floor rather than a snapshot, because the seller has no function with
which to move either number between a handshake and a settlement. Market
inventory is a third case again — it has to stay liquid, so it lives in
`Pool.sol` behind a time-boxed bond. Three places, three different promises.
The shape is the Gate from the CONGREGATION meld design: *Grip → Reach:
never. No function exists.*

The cost is stated in `INVARIANTS.md` rather than buried: a Grip is permanent,
there is no burn, and a mistaken transfer into one is a permanent mistake.

**The voice, and the wall that survives it.** A sealed vault used to return
zero to every signature. Safe, and wrong: an account that cannot sign anything
for a year cannot prove to a counterparty that it is the thing holding what it
holds, which is half of what this collection claims a token is.

The fix is domain separation rather than omission — the best idea in the DAVE
V2 audit, and it applies here exactly. Unsealed, the account validates any
digest its holder signed. **Sealed, it validates only digests it can rebuild
itself**, under its own EIP-712 domain (`IPSEITY_ATTESTATION`,
`verifyingContract` = the account), with the caller obliged to hand over the
preimage so the account reconstructs rather than trusts. Every venue hashes its
orders under its own domain separator, so an order hash can never be the output
of `attestationDigest`. A sealed vault is not *forbidden* from signing its
assets away — it is *incapable* of it. There is no allowlist to maintain and
none to get wrong.

**Session keys, for something that is not you.** A holder can grant a bounded
key to a bot, a keeper or a model without handing over the token. Four bounds,
all checked on every call: an expiry it cannot extend, a target allowlist and a
selector allowlist it cannot widen, and a cumulative spend cap it cannot raise.
Revocation is one transaction, immediate and unilateral.

Three escalations are refused by *shape* rather than by budget, because bounds
are only worth what the first move cannot undo. A session cannot call the
account (otherwise its first act is granting itself a session with no limits).
A session cannot approve a spender that is not itself on the target allowlist —
`approve` is called *on* the token contract, so allowlisting the callee says
nothing about who is being trusted, and the argument has to be checked. And a
session cannot touch the Grip, which nothing enforces because there is nothing
to enforce. The seal composes on top: a session is never more trusted than the
person who granted it. See [AGENT.md](AGENT.md).

**The bond.** "Selling the token sells the market" is mechanically true the
moment `ownerOf` changes and worth nothing to a buyer on its own — the seller
can empty it between the handshake and the settlement. So a holder may bond a
market: a date before which nothing leaves and no term changes. It ratchets, it
survives the sale, and while it holds there is no withdrawal, no closure, no fee
change and no curve re-shape. Deposits and trades still work, because those are
additive. Taken from the Dave Held stall bond, whose invariant reads
*"bondUntil never decreases, and no exit path exists while it holds"*.

**No admin path can move an asset.** The market's five admin entry points are
`setPaused`, `bless`, `setAllowlistEnforced`, `proposeAdmin` and `acceptAdmin`.
Not one takes a token id or an amount, so not one can name a thing to move —
asserted against the compiled ABI rather than by reading the source. The worst a
stolen admin key achieves is a market that will not trade.

**The pause never traps money.** It halts trading and deposits. `withdraw` has
no pause modifier and is reachable in every state, because a pause that traps
money is a slower theft.

**Markets open only on blessed tokens**, while enforcement is on. A market is a
promise to strangers, and a token contract that lies about its own balances
breaks every guarantee above it. This is the Dave Held Granary pattern — *"silos
are timelock-blessed only"* — and it is a real centralisation trade-off, stated
rather than hidden.

### Read against the DAVE V2 audit

A v2 audit of a different collection — a covenant NFT with a 6551 vault, a
conviction pool and an on-chain website — was reviewed against this one. Its
findings are good, and the useful thing was that most of them **did not
transfer**, for reasons worth stating.

**C1, a single bag bricks the exit — applies inverted, and that was the find.**
Dave's ragequit hard-requires a transfer from every listed token, so one token
that reverts freezes the only exit from a four-year seal, and a stranger can
put that token on the list for dust. Here `guard` is holder-only, so nobody can
aim it, and `_balance` already used a staticcall so nothing bricks.

But the staticcall returned zero on failure, and the comment beside it claimed
that "can only ever tighten the check". **That was wrong.** A token that stops
answering reads as zero *before and after* a call, so `now < pre` is false and
the seal quietly stops promising anything about it — no revert, no event, no
signal to a buyer. Same root cause as Dave's brick — a measurement that does
not distinguish *answered zero* from *did not answer* — and the opposite
failure. Now the two are separate, `unmeasurable()` names every asset that has
fallen out of the promise, and an asset readable before a call and not after
reverts rather than shrugs.

**C2, a stranger fills the roster — does not apply, but half of it did.**
`guard` is `onlySigner`, so the attack is not available. The append-only part
was still a real cost: sixteen slots, no removal, and the manifest travels with
the token. `unguard` now exists, and reverts for everyone while sealed.

**C3, 1155 batch receiver missing — does not apply.** Both accounts already
implement `onERC1155BatchReceived`, and both `supportsInterface` answers are
already complete. The Grip's omission of `0x51945447` is deliberate and
documented.

**M1, no reentrancy guard — did not apply, added anyway.** Ownership already
stops the re-entry: a token called from inside `_act` that calls back arrives
as itself, not as the holder. But the thing being protected is a snapshot taken
around an external call, and this contract can never be redeployed — its
address is an input to every vault's address. On code that is final, cheap
insurance against a class of bug beats the gas.

**M2, ERC-1271 by domain separation — applies fully, and is the best idea in
the document.** This vault returned zero to every signature while sealed, which
is exactly the omission the audit criticises. See *the voice* above.

**C4, the website is one DNS record — does not apply, and could not.** There is
no hostname in this bytecode, no `fetch`, and no `new Function` over remote
bytes. One sub-point does land: the audit is right that serial on-chain
assembly grows quadratically and eventually exceeds the `eth_call` cap. This
collection's `tokenURI` read is **19.98M gas against geth's 50M default `eth_call`
cap**, and `tokenURIs()` had already crossed it at 55.19M before this cycle brought
it back to 37.05M. That margin is measured on every run by `tools/gas.mjs`, which
fails the build rather than reporting it, and it is the number to watch.

### What was deliberately not taken from it

**Serving the artwork over a wire** — the chunked file store, the SHA-256
integrity manifest, the multi-transport loader, the compression codec. All of
that solves shipping a large application over a network and proving it arrived
intact. The artwork here does not travel over a network: it is a self-contained
`data:` URI out of contract code. Adding an origin server to remove a hostname
is a step backwards, and the chunk-integrity design is elegant precisely
*because* bytes arrive over a wire. Nothing here does, so there is nothing to
verify.

**ERC-5018 and ERC-7087** — a filesystem interface and MIME negotiation for a
contract that serves three routes and one content type each. Standards earn
their bytes by being consumed.

**ERC-7066 lienholder locks.** ERC-5192 is already here and `locked()` is the
part marketplaces read. ERC-7066 adds a third-party locker for lending against
the token — a capability with no consumer in this collection. Shipping the
surface before the desk is how immutable contracts accumulate attack surface
that never earns its keep.

**ERC-4494 permit.** Considered and declined. The audit's justification is "a
sale should be one transaction", which is a property Dave's covenant claims and
this one does not. External marketplaces use `setApprovalForAll`, 4494 adoption
is thin, and it would add a signature-verification surface plus ~1.5 KB to a
contract that can never be redeployed. If a desk here ever needs it, it needs
it for a stated reason.

**`setTrait` reverting unconditionally.** Right for Dave, wrong here. Its
traits are pure functions of covenant state, so a settable one could be false.
This collection's only settable trait is `hue`, which is genuinely holder
state — part of the section word the artwork exists to let you edit. Reverting
would remove a real function to make a point that does not apply.

**ERC-2309, ERC-721A, the royalty splitter doctrine.** No batch mint, a
different base, and no 69/31 split to obey.

## The front door

Every token is already a website — `tokenURI` hands back a WebGL2 engine, a
keccak, an ABI coder and a wallet client, out of contract code, fetching
nothing. What was missing was somewhere to send a person who does not own one
yet.

`src/Premises.sol` is an **ERC-5219** contract: `request(resource, params)`
returns a status code, a body and headers. An **ERC-4804 / ERC-6860** client
reaches it with no DNS and no server —

```
web3://<premises>/               the index
web3://<premises>/token/42       one token
web3://<premises>/token/42/raw   that token's tokenURI, plain
web3://<premises>/token/42/live  the instrument, on its own origin
```

— and an ERC-6821 `contentcontract` record makes that a name. An HTTP gateway is a convenience
for everyone else, and a convenience is exactly what it should be.

**The constraint is the design.** Premises never serves the artwork. It serves
a document that *names* it, emitting the token's own `data:` URI read from the
hub at request time. The suite asserts that byte for byte: what the page hands
a viewer equals `tokenURI(id)` exactly, and the contract's deployed code
contains none of the document.

Be exact about what that buys. Premises composes the page, so a compromised
Premises could put anything in that frame — no assertion prevents that. What it
buys is that **the artwork is untouched**: the bytes are in the collection,
anyone can call `tokenURI` directly, `/raw` hands back the URI to check against,
and every token renders identically whether this contract exists, is abandoned,
or is replaced. The index is convenience, and nothing depends on it. That is the
difference between a front door and infrastructure, and it is why this one is
safe to have where a hostname in immutable bytecode is not.

**`/live` is the route that makes it usable.** A `data:` document gets an opaque
origin and wallet extensions do not inject into one — so the instrument in the
frame renders perfectly and cannot connect to anything. It can be looked at, not
used. `/token/42/live` serves `Renderer.document(...)`, the same bytes one step
before base64, as a first-class HTML response on a real `web3://` origin, where
EIP-6963 discovery works and the twelve instruments do what they were built for.
The suite asserts those bytes equal what `tokenURI` base64s.

No state-changing function at all, and a request for nonsense is a 404 rather
than a revert.

---

### What was deliberately not taken from the Dave Held core

The Dave Held core is twenty-one DeFi desks. Porting them into an artwork would
be reckless, so the teardown asked of each mechanism: *what guarantee does this
serve, and does anything here make that promise?*

**The selector firewall** — refusing transfer-family selectors by shape while a
vault is sealed — was initially skipped on the grounds that IPSEITY's vault made
no promise, so the firewall would guard nothing. Adding the seal created the
promise, and the question came back. The answer, on a second look, is that the
firewall is *not* the mechanism: a selector list only blocks the words it knows,
and the drainer in `tools/verify-vault.mjs` walks straight past any such list.
Measurement is the mechanism. The firewall survives as a second layer covering
one specific case — approvals — because that is the case measurement is blind
to. Dave Held's Chambers has both for the same reason, and their hardening pass
(finding S1) is a record of learning it.

**The covenant seal, ragequit tax, tranches, rank engraving, Harberger keeper
seats, perps, RWA lots, options, bonds, strips, restaking, basket funds** —
skipped. Each is a product, not a safety property, and none of them is this one.

**The stall curve library** (FLAT / LINEAR / EXPO) is skipped for a specific
reason rather than a general one: this collection's curve comes from the
artwork, and a second, unrelated family of curves would either contradict that
or sit unused.

---

## The instrument

Twelve nodes on two counter-tilted shells. Six are open at mint — the ones that only
look. The six that move value stay sealed until a holder deliberately opens them.

| | | |
|---|---|---|
| **Self** | reads the token out of the contract that rendered the page | open at mint |
| **Rotate** | six plane dials; three of them change the section's shape | open at mint |
| **Section** | choose the solid, the cut along `w`, and the hue | open at mint |
| **Scan** | block, fees, balances, bytecode, arbitrary storage slots | open at mint |
| **Vault** | the ERC-6551 account, derived by CREATE2 rather than asked for | open at mint |
| **Nest** | the token, inside the token, one section deeper | open at mint |
| **Send** | native value, from your wallet or from the token's own account | sealed |
| **Assets** | ERC-20 reads and transfers | sealed |
| **Call** | any signature, any contract, encoded in the frame | sealed |
| **Sign** | `personal_sign` and EIP-712, with the digest computed locally | sealed |
| **Issue** | the token mints its siblings | sealed |
| **Market** | this token's own exchange: quote, trade, bond, add or take inventory | sealed |

Drag to orbit. The slider under the field moves your 3-space along `w`. The six chips
are dials — drag one to turn in that plane, click to set it spinning, double-click to
reset. `xw`, `yw` and `zw` are drawn dashed because those are the ones that reach
out of the space you are standing in. Press `/` for every command in one list.

**Nothing is signed without showing the bytes first.** Every transaction is
rebuilt from its signature, split into 32-byte words with each argument decoded
beside it, priced with `eth_estimateGas`, and put in front of you in a plain
sentence before the wallet is ever asked.

---

## Standards

Recomputed from the function selectors rather than copied. `tools/selftest.mjs`
derives them with the engine's own keccak; `test/Ipseity.t.sol` asserts the contract
answers to each.

| | ID | Why |
|---|---|---|
| ERC-165 | `0x01ffc9a7` | everything else is discovered through it |
| ERC-721 + Metadata | `0x80ac58cd` `0x5b5e139f` | the thing itself |
| ERC-721Enumerable | `0x780e9d63` | bounded supply, so the per-transfer index cost is affordable |
| ERC-2981 | `0x2a55205a` | royalties, 5%, capped at 10% forever in code |
| ERC-4906 | `0x49064906` | fired on every commit, or a dynamic token looks frozen to every indexer |
| ERC-4907 | `0xad092b5c` | the borrower may **operate** the instrument but not sell it |
| ERC-5192 | `0xb45a3c0e` | a holder may bind the token to themselves, and unbind it |
| ERC-6454 | `0x91a6262f` | the same flag `locked()` reports — one source of truth, never two |
| ERC-7160 | `0x06e1bc5b` | the instrument, the sigil, the quartet; the holder pins one |
| ERC-7496 | `0xaf332f3e` | traits readable without parsing a 60 KB data URI |
| ERC-7572 | `0xe8a3d485` | collection metadata, also fully on chain |
| ERC-173 | `0x7f5828d0` | how a marketplace decides who may edit the collection page |
| ERC-6551 | consumed, not implemented | two bound accounts per token, at two salts, derived by CREATE2 |

**ERC-4906's identifier is a magic number.** Its interface is events only, so
`type(IERC4906).interfaceId` is `0x00000000`; the EIP fixes it by fiat at
`0x49064906`, which spells the EIP number twice. Contracts in the wild register the
zero. This one hardcodes the right value.

**ERC-7572 does not define an interface ID.** `0xe8a3d485` is simply
`bytes4(keccak256("contractURI()"))`. Registering it is harmless and nothing queries
it; it is not a spec-stated value and this document does not claim otherwise.

### Deliberately not claimed

**ERC-7857 (iNFT).** The *mechanism* is built, in the token itself, and the
*conformance claim* is deliberately withheld. Both halves of that are on purpose.

Built, because once the collection grew session keys it grew a secret worth
protecting. Not what an agent may do — that is on chain, bounded and public, and has
to be, or nobody can price the token — but **how it decides**: the prompt, the
thresholds, the strategy. That is valuable, worthless once public, genuinely part of
what the token is, and useless to a buyer unless it is re-sealed to them. Which is
precisely and only what ERC-7857 is for. So a token may carry a payload named on
chain only by hash and sealed to a key its holder controls, and `transferWithKernel`
moves the token and the re-sealing together, gated on a proof checked against *this*
token's hashes.

The part worth building is the seam. `transferFrom` still exists — remove it and the
token stops being an ERC-721 — and an ordinary transfer moves the token while leaving
the payload encrypted to the seller. Nothing is violated; the buyer simply owns a
pointer to a ciphertext they cannot open, and no event says so. So `kernelStatus()`
compares the owner the kernel was sealed under against `ownerOf` at read time: an
ordinary transfer reads **STALE**, with no hook, no gas, and no cooperation from a
seller who would rather it went unmentioned. It surfaces in the ERC-7496 trait too.
`kernelStatus` and `kernelProved` are separate questions so a client cannot merge
"there is a kernel" with "somebody checked it".

Not claimed, for four reasons. The specification's normative entry points are
`iTransfer` and `iClone(…, TransferValidityProof[])`, and these are not those
functions — a client written against the standard would not find them. It defines no
ERC-165 identifier, so there is nothing to register or detect, and anything
advertising 7857 through `supportsInterface` is advertising something the standard
does not define. Its premise — that the valuable metadata is encrypted and lives off
chain — is the exact inverse of a work whose whole claim is that nothing is fetched,
so it is applied to the agent's disposition and never to the artwork. And the
re-seal proof requires a TEE attestation or a ZK circuit that this collection does
not ship: `verifier` is zero, `hasVerifier()` says so, `kernelProved()` is false for
every token, and `transferWithKernel` on a live kernel **reverts** rather than
waving it through. A stub would let a marketplace draw a green check nobody checked
— and it would be permanent, because `setVerifier` may be called once, from zero,
and never again. A rotatable verifier is not a verifier: whoever can swap it can
install one that approves anything.

The full design, and the answer to what an agent can and cannot be given here, is in
[AGENT.md](AGENT.md).

**ERC-7007 (AIGC-NFT).** Requires a model and a verifier that do not exist here.
There is no inference in this pipeline; the image is a deterministic function of a
256-bit word, and `verify()` would be a tautology.

Also considered and skipped: ERC-5484 (forbids metadata change, contradicts 4906 and
7496 simultaneously), ERC-721C (a mutable pointer to off-contract transfer policy is
the antithesis of a permanent artifact), ERC-5643, ERC-5773, the deactivated OpenSea
Operator Filter Registry.

---

## The numbers

Measured, not estimated — every figure below comes from `node tools/verify.mjs`,
which deploys the whole collection into an EVM at Cancun and reads it back.

```
document, as written                173,261 bytes
after minifying                     113,379 bytes    65.4%
stored on chain (gzip)               39,501 bytes    22.8%      3 shards

deployment (6 contracts)              12.80M gas
loading the document                   8.86M gas
                                     ─────────
total to launch                       21.65M gas

mint                                   0.19M gas
commit a new orientation               0.05M gas
```

Storing the document as plain text instead costs **23.58M gas** to load and makes the
`tokenURI` read far heavier. Both modes are implemented and both are verified; packed
is the default because it is what makes the document deployable without fighting the
per-transaction gas cap.

### What a read costs, and who will run it

A view function costs nobody any ether, which is exactly why it is easy to write one
nobody can call. `eth_call` is executed by a node, and every node caps how much work
it will do for a call it is not paid for — geth, erigon and reth default to a 50M
`--rpc.gascap`, nethermind to 100M, and hosted providers vary and are often lower.
Past that ceiling the node answers "out of gas", which a marketplace cannot tell
apart from a broken token.

`node tools/gas.mjs` measures every read against those ceilings and fails the build
if any of them goes over 50M. It runs in `npm run check`.

```
tokenURI()                   19.99M gas   103,808 B    the pinned face
tokenURIAt(id, 0)            19.94M gas   103,808 B    the instrument: the whole GUI
tokenURIAt(id, 1)             3.32M gas     8,096 B    the still: one sigil
tokenURIAt(id, 2)            13.72M gas    17,056 B    the quartet: four sigils
tokenURIs()                  37.06M gas   129,088 B    ERC-7160: every face at once
contractURI()                 0.28M gas     2,720 B
viewOf()                      0.01M gas       544 B

Premises /token/1/live        4.48M gas    54,432 B    the same page, over ERC-5219
```

Two things in that table are worth saying plainly.

**`tokenURIs()` was broken and nobody knew.** It cost 55.19M — above the 50M that
geth, erigon and reth all use by default, which means the ERC-7160 function that
returns every face was not callable on a correctly configured archive node, let
alone a hosted one. It is 37.06M now. The fix was not a smaller document; it was
three pieces of arithmetic that were being redone for no reason, described below.

**The cheapest route to the artwork is not `tokenURI`.** `Premises` serves the
identical page over ERC-5219 for 4.48M — under a fifth of the `tokenURI` cost, and
under every cap in the table including the cautious 10M one, because it hands over
the document itself instead of a base64 data URI nested inside a base64 JSON
envelope. A `web3://` gateway or a 5219-aware wallet takes that route already.
`tokenURI` remains what every marketplace calls, so it still has to fit — but if you
are building a viewer, ask `Premises`.

Where the 18M went, all of it verified byte-for-byte identical output across 144
drawings before and after:

```
_turn rebuilt a nested memory array literal on every call     -6.6M
  once per point drawn, 800 times for a quartet — allocating
  the index table cost more than the twelve multiplications
  it was there to index

the swept forms recomputed the same 25 sin/cos pairs on         -4.8M
  each of 8 rings: 400 series evaluations for 50 numbers

Base64 wrote four characters with four mstore8                  -6.6M
  where one shifted mstore places the same four
```

**The `tokenURI` read is still the budget that binds.** 19.99M leaves 30M of headroom
against the default cap, and every feature added to `engine/ipseity.html` spends
some of it. When it runs out the answer is not a bigger cap, it is a smaller
document.

**And EIP-7825 moved the ground.** The Fusaka transaction cap is 2^24 =
16,777,216 gas, and `tokenURI()` at 19.99M does not fit inside it. That was
found by running, not reading: hardhat's node under its default (Osaka) rules
applies the cap to `eth_call` too, and the first testnet deploy watched every
page of the site answer while `tokenURI()` alone failed with a bare revert.
Whether a given mainnet node applies the transaction cap to view calls is node
policy — geth's `--rpc.gascap` is a separate knob — but any client that does
cannot serve `tokenURI()`, ever, at any setting. The Premises route is the
answer and was already the recommendation: `/token/<id>/live` at 4.48M fits
under the transaction cap itself with 3.7× headroom, so the instrument stays
reachable even by the strictest reader. `tokenURI` remains what marketplaces
call, and on nodes with the ordinary 50M call ceiling it works as measured.

Deployed bytecode, against the 24,576-byte EIP-170 ceiling:

```
Desk             23,284 B   95%    the application, held as contract code
Renderer         20,747 B   84%
Ipseity          18,718 B   76%
PageMarket       18,254 B   74%    the swap card, and the directory
PageServices     17,594 B   72%    renting, and the two hands
DeskTalk         16,383 B   67%    the messaging client
PageToken        16,273 B   66%    each token's counter
PageManifest     15,321 B   62%    the machine-readable shopfront
Sigil            14,477 B   59%
Chrome           13,816 B   56%    the stylesheet, nav and footer
IpseityAccount   12,315 B   50%    the Reach
PagePool         11,882 B   48%    the holder's side
PageDoor          9,919 B   40%    the way in
Pool              9,619 B   39%
PageTalk          8,959 B   36%    the commons, and one token to another
Premises          8,598 B   35%    the ERC-5219 router
PageRooms         8,513 B   35%    the groups
Lease             6,764 B   28%
Parley            6,069 B   25%    the protocol the tokens talk over
Engine            2,724 B   11%
GripVault         1,933 B    8%    the Grip
```

There are nine contracts serving the site rather than one because EIP-170 is
24,576 bytes and the site is not. The split is not arbitrary: `Premises` routes
and answers the four routes that hand over the artwork itself, and every page
contract is an immutable constructor argument, so the routes where being wrong
would mean serving someone else's bytes never pass through the parts that can be
replaced.

`GripVault` is the smallest contract in the collection and carries the strongest
promise in it. That is not a coincidence — it is the whole argument. Its guarantee
costs 1,933 bytes because the guarantee is a function that was never written, where
the Reach spends 7,302 policing a capability it has.

---

Where the tokens talk is the cheapest part of the site, and that is the design
rather than an accident. The conversation is in the logs — which a node already
has indexed — so the contract renders a shell and the browser does the reading:

```
/chat                0.23M    the commons: one room, every token
/rooms               0.24M    the groups a token has entered
/room/1              0.29M    one group
/dm/1                0.24M    the room two tokens share
/                    0.31M    the door
```

A chat that cost a node what a chart costs would be a chat nobody could host. The
expensive read on this site is still `/token/<id>/live` at 4.48M — the whole
instrument in one `eth_call` — and it is expensive on purpose and only when
somebody asks for it.

## Building it

```bash
npm install

node tools/selftest.mjs         # the engine's own keccak, ABI coder, EIP-712, CREATE2
node tools/build-engine.mjs     # minify, gzip, shard  → dist/shards.json
node tools/verify.mjs           # deploy on a real EVM and read it all back
node tools/preview.mjs          # dist/preview.html — open it in a browser

npm run gallery                 # mint eight solids, pull every facet back off the
                                # chain, bind them into dist/gallery/gallery.html
npm run shots                   # open those documents in a real browser and
                                # require them to draw  → dist/gallery/shots/
```

`selftest.mjs` lifts the chain half of the engine straight out of
`engine/ipseity.html` — the same bytes that go on chain, not a copy — and holds it
against published vectors: keccak-256, nine function selectors the whole chain
agrees on, the EIP-55 checksum cases, ABI encoding and decoding, and the full
**EIP-712 `Mail` vector from the EIP itself**, domain separator through final digest.

`verify.mjs` is the one that matters. It loads the shards, freezes the engine, mints,
pulls `tokenURI()` back, and walks it: base64 → JSON → base64 → gzip → the document.
The document that comes back must be **byte for byte** the document that went in, and
the state written into the gap must be the state the contract actually holds. Then it
commits a new orientation and checks that everything downstream moved and the engine
itself did not.

`shots.mjs` is the only tool in here that renders anything; everything else reads
bytes. It launches Chromium, opens the document the chain returned, and refuses to
pass unless a WebGL2 context exists on `#field` and the body has come up — because
"the bytes round-tripped" and "the token draws" are two different claims, and for a
while only the first one was being made.

The second claim was false. `document.open()` clears the document but keeps the
Window, so every lexical declaration made before the write survives it — and the
loader was handing the payload over as `const S` and `const D` at global scope while
the minified engine, whose top-level names a minifier had shortened to single
letters, declared its own `const D={}`. One binding, declared twice, and
`document.write()` threw before a pixel was drawn. Every packed token was a black
rectangle in Chrome, and nine hundred passing assertions had nothing to say about it,
because not one of them had ever run the page. The loader now hands both halves over
on one property and reads them from inside a function, so it declares nothing at all;
`verify.mjs` asserts that, and `shots.mjs` asserts the consequence.

It found a second one on the same run. The eighth solid's notation was written
`z<-z2+c`, and that string is dropped straight into SVG character data — where a bare
`<` is markup, not a character. The still for every Quaternion Julia token was
therefore not an SVG at all but a parse error, and the *thumbnail* is the face most
clients show. It is the arrow the instrument uses now, which is data in SVG and in
JSON both; `verify.mjs` checks all sixteen labels for characters that mean something
to either parser, and `shots.mjs` calls `decode()` on every image the page holds,
because an image that will not parse is still an `<img>` in the DOM and every
assertion that counted elements was perfectly happy about it.

That check found a real bug. The SSTORE2 init code carried the wrong `CODECOPY`
source offset — `PUSH1 10` where the prologue is 12 bytes long — so every shard came
back with two bytes of init code glued to its front and two bytes missing from its
end. It deploys. It reads. It silently corrupts the document. The same error is
present in the reference implementation this was built from.

### Deploying

```bash
node tools/build-engine.mjs
node tools/verify.mjs                    # do not skip this
forge script script/Deploy.s.sol --rpc-url <chain> --broadcast

# check engine.headBytes()/bodyBytes() against dist/ipseity.min.html, then:
ENGINE=0x… IPSEITY=0x… forge script script/Seal.s.sol --rpc-url <chain> --broadcast
```

`freeze()` and `sealRenderer()` are both one-way. After them the document and the
renderer are permanent, and nobody — including the curator — can alter what the
collection looks like.

Before broadcasting to a live chain, **re-verify the ERC-6551 registry and account
implementation addresses on that chain**. They are baked into an immutable contract,
and passing the wrong implementation yields a different, valid-looking, entirely
broken account address.

---

### Running it on a testnet

The suite runs an EVM in-process, which proves the contracts and cannot prove
the wire. `tools/testnet.mjs` deploys everything — engine, shards, collection,
Parley, all thirteen site contracts — over JSON-RPC with signed transactions and
mined blocks, seeds a real conversation between two holders, and then reads it
all back through the same `eth_call` and `eth_getLogs` a stranger's browser
would use. Nothing in that file touches an in-process EVM; if the node lies, it
fails.

```bash
npx hardhat node                 # a local testnet: real blocks, real logs
node tools/testnet.mjs           # deploy + seed + verify over the wire
node tools/gateway.mjs           # http://localhost:8080 — GET /chat is an eth_call
node tools/testnet-drive.mjs     # Chromium + an injected wallet walks the whole site
```

The drive is the last gap between "the suite passes" and "a person used it":
Chromium loads `/chat` from the gateway, a wallet-shaped provider is injected
the way an extension injects one, the page recognises the wallet as holder of
#1, a message typed into the composer is signed, mined, and comes back off the
chain onto the page as text. A second browser answers as the holder of #2. Then
`/token/1/live` — served by the chain, on a real origin — draws, injects, and
connects: the instrument's own corner reads *Connected as 0xf39F…2266 on
Chain 31337*.

The same script deploys to a public testnet — about 35 transactions and ~69M
gas, so bring funded testnet ether:

```bash
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
PRIVATE_KEY=0x… \
  node tools/testnet.mjs
```

On a public chain the ERC-6551 registry is expected at its canonical address
(it is deployed on every serious network); locally it is placed there with
`hardhat_setCode`, exactly as the in-process suite places it. The gateway's
`/__wallet` signer refuses any chain that is not 31337 — a signer that would
sign for a live chain with publicly-printed development keys is a wallet-shaped
hole.

---

### Opening the live deployment yourself

The collection is live on **Base Sepolia** (see DEPLOYMENTS.md). To stand in
front of it:

```bash
git clone <this repo> && cd Most-Advanced-NFT-Possible && npm install
node tools/gateway.mjs          # serves the deployed contract at localhost:8080
```

A fresh clone serves the committed Base Sepolia deployment with no other setup
— the gateway holds no content, every page is an `eth_call` made when you ask.
Then, in the browser you opened it with, point MetaMask at Base Sepolia
(chain id **84532**, RPC `https://sepolia.base.org`, currency ETH, explorer
`https://sepolia.basescan.org`) and press connect: the door reads what your
wallet holds and opens it — the instrument at `/token/<id>/live` runs on a real
origin, so the wallet injects and the token's controls actually work. To see
the tokens in the wallet itself, import NFT
`0x36c49f58c6437ee994766ce80f6654c4d797b8db` with your token id.
(That is the live Base Sepolia hub; `DEPLOYMENTS.md` names the current
deployment at the top and keeps the superseded ones below it.)

The public `web3://` gateways are the zero-install route
(`https://<premises-address>.<chain>.w3link.io/…`) — at the time of writing
w3link's Base Sepolia backend is down while its Ethereum Sepolia one answers,
which is a fact about a gateway, not about the site: the contract serves either
way, and any 5219 gateway pointed at chain 84532 works.

## Layout

```
engine/ipseity.html     the artwork: one file, no dependencies, 137 KB
src/
  Ipseity.sol           the token — state, standards, the causal loop
  Engine.sol            the document, held as contract bytecode
  Renderer.sol          tokenURI, the three faces, the JSON
  Sigil.sol             the 4D projector, in Solidity
  Pool.sol              every token as its own exchange
  Lease.sol             renting a token by the day, priced by its holder
  Premises.sol          the front door: ERC-5219, holds none of the artwork
  Chrome.sol            the shell every page shares
  Desk.sol              the application for the collection's own markets
  PageToken.sol         PageMarket.sol  PagePool.sol  PageServices.sol
  PageManifest.sol      the same, for programs
  Parley.sol            the protocol the tokens talk over — rooms, and the
                        back-links that make an archive walkable with no index
  DeskTalk.sol          the messaging client: the walk, the calldata, and the
                        rule that nothing off the wire becomes markup
  PageDoor.sol          / — connect, and what you hold opens
  PageTalk.sol          /chat and /dm/<id>
  PageRooms.sol         /rooms and /room/<n>
  IpseityAccount.sol    the Reach — the ERC-6551 vault, sealable and measured
  GripVault.sol         the Grip — the second account, which cannot spend
  lib/                  SSTORE2, Base64, Trig, Curve, Timelock, Mul, Web
  interfaces/           every standard, with the reasoning
tools/
  glsl-check.mjs        every shader parses and type-checks
  selftest.mjs          the engine's crypto against published vectors
  build-engine.mjs      minify → gzip → shards
  verify.mjs            deploy on a real EVM, read it all back
  verify-pool.mjs       try to break the market on a real EVM
  verify-vault.mjs      try to drain a sealed vault, and to widen a session key
  verify-kernel.mjs     try to lie to a buyer about a sealed kernel
  verify-premises.mjs   prove the index cannot touch the artwork
  verify-timelock.mjs   try to escape the delay
  verify-site.mjs       run the contract's own client against the contracts
  verify-parley.mjs     read a conversation back with a second, independent
                        reader, and count the queries it took
  gallery.mjs           mint one token per solid and pull every facet off chain
  shots.mjs             open those documents in a browser and require them to draw
  forge.mjs             the Foundry suite, without Foundry
  fuzz.mjs              the stated properties, under seeded random attack
  preview.mjs           dist/preview.html
  evm.mjs, compile.mjs  the harness
test/                   Foundry unit, property and fuzz tests
script/Deploy.s.sol     deploy the collection, load, seal
script/Site.s.sol       deploy the parley, the desks, the pages and the router

INVARIANTS.md           one hundred and thirty-nine statements that must hold, and the test for each
AGENT.md                ERC-7857, session keys, and what an agent can be given
```

---

## What was and was not run here

`glsl-check.mjs`, `selftest.mjs` (55 assertions), `build-engine.mjs`, `forge.mjs`
(158 Solidity tests), `gas.mjs`, `verify.mjs` in both storage modes (122 packed / 121
raw), `verify-pool.mjs` (62), `verify-vault.mjs` (97), `verify-kernel.mjs` (36),
`verify-premises.mjs` (30), `verify-site.mjs` (395), `verify-timelock.mjs` (24) and
`fuzz.mjs` (14 properties) were executed in this environment — 979 assertions and
tests, 14 properties, 15 refuted claims and a 220-tick agent run — and every number
in this document comes from those runs.

`forge test` itself was **not** executed: Foundry's installer is unreachable from
this session, and so are GitHub, codeload and the crates.io API, so there is no
route to it. The 135 Solidity tests are run instead by `tools/forge.mjs`, which
supplies a cheatcode precompile at the address `forge-std` points `vm` at and the
VM hooks that `prank`, `expectRevert` and `warp` need. That is strictly less than
forge — no invariant campaigns, no coverage guidance, no traces — but the
assertions are real and they execute.

They had not executed before, and the first version of that runner reported 72
passing tests while running no EVM code at all: funding the test contract erased
its code, so every call returned success having done nothing. A negative control —
an assertion that must fail — is what caught it. The runner now refuses to report
on the suite unless a probe whose entire runtime is a REVERT is observed to revert
having burned gas, and unless every state-writing cheatcode is confirmed by reading
the state back.

The nine `testFuzz_` properties they state **are** run, by `tools/fuzz.mjs`, against
the same contracts compiled by the same solc on the same EVM as everything else in
`tools/`. The generator is seeded and prints its seed, so a failure reproduces for
anyone rather than only for whoever hit it, and it shrinks a counterexample before
reporting it. That suite found the pricing bug described under *The market* on its
first serious run. What it does not do is stateful invariant campaigns, coverage-guided
corpora or cheatcodes — it is a smaller net, not a replacement. Run the Foundry suite
before deploying anywhere real.

**Nothing here has been audited, and `Pool.sol` holds other people's money.** That is
a different risk class to the rest of the repo: the worst bug in the artwork renders a
picture wrong, the worst bug in the market takes funds, permanently, with no undo. It
ships with a per-market deposit cap for exactly that reason — raise it only after a
review. The artwork also has a wallet client inside it that can sign arbitrary
calldata; that is the point of the Call node and the other thing an auditor would want
to look at first.

**The off-chain half of the agent story is not in this repository.** `AGENT.md`
specifies the MCP surface a model would drive the session key through, and that
service holds a private key and talks to a live RPC — so nothing about it can be
exercised by the harness here. Shipping untested key-handling code alongside tested
contracts would misrepresent which parts have been checked. The on-chain side —
the four bounds, the three structural refusals, the kernel — is built and
tested; the signer is specified and not written.

---

**The conversation was read back by two independent readers.** The one that ships
lives in `DeskTalk.sol` and is driven by `tools/verify-site.mjs` against a DOM
shim and a provider wired to the same in-process EVM — so a message typed into
the box on the page is a log emitted by the contract, and the message that comes
back onto the page is that log, decoded. The second lives in
`tools/verify-parley.mjs` and was written as if it had never seen the first. Two
readers of one archive have to agree, and if they ever stop, one of them is wrong
in a way a single reader could never have reported.

Neither has been run against a real node. `eth_getLogs` here is a ledger the
harness keeps, filtered the way a node filters — inclusive block bounds,
positional topic matching, an array for "any of these" — and the shape of the
answer is the shape `eth_getLogs` returns. What it cannot model is reorgs, log
pruning on an archive-less node, or an endpoint that refuses a query for its own
reasons. **The claim that this reads a conversation without an indexer is a claim
about the number and narrowness of the queries, which is measured; it is not a
claim that every endpoint will answer them.**

---

**A test failed against a correct contract, and the reason is worth writing
down.** `test_aTokenRemembersWhereItLastSpokeWhoeverElseHasSpoken` captured
`block.number` into a local, called `vm.roll`, and compared. It failed. The
contract was right and the test was wrong, in a way that has nothing to do with
either: within one transaction `block.number` cannot change, so the optimiser is
entitled to read `NUMBER` once and reuse it — and it sinks that read to the first
*use*, which was after the roll. The local captured "before" held the value from
after. A cheatcode that moves the block mid-call is outside the language's model
of the machine, and anything that has to straddle one now reads its evidence out
of storage instead. Real Foundry has the same hazard for the same reason.



## Tradeoffs worth knowing

**Inside a marketplace frame, nothing can be signed.** The `animation_url` is
sandboxed without `allow-same-origin`, so the origin is opaque, no extension injects
a provider, and no wallet ever announces itself under EIP-6963. The engine detects
this — storage throwing is the cheapest reliable signal — and says so plainly rather
than offering a Connect button that cannot work. The field still turns, because the
field never needed a network.

**ERC-721Enumerable costs real gas on every transfer.** It is implemented because
supply is capped at 4096 and other contracts do read it. On an unbounded collection
it would be the wrong call.

**`tokenURI()` reads at 19.98M gas, and `tokenURIs()` at 37.05M.** Both are inside
the 50M `eth_call` cap that geth, erigon and reth use by default, and both are
outside the 10M some hosted providers impose — so on a cautious provider the token
renders nothing, and the caller is told "out of gas" rather than "ask elsewhere".
`tokenURIAt(id, index)` exists so a client that wants one face does not pull all
three, and `Premises` serves the identical page over ERC-5219 for 4.48M, which is
under every cap. `tools/gas.mjs` measures all of it on every run and fails the build
before a regression can ship.

**ERC-5192 and ERC-6454 both being registered is a known smell** — two ways of asking
whether a token can move. They are wired to one flag here, and `isTransferable()` is
written in terms of `locked()`, so they cannot diverge; but a strict reading would
pick one.

---

*Held entirely in chain state. The section is where you stand; the solid is what you are.*
