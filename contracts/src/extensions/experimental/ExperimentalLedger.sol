// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ExperimentModule} from '../../operating/ExperimentalAdapters.sol';
import {ProtocolAssets} from '../../protocol/ProtocolPrimitives.sol';

/// @notice Only actual receipts create liabilities. Settlement never calls a beneficiary.
abstract contract ExperimentalLedger is ExperimentModule {
    mapping(address => mapping(address => uint256)) public claimable;
    mapping(address => uint256) public totalClaims;
    mapping(address => uint256) public escrowed;
    event Credit(address indexed account,address indexed asset,uint256 amount);
    event Withdrawal(address indexed account,address indexed asset,uint256 amount);
    constructor(address gate_) ExperimentModule(gate_) {}
    function _pull(address asset,address from,uint256 amount) internal {
        ProtocolAssets.pull(asset,from,amount);escrowed[asset]+=amount;
    }
    function _credit(address account,address asset,uint256 amount) internal {
        if(amount==0)return;
        escrowed[asset]-=amount;claimable[account][asset]+=amount;totalClaims[asset]+=amount;
        _touch(account,'CREDIT',abi.encode(asset,amount));emit Credit(account,asset,amount);
    }
    /// @notice Anyone can relay a withdrawal; its recipient is fixed to the credited account.
    function withdrawFor(address account,address asset) external nonReentrant {
        uint256 amount=claimable[account][asset];if(amount==0)revert InvalidAmount();
        claimable[account][asset]=0;totalClaims[asset]-=amount;
        _touch(account,'WITHDRAW',abi.encode(asset,amount));ProtocolAssets.push(asset,account,amount);
        emit Withdrawal(account,asset,amount);
    }
    function reserve(address asset) external view returns(uint256 held,uint256 liabilities,uint256 surplus) {
        held=ProtocolAssets.balance(asset,address(this));liabilities=escrowed[asset]+totalClaims[asset];
        // A deficient or rebasing asset is reported, never disguised as surplus.
        surplus=held>liabilities?held-liabilities:0;
    }
}
