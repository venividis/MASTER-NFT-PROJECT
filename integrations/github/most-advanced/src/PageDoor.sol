// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {Web} from "./lib/Web.sol";
import {Section} from "./lib/Types.sol";
import {IHub, IChrome, IDesk, IParley, ITalkDesk} from "./interfaces/Site.sol";

/*───────────────────────────────────────────────────────────────────────────
  PageDoor — the front of the site, and the way in

  This is the one page whose job is not to tell you something. It is to let
  you in: connect a wallet, and if it holds one of these tokens the page
  hands you that token's instrument, that token's counter, and that token's
  messages, and the composer boxes on every other page stop being decorative.

  ── the honest shape of the gate ──

  Nothing here is hidden from anyone. The conversation below loads before a
  wallet is connected and would load with the wallet uninstalled; every byte
  of it is a log on a public chain and there is no version of this that is
  otherwise. What holding a token actually buys is the right to *write* —
  and that is enforced in `Parley`, in a contract, where enforcement means
  something, rather than in a page, where it would mean a CSS class.

  So the gate on this page is a courtesy: it stops showing you a composer
  you cannot use. It is not a lock, it is never described as one, and a page
  that claimed otherwise would be lying about a chain to the person standing
  on it.
───────────────────────────────────────────────────────────────────────────*/
interface IRoomsDesk { function core() external pure returns (string memory); }

interface ITermDesk {
    function config() external view returns (string memory);
    function core() external pure returns (string memory);
}

contract PageDoor {
    using LibNum for uint256;
    using Section for uint256;

    IHub        public immutable HUB;
    IChrome     public immutable CHROME;
    IDesk       public immutable DESK;
    ITalkDesk   public immutable TALK;
    IParley     public immutable PARLEY;
    ITermDesk   public immutable TERM;
    IRoomsDesk  public immutable ROOMS;
    IRoomsDesk  public immutable WILL;

    constructor(IHub hub, IChrome chrome, IDesk desk, ITalkDesk talk,
                IParley parley, ITermDesk term, IRoomsDesk rooms,
                IRoomsDesk will_) {
        HUB = hub;
        CHROME = chrome;
        DESK = desk;
        TALK = talk;
        PARLEY = parley;
        TERM = term;
        ROOMS = rooms;
        WILL = will_;
    }

    function door() external view returns (string memory) {
        uint256 supply = HUB.totalSupply();
        (, uint64 said,,,,,,,) = PARLEY.stateOf(0);

        /*  Three halves, because one concat of everything is past what
            even viaIR keeps on the stack — the same wall Premises hit at
            seventeen constructor arguments, met here at about as many
            parts. The split is by role: what the page says, what it
            reports, and the scripts that make it act.                   */
        return string.concat(_top(), _talk(said), _chains(), _facts(supply),
                             _roll(supply), _scripts());
    }

    function _top() private view returns (string memory) {
        return string.concat(
            CHROME.head("IPSEITY"),
            CHROME.navTop(0),
            "<h1>IPSEITY</h1>"
            "<p>ipseity, n. &mdash; the property of being oneself; selfhood as "
            "distinct from any of its appearances.</p>"
            "<p>A four-dimensional solid, and the instrument for turning it, are the same "
            "token. What a holder sees is a three-dimensional section of a 4-polytope: the "
            "solid is never on screen, only the 3-space that currently cuts through it. "
            "Every token returns its own control surface from <code>tokenURI</code> "
            "&mdash; a WebGL2 engine, a keccak-256, an ABI coder and a wallet client, held "
            "in this chain's state as contract bytecode. Nothing is fetched, including by "
            "this page.</p>",
            /*  The ways in — see _ways. There used to be a rotating gold
                tesseract here; the console's specification called it the
                symptom and deleted it from that design, and this page has
                caught up with its own design.                            */
            _ways(),
            DESK.bare(),
            TALK.config(0, 0, 0),
            /*  The voice: the same terminal an agent drives, on the door
                itself. `help` lists every word; `go <door>` walks.       */
            "<h2>speak</h2>"
            "<div id=tout class=\"term tdoor\" aria-live=polite></div>"
            "<input id=tin class=tinput autocomplete=off spellcheck=false "
            "placeholder=\"help \xc2\xb7 go swap \xc2\xb7 mint \xc2\xb7 say \xe2\x80\xa6\" "
            "aria-label=\"terminal input\">",
            TERM.config(),
            _enter()
        );
    }

    /*  No status line of this page's own: `foot()` already carries one,
        and two elements with one id meant the second was inert — the
        classic duplicate nobody notices because the first one answers. */
    function _scripts() private view returns (string memory) {
        return string.concat(
            CHROME.wallet(),
            DESK.core(),
            TERM.core(),
            ROOMS.core(),
            WILL.core(),
            TALK.core(),
            TALK.door(),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    /*═══════════════════ the way in ═══════════════════*/

    /// @dev The door map, rendered once and read twice. Each row names the
    ///      task in a person's words, links the route, and defines the one
    ///      word of house vocabulary it depends on — because "the Reach",
    ///      "the commons" and "a token's own market" were being used on
    ///      this page before anything said what they meant. The script at
    ///      the end derives `window.DOORS` from these anchors, so the list
    ///      a program enumerates is the identical list a person read; the
    ///      predecessor kept three hand-written copies of the door map (a
    ///      canvas tesseract, the nav, the terminal's `go` table) and they
    ///      had already drifted — `go estate` failed while the nav offered
    ///      it. The tesseract itself — a 2-D gold cartoon of the artwork,
    ///      mouse-only, unreachable by keyboard or thumb — was called the
    ///      symptom by the console's specification and deleted there;
    ///      this page has caught up with its own design.
    function _ways() private view returns (string memory) {
        /*  Its own supply read, deliberately: threading `supply` from
            `door()` through a third call was the three slots that pushed
            the whole page past what viaIR keeps on the stack.           */
        uint256 supply = HUB.totalSupply();
        return string.concat(
            "<h2 id=ways-h>ways in</h2><ul id=ways class=r>"
            "<li><a data-w=see href=\"/gallery\">SEE THEM</a> &mdash; every token issued "
            "on this chain, drawn by the chain itself.</li>"
            "<li><a data-w=console href=\"", supply == 0 ? "/door" : "/c/1",
            "\">OPEN A CONSOLE</a> &mdash; one plain control room per token: turn it, "
            "hold, trade, hand on, speak, make, look. Yours once you connect; anyone "
            "may read.</li>"
            "<li><a data-w=talk href=\"/chat\">TALK</a> &mdash; the commons, the one room "
            "every token is already in. Messages are logs on this chain; there is no "
            "server and nothing is ever deleted.</li>"
            "<li><a data-w=trade href=\"/open\">TRADE A TOKEN</a> &mdash; each token runs "
            "its own two-asset market, and this lists the ones open for business. "
            "Fees go to the token.</li>"
            "<li><a data-w=swap href=\"/swap\">SWAP COINS</a> &mdash; this chain&#39;s "
            "Uniswap, for any pair. Separate from a token&#39;s own market on purpose: "
            "who is paid the fee should never be a surprise.</li>"
            "<li><a data-w=launch href=\"/launch\">LAUNCH A COIN</a> &mdash; a fixed-supply "
            "coin with no owner and no levers, minted to you, from any token you hold.</li>"
            "<li><a data-w=lock href=\"/lock\">LOCK VALUE</a> &mdash; time-lock any coin, "
            "or pay into a token&#39;s Grip: the vault whose bytecode has no way out.</li>"
            "<li><a data-w=terminal href=\"/terminal\">THE TERMINAL</a> &mdash; every "
            "function of the site as typed words. The same words an agent drives.</li>"
            "<li><a data-w=keys href=\"/keys\">GRANT A KEY</a> &mdash; hand a bot or a "
            "model a bounded session key: what it may call, on what, up to how much, "
            "until when.</li>"
            "<li><a data-w=program href=\"/services.json\">FOR A PROGRAM</a> &mdash; the "
            "same shopfront as machine-readable JSON, selectors included.</li>"
            "</ul>"
            /*  One source: the data IS the DOM. A program that wants the
                door list reads window.DOORS; a person reads the same rows;
                neither can drift from the other because neither is a copy. */
            "<script>window.DOORS=[].slice.call("
            "document.querySelectorAll('[data-w]')).map(function(a){"
            "return{word:a.dataset.w,path:a.getAttribute('href')}})</script>"
        );
    }

    function _enter() private view returns (string memory) {
        return string.concat(
            "<h2>what you hold</h2>"
            "<div class=gate>"
            "<h3>Connect</h3>"
            "<p>This page reads <code>balanceOf</code> and then walks "
            "<code>tokenOfOwnerByIndex</code>, so it learns which tokens are yours from "
            "the collection rather than from a list somebody keeps. Nothing is sent "
            "anywhere; the only thing that leaves your browser is an <code>eth_call</code> "
            "to your own node. If your wallet answers from another chain, the buttons "
            "under <b>chains</b> below move it here.</p>"
            "<button id=go>connect</button> ",
            _mintButton(),
            "</div>"
            "<div id=yours></div>"
            "<div id=rig></div>"
            "<p class=e>Opening the instrument here costs your node a 21M gas "
            "<code>eth_call</code> &mdash; the whole document comes back in one read. It "
            "happens when you ask for it and never on arrival.</p>"
        );
    }

    /*  The mint, at the door, at last. The price was already on this page
        and the terminal always had the word; what was missing was a button
        where a newcomer stands. It runs the terminal's own `mint` — one
        code path for the person and the agent, which is the rule that
        keeps them honest — so everything the terminal checks and prints,
        this checks and prints. Its own function because the price read
        inside the page's main concat is what pushed the build past the
        stack, which is the same wall `_band` documents below.           */
    function _mintButton() private view returns (string memory) {
        return string.concat(
            "<button id=mint1>mint the next one \xc2\xb7 ",
            Web.amount(HUB.price(), 18, 4),
            " ETH</button>"
            "<script>(function(){var b=document.getElementById('mint1');"
            "if(b)b.addEventListener('click',function(){"
            "if(window.TERM)window.TERM.run('mint');})})()</script>"
        );
    }

    /*═══════════════════ the chains ═══════════════════*/

    /// @dev Multichain, honestly: this same contract deploys at the same
    ///      address on every chain the deployer's nonce sequence visits,
    ///      each serving its own chain's assets and its own conversation.
    ///      Nothing crosses. Moving value between chains is a bridge's job
    ///      and deliberately outside this site — a page that quietly wrapped
    ///      one would be a custodian pretending to be a hyperlink. The
    ///      buttons switch the WALLET (EIP-3326, adding the chain first if
    ///      it is missing, EIP-3085); the site you are reading stays put.
    function _chains() private view returns (string memory) {
        return string.concat(
            "<h2>chains</h2>"
            "<p class=e>This page is chain <b>", block.chainid == 1 ? "Ethereum" :
                block.chainid == 8453 ? "Base" :
                block.chainid == 84532 ? "Base Sepolia" :
                block.chainid == 11155111 ? "Ethereum Sepolia" : "another chain",
            "</b>. The same site deploys per chain; each trades its own chain's "
            "assets and holds its own conversation. These buttons move your "
            "<i>wallet</i>; moving <i>value</i> between chains is a bridge's job, "
            "and this site will never quietly be one.</p>"
            /*  All five chains of the edition, and the two rehearsal
                chains — the previous list stopped at four and rendered the
                fifth band's home as "another chain", which is a poor name
                for a fifth of the collection.                            */
            "<p>"
            "<button class=ch2 data-id=\"0x1\" data-n=\"Ethereum\" "
            "data-r=\"https://ethereum-rpc.publicnode.com\" data-s=\"ETH\">Ethereum</button>"
            "<button class=ch2 data-id=\"0x2105\" data-n=\"Base\" "
            "data-r=\"https://mainnet.base.org\" data-s=\"ETH\">Base</button>"
            "<button class=ch2 data-id=\"0x82\" data-n=\"Unichain\" "
            "data-r=\"https://mainnet.unichain.org\" data-s=\"ETH\">Unichain</button>"
            "<button class=ch2 data-id=\"0x38\" data-n=\"BNB\" "
            "data-r=\"https://bsc-dataseed.bnbchain.org\" data-s=\"BNB\">BNB</button>"
            "<button class=ch2 data-id=\"0x1237\" data-n=\"Robinhood\" "
            "data-r=\"https://rpc.mainnet.chain.robinhood.com\" data-s=\"ETH\">Robinhood</button>"
            "<button class=ch2 data-id=\"0x14a34\" data-n=\"Base Sepolia\" "
            "data-r=\"https://sepolia.base.org\" data-s=\"ETH\">Base Sepolia</button>"
            "<button class=ch2 data-id=\"0xaa36a7\" data-n=\"Sepolia\" "
            "data-r=\"https://ethereum-sepolia-rpc.publicnode.com\" data-s=\"ETH\">Sepolia</button>"
            "</p>"
            "<script>(()=>{const I=window.IP;"
            "document.querySelectorAll('.ch2').forEach(b=>b.addEventListener('click',async()=>{"
            "try{const p=I.pv();if(!p)throw new Error('no wallet found');"
            "try{await p.request({method:'wallet_switchEthereumChain',"
            "params:[{chainId:b.dataset.id}]})}"
            "catch(e){if(e&&(e.code===4902||/unrecognized|not added/i.test(String(e.message)))){"
            "await p.request({method:'wallet_addEthereumChain',params:[{chainId:b.dataset.id,"
            "chainName:b.dataset.n,rpcUrls:[b.dataset.r],"
            "nativeCurrency:{name:b.dataset.s,symbol:b.dataset.s,decimals:18}}]})}else throw e}"
            "I.say('wallet is on '+b.dataset.n+' \\u2014 open that chain\\u2019s site to act there','ok')}"
            "catch(e){I.say(String(e&&e.message||e),'no')}}))})()</script>"
        );
    }

    /*═══════════════════ the commons, already running ═══════════════════*/

    function _talk(uint64 said) private view returns (string memory) {
        return string.concat(
            "<h2>the tokens are talking to each other</h2>"
            "<p>Every token in this collection is in one room together, can found groups, "
            "and can write to any other token one to one. A message is a log, the log is "
            "the archive, and the archive is wherever this chain is. There is no server "
            "to switch off and nothing to keep.</p>"
            "<p class=e><b>", uint256(said).str(), "</b> messages in the commons \xc2\xb7 <b>",
            PARLEY.groups().str(), "</b> groups founded. What is below is the commons "
            "itself, loading from the chain right now.</p>"
            "<div id=log></div>"
            "<p><a class=g href=\"/chat\">say something &rarr;</a>"
            "<a class=g href=\"/rooms\">the groups &rarr;</a></p>"
        );
    }

    /*═══════════════════ what else a token does ═══════════════════*/

    function _facts(uint256 supply) private view returns (string memory) {
        return string.concat(
            "<h2>each one is also a business</h2>"
            "<p>A token here is not only something to look at and not only somewhere to "
            "talk. It runs an exchange, holds a vault that cannot be emptied, rents "
            "itself out by the day, and draws any four-dimensional form you hand it. "
            "Those are open to anybody &mdash; you do not have to own one to use one, "
            "and what you pay goes to the token.</p>"
            "<table><tr><th>service</th><th>what a stranger may do</th><th>who is paid</th></tr>"
            "<tr><td>speak</td><td>read every room; write to any of them as a token you "
            "hold</td><td>nobody &mdash; it is gas and nothing else</td></tr>"
            "<tr><td>trade</td><td>swap against the token's own two-asset market</td>"
            "<td>the token, as a fee</td></tr>"
            "<tr><td>rent</td><td>operate the instrument by the day &mdash; turn the solid, "
            "commit orientations &mdash; but never sell it</td><td>the token, as rent</td></tr>"
            "<tr><td>give</td><td>pay into a vault with no spend function in its bytecode</td>"
            "<td>the token, permanently</td></tr>"
            "<tr><td>draw</td><td>call the on-chain 4D projector with any word and any seed"
            "</td><td>nobody &mdash; it is free</td></tr>"
            "<tr><td>verify</td><td>check a signature the token made as itself</td>"
            "<td>nobody &mdash; it is free</td></tr></table>"
            "<dl><dt>issued here</dt><dd>", _band(supply), "</dd>"
            "<dt>mint price</dt><dd>", Web.amount(HUB.price(), 18, 4), " ETH</dd>"
            "<dt>collection</dt><dd><code>", LibNum.hexAddr(address(HUB)), "</code></dd>"
            "<dt>parley</dt><dd><code>", LibNum.hexAddr(address(PARLEY)), "</code></dd></dl>"
            "<p><a class=g href=\"/open\">which tokens are open for business &rarr;</a>"
            "<a class=g href=\"/services.json\">the same thing, for a program &rarr;</a></p>"
        );
    }

    function _roll(uint256 supply) private view returns (string memory out) {
        if (supply == 0) return "<p class=e>None issued yet.</p>";
        uint256 from = supply > 12 ? supply - 11 : 1;
        out = "<h2>most recent</h2><ul class=r>";
        for (uint256 id = supply; id >= from; --id) {
            out = string.concat(
                out,
                "<li><a href=\"/token/", id.str(), "\">#", id.str(), "</a> ",
                "<span class=m>", _form(HUB.sectionOf(id).form()), "</span> ",
                "<a class=b href=\"/dm/", id.str(), "\">message</a></li>"
            );
            if (id == 1) break;
        }
        return string.concat(out, "</ul>");
    }

    function _form(uint8 f) private pure returns (string memory) {
        if (f == 0) return "Tesseract";
        if (f == 1) return "Hexadecachoron";
        if (f == 2) return "Icositetrachoron";
        if (f == 3) return "Duocylinder";
        if (f == 4) return "Clifford torus";
        if (f == 5) return "Tiger";
        if (f == 6) return "Ditorus";
        return "Quaternion Julia";
    }
    /*  Two numbers, because either alone misleads. This chain may issue a
        band of the edition and nothing outside it, so "3 of 1024" is true
        here and silent about the collection, while "of 4096" is the
        collection and silent about what is left to mint here.

        In its own function because six reads inside the page's single
        `string.concat` put it past what even viaIR keeps on the stack —
        the same wall the premises hit at seventeen constructor arguments. */
    function _band(uint256 supply) private view returns (string memory) {
        return string.concat(
            supply.str(), " of ", HUB.MAX_SUPPLY().str(),
            " \xe2\x80\x94 this chain holds #", HUB.FIRST_ID().str(),
            "\xe2\x80\x93#", HUB.LAST_ID().str(),
            " of ", HUB.COLLECTION().str(), " across every chain"
        );
    }

}
