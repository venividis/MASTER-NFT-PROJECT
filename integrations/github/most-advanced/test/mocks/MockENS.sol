// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev The one function of the ENS registry the Nameplate reads, with a
///      setter so a test can hand any node to any owner.
contract MockENS {
    mapping(bytes32 => address) public owner;

    function setOwner(bytes32 node, address to) external {
        owner[node] = to;
    }
}
