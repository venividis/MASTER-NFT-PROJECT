// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Exact-input adapter. Output must be returned to msg.sender (the router).
/// @dev address(0) means native currency. The adapter is responsible for enforcing
/// its route, deadline and minAmountOut; the router independently checks balances.
interface ISettlementConverter {
    function convert(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline,
        bytes calldata route
    ) external payable;
}
