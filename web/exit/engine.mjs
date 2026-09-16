import {MemoryEngine} from '../memory/engine.mjs';
import {DAY} from '../instruments/engine.mjs';
import {fingerprint,MAX112} from '../kingdom/model.mjs';

const exitKeys=(v,names)=>{if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).sort().join(',')!==names.split(',').sort().join(','))throw Error('Unexpected exit fields.');};
const exitInt=(n,min,max)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('Exit schedule number is outside its supported range.');return n;};
const exitAmount=n=>{if(typeof n!=='string'||!/^[0-9]{1,34}$/.test(n)||BigInt(n)<1n||BigInt(n)>MAX112)throw Error('Enter a positive minimum in raw asset units.');return BigInt(n);};
const exitAdd=(a,asset,n)=>{const v=BigInt(a[asset]||0)+n;if(v<0n||v>MAX112)throw Error('Insufficient or excessive exit balance.');a[asset]=String(v);};
export function normalizeExit(spec,cliffDays){
 exitKeys(spec,'asset,rows');if(!/^[A-Z][A-Z0-9]{1,11}$/.test(spec.asset)||!Array.isArray(spec.rows)||!spec.rows.length||spec.rows.length>64)throw Error('Choose an exit asset and 1–64 installments.');
 exitInt(cliffDays,1,3650);let last=-1,total=0;
 for(const row of spec.rows){exitKeys(row,'offsetDays,bps,minOut,graceDays');exitInt(row.offsetDays,0,3650-cliffDays);if(row.offsetDays<=last)throw Error('Installment dates must increase.');last=row.offsetDays;exitInt(row.bps,1,10000);total+=row.bps;exitAmount(row.minOut);exitInt(row.graceDays,1,365);}
 if(total!==10000)throw Error('Installment percentages must add up to exactly 100%.');return structuredClone(spec);
}
export function exitSlices(total,spec,first){
 total=exitAmount(String(total));let assigned=0n;
 return spec.rows.map((r,i)=>{const n=i===spec.rows.length-1?total-assigned:total*BigInt(r.bps)/10000n;exitAmount(String(n));assigned+=n;return {index:i,amount:String(n),minOut:r.minOut,due:first+r.offsetDays*DAY,expires:first+(r.offsetDays+r.graceDays)*DAY,status:'pending',received:'0',receipt:0};});
}
/** Funded local specification. Time makes a slice eligible; only an execution creates a fill. */
export class ExitEngine extends MemoryEngine {
 constructor(now,origin){super(now,origin);this.exits=[];}
 atomic(fn){const before=this.exits?structuredClone(this.exits):null;try{return super.atomic(fn);}catch(e){if(before)this.exits=before;throw e;}}
 moduleSnapshot(id){const base=super.moduleSnapshot(id),plans=(this.exits||[]).filter(p=>p.identity===Number(id));return plans.length?{...base,vestedExits:structuredClone(plans)}:base;}
 normalize(raw){if(!Object.hasOwn(raw||{},'exit'))return super.normalize(raw);exitKeys(raw,'kind,input,output,amount,minOut,days,recipient,exit');const {exit,...base}=raw,p=super.normalize(base);if(!['SWAP','LOCK'].includes(p.kind))throw Error('Only a swap or funded lock can create an exit.');const terms=normalizeExit(exit,p.days);if(terms.asset===p.output)throw Error('Choose a different asset to receive when selling.');for(const asset of [p.output,terms.asset])if(asset!=='ETH'&&!this.world.s.pools.some(pool=>pool.asset===asset))throw Error('This exit asset has no market.');return {...p,exit:terms};}
 publish(title,raw,parent=0){if(raw?.exit)throw Error('Exit schedules are funded individually; publish a plain instrument edition.');return super.publish(title,raw,parent);}
 apply(raw){if(!raw?.exit)return super.apply(raw);return this.atomic(()=>{
  const p=this.normalize(raw),{exit,...base}=p,w=this.world,a=w._owner(w.s.selected);if(this.exits.length>=256)throw Error('Export before creating more exit schedules.');
  let result,originReceipt=0;if(p.kind==='SWAP'){result=super.apply({...base,days:0});originReceipt=w.s.seq;}else result={received:p.amount,asset:p.output,lockId:0,releaseAt:0,steps:[]};
  const n=BigInt(result.received);exitAdd(a.balances,p.output,-n);
  const plan={id:this.exits.length+1,identity:a.id,epoch:a.epoch,owner:a.owner,input:p.output,output:exit.asset,total:String(n),created:w.s.now,cliffDays:p.days,terms:exit,originReceipt,paused:false,cancelled:false,slices:exitSlices(n,exit,w.s.now+p.days*DAY),receipt:0};
  const ev=this.record('EXIT_FUNDED',a.id,{exit:plan.id,plan:structuredClone(plan),causes:originReceipt?[originReceipt]:[]});plan.receipt=ev.seq;this.exits.push(plan);a.nonce++;
  return {...result,lockId:0,releaseAt:plan.slices[0].due,exitPlanId:plan.id,steps:p.kind==='SWAP'?['SWAP','VEST','SCHEDULE EXIT']:['VEST','SCHEDULE EXIT']};
 });}
 exitPlan(id){const p=this.exits.find(p=>p.id===Number(id));if(!p)throw Error('Unknown exit schedule.');return p;}
 exitStatus(p,s){const a=this.world.identity(p.identity),now=this.world.s.now;if(s.status!=='pending')return s.status;if(now<s.due)return 'vesting';if(p.cancelled)return 'recoverable';if(now>=s.expires)return 'expired';if(a.owner==='escrow'||a.epoch!==p.epoch||a.owner!==p.owner)return 'custody changed';return p.paused?'paused':'eligible';}
 changeExit(id,action){return this.atomic(()=>{const p=this.exitPlan(id),a=this.world._owner(p.identity);if(!['pause','resume','cancel','reauthorize'].includes(action))throw Error('Unknown exit instruction.');if(p.cancelled)throw Error('A cancelled schedule cannot restart.');if(action==='resume'&&(a.epoch!==p.epoch||a.owner!==p.owner))throw Error('Reauthorize the new custody before resuming.');if(action==='reauthorize'){if(a.owner==='escrow')throw Error('Exit authority cannot be granted in escrow.');p.epoch=a.epoch;p.owner=a.owner;p.paused=true;}else if(action==='cancel')p.cancelled=true;else p.paused=action==='pause';a.nonce++;this.record('EXIT_CONTROL',p.identity,{exit:p.id,action,epoch:p.epoch,owner:p.owner,causes:[p.receipt]});});}
 executeExit(id,index){return this.atomic(()=>{
  const p=this.exitPlan(id),s=p.slices[exitInt(Number(index),0,p.slices.length-1)],w=this.world;
  if(this.exitStatus(p,s)!=='eligible')throw Error('This installment is not eligible for sale.');
  const selection=w.s.selected,delegation=this._delegation;w.s.selected=p.identity;this._delegation={identity:p.identity,epoch:p.epoch};
  try{exitAdd(w.identity(p.identity).balances,p.input,BigInt(s.amount));const fill=w.swap(p.input,p.output,BigInt(s.amount),BigInt(s.minOut),0,s.expires-1),swap=w.s.seq;
   s.status='sold';s.received=String(fill.out);s.receipt=this.record('EXIT_SOLD',p.identity,{exit:p.id,index:s.index,amount:s.amount,received:s.received,swap,causes:[p.receipt,swap,...this.mem.bindings.filter(b=>b.receipt===p.originReceipt).map(b=>b.event)]}).seq;return structuredClone(s);
  }finally{w.s.selected=selection;this._delegation=delegation;}
 });}
 recoverExit(id,index){return this.atomic(()=>{const p=this.exitPlan(id),s=p.slices[exitInt(Number(index),0,p.slices.length-1)],w=this.world;if(s.status!=='pending'||w.s.now<s.due||(!p.cancelled&&w.s.now<s.expires))throw Error('Recovery waits until vesting and cancellation or expiry.');exitAdd(w.identity(p.identity).balances,p.input,BigInt(s.amount));s.status='recovered';s.receipt=this.record('EXIT_RECOVERED',p.identity,{exit:p.id,index:s.index,amount:s.amount,causes:[p.receipt]}).seq;return structuredClone(s);});}
 project(id,at){const result=super.project(id,at);for(const p of (this.exits||[]).filter(p=>p.identity===Number(id)))for(const s of p.slices.filter(s=>s.status==='pending')){const available=at>=s.due&&(p.cancelled||at>=s.expires)?s.amount:'0';result.claims.push({type:'vesting-exit',id:p.id,index:s.index,asset:p.input,escrow:s.amount,available,end:s.due});if(available!=='0')exitAdd(result.balances,p.input,BigInt(available));}result.scope='Scheduled claims and segregated exit tokens only; future sale proceeds are unknown and never projected.';return result;}
 export(){const body={schema:'idfbi/vested-exits/1',remembering:super.export(),exits:structuredClone(this.exits||[])};return {...body,checksum:fingerprint(body)};}
 static restore(data,origin){
  if(data?.schema!=='idfbi/vested-exits/1'){const e=MemoryEngine.restore(data,origin);Object.setPrototypeOf(e,ExitEngine.prototype);e.exits=[];if(e.world.s.events.some(x=>x.kind==='EXIT_FUNDED'))throw Error('Missing funded exit state.');return e;}
  exitKeys(data,'schema,remembering,exits,checksum');const {checksum,...body}=data;if(checksum!==fingerprint(body))throw Error('Exit archive checksum failed.');
  const e=MemoryEngine.restore(data.remembering,origin);Object.setPrototypeOf(e,ExitEngine.prototype);e.exits=structuredClone(data.exits);validateExits(e);return e;
 }
}
function validateExits(e){
 if(!Array.isArray(e.exits)||e.exits.length>256)throw Error('Invalid exit archive.');const usedSwaps=new Set(),events=e.world.s.events,funds=events.filter(x=>x.kind==='EXIT_FUNDED');if(funds.length!==e.exits.length)throw Error('Missing exit funding records.');
 for(let i=0;i<e.exits.length;i++){
  const p=e.exits[i],fund=funds[i];exitKeys(p,'id,identity,epoch,owner,input,output,total,created,cliffDays,terms,originReceipt,paused,cancelled,slices,receipt');
  if(p.id!==i+1||p.receipt!==fund.seq||fund.identity!==p.identity||fund.time!==p.created||fund.data.exit!==p.id)throw Error('Exit funding mismatch.');
  const initial=structuredClone(fund.data.plan);exitKeys(initial,'id,identity,epoch,owner,input,output,total,created,cliffDays,terms,originReceipt,paused,cancelled,slices,receipt');
  for(const asset of [initial.input,initial.output])if(typeof asset!=='string'||!/^[A-Z][A-Z0-9]{1,11}$/.test(asset)||asset!=='ETH'&&!e.world.s.pools.some(p=>p.asset===asset))throw Error('Invalid exit asset.');exitInt(initial.created,1,e.world.s.now);exitInt(initial.epoch,0,Number.MAX_SAFE_INTEGER);exitInt(initial.originReceipt,0,fund.seq-1);if(fund.actor!==fund.custodian)throw Error('Invalid exit funder.');normalizeExit(initial.terms,initial.cliffDays);exitAmount(initial.total);e.world.identity(initial.identity);if(initial.epoch!==fund.epoch||initial.owner!==fund.custodian||initial.owner==='escrow'||initial.input===initial.output||initial.terms.asset!==initial.output||initial.paused!==false||initial.cancelled!==false||initial.receipt!==0)throw Error('Invalid funded exit terms.');
  if(fingerprint(initial.slices)!==fingerprint(exitSlices(initial.total,initial.terms,initial.created+initial.cliffDays*DAY)))throw Error('Exit allocation mismatch.');
  if(initial.originReceipt){if(usedSwaps.has(initial.originReceipt))throw Error('Reused exit swap receipt.');usedSwaps.add(initial.originReceipt);const swap=events.find(x=>x.seq===initial.originReceipt);if(swap?.kind!=='SWAPPED'||swap.seq>=fund.seq||swap.identity!==p.identity||swap.actor!==fund.actor||swap.epoch!==fund.epoch||swap.custodian!==fund.custodian||swap.data.output!==initial.input||swap.data.received!==initial.total||swap.data.lock)throw Error('Exit source swap mismatch.');}
  initial.receipt=fund.seq;
  for(const event of events.filter(x=>x.seq>fund.seq&&x.data.exit===p.id&&x.kind.startsWith('EXIT_'))){
   if(event.identity!==p.identity||!event.data.causes?.includes(fund.seq))throw Error('Exit transition context mismatch.');
   if(event.kind==='EXIT_CONTROL'){const d=event.data;if(initial.cancelled||event.actor!==event.custodian||event.custodian==='escrow')throw Error('Invalid exit controller.');if(d.action==='reauthorize'){if(d.epoch!==event.epoch||d.owner!==event.custodian)throw Error('Invalid exit reauthorization.');initial.epoch=d.epoch;initial.owner=d.owner;initial.paused=true;}else if(d.action==='cancel')initial.cancelled=true;else if(['pause','resume'].includes(d.action))initial.paused=d.action==='pause';else throw Error('Invalid exit control');if(initial.epoch!==d.epoch||initial.owner!==d.owner)throw Error('Changed exit authority.');continue;}
   const s=initial.slices[event.data.index];if(!s||s.status!=='pending'||event.time<s.due||event.data.amount!==s.amount)throw Error('Duplicate, early or changed exit installment.');
   if(event.kind==='EXIT_SOLD'){
    if(usedSwaps.has(event.data.swap)||!event.data.causes.includes(event.data.swap))throw Error('Reused or unlinked exit fill.');usedSwaps.add(event.data.swap);const swap=events.find(x=>x.seq===event.data.swap);if(initial.cancelled||initial.paused||event.time>=s.expires||event.epoch!==initial.epoch||event.custodian!==initial.owner||swap?.kind!=='SWAPPED'||swap.identity!==p.identity||swap.actor!==event.actor||swap.epoch!==event.epoch||swap.custodian!==event.custodian||swap.seq>=event.seq||swap.time!==event.time||swap.data.input!==initial.input||swap.data.output!==initial.output||swap.data.amount!==s.amount||swap.data.received!==event.data.received||BigInt(event.data.received)<BigInt(s.minOut)||swap.data.lock)throw Error('Invalid exit fill.');s.status='sold';s.received=event.data.received;
   }else if(event.kind==='EXIT_RECOVERED'){if(!initial.cancelled&&event.time<s.expires)throw Error('Early exit recovery.');s.status='recovered';}else throw Error('Unknown exit transition.');s.receipt=event.seq;
  }
  if(fingerprint(initial)!==fingerprint(p))throw Error('Stored exit differs from its funding and execution receipts.');
 }
}
