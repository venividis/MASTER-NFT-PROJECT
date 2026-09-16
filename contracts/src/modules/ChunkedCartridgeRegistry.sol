// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "../confluence/vendor/solady/tokens/ERC721.sol";
import {Base64} from "../confluence/vendor/solady/utils/Base64.sol";
import {ArtifactBinding} from "../confluence/ArtifactBinding.sol";
import {CartridgeRegistry} from "../confluence/cartridges/CartridgeRegistry.sol";
import {OnchainApp} from "../protocol/OnchainApp.sol";

/// @notice Immutable, chunk-backed cartridge editions readable by the original ANIMA launcher.
/// @dev This is an additional ERC721 collection, not an upgrade of the master NFT or of
/// the legacy CartridgeRegistry. Publication grants no account permission. The original
/// workshop pins its own registry bytecode; acquire() instead uses an ordinary reviewed
/// call from an existing NFT account. Owning a cartridge does not conceal public bytes.
contract ChunkedCartridgeRegistry is ERC721 {
    struct Release {
        address publisher;
        address archive;
        bytes32 archiveCodeHash;
        bytes32 contentHash;
        bytes32 manifestHash;
        uint32 byteLength;
        string manifestJSON;
        address[] chunks;
        bytes32[] chunkCodeHashes;
        uint32[] chunkByteLengths;
    }

    /// @dev Deploy the existing canonical adapter rather than accepting an injected
    /// ownership resolver. The native collection remains the ownership authority.
    ArtifactBinding public immutable artifact;
    uint256 public constant MAX_CONTENT_BYTES = 1_048_576;
    uint256 public constant MAX_CHUNK_BYTES = 23_000;
    uint256 public constant MAX_CHUNKS = 64;
    uint256 public constant MAX_MANIFEST_BYTES = 16_384;
    string public constant contentEncoding = "rawHTML";
    string public constant mimeType = "text/html;charset=utf-8";

    uint256 public nextReleaseId = 1;
    uint256 public nextId = 1;
    mapping(uint256 => Release) private _releases;
    mapping(uint256 => uint256) public releaseOfCartridge;

    error InvalidCollection();
    error InvalidManifest();
    error InvalidContent();
    error InvalidChunk();
    error UnknownRelease();
    error ArchiveChanged();
    error ChunkChanged();

    event ReleasePublished(uint256 indexed releaseId, address indexed publisher, address indexed archive,
        bytes32 contentHash, bytes32 manifestHash, uint256 byteLength);
    event CartridgeAcquired(uint256 indexed id, uint256 indexed releaseId, address indexed holder);
    // Original cartridge event shapes remain available to existing receipt consumers.
    event CartridgeCreated(uint256 indexed id, address indexed owner, bytes32 contentHash);
    event ManifestUpdated(uint256 indexed id, uint64 revision, bytes32 contentHash, bytes32 manifestHash);
    event ManifestFrozen(uint256 indexed id, uint64 revision);
    event ContentPublished(uint256 indexed id, bytes32 contentHash, uint256 size);

    constructor(address collection_) {
        if (collection_.code.length == 0) revert InvalidCollection();
        artifact = new ArtifactBinding(collection_);
    }

    function name() public pure override returns (string memory) { return "ANIMA Chunked Cartridge"; }
    function symbol() public pure override returns (string memory) { return "ANIMACART"; }

    /// @notice Publish one permanent raw-HTML edition using existing AppChunk data contracts.
    /// @dev A canonical OnchainApp verifies the complete SHA-256 before publication succeeds.
    /// Every address, code hash, byte length and manifest is then frozen. New versions require
    /// another release. No mutable reader or publisher-supplied archive implementation is used.
    /// JSON schema, UTF-8 and HTML validity remain publishing-client checks; no decompression
    /// or wallet permission is implied by this content declaration.
    function publishRelease(string calldata manifestJSON, address[] calldata chunks, bytes32 expectedSha256)
        external returns (uint256 releaseId)
    {
        uint256 manifestBytes = bytes(manifestJSON).length;
        if (manifestBytes == 0 || manifestBytes > MAX_MANIFEST_BYTES || expectedSha256 == bytes32(0))
            revert InvalidManifest();
        if (chunks.length == 0 || chunks.length > MAX_CHUNKS) revert InvalidChunk();
        uint256 length;
        for (uint256 i; i < chunks.length; ++i) {
            address chunk = chunks[i];
            uint256 size = chunk.code.length;
            if (size <= 1 || size > MAX_CHUNK_BYTES + 1) revert InvalidChunk();
            bytes1 first;
            assembly ("memory-safe") {
                let scratch := mload(0x40)
                extcodecopy(chunk, scratch, 0, 1)
                first := mload(scratch)
            }
            if (first != bytes1(0)) revert InvalidChunk();
            length += size - 1;
        }
        if (length == 0 || length > MAX_CONTENT_BYTES) revert InvalidContent();

        OnchainApp archive = new OnchainApp(chunks, expectedSha256);
        releaseId = nextReleaseId++;
        Release storage edition = _releases[releaseId];
        edition.publisher = msg.sender;
        edition.archive = address(archive);
        edition.archiveCodeHash = address(archive).codehash;
        edition.contentHash = expectedSha256;
        edition.manifestHash = keccak256(bytes(manifestJSON));
        edition.byteLength = uint32(length);
        edition.manifestJSON = manifestJSON;
        for (uint256 i; i < chunks.length; ++i) {
            edition.chunks.push(chunks[i]);
            edition.chunkCodeHashes.push(chunks[i].codehash);
            edition.chunkByteLengths.push(uint32(chunks[i].code.length - 1));
        }
        emit ReleasePublished(releaseId, msg.sender, address(archive), expectedSha256, edition.manifestHash, length);
    }

    /// @notice Acquire an independent cartridge into the caller's custody.
    /// @dev An existing NFT account calls this through its ordinary execute() review.
    /// There is no recipient argument with which a stranger can force a cartridge into
    /// someone else's account. Transfers afterwards use the normal ERC721 authority.
    function acquire(uint256 releaseId) external returns (uint256 id) {
        Release storage edition = _release(releaseId);
        _assertIntact(edition);
        id = nextId++;
        releaseOfCartridge[id] = releaseId;
        _safeMint(msg.sender, id);
        emit CartridgeAcquired(id, releaseId, msg.sender);
        emit CartridgeCreated(id, msg.sender, edition.contentHash);
        emit ManifestUpdated(id, 1, edition.contentHash, edition.manifestHash);
        emit ManifestFrozen(id, 1);
        emit ContentPublished(id, edition.contentHash, edition.byteLength);
    }

    function releaseOf(uint256 releaseId) external view returns (Release memory) {
        return _release(releaseId);
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        ownerOf(id);
        return string.concat("data:application/json;base64,", Base64.encode(bytes(_releases[releaseOfCartridge[id]].manifestJSON)));
    }

    /// @notice Exact original manifestOf ABI; every acquired edition is frozen at revision one.
    function manifestOf(uint256 id) external view returns (CartridgeRegistry.Cartridge memory) {
        ownerOf(id);
        Release storage edition = _releases[releaseOfCartridge[id]];
        return CartridgeRegistry.Cartridge(edition.manifestJSON, edition.contentHash, 1, true);
    }

    /// @notice Recover the full bounded raw bytes without calling an untrusted content reader.
    /// @dev Code identity and lengths are checked before extcodecopy; full SHA-256 is checked
    /// again before returning. Old clients additionally verify this digest before execution.
    function contentOf(uint256 id) external view returns (bytes memory) {
        ownerOf(id);
        Release storage edition = _releases[releaseOfCartridge[id]];
        _assertIntact(edition);
        bytes memory data = new bytes(edition.byteLength);
        uint256 cursor;
        for (uint256 i; i < edition.chunks.length; ++i) {
            address chunk = edition.chunks[i];
            uint256 size = edition.chunkByteLengths[i];
            assembly ("memory-safe") { extcodecopy(chunk, add(add(data, 32), cursor), 1, size) }
            cursor += size;
        }
        if (cursor != edition.byteLength || sha256(data) != edition.contentHash) revert InvalidContent();
        return data;
    }

    /// @notice Exact legacy tuple and current-chain ownership/epoch semantics.
    /// @dev A parent NFT transfer changes controller and epoch immediately; cartridge
    /// ownership, release identity and original master NFT identity remain independent.
    function launchManifest(uint256 id, address player) public view returns (CartridgeRegistry.LaunchManifest memory result) {
        address holder = ownerOf(id);
        Release storage edition = _releases[releaseOfCartridge[id]];
        uint256 parentId = artifact.artifactIdOfAccount(holder);
        address controller = parentId == 0 ? holder : artifact.ownerOf(parentId);
        result = CartridgeRegistry.LaunchManifest({
            manifestJSON: edition.manifestJSON,
            contentHash: edition.contentHash,
            manifestHash: edition.manifestHash,
            revision: 1,
            frozen: true,
            holder: holder,
            controller: controller,
            parentArtifactId: parentId,
            parentOwnershipEpoch: parentId == 0 ? 0 : artifact.ownershipEpoch(parentId),
            authorized: player != address(0) && player == controller,
            onchainContentAvailable: _intact(edition)
        });
    }

    function canLaunch(uint256 id, address player) external view returns (bool) {
        return launchManifest(id, player).authorized;
    }

    function _release(uint256 releaseId) private view returns (Release storage edition) {
        edition = _releases[releaseId];
        if (edition.archive == address(0)) revert UnknownRelease();
    }

    function _intact(Release storage edition) private view returns (bool) {
        if (edition.archive.codehash != edition.archiveCodeHash) return false;
        for (uint256 i; i < edition.chunks.length; ++i) {
            address chunk = edition.chunks[i];
            if (chunk.codehash != edition.chunkCodeHashes[i] || chunk.code.length != uint256(edition.chunkByteLengths[i]) + 1) return false;
        }
        return true;
    }

    function _assertIntact(Release storage edition) private view {
        if (edition.archive.codehash != edition.archiveCodeHash) revert ArchiveChanged();
        for (uint256 i; i < edition.chunks.length; ++i) {
            address chunk = edition.chunks[i];
            if (chunk.codehash != edition.chunkCodeHashes[i] || chunk.code.length != uint256(edition.chunkByteLengths[i]) + 1) revert ChunkChanged();
        }
    }
}
