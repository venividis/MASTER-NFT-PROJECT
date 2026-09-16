// Offline only. There is deliberately no signer, RPC or broadcast option.
import fs from 'node:fs';
import path from 'node:path';
import {prepareModuleDeployment,verifyModuleDeploymentPlan} from './lib/modules-deployment.mjs';

const help=`Prepare an unsigned module-system plan for an existing native ANIMA collection:
  node scripts/modules-deployment.mjs --config modules-config.json --output modules-plan.json
Verify exact calldata against the current compiled source and workbench build:
  node scripts/modules-deployment.mjs --verify modules-plan.json

Configuration: {"chainId":11155111,"deployer":"0x...","startingNonce":0,"collection":"0x..."}
Supported chains: local 31337, Sepolia 11155111, Base Sepolia 84532.
Build the core contracts and module workbench first. For a combined Genesis + modules
plan, use the Genesis plan's predicted collection and its next unused EOA nonce.
No network requests, signatures, gas estimates or transactions are performed.`;

async function main() {
  const args=process.argv.slice(2),options={};
  if(args.length===1&&args[0]==='--help'){console.log(help);return;}
  for(let i=0;i<args.length;i+=2){if(!['--config','--output','--verify'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||options[args[i]])throw Error('Invalid arguments; use --help. There is no broadcast mode.');options[args[i]]=args[i+1];}
  if(options['--verify']) {
    if(Object.keys(options).length!==1)throw Error('--verify cannot be combined with other arguments');
    const plan=await verifyModuleDeploymentPlan(JSON.parse(fs.readFileSync(options['--verify'],'utf8')));
    console.log(JSON.stringify({verifiedAgainstCurrentBuild:true,planSha256:plan.planSha256,...plan.summary},null,2));return;
  }
  if(!options['--config']||!options['--output'])throw Error('--config and --output are required');
  const output=path.resolve(options['--output']);
  if(fs.existsSync(output))throw Error('Output already exists; choose a fresh filename');
  const plan=await prepareModuleDeployment(JSON.parse(fs.readFileSync(options['--config'],'utf8')));
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output,status:plan.status,planSha256:plan.planSha256,nextNonce:plan.nextNonce,modules:plan.modules,...plan.summary},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
