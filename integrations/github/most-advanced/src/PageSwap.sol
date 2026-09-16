// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {Web} from "./lib/Web.sol";
import {Assets} from "./lib/Assets.sol";
import {IChrome, IDesk, IPoolRead, IVenue, Look} from "./interfaces/Site.sol";

interface IDeskUni {
    function config() external view returns (string memory);
    function base() external pure returns (string memory);
}

interface IDeskTrade {
    function swap() external pure returns (string memory);
}

/*───────────────────────────────────────────────────────────────────────────
  PageSwap — any pair, on the venue that has the liquidity

  Every token in this collection runs its own exchange, and its market page
  trades against that. This page is the other thing: two ordinary ERC-20s,
  nothing to do with any token, routed to Uniswap v3 because that is where
  the depth is.

  They are separate pages on purpose. A single card that sometimes traded
  the token's own market and sometimes routed elsewhere would be a card
  where the most important fact — who gets the fee, and whose curve set the
  price — is invisible.

  ── the dropdown, and the honest answer about it ──

  "Will it show every token Uniswap shows?" No, and nothing that runs
  without a server can. Uniswap's dropdown is a JSON file fetched from
  tokenlists.org at page load; the list decides what you can see and the
  list is not on chain.

  What this does instead is drop the middleman rather than reproduce it.
  The `<select>` is seeded from the chain — the wrapped native token, plus
  every asset a market in this collection actually trades — and beside it is
  a box for any address at all. Paste one and the page asks the token what
  it is, asks the factory whether a pool exists at each of the four fee
  tiers, and asks each of those pools how deep it is at the current tick.

  So: **anything Uniswap can trade, this page can trade**, because it checks
  the pool rather than checking a list. What it will not do is show you a
  name and let you assume the rest. A token list tells you a ticker. This
  tells you whether the trade fills.

  ── one thing this page does not do ──

  Single hop only. Uniswap's hosted router splits an order across pools and
  prices the gas of each route; a multi-hop path is a `bytes` argument and
  this client has no ABI coder, so it cannot build one. What it does do is
  quote all four fee tiers and take the best, which is stated on the card,
  because a page that quietly returned a worse price while implying it had
  searched would be worse than one that says where it looked.
───────────────────────────────────────────────────────────────────────────*/
contract PageSwap {
    using LibNum for uint256;

    IChrome   public immutable CHROME;
    IPoolRead public immutable POOL;
    IDesk     public immutable DESK;
    IDeskUni   public immutable DESKU;
    IDeskTrade public immutable DESKT;
    IVenue     public immutable VENUE;

    /// @dev Twenty-four rows, three reads each, roughly 1M gas of `eth_call`.
    uint256 public constant PAGE = 24;

    constructor(
        IChrome chrome, IPoolRead pool, IDesk desk,
        IDeskUni deskU, IDeskTrade deskT, IVenue venue
    ) {
        CHROME = chrome;
        POOL = pool;
        DESK = desk;
        DESKU = deskU;
        DESKT = deskT;
        VENUE = venue;
    }

    /*═══════════════════ /swap ═══════════════════*/

    function swap() external view returns (string memory) {
        if (!VENUE.present()) {
            return string.concat(
                CHROME.head("IPSEITY \xc2\xb7 swap"),
                CHROME.navTop(9),
                "<h1>swap</h1>",
                _noVenue(),
                CHROME.foot(msg.sender, block.chainid)
            );
        }
        return string.concat(
            CHROME.head("IPSEITY \xc2\xb7 swap"),
            CHROME.navTop(9),
            DESKU.config(),
            _card(),
            _how(),
            _where(),
            CHROME.wallet(),
            DESK.core(),
            DESKU.base(),
            DESKT.swap(),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    function _noVenue() private view returns (string memory) {
        return string.concat(
            "<p class=e>There is no Uniswap v3 deployment wired up on chain <code>",
            block.chainid.str(),
            "</code>. That is a deployment fact, not a failure: this contract was given "
            "the zero address for the factory, so every read degrades to \"no venue\" "
            "and this page says so rather than showing prices from nowhere.</p>"
            "<p class=e>The collection's own markets are unaffected &mdash; each token "
            "runs its exchange out of <code>Pool</code>, which needs nothing external "
            "at all.</p>"
            "<p><a class=g href=\"/open\">the markets that do exist here &rarr;</a></p>"
        );
    }

    /// @dev The same card as the token market page, with two differences that
    ///      matter: both sides choose a token, and the fee tier is a choice
    ///      because Uniswap has four of them for a pair and this collection
    ///      has one market per token.
    function _card() private view returns (string memory) {
        return string.concat(
            "<div class=app>"
            "<div class=hd><b>Swap</b>"
            "<button class=ico id=cog>slippage &amp; deadline</button></div>"
            "<div class=set id=set hidden>"
            "<div>Slippage tolerance, now <b id=sl>0.5%</b> &mdash; the most the price "
            "may move against you between now and the block your trade lands in. Past "
            "it the trade reverts rather than filling badly.</div>"
            "<button data-slip=10>0.1%</button><button data-slip=50>0.5%</button>"
            "<button data-slip=100>1%</button><button data-slip=300>3%</button>"
            "<div style=\"margin-top:.5rem\">Deadline <input id=dl value=\"30\"> minutes"
            "</div></div>",
            _side("You pay", "si", "bi", "ts", "ta", "tax", true),
            "<button class=flip id=flip title=\"turn it round\">&darr;</button>",
            _side("You receive", "so", "bo", "rs", "tb", "tbx", false),
            "<div class=det id=rt></div>"
            "<div class=det id=det></div>"
            "<button class=go id=go disabled>Choose two tokens</button>"
            "<div id=s></div></div>"
        );
    }

    function _side(
        string memory label, string memory input, string memory balance,
        string memory tick, string memory sel, string memory box, bool editable
    ) private view returns (string memory) {
        return string.concat(
            "<div class=fld><div class=lbl><span>", label,
            "</span><span id=", balance, "></span></div>"
            "<div class=row><input id=", input, " placeholder=\"0.0\" inputmode=decimal",
            editable ? "" : " readonly", ">",
            editable ? "<button class=mx id=mx>MAX</button>" : "",
            "<span class=tk id=", tick, ">select</span></div>",
            "<select id=", sel, ">", _options(), "</select>",
            "<input id=", box, " placeholder=\"0x\xe2\x80\xa6 any ERC-20 address\" hidden>"
            "</div>"
        );
    }

    /*  The offered assets, derived rather than fetched — and the last option
        is the one that makes the list a convenience instead of a limit.   */
    function _options() private view returns (string memory) {
        address w = VENUE.WRAPPED();
        string memory opts = "<option value=\"\">choose\xe2\x80\xa6</option>";
        if (w != address(0)) {
            opts = string.concat(opts, _option(w));
        }
        (address[] memory list,) = Assets.derive(POOL, 0, 32);
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == w) continue;
            opts = string.concat(opts, _option(list[i]));
        }
        return string.concat(opts, "<option value=\"?\">paste an address\xe2\x80\xa6</option>");
    }

    function _option(address t) private view returns (string memory) {
        return string.concat(
            "<option value=\"", LibNum.hexAddr(t), "\">", Web.symbolOf(t),
            " \xc2\xb7 ", _short(t), "</option>"
        );
    }

    /// @dev Both the ticker and the address, always. A ticker is chosen by
    ///      whoever deployed the token and two tokens may share one; the
    ///      address is the thing that is actually being traded.
    function _short(address t) private pure returns (string memory) {
        bytes memory h = bytes(LibNum.hexAddr(t));
        bytes memory o = new bytes(13);
        for (uint256 i; i < 6; ++i) o[i] = h[i];
        o[6] = 0xe2; o[7] = 0x80; o[8] = 0xa6;              // an ellipsis
        for (uint256 i; i < 4; ++i) o[9 + i] = h[h.length - 4 + i];
        return string(o);
    }

    /*═══════════════════ what it is doing, in prose ═══════════════════*/

    function _how() private view returns (string memory) {
        return string.concat(
            "<h2>what this card does</h2>"
            "<p class=e>It quotes your pair at every fee tier that has a pool &mdash; one "
            "<code>eth_call</code> to QuoterV2 each &mdash; and takes the best answer. "
            "The tier it chose is named under the amount, and you can override it. "
            "Single hop only: routing through an intermediate token needs a packed "
            "<code>bytes</code> path, and this client has no ABI coder, so it cannot "
            "build one and does not pretend to have searched for one.</p>"
            "<p class=e>The quote is a real execution. QuoterV2 is not a view function "
            "&mdash; it makes the pool perform the swap and catches the revert &mdash; "
            "so your browser can run it with <code>eth_call</code>, which executes and "
            "discards, and this page contract cannot run it at all. That is why the "
            "number in the card comes from your wallet's node and not from the HTML.</p>",
            _routerNote()
        );
    }

    /// @dev Which of the two routers this deployment uses, and what that
    ///      costs. Neither answer is the safe one, so the page states the
    ///      trade-off rather than implying there is none.
    function _routerNote() private view returns (string memory) {
        return VENUE.ROUTER_KIND() == 0
            ? "<p class=e>This deployment sends to the v3-periphery "
              "<code>SwapRouter</code>, whose <code>exactInputSingle</code> carries a "
              "<code>deadline</code>. Your trade therefore expires: if it is still "
              "unmined when the deadline passes it reverts rather than filling at a "
              "price from another hour.</p>"
            : "<p class=e class=w>This deployment sends to <code>SwapRouter02</code>, "
              "whose <code>exactInputSingle</code> has <em>no deadline field at all</em>. "
              "The router does offer one, behind <code>multicall(uint256,bytes[])</code>, "
              "and that argument is a dynamic array of dynamic bytes &mdash; unreachable "
              "for a client with no ABI coder. So the slippage floor is your only "
              "protection here, and a transaction that sits unmined can still fill later "
              "at any price above it. The deadline box is shown as inert rather than "
              "hidden, because a deadline field that silently did nothing would be "
              "worse than none.</p>";
    }

    function _where() private view returns (string memory) {
        return string.concat(
            "<h2>the addresses this page will send to</h2>"
            "<p class=e>Check them against Uniswap's own published deployments rather "
            "than against this contract's word. They are constructor arguments of "
            "<code>Venue</code>, not constants compiled into it &mdash; the v3 addresses "
            "are identical on Ethereum, Arbitrum, Optimism and Polygon and different on "
            "Base, so anything that hardcoded one set would be quietly wrong on exactly "
            "one chain.</p><dl>",
            "<dt>factory</dt><dd><code>", LibNum.hexAddr(VENUE.FACTORY()), "</code></dd>",
            "<dt>quoter</dt><dd><code>", LibNum.hexAddr(VENUE.QUOTER()), "</code>"
                "<span class=m>read only, and only from your browser</span></dd>",
            "<dt>router</dt><dd><code>", LibNum.hexAddr(VENUE.ROUTER()), "</code>"
                "<span class=m>", VENUE.ROUTER_KIND() == 0
                    ? "v3-periphery SwapRouter &mdash; eight words, deadline at index 4"
                    : "SwapRouter02 &mdash; seven words, no deadline",
                "</span></dd>",
            "<dt>positions</dt><dd><code>", LibNum.hexAddr(VENUE.POSITIONS()), "</code>"
                "<span class=m>only the liquidity pages send here</span></dd>",
            "<dt>venue</dt><dd><code>", LibNum.hexAddr(address(VENUE)), "</code>"
                "<span class=m>this collection's reader &mdash; it has no function that "
                "moves anything</span></dd>",
            "</dl>"
            "<p class=e>Approval goes to the router directly, with a plain ERC-20 "
            "<code>approve</code>. Permit2 is not involved: it lives in "
            "<code>UniversalRouter</code>, which this page does not use. Your funds move "
            "from your wallet to a Uniswap contract and nothing in this collection is on "
            "the path &mdash; every contract that renders this page is <code>view</code> "
            "throughout and has no function that could take anything.</p>"
            "<p class=e>That is a claim about <em>this</em> page, not about the "
            "collection. <code>Pool</code>, which runs each token\u0027s own market, does "
            "spend what you approve to it &mdash; that is what a market is, and it is on "
            "a different page with a different approval. The distinction is the point: "
            "an allowance you grant here goes to Uniswap\u0027s router and an allowance "
            "you grant there goes to the pool, and neither page can use the other\u0027s."
            "</p>"
            "<p class=e>Nothing here has been audited.</p>"
        );
    }

}
