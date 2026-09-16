// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolAssets,ProtocolGuard,IWorldLedger} from '../protocol/ProtocolPrimitives.sol';
import {TimeVault} from '../protocol/TimeVault.sol';
import {IExactInputMarket} from '../instruments/ConsentGiftRouter.sol';
/// @notice Two finite recipes: lock an exact asset, or swap exact input and lock the result.
/// @dev No arbitrary target, delegatecall, callback recipient or instruction interpreter.
/// Funding account and beneficiary are always msg.sender. The caller's account grant
/// commits to the full calldata, including minimum output and duration.
contract InstrumentRouter is ProtocolGuard {
    IWorldLedger public immutable ledger;
    address public immutable market;
    TimeVault public immutable vault;
    mapping(address=>bytes32) public accountCommitment;
    event InstrumentRun(address indexed account,address indexed asset,uint256 amount,uint256 lockId,bytes32 recipe);
    error BadRecipe();
    constructor(address ledger_,address market_,address vault_){if(ledger_.code.length==0||market_.code.length==0||vault_.code.length==0)revert BadRecipe();ledger=IWorldLedger(ledger_);market=market_;vault=TimeVault(vault_);}
    receive() external payable{if(msg.sender!=market)revert Unauthorized();}
    function swapAndLock(address input,address output,uint112 amount,uint112 minimum,uint64 duration,uint48 deadline) external payable nonReentrant returns(uint256 lockId){
        if(!ledger.isSealed()||block.timestamp>deadline||duration==0||duration>3650 days||ledger.market()!=market||ledger.vault()!=address(vault))revert BadRecipe();_amount(amount);_amount(minimum);
        if(input==address(0)){if(msg.value!=amount)revert InvalidAmount();}else{if(msg.value!=0)revert InvalidAmount();ProtocolAssets.pull(input,msg.sender,amount);}
        uint256 received=amount;
        if(input!=output){uint256 beforeOutput=ProtocolAssets.balance(output,address(this));if(input!=address(0))ProtocolAssets.approveExact(input,market,amount);
            (received,)=IExactInputMarket(market).swap{value:input==address(0)?amount:0}(input,output,amount,minimum,deadline,0,0);
            if(input!=address(0))ProtocolAssets.approveExact(input,market,0);
            if(ProtocolAssets.balance(output,address(this))!=beforeOutput+received)revert BadRecipe();
        }
        _amount(received);if(received<minimum)revert BadRecipe();if(output!=address(0))ProtocolAssets.approveExact(output,address(vault),received);
        uint64 end=uint64(block.timestamp)+duration;lockId=vault.deposit{value:output==address(0)?received:0}(output,uint112(received),msg.sender,uint64(block.timestamp),end,end,false,0);
        if(output!=address(0))ProtocolAssets.approveExact(output,address(vault),0);
        bytes32 recipe=keccak256(abi.encode(input,output,amount,minimum,duration,deadline));accountCommitment[msg.sender]=keccak256(abi.encode(accountCommitment[msg.sender],recipe,lockId,received));emit InstrumentRun(msg.sender,output,received,lockId,recipe);
    }
}
