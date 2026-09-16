// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockReceiver {
    function onERC721Received(address, address, uint256, bytes calldata)
        external pure returns (bytes4)
    {
        return this.onERC721Received.selector;
    }
}
