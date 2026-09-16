// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IChrome, IDesk} from "./interfaces/Site.sol";

interface IRoomsDesk { function core() external pure returns (string memory); }

interface ITermDesk {
    function config() external view returns (string memory);
    function core() external pure returns (string memory);
}

/*───────────────────────────────────────────────────────────────────────────
  PageTerminal — no forms, every function

  The rest of the site is furniture around a handful of calls each. This
  page is the whole estate behind one input: type `help` and the commands
  are listed; type `mint` and a token is minted; an agent calls
  `window.TERM.run("say hello")` and reads the string that comes back. One
  code path for fingers and for models, because a machine surface that
  differs from the human one is two surfaces with two sets of bugs.
───────────────────────────────────────────────────────────────────────────*/
contract PageTerminal {
    IChrome   public immutable CHROME;
    IDesk     public immutable DESK;
    ITermDesk public immutable TERM;
    IRoomsDesk public immutable ROOMS;
    IRoomsDesk public immutable WILL;

    constructor(IChrome chrome, IDesk desk, ITermDesk term,
                IRoomsDesk rooms, IRoomsDesk will_) {
        CHROME = chrome; DESK = desk; TERM = term; ROOMS = rooms; WILL = will_;
    }

    function terminal() external view returns (string memory) {
        return string.concat(
            CHROME.head("IPSEITY \xc2\xb7 terminal"),
            CHROME.navTop(20),
            "<h1>terminal</h1>"
            "<p class=e>Everything the token offers, one line at a time. Reading works "
            "without a wallet; the first write asks for one, and speaks as a token you "
            "hold. Type <code>help</code>.</p>",
            DESK.bare(),
            TERM.config(),
            "<div id=tout class=term aria-live=polite></div>"
            "<input id=tin class=tinput autocomplete=off spellcheck=false "
            "placeholder=\"help\" aria-label=\"terminal input\">",
            _agents(),
            "<div id=s></div>",
            CHROME.wallet(),
            DESK.core(),
            TERM.core(),
            ROOMS.core(),
            WILL.core(),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    /// @dev The machine half, said plainly on the page it applies to.
    function _agents() private pure returns (string memory) {
        return
            "<h2>for agents</h2>"
            "<p class=e>This terminal is an API that happens to have a keyboard. "
            "<code>window.TERM.run(line)</code> executes any command and resolves to "
            "the same string a person would read; <code>window.TERM.commands()</code> "
            "returns the whole table as data &mdash; usage, description, and whether "
            "the command writes. A model driving this page needs no scraping: ask the "
            "terminal what it can do, then do it. The wallet stays in charge of "
            "signing &mdash; an agent can compose any transaction here and cannot "
            "approve one.</p>"
            "<p class=e>Off the page, the same surface is <code>/services.json</code>: "
            "addresses, selectors and shapes for building calldata with no browser "
            "at all.</p>";
    }
}
