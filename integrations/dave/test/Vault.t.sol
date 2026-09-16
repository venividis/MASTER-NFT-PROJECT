// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base, DaveVault} from "./Base.t.sol";
import {Tiers} from "../src/lib/Tiers.sol";

contract VaultTest is Base {
    uint256 id; DaveVault v;

    function setUp() public override {
        super.setUp();
        _openWindow();
        (id, v) = _claim(alice, 1, 1_000_000e18);       // IRON genesis
    }

    // INVARIANT 1 — the seal never shortens
    function testFuzz_RatchetNeverShortens(uint8 a, uint8 b) public {
        a = uint8(bound(a, 0, 3)); b = uint8(bound(b, 0, 3));
        uint64 u0 = v.unlockAt();
        vm.startPrank(alice);
        if (uint64(block.timestamp) + Tiers.span(a) <= u0) {
            vm.expectRevert(DaveVault.RatchetOnly.selector);
            v.seal(a);
        } else { v.seal(a); assertGt(v.unlockAt(), u0); }
        uint64 u1 = v.unlockAt();
        if (uint64(block.timestamp) + Tiers.span(b) <= u1) {
            vm.expectRevert(DaveVault.RatchetOnly.selector);
            v.seal(b);
        } else { v.seal(b); assertGt(v.unlockAt(), u1); }
        vm.stopPrank();
        assertGe(v.unlockAt(), u0);
    }

    // INVARIANT 2 — sealed bags cannot move via execute
    function test_ExecuteBlockedWhileSealed() public {
        vm.prank(alice);
        vm.expectRevert(DaveVault.BagsSealed.selector);
        v.execute(address(GREG), 0, abi.encodeCall(GREG.transfer, (alice, 1)), 0);
    }
    function test_ExecuteOnlyBearer() public {
        vm.warp(v.unlockAt() + 1);
        vm.prank(bob);
        vm.expectRevert(DaveVault.NotBearer.selector);
        v.execute(address(GREG), 0, "", 0);
    }
    function test_ExecuteAfterExpiry_Sweeps() public {
        vm.warp(v.unlockAt() + 1);
        uint256 bal = GREG.balanceOf(address(v));
        vm.prank(alice);
        v.execute(address(GREG), 0, abi.encodeCall(GREG.transfer, (alice, bal)), 0);
        assertEq(GREG.balanceOf(address(v)), 0);
    }

    // INVARIANT 3 — ragequit math conserves: 4.20% out, 69/31 split
    function testFuzz_RagequitMath(uint96 extra) public {
        uint256 amt = uint256(extra) % 5_000_000e18;
        if (amt > 0) { vm.startPrank(bob); GREG.approve(address(v), amt); v.deposit(address(GREG), amt); vm.stopPrank(); }
        uint256 bal = GREG.balanceOf(address(v));
        uint256 poolBefore = GREG.balanceOf(address(pool));
        uint256 treBefore  = GREG.balanceOf(treasury);
        vm.prank(alice); v.ragequit();
        uint256 tax = bal * 420 / 10_000;
        uint256 toPool = tax * 69 / 100;
        assertEq(GREG.balanceOf(address(pool)) - poolBefore, toPool);
        assertEq(GREG.balanceOf(treasury) - treBefore, tax - toPool);
        assertEq(GREG.balanceOf(address(v)), bal - tax);
        assertEq(v.paperHands(), 1);
        assertEq(v.unlockAt(), 0);
    }
    function test_RagequitTaxesNativeETH() public {
        vm.deal(address(v), 10 ether);
        uint256 poolBefore = address(pool).balance;
        vm.prank(alice); v.ragequit();
        uint256 tax = 10 ether * 420 / 10_000;
        assertEq(address(pool).balance - poolBefore, tax * 69 / 100);
        assertEq(address(v).balance, 10 ether - tax);
    }

    // temper: earned on natural expiry, never on ragequit
    function test_TemperOnNaturalExpiry() public {
        vm.warp(v.unlockAt() + 1);
        v.settle();
        assertEq(v.temper(), 1);
        assertEq(v.paperHands(), 0);
    }
    function test_NoTemperOnRagequit() public {
        vm.prank(alice); v.ragequit();
        vm.warp(block.timestamp + 400 days);
        v.settle();
        assertEq(v.temper(), 0);
    }

    // conviction accrues mult-seconds and survives ratchets
    function test_ConvictionAccrual() public {
        uint256 c0 = v.convictionLive();
        vm.warp(block.timestamp + 10 days);
        assertEq(v.convictionLive() - c0, 10 days * 3);      // IRON x3
        vm.prank(alice); v.seal(3);                           // OBSIDIAN ratchet
        vm.warp(block.timestamp + 5 days);
        assertEq(v.convictionLive() - c0, 10 days * 3 + 5 days * 40);
    }

    // genesis hubSeal is once-only and hub-only
    function test_HubSealGuards() public {
        vm.expectRevert(DaveVault.NotHub.selector);
        v.hubSeal(2);
    }

    // deposits ratchet IN anytime; sealed on arrival
    function test_DepositWhileSealed() public {
        vm.startPrank(bob);
        GREG.approve(address(v), 5e18);
        v.deposit(address(GREG), 5e18);
        vm.stopPrank();
        assertTrue(v.sealed_());
        assertEq(v.bagAmount(address(GREG)), 1_000_005e18);
    }
}
