import { identitySource } from "./minted-identity.mjs";

// Visual provenance and signing authority are separate. This store holds no keys.
export function selectIdentityContext(input) {
  const source = identitySource(input);
  const mode = input.preview
    ? "visual-preview"
    : input.connected && input.snapshot
      ? input.snapshot.stale
        ? "chain-stale"
        : "confirmed-chain"
      : source === input.local
        ? "local-preview"
        : source === input.minted
          ? "minted-snapshot"
          : "confirmed-chain";
  return Object.freeze({
    mode,
    source: source ? Object.freeze({ ...source }) : null,
    localLife: mode === "local-preview",
    ownerConnected: !!input.connected && !input.snapshot?.stale,
  });
}
export function createSelectedContext() {
  let current = Object.freeze({
      mode: "initializing",
      source: null,
      localLife: false,
      ownerConnected: false,
    }),
    signature = "";
  const listeners = new Set();
  return Object.freeze({
    get: () => current,
    update(input) {
      const next = selectIdentityContext(input),
        key = JSON.stringify(next);
      if (key !== signature) {
        current = next;
        signature = key;
        for (const listener of listeners) listener(current);
      }
      return current;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}
export const selectedContext = createSelectedContext();
if (typeof window !== "undefined") window.__animaSelection = selectedContext;
