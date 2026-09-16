// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILaunchCollection { function accountOf(uint256) external view returns(address); }

/// @notice Append-only, enumerable launch provenance. Records are statements by their payer or explicitly authorized registrar.
/// @dev Registration never certifies an arbitrary mechanism's economics. Clients verify the recorded implementation separately.
contract LaunchRegistry {
    uint256 public constant VERSION = 1;
    uint256 public count;
    struct Descriptor {
        address payer; address collection; uint256 tokenId; address token;
        bytes32 mechanism; address target; uint256 mechanismId;
        address position; bytes32 poolId; bytes32 termsHash;
    }
    struct Record { Descriptor descriptor; address registrar; uint64 createdAt; uint64 createdBlock; }
    struct Link { bytes32 kind; address target; uint256 referenceId; address asset; address beneficiary; uint256 amount; bytes32 detail; }
    mapping(uint256=>Record) private records;
    mapping(bytes32=>uint256) public recordFor;
    mapping(uint256=>Link[]) private links;
    mapping(address=>uint256[]) private payerRecords;
    mapping(address=>uint256[]) private tokenRecords;
    struct Authorization { bool allowed; bytes32 context; }
    mapping(address=>mapping(address=>Authorization)) private authorizations;
    event RegistrarAuthorization(address indexed payer,address indexed registrar,bool allowed);
    event LaunchRegistered(uint256 indexed id,address indexed payer,address indexed token,address registrar,bytes32 mechanism,address target,uint256 mechanismId,bytes32 termsHash);
    event LaunchLinked(uint256 indexed id,uint256 indexed index,bytes32 indexed kind,address target,uint256 referenceId,address asset,address beneficiary,uint256 amount,bytes32 detail);
    error Unauthorized(); error InvalidRecord(); error Bounds();

    function authorizeRegistrar(address registrar,bool allowed) external {
        if(registrar==address(0)||registrar==msg.sender) revert InvalidRecord();
        authorizations[msg.sender][registrar]=Authorization(allowed,_context(msg.sender));
        emit RegistrarAuthorization(msg.sender,registrar,allowed);
    }
    function _context(address payer) private view returns(bytes32) {
        if(payer.code.length==0)return bytes32(0);
        (bool ownerOK,bytes memory owner)=payer.staticcall(abi.encodeWithSignature("currentOwner()"));
        (bool epochOK,bytes memory epoch)=payer.staticcall(abi.encodeWithSignature("sessionEpoch()"));
        return ownerOK&&epochOK&&owner.length==32&&epoch.length==32?keccak256(abi.encode(owner,epoch)):bytes32(0);
    }
    function authorizedRegistrar(address payer,address registrar) public view returns(bool){Authorization storage a=authorizations[payer][registrar];return a.allowed&&a.context==_context(payer);}
    function _authorized(address payer) private view {if(msg.sender!=payer&&!authorizedRegistrar(payer,msg.sender)) revert Unauthorized();}
    function identityOf(Descriptor calldata d) public view returns(bytes32){return keccak256(abi.encode(block.chainid,address(this),d.payer,d.token,d.mechanism,d.target,d.mechanismId));}
    function register(Descriptor calldata d,Link[] calldata initialLinks) external returns(uint256 id) {
        _authorized(d.payer);
        if(d.payer==address(0)||d.token.code.length==0||d.target.code.length==0||d.mechanism==bytes32(0)||d.termsHash==bytes32(0)||initialLinks.length>64) revert InvalidRecord();
        if(d.position!=address(0)&&d.position.code.length==0) revert InvalidRecord();
        if(d.collection==address(0)){if(d.tokenId!=0)revert InvalidRecord();}
        else if(d.collection.code.length==0||ILaunchCollection(d.collection).accountOf(d.tokenId)!=d.payer) revert InvalidRecord();
        bytes32 identity=identityOf(d);if(recordFor[identity]!=0)revert InvalidRecord();
        id=++count;recordFor[identity]=id;records[id]=Record(d,msg.sender,uint64(block.timestamp),uint64(block.number));
        payerRecords[d.payer].push(id);tokenRecords[d.token].push(id);
        emit LaunchRegistered(id,d.payer,d.token,msg.sender,d.mechanism,d.target,d.mechanismId,d.termsHash);
        for(uint256 i;i<initialLinks.length;i++)_link(id,initialLinks[i]);
    }
    function append(uint256 id,Link[] calldata additions) external {
        if(id==0||id>count)revert Bounds(); _authorized(records[id].descriptor.payer);
        if(additions.length==0||additions.length>64||links[id].length+additions.length>256)revert Bounds();
        for(uint256 i;i<additions.length;i++)_link(id,additions[i]);
    }
    function _link(uint256 id,Link calldata l) private {
        if(l.kind==bytes32(0))revert InvalidRecord();
        uint256 index=links[id].length;links[id].push(l);
        emit LaunchLinked(id,index,l.kind,l.target,l.referenceId,l.asset,l.beneficiary,l.amount,l.detail);
    }
    function get(uint256 id) external view returns(Record memory){if(id==0||id>count)revert Bounds();return records[id];}
    function linkCount(uint256 id) external view returns(uint256){return links[id].length;}
    function linkAt(uint256 id,uint256 index) external view returns(Link memory){return links[id][index];}
    function payerCount(address payer) external view returns(uint256){return payerRecords[payer].length;}
    function payerAt(address payer,uint256 index) external view returns(uint256){return payerRecords[payer][index];}
    function tokenCount(address token) external view returns(uint256){return tokenRecords[token].length;}
    function tokenAt(address token,uint256 index) external view returns(uint256){return tokenRecords[token][index];}
}
