// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {IHub, IChrome} from "./interfaces/Site.sol";

/*───────────────────────────────────────────────────────────────────────────
  PageKey — /k/<id>/<key>, the session key's own front door

  The console's specification named this page before anyone built it: "a
  bounded capability handed to a bot, a keeper or a model, and today
  nothing anywhere shows the holder of that key what it may do or how to
  use it." The console itself refuses `executeAsSession` — the key holder
  is not the token's holder and does not arrive from an instrument — so
  this is the one surface in the system where the person (or program)
  acting is not the person holding, and it is deliberately NOT the
  console: no verbs, no walk, no crest. One key, one envelope, one act.

  ── why the id is in the path ──

  A bare key cannot find the account that granted it. The grant is
  storage on one token's Reach, `SessionGranted` carries no list, and
  walking 4096 accounts is an indexer's job — the thing this site does
  not have and will not get. So the address of this page is the pair:
  /k/<token>/<key>. Whoever hands out a session key hands out this URL
  with it, the way the manifest hands out selectors.

  ── what it shows, and what it cannot ──

  The envelope — active, still the current holder's, expires, cap, spent
  — is readable and rendered. The allowlists are NOT enumerable: they are
  epoch-keyed mappings, membership-checkable one pair at a time, and the
  full lists live only in the grant transaction's calldata. This page
  says so instead of pretending, and offers the check: name a door
  (target and selector) and `sessionAllows` answers. That is also the
  honest shape for an agent — AGENT.md's propose-before-act — because a
  refusal read from a view costs nothing, and a refusal learnt from a
  revert costs a fee.
───────────────────────────────────────────────────────────────────────────*/
interface IReachSession {
    function sessionOf(address key) external view returns
        (uint64 expires, uint128 spendCap, uint128 spent, bool active, uint32 mark);
    function sessionCurrent(address key) external view returns (bool);
    function sealedUntil() external view returns (uint64);
}

contract PageKey {
    using LibNum for uint256;

    IHub    public immutable HUB;
    IChrome public immutable CHROME;

    constructor(IHub hub, IChrome chrome) {
        HUB = hub;
        CHROME = chrome;
    }

    function keyPage(uint256 id, address k) external view returns (string memory) {
        address reach = HUB.account(id);
        return string.concat(
            CHROME.head("IPSEITY \xc2\xb7 key"),
            CHROME.navTop(255),
            "<h1>a key to #", id.str(), "</h1>"
            "<p>This page is for whoever holds the session key <code>",
            LibNum.hexAddr(k),
            "</code> \xe2\x80\x94 a bounded authority over one token's acting hand, "
            "granted by the holder, revocable by the holder in one transaction, and "
            "dead the moment the token is sold. It is not the holder's page; the "
            "holder has the console.</p>",
            _envelope(id, reach, k),
            _doors(),
            _config(id, reach, k),
            _client(),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    /*  The envelope, read defensively: an account that is not embodied has
        no code and no sessions, and "no answer" must never render as a
        number. `try` alone does not survive a codeless address — the
        decoder's extcodesize check reverts in the caller — so the size is
        checked first, the ConsoleRead way.                              */
    function _envelope(uint256 id, address reach, address k)
        private view returns (string memory)
    {
        if (reach.code.length == 0) {
            return string.concat(
                "<h2>the envelope</h2>"
                "<p class=e>Token #", id.str(), "'s Reach \xe2\x80\x94 <code>",
                LibNum.hexAddr(reach),
                "</code> \xe2\x80\x94 is not yet embodied: the address exists as "
                "arithmetic and carries no code, so no session can have been granted "
                "on it. This is a fact about the account, not a failure of the key. "
                "The holder embodies it from the console's HOLD lane.</p>"
            );
        }
        try IReachSession(reach).sessionOf(k) returns
            (uint64 expires, uint128 spendCap, uint128 spent, bool active, uint32)
        {
            bool current;
            try IReachSession(reach).sessionCurrent(k) returns (bool c) { current = c; }
            catch { current = false; }
            uint64 sealedTs;
            try IReachSession(reach).sealedUntil() returns (uint64 su) { sealedTs = su; }
            catch { sealedTs = 0; }

            if (!active) {
                return
                    "<h2>the envelope</h2>"
                    "<p class=e>No session stands for this key on this token. Either it "
                    "was never granted, it was revoked, or it was granted and the token "
                    "has since changed hands \xe2\x80\x94 a sale retires every key the "
                    "seller left running.</p>";
            }
            return string.concat(
                "<h2>the envelope</h2><dl>"
                "<dt>standing</dt><dd>", current
                    ? "active, granted by the current holder"
                    : "granted before the token last changed hands \xe2\x80\x94 it will refuse",
                "</dd>"
                "<dt>expires</dt><dd>unix ", uint256(expires).str(), "</dd>"
                "<dt>spend cap</dt><dd>", uint256(spendCap).str(), " wei, cumulative</dd>"
                "<dt>spent so far</dt><dd>", uint256(spent).str(), " wei</dd>"
                "<dt>the account</dt><dd><code>", LibNum.hexAddr(reach), "</code>",
                sealedTs > block.timestamp
                    ? " \xe2\x80\x94 sealed: while the seal holds, this key is subject to the same balance measurement and the same approval refusals as the holder"
                    : "",
                "</dd></dl>"
            );
        } catch {
            return
                "<h2>the envelope</h2>"
                "<p class=e>The account did not answer for this key. Not zero, not "
                "refused \xe2\x80\x94 unreadable, which is a different fact, and the "
                "one this page will not paper over.</p>";
        }
    }

    function _doors() private pure returns (string memory) {
        return
            "<h2>what this key may do</h2>"
            "<p>Four bounds, checked on every call: it expires, it has a cumulative "
            "spend cap, and it may only call the targets and the four-byte selectors "
            "the grant listed. Three doors are closed by shape rather than by list: a "
            "session can never call the account itself, never approve a spender the "
            "grant did not name, and never touch the Grip \xe2\x80\x94 the Grip has "
            "no spend path for anyone.</p>"
            "<p class=e>The lists themselves cannot be read back: they are epoch-keyed "
            "mappings, and the full enumeration exists only in the grant "
            "transaction's calldata. This page checks doors one at a time instead "
            "\xe2\x80\x94 which is also the honest way for a program to act: ask "
            "<code>sessionAllows</code> first, because a refusal read from a view "
            "costs nothing and a refusal learnt from a revert costs a fee.</p>"
            "<h3>check a door</h3>"
            "<p class=e>A target address and a four-byte selector. The answer is the "
            "chain's, this block.</p>"
            "<input id=kt placeholder=\"target 0x\xe2\x80\xa6\" autocomplete=off> "
            "<input id=ks placeholder=\"selector 0x12345678\" autocomplete=off> "
            "<button id=kchk>ask</button>"
            "<h3>act as the key</h3>"
            "<p class=e>Builds <code>executeAsSession(to, value, data)</code> against "
            "the account, from the wallet holding this key. The door is checked "
            "before anything is proposed, and nothing is sent until you press the "
            "second button.</p>"
            "<input id=xt placeholder=\"to 0x\xe2\x80\xa6\" autocomplete=off> "
            "<input id=xv placeholder=\"value in wei, or 0\" autocomplete=off> "
            "<input id=xd placeholder=\"calldata 0x\xe2\x80\xa6\" autocomplete=off> "
            "<button id=xgo>check, then propose</button>"
            "<div id=xslab></div>";
    }

    /*  Selectors derived here, the only way selectors are ever derived:
        the browser ships no keccak, and a signature spelled in two places
        is a signature that will differ in one of them.                  */
    function _config(uint256 id, address reach, address k)
        private pure returns (string memory)
    {
        return string.concat(
            "<script type=\"application/json\" id=\"KEY\">{"
            "\"id\":", id.str(),
            ",\"reach\":\"", LibNum.hexAddr(reach),
            "\",\"key\":\"", LibNum.hexAddr(k),
            "\",\"sel\":{"
            "\"allows\":\"", _sel("sessionAllows(address,address,bytes4)"),
            "\",\"exec\":\"", _sel("executeAsSession(address,uint256,bytes)"),
            "\",\"current\":\"", _sel("sessionCurrent(address)"),
            "\",\"revoke\":\"", _sel("revokeSession(address)"),
            "\"}}</script>"
        );
    }

    function _sel(string memory sig) private pure returns (string memory) {
        bytes4 s = bytes4(keccak256(bytes(sig)));
        bytes memory hexd = "0123456789abcdef";
        bytes memory o = new bytes(10);
        o[0] = "0"; o[1] = "x";
        for (uint256 i; i < 4; ++i) {
            o[2 + i * 2] = hexd[uint8(s[i]) >> 4];
            o[3 + i * 2] = hexd[uint8(s[i]) & 0x0f];
        }
        return string(o);
    }

    function _client() private pure returns (string memory) {
        return string.concat("<script>", KEY_JS, "</script>");
    }

    /*  ES5, textContent only, BigInt for every amount, no keccak — the
        selectors arrived in the config block above. The one act this page
        can build is `executeAsSession`, and it is always checked against
        `sessionAllows` first and always proposed before it is sent.     */
    string internal constant KEY_JS =
        "(function(){var el=document.getElementById('KEY');if(!el)return;"
        "var K=JSON.parse(el.textContent);"
        "var $=function(s){return document.getElementById(s)};"
        "var say=function(t){var s=document.getElementById('s');if(s)s.textContent=t};"
        "var pad=function(h){return h.replace(/^0x/,'').padStart(64,'0')};"
        "var pv=function(){return window.ethereum||null};"
        "var call=function(to,data){var p=pv();"
        "if(!p)return Promise.reject(new Error('no wallet in this browser'));"
        "return p.request({method:'eth_call',params:[{to:to,data:data},'latest']})};"
        "var allows=function(to,sel4){"
        "return call(K.reach,K.sel.allows+pad(K.key)+pad(to)+"
        "sel4.replace(/^0x/,'').padEnd(64,'0'))"
        ".then(function(r){return!!(r&&r!=='0x'&&BigInt(r)===1n)})};"
        "var chk=$('kchk');"
        "if(chk)chk.addEventListener('click',function(){"
        "var t=($('kt').value||'').trim(),s=($('ks').value||'').trim();"
        "if(!/^0x[0-9a-fA-F]{40}$/.test(t))return say('that is not an address');"
        "if(!/^0x[0-9a-fA-F]{8}$/.test(s))return say('a selector is 0x and eight hex digits');"
        "allows(t,s).then(function(ok){"
        "say(ok?'open: this key may call '+s+' on that target'"
        ":'refused: that door is not in the grant')})"
        ".catch(function(e){say(String(e&&e.message||e))})});"
        "var go=$('xgo');"
        "if(go)go.addEventListener('click',function(){"
        "var to=($('xt').value||'').trim(),v=($('xv').value||'0').trim(),"
        "d=($('xd').value||'0x').trim();"
        "if(!/^0x[0-9a-fA-F]{40}$/.test(to))return say('that is not an address');"
        "if(!/^\\d+$/.test(v))return say('value is wei, a whole number');"
        "if(!/^0x([0-9a-fA-F]{2})*$/.test(d))return say('calldata is 0x and whole bytes');"
        "var sel4=d.length>=10?d.slice(0,10):'0x00000000';"
        "allows(to,sel4).then(function(ok){"
        "if(!ok)return say('refused before proposing: '+sel4+' on that target is not in the grant');"
        "var body=pad(to)+pad('0x'+BigInt(v).toString(16))+"
        "pad('0x60')+pad('0x'+((d.length-2)/2).toString(16))+"
        "d.slice(2).padEnd(Math.ceil((d.length-2)/64)*64,'0');"
        "var slab=$('xslab');slab.textContent='';"
        "var line=function(k2,v2){var p=document.createElement('p');p.className='e';"
        "p.textContent=k2+': '+v2;slab.appendChild(p)};"
        "line('The account will call',to);"
        "line('Carrying',v+' wei');"
        "line('Function',sel4);"
        "var b=document.createElement('button');b.textContent='Sign and send';"
        "b.addEventListener('click',function(){"
        "var p=pv();if(!p)return say('no wallet in this browser');"
        "p.request({method:'eth_requestAccounts'}).then(function(a){"
        "if(!a||!a[0])throw new Error('the wallet refused');"
        "if(a[0].toLowerCase()!==K.key.toLowerCase())"
        "throw new Error('that wallet is '+a[0].slice(0,8)+'\\u2026, not this key');"
        "return p.request({method:'eth_sendTransaction',params:[{from:a[0],"
        "to:K.reach,data:K.sel.exec+body}]})})"
        ".then(function(h){say('sent \\u00b7 '+h.slice(0,10)+'\\u2026')})"
        ".catch(function(e){say(String(e&&e.message||e))})});"
        "slab.appendChild(b)})"
        ".catch(function(e){say(String(e&&e.message||e))})});"
        "})();";
}
