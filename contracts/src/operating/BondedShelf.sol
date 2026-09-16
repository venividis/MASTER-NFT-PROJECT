// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolAssets} from '../protocol/ProtocolPrimitives.sol';
import {ExperimentModule} from './ExperimentalAdapters.sol';
interface IShelfNFT {function safeTransferFrom(address,address,uint256) external;function ownerOf(uint256) external view returns(address);}
/// @notice Single-item fixed-price shelves. Proceeds stay reserved until a committed date.
/// @dev The project's root NFT is rejected here: it belongs in the covenant-aware exchange.
/// Other assets require collection review. This is not a valuation or universal child-asset audit.
contract BondedShelf is ExperimentModule {
    address public immutable rootCollection;
    struct Shelf{address ownerAccount;address collection;uint256 tokenId;uint112 price;uint64 bondedUntil;address buyer;uint8 status;}
    mapping(uint256=>Shelf) private shelves;uint256 public count;
    mapping(address=>uint256) public proceeds;
    address private receivingCollection;address private receivingFrom;uint256 private receivingId;bool private received;
    event ShelfChanged(uint256 indexed id,address indexed account,uint8 status);
    constructor(address gate_,address rootCollection_) ExperimentModule(gate_){if(rootCollection_.code.length==0)revert InvalidTerms();rootCollection=rootCollection_;}
    function open(address collection,uint256 tokenId,uint112 price,uint64 bondedUntil) external newRisk nonReentrant returns(uint256 id){if(collection==rootCollection||collection.code.length==0||price==0||bondedUntil<=block.timestamp||bondedUntil>block.timestamp+365 days)revert InvalidTerms();receivingCollection=collection;receivingFrom=msg.sender;receivingId=tokenId;received=false;IShelfNFT(collection).safeTransferFrom(msg.sender,address(this),tokenId);if(!received||IShelfNFT(collection).ownerOf(tokenId)!=address(this))revert InvalidTerms();receivingCollection=address(0);receivingFrom=address(0);id=++count;shelves[id]=Shelf(msg.sender,collection,tokenId,price,bondedUntil,address(0),1);_changed(id);}
    function buy(uint256 id) external payable newRisk nonReentrant{Shelf storage s=shelves[id];if(s.status!=1||msg.value!=s.price||msg.sender==s.ownerAccount)revert InvalidTerms();s.status=2;s.buyer=msg.sender;_changed(id);IShelfNFT(s.collection).safeTransferFrom(address(this),msg.sender,s.tokenId);if(IShelfNFT(s.collection).ownerOf(s.tokenId)!=msg.sender)revert InvalidTerms();}
    function close(uint256 id) external nonReentrant{Shelf storage s=shelves[id];if(msg.sender!=s.ownerAccount||block.timestamp<s.bondedUntil||(s.status!=1&&s.status!=2))revert InvalidTerms();bool unsold=s.status==1;s.status=3;if(!unsold)proceeds[s.ownerAccount]+=s.price;_changed(id);if(unsold)IShelfNFT(s.collection).safeTransferFrom(address(this),s.ownerAccount,s.tokenId);}
    function withdrawFor(address account) external nonReentrant{uint256 n=proceeds[account];if(n==0)revert InvalidAmount();proceeds[account]=0;_touch(account,'SHELF_WITHDRAW',abi.encode(n));ProtocolAssets.push(address(0),account,n);}
    function onERC721Received(address operator,address from,uint256 id,bytes calldata) external returns(bytes4){if(msg.sender!=receivingCollection||operator!=address(this)||from!=receivingFrom||id!=receivingId||received)revert InvalidTerms();received=true;return this.onERC721Received.selector;}
    function _changed(uint256 id) private{Shelf storage s=shelves[id];_touch(s.ownerAccount,'SHELF',abi.encode(id,s));emit ShelfChanged(id,s.ownerAccount,s.status);}
    function shelf(uint256 id) external view returns(Shelf memory){return shelves[id];}
}
