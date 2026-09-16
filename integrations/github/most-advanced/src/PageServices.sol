// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {Web} from "./lib/Web.sol";
import {IHub, ILeaseRead, IChrome, IDesk, IRendererDoc} from "./interfaces/Site.sol";

/*───────────────────────────────────────────────────────────────────────────
  PageServices — renting the instrument, and the two hands

  Both sides of the counter are on the page. A renter picks a number of days
  and sees the exact wei; a holder names an agent, publishes terms, collects,
  and ends a lease. The holder's controls render for everyone and are refused
  by the contract for everyone else, which is the honest arrangement: hiding
  them would mean the page never told you the instrument has an owner who
  decides these things.

  ── why the price is exact rather than approximate ──

  `rent` demands an exact `msg.value`, because a contract that accepts an
  overpayment has to send change, and sending change is a call to an address
  a stranger chose in the middle of a state transition. Refusing is one line;
  refunding safely is a re-entrancy surface and a griefing surface for no
  benefit anyone asked for. So the page computes the wei, in BigInt, from a
  price this contract read — never in a double, which would already have lost
  the last three digits of an eighteen-decimal amount.

  ── the price guard ──

  Every rent transaction carries the price the page was rendered against as
  `maxPerDay`. A holder can raise the rent while a transaction is in the
  mempool; this is the same defence `swap` takes with `minOut`, filled in by
  the page because the page is the thing that knows what it quoted.
───────────────────────────────────────────────────────────────────────────*/
contract PageServices {
    using LibNum for uint256;

    IHub       public immutable HUB;
    IChrome    public immutable CHROME;
    ILeaseRead public immutable LEASE;
    address    public immutable LEASE_ADDR;
    IDesk      public immutable DESK;

    constructor(IHub hub, IChrome chrome, ILeaseRead lease, IDesk desk) {
        HUB = hub;
        CHROME = chrome;
        LEASE = lease;
        LEASE_ADDR = address(lease);
        DESK = desk;
    }

    /*═══════════════════ /token/<id>/rent ═══════════════════*/

    function rent(uint256 id) external view returns (string memory) {
        string memory t = id.str();
        (
            bool ok, uint8 reason,
            uint128 perDay, uint32 minD, uint32 maxD,
            address renter, uint64 until,
            uint256 vested, bool bound
        ) = LEASE.listing(id);

        return string.concat(
            CHROME.head(string.concat("Rent \xc2\xb7 IPSEITY #", t)),
            CHROME.nav(id, 4),
            CHROME.tabs(t, 2),
            DESK.config(id),
            ok ? _rentCard(perDay, minD, maxD) : _closed(reason, renter, until),
            _holderCard(id, perDay, minD, maxD, vested),
            "<div id=s></div>",
            _whatRentingIs(),
            bound ? _bound() : "",
            _rules(),
            CHROME.wallet(),
            DESK.core(),
            DESK.rent(),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    /// @dev A number of days and the exact wei it costs, recomputed as the
    ///      number changes. `rent` demands an exact `msg.value` — refunding
    ///      an overpayment would mean calling an address a stranger chose in
    ///      the middle of a state transition — so the page has to be the
    ///      thing that gets the number right, and it can, because it is a
    ///      contract and it can multiply.
    function _rentCard(uint128 perDay, uint32 minD, uint32 maxD)
        private pure returns (string memory)
    {
        return string.concat(
            "<div class=app><div class=hd><b>Rent the instrument</b>"
            "<span class=e>", Web.amount(perDay, 18, 9), " ETH / day</span></div>"
            "<div class=fld><div class=lbl><span>for</span><span>",
                uint256(minD).str(), " to ", uint256(maxD).str(), " days</span></div>"
            "<div class=row><input id=rd inputmode=numeric value=\"",
                uint256(minD).str(), "\"><span class=tk>days</span></div></div>"
            "<div class=det><div><span>you pay</span><b id=rc></b></div>"
            "<div><span>you may</span><b>turn the solid, commit orientations</b></div>"
            "<div><span>you may not</span><b>sell, approve, lock, or reach a vault</b>"
            "</div></div>"
            "<button class=go id=rg>Rent it</button></div>"
        );
    }

    function _closed(uint8 reason, address renter, uint64 until)
        private pure returns (string memory)
    {
        return string.concat(
            "<div class=app><div class=hd><b>Rent the instrument</b></div>",
            reason == 3
                ? string.concat(
                    "<p class=w>Let to <code>", LibNum.hexAddr(renter),
                    "</code> until ", uint256(until).str(),
                    " (unix). It frees itself; nobody has to do anything.</p>")
                : reason == 2
                ? "<p class=e>Not on offer. The holder has not named a lease market on "
                  "this token, so nothing here can set a user on it &mdash; which is "
                  "the correct default, and is what makes naming one a deliberate "
                  "act.</p>"
                : "<p class=e>Not on offer. The holder has published no terms.</p>",
            "</div>"
        );
    }

    /// @dev Shown to everyone and refused by the contract for everyone else.
    ///      Hiding it would mean the page never told you the instrument has
    ///      an owner who decides these things.
    function _holderCard(
        uint256 id, uint128 perDay, uint32 minD, uint32 maxD, uint256 vested
    ) private view returns (string memory) {
        return string.concat(
            "<div class=app><div class=hd><b>Let it out</b>"
            "<span class=e>held by <code>", LibNum.hexAddr(HUB.ownerOf(id)),
            "</code></span></div>"
            "<div class=fld><div class=lbl><span>price</span></div>"
            "<div class=row><input id=lp inputmode=decimal value=\"",
                Web.amount(perDay, 18, 9),
            "\"><span class=tk>ETH / day</span></div></div>"
            "<div class=two>"
            "<div class=fld><div class=lbl><span>shortest</span></div>"
            "<div class=row><input id=ln inputmode=numeric value=\"",
                uint256(minD).str(), "\"><span class=tk>days</span></div></div>"
            "<div class=fld><div class=lbl><span>longest</span></div>"
            "<div class=row><input id=lx inputmode=numeric value=\"",
                uint256(maxD).str(), "\"><span class=tk>days</span></div></div></div>"
            "<button class=go id=agt>Name this contract my lease agent</button>"
            "<button class=go id=ls>Publish these terms</button>"
            "<div class=det><div><span>vested to the token</span><b>",
                Web.amount(vested, 18, 9), " ETH</b></div></div>"
            "<button class=go id=col>Collect</button>"
            "<button class=go id=end>End the lease now</button>"
            "<button class=go id=dl2>Stop taking renters</button>"
            "<p class=e>Naming this contract your lease agent is a separate, one-line "
            "transaction on the token itself &mdash; it grants the power to set the "
            "ERC-4907 user and nothing else, and an ERC-721 approval would have handed "
            "over the right to sell. Terms cannot be published until it is named.</p>"
            "<p class=e>Ending a lease early costs you the unelapsed rent, at exactly "
            "the rate it was earning. <em>Settle before you sell</em>: this contract can "
            "see that a lease broke but not when, so it credits you only to the last "
            "block anybody looked.</p>"
            "<button class=go id=set2>Bring the books up to date</button>"
            "<button class=go id=clm>Reclaim rent for time I did not get</button></div>"
        );
    }

    function _bound() private pure returns (string memory) {
        return
            "<p class=e>This token is bound &mdash; ERC-5192 locked, so it cannot be "
            "sold at all. For a renter that is a feature: the one way a lease here can "
            "be cut short is the holder moving the token, and this one cannot move.</p>";
    }

    function _whatRentingIs() private pure returns (string memory) {
        return
            "<p class=e>ERC-4907 has been in this token since the beginning, and the line "
            "it draws is the interesting part. A renter is an <em>operator</em>: they may "
            "turn the solid, commit new orientations, set the traits the holder left "
            "writable &mdash; they may drive the instrument, and every change they make is "
            "the token's real state, not a preview. What a renter can never do is sell it, "
            "approve it, lock it, or touch either vault. The contract enforces that "
            "distinction rather than asking anybody to respect it.</p>"
            "<p class=e>Rent goes to the <em>token</em>, not to the address holding it. "
            "That is the same rule the market runs on: fees land in the market's reserves, "
            "so selling the NFT sells the exchange. Sell mid-term and the unpaid rent goes "
            "with it, because the business was never the seller's.</p>";
    }

    function _rules() private pure returns (string memory) {
        return
            "<h2>the fine print, which is short</h2>"
            "<p class=e>There is no protocol fee. No cut for the curator, no treasury "
            "address, no switch to add one later &mdash; every wei a renter pays is owed "
            "to the token they paid it to.</p>"
            "<p class=e>The holder keeps the last word: <code>setUser</code> is still "
            "theirs, so they can end a lease at any moment. Doing it costs them exactly "
            "what it was earning them, which is the most a contract can do about it "
            "without taking the token hostage. If you need certainty for the full term, "
            "rent one that is bound.</p>"
            "<p class=e>One renter at a time. Nothing here has been audited.</p>";
    }

    /*═══════════════════ /token/<id>/vault ═══════════════════*/

    function vault(uint256 id) external view returns (string memory) {
        string memory t = id.str();
        address reach = HUB.account(id);
        address grip = HUB.grip(id);

        return string.concat(
            CHROME.head(string.concat("Vault \xc2\xb7 IPSEITY #", t)),
            CHROME.nav(id, 5),
            CHROME.tabs(t, 3),
            "<h1>the two hands</h1>"
            "<p class=e>Every token owns two addresses, derived under ERC-6551 from the "
            "registry, the implementation, this chain and this token id. They are not "
            "granted; they are computed, and you can compute them yourself.</p>",
            _hand(
                "Reach", reach,
                "The hand that acts. It can hold, spend, sign and call &mdash; and while "
                "it is sealed it is policed by measurement rather than by a list of "
                "forbidden functions: the account records what it holds before a call and "
                "after, and refuses any call that left it holding less of anything it "
                "promised to keep.",
                reach.code.length > 0
            ),
            _hand(
                "Grip", grip,
                "The hand that only receives. There is no spend function in the bytecode "
                "&mdash; not a guarded one, not an owner-only one, none. Anything paid in "
                "belongs to the token for as long as the chain lasts, which makes it a "
                "floor under the token's value that a seller cannot empty between a "
                "handshake and a settlement.",
                grip.code.length > 0
            ),
            _give(id, grip),
            _draw(id),
            _verify(reach),
            "<div id=s></div>",
            CHROME.wallet(),
            DESK.core(),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    function _hand(string memory name, address a, string memory what, bool deployed)
        private pure returns (string memory)
    {
        return string.concat(
            "<div class=card><h3>", name, " &mdash; <code>", LibNum.hexAddr(a), "</code>"
            "</h3><p class=e>", what, "</p><p class=e>",
            deployed
                ? "<span class=ok>Deployed.</span> Value sent here is held by the token."
                : "<span class=w>Not deployed yet.</span> The address is fixed regardless "
                  "&mdash; value sent to it now is held at that address and becomes "
                  "reachable the moment anyone calls <code>embody</code>, which needs no "
                  "permission.",
            "</p></div>"
        );
    }

    function _give(uint256 id, address grip) private pure returns (string memory) {
        return string.concat(
            "<h2 id=give>give</h2>"
            "<p class=e>Paying into the Grip is not a donation to the holder. It is a "
            "donation to the <em>token</em>, permanently, and the only person it ever "
            "benefits is whoever holds the token &mdash; today and every day after. There "
            "is no way to undo it, including for you.</p>"
            "<label for=gv>wei to send to the Grip of #", id.str(), "</label>"
            "<input id=gv value=\"0\">"
            "<button data-to=\"", LibNum.hexAddr(grip), "\" data-call=\"0x\""
            " data-value=\"0\" data-valfrom=\"gv\">send, permanently</button>"
            "<p class=e>Plain value transfer, empty calldata. ERC-20s and NFTs work the "
            "same way: send them to that address.</p>"
        );
    }

    function _draw(uint256 id) private view returns (string memory) {
        address sigil;
        address r = HUB.renderer();
        if (r != address(0)) {
            (bool ok, bytes memory out) =
                r.staticcall(abi.encodeWithSelector(IRendererDoc.sigil.selector));
            if (ok && out.length >= 32) sigil = abi.decode(out, (address));
        }
        if (sigil == address(0)) return "";

        return string.concat(
            "<h2 id=draw>draw</h2>"
            "<p class=e>The contract that renders this token's still image is a "
            "four-dimensional projector written in Solidity, and it is "
            "<code>public pure</code>. It takes a section word and a seed, turns sixteen "
            "4-vectors through six Givens rotations, divides through by distance along w, "
            "and returns SVG path data. It does not check who is asking, and it does not "
            "check that the word belongs to any token &mdash; so it is a public good that "
            "happens to live inside this collection rather than a service of it.</p>"
            "<dl><dt>projector</dt><dd><code>", LibNum.hexAddr(sigil), "</code></dd>"
            "<dt>signature</dt><dd><code>pathAlong(uint256 word, bytes32 seed, uint8 "
            "drop)</code></dd>"
            "<dt>drop</dt><dd>which axis to project along: 0 x, 1 y, 2 z, 3 w. Three of "
            "those four are elevations nothing three-dimensional could cast.</dd></dl>"
            "<label for=dw>section word</label>"
            "<input id=dw value=\"", HUB.sectionOf(id).str(), "\">"
            "<button data-to=\"", LibNum.hexAddr(sigil), "\" data-read"
            " data-call=\"", _sel("pathAlong(uint256,bytes32,uint8)"),
            "\" data-args=\"dw:uint,ds:uint,dd:uint\" data-out=dr>call it</button>"
            "<input type=hidden id=ds value=\"0\"><input type=hidden id=dd value=\"3\">"
            "<p class=e>first word of the return: <code id=dr>&mdash;</code> "
            "<span class=m>(the answer is a byte string; a page this size shows you its "
            "head, not its contents)</span></p>"
        );
    }

    function _verify(address reach) private view returns (string memory) {
        bytes32 dom;
        if (reach.code.length > 0) {
            (bool ok, bytes memory out) =
                reach.staticcall(abi.encodeWithSignature("domainSeparator()"));
            if (ok && out.length >= 32) dom = abi.decode(out, (bytes32));
        }
        return string.concat(
            "<h2 id=verify>verify</h2>"
            "<p class=e>The token can speak as itself. Its Reach account answers ERC-1271, "
            "and the answer is deliberately narrow: it validates a digest only if that "
            "digest can be rebuilt under the account's own EIP-712 domain, from an "
            "attestation struct carrying a purpose, a payload, a nonce and a deadline. "
            "Every other digest is refused, including a valid signature by the holder over "
            "something else &mdash; a sealed vault must not be a general-purpose signing "
            "oracle for whoever holds it.</p>"
            "<dl><dt>account</dt><dd><code>", LibNum.hexAddr(reach), "</code></dd>",
            dom == bytes32(0)
                ? "<dt>domain</dt><dd class=e>not deployed yet, so it has no domain "
                  "separator to show. It will be fixed the moment it is.</dd>"
                : string.concat("<dt>domain</dt><dd><code>", LibNum.hex32(dom),
                                "</code></dd>"),
            "<dt>check with</dt><dd><code>isValidSignature(bytes32 digest, bytes "
            "signature)</code> &mdash; <code>0x1626ba7e</code> means yes</dd></dl>"
            "<p class=e>Building an attestation takes a struct this page has no room to "
            "compose. The instrument does it properly: open the token, go to Sign, and it "
            "computes the digest locally and compares it against "
            "<code>attestationDigest</code> read from the chain before it asks you to sign "
            "anything.</p>"
        );
    }

    /*═══════════════════ calldata, assembled on chain ═══════════════════*/

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

    function _w(uint256 v) private pure returns (string memory) {
        bytes memory hexd = "0123456789abcdef";
        bytes memory o = new bytes(64);
        for (uint256 i; i < 64; ++i) o[63 - i] = hexd[(v >> (i * 4)) & 0x0f];
        return string(o);
    }
}
