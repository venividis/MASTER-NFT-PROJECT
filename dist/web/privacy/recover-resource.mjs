// Dependency-free, read-only recovery of a ShardedResource v1 (gzip) directory.
// Importing this module does not touch the DOM, wallet, storage, or network.
export const RESOURCE_SELECTORS = Object.freeze({
  schemaVersion:'0x4e2ce6d3', shardCount:'0x04e9c77a', shards:'0x16faae90',
  shardByteLengths:'0xe2345b11', shardChunkCounts:'0x6c1fb5ba', shardSha256:'0xfcd5661c',
  compressedByteLength:'0x20d169ff', byteLength:'0x02823108',
  compressedSha256:'0xb3db7758', contentSha256:'0xefad39b0', totalChunkCount:'0x1b02192e',
  chunkCount:'0xf91f0937', readChunk:'0x8f5281bf',
});
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const WORD = /^0x[0-9a-f]{64}$/i;
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const zeroAddress = '0x'+'0'.repeat(40);
const cancelled = () => Object.assign(new Error('Resource recovery cancelled.'), {name:'AbortError'});
const assertActive = signal => { if(signal?.aborted) throw cancelled(); };
const hashValue = (value,label) => {
  if(typeof value!=='string'||!/^(?:0x)?[0-9a-f]{64}$/i.test(value)) throw Error('Invalid '+label+' digest.');
  const hash=value.replace(/^0x/i,'').toLowerCase();
  if(/^0+$/.test(hash)) throw Error('Invalid '+label+' digest.');
  return hash;
};
const addressValue = (value,label) => {
  if(typeof value!=='string'||!ADDRESS.test(value)||value.toLowerCase()===zeroAddress) throw Error('Invalid '+label+' address.');
  return value.toLowerCase();
};
function uintWord(value,label,max=Number.MAX_SAFE_INTEGER) {
  if(typeof value!=='string'||!WORD.test(value)) throw Error('Invalid '+label+' ABI response.');
  const n=BigInt(value);
  if(n>BigInt(max)) throw Error('Invalid '+label+' size or count.');
  return Number(n);
}
function addressWord(value) {
  if(typeof value!=='string'||!WORD.test(value)||!/^0x0{24}/i.test(value)) throw Error('Invalid shard address ABI response.');
  return addressValue('0x'+value.slice(-40),'shard');
}
function option(value,fallback,max,name) {
  const n=value??fallback;
  if(!Number.isSafeInteger(n)||n<1||n>max) throw Error('Invalid '+name+' limit.');
  return n;
}

// Exactly one ABI dynamic bytes return value, with a canonical offset and padding.
export function decodeResourceChunk(hex) {
  if(typeof hex!=='string'||hex.length>128+2+46016||!/^0x[0-9a-f]*$/i.test(hex)||hex.length%2) throw Error('Invalid chunk ABI response.');
  const data=hex.slice(2);
  if(data.length<128||BigInt('0x'+data.slice(0,64))!==32n) throw Error('Invalid chunk offset.');
  const length=Number(BigInt('0x'+data.slice(64,128)));
  if(!Number.isSafeInteger(length)||length<1||length>23000) throw Error('Invalid chunk size.');
  const padded=Math.ceil(length/32)*64;
  if(data.length!==128+padded||/[^0]/i.test(data.slice(128+length*2))) throw Error('Invalid chunk length or padding.');
  const bytes=new Uint8Array(length);
  for(let i=0;i<length;i++) bytes[i]=parseInt(data.slice(128+i*2,130+i*2),16);
  return bytes;
}

// Pure SHA-256 fallback also works in opaque data: documents without SubtleCrypto.
export function resourceSha256(bytes) {
  const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
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
async function digest(bytes) {
  if(globalThis.crypto?.subtle) return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  return resourceSha256(bytes);
}

// One shared queue bounds metadata AND chunk requests. Cancelling promptly rejects
// callers even when an injected wallet cannot cancel an already in-flight read.
function requester(request,signal,concurrency) {
  const queued=[],active=new Set();let closed=null;
  const close=error=>{
    if(closed)return;closed=error;
    for(const job of queued.splice(0))job.reject(error);
    for(const job of active)job.reject(error);
  };
  const abort=()=>close(cancelled());signal?.addEventListener('abort',abort,{once:true});
  function pump(){
    while(!closed&&active.size<concurrency&&queued.length){
      const job=queued.shift();active.add(job);
      Promise.resolve().then(()=>{if(closed)throw closed;assertActive(signal);return request(job.payload);}).then(job.resolve,job.reject).finally(()=>{active.delete(job);pump();});
    }
  }
  return {
    call(payload){return new Promise((resolve,reject)=>{if(closed)return reject(closed);if(signal?.aborted)return reject(cancelled());queued.push({payload,resolve,reject});pump();});},
    close(){signal?.removeEventListener('abort',abort);close(Error('Resource recovery ended.'));},
  };
}

async function expandGzip(compressed,expected,signal) {
  if(typeof DecompressionStream!=='function')throw Error('This browser does not support gzip resource recovery.');
  assertActive(signal);
  const reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const abort=()=>{reader.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  const parts=[];let size=0;
  try{
    for(;;){assertActive(signal);const {done,value}=await reader.read();assertActive(signal);if(done)break;
      size+=value.byteLength;if(size>expected)throw Error('Expanded resource exceeds its pinned byte length.');parts.push(value);
    }
    if(size!==expected)throw Error('Expanded resource byte length mismatch.');
    const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}return bytes;
  }catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{signal?.removeEventListener('abort',abort);reader.releaseLock();}
}

/**
 * Recover and verify public JavaScript bytes; no account requests or execution.
 * descriptor = {resource, chainId, sha256, byteLength}; sha256 and byteLength MUST
 * come from the edition's trusted build/metadata, not a user-controlled resource.
 * RPC is the NFT resource's home-chain provider, not implicitly the swap provider.
 */
export async function recoverResource(request,descriptor,options={}) {
  if(typeof request!=='function')throw Error('A read-only RPC request function is required.');
  const {signal,progress=()=>{}}=options;assertActive(signal);
  const maxCompressed=option(options.maxCompressedBytes,8*1024*1024,32*1024*1024,'compressed bytes');
  const maxExpanded=option(options.maxExpandedBytes,32*1024*1024,64*1024*1024,'expanded bytes');
  const maxShards=option(options.maxShards,8,64,'shards');
  const maxChunks=option(options.maxChunksPerShard,64,64,'chunks');
  const concurrency=option(options.concurrency,4,8,'concurrency');
  if(!descriptor||typeof descriptor!=='object')throw Error('A pinned resource descriptor is required.');
  const resource=addressValue(descriptor.resource,'resource'),expectedHash=hashValue(descriptor.sha256,'pinned resource');
  const expectedSize=option(descriptor.byteLength,0,maxExpanded,'pinned resource bytes');
  if(!/^[1-9][0-9]*$/.test(String(descriptor.chainId)))throw Error('Invalid resource chain ID.');
  const chainId=BigInt(descriptor.chainId),rpc=requester(request,signal,concurrency);
  try{
    const checkChain=async()=>{const chain=await rpc.call({method:'eth_chainId',params:[]});if(typeof chain!=='string'||!QUANTITY.test(chain)||BigInt(chain)!==chainId)throw Error('Resource RPC is on the wrong chain.');};
    await checkChain();
    const block=await rpc.call({method:'eth_blockNumber',params:[]});if(typeof block!=='string'||!QUANTITY.test(block))throw Error('Invalid resource block number.');
    const read=(to,name,index)=>rpc.call({method:'eth_call',params:[{to,data:RESOURCE_SELECTORS[name]+(index===undefined?'':index.toString(16).padStart(64,'0'))},block]});
    const [versionResult,countResult,lengthResult,expandedResult,compressedHashResult,rawHashResult,totalCountResult]=await Promise.all([
      read(resource,'schemaVersion'),read(resource,'shardCount'),read(resource,'compressedByteLength'),read(resource,'byteLength'),read(resource,'compressedSha256'),read(resource,'contentSha256'),read(resource,'totalChunkCount'),
    ]);
    if(uintWord(versionResult,'resource schema')!==1)throw Error('Unsupported resource schema.');
    const count=uintWord(countResult,'shard count',maxShards),compressedLength=uintWord(lengthResult,'compressed byte length',maxCompressed),expandedLength=uintWord(expandedResult,'expanded byte length',maxExpanded),totalCount=uintWord(totalCountResult,'total chunk count',maxShards*maxChunks);
    const compressedHash=hashValue(compressedHashResult,'compressed resource'),rawHash=hashValue(rawHashResult,'expanded resource');
    if(!count||!compressedLength||!totalCount)throw Error('Resource has an empty count or byte length.');
    if(expandedLength!==expectedSize||rawHash!==expectedHash)throw Error('Resource does not match this edition\'s pinned bytes and digest.');
    const records=await Promise.all(Array.from({length:count},async(_,index)=>{
      const [address,bytes,chunks,hash]=await Promise.all([read(resource,'shards',index),read(resource,'shardByteLengths',index),read(resource,'shardChunkCounts',index),read(resource,'shardSha256',index)]);
      const record={address:addressWord(address),bytes:uintWord(bytes,'shard byte length',maxChunks*23000),chunks:uintWord(chunks,'shard chunk count',maxChunks),hash:hashValue(hash,'shard')};
      if(!record.chunks||record.bytes<record.chunks||record.bytes>record.chunks*23000)throw Error('Invalid shard length or chunk count.');
      return record;
    }));
    if(records.reduce((n,r)=>n+r.bytes,0)!==compressedLength||records.reduce((n,r)=>n+r.chunks,0)!==totalCount)throw Error('Resource directory lengths or chunk counts do not add up.');
    await Promise.all(records.map(async record=>{
      const [bytes,chunks,hash]=await Promise.all([read(record.address,'byteLength'),read(record.address,'chunkCount'),read(record.address,'contentSha256')]);
      if(uintWord(bytes,'shard byte length')!==record.bytes||uintWord(chunks,'shard chunk count')!==record.chunks||hashValue(hash,'shard')!==record.hash)throw Error('Resource shard metadata changed or does not match the directory.');
    }));
    const compressed=new Uint8Array(compressedLength);let completed=0,received=0,offset=0;
    for(const record of records){record.offset=offset;offset+=record.bytes;}
    await Promise.all(records.map(async record=>{
      const parts=await Promise.all(Array.from({length:record.chunks},async(_,index)=>{
        const part=decodeResourceChunk(await read(record.address,'readChunk',index));received+=part.length;
        if(received>compressedLength)throw Error('Resource chunks exceed the pinned compressed byte length.');
        progress({phase:'chunks',completed:++completed,total:totalCount,bytes:received,totalBytes:compressedLength});return part;
      }));
      const size=parts.reduce((n,b)=>n+b.length,0);if(size!==record.bytes)throw Error('Resource shard byte length mismatch.');
      let cursor=record.offset;for(const part of parts){compressed.set(part,cursor);cursor+=part.length;}
      if(await digest(compressed.subarray(record.offset,cursor))!==record.hash)throw Error('Resource shard digest mismatch.');
    }));
    assertActive(signal);if(await digest(compressed)!==compressedHash)throw Error('Compressed resource digest mismatch.');
    progress({phase:'decompress',bytes:compressedLength,totalBytes:compressedLength});
    const bytes=await expandGzip(compressed,expectedSize,signal);
    assertActive(signal);if(await digest(bytes)!==expectedHash)throw Error('Expanded resource digest mismatch.');
    await checkChain();assertActive(signal);
    progress({phase:'verified',bytes:bytes.length,totalBytes:bytes.length});return bytes;
  }finally{rpc.close();}
}
