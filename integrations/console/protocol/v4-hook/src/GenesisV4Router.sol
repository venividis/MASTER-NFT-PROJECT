// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {GenesisPayment} from "./GenesisV4Launchpad.sol";

/// @notice ERC20 exact-input v4 swaps, with bounded output, deadline and full-fill enforcement.
/// @dev Output always goes back to the caller. No owner, NFT identity, ledger, persistent approval or public recipient argument.
contract GenesisV4Router is IUnlockCallback {
    using BalanceDeltaLibrary for BalanceDelta;
    IPoolManager public immutable manager;
    bool private active;
    constructor(IPoolManager m) { require(address(m).code.length != 0, "MANAGER"); manager = m; }
    function swap(PoolKey calldata key, bool zeroForOne, uint128 amountIn, uint128 minimumOut, uint160 priceLimit, uint256 deadline, bytes calldata hookData) external returns (uint256 amountOut) {
        require(!active && block.timestamp <= deadline && amountIn > 0 && amountIn <= uint128(type(int128).max), "TERMS");
        require(Currency.unwrap(key.currency0) != address(0) && minimumOut > 0, "ERC20_AND_MINIMUM_REQUIRED");
        active = true;
        amountOut = abi.decode(manager.unlock(abi.encode(key, zeroForOne, amountIn, minimumOut, priceLimit, hookData, msg.sender)), (uint256));
        active = false;
    }
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager) && active, "CALLBACK");
        (PoolKey memory key, bool direction, uint128 input, uint128 minimum, uint160 limit, bytes memory hookData, address payer) = abi.decode(data, (PoolKey, bool, uint128, uint128, uint160, bytes, address));
        BalanceDelta delta = manager.swap(key, SwapParams(direction, -int256(uint256(input)), limit), hookData);
        int128 spent = direction ? delta.amount0() : delta.amount1();
        int128 received = direction ? delta.amount1() : delta.amount0();
        require(spent == -int256(uint256(input)) && received >= int256(uint256(minimum)), "FILL_OR_SLIPPAGE");
        Currency pay = direction ? key.currency0 : key.currency1;
        Currency take = direction ? key.currency1 : key.currency0;
        manager.sync(pay); GenesisPayment.pull(Currency.unwrap(pay), payer, address(manager), input);
        require(manager.settle() == input, "EXACT_SETTLEMENT");
        manager.take(take, payer, uint128(received)); return abi.encode(uint256(uint128(received)));
    }
}
