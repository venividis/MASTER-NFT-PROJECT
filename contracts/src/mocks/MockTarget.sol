// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockTarget {
    uint256 public value;
    address public lastCaller;
    uint256 public received;

    event ValueSet(uint256 value, address caller, uint256 received);

    function setValue(uint256 value_) external payable returns (uint256 doubled) {
        value = value_;
        lastCaller = msg.sender;
        received += msg.value;
        emit ValueSet(value_, msg.sender, msg.value);
        return value_ * 2;
    }

    function revertAlways() external pure {
        revert("EXPECTED_REVERT");
    }
}
