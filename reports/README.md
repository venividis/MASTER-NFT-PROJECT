# Report scope and current evidence

Reports in this directory are retained release evidence, not a single mutable
status feed. A filename at the directory root does not mean that the report
describes the current source tree.

For version 7, start with [`master-7.0/summary.json`](master-7.0/summary.json)
and [`../docs/MASTER-BUILD.md`](../docs/MASTER-BUILD.md). The summary records
the exact tested commits and its local-development scope. Files such as
`release-status.json` and `protocol-status.json` describe the historical 1.2
candidate identified inside those files and must not be used as version 7
release status.

After any executable change, generate fresh exact-candidate evidence before
calling the new tree validated. In particular, a source-integrity pass only
establishes that the checked-in inventory matches the tree; it does not carry
forward the tests, public deployment status, or security conclusions of an
older report.
