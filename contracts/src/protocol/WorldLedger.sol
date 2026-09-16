// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolGuard, IProtocolCollection} from "./ProtocolPrimitives.sol";

/// @notice Entire text, channels, membership, preferences and protocol activity live in EVM state.
/// @dev Public-readable, including member-gated channels. Removal changes FUTURE write access.
///      There is intentionally no claim of encryption, global erasure or Sybil resistance.
contract WorldLedger is ProtocolGuard {
    uint256 public constant MAX_MESSAGE_BYTES=1024;
    uint256 public constant MAX_PAGE=64;
    uint256 public constant WORLD=1;
    address public immutable collection;
    address private immutable configurator;
    address public market;
    address public vault;
    address public launchpad;
    address public estateMarket;
    struct Attribution {address custodian;uint256 epoch;}
    mapping(uint256=>Attribution) public messageAttribution;
    mapping(uint256=>Attribution) public activityAttribution;
    mapping(uint256=>uint256) public messageReceipt;
    mapping(uint256=>mapping(address=>bool)) public accepted;
    mapping(uint256=>mapping(address=>uint256)) public moderatorEpoch;
    mapping(uint256=>mapping(address=>uint256)) public invitationEpoch;
    mapping(uint256=>mapping(address=>uint256)) public invitationRecipientEpoch;
    mapping(uint256=>mapping(address=>uint256)) public moderatorRecipientEpoch;
    bool public isSealed;
    uint256 public roomCount=1;
    uint256 public messageCount;
    uint256 public activityCount;
    struct Room {address admin; address subject; uint32 slowMode; bool membersOnly; string name; string topic; uint24 color;}
    struct Message {address author; uint256 identity; uint256 room; uint64 time; uint256 replyTo; bytes body;}
    struct Activity {uint8 kind; address actor; uint256 identity; address asset; uint256 amount; uint256 referenceId; bytes32 detail; uint64 time; uint64 blockNumber;}
    struct Profile {string aliasName; uint24 color; uint32 flags;}
    mapping(uint256=>Room) private rooms;
    mapping(uint256=>Message) private messages;
    mapping(uint256=>Activity) private activities;
    mapping(address=>Profile) private profiles;
    mapping(uint256=>mapping(address=>bool)) public member;
    mapping(uint256=>mapping(address=>bool)) public moderator;
    mapping(uint256=>mapping(address=>bool)) public banned;
    mapping(uint256=>mapping(address=>uint64)) public lastPost;
    mapping(uint256=>uint256[]) private roomMessages;
    mapping(uint256=>mapping(uint8=>uint256)) public reactionCount;
    mapping(uint256=>mapping(uint8=>mapping(address=>bool))) public reacted;
    mapping(address=>mapping(address=>bool)) public following;
    mapping(address=>mapping(address=>bool)) public blocked;
    mapping(uint256=>bool) public hidden;
    event MessagePosted(uint256 indexed id,uint256 indexed room,address indexed author,uint256 identity,uint256 replyTo,bytes body);
    event ActivityRecorded(uint256 indexed id,uint8 indexed kind,address indexed actor,uint256 identity,address asset,uint256 amount,uint256 referenceId,bytes32 detail);
    event RoomCreated(uint256 indexed id,address indexed admin,address indexed subject,string name);
    event MemberChanged(uint256 indexed room,address indexed who,bool allowed,bool banned);
    event ModeratorChanged(uint256 indexed room,address indexed who,bool allowed);
    event RoomConfigured(uint256 indexed room);
    event ProfileChanged(address indexed author,string aliasName,uint24 color,uint32 flags);
    event ViewChanged(address indexed viewer,address indexed subject,bool followed,bool blocked);
    event ReactionChanged(uint256 indexed messageId,uint8 indexed reaction,address indexed actor,bool active);
    event MessageHidden(uint256 indexed messageId,bool value);
    event ProtocolSealed(address market,address vault,address launchpad);
    error Limit(); error MissingRoom(); error SlowMode(); error InvalidMessage(); error UntrustedActivity();
    constructor(address collection_) {
        require(collection_.code.length!=0,"COLLECTION_REQUIRED"); collection=collection_; configurator=msg.sender;
        rooms[WORLD]=Room(address(0),address(0),3,false,"World","One shared sky. Public, permanent messages.",0x8af1ff);
    }
    function version() external pure returns(bytes32){return keccak256("idfbi/constellation/1.4");}
    function configureEstateMarket(address estate_) external {
        if(msg.sender!=configurator||isSealed||estateMarket!=address(0)||estate_.code.length==0)revert Unauthorized();estateMarket=estate_;
    }
    /// @notice One-time installation. No setters survive sealing. Clients MUST require sealed=true.
    function sealModules(address market_,address vault_,address launchpad_) external {
        if(msg.sender!=configurator || isSealed) revert Unauthorized();
        if(market_.code.length==0 || vault_.code.length==0 || launchpad_.code.length==0 || market_==vault_ || market_==launchpad_ || vault_==launchpad_) revert Unauthorized();
        market=market_; vault=vault_; launchpad=launchpad_; isSealed=true;
        emit ProtocolSealed(market_,vault_,launchpad_);
    }
    function record(uint8 kind,address actor,uint256 identity,address asset,uint256 amount,uint256 refId,bytes32 detail) external {
        if(!isSealed) revert UntrustedActivity();
        // 1 launch / 2 contribute / 3 settled / 4 sale claim/refund, 5 swap, 6 lock / 7 release.
        if(!((msg.sender==launchpad && kind>=1 && kind<=4)||(msg.sender==market && kind==5)||(msg.sender==vault && (kind==6||kind==7))||(msg.sender==estateMarket && kind>=8 && kind<=10))) revert UntrustedActivity();
        _identity(collection,actor,identity);
        uint256 id=++activityCount;
        activities[id]=Activity(kind,actor,identity,asset,amount,refId,detail,uint64(block.timestamp),uint64(block.number));
        activityAttribution[id]=_attribution(actor,identity);
        emit ActivityRecorded(id,kind,actor,identity,asset,amount,refId,detail);
    }
    function createLaunchRoom(address creator,address token,string calldata title) external returns(uint256 id){
        if(!isSealed || msg.sender!=launchpad) revert Unauthorized();
        id=_newRoom(creator,token,title,"Token launch room. Activity is recorded by the protocol.",false,3,0xffc787);
    }
    function createRoom(string calldata name,string calldata topic,bool gated,uint32 slow,uint24 color,uint256 identity) external returns(uint256){
        _identity(collection,msg.sender,identity); return _newRoom(msg.sender,address(0),name,topic,gated,slow,color);
    }
    function _newRoom(address admin,address subject,string memory name,string memory topic,bool gated,uint32 slow,uint24 color) private returns(uint256 id){
        if(bytes(name).length==0 || bytes(name).length>48 || bytes(topic).length>256 || slow>3600) revert Limit();
        id=++roomCount; rooms[id]=Room(admin,subject,slow,gated,name,topic,color); member[id][admin]=true;accepted[id][admin]=true;invitationEpoch[id][admin]=_epoch(admin);invitationRecipientEpoch[id][admin]=_epoch(admin);
        emit RoomCreated(id,admin,subject,name);
    }
    function configureRoom(uint256 id,string calldata name,string calldata topic,bool gated,uint32 slow,uint24 color) external {
        Room storage r=rooms[id]; if(r.admin!=msg.sender || id==WORLD) revert Unauthorized();
        if(bytes(name).length==0 || bytes(name).length>48 || bytes(topic).length>256 || slow>3600) revert Limit();
        r.name=name;r.topic=topic;r.membersOnly=gated;r.slowMode=slow;r.color=color; emit RoomConfigured(id);
    }
    function setMember(uint256 id,address who,bool allowed,bool ban) external {
        Room storage r=rooms[id]; if(id==WORLD || r.admin==address(0) || (msg.sender!=r.admin && !moderatorActive(id,msg.sender)) || who==address(0) || who==r.admin) revert Unauthorized();
        // A moderator cannot ban another moderator or change the admin's authority.
        if(msg.sender!=r.admin && moderatorActive(id,who)) revert Unauthorized();
        if(allowed && ban) revert Unauthorized();
        member[id][who]=allowed; banned[id][who]=ban;
        // Every new offer requires consent from the current recipient custodian.
        if(allowed){invitationEpoch[id][who]=_epoch(r.admin);invitationRecipientEpoch[id][who]=_epoch(who);accepted[id][who]=false;}
        if(!allowed){moderator[id][who]=false;accepted[id][who]=false;} emit MemberChanged(id,who,allowed,ban);
    }
    function setModerator(uint256 id,address who,bool allowed) external {
        if(id==WORLD || rooms[id].admin!=msg.sender || who==address(0) || who==msg.sender) revert Unauthorized();
        moderator[id][who]=allowed;moderatorEpoch[id][who]=_epoch(rooms[id].admin);
        moderatorRecipientEpoch[id][who]=_epoch(who);
        if(allowed){member[id][who]=true;banned[id][who]=false;accepted[id][who]=false;invitationEpoch[id][who]=_epoch(rooms[id].admin);invitationRecipientEpoch[id][who]=_epoch(who);}
        emit ModeratorChanged(id,who,allowed);
    }
    function post(uint256 room,uint256 replyTo,bytes calldata body,uint256 identity) public returns(uint256 id){
        _identity(collection,msg.sender,identity); Room storage r=rooms[room];
        if(room==0||room>roomCount) revert MissingRoom();
        if(banned[room][msg.sender] || (r.membersOnly && !memberActive(room,msg.sender) && !moderatorActive(room,msg.sender) && msg.sender!=r.admin)) revert Unauthorized();
        if(body.length==0||body.length>MAX_MESSAGE_BYTES) revert InvalidMessage();
        if(replyTo!=0 && messages[replyTo].room!=room) revert InvalidMessage();
        if(lastPost[room][msg.sender]!=0 && block.timestamp<uint256(lastPost[room][msg.sender])+r.slowMode) revert SlowMode();
        lastPost[room][msg.sender]=uint64(block.timestamp); id=++messageCount;
        messages[id]=Message(msg.sender,identity,room,uint64(block.timestamp),replyTo,body); roomMessages[room].push(id);
        messageAttribution[id]=_attribution(msg.sender,identity);
        emit MessagePosted(id,room,msg.sender,identity,replyTo,body);
    }
    function react(uint256 id,uint8 emoji,bool active) external {
        if(id==0||id>messageCount||emoji>5) revert InvalidMessage();
        Message storage m=messages[id]; Room storage r=rooms[m.room];
        if(banned[m.room][msg.sender] || (r.membersOnly && !memberActive(m.room,msg.sender) && !moderatorActive(m.room,msg.sender) && r.admin!=msg.sender)) revert Unauthorized();
        if(reacted[id][emoji][msg.sender]==active) revert InvalidMessage();
        reacted[id][emoji][msg.sender]=active;
        if(active) ++reactionCount[id][emoji]; else --reactionCount[id][emoji];
        emit ReactionChanged(id,emoji,msg.sender,active);
    }
    function setHidden(uint256 id,bool value) external {
        Message storage m=messages[id]; if(id==0||id>messageCount) revert InvalidMessage();
        // Hiding is a presentation flag, never deletion of bytes. World has no global moderator.
        if(msg.sender!=m.author && !(m.room!=WORLD && (rooms[m.room].admin==msg.sender||moderatorActive(m.room,msg.sender)))) revert Unauthorized();
        hidden[id]=value; emit MessageHidden(id,value);
    }

    /// @notice Invitations are write-access offers, not forced membership or private reading.
    function acceptInvitation(uint256 room,bool value) external {
        if(room==WORLD||room==0||room>roomCount||!member[room][msg.sender]||banned[room][msg.sender]||invitationEpoch[room][msg.sender]!=_epoch(rooms[room].admin)||invitationRecipientEpoch[room][msg.sender]!=_epoch(msg.sender))revert Unauthorized();
        accepted[room][msg.sender]=value;
    }
    function moderatorActive(uint256 room,address who) public view returns(bool){
        return moderator[room][who]&&memberActive(room,who)&&moderatorEpoch[room][who]==_epoch(rooms[room].admin)&&moderatorRecipientEpoch[room][who]==_epoch(who);
    }
    /// @notice Write membership belongs to consenting custodians, not future NFT buyers.
    function memberActive(uint256 room,address who) public view returns(bool){
        return member[room][who]&&accepted[room][who]&&!banned[room][who]&&invitationEpoch[room][who]==_epoch(rooms[room].admin)&&invitationRecipientEpoch[room][who]==_epoch(who);
    }
    function postWithReceipt(uint256 room,uint256 replyTo,bytes calldata body,uint256 identity,uint256 activityId) external returns(uint256 id){
        if(activityId==0||activityId>activityCount)revert InvalidMessage();id=post(room,replyTo,body,identity);messageReceipt[id]=activityId;
    }
    function _epoch(address actor) private view returns(uint256 epoch){
        if(actor.code.length==0)return 0;(bool ok,bytes memory data)=actor.staticcall(abi.encodeWithSignature("sessionEpoch()"));
        if(ok&&data.length==32)epoch=abi.decode(data,(uint256));
    }
    function _attribution(address actor,uint256 identity) private view returns(Attribution memory){
        return Attribution(identity==0?actor:IProtocolCollection(collection).ownerOf(identity),identity==0?0:_epoch(actor));
    }
    function setProfile(string calldata aliasName,uint24 color,uint32 flags,uint256 identity) external {
        _identity(collection,msg.sender,identity); if(bytes(aliasName).length>32) revert Limit();
        profiles[msg.sender]=Profile(aliasName,color,flags); emit ProfileChanged(msg.sender,aliasName,color,flags);
    }
    function setView(address who,bool follow,bool blockUser) external {
        if(who==address(0)||who==msg.sender) revert Unauthorized();
        following[msg.sender][who]=follow; blocked[msg.sender][who]=blockUser;
        emit ViewChanged(msg.sender,who,follow,blockUser);
    }
    function profileOf(address actor) external view returns(string memory,uint24,uint32){Profile storage p=profiles[actor];return(p.aliasName,p.color,p.flags);}
    function roomInfo(uint256 id) external view returns(address,address,uint32,bool,uint24,uint256){Room storage r=rooms[id];return(r.admin,r.subject,r.slowMode,r.membersOnly,r.color,roomMessages[id].length);}
    function roomText(uint256 id) external view returns(string memory,string memory){return(rooms[id].name,rooms[id].topic);}
    function messageAt(uint256 id) external view returns(address,uint256,uint256,uint64,uint256,bytes memory,bool){Message storage m=messages[id];return(m.author,m.identity,m.room,m.time,m.replyTo,m.body,hidden[id]);}
    function roomMessageId(uint256 room,uint256 index) external view returns(uint256){return roomMessages[room][index];}
    function activityAt(uint256 id) external view returns(uint8,address,uint256,address,uint256,uint256,bytes32,uint64,uint64){Activity storage a=activities[id];return(a.kind,a.actor,a.identity,a.asset,a.amount,a.referenceId,a.detail,a.time,a.blockNumber);}
}
