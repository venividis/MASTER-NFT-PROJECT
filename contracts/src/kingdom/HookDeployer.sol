// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @notice Generic CREATE2 deployment utility. No upgrades or owner privileges.
contract HookDeployer {
    event Deployed(address indexed deployed,bytes32 indexed salt,bytes32 initCodeHash);
    function deploy(bytes32 salt,bytes calldata initCode) external returns(address deployed){
        bytes memory code=initCode;assembly("memory-safe"){deployed:=create2(0,add(code,32),mload(code),salt)}
        require(deployed!=address(0),"CREATE2_FAILED");emit Deployed(deployed,salt,keccak256(code));
    }
}
