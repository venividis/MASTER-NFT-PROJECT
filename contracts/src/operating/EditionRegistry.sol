// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IProtocolCollection} from '../protocol/ProtocolPrimitives.sol';
import {IOperatingAccount} from './OperatingInterfaces.sol';
/// @notice Public, immutable content leaves and ordered editions. This contract cannot execute them.
/// @dev A declared interface or simulation hash is metadata, NOT a conformance or safety proof.
/// There is no arbitrary bytecode deployment or automatic spending grant.
contract EditionRegistry {
    IProtocolCollection public immutable collection;
    mapping(bytes32=>bytes) private leaves;
    struct Edition {address publisher;address custodian;uint256 identity;uint64 epoch;uint64 publishedAt;bytes32 contentHash;bytes32 declaredInterface;bytes32 parent;string title;bytes32[] leaves;}
    mapping(bytes32=>Edition) private editions;
    mapping(address=>bytes32) public accountCommitment;
    event Inscribed(bytes32 indexed leaf,uint256 length);
    event Published(bytes32 indexed edition,address indexed publisher,uint256 indexed identity,bytes32 contentHash,bytes32 parent);
    error InvalidEdition();
    constructor(address collection_){if(collection_.code.length==0)revert InvalidEdition();collection=IProtocolCollection(collection_);}
    function inscribe(bytes calldata data) external returns(bytes32 id){if(data.length==0||data.length>16384)revert InvalidEdition();id=keccak256(data);if(leaves[id].length==0){leaves[id]=data;emit Inscribed(id,data.length);}}
    function publish(uint256 identity,string calldata title,bytes32[] calldata orderedLeaves,bytes32 declaredInterface,bytes32 parent) external returns(bytes32 id){
        if(bytes(title).length==0||bytes(title).length>96||orderedLeaves.length==0||orderedLeaves.length>16||declaredInterface==bytes32(0))revert InvalidEdition();
        address custodian=msg.sender;uint64 epoch;
        if(identity!=0){if(collection.accountOf(identity)!=msg.sender)revert InvalidEdition();custodian=IOperatingAccount(msg.sender).currentOwner();epoch=IOperatingAccount(msg.sender).sessionEpoch();}
        if(parent!=bytes32(0)&&editions[parent].publisher==address(0))revert InvalidEdition();
        bytes32 contentHash=keccak256(abi.encode('IDFBI_EDITION_CONTENT_1_6',declaredInterface,orderedLeaves));
        for(uint256 i;i<orderedLeaves.length;++i)if(leaves[orderedLeaves[i]].length==0)revert InvalidEdition();
        id=keccak256(abi.encode(block.chainid,address(this),msg.sender,identity,custodian,epoch,contentHash,parent,keccak256(bytes(title))));
        if(editions[id].publisher!=address(0))revert InvalidEdition();
        Edition storage e=editions[id];e.publisher=msg.sender;e.custodian=custodian;e.identity=identity;e.epoch=epoch;e.publishedAt=uint64(block.timestamp);e.contentHash=contentHash;e.declaredInterface=declaredInterface;e.parent=parent;e.title=title;
        for(uint256 i;i<orderedLeaves.length;++i)e.leaves.push(orderedLeaves[i]);
        accountCommitment[msg.sender]=keccak256(abi.encode(accountCommitment[msg.sender],id));
        emit Published(id,msg.sender,identity,contentHash,parent);
    }
    function editionCommitment(bytes32 id) external view returns(bytes32){return editions[id].contentHash;}
    function leaf(bytes32 id) external view returns(bytes memory){return leaves[id];}
    function edition(bytes32 id) external view returns(Edition memory){return editions[id];}
}
