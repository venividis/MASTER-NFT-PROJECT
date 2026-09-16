// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Timelock} from "../src/lib/Timelock.sol";

/*───────────────────────────────────────────────────────────────────────────
  A delay is only worth the attacks it survives.
───────────────────────────────────────────────────────────────────────────*/
contract Target {
    uint256 public value;
    function set(uint256 v) external { value = v; }
}

contract TimelockTest is Test {
    Timelock lock;
    Target   target;
    address  admin = address(0xA11);
    address  bob   = address(0xB0B);

    function setUp() public {
        lock = new Timelock(admin);
        target = new Target();
        vm.warp(1_000_000);
    }

    function _data(uint256 v) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(Target.set.selector, v);
    }

    function test_delayIsEnforced() public {
        bytes memory d = _data(42);
        vm.startPrank(admin);
        lock.queue(address(target), 0, d, bytes32(0));

        vm.expectRevert(Timelock.TooEarly.selector);
        lock.execute(address(target), 0, d, bytes32(0));

        vm.warp(block.timestamp + 7 days);
        lock.execute(address(target), 0, d, bytes32(0));
        vm.stopPrank();

        assertEq(target.value(), 42);
    }

    function test_unqueuedNeverExecutes() public {
        vm.prank(admin);
        vm.expectRevert(Timelock.NotQueued.selector);
        lock.execute(address(target), 0, _data(1), bytes32(0));
    }

    function test_executedNeverReplays() public {
        bytes memory d = _data(7);
        vm.startPrank(admin);
        lock.queue(address(target), 0, d, bytes32(0));
        vm.warp(block.timestamp + 7 days);
        lock.execute(address(target), 0, d, bytes32(0));

        vm.expectRevert(Timelock.NotQueued.selector);
        lock.execute(address(target), 0, d, bytes32(0));
        vm.stopPrank();
    }

    /// @dev An eta that can be moved after publication is not a warning.
    function test_etaCannotBeMovedOncePublished() public {
        bytes memory d = _data(1);
        vm.startPrank(admin);
        lock.queue(address(target), 0, d, bytes32(0));
        vm.warp(block.timestamp + 6 days);
        vm.expectRevert(Timelock.AlreadyQueued.selector);
        lock.queue(address(target), 0, d, bytes32(0));
        vm.stopPrank();
    }

    /// @dev An operation queued and forgotten is a live weapon for whoever
    ///      eventually takes the key.
    function test_forgottenOperationsExpire() public {
        bytes memory d = _data(9);
        vm.startPrank(admin);
        lock.queue(address(target), 0, d, bytes32(0));
        vm.warp(block.timestamp + 7 days + 14 days + 1);
        vm.expectRevert(Timelock.Expired.selector);
        lock.execute(address(target), 0, d, bytes32(0));
        vm.stopPrank();
        assertEq(target.value(), 0);
    }

    function test_onlyAdmin() public {
        bytes memory d = _data(1);
        vm.startPrank(bob);
        vm.expectRevert(Timelock.NotAdmin.selector);
        lock.queue(address(target), 0, d, bytes32(0));
        vm.expectRevert(Timelock.NotAdmin.selector);
        lock.cancel(bytes32(0));
        vm.stopPrank();
    }

    /// @dev An admin that can rotate out of the delay is not behind one.
    function test_adminRotationGoesThroughTheQueue() public {
        vm.prank(admin);
        vm.expectRevert(Timelock.NotSelf.selector);
        lock.setAdmin(bob);

        bytes memory d = abi.encodeWithSelector(Timelock.setAdmin.selector, bob);
        vm.startPrank(admin);
        lock.queue(address(lock), 0, d, bytes32(0));
        vm.warp(block.timestamp + 7 days);
        lock.execute(address(lock), 0, d, bytes32(0));
        vm.stopPrank();

        assertEq(lock.admin(), bob);

        vm.prank(admin);
        vm.expectRevert(Timelock.NotAdmin.selector);
        lock.queue(address(target), 0, _data(1), bytes32("x"));
    }

    function test_cancel() public {
        bytes memory d = _data(3);
        vm.startPrank(admin);
        bytes32 op = lock.queue(address(target), 0, d, bytes32(0));
        lock.cancel(op);
        assertEq(lock.eta(op), 0);
        vm.warp(block.timestamp + 7 days);
        vm.expectRevert(Timelock.NotQueued.selector);
        lock.execute(address(target), 0, d, bytes32(0));
        vm.stopPrank();
    }

    function testFuzz_neverExecutesEarly(uint256 wait) public {
        wait = bound(wait, 0, 7 days - 1);
        bytes memory d = _data(5);
        vm.startPrank(admin);
        lock.queue(address(target), 0, d, bytes32(0));
        vm.warp(block.timestamp + wait);
        vm.expectRevert(Timelock.TooEarly.selector);
        lock.execute(address(target), 0, d, bytes32(0));
        vm.stopPrank();
    }
}
