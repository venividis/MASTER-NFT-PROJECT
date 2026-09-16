// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolGuard,ProtocolAssets,IWorldLedger} from "./ProtocolPrimitives.sol";

/// @notice Fixed-beneficiary native/ERC20 cliff locks and linear vesting. No admin or early exit.
/// @dev Beneficiary=NFT account makes the right follow that NFT. Selling the NFT can sell the right,
///      but cannot accelerate this contract's release schedule. Rebasing assets are unsupported.
contract TimeVault is ProtocolGuard {
    IWorldLedger public immutable ledger;
    uint256 public lockCount;
    struct Lock {address depositor;address beneficiary;address asset;uint112 amount;uint112 released;uint64 start;uint64 cliff;uint64 end;bool linear;uint256 identity;}
    mapping(uint256=>Lock) private locks;
    mapping(address=>uint256) public liability;
    mapping(address=>bytes32) public accountCommitment;
    mapping(address=>uint256[]) private beneficiaryLocks;
    event Locked(uint256 indexed id,address indexed beneficiary,address indexed asset,address depositor,uint256 amount,uint64 start,uint64 cliff,uint64 end,bool linear);
    event Released(uint256 indexed id,address indexed beneficiary,uint256 amount);
    event Extended(uint256 indexed id,uint64 previousEnd,uint64 newEnd);
    error NothingReleasable(); error UnsupportedSchedule();
    constructor(address ledger_){require(ledger_.code.length!=0,"LEDGER_REQUIRED");ledger=IWorldLedger(ledger_);}
    function deposit(address asset,uint112 amount,address beneficiary,uint64 start,uint64 cliff,uint64 end,bool linear,uint256 identity) external payable nonReentrant returns(uint256){
        _identity(ledger.collection(),msg.sender,identity);
        return _deposit(msg.sender,identity,asset,amount,beneficiary,start,cliff,end,linear);
    }
    function depositFromProtocol(address beneficiary,uint256 identity,address asset,uint112 amount,uint64 start,uint64 cliff,uint64 end,bool linear) external payable nonReentrant returns(uint256){
        if(!ledger.isSealed() || (msg.sender!=ledger.market() && msg.sender!=ledger.launchpad())) revert Unauthorized();
        _identity(ledger.collection(),beneficiary,identity);
        return _deposit(beneficiary,identity,asset,amount,beneficiary,start,cliff,end,linear);
    }
    function _deposit(address actor,uint256 identity,address asset,uint112 amount,address beneficiary,uint64 start,uint64 cliff,uint64 end,bool linear) private returns(uint256 id){
        if(!ledger.isSealed() || beneficiary==address(0) || beneficiary==address(this)) revert Unauthorized();
        _amount(amount);
        if(start==0) start=uint64(block.timestamp);
        if(cliff==0) cliff=start;
        if(start<block.timestamp || cliff<start || end<=start || end<cliff || end>block.timestamp+3650 days || (!linear && cliff!=end)) revert UnsupportedSchedule();
        if(asset==address(0)){if(msg.value!=amount) revert InvalidAmount();}
        else {if(msg.value!=0) revert InvalidAmount();ProtocolAssets.pull(asset,msg.sender,amount);}
        id=++lockCount;
        locks[id]=Lock(msg.sender,beneficiary,asset,amount,0,start,cliff,end,linear,beneficiary==actor?identity:0);
        beneficiaryLocks[beneficiary].push(id);liability[asset]+=amount;
        _touchLock(id);
        emit Locked(id,beneficiary,asset,msg.sender,amount,start,cliff,end,linear);
        ledger.record(6,actor,identity,asset,amount,id,bytes32(uint256(end)));
    }
    function releasable(uint256 id) public view returns(uint256){
        Lock storage l=locks[id]; if(l.amount==0 || block.timestamp<l.cliff) return 0;
        uint256 vested=block.timestamp>=l.end?l.amount:l.linear?uint256(l.amount)*(block.timestamp-l.start)/(l.end-l.start):0;
        return vested>l.released?vested-l.released:0;
    }
    /// @notice Anyone can trigger release; the recipient is ALWAYS the committed beneficiary.
    function release(uint256 id) external nonReentrant returns(uint256 amount){
        amount=releasable(id);if(amount==0) revert NothingReleasable(); Lock storage l=locks[id];
        l.released+=uint112(amount);liability[l.asset]-=amount;
        _touchLock(id);
        ProtocolAssets.push(l.asset,l.beneficiary,amount);
        emit Released(id,l.beneficiary,amount);
        ledger.record(7,l.beneficiary,l.identity,l.asset,amount,id,bytes32(uint256(uint160(msg.sender))));
    }
    function extend(uint256 id,uint64 newEnd) external {
        Lock storage l=locks[id];if(msg.sender!=l.beneficiary || l.linear || block.timestamp>=l.end || newEnd<=l.end || newEnd>block.timestamp+3650 days) revert Unauthorized();
        uint64 old=l.end;l.end=newEnd;l.cliff=newEnd;_touchLock(id);emit Extended(id,old,newEnd);
    }
    function _touchLock(uint256 id) private{Lock storage l=locks[id];accountCommitment[l.beneficiary]=keccak256(abi.encode(accountCommitment[l.beneficiary],id,l));}
    function lockInfo(uint256 id) external view returns(address,address,address,uint112,uint112,uint64,uint64,uint64,bool,uint256){Lock storage l=locks[id];return(l.depositor,l.beneficiary,l.asset,l.amount,l.released,l.start,l.cliff,l.end,l.linear,l.identity);}
    function lockCountOf(address beneficiary) external view returns(uint256){return beneficiaryLocks[beneficiary].length;}
    function lockIdOf(address beneficiary,uint256 index) external view returns(uint256){return beneficiaryLocks[beneficiary][index];}
}
