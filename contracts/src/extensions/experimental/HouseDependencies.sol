// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolAssets,ProtocolGuard} from '../../protocol/ProtocolPrimitives.sol';
import {IHouseOracle,IHouseVenue} from './House.sol';

interface IHouseFeed {
    function decimals() external view returns(uint8);
    function latestRoundData() external view returns(uint80,int256,uint256,uint256,uint80);
}
interface IHouseNativeMarket {
    function swap(address input,address output,uint112 amount,uint112 minimum,uint48 deadline,uint256 identity,uint64 lockUntil) external payable returns(uint256,uint256);
}
/// @notice Normalizes two feeds with the SAME numeraire into quote raw units per whole base.
/// @dev Feed identity, numeraire equivalence, heartbeat and L2 sequencer handling require
/// chain-specific review. A proxy's unchanged codehash cannot certify its implementation.
contract HouseFeedRatio is IHouseOracle {
    IHouseFeed public immutable baseFeed;IHouseFeed public immutable quoteFeed;
    bytes32 public immutable baseFeedCodeHash;bytes32 public immutable quoteFeedCodeHash;
    uint8 public immutable baseFeedDecimals;uint8 public immutable quoteFeedDecimals;
    uint8 public immutable quoteDecimals;uint64 public immutable maxAge;
    error InvalidFeed();
    constructor(address base_,address quote_,uint8 quoteDecimals_,uint64 maxAge_){
        if(base_.code.length==0||quote_.code.length==0||quoteDecimals_>18||maxAge_==0)revert InvalidFeed();
        baseFeed=IHouseFeed(base_);quoteFeed=IHouseFeed(quote_);baseFeedCodeHash=base_.codehash;quoteFeedCodeHash=quote_.codehash;
        uint8 bd=baseFeed.decimals();uint8 qd=quoteFeed.decimals();if(bd>18||qd>18)revert InvalidFeed();
        baseFeedDecimals=bd;quoteFeedDecimals=qd;quoteDecimals=quoteDecimals_;maxAge=maxAge_;
    }
    function price() external view returns(uint256 result,uint64 updatedAt){
        if(address(baseFeed).codehash!=baseFeedCodeHash||address(quoteFeed).codehash!=quoteFeedCodeHash||baseFeed.decimals()!=baseFeedDecimals||quoteFeed.decimals()!=quoteFeedDecimals)revert InvalidFeed();
        (uint256 b,uint64 bt)=_read(baseFeed);(uint256 q,uint64 qt)=_read(quoteFeed);
        result=b*(10**uint256(quoteDecimals))*(10**uint256(quoteFeedDecimals))/(q*(10**uint256(baseFeedDecimals)));
        if(result==0||result>type(uint112).max)revert InvalidFeed();updatedAt=bt<qt?bt:qt;
    }
    function _read(IHouseFeed feed) private view returns(uint256 n,uint64 at){
        (uint80 round,int256 answer,,uint256 time,)=feed.latestRoundData();
        if(round==0||answer<=0||uint256(answer)>type(uint112).max||time==0||time>block.timestamp||block.timestamp-time>maxAge)revert InvalidFeed();
        n=uint256(answer);at=uint64(time);
    }
}
/// @notice Pinned bridge to ANIMA's actual swap interface, with exact transient approvals.
contract HouseNativeMarketVenue is IHouseVenue,ProtocolGuard {
    IHouseNativeMarket public immutable market;bytes32 public immutable marketCodeHash;
    constructor(address market_){if(market_.code.length==0)revert Unauthorized();market=IHouseNativeMarket(market_);marketCodeHash=market_.codehash;}
    function swapExactIn(address input,address output,uint112 amount,uint112 minimum,address recipient,uint48 deadline) external nonReentrant returns(uint256 received){
        if(recipient!=msg.sender||input==output||input==address(0)||output==address(0)||address(market).codehash!=marketCodeHash)revert Unauthorized();
        uint256 beforeIn=ProtocolAssets.balance(input,address(this));uint256 beforeOut=ProtocolAssets.balance(output,address(this));
        ProtocolAssets.pull(input,msg.sender,amount);ProtocolAssets.approveExact(input,address(market),amount);
        uint256 lockId;(received,lockId)=market.swap(input,output,amount,minimum,deadline,0,0);ProtocolAssets.approveExact(input,address(market),0);
        if(lockId!=0||received<minimum||ProtocolAssets.balance(input,address(this))!=beforeIn||ProtocolAssets.balance(output,address(this))!=beforeOut+received)revert InvalidAmount();
        ProtocolAssets.push(output,recipient,received);
    }
}
