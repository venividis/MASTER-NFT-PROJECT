// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";

/*───────────────────────────────────────────────────────────────────────────
  Chrome — the parts of the site that are the same on every page

  Five contracts render pages, and EIP-170 is why there are five rather than
  one. Left to themselves each would carry its own copy of the stylesheet
  and its own copy of the wallet client, which wastes the bytes twice over:
  once in code size, and once when the copies drift and the site stops
  looking like one site. So the shell lives here and the pages call it.

  The application itself lives in `Desk.sol`, which outgrew this contract
  the moment the pages stopped being reference sheets and started being
  something a person could use. This holds what every page looks like: the
  stylesheet, the navigation, and the footer.
───────────────────────────────────────────────────────────────────────────*/
contract Chrome {
    using LibNum for uint256;

    /*═══════════════════ the shell ═══════════════════*/

    function head(string memory title) external pure returns (string memory) {
        return string.concat(
            "<!doctype html><meta charset=utf-8>"
            "<meta name=viewport content=\"width=device-width,initial-scale=1\">"
            "<title>", title, "</title><style>", CSS, "</style>"
        );
    }

    string internal constant CSS =
        ":root{color-scheme:dark}"
        "body{background:radial-gradient(60rem 42rem at 50% -12rem,#191024 0%,rgba(3,2,6,0) 62%),"
        "radial-gradient(70rem 46rem at 50% 115%,#140e18 0%,rgba(3,2,6,0) 55%),#030206;"
        "color:#ddd6c6;font:16px/1.72 \"Iowan Old Style\",\"Palatino Linotype\",Palatino,Georgia,serif;"
        "max-width:60rem;margin:0 auto;padding:2.6rem 1.5rem 7rem}"
        "h1{font:200 2.1rem/1.15 \"Bodoni 72\",Didot,\"Didot LT STD\",Georgia,serif;"
        "letter-spacing:.5em;text-transform:uppercase;text-align:center;margin:1.2rem 0 .4rem;"
        "color:#f4dda6;text-shadow:0 0 34px rgba(224,193,132,.35)}"
        "h2{font-weight:400;letter-spacing:.34em;font-size:.72rem;text-transform:uppercase;"
        "color:#b39a5e;margin:3rem 0 .9rem}"
        "h3{font-weight:500;font-size:1rem;margin:1.6rem 0 .4rem;color:#e9e2d0}"
        "a{color:#e0c184}.b{text-decoration:none;color:#8a8375}"
        ".g{display:inline-block;border:1px solid #453a1f;border-radius:.4rem;"
        "padding:.5rem .9rem;text-decoration:none;margin:0 .4rem .6rem 0}"
        ".e{color:#8a8375;font-size:.92rem}"
        ".w{color:#e0a37f}.ok{color:#a9d9a0}.no{color:#e08a8a}"
        "code{font:12.5px ui-monospace,monospace;color:#b3a98e;overflow-wrap:anywhere}"
        "dl{display:grid;grid-template-columns:9.5rem 1fr;gap:.35rem 1rem;margin:1.4rem 0}"
        "dt{color:#6e6759;font-size:.82rem;letter-spacing:.1em;text-transform:uppercase}"
        "dd{margin:0}"
        "ul.r{list-style:none;padding:0;display:grid;"
        "grid-template-columns:repeat(auto-fill,minmax(11rem,1fr));gap:.5rem}"
        "ul.r li{border:1px solid #282112;border-radius:.4rem;padding:.6rem .8rem}"
        ".m{color:#6e6759;font-size:.8rem;display:block}"
        "iframe,img{width:100%;max-width:38rem;aspect-ratio:1;border:1px solid #282112;"
        "border-radius:.5rem;background:#000;display:block}"
        "nav{display:flex;flex-wrap:wrap;justify-content:center;gap:1.35rem;"
        "margin:.3rem 0 2.4rem;border:0;padding:0}"
        "nav a{font:12px ui-sans-serif,system-ui,sans-serif;letter-spacing:.3em;"
        "text-transform:uppercase;text-decoration:none;color:#8a8375;padding:.3rem 0;"
        "border-bottom:1px solid transparent;transition:color .25s,border-color .25s}"
        "nav a:hover{color:#e0c184}"
        "nav a.on{background:none;color:#f4dda6;border-bottom-color:#8a6f3a}"
        ".card{border:1px solid #282112;border-radius:.55rem;padding:1.1rem 1.2rem;margin:.9rem 0}"
        ".card h3{margin-top:0}"
        "table{border-collapse:collapse;width:100%;font-size:.9rem;margin:1rem 0}"
        "th{text-align:left;color:#6e6759;font-weight:500;font-size:.78rem;"
        "letter-spacing:.1em;text-transform:uppercase;padding:.4rem .6rem .4rem 0}"
        "td{padding:.4rem .6rem .4rem 0;border-top:1px solid #211b10}"
        "input{background:#0c0906;border:1px solid #352c17;border-radius:.35rem;color:#e9e2d0;"
        "font:13px ui-monospace,monospace;padding:.45rem .6rem;width:100%;max-width:22rem}"
        "select{background:#0f0c07;border:1px solid #352c17;border-radius:.5rem;"
        "color:#f4eede;font:15px ui-sans-serif,system-ui,sans-serif;padding:.55rem .7rem;"
        "width:100%;margin-top:.15rem}"
        "select:focus{outline:none;border-color:#5e4e28}"
        "label{display:block;color:#6e6759;font-size:.78rem;letter-spacing:.08em;"
        "text-transform:uppercase;margin:.7rem 0 .25rem}"
        "button{background:none;border:1px solid #453a1f;border-radius:2rem;color:#e0c184;"
        "font:11.5px ui-sans-serif,system-ui,sans-serif;letter-spacing:.22em;"
        "text-transform:uppercase;padding:.55rem 1.2rem;cursor:pointer;margin:.8rem .4rem 0 0;"
        "transition:all .25s}"
        "button:hover{background:rgba(224,193,132,.1);border-color:#8a6f3a;color:#f4dda6}"
        "#s{margin-top:.9rem;font:12.5px ui-monospace,monospace;color:#8a8375;"
        "overflow-wrap:anywhere;min-height:1.2em}"
        /*  the exchange card. One column, wide fields, the button doing the
            talking — the shape every exchange on the web has converged on,
            because it is the one where a person can see what they are about
            to sign without reading a paragraph first.                     */
        ".app{max-width:29rem;margin:0 auto;border:1px solid #2b2314;border-radius:1.3rem;"
        "padding:1.15rem;background:linear-gradient(180deg,rgba(15,12,7,.92),rgba(8,6,4,.92));"
        "box-shadow:0 24px 70px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,244,214,.04)}"
        ".hd{display:flex;align-items:center;justify-content:space-between;"
        "margin:.1rem .3rem .8rem}"
        ".hd b{font-weight:500;letter-spacing:.1em;text-transform:uppercase;font-size:.82rem;"
        "color:#efe8d8}"
        ".ico{background:none;border:0;color:#6e6759;cursor:pointer;font-size:.78rem;"
        "letter-spacing:.08em;text-transform:uppercase;margin:0;padding:.3rem}"
        ".ico:hover{color:#efe8d8;background:none}"
        ".fld{background:#0f0c07;border:1px solid #282112;border-radius:.8rem;"
        "padding:.75rem .9rem;margin:.35rem 0}"
        ".fld:focus-within{border-color:#5e4e28}"
        ".lbl{display:flex;justify-content:space-between;color:#6e6759;font-size:.76rem;"
        "letter-spacing:.06em;margin-bottom:.35rem;text-transform:none}"
        ".row{display:flex;align-items:center;gap:.5rem}"
        ".row input{background:none;border:0;padding:0;font:400 1.55rem/1.2 "
        "ui-sans-serif,system-ui,sans-serif;color:#f4eede;max-width:none;flex:1;min-width:0}"
        ".row input:focus{outline:none}"
        ".row input::placeholder{color:#4a4334}"
        ".tk{background:#171208;border:1px solid #352c17;border-radius:2rem;"
        "padding:.32rem .8rem;font-size:.9rem;color:#e9e2d0;white-space:nowrap;"
        "max-width:9rem;overflow:hidden;text-overflow:ellipsis}"
        ".mx{background:none;border:0;color:#e0c184;font-size:.72rem;letter-spacing:.08em;"
        "cursor:pointer;margin:0;padding:.2rem .35rem}"
        ".mx:hover{background:none;color:#f4dda6}"
        ".flip{display:block;margin:-.7rem auto;position:relative;z-index:1;"
        "width:2rem;height:2rem;padding:0;border-radius:.6rem;background:#171208;"
        "border:1px solid #352c17;color:#b3a98e;line-height:1}"
        ".det{margin:.7rem .3rem .2rem;font-size:.83rem;color:#8a8375}"
        ".det div{display:flex;justify-content:space-between;padding:.16rem 0;gap:1rem}"
        ".det b{font-weight:400;color:#efe8d8;text-align:right}"
        ".go{width:100%;margin:.9rem 0 0;padding:.85rem;border-radius:2rem;"
        "font-size:.8rem;background:linear-gradient(180deg,#332810,#221a09);"
        "border-color:#8a6f3a;color:#f4dda6;box-shadow:0 0 26px rgba(224,193,132,.12)}"
        ".go:hover:not(:disabled){background:#e0c18419}"
        ".go:disabled{background:#0c0906;border-color:#282112;color:#575040;cursor:default}"
        ".set{background:#0f0c07;border:1px solid #282112;border-radius:.7rem;"
        "padding:.7rem .8rem;margin:0 0 .5rem;font-size:.82rem}"
        ".set button{margin:.3rem .3rem 0 0;padding:.3rem .6rem;font-size:.78rem;"
        "border-radius:2rem}"
        ".set input{width:5rem;display:inline-block;margin-top:.3rem}"
        ".tabs{display:flex;gap:.4rem;justify-content:center;margin:0 0 1rem}"
        ".tabs a{font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;"
        "text-decoration:none;color:#8a8375;padding:.35rem .8rem;border-radius:2rem;"
        "border:1px solid transparent}"
        ".tabs a.on{border-color:#352c17;background:#0c0906;color:#efe8d8}"
        /*  the fee-tier row on the Uniswap card: which pools exist for this
            pair, and which one the quote came through                     */
        ".tr{margin:.15rem .3rem 0 0;padding:.25rem .6rem;font-size:.76rem;"
        "border-radius:2rem;background:#0f0c07;border-color:#282112;color:#8a8375}"
        ".tr.on{background:#332609;border-color:#8a6f3a;color:#f8f2e2}"
        /*  the chart: bars drawn from the pool's own oracle, no canvas and
            no library — a div per observation, height as a percentage      */
        ".ch{display:flex;align-items:flex-end;gap:2px;height:9rem;margin:1rem 0;"
        "border-bottom:1px solid #282112;padding-bottom:2px}"
        ".ch i{flex:1;background:#332609;border-top:1px solid #4a7fd4;min-height:1px;"
        "border-radius:1px 1px 0 0}"
        ".ch i:hover{background:#8a6f3a}"
        ".two{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}"
        "@media(max-width:30rem){.two{grid-template-columns:1fr}}"
        /*  the conversation. Every string in here arrived from a log and is
            written with textContent, so this sheet is styling text and
            nothing else — there is no markup from a stranger to contain. */
        "#log{max-height:34rem;overflow-y:auto;border:1px solid #282112;border-radius:.55rem;"
        "padding:.2rem 1rem 1rem;background:#0b0806}"
        ".msg{display:grid;grid-template-columns:auto auto 1fr;gap:0 .55rem;"
        "align-items:baseline;padding:.5rem 0;border-top:1px solid #121826}"
        ".msg:first-child{border-top:0}"
        ".msg b{font:12.5px ui-monospace,monospace;font-weight:500;color:#e0c184}"
        ".msg.me b{color:#a9d9a0}"
        ".msg .at{color:#4b5468;font-size:.72rem;text-align:right}"
        ".msg p{grid-column:1/-1;margin:.15rem 0 0;white-space:pre-wrap;overflow-wrap:anywhere}"
        ".msg .sealed{color:#6e6759;font-style:italic}"
        ".dmlink{font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;"
        "text-decoration:none;color:#3f4759}"
        ".dmlink:hover{color:#e0c184}"
        "textarea{width:100%;background:#0c0906;border:1px solid #352c17;border-radius:.5rem;"
        "color:#e9e2d0;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;padding:.6rem .75rem;"
        "min-height:4.4rem;resize:vertical;margin-top:.6rem}"
        "textarea:focus{outline:none;border-color:#5e4e28}"
        ".room{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;"
        "border:1px solid #282112;border-radius:.5rem;padding:.6rem .85rem;margin:.4rem 0;"
        "cursor:pointer}"
        ".room:hover,.room:focus{border-color:#453a1f;background:#0d0a06;outline:none}"
        ".room b{font-weight:500;color:#e9e2d0}"
        /*  The gate is a courtesy, not a secret: everything behind it is
            public data on a public chain. What ownership actually gates is
            writing, and that is gated by the contract.                    */
        ".gate{border:1px solid #453a1f;border-radius:.55rem;padding:1rem 1.2rem;"
        "margin:1.2rem 0;background:#0b0f18}"
        "body.held .gate{display:none}"
        "body:not(.held) .only{display:none}"
        ".asme{font:12.5px ui-monospace,monospace;color:#a9d9a0}"
        /*  the wallet picker. One overlay, one card, one button per wallet
            that announced itself — because three extensions racing to be
            first is not a choice anybody made.                            */
        ".wals{position:fixed;inset:0;background:#030204dd;display:grid;"
        "place-items:center;z-index:60}"
        ".walc{background:#0b0806;border:1px solid #453a1f;border-radius:.8rem;"
        "padding:1.1rem 1.2rem 1.2rem;max-width:20rem;width:92%}"
        ".walb{display:flex;align-items:center;gap:.6rem;width:100%;"
        "margin:.5rem 0 0;padding:.6rem .8rem;border-radius:.55rem;"
        "background:#0f0c07;border:1px solid #352c17;color:#f4eede;cursor:pointer;"
        "font-size:.95rem}"
        ".walb:hover{border-color:#5e4e28;background:#171208}"
        ".walb img{width:22px;height:22px;border-radius:5px}"
        ".walc .e{margin:.85rem 0 0;font-size:.8rem}"
        ".acct{cursor:pointer;text-decoration:underline dotted #4a4334}"
        /*  the terminal: a scrollback and a line. The input is styled as the
            place where things happen, because it is.                      */
        ".term{background:#030204;border:1px solid #282112;border-radius:.55rem;"
        "padding:.8rem 1rem;height:24rem;overflow-y:auto;font:12.5px/1.7 "
        "ui-monospace,monospace;margin:1rem 0 .6rem}"
        ".tl{white-space:pre-wrap;overflow-wrap:anywhere;color:#ddd6c6}"
        ".tl.in{color:#e0c184}.tl.ok{color:#a9d9a0}.tl.no{color:#e08a8a}"
        ".tinput{width:100%;max-width:100%;background:#0c0906;border:1px solid #453a1f;"
        "border-radius:.5rem;color:#f4eede;font:14px ui-monospace,monospace;"
        "padding:.65rem .8rem}"
        ".tinput:focus{outline:none;border-color:#8a6f3a}"
        /*  the gallery grid: the stills are the page                      */
        ".gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr));"
        "gap:.7rem;margin:1.2rem 0}"
        ".gcell{display:block;border:1px solid #282112;border-radius:.55rem;"
        "padding:.5rem;text-decoration:none;color:inherit}"
        ".gcell:hover{border-color:#453a1f;background:#0d0a06}"
        ".gcell img{width:100%;aspect-ratio:1;border:0;border-radius:.4rem;background:#000}"
        ".gid{display:block;font:12px ui-monospace,monospace;color:#e0c184;margin-top:.4rem}"
        ".gname{display:block;font-size:.82rem;color:#ddd6c6}"
        ".gtags{display:block;margin-top:.2rem;min-height:1em}"
        ".gtags i{font-style:normal;font-size:.68rem;letter-spacing:.08em;"
        "text-transform:uppercase;color:#6e6759;margin-right:.5rem}"
        ".gtags i.ok{color:#a9d9a0}.gtags i.w{color:#e0a37f}"
        /*  coins                                                          */
        ".coinaddr{font-size:13px;color:#efe8d8}"
        /*  the lore: explanation folds itself behind a small star. Hover
            reads it, a click pins it, and with JavaScript off every word
            is simply on the page — the chip script never ran.            */
        ".lore{background:none;border:0;color:#6e6759;margin:.1rem 0 0;padding:0 .3rem;"
        "cursor:help;font-size:.85rem;letter-spacing:0}"
        ".lore:hover{background:none;color:#e0c184}"
        "p.e.hush{display:none}"
        "p.e.hush.shown{display:block;border:1px solid #2b2314;border-radius:.8rem;"
        "padding:.8rem 1rem;background:rgba(15,12,7,.85);margin:.4rem 0 1rem;"
        "font-size:.85rem}"
        /*  the fourth dimension, cut by the door                          */
        ".tess4{display:flex;flex-direction:column;align-items:center;margin:.6rem 0 .4rem}"
        ".tess4 canvas{width:min(30rem,88vw);height:auto;background:none;border:0;"
        "max-width:none;aspect-ratio:1;cursor:crosshair}"
        ".tdoor{min-height:6.5rem;max-height:11rem;overflow-y:auto}"
        ".tess4 p{min-height:1.1em;font-size:.72rem;letter-spacing:.3em;"
        "text-transform:uppercase;color:#b39a5e;margin:.1rem 0 0}"
        /*  the projector's studio                                         */
        ".cast{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);"
        "gap:2rem;align-items:start;margin:1.4rem 0}"
        "@media(max-width:52rem){.cast{grid-template-columns:1fr}}"
        "#stage{margin:0;border:1px solid #2b2314;border-radius:1.3rem;overflow:hidden;"
        "background:radial-gradient(30rem 30rem at 50% 40%,#171022,#060409);"
        "box-shadow:0 24px 70px rgba(0,0,0,.5)}"
        "#stage svg{display:block;width:100%;height:auto;border:0;background:none;"
        "max-width:none}"
        ".deck label{margin:.9rem 0 .2rem}"
        ".chip{margin:.25rem .3rem .25rem 0;padding:.4rem .8rem;font-size:10.5px}"
        ".chip.on{background:rgba(224,193,132,.14);border-color:#8a6f3a;color:#f4dda6}"
        /*  the bars: a launch and a lock are both dragged before they are
            typed                                                          */
        "input[type=range]{width:100%;accent-color:#e0c184;background:transparent;"
        "border:0;padding:0;margin:.45rem 0 .15rem;height:1.1rem}"
        "input[type=checkbox]{width:auto}";

    /*═══════════════════ the wallet, chosen ═══════════════════*/

    /// @notice The one script every connected page loads first. EIP-6963
    ///         exists so a person with three wallet extensions gets to say
    ///         which one speaks for them; taking the first announcement
    ///         defeats the standard — Phantom and Keplr race to announce,
    ///         and MetaMask loses the sprint on every page load. Every
    ///         announcer is kept, keyed by rdns; reads may use any of them,
    ///         because a read is just RPC; the signing identity is chosen —
    ///         by the stored choice, by being the only wallet, or by the
    ///         person, from a picker. Clicking your own address clears the
    ///         choice and asks again.
    function wallet() external pure returns (string memory) {
        return string.concat("<script>", WALLET_JS, "</script>");
    }

    string internal constant WALLET_JS =
        "window.IPW=(()=>{"
        "const P=new Map();"
        "addEventListener('eip6963:announceProvider',e=>{const d=e.detail;"
        "if(d&&d.info&&d.info.rdns&&d.provider)P.set(d.info.rdns,d)});"
        "dispatchEvent(new Event('eip6963:requestProvider'));"
        "let CHO=null;"
        "const save=()=>{try{return localStorage.getItem('ipse.wallet')}catch(e){return null}};"
        "const keep=r=>{try{localStorage.setItem('ipse.wallet',r)}catch(e){}};"
        "const drop=()=>{try{localStorage.removeItem('ipse.wallet')}catch(e){};CHO=null};"
        "const pick=()=>{if(CHO)return CHO;const s=save();"
        "if(s&&P.has(s))return CHO=P.get(s);"
        "if(P.size===1)return CHO=P.values().next().value;return null};"
        "const pv=()=>{const d=pick();if(d)return d.provider;"
        "return P.size?P.values().next().value.provider:window.ethereum};"
        "const nm=()=>{const d=pick();return(d&&d.info.name)||'injected wallet'};"
        /*  Names and icons come from extensions: the name goes in through
            textContent, the icon only if it is a data: image, which is what
            the standard says it is.                                       */
        "const ask=()=>new Promise(res=>{"
        "const o=document.createElement('div');o.className='wals';"
        "const c=document.createElement('div');c.className='walc';"
        "const h=document.createElement('p');h.className='k';"
        "h.textContent='which wallet speaks for you?';c.append(h);"
        "for(const d of P.values()){const b=document.createElement('button');"
        "b.type='button';b.className='walb';"
        "const i=document.createElement('img');const ic=String(d.info.icon||'');"
        "if(ic.startsWith('data:image/'))i.src=ic;i.alt='';"
        "const t=document.createElement('span');t.textContent=d.info.name||d.info.rdns;"
        "b.append(i,t);b.addEventListener('click',()=>{o.remove();res(d)});c.append(b)}"
        "const n=document.createElement('p');n.className='e';"
        "n.textContent='Your choice is remembered on this site. Click your address later to switch wallets.';"
        "c.append(n);o.addEventListener('click',e=>{if(e.target===o){o.remove();res(null)}});"
        "document.body.append(o)});"
        "const choose=async()=>{let d=pick();"
        "if(!d&&P.size>1){d=await ask();if(!d)throw new Error('no wallet chosen');}"
        "if(d){CHO=d;keep(d.info.rdns);return d.provider}"
        "return window.ethereum};"
        "return{pv:pv,nm:nm,pick:pick,ask:ask,choose:choose,keep:keep,drop:drop,"
        "all:()=>[...P.values()]}"
        "})();";

    /*═══════════════════ navigation ═══════════════════*/

    /// @dev `here` is an index into the same order the links are written in,
    ///      so the current page is not a link to itself. 255 means none.
    function nav(uint256 id, uint8 here) external pure returns (string memory) {
        string memory t = id.str();
        return string.concat(
            "<nav>",
            _tab("/", "index", here == 0),
            _tab(string.concat("/token/", t), "token", here == 1),
            _tab(string.concat("/token/", t, "/live"), "instrument", here == 2),
            _tab(string.concat("/token/", t, "/market"), "market", here == 3),
            _tab(string.concat("/token/", t, "/rent"), "rent", here == 4),
            _tab(string.concat("/token/", t, "/vault"), "vault", here == 5),
            _tab(string.concat("/dm/", t), "message", here == 18),
            _tab(string.concat("/token/", t, "/services.json"), "json", here == 6),
            "</nav>"
        );
    }

    /// @dev The counter's own tabs, under the site nav: the four things a
    ///      token will do, in the order a person meets them.
    function tabs(string memory t, uint8 here) external pure returns (string memory) {
        return string.concat(
            "<div class=tabs>",
            _tab(string.concat("/token/", t, "/market"), "swap", here == 0),
            _tab(string.concat("/token/", t, "/pool"), "pool", here == 1),
            _tab(string.concat("/token/", t, "/rent"), "rent", here == 2),
            _tab(string.concat("/token/", t, "/vault"), "vault", here == 3),
            "</div>"
        );
    }

    /// @dev The tabs are the site's whole thesis in one row: the door in,
    ///      the terminal that does everything, the swap against the chain's
    ///      own Uniswap, the launchpad, the vault, the social layer, and the
    ///      collection. `here` codes: 0 door · 20 terminal · 9 swap ·
    ///      15 launch · 18 lock · 16 social · 22 market · 6 json.
    function navTop(uint8 here) external pure returns (string memory) {
        return string.concat(
            "<nav>",
            _tab("/", "instrument", here == 30),
            _tab("/door", "door", here == 0),
            _tab("/terminal", "terminal", here == 20),
            _tab("/swap", "swap", here == 9),
            _tab("/launch", "launch", here == 15),
            _tab("/lock", "lock", here == 18),
            _tab("/chat", "social", here == 16),
            _tab("/gallery", "market", here == 22),
            _tab("/projector", "projector", here == 17),
            _tab("/name", "name", here == 12),
            _tab("/keys", "keys", here == 13),
            _tab("/seal", "seal", here == 14),
            _tab("/estate", "estate", here == 19),
            _tab("/services.json", "manifest", here == 6),
            "</nav>"
        );
    }

    function _tab(string memory href, string memory label, bool on)
        private pure returns (string memory)
    {
        return string.concat(
            "<a", on ? " class=on" : "", " href=\"", href, "\">", label, "</a>"
        );
    }

    /*═══════════════════ the footer, and the client ═══════════════════*/

    function foot(address premises, uint256 chainId) external pure returns (string memory) {
        return string.concat(
            "<h2>about this page</h2>"
            "<p class=e>An ERC-5219 contract at <code>", LibNum.hexAddr(premises),
            "</code> on chain <code>", chainId.str(),
            "</code>, reached over <code>web3://</code> with no DNS and no server. "
            "It holds none of the artwork: every token renders identically whether "
            "this contract exists, is abandoned, or is replaced. Every transaction "
            "offered here is built on chain &mdash; the selector in each "
            "<code>data-call</code> came out of a contract, not out of this page's "
            "JavaScript, and you can check it against the ABI yourself.</p>"
            "<div id=s></div>"
            /*  Every p.e on the page folds behind a star. Hover reads it, a
                click pins it. With scripts off, nothing hides — the chips
                simply never appear, and the page reads as written.       */
            "<script>(()=>{const l=document.querySelectorAll('p.e');"
            "const ps=l&&l.forEach?l:[];"
            "ps.forEach(p=>{if(!p.parentNode||!p.classList)return;"
            "const c=document.createElement('button');c.className='lore';"
            "c.textContent='\u2726';c.title='read';"
            "c.setAttribute&&c.setAttribute('aria-expanded','false');"
            "p.parentNode.insertBefore(c,p);p.classList.add('hush');"
            "const show=v=>{p.classList.toggle('shown',!!v);"
            "c.setAttribute&&c.setAttribute('aria-expanded',String(!!v))};"
            "c.addEventListener('mouseenter',()=>show(true));"
            "c.addEventListener('mouseleave',()=>{if(!c.pin)show(false)});"
            "c.addEventListener('click',()=>{c.pin=!c.pin;show(c.pin)})})})()</script>"
        );
    }

}
