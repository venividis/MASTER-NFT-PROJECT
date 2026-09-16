import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash, randomBytes} from 'node:crypto';
import {SCHEMA,RULES,MAX_RECEIPTS,canonical,digest,sha256Bytes,genesis,transition,checkAction,makeBundle,verifyBundle,phenotype} from '../web/model.mjs';
import {fieldVector} from '../web/renderer.js';
const seed='0x'+'42'.repeat(32),salt='0x'+'91'.repeat(32),commitment='0x'+'e7'.repeat(32);
const first=()=>genesis(seed,1000);
const hex=b=>Buffer.from(b).toString('hex');

test('portable SHA-256 matches published empty and abc vectors',()=>{
 assert.equal(hex(sha256Bytes(new Uint8Array())), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
 assert.equal(hex(sha256Bytes(new TextEncoder().encode('abc'))),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('portable SHA-256 matches Node at padding boundaries and random lengths',()=>{
 for(const n of [1,2,7,31,32,55,56,57,63,64,65,127,128,129,511,512,513,1024,4096,1000000]){
  const data=n===1000000?Buffer.alloc(n,'a'):randomBytes(n);
  assert.equal(hex(sha256Bytes(data)),createHash('sha256').update(data).digest('hex'));
 }
});
test('canonical JSON is ordered and rejects unsafe data',()=>{
 assert.equal(canonical({z:1,a:[2,{c:'x',b:true}]}),'\{"a":[2,{"b":true,"c":"x"}],"z":1}');
 for(const x of [Infinity,NaN,undefined,1.2,Number.MAX_SAFE_INTEGER+1,new Date()])assert.throws(()=>canonical(x));
});
test('hash commitments are domain separated and avoid delimiter ambiguity',async()=>{
 assert.notEqual(await digest('one',['a|b','c']),await digest('one',['a','b|c']));
 assert.notEqual(await digest('one','a'),await digest('two','a'));
});
test('genesis is deterministic and binds seed and timestamp',async()=>{
 assert.deepEqual(await first(),await first());
 assert.notEqual((await first()).root,(await genesis(seed,1001)).root);
 await assert.rejects(()=>genesis('x',1000));await assert.rejects(()=>genesis(seed,1.5));
});
test('evolution changes genome, memory, state and audit atomically, without mutating input',async()=>{
 const s=await first(),before=structuredClone(s),out=await transition(s,'EVOLVE',{salt},1001);
 assert.deepEqual(s,before);assert.equal(out.state.nonce,1);assert.equal(out.state.evolutions,1);
 for(const key of ['genome','memory','root','audit'])assert.notEqual(out.state[key],s[key]);
 assert.equal(out.receipt.verification,'unsigned-local-sha256');assert.equal(out.receipt.priorStateRoot,s.root);
});
test('same state and action reproduce exactly the same receipt',async()=>{
 const s=await first();assert.deepEqual(await transition(s,'EVOLVE',{salt},1001),await transition(s,'EVOLVE',{salt},1001));
});
test('entropy is not counted as verified evolution',async()=>{
 const s=await first(),out=await transition(s,'ENTROPY',{salt},1001);assert.equal(out.state.evolutions,0);assert.equal(out.state.memory,s.memory);assert.notEqual(out.state.genome,s.genome);
});
test('memory appends only a digest and does not alter genome',async()=>{
 const s=await first(),out=await transition(s,'SEAL_MEMORY',{commitment},1001);assert.notEqual(s.memory,out.state.memory);assert.equal(out.state.genome,s.genome);
 assert.deepEqual(Object.keys(out.receipt.payload),['commitment']);
 await assert.rejects(()=>transition(s,'SEAL_MEMORY',{commitment,plaintext:'secret'},1001));
});
test('a thought receives distinct commitments under different salts',async()=>{
 const a=await digest('private-thought',{thought:'same thought',salt});
 const b=await digest('private-thought',{thought:'same thought',salt:seed});assert.notEqual(a,b);
});
test('children inherit lineage but have different genomes; existing child records stay immutable',async()=>{
 const s=await first(),a=await transition(s,'SPAWN',{salt},1001),b=await transition(a.state,'SPAWN',{salt},1002);
 assert.equal(a.state.children[0].generation,1);assert.equal(a.state.children[0].parentGenome,s.genome);assert.notEqual(a.state.children[0].genome,s.genome);
 assert.deepEqual(b.state.children[0],a.state.children[0]);assert.notEqual(b.state.children[0].id,b.state.children[1].id);
});
test('ascension invalidates direct entropy and cannot be repeated',async()=>{
 const s=await first(),a=await transition(s,'ASCEND',{policy:s.policy},1001);
 assert.equal(a.state.sovereign,true);assert.equal(a.state.epoch,1);
 await assert.rejects(()=>transition(a.state,'ENTROPY',{salt},1002),/Sovereign/);
 await assert.rejects(()=>transition(a.state,'ASCEND',{policy:s.policy},1002),/Sovereign/);
 assert.equal((await transition(a.state,'EVOLVE',{salt},1002)).state.sovereign,true);
 await assert.rejects(()=>transition(s,'ASCEND',{policy:seed},1001),/Constitution/);
});
test('nonce replay and backwards timestamps are rejected',async()=>{
 const s=await first(),a=await transition(s,'EVOLVE',{salt},1001);
 await assert.rejects(()=>transition(a.state,'EVOLVE',{salt},1002,0),/nonce/);
 await assert.rejects(()=>transition(s,'EVOLVE',{salt},999),/predate/);
});
test('unknown operations and unexpected payload fields are rejected',async()=>{
 const s=await first();for(const [kind,payload]of [['SEND_FUNDS',{salt}],['EVOLVE',{salt,value:'1'}],['SPAWN',{salt:'0xdead'}],['ENTROPY',{salt,nonce:0}]])assert.throws(()=>checkAction(s,kind,payload));
});
async function book(){const s=await first(),a=await transition(s,'EVOLVE',{salt},1001),b=await transition(a.state,'SPAWN',{salt},1002),c=await transition(b.state,'SEAL_MEMORY',{commitment},1003);return makeBundle(s,[a.receipt,b.receipt,c.receipt],c.state);}
test('exported receipt books rebuild all historical snapshots',async()=>{
 const b=await book(),v=await verifyBundle(JSON.parse(JSON.stringify(b)));assert.equal(v.snapshots.length,4);assert.equal(v.state.nonce,3);assert.equal(v.state.audit,b.expectedAudit);assert.equal(v.snapshots[0].nonce,0);
});
test('modified output roots, payloads, policy, evidence, and audit fail verification',async()=>{
 for(const key of ['nextStateRoot','nextMemoryRoot','statement','evidence','policy','audit']){const b=await book();b.receipts[0][key]=seed;await assert.rejects(()=>verifyBundle(b));}
 const b=await book();b.receipts[0].payload.salt=seed;await assert.rejects(()=>verifyBundle(b));
});
test('reordered, replayed, removed, and added receipts are detected against the expected head',async()=>{
 const b=await book();for(const variant of [ {...b,receipts:[b.receipts[1],b.receipts[0],b.receipts[2]]},{...b,receipts:[...b.receipts,b.receipts[0]]},{...b,receipts:b.receipts.slice(0,-1)} ])await assert.rejects(()=>verifyBundle(variant));
});
test('trailing unknown fields and wrong schema are rejected',async()=>{
 const b=await book();await assert.rejects(()=>verifyBundle({...b,schema:'different'}));await assert.rejects(()=>verifyBundle({...b,signature:'pretend'}));b.receipts[0].extra='forged';await assert.rejects(()=>verifyBundle(b));
});
test('changing genesis invalidates existing receipts',async()=>{const b=await book();b.genesis.time++;await assert.rejects(()=>verifyBundle(b));});
test('presentation-only phenotype is deterministic and within documented ranges',async()=>{
 const s=await first(),p=phenotype(s);assert.deepEqual(p,phenotype(s));assert(p.lobes>=3&&p.lobes<=6);assert(p.fold>=.12&&p.fold<=.32);assert(p.pitch>=110&&p.pitch<=196);
});
test('the optical uniform vector is deterministic and uses both halves of each commitment',()=>{
 const a=fieldVector(seed);assert(a.every(x=>Number.isFinite(x)&&x>=0&&x<=1));
 assert.deepEqual(a,fieldVector(seed));assert.notDeepEqual(a,fieldVector('0x'+'42'.repeat(31)+'43'));
});
test('local study and child limits are enforced',async()=>{
 let s=await first();for(let i=0;i<24;i++)s=(await transition(s,'SPAWN',{salt},1001+i)).state;
 await assert.rejects(()=>transition(s,'SPAWN',{salt},2000),/24 children/);
 const mock={...s,nonce:MAX_RECEIPTS};assert.throws(()=>checkAction(mock,'EVOLVE',{salt}),/192-receipt/);
});
test('mixed lifecycle: 100 valid transitions remain independently reproducible',async()=>{
 const s=await first();let head=s;const receipts=[];
 for(let i=0;i<100;i++){const kind=i===50?'ASCEND':i%5===0?'SEAL_MEMORY':'EVOLVE';const payload=kind==='ASCEND'?{policy:head.policy}:kind==='SEAL_MEMORY'?{commitment}:{salt};const r=await transition(head,kind,payload,1001+i);head=r.state;receipts.push(r.receipt);}
 const v=await verifyBundle(makeBundle(s,receipts,head));assert.deepEqual(v.state,head);assert.equal(v.snapshots.length,101);assert.equal(head.epoch,1);
});
