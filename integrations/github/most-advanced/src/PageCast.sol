// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {IChrome, IDesk} from "./interfaces/Site.sol";

interface ISigilCast {
    function svg(uint256 id, uint256 word, bytes32 seed, uint32 strata)
        external pure returns (bytes memory);
    function solidName(uint8 form) external pure returns (string memory);
}

/*───────────────────────────────────────────────────────────────────────────
  PageCast — the projector, handed to everyone

  The contract that draws every token's still is `public pure`: hand it any
  section word and any seed and it turns sixteen 4-vectors through six
  Givens rotations and returns SVG. It never asks who you are or whether
  the word belongs to a token, which makes it a public good wearing a
  collection's name — and a public good deserves a door.

  This page is that door. Eight solids as chips, six planes on bars, the
  cut, the hue, the seed — and the picture, drawn by the chain each time
  you let go. The first picture is drawn by this contract during render,
  so the page arrives with the artwork already in it and works with
  JavaScript off; the bars need a provider only because the redraw is an
  eth_call, and the page says so instead of failing quietly.

  Nothing here mints, signs, or spends. It is the one page on the site
  with no wallet flow at all: the projector is free, and free means free.
───────────────────────────────────────────────────────────────────────────*/
contract PageCast {
    using LibNum for uint256;

    IChrome    public immutable CHROME;
    IDesk      public immutable DESK;
    ISigilCast public immutable SIGIL;

    /// @dev The pose the page opens with: a 24-cell mid-turn, cut just off
    ///      center, in the collection's gold. Chosen for beauty, admitted
    ///      as taste.
    uint256 public constant POSE =
        (uint256(0x2400) << 0) | (uint256(0x1100) << 16) | (uint256(0x0700) << 32) |
        (uint256(0x5200) << 48) | (uint256(0x1f00) << 64) | (uint256(0x0900) << 80) |
        (uint256(0x9200) << 96) | (uint256(2) << 112) | (uint256(0x2b) << 120);

    bytes32 public constant SEED = bytes32(uint256(1));

    constructor(IChrome chrome, IDesk desk, ISigilCast sigil) {
        CHROME = chrome;
        DESK = desk;
        SIGIL = sigil;
    }

    /*═══════════════════ /projector ═══════════════════*/

    function cast() external view returns (string memory) {
        return string.concat(
            CHROME.head("IPSEITY \xc2\xb7 projector"),
            CHROME.navTop(17),
            "<h1>projector</h1>"
            "<p class=e>The contract that renders every token's still is pure and "
            "public: any section word, any seed, and it answers with the picture. "
            "It does not check who is asking or whether the word belongs to a "
            "token, so it is a public good rather than a feature \xe2\x80\x94 a 4-D "
            "renderer that happens to live inside an NFT collection. Nothing on "
            "this page can spend anything; there is nothing here to sign.</p>",
            _config(),
            _studio(),
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
            "<script type=\"application/json\" id=\"J\">{",
            "\"sigil\":\"", LibNum.hexAddr(address(SIGIL)),
            "\",\"pose\":\"", POSE.str(),
            "\",\"sel\":{\"svg\":\"", _sel("svg(uint256,uint256,bytes32,uint32)"),
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

    /*═══════════════════ the studio ═══════════════════*/

    function _studio() private view returns (string memory) {
        return string.concat(
            "<div class=cast>"
            "<figure id=stage>", string(SIGIL.svg(0, POSE, SEED, 6)), "</figure>",
            _controls(),
            "</div>"
            "<p class=e>The first picture above was drawn by this page's own render, "
            "so it is here with JavaScript off. Moving a bar redraws through an "
            "<code>eth_call</code> \xe2\x80\x94 your node runs the projector and "
            "returns the picture \xe2\x80\x94 which needs any wallet's RPC to be "
            "present; nothing is ever signed.</p>"
        );
    }

    function _controls() private view returns (string memory) {
        string memory chips;
        for (uint256 f; f < 8; ++f) {
            chips = string.concat(chips,
                "<button class=\"chip cf", f == 2 ? " on" : "", "\" data-f=\"",
                f.str(), "\">",
                SIGIL.solidName(uint8(f)), "</button>");
        }
        return string.concat(
            "<div class=deck>"
            "<label>the solid</label><div id=forms>", chips, "</div>",
            _bars(),
            "<label>seed <span class=m>any 32 bytes; a different universe, same "
            "pose</span></label><input id=cseed value=\"0x1\">"
            "</div>"
        );
    }

    /// @dev Six planes, the cut, the hue, the strata — every number the
    ///      word carries, each on its own bar.
    function _bars() private pure returns (string memory) {
        string[6] memory planes = ["xy", "xz", "yz", "xw", "yw", "zw"];
        uint16[6] memory at = [uint16(0x2400), 0x1100, 0x0700, 0x5200, 0x1f00, 0x0900];
        string memory out;
        for (uint256 i; i < 6; ++i) {
            out = string.concat(out,
                "<label>", planes[i], i > 2 ? " \xc2\xb7 through w" : "",
                "</label><input type=range class=turn data-i=\"", i.str(),
                "\" min=0 max=65535 value=\"", uint256(at[i]).str(), "\">");
        }
        return string.concat(out,
            "<label>the cut \xc2\xb7 w</label>"
            "<input type=range id=cw min=0 max=65535 value=\"37376\">"
            "<label>hue</label>"
            "<input type=range id=chue min=0 max=255 value=\"43\">"
            "<label>strata</label>"
            "<input type=range id=cstr min=1 max=12 value=\"6\">"
        );
    }

    /*═══════════════════ the client ═══════════════════*/

    function _js() private pure returns (string memory) {
        return string.concat("<script>", CAST_JS, "</script>");
    }

    string internal constant CAST_JS =
        "(()=>{const I=window.IP;if(!I)return;const $=I.$;"
        "const E=document.getElementById('J');if(!E)return;"
        "const J=JSON.parse(E.textContent);"
        "let F=2;"
        "const word=()=>{let w=0n;"
        "document.querySelectorAll('.turn').forEach(r=>{"
        "w|=BigInt(r.value&65535)<<(16n*BigInt(r.dataset.i))});"
        "w|=BigInt($('cw').value&65535)<<96n;"
        "w|=BigInt(F%8)<<112n;"
        "w|=BigInt($('chue').value&255)<<120n;return w};"
        "const seed=()=>{let s=String($('cseed').value||'0x1').trim();"
        "if(!/^0x[0-9a-fA-F]{1,64}$/.test(s))s='0x1';"
        "return s.slice(2).padStart(64,'0')};"

        /*  The redraw. Debounced, because a bar mid-drag is thirty calls a
            second and the picture only matters where the hand rests.     */
        "let t=null,busy=false;"
        "const draw=async()=>{if(busy)return;busy=true;try{"
        "const d=J.sel.svg+I.W(0)+I.W(word())+seed()+I.W(Number($('cstr').value));"
        "const r=await I.tryCall(J.sigil,d,30000000);"
        "if(!r){I.say('no provider to draw through \\u2014 the picture above is "
        "the last one drawn','no');return}"
        "const h=String(r).slice(2);"
        "const off=Number(BigInt('0x'+h.slice(0,64)))*2;"
        "const len=Number(BigInt('0x'+h.slice(off,off+64)))*2;"
        "let sv='';const b=h.slice(off+64,off+64+len);"
        "for(let i=0;i<b.length;i+=2)sv+=String.fromCharCode(parseInt(b.substr(i,2),16));"
        /*  The projector's own output, from the collection's own pure
            code — the one producer this site lets write markup.        */
        "$('stage').innerHTML=sv;"
        "}finally{busy=false}};"
        "const poke=()=>{clearTimeout(t);t=setTimeout(draw,220)};"

        "document.querySelectorAll('.turn').forEach(r=>r.addEventListener('input',poke));"
        "['cw','chue','cstr'].forEach(i=>$(i).addEventListener('input',poke));"
        "$('cseed').addEventListener('input',poke);"
        "document.querySelectorAll('.cf').forEach(c=>"
        "c.addEventListener('click',()=>{F=Number(c.dataset.f);"
        "document.querySelectorAll('.cf').forEach(x=>{x.className='chip cf'});"
        "c.className='chip cf on';poke()}));"
        "})();";
}
