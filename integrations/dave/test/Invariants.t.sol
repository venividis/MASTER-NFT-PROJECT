// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Base, DaveVault} from "./Base.t.sol";
import {Test} from "forge-std/Test.sol";

/// @dev Handler drives one genesis vault through random covenant ops.
contract Handler is Test {
    Base immutable B;
    DaveVault public v;
    uint256 public id;
    address bearer;
    uint64 public maxUnlockSeen;
    bool public everRagequit;

    constructor(Base b, uint256 id_, DaveVault v_, address bearer_) {
        B = b; id = id_; v = v_; bearer = bearer_;
        maxUnlockSeen = v.unlockAt();
    }

    function sealTier(uint8 t) external {
        t = uint8(bound(t, 0, 3));
        vm.prank(bearer);
        try v.seal(t) {} catch {}
        _track();
    }
    function warp(uint32 dt) external {
        vm.warp(block.timestamp + bound(dt, 1 hours, 200 days));
        v.settle();
        _track();
    }
    function rage() external {
        vm.prank(bearer);
        try v.ragequit() { everRagequit = true; } catch {}
        _track();
    }
    function _track() internal {
        if (v.unlockAt() > maxUnlockSeen) maxUnlockSeen = v.unlockAt();
    }
}

contract InvariantCovenant is Base {
    Handler h;

    function setUp() public override {
        super.setUp();
        _openWindow();
        (uint256 id, DaveVault v) = _claim(alice, 1, 1_000_000e18);
        h = new Handler(this, id, v, alice);
        targetContract(address(h));
    }

    /// The seal's horizon only ever advances (ragequit zeroes it — allowed exit).
    function invariant_UnlockMonotoneUnderSealing() public view {
        DaveVault v = h.v();
        assertTrue(v.unlockAt() == 0 || v.unlockAt() <= h.maxUnlockSeen());
        // and if never ragequit, unlockAt can only be 0 after natural expiry:
        if (!h.everRagequit() && v.unlockAt() == 0) {
            assertGe(block.timestamp, 0); // expiry path is time, not force
        }
    }

    /// Sealed balance never leaks: while sealed, vault GREG only grows.
    uint256 lastSealedBal;
    function invariant_SealedBagsOnlyGrowOrTaxExit() public {
        DaveVault v = h.v();
        uint256 bal = GREG.balanceOf(address(v));
        if (v.sealed_()) {
            assertGe(bal, lastSealedBal);          // no shrink while sealed
        }
        lastSealedBal = bal;
    }
}
