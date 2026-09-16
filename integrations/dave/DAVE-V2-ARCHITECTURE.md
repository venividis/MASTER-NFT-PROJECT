# DAVE V2 — Audit findings and upgrade architecture

Reviewed: `DaveHeld.sol`, `DaveVault.sol`, `BagRenderer.sol`, `SiteKernel.sol`,
`ConvictionPool.sol`, `Codex.sol`, `floor.html`.

---

## PART 1 — Findings in v1.8

Ordered by severity. The first three are exploitable today and must be fixed
**before genesis**, because of C0.

### C0 — There is no upgrade path for the vault. (structural)

An ERC-6551 account address is `CREATE2(registry, keccak(salt, chainId,
tokenContract, tokenId), proxyInitcode(implementation))`. The implementation
address is an input to the address derivation. Change the implementation and
every vault address changes — which means every vault's balance, every bond,
every stall, every open position, stays at the old address under the old code.

**There is no proxy admin. There is no migration. The vault you deploy at
genesis is the vault, forever.** Every finding below has exactly one window in
which it can be fixed, and that window closes when the first token mints.

---

### C1 — A single bag can permanently brick ragequit. (critical)

`DaveVault.ragequit()`:

```solidity
for (uint256 i; i < n; ++i) {
    uint256 bal = IERC20(t).balanceOf(address(this));   // can revert
    ...
    require(IERC20(t).transfer(pool_, toPool), "pool");  // can revert
```

Ragequit is the **only** exit from a seal that has not expired. It walks every
bag and hard-requires each transfer. Any bag that reverts on `transfer` or
`balanceOf` reverts the whole function, forever:

- a token that pauses (very common — most stablecoins can pause)
- a token that blacklists the vault address (USDC, USDT: routine)
- a token whose logic sits behind an upgradeable proxy that later reverts
- a token that self-destructed its implementation
- a token that returns nothing and reverts on the `require` return-decode

**Attack:** an attacker sends a Dave 1 wei of a token they control, calls
`acknowledge` (permissionless), then flips their token to revert on
`transfer`. That Dave's bearer can never ragequit again. An OBSIDIAN seal is
1,460 days. The cost of the attack is dust and one transaction.

This is worse than a lost exit — it converts the covenant's *voluntary* penalty
into a *third party's* permanent lock. Invariant 2 ("sealed bags leave a vault
only via ragequit tax math") holds vacuously if ragequit cannot be called.

**Fix (V2):** try-transfers. A bag that refuses is marked delinquent, its toll
recorded as a debt against that token, and the exit completes. The tax is owed,
not waived — `settleDelinquent()` collects it the day the token behaves. The
room is made whole; the bearer is never held hostage.

---

### C2 — The bag roster can be filled by a stranger, permanently. (critical)

```solidity
function deposit(address t, uint256 amount) external { ... _ack(t); }
function acknowledge(address t) external { _ack(t); _poke(); }
```

Both are permissionless. `_ack` pushes to `_bags` when `balanceOf > 0` and
`_bags.length < 32`. **There is no removal function anywhere in the contract.**

**Attack:** deploy 32 worthless ERC-20s, send 1 wei of each to a target vault,
call `acknowledge` 32 times. Total cost: a few dollars. That Dave can now
never index another bag — `_ack` reverts `TooManyBags` for the real asset the
bearer wanted to seal. The renderer shows 32 junk rows. Every ragequit walks
32 useless iterations. It is unfixable because the array only grows.

Combined with C1 this is worse: fill 31 slots with junk, make the 32nd revert.

**Fix (V2):** three defences.
- `forget(address)` prunes any bag at zero balance. Permissionless is safe —
  a bag holding nothing cannot be stolen by being de-indexed.
- A dust floor set by the bearer, below which strangers cannot seat a bag.
- A seat reserve: past 16 of 32 bags, only the bearer may seat another.

---

### C3 — Every ERC-1155 batch transfer into a vault reverts. (high)

`DaveVault` implements `onERC1155Received` but **not**
`onERC1155BatchReceived`. `safeBatchTransferFrom` requires the latter and
reverts otherwise. A Dave cannot be handed a set of 1155 items in one act —
including from any game, any bundler, any 1155 marketplace fill.

`supportsInterface` also advertises neither `0x150b7a02` (721 receiver) nor
`0x4e2312e0` (1155 receiver), so cautious senders will refuse it, and omits
`0x51945447` (`IERC6551Executable`) despite implementing `execute` — 6551
tooling checks that ID to decide whether the account can act at all.

---

### M1 — No reentrancy guard on `ragequit` or `execute`. (medium)

Both make external calls into arbitrary token code. `ragequit` transfers to the
pool and treasury mid-loop while `_bags` and `paperHands` are still mutable.
A reentrant ERC-777/callback token re-entering `ragequit` before
`paperHands += 1` and `unlockAt = 0` land could double-toll or double-stamp.
The Chambers holds its own lock; the vault holds none.

### M2 — ERC-1271 is absent, so the vault has no voice. (medium, design)

No `isValidSignature`. Consequences: a Dave's vault cannot list its own NFTs on
Seaport, cannot sign an off-chain order for any of the twenty-one desks, cannot
authenticate to its own premises. For a project whose thesis is that the NFT is
an *actor*, this is the missing half.

The reason it's absent is presumably that it's dangerous — and it is. A sealed
vault with an open `isValidSignature` can sign a Seaport order transferring its
bags, which is an unmeasured exit the covenant never sees. See V2's resolution
below; the answer is domain separation, not omission.

### M3 — Royalties bypass the covenant. (medium, doctrine)

```solidity
return (treasury, salePrice * 500 / 10_000);   // 5%
```

Every other toll in twenty-one codicils splits 69 to the ConvictionPool / 31 to
the treasury. The royalty on the Dave itself is the one flow that pays the
house alone. Nothing technical requires this; ERC-2981 returns one address and
that address can be a splitter.

### M4 — `royaltyInfo` doesn't check existence; `_bagRow` caps display at 6
bags while `MAX_BAGS` is 32; `mintTreasury` emits 300 individual `Transfer`
events where ERC-2309 emits one. (low)

---

### C4 — The website is one DNS record. (critical, thesis-level)

`BagRenderer.sol`:

```solidity
string public constant RPC = "https://rpc.mainnet.chain.robinhood.com";
```

and the bootloader:

```js
fetch(R, {...}).then(...).then(function(j){
  ...
  try{(new Function("ID",s))(ID)}catch(e){}
})
```

Three separate problems, each fatal to the claim:

1. **Single point of failure.** One hostname, hardcoded into immutable
   bytecode, for 100,000 websites. Domain lapses, DNS changes, operator
   declines to serve, corporate entity is acquired — every Dave's site is
   blank. The certificate survives; the premises do not. The README's own
   framing ("the seal is bytecode; the face cannot lie") does not extend past
   this string, and this string is the part that renders.

2. **No integrity check.** Bytes arrive over one connection and go straight
   into `new Function`. Whoever controls that endpoint executes arbitrary
   JavaScript in the context of every Dave's `animation_url`, on every
   marketplace, with no detection and no revocation. It is a supply-chain
   attack with one target.

3. **Serial, unbounded assembly.** `SiteKernel.runtime()` concatenates every
   chunk into memory on every call. Memory expansion is quadratic; past a few
   hundred KB the call exceeds the node's `eth_call` gas cap and the site
   simply stops loading — silently, and increasingly, as the site grows.

Meanwhile `floor.html` — the actual designed premises — is a static file with
hardcoded mock data (`const D = {...}`) that never touches a chain.

---

## PART 2 — What V2 adds, and why each standard was chosen

Every addition is justified by a property the covenant already claims but the
code doesn't yet deliver.

### The certificate cannot lie → **ERC-7496 Dynamic Traits**

Dave's traits are continuous functions of time. Conviction accrues every
second. Under ERC-4906 there are exactly two honest options and both are bad:
emit `MetadataUpdate` every block (spam that indexers will rate-limit), or let
displayed values go stale (the face lies).

ERC-7496 dissolves the problem: traits are **read**, not pushed.
`getTraitValue(id, key)` computes from the vault at call time. Nothing to
invalidate, nothing to re-index, and marketplaces can filter and sort on live
conviction without touching `tokenURI` at all.

Then the doctrinal move: **`setTrait` reverts unconditionally, for everyone,
forever — including the timelock.** ERC-7496 requires the function to exist. It
does not require it to work. Every trait is a pure function of covenant state,
so any settable value would be a value that could be false. The revert is the
guarantee, expressed in the only place a guarantee is real.

### Collateral shouldn't require custody → **ERC-7066 + ERC-5192**

The Counter (Codicil XV) pawns a Dave by moving it into escrow. The token
leaves the borrower's wallet: stops displaying, stops appearing in their
profile, stops being theirs in every visible way, and needs a return transfer
on repayment.

A lock is strictly better. `lock(id, locker)` freezes transfer and leaves the
token where it lives. The Dave keeps rendering, keeps its vault, keeps earning
pool weight. `locked(id)` is the ERC-5192 read, so marketplaces grey out the
listing on their own with zero integration work. `transferFromLocked` lets the
lien seize directly on default — no escrow round trip in either direction.

### A sale should be one transaction → **ERC-4494 permit**

EIP-712 signed, deadlined, single-token approval. The nonce is per token and
bumps on every transfer in `_beforeTokenTransfers`, so a seller's signature
dies with the sale. Verified through `SignatureCheckerLib`, so it is ERC-1271
aware: a Dave held inside *another Dave's vault* can be permitted by that
vault's bearer.

### Royalties are a toll → **ERC-2981 → TollBooth**

2981 returns one receiver, so the receiver is a splitter. The booth accrues on
`receive` (deliberately cheap — some marketplaces cap the gas forwarded on a
royalty transfer, and a two-hop forward inside `receive` would revert the sale)
and anyone may `flush` it 69/31.

### The vault needs a voice, and the seal must survive it → **ERC-1271, domain-bounded**

The design problem: an unrestricted `isValidSignature` on a sealed vault is a
hole straight through the covenant. Sign a Seaport order, give the bags away,
and the Chambers' measured boundary never sees a call to measure.

The resolution is **domain separation**, not omission:

- **Unsealed** — plain bearer signature over the raw hash. Full arm: Seaport,
  Permit2, anything.
- **Sealed** — the vault will only validate digests built under *its own*
  EIP-712 domain (`DaveAttestation`, `verifyingContract = this vault`). The
  caller must present the preimage `(purpose, payload)` alongside the inner
  signature; the vault recomputes the digest and checks it matches before
  verifying anything.

Because every marketplace hashes under its own domain separator, **no order
hash can ever be reconstructed inside `DaveAttestation`**. A sealed Dave can
prove who it is — sign into its premises, attest to a statement, prove
conviction to a counterparty — and cannot promise what it holds. The wall is
arithmetic, not a whitelist.

### Batching → **executeBatch**, the vault's half of EIP-5792

One approval and one action are one act, or neither happened.

---

## PART 3 — The premises: a website that is actually on-chain

`Premises.sol` replaces `SiteKernel.sol` and the renderer's bootloader.

### 1. The contract *is* the origin server — ERC-5219 + ERC-4804/6860

```solidity
function request(string[] resource, KeyValue[] params)
    returns (uint16 statusCode, string body, KeyValue[] headers)
```

That is an HTTP handler written in Solidity. Reached through a `web3://` URL:

```
web3://premises.dave.eth:4663/dave/4213
```

routing, status codes, `Content-Type`, and `Cache-Control` are all decided
on-chain. Point an ENS `contenthash` at it and the name resolves natively in
any `web3://`-aware client, with an HTTP gateway as a *fallback* rather than
the foundation. There is no server to fail, and no hostname in the bytecode.

### 2. Verified, not trusted — SHA-256 integrity

Every chunk's hash is taken by the **EVM's SHA-256 precompile at write time**
and stored beside the pointer. The loader re-hashes each chunk with
`crypto.subtle.digest("SHA-256", ...)` — native in every browser, no imported
library — and refuses to execute a byte that doesn't match.

SHA-256 rather than keccak specifically *because* the browser can verify it
natively. The hash function was chosen for the reader, not the writer. This is
Subresource Integrity, on-chain, with the commitment published before the code
is ever served.

### 3. Compressed — DEFLATE in, native inflate out

On-chain bytes are the scarcest resource in the system, and every browser has
shipped a DEFLATE decoder for thirty years. Chunks store `deflate-raw`; the
loader inflates with `DecompressionStream("deflate-raw")`. Text compresses
3–5×, so the same gas budget buys 3–5× the site. Codec is a byte per file, so
a better one lands later without touching the loader.

### 4. Three transports, no single point of failure

The loader tries, in order:

1. `window.ethereum` — an injected provider. **Zero third parties.** When the
   `animation_url` is opened in a wallet browser, the site loads with no
   external network dependency whatsoever.
2. Each configured RPC in turn. `setTransports` **requires at least two** —
   the contract refuses to be configured with a single point of failure.
3. Failing everything: the L0 SVG certificate is already painted and stays.
   Degradation is a floor, not a blank page.

### 5. Chunk-parallel reads

`manifestOf` returns the chunk count and hashes in one call, then N `chunkOf`
calls race concurrently. V1's `runtime()` concatenated everything on-chain into
one return value — quadratic memory expansion, and past a few hundred KB it
silently exceeds the `eth_call` gas cap.

### 6. The website becomes an asset — Codex SITE editions

This is where it stops being a website and starts being part of the covenant.

The Codex (Codicil XIII) already stores immutable bytes as SSTORE2 leaves and
binds them into ordered, kind-tagged editions. FORGE editions are initcode.
RECITE editions are verse. **SITE editions are a website** — and nothing in
the Codex needs to change to allow it except a third `kind`.

So `bindSite(daveId, editionId)` makes a Dave serve its own inscribed premises
instead of the house runtime. That site is immutable once bound, author-Dave
engraved forever, readable by anyone, and — because it lives in the token —
**it transfers with the sale**. Sell the Dave, sell the premises.

The existing doctrine already covers it with no new rules:
- leaves are public material any Dave may bind → sites are forkable by design
- editions are immutable, a new ordering is a new edition → sites version
  without ever destroying a prior one
- the bearer alone binds → nobody can change your premises, including the
  timelock

---

## PART 4 — Where each standard lands

| Standard | Where | What it buys |
|---|---|---|
| ERC-721 / 721A | hub | base ledger, cheap batch mint |
| ERC-2309 | `mintTreasury` | 300 tokens in one event instead of 300 |
| ERC-165 | both | corrected: hub +4494/5192/7496, vault +6551Executable/1271/receivers |
| ERC-2981 | hub → TollBooth | royalties finally obey 69/31 |
| ERC-4906 | hub | discrete invalidation (rank engraved, seal changed) |
| **ERC-7496** | hub | live traits, unforgeable by construction |
| ERC-7572 | hub | on-chain collection metadata |
| **ERC-4494** | hub | one-transaction sales, 1271-aware |
| **ERC-7066 / 5192** | hub | pawn without custody; marketplaces comply for free |
| ERC-6551 | vault | the account (unchanged, now fully declared) |
| **ERC-1271** | vault | the voice — bounded by the seal via domain separation |
| EIP-5792 | vault | `executeBatch` |
| ERC-1155 receiver | vault | batch transfers stop reverting |
| **ERC-5219** | Premises | the contract answers HTTP |
| **ERC-4804 / 6860** | Premises | `web3://` — no DNS, no server |
| **ERC-5018** | Premises | standard FS interface; ethfs/EthStorage tooling |
| ERC-7087 | Premises | MIME on web3:// responses |
| EIP-6963 | runtime | multi-wallet discovery without collision |
| ERC-4361 + 1271 | runtime | a *Dave* signs in, not a wallet |
| SHA-256 precompile | Premises | integrity the browser can check natively |
| EIP-170 / 3860 | Premises | why chunking exists at all |

---

## PART 5 — Before you deploy

1. **Nothing here has been compiled.** No network in the authoring sandbox, so
   `forge build` has not run. Expect first-compile fixups — in particular
   `_approve(spender, tokenId, false)` and `_mintERC2309` are ERC721A-version
   sensitive, and `_beforeTokenTransfers` must match your ERC721A minor version's
   signature exactly.
2. **`_mintERC2309` has an ERC721A-documented restriction**: it is intended for
   one-time/constructor use and some indexers handle `ConsecutiveTransfer`
   poorly. Verify against your target indexer before relying on it for the
   treasury tranche.
3. **Verify `0xaf332f3e`** against `type(IERC7496).interfaceId` from the
   version of the spec you compile against — 7496 is Draft and IDs move.
4. **The `_seizing` flag** in `transferFromLocked` is a deliberate reentrancy
   surface: it is set across an external `transferFrom`. It is safe only
   because `transferFrom` on ERC721A calls out solely to a receiver hook, and
   the locker is a trusted lien contract. If you loosen who can be a locker,
   replace the flag with an explicit internal transfer.
5. **C1 and C2 must be fixed before genesis** (see C0). After the first mint
   there is no path to change vault code.
6. Order of audit spend, given genesis holds real value: vault ragequit path →
   bag admission → 1271 boundary → hub lock/permit → Premises.
