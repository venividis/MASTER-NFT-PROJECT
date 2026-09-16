// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {PrivacyKeys, IPrivacyCollection, IPrivacyAccount} from "./PrivacyKeys.sol";

/// @notice Recipient-confirmed encrypted delivery with atomic ERC721 transfer.
/// @dev This is NOT a zero-knowledge/TEE verifier or an ERC-7857 implementation.
contract PrivateMemoryHandover {
    IPrivacyCollection public immutable collection;
    PrivacyKeys public immutable keys;
    struct MemoryRecord { bytes32 commitment; uint64 version; uint64 custodyEpoch; address owner; bytes ciphertext; }
    struct Offer {
        uint256 tokenId; address from; address to; uint64 custodyEpoch; uint64 memoryVersion;
        uint64 keyGeneration; uint64 deadline; bytes32 commitment; bytes32 receiptHash; bool consumed; bytes envelope;
    }
    mapping(uint256 => MemoryRecord) private _memories;
    mapping(uint256 => Offer) private _offers;
    uint256 public offerCount;
    bool private entered;
    event MemoryPublished(uint256 indexed tokenId, uint64 version, bytes32 commitment);
    event Offered(uint256 indexed offerId, uint256 indexed tokenId, address indexed recipient, bytes32 envelopeHash);
    event Accepted(uint256 indexed offerId, uint256 indexed tokenId, address indexed recipient);
    event Cancelled(uint256 indexed offerId);
    error InvalidState();
    constructor(address collection_, address keys_) {
        if(collection_.code.length == 0 || keys_.code.length == 0) revert InvalidState();
        collection = IPrivacyCollection(collection_); keys = PrivacyKeys(keys_);
    }
    function _epoch(uint256 id) private view returns (uint64) {
        IPrivacyAccount account = IPrivacyAccount(collection.accountOf(id));
        if(account.mode() != 0) revert InvalidState();
        return account.sessionEpoch();
    }
    function publish(uint256 id, bytes32 commitment, bytes calldata ciphertext) external {
        if(entered || collection.ownerOf(id) != msg.sender || commitment == 0 || ciphertext.length < 32 || ciphertext.length > 32768) revert InvalidState();
        MemoryRecord storage m = _memories[id];
        m.commitment = commitment; ++m.version; m.custodyEpoch = _epoch(id); m.owner = msg.sender; m.ciphertext = ciphertext;
        emit MemoryPublished(id, m.version, commitment);
    }
    function propose(uint256 id,address recipient,uint64 deadline,bytes32 receiptHash,bytes calldata envelope) external returns (uint256 offerId) {
        MemoryRecord storage m = _memories[id]; uint64 epoch = _epoch(id);
        if(entered || collection.ownerOf(id) != msg.sender || m.owner != msg.sender || m.custodyEpoch != epoch || m.commitment == 0 ||
           recipient == address(0) || recipient == msg.sender || keys.generation(recipient) == 0 || deadline <= block.timestamp ||
           deadline > block.timestamp + 7 days || receiptHash == 0 || envelope.length < 32 || envelope.length > 32768) revert InvalidState();
        offerId = ++offerCount;
        _offers[offerId] = Offer(id,msg.sender,recipient,epoch,m.version,keys.generation(recipient),deadline,m.commitment,receiptHash,false,envelope);
        emit Offered(offerId,id,recipient,keccak256(envelope));
    }
    /// @dev Receipt is random, delivered inside AEAD ciphertext. It is never a plaintext-memory hash/preimage.
    function accept(uint256 offerId,bytes32 receiptSecret) external {
        if(entered) revert InvalidState(); entered = true;
        Offer storage o = _offers[offerId]; MemoryRecord storage m = _memories[o.tokenId];
        if(o.consumed || msg.sender != o.to || block.timestamp > o.deadline || collection.ownerOf(o.tokenId) != o.from ||
           _epoch(o.tokenId) != o.custodyEpoch || m.version != o.memoryVersion || m.commitment != o.commitment ||
           keys.generation(o.to) != o.keyGeneration || keccak256(abi.encode("ANIMA_MEMORY_RECEIPT_V1",block.chainid,address(this),o.tokenId,o.from,o.to,o.custodyEpoch,o.memoryVersion,receiptSecret)) != o.receiptHash) revert InvalidState();
        o.consumed = true;
        // The seller must approve this contract. Ownership only moves when the recipient accepts.
        collection.transferFrom(o.from,o.to,o.tokenId);
        if(collection.ownerOf(o.tokenId) != o.to) revert InvalidState();
        // Old published blob remains historical. Buyer must publish freshly encrypted future memory.
        emit Accepted(offerId,o.tokenId,o.to); entered = false;
    }
    function cancel(uint256 offerId) external {
        Offer storage o = _offers[offerId];
        if(entered || o.consumed || (msg.sender != o.from && msg.sender != o.to)) revert InvalidState();
        o.consumed = true; emit Cancelled(offerId);
    }
    function memoryOf(uint256 id) external view returns (MemoryRecord memory) { return _memories[id]; }
    function offerOf(uint256 id) external view returns (Offer memory) { return _offers[id]; }
}
