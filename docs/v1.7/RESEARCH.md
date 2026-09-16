# v1.7 — Remembering / research and implementation

Reviewed 5 September 2026. **Delivery: an additive, tested local journal and activity-shaped optical field, native cryptographic routines, and uncompiled Solidity source. Not a deployed trading system, permanent public-chain archive, performance certification, or independent audit.**

The meditation remains a metaphor for discovery, not an instruction to depict a phoenix, soul, castle or crystal city. This iteration preserves the approved original and lets its existing material and geometry carry a history. The new form does not interpret a person's spiritual experience or infer their emotional state.

## 1. What the supplied project actually supported

The original v1.2 field already changes with its seed, genome, roots and explicit Evolve/Seal Memory/Spawn/Ascend actions. Fold Space changes the view, not the authoritative state. History reconstructs original snapshots without undoing the present. Its Seal Memory intentionally discards the words and salt: it is not a recoverable notebook. These distinctions are explicit in the supplied start guide, original model, shader, and `docs/RESEARCH-1.2.md`.

v1.6 added financial, social, library, commission, marketplace and laboratory records, but deliberately left the optical audit and renderer inputs unchanged. Its validation report says the operating workflow leaves that original audit unchanged. Inspection of `web/instruments/app.js`, `web/operating/engine.mjs`, and the renderer bridge confirmed that no persistent activity-to-form mapping existed. A larger event ledger was not already an evolving body.

The new implementation therefore has two distinct additions: a recoverable **personal journal**, with separate public/encrypted modes; and a **versioned visual projection** of admitted activity. Neither silently replaces the original identity or Seal Memory semantics.

## 2. A trading journal should preserve a decision, not decorate a transaction

CME's [trade-plan guidance](https://www.cmegroup.com/education/courses/building-a-trade-plan/trading-strategies-in-your-trade-plan) emphasizes explicit entry/exit conditions, setups, triggers and planned risk. The [trade-log lesson](https://www.interactivebrokers.com/campus/trading-lessons/step-5-keep-a-trade-log/) is useful for looking beyond an isolated transaction. These are educational foundations, not evidence that this app improves returns. No recommended coin, position size, target return, or prescribed trading strategy is embedded in the journal.

The useful distinction is **before, execution, after**. A before-note records the thesis and information the trader chose to record before execution. The execution record reports the actual local inputs/outputs rather than copying the quote. A later reflection can disagree with the thesis while leaving it intact.

This borrows a methodological lesson from [preregistration](https://www.cos.io/initiatives/prereg): preserve the distinction between an advance plan and a later interpretation. It is not a scientific-registration service, and a local digest is not an independently witnessed timestamp. Outcome-bias research, including [Aiyer et al.'s replication](https://rips-irsp.com/articles/10.5334/irsp.751), also motivates separating the quality of a decision process from whether an outcome happened to be favorable. Those studies do not test this journal or prove that logging removes bias.

### Implemented interaction

Trade gains a collapsed, optional **Remember why** editor. One sentence is enough. Optional context records setup/evidence, invalidation, exit or review plan, time horizon, planned risk with stated units, tags, and self-described feeling. These fields are prose: an invalidation or stop price typed here is **not an executable stop order** and does not change the separately reviewed minimum output.

Preparing the review makes no financial change. A journaled local execution first validates the original plan against a safely restored copy. It then appends the exact note, applies the swap, compares the observed result, and binds the note to the successful SWAPPED receipt. Any failure rolls back the note, fill link and local operation together. A blank reason uses the ordinary swap path.

The before-note and fill occur in one atomic local operation, with distinct ordered events. This does not claim the note was published in a previous block or that the author could not foresee the outcome. Pending drafts, rejected trades and unsuccessful attempts are not displayed as successful fills.

### Reflection and process analytics

The Memory tab links the original reason to what was actually provided and received, then permits a later author-owned reflection. Corrections append; no editor overwrites the original. Search covers public bodies and only those private bodies explicitly decrypted in the current session. It does not pretend to search ciphertext.

The overview counts observed swaps, swaps with before-notes, decisions with reflections, and invalidation fields among readable notes. It does **not** infer portfolio P&L, cost basis, current prices, win rate, realized gains, tax treatment, gas-valued performance, or strategy skill. An execution CSV contains raw fill quantities, units, provenance and links—not private prose. Complete export/restore includes encrypted envelopes without a passphrase.

## 3. A general memory deserves the same integrity without requiring a trade

Write any memory creates an independent note: a lesson, idea, personal milestone, creation or reflection. There is no financial debit or trade requirement. A note may opt its opaque commitment into the visual history, or omit that contribution. Omitting it does not suppress the separate actual trade event.

Authorship, the artifact, and its custodian-at-time remain separate. A sold artifact keeps its public operating history. Its new owner does not become the author of older notes, gain the former owner's passphrase, or recover original discarded Seal Memory words. The original author may append a reflection after a sale, but that reflection cannot imprint the new owner's form through the personal-reflection route.

There is no encryption-key transfer attached to an NFT sale. An exported ciphertext may travel as data without transferring the ability to read it. ERC-7857's [private agent metadata specification](https://eips.ethereum.org/EIPS/eip-7857) addresses a different transfer/prover/verifier problem. Using encrypted notebook data is not ERC-7857 conformance or a functioning autonomous iNFT agent.

## 4. Privacy: actual encryption, explicit limits

The implementation uses native [Web Cryptography](https://www.w3.org/TR/webcrypto-2/), not a custom cipher. Private notes use AES-256-GCM with a 128-bit tag, a fresh random 96-bit IV, and a fresh random 128-bit salt. PBKDF2-HMAC-SHA256 uses 600,000 iterations to derive a nonextractable encryption/decryption key. The canonical immutable header is authenticated additional data; moving ciphertext to a changed header fails authentication.

[NIST SP 800-38D](https://csrc.nist.gov/pubs/sp/800/38/d/final) is the GCM reference. Fresh nonces are a real requirement, not decorative metadata. [OWASP's password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) includes a 600,000-iteration PBKDF2-SHA256 recommendation in its relevant compatibility setting; this implementation chooses PBKDF2 for native interoperability, not because it is universally preferable to memory-hard derivation. There is no FIPS certification or claim that twelve characters automatically provide adequate entropy. A unique, strong memory passphrase is needed; a wallet seed must never be used.

UTF-8 bodies are padded to 1-KiB blocks before encryption. This reduces exact-length disclosure but still reveals approximate length. Authors, identity, time, phase, parent/receipt linkage and record existence remain visible. No forward secrecy, anonymous authorship, zero-knowledge content proof, trusted hardware, recovery service or group-key protocol is supplied.

Decrypted bodies, passphrases, search text and draft text stay outside serialized state. Locking the session clears those references and cancels a private pending review. Persona changes, page hiding and a ten-minute session timeout clear the private session. A late cryptographic result cannot repopulate a locked or changed session. This is application-level cleanup, **not guaranteed secure erasure of a garbage-collected heap**. A compromised browser or modified application can read an unlocked body or steal a passphrase.

Public mode is explicit and makes the body readable to anyone holding the archive. Private mode fails closed when native Web Crypto is absent; it never falls back to plaintext. Lost passphrases cannot be reset. Preserve the encrypted export and the passphrase separately.

### Tested versus untested cryptographic surfaces

Native Node Web Crypto executed the actual browser-compatible module: Unicode roundtrips, distinct salts/IVs, wrong passphrases, header/ciphertext corruption, and export non-disclosure were tested. The managed Chromium environment exposes no `crypto.subtle` for its permitted opaque-origin page. Browser tests therefore verify public journal flows, ciphertext import/preservation, and refusal to save/decrypt privately without that capability. **Secure-browser encrypted end-to-end execution remains untested here.** File and localhost navigation were policy-blocked; no bypass was used. Controller race/cleanup checks use narrow async/UI stubs and are separately labeled, not counted as browser cryptography.

## 5. Mathematical research: preserve the medium; change the history it carries

The investigation considered several families. [Lenia](https://arxiv.org/abs/1812.05433) demonstrates diverse continuous-state artificial-life patterns. [Growing Neural Cellular Automata](https://distill.pub/2020/growing-ca/) explores learned local update rules, growth, persistence and regeneration; its experiments also expose stability and training considerations. [Algorithmic botany](https://algorithmicbotany.org/papers/) provides a useful reference for rule-based developmental structures. These are researched alternatives, **not engines secretly implemented in this release**.

For this artifact, an autonomous simulated organism would add training, checkpointing, replay and stability questions while potentially replacing its successful appearance. The chosen design instead uses a small event-driven dynamical reducer that changes the existing field's coordinates and density structure. This preserves a reproducible zero point and makes the source of a change inspectable.

The original participating-medium renderer remains the material model. It combines procedural density, absorption/emission, repeated folds and corona structure. [PBR's transmittance treatment](https://pbr-book.org/4ed/Volume_Scattering/Transmittance) supplies the relevant light-transport foundation. This is still art-directed bounded integration, not an accurate plasma simulation or proof of physical extra dimensions.

### Implemented reducer

Admitted local actions are classified as exchange, commitment, creation, connection, exploration, or memory. The current field depends on the artifact, chapter origin, ordered typed activity and opaque commitments. Private prose is never decrypted, sentiment-analyzed or interpreted by the renderer. Pure view operations and test-clock advancement do not add activity traces. Explicitly omitted memories are excluded from both immediate and subsequent visual projections.

For category count `c`, the next directional input is damped by `1 / (1 + 0.32 c)`. Eight accumulators update as `s <- 0.86 s + weight * signedHashDirection`. Overall strength is `0.30 * (1 - exp(-N/5)) + 0.10 * D/6`, where `N` is admitted record count and `D` is category diversity. Bounded tanh maps the accumulators to eight parameters, rounded to five decimal places. The absolute parameter bound is 0.4. One axis also receives a modest commitment/exchange category bias.

These constants are design choices, not discovered laws of beauty or optimization for financial success. Repetition has diminishing influence; spending size and profit do not increase the growth strength. Exact event data can change the hash direction, so two different amounts can produce different details, but a larger amount is not ranked as better or brighter. It is not a Sybil-proof rarity system: people can deliberately make activity, and the appearance grants no money or authority.

The field uses those parameters for bounded axis scaling, radius and angular harmonics, depth-dependent twisting and density-domain changes. It is a genuine geometry/light-structure change, not a new static background or only a palette switch. Zero deformation is tested against actual original Wasm pixels. GPU and CPU use the same added scalar field source, compiled into GLSL and WebAssembly.

The full history commitment and the visible projection are different things. Eight finite parameters cannot be a collision-resistant visual identity. Different histories can look similar; no guaranteed uniqueness, extra market value, rarity increase, or sentience is asserted.

### Continuity, replay and inspection

A smooth transition settles toward the new field; reduced-motion mode applies the target without autonomous morphing. The original is available for comparison, without undoing actions. A chapter timeline replays admitted activity up to a chosen event. It applies that **past activity layer to the current base genome**. It does not reconstruct a combined historical manual-Evolve-plus-financial snapshot. Original Evolve history remains in the separate original History control.

Imported v1.6 archives begin a fresh activity chapter at their existing head. They are not retroactively scored or secretly reinterpreted. Export/reimport reconstructs identical reducer parameters. Original history/descendant views and connected-chain views do not receive a misleading local activity layer.

## 6. Fully onchain requires more than a memory hash

Two new source files establish a concrete path, not a completed deployment. `MemoryLedger.sol` stores **full public bytes or supplied ciphertext bytes** in contract storage, rather than only an unavailable content hash. It distinguishes actual personal callers from account executors and custodian-at-time. A mode flag cannot prove that uploaded bytes really are encrypted.

`JournalSwapRouter.sol` commits to chain, router, account, nonce, exact input, minimum output, deadline and payload; calls the configured market with temporary exact allowances; measures the output; returns it to the account; and binds the fill. Failure reverts inscription, swap, nonce and binding together. The configured market is the retained actual-v4 adapter, not Dave's custom Charter. **This source path returns to the account; journaled swap-and-lock still needs a separate source integration**, although the local model retains its tested lock path.

The source's note/fill form commitments are narrower than the local full-protocol reducer. The Solidity Keccak records and local SHA-256 envelopes are not interchangeable formats. A real client must specify its final encrypted envelope/AAD mapping, authenticated module/event universe, receipt and block identities, reorganization handling, finality policy and migration rules. The [Ethereum RPC reference](https://ethereum.org/developers/docs/apis/json-rpc/) identifies receipt/log/block data; merely receiving them is not a locally verified finality proof.

[ERC-4906](https://eips.ethereum.org/EIPS/eip-4906) provides metadata-update events. It does not itself render an evolving body or subscribe an NFT to every protocol action. The completed onchain renderer/metadata linkage and full event admission remain unfinished. No cross-chain synchronization, journal signature service or onchain AI interpretation was added.

The complete HTML and source are exported, and immutable-archive payloads are prepared locally. Browser Storage is not permanence. Storing the HTML later would preserve its bytes, not automatically connect its rehearsal balances to live contracts. A lasting encrypted record requires durable bytes **and** retained keys; a lasting public record requires an intentional publication choice.

## 7. Delivered scope and next release gates

Implemented locally: optional swap thesis, exact successful-fill linkage, immutable reflections, general memories, explicit public/encrypted envelopes, process analytics/search/export, custody-aware authorship, typed activity morphology, original comparison, activity-history projection, and shared compiled GPU/Wasm source.

Written but uncompiled: full-byte MemoryLedger and atomic JournalSwapRouter. Not delivered as operating capabilities: live-wallet journal execution, chain-wide event verification, historical P&L, price charts, executable stops, model-based coaching, MLS/group sharing, key handover on sale, or fully onchain evolving metadata.

Current evidence is in `VALIDATION.md` and `reports/v1.7/`. Required gates include actual Solidity compilation and size checks; real PoolManager and hostile-token tests; secure-browser encrypted E2E and key handling review; current-custody/callback tests; actual testnet transactions; authenticated/reorg-aware form replay; an independent security review. Test counts do not establish taste, profitability or production safety.
