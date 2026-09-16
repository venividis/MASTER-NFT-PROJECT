// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProtocolAssets, ProtocolGuard} from "../../protocol/ProtocolPrimitives.sol";

/// @notice ANIMA's bounded, streaming uniform-price auction; this is not Uniswap's CCA implementation.
/// @dev Each checkpoint clears cumulative released lots against standing quantity-limit orders.
/// New bids and cancellations checkpoint first, so they cannot change already elapsed allocations.
contract ContinuousClearingAuction is ProtocolGuard {
    struct Bid { address bidder; uint64 remainingLots; uint96 limitPrice; uint112 escrow; uint64 sequence; }
    address public immutable seller;
    address public immutable saleToken;
    uint112 public immutable lotSize;
    uint64 public immutable totalLots;
    uint64 public immutable startBlock;
    uint64 public immutable endBlock;
    uint96 public immutable reservePrice;
    uint64 public soldLots;
    uint64 public sequence;
    uint96 public lastClearingPrice;
    uint256 public sellerCredit;
    uint256 public outstandingQuote;
    uint256 public outstandingTokens;
    bool public funded;
    bool public closed;
    Bid[64] public bids;
    mapping(address => uint256) public refunds;
    mapping(address => uint256) public tokenClaims;
    event Funded(uint256 tokens);
    event BidOpened(uint8 indexed slot, uint64 indexed sequence, address indexed bidder, uint64 lots, uint96 limitPrice);
    event Filled(uint64 indexed sequence, address indexed bidder, uint64 lots, uint96 clearingPrice);
    event Checkpoint(uint256 indexed blockNumber, uint64 soldLots, uint96 clearingPrice);
    event BidCancelled(uint64 indexed sequence, address indexed bidder, uint256 refund);
    event Closed(uint256 unsoldTokens);
    error InvalidAuction(); error Capacity(); error StaleBid();

    constructor(address seller_, address saleToken_, uint112 lotSize_, uint64 totalLots_, uint64 startBlock_, uint64 endBlock_, uint96 reservePrice_) {
        if (seller_ == address(0) || saleToken_.code.length == 0 || lotSize_ == 0 || totalLots_ == 0 || reservePrice_ == 0 || startBlock_ <= block.number || endBlock_ <= startBlock_ || endBlock_ - startBlock_ > 10_000_000 || uint256(lotSize_) * totalLots_ > type(uint112).max) revert InvalidAuction();
        seller=seller_; saleToken=saleToken_; lotSize=lotSize_; totalLots=totalLots_; startBlock=startBlock_; endBlock=endBlock_; reservePrice=reservePrice_;
    }
    function fund() external nonReentrant {
        if (msg.sender != seller || funded || closed || block.number >= startBlock) revert InvalidAuction();
        funded=true; uint256 amount=uint256(lotSize)*totalLots; ProtocolAssets.pull(saleToken,msg.sender,amount); emit Funded(amount);
    }
    function releasedLots() public view returns(uint64) {
        if(block.number <= startBlock) return 0;
        if(block.number >= endBlock) return totalLots;
        return uint64(uint256(totalLots)*(block.number-startBlock)/(endBlock-startBlock));
    }
    function bid(uint64 lots,uint96 limitPrice) external payable nonReentrant returns(uint8 slot,uint64 id) {
        if(!funded || closed || block.number < startBlock || block.number >= endBlock || lots==0 || lots>totalLots || limitPrice<reservePrice || msg.value!=uint256(lots)*limitPrice || msg.value>type(uint112).max) revert InvalidAuction();
        _checkpoint();
        bool found;
        for(uint8 i; i<64; ++i) if(bids[i].bidder==address(0)){slot=i;found=true;break;}
        if(!found) revert Capacity();
        id=++sequence; bids[slot]=Bid(msg.sender,lots,limitPrice,uint112(msg.value),id); outstandingQuote+=msg.value;
        emit BidOpened(slot,id,msg.sender,lots,limitPrice);
    }
    function cancel(uint8 slot,uint64 expectedSequence) external nonReentrant {
        if(slot>=64 || bids[slot].bidder!=msg.sender || bids[slot].sequence!=expectedSequence) revert StaleBid();
        _checkpoint();
        // The checkpoint may have filled and retired this exact order.
        if(bids[slot].bidder!=address(0)) { Bid memory b=bids[slot]; delete bids[slot]; refunds[b.bidder]+=b.escrow; emit BidCancelled(b.sequence,b.bidder,b.escrow); }
    }
    function checkpoint() external nonReentrant { _checkpoint(); }
    function _checkpoint() internal {
        if(!funded || closed || block.number<=startBlock) return;
        uint64 available=releasedLots()-soldLots;
        uint8[64] memory order; uint256 count;
        for(uint8 i; i<64; ++i) {
            if(bids[i].bidder==address(0)) continue;
            uint256 j=count;
            while(j>0 && (bids[order[j-1]].limitPrice<bids[i].limitPrice || (bids[order[j-1]].limitPrice==bids[i].limitPrice && bids[order[j-1]].sequence>bids[i].sequence))){order[j]=order[j-1];--j;}
            order[j]=i; ++count;
        }
        uint256 demand; uint96 price=reservePrice;
        for(uint256 j; j<count; ++j) {demand+=bids[order[j]].remainingLots;if(available!=0 && demand>=available){price=bids[order[j]].limitPrice;break;}}
        if(demand<available) price=reservePrice;
        if(available!=0 && count!=0) {
            for(uint256 j; j<count && available!=0; ++j){
                Bid storage b=bids[order[j]];
                uint64 fill=b.remainingLots<available?b.remainingLots:available;
                uint256 cost=uint256(fill)*price;
                b.remainingLots-=fill; b.escrow-=uint112(cost); available-=fill; soldLots+=fill;
                sellerCredit+=cost;
                uint256 tokens=uint256(fill)*lotSize; tokenClaims[b.bidder]+=tokens; outstandingTokens+=tokens;
                emit Filled(b.sequence,b.bidder,fill,price);
                if(b.remainingLots==0){refunds[b.bidder]+=b.escrow;delete bids[order[j]];}
            }
            lastClearingPrice=price; emit Checkpoint(block.number,soldLots,price);
        }
        if(block.number>=endBlock){
            closed=true;
            for(uint256 i; i<64; ++i){Bid memory b=bids[i];if(b.bidder!=address(0)){refunds[b.bidder]+=b.escrow;delete bids[i];}}
            uint256 unsold=uint256(totalLots-soldLots)*lotSize;
            tokenClaims[seller]+=unsold;outstandingTokens+=unsold;emit Closed(unsold);
        }
    }
    function cancelBeforeStart() external nonReentrant {
        if(msg.sender!=seller || closed || block.number>=startBlock) revert InvalidAuction();
        closed=true;
        if(funded){uint256 amount=uint256(totalLots)*lotSize;tokenClaims[seller]+=amount;outstandingTokens+=amount;}
    }
    function claimTokens(address recipient) external nonReentrant {
        uint256 amount=tokenClaims[msg.sender]; if(amount==0) revert InvalidAmount(); tokenClaims[msg.sender]=0;outstandingTokens-=amount;ProtocolAssets.push(saleToken,recipient,amount);
    }
    function claimRefund(address recipient) external nonReentrant {
        uint256 amount=refunds[msg.sender];if(amount==0) revert InvalidAmount();refunds[msg.sender]=0;outstandingQuote-=amount;ProtocolAssets.push(address(0),recipient,amount);
    }
    function claimProceeds(address recipient) external nonReentrant {
        if(msg.sender!=seller) revert Unauthorized();uint256 amount=sellerCredit;if(amount==0) revert InvalidAmount();sellerCredit=0;outstandingQuote-=amount;ProtocolAssets.push(address(0),recipient,amount);
    }
}
