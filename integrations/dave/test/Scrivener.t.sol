// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {DaveVault} from "../src/DaveVault.sol";
import {DaveHeld} from "../src/DaveHeld.sol";
import {Scrivener} from "../src/Scrivener.sol";
import {MockERC20} from "../src/lib/MockERC20.sol";

contract ScrivenerTest is Base {
    Scrivener sc;
    MockERC20 USDC;                    // quote
    MockERC20 HOOD;                    // underlying stock token
    address carol = makeAddr("carol");
    uint256 daveId;
    DaveVault vault;

    function setUp() public override {
        super.setUp();
        sc = new Scrivener(address(hub));
        _tlDo(address(hub), abi.encodeCall(DaveHeld.addHook, (address(sc))));
        USDC = new MockERC20("USD Coin", "USDC");
        HOOD = new MockERC20("Robinhood Stock Token", "HOOD");
        USDC.mint(alice, 1_000_000e18); HOOD.mint(alice, 1_000_000e18);
        USDC.mint(carol, 1_000_000e18); HOOD.mint(carol, 1_000_000e18);
        _openWindow();
        (daveId, vault) = _claim(alice, 1, 1_000e18);
    }

    /// @dev CALL quill: strike 100, expiry 30d, premium 5/contract, 10 covered.
    function _callQuill() internal returns (uint256 id) {
        vm.startPrank(alice);
        id = sc.openQuill(
            daveId, sc.CALL(), address(HOOD), address(USDC),
            100e18, uint64(block.timestamp + 30 days), 5e18
        );
        HOOD.approve(address(sc), type(uint256).max);
        sc.ink(id, 10e18);
        vm.stopPrank();
        vm.startPrank(carol);
        USDC.approve(address(sc), type(uint256).max);
        HOOD.approve(address(sc), type(uint256).max);
        vm.stopPrank();
    }

    function test_premium_pays_vaultward_with_toll() public {
        uint256 id = _callQuill();
        uint256 due = 3 * 5e18;                                // 3 contracts
        uint256 toll = due * 42 / 10_000;
        assertEq(sc.costOf(id, 3e18), due + toll);

        uint256 v0 = USDC.balanceOf(address(vault));
        uint256 p0 = USDC.balanceOf(address(pool));
        vm.prank(carol);
        sc.write(id, 3e18, type(uint256).max);
        assertEq(USDC.balanceOf(address(vault)) - v0, due);    // born locked
        assertEq(USDC.balanceOf(address(pool)) - p0, toll * 69 / 100);
        assertEq(sc.heldOf(id, carol), 3e18);
    }

    function test_only_covered_ink_sells() public {
        uint256 id = _callQuill();                             // 10 covered
        vm.prank(carol);
        vm.expectRevert(Scrivener.OverInk.selector);
        sc.write(id, 11e18, type(uint256).max);
        vm.prank(carol);
        sc.write(id, 10e18, type(uint256).max);                // exactly the ink
        assertEq(sc.capacity(id), 0);
    }

    function test_call_exercise_strike_vaultward() public {
        uint256 id = _callQuill();
        vm.prank(carol);
        sc.write(id, 4e18, type(uint256).max);

        uint256 strikeVal = 4 * 100e18;
        uint256 toll = strikeVal * 42 / 10_000;
        uint256 v0 = USDC.balanceOf(address(vault));
        uint256 h0 = HOOD.balanceOf(carol);
        vm.prank(carol);
        sc.exercise(id, 4e18);
        assertEq(USDC.balanceOf(address(vault)) - v0, strikeVal); // strike home
        assertEq(HOOD.balanceOf(carol) - h0, 4e18);               // asset delivered
        (,,,,,,,,, uint128 escrow, uint128 sold) = sc.quills(id);
        assertEq(uint256(escrow), 6e18);
        assertEq(uint256(sold), 0);
        assertGt(toll, 0);
    }

    function test_put_exercise_swallows_underlying() public {
        vm.startPrank(alice);
        uint256 id = sc.openQuill(
            daveId, sc.PUT(), address(HOOD), address(USDC),
            100e18, uint64(block.timestamp + 30 days), 4e18
        );
        USDC.approve(address(sc), type(uint256).max);
        sc.ink(id, 500e18);                                    // covers 5 puts
        vm.stopPrank();
        vm.startPrank(carol);
        USDC.approve(address(sc), type(uint256).max);
        HOOD.approve(address(sc), type(uint256).max);
        sc.write(id, 2e18, type(uint256).max);

        uint256 strikeVal = 2 * 100e18;
        uint256 toll = strikeVal * 42 / 10_000;
        uint256 c0 = USDC.balanceOf(carol);
        sc.exercise(id, 2e18);
        vm.stopPrank();
        assertEq(HOOD.balanceOf(address(vault)), 2e18);        // the Dave eats the stock
        assertEq(USDC.balanceOf(carol) - c0, strikeVal - toll);
        (,,,,,,,,, uint128 escrow,) = sc.quills(id);
        assertEq(uint256(escrow), 300e18);
    }

    function test_expiry_kills_paper_reclaim_vaultward() public {
        uint256 id = _callQuill();
        vm.prank(carol);
        sc.write(id, 5e18, type(uint256).max);
        vm.warp(block.timestamp + 30 days);
        vm.prank(carol);
        vm.expectRevert(Scrivener.Expired.selector);           // worthless at the stroke
        sc.exercise(id, 1e18);
        uint256 h0 = HOOD.balanceOf(address(vault));
        vm.prank(alice);
        sc.reclaim(id);
        assertEq(HOOD.balanceOf(address(vault)) - h0, 10e18);  // cover walks home
    }

    function test_ragequit_tolls_free_ink_only() public {
        uint256 id = _callQuill();                             // 10 inked
        vm.prank(carol);
        sc.write(id, 4e18, type(uint256).max);                 // book needs 4
        vm.prank(alice);
        sc.bond(id);
        uint256 p0 = HOOD.balanceOf(address(pool));
        vm.prank(alice);
        vault.ragequit();
        uint256 tax = 6e18 * 420 / 10_000;                     // free ink 6
        assertEq(HOOD.balanceOf(address(pool)) - p0, tax * 69 / 100);
        (,,,,,,,,, uint128 escrow,) = sc.quills(id);
        assertEq(uint256(escrow), 10e18 - tax);
        assertEq(sc.bondedNow(id), true);
        // and the sold book is exercisable in full even after the toll
        vm.prank(carol);
        sc.exercise(id, 4e18);
    }

    function test_bond_freezes_terms() public {
        uint256 id = _callQuill();
        vm.startPrank(alice);
        sc.bond(id);
        vm.expectRevert(Scrivener.BondHolds.selector);
        sc.setPremium(id, 9e18);
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(Scrivener.BondHolds.selector);         // bonded past expiry too
        sc.reclaim(id);
        vm.stopPrank();
    }
}
