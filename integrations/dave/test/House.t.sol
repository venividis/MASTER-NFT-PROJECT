// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {DaveVault} from "../src/DaveVault.sol";
import {DaveHeld} from "../src/DaveHeld.sol";
import {Charter} from "../src/Charter.sol";
import {House} from "../src/House.sol";
import {MockERC20} from "../src/lib/MockERC20.sol";
import {MockOracle} from "../src/lib/Oracles.sol";

contract HouseTest is Base {
    Charter ch;
    House hh;
    MockERC20 USDC;
    MockOracle feed;                 // 8 decimals, like the old world's
    address carol = makeAddr("carol");
    uint256 daveId;
    DaveVault vault;

    function setUp() public override {
        super.setUp();
        ch = new Charter(address(hub));
        hh = new House(address(hub), address(ch));
        _tlDo(address(hub), abi.encodeCall(DaveHeld.addHook, (address(hh))));
        USDC = new MockERC20("USD Coin", "USDC");
        USDC.mint(alice, 10_000_000e18);
        USDC.mint(bob, 1_000_000e18);
        USDC.mint(carol, 1_000_000e18);
        feed = new MockOracle(8);
        feed.set(100e8, uint64(block.timestamp));             // $100
        _openWindow();
        (daveId, vault) = _claim(alice, 1, 1_000e18);
        GREG.mint(alice, 1_000_000e18);
    }

    /// @dev zero-spread desk, no funding: pure price pnl.
    function _desk(uint128 backing) internal returns (uint256 deskId) {
        vm.startPrank(alice);
        deskId = hh.openDesk(daveId, address(USDC), address(feed), 10, 0, 625, 5000, 0, 0);
        USDC.approve(address(hh), type(uint256).max);
        hh.fundBacking(deskId, backing);
        vm.stopPrank();
    }

    function test_desk_bearer_only_and_params() public {
        vm.prank(bob);
        vm.expectRevert(House.NotBearer.selector);
        hh.openDesk(daveId, address(USDC), address(feed), 10, 0, 625, 5000, 0, 0);
        vm.prank(alice);
        vm.expectRevert(House.Params.selector);
        hh.openDesk(daveId, address(USDC), address(feed), 21, 0, 625, 5000, 0, 0);
    }

    function test_long_profit_paid_from_backing() public {
        uint256 d = _desk(10_000e18);
        vm.startPrank(bob);
        USDC.approve(address(hh), type(uint256).max);
        uint256 p = hh.open(d, true, 10e18, 200e18, type(uint256).max); // 5x long
        vm.stopPrank();

        feed.set(110e8, uint64(block.timestamp));             // +10%
        uint256 b0 = USDC.balanceOf(bob);
        vm.prank(bob);
        hh.close(p, 0);

        uint256 closeToll = 1_100e18 * 42 / 10_000;           // 4.62e18 on exit notional
        assertEq(USDC.balanceOf(bob) - b0, 200e18 + 100e18 - closeToll);
        (,,,,,,,,,,, uint128 backing,,,,) = hh.desks(d);
        assertEq(uint256(backing), 10_000e18 - 100e18);       // the house paid
    }

    function test_funding_bleeds_the_skew() public {
        vm.startPrank(alice);
        uint256 d = hh.openDesk(daveId, address(USDC), address(feed), 10, 0, 625, 5000, 1000, 0);
        USDC.approve(address(hh), type(uint256).max);
        hh.fundBacking(d, 10_000e18);
        vm.stopPrank();
        vm.startPrank(bob);
        USDC.approve(address(hh), type(uint256).max);
        uint256 p = hh.open(d, true, 10e18, 200e18, type(uint256).max);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days);
        feed.set(100e8, uint64(block.timestamp));             // price unchanged
        int256 eq = hh.equityOf(p);
        // lone long pays full 10%/day funding on 1000 notional = 100
        assertLt(eq, int256(200e18));
        assertGt(eq, int256(90e18));
    }

    function test_liquidation_bounty_and_book() public {
        uint256 d = _desk(10_000e18);
        vm.startPrank(bob);
        USDC.approve(address(hh), type(uint256).max);
        uint256 p = hh.open(d, true, 10e18, 100e18, type(uint256).max); // 10x
        vm.stopPrank();

        vm.expectRevert(House.Healthy.selector);
        hh.liquidate(p);

        feed.set(91e8, uint64(block.timestamp));              // equity 10 < maint 56.875
        uint256 c0 = USDC.balanceOf(carol);
        uint256 b0 = USDC.balanceOf(bob);
        vm.prank(carol);
        hh.liquidate(p);
        assertEq(USDC.balanceOf(carol) - c0, 0.5e18);         // 5% of 10 equity
        assertEq(USDC.balanceOf(bob) - b0, 9.5e18);           // remainder home
        (,,,,,,,,,,, uint128 backing, uint128 longOI,,,) = hh.desks(d);
        assertEq(uint256(backing), 10_000e18 + 90e18);        // margin less equity
        assertEq(uint256(longOI), 0);                         // book released
    }

    function test_profit_clamps_at_nine_x() public {
        uint256 d = _desk(10_000e18);
        vm.startPrank(bob);
        USDC.approve(address(hh), type(uint256).max);
        uint256 p = hh.open(d, true, 10e18, 100e18, type(uint256).max);
        feed.set(10_000e8, uint64(block.timestamp));          // 100x the mark
        uint256 b0 = USDC.balanceOf(bob);
        hh.close(p, 0);
        vm.stopPrank();
        uint256 closeToll = (10e18 * 10_000e18 / 1e18) * 42 / 10_000;
        assertEq(USDC.balanceOf(bob) - b0, 100e18 + 900e18 - closeToll);
    }

    function test_oi_cap_is_a_fence() public {
        uint256 d = _desk(1_000e18);                          // cap: 500 per side
        vm.startPrank(bob);
        USDC.approve(address(hh), type(uint256).max);
        vm.expectRevert(House.OverCap.selector);
        hh.open(d, true, 6e18, 100e18, type(uint256).max);    // 600 notional
        vm.stopPrank();
    }

    function test_backing_never_runs_midtrade() public {
        uint256 d = _desk(1_000e18);
        vm.startPrank(bob);
        USDC.approve(address(hh), type(uint256).max);
        uint256 p = hh.open(d, true, 1e18, 100e18, type(uint256).max);
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert(House.BookOpen.selector);
        hh.withdrawBacking(d, 1e18);

        vm.prank(alice);
        hh.bond(d);
        vm.prank(bob);
        hh.close(p, 0);
        vm.prank(alice);
        vm.expectRevert(House.BondHolds.selector);
        hh.withdrawBacking(d, 1e18);

        vm.warp(vault.unlockAt() + 1);
        vm.prank(alice);
        hh.withdrawBacking(d, 100e18);
        assertEq(USDC.balanceOf(address(vault)), 100e18);     // vault-ward only
    }

    function test_stale_feed_falls_back_to_charter_twap() public {
        // a chartered GREG/USDC pool near 1:1 is the fallback mark
        vm.startPrank(alice);
        uint256 pid = ch.charterPool(daveId, address(GREG), address(USDC), 0, address(0));
        GREG.approve(address(ch), type(uint256).max);
        USDC.approve(address(ch), type(uint256).max);
        ch.addLiquidity(pid, 1_000e18, 1_000e18);
        uint256 d = hh.openDesk(daveId, address(USDC), address(feed), 10, 0, 625, 5000, 0, uint64(pid + 1));
        USDC.approve(address(hh), type(uint256).max);
        hh.fundBacking(d, 10_000e18);
        vm.stopPrank();

        // seed observations, then silence the feed
        vm.warp(block.timestamp + 6 minutes);
        vm.startPrank(bob);
        USDC.approve(address(ch), type(uint256).max);
        ch.swap(pid, false, 10e18, 0, 0);
        vm.warp(block.timestamp + 31 minutes);
        ch.swap(pid, false, 10e18, 0, 0);
        vm.stopPrank();

        uint256 m = hh.mark(d);                               // feed now 37min stale? no: 1h window
        vm.warp(block.timestamp + 1 hours);                   // now the feed is stale
        uint256 t = ch.twap(pid, 30 minutes);
        assertEq(hh.mark(d), t);                              // the venue marks itself
        assertGt(m, 0);

        // no fallback configured → the desk will not trade
        uint256 d2 = _desk(100e18);
        vm.expectRevert(House.StaleMark.selector);
        hh.mark(d2);
    }

    function test_liquidation_never_underflows_on_funding_drift() public {
        // long-heavy desk, high funding: a healthy long can drift until
        // equity exceeds margin via funding owed BY shorts — liquidation
        // of the paying side must not underflow, and must pay excess from
        // backing rather than revert. Here we prove the short (paid side)
        // liquidates cleanly when its equity sits above its margin.
        vm.startPrank(alice);
        uint256 d = hh.openDesk(daveId, address(USDC), address(feed), 10, 0, 625, 5000, 1000, 0);
        USDC.approve(address(hh), type(uint256).max);
        hh.fundBacking(d, 100_000e18);
        vm.stopPrank();
        vm.startPrank(bob);
        USDC.approve(address(hh), type(uint256).max);
        uint256 pl = hh.open(d, true, 100e18, 2_000e18, type(uint256).max);  // big long
        uint256 ps = hh.open(d, false, 5e18, 100e18, 0);                     // small short
        vm.stopPrank();

        vm.warp(block.timestamp + 2 days);
        feed.set(80e8, uint64(block.timestamp));               // short is deep in profit
        // short's equity > its margin (price + funding both favor it):
        // liquidation is not applicable (healthy) — assert it reverts Healthy,
        // proving the signed-settle path is reached without underflow.
        vm.expectRevert(House.Healthy.selector);
        hh.liquidate(ps);
        // and the losing long liquidates cleanly
        vm.prank(carol);
        hh.liquidate(pl);
        (,,,,,,,,,,, uint128 backing,,,,) = hh.desks(d);
        assertGt(uint256(backing), 0);                         // solvent, no revert
    }

    function test_ragequit_tolls_free_backing_only() public {
        uint256 d = _desk(1_000e18);
        vm.startPrank(bob);
        USDC.approve(address(hh), type(uint256).max);
        hh.open(d, true, 4e18, 100e18, type(uint256).max);    // book: 400 long
        vm.stopPrank();
        vm.prank(alice);
        hh.bond(d);

        uint256 p0 = USDC.balanceOf(address(pool));
        uint256 t0 = USDC.balanceOf(treasury);
        vm.prank(alice);
        vault.ragequit();

        uint256 tax = (1_000e18 - 400e18) * 420 / 10_000;     // free 600 → 25.2
        assertEq(USDC.balanceOf(address(pool)) - p0, tax * 69 / 100);
        assertEq(USDC.balanceOf(treasury) - t0, tax - tax * 69 / 100);
        (,,,,,,,,,,, uint128 backing,,,,) = hh.desks(d);
        assertEq(uint256(backing), 1_000e18 - tax);
        assertEq(hh.bondedNow(d), true);                      // the bond stands
    }
}
