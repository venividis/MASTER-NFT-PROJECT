# AWE chain adapters and cartridge bridge

Version 0.1.0 — 5 September 2026.

This package implements the shared connection contract for AWE game cartridges. The EVM adapter makes actual injected JSON-RPC reads and builds unsigned transaction intents. It does not require an RPC subscription, contain a wallet, sign transactions, submit transactions, or deploy contracts. Solana, Sui and Starknet exports are explicitly **research-only capability descriptors and wire types**. Their production adapters remain to be implemented.

## Choose the profile that matches the host

The current AWE Console and the richer SDK use **different manifest and messaging profiles**. They share a version label but are not interchangeable wire formats.

| Profile | Manifest | Transport | Use |
| --- | --- | --- | --- |
| Current Console v1 | `spec`, `name`, `entry`, `sha256:hex`, capability strings, broad settlement label, optional Prism Relay world | `awe:hello` / `awe:connected`, version `1`, then `{id, session, method}` over a port | Existing Console uploads and its opaque `srcdoc` frames |
| Rich SDK v1 | `schemaVersion`, `title`, `entrypoint`, `0x` digest, capability reasons/targets and explicit settlement details | `awe.cartridge.rpc/1`, fresh nonce/session, sequence numbers and named request/response kinds | A dedicated-origin host implementing `message-channel.mjs` |

The root app profile was reconciled against `lib/console-core.ts` and the Console frame host on 5 September 2026. Use `console-profile.schema.json` plus `validateConsoleProfile()` for its supported manifest shape. That validator additionally checks optional digest syntax; it returns the recognized profile fields rather than retaining arbitrary extra JSON properties. `validateConsoleWorld()` supplies the connectivity check that JSON Schema alone does not express.

**For the current Console, import `@awe/chain-adapters/console-bridge`, not `/bridge`.** The matching client is `bridge/console-v1-client.mjs`. The self-contained `examples/console-v1-cartridge.html` can be uploaded through the Console's HTML package flow; request `world.read` in the generated manifest to enable its world button. It inlines the actual client and uses no external scripts, so it fits the current package CSP. Rebuild it with `npm run build:example` after editing the client. The sample obtains the expected host origin from the browser-supplied referrer; deployments that suppress it must configure the host origin explicitly.

This opaque client sends `awe:hello` to the exact parent origin, checks both the parent's origin and Window source, accepts exactly one version-1 port, and checks session/request IDs on replies. The Console host uses `*` specifically when transferring to its own opaque frame, whose origin cannot be addressed normally; this is not a recommendation to weaken the separate exact-origin transport. The Console v1 profile has no nonce/sequence handshake. Its current port handlers provide `console.info` and granted `world.read`; it does not currently expose wallet access, move execution, item minting or arbitrary SDK capabilities. Unknown method requests receive a host error.

The opaque client bounds its own pending requests and JSON payloads. That does not retrofit rate limits or payload checks into the host. If the host recreates its session, close the old client and call `connectConsoleV1()` again. There is no claim that the richer bridge's replay protections or permission grants are enforced by the existing Console profile.

## Explicit manifest conversion

`importConsoleProfile(consoleManifest, context)` requires the caller to supply identity, runtime, adapter, rules, chains, capability reasons and a compatible settlement configuration. It refuses a missing content hash or missing authority/verifier. The Console's `server` label alone does not establish an attested settlement implementation. The caller's enrichment remains a declaration until the relevant deployment and verifier are checked.

`exportConsoleProfile(sdkManifest, options)` is deliberately an explicit **lossy projection**. Callers must supply `acknowledgeMetadataLoss: true`. The result reports omitted fields and does not preserve or enforce chain, authority, verifier, item-schema or target-scope semantics. A `proof-verified` SDK mode is reduced to a broad `onchain` label with an explicit warning in the returned notes. Native-client manifests and unsupported entry formats are rejected. A Prism Relay world can be retained in the import sidecar and supplied again at export.

Both directions require `hashBinding: "same-single-html-bytes"`. Console package hashes bind HTML text encoded as UTF-8; the SDK bundle hash can be reformatted only when those are the identical, self-contained distributable bytes. The helpers do not recompute hashes, package external dependencies or turn unverified HTTPS framing into verified execution. This explicit binding avoids silently treating a hash of an archive, an entrypoint or a different bundle as equivalent.

```ts
import { importConsoleProfile, exportConsoleProfile } from "@awe/chain-adapters";

const imported = importConsoleProfile(consoleManifest, {
  id: "my-game", runtime: "web", gameAdapter: "my-configured-adapter",
  rulesVersion: "1", compatibleChains: [],
  settlement: { mode: "local" }, // Must match the original Console selection.
  capabilityReasons: { "world.read": "Load the owner's selected world" },
  hashBinding: "same-single-html-bytes"
});
const projected = exportConsoleProfile(imported.manifest, {
  acknowledgeMetadataLoss: true, hashBinding: "same-single-html-bytes",
  ...(imported.consoleProfile.world ? { world: imported.consoleProfile.world } : {})
});
// Inspect projected.omitted and projected.notes before relying on this projection.
```

## Contents

- `src/types.ts`: chain-qualified asset identity, manifest, permissions, transaction and settlement interfaces.
- `src/evm.ts`: RPC chain checks, ERC-721 owner reads, generic calls, token-bound-account binding reads, transfer preparation and the optional ERC-6551 CALL execution interface.
- `src/descriptors.ts`: implementation status and official sources for each chain family.
- `manifest.schema.json`: JSON Schema Draft 7 manifest validation; namespaced capabilities remain extensible.
- `console-profile.schema.json` and `src/console-profile.ts`: current Console profile, validation and explicit enrichment/projection.
- `bridge/message-channel.mjs`: versioned host/cartridge connection over a dedicated MessageChannel.
- `bridge/console-v1-client.mjs`: matching current Console opaque-frame client and Godot callback installer.
- `examples/`: web engine and Godot web-export bridge sources.
- `test/`: ABI, RPC, permissions and bridge isolation tests.

## Build and test

```sh
npm install
npm run build
npm test
```

The only development dependency is TypeScript. There are no runtime npm dependencies. `dist/` is included in the handoff so consumers can import it without compiling first. Rebuild it after source changes. Node's built-in test runner requires Node 18 or later.

## EVM integration

```ts
import { EvmAdapter } from "@awe/chain-adapters";

// rpc is an injected EIP-1193-style transport. No account access is requested here.
const adapter = new EvmAdapter(rpc, 1n);
const asset = {
  chain: "eip155:1", standard: "erc721",
  collection: "0x...", id: "42"
} as const;
const observed = await adapter.resolveController(asset);
// Application supplies real, validated addresses in place of this snippet's placeholder.
const intent = adapter.prepareERC721Transfer(asset, observed.owner, selectedRecipient);
// Present intent to the owner's separate wallet review/signing workflow.
```

`resolveController` defaults to a finalized block observation and pins its call to the returned block number. A chain that does not support that tag fails explicitly; callers may deliberately select another supported tag. RPC observations are not cryptographic ownership proofs. `readAccountBinding` reads what an account reports; matching a `token()` result alone does not authenticate an implementation or registry deployment.

`prepareAction` filters calls using the chosen chain, target, selector, expiration and per-call value allowance. This is a local preparation filter. A delegated account must enforce authorization, revocation, cumulative budgets and transfer invalidation onchain too. A selector allowlist does not constrain arbitrary calldata arguments by itself: the host's game adapter must validate recipients, item IDs and other action parameters. `prepareCall` intentionally remains available to the owner-driven host for arbitrary selected calls; do not expose it as an implicitly granted cartridge method.

`prepareAccountExecution` encodes `execute(address,uint256,bytes,uint8)` with operation `0` (CALL). ERC-6551 execution interfaces are extensible, so check the actual account ABI and implementation before using this optional helper. Execution spends the account's existing balance; it does not automatically attach funding. A safe transfer to an NFT account needs a functioning ERC-721 receiver. Child enumeration and root ownership through arbitrary nesting chains require separate collection-specific adapters.

## The cartridge handshake

1. Host sends `hello` to the configured exact game origin with fresh session and nonce.
2. Cartridge checks the parent's **origin and Window source**, then echoes `ready`.
3. Host checks game **origin, Window source, session and nonce** before transferring a MessagePort.
4. Cartridge accepts that port only from the authenticated parent handshake and acknowledges it.
5. Requests carry protocol version, session, request ID and increasing sequence number. Responses must match the pending request. Unlisted methods are rejected. JSON messages are bounded to 64 KiB with eight simultaneous requests.

Handlers are the owner's explicit grant list. A cartridge's manifest asks for capabilities; it cannot grant them to itself. Owner-selected custom methods can be registered without editing the bridge protocol. Changing grants means closing the existing bridge and establishing a fresh session. Closing or reloading aborts the old host session; handlers receive an AbortSignal and should stop cancellable work. Already submitted chain transactions cannot be undone by closing a browser session.

Serve untrusted games on a **dedicated origin**. This bridge rejects same-origin installations unless the host explicitly sets `trustedSameOrigin: true` for code it trusts. That opt-in does not sandbox the game. Opaque-origin frames such as `sandbox="allow-scripts"` with `srcdoc` are deliberately unsupported by this exact-origin transport. Do not weaken the checks to `*`; use a separate purpose-built opaque-frame transport if that deployment is needed. A MessagePort has no per-message origin field, so origin/source validation happens before the port transfer, followed by session and sequence checks on the port.

Each game adapter validates request parameters. The example exposes inventory reads and move-intent preparation only. Wallet providers, seed phrases, private keys and unrestricted signing objects never cross the bridge. This module is a capability transport, not a malware-proof runtime or game anti-cheat verifier.

## Godot web exports

Install the JavaScript module in the surrounding export HTML **before** starting the Godot scene:

```html
<script type="module">
  import { installGodotBridge } from "./bridge/message-channel.mjs";
  installGodotBridge({ expectedParentOrigin: "https://awe.example" });
</script>
```

Attach `examples/godot/AWEBridge.gd` to a Node. Its signals deliver readiness and JSON responses, while `request(method, params)` returns a local request ID. The module must be loaded before the scene reaches `_ready`; when embedding a custom export template, start the engine after module initialization. The GDScript retains callback objects as required by [Godot's JavaScriptBridge](https://docs.godotengine.org/en/stable/classes/class_javascriptbridge.html). It is a web-export source example, not a tested native/mobile transport. Godot runtime execution was not performed in this package verification.

For the **current Console** use `installConsoleV1GodotBridge()` from `bridge/console-v1-client.mjs` instead. It exposes the same JSON callback surface, so the GDScript does not change. Its readiness message names only the known `console.info` method; `world.read` requests remain subject to the loaded Console manifest. Inline/bundle the JavaScript installer into the export for the opaque package flow—external module imports are blocked by that loader's CSP. The surrounding Godot build still needs a compatible self-contained web packaging strategy for WASM/assets. This transport example does not make arbitrary multi-file Godot exports work unchanged.

## Manifest and ownership rules

The manifest selects a renderer/runtime independently from settlement. `local` means local play, `server-attested` explicitly names an authority, `onchain-transitions` names a chain and game contract, and `proof-verified` names a chain and verifier. Naming a verifier does not implement it. The consuming application must validate the manifest and deployment references, verify content bytes before execution, and enforce the game's chosen settlement rules.

`contentHash` is the SHA-256 digest of the exact distributable cartridge bundle. The package format and all dependencies must be pinned by the packaging/loader layer; hashing only an entrypoint that imports mutable external scripts is insufficient. The SDK does not currently implement downloading, archive extraction, content hashing or an execution sandbox. Those responsibilities remain explicit loader integration work.

Each asset has one canonical chain-qualified identity. Gameplay access may recognize ownership without moving the NFT. Transfer, consumption, escrow and minting require the applicable game/chain adapter. Cross-chain mirror records are not independently spendable originals. There is no bridge implementation or claim of automatic EVM/Solana/Sui/Starknet asset portability in this package. Every match needs a defined authoritative settlement domain, rules version and accepted-result verifier before it can issue economic rewards.

## Chain-specific opportunities

EVM uses NFT-bound accounts for custody and calls, with ERC-7401 nesting and ERC-5773/6220 representation/equipment adapters as separate additions. ERC-6551 is currently in Review; the other three specifications are Final. ERC-7401 supersedes ERC-6059, which ERC-6220 still references, so implementation interface compatibility must be checked.

Solana can use Core Execute Asset Signing, per-game AppData, and Bubblegum V2 where compressed item volume is useful. Its adapter needs real program instructions and DAS proof handling. Core asset burning needs inventory handling to avoid stranding signer-held assets. Sui can use dynamic object fields, Move capabilities and Kiosk. Starknet can use Dojo World models/systems and Torii subscriptions. Dojo has multiple engine SDKs; their target-platform support still needs validation for each export. Official sources and verification date are embedded in the descriptors.

## Verification performed

TypeScript 5.1.6 strict compilation; Node unit tests for RPC reads, unsigned ABI preparation, grants, chain mismatch, malformed data, both MessageChannel profiles, explicit conversion and world validation. ABI fixtures were independently generated with ethers 6.17.0. These tests use an injected RPC and simulated window message events with real MessagePorts. They do not establish deployed-contract compatibility, real-browser cross-origin isolation, full game settlement or a security audit.
