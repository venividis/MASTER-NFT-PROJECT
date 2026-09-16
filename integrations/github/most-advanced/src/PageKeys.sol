// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {IChrome, IDesk, IHub} from "./interfaces/Site.sol";

/*───────────────────────────────────────────────────────────────────────────
  PageKeys — handing something a bounded errand

  A session key is the only way to let a bot, a keeper or a model act on a
  token's Reach without handing over the token. The account bounds it four
  ways and checks all four on every call, so the interesting part of this
  page is not the button — it is the two lists, because both of them are
  read the opposite of how people expect.

  An empty list is not a wildcard. `sessionTarget` and `sessionSelector`
  are plain mappings, so an entry that was never written is `false`, and a
  grant with no selectors produces a key that cannot make one call. Every
  page that lets a person leave a field blank owes them that sentence in
  large type, so it is a `p.w` rather than a folded aside.

  The other trap is in the encoding rather than the semantics. `grantSession`
  takes two dynamic arrays, and an address is right-aligned in its word while
  a `bytes4` is left-aligned. Swap those and the transaction still succeeds:
  it grants a selector nobody chose, silently. So the encoder below is
  written out word by word with the reason beside it, rather than handed to
  a library the browser does not have.
───────────────────────────────────────────────────────────────────────────*/
contract PageKeys {
    IChrome public immutable CHROME;
    IDesk   public immutable DESK;
    IHub    public immutable HUB;

    constructor(IChrome chrome, IDesk desk, address hub) {
        CHROME = chrome;
        DESK = desk;
        HUB = IHub(hub);
    }

    /*═══════════════════ /keys ═══════════════════*/

    function keys() external view returns (string memory) {
        return string.concat(
            CHROME.head("IPSEITY \xc2\xb7 keys"),
            CHROME.navTop(13),
            "<h1>keys</h1>"
            "<p class=e>A session key is an address you hand a bounded errand to: it "
            "acts on a token&#39;s Reach without ever holding the token. Four bounds "
            "are checked on every call &mdash; an expiry it cannot extend, a target "
            "list it cannot widen, a selector list it cannot widen, and a cumulative "
            "spend cap it cannot raise &mdash; and the holder revokes it in one "
            "transaction, with no notice, no delay and no appeal.</p>",
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

    /*  Everything the client needs to build a call, derived here. `bare` is
        the one entry that is not hashed from a signature, because it is not
        a signature: `bytes4(0)` is what the account sees when calldata is
        shorter than four bytes, which is what a plain value transfer is. */
    function _config() private view returns (string memory) {
        return string.concat(
            "<script type=\"application/json\" id=\"K\">{",
            "\"hub\":\"", LibNum.hexAddr(address(HUB)),
            "\",\"bare\":\"0x00000000",
            "\",\"sel\":{",
            "\"account\":\"", _sel("account(uint256)"),
            "\",\"ownerOf\":\"", _sel("ownerOf(uint256)"),
            "\",\"grant\":\"",
                _sel("grantSession(address,uint64,uint128,address[],bytes4[])"),
            "\",\"revoke\":\"", _sel("revokeSession(address)"),
            "\",\"allows\":\"", _sel("sessionAllows(address,address,bytes4)"),
            "\",\"sessionOf\":\"", _sel("sessionOf(address)"),
            "\",\"current\":\"", _sel("sessionCurrent(address)"),
            "\",\"isSealed\":\"", _sel("isSealed()"),
            "\",\"maxList\":\"", _sel("MAX_LIST()"),
            "\",\"maxSession\":\"", _sel("MAX_SESSION()"),
            "\",\"approve\":\"", _sel("approve(address,uint256)"),
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

    function _card() private pure returns (string memory) {
        return string.concat(
            "<p class=w>An empty selector list permits <em>nothing</em>, not "
            "everything. A key granted no selectors cannot make a single call, and a "
            "bare value transfer is a call with no selector at all &mdash; so "
            "<code>bytes4(0)</code> has to be picked on purpose. The target list "
            "reads the same way: leave it blank and the key can reach no address "
            "whatsoever.</p>"
            "<p class=w>A session is never more trusted than whoever granted it. It "
            "goes through the same gauntlet the holder does, so a sealed Reach "
            "refuses a session key exactly as it refuses its owner &mdash; and a "
            "sealed Reach refuses value outright, which leaves the spend cap below "
            "dead weight until the seal lifts.</p>"
            "<p class=e>The two lists are checked independently, not as pairs: a key "
            "granted two targets and two selectors may use either selector on either "
            "target. Where that is wider than you meant, grant one key per pair "
            "&mdash; keys are free, storage is not. One exception is enforced for "
            "you: <code>approve</code> is refused unless the <em>spender</em> in its "
            "arguments is itself on the target list, because allowlisting a token "
            "contract says nothing about who is being trusted with it.</p>",
            _grant(),
            _check()
        );
    }

    function _grant() private pure returns (string memory) {
        return string.concat(
            "<div class=app>"
            "<div class=hd><b>Grant a key</b><span class=m id=kwho></span></div>"
            "<label>token</label>"
            "<input id=ktok placeholder=\"a number \xe2\x80\x94 whose Reach this key "
            "acts on\" inputmode=numeric>"
            "<div class=det id=kacct></div>"
            "<label>the key</label>"
            "<input id=kkey placeholder=\"0x\xe2\x80\xa6 the address that will act\">"
            "<div class=det id=kcur></div>"
            "<label>expires in <b id=kexl>24 hours</b> &mdash; <b id=kexd></b></label>"
            "<input type=range id=kexR min=1 max=720 value=24>"
            "<div class=fld><div class=lbl><span>spend cap</span>"
            "<span class=m>cumulative, over the whole session</span></div>"
            "<div class=row><input id=kcap placeholder=\"0.0\" inputmode=decimal>"
            "<span class=tk>ETH</span></div></div>"
            "<label>targets <span class=m>one address per line; blank allows "
            "nothing</span></label>"
            "<textarea id=ktgt placeholder=\"0x\xe2\x80\xa6&#10;0x\xe2\x80\xa6\">"
            "</textarea>"
            "<label>what it may call</label>"
            "<div id=kchips>", _chips("gsel"), "</div>"
            "<div id=kmore></div>"
            "<div class=row><input id=kraw placeholder=\"0x\xe2\x80\xa6 a 4-byte "
            "selector\"><button id=kadd>add</button></div>"
            "<p class=e>The box above wants a selector, not a signature, because "
            "this page carries no keccak &mdash; deliberately. Every selector in the "
            "chips was hashed on chain by the contract that served this page, so it "
            "is checkable against the ABI; one hashed in your browser would be "
            "checkable against nothing. Take the four bytes from the ABI, a block "
            "explorer, or <code>cast sig</code>.</p>"
            "<div class=det id=ksum></div>"
            "<button class=go id=kgo>Connect</button>"
            "<button id=krev>Revoke this key</button>"
            "</div>"
        );
    }

    function _check() private pure returns (string memory) {
        return string.concat(
            "<div class=app>"
            "<div class=hd><b>Does this key allow&hellip;</b></div>"
            "<p class=e>Asked of the account itself, not reasoned about here. It "
            "answers for the key as it stands right now &mdash; expiry, revocation "
            "and both lists at once &mdash; which is the question worth asking "
            "before you grant, and again after.</p>"
            "<label>key <span class=m>blank uses the one above</span></label>"
            "<input id=ck placeholder=\"0x\xe2\x80\xa6\">"
            "<label>calling</label>"
            "<input id=cto placeholder=\"0x\xe2\x80\xa6 the target contract\">"
            "<label>with selector</label>"
            "<input id=cs placeholder=\"0x00000000\">"
            "<div id=cchips>", _chips("csel"), "</div>"
            "<button class=go id=cgo>Ask the account</button>"
            "<div class=det id=cout></div>"
            "</div>"
        );
    }

    /*  The permissions offered as chips. Each carries the four bytes the
        account will actually compare against, hashed here rather than in the
        browser, and shows the signature it came from so the two can be read
        against each other.                                                  */
    function _chips(string memory cls) private pure returns (string memory) {
        return string.concat(
            _chipRaw(cls, "0x00000000", "bytes4(0) \xc2\xb7 bare value"),
            _chip(cls, "transfer(address,uint256)"),
            _chip(cls, "approve(address,uint256)"),
            _chip(cls, "swap(uint256,bool,uint256,uint256,address,uint256)"),
            _chip(cls, "deposit(uint256,uint256,uint256)"),
            _chip(cls, "withdraw(uint256,uint256,uint256,address)"),
            _chip(cls, "speak(uint256,uint256,uint8,bytes)"),
            _chip(cls, "claim(uint256)")
        );
    }

    function _chip(string memory cls, string memory sig)
        private pure returns (string memory)
    {
        return _chipRaw(cls, _sel(sig), sig);
    }

    function _chipRaw(string memory cls, string memory sel, string memory label)
        private pure returns (string memory)
    {
        return string.concat(
            "<button class=\"chip ", cls, "\" data-sel=\"", sel, "\">", label,
            "</button>"
        );
    }

    /*═══════════════════ the client ═══════════════════*/

    function _js() private pure returns (string memory) {
        return string.concat("<script>", KEYS_JS, "</script>");
    }

    string internal constant KEYS_JS =
        "(()=>{const I=window.IP;if(!I)return;const $=I.$;"
        "const E=document.getElementById('K');if(!E)return;"
        "const K=JSON.parse(E.textContent),S=K.sel;"
        "const HR=/^0x[0-9a-fA-F]{40}$/,SR=/^0x[0-9a-f]{8}$/;"
        /*  LIM starts at the account's documented MAX_LIST and is replaced by
            the account's own answer the moment a token resolves, so the page
            never insists on a bound the deployed code does not have.       */
        "let reach=null,LIM=16,extra=[],booted=false;"

        /*  A bytes4 argument, left-aligned: the four bytes first, then the
            padding. An address is the other way round — right-aligned, which
            is what I.AD does. Getting these backwards is the failure mode
            this page exists to prevent: the call still succeeds, and grants
            a selector nobody picked.                                       */
        "const L4=s=>String(s).replace(/^0x/,'').toLowerCase()"
        ".slice(0,8).padStart(8,'0')+'0'.repeat(56);"

        /*  The token, and the two addresses that decide everything: whose
            Reach this is, and who is allowed to sign for it.               */
        "const look=async()=>{reach=null;$('kacct').innerHTML='';"
        "const t=String($('ktok').value||'').trim();"
        "if(!/^[0-9]+$/.test(t)){sum();return}"
        "const a=await I.tryCall(K.hub,S.account+I.W(t));"
        "if(!a){$('kacct').innerHTML='<div><span class=w>no provider to ask</span>"
        "<b></b></div>';return}"
        "reach='0x'+String(a).slice(26,66);"
        "const o=await I.tryCall(K.hub,S.ownerOf+I.W(t));"
        "const ow=o?'0x'+String(o).slice(26,66):'';"
        "const ml=await I.tryCall(reach,S.maxList);if(ml)LIM=Number(I.word(ml,0));"
        "const ms=await I.tryCall(reach,S.maxSession);"
        "const sl=await I.tryCall(reach,S.isSealed);"
        "let h='<div><span>reach</span><b>'+reach+'</b></div>'"
        "+'<div><span>only this address may grant</span><b>'+ow+'</b></div>';"
        "if(ms)h+='<div><span>longest session the account will sign</span><b>'"
        "+Math.floor(Number(I.word(ms,0))/86400)+' days</b></div>';"
        "if(sl&&I.word(sl,0)===1n)h+='<div><span class=w>sealed</span>"
        "<b>value is refused outright, and every promised asset is measured</b></div>';"
        "const w=I.acct();"
        "$('kwho').textContent=w&&ow&&w.toLowerCase()!==ow.toLowerCase()"
        "?'not the holder':'';"
        "$('kacct').innerHTML=h;cur();sum()};"
        "$('ktok').addEventListener('change',look);"
        "$('ktok').addEventListener('input',look);"

        /*  What the key already is, before anything is changed. Re-granting
            overwrites the terms and resets what has been spent, so the terms
            standing now are worth reading first.                           */
        "const cur=async()=>{const e=$('kcur');if(!e)return;e.innerHTML='';"
        "const k=String($('kkey').value||'').trim();"
        "if(!reach||!HR.test(k))return;"
        "const r=await I.tryCall(reach,S.sessionOf+I.AD(k));if(!r)return;"
        "const ex=Number(I.word(r,0)),cp=I.word(r,1),sp=I.word(r,2),"
        "on=I.word(r,3)===1n;"
        "if(!on){e.innerHTML='<div><span>this key today</span><b>no session</b>"
        "</div>';return}"
        "const live=ex>=Math.floor(Date.now()/1000);"
        /*  A key can be unexpired and still dead: it retires when the token
            it spends from changes hands. Reading only the expiry would show
            a previous holder's key as live until its date, which is the
            reading that let one keep spending in the first place.       */
        "const cc=await I.tryCall(reach,S.current+I.AD(k));"
        "const now=!cc||I.word(cc,0)===1n;"
        "if(!now){e.innerHTML='<div><span class=w>this key was granted by a previous "
        "holder of this token and retired when it sold \\u2014 it can spend nothing</span>"
        "<b></b></div>';return}"
        "e.innerHTML='<div><span>this key today</span><b class='+(live?'ok':'w')+'>'"
        "+(live?'live until ':'expired ')"
        "+new Date(ex*1000).toISOString().slice(0,16).replace('T',' ')+' UTC</b></div>'"
        "+'<div><span>spent of its cap</span><b>'+I.fmt(sp,18,4)+' / '"
        "+I.fmt(cp,18,4)+' ETH</b></div>'};"
        "$('kkey').addEventListener('input',()=>{cur();sum()});"

        /*  The bar says a date out loud, because "720" reads like a number
            and a date reads like a decision. One hour to thirty days is this
            page's range, not the account's — the account's own ceiling is
            printed above, read from its own code.                          */
        "const when=()=>Math.floor(Date.now()/1000)+Number($('kexR').value)*3600;"
        "const show=()=>{const h=Number($('kexR').value);"
        "$('kexl').textContent=h<48?h+(h===1?' hour':' hours')"
        ":Math.round(h/24)+' days';"
        "$('kexd').textContent="
        "new Date(when()*1000).toISOString().slice(0,16).replace('T',' ')+' UTC';"
        "sum()};"
        "$('kexR').addEventListener('input',show);"

        /*  Newlines, commas or spaces — a list pasted from anywhere. */
        "const tgts=()=>String($('ktgt').value||'').split(/[\\s,]+/)"
        ".map(s=>s.trim()).filter(Boolean);"

        "const picks=()=>{const o=[];"
        "document.querySelectorAll('.gsel').forEach(c=>{"
        "if(c.className.indexOf(' on')>=0){const s=c.dataset.sel;"
        "if(o.indexOf(s)<0)o.push(s)}});"
        "extra.forEach(s=>{if(o.indexOf(s)<0)o.push(s)});return o};"
        "document.querySelectorAll('.gsel').forEach(c=>"
        "c.addEventListener('click',()=>{"
        "c.className=c.className.indexOf(' on')>=0?'chip gsel':'chip gsel on';"
        "sum()}));"

        /*  Pasted selectors live in an array rather than in attributes, so
            the page never has to write a data- attribute it might not be
            able to read back.                                              */
        "const more=()=>{$('kmore').innerHTML=extra.map((s,i)=>"
        "'<button class=chip data-i=\"'+i+'\">'+s+' \\u00d7</button>').join('');"
        "$('kmore').querySelectorAll('button').forEach(b=>"
        "b.addEventListener('click',()=>{"
        "extra.splice(Number(b.dataset.i),1);more();sum()}))};"
        "$('kadd').addEventListener('click',()=>{"
        "const v=String($('kraw').value||'').trim().toLowerCase();"
        "if(!SR.test(v)){I.say('a selector is 0x and eight hex characters \\u2014 "
        "this page cannot hash a signature for you','no');return}"
        "if(extra.indexOf(v)<0)extra.push(v);"
        "$('kraw').value='';more();sum()});"

        /*  A malformed cap must not break the running total, which redraws on
            every keystroke; it is refused in enc(), where refusing is useful. */
        "const capOf=()=>{try{return I.parse($('kcap').value||'0',18)}"
        "catch(e){return 0n}};"

        "const sum=()=>{const e=$('ksum');if(!e)return;"
        "const t=tgts(),p=picks();"
        "let h='<div><span>expires</span><b>'+$('kexd').textContent+'</b></div>'"
        "+'<div><span>may spend, in total</span><b>'+($('kcap').value||'0')"
        "+' ETH</b></div>'"
        "+'<div><span>targets</span><b>'+(t.length?t.length+' of '+LIM"
        ":'<span class=w>none \\u2014 nothing is reachable</span>')+'</b></div>'"
        "+'<div><span>may call</span><b>'+(p.length?p.length+' of '+LIM"
        ":'<span class=w>nothing \\u2014 not even a bare transfer</span>')"
        "+'</b></div>';"
        "if(p.indexOf(S.approve)>=0)h+='<div><span class=w>approve is picked</span>"
        "<b>the spender it approves must be on the target list too</b></div>';"
        "if(capOf()>0n&&p.indexOf(K.bare)<0)h+='<div><span class=w>a cap without "
        "bytes4(0)</span><b>value rides on a call, and bare value is the call whose "
        "selector is bytes4(0)</b></div>';"
        "e.innerHTML=h};"
        "$('kcap').addEventListener('input',sum);"
        "$('ktgt').addEventListener('input',sum);"

        /*  grantSession(address,uint64,uint128,address[],bytes4[])

            Five head words, in order: key, expires, spendCap, then an offset
            to each array. Offsets count from the start of the arguments, not
            from the start of the calldata, so the first is 5*32 = 160. The
            second clears the first tail: 160, plus its length word, plus one
            word per address.

            Each tail is a length word followed by its items. Addresses are
            right-aligned (I.AD); selectors are left-aligned (L4). That
            asymmetry is the whole risk in this function.                   */
        "const enc=()=>{"
        "const k=String($('kkey').value||'').trim();"
        "if(!HR.test(k))throw new Error('the key: an address for it to act as');"
        "if(k.toLowerCase()===String(reach).toLowerCase())"
        "throw new Error('a key cannot be the Reach itself \\u2014 its first act "
        "would be granting itself everything');"
        "const t=tgts(),p=picks();"
        "for(const a of t){if(!HR.test(a))throw new Error('not an address: '+a);"
        "if(a.toLowerCase()===String(reach).toLowerCase())"
        "throw new Error('the Reach cannot be its own target');}"
        "if(t.length>LIM||p.length>LIM)throw new Error(LIM+' at most in each list');"
        "const cap=I.parse($('kcap').value||'0',18);"
        "if(cap>=(1n<<128n))throw new Error('a cap that fits in 128 bits');"
        "let d=S.grant+I.AD(k)+I.W(when())+I.W(cap)"
        "+I.W(160)+I.W(192+32*t.length);"
        "d+=I.W(t.length);for(const a of t)d+=I.AD(a);"
        "d+=I.W(p.length);for(const s of p)d+=L4(s);"
        "return d};"

        "$('kgo').addEventListener('click',async()=>{try{await I.connect();"
        "if(!booted){booted=true;$('kgo').textContent='Grant this key';"
        "await look();I.say('connected \\u00b7 fill the card','ok');return}"
        "if(!reach)throw new Error('a token number first');"
        "const p=picks();"
        "if(!p.length)throw new Error('pick at least one selector \\u2014 a key with "
        "none can do nothing at all');"
        "if(!tgts().length)throw new Error('name at least one target \\u2014 a blank "
        "list reaches nothing');"
        "await I.send(reach,enc());await cur()}"
        "catch(x){I.say(String(x&&x.message||x),'no')}});"

        "$('krev').addEventListener('click',async()=>{try{await I.connect();"
        "if(!reach)throw new Error('a token number first');"
        "const k=String($('kkey').value||'').trim();"
        "if(!HR.test(k))throw new Error('the key to revoke');"
        "await I.send(reach,S.revoke+I.AD(k));await cur()}"
        "catch(x){I.say(String(x&&x.message||x),'no')}});"

        /*  The checker asks the account rather than reasoning here, so the
            answer folds in expiry and revocation as well as the two lists. */
        "document.querySelectorAll('.csel').forEach(c=>"
        "c.addEventListener('click',()=>{$('cs').value=c.dataset.sel}));"
        "$('cgo').addEventListener('click',async()=>{try{"
        "if(!reach)throw new Error('a token number first');"
        "let k=String($('ck').value||'').trim();"
        "if(!HR.test(k))k=String($('kkey').value||'').trim();"
        "if(!HR.test(k))throw new Error('which key');"
        "const to=String($('cto').value||'').trim();"
        "if(!HR.test(to))throw new Error('a target address');"
        "const s=String($('cs').value||'').trim().toLowerCase();"
        "if(!SR.test(s))throw new Error('a 4-byte selector');"
        "const r=await I.call(reach,S.allows+I.AD(k)+I.AD(to)+L4(s));"
        "const yes=I.word(r,0)===1n;"
        "$('cout').innerHTML='<div><span>'+(yes?'yes':'no')+'</span>"
        "<b class='+(yes?'ok':'no')+'>'+(yes?'this key may call that selector on that "
        "address, as of this block':'refused \\u2014 expired, revoked, or one of the "
        "two lists does not hold it')+'</b></div>'}"
        "catch(x){I.say(String(x&&x.message||x),'no')}});"

        "show();more();"
        "})();";
}
