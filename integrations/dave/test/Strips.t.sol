// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {DaveVault} from "../src/DaveVault.sol";
import {DaveHeld} from "../src/DaveHeld.sol";
import {Granary} from "../src/Granary.sol";
import {Strips, PrincipalToken, YieldToken} from "../src/Strips.sol";
import {MockERC20} from "../src/lib/MockERC20.sol";
import {MockERC4626} from "../src/lib/MockERC4626.sol";

contract StripsTest is Base {
    Granary gr;
    Strips st;
    MockERC20 USDC;
    MockERC4626 silo;
    address carol = makeAddr("carol");
    uint256 daveId;
    DaveVault vault;
    uint256 sid;
    PrincipalToken pt; YieldToken yt;

    function setUp() public override {
        super.setUp();
        gr = new Granary(address(hub));
        st = new Strips(address(hub), address(gr));
        USDC = new MockERC20("USD Coin", "USDC");
        silo = new MockERC4626(address(USDC));
        USDC.mint(alice, 1_000_000e18);
        USDC.mint(bob, 1_000_000e18);
        _openWindow();
        (daveId, vault) = _claim(alice, 1, 1_000e18);
        _tlDo(address(gr), abi.encodeCall(Granary.bless, (address(silo), true)));

        vm.prank(alice);
        sid = st.openSeries(daveId, address(silo), uint64(block.timestamp + 60 days));
        (address p_, address y_) = st.tokensOf(sid);
        pt = PrincipalToken(p_); yt = YieldToken(y_);

        // bob holds silo shares to bring to the shears (1:1 at genesis)
        vm.startPrank(bob);
        USDC.approve(address(silo), type(uint256).max);
        silo.deposit(100_000e18, bob);
        MockERC20(address(silo)).approve(address(st), type(uint256).max);
        vm.stopPrank();
    }

    function test_open_needs_blessing_and_bearer() public {
        MockERC4626 rot = new MockERC4626(address(USDC));
        vm.prank(alice);
        vm.expectRevert(Strips.NotBlessed.selector);
        st.openSeries(daveId, address(rot), uint64(block.timestamp + 1 days));
        vm.prank(bob);
        vm.expectRevert(Strips.NotBearer.selector);
        st.openSeries(daveId, address(silo), uint64(block.timestamp + 1 days));
    }

    function test_shears_mint_two_papers_net_of_toll() public {
        uint256 p0 = MockERC20(address(silo)).balanceOf(address(pool));
        vm.prank(bob);
        uint256 minted = st.strip(sid, 10_000e18);
        uint256 toll = 10_000e18 * 42 / 10_000;
        assertEq(minted, 10_000e18 - toll);                    // 1:1 rate at genesis
        assertEq(pt.balanceOf(bob), minted);
        assertEq(yt.balanceOf(bob), minted);
        assertEq(MockERC20(address(silo)).balanceOf(address(pool)) - p0, toll * 69 / 100);
    }

    function test_yield_flows_to_yt_principal_stays_fixed() public {
        vm.prank(bob);
        uint256 minted = st.strip(sid, 10_000e18);
        USDC.mint(address(silo), 10_000e18);                   // the field grows ~10%

        uint256 y = st.yieldOf(sid, bob);
        assertGt(y, 900e18);                                   // ~996 on held shares
        uint256 u0 = USDC.balanceOf(bob);
        vm.prank(bob);
        uint256 got = st.claimYield(sid);
        assertEq(got, y);
        assertApproxEqAbs(USDC.balanceOf(bob) - u0, got, 1e12); // paid in the asset (dust-floor)

        vm.warp(block.timestamp + 60 days);
        vm.prank(bob);
        uint256 face = st.redeemPrincipal(sid, minted);
        assertApproxEqAbs(face, minted, 1e12);                 // one asset per PT, to the dust
    }

    function test_yt_transfer_carries_future_not_past() public {
        vm.prank(bob);
        st.strip(sid, 10_000e18);
        USDC.mint(address(silo), 5_000e18);                    // yield era 1 — bob's

        vm.prank(bob);
        yt.transfer(carol, yt.balanceOf(bob));                 // hook banks bob first
        USDC.mint(address(silo), 5_000e18);                    // yield era 2 — carol's

        uint256 yb = st.yieldOf(sid, bob);
        uint256 yc = st.yieldOf(sid, carol);
        assertGt(yb, 0); assertGt(yc, 0);
        // eras split cleanly: each within 2% of its own half
        assertApproxEqRel(yb, yc, 0.02e18);
        vm.prank(carol);
        st.claimYield(sid);
        vm.prank(bob);
        st.claimYield(sid);
    }

    function test_unstrip_recombines() public {
        vm.prank(bob);
        uint256 minted = st.strip(sid, 10_000e18);
        uint256 s0 = MockERC20(address(silo)).balanceOf(bob);
        vm.prank(bob);
        uint256 back = st.unstrip(sid, minted);
        assertEq(MockERC20(address(silo)).balanceOf(bob) - s0, back);
        assertEq(pt.balanceOf(bob), 0);
        assertEq(yt.balanceOf(bob), 0);
    }

    function test_settlement_freezes_the_index() public {
        vm.prank(bob);
        st.strip(sid, 10_000e18);
        vm.warp(block.timestamp + 60 days);
        st.settle(sid);
        uint256 y0 = st.yieldOf(sid, bob);
        USDC.mint(address(silo), 50_000e18);                   // post-stroke windfall
        assertEq(st.yieldOf(sid, bob), y0);                    // the paper expired earning
    }

    function test_impaired_silo_haircuts_prorata_honestly() public {
        vm.prank(bob);
        uint256 minted = st.strip(sid, 10_000e18);
        // the silo is looted: half the assets vanish
        vm.prank(address(silo));
        USDC.transfer(address(0xdead), silo.totalAssets() / 2);
        vm.warp(block.timestamp + 60 days);
        vm.prank(bob);
        uint256 got = st.redeemPrincipal(sid, minted);
        assertLt(got, minted);                                 // the honest haircut
        assertGt(got, minted * 45 / 100);                      // ~half, pro-rata
    }
}
