import { RailgunRuntime, publicError } from "./runtime.mjs";
let eventSequence = 0;
const persistence = new Map();
const runtime = new RailgunRuntime((event) => {
  if (event.type !== "submission") {
    postMessage({ event });
    return;
  }
  const eventId = ++eventSequence;
  return new Promise((resolve, reject) => {
    persistence.set(eventId, { resolve, reject });
    postMessage({ event, eventId });
  });
});
const allowed = new Set([
  "initialize",
  "prepare",
  "prove",
  "send",
  "balance",
  "balanceView",
  "inspect",
  "recover",
  "shield",
  "stop",
]);
let busy = false;
self.onmessage = async ({ data }) => {
  if (data?.persistenceAck) {
    const pending = persistence.get(data.eventId);
    if (pending) {
      persistence.delete(data.eventId);
      data.ok
        ? pending.resolve()
        : pending.reject(Error("Encrypted submission persistence failed."));
    }
    return;
  }
  if (!data || typeof data.id !== "number") return;
  if (data.method === "invalidate") {
    runtime.invalidate();
    postMessage({ id: data.id, result: true });
    return;
  }
  if (!allowed.has(data.method) || busy) {
    postMessage({
      id: data.id,
      error:
        "The privacy wallet is busy. Wait for the current operation or lock it.",
    });
    return;
  }
  busy = true;
  try {
    postMessage({
      id: data.id,
      result: await runtime[data.method](data.params),
    });
  } catch (error) {
    postMessage({ id: data.id, error: publicError(error, data.method) });
  } finally {
    busy = false;
  }
};

postMessage({ ready: true });
