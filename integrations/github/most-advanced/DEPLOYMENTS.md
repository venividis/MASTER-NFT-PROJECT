# Deployments

## Live now

Everything below this block is a log, kept in the order it happened. This is
the only part that describes what is answering **today**. Superseded addresses
stay in the log rather than being edited away — a deployment record that
rewrites its own past cannot be used to tell when something broke.

### Base Sepolia · chain 84532

```
Premises     0x01de7b5d7233f9ecfc11a8a07d347654f95b07b1
Ipseity      0x36c49f58c6437ee994766ce80f6654c4d797b8db
Pool         0x8b699b46edb8e8bd156347d73c8eaa2a0abe80f4
Engine       0x3f3e39a630376301575afbf90b3af2a3eb003636   (frozen)
```

```
https://0x01de7b5d7233f9ecfc11a8a07d347654f95b07b1.basesep.w3link.io/
https://0x01de7b5d7233f9ecfc11a8a07d347654f95b07b1.basesep.w3link.io/token/2/live
web3://0x01de7b5d7233f9ecfc11a8a07d347654f95b07b1:84532/
```

### Ethereum Sepolia · chain 11155111

```
Premises     0x0106237ad2581956f21fd769fcd88f0d77918425
Ipseity      0x6ff03e23ca18d78c5264e7e5e159197cb68a0ec2
Pool         0xc77e7f0a448e7b0adff07f51422ee51f5eff6637
Engine       0x2eb1f7fb9bd6a08fcf61c263ddbabaddf84044f4   (frozen)
```

```
https://0x0106237ad2581956f21fd769fcd88f0d77918425.sep.w3link.io/
https://0x0106237ad2581956f21fd769fcd88f0d77918425.sep.w3link.io/token/2/live
web3://0x0106237ad2581956f21fd769fcd88f0d77918425:11155111/
```

All 47 addresses on each chain are in `deployments/`, and none of them need to
be trusted: `node tools/recover-record.mjs deployments/<chain>.json` reads them
back off the chain and exits non-zero if the file and the chain disagree. Both
records reconcile at 0 disagreeing, 0 unreachable, 0 missing, 0 contradicted.

The ParleyPort federation is live between the two testnets — the same
contract at the same address on both chains, each naming the other as its
only peer:

```
ParleyPort   0x65d1e9d08488a68ef6bf48e057ab69496333c7ae   on 84532 and 11155111
```

## Base Sepolia · chain 84532

Deployed 2026-08-18 over `https://base-sepolia-rpc.publicnode.com` with signed
legacy transactions — 68.41M gas across ~40 transactions, every route then read
back through the public node's own `eth_call`, and the conversation walked
through its production `eth_getLogs` in single-block queries. The full run is
`node tools/testnet.mjs`; nothing was deployed by hand.

```
Ipseity      0x13ed99319101cbc2bc09e3849af5462dae283f5d
Premises     0x646b0b8a99657bbb6cc53ad7b8374ceae29a4824
Parley       0xe08ff7cf056b2a3a067fa1b00476f663b9bcbfcb
```

The other ten site contracts (Chrome, Desk, DeskTalk, the seven pages) are
immutable constructor arguments of Premises and readable off it; `dist/testnet.json`
records them all when the deploy tool runs.

```
web3://0x646b0b8a99657bbb6cc53ad7b8374ceae29a4824:84532/
web3://0x646b0b8a99657bbb6cc53ad7b8374ceae29a4824:84532/chat
web3://0x646b0b8a99657bbb6cc53ad7b8374ceae29a4824:84532/token/1/live
```

Any HTTP gateway is `node tools/gateway.mjs` pointed at the chain — GET /chat
is an eth_call, and turning the gateway off loses nothing.

What is on it so far: tokens #1–#3 minted; #1 embodied; three messages in the
commons, a group ("the surveyors"), a whisper between #1 and #2. The engine is
**frozen**; the renderer is **not yet sealed** and the curator is the deploy
key, so this deployment is a rehearsal, not a covenant — reseal ceremony and a
timelocked curator belong to a mainnet deploy.

Measured there, not assumed: `tokenURI(1)` — 101.2 KB — answers through this
public RPC's eth_call, so its call ceiling clears the 19.99M read. The
transaction-shaped ceiling of EIP-7825 still stands as documented in the
README: readers that cap calls at 2^24 get the instrument via
`/token/<id>/live` at 4.48M.

### The whole surface, exercised — 2026-08-18

`node tools/exercise.mjs` walked every function of the six contracts on this
deployment with four accounts (the curator and three fresh keys): **235
functions — 231 exercised on the live chain, 4 skipped with written reasons,
zero unaccounted — 159 assertions, 0 failed, 101 transactions.** Refusals were
proven through `eth_estimateGas`, which replays the revert without spending
anything; every read was pinned to the newest block a receipt had proven mined,
because a load-balanced public RPC will otherwise answer from a replica living
one block in the past.

The skips, in full: `tokenURIs()` (37M gas, past this RPC's call ceiling —
measured in-suite), `renounceOwnership` / `setRenderer` / `sealRenderer`
(irreversible or deployment-breaking on a live rehearsal — the seal ceremony
belongs to mainnet), and `cloneWithKernel`'s enc-path duplicate (exercised
raw). What the live chain taught that the suite could not: a session grant's
empty selector list permits nothing — bare value transfers need `bytes4(0)`
granted like anything else; `guardNFT` refuses a manifest promise about a
piece the hand does not hold; the verifier really is write-once, curator
included, across runs; and `status()` on a freshly-rented lease answers
"occupied," which is the correct answer to a question the test first asked
wrongly.

Selected transactions in `dist/exercise-log.json` (all 101 hashes there);
tokens #1–#24 exist, #20 is the fully-exercised one, #23 its kernel clone.

### The site, rebuilt — 2026-08-19

The pages were replaced (wallet picker; eight tabs: door · terminal · social ·
agora · market · coins · charts · json) by `tools/redeploy-site.mjs`, which
deploys new pages and a new Premises and **keeps the Parley** — every message
ever sent is a log that contract emitted, and a new Parley would not migrate a
conversation, it would end one. The collection, pool, lease and every token are
untouched: same addresses, same holders, same history.

```
Base Sepolia    Premises 0x023b9d8834902ad3bf35b690db6e654d26c26463   (live, all tabs 200)
                Parley   0xe08ff7cf056b2a3a067fa1b00476f663b9bcbfcb   (unchanged)
Eth Sepolia     pending — the redeploy ran the deployer dry one contract
                short; it resumes when the deployer is topped up
```

The old Base Sepolia Premises (`0x646b…4824`) still serves the old pages
forever — an immutable router cannot be un-deployed, only pointed away from.

### Governance withdrawn — 2026-08-19

The agora tab, its page and its contract are removed from the codebase before
Ethereum Sepolia ever deployed them; the terminal's propose/vote commands went
with them. The Base Sepolia site that briefly carried the tab is superseded by
the next redeploy. Rooms remain the place the tokens organise; a decision the
holders want to bind can always come back as a contract when there is
something for it to bind.

### Charts withdrawn, the swap card returns — 2026-08-19

`/charts` — the one tab that left the chain — is deleted outright, and `/swap`
comes back from this repository's history as a single `exactInputSingle` card
against the chain's own Uniswap v3: no pools page, no positions client, no
governance reader, no v4 wiring. The card checks the factory for a pool at
every fee tier for whatever address is pasted into it, so there is no token
list to be wrong about. One wiring table in `tools/site.mjs` carries the four
per-chain address sets (probed live against each chain's deployments on this
date; all four route through `SwapRouter02`, seven words, no deadline), and
the door grew an EIP-3326/3085 chain switcher. `npm run check` green
throughout; `verify-site` 324/0 with the card driven field-by-field on both
router calldata shapes.

```
Base Sepolia    Premises 0x9d012f98bf4fdf6937c892b71b882631547467b9   (live, all tabs 200)
                Venue    0x81605ab877cedbc497a9b45049a79a6bb121fd42   (factory/quoter/router = Base Sepolia's own Uniswap v3)
                Parley   0xe08ff7cf056b2a3a067fa1b00476f663b9bcbfcb   (kept — same conversation)
                Foundry  0xe32eeb14bd0ba789d1edd8ae1d9c184d9ececf76   (fresh — the redeploy resets the /coins ledger;
                                                                       coins poured before it live on as contracts,
                                                                       unlisted)
                https://0x9d012f98bf4fdf6937c892b71b882631547467b9.basesep.w3link.io/
Eth Sepolia     still pending the top-up; the same final shape (with Eth
                Sepolia's own v3 wiring) deploys the moment it lands
```

An earlier entry on this page recorded the Base Sepolia Parley as
`0x9599…07b1`; that address holds no code on Base Sepolia and never did — it
was a local-chain address copied into prose. The deployment records were
always right, and they are the ones the redeploys read.

### The launchpad and the vault — 2026-08-19

The coin pourer is withdrawn and three surfaces replace it, all live in the
same redeploy: `/launch` (a v4 launchpad — fixed-supply no-owner token
signed by a collection token, hook address mined by the visitor's own node
under `eth_call`, pool initialized with six flat words at the chain's real
PoolManager, sliders for supply, fee, spacing, and a liquidity lock that
runs to ten years), `/hook/<address>` (a hook's powers read off its address
alone, canonicalized with 301s), and `/lock` (the vault: any ERC-20, a
ten-year bar, extend-only, no owner, no rescue path). The whole pipeline
was green before the deploy — `verify-site` 392/0 with the launch driven
field-by-field into a recording PoolManager and the vault through all five
refusals by error selector.

```
Base Sepolia    Premises 0xb0e9e0d5a80b92a812ca682fa7e908a365a70db1   (live, 13 routes, all 200)
                Kiln     0x353511322c9f4f17e2d37df4e32348509f594d03   (v4 PoolManager 0x05E7…3408, live-probed)
                Locker   0x8886088382d933b05a18d45efa04339cf40f2632
                Venue    (Base Sepolia's own Uniswap v3, routerKind 1)
                Parley   0xe08ff7cf056b2a3a067fa1b00476f663b9bcbfcb   (kept — same conversation)
                https://0xb0e9e0d5a80b92a812ca682fa7e908a365a70db1.basesep.w3link.io/
Eth Sepolia     still pending the top-up (~0.06 ETH to the deployer);
                the watcher deploys this same shape the moment it lands
```

The redeploy probe loop also learned that a load-balanced RPC's replica
answering `0x` for a fresh contract is lag, not absence — probes now retry
before they believe a failure. Two prior Premises on this chain
(`0x023b…6463`, `0x9d01…67b9`) still serve their older pages forever; an
immutable router cannot be un-deployed, only pointed away from.

### The Tesseract harvest — 2026-08-19

Three upgrades mined from `venividis/Launchpad-nft` (branch
`claude/defi-nft-multidimensional-39jijn`, the "Tesseract" build), each
rebuilt to this collection's rules rather than copied, all live in one
redeploy. The vault's locks became transferable positions (`give`, most
usefully into a token's own 6551 account so a locked treasury travels with
the token) with an EIP-2612 fast path that fails soft. The **Nameplate**
is an adminless ENS resolver: bind a name to a token, claim a wildcard
parent once, and the name answers with the token's account, its sigil as
avatar, and ERC-6821's `contentcontract` — the record that resolves a
name straight into this site over web3://, which the Tesseract's own
resolver never carried. And the DMs **seal**: signature-derived P-256
keys published through Parley's own `announce`, static-static ECDH,
AES-GCM, all WebCrypto — the client half of a promise Parley's envelope
made on the day it was written. Suite: verify-site 422/0, full pipeline
green. Diagnosing the drive for it also taught the test shim's provider
to serialize requests, after two overlapping page chains deadlocked the
in-process EVM — a real node's front door absorbs that race.

```
Base Sepolia    Premises  0x257496d2270e45c36fb232fed3b5f0a87cce3dca   (live, all routes 200 by RPC)
                Nameplate 0x551fa98b7f08e06b794c334aaacbbd3c39a0c506   (no ENS registry on this chain:
                                                                        binding refuses honestly; the
                                                                        contract is here so the address
                                                                        matches the chains where it works)
                Locker    0x5101c6edf5cde1215f9f9afd09ce857e5cbcbdc3   (give + lockWithPermit)
                Kiln      0x4b1b7992e626aac88731d98dc3d0e5c779951245
                DeskSeal  0x5d88564a78361607ffed9375e9a49800b1577bc1
                Parley    0xe08ff7cf056b2a3a067fa1b00476f663b9bcbfcb   (kept — and its announce/keyOf
                                                                        now have their client)
                https://0x257496d2270e45c36fb232fed3b5f0a87cce3dca.basesep.w3link.io/
                (w3link's basesep backend is mid-outage as this is written — the
                 previous premises 400s identically; the chain itself serves 200s
                 and the URL comes alive when their backend does)
Eth Sepolia     still pending the top-up; deploys this shape when it lands
```

Deliberately not taken from the Tesseract, with reasons: the
MetaForwarder (a relayer is a server, and this site's whole claim is that
there is none); the DAO (governance was withdrawn here on purpose); the
bridge intents (moving value between chains is a bridge's job, stated on
the door); the bonding-curve launch protections (anti-snipe and
max-wallet need to see the buyer, and on a real Uniswap router the buyer
is hidden behind the router — the Tesseract could offer them only because
it owned its own toy AMM); and the iNFT memory slot (this collection's
sealed kernel already is that idea). One thing it taught that cannot be
fixed on a deployed testnet hub: `transferFrom(holder, account(id), id)`
would hand a token to its own 6551 account and freeze it — the Tesseract
guards this; the mainnet hub should refuse `to == account(id)` at the
ceremony.

### The instrument becomes the entrance — 2026-08-19

Two deploys, one turn of the design inside-out. The **engine was rebuilt
and the hub re-pointed** — possible precisely because the renderer is not
yet sealed, which is what testnets are for. Every token's instrument now
carries a third orbit: eight door-vertices (terminal · swap · launch ·
lock · social · gallery · archive · site) that open the 2-D surfaces, and
a terminal veil drawn over the field itself, so the NFT is the first
interface and the site is what its doors open. The ring forms only where
an origin can answer — over web3:// or any gateway — and never inside a
marketplace's data: sandbox, where a door would be a painting of one. The
doors ride outside the shader's twelve node uniforms, so the instrument's
own sealed geometry is untouched.

And the **2-D site was reborn to deserve it**: void and gold, serif
ceremony, a slowly turning 4-polytope on the door whose eight inner
vertices are the same eight doors, the terminal speaking from the door
with a `go` that walks by word, and every explanatory paragraph folded
behind a small star — hover reads, click pins, warnings never fold,
scripts-off shows every word.

```
Base Sepolia    Premises  0x6e5315360522af0203af7a0f84aac8202c1e8ec7   (the divine site, all routes 200)
                Engine    0x5f3cc653b86e2d09fde3bd475420f57026ab0398   (frozen; 3 shards, 40,318 B packed)
                Renderer  0xb41f012b2a6f145099972be7032189343bc7e0f9   (the hub looks here now)
                Parley    0xe08ff7cf056b2a3a067fa1b00476f663b9bcbfcb   (kept, as ever)
                https://0x6e5315360522af0203af7a0f84aac8202c1e8ec7.basesep.w3link.io/
                …/token/<id>/live — any token's instrument, doors and all
Eth Sepolia     the watcher now deploys site + engine together when funded;
                the honest ask rose to ~0.08 ETH to cover both
```

### Four more doors, and two things found by opening them — 2026-08-20

`/projector` hands the 4-D renderer to anyone: the contract that draws every
token's still is `public pure`, so the page is eight solids on chips, every
number of the section word on its own bar, and a picture redrawn by the
caller's own node. Nothing on it can spend anything. `/seal` reads the three
seals a token can carry and works the two that belong to the holder.
`/keys` grants scoped, expiring session keys on a token's Reach and then asks
the account, selector by selector, what it believes it permits. `/name` binds
an ENS name to a token, building DNS wire format with string arithmetic
because this client carries no keccak — and the drive proves that encoding by
making the contract that *does* hash agree about which node it meant.

Writing the pages found two defects in the contracts they describe, both
measured before they were fixed and both now run as attacks on every check:

  · **The soulbind did not survive a stolen approval.** `onlyHolder` admits
    an approved operator, so a thief holding a phished approval could call
    `unlock` on a bolted token and take it — which is exactly the attack the
    bolt claims to answer. `lock` and `unlock` now admit the owner and the
    token's own account and nobody else.
  · **A token handed to its own hand froze forever.** Transferred to its own
    Reach or Grip, nothing could ever move it again: the account asks who
    holds the token, and the holder would be the account. Both are refused,
    computed rather than looked up so an undeployed account is covered too.

Neither fix can reach the hubs already deployed on the testnets — a collection
is immutable, which is the point — so Base Sepolia's live hub predates both
and the source is what mainnet will carry. That is what a rehearsal is for.

```
Base Sepolia    Premises 0x34a0e6eceef860a6b5c70d092e124904ca797d70   (eleven routes, all 200)
                Parley   0xe08ff7cf056b2a3a067fa1b00476f663b9bcbfcb   (kept, as ever)
                https://0x34a0e6eceef860a6b5c70d092e124904ca797d70.basesep.w3link.io/
                  …/projector  …/seal  …/keys  …/name
                (the hub, engine and renderer are unchanged from the entries
                 above; only the site was redeployed)
Eth Sepolia     still pending the top-up; the watcher ships site and engine
                together when it lands
```

The three page contracts were written in parallel by three agents against a
shared house-style brief, then integrated by hand. Two integration details
worth recording because they will recur: seventeen flat constructor arguments
put `Premises` past what even viaIR keeps on the stack, so the pages are now
passed as one named struct — identical calldata, one memory pointer; and the
name page needs the resolver's address while the resolver needs the premises
which needs the name page, so the resolver's address is computed from the
deployer and the nonce it will hold, and asserted the moment it exists.

### The token is the front page — 2026-08-20

Clicking a link to this NFT used to land you on a page *about* the NFT, with
the artwork one link further in. That was backwards, and it is now the other
way round: `/` serves the live instrument, and the flat pages — still the
right shape for anything a form does better than an orbit — sit behind its
doors and at `/door`. Before the first mint there is no token to render and
the flat page answers instead.

Three things were wrong with reaching the 2-D site *from* the instrument, and
all three only appeared on a phone:

  · the command list opened with `/` and a phone has no `/` key, so on touch
    there was no way to open it at all — the rail carries a button now;
  · the door nodes orbit at the widest radius, and the field is projected
    against the taller side of the screen, so in portrait they spent most of
    their time off both edges — door labels are pinned inside the viewport
    now, with the wire still running to where the node actually is;
  · and the rail's chain cell was `flex:1` behind an id selector, so it took
    every spare point and pushed the buttons past the right edge. Measured,
    not guessed: at a 500-point viewport the cell was 237 points wide and the
    buttons began at 418. It takes what it needs now.

The palette also learned the verb a person would actually type: `launch 2D`,
and `launch 2D swap`, `lock`, `social`, `gallery`, `terminal` beside it.

```
Base Sepolia    Premises 0x3045c6db8cc685b9312f7209f2ee36b04ed0648a   (/ is the instrument; /door the flat page)
                Engine   0x7db52df6a2f5e02fe6dc22918ec1770aa629dc60   (frozen; 4 shards, 40,771 B packed)
                Renderer 0xfa5c47d8201ae204f261d2b78e6357e2dd7a0ed4
                https://0x3045c6db8cc685b9312f7209f2ee36b04ed0648a.basesep.w3link.io/
```

### A room you can see the edges of — 2026-08-20

Membership in the rooms was real but invisible: the archive knew exactly who
was in a group and who had been asked, and nothing anywhere would tell you.
`Roster` answers that without touching the deployed `Parley` — it reads the
public mappings a window at a time and hands back a bitmap, so a steward's
panel can draw the members it has and offer to show one of them out, and a
token can ask which rooms it stewards. The archive did not have to be
replaced to become legible, which is the whole reason it was built additive.

The terminal learned `invite`, `evict` and `roster` to match. Those three
words live in their own contract: `DeskTerm` was at 25,195 bytes, which is
103% of what a chain will accept, so the words register themselves through
the same `def` the built-ins use — a split, not a rewrite.

Opening the sealed-DM page to check the roster work found something worse
than a missing feature. The banner said *only #A and #B can read what is said
here*, and it said so after checking one key: the sender's. The sealing keys
are derived from a wallet signature, so they belong to a wallet and not to a
token — publish a key, sell the token, and the person who used to hold it can
still derive that key and open everything addressed to it. The page now keeps
its keys per token, offers to republish the moment the key on file is not the
one this wallet derives, and reads the far token's transfer count before it
promises anything:

  · never moved since mint → *#N has held this key since it was minted*
  · moved → *a key published before a sale can still be opened by whoever
    held it then*, as a warning, with the count

The same sentence is rendered by the contract into `/dm/*` as well, so it
survives with JavaScript switched off.

One tooling bug worth the record, because the guard caught it rather than the
tests. `nonceNow()` asked the node for its pending transaction count, and a
node that has not yet mined what this process just sent answers about the
past — so the address predicted for the ENS resolver was wrong, and the
assertion added last week refused to wire `/name` to it: *the resolver landed
at 0x4352… not the 0xbb9c… the name page was given*. The tracker this process
already keeps is the sequence CREATE actually hashes; `nonceNow` reads that.

```
Base Sepolia    Premises 0x0f6b6921ea8d98733dcee0d981afca7726ecbbd9   (eleven routes, all 200)
                Roster   0xd5ea1f139d88c9b68917ee5c8a8c28c45d50bb8a
                DeskRooms 0x9229d8a28d7697194a24b1a0d02e6182c2bf5b61
                Parley   0xe08ff7cf056b2a3a067fa1b00476f663b9bcbfcb   (unchanged, as ever)
                Engine   0x7db52df6a2f5e02fe6dc22918ec1770aa629dc60   (frozen)
                https://0x0f6b6921ea8d98733dcee0d981afca7726ecbbd9.basesep.w3link.io/
Eth Sepolia     still pending the top-up to 0x5f1191a432EA9d3f36EbA62c0Ca797bf0A754337
```

### The site catches up with the branch — 2026-08-21

The live Base Sepolia deployment had fallen twenty commits behind. `/estate`
answered 404, the Pool still carried the curve that read three angles, and the
hub predated the partition. A page-only redeploy could not have fixed the last
two: `FIRST_ID` and `LAST_ID` are constructor immutables on Ipseity, and Curve
is an internal library inlined into Pool's bytecode. Both only move when the
contract that holds them is deployed again. So this was a full run of
`node tools/testnet.mjs`, not `tools/redeploy-site.mjs`.

136.06M gas across ~35 transactions, read back over the wire by the same 21
assertions that guard a local run. The route that had been the symptom:

```
/estate    404  ->  200   (36,792 bytes, text/html)
```

```
Premises     0x01de7b5d7233f9ecfc11a8a07d347654f95b07b1
Ipseity      0x36c49f58c6437ee994766ce80f6654c4d797b8db
Pool         0x8b699b46edb8e8bd156347d73c8eaa2a0abe80f4   (the corrected curve)
Succession   0x82079edde8858179f8c0976a1b9495f1a543956d
Consign      0x5c23a96ca4f9896874c1526bdd21262309cd2b9f
Roster       0x9e90193da950b95b20c04839803822401977d7ca
DeskSeal     0xe218e453efda71f174d302e408e727eca47a6787
Engine       0x7a82ff2bf2682a93b5ce1095ee1e596bcfc81b87   (frozen, the deck build)
```

`FIRST_ID` reads 1 and `LAST_ID` reads 4096 here, which is correct and not a
missing lookup: `BANDS` in `tools/site.mjs` is keyed by mainnet chain ids, and
`bandOrWhole` gives a testnet the whole edition on purpose. A rehearsal should
be able to exercise every id, and no token on it is the token it pretends to
be.

**A cost estimate that was wrong by seventy times.** `eth_gasPrice` on Base
Sepolia answered 0.006 gwei, so 136M gas looked like 0.0003 ETH. The deployer
went 0.02486 → 0.00348, which is **0.0214 ETH** — the snapshot carries neither
the L1 data fee nor the 1.5× pad the sender applies. The number that matters
downstream: Eth Sepolia at its measured 0.978 gwei prices the same deploy near
**0.20 ETH**, not the 0.08 quoted before, which is more than a faucet hands
out. Base Sepolia is where the rehearsal lives.

**Two bugs in the record, found by writing it down.** `tools/testnet.mjs`
listed thirteen contracts by name while `deploySite` returns thirty-five, so
every page added since that list was written had been dropped from the only
copy that survives a clone — and `dist/` is ignored, which meant the page
addresses of every deployment lived in one container's memory. The list is now
a spread.

Then `tools/recover-record.mjs`, which walks the deployment backwards to
rebuild a lost record, reported a clean run while filing the wrong contract
under `deskSeal`. It read `PageSeal.DESK()` — and PageSeal does hold a `DESK`,
so the call succeeded and returned a live address. Just not DeskSeal, which
PageSeal has never heard of. `PageTalk.SEAL()` is the one that holds it.
Nothing failed; the answer was false. `roster` was read by no route at all, so
it was missing from the walk, missing from the file, and therefore missing from
the report.

Ten keys are now deliberately reached two ways, and a disagreement is reported
rather than overwritten. Against this deployment:

```
47 addresses · 0 disagreeing · 0 unreachable · 0 missing · 0 contradicted
```

Zero contradicted across ten double routes is what says this record came from
one deployment rather than a blend of two.

A node cannot catch the `deskSeal` shape — on chain both addresses are real
contracts. `tools/verify-recover.mjs` catches it from the source instead: every
route must read an immutable its contract actually declares, no two keys may
read one getter, no route may read from a contract the walk has not reached
yet, and the expected key set must agree with what `deploySite` returns. It
hands itself the table as it shipped broken and watches it refuse.

**Not deployed, on this or any chain:** `src/ParleyPort.sol` and
`src/Facet.sol`. Both are written and covered by the suite, and neither has a
deploy path. The Facet needs its CREATE2 salt mined against a real v4
PoolManager; the Port is meaningless until peers are wired across chains.
`PageLaunch` does not yet offer the Facet either.

The deployer holds 0.00348 ETH on Base Sepolia after this run — enough for
transactions, not for another deploy.

### Ethereum Sepolia catches up, and ENS does not — 2026-08-21

The Eth Sepolia deployment was two months and one architecture behind: an
old hub, an old engine, and a premises that answered `/` and little else.
It is now the same build as Base Sepolia. 137.86M gas across ~35
transactions, **0.2148 ETH**, then read back over the wire by the same 21
assertions that guard a local run, and reconciled against the chain by
`recover-record` at 0 disagreeing, 0 unreachable, 0 missing, 0
contradicted.

```
Premises     0x0106237ad2581956f21fd769fcd88f0d77918425
Ipseity      0x6ff03e23ca18d78c5264e7e5e159197cb68a0ec2
```

The estimate was right this time — 0.2225 predicted against 0.2148 spent.
The Base Sepolia estimate was out by eighteen times for a reason that does
not apply here: `eth_gasPrice` on an L2 describes execution only, and the
L1 data fee is most of the bill. On L1 there is no second fee to forget.

**ENS on Sepolia cannot register a .eth name, and the failure is silent.**

`ipseity4d.eth` was chosen over `ipseity.eth` deliberately: the latter is
free on Sepolia but held on mainnet until 2042, so a rehearsal using it
would teach a URL that can never exist. `ipseity4d` is free on both, which
is the only property that matters for a deployment whose claim is that it
rehearses something real.

The registration reverted with no reason string, and every precondition
held: the commitment was stored, its age was 120s inside the 60..86400
window, the name was available, the value covered the price exactly, and
the controller → wrapper → registrar chain all pointed at each other
correctly. The controller is even an authorised controller on the
NameWrapper.

What is not true is the next link:

```
                       BaseRegistrar.controllers(NameWrapper)
    mainnet   0xD4416b13…86401   AUTHORISED
    sepolia   0x0635513f…dfce8   0
```

`ETHRegistrarController.register` calls
`NameWrapper.registerAndWrapETH2LD`, which calls `registrar.register`,
which is `onlyController`. On Sepolia the wrapper is not one. Same
contract addresses as mainnet, same code, different wiring — so every
read function answers normally and only the write dies, which is the
shape of bug that survives a doc page.

Verified rather than inferred: the same `controllers(address)` call
returns 1 for `0xf83fe265…044750`, a third-party bulk registrar found by
walking `NameRegistered` events, which is what the 452 registrations in
the last 49,000 blocks actually went through. That path is not ENS's and
was not used — reverse-engineering an unaudited registrar's ABI with
somebody else's ether is not a thing to do for a nicer-looking link.

The mainnet path is intact, so the name is worth having there and nowhere
else. `tools/ens-name.mjs` is written and correct; it wants a chain whose
registrar authorises its wrapper.

### The ring becomes the navigation — 2026-08-21

The deck's tab bar and the sealed-node modal both went, and the engine was
redeployed to Base Sepolia so every token saw it in the same block.

```
Engine    0xba065fe65a7d7f13d5c49cc91d6f278f63e25c3c   loaded and frozen
Renderer  0xd2b86b7f7521f255d55200c08e139d72075174e8   the hub now looks here
```

Verified against what the chain serves rather than against the local build:
fetched `/token/2/live` through the gateway, inflated the payload, and
checked the redesign is in the bytes — rail, head, plate, named wires
present; `dkbar` and "not loaded" absent.

The previous engine stays at `0x7a82ff2b…`. Nothing is destroyed by a
redeploy; the hub simply looks elsewhere, and pointing it back is one
transaction. That is the same property that makes `sealRenderer()` matter:
until it is called, this is reversible, and after it nothing is.

44,318 bytes stored, inflating to 129,033 — about 690 bytes on chain for
the whole mechanism.

### The commons crosses a border — 2026-08-22

The port that had never met a real endpoint met two. A fresh key, funded
by the owner on both testnets and nowhere else, deployed `ParleyPort` at
nonce 0 on Base Sepolia and Ethereum Sepolia, so CREATE put it at the same
address on both — `0x65d1e9d08488a68ef6bf48e057ab69496333c7ae` — and each
port names that address on the other chain's eid as its only peer. No
second pass, no registry, no admin: the delegate reads zero on both
endpoints, as constructed.

```
port (both chains)   0x65d1e9d08488a68ef6bf48e057ab69496333c7ae
deployer             0x9a916d0bebf561643dc638c65f7afa8442d3fd13  (nonce-0 trick; disposable)
mint of #3           0xcf018dc066e6912f5bbb853e35826ecff02bd5f87f39f3a3fcddaf3d028c2286  (eth-sepolia)
echo out             0xff7b05c86c0843a9153c2e113fbbbfe0e973db7737526eb90e58f4123bb180e5  (323,518 gas)
delivery             0xe44941a1c36fe4d8d442a5523fde1f076bf8f562e446e2908748b36b4ea05b38  (base-sepolia, block 45828666)
```

Token #3 was minted on Ethereum Sepolia to the deploy key (the hub's
testnet price, 0.0001 ETH), and `echo(3, 0, "the commons, heard on
another chain", "")` paid the quoted 104,037,152,596,558 wei — the
port's own 22-byte default options on the wire, since the caller passed
none. The DVNs attested and the executor delivered in about eighty
seconds, and `node tools/port.mjs walk` read it back off Base Sepolia's
own `eth_getLogs`: one single-block query, from eid 40161, token 3, the
body intact. The federated archive walks exactly like the local one,
which was the design's whole claim.

What this run proves: the protocol-ABI fix is real (a message composed by
the real ULN, verified by real DVNs, executed by the real executor,
landed in `lzReceive(Origin,…)` and emitted `Echoed`); the
same-address-everywhere wiring closes with no admin; the default options
satisfy a real send library; and an unfunded stranger can read the whole
foreign conversation with no indexer. Costs, measured: ~0.00267 ETH on
Ethereum Sepolia for deploy + mint + echo; ~0.0000096 ETH on Base Sepolia
for its deploy. The records are `deployments/port-84532.json` and
`deployments/port-11155111.json`; the runbook is `OMNICHAIN.md` §5.
