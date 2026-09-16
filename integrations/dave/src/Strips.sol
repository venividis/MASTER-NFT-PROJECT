// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "solady/tokens/ERC20.sol";
import {IERC20} from "./lib/Interfaces.sol";

interface IHubP {
    function ownerOf(uint256 id) external view returns (address);
    function pool() external view returns (address);
    function treasury() external view returns (address);
}
interface IGranaryP { function blessed(address silo) external view returns (bool); }
interface ISiloP {
    function asset() external view returns (address);
    function redeem(uint256 shares, address receiver, address owner_) external returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
}

/// @dev fixed claim on principal. Mint/burn answer to the Strips alone.
contract PrincipalToken is ERC20 {
    address public immutable strips;
    string private _n; string private _s;
    constructor(string memory n_, string memory s_) { strips = msg.sender; _n = n_; _s = s_; }
    function name() public view override returns (string memory) { return _n; }
    function symbol() public view override returns (string memory) { return _s; }
    modifier onlyStrips() { require(msg.sender == strips, "strips"); _; }
    function mint(address to, uint256 amt) external onlyStrips { _mint(to, amt); }
    function burn(address from, uint256 amt) external onlyStrips { _burn(from, amt); }
}

/// @dev floating claim on yield. Every movement checkpoints both parties
///      at the Strips, so accrued yield always follows the holder who
///      earned it — never the buyer of the paper.
contract YieldToken is ERC20 {
    address public immutable strips;
    uint256 public immutable seriesId;
    string private _n; string private _s;
    constructor(string memory n_, string memory s_, uint256 sid) {
        strips = msg.sender; seriesId = sid; _n = n_; _s = s_;
    }
    function name() public view override returns (string memory) { return _n; }
    function symbol() public view override returns (string memory) { return _s; }
    modifier onlyStrips() { require(msg.sender == strips, "strips"); _; }
    function mint(address to, uint256 amt) external onlyStrips { _mint(to, amt); }
    function burn(address from, uint256 amt) external onlyStrips { _burn(from, amt); }
    function _beforeTokenTransfer(address from, address to, uint256) internal override {
        IStripsHook(strips).checkpointPair(seriesId, from, to);
    }
}
interface IStripsHook { function checkpointPair(uint256 seriesId, address a, address b) external; }

/// @title Strips — Codicil XIX. Principal and yield, dealt separately.
///
/// @notice The oldest trick on the bond desk — STRIPS: Separate Trading
///         of Registered Interest and Principal — rebuilt on the
///         covenant. A bearer opens a SERIES on any Granary-blessed
///         silo; anyone brings yield-bearing shares to the shears and
///         walks away holding two papers where one stood:
///
///         PT — the PRINCIPAL: a fixed claim, one asset unit at
///         maturity. Buy it at a discount and the discount IS your
///         fixed rate — a treasury-grade instrument minted from a
///         floating one.
///         YT — the YIELD: everything the silo earns until maturity,
///         streamed by index. Pure rate exposure, leverage on carry,
///         no principal at risk beyond what you paid for the paper.
///
///         Both are plain ERC-20s: list the PT on the Charter and a
///         Dave runs a FIXED-RATE MARKET on its own floor, toll on
///         every trade of paper the shears created. Strip, unstrip
///         (PT + YT recombine into shares any time before maturity),
///         settle at the stroke, redeem, claim.
///
///         HONEST ACCOUNTING, three rules: yield accrues on a
///         HIGH-WATER index (a silo drawdown never un-accrues what YT
///         already earned; recovery to the prior mark adds nothing);
///         every YT transfer checkpoints both parties (accrued yield
///         follows whoever held through the accrual); and if a silo is
///         ever impaired below the principal's face, PT redemptions go
///         PRO-RATA — the strip is exactly as good as the silo, said
///         out loud. The toll — 0.42% of shares brought to the shears,
///         69/31 — rides every strip.
///
/// @dev    The Strips holds nothing of the Dave's — pure custodian of
///         strippers' shares; no bond, no ragequit surface. Sealed
///         vaults strip through the Chambers (this is a venue): shares
///         declared out, PT + YT measured in. Settlement rate is the
///         silo's rate at first touch after maturity.
contract Strips {
    // ─── constants ────────────────────────────────────────────────────
    uint16 public constant TOLL_BPS   = 42;
    uint16 public constant POOL_SHARE = 69;

    address public immutable hub;
    address public immutable granary;

    // ─── series ───────────────────────────────────────────────────────
    struct Series {
        uint64  daveId;
        bool    settled;
        uint64  maturity;
        address silo;
        address pt;
        address yt;
        uint128 heldShares;     // strippers' shares in custody
        uint128 highRate;       // high-water assets per 1e18 shares
        uint128 yieldIndex;     // accrued assets per 1e18 YT
        uint128 yieldOwed;      // accrued, unclaimed (assets)
    }

    Series[] public series;
    mapping(uint256 => mapping(address => uint128)) public userIndex;   // last index seen
    mapping(uint256 => mapping(address => uint128)) public pendingYield; // assets banked
    mapping(uint256 => uint256[]) private _seriesOf;                     // daveId => ids

    uint256 private _lock = 1;

    // ─── errors / events ─────────────────────────────────────────────
    error NotBearer(); error NotBlessed(); error NotYT(); error Params();
    error Empty(); error Matured(); error NotMature(); error NotSettled();
    error Overflow(); error Reentry();

    event SeriesOpened(uint256 indexed seriesId, uint256 indexed daveId, address silo, uint64 maturity, address pt, address yt);
    event Stripped(uint256 indexed seriesId, address indexed who, uint256 shares, uint256 minted);
    event Unstripped(uint256 indexed seriesId, address indexed who, uint256 amount, uint256 shares);
    event Settled(uint256 indexed seriesId, uint128 rate);
    event PrincipalRedeemed(uint256 indexed seriesId, address indexed who, uint256 n, uint256 assets);
    event YieldClaimed(uint256 indexed seriesId, address indexed who, uint256 assets);

    constructor(address hub_, address granary_) { hub = hub_; granary = granary_; }

    modifier nonReentrant() { if (_lock != 1) revert Reentry(); _lock = 2; _; _lock = 1; }

    // ─── opening the shears (the bearer) ─────────────────────────────
    function openSeries(uint256 daveId, address silo, uint64 maturity)
        external returns (uint256 seriesId)
    {
        if (msg.sender != IHubP(hub).ownerOf(daveId)) revert NotBearer();
        if (!IGranaryP(granary).blessed(silo)) revert NotBlessed();
        if (maturity <= block.timestamp) revert Params();
        seriesId = series.length;
        PrincipalToken pt = new PrincipalToken(
            string.concat("DAVE Principal ", _u(seriesId)), string.concat("dPT-", _u(seriesId))
        );
        YieldToken yt = new YieldToken(
            string.concat("DAVE Yield ", _u(seriesId)), string.concat("dYT-", _u(seriesId)), seriesId
        );
        Series memory s;
        s.daveId = uint64(daveId); s.silo = silo; s.maturity = maturity;
        s.pt = address(pt); s.yt = address(yt);
        s.highRate = uint128(ISiloP(silo).convertToAssets(1e18));
        series.push(s);
        _seriesOf[daveId].push(seriesId);
        emit SeriesOpened(seriesId, daveId, silo, maturity, address(pt), address(yt));
    }

    // ─── the shears (anyone) ─────────────────────────────────────────
    /// @notice bring shares; leave holding two papers. Mints asset-value
    ///         of the net shares as PT and as YT, one for one.
    function strip(uint256 seriesId, uint256 shares)
        external nonReentrant returns (uint256 minted)
    {
        Series storage s = series[seriesId];
        if (block.timestamp >= s.maturity) revert Matured();
        if (shares == 0) revert Empty();
        _accrue(s);
        _bank(seriesId, s, msg.sender);

        require(IERC20(s.silo).transferFrom(msg.sender, address(this), shares), "pull");
        uint256 toll = shares * TOLL_BPS / 10_000;
        _splitToll(s.silo, toll);
        uint256 net = shares - toll;
        s.heldShares = _add128(s.heldShares, net);

        minted = _assetsOf(s, net);                           // true asset value at strip
        if (minted == 0) revert Empty();
        PrincipalToken(s.pt).mint(msg.sender, minted);
        YieldToken(s.yt).mint(msg.sender, minted);
        emit Stripped(seriesId, msg.sender, shares, minted);
    }

    /// @notice recombine: burn equal PT + YT, take the shares back.
    function unstrip(uint256 seriesId, uint256 amount)
        external nonReentrant returns (uint256 shares)
    {
        Series storage s = series[seriesId];
        if (block.timestamp >= s.maturity) revert Matured();
        if (amount == 0) revert Empty();
        _accrue(s);
        _bank(seriesId, s, msg.sender);

        PrincipalToken(s.pt).burn(msg.sender, amount);
        YieldToken(s.yt).burn(msg.sender, amount);
        shares = _sharesFor(s, amount);
        if (shares > s.heldShares) shares = s.heldShares;     // rounding fence
        s.heldShares -= uint128(shares);
        require(IERC20(s.silo).transfer(msg.sender, shares), "pay");
        emit Unstripped(seriesId, msg.sender, amount, shares);
    }

    // ─── the stroke of maturity ──────────────────────────────────────
    /// @notice first touch after maturity fixes the rate and freezes the
    ///         yield index. Anyone may ring the bell.
    function settle(uint256 seriesId) public {
        Series storage s = series[seriesId];
        if (block.timestamp < s.maturity) revert NotMature();
        if (s.settled) return;
        _accrue(s);
        s.settled = true;
        emit Settled(seriesId, s.highRate);
    }

    /// @notice one asset unit per PT — pro-rata only if the silo itself
    ///         is impaired below the principal's face.
    function redeemPrincipal(uint256 seriesId, uint256 n)
        external nonReentrant returns (uint256 assets)
    {
        Series storage s = series[seriesId];
        if (!s.settled) { settle(seriesId); }
        if (n == 0) revert Empty();
        PrincipalToken pt = PrincipalToken(s.pt);
        uint256 supply = pt.totalSupply();
        pt.burn(msg.sender, n);

        uint256 avail = _assetsOf(s, s.heldShares);
        avail = avail > s.yieldOwed ? avail - s.yieldOwed : 0;
        assets = avail >= supply ? n : n * avail / supply;    // the honest haircut
        uint256 sh = _sharesFor(s, assets);
        if (sh > s.heldShares) sh = s.heldShares;
        s.heldShares -= uint128(sh);
        if (sh > 0) ISiloP(s.silo).redeem(sh, msg.sender, address(this));
        emit PrincipalRedeemed(seriesId, msg.sender, n, assets);
    }

    /// @notice draw what the paper has earned you, any time.
    function claimYield(uint256 seriesId)
        external nonReentrant returns (uint256 assets)
    {
        Series storage s = series[seriesId];
        _accrue(s);
        _bank(seriesId, s, msg.sender);
        assets = pendingYield[seriesId][msg.sender];
        if (assets == 0) revert Empty();
        pendingYield[seriesId][msg.sender] = 0;
        s.yieldOwed -= uint128(assets);
        uint256 sh = _sharesFor(s, assets);
        if (sh > s.heldShares) sh = s.heldShares;
        s.heldShares -= uint128(sh);
        if (sh > 0) ISiloP(s.silo).redeem(sh, msg.sender, address(this));
        emit YieldClaimed(seriesId, msg.sender, assets);
    }

    /// @notice the YT token calls in on every movement: both parties are
    ///         banked at the current index before a single unit moves.
    function checkpointPair(uint256 seriesId, address a, address b) external {
        Series storage s = series[seriesId];
        if (msg.sender != s.yt) revert NotYT();
        _accrue(s);
        if (a != address(0)) _bank(seriesId, s, a);
        if (b != address(0)) _bank(seriesId, s, b);
    }

    // ─── views ────────────────────────────────────────────────────────
    function yieldOf(uint256 seriesId, address who) external view returns (uint256) {
        Series storage s = series[seriesId];
        uint128 idx = s.yieldIndex;
        if (!s.settled) {
            uint256 r = ISiloP(s.silo).convertToAssets(1e18);
            uint256 ySupply = ERC20(s.yt).totalSupply();
            if (r > s.highRate && ySupply > 0) {
                uint256 delta = uint256(s.heldShares) * (r - s.highRate) / 1e18;
                idx = uint128(idx + delta * 1e18 / ySupply);
            }
        }
        uint256 bal = ERC20(s.yt).balanceOf(who);
        return uint256(pendingYield[seriesId][who]) + bal * (idx - userIndex[seriesId][who]) / 1e18;
    }
    function tokensOf(uint256 seriesId) external view returns (address pt, address yt) {
        return (series[seriesId].pt, series[seriesId].yt);
    }
    function seriesOf(uint256 daveId) external view returns (uint256[] memory) { return _seriesOf[daveId]; }
    function seriesLength() external view returns (uint256) { return series.length; }

    // ─── plumbing ─────────────────────────────────────────────────────
    /// @dev high-water accrual: drawdowns never un-accrue; recovery to
    ///      the prior mark adds nothing. Frozen once settled.
    function _accrue(Series storage s) internal {
        if (s.settled) return;
        uint256 r = ISiloP(s.silo).convertToAssets(1e18);
        if (r <= s.highRate) return;
        uint256 ySupply = ERC20(s.yt).totalSupply();
        if (ySupply > 0 && s.heldShares > 0) {
            uint256 delta = uint256(s.heldShares) * (r - s.highRate) / 1e18;
            s.yieldIndex = _add128(s.yieldIndex, delta * 1e18 / ySupply);
            s.yieldOwed = _add128(s.yieldOwed, delta);
        }
        s.highRate = uint128(r);
    }
    function _bank(uint256 seriesId, Series storage s, address who) internal {
        uint256 bal = ERC20(s.yt).balanceOf(who);
        uint128 idx = s.yieldIndex;
        uint256 owed = bal * (idx - userIndex[seriesId][who]) / 1e18;
        userIndex[seriesId][who] = idx;
        if (owed > 0) pendingYield[seriesId][who] = _add128(pendingYield[seriesId][who], owed);
    }
    function _assetsOf(Series storage s, uint256 shares) internal view returns (uint256) {
        return ISiloP(s.silo).convertToAssets(shares);
    }
    function _sharesFor(Series storage s, uint256 assets) internal view returns (uint256) {
        uint256 r = ISiloP(s.silo).convertToAssets(1e18);
        return r == 0 ? 0 : assets * 1e18 / r;
    }
    function _splitToll(address token, uint256 toll) internal {
        if (toll == 0) return;
        uint256 toPool = toll * POOL_SHARE / 100;
        require(IERC20(token).transfer(IHubP(hub).pool(), toPool), "toll");
        require(IERC20(token).transfer(IHubP(hub).treasury(), toll - toPool), "toll");
    }
    function _u(uint256 x) internal pure returns (string memory) {
        if (x == 0) return "0";
        bytes memory b; while (x > 0) { b = abi.encodePacked(uint8(48 + x % 10), b); x /= 10; }
        return string(b);
    }
    function _add128(uint128 a, uint256 b) internal pure returns (uint128) {
        uint256 c = uint256(a) + b;
        if (c > type(uint128).max) revert Overflow();
        return uint128(c);
    }
}
