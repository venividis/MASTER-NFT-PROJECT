import {keccak256} from '../evm.mjs';
export const ZERO_ADDRESS='0x'+'0'.repeat(40);
export function validateRoutePlan(raw){
 if(!Array.isArray(raw)||!raw.length||raw.length>64)throw Error('Choose 1 to 64 recipients.');
 const seen=new Set();return raw.map(r=>{if(!/^0x[\da-f]{40}$/i.test(r.recipient)||r.recipient.toLowerCase()===ZERO_ADDRESS)throw Error('Each recipient needs a nonzero wallet or contract address.');const recipient=r.recipient.toLowerCase();if(seen.has(recipient))throw Error('Combine duplicate recipients into one weight.');seen.add(recipient);if(!/^\d{1,19}$/.test(String(r.weight))||BigInt(r.weight)<1n||BigInt(r.weight)>10n**18n)throw Error('Use a positive integer weight up to 10¹⁸.');if(!/^0x[\da-f]{40}$/i.test(r.outputToken))throw Error('Output token must be a contract address; zero means native currency.');return {recipient,weight:String(BigInt(r.weight)),outputToken:r.outputToken.toLowerCase()};});
}
export function splitExact(amount,routes){const rs=validateRoutePlan(routes),n=BigInt(amount);if(n<0n||n>=1n<<256n)throw Error('Amount out of range.');const total=rs.reduce((a,r)=>a+BigInt(r.weight),0n);let used=0n;return rs.map((r,i)=>{const share=i===rs.length-1?n-used:n*BigInt(r.weight)/total;used+=share;return {...r,amount:share.toString()};});}
export function routeCommitment(routes){return keccak256(JSON.stringify({domain:'AWE_OWNER_ROUTES_V1',routes:validateRoutePlan(routes)}));}
export function launchTerms(raw){
 const r={name:String(raw.name||'').trim(),symbol:String(raw.symbol||'').trim(),supply:String(raw.supply||''),recipient:String(raw.recipient||'').toLowerCase(),hook:String(raw.hook||ZERO_ADDRESS).toLowerCase(),feePpm:Number(raw.feePpm),routes:validateRoutePlan(raw.routes)};
 if(r.name.length<1||r.name.length>80||!/^[A-Za-z][A-Za-z0-9]{0,11}$/.test(r.symbol))throw Error('Choose a name and a 1–12 character ticker.');
 if(!/^\d{1,60}$/.test(r.supply)||BigInt(r.supply)<1n||BigInt(r.supply)>=1n<<256n)throw Error('Supply must be a positive raw-unit integer.');
 if(!/^0x[\da-f]{40}$/.test(r.recipient)||r.recipient===ZERO_ADDRESS||!/^0x[\da-f]{40}$/.test(r.hook))throw Error('Choose valid recipient and hook addresses.');
 if(!Number.isSafeInteger(r.feePpm)||r.feePpm<0||r.feePpm>1000000)throw Error('Fee must be 0–1,000,000 ppm.');
 return {...r,commitment:keccak256(JSON.stringify(['AWE_LAUNCH_TERMS_V1',r]))};
}
