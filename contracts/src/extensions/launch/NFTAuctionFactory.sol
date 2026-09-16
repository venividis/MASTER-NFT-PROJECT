// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ContinuousClearingAuction} from '../markets/ContinuousClearingAuction.sol';

/// @notice Creates the existing auction for its actual caller, including an NFT account.
/// @dev Inventory is funded by a separately reviewed seller call before the start block. No arbitrary execution.
contract NFTAuctionFactory {
    struct Terms {address saleToken;uint112 lotSize;uint64 totalLots;uint64 startBlock;uint64 endBlock;uint96 reservePrice;bytes32 salt;}
    event AuctionCreated(address indexed auction,address indexed seller,address indexed token,bytes32 termsHash);
    function predict(Terms calldata t,address seller) public view returns(address){
        bytes32 salt=keccak256(abi.encode(seller,t.salt));
        bytes memory init=abi.encodePacked(type(ContinuousClearingAuction).creationCode,abi.encode(seller,t.saleToken,t.lotSize,t.totalLots,t.startBlock,t.endBlock,t.reservePrice));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff),address(this),salt,keccak256(init))))));
    }
    function create(Terms calldata t) external returns(address auction){
        require(t.startBlock>block.number+3,'FUNDING_WINDOW');
        auction=address(new ContinuousClearingAuction{salt:keccak256(abi.encode(msg.sender,t.salt))}(msg.sender,t.saleToken,t.lotSize,t.totalLots,t.startBlock,t.endBlock,t.reservePrice));
        emit AuctionCreated(auction,msg.sender,t.saleToken,keccak256(abi.encode(t)));
    }
}
