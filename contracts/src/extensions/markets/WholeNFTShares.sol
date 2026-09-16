// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolAssets, ProtocolGuard} from "../../protocol/ProtocolPrimitives.sol";

interface IShareCollection {
    function ownerOf(uint256 id) external view returns(address);
    function accountOf(uint256 id) external view returns(address);
    function safeTransferFrom(address from,address to,uint256 id) external;
}
interface IShareAccount {
    function mode() external view returns(uint8);
    function actionNonce() external view returns(uint256);
    function instrumentGrantCount() external view returns(uint256);
    function sessionEpoch() external view returns(uint64);
    function currentOwner() external view returns(address);
    function collection() external view returns(address);
    function tokenId() external view returns(uint256);
}

/// @notice Immutable custody of one unused Bound ANIMA NFT and its account; transferable economic shares.
/// @dev No arbitrary executor, delegated signing, issuer withdrawal, external call governance or upgrade key.
/// Shareholders may reunite all shares for the NFT, or accept a funded buyout with locked-share voting.
/// This does not transfer offchain private keys, legal rights, or override previously created outside obligations.
contract WholeNFTShares is ProtocolGuard {
    string public constant name="ANIMA Whole NFT Custody Share";
    string public constant symbol="ANIMA-SHARE";
    uint8 public constant decimals=18;
    IShareCollection public immutable collection;
    uint256 public immutable tokenId;
    address public immutable issuer;
    address public immutable account;
    uint256 public immutable originalSupply;
    bytes32 public immutable propertyDisclosure;
    uint16 public immutable approvalBps;
    uint64 public immutable votingPeriod;
    uint256 public totalSupply;
    uint256 public proposalCount;
    uint256 public activeProposal;
    uint256 public redemptionPool;
    uint256 public outstandingNative;
    bool public deposited;
    bool public redeemed;
    bool private receiving;
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    struct Buyout{address bidder;address recipient;uint112 price;uint64 deadline;uint256 support;bool resolved;bool accepted;}
    mapping(uint256=>Buyout) public buyouts;
    mapping(uint256=>mapping(address=>uint256)) public lockedVotes;
    mapping(address=>uint256) public refunds;
    event Transfer(address indexed from,address indexed to,uint256 value);
    event Approval(address indexed owner,address indexed spender,uint256 value);
    event Deposited(address indexed issuer,address indexed account,uint64 sessionEpoch,bytes32 disclosure);
    event BuyoutOpened(uint256 indexed id,address indexed bidder,uint256 price,uint64 deadline);
    event Supported(uint256 indexed id,address indexed voter,uint256 shares);
    event BuyoutResolved(uint256 indexed id,bool accepted);
    event Redeemed(address indexed owner,address indexed recipient);
    error InvalidShares();
    constructor(address collection_,uint256 tokenId_,address issuer_,uint112 supply_,bytes32 propertyDisclosure_,uint16 approvalBps_,uint64 votingPeriod_) {
        if(collection_.code.length==0||issuer_==address(0)||supply_==0||propertyDisclosure_==0||approvalBps_<6667||approvalBps_>10000||votingPeriod_<1 days||votingPeriod_>30 days)revert InvalidShares();
        collection=IShareCollection(collection_);tokenId=tokenId_;issuer=issuer_;originalSupply=supply_;propertyDisclosure=propertyDisclosure_;approvalBps=approvalBps_;votingPeriod=votingPeriod_;
        account=IShareCollection(collection_).accountOf(tokenId_);
        if(account.code.length==0||IShareAccount(account).collection()!=collection_||IShareAccount(account).tokenId()!=tokenId_)revert InvalidShares();
    }
    function deposit() external nonReentrant {
        if(msg.sender!=issuer||deposited||collection.ownerOf(tokenId)!=issuer)revert InvalidShares();IShareAccount a=IShareAccount(account);
        // Accounts that have already executed can retain unknown allowances/debt; refuse them entirely.
        if(a.mode()!=0||a.actionNonce()!=0||a.instrumentGrantCount()!=0||a.currentOwner()!=issuer)revert InvalidShares();
        uint64 beforeEpoch=a.sessionEpoch();receiving=true;collection.safeTransferFrom(issuer,address(this),tokenId);receiving=false;
        if(collection.ownerOf(tokenId)!=address(this)||a.currentOwner()!=address(this)||a.mode()!=0||a.sessionEpoch()!=beforeEpoch+1)revert InvalidShares();
        deposited=true;totalSupply=originalSupply;balanceOf[issuer]=originalSupply;emit Transfer(address(0),issuer,originalSupply);emit Deposited(issuer,account,a.sessionEpoch(),propertyDisclosure);
    }
    function onERC721Received(address,address,uint256 id,bytes calldata) external view returns(bytes4){if(!receiving||msg.sender!=address(collection)||id!=tokenId)revert InvalidShares();return 0x150b7a02;}
    function approve(address spender,uint256 amount) external returns(bool){if(spender==address(0)||spender==address(this))revert InvalidShares();allowance[msg.sender][spender]=amount;emit Approval(msg.sender,spender,amount);return true;}
    function transfer(address to,uint256 amount) external returns(bool){_transfer(msg.sender,to,amount);return true;}
    function transferFrom(address from,address to,uint256 amount) external returns(bool){uint256 permitted=allowance[from][msg.sender];if(permitted!=type(uint256).max){allowance[from][msg.sender]=permitted-amount;emit Approval(from,msg.sender,permitted-amount);}_transfer(from,to,amount);return true;}
    function _transfer(address from,address to,uint256 amount) internal {if(to==address(0)||to==address(this))revert InvalidShares();balanceOf[from]-=amount;balanceOf[to]+=amount;emit Transfer(from,to,amount);}
    function proposeBuyout(address recipient) external payable nonReentrant returns(uint256 id){
        if(!deposited||redeemed||activeProposal!=0||msg.value==0||msg.value>type(uint112).max||recipient==address(0)||recipient==address(this)||recipient==account)revert InvalidShares();
        id=++proposalCount;activeProposal=id;uint64 deadline=uint64(block.timestamp+votingPeriod);buyouts[id]=Buyout(msg.sender,recipient,uint112(msg.value),deadline,0,false,false);outstandingNative+=msg.value;emit BuyoutOpened(id,msg.sender,msg.value,deadline);
    }
    function supportBuyout(uint256 id,uint256 amount) external {
        Buyout storage b=buyouts[id];if(activeProposal!=id||id==0||b.resolved||block.timestamp>=b.deadline||amount==0)revert InvalidShares();balanceOf[msg.sender]-=amount;balanceOf[address(this)]+=amount;lockedVotes[id][msg.sender]+=amount;b.support+=amount;emit Transfer(msg.sender,address(this),amount);emit Supported(id,msg.sender,amount);
    }
    function withdrawSupport(uint256 id,uint256 amount) external {
        Buyout storage b=buyouts[id];if(b.bidder==address(0)||amount==0||(!b.resolved&&block.timestamp>=b.deadline))revert InvalidShares();lockedVotes[id][msg.sender]-=amount;balanceOf[address(this)]-=amount;balanceOf[msg.sender]+=amount;if(!b.resolved)b.support-=amount;emit Transfer(address(this),msg.sender,amount);
    }
    function resolveBuyout(uint256 id) external nonReentrant {
        Buyout storage b=buyouts[id];if(id==0||activeProposal!=id||b.resolved||block.timestamp<b.deadline)revert InvalidShares();
        b.resolved=true;activeProposal=0;
        if(b.support*10000>=originalSupply*approvalBps){
            // A rejecting receiver must not lock the NFT/shares permanently. Failure rejects this offer.
            try collection.safeTransferFrom{gas:500000}(address(this),b.recipient,tokenId){b.accepted=true;redeemed=true;redemptionPool=b.price;}catch{refunds[b.bidder]+=b.price;}
        }else refunds[b.bidder]+=b.price;
        emit BuyoutResolved(id,b.accepted);
    }
    function redeemWhole(address recipient) external nonReentrant {
        if(!deposited||redeemed||balanceOf[msg.sender]!=originalSupply||recipient==address(0)||recipient==address(this)||recipient==account)revert InvalidShares();
        // Unanimous ownership vetoes an outstanding offer. Otherwise an outsider could repeatedly
        // post refundable dust offers to stop the whole owner from recovering the NFT forever.
        if(activeProposal!=0){uint256 id=activeProposal;Buyout storage b=buyouts[id];b.resolved=true;activeProposal=0;refunds[b.bidder]+=b.price;emit BuyoutResolved(id,false);}
        redeemed=true;balanceOf[msg.sender]=0;totalSupply=0;emit Transfer(msg.sender,address(0),originalSupply);collection.safeTransferFrom(address(this),recipient,tokenId);emit Redeemed(msg.sender,recipient);
    }
    function claimBuyout(uint256 shares,address recipient) external nonReentrant {
        if(!redeemed||redemptionPool==0||shares==0||shares>balanceOf[msg.sender])revert InvalidShares();
        // Last outstanding share receives all rounding residue; splitting claims cannot exceed the funded pool.
        uint256 amount=shares==totalSupply?redemptionPool:redemptionPool*shares/totalSupply;
        balanceOf[msg.sender]-=shares;totalSupply-=shares;redemptionPool-=amount;outstandingNative-=amount;emit Transfer(msg.sender,address(0),shares);if(amount!=0)ProtocolAssets.push(address(0),recipient,amount);
    }
    function claimRefund(address recipient) external nonReentrant {uint256 amount=refunds[msg.sender];if(amount==0)revert InvalidAmount();refunds[msg.sender]=0;outstandingNative-=amount;ProtocolAssets.push(address(0),recipient,amount);}
}
