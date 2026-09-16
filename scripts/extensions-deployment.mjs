import fs from 'node:fs';
import path from 'node:path';
import {JsonRpcProvider} from 'ethers';
import {prepareExtensionsDeployment,verifyExtensionsDeploymentPlan,verifyExtensionsDeploymentReceipts} from './lib/extensions-deployment.mjs';

const args=process.argv.slice(2),usage='Usage: node scripts/extensions-deployment.mjs prepare CONFIG.json OUTPUT.json | verify PLAN.json | inspect PLAN.json RECEIPTS.json RPC_ENV_VAR DIRECTORY.json';
if(args[0]==='prepare'&&args.length===3){
 const config=JSON.parse(fs.readFileSync(path.resolve(args[1]),'utf8')),plan=await prepareExtensionsDeployment(config),output=path.resolve(args[2]);
 if(output===path.resolve(args[1]))throw Error('Choose a separate plan output file.');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:plan.status,planHash:plan.planHash,...plan.summary,output},null,2));
}else if(args[0]==='verify'&&args.length===2){
 const plan=await verifyExtensionsDeploymentPlan(JSON.parse(fs.readFileSync(path.resolve(args[1]),'utf8')));console.log(JSON.stringify({verified:true,planHash:plan.planHash,...plan.summary},null,2));
}else if(args[0]==='inspect'&&args.length===5){
 if(!/^[A-Z][A-Z0-9_]*$/.test(args[3]))throw Error('Supply the name of an explicitly configured RPC environment variable.');
 const rpc=process.env[args[3]];if(!rpc)throw Error('The chosen RPC environment variable is empty.');const url=new URL(rpc);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Use an HTTP(S) RPC URL without embedded user/password credentials.');
 const plan=JSON.parse(fs.readFileSync(path.resolve(args[1]),'utf8')),receipts=JSON.parse(fs.readFileSync(path.resolve(args[2]),'utf8')),output=path.resolve(args[4]);if([args[1],args[2]].some(x=>path.resolve(x)===output))throw Error('Choose a separate directory output file.');
 const provider=new JsonRpcProvider(rpc);try{const directory=await verifyExtensionsDeploymentReceipts(plan,provider,receipts);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(directory,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({schema:directory.schema,chainId:directory.chainId,blockNumber:directory.blockNumber,modules:Object.keys(directory.modules).length,output},null,2));}finally{provider.destroy();}
}else throw Error(usage);
