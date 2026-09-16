// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Timelock} from "../src/lib/Timelock.sol";
import {ERC6551Registry} from "../src/vendor/ERC6551Registry.sol";
import {DaveVault} from "../src/DaveVault.sol";
import {DaveHeld} from "../src/DaveHeld.sol";
import {ConvictionPool} from "../src/ConvictionPool.sol";
import {Patronage} from "../src/Patronage.sol";
import {IconRegistry} from "../src/IconRegistry.sol";
import {SiteKernel} from "../src/SiteKernel.sol";
import {BagRenderer} from "../src/BagRenderer.sol";
import {MockERC20} from "../src/lib/MockERC20.sol";
import {Chambers} from "../src/Chambers.sol";

/// @dev Shared world: timelock(admin=this), local 6551 registry, full wiring.
///      Timelock-only ops are exercised the honest way: queue → warp 7d → execute.
contract Base is Test {
    Timelock tl;
    ERC6551Registry reg;
    DaveVault impl;
    DaveHeld hub;
    ConvictionPool pool;
    Patronage pat;
    IconRegistry icons;
    SiteKernel kernel;
    BagRenderer renderer;
    Chambers chambers;
    MockERC20 GREG;

    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address bob   = makeAddr("bob");

    function setUp() public virtual {
        vm.warp(1_750_000_000);                       // sane clock
        tl = new Timelock(address(this));
        reg = new ERC6551Registry();
        impl = new DaveVault();
        hub = new DaveHeld(address(reg), address(impl), address(tl), treasury);
        pool = new ConvictionPool(address(hub), address(tl));
        pat = new Patronage(address(hub));
        icons = new IconRegistry(address(tl), treasury);
        kernel = new SiteKernel(address(tl));
        renderer = new BagRenderer(address(hub), address(icons), address(kernel));
        hub.wire(address(pool), address(renderer));   // deployer one-shot
        chambers = new Chambers(address(hub));
        hub.dockChambers(address(chambers));          // deployer one-shot, ever
        GREG = new MockERC20("EGREGORE", "GREG");
        GREG.mint(alice, 10_000_000e18);
        GREG.mint(bob,   10_000_000e18);
        _tlDo(address(hub), abi.encodeCall(DaveHeld.addHook, (address(pat))));
    }

    /// @dev honest timelock round-trip for admin calls.
    function _tlDo(address target, bytes memory data) internal {
        bytes32 salt = keccak256(data);
        tl.queue(target, 0, data, salt);
        vm.warp(block.timestamp + tl.DELAY());
        tl.execute(target, 0, data, salt);
    }

    function _openWindow() internal {
        uint64 s = uint64(block.timestamp + tl.DELAY());   // opens post-execute
        _tlDo(address(hub), abi.encodeCall(
            DaveHeld.openWindow,
            (s, s + 72 hours, bytes32(0), bytes32(0), bytes32(0))
        ));
    }

    /// @dev open-tranche genesis claim helper.
    function _claim(address who, uint8 tier, uint256 amt) internal returns (uint256 id, DaveVault v) {
        vm.startPrank(who);
        GREG.approve(address(hub), amt);
        bytes32[] memory empty;
        id = hub.claimGenesis(0, 0, empty, tier, address(GREG), amt);
        vm.stopPrank();
        v = DaveVault(payable(hub.vaultOf(id)));
    }
}
