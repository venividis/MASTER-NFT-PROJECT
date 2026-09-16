#!/usr/bin/env node
/** Complete persistent local mint and module playground. Public networks are never contacted. */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import ganache from 'ganache';
import {BrowserProvider,Contract,keccak256,toUtf8Bytes} from 'ethers';
import {deployGenesis} from './lib/genesis-stack.mjs';
import {deployModuleSystem} from './lib/modules-stack.mjs';
import {loadArtifact} from './lib/deploy-stack.mjs';
import {verifyBuild} from './lib/runtime-graph.mjs';
import {verifyCompilation} from './lib/compiler-artifacts.mjs';
import {verifyV4Compilation} from './lib/v4-compilation.mjs';
import {sharedScorePackage,exampleModules} from '../web/modules/examples.mjs';
import {recoverRelease,recoverToken} from '../packages/modules/chain.mjs';
import {sha256} from '../packages/modules/sdk.mjs';

const root=path.resolve(import.meta.dirname,'..');process.chdir(root);
const args=process.argv.slice(2);if(args.some(a=>a!=='--once')||new Set(args).size!==args.length)throw Error('Usage: node scripts/master-local.mjs [--once]');
verifyCompilation(root);verifyV4Compilation(root);const build=verifyBuild(root);
const instance=process.env.MASTER_INSTANCE||'master';
if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(instance))throw Error('MASTER_INSTANCE must use 1–64 lowercase letters, digits or hyphens.');
const directory=path.join(root,'.local-genesis',instance);fs.mkdirSync(directory,{recursive:true});
const recordFile=path.join(directory,'deployment.json'),genesisFile=path.join(directory,'genesis.json');
const chainPort=Number(process.env.CHAIN_PORT||8545),webPort=Number(process.env.PORT||4173);
if(![chainPort,webPort].every(n=>Number.isInteger(n)&&n>=1024&&n<65536)||chainPort===webPort)throw Error('Choose distinct local ports between 1024 and 65535.');
const mnemonic='test test test test test test test test test test test junk';
const chain=ganache.server({chain:{chainId:31337,hardfork:'shanghai'},miner:{blockGasLimit:100000000},
  database:{dbPath:path.join(directory,'chain')},wallet:{mnemonic,totalAccounts:10,defaultBalance:10000},logging:{quiet:true}});
let provider,web,stopping=false;
const shutdown=async(code=0)=>{if(stopping)return;stopping=true;web?.kill('SIGTERM');provider?.destroy();await chain.close().catch(()=>{});process.exitCode=code;};
process.once('SIGINT',()=>shutdown());process.once('SIGTERM',()=>shutdown());
const save=(file,value)=>{const next=file+'.next';fs.writeFileSync(next,JSON.stringify(value,null,2)+'\n',{mode:0o600});const fd=fs.openSync(next,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(next,file);};
try {
  await chain.listen(chainPort,'127.0.0.1');provider=new BrowserProvider(chain.provider,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
  const signer=await provider.getSigner(),owner=(await signer.getAddress()).toLowerCase();
  let record;
  if(fs.existsSync(recordFile)) {
    record=JSON.parse(fs.readFileSync(recordFile,'utf8'));
    if(record.schema!=='anima.master-local/1'||record.chainId!==31337)throw Error('Existing local record has a different schema or chain.');
    for(const [name,address]of Object.entries(record.contracts))if(keccak256(await provider.getCode(address))!==record.codeHashes[name])throw Error('Saved contract differs from local chain: '+name);
    if(record.workbenchHash!==sha256(fs.readFileSync('onchain-app/module-workbench/index.html')))throw Error('Workbench source changed since this local deployment. Select a new MASTER_INSTANCE name to preserve this chain and deploy another edition.');
  } else {
    let genesis;
    if(fs.existsSync(genesisFile)) {
      genesis=JSON.parse(fs.readFileSync(genesisFile,'utf8'));
      for(const [name,address]of Object.entries(genesis.modules))if(keccak256(await provider.getCode(address))!==genesis.codeHashes[name])throw Error('Genesis checkpoint no longer matches '+name);
    } else {
      console.log('Minting the complete ANIMA application and its original protocols on local chain 31337…');
      genesis=await deployGenesis({rpc:chain.provider,provider,signer});save(genesisFile,genesis);
    }
    const journal=path.join(directory,'module-receipts.jsonl');
    if(fs.existsSync(journal))throw Error('An unfinished module deployment has a receipt journal. Recover and inspect it before preparing another deployment; no transactions were repeated.');
    console.log('Adding the immutable module system to the already minted ANIMA…');
    const workbenchBytes=fs.readFileSync('onchain-app/module-workbench/index.html'),started=performance.now();
    const system=await deployModuleSystem({provider,signer,collection:genesis.collection,workbenchBytes,journal});
    const shared=await system.publish(await sharedScorePackage({publisher:owner}));
    const examples=[];
    for(const packaged of await exampleModules({publisher:owner,sharedReleaseId:shared.releaseId})) {
      const published=await system.publish(packaged);await system.install(1,published,{});examples.push(published);
    }
    // This capacity fixture is confined to the local chain. Its extra bytes are never a deployment default.
    const original=fs.readFileSync('web/cartridges/lumen-drift.html','utf8');
    const padding=49152-Buffer.byteLength(original)-7;if(padding<0)throw Error('Capacity fixture source unexpectedly exceeds 48 KiB.');
    const html=original+'<!--'+' '.repeat(padding)+'-->',legacyBytes=Buffer.from(html),legacyArchive=await system.createArchive(legacyBytes,'legacy48KiB');
    const contentHash=sha256(legacyBytes),cartridgeManifest=JSON.stringify({spec:'awe.cartridge/1',name:'Lumen Drift · local capacity fixture',version:'1',engine:'html',entry:'sha256:'+contentHash.slice(2),contentHash,capabilities:[]});
    const receipt=await(await system.cartridges.publishRelease(cartridgeManifest,legacyArchive.chunks,contentHash)).wait();system.recordReceipt('publish legacy 48 KiB cartridge',receipt);
    const event=receipt.logs.map(log=>{try{return system.cartridges.interface.parseLog(log);}catch{return null;}}).find(e=>e?.name==='ReleasePublished');
    if(!event)throw Error('Cartridge release receipt is missing.');
    const account=new Contract(genesis.account,loadArtifact('SovereignAccount').abi,signer);
    const acquire=await(await account.execute(system.cartridges.target,0,system.cartridges.interface.encodeFunctionData('acquire',[event.args.releaseId]))).wait();system.recordReceipt('acquire cartridge through existing NFT',acquire);
    const acquired=acquire.logs.map(log=>{try{return system.cartridges.interface.parseLog(log);}catch{return null;}}).find(e=>e?.name==='CartridgeAcquired');
    if(!acquired)throw Error('Cartridge acquisition receipt is missing.');
    const request=payload=>chain.provider.request(payload),recoveryStarted=performance.now();
    for(const example of examples){const recovered=await recoverRelease({request,registry:system.releases.target,releaseId:example.releaseId,chainId:31337});if(recovered.manifest.name!==example.manifest.name)throw Error('Example recovery differs from publication.');}
    const recovered=await recoverToken({request,registry:system.modules.target,tokenId:1,chainId:31337});
    const contracts={...genesis.modules,...system.contracts},codeHashes={};for(const [name,address]of Object.entries(contracts))codeHashes[name]=keccak256(await provider.getCode(address));
    record={schema:'anima.master-local/1',scope:'local chain only; no public funds or deployment',chainId:31337,owner,collection:genesis.collection,tokenId:'1',account:genesis.account,
      contracts,codeHashes,registry:system.modules.target,releaseRegistry:system.releases.target,stateStore:system.contracts.ModuleStateStore,workbench:system.workbench.target,workbenchHash:sha256(workbenchBytes),
      sharedRelease:shared.releaseId,examples:examples.map(e=>({name:e.manifest.name,releaseId:e.releaseId,moduleKey:e.moduleKey,archive:e.archive})),
      cartridge:{registry:system.cartridges.target,id:acquired.args.id.toString(),contentHash,bytes:legacyBytes.length},
      verification:{originalRuntimeRoundtrip:genesis.roundtripVerified,moduleRecovery:true,tokenRecovery:!!recovered,legacyContentHash:sha256(Buffer.from((await system.cartridges.contentOf(acquired.args.id)).slice(2),'hex'))===contentHash},
      measurements:{scope:'Local Node/Ganache observation; not browser memory or public-chain fees',recoveryMilliseconds:Math.round(performance.now()-recoveryStarted),moduleSetupMilliseconds:Math.round(performance.now()-started),processMemoryBytes:process.memoryUsage(),workbenchBytes:workbenchBytes.length,examples:examples.map(e=>({name:e.manifest.name,storedBytes:e.storedBytes,deployedChunkCount:e.deployedChunkCount,reusedChunkCount:e.reusedChunkCount}))},
      buildManifestSha256:sha256(fs.readFileSync('dist/build-manifest.json'))};
    save(recordFile,record);
  }
  const url=new URL('http://127.0.0.1:'+webPort+'/modules.html');
  for(const [key,value]of Object.entries({registry:record.registry,collection:record.collection,chainId:31337,tokenId:1}))url.searchParams.set(key,String(value));
  console.log(JSON.stringify({original:'http://127.0.0.1:'+webPort,workbench:url.href,rpc:'http://127.0.0.1:'+chainPort,record:path.relative(root,recordFile),...record},null,2));
  if(args.includes('--once'))await shutdown();
  else {
    web=spawn(process.execPath,['scripts/serve-confluence.mjs'],{cwd:root,env:{...process.env,PORT:String(webPort)},stdio:'inherit'});
    web.once('error',error=>{console.error(error.message);shutdown(1);});web.once('exit',code=>{if(!stopping)shutdown(code||0);});
    console.log('Use a separate local-only wallet with this PUBLIC DEVELOPMENT mnemonic; never fund it on a public chain:\n'+mnemonic);
  }
} catch(error) {console.error(error.stack||error.message);await shutdown(1);}
