# i dont fucking believe it! — v1.5 / Instruments

Open **preview.html**. The approved v1.2 organism is the default experience. **USE NFT ↗**, beside Fold Space and Motion, opens the new instruments. Close the panel to return to the same organism.

**This is an interactive local rehearsal with experimental Solidity source, not a deployed financial release.** The instrument balances, counterparties, rooms, and transactions are fictional. The original optional testnet client is preserved separately; it does not connect these new instruments to a live market.

## Three paths through the upgrade

**Trade → Lock.** Trade offers a minimum received amount and an optional output lock. Review shows the outcome before the model changes. The whole local operation rolls back if any part fails. The quote is reserve math, not a Uniswap v4 tick quote.

**Give → Accept → Release.** Offer an asset directly or swap into it first. Choose a personal-wallet recipient or an artifact account; those rights behave differently on NFT transfer. Change **Act as** to Guest to accept a gift sent to Guest. Acceptance makes the gift non-recallable. Before acceptance the donor can recall; an expired unanswered offer can be returned only to the donor. Use the separately labeled **Test clock** to exercise a matured release. A future-view slider never advances this clock or unlocks money.

**Launch → World → Market.** Create a time-boxed batch sale, contribute, withdraw before close, advance the test clock to closing, settle, and claim an allocation or refund. Its commons opens directly from the launch. World separates prose from action records; inspect a receipt and discuss it. Market lets you inspect declared contents, projected claim availability, buy, list, and cancel without rewriting historical speakers or release schedules.

## Keep the distinctions visible

The original **Evolve / Seal Memory / Spawn / Ascend** controls remain original. Seal Memory does not store a recoverable thought. Original historical/descendant views are read-only. The new instruments refuse mutations while the original is historical, connected to a testnet, or in Sovereign mode without a utility proof adapter. No sovereign bypass or fabricated proof was added.

Instrument archives are stored separately per original genesis when browser Storage is available. Browser Storage is not durable custody. Use **Export**. **Import** validates and explicitly replaces the instruments only; it never overwrites the original history. A corrupted save is preserved until a valid import is confirmed. Persona and selected-view changes alone need not persist until the next saved operation.

Pending or accepted new gift-module rights are not covered by the inherited exchange's manifest. The rehearsal refuses new listings that would conceal those rights. This is an interface boundary, not an implemented onchain manifest extension.

## Source and evidence

- `docs/v1.5/RESEARCH.md`: culture, standards, mechanisms, mathematics, and selection decisions.
- `docs/v1.5/VALIDATION.md` and `reports/v1.5/`: exact current evidence.
- `web/instruments/engine.mjs`: typed local plans, consent gifts, causal receipts, read-only projections.
- `contracts/src/instruments/ConsentGiftRouter.sol`: new **uncompiled** contract module.
- `contracts/src/kingdom/`: inherited **uncompiled** v4 adapter, hook, exchange. Historical filenames do not dictate the visual design.
- `web/reference/approved-1.2.html`: exact approved original.
- `onchain-app/`: prepared local HTML chunks, **not deployed**.

Run `npm run validate:ui` for dependency-free Node checks. Browser tests additionally require Python Playwright and Chromium. `npm run compile` requires the pinned compiler package and has not succeeded here. `npm run deploy` intentionally refuses deployment.
