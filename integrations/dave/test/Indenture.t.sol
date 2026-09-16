// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {DaveVault} from "../src/DaveVault.sol";
import {DaveHeld} from "../src/DaveHeld.sol";
import {Indenture} from "../src/Indenture.sol";
import {MockERC20} from "../src/lib/MockERC20.sol";

contract IndentureTest is Base {
    Indenture ind;
    MockERC20 USDC;
    address carol = makeAddr("carol");
    uint256 daveId;
    DaveVault vault;

    function setUp() public override {
        super.setUp();
        ind = new Indenture(address(hub));
        _tlDo(address(hub), abi.encodeCall(DaveHeld.addHook, (address(ind))));
        USDC = new MockERC20("USD Coin", "USDC");
        USDC.mint(alice, 1_000_000e18);
        USDC.mint(bob, 1_000_000e18);
        _openWindow();
        (daveId, vault) = _claim(alice, 1, 1_000e18);          // IRON: ~180d covenant
    }

    /// @dev face 100, sold at 90 (a 10% discount to maturity), fund 10 notes.
    function _tranche() internal returns (uint256 id) {
        vm.startPrank(alice);
        id = ind.openTranche(daveId, address(USDC), 100e18, 90e18);
        USDC.approve(address(ind), type(uint256).max);
        ind.inkFund(id, 1_000e18);
        vm.stopPrank();
        vm.prank(bob); USDC.approve(address(ind), type(uint256).max);
    }

    function test_issue_requires_a_live_seal_and_pins_maturity() public {
        uint256 id = _tranche();
        (,, uint64 maturity,,,,,) = ind.tranches(id);
        assertEq(maturity, vault.unlockAt());                  // read off the covenant

        vm.warp(vault.unlockAt() + 1);
        vm.prank(alice);
        vm.expectRevert(Indenture.NotSealed.selector);         // no covenant, no paper
        ind.openTranche(daveId, address(USDC), 100e18, 90e18);
    }

    function test_subscription_proceeds_vaultward_with_toll() public {
        uint256 id = _tranche();
        uint256 due = 5 * 90e18;
        uint256 toll = due * 42 / 10_000;
        assertEq(ind.costOf(id, 5), due + toll);

        uint256 v0 = USDC.balanceOf(address(vault));
        uint256 p0 = USDC.balanceOf(address(pool));
        vm.prank(bob);
        ind.subscribe(id, 5, type(uint256).max);
        assertEq(USDC.balanceOf(address(vault)) - v0, due);    // born locked
        assertEq(USDC.balanceOf(address(pool)) - p0, toll * 69 / 100);
        assertEq(ind.notesOf(id, bob), 5);
    }

    function test_never_issues_beyond_the_fund() public {
        uint256 id = _tranche();                               // fund covers 10
        vm.prank(bob);
        vm.expectRevert(Indenture.OverFund.selector);
        ind.subscribe(id, 11, type(uint256).max);
        vm.prank(bob);
        ind.subscribe(id, 10, type(uint256).max);
        assertEq(ind.capacityNotes(id), 0);
    }

    function test_ratchet_deepens_the_seal_not_the_debt() public {
        uint256 id = _tranche();
        vm.prank(bob);
        ind.subscribe(id, 10, type(uint256).max);
        (,, uint64 m0,,,,,) = ind.tranches(id);

        // the bearer deepens conviction: DIAMOND on top of IRON
        vm.prank(alice);
        vault.seal(2);
        assertGt(vault.unlockAt(), m0);                        // the seal moved…

        (,, uint64 m1,,,,,) = ind.tranches(id);
        assertEq(m1, m0);                                      // …the paper did not

        vm.warp(m0);                                           // original date arrives
        uint256 b0 = USDC.balanceOf(bob);
        vm.prank(bob);
        ind.redeem(id, 10);
        assertEq(USDC.balanceOf(bob) - b0, 1_000e18);          // face, on the day it said
        assertTrue(vault.sealed_());                           // covenant still deep
    }

    function test_notes_are_bearer_paper() public {
        uint256 id = _tranche();
        vm.prank(bob);
        ind.subscribe(id, 3, type(uint256).max);
        vm.prank(bob);
        ind.transferNotes(id, carol, 2);
        assertEq(ind.notesOf(id, carol), 2);
        (,, uint64 m,,,,,) = ind.tranches(id);
        vm.warp(m);
        vm.prank(carol);
        ind.redeem(id, 2);                                     // whoever holds, redeems
        assertEq(USDC.balanceOf(carol), 200e18);
    }

    function test_drawFree_fence_and_escheat() public {
        uint256 id = _tranche();
        vm.prank(bob);
        ind.subscribe(id, 8, type(uint256).max);               // committed 800
        vm.startPrank(alice);
        vm.expectRevert(Indenture.OverFund.selector);
        ind.drawFree(id, 300e18);                              // only 200 free
        ind.drawFree(id, 200e18);
        vm.stopPrank();

        (,, uint64 m,,,,,) = ind.tranches(id);
        vm.warp(uint256(m) + 90 days);                         // bob slept through
        uint256 v0 = USDC.balanceOf(address(vault));
        vm.prank(alice);
        ind.escheat(id);
        assertEq(USDC.balanceOf(address(vault)) - v0, 800e18); // falls home
    }

    function test_ragequit_tolls_free_fund_only() public {
        uint256 id = _tranche();
        vm.prank(bob);
        ind.subscribe(id, 6, type(uint256).max);               // committed 600, free 400
        uint256 p0 = USDC.balanceOf(address(pool));
        vm.prank(alice);
        vault.ragequit();
        uint256 tax = 400e18 * 420 / 10_000;
        assertEq(USDC.balanceOf(address(pool)) - p0, tax * 69 / 100);
        (,,,,,, uint128 fund,) = ind.tranches(id);
        assertEq(uint256(fund), 1_000e18 - tax);
        // the paper's cover is untouched: all 6 still redeem at face
        (,, uint64 m,,,,,) = ind.tranches(id);
        vm.warp(m);
        vm.prank(bob);
        ind.redeem(id, 6);
    }
}
