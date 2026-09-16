import fs from 'node:fs';
import path from 'node:path';
import {Contract, ContractFactory, keccak256, hexlify, toUtf8Bytes} from 'ethers';
import {loadArtifact} from './deploy-stack.mjs';
import {sha256, planChunks, canonicalManifest, validateManifest, verifyArchive} from '../../packages/modules/sdk.mjs';
import {descriptorFromManifest, releaseInput, releaseIdFor, EMPTY_ARCHIVE} from '../../packages/modules/chain.mjs';

/** Receipts contain only public transaction metadata, never signing material. */
export function receiptJournal(file, chainId) {
  if(!file)return ()=>{};
  fs.mkdirSync(path.dirname(file),{recursive:true});
  return (label, receipt) => {
    if(receipt.status!==1)throw Error('Transaction failed: '+label);
    const entry={schema:'anima.module-deployment-receipt/1',chainId:String(chainId),label,
      hash:receipt.hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,
      from:receipt.from,to:receipt.to,contractAddress:receipt.contractAddress,
      gasUsed:receipt.gasUsed.toString()};
    const fd=fs.openSync(file,'a',0o600);
    try{fs.writeSync(fd,JSON.stringify(entry)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  };
}

/** Caller supplies its own signer. The CLI only invokes this on the disposable local chain. */
export async function deployModuleSystem({provider,signer,collection,workbenchBytes,journal}) {
  const chainId=(await provider.getNetwork()).chainId;
  if(![31337n,11155111n,84532n].includes(chainId))throw Error('Select a supported test network explicitly.');
  const recordReceipt=receiptJournal(journal,chainId),contracts={};
  const deploy=async(name,args=[])=>{
    const a=loadArtifact(name),c=await new ContractFactory(a.abi,a.bytecode,signer).deploy(...args);
    const receipt=await c.deploymentTransaction().wait();recordReceipt('deploy '+name,receipt);
    contracts[name]=c.target;return c;
  };
  const factory=await deploy('ModuleArchiveFactory');
  const releases=await deploy('ExtensionReleaseRegistry',[factory.target]);
  const modules=await deploy('TokenModuleRegistry',[collection,releases.target]);
  contracts.ModuleStateStore=await modules.stateStore();
  const cartridges=await deploy('ChunkedCartridgeRegistry',[collection]);
  const cache={},archives={};
  const createArchive=async(bytes,label)=>{
    const stored=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),hash=sha256(stored);
    if(archives[hash])return {...archives[hash],deployedChunkCount:0,reusedChunkCount:new Set(archives[hash].chunks).size,reusedArchive:true};
    const plan=planChunks(stored,{existing:cache});
    for(const chunk of plan.chunks){
      if(chunk.reused){
        const actual=await provider.getCode(chunk.address);
        if(actual.toLowerCase()!==('0x00'+Buffer.from(chunk.payload).toString('hex')))throw Error('Reused chunk differs from exact bytes.');
      }else{
        const a=loadArtifact('AppChunk'),c=await new ContractFactory(a.abi,a.bytecode,signer).deploy(hexlify(chunk.payload));
        recordReceipt(label+' chunk '+chunk.hash,await c.deploymentTransaction().wait());cache[chunk.hash]=c.target;
      }
    }
    const chunks=plan.references.map(hash=>cache[hash]);
    const create=async(method,args)=>{
      const receipt=await(await factory[method](...args)).wait();recordReceipt(label+' '+method,receipt);
      const event=receipt.logs.map(log=>{try{return factory.interface.parseLog(log);}catch{return null;}}).find(e=>e?.name==='ArchiveCreated');
      if(!event)throw Error('Archive creation receipt is missing.');return event.args.archive;
    };
    let archive,schema=1;
    if(chunks.length<=64)archive=await create('createArchive',[chunks,hash]);
    else{
      schema=2;const leaves=[];
      for(let first=0;first<chunks.length;first+=32)leaves.push(await create('createArchive',[chunks.slice(first,first+32),sha256(stored.slice(first*23000,Math.min(stored.length,(first+32)*23000)))]));
      archive=await create('createDirectory',[leaves,hash]);
    }
    const result={archive,schema,storedHash:hash,storedBytes:stored.length,codeHash:keccak256(await provider.getCode(archive)),chunks,
      deployedChunkCount:plan.chunks.filter(c=>!c.reused).length,reusedChunkCount:plan.chunks.filter(c=>c.reused).length};
    archives[hash]=result;return result;
  };
  const workbenchArchive=await createArchive(workbenchBytes,'workbench');
  const workbench=await deploy('ModuleWorkbench',[modules.target,workbenchArchive.archive]);
  const publish=async(packaged)=>{
    validateManifest(packaged.manifest);await verifyArchive(packaged.manifest,packaged.archive);
    const publisher=(await signer.getAddress()).toLowerCase();
    if(packaged.manifest.publisher!==publisher)throw Error('Package publisher is not the publishing signer.');
    const archive=await createArchive(packaged.archive,packaged.manifest.name);
    const descriptor=descriptorFromManifest(packaged.manifest,archive.archive,archive.schema,archive.codeHash);
    const input=releaseInput(packaged.manifest,descriptor),releaseId=releaseIdFor(publisher,input,packaged.manifest);
    const tx=await releases.publish(input,toUtf8Bytes(canonicalManifest(packaged.manifest)));
    recordReceipt('publish '+packaged.manifest.name,await tx.wait());
    if(!(await releases.exists(releaseId)))throw Error('Published release does not match SDK identity.');
    return {releaseId,moduleKey:await releases.moduleKey(publisher,input.moduleId),manifest:packaged.manifest,...archive};
  };
  const install=async(tokenId,release,stateValue)=>{
    const core=new Contract(collection,loadArtifact('IDontFuckingBelieveIt').abi,provider);
    const accountAddress=await core.accountOf(tokenId),account=new Contract(accountAddress,loadArtifact('SovereignAccount').abi,signer);
    const root=await modules.rootOf(tokenId),epoch=await account.sessionEpoch(),current=await modules.installation(tokenId,release.moduleKey);
    const data=modules.interface.encodeFunctionData('activate',[tokenId,release.releaseId,root,epoch,current.stateHead,current.stateHead]);
    recordReceipt('install '+release.manifest.name,await(await account.execute(modules.target,0,data)).wait());
    if(stateValue!==undefined){
      const save=modules.interface.encodeFunctionData('writeState',[tokenId,release.moduleKey,await modules.rootOf(tokenId),epoch,toUtf8Bytes(JSON.stringify(stateValue)),EMPTY_ARCHIVE]);
      recordReceipt('save '+release.manifest.name,await(await account.execute(modules.target,0,save)).wait());
    }
  };
  return {contracts,factory,releases,modules,cartridges,workbench,workbenchArchive,createArchive,publish,install,recordReceipt,cache};
}
