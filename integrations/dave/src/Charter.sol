// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./lib/Interfaces.sol";
import {IAllowlist} from "./lib/Oracles.sol";

interface IHubC {
    function ownerOf(uint256 id) external view returns (address);
    function vaultOf(uint256 id) external view returns (address);
    function pool() external view returns (address);
    function treasury() external view returns (address);
}
interface IVaultViewsC { function unlockAt() external view returns (uint64); }
interface IVaultAckC { function acknowledge(address t) external; }

/// @title Charter — Codicil VIII. The chartered venue. Every Dave a pool.
///
/// @notice The Bourse gave the Daves the NFT floor; the Charter gives them
///         the token floor. A bearer CHARTERS a pool: a constant-product
///         market (x·y=k) in any two ERC-20s — Robinhood Stock Tokens
///         included — or ERC-20 against ETH. The pool belongs to the Dave.
///         Sell the Dave, sell the fee switch, the policy, the venue.
///
///         Uniswap-v4-shaped by doctrine, self-contained by construction:
///         the toll is the afterSwap hook, the bond is beforeRemoveLiquidity,
///         vault-ward is the payout policy, the allowlist is the compliance
///         hook, tier-discount is dynamic fees. On a chain carrying v4 the
///         same doctrines port into one hook contract; here they ARE the
///         venue, with no dependency to wait on.
///
///         THE DAVE IS THE LP. Charter pools carry house liquidity only —
///         the venue thesis, not the commons thesis. Liquidity enters from
///         the bearer, additive any time; it exits only VAULT-WARD, and
///         only past the bond.
///
///         THE BOND, again: a sealed Dave bonds its pool to unlockAt,
///         ratchet-only. While bonded there is no withdrawal, no fee
///         change, no policy change, no close — an unruggable token floor
///         to match the unruggable NFT floors. The bond survives ragequit:
///         both reserves are tolled at the covenant rate (4.20%, 69/31)
///         and the charter stands.
///
///         THE TOLL, universal now: 0.42% of every swap's input, 69% to
///         the ConvictionPool, 31% to treasury. Sealed Daves earn from
///         ALL exchange volume, both floors. Traders who present a sealed
///         Dave of their own swap at a 20% pool-fee discount — conviction
///         as a fee tier.
///
///         THE OBSERVATORY. Each pool keeps a ring of price observations
///         (8 slots, 5-minute cadence) — a TWAP other codicils can stand
///         on. The House (Codicil X) marks against it when its feed goes
///         quiet.
///
/// @dev    Stated limits: fee-on-transfer and rebasing tokens unsupported;
///         base must be ERC-20, quote may be ETH (address(0)); the first
///         liquidity sets the price — charter, fund, then announce.
contract Charter {
    // ─── constants ────────────────────────────────────────────────────
    uint16  public constant TOLL_BPS     = 42;      // 0.42% every swap
    uint16  public constant POOL_SHARE   = 69;      // of toll / rage tax
    uint16  public constant RAGE_BPS     = 420;     // 4.20% at ragequit
    uint16  public constant MAX_FEE_BPS  = 300;     // pool fee cap (3%)
    uint16  public constant DISCOUNT     = 80;      // sealed trader pays 80%
    uint32  public constant OBS_GAP      = 5 minutes;
    uint8   public constant OBS_SLOTS    = 8;

    address public immutable hub;

    // ─── pools ────────────────────────────────────────────────────────
    struct Pool {
        uint64  daveId;
        bool    closed;
        uint16  feeBps;
        uint64  bondUntil;     // 0 = unbonded
        address base;          // ERC-20
        address quote;         // ERC-20 or address(0) = ETH
        address allowlist;     // 0 = open venue
        uint128 rBase;
        uint128 rQuote;
    }
    struct Obs { uint32 ts; uint224 cum; }   // cum: Σ price(1e18)·dt

    Pool[] public pools;
    mapping(uint256 => Obs[OBS_SLOTS]) private _obs;
    mapping(uint256 => uint8)  private _obsHead;
    mapping(uint256 => uint32) private _lastTs;      // last cum update
    mapping(uint256 => uint224) private _cum;        // running cumulative
    mapping(uint256 => uint256[]) private _poolsOf;  // daveId => poolIds

    uint256 private _lock = 1;

    // ─── errors / events ─────────────────────────────────────────────
    error NotBearer(); error NotHub(); error Closed_(); error BondHolds();
    error NotSealed(); error RatchetOnly(); error FeeRule(); error Empty();
    error EthMismatch(); error Slippage(); error DryPool(); error Overflow();
    error Reentry(); error NotAllowed(); error BadPair(); error NoObs();

    event Chartered(uint256 indexed poolId, uint256 indexed daveId, address base, address quote, uint16 feeBps, address allowlist);
    event Liquidity(uint256 indexed poolId, uint128 dBase, uint128 dQuote, bool added);
    event Policy(uint256 indexed poolId, uint16 feeBps, address allowlist);
    event Bonded(uint256 indexed poolId, uint64 bondUntil);
    event Swapped(uint256 indexed poolId, address indexed trader, bool baseIn, uint256 amtIn, uint256 amtOut);
    event PoolClosed(uint256 indexed poolId);
    event RagequitToll(uint256 indexed poolId, uint256 taxBase, uint256 taxQuote);

    constructor(address hub_) { hub = hub_; }
    receive() external payable {}

    modifier nonReentrant() { if (_lock != 1) revert Reentry(); _lock = 2; _; _lock = 1; }
    modifier onlyBearer(uint256 poolId) {
        if (msg.sender != IHubC(hub).ownerOf(pools[poolId].daveId)) revert NotBearer();
        _;
    }
    modifier open_(uint256 poolId) { if (pools[poolId].closed) revert Closed_(); _; }

    // ─── chartering (the bearer) ─────────────────────────────────────
    function charterPool(
        uint256 daveId, address base, address quote_,
        uint16 feeBps, address allowlist
    ) external returns (uint256 poolId) {
        if (msg.sender != IHubC(hub).ownerOf(daveId)) revert NotBearer();
        if (base == address(0) || base == quote_) revert BadPair();
        if (feeBps > MAX_FEE_BPS) revert FeeRule();
        poolId = pools.length;
        Pool memory p;
        p.daveId = uint64(daveId);
        p.base = base; p.quote = quote_;
        p.feeBps = feeBps; p.allowlist = allowlist;
        pools.push(p);
        _poolsOf[daveId].push(poolId);
        _lastTs[poolId] = uint32(block.timestamp);
        emit Chartered(poolId, daveId, base, quote_, feeBps, allowlist);
    }

    /// @notice add reserves. Additive: allowed even while bonded.
    function addLiquidity(uint256 poolId, uint256 amtBase, uint256 amtQuote)
        external payable nonReentrant onlyBearer(poolId) open_(poolId)
    {
        Pool storage p = pools[poolId];
        if (amtBase == 0 && amtQuote == 0) revert Empty();
        _observe(poolId, p);
        if (amtBase > 0)
            require(IERC20(p.base).transferFrom(msg.sender, address(this), amtBase), "pull");
        if (p.quote == address(0)) {
            if (msg.value != amtQuote) revert EthMismatch();
        } else {
            if (msg.value != 0) revert EthMismatch();
            if (amtQuote > 0)
                require(IERC20(p.quote).transferFrom(msg.sender, address(this), amtQuote), "pull");
        }
        p.rBase = _add128(p.rBase, amtBase);
        p.rQuote = _add128(p.rQuote, amtQuote);
        emit Liquidity(poolId, uint128(amtBase), uint128(amtQuote), true);
    }

    /// @notice withdraw reserves — INTO THE VAULT. Only past the bond.
    function withdrawLiquidity(uint256 poolId, uint256 amtBase, uint256 amtQuote)
        external nonReentrant onlyBearer(poolId)
    {
        Pool storage p = pools[poolId];
        if (_bonded(p)) revert BondHolds();
        if (amtBase > p.rBase || amtQuote > p.rQuote) revert DryPool();
        _observe(poolId, p);
        p.rBase -= uint128(amtBase);
        p.rQuote -= uint128(amtQuote);
        address vault = IHubC(hub).vaultOf(p.daveId);
        if (amtBase > 0)  { _payStrict(p.base, vault, amtBase);  _ack(vault, p.base); }
        if (amtQuote > 0) { _payStrict(p.quote, vault, amtQuote); _ack(vault, p.quote); }
        emit Liquidity(poolId, uint128(amtBase), uint128(amtQuote), false);
    }

    /// @notice fee + allowlist policy. Frozen while the bond holds.
    function setPolicy(uint256 poolId, uint16 feeBps, address allowlist)
        external onlyBearer(poolId) open_(poolId)
    {
        Pool storage p = pools[poolId];
        if (_bonded(p)) revert BondHolds();
        if (feeBps > MAX_FEE_BPS) revert FeeRule();
        p.feeBps = feeBps; p.allowlist = allowlist;
        emit Policy(poolId, feeBps, allowlist);
    }

    /// @notice bond the pool to the Dave's seal. Ratchet-only. Survives
    ///         ragequit. An unruggable token floor.
    function bond(uint256 poolId) external onlyBearer(poolId) open_(poolId) {
        Pool storage p = pools[poolId];
        uint64 u = IVaultViewsC(IHubC(hub).vaultOf(p.daveId)).unlockAt();
        if (u <= uint64(block.timestamp)) revert NotSealed();
        if (u <= p.bondUntil) revert RatchetOnly();
        p.bondUntil = u;
        emit Bonded(poolId, u);
    }

    /// @notice fold the charter. Both reserves — INTO THE VAULT.
    function closePool(uint256 poolId)
        external nonReentrant onlyBearer(poolId) open_(poolId)
    {
        Pool storage p = pools[poolId];
        if (_bonded(p)) revert BondHolds();
        p.closed = true;
        uint256 b = p.rBase; uint256 q = p.rQuote;
        p.rBase = 0; p.rQuote = 0;
        address vault = IHubC(hub).vaultOf(p.daveId);
        if (b > 0) { _payStrict(p.base, vault, b);  _ack(vault, p.base); }
        if (q > 0) { _payStrict(p.quote, vault, q); _ack(vault, p.quote); }
        emit PoolClosed(poolId);
    }

    // ─── trading the venue (anyone the charter admits) ───────────────
    /// @notice swap against the pool. x·y=k after toll and fee. Present a
    ///         sealed Dave you bear and the pool fee discounts to 80% —
    ///         conviction as a fee tier. Toll pays 69/31; fee stays in
    ///         reserves — the Dave is the LP, the fee is its earn.
    /// @param  discountDave 0 = none; else a Dave you own, sealed now.
    function swap(
        uint256 poolId, bool baseIn, uint256 amtIn,
        uint256 minOut, uint256 discountDave
    ) external payable nonReentrant open_(poolId) returns (uint256 amtOut) {
        Pool storage p = pools[poolId];
        if (amtIn == 0) revert Empty();
        if (p.rBase == 0 || p.rQuote == 0) revert DryPool();
        if (p.allowlist != address(0) && !IAllowlist(p.allowlist).isAllowed(msg.sender))
            revert NotAllowed();
        _observe(poolId, p);

        uint256 toll = amtIn * TOLL_BPS / 10_000;
        uint256 fee  = amtIn * _feeFor(p, discountDave) / 10_000;
        uint256 inNet = amtIn - toll - fee;

        address tokIn  = baseIn ? p.base : p.quote;
        address tokOut = baseIn ? p.quote : p.base;
        (uint256 rIn, uint256 rOut) = baseIn
            ? (uint256(p.rBase), uint256(p.rQuote))
            : (uint256(p.rQuote), uint256(p.rBase));

        amtOut = rOut * inNet / (rIn + inNet);
        if (amtOut < minOut) revert Slippage();
        if (amtOut >= rOut) revert DryPool();

        // effects: fee stays in reserves; toll passes through
        if (baseIn) { p.rBase = _add128(p.rBase, amtIn - toll); p.rQuote -= uint128(amtOut); }
        else        { p.rQuote = _add128(p.rQuote, amtIn - toll); p.rBase -= uint128(amtOut); }

        // interactions: collect, toll, deliver
        if (tokIn == address(0)) {
            if (msg.value != amtIn) revert EthMismatch();
        } else {
            if (msg.value != 0) revert EthMismatch();
            require(IERC20(tokIn).transferFrom(msg.sender, address(this), amtIn), "pull");
        }
        _splitToll(tokIn, toll);
        _payStrict(tokOut, msg.sender, amtOut);
        emit Swapped(poolId, msg.sender, baseIn, amtIn, amtOut);
    }

    // ─── Law III at the venue: the hub hook ──────────────────────────
    /// @notice ragequit tolls every BONDED pool's reserves — both legs —
    ///         at the covenant rate, 4.20%, 69/31. The bond stands.
    ///         Best-effort payment: a broken token never bricks a ragequit.
    function onRagequit(uint256 daveId) external {
        if (msg.sender != hub) revert NotHub();
        uint256[] storage ids = _poolsOf[daveId];
        for (uint256 i; i < ids.length; ++i) {
            Pool storage p = pools[ids[i]];
            if (p.closed || !_bonded(p)) continue;
            uint256 tb = uint256(p.rBase) * RAGE_BPS / 10_000;
            uint256 tq = uint256(p.rQuote) * RAGE_BPS / 10_000;
            if (tb == 0 && tq == 0) continue;
            p.rBase -= uint128(tb);
            p.rQuote -= uint128(tq);
            address pool_ = IHubC(hub).pool();
            address trez  = IHubC(hub).treasury();
            if (tb > 0) {
                uint256 toPool = tb * POOL_SHARE / 100;
                _payLenient(p.base, pool_, toPool, p, true);
                _payLenient(p.base, trez, tb - toPool, p, true);
            }
            if (tq > 0) {
                uint256 toPool = tq * POOL_SHARE / 100;
                _payLenient(p.quote, pool_, toPool, p, false);
                _payLenient(p.quote, trez, tq - toPool, p, false);
            }
            emit RagequitToll(ids[i], tb + tq);
        }
    }

    // ─── the observatory ─────────────────────────────────────────────
    /// @dev roll the cumulative; checkpoint at most every OBS_GAP.
    function _observe(uint256 poolId, Pool storage p) internal {
        uint32 nowTs = uint32(block.timestamp);
        uint32 last = _lastTs[poolId];
        if (nowTs > last && p.rBase > 0) {
            _cum[poolId] += uint224(uint256(p.rQuote) * 1e18 / p.rBase * (nowTs - last));
            _lastTs[poolId] = nowTs;
        }
        uint8 head = _obsHead[poolId];
        Obs storage o = _obs[poolId][head];
        if (nowTs >= o.ts + OBS_GAP) {
            uint8 nxt = uint8((head + 1) % OBS_SLOTS);
            _obs[poolId][nxt] = Obs(nowTs, _cum[poolId]);
            _obsHead[poolId] = nxt;
        }
    }

    /// @notice time-weighted price (quote per base, 1e18) over ≥ window.
    ///         Reverts if no observation old enough exists.
    function twap(uint256 poolId, uint32 window) external view returns (uint256) {
        Pool storage p = pools[poolId];
        uint32 nowTs = uint32(block.timestamp);
        uint224 cumNow = _cum[poolId];
        uint32 last = _lastTs[poolId];
        if (nowTs > last && p.rBase > 0)
            cumNow += uint224(uint256(p.rQuote) * 1e18 / p.rBase * (nowTs - last));
        // oldest checkpoint at least `window` old
        for (uint8 i = 1; i <= OBS_SLOTS; ++i) {
            Obs storage o = _obs[poolId][(uint256(_obsHead[poolId]) + i) % OBS_SLOTS];
            if (o.ts != 0 && o.ts + window <= nowTs)
                return (cumNow - o.cum) / (nowTs - o.ts);
        }
        revert NoObs();
    }

    /// @notice instantaneous price, quote per base, 1e18.
    function spot(uint256 poolId) external view returns (uint256) {
        Pool storage p = pools[poolId];
        if (p.rBase == 0) revert DryPool();
        return uint256(p.rQuote) * 1e18 / p.rBase;
    }

    function quoteOut(uint256 poolId, bool baseIn, uint256 amtIn, uint256 discountDave)
        external view returns (uint256)
    {
        Pool storage p = pools[poolId];
        uint256 inNet = amtIn - amtIn * TOLL_BPS / 10_000
                              - amtIn * _feeFor(p, discountDave) / 10_000;
        (uint256 rIn, uint256 rOut) = baseIn
            ? (uint256(p.rBase), uint256(p.rQuote))
            : (uint256(p.rQuote), uint256(p.rBase));
        return rOut * inNet / (rIn + inNet);
    }

    function poolsOf(uint256 daveId) external view returns (uint256[] memory) { return _poolsOf[daveId]; }
    function poolsLength() external view returns (uint256) { return pools.length; }
    function bondedNow(uint256 poolId) external view returns (bool) { return _bonded(pools[poolId]); }

    // ─── plumbing ─────────────────────────────────────────────────────
    function _feeFor(Pool storage p, uint256 discountDave) internal view returns (uint16) {
        if (discountDave == 0) return p.feeBps;
        if (IHubC(hub).ownerOf(discountDave) != msg.sender) revert NotBearer();
        uint64 u = IVaultViewsC(IHubC(hub).vaultOf(discountDave)).unlockAt();
        if (u <= uint64(block.timestamp)) revert NotSealed();
        return uint16(uint256(p.feeBps) * DISCOUNT / 100);
    }

    function _bonded(Pool storage p) internal view returns (bool) {
        return p.bondUntil > uint64(block.timestamp);
    }

    function _splitToll(address token, uint256 toll) internal {
        if (toll == 0) return;
        uint256 toPool = toll * POOL_SHARE / 100;
        _payStrict(token, IHubC(hub).pool(), toPool);
        _payStrict(token, IHubC(hub).treasury(), toll - toPool);
    }

    function _payStrict(address token, address to, uint256 amt) internal {
        if (amt == 0) return;
        if (token == address(0)) {
            (bool ok,) = to.call{value: amt}(""); require(ok, "eth");
        } else {
            require(IERC20(token).transfer(to, amt), "erc20");
        }
    }

    /// @dev ragequit path must never brick: failed legs re-credit reserves.
    function _payLenient(address token, address to, uint256 amt, Pool storage p, bool baseLeg) internal {
        if (amt == 0) return;
        if (token == address(0)) {
            (bool ok,) = to.call{value: amt}("");
            if (!ok) { if (baseLeg) p.rBase = _add128(p.rBase, amt); else p.rQuote = _add128(p.rQuote, amt); }
        } else {
            try IERC20(token).transfer(to, amt) returns (bool ok) {
                if (!ok) { if (baseLeg) p.rBase = _add128(p.rBase, amt); else p.rQuote = _add128(p.rQuote, amt); }
            } catch {
                if (baseLeg) p.rBase = _add128(p.rBase, amt); else p.rQuote = _add128(p.rQuote, amt);
            }
        }
    }

    function _ack(address vault, address token) internal {
        if (token == address(0)) return;
        try IVaultAckC(vault).acknowledge(token) {} catch {}
    }

    function _add128(uint128 a, uint256 b) internal pure returns (uint128) {
        uint256 c = uint256(a) + b;
        if (c > type(uint128).max) revert Overflow();
        return uint128(c);
    }
}
