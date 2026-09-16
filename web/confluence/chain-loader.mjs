// Small, dependency-free reader embedded in each token's animation metadata.
// SHA-256 works in opaque data URLs, where SubtleCrypto may be unavailable.
import {recoverFunctionalRuntime} from './module-loader.mjs';
export function archiveSha256(bytes) {
  const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const padded=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);padded.set(bytes);padded[bytes.length]=128;
  const view=new DataView(padded.buffer);view.setUint32(padded.length-8,Math.floor(bytes.length/0x20000000));view.setUint32(padded.length-4,(bytes.length*8)>>>0);
  const rr=(v,n)=>(v>>>n)|(v<<(32-n)),w=new Uint32Array(64);
  for(let off=0;off<padded.length;off+=64){
    for(let i=0;i<16;i++)w[i]=view.getUint32(off+i*4);
    for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(rr(x,7)^rr(x,18)^(x>>>3))+w[i-7]+(rr(y,17)^rr(y,19)^(y>>>10)))>>>0;}
    let [a,b,c,d,e,f,g,j]=h;
    for(let i=0;i<64;i++){const t1=(j+(rr(e,6)^rr(e,11)^rr(e,25))+((e&f)^(~e&g))+k[i]+w[i])>>>0,t2=((rr(a,2)^rr(a,13)^rr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;j=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
    [a,b,c,d,e,f,g,j].forEach((v,i)=>h[i]=(h[i]+v)>>>0);
  }
  return h.map(v=>v.toString(16).padStart(8,'0')).join('');
}
export function decodeArchiveChunk(hex) {
  if(!/^0x[0-9a-f]*$/i.test(hex)||hex.length%2)throw Error('Invalid chunk response');
  const data=hex.slice(2);if(data.length<128||BigInt('0x'+data.slice(0,64))!==32n)throw Error('Invalid chunk offset');
  const length=Number(BigInt('0x'+data.slice(64,128)));if(!Number.isSafeInteger(length)||length<1||length>23000||data.length<128+length*2)throw Error('Invalid chunk size');
  return Uint8Array.from(data.slice(128,128+length*2).match(/../g)||[],v=>parseInt(v,16));
}
export async function recoverArchive(request, config, progress=()=>{}) {
  const version=Number(config.archiveVersion??1);
  if(version===3)return recoverFunctionalRuntime(request,config,progress);
  if(![1,2].includes(version))throw Error('Unsupported archive version');
  if(!/^0x[0-9a-f]{40}$/i.test(config.runtime)||!/^(?:0x)?[0-9a-f]{64}$/i.test(config.sha256))throw Error('Invalid archive identity');
  const expectedHash=config.sha256.replace(/^0x/i,'').toLowerCase(),limit=version===2?512:64;
  if(BigInt(await request({method:'eth_chainId',params:[]}))!==BigInt(config.chainId))throw Error('Select chain '+config.chainId+' in your wallet or RPC');
  const block=await request({method:'eth_blockNumber',params:[]});
  if(!/^0x[0-9a-f]+$/i.test(block))throw Error('Invalid archive block');
  const call=data=>request({method:'eth_call',params:[{to:config.runtime,data},block]});
  const count=Number(BigInt(await call('0xf91f0937')));if(!Number.isInteger(count)||count<1||count>limit)throw Error('Invalid archive count');
  let expectedLength;
  if(version===2){
    if(BigInt(await call('0x4e2ce6d3'))!==2n)throw Error('Archive version mismatch');
    expectedLength=Number(BigInt(await call('0x02823108')));
    if(!Number.isSafeInteger(expectedLength)||expectedLength<count||expectedLength>count*23000)throw Error('Invalid archive length');
  }
  const chunks=[];let size=0;
  for(let i=0;i<count;i++){const part=decodeArchiveChunk(await call('0x8f5281bf'+i.toString(16).padStart(64,'0')));chunks.push(part);size+=part.length;progress(i+1,count);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  if(expectedLength!==undefined&&size!==expectedLength)throw Error('Archive length mismatch');
  if(archiveSha256(bytes)!==expectedHash)throw Error('Archive digest mismatch');
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
if(typeof document!=='undefined'&&document.getElementById('unfold')){
  document.getElementById('unfold').onclick=async()=>{
    const button=document.getElementById('unfold'),status=document.getElementById('status');button.disabled=true;
    try{
      const endpoint=document.getElementById('rpc').value.trim();let request;
      if(endpoint){const url=new URL(endpoint);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Use HTTPS or a local RPC');
        request=async payload=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,...payload})});if(!r.ok)throw Error('RPC HTTP '+r.status);const result=await r.json();if(result.error)throw Error(result.error.message);return result.result;};
      }else{if(!window.ethereum)throw Error('Open in a wallet browser or enter a read-only RPC for chain '+window.AWE_CHAIN_IDENTITY.chainId);request=p=>window.ethereum.request(p);}
      window.AWE_CHAIN_RPC=request;
      const html=await recoverArchive(request,window.AWE_CHAIN_IDENTITY,(i,n)=>status.textContent='Recovering '+i+' / '+n+' immutable fragments');
      document.open();document.write(html);document.close();
    }catch(e){status.textContent=e.message;button.disabled=false;}
  };
}
