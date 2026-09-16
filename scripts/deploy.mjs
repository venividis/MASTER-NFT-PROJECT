import process from "node:process";
import { JsonRpcProvider, Wallet } from "ethers";
import { deployStack, deploymentRecord, writeDeployment } from "./lib/deploy-stack.mjs";

const rpcUrl = process.env.RPC_URL;
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!rpcUrl || !privateKey) {
  console.error("RPC_URL and DEPLOYER_PRIVATE_KEY are required.");
  process.exit(2);
}

const provider = new JsonRpcProvider(rpcUrl);
// Research release: refuse public-value networks before any deployment transaction.
const network = await provider.getNetwork();
if (![31337n, 11155111n, 84532n].includes(network.chainId)) {
  throw new Error("Research deployment is restricted to local 31337, Sepolia, or Base Sepolia. No transaction was sent.");
}
const signer = new Wallet(privateKey, provider);
const attesterAddress = process.env.ATTESTER_ADDRESS ?? signer.address;
const royaltyReceiver = process.env.ROYALTY_RECEIVER ?? signer.address;
const royaltyBps = Number(process.env.ROYALTY_BPS ?? 500);

console.log(`Deploying from ${signer.address}…`);
const stack = await deployStack({ signer, attesterAddress, royaltyReceiver, royaltyBps });

if (process.env.FREEZE_TRUST_ROOTS === "true") {
  await (await stack.verifier.freeze()).wait();
  await (await stack.router.freeze()).wait();
  console.log("Verifier signer set and router mapping frozen permanently.");
}

const record = await deploymentRecord(stack, provider, {
  attesterAddress,
  trustRootsFrozen: process.env.FREEZE_TRUST_ROOTS === "true",
});
writeDeployment(record);
console.log(JSON.stringify(record, null, 2));
