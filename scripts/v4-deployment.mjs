// Build reviewable deployment transactions. Sending requires the explicit --broadcast flag.
import fs from 'node:fs';import path from 'node:path';import {JsonRpcProvider,Wallet,ContractFactory,getAddress,getCreateAddress,keccak256} from 'ethers';
import {V4_NETWORKS,verifyContract} from '../web/v4/client.mjs';
import {verifyV4Compilation} from './lib/v4-compilation.mjs';
const root=path.resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
const value=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
if(args.includes('--help')){console.log('Prepare: ANIMA_V4_RPC=https://… node scripts/v4-deployment.mjs --chain 1 --deployer 0x… --output v4-deployment-plan.json\nBroadcast a reviewed plan: ANIMA_V4_RPC=https://… ANIMA_V4_DEPLOYER_KEY=… node scripts/v4-deployment.mjs --broadcast --plan v4-deployment-plan.json\nNo RPC URL or private key is written into the plan. Public deployments expose the deployer and contract addresses.');process.exit(0);}
verifyV4Compilation(root);
async function main(){
const rpc=process.env.ANIMA_V4_RPC;if(!rpc)throw Error('Set ANIMA_V4_RPC. Use --help for instructions.');
const url=new URL(rpc);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error('Use HTTPS or a local loopback RPC.');
const provider=new JsonRpcProvider(rpc,undefined,{cacheTimeout:-1});
const artifact=name=>JSON.parse(fs.readFileSync(path.join(root,'integrations/console/protocol/v4-hook/artifacts',name+'.json')));
try{
 const chain=Number((await provider.getNetwork()).chainId),official=V4_NETWORKS[chain];
 if(!official&&chain!==31337)throw Error('Unsupported deployment chain.');
 if(!args.includes('--broadcast')){
  if(chain!==Number(value('--chain')))throw Error('RPC chain does not match --chain.');
  const manager=getAddress(official?.manager||value('--manager')),deployer=getAddress(value('--deployer'));
  if(await provider.getCode(manager)==='0x')throw Error('PoolManager has no code.');if(await provider.getCode(deployer)!=='0x')throw Error('This deployment tool expects a normal EOA deployer.');
  const nonce=await provider.getTransactionCount(deployer,'pending'),feeData=await provider.getFeeData(),requests=[];
  for(const [index,name] of ['GenesisV4Launchpad','GenesisV4Router'].entries()){
   const a=artifact(name),factory=new ContractFactory(a.abi,a.bytecode),request=await factory.getDeployTransaction(manager);
   const gas=await provider.estimateGas({...request,from:deployer});
   const fees=feeData.maxFeePerGas?{type:2,maxFeePerGas:feeData.maxFeePerGas.toString(),maxPriorityFeePerGas:(feeData.maxPriorityFeePerGas||0n).toString()}:{type:0,gasPrice:feeData.gasPrice?.toString()};
   if(!fees.maxFeePerGas&&!fees.gasPrice)throw Error('RPC returned no usable gas price.');
   requests.push({name,address:getCreateAddress({from:deployer,nonce:nonce+index}),transaction:{chainId:chain,nonce:nonce+index,data:request.data,value:'0',gasLimit:(gas*120n/100n).toString(),...fees},creationHash:keccak256(request.data)});
  }
  const plan={schema:'anima.v4-deployment/1',created:Date.now(),chainId:chain,deployer,manager,requests,maximumGasCostWei:requests.reduce((n,r)=>n+BigInt(r.transaction.gasLimit)*BigInt(r.transaction.maxFeePerGas||r.transaction.gasPrice),0n).toString(),scope:'Unsigned deployment plan; no public transaction submitted'};
  const output=path.resolve(value('--output')||'v4-deployment-plan.json');fs.writeFileSync(output,JSON.stringify(plan,null,2)+'\n');console.log(JSON.stringify({plan:output,chainId:chain,deployer,manager,contracts:requests.map(r=>({name:r.name,address:r.address})),maximumGasCostWei:plan.maximumGasCostWei}));
 }else{
  const plan=JSON.parse(fs.readFileSync(value('--plan'),'utf8'));if(plan.schema!=='anima.v4-deployment/1'||plan.chainId!==chain||!Array.isArray(plan.requests)||plan.requests.length!==2)throw Error('Invalid deployment plan.');
  if(!Number.isSafeInteger(plan.created)||plan.created>Date.now()||Date.now()-plan.created>1800000)throw Error('Invalid or expired plan. Prepare and review current gas and nonce terms.');
  const signer=new Wallet(process.env.ANIMA_V4_DEPLOYER_KEY||'',provider);if(signer.address!==getAddress(plan.deployer))throw Error('Signing key does not match the reviewed deployer.');
  const manager=getAddress(official?.manager||plan.manager);if(manager!==getAddress(plan.manager))throw Error('PoolManager changed.');
  if(await provider.getCode(manager)==='0x')throw Error('PoolManager has no code.');
  const startingNonce=await provider.getTransactionCount(signer.address,'pending');
  const approved=[];let maximumGasCost=0n;
  // Validate BOTH complete requests before the first broadcast. Only reconstructed,
  // allowlisted transaction fields reach the signer; JSON extras never do.
  for(const [index,r] of plan.requests.entries()){
   const name=['GenesisV4Launchpad','GenesisV4Router'][index],a=artifact(name),expected=await new ContractFactory(a.abi,a.bytecode).getDeployTransaction(manager);
   if(r.name!==name||r.transaction.data!==expected.data||keccak256(expected.data)!==r.creationHash||BigInt(r.transaction.value)!==0n||Number(r.transaction.chainId)!==chain||r.transaction.to)throw Error('Deployment request does not match this build.');
   if(r.transaction.nonce!==startingNonce+index)throw Error('Deployer nonce changed. Prepare a fresh plan.');
   const predicted=getCreateAddress({from:signer.address,nonce:r.transaction.nonce});if(predicted!==getAddress(r.address))throw Error('Predicted deployment address changed.');
   const gasLimit=BigInt(r.transaction.gasLimit),type=r.transaction.type;
   if(gasLimit<=0n||gasLimit>30000000n||![0,2].includes(type))throw Error('Invalid gas budget or transaction type.');
   const fees=type===2?{maxFeePerGas:BigInt(r.transaction.maxFeePerGas),maxPriorityFeePerGas:BigInt(r.transaction.maxPriorityFeePerGas)}:{gasPrice:BigInt(r.transaction.gasPrice)};
   const price=fees.maxFeePerGas??fees.gasPrice;if(price<=0n||price>10n**15n||(type===2&&(fees.maxPriorityFeePerGas<0n||fees.maxPriorityFeePerGas>price)))throw Error('Invalid fee budget.');
   maximumGasCost+=gasLimit*price;
   approved.push({name,predicted,transaction:{chainId:chain,nonce:r.transaction.nonce,data:expected.data,value:0n,gasLimit,type,...fees}});
  }
  if(maximumGasCost!==BigInt(plan.maximumGasCostWei))throw Error('Maximum gas cost does not match the reviewed plan.');
  if(await provider.getBalance(signer.address)<maximumGasCost)throw Error('Deployer balance cannot cover both reviewed deployment budgets.');
  const receipts=[];
  for(const {name,predicted,transaction} of approved){
   if(await provider.getTransactionCount(signer.address,'pending')!==transaction.nonce)throw Error('Deployer nonce changed. Stop and review any confirmed deployments.');
   const sent=await signer.sendTransaction(transaction),receipt=await sent.wait();if(receipt?.status!==1||getAddress(receipt.contractAddress)!==predicted)throw Error('Deployment did not confirm as expected.');
   await verifyContract(provider,predicted,name,manager);receipts.push({name,address:predicted,hash:sent.hash,block:receipt.blockNumber});console.log(JSON.stringify(receipts.at(-1)));
  }
  const config={chainId:chain,manager,factory:receipts[0].address,router:receipts[1].address,receipts};const output=path.resolve(value('--output')||'v4-deployed-addresses.json');fs.writeFileSync(output,JSON.stringify(config,null,2)+'\n');
 }
}finally{provider.destroy();}
}
main().catch(()=>{console.error('Deployment stopped. Check the plan, RPC chain, nonce, gas budget, account balance and signing-key configuration. Inspect any transaction hashes already printed before retrying. Provider error details are suppressed to keep credentials out of logs.');process.exitCode=1;});
