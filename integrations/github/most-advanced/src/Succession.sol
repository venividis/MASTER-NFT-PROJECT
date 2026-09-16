// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IHubSuccession {
    function ownerOf(uint256 id) external view returns (address);
    function account(uint256 id) external view returns (address);
    function grip(uint256 id) external view returns (address);
    function detailOf(uint256 id) external view returns (
        uint64 lastOp, uint64 mintBlock, bool isLocked, uint8 kernel);
    function transferFrom(address from, address to, uint256 id) external;
    function getApproved(uint256 id) external view returns (address);
    function isApprovedForAll(address owner, address op) external view returns (bool);
}

/*───────────────────────────────────────────────────────────────────────────
  Succession — what happens to the token when nothing happens to it

  Everything a token accumulates is attached to the token and not to the
  wallet: the rooms it stewards, the vault it locked, the name it answers
  to, whatever its account holds. That is the good property, and it has a
  bad corollary. Lose the key and all of it is not merely inaccessible, it
  is gone in the strong sense — nobody can reach it, nobody can prove they
  should, and the chain will keep it exactly where it is for as long as
  there is a chain.

  A multisig is the usual answer and it is the wrong shape here: it makes
  somebody else a co-owner today in exchange for cover on a day that may
  never come. This is the other shape. Name where the token should go and
  how long a silence should mean you are gone. Use the token and nothing
  happens. Stop using it for that long and the person you named may knock;
  the knock is public and it starts a second clock; touch the token during
  that clock and the knock is cancelled. Only if both silences run out does
  the token move.

  ── what this contract can and cannot do ──

  It moves a token with a standing approval, which is the thing every
  drainer wants and every warning tells you not to give. So it is worth
  being exact about what the approval buys here: this contract has one
  function that moves a token, it moves it only to the address written in
  that token's own arrangement, only after two clocks that the owner alone
  resets have both run out, and the owner can erase the arrangement at any
  moment up to the last second. There is no curator, no pause, no upgrade
  and no other transfer path. That is a narrower grant than an operator
  approval, and it is still a grant.

  What it cannot do:

    · move a bolted token. `isTransferable` refuses soulbound tokens and
      this contract has no privilege the standard does not give it, so a
      bolt outlives its holder. `wouldPass` says so rather than letting the
      arrangement look healthy until the day it is needed.
    · survive a sale. The arrangement records who made it; if the token has
      changed hands the plan is void, because the buyer did not agree to it.
    · know that you died. It knows the token was not used. Those are not
      the same fact and this contract does not pretend otherwise: the
      silence you choose is a bet about your own habits.
    · keep the successor secret. Everything here is public, including who
      you named, which is a reason to name an address rather than a person.
───────────────────────────────────────────────────────────────────────────*/
contract Succession {
    IHubSuccession public immutable HUB;

    /*  A month is the shortest silence that is not an accident, and ten
        years is the same ceiling the vault uses — long enough to be a
        lifetime arrangement, short enough to be a promise about a system
        that exists.                                                      */
    uint64 public constant MIN_QUIET  = 30 days;
    uint64 public constant MAX_QUIET  = 3650 days;
    uint64 public constant MIN_NOTICE = 7 days;
    uint64 public constant MAX_NOTICE = 365 days;

    struct Plan {
        address from;      // who arranged it; the plan dies if the token leaves them
        address to;        // where it goes, unless `toToken` overrides it
        uint64  quiet;     // the silence that lets somebody knock
        uint64  notice;    // and the wait between the knock and the door
        uint64  seen;      // this contract's own proof of life
        uint64  called;    // when the knock came; zero means nobody has
        uint256 toToken;   // if set, `to` is whoever holds this token at the end
    }
    mapping(uint256 => Plan) internal _plan;

    /// @dev Every arrangement naming a given address, so a successor can
    ///      discover what is coming to them without scanning the chain.
    mapping(address => uint256[]) internal _named;

    event Arranged(uint256 indexed id, address indexed from, address indexed to,
                   uint256 toToken, uint64 quiet, uint64 notice);
    event Revoked(uint256 indexed id, address indexed by);
    event StillHere(uint256 indexed id, uint64 when);
    event Summoned(uint256 indexed id, address indexed by, uint64 opensAt);
    event Passed(uint256 indexed id, address indexed from, address indexed to);

    error NotYours();
    error NoPlan();
    error NobodyThere();
    error SameHands();
    error TooShort();
    error TooLong();
    error StillSpeaking(uint64 until);
    error NotCalled();
    error NotYet(uint64 until);
    error Moved();

    constructor(IHubSuccession hub) { HUB = hub; }

    /*  The strict door, and it has to be the strict one. An arrangement an
        approved operator could rewrite is an arrangement a phished
        approval redirects — the thief would not steal the token, they
        would simply become the heir and wait. Owner, or the token's own
        account acting for itself, and nobody else.                      */
    modifier onlyOwner(uint256 id) {
        address o = HUB.ownerOf(id);
        if (msg.sender != o && msg.sender != HUB.account(id)) revert NotYours();
        _;
    }

    /*═══════════════════ arranging ═══════════════════*/

    /// @notice Name where this token goes if it goes quiet, and for how long
    ///         a quiet counts.
    /// @param to      the address that may claim it. Ignored if `toToken` is set.
    /// @param toToken if non-zero, the token goes to whoever holds *this*
    ///                token at the moment it is claimed. Inheritance that
    ///                follows an instrument rather than a key, which is the
    ///                only kind that survives the heir changing wallets.
    function arrange(uint256 id, address to, uint256 toToken, uint64 quiet, uint64 notice)
        external onlyOwner(id)
    {
        if (quiet  < MIN_QUIET)  revert TooShort();
        if (quiet  > MAX_QUIET)  revert TooLong();
        if (notice < MIN_NOTICE) revert TooShort();
        if (notice > MAX_NOTICE) revert TooLong();
        if (toToken == 0 && to == address(0)) revert NobodyThere();
        if (toToken == id) revert SameHands();

        address o = HUB.ownerOf(id);
        if (toToken == 0 && to == o) revert SameHands();

        Plan storage p = _plan[id];
        bool fresh = p.from == address(0) || p.to != to;
        p.from    = o;
        p.to      = to;
        p.toToken = toToken;
        p.quiet   = quiet;
        p.notice  = notice;
        p.seen    = uint64(block.timestamp);
        p.called  = 0;

        if (fresh && to != address(0)) _named[to].push(id);
        emit Arranged(id, o, to, toToken, quiet, notice);
    }

    /// @notice Erase the arrangement. Available up to the last second — a
    ///         summons already knocking does not close this door.
    function revoke(uint256 id) external onlyOwner(id) {
        if (_plan[id].from == address(0)) revert NoPlan();
        delete _plan[id];
        emit Revoked(id, msg.sender);
    }

    /// @notice Say you are here. Resets the silence and cancels any knock.
    /// @dev    Rarely needed: the hub already stamps `lastOp` on every
    ///         operation the token performs, and this contract reads that
    ///         too, so ordinary use of the instrument keeps it alive by
    ///         itself. This exists for the holder who wants to be certain
    ///         without doing anything else, and for the one whose habit is
    ///         to hold rather than to use.
    function stillHere(uint256 id) external onlyOwner(id) {
        Plan storage p = _plan[id];
        if (p.from == address(0)) revert NoPlan();
        p.seen   = uint64(block.timestamp);
        p.called = 0;
        emit StillHere(id, p.seen);
    }

    /*═══════════════════ the two clocks ═══════════════════*/

    /*  The last moment the OWNER said they were here.

        This read the hub's operation stamp as well, so that ordinary use of
        the instrument kept the switch alive with nothing to remember. It
        was the nicest thing about this contract and it was wrong.

        `embody` is open to the world — the account's address is
        deterministic and materialising it is nobody's privilege — and it
        stamped the counter. So any stranger could reset the silence, for
        the price of gas, as often as they liked: an heir could be kept from
        ever knocking, forever, by somebody with no relationship to the
        token at all. Measured before it was fixed: after the full quiet
        period the plan read KNOCKABLE, a passer-by called `embody`, and it
        read SPEAKING again.

        `embody` no longer stamps. But the deeper point survives the fix:
        every remaining stamp is reachable by an OPERATOR — an approved
        address, or a renter under a lease. A renter's ordinary use would
        hold the switch open for the length of their lease, and a phished
        approval would hold it open for as long as it went unnoticed. A
        dead-man's switch that a third party can hold open is not one.

        So the only signal counted here is the owner's own, through
        `arrange` and `stillHere`, both behind the strict door. What was
        lost is real: the holder now has to say so, once per quiet period.
        The page and the terminal both print the exact date, because a
        promise that needs remembering should at least be legible.       */
    function lastSeen(uint256 id) public view returns (uint64) {
        return _plan[id].seen;
    }

    /// @notice When the silence has run long enough for somebody to knock.
    function knockableAt(uint256 id) public view returns (uint64) {
        Plan memory p = _plan[id];
        if (p.from == address(0)) return 0;
        return lastSeen(id) + p.quiet;
    }

    /// @notice When the door opens, or zero if nobody has knocked.
    function opensAt(uint256 id) public view returns (uint64) {
        Plan memory p = _plan[id];
        if (p.called == 0) return 0;
        return p.called + p.notice;
    }

    /// @notice Knock. Anybody may — the successor is written down and does
    ///         not change because of who rang the bell, and a knock nobody
    ///         can make is a knock that needs the heir to still be
    ///         watching on exactly the right day.
    function summon(uint256 id) external {
        Plan storage p = _plan[id];
        if (p.from == address(0)) revert NoPlan();
        if (p.from != HUB.ownerOf(id)) revert Moved();
        uint64 when = knockableAt(id);
        if (block.timestamp < when) revert StillSpeaking(when);
        p.called = uint64(block.timestamp);
        emit Summoned(id, msg.sender, p.called + p.notice);
    }

    /// @notice Hand the token to the successor. Anybody may call it; only
    ///         the named party can receive it.
    function claim(uint256 id) external {
        Plan memory p = _plan[id];
        if (p.from == address(0)) revert NoPlan();
        if (p.called == 0) revert NotCalled();
        uint64 when = p.called + p.notice;
        if (block.timestamp < when) revert NotYet(when);

        address from = HUB.ownerOf(id);
        if (from != p.from) revert Moved();
        address to = heirOf(id);
        if (to == address(0)) revert NobodyThere();
        if (to == from) revert SameHands();

        delete _plan[id];
        HUB.transferFrom(from, to, id);
        emit Passed(id, from, to);
    }

    /*═══════════════════ reading it ═══════════════════*/

    /// @notice Who would receive it, resolved at the moment of asking. With
    ///         `toToken` set this is whoever holds that token now, which is
    ///         the point of naming one.
    function heirOf(uint256 id) public view returns (address) {
        Plan memory p = _plan[id];
        if (p.from == address(0)) return address(0);
        if (p.toToken == 0) return p.to;
        try HUB.ownerOf(p.toToken) returns (address o) { return o; }
        catch { return address(0); }
    }

    function planOf(uint256 id) external view returns (
        address from, address to, uint256 toToken,
        uint64 quiet, uint64 notice, uint64 seen, uint64 called)
    {
        Plan memory p = _plan[id];
        return (p.from, p.to, p.toToken, p.quiet, p.notice, lastSeen(id), p.called);
    }

    /// @notice Every token that names this address as its successor.
    /// @dev    Push-only, so an entry can be stale — a revoked or spent
    ///         plan stays in the list. `heirOf` is the authority; this is
    ///         a place to start looking, not an answer.
    function namedTo(address who) external view returns (uint256[] memory) {
        return _named[who];
    }

    /*  Status codes rather than a bool, because "this will not work" is
        useless to somebody who arranged their estate and would like to
        know which part of it to fix.                                    */
    uint8 public constant OK          = 0;   // it would move today
    uint8 public constant NO_PLAN     = 1;
    uint8 public constant SOLD        = 2;   // the token left the person who arranged it
    uint8 public constant NO_STANDING = 3;   // this contract was never approved, or no longer is
    uint8 public constant BOLTED      = 4;   // soulbound; a bolt outlives its holder
    uint8 public constant NO_HEIR     = 5;   // the named token is gone, or the address is zero
    uint8 public constant BAD_HANDS   = 6;   // the heir is the token's own account, or the owner
    uint8 public constant SPEAKING    = 7;   // still in use; nobody may knock yet
    uint8 public constant WAITING     = 8;   // knocked, and the notice has not run out
    uint8 public constant KNOCKABLE   = 9;   // gone quiet long enough; nobody has knocked

    /// @notice What would happen if `claim` were called right now, and if
    ///         the answer is "nothing", exactly why not.
    function wouldPass(uint256 id) external view returns (uint8) {
        Plan memory p = _plan[id];
        if (p.from == address(0)) return NO_PLAN;

        address o;
        try HUB.ownerOf(id) returns (address a) { o = a; } catch { return SOLD; }
        if (o != p.from) return SOLD;

        if (HUB.getApproved(id) != address(this)
            && !HUB.isApprovedForAll(o, address(this))) return NO_STANDING;

        ( , , bool bolted, ) = HUB.detailOf(id);
        if (bolted) return BOLTED;

        address to = heirOf(id);
        if (to == address(0)) return NO_HEIR;
        if (to == o) return BAD_HANDS;
        if (to == HUB.account(id) || to == HUB.grip(id)) return BAD_HANDS;

        if (p.called == 0) {
            return block.timestamp < lastSeen(id) + p.quiet ? SPEAKING : KNOCKABLE;
        }
        if (block.timestamp < p.called + p.notice) return WAITING;
        return OK;
    }
}
