import {RehearsalClient,bindRehearsal} from '../rehearsal/client.mjs';
import {renderRehearsal} from '../rehearsal/view.mjs';
import {LiveProtocol} from './live-protocol.mjs';
const ZERO='0x'+'0'.repeat(40);
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const input=(label,key,value='',type='text')=>`<label for="ag-live-${key}">${label}</label><input id="ag-live-${key}" type="${type}" value="${esc(value)}" autocomplete="off">`;
const consent='<label class="ag-live-consent"><input id="ag-live-consent" type="checkbox"> I want this text published onchain, where it will be publicly readable.</label>';
const text=(label)=>`<label for="ag-live-text">${label}</label><textarea id="ag-live-text" rows="4"></textarea>${consent}`;
const commonsOperations=['post','createRoom','configureRoom','joinRoom','leaveRoom','setMember','setModerator'];
const button=(key,label)=>`<button type="button" class="cf-button" data-do="live:${key}">${label}</button>`;
export function renderCommonsRoom(room){
  const access=room.access;
  const role=access.admin?'Room admin':access.moderator?'Active moderator':access.banned?'Banned':access.joined?'Accepted member':access.invited?'Invitation waiting':'Public reader';
  return `<section aria-label="Onchain room"><h3>${esc(room.name)} · room ${esc(room.id)}</h3><p>${esc(room.topic)}</p><p class="cf-small">Read at block ${esc(room.block)} · ${esc(room.messageCount)} messages · ${room.membersOnly?'Invitations restrict posting':'Open posting'} · slow mode ${esc(room.slow)} seconds.</p><p class="cf-small">Your NFT account: ${esc(room.actor)} · ${role}. All room messages are public, including rooms that require invitations.</p>${room.messages.length?room.messages.map(m=>`<article class="cf-stat"><div><b>Message ${esc(m.id)} · NFT ${esc(m.identity)}</b><p class="cf-small">${esc(m.author)} · ${esc(new Date(m.time*1000).toISOString())}${m.replyTo!=='0'?' · reply to '+esc(m.replyTo):''}</p><p style="white-space:pre-wrap;overflow-wrap:anywhere">${m.hidden?'Hidden in the room view. The original bytes remain onchain.':esc(m.text)}</p><p class="cf-small">Custodian when posted: ${esc(m.custodian)} · custody epoch ${esc(m.epoch)}</p></div></article>`).join(''):'<p>No messages on this page.</p>'}${room.nextBefore!==null?button('older:'+room.nextBefore,'Read older messages'):''}</section>`;
}
export function renderCommonsDirectory(page){
  return `<p class="cf-small">${esc(page.total)} rooms · read at block ${esc(page.block)}. Every room is publicly readable.</p>${page.rooms.map(room=>`<article><h4>${esc(room.name)} · ${esc(room.id)}</h4><p>${esc(room.topic)}</p><p class="cf-small">${room.membersOnly?'Invitation required to post':'Open posting'} · ${esc(room.messageCount)} messages</p>${button('room:'+room.id,'Open room')}</article>`).join('')}${page.next?button('rooms:'+page.next,'More rooms'):''}`;
}
export class LiveProtocolDesk {
  constructor(wallet,review,read,save){this.wallet=wallet;this.api=new LiveProtocol(wallet);this.review=review;this.read=read;this.save=save;this.operation='swap';this.generation=0;this.room='1';this.roomDraft=null;this.rehearsal=new RehearsalClient();}
  render(){
    const addresses={...this.read('live-modules',{}),...this.wallet.modules};
    const tabs=[['swap','Swap'],['lock','Lock'],['release','Release'],['memory','Memory'],['post','Commons']];
    return `<p><button type="button" class="cf-button primary" data-do="nav:v4">Open v4 swap · private toggle</button></p><p>Public NFT instruments. Use your NFT’s deployed contracts. Each action is simulated, reviewed and confirmed in your wallet.</p>${!this.wallet.connected?'<button type="button" class="cf-button primary" data-do="nav:connect">Connect your NFT</button>':`<div class="cf-stat"><span>NFT account</span><b>${esc(this.wallet.account)}</b></div><div class="cf-stat"><span>Chain</span><b>${esc(this.wallet.chainId)}</b></div>`}<nav class="ag-live-tabs" aria-label="Onchain instruments">${tabs.map(([key,label])=>`<button type="button" class="cf-button" data-do="live:tab:${key}" aria-pressed="${this.operation===key||key==='post'&&commonsOperations.includes(this.operation)}">${label}</button>`).join('')}</nav><details class="ag-live-addresses" ${Object.values(addresses).some(Boolean)?'':'open'}><summary>Contract addresses</summary><p class="cf-small">Minted editions load their sealed deployment automatically. Every action checks the connected collection.</p>${input('Market','market',addresses.market||'')}${input('Time vault','vault',addresses.vault||'')}${input('Memory ledger','journal',addresses.journal||'')}${input('World ledger','ledger',addresses.ledger||'')}<button type="button" class="cf-button" data-do="live:save">Save addresses</button></details><details><summary>Rehearsal connection</summary><p>Optional: execute this public NFT action on your local pinned-block fork before signing. The session token stays in memory.</p>${input('Local service','rehearsal-url',this.rehearsal.endpoint)}${input('Session token','rehearsal-token',this.rehearsal.token,'password')}</details><form id="ag-live-form" class="ag-live-form">${this.fields()}<button type="submit" class="cf-button primary">Simulate & review</button>${['swap','lock','release'].includes(this.operation)?'<button type="button" class="cf-button" data-do="live:rehearse">Rehearse exact effects</button>':''}</form><div id="ag-live-summary" aria-live="polite"></div><div id="cf-transaction-review"></div><p class="cf-small">This desk uses compatible deployed Genesis contracts. The swap quote here comes from NativeMarket; Uniswap v4 liquidity is a separate integration. Private memories remain available in the local journal.</p>`;
  }
  fields(){
    if(this.operation==='swap')return '<p>This NativeMarket route records your NFT identity publicly. Choose the v4 exchange for shielded swaps.</p>'+input('Input token · zero address means ETH','input',ZERO)+input('Output token','output')+input('Amount to spend','amount','0.01')+input('Slippage tolerance · %','slippage','0.5')+'<details><summary>Inscribe this trade</summary>'+text('Optional trade note')+'</details>';
    if(this.operation==='lock')return input('Token to lock · zero address means ETH','asset',ZERO)+input('Amount','amount','0.01')+input('Duration · days','days','30','number')+'<label class="ag-live-consent"><input type="checkbox" id="ag-live-linear"> Vest continuously. Leave unchecked to release at maturity.</label>';
    if(this.operation==='release')return input('Lock ID','id','1','number');
    if(this.operation==='memory')return text('Memory to inscribe');
    return this.commonsFields();
  }
  commonsFields(){
    const op=this.operation,settings=['createRoom','configureRoom'].includes(op),draft=op==='configureRoom'&&this.roomDraft?.id===this.room&&this.roomDraft.scope===this.commonsScope()?this.roomDraft:{};
    const tabs=[['post','Read & post'],['createRoom','Create room'],['joinRoom','Accept invitation'],['leaveRoom','Leave membership'],['configureRoom','Room settings'],['setMember','Members'],['setModerator','Moderators']];
    let fields='<p>Commons lives onchain. Names, topics, messages and membership are public. An invitation controls who may write; it does not make reading private.</p><nav class="ag-live-tabs" aria-label="Commons actions">'+tabs.map(([key,label])=>button('tab:'+key,label)).join('')+'</nav><details><summary>Find a room</summary>'+input('First room ID','room-start','1','number')+button('rooms','Read room directory')+'<div id="ag-live-rooms" aria-live="polite"></div></details>';
    if(op!=='createRoom')fields+=input('Room ID · 1 is the world room','room',this.room,'number')+button('read','Read latest messages & access')+'<div id="ag-live-room-view" aria-live="polite"></div>';
    if(op==='post')fields+=input('Reply to message ID · 0 means a new message','replyTo','0','number')+text('Public message · maximum 1024 UTF-8 bytes');
    if(settings)fields+=input('Public room name · maximum 48 UTF-8 bytes','name',draft.name||'')+input('Public topic · maximum 256 UTF-8 bytes','topic',draft.topic||'')+input('Seconds between posts · 0–3600','slow',draft.slow??'3','number')+input('Room color','color',draft.color||'#8af1ff','color')+`<label class="ag-live-consent"><input type="checkbox" id="ag-live-gated" ${draft.membersOnly?'checked':''}> Require accepted invitations to post. Reading remains public.</label>`+consent;
    if(op==='joinRoom')fields+='<p>Accept an invitation addressed to your NFT account. A moderator invitation becomes active only after you accept it. No membership is forced on you.</p>';
    if(op==='leaveRoom')fields+='<p>Withdraw your acceptance and deactivate an accepted moderator role. The invitation and old messages remain onchain. Open rooms still allow unbanned accounts to post; a room admin keeps its authority.</p>';
    if(op==='setMember')fields+=input('Invited NFT account address','who')+'<label for="ag-live-memberAction">Membership action</label><select id="ag-live-memberAction"><option value="invite">Invite / renew invitation</option><option value="remove">Remove invitation and moderator flag</option><option value="ban">Ban posting and remove membership</option><option value="unban">Unban without granting membership</option></select><p>Enter the recipient’s NFT account address. Only the admin or an active moderator can make these changes. Removing or banning someone does not erase messages.</p>';
    if(op==='setModerator')fields+=input('Moderator NFT account address','who')+'<label class="ag-live-consent"><input type="checkbox" id="ag-live-moderatorAllowed"> Invite as moderator. Leave unchecked to remove the moderator role.</label><p>Only the room admin can appoint moderators. An appointed account must accept the invitation before it can moderate.</p>';
    return fields;
  }
  commonsScope(ledger){const addresses={...this.read('live-modules',{}),...this.wallet.modules};return JSON.stringify([String(ledger??addresses.ledger??'').toLowerCase(),String(this.wallet.chainId),this.wallet.account,this.wallet.revision]);}
  values(container){const get=key=>container.querySelector('#ag-live-'+key)?.value||'',checked=key=>!!container.querySelector('#ag-live-'+key)?.checked;return {market:get('market'),vault:get('vault'),journal:get('journal'),ledger:get('ledger'),input:get('input'),output:get('output'),amount:get('amount'),slippage:get('slippage'),asset:get('asset'),days:get('days'),id:get('id'),room:get('room')||this.room,text:get('text'),linear:checked('linear'),publicConsent:checked('consent'),replyTo:get('replyTo'),name:get('name'),topic:get('topic'),slow:get('slow'),color:get('color'),gated:checked('gated'),who:get('who'),memberAction:get('memberAction'),moderatorAllowed:checked('moderatorAllowed')};}
  saveAddresses(container){const v=this.values(container);this.save('live-modules',{market:v.market,vault:v.vault,journal:v.journal,ledger:v.ledger});}
  action(key,container){
    if(key==='rehearse')return this.submit(container,true);
    if(key==='save'){this.saveAddresses(container);return;}
    if(key==='read'||key.startsWith('older:'))return this.readCommons(container,false,key==='read'?'':key.slice(6));
    if(key==='rooms'||key.startsWith('rooms:'))return this.readCommons(container,true,key==='rooms'?'':key.slice(6));
    if(key.startsWith('room:')){const room=key.slice(5);if(!/^\d+$/.test(room))throw Error('Invalid room ID.');this.saveAddresses(container);this.invalidate();this.room=room;this.operation='post';container.innerHTML=this.render();return this.readCommons(container);}
    if(key.startsWith('tab:')){const operation=key.slice(4);if(!['swap','lock','release','memory',...commonsOperations].includes(operation))throw Error('Unknown instrument');this.room=this.values(container).room;this.saveAddresses(container);this.invalidate();this.operation=operation;container.innerHTML=this.render();}
  }
  async readCommons(container,directory=false,cursor=''){
    this.invalidate();const generation=this.generation,value=this.values(container),op=this.operation;this.room=value.room;this.saveAddresses(container);
    container.querySelector('#cf-transaction-review')?.replaceChildren();container.querySelector('#ag-live-summary')?.replaceChildren();
    const node=container.querySelector(directory?'#ag-live-rooms':'#ag-live-room-view');if(!node)throw Error('Open Commons to read rooms.');
    node.textContent='Reading onchain room state…';
    try{
      const result=directory?await this.api.rooms({ledger:value.ledger,start:cursor||container.querySelector('#ag-live-room-start')?.value||'1'}):await this.api.readRoom({...value,before:cursor});
      if(generation!==this.generation||op!==this.operation)throw Error('Commons selection changed. Read the room again.');
      if(!directory){
        this.roomDraft={...result,scope:this.commonsScope(value.ledger)};
        if(op==='configureRoom'){
          for(const key of ['name','topic','slow','color']){const control=container.querySelector('#ag-live-'+key);if(control)control.value=String(result[key]);}
          const gated=container.querySelector('#ag-live-gated'),consent=container.querySelector('#ag-live-consent');
          if(gated)gated.checked=result.membersOnly;if(consent)consent.checked=false;
        }
      }
      node.innerHTML=directory?renderCommonsDirectory(result):renderCommonsRoom(result);
      return result;
    }catch(error){if(generation===this.generation)node.textContent='Room read failed. '+error.message;throw error;}
  }
  invalidate(){this.generation++;this.wallet.plan=null;this.rehearsal.invalidate();}
  lock(){this.invalidate();this.roomDraft=null;this.rehearsal.lock();}
  async submit(container,rehearse=false){
    this.invalidate();const generation=this.generation;
    container.querySelector('#cf-transaction-review')?.replaceChildren();
    container.querySelector('#ag-live-summary')?.replaceChildren();
    let plan;
    try{
      const value=this.values(container);this.saveAddresses(container);const op=this.operation;
      const result=await this.api[op==='memory'?'inscribe':op](value);plan=result.plan;
      // Preparation stores its candidate on the shared wallet. Withhold it until this
      // desk has completed the requested rehearsal and published its matching review.
      if(this.wallet.plan===plan)this.wallet.plan=null;
      if(generation!==this.generation||op!==this.operation)throw Error('Terms changed during simulation. Review the new values.');
      const node=container.querySelector('#ag-live-summary');
      node.innerHTML='<h3>Exact transaction terms</h3>'+Object.entries(result).filter(([k])=>k!=='plan').map(([k,v])=>`<div class="cf-stat"><span>${esc(k)}</span><b>${esc(k==='deadline'||k==='end'?new Date(Number(v)*1000).toLocaleString():v)}</b></div>`).join('');
      if(rehearse){
        this.rehearsal.configure(container.querySelector('#ag-live-rehearsal-url').value,container.querySelector('#ag-live-rehearsal-token').value);
        const report=await this.rehearsal.run(plan,this.wallet.provider);
        if(generation!==this.generation)throw Error('Terms changed during rehearsal.');
        node.innerHTML=renderRehearsal(report);
        if(report.status!=='succeeded')return;
        bindRehearsal(plan,report);
      }
      this.wallet.plan=plan;this.review(plan);
    }catch(error){
      if(generation===this.generation||plan&&this.wallet.plan===plan)this.wallet.plan=null;
      throw error;
    }
  }
}
