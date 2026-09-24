/** Sepolia-only, resumable deployment and mint runner. Private keys are read from the environment only. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Contract, Interface, JsonRpcProvider, Wallet, getAddress, keccak256} from 'ethers';
import {prepareGenesisDeployment, verifyGenesisDeploymentPlan} from './lib/genesis-deployment.mjs';
import {prepareModuleDeployment, verifyModuleDeploymentPlan} from './lib/modules-deployment.mjs';

const CHAIN_ID = 11155111;
const atomicWrite = (file, value, mode = 0o600) => {
  const target = path.resolve(file), temporary = target + '.tmp-' + process.pid;
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', {mode});
  fs.renameSync(temporary, target);
};
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = message => { throw Error(message); };
const parseArgs = values => {
  const result = {_: []};
  for (let i = 0; i < values.length; i++) {
    if (!values[i].startsWith('--')) result._.push(values[i]);
    else {
      const key = values[i].slice(2);
      if (!key || result[key] !== undefined) fail('Invalid or repeated option --' + key);
      if (values[i + 1] && !values[i + 1].startsWith('--')) result[key] = values[++i];
      else result[key] = true;
    }
  }
  return result;
};
const required = (args, key) => typeof args[key] === 'string' && args[key] ? args[key] : fail('--' + key + ' is required.');
const providerFor = async rpc => {
  const provider = new JsonRpcProvider(rpc, CHAIN_ID, {staticNetwork: true});
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== CHAIN_ID) fail('RPC is not Ethereum Sepolia (chain ID 11155111).');
  return provider;
};
const walletFor = async (provider, expected) => {
  if (!process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY) fail('Set SEPOLIA_DEPLOYER_PRIVATE_KEY in the process environment. It is never read from a file or written to output.');
  const wallet = new Wallet(process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY, provider);
  if (getAddress(wallet.address) !== getAddress(expected)) fail('Private key does not match the reviewed plan deployer.');
  return wallet;
};

const help = `ANIMA Ethereum Sepolia release runner

Build first:
  npm ci && npm run compile && npm run compile:v4 && npm run build && npm run archive:confluence
  node scripts/archive-privacy-resource.mjs

Prepare a complete Genesis + module-system plan (no signing):
  npm run sepolia -- prepare --rpc URL --deployer 0x... --attester 0x... --royalty-receiver 0x... --guardian 0x... --output sepolia-plan.json

Deploy or safely resume the reviewed plan:
  SEPOLIA_DEPLOYER_PRIVATE_KEY=... npm run sepolia -- deploy --rpc URL --plan sepolia-plan.json --journal sepolia-journal.json --confirm DEPLOY_ANIMA_TO_SEPOLIA

Mint an NFT after deployment (use a distinct recovery file for every mint):
  SEPOLIA_DEPLOYER_PRIVATE_KEY=... npm run sepolia -- mint --rpc URL --plan sepolia-plan.json --recovery sepolia-mint-1.json --recipient 0x... --confirm MINT_ANIMA_ON_SEPOLIA [--endowment-wei 0]

The runner rejects every chain except Ethereum Sepolia. Keep plans/journals, never commit the
private key or mint recovery file, and fund the deployer with enough Sepolia ETH before deploy.`;

async function prepare(args) {
  const output = path.resolve(required(args, 'output'));
  if (fs.existsSync(output)) fail('Output already exists; choose a new path.');
  const provider = await providerFor(required(args, 'rpc'));
  const deployer = getAddress(required(args, 'deployer'));
  const pendingNonce = await provider.getTransactionCount(deployer, 'pending');
  const genesis = await prepareGenesisDeployment({
    chainId: CHAIN_ID, deployer, startingNonce: pendingNonce,
    attesters: [getAddress(required(args, 'attester'))], threshold: 1,
    royaltyReceiver: getAddress(required(args, 'royalty-receiver')),
    royaltyBps: Number(args['royalty-bps'] ?? 500),
    freezeTrustRoots: args['freeze-trust-roots'] === 'true',
    experimentGuardian: getAddress(required(args, 'guardian')),
  });
  const modules = await prepareModuleDeployment({chainId: CHAIN_ID, deployer,
    startingNonce: genesis.summary.nextNonce, collection: genesis.modules.IDontFuckingBelieveIt});
  const bundle = {schema: 'anima.sepolia-release-plan/1', chainId: CHAIN_ID, deployer,
    preparedAt: new Date().toISOString(), startingNonce: pendingNonce, collection: genesis.modules.IDontFuckingBelieveIt,
    nextNonce: modules.nextNonce, genesis, modules};
  atomicWrite(output, bundle, 0o644);
  console.log(JSON.stringify({output, collection: bundle.collection, transactions: genesis.requests.length + modules.steps.length,
    startingNonce: pendingNonce, nextNonce: bundle.nextNonce, genesisPlanSha256: genesis.planSha256, modulesPlanSha256: modules.planSha256}, null, 2));
}

async function verifiedBundle(file) {
  const bundle = readJson(file);
  if (bundle.schema !== 'anima.sepolia-release-plan/1' || bundle.chainId !== CHAIN_ID) fail('Unsupported Sepolia release plan.');
  await verifyGenesisDeploymentPlan(bundle.genesis);
  await verifyModuleDeploymentPlan(bundle.modules);
  if (bundle.collection !== bundle.genesis.modules.IDontFuckingBelieveIt || bundle.modules.config.collection !== bundle.collection ||
      bundle.modules.config.startingNonce !== bundle.genesis.summary.nextNonce || bundle.nextNonce !== bundle.modules.nextNonce) fail('Combined plan linkage is invalid.');
  return bundle;
}

const ARCHIVE_FACTORY_ABI = [
  'event ArchiveCreated(address indexed archive,uint8 schema,bytes32 indexed digest,uint256 byteLength,bytes32 codeHash)',
  'function archiveSchema(address) view returns (uint8)',
  'function archiveCodeHash(address) view returns (bytes32)',
];
const ARCHIVE_ABI = [
  'function contentSha256() view returns (bytes32)',
  'function byteLength() view returns (uint256)',
  'function chunkCount() view returns (uint256)',
];

export const normalizedSteps = bundle => [
  ...bundle.genesis.requests.map(item => ({section: 'genesis', id: item.id, expectedAddress: item.address ?? null, ...item.transaction})),
  ...bundle.modules.steps.map(item => ({section: 'modules', ...item, expectedAddress: item.expectedAddress ?? null,
    chainId: Number(item.chainId)})),
];

export async function verifyStepPostconditions(provider, step, receipt) {
  if (step.expectedAddress && await provider.getCode(step.expectedAddress) === '0x') fail(`Expected contract was not created at ${step.expectedAddress}.`);
  if (step.kind === 'createArchive') {
    const parser = new Interface(ARCHIVE_FACTORY_ABI);
    const events = receipt.logs.filter(log => getAddress(log.address) === getAddress(step.preconditions.factory)).flatMap(log => {
      try { return [parser.parseLog(log)]; } catch { return []; }
    }).filter(event => event?.name === 'ArchiveCreated');
    if (events.length !== 1) fail(`Archive creation receipt for ${step.id} is missing its unique ArchiveCreated event.`);
    const event = events[0].args;
    const code = await provider.getCode(step.expectedAddress);
    if (getAddress(event.archive) !== getAddress(step.expectedAddress) || Number(event.schema) !== step.archiveSchema ||
        event.digest !== step.archiveHash || event.byteLength !== BigInt(step.archiveBytes) || event.codeHash !== keccak256(code)) {
      fail(`Archive creation for ${step.id} diverged from the reviewed address or content commitments.`);
    }
  }
  if (step.preconditions?.archiveFactory) {
    const expected = step.preconditions, factory = new Contract(expected.archiveFactory, ARCHIVE_FACTORY_ABI, provider);
    const archive = new Contract(expected.archive, ARCHIVE_ABI, provider), code = await provider.getCode(expected.archive);
    const [schema, recordedCodeHash, digest, byteLength, chunkCount] = await Promise.all([
      factory.archiveSchema(expected.archive), factory.archiveCodeHash(expected.archive), archive.contentSha256(),
      archive.byteLength(), archive.chunkCount(),
    ]);
    if (Number(schema) !== expected.archiveSchema || recordedCodeHash !== keccak256(code) || digest !== expected.contentSha256 ||
        byteLength !== BigInt(expected.byteLength) || chunkCount !== BigInt(expected.chunkCount)) {
      fail(`Workbench archive for ${step.id} diverges from the reviewed integrity commitments.`);
    }
  }
}

async function deploy(args) {
  if (args.confirm !== 'DEPLOY_ANIMA_TO_SEPOLIA') fail('Deployment requires --confirm DEPLOY_ANIMA_TO_SEPOLIA.');
  const bundle = await verifiedBundle(required(args, 'plan'));
  const provider = await providerFor(required(args, 'rpc')), wallet = await walletFor(provider, bundle.deployer);
  const journalFile = path.resolve(required(args, 'journal'));
  let journal = fs.existsSync(journalFile) ? readJson(journalFile) : {schema: 'anima.sepolia-deployment-journal/1', chainId: CHAIN_ID,
    deployer: wallet.address, genesisPlanSha256: bundle.genesis.planSha256, modulesPlanSha256: bundle.modules.planSha256, receipts: []};
  if (journal.schema !== 'anima.sepolia-deployment-journal/1' || journal.genesisPlanSha256 !== bundle.genesis.planSha256 ||
      journal.modulesPlanSha256 !== bundle.modules.planSha256 || getAddress(journal.deployer) !== wallet.address) fail('Journal does not belong to this plan and signer.');
  const steps = normalizedSteps(bundle);
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index], saved = journal.receipts[index];
    if (saved) {
      if (saved.id !== step.id || saved.nonce !== step.nonce) fail('Journal sequence differs from the reviewed plan.');
      const receipt = await provider.getTransactionReceipt(saved.hash);
      if (!receipt) fail(`Transaction ${saved.hash} is still pending or unavailable; do not resend it.`);
      if (receipt.status !== 1) fail(`Previously submitted transaction ${saved.hash} failed. Stop and inspect.`);
      await verifyStepPostconditions(provider, step, receipt);
      continue;
    }
    const nonce = await provider.getTransactionCount(wallet.address, 'pending');
    if (nonce !== step.nonce) fail(`Pending nonce ${nonce} does not match reviewed nonce ${step.nonce} for ${step.id}. Stop and prepare/reconcile a new plan.`);
    if (step.preconditions?.expectedFactoryNonce !== undefined) {
      const factoryNonce = await provider.getTransactionCount(step.preconditions.factory, 'pending');
      if (factoryNonce !== step.preconditions.expectedFactoryNonce) fail(`Archive factory nonce ${factoryNonce} does not match reviewed nonce ${step.preconditions.expectedFactoryNonce}. Stop and prepare a new plan.`);
    }
    if (step.expectedAddress && await provider.getCode(step.expectedAddress) !== '0x') fail(`Predicted address is already used: ${step.expectedAddress}`);
    const request = {chainId: CHAIN_ID, nonce: step.nonce, to: step.to ?? undefined, data: step.data, value: BigInt(step.value)};
    const estimate = await wallet.estimateGas(request);
    request.gasLimit = estimate * 120n / 100n;
    const transaction = await wallet.sendTransaction(request);
    journal.receipts.push({index, section: step.section, id: step.id, nonce: step.nonce, hash: transaction.hash, submittedAt: new Date().toISOString()});
    atomicWrite(journalFile, journal);
    console.log(`[${index + 1}/${steps.length}] ${step.id}: ${transaction.hash}`);
    const receipt = await transaction.wait(1);
    if (!receipt || receipt.status !== 1) fail(`Transaction failed: ${transaction.hash}`);
    journal.receipts[index].blockNumber = receipt.blockNumber;
    journal.receipts[index].gasUsed = receipt.gasUsed.toString();
    await verifyStepPostconditions(provider, step, receipt);
    atomicWrite(journalFile, journal);
  }
  journal.completedAt = new Date().toISOString(); atomicWrite(journalFile, journal);
  console.log(JSON.stringify({deployed: true, collection: bundle.collection, workbench: bundle.modules.modules.ModuleWorkbench, journal: journalFile}, null, 2));
}

async function mint(args) {
  if (args.confirm !== 'MINT_ANIMA_ON_SEPOLIA') fail('Minting requires --confirm MINT_ANIMA_ON_SEPOLIA.');
  const bundle = await verifiedBundle(required(args, 'plan'));
  const provider = await providerFor(required(args, 'rpc')), wallet = await walletFor(provider, bundle.deployer);
  if (await provider.getCode(bundle.collection) === '0x') fail('The planned collection is not deployed.');
  const recoveryFile = path.resolve(required(args, 'recovery'));
  let recovery = fs.existsSync(recoveryFile) ? readJson(recoveryFile) : null;
  if (!recovery) {
    const secret = '0x' + crypto.randomBytes(32).toString('hex');
    const recipient = getAddress(required(args, 'recipient'));
    recovery = {schema: 'anima.sepolia-mint-recovery/1', chainId: CHAIN_ID, collection: bundle.collection,
      awakener: wallet.address, recipient, secret, endowmentWei: String(args['endowment-wei'] ?? '0')};
    atomicWrite(recoveryFile, recovery);
    console.log('Saved mint recovery file before submission: ' + recoveryFile);
  }
  if (recovery.schema !== 'anima.sepolia-mint-recovery/1' || recovery.chainId !== CHAIN_ID ||
      getAddress(recovery.collection) !== getAddress(bundle.collection) || getAddress(recovery.awakener) !== wallet.address ||
      (typeof args.recipient === 'string' && getAddress(recovery.recipient) !== getAddress(args.recipient))) fail('Mint recovery file does not match this plan, signer, and recipient.');
  const artifact = readJson('contracts/artifacts/IDontFuckingBelieveIt.json');
  const collection = new Contract(bundle.collection, artifact.abi, wallet);
  if (!recovery.commitHash) {
    const commitment = await collection.commitmentFor(wallet.address, recovery.secret, recovery.recipient);
    const tx = await collection.commitAwakening(commitment, {value: BigInt(recovery.endowmentWei)});
    recovery.commitHash = tx.hash; atomicWrite(recoveryFile, recovery);
    const receipt = await tx.wait(1); recovery.commitBlock = receipt.blockNumber; atomicWrite(recoveryFile, recovery);
  }
  const commitReceipt = await provider.getTransactionReceipt(recovery.commitHash);
  if (!commitReceipt || commitReceipt.status !== 1) fail('Mint commitment is not successfully included yet; do not replace it blindly.');
  const target = commitReceipt.blockNumber + 2;
  if (await provider.getBlockNumber() < target) { console.log(`Commit is included. Wait until Sepolia block ${target}, then run the same mint command again.`); return; }
  if (!recovery.revealHash) {
    const tx = await collection.revealAwakening(recovery.secret, recovery.recipient);
    recovery.revealHash = tx.hash; atomicWrite(recoveryFile, recovery);
    const receipt = await tx.wait(1); recovery.revealBlock = receipt.blockNumber; atomicWrite(recoveryFile, recovery);
  }
  const revealReceipt = await provider.getTransactionReceipt(recovery.revealHash);
  if (!revealReceipt) fail('Mint reveal is still pending or unavailable; do not resend it.');
  if (revealReceipt.status !== 1) fail('Mint reveal failed. Keep the recovery file and inspect the transaction before taking another action.');
  let awakened;
  for (const log of revealReceipt.logs) {
    try { const parsed = collection.interface.parseLog(log); if (parsed?.name === 'Awakened') awakened = parsed; } catch {}
  }
  if (!awakened) fail('Successful reveal receipt is missing the expected Awakened event.');
  const tokenId = awakened.args.tokenId.toString(), account = getAddress(awakened.args.account);
  recovery.completedAt = new Date().toISOString(); recovery.tokenId = tokenId; recovery.account = account; atomicWrite(recoveryFile, recovery);
  console.log(JSON.stringify({minted: true, collection: bundle.collection, tokenId, owner: recovery.recipient, account, recovery: recoveryFile}, null, 2));
}

const args = parseArgs(process.argv.slice(2)), command = args._[0];
if (!command || command === 'help' || args.help) console.log(help);
else if (args._.length !== 1) fail('Choose exactly one command: prepare, deploy, or mint.');
else if (command === 'prepare') await prepare(args);
else if (command === 'deploy') await deploy(args);
else if (command === 'mint') await mint(args);
else fail('Unknown command. Use: npm run sepolia -- help');
