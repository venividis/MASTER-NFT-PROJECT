# Notice

Copyright © 2026 the project contributors.

The root [LICENSE](LICENSE) applies to project-authored material covered by it. Included third-party code, generated code and research snapshots retain their own notices and license terms. The entire distribution is not solely MIT or solely original authorship.

| Included material | Retained notice |
| --- | --- |
| Solady | `contracts/src/confluence/vendor/solady/LICENSE.txt` and source headers |
| Uniswap v4-core | `integrations/console/protocol/v4-hook/vendor/v4-core/licenses/` and per-file SPDX headers |
| Uniswap v4-periphery and Permit2 | Their LICENSE files and source headers in the v4-hook vendor tree |
| Solmate | Its LICENSE in the v4-core vendor tree |
| Generated Groth16 verifier/proof package | GPL-3.0 source notice and `packages/rehearsal-proof/LICENSE` |
| Keccak test reference | CC0 attribution in `test/reference/keccak.c` |
| Other integrations and npm dependencies | Source headers, package metadata and retained license files |

The v4 dependency tree includes a PoolManager implementation, correcting the historical notice that none was bundled. Preserve upstream notices and pinned dependency manifests when redistributing source or builds.

`contracts/src/lib/Base64.sol` is independently adapted from common MIT-licensed Solidity techniques. The separately vendored Solady counterpart retains its own attribution and source-qualified artifact.

The blue object, geometry and interface are procedural code. Historical HTML and optical fixtures remain comparison material. Referenced names and trademarks belong to their owners; inclusion implies no endorsement or affiliation.
