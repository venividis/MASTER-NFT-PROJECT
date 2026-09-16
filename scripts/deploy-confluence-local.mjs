/** Full executable local fixture. Never accepts a public RPC or private key. */
import fs from 'node:fs';import ganache from 'ganache';import {BrowserProvider} from 'ethers';
import {deployGenesis} from './lib/genesis-stack.mjs';
const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},miner:{blockGasLimit:100000000},wallet:{totalAccounts:3,defaultBalance:10000},logging:{quiet:true}});
const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
try{
 const evidence=await deployGenesis({rpc,provider,signer:await provider.getSigner(),onPreview:metadata=>{fs.mkdirSync('docs/genesis',{recursive:true});fs.writeFileSync('docs/genesis/mint-thumbnail.svg',Buffer.from(metadata.image.split(',')[1],'base64'));}});
 fs.mkdirSync('reports/implementation-6.2',{recursive:true});fs.writeFileSync('reports/implementation-6.2/local-deployment.json',JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({scope:evidence.scope,chunks:evidence.chunkCount,runtimeBytes:evidence.runtimeBytes,metadataParsed:evidence.metadataParsed,roundtripVerified:evidence.roundtripVerified,estateModuleInstalled:evidence.estateModuleInstalled,modules:Object.keys(evidence.modules).length}));
}finally{provider.destroy();await rpc.disconnect();}
