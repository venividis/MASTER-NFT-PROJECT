// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base, DaveVault} from "./Base.t.sol";

contract PoolTest is Base {
    uint256 idA; DaveVault vA;   // DIAMOND x8
    uint256 idB; DaveVault vB;   // OBSIDIAN x40

    function setUp() public override {
        super.setUp();
        _openWindow();
        (idA, vA) = _claim(alice, 2, 1e18);
        (idB, vB) = _claim(bob,   3, 1e18);
    }

    function test_SplitByWeight_8v40() public {
        (bool ok,) = address(pool).call{value: 12 ether}("");
        assertTrue(ok);
        // 48 total weight → alice 8/48, bob 40/48
        assertEq(pool.claimable(idA), 12 ether * 8 / 48);
        assertEq(pool.claimable(idB), 12 ether * 40 / 48);
    }

    function test_ClaimPaysTheVault_NotTheBearer() public {
        vm.deal(address(this), 12 ether);
        (bool ok,) = address(pool).call{value: 12 ether}(""); ok;
        uint256 before_ = address(vA).balance;
        pool.claim(idA);
        assertEq(address(vA).balance - before_, 12 ether * 8 / 48);
        assertEq(alice.balance, 0);                                  // bearer got nothing
    }

    function test_BufferWhenNoWeight() public {
        // retire both weights via expiry settles
        vm.warp(vB.unlockAt() + 1);
        vA.settle(); vB.settle();
        (bool ok,) = address(pool).call{value: 5 ether}(""); ok;
        assertEq(pool.buffered(), 5 ether);
        // fresh seal revives weight; buffer folds into next receipt
        vm.prank(alice); vA.seal(1);
        (ok,) = address(pool).call{value: 1 ether}(""); ok;
        assertEq(pool.claimable(idA), 6 ether);
    }

    function test_WeightChangeSettlesPending() public {
        (bool ok,) = address(pool).call{value: 6 ether}(""); ok;
        uint256 owedA = pool.claimable(idA);
        vm.prank(alice); vA.seal(3);                                 // ratchet to x40
        assertEq(pool.claimable(idA), owedA);                        // history preserved
        (ok,) = address(pool).call{value: 8 ether}(""); ok;
        assertEq(pool.claimable(idA), owedA + 8 ether / 2);          // now 40/80
    }
}
