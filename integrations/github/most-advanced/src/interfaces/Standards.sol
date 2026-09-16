// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  The standards this token answers to.

  Every identifier below was recomputed from the function selectors rather
  than copied, and each is asserted against the published value in
  test/Standards.t.sol. ERC-4906 is the one exception: its interface is
  events only, so Solidity's type(I).interfaceId would be zero and the EIP
  fixes the identifier by fiat at 0x49064906.
───────────────────────────────────────────────────────────────────────────*/

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IERC721 is IERC165 {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function setApprovalForAll(address operator, bool approved) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

interface IERC721Metadata is IERC721 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

interface IERC721Enumerable is IERC721 {
    function totalSupply() external view returns (uint256);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
    function tokenByIndex(uint256 index) external view returns (uint256);
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external returns (bytes4);
}

/*── ERC-2981 · royalties ──*/
interface IERC2981 is IERC165 {
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external view returns (address receiver, uint256 royaltyAmount);
}

/*── ERC-4906 · tell the indexers the metadata moved ──*/
interface IERC4906 is IERC165 {
    event MetadataUpdate(uint256 _tokenId);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);
}

/*── ERC-4907 · a user who is not the owner ──*/
interface IERC4907 {
    event UpdateUser(uint256 indexed tokenId, address indexed user, uint64 expires);

    function setUser(uint256 tokenId, address user, uint64 expires) external;
    function userOf(uint256 tokenId) external view returns (address);
    function userExpires(uint256 tokenId) external view returns (uint256);
}

/*── ERC-5192 · minimal soulbound ──*/
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    function locked(uint256 tokenId) external view returns (bool);
}

/*── ERC-6454 · ask before assuming a token can move ──*/
interface IERC6454 is IERC165 {
    function isTransferable(uint256 tokenId, address from, address to) external view returns (bool);
}

/*── ERC-7572 · metadata for the collection itself ──*/
interface IERC7572 {
    event ContractURIUpdated();

    function contractURI() external view returns (string memory);
}

/*── ERC-7160 · one token, several faces, holder picks ──*/
interface IERC721MultiMetadata is IERC165 {
    event TokenUriPinned(uint256 indexed tokenId, uint256 indexed index);
    event TokenUriUnpinned(uint256 indexed tokenId);

    function tokenURIs(uint256 tokenId)
        external view returns (uint256 index, string[] memory uris, bool pinned);
    function pinTokenURI(uint256 tokenId, uint256 index) external;
    function unpinTokenURI(uint256 tokenId) external;
    function hasPinnedTokenURI(uint256 tokenId) external view returns (bool);
}

/*── ERC-7496 · on-chain traits an indexer can read directly ──*/
interface IERC7496 is IERC165 {
    event TraitUpdated(bytes32 indexed traitKey, uint256 tokenId, bytes32 traitValue);
    event TraitUpdatedRange(bytes32 indexed traitKey, uint256 fromTokenId, uint256 toTokenId);
    event TraitUpdatedRangeUniformValue(
        bytes32 indexed traitKey, uint256 fromTokenId, uint256 toTokenId, bytes32 traitValue);
    event TraitUpdatedList(bytes32 indexed traitKey, uint256[] tokenIds);
    event TraitUpdatedListUniformValue(bytes32 indexed traitKey, uint256[] tokenIds, bytes32 traitValue);
    event TraitMetadataURIUpdated();

    function getTraitValue(uint256 tokenId, bytes32 traitKey) external view returns (bytes32);
    function getTraitValues(uint256 tokenId, bytes32[] calldata traitKeys)
        external view returns (bytes32[] memory);
    function getTraitMetadataURI() external view returns (string memory);
    function setTrait(uint256 tokenId, bytes32 traitKey, bytes32 newValue) external;
}

/*── ERC-6551 · the account bound to a token ──*/
interface IERC6551Registry {
    function createAccount(
        address implementation, bytes32 salt, uint256 chainId,
        address tokenContract, uint256 tokenId
    ) external returns (address);

    function account(
        address implementation, bytes32 salt, uint256 chainId,
        address tokenContract, uint256 tokenId
    ) external view returns (address);
}

/*── ERC-173 · who administers the collection ──
  Not glamorous, and the single most load-bearing omission a fully on-chain
  collection can make: marketplaces resolve collection-admin rights by
  staticcalling owner(). Without it nobody can edit the collection page. */
interface IERC173 {
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    function owner() external view returns (address);
    function transferOwnership(address newOwner) external;
}

/*───────────────────────────────────────────────────────────────────────────
  THE SEALED KERNEL

  Inspired by ERC-7857, and deliberately NOT a conformance claim.

  The idea worth taking: a token may carry a payload that is not public,
  identified on chain only by its hash and sealed to a key its holder
  controls. Handing the token over is then not enough, because the new
  holder cannot open what was sealed to the old one. A transfer is only
  accepted alongside a proof that the same payload was re-sealed to the
  recipient, and what counts as a proof is the verifier's business - a TEE
  attestation and a zero-knowledge proof are both admissible, and neither
  belongs hard-coded in a token contract.

  Why this contract does not say "ERC-7857":
    1. That specification's normative entry points are iTransfer and
       iClone(..., TransferValidityProof[]). These are not those functions
       and do not share their selectors, so a client written against the
       standard would not find them.
    2. The specification defines no ERC-165 interface identifier, so there
       is nothing to register and nothing for a client to detect.
    3. Its premise is that the valuable metadata is encrypted and lives off
       chain behind an executor the specification declines to specify. That
       is the exact inverse of a work whose entire claim is that nothing is
       fetched.

  So the mechanism is here under its own name. A collection that shipped
  this as "ERC-7857 compliant" would be making a false claim in an
  immutable contract, which is worse than shipping no kernel at all.
───────────────────────────────────────────────────────────────────────────*/
interface IDataVerifier {
    /// @return ok         whether the proof stands
    /// @return oldHashes  what the payload hashed to before the re-seal
    /// @return newHashes  what it hashes to now
    /// @return sealedTo   the key it is now sealed to
    function verifyTransfer(bytes calldata proof)
        external view returns (bool ok, bytes32[] memory oldHashes, bytes32[] memory newHashes, bytes32 sealedTo);
}

interface ISealedKernel {
    event Sealed(uint256 indexed tokenId, bytes32[] dataHashes, bytes32 sealedTo);
    event Cloned(uint256 indexed fromTokenId, uint256 indexed toTokenId, address indexed to);
    event UsageAuthorised(uint256 indexed tokenId, address indexed user);
    event VerifierUpdated(address verifier);

    function transferWithKernel(address to, uint256 tokenId, bytes calldata proof) external;
    /// @dev Payable: a clone consumes a slot out of the supply exactly as a
    ///      mint does, so it is priced like what it consumes.
    function cloneWithKernel(address to, uint256 tokenId, bytes calldata proof)
        external payable returns (uint256);
    function authorizeUsage(uint256 tokenId, address user) external;
    function dataHashesOf(uint256 tokenId) external view returns (bytes32[] memory);
    function sealedTo(uint256 tokenId) external view returns (bytes32);

    /// @notice 0 absent · 1 current · 2 stale.
    /// @dev    Derived by comparing the owner the kernel was sealed under
    ///         against the current owner, so an ordinary `transferFrom` —
    ///         which moves the token without re-sealing anything — is
    ///         visible to a buyer instead of silent.
    function kernelStatus(uint256 tokenId) external view returns (uint8);

    /// @notice A verifier checked this exact re-sealing, and it still stands.
    /// @dev    Deliberately separate from `kernelStatus`. "Sealed under the
    ///         holder" and "proved by somebody" are different claims, and a
    ///         client that merges them tells a buyer something nobody
    ///         established.
    function kernelProved(uint256 tokenId) external view returns (bool);

    /// @notice Whether this collection has a verifier at all.
    function hasVerifier() external view returns (bool);
}
