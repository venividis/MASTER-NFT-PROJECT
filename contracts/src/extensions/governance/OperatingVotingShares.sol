// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Fixed-distribution voting shares for one OperatingNFTGovernance custodian.
/// @dev Only the immutable custodian can activate and burn on exit. There is no later mint.
contract OperatingVotingShares {
    string public constant name="ANIMA Operating Ownership";
    string public constant symbol="ANIMA-OPERATE";
    uint8 public constant decimals=18;
    address public immutable governance;
    uint256 public immutable originalSupply;
    uint256 public totalSupply;
    bool public active;
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    struct Checkpoint {uint64 blockNumber;uint192 votes;}
    mapping(address=>Checkpoint[]) private checkpoints;
    address[] private holders;
    uint192[] private amounts;
    event Transfer(address indexed from,address indexed to,uint256 value);
    event Approval(address indexed owner,address indexed spender,uint256 value);
    error InvalidShares();
    constructor(address[] memory holders_,uint192[] memory amounts_){
        governance=msg.sender;
        if(holders_.length==0||holders_.length!=amounts_.length||holders_.length>64)revert InvalidShares();
        uint256 sum;for(uint256 i;i<holders_.length;i++){if(holders_[i]==address(0)||holders_[i]==governance||holders_[i]==address(this)||amounts_[i]==0)revert InvalidShares();sum+=amounts_[i];}
        if(sum>type(uint192).max)revert InvalidShares();holders=holders_;amounts=amounts_;originalSupply=sum;
    }
    function activate() external {if(msg.sender!=governance||active)revert InvalidShares();active=true;totalSupply=originalSupply;for(uint256 i;i<holders.length;i++){balanceOf[holders[i]]+=amounts[i];_checkpoint(holders[i]);emit Transfer(address(0),holders[i],amounts[i]);}}
    function approve(address spender,uint256 amount) external returns(bool){if(spender==address(0))revert InvalidShares();allowance[msg.sender][spender]=amount;emit Approval(msg.sender,spender,amount);return true;}
    function transfer(address to,uint256 amount) external returns(bool){_transfer(msg.sender,to,amount);return true;}
    function transferFrom(address from,address to,uint256 amount) external returns(bool){uint256 a=allowance[from][msg.sender];if(a!=type(uint256).max){allowance[from][msg.sender]=a-amount;emit Approval(from,msg.sender,a-amount);}_transfer(from,to,amount);return true;}
    function _transfer(address from,address to,uint256 amount) private {if(!active||to==address(0)||to==address(this)||to==governance)revert InvalidShares();balanceOf[from]-=amount;balanceOf[to]+=amount;_checkpoint(from);_checkpoint(to);emit Transfer(from,to,amount);}
    function burn(address holder,uint256 amount) external {if(msg.sender!=governance||amount==0)revert InvalidShares();balanceOf[holder]-=amount;totalSupply-=amount;_checkpoint(holder);emit Transfer(holder,address(0),amount);}
    function _checkpoint(address holder) private {Checkpoint[] storage c=checkpoints[holder];uint192 b=uint192(balanceOf[holder]);if(c.length!=0&&c[c.length-1].blockNumber==block.number)c[c.length-1].votes=b;else c.push(Checkpoint(uint64(block.number),b));}
    function pastVotes(address holder,uint256 blockNumber) external view returns(uint256){if(blockNumber>=block.number)revert InvalidShares();Checkpoint[] storage c=checkpoints[holder];uint256 low;uint256 high=c.length;while(low<high){uint256 mid=(low+high)/2;if(c[mid].blockNumber>blockNumber)high=mid;else low=mid+1;}return high==0?0:c[high-1].votes;}
}
