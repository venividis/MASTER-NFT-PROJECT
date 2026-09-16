// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Wallet-authenticated encryption public keys; never private keys.
contract PrivacyKeys {
    mapping(address => bytes) private _keys;
    mapping(address => uint64) public generation;
    event KeyRegistered(address indexed identity, uint64 generation, bytes publicKey);
    error InvalidKey();
    function register(bytes calldata publicKey) external {
        // SEC1 uncompressed P-256. Curve-point validation is performed by WebCrypto on import.
        if (publicKey.length != 65 || publicKey[0] != 0x04) revert InvalidKey();
        _keys[msg.sender] = publicKey;
        emit KeyRegistered(msg.sender, ++generation[msg.sender], publicKey);
    }
    function keyOf(address identity) external view returns (bytes memory) { return _keys[identity]; }
}

interface IPrivacyCollection {
    function ownerOf(uint256 id) external view returns (address);
    function accountOf(uint256 id) external view returns (address);
    function transferFrom(address from, address to, uint256 id) external;
}
interface IPrivacyAccount {
    function sessionEpoch() external view returns (uint64);
    function mode() external view returns (uint8);
    function stateRoot() external view returns (bytes32);
    function memoryRoot() external view returns (bytes32);
}
