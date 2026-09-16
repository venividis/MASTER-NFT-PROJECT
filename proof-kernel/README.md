# Research policy evaluator

This crate evaluates JSON and emits a journal. It is not a deployed zkVM guest,
proof generator, or authoritative chain-state oracle. Do not install a verifier
on the assumption that this host binary supplies cryptographic policy enforcement.

The V2 policy commitment binds native value limits, cooldown, allowed targets,
forbidden targets, and allowed selectors using the documented serialization in
`policy_commitment`. List ordering, casing and duplicates do not change its meaning.
Empty allowlists explicitly mean unrestricted targets/selectors; changing a
committed restricted list to empty changes the commitment and is rejected.
Input `calldata` must hash to the intent's `dataHash`. The supplied selector must
match its first four bytes (or zero for fewer than four bytes).

The constitution hash must be this exact versioned policy commitment for this
evaluator. Historical free-form text hashes are not V2 policies. This is an
intentional incompatibility in the research evaluator, not a migration of any
deployed constitution or production attestation service.

Time, prior state and last action time remain caller-supplied facts. A real proof
system must authenticate them against consensus/public inputs and bind the exact
guest image, policy version and journal. Solidity independently validates nonce,
window, prior root, constitutional limit and cooldown for an executed action, but
this JSON evaluator alone is not evidence that its witness represents live state.

The supported numeric subset is u64 chain IDs, u128 value/nonce, and uint48 validity
windows. Full EVM uint256 input support is unfinished. Adversarial policy/action
binding tests and the restored independent JS statement fixture are included;
run `cargo test --manifest-path proof-kernel/Cargo.toml` with an installed Rust
toolchain and dependencies. A passing host test is not a zk proof verification.
