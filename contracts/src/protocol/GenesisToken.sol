// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice One-time fixed supply. No owner, mint, blacklist, tax, upgrade, or confiscation entrypoint.
contract GenesisToken {
    string public name;string public symbol;uint8 public constant decimals=18;
    uint256 public immutable totalSupply;
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    event Transfer(address indexed from,address indexed to,uint256 amount);
    event Approval(address indexed owner,address indexed spender,uint256 amount);
    error InvalidTransfer();error InsufficientAllowance();
    constructor(string memory name_,string memory symbol_,uint256 supply,address recipient){
        require(bytes(name_).length>0 && bytes(name_).length<=48 && bytes(symbol_).length>0 && bytes(symbol_).length<=10 && recipient!=address(0) && supply>0,"TOKEN_CONFIG");
        name=name_;symbol=symbol_;totalSupply=supply;balanceOf[recipient]=supply;emit Transfer(address(0),recipient,supply);
    }
    function approve(address spender,uint256 amount) external returns(bool){allowance[msg.sender][spender]=amount;emit Approval(msg.sender,spender,amount);return true;}
    function transfer(address to,uint256 amount) external returns(bool){_transfer(msg.sender,to,amount);return true;}
    function transferFrom(address from,address to,uint256 amount) external returns(bool){uint256 available=allowance[from][msg.sender];if(available<amount) revert InsufficientAllowance();if(available!=type(uint256).max){allowance[from][msg.sender]=available-amount;emit Approval(from,msg.sender,available-amount);}_transfer(from,to,amount);return true;}
    function _transfer(address from,address to,uint256 amount) private {if(to==address(0)||balanceOf[from]<amount) revert InvalidTransfer();balanceOf[from]-=amount;balanceOf[to]+=amount;emit Transfer(from,to,amount);}
}
