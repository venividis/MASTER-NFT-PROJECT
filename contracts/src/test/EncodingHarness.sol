// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Base64} from '../lib/Base64.sol';
contract EncodingHarness {function encode(bytes calldata value) external pure returns(string memory){return Base64.encode(value);}}
