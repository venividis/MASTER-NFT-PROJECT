# Research → implementation, iteration 1.2

This iteration investigated a specific failure: changing a successful optical presentation into an inspectable line diagram. The research target was **how to retain atmosphere while making the underlying state and actions more useful**, not accumulating names of NFT standards. Graphics work and blockchain claims are deliberately separated below.

## 1. Procedural distance fields and repeated folds

Primary sources: Inigo Quilez, [Raymarching Distance Fields](https://iquilezles.org/articles/raymarchingdf/), [Geometric orbit traps](https://iquilezles.org/articles/ftrapsgeometric/), and [Distance estimation for fractals](https://iquilezles.org/articles/distancefractals/).

The useful principle is that a procedural field can couple form, microstructure and shading without external meshes or textures. Orbit traps measure properties of a repeated trajectory and need not be limited to escape-time coloring. The original v1.0 implementation already contained repeated absolute-value/inversion folds and an orbit-trap-like minimum. That contribution was preserved, not replaced with a line mesh.

**Code:** `render/original.frag` is the exact original fragment source; `web/reference/original.html` is the exact original standalone artifact. `render/field.inc::originalTrap` retains its eight-fold construction as a lighting microstructure. The new default is a distinct artistic extension, not a claim that the original shader is still the complete main renderer.

**Limit:** the new field is not an exact signed-distance surface, and the renderer does not claim mathematically guaranteed sphere tracing. It samples a bounded participating medium.

## 2. Emission, absorption and atmospheric hierarchy

Primary source: NVIDIA GPU Gems 3, [Chapter 13 — Volumetric Light Scattering as a Post-Process](https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process).

The relevant lesson is to treat atmosphere as a substantial part of perceived form rather than a line decoration. The implementation here is not a copy of that chapter's screen-space method. It integrates a small, bounded sequence of procedural density samples front to back:

```text
opacity_i = 1 - exp(-density_i * step_length * extinction_scale)
color += transmittance * opacity_i * emitted_color_i
transmittance *= (1 - opacity_i)
```

**Code:** `field.inc::radiance` combines an 18-sample bounded integration with a nucleus, corona, domain-warped filaments, restrained diffraction and a dark outer falloff. Color exposure prevents ordinary bright regions from immediately clipping to white. Genome/state values affect form and spectrum. Distinct event parameters produce evolving disturbances, a memory hue, a descendant jet and an Ascension contraction.

**Limit:** the appearance is art-directed. It is not a physically accurate plasma, multiple-scattering solution, neural renderer, or simulation of consciousness. Rendered color is not itself proof of any blockchain property.

## 3. One field, two execution backends

Primary sources: MDN, [WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices); Khronos, [Handling Context Lost](https://wikis.khronos.org/webgl/HandlingContextLost) and [WEBGL_lose_context](https://registry.khronos.org/webgl/extensions/WEBGL_lose_context/).

A fallback that changes the artistic vocabulary is not equivalent visual continuity. This release uses a common scalar/vector field source compiled into GLSL and C/WebAssembly. The Wasm module has a fixed buffer, bounds-checked sizes, and pure math imports. Workers evaluate disjoint row ranges; the host composites the completed field into Canvas. It is not a second diagrammatic renderer.

**Code:** `render/field.inc`, `field.c`, `scripts/build-field.mjs`, `web/renderer.js`. Auto quality lowers backbuffer size instead of replacing the object. Context loss is reported; resources are rebuilt on restoration. Reduced-motion and hidden-page handling constrain autonomous motion. WebGL is requested normally, never forced around browser policy.

**Evidence:** six native GLES/Wasm comparisons use identical input values. The recorded maximum RGB-channel difference was one level out of 255 in these samples. Four row tiles also exactly match a full Wasm frame in a separate test. This supports tested numerical correspondence, not all-device bit identity.

**Limit:** this browser environment did not provide WebGL; browser checks used the actual embedded Wasm renderer. Native GLES is a separate graphics test, not proof that every browser-GPU path works. Wasm computation is slower than the presentation loop; field interpolation must not be marketed as 60 independently evaluated frames per second.

## 4. Fourth-coordinate exploration without changing identity

The view introduces a fourth coordinate derived from position, rotates the x/w pair, and evaluates the existing field with the resulting x component. This is an art-directed higher-coordinate deformation. Drag/orbit/zoom and the fourth-coordinate parameter are view state, separate from genome and authority state.

**Code:** `field.inc` computes `x' = x cos(theta) - w sin(theta)` with `w = 0.35 sin(2y + clock)`. The unchanged fourth component is not a hidden physical world. The interface calls this a fourth-coordinate slice, not quantum behavior or evidence of extra dimensions. The browser regression verifies that the view operation does not change the identity's audit head.

## 5. Sound as optional state feedback

Primary sources: MDN, [Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) and [Autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).

The optical body must succeed without sound. Audio is a supplemental mapping: opt-in oscillators, limited gain, event notes, explicit mute and background suspension. No microphone is requested.

**Code:** the useful v1.1 audio module is retained. Its genome mapping is a small musical palette, not a unique cryptographic voiceprint. A many-to-one perceptual mapping should not be confused with a hash commitment.

## 6. Wallet integration that does not convert labels into claims

Primary source: [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193).

The provider standard makes chain/account changes explicit and recommends treating the provider as untrusted. The important consequence is that a previously prepared transaction is not automatically valid after a wallet change.

**Code:** `web/evm.mjs::TestnetClient` has no account-request side effects in its constructor. Connect is explicit. It permits only local chain 31337 and the two listed public testnets. Plans bind chain, source account and client revision. Simulation precedes review; chain/account are rechecked and the call re-simulated before submission. Account, chain and disconnect events invalidate prepared state. A successful receipt and matching block identity precede visual chain-state refresh. Unknown/reverted/pending states are not converted into success.

**Evidence:** mock-provider tests cover these state-machine properties. They are not live-wallet or EVM tests.

**Limit:** an RPC response remains trusted data at this layer. There is no light client, audited transaction decoder, guaranteed gas quote, finality proof or production-wallet certification. Native value is zero for exposed writes but gas is still spent. Mainnet is intentionally blocked by the client.

## 7. Independent hashing rather than self-agreement

Primary source: the [Keccak Team's XKCP](https://github.com/XKCP/XKCP), specifically [readable C implementation](https://github.com/XKCP/XKCP/blob/master/Standalone/CompactFIPS202/C/Keccak-readable-and-compact.c), source blob `b8932ecb6a2455341cea192f3e6cb12295170944`.

Ethereum Keccak-256 and FIPS SHA3-256 have different domain padding. A test comparing two calls to the same JavaScript function is not independent evidence. A compact CC0-attributed adaptation of XKCP is compiled natively and evaluated against the browser codec for 22 message lengths, including either side of the 136-byte rate boundary and multiple blocks.

**Evidence:** `reports/keccak-reference.json` records expected/actual digests. Known selectors and manually specified ABI offsets provide additional checks. This does not constitute an audit of the ABI codec or the contracts.

The codec deliberately supports only the subset used here (fixed-width unsigned integers, nonzero addresses, bool, fixed/dynamic bytes, UTF-8 strings, flat static tuples). It is not a replacement for a general ABI library.

## 8. Token accounts and ownership transitions

Primary source: [ERC-6551](https://eips.ethereum.org/EIPS/eip-6551). The research protocol uses a custom deterministic account factory, not the canonical registry and proxy format required for full ERC-6551 compliance.

Inspection found two local implementation gaps: the Bound evolution route did not synchronize account roots before the collection's check, and ordinary token transfer did not invalidate account sessions. Both received source-level revisions plus new regression assertions. Their reasoning and deployment incompatibility are documented in `PROTOCOL-CHANGES-1.2.md`.

**Limit:** the complete Solidity suite could not start because `solc` was unavailable. These changes are not certified fixes. There is no independent audit, formal proof, mainnet deployment, live SP1/RISC Zero proof generation, transport-authenticated omnichain adapter or verified autonomous AI in this release.

## 9. A narrower, honest definition of memory and proof

A local receipt book lets a reader recompute its state transitions. It does not authenticate the author: an entirely rewritten book can also be internally consistent. A salted memory hash records a trace; disposing of text and salt means the thought cannot be recovered from this application. It is not encrypted transferable agent memory.

The renderer takes a presentation vector derived from all 32 bytes of each source commitment. This reduces the data to four numbers for graphics, and is not collision-resistant identity. The full original commitments remain the source for actual comparisons and exported records.

The full browser client has not been stored onchain. The separate inherited onchain SVG renderer must not be confused with this WebGL/Wasm application.

## Decision rule retained for later work

The approved artifact remains in the release as a reference. Future changes must be examined at comparable viewport sizes and states, with honest backend labeling. Behavioral test counts do not establish artistic quality. Any claim that the new result is more compelling remains an aesthetic judgment for the user, not a unit-test outcome.
