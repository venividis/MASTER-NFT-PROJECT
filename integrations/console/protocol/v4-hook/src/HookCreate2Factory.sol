// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Deploys a supplied creation payload at its CREATE2 address.
contract HookCreate2Factory {
    error DeploymentFailed();
    event Deployed(address indexed deployed, bytes32 indexed salt, bytes32 initCodeHash);

    function deploy(bytes32 salt, bytes calldata initCode) external returns (address deployed) {
        bytes memory code = initCode;
        assembly ("memory-safe") {
            deployed := create2(0, add(code, 32), mload(code), salt)
        }
        if (deployed == address(0)) revert DeploymentFailed();
        emit Deployed(deployed, salt, keccak256(initCode));
    }
}
