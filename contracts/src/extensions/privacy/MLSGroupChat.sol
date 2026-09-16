// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Ordered onchain delivery for RFC 9420 messages. MLS validity is checked by recipients.
/// @dev Wallets authenticate key registration, invitations and public membership. Ciphertexts,
///      membership, timing and lengths remain public. No contract decrypts or verifies MLS proofs.
contract MLSGroupChat {
    struct Key { uint64 generation; bool consumed; bytes signatureKey; bytes package; }
    struct Group { address manager; address proposedManager; uint64 epoch; bool needsCommit; bool closed; bytes32 transcript; }
    struct Packet { address sender; uint64 epoch; uint8 kind; bytes body; bytes welcome; address[] roster; bytes32[] credentials; bytes32 transcript; }
    mapping(address => Key) private _keys;
    mapping(address => mapping(bytes32 => bool)) public authenticatedSignature;
    mapping(bytes32 => Group) public groups;
    mapping(bytes32 => mapping(address => bool)) public member;
    mapping(bytes32 => mapping(address => bytes32)) public groupSignature;
    mapping(bytes32 => mapping(address => bool)) public accepted;
    mapping(bytes32 => mapping(address => uint64)) public invitation;
    mapping(bytes32 => address[]) private _rosters;
    mapping(bytes32 => Packet[]) private _packets;
    mapping(bytes32 => bytes32) public migrationTarget;
    bytes32[] private _groupIds;
    event KeyRegistered(address indexed wallet,uint64 generation,bytes32 packageHash);
    event GroupCreated(bytes32 indexed id,address indexed manager);
    event Invitation(bytes32 indexed id,address indexed wallet,uint64 deadline);
    event Consent(bytes32 indexed id,address indexed wallet,bool accepted);
    event Delivered(bytes32 indexed id,uint256 indexed index,address indexed sender,uint8 kind,uint64 epoch);
    event ManagerProposed(bytes32 indexed id,address indexed candidate);
    event ManagerAccepted(bytes32 indexed id,address indexed previous,address indexed manager);
    event Migration(address indexed legacyChat,uint256 indexed legacyRoom,bytes32 indexed target);
    error InvalidState();
    modifier manager(bytes32 id){if(groups[id].manager!=msg.sender||groups[id].closed)revert InvalidState();_;}
    function registerKey(bytes calldata signatureKey,bytes calldata keyPackage) external {
        if(signatureKey.length!=33&&signatureKey.length!=65)revert InvalidState();
        if(keyPackage.length<128||keyPackage.length>4096)revert InvalidState();
        Key storage k=_keys[msg.sender]; ++k.generation;k.consumed=false;k.signatureKey=signatureKey;k.package=keyPackage;
        authenticatedSignature[msg.sender][keccak256(signatureKey)]=true;
        emit KeyRegistered(msg.sender,k.generation,keccak256(keyPackage));
    }
    function keyOf(address who) external view returns(Key memory){return _keys[who];}
    function create(bytes32 id,bytes32 transcript) external {
        Key storage k=_keys[msg.sender];
        if(id==0||transcript==0||groups[id].manager!=address(0)||k.generation==0||k.consumed)revert InvalidState();
        k.consumed=true;groups[id]=Group(msg.sender,address(0),0,false,false,transcript);groupSignature[id][msg.sender]=keccak256(k.signatureKey);member[id][msg.sender]=true;accepted[id][msg.sender]=true;
        _rosters[id].push(msg.sender);_groupIds.push(id);emit GroupCreated(id,msg.sender);
    }
    function invite(bytes32 id,address who,uint64 deadline) external manager(id){
        if(who==address(0)||member[id][who]||deadline<=block.timestamp||deadline>block.timestamp+7 days)revert InvalidState();
        invitation[id][who]=deadline;emit Invitation(id,who,deadline);
    }
    function accept(bytes32 id) external {
        if(groups[id].closed||invitation[id][msg.sender]<block.timestamp||_keys[msg.sender].generation==0||_keys[msg.sender].consumed)revert InvalidState();
        accepted[id][msg.sender]=true;delete invitation[id][msg.sender];emit Consent(id,msg.sender,true);
    }
    function revoke(bytes32 id,address who) external manager(id){delete invitation[id][who];if(!member[id][who])accepted[id][who]=false;}
    function leave(bytes32 id) external {
        if(!member[id][msg.sender]||groups[id].manager==msg.sender)revert InvalidState();
        accepted[id][msg.sender]=false;groups[id].needsCommit=true;emit Consent(id,msg.sender,false);
    }
    /// @notice Commit updates the public roster atomically. Added members must have accepted and
    /// have an unused current KeyPackage. Any member may refresh its own MLS path without changing roster.
    function commit(bytes32 id,uint64 epoch,uint256 expectedIndex,address[] calldata roster,uint64[] calldata generations,bytes calldata body,bytes calldata welcome,bytes32 transcript) external {
        Group storage g=groups[id];
        if(!member[id][msg.sender]||!accepted[id][msg.sender]||g.closed||epoch!=g.epoch||expectedIndex!=_packets[id].length||body.length<32||body.length>32768||welcome.length>32768||transcript==0||transcript==g.transcript||roster.length==0||roster.length>32||roster.length!=generations.length)revert InvalidState();
        bool changed=keccak256(abi.encode(roster))!=keccak256(abi.encode(_rosters[id]));
        if((changed||g.needsCommit)&&msg.sender!=g.manager)revert InvalidState();
        address previous;bool hasManager;
        for(uint256 i;i<roster.length;++i){address who=roster[i];if(who<=previous||!accepted[id][who])revert InvalidState();previous=who;if(who==g.manager)hasManager=true;
            if(!member[id][who]){Key storage k=_keys[who];if(k.consumed||k.generation!=generations[i]||k.generation==0||welcome.length==0)revert InvalidState();k.consumed=true;groupSignature[id][who]=keccak256(k.signatureKey);}
        }
        if(!hasManager)revert InvalidState();
        address[] memory old=_rosters[id];for(uint256 i;i<old.length;++i)member[id][old[i]]=false;
        delete _rosters[id];for(uint256 i;i<roster.length;++i){member[id][roster[i]]=true;_rosters[id].push(roster[i]);}
        for(uint256 i;i<old.length;++i)if(!member[id][old[i]])accepted[id][old[i]]=false;
        bytes32[] memory credentials=new bytes32[](roster.length);for(uint256 i;i<roster.length;++i)credentials[i]=groupSignature[id][roster[i]];
        _packets[id].push(Packet(msg.sender,epoch,1,body,welcome,roster,credentials,transcript));g.epoch=epoch+1;g.transcript=transcript;g.needsCommit=false;
        emit Delivered(id,expectedIndex,msg.sender,1,epoch);
    }
    function post(bytes32 id,uint64 epoch,uint256 expectedIndex,bytes calldata body) external {
        Group storage g=groups[id];if(g.closed||g.needsCommit||!member[id][msg.sender]||!accepted[id][msg.sender]||epoch!=g.epoch||expectedIndex!=_packets[id].length||body.length<32||body.length>16384)revert InvalidState();
        address[] memory empty;bytes32[] memory credentials;_packets[id].push(Packet(msg.sender,epoch,2,body,"",empty,credentials,g.transcript));emit Delivered(id,expectedIndex,msg.sender,2,epoch);
    }
    function proposeManager(bytes32 id,address candidate) external manager(id){if(!member[id][candidate]||!accepted[id][candidate]||candidate==msg.sender)revert InvalidState();groups[id].proposedManager=candidate;emit ManagerProposed(id,candidate);}
    function cancelManager(bytes32 id) external manager(id){groups[id].proposedManager=address(0);}
    function acceptManager(bytes32 id) external {
        Group storage g=groups[id];if(g.closed||g.proposedManager!=msg.sender||!member[id][msg.sender]||!accepted[id][msg.sender])revert InvalidState();
        address old=g.manager;g.manager=msg.sender;g.proposedManager=address(0);g.needsCommit=true;emit ManagerAccepted(id,old,msg.sender);
    }
    /// @notice The legacy manager explicitly authenticates a fresh group migration. Existing history
    /// and keys stay in the legacy group. Every new-group recipient still consents and receives a new KeyPackage.
    function announceMigration(address legacyChat,uint256 legacyRoom,bytes32 target) external manager(target){
        (bool ok,bytes memory data)=legacyChat.staticcall(abi.encodeWithSignature("rooms(uint256)",legacyRoom));
        if(!ok||data.length<32||abi.decode(data,(address))!=msg.sender)revert InvalidState();
        bytes32 source=keccak256(abi.encode(legacyChat,legacyRoom));if(migrationTarget[source]!=0)revert InvalidState();migrationTarget[source]=target;emit Migration(legacyChat,legacyRoom,target);
    }
    function close(bytes32 id) external manager(id){groups[id].closed=true;}
    function rosterOf(bytes32 id) external view returns(address[] memory){return _rosters[id];}
    function packetCount(bytes32 id) external view returns(uint256){return _packets[id].length;}
    function packetOf(bytes32 id,uint256 index) external view returns(Packet memory){return _packets[id][index];}
    function groupCount() external view returns(uint256){return _groupIds.length;}
    function groupAt(uint256 index) external view returns(bytes32){return _groupIds[index];}
}
