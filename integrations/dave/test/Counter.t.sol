// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {DaveVault} from "../src/DaveVault.sol";
import {DaveHeld} from "../src/DaveHeld.sol";
import {Counter, IFlashBorrower} from "../src/Counter.sol";
import {MockERC20} from "../src/lib/MockERC20.sol";

/// @dev honest borrower: repays amount + fee.
contract FlashUser is IFlashBorrower {
    function onFlashLoan(address, address token, uint256 amount, uint256 fee, bytes calldata)
        external returns (bytes32)
    {
        MockERC20(token).approve(msg.sender, amount + fee);
        return keccak256("Counter.flash");
    }
}
/// @dev deadbeat: acknowledges, never approves repayment.
contract FlashThief is IFlashBorrower {
    function onFlashLoan(address, address, uint256, uint256, bytes calldata)
        external pure returns (bytes32)
    { return keccak256("Counter.flash"); }
}

contract CounterTest is Base {
    Counter ct;
    MockERC20 USDC;
    uint256 lenderDave; DaveVault lenderVault;
    uint256 debtorDave; DaveVault debtorVault;
    uint256 tillId;

    function setUp() public override {
        super.setUp();
        ct = new Counter(address(hub));
        _tlDo(address(hub), abi.encodeCall(DaveHeld.addHook, (address(ct))));
        USDC = new MockERC20("USD Coin", "USDC");
        USDC.mint(alice, 1_000_000e18);
        USDC.mint(bob, 1_000_000e18);
        _openWindow();
        (lenderDave, lenderVault) = _claim(alice, 1, 1_000e18);
        (debtorDave, debtorVault) = _claim(bob, 1, 1_000e18);

        vm.startPrank(alice);
        tillId = ct.openTill(lenderDave, address(USDC), 9);    // 0.09% flash fee
        USDC.approve(address(ct), type(uint256).max);
        ct.fundTill(tillId, 100_000e18);
        vm.stopPrank();
    }

    function test_flash_cycle_fee_compounds_less_toll() public {
        FlashUser u = new FlashUser();
        USDC.mint(address(u), 100e18);                         // fee money
        uint256 amt = 100_000e18;
        uint256 fee = amt * 9 / 10_000;                        // 90e18
        uint256 toll = fee * 42 / 10_000;
        uint256 p0 = USDC.balanceOf(address(pool));

        ct.flash(tillId, amt, address(u), "");

        (,,,,, uint128 liq,) = ct.tills(tillId);
        assertEq(uint256(liq), 100_000e18 + fee - toll);       // the drawer grew
        assertEq(USDC.balanceOf(address(pool)) - p0, toll * 69 / 100);
    }

    function test_flash_thief_reverts_whole() public {
        FlashThief thief = new FlashThief();
        vm.expectRevert();                                     // repay pull fails
        ct.flash(tillId, 1_000e18, address(thief), "");
        (,,,,, uint128 liq,) = ct.tills(tillId);
        assertEq(uint256(liq), 100_000e18);                    // nothing left the covenant
    }

    function test_pawn_full_cycle_repay() public {
        vm.startPrank(bob);
        hub.setApprovalForAll(address(ct), true);
        uint256 pawnId = ct.proposePawn(tillId, debtorDave, 10_000e18, 1_000, 30 days);
        assertEq(hub.ownerOf(debtorDave), address(ct));        // escrowed now
        vm.stopPrank();

        // the escrowed Dave is INERT: its old bearer commands nothing
        vm.prank(bob);
        vm.expectRevert();
        debtorVault.ragequit();

        uint256 b0 = USDC.balanceOf(bob);
        vm.prank(alice);
        ct.acceptPawn(pawnId);
        assertEq(USDC.balanceOf(bob) - b0, 10_000e18);         // principal out

        vm.warp(block.timestamp + 10 days);
        vm.startPrank(bob);
        USDC.approve(address(ct), type(uint256).max);
        ct.repay(pawnId);                                      // principal + 10% flat
        vm.stopPrank();
        assertEq(hub.ownerOf(debtorDave), bob);                // the Dave walks home

        uint256 fee = 1_000e18;
        uint256 toll = fee * 42 / 10_000;
        (,,,,, uint128 liq,) = ct.tills(tillId);
        assertEq(uint256(liq), 100_000e18 + fee - toll);       // fee compounded
    }

    function test_pawn_default_forfeits_into_lender_vault() public {
        vm.startPrank(bob);
        hub.setApprovalForAll(address(ct), true);
        uint256 pawnId = ct.proposePawn(tillId, debtorDave, 10_000e18, 1_000, 30 days);
        vm.stopPrank();
        vm.prank(alice);
        ct.acceptPawn(pawnId);

        vm.warp(block.timestamp + 30 days);
        vm.prank(alice);
        vm.expectRevert(Counter.NotDue.selector);              // not past due yet
        ct.seize(pawnId);

        vm.warp(block.timestamp + 1);
        vm.prank(bob);
        vm.expectRevert(Counter.PastDue.selector);             // too late to repay
        ct.repay(pawnId);
        vm.prank(alice);
        ct.seize(pawnId);
        assertEq(hub.ownerOf(debtorDave), address(lenderVault)); // eaten by the vault
    }

    function test_cancel_before_acceptance() public {
        vm.startPrank(bob);
        hub.setApprovalForAll(address(ct), true);
        uint256 pawnId = ct.proposePawn(tillId, debtorDave, 1e18, 100, 1 days);
        ct.cancelPawn(pawnId);
        assertEq(hub.ownerOf(debtorDave), bob);
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert(Counter.WrongState.selector);
        ct.acceptPawn(pawnId);
    }

    function test_draw_and_bond_and_ragequit() public {
        vm.startPrank(alice);
        ct.drawTill(tillId, 40_000e18);
        assertEq(USDC.balanceOf(address(lenderVault)), 40_000e18); // vault-ward
        ct.bond(tillId);
        vm.expectRevert(Counter.BondHolds.selector);
        ct.drawTill(tillId, 1);
        vm.stopPrank();

        uint256 p0 = USDC.balanceOf(address(pool));
        vm.prank(alice);
        lenderVault.ragequit();
        uint256 tax = 60_000e18 * 420 / 10_000;
        assertEq(USDC.balanceOf(address(pool)) - p0, tax * 69 / 100);
        (,,,,, uint128 liq,) = ct.tills(tillId);
        assertEq(uint256(liq), 60_000e18 - tax);
        assertEq(ct.bondedNow(tillId), true);
    }
}
