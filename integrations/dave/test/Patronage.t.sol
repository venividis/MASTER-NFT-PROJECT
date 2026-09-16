// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base, DaveVault} from "./Base.t.sol";
import {Patronage} from "../src/Patronage.sol";
import {MockERC20} from "../src/lib/MockERC20.sol";

contract PatronageTest is Base {
    MockERC20 USDG;
    address sponsor = makeAddr("sponsor");
    uint256 idA; DaveVault vA;      // OBSIDIAN, big bag
    uint256 idB; DaveVault vB;      // OBSIDIAN, small bag
    uint256 camp;

    function setUp() public override {
        super.setUp();
        _openWindow();
        (idA, vA) = _claim(alice, 3, 3_000_000e18);
        (idB, vB) = _claim(bob,   3, 1_000_000e18);
        USDG = new MockERC20("USD Global", "USDG");
        USDG.mint(sponsor, 1_000_000e18);
        vm.startPrank(sponsor);
        USDG.approve(address(pat), type(uint256).max);
        camp = pat.postCampaign(address(GREG), address(USDG), 100_000e18, 180 days, 1);
        vm.stopPrank();
    }

    function _pot() internal view returns (uint128 p) { (,, p,,,,,,,,,) = pat.campaigns(camp); }

    function test_FeeSplit_2pct() public view {
        assertEq(USDG.balanceOf(treasury), 1_000e18);
        assertEq(USDG.balanceOf(address(pool)), 1_000e18);
        assertEq(_pot(), 98_000e18);
    }

    function test_EnlistGates() public {
        // term short: PAPER genesis in GREG tranche can't cover 180d — simulate via fresh IRON 180d < camp end? camp end = now+180d; IRON unlock = now+180d → c.end > unlockAt false edge. Use expired vault:
        vm.warp(vA.unlockAt() + 1); vA.settle();
        vm.prank(alice);
        vm.expectRevert(Patronage.UnlockedHands.selector);
        pat.enlist(camp, idA);
    }
    function test_EnlistNotBearer() public {
        vm.prank(bob);
        vm.expectRevert(Patronage.NotBearer.selector);
        pat.enlist(camp, idA);
    }
    function test_NoBagNoService() public {
        // vault sealed but holds no USDG-campaign sealToken? sealToken is GREG and both hold GREG.
        // build a campaign for a token neither holds:
        MockERC20 X = new MockERC20("X", "X"); X.mint(sponsor, 1e24);
        vm.startPrank(sponsor);
        X.approve(address(pat), type(uint256).max);
        USDG.approve(address(pat), type(uint256).max);
        uint256 c2 = pat.postCampaign(address(X), address(USDG), 10_000e18, 60 days, 0);
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert(Patronage.NoBag.selector);
        pat.enlist(c2, idA);
    }

    function test_AccrualAndClaim_PaysVault() public {
        vm.prank(alice); pat.enlist(camp, idA);
        vm.prank(bob);   pat.enlist(camp, idB);
        vm.warp(block.timestamp + 90 days);                    // half term
        uint128 pa = pat.pending(camp, idA);
        uint128 pb = pat.pending(camp, idB);
        assertApproxEqRel(pa + pb, 49_000e18, 1e15);           // half the pot
        assertApproxEqRel(uint256(pa), uint256(pb) * 3, 1e15); // 3:1 bags, same tier
        uint256 before_ = USDG.balanceOf(address(vA));
        pat.claim(camp, idA);
        assertEq(USDG.balanceOf(address(vA)) - before_, pa);
        assertEq(USDG.balanceOf(alice), 0);                    // born locked
    }

    function test_RagequitForfeitsToTheRoom() public {
        vm.prank(alice); pat.enlist(camp, idA);
        vm.prank(bob);   pat.enlist(camp, idB);
        vm.warp(block.timestamp + 90 days);
        uint128 aliceUnclaimed = pat.pending(camp, idA);
        vm.prank(alice); vA.ragequit();                        // hub hook fans out
        // bob inherits alice's accrual on top of his own
        uint128 pb = pat.pending(camp, idB);
        assertApproxEqRel(uint256(pb), uint256(aliceUnclaimed) / 3 + uint256(aliceUnclaimed), 1e15);
        // conservation: through end, bob claims ≈ full emitted pot
        vm.warp(block.timestamp + 90 days + 1);
        pat.claim(camp, idB);
        assertLe(USDG.balanceOf(address(vB)), 98_000e18);
        assertApproxEqRel(USDG.balanceOf(address(vB)), 98_000e18, 1e14);
    }

    function test_ResidueHomeToSponsor() public {
        // nobody enlists for the first half → that half never emits
        vm.warp(block.timestamp + 90 days);
        vm.prank(alice); pat.enlist(camp, idA);
        vm.warp(block.timestamp + 91 days);
        pat.claim(camp, idA);
        uint256 sBefore = USDG.balanceOf(sponsor);
        uint128 residue = pat.closeCampaign(camp);
        assertApproxEqRel(uint256(residue), 49_000e18, 1e14);
        assertEq(USDG.balanceOf(sponsor) - sBefore, residue);
        vm.expectRevert(Patronage.Closed_.selector);
        pat.closeCampaign(camp);
    }
}
