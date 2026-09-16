// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IConfluenceIdentity {
    function artifactIdOfAccount(address account) external view returns (uint256);
    function accountOf(uint256 tokenId) external view returns (address);
    function ownerOf(uint256 tokenId) external view returns (address);
}
interface IConfluenceEpoch { function sessionEpoch() external view returns (uint64); }
/// @notice Adapts the master NFT's canonical account and transfer epoch to the cartridge registry.
/// @dev Immutable identity binding; no custody, administrative privilege, or execution permission.
contract ArtifactBinding {
    IConfluenceIdentity public immutable collection;
    constructor(address collection_) {require(collection_.code.length>0,"collection required");collection=IConfluenceIdentity(collection_);}
    function artifactIdOfAccount(address account) external view returns(uint256){return collection.artifactIdOfAccount(account);}
    function ownerOf(uint256 id) external view returns(address){return collection.ownerOf(id);}
    function ownershipEpoch(uint256 id) external view returns(uint256){return IConfluenceEpoch(collection.accountOf(id)).sessionEpoch();}
}
