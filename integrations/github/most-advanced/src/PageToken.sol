// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {Web} from "./lib/Web.sol";
import {Section} from "./lib/Types.sol";
import {IHub, IPoolRead, ILeaseRead, IChrome, IRendererDoc} from "./interfaces/Site.sol";

/*───────────────────────────────────────────────────────────────────────────
  PageToken — the index, and each token's front counter

  The index is a directory of objects. The token page is a directory of what
  one object will do for you, which is a different thing and the reason this
  contract exists.

  Every token in this collection already had services. It has a market
  anyone may trade against, a vault anyone may pay into and nobody may empty,
  a projector anyone may call with any four-dimensional word, and a signature
  anyone may verify. What it did not have was a counter — somewhere a
  stranger could see that those exist, what they cost, and whether they are
  open right now. Four thousand businesses with no shopfronts.

  The board below is that, and it is built out of live reads rather than a
  list written at deploy time: a service is shown as open because the
  contract that provides it says so this block.
───────────────────────────────────────────────────────────────────────────*/
contract PageToken {
    using LibNum for uint256;
    using Section for uint256;

    IHub      public immutable HUB;
    IChrome   public immutable CHROME;
    IPoolRead public immutable POOL;
    ILeaseRead public immutable LEASE;

    constructor(IHub hub, IChrome chrome, IPoolRead pool, ILeaseRead lease) {
        HUB = hub;
        CHROME = chrome;
        POOL = pool;
        LEASE = lease;
    }

    /*═══════════════════ / ═══════════════════*/

    /*═══════════════════ /token/<id> ═══════════════════*/

    function token(uint256 id) external view returns (string memory) {
        uint256 w = HUB.sectionOf(id);
        return string.concat(
            CHROME.head(string.concat("IPSEITY #", id.str())),
            CHROME.nav(id, 1),
            "<h1>IPSEITY #", id.str(), "</h1>",
            _facts(id, w),
            _board(id),
            _frame(id),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    function _facts(uint256 id, uint256 w) private view returns (string memory) {
        return string.concat(
            "<dl><dt>solid</dt><dd>", _form(w.form()), "</dd>",
            "<dt>held by</dt><dd><code>", LibNum.hexAddr(HUB.ownerOf(id)), "</code></dd>",
            "<dt>operated by</dt><dd>", _operator(id), "</dd>",
            "<dt>bound</dt><dd>", HUB.locked(id) ? "yes &mdash; it cannot be sold" : "no",
            "</dd><dt>kernel</dt><dd>", _kernel(HUB.kernelStatus(id)), "</dd>",
            "<dt>reach</dt><dd><code>", LibNum.hexAddr(HUB.account(id)), "</code></dd>",
            "<dt>grip</dt><dd><code>", LibNum.hexAddr(HUB.grip(id)), "</code></dd>",
            "<dt>section word</dt><dd><code>", w.str(), "</code></dd></dl>"
        );
    }

    /// @dev The counter. Each row is a live read, so "open" means open now.
    function _board(uint256 id) private view returns (string memory) {
        return string.concat(
            "<h2>what this one will do for you</h2>",
            _tradeRow(id),
            _rentRow(id),
            "<div class=card><h3>give &mdash; permanent custody</h3>"
            "<p class=e>The Grip receives and has no function that sends. Not a locked "
            "one, not a guarded one: the bytecode contains no path that moves value out, "
            "so anything paid in is the token's for as long as the chain lasts. Its "
            "address is above.</p>"
            "<p><a class=g href=\"/token/", id.str(), "/vault\">the two hands &rarr;</a></p></div>",

            "<div class=card><h3>draw &mdash; the projector, free</h3>"
            "<p class=e>The contract that renders this token's still image is a 4D "
            "projector, and it is <code>public pure</code>. Hand it any section word and "
            "any seed and it will turn sixteen 4-vectors through six Givens rotations and "
            "give you back SVG. It does not check who is asking or which token the word "
            "belongs to, so it is a public good rather than a feature of this token.</p>"
            "<p><a class=g href=\"/token/", id.str(), "/vault#draw\">how to call it &rarr;</a>"
            "</p></div>",

            "<div class=card><h3>verify &mdash; what the token said</h3>"
            "<p class=e>The token can sign as itself: its Reach account answers ERC-1271 "
            "for digests rebuilt under its own EIP-712 domain, and refuses every other "
            "digest it is shown. Anyone can check one.</p>"
            "<p><a class=g href=\"/token/", id.str(), "/vault#verify\">check a signature "
            "&rarr;</a></p></div>"
        );
    }

    function _tradeRow(uint256 id) private view returns (string memory) {
        if (address(POOL) == address(0)) return "";
        (address base, address quote, uint112 rb, uint112 rq, uint16 fee, bool open,,,,,,)
            = POOL.market(id);

        if (!open) {
            return
                "<div class=card><h3>trade &mdash; closed</h3>"
                "<p class=e>This token has not opened a market. Its holder can open one "
                "against any pair of ERC-20s, set the fee, and take the fee &mdash; and "
                "selling the token would sell the exchange with it.</p></div>";
        }
        return string.concat(
            "<div class=card><h3>trade &mdash; <span class=ok>open</span></h3>"
            "<dl><dt>pair</dt><dd>", Web.symbolOf(base), " / ", Web.symbolOf(quote), "</dd>",
            "<dt>reserves</dt><dd>", Web.amount(rb, Web.decimalsOf(base), 4), " / ",
                Web.amount(rq, Web.decimalsOf(quote), 4), "</dd>",
            "<dt>fee</dt><dd>", uint256(fee).str(), " bps</dd></dl>",
            "<p><a class=g href=\"/token/", id.str(), "/market\">quote and trade &rarr;</a>"
            "</p></div>"
        );
    }

    function _rentRow(uint256 id) private view returns (string memory) {
        if (address(LEASE) == address(0)) return "";
        (bool ok, uint8 reason, uint128 perDay, uint32 minD, uint32 maxD,, uint64 until,,)
            = LEASE.listing(id);

        if (!ok && reason == 3) {
            return string.concat(
                "<div class=card><h3>rent &mdash; <span class=w>let until ",
                uint256(until).str(), "</span></h3>"
                "<p class=e>Someone else is driving it. The term is a unix timestamp; "
                "after it passes the instrument is available again.</p>"
                "<p><a class=g href=\"/token/", id.str(), "/rent\">terms &rarr;</a></p></div>"
            );
        }
        if (!ok) {
            return string.concat(
                "<div class=card><h3>rent &mdash; not offered</h3>"
                "<p class=e>", reason == 2
                    ? "The holder has listed no terms, and has not named a lease market "
                      "on this token."
                    : "The holder is not currently letting this one out.",
                " A renter would be able to turn the solid and commit orientations, and "
                "would never be able to sell it &mdash; ERC-4907 draws that line and the "
                "token enforces it.</p>"
                "<p><a class=g href=\"/token/", id.str(), "/rent\">what renting means "
                "&rarr;</a></p></div>"
            );
        }
        return string.concat(
            "<div class=card><h3>rent &mdash; <span class=ok>available</span></h3>"
            "<dl><dt>price</dt><dd>", Web.amount(perDay, 18, 6), " ETH per day</dd>",
            "<dt>term</dt><dd>", uint256(minD).str(), " to ", uint256(maxD).str(),
                " days</dd></dl>",
            "<p><a class=g href=\"/token/", id.str(), "/rent\">rent it &rarr;</a></p></div>"
        );
    }

    /*  The still is an <img> pointing at its own route, and the instrument
        is a link rather than a frame.

        This was an iframe carrying the token's whole data: URI, and
        measuring it settled the argument: 21M gas of `eth_call` for the
        counter page against 0.2M for every other service page here, to
        show something a visitor cannot use — a `data:` document gets an
        opaque origin and wallet extensions will not inject into one. The
        frame could be looked at and not used, and it cost more than
        everything else on the site put together.

        The bytes are still the token's own either way: `/live` is
        `Renderer.document(...)`, exactly what `tokenURI` base64s one step
        earlier, and `/raw` hands over the URI itself to check.          */
    function _frame(uint256 id) private pure returns (string memory) {
        string memory t = id.str();
        return string.concat(
            "<h2>the instrument</h2>"
            "<p><a class=g href=\"/token/", t, "/live\">open it &rarr;</a>"
            "<a class=g href=\"/token/", t, "/faces\">the other faces &rarr;</a>"
            "<a class=g href=\"/token/", t, "/raw\">the URI itself &rarr;</a></p>"
            "<img alt=\"IPSEITY #", t, "\" src=\"/token/", t, "/sigil.svg\">"
            "<p class=e>The picture above is the token's still, drawn by a Solidity "
            "projector and served as its own request &mdash; so this page stays cheap "
            "enough for any node to answer while the artwork costs what the artwork "
            "costs. The instrument itself is a link rather than a frame on purpose: a "
            "<code>data:</code> document gets an opaque origin and no wallet will inject "
            "into one, so an embedded copy could be looked at and never used. "
            "<a href=\"/token/", t, "/live\">Opened on its own</a> it has a real origin "
            "under <code>web3://</code>, EIP-6963 discovery works, and it does what it "
            "was built to do.</p>"
        );
    }

    /*═══════════════════ /token/<id>/faces ═══════════════════*/

    function faces(uint256 id) external view returns (string memory) {
        bool pinned = HUB.hasPinnedTokenURI(id);
        string memory t = id.str();
        return string.concat(
            CHROME.head(string.concat("IPSEITY #", t, " \xc2\xb7 faces")),
            CHROME.nav(id, 1),
            "<h1>three faces</h1>"
            "<p class=e>ERC-7160. One token, several metadata documents, and a holder who "
            "chooses which one the world sees. All three are computed from the same 256-bit "
            "word; none of them is stored.</p>",
            pinned ? "<p class=e>This holder has pinned a face.</p>"
                   : "<p class=e>Nothing is pinned, so the instrument is what shows.</p>",
            _face(t, 0, "the instrument",
                "The whole application: a WebGL2 engine and a wallet client, ~100 KB of "
                "document, base64 inside a data URI."),
            _face(t, 1, "the still",
                "One sigil. The solid drawn whole, projected along w, as SVG produced by "
                "Solidity."),
            _face(t, 2, "the quartet",
                "The same solid along x, along y, along z and along w. Three of those four "
                "are drawings nothing three-dimensional could cast."),
            "<p class=e>Reading a face costs the node that serves it real work &mdash; the "
            "instrument is about 20M gas of <code>eth_call</code>. That is under the 50M "
            "cap geth, erigon and reth use by default and over the cap some hosted "
            "providers impose, so a wallet that shows nothing may be a wallet on a "
            "cautious endpoint rather than a broken token.</p>",
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    function _face(string memory t, uint256 n, string memory name, string memory what)
        private pure returns (string memory)
    {
        return string.concat(
            "<div class=card><h3>face ", n.str(), " &mdash; ", name, "</h3>"
            "<p class=e>", what, "</p>"
            "<p><a class=g href=\"/token/", t, "/face/", n.str(), "\">the URI &rarr;</a></p>"
            "</div>"
        );
    }

    /*═══════════════════ small things ═══════════════════*/

    function _operator(uint256 id) private view returns (string memory) {
        address u = HUB.userOf(id);
        if (u == address(0)) return "its holder";
        return string.concat(
            "<code>", LibNum.hexAddr(u), "</code> until ",
            HUB.userExpires(id).str(), " <span class=m>(a renter: may turn it, may not "
            "sell it)</span>"
        );
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

    function _kernel(uint8 k) private pure returns (string memory) {
        if (k == 0) return "none";
        if (k == 1) return "current";
        return "stale &mdash; sealed to a previous holder";
    }
}
