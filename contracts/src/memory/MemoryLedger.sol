// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IProtocolCollection} from "../protocol/ProtocolPrimitives.sol";

/// @notice Append-only PUBLIC storage of explicit public bytes OR client-encrypted bytes.
/// @dev This contract never receives a key. Deployment status belongs to release records.
/// A mode label does not prove the supplied bytes were correctly encrypted. Metadata leaks.
/// Personal signatures and NFT-account execution attribution are deliberately distinct.
contract MemoryLedger {
    uint256 public constant MAX_PAYLOAD_BYTES = 32768;
    IProtocolCollection public immutable collection;
    address public immutable installer;
    address public router;
    uint256 public count;
    mapping(uint256 => bytes32) public head;
    mapping(uint256 => mapping(address => bytes32)) public reflectionHead;
    mapping(uint256 => bytes32) public formRoot;
    struct Entry {
        uint256 identity;
        uint256 parent;
        address author; // actual personal msg.sender; zero for account-routed inscriptions
        address executor; // NFT account or personal writer, never a guessed human operator
        address custodianAtTime;
        uint64 blockNumber;
        uint64 timestamp;
        uint8 phase; // 0 memory, 1 before, 2 reflection
        uint8 mode; // 0 explicit public, 1 supplied encrypted bytes
        bool imprint;
        bytes32 plan;
        bytes32 commitment;
        bytes payload;
    }
    struct Fill {
        address input;
        address output;
        uint112 amountIn;
        uint112 amountOut;
        bytes32 executionDigest;
    }
    mapping(uint256 => Entry) private entries;
    mapping(uint256 => Fill) public fills;
    event Inscribed(uint256 indexed entry,uint256 indexed identity,address indexed executor,
        address author,address custodian,uint8 phase,uint8 mode,bytes32 commitment,bytes32 head);
    event FillBound(uint256 indexed entry,uint256 indexed identity,bytes32 indexed plan,
        address input,address output,uint112 amountIn,uint112 amountOut,bytes32 executionDigest);
    event FormTrace(uint256 indexed identity,bytes32 root,uint8 category,bytes32 evidence);
    event ReflectionBranched(uint256 indexed entry,uint256 indexed identity,address indexed author,bytes32 branchHead);
    error Unauthorized(); error InvalidRecord(); error StaleHead();
    constructor(address collection_) {
        if(collection_.code.length==0) revert InvalidRecord();
        collection=IProtocolCollection(collection_);installer=msg.sender;
    }
    /// @notice One-time dependency binding; no mutable adapter roster after installation.
    function installRouter(address r) external {
        if(msg.sender!=installer||router!=address(0)||r.code.length==0) revert Unauthorized();
        router=r;
    }
    function getEntry(uint256 id) external view returns(Entry memory) {
        if(id==0||id>count) revert InvalidRecord();return entries[id];
    }
    /// @notice A direct personal inscription, independent of NFT account spending permission.
    /// A former author can reflect after a sale without changing the owner's journal/body.
    /// expectedHead remains the current canonical head for API compatibility.
    /// Former-author entries chain into reflectionHead(identity,msg.sender) instead.
    function appendPersonal(uint256 identity,uint256 parent,uint8 mode,bool imprint,
        bytes32 expectedHead,bytes calldata payload) external returns(uint256 id)
    {
        address custodian=collection.ownerOf(identity);
        if(parent==0){if(msg.sender!=custodian) revert Unauthorized();}
        else {
            Entry storage old=entries[parent];
            if(old.identity!=identity||parent==0||
                (old.author!=address(0)?old.author!=msg.sender:old.custodianAtTime!=msg.sender)) revert Unauthorized();
        }
        id=_append(identity,parent,msg.sender,msg.sender,custodian,parent==0?0:2,mode,
            imprint&&msg.sender==custodian,bytes32(0),expectedHead,payload);
    }
    function beforeSwap(address account,uint256 identity,uint8 mode,bool imprint,
        bytes32 plan,bytes32 expectedHead,bytes calldata payload) external returns(uint256 id)
    {
        if(msg.sender!=router||router==address(0)||identity==0||collection.accountOf(identity)!=account||plan==bytes32(0)) revert Unauthorized();
        id=_append(identity,0,address(0),account,collection.ownerOf(identity),1,mode,imprint,plan,expectedHead,payload);
    }
    function bindFill(uint256 id,address input,address output,uint112 amountIn,uint112 amountOut) external {
        Entry storage n=entries[id];
        if(msg.sender!=router||router==address(0)||n.phase!=1||n.plan==bytes32(0)||fills[id].executionDigest!=bytes32(0)||amountIn==0||amountOut==0||input==output) revert InvalidRecord();
        if(collection.ownerOf(n.identity)!=n.custodianAtTime) revert StaleHead();
        bytes32 d=keccak256(abi.encode("IDFBI_FILL_1_7",block.chainid,address(this),id,n.plan,n.executor,input,output,amountIn,amountOut));
        fills[id]=Fill(input,output,amountIn,amountOut,d);
        head[n.identity]=keccak256(abi.encode(head[n.identity],id,d));
        _trace(n.identity,0,d);
        emit FillBound(id,n.identity,n.plan,input,output,amountIn,amountOut,d);
    }
    function _append(uint256 identity,uint256 parent,address author,address executor,
        address custodian,uint8 phase,uint8 mode,bool imprint,bytes32 plan,bytes32 expectedHead,
        bytes calldata payload) private returns(uint256 id)
    {
        if(mode>1||payload.length==0||payload.length>MAX_PAYLOAD_BYTES||block.number>type(uint64).max||block.timestamp>type(uint64).max) revert InvalidRecord();
        bool canonical = author == address(0) || author == custodian;
        bytes32 previous = canonical ? head[identity] : reflectionHead[identity][author];
        if(head[identity]!=expectedHead) revert StaleHead();
        id=++count;
        bytes32 d=keccak256(abi.encode("IDFBI_MEMORY_1_7",block.chainid,address(this),id,identity,parent,author,executor,custodian,phase,mode,imprint,plan,keccak256(payload)));
        entries[id]=Entry(identity,parent,author,executor,custodian,uint64(block.number),uint64(block.timestamp),phase,mode,imprint,plan,d,payload);
        bytes32 nextHead=keccak256(abi.encode(previous,id,d));
        if(canonical) head[identity]=nextHead;
        else {
            reflectionHead[identity][author]=nextHead;
            emit ReflectionBranched(id,identity,author,nextHead);
        }
        if(imprint)_trace(identity,5,d);
        emit Inscribed(id,identity,executor,author,custodian,phase,mode,d,head[identity]);
    }
    function _trace(uint256 identity,uint8 category,bytes32 evidence) private {
        bytes32 r=keccak256(abi.encode("IDFBI_EXPERIENCE_1_7",formRoot[identity],identity,category,evidence));
        formRoot[identity]=r;emit FormTrace(identity,r,category,evidence);
    }
}
