// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IOperatingAccount {
    function currentOwner() external view returns(address);
    function sessionEpoch() external view returns(uint64);
    function mode() external view returns(uint8);
    function instrumentRevision() external view returns(uint256);
}
interface IAccountCommitment {function accountCommitment(address account) external view returns(bytes32);}
interface IExperimentGate {function enabled(address module) external view returns(bool);}
interface IERC4626Operating {
    function asset() external view returns(address);
    function deposit(uint256 assets,address receiver) external returns(uint256 shares);
    function redeem(uint256 shares,address receiver,address owner) external returns(uint256 assets);
}
