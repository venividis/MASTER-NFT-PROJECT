import type { CartridgeManifest } from "./types.js";
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
    consoleProfile: {
        profile: "awe.console/1";
        world?: ConsoleWorld;
    };
    notes: string[];
}
export declare function validateConsoleWorld(input: unknown): ConsoleWorld;
/**
 * Supported Console subset: additionally validates optional contentHash syntax.
 * It does not fetch content, verify hashes, authorize capabilities or enforce settlement.
 */
export declare function validateConsoleProfile(input: unknown): ConsoleManifestV1;
export declare function importConsoleProfile(input: unknown, context: ConsoleEnrichment): ImportedConsoleCartridge;
export declare function exportConsoleProfile(source: CartridgeManifest, options: {
    acknowledgeMetadataLoss: true;
    hashBinding: "same-single-html-bytes";
    world?: ConsoleWorld;
}): {
    manifest: ConsoleManifestV1;
    omitted: string[];
    notes: string[];
};
