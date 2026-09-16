// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// An ERC-721 that answers every call and moves nothing. Berth never checks.
contract Liar {
    function transferFrom(address, address, uint256) external {}
    function ownerOf(uint256) external view returns (address) { return msg.sender; }
    function supportsInterface(bytes4) external pure returns (bool) { return true; }
}
