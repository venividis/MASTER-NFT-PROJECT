// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {DaveVault} from "../src/DaveVault.sol";
import {DaveHeld} from "../src/DaveHeld.sol";
import {Wager} from "../src/Wager.sol";
import {MockERC20} from "../src/lib/MockERC20.sol";

contract WagerTest is Base {
    Wager wg;
    MockERC20 USDC;
    address judge = makeAddr("judge");
    address carol = makeAddr("carol");
    uint256 daveId;
    DaveVault vault;

    function setUp() public override {
        super.setUp();
        wg = new Wager(address(hub));
        _tlDo(address(hub), abi.encodeCall(DaveHeld.addHook, (address(wg))));
        USDC = new MockERC20("USD Coin", "USDC");
        USDC.mint(alice, 1_000_000e18);
        USDC.mint(bob, 1_000_000e18);
        USDC.mint(carol, 1_000_000e18);
        _openWindow();
        (daveId, vault) = _claim(alice, 1, 1_000e18);
    }

    function _book(uint16 pYes, uint128 backing) internal returns (uint256 id) {
        vm.startPrank(alice);
        id = wg.openBook(
            daveId, address(USDC), judge,
            uint64(block.timestamp + 1 days), uint64(block.timestamp + 2 days), pYes
        );
        USDC.approve(address(wg), type(uint256).max);
        if (backing > 0) wg.fundBacking(id, backing);
        vm.stopPrank();
        vm.prank(bob); USDC.approve(address(wg), type(uint256).max);
        vm.prank(carol); USDC.approve(address(wg), type(uint256).max);
    }

    function test_ticket_math_and_toll() public {
        uint256 id = _book(6000, 1_000e18);                    // YES at 60c
        uint256 premium = 10 * 1e18 * 6000 / 10_000;           // 6e18
        uint256 toll = premium * 42 / 10_000;
        assertEq(wg.quoteCost(id, wg.YES(), 10), premium + toll);

        uint256 p0 = USDC.balanceOf(address(pool));
        vm.prank(bob);
        wg.buy(id, wg.YES(), 10, type(uint256).max);
        assertEq(USDC.balanceOf(address(pool)) - p0, toll * 69 / 100);
        assertEq(wg.yesOf(id, bob), 10);
    }

    function test_solvency_fence_never_oversells() public {
        uint256 id = _book(5000, 4e18);                        // thin house
        // 10 YES: worst case 10e18; backing 4 + premiums 5 = 9 < 10 → refuse
        vm.prank(bob);
        vm.expectRevert(Wager.OverBook.selector);
        wg.buy(id, wg.YES(), 10, type(uint256).max);
        // 8 YES: worst 8; 4 + 4 = 8 → exactly covered, sells
        vm.prank(bob);
        wg.buy(id, wg.YES(), 8, type(uint256).max);
    }

    function test_resolution_pays_unit_house_keeps_losers() public {
        uint256 id = _book(5000, 100e18);
        vm.prank(bob);   wg.buy(id, wg.YES(), 10, type(uint256).max);  // 5 in
        vm.prank(carol); wg.buy(id, wg.NO(), 10, type(uint256).max);   // 5 in

        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(judge);
        wg.resolve(id, wg.YES());

        uint256 b0 = USDC.balanceOf(bob);
        vm.prank(bob);
        uint256 got = wg.claim(id);
        assertEq(got, 10e18);                                  // UNIT per ticket
        assertEq(USDC.balanceOf(bob) - b0, 10e18);
        vm.prank(carol);
        vm.expectRevert(Wager.NothingOwed.selector);           // losers hold paper
        wg.claim(id);
    }

    function test_void_refunds_cost_exactly() public {
        uint256 id = _book(6000, 100e18);
        vm.prank(bob); wg.buy(id, wg.YES(), 10, type(uint256).max);    // 6e18 premium
        vm.warp(block.timestamp + 2 days + 1);                 // judge never showed
        wg.voidExpired(id);
        uint256 b0 = USDC.balanceOf(bob);
        vm.prank(bob);
        assertEq(wg.claim(id), 6e18);                          // cost back, toll excepted
        assertEq(USDC.balanceOf(bob) - b0, 6e18);
    }

    function test_escheat_sweeps_vaultward() public {
        uint256 id = _book(5000, 100e18);
        vm.prank(bob); wg.buy(id, wg.YES(), 10, type(uint256).max);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(judge); wg.resolve(id, wg.NO());              // bob never claims (nothing to)
        vm.warp(block.timestamp + 90 days);
        uint256 v0 = USDC.balanceOf(address(vault));
        vm.prank(alice);
        wg.sweep(id);
        assertEq(USDC.balanceOf(address(vault)) - v0, 105e18); // backing + premium
    }

    function test_withdraw_respects_solvency_and_bond() public {
        uint256 id = _book(5000, 100e18);
        vm.prank(bob); wg.buy(id, wg.YES(), 100, type(uint256).max);   // worst 100; 100+50 covered
        vm.startPrank(alice);
        vm.expectRevert(Wager.OverBook.selector);
        wg.withdrawBacking(id, 60e18);                         // would break cover
        wg.withdrawBacking(id, 50e18);                         // 50+50 = 100, exact
        wg.bond(id);
        vm.expectRevert(Wager.BondHolds.selector);
        wg.withdrawBacking(id, 1);
        vm.stopPrank();
        assertEq(USDC.balanceOf(address(vault)), 50e18);       // vault-ward only
    }

    function test_ragequit_tolls_free_backing_only() public {
        uint256 id = _book(5000, 100e18);
        vm.prank(bob); wg.buy(id, wg.YES(), 100, type(uint256).max);   // worst 100e18, collected 50
        vm.prank(alice); wg.bond(id);
        uint256 p0 = USDC.balanceOf(address(pool));
        vm.prank(alice);
        vault.ragequit();
        // covered 150, worst 100 → free 50 → tax 2.1e18, 69/31
        uint256 tax = 50e18 * 420 / 10_000;
        assertEq(USDC.balanceOf(address(pool)) - p0, tax * 69 / 100);
        (,,,,,,,,, uint128 backing,,,,) = wg.books(id);
        assertEq(uint256(backing), 100e18 - tax);
        assertEq(wg.bondedNow(id), true);
    }

    function test_judge_gates_and_price_freeze() public {
        uint256 id = _book(5000, 10e18);
        vm.prank(bob);
        vm.expectRevert(Wager.NotResolver.selector);
        wg.resolve(id, wg.YES());
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(alice);
        vm.expectRevert(Wager.SalesOver.selector);             // odds frozen after close
        wg.setPrice(id, 7000);
        vm.prank(judge);
        vm.expectRevert(Wager.Params.selector);
        wg.resolve(id, 9);
    }
}
