// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {IChrome, IDesk} from "./interfaces/Site.sol";

/*───────────────────────────────────────────────────────────────────────────
  PageSeal — the three seals, on one page

  A token can be sealed three ways, and they answer three different fears.
  The SOULBIND is a deadbolt on the token itself: while it is down, no
  transfer moves it and no stolen approval can either, because the check
  reads the bolt and not the permission. The ACCOUNT SEAL is a ratchet on
  the token's acting hand: until the date it names, nothing on the
  manifest leaves the Reach, measured before and after every call rather
  than promised. The KERNEL is the cargo seal: an encrypted payload
  committed by hash, current while it is sealed to the holder who sealed
  it and stale the moment the token changes hands.

  This page reads all three and operates the two that are the holder's to
  operate. It explains almost nothing in the open — each seal carries its
  lore behind a star, as everywhere else.
───────────────────────────────────────────────────────────────────────────*/
contract PageSeal {
    using LibNum for uint256;

    IChrome public immutable CHROME;
    IDesk   public immutable DESK;
    address public immutable HUB;

    /// @dev `IpseityAccount.MAX_SEAL` is 365 days, and a seal past it
    ///      reverts. The number lives here once and reaches the bar and the
    ///      client through the config block, because a cap that is typed in
    ///      three places is a cap that will disagree with itself.
    uint256 public constant MAX_DAYS = 365;

    constructor(IChrome chrome, IDesk desk, address hub) {
        CHROME = chrome;
        DESK = desk;
        HUB = hub;
    }

    /*═══════════════════ /seal ═══════════════════*/

    function sealPage() external view returns (string memory) {
        return string.concat(
            CHROME.head("IPSEITY \xc2\xb7 seal"),
            CHROME.navTop(14),
            "<h1>seal</h1>"
            "<p class=e>Three seals, three different fears. The soulbind stops the "
            "token moving \xe2\x80\x94 and defeats the stolen-approval drain outright, "
            "because the transfer check reads the bolt, not the permission. The "
            "account seal is a ratchet on the token's acting hand: until its date, "
            "nothing on the manifest leaves, measured rather than promised. The "
            "kernel is the cargo seal: private bytes, committed by hash, that go "
            "stale the moment the token changes hands.</p>",
            _config(),
            _card(),
            "<div id=s></div>",
            CHROME.wallet(),
            DESK.bare(),
            DESK.core(),
            _js(),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    function _config() private view returns (string memory) {
        return string.concat(
            "<script type=\"application/json\" id=\"Z\">{",
            "\"hub\":\"", LibNum.hexAddr(HUB),
            "\",\"maxDays\":", MAX_DAYS.str(),
            ",\"sel\":{",
            "\"locked\":\"",   _sel("locked(uint256)"),
            "\",\"lock\":\"",  _sel("lock(uint256)"),
            "\",\"unlock\":\"",_sel("unlock(uint256)"),
            "\",\"account\":\"", _sel("account(uint256)"),
            "\",\"embody\":\"",  _sel("embody(uint256)"),
            "\",\"kern\":\"",    _sel("kernelStatus(uint256)"),
            "\",\"ownerOf\":\"", _sel("ownerOf(uint256)"),
            "\",\"seal\":\"",    _sel("seal(uint64)"),
            "\",\"until\":\"",   _sel("sealedUntil()"),
            "\"}}</script>"
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

    /*═══════════════════ the card ═══════════════════*/

    /// @dev The bar cannot be dragged past the account's own ceiling, because
    ///      a control that can be dragged into a revert is a control that
    ///      lies about what it does.
    function _card() private pure returns (string memory) {
        return string.concat(
            "<div class=app>"
            "<div class=hd><b>Seals</b><span class=\"m acct\"></span></div>"
            "<div class=fld><div class=lbl><span>token</span>"
            "<span>the number, not the address</span></div>"
            "<div class=row><input id=zid placeholder=\"0\" inputmode=numeric></div></div>"
            "<div class=det id=zst></div>"
            "<button class=go id=zbolt disabled>Pick a token</button>"
            "<label>account seal <b id=zdl>30 days</b></label>"
            "<input type=range id=zdR min=1 max=", MAX_DAYS.str(), " value=30>"
            "<div class=row><input id=zd value=\"30\" inputmode=numeric "
            "style=\"max-width:8rem\"><span class=m id=zdd></span></div>"
            "<div class=det id=zsum></div>"
            "<p class=w>The account seal only ever moves outward: it cannot be "
            "shortened, cancelled, or sold out of, and it survives the token "
            "changing hands.</p>"
            "<button class=go id=zseal disabled>Pick a token</button>"
            "</div>"
            "<p class=e>The bolt is the holder&#39;s alone, and that is the whole "
            "of its security: a drainer holding a stolen approval cannot lift it, "
            "because lifting it asks who the holder is \xe2\x80\x94 and while it is "
            "down, the drainer&#39;s transfer reverts like everyone else&#39;s. It "
            "flips back as often as you like; nothing about it is a commitment.</p>"
            "<p class=e>The kernel is read here and nowhere else on this site. "
            "Sealing one needs the payload and its hash, which this page does not "
            "carry and should not be trusted with.</p>"
        );
    }

    /*═══════════════════ the client ═══════════════════*/

    function _js() private pure returns (string memory) {
        return string.concat("<script>", SEAL_JS, "</script>");
    }

    string internal constant SEAL_JS =
        "(()=>{const I=window.IP;if(!I)return;const $=I.$;"
        "const E=document.getElementById('Z');if(!E)return;"
        "const Z=JSON.parse(E.textContent),S=Z.sel;"
        "const DAY=86400;"
        /*  Everything the two buttons need, read once by `read` and never
            inferred from the DOM afterwards — a button that re-derives who
            the holder is from the text it printed is a button that will
            eventually believe its own label.                              */
        "let ID=null,ACC=null,LIVE=false,BOLT=false,MINE=false,UNTIL=0n,seq=0;"

        "const shrt=a=>String(a).slice(0,6)+'\\u2026'+String(a).slice(-4);"
        "const dt=t=>new Date(Number(t)*1000).toISOString().slice(0,10);"
        "const now=()=>Math.floor(Date.now()/1000);"
        "const tgt=()=>BigInt(now()+(Number($('zd').value)||0)*DAY);"

        /*  The gate. Both buttons say what they will do, or say why they
            will not — the ratchet case in particular, because `seal` with a
            date that is not later than the stored one reverts, and a wallet
            popup that ends in a revert costs gas to learn nothing.       */
        "const gate=()=>{const b=$('zbolt'),g=$('zseal');"
        "const d=Number($('zd').value)||0,t=tgt();"
        "$('zdl').textContent=d+(d===1?' day':' days');"
        "$('zdd').textContent='lands on '+dt(t);"
        "if(ID===null){b.disabled=true;b.textContent='Pick a token';"
        "g.disabled=true;g.textContent='Pick a token';$('zsum').innerHTML='';return}"
        "if(!I.acct()){b.disabled=false;b.textContent='Connect';"
        "g.disabled=false;g.textContent='Connect';$('zsum').innerHTML='';return}"
        "b.disabled=!MINE;"
        "b.textContent=!MINE?'Held by someone else':BOLT?'Unlock':'Lock';"
        "if(!LIVE){g.disabled=false;g.textContent='Create the account';"
        "$('zsum').innerHTML='<div><span>the Reach is an address with nothing at "
        "it yet</span><b>embody first</b></div>';return}"
        "if(!MINE){g.disabled=true;g.textContent='The holder seals this';"
        "$('zsum').innerHTML='';return}"
        "if(t<=UNTIL){g.disabled=true;g.textContent='Already sealed further out';"
        "$('zsum').innerHTML='<div><span class=w>the ratchet only moves outward "
        "\\u2014 this date is not past '+dt(UNTIL)+', so seal() would revert</span>"
        "<b></b></div>';return}"
        "g.disabled=false;g.textContent='Seal until '+dt(t);"
        "$('zsum').innerHTML='<div><span>nothing on the manifest leaves</span><b>"
        "until '+dt(t)+'</b></div>'};"

        /*  All three seals, in one pass.

            `seq` exists because typing "123" fires three reads and the chain
            answers them in whatever order it likes; without it the answer for
            token 1 can land after the answer for token 123 and paint someone
            else's bolt over yours.                                        */
        "const read=async()=>{const n=++seq;"
        "const v=String($('zid').value||'').trim();"
        "ID=/^[0-9]+$/.test(v)?BigInt(v):null;"
        "ACC=null;LIVE=false;BOLT=false;MINE=false;UNTIL=0n;"
        "if(ID===null){$('zst').innerHTML='';gate();return}"
        "if(!I.pv()){$('zst').innerHTML='<div><span>no wallet and no node to read "
        "these through</span><b></b></div>';gate();return}"
        "const w=I.W(ID);"
        "const ow=await I.tryCall(Z.hub,S.ownerOf+w);"
        "if(n!==seq)return;"
        /*  A number nobody minted puts the id back to nothing before the
            gate runs. Leaving it set left both buttons armed against a token
            that does not exist, and `embody` on one of those reverts —
            which is the whole thing the gate is here to prevent.          */
        "if(!ow){ID=null;"
        "$('zst').innerHTML='<div><span class=w>no token with that number"
        "</span><b></b></div>';gate();return}"
        "const own='0x'+String(ow).slice(26,66);"
        "const me=I.acct();MINE=!!me&&String(me).toLowerCase()===own;"
        "const lk=await I.tryCall(Z.hub,S.locked+w);BOLT=!!lk&&I.word(lk,0)===1n;"
        "const kr=await I.tryCall(Z.hub,S.kern+w);const K=kr?Number(I.word(kr,0)):0;"
        "const ac=await I.tryCall(Z.hub,S.account+w);"
        "ACC=ac?'0x'+String(ac).slice(26,66):null;"
        /*  Whether the account exists yet, asked the only way this client
            can ask it: the address is deterministic and readable long before
            anything is deployed there, and a call to an address with no code
            comes back empty rather than with a zero.                      */
        "const su=ACC?await I.tryCall(ACC,S.until):null;"
        "if(n!==seq)return;"
        "LIVE=!!su;UNTIL=su?I.word(su,0):0n;"
        "$('zst').innerHTML="
        "'<div><span>holder</span><b>'+shrt(own)+(MINE?' \\u00b7 you':'')+'</b></div>'"
        "+'<div><span>soulbind</span><b>'+(BOLT?'<span class=w>down</span> "
        "\\u00b7 nothing transfers':'up \\u00b7 free to move')+'</b></div>'"
        "+'<div><span>account</span><b>'+(ACC?shrt(ACC):'\\u2014')"
        "+(LIVE?'':' \\u00b7 not embodied')+'</b></div>'"
        "+'<div><span>account seal</span><b>'+(UNTIL===0n?'never sealed'"
        ":UNTIL>BigInt(now())?'until '+dt(UNTIL):'lapsed \\u00b7 was until '"
        "+dt(UNTIL))+'</b></div>'"
        "+'<div><span>kernel</span><b>'+(K===1?'<span class=ok>current</span> "
        "\\u00b7 sealed to the holder who holds it now':K===2?"
        "'<span class=w>stale</span> \\u00b7 the token changed hands, and the new "
        "holder cannot open what was sealed to the old one':'none')+'</b></div>';"
        "gate()};"

        "$('zdR').addEventListener('input',()=>{$('zd').value=$('zdR').value;gate()});"
        "$('zd').addEventListener('input',()=>{const v=Number($('zd').value);"
        "if(v>=1&&v<=Z.maxDays)$('zdR').value=v;gate()});"
        "$('zid').addEventListener('input',read);"
        "$('zid').addEventListener('change',read);"

        /*  The bolt. Free in both directions and as often as the holder
            likes, so there is nothing here to confirm and nothing to warn
            about — the label is the whole interface.                     */
        "$('zbolt').addEventListener('click',async()=>{try{"
        "if(!I.acct()){await I.connect();await read();return}"
        "if(ID===null)throw new Error('a token number first');"
        "if(!MINE)throw new Error('only the holder moves the bolt');"
        "await I.send(Z.hub,(BOLT?S.unlock:S.lock)+I.W(ID));"
        "await read()}catch(x){I.say(String(x&&x.message||x),'no')}});"

        "$('zseal').addEventListener('click',async()=>{try{"
        "if(!I.acct()){await I.connect();await read();return}"
        "if(ID===null)throw new Error('a token number first');"
        "if(!ACC)throw new Error('this token has no account address');"
        /*  `embody` takes no holder check on purpose: the address was fixed
            at mint, deploying to it changes nothing anyone owns, and whoever
            wants the account to exist may pay for it.                     */
        "if(!LIVE){await I.send(Z.hub,S.embody+I.W(ID));await read();return}"
        "if(!MINE)throw new Error('only the holder seals the account');"
        "const t=tgt();"
        "if(t<=UNTIL)throw new Error('the seal only moves outward');"
        "await I.send(ACC,S.seal+I.W(t));"
        "await read()}catch(x){I.say(String(x&&x.message||x),'no')}});"

        "gate();"
        "})();";
}
