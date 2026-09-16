import fs from 'node:fs';
import path from 'node:path';
import {JsonRpcProvider,Wallet,keccak256,toUtf8Bytes} from 'ethers';
import {BoundedOperator} from './operator.mjs';

// Explicit host process only. This program exposes no HTTP server and accepts no remote RPC override.
const configPath=process.argv[2];if(!configPath)throw Error('Usage: node agent/extensions/run-operator.mjs CONFIG.json [--execute]');
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
const rpc=new URL(config.rpcUrl);if(!['http:','https:'].includes(rpc.protocol)||rpc.username||rpc.password||rpc.hash)throw Error('Invalid configured RPC URL');
const secretPath=path.resolve(path.dirname(configPath),config.signerFile);
if((fs.statSync(secretPath).mode&0o077)!==0)throw Error('Signer file must have mode 0600');
const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1});
const signer=new Wallet(fs.readFileSync(secretPath,'utf8').trim(),provider);
const journal=path.resolve(path.dirname(configPath),config.receiptFile);
let head='0x'+'00'.repeat(32);
if(fs.existsSync(journal))for(const line of fs.readFileSync(journal,'utf8').trim().split('\n').filter(Boolean)){const record=JSON.parse(line);const {hash,...body}=record;if(body.previous!==head||keccak256(toUtf8Bytes(JSON.stringify(body)))!==hash)throw Error('Receipt journal integrity check failed');head=hash;}
const receipt=async event=>{const body={previous:head,...event};head=keccak256(toUtf8Bytes(JSON.stringify(body)));fs.appendFileSync(journal,JSON.stringify({...body,hash:head})+'\n',{mode:0o600});process.stdout.write(JSON.stringify(event)+'\n');};
let propose;
if(config.proposalEndpoint){
  const endpoint=new URL(config.proposalEndpoint);if(endpoint.protocol!=='https:'&&!['127.0.0.1','[::1]'].includes(endpoint.hostname))throw Error('Proposal service must use HTTPS or loopback');
  propose=async snapshot=>{const response=await fetch(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json'},body:JSON.stringify(snapshot)});if(!response.ok)throw Error('Proposal provider failed');const text=await response.text();if(text.length>32768)throw Error('Proposal too large');return JSON.parse(text);};
}
const controller=new AbortController();process.on('SIGINT',()=>controller.abort());process.on('SIGTERM',()=>controller.abort());
const operator=new BoundedOperator({...config,provider,signer,propose,receipt,execute:process.argv.includes('--execute')});
try{await operator.run({signal:controller.signal,intervalMs:config.intervalMs??5000,maxTicks:config.maxTicks??Infinity});}catch{process.stderr.write('Operator stopped: authorization, transport or execution check failed. Inspect onchain grant and receipt journal before restart.\n');process.exitCode=1;}finally{provider.destroy();}
