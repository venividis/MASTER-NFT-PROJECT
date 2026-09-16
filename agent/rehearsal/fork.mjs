import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {JsonRpcProvider} from 'ethers';

// Every call sent to the source chain is read-only. Fork writes terminate locally.
const READS=new Set(['eth_chainId','net_version','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getBalance','eth_getTransactionCount','eth_getCode','eth_getStorageAt','eth_getProof','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getLogs','eth_call','eth_gasPrice','eth_getBlockReceipts']);
export async function readonlyProxy(upstream){
  const secret=randomBytes(24).toString('hex');
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.method!=='POST'||req.url!=='/'+secret)throw Error('route');
      const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>65536)throw Error('size');chunks.push(c);}
      const payload=JSON.parse(Buffer.concat(chunks)),items=Array.isArray(payload)?payload:[payload];
      if(items.length>64||items.some(x=>!READS.has(x.method)))throw Error('read only');
      const result=await Promise.all(items.map(async p=>{try{return {jsonrpc:'2.0',id:p.id,result:await upstream.request({method:p.method,params:p.params||[]})};}catch{return {jsonrpc:'2.0',id:p.id,error:{code:-32000,message:'Source read failed'}};}}));
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify(Array.isArray(payload)?result:result[0]));
    }catch{res.writeHead(403).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  return {url:`http://127.0.0.1:${server.address().port}/${secret}`,close:()=>new Promise(r=>{server.closeAllConnections();server.close(r);})};
}
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;}
export async function createFork(upstream,block,chainId){
  const proxy=await readonlyProxy(upstream),port=await freePort();
  const binary=path.resolve(import.meta.dirname,'../../integrations/console/protocol/v4-hook/node_modules/@foundry-rs/anvil/bin.mjs');
  const child=spawn(process.execPath,[binary,'--host','127.0.0.1','--port',String(port),'--fork-url',proxy.url,'--fork-block-number',String(block),'--chain-id',String(chainId),'--hardfork','cancun','--silent'],{stdio:'ignore'});
  let launchError=false;child.once('error',()=>launchError=true);
  const provider=new JsonRpcProvider(`http://127.0.0.1:${port}`,Number(chainId),{staticNetwork:true,cacheTimeout:-1});provider.pollingInterval=10;
  const close=async()=>{provider.destroy();child.kill('SIGTERM');await proxy.close();};
  try{
    let ready=false;for(let n=0;n<100;n++){
      if(launchError||child.exitCode!==null)throw Error('Local fork process did not start. Install the pinned Anvil dependency.');
      try{const r=await fetch(`http://127.0.0.1:${port}`,{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_blockNumber',params:[]}),headers:{'content-type':'application/json'},signal:AbortSignal.timeout(500)});if(BigInt((await r.json()).result)===BigInt(block)){ready=true;break;}}catch{}
      await new Promise(r=>setTimeout(r,100));
    }
    if(!ready)throw Error('Local fork could not load the pinned block.');
    return {provider,close};
  }catch(error){await close();throw error;}
}
