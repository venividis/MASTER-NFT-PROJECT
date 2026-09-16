# THE CONSOLE — BUILD SPECIFICATION

**IPSEITY · `/c/<id>` · version one**

---

## 0 · HOW THE FOUR DESIGNS WERE RESOLVED

Three judges ranked differently. They are not averaged. The rulings:

**Ruling 1 — the spine is VERB FIRST (Design 4), not THE LOG or THE PLAN.**
First-use ranked it 1st, beauty ranked it 4th. First use wins, because the owner's brief is verbatim *"from first principles and user friendliness"* and *"really get that part right this time"* — and because the beauty judge's complaint is **repairable by grafting** (a palette, a spine, a still, a form) while the first-use judge's complaint about the others is **not** (a person who cannot read `Strata 6` or `Icositetrachoron` on arrival cannot be taught by better CSS). Verb-first surfaces are the only ones in the set that require no prior knowledge.

**Ruling 2 — the per-subject hue spine (Design 1) is structural, and it carries the walk.**
The beauty judge's must-survive. In this console it is not decoration in a card: **depth is the number of 1px rules in the left margin, each rule the hue of the token at that level, each rule tappable to return to it.** This is the direct answer to *"I dont know where they come from or why they are there."* It also repairs Design 4's flat re-point walk, which the beauty judge correctly called "a map where there was a wow."

**Ruling 3 — the first paint is server-rendered from `request()`'s own chain reads, and the stylesheet is stored uncompressed (Design 3's engineering).**
The truth judge's must-survive, verified: `PageToken.sol:48–68` already reads `HUB.sectionOf/ownerOf/locked/kernelStatus`, `POOL.market(id)` and `LEASE.listing(id)` inside `request()`. This deletes `DeskTalk`'s `1+N` sequential `eth_call` arrival and the `MINE[0]` guess in one move, and it is the only thing that makes the degradation sentence in §E true rather than soothing.

**Ruling 4 — the twelve-node ring is not the information architecture. Not as a menu, not as an index, not as a taxonomy.**
Both the first-use and beauty judges named this as their must-not, for different reasons and with the same verdict. The engine's own slot names (SELF, SCAN, ISSUE, NEST, SIGN) never appear in the console. The ring does not appear either — its portrait function is served by `Sigil.svg`, which is the token's actual face and costs one `pure` call.

**Ruling 5 — the console has no history, with one exception, and says so.**
The truth judge's must-not: Design 2's descending multi-address `eth_getLogs` scan fails silently and renders as complete. Refused as a surface. What survives from THE LOG is its **ahead** half (clocks read from storage — which converges exactly with Design 4's clock system) and its **latent fold** (*"nine things this token has never done"*), which is the best empty-state idea in the set and the best thing anyone wrote for a fresh token.

The one exception: **`Parley`'s back-pointer walk** (`lastSpoke[id]` → `prevFrom`, one single-block query per message, no range scan) is exact, bounded and free. So the one place the console shows the past is the one place it can show it truthfully — SPEAK AS IT. That is a statement, not a compromise, and the copy says it out loud.

**Ruling 6 — the beauty judge's charge that verb-first is "a fixed left sidebar wearing the engine's palette as a skin" is answered by four grafts, not by rebuttal:** the hue spine (Ruling 2), the still as the largest object on the page, the latent fold replacing every column of `none`, and one clock per verb rendered in the engine's own grammar. If those four are cut in implementation, the design has failed and the charge stands.

---

## A · THE THESIS

**The console is the token's own workbench: one document, one route, seven things a holder can do with the object they are holding, named in plain imperative English, in that token's own colour, correct before a single byte of JavaScript runs.** It answers *whose token, which chain, is it mine, how deep am I, how do I get back* at every pixel of every state, because those five facts are the fixed chrome and everything else is the work. It refuses to be a sitemap: there are no nineteen doors, no fourteen-word nav bar, no tabs, no gallery as a top-level place, and no page whose only content is links to other pages. It refuses to be a dashboard: no fiat value, no portfolio total, no chart, no aggregation across the five chains that have no bridge. It refuses to be an inbox: no toasts, no badges, no unread counts, no notification centre — every piece of unsolicited state in this system is a date, and a date is printed on the door of the thing it is about, one per verb, never a stack. It refuses to be a historian: it shows what is true now and what is scheduled, never a reconstructed past it cannot prove complete. And it refuses, absolutely and structurally, to run a second 4-D field: **there is exactly one control in the whole console that produces a raymarcher, and it navigates.** Looking into another token stays possible, stays free, and stays legible — you can walk three deep, each level a coloured line in the left margin, each line the way back out — but what you see there is the token's still, drawn on chain, not its instrument.

---

## B · THE COLD OPEN

Route: `/c/2049`. The holder typed `/connect` in #2049's instrument on Unichain thirty seconds ago.

### B.1 · Byte order of the response

`Console.request()` emits, in this order, one `bytes.concat` over a pre-sized buffer:

| # | bytes | what |
|---|---|---|
| 1 | ~420 | `<meta>`, `<title>IPSEITY #2049</title>`, `<style>` open |
| 2 | ~10,200 | **the stylesheet, raw**, from `ConsoleSkin` SSTORE2. Not gzipped. Reason: a `<style>` must be present before paint; inflating in JS is a flash of unstyled console, and paint correctness beats bytes |
| 3 | ~30 | `</style>`, `:root{--h:214}` written from the token's hue trait |
| 4 | ~1,900 | `window.CON = {…}` — the seed block (§H.4) |
| 5 | ~3,100 | `<img src=… >` — `Sigil.svg(2049, word, seed, strata)` inlined as a data URI |
| 6 | ~2,600 | the crest, the identity block, the seven verb rows, the ticker, the command line — **all server-rendered with real values** |
| 7 | ~1,300 | the raw bootstrap loader (§H.3) |
| 8 | ~44,000 | ten base64'd gzip blobs: core + nine lanes, inert until opened |

**~64 KB.** No skeleton. No spinner. No `MINE[0]`.

### B.2 · What is on screen at first paint, in reading order

```
TOKEN #2049 ▏ CHAIN Unichain ▏ HELD 0x71c7 … 976f ▏ ● ▏  #2049 ▏ …
```

Two frames later `eth_accounts` resolves and the HELD cell rewrites to one word:

```
TOKEN #2049 ▏ CHAIN Unichain ▏ HELD you ▏ ● 0x71c7 … 976f ▏  #2049 ▏ …
```

It is never blank and never wrong. A holder never compares forty-two hex characters by eye.

Then, down the left column, exactly this, with exactly this copy:

```
┌──────────────────┐
│                  │
│    the still     │      Sigil.svg, 184px, 1px solid var(--rule)
│                  │
└──────────────────┘
see it turning →

IPSEITY #2049
A 24-cell, cut at +0.41 and turned on two planes.
Held by you, on Unichain. Forty-seven things have been done to it.
```

Then, if and only if something is both soon and irreversible-if-missed, one standing line (see §E.6). On the normal day there is none, and the absence of unsolicited state looks like nothing at all.

Then the surface:

```
TURN IT
the word · the cut · the hue · the face it shows

PUT SOMETHING IN IT
what it holds, and what it can spend

TRADE THROUGH IT
its own exchange · swaps · the fee it earns

HAND IT ON                                              4 days
for an afternoon, a season, a price, or for good

SPEAK AS IT
the commons · whispers · rooms · what it signs

MAKE SOMETHING WITH IT
draw the next one · launch a coin · give it a name

LOOK AT ANOTHER ONE
any of the four thousand · any address
```

The sub-lines are mandatory and are the fix for the first-use judge's one real objection ("two of the seven are guesses"). **No sub-line may contain a contract noun.** Not Reach, not Grip, not Parley, not Kiln, not Locker, not Consign, not Nameplate, not Succession. Those words are earned one tap down, inside a sentence that defines them.

The right pane at `/c/2049` is empty until a verb is chosen. It carries one line, 11px `--mid`, vertically centred:

> Seven things, and nothing else. Whatever you press, the way back is the same press.

Bottom left, the ticker, fading to `.55` after 7s and never disappearing:

> The wallet is bound and the token came with you. Nothing here has asked for a signature yet.

Bottom, the command line: `›` and one input.

### B.3 · The arrival variants

**Arrived mid-turn** (`#u=<wordhex>` in the fragment). The still is re-fetched client-side from `Sigil.svg` with the uncommitted word, drawn with `border:1px dashed var(--a-dim)` — the sheet's existing law that dashed means *not settled*. Identity line 2 gains a clause, and TURN IT gains a marker in `--warn`:

```
A 24-cell, cut at +0.41 and turned on two planes — not committed.
…
TURN IT                                            uncommitted
```

Ticker:

> An uncommitted turn came with you. It is not on chain and it will not survive this tab.

This is the whole answer to "carry the state across `/connect`." The one act that would make it real is one press behind the one word that names it.

**Arrived with no id** (`/c` — a bookmark, a typed address). The crest paints in `--rule-2`, no hue. The column is the wallet's held tokens as a list of stills. Ticker:

> No token was named on the way in. These are the ones this wallet holds on this chain; open one to give the page a colour.

**Fresh token.** See §E.4.

---

## C · THE FULL LAYOUT

### C.1 · Regions

| region | fixed | z | contents |
|---|---|---|---|
| `#crest` | top, `46px + --safeT` | 7 | Token · Chain · Held · wallet LED+address · walk crumbs · `…` |
| `#col` | scrolls | 1 | still · `see it turning →` · identity · standing line · seven verbs |
| `#lane` | scrolls | 1 | the chosen verb's workspace, and nothing else |
| `.rung` | absolute, in the margin | 3 | one tap target per walk level, over its 1px rule |
| `#tick` | bottom-left | 6 | one status line, three states, `<b>` in accent |
| `#cmd` | bottom, `36px + --safeB` | 6 | `›` + one input; on focus becomes the palette |
| `#cbox` | full | 9 | the confirm slab, lifted from `propose()` verbatim |

Two independent scroll containers. The body never scrolls. `#crest`, `#tick` and `#cmd` are true at every pixel of every state.

### C.2 · Desktop, ≥ 900px

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ TOKEN #2049 ▏ CHAIN Unichain ▏ HELD you ▏ ● 0x71c7 … 976f ▏  #2049  ▏    …   │ 46
├─┬─────────────────────────┬───────────────────────────────────────────────────┤
│▌│  ┌───────────────────┐  │  HAND IT ON                                       │
│▌│  │                   │  │                                                   │
│▌│  │      the still    │  │  Four ways to let someone else have it: for an    │
│▌│  │       184 px      │  │  afternoon, for a season, for a price, or for     │
│▌│  └───────────────────┘  │  good. Only the last one is irreversible.         │
│▌│  see it turning →       │                                                   │
│▌│                         │  RENTED OUT                     until 26 Aug · 4d │
│▌│  IPSEITY #2049          │  Renter                         0x33b1 … 90aa     │
│▌│  A 24-cell, cut at      │  Collected so far                     0.06 ETH    │
│▌│  +0.41 and turned on    │  Waiting to be collected             0.014 ETH    │
│▌│  two planes.            │  ──────────────────────────────────────────────   │
│▌│  Held by you, on        │  COLLECT                                          │
│▌│  Unichain. Forty-seven  │  [ Collect 0.014 ETH ]                            │
│▌│  things have been       │  ──────────────────────────────────────────────   │
│▌│  done to it.            │  FOR GOOD                                         │
│▌│                         │  Send it to    [ 0x…                        ]     │
│▌│  TURN IT                │  A transfer ends the lease it is under and the    │
│▌│  the word · the cut …   │  renter is refunded for the days they did not     │
│▌│  PUT SOMETHING IN IT    │  get. Settle the books first, or the arithmetic   │
│▌│  what it holds, and …   │  happens against the new holder.                  │
│▌│  TRADE THROUGH IT       │  [ Bring the books up to date ]                   │
│▌│  its own exchange · …   │  [ Review the transfer ]                          │
│▌│▎HAND IT ON      4 days  │                                                   │
│▌│  for an afternoon, a …  │                                    ↕ scrolls      │
│▌│  SPEAK AS IT            │                                                   │
│▌│  the commons · whis…    │                                                   │
│▌│  MAKE SOMETHING WITH IT │                                                   │
│▌│  draw the next one · …  │                                                   │
│▌│  LOOK AT ANOTHER ONE    │                                                   │
│▌│  any of the four tho…   │                                                   │
├─┴─────────────────────────┴───────────────────────────────────────────────────┤
│ Read the lease. 0.014 ETH has vested.                                         │
│ ›  hand                                                                       │ 36
└───────────────────────────────────────────────────────────────────────────────┘
 ▲
 └ the margin rule — 1px, #2049's hue, full height, tappable
```

`#col` is `300px`. `#lane` is `minmax(0,1fr)`, `max-width:680px`, left-aligned.

### C.3 · At depth 2 — looking into #1024

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ TOKEN #1024 ▏ CHAIN Base ▏ HELD 0x9f3a … 44b1 ▏ ● 0x71c7 … 976f ▏ #2049›#1024 │
├─┬─┬───────────────────────┬───────────────────────────────────────────────────┤
│▌│▌│  ┌─────────────────┐  │  TRADE THROUGH IT                                 │
│▌│▌│  │   #1024's still │  │  open · WETH / DAI · 1.00%                        │
│▌│▌│  └─────────────────┘  │  …                                                │
│▌│▌│  see it turning →     │                                                   │
│▌│▌│                       │                                                   │
│▌│▌│  IPSEITY #1024        │                                                   │
│▌│▌│  A tesseract, cut at  │                                                   │
│▌│▌│  −0.12.               │                                                   │
│▌│▌│  Held by 0x9f3a …     │                                                   │
│▌│▌│  44b1, on Base.       │                                                   │
│▌│▌│                       │                                                   │
│▌│▌│  TURN IT ·            │                                                   │
│▌│▌│  only 0x9f3a … 44b1   │                                                   │
│▌│▌│  can turn this        │                                                   │
│▌│▌│  PUT SOMETHING IN IT  │                                                   │
│▌│▌│ ▎TRADE THROUGH IT     │                                                   │
│▌│▌│  HAND IT ON ·         │                                                   │
│▌│▌│  nothing here is      │                                                   │
│▌│▌│  yours to hand on     │                                                   │
│▌│▌│  …                    │                                                   │
├─┴─┴───────────────────────┴───────────────────────────────────────────────────┤
│ Standing in #1024 · Base. Read only — you hold #2049. Nothing here will sign. │
└───────────────────────────────────────────────────────────────────────────────┘
  ▲ ▲
  │ └ #1024's hue, full strength — where you stand
  └── #2049's hue, --a-dim — tap to walk out
```

**Depth is the number of lines in the left margin, and each line is the colour of the token it belongs to.** No word says "you are two deep." Capped at `MAX_DEPTH = 3`, the same number and the same reason as `engine/ipseity.html:3653`; at the cap the LOOK lane's walk control is `.shut` and reads *"The margin has run out of room. This is the last one that will open."*

### C.4 · Phone, < 900px

One column. Opening a verb replaces it. The crest's first cell becomes the back affordance.

```
┌─────────────────────────────┐   ┌─────────────────────────────┐
│▌#2049 ▏ you ▏ ● 0x71c7 ▏ … │   │▌‹ HAND IT ON ▏ #2049 ▏  …  │
├─────────────────────────────┤   ├─────────────────────────────┤
│▌ ┌───────────────────────┐  │   │▌Four ways to let someone    │
│▌ │      the still        │  │   │▌else have it: for an        │
│▌ │       full width      │  │   │▌afternoon, for a season,    │
│▌ └───────────────────────┘  │   │▌for a price, or for good.   │
│▌ see it turning →           │   │▌Only the last one is        │
│▌                            │   │▌irreversible.               │
│▌ IPSEITY #2049              │ → │▌                            │
│▌ A 24-cell, cut at +0.41    │   │▌RENTED OUT    until 26 Aug  │
│▌ and turned on two planes.  │   │▌Renter       0x33b1 … 90aa  │
│▌ Held by you, on Unichain.  │   │▌Waiting          0.014 ETH  │
│▌ Forty-seven things have    │   │▌─────────────────────────   │
│▌ been done to it.           │   │▌COLLECT                     │
│▌                            │   │▌[ Collect 0.014 ETH ]       │
│▌ TURN IT                    │   │▌─────────────────────────   │
│▌ the word · the cut · …     │   │▌FOR GOOD                    │
│▌ PUT SOMETHING IN IT        │   │▌Send it to [ 0x…        ]   │
│▌ what it holds, and what …  │   │▌[ Review the transfer ]     │
│▌ TRADE THROUGH IT           │   │▌                            │
│▌ its own exchange · swaps   │   │▌                            │
│▌▎HAND IT ON        4 days   │   │▌                            │
│▌ for an afternoon, a sea…   │   │▌                            │
│▌ SPEAK AS IT                │   │▌                            │
│▌ the commons · whispers …   │   │▌                            │
│▌ MAKE SOMETHING WITH IT     │   │▌                            │
│▌ draw the next one · lau…   │   │▌                            │
│▌ LOOK AT ANOTHER ONE        │   │▌                            │
│▌ any of the four thousan…   │   │▌                            │
├─────────────────────────────┤   ├─────────────────────────────┤
│ Read the lease.             │   │ Read the lease.             │
│ ›                           │   │ ›                           │
└─────────────────────────────┘   └─────────────────────────────┘
```

### C.5 · Responsive collapse, in stated priority order

Following the engine's law verbatim — *identity cells give way before actions do; a chain name can be an ellipsis and still tell you what you need, but a button past the edge is a button that does not exist.*

- **< 900px** — `#col` and `#lane` share the column; opening a verb swaps them.
- **< 640px** — the identity block's line 3 truncates to `Held by you, on Unichain.`
- **< 560px** — `#c-chain` hides (the chain is asserted by the id band, and restated inside every lane that can sign). Walk crumbs truncate to `… › #1024`. The still goes full width.
- **< 560px** — `#cmd` collapses to a `›` button and expands to full width on focus. A phone keyboard eats 40% of the viewport; a permanently-open text field is a permanently-halved screen.
- **Never** — `…` (the palette) and the crest's HELD cell. They do not move at any width.
- **Never, at any width** — hover-to-reveal. `Chrome.sol:233`'s `p.e.hush{display:none}` and its `✦` button do not survive. Every explanation is visible always. If a paragraph is worth 200 bytes it is worth showing on a phone; if it is not, it is deleted.

### C.6 · Escape, back, and the two unwinds

They are different questions and are never conflated.

**Escape unwinds one overlay, innermost first**: `confirm slab → palette → lane → nothing`. Exactly the engine's ordering, for exactly its stated reason.

**Browser back unwinds one walk level**, via `history.pushState`. Tapping a margin rule does the same. At depth 0, back leaves the console and returns to the instrument.

### C.7 · Keys, words, and the command line

| key | verb | word | aliases that resolve to it |
|---|---|---|---|
| `1` | TURN IT | `turn` | commit, rotate, section, hue, face, pin, word |
| `2` | PUT SOMETHING IN IT | `hold` | vault, reach, grip, seal, lock, send, balance, call |
| `3` | TRADE THROUGH IT | `trade` | market, pool, swap, fee, bond, curve, liquidity |
| `4` | HAND IT ON | `hand` | transfer, sell, rent, lease, will, estate, consign, heir, keys, session, bolt |
| `5` | SPEAK AS IT | `speak` | chat, say, dm, whisper, room, rooms, roster, sign, verify |
| `6` | MAKE SOMETHING WITH IT | `make` | mint, draw, launch, coin, hook, name, ens, renew |
| `7` | LOOK AT ANOTHER ONE | `look` | gallery, collection, open, markets, scan, address, nest |

The command line has three behaviours and only three:

1. **A bare verb or key** — `hand`, `4`, `rent` — opens the lane.
2. **A verb with arguments** — `seal 90`, `give 1024 0.1`, `name mine.eth`, `send 0x1234… 0.25` — opens the lane, **fills the form, and raises the confirm slab.** It stops there. The console types; the human presses. There is no path from a text field to a broadcast transaction in one action.
3. **`#1024`** — walks to that token. That is the complete answer to *"no way to reach a token by number, ever, 41 clicks."*

**On focus the command line becomes the palette.** A list rises above it: every act in §D, each row `act · the verb it lives in`, filtered as you type. A row that cannot run replaces its description with its reason, in `--warn`, and pressing it says the same sentence through the ticker:

```
Sync the curve      This token has no market. TRADE THROUGH IT opens one.
Collect rent        Nothing has vested; nobody is renting it.
Seed the pool       Not from here. The launch builds the coin, the hook and
                    the pool, and stops.
```

*A reason attached to the control beats a reason that arrives after the control failed.* Unknown input is an error sentence in the ticker, never a guess.

### C.8 · The clock mechanism — the only unsolicited state

> **State the holder did not ask about attaches to the verb that would answer it, and to nothing else. There is no notification centre because there is nothing to centralise: every such fact in this system is a date, and a date belongs on the door of the thing it is about.**

| verb | clocks | source |
|---|---|---|
| TURN IT | none (only the `uncommitted` marker, from the fragment) | — |
| PUT SOMETHING IN IT | the seal lapses · a lock matures | `IpseityAccount.sealedUntil()` · soonest `Locker.lockAt(id).until` over `locksOf(owner)` |
| TRADE THROUGH IT | the bond releases · the curve is behind the solid | `Pool.bondedUntil(id)` · `Pool.pendingCurve(id)` |
| HAND IT ON | the lease ends · rent has vested · the quiet period runs out · the window closes | `Lease.listing(id)` · `Succession.knockableAt(id)` · `Consign.noteOf(id).until` |
| SPEAK AS IT | none | — |
| MAKE SOMETHING WITH IT | the name expires · the name is in grace | `Nameplate.nameStatus(label, 0)` |
| LOOK AT ANOTHER ONE | none | — |

**Four rules, and they are what stop this becoming an inbox.**

1. **One line per verb, maximum, always the soonest.** Two live clocks under one verb: the verb shows the sooner, the lane shows both. Never a stack, never a count, never a badge, never a dot.
2. **A clock is the shortest true phrase**, right-aligned, 10px/.06em/`--mid`. `--warn` under 7 days (under 30 for the succession quiet period, because its remedy is a transaction and a person checks monthly). `--bad` at or past zero, where the phrase changes to what is now true: `anyone may knock`.
3. **At most one standing sentence**, above the verbs, and only when a clock is inside `--warn` *and* missing it costs something that cannot be got back: the quiet period, the name's grace, rent that will be forfeited. A lease ending costs nothing and gets no standing line. If two qualify, it states the sooner and appends `· and one more`. Zero or one. Never two.
4. **A clock cannot be dismissed, only answered**, and the answer is behind the verb it is printed on. So there is no dismiss control, no "mark read", no snooze — and therefore no state to store and nothing to sync.

On a typical day zero or one of the seven is lit.

### C.9 · The walk

**The console never opens a second document. It pushes a band.**

`LOOK AT ANOTHER ONE` → a paginated grid of stills, three chips (`mine` / `with a market` / `for rent`), and one `go to #` field. Or `#1024` in the command line. Or a token id anywhere in any lane (a renter's address, a room member, a market's holder) — every id in the console is a walk control.

Choosing one:

- `history.pushState` to `/c/1024`. Same document, same wallet, same seven verbs.
- A new `.sub` band slides in over `.42s`, indented 22px, carrying `--h` = #1024's hue **inline**, which re-derives `--a`, `--a-dim`, `--a-ghost` on that band and everything inside it.
- The outer band's content is replaced by its margin rule alone, in `--a-dim`. The rule is a tap target and it is the way back.
- The crest's cells repaint to #1024 and grow a crumb: `#2049 › #1024`, each crumb in its own hue.
- Every verb re-conjugates (§E.7).

**Cost: zero.** No second WebGL context, ever, at any depth. The picture is an `<img>` of a `pure` on-chain SVG. There is exactly one control in the console that produces a live raymarcher — `see it turning →` — and pressing it while walked says so before it goes:

> The field is a second document and a raymarcher. It replaces this page rather than running beside it — two of them on one thread is what made the phone hot. This walk is remembered; the way back is where it was.

---

## D · THE COMPLETE SURFACE MAP

Every one of the 101 inventory actions, plus the eight Part-C holes now filled. Nothing is silently dropped; what is not here is in §D.9 with its reason.

### D.1 · TURN IT — `LaneTurn`

Sections in order: `THE WORD` · `THE CUT` · `THE HUE` · `SEALED NODES` · `THE FACE IT SHOWS` · `WHAT IT IS`

| # | action | where |
|---|---|---|
| 2 | `commit(id, word)` | THE WORD — six plane sliders, the three containing w drawn `border-style:dashed` |
| 3 | `setTrait(id,"hue",v)` | THE HUE — a slider that re-tints the whole console live, as the engine does |
| 4 | `openNode(id, node)` payable | SEALED NODES — twelve marks, sealed ones carry the middot, each clickable for name + blurb + cost + the one transaction |
| 7 | `pinTokenURI(id, i)` | THE FACE IT SHOWS — **hole filled** |
| 8 | `unpinTokenURI(id)` | THE FACE IT SHOWS — **hole filled** |
| 87 | `viewOf` / `statsOf` / `detailOf` / `kernelStatus` | WHAT IT IS — the full fact block, one tap down from the three plain sentences |
| 88 | open the instrument | `see it turning →` in `#col`, and one row here |
| 92 | `tokenURI` / `tokenURIAt` / `hasPinnedTokenURI` | THE FACE IT SHOWS — three faces side by side as stills |
| 84 | `Sigil.svg` | the still, everywhere |

### D.2 · PUT SOMETHING IN IT — `LaneHold`

Sections: `IN THIS WALLET` · `THE TWO HANDS` · `MOVE SOMETHING OUT` · `UNDER THE SEAL` · `LOCKED AWAY` · `ANY CALL`

| # | action | where |
|---|---|---|
| 93 | `eth_getBalance` (wallet) | IN THIS WALLET |
| 98 | ERC-20 `name/symbol/decimals/balanceOf`, `transfer`, `approve` | IN THIS WALLET + MOVE SOMETHING OUT |
| 9 | `embody(id)` | THE TWO HANDS — button's label is the current step |
| 10 | `embodyGrip(id)` | THE TWO HANDS |
| 22 | pay into the Grip (bare value / ERC-20 / NFT) | THE TWO HANDS, with the permanence sentence in `--warn` |
| 13 | `execute(to,value,data,0)` | MOVE SOMETHING OUT |
| 14 | `executeBatch(Call[])` | MOVE SOMETHING OUT — "several acts, or none" |
| 97 | move native from wallet **or** from the token | MOVE SOMETHING OUT — a two-chip `From` |
| 15 | `guard(address)` | UNDER THE SEAL |
| 16 | `unguard(address)` | UNDER THE SEAL |
| — | `guardNFT` / `unguardNFT` | UNDER THE SEAL — **hole filled**, same form plus an id field |
| 17 | `seal(uint64 until)` | UNDER THE SEAL — a slider to a date, ratchet stated |
| 51 | `Locker.lock(token, amount, until)` | LOCKED AWAY |
| 52 | `lockWithPermit(...)` | LOCKED AWAY — chosen automatically when the token has EIP-2612; the button says which it will do |
| 53 | `claim(lockId)` | LOCKED AWAY, per row |
| 54 | `give(lockId, to)` | LOCKED AWAY — with `the token's own Reach` offered as a one-tap destination |
| 55 | `extend(lockId, until)` | LOCKED AWAY — **hole filled** |
| 24 | ERC-20 `approve` for the Locker | LOCKED AWAY, as the button's current step |
| 99 | arbitrary call | ANY CALL — a human-readable signature, hashed and ABI-encoded in-frame, shown in full before signing |

### D.3 · TRADE THROUGH IT — `LaneTrade`

Sections: `ITS OWN EXCHANGE` · `INVENTORY` · `THE FEE` · `THE BOND` · `THE CURVE` · `ANYONE'S POOL`

| # | action | where |
|---|---|---|
| 23 | `openMarket(id, base, quote, feeBps)` | ITS OWN EXCHANGE — pairs from the blessed list only |
| 24 | ERC-20 `approve(POOL, amt)` | INVENTORY, as the button's current step |
| 25 | `deposit(id, base, quote)` | INVENTORY |
| 26 | `withdraw(id, base, quote, to)` | INVENTORY |
| 27 | `setFee(id, feeBps)` | THE FEE |
| 28 | `swap(id, baseIn, amountIn, minOut, to, deadline)` | ITS OWN EXCHANGE (own token) and the walked token's lane |
| 29 | `bond(id, until)` | THE BOND — ratchet stated |
| 30 | `syncCurve(id)` | THE CURVE — the only place the artwork feeds the economics, and the copy says so |
| 31 | `closeMarket(id)` | ITS OWN EXCHANGE — **hole filled**; the handler existed at `Desk.sol:462` and no page rendered a button |
| 80 | `SwapRouter.exactInputSingle` | ANYONE'S POOL — slippage chips 10/50/100/300 bps, a deadline |
| 81 | `approve(router, amt)` | ANYONE'S POOL, as the button's current step |
| 90 | every open market | reached by a `with a market` chip in LOOK; this lane links there |

### D.4 · HAND IT ON — `LaneHand` + `LaneHandLater`

Sections, **sorted by ascending finality — that ordering is the warning**: `FOR AN AFTERNOON` · `FOR A SEASON` · `FOR A PRICE` · `FOR GOOD`

| # | action | where |
|---|---|---|
| — | `setUser(id, user, expires)` | FOR AN AFTERNOON — **hole filled**; lend to a friend, free, no listing |
| 18 | `grantSession(key, expires, cap, targets, selectors)` | FOR AN AFTERNOON — targets and selectors taken as addresses and human-readable signatures, never raw bytes4 |
| 19 | `revokeSession(key)` | FOR AN AFTERNOON |
| 11 | `setLeaseAgent(id, LEASE)` | FOR A SEASON, as the button's current step. It is a gate, not a feature, and is never a separate control |
| 32 | `Lease.list(id, perDay, minDays, maxDays)` | FOR A SEASON |
| 34 | `delist(id)` | FOR A SEASON |
| 35 | `collect(id, to)` | FOR A SEASON |
| 36 | `settle(id)` | FOR A SEASON — and offered inline inside FOR GOOD, before a transfer |
| 37 | `endLease(id)` | FOR A SEASON — forfeiture stated |
| 38 | `claim()` (renter side) | FOR A SEASON — shown only when `owed[me] > 0` |
| 33 | `rent(id, days, maxPerDay)` payable | the **walked** token's FOR A SEASON |
| 61 | `Consign.consign(id, agent, floor, cut, until)` | FOR A PRICE |
| 12 | `approve(SUCC \| CONS, id)` | FOR A PRICE / FOR GOOD, as the button's current step |
| 62 | `ask(id, price)` | FOR A PRICE — agent role, shown only when you are the agent |
| 64 | `reclaim(id)` | FOR A PRICE — anyone may, so a silent agent cannot squat |
| 65 | `release(id)` | FOR A PRICE — agent role |
| 66 | `withdraw()` | FOR A PRICE — shown only when `owed(me) > 0` |
| 63 | `buy(id, agreed)` payable | the **walked** token's FOR A PRICE |
| 56 | `Succession.arrange(id, to, toToken, quiet, notice)` | FOR GOOD → IF YOU STOP ANSWERING |
| 57 | `stillHere(id)` | FOR GOOD, as a standing row with a one-press button |
| 58 | `revoke(id)` | FOR GOOD |
| 59 | `summon(id)` | the **walked** token's FOR GOOD |
| 60 | `claim(id)` | the **walked** token's FOR GOOD |
| — | `safeTransferFrom(from, to, id)` | FOR GOOD → **the largest hole on the site, filled**, and it is the first control under the last heading |
| 5 | `lock(id)` (bolt) | FOR GOOD → `Bolt it shut` — it is the refusal to hand on, so it lives here |
| 6 | `unlock(id)` | FOR GOOD |

### D.5 · SPEAK AS IT — `LaneSpeak` + `LaneSpeakRooms`

Sections: `THE COMMONS` · `WHISPERS` · `ROOMS` · `WHAT IT SIGNS`

| # | action | where |
|---|---|---|
| 39 | `speak(0, from, kind, body)` | THE COMMONS — the log walked by `Parley`'s back-pointers, one single-block query per message |
| 40 | `whisper(from, to, kind, body)` | WHISPERS |
| 41 | sealed whisper (ECDH P-256 + AES-256-GCM) | WHISPERS |
| 42 | `announce(token, x, y)` | WHISPERS, as the button's current step; the "replacing it orphans all earlier ciphertext" warning in `--warn` |
| 43 | `found(by, name, openDoor)` | ROOMS |
| 44 | `join(room, token)` | ROOMS |
| 45 | `leave(room, token)` | ROOMS |
| 46 | `speak(key, from, kind, body)` | ROOMS |
| 47 | `invite(room, by, token)` | ROOMS |
| 48 | `evict(room, by, token)` | ROOMS — **hole filled** |
| 49 | `Roster.inWindow / membersOf / stewardedBy` | ROOMS — **hole filled**; the whole of `Roster.sol` was terminal-only |
| 50 | `roomsOf(token)` | ROOMS |
| 20 | `eth_signTypedData_v4` verified against `attestationDigest` then `isValidSignature` | WHAT IT SIGNS — domain separator and struct hash computed in-frame so the wallet's display can be checked |
| 21 | `isValidSignature` → `0x1626ba7e` | WHAT IT SIGNS |
| 100 | plain message and EIP-712 typed data | WHAT IT SIGNS |
| — | `retireAttestations()` | WHAT IT SIGNS — **hole filled**; "Void every signature this token has ever made." A real panic button with no button |

This is the one lane with a past, and it opens with the sentence that justifies it:

> Everything this token has said is here, exactly and completely, because every message points at the block of the one before it. Nothing else in this console shows a past, because nothing else can prove one.

### D.6 · MAKE SOMETHING WITH IT — `LaneMake` + `LaneMakeName`

Sections: `DRAW THE NEXT ONE` · `LAUNCH A COIN` · `GIVE IT A NAME`

| # | action | where |
|---|---|---|
| 1 | `mint()` payable | DRAW THE NEXT ONE — with the seed-from-the-mining-block aside |
| 72 | `coinAt(...)` view | LAUNCH A COIN, step 1 |
| 73 | `launch(token, name, symbol, decimals, supply, salt)` | LAUNCH A COIN, step 2 |
| 74 | `mine(initCodeHash, flags, from, tries)` view, looped | LAUNCH A COIN, step 3 |
| 75 | `deployHook(kind, salt, arg)` | LAUNCH A COIN, step 3 |
| 76 | v4 `initialize` / v3 `createAndInitializePoolIfNecessary` | LAUNCH A COIN, step 4 |
| 79 | `recent(from, count)` | LAUNCH A COIN |
| 78 | hook powers from address bits | reached from LOOK's address mode; this lane links there. One implementation |
| 67 | `bindByName(wireName, token)` | GIVE IT A NAME |
| 68 | `unbindByName(bytes)` | GIVE IT A NAME |
| 69 | `IRenewer.renew(label, duration)` payable | GIVE IT A NAME — permissionless, which is how a name sealed in a Grip stays alive |
| 71 | `heldBy(node)` / `tokenForName` / `whereIs(id)` | GIVE IT A NAME (read) and the crest's name, when one exists |

Each finished step collapses to a fact, not a checkmark: `Address 0xC0f2 … 118a · checked` / `Hook 0x…a4c0 · may take a fee, may not move your tokens` / `Pool WETH/COIN · 0.30% · live` / `Liquidity — not seeded from here.`

### D.7 · LOOK AT ANOTHER ONE — `LaneLook`

Two modes, one lane: **a token**, or **an address**.

| # | action | where |
|---|---|---|
| 89 | `totalSupply`, per-id `sectionOf` | A TOKEN — a grid of stills, 24 per page, newest first |
| 90 | `openCount` / `openIds` / `market(id)` | A TOKEN — the `with a market` chip |
| 85 | `balanceOf(me)` → `tokenOfOwnerByIndex` | A TOKEN — the `mine` chip, and the crest's token cell |
| — | `Lease.listing(id).ok` | A TOKEN — the `for rent` chip |
| 101 | the walk | A TOKEN — pushes a band, never a field |
| 96 | block, fees, `eth_getBalance`, `eth_getCode`, `eth_getStorageAt` | AN ADDRESS |
| 78 | a hook's powers, read off its address bits with no call | AN ADDRESS — the strongest claim on the old site, kept whole |

### D.8 · The crest

| # | action | where |
|---|---|---|
| 86 | which token you are acting as | the `TOKEN` cell is a control: tapping it lists this wallet's tokens on this chain as stills, and choosing one walks. **Position is identity.** The three notions (`use <id>`, the URL, `window.IPSE.id`) collapse to one |
| 94 | `wallet_switchEthereumChain` | offered as exactly one button, only when the wallet is not on this token's chain (§E.5) |
| 71 | the token's name | the `TOKEN` cell shows `pale-oblique.eth` in place of `#2049` when one is bound, with the id beneath it |

### D.9 · REFUSED — every action that does not make the console, and why

**Refused, and stated in place where a person would look for it:**

| action | reason |
|---|---|
| 77 · seed a new pool with liquidity | v4 `modifyLiquidities(bytes,uint256)` needs an ABI coder this client does not carry. `LAUNCH A COIN` step 4 names the step it stopped at, in `--warn`, and does not pretend otherwise |
| 82 · pool price history (`Venue.history`) | A chart. The console shows `Venue.best` — pool, fee, liquidity — as three `kv` rows, and no chart at all. §I |
| — · `setApprovalForAll` | It grants over the whole collection, and this console acts on one token. A holder who wants it has a marketplace. Refusing it is the safer default and the honest one |
| — · `executeAsSession` | The key holder is not the holder and does not arrive from an instrument. §I names it as the first thing to add. *Built, 2026-08-23: `/k/<id>/<key>`, its own front door and not a lane — see §I* |
| 70 · `claimParentByName` | Project-level, once ever, curator-shaped. It is not a holder's act |

**Refused, and not stated, because they are correctly absent today and a button would be worse than the gap:**

`sealKernel`, `transferWithKernel`, `cloneWithKernel` — `/seal` is right that the page does not carry the payload and should not be trusted with it. · `authorizeUsage`, `record`, `mintTo` — no surface, and `record` is now pointless since `Succession` stopped counting hub op-stamps. · `ParleyPort.echo` — written, unreachable, absent from both `deployments/*.json`. · `Nameplate.setStation` / `setRenewer` — parent-owner admin. · Every curator function (`setPool`, `setRenderer`, `sealRenderer`, `setPricing`, `setRoyalty`, `setVerifier`, ownership, `withdraw`) and every Pool admin function (`setPaused`, `bless`, `setAllowlistEnforced`, `proposeAdmin`, `acceptAdmin`).

**Refused as console surfaces, kept as routes** — each is a link you send to somebody, which is the one thing a route is for:

`/token/<id>/live` (the artwork) · `/token/<id>/sigil.svg` (the still) · `/token/<id>/raw` and `/token/<id>/face/<n>` (92, machine-adjacent) · `/hook/<address>` (renders with JS off; its claim that the bits are the mechanism is the strongest thing on the site) · `/projector` (83 — real, self-contained, no wallet at all, and not about anything you own) · `/services.json` and `/token/<id>/services.json` (91 — machines, and already better at it than any page).

**Deleted outright:**

95 · `go <place>` — it existed *because* there were nineteen doors. It is the symptom. · The `/door` tesseract — a 2-D gold wireframe cartoon of the artwork the holder was just inside, in the wrong medium, typeface and colour. Deleted without replacement. · `DeskUni.selectors()`'s ERC-4626, governance and v3 position-manager tables — none of which any page ever sent. Bytes in a byte-budgeted system buying nothing.

---

## E · STATE AND FAILURE

### E.1 · The placeholder vocabulary, fixed

Exactly six strings, and no others: `—` (nothing yet) · `reading…` · `estimating…` · `not yet` · `none` · `not reported`.

**Rows never appear or disappear as data arrives.** Every row is laid out immediately with its placeholder and filled in place, using the `kv()` helper's third argument. This is not a style note; a row that appears late moves everything beneath it under a thumb already in motion.

### E.2 · While reading

Server-rendered facts are already correct at paint. Client-read facts (balances, allowances, symbols, quotes, gas) show `reading…` / `estimating…` and fill. Nothing spins. There is no skeleton shimmer and no progress bar.

### E.3 · When a read fails

**A satellite that reverted must never render as `none`.** `ConsoleRead.look()` wraps every external read in `try/catch` and returns, alongside the values, a `uint16 reported` bitmask. A bit that is clear renders `not reported`; a bit that is set and a value of zero renders `none`. Three-valued, per the engine's own discipline: *"there is a kernel", "it is sealed to whoever holds this token", and "somebody checked it" are three different facts.*

This is load-bearing for the five chains: Unichain, BNB and Robinhood may not carry every satellite, and a missing `Consign` deployment must produce `not reported`, not a reverted page.

Section-local failures render in place, never in the ticker:

```html
<p class="s" style="color:var(--bad)">Could not read the market: <reason></p>
```

When the RPC is unreachable entirely, the ticker carries the sentence that is true **because of the architecture**, not in spite of it:

> The chain did not answer. Everything on this page was drawn by the contract before any request was made, so what you are reading is true as of block 21,048,317. It is only the newer facts that are missing.

There is no fatal screen. There is no field to fail to draw.

### E.4 · A fresh, empty token

Every lane whose facts are all empty opens with the **latent sentence** instead of a column of `none`. This is THE LOG's best idea and it is mandatory:

| lane | opening line when empty |
|---|---|
| TRADE THROUGH IT | This token has never been an exchange. |
| SPEAK AS IT | Nothing has ever been said in this name. |
| HAND IT ON | Nobody has ever been let near this token. |
| PUT SOMETHING IN IT | Nothing has ever been put under the seal. |
| MAKE SOMETHING WITH IT | This token has no name and has never made anything. |
| TURN IT | Eight of the twelve nodes have never been opened. |

And the identity block's third line, for a token minted this morning:

```
IPSEITY #4021
A tesseract, uncut.
Held by you, on Robinhood. Nothing has been done to it yet.
```

with the standing line, once:

> This is the whole of it. #4021 was drawn thirty seconds ago. The seven things it can do are below, and it has done none of them.

**The console for a fresh token is the richest one in the collection, not the emptiest.** The interface matures with the object.

### E.5 · The wallet is on the wrong chain

*Shipped, 2026-08-23: the crest cell names the mismatch and offers the
move; `propose` refuses to build a slab while it stands; a provider that
cannot say its chain leaves the wallet's own guard in charge. Driven by
`verify-console`: on the wrong chain a control raises no slab and
nothing is sent.*

The five-chain partition — Ethereum 1..1024, Base 1025..2048, Unichain 2049..3072, BNB 3073..3584, Robinhood 3585..4096, **no bridge, by design** — is stated to a person for the first time here.

The crest shows both chains. Every write button in every lane carries its reason **in its own label**, never in a tooltip: `Unichain only`. The standing line takes over:

> #2049 lives on Unichain. The wallet is on Base. Everything below is readable; nothing below can be signed until the wallet moves.

with exactly one control, in the crest: `Move the wallet to Unichain`. **The console never offers a chain this token cannot be on.** `PageDoor._chains`'s four buttons — two of them testnets, missing three production chains — do not survive.

And when a lane needs to explain the partition:

> There is no bridge between the five chains and there was never meant to be one. #2049 is a Unichain object the way a building is in a city.

### E.6 · The standing line

One `<p>`, above the verbs, `border-left:1px solid var(--a)`, deliberately identical to `#cbox .plain` — the quoted-in-hue left rule means one thing throughout the console: *this sentence is about something that will happen.* Shown at most once. Zero is the normal state.

### E.7 · Looking at a token you do not hold

The crest's HELD cell reads `0x9f3a … 44b1`, not `you`. The wallet LED goes from `.live` green to `.ro` accent. Every verb re-conjugates, and **shut verbs keep their place, their label, their sub-line and their middot** — the same mark `.nd.shut` uses — carrying their reason **in place of their clock**:

```
TURN IT ·                              only 0x9f3a … 44b1 can turn this
the word · the cut · the hue

PUT SOMETHING IN IT                    pay into its Grip
what it holds, and what it can spend

TRADE THROUGH IT                       trade against its market
its own exchange · swaps · the fee it earns

HAND IT ON ·                           nothing here is yours to hand on
for an afternoon, a season, a price, or for good

SPEAK AS IT                            whisper to it
the commons · whispers · rooms · what it signs

MAKE SOMETHING WITH IT ·               the token that makes must be one you hold
draw the next one · launch a coin · give it a name

LOOK AT ANOTHER ONE
any of the four thousand · any address
```

Ticker:

> Standing in #1024 · Base. Read only — you hold #2049. Nothing here will sign.

**Nothing is hidden because it is unavailable.** The two verbs that stay fully live in a stranger's token are the two that *give* — pay into its Grip, trade against its market. The console says that without a word of explanation.

### E.8 · No wallet, and no network

Progressive capability, announced, each with its own LED class and its own sentence:

- **Wallet** — `.led.live`, green.
- **No wallet** — `.led.ro`, accent: *"No wallet announced itself. Reading the chain directly; the console is correct and nothing can be signed."*
- **Inside a marketplace frame** — bare LED: *"No wallet reaches inside a marketplace frame. Reading the chain directly — open this token in its own tab to sign."*

### E.9 · Transactions

*Shipped, 2026-08-23: the slab names To, Value and Function beside the
lane's sentences, and the ticker follows the hash after the press —
mined in block N, reverted in block N, still not mined, not mined after
three minutes. The mint reads `price()` and attaches it, refusing to
guess when the read does not answer; the TURN slab states plane deltas
in degrees instead of two raw words.*

Verbatim from the engine, and not re-invented:

- **The confirm slab** in its fixed seven-part order: `Confirm` → the plain sentence quoted in the token's hue → `To`/`Value`/`Function`/`Selector`/`Gas` → the ABI words numbered `00`,`01`… in accent with each decoded underneath itself → the raw calldata at `max-height:96px` → `tx.note` in `--warn` if any → `Sign and send` / `Cancel`.
- Gas is estimated **after** paint and fails **in place**: `el.textContent = "would revert"; el.style.color = "var(--bad)"; el.title = String(e.message)`. Never an alert.
- `go.textContent = "waiting for the wallet"`, then on broadcast **the slab closes immediately** — it never becomes a spinner — and the ticker takes over.
- `watch()` polls every 2s for 90 tries and terminates in one of three sentences, including the one everyone omits: `Still not mined after three minutes. It may yet land.`
- `guard()` wraps every handler. No throw ever reaches the console.
- A decline is distinguished from a refusal: `/reject|denied|4001/i` → `You declined the signature.`
- **Multi-step acts are one button whose label is the current step**, never two buttons where the second is dead: `Approve USDC first` → `Add inventory`. `Let Succession move it, first` → `Arrange it`.

---

## F · THE VISUAL SPECIFICATION

### F.1 · The palette, bound to the token's hue

`--h` is written **by the contract**, into `:root`, from the token's hue trait — so the token's colour is in the first byte of the response. It is rewritten in exactly three places: on the walk (per band, inline), on the hue slider in TURN IT (live), and per crumb.

```css
:root{
  --h:34;                                  /* written by Console.request() */
  --a:hsl(var(--h) 92% 66%);
  --a-dim:hsl(var(--h) 62% 44%);
  --a-ghost:hsl(var(--h) 92% 66% / .10);
  --void:#04050a; --void-2:#070912; --void-3:#0b0e18;
  --rule:#151a26; --rule-2:#212838; --rule-3:#2e3648;
  --dim:#5d6780; --mid:#8b95ad; --txt:#c8d0e2; --lit:#eef2fb;
  --ok:#5fe3b4; --warn:#ffc95c; --bad:#ff6b63;
  --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
  --ease:cubic-bezier(.22,.61,.36,1);
  --crest:46px; --col:300px; --cmd:36px;
  --safeT:env(safe-area-inset-top,0px);
  --safeB:env(safe-area-inset-bottom,0px);
}
html,body{background:var(--void);color:var(--txt);margin:0;
  font-family:var(--mono);font-size:13px;line-height:1.45;
  font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1,"zero" 1}
body{opacity:0;transition:opacity .9s var(--ease)}
body.up{opacity:1}
::selection{background:var(--a);color:var(--void)}
@media(prefers-reduced-motion:reduce){*{transition-duration:.01ms !important}}
```

Three surfaces, three rules, four texts, four semantics. **`--b`, the counter-accent, is not spent anywhere in the console.** It is worth one 4px dot in the whole system — `.pl .spin`, meaning "this plane is turning on its own" — and the console has not earned it.

`--warn` is rationed to one meaning: *you can do this but read this first.* `--bad` is failure or a passed deadline only. `--ok` is a live LED, a landed transaction, a bonded market.

### F.2 · Type — five classes, no more

```css
.k  {font-size:9px;letter-spacing:.26em;text-transform:uppercase;color:var(--dim);white-space:nowrap}
.v  {font-size:12px;letter-spacing:.01em;color:var(--lit)}
.n  {font-size:11px;letter-spacing:.05em;color:var(--txt)}
.s  {font-size:10px;letter-spacing:.08em;color:var(--mid)}
.blurb{font-size:11px;line-height:1.62;color:var(--mid);margin-bottom:14px}
.acc{color:var(--a)} .mut{color:var(--dim)}
```

The inverse relation is the system: **the smaller the type, the wider the tracking, the dimmer the colour.** Nothing is bold. `<b>` is explicitly unbolded and recoloured: `b{color:var(--a);font-weight:400}`. **Emphasis in this language is hue, not weight.**

### F.3 · Component one — the band and its margin rule

*This is the beauty judge's must-survive, and it is structural. If it is cut, the design has failed.*

```css
/*  A band re-derives the accent from its own token's hue. --a cannot merely
    be inherited and re-tinted: a custom property containing var() is
    substituted where it is DECLARED, so an --a written once on :root carries
    :root's hue forever, no matter what a descendant does to --h. Three lines
    per band, and the whole band — its rule, its buttons, its focus border,
    its selection — becomes the colour of the thing it is about.            */
.sub{
  --a:hsl(var(--h) 92% 66%);
  --a-dim:hsl(var(--h) 62% 44%);
  --a-ghost:hsl(var(--h) 92% 66% / .10);
  position:relative;
  padding-left:22px;
  min-height:100%;
}

/*  The rule. It is the only thing in this document that says whose token you
    are reading and how far in you have walked, and it says both at every
    scroll position without occupying a line of type. Depth is the number of
    lines in the left margin. That is the breadcrumb, and it costs four
    declarations.                                                            */
.sub::before{
  content:"";position:absolute;left:11px;top:0;bottom:0;width:1px;
  background:var(--a-dim)
}
.sub.here::before{background:var(--a)}

/*  Nesting is the walk. Each level indents 22px, so its rule lands 11px right
    of its host's. Capped at three, the same number and the same reason as
    MAX_DEPTH in the engine.                                                 */
.sub .sub{padding-left:22px}

/*  ::before cannot take a tap, and the rule has to be the way back out, so a
    real element sits over it. 22px wide because a thumb is not a mouse.     */
.rung{position:absolute;left:0;top:0;bottom:0;width:22px;border:0;padding:0;
  background:transparent;cursor:pointer;-webkit-tap-highlight-color:transparent}
.rung:hover ~ .sub::before,
.rung:hover + *{}          /* no hover styling: the rule is already the signal */
```

Bands are emitted as `<div class="sub" style="--h:214">`.

### F.4 · Component two — the verb row

```css
.vb{display:block;width:100%;padding:11px 14px 11px 0;border:0;
  border-left:2px solid transparent;margin-left:-14px;padding-left:14px;
  background:transparent;color:var(--txt);font:inherit;text-align:left;
  cursor:pointer;transition:background .18s var(--ease),border-color .18s var(--ease)}
.vb:hover{background:var(--a-ghost)}
.vb.on{border-left-color:var(--a);color:var(--lit);background:var(--a-ghost)}

.vb .t{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.vb .nm{font-size:12px;letter-spacing:.02em}
.vb .sub2{display:block;margin-top:2px;font-size:10px;letter-spacing:.06em;
  color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/*  The clock. One per verb, always the soonest, never a count, never a badge.
    --warn only when a threshold is crossed; --bad only when it has passed and
    something is now claimable or forfeit.                                    */
.vb .cl{font-size:10px;letter-spacing:.06em;color:var(--mid);
  white-space:nowrap;flex:none}
.vb .cl.soon{color:var(--warn)}
.vb .cl.past{color:var(--bad)}

/*  A verb that cannot run keeps its place, its label, its sub-line and its
    reason — marked the way a sealed node is marked, with a middot, not a
    padlock. Nothing in this interface is hidden because it is unavailable.  */
.vb.shut{color:#3d4457;cursor:default}
.vb.shut:hover{background:transparent}
.vb.shut .nm::after{content:" \00b7";color:var(--a-dim)}
.vb.shut .cl{color:var(--warn);white-space:normal;text-align:right}
```

### F.5 · Component three — the crest and the crumb

```css
#crest{position:fixed;top:0;left:0;right:0;z-index:7;display:flex;align-items:stretch;
  height:calc(var(--crest) + var(--safeT));padding-top:var(--safeT);
  background:linear-gradient(180deg,rgba(4,5,10,.94) 46%,rgba(4,5,10,.86));
  border-bottom:1px solid var(--rule);backdrop-filter:blur(2px)}
.cell{display:flex;flex-direction:column;justify-content:center;gap:1px;
  padding:0 13px;border-right:1px solid var(--rule);min-width:0;
  flex:0 1 auto;overflow:hidden}
.cell .k{font-size:9px;letter-spacing:.26em;text-transform:uppercase;
  color:var(--dim);white-space:nowrap}
.cell .v{font-size:12px;color:var(--lit);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.led{width:5px;height:5px;border-radius:50%;background:var(--rule-3);
  transition:background .3s var(--ease),box-shadow .3s var(--ease)}
.led.live{background:var(--ok);box-shadow:0 0 9px var(--ok)}
.led.ro{background:var(--a);box-shadow:0 0 9px var(--a)}

/*  The walk, drawn as hue. --h is inline on the crumb and --a is re-declared
    in this rule, on the same element, so the substitution picks up the
    crumb's own hue. Declaring --h alone and inheriting --a from :root does
    NOT re-tint — the colour was already resolved. That cost an afternoon.   */
#walk{display:flex;align-items:stretch;margin-left:auto;flex:none;
  overflow-x:auto;scrollbar-width:none}
#walk .cr{--a:hsl(var(--h) 92% 66%);
  flex:0 0 auto;border:0;border-left:2px solid var(--a);background:transparent;
  color:var(--mid);font:inherit;font-size:11px;padding:0 10px;cursor:pointer;
  white-space:nowrap;transition:color .18s var(--ease)}
#walk .cr:hover{background:var(--a-ghost)}
#walk .cr:last-child{color:var(--lit)}

/*  Identity gives way before actions do. A chain name can be an ellipsis and
    still tell you what you need; a button past the edge does not exist.     */
#pal{flex:none} 
@media(max-width:560px){#c-chain{display:none}}
```

Crumbs are emitted as `<button class="cr" style="--h:214">#1024</button>`.

### F.6 · The standing line, the still, the ticker

```css
#stand{margin:16px 0 4px;padding-left:11px;border-left:1px solid var(--a);
  font-size:11px;line-height:1.62;color:var(--mid)}
#stand.soon{color:var(--warn);border-left-color:var(--warn)}

#still{width:184px;max-width:100%;display:block;border:1px solid var(--rule);
  background:var(--void-2)}
#still.uncommitted{border:1px dashed var(--a-dim)}
#turning{display:inline-block;margin-top:6px;font-size:10px;letter-spacing:.08em;
  color:var(--mid);text-decoration:none}
#turning:hover,#turning:focus-visible{background:var(--a-ghost);color:var(--a)}

#tick{position:fixed;left:0;bottom:calc(var(--cmd) + var(--safeB));z-index:6;
  max-width:min(560px,92vw);padding:0 14px 8px;font-size:11px;color:var(--mid);
  opacity:1;transition:opacity .4s var(--ease)}
#tick.ok{color:var(--ok)} #tick.err{color:var(--bad)}
#tick b{color:var(--a);font-weight:400}
```

`say()` sets `opacity:1`, then `.55` after 7000ms. **It never disappears.** The last thing that happened is always still readable. There is no toast stack.

### F.7 · Inherited without modification

`button.b` (outline in the token's hue, fills on hover, full width, `10px/.24em` uppercase) · `button.b.g` (grey, for anything that only reads — **read paths grey, write paths accent, always**) · `.chip` with `--a-ghost` as the only "selected" fill · `input[type=text],textarea,select` inset, `border-radius:0`, focus is a hue border and there is no focus ring anywhere else · `input[type=range]` as a 1px track and a 2px glowing bar, never a knob · `.kv` at `6px 0`, `align-items:baseline`, hairline between, `:last-child` borderless · `hr{border:0;height:1px;background:var(--rule);margin:12px 0}` · `pre.code` at `10px/1.55` on `--void` · 4px scrollbars, transparent track, `--rule-2` thumb.

**Everything is 1px. Not one rounded corner** except the 5px LED and the 4px scrollbar thumb. **Not one shadow used as elevation** — glow means live, and nothing else.

`esc()` is applied to every interpolated string without exception. In a console rendering owner-supplied names, symbols and messages, that is not a style note, it is the security posture.

Addresses are always `a.slice(0,6) + " … " + a.slice(-4)` — note the spaces around the ellipsis. Balances never round to zero: `if(v > 0n && whole === 0n && frac === "") return "<0.00001"`. Dust is still custody.

### F.8 · Motion

| what | duration | how |
|---|---|---|
| document arrival | `.9s` | `body{opacity:0}` → `.up` |
| lane open / close | `.42s` | `transform:translateX(101%)` desktop, `translateY(101%)` < 900px |
| a walk band arriving | `.42s` | same transform; **the hue change is instant**, because it belongs to the new band, not to a transition of the old one. A slow colour fade reads as an animation; an instant one reads as *you are somewhere else now* |
| buttons, chips, rows | `.18s`–`.22s` | |
| LED | `.3s` | background + box-shadow |
| ticker fade | `.4s` to `.55` at 7s | |
| a meter filling | `.12s linear` | the only `linear` — it is a meter, not a gesture |

One easing curve for everything: `--ease:cubic-bezier(.22,.61,.36,1)` — fast out, long settle, no overshoot. Reduced motion sets `transition-duration:.01ms` globally.

**There is no ambient motion in the console.** Nothing drifts, nothing pulses, nothing breathes. The instrument turns; its console does not. A target that drifts while a thumb is on its way to it is not a target.

---

## G · THE VOICE

Eleven rules. Every string in the console is checked against them.

**1 · Declarative present, third person. No second-person imperative in explanations.**
Right: *"The section is held where you left it."* · *"Receives and never spends."*
Wrong: *"You can hold your section here!"*

**2 · Sentence case with full stops. Never Title Case, never an exclamation mark, no emoji, no "Oops", no "Success!", no "Please".**
The only near-cheerful string permitted in the whole console is `Signed.`

**3 · A thing's nature is stated before its function, and the naming is figurative but exact.**
Right: *"The Reach — the hand that acts."* · *"Hand a bounded key to something that is not you."* · *"Speak as the token."*
Wrong: *"Account Management"* · *"Session Key Configuration"*.

**4 · Irreversibility is stated plainly, before the button, never softened, and never in a tone lighter than the thing it describes.**
Right: *"Anything sent here is here permanently. There is no execute, no withdraw, no sweep, no rescue, no admin — not for you, not for anyone, ever."*
Right: *"Opening it is a transaction against the collection: recorded, and permanent."*
Wrong: *"Note: this action may not be reversible."*

**5 · Consequences are named in human terms, in the confirm sentence.**
Right: *"The token sends 0.1 ETH from its own account to 0x1234 … abcd. You are only the hand on the pen."*
Right: *"Let 0x… move up to 5 USDC out of your wallet, whenever it likes."* — that is `approve()`, described honestly.
Right: *"Everyone who opens this token afterwards arrives here first."*
Wrong: *"Approve token spending?"*

**6 · Degradation is described as a preserved capability, not a loss.**
Right: *"This frame allows no network at all. The section still turns — it never needed one."*
Wrong: *"Network unavailable. Some features are disabled."*

**7 · Verbs are physical and slightly archaic where a generic one exists.**
`Interrogate` not Query · `Draw the next one` not Mint · `Bring the Reach into being` not Deploy · `Review the transfer` not Continue · `Put it under the seal` / `Take it off` · `Bond the inventory` · `Execute them as one act` · `Bring the books up to date` not Settle.

**8 · Em dashes and semicolons are used freely; the prose is literary and unhurried.**
Right: *"The next token's seed is drawn from the block that carries this call — so the solid you are about to create does not exist yet, in any form, anywhere, and cannot be known until it is mined."*

**9 · Didactic asides teach without condescension.**
Right: *"Isoclinic: xw and zw together, at equal rate. In three dimensions there is no such motion."* · *"A flat torus. Flat, in four dimensions, exactly."*

**10 · Distrust of the interface itself is stated to the reader.**
Right: *"the domain separator and struct hash computed in this page so you can check them against the wallet's own display."*
Right, and mandatory in SPEAK AS IT: *"Everything this token has said is here, exactly and completely, because every message points at the block of the one before it. Nothing else in this console shows a past, because nothing else can prove one."*

**11 · Errors are thrown as finished sentences from the throw site.** The handler never composes copy.
Right: `throw new Error("Only the holder can hand this on. It is held by 0x9f3a … 44b1.")`
Right: `throw new Error("The seal only moves outward. It is already sealed to 12 March.")`
Right: `throw new Error("Nothing to collect — no rent has vested since the last settlement.")`
Wrong: `throw new Error("ERR_NOT_OWNER")`.

**Two banned registers.** No contract nouns on the first screen (§B.2). No number the console cannot ask a contract to confirm — no fiat, no total, no estimate presented as a fact.

**The empty-wallet copy**, at `/c` with a wallet holding none of the collection:

> This wallet holds none of the four thousand and ninety-six. Two of the seven still work: you can look at any of them, and you can pay into any of their Grips.

---

## H · THE BUILD PLAN

### H.1 · The route

```solidity
// Premises.request — one new branch, and eighteen old ones become redirects.
if (_eq(resource[0], "c")) {
    if (n == 1) return (200, CONSOLE.doc(0, 0), _headers(HTML));
    (bool ok, uint256 id) = _toUint(resource[1]);
    if (!ok || !_exists(id)) return _notFound();
    if (n == 2) return (200, CONSOLE.doc(id, 0), _headers(HTML));
    if (n != 3) return _notFound();
    return (200, CONSOLE.doc(id, _verb(resource[2])), _headers(HTML));
}
```

`/c`, `/c/<id>`, `/c/<id>/<verb>`. Every state of the console is a real URL you can send. `_verb` maps the seven words in §C.7 to `1..7`; anything else is `0`.

**Why `/c` and not `/console`:** a phone's address bar truncates, and `/c/2049/hand` fits whole. There is one human route, so it does not need to distinguish itself from anything.

**The eighteen old routes are not deleted — they redirect.** ERC-5219 returns a status code and headers, so `Premises` answers `302` with `Location`:

| old | → |
|---|---|
| `/door`, `/gallery`, `/gallery/<p>`, `/open`, `/open/<p>` | `/c` |
| `/token/<id>`, `/token/<id>/faces`, `/token/<id>/market`, `/token/<id>/pool`, `/token/<id>/rent`, `/token/<id>/vault` | `/c/<id>` |
| `/terminal`, `/swap`, `/lock`, `/seal`, `/keys`, `/name`, `/estate`, `/launch`, `/chat`, `/rooms`, `/room/<n>`, `/dm/<id>`, `/cast` | `/c` |

Old links keep working and land somewhere true. This is strictly better than a 404 and costs ~600 bytes in the router.

**Kept as live routes, unchanged:** `/token/<id>/live`, `/token/<id>/sigil.svg`, `/token/<id>/raw`, `/token/<id>/face/<n>`, `/hook/<address>`, `/projector`, `/services.json`, `/token/<id>/services.json`. Each is a link you send to somebody, which is what a route is for.

**Superseded and left deployed but unrouted** (they are immutable; unrouting is the deletion): `PageDoor`, `PageToken`, `PageMarket`, `PagePool`, `PageTalk`, `PageRooms`, `PageTerminal`, `PageSwap`, `PageGallery`, `PageLaunch`, `PageLock`, `PageCast`, `PageSeal`, `PageKeys`, `PageName`, `PageEstate`, `DeskEstate`, `DeskTalk`, `DeskTerm`, `DeskRooms`, `DeskWill`, `Chrome`. **`Chrome.sol` is retired entirely** — its serif Didot, its fixed gold `#e0c184`, its `2rem` pills, `1.3rem` cards and `70px` shadows are not adapted, not used, not referenced.

`PageManifest` stays: `/services.json` remains the machine surface and is the one thing the old site did better than anything a person was given.

### H.2 · The contracts

| contract | holds | est. runtime | SSTORE2 | gzip |
|---|---|---|---|---|
| `Console.sol` | `doc(id, verb)` — head, seed block, server-rendered crest + column, the bootstrap, the blob concat | ~7 KB | no | — |
| `ConsoleRead.sol` | one view: `look(id) → (TokenView, Clocks)`, every satellite read in `try/catch`, `reported` bitmask | ~6 KB | no | — |
| `ConsoleSkin.sol` | the stylesheet, ~10.2 KB minified | 0.4 KB + ptr | **yes** | **no** |
| `ConsoleCore.sol` | rpc, ABI codec, `esc`, `short`, `kv`, `say`, `watch`, `guard`, `propose`/slab, the palette, the walk, the clock painter, the lane registry | 0.4 KB + ptr | yes | yes |
| `LaneTurn.sol` | §D.1 | 0.4 KB + ptr | yes | yes |
| `LaneHold.sol` | §D.2 | 0.4 KB + ptr | yes | yes |
| `LaneTrade.sol` | §D.3 | 0.4 KB + ptr | yes | yes |
| `LaneHand.sol` | §D.4 afternoon + season + for good | 0.4 KB + ptr | yes | yes |
| `LaneHandLater.sol` | §D.4 for a price + succession — registers into `LaneHand`'s table | 0.4 KB + ptr | yes | yes |
| `LaneSpeak.sol` | §D.5 commons + whispers + signatures | 0.4 KB + ptr | yes | yes |
| `LaneSpeakRooms.sol` | §D.5 rooms + roster — registers into `LaneSpeak`'s table | 0.4 KB + ptr | yes | yes |
| `LaneMake.sol` | §D.6 mint + launch | 0.4 KB + ptr | yes | yes |
| `LaneMakeName.sol` | §D.6 the name — registers into `LaneMake`'s table | 0.4 KB + ptr | yes | yes |
| `LaneLook.sol` | §D.7 | 0.4 KB + ptr | yes | yes |

Every contract is comfortably under 24,576 bytes because none of them holds its own text; they hold SSTORE2 pointers. The satellite pattern (`LaneHandLater`, `LaneSpeakRooms`, `LaneMakeName`) is `DeskTerm` → `DeskRooms`, proven and invisible: *a reader cannot tell from the console which rows came from which contract, which is the point.*

**Source bytes are not runtime bytes.** `Desk.sol` is 28,764 source bytes today and fits, because roughly forty percent of it is comment. Size all of these with the CI gate in §H.7, never by reading the file.

### H.3 · The blob discipline — what is compressed and what is not

**The stylesheet is stored raw and inlined into `<style>`.** Not gzipped, not base64. A `<style>` must be present before paint; inflating in JS is a flash of unstyled console. Paint correctness beats bytes, and this is the decision that makes §E.3's degradation sentence true.

**The core and the nine lanes are gzipped, base64'd, and inflated on demand.** Base64 costs +33%; gzip buys 4.5×. Net win 3.4×, and the arithmetic is stated rather than assumed. The bootstrap is ~1,300 raw bytes in `Console.sol`:

```js
/*  Lanes arrive as base64 of gzip and stay inert until one is opened.
    Renderer.INFLATE cannot be reused verbatim: it document.write()s a whole
    document. A lane is a fragment going into a live DOM, so it is inflated
    to text and appended as a <script> element — top-level, not eval, so a
    thrown error keeps its line number.                                    */
window.CON.pull = async function(k){
  const b = window.CON.blob[k]; if(!b) return; delete window.CON.blob[k];
  const raw = Uint8Array.from(atob(b), c => c.charCodeAt(0));
  const txt = await new Response(
    new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"))
  ).text();
  const s = document.createElement("script"); s.textContent = txt;
  document.head.appendChild(s);
};
```

`DecompressionStream` has been in every shipping browser for years and is part of the platform, like the JSON parser. Nothing is fetched.

Each lane's payload registers itself into one table:

```js
(()=>{const C=window.CON; if(!C||!C.lane) return;
  C.lane("hand",{key:"4",t:"HAND IT ON",
    sub:"for an afternoon, a season, a price, or for good",
    blurb:"Four ways to let someone else have it: for an afternoon, for a "
         +"season, for a price, or for good. Only the last one is irreversible.",
    clocks:["lease","vested","quiet","consign"],
    paint:h=>{ /* … */ }});})();
```

### H.4 · The seed block

Emitted between the stylesheet and the body, so state arrives before any console JS runs and no contract has to search a string for a marker. This is `Engine.sol`'s head/gap/body layout, reused.

```html
<script>window.CON={
 id:2049, chain:130, band:[2049,3072], hue:214, verb:0,
 hub:"0x…", pool:"0x…", lease:"0x…", succ:"0x…", cons:"0x…",
 locker:"0x…", parley:"0x…", roster:"0x…", name:"0x…", kiln:"0x…",
 venue:"0x…", sigil:"0x…", read:"0x…",
 owner:"0x…", reach:"0x…", grip:"0x…", word:"0x…", seed:"0x…",
 ops:47, xfers:2, strata:7, open:0x0f1b, mint:20913441,
 locked:false, kernel:1, kproved:true, ens:"pale-oblique.eth",
 clocks:{ seal:0, lockAt:0, bond:0, curve:false,
          lease:1756166400, vested:"14000000000000000",
          quiet:0, consign:0, nameAt:0, grace:false },
 reported:0x03ef,          /* one bit per satellite; a clear bit is "not reported" */
 sel:{ /* every selector, derived on chain */ },
 blob:{ core:"H4sIA…", turn:"H4sIA…", hold:"…", trade:"…", hand:"…",
        handlater:"…", speak:"…", speakrooms:"…", make:"…", makename:"…",
        look:"…" }
}</script>
```

**No keccak in the client for selectors.** Every selector arrives derived on chain, per `Desk.sol`'s stated rule — ~60 × ~28 bytes ≈ 1.7 KB. It is a real cost and it is paid, because *a client that computes less is a client that can be wrong about less.* The one exception is the ANY CALL and session-key paths, where a human-readable signature must be hashed in-frame; those carry the engine's verified keccak, which checks its own hash against a known digest at boot, and the confirm slab decodes the calldata back out of the bytes and shows the words. The check is not that the client did no work; the check is that the words are shown.

### H.5 · `ConsoleRead.sol`

```solidity
struct Clocks {
    uint64  sealUntil;   uint64  lockAt;     uint64  bondUntil;
    uint64  leaseUntil;  uint128 leaseVested;
    uint64  quietAt;     uint64  consignUntil;
    uint64  nameExpires;
    bool    nameInGrace; bool    curveStale;
    bool    reachExists; bool    gripExists; bool marketOpen;
    uint16  reported;    // one bit per satellite; clear = the read reverted
}
function look(uint256 id) external view returns (TokenView memory, Clocks memory);
```

Every external read is wrapped:

```solidity
try POOL.market(id) returns (Pool.Market memory m) {
    c.marketOpen = m.open; c.reported |= BIT_POOL;
} catch { /* leave clear: the client renders "not reported", never "none" */ }
```

This is the difference between a console that works on five chains and one that reverts on three.

### H.6 · Gas and size

`Console.doc()` assembles ~64 KB. Fourteen `staticcall`s + `EXTCODECOPY` over the SSTORE2 shards, plus the `ConsoleRead.look()` reads. Memory expansion for ~2,000 words is ~29 k gas; `EXTCODECOPY` is 3 gas/word; the satellite reads dominate at perhaps 300 k. **Estimate 0.6–1.2 M gas**, against `/token/<id>/live` at 21 M, which ships today.

**One implementation rule, and it is not optional:** assemble with a single `bytes.concat` over a pre-sized buffer. Repeated `string.concat` is a quadratic copy and will turn 1 M into 12 M without changing a visible byte.

### H.7 · CI gates — both are new, and both are required

1. **`forge build --sizes` with a hard fail at 24,576.** This repo does not have it. Add it. It is the only thing standing between a lane and an undeployable contract, and every byte estimate in this document is worthless without it.
2. **`tools/verify.mjs` extended.** It already takes the document off a live in-process EVM and compares byte for byte. Add three assertions: the seed block parses as JSON; every `blob` value inflates; and the seven verb keys in `Console.sol` match the seven `C.lane()` registrations exactly. Two copies of one naming table is the failure the critique names four times over, and this is where it would recur.

### H.8 · `engine/ipseity.html` — the three lines that change

**Line 568:**

```js
/*  Where /connect goes. The id is in the path because it is the resource.
    The uncommitted word rides in the fragment, which never reaches
    Premises.request — ERC-5219 sees the path and the query, never the hash —
    so the edit crosses without costing a contract byte and without being
    written anywhere it does not belong.                                     */
const LANDING = () => "/c/" + S.id + (L.dirty ? "#u=" + wordHex(L) : "");
```

**Line 3804**, and this is the fix for the recursion vector reaching the console:

```js
/*  top, not window. A nested section is inside its host's document; a
    console that opened in the iframe would be a console inside an
    instrument, which is where the stacking started.                        */
top.location.href = LANDING();
```

**Line 3053** — a live bug, one character of class:

```js
'<b style="color:var(--w)">Anything sent here is here permanently.</b>'
```

`--w` is not defined anywhere in `:root`; the token is `--warn`. `.pl.w` is an unrelated class selector. It is the single most consequential sentence in the Vault panel and it currently renders in inherited colour.

---

## I · NOT IN VERSION ONE

Each of these is refused now, with its reason, and none of them is a gap the console pretends not to have — every one is stated in place where a person would look for it.

| not in v1 | reason |
|---|---|
| **Any reconstructed history** — transfers, commits, trades, mints as a timeline | The only mechanism is a multi-address multi-topic `eth_getLogs` window scan, and its failure mode is a record with a hole in it that renders as complete. A collection whose written posture is *"a viewer which only reads what it is handed cannot tell a correct answer from a convenient one"* cannot make an unverifiable read into a surface. `SPEAK AS IT` has a past because `Parley`'s back-pointers make it exact |
| **Historical stills** — `Committed(id, word, strata)` carries the word, so a turn made in March is renderable in August | Same dependency. It is the most beautiful thing v2 can add and it is one `eth_getLogs` away from being wrong |
| **Price history charts** (`Venue.history`, `oldest`) | A chart. The lane shows `Venue.best` as three rows — pool, fee, liquidity — and a block explorer is what a chart is for |
| **`executeAsSession`** | The key holder is not the holder and does not arrive from an instrument. It needs a different front door |
| **`setApprovalForAll`** | It grants over the whole collection; this console acts on one token |
| **Seeding a new pool with liquidity** | v4 `modifyLiquidities(bytes,uint256)` needs an ABI coder this client does not carry. `LAUNCH A COIN` names the step it stopped at, in `--warn`, and does not pretend otherwise |
| **Cross-chain anything** | There is no bridge, by design, and `ParleyPort` is absent from both `deployments/*.json`. The console names the other four chains as places with their id bands and never sums across them |
| **A settings screen, a theme, a density control, sort, filter, an onboarding tour** | The one thing a holder can configure about this interface is the token's hue, and that is a transaction, in TURN IT, because it is a property of the object rather than of the viewer. Coach copy is three sentences, once, gated so a walked-into token never nags |
| **`localStorage` of anything** | Nothing in the console is per-viewer state. The crumb stack is the history and it dies with the tab |

### The first thing to add

*Built, 2026-08-23, with one correction the build forced: the route is
`/k/<id>/<key>`, not `/k/<key>` — a bare key cannot find the account
that granted it without an indexer, so the pair is the address, and
whoever hands out a key hands out the URL with it. The envelope renders;
the allowlists are stated as non-enumerable (they exist only in the
grant transaction's calldata) and checked one door at a time through
`sessionAllows`; the one act is checked before proposed and proposed
before sent. `INTERFACE.md` records the build; `verify-site` holds the
route.*

**A key holder's front door: `/k/<key>`.** A session key granted in `HAND IT ON → FOR AN AFTERNOON` is a bounded capability handed to a bot, a keeper or a model, and today nothing anywhere shows the holder of that key what it may do or how to use it. The page is small: read `sessionCurrent(key)`, `sessionTarget`, `sessionSelector`, `sessionAllows`, render *what this key may call, on what, up to how much, until when* — and one control that builds `executeAsSession`. It is the only place in the whole system where the person acting is not the person holding, and it is the one surface this console cannot be.

**The second:** historical stills, once — and only once — the log path can prove its own completeness. `mintBlock` bounds the scan; what is missing is a way to say *this is all of it* and be right. Until then the console says nothing about the past rather than something it cannot check.