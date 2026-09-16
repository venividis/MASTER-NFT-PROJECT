# F14 · Proved NativeMarket arithmetic rehearsal

The proof desk now generates a Groth16 proof, verifies its pairing equation through a deployed Solidity verifier, checks the exact account transaction against current chain state, and presents the existing wallet review. A local Node service computes the proof without a wallet key. It cannot authorize or broadcast a transaction.

This is a working **bounded arithmetic proof** for NativeMarket. It is **not a proof of arbitrary EVM execution**. The checked-in proving key comes from a **single-machine development trusted setup**, so this release does not establish production cryptographic security. A reviewed circuit and independently contributed setup are still required before relying on this proof as a security boundary. It deliberately cannot be installed as a SovereignAccount authorization verifier.

## What is proved

The circuit mirrors the current NativeMarket one-hop formula:

```text
effective = amount * 9970
denominator = reserveIn * 10000 + effective
output = floor(effective * reserveOut / denominator)
nextReserveIn = reserveIn + amount
nextReserveOut = reserveOut - output
```

The witness has an integer quotient and remainder. Constraints require `denominator * output + remainder = numerator` and `0 <= remainder < denominator`; merely supplying the JavaScript quote is insufficient. Inputs, output and next reserves fit 112 bits, nonzero requirements match the market, output meets the user’s minimum, and both complete 128-bit context limbs are constrained together with the quote through Poseidon. All integer products are smaller than the BN254 scalar field, so modular wraparound cannot satisfy a different economic result.

The circuit has **1,947 nonlinear constraints, 788 linear constraints, six public inputs, four public outputs and no private inputs**. These transactions and reserve values are public. The proof provides verifiable computation, not transaction privacy.

The read-only `NativeQuoteRehearsal.check` contract additionally checks:

- The immutable market is still the sealed WorldLedger’s canonical market, with its deployment code hash unchanged.
- The account belongs to that ledger’s collection, is in Bound mode, and retains the expected owner, session epoch and action nonce.
- A nonzero source block hash remains canonical and is one of the preceding 256 blocks.
- Exact canonical NativeMarket swap calldata and exact canonical SovereignAccount `executeUtility` calldata match the proof context, including target, value, allowance, token identity and deadlines.
- The route is native-to-token or token-to-native, with immediate delivery and the exact required native value. Journal wrappers, two-hop routes and vault delivery are excluded.
- The market’s current reserves equal the proved reserves.
- The Groth16 proof verifies against all ten public signals.

The context commits the chain, checker address, market address/code hash, account, current owner, custody epoch, action nonce, source block number/hash, inner calldata/value and complete outer account transaction calldata. The sender is the current NFT owner; the outer transaction sends zero additional native value. Changing any of those terms requires a new proof.

Balances, token implementation behavior, allowance side effects, delivery, WorldLedger callbacks, EVM execution, gas usage, chain finality and future state are outside this proof. The existing account simulation still runs, and the wallet checks the proof again immediately before signing. Another transaction can change reserves after the final check; the signed swap’s minimum and deadline remain its execution protections.

## Use the desk

Deploy `NativeQuoteRehearsal` with the one constructor argument `canonicalNativeMarketAddress`, after that market’s WorldLedger is sealed. The constructor creates the checked-in `NativeQuoteGroth16Verifier` internally; there is no configurable verifier administrator, upgrade method or spending entry point. Add its address as `NativeQuoteRehearsal` in the extension directory.

Install and run the proving service from the repository root:

```sh
npm ci --prefix packages/rehearsal-proof --ignore-scripts
ANIMA_PROOF_ORIGINS=https://your-nft-app.example npm run serve --prefix packages/rehearsal-proof
```

Use the application’s exact HTTP(S) origin. Multiple explicitly allowed origins are comma-separated. A local development example is `ANIMA_PROOF_ORIGINS=http://127.0.0.1:4173`. No wildcard origin is accepted. The service binds `127.0.0.1:8791`, authenticates a generated 32-byte session token, requires the loopback Host header, accepts one proof at a time and holds no wallet keys. `ANIMA_PROOF_PORT` and `ANIMA_PROOF_TOKEN` optionally configure its port and session token. An empty origin list permits command-line requests only. A browser must permit its explicitly selected loopback service connection; there is no hosted fallback.

In the proof desk, enter the deployed checker, market, input/output assets, amount, slippage and the printed session token. Open **Specialist instruments & research → Quote proof research**, then select **Generate research proof & review**. The desk simulates the exact account utility transaction, pins an unchanged completed block, requests a proof, verifies it onchain with `eth_call`, and exposes the normal wallet confirmation only after those checks pass. The session token stays in the panel’s memory and is cleared when it closes. Editing the form cancels the candidate. A proof expires after two minutes, and state changes require another proof.

## Command-line proof and verification

The six-input file contains canonical decimal strings; values are raw asset units:

```json
{"contextHi":"1","contextLo":"2","amount":"100","reserveIn":"10000","reserveOut":"30000","minimum":"200"}
```

```sh
npm run prove --prefix packages/rehearsal-proof -- prove input.json quote.proof.json
npm run prove --prefix packages/rehearsal-proof -- verify quote.proof.json
```

For that example the output is 296, with updated reserves 10,100 and 29,704. CLI verification checks the actual Groth16 proof. Its example context is not a chain binding; use the desk or `NativeQuoteRehearsal.check` to verify an exact account transaction against chain state.

## Setup artifacts and reproducibility

`packages/rehearsal-proof/artifacts` contains the public WASM witness generator, public proving key and verification key. Their SHA-256 digests, circuit source hash and generated verifier hash are recorded in the two setup manifests. The service validates artifact digests before accepting work. Proving data is kept outside the NFT’s compact browser archive; only the small client and checker ABI are embedded.

Pinned packages are circom2 0.2.23, circomlib 2.0.5 and snarkjs 0.7.6, with an npm lockfile. `npm run setup --prefix packages/rehearsal-proof` compiles the circuit, generates a new local development powers-of-tau and circuit contribution, verifies the resulting zkey, and writes matching artifacts and Solidity verifier. Existing committed manifests, proving artifacts, generated Solidity verifier or transient setup artifacts require `-- --replace-development-setup`, including a fresh checkout without `build/manifest.json`. The guard runs before creating directories or invoking tooling. For a circuit-only check, use `npm run setup --prefix packages/rehearsal-proof -- --compile-only`; it writes into `build/compile-check` and does not alter the setup, published proving artifacts or generated verifier. Each run creates **different keys**, and the new verifier must be compiled and deployed together with its matching artifacts. This reproduces the build procedure, not the original ceremony entropy. No claim of independent setup participants is made.

The generated verifier retains snarkjs’s GPL-3.0 copyright/license header. The isolated proof package includes the license and pinned dependencies. Sources and setup manifests permit a future reviewed ceremony and circuit revision without changing the immutable core account.

## Validation

```sh
node --test test/extensions/proof.integration.test.mjs
```

Tests generate and verify real proofs; tamper with every public signal and proof coordinates; bypass client validation to verify that the circuit rejects invalid minima, overflow, zero outputs and out-of-range context; compare a proved quote with an actual NativeMarket swap executed by a real SovereignAccount; reject changed outer transaction terms, reserves, nonce, custody, block hashes and old anchors; and run the authenticated local HTTP service through a complete proof response. The account, NativeMarket, generated verifier and checker are compiled and deployed for the local integration tests. Only the surrounding collection/ledger setup and token use fixtures.

The broader F14 ambition—cryptographically proving arbitrary forked EVM execution and all observed effects—remains outside this circuit’s implemented scope.

## Primary implementation references

The implementation uses the real circuit/proof/export flow in [iden3’s snarkjs documentation](https://github.com/iden3/snarkjs), the [Circom compiler sources and language documentation](https://github.com/iden3/circom), and [circomlib’s range, comparison and Poseidon circuits](https://github.com/iden3/circomlib). The economic formula is the repository’s `contracts/src/protocol/NativeMarket.sol`; it does not claim Uniswap compatibility.
