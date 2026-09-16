// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IParleyRead {
    function mayActAs(uint256 token, address who) external view returns (bool);
    function MAX_BODY() external view returns (uint256);
}

interface ILayerZeroEndpointV2 {
    struct MessagingParams {
        uint32 dstEid; bytes32 receiver; bytes message; bytes options; bool payInLzToken;
    }
    struct MessagingFee { uint256 nativeFee; uint256 lzTokenFee; }
    struct MessagingReceipt { bytes32 guid; uint64 nonce; MessagingFee fee; }
    struct SetConfigParam { uint32 eid; uint32 configType; bytes config; }

    function quote(MessagingParams calldata p, address sender)
        external view returns (MessagingFee memory);
    function send(MessagingParams calldata p, address refundTo)
        external payable returns (MessagingReceipt memory);
    function setDelegate(address delegate) external;
    function eid() external view returns (uint32);
    function setSendLibrary(address oapp, uint32 dstEid, address lib) external;
    function setReceiveLibrary(address oapp, uint32 srcEid, address lib, uint256 grace) external;
    function setConfig(address oapp, address lib, SetConfigParam[] calldata params) external;
}

/*  The endpoint's envelope: which chain is speaking, as which OApp, at
    which nonce. A STATIC tuple — three words laid inline — and the shape
    is part of the signature: declare it as anything else and the selector
    the endpoint dispatches on is not yours anymore.                     */
struct Origin { uint32 srcEid; bytes32 sender; uint64 nonce; }

/*═══════════════════════════════════════════════════════════════════════════

  THE PORT — the commons, heard on the other chains

  The edition is issued from five chains and nothing crosses between them.
  That is the whole design of the partition and it is not being weakened
  here. What crosses is speech.

  ── local first, and local always ──

  `Parley.speak` is untouched. It is free, it is local, it has no
  dependency on this contract or on any bridge, and it keeps working
  exactly as it does today on a chain where this port was never deployed,
  never funded, or has stopped working. Federation is a SEPARATE payable
  call. A holder who never touches it loses nothing; a chain whose port is
  dark still has a complete commons.

  That ordering is the point. A social layer that needs a message to
  arrive before anyone can talk is a social layer with a single point of
  silence.

  ── what is federated, and what must never be ──

  The commons only — room 0, the one room every token is already in.

  Groups stay local because a group has a steward, and a steward is an
  authority; carrying that across would mean trusting a message to say who
  may speak. Pairs stay local for a better reason: a pair room is derived
  from two token ids, and under the partition those two ids may live on
  different chains, so a federated pair room would be a room that means
  different things in different places. There is no correct way to do it
  and so there is no function for it.

  This port cannot write into Parley at all. It has no privilege there and
  asks for none — Parley checks `mayActAs` against the caller, and this
  contract is not a token. What arrives is emitted here, under this
  contract's own event, tagged with where it came from. The archive on each
  chain therefore stays exactly what it always was: a record of what was
  said by someone standing on that chain. A reader that wants the whole
  conversation reads two logs instead of one, and can always tell which is
  which.

  ── the back-link is rewritten on arrival, and has to be ──

  Parley's walk works because every message carries the block number of the
  previous one, so a client can step backwards with single-block
  `eth_getLogs` and never scan a range. That pointer is meaningless on
  another chain — block 21,000,000 on Ethereum is not block 21,000,000
  anywhere else. So the sender's pointer is dropped at the border and this
  contract writes its own, in the receiving chain's numbering. An echoed
  conversation is walkable on the chain you are standing on, which is the
  only chain whose blocks you can ask about.

  ── the verifier set: no admin, and an honest account of what floats ──

  LayerZero lets an OApp choose which DVNs must attest to its messages, and
  lets a delegate change that later. A delegate is an admin key. So this
  constructor calls `setDelegate(address(0))`, and there is no function
  here that calls `setConfig`, `setSendLibrary`, `setReceiveLibrary` or
  `setDelegate` again. Nobody can re-point this port's security. That much
  is as immutable as the bytecode.

  An earlier version of this comment claimed more — that the verifier set
  itself was frozen — and that was wrong. An OApp that pins nothing runs
  on the endpoint's DEFAULT send library, receive library and DVN set, and
  LayerZero Labs can roll those defaults forward without this contract's
  consent. No admin here does not mean no movement there. So the
  constructor now takes the pin as arguments: library choices per lane and
  raw `SetConfigParam` entries, applied once, from inside the constructor —
  the endpoint authorizes the OApp itself, so no delegate is ever needed —
  and then the delegate is zeroed and the pin can never move again. A
  deployment that passes empty pin arrays floats on the defaults, and is
  choosing to; the arrays are in the constructor so the choice is written
  where it cannot be quietly revised. Either way the failure stays bounded
  by what this contract is: the worst a rolled default or a dead pinned
  DVN can do is silence echoes or forge one, and a forged echo arrives
  visibly foreign, under this contract's own event, attributable to its
  lane. Speech, not custody, is what makes that trade admissible — pin a
  1-of-1 verifier under something that MINTS and the same arrangement has
  already cost other protocols nine figures.

  Two protocol properties are worth stating because they are the reason
  this is admissible at all. An unwired lane fails at QUOTE time — the
  default verifier is a small contract whose entire behaviour is to revert
  with "Please set your OApp's DVNs and/or Executor" — so a lane that was
  never configured refuses loudly instead of accepting a message that would
  never arrive. And delivery is permissionless: the endpoint's receive
  entry point has no access control, so once the DVNs have attested,
  anyone can deliver. The paid executor is a convenience and never a
  dependency, which means no server is required for any of this to work.

═══════════════════════════════════════════════════════════════════════════*/
/*  One lane's library choice, applied once at construction. `sendLib` and
    `receiveLib` may each be zero to leave that direction on the default. */
struct LanePin { uint32 eid; address sendLib; address receiveLib; }

/*  One raw config entry, applied once at construction: which library it
    is for, and the `SetConfigParam` the endpoint forwards to it. The
    bytes are the library's own ABI (ULN config is type 2, executor
    config type 1) — this contract does not interpret them, it only
    guarantees they can never be written twice.                          */
struct ConfigPin { address lib; uint32 eid; uint32 configType; bytes config; }

contract ParleyPort {
    IParleyRead public immutable PARLEY;
    ILayerZeroEndpointV2 public immutable ENDPOINT;
    uint32 public immutable LOCAL_EID;

    /// @dev Room 0. The only room that crosses.
    uint256 public constant COMMONS = 0;
    uint256 public constant MAX_BODY = 1024;

    /*  What `echo` hands the endpoint when the caller passes no options.
        The wire refuses empty options — ULN302 reverts a quote that names
        no lzReceive gas at all — so "no options" has to mean "the
        default", not "nothing". This is a type-3 options blob, laid out
        byte for byte:

          0003    the container tag (options type 3)
          01      worker id: the executor
          0011    option length, 17 = 1 type byte + 16 gas bytes
          01      option type: LZRECEIVE
          …30d40  200,000 gas, as a uint128

        Several times what `lzReceive` spends; and if a destination's
        schedule ever outgrows it, delivery is permissionless — anyone
        can re-execute the verified message with more.                   */
    bytes internal constant DEFAULT_OPTIONS =
        hex"00030100110100000000000000000000000000030d40";

    /*  The peers, fixed at construction. A port that could learn a new peer
        afterwards is a port whose owner can introduce a chain nobody
        agreed to, and every message from it would look exactly like the
        others.                                                          */
    uint32[] internal _peerEids;
    mapping(uint32 => bytes32) public peerOf;

    /*  The receiving chain's own back-link, so an echoed conversation can
        be walked here with the same single-block step the local one uses. */
    uint64 public lastEcho;
    uint64 public echoCount;

    event Echoed(
        uint32  indexed originEid,
        uint256 indexed fromToken,
        uint64  prev,
        uint64  seq,
        uint8   kind,
        bytes   body
    );
    event Sent(uint32 indexed dstEid, uint256 indexed fromToken, bytes32 guid);

    error NotYours();
    error BadBody();
    error NoPeers();
    error NotTheEndpoint();
    error UnknownPeer(uint32 eid);
    error Underpaid(uint256 want);

    constructor(
        IParleyRead parley,
        ILayerZeroEndpointV2 endpoint,
        uint32[] memory peerEids,
        bytes32[] memory peers,
        LanePin[] memory lanePins,
        ConfigPin[] memory configPins
    ) {
        PARLEY = parley;
        ENDPOINT = endpoint;
        LOCAL_EID = endpoint.eid();
        if (peerEids.length == 0 || peerEids.length != peers.length) revert NoPeers();
        for (uint256 i; i < peerEids.length; ++i) {
            _peerEids.push(peerEids[i]);
            peerOf[peerEids[i]] = peers[i];
        }

        /*  The pin, applied while this contract still may: the endpoint
            authorizes the OApp itself, so the constructor is the one
            moment configuration can be written without a delegate. Empty
            arrays float on the endpoint's defaults — a stated choice,
            argued in the header, not an oversight.                      */
        for (uint256 i; i < lanePins.length; ++i) {
            LanePin memory p = lanePins[i];
            if (p.sendLib != address(0))
                endpoint.setSendLibrary(address(this), p.eid, p.sendLib);
            if (p.receiveLib != address(0))
                endpoint.setReceiveLibrary(address(this), p.eid, p.receiveLib, 0);
        }
        for (uint256 i; i < configPins.length; ++i) {
            ConfigPin memory p = configPins[i];
            ILayerZeroEndpointV2.SetConfigParam[] memory one =
                new ILayerZeroEndpointV2.SetConfigParam[](1);
            one[0] = ILayerZeroEndpointV2.SetConfigParam(p.eid, p.configType, p.config);
            endpoint.setConfig(address(this), p.lib, one);
        }

        /*  No admin, from the first block. There is no function in this
            contract that can undo this — or any of the above.           */
        endpoint.setDelegate(address(0));
    }

    function peers() external view returns (uint32[] memory) { return _peerEids; }

    /*═══════════════════ speaking outward ═══════════════════*/

    /// @notice What it costs to echo this to every peer, before you commit.
    /// @dev    An unwired lane reverts here rather than at send, which is
    ///         the protocol refusing to guess and is the behaviour worth
    ///         having: it is better to be told the lane is not configured
    ///         than to pay for a message that never lands.
    function quoteEcho(uint256 from, uint8 kind, bytes calldata body, bytes calldata options)
        public view returns (uint256 total)
    {
        bytes memory m = abi.encode(LOCAL_EID, from, kind, body);
        /*  Empty means the default, because on the real wire empty means
            REFUSED: ULN302 reverts a quote whose options name no
            lzReceive gas. A caller who knows better passes their own. */
        bytes memory opts = options.length == 0 ? DEFAULT_OPTIONS : options;
        for (uint256 i; i < _peerEids.length; ++i) {
            total += ENDPOINT.quote(
                ILayerZeroEndpointV2.MessagingParams({
                    dstEid: _peerEids[i], receiver: peerOf[_peerEids[i]],
                    message: m, options: opts, payInLzToken: false
                }), address(this)).nativeFee;
        }
    }

    /// @notice Say this in the commons of every other chain as well.
    /// @dev    Deliberately not a wrapper around `Parley.speak`. Saying it
    ///         locally is a separate, free transaction that works whether
    ///         or not this contract exists; this only carries a copy
    ///         outward. Keeping them apart is what makes the local commons
    ///         independent of the bridge rather than merely usually
    ///         independent of it.
    function echo(uint256 from, uint8 kind, bytes calldata body, bytes calldata options)
        external payable
    {
        if (!PARLEY.mayActAs(from, msg.sender)) revert NotYours();
        if (body.length == 0 || body.length > MAX_BODY) revert BadBody();

        uint256 want = quoteEcho(from, kind, body, options);
        if (msg.value < want) revert Underpaid(want);

        bytes memory m = abi.encode(LOCAL_EID, from, kind, body);
        bytes memory opts = options.length == 0 ? DEFAULT_OPTIONS : options;
        uint256 spent;
        for (uint256 i; i < _peerEids.length; ++i) {
            uint32 dst = _peerEids[i];
            uint256 fee = ENDPOINT.quote(
                ILayerZeroEndpointV2.MessagingParams({
                    dstEid: dst, receiver: peerOf[dst], message: m,
                    options: opts, payInLzToken: false
                }), address(this)).nativeFee;
            ILayerZeroEndpointV2.MessagingReceipt memory r = ENDPOINT.send{value: fee}(
                ILayerZeroEndpointV2.MessagingParams({
                    dstEid: dst, receiver: peerOf[dst], message: m,
                    options: opts, payInLzToken: false
                }), msg.sender);
            spent += fee;
            emit Sent(dst, from, r.guid);
        }
        /*  Change goes back. A port that quietly keeps the difference
            between the quote and the fee is a port with a revenue model
            nobody was told about.                                       */
        if (msg.value > spent) {
            (bool ok, ) = msg.sender.call{value: msg.value - spent}("");
            if (!ok) revert Underpaid(spent);
        }
    }

    /*═══════════════════ hearing inward ═══════════════════

      For one commit this side spoke the mock's dialect, not the
      protocol's. The parameter was declared `bytes calldata origin` and
      decoded by hand — because the mock endpoint was the only endpoint
      this contract had ever met, and the mock had been written to match
      the contract. EndpointV2 delivers with `Origin calldata`, a static
      tuple, and the tuple is part of the canonical signature:

        lzReceive((uint32,bytes32,uint64),bytes32,bytes,address,bytes)
                                                             = 0x13137d65
        lzReceive(bytes,bytes32,bytes,address,bytes)         = 0x42172c88

      Different selector. Every real delivery would have fallen through
      the dispatcher into a contract with no fallback, every retry would
      have burned the executor's gas the same way, and no assertion here
      would have said a word, because every assertion drove the mock.
      `tools/probe-port-abi.mjs` measured it at the deployed bytecode —
      the three protocol selectors answered `revert 0x`, no dispatch —
      which is the only way a hole like this gets found: the suite that
      shares a dialect with its subject cannot hear the accent.

      The endpoint also asks two questions before the first packet on a
      lane can ever be verified, and a receiver that cannot answer them
      is not deaf but unborn: `allowInitializePath` gates the lane, and
      `nextNonce` states the ordering promise. Both are below, and the
      mock now performs the same handshake the real endpoint does.      */

    /// @notice The endpoint consults this before the FIRST packet on a
    ///         lane can be verified; answering false leaves the lane
    ///         uninitialized forever.
    /// @dev    The answer is the peer table — the same check lzReceive
    ///         makes, asked earlier, by the protocol itself. No state,
    ///         no authority, no way to answer differently later.
    function allowInitializePath(Origin calldata origin) external view returns (bool) {
        bytes32 want = peerOf[origin.srcEid];
        return want != bytes32(0) && want == origin.sender;
    }

    /// @notice Zero, always: no ordered delivery is promised or wanted.
    /// @dev    The endpoint never calls this; the off-chain executor asks
    ///         it whether the OApp wants ordered execution before it will
    ///         auto-deliver. Zero is the protocol's word for "no ordering
    ///         promised — deliver what is attested, in any order". Speech
    ///         carries its own back-links, so arrival order is cosmetic;
    ///         a lane that must halt on one stuck message is a queue
    ///         nobody asked for.
    function nextNonce(uint32, bytes32) external pure returns (uint64) { return 0; }

    /// @notice Called by the endpoint once the DVNs have attested.
    /// @dev    The only authority checked is that the endpoint made the
    ///         call and that the origin is a peer this port was built with.
    ///         Nothing here can write to Parley, so the worst a broken peer
    ///         can do is emit a message under its own eid — visible as
    ///         foreign, attributable, and impossible to confuse with
    ///         something said locally.
    function lzReceive(
        Origin calldata origin,
        bytes32,                    // guid
        bytes calldata message,
        address,                    // executor
        bytes calldata              // extraData
    ) external payable {
        if (msg.sender != address(ENDPOINT)) revert NotTheEndpoint();
        bytes32 want = peerOf[origin.srcEid];
        if (want == bytes32(0) || want != origin.sender) revert UnknownPeer(origin.srcEid);

        (uint32 originEid, uint256 from, uint8 kind, bytes memory body) =
            abi.decode(message, (uint32, uint256, uint8, bytes));

        /*  The eid inside the message is the sender's claim about itself;
            the one in the envelope is what the DVNs attested. A peer that
            says one thing to the verifiers and another in the body is
            refused rather than believed on either count.                 */
        if (originEid != origin.srcEid) revert UnknownPeer(originEid);
        if (body.length == 0 || body.length > MAX_BODY) revert BadBody();

        /*  The sender's back-link is dropped here. Its block number refers
            to a chain whose blocks a reader on this one cannot ask about;
            this contract writes its own instead, so the echoed
            conversation walks with the same single-block step as the
            local one.                                                    */
        uint64 prev = lastEcho;
        lastEcho = uint64(block.number);
        unchecked { echoCount += 1; }

        emit Echoed(originEid, from, prev, echoCount, kind, body);
    }

    /// @notice ERC-165, so a client can tell this is a port before calling.
    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7;
    }
}
