import {Contract,getAddress,ZeroAddress,ZeroHash,formatEther,formatUnits,parseUnits,hexlify,toUtf8Bytes,toUtf8String,Utf8ErrorFuncs} from '../vendor/ethers.min.js';
const MAX112=(1n<<112n)-1n;
export const LEDGER_ABI=[
  'function collection() view returns(address)','function isSealed() view returns(bool)','function market() view returns(address)','function vault() view returns(address)',
  'function roomCount() view returns(uint256)','function roomInfo(uint256) view returns(address,address,uint32,bool,uint24,uint256)','function roomText(uint256) view returns(string,string)',
  'function roomMessageId(uint256,uint256) view returns(uint256)','function messageAt(uint256) view returns(address,uint256,uint256,uint64,uint256,bytes,bool)',
  'function messageAttribution(uint256) view returns(address,uint256)','function member(uint256,address) view returns(bool)','function accepted(uint256,address) view returns(bool)',
  'function banned(uint256,address) view returns(bool)','function moderatorActive(uint256,address) view returns(bool)','function invitationEpoch(uint256,address) view returns(uint256)',
  'function lastPost(uint256,address) view returns(uint64)','function post(uint256,uint256,bytes,uint256) returns(uint256)',
  'function createRoom(string,string,bool,uint32,uint24,uint256) returns(uint256)','function configureRoom(uint256,string,string,bool,uint32,uint24)',
  'function acceptInvitation(uint256,bool)','function setMember(uint256,address,bool,bool)','function setModerator(uint256,address,bool)'
];
export const MARKET_ABI=['function ledger() view returns(address)','function quote(address,address,uint256) view returns(uint256,uint256,uint8)','function swap(address,address,uint112,uint112,uint48,uint256,uint64) payable returns(uint256,uint256)'];
export const VAULT_ABI=['function ledger() view returns(address)','function deposit(address,uint112,address,uint64,uint64,uint64,bool,uint256) payable returns(uint256)','function release(uint256) returns(uint256)','function releasable(uint256) view returns(uint256)','function lockInfo(uint256) view returns(address,address,address,uint112,uint112,uint64,uint64,uint64,bool,uint256)'];
export const MEMORY_ABI=['function collection() view returns(address)','function head(uint256) view returns(bytes32)','function router() view returns(address)','function appendPersonal(uint256,uint256,uint8,bool,bytes32,bytes) returns(uint256)'];
export const JOURNAL_ABI=['function journal() view returns(address)','function market() view returns(address)','function nonces(address) view returns(uint256)','function swapAndInscribe((uint256 identity,uint256 nonce,address input,address output,uint112 amount,uint112 minOut,uint48 deadline,uint8 privacyMode,bool imprint,bytes32 expectedJournalHead),bytes) payable returns(uint256,uint256)'];
const equal=(a,b)=>getAddress(a)===getAddress(b);
const positive=(x,max=MAX112)=>{const n=BigInt(x);if(n<=0n||n>max)throw Error('Amount is outside the supported range.');return n;};
const integer=(value,label,max=(1n<<256n)-1n,min=0n)=>{if(!/^\d+$/.test(String(value)))throw Error(label+' must be a whole number.');const n=BigInt(value);if(n<min||n>max)throw Error(label+' is outside the supported range.');return n;};
const roomTerms=({name,topic='',gated=false,slow='3',color='#8af1ff',publicConsent=false})=>{
  if(!publicConsent)throw Error('Confirm that this room name and topic may be published onchain.');
  name=String(name||'');topic=String(topic);
  if(!name.trim()||toUtf8Bytes(name).length>48||toUtf8Bytes(topic).length>256)throw Error('Use 1–48 UTF-8 bytes for the room name and at most 256 for its topic.');
  if(!/^#[0-9a-f]{6}$/i.test(String(color)))throw Error('Choose a six-digit room color.');
  return {name,topic,gated:!!gated,slow:Number(integer(slow,'Slow mode',3600n)),color:Number.parseInt(color.slice(1),16)};
};
export async function assetDetails(provider,address){
  address=getAddress(address);if(address===ZeroAddress)return {address,decimals:18,symbol:'ETH'};
  if(await provider.getCode(address)==='0x')throw Error('The token address has no deployed code.');
  const token=new Contract(address,['function decimals() view returns(uint8)','function symbol() view returns(string)'],provider);
  const decimals=Number(await token.decimals());if(decimals>36)throw Error('This desk supports tokens with up to 36 decimals.');
  let symbol='TOKEN';try{symbol=String(await token.symbol()).slice(0,32);}catch{}
  return {address,decimals,symbol};
}
export class LiveProtocol {
  constructor(wallet){this.wallet=wallet;}
  async ledger(address){
    const w=this.wallet;await w.assertOwner();address=getAddress(address);
    if(await w.provider.getCode(address)==='0x')throw Error('No WorldLedger exists at this address.');
    const ledger=new Contract(address,LEDGER_ABI,w.provider);
    if(!equal(await ledger.collection(),w.collection))throw Error('This ledger belongs to a different NFT collection.');
    if(!await ledger.isSealed())throw Error('The protocol modules have not been sealed.');
    return ledger;
  }
  async module(address,kind,abi){
    const w=this.wallet;await w.assertOwner();address=getAddress(address);
    if(await w.provider.getCode(address)==='0x')throw Error('This module has no deployed code.');
    const module=new Contract(address,abi,w.provider),ledger=await this.ledger(await module.ledger());
    if(!equal(await ledger[kind](),address))throw Error('This module is not the ledger’s installed '+kind+'.');
    return module;
  }
  async memory(address){
    await this.wallet.assertOwner();const memory=new Contract(getAddress(address),MEMORY_ABI,this.wallet.provider);
    if(!equal(await memory.collection(),this.wallet.collection))throw Error('This journal belongs to a different NFT collection.');
    return memory;
  }
  async swap({market:address,input,output,amount,slippage='0.5',journal='',text='',publicConsent=false}){
    const w=this.wallet;w.plan=null;const market=await this.module(address,'market',MARKET_ABI);
    const [a,b]=await Promise.all([assetDetails(w.provider,input),assetDetails(w.provider,output)]);
    if(a.address===b.address)throw Error('Choose different input and output tokens.');
    const raw=positive(parseUnits(String(amount),a.decimals));
    const bps=parseUnits(String(slippage),2);if(bps<0n||bps>=10000n)throw Error('Slippage must be at least 0 and below 100 percent.');
    const quote=await market.quote(a.address,b.address,raw),minimum=positive(quote[0]*(10000n-bps)/10000n);
    const block=await w.provider.getBlock('latest'),deadline=block.timestamp+600;
    let target=market.target,data;
    if(text.trim()){
      if(!publicConsent)throw Error('Confirm that this trade note may be published onchain.');
      const payload=toUtf8Bytes(text);if(payload.length>32768)throw Error('Trade note exceeds 32 KiB.');
      const memory=await this.memory(journal),router=new Contract(await memory.router(),JOURNAL_ABI,w.provider);
      if(!equal(await router.journal(),memory.target)||!equal(await router.market(),market.target))throw Error('The journal router does not match this market.');
      const order=[w.tokenId,await router.nonces(w.account),a.address,b.address,raw,minimum,deadline,0,true,await memory.head(w.tokenId)];
      data=router.interface.encodeFunctionData('swapAndInscribe',[order,hexlify(payload)]);target=router.target;
    }else data=market.interface.encodeFunctionData('swap',[a.address,b.address,raw,minimum,deadline,w.tokenId,0]);
    const plan=await w.prepareUtility({target,asset:a.address,amount:a.address===ZeroAddress?'0':String(raw),value:a.address===ZeroAddress?formatEther(raw):'0',data});
    return {plan,quote:formatUnits(quote[0],b.decimals)+' '+b.symbol,minimum:formatUnits(minimum,b.decimals)+' '+b.symbol,amount:String(raw),deadline,recipient:w.account,journaled:!!text.trim()};
  }
  async lock({vault:address,asset,amount,days='30',linear=false}){
    const w=this.wallet;w.plan=null;const vault=await this.module(address,'vault',VAULT_ABI),a=await assetDetails(w.provider,asset),raw=positive(parseUnits(String(amount),a.decimals));
    if(!/^\d+$/.test(String(days))||Number(days)<1||Number(days)>3650)throw Error('Choose a whole duration from 1 to 3650 days.');
    const block=await w.provider.getBlock('latest'),end=block.timestamp+Number(days)*86400;
    const data=vault.interface.encodeFunctionData('deposit',[a.address,raw,w.account,0,linear?0:end,end,!!linear,w.tokenId]);
    const plan=await w.prepareUtility({target:vault.target,asset:a.address,amount:a.address===ZeroAddress?'0':String(raw),value:a.address===ZeroAddress?formatEther(raw):'0',data});
    return {plan,recipient:w.account,amount:formatUnits(raw,a.decimals)+' '+a.symbol,end,linear:!!linear};
  }
  async release({vault:address,id}){
    const w=this.wallet;w.plan=null;const vault=await this.module(address,'vault',VAULT_ABI);id=positive(id,(1n<<256n)-1n);
    const info=await vault.lockInfo(id);if(!equal(info[1],w.account))throw Error('This lock belongs to another beneficiary.');
    const amount=await vault.releasable(id);if(amount===0n)throw Error('Nothing has vested for release yet.');
    return {plan:await w.prepare({target:vault.target,data:vault.interface.encodeFunctionData('release',[id])}),amount:String(amount),recipient:w.account};
  }
  async inscribe({journal,text,publicConsent=false}){
    this.wallet.plan=null;if(!publicConsent)throw Error('Confirm that this memory may be published onchain.');
    const memory=await this.memory(journal),payload=toUtf8Bytes(text);
    if(payload.length<1||payload.length>32768)throw Error('Use 1–32768 bytes for this inscription.');
    const data=memory.interface.encodeFunctionData('appendPersonal',[this.wallet.tokenId,0,0,true,await memory.head(this.wallet.tokenId),hexlify(payload)]);
    return {plan:await this.wallet.preparePersonal({target:memory.target,data}),bytes:payload.length};
  }
  // Commons pages and permission decisions share one block. A changed custodian,
  // chain, account, or session invalidates both in-flight reads and prepared writes.
  async commonsContext(address){
    const w=this.wallet,revision=w.revision,provider=w.provider,account=w.account,collection=w.collection,tokenId=w.tokenId;
    await w.assertOwner();
    if(revision!==w.revision||provider!==w.provider)throw Error('Wallet context changed while opening Commons.');
    const block=await provider.getBlock('latest');if(!block)throw Error('The Commons block is unavailable.');
    const at={blockTag:block.number},ledger=new Contract(getAddress(address),LEDGER_ABI,provider);
    const [code,bound,sealed,epoch,owner]=await Promise.all([provider.getCode(ledger.target,block.number),ledger.collection(at),ledger.isSealed(at),w.contract.sessionEpoch(at),w.core.ownerOf(tokenId,at)]);
    if(code==='0x'||!equal(bound,collection)||!sealed)throw Error('Use a sealed WorldLedger belonging to this NFT collection.');
    if(!equal(owner,w.address))throw Error('Ownership changed at the Commons snapshot.');
    const context={ledger,provider,account,collection,tokenId,revision,epoch:String(epoch),block,at};
    await this.assertCommonsContext(context);return context;
  }
  async assertCommonsContext(context){
    const w=this.wallet,c=context;
    if(w.revision!==c.revision||w.provider!==c.provider||w.account!==c.account||w.collection!==c.collection||w.tokenId!==c.tokenId)throw Error('Wallet context changed while reading Commons.');
    const block=await c.provider.getBlock(c.block.number);
    if(!block||block.hash!==c.block.hash)throw Error('The Commons block changed. Refresh and review again.');
    await w.assertReviewContext(c.revision,c.epoch);
    if(!w.connected||w.revision!==c.revision||w.provider!==c.provider||w.account!==c.account||w.collection!==c.collection||w.tokenId!==c.tokenId)throw Error('Wallet context changed while reading Commons.');
  }
  async roomAt(context,id){
    const {ledger,at}=context;
    const [info,words]=await Promise.all([ledger.roomInfo(id,at),ledger.roomText(id,at)]);
    return {id:String(id),name:words[0],topic:words[1],admin:info[0],subject:info[1],slow:Number(info[2]),membersOnly:info[3],color:'#'+Number(info[4]).toString(16).padStart(6,'0'),messageCount:String(info[5])};
  }
  async roomContext(address,room){
    const c=await this.commonsContext(address),id=integer(room,'Room ID',undefined,1n),{ledger,at,account}=c;
    if(id>await ledger.roomCount(at))throw Error('This room does not exist.');
    const info=await this.roomAt(c,id);
    let adminEpoch=0n;
    if(info.admin!==ZeroAddress&&await c.provider.getCode(info.admin,c.block.number)!=='0x'){
      // WorldLedger treats a non-session contract as epoch zero as well.
      try{adminEpoch=await new Contract(info.admin,['function sessionEpoch() view returns(uint256)'],c.provider).sessionEpoch(at);}catch(error){if(!['CALL_EXCEPTION','BAD_DATA'].includes(error.code))throw error;}
    }
    const [member,accepted,banned,moderator,invitationEpoch,lastPost]=await Promise.all([ledger.member(id,account,at),ledger.accepted(id,account,at),ledger.banned(id,account,at),ledger.moderatorActive(id,account,at),ledger.invitationEpoch(id,account,at),ledger.lastPost(id,account,at)]);
    const admin=equal(info.admin,account),invited=member&&invitationEpoch===adminEpoch,joined=invited&&accepted&&!banned;
    const access={admin,moderator,invited,joined,banned,canPost:!banned&&(!info.membersOnly||admin||joined||moderator),canManage:admin||moderator,canAccept:id!==1n&&invited&&!banned,postAfter:lastPost===0n?0:Number(lastPost)+info.slow};
    return {...c,id,info,access};
  }
  async rooms({ledger:address,start='1',limit='12'}){
    const c=await this.commonsContext(address),first=integer(start,'First room',undefined,1n),size=integer(limit,'Page size',20n,1n),total=await c.ledger.roomCount(c.at);
    if(first>total)throw Error('This room page does not exist.');
    const end=first+size-1n>total?total:first+size-1n,ids=Array.from({length:Number(end-first+1n)},(_,i)=>first+BigInt(i));
    const rooms=await Promise.all(ids.map(id=>this.roomAt(c,id)));await this.assertCommonsContext(c);
    return {block:c.block.number,blockHash:c.block.hash,total:String(total),rooms,next:end<total?String(end+1n):null};
  }
  async readRoom({ledger:address,room='1',before='',limit='20'}){
    const c=await this.roomContext(address,room),size=integer(limit,'Page size',32n,1n),count=BigInt(c.info.messageCount),end=before===''?count:integer(before,'Message cursor',count),start=end>size?end-size:0n;
    const indexes=Array.from({length:Number(end-start)},(_,i)=>start+BigInt(i));
    const messages=await Promise.all(indexes.map(async index=>{
      const id=await c.ledger.roomMessageId(c.id,index,c.at);
      const [m,a]=await Promise.all([c.ledger.messageAt(id,c.at),c.ledger.messageAttribution(id,c.at)]);
      return {id:String(id),author:m[0],identity:String(m[1]),room:String(m[2]),time:Number(m[3]),replyTo:String(m[4]),text:toUtf8String(m[5],Utf8ErrorFuncs.replace),hidden:m[6],custodian:a[0],epoch:String(a[1])};
    }));
    await this.assertCommonsContext(c);
    return {block:c.block.number,blockHash:c.block.hash,actor:c.account,...c.info,access:c.access,messages,nextBefore:start>0n?String(start):null};
  }
  async prepareCommons(context,method,args){
    const w=this.wallet;let plan;
    try{
      await this.assertCommonsContext(context);
      plan=await w.prepare({target:context.ledger.target,data:context.ledger.interface.encodeFunctionData(method,args)});
      // A superseded request must never replace a visible review while its final
      // RPC checks are pending. The desk also checks its own generation on return.
      if(w.plan===plan)w.plan=null;
      await this.assertCommonsContext(context);w.plan=plan;return plan;
    }catch(error){if(plan&&w.plan===plan)w.plan=null;throw error;}
  }
  async createRoom({ledger:address,...value}){
    this.wallet.plan=null;const t=roomTerms(value),c=await this.commonsContext(address);
    return {plan:await this.prepareCommons(c,'createRoom',[t.name,t.topic,t.gated,t.slow,t.color,c.tokenId]),action:'Create a public-readable room',name:t.name,topic:t.topic,posting:t.gated?'Accepted invitations only':'Open to unbanned accounts',slowMode:t.slow+' seconds',admin:c.account};
  }
  async configureRoom({ledger:address,room,...value}){
    this.wallet.plan=null;const t=roomTerms(value),c=await this.roomContext(address,room);
    if(!c.access.admin||c.id===1n)throw Error('Only this room’s NFT account admin can change its settings.');
    return {plan:await this.prepareCommons(c,'configureRoom',[c.id,t.name,t.topic,t.gated,t.slow,t.color]),action:'Configure room',room:String(c.id),name:t.name,topic:t.topic,posting:t.gated?'Accepted invitations only':'Open to unbanned accounts',slowMode:t.slow+' seconds'};
  }
  async membership({ledger:address,room,accepted}){
    this.wallet.plan=null;const c=await this.roomContext(address,room);
    if(!c.access.canAccept)throw Error('A current, unbanned invitation from this room is required.');
    if(c.access.admin)throw Error('The room admin keeps its authority; membership withdrawal cannot leave that role.');
    if(c.access.joined===accepted)throw Error(accepted?'This invitation is already accepted.':'This invitation is not currently accepted.');
    return {plan:await this.prepareCommons(c,'acceptInvitation',[c.id,accepted]),action:accepted?'Accept room invitation':'Withdraw room acceptance',room:String(c.id),name:c.info.name,account:c.account,visibility:'Messages and membership remain publicly readable',posting:accepted?'Room access follows its current rules':'Public rooms still allow unbanned accounts to post'};
  }
  async joinRoom(value){return this.membership({...value,accepted:true});}
  async leaveRoom(value){return this.membership({...value,accepted:false});}
  async setMember({ledger:address,room,who,memberAction='invite'}){
    this.wallet.plan=null;const c=await this.roomContext(address,room),target=getAddress(who);
    if(!c.access.canManage||c.id===1n)throw Error('Only the room admin or an active moderator can manage invitations.');
    if(target===ZeroAddress||equal(target,c.info.admin))throw Error('Choose an account other than zero or the room admin.');
    if(!c.access.admin&&await c.ledger.moderatorActive(c.id,target,c.at))throw Error('A moderator cannot change another active moderator.');
    if(!['invite','remove','ban','unban'].includes(memberAction))throw Error('Choose invite, remove, ban or unban.');
    const alreadyAccepted=memberAction==='invite'&&await c.ledger.accepted(c.id,target,c.at);
    return {plan:await this.prepareCommons(c,'setMember',[c.id,target,memberAction==='invite',memberAction==='ban']),action:memberAction,room:String(c.id),account:target,effect:memberAction==='invite'?(alreadyAccepted?'Renews the invitation and retains its existing acceptance':'Offers write access; the invited account must accept'):'Clears membership acceptance and moderator flag; previous messages remain public'};
  }
  async setModerator({ledger:address,room,who,moderatorAllowed=false}){
    this.wallet.plan=null;const c=await this.roomContext(address,room),target=getAddress(who);
    if(!c.access.admin||c.id===1n)throw Error('Only the room admin can change moderators.');
    if(target===ZeroAddress||equal(target,c.info.admin))throw Error('Choose an account other than zero or the room admin.');
    return {plan:await this.prepareCommons(c,'setModerator',[c.id,target,!!moderatorAllowed]),action:moderatorAllowed?'Invite moderator':'Remove moderator role',room:String(c.id),account:target,effect:moderatorAllowed?'The invited account must accept before moderating':'Removes moderation authority; membership remains subject to room rules'};
  }
  async post({ledger:address,room='1',replyTo='0',text,publicConsent=false}){
    this.wallet.plan=null;if(!publicConsent)throw Error('Confirm that this message may be published onchain.');
    const payload=toUtf8Bytes(text);
    if(payload.length<1||payload.length>1024)throw Error('Use 1–1024 bytes for this message.');
    const c=await this.roomContext(address,room),reply=integer(replyTo||'0','Reply message ID');
    if(!c.access.canPost)throw Error(c.access.banned?'This account is banned from this room.':'Accept a current room invitation before posting here.');
    if(c.access.postAfter>c.block.timestamp)throw Error('Room slow mode: wait '+(c.access.postAfter-c.block.timestamp)+' more seconds.');
    if(reply!==0n&&(await c.ledger.messageAt(reply,c.at))[2]!==c.id)throw Error('Replies must refer to a message in this room.');
    return {plan:await this.prepareCommons(c,'post',[c.id,reply,hexlify(payload),c.tokenId]),room:String(c.id),name:c.info.name,replyTo:String(reply),message:text,bytes:payload.length,visibility:'Public and permanent'};
  }
}
