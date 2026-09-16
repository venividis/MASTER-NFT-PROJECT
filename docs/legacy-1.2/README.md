# i dont fucking believe it!

## 1.2.0 — Optical field + explicit testnet client

**Open `preview.html`. The first view needs no wallet, installation, media downloads, or server.**

The instrument-panel composition is back. The center is a full-screen volumetric light field, not a wireframe. Original v1.0 is preserved **byte for byte** under **ORIGINAL V1.0** so comparison does not depend on memory or a release description.

The new default renderer is not identical to v1.0: it incorporates the original eight-fold orbit-trap construction into a new bounded emission/absorption field with a luminous core, atmospheric halo, colored filaments, and action-specific disturbances. Its GPU and CPU versions share the same field source. It is art-directed procedural rendering, not a physical plasma simulation.

### What is delivered

| Surface | Implementation | Execution boundary |
|---|---|---|
| Optical experience | GLSL + embedded WebAssembly; parallax, orbit, zoom, fourth-coordinate slice, adaptive quality, reduced motion | Rendered locally. Browser-GPU end-to-end testing remains outstanding. |
| Local identity | Deterministic genome and state, hash-linked history, export/import, read-only replay | Unsigned browser state, not a minted NFT or authenticated proof. |
| Memory | Salted commitment, spectral layer, editor disposal | Text and salt discarded; not an encrypted notebook. |
| Descendants | Inherited genome record, amber satellite, enterable read-only child | Local records in preview; explicit testnet mint path available separately. |
| Ascension | Local rule change and visual transition; separate reviewed testnet transaction path | Irreversible within an identity. Real contract Ascension can make an NFT unusable without a valid prover. |
| Sound | Gesture-started synthesis derived from genome, mute, background suspension | No microphone, model inference, hosted audio, or autoplay. |
| Wallet client | EIP-1193 requests, ABI encoding, simulation, gas estimate, explicit review, submitted/included/reverted handling | Tested with a mock provider; no real wallet transaction was broadcast during this release. |
| NFT research protocol | Original contract architecture plus Bound evolution and transfer-session fixes | Revised Solidity not compiled in this environment; not audited or production-ready. |

### Explore

Move the pointer across the field, then drag to orbit and scroll to approach. **Evolve** changes the genome and field structure without a blocking progress dialog. **Fold space** sweeps the fourth coordinate; it does not modify ownership or the genome. **Seal memory** changes a commitment and its spectral presentation. **Spawn** creates a child that can be entered. **History** returns to prior forms without rolling back the present. **Immerse** hides the panels; **Restore controls** brings them back. Sound is optional.

**QUALITY** cycles Auto / Detail / Economy. The Wasm fallback is computationally slower than a capable GPU: Auto uses a smaller framebuffer and crossfades completed fields. The status line reports measured field time, not an invented 60 fps claim. Detail favors sharpness. Export a portrait or local receipt book from the panel.

The default preview uses a fixed, art-directed genesis for reproducible first impressions. **More → New preview** creates a new random local identity after confirmation. Neither action mints anything.

### Run / verify

Node.js **22** is recommended. Preview and local tests have no npm dependency installation requirement:

```sh
npm run demo              # http://127.0.0.1:4173
npm run validate:ui       # builds preview + runs local model, codec, mock-provider, field and server tests
node scripts/verify-study.mjs reports/browser-export.json
```

Recompile the shared field with Clang supporting wasm32:

```sh
npm run field:build
npm run ui:build
```

Optional independent checks:

```sh
node test/reference/crosscheck.mjs   # requires a C compiler
python test/browser/optical_browser.py  # requires Playwright, Chromium and Pillow
python test/visual/field_parity.py      # requires EGL/GLES, NumPy, Pillow; run browser capture first
```

Read [recorded validation](reports/VALIDATION.md) for the actual results and exclusions. `npm run report:release` only hashes files; it never certifies tests.

### Connect a development deployment

The interface defaults to preview and does not silently become a connected dApp when a deployment file exists. **Connect** requires a wallet, an actual collection address, and token ID. Allowed chain IDs are **31337, 11155111, 84532**. Mainnet and unknown chains are rejected. Every write sends **zero native value**, but still incurs testnet gas.

The client supports reading a token, two-step commit/reveal minting, Bound-mode evolution, Bound-mode descendant minting, metadata commitments, Ascension, and importing an externally produced proof for a prepared Sovereign evolution. It does not generate zkVM proofs, manufacture threshold signatures, or provide an owner bypass after Ascension. The more general account/agent APIs remain separate research components.

**Do not connect real-value accounts or use this release as a production wallet.** Read [testnet deployment](docs/DEPLOYMENT.md), [security](docs/SECURITY.md), and [protocol revisions](docs/PROTOCOL-CHANGES-1.2.md). Existing v1.0 immutable deployments do not gain the new Bound method automatically.

### Source map

```text
web/                        Interface, local model, audio, provider client
web/reference/original.html Exact original v1.0 standalone artifact
render/field.inc             Shared optical field; GLSL/C source
render/field.c               Bounded Wasm renderer
render/original.frag         Exact original fragment shader
contracts/src/               NFT, deterministic accounts, verifiers, renderer, witnesses
agent/                      Inherited local MCP/A2A-style policy service
proof-kernel/               Inherited Rust policy evaluator
scripts/                    Build, serve, deploy and verification tools
test/                       Local checks, mocked wallet tests, browser and native graphics tests
reports/                    Actual logs, screenshots, hashes and scope-separated results
```

The canonical onchain SVG renderer is separate from this browser application. This full WebGL/Wasm interface has **not** been stored onchain. The custom account factory is ERC-6551-inspired, not the canonical ERC-6551 registry. Agent and witness adapters have deployment-specific trust requirements. See [research and boundaries](docs/RESEARCH-1.2.md).

MIT for project code; the independent Keccak reference retains the Keccak Team's CC0 attribution. No production keys or private credentials are included. Historical documents under `docs/archive/` are not release validation.
