// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IHubConsign {
    function ownerOf(uint256 id) external view returns (address);
    function account(uint256 id) external view returns (address);
    function transferFrom(address from, address to, uint256 id) external;
    function setUser(uint256 id, address user, uint64 expires) external;
    function userOf(uint256 id) external view returns (address);
    function locked(uint256 id) external view returns (bool);
    function royaltyInfo(uint256 id, uint256 salePrice)
        external view returns (address receiver, uint256 amount);
}

/*───────────────────────────────────────────────────────────────────────────
  Consign — hand it to a dealer without handing over the sale

  Selling a thing you cannot value is a job, and the person who does that
  job needs to be able to deliver. On a chain the usual way to let them is
  to give them the token, which is also the usual way to lose it. The other
  usual way is to give them nothing and a promise, which is why the promise
  is worthless: an approval you can withdraw the moment a buyer appears is
  not an inventory, and no dealer will work an item they can be cut out of.

  So the token comes here for a term, and here is a room with no doors. The
  agent may price it and may take a sale at or above a floor the consignor
  wrote. They may not price it below that floor, may not move it anywhere
  but to a buyer who paid, and may not keep it when the term ends: reclaim
  is callable by anybody, so an agent who stops answering cannot hold the
  token hostage by doing nothing. Early release exists and needs the
  agent's signature, because a consignment either binds both sides or it is
  not a consignment.

  ── the cost, stated plainly ──

  While it is consigned, this contract owns the token. That means the
  consignor is not the owner for the length of the term, and everything
  that asks the hub who owns it — the rooms it stewards, whatever its
  account can be made to do, the arrangements that die on a transfer — will
  answer with this address instead of theirs. That is not a bug to be
  papered over; it is what handing something to a dealer means.

  What is given back is the instrument. The consignor is set as the token's
  ERC-4907 user for the term, so they keep operating it — committing,
  opening nodes, setting traits — for as long as it sits here, and the hub
  clears that the moment it sells. What they do not keep is the ability to
  act *as* the token, because the account answers to the owner and this
  contract is deliberately not able to ask it for anything.

  ── what this contract has no function to do ──

  There is no function here that moves a consigned token anywhere except to
  a buyer who paid at or above the floor, or back to the consignor. There
  is no curator, no fee switch, no pause, no upgrade, and no call that
  reaches the token's account. Money is credited, never pushed: a seller
  whose wallet reverts on receipt cannot wedge a sale for everybody else.
───────────────────────────────────────────────────────────────────────────*/
contract Consign {
    IHubConsign public immutable HUB;

    uint16 public constant BPS      = 10_000;
    uint16 public constant MAX_CUT  = 5_000;    // half; past that it is not an agent
    uint64 public constant MIN_TERM = 1 days;
    uint64 public constant MAX_TERM = 730 days;

    struct Note {
        address seller;   // who consigned it, and who gets it back
        address agent;    // who may price it
        uint96  floor;    // and may never go below this
        uint96  ask;      // the price today; zero means not yet offered
        uint64  until;    // when it comes home by itself
        uint16  cut;      // the agent's share of the sale, in basis points
    }
    mapping(uint256 => Note) internal _note;

    /// @dev Pull, never push. Lease does the same, for the same reason.
    mapping(address => uint256) public owed;

    mapping(address => uint256[]) internal _bySeller;
    mapping(address => uint256[]) internal _byAgent;

    event Consigned(uint256 indexed id, address indexed seller, address indexed agent,
                    uint256 floor, uint16 cut, uint64 until);
    event Asked(uint256 indexed id, uint256 ask);
    event Sold(uint256 indexed id, address indexed buyer, uint256 paid,
               uint256 toSeller, uint256 toAgent, uint256 royalty);
    event Reclaimed(uint256 indexed id, address indexed to, bool early);
    event Withdrawn(address indexed who, uint256 amount);

    error NotYours();
    error NotTheAgent();
    error NoNote();
    error AlreadyHere();
    error TooShort();
    error TooLong();
    error TooGreedy();
    error NoFloor();
    error BelowFloor();
    error NotOffered();
    error PriceMoved(uint256 now_);
    error Underpaid(uint256 want);
    error TermRunning(uint64 until);
    error TermOver(uint64 until);
    error Bolted();
    error NobodyThere();
    error NothingOwed();
    error PayFailed();
    error Reentrancy();

    uint256 private _guard = 1;
    modifier once() {
        if (_guard != 1) revert Reentrancy();
        _guard = 2;
        _;
        _guard = 1;
    }

    constructor(IHubConsign hub) { HUB = hub; }

    /*═══════════════════ handing it over ═══════════════════*/

    /// @notice Put a token in an agent's window for a term.
    /// @param floor the least it may be sold for. There is no zero floor:
    ///              a consignment with no floor is a gift with extra steps.
    /// @param cut   the agent's share of whatever it fetches, in basis
    ///              points, capped at half.
    /// @dev   Requires this contract to be approved for the token first,
    ///        which is the one approval the flow needs and the one it
    ///        spends immediately — the hub clears `getApproved` on every
    ///        transfer, so nothing standing is left behind.
    function consign(uint256 id, address agent, uint96 floor, uint16 cut, uint64 until)
        external
    {
        address o = HUB.ownerOf(id);
        if (msg.sender != o && msg.sender != HUB.account(id)) revert NotYours();
        if (_note[id].seller != address(0)) revert AlreadyHere();
        if (agent == address(0)) revert NobodyThere();
        if (floor == 0) revert NoFloor();
        if (cut > MAX_CUT) revert TooGreedy();
        if (until < block.timestamp + MIN_TERM) revert TooShort();
        if (until > block.timestamp + MAX_TERM) revert TooLong();
        /*  A bolted token cannot be delivered, so it cannot honestly be
            offered. Refusing here beats discovering it at the sale.    */
        if (HUB.locked(id)) revert Bolted();

        _note[id] = Note({
            seller: o, agent: agent, floor: floor, ask: 0,
            until: until, cut: cut
        });
        _bySeller[o].push(id);
        _byAgent[agent].push(id);

        HUB.transferFrom(o, address(this), id);
        /*  The title moved; the use did not. The hub clears this itself on
            the next transfer, so a sale hands the buyer a clean token. */
        HUB.setUser(id, o, until);

        emit Consigned(id, o, agent, floor, cut, until);
    }

    /*═══════════════════ the window ═══════════════════*/

    /// @notice The agent names today's price. At or above the floor, always.
    function ask(uint256 id, uint96 price) external {
        Note storage n = _note[id];
        if (n.seller == address(0)) revert NoNote();
        if (msg.sender != n.agent) revert NotTheAgent();
        if (price < n.floor) revert BelowFloor();
        n.ask = price;
        emit Asked(id, price);
    }

    /// @notice Buy it at the price you agreed to. Overpayment is refunded,
    ///         never kept, and a price that moved under you is a revert.
    function buy(uint256 id, uint96 agreed) external payable once {
        Note memory n = _note[id];
        if (n.seller == address(0)) revert NoNote();
        if (n.ask == 0) revert NotOffered();
        if (block.timestamp >= n.until) revert TermOver(n.until);
        /*  The buyer names the price they agreed to rather than trusting
            whatever `ask` says at mining time. Without this, an agent who
            watches the mempool can raise the price into a buyer's stated
            value and take the difference; with it, the same move is a
            revert and costs the buyer nothing but gas.                */
        if (n.ask != agreed) revert PriceMoved(n.ask);
        uint256 price = uint256(agreed);
        if (msg.value < price) revert Underpaid(price);

        delete _note[id];

        /*  The collection's own royalty is honoured out of the sale before
            anybody splits anything, because a marketplace that quietly
            skips it is the reason on-chain royalties stopped meaning
            anything. It is taken from the price, not added to it.     */
        (address rcv, uint256 roy) = HUB.royaltyInfo(id, price);
        if (rcv == address(0) || rcv == address(this) || roy >= price) roy = 0;
        uint256 rest  = price - roy;
        uint256 toAgent = (rest * n.cut) / BPS;
        uint256 toSeller = rest - toAgent;

        if (roy != 0)      owed[rcv]      += roy;
        if (toAgent != 0)  owed[n.agent]  += toAgent;
        owed[n.seller] += toSeller;

        HUB.transferFrom(address(this), msg.sender, id);

        uint256 change = msg.value - price;
        if (change != 0) {
            (bool ok, ) = msg.sender.call{value: change}("");
            if (!ok) revert PayFailed();
        }
        emit Sold(id, msg.sender, price, toSeller, toAgent, roy);
    }

    /*═══════════════════ getting it back ═══════════════════*/

    /// @notice Send it home. After the term, anybody may — an agent who
    ///         stops answering must not be able to keep a token by doing
    ///         nothing at all.
    function reclaim(uint256 id) external once {
        Note memory n = _note[id];
        if (n.seller == address(0)) revert NoNote();
        if (block.timestamp < n.until) revert TermRunning(n.until);
        delete _note[id];
        HUB.transferFrom(address(this), n.seller, id);
        emit Reclaimed(id, n.seller, false);
    }

    /// @notice End it early. The agent says when, because a term either
    ///         binds both sides or it was never a term. The agent may also
    ///         hand it back unasked, which is how a dealer says no.
    function release(uint256 id) external once {
        Note memory n = _note[id];
        if (n.seller == address(0)) revert NoNote();
        if (msg.sender != n.agent) revert NotTheAgent();
        delete _note[id];
        HUB.transferFrom(address(this), n.seller, id);
        emit Reclaimed(id, n.seller, true);
    }

    /*═══════════════════ money ═══════════════════*/

    function withdraw() external once {
        uint256 v = owed[msg.sender];
        if (v == 0) revert NothingOwed();
        owed[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: v}("");
        if (!ok) revert PayFailed();
        emit Withdrawn(msg.sender, v);
    }

    /*═══════════════════ reading it ═══════════════════*/

    function noteOf(uint256 id) external view returns (
        address seller, address agent, uint256 floor, uint256 asking,
        uint64 until, uint16 cut, address user)
    {
        Note memory n = _note[id];
        address u;
        if (n.seller != address(0)) { try HUB.userOf(id) returns (address a) { u = a; } catch {} }
        return (n.seller, n.agent, n.floor, n.ask, n.until, n.cut, u);
    }

    /// @notice What a sale at the asking price would pay out, to the wei,
    ///         before anybody agrees to it.
    function split(uint256 id) external view returns (
        uint256 price, uint256 toSeller, uint256 toAgent, uint256 royalty)
    {
        Note memory n = _note[id];
        if (n.seller == address(0) || n.ask == 0) return (0, 0, 0, 0);
        price = uint256(n.ask);
        (address rcv, uint256 roy) = HUB.royaltyInfo(id, price);
        if (rcv == address(0) || rcv == address(this) || roy >= price) roy = 0;
        uint256 rest = price - roy;
        toAgent  = (rest * n.cut) / BPS;
        toSeller = rest - toAgent;
        royalty  = roy;
    }

    function consignedBy(address who) external view returns (uint256[] memory) {
        return _bySeller[who];
    }

    function heldFor(address agent) external view returns (uint256[] memory) {
        return _byAgent[agent];
    }

    /*  There is deliberately no `onERC721Received` here. `consign` pulls
        the token with `transferFrom`, which does not ask, so the hook is
        never needed on the way in — and its absence makes `safeTransferFrom`
        to this address revert at the hub. That is the behaviour worth
        having: a token that arrived any other way would have no note, and
        a token with no note has no seller to send it home to. The only
        door in is the one that writes the terms.                       */
}
