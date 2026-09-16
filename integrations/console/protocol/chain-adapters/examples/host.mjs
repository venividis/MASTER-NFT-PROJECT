import { createHostBridge } from "../bridge/message-channel.mjs";

/**
 * Application integration example. readInventory and prepareMove are injected real
 * application handlers; no made-up balances or fake transaction hashes returned.
 * The prepared intent still requires the host's wallet review/signing workflow.
 */
export function attachGame({ iframe, cartridgeOrigin, readInventory, prepareMove }) {
  const bridge = createHostBridge({
    iframe,
    expectedOrigin: cartridgeOrigin,
    handlers: {
      "inventory.read": (params, context) => readInventory(params, context),
      "game.action.prepare": (params, context) => {
        if (params?.action !== "move" || !["north", "south", "east", "west"].includes(params.direction)) throw new Error("Unknown move");
        return prepareMove(params.direction, context);
      }
    }
  });
  // The bridge also starts a fresh handshake on future iframe load events.
  bridge.start();
  return bridge;
}
