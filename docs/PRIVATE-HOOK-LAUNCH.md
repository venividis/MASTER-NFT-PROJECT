# Shielded creator-hook execution

The canonical RAILGUN wallet now composes launches through the existing `GenesisV4HookLaunchpad`. It also composes swaps through that launch's actual creator-fee hook and withdrawals of the resulting `GenesisV4Position` shares. The existing ordinary factory and all deployed contract ABIs are unchanged.

## Launch review

`web/v4/client.mjs` accepts the ordinary launch fields plus:

- `creatorHook: true`, `hookFactory`, and `hook`.
- Optional `expectedHookOwner`, `expectedHookFeePpm`, `expectedHookRecipient`, and `expectedHookViaSplitter` constraints.
- Optional paired `expectedSplitRecipients` and `expectedSplitWeights` arrays.
- The existing `humanLowerPrice`/`humanUpperPrice` or `range` properties.

The worker sets `privateFunding: true` itself. It supplies the shared RelayAdapt address as the factory payer. That actual payer determines the new token's address; the human price range is converted to ticks after resolving its ordering against the paired asset. The hook owner is read and shown, with any explicitly supplied owner constraint checked. The shared adapter is never assumed to own the hook, and no connected public wallet is silently assigned as creator.

Factory, hook and optional splitter runtime code are checked against this release. The manager, hook permission bits, mutable hook owner, fee, recipient and splitter settings are read. A private plan fingerprint commits to the chain, relay, exact application call, all input and output assets, deadline, and reviewed hook configuration. Hooked launch code and prediction are rechecked before proof creation, after proof construction and immediately before starting broadcaster submission. A later transaction may still change future hook fees: the current contract deliberately gives that authority to its owner.

## Asset accounting

`packages/privacy/src/composition.mjs` is shared by the worker and the integration test. The same production function uses the real RAILGUN SDK to generate encrypted, zero-value full-balance return requests for the paired asset, newly issued token and LP-share token. It:

1. Adds the protocol's gross unshield amount to the spend requirement.
2. Clears any existing approval, approves only the application budget, executes the hooked factory, then clears the approval.
3. Groups the application calls and all return shields into a require-success RelayAdapt self-multicall.
4. Gives the outer failure path only existing input assets. Failed creation therefore never makes refund processing call an undeployed token address.

This returns retained supply, LP shares, unused liquidity budgets and gross-unshield rounding leftovers to the shielded recipient. Swaps include both input leftovers and output tokens, enforce the selected hook-fee maximum in actual hookData, and quote the exact PoolKey. Withdrawals verify the position's originating factory and hooked PoolKey, then return shares and both underlying currencies.

## Submission and recovery

The existing proof transaction hash, relay and chain fingerprint is reserved inside the encrypted wallet before submission. A worker rejection strictly before calling the broadcaster returns an explicit `not-submitted` result. Only a matching, hashless `reserved` record can then be released under the vault's shared write lock. Once the broadcaster's `send` method is entered, even a rejected promise preserves the uncertain reservation. A missing receipt or a changed balance is never treated as proof that the transaction was not submitted.

No public signing fallback is introduced. Unlocking and synchronization, configured services and funded shielded balances remain required.

## What remains public

The token, pool, amounts, prices and timing are public. The selected hook, its owner, recipients and splitter weights are public as well. Reusing that metadata can associate launches, even when funding and returned assets use shielded notes. This integration does not make fee recipients anonymous or create a secret pool.

## Evidence

`test/launchpad/private-hooks.integration.test.mjs` executes the production composition function with the pinned real SDK, encrypted return notes, actual Solidity factory, real Uniswap v4 PoolManager and Quoter, and the existing local `RelayAccountingHarness`. It checks payer-dependent address ordering, human ranges, exact approvals, launch success, fee-bearing swaps, share withdrawal, fee-setting freshness, missing output rejection, and atomic launch-failure refunds. The harness provides no privacy and does not verify ZK proofs. It is local contract accounting evidence, not a funded public-chain RAILGUN receipt.

`test/privacy/submission.test.mjs` checks encrypted reservation and receipt persistence, exact fingerprint recovery, and safe release of explicit pre-broadcast rejections. Runtime boundary assertions separately verify that an expired proof can return `not-submitted`, while a broadcaster exception after `send` begins remains an uncertain outcome.

The worker must be rebuilt and its integrity hash regenerated before packaging the edition. A funded proof/POI/broadcaster round trip against a configured public-chain deployment remains an external verification step.
