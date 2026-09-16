// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Reference ERC-6551 registry (standard behaviour) bundled for LOCAL TESTS.
///      Mainnet deployments use the canonical singleton at
///      0x000000006551c19487814612e58FE06813775758.
contract ERC6551Registry {
    event ERC6551AccountCreated(
        address account, address indexed implementation, bytes32 salt,
        uint256 chainId, address indexed tokenContract, uint256 indexed tokenId
    );
    error AccountCreationFailed();

    function createAccount(
        address implementation, bytes32 salt, uint256 chainId,
        address tokenContract, uint256 tokenId
    ) external returns (address account_) {
        bytes memory code = _creationCode(implementation, salt, chainId, tokenContract, tokenId);
        account_ = _computed(keccak256(code), salt);
        if (account_.code.length != 0) return account_;
        assembly { account_ := create2(0, add(code, 0x20), mload(code), salt) }
        if (account_ == address(0)) revert AccountCreationFailed();
        emit ERC6551AccountCreated(account_, implementation, salt, chainId, tokenContract, tokenId);
    }

    function account(
        address implementation, bytes32 salt, uint256 chainId,
        address tokenContract, uint256 tokenId
    ) external view returns (address) {
        return _computed(
            keccak256(_creationCode(implementation, salt, chainId, tokenContract, tokenId)), salt
        );
    }

    function _creationCode(
        address implementation, bytes32 salt, uint256 chainId,
        address tokenContract, uint256 tokenId
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(
            hex"3d60ad80600a3d3981f3363d3d373d3d3d363d73",
            implementation,
            hex"5af43d82803e903d91602b57fd5bf3",
            abi.encode(salt, chainId, tokenContract, tokenId)
        );
    }

    function _computed(bytes32 codeHash, bytes32 salt) internal view returns (address) {
        return address(uint160(uint256(
            keccak256(abi.encodePacked(hex"ff", address(this), salt, codeHash))
        )));
    }
}
