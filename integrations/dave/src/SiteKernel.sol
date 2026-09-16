// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {SSTORE2} from "solady/utils/SSTORE2.sol";

/// @title SiteKernel — one runtime for one hundred thousand websites.
/// @notice The premises JS engine, chunked into contract bytecode, served
///         as a string to every bootloader. Ships behind the 7-day lock.
contract SiteKernel {
    address public immutable timelock;
    address[] private _chunks;
    uint32 public version;

    error NotTimelock();
    event KernelShipped(uint32 version, uint256 bytes_);

    constructor(address timelock_) { timelock = timelock_; }

    /// @dev selector 0x9a3b6c14 is what every bootloader eth_calls.
    function runtime() external view returns (string memory js) {
        bytes memory out;
        for (uint256 i; i < _chunks.length; ++i)
            out = bytes.concat(out, SSTORE2.read(_chunks[i]));
        return string(out);
    }

    function ship(bytes[] calldata parts) external {
        if (msg.sender != timelock) revert NotTimelock();
        delete _chunks;
        uint256 n;
        for (uint256 i; i < parts.length; ++i) {
            _chunks.push(SSTORE2.write(parts[i]));
            n += parts[i].length;
        }
        emit KernelShipped(++version, n);
    }
}
