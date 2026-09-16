// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// These fixtures are intentionally untrusted, permissionless and never deployment dependencies.
contract ExperimentalTokenMock {
    uint8 public immutable decimals;mapping(address=>uint256) public balanceOf;mapping(address=>mapping(address=>uint256)) public allowance;
    address public attackTarget;bytes public attackData;bool public attackAttempted;bool public attackSucceeded;bool private attacking;
    constructor(uint8 d){decimals=d;}
    function mint(address to,uint256 amount) external{balanceOf[to]+=amount;}
    function approve(address to,uint256 amount) external returns(bool){allowance[msg.sender][to]=amount;return true;}
    function attack(address target,bytes calldata data) external{attackTarget=target;attackData=data;attackAttempted=false;attackSucceeded=false;}
    function _hook() private {if(attackTarget!=address(0)&&!attacking){attacking=true;attackAttempted=true;(attackSucceeded,)=attackTarget.call(attackData);attacking=false;}}
    function transfer(address to,uint256 amount) external returns(bool){balanceOf[msg.sender]-=amount;balanceOf[to]+=amount;_hook();return true;}
    function transferFrom(address from,address to,uint256 amount) external returns(bool){allowance[from][msg.sender]-=amount;balanceOf[from]-=amount;balanceOf[to]+=amount;_hook();return true;}
}
contract ExperimentalFeedMock {
    uint8 public decimals;int256 public answer;uint64 public updatedAt;uint80 public round=1;
    constructor(uint8 d){decimals=d;}
    function setDecimals(uint8 d) external{decimals=d;}
    function set(int256 n,uint64 time) external{answer=n;updatedAt=time;++round;}
    function latestRoundData() external view returns(uint80,int256,uint256,uint256,uint80){return(round,answer,updatedAt,updatedAt,round);}
}
contract ExperimentalOracleMock {
    uint256 public value;uint64 public time;
    function set(uint256 n,uint64 at) external{value=n;time=at;}
    function price() external view returns(uint256,uint64){return(value,time);}
}
contract ExperimentalVenueMock {
    ExperimentalTokenMock public quote;ExperimentalTokenMock public base;uint256 public baseUnit;uint256 public price;bool public lie;bool public fail;
    constructor(address q,address b,uint256 unit){quote=ExperimentalTokenMock(q);base=ExperimentalTokenMock(b);baseUnit=unit;}
    function configure(uint256 price_,bool lie_,bool fail_) external{price=price_;lie=lie_;fail=fail_;}
    function swapExactIn(address input,address output,uint112 amount,uint112 minimum,address recipient,uint48 deadline) external returns(uint256 received){return _swap(input,output,amount,minimum,recipient,deadline);}
    function swap(address input,address output,uint112 amount,uint112 minimum,uint48 deadline,uint256,uint64) external returns(uint256 received,uint256 lockId){received=_swap(input,output,amount,minimum,msg.sender,deadline);lockId=0;}
    function _swap(address input,address output,uint112 amount,uint112 minimum,address recipient,uint48 deadline) private returns(uint256 received){
        require(!fail&&deadline>=block.timestamp,'VENUE');require((input==address(quote)&&output==address(base))||(input==address(base)&&output==address(quote)),'PAIR');
        received=input==address(quote)?uint256(amount)*baseUnit/price:uint256(amount)*price/baseUnit;require(received>=minimum,'MINIMUM');
        ExperimentalTokenMock(input).transferFrom(msg.sender,address(this),amount);ExperimentalTokenMock(output).transfer(recipient,received);if(lie)++received;
    }
}
contract ExperimentalWakeTaskMock {
    address public wake;address public keeper;bool public fail;mapping(bytes32=>bool) public done;
    function bind(address w) external{require(wake==address(0));wake=w;}
    function setFail(bool value) external{fail=value;}
    function perform(bytes32 task,address keeper_,bytes calldata data) external returns(bytes32 receipt){require(msg.sender==wake&&!fail&&!done[task]);done[task]=true;keeper=keeper_;receipt=keccak256(abi.encode(task,keeper_,data));}
}
contract ExperimentalExitVaultMock {
    mapping(uint256=>mapping(uint256=>bool)) public done;
    function eligible(uint256 id,uint256 slice) external view returns(bool){return !done[id][slice];}
    function executeSlice(uint256 id,uint256 slice) external returns(uint256){require(!done[id][slice]);done[id][slice]=true;return 7;}
}
contract ExperimentalRejectingHolder {
    receive() external payable{revert('NO_NATIVE');}
    function execute(address target,bytes calldata data) external returns(bytes memory r){(bool ok,bytes memory result)=target.call(data);require(ok);return result;}
}
