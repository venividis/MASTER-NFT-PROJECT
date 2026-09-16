// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract LzStub {
  function eid() external pure returns (uint32) { return 30184; }
  function setDelegate(address) external {}
  function mayActAs(uint256, address) external pure returns (bool) { return true; }
  function MAX_BODY() external pure returns (uint256) { return 1024; }
}
