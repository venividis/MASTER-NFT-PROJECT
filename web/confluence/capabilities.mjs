export const PRIMARY_CAPABILITIES = Object.freeze(
  [
    {
      key: "trade",
      label: "Swap",
      description: "Exchange assets with an explicit privacy choice",
      scope: "connected",
    },
    {
      key: "launch",
      label: "Launch",
      description:
        "Launch liquidity, community sales and auctions with your own economics",
      scope: "connected",
    },
    {
      key: "vault",
      label: "Vault",
      description: "Lock assets and inspect release schedules",
      scope: "connected",
    },
    {
      key: "memory",
      label: "Memory",
      description:
        "Choose encrypted notes, public inscriptions or hash-only seals",
      scope: "mixed",
    },
    {
      key: "world",
      label: "Commons",
      description: "Encrypted conversations and clearly separate public rooms",
      scope: "connected",
    },
    {
      key: "cartridges",
      label: "Worlds",
      description: "Play local worlds or load owned content-pinned cartridges",
      scope: "mixed",
    },
    {
      key: "atlas",
      label: "Atlas",
      description: "Find instruments, identity and advanced configuration",
      scope: "navigation",
    },
  ].map(Object.freeze),
);
export const ADVANCED_ROUTES = Object.freeze([
  "modules",
  "governance",
  "crosschain",
  "extensions",
  "agents",
  "routes",
  "lab",
  "ledger",
  "live",
]);
export function resolveCapabilityRoute(key) {
  return (
    {
      trade: "v4",
      journal: "memory",
      vault: "live",
      world: "commons",
      "world-public": "live",
      exits: "exit-live",
    }[key] || key
  );
}
const legacyCatalog = {
  modules: [
    "Module workbench",
    "Install, open and evolve owner-selected onchain tools",
  ],
  security: [
    "Authority & recovery",
    "Inspect permissions, agent ownership and unresolved assets",
  ],
  governance: [
    "Shared ownership",
    "Vote on exact NFT operations, budgets and funded exits",
  ],
  crosschain: [
    "Cross-chain transfers",
    "Verified asset transport, destination actions and recovery",
  ],
  extensions: [
    "New instruments",
    "Auctions, privacy, agents, worlds and all section 17 implementations",
  ],
  workshop: [
    "Instrument workshop",
    "Commission, review and acquire a new instrument",
  ],
  v4: ["Shielded v4 exchange", "Choose private or public swaps"],
  privacy: [
    "Private wallet",
    "Encrypted recovery, sealed drafts and shielded funds",
  ],
  commons: ["Commons", "Encrypted conversations, invitations and public rooms"],
  participant: ["Join a launch", "Read verified terms, contribute and claim"],
  live: ["Onchain instruments", "Swap, lock, inscribe and post with your NFT"],
  interior: ["Interior", "Explore the living space inside the object"],
  "exit-live": [
    "Onchain vesting exits",
    "Fund and operate an exact onchain schedule",
  ],
  exits: ["Vesting exits", "Let time unfold a remembered decision"],
  burners: [
    "Mint sanctuary",
    "Isolated project wallets and a restricted mint desk",
  ],
  home: ["Artifact", "The living whole"],
  trade: ["Exchange", "Swap, route, and remember why"],
  launch: ["Genesis", "Create a token and a pool with shared liquidity fees"],
  vault: ["Vault", "Locks and vesting schedules"],
  give: ["Give", "Consent-based gifts"],
  market: ["Market", "Trade the artifact and its holdings"],
  world: ["Commons", "Conversations, circles, and presence"],
  journal: ["Memory", "Private notes and append-only reflections"],
  library: ["Library", "Publish and collect editions"],
  work: ["Work", "Commissions and deliverables"],
  ledger: ["Commitments", "Inspect obligations and custody"],
  lab: ["Laboratory", "Strategies, baskets, credit, and options"],
  routes: ["Distribution", "Choose every recipient and asset"],
  cartridges: ["Worlds", "Load games inside your artifact"],
  agents: ["Agent studio", "Compose and review account actions"],
  identity: ["Identity", "Inspect your origin, history and recovery"],
  atlas: ["Atlas", "Every function, always within reach"],
  connect: ["Connect NFT", "Read an owned onchain identity"],
  settings: [
    "Appearance & settings",
    "Light, motion, sound and local recovery",
  ],
  tools: ["Tools", "Seven doors into the same living world"],
};
export const CAPABILITY_CATALOG = Object.freeze({
  ...legacyCatalog,
  ...Object.fromEntries(
    PRIMARY_CAPABILITIES.map(({ key, label, description }) => [
      key,
      [label, description],
    ]),
  ),
  advanced: [
    "Advanced",
    "Developer tools, specialist instruments and authority research",
  ],
  extensions: [
    "Specialist instruments",
    "Auctions, privacy research, agents and world services",
  ],
  agents: [
    "Developer console",
    "Review exact contract calls and authority configuration",
  ],
});
