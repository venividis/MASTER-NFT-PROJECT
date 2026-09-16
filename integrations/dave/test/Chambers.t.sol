// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {DaveVault} from "../src/DaveVault.sol";
import {DaveHeld} from "../src/DaveHeld.sol";
import {Chambers} from "../src/Chambers.sol";
import {Charter} from "../src/Charter.sol";
import {MockERC20} from "../src/lib/MockERC20.sol";

/// @dev a bearer-built module: forwards acts into the Chambers.
contract StrategyModule {
    Chambers immutable ch;
    constructor(Chambers c) { ch = c; }
    function go(
        uint256 daveId, address target, uint256 value,
        bytes calldata data, address spend, uint256 maxSpend
    ) external returns (bytes memory) {
        return ch.act(daveId, target, value, data, spend, maxSpend);
    }
}

contract Pinger { uint256 public pings; function ping() external { ++pings; } }

contract ChambersTest is Base {
    Charter ch;
    MockERC20 USDC;
    StrategyModule mod;
    uint256 daveId;
    DaveVault vault;
    address eoa = makeAddr("outside");

    function setUp() public override {
        super.setUp();
        ch = new Charter(address(hub));
        USDC = new MockERC20("USD Coin", "USDC");
        USDC.mint(alice, 1_000_000e18);
        _openWindow();
        (daveId, vault) = _claim(alice, 1, 1_000e18);        // sealed 180d
        GREG.mint(alice, 1_000_000e18);
        mod = new StrategyModule(chambers);

        // vault takes a USDC bag (ratchet in, sealed is fine)
        vm.startPrank(alice);
        USDC.approve(address(vault), 10_000e18);
        vault.deposit(address(USDC), 10_000e18);
        vm.stopPrank();
    }

    function _dock() internal {
        vm.startPrank(alice);
        chambers.propose(daveId, address(mod));
        vm.warp(block.timestamp + 7 days);
        chambers.dock(daveId, address(mod));
        vm.stopPrank();
    }

    function _charterFunded() internal returns (uint256 pid) {
        vm.startPrank(alice);
        pid = ch.charterPool(daveId, address(GREG), address(USDC), 0, address(0));
        GREG.approve(address(ch), type(uint256).max);
        USDC.approve(address(ch), type(uint256).max);
        ch.addLiquidity(pid, 1_000e18, 1_000e18);
        vm.stopPrank();
        _tlDo(address(hub), abi.encodeCall(DaveHeld.setTarget, (address(ch), true)));
    }

    function test_cure_is_seven_days() public {
        vm.prank(bob);
        vm.expectRevert(Chambers.NotBearer.selector);
        chambers.propose(daveId, address(mod));

        vm.startPrank(alice);
        chambers.propose(daveId, address(mod));
        vm.expectRevert(Chambers.StillCuring.selector);
        chambers.dock(daveId, address(mod));
        vm.warp(block.timestamp + 7 days);
        chambers.dock(daveId, address(mod));
        vm.stopPrank();
        assertTrue(chambers.docked(daveId, address(mod)));
    }

    function test_cancel_kills_pending() public {
        vm.startPrank(alice);
        chambers.propose(daveId, address(mod));
        chambers.cancel(daveId, address(mod));
        vm.warp(block.timestamp + 7 days);
        vm.expectRevert(Chambers.NotProposed.selector);
        chambers.dock(daveId, address(mod));
        vm.stopPrank();
    }

    function test_act_needs_docking() public {
        vm.expectRevert(Chambers.NotDocked.selector);
        mod.go(daveId, eoa, 0, "", address(0), 0);
    }

    function test_unsealed_full_arm() public {
        _dock();
        vm.deal(address(vault), 5 ether);
        vm.warp(vault.unlockAt() + 1);                        // covenant served
        mod.go(daveId, eoa, 1 ether, "", address(0), 0);
        assertEq(eoa.balance, 1 ether);                       // full arm, no wall
    }

    function test_sealed_blocks_exits() public {
        _dock();
        vm.deal(address(vault), 5 ether);
        vm.expectRevert(Chambers.NotVenue.selector);
        mod.go(daveId, eoa, 1 ether, "", address(0), 1 ether);
        // transfer-family words are refused outright, on any target
        bytes memory drain = abi.encodeWithSelector(0xa9059cbb, eoa, 1e18);
        vm.expectRevert(Chambers.ExitWord.selector);
        mod.go(daveId, address(USDC), 0, drain, address(USDC), 1e18);
        // even transferFrom pulling INTO the vault is refused — no exit words at all
        bytes memory pullIn = abi.encodeWithSelector(0x23b872dd, eoa, address(vault), 1e18);
        vm.expectRevert(Chambers.ExitWord.selector);
        mod.go(daveId, address(USDC), 0, pullIn, address(0), 0);
    }

    function test_sealed_approve_only_toward_venues() public {
        _dock();
        bytes memory badApprove = abi.encodeWithSelector(0x095ea7b3, eoa, 1e18);
        vm.expectRevert(Chambers.BadApprove.selector);
        mod.go(daveId, address(USDC), 0, badApprove, address(0), 0);
    }

    function test_sealed_trades_inside_the_covenant() public {
        uint256 pid = _charterFunded();
        _dock();
        uint256 amtIn = 100e18;

        // act 1: allowance toward the venue (lawful approve)
        mod.go(
            daveId, address(USDC), 0,
            abi.encodeWithSelector(0x095ea7b3, address(ch), amtIn),
            address(0), 0
        );
        // act 2: the swap — USDC declared spend, GREG must arrive
        uint256 g0 = GREG.balanceOf(address(vault));
        uint256 u0 = USDC.balanceOf(address(vault));
        mod.go(
            daveId, address(ch), 0,
            abi.encodeCall(Charter.swap, (pid, false, amtIn, 0, 0)),
            address(USDC), amtIn
        );
        assertEq(u0 - USDC.balanceOf(address(vault)), amtIn); // spent exactly
        assertGt(GREG.balanceOf(address(vault)), g0);         // grew inside the wall
        assertTrue(vault.sealed_());                          // seal untouched
    }

    function test_sealed_overspend_reverts() public {
        uint256 pid = _charterFunded();
        _dock();
        uint256 amtIn = 100e18;
        mod.go(
            daveId, address(USDC), 0,
            abi.encodeWithSelector(0x095ea7b3, address(ch), amtIn),
            address(0), 0
        );
        vm.expectRevert(Chambers.BoundaryBreached.selector);
        mod.go(
            daveId, address(ch), 0,
            abi.encodeCall(Charter.swap, (pid, false, amtIn, 0, 0)),
            address(USDC), amtIn - 1                          // lied about the spend
        );
    }

    function test_sealed_accretive_calls_pass() public {
        _dock();
        Pinger pinger = new Pinger();
        mod.go(daveId, address(pinger), 0, abi.encodeCall(Pinger.ping, ()), address(0), 0);
        assertEq(pinger.pings(), 1);                          // harmless words flow free
    }

    function test_organs_transfer_then_purge() public {
        _dock();
        vm.prank(alice);
        hub.transferFrom(alice, bob, daveId);
        assertTrue(chambers.docked(daveId, address(mod)));    // organs move with the body

        vm.prank(alice);
        vm.expectRevert(Chambers.NotBearer.selector);         // old bearer is nobody now
        chambers.undock(daveId, address(mod));

        vm.prank(bob);
        chambers.purge(daveId);
        assertEq(chambers.modulesOf(daveId).length, 0);
        vm.expectRevert(Chambers.NotDocked.selector);
        mod.go(daveId, eoa, 0, "", address(0), 0);
    }
}
