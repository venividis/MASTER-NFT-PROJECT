import type { CartridgeManifest, Hex } from "./types.js";

/** The deployed Console v1 profile. It is not the richer SDK manifest wire shape. */
export interface ConsoleWorld {
  name: string;
  terrain: ("plain" | "wall" | "prism")[];
}
export interface ConsoleManifestV1 {
  spec: "awe.cartridge/1";
  name: string;
  version: string;
  engine: string;
  entry: string;
  contentHash?: `sha256:${string}`;
  capabilities: string[];
  settlement: "server" | "onchain" | "local";
  world?: ConsoleWorld;
}
export interface ConsoleEnrichment {
  id: string;
  runtime: "web" | "wasm";
  gameAdapter: string;
  rulesVersion: string;
  compatibleChains: string[];
  settlement: CartridgeManifest["settlement"];
  capabilityReasons: Readonly<Record<string, string>>;
  /** Caller has established that the digest binds the identical self-contained HTML bytes. */
  hashBinding: "same-single-html-bytes";
}
export interface ImportedConsoleCartridge {
  manifest: CartridgeManifest;
  /** World has no equivalent in the generic SDK manifest; retain this sidecar for round trips. */
  consoleProfile: { profile: "awe.console/1"; world?: ConsoleWorld };
  notes: string[];
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function bounded(value: unknown, max: number, nonempty = false): value is string { return typeof value === "string" && value.length <= max && (!nonempty || !!value.trim()); }
function validChain(value: unknown): value is string { return typeof value === "string" && value.length <= 128 && /^[a-z0-9-]+:[A-Za-z0-9_.-]+$/.test(value); }
function neighbors(index: number): number[] {
  const x = index % 9, y = Math.floor(index / 9);
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([a, b]) => a! >= 0 && a! < 9 && b! >= 0 && b! < 9).map(([a, b]) => b! * 9 + a!);
}
export function validateConsoleWorld(input: unknown): ConsoleWorld {
  if (!record(input) || !bounded(input.name, 80, true) || !Array.isArray(input.terrain) || input.terrain.length !== 81 || input.terrain.some(cell => !["plain", "wall", "prism"].includes(cell)) || input.terrain[0] !== "plain" || input.terrain[80] !== "plain") throw new Error("Console world requires 81 cells and clear corner starts");
  const terrain = input.terrain as ConsoleWorld["terrain"];
  const visited = new Set([0]);
  const pending = [0];
  while (pending.length) for (const next of neighbors(pending.pop()!)) if (!visited.has(next) && terrain[next] !== "wall") { visited.add(next); pending.push(next); }
  if (!visited.has(80) || visited.size < 30) throw new Error("Console world must connect both corners through at least 30 playable cells");
  return { name: input.name.trim(), terrain: [...terrain] };
}

/**
 * Supported Console subset: additionally validates optional contentHash syntax.
 * It does not fetch content, verify hashes, authorize capabilities or enforce settlement.
 */
export function validateConsoleProfile(input: unknown): ConsoleManifestV1 {
  if (!record(input) || input.spec !== "awe.cartridge/1" || !bounded(input.name, 80, true) || !bounded(input.version, 32) || !bounded(input.engine, 40) || !bounded(input.entry, 2048) || !Array.isArray(input.capabilities) || input.capabilities.length > 16 || input.capabilities.some(capability => !bounded(capability, 60)) || typeof input.settlement !== "string" || !["server", "onchain", "local"].includes(input.settlement)) throw new Error("Invalid Console v1 manifest");
  const entry = input.entry;
  if (entry !== "awe:prism-relay" && !/^\/api\/console\/files\/[a-f0-9-]{36}$/.test(entry) && !/^\/api\/console\/content\/[a-f0-9]{64}$/.test(entry) && !/^https:\/\//.test(entry)) throw new Error("Console v1 needs an HTTPS entry or its packaged entry format");
  if (input.contentHash !== undefined && (typeof input.contentHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(input.contentHash))) throw new Error("Console contentHash must be sha256: followed by 64 lowercase hex digits");
  const result: ConsoleManifestV1 = {
    spec: "awe.cartridge/1", name: input.name, version: input.version, engine: input.engine,
    entry, capabilities: [...input.capabilities] as string[], settlement: input.settlement as ConsoleManifestV1["settlement"]
  };
  if (input.contentHash !== undefined) result.contentHash = input.contentHash as `sha256:${string}`;
  if (input.world !== undefined) result.world = validateConsoleWorld(input.world);
  return result;
}

function consoleSettlement(mode: CartridgeManifest["settlement"]["mode"]): ConsoleManifestV1["settlement"] {
  if (mode === "local") return "local";
  if (mode === "server-attested") return "server";
  if (mode === "onchain-transitions" || mode === "proof-verified") return "onchain";
  throw new Error("Unknown settlement mode");
}
function validateSettlement(value: CartridgeManifest["settlement"]): void {
  if (!value || !["local", "server-attested", "onchain-transitions", "proof-verified"].includes(value.mode)) throw new Error("Explicit settlement configuration is required");
  if (value.chain !== undefined && !validChain(value.chain)) throw new Error("Invalid settlement chain");
  if ((value.mode === "onchain-transitions" || value.mode === "proof-verified") && !value.chain) throw new Error("A settlement chain must be supplied explicitly");
  if ((value.mode === "server-attested" || value.mode === "onchain-transitions") && !bounded(value.authority, 256, true)) throw new Error("A settlement authority must be supplied explicitly");
  if (value.mode === "proof-verified" && !bounded(value.verifier, 256, true)) throw new Error("A verifier must be supplied explicitly");
}

export function importConsoleProfile(input: unknown, context: ConsoleEnrichment): ImportedConsoleCartridge {
  const source = validateConsoleProfile(input);
  if (context.hashBinding !== "same-single-html-bytes") throw new Error("Explicit content-hash byte-scope binding is required");
  if (!source.contentHash) throw new Error("Hash the actual self-contained HTML before importing into the SDK manifest");
  if (!bounded(context.id, 256, true) || !bounded(context.gameAdapter, 256, true) || !bounded(context.rulesVersion, 128, true) || !["web", "wasm"].includes(context.runtime) || !Array.isArray(context.compatibleChains) || context.compatibleChains.length > 64 || context.compatibleChains.some(chain => !validChain(chain)) || new Set(context.compatibleChains).size !== context.compatibleChains.length) throw new Error("Explicit valid SDK identity, runtime, adapter, rules and chain metadata is required");
  if (!source.version || !source.engine) throw new Error("SDK conversion requires a nonempty version and engine");
  validateSettlement(context.settlement);
  if (consoleSettlement(context.settlement.mode) !== source.settlement) throw new Error("Enriched settlement contradicts the Console selection");
  const capabilities = source.capabilities.map(method => {
    const reason = context.capabilityReasons[method];
    if (!/^[A-Za-z][A-Za-z0-9_.:/-]{0,127}$/.test(method) || !bounded(reason, 512, true)) throw new Error(`An explicit reason is required for valid capability ${method}`);
    return { method, reason };
  });
  const manifest: CartridgeManifest = {
    schemaVersion: "awe.cartridge/1", id: context.id, title: source.name, version: source.version,
    runtime: context.runtime, entrypoint: source.entry,
    contentHash: `0x${source.contentHash.slice(7)}` as Hex, contentHashAlgorithm: "sha256", engine: source.engine,
    compatibleChains: [...context.compatibleChains], gameAdapter: context.gameAdapter, rulesVersion: context.rulesVersion,
    requestedCapabilities: capabilities, settlement: { ...context.settlement }, itemSchemas: []
  };
  return {
    manifest,
    consoleProfile: { profile: "awe.console/1", ...(source.world ? { world: source.world } : {}) },
    notes: [
      "Identity, runtime, chain, rules and settlement details were supplied by the caller; the Console manifest did not establish them.",
      "The digest was reformatted, not recomputed or verified. The caller bound both formats to identical self-contained HTML bytes.",
      "Console capabilities are requests, not proof that the host grants them. No item mint schema is inferred.",
      ...(source.entry.startsWith("https:") ? ["The current Console does not verify external HTTPS executable bytes before framing them."] : []),
      ...(source.world ? ["Console world data is preserved separately; generic SDK manifests do not define a Prism Relay world field."] : [])
    ]
  };
}

export function exportConsoleProfile(source: CartridgeManifest, options: {
  acknowledgeMetadataLoss: true;
  hashBinding: "same-single-html-bytes";
  world?: ConsoleWorld;
}): { manifest: ConsoleManifestV1; omitted: string[]; notes: string[] } {
  if (options.acknowledgeMetadataLoss !== true || options.hashBinding !== "same-single-html-bytes") throw new Error("Console export requires explicit acknowledgement of metadata loss and byte scope");
  if (source.schemaVersion !== "awe.cartridge/1" || !["web", "wasm"].includes(source.runtime)) throw new Error("Console v1 cannot execute a native-client manifest");
  if (source.contentHashAlgorithm !== "sha256" || !/^0x[0-9a-fA-F]{64}$/.test(source.contentHash)) throw new Error("Expected SDK SHA-256 digest");
  if (!source.engine) throw new Error("Console v1 requires an explicit engine name");
  validateSettlement(source.settlement);
  const manifest = validateConsoleProfile({
    spec: "awe.cartridge/1", name: source.title, version: source.version, engine: source.engine,
    entry: source.entrypoint, contentHash: `sha256:${source.contentHash.slice(2).toLowerCase()}`,
    capabilities: source.requestedCapabilities.map(capability => capability.method), settlement: consoleSettlement(source.settlement.mode),
    ...(options.world ? { world: options.world } : {})
  });
  return {
    manifest,
    omitted: ["id", "cartridge", "runtime", "compatibleChains", "gameAdapter", "rulesVersion", "requestedCapabilities.reason", "requestedCapabilities.target", "settlement.chain", "settlement.authority", "settlement.verifier", "itemSchemas"],
    notes: [
      "This is a UI/import projection, not a transfer of SDK security or settlement semantics.",
      "Console v1 does not enforce the omitted chain, authority, verifier, target scopes or item schemas.",
      "The current opaque Console transport supports console.info and granted world.read. Listing other methods does not implement or grant them.",
      ...(source.settlement.mode === "proof-verified" ? ["The proof-verified mode is reduced to the Console's broad onchain label; the proof requirement is absent from this projection."] : [])
    ]
  };
}
