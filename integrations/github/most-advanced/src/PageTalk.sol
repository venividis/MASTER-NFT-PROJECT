// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {IHub, IChrome, IDesk, IParley, ITalkDesk} from "./interfaces/Site.sol";

interface ISealDesk { function core() external pure returns (string memory); }

/*───────────────────────────────────────────────────────────────────────────
  PageTalk — the commons, and one token talking to another

  Two pages that are almost the same page. The difference is which room the
  client walks, and one of them cannot be known until a wallet has said
  which token you are — a pair room is derived from two ids, and this
  contract only knows one of them.

  Both are readable by anyone. That is not an oversight and it is said out
  loud on the page: this is a chain, the messages are logs, and a log is
  visible to everyone who can reach a node. What ownership gates is saying
  something, and that gate is in `Parley`, where a gate is worth having.
───────────────────────────────────────────────────────────────────────────*/
contract PageTalk {
    using LibNum for uint256;

    IHub          public immutable HUB;
    IChrome       public immutable CHROME;
    IDesk         public immutable DESK;
    ITalkDesk    public immutable TALK;
    IParley      public immutable PARLEY;

    ISealDesk public immutable SEAL;

    constructor(IHub hub, IChrome chrome, IDesk desk, ITalkDesk talk,
                IParley parley, ISealDesk seal) {
        HUB = hub;
        CHROME = chrome;
        DESK = desk;
        TALK = talk;
        PARLEY = parley;
        SEAL = seal;
    }

    /*═══════════════════ /chat ═══════════════════*/

    function chat() external view returns (string memory) {
        (, uint64 count,,,,,,,) = PARLEY.stateOf(0);
        return string.concat(
            CHROME.head("IPSEITY \xc2\xb7 the commons"),
            CHROME.navTop(16),
            "<h1>the commons</h1>"
            "<p class=e>One room, and every token in the collection is already in it. "
            "There are <b>", uint256(count).str(), "</b> messages in it so far. "
            "Anyone can read this; only a token can speak in it.</p>",
            DESK.bare(),
            TALK.config(0, 0, 0),
            _gate(),
            _live(),
            _how(),
            "<div id=s></div>",
            CHROME.wallet(),
            DESK.core(),
            TALK.core(),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    /*═══════════════════ /dm/<id> ═══════════════════*/

    function dm(uint256 other) external view returns (string memory) {
        string memory t = other.str();
        bool canSeal = PARLEY.sealX(other) != bytes32(0);
        return string.concat(
            CHROME.head(string.concat("Message \xc2\xb7 IPSEITY #", t)),
            CHROME.nav(other, 18),
            "<h1>#", t, "</h1>"
            "<p class=e>A room only these two tokens can write in, derived from their "
            "two numbers rather than founded. It exists the moment either of them uses "
            "it. #", t, " is held by <code>", LibNum.hexAddr(HUB.ownerOf(other)),
            "</code>.</p>",
            DESK.bare(),
            TALK.config(0, other, 0),
            _gate(),
            _live(),
            _sealbar(),
            canSeal ? _sealable(t) : _plain(t),
            "<div id=s></div>",
            CHROME.wallet(),
            DESK.core(),
            TALK.core(),
            SEAL.core(),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    /*═══════════════════ the shared furniture ═══════════════════*/

    /// @dev The gate. It hides a composer, not a fact — everything it is in
    ///      front of is already on the screen behind it.
    function _gate() private pure returns (string memory) {
        return
            "<div class=gate>"
            "<h3>Connect, and this becomes yours to use</h3>"
            "<p class=e>Reading takes nothing: the conversation below is already loading "
            "from the chain. Saying something takes a wallet holding one of these tokens, "
            "because a message is signed by the token it comes from and the contract "
            "checks. If you hold more than one you can choose which one is speaking.</p>"
            "<button id=go>connect</button>"
            "</div>"
            "<div class=only>"
            "<label for=as>speaking as</label>"
            "<select id=as></select>"
            "</div>";
    }

    /// @dev Rendered by the contract so it exists with JavaScript off —
    ///      the client only fills it in. Only the DM page emits it, because
    ///      only a pair has exactly two ends to seal between.
    function _sealbar() private pure returns (string memory) {
        return
            "<div class=\"det only\" id=sealbar>"
            "<span id=sealst>checking whether this room can seal\xe2\x80\xa6</span> "
            "<button id=sealpub hidden>derive &amp; publish my key</button>"
            "</div>";
    }

    function _live() private view returns (string memory) {
        return string.concat(
            "<div id=log></div>"
            "<div class=only>"
            "<textarea id=say maxlength=1024 placeholder=\"say something \xe2\x80\x94 "
            "at most ", PARLEY.MAX_BODY().str(), " bytes\"></textarea>"
            "<button id=send>send</button>"
            "<span class=e> \xc2\xb7 as <span class=asme>not holding</span> "
            "\xc2\xb7 \xe2\x8c\x98/ctrl + enter</span>"
            "</div>"
        );
    }

    function _how() private pure returns (string memory) {
        return
            "<h2>how this reads a chat with no server behind it</h2>"
            "<p class=e>Every message is a log, and logs are famously miserable to read "
            "back: <code>eth_getLogs</code> over a range wide enough to hold a "
            "conversation is the first request a public endpoint rate-limits, and the "
            "usual answer is an indexer &mdash; a server, which is the thing this "
            "collection exists not to need.</p>"
            "<p class=e>So each message carries the block number of the message before "
            "it, and the room stores where the newest one is. This page asks the "
            "contract for that block, requests exactly that one block from your node, "
            "reads the message and the pointer to the block before it, and walks. Forty "
            "messages is forty single-block queries &mdash; the narrowest request "
            "<code>eth_getLogs</code> takes &mdash; and no range scan at any point. The "
            "chain is the index.</p>"
            "<p class=e>Nothing on this page hashes anything. The event topic it filters "
            "on came out of <code>Parley.topics()</code>, derived on chain from the same "
            "signature string the compiler hashes, and every selector arrived the same "
            "way. A page that ships its own keccak is a page you have to audit a hash "
            "function in.</p>";
    }

    function _plain(string memory t) private pure returns (string memory) {
        return string.concat(
            "<h2>addressed is not private</h2>"
            "<p class=e>Only these two tokens can write here, and everyone can read it. "
            "Anyone who knows two token numbers can derive the room they share and read "
            "every byte of it &mdash; that is what a public chain is.</p>"
            "<p class=e>#", t, " has not published a sealing key, so anything sent here "
            "goes on chain as plain text and this page will not pretend otherwise. If "
            "its holder publishes one, messages between you become ciphertext that the "
            "contract cannot read either.</p>"
        );
    }

    function _sealable(string memory t) private pure returns (string memory) {
        return string.concat(
            "<h2>sealed, when both sides have a key</h2>"
            "<p class=e>#", t, " has published a P-256 point. When the token you are "
            "speaking as has one too, this page derives a shared secret in your browser "
            "with ECDH, seals the body with AES-GCM, and sends the ciphertext. The "
            "contract stores a flag saying the body is sealed and cannot read it; "
            "neither can anybody else with a node.</p>"
            /*  The half that was missing, and it is the half that matters.
                The private key is derived from a wallet signature, so it
                belongs to a wallet rather than to a token — and a token
                that has been sold has left its old wallet behind while its
                published point stays where it was. This is stated by the
                contract so it is on the page with JavaScript switched off;
                the client reads the token's transfer count and says which
                case this is.                                             */
            "<p class=w>A key belongs to the wallet that derived it, not to "
            "the token that published it. If this token has changed hands since it "
            "published, the person who held it then can still open what you seal to "
            "that key, and the person holding it now cannot. A token that has never "
            "moved has no such gap \xe2\x80\x94 and the bar under the composer says "
            "which of the two this is.</p>"
            "<p class=e>The key is derived from a signature, not generated and stored, "
            "so it is the same key in every browser you connect the same wallet in and "
            "there is nothing to back up. Publishing a different one makes every earlier "
            "sealed message unreadable, which is a real cost and the reason it is not "
            "done casually.</p>"
        );
    }
}
