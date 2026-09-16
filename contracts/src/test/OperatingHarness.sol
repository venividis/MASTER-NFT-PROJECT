// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @dev Test-only, permissionless mint/burn token. NEVER a deployment dependency.
contract OperatingTokenMock {
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    constructor(uint8 decimals_){decimals=decimals_;}
    function mint(address to,uint256 amount) external{balanceOf[to]+=amount;totalSupply+=amount;}
    function burn(address from,uint256 amount) external{balanceOf[from]-=amount;totalSupply-=amount;}
    function approve(address spender,uint256 amount) external returns(bool){allowance[msg.sender][spender]=amount;return true;}
    function transfer(address to,uint256 amount) external returns(bool){balanceOf[msg.sender]-=amount;balanceOf[to]+=amount;return true;}
    function transferFrom(address from,address to,uint256 amount) external returns(bool){allowance[from][msg.sender]-=amount;balanceOf[from]-=amount;balanceOf[to]+=amount;return true;}
}
/// @dev Test-only account, not a token-bound-account conformance claim.
contract OperatingAccountMock {
    address public currentOwner;
    uint64 public sessionEpoch=1;
    uint8 public mode;
    uint256 public instrumentRevision;
    constructor(address holder){currentOwner=holder;}
    receive() external payable{}
    function transferControl(address next) external{require(msg.sender==currentOwner,'OWNER');currentOwner=next;++sessionEpoch;}
    function run(address target,bytes calldata data) external payable returns(bytes memory){require(msg.sender==currentOwner,'OWNER');(bool ok,bytes memory result)=target.call{value:msg.value}(data);if(!ok){assembly('memory-safe'){revert(add(result,32),mload(result))}}return result;}
}
