// Offline deployment preparation: no provider, signer, keys or broadcast path.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ContractFactory, getAddress, getCreateAddress, keccak256} from 'ethers';
import {planArchiveDeployment} from '../../packages/modules/deployment.mjs';
import {verifyCompilation} from './compiler-artifacts.mjs';
import {buildWorkbench} from '../modules-build-workbench.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const digest = bytes => '0x' + createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const NAMES = ['ModuleArchiveFactory','ExtensionReleaseRegistry','TokenModuleRegistry','ModuleStateStore',
  'ChunkedCartridgeRegistry','ArtifactBinding','AppChunk','OnchainApp','OnchainAppDirectory','ModuleWorkbench'];
const integer = (n, min, max, label) => { if (!Number.isSafeInteger(n) || n < min || n > max) throw Error('Invalid ' + label); return n; };
const address = (value, label) => { try { const a=getAddress(value); if(BigInt(a)!==0n)return a; } catch {} throw Error('Invalid nonzero '+label+' address'); };
const validHash = value => typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value);

export function validateModuleDeploymentConfig(input) {
  const keys=['chainId','deployer','startingNonce','collection'];
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!keys.includes(key))) throw Error('Unknown module deployment configuration field');
  if(![31337,11155111,84532].includes(input.chainId)) throw Error('Choose local 31337, Sepolia 11155111 or Base Sepolia 84532 explicitly');
  return {chainId:input.chainId,deployer:address(input.deployer,'deployer'),startingNonce:integer(input.startingNonce,0,Number.MAX_SAFE_INTEGER-100000,'starting nonce'),collection:address(input.collection,'existing native collection')};
}

function inside(base, relative) {
  if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..')) throw Error('Unsafe build input path');
  const file=path.resolve(base,relative);
  if(!file.startsWith(path.resolve(base)+path.sep)) throw Error('Build path escapes its root');
  return file;
}

/** Verify raw HTML, every ordered chunk and the declared current source fingerprints. */
export function readWorkbenchBuild(manifestPath, projectRoot=root) {
  const manifestBytes=fs.readFileSync(manifestPath),manifest=JSON.parse(manifestBytes),base=path.dirname(path.resolve(manifestPath));
  if(manifest.schema!=='anima.module-workbench/1'||manifest.compression!=='raw'||!validHash(manifest.sha256)) throw Error('Unsupported workbench build manifest');
  integer(manifest.byteLength,1,1048576,'workbench byte length');
  if(!Array.isArray(manifest.chunks)||!manifest.chunks.length||manifest.chunks.length>64) throw Error('Invalid workbench chunk inventory');
  const chunks=manifest.chunks.map((entry,index)=>{
    if(entry.file!=='chunks/'+String(index).padStart(3,'0')+'.bin'||!validHash(entry.sha256)) throw Error('Invalid ordered workbench chunk');
    integer(entry.byteLength,1,23000,'workbench chunk size');
    if(index<manifest.chunks.length-1&&entry.byteLength!==23000) throw Error('Noncanonical workbench chunk split');
    const file=inside(base,entry.file),real=fs.realpathSync(file);
    if(!real.startsWith(fs.realpathSync(base)+path.sep)||!fs.statSync(real).isFile()) throw Error('Workbench chunk escapes archive');
    const bytes=fs.readFileSync(file);
    if(bytes.length!==entry.byteLength||digest(bytes)!==entry.sha256) throw Error('Workbench chunk differs from its manifest');
    return bytes;
  });
  const bytes=Buffer.concat(chunks);
  if(bytes.length!==manifest.byteLength||digest(bytes)!==manifest.sha256||!bytes.equals(fs.readFileSync(path.join(base,'index.html')))) throw Error('Workbench HTML differs from the committed chunks');
  new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(!manifest.inputs||typeof manifest.inputs!=='object'||Array.isArray(manifest.inputs)||!Object.keys(manifest.inputs).length) throw Error('Missing workbench source/build fingerprints');
  for(const [name,expected] of Object.entries(manifest.inputs)) {
    if(!validHash(expected)||digest(fs.readFileSync(inside(projectRoot,name)))!==expected) throw Error('Workbench build input changed: '+name);
  }
  return {bytes,manifest,manifestSha256:digest(manifestBytes)};
}

function checkedArtifact(name, item) {
  if(!item||item.contractName!==name||!Array.isArray(item.abi)||!/^0x(?:[0-9a-fA-F]{2})+$/.test(item.bytecode)||!/^0x(?:[0-9a-fA-F]{2})+$/.test(item.deployedBytecode)) throw Error('Missing or unlinked module artifact: '+name);
  const compiler=item.metadata?.compiler?.version,evmVersion=item.metadata?.settings?.evmVersion;
  if(typeof item.compiler!=='string'||typeof compiler!=='string'||!item.compiler.startsWith(compiler)||!['shanghai','cancun'].includes(evmVersion)) throw Error('Missing compiler identity/EVM target: '+name);
  if((item.deployedBytecode.length-2)/2>24576) throw Error('EIP-170 runtime limit exceeded: '+name);
  return {compiler:item.compiler,evmVersion,artifactSha256:digest(canonical(item)),creationBytecodeHash:keccak256(item.bytecode),deployedBytecodeTemplateHash:keccak256(item.deployedBytecode)};
}

/** Pure assembly from already supplied build inputs; production callers use prepareModuleDeployment. */
export async function planModuleDeployment(input, {artifacts,workbench,verification={scope:'caller-supplied build inputs'}}) {
  const config=validateModuleDeploymentConfig(input),bytes=Buffer.from(workbench.bytes);
  if(!bytes.length||bytes.length>1048576||workbench.manifest?.sha256!==digest(bytes)||workbench.manifest.byteLength!==bytes.length||workbench.manifest.compression!=='raw') throw Error('Invalid raw workbench bytes');
  const bindings={};for(const name of NAMES)bindings[name]=checkedArtifact(name,artifacts[name]);
  const steps=[],modules={collection:config.collection},internalCreations=[];
  const deployData=async(name,args)=>{
    const data=(await new ContractFactory(artifacts[name].abi,artifacts[name].bytecode).getDeployTransaction(...args)).data;
    if((data.length-2)/2>49152) throw Error('EIP-3860 initcode including arguments exceeds limit: '+name);
    return data;
  };
  const deploy=async(name,args=[])=>{
    const nonce=config.startingNonce+steps.length,data=await deployData(name,args),expectedAddress=getCreateAddress({from:config.deployer,nonce});
    modules[name]=expectedAddress;
    steps.push({id:'deploy:'+name,kind:'create',contract:name,from:config.deployer,to:null,nonce,chainId:String(config.chainId),value:'0',data,expectedAddress,dataHash:keccak256(data),initcodeBytes:(data.length-2)/2});
    return expectedAddress;
  };
  const internal=async(name,from,nonce,args,key=name)=>{
    const expectedAddress=getCreateAddress({from,nonce}),data=await deployData(name,args);
    modules[key]=expectedAddress;
    internalCreations.push({contract:name,key,creator:from,nonce,expectedAddress,initcodeBytes:(data.length-2)/2,initcodeHash:keccak256(data)});
    return expectedAddress;
  };
  const factory=await deploy('ModuleArchiveFactory');
  const releases=await deploy('ExtensionReleaseRegistry',[factory]);
  const registry=await deploy('TokenModuleRegistry',[config.collection,releases]);
  await internal('ModuleStateStore',registry,1,[registry,config.collection,factory]);
  const cartridges=await deploy('ChunkedCartridgeRegistry',[config.collection]);
  await internal('ArtifactBinding',cartridges,1,[config.collection]);
  const archive=await planArchiveDeployment({archive:bytes,publisher:config.deployer,chainId:config.chainId,startNonce:config.startingNonce+steps.length,factory,factoryNonce:1,appChunkArtifact:artifacts.AppChunk});
  if(archive.archiveSchema!==1) throw Error('Bounded workbench must fit the canonical v1 reader');
  for(const step of archive.steps)steps.push({...step,dataHash:keccak256(step.data),...(step.to===null?{initcodeBytes:(step.data.length-2)/2}:{
    preconditions:{factory,expectedFactoryNonce:1,expectedArchive:step.expectedAddress,onConflict:'Stop and regenerate remaining calldata; the public factory nonce is not reserved.'}
  })});
  const chunks=archive.chunkReferences.map(hash=>archive.chunks.find(chunk=>chunk.hash===hash).address);
  const archiveAddress=await internal('OnchainApp',factory,1,[chunks,archive.archiveHash],'WorkbenchArchive');
  if(archiveAddress.toLowerCase()!==archive.archiveAddress.toLowerCase())throw Error('Archive factory CREATE nonce prediction differs');
  await deploy('ModuleWorkbench',[registry,modules.WorkbenchArchive]);
  steps.at(-1).preconditions={archive:modules.WorkbenchArchive,archiveFactory:factory,archiveSchema:1,
    contentSha256:digest(bytes),byteLength:bytes.length,chunkCount:archive.chunkReferences.length,
    codeHashRule:'Actual archive code hash must equal archiveFactory.archiveCodeHash(archive).',
    onConflict:'Do not sign the anchor creation: verify the deployed document against these exact commitments first.'};
  const result={schema:'anima.module-system-deployment/1',status:'unsigned-testnet-plan',config,modules,artifacts:bindings,verification,
    workbench:{sha256:digest(bytes),byteLength:bytes.length,manifestSha256:workbench.manifestSha256??digest(canonical(workbench.manifest)),inputs:workbench.manifest.inputs??{}},
    archive,internalCreations,steps,nextNonce:config.startingNonce+steps.length,
    preconditions:['The supplied deployer is an EOA and its next transaction nonce equals startingNonce.','The collection address is the intended deployed native ANIMA collection before TokenModuleRegistry creation.','Predicted creation addresses are unused. Review current testnet gas limits, fees and transaction simulations before signing.','Public archive factory nonces are not reserved: recheck the nonce immediately before creating the archive, then verify its exact code/content/length before signing the workbench anchor. Stop and regenerate on any conflict.','This plan neither installs a module nor grants account spending authority.'],
    summary:{transactions:steps.length,externalCreations:steps.filter(step=>step.to===null).length,internalCreations:internalCreations.length,storedBytes:bytes.length,chunkCount:archive.chunkReferences.length,uniqueChunks:archive.chunks.length}};
  return {...result,planSha256:digest(canonical(result))};
}

/** Strict operator entry point: bind artifacts, source recipe and independently rebuilt HTML. */
export async function prepareModuleDeployment(input, {artifactDirectory=path.join(root,'contracts/artifacts'),workbenchManifest=path.join(root,'onchain-app/module-workbench/manifest.json')}={}) {
  const index=verifyCompilation(root,{artifactDirectory});
  const artifacts=Object.fromEntries(NAMES.map(name=>[name,JSON.parse(fs.readFileSync(path.join(artifactDirectory,name+'.json'),'utf8'))]));
  const workbench=readWorkbenchBuild(workbenchManifest);
  const rebuilt=await buildWorkbench({output:null});
  if(!workbench.bytes.equals(Buffer.from(rebuilt.bytes))||canonical(workbench.manifest)!==canonical(rebuilt.manifest)) throw Error('Workbench archive is stale or differs from the current reproducible source build');
  const verification={scope:'current compiled source and rebuilt workbench',compilerInputSha256:'0x'+index.compilerInputSha256,compiler:index.compiler,artifactIndexSha256:digest(fs.readFileSync(path.join(artifactDirectory,'index.json')))};
  const plan=await planModuleDeployment(input,{artifacts,workbench,verification});
  const after=verifyCompilation(root,{artifactDirectory});
  if(after.compilerInputSha256!==index.compilerInputSha256||digest(fs.readFileSync(path.join(artifactDirectory,'index.json')))!==verification.artifactIndexSha256) throw Error('Compiler artifacts changed during planning');
  if(readWorkbenchBuild(workbenchManifest).manifestSha256!==workbench.manifestSha256) throw Error('Workbench build changed during planning');
  return plan;
}

export async function verifyModuleDeploymentPlan(plan, options={}) {
  if(plan?.schema!=='anima.module-system-deployment/1') throw Error('Unsupported module system deployment plan');
  const {planSha256,...body}=plan;
  if(!validHash(planSha256)||digest(canonical(body))!==planSha256) throw Error('Module deployment plan fingerprint mismatch');
  const current=await prepareModuleDeployment(plan.config,options);
  if(canonical(plan)!==canonical(current)) throw Error('Saved module plan differs from current compiled source/workbench');
  return current;
}
