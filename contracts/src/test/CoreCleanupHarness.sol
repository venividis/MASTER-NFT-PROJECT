// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test-only collection whose account owner follows the test account's custody.
interface ICleanupAccount { function currentOwner() external view returns(address); }
contract CleanupCollectionMock {
    mapping(uint256 => address) public accountOf;
    function setAccount(uint256 id,address account) external { accountOf[id]=account; }
    function ownerOf(uint256 id) external view returns(address) {
        require(accountOf[id]!=address(0),"UNKNOWN_ID");
        return ICleanupAccount(accountOf[id]).currentOwner();
    }
}

/// @dev Test-only counterfeit freeze claim. The runtime must not qualify for promotion.
contract FrozenVerifierPretender {
    function frozen() external pure returns(bool) { return true; }
    function threshold() external pure returns(uint16) { return 1; }
    function signerCount() external pure returns(uint16) { return 1; }
    function verify(bytes32,bytes calldata) external pure returns(bool) { return true; }
}

/// @dev Test-only selected registry. Anyone can change records to exercise stale ownership.
contract AgentIdentityRegistryMock {
    mapping(uint256=>address) public ownerOf;
    function setOwner(uint256 id,address holder) external {ownerOf[id]=holder;}
}
