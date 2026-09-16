# Contributing

Keep the exact archived original. Do not replace the successful visual vocabulary as a side effect of implementing a feature. Review actual screenshots and interactions as well as source.

## Local gates

```sh
npm run validate:ui
node test/reference/crosscheck.mjs
python test/browser/optical_browser.py
python test/visual/field_parity.py
```

The optional native/browser commands require their documented toolchains. Record actual backends and limitations. Do not call a native GLES check a browser WebGL check, or mocked wallet messages a successful transaction.

## Protocol gate

In an isolated, network-enabled development environment, install dependencies, generate/review/retain the missing dependency lock, then run `npm run validate`. Never count unexecuted assertions as passed tests. New immutable account code requires a new deployment; do not promise an in-place upgrade.

Changes should state which invariant or user-visible quality they improve, what they preserve, how they were tested, and what remains unverified. Do not include secrets, production wallets, or proprietary font files.
