import {publicIntent,intentHash,REHEARSAL_SCHEMA} from './intent.mjs';
export class RehearsalClient {
  constructor(){this.endpoint='http://127.0.0.1:8788';this.token='';this.generation=0;}
  configure(endpoint,token){const u=new URL(endpoint);if(u.username||u.password||u.hash||u.search||!(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))throw Error('Use HTTPS or a loopback rehearsal service.');if(token.length<32)throw Error('Paste the local rehearsal session token.');this.endpoint=u.origin;this.token=token;}
  invalidate(){this.generation++;this.abort?.abort();this.abort=null;}
  lock(){this.invalidate();this.token='';}
  async run(plan,provider){
    this.invalidate();const generation=this.generation,intent=publicIntent(plan);if(!this.token)throw Error('Start the local rehearsal service and enter its session token.');
    const controller=new AbortController();this.abort=controller;const timer=setTimeout(()=>controller.abort(),45000);
    try{
      const response=await fetch(this.endpoint+'/rehearse',{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',headers:{'content-type':'application/json',authorization:'Bearer '+this.token},body:JSON.stringify(intent),signal:controller.signal});
      if(!response.ok)throw Error('Rehearsal service declined this request. Check the supported action, session token and source chain.');
      const text=await response.text();if(text.length>500000)throw Error('Rehearsal response is too large.');const report=JSON.parse(text);
      if(generation!==this.generation)throw Error('Rehearsal was cancelled.');
      if(report.schema!==REHEARSAL_SCHEMA||report.intentHash!==intentHash(intent)||report.chainId!==intent.chainId||!['succeeded','reverted'].includes(report.status))throw Error('Rehearsal does not match these exact transaction terms.');
      const block=await provider.getBlock(Number(report.sourceBlock.number));if(!block||block.hash!==report.sourceBlock.hash)throw Error('Rehearsal source block is not canonical on the connected wallet chain.');
      if(!Array.isArray(report.balances)||report.balances.length>40||!Array.isArray(report.allowances)||report.allowances.length>30||!Array.isArray(report.locks)||report.locks.length>20)throw Error('Invalid rehearsal observations.');
      return report;
    }finally{clearTimeout(timer);if(this.abort===controller)this.abort=null;}
  }
}
export function bindRehearsal(plan,report){if(report.status!=='succeeded'||report.intentHash!==intentHash(publicIntent(plan)))throw Error('A reverted or mismatched rehearsal cannot authorize a review.');plan.rehearsalBinding={intentHash:report.intentHash,sourceBlock:report.sourceBlock,nonce:report.authority.before.nonce,createdAt:Date.now()};return plan;}
export async function assertRehearsal(plan,provider,account){const b=plan.rehearsalBinding;if(!b)return;if(Date.now()-b.createdAt>120000||intentHash(publicIntent(plan))!==b.intentHash)throw Error('Rehearsal expired or transaction terms changed. Rehearse again.');const block=await provider.getBlock(Number(b.sourceBlock.number));if(block?.hash!==b.sourceBlock.hash||String(await account.actionNonce())!==b.nonce)throw Error('Rehearsal state changed. Rehearse again.');}
