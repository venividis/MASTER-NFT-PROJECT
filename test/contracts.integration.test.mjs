import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ganache from "ganache";
import {
  AbiCoder,
  BrowserProvider,
  Contract,
  ContractFactory,
  Interface,
  Wallet,
  ZeroHash,
  ZeroAddress,
  getBytes,
  keccak256,
  parseEther,
  solidityPackedKeccak256,
  toUtf8Bytes,
} from "ethers";
import { intentStatement as jsIntentStatement } from "../agent/policy-engine.mjs";

const root = path.resolve(import.meta.dirname, "..");
const artifactDir = path.join(root, "contracts", "artifacts");
const coder = AbiCoder.defaultAbiCoder();

function artifact(name) {
  return JSON.parse(
    fs.readFileSync(path.join(artifactDir, `${name}.json`), "utf8"),
  );
}

async function deploy(name, signer, args = []) {
  const compiled = artifact(name);
  const factory = new ContractFactory(compiled.abi, compiled.bytecode, signer);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function expectRevert(
  action,
  message = "expected transaction to revert",
) {
  await assert.rejects(
    async () => {
      const result = await action();
      if (result?.wait) await result.wait();
    },
    undefined,
    message,
  );
}

function parseEvent(receipt, contract, eventName) {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === eventName) return parsed;
    } catch {
      // A receipt can contain logs from multiple contracts.
    }
  }
  throw new Error(`event ${eventName} not found`);
}

async function attestedProof(verifier, attester, statement) {
  const digest = await verifier.attestationDigest(statement);
  const signature = await attester.signMessage(getBytes(digest));
  return coder.encode(["bytes[]"], [[signature]]);
}

async function executeVerified({
  account,
  verifier,
  attester,
  relayer,
  intent,
  data,
}) {
  const statement = await account.intentStatement(intent);
  const localStatement = jsIntentStatement(
    await account.getAddress(),
    1337n,
    intent,
  );
  assert.equal(
    localStatement,
    statement,
    "agent and Solidity intent hashes must match",
  );
  const proof = await attestedProof(verifier, attester, statement);
  const gas = await account
    .connect(relayer)
    .executeVerified.estimateGas(intent, data, proof);
  const transaction = await account
    .connect(relayer)
    .executeVerified(intent, data, proof, { gasLimit: (gas * 120n) / 100n });
  return transaction.wait();
}

test("the organism awakens, evolves, becomes sovereign, and carries authority with itself", async () => {
  const eip1193 = ganache.provider({
    logging: { quiet: true },
    wallet: { totalAccounts: 8, defaultBalance: 1_000 },
    chain: { chainId: 1337, hardfork: "shanghai" },
    miner: { blockGasLimit: 30_000_000 },
  });
  const provider = new BrowserProvider(eip1193, undefined, {
    cacheTimeout: -1,
  });
  provider.pollingInterval = 10;
  const admin = await provider.getSigner(0);
  const holder = await provider.getSigner(1);
  const attester = new Wallet(
    Object.values(eip1193.getInitialAccounts())[2].secretKey,
    provider,
  );
  const relayer = await provider.getSigner(3);
  const sessionKey = await provider.getSigner(4);
  const nextHolder = await provider.getSigner(5);
  const childHolder = await provider.getSigner(6);

  const router = await deploy("ProofRouter", admin, [await admin.getAddress()]);
  const verifier = await deploy("ThresholdAttestationVerifier", admin, [
    await admin.getAddress(),
    1,
  ]);
  await (await verifier.setSigner(await attester.getAddress(), true)).wait();
  await (await router.setVerifier(1, await verifier.getAddress())).wait();

  const renderer = await deploy("OnchainRenderer", admin);
  const witnesses = await deploy("OmnichainWitnessRegistry", admin, [
    await admin.getAddress(),
  ]);
  const collection = await deploy("IDontFuckingBelieveIt", admin, [
    await admin.getAddress(),
    await renderer.getAddress(),
    await router.getAddress(),
    await witnesses.getAddress(),
    await admin.getAddress(),
    500,
  ]);
  const factory = await deploy("SovereignAccountFactory", admin, [
    await collection.getAddress(),
    await router.getAddress(),
  ]);
  await (await collection.setAccountFactory(await factory.getAddress())).wait();
  const target = await deploy("MockTarget", admin);

  const secret = keccak256(
    toUtf8Bytes("there is no spoon; there is only state"),
  );
  const commitment = await collection.commitmentFor(
    await holder.getAddress(),
    secret,
    await holder.getAddress(),
  );
  const endowment = parseEther("1.25");
  await (
    await collection
      .connect(holder)
      .commitAwakening(commitment, { value: endowment })
  ).wait();
  await provider.send("evm_mine", []);
  await provider.send("evm_mine", []);

  const revealReceipt = await (
    await collection
      .connect(holder)
      .revealAwakening(secret, await holder.getAddress())
  ).wait();
  const awakened = parseEvent(revealReceipt, collection, "Awakened");
  const tokenId = awakened.args.tokenId;
  const accountAddress = awakened.args.account;
  const account = new Contract(
    accountAddress,
    artifact("SovereignAccount").abi,
    holder,
  );

  assert.equal(tokenId, 1n);
  assert.equal(await collection.ownerOf(tokenId), await holder.getAddress());
  assert.equal(await collection.accountOf(tokenId), accountAddress);
  assert.equal(await factory.predictAccount(tokenId), accountAddress);
  assert.equal(await provider.getBalance(accountAddress), endowment);
  assert.notEqual(await account.stateRoot(), ZeroHash);
  assert.notEqual(await account.auditRoot(), ZeroHash);

  // Human-guided execution while bound.
  const setSeven = target.interface.encodeFunctionData("setValue", [7]);
  await (
    await account
      .connect(holder)
      .execute(await target.getAddress(), 0, setSeven)
  ).wait();
  assert.equal(await target.value(), 7n);
  assert.equal(await target.lastCaller(), accountAddress);

  // v1.2: Bound evolution now advances account roots before collection validation.
  const boundGenome = keccak256(toUtf8Bytes("bound-genome-v1.2"));
  const boundMemory = keccak256(toUtf8Bytes("bound-memory-v1.2"));
  const boundEvidence = keccak256(toUtf8Bytes("bound-evidence-v1.2"));
  const boundNonce = await account.actionNonce();
  const expectedBoundRoot = await collection.deriveEvolutionStateRoot(
    tokenId,
    boundGenome,
    boundMemory,
    boundEvidence,
  );
  await expectRevert(() =>
    account
      .connect(relayer)
      .evolveBound(boundNonce, boundGenome, boundMemory, boundEvidence),
  );
  await (
    await account
      .connect(holder)
      .evolveBound(boundNonce, boundGenome, boundMemory, boundEvidence)
  ).wait();
  assert.equal(await account.stateRoot(), expectedBoundRoot);
  assert.equal(await account.memoryRoot(), boundMemory);
  assert.equal((await collection.organismOf(tokenId)).genome, boundGenome);
  await expectRevert(() =>
    account
      .connect(holder)
      .evolveBound(boundNonce, boundGenome, boundMemory, boundEvidence),
  );
  const rollbackNonce = await account.actionNonce();
  const rollbackAudit = await account.auditRoot();
  await expectRevert(() =>
    account
      .connect(holder)
      .evolveBound(rollbackNonce, boundGenome, boundMemory, boundEvidence),
  );
  assert.equal(
    await account.actionNonce(),
    rollbackNonce,
    "collection rejection rolls back nonce",
  );
  assert.equal(
    await account.auditRoot(),
    rollbackAudit,
    "collection rejection rolls back audit",
  );

  // Exact delegated authority never follows a custody transfer, including a return sale.
  const beforeTransferEpoch = await account.sessionEpoch(),
    expires = (await provider.getBlock("latest")).timestamp + 3600;
  await (
    await account
      .connect(holder)
      .grantAction(
        await sessionKey.getAddress(),
        target.target,
        ZeroAddress,
        keccak256(setSeven),
        1,
        1,
        0,
        expires,
        10,
      )
  ).wait();
  await expectRevert(() =>
    account.connect(relayer).invalidateSessionsOnTransfer(),
  );
  await (
    await collection
      .connect(holder)
      .transferFrom(
        await holder.getAddress(),
        await nextHolder.getAddress(),
        tokenId,
      )
  ).wait();
  assert.equal(await account.sessionEpoch(), beforeTransferEpoch + 1n);
  await expectRevert(async () =>
    account
      .connect(sessionKey)
      .executeInstrument(1, await account.actionNonce(), setSeven),
  );
  await (
    await collection
      .connect(nextHolder)
      .transferFrom(
        await nextHolder.getAddress(),
        await holder.getAddress(),
        tokenId,
      )
  ).wait();
  await expectRevert(async () =>
    account
      .connect(sessionKey)
      .executeInstrument(1, await account.actionNonce(), setSeven),
  );
  assert.equal(await account.sessionEpoch(), beforeTransferEpoch + 2n);
  const setEight = target.interface.encodeFunctionData("setValue", [8]);
  await (
    await account
      .connect(holder)
      .grantAction(
        await sessionKey.getAddress(),
        target.target,
        ZeroAddress,
        keccak256(setEight),
        1,
        1,
        0,
        expires,
        1,
      )
  ).wait();
  assert.equal(
    await account.isValidSigner(await holder.getAddress(), "0x"),
    "0x523e3260",
  );
  assert.equal(
    await account.isValidSigner(await sessionKey.getAddress(), "0x"),
    "0x00000000",
  );
  await expectRevert(async () =>
    account
      .connect(sessionKey)
      .executeInstrument(2, await account.actionNonce(), setSeven),
  );
  await (
    await account
      .connect(sessionKey)
      .executeInstrument(2, await account.actionNonce(), setEight)
  ).wait();
  assert.equal(await target.value(), 8n);
  await expectRevert(async () =>
    account
      .connect(sessionKey)
      .executeInstrument(2, await account.actionNonce(), setEight),
  );
  await expectRevert(() =>
    account
      .connect(holder)
      .createSession(
        sessionKey.address,
        target.target,
        setEight.slice(0, 10),
        0,
        0,
        expires,
        1,
      ),
  );
  // Exact delegation cannot complete after changing custody during its own call.
  await (
    await collection.connect(holder).approve(accountAddress, tokenId)
  ).wait();
  const transferBySession = collection.interface.encodeFunctionData(
    "transferFrom",
    [await holder.getAddress(), await nextHolder.getAddress(), tokenId],
  );
  await (
    await account
      .connect(holder)
      .grantAction(
        await sessionKey.getAddress(),
        collection.target,
        ZeroAddress,
        keccak256(transferBySession),
        1,
        1,
        0,
        expires,
        1,
      )
  ).wait();
  const sessionTransferEpoch = await account.sessionEpoch();
  await expectRevert(async () =>
    account
      .connect(sessionKey)
      .executeInstrument(3, await account.actionNonce(), transferBySession),
  );
  assert.equal(await collection.ownerOf(tokenId), await holder.getAddress());
  assert.equal(
    await account.sessionEpoch(),
    sessionTransferEpoch,
    "rejected callback rolls back custody epoch",
  );

  // The account can reproduce. Descendants get their own CREATE2 account and lineage.
  const spawnData = collection.interface.encodeFunctionData(
    "spawnFromAccount",
    [
      tokenId,
      await childHolder.getAddress(),
      keccak256(toUtf8Bytes("first impossible descendant")),
    ],
  );
  const spawnReceipt = await (
    await account
      .connect(holder)
      .execute(await collection.getAddress(), 0, spawnData)
  ).wait();
  const descendant = parseEvent(spawnReceipt, collection, "DescendantSpawned");
  const childId = descendant.args.childId;
  assert.equal(childId, 2n);
  const child = await collection.organismOf(childId);
  assert.equal(child.parentId, tokenId);
  assert.equal(child.generation, 1n);
  assert.equal(
    await collection.ownerOf(childId),
    await childHolder.getAddress(),
  );
  assert.equal(
    await collection.accountOf(childId),
    await factory.predictAccount(childId),
  );

  // Selected-registry identity requires live agent-token ownership.
  const registry = await deploy("AgentIdentityRegistryMock", admin),
    bindingHash = keccak256(toUtf8Bytes("reviewed agent role"));
  await expectRevert(() =>
    collection
      .connect(holder)
      .bindERC8004(tokenId, target.target, 42, bindingHash),
  );
  await (await registry.setOwner(42, await holder.getAddress())).wait();
  await (
    await collection
      .connect(holder)
      .bindERC8004(tokenId, registry.target, 42, bindingHash)
  ).wait();
  await expectRevert(() =>
    collection
      .connect(holder)
      .bindERC8004(tokenId, registry.target, 43, bindingHash),
  );
  assert.equal((await collection.agentBindingStatus(tokenId)).verified, true);
  const agentIdBytes = await collection.metadata(tokenId, "agent.id");
  assert.equal(coder.decode(["uint256"], agentIdBytes)[0], 42n);

  await (
    await collection
      .connect(holder)
      .setContext(
        tokenId,
        "A sovereign world-model that can explain every mutation.",
      )
  ).wait();
  assert.match(
    Buffer.from(
      (await collection.metadata(tokenId, "context")).slice(2),
      "hex",
    ).toString(),
    /sovereign world-model/,
  );

  // Ascension is irreversible: sessions, owner execution, direct metadata mutation, and direct transfers stop working.
  const constitution = keccak256(
    toUtf8Bytes("constitution:v1:no-hidden-value:no-unproved-transition"),
  );
  const preAscensionAudit = await account.auditRoot();
  // An unknown verifier's frozen() claim cannot authorize irreversible promotion.
  const pretender = await deploy("FrozenVerifierPretender", admin);
  await (await router.setVerifier(2, pretender.target)).wait();
  await (await account.configureSovereignVerifier(2)).wait();
  assert.equal(await account.sovereignAuthorityReady(), false);
  await expectRevert(() =>
    collection
      .connect(holder)
      .ascend(tokenId, constitution, parseEther("2"), 0),
  );
  await (await account.connect(holder).configureSovereignVerifier(1)).wait();
  assert.equal(await account.sovereignAuthorityReady(), false);
  await expectRevert(() =>
    collection
      .connect(holder)
      .ascend(tokenId, constitution, parseEther("2"), 0),
  );
  await (await router.freeze()).wait();
  assert.equal(
    await account.sovereignAuthorityReady(),
    false,
    "frozen routing does not freeze mutable signers",
  );
  await expectRevert(() =>
    collection
      .connect(holder)
      .ascend(tokenId, constitution, parseEther("2"), 0),
  );
  await (await verifier.freeze()).wait();
  await expectRevert(() => verifier.freeze());
  await expectRevert(() => verifier.setThreshold(1));
  assert.equal(await account.sovereignAuthorityReady(), true);
  await (await account.configureSovereignVerifier(2)).wait();
  assert.equal(
    await account.sovereignAuthorityReady(),
    false,
    "unknown frozen-looking bytecode remains unsupported",
  );
  await expectRevert(() =>
    collection
      .connect(holder)
      .ascend(tokenId, constitution, parseEther("2"), 0),
  );
  await (await account.configureSovereignVerifier(1)).wait();
  await (
    await collection
      .connect(holder)
      .ascend(tokenId, constitution, parseEther("2"), 0)
  ).wait();
  assert.equal(await account.mode(), 1n);
  assert.equal((await collection.organismOf(tokenId)).sovereign, true);
  assert.notEqual(await account.auditRoot(), preAscensionAudit);
  await expectRevert(async () =>
    account.connect(holder).execute(await target.getAddress(), 0, setSeven),
  );
  await expectRevert(async () =>
    account
      .connect(sessionKey)
      .executeSession(await target.getAddress(), 0, setEight),
  );
  await expectRevert(() =>
    collection
      .connect(holder)
      .setContext(tokenId, "owner tries to overwrite the mind"),
  );
  await expectRevert(async () =>
    collection
      .connect(holder)
      .transferFrom(
        await holder.getAddress(),
        await nextHolder.getAddress(),
        tokenId,
      ),
  );

  await expectRevert(() =>
    account
      .connect(holder)
      .evolveBound(boundNonce, boundGenome, boundMemory, boundEvidence),
  );

  // A proof-authorized transition updates account state and the NFT genome atomically.
  const oldOrganism = await collection.organismOf(tokenId);
  const nextGenome = keccak256(
    toUtf8Bytes("genome:the machine dreamed of its verifier"),
  );
  const nextMemory = keccak256(
    toUtf8Bytes("sealed-memory:ciphertext-root:001"),
  );
  const evolutionEvidence = keccak256(
    toUtf8Bytes("zkvm-receipt-or-tee-attestation:001"),
  );
  const nextState = await collection.deriveEvolutionStateRoot(
    tokenId,
    nextGenome,
    nextMemory,
    evolutionEvidence,
  );
  const evolutionData = collection.interface.encodeFunctionData(
    "commitEvolution",
    [tokenId, nextGenome, nextMemory, evolutionEvidence],
  );
  const now = (await provider.getBlock("latest")).timestamp;
  const evolutionIntent = {
    target: await collection.getAddress(),
    value: 0n,
    dataHash: keccak256(evolutionData),
    nonce: await account.actionNonce(),
    validAfter: BigInt(now - 1),
    validUntil: BigInt(now + 3_600),
    priorStateRoot: await account.stateRoot(),
    nextStateRoot: nextState,
    nextMemoryRoot: nextMemory,
    policyHash: constitution,
    evidenceHash: evolutionEvidence,
    verifierId: 1,
  };
  const oldAudit = await account.auditRoot();
  await executeVerified({
    account,
    verifier,
    attester,
    relayer,
    intent: evolutionIntent,
    data: evolutionData,
  });
  const evolved = await collection.organismOf(tokenId);
  assert.equal(evolved.genome, nextGenome);
  assert.equal(evolved.memoryRoot, nextMemory);
  assert.equal(evolved.evolutions, oldOrganism.evolutions + 1n);
  assert.equal(await account.stateRoot(), nextState);
  assert.equal(await account.memoryRoot(), nextMemory);
  assert.notEqual(await account.auditRoot(), oldAudit);
  await expectRevert(() =>
    executeVerified({
      account,
      verifier,
      attester,
      relayer,
      intent: evolutionIntent,
      data: evolutionData,
    }),
  );

  // Post-sovereignty metadata writes are possible only as verified actions through the account.
  const endpointValue = Buffer.from("http://127.0.0.1:8787/mcp", "utf8");
  const metadataData = collection.interface.encodeFunctionData("setMetadata", [
    tokenId,
    "endpoint[mcp]",
    `0x${endpointValue.toString("hex")}`,
  ]);
  const metadataEvidence = keccak256(
    toUtf8Bytes("endpoint-change-reviewed-by-policy"),
  );
  const metadataIntent = {
    target: await collection.getAddress(),
    value: 0n,
    dataHash: keccak256(metadataData),
    nonce: await account.actionNonce(),
    validAfter: BigInt(now - 1),
    validUntil: BigInt(now + 3_600),
    priorStateRoot: await account.stateRoot(),
    nextStateRoot: await account.stateRoot(),
    nextMemoryRoot: keccak256(toUtf8Bytes("non-evolution-memory-update")),
    policyHash: constitution,
    evidenceHash: metadataEvidence,
    verifierId: 1,
  };
  await executeVerified({
    account,
    verifier,
    attester,
    relayer,
    intent: metadataIntent,
    data: metadataData,
  });
  const endpoint = Buffer.from(
    (await collection.metadata(tokenId, "endpoint[mcp]")).slice(2),
    "hex",
  ).toString();
  assert.equal(endpoint, "http://127.0.0.1:8787/mcp");
  assert.equal(await account.memoryRoot(), metadataIntent.nextMemoryRoot);
  assert.equal(
    await collection.metadata(tokenId, "core.memoryRoot"),
    metadataIntent.nextMemoryRoot,
    "metadata follows a non-evolution account root update",
  );
  assert.equal(
    (await collection.organismOf(tokenId)).memoryRoot,
    metadataIntent.nextMemoryRoot,
  );
  assert.equal(
    (await collection.renderSnapshot(tokenId)).memoryRoot,
    metadataIntent.nextMemoryRoot,
  );

  // Even transfer is now an organism decision, not a naked holder signature.
  const transferData = collection.interface.encodeFunctionData("transferFrom", [
    await holder.getAddress(),
    await nextHolder.getAddress(),
    tokenId,
  ]);
  const transferEvidence = keccak256(
    toUtf8Bytes("constitutional-consent-to-custody-change"),
  );
  const transferIntent = {
    target: await collection.getAddress(),
    value: 0n,
    dataHash: keccak256(transferData),
    nonce: await account.actionNonce(),
    validAfter: BigInt(now - 1),
    validUntil: BigInt(now + 3_600),
    priorStateRoot: await account.stateRoot(),
    nextStateRoot: await account.stateRoot(),
    nextMemoryRoot: await account.memoryRoot(),
    policyHash: constitution,
    evidenceHash: transferEvidence,
    verifierId: 1,
  };
  await executeVerified({
    account,
    verifier,
    attester,
    relayer,
    intent: transferIntent,
    data: transferData,
  });
  assert.equal(
    await collection.ownerOf(tokenId),
    await nextHolder.getAddress(),
  );
  assert.equal(await account.currentOwner(), await nextHolder.getAddress());
  assert.equal((await collection.organismOf(tokenId)).agentId, 42n);

  // The token body and metadata are generated entirely from live onchain state.
  const uri = await collection.tokenURI(tokenId);
  assert.ok(uri.startsWith("data:application/json;base64,"));
  const metadata = JSON.parse(
    Buffer.from(uri.split(",")[1], "base64").toString("utf8"),
  );
  assert.equal(metadata.name, "i dont fucking believe it! #1");
  assert.ok(metadata.image.startsWith("data:image/svg+xml;base64,"));
  const svg = Buffer.from(metadata.image.split(",")[1], "base64").toString(
    "utf8",
  );
  assert.match(svg, /SOVEREIGN \/ PROOF-ONLY/);
  assert.match(svg, /animateTransform/);
  assert.match(
    await collection.contractURI(),
    /^data:application\/json;base64,/,
  );

  // Remote witnesses are adapter-authenticated and strictly monotonic.
  const remoteDomain = 101;
  await (
    await witnesses.setAdapter(remoteDomain, await attester.getAddress())
  ).wait();
  const identity = solidityPackedKeccak256(
    ["address", "uint256"],
    [await collection.getAddress(), tokenId],
  );
  await expectRevert(() =>
    witnesses
      .connect(holder)
      .submitWitness(identity, remoteDomain, 1, nextState, evolutionEvidence),
  );
  await (
    await witnesses
      .connect(attester)
      .submitWitness(identity, remoteDomain, 1, nextState, evolutionEvidence)
  ).wait();
  assert.equal((await witnesses.witnessOf(identity, remoteDomain)).nonce, 1n);
  await expectRevert(() =>
    witnesses
      .connect(attester)
      .submitWitness(identity, remoteDomain, 1, nextState, evolutionEvidence),
  );

  // Once frozen, proof and transport trust roots cannot be silently swapped.
  await expectRevert(() => verifier.freeze());
  await expectRevert(() => router.freeze());
  await (await witnesses.freeze()).wait();
  await expectRevert(async () =>
    router.setVerifier(2, await verifier.getAddress()),
  );
  await expectRevert(async () =>
    witnesses.setAdapter(102, await holder.getAddress()),
  );

  await eip1193.disconnect();
});
