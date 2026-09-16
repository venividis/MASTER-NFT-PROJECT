import fs from 'node:fs';
import {Contract,JsonRpcProvider,getCreateAddress,getAddress,zeroPadValue} from '../../node_modules/ethers/lib.esm/index.js';
import {bridgeDeploymentPlan,inspectLane,deliveryRecord} from '../../web/crosschain/client.mjs';
const [command,configFile,planFile,sourceHash]=process.argv.slice(2);
if(!['plan','verify','receipt'].includes(command)||!configFile||!planFile)throw Error('Usage: node packages/crosschain/deployment.mjs plan|verify|receipt config.json plan.json [source-transaction-hash]');
const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
const a=new JsonRpcProvider(config.sourceRPC,undefined,{cacheTimeout:-1}),b=new JsonRpcProvider(config.destinationRPC,undefined,{cacheTimeout:-1});
try {
 if((await a.getNetwork()).chainId!==BigInt(config.sourceChainId)||(await b.getNetwork()).chainId!==BigInt(config.destinationChainId)||String(config.sourceChainId)===String(config.destinationChainId))throw Error('RPC chain identities do not match the two configured chains.');
 let plan;
 if(command==='plan'){
  const abi=['function endpoint() view returns(address)','function peers(uint32) view returns(bytes32)','function token() view returns(address)'];
  const oftA=new Contract(config.sourceOFT,abi,a),oftB=new Contract(config.destinationOFT,abi,b);
  const endpointA=await oftA.endpoint(),endpointB=await oftB.endpoint(),endpointABI=['function eid() view returns(uint32)'];
  const sourceEid=await new Contract(endpointA,endpointABI,a).eid(),destinationEid=await new Contract(endpointB,endpointABI,b).eid();
  const sourcePeer=zeroPadValue(getAddress(config.sourceOFT),32),destinationPeer=zeroPadValue(getAddress(config.destinationOFT),32);
  if((await oftA.peers(destinationEid)).toLowerCase()!==destinationPeer.toLowerCase()||(await oftB.peers(sourceEid)).toLowerCase()!==sourcePeer.toLowerCase())throw Error('The token issuer has not wired this reciprocal OFT path. Configure it through the issuer before planning ANIMA contracts.');
  const sourceNonce=await a.getTransactionCount(config.sourceDeployer,'pending'),destinationNonce=await b.getTransactionCount(config.destinationDeployer,'pending');
  const sourceAddress=getCreateAddress({from:config.sourceDeployer,nonce:sourceNonce}),composerAddress=getCreateAddress({from:config.destinationDeployer,nonce:destinationNonce});
  const source=await bridgeDeploymentPlan('AnimaOFTSource',[config.sourceOFT,destinationEid,composerAddress,destinationPeer],{chainId:config.sourceChainId,sender:config.sourceDeployer,nonce:sourceNonce});
  const destination=await bridgeDeploymentPlan('AnimaOFTComposer',[endpointB,config.destinationOFT,sourceEid,zeroPadValue(sourceAddress,32),sourcePeer,config.timeVault||'0x0000000000000000000000000000000000000000'],{chainId:config.destinationChainId,sender:config.destinationDeployer,nonce:destinationNonce});
  plan={schema:'anima.oft-lane-deployment/1',sourceAddress,composerAddress,source,destination,notice:'Unsigned independent deployments. A different deployer nonce changes the address: regenerate both plans if either nonce changes. Public DVN/executor configuration and funding are separate.'};
  fs.writeFileSync(planFile,JSON.stringify(plan,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');console.log('Saved unsigned two-chain deployment plan: '+planFile);
 } else {
  plan=JSON.parse(fs.readFileSync(planFile,'utf8'));const lane=await inspectLane(a,{sourceAddress:plan.sourceAddress,destinationProvider:b,destinationChainId:config.destinationChainId});
  const result=command==='receipt'?await deliveryRecord(lane,sourceHash):{verified:true,sourceChain:lane.sourceChain,destinationChain:lane.destinationChain,sourceAddress:lane.sourceAddress,composerAddress:lane.composerAddress,sourceOFT:lane.oftAddress,destinationOFT:lane.destOFT,sendLibrary:lane.sendLibrary,receiveLibrary:lane.receiveLibrary,trust:lane.trust};
  console.log(JSON.stringify(result,(_,v)=>typeof v==='bigint'?String(v):v,2));
 }
} finally {await a.destroy();await b.destroy();}
