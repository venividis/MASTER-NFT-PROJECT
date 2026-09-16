// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOnchainAppLeaf {
    function chunkCount() external view returns (uint256);
    function byteLength() external view returns (uint256);
    function contentSha256() external view returns (bytes32);
    function readChunk(uint256 index) external view returns (bytes memory);
}

/// @notice Immutable bounded directory retaining the original OnchainApp chunk-reader ABI.
/// @dev Deploy each leaf as an OnchainApp: its constructor verifies the leaf's full bytes.
///      SHA-256 leaf digests cannot establish the concatenated digest. This directory
///      pins that expected digest; readers MUST verify the complete recovered bytes
///      before execution. Supplied leaf implementations can deny retrieval, but cannot
///      make substituted content pass the pinned full digest. No mutable URL or owner.
contract OnchainAppDirectory {
    uint256 public constant schemaVersion = 2;
    string public constant mimeType = "text/html;charset=utf-8";
    uint256 public constant MAX_LEAVES = 16;
    uint256 public constant MAX_LEAF_CHUNKS = 32;

    address[] public leaves;
    bytes32[] public leafSha256;
    bytes32[] public leafCodeHashes;
    uint256[] public leafByteLengths;
    uint256[] public leafChunkCounts;
    uint256 public immutable chunkCount;
    uint256 public immutable byteLength;
    bytes32 public immutable contentSha256;

    constructor(address[] memory leaves_, bytes32 expectedSha) {
        require(leaves_.length > 0 && leaves_.length <= MAX_LEAVES, "LEAF_COUNT");
        require(expectedSha != bytes32(0), "ARCHIVE_HASH");
        uint256 count;
        uint256 length;
        for (uint256 i; i < leaves_.length; ++i) {
            address location = leaves_[i];
            require(location.code.length > 0, "LEAF_CODE");
            IOnchainAppLeaf leaf = IOnchainAppLeaf(location);
            uint256 n = leaf.chunkCount();
            uint256 size = leaf.byteLength();
            bytes32 digest = leaf.contentSha256();
            require(n > 0 && n <= MAX_LEAF_CHUNKS, "LEAF_CHUNKS");
            require(size >= n && size <= n * 23000, "LEAF_SIZE");
            require(digest != bytes32(0), "LEAF_HASH");
            leaves.push(location);
            leafSha256.push(digest);
            leafCodeHashes.push(location.codehash);
            leafByteLengths.push(size);
            leafChunkCounts.push(n);
            count += n;
            length += size;
        }
        chunkCount = count;
        byteLength = length;
        contentSha256 = expectedSha;
    }

    function leafCount() external view returns (uint256) { return leaves.length; }

    /// @notice Reads one <=23,000-byte part at the original flat archive index.
    function readChunk(uint256 index) external view returns (bytes memory data) {
        require(index < chunkCount, "CHUNK_INDEX");
        for (uint256 i; i < leaves.length; ++i) {
            uint256 count = leafChunkCounts[i];
            if (index >= count) { index -= count; continue; }
            address location = leaves[i];
            IOnchainAppLeaf leaf = IOnchainAppLeaf(location);
            require(location.codehash == leafCodeHashes[i], "LEAF_CODE_CHANGED");
            require(leaf.chunkCount() == count && leaf.byteLength() == leafByteLengths[i]
                && leaf.contentSha256() == leafSha256[i], "LEAF_METADATA_CHANGED");
            data = leaf.readChunk(index);
            require(data.length > 0 && data.length <= 23000, "CHUNK_SIZE");
            return data;
        }
        revert("CHUNK_INDEX");
    }
}
