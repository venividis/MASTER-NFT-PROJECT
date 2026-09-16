/** Offline CREATE2 search only. Never loads a key, wallet, RPC or sends a transaction. */
import fs from 'node:fs';
import path from 'node:path';
import {keccak256,bytesOf,abiEncode} from '../web/evm.mjs';
const [deployer,manager,market,maximum='250000',start='0']=process.argv.slice(2);
function addr(x){if(!/^0x[0-9a-fA-F]{40}$/.test(x||'')||/^0x0{40}$/.test(x))throw Error('Expected nonzero deployer, manager and market addresses.');return x.slice(2).toLowerCase();}
try{
 const d=addr(deployer);addr(manager);addr(market);
 const max=Number(maximum),first=BigInt(start);
 if(!Number.isSafeInteger(max)||max<1||max>10000000||first<0n||first+BigInt(max)>1n<<256n)throw Error('Invalid search bounds.');
 const root=path.resolve(import.meta.dirname,'..');
 const artifact=JSON.parse(fs.readFileSync(path.join(root,'contracts/artifacts/PhoenixLaunchHook.json'),'utf8'));
 if(!/^0x[0-9a-fA-F]+$/.test(artifact.bytecode||''))throw Error('Compile the hook first; no valid bytecode artifact exists.');
 const initCode=artifact.bytecode+abiEncode(['address','address'],[manager,market]).slice(2);
 const initHash=keccak256(bytesOf(initCode));
 for(let i=0;i<max;i++){
   const salt='0x'+(first+BigInt(i)).toString(16).padStart(64,'0');
   const address='0x'+keccak256(bytesOf('0xff'+d+salt.slice(2)+initHash.slice(2))).slice(-40);
   if((BigInt(address)&0x3fffn)===0x22c0n){
     console.log(JSON.stringify({status:'OFFLINE ADDRESS CANDIDATE ONLY',deployer,manager,market,salt,address,requiredFlags:'0x22c0',initCodeHash:initHash,initCode,attempts:i+1},null,2));process.exit(0);
   }
 }
 throw Error('No matching salt in the requested range. Repeat with a new start. Nothing was deployed.');
}catch(e){console.error(e.message);console.error('Usage: npm run hook:mine -- <HookDeployer> <PoolManager> <V4GenesisMarket> [maxTries] [startSalt]');process.exitCode=1;}
