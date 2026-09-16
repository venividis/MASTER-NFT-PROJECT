# IPSEITY — SIX QUESTIONS, ANSWERED

Written 2026-08-22. Every number here was measured — on the repo's own EVM harness, on live RPCs, or in a real browser — and every line number was re-checked against the working tree today, because three earlier drafts of this material cited a file that moves about ten lines a day.

**One warning on prices before anything else.** All dollar figures use ETH at $2,432 and Ethereum at 0.366 gwei, sampled today. That gas price is historically abnormal: the p95 over the last 1,024 blocks was 2.35 gwei, a 6× swing inside 3.4 hours. Base at 0.007089 gwei is likewise a level nobody promised would persist. Read every Ethereum figure as *today's*, and read the Base figures as an argument that could invert. Where a design's justification depends on cheap gas, I say so.

---

# PART ONE — THE SIX ANSWERS

## 1. Can the NFT hold another NFT and run its code?

**Yes — in exactly one place, and that place is better than the place you were probably imagining.**

### What is true

Holding ships today and needs nobody's permission. `onERC721Received` (`src/IpseityAccount.sol:939`) accepts every ERC-721 except the token's own; `onERC1155Received` (`:949`) is `external pure` and accepts everything, always. No allowlist, no registration, no cost. A token can hold your art right now.

Running is where it gets interesting, and the interesting version is not on chain. **There is a serious optimising compiler in every viewer's machine already: `glCompileShader`, in their graphics driver.** The engine already hands it a string — `FS_FIELD` is assembled at `engine/ipseity.html:722` and compiled at `:1307`. If part of that string comes from a *different token's* chain state, then "the NFT runs the held NFT's code" is literally true, with no on-chain compiler anywhere, and the compilation is free.

Measured: a 224-byte distance-field term spliced into the real shader, run through the repo's own parser (`node tools/probe-splice.mjs`) — **zero problems, 12,621 characters, +306 over the shipped shader.** Minting that term as an ERC-721 costs **381,076 gas — $0.34 on Ethereum, $0.0066 on Base.** Reading it back costs **6,351 gas**, which is 0.013% of a default node's `eth_call` budget. It is unreadable on no node anywhere.

And the sandbox is free and perfect. A fragment shader has no DOM, no network, no storage, no wallet, no `parent`. Its only output is pixels. That is a **strictly better isolation boundary than `sandbox="allow-scripts"`, than a CSP header, than an opaque origin** — and unlike all three it works identically inside a `data:` URI, over `web3://`, and inside a marketplace iframe, and it cannot be defeated by a browser bug because there is nothing to defeat.

There is a second structural guarantee I verified rather than assumed. The splice sits inside `solid()` at `engine/ipseity.html:800–813`, which is declared *above* `formStep`, `map`, `grad3`, `march` and `main`. GLSL requires declaration before use. I tried it: **a term calling `map()` is refused by the compiler — `Encountered undeclared function: "map"`.** The capability list is enforced by the grammar, not by a check somebody could forget to run.

### What is not true

**On chain, the token can call another contract and can never become it.** `execute` reverts `OnlyCall` on any non-zero operation (`src/IpseityAccount.sol:726`), and there is no `DELEGATECALL` anywhere in that file. That is not an oversight to be patched — it is the foundation the seal stands on. Adding a proxy path to the Reach would destroy the thing that makes the Reach worth having. Do not.

**And "run its code" does not extend to a random NFT you already own.** A shader term composes with the marcher because it was *minted to*. An Art Blocks piece is a finished picture; framing it next to your picture produces two pictures. That is not a limitation of this architecture — it is arithmetic. Two objects compose only when one supplies something the other cannot get alone.

### The real version

A **part**: a small ERC-721 whose bytes are a `float` expression in one input variable, minted by anyone for nineteen cents, held by your token's Reach, spliced into your shader, compiled by your driver. Your token supplies the marcher, the temporal accumulator, the five-level bloom pyramid, the filmic composite and the 4-D orientation. Neither is anything alone: a bare field is a formula, a marcher with no field is a black screen.

Part Two designs it. Two things it must carry that no earlier draft did:

**Shell confinement.** `INSCRIPTION.md:32` already recorded the rule and nobody carried it forward: *"a gradient bound is not an influence bound: `0.0-1.0` passes every Lipschitz proof and renders the token a flat colour forever."* A three-byte term of `0.0` is alphabet-clean, loop-free and brace-balanced, and it makes every ray hit at t=0 — the artwork is gone. The engine must wrap the spliced expression so it can only reach an annulus, using the exact formula the same document already wrote at `:434`:

```glsl
float partField(vec4 q){
  float e = /*TERM*/;
  return max(max(e, length(q) - R_OUT), R_IN - length(q));
}
```

A rogue term then eats a shell and never the camera.

**A pre-flight cost probe.** The gate bounds the work in one *call*. The marcher calls `solid()` roughly 75 times per pixel at tier 0 — 64 march steps plus 4 for `grad3`, 5 for ambient occlusion, 2 for the lean — across about two million pixels, and the step count is a compile-time constant that does not adapt to what the term costs. Nothing in the gate stops a cheap-looking expression from being 500× the cost of `sdTesseract`. So the client renders one frame into a 64×64 offscreen buffer with the composed program, times it, and refuses above a budget. That is twenty lines, and without it the claim "no term can hang a GPU" is false — and a GPU watchdog trip loses **every WebGL context in the browser**, including the outer instrument's and other tabs'.

---

## 2. A music player that plays music NFTs.

**The player is trivial and the library is almost empty. That is the whole answer, and the second half is the important one.**

### What is true

Serving audio from a contract needs no interface change. `Premises.request()` returns `(uint16, string, KeyValue[])`, and `string` looks like a wall for binary — it is not, because the reference client decodes the body as `bytes` and Solidity's `string` and `bytes` are ABI-identical. Proven three times on the repo's own harness, byte-identical, including a WAV that is not valid UTF-8:

| through ERC-5219 `request()` | bytes in | bytes out | gas |
|---|---:|---:|---:|
| a real Bleeps WAV from mainnet | 11,808 | 11,808 identical | **42,800** |
| a whole synth + presets + five songs, gzipped | 5,508 | 5,508 identical | **38,928** |
| 30 seconds of 44.1 kHz stereo PCM | 5,292,044 | 5,292,044 identical | 217,495,620 (over every cap) |

And there is exactly one on-chain music NFT that works. I called `tokenURI` on nine collections on mainnet. **Bleeps** (`0xc72d6d47c64460e6ed9d9af9e01c2ab4f37bef78`) returns a `data:application/json` URI whose `animation_url` is a real 11,808-byte WAV, synthesised inside the EVM, no IPFS, no gateway. `supportsInterface(0x80ac58cd)` is true and `ownerOf` answers, so the Reach can hold one and guard it today.

### What is not true

**Eight of the nine cannot be played by anything on chain.** EulerBeats and DEAFBEEF store a *transaction hash* and keep the actual code in historical calldata — 245,545 bytes for EulerBeats, 64,814 for DEAFBEEF Series 0. The EVM cannot read historical calldata, so no contract can ever compose with them; retrieval needs an archive node, and every byte is pre-Merge. Partial History Expiry shipped 2025-07-08 and is on by default in Geth 1.32.2. I hit it: across four public providers, **one request in six for DEAFBEEF Series 0 returned null.** Sound.xyz and Catalog resolve to `ar://`. Audioglyphs — which markets itself as "infinite audio NFTs derived from on-chain data" — is nine lines of relevance around `setBaseUri`, with the synthesis on a website and the metadata on a free-tier Heroku dyno that one owner key can repoint for all 10,000 tokens.

And Bleeps itself has a bug that halves it. `BleepsTokenURI.sol:246` computes `filesizeMinus8` with a `* 2` left over from 16-bit samples while `BYTES_PER_SAMPLE = 1`. Measured in Chromium: the shipped bytes play for **0.5347 s** in an `<audio>` element and **1.0695 s** through `decodeAudioData`, which scans the actual bytes. Every marketplace plays exactly half of every Bleep, live on mainnet.

**A recording is also not the thing to hold.** A 3-minute 320 kbps MP3 is 7.2 MB: 293 shards, 98 transactions, and — decisively — 400M gas to return from a view function against a 50M `rpc.gascap`. You could pay to write it and then nothing on the network could ever read it back in one call.

### The real version

**A score plus a synthesiser the contract shipped.** Measured end to end, decoded and rendered in Node and again in headless Chromium:

| | bytes | what it is |
|---|---:|---|
| SoundBox "wilderness" score | **604** | 3 minutes 23 seconds, 44.1 kHz 16-bit stereo, peak 32767, 94.6% non-zero |
| synth + sequencer (gz) | 1,411 | |
| instrument presets (gz) | 1,027 | |
| five scores, eleven minutes of music | 3,070 | |
| **whole stack** | **5,508** | one shard, one transaction, **$1.16 on Ethereum, $0.02 on Base** |

604 bytes is a 59,189× expansion into audio. A full General MIDI synthesiser — 128 programs, no samples — is 10,994 gzipped bytes and fits in one EIP-170 contract with 13,581 bytes to spare, for $2.23.

Two things I found only by testing, and both change the format. First, **the score is not self-contained**: rendering one song against the real presets versus a zeroed stub produced identical length and **40.34% of samples different, max deviation 31% of full scale.** The instrument table is part of the work, so it ships with the machine, not with the score. Second, **generation is single-threaded and blocking**: 3m23s took **7,043 ms** before the first sample. A shipped player generates incrementally in a Worker, which requires a real origin, which is one more reason the runtime lives at its own address and not in a `data:` URI.

And on day one, with no new format adopted by anybody, the player can already do something honest: read a held token's `tokenURI` by `eth_call`, and if `animation_url` is `data:audio/*`, put those bytes in an `<audio>` element. Audio bytes are data; a decoder is not a parser. That plays Bleeps with zero new contracts and zero isolation risk. For `ar://`, `ipfs://` and `https://` the row says **the recording is not on chain** and prints the URI verbatim — not a spinner, not a dead play button. The engine already has the vocabulary for this, at `engine/ipseity.html:3188`: *"The seal cannot promise about an asset it cannot read, and says so here rather than passing quietly."*

---

## 3. A game emulator with NFTs as cartridges.

**Yes for CHIP-8, Game Boy, NES and a fantasy console. No for SNES. And the cartridge library is a legal wall, not a technical one.**

### What is true

The machine is small and the cartridge is small, and each is one transaction:

| system | machine (gz) | cartridge | total | shards | txs | Ethereum | Base |
|---|---:|---:|---:|---:|---:|---:|---:|
| **CHIP-8** — Octo core + median CC0 cart | 3,318 | 2,270 | 5,588 | 1 | **1** | **$1.18** | $0.02 |
| **Game Boy** — wasmboy WASM + 32 KB ROM | 16,667 | 32,768 | 49,435 | 3 | **1** | $9.87 | $0.19 |
| **NES** — jsnes + NROM-256 | 31,524 | 40,976 | 72,500 | 3 | **1** | $14.35 | $0.28 |
| **WASM-4** — fantasy console + full 64 KB cart | 24,001 | 65,536 | 89,537 | 4 | 2 | $17.75 | $0.35 |
| GBA — IodineGBA + 8 Mbit ROM | 64,346 | 1,048,576 | 1,112,922 | 46 | 16 | $220.24 | $4.31 |

And it runs. Measured on this machine, 3,000 frames after warm-up, against a 16.667 ms frame budget:

| core | ms/frame | % of a 60 Hz frame |
|---|---:|---:|
| wasmboy Game Boy (WASM) | 0.356 | **2.1%** |
| jsnes, a real homebrew game | 2.174 | 13.0% |
| GameBoy-Online (JavaScript) | 5.982 | 35.9% |

Scale that for a phone at roughly a third the single-thread speed: a WASM Game Boy is 4–8% of a frame; the JavaScript Game Boy alone cannot hold 60 fps before the raymarcher draws a pixel. **Use WASM. That is the single largest lever and it is free.**

The thermal work is already done and already tested. `NEST_HZ = 5` (`engine/ipseity.html:1217`), the frame gate at `:1529`, and the tier pin `if(nestUp() && tier > 0){ tier = 0; good = 0; }` at `:1503` were written because two raymarchers on one thread cooked a phone. `tools/verify-thermal.mjs` already asserts the yield, the sharing and the recovery. An emulator opens in the same place and inherits all three unchanged.

The shared-blob architecture is not a proposal either — it is a description. `Renderer.engine` is one `immutable` read by all 4,096 tokens. The emulator is a second contract of the same shape: **one shared copy of jsnes is 7.08M gas ($6.30); 4,096 private copies would be $25,817.** The machine is a singleton, each cartridge is its own inscription with its own owner.

### What is not true

**NES does not fit inside `tokenURI`, and this is the boundary that decides the tiers.** I measured it directly rather than extrapolating, by rebuilding the engine with extra shards and reading the meter:

| extra stored (gzipped) bytes | `tokenURI` gas | fits a 50M node? |
|---:|---:|:--|
| 0 — as shipped | 20,687,345 | yes |
| +5,588 — Octo + a CHIP-8 cart | 23,145,904 | yes |
| +31,524 — jsnes alone | 35,002,632 | yes |
| **+72,500 — jsnes + NROM-256** | **55,653,418** | **no** |

Note also that the marginal cost is *not* constant: it rises from 440 to 501 gas per stored byte across that range, because the path is quadratic in three stacked base64 passes. So the true ceiling is about **+62,000 stored bytes**, not the ~66,000 a linear model predicts — the linear model is 8% optimistic exactly where the Game Boy row sits.

**SNES is out on three independent grounds.** $410 and 29 transactions to write; 33.79M gas to read; and the only mature core forbids it in writing. Snes9x's own licence: *"Permission to use, copy, modify and/or distribute Snes9x… for non-commercial purposes"* — and for the libretro port, *"(Under no circumstances will commercial rights be given)."* A paid collection shipping Snes9x is in breach of the *emulator's* licence before anyone says the word ROM. Pizza Ninjas did exactly this on Bitcoin in January 2024, published a legal FAQ about ROMs, and never mentioned the core's licence.

**And commercial ROMs are not available to you.** The archival exception people reach for is §117(a)(2); the subsection that decides the case is the next one. **§117(b):** copies may be transferred *"along with the copy from which such copies were prepared, only as part of the transfer of all rights in the program."* §117 does not merely fail to protect inscribing your backup — it expressly prohibits it. Encrypting it first changes who can read the copy, not whether distribution occurred. The Copyright Office considered the preservation framing and refused it in writing, Final Rule 89 FR 85432, effective 28 October 2024: proponents *"did not show that… permitting off-premises access to video games are likely to be noninfringing."* Super Mario Bros. is in copyright until 2080.

And the inscription is the one act in this system that can never be undone. **EIP-6780 is Final**: `SELFDESTRUCT` in a later transaction than creation deletes nothing, and an SSTORE2 shard begins with `STOP` and has no code path anyway. There is no actor — not the holder, not the curator, not a court — who can remove those bytes. DMCA §512 safe harbour is conditioned on removing material on notice; you cannot. Statutory damages run to $150,000 per work for wilful infringement, and your own address paid for each inscription, on a public ledger, with a timestamp.

### The real version

**A console with a publishing house attached.** Ship the machine; let holders ship the cartridges; make every cartridge a new work whose author chose permanence. Then immutability stops being liability and becomes the point: a game that can never be delisted, never patched out from under you, never lost when the storefront dies.

Start with **CHIP-8**, because Octo is MIT and 3,318 gzipped bytes, and because the CHIP-8 Archive states on its front page that its programs are placed under CC0 — 103 of them, median 2,270 bytes. Machine plus cartridge is one shard, one transaction, $1.18, and **12% of `tokenURI`'s headroom**, so it is the only tier that also fits inside the instrument's own document. *One caveat: there is no `LICENSE` file in that repository and no per-program licence field. The CC0 claim is a gallery-wide statement and a submission condition. Confirm per cartridge before inscribing. That is a morning of email, not a blocker.*

Then a **fantasy console** — WASM-4 (ISC) or TIC-80 (MIT) — where the cartridges are originals with clean title. WASM-4's spec cartridge cap is 64 KB, which is exactly one transaction's worth of shards. That is either a coincidence or the best argument anyone will ever make for a fantasy console.

Then **real consoles, homebrew only**: jsnes (Apache-2.0) at 13% of a frame, binjgb or `gameboy-emulator` (MIT/ISC) for Game Boy, mGBA (MPL-2.0) for GBA. Tobu Tobu Girl is MIT code and CC-BY-4.0 assets, verified by reading its LICENSE file. These are games whose authors want them permanent.

Two mechanisms make this defensible rather than merely arguable. **The collection ships the machine and holders ship the cartridges** — cartridge minting is a permissionless function anyone calls with their own bytes and their own gas, which moves the party who chose the bytes from you to them, on the public record. And **the licence text is inscribed as a sibling shard beside each cartridge**, so provenance travels with the work forever instead of living in a README that rots.

---

## 4. A cross-chain marketplace, with the safety measures.

**Buildable, cheaper than I expected, and much narrower than it sounds — and the contract you already have for it cannot receive a message on any real chain.**

### What is not true, first

`src/ParleyPort.sol` is written and deployed nowhere, and it cannot be deployed as written. Four faults, three of them individually fatal:

1. **Wrong selector.** `EndpointV2` calls `lzReceive((uint32,bytes32,uint64),bytes32,bytes,address,bytes)` = `0x13137d65`. ParleyPort declares `bytes calldata origin` at `:226`, giving `0x42172c88`. Driven against the deployed bytecode: the real signature reverts with empty returndata (no dispatch); the mock's signature reverts with `0x839e0a50` = `NotTheEndpoint()` (dispatched). An empty revert proves nothing was reached.
2. **No `allowInitializePath`.** `EndpointV2.verify` runs `_initializable`, which calls it when the inbound nonce is zero. Without it, `verify` reverts — so **the first packet on any lane can never be marked verified**. The sender has already paid and no retry helps.
3. **The constructor sets no config and then makes config impossible.** The header at `:81` says the constructor sets the configuration; it does not. It calls `setDelegate(address(0))`, which was already the default, and the contract has no function that can reach `setConfig`. It is pinned to LayerZero's defaults forever — and on the Unichain and Robinhood lanes that default is a single 934-byte contract whose only behaviour is to revert with *"Please set your OApp's DVNs and/or Executor"*. `quoteEcho` sums over all peers, so **`echo` would revert on every call, on every chain, forever.**
4. **The mock encodes the contract's own mistake.** `test/mocks/MockEndpoint.sol:75` hardcodes `lzReceive(bytes,bytes32,...)`. That is why 25 assertions pass against a contract that cannot receive a message.

**And the NFT must not cross.** LayerZero's `ONFT721Adapter` locks the original on its home chain and a paired contract *mints a new token* on the destination. The buyer does not receive your Ethereum NFT; they receive a different object with different provenance. Any interface presenting that as the same thing is lying to the buyer.

### What is true

Quoted live today, same 160-byte payload, same 300,000-gas destination limit:

| lane | LayerZero V2 | Chainlink CCIP | Hyperlane |
|---|---|---|---|
| Ethereum → Base | $0.069 | $0.517 | $0.143 |
| Ethereum → Unichain | **no default DVN config** | $0.483 | $0.143 |
| Ethereum → Robinhood | **no default DVN config** | **$0.561** | not tested |
| Base → Ethereum | $1.158 | $0.982 | $0.361 |
| Base → Unichain | **no default DVN config** | $0.101 | $0.150 |

**CCIP is the only transport that reaches all five of your chains.** LayerZero's default configuration reaches three.

The design that makes this affordable is a shape, not an optimisation. **Nothing crosses. The buyer receives the token on the seller's chain; the seller receives the money on the buyer's chain; the only thing that ever moves between chains is one 32-byte statement about a delivery that has already happened.** Because the message always travels from the asset's chain toward the money's chain, **a forged message can take at most one order's escrowed money and can never take an asset.**

That removes the expensive leg. Measured, both halves on the repo's harness:

| | gas |
|---|---:|
| seller lists (approve + list) | 259,821 |
| seller delivers (`fillFromAway`) | 231,782 |
| buyer commits, away chain | 116,838 |
| buyer's escrow releases (`claim`, 2 of 2) | 125,841 |
| **nothing lands** — permissionless `refund` / `reclaim` | 44,710 / 113,277 |

**Per-sale cost, Ethereum → Base: $0.560 with one witness, $0.703 with two independent transports** — against $0.416 for a purely local sale on Ethereum. The earlier estimate for this was $1.227 and $2.727, because it moved the asset on an attestation and therefore needed a round trip. It does not.

That is a **$0.29 cross-chain premium on the busiest lane**, not 22×. It is still a mechanism for expensive objects on the thin lanes — Base → Ethereum at 2-of-2 is $1.597 — and a Robinhood buyer settles on one witness or not at all, because only CCIP reaches there.

### The safety measures, and the one law

> **A market may block the forward path. It must never block the way out.**

Every escrow unwinds without anyone's cooperation: `refund` is permissionless after the buyer's deadline, `reclaim` is permissionless after the seller's term, neither depends on any bridge, and money is credited and withdrawn rather than pushed. The lesson is Multichain (July 2023, ~$126M): the bridge's "contract" was an EOA whose keys the CEO held personally, and when he was detained with his hardware wallets confiscated, the funds were simply gone — not stolen, just unreachable, because no path home existed that did not run through one person.

The rest, each traced to the incident that taught it:

| mechanism | what it prevents |
|---|---|
| Escrow, never approval | Socket ($3.3M) and LI.FI (~$10M) were both new routes passing user calldata into a low-level call against *standing approvals*. Escrow's blast radius is what people listed. |
| Per-order escrow, no pool | A forged digest takes one order. There is nothing to drain. |
| Digest computed from storage, never from an argument | The sender cannot choose what the message says. |
| Order receipt written *inside* the purchase | A receipt written by a separate call is not evidence of a purchase — every field in it is public, so anyone could claim a funded order without buying anything. Found by measuring the separate call. |
| Deadline ordering enforced from both ends, with the deadline inside the digest | A verified packet stays retryable forever, so the deadline check is the only thing that kills a late message — and the seller cannot lie about the clock to route around it. |
| Replay guard whose "unseen" state differs from its "valid" state | Nomad ($190M): an upgrade initialised trusted roots to `0x00`, which was also the value of an untrusted root, so every message proved automatically. |
| Peers immutable, endpoint checked | A port that can learn a new peer later is a port whose owner can introduce a chain nobody agreed to. This is the part of ParleyPort (`:229–232`) worth keeping verbatim. |
| Quorum size chosen by the buyer, in the event | Kelp's adapter was 1-of-1 with a single DVN. Nobody may choose a buyer's risk for them and then not tell them. |
| Rotation, behind a seven-day timelock | The Kelp remedy was rotation. ParleyPort's frozen delegate makes rotation impossible forever. Freezing is right for speech; for a market holding other people's art it is wrong. |
| Fixed price only | `src/Consign.sol:174` already says why on one chain: *"an agent who watches the mempool can raise the price into a buyer's stated value and take the difference."* Two chains cannot agree on *when* a price was. |
| Never deliver to a token-bound account on the wrong chain | `IpseityAccount.owner()` returns `address(0)` off its home chain, and `onlySigner` then compares against zero and always reverts. A Reach on the wrong chain is a permanent sink. |

**What none of it defends against, said once and not softened.** On 18 April 2026 the KelpDAO bridge lost 116,500 rsETH (~$292M) to a packet attesting nonce 308 on Ethereum for a message Unichain had never sent — the source's maximum outbound nonce was still 307. The attacker had social-engineered a developer six weeks earlier, poisoned internal RPC nodes, and DDoS'd the healthy ones. **The contracts were not broken; the verifier's view of the world was.** No audit, no invariant and no property test in this repo would have caught it. The compromised lane was Unichain → Ethereum, which is two of your five chains. Whatever ships here, the honest sentence in its README is: *the contracts are immutable and audited, and the thing most likely to break them is somebody's laptop.*

And one thing I could not verify and will not assume: the pairs in the table above are only independent if their operators, infrastructure and keys actually are. A 2-of-2 across two attestor sets that share an operator is a 1-of-1 wearing a costume. **Independence you did not verify is not independence**, and if it fails, the only defences that survive are the four that depend on nobody's honesty — per-order escrow, permissionless refund, permissionless reclaim, and the fact that no attestation in this design ever moves an asset.

---

## 5. The NFT as a GPU you can stake or mine to help render.

**No. This one does not work, and it fails on four independent grounds, any one of which is sufficient.**

**The chain cannot render.** I ported the engine's actual field — `sdTesseract`, the two rails, the twelve nodes — into Solidity fixed point and measured it, with three concessions in the EVM's favour. One `map()` call: **18,015 gas.** One pixel, weighted by the measured 26.68% hit rate: **424,127 gas.** One 512×512 frame at measured average work: **1.112 × 10¹¹ gas — six hours of the entire Ethereum network, $98,965.** A 4K frame is $3.1M. One frame each for all 4,096 tokens is 2.89 years of the whole chain.

Stated as a ratio: all of Ethereum evaluates **277.5 field calls per second**; all of Base does 11,102; one consumer GPU holding 720p60 does about 2.7 × 10⁹. **Roughly ten million to one against all of Ethereum**, and no gas-schedule change touches it, because the cost is a 256-bit integer machine emulating float32 SIMD.

**There is no work to distribute.** Every viewer's device renders that viewer's view. Demand and supply arrive together, by construction, always. And the engine's own source records that its only documented rendering fault is a *surplus*, at `engine/ipseity.html:1155–1168`: *"a capable phone sustains sixty frames at the top tier, so the ladder settles there and stays… Sustaining sixty frames and being pleasant to hold are different goals and the ladder only knew the first one. It was reported as heat."* Every fix that shipped is a throttle. A project whose rendering problem is that devices give it too much has nothing to farm out.

The two cases that look like they need help are already answered. A device with no WebGL2 gets face 1 — the SVG sigil, drawn in `int256` fixed point on chain by `Sigil.sol`. A headless indexer needs a thumbnail: measured in real Chromium on ANGLE/SwiftShader, a pure software rasteriser with no GPU at all, **1.01 s/frame at 512×512, correct and fully shaded, cold load 36 s.** One CPU covers the entire distributed-render demand.

**There is nothing bit-exact to verify.** GLSL is not reproducible across implementations — compilers reorder operands, fuse multiply-adds and use vendor transcendental approximations. Gensyn had to build a whole library to get bitwise determinism for matrix multiply, and still concede that an A100 and an H100 differ. So neither a zk proof nor a fraud proof can certify what a viewer's GPU did. Both can only certify a *fixed-point reference* render — an image that differs, in the low bits of every pixel, from what every screen actually shows.

**And the economics invert.** One frame of rented GPU time has a marginal cost of **$0.0000014**. Storing the result on Base costs **$3.02**. Disputing it costs $0.084. **The coordination is roughly a million times the compute.** There is no margin from which to pay a miner and no loss worth bonding against, because a wrong render harms only the person who commissioned it and they can detect it in sixteen milliseconds on the device already in their hand.

For completeness: none of the existing networks can take this job either. Render takes Octane and Blender scene files, and its "Proof of Render" is a reputation score. Akash and io.net rent containers with no verification at all. Gensyn's Verde is the right architecture and its runtime compiles ONNX models — there is no path for a fragment shader. Livepeer takes video segments and Docker AI runners. None of them settles anywhere a contract on your five chains could consume without a bridge and a trusted relayer.

### The nearest thing that works, and then the killjoy on that too

I built the strongest version anyway — a market where anyone posts a canonical fixed-point frame for a bounty and anyone refutes it by naming one pixel, which the chain recomputes. It is technically real: one disputed pixel verifies on chain at **4,777,566 gas worst case — 28.5% of the EIP-7825 per-transaction cap — in a 3,626-byte contract**, for $4.30 on Ethereum or $0.083 on Base. Two independent measurements of that pixel, taken under different optimiser settings, agreed to 0.6%.

Then two things killed it.

First, the version in `probe/Plate.sol` **has a fraud proof that cannot be won.** Nothing binds the posted Merkle root to the posted bytes. Post 262,144 bytes of zeroes as the frame plus a one-leaf root over a single honestly-computed pixel, and every challenge must prove against that root; the only proof that validates is the one the contract rejects as agreeing. Wait out the window and take the reward and the bond. **A broken fraud proof is strictly worse than none, because it reads as a check.**

Second, and this is what settles it: the problem the market was built for is already solved elsewhere for a sixtieth of the price. `Sigil.svg(uint256, uint256, bytes32, uint32)` is a pure function of four numbers — no hub read, no storage. **Deploy it standalone on every chain for 3,560,105 gas ($3.17 on Ethereum, $0.061 on Base) and any chain can draw any token's face from four numbers, forever, with no market, no bounty, no bond and no watcher.** That is the cross-chain thumbnail problem, closed.

**So: delete the render market. Deploy Sigil per chain.** The one real requirement it leaves behind is in §4's design — put those four numbers into the cross-chain digest so a buyer sees the face *before* they commit, not after. Details in Part Two.

---

## 6. A holder whose token serves their own shop.

**Yes — today, for ninety-four cents, with nobody's permission and no change to any deployed contract. And the collection's own website can never link to it.**

### What is true

I built it and measured it rather than describing it. A per-token shop — product list, ETH escrow, ship/refund/settle, and an ERC-5219 `request()` returning HTML with contract-chosen headers — compiles to **7,817 bytes of runtime, 32% of EIP-170**, deployed once and shared by all 4,096 tokens through an ERC-1167 proxy. It is an ERC-6551 account implementation at a second salt, so **its address is a pure function of the token id**.

| step | gas | Ethereum | Base |
|---|---:|---:|---:|
| shop implementation, deployed **once** | 1,735,578 | $1.545 | $0.030 |
| `createAccount` at a new salt, **per token** | 94,737 | $0.084 | $0.0016 |
| list a product | 135,074 | $0.120 | $0.0023 |
| buy | 144,249 | $0.128 | $0.0025 |
| serve the shop page (8 items, 2,027 bytes) | 212,295 | free — it is an `eth_call` | free |
| **whole storefront from nothing, 8 products** | 1,054,737 | **$0.94** | **$0.018** |

The ERC-6551 registry is permissionless, immutable and ownerless, so `Ipseity.sol`, `IpseityAccount.sol`, `GripVault.sol` and `Premises.sol` change by zero bytes. And the address really does become a browser origin: I probed it live, and `https://<0xaddress>.<chainid>.w3link.io/` returns 200 with the contract's own headers.

**This is where the contract-as-server argument is at its strongest, and it is stronger than the Content-Type version.** Per CSP Level 3, the `sandbox` directive and `frame-ancestors` are **ignored inside a `<meta>` element** and work only as HTTP headers. A `data:` URI can never send them. An ERC-5219 `request()` can. On a page whose primary control signs a transaction, `frame-ancestors 'none'` is not decoration.

### What is not true

**"The NFT generates their website" cannot mean holder-authored HTML.** `INSCRIPTION.md:23` already ruled that out categorically and named the reason: one origin serves every token and holds `eth_sendTransaction`. `src/Chrome.sol:279` publishes `window.IPW` on every page of the site. Holder HTML on that origin calls it directly — no exploit needed, it is the site's own API.

Per-token origins do not rescue it either, and I checked each escape:
- The gateway's **path form** `w3link.io/0xaddr:1/…` collapses every contract onto one origin, and you cannot suppress it.
- **`w3link.io` is not on the Public Suffix List.** I downloaded the 16,424-line list: `*.dweb.link` and `ipfs.w3s.link` are there; `w3link.io`, `w3eth.io` and `web3gateway.dev` are not. So cookies cross freely between tokens.
- In the reference native browser, per-token origins buy **nothing**: `evm-browser`'s `eth-provider-injected.js` is three lines that set `window.ethereum` on every `web3://` page with no origin check, and `standard: true` is commented out in its protocol registration, so there is no storage and no real origin to isolate by.
- Let's Encrypt allows 50 certificates per registered domain per week, and the gateway issues them per hostname on demand. **4,096 per-token subdomains would exhaust the public gateway's weekly budget, shared with every other web3:// user, inside about fifty stalls.**

**Shipping addresses are unsolved and I am not going to dress it up.** The EDPB's Guidelines 02/2025 on blockchain, version 2.0 adopted 7 July 2026, recommends not registering personal data on a blockchain in clear text, encrypted **or hashed** — which reaches the commitment scheme, not just the plaintext. And EIP-6780 means nothing written can ever be removed by anyone. Shirts specifically are the worst case on the list.

**And the collection cannot link to any of it.** `src/Premises.sol` is twenty `immutable` page addresses with zero setters and zero owner — `grep -cE "function set|onlyOwner|owner\(\)" src/Premises.sol` returns `0`, verified today. `Nameplate._siteFor` hard-wires the ENS record to that immutable, and `setStation` is write-once. No `/token/N/shop` route can ever be added to the deployed site. The only in-protocol lever is a new Renderer through `setRenderer`, which is a curator power — so the immutability that is this project's central virtue is exactly what stops the shop from being discoverable. That is not a bug to route around. It is the design saying that a holder's commerce belongs at a holder's address.

### The real version

**The contract writes the page; the holder supplies escaped text.** That is the same rule that makes a shader term safe, applied to commerce, and it is not a compromise — it is the better product, because a page the contract composed can inherit the token's own sigil, the token's own colour seed, and the token's own operation counter. Four thousand and ninety-six shops, no two the same colour, none of it chosen from a dropdown.

Sell what needs no address: files, licences, commissions, seats, tickets as tokens, a claim NFT redeemed elsewhere. Say on the page that fulfilment is not on chain, in the voice `GripVault.sol` and `Consign.sol` already use for their own costs: *"This contract can hold your money for thirty days and give it back. It cannot make anyone post a parcel."*

Three constraints carry over, and each was found by measuring rather than reviewing:

- **Snapshot the payee into the order at `buy()`.** The version I built pays `ownerOf` at settlement time, which lets a seller take a hundred orders, sell the token, and hand the buyer settlement rights over strangers' escrow. One `address` field removes the class.
- **Never route the escrow through the Reach.** `_act` reverts `ValueWhileSealed` on any non-zero value, so **a sealed shop cannot issue a refund.** A shop that can take money and never return it is disqualifying.
- **Credit, never push.** `src/Consign.sol:78` already states why: *"a seller whose wallet reverts on receipt cannot wedge a sale for everybody else."*

---

# PART TWO — WHAT THEY ADD UP TO

## The mechanism

Four of the six are the same thing wearing different clothes, and the fifth — the market — is the same rule applied one layer down.

> **A stranger supplies bytes. The contract supplies the machine that runs them. Nothing that came from a stranger is ever handed to a parser as markup.**

That is it. Read the six again with it in hand:

| the question | the stranger's bytes | the machine the contract supplies |
|---|---|---|
| run its code | a distance-field expression | `glCompileShader`, in the viewer's driver |
| a music player | a score | a synthesiser and an instrument table the contract shipped |
| a game emulator | a ROM | an interpreter with a cycle budget the contract wrote |
| a holder's shop | product names | the HTML the contract composed |
| a cross-chain market | *nothing* — the sender may not choose the payload | a 32-byte digest computed from the contract's own storage |
| the NFT as a GPU | — | — there is no stranger and no machine; the machine is already in every hand |

The last row is why idea five has no smaller true version. The other five have one mechanism between them, and it inverts the intuition people start with:

> **The more of a mounted thing is data, the more the runtime does with it. The more of it is a document, the less.**

A finished HTML document is the *least* composable thing a token can hold — it can only be framed — and it is also the only thing whose containment depends on a browser getting a sandbox right. A 512-byte formula is the *most* composable thing, and its containment is a property of the grammar that no browser bug can undo.

---

## The parts format

One interface, three kinds, and the list is closed. Kind numbers continue the closed table already in `INSCRIPTION.md` (1 MEMO, 2 NOTE, 3 DATA, 4 GLYPH, 5 TERM; 128–255 permanently refused so no kind arrives through a high bit).

```solidity
interface IPart {
    /// @return kind 5 TERM · 6 SCORE · 7 ROM
    /// @return body the bytes, never a URL, never base64, never a document
    function partOf(uint256 tokenId) external view returns (uint8 kind, bytes memory body);
}
// partOf(uint256) = 0xe6c05449, which is also the ERC-165 id (one function, so the XOR is itself)
```

| # | kind | body | cap | why that cap |
|---|---|---|---:|---|
| **5** | **TERM** | one GLSL expression in `q` | **512** | the cap `INSCRIPTION.md:112` already set, and the cap the gate can afford — see the budget below |
| **6** | **SCORE** | a tracker score, exactly the bytes its own parser reads | **65,536** | 604 B is 3m23s; 3,070 B is eleven minutes; the cap is the shard ceiling below |
| **7** | **ROM** | a cartridge image | **65,536** | under the 73,725-byte single-transaction wall, exactly WASM-4's spec cap, above NROM-256 (40,976) and Game Boy (32,768), below SNES |

A part contract must also be a working ERC-721 — `supportsInterface(0x80ac58cd)` true and `ownerOf` answering — so the Reach can guard it. **ERC-1155 is not a kind**, and the reason is measured: `guard()` on an 1155 lands the asset permanently in `unmeasurable()` because `_measure` calls `balanceOf(address)` while ERC-1155's is `balanceOf(address,uint256)`, and `guardNFT` reverts `NotHeld` (`0x845eadf1`). A token can hold an 1155 and cannot seal it at all. If the seal cannot promise about it, it is not a part.

**A part has no `animation_url`, and never will.** Its `tokenURI` returns a small JSON naming the kind, the digest and the byte count, and nothing to run. That is the refusal of documents made visible in the metadata, so a marketplace that *would* mount something is handed nothing to mount.

---

## The contracts

```solidity
// src/parts/Gate.sol — pure library, no state, no key, no owner
library Gate {
    uint16 constant OK       = 0;
    uint16 constant TOO_LONG = 1;
    uint16 constant BAD_BYTE = 2;   // outside the kind's alphabet
    uint16 constant COMMENT  = 3;   // "//", "/*" or "*/"
    uint16 constant EMPTY    = 4;
    uint16 constant BAD_KIND = 5;

    function term(bytes memory b) internal pure returns (uint16 why);
    function why(uint16 code)     internal pure returns (string memory sentence);
}
```

```solidity
// src/parts/Cartridge.sol — permissionless ERC-721 whose tokens ARE parts.
// No owner, no curator, no pause, no fee beyond gas, no upgrade.
contract Cartridge is ERC721, IPart {
    uint8   constant TERM = 5;  uint8 constant SCORE = 6;  uint8 constant ROM = 7;
    uint256 constant MAX_TERM  =    512;
    uint256 constant MAX_BODY  = 65_536;

    function admits(uint8 kind, bytes calldata body)
        external pure returns (bool ok, uint16 why);         // preview before you pay
    function mint(uint8 kind, bytes calldata body) external returns (uint256 id);

    function partOf(uint256 id) external view returns (uint8 kind, bytes memory body);
    function kindOf(uint256 id) external view returns (uint8);
    function sizeOf(uint256 id) external view returns (uint256);

    /// Everything one address holds, in mint order. Maintained on transfer.
    function heldBy(address who) external view returns (uint256[] memory);
}
```

```solidity
// src/parts/Stage.sol — the ERC-5219 runtime, at its OWN address.
// No storage, no owner, no setter.
contract Stage {
    IHub       public immutable HUB;
    ICartridge public immutable CART;
    IHostField public immutable H_FIELD;
    IHostScore public immutable H_SCORE;
    IHostRom   public immutable H_ROM;

    struct KeyValue { string key; string value; }

    function resolveMode() external pure returns (bytes32) { return "5219"; }
    function request(string[] memory resource, KeyValue[] memory params)
        external view returns (uint16 statusCode, string memory body, KeyValue[] memory headers);

    function benchOf(uint256 id) external view returns (uint256[] memory partIds);
    function kindOf(uint256 partId) external view returns (uint8 kind, uint16 why);
}
```

Hosts share one shape and return a **body only** — `Stage` chooses the headers, always. A host that could choose its own headers is a host that could choose its own CSP, which is the whole game.

```solidity
interface IHostField { function page(uint256 id, uint256 partId, bytes memory body)
                           external view returns (string memory); }
```

Every call `Stage` makes into a foreign address carries three things `Premises` does not need today because `Premises` calls no foreign address at all:

```solidity
uint256 private constant CALL_GAS = 2_000_000;   // a hostile view may not eat the page
uint256 private constant RET_MAX  =   131_072;   // measured before it is copied

function _ask(address to, bytes memory cd) private view returns (bool ok, bytes memory out) {
    if (to.code.length == 0) return (false, "");   // the guard viewOf() at Ipseity.sol:502 lacks
    uint256 n;
    assembly ("memory-safe") {
        ok := staticcall(CALL_GAS, to, add(cd, 0x20), mload(cd), 0, 0)
        n  := returndatasize()
    }
    if (!ok || n < 64 || n > RET_MAX) return (false, "");
    out = new bytes(n);
    assembly ("memory-safe") { returndatacopy(add(out, 0x20), 0, n) }
    // ABI header read by hand, never abi.decode
}
```

An explicit stipend, because a hostile `tokenURI` can otherwise consume the whole `eth_call` budget and turn **the outer token's own page into a 503**. A `returndatasize()` ceiling read *before* the copy. And the `code.length` guard, which the hub's `viewOf` is missing while `:292` and `:715` both carry it — so on any chain with no ERC-6551 registry, `tokenURI` reverts.

---

## The sandbox contract, stated exactly

### The alphabet, and why it is expression-only

A TERM is **one expression**, over `[a-z0-9 .,()+\-*/]` — the alphabet `INSCRIPTION.md:330` already committed to. Nothing else. No `;`, so no statements. No `=`, so no assignment. No `{` or `}`, so no scopes. No `<` or `>` or `?` or `:`, so no comparisons and no ternary.

That looks harsh until you notice what it leaves: `min`, `max`, `abs`, `clamp`, `mix`, `step`, `smoothstep`, `length`, `dot`, `cross`, `normalize`, `pow`, `sqrt`, `exp`, `log`, `sin`, `cos`, `mod`, `floor`, `fract` — every GLSL built-in is lowercase — plus swizzles, because `x`, `y`, `z` and `w` are lowercase too. **That set is exactly SDF algebra.** Distance-field combination is `min`, `max` and `abs`; it is not branches. The alphabet is not a restriction on the medium, it is a description of it.

And here is the property that follows, which is the strongest safety claim in this document:

> **There is no control flow in the alphabet, therefore there is none in the language, therefore the cost of a term is a function of its length and nothing else.**

An earlier draft used a wider alphabet admitting `;`, `=`, `{`, `}`, `[`, `]`, `_` and A–Z, and defended it with a brace-balance invariant and a keyword refusal for `for`, `while` and `do`. That invariant is genuinely good work — I attacked it and could not get a loop past it, because GLSL's maximal-munch lexing means `1.0for` is one token and comment-splitting is closed by the digraph rule. But it is unnecessary here, and the wider alphabet cost something real: full straight-line GLSL with locals, `if/else` and calls to every helper above the splice, which is how "no term can hang a GPU" stopped being true. **Excluding braces from the alphabet subsumes the brace invariant and is strictly stronger, because balanced braces still admit a nested scope and no braces admits neither.** Keep the brace check as dead-code belt if the alphabet ever widens; do not widen it.

### The three checks, in one pass

```solidity
function term(bytes memory b) internal pure returns (uint16) {
    uint256 n = b.length;
    if (n == 0)        return EMPTY;
    if (n > MAX_TERM)  return TOO_LONG;
    for (uint256 i; i < n; ++i) {
        uint8 c = uint8(b[i]);
        if (!_ok(c)) return BAD_BYTE;
        //  '/' and '*' are both in the alphabet because a distance field
        //  divides and multiplies. That makes "//", "/*" and "*/"
        //  expressible, and GLSL strips comments before it tokenises, so
        //  a comment inside the splice swallows whatever follows it in
        //  the file — measured at 269 characters against today's shader,
        //  and the amount it swallows is a function of where the
        //  collection happened to write its next comment. Refuse all three.
        if (i + 1 < n) {
            uint8 d = uint8(b[i + 1]);
            if (c == 0x2F && (d == 0x2F || d == 0x2A)) return COMMENT;  //  //  /*
            if (c == 0x2A &&  d == 0x2F)               return COMMENT;  //  */
        }
    }
    return OK;
}
```

### The prelude, which is the capability list

The lowercase-only alphabet already denies the term every helper the collection wrote — `sdTesseract`, `sdCrossPolytope`, `sd24Cell`, `sdDuocylinder`, `sdCliffordTorus`, `sdTiger`, `sdDitorus`, `sdJulia`, `vmax4`, `rot2` are all camelCase — and every `gl_*` builtin, which contains an underscore. That is a good default and an accidental one. **Make it deliberate.** A short prelude of lowercase aliases compiled into `FS_FIELD` above the splice is an explicit, readable, shader-resident grant list, and adding a name to it is the only way a capability is granted:

```glsl
float tess   (vec4 q, float r)                     { return sdTesseract(q, r); }
float cross16(vec4 q, float r)                     { return sdCrossPolytope(q, r); }
float cell24 (vec4 q, float r)                     { return sd24Cell(q, r); }
float duo    (vec4 q, float a, float b)            { return sdDuocylinder(q, a, b); }
float cliff  (vec4 q, float a, float b)            { return sdCliffordTorus(q, a, b); }
float tiger  (vec4 q, float a, float b, float c)   { return sdTiger(q, a, b, c); }
float dito   (vec4 q, float a, float b, float c)   { return sdDitorus(q, a, b, c); }
```

**`sdJulia` is deliberately not in the prelude.** It is about nine quaternion squarings per call, and a 512-byte expression can hold roughly seventy calls, and the marcher multiplies whatever it gets by about seventy-five per pixel. There is no reason to grant it and a clear reason not to.

### The splice, with shell confinement

Three edits to `FS_FIELD`, all against strings verified present today.

```glsl
/* 1. immediately before formStep(), which is at engine/ipseity.html:798 */
float partField(vec4 q){
  float e = /*TERM*/;
  //  A gradient bound is not an influence bound. `0.0` passes every
  //  Lipschitz proof ever written and makes every ray hit at t=0, which
  //  is not an ugly picture — it is the artwork gone. This wrapper is
  //  what INSCRIPTION.md:434 already called non-negotiable, and it is
  //  the difference between a term that can be wrong and a term that
  //  can be ruinous: it eats a shell and never the camera.
  return max(max(e, length(q) - R_OUT), R_IN - length(q));
}

/* 2. a ninth branch in solid(), which today runs if(i == 0) … if(i == 6)
      and falls through to the Julia at index 7. Insert before that fallback: */
  if(i == 8) return partField(q);

/* 3. formStep is today `f > 6.5 ? 0.72 : 1.0`. A field nobody can vouch
      for gets a conservative step, so an over-estimating field produces
      holes rather than a crash: */
float formStep(float f){ return f > 7.5 ? 0.40 : (f > 6.5 ? 0.72 : 1.0); }
```

**In the rebuilt engine this must be a concatenation, not a search.** Declare `FS_FIELD = FS_FIELD_A + PART + FS_FIELD_B` with a named hole. The lesson is `engine/ipseity.html:3721`, where the nest's depth counter travels as `html.replace(/depth\s*:\s*\d+/, …)` over a whole document — correct today because there happens to be exactly one match at byte 1074 of `dist/token-1.html`, and correct *by accident*. **A splice that searches is a splice waiting to match twice.**

### What the splice cannot reach, and what it still can

Enforced by the compiler, not by a check: `formStep`, `solid`, `live`, `map`, `grad3`, `march` and `main` are all declared below `partField`, and GLSL requires declaration before use. Verified — a body calling `map()` is refused with `Encountered undeclared function: "map"`.

What is still reachable and must be handled in the client, not the contract: division by zero gives `inf`, and `max(inf, …)` is `inf`, so the ray never hits and the part is invisible — safe. `0.0/0.0` gives NaN, whose behaviour under `max` is implementation-defined, so worst case is a black or noisy shell — still pixels. And **cost**, which is §1's pre-flight probe and which the gate genuinely cannot bound.

### SCORE and ROM

Neither gets an alphabet, because neither is text. Both get something better.

**A ROM is safe because the machine is an interpreter with a cycle budget you wrote.** N instructions per frame cannot hang a thread. That is a capability list you enumerated rather than a set you revoked, and it is a promise no iframe can make.

**A SCORE has no such machine yet, and this is the one hole in the ladder.** The bytes go straight into a binary parser written in JavaScript, in the same document as the wallet on the `/live` path, on attacker-controlled input. So SCORE needs a structural validator — header magic, pattern count, channel count, event ranges — run before the parser sees a byte, and generation happens in a Worker. Both are on the checklist below.

---

## The bench — and why it is not `pieces()`

The obvious design reads the mountable set from `IpseityAccount.pieces()`, since that is already the token's curated list of what it holds. It is the wrong list, and the reason is measured: `MAX_PIECES = 8` (`src/IpseityAccount.sol:336`), and `unguardNFT` reverts `IsSealed` while the piece is still held (`:355`).

So a holder who guards something valuable, seals for a year, then mints a cartridge discovers they have seven slots **for life** and cannot swap one until the seal expires. That collides head-on with the whole pitch, which is that a part is nineteen cents and disposable.

**Playing and protecting are different acts, and the seal was never asked to tell them apart.** The bench therefore comes from `Cartridge.heldBy(reach)` — an enumerable mirror maintained on transfer, roughly 20k gas in and 5k out — and `guardNFT` stays reserved for what the holder wants the seal to promise about. A holder who wants both for one part can do both; nobody is forced to spend a seal slot to hear a song.

---

## Routes and headers

The runtime serves itself, from its own address, because no route can be added to `Premises`.

```
/                                  what a part is, and what each kind may do
/t/<id>                            the bench: what this token holds that it can run
/t/<id>/field.fs                   the composed fragment shader, text/plain
/t/<id>/run/<partid>               the host page for one part
/t/<id>/bench.json                 kinds, ids, digests, sizes, refusals
/kind/<n>                          the rule for kind n, in English, on chain
/lint/<partid>                     why this part was refused, with the code and the sentence
```

`/t/<id>/field.fs` is the route worth fighting for. It serves **the exact string your GPU was handed**, as `text/plain`, for about 600 gas — so a viewer can read what compiled, diff two tokens, and check that the splice did what the page claims. It is `/token/N/raw`'s sibling.

Canonicalisation is `Premises`'s, reused verbatim: leading zeros refused, non-lowercase hex 301'd to the canonical spelling, trailing empty segment dropped, unknown leaf a 404 that never echoes the path.

**One header set, because there is only one kind of page: one whose script the contract wrote.**

```
Content-Type: text/html; charset=utf-8
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'none';
    script-src 'unsafe-inline' 'wasm-unsafe-eval';
    style-src 'unsafe-inline';
    img-src data: blob:; media-src data: blob:; font-src data:;
    connect-src 'self';
    form-action 'none'; base-uri 'none'; frame-src 'none'; child-src 'none';
    frame-ancestors 'none'
Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=(), serial=(),
    hid=(), payment=(), midi=(), display-capture=(), idle-detection=()
Referrer-Policy: no-referrer
Cross-Origin-Resource-Policy: same-origin
Cache-Control: public, max-age=15
```

Plus, on the ROM host only:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Three of those lines earn their place by measurement rather than by argument.

`'wasm-unsafe-eval'` is not optional. Measured in real Chromium: a CSP with `script-src` and without it produced a bare `CompileError` and every WASM cartridge died. **The CSP the security work demands and the emulator the owner wants collide on exactly one keyword**, and this is it.

`COOP` + `COEP` was the **only** configuration in which `crossOriginIsolated === true` and `SharedArrayBuffer` existed. A `data:` URI has no headers and a `null` origin, so `tokenURI` can never be cross-origin isolated, by construction, forever. For a threaded emulator core and a shared-memory audio ring, that is the difference between working and not.

`frame-ancestors 'none'` is header-only per CSP3 — ignored inside a `<meta>` element — which means it is a thing only an ERC-5219 contract can say. That is the contract-as-server argument at full strength, and it survives even though this design refuses the case it was originally invented for.

---

## The client

### Two decoders and one module

A thirteenth entry in the existing `MODULES` ring (today's keys are `1`–`9`, `0`, `m`, `n`), using the existing sheet, `readSig`, `account6551()`, the `guard()` error wrapper and `say()`. Two new decoders modelled on `decString`: `decBytes` (the same head/tail walk without the `TextDecoder`, because a ROM is not text) and `decIds`. One call for the bench, one call per part, only when the holder clicks it.

### The client gate is the security boundary; the chain gate is a courtesy

`partOf` is a `view`. **Any contract may implement `0xe6c05449` and return anything**, regardless of what `Cartridge` would have accepted — and the bytes reach the browser over `rpc()`, which falls through to a third-party HTTPS endpoint when no wallet is injected. So the client re-runs the entire gate on every body it receives, from every source, always, before three hard caps: length before decoding, `kind ∈ {5,6,7}`, and a read that reverts is one failed row rather than a failed page.

Two tiers of provenance, labelled: a part from the canonical `Cartridge` address is marked *the gate ran on chain*; a part from any other `IPart` contract is marked *checked only here, in this document*, and takes a second, explicit click.

**And because there are now two implementations of one grammar, there is a vector file.** `test/vectors/term-gate.json` — every accepted and refused case, exercised by `Cartridge` in Solidity and by the engine in JavaScript, asserted in `verify-instrument.mjs`. A JS gate that gets one boundary rule wrong accepts what the chain refused, and prose is not a specification.

### Mounting a field, without breaking the instrument

This is the bug that would have shipped, and it is worth stating in full because it is the kind that passes review.

The obvious mount is `L.form = 8`. Do not. `L.form` is not a display variable — it is the *committed section word*. It indexes `FORMS`, which has exactly eight entries (`engine/ipseity.html:600`); it feeds `packSection` at `:2432`; and `Types.valid()` requires `form < FORM_COUNT` where `FORM_COUNT = 8` (`src/lib/Types.sol:24,45`). So `L.form = 8` gives: a TypeError at `:1844` when the readout reads `FORMS[8].n`; a silent jump to form 1 on the next `]` because `:3832` is `(L.form + 1) % FORMS.length`; and a revert with `BadSection` if the holder presses Enter, because `txCommit` packs a word the hub refuses.

**Keep a separate `PART` state and set the uniform at draw time only:**

```js
gl.uniform1f(F.u.uFormL, PART ? 8 : L.form);
```

The same applies to the ghost. `VIS.ghost` is driven by `L.dirty` at `:1506`, so a naive mount fades the committed solid to nothing within a second — exactly backwards from the thing that makes the mount worth having. Give it an explicit hold while a part is up.

That intention, incidentally, is the best idea in this whole design and it is already written in the shipped shader. `solid()` is called twice more per march step: once at `uFormL` for the live field, once at `uFormC` for the ghost, whose comment at `:950` reads *"where the chain still believes the solid is"* and which composites at `:1047` as **the committed truth**. So: mount by pointing `uFormL` at the part and turning the ghost up, and leave `uFormC` on the token's own committed form. The stranger's field appears, and behind it, dimmer, the solid the chain still asserts.

**A mounted part is a performance, not a property.** Nothing in the metadata changes, `tokenURI` is byte-identical, and the artwork draws the distinction between what the token *is* and what the holder is doing with it, using a mechanism that already ships and is already tested.

### Thermal and input

Extend the two existing conditions from `nestUp()` to `nestUp() || partUp()` — `:1503` for the tier pin and `:1529` for the frame gate — and extend `tools/verify-thermal.mjs` to assert the same three properties for a mounted part that it already asserts for the nest. **No new thermal work exists in this design.** But the test is not optional: without it, a future engine change removes the yield silently, and that is exactly the fault this project already shipped once and diagnosed from a phone screenshot.

Say it on screen too, in one line, in the voice the engine already uses. A field that drops to 5 Hz at 64 steps and does not explain itself reads as broken.

Input collides. The global handler at `engine/ipseity.html:3906` guards `INPUT|TEXTAREA|SELECT` and then dispatches on `MODULES.find(x => x.key === k)` plus `]`, `i`, `s`, `a`, `0`, `Enter` and the arrows — which is a CHIP-8 keypad (`1234 QWER ASDF ZXCV`) almost exactly. A `closest("#partstage")` check only fires once the canvas has focus, and before the first click `e.target` is `body`. Use an explicit flag — `document.body.dataset.captureKeys` set while a part is live, checked at the top of the handler.

### Reading a stranger's token, without mounting anything

The runtime never mounts a document. It does classify data, and that is where day one comes from:

| what a held token's `tokenURI` contains | what the client does | why it is safe |
|---|---|---|
| `animation_url: data:audio/*` | `<audio src="…">` | audio bytes are data; a decoder is not a parser |
| `image: data:image/(png\|jpeg\|gif\|webp)` | `<img src="…">` | as above |
| `image: data:image/svg+xml` | `<img src="…">`, **never inline** | SVG in an `<img>` cannot run script or fetch. Inlining it is ERC-4883's mistake, described in that ERC's own Security Considerations. |
| `animation_url: data:text/html` | **a row that says what it is, and a link out** | never mounted |
| `ar://` `ipfs://` `https://` | **refuse, and print the URI verbatim** | it is genuinely held and genuinely not on chain, and the URI is the explanation |
| revert, garbage, oversize | *not answering* | the vocabulary at `:3188` |

That is a music player that plays Bleeps on day one with zero new contracts, zero isolation risk and no format anybody has to adopt.

---

## The market, in signatures

Same rule, one layer down: **the sender may not choose the payload.**

```solidity
// The seller's chain. Holds the asset. Knows nothing about bridges.
contract Berth {
    function list(address collection, uint256 tokenId, uint96 ask, uint64 until)
        external returns (bytes32 lot);
    function buyFor(bytes32 lot, uint96 agreed, address to,
                    bytes32 order, uint96 awayPrice, uint64 refundAfter) external payable;
    function fillFromAway(bytes32 lot, bytes32 order, address recipient,
                          uint96 awayPrice, uint64 refundAfter) external;
    function reclaim(bytes32 lot) external;          // permissionless after the term
    function withdraw() external;                     // pull, never push
    function digestOf(bytes32 order) public view returns (bytes32);
}

// The seller's chain. May only repeat what Berth wrote.
contract Wire {
    function quote(bytes32 order, uint32 dstEid, bytes calldata options)
        external view returns (uint256 native, uint256 lzToken);
    function speak(bytes32 order, uint32 dstEid, bytes calldata options) external payable;
}

// The buyer's chain. Counts witnesses. The only mutable thing in the system.
interface IWitness { function seen(bytes32 d) external view returns (uint64 when); }
contract Quorum {
    function setWitnesses(address[] calldata ws) external;             // onlyGovernor (a Timelock)
    function reached(bytes32 d, uint8 need) external view returns (bool ok, uint64 when);
}

// The buyer's chain. Holds the money. Knows nothing about assets.
contract Purse {
    function commit(bytes32 order, uint32 homeChainId, address berth, bytes32 lot,
                    address recipient, uint64 refundAfter, uint8 need,
                    uint256 word, bytes32 seed, uint32 strata) external payable;
    function claim(bytes32 order, address payee, address royaltyTo, uint96 royaltyAmt) external;
    function refund(bytes32 order) external;          // permissionless after refundAfter
    function withdraw() external;
}

// What ParleyPort should have been.
struct Origin { uint32 srcEid; bytes32 sender; uint64 nonce; }
contract LzWitness is IWitness {
    function allowInitializePath(Origin calldata o) external view returns (bool);
    function nextNonce(uint32, bytes32) external pure returns (uint64);
    function lzReceive(Origin calldata o, bytes32, bytes calldata message, address, bytes calldata)
        external payable;                                              // selector 0x13137d65
    function configure(bytes calldata data) external returns (bytes memory);  // onlyGovernor,
                                                                              // confined to ENDPOINT
}
```

`configure` costs about 518 bytes of runtime and is the difference between a lane that works and a lane that can never be made to. It is confined to the endpoint address, so it names verifiers and libraries and can never move a token.

The digest is computed from `Berth`'s own storage over eleven facts — source chain, market address, lot, order, recipient, payee, price, refund deadline, royalty receiver, royalty amount, **and the destination chain** — of which the away `Purse` independently holds seven from its own `commit`. A generic OApp that lets a caller send arbitrary bytes is a forgery machine; this is the same contract with the payload nailed down.

**And the face is in the digest.** `Purse.commit` takes `(word, seed, strata)` from the buyer, draws the Sigil immediately on the away chain from the local `Sigil` deployment, and hashes all three. The home chain then refuses to settle against a face the buyer did not see, enforced by the same hash that already enforces the price. Without this, a buyer on Base is asked to commit against a Unichain token they cannot render — the engine's `CHAINS` table contains 1, 10, 137, 8453, 42161, 7777777 and two testnets, and **has no Unichain, no BNB and no Robinhood entry at all.**

---

## The security fixes, as mechanisms

Every one of these was confirmed by measurement or by reading the working tree today. None is a note in prose; each is a line of code somewhere.

**In the parts runtime**

| mechanism | where | what it prevents |
|---|---|---|
| Shell confinement `max(max(e, len−R_OUT), R_IN−len)` | the splice, `partField` | `0.0` erasing the artwork. The gate cannot catch this and no Lipschitz proof can. |
| Expression-only alphabet | `Gate.term` | statements, scopes, control flow, and therefore any cost that is not a function of length |
| Digraph refusal `//`, `/*`, `*/` | `Gate.term` | a comment swallowing the shader from the splice point onward — measured at 269 characters, and the amount depends on where the next comment happens to be |
| Lowercase prelude as the grant list, `sdJulia` excluded | `FS_FIELD_A` | ~70 expensive calls × ~75 evaluations per pixel |
| Pre-flight 64×64 timing probe before mount | client | a GPU watchdog trip, which loses every WebGL context in the browser |
| Shared vector file, both gates | `test/vectors/term-gate.json` | two implementations of one grammar drifting apart |
| `PART` state separate from `L.form`; explicit ghost hold | client | `FORMS[8]` TypeError, silent form reset, `BadSection` revert on commit |
| Bench from `Cartridge.heldBy`, not `pieces()` | `Stage.benchOf` | a sealed token permanently down to seven playable slots |
| Structural SCORE validator ahead of the parser; Worker generation | `HostScore` | a JS binary parser on attacker bytes in a document with a wallet |
| `captureKeys` flag on `body` | client | module hotkeys firing mid-game |
| Splice by concatenation, never by search | `build-engine.mjs` | the second match that does not exist yet |
| Stipend + `returndatasize` ceiling + hand-sliced ABI on every foreign call | `Stage._ask` | one hostile `tokenURI` turning your own page into a 503 |
| `code.length` guard on every registry-derived address | `Stage._ask`, and `Ipseity.viewOf` | `tokenURI` reverting on a chain with no ERC-6551 registry |

**In the market**

| mechanism | what it prevents |
|---|---|
| Re-read `ownerOf` after every `transferFrom` in `list`, `buyFor` and `fillFromAway` | a collection that answers every call and moves nothing. The repo already found this and deleted the attack fixture without adding the check. ~2,600 gas on a 231,782-gas call. |
| Royalty only when `collection == HUB` | `royaltyInfo` charging IPSEITY's royalty on a Bored Ape listed by its id |
| **Delete the rate limiter** | a five-dollar attack: burn the global eight-per-hour budget in the last hour before a deadline, and the seller who has already delivered can never claim. A limiter that blocks a forward path which *expires* is a limiter that closes the way out. |
| `Quorum.reached` returns the **need-th** timestamp, not the first | a 2-of-2 settling one second before the buyer's refund unlocks, because the first witness landed ten days early |
| Destination chain inside the digest | one delivery releasing escrow twice, on two chains where `Purse` sits at the same CREATE2 address |
| 100,000-gas stipend on each witness staticcall | a witness that burns the budget leaving 1/64 for `claim` — a claim-only denial of service that `refund` is immune to |
| `need` bounded by the live witness count in `commit` | a buyer choosing a quorum that can never be met, and locking their money until it refunds |
| `MAX_WINDOW = 5 days` < `Timelock.DELAY = 7 days`, **asserted in a verify script** | a malicious witness rotation landing on an order that was live when it was queued. The prototype ships 30 days; the property is only a property when the test holds it. |
| Snapshot the payee at `buy()` in `Stall` | selling the token selling a hundred strangers' escrow |
| Linear `_quote` in `Renderer` | `abi.encodePacked` in a loop — 504,667 gas at 675 bytes, 172,956,034 at 4,096 |
| Per-transaction gas assertion in `tools/evm.mjs` | CI passing at 5.4M-gas shards while mainnet reverts at four of them, because the harness pins a 400M block limit and Cancun and cannot see EIP-7825 |

---

## The byte budget

**Against EIP-170** — every contract fits, individually, with room:

| contract | runtime bytes | % of 24,576 |
|---|---:|---:|
| `Stage` + `Gate` (estimated, calibrated on measured siblings) | ~9,000 | 37% |
| the three hosts (estimated) | ~10,000 | 41% |
| `Cartridge` (measured base 6,465, plus the enumerable mirror) | ~7,000 | 28% |
| `Stall` (measured) | 7,817 | 32% |
| `Berth` (measured) | 6,177 | 25% |
| `Purse` / `Wire` / `LzWitness` / `Quorum` (measured) | 3,079 / 1,771 / 1,563 / 1,382 | 13 / 7 / 6 / 6% |
| `Sigil`, which already exists | 14,477 | 59% |

The entire settlement layer is 22,869 bytes — **93% of one shard.** That is the honest measure of how much of this problem is code and how much is other people's infrastructure.

**Against `tokenURI`**, which is the ceiling that actually binds. The engine grows by exactly three things:

| | gzipped, stored |
|---|---:|
| engine today (re-measured) | 41,063 |
| + parts module, splice, prelude, gate mirror, decoders, pre-flight probe *(estimate — the one unmeasured number here)* | ~1,450 |
| + SoundBox player + presets | 2,438 |
| + Octo CHIP-8 core | 3,318 |
| **all three kinds** | **48,269** |

Against the measured curve, that is **about 23.9M gas for `tokenURI`, 48% of a default 50M node.** FIELD alone is 21.3M — a 2.2% increase over today. The real ceiling is roughly **+62,000 stored bytes**, so all three kinds spend about 12% of it.

**And the part bytes never enter `tokenURI` at all.** A 65,536-byte ROM costs zero document bytes, because it is read by `eth_call` at runtime. That is the entire architectural difference between this and every "put the emulator in the token" proposal: the machine ships once and is shared by all 4,096 tokens through a mechanism the collection already uses for its own engine.

One thing that does not change, said plainly: the engine already fails on a cautious 10M-capped hosted RPC, and it still will afterwards.

**Deployment, per chain, everything:**

| | gas | Ethereum | Base | Unichain |
|---|---:|---:|---:|---:|
| `Cartridge` + `Gate` | ~1.60M | $1.42 | $0.028 | $0.002 |
| `Stage` + three hosts + payload blobs | ~11.0M | $9.80 | $0.190 | $0.013 |
| `Sigil` standalone | 3.56M | $3.17 | $0.061 | $0.004 |
| new `Engine` (3 shards) + `Renderer` | ~15.6M | $13.90 | $0.269 | $0.019 |
| the market (`Berth`+`Purse`+`Quorum`+`Wire`+witnesses) | ~8.2M | $7.29 | $0.141 | $0.010 |
| **everything, one chain** | **~40M** | **$35.58** | **$0.69** | **$0.048** |

All five chains, everything: roughly **$37**, most of it Ethereum.

**A holder mounting one field:** mint 381,076 + transfer 59,159 = **440,235 gas, $0.39 on Ethereum, $0.008 on Base.** Reading it back, forever, on any node: 6,351 gas, free.

---

# PART THREE — THE ORDER

## Step 0 — the preconditions, none of which is negotiable

None of these is hygiene. Each is a thing that makes something below it either safe or possible.

**0a. Wire `src/lib/Timelock.sol` to `Ipseity`.** `setRenderer` (`src/Ipseity.sol:1025`) is `onlyCurator` with **no delay**, and `Timelock.sol` is referenced nowhere in `Ipseity.sol` — verified today. Everything in this document reaches the instrument through exactly one lever, and that lever is currently one stolen key away from arbitrary script on the collection's own origin. `Ipseity` already carries the two-step transfer this needs and `tools/verify-timelock.mjs` already tests the queue: three transactions and a week, no contract changes, nothing redeployed. Audioglyphs is what the same shape of authority looks like afterwards — 10,000 "fully on-chain" audio NFTs pointing at a free-tier Heroku dyno, one `setBaseUri` away from pointing somewhere else.

**0b. Add `sandbox="allow-scripts"` to `src/DeskTalk.sol:330`,** which today builds `f.src='/token/'+t+'/live'` with **no sandbox attribute at all**. It is inert only because every token's `/live` comes from the same renderer — which is to say, it is inert only until 0a is false. The two findings chain, and this one closes the chain independently. It costs a full site redeploy, so bundle it; with 0a in place it is no longer urgent.

**0c. Delete `allow-same-origin` from `engine/ipseity.html:444`.** Measured in real Chromium: with both flags the inner document reached `parent.document` and **removed the `sandbox` attribute from its own frame** — byte-identical to writing no sandbox at all, and Chromium logs the warning itself. With `allow-scripts` alone: `parentDOM=blocked`, `canUnsandboxSelf=no`, and `wasm=5` and `AudioContext` both still work. It costs the design nothing and converts an inert attribute into a real boundary.

**0d. Rewrite `Renderer._quote` linearly.** It is `abi.encodePacked` in a loop — 504,667 gas at 675 bytes and 172,956,034 at 4,096. Anything that serves a longer string is blocked on it.

**0e. Assert the per-transaction gas cap in `tools/evm.mjs`.** The harness runs with a 400,000,000 block limit and pins Cancun, so **it cannot see an EIP-7825 violation.** At 24,575-byte shards you are at 5.4M of a 16.78M budget: three fit and four revert on mainnet, and CI passes either way.

**0f. Check the ERC-6551 registry exists on every target chain before deploying.** `Ipseity.viewOf` calls `account(id)` with no `code.length` guard while `:292` and `:715` both have one, so `tokenURI` reverts wherever the registry is absent. The canonical registry is live at `0x000000006551c19487814612e58FE06813775758` on mainnet; one script per chain, run first.

**0g. Add 130, 56 and 4663 to the engine's `CHAINS` table and give `rpc()` an explicit chain argument.** Today the engine cannot read Unichain, BNB or Robinhood at all, and only ever talks to the chain the wallet is on. Nothing cross-chain is *visible* until this is true.

## Step 1 — `Cartridge` + `Gate`, TERM only, one chain

$1.42 to deploy, $0.19 per part, no hub change, no `Premises` change, no ENS change, nobody's permission. This is the smallest complete thing: the format exists and people can mint into it before anything renders it.

It is first because it is the only step whose safety is a property of a grammar rather than of somebody else's software, and because it is the cheapest possible test of the only question this whole document cannot answer: **does anyone mint one?**

## Step 2 — `Stage` + `HostField`, at its own address

Serves `/t/<id>`, `/t/<id>/field.fs` and `/kind/5`. Its own gateway subdomain, its own origin, its own headers. Still no engine change, so still no renderer swap and no risk to anything shipped.

## Step 3 — the engine, and the day-one player

The splice with shell confinement, the prelude, the separate `PART` state, the pre-flight probe, the bench from `heldBy`, the vector-file gate in JS, the thermal conditions extended and asserted — **and the read-and-classify player**, which needs no new contract and makes Bleeps play on day one.

New `Engine` and `Renderer`, `setRenderer` through the timelock from step 0a. This is the release where "the NFT compiles code" becomes literally true, in the viewer's driver, with no on-chain compiler anywhere. Extend `tools/glsl-check.mjs` to check the *composed* shader with a sample part — `tools/probe-splice.mjs` is already the prototype.

**Then stop and look.** Steps 4 through 6 cost roughly a dollar each in gas and several weeks in code, and the only thing that justifies any of them is a corpus of TERM parts existing.

## Step 4 — SCORE

`HostScore`, +2,438 gzipped bytes, the structural validator, the Worker. The first kind that makes sound.

## Step 5 — `Stall`, per token

$0.94 to stand up. Digital goods only. Payee snapshotted at `buy`, escrow never routed through the Reach, credit-and-withdraw rather than push, and a sentence on the page saying what the contract cannot do.

## Step 6 — ROM

`HostRom` with Octo first, one shard and $0.53 per cartridge, COOP/COEP on that host only. **This is the cut line.** If the byte budget or the schedule bites, this is what goes: kinds 5 and 6 are complete without it, and the CC0 licence check is an email per cartridge that has not been sent.

## Step 7 — `Berth` alone, five chains

$1.26 per chain, no messaging at all. It is immediately useful on its own merits: it does something `Consign` structurally cannot (`Consign.buy` delivers to `msg.sender`, so no filler can ever buy for someone else), it is cheaper end to end (467,766 gas against 570,672), and every sale calls `HUB.record` while the market is the owner — so **the trade turns the solid.** Not a badge, not a star rating; geometry, on chain, unfakeable without paying for it.

## Step 8 — `Sigil` standalone, five chains

$3.17 on Ethereum, $0.06 on Base. Cross-chain identity, solved, for the price of a deployment. Do this **before** any cross-chain sale is possible, not after — it is what makes step 9 something a buyer can look at.

## Step 9 — `Quorum` + `Purse` + the CCIP witness

One witness, chosen by the buyer, in the event. CCIP because it is the only transport that reaches all five chains. Honest, cheap, and clearly labelled as one.

## Step 10 — `LzWitness` + `Wire`, on the three chains LayerZero serves

2-of-2 on the busy lanes, with `configure` naming DVNs explicitly through the timelock **before the first sale**. Hyperlane after that, and only after a real end-to-end delivery test per lane: a successful `quoteDispatch` proves the source gas oracle has an entry for the domain; it does not prove a relayer serves the route.

## Step 11 — a new `Premises`

Carrying `/token/N/parts` and `/market`, executed through the timelock, ENS `contentcontract` repointed. This is the single privileged act and it is last, because until then everything lives at its own `web3://` address and works.

---

## What is deliberately never

**Mounting a stranger's finished HTML document.** Not with `sandbox="allow-scripts"`, not with a `Content-Security-Policy: sandbox` header, not in an opaque origin, not once. It is the only mechanism in this document whose worst case is a holder losing money rather than seeing an ugly picture, and it is the only one whose containment depends on a browser being right — which the one browser that speaks `web3://` natively demonstrably is not. It also buys the least: a picture frame. When a held token is something the runtime does not understand, the honest answer is a row that says so and a link out. That is the decision `src/Console.sol:27–50` already recorded after a phone screenshot, months before any of this was written.

**`DELEGATECALL` in the Reach.** The restriction at `IpseityAccount.sol:726` is the seal's foundation, not an oversight.

**A bridged NFT.** The buyer receives the token on the seller's chain or the sale does not happen.

**`ParleyPort` as written.** Not a redeploy — a rewrite, and the mock has to be fixed too, or the suite goes on passing.

**SNES, and any commercial ROM.** §117(b) forbids it, the Copyright Office refused the preservation framing in writing in October 2024, Snes9x's licence forbids the emulator independently, and EIP-6780 means the inscription can never be undone.

**The render market.** Its fraud proof cannot be won, what it would certify is an image no screen displays, and `Sigil` per chain solves the problem it existed for at a sixtieth of the price.

**ERC-1155 as a kind.** If the seal cannot promise about it, it is not a part.

**Physical goods, and anything needing a shipping address.**

**A price that changes across a message, and arbitration of any kind.** Two chains cannot agree on when a price was, and there is no dispute resolution without an oracle or a key — both of which are the thing this architecture exists not to have.

**A compiler on chain.** 8 MiB of working memory alone is 135,004,160 gas of expansion — and post-Fusaka the binding wall is not the 60M block but the 16,777,216-gas per-transaction cap, which is 3.6× lower. The compiler in this system is the one in the viewer's driver, and it always was.

---

## The honest weakness

**Everything above proves that a stranger's field cannot hurt the viewer. Nothing above proves that anyone wants to write one — and the mount is deliberately invisible in every venue where value is discovered.**

`tokenURI` is byte-identical whether a part is mounted or not. The `image` stays the on-chain SVG; the attributes do not move; the thumbnail a marketplace caches is exactly what it was. That is the right call — `Sigil.sol` computes the still in `int256` fixed point on chain and cannot evaluate GLSL, so a still that showed a part would assert something the contract cannot compute. It is also the entire incentive structure of this asset class pointed the wrong way. People do not buy traits; they buy the picture on the listing page. This is a composition system whose output appears only to someone who opens the live instrument, connects to a chain, opens a panel and clicks. That is not a small friction. It may be the whole of it.

The coordination problem underneath is the one that left ERC-998 in Draft for eight years and one month with its own Security Considerations reading "Needs discussion," and ERC-4883 in Draft for four and a half. ERC-5773, ERC-6059 and ERC-6220 are all *Final* and all still niche. Three technically sound composability standards; none failed on engineering.

The argument on the other side is Ordinals, and it is a large one. Recursive inscriptions turned a corpus of finished pictures into a library of *parts* within about six months of shipping, because `/content/<id>` made addressing so cheap that people started minting parts on purpose. `Cartridge.mint` at nineteen cents is cheaper than that, and it asks no standards body for anything: four thousand and ninety-six holders who **already own a renderer** discover they can mint a formula for the price of a coffee and see it come alive in an instrument someone else built. That is a far lower bar than ERC-998 ever faced. If it clears, the caution here is wrong and the answer to question one is simply yes.

Two smaller weaknesses I will not hide behind that one. **The client gate is the real security boundary and it ships inside the one artefact a single key replaces in one block** — the timelock at step 0a makes that swap visible for seven days rather than impossible, and I am using the exact lever whose weakness I am mitigating. And **the one estimated number in the budget is the size of the engine's own parts module.** Everything else was measured. If it comes in at three times my estimate the FIELD-only release still fits comfortably; if all three kinds do, the ROM is the cut line and that is why it is last.

If nobody mints a part, this cost about $37 and one renderer swap to add fourteen hundred gzipped bytes that nothing calls, and the honest answer to the first question collapses back to what the Reach already did for free before any of this: **it holds things.**