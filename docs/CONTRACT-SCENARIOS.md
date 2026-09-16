# Exact-contract launch scenarios

The launchpad Economics desk includes Uniswap CCA and Doppler mechanism panes backed by a dedicated local EVM. Every bid, trade, claim, refund, migration and collection calls the pinned protocol contracts through the same client plan builders used by the live interface. The scenario service uses fixed test actors and its own local test funds; it never connects the user's wallet or accepts a public RPC, private key, arbitrary contract address, calldata or shell command.

## Start and connect

From the source project, install the project's locked dependencies, including the pinned official-launch and Foundry tooling used by `integrations/official-launch`. Build the official protocol artifacts using that package's build script when rebuilding from source. The scenario runner consumes those exact artifacts.

Start the service:

```sh
node agent/scenarios/server.mjs
```

The command binds to `http://127.0.0.1:8791` and prints a random private access code. The port can be changed with `ANIMA_SCENARIO_PORT`. For a separately hosted ANIMA page, set the one permitted browser origin explicitly:

```sh
ANIMA_SCENARIO_ORIGIN=https://your-anima-host.example node agent/scenarios/server.mjs
```

Open Economics, choose CCA or Doppler, enter the service origin and printed code, check service status and start a scenario. Each start creates its own local Anvil chain. No remote tunnel is supplied. A static hosted page cannot start a local process for the user, and browser local-network/HTTPS restrictions may require a supported local setup or a deliberately configured HTTPS reverse proxy. The service itself binds only to loopback; an operator configuring a proxy must preserve the exact allowed origin and authentication.

Select the launch outcome, protocol fee or supported Doppler economics, then choose a participant and execute lifecycle actions. Advance only to the offered lifecycle boundaries. The interface shows actual participant and contract balances, fee recipients, liquidity custody, transaction receipts, rejected contract operations and conservation residuals. Economic native changes add back transaction gas paid by that account; the system conservation check still accounts for burned base fees. A successful source transaction is not a prediction of future token prices or public launch demand.

CCA scenarios cover success, a missed funding minimum and migration failure with its real recovery route. Doppler scenarios cover success and a missed funding minimum, buy/sell quotes and trades, migration, protocol/integrator fee collection and the protocol's actual LP lock/release. The finite runner owns any creator-only actions with its separate local creator actor. Unsupported or premature calls produce the actual contract/client failure and leave the session usable.

## Service and credential boundaries

- Default maximum: three sessions, 128 steps each, twenty-minute expiry. Each runner also enforces its own 128-step bound. Requests are at most 8 KiB and responses at most 1 MiB; the service limits request rate and serializes each session's mutations.
- An operator code authorizes creation. A distinct random session token authorizes state reads, steps and closure. Both travel in authorization headers and remain only in browser memory. The private DOM surface prevents animation text collection; lock/unmount clears secrets, aborts requests and closes the scenario.
- Only the selected exact browser origin receives CORS access. The browser client refuses insecure remote HTTP origins, credentials inside URLs, URL paths/query/hash, redirects and credentialed requests.
- Fixed command schemas reject arbitrary addresses, keys, RPCs and scripts. Decimal bounds use integer arithmetic at 18 places. Participants are fixed actors zero and one.
- Stable command IDs make a response retry return the same result without resubmitting a transaction. A changed payload for the same ID fails. If the runner throws after possible execution, the service recovers chain state and retires the command ID instead of executing it again.
- Closing or cancelling a startup aborts its runner. Expiry and explicit close terminate the isolated chain. Sessions are intentionally ephemeral; the downloadable scenario record preserves terms, state and receipts, but no service credentials. It does not recreate that temporary chain after it closes.

The API is `GET /config`, `POST /sessions`, and authenticated `GET /sessions/:id`, `POST /sessions/:id/step`, `DELETE /sessions/:id`. The browser-facing classes are `ScenarioClient` and `OfficialScenarioDesk` in `web/launchpad/scenario-client.mjs`. Parent panels must not unmount a live child after every step: the child paints its own results, while unmount intentionally destroys the local session.

## Evidence

`integrations/official-launch/test/scenario.test.mjs` exercises pinned CCA and Doppler contract lifecycles, including failed-minimum paths, CCA migration recovery, Doppler creator proceeds, protocol/integrator fee collection and LP exit, with conserved native/token/LP balances. `test/scenarios/contract-service.integration.test.mjs` drives an actual funded CCA bid, clearing, exit, claim and v4 migration through the authenticated HTTP service and browser client. Service tests separately cover authorization, origin checks, bounded commands, idempotent retries, ambiguous response recovery and cancelled startup. DOM tests cover secret clearing and restart-after-lock exclusion.

These are reproducible local contract journeys. They are not public deployment receipts, funded Ethereum launches, production load tests or physical-phone interaction tests.
