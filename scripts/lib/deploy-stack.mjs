import fs from "node:fs";
import path from "node:path";
import { ContractFactory } from "ethers";

const root = path.resolve(import.meta.dirname, "../..");

export function loadArtifact(name) {
  return JSON.parse(fs.readFileSync(path.join(root, "contracts", "artifacts", `${name}.json`), "utf8"));
}

export async function deployContract(name, signer, args = []) {
  const artifact = loadArtifact(name);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

export async function deployStack({ signer, attesterAddress, royaltyReceiver, royaltyBps = 500 }) {
  const admin = await signer.getAddress();
  const router = await deployContract("ProofRouter", signer, [admin]);
  const verifier = await deployContract("ThresholdAttestationVerifier", signer, [admin, 1]);
  await (await verifier.setSigner(attesterAddress, true)).wait();
  await (await router.setVerifier(1, await verifier.getAddress())).wait();

  const renderer = await deployContract("OnchainRenderer", signer);
  const witnessRegistry = await deployContract("OmnichainWitnessRegistry", signer, [admin]);
  const collection = await deployContract("IDontFuckingBelieveIt", signer, [
    admin,
    await renderer.getAddress(),
    await router.getAddress(),
    await witnessRegistry.getAddress(),
    royaltyReceiver ?? admin,
    royaltyBps,
  ]);
  const accountFactory = await deployContract("SovereignAccountFactory", signer, [
    await collection.getAddress(),
    await router.getAddress(),
  ]);
  await (await collection.setAccountFactory(await accountFactory.getAddress())).wait();

  return { router, verifier, renderer, witnessRegistry, collection, accountFactory };
}

export async function deploymentRecord(stack, provider, extra = {}) {
  const network = await provider.getNetwork();
  return {
    title: "i dont fucking believe it!",
    chainId: network.chainId.toString(),
    generatedAt: new Date().toISOString(),
    collection: await stack.collection.getAddress(),
    accountFactory: await stack.accountFactory.getAddress(),
    proofRouter: await stack.router.getAddress(),
    thresholdVerifier: await stack.verifier.getAddress(),
    witnessRegistry: await stack.witnessRegistry.getAddress(),
    renderer: await stack.renderer.getAddress(),
    ...extra,
  };
}

export function writeDeployment(record) {
  const deploymentDir = path.join(root, "deployments");
  fs.mkdirSync(deploymentDir, { recursive: true });
  fs.writeFileSync(path.join(deploymentDir, `${record.chainId}.json`), `${JSON.stringify(record, null, 2)}\n`);
  fs.writeFileSync(path.join(root, "web", "deployment.json"), `${JSON.stringify(record, null, 2)}\n`);
}
