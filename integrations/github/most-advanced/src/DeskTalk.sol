// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {IParley} from "./interfaces/Site.sol";

/*═══════════════════════════════════════════════════════════════════════════

  THE TALKING DESK — the messaging client, held in contract code

  Everything the chat needs to run is here: how to find out which token you
  are, how to walk a room backwards through the chain, how to build the
  calldata for a message, and how to put a stranger's words on the screen
  without letting them run.

  Three things this file refuses to do, each for a reason:

  **No keccak.** A page that hashes its own event signatures is a page you
  have to audit a hash function in. `Parley.topics()` returns them, derived
  from the same strings the compiler hashes, and they arrive in the config
  block below already computed. Same for every selector.

  **No `innerHTML` for anything that came off the chain.** A room name and
  a message body are chosen by whoever sent them, and this page runs on the
  same origin as `/token/<id>/live`, where a wallet is injected. Every
  string that came from a log or a call reaches the DOM through
  `textContent` and nothing else. There is no escaping function here to get
  wrong, because there is no place a mistake could be made.

  **No range scans.** `eth_getLogs` is asked for exactly one block at a
  time — the block the contract says the newest message is in — and each
  message says which block to ask for next. A public endpoint will answer
  that all day. A range query over ten thousand blocks it will not.

═══════════════════════════════════════════════════════════════════════════*/
contract DeskTalk {
    using LibNum for uint256;

    IParley public immutable PARLEY;
    address public immutable HUB;
    /// @dev A read-only companion, replaceable without touching the archive.
    address public immutable ROSTER;

    constructor(IParley parley, address hub, address roster) {
        PARLEY = parley;
        HUB = hub;
        ROSTER = roster;
    }

    /*═══════════════════ the data the client runs on ═══════════════════*/

    /// @notice The second config block. `room` is the room this page is
    ///         about; `other` is the token on the far side of a pair, and
    ///         the client derives that room itself once it knows which
    ///         token you are.
    function config(uint256 room, uint256 other, uint256 group)
        external view returns (string memory)
    {
        (bytes32 said,,,,) = PARLEY.topics();
        /*  Who keeps this room, so the roster can mark them and the client
            never has to ask a second time.                              */
        uint256 keeper;
        if (room != 0) { (,,,,,, keeper,,) = PARLEY.stateOf(room); }
        return string.concat(
            "<script type=\"application/json\" id=\"T\">{",
            "\"at\":\"", LibNum.hexAddr(address(PARLEY)), "\",",
            "\"roster\":\"", LibNum.hexAddr(ROSTER), "\",",
            "\"hub\":\"", LibNum.hexAddr(HUB), "\",",
            "\"room\":\"", room.str(), "\",",
            "\"other\":\"", other.str(), "\",",
            "\"group\":", group.str(), ",",
            "\"steward\":", keeper.str(), ",",
            "\"max\":", PARLEY.MAX_BODY().str(), ",",
            "\"said\":\"", LibNum.hex32(said), "\",",
            "\"sel\":{", _sel(), "}",
            "}</script>"
        );
    }

    /// @dev Every selector derived from its signature. Nothing in this file
    ///      contains a four-byte constant somebody typed.
    function _sel() private pure returns (string memory) {
        return string.concat(
            "\"speak\":\"",    _s("speak(uint256,uint256,uint8,bytes)"),
            "\",\"whisper\":\"", _s("whisper(uint256,uint256,uint8,bytes)"),
            "\",\"found\":\"",   _s("found(uint256,string,bool)"),
            "\",\"join\":\"",    _s("join(uint256,uint256)"),
            "\",\"leave\":\"",   _s("leave(uint256,uint256)"),
            "\",\"stats\":\"",   _s("statsOf(uint256)"),
            "\",\"invite\":\"",  _s("invite(uint256,uint256,uint256)"),
            "\",\"evict\":\"",   _s("evict(uint256,uint256,uint256)"),
            "\",\"inWin\":\"",   _s("inWindow(uint256,uint256)"),
            "\",\"invWin\":\"",  _s("invitedInWindow(uint256,uint256)"),
            "\",\"stewOf\":\"",  _s("stewardedBy(uint256,uint256,uint256)"),
            "\",\"state\":\"",   _s("stateOf(uint256)"),
            "\",\"heads\":\"",   _s("heads(uint256[])"),
            "\",\"rooms\":\"",   _s("roomsOf(uint256)"),
            "\",\"pair\":\"",    _s("pairKey(uint256,uint256)"),
            "\",\"announce\":\"",_s("announce(uint256,bytes32,bytes32)"),
            "\",\"keyOf\":\"",   _s("keyOf(uint256)"),
            "\",\"group\":\"",   _s("groupKey(uint256)"),
            "\",\"may\":\"",     _s("mayActAs(uint256,address)"),
            "\",\"bal\":\"",     _s("balanceOf(address)"),
            "\",\"at\":\"",      _s("tokenOfOwnerByIndex(address,uint256)"),
            "\",\"owner\":\"",   _s("ownerOf(uint256)"),
            "\""
        );
    }

    function _s(string memory sig) private pure returns (string memory) {
        bytes32 h = keccak256(bytes(sig));
        bytes memory out = new bytes(10);
        out[0] = "0"; out[1] = "x";
        bytes16 hexes = "0123456789abcdef";
        for (uint256 i; i < 4; ++i) {
            out[2 + i * 2] = hexes[uint8(h[i]) >> 4];
            out[3 + i * 2] = hexes[uint8(h[i]) & 15];
        }
        return string(out);
    }

    function core() external pure returns (string memory) {
        return string.concat("<script>", TALK_JS, "</script>");
    }

    function rooms() external pure returns (string memory) {
        return string.concat("<script>", ROOMS_JS, "</script>");
    }

    /*═══════════════════ the client ═══════════════════*/

    string internal constant TALK_JS =
        "window.IPT=(()=>{"
        "const I=window.IP,$=I.$;"
        "const E=document.getElementById('T');if(!E)return null;"
        "const T=JSON.parse(E.textContent);const P=T.at,S=T.sel;"
        /*  Bytes in and out. TextEncoder is the platform's UTF-8, so a
            message with an emoji in it is the same bytes on chain as it was
            in the box, and a message that came back is the same characters
            it was sent as. */
        "const B2H=s=>{let o='';for(const b of new TextEncoder().encode(s))"
        "o+=b.toString(16).padStart(2,'0');return o};"
        "const H2B=h=>{h=String(h||'').replace(/^0x/,'');"
        "const a=new Uint8Array(h.length>>1);"
        "for(let i=0;i<a.length;i++)a[i]=parseInt(h.substr(i*2,2),16)||0;return a};"
        "const TXT=h=>new TextDecoder().decode(H2B(h));"
        // a dynamic `bytes` argument, laid out by hand: length, then the
        // bytes, then zeros up to the next word
        "const ARG=h=>{const n=h.length>>1;const pad=(32-(n%32))%32;"
        "return I.W(n)+h+'0'.repeat(pad*2)};"
        "const HX=n=>'0x'+BigInt(n).toString(16);"
        "const wordAt=(d,i)=>BigInt('0x'+d.slice(i*64,i*64+64));"

        /*───── which token you are ─────*/
        "let ME=null,MINE=[];"
        "const keep=k=>{try{return localStorage.getItem(k)}catch(e){return null}};"
        "const put=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};"
        "const held=async a=>{const out=[];"
        "const n=Number(I.word(await I.call(T.hub,S.bal+I.AD(a)),0));"
        "for(let i=0;i<n&&i<64;i++){"
        "const r=await I.tryCall(T.hub,S.at+I.AD(a)+I.W(i));if(r)out.push(I.word(r,0))}"
        "return out};"

        /*───── one message, out of one log ─────*/
        "const READ=l=>{const d=String(l.data||'').replace(/^0x/,'');"
        "const off=Number(wordAt(d,4))*2;"
        "const len=Number(wordAt(d,off/64));"
        "return{room:BigInt(l.topics[1]),from:BigInt(l.topics[2]),"
        "prev:wordAt(d,0),prevFrom:wordAt(d,1),seq:wordAt(d,2),"
        "kind:Number(wordAt(d,3)),body:d.slice(off+64,off+64+len*2),"
        "block:BigInt(l.blockNumber),tx:l.transactionHash}};"

        /*  The walk. `stateOf` says which block holds the newest message;
            that block's oldest message says which block holds the one
            before it. Nothing is scanned, and the guard is not decorative:
            a pointer that did not go backwards would be a loop that never
            ends, and the one thing a client must never do to somebody's
            node is ask forever. */
        "const back=async(room,want)=>{"
        "const st=await I.call(P,S.state+I.W(room));"
        "let at=I.word(st,0);const out=[];let guard=0;"
        "while(at>0n&&out.length<want&&guard++<64){"
        "const ls=await I.pv().request({method:'eth_getLogs',params:[{address:P,"
        "fromBlock:HX(at),toBlock:HX(at),topics:[T.said,'0x'+I.W(room)]}]});"
        "if(!ls||!ls.length)break;"
        "const ms=ls.map(READ);"
        "for(let i=ms.length-1;i>=0;i--)out.push(ms[i]);"
        "const step=ms[0].prev;if(!(step<at))break;at=step}"
        "return out.reverse()};"

        /*───── the room on the screen ─────*/
        "const NAMES={};"
        "const line=m=>{const row=document.createElement('div');"
        "row.className='msg'+(ME!=null&&m.from===ME?' me':'');"
        "const who=document.createElement('b');who.textContent='#'+m.from;"
        "const a=document.createElement('a');a.href='/dm/'+m.from;a.textContent='dm';a.className='dmlink';"
        "const t=document.createElement('span');t.className='at';t.textContent='block '+m.block;"
        "const p=document.createElement('p');"
        /*  A body that is not plain text is not turned into text. `kind`
            says what it is, and a sealed body the client cannot open is
            reported as sealed rather than rendered as mojibake. */
        "p.textContent=m.kind===0?TXT(m.body):'\\u2022 sealed \\u00b7 '+(m.body.length>>1)+' bytes';"
        "if(m.kind!==0){p.className='sealed';"
        "if(window.UNSEAL)window.UNSEAL(m,p)}"
        "row.append(who,a,t,p);return row};"

        "let ROOM=null,SEEN=0n,BUSY=false;"
        "const paint=async(want)=>{const box=$('log');"
        "if(ROOM==null||BUSY||!box)return;BUSY=true;"
        "try{const ms=await back(ROOM,want||40);"
        "box.textContent='';"
        "if(!ms.length){const e=document.createElement('p');e.className='e';"
        "e.textContent='Nothing has been said here yet.';box.append(e)}"
        "else for(const m of ms)box.append(line(m));"
        "SEEN=ms.length?ms[ms.length-1].seq:0n;"
        "box.scrollTop=box.scrollHeight}"
        "catch(e){I.say(String(e&&e.message||e),'no')}finally{BUSY=false}};"

        /*  Polling is one call that returns two numbers. Nothing is fetched
            again until the count the contract holds has moved. */
        "const watch=()=>setInterval(async()=>{if(ROOM==null||BUSY||document.hidden)return;"
        "const r=await I.tryCall(P,S.heads+I.W(32)+I.W(1)+I.W(ROOM));if(!r)return;"
        "const o=Number(I.word(r,1))/32;const c=I.word(r,o+1);"
        "if(c>SEEN)paint()},9000);"

        /*───── saying something ─────*/
        /*  The body may pass through one transform on its way out — the
            seal, when the page carries one. The transform returns the kind
            byte with the bytes, because a sealed body that still said
            kind 0 would render as mojibake on every other screen.       */
        "let OUT=async h=>({k:0,h:h});"
        "const send=async(text)=>{"
        "if(ME==null)throw new Error('connect a wallet that holds one of these tokens');"
        "const h0=B2H(text);"
        "if(!h0.length)throw new Error('nothing to say');"
        "const o=await OUT(h0);const h=o.h;const n=h.length>>1;"
        "if(n>T.max)throw new Error('that is '+n+' bytes and the limit is '+T.max);"
        "const d=T.other!=='0'"
        "?S.whisper+I.W(ME)+I.W(T.other)+I.W(o.k)+I.W(128)+ARG(h)"
        ":S.speak+I.W(ROOM)+I.W(ME)+I.W(o.k)+I.W(128)+ARG(h);"
        "return I.send(P,d)};"

        /*───── the gate ─────*/
        "const LIS=[];const on=f=>{LIS.push(f);try{f(ME,MINE)}catch(e){}};"
        "const show=()=>{document.body.classList.toggle('held',ME!=null);"
        "document.querySelectorAll('.asme').forEach(e=>{"
        "e.textContent=ME==null?'not holding':'#'+ME});"
        "for(const f of LIS){try{f(ME,MINE)}catch(e){}}};"

        "const become=async(id)=>{ME=id==null?null:BigInt(id);"
        "if(ME!=null)put('ipse.me',ME.toString());show();"
        "if(T.other!=='0'&&ME!=null){"
        "const r=await I.call(P,S.pair+I.W(ME)+I.W(T.other));ROOM=I.word(r,0)}"
        "if(ROOM!=null)await paint()};"

        "window.PARL={out:f=>{OUT=f},me:()=>ME,on:on,repaint:()=>paint(),"
        "P:P,S:S,T:T};"
        "const boot=async()=>{"
        "const sel=$('as');"
        "if(T.other==='0')ROOM=BigInt(T.room);"
        "const p=I.pv();"
        "if(p){try{const a=await p.request({method:'eth_accounts'});"
        "if(a&&a[0])await sight(a[0])}catch(e){}}"
        "if(ME==null&&ROOM!=null)await paint();"
        "if(sel)sel.addEventListener('change',()=>become(sel.value));"
        "show()};"

        "const sight=async(a)=>{MINE=await held(a);"
        "const sel=$('as');if(sel){sel.textContent='';"
        "for(const t of MINE){const o=document.createElement('option');"
        "o.value=t.toString();o.textContent='#'+t;sel.append(o)}}"
        "if(!MINE.length){ME=null;show();return}"
        "const was=keep('ipse.me');"
        "const want=was&&MINE.some(t=>t.toString()===was)?was:MINE[0].toString();"
        "if(sel)sel.value=want;await become(want)};"

        /*  Holding nothing is not a failure, so it does not wear the
            failure colour — the sentence is the information.            */
        "const hello=async()=>{const p=await I.connect();"
        "const a=await p.request({method:'eth_accounts'});await sight(a[0]);"
        "if(!MINE.length)I.say('that wallet holds none of these tokens \\u2014 "
        "you can read everything and say nothing');else I.say('speaking as #'+ME,'ok')};"

        "return{boot:boot,hello:hello,become:become,send:send,paint:paint,watch:watch,on:on,"
        "back:back,B2H:B2H,H2B:H2B,TXT:TXT,ARG:ARG,me:()=>ME,mine:()=>MINE,"
        "room:()=>ROOM,T:T,names:NAMES}"
        "})();"

        "(()=>{const K=window.IPT;if(!K)return;const I=window.IP,$=I.$;"
        "const c=$('go');if(c)c.addEventListener('click',()=>K.hello().catch("
        "e=>I.say(String(e&&e.message||e),'no')));"
        "const b=$('send'),t=$('say');"
        "const fire=async()=>{try{const v=(t.value||'').trim();if(!v)return;"
        "await K.send(v);t.value='';setTimeout(()=>K.paint(),4000)}"
        "catch(e){I.say(String(e&&e.message||e),'no')}};"
        "if(b)b.addEventListener('click',fire);"
        "if(t)t.addEventListener('keydown',e=>{"
        "if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))fire()});"
        "K.boot().then(()=>K.watch()).catch(e=>I.say(String(e&&e.message||e),'no'))})();";

    function door() external pure returns (string memory) {
        return string.concat("<script>", DOOR_JS, "</script>");
    }

    /*═══════════════════ the door ═══════════════════*/

    string internal constant DOOR_JS =
        "(()=>{const K=window.IPT;if(!K)return;const I=window.IP,$=I.$;"
        "const box=$('yours');const stage=$('rig');"
        "K.on((me,mine)=>{if(!box)return;box.textContent='';"
        /*  Holding nothing is information, not an error: it renders in the
            page's own voice, never in refusal red. For one version it wore
            the same styling as a failed transaction, which told a curious
            visitor they had done something wrong by arriving.           */
        "if(!mine||!mine.length){const p=document.createElement('p');p.className='e';"
        "p.textContent=me===null&&!I.acct()?'Not connected yet.':"
        "'This wallet holds none of these tokens. Everything here is still readable.';"
        "box.append(p);return}"
        "for(const t of mine){const row=document.createElement('div');row.className='room';"
        "const b=document.createElement('b');b.textContent='IPSEITY #'+t;"
        "const g=document.createElement('span');"
        /*  The console first: it is the surface built to be used. The
            instrument is the artwork and stays one click away.          */
        "const k=document.createElement('a');k.className='g';k.href='/c/'+t;"
        "k.textContent='its console';"
        "const a=document.createElement('a');a.className='g';a.href='/token/'+t+'/live';"
        "a.textContent='open the instrument';"
        "const c=document.createElement('a');c.className='g';c.href='/token/'+t;"
        "c.textContent='its counter';"
        "const d=document.createElement('a');d.className='g';d.href='/dm/'+t;"
        "d.textContent='its messages';"
        "g.append(k,a,c,d);row.append(b,g);"
        /*  The instrument in a frame, on demand and never before. It is a
            21M gas eth_call to read one, and a front page that spends that
            on every visit is a front page that gets a node to stop
            answering. */
        "if(stage){const o=document.createElement('button');"
        "o.textContent='open it here';"
        "o.addEventListener('click',()=>{stage.textContent='';"
        "const f=document.createElement('iframe');f.src='/token/'+t+'/live';"
        "f.setAttribute('title','IPSEITY #'+t);"
        "f.style.aspectRatio='16/10';f.style.maxWidth='none';stage.append(f)});"
        "row.append(o)}"
        "box.append(row)}})})();";

    /*═══════════════════ the room list ═══════════════════*/

    string internal constant ROOMS_JS =
        "(()=>{const K=window.IPT;if(!K)return;const I=window.IP,$=I.$,T=K.T,S=T.sel;"
        "const box=$('rooms');"
        /*  Two dynamic arrays out of one call, decoded by hand: two offsets,
            then a length and that many words at each. */
        "const arr=(r,i)=>{const d=String(r).replace(/^0x/,'');"
        "const off=Number(BigInt('0x'+d.slice(i*64,i*64+64)))*2;"
        "const n=Number(BigInt('0x'+d.slice(off,off+64)));const out=[];"
        "for(let j=0;j<n;j++)out.push(BigInt('0x'+d.slice(off+64+j*64,off+128+j*64)));"
        "return out};"
        "const nameOf=async k=>{const r=await I.tryCall(T.at,S.state+I.W(k));"
        "if(!r)return null;const d=String(r).replace(/^0x/,'');"
        "const off=Number(BigInt('0x'+d.slice(8*64,9*64)))*2;"
        "const n=Number(BigInt('0x'+d.slice(off,off+64)));"
        "let h=d.slice(off+64,off+64+n*2);"
        "return{name:K.TXT(h),count:BigInt('0x'+d.slice(64,128)),"
        "members:BigInt('0x'+d.slice(3*64,4*64)),kind:Number(BigInt('0x'+d.slice(4*64,5*64))),"
        "index:BigInt('0x'+d.slice(7*64,8*64))}};"
        "const draw=async()=>{const me=K.me();if(!box)return;box.textContent='';"
        "if(me==null){const p=document.createElement('p');p.className='e';"
        "p.textContent='Connect a wallet holding one of these tokens to see its rooms.';"
        "box.append(p);return}"
        "const r=await I.call(T.at,S.rooms+I.W(me));"
        "const keys=arr(r,0),inIt=arr(r,1);"
        "if(!keys.length){const p=document.createElement('p');p.className='e';"
        "p.textContent='This token has not joined any group yet.';box.append(p);return}"
        "for(let i=0;i<keys.length;i++){const st=await nameOf(keys[i]);"
        "const row=document.createElement('div');row.className='room';"
        "const h=document.createElement('b');h.textContent=st?st.name:'room';"
        "const s=document.createElement('span');s.className='at';"
        "s.textContent=(st?st.count:0n)+' messages \\u00b7 '+(st?st.members:0n)+' members'"
        "+(inIt[i]?'':' \\u00b7 left');"
        "row.append(h,s);row.tabIndex=0;"
        "row.addEventListener('click',()=>{location.href='/room/'+(st?st.index:0n)});"
        "box.append(row)}};"
        "const f=$('found');"
        "if(f)f.addEventListener('click',async()=>{try{"
        "const me=K.me();if(me==null)throw new Error('connect a wallet that holds a token');"
        "const nm=($('rname')||{}).value||'';const h=K.B2H(nm.trim());"
        "if(!h)throw new Error('give the room a name');"
        "const open=!!(($('ropen')||{}).checked);"
        "await I.send(T.at,S.found+I.W(me)+I.W(96)+I.W(open?1:0)+K.ARG(h))}"
        "catch(e){I.say(String(e&&e.message||e),'no')}});"
        /*  The three things a member does to a room. Each is one call with
            the room this page is about and the token the wallet is speaking
            as - which is why they are wired here rather than through the
            generic data-call handler, whose arguments come out of input
            boxes and cannot know which token you are. */
        "const act=(el,sel,extra)=>{const b=$(el);if(!b)return;"
        "b.addEventListener('click',async()=>{try{"
        "const me=K.me();if(me==null)throw new Error('connect a wallet that holds a token');"
        "let d=sel+I.W(T.room)+I.W(me);"
        "if(extra){const v=($(extra)||{}).value;"
        "if(!v)throw new Error('which token?');d=sel+I.W(T.room)+I.W(me)+I.W(v)}"
        "await I.send(T.at,d)}catch(e){I.say(String(e&&e.message||e),'no')}})};"
        "act('join',S.join);act('leave',S.leave);act('invite',S.invite,'who');"

        /*  The roster. Two hundred and fifty-six memberships arrive as one
            word from one call, so a collection of a few thousand is a
            handful of reads and no indexer at all. Each member is drawn
            with the door beside it; pressing it is `evict`, which the
            contract refuses for everyone but the steward, so the button is
            offered to everyone and answered for by the chain.          */
        "const roster=async()=>{const box=$('roster');if(!box||!T.roster)return;"
        "const me=K.me();"
        "let mem=[],pend=[];"
        "for(let base=1;base<4096;base+=256){"
        "const r=await I.tryCall(T.roster,S.inWin+I.W(T.room)+I.W(base));"
        "if(!r)break;const bits=I.word(r,0);"
        "const p=await I.tryCall(T.roster,S.invWin+I.W(T.room)+I.W(base));"
        "const pbits=p?I.word(p,0):0n;"
        "for(let i=0;i<256;i++){"
        "if((bits>>BigInt(i))&1n)mem.push(base+i);"
        "if((pbits>>BigInt(i))&1n)pend.push(base+i)}"
        "if(bits===0n&&pbits===0n&&base>1)break}"
        "if(!mem.length){box.textContent='nobody has walked in yet';return}"
        "box.innerHTML='';"

        /*  The commons is not a room anyone joined, so it is not a room
            anyone can be shown out of — `evict` wants a group and the chain
            refuses it here. A button that is always refused is worse than
            no button, so the commons gets the list without the doors.  */
        "const all=Number(T.room)===0;"
        "for(const id of mem){"
        "const row=document.createElement('div');"
        "const who=document.createElement('span');"
        "who.textContent='#'+id+(id===Number(T.steward||0)?' \\u00b7 steward':'');"
        "const b=document.createElement('b');"
        "if(!all){"
        "const out=document.createElement('button');"
        "out.textContent='show out';out.className='mx';out.dataset.id=String(id);"
        "out.addEventListener('click',async()=>{try{"
        "const m=K.me();if(m==null)throw new Error('connect a wallet that holds a token');"
        "await I.send(T.at,S.evict+I.W(T.room)+I.W(m)+I.W(id));"
        "setTimeout(roster,1200)}catch(e){I.say(String(e&&e.message||e),'no')}});"
        "b.appendChild(out)}"
        "row.appendChild(who);row.appendChild(b);box.appendChild(row)}"
        "const pe=$('pend');"
        "if(pe)pe.textContent=all?"
        "'the commons is every token in the collection \\u2014 nobody joins it, and nobody can be shown out of it':"
        "(pend.length?('invited, not yet in: '+pend.map(x=>'#'+x).join(' ')):'');"
        "};"
        "if($('roster'))setTimeout(()=>roster().catch(e=>{}),700);"
        "if(box)setTimeout(()=>draw().catch(e=>I.say(String(e&&e.message||e),'no')),600);"
        "const g=$('again');if(g)g.addEventListener('click',()=>draw())})();";
}
