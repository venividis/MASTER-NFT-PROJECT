import http from "node:http";
import {
  AbiCoder,
  Wallet,
  getBytes,
  solidityPackedKeccak256,
} from "ethers";
import { buildEvolutionPlan, hashConstitution } from "./policy-engine.mjs";

const port = Number(process.env.AGENT_PORT ?? 8787);
const coder = AbiCoder.defaultAbiCoder();

export const agentCard = {
  name: "i dont fucking believe it! sovereign organism",
  description: "Plans policy-bounded NFT actions and emits proof-ready deterministic intents.",
  protocolVersion: "0.3.0",
  capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: true },
  skills: [
    { id: "inspect", name: "Inspect organism", description: "Explain roots, mode, authority, and pending constraints." },
    { id: "plan-evolution", name: "Plan evolution", description: "Build an ABI-ready, replay-protected evolution intent." },
    { id: "constitution", name: "Compile constitution", description: "Canonicalize a policy and return its immutable hash." },
  ],
  interfaces: {
    mcp: "/mcp",
    a2a: "/.well-known/agent-card.json",
    intent: "/intent",
  },
};

export async function handleMcp(payload) {
  const id = payload?.id ?? null;
  const method = payload?.method;
  if (method === "initialize") {
    return { jsonrpc: "2.0", id, result: { protocolVersion: "2025-06-18", serverInfo: { name: agentCard.name, version: "1.0.0" }, capabilities: { tools: {} } } };
  }
  if (method === "tools/list") {
    return {
      jsonrpc: "2.0", id,
      result: {
        tools: [
          { name: "organism.plan_evolution", description: "Create a deterministic, proof-ready evolution intent.", inputSchema: { type: "object", additionalProperties: true } },
          { name: "organism.compile_constitution", description: "Hash a canonical policy document.", inputSchema: { type: "object", properties: { policy: { type: "object" } }, required: ["policy"] } },
          { name: "organism.inspect", description: "Summarize supplied organism state without changing it.", inputSchema: { type: "object", additionalProperties: true } },
        ],
      },
    };
  }
  if (method === "tools/call") {
    const name = payload?.params?.name;
    const args = payload?.params?.arguments ?? {};
    let value;
    if (name === "organism.plan_evolution") value = buildEvolutionPlan(args);
    else if (name === "organism.compile_constitution") value = { constitutionHash: hashConstitution(args.policy), canonicalPolicy: args.policy };
    else if (name === "organism.inspect") value = { mode: args.sovereign ? "SOVEREIGN" : "BOUND", authority: args.sovereign ? "proof-only" : "owner + scoped sessions", stateRoot: args.stateRoot, auditRoot: args.auditRoot, nonce: args.nonce };
    else throw new Error(`unknown tool: ${name}`);
    return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v) }] } };
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } };
}

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(body, (_, value) => typeof value === "bigint" ? value.toString() : value));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("request too large");
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

export function createServer() {
  return http.createServer(async (request, response) => {
    try {
      if (request.method === "OPTIONS") return json(response, 204, {});
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (request.method === "GET" && url.pathname === "/.well-known/agent-card.json") return json(response, 200, agentCard);
      if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { ok: true, name: agentCard.name });
      if (request.method === "POST" && url.pathname === "/mcp") return json(response, 200, await handleMcp(await readBody(request)));
      if (request.method === "POST" && url.pathname === "/intent") {
        const input = await readBody(request);
        const plan = buildEvolutionPlan(input);
        let attestation = null;
        // Signing requires an authenticated, chain-backed attester. Caller-supplied plans
        // are never sufficient authorization for using a configured private key.
        return json(response, 200, { ...plan, attestation, scope: "unsigned-local-proposal" });
      }
      return json(response, 404, { error: "not found" });
    } catch (error) {
      return json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  createServer().listen(port, "127.0.0.1", () => {
    console.log(`Sovereign agent online at http://127.0.0.1:${port}`);
  });
}
