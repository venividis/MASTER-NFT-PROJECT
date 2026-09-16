# v1.7 — Remembering

Open **preview.html**. The approved luminous organism is the starting view. **USE NFT ↗** opens Trade, Memory and the existing instruments. Nothing asks for a wallet automatically.

**This is a local rehearsal, not a deployed financial product.** Its trades, people and balances are fictional. New Solidity is source only, not compiled or EVM-tested. A local archive is not an independently authenticated chain history.

## Try one decision

In **Trade**, expand **Remember why**. Write why you are making the trade; optionally add evidence, invalidation, exit/review plan, time horizon, planned risk with units, tags and feeling. Leaving the reason blank keeps the journal optional. Notes do not place stop orders or enforce the stated risk.

Choose **Private** with a unique strong memory passphrase, or explicitly **Public**. Review the swap and inscription, then confirm. After success, **Memory** shows the original reason beside the actual local receipt. Add a reflection: it is a new record and cannot overwrite the original. No successful fill is invented for a failed review.

**Private mode needs native Web Crypto in a secure browser context.** This environment's opaque preview lacks it and correctly refuses private operations. It never falls back to plaintext. A normal secure HTTPS/localhost browser is the intended context; its encrypted end-to-end flow has not been tested in this managed environment. Use Public only for non-sensitive demonstration text. Do not use a wallet seed as a memory passphrase.

## Keep a non-trading memory

**Memory → Write any memory** records a lesson, idea or milestone with no trade or financial debit. Public bodies are readable in the archive. Private bodies remain encrypted in exports; the passphrase is not exported. Search includes only public bodies and private bodies already decrypted in the session.

**Lock private bodies** clears the session's key material references, decrypted bodies, drafts, search and private review. Page hiding, persona changes and a ten-minute session timeout also clear it. This is not guaranteed secure erasure or protection against a compromised browser. Losing the passphrase loses access. Keep it separately from a complete export.

The original **Seal Memory** still discards the words and salt. It cannot recover those old thoughts, and does not become this notebook.

## Watch the form develop

Successful supported activity now changes the existing field's axes, lobes, twist and density structure. The **LIVED FORM** badge or **Memory → Explore lived form** shows the contributing categories and timeline. A small activity sequence creates real geometric change; buying a larger amount does not buy a better form.

**Compare original** is a view, not a rollback. **Return to present** restores the current activity layer. Historical activity is evaluated on the current base genome; original manual Evolve snapshots remain in the original History. The full original audit is kept separate. Its historical/descendant and connected-chain views suppress the local activity deformation.

A memory may omit its form contribution. The actual trade may still contribute independently. Private words are never interpreted as geometry. A shape is a finite projection, not guaranteed unique or a rarity/profit/reputation score.

## Keep the history

Use the instrument **Export** for the complete remembering/operating archive. **Export execution CSV** contains actual local fill facts, not private prose or tax-ready P&L. Browser Storage is convenient, not permanent custody.

v1.7 uses a new storage key. Explicitly import an old v1.5/v1.6 instrument export to carry it forward. The import starts a new activity chapter at the old head, leaving earlier history untouched. Old app files and storage remain unchanged. A validated import replaces the current local instruments, not the original organism's own history or any blockchain state.

Selling a rehearsal artifact does not transfer the author's passphrase or rewrite their authorship. The author may reflect afterward without changing the new custodian's form. Public records remain public; demo persona selection is not authentication.

## Source and reproduction

`web/memory/`: envelope encryption, append-only model, journal UI and renderer bridge.  
`render/living/`: shared field source, compiled GLSL and Wasm.  
`contracts/src/memory/`: uncompiled MemoryLedger and JournalSwapRouter.  
`docs/v1.7/RESEARCH.md`: source findings, research and design boundaries.  
`docs/v1.7/ONCHAIN-GATES.md`: exact unfinished live integration.  
`reports/v1.7/`: actual current validation records.

```sh
npm run validate:ui
npm run test:memory
npm run field:life
npm run test:life-parity
npm run test:browser
npm run app:archive
npm run compile
```

Node checks are dependency-free. Field rebuild needs Clang's wasm32 target. Native parity needs EGL/GLES/Python NumPy/Pillow. Browser tests need Playwright and Chromium and honor managed-browser restrictions. Compile needs the pinned external Solidity package; it failed before compiler execution here. `npm run deploy` remains a refusal gate.
