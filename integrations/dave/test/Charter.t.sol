// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {DaveVault} from "../src/DaveVault.sol";
import {DaveHeld} from "../src/DaveHeld.sol";
import {Charter} from "../src/Charter.sol";
import {MockERC20} from "../src/lib/MockERC20.sol";
import {MockAllowlist} from "../src/lib/Oracles.sol";

contract CharterTest is Base {
    Charter ch;
    MockERC20 USDC;
    uint256 daveId;
    DaveVault vault;

    function setUp() public override {
        super.setUp();
        ch = new Charter(address(hub));
        _tlDo(address(hub), abi.encodeCall(DaveHeld.addHook, (address(ch))));
        USDC = new MockERC20("USD Coin", "USDC");
        USDC.mint(alice, 1_000_000e18);
        USDC.mint(bob, 1_000_000e18);
        _openWindow();
        (daveId, vault) = _claim(alice, 1, 1_000e18);        // IRON, sealed 180d
        GREG.mint(alice, 1_000_000e18);                       // venue inventory
    }

    function _charterFunded(uint16 feeBps) internal returns (uint256 pid) {
        vm.startPrank(alice);
        pid = ch.charterPool(daveId, address(GREG), address(USDC), feeBps, address(0));
        GREG.approve(address(ch), type(uint256).max);
        USDC.approve(address(ch), type(uint256).max);
        ch.addLiquidity(pid, 1_000e18, 1_000e18);
        vm.stopPrank();
    }

    function test_charter_bearer_only() public {
        vm.prank(bob);
        vm.expectRevert(Charter.NotBearer.selector);
        ch.charterPool(daveId, address(GREG), address(USDC), 100, address(0));
    }

    function test_swap_math_toll_and_fee() public {
        uint256 pid = _charterFunded(100);                    // 1% pool fee
        uint256 amtIn = 100e18;
        uint256 toll = amtIn * 42 / 10_000;                   // 0.42e18
        uint256 fee  = amtIn * 100 / 10_000;                  // 1e18
        uint256 inNet = amtIn - toll - fee;
        uint256 expect = 1_000e18 * inNet / (1_000e18 + inNet);

        uint256 p0 = USDC.balanceOf(address(pool));
        uint256 t0 = USDC.balanceOf(treasury);
        vm.startPrank(bob);
        USDC.approve(address(ch), amtIn);
        uint256 got = ch.swap(pid, false, amtIn, 0, 0);       // quote in, base out
        vm.stopPrank();

        assertEq(got, expect);
        assertEq(USDC.balanceOf(address(pool)) - p0, toll * 69 / 100);
        assertEq(USDC.balanceOf(treasury) - t0, toll - toll * 69 / 100);
        (,,,,,,, uint128 rB, uint128 rQ) = ch.pools(pid);
        assertEq(uint256(rQ), 1_000e18 + amtIn - toll);       // fee stays in
        assertEq(uint256(rB), 1_000e18 - got);
    }

    function test_sealed_discount_is_a_fee_tier() public {
        uint256 pid = _charterFunded(100);
        uint256 plain = ch.quoteOut(pid, false, 100e18, 0);
        vm.prank(alice);                                      // bearer of sealed Dave
        uint256 cut = ch.quoteOut(pid, false, 100e18, daveId);
        assertGt(cut, plain);                                 // 80 bps < 100 bps
        vm.prank(bob);                                        // not the bearer
        vm.expectRevert(Charter.NotBearer.selector);
        ch.swap{value: 0}(pid, false, 100e18, 0, daveId);
    }

    function test_bond_freezes_and_exits_vaultward() public {
        uint256 pid = _charterFunded(0);
        vm.startPrank(alice);
        ch.bond(pid);
        vm.expectRevert(Charter.BondHolds.selector);
        ch.withdrawLiquidity(pid, 1, 0);
        vm.expectRevert(Charter.BondHolds.selector);
        ch.setPolicy(pid, 50, address(0));
        ch.addLiquidity(pid, 10e18, 0);                       // additive still fine
        vm.stopPrank();

        vm.warp(vault.unlockAt() + 1);
        vm.prank(alice);
        ch.withdrawLiquidity(pid, 100e18, 100e18);
        assertEq(GREG.balanceOf(address(vault)) >= 100e18, true);
        assertEq(USDC.balanceOf(address(vault)), 100e18);     // vault-ward, not wallet
    }

    function test_bond_requires_live_seal() public {
        uint256 pid = _charterFunded(0);
        vm.warp(vault.unlockAt() + 1);
        vm.prank(alice);
        vm.expectRevert(Charter.NotSealed.selector);
        ch.bond(pid);
    }

    function test_ragequit_tolls_both_reserves() public {
        uint256 pid = _charterFunded(0);
        vm.prank(alice);
        ch.bond(pid);
        uint256 pg0 = GREG.balanceOf(address(pool));
        uint256 pu0 = USDC.balanceOf(address(pool));
        vm.prank(alice);
        vault.ragequit();
        uint256 tax = 1_000e18 * 420 / 10_000;                // 42e18 each leg
        assertEq(GREG.balanceOf(address(pool)) - pg0 >= tax * 69 / 100, true);
        assertEq(USDC.balanceOf(address(pool)) - pu0, tax * 69 / 100);
        (,,,,,,, uint128 rB, uint128 rQ) = ch.pools(pid);
        assertEq(uint256(rB), 1_000e18 - tax);
        assertEq(uint256(rQ), 1_000e18 - tax);
        assertEq(ch.bondedNow(pid), true);                    // the charter stands
    }

    function test_twap_observes() public {
        uint256 pid = _charterFunded(0);
        vm.warp(block.timestamp + 6 minutes);
        vm.startPrank(bob);
        USDC.approve(address(ch), type(uint256).max);
        ch.swap(pid, false, 10e18, 0, 0);                     // checkpoint
        vm.warp(block.timestamp + 31 minutes);
        ch.swap(pid, false, 10e18, 0, 0);
        vm.stopPrank();
        uint256 t = ch.twap(pid, 30 minutes);
        assertGt(t, 0.9e18);                                  // near 1:1 pool
        assertLt(t, 1.2e18);
    }

    function test_allowlist_gates_the_venue() public {
        MockAllowlist gate = new MockAllowlist();
        vm.startPrank(alice);
        uint256 pid = ch.charterPool(daveId, address(GREG), address(USDC), 0, address(gate));
        GREG.approve(address(ch), type(uint256).max);
        USDC.approve(address(ch), type(uint256).max);
        ch.addLiquidity(pid, 100e18, 100e18);
        vm.stopPrank();

        vm.startPrank(bob);
        USDC.approve(address(ch), type(uint256).max);
        vm.expectRevert(Charter.NotAllowed.selector);
        ch.swap(pid, false, 1e18, 0, 0);
        vm.stopPrank();
        gate.set(bob, true);
        vm.prank(bob);
        ch.swap(pid, false, 1e18, 0, 0);
    }

    function test_eth_quote_pool() public {
        vm.deal(alice, 100 ether); vm.deal(bob, 10 ether);
        vm.startPrank(alice);
        uint256 pid = ch.charterPool(daveId, address(GREG), address(0), 0, address(0));
        GREG.approve(address(ch), type(uint256).max);
        ch.addLiquidity{value: 50 ether}(pid, 1_000e18, 50 ether);
        vm.stopPrank();

        uint256 g0 = GREG.balanceOf(bob);
        vm.prank(bob);
        uint256 got = ch.swap{value: 1 ether}(pid, false, 1 ether, 0, 0);
        assertEq(GREG.balanceOf(bob) - g0, got);
        assertGt(got, 0);
    }
}
