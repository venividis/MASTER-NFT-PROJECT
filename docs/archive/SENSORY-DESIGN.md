# Sensory iteration: one state, several readable forms

The design does not add arbitrary "dimensions" or claim digital consciousness. It makes several different aspects of a stateful object spatially and sonically legible.

## What each channel means

**Cyan genome.** `phenotype()` reads fixed byte positions from the genome digest. Those bytes select 3–6 lobes, a fold amplitude between 0.12 and 0.32, an angular phase, and a minor-pentatonic fundamental between 110 and about 196 Hz. Genesis and evolution use domain-separated commitments. Presentational rotation does not change the genome.

**Violet memory.** A memory action generates a cryptographically random salt, hashes `{thought, salt}`, and passes only that commitment into the state transition. The memory root influences loop orientation. No plaintext or salt is saved in the book. Losing the original thought cannot be remedied from this commitment; no claim of encrypted backup, selective disclosure, key release, or private onchain storage is made.

**Lime audit.** Each action consumes exactly the current nonce and binds the prior state and audit roots. The audit digest commits to the full local receipt. An orbit marks the visible audit positions. The timeline selects reconstructed snapshots instead of changing the current head. A re-encoded malicious history with all hashes recomputed can be consistent: unsigned integrity is not authenticity.

**Amber lineage.** The parent genome and lineage participate in creating a child's identity and genome. Child records are append-only in the model. The parent remains the canonical active study while a child is inspected. Child bodies are read-only previews, not independently deployed accounts. The scene displays up to 12; the list supports the full 24-child limit.

**Rose sovereignty.** Ascension requires a confirmation checkbox and commits the existing local policy digest. It advances a local epoch and disables direct entropy and repeat ascension. Other actions pass the same deterministic local checks. This is not a claim that cryptographic autonomy is being verified in the browser.

## Motion has a boundary

Rotation, small breathing deformation, camera movement, hover labels, and unfolding are presentation. They are not transactions or evidence of life. Genome/state changes are committed actions. Both renderer backends interpolate geometry; reduced-motion mode settles immediately. A snapshot identifies state, not an exact frame, because camera and time are independent display inputs.

## An interface that does not silently ask for custody

There is no wallet-connection prompt, signer, RPC client, token approval, or network fetch in this new interface. It is safe to examine its mechanics without attaching a wallet. The UI explicitly labels local simulation and does not fabricate attester counts, live balances, confirmed blocks, or generated ZK proofs.

## Persistence and transfer

A book contains a schema, seed and genesis time, bounded receipts, and expected audit head. Import rebuilds the book rather than trusting supplied state snapshots. Unknown fields, invalid digests, backwards time, bad nonces, wrong policies, modified outputs, unexpected payload keys, and mismatched final heads fail. A verified import still requires the user to open the imported study explicitly.

Browser file-origin storage is not uniformly portable. The actual success/failure of storage operations controls the status label. Exports are the portable copy. Web Locks provide cross-tab serialization where supported; without them, cross-tab conflict detection is best effort, not a distributed transactional database.

## Browser design references

Reviewed 2026-09-04. These are implementation references, not endorsements or proof of this project's security.

- MDN, Web Audio API best practices: user-gesture activation and graph management. https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- MDN, autoplay guide: no unrequested playback. https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- MDN, `SubtleCrypto.digest`: hash semantics and secure-context availability. https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
- Khronos, WebGL specification: context loss and resource restoration. https://registry.khronos.org/webgl/specs/latest/1.0/
- Khronos, `WEBGL_lose_context`: context-loss testing interface. https://registry.khronos.org/webgl/extensions/WEBGL_lose_context/
- MDN, WebGL best practices: resource management and performance boundaries. https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices

The portable SHA-256 routine is a fallback for offline/opaque-origin previews. Native Web Crypto is preferred. Both paths are checked against Node crypto; the fallback also passes empty, `abc`, padding-boundary, random-input, and one-million-byte vectors. This is correctness testing, not a cryptographic implementation audit.
