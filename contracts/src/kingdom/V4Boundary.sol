// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev ABI-only boundary to Uniswap v4. Not an implementation of PoolManager.
/// Reviewed against Uniswap/v4-core d153b048868a60c2403a3ef5b2301bb247884d46.
/// The address field below has the same ABI encoding as IHooks; currencies encode as address.
/// This self-contained boundary avoids silently tracking a moving dependency branch.
struct PoolKey {address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks;}
struct SwapParams {bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96;}
struct ModifyLiquidityParams {int24 tickLower; int24 tickUpper; int256 liquidityDelta; bytes32 salt;}
interface IV4PoolManager {
    function initialize(PoolKey calldata key,uint160 sqrtPriceX96) external returns(int24 tick);
    function unlock(bytes calldata data) external returns(bytes memory);
    function modifyLiquidity(PoolKey calldata key,ModifyLiquidityParams calldata params,bytes calldata hookData) external returns(int256 callerDelta,int256 feesAccrued);
    function swap(PoolKey calldata key,SwapParams calldata params,bytes calldata hookData) external returns(int256 swapDelta);
    function sync(address currency) external;
    function settle() external payable returns(uint256 paid);
    function take(address currency,address to,uint256 amount) external;
}
library V4Boundary {
    uint24 internal constant DYNAMIC_FEE=0x800000;
    uint24 internal constant OVERRIDE_FEE=0x400000;
    uint160 internal constant ADDRESS_MASK=(1<<14)-1;
    uint160 internal constant HOOK_FLAGS=(1<<13)|(1<<9)|(1<<7)|(1<<6);
    function id(PoolKey memory key) internal pure returns(bytes32){return keccak256(abi.encode(key));}
    function amount0(int256 delta) internal pure returns(int128){return int128(delta>>128);}
    function amount1(int256 delta) internal pure returns(int128){return int128(uint128(uint256(delta)));}
}
