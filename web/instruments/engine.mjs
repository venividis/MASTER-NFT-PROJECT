import {KingdomModel,wei,fingerprint,releasable,MAX112} from '../kingdom/model.mjs';

/** Executable LOCAL specification. No chain, signatures, model inference, or price oracle.
 * Plans are content-bound reviews, NOT authenticated authorizations.
 * The financial model is integer reserve math, NOT Uniswap v4 tick execution.
 */
export const DAY=86400;
export const INTENT_DOMAIN='idfbi/instruments/1.5/unsigned-local';
const HEX=/^0x[0-9a-f]{64}$/;
const TOK=/^[A-Z][A-Z0-9]{1,11}$/;
const PEOPLE=['you','guest','archivist','weaver'];
const eq=(a,b)=>fingerprint(a)===fingerprint(b);
function keys(o,ks){if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).sort().join('|')!==ks.sort().join('|'))throw Error('Unexpected plan fields.');}
function integer(n,lo,hi,label='Number'){if(!Number.isSafeInteger(n)||n<lo||n>hi)throw Error(label+' is outside its supported range.');return n;}
function intentAmount(n){if(typeof n!=='string'||!/^[0-9]{1,34}$/.test(n)||BigInt(n)<=0n||BigInt(n)>MAX112)throw Error('Invalid raw-unit amount.');return BigInt(n);}
function credit(a,k,n){a[k]=(BigInt(a[k]||0)+n).toString();}
function debit(a,k,n){if(BigInt(a[k]||0)<n)throw Error('Insufficient rehearsal '+k+' balance.');a[k]=(BigInt(a[k])-n).toString();}

export class InstrumentEngine {
  constructor(now=Math.floor(Date.now()/1000)) {
    this.world=new KingdomModel(now);
    // Presentation names only; no replacement scene or replacement NFT identity.
    this.world.identity(1).name='Your artifact';
    this.world.identity(204).name='Artifact 0204';
    this.world.identity(317).name='Artifact 0317';
    this.world.room(1).topic='Public conversation. Your filters do not control other people.';
    this.world.room(2).name='Private posting circle';
    this.world.room(2).topic='Invitations control posting. These messages are not encrypted.';
    this.extra={schema:'idfbi/promises/1.5',gifts:[],personalBalances:{you:{},guest:{},archivist:{},weaver:{}}};
  }
  atomic(fn) {
    const state=structuredClone(this.world.s),extra=structuredClone(this.extra);
    try{return fn();}catch(e){this.world.s=state;this.extra=extra;throw e;}
  }
  context(anchor) {
    if(!HEX.test(anchor))throw Error('A full organism audit anchor is required.');
    const w=this.world,a=w.identity();
    return fingerprint({domain:INTENT_DOMAIN,anchor,actor:w.s.actor,id:a.id,owner:a.owner,
      epoch:a.epoch,nonce:a.nonce,balances:a.balances,pools:w.s.pools,
      gifts:this.extra.gifts.filter(g=>g.donor===a.id||g.recipient.kind==='artifact'&&g.recipient.id===a.id)});
  }
  normalize(raw) {
    keys(raw,['kind','input','output','amount','minOut','days','recipient']);
    if(!['SWAP','LOCK','GIFT'].includes(raw.kind))throw Error('Unknown instrument.');
    if(!TOK.test(raw.input)||!TOK.test(raw.output))throw Error('Invalid asset identifier.');
    intentAmount(raw.amount);intentAmount(raw.minOut);integer(raw.days,0,3650,'Days');
    if(raw.kind==='SWAP'&&raw.input===raw.output)throw Error('Choose two different assets.');
    if(raw.kind==='LOCK'&&(raw.days===0||raw.input!==raw.output))throw Error('A lock keeps the selected asset and needs a duration.');
    if(raw.kind!=='GIFT'&&raw.recipient!==null)throw Error('Only a gift has a separate recipient.');
    if(raw.kind==='GIFT'){
      integer(raw.days,2,3650,'Gift duration');keys(raw.recipient,['kind','id']);
      if(raw.recipient.kind==='person'){
        if(!PEOPLE.includes(raw.recipient.id))throw Error('Unknown rehearsal recipient.');
      }else if(raw.recipient.kind==='artifact'){
        integer(raw.recipient.id,1,Number.MAX_SAFE_INTEGER);this.world.identity(raw.recipient.id);
        if(raw.recipient.id===this.world.s.selected)throw Error('Use a normal lock for your own artifact.');
      }else throw Error('Choose a personal wallet or an artifact account.');
    }
    return structuredClone(raw);
  }
  prepare(raw,anchor) {
    const intent=this.normalize(raw),w=this.world;
    w._owner(w.s.selected);
    const context=this.context(anchor),deadline=w.s.now+600;
    const copy=this.constructor.restore(this.export());
    const preview=copy.apply(intent);
    const plan={domain:INTENT_DOMAIN,anchor,context,deadline,intent,preview};
    return {...plan,digest:fingerprint(plan)};
  }
  execute(plan,anchor) {
    return this.atomic(()=>{
      keys(plan,['domain','anchor','context','deadline','intent','preview','digest']);
      const {digest,...body}=plan;
      if(plan.domain!==INTENT_DOMAIN||!HEX.test(digest)||fingerprint(body)!==digest)throw Error('The reviewed plan was changed.');
      integer(plan.deadline,0,Number.MAX_SAFE_INTEGER);
      if(plan.anchor!==anchor||plan.context!==this.context(anchor))throw Error('The artifact, wallet, balances, or market changed. Review again.');
      if(this.world.s.now>plan.deadline)throw Error('This review expired. Prepare it again.');
      const intent=this.normalize(plan.intent);
      const prediction=this.constructor.restore(this.export()).apply(intent);
      if(!eq(prediction,plan.preview))throw Error('The result or schedule changed. Review again.');
      return this.apply(intent);
    });
  }
  apply(raw) {
    const p=this.normalize(raw),w=this.world,a=w._owner(w.s.selected),n=intentAmount(p.amount);
    return this.atomic(()=>{
      if(p.kind==='SWAP'){
        const result=w.swap(p.input,p.output,n,intentAmount(p.minOut),p.days);
        return {received:result.out.toString(),asset:p.output,lockId:result.lock?.id||0,
          releaseAt:result.lock?.end||0,steps:p.days?['SWAP','LOCK']:['SWAP']};
      }
      if(p.kind==='LOCK'){
        const l=w.deposit(p.input,n,p.days);
        return {received:n.toString(),asset:p.input,lockId:l.id,releaseAt:l.end,steps:['LOCK']};
      }
      let output=n,causes=[];
      if(p.input!==p.output){const result=w.swap(p.input,p.output,n,intentAmount(p.minOut));output=result.out;causes=[w.s.seq];}
      if(output<intentAmount(p.minOut))throw Error('Gift amount is below the reviewed minimum.');
      debit(a.balances,p.output,output);
      const g={id:this.extra.gifts.length+1,donor:a.id,donorActor:w.s.actor,donorEpoch:a.epoch,
        recipient:structuredClone(p.recipient),asset:p.output,amount:output.toString(),
        offeredAt:w.s.now,acceptBy:w.s.now+Math.min(3,p.days-1)*DAY,
        releaseAt:w.s.now+p.days*DAY,status:'offered',acceptedAt:0,released:'0',receipt:0};
      this.extra.gifts.push(g);a.nonce++;
      const e=w._event('OFFERED',a.id,{gift:g.id,asset:g.asset,amount:g.amount,
        recipient:g.recipient,acceptBy:g.acceptBy,releaseAt:g.releaseAt,causes});
      g.receipt=e.seq;
      return {received:g.amount,asset:g.asset,giftId:g.id,acceptBy:g.acceptBy,
        releaseAt:g.releaseAt,recipient:g.recipient,steps:causes.length?['SWAP','OFFER']:['OFFER']};
    });
  }
  gift(id){const g=this.extra.gifts.find(x=>x.id===Number(id));if(!g)throw Error('Unknown gift.');return g;}
  recipientActor(g){return g.recipient.kind==='person'?g.recipient.id:this.world.identity(g.recipient.id).owner;}
  accept(id) {return this.atomic(()=>{
    const g=this.gift(id),w=this.world;
    if(g.status!=='offered'||w.s.now>=g.acceptBy)throw Error('The offer expired or is no longer pending.');
    if(this.recipientActor(g)!==w.s.actor)throw Error('Only the designated recipient may accept.');
    g.status='accepted';g.acceptedAt=w.s.now;
    w._event('ACCEPTED',g.recipient.kind==='artifact'?g.recipient.id:0,{gift:g.id,releaseAt:g.releaseAt,causes:[g.receipt]});
    return structuredClone(g);
  });}
  cancel(id) {return this.atomic(()=>{
    const g=this.gift(id),w=this.world;
    if(g.status!=='offered')throw Error('An accepted gift cannot be recalled.');
    if(w.s.now<g.acceptBy)w._owner(g.donor);
    // Anyone may return an expired offer, but only to the original donor account.
    g.status='returned';credit(w.identity(g.donor).balances,g.asset,BigInt(g.amount));
    w._event('GIFT_RETURNED',g.donor,{gift:g.id,causes:[g.receipt]});
  });}
  releaseGift(id) {return this.atomic(()=>{
    const g=this.gift(id),w=this.world;
    if(g.status!=='accepted'||w.s.now<g.releaseAt)throw Error('This gift is not releasable at the actual rehearsal time.');
    g.status='released';g.released=g.amount;
    const balances=g.recipient.kind==='person'?this.extra.personalBalances[g.recipient.id]:w.identity(g.recipient.id).balances;
    credit(balances,g.asset,BigInt(g.amount));
    w._event('GIFT_RELEASED',g.recipient.kind==='artifact'?g.recipient.id:0,
      {gift:g.id,asset:g.asset,amount:g.amount,recipient:g.recipient,causes:[g.receipt]},w.s.actor);
    return BigInt(g.amount);
  });}
  // All permission-changing actor tests are checked at use time, not cached in the invitation.
  project(id,at) {
    integer(at,this.world.s.now,this.world.s.now+3650*DAY,'Projection date');
    const w=this.world,a=w.identity(id),balances=structuredClone(a.balances),claims=[];
    for(const l of w.s.locks.filter(l=>l.identity===id)){
      const n=releasable(l,at);credit(balances,l.asset,n);
      claims.push({type:'vault',id:l.id,asset:l.asset,available:n.toString(),end:l.end});
    }
    for(const g of this.extra.gifts.filter(g=>g.status==='accepted'&&g.recipient.kind==='artifact'&&g.recipient.id===id)){
      const n=at>=g.releaseAt?BigInt(g.amount):0n;credit(balances,g.asset,n);
      claims.push({type:'gift',id:g.id,asset:g.asset,available:n.toString(),end:g.releaseAt});
    }
    return {at,balances,claims,scope:'Scheduled claim projection only; no price, yield, auto-release, or future state prediction.'};
  }
  trace(seq) {
    const events=this.world.s.events,byId=new Map(events.map(e=>[e.seq,e])),seen=new Set(),result=[];
    const visit=n=>{if(seen.has(n))return;const e=byId.get(n);if(!e)return;seen.add(n);
      let refs=[...(e.data.causes||[])];
      if(e.data.sale)refs.push(...events.filter(x=>x.seq<e.seq&&x.data.sale===e.data.sale&&['LAUNCHED','CONTRIBUTED','SETTLED','REFUNDABLE'].includes(x.kind)).map(x=>x.seq));
      if(e.data.lock)refs.push(...events.filter(x=>x.seq<e.seq&&x.data.lock===e.data.lock&&['SWAPPED','LOCKED'].includes(x.kind)).map(x=>x.seq));
      refs=refs.filter(n=>Number.isSafeInteger(n)&&n>0&&n<e.seq);refs.forEach(visit);
      result.push({event:structuredClone(e),causes:[...new Set(refs)],discussions:this.world.s.messages.filter(m=>m.receipt===e.seq).map(m=>structuredClone(m))});
    };visit(Number(seq));return result;
  }
  export(){return {schema:'idfbi/instruments/1.5',world:this.world.export(),extra:structuredClone(this.extra),checksum:fingerprint({world:this.world.export(),extra:this.extra})};}
  static restore(data){
    keys(data,['schema','world','extra','checksum']);
    if(data.schema!=='idfbi/instruments/1.5'||data.checksum!==fingerprint({world:data.world,extra:data.extra}))throw Error('Instrument archive failed its integrity check.');
    const model=Object.create(InstrumentEngine.prototype);model.world=KingdomModel.restore(data.world);
    keys(data.extra,['schema','gifts','personalBalances']);
    if(data.extra.schema!=='idfbi/promises/1.5'||!Array.isArray(data.extra.gifts)||data.extra.gifts.length>2048)throw Error('Unsupported promise archive.');
    const ids=new Set();
    for(const g of data.extra.gifts){
      keys(g,['id','donor','donorActor','donorEpoch','recipient','asset','amount','offeredAt','acceptBy','releaseAt','status','acceptedAt','released','receipt']);
      integer(g.id,1,2048);if(g.id!==ids.size+1)throw Error('Gift IDs must be consecutive.');if(ids.has(g.id))throw Error('Duplicate gift.');ids.add(g.id);integer(g.donor,1,Number.MAX_SAFE_INTEGER);model.world.identity(g.donor);
      if(!PEOPLE.includes(g.donorActor)||!TOK.test(g.asset))throw Error('Invalid donor or asset.');
      integer(g.donorEpoch,0,Number.MAX_SAFE_INTEGER);intentAmount(g.amount);
      integer(g.offeredAt,1,Number.MAX_SAFE_INTEGER);integer(g.acceptBy,g.offeredAt+1,Number.MAX_SAFE_INTEGER);
      integer(g.releaseAt,g.acceptBy+1,g.offeredAt+3650*DAY);integer(g.acceptedAt,0,g.acceptBy-1);if(g.acceptedAt>0&&g.acceptedAt<g.offeredAt)throw Error('Acceptance predates its offer.');if(g.offeredAt>model.world.s.now||g.acceptedAt>model.world.s.now)throw Error('Future gift event.');
      integer(g.receipt,1,model.world.s.seq);
      if(!['offered','accepted','returned','released'].includes(g.status)||!['0',g.amount].includes(g.released))throw Error('Invalid gift state.');
      if((['accepted','released'].includes(g.status))!==(g.acceptedAt>0)||((g.status==='released')!==(g.released===g.amount)))throw Error('Inconsistent gift state.');
      keys(g.recipient,['kind','id']);if(g.recipient.kind==='person'){if(!PEOPLE.includes(g.recipient.id))throw Error('Invalid personal recipient.');}
      else if(g.recipient.kind==='artifact'){integer(g.recipient.id,1,Number.MAX_SAFE_INTEGER);model.world.identity(g.recipient.id);if(g.recipient.id===g.donor)throw Error('Self gift uses a normal lock.');}else throw Error('Invalid recipient type.');
      const e=model.world.s.events.find(x=>x.seq===g.receipt);
      if(e?.kind!=='OFFERED'||e.time!==g.offeredAt||e.actor!==g.donorActor||e.epoch!==g.donorEpoch||e.data.asset!==g.asset||e.data.gift!==g.id||e.data.amount!==g.amount||e.identity!==g.donor||!eq(e.data.recipient,g.recipient)||e.data.releaseAt!==g.releaseAt||e.data.acceptBy!==g.acceptBy)throw Error('Gift does not match its origin receipt.');
      const subsequent=model.world.s.events.filter(x=>x.seq>g.receipt&&x.data.gift===g.id);
      const accepted=subsequent.filter(x=>x.kind==='ACCEPTED'),returned=subsequent.filter(x=>x.kind==='GIFT_RETURNED'),released=subsequent.filter(x=>x.kind==='GIFT_RELEASED');
      if(accepted.length>1||returned.length>1||released.length>1||accepted.length!==Number(['accepted','released'].includes(g.status))||returned.length!==Number(g.status==='returned')||released.length!==Number(g.status==='released'))throw Error('Gift transitions do not match their receipts.');
      if(accepted.length&&(accepted[0].time!==g.acceptedAt||accepted[0].data.releaseAt!==g.releaseAt||!accepted[0].data.causes?.includes(g.receipt)))throw Error('Invalid acceptance receipt.');
      if(g.recipient.kind==='person'&&accepted.length&&accepted[0].actor!==g.recipient.id)throw Error('Wrong accepting person.');
      if(released.length&&(released[0].time<g.releaseAt||released[0].seq<accepted[0].seq||released[0].data.amount!==g.amount||released[0].data.asset!==g.asset||!eq(released[0].data.recipient,g.recipient)))throw Error('Invalid release receipt.');
    }
    keys(data.extra.personalBalances,PEOPLE.slice());
    for(const bs of Object.values(data.extra.personalBalances))for(const [asset,value]of Object.entries(bs)){
      if(!TOK.test(asset)||typeof value!=='string'||!/^[0-9]{1,78}$/.test(value)||BigInt(value)>=(1n<<256n))throw Error('Invalid personal balance.');
    }
    model.extra=structuredClone(data.extra);return model;
  }
}

/** Exact proportional allocation. Leftover indivisible units are explicit dust;
 * no first-come dust reward, random winner, or claim of wallet uniqueness. */
export function proportionalAllocation(supply,bids) {
  supply=BigInt(supply);if(supply<0n||supply>MAX112||!Array.isArray(bids)||bids.length>10000)throw Error('Invalid allocation input.');
  const budgets=bids.map(x=>{x=BigInt(x);if(x<0n||x>MAX112)throw Error('Invalid budget.');return x;});
  const total=budgets.reduce((a,b)=>a+b,0n),allocations=budgets.map(b=>total?supply*b/total:0n);
  return {allocations,dust:supply-allocations.reduce((a,b)=>a+b,0n)};
}
