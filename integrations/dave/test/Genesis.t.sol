// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base, DaveHeld, DaveVault} from "./Base.t.sol";

contract GenesisTest is Base {
    function test_SealToMint_Atomic() public {
        _openWindow();
        (uint256 id, DaveVault v) = _claim(alice, 2, 500_000e18);   // DIAMOND
        assertEq(hub.ownerOf(id), alice);
        assertTrue(v.sealed_());
        assertEq(v.tier(), 2);
        assertEq(v.bagAmount(address(GREG)), 500_000e18);
        assertEq(hub.genesisMinted(), 1);
    }

    function test_OpenTranche_MinTierIron() public {
        _openWindow();
        vm.startPrank(alice);
        GREG.approve(address(hub), 1e18);
        bytes32[] memory empty;
        vm.expectRevert(DaveHeld.TierLow.selector);
        hub.claimGenesis(0, 0, empty, 0, address(GREG), 1e18);      // PAPER refused
        vm.stopPrank();
    }

    function test_WindowGates() public {
        vm.startPrank(alice);
        GREG.approve(address(hub), 1e18);
        bytes32[] memory empty;
        vm.expectRevert(DaveHeld.WindowClosed.selector);            // not open yet
        hub.claimGenesis(0, 0, empty, 1, address(GREG), 1e18);
        vm.stopPrank();
        _openWindow();
        vm.warp(block.timestamp + 72 hours + 1);
        vm.startPrank(alice);
        vm.expectRevert(DaveHeld.WindowClosed.selector);            // book closed
        hub.claimGenesis(0, 0, empty, 1, address(GREG), 1e18);
        vm.stopPrank();
    }

    // GREG snapshot tranche: sorted-pair Merkle, PAPER allowed, leaf single-use
    function test_GregTranche_ProofAndDoubleClaim() public {
        bytes32 la = keccak256(abi.encodePacked(uint256(0), alice));
        bytes32 lb = keccak256(abi.encodePacked(uint256(1), bob));
        bytes32 root = la < lb ? keccak256(abi.encodePacked(la, lb)) : keccak256(abi.encodePacked(lb, la));
        uint64 s = uint64(block.timestamp + tl.DELAY());
        _tlDo(address(hub), abi.encodeCall(DaveHeld.openWindow,
            (s, s + 72 hours, root, bytes32(0), bytes32(0))));
        bytes32[] memory proof = new bytes32[](1); proof[0] = lb;
        vm.startPrank(alice);
        GREG.approve(address(hub), 2e18);
        uint256 id = hub.claimGenesis(1, 0, proof, 0, address(GREG), 1e18);   // PAPER ok here
        assertEq(hub.ownerOf(id), alice);
        vm.expectRevert(DaveHeld.AlreadyClaimed.selector);
        hub.claimGenesis(1, 0, proof, 0, address(GREG), 1e18);
        vm.stopPrank();
        vm.startPrank(bob);                                          // wrong proof
        GREG.approve(address(hub), 1e18);
        vm.expectRevert(DaveHeld.BadProof.selector);
        hub.claimGenesis(1, 0, proof, 0, address(GREG), 1e18);
        vm.stopPrank();
    }

    function test_RankEngravesOnce() public {
        _openWindow();
        (uint256 id,) = _claim(alice, 1, 1e18);
        vm.warp(block.timestamp + 73 hours);
        bytes32 leaf = keccak256(abi.encodePacked(id, uint32(7)));
        _tlDo(address(hub), abi.encodeCall(DaveHeld.postRankRoot, (leaf)));  // 1-leaf tree
        bytes32[] memory empty;
        hub.engraveRank(id, 7, empty);
        assertEq(hub.rankOf(id), 7);
        vm.expectRevert(DaveHeld.RankSet.selector);
        hub.engraveRank(id, 7, empty);
        vm.expectRevert(DaveHeld.BadProof.selector);
        hub.engraveRank(id + 1, 9, empty);
    }

    function test_OpenMint_PriceAndTiming() public {
        _openWindow();
        vm.expectRevert(bytes("genesis first"));
        hub.mint{value: 0.0015 ether}(1);
        vm.warp(block.timestamp + 73 hours);
        vm.deal(bob, 1 ether);
        vm.startPrank(bob);
        vm.expectRevert(DaveHeld.BadPrice.selector);
        hub.mint{value: 0.001 ether}(1);
        uint256 treBefore = treasury.balance;
        hub.mint{value: 0.003 ether}(2);
        vm.stopPrank();
        assertEq(hub.balanceOf(bob), 2);
        assertEq(treasury.balance - treBefore, 0.003 ether);
        assertGt(hub.vaultOf(2).code.length, 0);                     // vaults deployed for new ids
    }

    function test_TokenURI_Serves() public {
        _openWindow();
        (uint256 id,) = _claim(alice, 3, 1_000_000e18);
        string memory uri = hub.tokenURI(id);
        assertGt(bytes(uri).length, 200);                            // json+svg+bootloader present
    }
}
