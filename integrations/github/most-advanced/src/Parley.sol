// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISpeaker {
    function ownerOf(uint256 id) external view returns (address);
    function account(uint256 id) external view returns (address);
    function totalSupply() external view returns (uint256);
}

/*═══════════════════════════════════════════════════════════════════════════

  PARLEY — the tokens talk to each other

  Every other messaging system for NFTs is a server with a wallet button on
  it. The message goes to a database, the database decides who may read it,
  and the token is a login. Turn the database off and the conversation was
  never there.

  This one has no database. A message is a log, the log is the archive, and
  the archive is wherever the chain is. There are three kinds of room:

      the commons     one room, key 0, every token in the collection
      a group         founded by a token, joined by invitation or open door
      a pair          two tokens, derived from their two ids, never founded

  ── the part that is actually hard ──

  Logs are cheap to write and famously miserable to read. `eth_getLogs`
  over a range wide enough to hold a conversation is the request every
  public endpoint rate-limits first, and the usual answer is an indexer:
  a server, which is the thing this collection exists not to need.

  So every message carries a pointer to the block of the message before it,
  and the room stores the block of the most recent one. A client reads
  `last`, asks for exactly that one block, gets the message and the pointer
  to the block before, and walks. Fifty messages is fifty single-block
  queries — the narrowest request `eth_getLogs` accepts — and no range scan
  at any point. The chain is the index. It costs one `SSTORE` to a warm
  slot per message to make it so.

  The same back-link runs through a token: `lastSpoke[id]` and `prevFrom`
  in the event, so "everything this token has ever said, anywhere" is the
  same walk down a different chain.

  ── who is allowed to be a token ──

  The owner, and the token's own ERC-6551 account. Not the renter. Leasing
  the instrument buys its use for a while; it does not buy the right to
  speak in its name, and a reputation is not a thing you can hand back at
  the end of the day. The bound account is included because it is the token
  acting for itself — its session keys are the owner's own delegation, made
  narrowly and revocably, which is the whole point of that account.

  ── what is public, and what is not ──

  Everything here is a log on a public chain. The commons is public because
  it is a commons. A group is public to read and closed to write. A pair is
  addressed, and addressed is not the same as private: anyone who knows two
  token ids can derive their room key and read every byte of it.

  That is why `announce` exists. A token may publish a P-256 point, and a
  client that finds one on both sides of a pair seals the body with ECDH
  and AES-GCM before it ever reaches this contract. Then the log holds
  ciphertext, `kind` says so, and this contract — which cannot read it
  either — is exactly as trustworthy as it needs to be, which is not at
  all.

═══════════════════════════════════════════════════════════════════════════*/
contract Parley {
    ISpeaker public immutable HUB;

    /*───────────────────── shape ─────────────────────*/

    /// @notice The one room every token is already in.
    uint256 public constant COMMONS = 0;

    /// @dev Long enough for something worth saying, short enough that a log
    ///      is a log. A client that wants to send an essay can send four.
    uint256 public constant MAX_BODY = 1024;
    uint256 public constant MAX_NAME = 48;

    uint8 public constant PLAIN  = 0;   // UTF-8, readable by anyone
    uint8 public constant SEALED = 1;   // nonce ++ AES-GCM ciphertext

    uint8 public constant IS_COMMONS = 0;
    uint8 public constant IS_GROUP   = 1;
    uint8 public constant IS_PAIR    = 2;

    struct Room {
        uint64  last;     // block of the newest message here, 0 while silent
        uint64  count;    // messages ever said here
        uint64  opened;   // block the room came into being
        uint32  members;  // groups only; the commons is everyone
        uint8   kind;     // IS_COMMONS · IS_GROUP · IS_PAIR
        bool    open;     // a group anyone may walk into
        uint256 steward;  // the token that founded it
        uint256 index;    // groups are numbered, so they have short URLs
    }

    mapping(uint256 => Room) private _room;
    mapping(uint256 => string) public nameOf;

    mapping(uint256 => mapping(uint256 => bool)) public inRoom;
    mapping(uint256 => mapping(uint256 => bool)) public invited;

    /// @dev Every room a token has ever entered, appended once. Leaving does
    ///      not remove the entry — `inRoom` is the authority on membership
    ///      and this is only the list of places worth asking about. Nobody
    ///      but the token itself can make it longer, which is the reason
    ///      `invite` records permission and `join` is the token's own call:
    ///      an array a stranger can grow is an array a stranger can fill.
    mapping(uint256 => uint256[]) private _seen;

    mapping(uint256 => uint64) public lastSpoke;

    /// @notice How many groups have ever been founded. Also the index the
    ///         next one will take.
    uint256 public groups;

    /// @notice A token's sealing key: an uncompressed P-256 public point.
    ///         Zero means the token has not published one and cannot be
    ///         written to in confidence.
    mapping(uint256 => bytes32) public sealX;
    mapping(uint256 => bytes32) public sealY;

    /*───────────────────── what happened ─────────────────────*/

    event Said(
        uint256 indexed room,
        uint256 indexed from,
        uint64 prev,
        uint64 prevFrom,
        uint64 seq,
        uint8 kind,
        bytes body
    );
    event Founded(uint256 indexed room, uint256 indexed by, uint256 index, bool open, string name);
    event Invited(uint256 indexed room, uint256 indexed token, uint256 by);
    event Entered(uint256 indexed room, uint256 indexed token);
    event Departed(uint256 indexed room, uint256 indexed token);
    event Announced(uint256 indexed token, bytes32 x, bytes32 y);

    error NotYours();
    error NoSuchToken();
    error NoSuchRoom();
    error NotAMember();
    error NotTheSteward();
    error NotInvited();
    error AlreadyIn();
    error BadBody();
    error BadKind();
    error BadName();
    error TalkingToYourself();
    error UseWhisper();

    constructor(ISpeaker hub) {
        HUB = hub;
        Room storage r = _room[COMMONS];
        r.kind = IS_COMMONS;
        r.opened = uint64(block.number);
    }

    /*═══════════════════ who may speak as a token ═══════════════════*/

    /// @notice The owner, or the token's own bound account. Deliberately not
    ///         the renter: a lease buys the instrument's use, not its name.
    function mayActAs(uint256 token, address who) public view returns (bool) {
        if (who == address(0)) return false;
        address o = _ownerOrZero(token);
        if (o == address(0)) return false;
        return who == o || who == HUB.account(token);
    }

    function _ownerOrZero(uint256 token) private view returns (address) {
        try HUB.ownerOf(token) returns (address o) { return o; } catch { return address(0); }
    }

    function _asToken(uint256 token) private view {
        if (!mayActAs(token, msg.sender)) revert NotYours();
    }

    /*═══════════════════ where rooms live ═══════════════════*/

    /// @notice The key of the nth group. Groups are numbered from 1.
    /// @dev    Hashed rather than sequential so that a group key and a pair
    ///         key can never be the same number, and so that a room's key
    ///         says nothing about how many rooms exist.
    function groupKey(uint256 index) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(IS_GROUP, index)));
    }

    /// @notice The room two tokens share. It exists the moment either of
    ///         them uses it, and nobody has to create it.
    function pairKey(uint256 a, uint256 b) public pure returns (uint256) {
        (uint256 lo, uint256 hi) = a < b ? (a, b) : (b, a);
        return uint256(keccak256(abi.encodePacked(IS_PAIR, lo, hi)));
    }

    /*═══════════════════ saying something ═══════════════════*/

    /// @notice Say something in the commons or in a group.
    function speak(uint256 room, uint256 from, uint8 kind, bytes calldata body) external {
        _asToken(from);
        Room storage r = _room[room];

        if (room == COMMONS) {
            // every token in the collection is already here
        } else if (r.kind == IS_GROUP) {
            if (!inRoom[room][from]) revert NotAMember();
        } else if (r.kind == IS_PAIR) {
            /*  A pair room is reachable only through the derivation, and the
                derivation is where its membership is proved. Letting a raw
                key in here would mean checking membership against something
                stored, which is the storage this design does without. */
            revert UseWhisper();
        } else {
            revert NoSuchRoom();
        }

        _say(r, room, from, kind, body);
    }

    /// @notice Say something to exactly one other token.
    function whisper(uint256 from, uint256 to, uint8 kind, bytes calldata body) external {
        _asToken(from);
        if (from == to) revert TalkingToYourself();
        if (_ownerOrZero(to) == address(0)) revert NoSuchToken();

        uint256 room = pairKey(from, to);
        Room storage r = _room[room];
        if (r.kind != IS_PAIR) {
            r.kind = IS_PAIR;
            r.opened = uint64(block.number);
        }
        _say(r, room, from, kind, body);
    }

    /// @dev The two writes that make the archive walkable, and the log that
    ///      is the archive.
    function _say(Room storage r, uint256 room, uint256 from, uint8 kind, bytes calldata body)
        private
    {
        if (body.length == 0 || body.length > MAX_BODY) revert BadBody();
        if (kind > SEALED) revert BadKind();

        uint64 prev = r.last;
        uint64 prevFrom = lastSpoke[from];
        uint64 seq;
        unchecked { seq = r.count + 1; }

        r.count = seq;
        r.last = uint64(block.number);
        lastSpoke[from] = uint64(block.number);

        emit Said(room, from, prev, prevFrom, seq, kind, body);
    }

    /*═══════════════════ groups ═══════════════════*/

    function found(uint256 by, string calldata name, bool openDoor)
        external returns (uint256 key)
    {
        _asToken(by);
        uint256 n = bytes(name).length;
        if (n == 0 || n > MAX_NAME) revert BadName();

        uint256 index;
        unchecked { index = ++groups; }
        key = groupKey(index);

        Room storage r = _room[key];
        r.kind = IS_GROUP;
        r.opened = uint64(block.number);
        r.steward = by;
        r.open = openDoor;
        r.index = index;
        nameOf[key] = name;

        emit Founded(key, by, index, openDoor, name);
        _enter(key, r, by);
    }

    /// @notice The steward names a token that may join. It still has to.
    function invite(uint256 room, uint256 by, uint256 token) external {
        _asToken(by);
        Room storage r = _room[room];
        if (r.kind != IS_GROUP) revert NoSuchRoom();
        if (r.steward != by) revert NotTheSteward();
        if (_ownerOrZero(token) == address(0)) revert NoSuchToken();
        invited[room][token] = true;
        emit Invited(room, token, by);
    }

    function join(uint256 room, uint256 token) external {
        _asToken(token);
        Room storage r = _room[room];
        if (r.kind != IS_GROUP) revert NoSuchRoom();
        if (inRoom[room][token]) revert AlreadyIn();
        if (!r.open && !invited[room][token]) revert NotInvited();
        _enter(room, r, token);
    }

    function leave(uint256 room, uint256 token) external {
        _asToken(token);
        if (!inRoom[room][token]) revert NotAMember();
        _depart(room, token);
    }

    /// @notice The steward can show a token the door. It cannot delete what
    ///         that token said — nothing here can.
    function evict(uint256 room, uint256 by, uint256 token) external {
        _asToken(by);
        Room storage r = _room[room];
        if (r.kind != IS_GROUP) revert NoSuchRoom();
        if (r.steward != by) revert NotTheSteward();
        if (!inRoom[room][token]) revert NotAMember();
        invited[room][token] = false;
        _depart(room, token);
    }

    function _enter(uint256 room, Room storage r, uint256 token) private {
        inRoom[room][token] = true;
        unchecked { r.members += 1; }

        uint256[] storage list = _seen[token];
        uint256 n = list.length;
        for (uint256 i; i < n; ++i) if (list[i] == room) { emit Entered(room, token); return; }
        list.push(room);
        emit Entered(room, token);
    }

    function _depart(uint256 room, uint256 token) private {
        inRoom[room][token] = false;
        Room storage r = _room[room];
        unchecked { if (r.members != 0) r.members -= 1; }
        emit Departed(room, token);
    }

    /*═══════════════════ sealing keys ═══════════════════*/

    /// @notice Publish this token's P-256 point so other tokens can seal to
    ///         it. Replacing it is allowed and makes every earlier sealed
    ///         message unreadable to the token itself — which is a real
    ///         cost, and the reason a client derives the key from a
    ///         signature rather than generating one it has to keep.
    function announce(uint256 token, bytes32 x, bytes32 y) external {
        _asToken(token);
        sealX[token] = x;
        sealY[token] = y;
        emit Announced(token, x, y);
    }

    function keyOf(uint256 token) external view returns (bytes32 x, bytes32 y) {
        return (sealX[token], sealY[token]);
    }

    /// @notice Both sides of a pair in one call, because a client that is
    ///         about to seal needs to know whether it can.
    function keysOf(uint256[] calldata tokens)
        external view returns (bytes32[] memory xs, bytes32[] memory ys)
    {
        uint256 n = tokens.length;
        xs = new bytes32[](n);
        ys = new bytes32[](n);
        for (uint256 i; i < n; ++i) { xs[i] = sealX[tokens[i]]; ys[i] = sealY[tokens[i]]; }
    }

    /*═══════════════════ what a client asks before it walks ═══════════════════*/

    function stateOf(uint256 room)
        external view
        returns (
            uint64 last, uint64 count, uint64 opened,
            uint32 members, uint8 kind, bool open, uint256 steward, uint256 index,
            string memory name
        )
    {
        Room storage r = _room[room];
        return (r.last, r.count, r.opened, r.members, r.kind, r.open,
                r.steward, r.index, nameOf[room]);
    }

    /// @notice The head of every room in one call: where its newest message
    ///         is, and how many there have ever been. A client compares the
    ///         counts against what it has already read to know what is new,
    ///         and asks for nothing else until something has changed.
    function heads(uint256[] calldata rooms)
        external view returns (uint64[] memory last, uint64[] memory count)
    {
        uint256 n = rooms.length;
        last = new uint64[](n);
        count = new uint64[](n);
        for (uint256 i; i < n; ++i) {
            Room storage r = _room[rooms[i]];
            last[i] = r.last;
            count[i] = r.count;
        }
    }

    /// @notice Every room this token has ever entered, and whether it is
    ///         still in each.
    function roomsOf(uint256 token)
        external view returns (uint256[] memory keys, bool[] memory member)
    {
        uint256[] storage list = _seen[token];
        uint256 n = list.length;
        keys = new uint256[](n);
        member = new bool[](n);
        for (uint256 i; i < n; ++i) {
            keys[i] = list[i];
            member[i] = inRoom[list[i]][token];
        }
    }

    function roomCount(uint256 token) external view returns (uint256) {
        return _seen[token].length;
    }

    /*═══════════════════ the topics, so a browser needs no keccak ═══════════════════*/

    /// @notice The `topic0` of every event this contract emits, derived here
    ///         from the signature strings rather than written down.
    /// @dev    The client that reads this chat has no keccak — deliberately,
    ///         because a hash function shipped in a page is a hash function
    ///         nobody checked. It cannot compute a topic filter, so it asks
    ///         the contract that emits the events what they are, and the
    ///         answer is derived from the same string the compiler hashes.
    function topics()
        external pure
        returns (bytes32 said, bytes32 founded, bytes32 entered, bytes32 departed, bytes32 announced)
    {
        said = keccak256("Said(uint256,uint256,uint64,uint64,uint64,uint8,bytes)");
        founded = keccak256("Founded(uint256,uint256,uint256,bool,string)");
        entered = keccak256("Entered(uint256,uint256)");
        departed = keccak256("Departed(uint256,uint256)");
        announced = keccak256("Announced(uint256,bytes32,bytes32)");
    }
}
