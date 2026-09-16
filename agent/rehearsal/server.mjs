import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {JsonRpcProvider,FetchRequest} from 'ethers';
import {rehearse} from './engine.mjs';

export function createRehearsalServer({upstream,token,origins=['http://127.0.0.1:4173','http://localhost:4173','https://anima-genesis.edwincardenas.chatgpt.site'],execute=rehearse}){
  if(!token||token.length<32)throw Error('A session token of at least 32 characters is required.');let busy=false;
  return http.createServer(async(req,res)=>{
    const origin=req.headers.origin,allowed=!origin||origins.includes(origin);
    const headers={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','vary':'Origin'};
    if(origin&&allowed)Object.assign(headers,{'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, content-type','access-control-allow-private-network':'true'});
    const reply=(code,body)=>res.writeHead(code,headers).end(JSON.stringify(body));
    if(!allowed)return reply(403,{error:'Origin is not allowed.'});
    if(req.method==='OPTIONS')return reply(204,{});
    const supplied=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+token);
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply(401,{error:'Unlock the local rehearsal connection.'});
    if(req.method!=='POST'||req.url!=='/rehearse')return reply(404,{error:'Unknown route.'});
    if(busy)return reply(409,{error:'A rehearsal is already running.'});busy=true;
    try{
      const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>65536)throw Error('size');chunks.push(chunk);}
      const result=await execute(upstream,JSON.parse(Buffer.concat(chunks)));reply(200,result);
    }catch{reply(422,{error:'Rehearsal could not execute this supported public NFT intent. Check chain, custody, terms, source RPC and the local Anvil installation.'});}
    finally{busy=false;}
  });
}
if(process.argv[1]===import.meta.filename){
  const rpc=process.env.ANIMA_REHEARSAL_RPC;if(!rpc)throw Error('Set ANIMA_REHEARSAL_RPC to your source-chain RPC.');
  const url=new URL(rpc);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('Use HTTPS or a local development RPC.');
  const request=new FetchRequest(rpc);request.timeout=12000;
  const provider=new JsonRpcProvider(request,undefined,{cacheTimeout:-1}),upstream={request:({method,params})=>provider.send(method,params)},token=randomBytes(32).toString('hex');
  const server=createRehearsalServer({upstream,token,origins:process.env.ANIMA_REHEARSAL_ORIGINS?.split(',')});
  const port=Number(process.env.ANIMA_REHEARSAL_PORT||8788);
  server.listen(port,'127.0.0.1',()=>console.log(`Local rehearsal: http://127.0.0.1:${port}\nSession token (paste into your own app session): ${token}\nNo signing key is used. Source RPC credentials are not printed or sent to the browser.`));
  const stop=()=>{server.closeAllConnections();server.close();provider.destroy();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
