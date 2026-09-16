// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIpseityLease {
    function ownerOf(uint256 id) external view returns (address);
    function userOf(uint256 id) external view returns (address);
    function userExpires(uint256 id) external view returns (uint256);
    function leaseAgentOf(uint256 id) external view returns (address);
    function setUserVia(uint256 id, address user, uint64 expires) external;
    function locked(uint256 id) external view returns (bool);
}

/*═══════════════════════════════════════════════════════════════════════════

  LEASE — the instrument, rented by the day, by anyone

  Before this, exactly one thing a token owns could be used by a stranger:
  its market. Everything else was holder-only or a free read. A collection
  of four thousand autonomous objects that between them offer the public a
  single service is not a network of businesses, it is four thousand
  paintings with a vending machine bolted to one wall.

  This is the second service, and it is the one the object was already
  shaped for. ERC-4907 has been in the token since the beginning, and
  `onlyOperator` deliberately includes the user: a renter may turn the
  solid, commit new orientations, set traits — may *drive the instrument* —
  and may not sell it. That is a rental, fully implemented, with no price
  and no way for a stranger to ask. All that was missing was the counter.

  ── where the money goes, and why not to the holder ──

  Rent accrues to the *token*, not to the address that happens to hold it,
  and the holder withdraws. That is not a flourish; it is the same rule the
  market already runs on. Swap fees land in the market's reserves, so
  selling the NFT sells the exchange — inventory, fee income and price
  curve, in one transaction, with no migration. Rent behaves identically:
  sell the token mid-month and the unpaid rent goes with it, because the
  business was never the seller's, it was the token's.

  ── the sale that breaks the lease ──

  A transfer clears the ERC-4907 user. That has always been true and was
  always correct — a lease must not survive the sale, or buying a token
  would mean buying a stranger's standing right to operate it. It was also
  harmless while renting was free.

  With money on the table it is a way to take some. So rent is escrowed, not
  paid, and it vests over the term:

    · the lease runs to its end   → the whole of it becomes the token's
    · the lease is broken early   → the elapsed fraction becomes the
                                    token's, and the rest becomes the
                                    renter's to reclaim

  "Broken" is not asserted by anyone. It is observed, from the expiry the
  token still carries: an intact lease shows exactly the `until` this
  contract set, a sold one shows zero because a transfer deletes the
  record, and an overwritten one shows whatever replaced it. That signal
  outlives the term, which matters more than it looks — `userOf` returns
  zero after expiry for an intact lease and a broken one alike, so reading
  breakage from it meant a lease broken on its first day vested in full to
  the holder the moment the term ran out, and the renter's claim on the
  nine days they never got expired quietly along with it.

  The holder keeps the power to end a lease at any moment, and pays for it
  at exactly the rate they were being paid.

  ── what is deliberately not here ──

  No protocol fee. There is no cut for the curator, no treasury address and
  no switch to add one later; every wei a renter pays is owed to the token
  they paid it to. A fee would be a second party with a claim on a two-party
  arrangement, and the argument for adding one is always that it could be
  small rather than that anyone needs it.

  No renewals, no auctions, no order book. One term, one renter, one price
  the holder set. The complicated versions can be built by a different
  contract the holder names instead of this one — which is the whole point
  of `leaseAgentOf` being a per-token address rather than a blessed
  singleton.

═══════════════════════════════════════════════════════════════════════════*/
contract Lease {
    IIpseityLease public immutable HUB;

    struct Terms {
        uint128 perDay;     // wei per day; zero is legal and means free
        uint32  minDays;
        uint32  maxDays;
        bool    open;
        /// @dev Who published them. Terms do not survive the sale of the
        ///      token: a transfer clears the lease agent, which stops
        ///      anyone renting — but only until the new owner names an
        ///      agent for reasons of their own, at which point the
        ///      previous owner's price and term would go live again on
        ///      somebody else's property. Stamping the author is one word
        ///      and closes it without needing a hook on transfer.
        address by;
    }

    /// @dev One at a time. A token with two simultaneous renters has two
    ///      operators, and ERC-4907 has room for one.
    struct Active {
        address renter;
        uint64  start;
        uint64  until;
        uint128 paid;       // held, not yet earned
        /// @dev The last block in which this lease was observed intact.
        ///
        ///      A lease can be broken by a transfer, and this contract has
        ///      no hook on transfers — so when it is finally looked at, it
        ///      can tell that the lease broke but not when. Clamping the
        ///      elapsed share to the term does not help: settle a month
        ///      late and "elapsed" is the whole term, which hands the
        ///      holder every day they did not deliver.
        ///
        ///      So the holder is credited for time the contract watched
        ///      pass. Any call to `settle` advances this, it is free, and
        ///      anyone may make it. The bias is deliberate and points the
        ///      only way it can: the party who can end a lease is the party
        ///      who has to say so to be paid for it.
        uint64  seen;
    }

    mapping(uint256 => Terms)  public termsOf;
    mapping(uint256 => Active) public activeOf;

    /// @notice Vested rent, owed to whoever holds the token when it is
    ///         collected — not to whoever held it when it was paid.
    mapping(uint256 => uint256) public earned;

    /// @notice Unvested rent returned to a renter whose lease was cut short.
    mapping(address => uint256) public owed;

    uint32  public constant MAX_DAYS    = 365;
    uint128 public constant MAX_PER_DAY = 1e30;      // a trillion ether a day
    uint256 private constant DAY = 1 days;

    event Listed(uint256 indexed id, uint128 perDay, uint32 minDays, uint32 maxDays);
    event Delisted(uint256 indexed id);
    event Rented(uint256 indexed id, address indexed renter, uint64 until, uint256 paid);
    event Settled(uint256 indexed id, address indexed renter, uint256 toToken, uint256 toRenter);
    event Collected(uint256 indexed id, address indexed to, uint256 amount);
    event Claimed(address indexed who, uint256 amount);

    error NotHolder();
    error NotAuthorised();
    error NotOpen();
    error AlreadyRented();
    error BadTerm();
    error PriceMoved();
    error WrongPayment();
    error NothingOwed();
    error PayoutFailed();
    error Reentrant();

    uint256 private _lock = 1;
    modifier nonReentrant() {
        if (_lock != 1) revert Reentrant();
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @dev Money moves for the owner and nobody else. Ipseity's own
    ///      `onlyHolder` admits ERC-721 operators, which is right for
    ///      operating a token and wrong for emptying its account: an
    ///      operator who wants the rent can transfer the token to
    ///      themselves first, in public, in a transaction that says so.
    modifier onlyOwner(uint256 id) {
        if (msg.sender != HUB.ownerOf(id)) revert NotHolder();
        _;
    }

    constructor(IIpseityLease hub) {
        HUB = hub;
    }

    /*═══════════════════ the holder's side ═══════════════════*/

    /// @notice Offer the instrument to the public at a price per day.
    /// @dev Refuses unless the token has already named this contract its
    ///      lease agent. Listing something nobody can rent is a listing that
    ///      fails at the counter instead of at the shelf.
    function list(uint256 id, uint128 perDay, uint32 minDays, uint32 maxDays)
        external onlyOwner(id)
    {
        if (HUB.leaseAgentOf(id) != address(this)) revert NotAuthorised();
        if (minDays == 0 || maxDays < minDays || maxDays > MAX_DAYS) revert BadTerm();
        if (perDay > MAX_PER_DAY) revert BadTerm();
        termsOf[id] = Terms(perDay, minDays, maxDays, true, msg.sender);
        emit Listed(id, perDay, minDays, maxDays);
    }

    /// @notice Stop taking new renters. A lease already running is not
    ///         touched: it was paid for.
    function delist(uint256 id) external onlyOwner(id) {
        termsOf[id].open = false;
        emit Delisted(id);
    }

    /// @notice Draw down whatever has vested.
    function collect(uint256 id, address to) external onlyOwner(id) nonReentrant {
        _settle(id);
        uint256 v = earned[id];
        if (v == 0) revert NothingOwed();
        earned[id] = 0;
        (bool ok, ) = to.call{value: v}("");
        if (!ok) revert PayoutFailed();
        emit Collected(id, to, v);
    }

    /*═══════════════════ the public's side ═══════════════════*/

    /// @notice Rent the instrument for a whole number of days.
    /// @param maxPerDay The most the caller will pay per day. The holder can
    ///        change the price at any time and a transaction can sit in the
    ///        mempool while they do; this is the same guard `swap` takes
    ///        against the same problem.
    function rent(uint256 id, uint32 dayCount, uint128 maxPerDay)
        external payable nonReentrant
    {
        _settle(id);

        Terms memory t = termsOf[id];
        if (!t.open || t.by != HUB.ownerOf(id)) revert NotOpen();
        if (HUB.leaseAgentOf(id) != address(this)) revert NotAuthorised();
        if (activeOf[id].renter != address(0)) revert AlreadyRented();
        if (dayCount < t.minDays || dayCount > t.maxDays) revert BadTerm();
        if (t.perDay > maxPerDay) revert PriceMoved();

        uint256 due = uint256(t.perDay) * uint256(dayCount);
        if (due > type(uint128).max) revert BadTerm();
        if (msg.value != due) revert WrongPayment();

        uint64 until = uint64(block.timestamp + uint256(dayCount) * DAY);
        activeOf[id] = Active(msg.sender, uint64(block.timestamp), until, uint128(due),
                              uint64(block.timestamp));

        HUB.setUserVia(id, msg.sender, until);
        emit Rented(id, msg.sender, until, due);
    }

    /// @notice Bring the books up to date. Anyone may call it, it costs
    ///         nothing but gas, and it is what records that the lease was
    ///         still running at this block.
    /// @dev    A holder letting a long token out should call this now and
    ///         then, or use `endLease` when they want it back. Both are
    ///         cheaper than the alternative, which is being credited only
    ///         to the last time anybody looked.
    function settle(uint256 id) external {
        _settle(id);
    }

    /// @notice End a lease deliberately, and be paid for exactly the time
    ///         delivered up to this block.
    /// @dev    The holder can always end a lease by calling `setUser`
    ///         themselves — this is the same act done through the contract
    ///         that is keeping the books, so the elapsed share is measured
    ///         at the moment it actually ends rather than at the moment
    ///         someone later notices.
    function endLease(uint256 id) external onlyOwner(id) {
        Active memory a = activeOf[id];
        if (a.renter == address(0)) revert NotOpen();
        if (_intact(id, a) && block.timestamp < a.until) {
            activeOf[id].seen = uint64(block.timestamp);
            HUB.setUserVia(id, address(0), 0);
        }
        _settle(id);
    }

    /// @notice Take back rent for time that was bought and not delivered.
    function claim() external nonReentrant {
        uint256 v = owed[msg.sender];
        if (v == 0) revert NothingOwed();
        owed[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: v}("");
        if (!ok) revert PayoutFailed();
        emit Claimed(msg.sender, v);
    }

    /*═══════════════════ the books ═══════════════════*/

    /*  Whether the lease was cut short is decided BEFORE whether the term
        has passed, and that order is the whole of it.

        Written the other way round — expiry first — a lease broken on its
        first day vested in full to the holder as soon as the term ran out,
        because after expiry `userOf` returns zero for an intact lease and a
        broken one alike and there was nothing left to tell them apart. The
        renter's right to the nine days they did not get expired quietly
        with the lease itself, and the only thing standing between a holder
        and the whole escrow was whether anybody happened to call `settle`
        in time. Nobody was going to.

        So breakage is read from the expiry the token carries, which
        survives the term: an intact lease still shows exactly the `until`
        this contract set, a sold one shows zero because transfer deletes
        the record, and an overwritten one shows whatever replaced it. The
        elapsed share is clamped to the term so settling late cannot credit
        the holder for time after it ended.                              */
    function _settle(uint256 id) private {
        Active memory a = activeOf[id];
        if (a.renter == address(0)) return;

        if (_intact(id, a)) {
            if (block.timestamp < a.until) {
                activeOf[id].seen = uint64(block.timestamp);   // watched, still running
                return;
            }
            delete activeOf[id];                               // ran to term
            earned[id] += a.paid;
            emit Settled(id, a.renter, a.paid, 0);
            return;
        }

        /*  Cut short. Nobody declares it — the token stopped showing the
            lease, which happens when it was sold, transferred, or when the
            holder called setUser over the top. The split is by elapsed
            time, so ending a lease costs the holder exactly what it was
            earning them.

            "Elapsed" is measured to the last block in which the lease was
            seen intact, not to now. Now is when somebody got round to
            looking, and a holder who broke a lease on its first day and
            waited a month to settle would otherwise be paid for the month.   */
        uint256 end = uint256(a.seen) < uint256(a.until) ? uint256(a.seen) : uint256(a.until);
        uint256 span = uint256(a.until) - uint256(a.start);
        uint256 keep = (uint256(a.paid) * (end - uint256(a.start))) / span;

        delete activeOf[id];
        earned[id] += keep;
        unchecked { owed[a.renter] += uint256(a.paid) - keep; }
        emit Settled(id, a.renter, keep, uint256(a.paid) - keep);
    }

    /*═══════════════════ what a page needs to ask ═══════════════════*/

    function cost(uint256 id, uint32 dayCount) public view returns (uint256) {
        return uint256(termsOf[id].perDay) * uint256(dayCount);
    }

    /// @notice Whether a stranger can rent this token right now, and if not,
    ///         which of the four reasons it is.
    /// @return ok        rentable this block
    /// @return reason    0 rentable · 1 not listed · 2 agent not named
    ///                   3 already rented · 4 rented but settleable now
    function status(uint256 id) public view returns (bool ok, uint8 reason) {
        Active memory a = activeOf[id];
        bool live = a.renter != address(0)
            && block.timestamp < a.until
            && _intact(id, a);

        Terms memory t = termsOf[id];
        if (!t.open || t.by != HUB.ownerOf(id)) return (false, 1);
        if (HUB.leaseAgentOf(id) != address(this)) return (false, 2);
        if (live) return (false, 3);
        // a finished or broken lease still occupying the slot clears itself
        // on the next rent(), so it does not stop anyone
        return (true, 0);
    }

    /// @dev Whether the token still shows the lease this contract set.
    ///      Read rather than declared, and readable after the term has
    ///      passed — which is the part that was wrong.
    function _intact(uint256 id, Active memory a) private view returns (bool) {
        if (HUB.userExpires(id) != a.until) return false;
        if (block.timestamp < a.until && HUB.userOf(id) != a.renter) return false;
        return true;
    }

    /// @notice The whole listing, for one call from a page or an agent.
    function listing(uint256 id)
        external view
        returns (
            bool rentable,
            uint8 reason,
            uint128 perDay,
            uint32 minDays,
            uint32 maxDays,
            address renter,
            uint64 until,
            uint256 vested,
            bool bound
        )
    {
        (rentable, reason) = status(id);
        Terms memory t = termsOf[id];
        Active memory a = activeOf[id];
        return (
            rentable, reason, t.perDay, t.minDays, t.maxDays,
            a.renter, a.until, earned[id], HUB.locked(id)
        );
    }

    /// @notice Every wei this contract holds is spoken for, across three
    ///         ledgers, and the sum of all three is what the balance has to
    ///         cover. Nothing here is a balance the contract may spend: the
    ///         only paths out are a holder collecting vested rent and a
    ///         renter reclaiming rent for time they did not get.
    /// @dev    Both lists are needed. An earlier version took only token
    ///         ids and therefore omitted `owed` entirely, which made the
    ///         contract's own solvency helper report a number smaller than
    ///         its liabilities — a check that cannot fail is not a check.
    function obligations(uint256[] calldata ids, address[] calldata parties)
        external view returns (uint256 total)
    {
        for (uint256 i; i < ids.length; ++i) {
            total += earned[ids[i]] + activeOf[ids[i]].paid;
        }
        for (uint256 i; i < parties.length; ++i) {
            total += owed[parties[i]];
        }
    }

    /// @dev No receive(), no fallback. Ether arrives through `rent` or it
    ///      does not arrive, so the books and the balance cannot drift for
    ///      any reason other than a forced `selfdestruct` transfer — which
    ///      can only ever leave a surplus, never a shortfall.
}
