import fs from 'node:fs';
import {ExactEvmScheme} from '@x402/evm/exact/client';
import {Interface,getAddress,keccak256,toUtf8Bytes,verifyTypedData} from 'ethers';

const authTypes={TransferWithAuthorization:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}]};
export const encodeHeader=value=>Buffer.from(JSON.stringify(value)).toString('base64');
export function decodeHeader(value){if(typeof value!=='string'||value.length>32768||!value.match(/^[A-Za-z0-9+/]+={0,2}$/))throw Error('Invalid payment header');return JSON.parse(Buffer.from(value,'base64').toString('utf8'));}
const canonicalUrl=value=>{const u=new URL(value);if(u.username||u.password||u.hash||!['https:','http:'].includes(u.protocol))throw Error('Invalid service URL');return u.href;};
async function boundedResponseText(response,maxBytes=2_000_000){
  const reader=response.body?.getReader();if(!reader)return '';const chunks=[];let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes)throw Error('Service response exceeds size limit');chunks.push(value);}}
  catch(error){await reader.cancel();throw error;}finally{reader.releaseLock();}
  return Buffer.concat(chunks).toString('utf8');
}

/** Durable reservations never release automatically: a timeout can still be a successful charge. */
export class PurchaseLedger {
  constructor(file,{budget,maxPurchases=100}){this.file=file;this.budget=BigInt(budget);this.maxPurchases=maxPurchases;if(this.budget<=0n||!Number.isInteger(maxPurchases)||maxPurchases<1)throw Error('Invalid payment budget');}
  summary(){const state=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{reserved:'0',purchases:{}};return {budget:String(this.budget),reserved:String(state.reserved),remaining:String(this.budget-BigInt(state.reserved)),purchaseCount:Object.keys(state.purchases).length,maxPurchases:this.maxPurchases};}
  change(fn){const fd=fs.openSync(this.file+'.lock','wx',0o600);try{const state=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{reserved:'0',purchases:{}};const result=fn(state);const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(tmp,this.file);return result;}finally{fs.closeSync(fd);fs.unlinkSync(this.file+'.lock');}}
  reserve(id,amount,details){return this.change(state=>{if(typeof id!=='string'||!id.match(/^[a-zA-Z0-9_-]{1,100}$/)||Object.hasOwn(state.purchases,id))throw Error('Purchase request replay');if(BigInt(amount)<=0n||BigInt(state.reserved)+BigInt(amount)>this.budget||Object.keys(state.purchases).length>=this.maxPurchases)throw Error('Payment budget exhausted');state.reserved=String(BigInt(state.reserved)+BigInt(amount));state.purchases[id]={status:'reserved',amount:String(amount),...details};});}
  record(id,event){return this.change(state=>{if(!Object.hasOwn(state.purchases,id))throw Error('Unknown purchase');Object.assign(state.purchases[id],event);});}
}

/** v2 HTTP exact/EIP-3009 only. Uses official @x402/evm, with pinned chain/token/domain/recipient. */
export class ExactX402Buyer {
  constructor({signer,allowed,ledger,transport,verifySettlement,authority=async()=>true}){
    if(typeof transport!=='function'||typeof verifySettlement!=='function')throw Error('Configured transport and settlement verifier are required');
    this.signer=signer;this.allowed=structuredClone(allowed);this.ledger=ledger;this.transport=transport;this.verifySettlement=verifySettlement;this.authority=authority;this.busy=false;
  }
  async purchase({id,url,method='GET',body}){
    if(this.busy)throw Error('Payment client is busy');this.busy=true;
    try{
      url=canonicalUrl(url);if(!['GET','POST'].includes(method)||(method==='GET'&&body!=null))throw Error('Unsupported service request');
      const pins=this.allowed.filter(p=>canonicalUrl(p.url)===url);if(!pins.length)throw Error('Service URL is not authorized');
      const send=headers=>this.transport(url,{method,body,headers,redirect:'error',signal:AbortSignal.timeout(15000)});
      const first=await send({'content-type':'application/json'});
      if(first.status!==402)throw Error('Expected explicit HTTP 402 payment challenge');
      const challenge=decodeHeader(first.headers.get('PAYMENT-REQUIRED'));
      if(challenge.x402Version!==2||canonicalUrl(challenge.resource?.url)!==url||!Array.isArray(challenge.accepts)||challenge.accepts.length>20||Object.keys(challenge.extensions??{}).length)throw Error('Unsupported or mismatched payment challenge');
      let selected,pin;
      for(const candidate of challenge.accepts){const match=pins.find(p=>candidate.scheme==='exact'&&candidate.network===p.network&&/^eip155:[1-9][0-9]*$/.test(candidate.network)&&getAddress(candidate.asset)===getAddress(p.asset)&&getAddress(candidate.payTo)===getAddress(p.payTo)&&candidate.extra?.name===p.name&&candidate.extra?.version===p.version&&(candidate.extra?.assetTransferMethod??'eip3009')==='eip3009'&&(candidate.extra?.paymentFlow??'authorization')==='authorization'&&/^\d+$/.test(candidate.amount)&&BigInt(candidate.amount)>0n&&BigInt(candidate.amount)<=BigInt(p.maxAmount)&&Number.isInteger(candidate.maxTimeoutSeconds)&&candidate.maxTimeoutSeconds>0&&candidate.maxTimeoutSeconds<=p.maxTimeoutSeconds);if(match){selected=candidate;pin=match;break;}}
      if(!selected)throw Error('No authorized exact EIP-3009 offer');
      if(!(await this.authority()))throw Error('Payment authority revoked');
      const payer=getAddress(await this.signer.getAddress());
      const domain={name:pin.name,version:pin.version,chainId:BigInt(pin.network.split(':')[1]),verifyingContract:getAddress(pin.asset)};
      this.ledger.reserve(id,selected.amount,{url,network:pin.network,asset:pin.asset,payTo:pin.payTo,payer,requestHash:keccak256(toUtf8Bytes(JSON.stringify({method,url,body:body??null}))),challengeHash:keccak256(toUtf8Bytes(JSON.stringify(challenge)))});
      const scheme=new ExactEvmScheme({address:payer,signTypedData:async request=>{
        const a=request.message;const now=BigInt(Math.floor(Date.now()/1000));
        if(request.primaryType!=='TransferWithAuthorization'||request.domain.name!==domain.name||request.domain.version!==domain.version||BigInt(request.domain.chainId)!==domain.chainId||getAddress(request.domain.verifyingContract)!==domain.verifyingContract||getAddress(a.from)!==payer||getAddress(a.to)!==getAddress(pin.payTo)||BigInt(a.value)!==BigInt(selected.amount)||BigInt(a.validAfter)>now||BigInt(a.validBefore)<=now||BigInt(a.validBefore)>now+BigInt(pin.maxTimeoutSeconds)||!(await this.authority()))throw Error('Payment signing scope mismatch');
        return this.signer.signTypedData(domain,authTypes,a);
      }});
      const result=await scheme.createPaymentPayload(2,selected);
      const payload={...result,accepted:selected,resource:challenge.resource};
      const authorization=payload.payload.authorization;
      if(getAddress(verifyTypedData(domain,authTypes,authorization,payload.payload.signature))!==payer)throw Error('Payment signer mismatch');
      this.ledger.record(id,{status:'authorized',nonce:authorization.nonce,signatureHash:keccak256(payload.payload.signature)});
      const response=await send({'content-type':'application/json','PAYMENT-SIGNATURE':encodeHeader(payload)});
      const settlement=decodeHeader(response.headers.get('PAYMENT-RESPONSE'));
      if(!response.ok||settlement.success!==true||settlement.network!==pin.network||getAddress(settlement.payer)!==payer||!/^0x[0-9a-fA-F]{64}$/.test(settlement.transaction))throw Error('Service delivery or settlement failed; budget remains reserved');
      if(!(await this.verifySettlement({settlement,payload,pin})))throw Error('Settlement could not be independently verified; budget remains reserved');
      const text=await boundedResponseText(response);
      this.ledger.record(id,{status:'settled',transaction:settlement.transaction,responseHash:keccak256(toUtf8Bytes(text))});
      return {id,body:text,settlement};
    }finally{this.busy=false;}
  }
}

/** Uses only the configured provider; checks receipt plus exact token Transfer and nonce-use logs. */
export function eip3009ReceiptVerifier(provider,{confirmations=1}={}){
  const events=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)','event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)']);
  return async({settlement,payload,pin})=>{
    if((await provider.getNetwork()).chainId!==BigInt(pin.network.split(':')[1]))return false;
    const r=await provider.getTransactionReceipt(settlement.transaction);if(!r||r.status!==1||await r.confirmations()<confirmations)return false;
    const a=payload.payload.authorization;const logs=r.logs.filter(l=>getAddress(l.address)===getAddress(pin.asset)).map(l=>{try{return events.parseLog(l);}catch{return null;}});
    return logs.some(e=>e?.name==='Transfer'&&getAddress(e.args.from)===getAddress(a.from)&&getAddress(e.args.to)===getAddress(a.to)&&e.args.value===BigInt(a.value))&&logs.some(e=>e?.name==='AuthorizationUsed'&&getAddress(e.args.authorizer)===getAddress(a.from)&&e.args.nonce===a.nonce);
  };
}
