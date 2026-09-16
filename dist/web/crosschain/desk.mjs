import {getAddress,formatEther} from '../vendor/ethers.min.js';
import {inspectLane,readProvider,bridgePlan,deliveryRecord,destinationActionPlan,recipientDeliveries,prepareLaneDeployment,verifyBridgeContract} from './client.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2);
const button=(action,label)=>`<button type="button" data-cross-action="${action}">${label}</button>`;
export class CrosschainDesk {
 constructor({chain,onChange=()=>{}}={}){if(!chain)throw Error('CrosschainDesk requires the shared transaction chain.');this.chain=chain;this.onChange=onChange;this.values={sourceAddress:'',sourceChainId:'1',sourceRPC:'',sourceOFT:'',destinationOFT:'',sourceDeployer:'',destinationDeployer:'',timeVault:'',historyComposer:'',historyRecipient:'',destinationChainId:'42161',destinationRPC:'',amount:'',minimum:'',recipient:'',lockAmount:'0',unlockAt:'',sourceHash:'',guid:'',retryAction:''};this.message='';this.generation=0;this.busy=false;}
 get ownsPlan(){return this.prepared&&this.chain.plan===this.prepared;}
 render(){const field=(name,label,type='text')=>`<label>${label}<input data-cross-field="${name}" type="${type}" value="${esc(this.values[name])}" autocomplete="off" spellcheck="false"></label>`;
 const lane=this.lane;
 const review=this.ownsPlan?`<section class="cross-card cross-review"><h3>${esc(this.chain.review?.purpose||this.prepared.summary.purpose)}</h3><p>Funding account: <code>${esc(this.chain.payer)}</code></p><pre>${esc(json(this.prepared.summary))}</pre>${this.chain.review?`<p>Maximum transaction gas cost: ${esc(formatEther(this.chain.review.maximumGasCost))} native currency</p><details><summary>Exact transaction</summary><pre>${esc(json(this.chain.review.request))}</pre></details>${button('send','Sign and submit')}`:button('review','Check exact call and gas')}${button('cancel','Cancel review')}</section>`:'';
 return `<section class="cross-desk"><header><span class="cross-kicker">ONE JOURNEY · TWO CHAINS</span><h2>Cross-chain passage</h2><p>Move an existing OFT asset to its destination chain. Choose a recipient and optionally put part of the arrival into a real vesting vault.</p></header><div class="cross-grid"><section class="cross-card"><h3>Choose the passage</h3><p>Source network: ${esc(this.chain.chainId||'Connect your wallet')} · Funding account: <code>${esc(this.chain.payer||'Not selected')}</code></p>${button('connect','Connect wallet')}${field('sourceAddress','Source ANIMA bridge router')}${field('sourceChainId','Source chain ID','number')}${field('sourceRPC','Source HTTPS read provider (retains history after wallet switching)')}${field('destinationChainId','Destination chain ID','number')}${field('destinationRPC','Destination HTTPS read provider')}${button('inspect','Verify both ends')}${lane?`<p class="cross-success">${esc(lane.symbol)} on chain ${esc(lane.sourceChain)} → ${esc(lane.destinationSymbol)} on chain ${esc(lane.destinationChain)}</p><details><summary>Lane identity and transport</summary><pre>${esc(json({sourceRouter:lane.sourceAddress,destinationComposer:lane.composerAddress,sourceEndpoint:lane.endpointAddress,destinationEndpoint:lane.destEndpoint,sourceOFT:lane.oftAddress,destinationOFT:lane.destOFT,sendLibrary:lane.sendLibrary,receiveLibrary:lane.receiveLibrary,timeVault:lane.vault}))}</pre><p>${esc(lane.trust)}</p></details>`:''}</section><section class="cross-card"><h3>Choose what arrives</h3>${field('amount','Amount to bridge')}${field('minimum','Minimum amount received')}${field('recipient','Destination recipient — wallet or deployed NFT account')}${field('lockAmount','Optional amount to lock on arrival')}${field('unlockAt','Unlock date','datetime-local')}<label class="cross-choice"><input type="checkbox" data-cross-linear ${this.linear?'checked':''}> Release the locked part gradually until this date</label><p>The remaining tokens go directly to your chosen recipient. A bridge delay can invalidate an absolute lock date; failed destination actions leave a recoverable destination credit.</p>${button('prepare','Prepare this passage')}</section></div>${this.setupHTML(field)}${review}${this.historyHTML(field)}<section class="cross-card"><h3>Follow or recover a passage</h3><p>A confirmed source debit and a completed destination action are separate receipts. Enter the source transaction to read both chains. Recipient delivery IDs also remain discoverable from the destination composer.</p>${field('sourceHash','Source transaction hash')}${button('receipt','Read both chain records')}${this.record?`<pre>${esc(json(this.record))}</pre>`:''}${field('guid','Delivery GUID')}<details><summary>Original action for retry</summary><label>Exact action JSON<textarea data-cross-field="retryAction" rows="5">${esc(this.values.retryAction)}</textarea></label><p>Retry keeps the recipient, amount and schedule committed in the source message. Refund sends deferred tokens to that recipient on the destination chain.</p></details><div class="cross-actions">${button('destination','Connect destination network')}${button('retry','Review original-action retry')}${button('refund','Review destination refund')}${button('recover','Recover wallet transactions')}</div></section><p class="cross-status" role="status">${esc(this.busy?'Working…':this.message)}</p></section>`;
 }
 setupHTML(field){
  const d=this.deployment;
  return `<details class="cross-card"><summary>Set up a verified bridge lane</summary><p>Use the issuer's existing reciprocal OFT deployments. These two wallet deployments create the ANIMA source router and destination composer; they do not create an unofficial representation of the token.</p><div class="cross-grid"><div>${field('sourceOFT','Source OFT contract')}${field('sourceDeployer','Source deployment wallet')}</div><div>${field('destinationOFT','Destination OFT contract')}${field('destinationDeployer','Destination deployment wallet')}${field('timeVault','Optional installed destination TimeVault')}</div></div>${button('setup-plan','Verify issuer path and prepare both deployments')}${d?`<pre>${esc(json({sourceChain:d.sourceChain,sourceRouter:d.sourceAddress,sourceDeployer:d.sourceDeployer,destinationChain:d.destinationChain,destinationComposer:d.composerAddress,destinationDeployer:d.destinationDeployer,timeVault:d.timeVault}))}</pre><p>Keep both deployment nonces reserved. Each contract fixes the other's address. If either nonce changes before its deployment, stop and replan the pair.</p>${button('setup-source','Review source wallet deployment')}${button('setup-destination','Review destination wallet deployment')}`:''}</details>`;
 }
 historyHTML(field){
  const h=this.history;
  return `<section class="cross-card"><h3>Your destination arrivals</h3><p>Recover deliveries on a new device using the destination composer and your recipient address. No transaction hash or delivery ID is needed.</p>${field('historyComposer','Destination composer')}${field('historyRecipient','Recipient wallet or NFT account')}${button('history','Read recipient history')}${h?`<p>${esc(h.count)} deliveries · chain ${esc(h.chainId)} · block ${esc(h.blockNumber)}</p>${h.records.map(r=>`<article class="cross-delivery"><strong>${esc(r.formattedAmount)} ${esc(r.symbol)}</strong><span>${esc(r.statusLabel)}</span><code>${esc(r.guid)}</code>${button('delivery:'+r.guid,r.status===1?'Open recovery':'Read delivery')}</article>`).join('')}${h.nextCursor!==null?button('history-more','Read earlier arrivals'):''}`:''}${this.selectedHistory?`<p>Selected: ${esc(this.selectedHistory.record.statusLabel)}. The original recipient, minimum and schedule have been recovered from chain state.</p>`:''}</section>`;
 }
 async setupAction(action){
  const generation=this.generation;
  if(action==='setup-plan'){
   this.lane=null;
   this.sourceProvider?.destroy?.();this.destinationProvider?.destroy?.();
   this.sourceProvider=readProvider(this.values.sourceRPC,this.values.sourceChainId);this.destinationProvider=readProvider(this.values.destinationRPC,this.values.destinationChainId);
   const result=await prepareLaneDeployment(this.sourceProvider,this.destinationProvider,this.values);
   if(generation!==this.generation)throw Error('Lane setup fields changed during verification.');
   this.deployment=result;this.message='Both exact deployment plans are ready for their separate wallet reviews.';return;
  }
  if(!this.deployment)throw Error('Prepare and verify the paired deployment first.');
  const side=action==='setup-source'?'source':'destination',plan=this.deployment[side];
  if(!this.chain.address)throw Error('Connect the deployment wallet first.');
  if(String(this.chain.chainId)!==String(plan.chainId))await this.chain.switchChain(plan.chainId);
  if(getAddress(this.chain.address)!==getAddress(plan.meta.deployer))throw Error('Select the deployment wallet named in this exact plan.');
  const provider=this.chain.provider,code=await provider.getCode(plan.meta.predictedAddress);
  if(code!=='0x'){
   const contract=await verifyBridgeContract(provider,plan.meta.predictedAddress,plan.meta.contractName);
   for(const [key,value]of Object.entries(plan.meta.expectedImmutables))if(String(await contract[key]()).toLowerCase()!==value.toLowerCase())throw Error('An existing deployment differs from the prepared immutable lane.');
   this.values.sourceAddress=this.deployment.sourceAddress;this.values.historyComposer=this.deployment.composerAddress;this.message='This exact lane component is already deployed and verified.';return;
  }
  if(await provider.getTransactionCount(this.chain.address,'pending')!==plan.request.nonce)throw Error('The deployment nonce changed. Replan the lane before using a new address.');
  if(generation!==this.generation)throw Error('Lane setup changed while checking this deployment.');
  this.chain.useWallet();this.prepared=await this.chain.prepareExternal({...plan,deadline:Math.floor(Date.now()/1000)+900});
  if(generation!==this.generation){this.chain.invalidate();this.prepared=null;throw Error('Lane setup changed during preparation.');}
  this.values.sourceAddress=this.deployment.sourceAddress;this.values.historyComposer=this.deployment.composerAddress;
  this.message='Deployment prepared. Review the exact contract, chain, constructor and gas before signing.';
 }
 async historyAction(action){
  if(action.startsWith('delivery:')){
   const guid=action.slice(9),record=this.history?.records.find(r=>r.guid===guid);if(!record)throw Error('Refresh this recipient history before selecting a delivery.');
   this.selectedHistory={record,context:this.history.context};this.values.guid=guid;this.values.retryAction=json(record.action);this.record={...record,destinationChain:this.history.chainId,destinationBlock:this.history.blockNumber,destinationBlockHash:this.history.blockHash};return;
  }
  const generation=this.generation;
  this.historyProvider?.destroy?.();this.historyProvider=readProvider(this.values.destinationRPC,this.values.destinationChainId);
  const history=await recipientDeliveries(this.historyProvider,{composerAddress:this.values.historyComposer||this.lane?.composerAddress,chainId:this.values.destinationChainId,recipient:this.values.historyRecipient||this.chain.payer,before:action==='history-more'?this.history?.nextCursor:undefined});
  if(generation!==this.generation)throw Error('Recipient history fields changed while reading.');
  this.history=history;this.selectedHistory=null;this.message=history.records.length?'Choose a delivery to inspect its original terms or recover a deferred credit.':'This recipient has no arrivals in the selected composer.';
 }
 mount(root){this.unmount();this.root=root;this.abort=new AbortController();this.bind();return this;}
 bind(){const signal=this.abort.signal;this.root.querySelectorAll('[data-cross-field]').forEach(field=>field.addEventListener('input',()=>{this.values[field.dataset.crossField]=field.value;if(this.ownsPlan)this.chain.invalidate();this.prepared=null;this.generation++;if(['sourceAddress','sourceChainId','sourceRPC','destinationChainId','destinationRPC'].includes(field.dataset.crossField))this.lane=null;if(['destinationChainId','destinationRPC','historyComposer','historyRecipient'].includes(field.dataset.crossField)){this.history=null;this.selectedHistory=null;}if(['sourceChainId','destinationChainId','sourceRPC','destinationRPC','sourceOFT','destinationOFT','sourceDeployer','destinationDeployer','timeVault'].includes(field.dataset.crossField))this.deployment=null;},{signal}));this.root.querySelector('[data-cross-linear]')?.addEventListener('change',e=>{this.linear=e.target.checked;if(this.ownsPlan)this.chain.invalidate();this.prepared=null;this.generation++;},{signal});this.root.querySelectorAll('[data-cross-action]').forEach(el=>el.addEventListener('click',async()=>{if(this.busy)return;this.busy=true;el.disabled=true;try{await this.act(el.dataset.crossAction);}catch(error){this.message=error.message;}finally{this.busy=false;this.paint();}},{signal}));}
 paint(){if(!this.root)return;this.abort?.abort();this.abort=new AbortController();this.root.innerHTML=this.render();this.bind();this.onChange();}
 unmount(){this.abort?.abort();this.abort=null;this.root=null;this.generation++;}
 async act(action){
  if(action==='connect'){await this.chain.connect();if(!this.values.sourceDeployer)this.values.sourceDeployer=this.chain.address;if(!this.values.destinationDeployer)this.values.destinationDeployer=this.chain.address;this.message='Wallet connected. Choose and verify the two-chain passage.';return;}
  if(action==='setup-plan'||action==='setup-source'||action==='setup-destination')return this.setupAction(action);
  if(action==='history'||action==='history-more'||action.startsWith('delivery:'))return this.historyAction(action);
  if(action==='inspect'){
   if(!this.chain.provider)throw Error('Connect on the source network first.');const generation=this.generation;
   this.sourceProvider?.destroy?.();this.sourceProvider=this.values.sourceRPC?readProvider(this.values.sourceRPC,this.values.sourceChainId):null;
   if(this.sourceProvider&&(await this.sourceProvider.getNetwork()).chainId!==BigInt(this.values.sourceChainId))throw Error('Source read provider is on another chain.');
   this.destinationProvider?.destroy?.();this.destinationProvider=readProvider(this.values.destinationRPC,this.values.destinationChainId);
   const lane=await inspectLane(this.sourceProvider||this.chain.provider,{sourceAddress:this.values.sourceAddress,destinationProvider:this.destinationProvider,destinationChainId:this.values.destinationChainId});
   if(generation!==this.generation)throw Error('Passage settings changed during verification.');this.lane=lane;this.message='Both ANIMA runtimes and the paired OFT lane match. Review the issuer transport settings.';return;
  }
  if(action==='prepare'){
   if(!this.lane)throw Error('Verify both ends first.');if(String(this.chain.chainId)!==this.lane.sourceChain)throw Error('Connect on the source network first.');
   const generation=this.generation;const plan=await bridgePlan(this.lane,{...this.values,linear:this.linear});
   if(generation!==this.generation)throw Error('Passage terms changed during preparation.');
   this.prepared=await this.chain.prepareExternal(plan,{nftCompatible:true});if(generation!==this.generation){this.chain.invalidate();this.prepared=null;throw Error('Passage changed during preparation.');}this.values.retryAction=json(plan.meta.action);this.message='Exact source spend and destination terms prepared.';return;
  }
  if(action==='review'){if(!this.ownsPlan)throw Error('Prepare this operation first.');await this.chain.reviewNext();return;}
  if(action==='send'){if(!this.ownsPlan)throw Error('Prepare this operation first.');const result=await this.chain.sendReviewed();this.message='Wallet submission recorded. Follow both chain receipts before treating the destination action as complete.';return result;}
  if(action==='cancel'){if(this.ownsPlan)this.chain.invalidate();this.prepared=null;return;}
  if(action==='recover'){await this.chain.recoverTransactions();this.message='Submitted wallet receipts checked.';return;}
  const activeLane=this.selectedHistory?.context||this.lane;
  if(!activeLane)throw Error('Verify a passage or select a recipient delivery first.');
  if(action==='receipt'){if(!this.lane)throw Error('Verify both ends to inspect a source receipt; destination history already contains recovery terms.');this.record=await deliveryRecord(this.lane,this.values.sourceHash);if(this.record.guid)this.values.guid=this.record.guid;if(this.record.action)this.values.retryAction=json(this.record.action);return;}
  if(action==='destination'){if(this.lane&&!this.selectedHistory&&!this.sourceProvider)throw Error('Set the source read provider and verify the passage so both receipts remain readable after switching.');await this.chain.switchChain(Number(activeLane.destinationChain));this.message='Destination network selected. Choose its wallet or NFT account before retry or refund.';return;}
  if(action==='retry'||action==='refund'){
   if(String(this.chain.chainId)!==activeLane.destinationChain)throw Error('Connect the funding account on the destination chain.');
   const terms=action==='retry'?JSON.parse(this.values.retryAction):undefined;
   const plan=await destinationActionPlan(activeLane,this.values.guid,action,terms);
   if(action==='refund'&&getAddress(this.chain.payer)!==getAddress(plan.summary.recipient))throw Error('Only the committed recipient can recover this destination credit.');
   this.prepared=await this.chain.prepareExternal(plan,{nftCompatible:true});return;
  }
 }
}
