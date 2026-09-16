# Security policy

The system is a research-grade autonomous-asset implementation, not an audited custody product.

Before any public-value deployment, follow the release gates in [`docs/SECURITY.md`](docs/SECURITY.md): independent Solidity review, invariant and fuzz testing, verifier and gateway review, key-ceremony design, timelock and multisig configuration, monitored canary deployment, incident rehearsal, and an explicit escape/recovery policy.

Do not submit live private keys, seed phrases, production RPC credentials, undisclosed vulnerabilities, or user data in public issues. Provide a minimal reproduction with affected commit, chain, contract, transaction, expected behavior, and observed behavior through a private security channel established by the deployer.
