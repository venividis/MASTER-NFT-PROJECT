// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IParleyRead {
    function inRoom(uint256 room, uint256 token) external view returns (bool);
    function invited(uint256 room, uint256 token) external view returns (bool);
    function groupKey(uint256 index) external pure returns (uint256);
    function groups() external view returns (uint256);
    function stateOf(uint256 room) external view returns (
        uint64 last, uint64 count, uint64 opened,
        uint32 members, uint8 kind, bool open, uint256 steward, uint256 index,
        string memory name);
}

interface IHubRead {
    function totalSupply() external view returns (uint256);
    function ownerOf(uint256 id) external view returns (address);
}

/*───────────────────────────────────────────────────────────────────────────
  Roster — who is actually in the room

  Parley can tell you a room holds nine tokens. It cannot tell you which
  nine, and that is not an oversight: membership is a mapping, and a mapping
  is not a list. Enumerating it the usual way means replaying `Entered` and
  `Departed` from the beginning of the chain — a range scan, which this
  collection does without on purpose, because a range scan is the thing that
  needs an indexer and an indexer is a server.

  So the answer is asked the other way round. The collection is finite and
  its tokens are numbered from one, so a reader can simply ask about a
  window of them at once: two hundred and fifty-six memberships come back
  packed into a single word, from a single `eth_call`, over state that was
  already public. Nothing is stored here, nothing is written here, and
  nothing about the protocol had to change to make it true — which is the
  whole point. The archive that exists keeps existing; this only reads it.

  ── why this is a separate contract ──

  The messages are the collection's memory, and the contract that holds them
  is kept across every redeploy of this site, because replacing it would not
  migrate a conversation, it would end one. A question that can be answered
  by reading public state should therefore never be a reason to replace it.
  This contract can be thrown away and rewritten every week; the archive
  underneath it does not notice.
───────────────────────────────────────────────────────────────────────────*/
contract Roster {
    IParleyRead public immutable PARLEY;
    IHubRead    public immutable HUB;

    /// @dev One word of answers per call window. Chosen because a `uint256`
    ///      is the largest thing a client with no ABI decoder can read back
    ///      without counting: it is the return value, whole.
    uint256 public constant WINDOW = 256;

    /*  Parley's three kinds, and a fourth this contract needs. A room that
        was never opened reads back with kind zero, and kind zero is also
        the commons — so a reader asking about a key nobody founded would be
        told it is looking at the room that holds everybody. That is the
        exact confusion this contract exists to remove, so the no-such-room
        case is given a number of its own here.                          */
    uint256 public constant COMMONS    = 0;
    uint8   public constant IS_COMMONS = 0;
    uint8   public constant IS_GROUP   = 1;
    uint8   public constant IS_PAIR    = 2;
    uint8   public constant NO_ROOM    = 3;

    constructor(IParleyRead parley, IHubRead hub) {
        PARLEY = parley;
        HUB = hub;
    }

    /*═══════════════════ who is in a room ═══════════════════*/

    /// @notice Which of the four this key names. A caller that does not ask
    ///         cannot tell an empty group from the commons, and those two
    ///         answers are opposites.
    function kindOf(uint256 room) public view returns (uint8) {
        if (room == COMMONS) return IS_COMMONS;
        (, , , , uint8 k, , , ,) = PARLEY.stateOf(room);
        return k == IS_COMMONS ? NO_ROOM : k;
    }

    /*  Membership is not one question, because Parley does not store it one
        way. A group keeps a mapping and the mapping is the authority. The
        commons keeps nothing, because everyone is in it — `speak` waves
        every token through by key alone, so a roster that consulted the
        mapping would report a room of thousands as empty. A pair keeps
        nothing either, and for a better reason: its key is the hash of its
        two members, so holding the key *is* the proof, and there is no
        third token to ask about.                                        */
    function _in(uint256 room, uint8 k, uint256 id) private view returns (bool) {
        if (k == IS_COMMONS) return true;
        if (k == IS_GROUP)   return PARLEY.inRoom(room, id);
        return false;
    }

    /// @notice Membership for tokens `from` … `from + 255`, one bit each,
    ///         bit 0 being `from`. A set bit is a token in the room.
    /// @dev    The client shifts; the chain counts. Reading 256 tokens costs
    ///         one call and roughly 256 cold storage reads — about 550k gas
    ///         of `eth_call`, which is free to the reader and never mined.
    function inWindow(uint256 room, uint256 from)
        external view returns (uint256 bits)
    {
        uint256 supply = HUB.totalSupply();
        uint8 k = kindOf(room);
        for (uint256 i; i < WINDOW; ++i) {
            uint256 id = from + i;
            if (id == 0 || id > supply) continue;
            if (_in(room, k, id)) bits |= (1 << i);
        }
    }

    /// @notice The same window, for tokens that were invited and have not
    ///         walked in yet. A steward who cannot see this cannot tell an
    ///         ignored invitation from one never sent.
    function invitedInWindow(uint256 room, uint256 from)
        external view returns (uint256 bits)
    {
        uint256 supply = HUB.totalSupply();
        uint8 k = kindOf(room);
        for (uint256 i; i < WINDOW; ++i) {
            uint256 id = from + i;
            if (id == 0 || id > supply) continue;
            if (!_in(room, k, id) && PARLEY.invited(room, id)) bits |= (1 << i);
        }
    }

    /// @notice Membership as a list rather than as bits, for a caller that
    ///         would rather not shift. Bounded by the same window.
    function membersOf(uint256 room, uint256 from)
        external view returns (uint256[] memory ids)
    {
        uint256 supply = HUB.totalSupply();
        uint8 k = kindOf(room);
        uint256[] memory buf = new uint256[](WINDOW);
        uint256 n;
        for (uint256 i; i < WINDOW; ++i) {
            uint256 id = from + i;
            if (id == 0 || id > supply) continue;
            if (_in(room, k, id)) { buf[n] = id; unchecked { ++n; } }
        }
        ids = new uint256[](n);
        for (uint256 i; i < n; ++i) ids[i] = buf[i];
    }

    /*═══════════════════ a token's own rooms ═══════════════════*/

    /// @notice Every group this token is the steward of — the rooms that
    ///         are *its* rooms, and that change hands when it does.
    /// @dev    Group keys are `keccak(1, index)` and the indices run from
    ///         one, so the whole set is derivable: no event replay, no
    ///         registry, nothing to keep in sync. Paged, because a
    ///         collection that founds ten thousand rooms should not punish
    ///         the reader who wants the first ten.
    function stewardedBy(uint256 token, uint256 fromIndex, uint256 count)
        external view returns (uint256[] memory keys, uint256[] memory indexes)
    {
        uint256 total = PARLEY.groups();
        if (fromIndex == 0) fromIndex = 1;
        uint256 end = fromIndex + count;
        if (end > total + 1) end = total + 1;

        uint256[] memory kb = new uint256[](count);
        uint256[] memory ib = new uint256[](count);
        uint256 n;
        for (uint256 i = fromIndex; i < end; ++i) {
            uint256 key = PARLEY.groupKey(i);
            (, , , , , , uint256 steward, ,) = PARLEY.stateOf(key);
            if (steward == token) {
                kb[n] = key;
                ib[n] = i;
                unchecked { ++n; }
            }
        }
        keys = new uint256[](n);
        indexes = new uint256[](n);
        for (uint256 i; i < n; ++i) { keys[i] = kb[i]; indexes[i] = ib[i]; }
    }

    /// @notice Whether a token still exists, for a page that lists members
    ///         and would rather not print a number nobody holds.
    function heldBy(uint256 token) external view returns (address) {
        try HUB.ownerOf(token) returns (address o) { return o; } catch { return address(0); }
    }
}
