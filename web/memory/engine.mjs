import {OperatingEngine} from '../operating/engine.mjs';
import {fingerprint,stable} from '../kingdom/model.mjs';
import {memorySeal,validateMemoryPayload} from './crypto.mjs';
export const MEM_ZERO='0x'+'00'.repeat(32);
const memHash=v=>typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v);
const memInt=n=>Number.isSafeInteger(n)&&n>=0;
const memFresh=(seq,origin)=>({schema:'idfbi/memory-state/1.7',origin,start:seq,entries:[],bindings:[]});
/** Append-only, unsigned LOCAL journal. Public metadata and ciphertext are not signatures.
 * Historical custody stays attributed. The NFT never acquires an author's decryption key. */
export class MemoryEngine extends OperatingEngine {
 constructor(now,origin=MEM_ZERO){super(now);if(!memHash(origin))throw Error('Invalid origin.');this.mem=memFresh(this.world.s.seq,origin);}
 atomic(fn){const saved=this.mem?structuredClone(this.mem):null;try{return super.atomic(fn);}catch(e){if(saved)this.mem=saved;throw e;}}
 memoryHeader({phase='memory',parent=0,plan=MEM_ZERO,receipt=0,form=true}={}){
  const w=this.world,a=w.identity();if(!['memory','before','reflection'].includes(phase)||!memInt(parent)||!memInt(receipt)||!memHash(plan)||typeof form!=='boolean')throw Error('Invalid memory context.');
  if(phase==='reflection'){const p=this.entry(parent);if(p.header.author!==w.s.actor)throw Error('Only the original author can add a reflection.');if(p.header.identity!==a.id)throw Error('Select the original artifact for this reflection.');}
  else{w._owner(a.id);if(parent)throw Error('Only reflections have parents.');}
  if(phase==='before'&&plan===MEM_ZERO)throw Error('A before-trade inscription must bind a reviewed plan.');
  if(phase!=='before'&&plan!==MEM_ZERO)throw Error('Only a before-trade entry may bind a plan.');
  if(receipt&&!w.s.events.some(e=>e.seq===receipt&&e.identity===a.id))throw Error('Receipt belongs to another artifact or does not exist.');
  return {schema:'idfbi/memory-header/1.7',origin:this.mem.origin,id:this.mem.entries.length+1,identity:a.id,author:w.s.actor,custodian:a.owner,epoch:a.epoch,time:w.s.now,phase,parent,plan,receipt,form:form&&a.owner===w.s.actor,previous:this.mem.entries.at(-1)?.digest||MEM_ZERO};
 }
 entry(id){const e=this.mem.entries.find(x=>x.header.id===Number(id));if(!e)throw Error('Unknown memory.');return e;}
 appendMemory(sealed){return this.atomic(()=>{if(this.mem.entries.length>=1000)throw Error('This rehearsal holds at most 1000 memories; export before continuing.');
  const h=sealed?.header;if(h?.phase==='before'&&!this._journalTransaction)throw Error('Before entries require atomic swap execution.');if(!h)throw Error('Memory header required.');const expected=this.memoryHeader({phase:h.phase,parent:h.parent,plan:h.plan,receipt:h.receipt,form:h.form});
  if(stable(expected)!==stable(h)||memorySeal(h,sealed.payload).digest!==sealed.digest)throw Error('The memory context changed. Reopen and review the inscription.');
  const ev=this.world._event('MEMORY_INSCRIBED',h.identity,{memory:h.id,commitment:sealed.digest,phase:h.phase,form:h.form,parent:h.parent,causes:h.receipt?[h.receipt]:[]});
  const record={...structuredClone(sealed),event:ev.seq};this.mem.entries.push(record);return record;
 });}
 executeNoted(plan,anchor,sealed){return this.atomic(()=>{
  if(sealed.header.phase!=='before'||sealed.header.plan!==plan.digest)throw Error('The inscription is bound to another plan.');
  const checked=this.constructor.restore(this.export()).execute(plan,anchor);
  let note;this._journalTransaction=true;try{note=this.appendMemory(sealed);}finally{this._journalTransaction=false;}const since=this.world.s.seq;const result=this.apply(plan.intent);
  if(stable(result)!==stable(checked))throw Error('The journaled outcome changed.');
  const ev=this.world.s.events.slice().reverse().find(e=>e.seq>since&&e.kind==='SWAPPED');if(!ev)throw Error('No successful swap receipt to bind.');
  const binding={entry:note.header.id,plan:plan.digest,receipt:ev.seq,receiptDigest:ev.digest,result:structuredClone(result),recordedAt:this.world.s.now};
  const linked=this.world._event('MEMORY_BOUND',note.header.identity,{memory:note.header.id,plan:plan.digest,causes:[note.event,ev.seq]});binding.event=linked.seq;this.mem.bindings.push(binding);return result;
 });}
 form(id=this.world.s.selected,through=this.world.s.seq){return memoryForm(this.world.s.events,this.mem,id,through);}
 export(){const b={schema:'idfbi/remembering/1.7',operating:super.export(),memory:structuredClone(this.mem)};return {...b,checksum:fingerprint(b)};}
 static restore(x,origin=MEM_ZERO){
  let e;if(x?.schema!=='idfbi/remembering/1.7'){e=OperatingEngine.restore(x);Object.setPrototypeOf(e,MemoryEngine.prototype);e.mem=memFresh(e.world.s.seq,origin);return e;}
  const{checksum,...b}=x;if(Object.keys(x).sort().join(',')!=='checksum,memory,operating,schema'||fingerprint(b)!==checksum)throw Error('Memory archive checksum failed.');
  e=OperatingEngine.restore(x.operating);Object.setPrototypeOf(e,MemoryEngine.prototype);e.mem=structuredClone(x.memory);validateMemState(e);return e;
 }
}
function validateMemState(e){
 const m=e.mem,w=e.world;if(!m||Object.keys(m).sort().join(',')!=='bindings,entries,origin,schema,start'||m.schema!=='idfbi/memory-state/1.7'||!memHash(m.origin)||!memInt(m.start)||m.start>w.s.seq||!Array.isArray(m.entries)||m.entries.length>1000||!Array.isArray(m.bindings)||m.bindings.length>1000)throw Error('Invalid memory archive.');
 let prev=MEM_ZERO,evt=0;
 for(let i=0;i<m.entries.length;i++){
  const n=m.entries[i],h=n.header;validateMemoryPayload(n.payload);
  if(Object.keys(n).sort().join(',')!=='digest,event,header,payload'||!h||Object.keys(h).sort().join(',')!=='author,custodian,epoch,form,id,identity,origin,parent,phase,plan,previous,receipt,schema,time'||h.schema!=='idfbi/memory-header/1.7'||h.origin!==m.origin||h.id!==i+1||h.previous!==prev||!memInt(h.time)||!memInt(h.epoch)||!['you','guest'].includes(h.author)||typeof h.form!=='boolean'||!['memory','before','reflection'].includes(h.phase)||!memHash(h.plan)||!memInt(h.parent)||h.parent>=h.id||!memInt(h.receipt)||!memInt(n.event)||n.event<=evt||h.time>w.s.now||memorySeal(h,n.payload).digest!==n.digest)throw Error('Inconsistent memory record.');
  w.identity(h.identity);if(!['you','guest','archivist','weaver','escrow'].includes(h.custodian)||h.form&&h.author!==h.custodian)throw Error('Invalid memory custody.');
  const ev=w.s.events.find(x=>x.seq===n.event);if(!ev||ev.kind!=='MEMORY_INSCRIBED'||ev.identity!==h.identity||ev.actor!==h.author||ev.epoch!==h.epoch||ev.custodian!==h.custodian||ev.time!==h.time||ev.data.commitment!==n.digest||ev.data.memory!==h.id||ev.data.phase!==h.phase||ev.data.form!==h.form||ev.data.parent!==h.parent)throw Error('Memory receipt mismatch.');
  if(h.phase==='reflection'){const p=m.entries[h.parent-1];if(!p||p.header.author!==h.author||p.header.identity!==h.identity)throw Error('Reflection authorship mismatch.');}else if(h.parent)throw Error('Unexpected parent.');
  if((h.phase==='before')!==(h.plan!==MEM_ZERO))throw Error('Plan phase mismatch.');
  if(h.receipt){const r=w.s.events.find(x=>x.seq===h.receipt);if(!r||r.seq>=n.event||r.identity!==h.identity)throw Error('Memory references an invalid receipt.');}
  prev=n.digest;evt=n.event;
 }
 const seen=new Set();for(const b of m.bindings){const n=m.entries[b.entry-1],r=w.s.events.find(x=>x.seq===b.receipt),end=w.s.events.find(x=>x.seq===b.event);if(Object.keys(b).sort().join(',')!=='entry,event,plan,receipt,receiptDigest,recordedAt,result'||!n||seen.has(b.entry)||n.header.phase!=='before'||n.header.plan!==b.plan||!r||r.kind!=='SWAPPED'||r.identity!==n.header.identity||r.actor!==n.header.author||r.seq<=n.event||r.digest!==b.receiptDigest||!end||end.kind!=='MEMORY_BOUND'||end.seq<=r.seq||end.data.memory!==b.entry||end.data.plan!==b.plan||b.recordedAt!==end.time||!end.data.causes.includes(n.event)||!end.data.causes.includes(r.seq)||b.result?.received!==r.data.received||b.result?.asset!==r.data.output||b.result?.lockId!==(r.data.lock||0))throw Error('Invalid trade/memory binding.');seen.add(b.entry);}
 for(const n of m.entries)if(n.header.phase==='before'&&!seen.has(n.header.id))throw Error('Missing successful swap binding.');
}
// These categories do NOT score virtue, profit, volume, truthfulness or humanity.
export const FORM_CHANNELS=['exchange','commitment','creation','connection','exploration','memory'];
export function memoryCategory(kind){
 if(/^(SWAPPED|CONTRIBUTED|WITHDRAWN|WITHDREW|CLAIMED|ACQUIRED|LISTED|BOUGHT|SHELF_BOUGHT|SHELF_PURCHASED)/.test(kind))return 0;
 if(/(EXIT_|LOCK|GIFT|OFFERED|ACCEPTED|RELEASED|RETURNED|CREDIT|OPTION|COMMISSION|WORK_)/.test(kind))return 1;
 if(/(LAUNCH|SETTLED|EDITION|APPLICATION|SHELF_OPEN|VENUE_)/.test(kind))return 2;
 if(/(POST|SPOKE|JOINED|REMOVED|MESSAGE|ROOM|INVIT|MEMBER|REACT|FOLLOW|BLOCK|PRESENCE)/.test(kind))return 3;
 if(/(LAB_|STRATEGY|BASKET|MATCHED|PAIRS_|GRANT|INSTRUMENT|ADOPT|INSTALL)/.test(kind))return 4;
 if(kind==='MEMORY_INSCRIBED')return 5;
 return -1;
}
export function memoryForm(events,memory,id,through=Number.MAX_SAFE_INTEGER){
 let root=fingerprint({domain:'IDFBI_LIVED_FORM_1_7',origin:memory.origin,identity:id}),count=0;const counts=Array(6).fill(0),sums=Array(8).fill(0),marks=[];
 for(const e of events){if(e.seq<=memory.start||e.seq>through||e.identity!==Number(id))continue;const k=memoryCategory(e.kind);if(k<0||e.kind==='MEMORY_INSCRIBED'&&!e.data.form)continue;
  // Only typed event identity and content commitments; never decrypt or analyze prose.
  const data=Object.fromEntries(Object.entries(e.data).filter(([name])=>!['cause','causes','receipt'].includes(name)));
  const projection=fingerprint({kind:e.kind,identity:e.identity,actor:e.actor,custodian:e.custodian,epoch:e.epoch,time:e.time,data});
  root=fingerprint({domain:'IDFBI_FORM_EVENT_1_7',previous:root,projection});count++;counts[k]++;
  const weight=1/(1+counts[k]*.32);for(let i=0;i<8;i++){const b=parseInt(root.slice(2+i*6,8+i*6),16)/0xffffff;sums[i]=sums[i]*.86+(b*2-1)*weight;}
  const diversity=counts.filter(Boolean).length;const strength=.30*(1-Math.exp(-count/5))+.10*diversity/6;
  const traits=sums.map((v,i)=>Math.round(Math.tanh(v+(i===0?(counts[1]-counts[0])*.025:0))*strength*100000)/100000);
  marks.push({seq:e.seq,kind:e.kind,time:e.time,root,count,counts:[...counts],traits});
 }
 const last=marks.at(-1);return {version:'lived-field/1.7',identity:Number(id),root,count,counts,traits:last?.traits||Array(8).fill(0),marks};
}
