// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolGuard,ProtocolAssets,IWorldLedger,IProtocolCollection} from "../protocol/ProtocolPrimitives.sol";
interface IEstateCollection is IProtocolCollection {
    function safeTransferFrom(address from,address to,uint256 id) external;
    function userOf(uint256 id) external view returns(address);
    function royaltyInfo(uint256 id,uint256 price) external view returns(address,uint256);
}
interface IEstateAccount {function mode() external view returns(uint8);function instrumentRevision() external view returns(uint256);function actionNonce() external view returns(uint256);}
interface IOperatingCommitmentIndex {function snapshot(address account) external view returns(bytes32);}
interface IERC721EstateChild {function ownerOf(uint256 id) external view returns(address);function getApproved(uint256 id) external view returns(address);}

/// @notice Sell the artifact under a declared-inventory covenant, not only a token-ID quote.
/// @dev The NFT is escrowed, so its old owner/sessions cannot spend through its account.
/// This is NOT proof of absence of arbitrary third-party allowances or hidden liabilities.
/// Declared balances, children, approval pairs and vault records are checked at execution.
/// Existing allowances on external asset contracts must be independently reviewed/revoked.
/// A sale does not accelerate vesting, transfer people, transfer private keys or erase history.
contract EstateExchange is ProtocolGuard {
    IEstateCollection public immutable collection;
    IWorldLedger public immutable ledger;
    IOperatingCommitmentIndex public immutable commitments;
    mapping(uint256=>bytes32) public moduleSnapshots;
    mapping(uint256=>uint256) public instrumentRevisions;
    mapping(uint256=>uint256) public accountNonces;
    struct Floor {address asset;uint112 minimum;}
    struct Child {address collection;uint256 tokenId;}
    struct LockSeal {uint256 lockId;bytes32 expectedHash;}
    struct ApprovalCheck {address asset;address spender;}
    struct Listing {address seller;address account;uint256 tokenId;uint112 price;uint112 nativeFloor;uint64 expires;uint8 status;address royaltyReceiver;uint112 royalty;bytes32 snapshot;bytes32 manifest;bytes description;}
    mapping(uint256=>Listing) private listings;
    mapping(uint256=>Floor[]) private floors;
    mapping(uint256=>Child[]) private children;
    mapping(uint256=>LockSeal[]) private lockSeals;
    mapping(uint256=>ApprovalCheck[]) private approvals;
    mapping(address=>uint256) public claimable;
    uint256 public listingCount;
    uint256 private receivingToken;
    address private receivingSeller;
    bool private received;
    event EstateListed(uint256 indexed listingId,uint256 indexed tokenId,address indexed seller,bytes32 manifest,uint256 price,uint64 expires);
    event EstateTransferred(uint256 indexed listingId,uint256 indexed tokenId,address indexed buyer,address previousCustodian,bytes32 manifest);
    event EstateReturned(uint256 indexed listingId,address indexed seller);
    error StaleCovenant();error InvalidListing();error UnsafeReceiver();
    constructor(address ledger_,address commitments_){require(ledger_.code.length!=0&&commitments_.code.length!=0,"DEPENDENCIES_REQUIRED");commitments=IOperatingCommitmentIndex(commitments_);ledger=IWorldLedger(ledger_);collection=IEstateCollection(ledger.collection());}
    function list(uint256 tokenId,uint112 price,uint112 nativeFloor,uint64 expires,Floor[] calldata assets,Child[] calldata childAssets,LockSeal[] calldata locks,ApprovalCheck[] calldata zeroAllowances,bytes calldata description) external nonReentrant returns(uint256 id){
        if(!ledger.isSealed()||collection.ownerOf(tokenId)!=msg.sender||price==0||expires<=block.timestamp||expires>block.timestamp+30 days||description.length>4096||assets.length>16||childAssets.length>8||locks.length>16||zeroAllowances.length>32) revert InvalidListing();
        address account=collection.accountOf(tokenId);
        if(IEstateAccount(account).mode()!=0||collection.userOf(tokenId)!=address(0)) revert InvalidListing();
        // No sovereign-owner bypass and no silent termination of an active user lease.
        receivingToken=tokenId;receivingSeller=msg.sender;received=false;
        collection.safeTransferFrom(msg.sender,address(this),tokenId);
        if(!received||collection.ownerOf(tokenId)!=address(this)) revert UnsafeReceiver();
        receivingToken=0;receivingSeller=address(0);
        id=++listingCount;Listing storage l=listings[id];
        l.seller=msg.sender;l.account=account;l.tokenId=tokenId;l.price=price;l.nativeFloor=nativeFloor;l.expires=expires;l.status=1;l.description=description;
        (address receiver,uint256 fee)=collection.royaltyInfo(tokenId,price);if(fee>price) revert InvalidListing();
        l.royaltyReceiver=receiver;l.royalty=uint112(fee);if(fee!=0&&receiver==address(0)) revert InvalidListing();
        address previous;
        for(uint256 i;i<assets.length;++i){if(assets[i].asset<=previous||assets[i].asset.code.length==0) revert InvalidListing();previous=assets[i].asset;floors[id].push(assets[i]);}
        for(uint256 i;i<childAssets.length;++i){if(childAssets[i].collection.code.length==0) revert InvalidListing();children[id].push(childAssets[i]);}
        for(uint256 i;i<locks.length;++i)lockSeals[id].push(locks[i]);
        for(uint256 i;i<zeroAllowances.length;++i){if(zeroAllowances[i].asset.code.length==0||zeroAllowances[i].spender==address(0)) revert InvalidListing();approvals[id].push(zeroAllowances[i]);}
        l.snapshot=snapshot(tokenId);moduleSnapshots[id]=commitments.snapshot(account);instrumentRevisions[id]=IEstateAccount(account).instrumentRevision();accountNonces[id]=IEstateAccount(account).actionNonce();
        l.manifest=keccak256(abi.encode("IDFBI_ESTATE_V1_6",block.chainid,address(this),id,msg.sender,tokenId,account,price,nativeFloor,expires,receiver,fee,l.snapshot,moduleSnapshots[id],instrumentRevisions[id],accountNonces[id],assets,childAssets,locks,zeroAllowances,keccak256(description)));
        _inventory(id);emit EstateListed(id,tokenId,msg.sender,l.manifest,price,expires);
        ledger.record(8,msg.sender,0,address(collection),price,tokenId,l.manifest);
    }
    function buy(uint256 id,bytes32 expectedManifest) external payable nonReentrant {
        Listing storage l=listings[id];
        if(l.status!=1||block.timestamp>l.expires||msg.value!=l.price||msg.sender==l.seller||msg.sender==l.account||expectedManifest!=l.manifest) revert InvalidListing();
        if(collection.ownerOf(l.tokenId)!=address(this)||snapshot(l.tokenId)!=l.snapshot) revert StaleCovenant();
        (address receiver,uint256 fee)=collection.royaltyInfo(l.tokenId,l.price);
        if(receiver!=l.royaltyReceiver||fee!=l.royalty) revert StaleCovenant();
        _inventory(id);l.status=2;
        claimable[l.seller]+=uint256(l.price)-l.royalty;if(l.royalty!=0)claimable[receiver]+=l.royalty;
        collection.safeTransferFrom(address(this),msg.sender,l.tokenId);
        // Receiver callbacks cannot remove a declared asset during the purchase transaction.
        if(collection.ownerOf(l.tokenId)!=msg.sender) revert StaleCovenant();_inventory(id);
        emit EstateTransferred(id,l.tokenId,msg.sender,l.seller,l.manifest);
        ledger.record(9,msg.sender,0,address(collection),l.price,l.tokenId,l.manifest);
    }
    event ManifestRefreshed(uint256 indexed listingId,bytes32 manifest);
    /// @notice Counterparty claims continue while escrowed. A changed manifest requires buyer re-review.
    function refresh(uint256 id,LockSeal[] calldata updatedLocks,bytes calldata description) external nonReentrant {
        Listing storage l=listings[id];if(l.status!=1||msg.sender!=l.seller||collection.ownerOf(l.tokenId)!=address(this)||block.timestamp>l.expires||updatedLocks.length>16||description.length>4096)revert InvalidListing();
        delete lockSeals[id];for(uint256 i;i<updatedLocks.length;++i)lockSeals[id].push(updatedLocks[i]);
        l.snapshot=snapshot(l.tokenId);moduleSnapshots[id]=commitments.snapshot(l.account);instrumentRevisions[id]=IEstateAccount(l.account).instrumentRevision();accountNonces[id]=IEstateAccount(l.account).actionNonce();l.description=description;
        l.manifest=keccak256(abi.encode('IDFBI_ESTATE_REFRESH_1_6',block.chainid,address(this),id,l.manifest,l.snapshot,moduleSnapshots[id],instrumentRevisions[id],accountNonces[id],updatedLocks,keccak256(description)));
        _inventory(id);emit ManifestRefreshed(id,l.manifest);
    }
    function cancel(uint256 id) external nonReentrant {
        Listing storage l=listings[id];if(l.status!=1||(msg.sender!=l.seller&&block.timestamp<=l.expires)) revert Unauthorized();l.status=3;
        collection.safeTransferFrom(address(this),l.seller,l.tokenId);emit EstateReturned(id,l.seller);
        ledger.record(10,l.seller,0,address(collection),0,l.tokenId,l.manifest);
    }
    function withdrawProceeds() external nonReentrant {uint256 value=claimable[msg.sender];if(value==0)revert InvalidAmount();claimable[msg.sender]=0;ProtocolAssets.push(address(0),msg.sender,value);}
    function onERC721Received(address operator,address from,uint256 id,bytes calldata) external returns(bytes4){
        if(msg.sender!=address(collection)||operator!=address(this)||id!=receivingToken||from!=receivingSeller||received)revert UnsafeReceiver();received=true;return this.onERC721Received.selector;
    }
    function snapshot(uint256 tokenId) public view returns(bytes32){
        address account=collection.accountOf(tokenId);
        (bool ok,bytes memory data)=address(collection).staticcall(abi.encodeWithSignature("renderSnapshot(uint256)",tokenId));if(!ok)revert StaleCovenant();
        (bool ok2,bytes memory epoch)=account.staticcall(abi.encodeWithSignature("sessionEpoch()"));if(!ok2||epoch.length!=32)revert StaleCovenant();
        return keccak256(abi.encode(keccak256(data),epoch,account.codehash));
    }
    function lockHash(uint256 lockId) public view returns(bytes32){
        (bool ok,bytes memory data)=ledger.vault().staticcall(abi.encodeWithSignature("lockInfo(uint256)",lockId));
        if(!ok||data.length!=320)revert StaleCovenant();return keccak256(data);
    }
    function _inventory(uint256 id) private view {
        Listing storage l=listings[id];if(commitments.snapshot(l.account)!=moduleSnapshots[id]||IEstateAccount(l.account).instrumentRevision()!=instrumentRevisions[id]||IEstateAccount(l.account).actionNonce()!=accountNonces[id])revert StaleCovenant();if(l.account.balance<l.nativeFloor)revert StaleCovenant();
        for(uint256 i;i<floors[id].length;++i){Floor storage f=floors[id][i];if(ProtocolAssets.balance(f.asset,l.account)<f.minimum)revert StaleCovenant();}
        for(uint256 i;i<children[id].length;++i){Child storage c=children[id][i];if(IERC721EstateChild(c.collection).ownerOf(c.tokenId)!=l.account||IERC721EstateChild(c.collection).getApproved(c.tokenId)!=address(0))revert StaleCovenant();}
        for(uint256 i;i<lockSeals[id].length;++i){LockSeal storage s=lockSeals[id][i];
            (bool ok,bytes memory data)=ledger.vault().staticcall(abi.encodeWithSignature("lockInfo(uint256)",s.lockId));
            if(!ok||data.length!=320||keccak256(data)!=s.expectedHash)revert StaleCovenant();
            // The second word is the beneficiary; a seller cannot advertise somebody else's lock.
            address beneficiary;assembly("memory-safe"){beneficiary:=mload(add(data,64))}if(beneficiary!=l.account)revert StaleCovenant();
        }
        for(uint256 i;i<approvals[id].length;++i){ApprovalCheck storage a=approvals[id][i];
            (bool ok,bytes memory data)=a.asset.staticcall(abi.encodeWithSignature("allowance(address,address)",l.account,a.spender));
            if(!ok||data.length!=32||abi.decode(data,(uint256))!=0)revert StaleCovenant();
        }
    }
    function listing(uint256 id) external view returns(Listing memory){return listings[id];}
    function declaredAssets(uint256 id) external view returns(Floor[] memory,Child[] memory,LockSeal[] memory,ApprovalCheck[] memory){return(floors[id],children[id],lockSeals[id],approvals[id]);}
}
