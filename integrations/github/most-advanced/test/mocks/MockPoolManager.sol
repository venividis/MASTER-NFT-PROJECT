// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*  A PoolManager with the parts a hook can actually tell apart.

    It is not v4. It reproduces the mechanics a hook's correctness depends
    on, and those are narrower than the whole protocol:

      · callbacks are dispatched BY SELECTOR against the real signatures,
        so a hook whose parameter types drift is not called at all — which
        is the failure mode that reverts every swap on a live pool;
      · the return value must be the callback's own selector, exactly as
        v4 checks it;
      · a returned fee is IGNORED unless OVERRIDE_FEE (0x400000) is set,
        which is the silent failure a dynamic-fee hook ships with;
      · a hook is only called for the permissions ITS ADDRESS carries, low
        fourteen bits, the way v4 reads them.

    The last one matters most: a test that calls the hook directly proves
    nothing about whether a pool would ever call it.                     */
contract MockPoolManager {
    uint24 internal constant DYNAMIC_FEE  = 0x800000;
    uint24 internal constant OVERRIDE_FEE = 0x400000;
    uint24 internal constant FEE_MASK     = 0x3fffff;
    uint160 internal constant BEFORE_INITIALIZE      = 1 << 13;
    uint160 internal constant BEFORE_ADD_LIQUIDITY   = 1 << 11;
    uint160 internal constant BEFORE_REMOVE_LIQUIDITY = 1 << 9;
    uint160 internal constant BEFORE_SWAP            = 1 << 7;

    struct PoolKey {
        address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks;
    }
    struct ModifyLiquidityParams {
        int24 tickLower; int24 tickUpper; int256 liquidityDelta; bytes32 salt;
    }
    struct SwapParams { bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96; }

    mapping(bytes32 => uint24) public storedFee;
    mapping(bytes32 => bool) public initialised;
    uint24 public lastFeeCharged;

    error BadSelector();
    error NotInitialised();

    function id(PoolKey memory k) public pure returns (bytes32) { return keccak256(abi.encode(k)); }
    function _has(address h, uint160 f) private pure returns (bool) {
        return uint160(h) & f != 0;
    }
    function _bubble(bool ok, bytes memory ret) private pure {
        if (!ok) assembly { revert(add(ret, 0x20), mload(ret)) }
    }

    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external {
        if (_has(key.hooks, BEFORE_INITIALIZE)) {
            (bool ok, bytes memory ret) = key.hooks.call(
                abi.encodeWithSignature(
                    "beforeInitialize(address,(address,address,uint24,int24,address),uint160)",
                    msg.sender, key, sqrtPriceX96));
            _bubble(ok, ret);
            if (bytes4(ret) != bytes4(keccak256(
                "beforeInitialize(address,(address,address,uint24,int24,address),uint160)")))
                revert BadSelector();
        }
        bytes32 pid = id(key);
        initialised[pid] = true;
        storedFee[pid] = key.fee == DYNAMIC_FEE ? 0 : key.fee;
    }

    /// @return charged the fee this swap actually paid, after the hook
    function swap(PoolKey memory key, SwapParams memory params, bytes memory hookData)
        external returns (uint24 charged)
    {
        bytes32 pid = id(key);
        if (!initialised[pid]) revert NotInitialised();
        charged = storedFee[pid];

        if (_has(key.hooks, BEFORE_SWAP)) {
            (bool ok, bytes memory ret) = key.hooks.call(
                abi.encodeWithSignature(
                    "beforeSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),bytes)",
                    msg.sender, key, params, hookData));
            _bubble(ok, ret);
            (bytes4 s, , uint24 back) = abi.decode(ret, (bytes4, int256, uint24));
            if (s != bytes4(keccak256(
                "beforeSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),bytes)")))
                revert BadSelector();
            /*  The whole point of this mock. A hook that forgets the flag
                is ignored here exactly as it would be on chain.        */
            if (back & OVERRIDE_FEE != 0) charged = back & FEE_MASK;
        }
        lastFeeCharged = charged;
    }

    function modifyLiquidity(PoolKey memory key, ModifyLiquidityParams memory p, bytes memory hookData)
        external
    {
        bool adding = p.liquidityDelta > 0;
        uint160 flag = adding ? BEFORE_ADD_LIQUIDITY : BEFORE_REMOVE_LIQUIDITY;
        if (!_has(key.hooks, flag)) return;
        string memory sig = adding
            ? "beforeAddLiquidity(address,(address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes)"
            : "beforeRemoveLiquidity(address,(address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes)";
        (bool ok, bytes memory ret) = key.hooks.call(
            abi.encodeWithSignature(sig, msg.sender, key, p, hookData));
        _bubble(ok, ret);
        if (bytes4(ret) != bytes4(keccak256(bytes(sig)))) revert BadSelector();
    }
}
