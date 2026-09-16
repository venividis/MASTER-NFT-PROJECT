// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*  A LayerZero EndpointV2 with the three behaviours the port actually
    depends on, and nothing else.

    It is not a simulation of the protocol. It is a stand-in for three
    facts verified live against the real endpoints, which the port's
    design rests on: a lane that was never configured refuses at QUOTE
    time rather than accepting a message that would never arrive;
    delivery carries no access control, so once a message is verified
    anybody can push it into the receiver; and the receiver is spoken to
    in the protocol's OWN dialect — `lzReceive` with `Origin` as a static
    tuple, behind an `allowInitializePath` handshake on the lane.

    That third fact is here because its absence hid a hole. This mock
    used to deliver with `lzReceive(bytes,...)` — a signature invented
    here, matched by the port, and dispatched by nothing else on any
    chain. The suite passed against itself while the real endpoint's
    selector fell through the port's dispatcher into no fallback at all.
    A mock that teaches its subject a private language will vouch for it
    fluently, which is why this one now speaks only the published one:
    the call below is built with `abi.encodeCall` against the canonical
    interface, so the selector is the compiler's, not this file's.      */

struct Origin { uint32 srcEid; bytes32 sender; uint64 nonce; }

interface ILayerZeroReceiver {
    function allowInitializePath(Origin calldata origin) external view returns (bool);
    function nextNonce(uint32 srcEid, bytes32 sender) external view returns (uint64);
    function lzReceive(
        Origin calldata origin, bytes32 guid, bytes calldata message,
        address executor, bytes calldata extraData
    ) external payable;
}

contract MockEndpoint {
    struct MessagingParams {
        uint32 dstEid; bytes32 receiver; bytes message; bytes options; bool payInLzToken;
    }
    struct MessagingFee { uint256 nativeFee; uint256 lzTokenFee; }
    struct MessagingReceipt { bytes32 guid; uint64 nonce; MessagingFee fee; }

    uint32 public eid;
    mapping(address => address) public delegates;
    mapping(uint32 => uint256) public feeFor;          // 0 = the lane is not wired
    mapping(uint32 => address) public endpointFor;     // the peer's endpoint, for delivery

    /*  The pin, recorded so a test can assert a constructor wrote it. */
    mapping(address => mapping(uint32 => address)) public sendLibOf;
    mapping(address => mapping(uint32 => address)) public receiveLibOf;
    mapping(address => uint256) public configWrites;
    error Unauthorized();

    /// @dev The real one reverts through a 934-byte library whose whole
    ///      behaviour is this string.
    error DeadDVN(string reason);
    /// @dev The real endpoint's verify path refuses a lane the receiver
    ///      will not initialize; a message for it is never marked
    ///      verifiable and can never be delivered.
    error PathNotInitializable();
    /// @dev The real ULN302 refuses options that name no lzReceive gas —
    ///      empty options are not a default, they are a mistake.
    error NoOptions();

    uint64 public nonce;
    struct Pending { address to; Origin origin; bytes message; }
    Pending[] public outbox;

    constructor(uint32 e) { eid = e; }

    function setLane(uint32 dstEid, uint256 fee, address peerEndpoint) external {
        feeFor[dstEid] = fee;
        endpointFor[dstEid] = peerEndpoint;
    }
    function setDelegate(address d) external { delegates[msg.sender] = d; }

    /*  The real endpoint authorizes the OApp itself or its delegate.
        Recording rather than acting is enough for a mock: what the tests
        assert is that the constructor wrote these once and that nothing
        can ever write them again.                                       */
    function setSendLibrary(address oapp, uint32 dstEid, address lib) external {
        if (msg.sender != oapp && msg.sender != delegates[oapp]) revert Unauthorized();
        sendLibOf[oapp][dstEid] = lib;
    }
    function setReceiveLibrary(address oapp, uint32 srcEid, address lib, uint256) external {
        if (msg.sender != oapp && msg.sender != delegates[oapp]) revert Unauthorized();
        receiveLibOf[oapp][srcEid] = lib;
    }
    struct SetConfigParam { uint32 eid; uint32 configType; bytes config; }
    function setConfig(address oapp, address, SetConfigParam[] calldata params) external {
        if (msg.sender != oapp && msg.sender != delegates[oapp]) revert Unauthorized();
        configWrites[oapp] += params.length;
    }

    function quote(MessagingParams calldata p, address) external view returns (MessagingFee memory) {
        if (feeFor[p.dstEid] == 0) revert DeadDVN("Please set your OApp's DVNs and/or Executor");
        if (p.options.length < 2) revert NoOptions();
        return MessagingFee(feeFor[p.dstEid] + p.message.length, 0);
    }

    function send(MessagingParams calldata p, address)
        external payable returns (MessagingReceipt memory r)
    {
        uint256 fee = feeFor[p.dstEid];
        if (fee == 0) revert DeadDVN("Please set your OApp's DVNs and/or Executor");
        if (p.options.length < 2) revert NoOptions();
        fee += p.message.length;
        require(msg.value >= fee, "underpaid");
        MockEndpoint far = MockEndpoint(endpointFor[p.dstEid]);
        far.receive_(address(uint160(uint256(p.receiver))),
                     Origin(eid, bytes32(uint256(uint160(msg.sender))), ++nonce),
                     p.message);
        r.guid = keccak256(abi.encode(p.dstEid, nonce));
        r.nonce = nonce;
        r.fee = MessagingFee(fee, 0);
    }

    /// @dev Parked rather than delivered, so a test can drive the two
    ///      halves apart and prove delivery needs no privilege.
    function receive_(address to, Origin calldata origin, bytes calldata message) external {
        outbox.push(Pending(to, origin, message));
    }
    function pending() external view returns (uint256) { return outbox.length; }

    /// @dev Park a message that never went through send, so a test can
    ///      stand where a hostile verifier would and try an origin the
    ///      receiver was not built with.
    function inject(address to, Origin calldata origin, bytes calldata message) external {
        outbox.push(Pending(to, origin, message));
    }

    /// @notice Deliver a parked message. No access control, deliberately —
    ///         and the same handshake the real endpoint performs: the lane
    ///         must be one the receiver agrees to initialize.
    function deliver(uint256 i) external {
        Pending memory p = outbox[i];
        if (!ILayerZeroReceiver(p.to).allowInitializePath(p.origin))
            revert PathNotInitializable();
        (bool ok, bytes memory err) = p.to.call(
            abi.encodeCall(ILayerZeroReceiver.lzReceive,
                (p.origin, bytes32(0), p.message, address(0), bytes(""))));
        if (!ok) assembly { revert(add(err, 0x20), mload(err)) }
    }

    /// @notice Deliver WITHOUT asking allowInitializePath first — an
    ///         endpoint that forgot the handshake. The receiver's own
    ///         peer check must refuse on its side of the border too.
    function deliverUnchecked(uint256 i) external {
        Pending memory p = outbox[i];
        (bool ok, bytes memory err) = p.to.call(
            abi.encodeCall(ILayerZeroReceiver.lzReceive,
                (p.origin, bytes32(0), p.message, address(0), bytes(""))));
        if (!ok) assembly { revert(add(err, 0x20), mload(err)) }
    }
}
