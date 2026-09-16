// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {PrivacyKeys} from "./PrivacyKeys.sol";

/// @notice Small-group ciphertext transport with consent and complete membership-epoch key distribution.
/// @dev Custom sender-key protocol, NOT RFC9420 MLS. Addresses, timing and ciphertext remain public.
contract EpochGroupChat {
    PrivacyKeys public immutable keys;
    uint256 public roomCount;
    struct Room { address manager; uint64 epoch; uint32 count; bool dirty; bool closed; bytes32 keyCommitment; }
    mapping(uint256 => Room) public rooms;
    mapping(uint256 => mapping(address => bool)) public member;
    mapping(uint256 => mapping(address => uint64)) public invitations;
    mapping(uint256 => mapping(uint64 => mapping(address => bytes))) private _packages;
    mapping(uint256 => mapping(uint64 => mapping(address => uint64))) public packageGeneration;
    mapping(uint256 => mapping(uint64 => bytes32)) public epochCommitments;
    mapping(uint256 => address[]) private _epochMembers;
    mapping(uint256 => mapping(uint64 => mapping(address => uint64))) public nextSequence;
    struct Message { address sender; uint64 epoch; uint64 sequence; bytes ciphertext; }
    mapping(uint256 => Message[]) private _messages;
    event RoomCreated(uint256 indexed roomId,address indexed manager);
    event Membership(uint256 indexed roomId,address indexed identity,bool active);
    event Invited(uint256 indexed roomId,address indexed identity,uint64 deadline);
    event EpochCommitted(uint256 indexed roomId,uint64 indexed epoch,bytes32 keyCommitment);
    event Ciphertext(uint256 indexed roomId,uint256 indexed messageId,address indexed sender,uint64 epoch,uint64 sequence);
    error InvalidState();
    constructor(address keys_) { if(keys_.code.length == 0) revert InvalidState(); keys = PrivacyKeys(keys_); }
    modifier manager(uint256 id) { if(rooms[id].manager != msg.sender || rooms[id].closed) revert InvalidState(); _; }
    function create() external returns(uint256 id) {
        if(keys.generation(msg.sender) == 0) revert InvalidState();
        id = ++roomCount; rooms[id] = Room(msg.sender,0,1,true,false,0); member[id][msg.sender] = true;
        emit RoomCreated(id,msg.sender); emit Membership(id,msg.sender,true);
    }
    function invite(uint256 id,address identity,uint64 deadline) external manager(id) {
        if(identity == address(0) || member[id][identity] || deadline <= block.timestamp || deadline > block.timestamp + 7 days) revert InvalidState();
        invitations[id][identity] = deadline; emit Invited(id,identity,deadline);
    }
    function revokeInvite(uint256 id,address identity) external manager(id) { delete invitations[id][identity]; }
    function join(uint256 id) external {
        Room storage r = rooms[id];
        if(r.manager == address(0) || r.closed || member[id][msg.sender] || invitations[id][msg.sender] < block.timestamp || keys.generation(msg.sender) == 0 || r.count >= 32) revert InvalidState();
        delete invitations[id][msg.sender]; member[id][msg.sender] = true; ++r.count; r.dirty = true;
        emit Membership(id,msg.sender,true);
    }
    function remove(uint256 id,address identity) external manager(id) { _remove(id,identity); }
    function leave(uint256 id) external { _remove(id,msg.sender); }
    function _remove(uint256 id,address identity) private {
        Room storage r = rooms[id];
        if(!member[id][identity] || identity == r.manager) revert InvalidState();
        member[id][identity] = false; --r.count; r.dirty = true;
        emit Membership(id,identity,false);
    }
    /// @dev Sorted complete member list prevents omissions and duplicate key-package recipients.
    function rotate(uint256 id,uint64 expectedEpoch,address[] calldata identities,uint64[] calldata generations,bytes[] calldata packages,bytes32 commitment) external manager(id) {
        Room storage r = rooms[id];
        if(expectedEpoch != r.epoch || identities.length != r.count || generations.length != r.count || packages.length != r.count || commitment == 0 || commitment == r.keyCommitment) revert InvalidState();
        uint64 epoch = ++r.epoch; address previous;
        delete _epochMembers[id];
        for(uint256 i; i < identities.length; ++i) {
            address who = identities[i];
            if(who <= previous || !member[id][who] || generations[i] == 0 || keys.generation(who) != generations[i] || packages[i].length < 32 || packages[i].length > 2048) revert InvalidState();
            previous = who; _packages[id][epoch][who] = packages[i]; packageGeneration[id][epoch][who] = generations[i];
            _epochMembers[id].push(who);
        }
        r.dirty = false; r.keyCommitment = commitment; epochCommitments[id][epoch] = commitment; emit EpochCommitted(id,epoch,commitment);
    }
    function post(uint256 id,uint64 epoch,uint64 sequence,bytes calldata ciphertext) external {
        Room storage r = rooms[id];
        if(r.closed || r.dirty || !member[id][msg.sender] || epoch == 0 || epoch != r.epoch || sequence != nextSequence[id][epoch][msg.sender] ||
            packageGeneration[id][epoch][msg.sender] != keys.generation(msg.sender) || ciphertext.length < 32 || ciphertext.length > 8192) revert InvalidState();
        // Replacing any registered member key freezes the whole epoch until the manager rekeys.
        for(uint256 i; i < _epochMembers[id].length; ++i) {
            address who = _epochMembers[id][i];
            if(packageGeneration[id][epoch][who] != keys.generation(who)) revert InvalidState();
        }
        ++nextSequence[id][epoch][msg.sender]; uint256 mid = _messages[id].length;
        _messages[id].push(Message(msg.sender,epoch,sequence,ciphertext)); emit Ciphertext(id,mid,msg.sender,epoch,sequence);
    }
    function close(uint256 id) external manager(id) { rooms[id].closed = true; }
    function packageOf(uint256 id,uint64 epoch,address identity) external view returns(bytes memory) { return _packages[id][epoch][identity]; }
    function messageCount(uint256 id) external view returns(uint256) { return _messages[id].length; }
    function messageOf(uint256 id,uint256 index) external view returns(Message memory) { return _messages[id][index]; }
}
