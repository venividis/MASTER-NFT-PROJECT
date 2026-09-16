// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20T {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @dev A drain whose function name is on nobody's list of transfer words,
///      and never will be, because it was invented for this test. Only
///      measurement catches it — which is the entire argument for measuring
///      balances rather than enumerating selectors.
interface IERC20G {
    function transfer(address to, uint256 amount) external returns (bool);
}

contract Drainer {
    function take(address token, uint256 amount) external {
        IERC20T(token).transferFrom(msg.sender, address(this), amount);
    }

    /// @dev The other direction, so a batch can be tested that is genuinely
    ///      poorer in the middle and whole at the end — the ordinary shape of
    ///      real work, and the reason the measurement wraps the batch rather
    ///      than each call inside it.
    function give(address token, address to, uint256 amount) external {
        IERC20G(token).transfer(to, amount);
    }
}
