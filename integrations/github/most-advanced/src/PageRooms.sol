// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";
import {Web} from "./lib/Web.sol";
import {IChrome, IDesk, IParley, ITalkDesk} from "./interfaces/Site.sol";

/*───────────────────────────────────────────────────────────────────────────
  PageRooms — the groups, and one of them

  A group is founded by a token, named once, and joined either by invitation
  or through an open door. The steward can invite and can evict; it cannot
  delete anything anyone said, because nothing here can.

  `/rooms` is the only page on this site that cannot be rendered: which
  rooms are yours depends on which token you are, and this contract has no
  way to know that until a wallet has said so. So the list is drawn by the
  client from `roomsOf`, and the page around it says what it is waiting for
  rather than showing an empty box.
───────────────────────────────────────────────────────────────────────────*/
contract PageRooms {
    using LibNum for uint256;

    IChrome      public immutable CHROME;
    IDesk        public immutable DESK;
    ITalkDesk    public immutable TALK;
    IParley      public immutable PARLEY;

    constructor(IChrome chrome, IDesk desk, ITalkDesk talk, IParley parley) {
        CHROME = chrome;
        DESK = desk;
        TALK = talk;
        PARLEY = parley;
    }

    /*═══════════════════ /rooms ═══════════════════*/

    function rooms() external view returns (string memory) {
        return string.concat(
            CHROME.head("IPSEITY \xc2\xb7 rooms"),
            CHROME.navTop(16),
            "<h1>rooms</h1>"
            "<p class=e><b>", PARLEY.groups().str(), "</b> groups have been founded. "
            "Yours are listed below once a wallet has told this page which token it is "
            "speaking as &mdash; nothing on chain maps an address to a room, only a "
            "token to a room.</p>",
            DESK.bare(),
            TALK.config(0, 0, 0),
            "<div class=gate>"
            "<h3>Connect to see your rooms</h3>"
            "<p class=e>The list comes from <code>roomsOf(token)</code>: every room this "
            "token has ever entered, and whether it is still in each. Nobody but the "
            "token itself can make that list longer &mdash; an invitation only records "
            "permission, and joining is the token's own transaction. A list a stranger "
            "can grow is a list a stranger can fill.</p>"
            "<button id=go>connect</button>"
            "</div>"
            "<div id=rooms></div>",
            _found(),
            "<div id=s></div>",
            CHROME.wallet(),
            DESK.core(),
            TALK.core(),
            TALK.rooms(),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    function _found() private view returns (string memory) {
        return string.concat(
            "<div class=only>"
            "<h2>found a group</h2>"
            "<p class=e>The token you are speaking as becomes its steward, and is its "
            "first member. An open door lets any token join without being asked; a "
            "closed one means the steward invites and the invited token accepts.</p>"
            "<label for=rname>name</label>"
            "<input id=rname maxlength=", PARLEY.MAX_NAME().str(),
            " placeholder=\"what this room is for\">"
            "<label for=ropen><input type=checkbox id=ropen style=\"width:auto;"
            "display:inline-block;margin-right:.5rem\">open door</label>"
            "<button id=found>found it</button>"
            "</div>"
        );
    }

    /*═══════════════════ /room/<n> ═══════════════════*/

    function room(uint256 index) external view returns (string memory) {
        uint256 key = PARLEY.groupKey(index);
        (, uint64 count, uint64 opened, uint32 members, uint8 kind, bool open,
         uint256 steward,, string memory name) = PARLEY.stateOf(key);

        if (kind != 1) return _noRoom(index);

        return string.concat(
            CHROME.head(string.concat("IPSEITY \xc2\xb7 ", Web.esc(name))),
            CHROME.navTop(16),
            "<h1>", Web.esc(name), "</h1>",
            _facts(index, count, opened, members, open, steward),
            DESK.bare(),
            TALK.config(key, 0, index),
            "<div class=gate>"
            "<h3>Connect to say something here</h3>"
            "<p class=e>Reading a group takes nothing at all. Writing takes membership, "
            "and membership is checked in the contract rather than on this page.</p>"
            "<button id=go>connect</button>"
            "</div>"
            "<div class=only>"
            "<label for=as>speaking as</label><select id=as></select>"
            "</div>"
            "<div id=log></div>"
            "<div class=only>"
            "<textarea id=say maxlength=1024 placeholder=\"say something\"></textarea>"
            "<button id=send>send</button>"
            "<button id=join>join</button>"
            "<button id=leave>leave</button>"
            "</div>",
            _steward(steward),
            "<div id=s></div>",
            CHROME.wallet(),
            DESK.core(),
            TALK.core(),
            TALK.rooms(),
            CHROME.foot(msg.sender, block.chainid)
        );
    }

    function _facts(
        uint256 index, uint64 count, uint64 opened, uint32 members, bool open, uint256 steward
    ) private pure returns (string memory) {
        return string.concat(
            "<dl>"
            "<dt>room</dt><dd>#", index.str(), "</dd>"
            "<dt>founded by</dt><dd><a href=\"/token/", steward.str(), "\">#",
                steward.str(), "</a></dd>"
            "<dt>since block</dt><dd>", uint256(opened).str(), "</dd>"
            "<dt>members</dt><dd>", uint256(members).str(), "</dd>"
            "<dt>messages</dt><dd>", uint256(count).str(), "</dd>"
            "<dt>door</dt><dd>", open ? "open to any token" : "by invitation", "</dd>"
            "</dl>"
        );
    }

    /// @dev Shown to everyone, refused by the contract for everyone else —
    ///      the same choice the pool page makes, for the same reason: a
    ///      control that is hidden is a control nobody knew existed.
    function _steward(uint256 steward) private pure returns (string memory) {
        return string.concat(
            "<h2>the steward</h2>"
            "<p class=e>#", steward.str(), " founded this room and can invite tokens to "
            "it and show them out of it. It cannot delete a message, edit one, or stop "
            "anyone reading &mdash; those are not powers this contract has to give.</p>"
            "<div class=only>"
            "<label for=who>invite a token</label>"
            "<input id=who inputmode=numeric placeholder=\"token number\">"
            "<button id=invite>invite</button>"
            "</div>"
            /*  The page said the steward could show a token out long before
                the page offered any way to do it. The roster is that way:
                who is actually here, each with the door beside them.    */
            "<h2>who is here</h2>"
            "<p class=e>Read from the chain a window of tokens at a time \xe2\x80\x94 "
            "membership is a mapping, not a list, and asking it directly is what a "
            "reader does instead of what an indexer would.</p>"
            "<div class=det id=roster>reading\xe2\x80\xa6</div>"
            "<div class=only><div class=det id=pend></div></div>"
        );
    }

    function _noRoom(uint256 index) private view returns (string memory) {
        return string.concat(
            CHROME.head("IPSEITY \xc2\xb7 no such room"),
            CHROME.navTop(16),
            "<h1>room #", index.str(), "</h1>"
            "<p class=e>No group with that number has been founded. There are <b>",
            PARLEY.groups().str(), "</b> so far, numbered from 1.</p>"
            "<p><a class=g href=\"/rooms\">the rooms that do exist</a></p>",
            CHROME.foot(msg.sender, block.chainid)
        );
    }
}
