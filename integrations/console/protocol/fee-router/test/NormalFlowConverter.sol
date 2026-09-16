// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISettlementConverter} from "../src/interfaces/ISettlementConverter.sol";
import {IERC20FeeAsset} from "../src/OwnerFeeRouter.sol";

/// @dev TEST ONLY: pre-funded deterministic exchange. Not a DEX adapter or price oracle.
contract NormalFlowConverter is ISettlementConverter {
    receive() external payable {}

    function convert(address tokenIn, address tokenOut, uint256 amountIn,
        uint256 minAmountOut, uint256 deadline, bytes calldata route) external payable
    {
        require(block.timestamp <= deadline, "expired");
        (uint256 numerator, uint256 denominator) = abi.decode(route, (uint256, uint256));
        uint256 amountOut = amountIn * numerator / denominator;
        require(amountOut >= minAmountOut, "minimum");
        if (tokenIn == address(0)) require(msg.value == amountIn, "value");
        else require(IERC20FeeAsset(tokenIn).transferFrom(msg.sender, address(this), amountIn), "input");
        if (tokenOut == address(0)) {
            (bool ok,) = msg.sender.call{value: amountOut}("");
            require(ok, "native output");
        } else require(IERC20FeeAsset(tokenOut).transfer(msg.sender, amountOut), "output");
    }
}
