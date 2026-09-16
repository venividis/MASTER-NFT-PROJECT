// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolAssets,ProtocolGuard} from '../protocol/ProtocolPrimitives.sol';
/// @notice Prefunded, consent-based work with a fixed worker, reviewer and refund clock.
/// @dev Reviewer trust is explicit. A deliverable digest is not a proof of quality or authorship.
/// No reassignment of personal worker/reviewer keys when the funding NFT changes owners.
contract CommissionEscrow is ProtocolGuard {
    enum Status{Missing,Offered,Accepted,Submitted,Paid,Refunded}
    struct Work {address fundingAccount;address worker;address reviewer;address asset;uint112 amount;uint64 submitBy;uint64 reviewBy;bytes32 terms;bytes32 deliverable;Status status;}
    uint256 public count;
    mapping(uint256=>Work) private works;
    mapping(address=>mapping(address=>uint256)) public claimable;
    mapping(address=>bytes32) public accountCommitment;
    event Funded(uint256 indexed id,address indexed account,address indexed worker,address reviewer,address asset,uint256 amount,uint64 submitBy,uint64 reviewBy,bytes32 terms);
    event WorkChanged(uint256 indexed id,Status status,bytes32 deliverable,address actor);
    error InvalidWork();
    function fund(address worker,address reviewer,address asset,uint112 amount,uint64 submitBy,bytes32 terms) external payable nonReentrant returns(uint256 id){
        _amount(amount);if(worker==address(0)||reviewer==address(0)||worker==msg.sender||worker==reviewer||submitBy<=block.timestamp||submitBy>block.timestamp+90 days||terms==bytes32(0))revert InvalidWork();
        if(asset==address(0)){if(msg.value!=amount)revert InvalidAmount();}else{if(msg.value!=0)revert InvalidAmount();ProtocolAssets.pull(asset,msg.sender,amount);}
        id=++count;works[id]=Work(msg.sender,worker,reviewer,asset,amount,submitBy,submitBy+3 days,terms,0,Status.Offered);_touch(id);
        emit Funded(id,msg.sender,worker,reviewer,asset,amount,submitBy,submitBy+3 days,terms);
    }
    function accept(uint256 id) external{Work storage w=works[id];if(msg.sender!=w.worker||w.status!=Status.Offered||block.timestamp>=w.submitBy)revert InvalidWork();w.status=Status.Accepted;_touch(id);}
    function submit(uint256 id,bytes32 deliverable) external{Work storage w=works[id];if(msg.sender!=w.worker||w.status!=Status.Accepted||block.timestamp>=w.submitBy||deliverable==0)revert InvalidWork();w.deliverable=deliverable;w.status=Status.Submitted;_touch(id);}
    function decide(uint256 id,bool approve) external nonReentrant{Work storage w=works[id];if(msg.sender!=w.reviewer||w.status!=Status.Submitted||block.timestamp>=w.reviewBy)revert InvalidWork();_settle(id,approve);}
    function refundExpired(uint256 id) external nonReentrant{Work storage w=works[id];if(w.status==Status.Submitted){if(block.timestamp<w.reviewBy)revert InvalidWork();}else if(w.status==Status.Offered||w.status==Status.Accepted){if(block.timestamp<w.submitBy)revert InvalidWork();}else revert InvalidWork();_settle(id,false);}
    function _settle(uint256 id,bool pay) private{Work storage w=works[id];w.status=pay?Status.Paid:Status.Refunded;address recipient=pay?w.worker:w.fundingAccount;claimable[recipient][w.asset]+=w.amount;_touch(id);accountCommitment[recipient]=keccak256(abi.encode(accountCommitment[recipient],'CREDIT',id,w.asset,w.amount));}
    function withdrawFor(address recipient,address asset) external nonReentrant{uint256 n=claimable[recipient][asset];if(n==0)revert InvalidAmount();claimable[recipient][asset]=0;accountCommitment[recipient]=keccak256(abi.encode(accountCommitment[recipient],'WITHDRAW',asset,n));ProtocolAssets.push(asset,recipient,n);}
    function _touch(uint256 id) private{Work storage w=works[id];bytes32 h=keccak256(abi.encode(id,w));accountCommitment[w.fundingAccount]=keccak256(abi.encode(accountCommitment[w.fundingAccount],h));emit WorkChanged(id,w.status,w.deliverable,msg.sender);}
    function work(uint256 id) external view returns(Work memory){return works[id];}
}
