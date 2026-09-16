import fs from 'node:fs';
import path from 'node:path';
import {JsonRpcProvider,Wallet} from 'ethers';
import {BoundedOperator} from './operator.mjs';
import {ExactX402Buyer,PurchaseLedger,eip3009ReceiptVerifier} from './x402.mjs';
import {createAgentHost} from './host.mjs';

const file=process.argv[2];if(!file)throw Error('Usage: node agent/extensions/start-host.mjs CONFIG.json [--execute]');
const config=JSON.parse(fs.readFileSync(file,'utf8'));const dir=path.dirname(path.resolve(file));
const secret=name=>{const p=path.resolve(dir,name);if((fs.statSync(p).mode&0o077)!==0)throw Error('Secret files must have mode 0600');return fs.readFileSync(p,'utf8').trim();};
const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1});
if((await provider.getNetwork()).chainId!==BigInt(config.chainId))throw Error('Configured chain mismatch');
let operator,buyer;
if(config.operator){const o=config.operator;const signer=new Wallet(secret(o.signerFile),provider);operator=new BoundedOperator({...o,provider,signer,chainId:config.chainId,execute:process.argv.includes('--execute'),receipt:async record=>fs.appendFileSync(path.resolve(dir,o.receiptFile),JSON.stringify(record)+'\n',{mode:0o600})});}
if(config.payment){
  const p=config.payment;if(!process.argv.includes('--execute'))throw Error('Payment host requires explicit --execute; omit payment settings for operator simulation');
  const signer=new Wallet(secret(p.signerFile));
  const services=p.services??[];if(!services.length||services.some(s=>s.network!==`eip155:${config.chainId}`))throw Error('Payment services must use the configured chain');
  buyer=new ExactX402Buyer({signer,allowed:services,ledger:new PurchaseLedger(path.resolve(dir,p.ledgerFile),{budget:p.budget,maxPurchases:p.maxPurchases}),transport:fetch,verifySettlement:eip3009ReceiptVerifier(provider,{confirmations:p.confirmations??1})});
}
const server=createAgentHost({token:secret(config.accessTokenFile),allowedOrigins:config.allowedOrigins??[],operator,buyer,services:config.payment?.services??[],intervalMs:config.intervalMs??5000});
const port=config.port??8793;if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid host port');
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));process.stdout.write(`ANIMA agent host listening on loopback port ${port}. Secrets are never printed.\n`);
const shutdown=()=>server.close(()=>{provider.destroy();process.exit(0);});process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
