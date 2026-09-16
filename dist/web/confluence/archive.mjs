import { verifyBundle } from "../model.mjs";
import { validateRoutePlan, launchTerms } from "./economy.mjs";
import { validateWorld } from "./console-core.mjs";
export async function validateConfluenceArchive(raw, restoreEngine) {
  if (raw?.schema !== "awe.confluence/archive/1")
    throw Error("Choose a Confluence archive.");
  const origin = await verifyBundle(raw.origin),
    seed = origin.state.seed;
  const engine = restoreEngine(raw.instruments, seed);
  if (engine.mem.origin !== seed)
    throw Error("Memory and origin do not match.");
  if (!Array.isArray(raw.routes)) throw Error("Missing distribution plans.");
  const routes = raw.routes.length ? validateRoutePlan(raw.routes) : [],
    world = validateWorld(raw.world),
    launch = raw.launch ? launchTerms(raw.launch) : null;
  if (!Array.isArray(raw.chainReceipts) || raw.chainReceipts.length > 10000)
    throw Error("Invalid receipt archive.");
  // Imported RPC receipts remain historical local records, never authenticated spend authority.
  const values = {
    "idfbi.optical.1.2": JSON.stringify(raw.origin),
    ["idfbi.instruments.1.7:" + seed]: JSON.stringify({
      schema: "idfbi/instrument-file/1.7",
      originSeed: seed,
      originAudit: origin.state.audit,
      engine: engine.export(),
    }),
  };
  for (const [key, value] of Object.entries({
    routes,
    launch,
    world,
    "chain-receipts": raw.chainReceipts,
  }))
    values["awe.confluence:" + seed + ":" + key] = JSON.stringify(value);
  return {
    seed,
    values,
    originReceipts: origin.receipts.length,
    instrumentEvents: engine.world.s.events.length,
  };
}
export function replaceArchiveStorage(storage, values) {
  const previous = Object.fromEntries(
    Object.keys(values).map((k) => [k, storage.getItem(k)]),
  );
  try {
    for (const [key, value] of Object.entries(values))
      storage.setItem(key, value);
  } catch (error) {
    for (const key of Object.keys(previous)) storage.removeItem(key);
    for (const [key, value] of Object.entries(previous))
      if (value !== null) storage.setItem(key, value);
    throw Error(
      "Could not save the archive; previous saved data restored. " +
        error.message,
    );
  }
}

export const archiveScope = Object.freeze({
  version: 1,
  included: Object.freeze([
    "original local history",
    "instrument rehearsals",
    "encrypted notebook ciphertext",
    "distribution plans",
    "saved launch definition",
    "Prism world",
    "saved transaction receipt records",
  ]),
  excluded: Object.freeze([
    "private wallet recovery",
    "burner wallet recovery",
    "service credentials and settings",
    "deployment configuration",
    "onchain application bytes and current chain state",
  ]),
  summary:
    "Exports original local history, instrument rehearsals, encrypted notebook ciphertext, distribution plans, Prism world and saved receipt records. Keep the notebook passphrase separately. Private wallet and burner recovery, service settings and deployed chain content are separate exports.",
});
