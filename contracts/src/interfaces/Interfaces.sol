// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

struct OrganismRenderData {
    uint256 tokenId;
    bytes32 seed;
    bytes32 genome;
    bytes32 stateRoot;
    bytes32 memoryRoot;
    bytes32 lineageRoot;
    bytes32 auditRoot;
    bytes32 constitutionHash;
    uint64 bornAt;
    uint64 evolvedAt;
    uint32 generation;
    uint32 evolutions;
    uint256 parentId;
    uint256 actionNonce;
    bool sovereign;
    address account;
    address owner;
}

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4 magicValue);
}

interface IERC721Receiver {
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4);
}

interface IActionVerifier {
    function verify(bytes32 statement, bytes calldata proof) external view returns (bool);
}

interface IProofRouter {
    function verify(uint32 verifierId, bytes32 statement, bytes calldata proof) external view returns (bool);
    function verifierOf(uint32 verifierId) external view returns (address);
}

interface IERC721Control {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

interface IOrganismCollection is IERC721Control {
    function initialStateOf(uint256 tokenId) external view returns (bytes32 stateRoot, bytes32 memoryRoot);
    function deriveEvolutionStateRoot(uint256 tokenId, bytes32 newGenome, bytes32 newMemoryRoot, bytes32 evidenceHash) external view returns (bytes32);
    function commitEvolution(uint256 tokenId, bytes32 newGenome, bytes32 newMemoryRoot, bytes32 evidenceHash) external;
}

interface ISovereignAccountView {
    function stateRoot() external view returns (bytes32);
    function memoryRoot() external view returns (bytes32);
    function auditRoot() external view returns (bytes32);
    function constitutionHash() external view returns (bytes32);
    function actionNonce() external view returns (uint256);
}

interface IOrganismRenderSource {
    function renderSnapshot(uint256 tokenId) external view returns (OrganismRenderData memory);
}

interface IOnchainRenderer {
    function render(address collection, uint256 tokenId) external view returns (string memory);
}

interface ISovereignAccountFactory {
    function createAccount(uint256 tokenId) external returns (address account);
    function predictAccount(uint256 tokenId) external view returns (address account);
}

interface ISovereignAccountControl is ISovereignAccountView {
    function invalidateSessionsOnTransfer() external;
    function promoteSovereign(
        bytes32 constitutionHash_,
        uint96 maxValuePerAction_,
        uint32 minActionDelay_
    ) external;
}
