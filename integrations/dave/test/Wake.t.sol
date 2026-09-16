// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {DaveVault} from "../src/DaveVault.sol";
import {DaveHeld} from "../src/DaveHeld.sol";
import {Bourse} from "../src/Bourse.sol";
import {Wake} from "../src/Wake.sol";
import {MockERC721} from "../src/lib/MockERC721.sol";
import {MockERC20} from "../src/lib/MockERC20.sol";

contract WakeTest is Base {
    Bourse bourse;
    Wake wake;
    MockERC721 punks;
    MockERC20 USDC;
    address carol = makeAddr("carol");
    address dora  = makeAddr("dora");
    uint256 daveId;
    DaveVault vault;
    uint256 stallId;

    function setUp() public override {
        super.setUp();
        bourse = new Bourse(address(hub));
        _tlDo(address(hub), abi.encodeCall(DaveHeld.addHook, (address(bourse))));
        wake = new Wake(address(hub), address(bourse));
        _tlDo(address(bourse), abi.encodeCall(Bourse.dock, (address(wake))));

        punks = new MockERC721("MOCKPUNKS", "MPUNK");
        USDC = new MockERC20("USD Coin", "USDC");
        for (uint256 i = 1; i <= 4; ++i) punks.mint(alice, i);
        for (uint256 i = 101; i <= 104; ++i) punks.mint(carol, i);
        USDC.mint(alice, 1_000e18); USDC.mint(bob, 1_000e18);
        USDC.mint(carol, 1_000e18); USDC.mint(dora, 1_000e18);
        vm.deal(bob, 100 ether); vm.deal(dora, 100 ether);

        _openWindow();
        (daveId, vault) = _claim(alice, 1, 1_000e18);

        // DUAL stall, USDC quote, flat 10e18
        vm.startPrank(alice);
        stallId = bourse.openStall(daveId, address(punks), address(USDC), 0, 2, 10e18, 0, 0);
        punks.setApprovalForAll(address(bourse), true);
        uint256[] memory ids = new uint256[](2);
        ids[0] = 1; ids[1] = 2;
        bourse.stock(stallId, ids);
        USDC.approve(address(bourse), type(uint256).max);
        bourse.fund(stallId, 100e18);
        wake.enroll(stallId, 3);
        vm.stopPrank();
        vm.startPrank(carol); USDC.approve(address(bourse), type(uint256).max); punks.setApprovalForAll(address(bourse), true); vm.stopPrank();
        vm.startPrank(bob); USDC.approve(address(bourse), type(uint256).max); vm.stopPrank();
        vm.startPrank(dora); USDC.approve(address(bourse), type(uint256).max); vm.stopPrank();
    }

    function _buyOne(address who, uint256 id) internal {
        uint256[] memory ids = new uint256[](1); ids[0] = id;
        vm.prank(who);
        bourse.buy(stallId, ids, type(uint256).max);
    }

    function test_dock_is_timelock_only_and_once() public {
        vm.prank(bob);
        vm.expectRevert(Bourse.NotTimelock.selector);
        bourse.dock(address(wake));
        vm.prank(address(tl));
        vm.expectRevert(Bourse.Docked.selector);
        bourse.dock(address(wake));
    }

    function test_enroll_bearer_only_window_bounds() public {
        vm.prank(bob);
        vm.expectRevert(Wake.NotBearer.selector);
        wake.enroll(stallId, 2);
        vm.prank(alice);
        vm.expectRevert(Wake.BadWindow.selector);
        wake.enroll(stallId, 9);
    }

    function test_wake_gates_the_aftermath() public {
        vm.prank(bob);
        wake.take{value: 1.1 ether}(stallId, 1 ether);        // seat + escrow

        _buyOne(carol, 1);                                     // opens the wake
        vm.expectRevert(Wake.WakeHolds.selector);
        _buyOne(carol, 2);                                     // inside: blocked
        _buyOne(bob, 2);                                       // keeper passes

        vm.roll(block.number + 4);                             // past window 3
        uint256[] memory ids = new uint256[](1); ids[0] = 101;
        vm.prank(carol);
        bourse.sell(stallId, ids, 0);                          // free again
    }

    function test_no_keeper_no_gate() public {
        _buyOne(carol, 1);
        _buyOne(carol, 2);                                     // vacant seat: open floor
    }

    function test_harberger_seizure_pays_incumbent() public {
        vm.prank(bob);
        wake.take{value: 1.5 ether}(stallId, 1 ether);
        uint256 b0 = bob.balance;
        vm.prank(dora);
        wake.take{value: 2.2 ether}(stallId, 2 ether);         // pays bob's price
        // bob got his named price + his remaining escrow back
        assertEq(bob.balance - b0, 1 ether + 0.5 ether);
        (,, address keeper, uint128 price,,,) = wake.seats(stallId);
        assertEq(keeper, dora);
        assertEq(price, 2 ether);
    }

    function test_rent_flows_vaultward_and_lapses() public {
        vm.prank(bob);
        wake.take{value: 1 ether + 0.02 ether}(stallId, 1 ether);
        uint256 v0 = address(vault).balance;
        uint256 p0 = address(pool).balance;
        vm.warp(block.timestamp + 365 days);                   // owed 0.042 > escrow
        wake.poke(stallId);
        (,, address keeper,, uint128 escrow,,) = wake.seats(stallId);
        assertEq(keeper, address(0));                          // lapsed
        assertEq(escrow, 0);
        uint256 owed = 0.02 ether;                             // clamped to escrow
        uint256 toll = owed * 42 / 10_000;
        assertEq(address(vault).balance - v0, owed - toll);
        assertEq(address(pool).balance - p0, toll * 69 / 100);
    }

    function test_disenroll_needs_vacant_seat() public {
        vm.prank(bob);
        wake.take{value: 1.1 ether}(stallId, 1 ether);
        vm.prank(alice);
        vm.expectRevert(Wake.SeatTaken.selector);
        wake.disenroll(stallId);
        vm.prank(bob);
        wake.vacate(stallId);
        vm.prank(alice);
        wake.disenroll(stallId);
        _buyOne(carol, 1);
        _buyOne(carol, 2);                                     // gate fully off
    }
}
