# INTERFACE — how a person and a program reach the same functions

*2026-08-23. The owner asked for the ways into this collection — connect,
chat, swap, launch, the rest — to be redesigned for people, and made
legible to programs. This document records what was found, what shipped,
what was deliberately left, and the rulings that bound all three. The
audit behind it read every page contract, both clients, the console
specification's rulings, and the size of every contract against the
EIP-170 ceiling; the numbers in here were measured on 2026-08-22–23.*

## The finding, in one paragraph

The collection did not need a new interface; it needed the one it had
designed to actually ship. CONSOLE.md is a complete, argued specification
for the human surface — and the shipped code carried a fraction of it,
while the door still led with the two things that specification had
already deleted (the tesseract, and a third hand-written copy of the
door map). The agent surface had the same shape: `services.json` is the
designed machine contract, and it sold five services while the humans had
fifteen — including selling a lease whose powers it never taught, and
never mentioning the one integration designed *for* programs (session
keys). So this redesign is mostly the specification catching up with
itself: pre-approved debt shipped, drifted copies collapsed to one
source, and the two named-but-unbuilt surfaces built.

## What shipped for a person

- **A connect control that exists.** The console's only connect
  affordance was typing the word "connect" into the command line. The
  crest cell that names the wallet is now the control: "read only —
  connect" when a wallet is present and unasked, a tap to ask. No new
  chrome; the cell that carries the fact carries the act.
- **The wrong chain refuses before the button, not after** (§E.5,
  shipped). The crest compares the wallet's chain to the token's the
  moment the wallet answers, names the mismatch, and offers the one move
  that fixes it. `propose` refuses to build a slab while the mismatch
  stands — a slab built for the wrong chain is a trap with a countdown.
  A provider that cannot say its chain leaves the wallet's own guard in
  charge; unknown is not wrong. Driven by `verify-console`: on chain
  9999 a control raises no slab and nothing is sent.
- **The transaction has a life after "Sent"** (§E.9, shipped). The slab
  now always names To, Value and Function beside the lane's own
  sentences, and after the press the ticker follows the hash: mined in
  block N, reverted in block N, still not mined, not mined after three
  minutes. "Sent · 0x…" used to be the entire post-signature experience
  of every surface on the site.
- **The mint pays what it reads.** The console's mint slab claimed
  "Price: read by the wallet from the contract" — a thing no injected
  wallet does — and sent zero value at a payable function. The lane now
  reads `price()` (the selector joined `PageConsole._sels`, derived on
  chain like every other), states it before the button, attaches it to
  the send, and refuses to guess when the read does not answer. The
  door grew the same mint as a button, priced in its label, running the
  terminal's own `mint` word — one code path for the person and the
  agent.
- **A turn a person can audit.** The TURN slab printed the section word
  before and after as two raw decimal uint256s. It now says what moved:
  plane by plane, in degrees, plus the cut and the hue. The word itself
  still rides in the calldata the slab names.
- **One door map, one source.** The door's rotating tesseract — 2-D,
  gold, mouse-only, and the third unsynchronized copy of the door list —
  is deleted, which is the deletion CONSOLE.md had already ruled ("it is
  the symptom"). What replaced it is a server-rendered task list in a
  person's words, each row defining the one house term it uses (the
  commons, a token's own market, the Grip), and `window.DOORS` is
  *derived from those anchors* — the copy a program enumerates is the
  copy a person read, because neither is a copy.
- **Smaller honesties.** The wallet that holds nothing is information,
  not an error, and no longer wears refusal-red. Held-token rows link
  the console first. The door's duplicate status line is gone. The
  chain switcher carries all five chains of the edition (the fifth was
  "another chain"). The wallet answers `accountsChanged` and
  `chainChanged` instead of saying "you" to a stranger.

## What shipped for a program

- **`services.json` is now `ipseity.services/2`** — every /1 key
  survives; a /1 reader reads /2 and learns less. What grew:
  - **The mint has a door, not only a price**: `mint.invoke` beside
    `mintPriceWei`, value stated exactly.
  - **The lease teaches its powers**: `rent.use` carries `commit` and
    `setTrait` with on-chain-derived selectors and the address they act
    on. The manifest used to describe what a renter may do and serve no
    way to do it.
  - **The session surface is discoverable**: a sixth service — grant,
    act, check, revoke — with the rule that keeps an agent solvent
    stated in place: check before act, because a refusal read from a
    view costs nothing.
  - **Parley teaches `speak`**, not only the walk.
  - **`deskTerm` is named in the index**, so an RPC-only agent can
    `eth_call` `config()` — the full selector table behind the
    terminal's ~35 words — without ever executing a page's script.
  - **The routes name `/c/<id>` and `/k/<id>/<key>`.**
- **`/k/<id>/<key>` exists** — CONSOLE.md §I's "first thing to add",
  built as specified and bounded as argued: the granted key's own front
  door, the one surface in the system where the actor is not the
  holder. It renders the envelope (active, still the current holder's,
  expires, cap, spent, the seal's shadow), states plainly that the
  allowlists are *not* enumerable (they live in the grant transaction's
  calldata; the account cannot be redeployed to store them), offers the
  check — one door at a time through `sessionAllows` — and builds the
  one act, `executeAsSession`, always checked before proposed and
  always proposed before sent. The id is in the path because a bare key
  cannot find its granting account without an indexer.

## What was honored, not reopened

Every ruling the audit surfaced stands: reading is never gated and
holding is never login; controls are shown and refused by the chain,
never hidden; the artwork is never served through a page; `/` still
serves the instrument (argued in place at the route); the two trading
surfaces stay two because who is paid the fee must stay loud; no
localStorage in the console; no dashboard, no inbox, no reconstructed
history, one raymarcher; the confirm slab stands between every field and
every broadcast; selectors are computed on chain and the browser ships
no keccak and no floating point for any amount; "zero" and "no answer"
remain different facts, including on the new key page.

## What remains, stated so nobody mistakes it for done

- **The lanes are still thin.** TRADE and SPEAK remain honest notes;
  HAND carries only the irreversible transfer. CONSOLE.md §D maps all
  101 actions and §H.2 sketches the satellite-lane stores that keep
  PageConsole under the ceiling while the lanes fill. That is the next
  tranche, and the spec's strings are already written.
- **The instrument's own frictions** — the unpriced plate, the
  illegible sealed nodes, the read-only visitor who cannot leave for
  the console — ship on the Engine/Renderer path, not the site path,
  and are catalogued in the audit for an engine redeploy.
- **A machine-readable error table** (custom-error selectors per
  service) is the cheapest remaining legibility win for humans and
  agents at once; it belongs in a /2.1 alongside argument annotations.
- **The terminal's `go` map** lives in a contract at 97.3% of the
  ceiling and still lacks the newest doors; the door map is now the
  authoritative list, and a `DeskGo` companion re-registering `go`
  through `TERM.def` would retire the drift for good.

## Where the tests hold it

`verify-console` drives the connect crest, the wrong-chain refusal, the
slab's one-transaction rule and the walk (55 assertions);
`verify-site` holds the door map's one-source property, the /2 schema
(every selector against keccak, the rented powers, the session block,
the mint door, `deskTerm`), and the `/k` route's envelope, canonical
URL, and on-chain selectors. `INVARIANTS.md` names each property and
the assertion that enforces it.
