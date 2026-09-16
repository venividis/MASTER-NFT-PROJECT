// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SovereignAccount} from "./SovereignAccount.sol";

/// @notice CREATE2 factory: account address is a pure function of collection + token id + router.
contract SovereignAccountFactory {
    address public immutable collection;
    address public immutable proofRouter;

    event AccountCreated(uint256 indexed tokenId, address indexed account, bytes32 salt);

    error OnlyCollection();
    error InvalidAddress();
    error DeploymentFailed();

    constructor(address collection_, address proofRouter_) {
        if (collection_ == address(0) || proofRouter_ == address(0)) revert InvalidAddress();
        collection = collection_;
        proofRouter = proofRouter_;
    }

    function saltFor(uint256 tokenId) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked("IDONTFUCKINGBELIEVEIT_ACCOUNT_V1", block.chainid, collection, tokenId)
        );
    }

    function createAccount(uint256 tokenId) external returns (address account) {
        if (msg.sender != collection) revert OnlyCollection();
        account = predictAccount(tokenId);
        if (account.code.length != 0) return account;

        bytes32 salt = saltFor(tokenId);
        account = address(new SovereignAccount{salt: salt}(collection, tokenId, proofRouter));
        if (account.code.length == 0) revert DeploymentFailed();
        emit AccountCreated(tokenId, account, salt);
    }

    function predictAccount(uint256 tokenId) public view returns (address account) {
        bytes32 salt = saltFor(tokenId);
        bytes32 initCodeHash = keccak256(
            abi.encodePacked(
                type(SovereignAccount).creationCode,
                abi.encode(collection, tokenId, proofRouter)
            )
        );
        account = address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash))))
        );
    }
}
