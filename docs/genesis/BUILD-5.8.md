# Genesis 5.8 — Commons, function guide and deployment preparation

This continuation starts from GitHub commit `9222776db69648c0261094008249dc40b2311013`. It adds usable onchain Commons controls and a complete plain-language function inventory, and closes the tooling gap between the local Genesis fixture and public testnet deployment preparation. No Solidity contracts were changed.

## What changed

- **Commons:** read bounded pages of rooms/messages at one block; create/configure rooms; post/reply; accept/withdraw invitations; invite/remove/ban/unban members; appoint/remove moderators. Each write uses the existing NFT-owner simulation/review/signing path. The ABI now matches WorldLedger's actual room and message getters.
- **Review correctness:** a candidate transaction is withheld while final Commons context checks await RPC. Superseded requests cannot substitute an unreviewed call beneath another visible review. Settings reads populate the selected room's controls, reset publication consent, and scope cached values to the ledger and wallet context.
- **Function explanations:** [the full guide](FUNCTIONS-EXPLAINED.md) contains 271 numbered explanation entries, including all 31 original Atlas actions and seven secondary views. These are explanations of capabilities, entrances and boundaries, not a count of distinct Solidity ABI methods. The in-app capability map explains 43 feature groups and matches the system manifest.
- **Deployment preparation:** [the offline planner](GENESIS-DEPLOYMENT.md) validates the app and worker archives, builds the complete unminted native stack's unsigned CREATE/configuration requests, predicts addresses across every nonce, and reconstructs saved plans against the current build. It has no signer, network, mint, funding or broadcast path.

## Verification performed for this edition

The selected regression command completed with **197 tests passed, zero failed, zero skipped**:

```sh
node --test test/genesis/*.test.mjs test/confluence/*.test.mjs test/instruments/*.test.mjs test/rehearsal/*.test.mjs test/workshop/*.test.mjs test/privacy/*.test.mjs test/exit/*.test.mjs test/burners/*.test.mjs
```

This includes 15 new tests: seven Commons tests, six deployment-plan tests and two capability-map tests. The tests exercise real local EVM transactions, custody/epoch changes, invitations and moderator acceptance, message pagination and reorg rejection, settings hydration, delayed preparation, escaping, plan tampering, archive corruption, exact constructor wiring and immutable seals. The first broader attempt passed 188 checks and failed the fork test because the separate pinned Anvil package was absent; after installing the repository's declared dependency, the final command above passed in full.

Solidity compilation with solc 0.8.30 / Shanghai passed its EIP-170 size checks. The current application build, archive generation, source syntax checks and embedded import/asset verification passed. The final core archive contains **804,005 bytes in 35 chunks**, expands to **1,781,989 bytes**, and includes **53 embedded modules**. SHA-256: `c610c0941e6082037a48f506c13b131b43957e612ddc673a02a226b8dd6e3172`.

The complete final local fixture deployed the stack, minted an NFT, verified the sealed directory and reconstructed the exact core app and privacy worker from chain 31337. The worker remains **15,010,237 bytes**, compressed to **4,570,220 bytes in 199 chunks across seven shards**. [Local deployment evidence](../../reports/confluence/local-deployment.json) contains test-only addresses; they are not public-chain deployment addresses.

Preparing and verifying a plan against these final full archives succeeded using explicit dummy testnet addresses: **277 unsigned requests (270 CREATE + seven configuration calls), 234 archive chunks, 5,374,225 stored archive bytes, and 5,706,346 calldata bytes**. Gas and fees are unestimated. The example config is validation input, not the user's selected deployment configuration.

Independent code review found the two Commons issues described above; both were fixed and their regression tests passed. A separate planner review led to stricter embedded gzip/expanded-length checks, compiler identity checks, exact dependency-wiring assertions and exclusive output-file creation.

The approved original HTML, exterior optical shader, shared optical source, interior volume kernel and GenesisSVG source remain byte-identical to the starting GitHub commit. Native renderer and physical-device tests were not rerun. Browser inspection was attempted, but the managed browser blocked the local address with `ERR_BLOCKED_BY_CLIENT`; browser visual verification is therefore **not** claimed. The historical 406-test 5.7 report remains a separate baseline; the full inherited validation command was not rerun in this edition.

## Remaining activation work

Public-chain deployment, minting, v4 liquidity/services and funded shielded lifecycle verification remain outstanding. The planner covers the native Genesis stack; owner-specific fee configuration, v4 activation, keepers, workshop providers, proving circuits, RPC and broadcasters retain their separate setup requirements. A public pool or room is publicly readable. Secret material stays offchain, and NFT transfer does not transfer private-wallet or burner secrets.

No hosted comparison site was republished. Existing immutable minted editions retain their original code. These additions take effect in the updated source/hosted app and in a new archive edition deployed through the appropriate release process.
