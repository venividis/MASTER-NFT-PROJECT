// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ChunkedCartridgeRegistry} from "../../../../contracts/src/modules/ChunkedCartridgeRegistry.sol";
import {CartridgeRegistry} from "../../../../contracts/src/confluence/cartridges/CartridgeRegistry.sol";
import {AppChunk, OnchainApp} from "../../../../contracts/src/protocol/OnchainApp.sol";
import {CartridgeTestCollection} from "../cartridges-fixtures.sol";

interface CartridgeVm {
    function prank(address sender) external;
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
    function etch(address target, bytes calldata code) external;
}

contract CartridgeEpochFixture {
    uint64 public sessionEpoch = 1;
    function advanceEpoch() external { ++sessionEpoch; }
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return 0x150b7a02;
    }
}

/// @dev Native EVM adversarial unit tests. The JS integration separately proves acquisition
/// with the actual IDontFuckingBelieveIt and SovereignAccount contracts, not these test doubles.
contract CartridgesTest {
    CartridgeVm private constant vm = CartridgeVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    CartridgeTestCollection private collection;
    ChunkedCartridgeRegistry private registry;

    function setUp() public {
        collection = new CartridgeTestCollection();
        registry = new ChunkedCartridgeRegistry(address(collection));
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return 0x150b7a02;
    }

    function _publish(bytes memory first, bytes memory second) private returns (uint256 releaseId, address[] memory chunks) {
        chunks = new address[](2);
        chunks[0] = address(new AppChunk(first));
        chunks[1] = address(new AppChunk(second));
        releaseId = registry.publishRelease('{"spec":"awe.cartridge/1","name":"Native guard fixture"}', chunks, sha256(bytes.concat(first, second)));
    }

    function testLegacyTupleTracksCanonicalParentOwnerAndEpoch() public {
        (uint256 releaseId,) = _publish(bytes("<!doctype html>"), bytes("<title>native unit fixture</title>"));
        CartridgeEpochFixture account = new CartridgeEpochFixture();
        address alice = address(0xa11ce);
        address bob = address(0xb0b);
        collection.bind(7, address(account), alice);
        vm.prank(address(account));
        uint256 id = registry.acquire(releaseId);
        CartridgeRegistry.LaunchManifest memory original = registry.launchManifest(id, alice);
        require(original.holder == address(account) && original.controller == alice && original.authorized, "original custody");
        require(original.parentArtifactId == 7 && original.parentOwnershipEpoch == 1, "canonical parent/epoch");
        require(original.frozen && original.revision == 1 && original.onchainContentAvailable, "permanent edition");
        require(address(registry.artifact().collection()) == address(collection), "canonical ArtifactBinding");
        collection.bind(7, address(account), bob);
        account.advanceEpoch();
        require(!registry.canLaunch(id, alice), "stale owner rejected");
        CartridgeRegistry.LaunchManifest memory current = registry.launchManifest(id, bob);
        require(current.authorized && current.parentOwnershipEpoch == 2, "new owner and epoch");
        require(!registry.canLaunch(id, address(0)), "zero player rejected");
        vm.prank(alice);
        vm.expectRevert();
        registry.transferFrom(address(account), alice, id);
        vm.prank(address(account));
        registry.transferFrom(address(account), bob, id);
        current = registry.launchManifest(id, bob);
        require(current.parentArtifactId == 0 && current.parentOwnershipEpoch == 0 && current.controller == bob, "standalone ERC721 custody");
    }

    function testFrozenEarlierEditionSurvivesNewReleaseAndCannotUseLegacyMutationSelectors() public {
        (uint256 firstRelease,) = _publish(bytes("<!doctype html>"), bytes("<title>one</title>"));
        uint256 first = registry.acquire(firstRelease);
        bytes memory original = registry.contentOf(first);
        (uint256 secondRelease,) = _publish(bytes("<!doctype html>"), bytes("<title>two</title>"));
        uint256 second = registry.acquire(secondRelease);
        require(first != second && firstRelease != secondRelease, "new edition identity");
        require(sha256(registry.contentOf(first)) == sha256(original), "previous exact bytes retained");
        require(sha256(registry.contentOf(second)) != sha256(original), "new bytes get new token");
        require(registry.releaseOfCartridge(first) == firstRelease, "original release pinned");
        bytes32 replacementHash = sha256(bytes("replacement"));
        vm.expectRevert();
        CartridgeRegistry(address(registry)).updateManifest(first, "{}", replacementHash);
        vm.expectRevert();
        CartridgeRegistry(address(registry)).publishContent(first, bytes("replacement"));
        vm.expectRevert();
        registry.acquire(999);
    }

    function testChangedChunkCodeWithSameLengthAndChangedLengthBothFailClosed() public {
        (uint256 releaseId, address[] memory chunks) = _publish(bytes("<!doctype html>"), bytes("<title>guarded</title>"));
        uint256 id = registry.acquire(releaseId);
        bytes memory original = chunks[0].code;
        bytes memory substituted = bytes.concat(original);
        substituted[1] = bytes1(uint8(substituted[1]) ^ 1);
        vm.etch(chunks[0], substituted);
        require(!registry.launchManifest(id, address(this)).onchainContentAvailable, "same-size mutation unavailable");
        vm.expectRevert(ChunkedCartridgeRegistry.ChunkChanged.selector);
        registry.contentOf(id);
        vm.expectRevert(ChunkedCartridgeRegistry.ChunkChanged.selector);
        registry.acquire(releaseId);
        vm.etch(chunks[0], bytes.concat(original, hex"00"));
        vm.expectRevert(ChunkedCartridgeRegistry.ChunkChanged.selector);
        registry.contentOf(id);
        vm.etch(chunks[0], original);
        require(registry.launchManifest(id, address(this)).onchainContentAvailable, "restored local fixture");
        require(sha256(registry.contentOf(id)) == registry.releaseOf(releaseId).contentHash, "full SHA checked");
    }

    function testChangedCanonicalArchiveFailsClosedEvenWhenChunksAreUnchanged() public {
        (uint256 releaseId,) = _publish(bytes("<!doctype html>"), bytes("<title>archive</title>"));
        uint256 id = registry.acquire(releaseId);
        ChunkedCartridgeRegistry.Release memory edition = registry.releaseOf(releaseId);
        require(OnchainApp(edition.archive).byteLength() == edition.byteLength, "canonical archive length");
        require(OnchainApp(edition.archive).contentSha256() == edition.contentHash, "canonical archive digest");
        vm.etch(edition.archive, hex"00");
        require(!registry.launchManifest(id, address(this)).onchainContentAvailable, "changed archive unavailable");
        vm.expectRevert(ChunkedCartridgeRegistry.ArchiveChanged.selector);
        registry.contentOf(id);
    }

    function testWrongDigestOrderingNonDataAndOversizedContentRejectBeforePublication() public {
        address[] memory chunks = new address[](2);
        chunks[0] = address(new AppChunk(bytes("first")));
        chunks[1] = address(new AppChunk(bytes("second")));
        bytes32 wrongOrderHash = sha256(bytes("secondfirst"));
        vm.expectRevert();
        registry.publishRelease("{}", chunks, wrongOrderHash);
        address bad = address(0xbad);
        vm.etch(bad, hex"fe0102");
        chunks[0] = bad;
        vm.expectRevert(ChunkedCartridgeRegistry.InvalidChunk.selector);
        registry.publishRelease("{}", chunks, bytes32(uint256(1)));
        address full = address(new AppChunk(new bytes(23000)));
        address[] memory oversized = new address[](46);
        for (uint256 i; i < oversized.length; ++i) oversized[i] = full;
        vm.expectRevert(ChunkedCartridgeRegistry.InvalidContent.selector);
        registry.publishRelease("{}", oversized, bytes32(uint256(1)));
        require(registry.MAX_CONTENT_BYTES() == 1_048_576 && registry.nextReleaseId() == 1 && registry.nextId() == 1, "bounded, no partial mint");
    }

    function testRejectingReceiverRollsBackTokenIdentity() public {
        (uint256 releaseId,) = _publish(bytes("<!doctype html>"), bytes("<title>receiver</title>"));
        vm.prank(address(collection)); // Collection test fixture deliberately has no ERC721 receiver.
        vm.expectRevert();
        registry.acquire(releaseId);
        require(registry.nextId() == 1, "failed safe mint cannot consume identity");
        require(registry.nextReleaseId() == 2, "published release retained");
    }

    function testFuzzChunkRecoveryRetainsAllBytes(bytes32 salt, uint16 requested) public {
        uint256 length = 1 + uint256(requested) % 2048;
        bytes memory content = new bytes(length);
        for (uint256 i; i < length; ++i) content[i] = salt[i % 32];
        address[] memory chunks = new address[](1);
        chunks[0] = address(new AppChunk(content));
        uint256 releaseId = registry.publishRelease("{}", chunks, sha256(content));
        uint256 id = registry.acquire(releaseId);
        bytes memory recovered = registry.contentOf(id);
        require(recovered.length == length && keccak256(recovered) == keccak256(content), "byte-exact recovery");
    }
}
