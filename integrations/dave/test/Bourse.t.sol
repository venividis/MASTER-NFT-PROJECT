// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {DaveVault} from "../src/DaveVault.sol";
import {Bourse} from "../src/Bourse.sol";
import {Curves} from "../src/lib/Curves.sol";
import {MockERC20} from "../src/lib/MockERC20.sol";
import {MockERC721} from "../src/lib/MockERC721.sol";
import {DaveHeld} from "../src/DaveHeld.sol";

contract BourseTest is Base {
    Bourse bourse;
    MockERC721 punks;
    MockERC20 USDC;

    address artist = makeAddr("artist");

    uint256 daveId;
    DaveVault vault;

    function setUp() public override {
        super.setUp();
        bourse = new Bourse(address(hub));
        _tlDo(address(hub), abi.encodeCall(DaveHeld.addHook, (address(bourse))));

        punks = new MockERC721("MOCKPUNKS", "MPUNK");
        punks.setRoyalty(artist, 500);                       // 5%
        for (uint256 i = 1; i <= 5; ++i) punks.mint(alice, i);
        for (uint256 i = 101; i <= 105; ++i) punks.mint(bob, i);

        USDC = new MockERC20("MockUSD", "USDC");
        USDC.mint(alice, 1_000_000e18);

        _openWindow();
        (daveId, vault) = _claim(alice, 1, 1_000e18);        // IRON, GREG bag

        vm.startPrank(alice);
        punks.setApprovalForAll(address(bourse), true);
        GREG.approve(address(bourse), type(uint256).max);
        USDC.approve(address(bourse), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(bob);
        punks.setApprovalForAll(address(bourse), true);
        GREG.approve(address(bourse), type(uint256).max);
        vm.stopPrank();
    }

    // ─── helpers ─────────────────────────────────────────────────────
    function _sellStall(uint128 spot, uint128 delta) internal returns (uint256 sid) {
        vm.startPrank(alice);
        sid = bourse.openStall(daveId, address(punks), address(GREG), Curves.LINEAR, bourse.SELL(), spot, delta, 0);
        uint256[] memory ids = new uint256[](3);
        ids[0] = 1; ids[1] = 2; ids[2] = 3;
        bourse.stock(sid, ids);
        vm.stopPrank();
    }

    function _spotOf(uint256 sid) internal view returns (uint128 sp) {
        (,,,,,,,, sp,,) = bourse.stalls(sid);
    }
    function _quoteBalOf(uint256 sid) internal view returns (uint128 qb) {
        (,,,,,,,,,, qb) = bourse.stalls(sid);
    }

    // ─── keeping ─────────────────────────────────────────────────────
    function test_OpenStall_BearerOnly() public {
        vm.prank(bob);
        vm.expectRevert(Bourse.NotBearer.selector);
        bourse.openStall(daveId, address(punks), address(GREG), Curves.LINEAR, 0, 1e18, 0.1e18, 0);
    }

    function test_FeeRule_DualOnly_AndCapped() public {
        vm.startPrank(alice);
        vm.expectRevert(Bourse.FeeRule.selector);
        bourse.openStall(daveId, address(punks), address(GREG), Curves.FLAT, bourse.SELL(), 1e18, 0, 100);
        vm.expectRevert(Bourse.FeeRule.selector);
        bourse.openStall(daveId, address(punks), address(GREG), Curves.FLAT, bourse.DUAL(), 1e18, 0, 1_500);
        vm.stopPrank();
    }

    function test_ControlTravelsWithTheDave() public {
        uint256 sid = _sellStall(1e18, 0.1e18);
        vm.prank(alice);
        hub.transferFrom(alice, bob, daveId);               // sell the Dave, sell the book
        vm.prank(alice);
        vm.expectRevert(Bourse.NotBearer.selector);
        bourse.reprice(sid, 2e18, 0.1e18, 0);
        vm.prank(bob);
        bourse.reprice(sid, 2e18, 0.1e18, 0);
        assertEq(_spotOf(sid), 2e18);
    }

    // ─── SELL: walk up, toll split, vault-ward proceeds ──────────────
    function test_Buy_WalksUp_SplitsToll_PaysVault() public {
        uint256 sid = _sellStall(1e18, 0.1e18);
        (uint256 gross, uint256 paid,) = bourse.quoteBuy(sid, 1);
        assertEq(gross, 1.1e18);                            // step(spot) = s + d

        uint256 toll = gross * 42 / 10_000;
        uint256 roy  = gross * 500 / 10_000;
        assertEq(paid, gross + toll + roy);

        uint256 vaultBefore = GREG.balanceOf(address(vault));
        uint256[] memory ids = new uint256[](1); ids[0] = 1;
        vm.prank(bob);
        bourse.buy(sid, ids, paid);

        assertEq(punks.ownerOf(1), bob);
        assertEq(_spotOf(sid), 1.1e18);
        assertEq(GREG.balanceOf(address(vault)) - vaultBefore, gross);   // born locked
        assertEq(GREG.balanceOf(address(pool)), toll * 69 / 100);
        assertEq(GREG.balanceOf(treasury), toll - toll * 69 / 100);
        assertEq(GREG.balanceOf(artist), roy);
    }

    function test_Buy_Multi_SumsTheSeries() public {
        uint256 sid = _sellStall(1e18, 0.1e18);
        (uint256 gross, uint256 paid,) = bourse.quoteBuy(sid, 2);
        assertEq(gross, 1.1e18 + 1.2e18);
        uint256[] memory ids = new uint256[](2); ids[0] = 1; ids[1] = 2;
        vm.prank(bob);
        bourse.buy(sid, ids, paid);
        assertEq(_spotOf(sid), 1.2e18);
        assertEq(bourse.shelfLength(sid), 1);
    }

    function test_Buy_SlippageGuard() public {
        uint256 sid = _sellStall(1e18, 0.1e18);
        (, uint256 paid,) = bourse.quoteBuy(sid, 1);
        uint256[] memory ids = new uint256[](1); ids[0] = 1;
        vm.prank(bob);
        vm.expectRevert(Bourse.Slippage.selector);
        bourse.buy(sid, ids, paid - 1);
    }

    // ─── BUY: the wall — the Dave eats the floor ─────────────────────
    function test_Sell_IntoBuyWall_VaultSwallowsNFT() public {
        vm.startPrank(alice);
        uint256 sid = bourse.openStall(daveId, address(punks), address(GREG), Curves.FLAT, bourse.BUY(), 5e18, 0, 0);
        bourse.fund(sid, 50e18);
        vm.stopPrank();

        (uint256 gross, uint256 out,) = bourse.quoteSell(sid, 1);
        assertEq(gross, 5e18);
        uint256 toll = gross * 42 / 10_000;
        uint256 roy  = gross * 500 / 10_000;
        assertEq(out, gross - toll - roy);

        uint256 bobBefore = GREG.balanceOf(bob);
        uint256[] memory ids = new uint256[](1); ids[0] = 101;
        vm.prank(bob);
        bourse.sell(sid, ids, out);

        assertEq(punks.ownerOf(101), address(vault));       // swallowed into the covenant
        assertEq(GREG.balanceOf(bob) - bobBefore, out);
        assertEq(_quoteBalOf(sid), 50e18 - gross);
        assertEq(_spotOf(sid), 5e18);                       // FLAT never moves
    }

    // ─── DUAL: both sides recycle, the fee compounds ─────────────────
    function test_Dual_Recycles_FeeCompoundsAsLiquidity() public {
        vm.startPrank(alice);
        uint256 sid = bourse.openStall(daveId, address(punks), address(GREG), Curves.LINEAR, bourse.DUAL(), 10e18, 1e18, 200);
        uint256[] memory ids = new uint256[](1); ids[0] = 1;
        bourse.stock(sid, ids);
        bourse.fund(sid, 100e18);
        vm.stopPrank();

        (uint256 g1, uint256 paid,) = bourse.quoteBuy(sid, 1);
        assertEq(g1, 11e18);
        uint256 fee = g1 * 200 / 10_000;

        vm.prank(bob);
        bourse.buy(sid, ids, paid);
        assertEq(_quoteBalOf(sid), 100e18 + g1 + fee);      // proceeds + fee recycled

        (uint256 g2, uint256 out,) = bourse.quoteSell(sid, 1);
        assertEq(g2, 11e18);                                 // sells at current spot
        vm.prank(bob);
        bourse.sell(sid, ids, out);

        assertEq(punks.ownerOf(1), address(bourse));         // back on the shelf
        assertEq(bourse.shelfLength(sid), 1);
        assertEq(_spotOf(sid), 10e18);
        assertEq(_quoteBalOf(sid), 100e18 + 2 * fee);        // round trip left two fees behind
        assertLt(out, paid);                                 // trader never round-trips green
    }

    // ─── the bond ────────────────────────────────────────────────────
    function test_Bond_Ratchets_FreezesExits_AllowsAdditive() public {
        vm.startPrank(alice);
        uint256 sid = bourse.openStall(daveId, address(punks), address(GREG), Curves.LINEAR, bourse.DUAL(), 10e18, 1e18, 200);
        uint256[] memory ids = new uint256[](1); ids[0] = 1;
        bourse.stock(sid, ids);
        bourse.fund(sid, 10e18);

        bourse.bond(sid);
        (,,,,, uint64 bondUntil,,,,,) = bourse.stalls(sid);
        assertEq(bondUntil, vault.unlockAt());
        vm.expectRevert(Bourse.RatchetOnly.selector);
        bourse.bond(sid);                                    // same unlockAt: no re-bond

        vm.expectRevert(Bourse.BondHolds.selector);
        bourse.reprice(sid, 1e18, 1e18, 0);
        vm.expectRevert(Bourse.BondHolds.selector);
        bourse.pull(sid, ids);
        vm.expectRevert(Bourse.BondHolds.selector);
        bourse.drain(sid, 1e18);
        vm.expectRevert(Bourse.BondHolds.selector);
        bourse.close(sid);

        uint256[] memory more = new uint256[](1); more[0] = 2;
        bourse.stock(sid, more);                             // additive still open
        bourse.fund(sid, 5e18);
        vm.stopPrank();
    }

    function test_Bond_Expires_ExitsAreVaultWard() public {
        vm.startPrank(alice);
        uint256 sid = bourse.openStall(daveId, address(punks), address(GREG), Curves.LINEAR, bourse.DUAL(), 10e18, 1e18, 0);
        uint256[] memory ids = new uint256[](1); ids[0] = 1;
        bourse.stock(sid, ids);
        bourse.fund(sid, 10e18);
        bourse.bond(sid);
        vm.stopPrank();

        vm.warp(uint256(vault.unlockAt()) + 1);
        assertFalse(bourse.bondedNow(sid));

        uint256 vaultGREG = GREG.balanceOf(address(vault));
        vm.startPrank(alice);
        bourse.drain(sid, 4e18);
        bourse.pull(sid, ids);
        vm.stopPrank();

        assertEq(GREG.balanceOf(address(vault)) - vaultGREG, 4e18);   // never the wallet
        assertEq(punks.ownerOf(1), address(vault));                    // never the wallet
    }

    // ─── ragequit: the toll is paid, the bond stands ─────────────────
    function test_Ragequit_TollsBondedQuote_BondSurvives() public {
        vm.startPrank(alice);
        uint256 sid = bourse.openStall(daveId, address(punks), address(USDC), Curves.FLAT, bourse.BUY(), 1e18, 0, 0);
        bourse.fund(sid, 100e18);
        bourse.bond(sid);
        vm.stopPrank();

        uint256 tax = uint256(100e18) * 420 / 10_000;        // 4.20%
        vm.prank(alice);
        vault.ragequit();

        assertEq(_quoteBalOf(sid), 100e18 - tax);
        assertEq(USDC.balanceOf(address(pool)), tax * 69 / 100);
        assertEq(USDC.balanceOf(treasury), tax - tax * 69 / 100);
        assertEq(vault.paperHands(), 1);

        assertTrue(bourse.bondedNow(sid));                   // the floor keeps the promise
        vm.prank(alice);
        vm.expectRevert(Bourse.BondHolds.selector);
        bourse.drain(sid, 1e18);
    }

    // ─── ETH quote ───────────────────────────────────────────────────
    function test_ETHQuote_BuyRefundsExcess_SellPaysOut() public {
        vm.startPrank(alice);
        uint256 sid = bourse.openStall(daveId, address(punks), address(0), Curves.LINEAR, bourse.DUAL(), 1 ether, 0.1 ether, 0);
        uint256[] memory ids = new uint256[](1); ids[0] = 1;
        bourse.stock(sid, ids);
        vm.stopPrank();

        (, uint256 paid,) = bourse.quoteBuy(sid, 1);
        vm.deal(bob, 10 ether);
        vm.prank(bob);
        bourse.buy{value: paid + 1 ether}(sid, ids, paid);
        assertEq(bob.balance, 10 ether - paid);              // excess refunded
        assertEq(punks.ownerOf(1), bob);

        (, uint256 out,) = bourse.quoteSell(sid, 1);
        vm.prank(bob);
        bourse.sell(sid, ids, out);
        assertEq(bob.balance, 10 ether - paid + out);
        assertEq(punks.ownerOf(1), address(bourse));
    }

    // ─── royalty clamp ───────────────────────────────────────────────
    function test_Royalty_ClampedAtTenPercent() public {
        punks.setRoyalty(artist, 5_000);                     // demands 50%
        uint256 sid = _sellStall(1e18, 0.1e18);
        (uint256 gross, uint256 paid,) = bourse.quoteBuy(sid, 1);
        assertEq(paid, gross + gross * 42 / 10_000 + gross * 1_000 / 10_000);
        uint256[] memory ids = new uint256[](1); ids[0] = 1;
        vm.prank(bob);
        bourse.buy(sid, ids, paid);
        assertEq(GREG.balanceOf(artist), gross / 10);        // paid the clamp, not the demand
    }

    // ─── fuzz: the toll is the arb barrier ───────────────────────────
    function testFuzz_RoundTripNeverProfitable(uint128 spot, uint128 delta) public {
        spot  = uint128(bound(uint256(spot), 1e6, 1e30));
        delta = uint128(bound(uint256(delta), 0, 1e28));
        GREG.mint(bob, 1e33);

        vm.prank(alice);
        uint256 sid = bourse.openStall(daveId, address(punks), address(GREG), Curves.LINEAR, bourse.DUAL(), spot, delta, 100);
        uint256[] memory ids = new uint256[](1); ids[0] = 4;
        vm.prank(alice);
        bourse.stock(sid, ids);

        (, uint256 paid,) = bourse.quoteBuy(sid, 1);
        vm.prank(bob);
        bourse.buy(sid, ids, paid);
        (, uint256 out,) = bourse.quoteSell(sid, 1);
        vm.prank(bob);
        bourse.sell(sid, ids, out);

        assertLe(out, paid);
    }
}
