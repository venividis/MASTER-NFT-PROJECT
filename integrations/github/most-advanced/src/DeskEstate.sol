// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  DeskEstate — the client for the will and the window

  Split out of `PageEstate` for the same reason `DeskRooms` was split out of
  `DeskTerm`: the page and its script together were past the byte ceiling,
  and a page that fits is worth more than a page that is one file. Nothing
  about the split is visible from the page — `Premises` concatenates the two
  and the reader gets one document.

  What it drives: two readers that never infer state from the DOM they
  printed, two gates that say what a button will do or why it will not, and
  a heir field that accepts either an address or a token number because a
  person who means "token 7" should not have to find a second box.
───────────────────────────────────────────────────────────────────────────*/
contract DeskEstate {
    function core() external pure returns (string memory) {
        return string.concat("<script>", ESTATE_JS, "</script>");
    }

    string internal constant ESTATE_JS =
        "(()=>{const I=window.IP;if(!I)return;const $=I.$;"
        "const E=document.getElementById('Q');if(!E)return;"
        "const Q=JSON.parse(E.textContent),S=Q.sel;"
        "const DAY=86400;"

        /*  Read once, never re-derived from the DOM. A control that works
            out who the holder is from the label it just printed is a
            control that will eventually believe its own label.          */
        "let QID=null,QMINE=false,QW=0,QPLAN=null,QAPP=false;"
        "let CID=null,CMINE=false,CNOTE=null,qs=0,cs=0;"

        /*  Every one of these can be reached after the elements are gone:
            `after()` schedules a refresh a second and a half out, and the
            account listener outlives any particular view. A reader that
            assumes its own page is still mounted throws into a timer,
            where nothing is listening and nothing recovers.           */
        "const up=()=>!!$('qid')&&!!$('cid');"
        "const shrt=a=>String(a).slice(0,6)+'\\u2026'+String(a).slice(-4);"
        "const dt=t=>Number(t)?new Date(Number(t)*1000).toISOString().slice(0,10):'\\u2014';"
        "const now=()=>Math.floor(Date.now()/1000);"
        "const num=v=>{v=String(v||'').trim();return /^[0-9]+$/.test(v)?BigInt(v):null};"
        "const span=d=>d>=365?(Math.round(d/36.5)/10)+' years':d+' days';"
        "const row=(a,b)=>'<div><span>'+a+'</span><b>'+b+'</b></div>';"
        "const warn=t=>'<div><span class=w>'+t+'</span><b></b></div>';"

        /*  The nine answers `wouldPass` can give. A bool here would tell an
            heir their arrangement is broken and not which part.         */
        "const WHY=['ready \\u2014 the token moves on the next claim',"
        "'no arrangement on this token',"
        "'the token was sold; the plan died with the sale',"
        "'the succession is not approved on this token, so nothing can move',"
        "'soulbound \\u2014 a bolt outlives its holder, and this cannot pass',"
        "'nobody to leave it to; the named token is gone',"
        "'the heir cannot receive it \\u2014 it is the owner, or one of the token\\u2019s own hands',"
        "'in use \\u2014 nobody may knock yet',"
        "'knocked; the notice is running',"
        "'gone quiet long enough \\u2014 anybody may knock'];"

        /*═════ the will ═════*/

        "const qgate=()=>{if(!up())return;const d=Number($('qqR').value)||365,n=Number($('qnR').value)||30;"
        "$('qql').textContent=span(d);$('qnl').textContent=span(n);"
        "const a=$('qarr'),ap=$('qapp');"
        "for(const k of ['qstill','qrev','qsum2','qcl'])$(k).disabled=true;"
        "ap.hidden=true;"
        "if(QID===null){a.disabled=true;a.textContent='Pick a token';$('qsum').innerHTML='';return}"
        "if(!I.acct()){a.disabled=false;a.textContent='Connect';$('qsum').innerHTML='';return}"
        "a.disabled=!QMINE;"
        "a.textContent=!QMINE?'Held by someone else':QPLAN?'Rewrite the arrangement':"
        "('Leave it after '+span(d));"
        "let h='';"
        "if(QPLAN){h+=row('goes to',QPLAN.toToken?('whoever holds #'+QPLAN.toToken):shrt(QPLAN.to));"
        "h+=row('if untouched until',dt(QPLAN.knock));"
        "if(QPLAN.called)h+=row('knocked \\u2014 opens',dt(QPLAN.opens));"
        "h+=(QW===0?row('status',WHY[0]):warn(WHY[QW]||'unknown'));"
        "$('qstill').disabled=!QMINE;$('qrev').disabled=!QMINE;"
        "$('qsum2').disabled=!(QW===9);$('qcl').disabled=!(QW===0);"
        "if(QMINE&&!QAPP&&QW===3){ap.hidden=false;ap.disabled=false}}"
        "else h+=row('nothing arranged','this token goes nowhere');"
        "h+=row('notice after the knock',span(n));"
        "$('qsum').innerHTML=h};"

        "const qread=async()=>{if(!up())return;const k=++qs;QID=num($('qid').value);"
        "QMINE=false;QW=1;QPLAN=null;QAPP=false;"
        "if(QID===null){$('qst').innerHTML='';qgate();return}"
        "if(!I.pv()){$('qst').innerHTML=warn('no wallet and no node to read through');qgate();return}"
        "const w=I.W(QID);"
        "const ow=await I.tryCall(Q.hub,S.ownerOf+w);if(k!==qs)return;"
        "if(!ow){QID=null;$('qst').innerHTML=warn('no token with that number');qgate();return}"
        "const o='0x'+ow.slice(-40),me=I.acct();"
        "QMINE=!!me&&me.toLowerCase()===o.toLowerCase();"
        "const ap=await I.tryCall(Q.hub,S.getApp+w);if(k!==qs)return;"
        "QAPP=!!ap&&('0x'+ap.slice(-40)).toLowerCase()===Q.succ.toLowerCase();"
        "const pl=await I.tryCall(Q.succ,S.planOf+w);if(k!==qs)return;"
        "if(pl&&I.word(pl,0)!==0n){"
        "QPLAN={to:'0x'+pl.slice(2).substr(64,64).slice(24),toToken:I.word(pl,2),"
        "called:I.word(pl,6)};"
        "const kn=await I.tryCall(Q.succ,S.knockAt+w);"
        "const op=await I.tryCall(Q.succ,S.opensAt+w);if(k!==qs)return;"
        "QPLAN.knock=kn?I.word(kn,0):0n;QPLAN.opens=op?I.word(op,0):0n}"
        "const ww=await I.tryCall(Q.succ,S.would+w);if(k!==qs)return;"
        "QW=ww?Number(I.word(ww,0)):1;"
        "$('qst').innerHTML=row('held by',QMINE?'you':shrt(o))+"
        "row('approved to the succession',QAPP?'yes':'no');"
        "qgate()};"

        /*  The heir field takes either shape, because a person who means
            \"token 7\" and a person who means an address are both right and
            neither should have to find a second box.                    */
        "const heir=()=>{const v=String($('qto').value||'').trim();"
        "if(/^#?[0-9]+$/.test(v))return[I.W(0n),BigInt(v.replace('#',''))];"
        "return[I.AD(v),0n]};"

        /*═════ the window ═════*/

        "const cgate=()=>{if(!up())return;const cut=Number($('ccR').value)||0,d=Number($('ctR').value)||30;"
        "$('ccl').textContent=(cut/100).toFixed(2).replace(/\\.?0+$/,'')+'%';"
        "$('ctl').textContent=span(d);"
        "const b=$('ccon');"
        "for(const k of ['cask','cbuy','crec','crel'])$(k).disabled=true;"
        "if(CID===null){b.disabled=true;b.textContent='Pick a token';$('csum').innerHTML='';return}"
        "if(!I.acct()){b.disabled=false;b.textContent='Connect';$('csum').innerHTML='';return}"
        "const me=(I.acct()||'').toLowerCase();"
        "if(CNOTE){b.disabled=true;b.textContent='Already in the window';"
        "const mine=me===CNOTE.seller.toLowerCase(),ag=me===CNOTE.agent.toLowerCase();"
        "let h=row('consigned by',mine?'you':shrt(CNOTE.seller))+"
        "row('agent',ag?'you':shrt(CNOTE.agent))+"
        "row('floor',I.fmt(CNOTE.floor,18)+' ETH')+"
        "row('asking',CNOTE.ask?(I.fmt(CNOTE.ask,18)+' ETH'):'not offered yet')+"
        "row('home by',dt(CNOTE.until));"
        "if(CNOTE.ask)h+=row('the seller takes',I.fmt(CNOTE.toSeller,18)+' ETH')+"
        "row('the agent takes',I.fmt(CNOTE.toAgent,18)+' ETH')+"
        "(CNOTE.roy?row('royalty',I.fmt(CNOTE.roy,18)+' ETH'):'');"
        "const over=Number(CNOTE.until)<=now();"
        "if(over)h+=warn('the term is over \\u2014 the window is shut, and anybody may send it home');"
        "$('cask').disabled=!ag||over;$('crel').disabled=!ag;"
        "$('crec').disabled=!over;"
        "$('cbuy').disabled=!CNOTE.ask||over||mine;"
        "if(mine&&!over)h+=row('to end it early','the agent releases it');"
        "$('csum').innerHTML=h;return}"
        "b.disabled=!CMINE;"
        "b.textContent=!CMINE?'Held by someone else':('Consign for '+span(d));"
        "const fl=I.parse($('cfl').value,18);"
        "$('csum').innerHTML=(fl>0n?row('never below',I.fmt(fl,18)+' ETH'):"
        "warn('a consignment with no floor is a gift with extra steps'))+"
        "row('the agent keeps',(cut/100)+'% of whatever it fetches')+"
        "row('home by itself',dt(now()+d*DAY))};"

        "const cread=async()=>{if(!up())return;const k=++cs;CID=num($('cid').value);"
        "CMINE=false;CNOTE=null;"
        "if(CID===null){$('cst').innerHTML='';cgate();return}"
        "if(!I.pv()){$('cst').innerHTML=warn('no wallet and no node to read through');cgate();return}"
        "const w=I.W(CID);"
        "const ow=await I.tryCall(Q.hub,S.ownerOf+w);if(k!==cs)return;"
        "if(!ow){CID=null;$('cst').innerHTML=warn('no token with that number');cgate();return}"
        "const o='0x'+ow.slice(-40),me=I.acct();"
        "CMINE=!!me&&me.toLowerCase()===o.toLowerCase();"
        "const n=await I.tryCall(Q.cons,S.noteOf+w);if(k!==cs)return;"
        "if(n&&I.word(n,0)!==0n){"
        "CNOTE={seller:'0x'+n.slice(2).substr(0,64).slice(24),"
        "agent:'0x'+n.slice(2).substr(64,64).slice(24),"
        "floor:I.word(n,2),ask:I.word(n,3),until:I.word(n,4),cut:I.word(n,5)};"
        "const sp=await I.tryCall(Q.cons,S.split+w);if(k!==cs)return;"
        "if(sp){CNOTE.toSeller=I.word(sp,1);CNOTE.toAgent=I.word(sp,2);CNOTE.roy=I.word(sp,3)}}"
        "const lk=await I.tryCall(Q.hub,S.locked+w);if(k!==cs)return;"
        "$('cst').innerHTML=row('held by',CNOTE?'the escrow':(CMINE?'you':shrt(o)))+"
        "(lk&&I.word(lk,0)!==0n?warn('soulbound \\u2014 it cannot be delivered, so it cannot be offered'):'');"
        "cgate()};"

        "const owe=async()=>{if(!up())return;const a=I.acct();const b=$('cdraw');"
        "if(!a){b.hidden=true;$('cowe').innerHTML='';return}"
        "const r=await I.tryCall(Q.cons,S.owed+I.AD(a));"
        "const v=r?I.word(r,0):0n;"
        "$('cowe').innerHTML=v>0n?row('waiting for you',I.fmt(v,18)+' ETH'):'';"
        "b.hidden=v===0n;b.disabled=v===0n;"
        "b.textContent='Withdraw '+I.fmt(v,18)+' ETH'};"

        /*═════ wiring ═════*/

        "const go=async(f)=>{try{if(!I.acct())await I.connect();await f()}"
        "catch(e){I.say(String(e&&e.message||e),'no')}};"
        "const after=()=>setTimeout(()=>{qread();cread();owe()},1500);"

        "$('qarr').addEventListener('click',()=>go(async()=>{"
        "if(QID===null)return;const[a,t]=heir();"
        "await I.send(Q.succ,S.arrange+I.W(QID)+a+I.W(t)"
        "+I.W(BigInt((Number($('qqR').value)||365)*DAY))"
        "+I.W(BigInt((Number($('qnR').value)||30)*DAY)));after()}));"
        "$('qapp').addEventListener('click',()=>go(async()=>{"
        "await I.send(Q.hub,S.approve+I.AD(Q.succ)+I.W(QID));after()}));"
        "$('qstill').addEventListener('click',()=>go(async()=>{"
        "await I.send(Q.succ,S.still+I.W(QID));after()}));"
        "$('qrev').addEventListener('click',()=>go(async()=>{"
        "await I.send(Q.succ,S.revoke+I.W(QID));after()}));"
        "$('qsum2').addEventListener('click',()=>go(async()=>{"
        "await I.send(Q.succ,S.summon+I.W(QID));after()}));"
        "$('qcl').addEventListener('click',()=>go(async()=>{"
        "await I.send(Q.succ,S.claim+I.W(QID));after()}));"

        "$('ccon').addEventListener('click',()=>go(async()=>{"
        "if(CID===null)return;"
        "const fl=I.parse($('cfl').value,18);"
        "if(fl<=0n)throw new Error('name a floor \\u2014 there is no zero floor here');"
        "const until=BigInt(now()+(Number($('ctR').value)||30)*DAY);"
        /*  Approve, then consign. Two presses would be one press too many
            for a flow whose first half is meaningless alone.            */
        "await I.send(Q.hub,S.approve+I.AD(Q.cons)+I.W(CID));"
        "await I.send(Q.cons,S.consign+I.W(CID)+I.AD($('cag').value)"
        "+I.W(fl)+I.W(BigInt(Number($('ccR').value)||0))+I.W(until));after()}));"
        "$('cask').addEventListener('click',()=>go(async()=>{"
        "await I.send(Q.cons,S.ask+I.W(CID)+I.W(I.parse($('cap').value,18)));after()}));"
        "$('cbuy').addEventListener('click',()=>go(async()=>{"
        "if(!CNOTE||!CNOTE.ask)return;"
        "await I.send(Q.cons,S.buy+I.W(CID)+I.W(CNOTE.ask),CNOTE.ask);after()}));"
        "$('crec').addEventListener('click',()=>go(async()=>{"
        "await I.send(Q.cons,S.reclaim+I.W(CID));after()}));"
        "$('crel').addEventListener('click',()=>go(async()=>{"
        "await I.send(Q.cons,S.release+I.W(CID));after()}));"
        "$('cdraw').addEventListener('click',()=>go(async()=>{"
        "await I.send(Q.cons,S.draw);after()}));"

        "for(const k of ['qid','qto'])$(k).addEventListener('input',()=>qread());"
        "for(const k of ['qqR','qnR'])$(k).addEventListener('input',qgate);"
        "for(const k of ['cid','cag'])$(k).addEventListener('input',()=>cread());"
        "for(const k of ['ccR','ctR','cfl'])$(k).addEventListener('input',cgate);"
        "window.addEventListener('ip:account',()=>{qread();cread();owe()});"
        "qgate();cgate();owe();"
        "})();";
}
