// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./lib/Interfaces.sol";

interface IHubMini { function vaultOf(uint256 id) external view returns (address); }

/// @title ConvictionPool — every rail pays the sealed.
/// @notice ETH arriving here streams pro-rata to active conviction weight
///         (the seal multiplier while sealed). Claims pay INTO the vault —
///         rewards are born locked. ERC-20 tax arriving in-kind is custodied
///         for a v1.1 distributor (timelock-sweepable, documented).
contract ConvictionPool {
    address public immutable hub;
    address public immutable timelock;

    uint256 public accPerWeight;             // 1e18-scaled
    uint256 public totalWeight;
    uint256 public buffered;                 // ETH received while weight == 0
    mapping(uint256 => uint32)  public weightOf;
    mapping(uint256 => uint256) public debtOf;
    mapping(uint256 => uint256) public pendingOf;

    error NotHub(); error NotTimelock();

    event WeightSet(uint256 indexed id, uint32 w);
    event Claimed(uint256 indexed id, uint256 amount);

    constructor(address hub_, address timelock_) { hub = hub_; timelock = timelock_; }

    receive() external payable {
        if (totalWeight == 0) { buffered += msg.value; return; }
        accPerWeight += (msg.value + buffered) * 1e18 / totalWeight;
        buffered = 0;
    }

    function setWeight(uint256 id, uint32 w) external {
        if (msg.sender != hub) revert NotHub();
        uint32 old = weightOf[id];
        if (old > 0) {
            pendingOf[id] += uint256(old) * accPerWeight / 1e18 - debtOf[id];
            totalWeight -= old;
        }
        weightOf[id] = w;
        debtOf[id] = uint256(w) * accPerWeight / 1e18;
        totalWeight += w;
        emit WeightSet(id, w);
    }

    function claimable(uint256 id) public view returns (uint256) {
        return pendingOf[id] + uint256(weightOf[id]) * accPerWeight / 1e18 - debtOf[id];
    }

    /// @notice anyone may trigger; payment lands in the vault — inside the seal.
    function claim(uint256 id) external returns (uint256 amt) {
        amt = claimable(id);
        if (amt == 0) return 0;
        pendingOf[id] = 0;
        debtOf[id] = uint256(weightOf[id]) * accPerWeight / 1e18;
        address v = IHubMini(hub).vaultOf(id);
        (bool ok,) = v.call{value: amt}(""); require(ok, "pay");
        emit Claimed(id, amt);
    }

    /// @dev in-kind ERC-20 inventory → future distributor only, via timelock.
    function sweepERC20(address t, address distributor) external {
        if (msg.sender != timelock) revert NotTimelock();
        IERC20(t).transfer(distributor, IERC20(t).balanceOf(address(this)));
    }
}
