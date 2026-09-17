# MASTER build evidence

The complete project is in [MASTER-NFT-PROJECT](https://github.com/venividis/MASTER-NFT-PROJECT). The tested implementation is [84961c3](https://github.com/venividis/MASTER-NFT-PROJECT/commit/84961c3f0f0112760d900668f3df490ed4b3d9be), Git tree `185169b268806de66cfd533f3283af64e3665481`. The later documentation/evidence commit leaves its executable files unchanged. [Retained reports](../reports/master-completeness/) identify the candidate, individual browser cases, transactions and decoded CI logs.

This edition retains the complete 3,314-file ANIMA baseline in [baseline commit e0d9877](https://github.com/venividis/MASTER-NFT-PROJECT/commit/e0d9877ffa4399e22304d64cde63014ace1bb3ae). The uploaded archive SHA-256 is `4538894773518622bc553fa15107f9ee84b297199e298f67b4611f9620152a57`. [The implementation map](MODULES-IMPLEMENTATION.md) records all 22 approved additions and their boundaries.

The NFT and companion contracts are Solidity/EVM. Core contracts use Solidity 0.8.30 and the Shanghai profile; existing v4 contracts retain their separate Cancun build and Anvil tests. The preserved Rust research kernel does not make the NFT a Solana program.

## Completed fixes

Saved state accepts finite decimal values, reviews the full supported 32 KiB payload, and restores historical snapshots without silently changing the active schema. Migration previews invalidate when their inputs change and clear prior error feedback after success. Recovery validates bounded pages, ordering, duplicates and exported data before accepting them.

Direct snapshot bytes now use canonical immutable `AppChunk` contracts, keeping the public state-store ABI and snapshot commitments unchanged. The old maximum-size snapshot required a 29,172,440 gas limit with wallet headroom. The replacement's measured maximum-size active write used 7,871,459 gas, with a reviewed limit of 9,602,817, below the 16,777,216 transaction cap. The regression covers 0, 1, 23,000, 23,001 and 32,768 bytes, exact recovery and retained history. See [the gas measurements and limits](MODULE-STATE-GAS.md). These are local Shanghai-profile measurements with an explicit cap; existing immutable stores require a new companion deployment to gain the changed storage implementation.

Original collection, account, account-factory and renderer bytecode stayed identical. The original artwork, source assets and runtime bindings remain; normal account actions still advance the nonce and audit activity.

## Verification

[GitHub Actions run 35172184548](https://github.com/venividis/MASTER-NFT-PROJECT/actions/runs/35172184548) records the tested commit. Only completed gates are passes.

| Gate | Observed result |
|---|---|
| Complete local application suite | All 24 stages passed; 760/760 root JavaScript tests (including the module tests), 11/11 official-launch tests, 1/1 communication test and 9/9 Rust tests; original and MASTER local mint/recovery stages passed |
| Module regression suite | 51 tests passed, zero failures or skips, across the complete disjoint contract/gas and remaining-module runs |
| Native Solidity | 7 tests passed, including 64 fixed-seed fuzz runs; zero failures or skips |
| Original application in Chromium | 7/7 scenarios passed: desktop, phone/landscape emulation, missing/rejected wallet, transaction cancellation/rejection and local rehearsal |
| Module workbench in Chromium | 5/5 scenarios passed, including worker/network/DOM restrictions, message-flood cleanup and a 64 KiB shared dependency |
| Native workbench in Chromium | 1/1 lifecycle passed with reviewed install, state-save and disable transactions on a disposable EVM |
| Complete minted runtime in Chromium | 4/4 scenarios passed: actual gameplay/exit for 48 KiB and 1 MiB legacy cartridges, full 32 KiB migration/historical branching, and public/encrypted personal journal inscription/recovery |
| Rebuilt distribution | 204 compiler artifacts verified; 101 application chunks, 117 embedded modules and 20 archive groups; full source inventory checked |

The browser engine was Chromium `151.0.7922.34`. The complete minted-runtime fixture deploys the original Genesis stack, independently recovers its entire application and companion workbench, then runs both in the browser. It checks visible review, cancellation without a send, seven real reviewed transactions, exact state/journal recovery, successful encrypted journal decryption, clearing sensitive input, retained independent module state and the unchanged original master identity. Every submitted reviewed transaction is checked against the gas cap. The separate native-workbench lifecycle uses genuine NFT/account contracts with `OnchainRenderer`; the original source-derived cartridge test remains a Node DOM harness.

Phone/landscape cases emulate viewports. Browser transactions use an injected restricted EIP-1193 provider connected to a disposable EVM. Browser extensions, hardware wallets, physical-device behavior and every arbitrary legacy HTML program are outside these results.

## Recoverable bytes and local measurements

The current workbench is 707,014 bytes across 31 immutable chunks, with SHA-256 `ec2a47d8697ecbce4560dbe5f07dede41b1616f223ea81196bb947dbe79dc2b6`. The complete minted-runtime browser fixture recovered this workbench and the 7,952,983-byte Genesis application exactly in 6,080 ms against its local provider before browser execution. Its deployed runtime contains fixture-specific addresses; its own recovered hash is retained in the report.

The 48 KiB legacy edition returned 49,216 ABI bytes with 328,234 view-call gas. The 1 MiB edition returned 1,048,640 ABI bytes with 13,798,118 view-call gas and 46 chunk references, including deduplicated padding. These are two bounded editions of the same tested game, not a claim about all legacy software. The maximum sampled main-page JavaScript heap was 11,830,216 bytes; it is neither whole-process/worker memory nor a guaranteed peak. Local gas, latency and memory measurements do not establish public-RPC fees or device performance.

Earlier 7.0 evidence, including the 705,642-byte cold-CLI recovery and its unsigned deployment plan, remains in [reports/master-7.0](../reports/master-7.0/). Those records describe the earlier candidate. Generate a new plan from the current source and target-chain state before deployment.

## Deployment boundaries

No public-chain deployment, funded public transaction or independent security audit is claimed. The original privacy, cross-chain, keeper and research-proving integrations retain their separate operating requirements. Passing local gates establish a reproducible development and testing build.

The HTML workbench implements a bounded worker DOM subset. Generic saved module bytes are public unless encrypted; the journal helper supports explicit public or encrypted publication. Decryption keys do not transfer automatically with an NFT. Older immutable tokens need the companion workbench/registry anchor for discovery and recovery.

The permissionless archive factory uses CREATE. Concurrent factory activity can invalidate predicted addresses; reconciliation and a new review are required after a nonce conflict. Hashes establish byte identity, not publisher trust or absence of vulnerabilities.

Use [README.md](../README.md) for local wallet, minting and testing instructions, and [the deployment guide](MODULES-DEPLOYMENT.md) for unsigned plans and independent recovery commands.
