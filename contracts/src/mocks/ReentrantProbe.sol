// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAccountExecute {
    function execute(address target, uint256 value, bytes calldata data) external payable returns (bytes memory);
}

contract ReentrantProbe {
    address public account;
    bool public attempted;

    function arm(address account_) external {
        account = account_;
    }

    function attack() external {
        attempted = true;
        IAccountExecute(account).execute(address(this), 0, abi.encodeCall(this.noop, ()));
    }

    function noop() external {}
}
