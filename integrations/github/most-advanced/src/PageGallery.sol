// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {Section} from "./lib/Types.sol";
import {IHub, IPoolRead, ILeaseRead, IChrome} from "./interfaces/Site.sol";

interface INames { function solidName(uint8 f) external view returns (string memory); }

/*───────────────────────────────────────────────────────────────────────────
  PageGallery — the whole collection, at a glance

  Every token, newest first, wearing its own on-chain still — the browser
  fetches each `/token/<id>/sigil.svg` as an ordinary image, so this page
  costs a page and the pictures cost pictures. Badges say what a token is
  doing for a living: running a market, up for rent, or simply being.
───────────────────────────────────────────────────────────────────────────*/
contract PageGallery {
    using LibNum for uint256;
    using Section for uint256;

    uint256 public constant PER_PAGE = 24;

    IHub       public immutable HUB;
    IChrome    public immutable CHROME;
    IPoolRead  public immutable POOL;
    ILeaseRead public immutable LEASE;
    INames     public immutable SIGIL;

    constructor(IHub hub, IChrome chrome, IPoolRead pool, ILeaseRead lease, INames sigil) {
        HUB = hub; CHROME = chrome; POOL = pool; LEASE = lease; SIGIL = sigil;
    }

    function gallery(uint256 page) external view returns (string memory) {
        uint256 supply = HUB.totalSupply();
        return string.concat(
            CHROME.head("IPSEITY \xc2\xb7 the collection"),
            CHROME.navTop(22),
            "<h1>the collection</h1>"
            "<p class=e><b>", supply.str(), "</b> issued. Every still below is the SVG "
            "the contract returns as that token's image &mdash; drawn by Solidity when "
            "your browser asks, cached fifteen seconds, owned by nobody's server. "
            "Badges say what a token is doing for a living.</p>",
            _grid(supply, page),
            _pager(supply, page),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    function _grid(uint256 supply, uint256 page) private view returns (string memory out) {
        if (supply == 0) return "<p class=e>None issued yet.</p>";
        uint256 skip = page * PER_PAGE;
        if (skip >= supply) return "<p class=e>Past the end of the collection.</p>";
        uint256 from = supply - skip;                  // newest first
        uint256 to = from > PER_PAGE ? from - PER_PAGE : 0;
        out = "<div class=gal>";
        for (uint256 id = from; id > to; --id) out = string.concat(out, _cell(id));
        return string.concat(out, "</div>");
    }

    function _cell(uint256 id) private view returns (string memory) {
        string memory t = id.str();
        (,,,,, bool market,,,,,,) = POOL.market(id);
        (bool rentable,,,,,,,,) = LEASE.listing(id);
        return string.concat(
            "<a class=gcell href=\"/token/", t, "\">",
            "<img src=\"/token/", t, "/sigil.svg\" loading=lazy alt=\"the still of #", t, "\">",
            "<span class=gid>#", t, "</span>",
            "<span class=gname>", SIGIL.solidName(HUB.sectionOf(id).form()), "</span>",
            "<span class=gtags>",
            market ? "<i class=ok>market</i>" : "",
            rentable ? "<i class=w>for rent</i>" : "",
            HUB.userOf(id) != address(0) ? "<i>leased</i>" : "",
            "</span></a>"
        );
    }

    function _pager(uint256 supply, uint256 page) private pure returns (string memory) {
        if (supply <= PER_PAGE) return "";
        string memory out = "<p>";
        if (page > 0) out = string.concat(
            out, "<a class=g href=\"/gallery/", (page - 1).str(), "\">&larr; newer</a>");
        if ((page + 1) * PER_PAGE < supply) out = string.concat(
            out, "<a class=g href=\"/gallery/", (page + 1).str(), "\">older &rarr;</a>");
        return string.concat(out, "</p>");
    }
}
