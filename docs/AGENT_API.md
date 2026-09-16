> **Historical research architecture.** This document is retained for context, not as evidence that every described component was tested or deployed. Read [the current release](../README.md), [1.2 changes](PROTOCOL-CHANGES-1.2.md), and [recorded validation](../reports/VALIDATION.md).

# Agent API

Run:

```bash
npm run agent
```

Default base URL: `http://127.0.0.1:8787`.

## Agent card

```http
GET /.well-known/agent-card.json
```

Advertises inspect, plan-evolution, and constitution-compilation skills.

## Health

```http
GET /health
```

## MCP-style JSON-RPC

Initialize:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {}
}
```

List tools:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

Plan evolution:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "organism.plan_evolution",
    "arguments": {
      "account": "0x...",
      "collection": "0x...",
      "chainId": 1,
      "tokenId": 1,
      "nonce": 12,
      "evolutions": 4,
      "priorStateRoot": "0x...",
      "oldGenome": "0x...",
      "memoryRoot": "0x...",
      "auditRoot": "0x...",
      "policyHash": "0x...",
      "verifierId": 1,
      "request": "evolve toward lower execution cost without losing lineage"
    }
  }
}
```

## Direct intent endpoint

```http
POST /intent
Content-Type: application/json
```

The body uses the same fields as `organism.plan_evolution`. The response contains:

- ABI-ready `Intent` fields;
- encoded `commitEvolution` calldata;
- exact Solidity statement hash;
- evidence explanation;
- optional threshold signature and ABI proof.

To include a local threshold proof, configure:

```bash
export ATTESTER_PRIVATE_KEY="0x..."
```

and include the threshold verifier address as `verifier` in the request. The key must correspond to an authorized signer in `ThresholdAttestationVerifier`.

## Security

The API does not submit transactions and does not treat natural-language reasoning as proof. The deterministic planner output is merely the input to the selected verifier system. Validate every field against fresh chain state before proving or relaying.
