import { Q96, startingPrice, sqrtAtTick, liquidityForBudgets } from '../v4/math.mjs';
import { splitExact, ZERO_ADDRESS } from '../confluence/economy.mjs';

const MAX = (1n << 127n) - 1n;
const PIPS = 1000000n;
export const defaults = () => ({
  mode: 'pool', name: 'Aurora', symbol: 'AURA', purpose: '', supply: '1000000',
  quoteSymbol: 'WETH', quoteDecimals: '18', quoteToken: '', tokenBudget: '400000',
  quoteBudget: '10', price: '0.00002', feePercent: '0.30', range: 'full',
  lowerPrice: '0.000005', upperPrice: '0.00008', tickSpacing: '60',
  funding: 'public', soft: '1', hard: '20', hours: '24', founderPercent: '10',
  liquidityPercent: '80', vestingDays: '180', raised: '10', contribution: '0.1',
  direction: 'buy', tradeAmount: '0.1', volume: '100', hookEnabled: false,
  eventSequence: 'fund alice 1\nbuy alice 0.1\nbuy alice 0.2\nsell alice 100\nflush',
  saleSequence: 'contribute alice 2\ncontribute bob 4\nwithdraw alice 1\nclose\nsettle\nclaim alice\nclaim bob\nadvance 180\nrelease',
  retainedLockAmount: '0', retainedCliffDays: '30', retainedVestingDays: '180', scenarioTokenOrder: 'token0',
  hookPercent: '0.50', recipients: [{label:'', recipient:'', weight:'1', outputToken:ZERO_ADDRESS}],
});

export function units(value, decimals = 18, {zero = false, label = 'Amount'} = {}) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw Error('Token decimals must be between 0 and 36.');
  const str = String(value).trim();
  if (!/^\d{1,40}(\.\d{1,36})?$/.test(str)) throw Error(`${label}: use a plain positive decimal number.`);
  const [whole, fraction = ''] = str.split('.');
  if (fraction.length > decimals) throw Error(`${label}: this asset supports ${decimals} decimal places.`);
  const n = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction || '').padEnd(decimals, '0') || '0');
  if (n > MAX || (zero ? n < 0n : n <= 0n)) throw Error(`${label} is outside the supported amount range.`);
  return n;
}
export function decimal(n, decimals = 18) {
  n = BigInt(n); const scale = 10n ** BigInt(decimals);
  return String(n / scale) + (n % scale ? '.' + String(n % scale).padStart(decimals, '0').replace(/0+$/, '') : '');
}
export const number = (n, d = 18) => Number(decimal(n, d));
const ceil = (n, d) => (n + d - 1n) / d;
function integer(value, low, high, label) {
  if (!/^\d+$/.test(String(value))) throw Error(`${label} must be a whole number.`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < low || n > high) throw Error(`${label} must be ${low}–${high}.`);
  return n;
}
export function rate(percent, maxPips = 100000) {
  const p = units(percent, 4, {zero:true, label:'Fee'});
  if (p > BigInt(maxPips)) throw Error(`Fee must be between 0 and ${maxPips / 10000}%.`);
  return Number(p);
}
export function validateIdentity(d) {
  const name = String(d.name).trim(), symbol = String(d.symbol).trim();
  const enc = new TextEncoder();
  if (!name || enc.encode(name).length > (d.mode === 'sale' ? 48 : 128)) throw Error('Enter a token name within the supported length.');
  if (!symbol || enc.encode(symbol).length > 32) throw Error('Enter a symbol of up to 32 UTF-8 bytes.');
  if (d.mode === 'sale' && (!/^[A-Z][A-Z0-9]{1,9}$/.test(symbol) || symbol === 'ETH')) throw Error('For a community sale use a unique 2–10 character uppercase ticker.');
  if (String(d.purpose).length > 2000 || (d.mode==='sale' && enc.encode(String(d.purpose)).length>1024)) throw Error(d.mode==='sale'?'Keep the sale description within 1,024 UTF-8 bytes.':'Keep the description within 2,000 characters.');
  units(d.supply, 18, {label:'Supply'});
  if (!['pool','sale'].includes(d.mode)) throw Error('Choose an instant pool or community sale.');
  return {name,symbol};
}
export function tickAt(p) {
  let low = -887272, high = 887272;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (sqrtAtTick(mid) <= p) low = mid; else high = mid - 1;
  }
  return low;
}
export function rangeTicks(d, tokenIs0 = true) {
  const spacing = integer(d.tickSpacing, 1, 32767, 'Tick spacing');
  const min = Math.ceil(-887272 / spacing) * spacing, max = Math.floor(887272 / spacing) * spacing;
  if (d.range === 'full') return {lower:min, upper:max, spacing};
  if (d.range !== 'custom') throw Error('Choose full range or a custom range.');
  const decimals = integer(d.quoteDecimals, 0, 36, 'Quote decimals');
  if (Number(d.lowerPrice) >= Number(d.upperPrice)) throw Error('The lower price must be below the upper price.');
  const p1 = startingPrice(d.lowerPrice, decimals, tokenIs0), p2 = startingPrice(d.upperPrice, decimals, tokenIs0);
  const lo = p1 < p2 ? p1 : p2, hi = p1 < p2 ? p2 : p1;
  const lower = Math.max(min, Math.floor(tickAt(lo) / spacing) * spacing);
  const hiTick = tickAt(hi), exact = sqrtAtTick(hiTick) === hi;
  const upper = Math.min(max, Math.ceil((hiTick + (exact ? 0 : 1)) / spacing) * spacing);
  if (lower >= upper) throw Error('Widen this range or reduce tick spacing.');
  return {lower,upper,spacing};
}
export function humanPrice(p, quoteDecimals, tokenIs0 = true) {
  const raw = (Number(p) / Number(Q96)) ** 2;
  return (tokenIs0 ? raw : 1 / raw) * 10 ** (18 - quoteDecimals);
}
// Positive token deltas round up exactly as liquidity funding does in v4.
function amount0(a, b, l, up = false) {
  return up ? ceil(ceil(l * Q96 * (b - a), b), a) : l * Q96 * (b - a) / b / a;
}
function amount1(a, b, l, up = false) { return up ? ceil(l * (b - a), Q96) : l * (b - a) / Q96; }
export function poolModel(d, tokenIs0 = true) {
  validateIdentity(d);
  const qd = integer(d.quoteDecimals, 0, 36, 'Quote decimals');
  const supply = units(d.supply), tokenBudget = units(d.tokenBudget), quoteBudget = units(d.quoteBudget, qd);
  if (tokenBudget > supply) throw Error('Liquidity tokens cannot exceed the total supply.');
  if (!String(d.quoteSymbol).trim() || String(d.quoteSymbol).length > 16) throw Error('Give the quote asset a short symbol.');
  const fee = rate(d.feePercent), hookFee = d.hookEnabled ? rate(d.hookPercent,999999) : 0, ticks = rangeTicks(d, tokenIs0);
  const p = startingPrice(d.price, qd, tokenIs0), a = sqrtAtTick(ticks.lower), b = sqrtAtTick(ticks.upper);
  const l = liquidityForBudgets(p,a,b, tokenIs0 ? tokenBudget : quoteBudget, tokenIs0 ? quoteBudget : tokenBudget);
  const used0 = p >= b ? 0n : amount0(p > a ? p : a,b,l,true);
  const used1 = p <= a ? 0n : amount1(a,p < b ? p : b,l,true);
  const usedToken = tokenIs0 ? used0 : used1, usedQuote = tokenIs0 ? used1 : used0;
  if (usedToken > tokenBudget || usedQuote > quoteBudget) throw Error('Liquidity funding exceeds its budget after rounding. Increase the budget slightly.');
  const lowerPrice = humanPrice(tokenIs0 ? a : b,qd,tokenIs0), upperPrice = humanPrice(tokenIs0 ? b : a,qd,tokenIs0);
  const price = humanPrice(p,qd,tokenIs0), tokenN = number(usedToken), quoteN = number(usedQuote,qd);
  return {kind:'pool',supply,tokenBudget,quoteBudget,qd,fee,hookFee,ticks,p,tick:tickAt(p),a,b,l,tokenIs0,usedToken,usedQuote,
    tokenRefund:tokenBudget-usedToken,quoteRefund:quoteBudget-usedQuote,retained:supply-usedToken,
    lowerPrice,upperPrice,price,active:p>=a&&p<=b,fdv:number(supply)*price,positionValue:quoteN+tokenN*price};
}
export function poolTrade(m, direction, value) {
  if (!['buy','sell'].includes(direction)) throw Error('Choose buy or sell.');
  if (!m.active) throw Error('The opening price is outside this position’s range. Move the range around the opening price to explore a trade.');
  const buy = direction === 'buy', zeroForOne = buy ? !m.tokenIs0 : m.tokenIs0;
  if((m.p===m.a&&zeroForOne)||(m.p===m.b&&!zeroForOne))throw Error('This direction moves beyond the funded range. Try the opposite trade or widen the range.');
  const gross = units(value,buy?m.qd:18), hookFee=gross*BigInt(m.hookFee||0)/PIPS, poolInput=gross-hookFee;
  let remaining=poolInput,next=m.p,tick=m.tick??tickAt(m.p),net=0n,out=0n,lpFee=0n,feeGrowthX128=0n,steps=0;
  // One funded position, traversing the same 256-tick bitmap words as the pinned
  // v4 Pool. Rounding is applied per swap step, not once to the aggregate input.
  while(remaining>0n){
    if(++steps>10000)throw Error('This scenario crosses too many tick words.');
    if((next===m.a&&zeroForOne)||(next===m.b&&!zeroForOne))throw Error('This trade reaches the edge of the funded range. Reduce the amount or widen the range; partial fills are rejected.');
    const compressed=Math.floor(tick/m.ticks.spacing),search=zeroForOne?compressed:compressed+1;
    const word=Math.floor(search/256),wordEdge=(zeroForOne?word*256:word*256+255)*m.ticks.spacing;
    const boundary=zeroForOne?m.ticks.lower:m.ticks.upper;
    const nextTick=zeroForOne?Math.max(wordEdge,boundary):Math.min(wordEdge,boundary);
    const target=sqrtAtTick(nextTick),lessFee=remaining*(PIPS-BigInt(m.fee))/PIPS;
    const required=zeroForOne?amount0(target,next,m.l,true):amount1(next,target,m.l,true);
    let input,fee,after;
    if(lessFee>=required){input=required;after=target;fee=ceil(input*BigInt(m.fee),PIPS-BigInt(m.fee));}
    else {input=lessFee;const numerator=m.l*Q96,product=input*next,max256=(1n<<256n)-1n;
      after=zeroForOne?(input===0n?next:product<=max256&&numerator+product<=max256?ceil(numerator*next,numerator+product):ceil(numerator,numerator/next+input)):next+input*Q96/m.l;fee=remaining-input;}
    const output=zeroForOne?amount1(after,next,m.l):amount0(next,after,m.l);
    remaining-=input+fee;net+=input;lpFee+=fee;out+=output;feeGrowthX128+=fee*(1n<<128n)/m.l;
    tick=after===target?(zeroForOne?nextTick-1:nextTick):tickAt(after);next=after;
  }
  if (out <= 0n) throw Error('This trade rounds to zero output. Increase the amount.');
  const inputN = number(gross,buy?m.qd:18), outputN = number(out,buy?18:m.qd);
  const average = buy ? inputN/outputN : outputN/inputN;
  return {gross,hookFee,poolInput,net,fee:lpFee,lpFee,out,next,tick,feeGrowthX128,steps,after:humanPrice(next,m.qd,m.tokenIs0),average,
    impact:buy?(average/m.price-1)*100:(1-average/m.price)*100};
}
export function saleTerms(d) {
  validateIdentity(d);
  const founderBps = rate(d.founderPercent,200000)/100, liquidityBps = rate(d.liquidityPercent,1000000)/100;
  if (!Number.isInteger(founderBps)||!Number.isInteger(liquidityBps)||liquidityBps<5000) throw Error('Use up to two decimal places: founder 0–20%; liquidity 50–100%.');
  const supply=units(d.supply),soft=units(d.soft),hard=units(d.hard),hours=integer(d.hours,1,720,'Sale hours');
  const vestingDays=integer(d.vestingDays??'180',30,1825,'Vesting days');
  if([supply,soft,hard].some(n=>n>(1n<<112n)-1n))throw Error('Sale amounts must fit the contract’s 112-bit amount range.');
  if (supply<10n**18n || soft<1000000000n || soft>hard) throw Error('Use at least one token, a minimum raise of 0.000000001 ETH, and a maximum at least as high as the minimum.');
  return {name:d.name.trim(),symbol:d.symbol.trim(),supply,soft,hard,hours,founderBps,liquidityBps,vestingDays,vesting:vestingDays*86400,about:String(d.purpose||'')};
}
export function saleComposition(d) {
  const t=saleTerms(d), founder=t.supply*BigInt(t.founderBps)/10000n;
  const publicTokens=(t.supply-founder)*10000n/BigInt(10000+t.liquidityBps), lp=t.supply-founder-publicTokens;
  return {kind:'sale',...t,founder,publicTokens,lp};
}
export function saleModel(d) {
  const base=saleComposition(d),t=base,{founder,publicTokens,lp}=base;
  const raised=units(d.raised,18,{zero:true,label:'Scenario raise'});
  if (raised>t.hard) throw Error('The scenario raise cannot exceed the sale maximum.');
  const successful=raised>=t.soft, liquidity=successful?raised*BigInt(t.liquidityBps)/10000n:0n;
  const treasury=successful?raised-liquidity:0n;
  return {kind:'sale',...t,founder,publicTokens,lp,raised,successful,liquidity,treasury,
    price:successful?number(raised)/number(publicTokens):0,
    poolPrice:successful?number(liquidity)/number(lp):0};
}
export function saleAllocation(d,m) {
  const contribution=units(d.contribution);
  if(contribution>m.raised) throw Error('A contribution cannot exceed the scenario’s total raise.');
  return {contribution,tokens:m.successful?contribution*m.publicTokens/m.raised:0n,refund:m.successful?0n:contribution};
}
export function feeFlow(d, {validateAddresses=false}={}) {
  const decimals=integer(d.quoteDecimals,0,36,'Quote decimals'),volume=units(d.volume,decimals,{zero:true,label:'Volume'});
  const fee=rate(d.hookPercent,999999),total=volume*BigInt(fee)/PIPS;
  if(!Array.isArray(d.recipients)||!d.recipients.length||d.recipients.length>64) throw Error('Use 1–64 fee recipients.');
  const weights=d.recipients.map(r=>{
    if(!/^\d{1,19}$/.test(String(r.weight))||BigInt(r.weight)<1n||BigInt(r.weight)>10n**18n)throw Error('Each recipient weight must be a positive whole number up to 10¹⁸.');
    return BigInt(r.weight);
  });
  const all=weights.reduce((a,b)=>a+b,0n);let used=0n;
  const rows=d.recipients.map((r,i)=>{const amount=i===weights.length-1?total-used:total*weights[i]/all;used+=amount;return {...r,amount,percent:Number(weights[i]*1000000n/all)/10000};});
  if(validateAddresses)splitExact(total,d.recipients.map(r=>({...r,outputToken:r.outputToken||ZERO_ADDRESS})));
  return {total,volume,fee,rows,decimals};
}
export function hydrateDraft(raw) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('This is not an Anima launch draft.');
  const base=defaults();
  for(const key of Object.keys(base)) {
    if(key==='recipients')continue;
    if(raw[key]===undefined)continue;
    if(typeof base[key]==='boolean') { if(typeof raw[key]!=='boolean')throw Error('Invalid launch option.');base[key]=raw[key]; }
    else {if(typeof raw[key]!=='string'||raw[key].length>(['eventSequence','saleSequence'].includes(key)?12000:2500))throw Error('Invalid launch field.');base[key]=raw[key];}
  }
  if(raw.recipients!==undefined){
    if(!Array.isArray(raw.recipients)||raw.recipients.length<1||raw.recipients.length>64)throw Error('Invalid recipient list.');
    base.recipients=raw.recipients.map(r=>Object.fromEntries(['label','recipient','weight','outputToken'].map(k=>{
      if(typeof r[k]!=='string'||r[k].length>160)throw Error('Invalid recipient field.');return [k,r[k]];
    })));
  }
  if(!['public','private'].includes(base.funding))throw Error('Invalid funding route.');
  if(!['token0','token1'].includes(base.scenarioTokenOrder))throw Error('Invalid scenario token ordering.');
  if(!['pool','sale'].includes(base.mode)||!['full','custom'].includes(base.range)||!['buy','sell'].includes(base.direction))throw Error('Invalid launch design option.');
  return base;
}
export function exportPlan(d) {
  const m=d.mode==='pool'?poolModel(d):saleComposition(d);
  const result={schema:'anima.launch-design/1',execution:'configuration-only',chainTransaction:null,draft:structuredClone(d),
    deploymentRequirements:['A verified compatible deployment','Token metadata and currency ordering read from chain','A fresh reviewed transaction and explicit signature or proof'],
    assumptions:['No live price feed','No profit forecast','No other market liquidity','No protocol fee included in trade scenarios']};
  if(m.kind==='pool')result.launchIntent={name:d.name.trim(),symbol:d.symbol.trim(),supply:d.supply,quoteToken:d.quoteToken||null,
    quoteDecimalsUnverified:m.qd,tokenBudget:d.tokenBudget,quoteBudget:d.quoteBudget,price:d.price,fee:m.fee,tickSpacing:m.ticks.spacing,
    humanRange:d.range==='full'?{mode:'full'}:{mode:'custom',lower:d.lowerPrice,upper:d.upperPrice},funding:d.funding,
    hooks:d.hookEnabled?null:ZERO_ADDRESS,hookSetupRequired:Boolean(d.hookEnabled),rangeResolution:'Resolve ticks after predicting and sorting the deployed token addresses.',
    ownership:'Redeemable LP shares; retained tokens have no automatic vesting or LP lock.'};
  else result.saleTerms={...saleTerms(d),founderVestingDays:m.vestingDays,founderCliffDays:30,treasuryLockDays:m.vestingDays,funding:'public',model:'ANIMA pro-rata community sale'};
  if(d.hookEnabled&&d.mode==='pool'){
    const flow=feeFlow({...d,volume:'0'},{validateAddresses:true});
    result.hookSetup={attachedToLaunch:true,requiresVerifiedDeployment:true,feePpm:flow.fee,recipients:d.recipients.map(({label,recipient,weight})=>({label,recipient,weight})),
      implementation:'OwnerV4FeeHook + OwnerFeeRouter with the hooked launch factory',
      currency:'Fees accrue and are claimed in each swap input asset; no output conversion.'};
  }
  return JSON.parse(JSON.stringify(result,(_,v)=>typeof v==='bigint'?v.toString():v));
}
