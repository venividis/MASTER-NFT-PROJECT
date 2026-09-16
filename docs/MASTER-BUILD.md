# MASTER 7.0 build evidence

The complete project is in [MASTER-NFT-PROJECT](https://github.com/venividis/MASTER-NFT-PROJECT). The tested implementation is [5ac5550](https://github.com/venividis/MASTER-NFT-PROJECT/commit/5ac555093f288a898935cc8d2e94bccb47e5e4e8), Git tree `3fcae5caeda6ae1ddc1739d4764672ab2277c58f`. A later documentation/evidence commit does not change those executable files.

This edition imports the complete 3,314-file ANIMA baseline, retained in [baseline commit e0d9877](https://github.com/venividis/MASTER-NFT-PROJECT/commit/e0d9877ffa4399e22304d64cde63014ace1bb3ae). The uploaded archive SHA-256 is `4538894773518622bc553fa15107f9ee84b297199e298f67b4611f9620152a57`. [The implementation map](MODULES-IMPLEMENTATION.md) records the code and boundaries of all 22 approved additions.

The NFT and companion contracts are Solidity/EVM. Core contracts use Solidity 0.8.30 and the Shanghai profile; the existing v4 contracts retain their separate Cancun build and Anvil tests. The preserved Rust research kernel does not make the NFT a Solana program.

## Verification

[GitHub Actions run 35159655831](https://github.com/venividis/MASTER-NFT-PROJECT/actions/runs/35159655831) records the exact tested commit. Only completed gates are passes.

| Gate | Observed result |
|---|---|
| Complete local application suite | All 24 stages passed; 755/755 root JavaScript tests, 11/11 official-launch tests, 1/1 communication test and 9/9 Rust tests; original and MASTER local mint stages passed |
| Native Solidity | 7 tests passed, including 64 fixed-seed fuzz runs; zero failures or skips |
| Original application in Chromium | 7/7 scenarios passed: desktop, phone/landscape emulation, missing/rejected wallet, transaction cancellation/rejection, and local rehearsal |
| Module workbench in Chromium | 5/5 scenarios passed, including worker/network/DOM boundaries, message-flood cleanup and a 64 KiB shared dependency |
| Native workbench in Chromium | 1/1 lifecycle passed with actual reviewed install, state-save and disable transactions on a disposable EVM |
| Complete local mint and restart | NFT #1 minted with the original application, three installed examples and a 48 KiB legacy cartridge; recovery and restart passed |
| Independent cold recovery | Full 705,642-byte workbench and four releases/three saved states recovered through the read-only CLIs; exact bytes verified, no new mint or transaction |
| Unsigned deployment plan | Exact 37-transaction companion deployment plan created and verified against current source and workbench; no RPC, signing or broadcast |

The browser engine was Chromium `151.0.7922.34`. Phone and landscape scenarios are viewport emulations. The original wallet-rejection scenarios use a fixture; the native module lifecycle connects the real workbench to an in-process local EVM through a restricted EIP-1193 bridge. It checks visible calldata, real receipts, cancellation without a send, exact saved state, live-session revocation and unchanged original NFT identity. It does not test a browser wallet extension or hardware wallet.

The complete local starter deploys the original Genesis application. The native browser fixture uses the genuine NFT/account contracts with `OnchainRenderer`; it is a separate fixture. The old cartridge-launcher compatibility test remains a Node DOM harness. These scopes must not be combined into a claim that every original instrument or arbitrary legacy HTML program was exercised in a browser against a public deployment.

## Recoverable bytes

The workbench occupies 31 immutable chunks and has SHA-256 `0xb7aa26711e53783e4bb2046c874dbbed9a44fadf261a75091245b877d05b7844`. The complete application archive has 20 module groups and 101 chunks. Source, compiler artifacts, manifests and recovered bytes are checked independently of the UI.

The final cold-recovery run restored the workbench in about 3.3 seconds and the token's release/state closure in about 0.6 seconds against a local RPC. These are local measurements, not public-RPC or device performance guarantees. Its block, owner nonce and deployment record remained unchanged. See [the release evidence](../reports/master-7.0/summary.json).

## Deployment boundaries

No public-chain deployment, funded public transaction or independent security audit is claimed. The original privacy, cross-chain, keeper and research-proving integrations retain their separate operating requirements. The passing local gates establish a reproducible development and testing build, not mainnet certification.

The new HTML workbench implements a bounded worker DOM subset. Generic saved module bytes are public unless the caller encrypts them; the journal helper supports explicit public or encrypted publication. Decryption keys do not transfer automatically with an NFT. An older immutable token requires the companion workbench/registry anchor for discovery and recovery.

The permissionless archive factory uses CREATE. Concurrent factory activity can invalidate predicted addresses; reconciliation and a new review are required after a nonce conflict. A hash proves byte identity, not publisher trust or absence of vulnerabilities.

Use [README.md](../README.md) for local wallet, minting and testing instructions, and [the deployment guide](MODULES-DEPLOYMENT.md) for unsigned plans and independent recovery commands.
