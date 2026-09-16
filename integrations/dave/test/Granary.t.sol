// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {DaveVault} from "../src/DaveVault.sol";
import {DaveHeld} from "../src/DaveHeld.sol";
import {Granary} from "../src/Granary.sol";
import {Chambers} from "../src/Chambers.sol";
import {MockERC20} from "../src/lib/MockERC20.sol";
import {MockERC4626} from "../src/lib/MockERC4626.sol";

contract FarmModule {
    Chambers immutable ch;
    constructor(Chambers c) { ch = c; }
    function go(
        uint256 daveId, address target, bytes calldata data,
        address spend, uint256 maxSpend
    ) external returns (bytes memory) {
        return ch.act(daveId, target, 0, data, spend, maxSpend);
    }
}

contract GranaryTest is Base {
    Granary gr;
    MockERC20 USDC;
    MockERC4626 silo;
    uint256 daveId;
    DaveVault vault;

    function setUp() public override {
        super.setUp();
        gr = new Granary(address(hub));
        USDC = new MockERC20("USD Coin", "USDC");
        silo = new MockERC4626(address(USDC));
        USDC.mint(alice, 1_000_000e18);
        _openWindow();
        (daveId, vault) = _claim(alice, 1, 1_000e18);
        _tlDo(address(gr), abi.encodeCall(Granary.bless, (address(silo), true)));
    }

    function test_bless_is_timelock_only() public {
        MockERC4626 s2 = new MockERC4626(address(USDC));
        vm.prank(alice);
        vm.expectRevert(Granary.NotTimelock.selector);
        gr.bless(address(s2), true);
        vm.prank(alice);
        vm.expectRevert(Granary.NotBlessed.selector);
        gr.sow(daveId, address(s2), 1e18);
    }

    function test_sow_pins_shares_to_the_vault() public {
        vm.startPrank(alice);
        USDC.approve(address(gr), type(uint256).max);
        uint256 shares = gr.sow(daveId, address(silo), 10_000e18);
        vm.stopPrank();

        uint256 toll = 10_000e18 * 42 / 10_000;
        assertEq(silo.balanceOf(address(vault)), shares);      // the pin
        assertEq(silo.balanceOf(alice), 0);                    // never the caller
        assertEq(shares, 10_000e18 - toll);                    // first depositor 1:1 on seed
        assertEq(USDC.balanceOf(address(pool)), toll * 69 / 100);
    }

    function test_yield_accrues_and_reaps_vaultward() public {
        vm.startPrank(alice);
        USDC.approve(address(gr), type(uint256).max);
        uint256 shares = gr.sow(daveId, address(silo), 10_000e18);
        vm.stopPrank();

        USDC.mint(address(silo), 1_000e18);                    // the field grows 10%
        uint256 expect = gr.previewReap(address(silo), shares);
        assertGt(expect, 10_000e18 - 10_000e18 * 42 / 10_000); // more than sown

        // shares live in the vault; unsealed bearer routes them out to reap
        vm.warp(vault.unlockAt() + 1);
        vm.startPrank(alice);
        bytes memory pull = abi.encodeWithSelector(
            0xa9059cbb, alice, shares
        );
        vault.execute(address(silo), 0, pull, 0);              // unsealed full arm
        MockERC20(address(silo)).approve(address(gr), shares);
        uint256 got = gr.reap(daveId, address(silo), shares);
        vm.stopPrank();
        assertEq(got, expect);
        assertEq(USDC.balanceOf(address(vault)), expect);      // assets came HOME, not to alice
    }

    function test_sealed_vault_farms_through_the_chambers() public {
        // fund the vault with a USDC bag, dock a farm module
        vm.startPrank(alice);
        USDC.approve(address(vault), 50_000e18);
        vault.deposit(address(USDC), 50_000e18);
        vm.stopPrank();
        _tlDo(address(hub), abi.encodeCall(DaveHeld.setTarget, (address(gr), true)));
        FarmModule mod = new FarmModule(chambers);
        vm.startPrank(alice);
        chambers.propose(daveId, address(mod));
        vm.warp(block.timestamp + 7 days);
        chambers.dock(daveId, address(mod));
        vm.stopPrank();
        assertTrue(vault.sealed_());

        uint256 amt = 10_000e18;
        // act 1: allowance toward the Granary (a venue)
        mod.go(daveId, address(USDC), abi.encodeWithSelector(0x095ea7b3, address(gr), amt), address(0), 0);
        // act 2: sow — USDC declared spend; shares must land in the vault
        uint256 u0 = USDC.balanceOf(address(vault));
        mod.go(
            daveId, address(gr),
            abi.encodeCall(Granary.sow, (daveId, address(silo), amt)),
            address(USDC), amt
        );
        assertEq(u0 - USDC.balanceOf(address(vault)), amt);    // seed measured out
        assertGt(silo.balanceOf(address(vault)), 0);           // harvest title measured in
        assertTrue(vault.sealed_());                           // the covenant never blinked
    }
}
