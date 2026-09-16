// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  BOURSE — settlement across chains, in four parts that do not trust each other

    Berth   (seller's chain)  holds the asset. Knows nothing about bridges.
    Wire    (seller's chain)  reads a receipt Berth wrote and says so, once.
    Quorum  (buyer's chain)   counts witnesses. The only mutable thing here.
    Purse   (buyer's chain)   holds the money. Knows nothing about assets.

  Nothing crosses. The buyer receives the token on the seller's chain; the
  seller receives the money on the buyer's chain; the only thing that moves
  between chains is a witnessed statement about a delivery that already
  happened. A forged statement can therefore take money that is already
  escrowed for that one order, and can never take an asset.
───────────────────────────────────────────────────────────────────────────*/

interface IERC721Min {
    function transferFrom(address from, address to, uint256 id) external;
    function ownerOf(uint256 id) external view returns (address);
}
interface IHubBerth {
    function royaltyInfo(uint256 id, uint256 price) external view returns (address, uint256);
    function record(uint256 id) external;
}

/*═══════════════════════════ the seller's chain ═══════════════════════════*/
contract Berth {
    uint64 public constant MIN_TERM = 1 days;
    uint64 public constant MAX_TERM = 365 days;
    /// @dev A delivery must be this far clear of the buyer's refund, or the
    ///      seller is racing a clock they cannot see. Enforced here because
    ///      this is the chain where the asset actually moves.
    uint64 public constant MARGIN   = 6 hours;

    struct Lot {
        address seller;
        address collection;
        uint256 tokenId;
        uint96  ask;
        uint64  until;
    }
    /// @dev One per ORDER, not per lot, and never deleted. Keying it by lot
    ///      would let one delivery satisfy two funded orders naming the same
    ///      lot and the same recipient — paid twice for one asset.
    struct Receipt {
        bytes32 lot;
        address recipient;
        address payee;
        uint96  price;        // the away-chain amount, in the away chain's own unit
        uint64  refundAfter;  // the away-chain clock, bound so it can be checked
        address royaltyTo;
        uint96  royaltyAmt;
        uint64  when;
    }

    mapping(bytes32 => Lot) internal _lot;
    mapping(bytes32 => Receipt) internal _receipt;
    mapping(address => uint256) public owed;
    mapping(address => uint256) public nonceOf;

    IHubBerth public immutable HUB;   // address(0) is legal: third-party assets

    event Listed(bytes32 indexed lot, address indexed seller, address collection, uint256 tokenId, uint96 ask, uint64 until);
    event Repriced(bytes32 indexed lot, uint96 ask);
    event Sold(bytes32 indexed lot, address indexed to, address indexed by, uint256 paid, uint256 royalty);
    event Delivered(bytes32 indexed order, bytes32 indexed lot, address recipient, address payee, uint96 price);
    event Reclaimed(bytes32 indexed lot);
    event Withdrawn(address indexed who, uint256 amount);

    error NoLot(); error NotYours(); error NotOffered(); error PriceMoved(uint96 now_);
    error Underpaid(uint256 want); error TermRunning(uint64 until); error TermOver(uint64 until);
    error TooShort(); error TooLong(); error NothingOwed(); error PayFailed();
    error Reentrancy(); error NobodyThere(); error OrderTaken(); error NoOrder();
    error TooCloseToRefund(uint64 refundAfter);

    uint256 private _g = 1;
    modifier once() { if (_g != 1) revert Reentrancy(); _g = 2; _; _g = 1; }

    constructor(IHubBerth hub) { HUB = hub; }

    function list(address collection, uint256 tokenId, uint96 ask, uint64 until)
        external returns (bytes32 lot)
    {
        if (until < block.timestamp + MIN_TERM) revert TooShort();
        if (until > block.timestamp + MAX_TERM) revert TooLong();
        unchecked { lot = keccak256(abi.encode(block.chainid, address(this), msg.sender, nonceOf[msg.sender]++)); }
        _lot[lot] = Lot(msg.sender, collection, tokenId, ask, until);
        IERC721Min(collection).transferFrom(msg.sender, address(this), tokenId);
        /*  There is no check here, and that is the finding rather than an
            omission.

            `_AttackLiar.sol` is eight lines: transferFrom returns cleanly
            and moves nothing, supportsInterface says yes, and ownerOf
            returns `msg.sender` — so it answers whatever the caller wants
            to hear. An `ownerOf(tokenId) == address(this)` check was added
            here and the attack defeated it in the same run, because the
            check calls back into the attacker's own contract and it simply
            said yes.

            Every verification available to a marketplace has that shape.
            You cannot ask a contract whether it is honest; the answer
            comes from the contract. A balance delta, a supportsInterface
            probe, a receiver callback — all of them are calls into the
            thing under suspicion.

            So this is not a contract-layer problem and pretending it is
            produces a check that looks like protection and is not, which
            is worse than none. A buyer is buying a NAMED COLLECTION at a
            known address; a lot listed against a lookalike is an identity
            problem, answered by showing the collection address and by
            whatever curation the venue chooses to do, and never by asking
            the lookalike to confess.                                    */
        emit Listed(lot, msg.sender, collection, tokenId, ask, until);
    }

    function reprice(bytes32 lot, uint96 ask) external {
        Lot storage L = _lot[lot];
        if (L.seller == address(0)) revert NoLot();
        if (msg.sender != L.seller) revert NotYours();
        L.ask = ask;
        emit Repriced(lot, ask);
    }

    /*──── path one: somebody pays here, and says where it goes ────
      `to == msg.sender` is an ordinary local sale. `to == someone else` is
      a filler working an order that was funded on another chain with their
      own capital — the only path in this design where a cross-chain buyer
      is served at the speed of one block. Royalty is taken here, so the
      away statement carries none.                                        */
    function buyFor(
        bytes32 lot, uint96 agreed, address to,
        bytes32 order, uint96 awayPrice, uint64 refundAfter
    ) external payable once {
        Lot memory L = _lot[lot];
        if (L.seller == address(0)) revert NoLot();
        if (L.ask == 0) revert NotOffered();
        if (to == address(0)) revert NobodyThere();
        if (block.timestamp >= L.until) revert TermOver(L.until);
        if (L.ask != agreed) revert PriceMoved(L.ask);
        uint256 price = uint256(agreed);
        if (msg.value < price) revert Underpaid(price);

        delete _lot[lot];

        /*  The order receipt is written HERE or nowhere. An earlier draft
            let a filler record it in a second call, and measuring that
            call is what showed the hole: every field in it is public, so
            anybody could claim a funded order without having bought
            anything. A receipt that is not written by the purchase is not
            evidence of a purchase.                                      */
        if (order != bytes32(0)) {
            if (_receipt[order].when != 0) revert OrderTaken();
            if (refundAfter < block.timestamp + MARGIN) revert TooCloseToRefund(refundAfter);
            _receipt[order] = Receipt({
                lot: lot, recipient: to, payee: msg.sender, price: awayPrice,
                refundAfter: refundAfter, royaltyTo: address(0), royaltyAmt: 0,
                when: uint64(block.timestamp)
            });
            emit Delivered(order, lot, to, msg.sender, awayPrice);
        }

        uint256 roy;
        if (address(HUB) != address(0)) {
            (address rcv, uint256 r) = HUB.royaltyInfo(L.tokenId, price);
            if (rcv != address(0) && rcv != address(this) && r < price) { roy = r; owed[rcv] += r; }
            try HUB.record(L.tokenId) {} catch {}
        }
        owed[L.seller] += price - roy;

        IERC721Min(L.collection).transferFrom(address(this), to, L.tokenId);

        uint256 change = msg.value - price;
        if (change != 0) { (bool ok, ) = msg.sender.call{value: change}(""); if (!ok) revert PayFailed(); }
        emit Sold(lot, to, msg.sender, price, roy);
    }

    /*──── path two: the seller delivers against money locked elsewhere ────
      No capital moves here at all. The seller gives up the asset in exchange
      for a claim on the away chain, and the royalty is computed here from
      the away price and carried in the statement — a seller who understates
      the price produces a statement the buyer's Purse will not recognise, so
      the away chain's own record forces the number honest.                */
    function fillFromAway(
        bytes32 lot, bytes32 order, address recipient,
        uint96 awayPrice, uint64 refundAfter
    ) external once {
        Lot memory L = _lot[lot];
        if (L.seller == address(0)) revert NoLot();
        if (msg.sender != L.seller) revert NotYours();
        if (recipient == address(0)) revert NobodyThere();
        if (order == bytes32(0)) revert NoOrder();
        if (_receipt[order].when != 0) revert OrderTaken();
        if (refundAfter < block.timestamp + MARGIN) revert TooCloseToRefund(refundAfter);

        delete _lot[lot];

        address rTo; uint256 rAmt;
        if (address(HUB) != address(0)) {
            (address rcv, uint256 r) = HUB.royaltyInfo(L.tokenId, uint256(awayPrice));
            if (rcv != address(0) && r < uint256(awayPrice)) { rTo = rcv; rAmt = r; }
            try HUB.record(L.tokenId) {} catch {}
        }

        _receipt[order] = Receipt({
            lot: lot, recipient: recipient, payee: L.seller, price: awayPrice,
            refundAfter: refundAfter, royaltyTo: rTo, royaltyAmt: uint96(rAmt),
            when: uint64(block.timestamp)
        });

        IERC721Min(L.collection).transferFrom(address(this), recipient, L.tokenId);
        emit Delivered(order, lot, recipient, L.seller, awayPrice);
    }

    function reclaim(bytes32 lot) external once {
        Lot memory L = _lot[lot];
        if (L.seller == address(0)) revert NoLot();
        if (block.timestamp < L.until) revert TermRunning(L.until);
        delete _lot[lot];
        IERC721Min(L.collection).transferFrom(address(this), L.seller, L.tokenId);
        emit Reclaimed(lot);
    }

    function withdraw() external once {
        uint256 v = owed[msg.sender];
        if (v == 0) revert NothingOwed();
        owed[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: v}("");
        if (!ok) revert PayFailed();
        emit Withdrawn(msg.sender, v);
    }

    function lotOf(bytes32 lot) external view returns (Lot memory) { return _lot[lot]; }
    function receiptOf(bytes32 order) external view returns (Receipt memory) { return _receipt[order]; }

    /// @notice The statement a witness carries: one hash of ten facts, of
    ///         which the away chain independently holds six.
    function digestOf(bytes32 order) public view returns (bytes32) {
        Receipt memory r = _receipt[order];
        if (r.when == 0) revert NoOrder();
        return keccak256(abi.encode(
            block.chainid, address(this), r.lot, order, r.recipient,
            r.payee, r.price, r.refundAfter, r.royaltyTo, r.royaltyAmt));
    }
}

/*═══════════ the sender: it may only repeat what Berth wrote ═════════════*/
interface ILzEndpoint {
    function send(MessagingParams calldata p, address refund) external payable returns (bytes memory);
    function quote(MessagingParams calldata p, address sender) external view returns (uint256, uint256);
}
struct MessagingParams { uint32 dstEid; bytes32 receiver; bytes message; bytes options; bool payInLzToken; }

contract Wire {
    Berth public immutable BERTH;
    address public immutable ENDPOINT;
    mapping(uint32 => bytes32) public peerOf;     // dstEid => the away witness, fixed forever

    event Spoke(bytes32 indexed order, uint32 dstEid, bytes32 digest);
    error NoPeer(uint32 dstEid);

    constructor(Berth b, address endpoint, uint32[] memory eids, bytes32[] memory peers) {
        BERTH = b; ENDPOINT = endpoint;
        for (uint256 i; i < eids.length; ++i) peerOf[eids[i]] = peers[i];
    }

    /// @notice Anybody may pay to carry a statement. Nobody may choose it:
    ///         the body is thirty-two bytes computed from Berth's storage.
    function speak(bytes32 order, uint32 dstEid, bytes calldata options) external payable {
        bytes32 to = peerOf[dstEid];
        if (to == bytes32(0)) revert NoPeer(dstEid);
        bytes32 d = BERTH.digestOf(order);
        ILzEndpoint(ENDPOINT).send{value: msg.value}(
            MessagingParams(dstEid, to, abi.encode(d), options, false), msg.sender);
        emit Spoke(order, dstEid, d);
    }

    function quote(bytes32 order, uint32 dstEid, bytes calldata options)
        external view returns (uint256 native, uint256 lzToken)
    {
        bytes32 to = peerOf[dstEid];
        if (to == bytes32(0)) revert NoPeer(dstEid);
        bytes32 d = BERTH.digestOf(order);
        return ILzEndpoint(ENDPOINT).quote(
            MessagingParams(dstEid, to, abi.encode(d), options, false), address(this));
    }
}

/*════════════════════════ the witnesses, counted ═════════════════════════*/
interface IWitness { function seen(bytes32 d) external view returns (uint64 when); }

contract Quorum {
    address public governor;                 // a Timelock, and nothing else
    address[] private _w;

    event WitnessesSet(address[] witnesses);
    event GovernorSet(address indexed governor);
    error NotGovernor(); error TooMany();

    constructor(address governor_, address[] memory witnesses_) {
        governor = governor_; _w = witnesses_;
        emit GovernorSet(governor_); emit WitnessesSet(witnesses_);
    }
    modifier onlyGovernor() { if (msg.sender != governor) revert NotGovernor(); _; }

    /// @dev Rotation is the whole reason this is not immutable. A verifier
    ///      set you cannot leave is a verifier set that cannot be wrong.
    function setWitnesses(address[] calldata ws) external onlyGovernor {
        if (ws.length > 8) revert TooMany();
        _w = ws; emit WitnessesSet(ws);
    }
    function setGovernor(address g) external onlyGovernor { governor = g; emit GovernorSet(g); }
    function witnesses() external view returns (address[] memory) { return _w; }

    /// @notice How many independent transports carried this statement, and
    ///         when the first of them did.
    function count(bytes32 d) public view returns (uint8 n, uint64 first) {
        uint256 len = _w.length;
        for (uint256 i; i < len; ++i) {
            (bool ok, bytes memory out) = _w[i].staticcall(abi.encodeWithSelector(IWitness.seen.selector, d));
            if (!ok || out.length < 32) continue;          // a broken witness is a silent one
            uint64 when = uint64(uint256(bytes32(out)));
            if (when == 0) continue;
            unchecked { ++n; }
            if (first == 0 || when < first) first = when;
        }
    }
}

/*═══════════════════════════ the buyer's chain ════════════════════════════*/
contract Purse {
    struct Order {
        address buyer;
        uint96  paid;
        address recipient;    // the buyer's address on the seller's chain
        uint64  refundAfter;
        address berth;
        uint32  homeChainId;
        uint8   need;         // witnesses required, chosen at commit and shown
        bool    spent;
        bytes32 lot;
    }
    mapping(bytes32 => Order) public orderOf;
    mapping(address => uint256) public owed;

    Quorum public immutable WITNESS;

    uint64 public constant MIN_WINDOW = 12 hours;
    uint64 public constant MAX_WINDOW = 30 days;
    /// @dev A statement that only lands inside this margin is refused: not
    ///      because it is false, but because acting on it races the refund.
    uint64 public constant MARGIN     = 6 hours;
    uint16 public constant RATE_MAX   = 8;
    uint64 public constant RATE_SPAN  = 1 hours;

    uint64 private _rateStart;
    uint16 private _rateCount;

    event Committed(bytes32 indexed order, address indexed buyer, uint256 paid,
                    uint32 homeChainId, address berth, bytes32 lot, uint8 need);
    event Claimed(bytes32 indexed order, address indexed payee, uint256 toPayee,
                  address royaltyTo, uint256 royalty, uint8 witnesses);
    event Refunded(bytes32 indexed order, address indexed buyer, uint256 paid);
    event Withdrawn(address indexed who, uint256 amount);

    error Already(); error NoOrder(); error Spent(); error TooSoon(); error TooLate();
    error NotWitnessed(uint8 got, uint8 need); error LateWitness(); error BadWindow();
    error RateLimited(); error NothingOwed(); error PayFailed(); error Reentrancy();
    error NobodyThere(); error BadRoyalty();

    uint256 private _g = 1;
    modifier once() { if (_g != 1) revert Reentrancy(); _g = 2; _; _g = 1; }

    constructor(Quorum q) { WITNESS = q; }

    /// @notice Lock money against a lot on another chain. `need` is the
    ///         buyer's own choice and it is in the event: one witness is
    ///         cheaper and weaker, and nobody may make that choice for them.
    function commit(
        bytes32 order, uint32 homeChainId, address berth, bytes32 lot,
        address recipient, uint64 refundAfter, uint8 need
    ) external payable {
        if (orderOf[order].buyer != address(0)) revert Already();
        if (recipient == address(0)) revert NobodyThere();
        if (need == 0) revert BadWindow();
        if (refundAfter < block.timestamp + MIN_WINDOW) revert BadWindow();
        if (refundAfter > block.timestamp + MAX_WINDOW) revert BadWindow();
        orderOf[order] = Order({
            buyer: msg.sender, paid: uint96(msg.value), recipient: recipient,
            refundAfter: refundAfter, berth: berth, homeChainId: homeChainId,
            need: need, spent: false, lot: lot
        });
        emit Committed(order, msg.sender, msg.value, homeChainId, berth, lot, need);
    }

    /// @notice Take the money, on witnessed proof that the asset was
    ///         delivered on the other chain. Anybody may call it; only the
    ///         addresses named inside the witnessed statement are credited.
    function claim(bytes32 order, address payee, address royaltyTo, uint96 royaltyAmt) external {
        Order storage o = orderOf[order];
        if (o.buyer == address(0)) revert NoOrder();
        if (o.spent) revert Spent();
        if (block.timestamp >= o.refundAfter) revert TooLate();
        if (royaltyAmt > o.paid) revert BadRoyalty();

        bytes32 d = keccak256(abi.encode(
            uint256(o.homeChainId), o.berth, o.lot, order, o.recipient,
            payee, o.paid, o.refundAfter, royaltyTo, royaltyAmt));
        (uint8 n, uint64 first) = WITNESS.count(d);
        if (n < o.need) revert NotWitnessed(n, o.need);
        if (first + MARGIN > o.refundAfter) revert LateWitness();

        /*  The rate limit does not stop a forgery. It turns a total loss
            into a partial one and buys the hours somebody needs to notice. */
        uint64 span = uint64(block.timestamp) - _rateStart;
        if (span >= RATE_SPAN) { _rateStart = uint64(block.timestamp); _rateCount = 1; }
        else { if (_rateCount >= RATE_MAX) revert RateLimited(); unchecked { _rateCount += 1; } }

        o.spent = true;
        uint256 roy = uint256(royaltyAmt);
        if (roy != 0 && royaltyTo != address(0)) owed[royaltyTo] += roy;
        else roy = 0;
        owed[payee] += uint256(o.paid) - roy;
        emit Claimed(order, payee, uint256(o.paid) - roy, royaltyTo, roy, n);
    }

    /// @notice Permissionless. A stuck transport must not be able to keep a
    ///         buyer's money by doing nothing.
    function refund(bytes32 order) external once {
        Order storage o = orderOf[order];
        if (o.buyer == address(0)) revert NoOrder();
        if (o.spent) revert Spent();
        if (block.timestamp < o.refundAfter) revert TooSoon();
        o.spent = true;
        uint256 v = o.paid;
        address to = o.buyer;
        (bool ok, ) = to.call{value: v}("");
        if (!ok) { owed[to] += v; }   // a buyer who cannot receive is credited, never wedged
        emit Refunded(order, to, v);
    }

    function withdraw() external once {
        uint256 v = owed[msg.sender];
        if (v == 0) revert NothingOwed();
        owed[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: v}("");
        if (!ok) revert PayFailed();
        emit Withdrawn(msg.sender, v);
    }
}

/*════════════ a witness, with the calling convention right ═══════════════*/
struct Origin { uint32 srcEid; bytes32 sender; uint64 nonce; }

/// @dev What ParleyPort should have been. `lzReceive` takes Origin as a
///      STATIC TUPLE — selector 0x13137d65, not the 0x42172c88 that a
///      `bytes` parameter produces — and `allowInitializePath` exists,
///      without which EndpointV2.verify reverts and the first packet on a
///      lane can never be verified at all.
contract LzWitness is IWitness {
    address public immutable ENDPOINT;
    mapping(uint32 => bytes32) public peerOf;      // fixed at construction
    mapping(bytes32 => uint64) private _seen;

    /// @dev NOT frozen, and that is the second lesson from ParleyPort. An
    ///      OApp with no way to reach `EndpointV2.setConfig` is pinned to
    ///      LayerZero's defaults forever — which on two of this collection's
    ///      five chains is a single DVN that only reverts. The power is
    ///      confined to the endpoint address, so it can name verifiers and
    ///      libraries and can never move a token or an ether.
    address public governor;

    event Witnessed(bytes32 indexed digest, uint32 srcEid, uint64 nonce);
    event GovernorSet(address indexed governor);
    error NotTheEndpoint(); error NotAPeer(); error BadBody();
    error NotGovernor(); error OnlyEndpoint(); error ConfigFailed(bytes reason);

    constructor(address endpoint, address governor_, uint32[] memory eids, bytes32[] memory peers) {
        ENDPOINT = endpoint; governor = governor_;
        for (uint256 i; i < eids.length; ++i) peerOf[eids[i]] = peers[i];
        emit GovernorSet(governor_);
    }

    /// @notice Name the verifier set, or leave one behind. Seven days'
    ///         notice, because the governor is a Timelock and nothing else.
    function configure(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != governor) revert NotGovernor();
        (bool ok, bytes memory r) = ENDPOINT.call(data);
        if (!ok) revert ConfigFailed(r);
        return r;
    }
    function setGovernor(address g) external {
        if (msg.sender != governor) revert NotGovernor();
        governor = g; emit GovernorSet(g);
    }

    function seen(bytes32 d) external view returns (uint64) { return _seen[d]; }

    function allowInitializePath(Origin calldata o) external view returns (bool) {
        return peerOf[o.srcEid] != bytes32(0) && peerOf[o.srcEid] == o.sender;
    }
    function nextNonce(uint32, bytes32) external pure returns (uint64) { return 0; }

    function lzReceive(Origin calldata o, bytes32, bytes calldata message, address, bytes calldata)
        external payable
    {
        if (msg.sender != ENDPOINT) revert NotTheEndpoint();
        if (peerOf[o.srcEid] == bytes32(0) || peerOf[o.srcEid] != o.sender) revert NotAPeer();
        if (message.length != 32) revert BadBody();
        bytes32 d = bytes32(message);
        if (_seen[d] == 0) { _seen[d] = uint64(block.timestamp); emit Witnessed(d, o.srcEid, o.nonce); }
    }
}

/// @dev Stands in for the CCIP receiver, and for measurement. Same shape:
///      it witnesses a digest and interprets nothing.
contract StubWitness is IWitness {
    address public immutable CALLER;
    mapping(bytes32 => uint64) private _seen;
    error NotTheCaller();
    constructor(address caller) { CALLER = caller; }
    function seen(bytes32 d) external view returns (uint64) { return _seen[d]; }
    function witness(bytes32 d) external {
        if (msg.sender != CALLER) revert NotTheCaller();
        if (_seen[d] == 0) _seen[d] = uint64(block.timestamp);
    }
}

/// @dev A stand-in endpoint, so the local half of a send can be measured
///      without a live LayerZero deployment.
contract StubEndpoint {
    event Sent(uint32 dstEid, bytes32 receiver, bytes message);
    function send(MessagingParams calldata p, address) external payable returns (bytes memory) {
        emit Sent(p.dstEid, p.receiver, p.message);
        return "";
    }
    function quote(MessagingParams calldata, address) external pure returns (uint256, uint256) {
        return (1e14, 0);
    }
}
