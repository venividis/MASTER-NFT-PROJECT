// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";

/*═══════════════════════════════════════════════════════════════════════════

  THE TERMINAL DESK — one line of text, the whole estate

  Every page on this site is a form in front of a handful of functions. The
  terminal is the opposite bargain: no forms, every function. A person
  types `open 3` or `say hello`; an agent calls `TERM.run("open 3")` and
  reads the string that comes back; both are the same code path, because a
  surface that is different for machines is a surface with two sets of
  bugs.

  The rules the rest of the site lives by hold here with no exceptions:
  every selector arrives from this contract, derived from its signature —
  the client hashes nothing; every string that reaches the screen goes
  through textContent; amounts are BigInt end to end; and a command the
  parser does not know is an error message, never a guess.

  `TERM.commands()` returns the whole command table as data — usage, what
  it does, whether it writes — which is the machine-readable half of the
  same coin. An LLM driving this page needs no scraping: ask the terminal
  what it can do, then do it.

═══════════════════════════════════════════════════════════════════════════*/
contract DeskTerm {
    using LibNum for uint256;

    address public immutable HUB;
    address public immutable POOL;
    address public immutable LEASE;
    address public immutable PARLEY;
    address public immutable KILN;
    address public immutable LOCKER;
    address public immutable ROSTER;

    constructor(address hub, address pool, address lease, address parley,
                address kiln, address locker, address roster) {
        HUB = hub; POOL = pool; LEASE = lease;
        PARLEY = parley; KILN = kiln; LOCKER = locker; ROSTER = roster;
    }

    /*═══════════════════ the data the terminal runs on ═══════════════════*/

    function config() external view returns (string memory) {
        return string.concat(
            "<script type=\"application/json\" id=\"X\">{",
            "\"hub\":\"", LibNum.hexAddr(HUB),
            "\",\"pool\":\"", LibNum.hexAddr(POOL),
            "\",\"lease\":\"", LibNum.hexAddr(LEASE),
            "\",\"parley\":\"", LibNum.hexAddr(PARLEY),
            "\",\"kiln\":\"", LibNum.hexAddr(KILN),
            "\",\"locker\":\"", LibNum.hexAddr(LOCKER),
            "\",\"roster\":\"", LibNum.hexAddr(ROSTER),
            "\",\"sel\":{", _sel1(), _sel2(), "}}</script>"
        );
    }

    function _sel1() private pure returns (string memory) {
        return string.concat(
            "\"mint\":\"",      _s("mint()"),
            "\",\"price\":\"",  _s("price()"),
            "\",\"openFee\":\"",_s("openFee()"),
            "\",\"supply\":\"", _s("totalSupply()"),
            "\",\"bal\":\"",    _s("balanceOf(address)"),
            "\",\"at\":\"",     _s("tokenOfOwnerByIndex(address,uint256)"),
            "\",\"owner\":\"",  _s("ownerOf(uint256)"),
            "\",\"commit\":\"", _s("commit(uint256,uint256)"),
            "\",\"section\":\"",_s("sectionOf(uint256)"),
            "\",\"stats\":\"",  _s("statsOf(uint256)"),
            "\",\"openN\":\"",  _s("openNode(uint256,uint8)"),
            "\",\"lock\":\"",   _s("lock(uint256)"),
            "\",\"unlock\":\"", _s("unlock(uint256)"),
            "\",\"pin\":\"",    _s("pinTokenURI(uint256,uint256)"),
            "\",\"unpin\":\"",  _s("unpinTokenURI(uint256)"),
            "\",\"trait\":\"",  _s("setTrait(uint256,bytes32,bytes32)"),
            "\",\"embody\":\"", _s("embody(uint256)"),
            "\",\"egrip\":\"",  _s("embodyGrip(uint256)"),
            "\",\"acct\":\"",   _s("account(uint256)"),
            "\",\"grip\":\"",   _s("grip(uint256)"),
            "\",\"agent\":\"",  _s("setLeaseAgent(uint256,address)"),
            "\",\"approve\":\"",_s("approve(address,uint256)"), "\","
        );
    }

    function _sel2() private pure returns (string memory) {
        return string.concat(
            "\"mopen\":\"",     _s("openMarket(uint256,address,address,uint16)"),
            "\",\"mdep\":\"",   _s("deposit(uint256,uint256,uint256)"),
            "\",\"mwd\":\"",    _s("withdraw(uint256,uint256,uint256,address)"),
            "\",\"mquote\":\"", _s("quote(uint256,bool,uint256)"),
            "\",\"mswap\":\"",  _s("swap(uint256,bool,uint256,uint256,address,uint256)"),
            "\",\"mfee\":\"",   _s("setFee(uint256,uint16)"),
            "\",\"mkt\":\"",    _s("market(uint256)"),
            "\",\"llist\":\"",  _s("list(uint256,uint128,uint32,uint32)"),
            "\",\"lrent\":\"",  _s("rent(uint256,uint32,uint128)"),
            "\",\"lcost\":\"",  _s("cost(uint256,uint32)"),
            "\",\"lend\":\"",   _s("endLease(uint256)"),
            "\",\"ldrop\":\"",  _s("delist(uint256)"),
            "\",\"lget\":\"",   _s("collect(uint256,address)"),
            "\",\"lclaim\":\"", _s("claim()"),
            "\",\"speak\":\"",  _s("speak(uint256,uint256,uint8,bytes)"),
            "\",\"whisper\":\"",_s("whisper(uint256,uint256,uint8,bytes)"),
            "\",\"found\":\"",  _s("found(uint256,string,bool)"),
            "\",\"join\":\"",   _s("join(uint256,uint256)"),
            "\",\"leave\":\"",  _s("leave(uint256,uint256)"),
            "\",\"gkey\":\"",   _s("groupKey(uint256)"),
            "\",\"invite\":\"", _s("invite(uint256,uint256,uint256)"),
            "\",\"evict\":\"",  _s("evict(uint256,uint256,uint256)"),
            "\",\"inWin\":\"",  _s("inWindow(uint256,uint256)"),
            "\",\"launch\":\"",_s("launch(uint256,string,string,uint8,uint256,bytes32)"),
            "\",\"recent\":\"", _s("recent(uint256,uint256)"),
            "\",\"vlock\":\"",  _s("lock(address,uint256,uint64)"),
            "\",\"vof\":\"",    _s("locksOf(address)"),
            "\",\"vat\":\"",    _s("lockAt(uint256)"),
            "\",\"vclaim\":\"", _s("claim(uint256)"),
            "\",\"vext\":\"",   _s("extend(uint256,uint64)"),
            "\",\"vgive\":\"",  _s("give(uint256,address)"),
            "\",\"allow\":\"",  _s("allowance(address,address)"), "\""
        );
    }

    function _s(string memory sig) private pure returns (string memory) {
        bytes32 h = keccak256(bytes(sig));
        bytes memory o = new bytes(10);
        o[0] = "0"; o[1] = "x";
        bytes16 hx = "0123456789abcdef";
        for (uint256 i; i < 4; ++i) {
            o[2 + i * 2] = hx[uint8(h[i]) >> 4];
            o[3 + i * 2] = hx[uint8(h[i]) & 15];
        }
        return string(o);
    }

    function core() external pure returns (string memory) {
        return string.concat("<script>", TERM_JS, "</script>");
    }

    /*═══════════════════ the terminal itself ═══════════════════*/

    string internal constant TERM_JS =
        "window.TERM=(()=>{"
        "const I=window.IP,$=I.$;"
        "const X=JSON.parse(document.getElementById('X').textContent);const S=X.sel;"
        "const OUT=$('tout'),IN=$('tin');"
        "let ME=null,HIST=[],HI=0;"

        /*───── printing: text only, ever ─────*/
        "const put=(t,c)=>{const d=document.createElement('div');"
        "d.className='tl'+(c?' '+c:'');d.textContent=t;"
        "if(OUT){OUT.append(d);OUT.scrollTop=OUT.scrollHeight}return t};"

        /*───── bytes, strings, and the two-pass dynamic encoder ─────*/
        "const H=s=>{let o='';for(const b of new TextEncoder().encode(s))"
        "o+=b.toString(16).padStart(2,'0');return o};"
        "const PADB=h=>{const n=h.length/2;"
        "return I.W(n)+h+'0'.repeat(((32-(n%32))%32)*2)};"
        /*  Parts in PARAMETER order — {w: word} for a static, {d: hex} for
            a dynamic — because Solidity interleaves them and the offsets
            follow the signature, not a tidy fixed-then-dynamic story. All
            offsets are computed before anything is written: an offset
            written while the tail is still growing is a lie.             */
        "const ENC=(sel,parts)=>{const base=parts.length*32;"
        "let run=base;const offs=parts.map(p=>{if(p.d===undefined)return null;"
        "const o=run;run+=32+Math.ceil(p.d.length/64)*32;return o});"
        "let head='',tail='';"
        "parts.forEach((p,i)=>{if(p.d===undefined)head+=p.w;"
        "else{head+=I.W(offs[i]);tail+=PADB(p.d)}});"
        "return sel+head+tail};"

        /*───── who is speaking ─────*/
        "const mine=async()=>{const a=I.acct();if(!a)return[];"
        "const n=Number(I.word(await I.call(X.hub,S.bal+I.AD(a)),0));const out=[];"
        "for(let i=0;i<n&&i<64;i++){const r=await I.tryCall(X.hub,S.at+I.AD(a)+I.W(i));"
        "if(r)out.push(I.word(r,0))}return out};"
        "const need=async()=>{if(!I.acct())await I.connect();"
        "if(ME==null){const m=await mine();if(!m.length)"
        "throw new Error('this wallet holds none of these tokens');"
        "ME=m[0]}return ME};"

        /*───── the table. Every entry is data first, code second. ─────*/
        "const eth=v=>I.parse(v,18);"
        "const C={};"
        "const def=(k,u,w,x,f)=>{C[k]={usage:u,what:x,writes:w,run:f}};"

        "def('help','help','','list every command',async()=>"
        "Object.values(C).map(c=>c.usage.padEnd(34)+' '+c.what).join('\\n'));"
        "def('me','me',0,'wallet, tokens held, active token',async()=>{"
        "if(!I.acct())await I.connect();const m=await mine();"
        "return'wallet '+I.acct()+'\\nholds  '+(m.map(t=>'#'+t).join(' ')||'nothing')+"
        "'\\nactive '+(ME!=null?'#'+ME:'none \u2014 use <id>')});"
        "def('use','use <id>',0,'act as one of your tokens',async(a)=>{"
        "const m=await(I.acct()?mine():(await I.connect(),mine()));"
        "const id=BigInt(a[0]);if(!m.some(t=>t===id))return'not yours: #'+id;"
        "ME=id;return'acting as #'+id});"
        "def('mint','mint',1,'mint a token at the current price',async()=>{"
        "const p=I.word(await I.call(X.hub,S.price),0);"
        "await I.send(X.hub,S.mint,p);return'minted at '+I.fmt(p,18,6)+' ETH'});"
        "def('state','state [id]',0,'a token\\u2019s word and stats',async(a)=>{"
        "const id=a[0]?BigInt(a[0]):await need();"
        "const w=I.word(await I.call(X.hub,S.section+I.W(id)),0);"
        "const st=await I.call(X.hub,S.stats+I.W(id));"
        "return'#'+id+'  word 0x'+w.toString(16).padStart(32,'0')+"
        "'\\nform '+((w>>112n)&0xffn)+'  hue '+((w>>120n)&0xffn)+"
        "'\\nops '+I.word(st,0)+'  xfers '+I.word(st,1)+'  strata '+I.word(st,2)+"
        "'  open 0x'+I.word(st,3).toString(16)});"
        "def('turn','turn <word-hex>',1,'commit a full 128-bit orientation',async(a)=>{"
        "const id=await need();await I.send(X.hub,S.commit+I.W(id)+I.W(BigInt(a[0])));"
        "return'committed'});"
        "def('hue','hue <0-255>',1,'set the one settable trait',async(a)=>{"
        "const id=await need();await I.send(X.hub,"
        "S.trait+I.W(id)+H('hue').padEnd(64,'0')+I.W(a[0]));return'hue '+a[0]});"
        "def('open','open <node 0-11>',1,'unseal an instrument, for good',async(a)=>{"
        "const id=await need();const f=I.word(await I.call(X.hub,S.openFee),0);"
        "await I.send(X.hub,S.openN+I.W(id)+I.W(a[0]),f);return'node '+a[0]+' open forever'});"
        "def('lock','lock',1,'soulbind the active token',async()=>{"
        "const id=await need();await I.send(X.hub,S.lock+I.W(id));return'locked'});"
        "def('unlock','unlock',1,'release the soulbind',async()=>{"
        "const id=await need();await I.send(X.hub,S.unlock+I.W(id));return'unlocked'});"
        "def('pin','pin <face 0-2>',1,'pin an ERC-7160 face',async(a)=>{"
        "const id=await need();await I.send(X.hub,S.pin+I.W(id)+I.W(a[0]));return'pinned'});"
        "def('unpin','unpin',1,'back to the default face',async()=>{"
        "const id=await need();await I.send(X.hub,S.unpin+I.W(id));return'unpinned'});"
        "def('embody','embody',1,'create the token\\u2019s Reach',async()=>{"
        "const id=await need();await I.send(X.hub,S.embody+I.W(id));"
        "return'reach '+'0x'+I.word(await I.call(X.hub,S.acct+I.W(id)),0).toString(16).padStart(40,'0')});"
        "def('grip','grip',1,'create the hand that only receives',async()=>{"
        "const id=await need();await I.send(X.hub,S.egrip+I.W(id));"
        "return'grip '+'0x'+I.word(await I.call(X.hub,S.grip+I.W(id)),0).toString(16).padStart(40,'0')});"
        "def('give','give <id> <eth>',1,'pay into a token\\u2019s grip',async(a)=>{"
        "const g='0x'+I.word(await I.call(X.hub,S.grip+I.W(a[0])),0).toString(16).padStart(40,'0');"
        "if(/^0x0+$/.test(g))return'#'+a[0]+' has no grip yet';"
        "await I.send(g,'0x',eth(a[1]));return a[1]+' ETH \\u2192 '+g});"

        "def('say','say <text>',1,'speak in the commons',async(a)=>{"
        "const id=await need();"
        "await I.send(X.parley,ENC(S.speak,[{w:I.W(0)},{w:I.W(id)},{w:I.W(0)},{d:H(a.join(' '))}]));"
        "return'said, as #'+id});"
        "def('dm','dm <id> <text>',1,'whisper to one token',async(a)=>{"
        "const id=await need();const to=a.shift();"
        "await I.send(X.parley,ENC(S.whisper,[{w:I.W(id)},{w:I.W(to)},{w:I.W(0)},{d:H(a.join(' '))}]));"
        "return'whispered to #'+to});"
        "def('room','room new <name>|join <n>|leave <n>|say <n> <text>',1,"
        "'found, join, leave, speak',async(a)=>{const id=await need();const op=a.shift();"
        "if(op==='new'){await I.send(X.parley,"
        "ENC(S.found,[{w:I.W(id)},{d:H(a.join(' '))},{w:I.W(1)}]));return'founded, open door'}"
        "const n=a.shift();"
        "const key=I.word(await I.call(X.parley,S.gkey+I.W(n)),0);"
        "if(op==='join'){await I.send(X.parley,S.join+I.W(key)+I.W(id));return'joined room '+n}"
        "if(op==='leave'){await I.send(X.parley,S.leave+I.W(key)+I.W(id));return'left room '+n}"
        "if(op==='say'){await I.send(X.parley,"
        "ENC(S.speak,[{w:I.W(key)},{w:I.W(id)},{w:I.W(0)},{d:H(a.join(' '))}]));return'said in room '+n}"
        "return'room: new, join, leave or say'});"

        "def('rent','rent list <eth/day> <min> <max>|take <id> <days>|end|stop',1,"
        "'the lease desk, both sides',async(a)=>{const op=a.shift();"
        "if(op==='list'){const id=await need();"
        "await I.send(X.hub,S.agent+I.W(id)+I.AD(X.lease));"
        "await I.send(X.lease,S.llist+I.W(id)+I.W(eth(a[0]))+I.W(a[1])+I.W(a[2]));"
        "return'listed #'+id+' at '+a[0]+' ETH/day, '+a[1]+'\\u2013'+a[2]+' days'}"
        "if(op==='take'){const id=a[0],d=a[1];"
        "const c=I.word(await I.call(X.lease,S.lcost+I.W(id)+I.W(d)),0);"
        "await I.send(X.lease,S.lrent+I.W(id)+I.W(d)+I.W((c/BigInt(d))),c);"
        "return'rented #'+id+' for '+d+' day(s), '+I.fmt(c,18,6)+' ETH'}"
        "if(op==='end'){const id=await need();await I.send(X.lease,S.lend+I.W(id));return'ended'}"
        "if(op==='stop'){const id=await need();await I.send(X.lease,S.ldrop+I.W(id));return'delisted'}"
        "return'rent: list, take, end or stop'});"

        "def('market','market open <base> <quote> <bps>|quote <id> <amt>|"
        "swap <id> <amt> [minOut]|fee <bps>',1,'the token\\u2019s own exchange',async(a)=>{"
        "const op=a.shift();"
        "if(op==='open'){const id=await need();"
        "await I.send(X.pool,S.mopen+I.W(id)+I.AD(a[0])+I.AD(a[1])+I.W(a[2]));"
        "return'market open on #'+id+' \\u2014 approve and deposit next'}"
        "if(op==='quote'){const r=await I.call(X.pool,"
        "S.mquote+I.W(a[0])+I.W(1)+I.W(BigInt(a[1])));"
        "return'quote: '+I.word(r,0)+' base units out'}"
        "if(op==='swap'){const q=I.word(await I.call(X.pool,"
        "S.mquote+I.W(a[0])+I.W(1)+I.W(BigInt(a[1]))),0);"
        "const min=a[2]?BigInt(a[2]):q;"
        "await I.send(X.pool,S.mswap+I.W(a[0])+I.W(1)+I.W(BigInt(a[1]))+I.W(min)+"
        "I.AD(I.acct())+I.W(BigInt(Math.floor(Date.now()/1e3)+1800)));"
        "return'swapped, floor '+min}"
        "if(op==='fee'){const id=await need();"
        "await I.send(X.pool,S.mfee+I.W(id)+I.W(a[0]));return'fee '+a[0]+' bps'}"
        "return'market: open, quote, swap or fee'});"
        "def('approve','approve <token> <amt|max>',1,'let the pool move an ERC-20',async(a)=>{"
        "const v=a[1]==='max'?(1n<<255n):BigInt(a[1]);"
        "await I.send(a[0],S.approve+I.AD(X.pool)+I.W(v));return'approved'});"
        "def('deposit','deposit <baseAmt> <quoteAmt>',1,'stock the active market',async(a)=>{"
        "const id=await need();"
        "await I.send(X.pool,S.mdep+I.W(id)+I.W(BigInt(a[0]))+I.W(BigInt(a[1])));"
        "return'deposited'});"

        "def('launch','launch <name> <sym> <supplyBaseUnits>',1,"
        "'fire a fixed-supply token through the kiln, signed by your active token',async(a)=>{"
        "const id=await need();const[nm,sy,su]=a;"
        "await I.send(X.kiln,ENC(S.launch,[{w:I.W(id)},{d:H(nm)},{d:H(sy)},"
        "{w:I.W(18)},{w:I.W(BigInt(su))},{w:I.W(1)}]));"
        "return'launched \u2014 open /launch for the address, the hook and the pool'});"
        "def('launched','launched',0,'the latest launches',async()=>{"
        "const r=await I.call(X.kiln,S.recent+I.W(0)+I.W(8));"
        "const d=String(r).slice(2);const n=Number(BigInt('0x'+d.slice(64,128)));"
        "let o=n+' launch(es)';for(let i=0;i<n;i++){"
        "o+='\\n0x'+d.slice(128+i*64+24,192+i*64)}return o||'none yet'});"
        "def('lockup','lockup <token> <amtBaseUnits> <days>',1,"
        "'lock an ERC-20 in the vault \u2014 up to ten years, no early exit',async(a)=>{"
        "const[t,amt,dy]=a;const v=BigInt(amt);const d=Number(dy);"
        "if(!(d>=1&&d<=3650))return'one day to ten years';"
        "const al=await I.call(t,S.allow+I.AD(I.acct())+I.AD(X.locker));"
        "if(BigInt(al)<v){await I.send(t,S.approve+I.AD(X.locker)+I.W(v))}"
        "const until=BigInt(Math.floor(Date.now()/1000)+d*86400);"
        "await I.send(X.locker,S.vlock+I.AD(t)+I.W(v)+I.W(until));"
        "return'locked until '+new Date(Number(until)*1000).toISOString().slice(0,10)});"
        "def('lockups','lockups',1,'your locks, straight off the vault',async()=>{"
        "const r=await I.call(X.locker,S.vof+I.AD(I.acct()));"
        "const n=Number(I.word(r,1));if(!n)return'nothing locked';"
        "let o=n+' lock(s)';const now=Date.now()/1000;"
        "for(let i=0;i<n&&i<12;i++){const id=I.word(r,2+i);"
        "const L=await I.call(X.locker,S.vat+I.W(id));"
        "const until=Number(I.word(L,3)),tk=I.word(L,4)===1n;"
        "o+='\\n#'+id+' \u00b7 '+I.word(L,2)+' of 0x'+String(L).slice(26,66)"
        "+(tk?' \u00b7 claimed':now>=until?' \u00b7 claimable \u2014 redeem '+id"
        "  :' \u00b7 '+Math.ceil((until-now)/86400)+'d left')}return o});"
        "def('redeem','redeem <id>',1,'claim a matured lock',async(a)=>{"
        "await I.send(X.locker,S.vclaim+I.W(BigInt(a[0])));return'claimed'});"
        "def('go','go <place>',0,'walk to a surface \u2014 terminal, swap, launch, "
        "lock, social, market, archive, manifest, door',async(a)=>{"
        "const M={door:'/',terminal:'/terminal',swap:'/swap',launch:'/launch',"
        "lock:'/lock',social:'/chat',chat:'/chat',market:'/gallery',gallery:'/gallery',"
        "archive:'/open',open:'/open',projector:'/projector',name:'/name',ens:'/name',keys:'/keys',session:'/keys',seal:'/seal',manifest:'/services.json',json:'/services.json'};"
        "const t=M[String(a[0]||'').toLowerCase()];"
        "if(!t)return'go where? '+Object.keys(M).join(' \u00b7 ');"
        "location.href=t;return'\u2192 '+t});"
        "def('lockgive','lockgive <id> <to>',1,"
        "'hand a lock to another address \u2014 a token\u2019s account, to travel with it',async(a)=>{"
        "await I.send(X.locker,S.vgive+I.W(BigInt(a[0]))+I.AD(a[1]));return'given'});"
        "def('extend','extend <id> <days>',1,'push a lock further out \u2014 never nearer',async(a)=>{"
        "const until=BigInt(Math.floor(Date.now()/1000)+Number(a[1])*86400);"
        "await I.send(X.locker,S.vext+I.W(BigInt(a[0]))+I.W(until));"
        "return'extended'});"
        "def('balance','balance',0,'the connected wallet\\u2019s ether',async()=>{"
        "const p=I.pv();const b=await p.request({method:'eth_getBalance',"
        "params:[I.acct(),'latest']});return I.fmt(BigInt(b),18,6)+' ETH'});"

        /*───── run: one line in, one string out — human and agent alike ─────*/
        "const run=async line=>{line=String(line||'').trim();if(!line)return'';"
        "const a=line.split(/\\s+/);const k=a.shift().toLowerCase();"
        "const c=C[k];if(!c)return put('unknown: '+k+' \\u2014 try help','no');"
        "put('\\u203a '+line,'in');"
        "try{const r=await c.run(a);return put(String(r),'ok')}"
        "catch(e){return put(String(e&&e.message||e),'no')}};"

        "if(IN){IN.addEventListener('keydown',e=>{"
        "if(e.key==='Enter'){HIST.push(IN.value);HI=HIST.length;run(IN.value);IN.value=''}"
        "if(e.key==='ArrowUp'&&HI>0){IN.value=HIST[--HI];e.preventDefault()}"
        "if(e.key==='ArrowDown'){IN.value=HIST[Math.min(++HI,HIST.length-1)]||'';}"
        "});IN.focus()}"
        "put('IPSEITY terminal \\u2014 type help. Writes need a wallet holding a token.');"

        /*  A door for words this contract has no room for. DeskTerm is
            already at the byte ceiling, so the commands that arrived last
            live in their own contract and register through here — the same
            answer the wallet client got when Desk filled up. One table,
            one code path, still: `def` is the same function the built-in
            words were defined with.                                     */
        "return{def:def,run:run,commands:()=>Object.entries(C).map(([k,c])=>"
        "({cmd:k,usage:c.usage,what:c.what,writes:!!c.writes})),"
        "me:()=>ME,use:id=>{ME=BigInt(id)}}"
        "})();";
}
