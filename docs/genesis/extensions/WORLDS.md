# Generated instruments and the shared world

The optional workshop has an arbitrary-HTML commissioning path: export an exact request, accept a provider's complete source, verify its commitments, review the source, separately approve payment, and publish that exact output through the existing `CommissionedCartridges` contract. The separate shared-world application has a persistent, multi-client, server-authoritative civilization slice. It is not a finished large-scale MMORPG.

## Open the shared world

```sh
node agent/worlds/server.mjs --demo
```

Open `http://127.0.0.1:8789` in two browser windows. Choose distinct traveller names and enter as guests. This mode explicitly does not claim NFT ownership. Guest browser sessions survive page reloads; a server restart retires bearer sessions. On first entry, copy the private guest resume code. This tab remembers the code in session storage, and it can be pasted into a new browser session to resume the same traveller after logout, expiry or server restart. Leave that field empty only when creating a new guest. Anyone with the code controls that guest; it grants no NFT authority. NFT-owner mode reconnects the same persistent traveller after a new signature. Use the extension desk's **Open shared world** control for a separately configured service.

The world is a 28 × 20 isometric map. Move with arrows, WASD, the directional buttons, or a tile tap. Gather wood, stone, and ore beside their nodes. Forge a blade with 2 wood and 1 ore; fight the wisp for game coins. Found one town per identity with 3 wood and 2 stone. Rest beside a sanctuary. Sell goods for game coins: the authoritative market removes listed goods from the seller's inventory, then atomically transfers goods and coins on purchase, or returns goods on cancellation. Players see each other's positions, towns, combat outcomes and orders through authenticated HTTP snapshots.

The server validates distance, cardinal movement, map boundaries, regeneration, recipes, combat range, inventory, market ownership and balances. Each identity can act once per tick, commands require an exact increasing sequence, and failed commands do not consume inventory or sequence. Commands serialize through one writer. Persisted snapshots use temporary-file replacement; an exclusive process lock prevents two operators writing the same directory.

## Connect native NFT owners

Set these environment variables before running `node agent/worlds/server.mjs` without `--demo`:

| Variable | Meaning |
| --- | --- |
| `ANIMA_WORLD_RPC` | Operator-selected RPC for the collection chain |
| `ANIMA_WORLD_CHAIN_ID` | Exact chain ID |
| `ANIMA_WORLD_COLLECTION` | Native ANIMA collection exposing `ownerOf` and `accountOf` |
| `ANIMA_WORLD_ORIGIN` | Exact externally visible origin, such as `https://world.example.org` |
| `ANIMA_WORLD_STATE` | Durable directory for world data, lock and receipt signing key |
| `ANIMA_WORLD_HOST` | Bind interface; defaults to loopback |
| `ANIMA_WORLD_PORT` | Listen port; defaults to 8789 |

Use an HTTPS reverse proxy for remote service. Do not expose a development RPC or its fixture keys. The service accepts requests from its configured origin and does not provide wildcard CORS. The browser desk opens the world as its own page, without handing it the NFT wallet's existing spend grants. Running the CLI alone does not configure a public host or deploy a collection.

An EOA owner signs a SIWE-shaped message binding the origin, chain, collection, NFT number, random single-use nonce, expiry and canonical account session epoch. The service checks chain ownership before issuing the challenge, at login, on authenticated reads, and again at the serialized command boundary. It reads `ownerOf`, `accountOf` and the account's `sessionEpoch` at the same latest block. NFT transfers retire old sessions, including transfer-away-and-back through the epoch. A fresh login replaces the prior session for that NFT. The traveller and its game inventory belong to the NFT identity and follow the new owner.

This login implementation supports EOA signatures. It does not implement ERC-1271 contract-wallet signatures or delegated agent login. An agent can use an owner-controlled signer through the same JSON API; using that key remains an explicit operator decision. The latest-block check is RPC-trusting and can be affected by chain reorganizations. There is no claim of finality or private wallet-identity concealment.

`GET /config` exposes the mode, collection, chain, tick period and Ed25519 public key. `POST /challenge` takes `{address, tokenId}`; `POST /session` takes `{nonce, signature, name}`. Authenticated `GET /state` and `POST /command` require an `Authorization: Bearer …` header. Commands contain `{type, sequence, …parameters}`. Tokens do not appear in URLs. `POST /logout` retires the token. Bodies are capped at 8 KiB, requests are rate limited, sessions expire after 30 minutes, challenges after 2 minutes, and at most 128 identities have active sessions (the server factory can choose a smaller cap). The 256-order cap is separate. Durable characters do not consume active slots. No wallet private key is sent to this service.

### Presence and guest retention

Admission and session replacement occur in the same serialized queue as world writes. Logout and session expiry free presence capacity. Reconnecting an already-active identity replaces its old bearer even when all slots are occupied. Snapshots expose `presence.activeIdentities`, `activePlayers` and `capacity`; the map renders only those active identities. Historical characters, including NFT identities, remain durable.

In guest mode, `POST /guest` with `{name}` creates a character and returns a random 256-bit `resumeCode` over the authenticated origin. `{resumeCode}` resumes that same character and retires its previous bearer. Unknown or malformed codes fail closed; a caller-supplied identity cannot select someone else's character. The server stores only SHA-256 credential hashes in private SQLite `guestAccess` entity rows (imported from that map in legacy snapshots). Hashes are omitted from every public world snapshot. The browser accepts remote HTTPS or exact local loopback origins and rejects redirects when sending credentials.

Characters, inventory, coins, founded towns and escrowed orders are retained indefinitely by this version; no logout, expiry or capacity cleanup deletes them. Offline orders stay fillable, and their seller's proceeds remain on the durable character for its return. This avoids orphaning market escrow or taking away possessions to admit new players. Guests created by older releases without a resume code remain preserved but cannot recover through the new endpoint; no insecure identity-only recovery is offered. Operator-assisted migration would need a separately established proof of control.

Guest codes have no expiry or rotation endpoint in this release. Losing the code loses self-service access; retaining the code retains authority over that guest. Protect the state directory and any backup, and copy a guest's private code if it matters. Indexed SQLite storage preserves characters, orders and guest credentials together; the former 4 MB snapshot limit has been removed. Do not prune characters that own towns, goods or liabilities.

Every successful command returns an Ed25519-signed receipt containing the operator origin, world identity, authoritative event sequence and exact post-command state fingerprint. The receipt signing key persists with restrictive file permissions. The browser pins the first observed operator key and rejects an unexpected replacement. This is trust on first use. Receipts prove which operator signed a result, not that the operator was honest or that the result is onchain. They have no token-mint or withdrawal authority. Public keys must be independently compared if a stronger initial trust ceremony is needed.

The default persisted directory is `.local/shared-world`. Back up `world.sqlite` and `receipt-key.pem` consistently, secure the signing key, and use one process per world directory. Sessions intentionally stay in memory. See the WAL backup and crash-recovery procedure below.

## Commission any small HTML/JavaScript instrument

Open **Worlds & workshop** in the extensions desk. Connect the funding NFT, write the intended behavior, select only public snapshot data you intend to share, and export the request. Its terms commit to the written request, originating chain/NFT/account, byte limit, snapshot and permitted capability requests. Funding uses an explicit worker, fixed native-token budget and submission deadline through the existing escrow. Reusing the API supports ERC-20 budgets too. The current desk exposes native budgets.

A provider can produce any self-contained HTML/JavaScript within the 24,576-byte onchain cartridge limit:

```sh
node agent/worlds/provider.mjs build instrument-request.json source.html provider-output
node agent/worlds/provider.mjs verify provider-output/deliverable.json
node agent/worlds/provider.mjs plan provider-output/deliverable.json - provider-plan 0xESCROW WORK_ID CHAIN_ID
```

Replace the placeholder address and IDs. The last command writes unsigned accept/submit transactions. It does not broadcast. Providers must verify the escrow, work terms, budgets, worker, reviewer and deadlines before signing. The provider may be a person, an external code-generation service or an agent. No paid model service or automated code generator is silently contacted.

Import the provider's deliverable. The desk reconstructs the exact SHA-256 content hash, manifest hash, terms and existing commissioned-cartridge deliverable hash. It shows all source and the exact manifest. **Approve these exact bytes locally** requires a separate review checkbox. This local record is not a signature or a safety certificate. **Review acceptance and provider payment** prepares the escrow reviewer's transaction; **Review frozen cartridge acquisition** separately prepares publication of the exact paid source to the funding NFT. Acquisition creates no wallet session or spending grant. The resulting content and manifest are frozen by the existing publisher. Content, manifest and onchain publication are public.

Provider output that differs from the approved commitment cannot pass the client acceptance or publisher acquisition checks. Rejection does not require trusting or executing invalid output. Rejected and expired work credits the funding NFT; withdrawal is a separate existing escrow action. Worker payment is likewise a pull credit. An unavailable provider cannot indefinitely prevent the expiry refund.

The runtime requires approval for the exact content and manifest. It runs HTML in an opaque-origin iframe with only `allow-scripts`, no parent-origin access, wallet bridge, popup, top-navigation, download permission or generic network bridge. CSP denies fetch/XHR/WebSocket, external scripts, frames and ordinary external resource loads; selected inline scripts, inline styles and data resources are permitted. The only optional read bridge returns the specifically committed snapshot. The frame has a five-minute lifetime and closing the desk terminates its channel and revokes its local grants.

**Arbitrary code is not certified safe.** A hash proves identity, not correctness, privacy or harmlessness. Browser sandbox/CSP containment does not prove that all browsers prevent self-navigation network channels, resource exhaustion or browser vulnerabilities; `navigate-to` has uneven browser support. Do not supply secret data to untrusted programs. No claim of total network isolation or safe execution of every conceivable program is made. Larger programs, external libraries, workers, WASM toolchains, audited runtime process isolation and rich permanent capability grants remain future extensions.

The optional transaction-proposal grant separately binds the exact program hash, chain, funding account, account epoch, target, native value in wei, calldata, expiry (at most five minutes) and call limit. The artifact's requested capabilities and cartridge ownership do not create this grant. A bridge request must match every field. It can prepare the existing wallet review only; it cannot submit the transaction. This path is useful for a new generated interface to suggest one exact owner-chosen operation without becoming an unrestricted wallet plugin.

Programs can receive the isolated `MessagePort` as follows:

```js
window.addEventListener('message', event => {
  if (event.data.schema !== 'anima.instrument-channel/1') return;
  const port = event.ports[0];
  port.onmessage = event => console.log(event.data);
  port.postMessage({ id: 'chosen-data', method: 'read-snapshot' });
  // A separately granted exact proposal uses method:'propose-transaction',
  // params:{target, value:'0', data:'0x...'}.
});
```

## Validation and remaining breadth

```sh
node --test test/extensions/worlds-runtime.test.mjs test/extensions/worlds-instruments.test.mjs
python worlds/browser-check.py
```

The Node suite tests two independent real HTTP clients; signed login and non-owner rejection; single-use challenges; context and epoch invalidation; request flood rejection; persistent reconnect; authoritative movement, harvesting, crafting, towns, combat and market settlement; exact command replay rejection; tampered receipts; real native-collection ownership checks over HTTP RPC; and actual generated-source escrow payment, frozen onchain acquisition, mismatch rejection and expired refunds. It uses a local chain fixture, not public funds.

The optional browser script exercises desktop and mobile clients, market synchronization, receipt verification, page reload, and actual iframe parent/network/snapshot boundaries. It requires Playwright and Chromium, as does the inherited browser suite. No browser pass is claimed when those dependencies are absent.

The world is useful playable source, not a completed MMO. Missing breadth includes large-scale sharding, raids and PvP, a comprehensive quest/story system, guild governance, language integration, production anti-cheat operations, durable replicated storage, contract-wallet/agent delegation and audited onchain asset settlement. Rendering and simulation execute on clients and the server; immutable NFT storage does not make this service onchain or immortal. No hosting or public-chain deployment was performed by this change.

## Storage and streaming upgrade

The service now requires Node 22.13 or later (Node 24 LTS recommended for the built-in `node:sqlite` API). Existing movement, gathering, combat, towns, inventories and market escrow are preserved.

`world.sqlite` replaces the old repeatedly rewritten snapshot. Normalized entity rows, world metadata, the exact signed command receipt, the request commitment and its global revision commit in one SQLite transaction. WAL mode and `synchronous=FULL` are enabled. A successful command acknowledgement follows the durable commit. The receipt signing key and its directory are synced before serving requests. Restart recovers the WAL; the tested SIGKILL case restores the acknowledged command and returns its original receipt on retry without spending again.

A legacy `world.json` is imported on first database creation, preserving characters, orders, guest resume hashes and other records. The former 4 MB startup cap is removed. The legacy file is retained as an import source, but it is not rewritten and must not be mistaken for the current state. Entity pages are bounded; a 20,000-character fixture larger than the old limit is covered by tests. This does not claim MMO-scale concurrent load: gameplay still runs in one authoritative process with the existing active-player limit and deterministic model.

New clients send a random `commandId` with every action. The committed command ID, input hash and signed receipt persist together. Retrying the identical ID and input returns the prior receipt. Reusing it for changed input returns conflict. The player sequence still protects ordering. Commands without an ID retain the older reject-on-replay behavior. Per-entity revisions are available from paged reads; retained command receipts are not discarded when the bounded delta journal rolls over.

The browser uses authenticated fetch streaming at `/stream`, rather than repeatedly downloading the whole world every 600 ms. The bearer travels in the Authorization header. The initial message is a bounded snapshot; subsequent messages are contiguous entity changes and removals. A reconnect starts with a fresh bounded snapshot, including if its old journal cursor has expired. Backpressure closes a slow stream so it can resynchronize. Expired/replaced sessions close streams, and NFT ownership is rechecked periodically and again at each command's mutation boundary.

`/state` and `/stream` accept optional `x` and `y` region centers. Views include the current traveller and at most 128 nearby characters, 128 towns and 64 market orders. `/state/page?kind=players&cursor=...&limit=64` reads indexed public entities with per-entity revisions; guest credential rows are never exposed. Market pages are navigable in the existing client and continue receiving deltas. `/changes?since=REVISION` returns up to 128 durable journal entries or requests a reset when the retained history no longer covers that cursor. Readers must treat each returned revision as a point-in-time view, not merge arbitrary pages as if no mutation occurred between requests.

For consistent backup, stop the service gracefully, then copy `world.sqlite` and `receipt-key.pem` together. A running filesystem copy must include SQLite's WAL/SHM state and use SQLite's supported online backup procedure; copying only a live database file can omit committed WAL changes. The server checkpoints on graceful close. It removes a stale PID lock only when the process is demonstrably absent and never steals a live lock. Database/storage errors halt further game mutations and report service unavailability. There is still one server authority; WAL is not replication or protection against losing the storage device.

References: [Node's SQLite API](https://nodejs.org/api/sqlite.html), [SQLite WAL operation and backup boundaries](https://www.sqlite.org/wal.html).
