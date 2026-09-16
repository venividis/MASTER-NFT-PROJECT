// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";

interface IEnsRegistry {
    function owner(bytes32 node) external view returns (address);
}

/// @dev What the .eth registrar knows about time. `nameExpires` takes the
///      LABEL's hash, not the node's — `keccak("ipseity4d")`, not the
///      namehash of `ipseity4d.eth`. They are different bytes and mixing
///      them returns zero, which reads exactly like an unregistered name.
interface IEthRegistrar {
    function nameExpires(uint256 labelhash) external view returns (uint256);
    function GRACE_PERIOD() external view returns (uint256);
}

interface INameWrapperLike {
    function ownerOf(uint256 id) external view returns (address);
}

interface IHubNames {
    function ownerOf(uint256 id) external view returns (address);
    function account(uint256 id) external view returns (address);
    function grip(uint256 id) external view returns (address);
    function totalSupply() external view returns (uint256);
}

/// @dev The one ERC-6551 accessor that matters here: an account says which
///      token it belongs to. Both this collection's accounts implement it —
///      the Reach, which spends, and the Grip, which cannot.
interface IBoundAccount {
    function token() external view returns (uint256 chainId, address tokenContract, uint256 tokenId);
}

/*───────────────────────────────────────────────────────────────────────────
  Nameplate — an ENS resolver that answers for the collection

  "What would the web3 address be?" gets its final answer here. Point a
  name you own at this resolver and bind it to a token, and the name means
  the token everywhere ENS is read:

    addr(node)                    → the token's own 6551 account, so
                                    sending ETH to the name funds the token
    text(node,"contentcontract")  → the Premises, per ERC-6821 — a web3://
                                    browser resolves the name straight into
                                    this site with no IPFS and no gateway
    text(node,"avatar")           → the token's sigil, as an eip155 NFT
                                    reference every ENS app knows how to draw
    text(node,"url")              → an https gateway link, for browsers that
                                    speak nothing else

  And once a parent name is claimed, every token is addressable with no
  registration at all: `7.yourname.eth` resolves to token 7, by ENSIP-10
  wildcard — the name exists the moment the token does.

  ── holding the name IS the binding ──

  A name does not have to be bound at all. Put the ENS name's own NFT into
  a token's account and the name means that token, with no transaction on
  this contract and nothing to remember: custody is the claim.

  That is the stronger claim, so it wins over `bind`. A recorded intention
  can go stale — bind a name to token 3, move the name into token 7's
  account, and only one of those two is still true. Custody is the one
  that is true now.

  It also makes a name behave like everything else this collection holds:
  sell the token and the name goes with it, because the name was never
  yours separately from the token.

  The ordinary place for it is the REACH, which can send it back out again
  whenever you like. Nothing here requires more ceremony than moving the
  name. The GRIP is available and is not the default: it receives and
  cannot send, so a name put there is the token's permanently, which is a
  promise worth making deliberately and never by accident.

  An account's own word is not enough. Any contract can implement
  `token()` and claim to be token 7's; the registry's answer for that id
  must come back as the very address holding the name, or the claim is
  discarded.

  ── who may do what, and the absence of an admin ──

  Binding a name requires owning it in the ENS registry (wrapped names
  included) — this contract re-checks the registry on every bind rather
  than trusting a caller's word. The parent slot for wildcards is claimed
  once, by whoever owns that parent name at the moment of claiming, and
  never moves again: a write-once slot whose authorization is the ENS
  registry itself is not an admin, it is a mailbox with a name on it.
  Nothing else here can be set by anyone.

  On a chain with no ENS registry the constructor takes zero and every
  bind refuses honestly; the resolver still deploys so the address stays
  the same on every chain, which is this collection's habit.
───────────────────────────────────────────────────────────────────────────*/
contract Nameplate {
    using LibNum for uint256;

    IEnsRegistry public immutable ENS;
    IHubNames    public immutable HUB;
    /// @notice The site, which is what a name serves. ERC-6821's answer.
    address      public immutable PREMISES;

    /// @notice namehash of the parent whose numeric subdomains are tokens.
    ///         Zero until claimed; claimed once, by the parent's ENS owner.
    bytes32 public parentNode;

    mapping(bytes32 => uint256) public tokenOf;   // node → tokenId (0 = unbound)

    /*═══════════════ one name, five chains ═══════════════

      A resolver runs where its name lives, and .eth names live on
      Ethereum. Reading `block.chainid` there answers `1` for every query,
      so a single name could only ever point at the Ethereum deployment —
      which is the wrong answer for four fifths of an edition that was
      deliberately partitioned.

      The partition is also the fix. Every id belongs to exactly one chain
      by arithmetic, so the name needs no chain syntax at all: `1500.<name>`
      is a Base token because 1500 is in Base's band, and a reader types
      nothing they would have to be told. What the resolver cannot derive is
      where the other four deployments sit, because those addresses did not
      exist when it was constructed. That is the only thing a station holds.

      The local chain needs no station: PREMISES and HUB are immutables, so
      the deployment the resolver sits in always answers. Stations are for
      the other four, they are write-once, and the authorisation is the ENS
      registry's opinion of who owns the parent — the same mailbox rule the
      parent slot already uses, not an admin.                            */
    struct Station { address premises; address hub; }
    mapping(uint256 => Station) public stationOf;      // chainId → deployment

    /// @notice The edition, tiled across five chains. Must agree with
    ///         `BANDS` in tools/site.mjs, which the suite checks tiles
    ///         1..4096 exactly once with no hole and no overlap.
    uint256 internal constant EDITION = 4096;

    event StationSet(uint256 indexed chainId, address premises, address hub);

    event Bound(bytes32 indexed node, uint256 indexed token, address indexed by);
    event Unbound(bytes32 indexed node, uint256 indexed token);
    event ParentClaimed(bytes32 indexed node, address indexed by);

    error NoRegistryHere();
    error NotTheNameOwner();
    error NotTheTokenHolder();
    error ParentAlreadyClaimed();
    error ParentUnclaimed();
    error StationAlreadySet();
    error NotAnEditionChain();
    error NothingThere();
    error RenewerAlreadySet();
    error UnknownQuery();

    bytes4 private constant ADDR_IFACE        = 0x3b3b57de; // addr(bytes32)
    bytes4 private constant CONTENTHASH_IFACE = 0xbc1c58d1; // contenthash(bytes32)
    bytes4 private constant TEXT_IFACE        = 0x59d1d43c; // text(bytes32,string)
    bytes4 private constant WILDCARD_IFACE    = 0x9061b923; // resolve(bytes,bytes)

    constructor(IEnsRegistry ens, IHubNames hub, address premises) {
        ENS = ens;
        HUB = hub;
        PREMISES = premises;
    }

    /*═══════════════════ binding ═══════════════════*/

    /// @notice Bind a name you own to a token you hold (or whose account
    ///         you are). The ENS app must also point the name's resolver
    ///         here for browsers to see it; this call records which token
    ///         the name means.
    function bind(bytes32 node, uint256 token) external {
        if (!_ownsNode(node, msg.sender)) revert NotTheNameOwner();
        if (msg.sender != HUB.ownerOf(token) && msg.sender != HUB.account(token))
            revert NotTheTokenHolder();
        tokenOf[node] = token;
        emit Bound(node, token, msg.sender);
    }

    function unbind(bytes32 node) external {
        if (!_ownsNode(node, msg.sender)) revert NotTheNameOwner();
        uint256 t = tokenOf[node];
        delete tokenOf[node];
        emit Unbound(node, t);
    }

    /// @notice Claim the wildcard parent, once, by owning it. After this,
    ///         `<id>.parent` resolves to token <id> forever.
    function claimParent(bytes32 node) external {
        if (parentNode != bytes32(0)) revert ParentAlreadyClaimed();
        if (!_ownsNode(node, msg.sender)) revert NotTheNameOwner();
        parentNode = node;
        emit ParentClaimed(node, msg.sender);
    }

    /// @notice Tell this resolver where another chain's deployment lives,
    ///         so `<id>.parent` can answer for an id in that chain's band.
    /// @dev    Write-once per chain and only for a chain the edition
    ///         actually uses. A station that could be rewritten would let
    ///         whoever holds the parent silently repoint a token's site
    ///         long after somebody bought it on the strength of that site.
    function setStation(uint256 chainId, address premises_, address hub_) external {
        if (parentNode == bytes32(0)) revert ParentUnclaimed();
        if (!_ownsNode(parentNode, msg.sender)) revert NotTheNameOwner();
        if (_bandFirst(chainId) == 0) revert NotAnEditionChain();
        if (stationOf[chainId].premises != address(0)) revert StationAlreadySet();
        if (premises_ == address(0) || hub_ == address(0)) revert NothingThere();
        stationOf[chainId] = Station(premises_, hub_);
        emit StationSet(chainId, premises_, hub_);
    }

    /*  The same three writes, taking the name as DNS wire format instead
        of a namehash — length-prefixed labels, which a client can build
        with string arithmetic alone. The contract does the hashing,
        because this collection's clients carry no keccak on purpose.   */

    function nodeOf(bytes calldata name) external pure returns (bytes32) {
        return _namehash(name, 0);
    }

    function bindByName(bytes calldata name, uint256 token) external {
        bytes32 node = _namehash(name, 0);
        if (!_ownsNode(node, msg.sender)) revert NotTheNameOwner();
        if (msg.sender != HUB.ownerOf(token) && msg.sender != HUB.account(token))
            revert NotTheTokenHolder();
        tokenOf[node] = token;
        emit Bound(node, token, msg.sender);
    }

    function unbindByName(bytes calldata name) external {
        bytes32 node = _namehash(name, 0);
        if (!_ownsNode(node, msg.sender)) revert NotTheNameOwner();
        uint256 t = tokenOf[node];
        delete tokenOf[node];
        emit Unbound(node, t);
    }

    function claimParentByName(bytes calldata name) external {
        bytes32 node = _namehash(name, 0);
        if (parentNode != bytes32(0)) revert ParentAlreadyClaimed();
        if (!_ownsNode(node, msg.sender)) revert NotTheNameOwner();
        parentNode = node;
        emit ParentClaimed(node, msg.sender);
    }

    /// @dev Registry owner, or — when the registry hands the name to a
    ///      wrapper contract — the wrapper's ERC-721 owner of the node.
    function _ownsNode(bytes32 node, address who) private view returns (bool) {
        if (address(ENS) == address(0)) revert NoRegistryHere();
        address o = ENS.owner(node);
        if (o == who) return true;
        if (o.code.length > 0) {
            (bool ok, bytes memory ret) = o.staticcall(
                abi.encodeWithSelector(INameWrapperLike.ownerOf.selector, uint256(node)));
            if (ok && ret.length == 32 && abi.decode(ret, (address)) == who) return true;
        }
        return false;
    }

    /*═══════════════════ time, which the grip cannot stop ═══════════════════

      A .eth name is rented, not owned. The grip guarantees that nobody can
      take a name out of a token — and guarantees nothing at all about the
      calendar. Let the registration lapse and after the grace period the
      registrar reissues the name to whoever pays, and it leaves the grip
      without anybody having sent anything. Transfer is what the grip
      stops; expiry goes around it.

      So the expiry is published, because a date nobody can see is a date
      nobody renews. `heldBy` already reads custody live, so the moment a
      lapsed name is taken the resolver stops answering for the token by
      itself — but silently, and a month too late to do anything about.  */

    /// @dev namehash("eth"), the node whose owner IS the .eth registrar.
    ///      Derived rather than configured: the registry is the authority
    ///      on which registrar is current, and hardcoding one is a bet that
    ///      ENS never migrates.
    bytes32 private constant ETH_NODE =
        0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae;

    function registrar() public view returns (address) {
        if (address(ENS) == address(0)) return address(0);
        return ENS.owner(ETH_NODE);
    }

    /// @notice When a second-level .eth name lapses, and what that means
    ///         today. `label` is the bare label — "ipseity4d", not
    ///         "ipseity4d.eth".
    /// @return expires   unix seconds, 0 where nothing is registered
    /// @return graceEnds when anyone may take it, not just the owner
    /// @return live      still resolving
    /// @return inGrace   lapsed, but only the owner may renew for now
    function expiry(string calldata label)
        public view
        returns (uint256 expires, uint256 graceEnds, bool live, bool inGrace)
    {
        address reg = registrar();
        if (reg == address(0)) return (0, 0, false, false);
        uint256 id = uint256(keccak256(bytes(label)));

        (bool ok, bytes memory ret) = reg.staticcall(
            abi.encodeWithSelector(IEthRegistrar.nameExpires.selector, id));
        if (!ok || ret.length < 32) return (0, 0, false, false);
        expires = abi.decode(ret, (uint256));
        if (expires == 0) return (0, 0, false, false);

        /*  Asked rather than assumed. Ninety days is the answer today on
            both chains this was measured against, and it is a constant in
            a contract that has been replaced before.                    */
        uint256 grace = 90 days;
        (bool gok, bytes memory gret) = reg.staticcall(
            abi.encodeWithSelector(IEthRegistrar.GRACE_PERIOD.selector));
        if (gok && gret.length >= 32) grace = abi.decode(gret, (uint256));

        graceEnds = expires + grace;
        live = block.timestamp < expires;
        inGrace = !live && block.timestamp < graceEnds;
    }

    /*  Renewal is permissionless in ENS — `renew` has no ownership check,
        by design, so that anyone who cares about a name's survival can pay
        for it. That is the whole reason a name can sit in a grip and still
        be kept alive: renewing is not sending, and the grip only refuses
        to send.

        The controller's address is told to this contract rather than
        derived, because there is no derivation. The registry names the
        registrar; nothing on chain names the current controller, and the
        address ENS documents was, when this was written, not the one the
        registrar had authorised. A page that guessed would build a renewal
        transaction to a dead contract. Write-once, by the parent's owner,
        and empty until then — at which point the page says so.        */
    address public renewer;
    event RenewerSet(address indexed renewer);

    function setRenewer(address r) external {
        if (parentNode == bytes32(0)) revert ParentUnclaimed();
        if (!_ownsNode(parentNode, msg.sender)) revert NotTheNameOwner();
        if (renewer != address(0)) revert RenewerAlreadySet();
        if (r == address(0) || r.code.length == 0) revert NothingThere();
        renewer = r;
        emit RenewerSet(r);
    }

    /// @notice What renewing `label` for `duration` seconds would cost.
    ///         Zero when no renewer is set, or when the one set will not
    ///         quote — which the page must show as "unknown", never as
    ///         free.
    function renewPrice(string calldata label, uint256 duration)
        public view returns (uint256)
    {
        address r = renewer;
        if (r == address(0)) return 0;
        (bool ok, bytes memory ret) = r.staticcall(
            abi.encodeWithSignature("rentPrice(string,uint256)", label, duration));
        if (!ok || ret.length < 64) return 0;
        (uint256 base_, uint256 premium) = abi.decode(ret, (uint256, uint256));
        return base_ + premium;
    }

    /// @notice Everything a page needs about a name's clock, in one call.
    function nameStatus(string calldata label, uint256 duration)
        external view
        returns (
            uint256 expires, uint256 graceEnds, bool live, bool inGrace,
            address renewAt, uint256 price
        )
    {
        (expires, graceEnds, live, inGrace) = expiry(label);
        renewAt = renewer;
        price = renewPrice(label, duration);
    }

    /*═══════════════ custody, which needs no transaction ═══════════════*/

    /// @notice Which token holds this name's own NFT, and whether it is
    ///         sealed in the grip. Zero when a wallet holds it, or when
    ///         some other collection's account does.
    function heldBy(bytes32 node)
        public view returns (uint256 token, bool sealed_)
    {
        if (address(ENS) == address(0)) return (0, false);
        address o = ENS.owner(node);
        if (o == address(0) || o.code.length == 0) return (0, false);

        /*  A wrapped name is owned in the registry by the wrapper, and by
            a person inside it. Unwrap one level; a wrapper that does not
            answer is simply the holder itself.                         */
        (bool wok, bytes memory wret) = o.staticcall(
            abi.encodeWithSelector(INameWrapperLike.ownerOf.selector, uint256(node)));
        if (wok && wret.length == 32) {
            address real = abi.decode(wret, (address));
            if (real != address(0)) o = real;
        }
        if (o.code.length == 0) return (0, false);

        (bool ok, bytes memory ret) = o.staticcall(
            abi.encodeWithSelector(IBoundAccount.token.selector));
        if (!ok || ret.length < 96) return (0, false);
        (uint256 chainId, address coll, uint256 id) =
            abi.decode(ret, (uint256, address, uint256));
        if (chainId != block.chainid || coll != address(HUB) || id == 0) return (0, false);

        /*  The account's own word, checked against the registry that
            derives these addresses. Any contract can implement `token()`
            and say it is token 7's; only one address actually is.      */
        if (HUB.grip(id) == o) return (id, true);
        if (HUB.account(id) == o) return (id, false);
        return (0, false);
    }

    /// @dev Custody first, then the recorded binding. A bind can go stale —
    ///      bind to 3, move the name into 7's account, and only one of the
    ///      two is still true.
    function _tokenFor(bytes32 node) internal view returns (uint256) {
        (uint256 held, ) = heldBy(node);
        if (held != 0) return held;
        return tokenOf[node];
    }

    /*═══════════════════ resolution ═══════════════════*/

    function addr(bytes32 node) public view returns (address) {
        uint256 t = _tokenFor(node);
        if (t == 0 || _chainOfToken(t) != block.chainid) return address(0);
        return HUB.account(t);
    }

    /// @notice Empty on purpose. This site is not on IPFS; it is the chain.
    ///         The record that matters is text("contentcontract"), which
    ///         ERC-6821 clients read before ever asking for a contenthash.
    function contenthash(bytes32) public pure returns (bytes memory) {
        return "";
    }

    function text(bytes32 node, string calldata key)
        external view returns (string memory)
    {
        return _text(_tokenFor(node), key);
    }

    function _text(uint256 t, string memory key)
        private view returns (string memory)
    {
        bytes32 k = keccak256(bytes(key));

        /*  Which chain this answer is about. A bound or wildcard token is
            answered for the chain its id belongs to, which is arithmetic
            rather than configuration; a bare parent is answered for the
            chain the reader is already on.                             */
        uint256 chain = t == 0 ? block.chainid : _chainOfToken(t);
        (address site, address hub) = _siteFor(chain);

        /*  The one record that turns a name into this site. Chain-scoped
            per ERC-6821 (`w3q-default` would send every chain's traffic to
            one deployment; naming the chain sends each name to its own).

            Empty rather than wrong when the id belongs to a chain no
            station has been set for. An answer naming a chain with the
            local deployment's address on it would resolve, and resolve to
            somebody else's contract.                                   */
        if (k == keccak256("contentcontract")) {
            if (site == address(0)) return "";
            /*  ERC-6821 takes either a bare 0x address or an ERC-3770
                chain-specific one, and ERC-3770 is `shortName:address` with
                the short name drawn from ethereum-lists/chains. It is not
                `eip155:<id>:<address>`, which is what this returned until a
                gateway was asked to parse one and could not.

                The two look interchangeable and are not: CAIP-style
                `eip155:` identifiers are correct for the avatar record
                below, which is why the mistake reads as consistency. A
                chain with no registered short name gets the bare address,
                which resolves on whatever chain the reader is already on —
                the only honest answer when the chain cannot be named.   */
            string memory sn = _shortName(chain);
            if (bytes(sn).length == 0) return LibNum.hexAddr(site);
            return string.concat(sn, ":", LibNum.hexAddr(site));
        }
        if (t == 0 || site == address(0)) return "";
        if (k == keccak256("avatar")) {
            return string.concat(
                "eip155:", chain.str(),
                "/erc721:", LibNum.hexAddr(hub), "/", t.str());
        }
        if (k == keccak256("url")) {
            string memory host = _gateway(chain);
            /*  Where no gateway serves this chain there is no https URL to
                give, and inventing one would send every reader to a host
                that does not exist. The web3:// address is the real one
                either way; a native client needs nothing else.         */
            if (bytes(host).length == 0) {
                return string.concat(
                    "web3://", LibNum.hexAddr(site), ":", chain.str(),
                    "/token/", t.str());
            }
            return string.concat(
                "https://", _bare(site), host, "/token/", t.str());
        }
        if (k == keccak256("description")) {
            /*  The account is a fact about the token's own chain, so it is
                only read where the hub is this one. Elsewhere the sentence
                stops rather than quoting an address from the wrong chain. */
            if (chain != block.chainid)
                return string.concat("IPSEITY #", t.str(),
                    " \xc2\xb7 a self-rendering instrument, on chain ", chain.str());
            return string.concat(
                "IPSEITY #", t.str(),
                " \xc2\xb7 a self-rendering instrument; its account is ",
                LibNum.hexAddr(HUB.account(t)));
        }
        return "";
    }

    /*═══════════════════ the partition, as arithmetic ═══════════════════*/

    /// @notice The first id of a chain's band, or 0 if the edition does not
    ///         use that chain. Must agree with `BANDS` in tools/site.mjs.
    function _bandFirst(uint256 c) internal pure returns (uint256) {
        if (c == 1)    return 1;       // Ethereum   1 .. 1024
        if (c == 8453) return 1025;    // Base    1025 .. 2048
        if (c == 130)  return 2049;    // Unichain 2049 .. 3072
        if (c == 56)   return 3073;    // BNB      3073 .. 3584
        if (c == 4663) return 3585;    // Robinhood 3585 .. 4096
        return 0;
    }

    /// @notice Which chain an id lives on. Zero for an id outside the
    ///         edition entirely.
    /// @dev    A chain the edition does not use is a rehearsal, and a
    ///         rehearsal holds the whole edition — the same rule
    ///         `bandOrWhole` applies off chain. Without this a testnet
    ///         would route its own token 7 to Ethereum and answer for a
    ///         deployment on another network.
    function _chainOfToken(uint256 id) internal view returns (uint256) {
        if (id == 0 || id > EDITION) return 0;
        if (_bandFirst(block.chainid) == 0) return block.chainid;
        if (id <= 1024) return 1;
        if (id <= 2048) return 8453;
        if (id <= 3072) return 130;
        if (id <= 3584) return 56;
        return 4663;
    }

    /// @dev The deployment for a chain: this one's immutables where the
    ///      chain is this one, a station otherwise, and zero where nobody
    ///      has said. Zero is what makes every caller above answer empty
    ///      instead of confidently wrong.
    function _siteFor(uint256 chain)
        internal view returns (address site, address hub)
    {
        if (chain == 0) return (address(0), address(0));
        if (chain == block.chainid) return (PREMISES, address(HUB));
        Station memory st = stationOf[chain];
        return (st.premises, st.hub);
    }

    /// @notice Whether `<id>.parent` can be answered for at all: minted
    ///         here if the id is this chain's, or a known station if not.
    function _reachable(uint256 id) internal view returns (bool) {
        uint256 chain = _chainOfToken(id);
        if (chain == 0) return false;
        if (chain == block.chainid) return id <= HUB.totalSupply();
        return stationOf[chain].premises != address(0);
    }

    /*═══════════════════ ENSIP-10 wildcards ═══════════════════*/

    /// @notice resolve(dns-encoded name, inner resolver call). Bound names
    ///         answer as themselves; `<id>.parent` answers for token <id>.
    function resolve(bytes calldata name, bytes calldata data)
        external view returns (bytes memory)
    {
        uint256 t = _tokenFor(_namehash(name, 0));

        /*  A numeric child of the parent that cannot be served is NOT the
            parent. Both used to arrive here as `t == 0`, and `_text(0,…)`
            answers for the bare name — so `1500.<parent>`, a Base token
            this resolver has not been told the address of, was handed back
            Ethereum's premises under chain 1. That record resolves. A
            wallet would open the wrong deployment and be told nothing.

            Silence is the only correct answer for a name that exists and
            cannot be answered for.                                     */
        bool unservable;
        if (t == 0 && parentNode != bytes32(0)) {
            (uint256 parsed, uint256 next, bool numeric) = _numericLabel(name);
            if (numeric && _namehash(name, next) == parentNode) {
                /*  `_reachable` replaces a bare `<= HUB.totalSupply()`,
                    which asked the local hub about an id the local hub does
                    not own. Under the partition an id belongs to one chain
                    and is minted there; the resolver either sits on that
                    chain, or has been told where it is.                */
                if (_reachable(parsed)) t = parsed;
                else unservable = true;
            }
        }
        bytes4 sel = bytes4(data[:4]);
        if (unservable) {
            if (sel == ADDR_IFACE) return abi.encode(address(0));
            if (sel == CONTENTHASH_IFACE) return abi.encode(bytes(""));
            if (sel == TEXT_IFACE) return abi.encode("");
            revert UnknownQuery();
        }
        if (sel == ADDR_IFACE) {
            /*  An account is a contract on the token's own chain. Answering
                with this chain's 6551 address for a token that lives
                elsewhere would name an address that exists and is not the
                token's — so sending to the name would send into the void.
                Empty is the only honest answer from the wrong chain.   */
            if (t == 0 || _chainOfToken(t) != block.chainid)
                return abi.encode(address(0));
            return abi.encode(HUB.account(t));
        }
        if (sel == CONTENTHASH_IFACE) return abi.encode(bytes(""));
        if (sel == TEXT_IFACE) {
            (, string memory key) = abi.decode(data[4:], (bytes32, string));
            return abi.encode(_text(t, key));
        }
        revert UnknownQuery();
    }

    /// @notice Which token a DNS-encoded name means, bound or wildcard —
    ///         one call for a gateway to know whose page to serve.
    function tokenForName(bytes calldata name) external view returns (uint256) {
        uint256 t = _tokenFor(_namehash(name, 0));
        if (t != 0) return t;
        if (parentNode != bytes32(0)) {
            (uint256 parsed, uint256 next, bool numeric) = _numericLabel(name);
            if (numeric && _reachable(parsed)
                && _namehash(name, next) == parentNode) return parsed;
        }
        return 0;
    }

    /// @notice Which chain an id lives on, and where that deployment is —
    ///         one call for a client that would rather ask than derive.
    ///         `site` is zero when nobody has said where that chain is.
    function whereIs(uint256 id)
        external view returns (uint256 chain, address site, address hub, bool reachable)
    {
        chain = _chainOfToken(id);
        (site, hub) = _siteFor(chain);
        reachable = _reachable(id);
    }

    /*═══════════════════ helpers ═══════════════════*/

    function _namehash(bytes calldata name, uint256 offset)
        private pure returns (bytes32)
    {
        uint256 len = uint8(name[offset]);
        if (len == 0) return bytes32(0);
        return keccak256(abi.encodePacked(
            _namehash(name, offset + len + 1),
            keccak256(name[offset + 1:offset + 1 + len])));
    }

    function _numericLabel(bytes calldata name)
        private pure returns (uint256 value, uint256 next, bool numeric)
    {
        uint256 len = uint8(name[0]);
        if (len == 0 || len > 18) return (0, 0, false);
        for (uint256 i = 1; i <= len; ++i) {
            uint8 c = uint8(name[i]);
            if (c < 0x30 || c > 0x39) return (0, 0, false);
            value = value * 10 + (c - 0x30);
        }
        return (value, len + 1, true);
    }

    /// @dev The premises address without its 0x, for gateway hostnames.
    function _bare(address a) private pure returns (string memory) {
        bytes memory h = bytes(LibNum.hexAddr(a));
        bytes memory out = new bytes(40);
        for (uint256 i; i < 40; ++i) out[i] = h[i + 2];
        return string(out);
    }

    /// @dev The ERC-3770 short name for a chain, from ethereum-lists/chains,
    ///      which is the registry ERC-3770 makes normative. Empty for a
    ///      chain not in it — a name this contract invented would be worse
    ///      than none, because a reader would try to resolve it.
    function _shortName(uint256 c) private pure returns (string memory) {
        if (c == 1)        return "eth";
        if (c == 8453)     return "base";
        if (c == 130)      return "unichain";
        if (c == 56)       return "bnb";
        if (c == 4663)     return "robinhoodchain";
        if (c == 11155111) return "sep";
        if (c == 84532)    return "basesep";
        return "";
    }

    /*  The w3link host tail for this chain, or empty where no gateway runs.

        Two corrections, both measured against DNS rather than assumed.
        Ethereum returned `.w3link.io`, and `<address>.w3link.io` does not
        resolve at all — the host needs the chain's short name in it, so
        mainnet is `.eth.w3link.io`. And the fallback returned that same
        dead tail for every chain not listed, which meant a deployment on a
        chain no gateway serves published a URL that cannot be opened.

        An unserved chain now returns empty and the caller says so. A
        collection whose whole argument is that it needs no server should
        not be the thing that prints a broken link.                      */
    function _gateway(uint256 c) private pure returns (string memory) {
        if (c == 1)        return ".eth.w3link.io";
        if (c == 8453)     return ".base.w3link.io";
        if (c == 56)       return ".bnb.w3link.io";
        if (c == 11155111) return ".sep.w3link.io";
        if (c == 84532)    return ".basesep.w3link.io";
        /*  Unichain (130) and Robinhood (4663) are in the edition and no
            public gateway serves either, so a token in those bands gets a
            web3:// URL and no https one. That is a fact about gateways,
            not about the site — tools/portal.mjs serves any of them.  */
        return "";
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == ADDR_IFACE || id == CONTENTHASH_IFACE
            || id == TEXT_IFACE || id == WILDCARD_IFACE;
    }
}
