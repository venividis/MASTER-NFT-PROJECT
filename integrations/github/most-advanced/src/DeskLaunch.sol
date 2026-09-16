// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  DeskLaunch — the launchpad's client

  Three things happen here that do not happen anywhere else on the site.

  ── it encodes two strings, and that is not an ABI coder ──

  Every other call this collection builds is flat words. `launch` takes a
  name and a symbol, and a `string` argument is an offset in the head and a
  length-prefixed body in the tail. That is a real encoding step and it is
  worth being precise about what has and has not been conceded: the client
  writes two offsets it computed from two known lengths, and pads two byte
  strings. It does not walk a type tree, it does not handle nesting, and it
  would not survive one more dynamic argument being added.

  The names are whitelisted to printable ASCII before they are measured,
  which is what makes the lengths trustworthy — a UTF-8 character is one
  JavaScript character and several bytes, and a length counted in the wrong
  one puts the tail at the wrong offset and the symbol becomes gibberish.

  ── it mines a CREATE2 salt with an eth_call ──

  A v4 hook must live at an address whose low fourteen bits are exactly its
  permissions, so deploying one means trying salts until one lands — about
  sixteen thousand on average. The client has no keccak. `Kiln.mine` is a
  `view`, so the visitor's own node does the search and commits nothing, and
  the client just moves a window along and counts.

  ── and it will not build a v4 liquidity call ──

  `modifyLiquidities` takes a dynamic array of dynamic bytes behind a
  decoder that rejects non-canonical encoding. That is past what is written
  above, and rather than approximate it the page sends v4 liquidity nowhere
  and says so.
───────────────────────────────────────────────────────────────────────────*/
contract DeskLaunch {
    function launch() external pure returns (string memory) {
        return string.concat("<script>", LAUNCH_JS, "</script>");
    }

    string internal constant LAUNCH_JS =
        "(()=>{const I=window.IP;if(!I)return;const $=I.$;"
        "const E=document.getElementById('K');if(!E)return;"
        "const K=JSON.parse(E.textContent),S=K.sel;"
        "const U=(window.UNI&&window.UNI.U)||null;"
        "let mined=null,landed=null;"
        "const say=(m,c)=>I.say(m,c);"

        /*  A string argument, by hand.

            Printable ASCII only, so one character is one byte and the length
            the head advertises is the length the tail actually has. Anything
            else is dropped rather than encoded carefully — a token whose
            name does not survive is a cosmetic loss, and a length that does
            not match its body moves every following argument.            */
        "const ASCII=s=>String(s==null?'':s).replace(/[^\\x20-\\x7e]/g,'').slice(0,64);"
        "const HEX=s=>{let h='';for(let i=0;i<s.length;i++)"
        "h+=s.charCodeAt(i).toString(16).padStart(2,'0');return h};"
        // length word + body padded up to a whole number of words
        "const TAIL=s=>{const b=HEX(s);const pad=b.length%64?64-(b.length%64):0;"
        "return I.W(s.length)+b+'0'.repeat(pad)};"
        "const WORDS=s=>2+(s.length?Math.ceil(s.length/32):0);"

        /*  launch(uint256,string,string,uint8,uint256,bytes32)
            head is six words: the signing token, two offsets, three flat
            values. The offsets moved when the token arrived — an offset is
            a promise about where the tail starts, and adding a head word
            moves the tail.                                               */
        "const launchData=(tok,n,y,d,v,salt)=>{"
        "const o1=6*32,o2=o1+32*(1+(n.length?Math.ceil(n.length/32):0));"
        "return S.launch+I.W(tok)+I.W(o1)+I.W(o2)+I.W(d)+I.W(v)+I.pad(salt)"
        "+TAIL(n)+TAIL(y)};"
        "const coinAtData=(by,n,y,d,v,salt)=>{"
        "const o1=6*32,o2=o1+32*(1+(n.length?Math.ceil(n.length/32):0));"
        "return S.coinAt+I.AD(by)+I.W(o1)+I.W(o2)+I.W(d)+I.W(v)+I.pad(salt)"
        "+TAIL(n)+TAIL(y)};"

        "const form=()=>{const n=ASCII($('cn').value),y=ASCII($('cs').value);"
        "const d=Number($('cd').value);"
        "const tok=BigInt(String($('ct').value||'0').trim()||'0');"
        "if(tok<=0n)throw new Error('which token signs it \u2014 the number of one you hold');"
        "if(!n||!y)throw new Error('a name and a symbol');"
        "if(!(d>=0&&d<=36))throw new Error('decimals must be 0 to 36');"
        "const v=I.parse($('cv').value,d);"
        "if(v<=0n)throw new Error('a supply of nothing is not a launch');"
        "let salt=String($('ck').value||'0x1').trim();"
        "if(!/^0x[0-9a-fA-F]{1,64}$/.test(salt))throw new Error('the salt is 32 bytes of hex');"
        "return{tok:tok,n:n,y:y,d:d,v:v,salt:salt}};"

        "const on=(id,fn)=>{const e=$(id);if(e)e.addEventListener('click',async()=>{"
        "try{await fn()}catch(x){say(String(x&&x.message||x),'no')}})};"
        "const onc=(id,fn)=>on(id,async()=>{await I.connect();await fn()});"

        /*  A slider and a number box, telling each other the truth. The box
            is canonical — it is what every handler reads — and the slider
            is a hand on it. Two are straight; two are logarithmic, because
            a fee that runs to 100% and a supply that runs to quadrillions
            are not walkable on a straight bar.                           */
        "const LOG=(r,b,k,fmt)=>{const R=$(r),B=$(b);if(!R||!B)return;"
        "R.addEventListener('input',()=>{const x=Math.round(Math.pow(10,Number(R.value)/k));"
        "B.value=x;B.dispatchEvent(new Event('input'));if(fmt)fmt(x)});"
        "B.addEventListener('input',()=>{const x=Number(B.value);"
        "if(x>0&&isFinite(x))R.value=Math.round(Math.log10(x)*k);if(fmt)fmt(x)})};"
        "const LIN=(r,b)=>{const R=$(r),B=$(b);if(!R||!B)return;"
        "R.addEventListener('input',()=>{B.value=R.value;"
        "B.dispatchEvent(new Event('input'))});"
        "B.addEventListener('input',()=>{R.value=B.value})};"
        "LIN('hoR','ho');LIN('hlR','hl');"
        /*  The band runs to 100% in hundredths of a basis point, so it is
            logarithmic for the same reason the pool fee is: the interesting
            fees all live in the first thousandth of a straight bar.       */
        "LOG('fflR','ffl',100);LOG('fclR','fcl',100);"
        "LOG('cvR','cv',10);LOG('psR','ps',100);"
        "const feeShow=x=>{const e=$('pfl');if(e)e.textContent="
        "x===K.dynamicFee?'dynamic':(x/10000).toFixed(x<100?4:2)+'%'};"
        "LOG('pfR','pf',100,feeShow);"
        "const pfd=$('pfd');if(pfd)pfd.addEventListener('change',()=>{"
        "$('pf').value=pfd.checked?K.dynamicFee:Math.round(Math.pow(10,Number($('pfR').value)/100));"
        "feeShow(Number($('pf').value));"
        "$('pf').dispatchEvent(new Event('input'))});"
        "feeShow(3000);"

        /*───── 1 · the token ─────*/
        "on('cchk',async()=>{const f=form();"
        "const who=I.acct()||(await I.connect(),I.acct());"
        "const r=await I.call(K.kiln,coinAtData(who,f.n,f.y,f.d,f.v,f.salt));"
        "landed='0x'+String(r).slice(26,66);"
        "$('cpre').innerHTML='<div><span>it would land at</span><b>'+landed+'</b></div>'"
        "+'<div><span>supply</span><b>'+I.fmt(f.v,f.d,6)+' '+f.y+'</b></div>';"
        "say('read from the launchpad \\u00b7 nothing sent','ok')});"

        "onc('cgo',async()=>{const f=form();"
        "await I.send(K.kiln,launchData(f.tok,f.n,f.y,f.d,f.v,f.salt))});"

        /*───── 2 · the hook ─────*/
        "const gateArg=()=>{const h=Number($('ho').value)||0,d=Number($('hl').value)||0;"
        "if(h<0||d<0)throw new Error('times run forwards');"
        "const now=BigInt(Math.floor(Date.now()/1000));"
        "const opens=now+BigInt(Math.round(h*3600));"
        "const unlocks=now+BigInt(Math.round(d*86400));"
        "return{opens:opens,unlocks:unlocks,word:'0x'+((opens<<64n)|unlocks).toString(16)}};"
        "const gsum=()=>{const e=$('hsum');if(!e)return;try{const g=gateArg();"
        "e.innerHTML='<div><span>trading opens</span><b>'"
        "+new Date(Number(g.opens)*1000).toISOString().slice(0,16).replace('T',' ')+' UTC</b></div>'"
        "+'<div><span>liquidity unlocks</span><b>'"
        "+new Date(Number(g.unlocks)*1000).toISOString().slice(0,16).replace('T',' ')+' UTC</b></div>'"
        "+'<div><span>both are fixed at deployment</span><b>no setter, no owner</b></div>'}"
        "catch(x){e.innerHTML=''}};"
        "['ho','hl'].forEach(i=>{const e=$(i);if(e)e.addEventListener('input',gsum)});gsum();"

        /*  Which hook. The two kinds are not interchangeable and the page
            must not pretend they are: a Gate never sets a fee, so a pool
            initialised dynamic behind one charges zero for ever and a pool
            key cannot be edited afterwards. A Facet only ever sets a fee,
            so it reverts at `beforeInitialize` on a pool that is not
            dynamic. Each is wrong exactly where the other is right, which
            is why both guards below exist and why neither is a warning. */
        "const hkind=()=>Number(($('hk')||{}).value||0);"
        "const facetBand=()=>{const t=BigInt(String($('ft').value||'0').trim()||'0');"
        "const fl=Number($('ffl').value)||0,ce=Number($('fcl').value)||0;"
        "if(!(t>0n&&t<=0xffffffffffffffffn))throw new Error('which token sets the fee?');"
        "if(fl>ce)throw new Error('the fee at rest is above the fee at the furthest cut');"
        "if(ce>K.maxFee)throw new Error('a fee cannot be more than 100%');"
        "return{token:t,floor:fl,ceiling:ce}};"
        "const pc=x=>(Number(x)/10000).toFixed(Number(x)<1000?4:2)+'%';"

        /*  The reading, taken from the Kiln rather than recomputed here.
            The number a person is choosing against is the one the hook will
            actually charge, and the only way to be sure of that is to ask
            the contract that shares the hook's `Curve`.                  */
        "const fsum=async()=>{const e=$('fsum');if(!e)return;"
        "let g;try{g=facetBand()}catch(x){"
        "e.innerHTML='<div><span class=w>'+(x&&x.message||'')+'</span><b></b></div>';return}"
        "const r=await I.tryCall(K.kiln,S.band+I.W(g.token)+I.W(g.floor)+I.W(g.ceiling));"
        "if(!r){e.innerHTML='<div><span class=w>that token has no section to read "
        "\u2014 does it exist on this chain?</span><b></b></div>';return}"
        "const conc=I.word(r,1),now=I.word(r,2);"
        "e.innerHTML='<div><span>your solid is</span><b>'"
        "+(Number(conc)*100/80000).toFixed(1)+'% of the way to its furthest cut</b></div>'"
        "+'<div><span>so the pool would charge</span><b>'+pc(now)+' right now</b></div>'"
        "+'<div><span>and turning it moves that</span><b>'"
        "+pc(g.floor)+' to '+pc(g.ceiling)+'</b></div>'"
        "+'<div><span>nobody can set it by hand</span><b>no setter, no owner</b></div>'};"
        "['ft','ffl','fcl'].forEach(i=>{const e=$(i);"
        "if(e)e.addEventListener('input',()=>{fsum()})});"

        "const hshow=()=>{const k=hkind();"
        "const g=$('hkg'),f=$('hkf');"
        "if(g)g.style.display=k?'none':'';if(f)f.style.display=k?'':'none';"
        "if($('hmined'))$('hmined').innerHTML='';mined=null;"
        "if($('hgo'))$('hgo').disabled=true;"
        "if(k)fsum();else gsum();psum()};"
        "const hk=$('hk');if(hk)hk.addEventListener('change',hshow);"

        /*  The search. Windows of sixty thousand, because an eth_call has a
            gas ceiling and a function that ignored it would fail at some
            size with no partial answer — so the page asks for a window,
            gets told whether it landed, and moves along.                 */
        "on('hmine',async()=>{const kd=hkind();let word;"
        /*  The Facet's argument is packed by the Kiln, not here. Its layout
            is a token in the high bits and two fees below it, and a client
            that shifted by the wrong eight would put the token id inside
            the fee band and mine a hook that prices a token nobody owns —
            silently, because every word involved is a valid word. The
            contract that unpacks it is the one that packs it.          */
        "if(kd===1){const b=facetBand();"
        "const a=await I.call(K.kiln,S.facetArg+I.W(b.token)+I.W(b.floor)+I.W(b.ceiling));"
        "word='0x'+String(a).slice(2,66)}"
        "else word=gateArg().word;"
        "const rh=await I.call(K.kiln,S.recipeHash+I.W(kd)+I.pad(word));"
        "const hash='0x'+String(rh).slice(2,66);"
        "const flags=I.word(rh,1);"
        "let from=0n,tried=0n;const WIN=60000n;"
        "const out=$('hmined');"
        "for(let i=0;i<12;i++){"
        "out.innerHTML='<div><span>searching</span><b>'+tried+' addresses tried</b></div>';"
        "const r=await I.tryCall(K.kiln,"
        "S.mine+I.pad(hash)+I.W(flags)+I.W(from)+I.W(WIN),30000000);"
        "if(!r)throw new Error('the search call would not run \\u2014 try a smaller window');"
        "tried+=WIN;"
        "if(I.word(r,0)===1n){"
        "const salt='0x'+String(r).slice(2+64,2+128);"
        "const at='0x'+String(r).slice(2+128+24,2+192);"
        /*  `sets` is the only property the pool step cares about, and it is
            a fact about the kind rather than about the address: a Gate's
            beforeSwap returns a zero fee override for ever.             */
        "mined={salt:salt,at:at,arg:word,flags:flags,kind:kd,sets:kd===1};"
        "out.innerHTML='<div><span>found after</span><b>'+tried+' tried</b></div>'"
        "+'<div><span>the hook would live at</span><b>'+at+'</b></div>'"
        "+'<div><span>its low 14 bits</span><b>0x'"
        "+(BigInt(at)&0x3fffn).toString(16)+' \\u2014 '"
        "+(kd?'beforeInitialize + beforeSwap':'beforeSwap + beforeRemoveLiquidity')"
        "+'</b></div>'"
        "+'<div><span>it sets the fee</span><b>'"
        "+(kd?'yes \\u2014 pair it with a dynamic-fee pool':'no \\u2014 pair it with a fixed fee')"
        "+'</b></div>';"
        "$('hgo').disabled=false;"
        "say('found by your own node \\u00b7 nothing was sent','ok');return}"
        "from+=WIN}"
        "throw new Error('no address in '+tried+' tries \\u2014 press again to keep going')});"

        "onc('hgo',async()=>{if(!mined)throw new Error('find an address first');"
        "await I.send(K.kiln,S.deployHook+I.W(mined.kind)+I.pad(mined.salt)"
        "+I.pad(mined.arg))});"

        /*───── 3 · the pool ─────*/
        "const tickOf=(p,d0,d1)=>Math.round(Math.log(p*Math.pow(10,d1-d0))/Math.log(1.0001));"
        "const psum=async()=>{const e=$('psum');if(!e)return;"
        "const fee=Number(($('pf')||{}).value||3000);"
        /*  The warning used to read `mined ? '' : …`, which asked whether a
            hook existed rather than whether it sets a fee — and the only
            hook this page could mine was a Gate, which never does. The
            reassuring case and the broken case were the same case.     */
        "e.innerHTML=(fee===K.dynamicFee"
        "?'<div><span>fee</span><b>dynamic \\u2014 set by the hook, per swap</b></div>'"
        "+((mined&&mined.sets)?'':'<div><span class=w>a dynamic-fee pool starts at "
        "zero and only its hook can move it \\u2014 without a Facet nothing ever will, "
        "and a pool key cannot be changed afterwards</span><b></b></div>')"
        ":'<div><span>fee</span><b>'+(fee/10000)+'%</b></div>'"
        "+((mined&&mined.sets)?'<div><span class=w>a Facet reverts unless the pool is "
        "dynamic \\u2014 tick dynamic, or mine a Gate instead</span><b></b></div>':''))"
        "+'<div><span>hook</span><b>'+(mined?mined.at:'none')+'</b></div>'"
        "+'<div><span>pool</span><b>'+(K.v4&&mined?'v4':K.v4?'v4':'v3')+'</b></div>'};"
        "['pf','ps','pq'].forEach(i=>{const e=$(i);if(e)e.addEventListener('input',psum);"
        "if(e)e.addEventListener('change',psum)});psum();"

        /*  The first `hshow` belongs here rather than beside its own
            definition. It paints the pool summary too, and `psum` is a
            `const` declared further down — calling it any earlier reaches
            into the temporal dead zone and throws, which does not break the
            hook step alone, it kills the whole script and with it every
            button on the page. The listener above is bound early because
            binding is not calling; the first paint waits until everything
            it paints exists.                                            */
        "hshow();"

        /*  initialize((address,address,uint24,int24,address),uint160) — the
            PoolKey is five fixed-size fields, so the whole call is six flat
            words with no offset. This is the one v4 entry point a client
            with no ABI coder can build on its own.                       */
        "onc('pgo',async()=>{"
        "if(!K.v4)throw new Error('no v4 PoolManager on this chain');"
        "const a=landed;"
        "if(!a)throw new Error('check where your token lands first, so this page knows "
        "which token to pair');"
        "const q=String($('pq').value||'').trim();"
        "if(!/^0x[0-9a-fA-F]{40}$/.test(q))throw new Error('paste the token to pair with');"
        "const fee=Number($('pf').value),sp=Number($('ps').value);"
        "if(!(sp>0&&sp<32768))throw new Error('tick spacing is 1 to 32767');"
        /*  Both directions, because each hook is wrong exactly where the
            other is right. v4 starts a dynamic-fee pool at zero and lets
            only the hook move it; a Gate's beforeSwap returns a zero
            override for ever, so that pool is priced at nothing and a pool
            key is immutable. A Facet is the reverse: its beforeInitialize
            reverts `NotDynamic` on a fixed-fee pool, which is a revert the
            page can explain here instead of letting the wallet show it as
            an unnamed failure.                                         */
        "if(fee===K.dynamicFee&&!(mined&&mined.sets))"
        "throw new Error('a dynamic fee needs a hook that sets one \\u2014 mine a Facet, "
        "or choose a fixed fee. A Gate never sets a fee, and a pool that starts at zero "
        "with nothing to move it stays there');"
        "if(mined&&mined.sets&&fee!==K.dynamicFee)"
        "throw new Error('a Facet only attaches to a dynamic-fee pool \\u2014 it reverts "
        "at initialize otherwise. Tick dynamic, or mine a Gate');"
        "const price=Number($('pp').value);"
        "if(!(price>0)||!isFinite(price))throw new Error('a starting price above zero');"
        // sorted, because a PoolKey's currencies must be in address order
        "const lo=a.toLowerCase()<q.toLowerCase()?a:q,hi=lo===a?q:a;"
        "const da=Number($('cd').value)||18;"
        "const dq=await I.tryCall(q,(U&&U.sel.decimals)||'0x313ce567');"
        "const dqn=dq?Number(I.word(dq,0)):18;"
        "const d0=lo===a?da:dqn,d1=lo===a?dqn:da;"
        // the form says "per one of yours"; a pool says token1 per token0
        "const t=tickOf(lo===a?price:1/price,d0,d1);"
        "const snapped=Math.round(t/sp)*sp;"
        "const sq=await I.call(U?U.venue:K.kiln,((U&&U.sel.vSqrtAt)||'')+I.S(snapped));"
        "await I.send(K.manager,S.initV4+I.AD(lo)+I.AD(hi)+I.W(fee)+I.S(sp)"
        "+I.AD(mined?mined.at:'0x0000000000000000000000000000000000000000')"
        "+I.W(I.word(sq,0)))});"

        /*───── reading a hook ─────*/
        "on('hxgo',()=>{const v=String($('hx').value||'').trim();"
        "if(!/^0x[0-9a-fA-F]{40}$/.test(v))throw new Error('that is not an address');"
        "location.href='/hook/'+v.toLowerCase()});"
        "const hx=$('hx');if(hx)hx.addEventListener('keydown',e=>{"
        "if(e&&e.key==='Enter'){const v=String(hx.value||'').trim();"
        "if(/^0x[0-9a-fA-F]{40}$/.test(v))location.href='/hook/'+v.toLowerCase()}});"
        "})();";
}
