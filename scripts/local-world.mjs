import ganache from "ganache";
import {
  BrowserProvider,
  HDNodeWallet,
  keccak256,
  parseEther,
  toUtf8Bytes,
} from "ethers";
import { createServer as createAgentServer } from "../agent/server.mjs";
import { createStaticServer } from "./serve.mjs";
import { deployStack, deploymentRecord, writeDeployment } from "./lib/deploy-stack.mjs";

const mnemonic = "test test test test test test test test test test test junk";
const chainPort = Number(process.env.CHAIN_PORT ?? 8545);
const webPort = Number(process.env.PORT ?? 4173);
const agentPort = Number(process.env.AGENT_PORT ?? 8787);

const chain = ganache.server({
  logging: { quiet: true },
  wallet: { mnemonic, totalAccounts: 10, defaultBalance: 10_000 },
  chain: { chainId: 31337, hardfork: "shanghai" },
  miner: { blockGasLimit: 30_000_000 },
});
await chain.listen(chainPort, "127.0.0.1");

const provider = new BrowserProvider(chain.provider);
const admin = await provider.getSigner(0);
const holder = await provider.getSigner(1);
const attester = await provider.getSigner(2);
const stack = await deployStack({
  signer: admin,
  attesterAddress: await attester.getAddress(),
  royaltyReceiver: await admin.getAddress(),
});

const secret = keccak256(toUtf8Bytes("local impossible genesis"));
const commitment = await stack.collection.commitmentFor(await holder.getAddress(), secret, await holder.getAddress());
await (await stack.collection.connect(holder).commitAwakening(commitment, { value: parseEther("25") })).wait();
await provider.send("evm_mine", []);
await provider.send("evm_mine", []);
const reveal = await (await stack.collection.connect(holder).revealAwakening(secret, await holder.getAddress())).wait();
let tokenId;
let account;
for (const log of reveal.logs) {
  try {
    const event = stack.collection.interface.parseLog(log);
    if (event?.name === "Awakened") {
      tokenId = event.args.tokenId;
      account = event.args.account;
    }
  } catch { /* another contract's log */ }
}
if (!account) throw new Error("Awakened event was not emitted");
await (await stack.collection.connect(holder).setContext(tokenId, "A local sovereign organism waiting for a constitution.")).wait();
await (await stack.collection.connect(holder).setEndpoint(tokenId, "mcp", `http://127.0.0.1:${agentPort}/mcp`)).wait();
await (await stack.collection.connect(holder).setEndpoint(tokenId, "a2a", `http://127.0.0.1:${agentPort}/.well-known/agent-card.json`)).wait();

const record = await deploymentRecord(stack, provider, {
  tokenId: tokenId.toString(),
  account,
  holder: await holder.getAddress(),
  localRpc: `http://127.0.0.1:${chainPort}`,
  verifierId: 1,
});
writeDeployment(record);

// The local agent can produce valid threshold proofs for verifier id 1.
process.env.ATTESTER_PRIVATE_KEY = HDNodeWallet.fromPhrase(
  mnemonic,
  undefined,
  "m/44'/60'/0'/0/2",
).privateKey;
const agent = createAgentServer();
await new Promise((resolve) => agent.listen(agentPort, "127.0.0.1", resolve));
const web = createStaticServer();
await new Promise((resolve) => web.listen(webPort, "127.0.0.1", resolve));

console.log("\nTHE LOCAL WORLD IS ALIVE\n");
console.log(`Interface:  http://127.0.0.1:${webPort}`);
console.log(`Agent:      http://127.0.0.1:${agentPort}/.well-known/agent-card.json`);
console.log(`RPC:        http://127.0.0.1:${chainPort} (chain 31337)`);
console.log(`Collection: ${record.collection}`);
console.log(`Token:      #${record.tokenId}`);
console.log(`Account:    ${record.account}`);
console.log("\nLocal mnemonic (development only):");
console.log(mnemonic);
console.log("\nPress Ctrl+C to collapse the local world.\n");

const shutdown = async () => {
  await Promise.all([
    new Promise((resolve) => web.close(resolve)),
    new Promise((resolve) => agent.close(resolve)),
    chain.close(),
  ]);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
