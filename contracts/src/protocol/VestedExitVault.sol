// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolGuard,ProtocolAssets,IProtocolCollection} from "./ProtocolPrimitives.sol";
import {IOperatingAccount} from "../operating/OperatingInterfaces.sol";

interface IVestedExitMarket {
    function swap(address tokenIn,address tokenOut,uint112 amount,uint112 minOut,uint48 deadline,uint256 identity,uint64 lockUntil) external payable returns(uint256 output,uint256 lockId);
}
/// @notice A funded, fixed-recipient sell schedule. A date is eligibility, never a guaranteed fill.
/// @dev Only the immutable, reviewed market adapter is called. No arbitrary call data, approvals or keeper reward.
contract VestedExitVault is ProtocolGuard {
    struct Slice { uint112 amount; uint112 minOut; uint48 due; uint48 expires; uint8 status; uint112 received; }
    struct Plan { address account; address owner; address input; address output; uint64 epoch; bool paused; bool cancelled; bytes32 decision; }
    address public immutable collection;
    address public immutable market;
    bytes32 public immutable marketCodeHash;
    uint256 public planCount;
    mapping(uint256=>Plan) public plans;
    mapping(uint256=>Slice[]) private slices;
    mapping(address=>bytes32) public accountCommitment;
    error Unavailable(); error CustodyChanged(); error InvalidSchedule(); error MarketChanged(); error BadFill();
    event Funded(uint256 indexed plan,address indexed account,address input,address output,uint256 amount,bytes32 decision);
    event InstallmentSold(uint256 indexed plan,uint256 indexed index,uint256 input,uint256 output,address recipient);
    event Recovered(uint256 indexed plan,uint256 indexed index,uint256 amount,address recipient);
    event ControlChanged(uint256 indexed plan,uint8 action,uint64 epoch);
    constructor(address collection_,address market_){
        if(collection_.code.length==0||market_.code.length==0) revert InvalidIdentity();
        collection=collection_;market=market_;marketCodeHash=market_.codehash;
    }
    receive() external payable { if(msg.sender!=market) revert Unauthorized(); }
    function createPlan(uint256 identity,address input,address output,Slice[] calldata terms,bytes32 decision) external payable nonReentrant returns(uint256 id){
        if(identity==0||IProtocolCollection(collection).accountOf(identity)!=msg.sender||input==output||(output!=address(0)&&output.code.length==0)||terms.length==0||terms.length>64) revert InvalidSchedule();
        IOperatingAccount account=IOperatingAccount(msg.sender);
        if(account.mode()!=0) revert Unauthorized();
        address owner=account.currentOwner();uint64 epoch=account.sessionEpoch();
        uint256 total;uint48 last;
        for(uint256 i;i<terms.length;++i){Slice calldata s=terms[i];
            if(s.amount==0||s.minOut==0||s.status!=0||s.received!=0||s.due<block.timestamp+60||s.due>block.timestamp+3650 days||s.due<=last||s.expires<=s.due||s.expires>s.due+365 days) revert InvalidSchedule();
            last=s.due;total+=s.amount;
        }
        _amount(total);
        if(input==address(0)){if(msg.value!=total) revert InvalidAmount();}else{if(msg.value!=0) revert InvalidAmount();ProtocolAssets.pull(input,msg.sender,total);}
        if(account.currentOwner()!=owner||account.sessionEpoch()!=epoch||account.mode()!=0) revert CustodyChanged();
        id=++planCount;plans[id]=Plan(msg.sender,owner,input,output,epoch,false,false,decision);
        for(uint256 i;i<terms.length;++i)slices[id].push(terms[i]);
        _touch(id);emit Funded(id,msg.sender,input,output,total,decision);
    }
    function sliceCount(uint256 id) external view returns(uint256){return slices[id].length;}
    function sliceAt(uint256 id,uint256 index) external view returns(Slice memory){return slices[id][index];}
    function eligible(uint256 id,uint256 index) public view returns(bool){
        if(index>=slices[id].length)return false;Plan storage p=plans[id];Slice storage s=slices[id][index];
        return s.status==0&&!p.paused&&!p.cancelled&&block.timestamp>=s.due&&block.timestamp<s.expires&&_sameCustody(p);
    }
    function executeSlice(uint256 id,uint256 index) external nonReentrant returns(uint256 received){
        if(!eligible(id,index))revert Unavailable();if(market.codehash!=marketCodeHash)revert MarketChanged();
        Plan storage p=plans[id];Slice storage s=slices[id][index];
        uint256 beforeIn=ProtocolAssets.balance(p.input,address(this));uint256 beforeOut=ProtocolAssets.balance(p.output,address(this));
        s.status=1;
        if(p.input!=address(0))ProtocolAssets.approveExact(p.input,market,s.amount);
        (uint256 reported,uint256 lockId)=IVestedExitMarket(market).swap{value:p.input==address(0)?s.amount:0}(p.input,p.output,s.amount,s.minOut,s.expires-1,0,0);
        if(p.input!=address(0))ProtocolAssets.approveExact(p.input,market,0);
        uint256 afterOut=ProtocolAssets.balance(p.output,address(this));
        if(afterOut<beforeOut||ProtocolAssets.balance(p.input,address(this))+s.amount!=beforeIn)revert BadFill();
        received=afterOut-beforeOut;
        if(lockId!=0||reported!=received||received<s.minOut||received>type(uint112).max)revert BadFill();
        if(!_sameCustody(p))revert CustodyChanged();
        s.received=uint112(received);ProtocolAssets.push(p.output,p.account,received);
        if(!_sameCustody(p))revert CustodyChanged();
        _touch(id);emit InstallmentSold(id,index,s.amount,received,p.account);
    }
    /// @param action 0 pause, 1 resume, 2 cancel permanently, 3 reauthorize current custody and pause.
    function control(uint256 id,uint8 action) external nonReentrant {
        Plan storage p=plans[id];if(msg.sender!=p.account||p.cancelled||action>3)revert Unauthorized();
        if(action==3){IOperatingAccount a=IOperatingAccount(p.account);if(a.mode()!=0)revert Unauthorized();p.epoch=a.sessionEpoch();p.owner=a.currentOwner();p.paused=true;}
        else if(action==2)p.cancelled=true;
        else{if(action==1&&!_sameCustody(p))revert CustodyChanged();p.paused=action==0;}
        _touch(id);emit ControlChanged(id,action,p.epoch);
    }
    /// @notice Anyone can return a matured, cancelled/expired installment to its fixed account.
    function recover(uint256 id,uint256 index) external nonReentrant {
        Plan storage p=plans[id];Slice storage s=slices[id][index];
        if(s.status!=0||block.timestamp<s.due||(!p.cancelled&&block.timestamp<s.expires))revert Unavailable();
        s.status=2;ProtocolAssets.push(p.input,p.account,s.amount);_touch(id);emit Recovered(id,index,s.amount,p.account);
    }
    function _sameCustody(Plan storage p) private view returns(bool){
        if(p.account==address(0))return false;IOperatingAccount a=IOperatingAccount(p.account);
        return a.mode()==0&&a.sessionEpoch()==p.epoch&&a.currentOwner()==p.owner;
    }
    function _touch(uint256 id) private {Plan storage p=plans[id];accountCommitment[p.account]=keccak256(abi.encode(accountCommitment[p.account],id,p,slices[id]));}
}
