import {deployPrivacyResource} from './deploy-privacy-resource.mjs';
import {archivePrivacyResource} from '../archive-privacy-resource.mjs';
import {PRIVACY_RUNTIME} from '../../web/privacy/runtime-integrity.mjs';
import fs from 'node:fs';import path from 'node:path';
import {Contract,keccak256,toUtf8Bytes,parseEther} from 'ethers';
import {deployContract,loadArtifact} from './deploy-stack.mjs';
import {readGenesisRuntime} from './genesis-deployment.mjs';
import {moduleConstructorEntries} from './runtime-modules.mjs';
import {recoverArchive} from '../../web/confluence/chain-loader.mjs';
const root=path.resolve(import.meta.dirname,'../..');

/** Local chain only. Same deployment path for the lasting dev world and release fixture. */
export async function deployGenesis({rpc,provider,signer,seedMarket=true,onPreview}){
  if((await provider.getNetwork()).chainId!==31337n)throw Error('Genesis development stack requires local chain 31337.');
  const owner=await signer.getAddress(),modules={};
  const deploy=async(name,args=[],key=name)=>{const c=await deployContract(name,signer,args);modules[key]=c.target;return c;};
  const archive=readGenesisRuntime(path.join(root,'onchain-app/confluence/manifest.json')),manifest=archive.manifest;
  const chunks=[],leaves=[],functionalModules=[];let runtime;
  if(archive.archiveVersion===3){
    for(const [i,m] of archive.modules.entries()){
      const parts=[];for(const [n,bytes] of m.chunks.entries()){const address=(await deploy('AppChunk',['0x'+bytes.toString('hex')],`moduleChunk${i}_${n}`)).target;parts.push(address);chunks.push(address);}
      if(m.archiveVersion===2){const group=[];for(const s of m.shards){const leaf=(await deploy('OnchainApp',[parts.slice(s.firstChunk,s.firstChunk+s.chunkCount),'0x'+s.sha256],`moduleLeaf${i}_${s.index}`)).target;group.push(leaf);leaves.push(leaf);}functionalModules.push((await deploy('OnchainAppDirectory',[group,'0x'+m.sha256],`moduleArchive${i}`)).target);}
      else functionalModules.push((await deploy('OnchainApp',[parts,'0x'+m.sha256],`moduleArchive${i}`)).target);
    }
    runtime=await deploy('OnchainModuleDirectory',[moduleConstructorEntries(archive.modules,functionalModules),manifest.shellIndex,'0x'+manifest.sha256]);
  }else{
    for(const [i,chunk] of archive.chunks.entries())chunks.push((await deploy('AppChunk',['0x'+chunk.toString('hex')],'chunk'+i)).target);
    if(archive.archiveVersion===2)for(const shard of archive.shards)leaves.push((await deploy('OnchainApp',[chunks.slice(shard.firstChunk,shard.firstChunk+shard.chunkCount),'0x'+shard.sha256],'runtimeLeaf'+shard.index)).target);
    runtime=archive.archiveVersion===2?await deploy('OnchainAppDirectory',[leaves,'0x'+manifest.sha256]):await deploy('OnchainApp',[chunks,'0x'+manifest.sha256]);
  }
  const resourceOutput=path.join(root,'onchain-app/privacy-worker');
  archivePrivacyResource({source:path.join(root,PRIVACY_RUNTIME.path),output:resourceOutput,expected:PRIVACY_RUNTIME});
  const privacy=await deployPrivacyResource({deploy,provider,manifestPath:path.join(resourceOutput,'manifest.json'),expected:PRIVACY_RUNTIME});
  const directory=await deploy('GenesisManifest');
  const renderer=await deploy('ConfluenceRenderer',[runtime.target,directory.target,privacy.resource]),router=await deploy('ProofRouter',[owner]),verifier=await deploy('ThresholdAttestationVerifier',[owner,1]),witness=await deploy('OmnichainWitnessRegistry',[owner]);
  await(await verifier.setSigner(owner,true)).wait();await(await router.setVerifier(1,verifier.target)).wait();
  const collection=await deploy('IDontFuckingBelieveIt',[owner,renderer.target,router.target,witness.target,owner,0]);
  const factory=await deploy('SovereignAccountFactory',[collection.target,router.target]);await(await collection.setAccountFactory(factory.target)).wait();
  const secret=keccak256(toUtf8Bytes('Anima Genesis local development fixture'));
  await(await collection.commitAwakening(await collection.commitmentFor(owner,secret,owner),{value:parseEther('25')})).wait();
  await rpc.request({method:'evm_mine',params:[]});await rpc.request({method:'evm_mine',params:[]});await(await collection.revealAwakening(secret,owner)).wait();
  const account=await collection.accountOf(1),ledger=await deploy('WorldLedger',[collection.target]);
  const market=await deploy('NativeMarket',[ledger.target]),vault=await deploy('TimeVault',[ledger.target]),launch=await deploy('GenesisLaunchpad',[ledger.target]);
  const memory=await deploy('MemoryLedger',[collection.target]),journal=await deploy('JournalSwapRouter',[memory.target,market.target]);await(await memory.installRouter(journal.target)).wait();
  const exit=await deploy('VestedExitVault',[collection.target,market.target]),cells=await deploy('ExperimentCellFactory');
  const editions=await deploy('EditionRegistry',[collection.target]),work=await deploy('CommissionEscrow'),gate=await deploy('ExperimentGate',[owner]),shelf=await deploy('BondedShelf',[gate.target,collection.target]);
  const gift=await deploy('ConsentGiftRouter',[ledger.target,market.target,vault.target]),instruments=await deploy('InstrumentRouter',[ledger.target,market.target,vault.target]);
  const binding=await deploy('ArtifactBinding',[collection.target]),cartridges=await deploy('CartridgeRegistry',[binding.target]),publisher=await deploy('CommissionedCartridges',[collection.target,work.target,cartridges.target]);
  const tracked=[publisher.target,exit.target,vault.target,editions.target,work.target,shelf.target,gift.target,instruments.target].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
  const commitments=await deploy('CommitmentIndex',[cells.target,tracked]),estate=await deploy('EstateExchange',[ledger.target,commitments.target]);
  // The market must be installed BEFORE sealing, otherwise completed sales cannot record activity.
  await(await ledger.configureEstateMarket(estate.target)).wait();await(await ledger.sealModules(market.target,vault.target,launch.target)).wait();
  await deploy('OwnerFeeRouter',[account,[account],[1]]);await deploy('OwnerLaunchFactory');
  await(await directory.publish(collection.target,[market.target,vault.target,memory.target,ledger.target,cartridges.target,exit.target])).wait();
  if(onPreview)onPreview(JSON.parse(Buffer.from((await collection.tokenURI(1,{gasLimit:90000000})).split(',')[1],'base64')));
  if(seedMarket){
    const now=(await provider.getBlock('latest')).timestamp;
    await(await launch.create('Genesis Local Light','LIGHT','Development-chain market',parseEther('1000000'),0,now+3700,parseEther('1'),parseEther('10'),0,10000,2592000,0)).wait();
    await(await launch.contribute(1,0,{value:parseEther('10')})).wait();await rpc.request({method:'evm_increaseTime',params:[3800]});await rpc.request({method:'evm_mine',params:[]});await(await launch.settle(1)).wait();
    modules.localToken=(await launch.launchInfo(1))[0];
    const nft=new Contract(account,loadArtifact('SovereignAccount').abi,signer),data=market.interface.encodeFunctionData('swap',['0x'+'0'.repeat(40),modules.localToken,parseEther('.1'),1,(await provider.getBlock('latest')).timestamp+600,1,0]);
    await(await nft.execute(market.target,parseEther('.1'),data)).wait();
  }
  const metadata=JSON.parse(Buffer.from((await collection.tokenURI(1,{gasLimit:90000000})).split(',')[1],'base64'));
  const sealed=[...await directory.modulesOf(collection.target)];if(sealed.some((v,i)=>v.toLowerCase()!==[market.target,vault.target,memory.target,ledger.target,cartridges.target,exit.target][i].toLowerCase()))throw Error('Sealed function manifest differs from deployed modules.');
  let rewritable=false;try{await directory.publish.staticCall(collection.target,sealed);rewritable=true;}catch{}if(rewritable)throw Error('Deployment manifest must be immutable after publication.');
  const animation=Buffer.from(metadata.animation_url.split(',')[1],'base64').toString();
  if(!animation.includes(privacy.resource.toLowerCase())||!animation.includes(directory.target.toLowerCase()))throw Error('Minted edition is missing its immutable resources.');
  if(!animation.includes(manifest.sha256)||!animation.includes('recoverArchive'))throw Error('NFT animation loader did not bind the runtime.');
  const recovered=await recoverArchive(args=>rpc.request(args),{runtime:runtime.target,chainId:31337,sha256:manifest.sha256,archiveVersion:archive.archiveVersion});
  if(recovered!==fs.readFileSync(path.join(root,'onchain-app/confluence/runtime.html'),'utf8'))throw Error('Onchain runtime recovery differs from the application.');
  const hashes={};for(const [name,address] of Object.entries(modules))hashes[name]=keccak256(await provider.getCode(address));
  return {schema:'anima.genesis/deployment/1',scope:'local development chain only',chainId:31337,owner,account,collection:collection.target,tokenId:'1',privacyResource:privacy,manifestSealed:true,runtimeSha256:manifest.sha256,archiveVersion:archive.archiveVersion,runtimeLeaves:leaves,functionalModules:functionalModules.map((address,i)=>({address,name:archive.modules[i].name,version:archive.modules[i].version,sha256:archive.modules[i].sha256})),runtimeBytes:manifest.byteLength,chunkCount:chunks.length,roundtripVerified:true,metadataParsed:true,compactLoaderRecoveryVerified:true,estateModuleInstalled:await ledger.estateMarket()===estate.target,modules,codeHashes:hashes};
}
