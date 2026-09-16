// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INameRegistry {
    function owner(bytes32) external view returns(address);
    function resolver(bytes32) external view returns(address);
    function setSubnodeRecord(bytes32,bytes32,address,address,uint64) external;
}
interface INamedCollection {
    function ownerOf(uint256) external view returns(address);
    function accountOf(uint256) external view returns(address);
    function tokenURI(uint256) external view returns(string memory);
    function commitmentFor(address,bytes32,address) external pure returns(bytes32);
    function commitAwakening(bytes32) external payable;
    function revealAwakening(bytes32,address) external returns(uint256,address);
    function cancelExpiredAwakening() external;
}

/// @notice Deterministic token-ID subnames of an explicitly delegated ENS parent.
/// The registry and ancestors retain their usual ENS powers. No .eth purchase or
/// renewal is implied. This contract has no parent-reassignment/admin function.
contract GenesisNames {
    INameRegistry public immutable registry;
    INamedCollection public immutable collection;
    bytes32 public immutable parent;
    mapping(bytes32=>uint256) public tokenForNode;
    event Named(uint256 indexed tokenId,bytes32 indexed node,string label);
    error Invalid(); error ParentUnavailable();
    constructor(address registry_,address collection_,bytes32 parent_){if(registry_.code.length==0||collection_.code.length==0||parent_==bytes32(0))revert Invalid();registry=INameRegistry(registry_);collection=INamedCollection(collection_);parent=parent_;}
    function labelFor(uint256 tokenId) public pure returns(string memory){return string.concat("anima-",_decimal(tokenId));}
    function nodeFor(uint256 tokenId) public view returns(bytes32){return keccak256(abi.encodePacked(parent,keccak256(bytes(labelFor(tokenId)))));}
    function bind(uint256 tokenId) external returns(bytes32 node){
        if(tokenId==0||collection.ownerOf(tokenId)==address(0))revert Invalid();
        if(registry.owner(parent)!=address(this))revert ParentUnavailable();
        node=nodeFor(tokenId);
        if(tokenForNode[node]!=0){if(registry.owner(node)!=address(this)||registry.resolver(node)!=address(this))revert ParentUnavailable();return node;}
        // Never overwrite a pre-existing subname, including an unowned resolver record.
        if(registry.owner(node)!=address(0)||registry.resolver(node)!=address(0))revert Invalid();
        tokenForNode[node]=tokenId;
        registry.setSubnodeRecord(parent,keccak256(bytes(labelFor(tokenId))),address(this),address(this),0);
        emit Named(tokenId,node,labelFor(tokenId));
    }
    function _token(bytes32 node) internal view returns(uint256 id){id=tokenForNode[node];if(id==0||registry.owner(node)!=address(this)||registry.resolver(node)!=address(this))revert Invalid();}
    function addr(bytes32 node) external view returns(address){return collection.accountOf(_token(node));}
    function nftRecord(bytes32 node) external view returns(uint256 chainId,address nft,uint256 tokenId,address account,address holder){tokenId=_token(node);return(block.chainid,address(collection),tokenId,collection.accountOf(tokenId),collection.ownerOf(tokenId));}
    function text(bytes32 node,string calldata key) external view returns(string memory){uint256 id=_token(node);bytes32 k=keccak256(bytes(key));if(k==keccak256("anima.tokenId"))return _decimal(id);if(k==keccak256("anima.chainId"))return _decimal(block.chainid);if(k==keccak256("anima.collection"))return _hex(address(collection));if(k==keccak256("anima.owner"))return _hex(collection.ownerOf(id));if(k==keccak256("avatar"))return string.concat("eip155:",_decimal(block.chainid),"/erc721:",_hex(address(collection)),"/",_decimal(id));return "";}
    function supportsInterface(bytes4 id) external pure returns(bool){return id==0x01ffc9a7||id==0x3b3b57de||id==0x59d1d43c;}
    function _decimal(uint256 value) internal pure returns(string memory){if(value==0)return "0";uint256 n=value;uint256 size;while(n!=0){++size;n/=10;}bytes memory out=new bytes(size);while(value!=0){out[--size]=bytes1(uint8(48+value%10));value/=10;}return string(out);}
    function _hex(address value) internal pure returns(string memory){bytes16 digits="0123456789abcdef";bytes memory out=new bytes(42);out[0]="0";out[1]="x";uint160 n=uint160(value);for(uint256 i=42;i>2;){out[--i]=digits[n&15];n>>=4;}return string(out);}
}

/// @notice One private commit slot per owner, allowing mint + name to be atomic.
/// All endowment goes through the original collection into the new NFT account.
contract NamedMintSession {
    address public immutable owner;
    INamedCollection public immutable collection;
    GenesisNames public immutable names;
    error Unauthorized(); error RefundFailed();
    constructor(address owner_,GenesisNames names_){owner=owner_;names=names_;collection=names_.collection();}
    modifier onlyOwner(){if(msg.sender!=owner)revert Unauthorized();_;}
    function commit(bytes32 commitment) external payable onlyOwner {collection.commitAwakening{value:msg.value}(commitment);}
    function reveal(bytes32 secret,address recipient) external onlyOwner returns(uint256 tokenId,address account,bytes32 node){(tokenId,account)=collection.revealAwakening(secret,recipient);node=names.bind(tokenId);}
    function cancelExpired() external onlyOwner {collection.cancelExpiredAwakening();}
    function refund(address payable recipient) external onlyOwner {if(recipient==address(0))revert Unauthorized();(bool ok,)=recipient.call{value:address(this).balance}("");if(!ok)revert RefundFailed();}
    receive() external payable {if(msg.sender!=address(collection))revert Unauthorized();}
}

contract NamedMintFactory {
    GenesisNames public immutable names;
    mapping(address=>address) public sessionOf;
    event SessionCreated(address indexed owner,address indexed session);
    constructor(GenesisNames names_){require(address(names_).code.length!=0);names=names_;}
    function createSession() external returns(address session){session=sessionOf[msg.sender];if(session==address(0)){session=address(new NamedMintSession(msg.sender,names));sessionOf[msg.sender]=session;emit SessionCreated(msg.sender,session);}}
}
