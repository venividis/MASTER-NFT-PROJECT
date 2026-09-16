// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
/// @notice Permissionless deterministic deployment; salt binds the caller to prevent constructor hijacking.
contract OfficialCreate2 {
    event Deployed(address indexed caller, bytes32 indexed salt, address deployed);
    function deploy(bytes32 salt, bytes calldata initCode) external returns (address deployed) {
        bytes32 bound = keccak256(abi.encode(msg.sender, salt));
        bytes memory code = initCode;
        assembly { deployed := create2(0, add(code, 32), mload(code), bound) }
        require(deployed != address(0), "Deployment failed");
        emit Deployed(msg.sender, salt, deployed);
    }
}
