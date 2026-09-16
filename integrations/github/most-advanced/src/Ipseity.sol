// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    IERC165, IERC721, IERC721Metadata, IERC721Enumerable, IERC721Receiver,
    IERC2981, IERC4906, IERC4907, IERC5192, IERC6454, IERC7572,
    IERC721MultiMetadata, IERC7496, IERC6551Registry, IERC173, ISealedKernel, IDataVerifier
} from "./interfaces/Standards.sol";
import {Section, TokenView} from "./lib/Types.sol";

interface IRenderer {
    function facetCount() external view returns (uint256);
    function facetURI(TokenView calldata v, uint256 index) external view returns (string memory);
    function collectionURI(address collection, uint256 supply, uint256 ceiling)
        external view returns (string memory);
    function traitMetadataURI() external view returns (string memory);
}

/*═══════════════════════════════════════════════════════════════════════════

   I P S E I T Y                    the property of being oneself

   A four-dimensional solid, and the instrument for turning it, are the
   same token.

   What a holder sees is a three-dimensional section of a 4-polytope: the
   solid itself is never on screen, only the 3-space that currently cuts
   through it. The orientation of that cut — six plane angles, a position
   along w, which solid, and the colour the interface takes from it — is
   one 256-bit word in this contract's storage.

   tokenURI() returns the instrument for editing that word. It is a WebGL2
   engine, a keccak-256, an ABI coder and a wallet client, held in this
   chain's state as contract bytecode and handed back as a data: URI. It
   connects a wallet, reads this contract, encodes calldata, and signs
   transactions — including transactions against this contract, which
   change the word, which changes what it renders the next time anyone
   opens it. The instrument can also open itself, inside itself, one
   section deeper, until the plane runs out of room.

   Nothing is fetched. No IPFS, no gateway, no CDN, no font, no library.

   ── what this token answers to ──────────────────────────────────────
     ERC-165, ERC-721 (+Metadata, +Enumerable)
     ERC-2981   royalties
     ERC-4906   metadata-changed events, fired on every commit, so an
                indexer that caches tokenURI knows to come back
     ERC-4907   a user who is not the owner — and who may turn the solid,
                because an instrument you cannot operate is not lent
     ERC-5192   the holder may bind the token to themselves, one way,
                and unbind it again
     ERC-6454   a straight answer to "can this move", asked before trying
     ERC-7160   one token, several faces: the living instrument, the still
                sigil, and a specimen sheet of four sections along w. The
                4-polytope genuinely has more than one face; the holder
                pins which one the market sees
     ERC-7496   the traits, on chain, readable without parsing a data URI
     ERC-7572   metadata for the collection itself
     ERC-6551   an account bound to the token, derived by CREATE2
     ERC-173    who administers the collection, which is how a marketplace
                decides whether you may edit your own collection page

   And one mechanism that is deliberately not a standards claim: a sealed
   kernel, in the spirit of ERC-7857 but under its own name, because this
   contract's entry points are not that specification's and saying
   otherwise in an immutable contract would be a lie. See the long note in
   interfaces/Standards.sol.

═══════════════════════════════════════════════════════════════════════════*/
contract Ipseity is
    IERC721Metadata, IERC721Enumerable, IERC2981, IERC4906, IERC4907,
    IERC5192, IERC6454, IERC7572, IERC721MultiMetadata, IERC7496, IERC173, ISealedKernel
{
    using Section for uint256;

    /*──────────────────────── identity ────────────────────────*/
    string public constant name   = "IPSEITY";
    string public constant symbol = "IPSE";

    /*═══ one collection, several chains, one numbering ═══

      The whole edition is four thousand and ninety-six, and it is cut into
      contiguous bands — one per chain, fixed in the constructor and never
      moved. A token minted here is numbered inside this chain's band, so
      #1337 names exactly one token in the world, and nothing has to be
      asked of another chain to know it. No bridge, no oracle, no shared
      counter, no trust: an arithmetic fact about a constructor argument,
      settled before the first mint and unable to drift afterwards.

      Why not a full edition per chain: four collections of four thousand
      are four collections, however they are branded.

      Why not a token that travels: everything this collection is about
      hangs off the token through an ERC-6551 account whose address is
      derived from `block.chainid` and from this contract's own address.
      A token that crossed would arrive with correct artwork and empty
      hands — no vault, no Grip, no rooms it stewards, no seal. The number
      can travel. The thing it names cannot.                            */
    uint256 public constant COLLECTION = 4096;

    /// @notice The first and last id this deployment may ever issue.
    uint256 public immutable FIRST_ID;
    uint256 public immutable LAST_ID;

    /// @notice How many this chain can issue. The global edition is
    ///         `COLLECTION`; this is one band of it.
    uint256 public immutable MAX_SUPPLY;

    error BadBand();

    /*  The instruments that only look are open from birth. The ones that
        move value are sealed until the holder deliberately opens them.

        Born open, and the bit each one is:
          0 Self · 1 Rotate · 2 Section · 7 Scan · 8 Vault · 11 Nest
        which is 0x987. Sealed: Send, Assets, Call, Sign, Issue, Market.

        This constant read 0x587 for its whole life, which opens bit 10 —
        MARKET — and leaves Nest sealed. Exactly backwards from the rule
        stated one line above it: Market is the token's own automated
        market maker, the single instrument in the set that moves the most
        value, and Nest does nothing but draw the token inside itself. So
        every token shipped with the money panel open and the holder was
        charged to unlock a picture. A suite assertion pinned 0x587 as
        though it were the design, which is how it survived.

        It is a constant, so it is settled at deployment and settled
        forever for every token in the band.                             */
    uint16 public constant BORN_OPEN = 0x987;
    uint16 public constant ALL_OPEN  = 0xFFF;
    uint8  public constant NODE_COUNT = 12;

    /*──────────────────────── ERC-6551 ────────────────────────*/
    IERC6551Registry public constant REGISTRY =
        IERC6551Registry(0x000000006551c19487814612e58FE06813775758);
    /// @notice The account implementation every token's vault runs.
    /// @dev    ERC-6551 makes the registry canonical and the implementation a
    ///         parameter. Most collections pass the reference implementation
    ///         and inherit its one structural gap: a holder can empty the
    ///         vault between agreeing a price for the token and settling it.
    ///         This collection passes its own, which can be sealed — see
    ///         IpseityAccount.sol. Immutable, because the account address is
    ///         derived from it and a mutable implementation would mean a
    ///         mutable vault address.
    address public immutable ACCOUNT_IMPL;
    /// @notice Two hands, two salts, two accounts per token.
    ///
    ///   REACH  a working account. Trades, signs, claims, can be sealed for
    ///          a time, and can be emptied by its holder whenever it is not.
    ///          It can be drained, and that is disclosed rather than fixed —
    ///          an account with nothing at risk proves nothing by holding.
    ///
    ///   GRIP   receives and never spends. No execute, no withdraw, no
    ///          rescue, no admin. What a buyer reads out of it is a floor
    ///          rather than a snapshot, because the seller has no function
    ///          with which to move it.
    ///
    /// The split is taken from the CONGREGATION meld design. The point is
    /// not that the Grip is guarded better than the Reach; it is that the
    /// Grip has nothing to guard, because the capability to spend was never
    /// written. One hand holds, one hand reaches.
    bytes32 public constant REACH_SALT = bytes32(0);
    bytes32 public constant GRIP_SALT  = keccak256("IPSEITY.GRIP.v1");

    /// @dev Kept as an alias so the ERC-6551 convention of "the" account
    ///      still resolves, and resolves to the one that can act.
    bytes32 public constant ACCOUNT_SALT = REACH_SALT;

    address public immutable GRIP_IMPL;

    /*──────────────────────── state ────────────────────────*/
    /// @notice The orientation of every token's section. One word, one store.
    mapping(uint256 => uint256) public sectionOf;
    mapping(uint256 => bytes32) public seedOf;

    struct Stats {
        uint32 ops;        // every operation the token has performed
        uint32 strata;     // commits — each one folds the field a little more
        uint32 xfers;      // owner-to-owner transfers
        uint16 open;       // which instruments are unsealed
        uint64 lastOp;
        uint64 mintBlock;
    }
    mapping(uint256 => Stats) internal _stats;

    struct UserInfo { address user; uint64 expires; }
    mapping(uint256 => UserInfo) internal _users;

    mapping(uint256 => bool)    internal _locked;    // ERC-5192
    mapping(uint256 => uint256) internal _pinned;    // ERC-7160, 1-based; 0 = unpinned

    /*──────────────────────── ERC-7857 kernel ────────────────────────*/
    /// @dev `sealedTo` is the key handle the payload was encrypted to, which
    ///      is opaque on chain. `sealedOwner` is the address that held the
    ///      token when that happened, which is not — comparing it with
    ///      `ownerOf` is what lets `kernelStatus` derive staleness with no
    ///      hook and no gas. Both fit alongside `version` and the two flags
    ///      in a single slot, so the derivation costs nothing to store.
    struct Kernel {
        bytes32 sealedTo;
        uint64  version;
        bool    active;
        address sealedOwner;
        bool    proved;
    }
    mapping(uint256 => Kernel)    internal _kernel;
    mapping(uint256 => bytes32[]) internal _dataHashes;
    mapping(uint256 => mapping(address => bool)) public usageAuthorised;
    /// @notice Which token a cloned token was drawn from. Zero if it was minted.
    mapping(uint256 => uint256) public parentOf;
    IDataVerifier public verifier;

    /*──────────────────────── ERC-721 ────────────────────────*/
    uint256 public totalSupply;
    mapping(uint256 => address) internal _ownerOf;
    mapping(address => uint256) internal _balanceOf;
    mapping(uint256 => address) public  getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    // enumeration
    mapping(address => mapping(uint256 => uint256)) internal _ownedTokens;
    mapping(uint256 => uint256) internal _ownedIndex;

    /*──────────────────────── curation ────────────────────────*/
    /// @dev `curator` is the ERC-173 owner; owner() is the alias marketplaces
    ///      actually call. One variable, two names, so they cannot diverge.
    address public curator;
    address public pendingCurator;
    /// @notice The market contract for this collection, if one exists. The
    ///         instrument reads it out of the state block rather than being
    ///         told; sealing the renderer fixes it for good.
    address public pool;
    IRenderer public renderer;
    bool     public rendererSealed;
    uint256  public price     = 0.01 ether;
    uint256  public openFee   = 0.002 ether;
    address  public royaltyReceiver;
    uint96   public royaltyBps = 500;      // 5%

    /*──────────────────────── events ────────────────────────*/
    event Committed(uint256 indexed id, uint256 word, uint32 strata);
    event NodeOpened(uint256 indexed id, uint8 node, uint16 open);
    event Operated(uint256 indexed id, uint32 ops);
    event Embodied(uint256 indexed id, address account);
    event RendererChanged(address renderer);
    event RendererSealed();
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);

    /*──────────────────────── errors ────────────────────────*/
    error NotCurator();
    error NotHolder();
    error NotOperator();
    error Nonexistent();
    error SoldOut();
    error Underpaid();
    error BadSection();
    error BadNode();
    error AlreadyOpen();
    error IsLocked();
    error NotTransferable();
    error TraitNotSettable();
    error NoRenderer();
    error AlreadySealed();
    error BadIndex();
    error NoVerifier();
    error ProofRejected();
    error KernelInactive();
    error VerifierFixed();
    error ZeroAddress();
    error NotReceiver();
    error Reentrancy();

    modifier onlyCurator() {
        if (msg.sender != curator) revert NotCurator();
        _;
    }

    /// @dev The holder, or anyone the holder has approved. Not the renter.
    /// @dev The bolt answers to the holder alone. `onlyHolder` admits an
    ///      approved operator, which is right for trading and wrong here:
    ///      an approval is precisely what a phished wallet has already
    ///      given away, so a bolt an operator can lift is a bolt that
    ///      stops nobody. Measured before this existed \x2014 an approved
    ///      address could `unlock` and then take the token, which is the
    ///      whole attack the bolt claims to answer. The token's own
    ///      account is allowed because it is the holder wearing its other
    ///      hand.
    modifier onlyOwner(uint256 id) {
        address o = _ownerOf[id];
        if (o == address(0)) revert Nonexistent();
        if (msg.sender != o) {
            if (address(REGISTRY).code.length == 0 || msg.sender != account(id))
                revert NotHolder();
        }
        _;
    }

    modifier onlyHolder(uint256 id) {
        address o = _ownerOf[id];
        if (o == address(0)) revert Nonexistent();
        if (msg.sender != o && !isApprovedForAll[o][msg.sender] && getApproved[id] != msg.sender)
            revert NotHolder();
        _;
    }

    /// @dev Whoever is holding the instrument right now: the owner, someone
    ///      they approved, or the current ERC-4907 user. An instrument that
    ///      the borrower cannot operate has not really been lent.
    modifier onlyOperator(uint256 id) {
        address o = _ownerOf[id];
        if (o == address(0)) revert Nonexistent();
        UserInfo memory u = _users[id];
        bool renter = u.user == msg.sender && u.expires >= block.timestamp;
        if (msg.sender != o && !isApprovedForAll[o][msg.sender]
            && getApproved[id] != msg.sender && !renter) revert NotOperator();
        _;
    }

    uint256 private _lock = 1;
    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(IRenderer renderer_, address accountImpl_, address gripImpl_,
                uint256 firstId_, uint256 lastId_) {
        if (accountImpl_ == address(0) || gripImpl_ == address(0)) revert ZeroAddress();
        /*  Zero is not a token id anywhere in this collection — `_exists`
            reads an owner of the zero address as "no such token" — and a
            band that runs past the edition would let two chains issue the
            same number, which is the one thing the partition exists to
            prevent.                                                     */
        if (firstId_ == 0 || lastId_ < firstId_ || lastId_ > COLLECTION) revert BadBand();
        FIRST_ID = firstId_;
        LAST_ID = lastId_;
        unchecked { MAX_SUPPLY = lastId_ - firstId_ + 1; }
        ACCOUNT_IMPL = accountImpl_;
        GRIP_IMPL = gripImpl_;
        emit OwnershipTransferred(address(0), msg.sender);
        curator = msg.sender;
        royaltyReceiver = msg.sender;
        renderer = renderer_;
    }

    /*═══════════════════════ issuance ═══════════════════════*/

    function mint() external payable returns (uint256 id) {
        return _mintTo(msg.sender);
    }

    function mintTo(address to) external payable returns (uint256 id) {
        return _mintTo(to);
    }

    function _mintTo(address to) internal nonReentrant returns (uint256 id) {
        if (msg.value < price) revert Underpaid();
        return _issue(to);
    }

    /// @dev Issuing a token and paying for one are separate acts: a clone is
    ///      drawn from a token that was already paid for.
    function _issue(address to) internal returns (uint256 id) {
        if (to == address(0)) revert ZeroAddress();
        if (address(renderer) == address(0)) revert NoRenderer();
        if (totalSupply >= MAX_SUPPLY) revert SoldOut();

        unchecked { id = FIRST_ID + totalSupply; totalSupply += 1; }

        bytes32 seed = keccak256(abi.encodePacked(
            block.number == 0 ? bytes32(0) : blockhash(block.number - 1),
            block.prevrandao, block.timestamp, msg.sender, address(this), id
        ));
        seedOf[id] = seed;

        // The solid a token is born as, and the orientation it is born in,
        // come out of the block that carried the call and are not knowable
        // before it is mined.
        uint256 word;
        unchecked {
            for (uint256 i; i < 6; ++i) {
                word |= (uint256(uint16(bytes2(seed << (i * 16)))) << (i * 16));
            }
            word |= uint256(uint16(bytes2(seed << 96)))       << 96;   // w
            word |= uint256(uint8(seed[14]) % 8)              << 112;  // solid
            word |= uint256(uint8(seed[15]))                  << 120;  // hue
        }
        sectionOf[id] = word;

        _stats[id] = Stats({
            ops: 0, strata: 0, xfers: 0, open: BORN_OPEN,
            lastOp: uint64(block.timestamp), mintBlock: uint64(block.number)
        });

        _add(to, id);
        emit Transfer(address(0), to, id);
        emit Committed(id, word, 0);
    }

    /*═══════════════ the token acting on itself ═══════════════*/

    /// @notice Write an orientation into the token. Everyone who opens it
    ///         afterwards arrives at this section first.
    /// @param  word the packed section — see lib/Types.sol
    function commit(uint256 id, uint256 word) external onlyOperator(id) {
        if (!word.valid()) revert BadSection();
        sectionOf[id] = word;
        Stats storage s = _stats[id];
        unchecked { if (s.strata < type(uint32).max) s.strata += 1; }
        _bump(id, s);
        emit Committed(id, word, s.strata);
        emit MetadataUpdate(id);              // ERC-4906: come and read me again
        emit TraitUpdated(bytes32("solid"), id, bytes32(uint256(word.form())));
        emit TraitUpdated(bytes32("hue"),   id, bytes32(uint256(word.hue())));
    }

    /// @notice Open one of the sealed instruments. It stays open for good.
    function openNode(uint256 id, uint8 node) external payable onlyHolder(id) nonReentrant {
        if (node >= NODE_COUNT) revert BadNode();
        if (msg.value < openFee) revert Underpaid();
        Stats storage s = _stats[id];
        uint16 bit = uint16(1) << node;
        if (s.open & bit != 0) revert AlreadyOpen();
        s.open |= bit;
        _bump(id, s);
        emit NodeOpened(id, node, s.open);
        emit MetadataUpdate(id);
    }

    /// @notice Bring the token's bound account into being. Anyone may pay
    ///         for this; the address was already determined at mint.
    /// @dev    It does NOT stamp the token's operation counter, and the
    ///         reason is worth writing down. Every other `_bump` sits
    ///         behind the owner, an operator, or the token's own account —
    ///         this one is open to the world by design, because the address
    ///         is deterministic and materialising it is nobody's privilege.
    ///         A stamp anyone can set is not a record of what the token
    ///         did; it is a record of what was done to it, and anything
    ///         reading `lastOp` as a sign of life could be fed one by a
    ///         stranger for the price of gas. `embodyGrip` never bumped;
    ///         this was the sibling that disagreed.
    function embody(uint256 id) external returns (address acct) {
        if (_ownerOf[id] == address(0)) revert Nonexistent();
        acct = REGISTRY.createAccount(ACCOUNT_IMPL, REACH_SALT, block.chainid, address(this), id);
        emit Embodied(id, acct);
    }

    /// @notice The token stamping its own counter — callable by whoever is
    ///         operating it, or by the token's own account when it acts.
    function record(uint256 id) external {
        address o = _ownerOf[id];
        if (o == address(0)) revert Nonexistent();
        if (msg.sender != o && msg.sender != account(id)) revert NotHolder();
        _bump(id, _stats[id]);
    }

    function _bump(uint256 id, Stats storage s) internal {
        unchecked { if (s.ops < type(uint32).max) s.ops += 1; }
        s.lastOp = uint64(block.timestamp);
        emit Operated(id, s.ops);
    }

    /// @notice The Reach: the hand that acts. This is "the" ERC-6551 account.
    function account(uint256 id) public view returns (address) {
        return REGISTRY.account(ACCOUNT_IMPL, REACH_SALT, block.chainid, address(this), id);
    }

    /// @notice The Grip: the hand that only closes. Derived, never asked for.
    function grip(uint256 id) public view returns (address) {
        return REGISTRY.account(GRIP_IMPL, GRIP_SALT, block.chainid, address(this), id);
    }

    /// @notice Bring the Grip into being. Anyone may pay for this; the
    ///         address was determined at mint and nothing about it is a
    ///         choice.
    function embodyGrip(uint256 id) external returns (address acct) {
        if (_ownerOf[id] == address(0)) revert Nonexistent();
        acct = REGISTRY.createAccount(GRIP_IMPL, GRIP_SALT, block.chainid, address(this), id);
        emit Embodied(id, acct);
    }

    /*═══════════════════════ reading ═══════════════════════*/

    function statsOf(uint256 id)
        external view returns (uint256 ops, uint256 xfers, uint256 strata, uint256 open)
    {
        Stats memory s = _stats[id];
        return (s.ops, s.xfers, s.strata, s.open);
    }

    function detailOf(uint256 id)
        external view returns (uint64 lastOp, uint64 mintBlock, bool isLocked, uint8 kernel)
    {
        Stats memory s = _stats[id];
        // the status rather than the flag: "there is a kernel" is not the
        // fact a caller needs, and answering the easier question is how a
        // stale kernel gets read as a live one
        return (s.lastOp, s.mintBlock, _locked[id], kernelStatus(id));
    }

    function viewOf(uint256 id) public view returns (TokenView memory v) {
        address o = _ownerOf[id];
        if (o == address(0)) revert Nonexistent();
        Stats memory s = _stats[id];
        v = TokenView({
            id: id, word: sectionOf[id], seed: seedOf[id], owner: o,
            collection: address(this), boundAccount: account(id), grip: grip(id), pool: pool,
            reachImpl: ACCOUNT_IMPL, gripImpl: GRIP_IMPL,
            ops: s.ops, strata: s.strata, xfers: s.xfers, open: s.open,
            mintBlock: s.mintBlock, locked: _locked[id], kernel: kernelStatus(id)
        });
    }

    /*═══════════════════ metadata · ERC-721 / 7160 / 7572 ═══════════════*/

    function tokenURI(uint256 id) public view returns (string memory) {
        if (address(renderer) == address(0)) revert NoRenderer();
        uint256 p = _pinned[id];
        return renderer.facetURI(viewOf(id), p == 0 ? 0 : p - 1);
    }

    /// @notice ERC-7160. The solid has more than one face; this returns all
    ///         of them and says which the holder has pinned.
    function tokenURIs(uint256 id)
        external view returns (uint256 index, string[] memory uris, bool pinned)
    {
        TokenView memory v = viewOf(id);
        uint256 n = renderer.facetCount();
        uris = new string[](n);
        for (uint256 i; i < n; ++i) uris[i] = renderer.facetURI(v, i);
        uint256 p = _pinned[id];
        return (p == 0 ? 0 : p - 1, uris, p != 0);
    }

    /// @notice One face at a time. tokenURIs() has to return every face at
    ///         once because the standard says so, and face 0 carries the whole
    ///         document - so anything that wants a single face should ask for
    ///         it here instead of pulling a hundred kilobytes to read one.
    function tokenURIAt(uint256 id, uint256 index) external view returns (string memory) {
        if (index >= renderer.facetCount()) revert BadIndex();
        return renderer.facetURI(viewOf(id), index);
    }

    function pinTokenURI(uint256 id, uint256 index) external onlyHolder(id) {
        if (index >= renderer.facetCount()) revert BadIndex();
        _pinned[id] = index + 1;
        emit TokenUriPinned(id, index);
        emit MetadataUpdate(id);
    }

    function unpinTokenURI(uint256 id) external onlyHolder(id) {
        _pinned[id] = 0;
        emit TokenUriUnpinned(id);
        emit MetadataUpdate(id);
    }

    function hasPinnedTokenURI(uint256 id) external view returns (bool) {
        return _pinned[id] != 0;
    }

    function contractURI() external view returns (string memory) {
        return renderer.collectionURI(address(this), totalSupply, MAX_SUPPLY);
    }

    /*═══════════════════ traits · ERC-7496 ═══════════════════*/

    function getTraitValue(uint256 id, bytes32 key) public view returns (bytes32) {
        if (_ownerOf[id] == address(0)) revert Nonexistent();
        uint256 w = sectionOf[id];
        Stats memory s = _stats[id];
        if (key == bytes32("solid"))  return bytes32(uint256(w.form()));
        if (key == bytes32("hue"))    return bytes32(uint256(w.hue()));
        if (key == bytes32("w"))      return bytes32(uint256(w.offsetW()));
        if (key == bytes32("ops"))    return bytes32(uint256(s.ops));
        if (key == bytes32("strata")) return bytes32(uint256(s.strata));
        if (key == bytes32("xfers"))  return bytes32(uint256(s.xfers));
        if (key == bytes32("nodes"))  return bytes32(_popcount(s.open));
        if (key == bytes32("locked")) return bytes32(_locked[id] ? uint256(1) : uint256(0));
        if (key == bytes32("kernel")) return bytes32(uint256(kernelStatus(id)));
        if (key == bytes32("section")) return bytes32(w);
        return bytes32(0);
    }

    function getTraitValues(uint256 id, bytes32[] calldata keys)
        external view returns (bytes32[] memory out)
    {
        out = new bytes32[](keys.length);
        for (uint256 i; i < keys.length; ++i) out[i] = getTraitValue(id, keys[i]);
    }

    function getTraitMetadataURI() external view returns (string memory) {
        return renderer.traitMetadataURI();
    }

    /// @notice Only the hue is settable on its own; everything else is a
    ///         consequence of the section, and the section is committed
    ///         whole so that it is always internally consistent.
    function setTrait(uint256 id, bytes32 key, bytes32 value) external onlyOperator(id) {
        if (key != bytes32("hue")) revert TraitNotSettable();
        uint256 v = uint256(value);
        if (v > type(uint8).max) revert BadSection();
        uint256 w = sectionOf[id];
        w = (w & ~(uint256(0xff) << 120)) | (v << 120);
        sectionOf[id] = w;
        _bump(id, _stats[id]);
        emit TraitUpdated(key, id, value);
        emit MetadataUpdate(id);
    }

    /*═══════════════ lending · ERC-4907 ═══════════════*/

    function setUser(uint256 id, address user, uint64 expires) external onlyHolder(id) {
        _users[id] = UserInfo(user, expires);
        emit UpdateUser(id, user, expires);
    }

    /*───────────────────────────────────────────────────────────────────
      A holder who wants a *market* to rent their token out has to give
      that market the power to set the user. ERC-721 approval can express
      that, and it is the obvious thing to reach for, and it is wrong: an
      approval carries `transferFrom` with it. Handing a rental contract
      the right to sell the token in order to let it lend the token is a
      capability an order of magnitude wider than the thing it authorises,
      and this collection has spent its whole design arguing against
      exactly that — the Grip has no spend function, the seal denies by
      default, the manifest is measured rather than enumerated.

      So the narrow power gets its own name. A lease agent may set the
      user. It may not transfer, approve, commit, lock, seal, or read a
      balance. There is no blessed singleton and no curator involvement:
      each holder names the contract they want on their own token, and
      naming a different one tomorrow is one transaction.

      The holder keeps the last word. `setUser` is still theirs, so they
      can end any lease an agent started at any moment — and a lease
      market worth using will make that cost them, which is what
      `Lease._settle` does.

      Cleared on transfer, alongside the user, for the same reason: a
      buyer inherits a token, not the seller's arrangements about it.
    ───────────────────────────────────────────────────────────────────*/
    mapping(uint256 => address) public leaseAgentOf;

    event LeaseAgentSet(uint256 indexed id, address indexed agent);
    error NotLeaseAgent();

    /// @dev The owner, not an operator. `onlyHolder` admits ERC-721
    ///      approvees, and an approval is revocable in one transaction
    ///      while a lease agent named under it is not — revoking the
    ///      approval would leave the agent standing, which is a permission
    ///      outliving the permission that granted it. Naming who may lend
    ///      your token is an act of ownership.
    function setLeaseAgent(uint256 id, address agent) external {
        address o = _ownerOf[id];
        if (o == address(0)) revert Nonexistent();
        if (msg.sender != o) revert NotHolder();
        leaseAgentOf[id] = agent;
        emit LeaseAgentSet(id, agent);
    }

    function setUserVia(uint256 id, address user, uint64 expires) external {
        if (leaseAgentOf[id] == address(0) || msg.sender != leaseAgentOf[id]) {
            revert NotLeaseAgent();
        }
        _users[id] = UserInfo(user, expires);
        emit UpdateUser(id, user, expires);
    }

    function userOf(uint256 id) public view returns (address) {
        UserInfo memory u = _users[id];
        return u.expires >= block.timestamp ? u.user : address(0);
    }

    function userExpires(uint256 id) external view returns (uint256) {
        return _users[id].expires;
    }

    /*═══════════════ binding · ERC-5192 / ERC-6454 ═══════════════*/

    function lock(uint256 id) external onlyOwner(id) {
        _locked[id] = true;
        emit Locked(id);
        emit MetadataUpdate(id);
    }

    function unlock(uint256 id) external onlyOwner(id) {
        _locked[id] = false;
        emit Unlocked(id);
        emit MetadataUpdate(id);
    }

    /// @dev ERC-5192 and ERC-6454 are two ways of asking the same question,
    ///      and a collection that answers them from two places will
    ///      eventually answer them differently. There is one flag, and
    ///      isTransferable() below is written in terms of it.
    function locked(uint256 id) public view returns (bool) {
        if (_ownerOf[id] == address(0)) revert Nonexistent();
        return _locked[id];
    }

    function isTransferable(uint256 id, address from, address to) public view returns (bool) {
        if (to == address(0)) return false;                 // nothing is burned here
        if (from == address(0)) return true;                // minting is always allowed
        if (_ownerOf[id] == address(0)) return false;
        /*  A token handed to its own hand is a token nobody can ever move
            again: the account asks whether the caller holds the token, the
            holder is the account, and only the account can answer for
            itself. Both hands are refused, and the Grip doubly so  14 it
            has no function that sends anything, including a token. The
            addresses are computed rather than looked up, so the refusal
            holds for an account nobody has deployed yet  14 and where no
            registry exists at all there is no hand to hold anything, so
            the question is skipped rather than reverted.               */
        if (address(REGISTRY).code.length > 0
            && (to == account(id) || to == grip(id))) return false;
        return !_locked[id];          // the same flag locked() reports
    }

    /*═══════════════ the sealed kernel ═══════════════

      A token may carry a payload that is not public — held wherever the
      holder keeps it, identified here only by hash, and sealed to a key
      only they can use. Handing the token over is therefore not enough:
      the new holder cannot open what was sealed to the old one. A
      transfer is only accepted alongside a proof that the same payload
      was re-sealed to the recipient.

      What counts as a proof is the verifier's business, and the verifier
      is a separate address for exactly that reason: a TEE attestation and
      a zero-knowledge proof are both admissible, and neither belongs
      hard-coded in a token contract.

      This is ERC-7857's good idea under its own name. It is not a
      conformance claim - see interfaces/Standards.sol for exactly why.

      With no kernel set, a token behaves as an ordinary ERC-721 and none
      of this applies.                                                    */

    /// @notice Chosen once, and never rotated.
    /// @dev    A rotatable verifier is not a verifier. Whoever can swap it
    ///         can install one that approves anything, and every kernel in
    ///         the collection becomes a claim about the curator rather than
    ///         a claim about a proof — which is the whole thing this is for.
    ///         So it may be set from zero exactly one time, and after that
    ///         `setVerifier` is a function that reverts for everybody.
    ///
    ///         Left at zero — which is how this collection deploys — no
    ///         proof can be checked, so `transferWithKernel` and
    ///         `cloneWithKernel` refuse rather than wave a kernel through.
    function setVerifier(IDataVerifier v) external onlyCurator {
        if (address(verifier) != address(0)) revert VerifierFixed();
        if (address(v) == address(0)) revert NoVerifier();
        verifier = v;
        emit VerifierUpdated(address(v));
    }

    /// @notice Attach or re-seal a kernel. The holder asserts the hashes;
    ///         it is the transfer that has to be proved, not the sealing.
    function sealKernel(uint256 id, bytes32[] calldata hashes, bytes32 to_)
        external onlyHolder(id)
    {
        _dataHashes[id] = hashes;
        Kernel storage k = _kernel[id];
        k.sealedTo = to_;
        k.active = hashes.length > 0;
        // the chain's opinion of who this was sealed under, not the caller's
        k.sealedOwner = _ownerOf[id];
        // the holder asserted these hashes; nobody proved them
        k.proved = false;
        unchecked { k.version += 1; }
        emit Sealed(id, hashes, to_);
        emit MetadataUpdate(id);
    }

    /// @notice Moves the token and its kernel together.
    function transferWithKernel(address to, uint256 id, bytes calldata proof) external {
        Kernel storage k = _kernel[id];
        if (!k.active) {
            // no kernel: an ordinary transfer, and the proof is irrelevant
            transferFrom(msg.sender, to, id);
            return;
        }
        (bytes32[] memory newHashes, bytes32 to_) = _check(id, proof);
        _dataHashes[id] = newHashes;
        k.sealedTo = to_;
        k.sealedOwner = to;
        k.proved = true;
        unchecked { k.version += 1; }
        transferFrom(msg.sender, to, id);
        emit Sealed(id, newHashes, to_);
    }

    /// @notice The token reproducing: a new token carrying the same kernel,
    ///         re-sealed to the recipient, with its own seed and its own
    ///         section drawn fresh from this block.
    /*  Payable, and it costs a mint.

        It did not, and that was a hole with no bottom: `cloneWithKernel`
        reaches `_issue` directly, every child is born with an active kernel
        of its own, and so every child is immediately a parent. One paid
        token could therefore be drawn from without limit until MAX_SUPPLY
        was gone, for the price of gas — an adversarial review pulled eight
        free tokens out of a single mint and the loop had no natural end.

        The reasoning for free clones was that "a clone is drawn from a
        token that was already paid for". That is true of the kernel and
        false of the supply: a clone consumes a slot out of 4096 exactly as
        a mint does, and the supply is the scarcer promise. So it is priced
        like what it consumes.                                             */
    function cloneWithKernel(address to, uint256 id, bytes calldata proof)
        external payable returns (uint256 child)
    {
        if (_ownerOf[id] != msg.sender) revert NotHolder();
        if (msg.value < price) revert Underpaid();
        Kernel storage k = _kernel[id];
        if (!k.active) revert KernelInactive();
        (bytes32[] memory newHashes, bytes32 to_) = _check(id, proof);

        child = _issue(to);
        _dataHashes[child] = newHashes;
        Kernel storage c = _kernel[child];
        c.sealedTo = to_;
        c.active = true;
        c.sealedOwner = to;
        c.proved = true;
        c.version = 1;

        parentOf[child] = id;
        emit Sealed(child, newHashes, to_);
        emit Cloned(id, child, to);
    }

    function _check(uint256 id, bytes calldata proof)
        internal view returns (bytes32[] memory newHashes, bytes32 to_)
    {
        if (address(verifier) == address(0)) revert NoVerifier();
        bool ok;
        bytes32[] memory oldHashes;
        (ok, oldHashes, newHashes, to_) = verifier.verifyTransfer(proof);
        if (!ok) revert ProofRejected();

        // the proof has to be about *this* token's payload, not some other
        bytes32[] memory have = _dataHashes[id];
        if (oldHashes.length != have.length) revert ProofRejected();
        for (uint256 i; i < have.length; ++i) {
            if (oldHashes[i] != have[i]) revert ProofRejected();
        }
        if (newHashes.length == 0) revert ProofRejected();
    }

    function authorizeUsage(uint256 id, address user) external onlyHolder(id) {
        usageAuthorised[id][user] = true;
        emit UsageAuthorised(id, user);
    }

    function dataHashesOf(uint256 id) external view returns (bytes32[] memory) {
        return _dataHashes[id];
    }

    function sealedTo(uint256 id) external view returns (bytes32) {
        return _kernel[id].sealedTo;
    }

    /*═══════════════ what a buyer reads before they pay ═══════════════

      `transferWithKernel` re-seals and transfers atomically, which is the
      guarantee ERC-7857 is built around. But `transferFrom` still exists —
      it has to, or the token stops being an ERC-721 — and an ordinary
      transfer moves the token while leaving the payload sealed to whoever
      held it before. Nothing is violated. The buyer simply owns a pointer
      to a ciphertext they cannot open, and no event says so.

      So it is derived rather than announced. `sealedOwner` is compared
      against `ownerOf` at read time: no hook, no gas, no transaction, and
      no cooperation from a seller who would rather it went unmentioned.
      The only half of that comparison a seller controls is the one that
      has already moved.

      CURRENT and PROVED are deliberately two questions. The first says the
      payload was sealed under whoever holds the token now. The second says
      a verifier checked the re-sealing. With no verifier deployed the
      second is false everywhere, and a client that merges them is telling
      a buyer something nobody established.                                */

    uint8 public constant KERNEL_ABSENT  = 0;
    uint8 public constant KERNEL_CURRENT = 1;
    uint8 public constant KERNEL_STALE   = 2;

    function kernelStatus(uint256 id) public view returns (uint8) {
        Kernel storage k = _kernel[id];
        if (!k.active) return KERNEL_ABSENT;
        address holder = _ownerOf[id];
        if (holder == address(0)) return KERNEL_STALE;
        return holder == k.sealedOwner ? KERNEL_CURRENT : KERNEL_STALE;
    }

    /// @notice A verifier checked this exact re-sealing, and it still stands.
    function kernelProved(uint256 id) external view returns (bool) {
        return _kernel[id].proved && kernelStatus(id) == KERNEL_CURRENT;
    }

    /// @notice Stated in the ABI as well as the prose, so a marketplace can
    ///         check rather than assume: with no verifier, no kernel in this
    ///         collection has ever been proved by anybody.
    function hasVerifier() external view returns (bool) {
        return address(verifier) != address(0);
    }

    /*═══════════════════════ royalties ═══════════════════════*/

    function royaltyInfo(uint256, uint256 salePrice)
        external view returns (address, uint256)
    {
        return (royaltyReceiver, (salePrice * royaltyBps) / 10_000);
    }

    /*═══════════════════════ ERC-721 ═══════════════════════*/

    function ownerOf(uint256 id) public view returns (address o) {
        o = _ownerOf[id];
        if (o == address(0)) revert Nonexistent();
    }

    function balanceOf(address a) public view returns (uint256) {
        if (a == address(0)) revert ZeroAddress();
        return _balanceOf[a];
    }

    function tokenByIndex(uint256 i) external view returns (uint256) {
        if (i >= totalSupply) revert BadIndex();
        // ids run FIRST_ID .. FIRST_ID + totalSupply - 1, in order
        unchecked { return FIRST_ID + i; }
    }

    function tokenOfOwnerByIndex(address o, uint256 i) external view returns (uint256) {
        if (i >= _balanceOf[o]) revert BadIndex();
        return _ownedTokens[o][i];
    }

    function approve(address to, uint256 id) external {
        address o = ownerOf(id);
        if (msg.sender != o && !isApprovedForAll[o][msg.sender]) revert NotHolder();
        getApproved[id] = to;
        emit Approval(o, to, id);
    }

    function setApprovalForAll(address op, bool ok) external {
        isApprovedForAll[msg.sender][op] = ok;
        emit ApprovalForAll(msg.sender, op, ok);
    }

    function transferFrom(address from, address to, uint256 id) public {
        if (from != _ownerOf[id]) revert NotHolder();
        if (to == address(0)) revert ZeroAddress();
        if (msg.sender != from && getApproved[id] != msg.sender && !isApprovedForAll[from][msg.sender])
            revert NotHolder();
        if (!isTransferable(id, from, to)) revert NotTransferable();

        _remove(from, id);
        _add(to, id);
        delete getApproved[id];

        // a lease does not survive the sale of the instrument
        if (_users[id].user != address(0)) {
            delete _users[id];
            emit UpdateUser(id, address(0), 0);
        }
        // nor does the standing permission to grant one
        if (leaseAgentOf[id] != address(0)) {
            delete leaseAgentOf[id];
            emit LeaseAgentSet(id, address(0));
        }

        Stats storage s = _stats[id];
        unchecked { if (s.xfers < type(uint32).max) s.xfers += 1; }

        emit Transfer(from, to, id);
        emit MetadataUpdate(id);
    }

    function safeTransferFrom(address from, address to, uint256 id) external {
        safeTransferFrom(from, to, id, "");
    }

    function safeTransferFrom(address from, address to, uint256 id, bytes memory data) public {
        transferFrom(from, to, id);
        if (to.code.length != 0) {
            if (IERC721Receiver(to).onERC721Received(msg.sender, from, id, data)
                != IERC721Receiver.onERC721Received.selector) revert NotReceiver();
        }
    }

    /*── enumeration bookkeeping ──*/
    function _add(address to, uint256 id) internal {
        uint256 n = _balanceOf[to];
        _ownedTokens[to][n] = id;
        _ownedIndex[id] = n;
        unchecked { _balanceOf[to] = n + 1; }
        _ownerOf[id] = to;
    }

    function _remove(address from, uint256 id) internal {
        uint256 n;
        unchecked { n = _balanceOf[from] - 1; }
        uint256 i = _ownedIndex[id];
        if (i != n) {
            uint256 moved = _ownedTokens[from][n];
            _ownedTokens[from][i] = moved;
            _ownedIndex[moved] = i;
        }
        delete _ownedTokens[from][n];
        delete _ownedIndex[id];
        _balanceOf[from] = n;
    }

    /*═══════════════════════ curation ═══════════════════════*/

    function setPool(address p) external onlyCurator {
        if (rendererSealed) revert AlreadySealed();
        pool = p;
        emit BatchMetadataUpdate(FIRST_ID, totalSupply == 0 ? FIRST_ID : FIRST_ID + totalSupply - 1);
    }

    function setRenderer(IRenderer r) external onlyCurator {
        if (rendererSealed) revert AlreadySealed();
        renderer = r;
        emit RendererChanged(address(r));
        emit BatchMetadataUpdate(FIRST_ID, totalSupply == 0 ? FIRST_ID : FIRST_ID + totalSupply - 1);
    }

    /// @notice Irreversible. After this the renderer can never be replaced,
    ///         and what the collection looks like is settled forever.
    function sealRenderer() external onlyCurator {
        rendererSealed = true;
        emit RendererSealed();
    }

    function setPricing(uint256 p, uint256 o) external onlyCurator {
        price = p;
        openFee = o;
    }

    function setRoyalty(address to, uint96 bps) external onlyCurator {
        if (bps > 1000) revert BadIndex();       // 10% ceiling, permanently
        royaltyReceiver = to;
        royaltyBps = bps;
    }

    /*── ERC-173, in two steps ──

      The standard reads as one call, and one call is how collections lose
      their admin forever: a mistyped address is accepted, emitted, and
      irreversible. So transferOwnership proposes and the recipient has to
      answer. An address that cannot call acceptOwnership was never going
      to be able to administer the collection anyway.

      The deviation is deliberate and worth stating plainly: a caller that
      assumes transferOwnership takes effect immediately will read owner()
      unchanged until the handover is accepted.                          */

    function owner() external view returns (address) {
        return curator;
    }

    function transferOwnership(address newOwner) external onlyCurator {
        pendingCurator = newOwner;
        emit OwnershipTransferStarted(curator, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingCurator) revert NotCurator();
        emit OwnershipTransferred(curator, pendingCurator);
        curator = pendingCurator;
        pendingCurator = address(0);
    }

    /// @notice Abandon the collection's admin permanently. After this no
    ///         price, royalty, renderer or market pointer can ever change
    ///         again — which for a sealed collection is the end state, not
    ///         a failure mode.
    function renounceOwnership() external onlyCurator {
        emit OwnershipTransferred(curator, address(0));
        curator = address(0);
        pendingCurator = address(0);
    }

    function withdraw(address to) external onlyCurator nonReentrant {
        (bool ok, ) = to.call{value: address(this).balance}("");
        if (!ok) revert NotReceiver();
    }

    /*═══════════════════════ ERC-165 ═══════════════════════*/

    function supportsInterface(bytes4 i) external pure returns (bool) {
        return i == 0x01ffc9a7    // ERC-165
            || i == 0x80ac58cd    // ERC-721
            || i == 0x5b5e139f    // ERC-721Metadata
            || i == 0x780e9d63    // ERC-721Enumerable
            || i == 0x2a55205a    // ERC-2981
            || i == 0x49064906    // ERC-4906  (fixed by the EIP; events carry no selector)
            || i == 0xad092b5c    // ERC-4907
            || i == 0xb45a3c0e    // ERC-5192
            || i == 0x91a6262f    // ERC-6454
            || i == 0xe8a3d485    // ERC-7572  (contractURI())
            || i == 0x06e1bc5b    // ERC-7160
            || i == 0xaf332f3e    // ERC-7496
            || i == 0x7f5828d0;   // ERC-173
    }

    function _popcount(uint16 x) internal pure returns (uint256 n) {
        unchecked { while (x != 0) { n += x & 1; x >>= 1; } }
    }

    receive() external payable {}
}
