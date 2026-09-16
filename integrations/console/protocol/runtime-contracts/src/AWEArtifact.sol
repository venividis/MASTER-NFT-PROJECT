// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "../vendor/solady/tokens/ERC721.sol";
import {SignatureCheckerLib} from "../vendor/solady/utils/SignatureCheckerLib.sol";
import {ReentrancyGuard} from "../vendor/solady/utils/ReentrancyGuard.sol";

interface IArtifactAuthority {
    function ownerOf(uint256 id) external view returns (address);
    function ownershipEpoch(uint256 id) external view returns (uint256);
}

/// @notice NFT-owned account for an AWE artifact. This is not an ERC-6551 implementation.
/// @dev CALL only. No delegatecall, modules, session keys, relayer, or platform administrator.
contract ArtifactAccount is ReentrancyGuard {
    IArtifactAuthority public immutable artifact;
    uint256 public immutable artifactId;
    uint256 public executionNonce;

    error OnlyArtifactOwner();
    error InvalidTarget();
    error CannotReceiveRootArtifact();

    event Executed(address indexed target, uint256 value, bytes4 selector, uint256 nonce);

    constructor(address artifact_, uint256 id_) {
        artifact = IArtifactAuthority(artifact_);
        artifactId = id_;
    }

    receive() external payable {}

    function owner() public view returns (address) {
        return artifact.ownerOf(artifactId);
    }

    function ownershipEpoch() public view returns (uint256) {
        return artifact.ownershipEpoch(artifactId);
    }

    /// @notice Execute an owner-selected transaction using assets in this account.
    /// @dev External token allowances created here can survive an NFT transfer. Revoke them
    /// before transferring/selling the artifact; ownership epochs do not revoke third-party approvals.
    function execute(address target, uint256 value, bytes calldata data)
        external payable nonReentrant returns (bytes memory result)
    {
        if (msg.sender != owner()) revert OnlyArtifactOwner();
        if (target == address(0) || target == address(this)) revert InvalidTarget();
        uint256 nonce = ++executionNonce;
        (bool ok, bytes memory returned) = target.call{value: value}(data);
        if (!ok) {
            assembly ("memory-safe") { revert(add(returned, 32), mload(returned)) }
        }
        emit Executed(target, value, data.length >= 4 ? bytes4(data[:4]) : bytes4(0), nonce);
        return returned;
    }

    /// @notice Domain-bound digest to sign for isValidSignature; epochs change on every root transfer.
    /// @dev The owner signs this digest directly (not personal_sign). Ownership proofs should include
    /// their own challenge nonce and expiry in `hash`; this view cannot consume replay nonces.
    function signatureDigest(bytes32 hash) public view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("AWE_ARTIFACT_SIGNATURE_V1"), block.chainid, address(this), ownershipEpoch(), hash
        ));
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        return SignatureCheckerLib.isValidSignatureNowCalldata(owner(), signatureDigest(hash), signature)
            ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender == address(artifact)) revert CannotReceiveRootArtifact();
        return 0x150b7a02;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external pure returns (bytes4) { return 0xf23a6e61; }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external pure returns (bytes4) { return 0xbc197c81; }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x4e2312e0;
    }
}

/// @notice Permissionless root NFT with one automatically created asset account per token.
contract AWEArtifact is ERC721 {
    uint256 public nextId = 1;
    mapping(uint256 => address) public accountFor;
    mapping(address => uint256) public artifactIdOfAccount;
    mapping(uint256 => uint256) public ownershipEpoch;
    mapping(uint256 => string) private _uris;

    error OnlyArtifactOwner();
    error RootAccountCycle();

    event ArtifactCreated(uint256 indexed id, address indexed owner, address indexed account);
    event OwnershipEpochChanged(uint256 indexed id, uint256 epoch);
    event MetadataUpdate(uint256 tokenId);

    function name() public pure override returns (string memory) { return "AWE Artifact"; }
    function symbol() public pure override returns (string memory) { return "AWE"; }

    function tokenURI(uint256 id) public view override returns (string memory) {
        ownerOf(id);
        return _uris[id];
    }

    function mint(address to, string calldata metadataURI) external returns (uint256 id, address account) {
        id = nextId++;
        account = address(new ArtifactAccount(address(this), id));
        accountFor[id] = account;
        artifactIdOfAccount[account] = id;
        _uris[id] = metadataURI;
        _safeMint(to, id);
        emit ArtifactCreated(id, to, account);
    }

    function setTokenURI(uint256 id, string calldata metadataURI) external {
        if (msg.sender != ownerOf(id)) revert OnlyArtifactOwner();
        _uris[id] = metadataURI;
        emit MetadataUpdate(id);
    }

    function bumpOwnershipEpoch(uint256 id) external {
        if (msg.sender != ownerOf(id)) revert OnlyArtifactOwner();
        emit OwnershipEpochChanged(id, ++ownershipEpoch[id]);
    }

    function supportsInterface(bytes4 id) public view override returns (bool) {
        return id == 0x49064906 || super.supportsInterface(id);
    }

    function _beforeTokenTransfer(address, address to, uint256 id) internal override {
        // This root collection cannot be nested in its own registered accounts. External cartridge
        // and item NFTs can be nested. This prevents direct and multi-root ownership cycles here.
        if (artifactIdOfAccount[to] != 0) revert RootAccountCycle();
        emit OwnershipEpochChanged(id, ++ownershipEpoch[id]);
    }
}
