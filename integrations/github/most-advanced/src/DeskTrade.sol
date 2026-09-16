// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  DeskTrade — the trading clients, as contract code

  `DeskUni` holds the data: the addresses, the derived asset list, and every
  selector computed from its own signature string. This holds the programs
  that use it. They are separate contracts for the plainest possible reason
  — EIP-170 gives each of them 24,576 bytes and together they do not fit —
  but the split falls in a useful place anyway: what the site knows is in
  one contract, what the site does is in another, and a reader checking a
  selector against the ABI never has to read a line of JavaScript to find it.

  Nothing here is fetched. Every byte of these programs is contract code,
  handed to the browser inside the document the contract generated, on a
  page reached over `web3://` with no DNS and no server.
───────────────────────────────────────────────────────────────────────────*/
contract DeskTrade {
    /// @notice The swap card.
    function swap() external pure returns (string memory) {
        return string.concat("<script>", SWAP_JS, "</script>");
    }

    /*───────────────────────────────────────────────────────────────────────

      The swap card.

      Uniswap's hosted router considers thousands of pools, splits an order
      across several of them, and prices the gas of each route. This does
      the part of that job the browser can do honestly: it quotes the pair
      at every fee tier that has a pool, one `eth_call` each, and takes the
      best answer. Single hop, because a multi-hop path is a `bytes` argument
      and this client has no ABI coder — and a page that quietly gave you a
      worse single-hop price while implying it had searched would be worse
      than one that says what it looked at.

      The quote comes from QuoterV2, which is not a `view` function: it
      works by making the pool perform the swap and catching the revert. A
      browser can run it with `eth_call`, which executes and discards. The
      page contract cannot, which is why the number under the card at render
      time is the pool's spot price and the number in the card is the quote.

    ───────────────────────────────────────────────────────────────────────*/
    string internal constant SWAP_JS =
        "(()=>{const I=window.IP,N=window.UNI;if(!I||!N)return;"
        "const $=I.$,U=N.U,S=N.S;"
        "let A=null,B=null,ps=[],pick=null,forced=0,q=0n,slip=50,mins=30,busy=0,tmr=0;"
        "const put=(i,v)=>{const e=$(i);if(e)e.textContent=v};"
        "const paint=()=>{put('ts',A?A.s:'select');put('rs',B?B.s:'select');"
        "put('sl',(slip/100)+'%')};"
        "const bal=async(t,id)=>{const e=$(id);if(!e)return 0n;"
        "if(!t||!I.acct()){e.textContent='';return 0n}"
        "const r=await I.tryCall(t.a,S.balanceOf+I.AD(I.acct()));"
        "if(!r){e.textContent='';return 0n}"
        "const b=I.word(r,0);e.textContent='balance '+I.fmt(b,t.d,4);return b};"
        // which tiers exist, and how deep each is
        "const routes=async()=>{const t=$('rt');ps=await N.pools(A,B);pick=ps[0]||null;forced=0;"
        "if(!t)return;if(!A||!B){t.innerHTML='';return}"
        "if(!ps.length){t.innerHTML='<div><span>pools</span><b>none for this pair</b></div>';return}"
        "t.innerHTML=ps.map(p=>'<button data-fee=\\''+p.fee+'\\'"
        "class=\\'tr'+(pick&&p.fee===pick.fee?' on':'')+'\\'>'+(p.fee/10000)+'%</button>').join('');"
        "t.querySelectorAll('[data-fee]').forEach(b=>b.addEventListener('click',()=>{"
        "pick=ps.find(x=>String(x.fee)===b.dataset.fee)||pick;forced=1;"
        "t.querySelectorAll('.tr').forEach(z=>z.classList.remove('on'));"
        "b.classList.add('on');refresh()}))};"
        /*  Every tier that has a pool, unless the visitor pressed one — in
            which case exactly that one. The page says the tier can be
            overridden and this is what makes that true: before, the button
            moved the highlight and the trade still went wherever the best
            quote was, which is a control that lies about what it does.   */
        "const quoteAll=async amt=>{let best=null;"
        "for(const p of (forced&&pick?[pick]:ps)){"
        "const r=await I.tryCall(U.quoter,"
        "S.quote+I.AD(A.a)+I.AD(B.a)+I.W(amt)+I.W(p.fee)+I.W(0),30000000);"
        "if(!r)continue;const o=I.word(r,0);"
        "if(o>0n&&(!best||o>best.out))best={out:o,fee:p.fee,pool:p.pool}}"
        "return best};"
        "const refresh=async()=>{if(busy){later();return}busy=1;try{"
        "const det=$('det'),go=$('go');"
        "if(!A||!B){$('so').value='';det.innerHTML='';"
        "go.textContent='Choose two tokens';go.disabled=true;return}"
        "if(A.a===B.a){det.innerHTML='';go.textContent='Those are the same token';"
        "go.disabled=true;return}"
        "const amt=(()=>{try{return I.parse($('si').value,A.d)}catch(e){return -1n}})();"
        "if(amt<=0n){$('so').value='';det.innerHTML='';"
        "go.textContent=amt<0n?'Enter an amount':(I.acct()?'Enter an amount':'Connect wallet');"
        "go.disabled=amt<0n||!!I.acct();return}"
        "if(!ps.length){det.innerHTML='<div><span>pools</span><b>none for this pair</b></div>';"
        "go.textContent='No Uniswap pool for this pair';go.disabled=true;return}"
        "const b=await quoteAll(amt);"
        "if(!b){$('so').value='';"
        "det.innerHTML='<div><span>quote</span><b>no pool could fill this</b></div>';"
        "go.textContent='No route';go.disabled=true;return}"
        "if(!forced){pick=ps.find(p=>p.fee===b.fee)||pick;const rw=$('rt');"
        "if(rw)rw.querySelectorAll('[data-fee]').forEach(z=>"
        "z.classList.toggle('on',String(z.dataset.fee)===String(b.fee)))}q=b.out;"
        "$('so').value=I.fmt(q,B.d,8);"
        "const minOut=q*BigInt(10000-slip)/10000n;"
        "const rate=I.fmt(q*(10n**BigInt(A.d))/amt,B.d,6);"
        "det.innerHTML='<div><span>rate</span><b>1 '+A.s+' = '+rate+' '+B.s+'</b></div>'"
        "+'<div><span>through</span><b>the '+(b.fee/10000)+'% pool</b></div>'"
        "+'<div><span>you receive at least</span><b>'+I.fmt(minOut,B.d,6)+' '+B.s+'</b></div>'"
        "+'<div><span>deadline</span><b>'+(U.kind===0?mins+' minutes':"
        "'this router has no deadline field')+'</b></div>';"
        "if(!I.acct()){go.textContent='Connect wallet';go.disabled=false;return}"
        "const al=await I.tryCall(A.a,S.allowance+I.AD(I.acct())+I.AD(U.router));"
        "go.disabled=false;"
        "go.textContent=(al?I.word(al,0):0n)<amt?('Approve '+A.s):"
        "('Swap '+A.s+' for '+B.s);"
        "}catch(e){I.say(String(e&&e.message||e),'no')}finally{busy=0}};"
        "const later=()=>{clearTimeout(tmr);tmr=setTimeout(refresh,250)};"
        /*  Both shapes, chosen by the kind that came with the address.
            `amountIn` of zero is refused here as well as by the amount
            field, because on SwapRouter02 zero is not "swap nothing": it
            is the CONTRACT_BALANCE sentinel, and it means "swap everything
            this router is holding".                                      */
        "const build=(amt,minOut,fee)=>{"
        "if(amt<=0n)throw new Error('an amount of zero is a sweep sentinel on one of "
        "these routers, not an empty trade');"
        "const to=I.acct();"
        "if(/^0x0{39}[12]$/i.test(to))throw new Error('that recipient is a router sentinel');"
        "const head=I.AD(A.a)+I.AD(B.a)+I.W(fee)+I.AD(to);"
        "if(U.kind===0){const dl=BigInt(Math.floor(Date.now()/1000)+mins*60);"
        "return S.swapV3+head+I.W(dl)+I.W(amt)+I.W(minOut)+I.W(0)}"
        "return S.swap02+head+I.W(amt)+I.W(minOut)+I.W(0)};"
        "const setA=async t=>{A=t;paint();await routes();bal(A,'bi');refresh()};"
        "const setB=async t=>{B=t;paint();await routes();bal(B,'bo');refresh()};"
        "N.picker('ta','tax',setA);N.picker('tb','tbx',setB);"
        "$('si').addEventListener('input',later);"
        "const fl=$('flip');if(fl)fl.addEventListener('click',async()=>{"
        "const x=A;A=B;B=x;const sa=$('ta'),sb=$('tb');"
        "if(sa&&sb){const v=sa.value;sa.value=sb.value;sb.value=v;"
        "const xa=$('tax'),xb=$('tbx');if(xa&&xb){const w=xa.value;xa.value=xb.value;xb.value=w;"
        "xa.hidden=sa.value!=='?';xb.hidden=sb.value!=='?'}}"
        "$('si').value='';$('so').value='';paint();await routes();"
        "bal(A,'bi');bal(B,'bo');refresh()});"
        "const mx=$('mx');if(mx)mx.addEventListener('click',async()=>{"
        "if(!A)return;const b=await bal(A,'bi');$('si').value=I.fmt(b,A.d,A.d);refresh()});"
        "const cg=$('cog');if(cg)cg.addEventListener('click',()=>{const p=$('set');p.hidden=!p.hidden});"
        "document.querySelectorAll('[data-slip]').forEach(b=>b.addEventListener('click',()=>{"
        "slip=Number(b.dataset.slip);paint();refresh()}));"
        "const dl=$('dl');if(dl)dl.addEventListener('input',()=>{"
        "mins=Math.max(1,Number(dl.value)||30);refresh()});"
        "$('go').addEventListener('click',async()=>{try{"
        "if(!I.acct()){await I.connect();I.say('connected \\u00b7 '+I.nm(),'ok');"
        "await bal(A,'bi');await bal(B,'bo');return refresh()}"
        "if(!A||!B)throw new Error('choose two tokens');"
        "const amt=I.parse($('si').value,A.d);"
        "if(amt<=0n)throw new Error('enter an amount');"
        "const al=await I.tryCall(A.a,S.allowance+I.AD(I.acct())+I.AD(U.router));"
        "if((al?I.word(al,0):0n)<amt){I.say('approving \\u2026');"
        "await I.send(A.a,S.approve+I.AD(U.router)+I.W((1n<<256n)-1n));"
        "I.say('approval sent \\u00b7 once it confirms, press again to swap','ok');return}"
        "const b=await quoteAll(amt);if(!b)throw new Error('no pool could fill that');"
        "const minOut=b.out*BigInt(10000-slip)/10000n;"
        "if(minOut<=0n)throw new Error('that slippage tolerance leaves no floor at all');"
        "await I.send(U.router,build(amt,minOut,b.fee));"
        "}catch(e){I.say(String(e&&e.message||e),'no')}});"
        "paint();refresh();"
        "I.chainOk().then(o=>{if(o&&I.pv()&&I.pv().request)"
        "I.pv().request({method:'eth_accounts'}).then(a=>{if(a&&a[0])"
        "I.connect().then(()=>{bal(A,'bi');bal(B,'bo');refresh()})})});"
        "})();";


    /*───────────────────────────────────────────────────────────────────────

      Concentrated liquidity, and the position that is a limit order.

      A v3 position is two ticks and an amount. Everything difficult about
      the page is that a tick is not a price and a person thinks in prices,
      so the conversion has to happen somewhere and be honest in both
      directions:

        · a price the person typed becomes an approximate tick here, with a
          logarithm in double precision — which is fine, because a tick is a
          choice and being one out is being 0.01% out;
        · that tick is snapped onto the pool's grid by `Venue.usable`, on
          chain, because the pool rejects anything else;
        · and the price that snapped tick actually means comes back from
          `Venue.priceAt`, on chain, exactly — and *that* is the number the
          page shows.

      Nobody is ever told their position sits at the price they typed. They
      are told where it actually sits.

      The one-sided case is the interesting one. A position placed entirely
      above the current tick can only be funded with token0, and as the
      price rises through it the pool converts that token0 into token1 —
      which is a sell order at a price you chose, executed by the AMM, with
      no server, no relayer, no signature and no counterparty to trust. It
      is not identical to a limit order and the page says so: it fills
      gradually across the range rather than all at once, it un-fills if the
      price comes back, it earns fees while it works, and nothing settles it
      automatically — you come back and withdraw.

      Ticks are signed and this is where that bites. Every pair priced below
      parity has a negative current tick, and a tick word padded with zeroes
      instead of sign-extended turns -201240 into a vast positive number. The
      position mints in a range nobody chose and nothing reverts. Every tick
      here goes through `I.S`.

    ───────────────────────────────────────────────────────────────────────*/
}
