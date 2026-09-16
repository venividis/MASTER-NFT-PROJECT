// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "@v4-core/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@v4-core/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@v4-core/types/BalanceDelta.sol";
import {SafeTransferLib} from "@solady/utils/SafeTransferLib.sol";

/// @notice Exact-input periphery for official Doppler pools. No owner or retained approvals.
/// @dev A quote is an eth_call of swap. The signed minimum and price limit are enforced onchain.
contract OfficialV4SwapRouter {
    using CurrencyLibrary for Currency;
    using BalanceDeltaLibrary for BalanceDelta;
    IPoolManager public immutable manager;
    bool private entered;
    bytes32 private active;
    struct Swap { PoolKey key; bool zeroForOne; uint128 amountIn; uint128 minimumOut; uint160 sqrtPriceLimitX96; address recipient; uint64 deadline; }
    error InvalidSwap();
    error OnlyActiveManager();
    event Swapped(address indexed payer, address indexed recipient, address input, address output, uint256 spent, uint256 received);
    constructor(IPoolManager manager_) { require(address(manager_).code.length != 0); manager = manager_; }
    receive() external payable { require(msg.sender == address(manager)); }
    function swap(Swap calldata s) external payable returns (uint256 spent, uint256 received) {
        if (entered || s.deadline < block.timestamp || s.amountIn == 0 || s.recipient == address(0)) revert InvalidSwap();
        Currency input = s.zeroForOne ? s.key.currency0 : s.key.currency1;
        if (msg.value != (Currency.unwrap(input) == address(0) ? s.amountIn : 0)) revert InvalidSwap();
        entered = true;
        bytes memory payload = abi.encode(msg.sender, s);
        active = keccak256(payload);
        (spent, received) = abi.decode(manager.unlock(payload), (uint256, uint256));
        delete active;
        if (Currency.unwrap(input) == address(0) && spent < s.amountIn) SafeTransferLib.safeTransferETH(msg.sender, s.amountIn - spent);
        entered = false;
    }
    function unlockCallback(bytes calldata payload) external returns (bytes memory) {
        if (msg.sender != address(manager) || !entered || active != keccak256(payload)) revert OnlyActiveManager();
        delete active;
        (address payer, Swap memory s) = abi.decode(payload, (address, Swap));
        BalanceDelta d = manager.swap(s.key, IPoolManager.SwapParams(s.zeroForOne, -int256(uint256(s.amountIn)), s.sqrtPriceLimitX96), bytes(""));
        int128 inputDelta = s.zeroForOne ? d.amount0() : d.amount1();
        int128 outputDelta = s.zeroForOne ? d.amount1() : d.amount0();
        if (inputDelta > 0 || outputDelta < 0) revert InvalidSwap();
        uint256 spent = uint256(-int256(inputDelta)); uint256 received = uint128(outputDelta);
        if (spent > s.amountIn || received < s.minimumOut || received == 0) revert InvalidSwap();
        Currency input = s.zeroForOne ? s.key.currency0 : s.key.currency1;
        Currency output = s.zeroForOne ? s.key.currency1 : s.key.currency0;
        if (Currency.unwrap(input) == address(0)) manager.settle{value: spent}();
        else { manager.sync(input); SafeTransferLib.safeTransferFrom(Currency.unwrap(input), payer, address(manager), spent); manager.settle(); }
        manager.take(output, s.recipient, received);
        emit Swapped(payer, s.recipient, Currency.unwrap(input), Currency.unwrap(output), spent, received);
        return abi.encode(spent, received);
    }
}
