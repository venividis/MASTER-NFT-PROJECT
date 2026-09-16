import {Contract,Interface,ZeroAddress,getAddress,formatEther,keccak256} from '../vendor/ethers.min.js';
import {ARTIFACTS} from './artifacts.mjs';
import {ACTIONS as markets,readMarketState} from './markets.mjs';
import {ACTIONS as agents,mountAgentsDesk} from './agents.mjs';
import {ACTIONS as experimental,prepareExperimentalAction} from './experimental.mjs';
import {ACTIONS as access,mountAccessDesk} from './access.mjs';
import {mountPrivacyDesk} from './privacy/desk.mjs';
import {ACTIONS as privacyActions} from './privacy.mjs';
import {mountWorldsDesk} from './worlds.mjs';
import {mountSecurityDesk} from './security.mjs';
import {mountProofDesk} from './proof.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeJSON=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2);
const field=(name,label,type='address',value)=>({name,label,type,...(value===undefined?{}:{default:value})});
const common=[
 {id:'nft-approve',label:'Approve one NFT for an extension',contract:'IDontFuckingBelieveIt',method:'approve',sender:'wallet',description:'Allows the chosen extension to transfer this one NFT. Verify its terms before approving. Zero address revokes approval.',fields:[field('to','Extension allowed to transfer the NFT'),field('tokenId','NFT token ID','uint256')]},
 {id:'gate-set',label:'Set experiment availability',contract:'ExperimentGate',method:'set',sender:'wallet',description:'The deployment’s guardian may allow or stop new test-network positions. Exits remain available.',fields:[field('module','Experiment contract'),field('active','Allow new exposure','bool',false)]},
];
export const ACTIONS=[...markets,...agents,...experimental,...access,...privacyActions,...common];
export const FEATURES=[
 ['F01','Continuous clearing auction','markets','Standing bids, streamed supply and token/refund claims.'],
 ['F02','Private memory handover','privacy','Encrypt, verify as recipient and transfer the NFT atomically.'],
 ['F03','Autonomous agent','agents','Owner-granted repeating actions with budgets and expiry.'],
 ['F04','Authenticated cross-chain witness','privacy','Pinned LayerZero route; remote witnesses carry no spending power.'],
 ['F05','Encrypted group chat','privacy','Invitations, epoch keys, ciphertext messages and removal.'],
 ['F06','Public-goods matching','markets','Funded capped quadratic matching with a disclosed identity registrar.'],
 ['F07','Sponsored transactions','access','Exact owner and sponsor signatures; bounded deposited gas budget.'],
 ['F08','House leveraged positions','experimental','Isolated real spot positions, repayment and terminal exits.'],
 ['F09','Wager outcome markets','experimental','Funded binary claims with challenges and timeout refunds.'],
 ['F10','Wake keeper windows','experimental','Prepaid seat, takeover compensation and public fallback.'],
 ['F11','Paid agent services','agents','x402 exact payments and a separate ERC-8183 draft job escrow.'],
 ['F12','Provider discovery','agents','Signed provider entries and attributable job feedback.'],
 ['F13','Commissioned instruments','worlds','Review exact source, fund its commission and run approved bytes in isolation.'],
 ['F14','Quote proof research','proof','Public quote arithmetic with a development Groth16 setup; no EVM execution proof.'],
 ['F15','Shared world','worlds','A small server-operated multiplayer game with persistent travellers, towns and trade.'],
 ['F16','ENS mint entry','access','Atomic named minting and verified domain-to-NFT resolution.'],
 ['F17','Frozen NFT custody shares','markets','Account execution freezes in custody. Shares support transfers and funded buyout votes.'],
];
const groups={security:'Authority & recovery',access:'Names & sponsored gas',privacy:'Private communication',agents:'Operators & providers',worlds:'Worlds & workshop',markets:'Custody markets',experimental:'Financial experiments',proof:'Quote proof research'};
const specialistGroups=new Set(['markets','experimental','proof']);
const coreNames=new Set(['SovereignAccount','IDontFuckingBelieveIt','CommissionedCartridges','NativeMarket']);

export function matchesRuntime(code,artifact){
 if(!artifact?.runtime||typeof code!=='string'||!/^0x(?:[\da-f]{2})+$/i.test(code)||!/^0x(?:[\da-f]{2})+$/i.test(artifact.runtime)||code.length!==artifact.runtime.length)return false;
 const mask=new Uint8Array((code.length-2)/2);for(const refs of Object.values(artifact.immutableReferences||{}))for(const {start,length}of refs){if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<0||length<=0||start+length>mask.length)return false;mask.fill(1,start,start+length);}
 for(let i=0;i<mask.length;i++)if(!mask[i]&&code.slice(2+i*2,4+i*2).toLowerCase()!==artifact.runtime.slice(2+i*2,4+i*2).toLowerCase())return false;
 return true;
}
function exactJSON(value,label){
 const parsed=typeof value==='string'?JSON.parse(value):value;
 const inspect=x=>{if(typeof x==='number'&&!Number.isSafeInteger(x))throw Error(label+' needs large integer amounts as quoted decimal strings.');if(Array.isArray(x))x.forEach(inspect);else if(x&&typeof x==='object')Object.values(x).forEach(inspect);};inspect(parsed);return parsed;
}
export function parseActionFields(action,values){return action.fields.filter(f=>f.name!==action.valueField).map(f=>{
 const value=values[f.name];if(value===undefined||value===null)throw Error('Missing '+f.label+'.');
 if(f.type==='bool'){if(value===true||value==='true')return true;if(value===false||value==='false')return false;throw Error(f.label+' must be true or false.');}
 if(f.type==='json'||f.type.includes('[')||f.type.startsWith('tuple'))return exactJSON(value,f.label);
 const integer=/^(u?int)(\d*)$/.exec(f.type);if(integer){
  if(!/^-?\d+$/.test(String(value))||(typeof value==='number'&&!Number.isSafeInteger(value)))throw Error(f.label+' must use whole raw units.');
  const n=BigInt(value),bits=BigInt(integer[2]||256),signed=integer[1]==='int',minimum=signed?-(1n<<(bits-1n)):0n,maximum=signed?(1n<<(bits-1n))-1n:(1n<<bits)-1n;
  if(n<minimum||n>maximum)throw Error(f.label+' is outside '+f.type+'.');return n;
 }
 if(f.type==='address')return getAddress(value);return value;
});}

export class ExtensionDesk {
 constructor(wallet,showReview,read,save,notify=()=>{}){Object.assign(this,{wallet,showReview,read,save,notify});this.group='access';this.generation=0;this.viewRevision=0;this.cleanups=[];this.selected=access[0].id;}
 directory(){return this.read('extension-directory',{schema:'anima.extensions-directory/1',chainId:'',modules:{}});}
 addresses(){const directory=this.directory(),modules={};for(const [name,entry]of Object.entries(directory.modules||{}))modules[name]=typeof entry==='string'?entry:entry.address;
  if(this.wallet.connected){modules.SovereignAccount=this.wallet.account;modules.IDontFuckingBelieveIt=this.wallet.collection;modules.NativeMarket=this.wallet.modules?.market||modules.NativeMarket;}
  return modules;
 }
 actions(){return this.group==='markets'?markets:this.group==='agents'?agents:this.group==='experimental'?experimental:this.group==='access'?access:this.group==='privacy'?privacyActions:[];}
 render(){
  const groupButton=([id,label])=>`<button class="cf-button" data-do="extension:group:${id}" aria-pressed="${id===this.group}">${esc(label)}</button>`;
  const specialistNotice={markets:'Optional custody and funding instruments. Fractional custody freezes the NFT account; shareholders cannot operate it. Auctions and matching rounds use their own terms.',experimental:'Optional financial experiments depend on configured venues, oracles, resolvers or keeper services. Inspect their complete lifecycle before creating a position.',proof:'Research instrument using a development-only cryptographic setup. It proves public quote arithmetic; use transaction simulation for execution rehearsal.'}[this.group]||'Choose an optional instrument. Hosted services have separate operators and configuration. Contract actions use the selected NFT and a fresh transaction review.';
  return '<p>'+specialistNotice+'</p><nav class="cf-actions" aria-label="Optional instruments">'+Object.entries(groups).filter(([id])=>!specialistGroups.has(id)).map(groupButton).join('')+'</nav><details'+(specialistGroups.has(this.group)?' open':'')+'><summary>Specialist instruments & research</summary><nav class="cf-actions">'+Object.entries(groups).filter(([id])=>specialistGroups.has(id)).map(groupButton).join('')+'</nav></details><details><summary>Instrument catalog</summary>'+FEATURES.map(([,title,group,description])=>`<p><button class="cf-button" data-do="extension:group:${group}">${esc(title)}</button> ${esc(description)}</p>`).join('')+'</details><button class="cf-button" data-do="extension:connect">Connect signing wallet</button><p id="ex-wallet"></p><div id="ex-custom"></div><details id="ex-developer-console"><summary>Developer console: deployments & exact contract calls</summary><p>These forms expose ABI arguments, raw integer units and explicit sender selection. Review the contract terms, asset decimals and exact authority before submitting.</p><details><summary>Inspected deployment directory</summary><p>Import the inspected address directory from your deployment. Each extension’s runtime is checked against this release; chain and immutable settings still need your review. Manual addresses are available for an individual action.</p><input id="ex-directory" type="file" accept="application/json"><button class="cf-button" data-do="extension:directory">Import address directory</button><pre id="ex-directory-info"></pre></details><div id="ex-actions"></div><details><summary>Approvals & experiment control</summary><p>Approve only the exact asset and amount needed. NFT account funding uses a temporary exact ERC20 allowance when the action declares its spend.</p><label>ERC20 asset<input id="ex-token"></label><label>Spender<input id="ex-spender"></label><label>Allowance in raw units<input id="ex-allowance" value="0"></label><label>Owner<select id="ex-approve-sender"><option value="wallet">Signing wallet</option><option value="account">NFT account</option></select></label><button class="cf-button" data-do="extension:approve">Review exact ERC20 allowance</button>'+common.map(a=>`<button class="cf-button" data-do="extension:common:${a.id}">${a.label}</button>`).join('')+'</details></details><div id="ex-summary" role="status"></div><div id="cf-transaction-review"></div>';
 }
 async mount(container){this.container=container;const ticket=++this.generation,view=this.viewRevision,controller=new AbortController();this.cleanups.push(()=>controller.abort());this.drawActions();container.querySelector('#ex-directory-info').textContent=safeJSON(this.directory());this.paintWallet();
  const config={wallet:this.wallet,signal:controller.signal,addresses:this.addresses(),notify:this.notify,review:plan=>{if(view!==this.viewRevision)throw Error('This extension view closed. Prepare a new review.');return this.review(plan);},read:this.read,save:this.save,contract:(name,address)=>this.contract(name,address),get provider(){return this.wallet.provider;},get signer(){return this.wallet.signer;},identity:{chainId:String(this.wallet.chainId||''),tokenId:String(this.wallet.tokenId||''),account:this.wallet.account,owner:this.wallet.address}};
  const custom=container.querySelector('#ex-custom');
  const mount=this.group==='security'?mountSecurityDesk:this.group==='access'?mountAccessDesk:this.group==='worlds'?mountWorldsDesk:this.group==='proof'?mountProofDesk:this.group==='agents'?mountAgentsDesk:this.group==='privacy'?mountPrivacyDesk:null;
  if(mount){try{if(this.group==='privacy'){await this.wallet.connectSigner();config.identity={chainId:String(this.wallet.chainId),tokenId:String(this.wallet.tokenId||''),account:this.wallet.account,owner:this.wallet.address};}
   const cleanup=await mount(custom,config);if(ticket!==this.generation){typeof cleanup==='function'?cleanup():cleanup?.destroy?.();return;}this.cleanups.push(typeof cleanup==='function'?cleanup:()=>cleanup?.destroy?.());
  }catch(error){if(ticket===this.generation)custom.textContent=error.message+' Configure the required addresses and reopen this section.';}}
 }
 paintWallet(){const node=this.container?.querySelector('#ex-wallet');if(node)node.textContent=this.wallet.address?'Signing wallet '+this.wallet.address+' · chain '+this.wallet.chainId+(this.wallet.connected?' · selected NFT '+this.wallet.tokenId:''):'A signing wallet is needed for contract actions.';}
 drawActions(){const actions=this.commonAction?[this.commonAction]:this.actions(),node=this.container.querySelector('#ex-actions');if(!actions.length){node.replaceChildren();return;}if(!actions.some(a=>a.id===this.selected))this.selected=actions[0].id;const a=actions.find(a=>a.id===this.selected),target=this.addresses()[a.contract]||'';
  node.innerHTML='<h3>Contract actions</h3><label>Action<select id="ex-operation">'+actions.map(x=>`<option value="${esc(x.id)}" ${x.id===a.id?'selected':''}>${esc(x.label)}</option>`).join('')+`</select></label><p>${esc(a.description)}</p><label>${esc(a.contract)} address<input id="ex-target" value="${esc(target)}"></label><label>Execute from<select id="ex-sender"><option value="wallet" ${a.sender==='wallet'?'selected':''}>Signing wallet</option><option value="account" ${a.sender!=='wallet'?'selected':''}>Selected NFT account</option></select></label><form id="ex-action-form">`+a.fields.map(f=>`<label>${esc(f.label)}${f.type==='bool'?`<select data-ex-field="${esc(f.name)}"><option value="false">No</option><option value="true" ${f.default===true?'selected':''}>Yes</option></select>`:`<${f.type==='json'||f.type==='string'||f.type==='bytes'?'textarea':'input'} data-ex-field="${esc(f.name)}" ${['json','string','bytes'].includes(f.type)?'rows="3"':`value="${esc(f.default??(f.name==='tokenId'?this.wallet.tokenId||'':''))}"`}>${['json','string','bytes'].includes(f.type)?esc(f.default??'')+'</textarea>':''}`}</label>`).join('')+'<button class="cf-button primary" type="submit">Simulate & review</button></form><button class="cf-button" data-do="extension:read">Read current contract state</button><pre id="ex-state" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>';
 }
 invalidate(){this.generation++;this.wallet.plan=null;this.container?.querySelector('#cf-transaction-review')?.replaceChildren();}
 lock(){this.viewRevision++;this.invalidate();for(const cleanup of this.cleanups.splice(0))cleanup();this.container=null;}
 async contract(name,override){await this.wallet.connectSigner();const directory=this.directory();if(directory.chainId&&BigInt(directory.chainId)!==this.wallet.chainId)throw Error('The extension directory belongs to another chain.');const address=getAddress(override||this.addresses()[name]||''),artifact=ARTIFACTS[name];if(!artifact)throw Error('No release ABI for '+name);const code=await this.wallet.provider.getCode(address);
  if(code==='0x')throw Error(name+' has no deployed code.');if(!coreNames.has(name)&&!matchesRuntime(code,artifact))throw Error(name+' runtime does not match this release.');
  const entry=directory.modules?.[name],expectedHash=entry?.runtimeCodeHash||entry?.codeHash,inspectedAddress=typeof entry==='string'?entry:entry?.address;
  if(expectedHash&&inspectedAddress&&getAddress(inspectedAddress)===address&&expectedHash.toLowerCase()!==keccak256(code).toLowerCase())throw Error(name+' differs from the inspected deployment.');return new Contract(address,artifact.abi,this.wallet.signer);
 }
 async review(candidate,ticket=this.generation){
  if(ticket!==this.generation)throw Error('This extension view changed. Prepare a new review.');let plan;
  if(candidate.transaction&&candidate.gas&&candidate.revision!==undefined){plan=candidate;if(this.wallet.plan===plan)this.wallet.plan=null;}
  else {const tx=candidate.transaction;if(!tx?.to||!tx?.data)throw Error('Missing exact extension transaction.');plan=candidate.sender==='account'?await this.wallet.prepare({target:tx.to,data:tx.data,value:formatEther(tx.value||0)}):await this.wallet.prepareExternal({target:tx.to,data:tx.data,value:tx.value||0n});this.wallet.plan=null;}
  if(ticket!==this.generation){this.wallet.plan=null;throw Error('Terms changed during simulation. Review again.');}
  this.container.querySelector('#ex-summary').textContent=[candidate.title,candidate.description].filter(Boolean).join(' · ');this.wallet.plan=plan;this.showReview(plan);return plan;
 }
 async submit(){this.invalidate();const ticket=this.generation,a=this.commonAction||this.actions().find(x=>x.id===this.selected),values=Object.fromEntries([...this.container.querySelectorAll('[data-ex-field]')].map(e=>[e.dataset.exField,e.value])),args=parseActionFields(a,values),address=this.container.querySelector('#ex-target').value,sender=this.container.querySelector('#ex-sender').value;
  const c=await this.contract(a.contract,address);let approval,description=a.description;
  if(experimental.includes(a)){const details=await prepareExperimentalAction(this.wallet.provider,{contract:a.contract,address:await c.getAddress(),method:a.method,args,caller:sender==='account'?this.wallet.account:this.wallet.address,abi:ARTIFACTS[a.contract].abi});description+=' '+details.review.rows.map(([k,v])=>k+': '+v).join('; ');approval=details.inputs[0];}
  else if(a.approval)approval={asset:await c[a.approval.assetMethod](),maximum:values[a.approval.amountField]};
  const tx=await c.getFunction(a.method).populateTransaction(...args,...(a.valueField?[{value:BigInt(values[a.valueField])}]:[]));
  if(approval&&BigInt(approval.maximum)>0n){
   if(sender==='account'){const plan=await this.wallet.prepareUtility({target:tx.to,data:tx.data,asset:approval.asset,amount:String(approval.maximum),value:formatEther(tx.value||0n)});return this.review({...plan,title:a.label,description},ticket);}
   const token=new Contract(approval.asset,['function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)'],this.wallet.signer),allowance=await token.allowance(this.wallet.address,tx.to);
   if(allowance<BigInt(approval.maximum)){const amount=allowance>0n?0n:BigInt(approval.maximum);return this.review({title:amount===0n?'Reset previous token allowance':'Approve exact funding',description:'Review '+amount+' raw units for '+tx.to+'. After confirmation, simulate the intended action again.',transaction:await token.approve.populateTransaction(tx.to,amount),sender:'wallet'},ticket);}
  }
  return this.review({title:a.label,description,transaction:tx,sender},ticket);
 }
 async action(key){
  if(key.startsWith('group:')){const group=key.slice(6);if(!groups[group])throw Error('Unknown extension group.');const container=this.container;this.lock();this.group=group;this.commonAction=null;container.innerHTML=this.render();return this.mount(container);}
  if(key==='connect'){await this.wallet.connectSigner();this.paintWallet();return;}
  if(key==='directory'){const file=this.container.querySelector('#ex-directory').files[0];if(!file||file.size>262144)throw Error('Select an inspected directory under 256 KiB.');const doc=JSON.parse(await file.text());if(!doc.modules||!doc.chainId)throw Error('Directory needs chainId and named modules.');for(const [name,entry]of Object.entries(doc.modules)){if(!ARTIFACTS[name])continue;getAddress(typeof entry==='string'?entry:entry.address);}this.invalidate();this.save('extension-directory',doc);this.container.querySelector('#ex-directory-info').textContent=safeJSON(doc);this.drawActions();return;}
  if(key.startsWith('common:')){this.invalidate();this.commonAction=common.find(a=>a.id===key.slice(7));this.selected=this.commonAction.id;this.drawActions();return;}
  if(key==='approve'){this.invalidate();const ticket=this.generation;await this.wallet.connectSigner();const token=new Contract(getAddress(this.container.querySelector('#ex-token').value),['function approve(address,uint256) returns(bool)'],this.wallet.signer),spender=getAddress(this.container.querySelector('#ex-spender').value),amount=BigInt(this.container.querySelector('#ex-allowance').value);return this.review({title:'Explicit ERC20 allowance',description:amount+' raw units to '+spender,transaction:await token.approve.populateTransaction(spender,amount),sender:this.container.querySelector('#ex-approve-sender').value},ticket);}
  if(key==='read'){const a=this.commonAction||this.actions().find(x=>x.id===this.selected),c=await this.contract(a.contract,this.container.querySelector('#ex-target').value);let result;
   const kind={ContinuousClearingAuction:'auction',PublicGoodsMatching:'matching',WholeNFTShares:'shares'}[a.contract];if(kind)result=await readMarketState(this.wallet.raw,{kind,target:await c.getAddress(),owner:this.wallet.address});else {const block=await this.wallet.provider.getBlockNumber();result={contract:a.contract,address:await c.getAddress(),block};for(const fn of c.interface.fragments.filter(f=>f.type==='function'&&['view','pure'].includes(f.stateMutability)&&f.inputs.length===0)){try{result[fn.name]=await c.getFunction(fn.format())({blockTag:block});}catch{}}}this.container.querySelector('#ex-state').textContent=safeJSON(result);return;}
 }
 change(target){if(target.id==='ex-operation'){this.invalidate();this.selected=target.value;this.drawActions();return;}if(target.closest('#ex-action-form')||['ex-target','ex-sender','ex-token','ex-spender','ex-allowance','ex-approve-sender'].includes(target.id)){this.invalidate();}}
}
