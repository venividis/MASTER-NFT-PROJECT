// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Engine} from "../src/Engine.sol";
import {Sigil} from "../src/Sigil.sol";
import {Renderer} from "../src/Renderer.sol";
import {Ipseity, IRenderer} from "../src/Ipseity.sol";
import {IpseityAccount} from "../src/IpseityAccount.sol";
import {GripVault} from "../src/GripVault.sol";
import {Parley, ISpeaker} from "../src/Parley.sol";
import {ERC6551Registry} from "./mocks/ERC6551Registry.sol";

/*───────────────────────────────────────────────────────────────────────────
  A chat with no server is a chat you can be locked out of by arithmetic.

  The interesting failures here are not "a message is stored". They are the
  ones where the wrong party gets to speak as somebody else's token, where a
  room key collides with another room, where the back-link that makes the
  archive readable stops going backwards, and where a list a stranger can
  grow becomes a list a stranger can fill.
───────────────────────────────────────────────────────────────────────────*/
contract ParleyTest is Test {
    Ipseity token;
    Parley  parley;

    address holder = address(this);
    address other  = address(0x0777);
    address nobody = address(0xDEAD);

    function setUp() public {
        vm.etch(
            0x000000006551c19487814612e58FE06813775758,
            address(new ERC6551Registry()).code
        );
        Engine engine = new Engine(false);
        Renderer renderer = new Renderer(engine, new Sigil());
        engine.loadHead("<html><head></head>");
        engine.loadBody("<body></body></html>");
        engine.freeze();

        token = new Ipseity(IRenderer(address(renderer)),
            address(new IpseityAccount()), address(new GripVault()), 1, 4096);
        parley = new Parley(ISpeaker(address(token)));

        vm.deal(holder, 10 ether);
        vm.deal(other, 10 ether);
        vm.roll(1000);

        token.mint{value: 0.01 ether}();                  // #1, this contract
        token.mint{value: 0.01 ether}();                  // #2, this contract
        token.transferFrom(holder, other, 2);             // #2 goes to `other`
    }

    /*═══════════════ who may speak ═══════════════*/

    function test_onlyTheHolderSpeaksAsATheirToken() public {
        vm.prank(nobody);
        vm.expectRevert(Parley.NotYours.selector);
        parley.speak(0, 1, 0, "hello");

        parley.speak(0, 1, 0, "hello");                    // the holder can
        (, uint64 count,,,,,,,) = parley.stateOf(0);
        assertEq(count, 1, "the commons did not record it");
    }

    /// @dev The bound account is the token acting for itself, and its session
    ///      keys are the holder's own delegation. The renter is not: a lease
    ///      buys the instrument's use, not its name.
    function test_theBoundAccountMaySpeakAndTheRenterMayNot() public {
        token.embody(1);
        address bound = token.account(1);
        assertTrue(parley.mayActAs(1, bound), "the token cannot speak as itself");

        token.setUser(1, nobody, uint64(block.timestamp + 1 days));
        assertEq(token.userOf(1), nobody, "the lease did not take");
        assertFalse(parley.mayActAs(1, nobody), "a renter was given the token's voice");
    }

    function test_aTokenThatDoesNotExistHasNoVoice() public {
        assertFalse(parley.mayActAs(99, holder));
        vm.expectRevert(Parley.NotYours.selector);
        parley.speak(0, 99, 0, "hello");
    }

    /*═══════════════ the back-link, which is the whole archive ═══════════════*/

    /*  The pointer itself is in the log, and reading logs is what the client
        does — `tools/verify-parley.mjs` walks a real archive the way a
        browser does, including the case that breaks a naive walker: two
        messages in one block, where the second one's pointer is its own
        block and a walker that followed it would ask for the same block
        until the node stopped answering.

        What is testable here is the storage half: the head the walk starts
        from, and the counter that tells a client whether anything is new. */

    function test_theRoomRemembersWhereItsNewestMessageIs() public {
        parley.speak(0, 1, 0, "one");
        (uint64 last,,,,,,,,) = parley.stateOf(0);
        assertEq(last, block.number);

        vm.roll(block.number + 40);
        parley.speak(0, 1, 0, "two");
        (uint64 last2, uint64 count,,,,,,,) = parley.stateOf(0);
        assertEq(last2, block.number, "the head did not move");
        assertEq(count, 2);
    }

    function test_everyRoomKeepsItsOwnHead() public {
        uint256 key = parley.found(1, "elsewhere", true);
        parley.speak(0, 1, 0, "in the commons");
        vm.roll(block.number + 9);
        parley.speak(key, 1, 0, "in the group");

        (uint64 commonsAt, uint64 commonsCount,,,,,,,) = parley.stateOf(0);
        (uint64 groupAt, uint64 groupCount,,,,,,,) = parley.stateOf(key);
        assertEq(commonsAt, block.number - 9, "one room's message moved another room's head");
        assertEq(groupAt, block.number);
        assertEq(commonsCount, 1);
        assertEq(groupCount, 1);
    }

    /*  `at` is read out of the contract rather than out of `block.number`,
        and that is not style. Within one transaction `block.number` cannot
        change, so the optimiser is entitled to read NUMBER once and reuse
        it — and it sinks that read to the first use, which here would be
        *after* `vm.roll`. The value a test captured "before" the roll then
        turns out to be the value after it, and the test fails against a
        contract that is doing exactly the right thing. A cheatcode that
        moves the block mid-call is outside the language's model of the
        machine; anything that has to straddle one reads its evidence from
        storage.                                                          */
    function test_aTokenRemembersWhereItLastSpokeWhoeverElseHasSpoken() public {
        parley.speak(0, 1, 0, "one");
        uint64 at = parley.lastSpoke(1);
        assertTrue(at != 0, "the first message was not recorded at all");

        vm.roll(block.number + 3);
        vm.prank(other);
        parley.speak(0, 2, 0, "not mine");

        assertEq(parley.lastSpoke(1), at,
            "somebody else speaking moved this token's own back-link");
        assertTrue(parley.lastSpoke(2) > at,
            "and the token that did speak did not move its own");
    }

    function test_headsAnswersForEveryRoomAtOnce() public {
        uint256 key = parley.found(1, "counted", true);
        parley.speak(0, 1, 0, "a");
        parley.speak(key, 1, 0, "b");
        parley.speak(key, 1, 0, "c");

        uint256[] memory rooms = new uint256[](2);
        rooms[0] = 0;
        rooms[1] = key;
        (uint64[] memory last, uint64[] memory count) = parley.heads(rooms);
        assertEq(count[0], 1);
        assertEq(count[1], 2);
        assertEq(last[0], block.number);
        assertEq(last[1], block.number);
    }

    /*═══════════════ rooms ═══════════════*/

    function test_aGroupKeyIsNeverAPairKey() public view {
        for (uint256 i = 1; i < 6; ++i) {
            for (uint256 a = 1; a < 6; ++a) {
                for (uint256 b = a + 1; b < 7; ++b) {
                    assertTrue(parley.groupKey(i) != parley.pairKey(a, b),
                        "two different rooms are the same room");
                }
            }
        }
    }

    function test_aPairIsTheSameRoomFromBothSides() public view {
        assertEq(parley.pairKey(1, 2), parley.pairKey(2, 1));
        assertTrue(parley.pairKey(1, 2) != parley.pairKey(1, 3));
    }

    function test_aPairRoomCannotBePostedToThroughSpeak() public {
        uint256 key = parley.pairKey(1, 2);
        vm.prank(other);
        parley.whisper(2, 1, 0, "just us");

        /*  The derivation is the membership proof, so the raw key must not
            be a door. #1 is genuinely in this room and still cannot use it
            this way — the check is on the route, not on the caller.      */
        vm.expectRevert(Parley.UseWhisper.selector);
        parley.speak(key, 1, 0, "sneaking in");
    }

    function test_anUnfoundedRoomIsNotARoom() public {
        vm.expectRevert(Parley.NoSuchRoom.selector);
        parley.speak(parley.groupKey(7), 1, 0, "hello?");
    }

    function test_aGroupIsClosedUntilItIsOpened() public {
        uint256 key = parley.found(1, "the workshop", false);

        vm.prank(other);
        vm.expectRevert(Parley.NotInvited.selector);
        parley.join(key, 2);

        vm.prank(other);
        vm.expectRevert(Parley.NotAMember.selector);
        parley.speak(key, 2, 0, "let me in");

        parley.invite(key, 1, 2);
        vm.prank(other);
        parley.join(key, 2);
        vm.prank(other);
        parley.speak(key, 2, 0, "thank you");

        (, uint64 count,, uint32 members,,,,,) = parley.stateOf(key);
        assertEq(count, 1);
        assertEq(members, 2);
    }

    function test_anOpenDoorNeedsNoInvitation() public {
        uint256 key = parley.found(1, "the commons annexe", true);
        vm.prank(other);
        parley.join(key, 2);
        vm.prank(other);
        parley.speak(key, 2, 0, "hello");
        (, uint64 count,,,,,,,) = parley.stateOf(key);
        assertEq(count, 1);
    }

    /// @dev The reason `invite` records permission and `join` is the token's
    ///      own call. If a steward could push a token into a room, the
    ///      token's room list is an array a stranger can grow.
    function test_nobodyCanLengthenSomebodyElsesRoomList() public {
        uint256 key = parley.found(1, "unwanted", true);
        parley.invite(key, 1, 2);

        (uint256[] memory keys,) = parley.roomsOf(2);
        assertEq(keys.length, 0, "an invitation alone put a room on somebody's list");
        assertEq(parley.roomCount(2), 0);

        vm.prank(other);
        parley.join(key, 2);
        (keys,) = parley.roomsOf(2);
        assertEq(keys.length, 1, "joining did not record the room");
    }

    function test_leavingIsRememberedWithoutErasingTheRoom() public {
        uint256 key = parley.found(1, "briefly", true);
        vm.prank(other);
        parley.join(key, 2);
        vm.prank(other);
        parley.leave(key, 2);

        (uint256[] memory keys, bool[] memory member) = parley.roomsOf(2);
        assertEq(keys.length, 1, "the room vanished from the list entirely");
        assertFalse(member[0], "it still says they are in it");

        vm.prank(other);
        vm.expectRevert(Parley.NotAMember.selector);
        parley.speak(key, 2, 0, "still here?");
    }

    function test_rejoiningDoesNotDuplicateTheEntry() public {
        uint256 key = parley.found(1, "in and out", true);
        vm.prank(other);
        parley.join(key, 2);
        vm.prank(other);
        parley.leave(key, 2);
        vm.prank(other);
        parley.join(key, 2);
        assertEq(parley.roomCount(2), 1, "the list grew on a rejoin");
        (, bool[] memory member) = parley.roomsOf(2);
        assertTrue(member[0]);
    }

    function test_onlyTheStewardInvitesAndEvicts() public {
        uint256 key = parley.found(1, "mine", true);
        vm.prank(other);
        parley.join(key, 2);

        vm.prank(other);
        vm.expectRevert(Parley.NotTheSteward.selector);
        parley.invite(key, 2, 1);

        vm.prank(other);
        vm.expectRevert(Parley.NotTheSteward.selector);
        parley.evict(key, 2, 1);

        parley.evict(key, 1, 2);
        assertFalse(parley.inRoom(key, 2));
    }

    /// @dev What eviction is not. Nothing in this contract can unsay a thing.
    function test_evictionCannotUnsayAnything() public {
        uint256 key = parley.found(1, "mine", true);
        vm.prank(other);
        parley.join(key, 2);
        vm.prank(other);
        parley.speak(key, 2, 0, "on the record");

        (, uint64 before,,,,,,,) = parley.stateOf(key);
        parley.evict(key, 1, 2);
        (, uint64 after_,,,,,,,) = parley.stateOf(key);
        assertEq(after_, before, "evicting somebody changed what the room holds");
    }

    /*═══════════════ whispering ═══════════════*/

    function test_aWhisperNeedsSomebodyToWhisperTo() public {
        vm.expectRevert(Parley.NoSuchToken.selector);
        parley.whisper(1, 99, 0, "anyone there");

        vm.expectRevert(Parley.TalkingToYourself.selector);
        parley.whisper(1, 1, 0, "hello me");
    }

    function test_bothSidesLandInTheSameRoom() public {
        parley.whisper(1, 2, 0, "hello");
        vm.prank(other);
        parley.whisper(2, 1, 0, "hello back");

        (, uint64 count,,, uint8 kind,,,,) = parley.stateOf(parley.pairKey(1, 2));
        assertEq(count, 2, "the two halves of one conversation went to two rooms");
        assertEq(kind, 2);
    }

    /*═══════════════ what a message may be ═══════════════*/

    function test_aBodyHasBothEnds() public {
        vm.expectRevert(Parley.BadBody.selector);
        parley.speak(0, 1, 0, "");

        bytes memory big = new bytes(parley.MAX_BODY() + 1);
        vm.expectRevert(Parley.BadBody.selector);
        parley.speak(0, 1, 0, big);

        bytes memory edge = new bytes(parley.MAX_BODY());
        parley.speak(0, 1, 0, edge);                       // exactly at the limit
    }

    function test_aKindThisContractDoesNotKnowIsRefused() public {
        vm.expectRevert(Parley.BadKind.selector);
        parley.speak(0, 1, 2, "what am i");
        parley.speak(0, 1, 1, "sealed");                   // 1 is a real kind
    }

    function test_aRoomNeedsAName() public {
        vm.expectRevert(Parley.BadName.selector);
        parley.found(1, "", true);

        string memory long = new string(parley.MAX_NAME() + 1);
        vm.expectRevert(Parley.BadName.selector);
        parley.found(1, long, true);
    }

    /*═══════════════ sealing keys ═══════════════*/

    function test_onlyTheTokenPublishesItsOwnKey() public {
        vm.prank(nobody);
        vm.expectRevert(Parley.NotYours.selector);
        parley.announce(1, bytes32(uint256(1)), bytes32(uint256(2)));

        parley.announce(1, bytes32(uint256(1)), bytes32(uint256(2)));
        (bytes32 x, bytes32 y) = parley.keyOf(1);
        assertEq(uint256(x), 1);
        assertEq(uint256(y), 2);
    }

    /*═══════════════ the topics a browser cannot compute ═══════════════*/

    /// @dev The client ships no keccak, so it asks for these. If they were
    ///      ever written down by hand rather than derived, a filter would
    ///      match nothing and the chat would be silently, permanently empty
    ///      — which looks exactly like a chat nobody has used yet.
    function test_theTopicsAreDerivedFromTheSignaturesThemselves() public view {
        (bytes32 said, bytes32 founded, bytes32 entered,
         bytes32 departed, bytes32 announced) = parley.topics();
        assertEq(said, keccak256("Said(uint256,uint256,uint64,uint64,uint64,uint8,bytes)"));
        assertEq(founded, keccak256("Founded(uint256,uint256,uint256,bool,string)"));
        assertEq(entered, keccak256("Entered(uint256,uint256)"));
        assertEq(departed, keccak256("Departed(uint256,uint256)"));
        assertEq(announced, keccak256("Announced(uint256,bytes32,bytes32)"));
    }
}
