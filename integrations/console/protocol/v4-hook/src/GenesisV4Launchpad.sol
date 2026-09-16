// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SqrtPriceMath} from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";

interface IGenesisToken {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

library GenesisPayment {
    function callToken(address token, bytes memory data) internal {
        require(token.code.length != 0, "TOKEN_CODE");
        (bool ok, bytes memory result) = token.call(data);
        require(ok && (result.length == 0 || (result.length == 32 && abi.decode(result, (bool)))), "TOKEN_PAYMENT");
    }
    function transfer(address token, address to, uint256 amount) internal {
        if (amount != 0) callToken(token, abi.encodeCall(IGenesisToken.transfer, (to, amount)));
    }
    function pull(address token, address from, address to, uint256 amount) internal {
        if (amount == 0) return;
        uint256 beforeBalance = IGenesisToken(token).balanceOf(to);
        callToken(token, abi.encodeCall(IGenesisToken.transferFrom, (from, to, amount)));
        require(IGenesisToken(token).balanceOf(to) - beforeBalance == amount, "EXACT_TOKEN_REQUIRED");
    }
}

/// @notice Ordinary ERC20 without mint authority, transfer taxes, blocklists or owner privileges.
contract GenesisFixedToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    constructor(string memory n, string memory s, uint256 amount) {
        require(bytes(n).length > 0 && bytes(n).length <= 128 && bytes(s).length > 0 && bytes(s).length <= 32 && amount > 0, "TOKEN_TERMS");
        name = n; symbol = s; totalSupply = amount; balanceOf[msg.sender] = amount;
        emit Transfer(address(0), msg.sender, amount);
    }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; emit Approval(msg.sender, spender, amount); return true; }
    function transfer(address to, uint256 amount) external returns (bool) { _transfer(msg.sender, to, amount); return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) { allowance[from][msg.sender] = allowed - amount; emit Approval(from, msg.sender, allowed - amount); }
        _transfer(from, to, amount); return true;
    }
    function _transfer(address from, address to, uint256 amount) private {
        require(to != address(0), "RECIPIENT"); balanceOf[from] -= amount; balanceOf[to] += amount; emit Transfer(from, to, amount);
    }
}

/// @notice One immutable v4 position represented by fungible, redeemable ERC20 shares.
/// @dev Shares own proportional principal and uncollected fees; both follow share transfers.
/// Additional shares require actual added liquidity at the existing share/liquidity ratio.
/// There is no admin or sweep. The final redemption receives remaining dividend rounding.
/// Standard ERC20 pairs only; use wrapped native currency. Shares can be shielded by external protocols.
contract GenesisV4Position is IUnlockCallback {
    using BalanceDeltaLibrary for BalanceDelta;
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;
    string public constant name = "Anima v4 Liquidity";
    string public constant symbol = "ANIMA-LP";
    uint8 public constant decimals = 18;
    IPoolManager public immutable manager;
    address public immutable factory;
    PoolKey public poolKey;
    int24 public immutable tickLower;
    int24 public immutable tickUpper;
    uint128 public liquidity;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 private constant Q128 = 1 << 128;
    uint256 public feeGrowth0;
    uint256 public feeGrowth1;
    uint256 public reserved0;
    uint256 public reserved1;
    mapping(address => uint256) private lastGrowth0;
    mapping(address => uint256) private lastGrowth1;
    mapping(address => uint256) private credit0;
    mapping(address => uint256) private credit1;
    mapping(address => uint256) private fraction0;
    mapping(address => uint256) private fraction1;
    event FeesCollected(address indexed holder, uint256 amount0, uint256 amount1);
    event LiquidityAdded(address indexed holder, uint128 liquidityAdded, uint256 shares, bool reinvested);
    bool private initialized;
    bool private active;
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event Redeemed(uint256 shares, uint256 amount0, uint256 amount1);
    constructor(IPoolManager m, PoolKey memory k, int24 lower, int24 upper) {
        require(address(m).code.length != 0 && Currency.unwrap(k.currency0) != address(0), "CONFIGURATION");
        require(lower >= -887272 && upper <= 887272 && lower < upper && k.tickSpacing > 0 && lower % k.tickSpacing == 0 && upper % k.tickSpacing == 0, "TICKS");
        manager = m; factory = msg.sender; poolKey = k; tickLower = lower; tickUpper = upper;
    }
    modifier locked() { require(!active, "BUSY"); active = true; _; active = false; }
    function seed(uint128 amount, address recipient) external locked {
        require(msg.sender == factory && !initialized && amount > 0 && amount <= uint128(type(int128).max) && recipient != address(0), "SEED");
        initialized = true; liquidity = amount; totalSupply = amount; balanceOf[recipient] = amount;
        manager.unlock(abi.encode(int256(uint256(amount))));
        // Seed budgets were transferred to this position. Every unused unit returns to the payer.
        _pay(recipient, IGenesisToken(Currency.unwrap(poolKey.currency0)).balanceOf(address(this)), IGenesisToken(Currency.unwrap(poolKey.currency1)).balanceOf(address(this)));
        emit Transfer(address(0), recipient, amount);
    }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; emit Approval(msg.sender, spender, amount); return true; }
    function transfer(address to, uint256 amount) external returns (bool) { _transfer(msg.sender, to, amount); return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) { allowance[from][msg.sender] = allowed - amount; emit Approval(from, msg.sender, allowed - amount); }
        _transfer(from, to, amount); return true;
    }
    function _transfer(address from, address to, uint256 amount) private {
        require(!active && to != address(0), "TRANSFER"); active = true;
        _harvest(); _checkpoint(from); _checkpoint(to);
        uint256 held = balanceOf[from]; require(amount <= held, "BALANCE");
        if (amount != 0 && from != to) {
            uint256 f0 = FullMath.mulDiv(credit0[from], amount, held); uint256 f1 = FullMath.mulDiv(credit1[from], amount, held);
            credit0[from] -= f0; credit1[from] -= f1; credit0[to] += f0; credit1[to] += f1;
            uint256 r0 = FullMath.mulDiv(fraction0[from], amount, held); uint256 r1 = FullMath.mulDiv(fraction1[from], amount, held);
            fraction0[from] -= r0; fraction1[from] -= r1;
            r0 += fraction0[to]; r1 += fraction1[to]; credit0[to] += r0/Q128; credit1[to] += r1/Q128;
            fraction0[to] = r0%Q128; fraction1[to] = r1%Q128;
        }
        balanceOf[from] -= amount; balanceOf[to] += amount; active = false; emit Transfer(from, to, amount);
    }
    /// @notice Holder-specific estimate including this share amount’s uncollected fees.
    function previewRedeem(uint256 shares) external view returns (uint256 amount0, uint256 amount1) {
        return _preview(msg.sender, shares);
    }
    function previewRedeemFor(address holder, uint256 shares) external view returns (uint256 amount0, uint256 amount1) {
        return _preview(holder, shares);
    }
    function _preview(address holder, uint256 shares) private view returns (uint256 amount0, uint256 amount1) {
        require(shares > 0 && shares <= totalSupply && !active, "SHARES");
        uint128 removed = shares == totalSupply ? liquidity : uint128(FullMath.mulDiv(liquidity, shares, totalSupply));
        require(removed > 0, "DUST_SHARES");
        (uint160 price,,,) = manager.getSlot0(poolKey.toId());
        uint160 lower = TickMath.getSqrtPriceAtTick(tickLower); uint160 upper = TickMath.getSqrtPriceAtTick(tickUpper);
        if (price < upper) amount0 = SqrtPriceMath.getAmount0Delta(price > lower ? price : lower, upper, removed, false);
        if (price > lower) amount1 = SqrtPriceMath.getAmount1Delta(lower, price < upper ? price : upper, removed, false);
        uint256 held = balanceOf[holder];
        if (shares == totalSupply && held == shares) {
            PoolId id = poolKey.toId();
            (,uint256 l0,uint256 l1)=manager.getPositionInfo(id,address(this),tickLower,tickUpper,bytes32(0));
            (uint256 g0,uint256 g1)=manager.getFeeGrowthInside(id,tickLower,tickUpper);
            unchecked { g0-=l0;g1-=l1; }
            amount0+=IGenesisToken(Currency.unwrap(poolKey.currency0)).balanceOf(address(this))+FullMath.mulDiv(g0,liquidity,Q128);
            amount1+=IGenesisToken(Currency.unwrap(poolKey.currency1)).balanceOf(address(this))+FullMath.mulDiv(g1,liquidity,Q128);
        } else {
            (uint256 f0, uint256 f1) = pendingFees(holder);
            if (held != 0 && shares <= held) { amount0 += FullMath.mulDiv(f0,shares,held); amount1 += FullMath.mulDiv(f1,shares,held); }
        }
    }
    function pendingFees(address holder) public view returns (uint256 amount0, uint256 amount1) {
        uint256 g0 = feeGrowth0; uint256 g1 = feeGrowth1;
        if (liquidity != 0 && totalSupply != 0) {
            PoolId id = poolKey.toId();
            (, uint256 l0, uint256 l1) = manager.getPositionInfo(id, address(this), tickLower, tickUpper, bytes32(0));
            (uint256 n0, uint256 n1) = manager.getFeeGrowthInside(id, tickLower, tickUpper);
            unchecked { n0 -= l0; n1 -= l1; }
            uint256 f0 = FullMath.mulDiv(n0, liquidity, Q128) + IGenesisToken(Currency.unwrap(poolKey.currency0)).balanceOf(address(this)) - reserved0;
            uint256 f1 = FullMath.mulDiv(n1, liquidity, Q128) + IGenesisToken(Currency.unwrap(poolKey.currency1)).balanceOf(address(this)) - reserved1;
            g0 += FullMath.mulDiv(f0, Q128, totalSupply); g1 += FullMath.mulDiv(f1, Q128, totalSupply);
        }
        uint256 b = balanceOf[holder];
        amount0 = credit0[holder] + FullMath.mulDiv(b, g0 - lastGrowth0[holder], Q128) + (mulmod(b, g0-lastGrowth0[holder], Q128)+fraction0[holder])/Q128;
        amount1 = credit1[holder] + FullMath.mulDiv(b, g1 - lastGrowth1[holder], Q128) + (mulmod(b, g1-lastGrowth1[holder], Q128)+fraction1[holder])/Q128;
    }
    function _harvest() private {
        if (liquidity == 0 || totalSupply == 0) return;
        manager.unlock(abi.encode(int256(0)));
        uint256 b0 = IGenesisToken(Currency.unwrap(poolKey.currency0)).balanceOf(address(this));
        uint256 b1 = IGenesisToken(Currency.unwrap(poolKey.currency1)).balanceOf(address(this));
        feeGrowth0 += FullMath.mulDiv(b0 - reserved0, Q128, totalSupply);
        feeGrowth1 += FullMath.mulDiv(b1 - reserved1, Q128, totalSupply);
        reserved0 = b0; reserved1 = b1;
    }
    function _checkpoint(address holder) private {
        uint256 b = balanceOf[holder]; uint256 d0 = feeGrowth0-lastGrowth0[holder]; uint256 d1 = feeGrowth1-lastGrowth1[holder];
        uint256 r0 = mulmod(b, d0, Q128)+fraction0[holder]; uint256 r1 = mulmod(b, d1, Q128)+fraction1[holder];
        credit0[holder] += FullMath.mulDiv(b, d0, Q128)+r0/Q128; credit1[holder] += FullMath.mulDiv(b, d1, Q128)+r1/Q128;
        fraction0[holder]=r0%Q128; fraction1[holder]=r1%Q128;
        lastGrowth0[holder]=feeGrowth0; lastGrowth1[holder]=feeGrowth1;
    }
    function _takeCredit(address holder) private returns (uint256 amount0, uint256 amount1) {
        amount0=credit0[holder]; amount1=credit1[holder]; credit0[holder]=0; credit1[holder]=0;
        reserved0-=amount0; reserved1-=amount1;
    }
    function collectFees(uint256 minimum0, uint256 minimum1, uint256 deadline) external locked returns (uint256 amount0, uint256 amount1) {
        require(block.timestamp <= deadline, "EXPIRED"); _harvest(); _checkpoint(msg.sender);
        (amount0,amount1)=_takeCredit(msg.sender);
        require(amount0 >= minimum0 && amount1 >= minimum1 && (amount0 != 0 || amount1 != 0), "FEES");
        _pay(msg.sender,amount0,amount1); emit FeesCollected(msg.sender,amount0,amount1);
    }
    function redeem(uint256 shares, uint256 minimum0, uint256 minimum1, uint256 deadline) external locked returns (uint256 amount0, uint256 amount1) {
        require(block.timestamp <= deadline && shares > 0 && shares <= balanceOf[msg.sender], "REDEMPTION");
        uint128 removed = shares == totalSupply ? liquidity : uint128(FullMath.mulDiv(liquidity, shares, totalSupply));
        require(removed > 0, "DUST_SHARES"); _harvest(); _checkpoint(msg.sender);
        uint256 before0=IGenesisToken(Currency.unwrap(poolKey.currency0)).balanceOf(address(this));
        uint256 before1=IGenesisToken(Currency.unwrap(poolKey.currency1)).balanceOf(address(this));
        bool finalRedemption=shares==totalSupply;
        // Fee claims follow shares. A holder who transfers/redeems every share retains
        // no whole-unit claim, so the final holder may receive accumulated rounding.
        uint256 f0=finalRedemption?reserved0:FullMath.mulDiv(credit0[msg.sender],shares,balanceOf[msg.sender]);
        uint256 f1=finalRedemption?reserved1:FullMath.mulDiv(credit1[msg.sender],shares,balanceOf[msg.sender]);
        if(finalRedemption){credit0[msg.sender]=0;credit1[msg.sender]=0;}
        else{credit0[msg.sender]-=f0;credit1[msg.sender]-=f1;}
        reserved0-=f0;reserved1-=f1;
        balanceOf[msg.sender]-=shares; totalSupply-=shares; liquidity-=removed;
        manager.unlock(abi.encode(-int256(uint256(removed))));
        amount0=IGenesisToken(Currency.unwrap(poolKey.currency0)).balanceOf(address(this))-before0+f0;
        amount1=IGenesisToken(Currency.unwrap(poolKey.currency1)).balanceOf(address(this))-before1+f1;
        require(amount0 >= minimum0 && amount1 >= minimum1, "MINIMUM_OUTPUT"); _pay(msg.sender,amount0,amount1);
        emit Transfer(msg.sender,address(0),shares); emit Redeemed(shares,amount0,amount1);
    }
    /// @notice Largest current-price liquidity increment supported solely by holder fees.
    function previewReinvest(address holder) external view returns (uint128 amount) {
        (uint256 a0,uint256 a1)=pendingFees(holder); (uint160 p,,,)=manager.getSlot0(poolKey.toId());
        uint160 lower=TickMath.getSqrtPriceAtTick(tickLower); uint160 upper=TickMath.getSqrtPriceAtTick(tickUpper);
        uint256 n;
        if(p<=lower) n=FullMath.mulDiv(a0,FullMath.mulDiv(lower,upper,1<<96),uint256(upper)-lower);
        else if(p>=upper) n=FullMath.mulDiv(a1,1<<96,uint256(upper)-lower);
        else {
            uint256 n0=FullMath.mulDiv(a0,FullMath.mulDiv(p,upper,1<<96),uint256(upper)-p);
            uint256 n1=FullMath.mulDiv(a1,1<<96,uint256(p)-lower); n=n0<n1?n0:n1;
        }
        uint256 cap=uint128(type(int128).max)-liquidity; amount=uint128(n>cap?cap:n);
    }
    function addLiquidity(uint128 amount, uint256 budget0, uint256 budget1, uint256 minimumShares, uint256 deadline) external locked returns (uint256 shares) {
        require(block.timestamp <= deadline, "EXPIRED"); _harvest(); _checkpoint(msg.sender);
        GenesisPayment.pull(Currency.unwrap(poolKey.currency0),msg.sender,address(this),budget0);
        GenesisPayment.pull(Currency.unwrap(poolKey.currency1),msg.sender,address(this),budget1);
        shares=_add(amount,budget0,budget1,minimumShares,false);
    }
    /// @notice Convert only caller-owned accrued fees into principal; no other holder funds are used.
    function reinvestFees(uint128 amount, uint256 maximum0, uint256 maximum1, uint256 minimumShares, uint256 deadline) external locked returns (uint256 shares) {
        require(block.timestamp <= deadline, "EXPIRED"); _harvest(); _checkpoint(msg.sender);
        uint256 b0=credit0[msg.sender] < maximum0 ? credit0[msg.sender] : maximum0;
        uint256 b1=credit1[msg.sender] < maximum1 ? credit1[msg.sender] : maximum1;
        credit0[msg.sender]-=b0; credit1[msg.sender]-=b1; reserved0-=b0; reserved1-=b1;
        shares=_add(amount,b0,b1,minimumShares,true);
    }
    function _add(uint128 amount,uint256 budget0,uint256 budget1,uint256 minimumShares,bool reinvested) private returns(uint256 shares) {
        require(initialized && liquidity != 0 && amount > 0 && uint256(liquidity)+amount <= uint128(type(int128).max), "LIQUIDITY");
        shares=FullMath.mulDiv(amount,totalSupply,liquidity); require(shares > 0 && shares >= minimumShares,"SHARES");
        uint256 before0=IGenesisToken(Currency.unwrap(poolKey.currency0)).balanceOf(address(this));
        uint256 before1=IGenesisToken(Currency.unwrap(poolKey.currency1)).balanceOf(address(this));
        manager.unlock(abi.encode(int256(uint256(amount))));
        uint256 spent0=before0-IGenesisToken(Currency.unwrap(poolKey.currency0)).balanceOf(address(this));
        uint256 spent1=before1-IGenesisToken(Currency.unwrap(poolKey.currency1)).balanceOf(address(this));
        require(spent0 <= budget0 && spent1 <= budget1,"BUDGET");
        liquidity+=amount; totalSupply+=shares; balanceOf[msg.sender]+=shares;
        _pay(msg.sender,budget0-spent0,budget1-spent1);
        emit Transfer(address(0),msg.sender,shares); emit LiquidityAdded(msg.sender,amount,shares,reinvested);
    }
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager) && active, "CALLBACK");
        (BalanceDelta delta,) = manager.modifyLiquidity(poolKey, ModifyLiquidityParams(tickLower, tickUpper, abi.decode(data, (int256)), bytes32(0)), bytes(""));
        _settle(poolKey.currency0, delta.amount0()); _settle(poolKey.currency1, delta.amount1()); return bytes("");
    }
    function _settle(Currency currency, int128 delta) private {
        if (delta > 0) manager.take(currency, address(this), uint128(delta));
        else if (delta < 0) {
            uint256 amount = uint256(-int256(delta)); manager.sync(currency);
            GenesisPayment.transfer(Currency.unwrap(currency), address(manager), amount);
            require(manager.settle() == amount, "EXACT_SETTLEMENT");
        }
    }
    function _pay(address to, uint256 amount0, uint256 amount1) private {
        GenesisPayment.transfer(Currency.unwrap(poolKey.currency0), to, amount0);
        GenesisPayment.transfer(Currency.unwrap(poolKey.currency1), to, amount1);
    }
}

/// @notice Atomic fixed-supply token, initialized v4 pool and funded redeemable position.
/// @dev No NFT identity or creator ledger. This alone does NOT hide transaction data.
/// A shielded RelayAdapt caller can receive and reshield tokens, shares and refunds atomically.
contract GenesisV4Launchpad {
    struct Terms {
        string name; string symbol; uint256 supply; address quoteToken;
        uint256 tokenBudget; uint256 quoteBudget; uint24 fee; int24 tickSpacing;
        int24 tickLower; int24 tickUpper; uint160 sqrtPriceX96; uint128 liquidity;
        uint256 deadline; bytes32 salt;
    }
    IPoolManager public immutable manager;
    bool private active;
    event Launched(address indexed token, address indexed position, bytes32 indexed poolId);
    constructor(IPoolManager m) { require(address(m).code.length != 0, "MANAGER"); manager = m; }
    function _salt(Terms calldata t, address payer) private pure returns (bytes32) { return keccak256(abi.encode(payer, t.salt)); }
    function predict(Terms calldata t, address payer) public view returns (address token, address position) {
        bytes32 salt = _salt(t, payer);
        token = _address(salt, keccak256(abi.encodePacked(type(GenesisFixedToken).creationCode, abi.encode(t.name, t.symbol, t.supply))));
        PoolKey memory k = _key(t, token);
        position = _address(salt, keccak256(abi.encodePacked(type(GenesisV4Position).creationCode, abi.encode(manager, k, t.tickLower, t.tickUpper))));
    }
    function launch(Terms calldata t) external returns (address token, address position) {
        require(!active, "BUSY"); active = true;
        require(block.timestamp <= t.deadline && t.quoteToken.code.length != 0 && t.tokenBudget > 0 && t.tokenBudget <= t.supply && t.quoteBudget > 0 && t.fee <= 100000 && t.tickSpacing > 0, "TERMS");
        bytes32 salt = _salt(t, msg.sender);
        token = address(new GenesisFixedToken{salt: salt}(t.name, t.symbol, t.supply));
        PoolKey memory k = _key(t, token);
        position = address(new GenesisV4Position{salt: salt}(manager, k, t.tickLower, t.tickUpper));
        GenesisPayment.transfer(token, position, t.tokenBudget);
        GenesisPayment.pull(t.quoteToken, msg.sender, position, t.quoteBudget);
        manager.initialize(k, t.sqrtPriceX96);
        GenesisV4Position(position).seed(t.liquidity, msg.sender);
        GenesisPayment.transfer(token, msg.sender, t.supply - t.tokenBudget);
        emit Launched(token, position, keccak256(abi.encode(k))); active = false;
    }
    function _key(Terms calldata t, address token) private pure returns (PoolKey memory) {
        require(token != t.quoteToken && t.quoteToken != address(0), "PAIR");
        (address a, address b) = token < t.quoteToken ? (token, t.quoteToken) : (t.quoteToken, token);
        // Immutable ordinary LP fees: no public creator authority or administrator fee address.
        return PoolKey(Currency.wrap(a), Currency.wrap(b), t.fee, t.tickSpacing, IHooks(address(0)));
    }
    function _address(bytes32 salt, bytes32 initHash) private view returns (address) { return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initHash))))); }
}
