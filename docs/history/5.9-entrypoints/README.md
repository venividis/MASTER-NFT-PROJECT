# ANIMA NFT · Anima Genesis

**5.9:** Section 17 now has a working extension suite: auctions, encrypted memory and chat, authenticated cross-chain witnesses, funded matching, sponsored actions, leveraged spot positions, outcome markets, keeper leases, scoped agents, paid services, provider discovery, generated instruments, a real bounded Groth16 quote proof, a persistent multiplayer world, named minting and NFT custody shares. Open **Atlas → New instruments**. Read [every function and its exact scope](docs/genesis/FUNCTIONS-EXPLAINED.md), [the build record](docs/genesis/BUILD-5.9.md), and [extension deployment and service setup](docs/genesis/extensions/DEPLOYMENT.md). Some broad proposals remain deliberately narrower: this is not a complete mature MMO or arbitrary-EVM proof system. No public deployment is claimed.

**5.6:** The broader ANIMA project starts here: pinned-block transaction Rehearsal and an instrument workshop that turns an accepted release-calendar commission into a frozen executable cartridge NFT owned by the master NFT. See [the implemented milestone and operator guide](docs/genesis/BROADER-ANIMA.md). Canonical source: [venividis/ANIMA-NFT-](https://github.com/venividis/ANIMA-NFT-).

**Retained from 5.5:** Free exploration through the mathematical blue object, plus shielded execution controls and a real v4 token/pool/liquidity lifecycle. Private wallet data and launch drafts are encrypted; private transactions fail closed when services or deployments are unavailable. No public-chain deployment or funded RAILGUN end-to-end validation is claimed. Start with [START-HERE.md](START-HERE.md), [privacy and deployment boundaries](docs/genesis/PRIVACY-AND-V4.md), and [the build report](docs/genesis/BUILD-5.5.md).

The fourth separate experience begins in the original blue **I don’t fucking believe it** interface. Its original controls remain available. Select **Atlas** or **Enter the object** to have that same blue optical field become an instrument, forming contours, individual words, values and native controls over approximately twelve seconds. Closing returns the field to its original body.

[Open Anima Genesis](https://anima-genesis.edwincardenas.chatgpt.site). Compare [Anima Begins](https://anima-begins.edwincardenas.chatgpt.site), [Spirit Anima](https://spirit-anima.edwincardenas.chatgpt.site) and [AWE Confluence](https://awe-confluence.edwincardenas.chatgpt.site).

Atlas brings together the original object workflows, every expanded instrument, and the secondary form, receipts, applications, venues, clock and capabilities views. It opens the retained workflows, preserving their state checks and confirmations. **Complete formation** skips the animation. Reduced-motion preferences open usable controls immediately.

## Remembered exits and mint sanctuary

Trade now combines an optional journal entry with a funded vesting exit: sell at maturity, in equal installments, or on a custom percentage/date/minimum schedule. Atlas adds **Vesting exits**, **Onchain vesting exits** and **Mint sanctuary**. The sanctuary creates independent encrypted project wallets, reviews a narrow set of direct mint calls, inspects receipt-reported NFTs without loading media, and provides explicit recovery.

Local rehearsal is immediately usable. Live exit schedules require deployed compatible contracts and a separately provisioned funded executor. The mint sanctuary uses real keys and real transactions only after explicit reviews; it does not observe external wallet connections. Small isolated balances are the security boundary, not a promise of an unhackable wallet.

See [implementation and protection boundaries](docs/genesis/EXIT-AND-MINT-SANCTUARY.md) and [exit operator setup](docs/genesis/EXIT-OPERATOR.md).

## Run

```sh
npm ci
npm run build
npm run demo:confluence
```

The website begins in local exploration. Economic instruments use local rehearsal balances unless an explicit live adapter is selected. Original connection and the expanded NFT-account connection remain separate workflows. No automatic wallet request or public-chain deployment occurs.

## Verify and archive

```sh
npm run test:genesis
npm run test:confluence
npm run test:exits
npm run test:burners
npm run archive:confluence
npm run verify:confluence
npm run deploy:confluence:local
```

`python test/genesis/blue_projection.py` additionally requires native EGL/GLES and checks actual original/projected pixels. It is not a browser or mobile-device certification.

See [Genesis implementation and validation](docs/genesis/IMPLEMENTATION.md). Inherited protocol architecture and source research remain in [Confluence documentation](docs/confluence/ARCHITECTURE.md). This is a development release, with explicit wallet reviews and retained custody/permission boundaries.
