# Genesis 5.9 — Section 17 extension implementation

Release evidence recorded on **13 September 2026**, continuing the GitHub PR source at `a400e7ba1060b005e96b447d267e44e0e8ceed4f` (tree `6ee88933edbf61d31c06d629a3370ac322b12d31`). This edition adds callable implementations, browser entry points, local services and deployment preparation for all 17 section 17 backlog entries. Their precise supported mechanisms are listed below. F03, F14 and F15 retain broader research scope beyond these implementations; a mature MMORPG, unrestricted autonomous agent and general EVM execution proof are not completed by this release.

Open **Atlas → New instruments** in the updated Genesis application. The extension workbench imports a separately inspected deployment directory, checks runtime code, prepares typed calls and uses the existing transaction review. Dedicated private-data, agent, proof and world desks handle flows that need more than a generic calldata form. New contracts and services require explicit deployment and configuration; this report does not describe a public deployment.

## All 17 entries and their actual scope

| ID | Implemented workflow | Boundary and detailed guide |
| --- | --- | --- |
| F01 | Fund a streamed uniform-price auction; place standing bids, advance bounded clearing, cancel and claim assets/refunds. | Independent 64-order ANIMA mechanism; no Uniswap CCA compliance or automatic v4 migration. [Markets](extensions/MARKETS.md) |
| F02 | Encrypt agent memory, offer a recipient-specific handover, decrypt and verify before atomic NFT acceptance, and recover accepted memory. | Recipient confirmation, not ERC-7857/ZK/TEE verification; the seller can retain old content. [Privacy](extensions/PRIVACY.md) |
| F03 | Run a persistent worker using exact owner-approved calldata, native budgets, call limits, intervals, expiry and custody invalidation. | Bound-account sessions and an external running process. Unrestricted adaptive agents and Sovereign-mode proof generation remain outside scope. [Agents](extensions/AGENTS.md) |
| F04 | Configure and seal LayerZero V2 transport settings; queue, quote and dispatch a custody-bound observation to a pinned peer. | Read-only historical observations; two local chains use an endpoint fixture. Real endpoint/DVN deployment and funded public delivery remain outstanding. [Privacy](extensions/PRIVACY.md) |
| F05 | Invite/accept members, rotate complete encrypted epoch packages, send/decrypt group messages, remove members and recover backed-up identities. | Custom WebCrypto protocol for up to 32 members; no MLS, forward-secrecy or post-compromise-security claim. [Privacy](extensions/PRIVACY.md) |
| F06 | Fund and finalize quadratic matching rounds with identity registration, contribution withdrawal, project payouts and refunds. | Immutable registrar and identity-policy trust; Sybil identities and collusion are not cryptographically eliminated. [Markets](extensions/MARKETS.md) |
| F07 | Grant a relay session, sign exact owner/sponsor vouchers, submit as relayer and claim bounded gas reimbursement. | Native session relay, not ERC-4337; a signed cap and fixed overhead may under-reimburse the relayer. [Access](extensions/ACCESS.md) |
| F08 | Fund real leveraged spot positions, sell into lender-first settlement, repay, cancel unfilled offers or settle in kind after maturity plus grace. | Test-network gate and actual feed/venue/liquidity dependencies. Isolated spot leverage replaces the earlier pooled synthetic sketch. [Experimental markets](extensions/EXPERIMENTAL.md) |
| F09 | Fund binary wagers, trade or transfer funded sides, propose/challenge answers, arbitrate, finalize and refund timed-out markets. | Named resolver/arbiter and immutable question/source/bond/deadline terms; claims remain withdrawable without expiry. [Experimental markets](extensions/EXPERIMENTAL.md) |
| F10 | Rent and take over a keeper seat, settle fractional rent, run a fixed task and allow fallback after a stall or expiry. | Test-network activation and a separate task adapter; existing permissionless exit routes remain public. [Experimental markets](extensions/EXPERIMENTAL.md) |
| F11 | Review and buy a supported x402 HTTP service; separately create, fund, submit, evaluate and settle/refund ERC-8183 draft jobs. | Official x402 v2 exact EIP-3009 path with a funded service EOA; separate non-hooked job kernel with a trusted evaluator. [Agents](extensions/AGENTS.md) |
| F12 | Browse and compare signed provider cards, verify full metadata, inspect job-attributed feedback and sign/publish a registration. | ANIMA-native directory, not an ERC-8004 registry or proof of unique humanity/service quality; readers choose trusted reviewers. [Agents](extensions/AGENTS.md) |
| F13 | Export arbitrary HTML/JavaScript commission requests, fund escrow, inspect exact delivered source, approve payment, acquire frozen onchain code and run it in isolation. | Human review and hashes do not certify safety; no default wallet bridge. Exact transaction proposals need separate permission and review. [Worlds and instruments](extensions/WORLDS.md) |
| F14 | Generate a real Groth16 proof of NativeMarket one-hop fee, rounding, minimum and reserve arithmetic; check exact transaction context before wallet review. | Single-machine development trusted setup. Arbitrary EVM effects, token behavior, gas and future state are not proved; no account-spending authorization role. [Proof](extensions/PROOF.md) |
| F15 | Join a persistent multiplayer world, explore, gather, craft, fight, found towns and trade; invalidate old sessions after NFT transfer. | Working civilization slice with operator-authoritative state, not a mature MMORPG. Game currency has no onchain withdrawal. [Worlds and instruments](extensions/WORLDS.md) |
| F16 | Create a personal ENS mint session, back up its secret, commit/reveal and name atomically, recover expired funds and resolve the name into its NFT account. | Requires a dedicated delegated ENS parent; deterministic `anima-TOKEN_ID` children. Purchases, renewals and ancestor powers remain external. [Access](extensions/ACCESS.md) |
| F17 | Custody the actual master NFT, transfer ERC20 shares, fund and vote on buyouts, claim proceeds or reunite all shares for whole-NFT redemption. | Only an unused Bound account is eligible; execution freezes in custody. Private keys and unenumerated external rights are not backing. [Markets](extensions/MARKETS.md) |

[Deployment preparation](extensions/DEPLOYMENT.md) covers unsigned constructors/configuration, nonce-aware address prediction, explicit dependencies and receipt inspection against actual immutable runtime code. Its example catalog covers the contract families and required services. A separate extension directory preserves the core manifest's existing immutable boundary. Imported code hashes authenticate code identity; they do not certify external oracles, proxy configuration, providers or economic assumptions.

## Verification for this edition

The final combined Node run passed **497/497 tests, with zero failed, skipped or cancelled**, in **223.85 seconds**. It recursively discovered and sorted every `test/**/*.test.mjs` file, ran Node with `--test --test-concurrency=2`, and enabled the real-DOM workbench checks with isolated **linkedom 0.18.12** via `ANIMA_TEST_DOM_MODULES=/tmp/anima-desk-dom/node_modules`. It includes the added provider-directory coverage. The same discovery and DOM setup can be reproduced after installing the declared extension dependencies:

```sh
npm run extensions:setup
ANIMA_TEST_DOM_MODULES="$PWD/agent/extensions/node_modules" python3 - <<'PY'
import pathlib
import subprocess
files = sorted(str(path) for path in pathlib.Path('test').rglob('*.test.mjs'))
subprocess.run(['node', '--test', '--test-concurrency=2', *files], check=True)
PY
```

The initial broad run had **492 tests: 490 passed, one failed and one skipped**. The failure was the capability-catalog assertion that broader research must not be relabeled as deployed; the broader F03/F14/F15 research classification was restored. Its skip was the optional real-DOM workbench check before `linkedom` was supplied. An intermediate targeted run passed **50/50**, and a separate DOM/workbench run passed **9/9**. These are earlier separate executions, not extra unique tests added to the final 497.

Local integration coverage includes real contract deployment and transactions, exact balance and escrow accounting, NFT custody and epoch invalidation, signature/replay/expiry rejection, encryption and recovery, two-chain endpoint authentication, real Groth16 proof generation/verification, two independent HTTP world clients and persistent reconnect, generated-source escrow, provider metadata/feedback and wallet-review invalidation. Fixtures and scoped protocol substitutes are identified in the linked guides. Browser DOM checks do not establish physical-device rendering, a live browser's complete network/iframe enforcement or production operation.

Solidity compilation completed for **160 contracts** using **solc 0.8.30 / Shanghai**, optimizer and viaIR, with the compiler script's runtime-size checks. The log contains compiler warnings; no warning-free claim is made. Application generation, archive generation, source syntax, embedded HTML assets and archive integrity verification passed. Browser artifacts include ABI/runtime templates for **27 contracts used by the extension desk**.

The final application archive contains **66 embedded JavaScript modules**, **1,111,273 archived runtime bytes in 49 chunks**, and expands to **2,689,512 bytes**. Its SHA-256 is:

`4c729d661599dd8a6ee4e11721db864260120a1fc21b4d0b22a87bbc8e43ef9f`

The complete local fixture finished on **chain 31337**, minted token **1**, parsed its metadata, sealed the module directory, installed the estate module, and recovered the exact application through both the archive and compact-loader path. Its directory has **286 entries**, including archive chunks and native modules; this is not a count of 286 application features or proof that every extension was publicly deployed. The separate immutable privacy worker recovered exactly: **15,010,237 bytes**, compressed to **4,570,220 bytes**, with **199 chunks across seven shards**. [The local deployment record](../../reports/confluence/local-deployment.json) contains the test-only addresses, hashes and recovery flags. Proving circuit artifacts and configured services remain external to the compact application archive.

## Original blue object and immutable editions

The approved original HTML remains SHA-256 `6b1fb23f63cf5aa65283b8be2f1446dddae38622b7ea8c164249c8cc74146bb6`. The instrument build verifies that removing its additive insertion reconstructs that original byte-for-byte and checks all embedded optical assets; see [preservation evidence](../../reports/confluence/preservation-5.9.json). The generated `preview.html` changes because it embeds the updated capability catalog and application additions; whole-preview byte identity is not claimed.

Git blob hashes for the original/reference HTML, exterior field, living shader/WASM, interior kernel, interior controller/space/shader and `GenesisSVG.sol` match the starting GitHub tree. Exact checked paths and hashes are recorded in [the machine-readable release record](../../reports/confluence/release-5.9.json). Native renderer and physical-device verification were not rerun for this edition.

Existing minted editions keep their immutable application bytes. These additions apply to the updated source/application and a newly built archive edition; they do not silently upgrade old mints.

## Activation still required

No public-chain extension deployment, public mint, funded shielded end-to-end lifecycle, live cross-chain delivery, public provider purchase or website publication is claimed. Real chain dependencies, ENS parent control, liquidity, oracle/security settings, sponsors and service wallets, proof infrastructure and persistent world/operator hosts must be configured and exercised for their chosen deployments. The proof setup requires independent review and a suitable ceremony before production reliance. F03's broader autonomous-agent goal, F14's general EVM proof and F15's full MMORPG remain explicitly partial.
