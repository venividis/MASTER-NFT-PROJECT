// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {Web} from "./lib/Web.sol";
import {IHub, IPoolRead, IChrome, IDesk, MarketView} from "./interfaces/Site.sol";

/*───────────────────────────────────────────────────────────────────────────
  PagePool — the holder's side of their own counter

  The site was built for strangers and had nothing at all for the person who
  owns the thing. A holder who wanted to put inventory behind their market,
  change the fee, bond it, or push a new orientation into the curve had to
  open the instrument, or hand-encode calldata. That is a strange gap in a
  website whose whole point is that the token is a business.

  So this is Add and Remove liquidity, the fee, the bond, and the curve, in
  the same card shape as the swap — and it says plainly when a control is
  not yours, rather than hiding it. A page that shows the holder's controls
  to everyone and refuses them at the wallet is confusing; a page that hides
  them is a page that never told you the market has an owner.

  One provider per market is deliberate and it is what makes this page short.
  There are no LP shares to mint, no proportional-deposit maths, no
  first-depositor attack to defend against and no position NFT: the holder
  puts assets in and takes them out, and whoever holds the token is the
  holder. Everything an ordinary AMM front end spends its complexity on here
  reduces to two amounts and a recipient.
───────────────────────────────────────────────────────────────────────────*/
contract PagePool {
    using LibNum for uint256;

    IHub      public immutable HUB;
    IChrome   public immutable CHROME;
    IPoolRead public immutable POOL;
    IDesk     public immutable DESK;

    constructor(IHub hub, IChrome chrome, IPoolRead pool, IDesk desk) {
        HUB = hub;
        CHROME = chrome;
        POOL = pool;
        DESK = desk;
    }

    function pool(uint256 id) external view returns (string memory) {
        string memory t = id.str();
        MarketView memory m;
        (
            m.base, m.quote, m.rBase, m.rQuote, m.feeBps, m.open,
            m.conc, m.spot, m.maxBaseOut, m.maxQuoteOut, m.trades, m.bondUntil
        ) = POOL.market(id);
        m.dBase = Web.decimalsOf(m.base);
        m.dQuote = Web.decimalsOf(m.quote);

        return string.concat(
            CHROME.head(string.concat("Pool \xc2\xb7 IPSEITY #", t)),
            CHROME.nav(id, 3),
            CHROME.tabs(t, 1),
            DESK.config(id),
            _who(id),
            m.open ? _position(m) : "",
            m.open ? _add(m) : _openMarket(),
            m.open ? _remove(m) : "",
            m.open ? _terms(id, m) : "",
            "<div id=s></div>",
            CHROME.wallet(),
            DESK.core(),
            DESK.pool(),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    /// @dev Said once, at the top, rather than discovered at the wallet.
    function _who(uint256 id) private view returns (string memory) {
        return string.concat(
            "<p class=e>Everything on this page is the holder's to do, and the holder "
            "of #", id.str(), " is <code>", LibNum.hexAddr(HUB.ownerOf(id)),
            "</code>. If that is not you the controls will still render &mdash; they "
            "are public knowledge &mdash; and the contract will refuse them. Selling "
            "the token hands all of it over in one transaction: reserves, fee income "
            "and price curve, with nothing to migrate.</p>"
        );
    }

    function _position(MarketView memory m) private view returns (string memory) {
        return string.concat(
            "<div class=app><div class=hd><b>Position</b></div>"
            "<div class=det>"
            "<div><span>", Web.symbolOf(m.base), "</span><b>",
                Web.amount(m.rBase, m.dBase, 8), "</b></div>"
            "<div><span>", Web.symbolOf(m.quote), "</span><b>",
                Web.amount(m.rQuote, m.dQuote, 8), "</b></div>"
            "<div><span>fee you take</span><b>",
                Web.amount(uint256(m.feeBps), 2, 2), "%</b></div>"
            "<div><span>concentration</span><b>", m.conc.str(), " bps</b></div>"
            "<div><span>trades</span><b>", m.trades.str(), "</b></div>"
            "</div>"
            "<p class=e>There are no LP shares to hold: one market, one provider. Fees "
            "are already in the two numbers above &mdash; they accrue into the reserves "
            "rather than into a separate claim.</p></div>"
        );
    }

    function _add(MarketView memory m) private view returns (string memory) {
        return string.concat(
            "<div class=app><div class=hd><b>Add liquidity</b></div>",
            _field("db", Web.symbolOf(m.base), uint256(m.dBase)),
            _field("dq", Web.symbolOf(m.quote), uint256(m.dQuote)),
            "<button class=go id=add>Add</button>"
            "<p class=e>Either side alone is fine. The first press approves whichever "
            "token needs it and the second deposits &mdash; the button says which. The "
            "pool credits only what actually arrives, so a fee-on-transfer token is "
            "recorded at what it really sent rather than at what it claimed.</p></div>"
        );
    }

    function _remove(MarketView memory m) private view returns (string memory) {
        return string.concat(
            "<div class=app><div class=hd><b>Remove liquidity</b></div>",
            _field("wb", Web.symbolOf(m.base), uint256(m.dBase)),
            _field("wq", Web.symbolOf(m.quote), uint256(m.dQuote)),
            "<button class=go id=rm>Remove</button>"
            "<p class=e>Sent to the address that signs. A bonded market refuses this "
            "until the bond expires, which is the point of bonding one.</p></div>"
        );
    }

    function _field(string memory input, string memory sym, uint256 dec)
        private pure returns (string memory)
    {
        return string.concat(
            "<div class=fld><div class=lbl><span>amount</span>"
            "<span>", dec.str(), " decimals</span></div>"
            "<div class=row><input id=", input, " placeholder=\"0.0\" inputmode=decimal>"
            "<span class=tk>", sym, "</span></div></div>"
        );
    }

    function _terms(uint256 id, MarketView memory m) private view returns (string memory) {
        return string.concat(
            "<div class=app><div class=hd><b>Terms</b></div>"
            "<div class=fld><div class=lbl><span>fee</span><span>5% ceiling</span></div>"
            "<div class=row><input id=fb placeholder=\"0.30\" inputmode=decimal value=\"",
                Web.amount(uint256(m.feeBps), 2, 2),
            "\"><span class=tk>%</span></div></div>"
            "<button class=go id=fee>Set fee</button>"

            "<div class=fld style=\"margin-top:1.2rem\"><div class=lbl>"
            "<span>bond for</span><span>ratchet only</span></div>"
            "<div class=row><input id=bd placeholder=\"7\" inputmode=numeric>"
            "<span class=tk>days</span></div></div>"
            "<button class=go id=bond>Bond</button>"
            "<p class=e>A bond promises a buyer that nothing leaves and no term moves "
            "before it expires. It only ever ratchets forward, so it cannot be "
            "shortened once given &mdash; which is what makes it worth anything.</p>",

            _curve(id),
            "</div>"
        );
    }

    /// @dev The one control unique to this collection, and the one most
    ///      worth explaining on the page rather than in a footnote. Whether
    ///      the two have drifted is asked of the pool rather than guessed
    ///      at here — a page that recomputes a contract's own derivation is
    ///      a page that will one day disagree with it.
    function _curve(uint256 id) private view returns (string memory) {
        (bool pending, uint256 atCurve, uint256 atArt) = POOL.pendingCurve(id);
        return string.concat(
            "<h3 style=\"margin-top:1.6rem\">The curve</h3>"
            "<p class=e>How far the artwork has been turned through the fourth axis is "
            "what sets this market's concentration: barely turned is a wide, forgiving "
            "market, turned edge-on is a tight one that holds its price. The market "
            "keeps its own <em>copy</em> of that orientation rather than reading it "
            "live, because a renter may turn the solid and must not be able to "
            "concentrate a curve holding someone else's inventory and trade through "
            "it.</p>"
            "<div class=det><div><span>the curve is priced at</span><b>",
            atCurve.str(), " bps</b></div>"
            "<div><span>the artwork is turned to</span><b>", atArt.str(), " bps</b></div>"
            "</div>",
            pending
                ? "<p class=w>These have drifted apart. Syncing is deliberate and it is "
                  "yours to do &mdash; nothing happens until you say so.</p>"
                : "<p class=e>The curve matches the artwork.</p>",
            "<button class=go id=sync>Sync the curve to the artwork</button>"
        );
    }

    function _openMarket() private pure returns (string memory) {
        return
            "<div class=app><div class=hd><b>Open a market</b></div>"
            "<div class=fld><div class=lbl><span>base token</span></div>"
            "<div class=row><input id=ob placeholder=\"0x...\"></div></div>"
            "<div class=fld><div class=lbl><span>quote token</span></div>"
            "<div class=row><input id=oq placeholder=\"0x...\"></div></div>"
            "<div class=fld><div class=lbl><span>fee</span><span>5% ceiling</span></div>"
            "<div class=row><input id=of placeholder=\"0.30\" inputmode=decimal>"
            "<span class=tk>%</span></div></div>"
            "<button class=go id=open>Open</button>"
            "<p class=e>Any two ERC-20s. Nothing is checked about them beyond that they "
            "answer, so choose them the way you would choose a counterparty. Once open, "
            "anyone may trade against it and the fee accrues to the token &mdash; add "
            "inventory afterwards, or the curve has nothing to price.</p></div>";
    }
}
