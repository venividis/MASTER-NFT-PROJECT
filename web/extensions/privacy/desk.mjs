import {PrivacyClient} from '../privacy.mjs';

/** Mount a secret-aware panel. Secrets only enter WebCrypto; config.review sees ciphertext-only transactions.
 * @param {HTMLElement} container
 * @param {{contract:Function,identity:{chainId:string,owner:string,tokenId:string},review:Function,notify?:Function}} config
 */
export async function mountPrivacyDesk(container,config){
 let destroyed=false;const cancelled=()=>destroyed||config.signal?.aborted;
 const identity=config.identity;
 const keys=await config.contract('PrivacyKeys');
 const [memory,chat]=await Promise.all(['PrivateMemoryHandover','EpochGroupChat'].map(name=>config.contract(name).catch(()=>null)));
 if(!memory&&!chat)throw Error('Configure encrypted conversations or private memory alongside the encryption-key registry.');
 let collection,portal;try{collection=await config.contract('IDontFuckingBelieveIt');}catch{}try{portal=await config.contract('AuthenticatedStatePortal');}catch{}
 const client=new PrivacyClient({...identity,keys,memory,chat,collection,portal});
 if(cancelled()){client.lock();return {client,destroy(){client.lock();}};}
 const element=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const panel=element('section');panel.className='privacy-extension-desk';panel.setAttribute('data-private-surface','true');
 panel.append(element('h3','Private memory & conversations'),element('p','Create a private encryption key, save an encrypted backup, then register its public key. Wallet ownership and encryption keys are separate. Your message text stays on this device until encrypted.'));
 const status=element('p','Encryption identity is locked.');status.setAttribute('role','status');panel.append(status);
 const fields=new Map();
 function field(name,label,type='text',value=''){const wrap=element('label',label),input=element(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value;input.autocomplete='off';input.setAttribute('data-private-surface','true');wrap.append(input);panel.append(wrap);fields.set(name,input);return input;}
 function value(name){return fields.get(name).value.trim();}
 const jobs=[];let busy=false,operationRevision=client.revision,inputRevision=0,operationInputRevision=0;
 panel.addEventListener('input',()=>{++inputRevision;});
 const active=()=>{if(cancelled()||operationRevision!==client.revision||operationInputRevision!==inputRevision)throw Error('Private operation cancelled because the input, workbench or encryption identity changed.');};
 function button(label,job){const b=element('button',label);b.type='button';b.onclick=async()=>{if(busy||cancelled())return;busy=true;operationRevision=client.revision;operationInputRevision=inputRevision;for(const x of jobs)x.disabled=true;try{await job();}catch(error){if(!cancelled())status.textContent=error.message||'Action could not be completed.';}finally{busy=false;if(!cancelled())for(const x of jobs)x.disabled=false;}};jobs.push(b);panel.append(b);return b;}
 async function review(title,description,transaction){active();await config.review({title,description,transaction,sender:'wallet'});if(!cancelled())status.textContent='Transaction prepared for wallet review. Refresh chain state after confirmation.';}
 field('password','Encrypted backup passphrase (16+ characters)','password');
 button('Create encryption identity',async()=>{await client.newIdentity();status.textContent='Private key created in memory. Download an encrypted backup before registering.';});
 button('Download encrypted key backup',async()=>{const backup=await client.backup(value('password'));active();const url=URL.createObjectURL(new Blob([JSON.stringify(backup)],{type:'application/json'})),link=element('a','Download');link.href=url;link.download='anima-encrypted-identity.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);fields.get('password').value='';status.textContent='Encrypted backup downloaded. Keep the passphrase separately.';});
 const restore=field('backup','Restore encrypted identity backup','file');restore.accept='application/json,.json';
 button('Restore identity',async()=>{if(!restore.files[0]||restore.files[0].size>16384)throw Error('Select an encrypted identity backup smaller than 16 KiB.');const encoded=await restore.files[0].text();active();await client.restore(JSON.parse(encoded),value('password'));fields.get('password').value='';status.textContent='Identity restored in memory.';});
 button('Register public encryption key',async()=>review('Register encryption identity','Publishes only your encryption public key. Replacing a registered key pauses existing group epochs until their manager rotates keys.',await client.register()));
 const lock=()=>{client.lock();for(const input of fields.values())input.value='';status.textContent='Private keys, passphrases, selected backups and displayed message text cleared from this panel.';};
 const lockButton=element('button','Lock private keys');lockButton.type='button';lockButton.onclick=lock;panel.append(lockButton);
 if(memory){
 panel.append(element('h4','Hand over agent memory'),element('p','The recipient decrypts and checks the committed content before accepting. Acceptance transfers the NFT atomically. The sender can retain old content; the buyer must use fresh keys for future memory.'));
 field('token','NFT token ID','number',String(identity.tokenId||1));
 field('memory','Private agent memory','textarea');
 field('recipient','Recipient wallet address');
 field('offer','Handover offer ID','number','1');
 button('Encrypt and publish memory',async()=>{const result=await client.publishMemory(value('token'),fields.get('memory').value);await review('Publish encrypted agent memory','Stores ciphertext and a salted content commitment onchain. Plaintext is never included in transaction calldata.',result.transaction);});
 button('Approve this handover contract',async()=>review('Approve memory handover','Allows the memory handover contract to transfer this NFT only through a recipient-accepted offer.',await client.approveMemoryTransfer(value('token'))));
 button('Encrypt handover for recipient',async()=>{const result=await client.proposeMemory(value('token'),value('recipient'),Math.floor(Date.now()/1000)+86400);await review('Offer encrypted memory handover','Expires in 24 hours. The recipient must decrypt, verify and accept before the NFT moves.',result.transaction);});
 button('Decrypt, verify and review acceptance',async()=>{const result=await client.receiveMemory(value('offer'));active();fields.get('memory').value=result.text;await review('Accept verified memory handover','Your browser decrypted this memory and checked its salted commitment. Accepting transfers the NFT to this wallet. This is recipient confirmation, not a zero-knowledge proof.',result.transaction);});
 button('Recover received memory',async()=>{const result=await client.readReceivedMemory(value('offer'));active();fields.get('memory').value=result.text;status.textContent='Received memory recovered and its commitment verified. No transaction was prepared.';});
 button('Cancel handover',async()=>review('Cancel memory offer','Stops this offer from transferring ownership.',await client.cancelMemory(value('offer'))));
 }else panel.append(element('p','Private memory handover is not configured. Encrypted conversations do not require it.'));
 if(chat){
 panel.append(element('h4','Encrypted group chat'),element('p','Membership and timing remain public. Invitations need the recipient’s acceptance. The manager rotates the epoch after every change. Removed members retain old messages they already had keys for.'));
 field('room','Room ID','number','1');field('members','All accepted member addresses, comma separated','textarea',identity.owner||'');field('message','Private message','textarea');field('messageId','Message index (first message is 0)','number','0');
 if(!fields.has('recipient'))field('recipient','Recipient wallet address');
 button('Create private room',async()=>review('Create private room','Creates a ciphertext-only room with you as manager. Rotate keys before posting.',await client.createRoom()));
 button('Invite recipient',async()=>review('Invite group member','Recipient must accept this invitation within seven days.',await client.invite(value('room'),value('recipient'),Math.floor(Date.now()/1000)+7*86400-60)));
 button('Accept group invitation',async()=>review('Join private group','Membership change pauses posting until the manager distributes a fresh epoch key.',await client.join(value('room'))));
 button('Remove recipient',async()=>review('Remove group member','Pauses messages immediately. Rotate keys for the remaining members before posting again.',await client.remove(value('room'),value('recipient'))));
 button('Rotate group keys',async()=>{const result=await client.rotate(value('room'),value('members').split(',').map(x=>x.trim()).filter(Boolean));await review('Rotate encrypted group epoch','Creates a fresh random key and encrypts a separate key package for each accepted member. Only encrypted packages reach the chain.',result.transaction);});
 button('Encrypt and review message',async()=>review('Send encrypted group message','Only authenticated ciphertext is submitted. The private text is padded to reduce length leakage.',await client.post(value('room'),fields.get('message').value)));
 button('Decrypt message',async()=>{const m=await client.readMessage(value('room'),value('messageId'));active();fields.get('message').value=m.text;status.textContent=`Decrypted message ${value('messageId')} from ${m.sender}, epoch ${m.epoch}.`;});
 button('Leave private group',async()=>review('Leave private group','Removes your future membership and pauses messages until the manager rotates keys.',await client.leave(value('room'))));
 }else panel.append(element('p','Encrypted group chat is not configured for this deployment.'));
 panel.append(element('h4','Authenticated state portal'));
 if(portal){
  if(!fields.has('token'))field('token','NFT token ID','number',String(identity.tokenId||1));
  panel.append(element('p','Send a historical state observation to the configured peer. The remote chain receives no authority over the NFT account. Source confirmations and transport verification must finish before delivery.'));
  field('options','Transport executor options (hex)','text','0x');
  button('Queue state for the other chain',async()=>review('Queue cross-chain observation','Captures state with a 30-minute expiry. Transfer of custody before dispatch invalidates this queued snapshot.',await client.queuePortal(value('token'),Math.floor(Date.now()/1000)+1800)));
  button('Quote delivery and review dispatch',async()=>review('Dispatch authenticated observation','Uses the configured immutable endpoint and peer. The quoted native transport fee is included in the transaction review.',await client.dispatchPortal(value('token'),value('options'))));
 }else panel.append(element('p','No authenticated transport is configured for this deployment. Local two-chain integration is supplied; a public route needs verified endpoint addresses, peer deployments and transport security configuration.'));
 const destroy=()=>{destroyed=true;lock();panel.remove();};
 config.signal?.addEventListener('abort',destroy,{once:true});
 if(cancelled()){destroy();return {client,destroy};}
 container.replaceChildren(panel);
 return {client,destroy,lock};
}
