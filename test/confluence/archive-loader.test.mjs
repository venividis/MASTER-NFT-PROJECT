import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {AbiCoder} from 'ethers';
import {archiveSha256,decodeArchiveChunk,recoverArchive} from '../../web/confluence/chain-loader.mjs';
import {validateConfluenceArchive,replaceArchiveStorage} from '../../web/confluence/archive.mjs';
import {genesis,makeBundle} from '../../web/model.mjs';import {MemoryEngine} from '../../web/memory/engine.mjs';import {defaultWorld} from '../../web/confluence/console-core.mjs';
test('archive reader checks content digest, fixed block and chain without wallet authority',async()=>{
 for(const size of [0,1,3,55,56,63,64,65,23000,556734]){const bytes=crypto.randomBytes(size);assert.equal(archiveSha256(bytes),crypto.createHash('sha256').update(bytes).digest('hex'));}
 const html='<html><body>verified archive</body></html>',bytes=Buffer.from(html),digest=archiveSha256(bytes),coder=AbiCoder.defaultAbiCoder(),calls=[];
 const request=async p=>{calls.push(p);if(p.method==='eth_chainId')return '0x7a69';if(p.method==='eth_blockNumber')return '0x20';assert.equal(p.method,'eth_call');assert.equal(p.params[1],'0x20');return p.params[0].data==='0xf91f0937'?coder.encode(['uint256'],[1]):coder.encode(['bytes'],[bytes]);};
 const config={runtime:'0x'+'12'.repeat(20),chainId:31337,sha256:digest};assert.equal(await recoverArchive(request,config),html);
 await assert.rejects(recoverArchive(request,{...config,sha256:'0'.repeat(64)}),/digest/);await assert.rejects(recoverArchive(request,{...config,chainId:1}),/chain/);
 assert.throws(()=>decodeArchiveChunk('0x1234'),/offset/);assert.ok(calls.every(p=>!['eth_requestAccounts','eth_sendTransaction','personal_sign'].includes(p.method)));
});
test('full archive restores checked organism and instruments, rejects mixed origins and rolls back quota errors',async()=>{
 const s=await genesis('0x'+'32'.repeat(32),1700000000),engine=new MemoryEngine(undefined,s.seed),raw={schema:'awe.confluence/archive/1',origin:makeBundle(s,[],s),instruments:engine.export(),routes:[],launch:null,world:defaultWorld(),chainReceipts:[]};
 const candidate=await validateConfluenceArchive(raw,(data,seed)=>MemoryEngine.restore(data,seed));assert.equal(candidate.seed,s.seed);assert.equal(candidate.originReceipts,0);assert.equal(Object.keys(candidate.values).length,6);
 const mixed={...raw,instruments:new MemoryEngine(undefined,'0x'+'43'.repeat(32)).export()};await assert.rejects(validateConfluenceArchive(mixed,(d,s)=>MemoryEngine.restore(d,s)),/origin|match/i);
 const map=new Map([['a','old']]);let fail=true;const storage={getItem:k=>map.get(k)??null,removeItem:k=>map.delete(k),setItem:(k,v)=>{if(k==='b'&&fail){fail=false;throw Error('quota');}map.set(k,v);}};
 assert.throws(()=>replaceArchiveStorage(storage,{a:'new',b:'next'}),/previous saved data restored/);assert.deepEqual([...map],[['a','old']]);replaceArchiveStorage(storage,candidate.values);assert.equal(JSON.parse(map.get('idfbi.optical.1.2')).expectedAudit,s.audit);
});
test('archive recovery supports 64 chunks and rejects 65 before requesting their contents',async()=>{
 const coder=AbiCoder.defaultAbiCoder(),part=Buffer.from('a');let count=64,reads=0;
 const request=async p=>p.method==='eth_chainId'?'0x7a69':p.method==='eth_blockNumber'?'0x1':p.params[0].data==='0xf91f0937'?coder.encode(['uint256'],[count]):(++reads,coder.encode(['bytes'],[part]));
 const config={runtime:'0x'+'12'.repeat(20),chainId:31337,sha256:archiveSha256(Buffer.alloc(64,97))};
 assert.equal(await recoverArchive(request,config),'a'.repeat(64));assert.equal(reads,64);
 count=65;reads=0;await assert.rejects(recoverArchive(request,config),/archive count/);assert.equal(reads,0);
});

test('version2 permits at most 512 chunks, validates version/length and retains full digest verification',async()=>{
 const coder=AbiCoder.defaultAbiCoder(),part=Buffer.from('a');let count=512,version=2,length=512,reads=0;
 const request=async p=>{
  if(p.method==='eth_chainId')return '0x7a69';if(p.method==='eth_blockNumber')return '0x1';
  const d=p.params[0].data;if(d==='0xf91f0937')return coder.encode(['uint256'],[count]);
  if(d==='0x4e2ce6d3')return coder.encode(['uint256'],[version]);if(d==='0x02823108')return coder.encode(['uint256'],[length]);
  reads++;return coder.encode(['bytes'],[part]);
 };
 const config={runtime:'0x'+'12'.repeat(20),chainId:31337,sha256:archiveSha256(Buffer.alloc(512,97)),archiveVersion:2};
 assert.equal(await recoverArchive(request,config),'a'.repeat(512));assert.equal(reads,512);
 count=513;reads=0;await assert.rejects(recoverArchive(request,config),/archive count/);assert.equal(reads,0);
 count=512;version=1;await assert.rejects(recoverArchive(request,config),/version mismatch/);assert.equal(reads,0);
 version=2;length=513;await assert.rejects(recoverArchive(request,config),/length mismatch/);
 await assert.rejects(recoverArchive(request,{...config,archiveVersion:4}),/Unsupported archive version/);
 assert.throws(()=>decodeArchiveChunk(coder.encode(['bytes'],['0x'])),/chunk size/);
});
