// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {Web} from "./lib/Web.sol";
import {IHub, IPoolRead, ILeaseRead, MarketView} from "./interfaces/Site.sol";

/*───────────────────────────────────────────────────────────────────────────
  Desk — the application, held as contract code

  The pages before this were honest and unusable. "Approve the pool first"
  was a sentence rather than a button. "Amounts are integers in the token's
  own smallest unit" asked a visitor to type 1500000000000000000 and to know
  that the number of zeroes depends on which token they picked. The floor a
  trade would accept had to be worked out by hand, in the same units, before
  the quote was known. Every one of those is a contract detail that a person
  should never have been shown.

  So this is the counter as an actual counter: type an amount, see what comes
  back, press the button the situation calls for. It is the same shape every
  exchange on the web has settled on, for the same reason.

  ── what is still not shipped to the browser ──

  No ABI coder and no keccak-256. Every selector this app needs is computed
  on chain by the contract that generates the page and arrives in a JSON
  block beside it, so the client's whole encoding job is padding a number to
  thirty-two bytes. That is the same argument the rest of the collection
  makes and it survives the app being bigger: a client that computes less is
  a client that can be wrong about less, and a visitor can read the selectors
  in the page source and check them against the ABI.

  No floating point, either. Every amount is parsed from decimal text into a
  BigInt of base units and formatted back the same way. A front end that
  multiplies a token balance by 1e18 in a double has already lost the last
  three digits of an eighteen-decimal balance, and the number it then sends
  is not the number the person read.

  ── the config block ──

  The page emits `<script type="application/json" id="D">` carrying the
  addresses, decimals, symbols, live reserves and selectors. It is written
  with the JSON escaper, so a token whose symbol is `</script>` cannot end
  the block — that is exactly why `jsonEsc` escapes `<` and `>` rather than
  only the two characters JSON requires.
───────────────────────────────────────────────────────────────────────────*/
contract Desk {
    using LibNum for uint256;

    IHub       public immutable HUB;
    IPoolRead  public immutable POOL;
    ILeaseRead public immutable LEASE;

    constructor(IHub hub, IPoolRead pool, ILeaseRead lease) {
        HUB = hub;
        POOL = pool;
        LEASE = lease;
    }

    /*═══════════════════ the data the app runs on ═══════════════════*/

    /// @notice Everything the client needs, in one JSON block the page
    ///         carries: addresses, decimals, symbols, live prices, and a
    ///         selector for every call it can make.
    /// @dev    Written with the JSON escaper, so a token whose symbol is
    ///         `</script>` cannot end the block. That is exactly why
    ///         `jsonEsc` escapes `<` and `>` as well as the two characters
    ///         JSON itself requires.
    function config(uint256 id) external view returns (string memory) {
        MarketView memory m;
        (
            m.base, m.quote, m.rBase, m.rQuote, m.feeBps, m.open,
            m.conc, m.spot, m.maxBaseOut, m.maxQuoteOut, m.trades, m.bondUntil
        ) = POOL.market(id);
        m.dBase = Web.decimalsOf(m.base);
        m.dQuote = Web.decimalsOf(m.quote);

        return string.concat(
            "<script type=\"application/json\" id=\"D\">{",
            "\"chain\":", block.chainid.str(),
            ",\"id\":", id.str(),
            ",\"hub\":\"", LibNum.hexAddr(address(HUB)),
            "\",\"pool\":\"", LibNum.hexAddr(address(POOL)),
            "\",\"open\":", m.open ? "true" : "false",
            ",\"fee\":", uint256(m.feeBps).str(),
            ",\"feeCap\":500",
            ",\"spot\":\"", m.spot.str(),
            "\",\"maxBaseOut\":\"", m.maxBaseOut.str(),
            "\",\"maxQuoteOut\":\"", m.maxQuoteOut.str(),
            "\",\"rBase\":\"", uint256(m.rBase).str(),
            "\",\"rQuote\":\"", uint256(m.rQuote).str(),
            "\",\"base\":", _asset(m.base, m.dBase),
            ",\"quote\":", _asset(m.quote, m.dQuote),
            ",\"sel\":", selectors(),
            ",\"lease\":", _lease(id),
            "}</script>"
        );
    }

    /// @notice The same block, for the pages that are about the collection
    ///         rather than about one token's market. The client only ever
    ///         needs the chain it is on and the addresses it may call; a
    ///         page with no market on it should not be reading one.
    function bare() external view returns (string memory) {
        return string.concat(
            "<script type=\"application/json\" id=\"D\">{",
            "\"chain\":", block.chainid.str(),
            ",\"id\":0",
            ",\"hub\":\"", LibNum.hexAddr(address(HUB)),
            "\",\"pool\":\"", LibNum.hexAddr(address(POOL)),
            "\",\"sel\":", selectors(),
            "}</script>"
        );
    }

    function _asset(address t, uint8 d) private view returns (string memory) {
        return string.concat(
            "{\"a\":\"", LibNum.hexAddr(t),
            "\",\"s\":\"", t == address(0) ? "?" : Web.symbolOfJson(t),
            "\",\"d\":", uint256(d).str(), "}"
        );
    }

    function _lease(uint256 id) private view returns (string memory) {
        if (address(LEASE) == address(0)) return "null";
        (bool ok, uint8 why, uint128 perDay, uint32 minD, uint32 maxD,
         address renter, uint64 until, uint256 vested,) = LEASE.listing(id);
        return string.concat(
            "{\"a\":\"", LibNum.hexAddr(address(LEASE)),
            "\",\"open\":", ok ? "true" : "false",
            ",\"why\":", uint256(why).str(),
            ",\"perDay\":\"", uint256(perDay).str(),
            "\",\"min\":", uint256(minD == 0 ? 1 : minD).str(),
            ",\"max\":", uint256(maxD == 0 ? 30 : maxD).str(),
            ",\"renter\":\"", LibNum.hexAddr(renter),
            "\",\"until\":", uint256(until).str(),
            ",\"vested\":\"", vested.str(),
            "\",\"sel\":", leaseSelectors(), "}"
        );
    }

    /*  Every selector the app can send, computed here so the browser never
        needs a keccak. A reader can check any of them against the ABI by
        hand, which is the point: the encoding a page asks a wallet to sign
        is legible in the page.                                          */
    function selectors() public pure returns (string memory) {
        return string.concat(
            "{\"quote\":\"", _sel("quote(uint256,bool,uint256)"),
            "\",\"swap\":\"", _sel("swap(uint256,bool,uint256,uint256,address,uint256)"),
            "\",\"approve\":\"", _sel("approve(address,uint256)"),
            "\",\"allowance\":\"", _sel("allowance(address,address)"),
            "\",\"balanceOf\":\"", _sel("balanceOf(address)"),
            "\",\"deposit\":\"", _sel("deposit(uint256,uint256,uint256)"),
            "\",\"withdraw\":\"", _sel("withdraw(uint256,uint256,uint256,address)"),
            "\",\"setFee\":\"", _sel("setFee(uint256,uint16)"),
            "\",\"bond\":\"", _sel("bond(uint256,uint64)"),
            "\",\"syncCurve\":\"", _sel("syncCurve(uint256)"),
            "\",\"openMarket\":\"", _sel("openMarket(uint256,address,address,uint16)"),
            "\",\"closeMarket\":\"", _sel("closeMarket(uint256)"), "\"}"
        );
    }

    function leaseSelectors() public pure returns (string memory) {
        return string.concat(
            "{\"rent\":\"", _sel("rent(uint256,uint32,uint128)"),
            "\",\"list\":\"", _sel("list(uint256,uint128,uint32,uint32)"),
            "\",\"delist\":\"", _sel("delist(uint256)"),
            "\",\"collect\":\"", _sel("collect(uint256,address)"),
            "\",\"endLease\":\"", _sel("endLease(uint256)"),
            "\",\"settle\":\"", _sel("settle(uint256)"),
            "\",\"claim\":\"", _sel("claim()"),
            "\",\"agent\":\"", _sel("setLeaseAgent(uint256,address)"), "\"}"
        );
    }

    function _sel(string memory sig) private pure returns (string memory) {
        bytes4 x = bytes4(keccak256(bytes(sig)));
        bytes memory hexd = "0123456789abcdef";
        bytes memory o = new bytes(10);
        o[0] = "0"; o[1] = "x";
        for (uint256 i; i < 4; ++i) {
            o[2 + i * 2] = hexd[uint8(x[i]) >> 4];
            o[3 + i * 2] = hexd[uint8(x[i]) & 0x0f];
        }
        return string(o);
    }

    /// @notice Everything shared: the wallet, the number formatting, the
    ///         call helpers, and the plain `data-call` buttons the simpler
    ///         pages still use.
    function core() external pure returns (string memory) {
        return string.concat("<script>", CORE_JS, "</script>");
    }

    /// @notice The swap card.
    function swap() external pure returns (string memory) {
        return string.concat("<script>", SWAP_JS, "</script>");
    }

    /// @notice Adding and removing the holder's inventory, and the terms.
    function pool() external pure returns (string memory) {
        return string.concat("<script>", POOL_JS, "</script>");
    }

    /// @notice Renting, from both sides of the counter.
    function rent() external pure returns (string memory) {
        return string.concat("<script>", RENT_JS, "</script>");
    }

    /*═══════════════════ core ═══════════════════*/

    string internal constant CORE_JS =
        "window.IP=(()=>{"
        "const E=document.getElementById('D');"
        "const D=E?JSON.parse(E.textContent):{};"
        /*  The wallet subsystem — EIP-6963 collection, the picker, the
            remembered choice — lives in Chrome's WALLET_JS, emitted before
            this script on every page. Desk aliases it so the rest of the
            client reads the same as it always has.                       */
        "const IW=window.IPW;"
        "const pv=IW.pv,nm=IW.nm,pick=IW.pick,ask=IW.ask,wkeep=IW.keep,wdrop=IW.drop;"
        "let A=null;"
        "const $=i=>document.getElementById(i);"
        "const say=(m,c)=>{const s=$('s');if(s){s.textContent=m;s.className=c||''}};"
        // one 32-byte word, from a decimal or 0x string. padStart never
        // truncates, so an over-long value has to be refused rather than
        // quietly turned into different arguments
        "const pad=h=>{h=String(h).replace(/^0[xX]/,'').toLowerCase();"
        "if(!/^[0-9a-f]*$/.test(h))throw new Error('not a number');"
        "if(h.length>64)throw new Error('value does not fit in a word');"
        "return h.padStart(64,'0')};"
        "const W=v=>pad(BigInt(v).toString(16));"
        // a signed word. Ticks are negative for every pair priced below
        // parity, which is most of them. `W` would throw on one — the hex
        // whitelist refuses the minus sign — and a client that instead
        // dropped the sign would send a legal tick about nine million times
        // the intended price, minting in a range nobody chose with nothing
        // to complain about. Two's complement, or nothing.
        "const S=v=>{v=BigInt(v);if(v<0n)v=(1n<<256n)+v;"
        "if(v<0n||v>=(1n<<256n))throw new Error('value does not fit in a word');"
        "return pad(v.toString(16))};"
        // and back again, for a word that came off the wire
        "const SW=w=>{w=BigInt(w);return w>=(1n<<255n)?w-(1n<<256n):w};"
        "const AD=a=>{a=String(a||'').trim();"
        "if(!/^0x[0-9a-fA-F]{40}$/.test(a))throw new Error('not an address: '+a);return pad(a)};"
        /*  A ticker, from a token nobody vetted, safe to put in a page.

            The pages this collection renders escape every symbol on chain,
            but a symbol the CLIENT reads is a symbol the client escapes,
            and this page runs on the same origin as `/token/<id>/live` —
            where a wallet is injected. So: a whitelist, the same argument
            `Web.esc` makes, made again on the side that does its own
            reading. Anything that is not a plain ticker becomes the
            address instead, which is the more useful answer anyway.     */
        "const TK=(s,a)=>{s=String(s||'').replace(/[^A-Za-z0-9 ._+-]/g,'').trim().slice(0,16);"
        "return s||(String(a||'').slice(0,6)+'\\u2026'+String(a||'').slice(-4))};"
        /*  And the same whitelist over every ticker the page arrived with.

            The config block is written with the JSON escaper, so a symbol of
            `</script>` cannot end the block — but JSON escaping is not HTML
            escaping, and `\\u003cscript\\u003e` comes back out of JSON.parse
            as a literal `<script>`. Any page that then interpolates it into
            `innerHTML` — which the quote panel does, on every card here —
            has put a string the token's deployer chose into the DOM of a
            page a wallet is injected into.

            Escaping at the point of use would mean getting it right at every
            point of use forever. This is the one place every symbol passes
            through, so it happens here, once, to symbols the contract wrote
            and symbols the client read alike.                             */
        "(function scrub(o,d){if(!o||typeof o!=='object'||d>6)return;"
        "for(const k in o){const v=o[k];"
        "if(k==='s'&&typeof v==='string')o[k]=TK(v,o.a);else scrub(v,d+1)}})(D,0);"
        // an ERC-20 string return, decoded without an ABI coder: word 0 is
        // the offset, the word there is the length, the bytes follow. The
        // bytes32 generation answered in one word and no header at all.
        "const STR=r=>{const h=String(r).replace(/^0x/,'');"
        "if(h.length<=64){let s='';for(let i=0;i<32;i++){"
        "const c=parseInt(h.substr(i*2,2),16)||0;if(c)s+=String.fromCharCode(c)}return s}"
        "const off=Number(BigInt('0x'+h.slice(0,64)))*2;"
        "if(off+64>h.length)return '';"
        "const n=Number(BigInt('0x'+h.substr(off,64)));if(n>128)return '';"
        "let s='';for(let i=0;i<n;i++)s+=String.fromCharCode(parseInt(h.substr(off+64+i*2,2),16)||0);"
        "return s};"
        // decimal text <-> base units, entirely in BigInt
        "const parse=(s,d)=>{s=String(s==null?'':s).trim().replace(/,/g,'');"
        "if(!s)return 0n;if(!/^\\d*\\.?\\d*$/.test(s))throw new Error('not a number: '+s);"
        "const p=s.split('.'),w=p[0]||'0',f=p[1]||'';"
        "if(f.length>d)throw new Error(d+' decimal places at most');"
        "return BigInt(w+(f+'0'.repeat(d)).slice(0,d))};"
        "const fmt=(v,d,p)=>{p=p===undefined?6:p;v=BigInt(v);"
        "const u=10n**BigInt(d);let w=(v/u).toString();"
        "let f=(v%u).toString().padStart(d,'0').slice(0,p).replace(/0+$/,'');"
        "w=w.replace(/\\B(?=(\\d{3})+(?!\\d))/g,',');return w+(f?'.'+f:'')};"
        // `gas` is optional and matters in exactly one place: QuoterV2 works
        // by making a pool swap and catching the revert, which is not cheap,
        // and a node that defaults an eth_call to a small budget answers
        // "out of gas" to a question that had an answer.
        "const call=async(to,data,gas)=>{const p=pv();if(!p)throw new Error('no wallet found');"
        "const o={to:to,data:data};if(gas)o.gas='0x'+BigInt(gas).toString(16);"
        "const r=await p.request({method:'eth_call',params:[o,'latest']});"
        "if(!r||r.length<66)throw new Error('the call returned nothing');return r};"
        // the same, but a failure is an answer rather than an exception —
        // most of what these pages ask is "is there a pool", and there
        // usually is not
        "const tryCall=async(to,data,gas)=>{try{return await call(to,data,gas)}catch(e){return null}};"
        "const word=(r,i)=>BigInt('0x'+String(r).slice(2+i*64,66+i*64));"
        "const connect=async()=>{const p=await IW.choose();"
        "if(!p)throw new Error('no wallet found');"
        "const a=await p.request({method:'eth_requestAccounts'});A=a[0];"
        "const c=await p.request({method:'eth_chainId'});"
        "if(BigInt(c)!==BigInt(D.chain))throw new Error("
        "'your wallet is on chain '+BigInt(c)+' and this page is chain '+D.chain);"
        "document.querySelectorAll('.acct').forEach(e=>{"
        "e.textContent=A.slice(0,6)+'\\u2026'+A.slice(-4)});return p};"
        "const send=async(to,data,value)=>{const p=await connect();"
        "const tx={from:A,to:to,data:data};"
        "if(value!=null&&BigInt(value)>0n)tx.value='0x'+BigInt(value).toString(16);"
        "const h=await p.request({method:'eth_sendTransaction',params:[tx]});"
        "say('sent \\u00b7 '+h,'ok');return h};"
        "const chainOk=async()=>{const p=pv();if(!p)return false;"
        "try{return BigInt(await p.request({method:'eth_chainId'}))===BigInt(D.chain)}catch(e){return false}};"
        // the plain buttons the vault and index pages still use
        // the market picker: choosing one goes there. A <select> that needs
        // an ABI coder to change which pair you are looking at would be an
        // odd thing to build when the pair is part of the URL.
        "const M=$('mkt');if(M)M.addEventListener('change',()=>{"
        "location.href='/token/'+M.value+'/market'});"
        /*  The address chip is also the door back to the picker. */
        "document.querySelectorAll('.acct').forEach(e=>e.addEventListener('click',()=>{"
        "IW.drop();connect().catch(er=>say(String(er&&er.message||er),'no'))}));"
        "document.querySelectorAll('[data-call]').forEach(el=>el.addEventListener('click',async()=>{"
        "try{say('\\u2026');let d=el.dataset.call;"
        "for(const f of (el.dataset.args||'').split(',').filter(Boolean)){"
        "const q=f.split(':'),k=q[1],raw=q[0]==='@'?A:(($(q[0])||{}).value);"
        "d+=k==='addr'?AD(raw||A):k==='bool'?W(/^(1|true|yes)$/i.test(String(raw))?1:0):W(raw)}"
        "if(el.dataset.read!==undefined){const r=await call(el.dataset.to,d);"
        "const o=el.dataset.out&&$(el.dataset.out);const n=word(r,0);"
        "if(o)o.textContent=n.toString();say('read '+n,'ok');return}"
        "const v=el.dataset.value!==undefined?"
        "(el.dataset.valfrom?parse(($(el.dataset.valfrom)||{}).value,18):el.dataset.value):null;"
        "await send(el.dataset.to,d,v)}"
        "catch(e){say(String(e&&e.message||e),'no')}}));"
        "return{D:D,pv:pv,nm:nm,$:$,say:say,W:W,S:S,SW:SW,AD:AD,pad:pad,parse:parse,fmt:fmt,"
        "TK:TK,STR:STR,call:call,tryCall:tryCall,word:word,connect:connect,send:send,"
        "chainOk:chainOk,acct:()=>A}"
        "})();";

    /*═══════════════════ the swap card ═══════════════════*/

    string internal constant SWAP_JS =
        "(()=>{const I=window.IP,D=I.D,$=I.$;if(!D.pool)return;"
        "let dir=1,slip=50,mins=30,q=0n,busy=0,tmr=0;"
        "const TIN=()=>dir?D.base:D.quote,TOUT=()=>dir?D.quote:D.base;"
        // one word per fixed argument, computed once
        "const idw=I.W(D.id);"
        "const dirw=()=>I.W(dir?1:0);"
        // every write goes through a null guard. The first version of this set
        // $('sl').textContent directly, and the element did not exist — which
        // in a browser is a TypeError inside paint(), thrown before a single
        // listener is attached, so the whole card is dead on arrival while
        // the page around it renders perfectly.
        "const put=(i,v)=>{const e=$(i);if(e)e.textContent=v};"
        "const paint=()=>{put('ts',TIN().s);put('rs',TOUT().s);"
        "put('sl',(slip/100)+'%');const e=$('si');if(e)e.placeholder='0.0'};"
        "const bal=async(t,el)=>{if(!I.acct()){el.textContent='';return 0n}"
        "try{const r=await I.call(t.a,D.sel.balanceOf+I.AD(I.acct()));"
        "const b=I.word(r,0);el.textContent='balance '+I.fmt(b,t.d,4);return b}"
        "catch(e){el.textContent='';return 0n}};"
        "const allow=async()=>{if(!I.acct())return 0n;"
        "try{const r=await I.call(TIN().a,D.sel.allowance+I.AD(I.acct())+I.AD(D.pool));"
        "return I.word(r,0)}catch(e){return 0n}};"
        // the whole state machine lives in one function, so the button can
        // never say one thing while the numbers say another
        "const refresh=async()=>{if(busy)return;busy=1;try{"
        "const amt=(()=>{try{return I.parse($('si').value,TIN().d)}catch(e){return -1n}})();"
        "const det=$('det'),go=$('go');"
        "if(amt<0n){$('so').value='';det.innerHTML='';go.textContent='Enter an amount';"
        "go.disabled=true;return}"
        "if(amt===0n){$('so').value='';det.innerHTML='';"
        "go.textContent=I.acct()?'Enter an amount':'Connect wallet';go.disabled=!!I.acct();return}"
        "const r=await I.call(D.pool,D.sel.quote+idw+dirw()+I.W(amt));q=I.word(r,0);"
        "$('so').value=I.fmt(q,TOUT().d,8);"
        "const minOut=q*BigInt(10000-slip)/10000n;"
        // impact against the curve's own spot, which includes the virtual
        // offsets — the real reserves alone would price it wrong
        "let imp='';if(D.spot&&BigInt(D.spot)>0n){"
        "const S=BigInt(D.spot),uB=10n**BigInt(D.base.d);"
        "const want=dir?amt*S/uB:amt*uB/S;"
        "if(want>0n){const bps=(want>q?(want-q)*10000n/want:0n);"
        "imp='<div><span>impact, fee included</span><b>'+(Number(bps)/100).toFixed(2)+'%</b></div>'}}"
        "const rate=amt>0n?I.fmt(q*(10n**BigInt(TIN().d))/amt,TOUT().d,6):'0';"
        "det.innerHTML='<div><span>rate</span><b>1 '+TIN().s+' = '+rate+' '+TOUT().s+'</b></div>'"
        "+'<div><span>fee</span><b>'+(D.fee/100)+'%, to the token</b></div>'"
        "+'<div><span>you receive at least</span><b>'+I.fmt(minOut,TOUT().d,6)+' '+TOUT().s+'</b></div>'"
        "+imp+'<div><span>most this market can pay out</span><b>'"
        "+I.fmt(dir?D.maxQuoteOut:D.maxBaseOut,TOUT().d,4)+' '+TOUT().s+'</b></div>';"
        "if(!I.acct()){go.textContent='Connect wallet';go.disabled=false;return}"
        "const al=await allow();"
        "if(q===0n){go.textContent='No quote \\u2014 try a smaller amount';go.disabled=true;return}"
        "go.disabled=false;"
        "go.textContent=al<amt?('Approve '+TIN().s):('Swap '+TIN().s+' for '+TOUT().s);"
        "}catch(e){I.say(String(e&&e.message||e),'no')}finally{busy=0}};"
        "const later=()=>{clearTimeout(tmr);tmr=setTimeout(refresh,220)};"
        "$('si').addEventListener('input',later);"
        "$('flip').addEventListener('click',()=>{dir=dir?0:1;$('si').value='';$('so').value='';"
        "paint();bal(TIN(),$('bi'));bal(TOUT(),$('bo'));refresh()});"
        "$('mx').addEventListener('click',async()=>{const b=await bal(TIN(),$('bi'));"
        "$('si').value=I.fmt(b,TIN().d,TIN().d);refresh()});"
        "$('cog').addEventListener('click',()=>{const p=$('set');p.hidden=!p.hidden});"
        "document.querySelectorAll('[data-slip]').forEach(b=>b.addEventListener('click',()=>{"
        "slip=Number(b.dataset.slip);paint();refresh()}));"
        "$('dl').addEventListener('input',()=>{mins=Math.max(1,Number($('dl').value)||30)});"
        "$('go').addEventListener('click',async()=>{try{"
        "if(!I.acct()){await I.connect();I.say('connected \\u00b7 '+I.nm(),'ok');"
        "await bal(TIN(),$('bi'));await bal(TOUT(),$('bo'));return refresh()}"
        "const amt=I.parse($('si').value,TIN().d);if(amt<=0n)throw new Error('enter an amount');"
        "const al=await allow();"
        "if(al<amt){I.say('approving \\u2026');"
        "await I.send(TIN().a,D.sel.approve+I.AD(D.pool)+I.W((1n<<256n)-1n));"
        "I.say('approval sent \\u00b7 once it confirms, press again to swap','ok');return}"
        "const minOut=q*BigInt(10000-slip)/10000n;"
        "const dead=BigInt(Math.floor(Date.now()/1000)+mins*60);"
        "await I.send(D.pool,D.sel.swap+idw+dirw()+I.W(amt)+I.W(minOut)"
        "+I.AD(I.acct())+I.W(dead));"
        "}catch(e){I.say(String(e&&e.message||e),'no')}});"
        "paint();refresh();"
        "I.chainOk().then(o=>{if(o&&I.pv()&&I.pv().request)"
        "I.pv().request({method:'eth_accounts'}).then(a=>{if(a&&a[0]){"
        "I.connect().then(()=>{bal(TIN(),$('bi'));bal(TOUT(),$('bo'));refresh()})}})});"
        "})();";

    /*═══════════════════ inventory and terms ═══════════════════*/

    string internal constant POOL_JS =
        "(()=>{const I=window.IP,D=I.D,$=I.$;if(!D.pool)return;const idw=I.W(D.id);"
        "const need=async(t,amt)=>{if(amt<=0n)return true;"
        "const r=await I.call(t.a,D.sel.allowance+I.AD(I.acct())+I.AD(D.pool));"
        "if(I.word(r,0)>=amt)return true;"
        "await I.send(t.a,D.sel.approve+I.AD(D.pool)+I.W((1n<<256n)-1n));"
        "I.say('approval sent for '+t.s+' \\u00b7 press again once it confirms','ok');return false};"
        "const on=(id,fn)=>{const e=$(id);if(e)e.addEventListener('click',async()=>{"
        "try{await I.connect();await fn()}catch(e){I.say(String(e&&e.message||e),'no')}})};"
        "on('add',async()=>{const b=I.parse($('db').value,D.base.d),"
        "q=I.parse($('dq').value,D.quote.d);"
        "if(b<=0n&&q<=0n)throw new Error('enter an amount for at least one side');"
        "if(!await need(D.base,b))return;if(!await need(D.quote,q))return;"
        "await I.send(D.pool,D.sel.deposit+idw+I.W(b)+I.W(q))});"
        "on('rm',async()=>{const b=I.parse($('wb').value,D.base.d),"
        "q=I.parse($('wq').value,D.quote.d);"
        "await I.send(D.pool,D.sel.withdraw+idw+I.W(b)+I.W(q)+I.AD(I.acct()))});"
        "on('fee',async()=>{const f=Math.round(Number($('fb').value)*100);"
        "if(!(f>=0&&f<=D.feeCap))throw new Error('the fee ceiling is '+(D.feeCap/100)+'%');"
        "await I.send(D.pool,D.sel.setFee+idw+I.W(f))});"
        "on('bond',async()=>{const days=Number($('bd').value)||0;"
        "if(days<=0)throw new Error('enter a number of days');"
        "const until=BigInt(Math.floor(Date.now()/1000)+days*86400);"
        "await I.send(D.pool,D.sel.bond+idw+I.W(until))});"
        "on('sync',async()=>{await I.send(D.pool,D.sel.syncCurve+idw)});"
        "on('open',async()=>{const f=Math.round(Number($('of').value)*100);"
        "await I.send(D.pool,D.sel.openMarket+idw+I.AD($('ob').value)+I.AD($('oq').value)+I.W(f))});"
        "on('close',async()=>{await I.send(D.pool,D.sel.closeMarket+idw)});"
        "})();";

    /*═══════════════════ renting, both sides ═══════════════════*/

    string internal constant RENT_JS =
        "(()=>{const I=window.IP,D=I.D,$=I.$;if(!D.lease)return;const idw=I.W(D.id);"
        "const L=D.lease;"
        "const cost=d=>BigInt(L.perDay)*BigInt(d);"
        "const show=()=>{const d=Number($('rd').value)||0;"
        "const ok=d>=L.min&&d<=L.max;"
        "$('rc').textContent=ok?(I.fmt(cost(d),18,9)+' ETH for '+d+' day'+(d==1?'':'s')):"
        "('choose between '+L.min+' and '+L.max+' days');"
        "$('rg').disabled=!ok};"
        "const rd=$('rd');if(rd){rd.addEventListener('input',show);show()}"
        "const on=(id,fn)=>{const e=$(id);if(e)e.addEventListener('click',async()=>{"
        "try{await I.connect();await fn()}catch(e){I.say(String(e&&e.message||e),'no')}})};"
        "on('rg',async()=>{const d=Number($('rd').value)||0;"
        "await I.send(L.a,L.sel.rent+idw+I.W(d)+I.W(L.perDay),cost(d))});"
        "on('ls',async()=>{const p=I.parse($('lp').value,18),"
        "mn=Number($('ln').value)||1,mx=Number($('lx').value)||30;"
        "await I.send(L.a,L.sel.list+idw+I.W(p)+I.W(mn)+I.W(mx))});"
        "on('dl2',async()=>{await I.send(L.a,L.sel.delist+idw)});"
        "on('col',async()=>{await I.send(L.a,L.sel.collect+idw+I.AD(I.acct()))});"
        "on('end',async()=>{await I.send(L.a,L.sel.endLease+idw)});"
        "on('set2',async()=>{await I.send(L.a,L.sel.settle+idw)});"
        "on('clm',async()=>{await I.send(L.a,L.sel.claim)});"
        "on('agt',async()=>{await I.send(D.hub,L.sel.agent+idw+I.AD(L.a))});"
        "})();";
}
