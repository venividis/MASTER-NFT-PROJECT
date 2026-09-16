// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./lib/Interfaces.sol";

interface IHubU {
    function ownerOf(uint256 id) external view returns (address);
    function vaultOf(uint256 id) external view returns (address);
    function pool() external view returns (address);
    function treasury() external view returns (address);
    function rankOf(uint256 id) external view returns (uint32);
}
interface IVaultViewsU {
    function unlockAt() external view returns (uint64);
    function temper() external view returns (uint32);
    function paperHands() external view returns (uint32);
    function convictionLive() external view returns (uint256);
}
interface IVaultAckU { function acknowledge(address t) external; }

/// @title Surety — Codicil XX. Conviction, re-staked. The slash feeds the faithful.
///
/// @notice Restaking, covenant-shaped: a Dave UNDERWRITES an outside
///         service — a protocol, an oracle set, an agent, a ward of any
///         kind — by posting stake behind its correctness. The ward
///         gets what restaking always promised: verifiable, slashable
///         economic security, priced and posted by an underwriter whose
///         CREDIT HISTORY IS PUBLIC — temper, paper hands, live
///         conviction, engraved rank. The lender reads the ledger; so
///         does the ward.
///
///         THE SLASH FEEDS THE FAITHFUL. When an adjudicator cuts a
///         pledge, the stake is not burned and it does not leave for a
///         stranger's pocket: it pays the covenant's own penal split —
///         69% to the ConvictionPool, 31% to treasury. One Dave's
///         failure pays every sealed Dave. The security budget never
///         exits the system it secures; misbehavior is redistribution,
///         not destruction.
///
///         Terms are the bearer's to name and the ward's to accept by
///         relying: the ADJUDICATOR is fixed at underwriting (an
///         optimistic oracle, a committee, the ward itself — read who
///         judges before you rely); the TERM is ratchet-only, like
///         every promise here; stake is COMMITTED for the term — it
///         cannot be withdrawn early, and it does not flinch at
///         ragequit: THE SURETY SURVIVES THE BEARER'S COWARDICE. Past
///         the term, the stake walks home — INTO THE VAULT. Name no
///         adjudicator and the pledge is an ATTESTATION: unslashable,
///         locked, pure reputation weight.
///
///         Wards pay PREMIUMS for coverage; premiums land vault-ward
///         the block they arrive, less the 0.42% toll, 69/31 — the
///         insurance revenue line on the sealed balance sheet.
///
/// @dev    ERC-20 stake only. Stake escrows here so a slash is
///         collectible without touching the seal; sealed vaults stake
///         through the Chambers (this is a venue, exits vault-ward).
contract Surety {
    // ─── constants ────────────────────────────────────────────────────
    uint16 public constant TOLL_BPS   = 42;
    uint16 public constant POOL_SHARE = 69;    // of the slash AND the toll
    uint32 public constant MAX_TERM   = 4 * 365 days;

    address public immutable hub;

    // ─── pledges ──────────────────────────────────────────────────────
    struct Pledge {
        uint64  daveId;
        bool    closed;
        uint64  until;          // committed through; ratchet-only
        address ward;           // who the surety stands behind
        address adjudicator;    // 0 = attestation (unslashable)
        address asset;          // ERC-20
        uint128 staked;
        uint128 slashed;        // lifetime, for the record
    }

    Pledge[] public pledges;
    mapping(uint256 => uint256[]) private _pledgesOf;   // daveId => pledgeIds

    uint256 private _lock = 1;

    // ─── errors / events ─────────────────────────────────────────────
    error NotBearer(); error NotAdjudicator(); error Closed_(); error Params();
    error Empty(); error Underwriting(); error RatchetOnly(); error OverCoverage();
    error Unslashable(); error Overflow(); error Reentry();

    event Underwritten(uint256 indexed pledgeId, uint256 indexed daveId, address ward, address adjudicator, address asset, uint64 until);
    event Staked(uint256 indexed pledgeId, address indexed from, uint256 amount);
    event Extended(uint256 indexed pledgeId, uint64 until);
    event Slashed(uint256 indexed pledgeId, uint256 amount, bytes32 evidence);
    event PremiumPaid(uint256 indexed pledgeId, address indexed from, uint256 toVault);
    event Withdrawn(uint256 indexed pledgeId, uint256 amount);
    event PledgeClosed(uint256 indexed pledgeId);

    constructor(address hub_) { hub = hub_; }

    modifier nonReentrant() { if (_lock != 1) revert Reentry(); _lock = 2; _; _lock = 1; }
    modifier onlyBearer(uint256 pledgeId) {
        if (msg.sender != IHubU(hub).ownerOf(pledges[pledgeId].daveId)) revert NotBearer();
        _;
    }

    // ─── underwriting (the bearer names the terms) ───────────────────
    function underwrite(
        uint256 daveId, address ward, address adjudicator,
        address asset, uint64 until
    ) external returns (uint256 pledgeId) {
        if (msg.sender != IHubU(hub).ownerOf(daveId)) revert NotBearer();
        if (ward == address(0) || asset == address(0)) revert Params();
        if (until <= block.timestamp || until > block.timestamp + MAX_TERM) revert Params();
        pledgeId = pledges.length;
        Pledge memory p;
        p.daveId = uint64(daveId);
        p.ward = ward; p.adjudicator = adjudicator;
        p.asset = asset; p.until = until;
        pledges.push(p);
        _pledgesOf[daveId].push(pledgeId);
        emit Underwritten(pledgeId, daveId, ward, adjudicator, asset, until);
    }

    /// @notice post stake. Additive, from any payer — a sealed vault
    ///         stakes through the Chambers.
    function stake(uint256 pledgeId, uint256 amount) external nonReentrant {
        Pledge storage p = pledges[pledgeId];
        if (p.closed || block.timestamp >= p.until) revert Closed_();
        if (amount == 0) revert Empty();
        require(IERC20(p.asset).transferFrom(msg.sender, address(this), amount), "pull");
        p.staked = _add128(p.staked, amount);
        emit Staked(pledgeId, msg.sender, amount);
    }

    /// @notice the term only ever lengthens.
    function extend(uint256 pledgeId, uint64 until)
        external onlyBearer(pledgeId)
    {
        Pledge storage p = pledges[pledgeId];
        if (p.closed) revert Closed_();
        if (until <= p.until) revert RatchetOnly();
        if (until > block.timestamp + MAX_TERM) revert Params();
        p.until = until;
        emit Extended(pledgeId, until);
    }

    // ─── judgment (the named adjudicator) ────────────────────────────
    /// @notice cut the pledge, with the evidence on the record. The
    ///         proceeds pay the covenant's penal split — 69% to the
    ///         ConvictionPool, 31% to treasury. One Dave's failure pays
    ///         every sealed Dave.
    function slash(uint256 pledgeId, uint256 amount, bytes32 evidence)
        external nonReentrant
    {
        Pledge storage p = pledges[pledgeId];
        if (p.adjudicator == address(0)) revert Unslashable();
        if (msg.sender != p.adjudicator) revert NotAdjudicator();
        if (p.closed || block.timestamp >= p.until) revert Closed_();
        if (amount == 0 || amount > p.staked) revert OverCoverage();
        p.staked -= uint128(amount);
        p.slashed = _add128(p.slashed, amount);
        uint256 toPool = amount * POOL_SHARE / 100;
        require(IERC20(p.asset).transfer(IHubU(hub).pool(), toPool), "pay");
        require(IERC20(p.asset).transfer(IHubU(hub).treasury(), amount - toPool), "pay");
        emit Slashed(pledgeId, amount, evidence);
    }

    // ─── coverage revenue (the ward, or anyone) ──────────────────────
    /// @notice pay for the cover. Premiums land VAULT-WARD, born
    ///         locked, less the toll.
    function premium(uint256 pledgeId, uint256 amount) external nonReentrant {
        Pledge storage p = pledges[pledgeId];
        if (p.closed) revert Closed_();
        if (amount == 0) revert Empty();
        require(IERC20(p.asset).transferFrom(msg.sender, address(this), amount), "pull");
        uint256 toll = amount * TOLL_BPS / 10_000;
        _splitToll(p.asset, toll);
        address vault = IHubU(hub).vaultOf(p.daveId);
        require(IERC20(p.asset).transfer(vault, amount - toll), "pay");
        _ack(vault, p.asset);
        emit PremiumPaid(pledgeId, msg.sender, amount - toll);
    }

    // ─── homecoming ───────────────────────────────────────────────────
    /// @notice past the term, the stake walks home — INTO THE VAULT.
    ///         Not a block sooner: the surety survives the bearer's
    ///         cowardice, and its impatience too.
    function withdraw(uint256 pledgeId, uint256 amount)
        external nonReentrant onlyBearer(pledgeId)
    {
        Pledge storage p = pledges[pledgeId];
        if (block.timestamp < p.until) revert Underwriting();
        if (amount == 0 || amount > p.staked) revert Empty();
        p.staked -= uint128(amount);
        address vault = IHubU(hub).vaultOf(p.daveId);
        require(IERC20(p.asset).transfer(vault, amount), "pay");
        _ack(vault, p.asset);
        emit Withdrawn(pledgeId, amount);
    }

    function closePledge(uint256 pledgeId)
        external onlyBearer(pledgeId)
    {
        Pledge storage p = pledges[pledgeId];
        if (p.closed) revert Closed_();
        if (block.timestamp < p.until || p.staked != 0) revert Underwriting();
        p.closed = true;
        emit PledgeClosed(pledgeId);
    }

    // ─── views ────────────────────────────────────────────────────────
    /// @notice the underwriting résumé — the ledger the ward reads.
    function credential(uint256 daveId)
        external view
        returns (uint32 temper, uint32 paperHands, uint256 convictionLive, uint32 rank, uint256 totalStaked)
    {
        IVaultViewsU v = IVaultViewsU(IHubU(hub).vaultOf(daveId));
        temper = v.temper();
        paperHands = v.paperHands();
        convictionLive = v.convictionLive();
        rank = IHubU(hub).rankOf(daveId);
        uint256[] storage ids = _pledgesOf[daveId];
        for (uint256 i; i < ids.length; ++i) totalStaked += pledges[ids[i]].staked;
    }
    function coverage(uint256 pledgeId) external view returns (uint256) {
        return pledges[pledgeId].staked;
    }
    function pledgesOf(uint256 daveId) external view returns (uint256[] memory) { return _pledgesOf[daveId]; }
    function pledgesLength() external view returns (uint256) { return pledges.length; }

    // ─── plumbing ─────────────────────────────────────────────────────
    function _splitToll(address token, uint256 toll) internal {
        if (toll == 0) return;
        uint256 toPool = toll * POOL_SHARE / 100;
        require(IERC20(token).transfer(IHubU(hub).pool(), toPool), "toll");
        require(IERC20(token).transfer(IHubU(hub).treasury(), toll - toPool), "toll");
    }
    function _ack(address vault, address token) internal {
        try IVaultAckU(vault).acknowledge(token) {} catch {}
    }
    function _add128(uint128 a, uint256 b) internal pure returns (uint128) {
        uint256 c = uint256(a) + b;
        if (c > type(uint128).max) revert Overflow();
        return uint128(c);
    }
}
