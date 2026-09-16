# Current v1.7 evidence

The final HTML is identified in preservation.json and all three current browser reports.

- ui-tests.log: 222 Node checks (178 inherited, 39 memory/model/crypto/field, 5 controller cleanup/race).
- regression/browser-results.json: 64 actual Chromium checks.
- operating-browser/browser-results.json: 66 actual Chromium checks.
- memory-browser/results.json: 41 actual Chromium checks.
- field-parity/results.json: six native GLES/Wasm comparisons, mean-error criterion and maximum error both reported.
- compiler-input.json: complete prepared source for 42 Solidity files; NOT compiler output.
- solidity-attempt.log: compiler dependency unavailable; no EVM execution.
- deployment-attempt.log: release gate refused; no transaction.
- component-hashes.json: identifies the new source and visual artifacts.

The three loose smoke PNGs and inherited-tests.log/memory-tests.log are earlier development captures/checks, not the final release's authoritative results. Final images are under regression/, operating-browser/, memory-browser/. Script-like test text is deliberate literal-text validation.

The companion i-dont-fucking-believe-it-v1.7-clean-extraction.json identifies the final distributed ZIP and its fresh extraction checks. It is external because it includes that ZIP's own hash.
