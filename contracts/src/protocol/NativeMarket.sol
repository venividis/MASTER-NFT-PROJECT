// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolGuard,ProtocolAssets,IWorldLedger} from "./ProtocolPrimitives.sol";
import {TimeVault} from "./TimeVault.sol";

/// @notice Exact-input native-token markets for fixed-supply tokens created by THIS launchpad.
/// @dev Experimental constant-product market, NOT Uniswap v4, a universal aggregator or MEV protection.
///      Native liquidity and token reserves have no withdrawal/admin path. Fees remain in reserves.
contract NativeMarket is ProtocolGuard {
    uint256 public constant FEE_BPS=30;
    uint256 public constant BPS=10000;
    IWorldLedger public immutable ledger;
    struct Pool {uint112 nativeReserve;uint112 tokenReserve;uint64 createdAt;uint256 launchId;uint256 swaps;}
    mapping(address=>Pool) private pools;
    address[] private poolTokens;
    event MarketSeeded(address indexed token,uint256 indexed launchId,uint256 nativeAmount,uint256 tokenAmount);
    event Swapped(address indexed actor,address indexed tokenIn,address indexed tokenOut,uint256 identity,uint256 amountIn,uint256 amountOut,uint256 vaultLock);
    error MissingMarket();error Slippage();error Expired();error BadRoute();
    constructor(address ledger_){require(ledger_.code.length!=0,"LEDGER_REQUIRED");ledger=IWorldLedger(ledger_);}
    function seed(address token,uint112 amount,uint256 launchId) external payable nonReentrant {
        if(!ledger.isSealed() || msg.sender!=ledger.launchpad() || pools[token].createdAt!=0) revert Unauthorized();
        _amount(amount);_amount(msg.value);ProtocolAssets.pull(token,msg.sender,amount);
        pools[token]=Pool(uint112(msg.value),amount,uint64(block.timestamp),launchId,0);poolTokens.push(token);
        emit MarketSeeded(token,launchId,msg.value,amount);
    }
    function amountOut(uint256 amount,uint256 reserveIn,uint256 reserveOut) public pure returns(uint256){
        if(amount==0 || amount>type(uint112).max || reserveIn==0 || reserveOut==0) revert InvalidAmount();
        uint256 effective=amount*(BPS-FEE_BPS);
        return effective*reserveOut/(reserveIn*BPS+effective);
    }
    function quote(address tokenIn,address tokenOut,uint256 amount) public view returns(uint256 output,uint256 spotOutput,uint8 hops){
        if(tokenIn==tokenOut) revert BadRoute();_amount(amount);
        if(tokenIn==address(0)){Pool storage p=_pool(tokenOut);output=amountOut(amount,p.nativeReserve,p.tokenReserve);spotOutput=amount*p.tokenReserve/p.nativeReserve;hops=1;}
        else if(tokenOut==address(0)){Pool storage p=_pool(tokenIn);output=amountOut(amount,p.tokenReserve,p.nativeReserve);spotOutput=amount*p.nativeReserve/p.tokenReserve;hops=1;}
        else {Pool storage a=_pool(tokenIn);Pool storage b=_pool(tokenOut);uint256 mid=amountOut(amount,a.tokenReserve,a.nativeReserve);output=amountOut(mid,b.nativeReserve,b.tokenReserve);spotOutput=(amount*a.nativeReserve/a.tokenReserve)*b.tokenReserve/b.nativeReserve;hops=2;}
    }
    function swap(address tokenIn,address tokenOut,uint112 amount,uint112 minOut,uint48 deadline,uint256 identity,uint64 lockUntil) external payable nonReentrant returns(uint256 output,uint256 lockId){
        if(!ledger.isSealed()) revert Unauthorized();_identity(ledger.collection(),msg.sender,identity);
        if(block.timestamp>deadline) revert Expired();if(tokenIn==tokenOut) revert BadRoute();_amount(amount);_amount(minOut);
        if(tokenIn==address(0)){if(msg.value!=amount) revert InvalidAmount();}
        else {if(msg.value!=0) revert InvalidAmount();ProtocolAssets.pull(tokenIn,msg.sender,amount);}
        if(tokenIn==address(0)) output=_trade(tokenOut,true,amount);
        else if(tokenOut==address(0)) output=_trade(tokenIn,false,amount);
        else output=_trade(tokenOut,true,_trade(tokenIn,false,amount));
        if(output<minOut) revert Slippage();_amount(output);
        if(lockUntil!=0){
            if(lockUntil<=block.timestamp) revert InvalidTime();
            address target=ledger.vault();
            if(tokenOut!=address(0)) ProtocolAssets.approveExact(tokenOut,target,output);
            lockId=TimeVault(target).depositFromProtocol{value:tokenOut==address(0)?output:0}(msg.sender,identity,tokenOut,uint112(output),uint64(block.timestamp),lockUntil,lockUntil,false);
            if(tokenOut!=address(0)) ProtocolAssets.approveExact(tokenOut,target,0);
        } else ProtocolAssets.push(tokenOut,msg.sender,output);
        emit Swapped(msg.sender,tokenIn,tokenOut,identity,amount,output,lockId);
        ledger.record(5,msg.sender,identity,tokenOut,output,uint256(uint160(tokenIn)),bytes32(uint256(amount)));
    }
    function _trade(address token,bool buy,uint256 amount) private returns(uint256 output){
        Pool storage p=_pool(token);uint256 rin=buy?p.nativeReserve:p.tokenReserve;uint256 rout=buy?p.tokenReserve:p.nativeReserve;
        output=amountOut(amount,rin,rout);if(output==0 || rin+amount>type(uint112).max) revert InvalidAmount();
        if(buy){p.nativeReserve=uint112(rin+amount);p.tokenReserve=uint112(rout-output);}else{p.tokenReserve=uint112(rin+amount);p.nativeReserve=uint112(rout-output);}++p.swaps;
    }
    function _pool(address token) private view returns(Pool storage p){p=pools[token];if(p.createdAt==0) revert MissingMarket();}
    function poolInfo(address token) external view returns(uint112,uint112,uint64,uint256,uint256){Pool storage p=pools[token];return(p.nativeReserve,p.tokenReserve,p.createdAt,p.launchId,p.swaps);}
    function poolCount() external view returns(uint256){return poolTokens.length;}
    function poolToken(uint256 index) external view returns(address){return poolTokens[index];}
}
