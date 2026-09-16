# Anima Genesis 5.3 — within the mathematical field

The approved visual study is now the navigable interior. This release implements the visual approval only. The recent-crypto recommendations remain proposals; no payment protocol, bridge, privacy system or autonomous spending capability was added.

## What changed

The former architectural distance field and perspective-line fallback have been replaced by perspective integration through the blue object's procedural optical medium. No image textures, separate room meshes or unrelated noise generator are used.

| Interior behavior | Source |
| --- | --- |
| Cloud density and fine veils | Original four-octave noise, genome anisotropy, extinction coefficient 2.7 and local sample transforms |
| Identity | The same seed, genome, root and sovereign state uploaded to the exterior |
| Lived form | Existing life0/life1 traits; the original image-plane warp is continued through the volume |
| Time and unfolding | The original renderer's clock, fold and view orientation |
| Corona | Spatial continuation of the existing cloud, spectrum and inversion-fold terms |
| Central light | Spherical deprojection of the exterior's Gaussian and inverse-quadratic radial source |
| Event and audio response | Existing event/pulse state and optional measured audio amplitude modulate light |
| Camera | Perspective rays intersect a radius-1.24 sphere; free flight stays within radius 1.08 |

`render/living/field.inc` and its generated exterior shader are unchanged. Their SHA-256 hashes are `f482cf1e667c7a0714aa7c65fd92db11a4941cfa677da2757354d864116ad03f` and `0357ac3d63729deff28c0a4a19ff769852a6f9b823effdda79b5a980806df194`, respectively.

The interior is an authored spatial continuation, not a claim that a two-dimensional image uniquely determines a three-dimensional object. The original corona and nucleus were screen-space terms. The approved design lifts them into space; the finite boundary, perspective, absorption and exposure affect their projected appearance. An infinite, optically thin orthographic integral of `A sqrt(37/pi) exp(-37r²)` recovers `A exp(-37R²)`, and the integral of `.0026 / (2(.009+r²)^(3/2))` recovers `.0026 / (.009+R²)`.

The first 16% of entry blends the preserved exterior projection into the spatial exterior view. The remaining journey moves the camera through the same sphere. Return reverses this path from the current viewpoint. Eight destinations still open the inherited instruments. Names describe locations and uses rather than physical rooms.

## Controls and rendering

Drag to look; W/A/S/D move relative to the camera, Q/E descend and rise, arrows turn and look, and Shift moves faster. Touch controls and a guided journey remain available. **Pause motion** freezes automatic field motion and touring; reduced motion skips automatic camera transitions. **Hide controls** leaves the field unobstructed while retaining return, sound and the control toggle. Escape returns to the object and restores focus to its entry control.

The GPU uses 64, 112 or 192 ray samples, depending on quality, with bounded rendering resolution. The software path uses the same authored optical kernel, generated into JavaScript by `scripts/build-interior.mjs`. It runs in a worker at lower spatial resolution, with scanline tasks if workers are unavailable. It is slower and softer than the GPU path. Cancelled sessions discard late frames.

Thin-medium integration uses a series limit for `(1-exp(-tau))/tau` near zero. This fixes float32 cancellation that otherwise discarded light in low-density regions. GPU and software results now differ by at most one 8-bit channel value in the three parity fixtures.

## Verification

- **330 JavaScript tests passed**, zero failures or skips, including existing contract, wallet, custody and instrument tests. New coverage exercises spherical navigation, deterministic software rendering, entry reversal, concurrent exit requests, paused touring and hidden-page exit completion.
- **16 exterior/projection render checks passed.** Ten comparisons have exactly equal pixels against the original lived renderer at zero formation, including alternate state, root, fold and portrait cases.
- **9 production-shader interior scenes passed**, including portrait, membrane, entry, return blend, alternate genome, opposite viewpoint and lived/fold/event state.
- **3 GPU/software parity cases passed** at 64 × 40 and 64 samples. Mean channel errors were 0.0002604, 0.0006510 and 0.0002604 on a 0–255 scale; 99th-percentile error was zero. Full results and actual rendered images are in `reports/build-5.3/interior/`.
- Source syntax/integrity, site assets, archive hashes and all **34 embedded module imports** passed.
- The updated **707,805-byte runtime** fits in **31 immutable chunks**. A fresh local EVM deployment created 59 named entries, minted the NFT, parsed its metadata and recovered the exact updated application bytes from the NFT's archive loader. Evidence is in `reports/confluence/local-deployment.json`.

Rendering verification used native Mesa GLES and generated JavaScript. This is not browser or physical-device certification. Solidity and the Rust proof kernel were unchanged; the existing Solidity artifacts were exercised by the tests and local deployment. Rust was not rerun. No public-chain deployment or real-wallet transaction was performed.

## Rebuild

Use `npm ci`, then `npm run build`. The build regenerates both interior implementations from the shared optical sources. `npm run validate:genesis` runs the complete existing release workflow. Native optical checks are `python test/genesis/blue_projection.py` and `python test/genesis/interior_render.py` and require Python, NumPy, Pillow and Mesa EGL/GLES.

The exact kernel is in `render/interior/volume.inc`; navigation is in `web/genesis/interior-space.mjs`; the controller, GPU projection and software renderer are in `web/genesis/`. Existing economic review and custody boundaries are preserved.
