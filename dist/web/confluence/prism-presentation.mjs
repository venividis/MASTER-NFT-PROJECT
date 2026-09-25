// Presentation is shared by the live release and its recovered mint simulator.
// No chain state or task availability is inferred from this visual vocabulary.
export const PRISM_ROUTES = Object.freeze({
  home: [
    "A world within.",
    "One living identity. Infinite ways to become.",
    "The Living Crown",
  ],
  v4: [
    "Exchange, with intention.",
    "Two currents. One considered choice.",
    "The Double Current",
  ],
  launch: [
    "Give an idea its first light.",
    "Shape the beginning. Review every promise.",
    "The First Branch",
  ],
  participant: [
    "A beginning, shared.",
    "Read the terms. Choose your part.",
    "The Open Offering",
  ],
  live: [
    "Let time hold it.",
    "Clear commitments. Measured release.",
    "The Braided Chamber",
  ],
  "exit-live": [
    "Let time unfold.",
    "A schedule, with room to recover.",
    "The Braided Chamber",
  ],
  memory: [
    "Keep what matters.",
    "Choose where your words will live.",
    "The Luminous Folio",
  ],
  journal: [
    "Keep what matters.",
    "A quiet place for your own words.",
    "The Luminous Folio",
  ],
  commons: [
    "A place to belong.",
    "An open door. A considered connection.",
    "The Constellation Loom",
  ],
  cartridges: [
    "Small worlds. Endless beginnings.",
    "Enter, play, and make something your own.",
    "The Folded Horizons",
  ],
  workshop: [
    "Make room for an idea.",
    "Commission an instrument. Inspect what arrives.",
    "The Living Loom",
  ],
  atlas: [
    "Find your next possibility.",
    "Every instrument, within reach.",
    "The Unfurled Firmament",
  ],
  modules: [
    "A living library.",
    "Your tools. Your chosen versions.",
    "The Living Loom",
  ],
  identity: [
    "One identity. A continuing story.",
    "An immutable origin. A life still unfolding.",
    "The Continuity Chamber",
  ],
  privacy: [
    "Choose what you reveal.",
    "Understand the boundary before you cross it.",
    "The Veiled Lens",
  ],
  burners: [
    "A quiet beginning.",
    "Separate wallets. Deliberate permissions.",
    "The Veiled Lens",
  ],
  governance: [
    "Shape what comes next.",
    "A shared voice. An exact decision.",
    "The Shared Horizon",
  ],
  crosschain: [
    "Carry it across.",
    "Follow the journey, all the way through.",
    "The Shared Horizon",
  ],
  agents: [
    "A capable hand. Your rules.",
    "Exact actions. Authority you can inspect.",
    "The Covenant Loom",
  ],
  security: [
    "Know what has your trust.",
    "Inspect authority, ownership, and recovery.",
    "The Covenant Loom",
  ],
  routes: [
    "Give every current a direction.",
    "Name each recipient. Review every share.",
    "The Covenant Loom",
  ],
  settings: [
    "Make it yours.",
    "Find your light. Keep your own pace.",
    "The Quiet Control Room",
  ],
  tools: [
    "What will you make today?",
    "Seven doors into the same living world.",
    "Within Reach",
  ],
  connect: [
    "Bring your identity home.",
    "Read first. Sign only when you choose.",
    "The Continuity Chamber",
  ],
});

export const PRISM_ATLAS_GROUPS = Object.freeze([
  ["Identity", ["identity", "connect", "interior"]],
  [
    "Create",
    ["launch", "participant", "workshop", "modules", "library", "work"],
  ],
  ["Exchange", ["trade", "vault", "exit-live", "routes", "give", "market"]],
  ["Connect", ["world", "governance", "crosschain", "agents"]],
  ["Explore", ["cartridges", "memory", "settings"]],
  [
    "Advanced",
    [
      "privacy",
      "burners",
      "security",
      "extensions",
      "ledger",
      "lab",
      "advanced",
    ],
  ],
]);

export function prismArtRoute(route, operation) {
  if (route === "live")
    return (
      { lock: "vault", memory: "memory", post: "commons", swap: "trade" }[
        operation
      ] || "vault"
    );
  return (
    {
      v4: "trade",
      journal: "memory",
      world: "commons",
      cartridges: "worlds",
      "exit-live": "vault",
      burners: "burner",
      routes: "distribution",
      tools: "atlas",
      settings: "identity",
    }[route] || route
  );
}

const glyphs = {
  home: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c5 4 5 12 0 16-5-4-5-12 0-16Z"/>',
  trade: '<path d="M3 8h17l-4-4M21 16H4l4 4"/>',
  launch: '<path d="M12 2v20M2 12h20M5 5l14 14M5 19 19 5"/>',
  vault: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10 9-5M12 12 3 7m9 5v10"/>',
  memory:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="3"/>',
  world:
    '<circle cx="12" cy="6" r="4"/><circle cx="6" cy="17" r="4"/><circle cx="18" cy="17" r="4"/>',
  cartridges:
    '<circle cx="12" cy="12" r="7"/><ellipse cx="12" cy="12" rx="12" ry="4" transform="rotate(-28 12 12)"/>',
  atlas:
    '<circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="5" ry="10"/><path d="M2 12h20M4 6h16M4 18h16"/>',
  tools: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
};
export function prismIcon(key) {
  return `<svg class="prism-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[key] || glyphs.home}</svg>`;
}

export function normalizePrismPreferences(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
  const spectrum =
    typeof value.spectrum === "number" ||
    (typeof value.spectrum === "string" && value.spectrum.trim())
      ? Number(value.spectrum)
      : 1.12;
  return {
    spectrum: Number.isFinite(spectrum)
      ? Math.max(0, Math.min(1.6, spectrum))
      : 1.12,
    quality: ["auto", "economy", "detail"].includes(value.quality)
      ? value.quality
      : "auto",
    motion: typeof value.motion === "boolean" ? value.motion : null,
  };
}
