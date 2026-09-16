// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {CommissionEscrow} from "../../operating/CommissionEscrow.sol";
import {CartridgeRegistry} from "./CartridgeRegistry.sol";
interface ICommissionCollection {
    function artifactIdOfAccount(address account) external view returns (uint256);
    function accountOf(uint256 id) external view returns (address);
}
/// @notice Turns an accepted, paid commission into a frozen executable NFT held by its funding NFT.
/// @dev Content is public. Acceptance is the escrow reviewer's judgment, not a safety proof.
/// This publisher never grants spending permission, takes payment, or changes the funding account.
contract CommissionedCartridges {
    ICommissionCollection public immutable collection;
    CommissionEscrow public immutable escrow;
    CartridgeRegistry public immutable cartridges;
    mapping(uint256 => uint256) public cartridgeOfWork;
    mapping(address => bytes32) public accountCommitment;
    bool private active;
    error InvalidCommission();
    event InstrumentAcquired(uint256 indexed workId, uint256 indexed cartridgeId, address indexed account, address worker, bytes32 deliverable);
    constructor(address collection_, address escrow_, address cartridges_) {
        if (collection_.code.length == 0 || escrow_.code.length == 0 || cartridges_.code.length == 0) revert InvalidCommission();
        collection = ICommissionCollection(collection_); escrow = CommissionEscrow(escrow_); cartridges = CartridgeRegistry(cartridges_);
    }
    function deliverableHash(bytes32 terms, string memory manifest, bytes memory content) public pure returns (bytes32) {
        return keccak256(abi.encode("anima.commissioned-cartridge/1", terms, sha256(content), keccak256(bytes(manifest))));
    }
    function acquire(uint256 workId, string calldata manifest, bytes calldata content) external returns (uint256 id) {
        uint256 identity = collection.artifactIdOfAccount(msg.sender);
        CommissionEscrow.Work memory work = escrow.work(workId);
        if (active || identity == 0 || collection.accountOf(identity) != msg.sender || work.fundingAccount != msg.sender || work.status != CommissionEscrow.Status.Paid || cartridgeOfWork[workId] != 0 || bytes(manifest).length == 0 || bytes(manifest).length > 4096 || content.length == 0 || content.length > cartridges.MAX_CONTENT_BYTES() || deliverableHash(work.terms, manifest, content) != work.deliverable) revert InvalidCommission();
        active = true;
        id = cartridges.mint(address(this), manifest, sha256(content));
        cartridgeOfWork[workId] = id;
        cartridges.publishContent(id, content);
        cartridges.freezeManifest(id);
        cartridges.safeTransferFrom(address(this), msg.sender, id);
        accountCommitment[msg.sender] = keccak256(abi.encode(accountCommitment[msg.sender], workId, id, work.deliverable));
        emit InstrumentAcquired(workId, id, msg.sender, work.worker, work.deliverable);
        active = false;
    }
    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(cartridges) || !active) revert InvalidCommission();
        return this.onERC721Received.selector;
    }
}
