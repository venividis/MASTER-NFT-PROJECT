// Atlas opens the original workflows; it never skips their validation or consent.
export const ORIGINAL_ACTIONS = [
  ["evolve", "Evolve", "Evolve this object", "#evolve"],
  ["memory", "Seal memory", "Commit a private thought", "#memory"],
  ["spawn", "Spawn", "Create a descendant", "#spawn"],
  ["ascend", "Ascend", "Review an authority change", "#ascend"],
  ["entropy", "Inject entropy", "Introduce a new influence", "#entropy"],
  ["details", "Original identity", "Inspect this object", "#details"],
  ["history", "History", "Revisit earlier states", "#history"],
  ["receipts", "Original receipts", "Verify the object’s events", "#inspect"],
  ["events", "Event horizon", "Read the complete event log", "#all-events"],
  ["tools", "Original tools", "Import, preview and proof recovery", "#more"],
  ["connect", "Original connection", "Connect, load or mint", "#connect"],
  ["mint", "Mint & recovery", "Connect a collection, then mint", "#connect"],
  ["genome", "Genome", "Inspect the genome commitment", '[data-root="genome"]'],
  ["root", "State root", "Inspect the state commitment", '[data-root="root"]'],
  [
    "memory-root",
    "Memory root",
    "Inspect sealed memory",
    '[data-root="memory"]',
  ],
  [
    "audit",
    "Audit root",
    "Inspect the audit commitment",
    '[data-root="audit"]',
  ],
  ["present", "Present", "Return to the living head", "#return-live"],
  [
    "export",
    "Export original",
    "Save the complete original history",
    "#export",
  ],
  ["portrait", "Original portrait", "Capture the blue object", "#portrait"],
  [
    "reference",
    "Archived v1.0",
    "Open the preserved first experiment",
    "#reference",
  ],
  [
    "boundary",
    "Execution boundary",
    "Inspect local and chain scope",
    "#environment",
  ],
  ["help", "Original guide", "Read the object’s controls", "#help"],
  ["whole", "Whole lens", "See the complete field", '[data-lens="0"]'],
  ["memory-lens", "Memory lens", "Look through memory", '[data-lens="2"]'],
  ["lineage", "Lineage lens", "Look through ancestry", '[data-lens="4"]'],
  ["reset", "Reset camera", "Return to the starting view", "#reset"],
  ["fold", "Fold space", "Transform the fourth-axis slice", "#fold"],
  ["motion", "Motion", "Pause or resume the object", "#motion"],
  ["quality", "Quality", "Choose rendering detail", "#quality"],
  ["sound", "Sound", "Listen to the original object", "#sound"],
  ["immerse", "Immerse", "Enter the original immersive view", "#immerse"],
];
export const SECONDARY_VIEWS = [
  ["form", "Lived form", "Compare the object’s life and original form"],
  ["receipts", "Instrument receipts", "Inspect economic records"],
  [
    "capabilities",
    "Capability map",
    "Inspect working and research capabilities",
  ],
  ["clock", "Clock", "Inspect local time and schedules"],
  ["applications", "Applications", "Inspect the application registry"],
  ["venues", "Venues", "Inspect available execution venues"],
  ["launch", "Launch rehearsal", "Use the original instrument launch"],
];
export async function dispatchOriginal(key, { document, close, home }) {
  const selection = globalThis.window?.__animaSelection?.get(),
    legacy = globalThis.window?.__idfbi?.chain?.();
  if (
    selection &&
    ["evolve", "memory", "spawn", "ascend", "entropy"].includes(key) &&
    !selection.localLife
  ) {
    const source = selection.source;
    const matches =
      selection.mode !== "visual-preview" &&
      legacy &&
      source &&
      ["chainId", "tokenId", "collection"].every(
        (k) =>
          String(legacy[k]).toLowerCase() === String(source[k]).toLowerCase(),
      );
    if (!matches)
      throw Error(
        "This original action is bound to a different client context. Connect the selected NFT in Original connection, or return to your local identity before using its rehearsal.",
      );
  }
  const entry = ORIGINAL_ACTIONS.find((x) => x[0] === key);
  if (!entry) throw Error("Unknown original function");
  const target = document.querySelector(entry[3]);
  if (!target) throw Error("This original function is not available yet");
  if (target.disabled)
    throw Error("This function is unavailable in the object’s current state");
  await close();
  home();
  target.click();
}
export function dispatchSecondary(view, api) {
  if (!SECONDARY_VIEWS.some((x) => x[0] === view))
    throw Error("Unknown instrument");
  api.openView(view);
}
