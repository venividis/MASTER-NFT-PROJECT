// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @notice Test-network-only opening gate. Disabling entry never disables a module's exits.
/// @dev This is a readiness switch, not legal eligibility, a security audit, or a production launch.
contract ExperimentGate {
    address public immutable guardian;
    mapping(address=>bool) public enabled;
    event ExperimentChanged(address indexed module,bool enabled);
    error Locked();
    constructor(address guardian_){if(guardian_==address(0))revert Locked();guardian=guardian_;}
    function set(address module,bool value) external{if(msg.sender!=guardian||module.code.length==0)revert Locked();if(value&&block.chainid!=31337&&block.chainid!=84532&&block.chainid!=11155111)revert Locked();enabled[module]=value;emit ExperimentChanged(module,value);}
}
