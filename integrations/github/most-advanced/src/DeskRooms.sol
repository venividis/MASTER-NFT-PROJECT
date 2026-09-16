// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  DeskRooms — the words about who is in a room

  These belong in DeskTerm and cannot live there: that contract is at the
  byte ceiling, and a terminal that fits is worth more than a terminal that
  is one file. So they register themselves through the door DeskTerm opens,
  with the same `def` its own words were defined with — one table, one code
  path, one `help`. A reader cannot tell from the terminal which words came
  from which contract, which is the point.

  What they add is the half of stewardship the interface was missing: a
  room could be joined and invited to, and never shown who was in it or
  emptied of anyone.
───────────────────────────────────────────────────────────────────────────*/
contract DeskRooms {
    function core() external pure returns (string memory) {
        return string.concat("<script>", ROOMS_JS, "</script>");
    }

    string internal constant ROOMS_JS =
        "(()=>{const T=window.TERM,I=window.IP;if(!T||!I||!T.def)return;"
        "const E=document.getElementById('X');if(!E)return;"
        "const X=JSON.parse(E.textContent),S=X.sel;"
        "const need=async()=>{const m=T.run?await T.run('me'):null;"
        "const n=String(m||'').match(/#(\\d+)/);"
        "if(!n)throw new Error('use a token first \\u2014 try: use <id>');"
        "return BigInt(n[1])};"

        "T.def('invite','invite <room> <token>',1,"
        "'name a token that may join a room you keep',async(a)=>{"
        "const id=await need();"
        "const k=await I.call(X.parley,S.gkey+I.W(BigInt(a[0])));"
        "await I.send(X.parley,S.invite+k.slice(2)+I.W(id)+I.W(BigInt(a[1])));"
        "return'invited \u2014 it still has to walk in itself'});"
        "T.def('evict','evict <room> <token>',1,"
        "'show a token out of a room you keep',async(a)=>{"
        "const id=await need();"
        "const k=await I.call(X.parley,S.gkey+I.W(BigInt(a[0])));"
        "await I.send(X.parley,S.evict+k.slice(2)+I.W(id)+I.W(BigInt(a[1])));"
        "return'shown out \u2014 what it already said stays said'});"
        "T.def('roster','roster <room>',0,'who is in a room',async(a)=>{"
        "if(!X.roster)return'no roster wired on this deployment';"
        "const k=await I.call(X.parley,S.gkey+I.W(BigInt(a[0])));"
        "let out=[];"
        "for(let base=1;base<4096;base+=256){"
        "const r=await I.tryCall(X.roster,S.inWin+k.slice(2)+I.W(base));"
        "if(!r)break;const bits=I.word(r,0);"
        "for(let i=0;i<256;i++)if((bits>>BigInt(i))&1n)out.push('#'+(base+i));"
        "if(bits===0n&&base>1)break}"
        "return out.length?out.join(' '):'nobody is in that room'});"
        "})();";
}
