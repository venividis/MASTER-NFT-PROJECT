export const SCENARIO_OPTIONS = Object.freeze({cca:{protocolFeePips:{type:'integer',minimum:0,maximum:1000000,default:10000}},doppler:{proceedsShare:{type:'decimal',minimum:0,maximum:0.5,default:'0'},tradingFee:{type:'integer',minimum:100,maximum:10000,default:200}}});
export const SCENARIO_ACTIONS = Object.freeze(['advance','bid','trade','quote','checkpoint','exit','claim','migrate','sweepCurrency','sweepTokens','exitLockedLP','collectProtocolFees','collectIntegratorFees']);
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>{if(!record(value)||Object.keys(value).some(k=>!keys.includes(k)))throw Error('Unexpected scenario field. No RPC, addresses, keys or scripts are accepted.');};
const integer=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw Error(`${label} must be an integer from ${min} to ${max}.`);return value;};
const fixed=value=>{const [whole,fraction='']=String(value).split('.');return BigInt(whole)*1000000000000000000n+BigInt(fraction.padEnd(18,'0'));};
const decimal=(value,max,label,zero=false)=>{if(typeof value!=='string'||!/^(?:0|[1-9]\d{0,6})(\.\d{1,18})?$/.test(value))throw Error(`${label} must be a decimal string with at most 18 fractional digits.`);const number=fixed(value);if(number>fixed(max)||(zero?number<0n:number<=0n))throw Error(`${label} is outside its scenario bounds.`);return value;};
export function validateScenarioCreate(input){
 exact(input,['mechanism','outcome','options']);const {mechanism,outcome='success'}=input;
 if(!['cca','doppler'].includes(mechanism)||!['success','failed-minimum','migration-failure'].includes(outcome)||(mechanism==='doppler'&&outcome==='migration-failure'))throw Error('Choose a supported mechanism and outcome.');
 const options=input.options||{},rules=SCENARIO_OPTIONS[mechanism];exact(options,Object.keys(rules));const normalized={};
 for(const [key,value] of Object.entries(options)){const rule=rules[key];normalized[key]=rule.type==='integer'?integer(value,rule.minimum,rule.maximum,key):decimal(value,rule.maximum,key,true);}
 return {mechanism,outcome,options:normalized};
}
export function validateScenarioCommand(input){
 if(!record(input)||!SCENARIO_ACTIONS.includes(input.action))throw Error('Choose a listed scenario action.');const {action}=input;
 if(action==='advance'){exact(input,['action','phase']);if(!['start','end','claim','unlock'].includes(input.phase))throw Error('Choose a known scenario phase.');return {...input};}
 if(['bid','trade','quote'].includes(action)){
  exact(input,action==='bid'?['action','actor','amount','maxPrice']:['action','actor','side','amount','minimumOut']);integer(input.actor,0,1,'Actor');
  const side=action==='bid'?'buy':input.side;if(!['buy','sell'].includes(side))throw Error('Choose buy or sell.');decimal(input.amount,side==='sell'?1000000:1000,'Amount');
  if(action==='bid')decimal(input.maxPrice,1000,'Maximum price');else if(input.minimumOut!==undefined)decimal(input.minimumOut,1000000,'Minimum output',true);
  return {...input};
 }
 if(['exit','claim'].includes(action)){exact(input,['action','bidId']);integer(input.bidId,0,10000,'Bid ID');return {...input};}
 exact(input,['action']);return {...input};
}
