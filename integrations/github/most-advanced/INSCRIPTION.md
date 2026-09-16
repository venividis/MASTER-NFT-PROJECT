# IPSEITY · INSCRIPTION

**Specification and answer to the owner's question.** All contract sizes below were read out of `/home/user/Most-Advanced-NFT-Possible/out/solc.json` (the repo's own build) rather than estimated; where a number is an estimate it says so and shows the calibration it came from.

---

# PART ONE — THE STRAIGHT ANSWER

**Yes to the Reach, no to the Grip, and the reason matters.** The Reach can drive an inscription today, exactly as it is, with not one line of `/home/user/Most-Advanced-NFT-Possible/src/IpseityAccount.sol` changed — including while it is sealed, because the seal only polices addresses on the manifest and an inscription contract is not one of them. So an inscription made through the Reach is made *by the token*, recorded as the token, and folds into the token's own operation count and therefore into its geometry. That is real and it costs nothing. The Grip cannot do it, and the honest version of why is not "it would be hard." It is that the Grip's entire argument is that the dangerous function was never written, and any design where the Grip *holds* a memory needs it to grow a function — at which point every Grip address in the collection changes and the argument is gone. There is a fashionable workaround: mint the inscription as its own NFT and mail it to the Grip, so it can never leave. I built the case for it and then took it apart. Anyone can mail anything to any Grip, the Grip cannot enumerate what it holds, and so the thing that construction proves — that a certificate for a public, copyable blob cannot be moved — is a proof about an outcome nobody was attacking. It is ceremony wearing the Grip's clothes. So this design leaves the Grip alone entirely, and I would rather tell you that than sell you the ceremony.

**On compiling code: you cannot compile Solidity, or any real language, inside the EVM, and you never will — eight megabytes of working memory costs 135,004,160 gas against a 60,000,000 gas block, which is arithmetic, not a budget.** Here is what is true instead, and it is better than the thing that isn't. You already own a compiler. It is in every viewer's graphics driver, it is a serious optimizing compiler, it runs for free, and it will compile whatever string your contracts hand it — because the artwork is a WebGL document and `glCompileShader` is right there. So the literal sentence "the NFT compiles code" becomes true the day a contract chooses part of the shader source, and no on-chain compiler is involved or wanted. The second true thing is smaller and ships sooner: because the collection is its own server, a token can hand a browser holder-written bytes *with a content type and a security header the contract itself chose*. That is a capability a `data:` URI cannot have at any price, and it is the actual cash value of "there is no server anywhere in the system." A third level exists — a holder can put raw EVM bytecode on chain and the server can call it — and it is real, but it is `dlopen()` with extra steps, there is no compiler in it, and it must never touch `tokenURI`.

**What I am proposing you build first is deliberately less than any of that.** A store: bytes written once, at an address derived from their own hash, bound to a token, attributed to whoever wrote them, listed on the token's own page in the console, and served at their own URL as inert text. No shader splice, no HTML from holders, no programs, no new Engine, no Renderer swap, nothing irreversible. It is a day of work and it is the part the owner actually asked for — permanent etched memories bound to the token. Everything above it is version two, and version two has one precondition that is not negotiable: `Ipseity.setRenderer` is currently a single-key call with no delay, and every version of the shader idea requires that key to stay live for a year. A key that can darken every inscription in the collection in one transaction, and can install a permanent script-injection renderer on a real origin with a live wallet and seal it in the same block, is not insurance. Put it behind the timelock that is already sitting in `/home/user/Most-Advanced-NFT-Possible/src/lib/Timelock.sol` first.

---

# PART TWO — THE DESIGN

The spine is Proposal 3: **an inscription is bytes with an address and a URL, not a field on a token.** All three refuters ranked it first and for the same three reasons — it stores a content digest, it caps the archive, and it minimises what a swapped renderer can take away.

Grafted in from the others: Proposal 1's CREATE2 content-addressing (as an internal library, not a second deployed contract), Proposal 1's correct escaping *layer*, and Proposal 2's separation of the permanent archive from the mutable exhibition.

Dropped: holder-authored `text/html` on the collection's address (security refuter, categorical); the Lipschitz validator as an immutable sole write-time gate (reality refuter, who falsified its central claim on his own prototype); the Grip-balance toll (permanence refuter, P2-2); every `LINK`/redirect kind (P3-1); and the per-token Cabinet, deferred to version two because nothing in version one needs origin isolation once no holder byte is ever served as HTML.

### Rulings where the refuters disagreed

| question | ruling | reason |
|---|---|---|
| Is the alphabet the wall, or is escaping? | **Both, and the alphabet is primary.** | An alphabet is a property of the data and survives every future code path; escaping is a property of one function. But `Renderer._quote` runs on **only one of the two branches of `document()`** — the raw branch at `/home/user/Most-Advanced-NFT-Possible/src/Renderer.sol:96` is unescaped — so escaping must happen *before* the bytes leave the store, not in the Renderer. Neither is allowed to be the only one. |
| Ship `PAGE` behind a CSP on the shared origin, or at a per-token address? | **Neither, in version one.** No holder byte is ever served as `text/html`. | The security refuter's "different address or it doesn't ship" and the permanence refuter's "the Cabinet is an unpatchable server whose sealed URLs it cannot honour" are both right. If nothing executes, origin isolation stops being load-bearing and the 13 KB unpatchable server can wait until it is genuinely needed. |
| Does the digest have to reach `tokenURI`? | **Yes, but not in version one.** `Etch.digestsOf` and `Etch.rootOf` are plain `eth_call`s from day one; the two traits land with the Renderer swap in version two. | The permanence requirement is "reachable without the Renderer, without a gateway, without an indexer." A view function on the store satisfies that immediately. Putting it in `attributes` is strictly additional and it costs a Renderer redeploy, which costs a curator key, which is the thing we are hardening first. |
| Lipschitz validator: mandatory safety mechanism, or unshippable? | **Reality refuter wins for v1 — TERM is stored and never mounted.** When it ships, the security refuter's shell confinement is mandatory, because a gradient bound is not an influence bound: `0.0-1.0` passes every Lipschitz proof and renders the token a flat colour forever. | The claim "this is a soundness proof, not a heuristic" was falsified on the prototype: the fixed-point accumulator silently stops being an upper bound at nine multiplications and is 6,100× low at twelve, and the parser stack-overflows at 173 bytes — inside the stated 256-byte cap. |
| Leave `rendererSealed` false as insurance? | **Only behind a timelock.** | All three proposals rest on that window and none priced it. Unsealed + single EOA is the collection's largest permanent-compromise surface, not its safety net. |

---

## A. CONTRACTS

### A.0 What does not change, and the Grip

| file | change |
|---|---|
| `/home/user/Most-Advanced-NFT-Possible/src/GripVault.sol` | **zero bytes** |
| `/home/user/Most-Advanced-NFT-Possible/src/IpseityAccount.sol` | **zero bytes** |
| `/home/user/Most-Advanced-NFT-Possible/src/Ipseity.sol` | **zero bytes** |
| `/home/user/Most-Advanced-NFT-Possible/src/Engine.sol` | **zero bytes**, stays frozen |
| `/home/user/Most-Advanced-NFT-Possible/src/Sigil.sol` | **zero bytes** |

**The Grip's justification is that this design does not use it.** Its header says the attack surface for can-the-holder-get-the-assets-out is a function that was never written. An inscription system that needs the Grip to call, store, emit, sign, or enumerate needs that function written, and `GRIP_IMPL` is an input to every Grip address in the collection, so writing it re-addresses every hand in the edition. The alternative — a deed NFT mailed to the Grip — asks the Grip only to receive, which it can already do, but `onERC721Received` is `pure` and the registry is permissionless, so **any stranger can mail any token to any embodied Grip**, and the Grip has no way to tell a relic from a stranger's spam. A reliquary that anyone can post junk into and that cannot list its own contents is not a reliquary. The Grip is left exactly as its header describes it and the archive lives where an archive can actually be read.

The **Reach**, by contrast, is load-bearing and unchanged: `mayActAs(id, who)` admits the token's Reach, so a holder operating through the token inscribes as the token, `by` records the Reach address forever, and the same transaction can batch `Ipseity.record(id)` so the operation folds the surface. A sealed Reach can do all of it today: the inscription store is off-manifest and every call carries zero value, which `_refuseUnlessSafe` permits outright.

One pre-existing bug this design must route around rather than fix: `Ipseity.viewOf` calls `REGISTRY.account()` without the `code.length` guard that `onlyOwner` and `isTransferable` both carry, so on a chain with no ERC-6551 registry `tokenURI` reverts before any inscription exists. `Ipseity` is deployed and cannot be patched. **Therefore `Etch` and `Vitrine` never call `HUB.viewOf` — only `ownerOf`, `account` and `statsOf`.** Record it for the next hub deploy.

---

### A.1 `/home/user/Most-Advanced-NFT-Possible/src/lib/Shard.sol` — new internal library

The one change from `/home/user/Most-Advanced-NFT-Possible/src/lib/SSTORE2.sol` is `create` → `create2` with `salt = 0` over initcode that contains the payload inline and reads nothing. The address becomes a total function of the content and the deployer, so identical bytes deduplicate, the address is predictable before a wei is spent, and a two-transaction flow survives a reorg. `SSTORE2.sol` itself is left untouched — `Engine` depends on it and `Engine` is frozen.

```solidity
library Shard {
    uint256 internal constant MAX = 24_575;          // EIP-170 minus the STOP byte

    error Empty();
    error TooLarge(uint256 size);
    error CutFailed();

    /// Deploy `0x00 ‖ data` at its own content address. Idempotent: if these
    /// exact bytes are already at that address, returns it and deploys nothing.
    /// The first runtime byte is STOP, so the result is data that cannot execute.
    function cut(bytes memory data) internal returns (address ptr);

    /// Pure. Free. Where these bytes will live, and whether they already do.
    function addressOf(bytes memory data) internal view returns (address ptr, bool exists);

    function read(address ptr) internal view returns (bytes memory);
    function size(address ptr) internal view returns (uint256);

    /// Follow a chain of shards into ONE pre-sized buffer, extcodecopy'd at
    /// computed offsets. Never bytes.concat — that idiom is quadratic and it is
    /// why Engine.bodyBytes() costs 153,624 gas for 44,304 bytes.
    function join(address[] memory ptrs, uint256 total) internal view returns (bytes memory);
}
```

There is **no executable-deploy path in this library**. Version two's handler kind gets a separately-named `cutExecutable` with an EIP-3541 first-byte check, and it is not reachable from `inscribe`. (Proposal 1 proved a STOP prefix makes bytes inert and then offered to `STATICCALL` them for an answer; the two cannot both be true from one function.)

---

### A.2 `/home/user/Most-Advanced-NFT-Possible/src/Etch.sol` — the store

A satellite off `HUB`, like `Parley`, `Kiln`, `Nameplate`, `Locker`. Not inside `Ipseity` (5,488 bytes free) and not inside `Renderer` (3,829 free).

```solidity
contract Etch {
    IHub     public immutable HUB;
    Timelock public immutable STEWARD;     // the only privileged caller; 7-day queue

    /*── kinds ──*/
    uint8 public constant MEMO  = 1;   // short, showable, enters metadata
    uint8 public constant NOTE  = 2;   // long, archive only
    uint8 public constant DATA  = 3;   // arbitrary bytes, served as a download
    uint8 public constant GLYPH = 4;   // SVG path data, drawn by the console
    uint8 public constant TERM  = 5;   // a GLSL distance term — stored, NOT mounted in v1

    /*── limits ──*/
    uint256 public constant MAX_BODY      = 24_575;   // one shard
    uint256 public constant MAX_MEMO      = 1_024;
    uint256 public constant MAX_NOTE      = 4_096;
    uint256 public constant MAX_GLYPH     = 512;
    uint256 public constant MAX_TERM      = 512;
    uint256 public constant MAX_LEAVES    = 256;      // per token, for all time
    uint256 public constant MAX_PER_EPOCH = 32;       // per ownership epoch
    uint64  public constant MAX_SHOW      = 180 days;

    /*── storage ──*/
    struct Leaf {          // 160 + 24 + 32 + 8 + 8 + 16 = 248 bits. One slot.
        address ptr;       // content-addressed shard
        uint24  size;      // DERIVED from ptr.code.length - 1, never supplied
        uint32  bn;        // block written
        uint8   kind;
        uint8   flags;     // bit0 listed · bit1 sealed
        uint16  next;      // index+1 of the continuation leaf, 0 = last
    }

    mapping(uint256 id => Leaf[])                        private _leaf;
    mapping(uint256 id => mapping(uint256 => bytes32))   private _digest;  // write-once
    mapping(uint256 id => mapping(uint256 => address))   private _by;      // write-once
    mapping(uint256 id => bytes32)                       private _root;    // chained commitment
    mapping(uint256 id => uint64)                        private _epoch;   // count<<32 | xfersMark
    mapping(uint256 id => uint128)                       private _show;    // (i+1)<<96 | until<<32 | mark

    address public reader;          // the Vitrine. Steward-settable until sealed.
    bool    public readerSealed;

    /*── writing ──*/
    function inscribe(uint256 id, uint8 kind, bytes calldata body)
        external returns (uint256 index, address ptr);
    function extend(uint256 id, uint256 index, bytes calldata more)
        external returns (uint256 tail, address ptr);
    function retract(uint256 id, uint256 index) external;      // -> 410 Gone
    function relist(uint256 id, uint256 index) external;
    function sealLeaf(uint256 id, uint256 index) external;     // one way, forever

    /*── the exhibition, which is not permanent and says so ──*/
    function show(uint256 id, uint256 index, uint64 until) external;
    function hide(uint256 id) external;

    /*── reading ──*/
    function count(uint256 id) external view returns (uint256);
    function leafAt(uint256 id, uint256 index)
        external view returns (Leaf memory leaf, bytes32 digest, address by);
    function bodyAt(uint256 id, uint256 index) external view returns (bytes memory);
    function joined(uint256 id, uint256 index) external view returns (bytes memory);
    function digestsOf(uint256 id, uint256 offset, uint256 limit)
        external view returns (bytes32[] memory);
    function rootOf(uint256 id) external view returns (bytes32);
    function shown(uint256 id) external view returns (uint256 index, bool live, uint64 until);
    function epochLeft(uint256 id) external view returns (uint256);
    function addressFor(bytes calldata body) external view returns (address ptr, bool exists);
    function admits(uint8 kind, bytes calldata body) external pure returns (bool ok, uint16 why);
    function mayActAs(uint256 id, address who) public view returns (bool);

    /*── stewardship: exactly two functions, both behind the 7-day timelock ──*/
    function setReader(address v) external;    // onlySteward; refused once sealed
    function sealReader() external;            // onlySteward; one way

    /*── events ──*/
    event Inscribed(uint256 indexed id, uint256 indexed index, uint8 indexed kind,
                    address ptr, uint32 size, bytes32 digest, address by, bytes32 root);
    event Extended(uint256 indexed id, uint256 indexed index, uint256 tail, address ptr);
    event Listed(uint256 indexed id, uint256 indexed index, bool listed);
    event LeafSealed(uint256 indexed id, uint256 indexed index);
    event Shown(uint256 indexed id, uint256 index, uint64 until, uint32 mark);
    event ReaderSet(address reader);
    event ReaderSealed();
}
```

Four things in that shape are load-bearing and each closes a confirmed hole.

**`inscribe` takes `bytes calldata`. There is no overload that takes addresses, and `size` is derived.** Proposal 1's `inscribe(…, address[] shards, uint32 size)` is the worst finding in the whole review: a caller could name a counterfactual address, have the Warden validate a helper contract's bytes, `SELFDESTRUCT` it in the creation transaction (which EIP-6780 still permits), and leave a permanently-recorded, Warden-approved relic whose bytes are gone — or simply pass `size = 32` for a 24,575-byte shard and write 24,543 bytes past a pre-sized buffer. Both die when the only thing a caller can hand over is bytes.

**The digest is stored, and so is a chained root.** `_digest[id][index] = keccak256(body)` at write time, and `_root[id] = keccak256(abi.encode(_root[id], digest, index))` — an append-only commitment to the archive's contents *and order*, in one word, readable by plain `eth_call` from a chain with no renderer, no gateway and no indexer. The address is never the covenant; the digest is. This is the one thing every refuter said must be present, and it is the thing the "purist" proposal omitted.

**`show` carries both a transfer mark and an expiry.** `shown()` returns live only while `uint32(HUB.statsOf(id).xfers) == mark` **and** `block.timestamp < until`, with `until <= now + 180 days`. The transfer mark is the Reach's own session-key idiom (`s.mark == uint32(xfers)`) and it is sound — `xfers` bumps inside `transferFrom` and every ownership path routes through it. But it is only sound for *ownership*: a token held by a Safe whose signers are replaced, or by an LLC that is sold, changes hands without changing `ownerOf`. The expiry is what makes a change of beneficial ownership go dark within two quarters instead of never.

**The archive is capped twice.** `MAX_LEAVES = 256` for the life of the token, and `MAX_PER_EPOCH = 32` reset on every `xfers` bump. A departing seller cannot spend three dollars to bury a buyer's archive in a thousand entries, which is exactly what an uncapped `_ofToken[id]` permits.

**Alphabets are inlined constants, not a separate Warden.** Two `uint256` bitmaps and a 32-byte-per-iteration sweep. There is no `wardenOf[kind]` mapping and therefore no key that can redefine what a kind means after the fact. When version two adds `TERM`, a `wardenOf[kind]` pointer arrives with the rule that **a kind freezes the instant its first leaf is written** — so a compromised steward key can add a kind and can never redefine one that has been used.

---

### A.3 `/home/user/Most-Advanced-NFT-Possible/src/Vitrine.sol` — the reader

Pure view, no storage, replaceable. The pointer to it lives in **`Etch`**, not in `Renderer`. That is the fix for Proposal 1's collapsed asymmetry: replacing the read layer must not require replacing a 20 KB Renderer, must not require the curator key, and must not depend on the collection staying unsealed.

```solidity
contract Vitrine {
    Etch public immutable ETCH;
    IHub public immutable HUB;

    /// A JSON fragment for Renderer._attributes — leading comma, already
    /// escaped, or "" when there is nothing to say. Never returns raw bytes.
    function trait(uint256 id) external view returns (string memory);

    /// One leaf's body, escaped for text. "" if retracted or absent.
    function body(uint256 id, uint256 index) external view returns (string memory);

    /// The archive as JSON, paginated: index, kind, size, block, digest, by,
    /// listed, sealed. Every string through Web.jsonEsc.
    function sheet(uint256 id, uint256 offset, uint256 limit)
        external view returns (string memory);

    /// The console's lane fragment. HTML, escaped with Web.esc.
    function lane(uint256 id) external view returns (string memory);

    function mime(uint8 kind)        external pure returns (string memory);
    function csp(uint8 kind)         external pure returns (string memory);
    function disposition(uint8 kind) external pure returns (string memory);
    function cacheFor(bool sealed_)  external pure returns (string memory);
}
```

A draft of this contract had a function called `inline`. It does not compile — `inline` is a Solidity reserved keyword. That is in the test plan.

---

### A.4 `/home/user/Most-Advanced-NFT-Possible/src/Renderer.sol` — changed (version two only)

Three edits, and version one does not make any of them.

**(i) `_quote` becomes linear.** One pre-sized `new bytes(4*n + 2)` buffer written with `mstore8` and truncated. The escaping table does not change — `"` `\` `<`→`\x3c` — only the accumulation. Measured on this build: the function as shipped costs **504,667 gas at today's 675-byte state, 35,842,576 at 2,723 bytes, and 172,956,034 at 4,096** against geth's 50,000,000 `rpc.gascap`. The real ceiling on how much a token can ever say about itself is about 2 KB, and it is this function, not EIP-170 and not base64. The linear version is **108 bytes smaller** (20,747 → 20,639), so it pays for itself twice.

**(ii) Escaping moves out of the Renderer.** `_quote` guards the outer JS string literal on the compressed branch; the inflater then hands the same bytes to a second parser via `document.write`, and the raw branch at line 96 never calls `_quote` at all. `Engine.compressed` is a constructor argument, so a future uncompressed Engine silently removes the only escaping in the pipeline. Two mechanisms: `Vitrine.trait` returns bytes that are **already** escaped, so both branches are covered by construction; and the version-two Renderer's constructor carries `require(engine_.compressed())` so the raw branch can never be reached with an inscription in it.

**(iii) Two permanent traits and one conditional one, read through a guard.**

```solidity
function _etchTrait(uint256 id) private view returns (bytes memory) {
    address v = ETCH.reader();
    if (v == address(0)) return "";
    bytes memory cd = abi.encodeWithSelector(IVitrine.trait.selector, id);
    bool ok; uint256 n;
    assembly ("memory-safe") {
        ok := staticcall(400000, v, add(cd, 0x20), mload(cd), 0, 0)
        n  := returndatasize()
    }
    if (!ok || n < 64 || n > 4096) return "";        // a bomb, a revert, or a lie
    bytes memory raw = new bytes(n);
    assembly ("memory-safe") { returndatacopy(add(raw, 0x20), 0, n) }
    uint256 off; uint256 len;
    assembly ("memory-safe") { off := mload(add(raw,0x20))  len := mload(add(raw,0x40)) }
    if (off != 32 || len > n - 64 || len > 4032) return "";
    ...
}
```

Explicit stipend, `out = 0` so the return buffer is measured before it is copied, and the ABI header read by hand rather than by `abi.decode`. That is the discipline `/home/user/Most-Advanced-NFT-Possible/src/lib/Web.sol` already earned the hard way against a token that answered with an offset of `0xfffffffe` and took every page listing it out of gas. **A Vitrine bug can therefore never brick a token's metadata** — the traits simply do not appear.

Traits emitted: `Inscriptions` (count, always), `Inscription root` (`bytes32`, always), and `Memory` (the shown MEMO, escaped, only while the show is live).

---

### A.5 `/home/user/Most-Advanced-NFT-Possible/src/Premises.sol` — changed (version one)

Three routes and one header helper. `Premises` is the layer this project already designs to be replaced.

```solidity
if (_eq(leaf, "etch")) {
    if (n == 3) return _moved(string.concat("/c/", id.str(), "/hold"));   // one door
    (bool okI, uint256 which) = _toUint(resource[3]);
    if (!okI || which >= ETCH.count(id)) return _notFound();
    (Etch.Leaf memory l, bytes32 d,) = ETCH.leafAt(id, which);
    if (l.flags & 1 == 0) return _gone(d, l.ptr);                          // 410, with the digest
    return (200, VITRINE.body(id, which), _relic(l.kind, l.flags & 2 != 0));
}
if (_eq(leaf, "etch.json")) {
    return (200, VITRINE.sheet(id, 0, 64), _relic(0, false));
}
```

```solidity
function _relic(uint8 kind, bool sealed_) private view returns (KeyValue[] memory h) {
    h = new KeyValue[](5);
    h[0] = KeyValue("Content-Type", VITRINE.mime(kind));
    // A year of `immutable` is a true statement only about a leaf that can
    // never be unlisted. Everything else must be revalidated, or `retract`
    // is a bit nobody ever reads.
    h[1] = KeyValue("Cache-Control", sealed_
             ? "public, max-age=31536000, immutable"
             : "no-cache");
    h[2] = KeyValue("X-Content-Type-Options", "nosniff");
    h[3] = KeyValue("Content-Security-Policy", VITRINE.csp(kind));
    h[4] = KeyValue("Content-Disposition", VITRINE.disposition(kind));
}
```

`_gone` returns **410**, not 404, with the digest and the shard address in the body. Nothing is deleted; something is unpublished, and the status line says which. `_headers` also gains `X-Content-Type-Options: nosniff` for every page it serves — free, and it is missing today.

A CSP on `/token/<id>/live` is **not** in version one. That document is the instrument and a wrong CSP is a blank artwork; it needs a browser measurement pass, and it belongs with version two's engine work.

---

### A.6 The console — changed (version one)

`/home/user/Most-Advanced-NFT-Possible/src/Console.sol` is **17,573 bytes** with 7,003 free, so the lane would fit — but it goes in a new `ConsoleEtch.sol` anyway, matching the existing `ConsoleRead` / `ConsoleSkin` split, so the console's growth is one immutable and one call (≈140 bytes) and no future copy can push it over the cap.

The lane goes under **verb 2, PUT SOMETHING IN IT** — whole, act and archive together. Not split across two verbs: the console exists because nineteen doors in a hallway is a sitemap, not an interface, and "where do I write a memory" must not be a different door from "what does it remember." One word changes in `verbSub(2)`:

```
"what it holds, what it remembers, and what it can spend"
```

Verb 6 (`make`) gets one line pointing at it, because someone will look there.

---

## B. THE KIND SYSTEM

A kind is a triple: **the alphabet enforced at write time, the content type emitted at read time, and whether it may cross into metadata.** The reader never sniffs content and never negotiates a type. The table is closed; adding a kind is a new deploy, not a string a holder types.

| # | name | alphabet | cap | served as | into `tokenURI`? |
|---|---|---|---:|---|---|
| 1 | **MEMO** | `0x20–0x7E` minus `" ' \ < > & \` : ;`, plus `\n` | 1,024 | `text/plain; charset=utf-8` | **yes**, as a `Memory` trait, only while shown |
| 2 | **NOTE** | `0x20–0x7E` minus `" ' \ < > &`, plus `\n` | 4,096 | `text/plain; charset=utf-8` | no |
| 3 | **DATA** | none | 24,575/leaf, chainable to 256 | `application/octet-stream` + `Content-Disposition: attachment` | no |
| 4 | **GLYPH** | `MmLlHhVvCcSsQqTtAaZz0-9 .,+-eE` | 512 | `text/plain` | no in v1; drawn into the console still in v2 |
| 5 | **TERM** | `[a-z0-9 .,()+\-*/]` | 512 | `text/plain` | **no — stored, never mounted, in v1** |
| 6–127 | reserved | — | — | refused today | a future `Etch` may accept them |
| 128–255 | **permanently refused** | — | — | — | so no future kind can arrive through a high bit |

Three notes on the alphabets, because each excludes something for a reason a user will ask about.

**MEMO has no colon.** `/home/user/Most-Advanced-NFT-Possible/engine/ipseity.html` rewrites the document on the way into a nested frame with `html.replace(/depth\s*:\s*\d+/, "depth:" + (DEPTH+1))`, and that regex takes the **first** match. A string containing the literal `depth:0` earlier in the state absorbs the increment, `DEPTH` never rises, `MAX_DEPTH` never fires, and the token nests full WebGL engines without bound. There is no `<` anywhere in that attack — it defeats escaping by grammar. Excluding one character makes it structurally impossible, and the copy in the console says so in one sentence. NOTE keeps the colon, because NOTE never reaches the document.

**No kind admits `<`, `>`, `&`, `"`, `'`, `\` or a backtick.** That set is simultaneously inert inside a JS double-quoted string, inside `<script>`, inside HTML, inside JSON, inside base64 and inside SVG — which is exactly the set of parsers a byte on this path passes through. Nothing above `0x7E` is admitted either: control bytes and line separators terminate JS string literals, and a raw `0x0A` in the state blob blanks the page. `/home/user/Most-Advanced-NFT-Possible/src/lib/Web.sol` already implements this whitelist discipline for ERC-20 symbols; `Vitrine` reuses `Web.esc` and `Web.jsonEsc` rather than hand-rolling a fourth escaper.

**DATA has no alphabet, and that is safe because it has no readable content type.** `application/octet-stream` + `attachment` + `nosniff` + `sandbox; default-src 'none'` is not a document. Anything a holder cannot express in the restricted alphabets goes here, base64'd or gzipped by them off chain, and the token serves it as a file.

There is no `LINK` kind and no redirect. A 96-byte holder-chosen destination behind a 301 from the collection's own address is an open redirect whose final response carries the attacker's headers — including, notably, not carrying the CSP that was the whole safety argument.

---

## C. INSCRIBE PATH, READ PATH, AND WHAT IT COSTS

### The inscribe path

**Who may.** `mayActAs(id, who)` — the owner, or the token's Reach. Copied from `/home/user/Most-Advanced-NFT-Possible/src/Kiln.sol:137-142` without modification, so the rule for "what may deploy under this collection's name" is the rule for "what may speak under this token's name." Never a renter, never an operator. `show`/`hide`/`retract`/`relist`/`sealLeaf` use the same predicate — Proposal 1 used bare `ownerOf` for `show`, which locks out a holder who operates entirely through the Reach, i.e. the collection's own thesis.

**The steps.**

1. **Preview, free.** The console calls `Etch.admits(kind, body)` and `Etch.addressFor(body)`. Both are views. The holder sees accepted-or-why-not, the exact address the bytes will occupy, and whether someone has already written these exact bytes (in which case the deploy is skipped and the write is cheaper).
2. **`inscribe(id, kind, body)`.** In order: `mayActAs` or revert; kind and size gate; alphabet sweep; epoch cap; `Shard.cut` (CREATE2, idempotent); `keccak256(body)` into `_digest`; `msg.sender` into `_by`; the leaf packed into one slot; `_root` chained; `_epoch` bumped; `Inscribed` emitted.
3. **Optionally `extend(id, index, more)`** for a body over 24,575 bytes — a new leaf, chained by `next`, ≤3 max-size shards per transaction under EIP-7825's 2²⁴ cap.
4. **Optionally `show(id, index, until)`** — one SSTORE, reversible forever, dead on the next transfer or at `until`.
5. **Optionally, through the Reach, batch `Ipseity.record(id)`** in the same `executeBatch`, so the act folds the geometry.

### The read path

`Etch.bodyAt` is one cold account access plus `EXTCODECOPY` — **≈13,800 gas for 20 KB, execution only**, against ~19.99M for `tokenURI`. `Etch.joined` follows the `next` chain into a single pre-sized buffer; it never uses `bytes.concat`, which is why `Engine.bodyBytes()` costs 153,624 gas for 44,304 bytes and a pre-sized join costs about 45,000.

Nothing on the artwork's path iterates the archive. `Renderer._etchTrait` reads `count`, `rootOf`, and one `shown()` slot — three O(1) reads, guarded, capped at 4,096 bytes of return. **`tokenURI` cost is a function of a fixed number of slots and never of a holder-growable array.**

### Gas, with the arithmetic

Components: intrinsic 21,000; calldata 4 gas/token under EIP-7623's standard branch (`tokens = zeros + 4·nonzeros`); `CREATE2` 32,000; EIP-3860 2 gas per initcode word; CREATE2 hashing 6 gas per initcode word; code deposit 200 gas/byte; virgin SSTORE 22,100; cold overwrite 5,000; `keccak256` 30 + 6/word.

**1 KB NOTE, one shard, first inscription on this token**

```
intrinsic                                                    21,000
calldata  4 + 32 + 32 + 32 + 1,024 = 1,124 B
          ≈1,036 nonzero, 88 zero → tokens = 88 + 4·1036 = 4,232
          standard branch  4 × 4,232                         16,928
alphabet sweep, 1,024 B                        20,500 –     223,000   ← see note
keccak256(body)  30 + 6 × 32                                    222
CREATE2                                                      32,000
EIP-3860   initcode 1,037 B → 33 words × 2                       66
CREATE2 hashing  6 × 33                                         198
code deposit  200 × 1,025                                   205,000
initcode execution + memcpy                                    ~520
state: _leaf length (virgin) + element (virgin)               44,200
       _digest (virgin)                                       22,100
       _by     (virgin)                                       22,100
       _root   (virgin)                                       22,100
       _epoch  (virgin)                                       22,100
event Inscribed  375 + 3×375 + data                          ~2,100
dispatch, mayActAs (2 cold calls), memory, checks             ~9,000
                                                     ──────────────────
total                                          460,134 –     662,634
subsequent inscriptions on the same token      408,834 –     611,334
```

**20 KB DATA, one shard, first inscription** (no alphabet sweep — DATA has none)

```
intrinsic                                                    21,000
calldata 20,100 B → tokens = 88 + 4·20,012 = 80,136
          standard branch  4 × 80,136                       320,544
keccak256(body)  30 + 6 × 625                                 3,780
CREATE2                                                      32,000
EIP-3860   initcode 20,013 B → 626 words × 2                  1,252
CREATE2 hashing  6 × 626                                      3,756
code deposit  200 × 20,001                                4,000,200
initcode execution + memcpy                                  ~6,000
state (as above)                                            132,600
event + dispatch + mayActAs                                 ~11,100
                                                     ──────────────────
total                                                     4,532,232
subsequent                                                4,480,932
```

| | Base (0.005 gwei L2 + Fjord DA) | Ethereum L1 (0.1194 gwei) |
|---|---:|---:|
| 1 KB memory, first | **$0.0058 – $0.0084** | **$0.138 – $0.199** |
| 1 KB memory, later | $0.0052 – $0.0077 | $0.123 – $0.184 |
| 20 KB file | **$0.0574** | **$1.361** |

At ETH $2,515. Base's L1 data component is $0.00003 at 1 KB and $0.00046 at 20 KB — under 1% — and rises above L2 execution only when the blob base fee passes roughly 1.24 gwei.

> **The alphabet sweep is a disputed measurement and the design refuses to guess.** By op count, a 32-byte `CALLDATALOAD` plus a 256-bit bitmap test is about five operations per byte — roughly **20 gas/byte**. An independent measurement of the same construction reported **193–218 gas/byte**, declining with size in a way that suggests fixed harness overhead was folded in. Both bounds are shown above because the difference is a factor of ten and neither of us is entitled to it. **`tools/verify-etch-gas.mjs` measures the marginal cost by differencing two payload sizes and fails the build if it exceeds 40 gas/byte**, which is the number the design is willing to defend. If the real figure is 200, MEMO and NOTE lose their alphabets and become DATA-with-a-content-type, and the design says so in advance rather than discovering it after deployment.

---

## D. EVERY SECURITY FIX, AS A MECHANISM

| finding | mechanism in this design |
|---|---|
| **X1** `_quote` runs on only one branch of `document()`; the raw branch is unescaped | Escaping happens in `Vitrine`, before bytes leave the store. The Renderer never handles an unescaped inscription byte. v2's Renderer constructor carries `require(engine_.compressed())`. |
| **X2/X3** `_quote` is quadratic — 172,956,034 gas at 4,096 B of state | Linear pre-sized rewrite with `mstore8`, escaping table unchanged, fuzz-checked byte-identical. Measured 108 bytes smaller. |
| **X4** the `depth:` regex is a nest bomb with no metacharacter in it | `:` excluded from the MEMO alphabet. Inscription keys emitted **last**, after `_form`. v2 also anchors the regex. Two independent stops. |
| **X5** the Lipschitz accumulator saturates and stops being an upper bound at nine multiplications | TERM stored, never mounted, in v1. In v2 the linker **reverts on saturation** and never clamps, and emits `max(max(e, length(p)-R_out), R_in-length(p))` — because a gradient bound is not an influence bound. |
| **X6** the parser stack-overflows at 173 bytes of nested parens | Explicit depth counter with a documented maximum, checked before recursing. v2. |
| **X7** P1 and P2 re-run the parser on the read path | The **linked** GLSL is stored at write time. `tokenURI` never parses anything. v2. |
| **X9** this would be the first holder string in a document holding `eth_sendTransaction` | v1 puts nothing in the document. v2 puts only MEMO, under the alphabet, escaped, emitted last, and only while shown. |
| **X11** `Leaf` packing | 248 bits, verified against solc's `storageLayout` in the test plan, not asserted in a comment. |
| **C0-1/C0-2** the curator can darken every inscription, or install a permanent XSS renderer and seal it in one block | `Ipseity` ownership behind `/home/user/Most-Advanced-NFT-Possible/src/lib/Timelock.sol` (7 days) **before anything ships**. The digest root lives in `Etch` and is readable without the Renderer. |
| **C0-3** `viewOf` reverts on a chain with no 6551 registry | `Etch` and `Vitrine` never call `viewOf` — only `ownerOf`, `account`, `statsOf`. Recorded for the next hub. |
| **C0-4** stale-on-transfer misses beneficial-ownership change | `show` carries `until` (≤180 days) **and** the `xfers` mark. Both must hold. |
| **C0-5 / P3-6** `SSTORE2.write` uses nonce-dependent `create` | `lib/Shard.sol` uses `CREATE2` over pure initcode. The address is the digest — and the digest is stored anyway, so the address is never the covenant. |
| **C0-6** the escape hatch dies with the curator key | The replaceable gate is the `Vitrine` pointer in `Etch`, behind the timelock, independent of `rendererSealed` and of the curator. |
| **P1-1 / 1.4** caller-supplied shard addresses and `size` | `inscribe` takes `bytes calldata` only. `size` derived from `ptr.code.length - 1`. No address-taking overload exists. |
| **P1-2** archive burial by a departing seller | `MAX_PER_EPOCH = 32`, reset on `xfers`; `MAX_LEAVES = 256`. |
| **P1-3** the Grip is a permissionless dumping ground sold as a reliquary | The Grip is not used. |
| **P1-4** holder-influenced marketplace JSON | `Web.jsonEsc` on every string, plus the alphabet, plus the guarded `staticcall` so a bad Vitrine cannot revert `tokenURI`. |
| **1.1** a function named `inline` does not compile | It is called `trait`, `body`, `sheet`, `lane`. Encoded in the test plan. |
| **1.2** a STOP-prefixed shard cannot execute, so `CODE` relics do nothing | `Shard.cut` always STOP-prefixes and there is no executable path. v2's handler kind uses a separately-named `cutExecutable` with an EIP-3541 check, unreachable from `inscribe`. |
| **P2-1** a mutable `wardenOf[kind]` is a code-injection path into every token | No warden in v1. In v2 a kind freezes on its first leaf. |
| **P2-2** the Grip-balance toll is zero on the tokens most worth defacing | No toll. |
| **P2-3** a permissionless `sample()` changes a stranger's artwork after the sale | No handlers on any render path, ever. |
| **P2-4** "erase" that is not erasure | There is no `erase`. `retract` is a bit, and the response is **410 Gone** with the digest and the address in the body. |
| **P3-1** `Cache-Control: immutable` makes `retract` cosmetic | `immutable, max-age=31536000` only for `sealLeaf`ed leaves, which genuinely cannot be unlisted. Everything else is `no-cache`. |
| **P3-2** the Cabinet never checks `tokenContract` | No Cabinet in v1. In v2 it checks it, the way `IpseityAccount.owner()` and `GripVault.owner()` both already do. |
| **P3-3** `LINK` is an open redirect from the collection's own address | No LINK kind, no redirect to a holder-chosen destination. |
| **P3-4** gzip and chunking cannot both be true | No `Content-Encoding` in v1. When it lands, `enc != 0` is refused on any chained leaf. |
| **P3-5/3.9** an unpatchable 13 KB HTTP parser | Deferred, and when it lands, the immutable half is identity + dispatch (~2 KB); mime, CSP, cache and JSON tables live in the replaceable `Vitrine`. |
| **X3 (return bomb, generalised)** | Every cross-contract read from `Renderer` uses assembly `staticcall` with `out = 0`, a `returndatasize()` cap, an explicit stipend, and a hand-read ABI header. |

Two things the refuters correctly said are **not** dangers, and which this design therefore does not defend against: a hostile shader term cannot hang a GPU (the march is `for(int i = 0; i < 220; i++)` with hard breaks, so the worst case is slow), and a GLSL compile failure aborts `boot()` at step 12, long before EIP-6963 discovery at step 86 — so a broken term is a dead token, not a wallet risk.

---

## E. BYTE BUDGET

EIP-170 ceiling 24,576. **Measured** figures come from `/home/user/Most-Advanced-NFT-Possible/out/solc.json` (solc 0.8.36, `via_ir`, `optimizer_runs = 800`, cancun). Estimates use this build's own calibration: logic-heavy contracts run ≈17 bytes/line (`IpseityAccount` 13,212/1,101 = 12.0; `Ipseity` 19,088/1,116 = 17.1; `ConsoleRead` 3,219/167 = 19.3), string-heavy page contracts ≈40 (`Console` 17,573/438 = 40.1).

| contract | measured today | arithmetic | after | headroom |
|---|---:|---|---:|---:|
| **`lib/Shard.sol`** | — | internal, counted inside its callers (~600 B in `Etch`, ~250 in `Vitrine`) | 57 | n/a |
| **`Etch.sol`** *(new)* | — | ≈270 lines × 17 = 4,590 + Shard inlined 600 | **≈5,200** | **19,376** |
| **`Vitrine.sol`** *(new)* | — | string-heavy: ≈160 lines × 40 = 6,400 | **≈6,400** | **18,176** |
| **`ConsoleEtch.sol`** *(new)* | — | ≈55 lines × 40 = 2,200 | **≈2,200** | **22,376** |
| `Premises.sol` | **14,782** | +2 routes, `_relic`, `_gone`, 2 interfaces ≈ +950 | ≈15,732 | **8,844** |
| `Console.sol` | **17,573** | +1 immutable, +1 call, one word in `verbSub` ≈ +140 | ≈17,713 | **6,863** |
| `Renderer.sol` *(v2 only)* | **20,747** | −108 (linear `_quote`) + 260 (guarded staticcall, 3 traits) | ≈20,899 | **3,677** |
| `Timelock.sol` | **1,675** | unchanged, already compiled in this build | 1,675 | 22,901 |
| `Ipseity.sol` | **19,088** | 0 | 19,088 | 5,488 |
| `IpseityAccount.sol` | **13,212** | 0 | 13,212 | 11,364 |
| **`GripVault.sol`** | **1,933** | **0** | **1,933** | **22,643** |
| `Engine.sol` | **2,724** | 0 | 2,724 | 21,852 |
| `Sigil.sol` | **14,477** | 0 | 14,477 | 10,099 |

New code, version one: **≈13,800 bytes across three contracts**, largest 6,400, none near the cap. `Renderer` is the only tight number in the table and its delta is deliberately near-zero: everything the artwork needs arrives as one already-escaped string from a contract that is not the Renderer, which is also what makes the read side replaceable without touching 20 KB of string constants.

Note that `Premises` measures **14,782** here, not the 13,873 quoted in the proposals — the tree moved. Every number above is from this build.

---

## F. HOW IT APPEARS TO A HOLDER

There is no new page. The console is being built ground-up in parallel and this is a **lane inside it**, rendered by `ConsoleEtch.lane(id)` and dropped into the existing lane column — the same shape as the market lane and the estate lane, server-rendered in the HTML that leaves the contract, so it degrades to a correct page about the right token rather than a skeleton over a spinner.

**Route:** `web3://<collection>/c/<id>/hold` — verb 2, *PUT SOMETHING IN IT*, whose sub-line becomes:

> the reach · the grip · **what it remembers** · what it can spend

Below the existing Reach/Grip pair:

```
WHAT IT REMEMBERS                                                       3 · 253 left

  #2   a memory      86 B    block 50,289,215   by the reach            SHOWING
       "built this the week my father died. it turns the same way he did."

  #1   a note     1,204 B    block 50,201,004   by 0x8f3c…91ab

  #0   a file    19,940 B    block 50,120,776   by 0x8f3c…91ab           SEALED

  Bytes written once, at an address that is their own hash. Nothing here can take
  them back — retracting one stops this page serving it, and does not remove it
  from the chain, and never will. What you can change is which one the token shows,
  and a sale clears that, so what a token shows is always the choice of whoever
  holds it now.

                                        [ WRITE ONE ]        [ SHOW NOTHING ]
```

Pressing **WRITE ONE** opens in the same lane. No modal, no second page.

```
WRITE ONE

     ( a memory )    ( a note )    ( a file )

  A memory is short and the token can show it — in the console, and in the
  traits every marketplace reads. 1,024 bytes. Letters, digits and ordinary
  punctuation, but no colon, no quote and no angle bracket: those are the
  characters that let text turn into code, and a memory that shows on the
  artwork is text a stranger's browser will read.

  A note can be four times as long and can use anything printable. It lives
  in the archive at its own address and never crosses into the artwork.

  A file is any bytes at all, up to 24 KB at a time, chained as far as you
  like. It is served as a download, never as a page. Nothing in it runs,
  here or anywhere this collection controls.

  ┌────────────────────────────────────────────────────────────────────┐
  │ built this the week my father died. it turns the same way he did.  │
  └────────────────────────────────────────────────────────────────────┘
   66 / 1024                        it will live at 0x4a1c…8802
                                    about $0.005 on Base · about $0.15 on mainnet

  ⚠  This is permanent. There is no undo, and an undo is not something anyone
     can add later. Read it once more.

  [ ] Write it as the token, through the Reach — the record will say the token
      did this, and the operation folds one more crease into the surface.

                                                    [ WRITE IT PERMANENTLY ]
```

After the write, one line, in the token's own hue:

```
  #3 is at 0x4a1c…8802, in block 50,291,904.
  web3://<collection>/token/<id>/etch/3          [ SHOW IT ]   [ COPY THE LINK ]
```

And the show control, which is the one thing that is not permanent, says so where it is used:

```
  SHOW #3 on the token          until  [ 30 days ▾ ]   max 180

  Showing puts it in the console and in the token's traits. It stops when
  you say so, when that date passes, or the moment the token changes hands.
  The memory stays in the archive either way, with your address on it.
```

Everything a holder does here is two views (`admits`, `addressFor`) and one transaction. The console already carries the wallet, the chain badge, the depth rules in the margin, and the command line — `write memory`, `show 3`, `retract 1`, `seal 0` resolve through the same verb table, so the lane and the command line cannot disagree.

---

## G. THE TEST PLAN

Three files in `/home/user/Most-Advanced-NFT-Possible/tools/`, in the register of `selftest.mjs`, `gas.mjs`, `fuzz.mjs` and `exercise.mjs`: real EVM or real browser, seeded and reproducible, and several assertions exist because a specific bug was actually written.

### `/home/user/Most-Advanced-NFT-Possible/tools/verify-etch.mjs` — the store, on a real EVM

Runs the whole suite three times, at **Cancun, Prague and Osaka**, because EIP-7623's calldata floor and EIP-7825's 2²⁴ transaction cap do not exist at Cancun and this collection deploys past both.

1. **The hands are untouched.** Recompile `src/` and assert the keccak of the deployed bytecode of `Ipseity`, `IpseityAccount`, `GripVault`, `Engine` and `Sigil` equals a pinned constant. This turns "we did not touch the Grip" from a claim in a document into a red build.
2. **`Shard` is content-addressed.** The same bytes written twice by two different senders in two different transactions land at the same address and deploy once. *(Encodes the bug: `SSTORE2.write` uses nonce-based `create`, so a pointer named in a receipt is not verifiable from the content.)*
3. **`Leaf` is one slot.** Read solc's `storageLayout` output and assert `_leaf`'s element occupies exactly one slot. *(Encodes the bug: a proposal's `Draft` struct was documented as two slots and compiles to three.)*
4. **`size` is never supplied.** Assert the `Etch` ABI contains no function taking an `address[]`, and that for every leaf written by 500 fuzzed bodies, `leaf.size == ptr.code.length - 1` and `digest == keccak256(body)`. *(Encodes the bug: caller-supplied shard addresses plus a caller-supplied size, which is a permanent under-allocated `extcodecopy` and a counterfactual-address swap three years later.)*
5. **The alphabets hold.** 2,000 seeded bodies per kind, with shrinking on failure. Every accepted MEMO contains no byte outside the whitelist; specifically, `depth:0`, `</script>`, `\u2028`, a lone `0x0A` in MEMO, a lone continuation byte, and `"` are all refused. *(Encodes the bug: the depth regex takes the first match, so a memory containing `depth:0` freezes `DEPTH` and nests WebGL engines without bound.)*
6. **The archive cannot be buried.** The 33rd inscription in one ownership epoch reverts; a transfer resets the counter; the 257th ever reverts permanently.
7. **A show dies twice.** Set a show, transfer the token — `shown()` returns dead. Set a show, warp past `until` — dead. Set `until` beyond 180 days — reverts.
8. **Retraction is honest.** A retracted leaf returns 410 with its digest and its address, `bodyAt` still returns the bytes, and the shard's code length is unchanged. *(Encodes the bug: a design offered "erase" for bytes that are permanently deployed contract code.)*
9. **A bad reader cannot brick a token.** Deploy a `Vitrine` that always reverts; assert `tokenURI` returns and omits the traits. Deploy one that returns 1 MB; assert `tokenURI` returns, omits the traits, and stays under 50,000,000 gas. Deploy one that returns an ABI header claiming 2⁴⁸ bytes; assert the same. *(Encodes the bug recorded in `/home/user/Most-Advanced-NFT-Possible/src/lib/Web.sol` — an ERC-20 answering with an offset of `0xfffffffe` took every page that listed it out of gas.)*
10. **Nothing goes near the cap.** No single `inscribe` or `extend` exceeds 2²⁴ gas at Osaka rules, including three chained max-size shards in one transaction.
11. **ABI reconciliation**, in `exercise.mjs`'s style: every external function on `Etch` and `Vitrine` is either exercised or skipped with a written reason, and an unclassified function fails the run.

### `/home/user/Most-Advanced-NFT-Possible/tools/verify-etch-quote.mjs` — the escaper (version two)

12. **The linear `_quote` is byte-identical to the shipped one.** 5,000 seeded inputs including every metacharacter, every boundary byte, and the current 675-byte state, compared against the deployed implementation compiled from `git show`. The *algorithm* changes; the *table* must not.
13. **The gas ceiling.** Assert `document()` at 4,096 bytes of state is under 4,000,000 gas. The shipped function costs **172,956,034** there. *(Encodes the bug: quadratic accumulation via `abi.encodePacked(out, c)`, which is the real ceiling on how much a token can say about itself — not EIP-170, not base64.)*
14. **Both branches escape.** Deploy an **uncompressed** Engine, put a hostile-looking DATA body through `Vitrine`, and assert the resulting document contains no unescaped `<`. *(Encodes the bug nobody caught: `_quote` is called only inside `if (engine.compressed())`, and `Engine.compressed` is a constructor argument.)*
15. **`require(engine_.compressed())`** in the v2 Renderer constructor is asserted by deploying against an uncompressed Engine and expecting a revert.

### `/home/user/Most-Advanced-NFT-Possible/tools/verify-etch-serve.mjs` — the server, in a real browser

Driven through the existing `gateway.mjs` and `site-viewer.mjs` harness with Playwright.

16. **Headers are what the contract said.** `Content-Type`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy`, `Content-Disposition` and `Cache-Control` on `/token/<id>/etch/<n>` match `Vitrine.mime/csp/disposition/cacheFor` exactly, for every kind.
17. **A sealed leaf caches for a year; an unsealed one does not.** Assert `immutable, max-age=31536000` appears only when `flags & 2`. *(Encodes the bug: a design shipped `immutable, max-age=31536000` on every leaf and offered `retract` as its only remedy for abusive content — a year of caches that will never revalidate.)*
18. **Nothing a holder wrote executes.** Inscribe a DATA leaf whose body is `<script>window.__pwned=1</script>`, load its URL in a real browser, and assert `window.__pwned` is undefined, `document.scripts.length === 0`, no dialog fired, and the response was `application/octet-stream` with `Content-Disposition: attachment`.
19. **No holder byte reaches a header value.** Fuzz slugless bodies and assert every emitted header value is drawn from the fixed table plus `LibNum` output.
20. **The console lane renders correctly with nothing, with one, with 256, and with a retracted leaf**, and the page is byte-stable across two identical calls.

Wired into `npm run check`, so a change that breaks any of the above fails in the commit that makes it, rather than in a wallet.

---

# PART THREE — PHASES

## VERSION ONE — one day, nothing irreversible

**Step 0, and it gates everything after it:** deploy `Timelock` (already in the build at 1,675 bytes) and begin `Ipseity.transferOwnership` to it. Two-step, so both halves. This is independent of inscription, it is the project's own stated plan (`DEPLOYMENTS.md`: a timelocked curator belongs to a mainnet deploy), and it is the single largest unhedged risk in the collection right now.

Then:

- `/home/user/Most-Advanced-NFT-Possible/src/lib/Shard.sol` — CREATE2 content-addressed writer, ~90 lines.
- `/home/user/Most-Advanced-NFT-Possible/src/Etch.sol` — the store. Kinds MEMO, NOTE, DATA. GLYPH and TERM accepted and stored, mounted nowhere.
- `/home/user/Most-Advanced-NFT-Possible/src/Vitrine.sol` — escaping, the manifest, the lane fragment, the header tables.
- `/home/user/Most-Advanced-NFT-Possible/src/ConsoleEtch.sol` + one call and one word in `Console.sol`.
- Two routes and `_relic`/`_gone` in `Premises.sol`, plus `nosniff` on every page it serves.
- `verify-etch.mjs` and `verify-etch-serve.mjs`.

**Not in version one:** no Renderer change, no Engine rebuild, no engine document change, no `setRenderer`, no shader, no HTML from holders, no programs, no Cabinet, no Grip. `tokenURI` is byte-identical to what it is today.

What a holder gets: permanent memories bound to the token, at their own content addresses, attributed forever, listed on the token's own page, reachable at their own URL, capped so a seller cannot bury a buyer, with a digest and an append-only root any stranger can verify by `eth_call` on a chain with no gateway and no indexer. That is the owner's request (a), delivered.

## VERSION TWO — in order, and the order is the point

1. **The Renderer swap, queued through the timelock.** Linear `_quote`; escaping proved to cover both branches; three new traits read through the guarded `staticcall`. Now the token *says* what it remembers, in metadata every marketplace reads. This is the first irreversible-ish step and it is now a seven-day public queue instead of one key.
2. **GLYPH into the still.** `Sigil` stays a pure function of `(id, word, seed, strata)` — the fallback face must not depend on the inscription store, or a bad relic takes faces 0, 1 and 2 down together. The glyph is drawn by `ConsoleEtch` into the console's still, not by `Sigil` into the token's.
3. **The Cabinet — a fourth 6551 salt, per token, for MARKUP and HANDLER.** Only now, because only now does a holder byte want to be a document, and a per-token contract address is the only mechanism in this system that makes cross-token XSS cross-*origin*. It checks `tokenContract`. It carries `Content-Security-Policy: sandbox` as a response header. Its immutable half is identity and dispatch (~2 KB); mime, CSP, cache and JSON live in the replaceable `Vitrine`. The canonical permanent URL is content-addressed and served by `Etch` itself, so `sealLeaf` promises something the design can actually keep.
4. **TERM, and only after adversarial review by someone who did not write the validator.** New Engine, new Renderer, `setRenderer` through the timelock, the `HEAD3 + ETCH` seam, `let ETCH = ""` inside `glsl-check.mjs`'s marker range, `ETCH` in terser's `reserved`, the `else if(mat < 3.5)` shading branch, `uSeedB` activated, and — non-negotiable — the shell confinement, saturation-reverting fixed point, an explicit parser depth bound, and the linked GLSL stored at write time so nothing is parsed on the read path. This is the level where "the NFT compiles code" becomes literally true, and it is last because it is the one that cannot be taken back.

## DELIBERATELY NEVER

- **An on-chain compiler or interpreter for any language.** It is shippable — a Brainfuck compiler on Arbitrum compiled 20,116 bytes in one 20,176,044-gas transaction — and I read its verified source: an unbounded `while (_bf[_rindex] == "+")` that panics on any program ending in an operator, and no EIP-170 check on its 50,000-byte output buffer. Live, on a token with 639 holders, permanently. A compiler is a compiler; putting it on chain makes its bugs immortal. For every output this system wants — a shader term, a path, a vector — a validator and a table is a tenth the code and none of the bug surface.
- **Holder-authored `text/html` from the collection's own contract address.** One origin serves every token and holds `eth_sendTransaction`. A header the collection emits but a gateway delivers is not a boundary.
- **`DELEGATECALL` into inscribed code, anywhere, for any reason.** `IpseityAccount`'s `if (operation != 0) revert OnlyCall();` is already the right answer and must never be relaxed.
- **A handler on the `tokenURI` path.** The return bomb, the 63/64 rule, and `TIMESTAMP` between them mean the artwork would become a lottery.
- **Gating inscription on a Grip balance.** The Grip holds what a token carries as part of what it is; a toll measured against it is free on exactly the tokens most worth defacing, and it dresses a fee as a covenant.
- **Logs or blobs as the medium.** Logs are 5× cheaper and no opcode can read one, and EIP-4444 lets nodes drop receipts after a year. Blobs are 4,198× cheaper and expire in about eighteen days. For a collection whose thesis is that there is no server anywhere, "somebody, somewhere, runs an archive" is not the same guarantee as "every full node must keep this to validate the chain."
- **Deleting an inscription.** There is no delete and there will never be one. `retract` unpublishes, answers **410 Gone** with the digest, and says so in those words — because a system that lets a person believe "erase" means "gone" has lied about the only thing that matters.