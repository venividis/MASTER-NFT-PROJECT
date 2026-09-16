// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IResourceShard {
    function chunkCount() external view returns (uint256);
    function byteLength() external view returns (uint256);
    function contentSha256() external view returns (bytes32);
}

/// @notice Immutable directory for a gzip resource split across OnchainApp archives.
/// @dev Each OnchainApp constructor verifies its own bytes. The directory snapshots
///      their hashes and lengths; clients MUST verify the complete compressed and
///      expanded hashes before executing. This contract never assembles the full
///      resource in one call. Shard implementations are supplied by the deployer;
///      a dishonest/unavailable shard can prevent retrieval, never bypass a digest.
contract ShardedResource {
    uint256 public constant schemaVersion = 1;
    string public constant compression = "gzip";
    string public constant mimeType = "application/javascript";

    address[] public shards;
    uint256[] public shardByteLengths;
    uint256[] public shardChunkCounts;
    bytes32[] public shardSha256;

    uint256 public immutable compressedByteLength;
    uint256 public immutable byteLength;
    uint256 public immutable totalChunkCount;
    bytes32 public immutable compressedSha256;
    bytes32 public immutable contentSha256;

    constructor(
        address[] memory shards_,
        bytes32 compressedSha256_,
        bytes32 contentSha256_,
        uint256 byteLength_
    ) {
        require(shards_.length > 0 && shards_.length <= 64, "RESOURCE_SHARDS");
        require(byteLength_ > 0 && byteLength_ <= 64 * 1024 * 1024, "RESOURCE_SIZE");
        require(compressedSha256_ != bytes32(0) && contentSha256_ != bytes32(0), "RESOURCE_HASH");
        uint256 length;
        uint256 count;
        for (uint256 i; i < shards_.length; ++i) {
            address location = shards_[i];
            require(location.code.length > 0, "RESOURCE_SHARD_CODE");
            IResourceShard shard = IResourceShard(location);
            uint256 partCount = shard.chunkCount();
            uint256 partLength = shard.byteLength();
            bytes32 partHash = shard.contentSha256();
            require(partCount > 0 && partCount <= 64, "RESOURCE_CHUNKS");
            require(partLength >= partCount && partLength <= partCount * 23000, "RESOURCE_SHARD_SIZE");
            require(partHash != bytes32(0), "RESOURCE_SHARD_HASH");
            shards.push(location);
            shardByteLengths.push(partLength);
            shardChunkCounts.push(partCount);
            shardSha256.push(partHash);
            length += partLength;
            count += partCount;
        }
        require(length <= 32 * 1024 * 1024, "RESOURCE_COMPRESSED_SIZE");
        compressedByteLength = length;
        byteLength = byteLength_;
        totalChunkCount = count;
        compressedSha256 = compressedSha256_;
        contentSha256 = contentSha256_;
    }

    function shardCount() external view returns (uint256) { return shards.length; }
}
