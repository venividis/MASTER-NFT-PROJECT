import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ganache from "ganache";
import { AbiCoder, BrowserProvider, ContractFactory, getBytes, keccak256, toUtf8Bytes } from "ethers";

const root = path.resolve(import.meta.dirname, "..");
const coder = AbiCoder.defaultAbiCoder();
const load = (name) => JSON.parse(fs.readFileSync(path.join(root, "contracts", "artifacts", `${name}.json`), "utf8"));

async function deploy(name, signer, args = []) {
  const artifact = load(name);
  const instance = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy(...args);
  await instance.waitForDeployment();
  return instance;
}

test("SP1 and RISC Zero adapters bind proof receipts to the exact action statement", async () => {
  const raw = ganache.provider({ logging: { quiet: true }, chain: { chainId: 1338, hardfork: "shanghai" } });
  const provider = new BrowserProvider(raw);
  const signer = await provider.getSigner(0);
  const statement = keccak256(toUtf8Bytes("proof-carrying action"));
  const vkey = keccak256(toUtf8Bytes("sp1-program-vkey"));
  const imageId = keccak256(toUtf8Bytes("risc-zero-image-id"));
  const sp1Bytes = getBytes("0x1234567890");
  const seal = getBytes("0xaabbccdd");

  const sp1Gateway = await deploy("MockSP1Gateway", signer, [vkey, keccak256(sp1Bytes)]);
  const r0Gateway = await deploy("MockRiscZeroVerifier", signer, [imageId, keccak256(seal)]);
  const sp1 = await deploy("SP1ActionVerifier", signer, [await sp1Gateway.getAddress(), vkey]);
  const r0 = await deploy("RiscZeroActionVerifier", signer, [await r0Gateway.getAddress(), imageId]);

  const sp1Proof = coder.encode(["bytes", "bytes"], [statement, sp1Bytes]);
  const r0Proof = coder.encode(["bytes", "bytes"], [seal, statement]);
  assert.equal(await sp1.verify(statement, sp1Proof), true);
  assert.equal(await r0.verify(statement, r0Proof), true);
  assert.equal(await sp1.verify(keccak256(toUtf8Bytes("different")), sp1Proof), false);

  const composite = await deploy("CompositeActionVerifier", signer, [[await sp1.getAddress(), await r0.getAddress()], 2]);
  const hybridProof = coder.encode(["bytes[]"], [[sp1Proof, r0Proof]]);
  assert.equal(await composite.verify(statement, hybridProof), true);

  const badSp1Proof = coder.encode(["bytes", "bytes"], [statement, "0x00"]);
  const oneBad = coder.encode(["bytes[]"], [[badSp1Proof, r0Proof]]);
  assert.equal(await composite.verify(statement, oneBad), false);
  await raw.disconnect();
});
