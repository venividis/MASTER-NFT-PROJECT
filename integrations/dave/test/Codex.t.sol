// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {DaveVault} from "../src/DaveVault.sol";
import {DaveHeld} from "../src/DaveHeld.sol";
import {Chambers} from "../src/Chambers.sol";
import {Charter} from "../src/Charter.sol";
import {Codex} from "../src/Codex.sol";
import {MockERC20} from "../src/lib/MockERC20.sol";

contract Pinger2 { uint256 public pings; function ping() external { ++pings; } }

/// @dev a program born from leaves: forwards acts into the Chambers.
contract ForgedStrat {
    Chambers immutable ch;
    constructor(address c) { ch = Chambers(c); }
    function go(uint256 daveId, address target, bytes calldata data) external {
        ch.act(daveId, target, 0, data, address(0), 0);
    }
}

contract CodexTest is Base {
    Charter ch;
    Codex cx;
    MockERC20 USDC;
    uint256 daveId;
    DaveVault vault;
    address carol = makeAddr("carol");
    address heir = makeAddr("heir");
    uint256 pid;
    uint256 bobDave;

    function setUp() public override {
        super.setUp();
        ch = new Charter(address(hub));
        cx = new Codex(address(hub), address(chambers), address(ch));
        hub.dockCodex(address(cx));                           // deployer one-shot
        USDC = new MockERC20("USD Coin", "USDC");
        USDC.mint(alice, 1_000_000e18);
        _openWindow();
        (daveId, vault) = _claim(alice, 1, 1_000e18);
        (bobDave,) = _claim(bob, 1, 1_000e18);                // a second author
        GREG.mint(alice, 1_000_000e18);

        vm.startPrank(alice);
        USDC.approve(address(vault), 10_000e18);
        vault.deposit(address(USDC), 10_000e18);              // second bag
        pid = ch.charterPool(daveId, address(GREG), address(USDC), 0, address(0));
        GREG.approve(address(ch), type(uint256).max);
        USDC.approve(address(ch), type(uint256).max);
        ch.addLiquidity(pid, 1_000e18, 1_000e18);
        vm.stopPrank();
        _tlDo(address(hub), abi.encodeCall(DaveHeld.setTarget, (address(ch), true)));

        // dock the Codex itself as this Dave's chamber organ (one cure, once)
        vm.startPrank(alice);
        chambers.propose(daveId, address(cx));
        vm.warp(block.timestamp + 7 days);
        chambers.dock(daveId, address(cx));
        vm.stopPrank();
    }

    function _seedTwap() internal {
        vm.warp(block.timestamp + 6 minutes);
        vm.startPrank(bob);
        USDC.mint(bob, 1_000e18);
        USDC.approve(address(ch), type(uint256).max);
        ch.swap(pid, false, 10e18, 0, 0);
        vm.warp(block.timestamp + 31 minutes);
        ch.swap(pid, false, 10e18, 0, 0);
        vm.stopPrank();
    }

    function test_inscription_is_authorship() public {
        vm.prank(alice);
        uint256 leaf = cx.inscribe(daveId, "the seal is the product");
        assertEq(cx.leafText(leaf), "the seal is the product");
        (, uint64 author,) = cx.leaves(leaf);
        assertEq(author, uint64(daveId));
        vm.prank(bob);
        vm.expectRevert(Codex.NotBearer.selector);
        cx.inscribe(daveId, "forged authorship");
    }

    function test_bind_orders_editions_immutably() public {
        vm.startPrank(alice);
        uint256 a = cx.inscribe(daveId, "HELLO ");
        uint256 b = cx.inscribe(daveId, "WORLD");
        uint256[] memory fw = new uint256[](2); fw[0] = a; fw[1] = b;
        uint256[] memory bw = new uint256[](2); bw[0] = b; bw[1] = a;
        uint256 e1 = cx.bind(daveId, fw, cx.RECITE(), false);
        uint256 e2 = cx.bind(daveId, bw, cx.RECITE(), false);
        vm.stopPrank();
        assertEq(cx.read(e1), "HELLO WORLD");
        assertEq(cx.read(e2), "WORLDHELLO ");                 // new order, new edition
    }

    function test_leaves_are_a_public_library() public {
        vm.prank(alice);
        uint256 leaf = cx.inscribe(daveId, hex"00");
        vm.startPrank(bob);
        uint256[] memory ids = new uint256[](1); ids[0] = leaf;
        uint256 ed = cx.bind(bobDave, ids, cx.RECITE(), false);  // alice's page, bob's book
        vm.stopPrank();
        assertEq(cx.read(ed), hex"00");
    }

    function test_forge_lands_at_the_tokens_address() public {
        bytes memory ic = bytes.concat(type(ForgedStrat).creationCode, abi.encode(address(chambers)));
        uint256 half = ic.length / 2;
        bytes memory p1 = new bytes(half);
        bytes memory p2 = new bytes(ic.length - half);
        for (uint256 i; i < half; ++i) p1[i] = ic[i];
        for (uint256 i; i < ic.length - half; ++i) p2[i] = ic[half + i];

        vm.startPrank(alice);
        uint256 l1 = cx.inscribe(daveId, p1);
        uint256 l2 = cx.inscribe(daveId, p2);
        uint256[] memory ids = new uint256[](2); ids[0] = l1; ids[1] = l2;
        uint256 ed = cx.bind(daveId, ids, cx.FORGE(), false);
        address predicted = cx.forgedAddressOf(daveId, ed, bytes32("v1"));
        address program = cx.forge(daveId, ed, bytes32("v1"));
        vm.stopPrank();

        assertEq(program, predicted);                         // token-derived address
        assertGt(program.code.length, 0);
        assertEq(cx.forgedOf(daveId)[0], program);

        uint256 verseEd = _bindVerse(hex"00", false);
        vm.prank(alice);
        vm.expectRevert(Codex.WrongKind.selector);            // verse does not forge
        cx.forge(daveId, verseEd, bytes32("x"));
    }

    function test_forged_program_docks_and_acts() public {
        bytes memory ic = bytes.concat(type(ForgedStrat).creationCode, abi.encode(address(chambers)));
        vm.startPrank(alice);
        uint256 leaf = cx.inscribe(daveId, ic);
        uint256[] memory ids = new uint256[](1); ids[0] = leaf;
        address program = cx.forge(daveId, cx.bind(daveId, ids, cx.FORGE(), false), bytes32(0));
        chambers.propose(daveId, program);
        vm.warp(block.timestamp + 7 days);
        chambers.dock(daveId, program);
        vm.stopPrank();

        Pinger2 pinger = new Pinger2();
        ForgedStrat(program).go(daveId, address(pinger), abi.encodeCall(Pinger2.ping, ()));
        assertEq(pinger.pings(), 1);                          // inscribed → forged → docked → acting
    }

    function _bindVerse(bytes memory verse, bool open_) internal returns (uint256 ed) {
        vm.startPrank(alice);
        uint256 leaf = cx.inscribe(daveId, verse);
        uint256[] memory ids = new uint256[](1); ids[0] = leaf;
        ed = cx.bind(daveId, ids, cx.RECITE(), open_);
        vm.stopPrank();
    }

    function test_recital_trades_behind_the_wall() public {
        _seedTwap();
        bytes memory verse = abi.encodePacked(
            uint8(0x03), uint64(pid), uint32(30 minutes), uint128(2e18),   // TWAP_LT 2.0
            uint8(0x01), uint64(pid), uint8(0), uint128(100e18), uint128(0), // swap quote-in
            uint8(0x00)
        );
        uint256 ed = _bindVerse(verse, false);
        uint256 u0 = USDC.balanceOf(address(vault));
        uint256 g0 = GREG.balanceOf(address(vault));
        vm.prank(alice);
        cx.recite(daveId, ed);
        assertEq(u0 - USDC.balanceOf(address(vault)), 100e18);
        assertGt(GREG.balanceOf(address(vault)), g0);
        assertTrue(vault.sealed_());

        // the same book, a colder market: the gate holds
        bytes memory tight = abi.encodePacked(
            uint8(0x03), uint64(pid), uint32(30 minutes), uint128(0.5e18),
            uint8(0x00)
        );
        uint256 ed2 = _bindVerse(tight, false);
        vm.prank(alice);
        vm.expectRevert(Codex.VerseFalse.selector);
        cx.recite(daveId, ed2);
    }

    function test_open_recital_is_keeper_bait() public {
        _seedTwap();
        bytes memory verse = abi.encodePacked(
            uint8(0x01), uint64(pid), uint8(0), uint128(10e18), uint128(0),
            uint8(0x00)
        );
        uint256 closed_ = _bindVerse(verse, false);
        vm.prank(carol);
        vm.expectRevert(Codex.NotOpen.selector);
        cx.recite(daveId, closed_);

        uint256 open_ = _bindVerse(verse, true);
        vm.prank(carol);
        cx.recite(daveId, open_);                             // anyone may turn the crank
    }

    function test_sealed_send_dies_on_the_wall() public {
        bytes memory tokenSend = abi.encodePacked(
            uint8(0x07), address(USDC), heir, uint128(1_000e18), uint8(0x00)
        );
        uint256 e1 = _bindVerse(tokenSend, false);
        vm.prank(alice);
        vm.expectRevert(Chambers.ExitWord.selector);          // transfer word, refused sealed
        cx.recite(daveId, e1);

        vm.deal(address(vault), 5 ether);
        bytes memory ethSend = abi.encodePacked(
            uint8(0x07), address(0), heir, uint128(1 ether), uint8(0x00)
        );
        uint256 e2 = _bindVerse(ethSend, false);
        vm.prank(alice);
        vm.expectRevert(Chambers.NotVenue.selector);
        cx.recite(daveId, e2);
    }

    function test_testament_executes_after_the_covenant() public {
        uint64 u = vault.unlockAt();
        bytes memory verse = abi.encodePacked(
            uint8(0x04), uint64(u + 1),                       // WAIT_UNTIL
            uint8(0x06),                                      // REQUIRE_UNSEALED
            uint8(0x07), address(USDC), heir, uint128(1_000e18),
            uint8(0x00)
        );
        uint256 ed = _bindVerse(verse, true);                 // open: fires on silence
        vm.prank(carol);
        vm.expectRevert(Codex.VerseFalse.selector);           // not yet
        cx.recite(daveId, ed);

        vm.warp(uint256(u) + 2);
        vm.prank(carol);
        cx.recite(daveId, ed);                                // the estate executes itself
        assertEq(USDC.balanceOf(heir), 1_000e18);
    }

    function test_once_latch_blocks_replay() public {
        _seedTwap();
        bytes memory verse = abi.encodePacked(
            uint8(0x09),                                       // ONCE
            uint8(0x01), uint64(pid), uint8(0), uint128(10e18), uint128(0),
            uint8(0x00)
        );
        uint256 ed = _bindVerse(verse, true);
        vm.prank(carol);
        cx.recite(daveId, ed);                                 // fires once
        vm.prank(carol);
        vm.expectRevert(Codex.Spent.selector);                 // never again
        cx.recite(daveId, ed);
    }

    function test_open_seal_is_still_bearer_only() public {
        _tlDo(address(hub), abi.encodeCall(DaveHeld.setModule, (address(cx), true)));
        vm.prank(alice);
        vault.setMandate(address(cx));
        bytes memory verse = abi.encodePacked(uint8(0x08), uint8(2), uint8(0x00));
        uint256 ed = _bindVerse(verse, true);                  // OPEN edition
        vm.prank(carol);
        vm.expectRevert(Codex.NotOpen.selector);               // a stranger cannot ratchet it
        cx.recite(daveId, ed);
        vm.prank(alice);
        cx.recite(daveId, ed);                                 // the bearer can
        assertGt(vault.unlockAt(), uint64(block.timestamp));
    }

    function test_seal_op_needs_the_mandate() public {
        bytes memory verse = abi.encodePacked(uint8(0x08), uint8(2), uint8(0x00)); // SEAL DIAMOND
        uint256 ed = _bindVerse(verse, false);
        vm.prank(alice);
        vm.expectRevert();                                    // codex holds no mandate yet
        cx.recite(daveId, ed);

        _tlDo(address(hub), abi.encodeCall(DaveHeld.setModule, (address(cx), true)));
        vm.prank(alice);
        vault.setMandate(address(cx));
        uint64 before_ = vault.unlockAt();
        vm.prank(alice);
        cx.recite(daveId, ed);
        assertGt(vault.unlockAt(), before_);                  // the book extends its own covenant
    }
}
