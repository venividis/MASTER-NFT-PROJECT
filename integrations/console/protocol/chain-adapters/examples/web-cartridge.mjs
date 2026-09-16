import { connectCartridge } from "../bridge/message-channel.mjs";

// Configure this from the published cartridge installation, not from an incoming message.
const hostOrigin = "https://awe.example";
const awe = await connectCartridge({ expectedParentOrigin: hostOrigin });

// Custom game methods are possible; the owner chooses which handlers to grant.
if (awe.methods.includes("inventory.read")) {
  const inventory = await awe.request("inventory.read", { page: 0 });
  document.querySelector("#inventory").textContent = JSON.stringify(inventory);
}

export async function prepareMove(direction) {
  return awe.request("game.action.prepare", { action: "move", direction });
}
