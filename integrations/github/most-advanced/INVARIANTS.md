# Invariants

Statements that must hold in every reachable state. Each names the test that
tries to break it. If any of these can be made false, that is a bug regardless
of what else passes.

The form is borrowed from the Dave Held core, which lists twenty-five of these
above its contracts. It is the most useful thing in that repository: an
invariant written down is a claim that can be attacked, where a feature list is
only a claim that something happened.

---

## The artwork

**1. The document that comes back is the document that went in.**
Every byte of `tokenURI`'s `animation_url`, after base64 → JSON → base64 → gzip,
equals the source. Nothing in the pipeline may quietly alter the engine.
→ `tools/verify.mjs` · *"the document that comes back is byte-for-byte the document that went in"*

**1b. The loader declares nothing in global scope.**
`document.open()` clears the document and keeps the Window, so any binding the
loader declares is still declared while the engine is being written in. The
engine is minified and its top-level names are single letters, so a `const D` on
both sides is one binding declared twice and the write throws. The payload
crosses on a property, read from inside a function.
→ `tools/verify.mjs` · *"and declares nothing at all in global scope"*

**1c. The document the chain returns draws.**
Not "round-trips" — draws: a WebGL2 context on `#field` and a body that has come
up, in Chromium, for every one of the eight solids.
→ `tools/shots.mjs`

**1d. Every label a contract writes is data in both formats it lands in.**
The solid names and notations are dropped unescaped into SVG character data
and into JSON strings. `<` and `&` are markup in the first; `"` and `\` are
structure in the second. None of the sixteen strings may contain any of them.
→ `tools/verify.mjs` · *"labels are safe in both formats they are written into"*,
  `tools/gallery.mjs` (the whole still, scanned), `tools/shots.mjs` (it decodes)

**2. A shard round-trips exactly.**
`SSTORE2.read(SSTORE2.write(x)) == x` for any non-empty `x` under 24,575 bytes,
and the deployed runtime always begins with `STOP`.
→ `test/Ipseity.t.sol::testFuzz_sstore2_roundTrips`, `test_sstore2_roundTripsExactly`

**3. A frozen engine never changes again.**
After `freeze()` no shard can be added, replaced or dropped, by anyone, forever.
→ `test_engine_frozenIsForever`, `tools/verify.mjs`

**4. A sealed renderer never changes again.**
After `sealRenderer()` the renderer pointer and the market pointer are both fixed.
→ `test_sealedRendererIsForever`

**5. Every token is born renderable.**
A minted token's section word always names one of the eight solids and never
sets a bit above 128. No mint can produce a token that cannot be drawn.
→ `testFuzz_mint_alwaysBornRenderable`

**6. Only a renderable section can be committed.**
→ `test_commit_refusesASolidThatDoesNotExist`, `test_commit_refusesBitsAboveTheWord`

**7. The section word round-trips.**
Six angles, an offset, a solid and a hue pack into one word and come back
identical.
→ `testFuzz_sectionWord_roundTrips`

**8. Every shader compiles.**
No document is ever packaged whose GLSL would fail to compile.
→ `tools/glsl-check.mjs`, enforced in `tools/build-engine.mjs`

**9. The token's own cryptography agrees with Ethereum.**
The keccak-256, ABI coder, EIP-55 checksum, EIP-712 hasher and CREATE2
derivation carried inside the engine match published vectors.
→ `tools/selftest.mjs`

---

## The front door

**9b. Nothing depends on the index.**
`Premises.request` emits the token's own `data:` URI, read from the hub at
request time; its deployed code contains none of the document; it has no
state-changing function at all.

Stated exactly: Premises composes the page, so a compromised Premises could put
anything in that frame, and no assertion prevents that. What holds is that the
*artwork* is untouched — the bytes are in the collection, `tokenURI` can be
called directly, `/raw` returns the URI to check against, and every token
renders identically whether this contract exists, is abandoned or is replaced.
An index is safe to have only because nothing depends on it.
→ `tools/verify-premises.mjs` · *"what the page hands you is the token's own bytes"*, *"it holds none of the artwork's bytes"*

**9d. `/live` serves the same bytes, one step earlier.**
The document at `/token/<id>/live` equals what `tokenURI` base64s into its
`animation_url`. It exists because a `data:` document gets an opaque origin and
wallet extensions do not inject into one — the framed instrument can be looked
at and not used. A real `web3://` origin is what makes the twelve instruments
work.
→ `tools/verify-premises.mjs` · *"the instrument, on an origin a wallet will talk to"*

**9c. A request for nonsense is answered, not reverted.**
A missing token, a non-numeric path segment, an undefined route and an empty
segment all return 404 with a document. A client asking for something that does
not exist deserves an answer rather than a failed `eth_call`.
→ `tools/verify-premises.mjs` · *"a request for nonsense is a 404, never a revert"*

---

## Custody

**10. `locked()` and `isTransferable()` never disagree.**
There is one flag. ERC-6454 is written in terms of ERC-5192, so the collection
cannot tell two different stories about whether a token can be sold.
→ `testFuzz_lockAndTransferableNeverDisagree`

**11. A bound token does not move.**
→ `test_boundTokenWillNotMove`

**12. A lease never survives a sale.**
Transferring a token clears its ERC-4907 user in the same transaction.
→ `test_leaseDoesNotSurviveTheSale`

**13. A renter operates the artwork and never the money.**
The ERC-4907 user may commit a section. They may not transfer the token,
withdraw inventory, or sync a market's curve.
→ `test_borrowerMayOperateButNotSell`, `test_renterCannotRepriceSomeoneElsesLiquidity`

**14. Enumeration survives churn.**
`tokenOfOwnerByIndex` remains a complete, duplicate-free view of each owner's
holdings across arbitrary transfer orders.
→ `test_enumerationSurvivesChurn`, `tools/verify.mjs`

---

## The market

**15. The invariant never falls, measured against the offsets the market
anchored to.**
`(x + vx)(y + vy)` is the same or larger after every trade that succeeds, at
every curve a holder can commit — where `vx` and `vy` are the market's stored
offsets, not a figure recomputed from the reserves as they now stand.

*That qualifier is the whole invariant, and it was learned the hard way.*
Virtual reserves used to be derived from the live reserves on every quote,
which re-anchored the curve after every trade: k was conserved **within** a
trade and not **across** two, and buying then selling straight back extracted
the difference. At eight-times concentration and a trade worth a third of the
reserve, 400 units in came back as 718. Both suites "verified" the old
behaviour because both recomputed the offsets the same wrong way, and the
200-trade walk caps every trade at 2.5% of the reserve, where the fee covers
the leak. It was found the first time the properties were actually run against
random inputs.
→ `tools/fuzz.mjs` · *"k never falls, measured against the offsets the market anchored"*, *"a live swap never lowers the invariant"* · `testFuzz_invariantNeverFalls`, `tools/verify-pool.mjs` (200 random trades)

**16. A round trip never profits.**
Buying and immediately selling back always returns less than it cost — at every
curve, at every fee, and at every size up to 40% of the reserve. There is no
free arbitrage inside the pricing.
→ `tools/fuzz.mjs` · *"a round trip never profits, at any concentration, at any size"*, *"buying and selling straight back never comes out ahead"* · `testFuzz_roundTripNeverProfits`

**16b. A trade moves along the curve and never moves the curve.**
The anchored offsets are written by `openMarket`, `deposit`, `withdraw` and
`syncCurve`, and by nothing else. `swap` reads them. Every write emits
`CurveAnchored`, so the one thing a trade must never do is visible in the log
if it ever happens.
→ `tools/fuzz.mjs` · *the market*

**17. The pool never pays out more than it holds.**
The curve prices against virtual reserves and will quote more than the real
balance; no trade may take more than half the outgoing reserve, and an
oversized trade is refused rather than partially filled.
→ `testFuzz_neverPaysMoreThanItHolds`

**18. More in never means less out.**
The pricing is monotonic in the input at every curve.
→ `testFuzz_outputIsMonotonicInInput`

**19. Concentration is bounded, and only `w` moves it.**
Concentration is always within `[0, MAX_CONCENTRATION]`, and rotations in the
three planes that do not contain `w` leave it exactly zero — spinning the
section changes the picture's orientation and never the price.
→ `testFuzz_concentrationIsBounded`, `test_turningThroughWConcentratesTheCurve`

**20. The market's curve is a copy, never a live read.**
Turning the artwork does not move a market until the holder syncs it.
→ `test_renterCannotRepriceSomeoneElsesLiquidity`

**21. Only the holder moves inventory.**
Depositing, withdrawing, opening, closing, re-pricing and syncing are all
holder-only. Trading is open to everyone.
→ `test_onlyHolderMayOpenDepositWithdrawOrSetFee`

**22. Selling the token sells the market.**
Reserves, fee income and curve follow `ownerOf`. The seller loses access in the
same transaction the buyer gains it.
→ `test_sellingTheTokenSellsTheMarket`

**23. A bond only ever moves further out, and it survives the sale.**
`bondUntil` cannot be lowered by anyone, including through a transfer. While it
holds, nothing exits and no term changes — not withdrawal, not closure, not the
fee, not the curve. Deposits and trades still work, because those are additive.
→ `tools/verify-pool.mjs` · *the bond*

**24. A bond has a ceiling.**
No bond may run longer than a year. A promise nobody can outlive is
indistinguishable from burning the inventory.
→ `tools/verify-pool.mjs` · *"a bond longer than anyone can outlive"*

**25. The credited reserve is what arrived, never what was asked for.**
A token that takes a cut on transfer is credited its net; a token that returns
no data at all is accepted.
→ `test_feeOnTransferTokenIsCreditedOnlyWhatArrived`, `test_silentTokenIsAccepted`

**26. A trade honours its floor and its deadline.**
→ `test_slippageFloorIsHonoured`, `test_deadlineIsHonoured`

---

## The vault

**32. A sealed vault's manifest never shrinks.**
While `sealedUntil` has not passed, no call through `execute` may leave the
account holding less of any listed asset, or less ether, than it held before —
whatever that call was. Enforced by measuring balances either side of the call,
not by listing the words that move assets, because that list cannot be
completed.
→ `tools/verify-vault.mjs` · *"a word no list has ever heard of"*

**33. While sealed, no approval executes.**
An approval moves nothing at the moment it is granted, so measurement is
structurally blind to it and the loss lands in a later block. `approve`,
`setApprovalForAll`, `increaseAllowance` and both `permit` shapes are refused
outright. There is no venue registry here to make exceptions for, so there are
no exceptions.
→ `tools/verify-vault.mjs` · *"approving a spender to pull later"*

**34. While sealed, no ether leaves, and the only signature honoured is one
this account could have built itself.**
Ether is refused outright: its effect lands outside the window a
same-transaction measurement can observe.

Signatures used to be refused outright too, and that was the safe answer
rather than the right one. An account that cannot sign anything for a year
cannot prove to a counterparty that it is the thing holding what it holds —
which is half of what this collection claims a token is. While sealed,
`isValidSignature` now validates *only* digests it can rebuild under its own
EIP-712 domain (`IPSEITY_ATTESTATION`, `verifyingContract = the account`), and
the caller must hand over the preimage so the account rebuilds rather than
trusts. Every venue hashes orders under its own domain separator, so an order
hash can never be the output of `attestationDigest` — a sealed account is
structurally incapable of signing one away. Not disallowed: incapable, with no
allowlist to maintain and none to get wrong.
→ `tools/verify-vault.mjs` · *"a sealed vault can say who it is, and cannot promise what it holds"*

**34b. A batch is one act or none, and the seal measures the whole of it.**
`executeBatch` snapshots once before and verifies once after, so a sequence
that is genuinely poorer in the middle and whole at the end goes through —
which is the ordinary shape of real work and what per-call measurement would
refuse. Approvals are still refused call by call, because their damage lands
in a later block that no end-of-batch measurement can reach.
→ `tools/verify-vault.mjs` · *"a batch is one act or none"*

**35. The seal only ratchets, has a ceiling, and survives the sale.**
It can be pushed further out by the holder and lowered by nobody. It cannot run
past a year. It binds the buyer exactly as it bound the seller.
→ `tools/verify-vault.mjs` · *the seal*, *the promise survives the sale*

**36. `execute` is CALL only.**
`delegatecall` would let the holder rewrite the account's own storage, including
the seal. Any operation other than 0 reverts.
→ `tools/verify-vault.mjs` · *"delegatecall, which would rewrite the account"*

**37. A sealed vault can still act.**
Anything leaving it no poorer goes through. Measuring rather than freezing is
the whole reason: a vault that cannot act is a safe.
→ `tools/verify-vault.mjs` · *"but the vault still works"*

---

## The other hand

Every token has two ERC-6551 accounts at two salts. The Reach
(`IpseityAccount`) can act and is policed. The Grip (`GripVault`) cannot act
and needs no policing. The registry is canonical and the implementation is a
parameter, which is what makes this possible at all.

**38. The Grip has no function that spends.**
Every state-changing function in its compiled ABI is a token receiver. There
is no `execute`, no withdraw, no sweep, no rescue, no owner override, no
admin, no upgrade path — for the holder, for the collection, for governance,
forever. Asserted against the ABI, not the source, because the guarantee is
structural rather than behavioural.
→ `tools/verify-vault.mjs` · *"every state-changing function is a token receiver"*, *"there is no execute"*

**39. The Grip does not advertise a capability it lacks.**
`supportsInterface` deliberately excludes `0x51945447` (IERC6551Executable), so
a client that checks before calling `execute` is told the truth in advance
rather than discovering it in a revert.
→ `tools/verify-vault.mjs` · *"it declines to advertise IERC6551Executable"*

**40. A Grip's holdings are a floor, not a snapshot.**
Because nothing can leave, the number a buyer reads before they pay is a
number the seller cannot move between a handshake and a settlement. This is
the invariant the whole two-hand split exists to produce.
→ `tools/verify-vault.mjs` · *"so the attacks have nothing to aim at"*

---

## Session keys

**41. A session is bounded four ways and can widen none of them.**
An expiry it cannot extend, a target allowlist it cannot widen, a selector
allowlist it cannot widen, and a cumulative native spend cap it cannot raise.
All four are checked on every call, and the cap counts across the session's
whole life rather than per call, so the same allowance cannot be spent twice.
→ `tools/verify-vault.mjs` · *"a selector it was not granted"*, *"a target it was not granted"*, *"the spend cap counts across the whole session"*, *"the expiry is a wall the key cannot move"*

**42. A session cannot reach the account itself.**
`to == address(this)` reverts in `executeAsSession`, and `address(this)` is
refused as an allowlist entry at grant time. Otherwise the agent's first act
is granting itself a session with no limits and every other bound is
decorative.
→ `tools/verify-vault.mjs` · *"calling the account itself, to grant itself more"*

**43. A session cannot approve a spender that was not named.**
For `approve`, `increaseAllowance` and `setApprovalForAll`, the *spender
argument* must itself be on the target allowlist. Allowlisting the token
contract says who is being called, never who is being trusted.
→ `tools/verify-vault.mjs` · *"approving a spender nobody named"*, *"setApprovalForAll is checked the same way"*

**44. Revocation is immediate and unilateral.**
One transaction by the holder, no delay, no notice, no appeal.
→ `tools/verify-vault.mjs` · *"revoked instantly"*

**45. A session is never more trusted than the holder.**
Session calls go through the same `_act` gauntlet, so while the Reach is
sealed a session is subject to the same measurement and the same approval
refusals. And the Grip is out of reach because the Grip has no function to
reach for.
→ `tools/verify-vault.mjs` · *"the Grip is not on any allowlist it could be given"*

---

## The sealed kernel

The one place ERC-7857 is not a stretch here: a token carries a payload that
is not public — the disposition an agent runs under — named on chain only by
hash. See `AGENT.md`. Conformance is deliberately not claimed; see the note in
`src/interfaces/Standards.sol`.

**46. A kernel's staleness is derived, never announced.**
`kernelStatus` compares the owner the kernel was sealed under against
`ownerOf` at read time. `transferWithKernel` re-seals atomically, but ordinary
`transferFrom` still exists — it has to, or the token stops being an ERC-721 —
and it moves the token while leaving the payload encrypted to the seller. That
shows up as STALE with no hook, no gas and no cooperation from a seller who
would rather it went unmentioned. The only half of the comparison a seller
controls is the one that already moved.
→ `tools/verify-kernel.mjs` · *"the kernel went STALE by itself"*, *"the ERC-7496 trait reports it too"*

**47. Sealed, current and proved are three questions, asked separately.**
`sealKernel` is an assertion by the holder. `kernelStatus` says the payload was
sealed under whoever holds the token now. `kernelProved` says a verifier
checked that exact re-sealing. With no verifier deployed the third is false
everywhere, and no reading of the first two can be mistaken for it.
→ `tools/verify-kernel.mjs` · *"sealed is not proved"*, *"proved goes with it"*

**48. A proof is about this token's payload, or it is refused.**
The old hashes in a proof must equal the hashes on file, so a proof cannot be
lifted from one token and replayed against another, and a re-seal cannot empty
a kernel under cover of a transfer.
→ `tools/verify-kernel.mjs` · *"a proof about a different payload is rejected"*

**49. The verifier is chosen once and never rotated.**
It may be set from zero exactly one time, never to zero, and after that
`setVerifier` reverts for everybody including the curator. A rotatable
verifier is not a verifier: whoever can swap it can install one that approves
anything, and every kernel becomes a claim about the curator rather than about
a proof.
→ `tools/verify-kernel.mjs` · *"it can never be swapped"*

**50. With no verifier, the proved paths refuse rather than wave through.**
`transferWithKernel` and `cloneWithKernel` revert on a live kernel when there
is no oracle. A token with no kernel still transfers through them, because
there is nothing to prove.
→ `tools/verify-kernel.mjs` · *"the atomic path refuses rather than waving through"*

---

## Privilege

**27. No admin path can move an asset.**
The market's five admin entry points are `setPaused`, `bless`,
`setAllowlistEnforced`, `proposeAdmin`, `acceptAdmin`. Not one takes a token id
or an amount, so not one can name a thing to move. Asserted against the compiled
ABI rather than by reading the source.
→ `tools/verify-pool.mjs` · *"what the admin cannot do"*

**28. The pause never traps money.**
Pausing halts trading and deposits. Withdrawal has no pause modifier and is
reachable in every state. A pause that traps money is a slower theft.
→ `tools/verify-pool.mjs` · *"but withdrawal still works"*

**29. Privilege never transfers in one step.**
Both the collection's curator and the market's admin move by propose-and-accept.
An address that cannot answer never receives the role, so a mistyped handover
is recoverable rather than permanent.
→ `tools/verify-timelock.mjs`, `tools/verify-pool.mjs` · *admin handover*

**30. A timelocked change takes seven days and announces itself first.**
Queued operations cannot execute early, cannot execute after the fortnight
grace window, cannot be re-queued to move a published eta, and cannot be
replayed. The full calldata is in the `Queued` event.
→ `tools/verify-timelock.mjs`

**31. The timelock admin cannot escape the delay.**
Rotating the admin is only reachable through the queue, so it takes the same
seven days as anything else.
→ `tools/verify-timelock.mjs` · *"the admin rotating itself directly"*

---

## Where the tokens talk

**79. A message is signed by the token, not by an address.**
`speak`, `whisper`, `found`, `join`, `leave`, `invite`, `evict` and `announce`
all go through `mayActAs`, which admits the owner and the token's own ERC-6551
account and nobody else. Not the renter: a lease buys the instrument's use, not
the right to speak in its name.
→ `test/Parley.t.sol::test_onlyTheHolderSpeaksAsATheirToken`,
  `test_theBoundAccountMaySpeakAndTheRenterMayNot`
→ `tools/verify-parley.mjs` · *"a wallet cannot speak as a token it does not hold"*

**80. The walk always goes backwards, so a client always stops.**
Every message carries the block of the message before it, and the room stores
where the newest one is. Two messages in one block is the case that breaks a
naive reader — the second one's pointer is its own block — so the walk follows
the *oldest* log in a block, whose pointer is necessarily earlier.
→ `tools/verify-parley.mjs` · *"two messages in one block do not send the walk in
  a circle"*, with the naive version run alongside it and watched to loop

**81. Reading a conversation is one query per block that has one.**
Never a range. `eth_getLogs` over a wide range is the first request a public
endpoint refuses, and a client that needed one would work in every test and fail
in production.
→ `tools/verify-parley.mjs` · *405 blocks of history, read in three queries*
→ `tools/verify-site.mjs` · *"and every one of them asked for exactly one block"* —
  measured on the shipped client, not on a copy of it

**82. Every room is a different room.**
A group key is `keccak(1, index)` and a pair key is `keccak(2, min, max)`, hashed
over different lengths, and a pair is the same room from both sides.
→ `test/Parley.t.sol::test_aGroupKeyIsNeverAPairKey`, `test_aPairIsTheSameRoomFromBothSides`

**83. A pair room is reachable only through the derivation.**
The derivation is the membership proof, so `speak` refuses a pair key outright
rather than checking a membership it would have to store. A token genuinely in
that room still cannot post to it that way.
→ `test/Parley.t.sol::test_aPairRoomCannotBePostedToThroughSpeak`

**84. A room nobody founded is not a room.**
→ `test/Parley.t.sol::test_anUnfoundedRoomIsNotARoom`

**85. Nobody can lengthen somebody else's room list.**
An invitation records permission; joining is the token's own transaction. The
only unbounded array in the protocol can be grown by exactly one party, and it
is the party who pays for it.
→ `test/Parley.t.sol::test_nobodyCanLengthenSomebodyElsesRoomList`
→ `tools/verify-parley.mjs` · *"an invitation alone still adds nothing to it"*

**86. Leaving is remembered without erasing anything.**
The room stays on the token's list marked "left", because the list is what is
worth asking about and `inRoom` is the authority on membership. Rejoining does
not duplicate the entry.
→ `test/Parley.t.sol::test_leavingIsRememberedWithoutErasingTheRoom`,
  `test_rejoiningDoesNotDuplicateTheEntry`

**87. A steward can close a door and cannot close a mouth.**
Only the steward invites and evicts, and eviction changes no message and no
count. There is no delete, no edit, and no way to stop anyone reading.
→ `test/Parley.t.sol::test_onlyTheStewardInvitesAndEvicts`, `test_evictionCannotUnsayAnything`

**88. A body has both ends, and a kind this contract does not know is refused.**
Empty is refused, `MAX_BODY` is accepted, one byte past it is refused, and only
`PLAIN` and `SEALED` are kinds.
→ `test/Parley.t.sol::test_aBodyHasBothEnds`, `test_aKindThisContractDoesNotKnowIsRefused`

**89. A body is bytes and stays the bytes it was.**
Round-tripped byte for byte, including one that is markup and one that is not
ASCII. A sealed body is flagged rather than interpreted.
→ `tools/verify-parley.mjs` · *"byte for byte"*

**90. Nothing that came off the chain becomes markup.**
Every string from a log or a call reaches the DOM through `textContent`. The site
verifier sends `</script><img src=x onerror=alert(1)>` through the real client
and asserts the element it lands in has no children and was never assigned
`innerHTML` — on the same origin `/token/<id>/live` is served from, where a
wallet is injected.
→ `tools/verify-site.mjs` · *"because the client never assigned innerHTML to it"*

**91. The client computes no hashes.**
Every event topic and every selector arrives already derived, from
`Parley.topics()` and from signature strings hashed on chain. A topic written
down by hand would match nothing, and a chat that matched nothing looks exactly
like a chat nobody has used.
→ `test/Parley.t.sol::test_theTopicsAreDerivedFromTheSignaturesThemselves`
→ `tools/verify-site.mjs` · *"filtered to the room, by a topic the contract computed"*

**92. Every page contract is read-only.**
`PageDoor`, `PageTalk`, `PageRooms` and `DeskTalk` have zero state-changing
functions in their compiled ABIs. `DeskTalk` is the one that matters most: it
holds the client, so it is the obvious place for a function that stands between
a person and their wallet.
→ `tools/verify-site.mjs` · *read off the compiled ABI*

**93. The manifest is the instruction manual for replacing the browser.**
`/services.json` carries the parley's address, the commons key, the message
topic and the rule for walking backwards — enough to read the whole archive with
`eth_getLogs` and never load a page of this site.
→ `tools/verify-site.mjs` · *"and the topic a program filters on"*, checked against
  the hash of the signature string rather than against the contract's own answer

## The tabs

**94. The terminal is one code path for fingers and for models.**
`TERM.run(line)` is what the keyboard calls and what an agent calls; the
suite drives mint, speak, launch and lockup through it and asserts
against the chain, not against the screen. `TERM.commands()` returns the
whole table as data — usage, description, writes — so a model asks the
terminal what it can do instead of scraping it.
→ `tools/verify-site.mjs` · *"driving the terminal"*

**95. The terminal hashes nothing and pads nothing wrong.**
Every selector arrives from `DeskTerm.config()`, derived on chain from its
signature string; dynamic arguments are laid out by an encoder that walks
parameters in signature order and computes every offset before writing one,
because an offset written while the tail is still growing is a lie.
→ `src/DeskTerm.sol` · `ENC`, exercised by every string-carrying command in
  the drive

**97. A launched coin has no owner because its ABI has none.**
Fixed supply minted once to the launcher; no mint, no pause, no blacklist,
no upgrade. The guarantee is the absence of the functions, which the
compiled ABI states machine-checkably — and every one of the omissions is
a lever a deployer could otherwise pull against the people who bought.
→ `src/Kiln.sol` · `Coin`

**98. The router's calldata shape travels with its address.**
Two Uniswap routers share the name `exactInputSingle`; their param structs
differ by exactly one word, and sending one shape to the other does not
revert — it shifts the recipient and every amount. So the venue stores a
kind beside the router address, the client builds seven or eight words from
the kind, and the drive sends the wrong shape on purpose and requires it to
arrive mangled — a mock that accepted it unchanged would make every
field-by-field check above it theatre.
→ `tools/verify-site.mjs` · *"the same page wired to the other router"*

**99. The signing wallet is chosen, never raced.**
EIP-6963 announcers are collected, not taken first-come; the signing
identity is the stored choice, the only wallet, or the person's pick from
a list — and clicking your own address asks again. Reads may use any
announcer, because a read is just RPC.
→ `src/Chrome.sol` · `WALLET_JS`

**100. A hook's permissions are its address, and the kiln refuses a mismatch.**
v4 invokes a hook's callbacks by testing bits of the hook's own address, so
`/hook/<address>` reads a hook's powers with no call and nothing its author
can misstate. `deployHook` checks the deployed address carries exactly the
declared bits and reverts `WrongFlags` otherwise — a hook at an address
missing a bit is code the pool never consults, and a lock nobody consults
looks exactly like a lock. The mining salt mixes the sender, so watching
the mempool for a `launch` and re-sending it with more gas takes nothing.
→ `tools/verify-site.mjs` · *"driving the launchpad"*, `src/Kiln.sol`,
  `src/lib/Hook.sol`

**101. A lock ends when its clock says — no sooner, for no one, only once.**
`claim` refuses before the time (`NotYet`), refuses every caller but the
locker (`NotYours`), refuses a second time (`AlreadyClaimed`); `extend`
moves the date away and never nearer (`OnlyLonger`); nothing locks past
ten years from now (`TooLong`), because a lock with no end is a burn
wearing a vault's clothing. There is no owner, no pause and no rescue
path — a rescue path is an unlock with a nicer name.
→ `tools/verify-site.mjs` · *"driving the vault"*, `src/Locker.sol`

**102. The vault records what arrived, not what was asked for.**
The locked amount is the measured balance difference, so a fee-on-transfer
token that skims on the way in cannot make the vault promise more than it
holds, and what comes out at term is what actually went in, to the wei.
→ `src/Locker.sol` · `lock`, asserted to the wei in the vault drive


**103. A name reaches this site by record, not by favor.**
The Nameplate answers ENS the way ERC-6821 asks: `text("contentcontract")`
names the Premises, chain-scoped, so a web3:// browser resolves a bound
name straight into the chain with no IPFS and no gateway; `addr` is the
token's own 6551 account; the wildcard parent makes `<id>.parent` every
token's address the moment it mints. There is no admin: binding re-checks
the ENS registry on every call, and the parent slot is written once by
whoever ENS itself says owns the parent.
→ `tools/verify-site.mjs` · *"the nameplate answers for the collection"*,
  `src/Nameplate.sol`

**104. A lock is a position; the date is not.**
`give` hands the claim to anyone — most usefully a token's own account, so
a locked treasury travels with the token when the token is sold — and
moves nothing else: not the date, not the amount, not the refusals. The
per-owner index is a finding aid; ownership is the field `claim` checks.
And a permit that dies (front-run, unsupported, malformed) does not kill
the lock that carried it — the lock proceeds on whatever allowance stands,
because a vault that died to a griefable signature would be a vault nobody
could reach.
→ `tools/verify-site.mjs` · *"a lock is a position, and a position changes
  hands"*, `src/Locker.sol`

**105. What is sealed was never open anywhere but at the two ends.**
The key is the hash of a wallet signature over a fixed sentence — the same
key in every browser forever, nothing stored, nothing to lose — and the
public point is recovered by handing WebCrypto the scalar in a PKCS#8
envelope with the public half omitted, which is the one way to get curve
arithmetic without shipping any to audit. Static-static ECDH, AES-256-GCM,
the kind byte says sealed, and the chain carries bytes it cannot read —
the promise Parley's envelope made on the day it was written, now kept end
to end. A derived key that differs from the published one is said out loud
and sends plaintext rather than pretending.
→ `tools/verify-site.mjs` · *"two tokens whisper through a sealed room"*,
  `src/DeskSeal.sol`

**106. Beauty hides nothing it shouldn't.**
The lore chips fold explanation only — `p.e`, never a warning — and with
JavaScript off the chip script never runs, so every folded word is simply
on the page. The 4-polytope on the door is navigation, not decoration: its
eight door-vertices exist as data (`window.TESS.doors`), the terminal's
`go` walks the same set by word, and the nav row beneath the solid lists
them for hands and for readers with no canvas. An agent, a mouse, and a
screen reader enter through the same eight doors.
→ `tools/verify-site.mjs` · *"the door is the solid itself"*,
  `src/PageDoor.sol` · `TESS_JS`, `src/Chrome.sol` · the lore

**107. The instrument is the door, and knows when it can be.**
The artwork carries a third orbit: eight door-vertices that open the 2-D
site's surfaces — swap, launch, lock, social, gallery, archive, the site
itself — and a terminal veil drawn over the field. The ring forms only
where an origin can answer (`https` or `web3:`), because a marketplace's
`data:` sandbox has no site behind it and a door painted on a wall is a
lie; there the artwork simply remains the artwork. The doors ride outside
the shader's twelve uniforms — labels, wires and the picking ray know
them; the field does not — so the sealed geometry of the instrument's own
modules is untouched.
→ `engine/ipseity.html` · `DOORS`, gated by `DOORED`; seen live on every
  token the moment the hub was re-pointed

**108. The bolt answers to the holder alone.**
Soulbinding exists to survive the one attack that actually empties wallets:
a phished approval. It did not. `onlyHolder` admits an approved operator,
so a thief holding an approval could call `unlock` and then take the token
— measured, on chain, before it was fixed. `lock` and `unlock` now take a
stricter door that admits the owner and the token's own account and nobody
else, and the attack is run on every check so it cannot come back.
→ `tools/verify.mjs` · *"the bolt survives a stolen approval"*,
  `src/Ipseity.sol` · `onlyOwner`

**109. A token cannot be given to its own hand.**
Transferred to its own Reach or Grip, a token is frozen forever: the account
asks who holds the token, and the holder would be the account. Both hands are
refused, computed rather than looked up so the refusal covers an account
nobody has deployed yet.
→ `tools/verify.mjs` · *"the hands cannot hold the token that made them"*,
  `src/Ipseity.sol` · `isTransferable`

**110. A page that carries no keccak proves its encoding against one that does.**
The name page builds DNS wire format with string arithmetic because the
browser here has no hash function; the resolver hashes what it is handed. The
drive encodes the same name independently and requires the contract to agree
about which node it meant — the only way a hand-built encoding can be checked
by something other than itself.
→ `tools/verify-site.mjs` · *"the name the client encoded is the name the
  contract hashed"*, `src/PageName.sol`

**111. A granted permission is exactly the one that was pressed.**
`grantSession` carries two dynamic arrays whose items align opposite ways —
an address right in its word, a `bytes4` left — and getting it backwards
grants something nobody chose without reverting. The drive presses one chip,
sends the page's own calldata, and then asks the account, selector by
selector and address by address, what it believes it permits.
→ `tools/verify-site.mjs` · *"driving the session keys"*, `src/PageKeys.sol`

**112. A seal claims only what it checked.**
The private half of a token's sealing key is derived from a wallet
signature, so it belongs to a wallet and not to the token that published
it. A token sold after publishing therefore leaves behind a key its former
holder can still derive — and a message sealed to that key is readable by
the person who left and not by the person who arrived. The bar used to say
"only #a and #b can read what is said here" after verifying nothing but
the sender's own key. It now reads the far token's transfer count and says
which case this is: settled when the token has never moved, and a warning
naming the number of sales when it has. The page states the same thing in
contract-rendered prose, so it is true with JavaScript switched off.
→ `tools/verify-site.mjs` · *"its claim agrees with what the chain says about
  that token"*, *"a key published before a sale is called out"*,
  `src/DeskSeal.sol`, `src/PageTalk.sol`

**113. A warning arrives with the control that answers it.**
Three defects around the same bar, each small and each removing a person's
ability to act: the derived key was cached per page rather than per token,
so switching tokens raised a mismatch that had not happened; the sender's
own key was checked behind a return that fired when the far side had not
published, so the one case where you most needed to know your key was
stale was the one case you were never told; and the mismatch branch left
the publish button hidden, telling the only person who could fix it that
something was wrong while withholding the fix.
→ `src/DeskSeal.sol` · `arm`

**114. A roster does not call the room that holds everybody empty.**
Parley never writes `inRoom` for the commons — `speak` waves every token
through by key alone — so a reader that consulted the mapping reported the
room containing the whole collection as empty, and the panel said so in
words. The roster asks which of four kinds a key names before it answers,
and an unfounded key gets a number of its own, because Parley reads back
kind zero for a room nobody founded and kind zero is also the commons.
→ `tools/verify-site.mjs` · *"the commons holds every token, not none of
  them"*, `src/Roster.sol` · `kindOf`

**115. An heir cannot be named by somebody who only holds an approval.**
A succession an approved operator could rewrite is a succession a phished
approval redirects: the thief does not steal the token, they write
themselves into the will and wait for the silence. `arrange`, `revoke` and
`stillHere` take the strict door — the owner, or the token's own account
acting for itself, and nobody else.
→ `tools/verify-estate.mjs` · *"an approved operator cannot name the heir"*,
  `src/Succession.sol` · `onlyOwner`

**116. A dead-man's switch that cannot be heard is a trap.**
The silence opening the door is a bet about somebody's habits, so the knock
is public, anybody may make it, it starts a second clock, and one touch of
the instrument cancels it outright. A switch that fires the instant a timer
expires, with no audible warning and no way back, takes tokens from people
who were merely on holiday.
→ `tools/verify-estate.mjs` · *"the owner speaking up cancels the knock
  outright"*, `src/Succession.sol` · `summon`

**117. An arrangement that cannot fire says which part is broken.**
`wouldPass` returns one of ten codes rather than a bool. A soulbound token,
a withdrawn approval, a sale, an heir that resolves to the owner — each is
a different repair, and "no" is useless to somebody who arranged their
estate years ago and would like to know what to fix.
→ `tools/verify-estate.mjs` · *"a soulbound token reports that it cannot be
  inherited"*, `src/Succession.sol` · `wouldPass`

**118. An agent cannot go under the floor, and cannot keep it by going quiet.**
A consigned token can be priced anywhere at or above the number its owner
wrote and never one wei below, can move nowhere but to a buyer who paid or
home to the seller, and comes home on anybody's call once the term is out —
requiring the seller to still be alive to ask is the same trap one storey
down.
→ `tools/verify-estate.mjs` · *"a stranger can send it home, and home is the
  seller"*, `src/Consign.sol` · `reclaim`

**119. A buyer names the price they agreed to.**
`buy` takes the asking price as an argument and reverts if it moved.
Without that, an agent watching the mempool raises the ask into whatever a
buyer sent and keeps the difference — no revert, no theft the chain would
recognise, just a worse price than the one on the screen.
→ `tools/verify-estate.mjs` · *"an agent who raises the price under a buyer
  gets a revert, not the difference"*, `src/Consign.sol` · `buy`

**120. Escrow takes the title and gives back the use.**
While a token is consigned this contract owns it, which is what handing
something to a dealer means and is said in the open rather than buried. The
seller is set as the token's ERC-4907 user for the term, so they keep
operating the instrument while the dealer holds title to sell it, and the
hub clears that itself on the sale.
→ `tools/verify-estate.mjs` · *"but the seller keeps the use of it"*,
  `src/Consign.sol` · `consign`

**121. A page's client survives its own page being gone.**
Both readers here are reachable after their elements are: a refresh is
scheduled a second and a half out, and the account listener outlives any
one view. A reader that assumed its page was still mounted threw inside a
timer, where nothing is listening and nothing recovers.
→ `tools/verify-site.mjs` · *"driving the estate"*, `src/DeskEstate.sol` · `up`

**122. An index that is silently partial is worse than one that is small.**
Every flat route the site answers is named in `/services.json`, and the
suite checks the list against the routes rather than against itself. A
program reading a manifest that quietly omits a page concludes the page
does not exist.
→ `tools/verify-site.mjs` · *"every flat route the site answers is in the
  manifest"*, `src/PageManifest.sol` · `ROUTES`

**123. A sealed vault's manifest cannot move while a call is being measured.**
`_snapshot` aligns `pre[]` and `seen[]` with the manifest by index and
`unguard` removes an entry by swapping the last one into its slot, so an
`unguard` re-entered from inside the call being measured renumbers the
manifest underneath arrays taken before it — and a slot whose `seen` flag was
false, because a broken token used to sit there, now holds a real one, which
`_verify` skips. Measured on chain before it was fixed: a thousand GOLD left a
sealed vault and `isSealed()` still answered true. `nonReentrant` does not
cover it; the re-entry is into a different function.
→ `tools/verify-vault.mjs` · *"a batch that unguards the blind one mid-flight
  is refused too"*, `src/IpseityAccount.sol` · `notWhileMeasuring`

**124. A guarded piece cannot be dropped from inside the call that moves it.**
`unguardNFT` refuses, while sealed, only for a piece the account still holds —
so a batch that transfers the piece away first was then free to drop it from
the list, and `_verifyPieces` never went looking. That is the entire promise
of naming a specific NFT, defeated in two calls of one batch, and it is the
case that matters most because naming a piece is what somebody does with a
valuable one.
→ `tools/verify-vault.mjs` · *"nor moved and then quietly dropped from the
  list in one batch"*, `src/IpseityAccount.sol` · `notWhileMeasuring`

**125. A session key does not survive the sale of what it spends from.**
`sessionOf` is storage on the account, `executeAsSession` authorises out of
that mapping alone, and the hub's transfer clears the ERC-4907 lease and the
lease agent and nothing else — so a key the seller handed to a bot went on
spending from the buyer's Reach until it expired, up to a year, with nothing
telling the buyer to look. Every grant is stamped with the hub's transfer
count, and a key whose stamp is not the current one is refused. The counter
rather than the granting address, because sold and bought back an identity
check would wake every retired key up.
→ `tools/verify-vault.mjs` · *"the seller's key cannot spend from the buyer's
  Reach"*, `src/IpseityAccount.sol` · `sessionCurrent`

**126. The keys page says a key is retired rather than showing its date.**
A key can be unexpired and still dead. Reading only the expiry showed a
previous holder's key as live until its date, which is the reading that let
one keep spending in the first place.
→ `src/PageKeys.sol` · `cur()`

**127. A sign of life cannot be forged by a stranger.**
Succession read the hub's operation stamp so that ordinary use kept the
switch alive with nothing to remember. `embody` is open to the world — the
account's address is deterministic and materialising it is nobody's
privilege — and it stamped that counter, so any passer-by could reset the
silence for the price of gas and keep an heir from ever knocking. Measured
before it was fixed: after the full quiet period the plan read KNOCKABLE, a
stranger called `embody`, and it read SPEAKING again.

`embody` no longer stamps, matching `embodyGrip`, which never did. And the
succession counts only the owner's own word, because every remaining stamp
is reachable by an operator — an approved address, or a renter whose
ordinary use would hold the switch open for the length of their lease. What
was lost is real: the holder now has to say so once per silence. A
dead-man's switch a third party can hold open is not one.
→ `tools/verify-estate.mjs` · *"a stranger calling embody does not reset the
  silence"*, `src/Ipseity.sol` · `embody`, `src/Succession.sol` · `lastSeen`

**128. No instrument that moves value is born open.**
The birth mask read `0x587`, which opens bit 10 — Market, the token's own
automated market maker and the instrument in the set that moves the most
value — and leaves Nest, which does nothing but draw the token inside
itself, sealed behind a fee. The comment one line above the constant stated
the opposite rule, and the suite pinned `0x587` as though it were the
design, which is how it survived. `BORN_OPEN` is `0x987`, and the assertion
now derives the mask from a named list of the look-only instruments rather
than repeating a number: an assertion that restates the constant cannot
catch the constant being wrong. It is a `constant`, so it is settled at
deployment and settled forever for every token in the band.
→ `tools/verify.mjs` · *"no instrument that moves value is born open"*,
  `src/Ipseity.sol` · `BORN_OPEN`

> **A note on the numbering.** There are one hundred and twenty-seven
> statements here, numbered to 128: number 96 was retired with the feature it
> described and its number was not reused, because every entry is referenced
> by number from commit messages and from the suites. A gap is cheaper than a
> renumbering that silently repoints an old reference at a new claim.

**129. Two chains cannot issue the same number.**
The edition is one run of 4096 cut into five contiguous bands, one per
chain, fixed in each hub's constructor as an `immutable`. `mint` issues
`FIRST_ID + totalSupply` and refuses past `LAST_ID`, so a collision is not
prevented by agreement between chains — it is unreachable on each chain
independently. No bridge, no quorum, and no message to miss.
→ `tools/verify-site.mjs` · *"the partition, from both ends"*,
  `src/Ipseity.sol` · `constructor`, `tools/site.mjs` · `BANDS`

**130. The map the world reads is the map the deploy used.**
The partition is written twice — the table `tools/site.mjs` deploys from and
the constant `PageManifest.EDITION` publishes to every reader. Two copies of
one fact is a bug waiting for a redeploy, so the suite asserts they are the
same table, that it tiles the edition exactly once, and that the hub
answering is inside the band the map assigns it. A program reading only
`ceiling` would conclude one chain is the whole collection and be wrong by a
factor of four.
→ `tools/verify-site.mjs` · *"and it says exactly what the deploy table
  says"*, `src/PageManifest.sol` · `EDITION`

**131. The guard that protects the partition is itself attacked.**
`assertTiles` is an exported function rather than an inline check, so the
suite can hand it a broken table and watch it refuse: an overlap, a hole, an
unexhausted edition, a band running backwards, an empty table. Five refusals,
each naming the actual fault. A guard nothing has ever seen fail is a guard
nobody has checked.
→ `tools/site.mjs` · `assertTiles`

**132. The curve is the solid.**
`concentration` read three angles and nothing else, so `form` and
`offsetW` never reached the market and all eight solids priced
identically. It now reads the plane the section is cut on, where along it
the cut sits, and which body is being cut, from a table measured off the
engine's own distance functions. Eight distinct prices at the same cut,
where there used to be one.
→ `tools/verify-curve.mjs` · *"the curve is the solid"*,
  `test/Pool.t.sol` · `test_theCurveIsTheSolid`, `src/lib/Curve.sol`

**133. The market prices the plane a viewer is looking at.**
Concentration was a sum of angle distances, which is not a function of the
cut. Half a turn about each w-plane returns the cut plane exactly where it
started, so a holder could sit their market at two thirds of maximum while
the token rendered untouched — and at the mirror plane, at maximum. The
number is a function of u = R·e_w now, so the same cut always prices the
same and the picture and the market cannot disagree.
→ `tools/verify-curve.mjs` · *"the market is a function of the cut plane,
  not of the angles"*, `src/lib/Curve.sol` · `cutDirection`

**134. An untouched token is plain constant product, on every solid.**
The reference is rest rather than the widest slice, and that is a measured
decision rather than an aesthetic one: a tesseract cut square across an
axis gives the SMALLEST slice it has, so pricing thinness directly would
open every freshly minted tesseract at maximum concentration. Rest is the
narrowest cut for the Tesseract, the widest for three others, and between
for the rest.
→ `tools/verify-curve.mjs` · *"an untouched token is plain constant
  product"*, `src/lib/Curve.sol` · `SLICE`

**135. The contract prices the plane the engine draws.**
The closed form for u is derived from the engine's rotation composition
and checked against it to 1e-6 on every run. If the two ever drift, the
market prices a plane nobody is looking at, and nothing else in the suite
would notice.
→ `tools/verify-curve.mjs` · *"the direction is the one the engine draws
  with"*

**136. Speech crosses; nothing else does.**
The port carries the commons and has no function that federates a group or
a pair — a group carries a steward, which is an authority, and a pair is
derived from two ids that under the partition live on different chains, so
a federated pair room would mean different things in different places. It
cannot write into Parley at all: what arrives is emitted under the port's
own event, tagged with its origin.
→ `tools/verify-port.mjs` · *"only the commons crosses"*, `src/ParleyPort.sol`

**137. The local commons never depends on the bridge.**
`Parley.speak` is untouched, free and local, and works on a chain where the
port was never deployed, never funded, or has stopped answering.
Federation is a separate payable call. A social layer that needs a message
to arrive before anyone can talk has a single point of silence.
→ `tools/verify-port.mjs` · *"the local commons never needed any of this"*

**138. Nobody can re-point the port's security, and what floats is named.**
LayerZero lets an OApp choose which DVNs must attest and lets a delegate
change that later, which is an admin key. The port calls
`setDelegate(address(0))` at construction and carries no function that
could set it — or `setConfig`, or either library — again. An earlier
version of this entry claimed the verifier set itself was therefore
frozen, and that was wrong: an OApp that pins nothing runs on the
endpoint's DEFAULT libraries and DVN set, which LayerZero Labs can roll
forward without the port's consent. So the pin is now a constructor
argument — lane libraries and raw `SetConfigParam` entries, applied once
by the OApp itself (the one caller the endpoint authorizes with no
delegate) and never writable again — and a deployment that passes empty
arrays floats on the defaults as a stated choice. Admissible for speech;
the contract's header says why it would not be for custody.
→ `tools/verify-port.mjs` · *"the verifier set is frozen in the
  constructor"*, *"the pin: config written once, from the constructor,
  or never"*

**139. A block number from another chain is not a block number here.**
Parley's walk works because each message carries the block of the previous
one, so a client steps back with single-block `eth_getLogs`. That pointer
is meaningless across a border, so the sender's is dropped on arrival and
the port writes its own in the receiving chain's numbering.
→ `tools/verify-port.mjs` · *"the back-link is rewritten into this chain's
  numbering"*

**140. The harness refuses an argument it would otherwise encode as empty.**
`bytes` means a hex string to the test encoder, and a Buffer was being
stringified to its own text and re-read as hex — which for ordinary words
parses to nothing and encodes an EMPTY argument. The contract then
reverted for a reason unrelated to the test, and the test looked like it
had found a bug. It throws now.
→ `tools/evm.mjs` · `enc`

**141. The port speaks the protocol's ABI, not its mock's.**
EndpointV2 delivers with `Origin calldata` — a static three-word tuple,
and the tuple is part of the canonical signature, so
`lzReceive((uint32,bytes32,uint64),bytes32,bytes,address,bytes)` is
`0x13137d65` and nothing else dispatches. For one stretch the port
declared `bytes calldata origin` instead: a signature invented by its own
mock, matched by nothing on any chain. Every assertion stayed green
because every assertion drove that mock — a suite that shares a dialect
with its subject cannot hear the accent. The probe measured it at the
deployed bytecode (three protocol selectors, three `revert 0x`, no
dispatch), the port now carries the canonical signatures plus the two
questions the protocol asks before the first packet on a lane —
`allowInitializePath` answering the peer table, `nextNonce` answering
zero — and the mock endpoint now performs the real handshake and builds
its delivery with `abi.encodeCall`, so the selector is the compiler's,
not the file's.
→ `tools/verify-port.mjs` · *"the port speaks the protocol's ABI, not
  its mock's"*, `tools/probe-port-abi.mjs`

**142. Empty options mean the default, never nothing-at-all.**
The real send library refuses options that name no lzReceive gas — an
empty `bytes` fails at QUOTE time. So the port treats empty as "use the
default": a 22-byte type-3 blob naming 200,000 gas, written out
byte-for-byte in the source. The mock refuses empty options the way
ULN302 does, so the suite's own quotes prove the default reached the
wire. If a destination's gas schedule ever outgrows the constant,
delivery is permissionless — anyone re-executes the verified message
with more.
→ `tools/verify-port.mjs` · *"empty options became the default, because
  the wire refuses nothing-at-all"*

**143. A lane refuses on both sides of the border.**
The endpoint consults `allowInitializePath` before the first packet on a
lane can be verified, and the port's `lzReceive` makes the identical peer
check itself — for the endpoint that forgot to ask. A message whose body
claims a different origin than its DVN-attested envelope is refused
rather than believed on either count.
→ `tools/verify-port.mjs` · *"a peer nobody named cannot be heard — on
  either side of the border"*

**144. The console refuses the wrong chain before the slab exists.**
A wallet answering from another chain is named in the crest the moment it
answers, offered the one move that fixes it, and refused a confirm slab —
a slab built for the wrong chain is a trap with a countdown. A provider
that cannot say its chain leaves the wallet's own guard in charge:
unknown is not wrong.
→ `tools/verify-console.mjs` · *"a control on the wrong chain raises no
  slab"*, *"the crest names the wrong chain and offers the move"*

**145. The mint sends the price it read, or refuses to guess.**
The slab used to claim the wallet would read the price — a thing no
injected wallet does — and sent zero value at a payable function. The
lane reads `price()` through a selector the contract derived, states it
before the button, attaches it to the send, and a price that does not
answer renders "not reported" and refuses the propose outright.
→ `tools/verify-console.mjs` · *"the mint will not propose a payable
  value it could not read"*

**146. The slab names the destination, and follows the hash.**
Every slab carries To, Value and Function beside the lane's sentences,
and after the press the ticker reads the receipt back one hash at a
time: mined in block N, reverted in block N, still not mined, not mined
after three minutes. "Sent · 0x…" is a beginning now, not the whole
story.
→ `tools/verify-console.mjs` · *"the slab names where the transaction
  goes and what it calls"*

**147. The door map has one rendering, and the data is derived from it.**
Three hand-written copies of the door list had already drifted — the
tesseract, the nav, the terminal's `go` table. The tesseract is deleted
(the ruling CONSOLE.md had already made), the list is server-rendered
once, and `window.DOORS` is derived from those anchors in the document:
the copy a program enumerates cannot drift from the copy a person read,
because neither is a copy.
→ `tools/verify-site.mjs` · *"the doors exist as data derived from the
  page itself"*, *"the tesseract is gone, and nothing else answers to
  its name"*

**148. The manifest teaches the powers the lease grants.**
`ipseity.services/1` sold the rent and described the renter's powers in
prose while serving no way to use them. /2 carries `rent.use` — `commit`
and `setTrait`, selectors derived on chain, addressed to the hub — so an
agent that rents through the manifest can act through it too. Every /1
key survives; a /1 reader reads /2 and learns less.
→ `tools/verify-site.mjs` · *"rent teaches the powers it grants —
  commit and setTrait, on the hub"*

**149. The session surface is discoverable, and the key has its own door.**
The one integration designed for programs — grant, act, check, revoke —
is a service in every token's manifest, and `/k/<id>/<key>` serves the
granted key's envelope with the rule stated in place: check before act,
because a refusal read from a view costs nothing. The allowlists are
stated as non-enumerable rather than pretended at; the id is in the path
because a bare key cannot find its granting account without an indexer.
→ `tools/verify-site.mjs` · *"the session surface is discoverable:
  grant, act, check, revoke, and its door"*, *"/k — the one surface
  where the actor is not the holder"*

## Found by adversarial review, and fixed

Five adversary lenses — an MEV searcher, a DeFi economist, a griefer, a rogue
session-key holder, and a malicious token contract — were asked to attack this
collection. They returned nineteen sharpened strategies. `tools/verify-findings.mjs`
tries to make each one actually happen against the real compiled contracts; six
reproduced, and all six are below with the fix. **A strategy is a claim, not a
finding, and the file records the refutations too** — a panel that is never wrong
is a panel nobody checked. (Two of the eight reproduced claims were disproved by
that same file, and the reproduction suite now runs on every `npm run check` so
none of them can come back.)

**51. A guarded token cannot escape the seal by setting bit 255.**
The snapshot used to pack a "was this measured" flag into bit 255 of the balance,
on the reasoning that balances cannot reach 2^255. That was an assumption about
someone else's contract. A token returning `balance | (1 << 255)` made the
post-call comparison unconditionally false and walked 1,000 tokens out of a live
seal. The flag lives in its own array now; no bit of the balance is borrowed.
→ `tools/verify-findings.mjs` · *claim 4*

**52. A sealed account will not call an asset it cannot see.**
An asset unreadable at snapshot time is skipped by the check — correctly, since
there is no number to compare against. The hole was that the skipped asset could
be the *target* of the call, which emptied it and restored its readability on the
way out. The identical call was refused while the asset was readable and went
through while it was not. Now a sealed call aimed at an unmeasurable manifest
asset reverts `BlindTarget`.
→ `tools/verify-findings.mjs` · *claim 5*

**53. A session key has a ceiling, like every other promise here.**
`grantSession` accepted `2^64-1`. The seal caps at a year and the bond caps at a
year; this was the one time-promise in the collection without a ceiling.
`MAX_SESSION = 365 days`.
→ `tools/verify-findings.mjs` · *claim 3*

**54. No session acts while the account owns its own token.**
`onlySigner` checked for an ownership cycle and `executeAsSession` did not. Moving
a token into its own Reach made every holder path revert `OwnershipCycle` forever
while an already-granted session kept full spending power that **no address could
revoke** — there was none left that `onlySigner` would accept. The cycle is checked
on the session path too, and `onERC721Received` refuses the token at the door. In
that state assets are stuck, which is bad; they are not stealable, which is the
part that matters.
→ `tools/verify-findings.mjs` · *claim 3*

**55. A clone costs what it consumes.**
`cloneWithKernel` reached `_issue` without payment, and every child was born with
an active kernel — so every child was immediately a parent. One paid token could
be drawn from without limit until `MAX_SUPPLY` was gone; the review pulled eight
free tokens out of one mint and the loop had no natural end. The old reasoning —
"a clone is drawn from a token that was already paid for" — is true of the kernel
and false of the supply. It is `payable` and costs a mint.
→ `tools/verify-findings.mjs` · *claim 2*

**56. A bond freezes the curve through every door, including deposit.**
`syncCurve`, whose entire job is to move the anchored offsets, is gated by
`_unbonded`. `deposit` is deliberately not — deposits are additive to the promise.
But `deposit` called `_reanchor`, so a bonded market's curve could be re-shaped
through the one entry point left open while the function built for the purpose was
refused. `_reanchor` is now a no-op under a live bond: deposits still land, the
curve does not follow them.
→ `tools/verify-findings.mjs` · *claim 1*

**57b. Revocation clears the authority, not just the record.**
`revokeSession` used to be `delete sessionOf[key]`, which cannot reach a
mapping — so `sessionTarget` and `sessionSelector` survived, and re-granting
that key resurrected **every permission it had ever held**. Grant `[poolA]`,
revoke, re-grant `[poolB]`, and it could still reach poolA. Both grant and
revoke now bump a per-key epoch, which retires the old entries in constant gas.
→ `tools/verify-findings.mjs` · *claim 7*

**58. A sealed account will not say an unknown word to an asset it promised.**
The approval defence was a six-selector enumeration — the exact shape this
file's own argument says cannot be completed — and Permit2's
`approve(address,address,uint160,uint48)` walked through it with identical
standing custody. The polarity is inverted at the one boundary where it can be:
while sealed, a call to a **manifest** asset must carry `transfer` or
`transferFrom` and nothing else. Approvals in every shape, permits in every
shape, and words nobody has invented yet are all refused by the same rule
without naming any of them. Calls to anything **not** promised are unrestricted.

The cost is real and is the point of the word *default*: a holder who wants to
`claim()` on a promised asset while sealed cannot. They unguard it first, or
do not promise it.
→ `tools/verify-findings.mjs` · *claim 10* · `tools/verify-vault.mjs` · *"an unlisted word said to a promised asset"*

**59. A guarded NFT is measured by identity, not by count.**
`balanceOf` is the same *word* for ERC-20 and ERC-721 and not the same *fact*:
for a token it is an amount, for an NFT it is a count. A sealed vault could
swap a valuable NFT for a worthless one through a venue — one out, one in,
count unmoved. `guardNFT(collection, tokenId)` names a piece and `ownerOf`
answers exactly. The suite proves *which* mechanism catches it: a control vault
guarding only the collection swaps freely, and one guarding the piece cannot.
→ `tools/verify-findings.mjs` · *claim 8*

**60. A blind asset can be released; a visible one cannot.**
Refusing any call that ends with a manifest asset unreadable is correct, and it
was a door a manifest asset could shut on the account at will — a token whose
`balanceOf` reverts on its own condition made **every** sealed call revert, and
a reverted call never persists, so the trap re-armed itself for the seal's full
length. An asset the account cannot currently read may now be unguarded even
while sealed. That gives nothing away: the seal was already unable to promise
about an asset it cannot measure, and `unmeasurable()` had been saying so
publicly the whole time.
→ `tools/verify-findings.mjs` · *claim 11* · `tools/verify-vault.mjs` · *"a blind asset can be let go of"*

**61. An attestation expires, and can be retired.**
The digest carried no nonce and no deadline, so one signature authenticated the
same statement to everyone forever with no way to take it back short of the
seal lapsing. Both are in the signed struct now, and `retireAttestations()`
invalidates every signature the account has ever given in one call.
→ `tools/verify-findings.mjs` · *claim 12* · `tools/verify-vault.mjs` · *"and it can take it back"*

**62. The deposit cap bounds the side being deposited into.**
`swap` never consults `maxDeposit` — it guards only `MAX_RESERVE` — so ordinary
trading can push a reserve above the cap. `deposit` then re-checked **both**
sides, so a one-wei quote-only top-up was refused on account of a base reserve
it had not touched, and under a live bond the holder was left with no operable
function at all. Each side is now capped only when something is added to it.
→ `tools/verify-findings.mjs` · *claim 13*

**57. A crowd cannot break what a caller cannot.**
`tools/agents.mjs` runs seven agents with conflicting motives — holder,
arbitrageur, whale, shrimp, sandwicher, griefer, ERC-4907 renter — against the real
contracts for hundreds of blocks in shuffled turn order. Between every action it
re-checks: conservation of every ERC-20 over every address, the invariant across
each trade, the payout cap, the bond (by *trying every exit*, not by watching
reserves), the seal (by attempting every drain shape), and the Grip (by calling
every function anyone could imagine).
→ `tools/agents.mjs`

---

**63. Two markets on one token never claim more than the pool holds.**
The pool keeps every market's reserves at a single address and tracks each
market's entitlement per id. Nothing in the contract ties the sum of those
entitlements to what it actually holds, and no suite had ever opened two
markets on one token — so nothing had ever looked. `tools/agents.mjs` now runs
two live markets sharing a balance and re-checks the sum after every action.

Deliberately a monitor and not a guard: a running total on the swap path is gas
on the hot path for a number any observer can compute. The real defence against
a token whose balance moves out of band is `bless`, which is a centralisation
trade-off stated rather than hidden.
→ `tools/agents.mjs` · *"two markets never claim more than the pool holds"*

**64. Two allowlists are a cross-product, and that is written down.**
`targets` and `selectors` are checked independently, so a key granted
`[venueA, venueB] × [deposit, withdraw]` may withdraw from A even if the intent
was "deposit to A, withdraw from B". Explicit pairs would be up to 256 SSTOREs
in one grant — roughly five million gas — to express something a holder can
already express exactly: **one key per pair**. Pinned by a test rather than left
to be discovered, because an undocumented decision is a surprise with a
rationale attached.
→ `tools/verify-vault.mjs` · *"two allowlists are a cross-product, and this is what that means"*

**65. `market()` names the output caps as output caps.**
The last two size fields were `maxBaseIn`/`maxQuoteIn` and had always been
`rBase * MAX_OUT_BPS / BPS` — the guard in `swap` bounds what *leaves*, never
what arrives. A front end taking them as "the most you may send" would build
trades the contract refuses for an unrelated reason, which is exactly what the
artwork was doing: it compared the input against the *near* side's cap when the
constraint is on the *far* side's output. Both renamed and both corrected; the
instrument now checks the quote against the outgoing reserve.
→ `tools/verify-pool.mjs`, `engine/ipseity.html` · the Market instrument

**66. Every read fits inside the cap the network will actually run.**
`eth_call` is executed by a node for free, so every node caps it — geth, erigon
and reth at 50M by default, nethermind at 100M, hosted providers lower and
without saying so. A view function past that ceiling does not fail politely; the
node answers "out of gas", which a marketplace cannot distinguish from a broken
token. `tokenURIs()` was over it, at 55.19M, and had been since the quartet face
was added: the ERC-7160 call that returns every face was not callable on a
correctly configured node, and nothing said so because nothing had measured it.
The ceiling is now asserted rather than assumed, and the build fails on the
commit that crosses it rather than on the wallet that hits it.
→ `tools/gas.mjs`

**67. The rotation is orthonormal, so the solid does not resize as it turns.**
Six Givens rotations carry every vertex, and if `sin²+cos²` drifts from one the
composition is no longer a rotation — the projected solid grows or shrinks with
its own orientation, which is not a thing a viewer can attribute to anything.
The series had four Taylor terms and drifted about 7 parts per million; it has
six and drifts 7 parts per billion, which is below the truncation of the SVG
coordinates it feeds. The property is checked at fixed points and fuzzed across
a hundred turns of the circle.
→ `test/Ipseity.t.sol` · `test_trig`, `testFuzz_pythagorean`, via `tools/forge.mjs`

**68. Nothing a stranger chose can become markup on a page.**
A market's pair is two ERC-20 addresses the holder picked, and `symbol()` on
them returns a string that holder wrote. It matters more here than on an
ordinary site: `/token/<id>/live` serves the instrument on this same origin,
which is the entire reason that route exists, so a script surviving into a
market page is script execution beside a connected wallet. The escaper is a
whitelist — printable ASCII passes, the five HTML metacharacters become
entities, everything else is dropped — and the suite deploys a token whose
symbol is a script tag and asserts it arrives inert on the page, in the
directory, and inside the JSON.
→ `tools/verify-site.mjs` · `test/mocks/Nasty.sol` · ScriptToken

**69. One hostile ERC-20 cannot take a page down, or twenty-three others with
it.** Eight ways to answer badly are put into real markets: reverting,
answering in `bytes32`, answering with eight kilobytes, declaring a length
longer than the payload, claiming 200 decimals, burning every drop of gas —
and two that hand back an ABI offset pointing megabytes past the buffer. That
last one is the one that got through. Dereferencing an attacker-chosen offset
before validating it costs 2,151M gas of memory expansion, charged in the
page's own frame after the staticcall has returned, so the gas stipend on the
call protects nothing; it killed every page listing that market and the whole
24-token directory window containing it. The assertion is a gas bound rather
than a status code, because at a three-billion-gas ceiling the page still
"succeeds".
→ `tools/verify-site.mjs` · OffsetBombToken

**70. A lease agent may set the ERC-4907 user and nothing else.**
The obvious way to let a rental market lend a token is an ERC-721 approval,
and an approval carries `transferFrom` with it. `leaseAgentOf` is the narrow
power under its own name: per-token, holder-set, cleared on transfer, and
settable only by the owner rather than by an approvee — a permission granted
under a revocable approval must not outlive it. A contract that genuinely
holds the power tries to transfer, approve, lock, call `setUser` directly and
name itself agent elsewhere; all five fail.
→ `tools/verify-site.mjs` · `test/Lease.t.sol` · `test/mocks/Nasty.sol` · RogueAgent

**71. Rent belongs to the token, and a lease cut short refunds the rest.**
Fees land in a market's reserves so that selling the NFT sells the exchange;
rent accrues the same way, so selling mid-term sells the unpaid rent with it
and the buyer collects. A transfer clears the ERC-4907 user — correct, and
harmless while renting was free — so rent is escrowed and vests: whole if the
term runs out, by elapsed time if it does not. Whether it was broken is read
off the token rather than declared, from the expiry the token still carries.
Reading it from `userOf` instead was wrong in a way that only showed up late:
after expiry that returns zero for an intact lease and a broken one alike, so
a lease broken on day one vested in full to the holder the moment the term
passed, and the renter's claim on nine undelivered days expired with it.
→ `test/Lease.t.sol` · `tools/verify-site.mjs`

**72. The holder is credited for time the contract watched pass.**
Following from 71: the contract can see that a lease broke but not when,
because it has no hook on transfers. So elapsed time is measured to the last
block in which the lease was observed intact, not to the block someone got
round to settling. `settle` is free and anyone may call it, `endLease` does it
properly in one transaction, and the bias points the only way it can — the
party who can end a lease is the party who has to say so to be paid for it.
→ `test/Lease.t.sol` · `test_aHolderWhoNeverSettlesIsCreditedOnlyToTheLastLook`

**73. Every route the site serves fits inside every cap, and there is one URL
per resource.** The counter page cost 21M gas of `eth_call` while every other
page cost 0.2M, to embed a preview a visitor cannot use — a `data:` document
gets an opaque origin and no wallet injects into one. The still is its own
request now and the page is 0.16M. Separately: a leaf that ignored trailing
segments and a parser that accepted leading zeros meant one document was
reachable at unboundedly many cacheable URLs, which is a gateway cache waiting
to be filled with copies of one page.
→ `tools/gas.mjs` · `tools/verify-site.mjs`

**74. `resolveMode()` returns "5219", or none of the above is reachable.**
ERC-6860 resolves a contract's mode by calling it and treating a revert as
*auto* — in which `web3://<addr>/` is an empty call to a contract with no
fallback and `/token/1` is a call to a method named `token`. Both revert.
Without these four bytes the site is reachable only from a gateway that
hard-codes ERC-5219 for the address, which is a server, which is the thing
this contract exists not to need. It fails silently and only in a conformant
client, which is why nothing but a spec reading found it.
→ `tools/verify-site.mjs`

**75. The client is run, not only rendered.**
The application is contract code, so a mistake in it is permanent, and it is
invisible to every assertion about what a page contains: the bytes can be
right, the selectors can be right, the JavaScript can parse, and the card can
still be dead. So the emitted scripts are executed against a DOM shim and a
provider wired to the same in-process EVM, and driven — type an amount, check
the quote against `Pool.quote` at that block, press approve, press swap, and
assert the trader's balance moved by what the card promised. The first run
found `paint()` writing to an element the markup did not contain, which in a
browser throws before any listener is attached and kills the whole card while
the page around it renders perfectly.
→ `tools/verify-site.mjs` · driving the swap card, the holder's side, the
  rental counter

**76. No float touches an amount, in either direction.**
Decimal text is parsed to a BigInt of base units and formatted back the same
way. Multiplying a token balance by `1e18` in a double loses the last three
digits of an eighteen-decimal balance, and the number a person is then asked
to sign is not the number they read. Checked by typing `1.5` into the add-
liquidity field and asserting exactly 1500000000000000000 base units arrived
at the pool.
→ `tools/verify-site.mjs` · driving the holder's side

**77. Everything the picker offers can be traded.**
A token dropdown fetched from a hosted list offers tokens whose presence says
nothing about whether a market exists — the list and the pool are two sources
of truth and they disagree by construction. Here there is one: the pool
enumerates the ids with an open market, the picker renders that, and `/assets`
derives the token list from what those markets actually hold. The suite opens
a market, checks every option the picker offers is open according to the pool,
then closes one and checks it disappears from both the count and the
directory.
→ `tools/verify-site.mjs` · the market picker

**78. The directory finds a market wherever it is.**
It used to walk token ids, so a collection with markets only on high ids
showed an empty first page and a reader concluded there were none — a hundred
and twenty pages of nothing before the first entry. `Pool` keeps an
enumerable set now, maintained in `openMarket` and `closeMarket`, which are
the only two places membership changes. The suite opens a market on a token
far past the first window and asserts it appears on page one.
→ `src/Pool.sol` · `openCount` / `openIds` · `tools/verify-site.mjs`

---

## Known and not fixed

These are true, they are not tested, and they are not defended against. They are
here because an undocumented limitation is worse than a documented one.

**A0. A Grip is permanent, and permanence is not a feature that can be
walked back.**
An asset sent to a Grip is there until the token stops existing, which in
this collection is never — there is no burn. A mistaken transfer into a Grip
is a permanent mistake. The interface says so before it will build the
calldata, and that is all any interface can do. This is the correct trade for
holdings a token carries as part of what it *is*, and the wrong trade for
anything that has to stay liquid — which is why market inventory lives in
`Pool.sol` behind a time-boxed bond and working capital lives in the Reach.

**A00. An asset can stop answering, and the account says so rather than
guessing.**
`balanceOf` is read by staticcall, and "answered zero" and "did not answer"
are different facts. Collapsing them was a silent hole: a token whose proxy
breaks reads as zero before and after a call, so `now < pre` is false and the
seal quietly stops promising anything about it. `unmeasurable()` names every
manifest asset the account currently cannot read, and a buyer reads it beside
`holdings()`.

Refusing every sealed call instead would be the opposite failure — the one
that bricks Dave's ragequit, where a third party who gets one asset onto the
list freezes the whole account for the length of the seal. Only the holder can
`guard` here, so nobody else can aim it, but a token can break on its own and
a promise contingent on every listed token staying healthy for a year is not a
promise. So the account measures what it can and discloses what it cannot.

The one case it does refuse: an asset readable *before* a call and not after.
That is a state change the seal cannot attest to, and it reverts.
→ `tools/verify-vault.mjs` · *"an asset that stops answering"*, *"going blind during a call"*

**A. The seal covers the manifest, and nothing else.**
*(This was previously "the vault can be emptied between a handshake and a
settlement", with no fix. It is fixed: the collection ships its own ERC-6551
implementation — see `src/IpseityAccount.sol` — so the vault can be sealed the
same way a market can be bonded. What follows is what remains.)*

Only assets on the manifest are measured. An asset that arrives after the seal,
in a contract nobody listed, can leave freely. The manifest is additive and
public for exactly that reason: a buyer reads `manifest()` and `holdings()`,
they do not assume. The cap is sixteen entries, because every entry is two
balance reads on every sealed call.

**A1. The manifest is removable while unsealed, and frozen while sealed.**
`guard` was append-only forever on the reasoning that an un-promisable asset
makes the manifest emptiable instead of the vault. That is right *while the
seal holds* and wrong outside it — an unsealed account promises nothing, so
removing an entry takes nothing from anybody. Append-only had a cost nobody
was paying for: sixteen slots, no removal, and the manifest travels with the
token, so a holder who filled it left every future owner unable to re-point it.
`unguard` reverts for everyone while `isSealed()`.
→ `tools/verify-vault.mjs` · *"the manifest is no longer append-only forever"*

**A2. The seal cannot promise about a lying token.**
`_balance` reads `balanceOf(address)` from the asset itself. A token contract
that misreports its own balances defeats the measurement, as it defeats every
other accounting built on it. Seal assets you would hold anyway.

**B. A holder can re-shape an unbonded curve against a pending trade.**
Where the art and the price are the same numbers, this is not preventable. It is
bounded instead: every swap carries a trader-set `minOut`, checked after the
fact. A trader who sets it is unharmed. A bond removes the possibility entirely
for as long as it holds.

**B2. A session key is a hot key.**
Its bounds hold if it is stolen — that is the entire design — but everything
inside those bounds is gone. `spendCap` and `expires` should be numbers you
would be willing to lose outright, and targets should be granted one at a
time. The collection makes theft survivable; it does not make it free.

**B3. Re-sealing a kernel does not make the seller forget.**
ERC-7857's re-encryption gives the buyer the secret. Nothing on any chain
takes it back from whoever held it first, and no oracle changes that. A kernel
is worth buying when its value is *use going forward*, and worth nothing when
its value is *exclusivity*. This is a limitation of the standard rather than
of this implementation.

**B4. There is no verifier, so no kernel has ever been proved.**
`verifier` is zero as this collection deploys, `hasVerifier()` says so, and
`kernelProved()` is false for every token. A buyer must fetch the payload,
hash it, compare against `dataHashesOf` and decrypt it themselves before
paying. The contract makes that possible and does not make it unnecessary. A
stub verifier was not shipped because a green check nobody earned is worse
than no check at all — and because the verifier can only be chosen once, a
stub would have been permanent.

**B5. A kernel names its payload by hash and does not store it.**
The hashes are permanent; whatever they hash to is not. If the payload
disappears, the token still states what it committed to and can no longer
demonstrate what that was. Pin it.

**B6. A holder can end a lease at will, and a lazy one loses income.**
`setUser` stays the holder's, so any lease can be ended at any moment — the
contract makes that cost them the unelapsed rent rather than preventing it,
which is the most it can do without taking the token hostage on the renter's
behalf. A renter who needs certainty for the full term should rent a token
that is bound under ERC-5192, which cannot be sold at all.

The mirror of that: because breakage can be seen but not timed, a holder who
breaks a lease and never settles is credited only to the last block anyone
observed it running. For a long term with no interactions that can be most of
the rent. `endLease` exists so the correct action is one transaction, and the
rent page says so, but nothing forces it.

**C. Nothing here has been audited.**
`Pool.sol` holds other people's money and has never been reviewed by anyone. The
per-market deposit cap exists for that reason and should be raised only after a
review.

**D. `forge test` itself has still never been executed.**
Foundry's installer host is unreachable from the environment this was built in,
and so are GitHub, codeload and the crates.io API, so there is no route to it
from here.

The 73 Solidity tests are no longer only type-checked, though. `tools/forge.mjs`
runs them: a cheatcode precompile at the address `forge-std` points `vm` at, a
`beforeMessage` hook so `prank` can rewrite the caller of the next call, an
`afterMessage` hook so `expectRevert` can turn a revert into a success at the
call boundary, and an unfrozen block header so `warp` can move the clock inside
a call already executing. All 73 pass.

Three of them did not, the first time they ran, and one was a real defect:
`Trig.sin(pi/2)` read 1.000003543 against a test asserting 1e9 ± 200 — four
Taylor terms where the projection needed six, drifting the sin²+cos² identity
by about 7 ppm. A rotation that is not orthonormal resizes the solid as it
turns. Nothing said so, because the file had never been executed.

Neither had the runner, in a sense worth recording. Its first version reported
72 passing tests while running no EVM code at all: funding the test contract
with a fresh `Account` erased its `codeHash`, so every call landed on an empty
account and returned success having executed nothing. A negative control — an
assertion written to fail — is what caught it. The runner now refuses to report
on the suite at all unless a probe whose entire runtime is a `REVERT` is seen to
revert *having burned gas*, since an empty account also does not revert and only
the gas counter separates the two, and unless every state-writing cheatcode is
confirmed by reading the state back.

What is still missing relative to Foundry is stateful/invariant campaigns, a
coverage-guided corpus, traces on failure, and every cheatcode the suite does
not use — so this is a smaller net, not a replacement. Run the Foundry suite
before deploying anywhere real.
