// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "solady/tokens/ERC20.sol";
import {IERC20} from "./lib/Interfaces.sol";

interface IHubE {
    function ownerOf(uint256 id) external view returns (address);
    function vaultOf(uint256 id) external view returns (address);
    function pool() external view returns (address);
    function treasury() external view returns (address);
}
interface IVaultAckE { function acknowledge(address t) external; }

/// @dev the fund's share class. Mint/burn answer to the Issue alone.
contract FundShare is ERC20 {
    address public immutable issue;
    string private _n; string private _s;
    constructor(string memory n_, string memory s_) { issue = msg.sender; _n = n_; _s = s_; }
    function name() public view override returns (string memory) { return _n; }
    function symbol() public view override returns (string memory) { return _s; }
    modifier onlyIssue() { require(msg.sender == issue, "issue"); _; }
    function mint(address to, uint256 amt) external onlyIssue { _mint(to, amt); }
    function burn(address from, uint256 amt) external onlyIssue { _burn(from, amt); }
}

/// @title Issue — Codicil XXI. Every Dave its own fund issuer.
///
/// @notice The ETF, re-derived on the covenant. A bearer publishes a
///         PROSPECTUS: a basket recipe — tokens and exact amounts per
///         share — and the Issue deploys the fund's share class. From
///         then on the machine runs the way the real one does, minus
///         the trust: anyone may CREATE shares by delivering the basket
///         in kind, and anyone may REDEEM shares for the basket back.
///         Fully backed at every block by arithmetic, not attestation —
///         the contract can only ever hold exactly what the shares
///         claim.
///
///         Two carvings make it un-ruggable:
///
///         THE PROSPECTUS IS CARVED — the recipe is immutable from the
///         first share. No reweighting under the holders, ever. A new
///         thesis is a new fund.
///
///         THE EXIT IS ETERNAL — the bearer may halt CREATIONS (cap
///         the fund, wind it down) but redemption can never be closed,
///         paused, gated, or fee'd above its carved rate. Whoever holds
///         a share can always walk out with the basket.
///
///         THE ISSUER'S CUT, in the issuer's own product: creation and
///         redemption fees are carved in shares and paid INTO THE
///         VAULT — the Dave accumulates its own ETF as it operates it,
///         the cleanest alignment there is. The toll — 0.42%, in
///         shares, 69/31 — rides both directions; every sealed Dave
///         earns from every fund on the chain.
///
/// @dev    ERC-20 components only, ≤ 16 per basket, amounts per 1e18
///         share. Fee-on-transfer and rebasing components unsupported.
///         Shares are plain ERC-20s — list them on the Charter and the
///         fund trades on the Dave's own floor. Sealed creation through
///         the Chambers declares one spend per act: single-component
///         funds flow sealed; multi-component creation is an unsealed
///         or module-orchestrated flow.
contract Issue {
    // ─── constants ────────────────────────────────────────────────────
    uint16  public constant TOLL_BPS       = 42;
    uint16  public constant POOL_SHARE     = 69;
    uint16  public constant MAX_FEE_BPS    = 200;    // each direction, carved at open
    uint256 public constant MAX_COMPONENTS = 16;

    address public immutable hub;

    // ─── funds ────────────────────────────────────────────────────────
    struct Fund {
        uint64  daveId;
        bool    halted;         // creations only; the exit is eternal
        uint16  issueFeeBps;
        uint16  redeemFeeBps;
        address share;
        address[] tokens;
        uint256[] amounts;      // per 1e18 share
    }

    Fund[] private _funds;
    mapping(uint256 => uint256[]) private _fundsOf;   // daveId => fundIds

    uint256 private _lock = 1;

    // ─── errors / events ─────────────────────────────────────────────
    error NotBearer(); error Params(); error Empty(); error Halted();
    error Overflow(); error Reentry();

    event FundOpened(uint256 indexed fundId, uint256 indexed daveId, address share, uint16 issueFeeBps, uint16 redeemFeeBps);
    event Created(uint256 indexed fundId, address indexed who, uint256 gross, uint256 net);
    event Redeemed(uint256 indexed fundId, address indexed who, uint256 gross, uint256 net);
    event Creations(uint256 indexed fundId, bool halted);

    constructor(address hub_) { hub = hub_; }

    modifier nonReentrant() { if (_lock != 1) revert Reentry(); _lock = 2; _; _lock = 1; }
    modifier onlyBearer(uint256 fundId) {
        if (msg.sender != IHubE(hub).ownerOf(_funds[fundId].daveId)) revert NotBearer();
        _;
    }

    // ─── the prospectus (the bearer, once) ───────────────────────────
    function openFund(
        uint256 daveId, address[] calldata tokens, uint256[] calldata amounts,
        uint16 issueFeeBps, uint16 redeemFeeBps
    ) external returns (uint256 fundId) {
        if (msg.sender != IHubE(hub).ownerOf(daveId)) revert NotBearer();
        if (tokens.length == 0 || tokens.length > MAX_COMPONENTS) revert Params();
        if (tokens.length != amounts.length) revert Params();
        if (issueFeeBps > MAX_FEE_BPS || redeemFeeBps > MAX_FEE_BPS) revert Params();
        for (uint256 i; i < tokens.length; ++i)
            if (tokens[i] == address(0) || amounts[i] == 0) revert Params();
        fundId = _funds.length;
        FundShare share = new FundShare(
            string.concat("DAVE Issue ", _u(fundId)), string.concat("dFUND-", _u(fundId))
        );
        Fund storage f = _funds.push();
        f.daveId = uint64(daveId);
        f.issueFeeBps = issueFeeBps; f.redeemFeeBps = redeemFeeBps;
        f.share = address(share);
        f.tokens = tokens; f.amounts = amounts;
        _fundsOf[daveId].push(fundId);
        emit FundOpened(fundId, daveId, address(share), issueFeeBps, redeemFeeBps);
    }

    /// @notice creations may halt; the exit never does.
    function setCreations(uint256 fundId, bool halted) external onlyBearer(fundId) {
        _funds[fundId].halted = halted;
        emit Creations(fundId, halted);
    }

    // ─── creation (any authorized participant — which is anyone) ─────
    /// @notice deliver the basket, take the shares. Issuer's fee and the
    ///         toll are carved from the mint, in shares.
    function create(uint256 fundId, uint256 n)
        external nonReentrant returns (uint256 net)
    {
        Fund storage f = _funds[fundId];
        if (f.halted) revert Halted();
        if (n == 0) revert Empty();
        for (uint256 i; i < f.tokens.length; ++i) {
            uint256 amt = f.amounts[i] * n / 1e18;
            if (amt == 0) revert Empty();
            require(IERC20(f.tokens[i]).transferFrom(msg.sender, address(this), amt), "pull");
        }
        FundShare sh = FundShare(f.share);
        uint256 fee = n * f.issueFeeBps / 10_000;
        uint256 toll = n * TOLL_BPS / 10_000;
        net = n - fee - toll;
        sh.mint(msg.sender, net);
        _carve(f, sh, fee, toll);
        emit Created(fundId, msg.sender, n, net);
    }

    /// @notice hand back shares, walk out with the basket. Cannot be
    ///         closed, paused, or gated — ever.
    function redeem(uint256 fundId, uint256 n)
        external nonReentrant returns (uint256 net)
    {
        Fund storage f = _funds[fundId];
        if (n == 0) revert Empty();
        FundShare sh = FundShare(f.share);
        uint256 fee = n * f.redeemFeeBps / 10_000;
        uint256 toll = n * TOLL_BPS / 10_000;
        net = n - fee - toll;
        sh.burn(msg.sender, n);                   // gross out…
        _carve(f, sh, fee, toll);                 // …carve re-minted: supply falls by net, exactly
        for (uint256 i; i < f.tokens.length; ++i) {
            uint256 amt = f.amounts[i] * net / 1e18;
            require(IERC20(f.tokens[i]).transfer(msg.sender, amt), "pay");
        }
        emit Redeemed(fundId, msg.sender, n, net);
    }

    // ─── views ────────────────────────────────────────────────────────
    function recipe(uint256 fundId)
        external view returns (address[] memory tokens, uint256[] memory amounts)
    {
        Fund storage f = _funds[fundId];
        return (f.tokens, f.amounts);
    }
    function fund(uint256 fundId)
        external view
        returns (uint64 daveId, bool halted, uint16 issueFeeBps, uint16 redeemFeeBps, address share)
    {
        Fund storage f = _funds[fundId];
        return (f.daveId, f.halted, f.issueFeeBps, f.redeemFeeBps, f.share);
    }
    function basketFor(uint256 fundId, uint256 n)
        external view returns (uint256[] memory amts)
    {
        Fund storage f = _funds[fundId];
        amts = new uint256[](f.tokens.length);
        for (uint256 i; i < f.tokens.length; ++i) amts[i] = f.amounts[i] * n / 1e18;
    }
    function fundsOf(uint256 daveId) external view returns (uint256[] memory) { return _fundsOf[daveId]; }
    function fundsLength() external view returns (uint256) { return _funds.length; }

    // ─── plumbing ─────────────────────────────────────────────────────
    /// @dev the issuer's cut, in the issuer's own product — the fee
    ///      shares mint to THE VAULT; the toll shares split 69/31.
    function _carve(Fund storage f, FundShare sh, uint256 fee, uint256 toll) internal {
        if (fee > 0) {
            address vault = IHubE(hub).vaultOf(f.daveId);
            sh.mint(vault, fee);
            _ack(vault, address(sh));
        }
        if (toll > 0) {
            uint256 toPool = toll * POOL_SHARE / 100;
            sh.mint(IHubE(hub).pool(), toPool);
            sh.mint(IHubE(hub).treasury(), toll - toPool);
        }
    }
    function _ack(address vault, address token) internal {
        try IVaultAckE(vault).acknowledge(token) {} catch {}
    }
    function _u(uint256 x) internal pure returns (string memory) {
        if (x == 0) return "0";
        bytes memory b; while (x > 0) { b = abi.encodePacked(uint8(48 + x % 10), b); x /= 10; }
        return string(b);
    }
}
