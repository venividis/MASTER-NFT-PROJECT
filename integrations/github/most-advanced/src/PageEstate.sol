// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {IChrome, IDesk} from "./interfaces/Site.sol";

/*───────────────────────────────────────────────────────────────────────────
  PageEstate — the will, and the window

  Two arrangements about a token you are not standing next to, on one page
  because they answer the same question from opposite ends. Succession is
  what happens if you never come back. Consignment is what happens while
  you are away on purpose.

  Both move a token without you present, so both are written here with
  their costs in the open rather than behind a star. A page that has to
  bury what a control gives away is a page describing a control that
  should not exist.
───────────────────────────────────────────────────────────────────────────*/
contract PageEstate {
    using LibNum for uint256;

    IChrome public immutable CHROME;
    IDesk   public immutable DESK;
    address public immutable HUB;
    address public immutable SUCC;
    address public immutable CONS;

    /*  The client lives next door. Two apps' worth of gating, two readers
        and eighteen selectors came to eleven kilobytes of script, and this
        contract was already fifteen of prose and config — together they
        were six per cent past what a chain will accept. The split is the
        same one DeskTerm made when its word table outgrew it: one page,
        two contracts, and nothing about the split visible from the page. */
    IDesk   public immutable ESTATE;

    /*  Mirrors of the contracts' own bounds. They reach the bars and the
        client from here so a cap typed in three places cannot disagree
        with itself — the same rule the seal page follows.               */
    uint256 public constant MIN_QUIET_D  = 30;
    uint256 public constant MAX_QUIET_D  = 3650;
    uint256 public constant MIN_NOTICE_D = 7;
    uint256 public constant MAX_NOTICE_D = 365;
    uint256 public constant MAX_TERM_D   = 730;
    uint256 public constant MAX_CUT_BPS  = 5000;

    constructor(IChrome chrome, IDesk desk, IDesk estate,
                address hub, address succ, address cons) {
        CHROME = chrome;
        DESK = desk;
        ESTATE = estate;
        HUB = hub;
        SUCC = succ;
        CONS = cons;
    }

    /*═══════════════════ /estate ═══════════════════*/

    function estatePage() external view returns (string memory) {
        return string.concat(
            CHROME.head("IPSEITY \xc2\xb7 estate"),
            CHROME.navTop(19),
            "<h1>estate</h1>"
            "<p class=e>Everything a token here gathers is attached to the token "
            "and not to the wallet: the rooms it keeps, the vault it locked, the "
            "name it answers to, whatever its hands hold. That is the good "
            "property, and it has a bad twin \xe2\x80\x94 lose the key and none of "
            "it is merely out of reach, it is gone in the strong sense. These are "
            "the two arrangements for a token you are not standing next to.</p>",
            _config(),
            _will(),
            _window(),
            CHROME.wallet(),
            DESK.bare(),
            DESK.core(),
            ESTATE.core(),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    function _config() private view returns (string memory) {
        return string.concat(
            "<script type=\"application/json\" id=\"Q\">{",
            "\"hub\":\"",  LibNum.hexAddr(HUB),
            "\",\"succ\":\"", LibNum.hexAddr(SUCC),
            "\",\"cons\":\"", LibNum.hexAddr(CONS),
            "\",\"minQ\":", MIN_QUIET_D.str(),
            ",\"maxQ\":",  MAX_QUIET_D.str(),
            ",\"minN\":",  MIN_NOTICE_D.str(),
            ",\"maxN\":",  MAX_NOTICE_D.str(),
            ",\"maxT\":",  MAX_TERM_D.str(),
            ",\"maxCut\":", MAX_CUT_BPS.str(),
            ",\"sel\":{",
            "\"ownerOf\":\"",  _sel("ownerOf(uint256)"),
            "\",\"approve\":\"", _sel("approve(address,uint256)"),
            "\",\"getApp\":\"",  _sel("getApproved(uint256)"),
            "\",\"locked\":\"",  _sel("locked(uint256)"),
            "\",\"arrange\":\"", _sel("arrange(uint256,address,uint256,uint64,uint64)"),
            "\",\"revoke\":\"",  _sel("revoke(uint256)"),
            "\",\"still\":\"",   _sel("stillHere(uint256)"),
            "\",\"summon\":\"",  _sel("summon(uint256)"),
            "\",\"claim\":\"",   _sel("claim(uint256)"),
            "\",\"planOf\":\"",  _sel("planOf(uint256)"),
            "\",\"heirOf\":\"",  _sel("heirOf(uint256)"),
            "\",\"would\":\"",   _sel("wouldPass(uint256)"),
            "\",\"knockAt\":\"", _sel("knockableAt(uint256)"),
            "\",\"opensAt\":\"", _sel("opensAt(uint256)"),
            "\",\"consign\":\"", _sel("consign(uint256,address,uint96,uint16,uint64)"),
            "\",\"ask\":\"",     _sel("ask(uint256,uint96)"),
            "\",\"buy\":\"",     _sel("buy(uint256,uint96)"),
            "\",\"reclaim\":\"", _sel("reclaim(uint256)"),
            "\",\"release\":\"", _sel("release(uint256)"),
            "\",\"noteOf\":\"",  _sel("noteOf(uint256)"),
            "\",\"split\":\"",   _sel("split(uint256)"),
            "\",\"owed\":\"",    _sel("owed(address)"),
            "\",\"draw\":\"",    _sel("withdraw()"),
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

    /*═══════════════════ the will ═══════════════════*/

    function _will() private pure returns (string memory) {
        return string.concat(
            "<div class=app>"
            "<div class=hd><b>Succession</b><span class=\"m\" id=qws></span></div>"
            "<div class=fld><div class=lbl><span>token</span>"
            "<span>the one being left</span></div>"
            "<div class=row><input id=qid placeholder=\"0\" inputmode=numeric></div></div>"
            "<div class=det id=qst></div>"

            "<div class=fld><div class=lbl><span>to</span>"
            "<span>an address, or a token number</span></div>"
            "<div class=row><input id=qto placeholder=\"0x\\u2026 or #7\"></div></div>"
            "<p class=e>Naming a <b>token</b> rather than an address is the version "
            "that survives your heir changing wallets, which is the likeliest way "
            "for a ten-year arrangement to rot: it goes to whoever holds that token "
            "on the day, not to a key somebody wrote down once.</p>"

            "<label>silence that opens the door <b id=qql>1 year</b></label>"
            "<input type=range id=qqR min=", MIN_QUIET_D.str(),
            " max=", MAX_QUIET_D.str(), " value=365>"
            "<label>then a notice of <b id=qnl>30 days</b></label>"
            "<input type=range id=qnR min=", MIN_NOTICE_D.str(),
            " max=", MAX_NOTICE_D.str(), " value=30>"
            "<div class=det id=qsum></div>"

            "<p class=w>This needs a standing approval on the token, which is the "
            "thing every warning tells you never to give. What it buys: this "
            "contract has one function that moves a token, it moves it only to the "
            "address in that token&#39;s own arrangement, only after both clocks "
            "have run out, and you can erase the arrangement or withdraw the "
            "approval at any second up to the last. There is no curator, no pause "
            "and no upgrade. That is narrower than an operator approval. It is "
            "still an approval.</p>"

            "<button class=go id=qarr disabled>Pick a token</button>"
            "<button class=go id=qapp disabled hidden>Approve the succession</button>"
            "<div class=row><button class=mx id=qstill disabled>I am still here"
            "</button><button class=mx id=qrev disabled>Revoke</button></div>"
            "<div class=row><button class=mx id=qsum2 disabled>Knock</button>"
            "<button class=mx id=qcl disabled>Claim</button></div>"
            "</div>"

            "<p class=w>You have to say you are here, once per silence. This used to "
            "count ordinary use of the instrument, through the counter the hub stamps "
            "on every operation \xe2\x80\x94 and that was forgeable. Bringing a token&#39;s "
            "account into being is open to anyone, so a stranger could reset your "
            "silence for the price of gas and keep your heir from ever knocking. Every "
            "remaining stamp is reachable by an operator or a renter, and a switch a "
            "third party can hold open is not a switch. So only your own word counts, "
            "and the date is printed above.</p>"
            "<p class=e>Silence is not death, and this does not pretend to know the "
            "difference. It knows the token was not used. Choosing the silence is a "
            "bet about your own habits, which is why the knock is public and why one "
            "touch cancels it: a switch nobody can hear is a trap.</p>"
            "<p class=e>Two things it will not do. A <b>soulbound</b> token cannot be "
            "inherited \xe2\x80\x94 the bolt refuses every transfer including this "
            "one, so a bolt outlives its holder, and the panel says so rather than "
            "looking healthy until the day it matters. And a plan does not survive a "
            "<b>sale</b>: the buyer never agreed to it.</p>"
        );
    }

    /*═══════════════════ the window ═══════════════════*/

    function _window() private pure returns (string memory) {
        return string.concat(
            "<h2>consignment</h2>"
            "<div class=app>"
            "<div class=hd><b>Consign</b><span class=\"m\" id=cws></span></div>"
            "<div class=fld><div class=lbl><span>token</span>"
            "<span>what goes in the window</span></div>"
            "<div class=row><input id=cid placeholder=\"0\" inputmode=numeric></div></div>"
            "<div class=det id=cst></div>"

            "<div class=fld><div class=lbl><span>agent</span>"
            "<span>who may price it</span></div>"
            "<div class=row><input id=cag placeholder=\"0x\\u2026\"></div></div>"
            "<div class=fld><div class=lbl><span>floor</span>"
            "<span>the least it may ever sell for</span></div>"
            "<div class=row><input id=cfl placeholder=\"0.5\" inputmode=decimal>"
            "<span class=m>ETH</span></div></div>"

            "<label>the agent&#39;s cut <b id=ccl>10%</b></label>"
            "<input type=range id=ccR min=0 max=", MAX_CUT_BPS.str(), " step=25 value=1000>"
            "<label>for <b id=ctl>30 days</b></label>"
            "<input type=range id=ctR min=1 max=", MAX_TERM_D.str(), " value=30>"
            "<div class=det id=csum></div>"

            "<p class=w>While it is consigned, this contract owns the token. You are "
            "not the owner for the length of the term, and everything that asks the "
            "hub who holds it \xe2\x80\x94 the rooms it keeps, what its hands can be "
            "asked to do, any succession you arranged \xe2\x80\x94 will answer with "
            "an escrow address instead of yours. That is what handing something to a "
            "dealer means. What comes back to you is the <b>instrument</b>: you are "
            "set as the token&#39;s user for the term, so you go on committing and "
            "opening nodes while the dealer holds title to sell.</p>"

            "<button class=go id=ccon disabled>Pick a token</button>"
            "<div class=row><button class=mx id=cask disabled>Set the asking price"
            "</button><input id=cap placeholder=\"1.0\" inputmode=decimal "
            "style=\"max-width:8rem\"></div>"
            "<div class=row><button class=mx id=cbuy disabled>Buy</button>"
            "<button class=mx id=crec disabled>Send it home</button>"
            "<button class=mx id=crel disabled>Release</button></div>"
            "<div class=det id=cowe></div>"
            "<button class=go id=cdraw disabled hidden>Withdraw</button>"
            "</div>"

            "<p class=e>The floor is the whole mechanism. An agent may price it "
            "anywhere at or above the number you wrote and never one wei below, may "
            "not move it anywhere but to a buyer who paid, and cannot keep it by "
            "going quiet: once the term is out, <b>anybody</b> may send it home, "
            "because requiring you to be alive to ask is the same trap one floor "
            "down. Ending it early takes the agent, since a term that binds one side "
            "is not a term.</p>"
            "<p class=e>Buying names the price you agreed to, not the price the "
            "contract happens to hold when your transaction mines. Without that, an "
            "agent watching the pool could raise the ask into whatever you sent and "
            "keep the difference; with it, the same move is a revert that costs you "
            "gas and nothing else. Overpayment comes back.</p>"
            "<p class=e>Money is credited here and never pushed. Each party takes "
            "their own, so a seller whose wallet reverts on receipt cannot wedge the "
            "sale for the agent, the royalty, or anyone after them.</p>"
        );
    }
}
