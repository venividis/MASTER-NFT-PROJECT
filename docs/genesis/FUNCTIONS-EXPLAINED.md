# ANIMA Genesis: everything your NFT can do, explained simply

Source reviewed: Genesis 5.9 continuation, following the Genesis 5.8 draft `a400e7ba1060b005e96b447d267e44e0e8ceed4f`, dated 12 September 2026. This edition implements the section 17 extension backlog, with exact scope and deployment/service requirements below. A hosted website update does not update an already minted immutable edition.

Think of ANIMA as a glowing little home. The NFT is its deed. Its account is a purse attached to the home. Its programs are tools inside it. Some tools already work on your device; others need their matching contracts and services connected before they can use real assets.

**The house can be seen; its owner controls its purse.** Public blockchain code, pictures, metadata and public messages can be read or copied by other people. The interface checks ownership before owner actions, and the contracts enforce their own authority rules. This is not secret, owner-only delivery of the entire website. Encrypted notes and private-wallet secrets are separate from public NFT data.

## Read the status first

| Status | What it means |
| --- | --- |
| **Local** | Works as a picture, tool, game or rehearsal on your device. Rehearsal coins are pretend coins. |
| **Desk + contracts** | A real transaction interface and matching contract source exist. Compatible deployments, a connected wallet and a reviewed signature are required. Local-chain tests are evidence; public-chain activation is not claimed. |
| **Contract source** | The contract has the function, but this release does not provide a complete dedicated live screen for it. An explicit integration or encoded account call is needed. |
| **Service** | Implemented integration needs something running outside the NFT, such as an RPC, prover, broadcaster, provider or keeper. Dependencies are stated in the row. |
| **Future** | Research or specification only. A menu entry or locked label does not make it implemented. |

The inherited 5.7 release validation passed 406 tests and recovered the app and its privacy worker exactly from an ephemeral local blockchain. Those are historical baseline results, not a claim that every new 5.8 path was part of that run. **No public Genesis deployment, funded shielded end-to-end validation, independent audit or complete phone/browser certification is claimed.** See [the 5.7 evidence](INTERIOR-AND-ONCHAIN-5.7.md). The rows below explain user capabilities; repeated entrances to the same capability are identified. Getters, overloads and internal helpers are grouped by what they do rather than portrayed as extra products.

## 1. Every original blue-object action in Atlas

These are the exact 31 entries exported by [atlas.mjs](../../web/genesis/atlas.mjs). The original connection and the expanded **Connect NFT** connection are separate clients. Loading one does not silently authorize the other.

| ID | Atlas action | Like you are five | Status and exact boundary |
| --- | --- | --- | --- |
| O01 | Evolve | Give your glowing creature a new chapter and a new pattern. | Local; original testnet desk + contracts when connected. Changes genome and state together. Sovereign evolution needs an externally supplied accepted proof. |
| O02 | Seal memory | Keep a fingerprint of a thought, then let the written thought go. | Local; original testnet desk + contracts. **This is not a recoverable notebook.** The thought and random salt are discarded. The chain route stores `memory.commitment` metadata; it does not update the account's memory root. |
| O03 | Spawn | Make a child whose family story starts with this parent. | Local child preview; original testnet desk + contracts for an actual child NFT. The live button sends the child to the connected wallet. Sovereign spawning needs a proof-authorized account path. |
| O04 | Ascend | Replace the owner's ordinary key with a special rule-checked door. | Local preview; original testnet desk + contracts. Live ascension permanently disables direct owner execution and ordinary owner transfer. A verifier must be configured first. The original client chooses a zero-native-value policy; it cannot invent the required proofs. |
| O05 | Inject entropy | Stir a little new randomness into the local creature. | Local only, in Bound mode. Disabled for a connected chain token and after local ascension. |
| O06 | Original identity | Look at the creature's identification card. | Local or observed chain snapshot. A snapshot is an RPC observation, not an independently verified storage proof. |
| O07 | History | Look at the creature as it looked earlier. | Local recorded history. Looking backward does not undo the present. |
| O08 | Original receipts | Read the little records explaining its changes. | Local receipts can be recomputed; a connected original client shows its observed chain snapshot. Local receipts do not prove wallet ownership or blockchain execution. |
| O09 | Event horizon | Open the original interface's longer event log. | Local interface log. It is not a complete index of every event on every chain. |
| O10 | Original tools | Open the drawer for saving, restoring, portraits and proof/mint recovery. | Local utilities; proof and mint recovery depend on the prepared original-client context. |
| O11 | Original connection | Point the original viewer at a collection and token. | Desk + contracts on local chain 31337, Sepolia or Base Sepolia. Reading and signing are separate steps. |
| O12 | Mint & recovery | Open the same connection drawer to start or finish a mint. | Alias of the original connection entrance. Minting uses the two-step recovery flow described below. |
| O13 | Genome | Read the compact recipe fingerprint for the current form. | Local or chain read. A digest is not a biological genome or hidden password. |
| O14 | State root | Read the fingerprint of the current recorded state. | Local or chain read. It helps bind actions to the correct starting state. |
| O15 | Memory root | Read the fingerprint of the memory state. | Local or chain read. A root does not contain readable private words. |
| O16 | Audit root | Read the fingerprint linking the account's recorded actions. | Local or chain read. It is a consistency commitment, not a guarantee every decision was good. |
| O17 | Present | Come back from an old picture or child preview to the current creature. | Local navigation. No transaction is reversed. |
| O18 | Export original | Save the original creature's receipt book. | Local download; when connected, exports the observed chain snapshot instead. It is not a private-wallet backup. |
| O19 | Original portrait | Take a picture of the running blue creature. | Local PNG rendering. Saving a picture does not mint an NFT. |
| O20 | Archived v1.0 | Open the preserved first experiment. | Local archived simulator in an isolated frame. Its older behavior is not the current protocol. |
| O21 | Execution boundary | Ask the interface which parts are pictures, local records or chain actions. | Local information screen. Historical wording in this retained screen is narrower than the newer Genesis desks. |
| O22 | Original guide | Read the original camera and creature controls. | Local help. |
| O23 | Whole lens | See the whole original field. | Local view; ownership stays the same. |
| O24 | Memory lens | Look through the form's memory-colored layer. | Local view of commitments. It cannot recover discarded thoughts. |
| O25 | Lineage lens | Look at the family branch and available child previews. | Local lineage view. The original connected client does not load a complete descendant index; mint receipts identify real children. |
| O26 | Reset camera | Put the original camera back at its starting place. | Local view. Separate from resetting or replacing an identity. |
| O27 | Fold space | Slide through another mathematical slice of the light pattern. | Local fourth-coordinate visual control. It does not physically move you into another universe or change ownership. |
| O28 | Motion | Pause or resume the original object's movement. | Local animation control. It does not stop blockchain time. |
| O29 | Quality | Choose how much drawing work the original renderer does. | Local rendering control. Device performance still matters. |
| O30 | Sound | Let the object's recipe make sound. | Local, opt-in synthesized audio. Seed changes retune the expanded ambience. No music license, medical effect or globally unique song is implied. |
| O31 | Immerse | Hide the original instrument panels so the object fills your attention. | Local presentation. **Enter the object** is the separate navigable interior below. |

Source: [original app](../../web/app.js), [original chain client](../../web/evm.mjs), [original model](../../web/model.mjs).

## 2. Explore the inside and let light form the interface

| ID | Function | Like you are five | Status and exact boundary |
| --- | --- | --- | --- |
| E01 | Enter the object | Fly through the blue surface and explore the space inside. | Local procedural 3D rendering, driven by the same identity and optical field with documented volumetric extensions. |
| E02 | Look around | Drag your finger or mouse to turn your head. | Local camera input. |
| E03 | Move freely | Walk or float forward, backward, sideways, up and down. | Local W/A/S/D and Q/E controls plus onscreen movement controls. Movement can cross the membrane in either direction. |
| E04 | Pinch, spread and double-tap | Use your fingers to move closer or farther away. | Local gestures: pinch/spread moves along the view, double-tap moves closer, two-finger tap moves back. |
| E05 | Two-finger pan | Slide your view sideways or vertically. | Local gesture. It does not drag the NFT to another wallet. |
| E06 | Smooth movement | Let the camera follow your motion gently. | Local time-based smoothing; entry blends optical depth and camera travel together. |
| E07 | View whole object | Find the whole creature again if you have flown far away. | Local recentering. There are no destination-tour buttons in the current interior. |
| E08 | Pause motion / Hide controls | Hold the light still or put the buttons away. | Local presentation; financial schedules keep their own time. |
| E09 | Functions / Return inside | Open a useful tool, then return to the place you were exploring. | Local navigation into the applicable desk. Opening it does not spend or sign. |
| E10 | Atlas | Open the map of all available entrances. | Local directory. It includes local rehearsals, real transaction desks and explicitly unfinished capabilities. |
| E11 | Interface formation | Watch the blue light form the tool's outlines, words and controls. | Local animation. The actual native controls retain their normal checks. |
| E12 | Complete formation / Reduced motion | Skip waiting for the light to finish making the buttons. | Local accessibility controls. Reduced motion opens usable controls immediately. |
| E13 | Adaptive render budget | Ask the picture to do less work when your device struggles. | Local resolution/sample adjustment based on sustained frame timing, with gradual recovery when still. This is not certification of every phone. |
| E14 | Rendering fallback | Use a simpler route when the main graphics route is unavailable. | Local software/fallback paths exist. Detail and speed differ; no universal device guarantee. |

Source: [interior controller](../../web/genesis/interior.mjs), [gestures](../../web/genesis/interior-gestures.mjs), [quality](../../web/genesis/interior-quality.mjs), [creation coordinator](../../web/genesis/creation.mjs), [kernel](../../web/genesis/interior-kernel.mjs).

## 3. The seven secondary Atlas views

| ID | Exact view | Like you are five | Status and exact boundary |
| --- | --- | --- | --- |
| S01 | Lived form | Compare the starting light with the shape its admitted local activities have added. | Local activity projection. Not every real chain action is automatically indexed into it. |
| S02 | Instrument receipts | Follow what happened in an economic rehearsal and what caused it. | Local records, causal links and attached discussions. Not a chain receipt or proof of profitability. |
| S03 | Capability map | Read which tools are built and which are still ideas. | Local information, reconciled in 5.8 across 43 feature groups. Readiness, needed deployment/services and spending authority remain separate facts. |
| S04 | Clock | Move pretend time forward to test a schedule. | Local model mutation: minutes or days can expire offers and mature locks. It never advances a blockchain clock. |
| S05 | Applications | Keep a label, byte length and fingerprint for an application edition. | Local commitment registry. Registering a hash neither stores all its bytes nor runs it. |
| S06 | Venues | Inspect the model's market shelves and their holdings. | Local operating-model view. Contract-backed shelves exist separately. |
| S07 | Launch rehearsal | Try the inherited time-boxed token-sale model with pretend balances. | Local. Separate from the current real v4 Launch desk; the inherited model has its own fixed allocation/locking rules. |

Source: [Atlas](../../web/genesis/atlas.mjs), [instruments](../../web/instruments/app.js), [operating views](../../web/operating/app.js), [memory projection](../../web/memory/engine.mjs).

## 4. Mint, identity, ownership and the account purse

| ID | Function | Like you are five | Status and exact boundary |
| --- | --- | --- | --- |
| I01 | Commit a mint | Put a sealed promise onchain before the new creature is born. | Original testnet desk + contracts. The UI commits zero endowment; the contract can accept an explicit native endowment. |
| I02 | Reveal a mint | Open the promise after the waiting blocks and create the NFT plus its account. | Desk + contracts. The saved reveal secret must match the wallet, collection, recipient and chain. |
| I03 | Save / resume mint recovery | Keep the small recovery file needed to finish that mint. | Local secret export/import and desk continuation. This is a mint reveal secret, not the wallet private key. |
| I04 | Expired-mint refund | Ask for the committed endowment back if the reveal window expired. | Contract source: `cancelExpiredAwakening`. Not a refund of gas already spent. |
| I05 | Deterministic NFT account | Give each minted creature its own predictable purse address. | Contract source and local deployment fixture. It is a custom NFT account; canonical ERC-6551 compliance is not claimed. |
| I06 | Hold native coins and tokens | Keep supported assets inside that purse. | Contracts. ERC-20 balances and received ERC-721/ERC-1155 NFTs can belong to the account. This does not make unsupported assets safe or executable. |
| I07 | Transfer the master NFT | Give someone else the deed and the corresponding Bound-account control. | Contracts. Transfer invalidates old sessions and temporary user records. It does not hand over private-wallet secrets or private-note passwords. |
| I08 | Approve an NFT transfer operator | Let another address transfer the NFT under the applicable ownership rules. | Contract source. Approval is not permission to ascend, edit identity or spend from the account. Sovereign transfer authority is different. |
| I09 | Temporary user / presence | Lend a visitor badge that expires. | Contract source and local rehearsal. The badge alone grants no treasury-spending authority. |
| I10 | Identity & lineage | Inspect seed, genome, parent, generation and current account. | Local preview or chain read. Full identity data is authoritative; short names and images can resemble one another. |
| I11 | Preview another seed | Try a different costume for the light without minting. | Local visual preview. It does not replace the selected minted identity or its owner. |
| I12 | Generate / restore visual identity | Try a random preview, then come back to your NFT's appearance. | Local. Similar visual projections remain possible. |
| I13 | Share visual link / portrait | Share the appearance or save a picture. | Local export/copy. The visual link excludes balances, private notes and spending permissions. |
| I14 | Public metadata and context | Attach public labels or machine-readable information to the NFT. | Contract source: context, endpoint and bounded metadata writes with reserved core keys protected. An endpoint label does not create an external service. |
| I15 | Agent identity reference | Record one registry/agent reference and its binding-proof digest. | Contract source: one-time `bindERC8004`. Storing the reference does not verify the external agent, add reputation or run an AI. |
| I16 | Wallet thumbnail | Show a blue orbital image in wallets, with seed details and current counters. | Onchain renderer source. Full still image remains without SVG animation. Existing immutable renderers do not change when this source changes. |
| I17 | Token and collection metadata reads | Tell wallets what the token is, where its account is and how to render it. | Contract source: ownership, balances, approvals, snapshots, metadata, interface detection and account prediction getters. Publicly readable. |
| I18 | Collection royalties | Report a royalty recipient and rate to compatible marketplaces. | Contract source; collection administrator controls configuration until permanently frozen. A reported royalty is not universal enforcement on every sale. |
| I19 | Nest other NFTs | Put a supported cartridge or another compatible NFT inside the account. | Contracts. This collection explicitly blocks transfers of its own master NFTs into its master accounts, avoiding that self-nesting path. “Can hold NFTs” does not mean every nesting pattern works. |

Source: [master NFT](../../contracts/src/core/IDontFuckingBelieveIt.sol), [account](../../contracts/src/core/SovereignAccount.sol), [factory](../../contracts/src/core/SovereignAccountFactory.sol), [thumbnail](../../contracts/src/confluence/GenesisSVG.sol), [identity UI](../../web/confluence/app.js).

## 5. Connect NFT, Agent studio and controlled execution

| ID | Function | Like you are five | Status and exact boundary |
| --- | --- | --- | --- |
| A01 | Connect NFT | Check that your wallet owns the selected creature on the correct chain. | Desk + contracts. A recovered minted edition pins its home chain, collection and token. A failed or changed connection retires old reviews. |
| A02 | Disconnect / invalidate reviews | Close this app's access to its wallet session and stale plans. | Local session control. The external wallet has its own lock, and a submitted transaction cannot be recalled by disconnecting. |
| A03 | Read the sealed module directory | Find the matching market, vault, journal, world, cartridge and exit addresses. | Contracts plus loader/wallet integration. GenesisManifest is published once per collection; confirmed directory entries cannot be overwritten. |
| A04 | Compose an account call | Tell the purse exactly which address to call, what message to send and how much native value to use. | Desk + contracts through Agent studio. The owner reviews it; entering calldata is not an automatic action. |
| A05 | Simulate and review | Try the proposed call without spending, then show its exact transaction. | Desk + RPC service. Simulation can fail or become stale; it does not guarantee a later result. |
| A06 | Sign and submit | Ask the wallet to approve the reviewed transaction. | Desk + contracts. Nonce, owner, custody epoch and context checks reject stale plans. Included success is recorded separately from preparation. |
| A07 | Exact allowance recipe | Lend one tool exactly the token allowance it needs, use it, then clear that allowance in the same transaction. | Desk + contracts: `executeUtility`. Existing account assets fund the action. It does not revoke every unrelated historical approval. |
| A08 | Exact delegated action | Authorize a caller, exact calldata, selected asset budget, expiry and call count. | New-edition source and owner UI. Legacy selector sessions revert; this monitors one asset net debit, not all external liabilities. |
| A09 | Revoke delegated authority | Stop a specific account permission. | Owner UI and contract. NFT transfer invalidates all previous custody-epoch grants. |
| A10 | Adopt an instrument | Record the exact published tool you intend to use after its waiting period. | Contract source plus local model. Adoption has a seven-day delay and is separate from spending permission. |
| A11 | Grant exact instrument use | Give a selected caller a bounded permission for an exact tool call. | Contract source plus local model. Binds target, asset, calldata, ceilings, expiry and call count. |
| A12 | Execute / revoke an instrument grant | Use the allowed call or cancel its future permission. | Contract source plus local model. Ownership changes retire old grants; a published recipe alone cannot spend. |
| A13 | Select proof authority | Choose the registered checker before irreversible ascension. | Agent studio desk + contracts. Pins verifier identity/code and custody epoch. |
| A14 | Execute a verified sovereign intent | Let anyone carry a valid rule-checked request to the account. | Contract source + external verifier/proof infrastructure. Authority comes from the accepted proof, not the messenger. Value, nonce, dates, prior state and policy remain bound. |
| A15 | Export / import evolution proof request | Send an exact sovereign-evolution question to your verifier and bring its answer back. | Original desk + external proof producer. Imports are simulated against the deployed verifier; the browser does not fabricate proofs. |
| A16 | Signature and account interface checks | Let compatible contracts ask whether this account accepts a signer or signature. | Contract source. ERC-1271/signing checks and interface getters follow the current authority mode. |
| A17 | Agent tools and policy planning | Give software a vocabulary for proposing supported actions. | Source tooling, SDK and policy service. A proposal or exported capability manifest does not authorize spending or supply a live autonomous operator. |

Source: [wallet](../../web/confluence/wallet.mjs), [Agent studio](../../web/confluence/app.js), [account](../../contracts/src/core/SovereignAccount.sol), [agent service](../../agent/server.mjs), [policy engine](../../agent/policy-engine.mjs), [agent API](../AGENT_API.md).

## 6. Onchain instruments and exact rehearsal

| ID | Function | Like you are five | Status and exact boundary |
| --- | --- | --- | --- |
| D01 | NativeMarket swap | Trade one supported asset for another using the connected NFT purse. | Desk + contracts. NativeMarket is the project market; this desk is not the separate Uniswap v4 desk. |
| D02 | Quote, decimals and minimum received | Count token units correctly and choose the least you will accept. | Desk + contracts/RPC. Integer amounts, selected slippage, deadline and current quote bind the planned swap. |
| D03 | Atomic trade inscription | Save a public reason and the actual successful fill together. | Desk + contracts through JournalSwapRouter. Note and fill succeed together or revert together. Current typed desk uses public text and explicit publication consent. |
| D04 | Token/native lock | Put a chosen amount in a box with a release date. | Desk + TimeVault contracts. The typed desk uses the NFT account as beneficiary. |
| D05 | Cliff or linear vesting | Open the whole box later, or let its contents become available gradually. | Desk + contracts. This is scheduling, not yield or guaranteed price growth. |
| D06 | Release matured assets | Move the amount already unlocked to its fixed beneficiary. | Desk + contracts. Rejects another beneficiary's lock and zero currently available amounts. |
| D07 | Public personal memory | Put a short note in the public chain notebook under the signer's authorship. | Desk + MemoryLedger contracts, explicit public consent and a personal signature. |
| D08 | Onchain Commons | Read and post in rooms, manage accepted invitations and administer a room you control. | Expanded 5.8 desk + existing WorldLedger contracts; detailed actions are C01–C16. Access and slow-mode checks apply. Invitation-only posting does not make reading private. |
| D09 | Rehearse exact effects | Try a supported transaction in a disposable copy of a blockchain before signing. | Service + desk. Current runner supports NativeMarket swap and TimeVault lock/release intents; it is not universal simulation of every module. |
| D10 | Pinned before/after report | Show what balances, approvals, locks and authority changed in that practice run. | Local Anvil fork service, trusted source RPC and pinned source block. No wallet private key is sent to the runner. |
| D11 | Reject failed or stale rehearsal | Refuse to make a failed, changed or mismatched practice result signable. | Desk/service integration. Report binds chain, account, owner, epoch, nonce and exact transaction; review validity is short. |
| D12 | Keep private requests out of public rehearsal | Prevent shielded wallet details from entering the ordinary account-intent runner. | Implemented separation. Shielded RAILGUN payloads are unsupported there. |

A rehearsal report trusts the configured local runner. It is not a zero-knowledge proof, a forecast or a guarantee about the next block. Opening the hosted site does not start this service. Source: [live desk](../../web/genesis/live-desk.mjs), [live protocol](../../web/genesis/live-protocol.mjs), [rehearsal engine](../../agent/rehearsal/engine.mjs), [operator instructions](BROADER-ANIMA.md).

## 7. Private wallet, v4 swaps, launches and withdrawals

The private wallet has its own secret. **Selling the NFT does not sell or transfer this private wallet.** It is also separate from the public signing wallet and Mint sanctuary wallets.

| ID | Function | Like you are five | Status and exact boundary |
| --- | --- | --- | --- |
| P01 | Create a private wallet | Make a separate private purse and lock its recovery data with your password. | Local encrypted wallet creation. It neither deposits assets nor starts the network automatically. |
| P02 | Restore a compatible recovery phrase | Reopen that kind of purse from its 12- or 24-word RAILGUN phrase. | Local wallet setup. Not a way to turn an ordinary public wallet seed into private NFT ownership. |
| P03 | Encrypted backup / restore | Save a locked copy and reopen it with its password. | Local authenticated backup; restoring requires an empty profile rather than overwriting the existing wallet. |
| P04 | Unlock / lock | Open the private data for this session, then close it. | Local. Locking terminates the privacy worker and invalidates its reviews. |
| P05 | Automatic lock / Hide screen | Close private access when the page is hidden or idle, or cover the app immediately. | Local. Private vault locks after five idle minutes; Hide screen or Ctrl+Shift+L also locks app mint/NFT/public sessions. It cannot lock every external wallet extension or undo submitted transactions. |
| P06 | Save encrypted notes | Keep readable personal words inside the locked private vault. | Local recoverable encryption. Separate from the original fingerprint-only Seal memory. |
| P07 | Save / reopen sealed launch drafts | Plan a token quietly before publishing anything. | Local encrypted drafts. Creating a draft creates no token or pool. |
| P08 | Configure chain and services | Tell the purse where its matching contracts, RPC, proof service and broadcaster are. | Service configuration. Current v4 UI supports Ethereum, Arbitrum and Polygon; code fingerprints and PoolManager linkage are checked. Settings persist encrypted only when the vault is unlocked. |
| P09 | Start private network session | Explicitly connect and synchronize the private purse. | Service: RAILGUN worker, RPC, synchronization, proof services and Waku/broadcaster infrastructure. These are not hosted by the NFT. |
| P10 | Reveal/hide private address | Show the private receiving address only when you ask. | Local display after session setup. Hiding a field does not erase prior disclosures. |
| P11 | Check spendable shielded balance | Ask how many ready-to-spend private token units are available. | Service; synchronization and required proof processing must complete. |
| P12 | Public shielding deposit | Move supported ERC-20 tokens from a public wallet into the private system. | Desk + external contracts/services. Public funding address, amount and time are observable. Approval and deposit have separate reviews. |
| P13 | Toggle private/public execution | Choose which purse and transaction path you intend to use. | Desk. Private execution is initially selected and never silently falls back to public signing. Switching mode invalidates the review. |
| P14 | v4 exact-input swap | Trade through an existing compatible Uniswap v4 pool. | Desk + contracts; private mode also requires services. Current typed route supports verified zero-hook or compatible creator-hook pools, wrapped-native ERC-20 when needed, minimum output, deadline and full-fill checks. |
| P15 | Set pool and trade terms | Choose token pair, fee, tick spacing, input amount and tolerated slippage. | Desk. A quote comes from the configured Quoter; later pool movement can change the result or make execution fail. |
| P16 | Launch a fixed-supply token | Create the token, its real v4 pool and initial liquidity together. | Desk + contracts; private mode also requires services. You choose name, symbol, supply, budgets, initial price, range, LP fee and salt. |
| P17 | Return launch leftovers | Put unused new tokens and quote funds back with the caller. | Contract behavior. Private execution returns eligible outputs/refunds through shielding; a failed application may still incur protocol/broadcaster fees. |
| P18 | Own transferable liquidity shares | Hold tickets representing a proportional piece of the initial pool position. | Contract behavior. New liquidity can issue proportional shares; no arbitrary administrator sweep. Shares represent this position, not the whole NFT. |
| P19 | Preview liquidity withdrawal | Read how much principal and accrued fees the shares currently represent. | Desk + contracts/RPC. Preview can fill 0.5% slippage minimums, which remain editable. |
| P20 | Redeem liquidity shares | Burn your chosen shares and receive their proportion of principal and fees. | Desk + contracts; private route also requires services. Requires minimum outputs/deadline; last holder receives rounding dust. |
| P21 | Review → prove → submit | Read private terms, generate the required proof, then explicitly send through a broadcaster. | Service. Expired fees or changed terms require a fresh review/proof; “prepared” is not “sent.” |
| P22 | Public transaction steps | Review and sign each required public transaction when public mode is selected. | Desk + wallet. Public signer and activity are linkable. |
| P23 | Pending guard / encrypted receipts | Remember an uncertain submission so it is not casually repeated. | Local encrypted state plus service receipt checking. An explicit “I checked” action clears the private pending marker; it is not automatic proof of settlement. |

Pool creation, token details, swaps, prices, amounts and timing remain public. Private execution does not hide all connection metadata or transfer private-wallet control with the NFT. This release includes no private withdrawal-to-arbitrary-public-address desk. Selected creator-hook policies and recipients remain public even when funding is shielded. Source: [v4 desk](../../web/v4/desk.mjs), [v4 client](../../web/v4/client.mjs), [private runtime](../../packages/privacy/src/runtime.mjs), [privacy boundaries](PRIVACY-AND-V4.md).

## 8. Vesting exits: remember, wait, sell, recover

| ID | Function | Like you are five | Status and exact boundary |
| --- | --- | --- | --- |
| X01 | Buy, remember and schedule | Practise buying, writing why and planning later sales together. | Local combined rehearsal. Live swap, note and exit funding are not all one atomic transaction. |
| X02 | Schedule an existing balance | Set aside coins already in the purse for future sales. | Local and separate onchain exit desk + contracts. Live funding uses the account's exact-allowance utility call. |
| X03 | Sell at maturity | Make one sale installment after the waiting period. | Local schedule generator; equivalent explicit live slice terms can be funded. |
| X04 | Equal installments | Divide the amount into several scheduled pieces. | Local generator supports 1–64 pieces. Rounding remainder goes to the final piece. |
| X05 | Custom installments | Give each piece its own date, amount/percentage, minimum received and sale window. | Local percentage editor; live desk uses explicit raw-unit rows. Model percentages must total 100%. |
| X06 | Read eligibility and actual results | See which pieces are waiting, eligible, sold or recoverable. | Local model or real onchain plan read, according to the desk used. |
| X07 | Execute an eligible installment | Sell only the piece whose date and rules allow it. | Desk + contracts. A permissionless external executor may also call it and pay gas. Failure leaves that slice's input unspent by the sale. |
| X08 | Pause / resume | Temporarily stop future sales and later permit them again. | Local or desk + contracts. Dates and locked amounts do not change. |
| X09 | Cancel future sales | Permanently stop the remaining planned sales. | Local or desk + contracts. Cancellation preserves original vesting dates; it is not instant unlocking. |
| X10 | Reauthorize after NFT transfer | Let the new owner review the old schedule's authority. | Local or desk + contracts. Reauthorization leaves it paused; resuming is a separate choice. |
| X11 | Recover matured cancelled/expired slices | Return eligible unsold input to the fixed NFT account. | Local or desk + contracts. Recovery cannot redirect assets or bypass their dates. |
| X12 | Decision links and exit export | Follow the original reason and save the rehearsal exit ledger. | Local records/export; live plans can carry an optional public decision digest. |
| X13 | Run the exit keeper | Have a separately running helper attempt eligible slices. | Service source: [exit keeper](../../agent/exit-keeper.mjs). Needs compatible deployed contracts, RPC and a funded executor. An open browser or elapsed time does not execute sales by itself. |

Source: [local exit UI](../../web/exit/app.js), [live exit UI](../../web/exit/live-ui.mjs), [exit contract](../../contracts/src/protocol/VestedExitVault.sol), [operator setup](EXIT-OPERATOR.md).

## 9. Mint sanctuary: one small wallet per project

| ID | Function | Like you are five | Status and exact boundary |
| --- | --- | --- | --- |
| B01 | New project wallet | Give one mint project its own small purse. | Local creation of a real independent EOA key. Not derived from the NFT or main wallet seed. |
| B02 | Pin project, contract, chain and recovery address | Write down exactly which project this purse is for. | Local signed policy and observed code pins. Recovery address must be an ordinary EOA in this desk. |
| B03 | Budget including gas | Limit what this app will spend on that project. | Application policy, not an onchain restriction on the EOA. Another app or exported/restored key can bypass it. |
| B04 | Encrypted backup / restore | Keep a password-locked copy of the project purse and policy. | Local. Tampered policy/backup authentication is rejected. |
| B05 | Copy funding address / read balance | Find the address and check its small balance. | Local copy or RPC read. Funding it is a public transfer that may link the funding wallet. |
| B06 | Unlock / lock all keys | Open a purse briefly or close every sanctuary key. | Local: keys relock after two minutes and when the page is hidden. |
| B07 | Compare project URL | Check the entered project address against the pinned origin. | Local comparison. Does not inspect every browser tab or certify the website. |
| B08 | Restricted direct mint | Prepare only a recognized direct collection mint call. | Real wallet desk + compatible collection/RPC. Unsupported allowlist proofs, arbitrary signatures, approvals, delegation and batches are refused. |
| B09 | Simulate, inspect code and review | Check the exact proposed mint before asking this project key to sign. | RPC and local policy. Changed contract or detected ERC-1967 implementation pins stop new calls; other proxy patterns may escape detection. |
| B10 | Sign and send exact mint | Send the particular reviewed transaction from this small purse. | Real wallet desk. Gas and actual receipts affect the reserved/spent budget. |
| B11 | Check pending / rebroadcast same transaction | Resolve uncertainty without inventing a second mint. | RPC service. Only the same signed transaction is rebroadcast; pending reservations block further signing until resolved. |
| B12 | Inspect an NFT without media | Check reported holding, approvals, pinned code and metadata status without opening unfamiliar pictures/scripts. | RPC reads and bounded inspection. Not a complete malicious-NFT scanner or guarantee. |
| B13 | Recover an NFT | Move an inspected ERC-721/ERC-1155 holding to the fixed recovery address. | Separate reviewed real transaction, subject to current ownership and unchanged code checks. |
| B14 | Recover native balance | Bring the eligible native balance home while allowing for gas. | Separate reviewed real transaction to the fixed recovery address. No general ERC-20 sweep desk is supplied here. |
| B15 | Confirmed activity | Read success/revert records and NFT IDs reported in mint receipts. | Local record of observed real receipts. Receipt claims still require current holding inspection. |

Source: [sanctuary desk](../../web/burners/desk.mjs), [wallet vault](../../web/burners/vault.mjs), [policy](../../web/burners/policy.mjs). Small independently funded balances are the containment boundary; isolation is not anonymity.

## 10. Memory and the form shaped by its history

| ID | Function | Like you are five | Status and exact boundary |
| --- | --- | --- | --- |
| M01 | Write any memory | Keep an idea, lesson or moment without making a trade. | Local journal with public or encrypted body; separate public onchain desk is D07. |
| M02 | Structured trading journal | Write why you trade, evidence, what would change your mind, exit plan, time horizon, risk, tags and feelings. | Local journal editor. These words are not executable stop-losses or automatic risk limits. |
| M03 | Private body / public body | Choose whether the journal's words are readable or password-encrypted in its archive. | Local encryption. Headers, time, authorship, links and approximate length remain visible. |
| M04 | Decrypt / lock bodies | Read private words here with the passphrase, then close them again. | Local. No password-reset service; losing the passphrase loses readable access. |
| M05 | Append a reflection | Add what you learned without secretly rewriting the original note. | Local append-only journal; contract personal-entry/reflection primitives also exist. Historical authorship is retained. |
| M06 | Link a successful fill | Compare the reason with the amount actually received. | Local atomic model path; D03 is the separate real public journaled-swap path. A local timestamp is not a blockchain timestamp. |
| M07 | Search / filters / awaiting reflection | Find readable notes and unfinished reviews. | Local search of bodies available on this device. Encrypted locked words are not searchable as plaintext. |
| M08 | Process statistics / execution CSV | Count journaling activity and export recorded executions. | Local statistics/export. No portfolio profit, tax basis, live price feed or profitability score is computed. |
| M09 | Optional form imprint | Let an entry's opaque commitment contribute to the visual layer. | Local bounded projection. Private text is not interpreted into shape; imprint can be omitted. |
| M10 | Compare original and lived form | Look at the starting appearance beside the history-influenced one. | Local view using admitted receipts and current base genome. Does not undo actions or guarantee a collision-free image. |
| M11 | Inspect an earlier activity layer | Revisit an earlier stage of the local form's activity. | Local history lens. Full protocol-wide chain event admission, reorg handling and metadata linkage remain incomplete. |
| M12 | Store public bytes or supplied ciphertext onchain | Keep a committed entry under the ledger's authorship/head checks. | MemoryLedger contract source. The contract receives no decryption key and cannot certify that supplied bytes are properly encrypted. The current typed live desk publishes public text. |

Source: [journal UI](../../web/memory/app.js), [journal engine](../../web/memory/engine.mjs), [crypto](../../web/memory/crypto.mjs), [MemoryLedger](../../contracts/src/memory/MemoryLedger.sol), [JournalSwapRouter](../../contracts/src/memory/JournalSwapRouter.sol).

## 11. Commons: rooms, people and public history

| ID | Function | Like you are five | Status and exact boundary |
| --- | --- | --- | --- |
| C01 | Common room / launch rooms | Have a place to talk generally or about a particular launch. | Local social model, WorldLedger contracts and the 5.8 Commons reading/posting desk. |
| C02 | Post and reply | Write a message or answer another message in the same room. | Local model and expanded desk + contracts. The live message limit is 1,024 UTF-8 bytes; replies cannot point into another room. |
| C03 | Link a receipt to discussion | Talk about the recorded action that caused the conversation. | Local causal feed and contract `postWithReceipt` primitive. |
| C04 | Create and customize a room | Choose its name, topic, accent and posting rules. | Local model and new desk + contracts. Room admin configures its settings; the world room is protected. Live name/topic limits are 48/256 UTF-8 bytes and slow mode is 0–3,600 seconds. |
| C05 | Invite / renew / accept | Invite an NFT account to a posting circle and let it accept. | Local model and new desk + contracts. Renewing an invitation may retain existing acceptance. Membership is not encryption. |
| C06 | Remove / ban / unban member | Control who may post next without rewriting old messages. | New desk + contracts for room admin or active moderator. Unbanning alone does not grant membership. Removing/banning clears acceptance and moderator flag. |
| C07 | Profile alias and appearance | Choose a public name and profile styling. | Local model and contract source. An alias is not verified identity. |
| C08 | Follow / block in your view | Choose whose activity you see. | Local model and contract preference records. Personal filters do not revoke another person's global access. |
| C09 | Preserve historical authorship | Keep the old speaker attached to old words after an NFT sale. | Model and contract attribution/epoch records. Buying the NFT does not make you the author of its former owner's messages. |
| C10 | Pretend personas / presence | Try ownership and social flows as local “you” and “guest.” | Local rehearsal. Persona switching is not impersonating a real wallet and does not reveal private keys. |
| C11 | Room directory | Find available rooms and move through the directory in pages. | New desk + contracts/RPC. Directory results are read at a pinned block with bounded page sizes. |
| C12 | Latest / older messages and access | Read a page of messages, its historical speaker and your current room role. | New desk + contracts/RPC. Uses one pinned block per read; changed custody/context or block identity invalidates the result. Onchain text is escaped when rendered. |
| C13 | Invite / remove moderator | Give a selected account the opportunity to help manage the room. | New desk + contracts. Only the room admin appoints moderators, and an invitation must be accepted before moderation becomes active. A moderator cannot remove another active moderator. |
| C14 | Withdraw membership acceptance | Stop accepting an invitation and deactivate an accepted moderator role. | New desk + contracts. The invitation/history remain. Open rooms still allow unbanned posting, and withdrawing acceptance does not remove the room admin's authority. |
| C15 | Hide/unhide message marker | Mark a message as hidden in a room view. | Contract source and local moderation model; no new dedicated live hide/unhide button. The 5.8 reader honors the marker, but public stored bytes remain readable elsewhere. |
| C16 | React to a message | Add or remove a supported reaction. | Local model and WorldLedger contract source. No new dedicated live reaction button in 5.8. |

Full hosted multiplayer and encrypted group chat are not supplied by these room primitives. The new Commons desk exposes real room operations while local profile, reaction and causal-feed screens retain their own scope. Every live write is an owner-wallet simulated/reviewed transaction; none is silently sent because a room was opened. Source: [live Commons protocol](../../web/genesis/live-protocol.mjs), [live Commons desk](../../web/genesis/live-desk.mjs), [local instruments UI](../../web/instruments/app.js), [WorldLedger](../../contracts/src/protocol/WorldLedger.sol).

## 12. Local economies, gifts, artifact sales and fee distribution

| ID | Function | Like you are five | Status and exact boundary |
| --- | --- | --- | --- |
| T01 | Exchange rehearsal | Try swaps with fictional balances before using a real desk. | Local integer reserve approximation, not a live v4 price/tick simulation. |
| T02 | Swap then lock output | Put the practice swap's received tokens straight into a timed box. | Local combined path; separate contract implementations exist. The current NativeMarket typed desk does not expose every combined option. |
| T03 | Vault future lens | Slide a future date to see what a schedule would make available. | Local read-only projection. Separate from S04, which actually advances model time. |
| T04 | Inherited sale: define terms | Practise fixed supply, sale window, allocations and raise targets. | Local plus GenesisLaunchpad/retained v4 source. Its inherited fixed policies are separate from the current user-configured no-hook v4 launch. |
| T05 | Contribute / withdraw before close | Put practice funds into a sale or take an allowed contribution back before it ends. | Local model and contract source. |
| T06 | Settle / claim / refund sale | Finish a sale under its recorded rules, then claim tokens or a failure refund. | Local model and contract source. Settlement is an action; moving a clock alone does not settle. |
| T07 | Offer a future gift | Set aside a chosen gift with a beneficiary and release date. | Local model and ConsentGiftRouter contract source. A personal beneficiary and an NFT-account beneficiary have different control continuity. |
| T08 | Accept / recall / expire gift | Accept the promise or return an unaccepted offer under its rules. | Local model and contract source. Once accepted, the donor cannot recall it. |
| T09 | Release gift | Give the matured gift to the fixed beneficiary. | Local model and contract source. The caller cannot change who receives it. |
| T10 | List / inspect / buy whole artifact | Sell the NFT with declared account holdings and known obligations. | Local model and EstateExchange contract source. Manifest checks occur around transfer; private passwords and past authorship do not transfer. |
| T11 | Cancel or refresh a listing | Cancel an unsold offer or make a new review when its contents changed. | Local model and contract source. Completed sales are not undone. Unknown external liabilities are not automatically discovered. |
| T12 | Commitment ledger | Inspect known locks, gifts, grants, commissions, shelves, cells and other tracked obligations. | Local model and CommitmentIndex contract source. Bounded module inventory, not a universal balance sheet. |
| T13 | Choose fee recipients and weights | Decide how to divide collected fees among chosen addresses. | Local calculator/export plus reviewed OwnerFeeRouter `configureSplit` call. No required platform allocation is added by this router. |
| T14 | Deposit / allocate / claim fees | Collect native/token fees and let their recorded recipients claim them. | OwnerFeeRouter contract source. Earned claims retain their original recipients after the future split changes. |
| T15 | Convert fee assets explicitly | Use an approved converter and a chosen minimum to receive another token. | Contract source + actual converter/liquidity integration. Saving a preferred output-token field does not convert anything. |
| T16 | Owner-configured fee hook | Route configured hook fees using the retained owner-controlled hook. | Integrated public/shielded composition with explicit creator policy, optional commitments and recipient routing. Shielding does not hide its administrator or fee terms. |
| T17 | Fixed-supply token/configuration factory | Create a token and record owner-selected configuration commitments. | OwnerLaunchFactory contract source and retained code path. A configuration record alone does not create a pool or liquidity; the current main Launch entrance opens the full v4 desk. |

Source: [instruments](../../web/instruments/app.js), [gift router](../../contracts/src/instruments/ConsentGiftRouter.sol), [estate exchange](../../contracts/src/kingdom/EstateExchange.sol), [commitments](../../contracts/src/operating/CommitmentIndex.sol), [fee router](../../contracts/src/confluence/fees/OwnerFeeRouter.sol), [owner factory](../../contracts/src/confluence/fees/OwnerLaunchFactory.sol), [privacy/v4 separation](PRIVACY-AND-V4.md).

## 13. Worlds and executable cartridge NFTs

| ID | Function | Like you are five | Status and exact boundary |
| --- | --- | --- | --- |
| W01 | Prism Relay | Grow territory across a 9 × 9 board and collect valuable prisms. | Local tactical game with an opposing player controlled by the supplied game logic; 36-move match. No token payout or network multiplayer. |
| W02 | Lumen Drift | Move through light, gather it and avoid drifting shadows. | Local arcade game. No chain settlement is implied. |
| W03 | Paint a Prism world | Place prisms, walls and plain spaces while preserving usable starts. | Local editor with validation before play. |
| W04 | Import / export / reset a world | Save a board, reopen it, or return to the default board. | Local JSON tools. |
| W05 | Import HTML game | Try a self-contained game file in a separate play box. | Local isolated frame, up to 1 MiB, no wallet or network access granted by the launcher. Unsupported remote resources cannot load. |
| W06 | Export cartridge manifest | Save the game's identity, byte fingerprint and declared capabilities. | Local content-pinned manifest. Export alone does not mint the cartridge or store all game bytes onchain. |
| W07 | Mint cartridge NFT | Create a token describing a game/tool and its executable fingerprint. | CartridgeRegistry contract source. JSON meaning is validated by publishing clients, not fully by the registry. |
| W08 | Update / freeze cartridge manifest | Revise the label while editable, or lock its manifest and executable fingerprint permanently. | Contract source. Changing an unfrozen content hash clears the old stored executable. |
| W09 | Publish exact cartridge bytes | Put a small complete executable into contract storage if its hash matches. | Contract source, maximum 24,576 bytes per cartridge. The 1 MiB local import limit does not enlarge this onchain limit. |
| W10 | Read ownership and launch owned cartridge | Check that the master account holds the selected cartridge, verify its bytes, then run it. | Desk + contracts for loading; execution is local. Ownership/controller/epoch are re-read. Public game bytes can still be copied outside this ownership-gated launcher. |
| W11 | Transfer cartridge control with master | Let the new master-NFT owner control an account-held cartridge. | Contract ownership model. The cartridge remains in the account; acquisition does not give the game spending power. |
| W12 | Exit game | Close its frame and return to the object's tools. | Local cleanup. No contract transfer or financial operation. |

Source: [Worlds UI](../../web/confluence/app.js), [CartridgeRegistry](../../contracts/src/confluence/cartridges/CartridgeRegistry.sol), [wallet loader](../../web/confluence/wallet.mjs).

## 14. Library, Work and the instrument workshop

The **Library** inside ANIMA is the project's instrument-edition module. It is not a connection to a separate document-storage service.

| ID | Function | Like you are five | Status and exact boundary |
| --- | --- | --- | --- |
| L01 | Publish an edition | Publish a named recipe made from exact content pieces. | Local model and EditionRegistry contract source, with content and parent commitments. |
| L02 | Read / collect an edition | Inspect its recipe and collect the model's edition object. | Local model; onchain edition reads exist. Local collectibles are not automatically real cartridge NFTs. |
| L03 | Adopt / grant / revoke edition use | Decide separately whether to keep a tool and whether it may perform an exact bounded action. | Local model and account contract source; A10–A12 explain the authority rules. |
| L04 | Fund a commission | Put a fixed payment aside for a named worker and reviewer with a deadline. | Local Work model and CommissionEscrow contract source; workshop gives the calendar-specific live desk. |
| L05 | Worker accepts / submits | Let the worker accept the terms and commit the delivered result's fingerprint. | Contract source and local/provider tooling. The worker must use its own authority. |
| L06 | Reviewer accepts / rejects | Pay for accepted work or return rejected work's funding under its terms. | Contract source and workshop desk. A fixed reviewer is an explicit trust choice; a digest is not proof of usefulness. |
| L07 | Expiry refund / withdraw credited payment | Return expired funding or withdraw money already credited to its fixed recipient. | Contract source and workshop desk. A caller triggering withdrawal cannot choose a different recipient. |
| L08 | Snapshot release-calendar inputs | Read up to 48 selected public TimeVault locks at one pinned block. | Workshop desk + compatible deployed publisher/vault and NFT connection. Does not export shielded balances or private notes. |
| L09 | Preview deterministic release calendar | See exactly which scheduled amounts become available at future dates. | Local compiler from that snapshot. Accounts for cliff/linear vesting and amounts already released; it does not predict token prices. |
| L10 | Download calendar / provider request | Save an ordinary calendar file or the selected work request. | Local exports; sharing selected public records and publishing the accepted instrument require explicit consent in the desk. |
| L11 | Choose provider, evaluator, budget and deadline | Tell the workshop who does the work, who judges it, how much to pay and when. | Workshop desk + contracts. Blank evaluator defaults to the current NFT account; an external evaluator needs its own signing flow. |
| L12 | Rebuild and validate deliverable | Recompute the exact expected calendar instead of trusting a random uploaded program. | Local deterministic validation; altered HTML, manifest, compiler identity or digests are rejected. |
| L13 | Acquire paid cartridge | Turn accepted calendar work into a frozen executable cartridge held by the master NFT account. | Separate reviewed transaction via CommissionedCartridges. Each work ID can be acquired once. Acceptance and acquisition are separate actions. |
| L14 | Open commissioned instrument | Run the acquired calendar through the existing owned-cartridge launcher. | Desk + contracts for custody check; local isolated execution. It is read-only and grants no automatic token-release authority. |
| L15 | Provider build / verify / plan CLI | Let a provider reproduce the file and prepare unsigned accept/submit requests. | Local command-line source. It neither pays for an AI service nor automatically signs the provider's transactions. |
| L16 | Bonded sell shelf | Place a model collectible or supported real item in a fixed-price shelf with a holding period. | Local model and BondedShelf contract source. Buy the item; after the bond, withdraw proceeds or recover an unsold item. This is not a two-sided AMM. |

Source: [operating UI](../../web/operating/app.js), [EditionRegistry](../../contracts/src/operating/EditionRegistry.sol), [CommissionEscrow](../../contracts/src/operating/CommissionEscrow.sol), [workshop desk](../../web/workshop/desk.mjs), [calendar compiler](../../web/workshop/calendar.mjs), [publisher](../../contracts/src/confluence/cartridges/CommissionedCartridges.sol), [provider CLI](../../scripts/workshop-provider.mjs), [workshop guide](BROADER-ANIMA.md).

## 15. Laboratory: explicitly funded experiments

These screens rehearse economic mechanisms. Their matching source contracts require separate compatible deployments/integrations. Enabling a local experiment does not deploy it. A cell isolates the route's allocated funds; generic owner account execution and independent direct module calls remain separate capabilities.

| ID | Function | Like you are five | Status and exact boundary |
| --- | --- | --- | --- |
| Q01 | Create/fund a cell | Put a chosen small pile of assets into a separate experiment box. | Local model and ExperimentCell/Factory contract source. It does not automatically take the whole main balance. |
| Q02 | Adopt/revoke adapter | Choose which tool the box may call, or take that choice away. | Contract source and local enabling model. Contract pins adapter code and current custody epoch. |
| Q03 | Execute with effect limits | Let the chosen tool work only with declared inputs, outputs and timing. | Contract source. Minimum effects and temporary approvals are checked for that cell route. |
| Q04 | Return free capital | Bring unused, uncommitted assets back to the main purse. | Local model and contract source. Collateral and invested/escrowed positions are not free balance. |
| Q05 | Granary deposit / redeem | Exchange assets for strategy shares and back again. | Local illustration and ERC-4626 adapter source. A live strategy, its solvency and withdrawal liquidity must exist separately; no yield is promised. |
| Q06 | Granary loss rehearsal | See what a 50% loss does to the example strategy position. | Local stress control only. It does not manipulate a real vault's value. |
| Q07 | Issue basket shares / redeem | Make shares backed by a fixed two-asset recipe, then redeem that backing. | Local model and FixedBasket source. Deposits round up, redemptions down; not tokenized ownership of everything in the master NFT. |
| Q08 | Strips create / recombine | Split a position into matched study pieces and put matching pieces back together. | Local model and MatchedIncomeStrips source. Proportional losses apply; not an independently tradable principal/yield-token market. |
| Q09 | Strips loss rehearsal | Test a 50% loss before putting the matched pieces back together. | Local stress control only. |
| Q10 | Counter request / fund credit | Agree on fixed collateral, loan amount, repayment and dates. | Local model and FixedTermCredit source. No automatic oracle valuation or master-NFT pawn authority. |
| Q11 | Counter repay / deadline settlement | Repay to recover collateral, or apply the agreed default/offer-expiry rules. | Local model and contract source. Collateral value may fall below the debt. |
| Q12 | Scrivener write / buy covered call | Lock real cover for a right someone may buy to exchange at a fixed strike. | Local model and CoveredCallBook source. Full underlying cover is required; no naked options. |
| Q13 | Scrivener exercise / cancel / reclaim | Exercise within the terms, cancel before sale, or recover unused cover after expiry. | Local model and contract source. No automatic exercise or guaranteed fair premium. |
| Q14 | Inspect cell commitments | See recorded cell assets, adapters and obligations when assessing the artifact. | Local model and contract snapshot/commitment source. Known tracked assets are bounded; unknown outside obligations are not discovered magically. |

Source: [laboratory UI](../../web/operating/app.js), [cell](../../contracts/src/operating/ExperimentCell.sol), [experimental adapters](../../contracts/src/operating/ExperimentalAdapters.sol), [credit/options](../../contracts/src/operating/NegotiatedMarkets.sol), [deployment boundaries](../v1.6/DEPLOYMENT-GATES.md).

## 16. Saving, immutable delivery and operator functions

| ID | Function | Like you are five | Status and exact boundary |
| --- | --- | --- | --- |
| H01 | Export / import full local archive | Pack the local organism, instruments, memories, route plans and world into a file and review a restore. | Local archive/checksum validation. Separate private wallet/burner backups are not replaced by this export. Plaintext public/model data remains readable in its export. |
| H02 | Recompute local receipts / protect corrupt history | Check that saved records fit together before replacing good state. | Local verification. Detecting inconsistency is not proving a blockchain transaction or a real author's signature. |
| H03 | Save independent preview | Start a new local creature after preserving the old one. | Local. Does not undo ascension of an existing identity or mint a token. |
| H04 | Immutable app chunks | Store the core website's bytes as many small permanent onchain pieces. | OnchainApp/AppChunk source and tested local deployment. A hash by itself would not store the app; these chunks do. |
| H05 | Recover and verify the app | Read those pieces and check that they reconstruct the expected program. | Loader + RPC/browser. Computation and rendering happen on the device, not inside the EVM. |
| H06 | Immutable privacy-worker shards | Store the large optional worker as compressed chunks across a fixed directory. | ShardedResource/OnchainApp source and tested local recovery: seven shards, 199 chunks in the 5.7 fixture. |
| H07 | Lazy, bounded worker recovery | Fetch the worker only when needed, verify it and stop/cancel failed recovery safely. | Loader + RPC/browser. Pinned-block reads, compressed/expanded hashes and decompression bounds are checked. |
| H08 | Explicit verified mirror | Let an owner choose an HTTPS copy matching the edition's pinned worker bytes. | Optional service configuration. Recovery failure cannot silently choose a remote replacement. |
| H09 | Local complete development world | Start a local chain, deploy the development modules, mint and exercise a test-token market. | Operator tooling: `genesis:local`. Test fixtures, published mnemonic and development addresses must not be confused with a public deployment. |
| H10 | Build / compile / archive / validate | Rebuild the source, run tests and verify exact recovered bytes. | Operator tools. A successful build is not publication, a funded private transaction or an independent security audit. |
| H11 | v4 unsigned deployment plan | Prepare addresses, bytecode and gas budgets without sending contracts. | Operator tooling in `v4-deployment.mjs`; explicit broadcast path exists separately. No deployment is performed by this guide. |
| H12 | One-time trust/module setup and freezing | Install the selected modules/verifiers and permanently seal applicable configuration. | Administrator/deployer contract functions. Distinct from an ordinary NFT owner's day-to-day buttons; irreversible freezes are real changes. |
| H13 | Threshold attestations and proof adapters | Ask a configured checker whether an action statement is acceptable. | Contract source/local fixtures. Threshold signatures are not secretly zero-knowledge proofs. Production zkVM/TEE gateway execution requires the corresponding external implementation. |
| H14 | Remote witness records | Record a witness supplied by an allowed remote-domain adapter. | Registry contract source. This does not implement a complete authenticated bridge or give a remote copy duplicate spending authority. |
| H15 | Offline Genesis deployment plan | Write an exact ordered shopping list of contracts and configuration calls for an unminted collection. | New operator tooling: `genesis-deployment.mjs`. Predicts CREATE addresses from explicit chain/deployer/nonce and selected trust settings. No RPC, key, gas estimate, mint or broadcast. Supports local/Sepolia/Base Sepolia; rejects mainnet. |
| H16 | Reconstruct and verify deployment plan | Rebuild that list from current artifacts and archived bytes, and reject changes. | New offline verification. Checks all request fields, order, nonce effects, module bindings and archive identity. This is not onchain verification of a completed deployment. |

The full local Genesis deployment helper deliberately only runs on chain 31337. The new offline planner prepares the unminted native stack without local fixture secrets or pretend funding; separately executing and verifying that plan still requires an operator and live chain checks. The older public-testnet core deploy script is not a full Genesis deployer. Uniswap v4 deployment remains a separate workflow. Circuit proving files, RPC access, synchronization, broadcasters, signing and local computation remain outside immutable app storage. A conventional hosted URL is still hosting; owning an onchain edition does not make all external services immortal.

Source: [archive](../../web/confluence/archive.mjs), [chain loader](../../web/confluence/chain-loader.mjs), [worker recovery](../../web/privacy/recover-resource.mjs), [app storage](../../contracts/src/protocol/OnchainApp.sol), [resource directory](../../contracts/src/protocol/ShardedResource.sol), [local deployment](../../scripts/lib/genesis-stack.mjs), [offline deployment guide](GENESIS-DEPLOYMENT.md), [proof router](../../contracts/src/core/ProofRouter.sol), [witness registry](../../contracts/src/core/OmnichainWitnessRegistry.sol).

## 17. Implemented extensions from the unfinished-integration backlog

Open **Atlas → New instruments**. The original section contained proposals; this release adds contracts, clients, running services and local lifecycle tests. The table describes what is actually built. It does not claim that a private-key transfer, complete MMORPG, arbitrary EVM proof system or unrestricted autonomous intelligence has been solved. No public-chain deployment has been performed.

| ID | Capability | What you can do now | Setup and exact limits |
| --- | --- | --- | --- |
| F01 | Continuous clearing auction | Fund a streamed sale, leave a standing bid, advance uniform-price clearing, cancel and claim tokens or refunds. | [Markets](extensions/MARKETS.md). Independent bounded ANIMA mechanism, 64 orders; no Uniswap CCA compliance or automatic pool migration. |
| F02 | Private agent-memory transfer | Publish encrypted memory, encrypt a handover for a recipient, let them decrypt and verify before atomic NFT acceptance, and recover accepted memory later. | [Privacy](extensions/PRIVACY.md). Back up encryption keys. Recipient-confirmed content, not ERC-7857/ZK handover; sender can retain old content. |
| F03 | Continuous live agent | Run a persistent operator against exact owner-approved calls, native budgets, call counts, waiting times and expiry. Revoke it or invalidate it by transferring custody. | [Agents](extensions/AGENTS.md). A scoped Bound-account operator; unrestricted adaptive decision-making and Sovereign-mode proof generation are outside this implementation. |
| F04 | Authenticated omnichain portal | Seal explicit LayerZero libraries/DVNs/executor, queue a custody-bound observation, quote delivery and dispatch it to the pinned peer. | [Privacy](extensions/PRIVACY.md). Requires real endpoints, both deployed peers and transport funding. Local tests use endpoint doubles. Remote witnesses grant no spending power. |
| F05 | Encrypted group chat | Invite and accept members, rotate complete encrypted epoch packages, send/decrypt ciphertext messages, remove members and restore backed-up identities. | [Privacy](extensions/PRIVACY.md). Custom WebCrypto protocol, not MLS or forward-secret. Membership/timing are public; old key holders retain old messages. |
| F06 | Public-goods matching | Fund a matching pot, attest bounded participant identities, contribute/withdraw, finalize quadratic matching and pay projects or recover unused funds. | [Markets](extensions/MARKETS.md). Frozen registrar and identity policy are explicit trust assumptions; Sybil identities/collusion are not cryptographically eliminated. |
| F07 | Sponsored transactions | Grant a scoped relay session, exchange exact owner/sponsor signatures, submit as relayer and claim bounded gas reimbursement from a deposit. | [Access](extensions/ACCESS.md). Native session relay, not ERC-4337. Failed authorized calls consume vouchers; fixed overhead and a signed cap can leave relayer costs uncovered. |
| F08 | House | Open/fund real leveraged spot positions, sell and settle lender-first proceeds, repay debt, cancel unfilled offers or exit in kind after maturity plus grace. | [Experimental markets](extensions/EXPERIMENTAL.md). Test-network gate, real oracle/venue/liquidity required. Isolated spot leverage replaces the original pooled synthetic proposal. |
| F09 | Wager | Fund binary outcomes, sell or transfer funded sides, propose/challenge answers, arbitrate, finalize and refund missed-deadline markets. | [Experimental markets](extensions/EXPERIMENTAL.md). Named resolver/arbiter, immutable question/source/bonds/deadlines; fully funded claims and perpetual withdrawals. |
| F10 | Wake | Prepay a keeper lease, compensate takeover, settle fractional rent, run bounded tasks and use public fallback after a stall or expiry. | [Experimental markets](extensions/EXPERIMENTAL.md). Fixed task adapter and explicit test-network activation. Underlying permissionless exits remain public. |
| F11 | x402 / ERC-8183 | Review and pay an exact supported HTTP x402 service; separately create/fund provider jobs, judge deliverables, pay or refund. | [Agents](extensions/AGENTS.md). Official x402 v2 exact EIP-3009 SDK path; separate non-hooked ERC-8183 draft kernel. Requires supported token, funded service wallet and configured provider. |
| F12 | Provider discovery / reputation | Browse signed provider registrations, inspect metadata and compare job-attributed feedback; sign your own registration. | [Agents](extensions/AGENTS.md). ANIMA-native discovery, not an ERC-8004 registry. A signature authenticates a wallet, not a human or service-quality claim. |
| F13 | Arbitrary generated instruments | Export a commission request, fund real escrow, inspect the provider’s exact HTML/JS and manifest, approve/reject, acquire frozen onchain code and run it in isolation. | [Worlds and instruments](extensions/WORLDS.md). Hashing and human review do not certify safety. No default wallet bridge; exact proposals need a separate grant and transaction review. |
| F14 | Cryptographically proved rehearsal | Generate a real Groth16 proof of one-hop NativeMarket fee/rounding/minimum/reserve math; check account/nonce/custody/current state before reviewing a swap. | [Proof](extensions/PROOF.md). Development trusted setup only. Full EVM execution, token behavior, transfer success, gas and future state are not proved. |
| F15 | Shared world / civilization | Join a persistent multiplayer server, explore, gather, craft, fight, found towns and trade with other clients; NFT transfer invalidates old sessions. | [Worlds and instruments](extensions/WORLDS.md). Working civilization slice, not a finished mature MMORPG. Operator-authoritative game state; game coins have no onchain withdrawal. |
| F16 | ENS / domain mint entry | Create a personal mint slot, save its secret, commit an endowment, mint-and-name atomically, recover expired commitments and resolve a name into its NFT account. | [Access](extensions/ACCESS.md). Requires a delegated ENS parent; deterministic anima-TOKEN_ID subname. Domain purchases/renewals and ancestor trust are separate. |
| F17 | Whole-NFT fractional shares | Deposit an unused Bound NFT, transfer shares, make/vote on funded buyouts, withdraw proceeds or reunite all shares for whole-NFT redemption. | [Markets](extensions/MARKETS.md). Account execution freezes in custody. Private keys, previously granted external rights and universal offchain claims are not share backing. |

Start with the [extension deployment guide](extensions/DEPLOYMENT.md) and the [5.9 build record](BUILD-5.9.md). The unsigned planner builds concrete CREATE/configuration requests; receipt inspection produces a directory of actual deployed runtime hashes. Import that directory into New instruments. Older immutable NFT editions retain their old embedded runtime.

## 18. What changes when you use or transfer it?

| Thing | What actually changes |
| --- | --- |
| Look, fly, fold, pause, preview a seed or play a local game | Your device's view/local state. These actions do not by themselves change chain ownership. |
| Original local Evolve / memory / descendant actions | The local creature and its receipt history. |
| Confirmed onchain Evolve | The contract genome, roots, evolution count and rendered snapshot. |
| Local economic activity and optional journal imprints | The bounded local lived-form layer. Automatic complete chain-to-form indexing is not claimed. |
| Confirmed transaction from the NFT account | The relevant contract balances/state and account audit/action records. |
| A Bound master NFT transfer | Its account controller, custody/session epoch and corresponding account-held rights. Existing obligations retain their rules; old grants must not remain valid for the buyer. |
| Private wallet, sanctuary keys and journal passwords | They remain separately controlled secrets. The NFT transfer does not deliver or reset them. |
| Public messages and historical authorship | Public history remains. The buyer does not become the original speaker. |
| Published immutable app/renderer edition | Its bytes stay fixed. A later hosted release or source commit does not rewrite that minted edition. |

The source makes the NFT's ownership and account authority concrete. It also keeps the distinction between a beautiful preview, a prepared action, a signed transaction and a confirmed result visible. That distinction is what lets each tool tell you plainly what it has really done.
