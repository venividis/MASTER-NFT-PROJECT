import {poolModel,poolTrade,saleComposition,units} from './model.mjs';

const DAY=86400,MAX_EVENTS=200,Q128=1n<<128n;
const sum=values=>values.reduce((a,b)=>a+b,0n);
const wallet=()=>({token:0n,quote:0n});
const account=(state,name)=>state.accounts[name]||(state.accounts[name]=wallet());
const person=value=>{if(!/^[a-zA-Z][\w:.-]{0,63}$/.test(value||''))throw Error('Use a short participant name beginning with a letter.');return value;};
const whole=(value,label,min=0,max=3650)=>{if(!/^\d+$/.test(String(value)))throw Error(`${label} must be a whole number.`);const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(`${label} must be ${min}–${max}.`);return n;};
const invariant=(condition,message)=>{if(!condition)throw Error(`Scenario accounting failed: ${message}`);};
const parts=text=>String(text).trim().split(/\s+/);

export const SCENARIO_SCOPE='A reproducible one-position calculation using the pinned v4 integer swap-step and tick-word rules. Zero protocol fee, standard ERC20 assets, fixed liquidity and no outside trades or liquidity are assumed. It is not a live quote or price forecast.';

export function parseEvents(text){
  if(typeof text!=='string'||text.length>12000)throw Error('Keep the event sequence within 12,000 characters.');
  const events=text.split(/\r?\n/).map((text,i)=>({text:text.trim(),line:i+1})).filter(e=>e.text&&!e.text.startsWith('#'));
  if(events.length>MAX_EVENTS)throw Error(`Use at most ${MAX_EVENTS} events.`);
  return events;
}
function recipients(d){
  if(!Array.isArray(d.recipients)||!d.recipients.length||d.recipients.length>64)throw Error('Use 1–64 fee recipients.');
  const addresses=new Set();
  return d.recipients.map((r,i)=>{
    if(!/^\d{1,19}$/.test(String(r.weight))||BigInt(r.weight)<=0n||BigInt(r.weight)>10n**18n)throw Error('Recipient weights must be positive integers up to 10¹⁸.');
    if(r.recipient){const address=r.recipient.toLowerCase();if(!/^0x[0-9a-f]{40}$/.test(address)||/^0x0{40}$/.test(address))throw Error('Use a valid recipient address or leave it empty while designing.');if(addresses.has(address))throw Error('Fee recipients must have distinct addresses.');addresses.add(address);}
    return {id:String(i+1),label:r.label||`Recipient ${i+1}`,account:r.recipient?`recipient:${r.recipient.toLowerCase()}`:`recipient:${i+1}`,weight:BigInt(r.weight)};
  });
}
function funds(state){return {token:sum(Object.values(state.accounts).map(a=>a.token)),quote:sum(Object.values(state.accounts).map(a=>a.quote))};}
export function poolConservation(state){
  const held=funds(state),claims={token:sum(Object.values(state.claims).map(a=>a.token)),quote:sum(Object.values(state.claims).map(a=>a.quote))};
  const token=held.token+state.reserves.token+state.lpFees.token+state.hookPending.token+claims.token+state.lock.remaining;
  const quote=held.quote+state.reserves.quote+state.lpFees.quote+state.hookPending.quote+claims.quote;
  invariant(token===state.model.supply,'token supply must equal every held, pooled, locked and fee asset.');
  invariant(quote===state.quoteIntroduced,'quote funding must equal every held, pooled and fee asset.');
  for(const a of [state.reserves,state.lpFees,state.hookPending,...Object.values(state.accounts),...Object.values(state.claims)])invariant(a.token>=0n&&a.quote>=0n,'negative custody balance.');
  return {token,quote,tokenExpected:state.model.supply,quoteExpected:state.quoteIntroduced,balanced:true};
}
export function initialPoolState(d,{tokenIs0=d.scenarioTokenOrder!=='token1'}={}){
  const model=poolModel(d,tokenIs0),locked=units(d.retainedLockAmount??'0',18,{zero:true,label:'Retained token lock'});
  if(locked>model.retained)throw Error('The optional lock exceeds the retained allocation.');
  const end=whole(d.retainedVestingDays??'180','Vesting days',1)*DAY,cliff=whole(d.retainedCliffDays??'30','Cliff days')*DAY;
  if(locked>0n&&cliff>end)throw Error('The cliff cannot follow the vesting end.');
  const state={model,now:0,accounts:{creator:{token:model.retained-locked,quote:model.quoteRefund}},reserves:{token:model.usedToken,quote:model.usedQuote},lpFees:wallet(),feeGrowth:wallet(),hookPending:wallet(),claims:{},recipients:recipients(d),lock:{amount:locked,remaining:locked,released:0n,cliff,end},quoteIntroduced:model.quoteBudget,volume:wallet(),feeTotal:wallet(),trades:0};
  poolConservation(state);return state;
}
function poolEvent(state,text){
  const [op,...args]=parts(text),arity=n=>{if(args.length!==n)throw Error(`${op} expects ${n} value${n===1?'':'s'}.`);};
  if(op==='fund'){
    arity(2);const actor=person(args[0]),amount=units(args[1],state.model.qd);account(state,actor).quote+=amount;state.quoteIntroduced+=amount;
    return {kind:op,actor,amount,asset:'quote',description:'Explicit additional quote funding'};
  }
  if(op==='buy'||op==='sell'){
    arity(2);const actor=person(args[0]),input=op==='buy'?'quote':'token',output=op==='buy'?'token':'quote',amount=units(args[1],input==='quote'?state.model.qd:18),owner=account(state,actor);
    if(owner[input]<amount)throw Error(`${actor} does not hold enough ${input}. Fund quote or acquire/unlock tokens first.`);
    const trade=poolTrade(state.model,op,args[1]);if(state.reserves[output]<trade.out)throw Error('The position does not hold enough output inventory.');
    owner[input]-=trade.gross;owner[output]+=trade.out;state.reserves[input]+=trade.net;state.reserves[output]-=trade.out;
    state.lpFees[input]+=trade.lpFee;state.feeGrowth[input]+=trade.feeGrowthX128;state.hookPending[input]+=trade.hookFee;state.volume[input]+=trade.gross;state.feeTotal[input]+=trade.hookFee;state.trades++;
    state.model={...state.model,p:trade.next,tick:trade.tick,price:trade.after};
    return {kind:op,actor,input,output,...trade,description:`${op==='buy'?'Buy':'Sell'} from the preceding state`};
  }
  if(op==='flush'){
    arity(0);const totalWeight=sum(state.recipients.map(r=>r.weight)),deposited={...state.hookPending};
    for(const asset of ['token','quote']){let used=0n;state.recipients.forEach((r,i)=>{const amount=i===state.recipients.length-1?deposited[asset]-used:deposited[asset]*r.weight/totalWeight;used+=amount;const claim=state.claims[r.account]||(state.claims[r.account]=wallet());claim[asset]+=amount;});state.hookPending[asset]=0n;}
    return {kind:op,deposited,description:'Pending hook fees deposited using the current splitter weights'};
  }
  if(op==='claim'){
    arity(1);const recipient=state.recipients.find(r=>r.id===args[0]);if(!recipient)throw Error('Choose a recipient number shown in the fee split.');
    const claim=state.claims[recipient.account]||wallet();if(claim.token+claim.quote===0n)throw Error('This recipient has no deposited fees to claim. Flush accrued fees first.');
    const received={...claim},owner=account(state,recipient.account);owner.token+=claim.token;owner.quote+=claim.quote;state.claims[recipient.account]=wallet();
    return {kind:op,recipient:recipient.label,received,description:'Deposited fee claims transferred to their beneficiary'};
  }
  if(op==='weights'){
    if(args.length!==state.recipients.length)throw Error('Supply one positive integer weight for each existing recipient.');
    state.recipients=state.recipients.map((r,i)=>{if(!/^\d{1,19}$/.test(args[i])||BigInt(args[i])<=0n||BigInt(args[i])>10n**18n)throw Error('Use positive weights up to 10¹⁸.');return {...r,weight:BigInt(args[i])};});
    return {kind:op,description:'Future flushes use the new weights; existing claims are preserved'};
  }
  if(op==='advance'){arity(1);const days=whole(args[0],'Days to advance',1);state.now+=days*DAY;return {kind:op,days,description:'Only time advances; prices do not move by themselves'};}
  if(op==='unlock'||op==='release'){
    arity(0);const l=state.lock,vested=state.now<l.cliff?0n:state.now>=l.end?l.amount:l.amount*BigInt(state.now)/BigInt(l.end),amount=vested-l.released;
    if(amount<=0n)throw Error('No retained tokens are releasable at this scenario time.');l.released+=amount;l.remaining-=amount;account(state,'creator').token+=amount;
    return {kind:'unlock',amount,description:'Release from the optional retained-token vesting assumption; a sale still requires an explicit sell event'};
  }
  throw Error('Use fund, buy, sell, flush, claim, weights, advance or unlock.');
}
function run(initial,events,apply,check){
  let state=initial;const history=[];
  for(const event of parseEvents(events)){
    const next=structuredClone(state);
    try{const result=apply(next,event.text),conservation=check(next);state=next;history.push({...event,...result,status:'applied',conservation,price:state.model?.price??null,now:state.now,reserves:state.reserves?{...state.reserves}:null});}
    catch(error){history.push({...event,status:'rejected',error:error.message});break;}
  }
  return {state,history,complete:!history.some(e=>e.status==='rejected'),conservation:check(state)};
}
export function replayPool(d,events=d.eventSequence,options={}){
  const result=run(initialPoolState(d,options),events,poolEvent,poolConservation);
  return {...result,scope:SCENARIO_SCOPE,lpFeesCollectible:{token:result.state.feeGrowth.token*result.state.model.l/Q128,quote:result.state.feeGrowth.quote*result.state.model.l/Q128},opening:poolModel(d,options.tokenIs0??d.scenarioTokenOrder!=='token1')};
}

export function saleConservation(state){
  const held=funds(state),token=held.token+state.saleTokens+state.lpToken+state.founderLocked,quote=held.quote+state.escrow+state.lpQuote+state.treasuryLocked;
  invariant(token===state.terms.supply,'community-sale token allocations and outstanding claims.');invariant(quote===state.fundingIntroduced,'contributions, withdrawals, refunds, liquidity and treasury.');
  return {balanced:true,token,quote,tokenExpected:state.terms.supply,quoteExpected:state.fundingIntroduced};
}
function initialSaleState(d){const terms=saleComposition(d);return {terms,now:0,closes:terms.hours*3600,status:'funding',accounts:{},contributions:{},claimed:{},saleTokens:terms.supply,escrow:0n,raised:0n,fundingIntroduced:0n,lpToken:0n,lpQuote:0n,founderLocked:0n,treasuryLocked:0n,founderReleased:0n,treasuryReleased:0n,settledAt:null};}
function saleEvent(s,text){
  const [op,...args]=parts(text),arity=n=>{if(args.length!==n)throw Error(`${op} expects ${n} value${n===1?'':'s'}.`);};
  if(op==='contribute'||op==='withdraw'){
    arity(2);if(s.status!=='funding'||s.now>=s.closes)throw Error('The contribution window is closed.');const actor=person(args[0]),amount=units(args[1]),paid=s.contributions[actor]||0n;
    if(op==='contribute'){
      if(s.raised+amount>s.terms.hard)throw Error('Contribution exceeds the hard cap; this sale rejects overflow.');
      if((paid+amount)*s.terms.publicTokens/s.terms.hard===0n)throw Error('Contribution would round to zero allocation.');
      s.raised+=amount;s.escrow+=amount;s.fundingIntroduced+=amount;s.contributions[actor]=paid+amount;
    }else{
      if(amount>paid)throw Error('Withdrawal exceeds this participant’s contribution.');const left=paid-amount;if(left!==0n&&left*s.terms.publicTokens/s.terms.hard===0n)throw Error('Remaining contribution would round to zero allocation.');
      s.contributions[actor]=left;s.raised-=amount;s.escrow-=amount;account(s,actor).quote+=amount;
    }return {kind:op,actor,amount,description:op==='contribute'?'Funded contribution accepted':'Contribution returned before close'};
  }
  if(op==='close'){arity(0);s.now=Math.max(s.now,s.closes);return {kind:op,description:'The funding deadline passes; settlement still needs its own event'};}
  if(op==='advance'){arity(1);const days=whole(args[0],'Days to advance',1);s.now+=days*DAY;return {kind:op,days,description:'Advance the clock without executing a transaction'};}
  if(op==='settle'){
    arity(0);if(s.status!=='funding'||s.now<s.closes)throw Error('Settlement requires a closed, unsettled sale.');s.settledAt=s.now;s.status=s.raised>=s.terms.soft?'successful':'refundable';
    if(s.status==='successful'){s.lpToken=s.terms.lp;s.founderLocked=s.terms.founder;s.saleTokens=s.terms.publicTokens;s.lpQuote=s.raised*BigInt(s.terms.liquidityBps)/10000n;s.treasuryLocked=s.raised-s.lpQuote;s.escrow=0n;}
    return {kind:op,outcome:s.status,description:s.status==='successful'?'Fund NativeMarket liquidity and create founder/treasury locks':'Full refunds become claimable; no pool is funded'};
  }
  if(op==='claim'){
    arity(1);const actor=person(args[0]),paid=s.contributions[actor]||0n;if(!['successful','refundable'].includes(s.status)||!paid||s.claimed[actor])throw Error('No unclaimed settled contribution for this participant.');
    const refund=s.status==='refundable',amount=refund?paid:paid*s.terms.publicTokens/s.raised;if(!amount)throw Error('Allocation rounds to zero.');s.claimed[actor]=true;
    if(refund){s.escrow-=amount;account(s,actor).quote+=amount;}else{s.saleTokens-=amount;account(s,actor).token+=amount;}
    return {kind:op,actor,amount,refund,description:refund?'Full contribution refunded once':'Fixed pro-rata token allocation claimed once'};
  }
  if(op==='release'){
    arity(0);if(s.status!=='successful')throw Error('Only a successful settlement creates vesting locks.');const elapsed=s.now-s.settledAt,vested=elapsed<30*DAY?0n:elapsed>=s.terms.vesting?s.terms.founder:s.terms.founder*BigInt(elapsed)/BigInt(s.terms.vesting),token=vested-s.founderReleased,quote=elapsed>=s.terms.vesting?s.treasuryLocked:0n;
    if(token+quote===0n)throw Error('No founder or treasury assets are releasable yet.');s.founderLocked-=token;s.founderReleased+=token;s.treasuryLocked-=quote;s.treasuryReleased+=quote;const owner=account(s,'creator');owner.token+=token;owner.quote+=quote;
    return {kind:op,token,quote,description:'Release vested assets to the original fixed creator beneficiary'};
  }
  throw Error('Use contribute, withdraw, close, settle, claim, advance or release.');
}
export function replaySale(d,events=d.saleSequence){const result=run(initialSaleState(d),events,saleEvent,saleConservation);return {...result,scope:'GenesisLaunchpad integer allocations, hard-cap rejection, withdrawal, settlement, one-time claims and TimeVault release formulas. NativeMarket trading, transaction gas, chain ordering and external activity are excluded.'};}
export function scenarioJSON(result){return JSON.parse(JSON.stringify(result,(_,v)=>typeof v==='bigint'?v.toString():v));}
