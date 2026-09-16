import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {loadArtifacts,proveQuote,validateInput} from './prover.mjs';

export function createProofServer({token=randomBytes(32).toString('hex'),origins=[],artifacts=loadArtifacts(),prove=proveQuote}={}) {
  if(typeof token!=='string'||token.length<32||token.length>256)throw Error('Use a 32–256 character session token.');
  const allowed=new Set(origins.map(origin=>{const u=new URL(origin);if(u.origin!==origin||!['https:','http:'].includes(u.protocol))throw Error('Origins must be exact HTTP(S) origins.');return origin;}));
  const expected=Buffer.from('Bearer '+token);let busy=false;
  const server=http.createServer(async(req,res)=>{
    const reply=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
    if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host||''))return reply(403,{error:'Loopback host required.'});
    const origin=req.headers.origin;
    if(origin&&!allowed.has(origin))return reply(403,{error:'Origin not allowed.'});
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS'&&req.url==='/prove'){
      res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');return reply(204,{});
    }
    const got=Buffer.from(req.headers.authorization||'');
    if(got.length!==expected.length||!timingSafeEqual(got,expected))return reply(401,{error:'Session token required.'});
    if(req.method!=='POST'||req.url!=='/prove')return reply(404,{error:'Unknown route.'});
    if(req.headers['content-type']!=='application/json')return reply(415,{error:'JSON required.'});
    if(busy)return reply(429,{error:'A proof is already running.'});
    busy=true;
    try {
      let data='',bytes=0;
      for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)throw Error('Request too large.');data+=chunk;}
      const input=validateInput(JSON.parse(data));
      const proof=await prove(input,{artifacts});
      reply(200,proof);
    }catch(error){reply(400,{error:error.message});}finally{busy=false;}
  });
  server.headersTimeout=10000;server.requestTimeout=15000;
  return {server,token};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const {server,token}=createProofServer({token:process.env.ANIMA_PROOF_TOKEN,origins:(process.env.ANIMA_PROOF_ORIGINS||'').split(',').filter(Boolean)});
  const port=Number(process.env.ANIMA_PROOF_PORT||8791);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid loopback port.');
  server.listen(port,'127.0.0.1',()=>console.log(`Development proof service: http://127.0.0.1:${port}\nSession token: ${token}\nAllowed origins: ${process.env.ANIMA_PROOF_ORIGINS||'(command line requests only)'}\nThis server holds no wallet keys and sends no transactions.`));
}
