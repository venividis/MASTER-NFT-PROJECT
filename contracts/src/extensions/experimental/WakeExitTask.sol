// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IWakeTask} from './Wake.sol';
interface IWakeExitVault {
    function eligible(uint256 plan,uint256 slice) external view returns(bool);
    function executeSlice(uint256 plan,uint256 slice) external returns(uint256);
}
interface IWakeTaskBinding {function taskTarget() external view returns(address);}
/// @notice Concrete Wake job adapter for the existing vested-exit vault.
/// @dev Exclusivity covers this adapter. An underlying permissionless vault remains callable
/// directly; this seat cannot suppress those routes and makes no MEV-exclusivity promise.
contract WakeExitTask is IWakeTask {
    IWakeExitVault public immutable vault;bytes32 public immutable vaultCodeHash;
    address public immutable installer;address public wake;
    event Bound(address indexed wake);
    constructor(address vault_){require(vault_.code.length!=0,'VAULT');vault=IWakeExitVault(vault_);vaultCodeHash=vault_.codehash;installer=msg.sender;}
    function bind(address wake_) external {require(msg.sender==installer&&wake==address(0)&&wake_.code.length!=0&&IWakeTaskBinding(wake_).taskTarget()==address(this),'BIND');wake=wake_;emit Bound(wake_);}
    function perform(bytes32 task,address keeper,bytes calldata data) external returns(bytes32 receipt){
        require(msg.sender==wake&&wake!=address(0)&&address(vault).codehash==vaultCodeHash&&data.length==64,'CALLER');
        (uint256 plan,uint256 slice)=abi.decode(data,(uint256,uint256));require(task==keccak256(abi.encode(plan,slice))&&vault.eligible(plan,slice),'TASK');
        uint256 received=vault.executeSlice(plan,slice);receipt=keccak256(abi.encode(address(vault),plan,slice,received,keeper));
    }
}
