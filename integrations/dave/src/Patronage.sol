// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20, IVaultViews} from "./lib/Interfaces.sol";
import {Tiers} from "./lib/Tiers.sol";

interface IHubP {
    function ownerOf(uint256 id) external view returns (address);
    function vaultOf(uint256 id) external view returns (address);
    function pool() external view returns (address);
    function treasury() external view returns (address);
}

/// @title Patronage — the seal-bounty board. Conviction has buyers.
/// @notice Sponsors escrow rewards; sealed vaults earn by covenant-backed
///         weight (bag × tier-mult), streamed per second, MasterChef
///         discipline. Claims pay INTO vaults — emissions born locked.
///         Ragequit forfeits unclaimed accrual to the campaign's room.
contract Patronage {
    address public immutable hub;
    uint128 public constant MIN_POT = 0.5 ether;
    uint64  public constant MIN_DURATION = 30 days;

    struct Campaign {
        address sealToken; address rewardToken;
        uint128 pot;                 // escrowed net of fee
        uint128 accPerW;             // 1e18-scaled
        uint128 totalW;
        uint128 emitted;             // released into accPerW so far
        uint64  start; uint64 end; uint64 lastUpdate;
        uint8   minTier;
        address sponsor;
        bool    closed;
    }
    struct Position { uint128 w; uint128 debt; }

    Campaign[] public campaigns;
    mapping(uint256 => mapping(uint256 => Position)) public pos;  // campId => daveId
    mapping(uint256 => uint256[]) public enlistedIn;

    error Dust(); error BadToken(); error UnlockedHands(); error TierLow();
    error TermShort(); error NoBag(); error ReEnlist(); error NotBearer();
    error NotHub(); error Open_(); error Closed_();

    event Posted(uint256 indexed id, address sealToken, address rewardToken, uint128 pot, uint64 end);
    event Enlisted(uint256 indexed campId, uint256 indexed daveId, uint128 w);
    event Claimed(uint256 indexed campId, uint256 indexed daveId, uint128 amt);
    event Forfeited(uint256 indexed campId, uint256 indexed daveId, uint128 amt);
    event CampaignClosed(uint256 indexed campId, uint128 residue);

    constructor(address hub_) { hub = hub_; }

    // ─── sponsor: escrow. 2% fee → 1% pool, 1% treasury ──────────────
    function postCampaign(
        address sealT, address rewardT, uint128 pot, uint64 duration, uint8 minTier
    ) external returns (uint256 id) {
        if (pot < MIN_POT || duration < MIN_DURATION) revert Dust();
        uint256 before_ = IERC20(rewardT).balanceOf(address(this));
        require(IERC20(rewardT).transferFrom(msg.sender, address(this), pot), "pull");
        if (IERC20(rewardT).balanceOf(address(this)) - before_ != pot) revert BadToken(); // no FoT
        uint128 fee = pot / 50;
        require(IERC20(rewardT).transfer(IHubP(hub).treasury(), fee / 2), "fee.t");
        require(IERC20(rewardT).transfer(IHubP(hub).pool(), fee - fee / 2), "fee.p");
        Campaign memory c;
        c.sealToken = sealT; c.rewardToken = rewardT;
        c.pot = pot - fee;
        c.start = uint64(block.timestamp);
        c.end = uint64(block.timestamp) + duration;
        c.lastUpdate = c.start;
        c.minTier = minTier;
        c.sponsor = msg.sender;
        campaigns.push(c);
        id = campaigns.length - 1;
        emit Posted(id, sealT, rewardT, c.pot, c.end);
    }

    // ─── Dave (bearer-called): weight snapshotted, term covenant-covered ─
    function enlist(uint256 campId, uint256 daveId) external {
        if (msg.sender != IHubP(hub).ownerOf(daveId)) revert NotBearer();
        Campaign storage c = campaigns[campId];
        if (block.timestamp >= c.end) revert Closed_();
        IVaultViews v = IVaultViews(IHubP(hub).vaultOf(daveId));
        if (v.unlockAt() <= block.timestamp) revert UnlockedHands();
        if (c.end > v.unlockAt()) revert TermShort();          // seal covers the term
        uint8 t = v.tier();
        if (t < c.minTier) revert TierLow();
        uint256 amt = v.bagAmount(c.sealToken);
        if (amt == 0) revert NoBag();
        Position storage p = pos[campId][daveId];
        if (p.w != 0) revert ReEnlist();
        _update(c);
        uint128 w = uint128(amt * Tiers.mult(t));
        p.w = w;
        p.debt = uint128(uint256(w) * c.accPerW / 1e18);
        c.totalW += w;
        enlistedIn[daveId].push(campId);
        emit Enlisted(campId, daveId, w);
    }

    function _update(Campaign storage c) internal {
        uint64 t = uint64(block.timestamp) < c.end ? uint64(block.timestamp) : c.end;
        if (t > c.lastUpdate && c.totalW > 0) {
            uint256 em = uint256(c.pot) * (t - c.lastUpdate) / (c.end - c.start);
            uint256 room = c.pot - c.emitted;
            if (em > room) em = room;                          // never emit past pot
            c.accPerW += uint128(em * 1e18 / c.totalW);
            c.emitted += uint128(em);
        }
        c.lastUpdate = t;
    }

    function pending(uint256 campId, uint256 daveId) public view returns (uint128) {
        Campaign storage c = campaigns[campId];
        uint256 acc = c.accPerW;
        uint64 t = uint64(block.timestamp) < c.end ? uint64(block.timestamp) : c.end;
        if (t > c.lastUpdate && c.totalW > 0) {
            uint256 em = uint256(c.pot) * (t - c.lastUpdate) / (c.end - c.start);
            uint256 room = c.pot - c.emitted;
            if (em > room) em = room;
            acc += em * 1e18 / c.totalW;
        }
        Position storage p = pos[campId][daveId];
        return uint128(uint256(p.w) * acc / 1e18 - p.debt);
    }

    /// @notice pays INTO the vault. Born locked if the vault is sealed.
    function claim(uint256 campId, uint256 daveId) public returns (uint128 owed) {
        Campaign storage c = campaigns[campId];
        _update(c);
        Position storage p = pos[campId][daveId];
        owed = uint128(uint256(p.w) * c.accPerW / 1e18 - p.debt);
        if (owed == 0) return 0;
        p.debt += owed;
        require(IERC20(c.rewardToken).transfer(IHubP(hub).vaultOf(daveId), owed), "pay");
        emit Claimed(campId, daveId, owed);
    }

    // ─── Law III: hub hook — forfeit to the room, accounting only ─────
    function onRagequit(uint256 daveId) external {
        if (msg.sender != hub) revert NotHub();
        uint256[] storage ids = enlistedIn[daveId];
        for (uint256 i; i < ids.length; ++i) {
            Campaign storage c = campaigns[ids[i]];
            _update(c);
            Position storage p = pos[ids[i]][daveId];
            if (p.w == 0) continue;
            uint128 owed = uint128(uint256(p.w) * c.accPerW / 1e18 - p.debt);
            c.totalW -= p.w;
            if (owed > 0) {
                if (c.totalW > 0) {
                    c.accPerW += uint128(uint256(owed) * 1e18 / c.totalW);
                } else {
                    // no room left to inherit: return it to the unemitted pot
                    c.emitted -= owed;
                }
            }
            emit Forfeited(ids[i], daveId, owed);
            delete pos[ids[i]][daveId];
        }
        delete enlistedIn[daveId];
    }

    // ─── expiry: unemitted residue home to the sponsor ────────────────
    function closeCampaign(uint256 campId) external returns (uint128 residue) {
        Campaign storage c = campaigns[campId];
        if (block.timestamp <= c.end) revert Open_();
        if (c.closed) revert Closed_();
        _update(c);
        c.closed = true;
        residue = c.pot - c.emitted;          // never streamed to anyone
        if (residue > 0)
            require(IERC20(c.rewardToken).transfer(c.sponsor, residue), "residue");
        emit CampaignClosed(campId, residue);
    }

    function campaignsLength() external view returns (uint256) { return campaigns.length; }
}
