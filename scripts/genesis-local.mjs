#!/usr/bin/env node
/** Persistent local development chain. No public RPC, real funds or remote signing. */
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';
import ganache from 'ganache';import {BrowserProvider,keccak256} from 'ethers';
import {deployGenesis} from './lib/genesis-stack.mjs';
const root=path.resolve(import.meta.dirname,'..');process.chdir(root);
const directory=path.join(root,'.local-genesis');fs.mkdirSync(directory,{recursive:true});
const recordPath=path.join(directory,'deployment.json'),chainPort=Number(process.env.CHAIN_PORT||8545),webPort=Number(process.env.PORT||4173);
if(![chainPort,webPort].every(n=>Number.isInteger(n)&&n>1023&&n<65536)||chainPort===webPort)throw Error('Choose distinct local ports from 1024 to 65535.');
const phrase='test test test test test test test test test test test junk';
const chain=ganache.server({chain:{chainId:31337,hardfork:'shanghai'},miner:{blockGasLimit:100000000},database:{dbPath:path.join(directory,'chain')},wallet:{mnemonic:phrase,totalAccounts:10,defaultBalance:10000},logging:{quiet:true}});
let web,provider,stopping=false;
const shutdown=async(code=0)=>{if(stopping)return;stopping=true;web?.kill('SIGTERM');provider?.destroy();await chain.close().catch(()=>{});process.exitCode=code;};
process.once('SIGINT',()=>shutdown());process.once('SIGTERM',()=>shutdown());
try{
 await chain.listen(chainPort,'127.0.0.1');provider=new BrowserProvider(chain.provider,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 let record;
 if(fs.existsSync(recordPath)){
  record=JSON.parse(fs.readFileSync(recordPath,'utf8'));
  if(record.schema!=='anima.genesis/deployment/1'||record.chainId!==31337)throw Error('Local deployment record is not compatible.');
  for(const [name,address] of Object.entries(record.modules))if(keccak256(await provider.getCode(address))!==record.codeHashes[name])throw Error('Local chain no longer matches the saved '+name+'. Preserve your data and inspect the local chain.');
 }else{
  console.log('Creating local Genesis: onchain application, NFT, protocols and a funded test market…');
  record=await deployGenesis({rpc:chain.provider,provider,signer:await provider.getSigner()});fs.writeFileSync(recordPath,JSON.stringify(record,null,2)+'\n',{mode:0o600});
 }
 web=spawn(process.execPath,['scripts/serve-confluence.mjs'],{cwd:root,env:{...process.env,PORT:String(webPort)},stdio:'inherit'});
 web.once('error',e=>{console.error(e.message);shutdown(1);});web.once('exit',code=>{if(!stopping)shutdown(code||0);});
 console.log(JSON.stringify({interface:'http://127.0.0.1:'+webPort,rpc:'http://127.0.0.1:'+chainPort,chainId:31337,owner:record.owner,collection:record.collection,tokenId:record.tokenId,account:record.account,modules:record.modules,record:'.local-genesis/deployment.json'},null,2));
 console.log('Import this PUBLIC DEVELOPMENT mnemonic into a separate test-only wallet. Select its first account:\n'+phrase+'\nNever send real funds to these publicly known test accounts. The chain and balances persist when you stop.');
}catch(error){console.error(error.shortMessage||error.message);await shutdown(1);}
