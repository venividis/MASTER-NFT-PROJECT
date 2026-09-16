// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";

/*───────────────────────────────────────────────────────────────────────────
  DeskWill — the words about an estate

  Registered through the same `def` the built-in words use, so a reader
  cannot tell from the terminal which contract a word came from. What is
  different here is where the addresses come from: `DeskTerm` is at
  ninety-seven per cent of what a chain will accept, and two more addresses
  and eight more selectors would put it over. So this carries its own
  config block rather than asking the terminal to grow one, which is the
  same additive move `Roster` made against `Parley` — the thing that
  already exists does not have to change to be extended.
───────────────────────────────────────────────────────────────────────────*/
contract DeskWill {
    address public immutable SUCC;
    address public immutable CONS;
    address public immutable HUB;

    constructor(address succ, address cons, address hub) {
        SUCC = succ; CONS = cons; HUB = hub;
    }

    function core() external view returns (string memory) {
        return string.concat(
            "<script type=\"application/json\" id=\"W\">{",
            "\"succ\":\"", LibNum.hexAddr(SUCC),
            "\",\"cons\":\"", LibNum.hexAddr(CONS),
            "\",\"hub\":\"", LibNum.hexAddr(HUB),
            "\",\"sel\":{",
            "\"arrange\":\"", _s("arrange(uint256,address,uint256,uint64,uint64)"),
            "\",\"revoke\":\"", _s("revoke(uint256)"),
            "\",\"still\":\"",  _s("stillHere(uint256)"),
            "\",\"summon\":\"", _s("summon(uint256)"),
            "\",\"claim\":\"",  _s("claim(uint256)"),
            "\",\"planOf\":\"", _s("planOf(uint256)"),
            "\",\"heirOf\":\"", _s("heirOf(uint256)"),
            "\",\"would\":\"",  _s("wouldPass(uint256)"),
            "\",\"approve\":\"",_s("approve(address,uint256)"),
            "\",\"consign\":\"",_s("consign(uint256,address,uint96,uint16,uint64)"),
            "\",\"ask\":\"",    _s("ask(uint256,uint96)"),
            "\",\"buy\":\"",    _s("buy(uint256,uint96)"),
            "\",\"reclaim\":\"",_s("reclaim(uint256)"),
            "\",\"release\":\"",_s("release(uint256)"),
            "\",\"noteOf\":\"", _s("noteOf(uint256)"),
            "\"}}</script><script>", WILL_JS, "</script>"
        );
    }

    function _s(string memory sig) private pure returns (string memory) {
        bytes32 h = keccak256(bytes(sig));
        bytes memory o = new bytes(10);
        o[0] = "0"; o[1] = "x";
        bytes16 hx = "0123456789abcdef";
        for (uint256 i; i < 4; ++i) {
            o[2 + i * 2] = hx[uint8(h[i]) >> 4];
            o[3 + i * 2] = hx[uint8(h[i]) & 0x0f];
        }
        return string(o);
    }

    string internal constant WILL_JS =
        "(()=>{const T=window.TERM,I=window.IP;if(!T||!I||!T.def)return;"
        "const E=document.getElementById('W');if(!E)return;"
        "const V=JSON.parse(E.textContent),S=V.sel,DAY=86400;"
        "const now=()=>Math.floor(Date.now()/1000);"
        "const dt=t=>Number(t)?new Date(Number(t)*1000).toISOString().slice(0,10):'\\u2014';"
        "const eth=v=>I.fmt(v,18)+' ETH';"
        "const WHY=['ready \\u2014 it moves on the next inherit',"
        "'no arrangement','sold; the plan died with the sale',"
        "'not approved \\u2014 nothing can move','soulbound; a bolt outlives its holder',"
        "'nobody to leave it to','the heir cannot receive it',"
        "'in use \\u2014 nobody may knock yet','knocked; the notice is running',"
        "'gone quiet \\u2014 anybody may knock'];"

        "T.def('will','will <token> [heir] [days] [notice]',0,"
        "'read an arrangement, or write one',async(a)=>{"
        "const id=BigInt(a[0]),w=I.W(id);"
        "if(a.length<2){"
        "const p=await I.tryCall(V.succ,S.planOf+w);"
        "if(!p||I.word(p,0)===0n)return'nothing arranged for #'+a[0];"
        "const tk=I.word(p,2);"
        "const h=await I.tryCall(V.succ,S.heirOf+w);"
        "const q=await I.tryCall(V.succ,S.would+w);"
        "return'#'+a[0]+' \\u2192 '+(tk?('whoever holds #'+tk):('0x'+String(h).slice(-40)))"
        "+'\\nsilence '+(Number(I.word(p,3))/DAY)+'d, notice '+(Number(I.word(p,4))/DAY)+'d'"
        "+'\\nlast seen '+dt(I.word(p,5))"
        "+'\\n'+WHY[Number(q?I.word(q,0):1n)]}"
        /*  Either shape in one argument, exactly as the page does it: a
            person who means \"token 7\" and a person who means an address
            are both right, and neither should need a different word.  */
        "const v=String(a[1]);"
        "const to=/^#?[0-9]+$/.test(v)?I.W(0n):I.AD(v);"
        "const tok=/^#?[0-9]+$/.test(v)?BigInt(v.replace('#','')):0n;"
        "const d=BigInt((Number(a[2])||365)*DAY),n=BigInt((Number(a[3])||30)*DAY);"
        "await I.send(V.succ,S.arrange+w+to+I.W(tok)+I.W(d)+I.W(n));"
        "return'arranged \\u2014 now approve it: approve-will '+a[0]});"

        "T.def('approve-will','approve-will <token>',1,"
        "'let the succession move this token when both clocks run out',async(a)=>{"
        "await I.send(V.hub,S.approve+I.AD(V.succ)+I.W(BigInt(a[0])));"
        "return'approved \\u2014 the plan can move it, and only where the plan says'});"

        "T.def('alive','alive <token>',1,'reset the silence on an arrangement',async(a)=>{"
        "await I.send(V.succ,S.still+I.W(BigInt(a[0])));"
        "return'the clock is back to zero, and any knock is cancelled'});"

        "T.def('unwill','unwill <token>',1,'erase an arrangement',async(a)=>{"
        "await I.send(V.succ,S.revoke+I.W(BigInt(a[0])));return'erased'});"

        "T.def('knock','knock <token>',1,"
        "'start the notice on a token that has gone quiet',async(a)=>{"
        "await I.send(V.succ,S.summon+I.W(BigInt(a[0])));"
        "return'knocked \\u2014 public, and one touch by the holder cancels it'});"

        "T.def('inherit','inherit <token>',1,"
        "'hand a token to its heir once both clocks have run out',async(a)=>{"
        "await I.send(V.succ,S.claim+I.W(BigInt(a[0])));"
        "return'passed \\u2014 to whoever the arrangement named, not to you'});"

        "T.def('consign','consign <token> <agent> <floor> <cut%> <days>',1,"
        "'put a token in an agent\\u2019s window at a floor',async(a)=>{"
        "const id=BigInt(a[0]),fl=I.parse(a[2],18);"
        "if(fl<=0n)throw new Error('name a floor \\u2014 there is no zero floor here');"
        "const cut=BigInt(Math.round((Number(a[3])||0)*100));"
        "const until=BigInt(now()+(Number(a[4])||30)*DAY);"
        "await I.send(V.hub,S.approve+I.AD(V.cons)+I.W(id));"
        "await I.send(V.cons,S.consign+I.W(id)+I.AD(a[1])+I.W(fl)+I.W(cut)+I.W(until));"
        "return'in the window until '+dt(until)+', never below '+eth(fl)});"

        "T.def('window','window <token>',0,'read a consignment',async(a)=>{"
        "const n=await I.tryCall(V.cons,S.noteOf+I.W(BigInt(a[0])));"
        "if(!n||I.word(n,0)===0n)return'#'+a[0]+' is not consigned';"
        "const ask=I.word(n,3);"
        "return'seller 0x'+String(n).slice(2).substr(0,64).slice(24)"
        "+'\\nagent  0x'+String(n).slice(2).substr(64,64).slice(24)"
        "+'\\nfloor  '+eth(I.word(n,2))"
        "+'\\nasking '+(ask?eth(ask):'not offered yet')"
        "+'\\nhome by '+dt(I.word(n,4))"
        "+'\\ncut    '+(Number(I.word(n,5))/100)+'%'});"

        "T.def('price','price <token> <eth>',1,"
        "'as the agent, name today\\u2019s price \\u2014 never below the floor',async(a)=>{"
        "await I.send(V.cons,S.ask+I.W(BigInt(a[0]))+I.W(I.parse(a[1],18)));"
        "return'offered at '+a[1]+' ETH'});"

        "T.def('take','take <token>',1,'buy a consigned token at its asking price',async(a)=>{"
        "const n=await I.tryCall(V.cons,S.noteOf+I.W(BigInt(a[0])));"
        "if(!n||I.word(n,0)===0n)throw new Error('#'+a[0]+' is not consigned');"
        "const ask=I.word(n,3);"
        "if(!ask)throw new Error('it has no asking price yet');"
        /*  The agreed price travels with the call. Otherwise an agent who
            watches the pool can raise the ask into whatever was sent.  */
        "await I.send(V.cons,S.buy+I.W(BigInt(a[0]))+I.W(ask),ask);"
        "return'bought at '+eth(ask)});"

        "T.def('home','home <token>',1,"
        "'send a consigned token back once its term is out \\u2014 anybody may',async(a)=>{"
        "await I.send(V.cons,S.reclaim+I.W(BigInt(a[0])));"
        "return'sent home, to the seller and nowhere else'});"

        "T.def('unwindow','unwindow <token>',1,"
        "'as the agent, hand a consignment back early',async(a)=>{"
        "await I.send(V.cons,S.release+I.W(BigInt(a[0])));return'handed back'});"
        "})();";
}
