/** Shared product inventory. Source availability is distinct from a verified deployment. */
export const RELEASE_CAPABILITIES = Object.freeze(
  [
    {id:'functional-modules',label:'Independently versioned onchain software',route:'identity',source:['contracts/src/protocol/OnchainModuleDirectory.sol','web/confluence/module-loader.mjs'],requires:['Minted module directory and immutable archives'],boundary:'Every feature pins its content and dependency versions. Recovery verifies the required graph before running it; editing a hosted interface never replaces an already minted edition.'},
    {
      id: "art",
      label: "Living NFT and continuous navigation",
      route: "home",
      source: ["web/genesis/field.js", "web/genesis/interior.mjs"],
      requires: [],
      boundary:
        "The browser renders the minted seed and state. Physical phone interaction remains a separate validation step.",
    },
    {
      id: "account",
      label: "NFT account and exact delegated authority",
      route: "security",
      source: [
        "contracts/src/core/SovereignAccount.sol",
        "contracts/src/extensions/agents/AgentPolicyGuard.sol",
      ],
      requires: ["NFT collection and account"],
      boundary:
        "New editions reject legacy selector sessions. Every delegated action fixes calldata and one asset budget; NFT transfer revokes earlier authority.",
    },
    {
      id: "agent-identity",
      label: "Verified agent-token ownership",
      route: "security",
      source: ["contracts/src/core/IDontFuckingBelieveIt.sol"],
      requires: ["Selected agent identity registry"],
      boundary:
        "Verifies current ownership in the selected registry, not endpoint authenticity, reputation or service quality.",
    },
    {
      id: "recovery",
      label: "Unreadable-token isolation and recovery",
      route: "security",
      source: ["contracts/src/operating/ExperimentCell.sol"],
      requires: ["Experiment cell"],
      boundary:
        "Quarantined assets remain unresolved and disclosed. This does not certify external debt or untracked assets.",
    },
    {
      id: "public-launch",
      label: "Funded v4 launch and creator economics",
      route: "launch",
      source: [
        "integrations/console/protocol/v4-hook/src/GenesisV4Launchpad.sol",
        "integrations/console/protocol/v4-hook/src/GenesisV4HookLaunchpad.sol",
      ],
      requires: ["PoolManager", "Launch factory", "Quote asset"],
      boundary:
        "Public token, pool, amounts and terms. Selected wallet or compatible NFT account funds the operation.",
    },
    {
      id: "private-launch",
      label: "Shielded swaps and creator-hook launches",
      route: "privacy",
      source: ["packages/privacy/src/runtime.mjs", "web/v4/client.mjs"],
      requires: [
        "RAILGUN deployments",
        "Synchronized shielded funds",
        "Circuits and POI",
        "Broadcaster",
      ],
      boundary:
        "Shields funding and recipient linkage, not token/pool details. Never silently falls back to public execution. Funded public-chain proving requires configured services.",
    },
    {
      id: "lifecycle",
      label: "Permanent launch records and optional allocations",
      route: "launch",
      source: [
        "contracts/src/extensions/launch/LaunchRegistry.sol",
        "contracts/src/extensions/launch/LaunchAllocationComposer.sol",
      ],
      requires: [
        "Launch registry",
        "Allocation composer",
        "TimeVault for timed allocations",
      ],
      boundary:
        "Public registry attribution is explicit. Atomic token and LP allocations succeed or revert together; records survive browser data loss.",
    },
    {
      id: "participants",
      label: "Shareable launch and participant pages",
      route: "launch",
      source: ["web/launchpad/participant.mjs", "web/launchpad/links.mjs"],
      requires: ["Read RPC", "Selected launch deployment"],
      boundary:
        "Read terms without connecting; contributions, bids, claims and refunds require a reviewed wallet transaction.",
    },
    {
      id: "fee-strategies",
      label: "Fee collection, conversion and compounding",
      route: "launch",
      source: [
        "contracts/src/extensions/strategies/V4Strategies.sol",
        "web/launchpad/strategies-client.mjs",
      ],
      requires: [
        "Compatible position",
        "Converter for payout conversion",
        "Funded keeper for automation",
      ],
      boundary:
        "Fee-only collection preserves principal. Committed hooks and splits are optional and irreversible. Automated compounding is explicitly funded and revocable.",
    },
    {
      id: "scheduled-exits",
      label: "Scheduled v4 exits and recovery",
      route: "launch",
      source: [
        "contracts/src/extensions/strategies/V4Strategies.sol",
        "agent/v4-exit-keeper.mjs",
      ],
      requires: ["Exit contract", "Funded input", "Keeper rewards and caller"],
      boundary:
        "Each slice enforces its minimum output. Pause/cancel recovers unsold assets and unearned rewards. A schedule alone does not run a keeper.",
    },
    {
      id: "economic-simulation",
      label: "Conserved economic simulation",
      route: "launch",
      source: ["web/launchpad/economics.mjs", "integrations/official-launch/scenario/runner.mjs", "agent/scenarios/server.mjs"],
      requires: ["Browser for ANIMA mechanisms", "Configured isolated scenario service for official CCA and Doppler"],
      boundary:
        "ANIMA pools, community sales and streaming auctions conserve model balances. Official CCA and Doppler execute the pinned contracts in isolated local chains, including failure and migration. No scenario uses wallet funds or predicts a market.",
    },
    {
      id: "community",
      label: "Community sales and ANIMA auctions",
      route: "launch",
      source: [
        "web/launchpad/sale-client.mjs",
        "web/launchpad/auction-client.mjs",
      ],
      requires: ["Selected sale or auction deployment"],
      boundary:
        "Each mechanism has explicit settlement, withdrawal, refund, vesting and liquidity rules.",
    },
    {
      id: "official-cca",
      label: "Official Uniswap CCA and liquidity migration",
      route: "launch",
      source: [
        "integrations/official-launch/scripts/build.mjs",
        "web/launchpad/protocols-client.mjs",
      ],
      requires: [
        "Pinned CCA factory",
        "Liquidity Launcher strategy when selected",
        "Verified migration dependencies",
      ],
      boundary:
        "Runs pinned official protocol contracts; CCA fees and migration rules are disclosed. ANIMA’s streaming auction is a separate mechanism.",
    },
    {
      id: "official-doppler",
      label: "Official Doppler and Airlock launches",
      route: "launch",
      source: [
        "integrations/official-launch/scripts/build.mjs",
        "web/launchpad/protocols-client.mjs",
      ],
      requires: [
        "Pinned Airlock and enabled factories",
        "Doppler initializer",
        "Selected migrator",
      ],
      boundary:
        "Selected official strategy determines auction, failure and migration economics, including inherited LP locks and protocol fee recipients.",
    },
    {
      id: "commons",
      label: "Forward-secure encrypted conversations",
      route: "commons",
      source: [
        "contracts/src/extensions/privacy/MLSGroupChat.sol",
        "packages/communication/build.mjs",
        "web/commons/desk.mjs",
      ],
      requires: [
        "MLS transport",
        "Consent and fresh key packages",
        "Encrypted durable local state",
      ],
      boundary:
        "RFC 9420 MLS with erased message keys. Membership and traffic metadata remain public. Retained transcripts and old backups change compromise exposure; the selected MLS library has no formal security audit.",
    },
    {
      id: "legacy-chat",
      label: "Legacy encrypted history and manager migration",
      route: "commons",
      source: [
        "contracts/src/extensions/privacy/EpochGroupChat.sol",
        "web/commons/desk.mjs",
      ],
      requires: [
        "Legacy privacy contracts",
        "Existing recipient keys or backups",
      ],
      boundary:
        "Legacy ECDH epoch packages are not forward secure. Migration uses authenticated manager action and fresh recipient consent; NFT sale does not transfer chat secrets.",
    },
    {
      id: "governance",
      label: "Operating shared NFT ownership",
      route: "governance",
      source: ["web/governance/client.mjs", "web/governance/desk.mjs"],
      requires: ["Operating governance custody", "Voting shares"],
      boundary:
        "Checkpoint votes, exact budgets, delays, revocable operators and funded buyout exits. Existing frozen custody shares remain separate. Explicit obligations do not infer every external liability.",
    },
    {
      id: "worlds",
      label: "Persistent shared worlds",
      route: "extensions",
      source: [
        "agent/worlds/store.mjs",
        "agent/worlds/server.mjs",
        "worlds/transport.mjs",
      ],
      requires: [
        "Running authenticated world server",
        "Persistent SQLite storage",
      ],
      boundary:
        "Atomic commands, durable receipts, region pages and reconnectable deltas. Game currency is not automatically an onchain redeemable asset.",
    },
    {
      id: "crosschain",
      label: "Cross-chain assets and destination actions",
      route: "crosschain",
      source: ["web/crosschain/client.mjs", "packages/crosschain/build.mjs"],
      requires: [
        "Issuer OFT",
        "Verified LayerZero lane and peers",
        "Source and destination RPCs",
        "Transport funding",
      ],
      boundary:
        "Source confirmation and destination completion are separate. Public DVNs/transport remain trust and availability dependencies; local two-chain tests do not prove public delivery.",
    },
    {
      id: "sponsorship",
      label: "Exact-call sponsored gas",
      route: "extensions",
      source: [
        "contracts/src/extensions/access/SessionSponsor.sol",
        "web/extensions/access.mjs",
      ],
      requires: ["Funded sponsor", "Owner and sponsor signatures", "Relayer"],
      boundary:
        "The account permission and both signatures bind one exact request. A failed authorized attempt can consume the signed reimbursement cap.",
    },
    {
      id: "vaults-memory-work",
      label: "Vaults, memory, work and owned cartridges",
      route: "atlas",
      source: [
        "web/genesis/live-desk.mjs",
        "web/workshop/desk.mjs",
        "web/confluence/app.js",
      ],
      requires: [
        "Selected deployed module",
        "Owner funding or browser storage as shown",
      ],
      boundary:
        "Public inscriptions, encrypted local notes and isolated games have different data and asset guarantees. Each action shows its execution context.",
    },
  ].map((x) =>
    Object.freeze({
      ...x,
      source: Object.freeze(x.source),
      requires: Object.freeze(x.requires),
    }),
  ),
);
