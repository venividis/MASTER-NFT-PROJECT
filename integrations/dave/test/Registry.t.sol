// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {DaveVault} from "../src/DaveVault.sol";
import {DaveHeld} from "../src/DaveHeld.sol";
import {Registry} from "../src/Registry.sol";
import {MockERC20} from "../src/lib/MockERC20.sol";
import {MockERC721} from "../src/lib/MockERC721.sol";
import {MockOracle, MockAllowlist} from "../src/lib/Oracles.sol";

contract RegistryTest is Base {
    Registry rgy;
    MockERC20 USDC;
    MockERC721 deeds;                 // tokenized T-bill wrappers, say
    MockOracle navFeed;               // 8-decimal NAV per unit
    address artist = makeAddr("issuer");
    address carol = makeAddr("carol");
    uint256 daveId;
    DaveVault vault;

    function setUp() public override {
        super.setUp();
        rgy = new Registry(address(hub));
        _tlDo(address(hub), abi.encodeCall(DaveHeld.addHook, (address(rgy))));
        USDC = new MockERC20("USD Coin", "USDC");
        USDC.mint(alice, 1_000_000e18);
        USDC.mint(bob, 1_000_000e18);
        USDC.mint(carol, 1_000_000e18);
        deeds = new MockERC721("TBILL-2027", "TB27");
        deeds.setRoyalty(artist, 500);                        // issuer fee 5%
        for (uint256 i = 1; i <= 4; ++i) deeds.mint(alice, i);
        for (uint256 i = 101; i <= 104; ++i) deeds.mint(bob, i);
        navFeed = new MockOracle(8);
        navFeed.set(100e8, uint64(block.timestamp));          // NAV $100
        _openWindow();
        (daveId, vault) = _claim(alice, 1, 1_000e18);
    }

    function _lot(uint8 side, uint16 band, address gate) internal returns (uint256 lotId) {
        vm.startPrank(alice);
        lotId = rgy.openLot(daveId, address(deeds), address(USDC), address(navFeed), side, band, gate);
        deeds.setApprovalForAll(address(rgy), true);
        USDC.approve(address(rgy), type(uint256).max);
        if (side != 1) {                                      // shelve on SELL/DUAL
            uint256[] memory ids = new uint256[](2);
            ids[0] = 1; ids[1] = 2;
            rgy.stock(lotId, ids);
        }
        if (side != 0) rgy.fund(lotId, 100_000e18);           // bid on BUY/DUAL
        vm.stopPrank();
    }

    function test_buy_at_nav_plus_band_vaultward() public {
        uint256 lotId = _lot(0, 200, address(0));             // SELL, 2% band
        uint256 gross = 102e18;
        uint256 toll = gross * 42 / 10_000;
        uint256 roy = gross * 500 / 10_000;
        assertEq(rgy.quoteBuy(lotId, 1), gross + toll);

        uint256 v0 = USDC.balanceOf(address(vault));
        uint256 a0 = USDC.balanceOf(artist);
        uint256[] memory ids = new uint256[](1); ids[0] = 1;
        vm.startPrank(bob);
        USDC.approve(address(rgy), type(uint256).max);
        rgy.buy(lotId, ids, type(uint256).max);
        vm.stopPrank();

        assertEq(deeds.ownerOf(1), bob);
        assertEq(USDC.balanceOf(address(vault)) - v0, gross); // proceeds vault-ward
        assertEq(USDC.balanceOf(artist) - a0, roy);
    }

    function test_sell_at_nav_minus_band_swallowed() public {
        uint256 lotId = _lot(1, 200, address(0));             // BUY wall
        uint256 gross = 98e18;
        uint256 out = gross - gross * 42 / 10_000 - gross * 500 / 10_000;

        uint256 b0 = USDC.balanceOf(bob);
        uint256[] memory ids = new uint256[](1); ids[0] = 101;
        vm.startPrank(bob);
        deeds.setApprovalForAll(address(rgy), true);
        rgy.sell(lotId, ids, 0);
        vm.stopPrank();

        assertEq(USDC.balanceOf(bob) - b0, out);
        assertEq(deeds.ownerOf(101), address(vault));         // the Dave eats the paper
    }

    function test_stale_paper_does_not_trade() public {
        uint256 lotId = _lot(0, 200, address(0));
        vm.warp(block.timestamp + 2 days);
        uint256[] memory ids = new uint256[](1); ids[0] = 1;
        vm.startPrank(bob);
        USDC.approve(address(rgy), type(uint256).max);
        vm.expectRevert(Registry.StaleNAV.selector);
        rgy.buy(lotId, ids, type(uint256).max);
        vm.stopPrank();
        vm.expectRevert(Registry.StaleNAV.selector);
        rgy.quoteBuy(lotId, 1);
        navFeed.set(100e8, uint64(block.timestamp));          // feed wakes
        vm.prank(bob);
        rgy.buy(lotId, ids, type(uint256).max);
    }

    function test_compliance_gate_per_lot() public {
        MockAllowlist gate = new MockAllowlist();
        uint256 lotId = _lot(0, 200, address(gate));
        uint256[] memory ids = new uint256[](1); ids[0] = 1;
        vm.startPrank(bob);
        USDC.approve(address(rgy), type(uint256).max);
        vm.expectRevert(Registry.NotAllowed.selector);
        rgy.buy(lotId, ids, type(uint256).max);
        vm.stopPrank();
        gate.set(bob, true);
        vm.prank(bob);
        rgy.buy(lotId, ids, type(uint256).max);
        assertEq(deeds.ownerOf(1), bob);
    }

    function test_bond_freezes_and_ragequit_tolls() public {
        uint256 lotId = _lot(2, 200, address(0));             // DUAL
        vm.startPrank(alice);
        rgy.bond(lotId);
        vm.expectRevert(Registry.BondHolds.selector);
        rgy.drain(lotId, 1e18);
        vm.expectRevert(Registry.BondHolds.selector);
        rgy.setPolicy(lotId, 100, address(0));
        vm.stopPrank();

        uint256 p0 = USDC.balanceOf(address(pool));
        vm.prank(alice);
        vault.ragequit();
        uint256 tax = 100_000e18 * 420 / 10_000;              // 4.20% of the bid
        assertEq(USDC.balanceOf(address(pool)) - p0, tax * 69 / 100);
        (,,,,,,,,, uint128 quoteBal) = rgy.lots(lotId);
        assertEq(uint256(quoteBal), 100_000e18 - tax);
        assertEq(rgy.bondedNow(lotId), true);                 // the bond stands
    }

    function test_dual_captures_the_band_both_ways() public {
        uint256 lotId = _lot(2, 200, address(0));             // DUAL, 2%
        (,,,,,,,,, uint128 q0) = rgy.lots(lotId);

        uint256[] memory ids = new uint256[](1); ids[0] = 1;
        vm.startPrank(bob);
        USDC.approve(address(rgy), type(uint256).max);
        deeds.setApprovalForAll(address(rgy), true);
        rgy.buy(lotId, ids, type(uint256).max);               // desk sells at 102
        rgy.sell(lotId, ids, 0);                              // desk buys back at 98
        vm.stopPrank();

        (,,,,,,,,, uint128 q1) = rgy.lots(lotId);
        assertEq(uint256(q1) - uint256(q0), 4e18);            // 2×band×NAV round trip
        assertEq(deeds.ownerOf(1), address(rgy));             // reshelved
    }
}
