// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC721Min {
    function ownerOf(uint256 tokenId) external view returns (address);
    function statsOf(uint256 id) external view
        returns (uint256 ops, uint256 xfers, uint256 strata, uint256 open);
}

interface IERC20Bal {
    function balanceOf(address who) external view returns (uint256);
}

/*═══════════════════════════════════════════════════════════════════════════

  IPSEITY ACCOUNT — the vault, with a promise it can keep

  ERC-6551 says the registry is canonical and the implementation is a
  parameter. Almost everyone passes the reference implementation and
  inherits its one structural gap: the holder can empty the account at any
  moment, including between agreeing a price for the token and settling it.
  A buyer paying for a token because of what its vault holds has no promise
  at all — the accounting is never violated, the assets are simply gone.

  So this is the implementation instead. Same registry, same CREATE2
  derivation, same interfaces. One addition: a seal.

  ── the seal ──

  SEALED UNTIL a timestamp. It ratchets — it can be pushed further out by
  the holder and lowered by nobody, including through a transfer — so a
  buyer reads one number and knows the floor under it cannot move before
  then. While it holds, nothing this account holds may leave it.

  ── how "nothing leaves" is enforced ──

  Not by listing the calls that move assets. That list cannot be completed:
  `transfer` and `transferFrom` are on it, but so is any protocol's
  `withdrawTo(address)`, `redeem`, `exit`, `sweep`, or a function nobody
  has written yet. A firewall that enumerates is a firewall with a hole in
  it shaped like whatever it has not heard of.

  So the account MEASURES. Before a sealed call it records its own ether
  balance and its balance of every asset on its manifest; after the call it
  checks that not one of them fell. What the call did is irrelevant — what
  matters is what is left. This is the Dave Held Chambers pattern, whose
  hardening pass reached the same conclusion the hard way.

  Measurement alone is still not enough, for one specific reason: an
  approval costs nothing at the moment it is granted. `approve(attacker,
  everything)` moves no balance, passes any measurement, and is drained in
  the next block. Measurement is blind to it precisely because nothing has
  happened yet.

  So the two defences are layered, each covering the other's blind spot:

    · MEASURED   nothing may be smaller after the call than before it,
                 whatever the call was
    · REFUSED    while sealed, no approval-family word executes at all, and
                 no ether leaves — because those are the moves whose damage
                 lands outside the window measurement can see

  ── what the seal does not do ──

  It does not stop the account acting. A sealed vault can still vote, claim,
  compound, sign, and call anything that leaves it no poorer. That is the
  whole reason for measuring rather than freezing: a vault that cannot act
  is not a vault, it is a safe.

  It also cannot promise about an asset nobody named. Only the manifest is
  measured. An asset that arrives after the seal, in a token contract that
  was never listed, can leave freely — so `manifest()` is public and a
  buyer should read it, not assume it.

═══════════════════════════════════════════════════════════════════════════*/
contract IpseityAccount {
    /*──────────────────── ERC-6551 ────────────────────*/

    /// @dev Bumps on every successful execute, per the standard.
    uint256 public state;

    /*──────────────────── the seal ────────────────────*/

    /// @notice Nothing on the manifest leaves before this. Ratchet-only.
    uint64 public sealedUntil;

    /// @dev A promise nobody can outlive is indistinguishable from a burn.
    uint64 public constant MAX_SEAL = 365 days;

    /// @dev Bounded because every entry is two balance reads on every
    ///      sealed call, and an unbounded list is an unbounded gas cost
    ///      that eventually makes the account unusable.
    uint256 public constant MAX_MANIFEST = 16;

    /*  There used to be a MEASURED flag packed into bit 255 of each
        snapshot word, on the reasoning that "balances cannot reach 2^255, so
        the bit is free". That was an assumption about somebody else's
        contract, and the assumption was the hole: a guarded token that
        returns `balance | (1 << 255)` makes the post-call comparison
        `now_ < pre` unconditionally false, and the seal silently stops
        constraining that asset. An adversarial review reproduced it —
        1,000 tokens walked out of a live seal.

        Nothing in ERC-20 reserves the high bit. A token may pack a flag
        there, return a scaled internal representation, or simply be
        hostile. So the flag lives in its own array now: two allocations
        instead of one, and no bit of the balance is ours to borrow.       */

    address[] internal _manifest;
    mapping(address => bool) public onManifest;

    event Sealed(uint64 until);
    event ManifestAdded(address indexed asset);
    event ManifestRemoved(address indexed asset);
    event Executed(address indexed to, uint256 value, bytes4 selector, bool sealedNow);

    error NotSigner();
    error OnlyCall();
    error RatchetOnly();
    error SealTooLong();
    error IsSealed();
    /// @dev A sealed call to a promised asset, carrying a word that is not
    ///      on the short allowlist. Named rather than enumerated.
    error NotSafeWhileSealed(bytes4 selector);
    error ValueWhileSealed();
    error Shrank(address asset, uint256 before_, uint256 after_);
    error ManifestFull();
    error AlreadyListed();
    error NotListed();
    /// @dev An asset that could be read before a call and not after it.
    error WentBlind(address asset);
    /// @dev A sealed call aimed at a manifest asset the account cannot read.
    error BlindTarget(address asset);
    error Reentered();
    error OwnershipCycle();
    error NoSession();
    error SessionExpired();
    error SessionTooLong();
    error WrongChain();
    error CannotReadHistory();
    error TargetNotAllowed(address target);
    error SelectorNotAllowed(bytes4 selector);
    error SpendCapExceeded(uint256 cap, uint256 wanted);
    error SpenderNotAllowed(address spender);
    error NoPrivilegeEscalation();
    error ListTooLong();

    /// @dev A lock, on a contract that can never be redeployed.
    ///
    ///      The ownership check already stops the obvious re-entry: a token
    ///      called from inside `_act` that calls back into `execute` arrives
    ///      as itself, not as the holder, and is refused. So this is not
    ///      closing a known hole.
    ///
    ///      It is here because the thing being protected is a *snapshot taken
    ///      around an external call*, and nested snapshots interleave in ways
    ///      that are hard to reason about and impossible to patch afterwards
    ///      — the implementation address is an input to every vault's
    ///      address, so this code is the code forever. On a contract with no
    ///      upgrade path, cheap insurance against a class of bug is worth
    ///      more than the gas it costs.
    uint256 private _entered;

    modifier nonReentrant() {
        if (_entered == 1) revert Reentered();
        _entered = 1;
        _;
        _entered = 0;
    }

    receive() external payable {}

    /*──────────────────── who this account belongs to ────────────────────*/

    /// @dev The registry appends salt, chainId, tokenContract and tokenId to
    ///      the proxy's runtime code. The proxy body is 45 bytes, so the
    ///      three values this needs begin at 0x4d.
    function token() public view returns (uint256 chainId, address tokenContract, uint256 tokenId) {
        bytes memory footer = new bytes(0x60);
        assembly {
            extcodecopy(address(), add(footer, 0x20), 0x4d, 0x60)
        }
        return abi.decode(footer, (uint256, address, uint256));
    }

    function owner() public view returns (address) {
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        if (chainId != block.chainid) return address(0);   // not our chain, not our owner
        return IERC721Min(tokenContract).ownerOf(tokenId);
    }

    function isValidSigner(address signer, bytes calldata) external view returns (bytes4) {
        return signer == owner() ? this.isValidSigner.selector : bytes4(0);
    }

    modifier onlySigner() {
        address o = owner();
        if (msg.sender != o) revert NotSigner();
        // an account that owns its own token can authorise itself forever
        if (o == address(this)) revert OwnershipCycle();
        _;
    }

    /*──────────────────── sealing ────────────────────*/

    /// @notice Promise that nothing on the manifest leaves before `until`.
    /// @dev    Ratchet-only, and it survives the sale of the token, because
    ///         it is a promise to whoever reads it rather than to whoever
    ///         made it.
    function seal(uint64 until) external onlySigner {
        if (until <= block.timestamp) revert RatchetOnly();
        if (until <= sealedUntil) revert RatchetOnly();
        if (until > block.timestamp + MAX_SEAL) revert SealTooLong();
        sealedUntil = until;
        emit Sealed(until);
    }

    function isSealed() public view returns (bool) {
        return sealedUntil > block.timestamp;
    }

    /// @notice Put an asset under the seal. Additive only: an asset can be
    ///         promised but never quietly un-promised, or the manifest would
    ///         be a promise that could be emptied instead of the vault.
    /*═══ the manifest cannot move while a call is being measured ═══

      `_snapshot` and `_verify` align `pre[]` and `seen[]` with the manifest
      BY INDEX. `unguard` removes an entry by swapping the last one into its
      place, so an `unguard` re-entered from inside a sealed call renumbers
      the manifest underneath arrays that were taken before it — and a slot
      whose `seen` flag was false because a BROKEN token used to sit there
      now holds a real one, which `_verify` therefore skips.

      Measured, not reasoned about. A contract holder guarded two assets, a
      breakable one and a thousand GOLD, sealed for thirty days, then made
      the breakable one unreadable and sent one batch: transfer the GOLD
      out, then call back into `unguard` on the blind asset. The transfer
      alone reverts — the control is in the suite. With the `unguard`
      appended it went through, the vault ended with nothing, and
      `isSealed()` still answered true.

      `_pieces` has the same shape and a worse version: `unguardNFT` refuses
      while sealed only for a piece the account STILL HOLDS, so a batch that
      transfers the piece away first is then free to drop it from the list,
      and `_verifyPieces` never looks for it. That is the whole promise of
      guarding a named NFT, defeated in two calls.

      Both are the same defect and both close the same way. `nonReentrant`
      does not cover this: the re-entry is into a different function. The
      manifest is holder bookkeeping and has no business changing in the
      middle of a call the account is measuring, so it cannot.

      Only while sealed. Unsealed, no snapshot is taken and no arrays exist
      to invalidate, and a batch that acquires a token and guards it in the
      same transaction is a thing somebody will reasonably want to do. */
    bool private _measuring;
    error ManifestBusy();
    modifier notWhileMeasuring() {
        if (_measuring) revert ManifestBusy();
        _;
    }

    function guard(address asset) external onlySigner notWhileMeasuring {
        if (onManifest[asset]) revert AlreadyListed();
        if (_manifest.length >= MAX_MANIFEST) revert ManifestFull();
        onManifest[asset] = true;
        _manifest.push(asset);
        emit ManifestAdded(asset);
    }

    /// @notice Take an asset off the manifest. Only while unsealed.
    /// @dev    `guard` used to be additive forever, on the reasoning that an
    ///         asset which could be un-promised makes the manifest emptiable
    ///         instead of the vault. That reasoning is right *while the seal
    ///         holds* and wrong outside it: an unsealed account promises
    ///         nothing, so removing an entry takes nothing away from anybody.
    ///
    ///         Append-only forever had a cost nobody was paying for. Sixteen
    ///         slots, no removal, and the manifest travels with the token —
    ///         so a holder who fills it leaves every future owner with a list
    ///         they cannot re-point, and the account permanently unable to
    ///         guard the asset that actually matters to them.
    ///
    ///         The seal is what makes the promise, and the seal is untouched:
    ///         while `isSealed()`, this reverts for everyone.
    function unguard(address asset) external onlySigner notWhileMeasuring {
        if (!onManifest[asset]) revert NotListed();

        /*  The escape hatch, and the reason it does not weaken the seal.

            The account refuses any call that ends with a manifest asset
            unreadable, which is correct — going blind is a state change the
            seal cannot attest to. But that rule is a door a manifest asset
            can shut on the account at will: a token whose balanceOf reverts
            on a condition it controls makes EVERY sealed call revert, and a
            reverted call never persists, so the trap re-arms itself. An
            adversarial review shut an account for the full length of its
            seal with no way out — unguard refused, the ratchet refused,
            sessions dead on the same path.

            So an asset the account cannot currently read may be removed
            even while sealed. This gives nothing away: the seal was already
            unable to promise anything about an asset it cannot measure, and
            `unmeasurable()` has been saying so publicly the whole time. What
            it removes is a stranger's ability to freeze somebody else's
            account by breaking a token.

            The event is emitted either way, so a buyer reading the log sees
            exactly when the promise narrowed and which asset left it.      */
        if (isSealed()) {
            (, bool ok) = _measure(asset);
            if (ok) revert IsSealed();
        }

        uint256 n = _manifest.length;
        for (uint256 i; i < n; ++i) {
            if (_manifest[i] == asset) {
                _manifest[i] = _manifest[n - 1];
                _manifest.pop();
                break;
            }
        }
        onManifest[asset] = false;
        emit ManifestRemoved(asset);
    }

    /*═══ the other manifest: NFTs, by identity ═══

      A count cannot express "this vault holds THAT one". So a guarded NFT
      is named by (collection, tokenId) and measured with `ownerOf`, which
      is exact. Bounded at eight because every entry is a call on every
      sealed action, and unlike balances there is no way to batch them.     */

    struct Piece { address collection; uint256 tokenId; }

    uint256 public constant MAX_PIECES = 8;
    Piece[] internal _pieces;

    event PieceGuarded(address indexed collection, uint256 indexed tokenId);
    event PieceReleased(address indexed collection, uint256 indexed tokenId);

    error PiecesFull();
    error NotHeld();
    error PieceLeft(address collection, uint256 tokenId);

    function guardNFT(address collection, uint256 tokenId) external onlySigner notWhileMeasuring {
        if (_pieces.length >= MAX_PIECES) revert PiecesFull();
        if (_ownerOfPiece(collection, tokenId) != address(this)) revert NotHeld();
        _pieces.push(Piece(collection, tokenId));
        emit PieceGuarded(collection, tokenId);
    }

    /// @dev Same rule as `unguard`: free while unsealed, and while sealed
    ///      only for a piece the account can no longer see.
    function unguardNFT(uint256 index) external onlySigner notWhileMeasuring {
        Piece memory pc = _pieces[index];
        if (isSealed() && _ownerOfPiece(pc.collection, pc.tokenId) == address(this)) {
            revert IsSealed();
        }
        _pieces[index] = _pieces[_pieces.length - 1];
        _pieces.pop();
        emit PieceReleased(pc.collection, pc.tokenId);
    }

    function pieces() external view returns (Piece[] memory) { return _pieces; }

    function _ownerOfPiece(address collection, uint256 tokenId) internal view returns (address) {
        (bool ok, bytes memory outv) =
            collection.staticcall(abi.encodeWithSignature("ownerOf(uint256)", tokenId));
        if (!ok || outv.length < 32) return address(0);
        return abi.decode(outv, (address));
    }

    /// @dev Every guarded piece must still be here. No amount involved, no
    ///      before-and-after: the question is only whether it is still ours.
    function _verifyPieces() internal view {
        uint256 n = _pieces.length;
        for (uint256 i; i < n; ++i) {
            if (_ownerOfPiece(_pieces[i].collection, _pieces[i].tokenId) != address(this)) {
                revert PieceLeft(_pieces[i].collection, _pieces[i].tokenId);
            }
        }
    }

    function manifest() external view returns (address[] memory) {
        return _manifest;
    }

    /// @notice Everything a buyer needs before agreeing a price: the date,
    ///         the assets under it, and what the account holds of each right
    ///         now.
    function holdings()
        external view
        returns (uint64 until, address[] memory assets, uint256[] memory balances, uint256 ether_)
    {
        until = sealedUntil;
        assets = _manifest;
        balances = new uint256[](assets.length);
        for (uint256 i; i < assets.length; ++i) balances[i] = _balance(assets[i]);
        ether_ = address(this).balance;
    }

    /*═══════════════════ SESSION KEYS ═══════════════════

      A key the holder grants to something that is not them — a bot, a
      keeper, an agent, a model — so it can act on the Reach without
      holding the token.

      Every session is bounded four ways, and all four are checked on
      every call: an expiry it cannot extend, an allowlist of targets it
      cannot widen, an allowlist of selectors it cannot widen, and a
      cumulative spend cap it cannot raise. The holder revokes instantly
      and unilaterally.

      Three escalations are refused by shape rather than by budget:

        · a session cannot call this account. Otherwise its first act is
          grantSession on itself with no limits, and every bound above
          becomes decorative.
        · a session cannot grant an approval to a spender that is not
          itself on the target allowlist. `approve` is called *on* the
          token contract, so allowlisting the target says nothing about
          who is being trusted — the argument has to be checked, not the
          callee. (This is the one place a venue registry genuinely earns
          its keep, and where the Dave Held approve-gate is exactly right.)
        · a session cannot touch the Grip, because the Grip has no
          function that spends. Nothing enforces this; there is nothing
          to enforce.

      The seal composes on top: while the Reach is sealed, a session is
      subject to the same measurement and the same refusals as the holder.
      A session is never *more* trusted than the person who granted it.  */

    struct Session {
        uint64  expires;
        uint128 spendCap;      // cumulative native value, over the session's life
        uint128 spent;
        bool    active;
        /*  How many times the token had changed hands when this key was
            granted. A session outlived the sale of the token it spends
            from: `sessionOf` is storage on this account, `executeAsSession`
            authorises out of that mapping alone, and the hub's transfer
            clears the ERC-4907 lease and the lease agent and nothing else.
            So a key the seller handed to a bot went on spending from the
            buyer's Reach — bounded by its expiry, its allowlists and its
            cap, and for up to a year.

            The mark is the hub's own transfer counter rather than the
            holder's address, because an address is not enough: sold to a
            stranger and bought back, an identity check would let every
            retired key wake up. A counter only goes forward.

            Four bytes, in the fifteen this struct was already leaving
            empty in its second slot. The check costs one staticcall to the
            hub, which is what `owner()` already does on every path.     */
        uint32  mark;
    }

    uint256 public constant MAX_LIST = 16;

    /// @dev The seal caps at a year. The market's bond caps at a year. This
    ///      did not cap at all, and accepted 2^64-1 — a key that outlives
    ///      everyone who could have revoked it. An adversarial review
    ///      pointed out it was the only time-promise in the collection
    ///      without a ceiling, which was an oversight rather than a
    ///      decision.
    uint64 public constant MAX_SESSION = 365 days;

    mapping(address => Session) public sessionOf;

    error SoldOn(uint32 granted, uint32 now_);

    /// @dev The hub's transfer count for this token. Fails closed: an
    ///      account that cannot read the history does not get to assume it
    ///      is unchanged.
    function _mark() internal view returns (uint32) {
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        if (chainId != block.chainid) revert WrongChain();
        (bool ok, bytes memory out) = tokenContract.staticcall(
            abi.encodeWithSelector(IERC721Min.statsOf.selector, tokenId));
        if (!ok || out.length < 64) revert CannotReadHistory();
        (, uint256 xfers, , ) = abi.decode(out, (uint256, uint256, uint256, uint256));
        return uint32(xfers);
    }

    /// @notice Whether a key is still the key the current holder inherited,
    ///         rather than one the person before them left running.
    function sessionCurrent(address key) public view returns (bool) {
        Session memory s = sessionOf[key];
        if (!s.active) return false;
        (uint256 chainId, address tokenContract, uint256 tokenId) = token();
        if (chainId != block.chainid) return false;
        (bool ok, bytes memory out) = tokenContract.staticcall(
            abi.encodeWithSelector(IERC721Min.statsOf.selector, tokenId));
        if (!ok || out.length < 64) return false;
        (, uint256 xfers, , ) = abi.decode(out, (uint256, uint256, uint256, uint256));
        return s.mark == uint32(xfers);
    }

    /*  Keyed by epoch as well as by address, and the epoch is the fix.

        `revokeSession` used to be `delete sessionOf[key]` — which clears the
        struct and leaves `sessionTarget` and `sessionSelector` standing,
        because Solidity cannot delete a mapping. Revocation looked total,
        since `active` gates every path. Then re-granting the same key wrote
        its new allowlists on top of the old ones, and every permission that
        key had EVER held came back. Grant [poolA], revoke, re-grant [poolB],
        and it can still reach poolA. An adversarial review reproduced it.

        Bumping an epoch on both grant and revoke retires the old entries
        without needing to enumerate them, which is the only way to clear a
        mapping in constant gas.                                            */
    mapping(address => uint256) public sessionEpoch;
    mapping(address => mapping(uint256 => mapping(address => bool))) internal _sessionTarget;
    mapping(address => mapping(uint256 => mapping(bytes4 => bool)))  internal _sessionSelector;

    function sessionTarget(address key, address target) public view returns (bool) {
        return _sessionTarget[key][sessionEpoch[key]][target];
    }
    function sessionSelector(address key, bytes4 sel) public view returns (bool) {
        return _sessionSelector[key][sessionEpoch[key]][sel];
    }

    event SessionGranted(address indexed key, uint64 expires, uint128 spendCap);
    event SessionRevoked(address indexed key);
    event SessionActed(address indexed key, address indexed to, uint256 value, bytes4 selector);

    /*  Two lists, not a list of pairs — and that is a wider grant than it
        looks. `targets` and `selectors` are checked independently, so a key
        granted [venueA, venueB] × [deposit, withdraw] may withdraw from A
        even if the intent was "deposit to A, withdraw from B". Every
        combination is authorised.

        It is left this way on purpose. Storing explicit pairs would mean
        writing up to sixteen-by-sixteen entries in one grant — two hundred
        and fifty-six SSTOREs, about five million gas — to express something
        the holder can already express exactly: **one key per pair.** Keys
        are free; storage is not.

        So this is documented rather than fixed, and pinned by a test, which
        is the difference between a design decision and a surprise. Before
        granting, `sessionAllows(key, target, selector)` answers for any
        combination you care to ask about.                                 */
    /// @notice Hand a bounded key to something that is not you.
    /// @dev    Re-granting an existing key overwrites its terms and resets
    ///         what it has spent, which is the only sane reading of
    ///         "these are the new terms".
    function grantSession(
        address key,
        uint64 expires,
        uint128 spendCap,
        address[] calldata targets,
        bytes4[] calldata selectors
    ) external onlySigner {
        if (key == address(0) || key == address(this)) revert NoPrivilegeEscalation();
        if (targets.length > MAX_LIST || selectors.length > MAX_LIST) revert ListTooLong();
        if (expires > block.timestamp + MAX_SESSION) revert SessionTooLong();

        // every grant is a fresh epoch: nothing a previous grant allowed
        // survives into this one, whether or not it was revoked first
        unchecked { sessionEpoch[key] += 1; }
        uint256 e = sessionEpoch[key];

        Session storage s = sessionOf[key];
        s.expires = expires;
        s.spendCap = spendCap;
        s.spent = 0;
        s.active = true;
        s.mark = _mark();

        for (uint256 i; i < targets.length; ++i) {
            // an allowlist entry pointing back here is the escalation again
            if (targets[i] == address(this)) revert NoPrivilegeEscalation();
            _sessionTarget[key][e][targets[i]] = true;
        }
        for (uint256 i; i < selectors.length; ++i) _sessionSelector[key][e][selectors[i]] = true;

        emit SessionGranted(key, expires, spendCap);
    }

    /// @notice Immediate and unilateral. No delay, no notice, no appeal.
    function revokeSession(address key) external onlySigner {
        delete sessionOf[key];
        // and retire the allowlists, which a delete cannot reach
        unchecked { sessionEpoch[key] += 1; }
        emit SessionRevoked(key);
    }

    function sessionAllows(address key, address to, bytes4 selector)
        external view returns (bool)
    {
        Session memory s = sessionOf[key];
        return s.active && s.expires >= block.timestamp
            && sessionCurrent(key)
            && sessionTarget(key, to) && sessionSelector(key, selector);
    }

    /// @notice Act under a session key rather than as the holder.
    function executeAsSession(address to, uint256 value, bytes calldata data)
        external nonReentrant returns (bytes memory result)
    {
        /*  An ownership cycle is checked in `onlySigner`, and this is not
            `onlySigner`. That asymmetry was a hole with no floor under it:
            move the token into its own Reach and every holder path reverts
            OwnershipCycle forever, while an already-granted session key
            keeps full spending power that literally nobody can revoke —
            there is no address left that `onlySigner` will accept. An
            adversarial review reproduced it and walked the balance out.

            So the cycle is checked here too. In that state the assets are
            stuck, which is bad; they are not stealable, which is the part
            that matters. `onERC721Received` now also refuses the token at
            the door, but a plain `transferFrom` fires no hook, so the door
            alone was never going to be enough.                            */
        if (owner() == address(this)) revert OwnershipCycle();

        Session storage s = sessionOf[msg.sender];
        if (!s.active) revert NoSession();
        if (s.expires < block.timestamp) revert SessionExpired();
        /*  The key has to belong to the holder who granted it. Without
            this, a key handed out before a sale keeps spending from the
            buyer's Reach until it expires — up to a year — and the buyer
            has no way to know without reading storage they were never
            told to read.                                              */
        {
            uint32 now_ = _mark();
            if (s.mark != now_) revert SoldOn(s.mark, now_);
        }
        if (to == address(this)) revert NoPrivilegeEscalation();
        if (!sessionTarget(msg.sender, to)) revert TargetNotAllowed(to);

        bytes4 sel = data.length >= 4 ? bytes4(data[0:4]) : bytes4(0);
        if (!sessionSelector(msg.sender, sel)) revert SelectorNotAllowed(sel);

        // an approval is a standing authority, so the party being trusted
        // has to be one the holder named, not merely the contract it is
        // named on
        if (sel == 0x095ea7b3 || sel == 0x39509351) {
            if (data.length < 68) revert SpenderNotAllowed(address(0));
            (address spender,) = abi.decode(data[4:], (address, uint256));
            if (!sessionTarget(msg.sender, spender)) revert SpenderNotAllowed(spender);
        } else if (sel == 0xa22cb465) {
            if (data.length < 68) revert SpenderNotAllowed(address(0));
            (address operator, bool okFlag) = abi.decode(data[4:], (address, bool));
            if (okFlag && !sessionTarget(msg.sender, operator)) revert SpenderNotAllowed(operator);
        }

        if (value != 0) {
            uint256 wanted = uint256(s.spent) + value;
            if (wanted > s.spendCap) revert SpendCapExceeded(s.spendCap, wanted);
            s.spent = uint128(wanted);
        }

        result = _act(to, value, data);
        emit SessionActed(msg.sender, to, value, sel);
    }

    /*──────────────────── acting ────────────────────*/

    /*═══════════════════ BATCHING ═══════════════════

      One approval and one action are one act, or neither happened. Without
      this a holder who wants to approve a venue and then use it has to send
      two transactions and live in the gap between them — and under a seal
      the gap is worse than untidy, because the first half can be front-run
      by anything that watches the mempool.

      The measurement wraps the WHOLE batch rather than each call, and that
      is deliberate. Per-call measurement would refuse the ordinary shape of
      real work — withdraw from one venue, deposit into another — because the
      account is genuinely poorer between the two. The seal's promise has
      always been about the state a transaction leaves behind, not about every
      instant inside it. Nothing can observe the middle of a batch except code
      the batch itself called, and that code cannot re-enter (see
      `nonReentrant`) or move an asset the ends do not account for.

      Approvals are still refused call by call, because an approval's damage
      lands in a later block where no end-of-batch measurement can reach it. */

    struct Call { address to; uint256 value; bytes data; }

    uint256 public constant MAX_BATCH = 16;

    function executeBatch(Call[] calldata calls)
        external payable onlySigner nonReentrant returns (bytes[] memory results)
    {
        uint256 n = calls.length;
        if (n == 0 || n > MAX_BATCH) revert ListTooLong();

        bool locked = isSealed();
        uint256[] memory pre;
        bool[] memory seen;
        uint256 preEth;
        if (locked) {
            if (msg.value != 0) revert ValueWhileSealed();
            (pre, seen, preEth) = _snapshot();
        }

        if (locked) _measuring = true;

        results = new bytes[](n);
        for (uint256 i; i < n; ++i) {
            if (locked) {
                if (calls[i].value != 0) revert ValueWhileSealed();
                _refuseUnlessSafe(calls[i].to, calls[i].data);
                _refuseBlindTarget(calls[i].to, seen);
            }
            unchecked { state++; }

            (bool ok, bytes memory result) = calls[i].to.call{value: calls[i].value}(calls[i].data);
            if (!ok) {
                assembly { revert(add(result, 0x20), mload(result)) }
            }
            results[i] = result;
            emit Executed(calls[i].to, calls[i].value,
                          calls[i].data.length >= 4 ? bytes4(calls[i].data[0:4]) : bytes4(0), locked);
        }

        if (locked) { _measuring = false; _verify(pre, seen, preEth); }
    }

    /// @notice ERC-6551 execute. Only CALL; only the holder.
    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external payable onlySigner nonReentrant returns (bytes memory result)
    {
        if (operation != 0) revert OnlyCall();

        result = _act(to, value, data);
    }

    /// @dev The gauntlet, shared by the holder and by every session key, so
    ///      that a session is never more trusted than whoever granted it.
    function _act(address to, uint256 value, bytes calldata data)
        internal returns (bytes memory result)
    {
        bool locked = isSealed();
        uint256[] memory pre;
        bool[] memory seen;
        uint256 preEth;

        if (locked) {
            // ether is not on any manifest and cannot be measured after the
            // fact against a payable call, so it is simply refused
            if (value != 0) revert ValueWhileSealed();
            if (msg.value != 0) revert ValueWhileSealed();
            _refuseUnlessSafe(to, data);
            (pre, seen, preEth) = _snapshot();
            _refuseBlindTarget(to, seen);
            _measuring = true;
        }

        unchecked { state++; }

        bool ok;
        (ok, result) = to.call{value: value}(data);
        if (!ok) {
            // bubble the callee's own revert rather than flattening it
            assembly {
                revert(add(result, 0x20), mload(result))
            }
        }

        if (locked) { _measuring = false; _verify(pre, seen, preEth); }

        emit Executed(to, value, data.length >= 4 ? bytes4(data[0:4]) : bytes4(0), locked);
    }

    /*──────────────────── the two defences ────────────────────*/

    /// @dev An approval moves nothing, so measurement is blind to it: the
    ///      loss lands in a later block, outside any window this call can
    ///      see. There is no venue registry here to make exceptions for, so
    ///      there are no exceptions.
    /*═══ what a sealed account may say to an asset it has promised ═══

      This used to be a list of six approval selectors, refused by name. The
      file's own comment three screens up says an enumeration cannot be
      completed — that is the entire argument for measuring balances instead
      of listing transfer words — and then the approval defence was an
      enumeration anyway, because measurement is structurally blind to an
      authority that moves nothing yet.

      An adversarial review walked straight through it with Permit2's
      `approve(address,address,uint160,uint48)`. Same standing custody,
      different word, not on the list. It never would be: the list can only
      contain approval shapes somebody had already thought of.

      So the polarity is inverted, at the one boundary where it can be.
      While sealed, a call to an asset ON THE MANIFEST must carry a selector
      from a short allowlist. Everything else is refused — approvals in every
      shape, permits in every shape, delegations, and words nobody has
      invented yet, all by the same rule and without naming any of them.

      The allowlist is exactly the two words whose damage measurement can
      see, because those are the only ones that need to be allowed:

          transfer(address,uint256)                 0xa9059cbb
          transferFrom(address,address,uint256)     0x23b872dd

      A call to anything NOT on the manifest is unrestricted. An approval on
      an asset the seal never promised is an approval over something nobody
      was promised, and refusing it would be theatre.

      The cost is real and worth stating: a holder who wants to `claim()` on
      a manifest asset while sealed cannot. They can unguard it before
      sealing, or not guard it. Deny-by-default means some legitimate things
      are denied; that is what the word default is doing.                  */
    function _refuseUnlessSafe(address to, bytes calldata data) internal view {
        if (!onManifest[to]) return;                 // not promised, not policed
        if (data.length < 4) revert NotSafeWhileSealed(bytes4(0));

        bytes4 sel = bytes4(data[0:4]);
        if (sel != 0xa9059cbb && sel != 0x23b872dd) revert NotSafeWhileSealed(sel);
    }

    function _snapshot()
        internal view
        returns (uint256[] memory pre, bool[] memory seen, uint256 preEth)
    {
        uint256 n = _manifest.length;
        pre = new uint256[](n);
        seen = new bool[](n);
        for (uint256 i; i < n; ++i) {
            (pre[i], seen[i]) = _measure(_manifest[i]);
        }
        preEth = address(this).balance;
    }

    /// @dev The whole point: what the call *did* does not matter, only what
    ///      is left. A selector nobody has heard of is caught here.
    ///
    ///      An asset that could not be read before the call is not checked
    ///      after it — there is no number to compare against, and inventing
    ///      one would either brick the account or fake a promise. It is named
    ///      by `unmeasurable()` instead.
    ///
    ///      An asset that COULD be read before and cannot be read after is a
    ///      different matter, and it reverts: a call that ends with the
    ///      account unable to see an asset it could see a moment ago has
    ///      moved the account outside what the seal can attest to, and the
    ///      seal refuses rather than shrug.
    function _verify(uint256[] memory pre, bool[] memory seen, uint256 preEth) internal view {
        uint256 n = _manifest.length;
        for (uint256 i; i < n; ++i) {
            if (!seen[i]) continue;                        // was already blind here
            (uint256 now_, bool ok) = _measure(_manifest[i]);
            if (!ok) revert WentBlind(_manifest[i]);
            if (now_ < pre[i]) revert Shrank(_manifest[i], pre[i], now_);
        }
        if (address(this).balance < preEth) revert Shrank(address(0), preEth, address(this).balance);
        _verifyPieces();
    }

    /*  The other half of the blindness rule, and the half that was missing.

        An asset that could not be read at snapshot time is skipped by
        `_verify` — there is no number to compare against, and inventing one
        would either brick the account or fake a promise. That is right, and
        it left a door open: the call being checked can be a call TO that
        very asset, which empties it and restores its readability on the way
        out. Snapshot sees nothing, the drain happens, verify skips it. An
        adversarial review reproduced it with a pausable token whose
        withdrawal function unpauses first — the identical call is refused
        while the asset is readable and goes through while it is not.

        So: while sealed, the account will not call an asset it cannot
        currently measure. It is not a rule about what the call might do —
        it is a rule about the account's own eyesight. If it cannot see the
        thing it is about to poke, it does not poke it.                    */
    function _refuseBlindTarget(address to, bool[] memory seen) internal view {
        uint256 n = _manifest.length;
        for (uint256 i; i < n; ++i) {
            if (_manifest[i] == to && !seen[i]) revert BlindTarget(to);
        }
    }

    /// @dev balanceOf(address) is the same WORD for ERC-20 and ERC-721 and
    ///      not the same FACT: for a token it is an amount, for an NFT it is
    ///      a count. The manifest used to claim it covered both, and an
    ///      adversarial review swapped a valuable NFT out of a sealed vault
    ///      for a worthless one — one out, one in, count unmoved, nothing to
    ///      measure. Identity needs its own list; see `guardNFT`.
    ///
    ///      `ok` is returned separately, and the distinction is load-bearing.
    ///      An asset that ANSWERS zero and an asset that DOES NOT ANSWER are
    ///      not the same fact, and collapsing them was a silent hole: a token
    ///      whose proxy breaks, whose implementation is gone, or which
    ///      reverts for this address reads as zero both before and after a
    ///      call, so `now_ < pre` is false and the seal quietly stops
    ///      promising anything about it — with no revert and no event.
    ///
    ///      Refusing every sealed call instead would be worse. It is the
    ///      shape of the bug that bricks Dave's ragequit: a third party who
    ///      gets one asset onto the list can freeze the whole account for the
    ///      length of the seal. (Only the holder can `guard` here, so nobody
    ///      else can aim it — but a token can break on its own, and a promise
    ///      that depends on every listed token staying healthy for a year is
    ///      not a promise.)
    ///
    ///      So the account measures what it can, does not pretend about what
    ///      it cannot, and says which is which. See `unmeasurable`.
    function _measure(address asset) internal view returns (uint256 value, bool ok) {
        bytes memory out;
        (ok, out) =
            asset.staticcall(abi.encodeWithSelector(IERC20Bal.balanceOf.selector, address(this)));
        if (!ok || out.length < 32) return (0, false);
        return (abi.decode(out, (uint256)), true);
    }

    function _balance(address asset) internal view returns (uint256 value) {
        (value, ) = _measure(asset);
    }

    /// @notice Which manifest assets this account cannot currently measure —
    ///         and therefore cannot currently promise about.
    /// @dev    A buyer reads this next to `holdings()`. An empty list is the
    ///         seal at full strength; a non-empty one names exactly what has
    ///         fallen out of it, which is the difference between a limitation
    ///         and a lie.
    function unmeasurable() external view returns (address[] memory assets) {
        uint256 n = _manifest.length;
        address[] memory buf = new address[](n);
        uint256 k;
        for (uint256 i; i < n; ++i) {
            (, bool ok) = _measure(_manifest[i]);
            if (!ok) buf[k++] = _manifest[i];
        }
        assets = new address[](k);
        for (uint256 i; i < k; ++i) assets[i] = buf[i];
    }

    /*──────────────────── receiving ────────────────────*/

    /// @dev Refuses this account's own token. An account that owns the token
    ///      that owns it can authorise itself forever, and no holder
    ///      function can ever run again. A plain `transferFrom` fires no
    ///      hook, so this closes the polite door only — see the cycle check
    ///      in `executeAsSession` for the other one.
    function onERC721Received(address, address, uint256 tokenId, bytes calldata)
        external view returns (bytes4)
    {
        (uint256 chainId, address tokenContract, uint256 id) = token();
        if (msg.sender == tokenContract && tokenId == id && chainId == block.chainid) {
            revert OwnershipCycle();
        }
        return this.onERC721Received.selector;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external pure returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    /*──────────────────── ERC-1271 ────────────────────*/

    /*═══════════════════ ERC-1271 — the voice, and its wall ═══════════════

      A sealed account used to return zero to every signature, which is the
      safe answer and the wrong one. A signature is how an account says
      something, and an account that cannot say anything for a year is not
      sealed, it is gagged. It cannot prove to a counterparty that it is the
      thing holding what it holds. For a token whose whole argument is that
      it acts, that is half the argument missing.

      But the reason for the gag was real: an unrestricted `isValidSignature`
      on a sealed account is a hole straight through the seal. Sign a market
      order, hand the assets over, and no measurement ever runs — because no
      call was ever made to this contract to measure around. Refusing every
      signature closed that hole by removing the capability, at the cost of
      the capability.

      The resolution is domain separation, and it is arithmetic rather than a
      list. (Taken from the DAVE V2 design note, which is right about this.)

        UNSEALED   any digest. The account is not promising anything, so its
                   signature is worth exactly what its holder's is.

        SEALED     only digests this account can rebuild under ITS OWN
                   EIP-712 domain. The caller hands over the preimage; the
                   account recomputes the digest from `IPSEITY_ATTESTATION`
                   with `verifyingContract = address(this)` and checks it
                   equals the hash it was asked about, before it verifies a
                   single byte of signature.

      Every venue hashes its orders under its own domain separator — its own
      name, its own version, its own verifyingContract. So an order hash can
      never be the output of this account's `_attestationDigest`, and a sealed
      account is structurally incapable of signing one. Not disallowed:
      incapable. There is no venue to add to an allowlist and no allowlist to
      get wrong.

      What a sealed account CAN still do is say what it is — attest to a
      statement, prove its conviction to a counterparty, sign into something
      that speaks its language. It says who it is and cannot promise what it
      holds, which is exactly the shape of a seal.                          */

    bytes32 private constant _DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    /*  A nonce and a deadline, because the first version had neither and a
        signature therefore authenticated the same statement to everyone,
        forever, with no way to retire it short of the seal lapsing. An
        attestation is how a sealed account says who it is; "who I am" is
        still a claim that should be able to go stale.                     */
    bytes32 private constant _ATTESTATION_TYPEHASH =
        keccak256("Attestation(string purpose,bytes32 payload,uint256 nonce,uint64 deadline)");

    /// @notice Bumped by the holder to retire every attestation at once.
    uint256 public attestationNonce;

    event AttestationsRetired(uint256 nonce);

    /// @notice Invalidate every signature this account has ever given.
    function retireAttestations() external onlySigner {
        unchecked { attestationNonce += 1; }
        emit AttestationsRetired(attestationNonce);
    }
    bytes32 private constant _NAME_HASH = keccak256("IPSEITY_ATTESTATION");
    bytes32 private constant _VERSION_HASH = keccak256("1");

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(_DOMAIN_TYPEHASH, _NAME_HASH, _VERSION_HASH,
                                    block.chainid, address(this)));
    }

    /// @notice The only digest a sealed account will ever put its name to.
    function attestationDigest(string memory purpose, bytes32 payload, uint64 deadline)
        public view returns (bytes32)
    {
        return keccak256(abi.encodePacked(
            "\x19\x01",
            domainSeparator(),
            keccak256(abi.encode(_ATTESTATION_TYPEHASH, keccak256(bytes(purpose)), payload,
                                 attestationNonce, deadline))
        ));
    }

    /// @notice Decode an attestation envelope. External so the account can
    ///         call it through `try`, which is the only way to attempt an
    ///         `abi.decode` without a malformed blob reverting the caller.
    /// @dev    ERC-1271 owes its callers a plain no, not a revert.
    function decodeAttestation(bytes calldata blob)
        external pure
        returns (string memory purpose, bytes32 payload, uint64 deadline, bytes memory inner)
    {
        return abi.decode(blob, (string, bytes32, uint64, bytes));
    }

    /// @notice ERC-1271.
    /// @param  signature while unsealed, 65 bytes. While sealed,
    ///         `abi.encode(string purpose, bytes32 payload, bytes inner)` —
    ///         the preimage, so the account can rebuild the digest itself
    ///         instead of taking a hash on trust.
    function isValidSignature(bytes32 hash, bytes calldata signature)
        external view returns (bytes4)
    {
        if (!isSealed()) {
            return _signedByHolder(hash, signature) ? bytes4(0x1626ba7e) : bytes4(0);
        }

        // sealed: the hash has to be one this account could have built
        try this.decodeAttestation(signature)
            returns (string memory purpose, bytes32 payload, uint64 deadline, bytes memory inner)
        {
            if (deadline < block.timestamp) return bytes4(0);
            if (hash != attestationDigest(purpose, payload, deadline)) return bytes4(0);
            return _signedByHolder(hash, inner) ? bytes4(0x1626ba7e) : bytes4(0);
        } catch {
            return bytes4(0);
        }
    }

    function _signedByHolder(bytes32 hash, bytes memory signature) internal view returns (bool) {
        if (signature.length != 65) return false;

        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
        // reject the malleable upper half of the curve order
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return false;
        }
        address signer = ecrecover(hash, v, r, s);
        return signer != address(0) && signer == owner();
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7    // ERC-165
            || id == 0x6faff5f1    // IERC6551Account
            || id == 0x51945447    // IERC6551Executable
            || id == 0x150b7a02    // ERC721Receiver
            || id == 0x4e2312e0;   // ERC1155Receiver
    }
}
