import { verifyBundle } from "../model.mjs";
import { validateRoutePlan, launchTerms } from "./economy.mjs";
import { validateWorld } from "./console-core.mjs";
import { normalizePrismPreferences } from "./prism-presentation.mjs";
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
  // Appearance is optional in older archives and carries no identity or authority.
  if (raw.appearance !== undefined)
    values["awe.confluence:" + seed + ":prism-preferences"] = JSON.stringify(
      normalizePrismPreferences(raw.appearance),
    );
  return {
    seed,
    values,
    originReceipts: origin.receipts.length,
    instrumentEvents: engine.world.s.events.length,
  };
}

/** Remap only validated archive storage names into a reserved simulator scope.
 * An omitted prefix preserves the normal application's exact storage names.
 * This does not validate archive content; call validateConfluenceArchive first.
 */
export function scopeConfluenceArchiveStorage(values, prefix) {
  if (
    prefix !== undefined &&
    (typeof prefix !== "string" ||
      !/^anima\.simulator:[a-z0-9][a-z0-9._-]{0,63}:$/i.test(prefix))
  )
    throw Error("Unsupported simulator archive scope.");
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw Error("Invalid archive storage values.");
  let seed;
  const mapped = Object.entries(values).map(([key, value]) => {
    if (typeof value !== "string")
      throw Error("Invalid archive storage value.");
    let suffix;
    if (key === "idfbi.optical.1.2") suffix = "optical";
    else {
      const instrument = key.match(
        /^idfbi\.instruments\.1\.7:(0x[\da-f]{64})$/i,
      );
      const confluence = key.match(
        /^awe\.confluence:(0x[\da-f]{64}):(routes|launch|world|chain-receipts|prism-preferences)$/i,
      );
      const identity = instrument?.[1] || confluence?.[1];
      if (!identity) throw Error("Unsupported archive storage key.");
      if (seed && seed !== identity)
        throw Error("Archive storage mixes identities.");
      seed = identity;
      suffix = instrument
        ? "instruments:" + identity
        : "confluence:" + identity + ":" + confluence[2];
    }
    return [prefix === undefined ? key : prefix + suffix, value];
  });
  return Object.fromEntries(mapped);
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
    "appearance preferences",
  ]),
  excluded: Object.freeze([
    "private wallet recovery",
    "burner wallet recovery",
    "service credentials and settings",
    "deployment configuration",
    "onchain application bytes and current chain state",
  ]),
  summary:
    "Exports original local history, instrument rehearsals, encrypted notebook ciphertext, distribution plans, Prism world, saved receipt records and appearance preferences. Keep the notebook passphrase separately. Private wallet and burner recovery, service settings and deployed chain content are separate exports.",
});
