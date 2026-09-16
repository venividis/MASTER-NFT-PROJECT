// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "../vendor/solady/tokens/ERC721.sol";
import {Base64} from "../vendor/solady/utils/Base64.sol";

interface IArtifactRegistry {
    function artifactIdOfAccount(address account) external view returns (uint256);
    function ownerOf(uint256 id) external view returns (address);
    function ownershipEpoch(uint256 id) external view returns (uint256);
}

/// @notice Transferable game cartridge identities, owner-controlled onchain manifests and content pins.
/// @dev Owning a cartridge proves ownership of this token; it does not hide publicly available game bytes.
contract CartridgeRegistry is ERC721 {
    struct Cartridge {
        string manifestJSON;
        bytes32 contentHash;
        uint64 revision;
        bool frozen;
    }

    struct LaunchManifest {
        string manifestJSON;
        bytes32 contentHash;
        bytes32 manifestHash;
        uint64 revision;
        bool frozen;
        address holder;
        address controller;
        uint256 parentArtifactId;
        uint256 parentOwnershipEpoch;
        bool authorized;
        bool onchainContentAvailable;
    }

    IArtifactRegistry public immutable artifact;
    uint256 public nextId = 1;
    uint256 public constant MAX_CONTENT_BYTES = 24576;
    mapping(uint256 => Cartridge) private _cartridges;
    mapping(uint256 => bytes) private _content;

    error OnlyCartridgeOwner();
    error FrozenManifest();
    error InvalidManifest();
    error InvalidContent();

    event CartridgeCreated(uint256 indexed id, address indexed owner, bytes32 contentHash);
    event ManifestUpdated(uint256 indexed id, uint64 revision, bytes32 contentHash, bytes32 manifestHash);
    event ManifestFrozen(uint256 indexed id, uint64 revision);
    event ContentPublished(uint256 indexed id, bytes32 contentHash, uint256 size);
    event MetadataUpdate(uint256 tokenId);

    constructor(address artifact_) {
        require(artifact_.code.length != 0, "artifact contract required");
        artifact = IArtifactRegistry(artifact_);
    }

    function name() public pure override returns (string memory) { return "AWE Game Cartridge"; }
    function symbol() public pure override returns (string memory) { return "GAME"; }

    function tokenURI(uint256 id) public view override returns (string memory) {
        ownerOf(id);
        return string.concat("data:application/json;base64,", Base64.encode(bytes(_cartridges[id].manifestJSON)));
    }

    function mint(address to, string calldata manifestJSON, bytes32 contentHash) external returns (uint256 id) {
        _validate(manifestJSON, contentHash);
        id = nextId++;
        _cartridges[id] = Cartridge(manifestJSON, contentHash, 1, false);
        _safeMint(to, id);
        emit CartridgeCreated(id, to, contentHash);
        emit ManifestUpdated(id, 1, contentHash, keccak256(bytes(manifestJSON)));
    }

    function updateManifest(uint256 id, string calldata manifestJSON, bytes32 contentHash) external {
        _onlyOwner(id);
        Cartridge storage c = _cartridges[id];
        if (c.frozen) revert FrozenManifest();
        _validate(manifestJSON, contentHash);
        if (c.contentHash != contentHash) delete _content[id];
        c.manifestJSON = manifestJSON;
        c.contentHash = contentHash;
        ++c.revision;
        emit ManifestUpdated(id, c.revision, contentHash, keccak256(bytes(manifestJSON)));
        emit MetadataUpdate(id);
    }

    /// @notice Permanently freeze both manifest and executable hash. Content may still be published
    /// afterward, but only when it matches the frozen SHA-256 content hash.
    function freezeManifest(uint256 id) external {
        _onlyOwner(id);
        _cartridges[id].frozen = true;
        emit ManifestFrozen(id, _cartridges[id].revision);
    }

    /// @notice Optional storage of a small complete HTML/WASM/bundle file directly in contract storage.
    /// @dev Clients verify SHA-256 before execution. Larger builds need chunked storage adapters.
    function publishContent(uint256 id, bytes calldata content) external {
        _onlyOwner(id);
        if (content.length == 0 || content.length > MAX_CONTENT_BYTES || sha256(content) != _cartridges[id].contentHash)
            revert InvalidContent();
        _content[id] = content;
        emit ContentPublished(id, _cartridges[id].contentHash, content.length);
    }

    function contentOf(uint256 id) external view returns (bytes memory) {
        ownerOf(id);
        return _content[id];
    }

    function manifestOf(uint256 id) external view returns (Cartridge memory) {
        ownerOf(id);
        return _cartridges[id];
    }

    /// @notice Current-chain eligibility and content commitment, not a reusable signed/offline proof.
    /// @dev Re-read at launch; multiplayer servers must bind a wallet-signed nonce to this chain state.
    function launchManifest(uint256 id, address player) public view returns (LaunchManifest memory result) {
        Cartridge storage c = _cartridges[id];
        address holder = ownerOf(id);
        uint256 parentId = artifact.artifactIdOfAccount(holder);
        address controller = parentId == 0 ? holder : artifact.ownerOf(parentId);
        result = LaunchManifest({
            manifestJSON: c.manifestJSON,
            contentHash: c.contentHash,
            manifestHash: keccak256(bytes(c.manifestJSON)),
            revision: c.revision,
            frozen: c.frozen,
            holder: holder,
            controller: controller,
            parentArtifactId: parentId,
            parentOwnershipEpoch: parentId == 0 ? 0 : artifact.ownershipEpoch(parentId),
            authorized: player != address(0) && player == controller,
            onchainContentAvailable: _content[id].length != 0
        });
    }

    function canLaunch(uint256 id, address player) external view returns (bool) {
        return launchManifest(id, player).authorized;
    }

    function supportsInterface(bytes4 id) public view override returns (bool) {
        return id == 0x49064906 || super.supportsInterface(id);
    }

    function _onlyOwner(uint256 id) private view {
        if (msg.sender != ownerOf(id)) revert OnlyCartridgeOwner();
    }

    function _validate(string calldata manifestJSON, bytes32 contentHash) private pure {
        if (bytes(manifestJSON).length == 0 || contentHash == bytes32(0)) revert InvalidManifest();
        // JSON schema validation belongs in publishing clients; arbitrary creator fields are preserved.
    }
}
