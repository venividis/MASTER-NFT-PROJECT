// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {Web} from "./lib/Web.sol";
import {Section} from "./lib/Types.sol";
import {TokenView} from "./lib/Types.sol";
import {IHub} from "./interfaces/Site.sol";
import {ConsoleRead} from "./ConsoleRead.sol";
import {ConsoleSkin} from "./ConsoleSkin.sol";

/*═══════════════════════════════════════════════════════════════════════════

  THE CONSOLE — one route, one document, seven things you can do

  This replaces nineteen pages. Not by merging them: by asking a different
  question. The old site was organised the way the contracts are organised
  — a page per contract, named after the contract — and so a holder who
  wanted to let somebody borrow their token had to already know that the
  answer lived under a heading called "estate". Nineteen doors in a hallway
  is a sitemap. It is not an interface.

  The console is organised the way a person is: by what they came to do.
  Seven imperative sentences, in plain English, in the token's own colour.
  Everything else is the work.

  ── the margin, and why it is the point ──

  The owner found the fault that made this necessary, on a phone, before
  the design did. From an instrument he opened a flat page, from that page
  another token, from that token ITS instrument — a different NFT, running
  inside the first — and that one carried the same control, so it went
  round again. His words: "its cool but I dont know where they come from or
  why they are there."

  Both halves of that are requirements. It IS good that you can look into
  another token from inside your own; a console that forbade it would have
  answered the wrong complaint. What was wrong is that every level was
  byte-identical to the level above it, so there was no way to tell whose
  token you were reading, on which chain, or how far in you had walked.

  So the walk is drawn, and it is drawn as colour rather than as words:

      depth is the number of 1px rules in the left margin,
      each rule is the hue of the token at that level,
      and each rule is the way back out to it.

  Nothing says "you are two deep". You can see it. And what opens down
  there is the token's STILL — drawn on chain by Sigil — never its
  instrument, because two raymarchers on one thread is the other half of
  what the owner reported and no amount of legibility would fix it.

  ── what is server-rendered, and why it matters ──

  The crest, the still, the three identity sentences and all seven verb
  rows with their clocks are in the HTML that leaves this contract. They
  are not painted by script after a round of eth_calls. That is what makes
  the console's degradation honest: when nothing else works, what is left
  is a correct page about the right token, rather than a skeleton and a
  spinner over a number nobody read.

═══════════════════════════════════════════════════════════════════════════*/
contract PageConsole {
    using LibNum for uint256;
    using Section for uint256;

    IHub        public immutable HUB;
    ConsoleRead public immutable READ;
    ConsoleSkin public immutable SKIN;
    /*  The same contract, a second instance. A byte store that shards past
        EIP-170 and freezes is exactly what the client needs too, and a
        second copy of that logic under a different name would be a second
        thing to keep correct for no gain. One holds the stylesheet, one
        holds the script; neither knows what it is holding.            */
    ConsoleSkin public immutable CORE;

    constructor(IHub hub, ConsoleRead read_, ConsoleSkin skin, ConsoleSkin core) {
        HUB = hub;
        READ = read_;
        SKIN = skin;
        CORE = core;
    }

    /*═══════════════════ the seven ═══════════════════*/

    /// @dev Names, sub-lines and keys, in the order they are read. Held as
    ///      one table rather than spelled at each use, because two copies of
    ///      a naming table is the failure this whole redesign is a response
    ///      to — the command line resolves the same words, and if the two
    ///      ever disagree the console tells a holder a verb exists that
    ///      nothing will open.
    function verbName(uint8 i) public pure returns (string memory) {
        if (i == 1) return "TURN IT";
        if (i == 2) return "PUT SOMETHING IN IT";
        if (i == 3) return "TRADE THROUGH IT";
        if (i == 4) return "HAND IT ON";
        if (i == 5) return "SPEAK AS IT";
        if (i == 6) return "MAKE SOMETHING WITH IT";
        if (i == 7) return "LOOK AT ANOTHER ONE";
        return "";
    }

    function verbSub(uint8 i) public pure returns (string memory) {
        if (i == 1) return "the word \xc2\xb7 the cut \xc2\xb7 the hue \xc2\xb7 the face it shows";
        if (i == 2) return "what it holds, and what it can spend";
        if (i == 3) return "its own exchange \xc2\xb7 swaps \xc2\xb7 the fee it earns";
        if (i == 4) return "for an afternoon, a season, a price, or for good";
        if (i == 5) return "the commons \xc2\xb7 whispers \xc2\xb7 rooms \xc2\xb7 what it signs";
        if (i == 6) return "draw the next one \xc2\xb7 launch a coin \xc2\xb7 give it a name";
        if (i == 7) return "any of the four thousand \xc2\xb7 and what they hold";
        return "";
    }

    /// @dev The word a URL and the command line both use. `/c/2049/hand`.
    function verbWord(uint8 i) public pure returns (string memory) {
        if (i == 1) return "turn";
        if (i == 2) return "hold";
        if (i == 3) return "trade";
        if (i == 4) return "hand";
        if (i == 5) return "speak";
        if (i == 6) return "make";
        if (i == 7) return "look";
        return "";
    }

    /// @notice The inverse, for the router. 0 is "no verb named that".
    function verbOf(string memory w) public pure returns (uint8) {
        bytes32 h = keccak256(bytes(w));
        for (uint8 i = 1; i <= 7; ++i) {
            if (h == keccak256(bytes(verbWord(i)))) return i;
        }
        return 0;
    }

    /*═══════════════════ /c/<id> ═══════════════════*/

    function doc(uint256 id, uint8 verb) external view returns (string memory) {
        (TokenView memory v, ConsoleRead.Clocks memory c) = READ.look(id);

        /*  The hue is the token's own, and it is written into :root before
            the stylesheet is read, so the console is this token's colour in
            the first paint rather than after a script re-tints it.       */
        uint256 hue = _hue(v.word);

        return string.concat(
            _head(id, hue),
            /*  `here` as well as `sub`: this band is the one being stood in, so its
                rule is the accent at full strength rather than the dimmed
                version a band you could walk back to wears. With one band open
                that is every band; with three it is the innermost.        */
            "<body><div class=\"sub here\" style=\"--h:", hue.str(), "\" id=root>",
            _crest(id, v, hue),
            "<div id=body>",
            "<div id=col>", _still(id), _ident(id, v, c), _verbs(verb, c), "</div>",
            "<div id=lane", verb == 0 ? "" : " class=on", ">", _lane(verb, v, c), "</div>",
            "</div>",
            _foot(id, verb, v, c),
            "</div></body></html>"
        );
    }

    /*═══════════════════ the parts ═══════════════════*/

    function _head(uint256 id, uint256 hue) private view returns (string memory) {
        return string.concat(
            "<!DOCTYPE html><html lang=en><head><meta charset=utf-8>"
            "<meta name=viewport content=\"width=device-width,initial-scale=1,viewport-fit=cover\">"
            "<meta name=color-scheme content=dark>"
            "<title>IPSEITY #", id.str(), "</title><style>",
            string(SKIN.css()),
            ":root{--h:", hue.str(), "}</style></head>"
        );
    }

    function _crest(uint256 id, TokenView memory v, uint256 hue)
        private view returns (string memory)
    {
        /*  Held reads as an address on the first paint and is rewritten to
            the single word "you" two frames later, when eth_accounts
            answers. It is never blank and it is never wrong, and a holder
            is never asked to compare forty-two hex characters by eye.   */
        return string.concat(
            "<div id=crest>",
            _cell("TOKEN", string.concat("#", id.str())),
            "<div class=cell id=c-chain><span class=k>CHAIN</span>"
            "<span class=v>", _chainName(), "</span></div>",
            "<div class=cell id=c-held><span class=k>HELD</span>"
            "<span class=v id=held>", _short(v.owner), "</span></div>",
            "<div class=\"cell led-cell\"><span class=led id=led></span>"
            "<span class=v id=acct>read only</span></div>",
            "<div id=walk><button class=cr style=\"--h:", hue.str(), "\" data-id=", id.str(),
            " type=button>#", id.str(), "</button></div>",
            "<div class=cell id=pal><button class=chip id=palbtn type=button "
            "aria-label=\"the command list\">\xe2\x80\xa6</button></div>",
            "</div>"
        );
    }

    function _cell(string memory k, string memory val) private pure returns (string memory) {
        return string.concat(
            "<div class=cell><span class=k>", k, "</span><span class=v>", val, "</span></div>"
        );
    }

    function _still(uint256 id) private pure returns (string memory) {
        /*  The still, not the instrument. Sigil draws it on chain and the
            site already serves it at its own route, so this is a reference
            rather than thirty-one hundred base64 bytes inlined into every
            console document — same origin, same contract, one third fewer
            bytes, and a gateway can cache it once for everyone.

            Everywhere a token appears in this console, including three
            levels down the walk, THIS is what appears. The one control in
            the whole console that produces a raymarcher is the link
            underneath it, and it navigates.                             */
        return string.concat(
            "<img id=still alt=\"the still of #", id.str(),
            "\" src=\"/token/", id.str(), "/sigil.svg\">",
            "<a id=turning href=\"/token/", id.str(), "/live\">see it turning \xe2\x86\x92</a>"
        );
    }

    function _ident(uint256 id, TokenView memory v, ConsoleRead.Clocks memory c)
        private pure returns (string memory)
    {
        /*  Three plain sentences, and the full fact block is one tap down
            inside TURN IT. A holder arriving from an instrument does not
            need `Icositetrachoron` and `strata 6` in the first breath; a
            holder who wants them should never have to leave to get them. */
        string memory held = (c.reported & 0x08) == 0
            ? "Its holder was not reported."
            : string.concat("Held by <span id=heldby>", _short(v.owner), "</span>.");

        return string.concat(
            "<div id=ident><h1>IPSEITY #", id.str(), "</h1>",
            "<p class=n>", _formName(uint256(v.word).form()), ", cut at ",
            _cut(uint256(v.word).offsetW()), " and turned on ",
            _planeCount(v.word), ".</p>",
            "<p class=s>", held, " ", _doneTo(v.ops), "</p></div>"
        );
    }

    function _verbs(uint8 open, ConsoleRead.Clocks memory c)
        private view returns (string memory out)
    {
        for (uint8 i = 1; i <= 7; ++i) {
            out = string.concat(
                out,
                "<button class=\"vb", open == i ? " on" : "", "\" type=button data-v=",
                uint256(i).str(), " data-w=", verbWord(i), ">",
                "<span class=t><span class=nm>", verbName(i), "</span>",
                _clock(i, c),
                "</span><span class=sub2>", verbSub(i), "</span></button>"
            );
        }
    }

    /*  One clock per verb, always the soonest thing, never a count and never
        a badge. This is the only unsolicited state in the whole console:
        every piece of it is a date, and a date is printed on the door of the
        thing it is about.                                                */
    function _clock(uint8 i, ConsoleRead.Clocks memory c)
        private view returns (string memory)
    {
        if (i == 4 && c.leaseUntil > 0) {
            if (c.leaseUntil <= block.timestamp) {
                return "<span class=\"cl past\">lease ended</span>";
            }
            uint256 d = (c.leaseUntil - block.timestamp) / 1 days;
            return string.concat(
                "<span class=\"cl", d <= 2 ? " soon" : "", "\">",
                d == 0 ? "today" : string.concat(d.str(), d == 1 ? " day" : " days"),
                "</span>"
            );
        }
        if (i == 3 && (c.reported & 0x02) != 0 && c.bondUntil > block.timestamp) {
            uint256 d = (c.bondUntil - block.timestamp) / 1 days;
            return string.concat("<span class=cl>bonded ", d.str(), "d</span>");
        }
        return "";
    }

    /*═══════════════════ the lane ═══════════════════*/

    /*  Version one renders each verb's STATE from what the reader already
        answered, and says in one sentence what it cannot yet do. A lane
        that lies about being finished is worse than a lane that is honest
        about being partial, and a holder can tell the difference.       */
    function _lane(uint8 verb, TokenView memory v, ConsoleRead.Clocks memory c)
        private pure returns (string memory)
    {
        if (verb == 0) {
            /*  Three sentences, and only on the way in. A holder arriving
                from a turning 4-D solid has just been dropped into a flat
                document and is owed one paragraph saying what this is —
                but an interface that explains itself every time you come
                back to it is nagging, and the seven verbs beside this are
                already in plain English. So it says what the object is,
                what the column does, and where the recursion goes, and
                then it is quiet.                                        */
            return
                "<p class=blurb>This is the same token you were just holding, laid flat. "
                "The seven lines on the left are the seven things it will do; open one and "
                "the work happens here.</p>"
                "<p class=blurb>The coloured rule down the left margin is this token. If you "
                "look into another one, it gets a rule of its own beside this one \xe2\x80\x94 so how "
                "far you have walked is how many rules there are, and each one is the way "
                "back to the token it belongs to.</p>"
                "<p class=blurb>Nothing here turns. The instrument turns; its console does "
                "not, and only one of them ever runs at a time.</p>";
        }
        string memory body;

        if (verb == 3) {
            body = (c.reported & 0x02) == 0
                ? "<p class=blurb>No market contract answered on this chain. That is not the "
                  "same as this token having no market, and the console will not print one "
                  "as the other.</p>"
                : string.concat(
                    _kv("Its own exchange", c.marketOpen ? "open" : "closed"),
                    _kv("Fee it earns", string.concat(uint256(c.feeBps).str(), " bps")),
                    _kv("Base", _short(c.base)),
                    _kv("Quote", _short(c.quote))
                );
        } else if (verb == 4) {
            body = (c.reported & 0x04) == 0
                ? "<p class=blurb>No lease contract answered on this chain.</p>"
                : string.concat(
                    _kv("Rentable", c.rentable ? "yes" : "no"),
                    _kv("Renter", c.renter == address(0) ? "nobody" : _short(c.renter)),
                    _kv("Waiting to be collected", string.concat(
                        Web.amount(c.leaseVested, 18, 5), " ETH"))
                );
        } else if (verb == 2) {
            body = string.concat(
                _kv("The Reach", _short(v.boundAccount)),
                _kv("The Grip", _short(v.grip)),
                "<p class=blurb>The Reach can act and can be sealed. The Grip receives and "
                "never spends \xe2\x80\x94 <b>anything sent there is there permanently.</b></p>"
            );
        } else {
            body = "";
        }

        return string.concat(
            "<h2 class=k style=\"margin:0 0 10px\">", verbName(verb), "</h2>",
            "<p class=blurb>", verbSub(verb), "</p>",
            body,
            /*  Removed by the client the moment it paints controls. Left in
                the served bytes because without a script it is the truth:
                the state above is read on chain and the acts are not here. */
            "<p class=s id=lane-note style=\"color:var(--warn);margin-top:16px\">The state "
            "above was read from the chain in the same call that produced this page. The "
            "controls need the console's script, which has not run.</p>"
        );
    }

    function _foot(uint256 id, uint8 verb, TokenView memory v, ConsoleRead.Clocks memory c)
        private view returns (string memory)
    {
        return string.concat(
            "<div id=tick></div>",
            "<div id=cmd><span class=p>\xe2\x80\xba</span>"
            "<input id=cin type=text autocomplete=off spellcheck=false "
            "placeholder=\"a verb, or #1024\" aria-label=\"the command line\"></div>",
            "<div id=cbox><div class=slab id=cslab></div></div>",
            _seed(id, verb, v, c)
        );
    }

    /*  The seed block. Emitted after the body so the document paints before
        it is parsed, and holding every address and every fact the console's
        script would otherwise have to ask for. State arrives WITH the
        document rather than a round trip after it.                       */
    function _seed(uint256 id, uint8 verb, TokenView memory v, ConsoleRead.Clocks memory c)
        private view returns (string memory)
    {
        /*  Split in two, and not for tidiness: one concat of this many
            expressions is past what the EVM stack holds, and solc says so
            as "too deep in the stack by 1 slots" rather than as anything a
            reader would recognise. Two halves, each comfortably inside it. */
        return string.concat(
            "<script>window.CON={", _seedWho(id, v), _seedWhat(verb, c),
            "};</script><script>", string(CORE.css()), "</script>"
        );
    }

    function _seedWho(uint256 id, TokenView memory v) private view returns (string memory) {
        return string.concat(
            "id:", id.str(),
            ",chain:", block.chainid.str(),
            ",hue:", _hue(v.word).str(),
            ",word:\"", uint256(v.word).str(), "\"",
            ",hub:\"", LibNum.hexAddr(address(HUB)), "\"",
            ",read:\"", LibNum.hexAddr(address(READ)), "\"",
            ",owner:\"", LibNum.hexAddr(v.owner), "\"",
            ",reach:\"", LibNum.hexAddr(v.boundAccount), "\"",
            ",grip:\"", LibNum.hexAddr(v.grip), "\""
        );
    }

    function _seedWhat(uint8 verb, ConsoleRead.Clocks memory c)
        private view returns (string memory)
    {
        return string.concat(
            ",reported:", uint256(c.reported).str(),
            ",first:", HUB.FIRST_ID().str(),
            ",last:", HUB.LAST_ID().str(),
            /*  Which lane is open, so the client knows what Escape closes.
                It was read by the script before anything wrote it, which is
                the quietest kind of broken: no error, no warning, a key
                that simply does nothing.                                */
            ",verb:", uint256(verb).str(),
            _sels()
        );
    }

    /*  Every selector the client needs, derived HERE. Solidity has keccak;
        a browser does not, and shipping two kilobytes of it so the client
        can recompute what this contract already knows is a client that can
        be wrong about something it never needed to decide.

        Its own function, and not for tidiness: folded into the line above
        it, this many expressions in one concat is past what the EVM stack
        holds and solc reports it as "too deep in the stack by 1 slots",
        which names the symptom and not the cause.                       */
    function _sels() private pure returns (string memory) {
        return string.concat(
            ",sel:{commit:\"", _sel("commit(uint256,uint256)"),
            "\",embody:\"", _sel("embody(uint256)"),
            "\",embodyGrip:\"", _sel("embodyGrip(uint256)"),
            "\",xfer:\"", _sel("transferFrom(address,address,uint256)"),
            "\",mint:\"", _sel("mint()"),
            /*  So the mint lane can read the price and ATTACH it: a payable
                mint proposed at zero value reverts, and "the wallet reads
                the price" is not a thing any injected wallet does.       */
            "\",price:\"", _sel("price()"),
            "\"}"
        );
    }

    /*  The four bytes a client sends, and nothing about how they were
        arrived at. A signature spelled in two places is a signature that
        will differ in one of them.                                      */
    function _sel(string memory sig) private pure returns (string memory) {
        bytes4 s = bytes4(keccak256(bytes(sig)));
        bytes memory hexd = "0123456789abcdef";
        bytes memory o = new bytes(10);
        o[0] = "0"; o[1] = "x";
        for (uint256 k; k < 4; ++k) {
            o[2 + k * 2] = hexd[uint8(s[k]) >> 4];
            o[3 + k * 2] = hexd[uint8(s[k]) & 0x0f];
        }
        return string(o);
    }

    /*═══════════════════ words for numbers ═══════════════════*/

    /*  The trait is a byte and the CSS wants degrees. Widened here and
        nowhere else: `hue()` returns uint8, and `uint8 * 360` widens to
        uint16 rather than to uint256, which is a compile error one call
        later and would have been a silently truncated colour if the types
        had happened to line up.                                          */
    function _hue(uint256 word) private pure returns (uint256) {
        return (uint256(word.hue()) * 360) / 256;
    }

    function _formName(uint8 f) private pure returns (string memory) {
        if (f == 0) return "A tesseract";
        if (f == 1) return "A 16-cell";
        if (f == 2) return "A 24-cell";
        if (f == 3) return "A duocylinder";
        if (f == 4) return "A Julia set";
        if (f == 5) return "A quaternion";
        return "A solid";
    }

    /// @dev The cut, as the signed fraction a holder sees on the slider,
    ///      rather than as the uint16 the chain stores it in.
    function _cut(uint16 w) private pure returns (string memory) {
        int256 scaled = (int256(uint256(w)) - 32768) * 100 / 32768;
        return LibNum.fixed1(scaled, 2);
    }

    function _planeCount(uint256 word) private pure returns (string memory) {
        uint256 n;
        for (uint256 p; p < 6; ++p) if (word.angle(p) != 0) ++n;
        if (n == 0) return "none of its planes";
        if (n == 1) return "one plane";
        if (n == 2) return "two planes";
        return string.concat(n.str(), " planes");
    }

    function _doneTo(uint32 ops) private pure returns (string memory) {
        if (ops == 0) return "Nothing has been done to it yet.";
        if (ops == 1) return "One thing has been done to it.";
        return string.concat(uint256(ops).str(), " things have been done to it.");
    }

    /*  Always with the spaces around the ellipsis. An address printed
        without them reads as one token and gets copied wrong.           */
    function _short(address a) private pure returns (string memory) {
        if (a == address(0)) return "nobody";
        bytes memory h = bytes(LibNum.hexAddr(a));
        bytes memory o = new bytes(15);
        for (uint256 i; i < 6; ++i) o[i] = h[i];
        o[6] = " "; o[7] = hex"e2"; o[8] = hex"80"; o[9] = hex"a6"; o[10] = " ";
        for (uint256 i; i < 4; ++i) o[11 + i] = h[38 + i];
        return string(o);
    }

    function _kv(string memory k, string memory val) private pure returns (string memory) {
        return string.concat(
            "<div class=kv><span class=k>", k, "</span><span class=v>", val, "</span></div>"
        );
    }

    function _chainName() private view returns (string memory) {
        uint256 c = block.chainid;
        if (c == 1) return "Ethereum";
        if (c == 8453) return "Base";
        if (c == 130) return "Unichain";
        if (c == 56) return "BNB";
        if (c == 4663) return "Robinhood";
        if (c == 11155111) return "Ethereum Sepolia";
        if (c == 84532) return "Base Sepolia";
        return string.concat("chain ", c.str());
    }
}
