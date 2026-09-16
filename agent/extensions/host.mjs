import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';

/** Authenticated configured host. Request bodies never select RPC, signer, payee or arbitrary URLs. */
export function createAgentHost({token,allowedOrigins=[],buyer,operator,services=[],intervalMs=5000}){
  if(typeof token!=='string'||token.length<32)throw Error('Host access token must have at least 32 characters');
  if(!Number.isInteger(intervalMs)||intervalMs<1000||intervalMs>60000)throw Error('Invalid host polling interval');
  const scopes=structuredClone(services);const origins=new Set(allowedOrigins);const reviews=new Map();let loop,loopState='stopped';
  const secret=Buffer.from(`Bearer ${token}`);
  const equal=value=>{const presented=Buffer.from(value??'');return presented.length===secret.length&&timingSafeEqual(presented,secret);};
  const server=http.createServer(async(req,res)=>{
    const origin=req.headers.origin;
    const headers={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'};
    const respond=(status,data)=>{res.writeHead(status,headers);res.end(JSON.stringify(data,(_,v)=>typeof v==='bigint'?String(v):v));};
    if(origin){if(!origins.has(origin))return respond(403,{error:'Origin is not configured'});Object.assign(headers,{'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'Authorization, Content-Type'});}
    if(req.method==='OPTIONS')return respond(204,{});
    if(!equal(req.headers.authorization))return respond(401,{error:'Host authentication required'});
    try{
      let body={};if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)throw Error('Request too large');}body=JSON.parse(raw||'{}');}
      const url=new URL(req.url,'http://127.0.0.1');
      if(req.method==='GET'&&url.pathname==='/status')return respond(200,{operator:{configured:!!operator,state:loopState,executes:operator?.execute??false},services:scopes.map((s,id)=>({id,label:s.label,url:s.url,network:s.network,asset:s.asset,payTo:s.payTo,maxAmount:s.maxAmount,maxTimeoutSeconds:s.maxTimeoutSeconds,method:s.method??'GET'})),payment:{configured:!!buyer,budget:String(buyer?.ledger?.budget??0),maxPurchases:buyer?.ledger?.maxPurchases??0,...buyer?.ledger?.summary?.()},limits:'Unknown settlement remains reserved. Stop halts this process; revoke the onchain grant to remove authority.'});
      if(req.method==='POST'&&url.pathname==='/operator/tick'){if(!operator)throw Error('Operator is not configured');return respond(200,await operator.tick());}
      if(req.method==='POST'&&url.pathname==='/operator/start'){
        if(!operator||loop)throw Error('Operator unavailable or already running');loop=new AbortController();loopState='running';
        operator.run({signal:loop.signal,intervalMs}).catch(()=>{loopState='stopped after a failed authorization or execution check';}).finally(()=>{loop=null;if(loopState==='running')loopState='stopped';});return respond(200,{status:'running'});
      }
      if(req.method==='POST'&&url.pathname==='/operator/stop'){loop?.abort();return respond(200,{status:'stopping',note:'Revoke the onchain session/grant to remove authority from every process.'});}
      if(req.method==='POST'&&url.pathname==='/purchase/review'){
        if(!buyer||!Number.isInteger(body.service)||!scopes[body.service])throw Error('Unknown configured service');
        for(const[id,r]of reviews)if(r.expires<Date.now())reviews.delete(id);if(reviews.size>=100)throw Error('Too many active reviews');
        const s=scopes[body.service];const reviewId=randomBytes(24).toString('hex');reviews.set(reviewId,{service:body.service,expires:Date.now()+60000});
        return respond(200,{reviewId,expiresInSeconds:60,payer:await buyer.signer.getAddress(),url:s.url,network:s.network,asset:s.asset,payTo:s.payTo,maximumAmount:s.maxAmount,method:s.method??'GET',body:s.body??null,meaning:'Authorize one exact x402 service payment up to this displayed maximum, using the configured separate payment wallet.'});
      }
      if(req.method==='POST'&&url.pathname==='/purchase'){
        const review=reviews.get(body.reviewId);reviews.delete(body.reviewId);if(!review||review.expires<Date.now())throw Error('Review expired or already used');
        const s=scopes[review.service];const result=await buyer.purchase({id:body.reviewId,url:s.url,method:s.method??'GET',body:s.body});return respond(200,result);
      }
      return respond(404,{error:'Unknown host operation'});
    }catch{return respond(400,{error:'Request failed a configured scope, authority, delivery or settlement check. A transmitted payment may still settle; inspect the payment ledger before retrying.'});}
  });
  server.on('close',()=>loop?.abort());return server;
}
