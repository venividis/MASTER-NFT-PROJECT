// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {IContinuousClearingAuctionFactory} from "src/interfaces/IContinuousClearingAuctionFactory.sol";
import {IContinuousClearingAuction} from "src/interfaces/IContinuousClearingAuction.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
/// @notice Atomically creates and funds an official standalone CCA. Does not hold leftover tokens.
contract OfficialCCALauncher {
    IContinuousClearingAuctionFactory public immutable factory;
    event Launched(address indexed creator, address indexed auction, address indexed token, uint256 amount);
    constructor(IContinuousClearingAuctionFactory factory_) { require(address(factory_).code.length != 0); factory=factory_; }
    function predict(address token,uint128 amount,bytes calldata config,bytes32 salt,address creator) external view returns(address) {
        return address(factory.getAddress(token,amount,config,keccak256(abi.encode(creator,salt)),address(this)));
    }
    function create(address token,uint128 amount,bytes calldata config,bytes32 salt) external returns(address auction) {
        auction=address(factory.create(token,amount,config,keccak256(abi.encode(msg.sender,salt))));
        SafeTransferLib.safeTransferFrom(token,msg.sender,auction,amount);
        IContinuousClearingAuction(auction).onTokensReceived();
        emit Launched(msg.sender,auction,token,amount);
    }
}
