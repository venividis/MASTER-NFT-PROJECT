// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {Hook} from "./lib/Hook.sol";
import {IChrome} from "./interfaces/Site.sol";

/*───────────────────────────────────────────────────────────────────────────
  PageHook — what a v4 hook's address already tells you

  Its own route, at `/hook/<address>`, for a reason worth stating: this is a
  thing you send to somebody. "Here is the hook that pool uses, and here is
  what it is allowed to do to you" is a link, and a link that renders with
  JavaScript switched off because a contract assembled it.

  Uniswap v4 decides which callbacks a hook receives by testing bits of the
  hook's own address — fourteen callbacks, the low fourteen bits. So the
  answer on this page is not a claim about the hook that could be wrong. It
  is the mechanism: the PoolManager tests these very bits to decide what to
  invoke, so a hook cannot carry the swap bit and not intercept swaps, and
  cannot intercept swaps without carrying it.

  That makes this page strictly better than reading verified source, which
  tells you what the code says rather than what the pool will do.

  It is also, precisely, half of the story, and the page says the other half
  every time: **the bits prove a power exists and say nothing about how it
  is used.** A hook that unlocks liquidity on Friday and one that never
  unlocks it have identical address shapes. What this page produces is a
  list of what to go and read — not a verdict.
───────────────────────────────────────────────────────────────────────────*/
contract PageHook {
    using LibNum for uint256;

    IChrome public immutable CHROME;

    constructor(IChrome chrome) {
        CHROME = chrome;
    }

    function hook(address at) external view returns (string memory) {
        return string.concat(
            CHROME.head("IPSEITY \xc2\xb7 hook"),
            CHROME.navTop(15),
            at == address(0) ? _ask() : _inspect(at),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    function _ask() private pure returns (string memory) {
        return
            "<h1>read a hook</h1>"
            "<p class=e>Put a v4 hook's address in the path &mdash; "
            "<code>/hook/0x\xe2\x80\xa6</code> &mdash; and this page says which of the "
            "fourteen callbacks Uniswap will hand it, read from the address itself with "
            "no call and nothing fetched.</p>"
            "<p><a class=g href=\"/launch\">the launchpad &rarr;</a></p>";
    }

    /// @notice What a hook address says about itself, rendered by the
    ///         contract so it is there with JavaScript switched off.
    function _inspect(address hook) private view returns (string memory) {
        uint16 f = Hook.flags(hook);
        string memory rows;
        for (uint256 i; i < 14; ++i) {
            bool on = uint160(hook) & Hook.bit(i) != 0;
            rows = string.concat(
                rows,
                "<tr><td>", on ? "<b class=ok>yes</b>" : "<span class=m>no</span>",
                "</td><td><code>", Hook.name(i), "</code></td><td>",
                on ? Hook.meaning(i) : "", "</td></tr>"
            );
        }
        return string.concat(
            "<h1>", Hook.inert(hook) ? "not a hook" : "a hook", "</h1>"
            "<p class=e><code>", LibNum.hexAddr(hook), "</code></p>",
            Hook.inert(hook)
                ? "<p class=e>The low fourteen bits of this address are all zero, so "
                  "Uniswap v4 will never hand it a callback. It may be a perfectly good "
                  "contract; it is not a hook, and a pool created with it here behaves "
                  "exactly as if it had no hook at all. If somebody described this "
                  "address as one, that is the thing to ask about.</p>"
                : "",
            _verdict(hook),
            "<table><tr><th></th><th>callback</th><th>which means</th></tr>",
            rows, "</table>",
            "<p class=e>Fourteen bits, value <code>0x",
            _hex4(f), "</code>. Read straight off the address with no call &mdash; and "
            "for the same reason, not falsifiable: the PoolManager tests these very bits "
            "to decide what to invoke.</p>"
            "<p class=e class=w>What this cannot tell you is whether the powers are used "
            "well. A hook that unlocks on Friday and one that never unlocks have the "
            "same address shape. This is the list of what to go and read.</p>"
            "<p><a class=g href=\"/launch\">back to the launchpad &rarr;</a></p>"
        );
    }

    function _verdict(address hook) private pure returns (string memory) {
        if (Hook.inert(hook)) return "";
        return string.concat(
            "<dl>",
            Hook.touchesSwaps(hook)
                ? "<dt>swaps</dt><dd class=w>This hook is called on every trade and can "
                  "refuse, reprice, or take a cut of one.</dd>"
                : "<dt>swaps</dt><dd class=ok>Untouched. The pool prices trades on its "
                  "own.</dd>",
            Hook.guardsExits(hook)
                ? "<dt>withdrawals</dt><dd class=w>This hook is called when liquidity is "
                  "removed and can refuse it, or take a cut. That is how a lock is "
                  "enforced &mdash; and how liquidity is trapped. The address cannot "
                  "tell you which.</dd>"
                : "<dt>withdrawals</dt><dd class=ok>Untouched. Liquidity can always be "
                  "taken out.</dd>",
            "</dl>"
        );
    }

    function _hex4(uint16 v) private pure returns (string memory) {
        bytes memory hexd = "0123456789abcdef";
        bytes memory o = new bytes(4);
        for (uint256 i; i < 4; ++i) o[3 - i] = hexd[(v >> (i * 4)) & 0x0f];
        return string(o);
    }

}
