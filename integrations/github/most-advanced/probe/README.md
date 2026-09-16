# probe/ — measurements, not machinery

Nothing in this directory ships, and nothing in it runs in `npm run check`.

These are the instruments used to answer a question the owner asked on
2026-08-22: whether a token that is a server and can hold other tokens
could run a music player, a game emulator, a cross-chain market, a render
market, or a holder's own shop. Every one of those questions has a number
attached to it, and a number nobody measured is an opinion.

So they were measured, on a real EVM, rather than recalled:

| tool | what it measures |
|---|---|
| `tools/probe-render.mjs` | what it costs the EVM to draw one pixel |
| `tools/probe-render-native.mjs` | the same field on a CPU, counted exactly, as the control |
| `tools/probe-emulator.mjs` | whether an emulator can run on each path the token has |
| `tools/emulator-envelope.mjs` | what an emulator costs to hold and to serve |
| `tools/probe-bridges.mjs` | what a settle message costs on each transport, priced today |
| `tools/probe-uln.mjs` | who actually secures a default LayerZero lane |
| `tools/probe-lz.mjs` | what LayerZero is on a given chain, read off it |
| `tools/probe-port-abi.mjs` | whether ParleyPort speaks the protocol's ABI or the mock's |
| `tools/probe-economy.mjs` | real gas for the settlement layer in `Bourse.sol` |

`Plate.sol` and `RefField.sol` are the answer to the question the owner
asked as "make the nft a GPU you can stake or mine", and they answer it by
disagreeing with the premise. `Plate.sol` states it in its own header:

> The compute is free: a phone draws this frame in sixteen milliseconds and
> nobody needs paying for it. What is not free is the frame still being
> there in twenty years at an address no company owns. So this market does
> not buy rendering. It buys permanence, and it buys the guarantee that the
> bytes are the right bytes.

Correctness is not asserted by a committee, it is refuted by anybody
willing to spend one transaction: a challenger names one pixel, proves it
sits under the posted root, and the chain recomputes that pixel from the
fixed-point reference field in `RefField.sol`. Disagreement pays the
challenger out of the poster's bond and reopens the job.

And it names its own ceiling, which is the part that makes it worth
keeping: the pixel the chain recomputes is the FIXED POINT reference, not
what any GPU drew. GLSL is not reproducible across drivers, so nothing on
chain can ever certify a screenshot.

`Bourse.sol`, `Parts.sol` and `Stall.sol` are prototypes those probes
deploy. They are sketches with real gas costs, not proposals — read them
as the arithmetic behind a recommendation and not as code anybody
intends to ship.

## How they got here, which is worth writing down

They were written by research agents during that investigation and swept
into two commits by a `git add -A` whose messages describe only the
console. That is a mistake with a name: committing what has not been
read. They have been surveyed since, none of them is reachable from
`npm run check`, and two mocks they added — `test/mocks/LzStub.sol` and
`test/mocks/XSettle.sol` — do compile, which is why the suites stayed
green rather than telling anybody.

`Plate.sol` arrived importing `lib/SSTORE2.sol`, a bare path that resolves
to nothing — the library is at `src/lib/`. Nothing in the check chain
compiles this directory, which is exactly why a file that could not build
sat here without complaint. Fixed, and all five contracts here now compile
under `dirs: ["src","probe"]`.

## Four open holes in the marketplace prototype

`tools/attack-bourse.mjs` runs four attacks against `Bourse.sol` and all
four still land. They are recorded here rather than fixed, because the
prototype exists to price a design and a hole priced is worth more than a
hole patched in a sketch nobody will deploy.

**B1 · the away-chain order-id namespace is free to squat.** An attacker
commits 0 wei at a victim's order id; the real buyer's 0.2 ETH commit then
reverts. Cost: one zero-value transaction, and the id is dead forever —
`refund()` sets `spent` and never clears `orderOf[order].buyer`.

**B2 · the home-chain receipt namespace is free to squat.** The attacker
self-buys a 1-wei junk lot naming the victim's order id, and the honest
seller can no longer deliver against it. Outlay: 1 wei, refunded to itself
through `owed[]`. Gas only.

**B3 · Berth never checks the asset arrived, and cannot.** This one is the
interesting one. `_AttackLiar.sol` is eight lines whose `transferFrom`
moves nothing and whose `ownerOf` returns `msg.sender`, so it tells every
caller what that caller hopes to hear. An `ownerOf(tokenId) ==
address(this)` check was added to `list()` and the attack defeated it in
the same run: the check calls into the attacker's contract and the
attacker said yes.

Every verification available here has that shape. You cannot ask a
contract whether it is honest, because the answer comes from the contract.
So the check was removed rather than kept, on the principle this codebase
learned twice in one day — a guard that looks like protection and is not
is worse than none. It is an identity problem: a buyer is buying a named
collection at a known address, and the answer is showing that address and
curating, never asking the lookalike to confess.

**B4 · the global rate limiter is a starvation lever.** The attacker fills
all eight of an hour's claim budget with 1-wei orders; the honest seller,
whose asset is already delivered, cannot claim. Cost for the hour: eight
wei and gas.

## What the adversarial pass found

`_AttackLiar.sol` is eight lines and it is a finding: an ERC-721 that
answers every call and moves nothing. `Berth` never checked, so a lot
could be listed against a contract that satisfies the interface and
transfers no token.

`Bourse.sol` gained the fix for a second one, and the way it was found is
the point — it was measured, not reviewed. An earlier draft let a filler
record the order receipt in a call of its own. Every field in that call is
public, so anybody could claim a funded order without having bought
anything. A receipt that is not written by the purchase is not evidence of
a purchase, so it is written by `buyFor` or not at all.

`AuditB64.sol` and `tools/audit-b64.mjs` exist because a design document
had been extrapolating base64 cost from a fitted formula
(`84.76*N + N^2/20972`) rather than measuring it, and because `tokenURI`
wraps twice, which is the case an estimate drawn from one wrap gets wrong.

`probe-economy.mjs` now runs end to end and prints real gas for a
cross-chain sale, its refund and its reclaim.

## The state of probe-economy

It was found broken and half-fixed: every deploy in it
read `r.createdAddress` from a harness that returns `r.address`, so every
address it captured was `undefined`. That fix is real and is kept. The
probe still reverts partway through, at `reclaim(bytes32)` with a custom
error, and it is left in that state deliberately rather than quietly
deleted — a measurement that stopped is a fact about the measurement.
