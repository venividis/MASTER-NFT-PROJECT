// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Adversarial runtime fixtures only; never a substitute for the native NFT in integration tests.
contract CartridgeRawCode {
    constructor(bytes memory runtime) {
        assembly ("memory-safe") { return(add(runtime, 32), mload(runtime)) }
    }
}

contract CartridgeTestCollection {
    mapping(address => uint256) public artifactIdOfAccount;
    mapping(uint256 => address) public accountOf;
    mapping(uint256 => address) public ownerOf;
    function bind(uint256 id, address account, address owner) external {
        artifactIdOfAccount[account] = id;
        accountOf[id] = account;
        ownerOf[id] = owner;
    }
}
