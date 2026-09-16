// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev An ERC-6551 account's one relevant accessor, with the answer set by
///      the test. It is deliberately possible to construct one that lies:
///      any contract can say it belongs to token 7, and the resolver's job
///      is to disbelieve it unless the registry derives that same address.
contract MockAccount {
    uint256 public chainId;
    address public coll;
    uint256 public id;

    constructor(uint256 c, address k, uint256 i) { chainId = c; coll = k; id = i; }

    function token() external view returns (uint256, address, uint256) {
        return (chainId, coll, id);
    }
}

/// @dev The one function of a NameWrapper the resolver reads: who really
///      owns a node the registry has handed to the wrapper.
contract MockWrapper {
    mapping(uint256 => address) public ownerOf;
    function setOwner(uint256 node, address to) external { ownerOf[node] = to; }
}
