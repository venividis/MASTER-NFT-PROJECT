// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {DaveVault} from "../src/DaveVault.sol";
import {Surety} from "../src/Surety.sol";
import {Issue, FundShare} from "../src/Issue.sol";
import {MockERC20} from "../src/lib/MockERC20.sol";

contract SuretyTest is Base {
    Surety su;
    MockERC20 USDC;
    address ward = makeAddr("ward");
    address judge = makeAddr("judge");
    uint256 daveId;
    DaveVault vault;

    function setUp() public override {
        super.setUp();
        su = new Surety(address(hub));
        USDC = new MockERC20("USD Coin", "USDC");
        USDC.mint(alice, 1_000_000e18);
        USDC.mint(ward, 100_000e18);
        _openWindow();
        (daveId, vault) = _claim(alice, 1, 1_000e18);
    }

    function _pledge(address adj) internal returns (uint256 id) {
        vm.startPrank(alice);
        id = su.underwrite(daveId, ward, adj, address(USDC), uint64(block.timestamp + 90 days));
        USDC.approve(address(su), type(uint256).max);
        su.stake(id, 50_000e18);
        vm.stopPrank();
    }

    function test_slash_feeds_the_faithful() public {
        uint256 id = _pledge(judge);
        uint256 p0 = USDC.balanceOf(address(pool));
        uint256 t0 = USDC.balanceOf(treasury);
        vm.prank(bob);
        vm.expectRevert(Surety.NotAdjudicator.selector);
        su.slash(id, 1e18, "x");
        vm.prank(judge);
        su.slash(id, 10_000e18, keccak256("double-signed"));
        assertEq(USDC.balanceOf(address(pool)) - p0, 6_900e18);   // 69 to the room
        assertEq(USDC.balanceOf(treasury) - t0, 3_100e18);
        assertEq(su.coverage(id), 40_000e18);
        vm.prank(judge);
        vm.expectRevert(Surety.OverCoverage.selector);
        su.slash(id, 40_001e18, "y");
    }

    function test_attestation_is_unslashable() public {
        uint256 id = _pledge(address(0));
        vm.prank(judge);
        vm.expectRevert(Surety.Unslashable.selector);
        su.slash(id, 1e18, "z");
    }

    function test_stake_committed_through_term_then_home() public {
        uint256 id = _pledge(judge);
        vm.prank(alice);
        vm.expectRevert(Surety.Underwriting.selector);
        su.withdraw(id, 1e18);                                    // no early exit
        vm.prank(alice);
        vm.expectRevert(Surety.RatchetOnly.selector);
        su.extend(id, uint64(block.timestamp + 30 days));         // terms only lengthen

        vm.warp(block.timestamp + 90 days);
        vm.prank(alice);
        su.withdraw(id, 50_000e18);
        assertEq(USDC.balanceOf(address(vault)), 50_000e18);      // vault-ward only
    }

    function test_premium_lands_vaultward() public {
        uint256 id = _pledge(judge);
        uint256 toll = 1_000e18 * 42 / 10_000;
        vm.startPrank(ward);
        USDC.approve(address(su), type(uint256).max);
        su.premium(id, 1_000e18);
        vm.stopPrank();
        assertEq(USDC.balanceOf(address(vault)), 1_000e18 - toll); // born locked
    }

    function test_credential_reads_the_ledger() public {
        _pledge(judge);
        vm.warp(block.timestamp + 1 days);                        // let conviction breathe
        (uint32 temper,, uint256 conv,, uint256 staked) = su.credential(daveId);
        assertEq(temper, 0);
        assertGt(conv, 0);
        assertEq(staked, 50_000e18);
    }
}

contract IssueTest is Base {
    Issue iss;
    MockERC20 USDC; MockERC20 HOOD;
    address carol = makeAddr("carol");
    uint256 daveId;
    DaveVault vault;
    uint256 fid;
    FundShare share;

    function setUp() public override {
        super.setUp();
        iss = new Issue(address(hub));
        USDC = new MockERC20("USD Coin", "USDC");
        HOOD = new MockERC20("Robinhood Stock Token", "HOOD");
        USDC.mint(carol, 1_000_000e18); HOOD.mint(carol, 1_000_000e18);
        GREG.mint(carol, 1_000_000e18);
        _openWindow();
        (daveId, vault) = _claim(alice, 1, 1_000e18);

        address[] memory toks = new address[](3);
        toks[0] = address(GREG); toks[1] = address(USDC); toks[2] = address(HOOD);
        uint256[] memory amts = new uint256[](3);
        amts[0] = 100e18; amts[1] = 50e18; amts[2] = 1e18;        // per share
        vm.prank(alice);
        fid = iss.openFund(daveId, toks, amts, 100, 50);           // 1% / 0.5%
        (,,,, address sh) = iss.fund(fid);
        share = FundShare(sh);

        vm.startPrank(carol);
        GREG.approve(address(iss), type(uint256).max);
        USDC.approve(address(iss), type(uint256).max);
        HOOD.approve(address(iss), type(uint256).max);
        vm.stopPrank();
    }

    function test_creation_pulls_basket_carves_in_shares() public {
        vm.prank(carol);
        uint256 net = iss.create(fid, 100e18);
        // basket in, exactly
        assertEq(GREG.balanceOf(address(iss)), 10_000e18);
        assertEq(USDC.balanceOf(address(iss)), 5_000e18);
        assertEq(HOOD.balanceOf(address(iss)), 100e18);
        // shares carved: 1% fee to vault, 0.42% toll split, rest to creator
        uint256 fee = 1e18; uint256 toll = 0.42e18;
        assertEq(net, 100e18 - fee - toll);
        assertEq(share.balanceOf(carol), net);
        assertEq(share.balanceOf(address(vault)), fee);            // issuer's cut in-product
        assertEq(share.balanceOf(address(pool)), toll * 69 / 100);
        assertEq(share.totalSupply(), 100e18);                     // supply == baskets held
    }

    function test_redeem_returns_basket_supply_stays_honest() public {
        vm.startPrank(carol);
        uint256 net = iss.create(fid, 100e18);
        uint256 g0 = GREG.balanceOf(carol);
        uint256 out = iss.redeem(fid, net);
        vm.stopPrank();
        assertEq(GREG.balanceOf(carol) - g0, out * 100);           // per-share recipe, exact
        // invariant: shares outstanding == baskets remaining (per 1e18)
        assertEq(share.totalSupply(), 100e18 - out);
        assertEq(GREG.balanceOf(address(iss)), (100e18 - out) * 100);
    }

    function test_exit_is_eternal() public {
        vm.prank(carol);
        uint256 net = iss.create(fid, 10e18);
        vm.prank(alice);
        iss.setCreations(fid, true);                               // wind down issuance
        vm.prank(carol);
        vm.expectRevert(Issue.Halted.selector);
        iss.create(fid, 1e18);
        vm.prank(carol);
        iss.redeem(fid, net);                                      // the door never locks
    }

    function test_prospectus_is_carved() public {
        // no reweighting function exists; the recipe read back is the one published
        (address[] memory toks, uint256[] memory amts) = iss.recipe(fid);
        assertEq(toks.length, 3);
        assertEq(amts[0], 100e18);
        // and a mismatched prospectus never opens
        address[] memory t2 = new address[](2); t2[0] = address(GREG); t2[1] = address(USDC);
        uint256[] memory a2 = new uint256[](1); a2[0] = 1e18;
        vm.prank(alice);
        vm.expectRevert(Issue.Params.selector);
        iss.openFund(daveId, t2, a2, 0, 0);
    }

    function test_rounds_of_creation_keep_proportion() public {
        vm.startPrank(carol);
        iss.create(fid, 33e18);
        uint256 n2 = iss.create(fid, 67e18);
        iss.redeem(fid, n2 / 3);
        vm.stopPrank();
        // supply and basket stay locked in the carved ratio
        assertEq(GREG.balanceOf(address(iss)), share.totalSupply() * 100);
        assertEq(USDC.balanceOf(address(iss)), share.totalSupply() * 50);
    }
}
