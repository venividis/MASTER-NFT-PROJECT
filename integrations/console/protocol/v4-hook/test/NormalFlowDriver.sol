// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

interface IPaymentToken {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @dev TEST ONLY: minimal unlock/settlement driver for genuine PoolManager execution.
contract NormalFlowDriver is IUnlockCallback {
    using CurrencyLibrary for Currency;
    using BalanceDeltaLibrary for BalanceDelta;
    IPoolManager public immutable manager;
    bool private _active;
    int128 public lastDelta0;
    int128 public lastDelta1;

    constructor(IPoolManager manager_) { manager = manager_; }
    receive() external payable {}

    function addLiquidity(PoolKey calldata key, ModifyLiquidityParams calldata params) external payable {
        require(!_active, "active");
        _active = true;
        manager.unlock(abi.encode(uint8(0), key, params, SwapParams(false, 0, 0), bytes(""), msg.sender, uint256(0)));
        _finish(msg.sender);
    }

    function swap(PoolKey calldata key, SwapParams calldata params, bytes calldata hookData, uint256 minimumOut) external payable {
        require(!_active, "active");
        _active = true;
        manager.unlock(abi.encode(uint8(1), key, ModifyLiquidityParams(0, 0, 0, bytes32(0)), params, hookData, msg.sender, minimumOut));
        _finish(msg.sender);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager) && _active, "manager");
        (uint8 action, PoolKey memory key, ModifyLiquidityParams memory liquidity,
            SwapParams memory swapParams, bytes memory hookData, address payer, uint256 minimumOut) =
            abi.decode(data, (uint8, PoolKey, ModifyLiquidityParams, SwapParams, bytes, address, uint256));
        BalanceDelta delta;
        if (action == 0) (delta,) = manager.modifyLiquidity(key, liquidity, bytes(""));
        else {
            delta = manager.swap(key, swapParams, hookData);
            int128 output = swapParams.zeroForOne ? delta.amount1() : delta.amount0();
            require(output >= 0 && uint128(output) >= minimumOut, "minimum output");
        }
        lastDelta0 = delta.amount0();
        lastDelta1 = delta.amount1();
        _settle(key.currency0, delta.amount0(), payer);
        _settle(key.currency1, delta.amount1(), payer);
        return bytes("");
    }

    function _settle(Currency currency, int128 delta, address payer) private {
        if (delta > 0) manager.take(currency, payer, uint128(delta));
        if (delta < 0) {
            uint256 amount = uint256(-int256(delta));
            manager.sync(currency);
            if (currency.isAddressZero()) manager.settle{value: amount}();
            else {
                require(IPaymentToken(Currency.unwrap(currency)).transferFrom(payer, address(manager), amount), "payment");
                manager.settle();
            }
        }
    }

    function _finish(address payer) private {
        uint256 refund = address(this).balance;
        if (refund != 0) {
            (bool ok,) = payer.call{value: refund}("");
            require(ok, "refund");
        }
        _active = false;
    }
}
