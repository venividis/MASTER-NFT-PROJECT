// Offline preparation only. This module never constructs a provider or signer.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {ContractFactory, Interface, getAddress, getCreateAddress, keccak256} from 'ethers';
import {readPrivacyResource} from './deploy-privacy-resource.mjs';
import {PRIVACY_RUNTIME} from '../../web/privacy/runtime-integrity.mjs';
import {verifyCompilation} from './compiler-artifacts.mjs';
import {verifyV4Compilation} from './v4-compilation.mjs';
import {expandedRuntime} from './runtime-archive.mjs';
import {readRuntimeModules,moduleConstructorEntries} from './runtime-modules.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hex = bytes => '0x' + bytes.toString('hex');
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const address = (value, label) => {
  try { const result = getAddress(value); if (BigInt(result) !== 0n) return result; } catch {}
  throw Error('Invalid nonzero ' + label + ' address.');
};
const integer = (value, low, high, label) => {
  if (!Number.isSafeInteger(value) || value < low || value > high) throw Error('Invalid ' + label + '.');
  return value;
};

export function validateGenesisDeploymentConfig(input) {
  const keys = ['chainId', 'deployer', 'startingNonce', 'attesters', 'threshold', 'royaltyReceiver', 'royaltyBps', 'freezeTrustRoots', 'experimentGuardian'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !keys.includes(key))) throw Error('Unknown deployment configuration field.');
  if (![31337, 11155111, 84532].includes(input.chainId)) throw Error('Select local 31337, Sepolia 11155111, or Base Sepolia 84532 explicitly.');
  if (typeof input.freezeTrustRoots !== 'boolean') throw Error('Choose freezeTrustRoots explicitly.');
  if (!Array.isArray(input.attesters) || !input.attesters.length || input.attesters.length > 65535) throw Error('Choose a nonempty attester list.');
  const attesters = input.attesters.map(value => address(value, 'attester')).sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
  if (new Set(attesters).size !== attesters.length) throw Error('Duplicate attester.');
  return {
    chainId: input.chainId,
    deployer: address(input.deployer, 'deployer / initial administrator'),
    startingNonce: integer(input.startingNonce, 0, Number.MAX_SAFE_INTEGER - 100000, 'starting nonce'),
    attesters,
    threshold: integer(input.threshold, 1, attesters.length, 'attestation threshold'),
    royaltyReceiver: address(input.royaltyReceiver, 'royalty receiver'),
    royaltyBps: integer(input.royaltyBps, 0, 1000, 'royalty basis points (collection maximum 1000)'),
    freezeTrustRoots: input.freezeTrustRoots,
    experimentGuardian: address(input.experimentGuardian, 'experiment guardian'),
  };
}

/** Read exactly the bytes which OnchainApp constructors will bind. */
export function readGenesisRuntime(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if(manifest.schema==='awe.onchain-runtime/3')return readRuntimeModules(manifestPath);
  const base = fs.realpathSync(path.dirname(path.resolve(manifestPath)));
  if (!['awe.onchain-runtime/1', 'awe.onchain-runtime/2'].includes(manifest.schema) || manifest.compression !== 'gzip') throw Error('Unsupported Genesis runtime manifest.');
  const archiveVersion = manifest.schema === 'awe.onchain-runtime/2' ? 2 : 1, limit = archiveVersion === 2 ? 512 : 64;
  if (manifest.archiveVersion !== undefined && manifest.archiveVersion !== archiveVersion) throw Error('Runtime archive version differs from schema.');
  integer(manifest.byteLength, 1, limit * 23000, 'runtime bytes');
  integer(manifest.expandedBytes, 1, 64 * 1024 * 1024, 'expanded runtime bytes');
  if (!/^[a-f0-9]{64}$/.test(manifest.sha256)) throw Error('Invalid runtime digest.');
  if (!Array.isArray(manifest.chunks) || !manifest.chunks.length || manifest.chunks.length > limit) throw Error('Invalid runtime chunk list.');
  const chunks = manifest.chunks.map((chunk, i) => {
    if (chunk.file !== 'chunks/' + String(i).padStart(2, '0') + '.bin') throw Error('Invalid ordered runtime chunk path.');
    integer(chunk.bytes, 1, 23000, 'runtime chunk bytes');
    const location = fs.realpathSync(path.join(base, chunk.file));
    if (!location.startsWith(base + path.sep)) throw Error('Runtime chunk resolves outside its archive.');
    const bytes = fs.readFileSync(location);
    if (bytes.length !== chunk.bytes || hash(bytes) !== chunk.sha256) throw Error('Runtime chunk differs from its manifest.');
    return bytes;
  });
  const shards = [];
  if (archiveVersion === 2) {
    if (!Array.isArray(manifest.shards) || !manifest.shards.length || manifest.shards.length > 16) throw Error('Invalid runtime shard list.');
    let cursor = 0;
    for (const [index, shard] of manifest.shards.entries()) {
      if (shard.index !== index || shard.firstChunk !== cursor) throw Error('Invalid ordered runtime shard.');
      integer(shard.chunkCount, 1, 32, 'runtime shard chunk count');
      if (cursor + shard.chunkCount > chunks.length) throw Error('Runtime shard exceeds chunk list.');
      const parts = chunks.slice(cursor, cursor + shard.chunkCount), bytes = Buffer.concat(parts);
      if (shard.byteLength !== bytes.length || shard.sha256 !== hash(bytes)) throw Error('Runtime shard differs from its manifest.');
      shards.push({...shard, chunks: parts});cursor += shard.chunkCount;
    }
    if (cursor !== chunks.length) throw Error('Runtime shards do not cover every chunk.');
  } else if (manifest.shards !== undefined) throw Error('Legacy runtime cannot declare directory shards.');
  const raw = Buffer.concat(chunks);
  if (raw.length !== manifest.byteLength || hash(raw) !== manifest.sha256) throw Error('Runtime archive differs from its manifest.');
  if (!raw.equals(fs.readFileSync(path.join(base, 'runtime.html')))) throw Error('Runtime HTML differs from archived chunks.');
  // archive-confluence.mjs emits this exact envelope. Do not trust a declared
  // expanded size without exercising the gzip bytes a browser will recover.
  const payload = raw.toString('utf8').match(/const b=Uint8Array\.from\(atob\("([A-Za-z0-9+/]+={0,2})"\),c=>c\.charCodeAt\(0\)\);/);
  if (!payload) throw Error('Unsupported runtime gzip envelope. Rebuild archive:confluence.');
  const compressed = Buffer.from(payload[1], 'base64');
  if (compressed.toString('base64') !== payload[1]) throw Error('Noncanonical runtime gzip encoding.');
  const expanded = zlib.gunzipSync(compressed, {maxOutputLength: manifest.expandedBytes});
  if (expanded.length !== manifest.expandedBytes) throw Error('Expanded runtime length differs from its manifest.');
  return {manifest, chunks, shards, archiveVersion, compressedBytes: compressed.length, expanded};
}

/** A self-consistent archive must also belong to the current verified source build. */
export async function verifyGenesisRuntimeSource(runtime, projectRoot = root) {
  const current = await expandedRuntime(projectRoot);
  if (runtime.manifest.buildManifestSha256 !== current.buildManifestSha256 ||
      canonical(runtime.manifest.moduleGraph) !== canonical(current.moduleGraph) ||
      !runtime.expanded.equals(Buffer.from(current.html))) throw Error('Genesis runtime archive is stale relative to the current source build. Rebuild and archive:confluence before preparing deployment.');
}

/**
 * All addresses and calldata are concrete, using an explicitly supplied EOA nonce.
 * No signing key, network URL, gas budget, mint secret, deposit or transaction
 * submission is accepted. Archive/ABI failures abort without producing a plan.
 */
export async function prepareGenesisDeployment(input, {
  artifactDirectory = path.join(root, 'contracts/artifacts'),
  runtimeManifest = path.join(root, 'onchain-app/confluence/manifest.json'),
  privacyManifest = path.join(root, 'onchain-app/privacy-worker/manifest.json'),
  expectedPrivacy = PRIVACY_RUNTIME,
} = {}) {
  if (path.resolve(artifactDirectory) === path.join(root, 'contracts/artifacts')) verifyCompilation(root);
  const config = validateGenesisDeploymentConfig(input);
  const runtime = readGenesisRuntime(runtimeManifest);
  if (path.resolve(runtimeManifest) === path.join(root, 'onchain-app/confluence/manifest.json')) {
    verifyV4Compilation(root);
    await verifyGenesisRuntimeSource(runtime);
  }
  const privacy = readPrivacyResource(privacyManifest, expectedPrivacy);
  const requests = [], modules = {}, artifacts = {}, loaded = new Map();
  const artifact = name => {
    if (!loaded.has(name)) {
      const item = JSON.parse(fs.readFileSync(path.join(artifactDirectory, name + '.json'), 'utf8'));
      if (item.contractName !== name || !Array.isArray(item.abi) || !/^0x(?:[0-9a-fA-F]{2})+$/.test(item.bytecode) || !/^0x(?:[0-9a-fA-F]{2})+$/.test(item.deployedBytecode)) throw Error('Missing or unlinked deployment artifact: ' + name);
      const metadataCompiler = item.metadata?.compiler?.version;
      if (typeof item.compiler !== 'string' || !item.compiler.trim() || typeof metadataCompiler !== 'string' || !metadataCompiler || (item.compiler !== metadataCompiler && !item.compiler.startsWith(metadataCompiler + '.'))) throw Error('Missing or inconsistent compiler identity: ' + name);
      if ((item.deployedBytecode.length - 2) / 2 > 24576) throw Error('EIP-170 runtime limit exceeded: ' + name);
      const evmVersion = item.metadata?.settings?.evmVersion;
      if (!['shanghai', 'cancun'].includes(evmVersion)) throw Error('Unsupported artifact EVM target: ' + name);
      artifacts[name] = {compiler: item.compiler, evmVersion, artifactSha256: hash(canonical(item)), creationBytecodeHash: keccak256(item.bytecode)};
      loaded.set(name, item);
    }
    return loaded.get(name);
  };
  const next = () => config.startingNonce + requests.length;
  const deploy = async (name, args = [], key = name) => {
    const item = artifact(name), nonce = next();
    const {data} = await new ContractFactory(item.abi, item.bytecode).getDeployTransaction(...args);
    if ((data.length - 2) / 2 > 49152) throw Error('EIP-3860 initcode limit exceeded: ' + key);
    const predictedAddress = getCreateAddress({from: config.deployer, nonce});
    modules[key] = predictedAddress;
    requests.push({id: 'deploy:' + key, kind: 'create', contract: name, address: predictedAddress,
      transaction: {chainId: config.chainId, from: config.deployer, nonce, data, value: '0'}, dataHash: keccak256(data)});
    return predictedAddress;
  };
  const call = (name, method, args = [], suffix = '') => {
    const data = new Interface(artifact(name).abi).encodeFunctionData(method, args);
    requests.push({id: 'configure:' + name + '.' + method + suffix, kind: 'call', contract: name, method,
      transaction: {chainId: config.chainId, from: config.deployer, nonce: next(), to: modules[name], data, value: '0'}, dataHash: keccak256(data)});
  };

  const chunks=[],runtimeLeaves=[],moduleArchives=[];
  let app;
  if(runtime.archiveVersion===3){
    for(const [index,m] of runtime.modules.entries()){
      const parts=[];for(const [n,bytes] of m.chunks.entries()){const address=await deploy('AppChunk',[hex(bytes)],`moduleChunk${index}_${n}`);parts.push(address);chunks.push(address);}
      if(m.archiveVersion===2){const leaves=[];for(const s of m.shards){const leaf=await deploy('OnchainApp',[parts.slice(s.firstChunk,s.firstChunk+s.chunkCount),'0x'+s.sha256],`moduleLeaf${index}_${s.index}`);leaves.push(leaf);runtimeLeaves.push(leaf);}moduleArchives.push(await deploy('OnchainAppDirectory',[leaves,'0x'+m.sha256],`moduleArchive${index}`));}
      else moduleArchives.push(await deploy('OnchainApp',[parts,'0x'+m.sha256],`moduleArchive${index}`));
    }
    app=await deploy('OnchainModuleDirectory',[moduleConstructorEntries(runtime.modules,moduleArchives),runtime.manifest.shellIndex,'0x'+runtime.manifest.sha256]);
  }else{
    for(const [i,bytes] of runtime.chunks.entries())chunks.push(await deploy('AppChunk',[hex(bytes)],'runtimeChunk'+i));
    if(runtime.archiveVersion===2)for(const shard of runtime.shards)runtimeLeaves.push(await deploy('OnchainApp',[chunks.slice(shard.firstChunk,shard.firstChunk+shard.chunkCount),'0x'+shard.sha256],'runtimeLeaf'+shard.index));
    app=runtime.archiveVersion===2?await deploy('OnchainAppDirectory',[runtimeLeaves,'0x'+runtime.manifest.sha256]):await deploy('OnchainApp',[chunks,'0x'+runtime.manifest.sha256]);
  }
  const shards = [];
  for (const shard of privacy.shards) {
    const parts = [];
    for (const [i, bytes] of shard.chunks.entries()) parts.push(await deploy('AppChunk', [hex(bytes)], 'privacyChunk' + shard.index + '_' + i));
    shards.push(await deploy('OnchainApp', [parts, '0x' + shard.sha256], 'privacyShard' + shard.index));
  }
  const resource = await deploy('ShardedResource', [shards, '0x' + privacy.manifest.compressedSha256, '0x' + privacy.manifest.sha256, privacy.manifest.byteLength], 'privacyResource');
  const directory = await deploy('GenesisManifest');
  const renderer = await deploy('ConfluenceRenderer', [app, directory, resource]);
  const router = await deploy('ProofRouter', [config.deployer]);
  const verifier = await deploy('ThresholdAttestationVerifier', [config.deployer, config.threshold]);
  const witness = await deploy('OmnichainWitnessRegistry', [config.deployer]);
  for (const [i, signer] of config.attesters.entries()) call('ThresholdAttestationVerifier', 'setSigner', [signer, true], ':' + i);
  call('ProofRouter', 'setVerifier', [1, verifier]);
  if (config.freezeTrustRoots) {
    call('ThresholdAttestationVerifier', 'freeze');
    call('ProofRouter', 'freeze');
  }
  const collection = await deploy('IDontFuckingBelieveIt', [config.deployer, renderer, router, witness, config.royaltyReceiver, config.royaltyBps]);
  const factory = await deploy('SovereignAccountFactory', [collection, router]);
  call('IDontFuckingBelieveIt', 'setAccountFactory', [factory]);
  const ledger = await deploy('WorldLedger', [collection]);
  const market = await deploy('NativeMarket', [ledger]);
  const vault = await deploy('TimeVault', [ledger]);
  const launch = await deploy('GenesisLaunchpad', [ledger]);
  const memory = await deploy('MemoryLedger', [collection]);
  const journal = await deploy('JournalSwapRouter', [memory, market]);
  call('MemoryLedger', 'installRouter', [journal]);
  const exit = await deploy('VestedExitVault', [collection, market]);
  const cells = await deploy('ExperimentCellFactory');
  const editions = await deploy('EditionRegistry', [collection]);
  const work = await deploy('CommissionEscrow');
  const gate = await deploy('ExperimentGate', [config.experimentGuardian]);
  const shelf = await deploy('BondedShelf', [gate, collection]);
  const gift = await deploy('ConsentGiftRouter', [ledger, market, vault]);
  const instruments = await deploy('InstrumentRouter', [ledger, market, vault]);
  const binding = await deploy('ArtifactBinding', [collection]);
  const cartridges = await deploy('CartridgeRegistry', [binding]);
  const publisher = await deploy('CommissionedCartridges', [collection, work, cartridges]);
  const tracked = [publisher, exit, vault, editions, work, shelf, gift, instruments].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
  const commitments = await deploy('CommitmentIndex', [cells, tracked]);
  const estate = await deploy('EstateExchange', [ledger, commitments]);
  call('WorldLedger', 'configureEstateMarket', [estate]);
  call('WorldLedger', 'sealModules', [market, vault, launch]);
  await deploy('OwnerLaunchFactory');
  const manifestModules = [market, vault, memory, ledger, cartridges, exit];
  call('GenesisManifest', 'publish', [collection, manifestModules]);

  const targets = [...new Set(Object.values(artifacts).map(item => item.evmVersion))];
  const compilers = [...new Set(Object.values(artifacts).map(item => item.compiler))];
  if (targets.length !== 1 || compilers.length !== 1) throw Error('Mixed Solidity compiler builds. Recompile the complete stack.');
  const privacyChunkCount = privacy.shards.reduce((total, shard) => total + shard.chunks.length, 0);
  const plan = {
    schema: 'anima.genesis-deployment-plan/1',
    status: 'unsigned-offline-preparation',
    scope: 'Genesis native stack and immutable app/worker archives; no transaction submitted.',
    config, evmVersion: targets[0], artifacts, modules, manifestModules,
    archives: {
      runtime: {archiveVersion: runtime.archiveVersion, address: app, functionalModules:moduleArchives.map((address,i)=>({address,name:runtime.modules[i].name,version:runtime.modules[i].version,sha256:runtime.modules[i].sha256})), shards: runtimeLeaves.length, sha256: runtime.manifest.sha256, storedBytes: runtime.manifest.byteLength, compressedBytes: runtime.compressedBytes, expandedBytes: runtime.manifest.expandedBytes, chunks: chunks.length},
      privacy: {sha256: privacy.manifest.sha256, compressedSha256: privacy.manifest.compressedSha256, expandedBytes: privacy.manifest.byteLength, compressedBytes: privacy.manifest.compressedByteLength, chunks: privacyChunkCount, shards: shards.length},
    },
    summary: {transactionCount: requests.length, createCount: requests.filter(item => item.kind === 'create').length, configurationCount: requests.filter(item => item.kind === 'call').length,
      firstNonce: config.startingNonce, nextNonce: next(), totalArchiveChunks: chunks.length + privacyChunkCount,
      totalStoredArchiveBytes: runtime.manifest.byteLength + privacy.manifest.compressedByteLength,
      totalCompressedArchiveBytes: runtime.compressedBytes + privacy.manifest.compressedByteLength,
      totalTransactionDataBytes: requests.reduce((sum, item) => sum + (item.transaction.data.length - 2) / 2, 0),
      transferValueWei: '0', gasAndFees: 'unestimated'},
    outstanding: [
      'Confirm live chain, EOA identity, pending nonce, target EVM support, per-transaction gas and complete fee budget before approving any public deployment.',
      'Simulate this exact ordered sequence and independently review the contracts and chosen trust configuration.',
      'After a separately authorized deployment, verify receipts, code, constructor bindings, sealed modules and exact onchain archive recovery before distributing addresses.',
      'Minting, NFT account creation and per-owner OwnerFeeRouter configuration require separate owner actions; no fixture secret, mint, funds or seeded market is included.',
      'Uniswap v4 deployment/liquidity, RAILGUN networks/circuit artifacts, keepers, workshop providers and other external services require separate activation.',
    ],
    requests,
  };
  return {...plan, planSha256: hash(canonical(plan))};
}

/** Reconstruct from current artifacts and archives; a self-reported hash is insufficient. */
export async function verifyGenesisDeploymentPlan(plan, options) {
  if (plan?.schema !== 'anima.genesis-deployment-plan/1') throw Error('Unsupported Genesis deployment plan.');
  const expected = await prepareGenesisDeployment(plan.config, options);
  if (canonical(expected) !== canonical(plan)) throw Error('Plan differs from the current validated build or configuration. Prepare and review a fresh plan.');
  return expected;
}
