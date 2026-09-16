# OMNICHAIN — the research, the refusal, and the port made real

*2026-08-22. Everything in this document is either measured in this
repository's own tools, read verbatim from the LayerZero V2 protocol
source at commit `9c741e7` of `LayerZero-Labs/LayerZero-v2`, or cited to
where it happened. Numbers that will drift are dated.*

The owner asked for deep research on omnichain, LayerZero, and ONFTs, and
for the project to be made multichain. Three different answers, in order:

| | |
|---|---|
| **Is this project multichain?** | It already is, by partition: one edition of 4096, five chains, disjoint id bands, nothing to bridge and nothing to trust. That design survives contact with the research below and is not weakened here. |
| **Should the tokens become ONFTs?** | No — and the reasons are structural, not aesthetic. §3. |
| **Then what got upgraded?** | The one piece of LayerZero this collection already carries — the commons port — which turned out to speak a dialect no real endpoint would have understood. It speaks the protocol now, its security posture is stated honestly, and `tools/port.mjs` can put it on real chains. §4–§6. |

---

## 1 · The protocol, actually read

LayerZero V2 is a messaging layer, not a bridge: a contract on chain A
hands the local **EndpointV2** a payload for a contract on chain B, a set
of **DVNs** (decentralized verifier networks) each attest on B to the
payload's hash, and once the configured threshold agrees, **anyone** may
execute delivery — the paid executor is a convenience, never a
requirement. Endpoints are immutable contracts; the security choice —
*which* DVNs, how many, after how many confirmations — belongs to each
application, per lane, and that choice is the entire trust model.

The surface an application actually touches is small, and the port
declares it by hand, the way everything here is declared by hand:

- `quote(MessagingParams, sender)` / `send(MessagingParams, refund)` —
  price and dispatch. `MessagingParams` is `(dstEid, receiver-as-bytes32,
  message, options, payInLzToken)`.
- The receiver contract answers three questions, and all three are part
  of the wire protocol:
  - `lzReceive(Origin, guid, message, executor, extraData)` — delivery.
    `Origin` is a **static tuple** `(uint32 srcEid, bytes32 sender,
    uint64 nonce)`, and the tuple is part of the canonical signature:
    the selector is `0x13137d65` and nothing else dispatches.
  - `allowInitializePath(Origin) → bool` — consulted by the endpoint's
    `verify()` before the **first** packet on a lane can be committed. A
    receiver that answers false, or cannot answer, is not deaf but
    unborn: the lane never initializes.
  - `nextNonce(uint32, bytes32) → uint64` — never called on-chain; the
    off-chain executor asks it whether the app wants ordered execution.
    Zero means no ordering promised, which is what the port answers:
    speech carries its own back-links, so arrival order is cosmetic.
- **Options are mandatory.** The ULN302 send library refuses options
  that name no `lzReceive` gas — an empty `bytes` fails at quote time
  with `Executor_NoOptions`. A type-3 options blob is 22 bytes:
  `0x0003` (container) `01` (executor) `0011` (length 17) `01`
  (LZRECEIVE) + gas as uint128.
- **Endpoint ids are not chain ids.** Mainnet eids are 30xxx, testnet
  eids 40xxx, and neither derives from the EVM chain id. The registry
  still carries a *legacy* Ethereum Sepolia record at eid 30161 with no
  endpoint behind it; the live one is 40161. Wire 40161.

The DVN configuration is worth a paragraph, because it is where the
money goes when this goes wrong. Every OApp either pins its own
libraries and DVN set, or floats on per-chain **defaults that LayerZero
Labs can roll forward without notice** — their own documentation says
the defaults "may change without notice" and may even be dead
placeholders. A **delegate** — an address registered with the endpoint —
can re-point all of it later, and can also censor or discard verified
messages (`skip`, `nilify`, `burn`). A delegate is an admin key over the
whole lane, which is why this collection's port zeroes it at
construction and has no function that can set it again.

## 2 · What the five chains actually carry (measured)

`tools/site.mjs` carries the measured table for the edition's chains, and
this session extended and corrected it. Every entry below was read off
the chain named — code present, `eid()` answering — not off a docs page:

| chain | id | eid | EndpointV2 | lzRead |
|---|---|---|---|---|
| Ethereum | 1 | 30101 | `0x1a440760…728c` | yes |
| Base | 8453 | 30184 | `0x1a440760…728c` | yes |
| Unichain | 130 | 30320 | `0x6F475642…DD5B` | yes |
| BNB | 56 | 30102 | `0x1a440760…728c` | yes |
| Robinhood | 4663 | 30416 | `0x6F475642…DD5B` | **no** |
| Ethereum Sepolia | 11155111 | 40161 | `0x6EDCE654…f10f` | yes |
| Base Sepolia | 84532 | 40245 | `0x6EDCE654…f10f` | yes |
| Robinhood Testnet | 46630 | 40451 | `0x3aCAAf60…Fe32` | — |

Two canonical mainnet endpoint addresses exist, not one — early chains
at `0x1a44…`, later ones at `0x6F47…` — and the testnets mostly share a
third. **Robinhood's testnet uses a fourth**, and that row is a
correction: `site.mjs` had recorded, twice, that Robinhood testnet
carried no endpoint at all, measured at the three known addresses. The
measurement was real and the conclusion was false — LayerZero's own
metadata registry names `0x3aCAAf60502791D199a5a5F0B173D78229eBFe32`,
and reading that address over `rpc.testnet.chain.robinhood.com` this
session found 24,005 bytes of code (the size of a full EndpointV2)
whose `eid()` answers 40451. "Not at the addresses I knew" had been
written down as "not deployed". The table and the comment now say what
the chain says.

What Robinhood mainnet still cannot do is **lzRead** — it carries no
read library, so it can neither ask nor be asked, which is the measured
fact behind its band being the edition's smallest.

## 3 · ONFT, actually read — and why the tokens stay put

ONFT721 is LayerZero's omnichain NFT standard, and it does exactly one
thing: move a token id between chains. Two shapes: **native** (the
collection contract burns on the source chain and mints on the
destination; no chain is canonical) and **adapter** (an existing
collection is locked in a wrapper on one canonical chain; every other
chain mints shadow copies). The wire message is `(to, tokenId)` and
nothing else. Metadata does not travel; each deployment answers
`tokenURI` from whatever it locally is.

For this collection the disqualification is structural, in ascending
order of severity:

1. **The message cannot carry what the token is.** `tokenURI` here is
   computed from chain-local state — the section word, the stats, the
   market, the seal, the kernel. An ONFT copy elsewhere is a blank twin
   unless the entire hub/renderer stack is redeployed and re-seeded
   there, *which the id-band partition already does, without a bridge
   and without a verifier to trust*.
2. **The vaults cannot come.** An ERC-6551 account address commits to
   the chain id — it is in the registry's CREATE2 preimage — so "the
   same token on another chain" has *different, empty* Reach and Grip
   accounts. Burn-and-mint strands everything both vaults hold, forever
   (the controlling token stops existing); lock-and-mint freezes it for
   the duration (the adapter owns the token and has no function to
   operate its accounts). The Grip's whole design is that nothing can
   move what it holds; an ONFT would convert that from a guarantee into
   a burial.
3. **The bands are the supply guarantee.** 4096 exists because five
   constructors enforce five disjoint ranges by arithmetic. A mesh in
   which ids migrate makes total supply a property of message history
   across five chains, verified by whichever DVNs were configured —
   precisely the class of promise this collection was designed not to
   make.
4. **The operator role it imports is the one this collection refuses.**
   An ONFT carries an owner and a delegate who choose peers and DVNs
   and can change them. On 2026-04-18 that arrangement minted 116,500
   unbacked rsETH (~$292M) when the single DVN securing KelpDAO's OFT
   lane — LayerZero Labs' own — was compromised by Lazarus; a survey
   afterwards found 47% of active OApps running 1-of-1 verification.
   The protocol "functioned exactly as intended", which is the point:
   the trust model *is* the configuration, and someone holds the pen.
   Nobody holds a pen here.

The industry datapoint that settles it: when Yuga Labs connected BAYC to
ApeChain in 2025 they did **not** bridge the tokens — they shipped
soulbound "Shadow" twins whose ownership is synced by lzRead, the
originals never moving. The largest NFT brand in LayerZero's own
ecosystem chose awareness over transport for its crown jewels. This
collection's partition is a stronger version of the same posture,
adopted three design-generations earlier.

**OFT for the Kiln's coins is refused on the same grounds.** A launched
`Coin` is deliberately featureless — fixed supply, no owner, no mint, no
pause — because "a launchpad that offers those levers is a rug factory."
An OFT is a standing mint authority governed by peer and DVN
configuration; welding one onto a coin whose entire value proposition is
that no such authority exists would un-launch every coin already
launched. A holder who wants an omnichain coin can launch one elsewhere
and pool it here; the Kiln does not decide that for them.

**lzRead is noted and not adopted.** A pull-based read of another
chain's state, attested by read-capable DVNs, delivered back to the
asking chain — the measured cost from Unichain reading Ethereum was
1.957e-5 ETH against 3.404e-4 to message it, seventeen times cheaper.
It is the right primitive for a *contract* that must act on another
chain's state. Nothing here must: the site's pages and the console read
whatever chain the reader points them at, and a browser can ask five
RPCs directly for free, with no DVN in the trust path. The day a
contract here genuinely needs another chain's answer on-chain — a
cross-chain census, a shadow-style attestation — lzRead is the shape,
`site.mjs` already records which chains carry it, and the port's
pin-at-construction pattern is the governance. That day is not forced
early.

## 4 · What the research found broken here, and the fixes

Reading the protocol source against this repository's one LayerZero
contract found the port undeliverable, twice over, and its
documentation overclaiming once. All three are fixed; all three were
the same species of error — **the suite's mock had been written to
match the contract, so the suite certified the dialect instead of the
protocol.**

**The port spoke its mock's ABI.** `lzReceive` was declared with `bytes
calldata origin` where the endpoint sends the `Origin` struct — a static
tuple, three words inline, and the tuple is part of the signature. The
selector the endpoint dispatches is `0x13137d65`; the port answered only
its own invented `0x42172c88`. It also lacked `allowInitializePath` and
`nextNonce` entirely, so no lane toward it could ever have initialized.
`tools/probe-port-abi.mjs` measured the before-state at the deployed
bytecode — three protocol selectors, three `revert 0x`, no dispatch —
and measures the after-state now: the real `lzReceive` reaches the named
refusal `NotTheEndpoint` (`0x839e0a50`), `allowInitializePath` answers 1
for the built peer, `nextNonce` answers 0, and the mock's old dialect
falls through to nothing, which is the healthy answer. The probe itself
carried two bugs the fix exposed — a message offset two words adrift,
and a display that sliced off the byte where a bool keeps its truth —
both narrated where they sat.

**The port sent empty options.** The real send library refuses options
that name no lzReceive gas; the mock accepted anything, so `echo(...,
"0x")` passed here and would have failed at quote time on every real
chain. Empty now means the port's own 22-byte default (200,000 gas,
written out byte-for-byte in the source), and the mock refuses
sub-2-byte options the way ULN302 does, so the suite proves the default
reaches the wire.

**"The verifier set is as immutable as the bytecode" was false.** The
port has no admin — that was and is true. But an OApp that pins nothing
floats on the endpoint's *defaults*, and LayerZero Labs can roll those
forward without the port's consent. The constructor now takes the pin as
arguments — per-lane library choices and raw `SetConfigParam` entries,
applied once by the OApp itself (the one caller the endpoint authorizes
with no delegate) and never writable again — and a deployment that
passes empty arrays floats *as a stated choice*. For speech that trade
is admissible: the worst a rolled default or a dead pinned DVN can do is
silence echoes or forge one, and a forged echo arrives visibly foreign
under the port's own event. Pin a 1-of-1 verifier under something that
mints and you are reading about yourself in a postmortem.

The mock endpoint now performs the real handshake — `allowInitializePath`
before delivery, delivery built with `abi.encodeCall` against the
canonical interface so the selector is the compiler's, and an
`inject`/`deliverUnchecked` pair so the suite can stand where a hostile
verifier would. `tools/verify-port.mjs` runs 42 assertions (from 24),
the new ones asserting the protocol selectors byte-for-byte the way
`selftest.mjs` asserts published vectors, the lane-initialization truth
table, the options default, the constructor pin, and refusal on both
sides of the border. Invariants 138 and 141–143 in `INVARIANTS.md` name
each property and the assertion that enforces it. The Solidity suite
(135 tests) and the adjacent verifiers (`verify-parley` 37,
`verify-premises` 32) still pass untouched.

## 5 · The port on real chains: `tools/port.mjs`

The port had no deployment path — not in `site.mjs`, not in
`testnet.mjs`, not in any record. It has one now, and the wiring problem
it solves is worth stating: every port's peers are fixed at
construction, and every port must name every other port, so somebody has
to know all five addresses before any of them exists.

The answer is that a CREATE address depends on the deployer and its
nonce and on nothing in the constructor. Deploy from a **fresh key**
whose nonce is zero on every chain and the port lands at the **same
address everywhere**; each port then names its peers as its own address
on the other chains' eids, and the circle closes with no second pass, no
registry, and no admin to do the closing. The tool enforces the nonce
and refuses otherwise. This session proved the invariant live without
spending anything: dry runs against Base Sepolia and Ethereum Sepolia
from one fresh key predicted `0xffb2d3e3…02a3` on both.

```bash
RPC_URL=… node tools/port.mjs status        # endpoint measured, eid read, nonce shown
RPC_URL=… PRIVATE_KEY=0x… node tools/port.mjs deploy --peers 84532,…  [--dry]
RPC_URL=… PRIVATE_KEY=0x… node tools/port.mjs echo --port 0x… --from 1 --text "…"
RPC_URL=… node tools/port.mjs walk --port 0x…   # single-block getLogs, counted
```

`status` was run against all three testnets this session and measured
all three endpoints at 24,005 bytes with the eids the table claims.
`deploy` reads the local Parley from `deployments/<chain>.json`, builds
the six constructor arguments, predicts, deploys, and then reads
everything back — eid, every peer, the zeroed delegate — because a
deploy that is not read back is a hope. `walk` reads the echoed archive
backwards one single-block query at a time and prints the count, the
same claim `verify-parley` makes for the local archive.

The federation rehearsal, when someone holds funded testnet keys:

```bash
# one fresh key, funded with a little gas on BOTH chains, nonce 0 on both
RPC_URL=https://sepolia.base.org               PRIVATE_KEY=$K node tools/port.mjs deploy --peers 11155111
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com PRIVATE_KEY=$K node tools/port.mjs deploy --peers 84532
# then, from any holder of a token on either chain:
RPC_URL=… PRIVATE_KEY=… node tools/port.mjs echo --port 0x… --from 1 --text "the commons, heard on another chain"
# and on the far chain, after the DVNs attest and anyone delivers:
RPC_URL=… node tools/port.mjs walk --port 0x…
```

This runbook has now been run, and the lane is live. The owner funded a
fresh key generated in this container (0.02 / 0.01 testnet ETH), and the
nonce-0 deploys landed the port at
`0x65d1e9d08488a68ef6bf48e057ab69496333c7ae` on **both** chains, delegate
zero on both, each naming the other as its only peer. Token #3 was
minted to the key on Ethereum Sepolia and
`echo(3, 0, "the commons, heard on another chain", "")` paid its quoted
104,037,152,596,558 wei — the port's own default options on the wire.
The real DVNs attested, the real executor delivered in about eighty
seconds (`lzReceive(Origin,…)` dispatched, `Echoed` emitted in Base
Sepolia block 45,828,666), and `port.mjs walk` read the message back off
the far chain's own `eth_getLogs` in one single-block query. Every
transaction hash is in `DEPLOYMENTS.md`; the machine records are
`deployments/port-84532.json` and `deployments/port-11155111.json`. The first
cross-chain message in the collection's history was composed, verified,
delivered and re-read by infrastructure this repository does not run —
which was the entire claim under test.

## 6 · What remains, stated so nobody mistakes it for done

- **The testnet lane is live; the mainnet lanes are not.** The two
  Sepolias carry a working federation as of 2026-08-22. No mainnet
  port exists, and the mainnet deployment decision — including whether
  to pin DVNs per lane — remains open, per below.
- **The clients do not yet show echoes.** `Echoed` logs are walkable —
  `port.mjs walk` does it — but `DeskTalk` and the console render only
  the local archive. Showing foreign speech means handing the pages the
  port's address, and pages are immutable constructor arguments: that
  is a new `PageTalk` and a new `Premises`, the documented price of
  changing the site. It should ride along with the next site redeploy
  rather than force one.
- **Pinning wants real DVN addresses.** The pin mechanism is built and
  tested; choosing the DVN set for each mainnet lane (and whether to
  pin at all, against the brick-risk of a pinned operator retiring) is
  a deployment-day decision, made per lane, in public, in the
  deployment record.

What is *not* remaining, because it is refused rather than pending:
tokens that bridge, coins that mint by committee, and any admin over any
lane. The five chains issue one edition. Nothing crosses but speech.
