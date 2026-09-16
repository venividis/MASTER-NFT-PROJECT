# The agent question

Three things were asked, and they have three different answers:

| | |
|---|---|
| **What is the best way to use ERC-7857 here?** | For the agent's private strategy — never for the artwork. It lives in the token itself, `src/Ipseity.sol`. |
| **Can Claude control some of our executions?** | Yes, and it already can: `grantSession` on the Reach. Bounded four ways, revocable in one transaction. |
| **Can Claude render a live GUI for it?** | Not literally, and the reason is a feature. What it can do is write the state the GUI already draws. |

The rest of this document is why, in that order.

---

## 1 · ERC-7857, actually read

ERC-7857 is *Intelligent NFTs* — AI agents as transferable tokens. Its
premise is that an agent's value is in metadata that **must not be public**:
model weights, a system prompt, a strategy, a memory. Publishing that
destroys it. So the standard says:

- the metadata lives off-chain as **ciphertext**;
- the chain holds a **commitment** to it (a hash) and a pointer;
- on transfer the blob is **re-encrypted to the buyer's key**, and an
  **oracle** — a TEE attestation or a zero-knowledge proof — testifies that
  the re-encryption was honest;
- `authorizeUsage` lets the owner delegate use without handing over
  the secret.

Two things follow immediately.

**It has no interface ID and no ERC-165 entry.** Its normative surface is
`transfer` / `clone` with a proof argument. There is nothing to advertise,
so `supportsInterface` says nothing about it. Any project claiming
"ERC-7857 compliant" via `supportsInterface` is claiming something the
standard does not define.

**Its premise is the exact inverse of this collection's.** IPSEITY's whole
argument is that the artwork is *bytes in contract code* — no server, no
IPFS, no gateway, nothing to trust. Encrypting that would be a
self-inflicted wound. So the answer to "can we make the NFT an iNFT" is:
not the artwork. Never the artwork.

### Where it is not a stretch

The moment the collection grew session keys — a bounded authority handed
to something that is not the holder — it grew a secret worth protecting.
Not *what the agent may do*: that is on-chain, bounded, and public, and it
has to be, or nobody can price the token. What is private is **how it
decides**. The prompt. The thresholds. The strategy.

That thing is:

- valuable, and worthless once public;
- genuinely part of what the token *is*, so it should follow the sale;
- useless to the buyer unless it is re-sealed to them.

Which is precisely and only what ERC-7857 is for. So that is what got
built.

---

## 2 · What is built: the kernel, in the token

Not a sidecar. The mechanism lives in `Ipseity.sol` alongside everything else
the token is, because a disposition that could be detached from the token is
not part of what the token is.

```
sealKernel(id, hashes, sealedTo)          holder asserts what the payload hashes to
transferWithKernel(to, id, proof)         move and re-seal atomically, or refuse
cloneWithKernel(to, id, proof)            the token reproducing, kernel and all
authorizeUsage(id, user)                  lend the use without lending the secret
setVerifier(v)                            once, from zero, never again
kernelStatus(id) → ABSENT|CURRENT|STALE   derived, never stored
kernelProved(id)                          did an oracle check this exact re-sealing
```

`transferWithKernel` is the shape ERC-7857 is built around: transfer and
re-encryption in one transaction, gated on a proof the token checks against
*its own* hashes, so a proof cannot be lifted from another token.

### The seam, which is the part worth building

`transferFrom` still exists. It has to — remove it and the token stops being an
ERC-721, and every marketplace stops working. But an ordinary transfer moves
the token and leaves the payload encrypted to whoever held it before. Nothing
is violated. The buyer simply owns a pointer to a ciphertext they cannot open,
and no event says so.

That is the gap, and it is closed by derivation rather than by an event:

```
sealedOwner == ownerOf(id)  →  CURRENT
sealedOwner != ownerOf(id)  →  STALE
```

No hook, no gas, no transaction, and no cooperation from a seller who would
rather it went unmentioned — the only half of that comparison a seller
controls is the one that already moved. It surfaces in the ERC-7496 trait too,
so a marketplace reading traits is told rather than left to guess.

**Three questions, kept apart.** `sealKernel` is the holder *asserting*
hashes. `kernelStatus` says the payload was sealed under whoever holds the
token now. `kernelProved` says a verifier checked that exact re-sealing. A
client that merges any two of them tells a buyer something nobody established.

### What was deliberately not built: the verifier

`verifier` is zero as this collection deploys. `hasVerifier()` says so.
`kernelProved()` is false for every token, and `transferWithKernel` on a live
kernel **reverts** rather than waving it through.

A TEE attestation verifier or a ZK circuit is the trust anchor of the whole
7857 design, and a stub would let a marketplace draw a green check nobody
earned. It would also be *permanent*: `setVerifier` may be called once, from
zero, and never again. A rotatable verifier is not a verifier — whoever can
swap it can install one that approves anything, and every kernel in the
collection becomes a claim about the curator instead of a claim about a proof.

36 assertions: `node tools/verify-kernel.mjs`.

---

## 3 · Can Claude control executions? Yes — and here is exactly how much

Claude cannot sign an Ethereum transaction. It has no key and should not
have one. What it can do is **hold a session key** — a keypair on a server
Claude talks to, which the token holder has authorized on-chain with
`IpseityAccount.grantSession`.

```solidity
grantSession(
    key,        // the agent's address
    expires,    // it cannot extend this
    spendCap,   // cumulative native value, it cannot raise this
    targets,    // it cannot widen this
    selectors   // it cannot widen this
);
```

Every one of the four is checked on **every** call through
`executeAsSession`. `revokeSession(key)` is one transaction, immediate,
unilateral, with no delay and no notice.

### The three escalations refused by shape

Bounds are only worth what the first move cannot undo. Three moves are
refused structurally rather than budgeted:

1. **A session cannot call the account.** Otherwise the agent's first act
   is `grantSession` on itself with no limits and all four bounds become
   decorative. `to == address(this)` reverts, and so does listing the
   account as a target at grant time — closing both the front door and the
   allowlist.
2. **A session cannot approve a spender it was not told about.** `approve`
   is called *on* the token contract, so allowlisting the target says
   nothing about who is being trusted. The **argument** is checked against
   the target allowlist, for `approve`, `increaseAllowance` and
   `setApprovalForAll`. This is the one place a venue registry genuinely
   earns its keep.
3. **A session cannot touch the Grip.** Nothing enforces this. There is
   nothing to enforce: `GripVault` has no function that spends. The
   holdings a buyer prices the token on are not merely off-limits to the
   agent — they are off-limits to everyone, forever, including the holder.

And the seal composes on top: while the Reach is sealed, a session key is
subject to the same balance measurement and the same approval refusals as
the holder. **A session is never more trusted than the person who granted
it.**

### What this actually buys

The interesting property is not that the agent is restricted. It is that
**the restriction is public and the strategy is private, and the first one
makes the second one safe.**

A buyer cannot read the agent's prompt — that is the point of the
kernel. But they can read `sessionOf(key)`, `sessionTarget`,
`sessionSelector`, `sealedUntil`, `manifest()`, and the Grip's
`holdings()`. So they can compute the worst case over *every possible
prompt*: the agent's authority is a fixed, enumerable set of doors, and no
text behind the ciphertext can open a door that is not in it.

That is a strictly stronger guarantee than "we audited the prompt", and it
is the reason the private half is tolerable at all.

### The wiring, concretely

```
Claude  ──MCP──▶  a signer service  ──▶  executeAsSession(to, value, data)
                  (holds the session key,          on IpseityAccount
                   holds the decrypted kernel)
```

The MCP server would expose roughly four tools:

| tool | does |
|---|---|
| `ipseity_read` | `kernelStatus(id)`, `market(id)`, `holdings()`, `sessionAllows(...)` — all `eth_call`, no key touched |
| `ipseity_propose` | build calldata + simulate it, return the decoded effect. **Never sends.** |
| `ipseity_act` | send a previously-proposed call through `executeAsSession` |
| `ipseity_kernel` | fetch the payload, check it against `dataHashesOf(id)`, decrypt, return the strategy as context — and refuse outright if `kernelStatus` is not CURRENT |

Two properties matter more than the tool list. **`propose` and `act` are
separate**, so the model's reasoning happens over a simulated result rather
than a committed one. And **`sessionAllows(key, to, selector)` is checked
client-side before sending**, so a policy violation is a refusal the model
can read and reason about, not a reverted transaction and a wasted fee.

That service is not in this repository. It holds a private key and talks to
a live RPC, so nothing about it can be exercised by the harness here, and
shipping untested key-handling code alongside tested contracts would
misrepresent which parts have been checked. The contract side of the
interface is built, tested, and documented above.

---

## 4 · The live GUI: the honest answer

**No — and refusing this is load-bearing.**

`tokenURI` returns a `data:` URI. The document inside it has no `fetch`, no
WebSocket, no script tag pointing anywhere, no font, no image, no analytics.
That is the entire reason it will still render in thirty years, and the
reason it renders identically for everyone. The moment it can be fed by a
live service, the artwork depends on that service being up and being
honest, and every claim in `README.md` about what this collection *is*
becomes a claim about somebody's uptime.

So Claude does not render the GUI. What it does instead:

> **Claude writes on-chain state that the GUI already draws.**

The engine reads its entire world from `window.IPSE`, injected at render
time from chain state. So when an agent commits a section word, syncs a
curve, re-seals a kernel or grants a key, the artwork shows it on the
next render — the rotation changes, the concentration of the pricing curve
visibly tightens, the vault panel updates. Nothing was streamed. The
picture changed because the chain changed.

That is the version worth having. The agent is not painting the picture; it
is turning the solid, and the solid *is* the price curve, so the picture and
the position are the same object. `syncCurve` under a session key is
literally an agent re-shaping the artwork by re-shaping the market.

If you want a genuinely live surface — a dashboard, a chat panel, streaming
telemetry — build it as a **companion page** outside the token, reading the
same chain state. It can be as live as you like, because when it goes down
the NFT is unaffected. Keeping those two things separate is not a
compromise; it is the only arrangement in which either one can make an
honest promise.

---

## 4b · The manifest: what an agent needs before a session key

Section 3 answers "how does an agent act on *my* token" — a session key, bounded
four ways. This is the other half, which was missing: how does an agent find out
what *any* token will do for it, without me telling it.

`web3://<premises>/token/42/services.json` is a shopfront generated by the same
contract that generates the page, from the same reads, in the same block. It
lists every service the token offers a stranger, with its live status, its price,
and — the part that matters for a program — **the selector of the call that
invokes it**:

```json
{ "id": "rent", "open": true, "paidTo": "token",
  "contract": "0x…",
  "perDayWei": "10000000000000000", "minDays": 1, "maxDays": 30,
  "invoke": { "sig": "rent(uint256,uint32,uint128)",
              "selector": "0x…", "kind": "send" },
  "firstArg": 42,
  "value": "perDayWei * days, exactly",
  "grants": "ERC-4907 user: may commit orientations and set writable traits;
             may never transfer, approve, lock or reach either vault" }
```

An agent holding that selector needs an RPC endpoint and nothing else. No
indexer, no subgraph, no hosted API, no ABI file, no documentation site — and
notably no continued existence of the contract that served it. Every one of
those is a dependency that can be withdrawn; the chain cannot.

This is also the cheapest way for an agent to *use* a token it does not own.
Renting is a real answer to "can Claude drive one of these": a renter is an
ERC-4907 operator, so it may commit orientations and set writable traits for as
many days as it paid for, and can never sell, approve, lock, or touch either
vault. The token enforces that distinction rather than asking anyone to respect
it, and the rent goes to the token rather than to whoever happens to hold it.

`/services.json` at the collection root does the same across a window of tokens,
so "which of these are open for business" is one call rather than four thousand.

There is no standard for any of this. The document carries an explicit
`"schema": "ipseity.services/1"` and claims nothing beyond being what it says it
is; if a standard arrives, serving it too is one more route on a contract that
already has one for everything else here.

---

## 5 · What breaks

Written here rather than left for someone to find.

**The seller does not forget.** Re-sealing gives the buyer the secret.
Nothing on any chain takes it back from whoever held it first. This is a
limitation of ERC-7857 itself, not of this implementation, and no oracle
fixes it. A kernel is worth buying when its value is *use going forward*, and worth
nothing when its value is *exclusivity*.

**An unproved kernel is an unverified kernel.** With no verifier, a buyer
must fetch the payload, hash it, compare against `dataHashesOf`, and decrypt
it themselves before paying. The contract makes that possible and does not
make it unnecessary.

**A session key is a hot key.** Its bounds hold if it is stolen — that is
the design — but everything inside those bounds is gone. Set `spendCap`
and `expires` to numbers you would be willing to lose outright, and grant
targets one at a time.

**A kernel names its payload and does not store it.** The hashes are
permanent; whatever they hash to is not. If the payload disappears, the
token still states what it committed to and can no longer demonstrate what
that was. Pin it.

**Nothing here has been audited**, and `forge test` has never run in this
environment — see the end of `INVARIANTS.md`.
