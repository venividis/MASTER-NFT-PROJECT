// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProtocolAssets, ProtocolGuard} from "../../protocol/ProtocolPrimitives.sol";
import {OperatingVotingShares} from "./OperatingVotingShares.sol";

interface IOperatingCollection {
    function ownerOf(uint256) external view returns (address);
    function accountOf(uint256) external view returns (address);
    function safeTransferFrom(address,address,uint256) external;
}
interface IOperatingAccount {
    function collection() external view returns (address);
    function tokenId() external view returns (uint256);
    function mode() external view returns (uint8);
    function currentOwner() external view returns (address);
    function actionNonce() external view returns (uint256);
    function sessionEpoch() external view returns (uint64);
    function instrumentGrantCount() external view returns (uint256);
    function executeUtility(uint256,uint48,address,address,uint256,bytes calldata,uint256) external payable returns (bytes memory);
}

/// @notice Explicitly OPERATING custody; this is not an upgrade to frozen WholeNFTShares.
/// @dev Immutable policies; checkpointed transferable shares; voted exact calls; bounded operators;
/// fully funded buyouts. A new, unused Bound account avoids inherited approvals and liabilities.
/// Enumerated fungible balances and ETH are enforced, not a claim of universal DeFi debt detection.
contract OperatingNFTGovernance is ProtocolGuard {
    uint256 private constant BPS = 10000;
    uint256 private constant MAX_TRACKED_ASSETS = 16;
    uint256 private constant EXECUTION_GRACE = 7 days;
    IOperatingCollection public immutable collection;
    IOperatingAccount public immutable account;
    uint256 public immutable tokenId;
    address public immutable issuer;
    bytes32 public immutable disclosure;
    uint256 public immutable originalSupply;
    uint16 public immutable quorumBps;
    uint16 public immutable supportBps;
    uint16 public immutable buyoutBps;
    uint16 public immutable proposalBps;
    uint48 public immutable votingPeriod;
    uint48 public immutable executionDelay;
    uint128 public immutable minimumBuyoutPrice;
    uint64 public custodyEpoch;
    OperatingVotingShares public immutable shares;
    bool public deposited;
    bool public exited;
    bool private receiving;
    address[] public trackedAssets;
    mapping(address => bool) public tracked;

    // Both exact bytes and return hash are recorded in the proposal. The precondition's
    // target code hash is checked as well; proxy implementation changes require an
    // explicit implementation/state precondition chosen by the proposer.
    struct Action {
        address target;
        bytes32 targetCodeHash;
        address inputAsset;
        uint112 maxInput;
        uint96 value;
        address outputAsset;
        uint112 minOutput;
        uint256 expectedNonce;
        uint48 deadline;
        bytes data;
        address conditionTarget;
        bytes32 conditionCodeHash;
        bytes conditionData;
        bytes32 conditionResultHash;
        bytes32 priorObligations;
        bytes32 nextObligations;
    }
    bytes32 public obligationsRoot;
    enum Kind { Action, Operator, RevokeOperator, Buyout, TrackAsset }
    struct Proposal {
        address proposer;
        Kind kind;
        uint64 snapshot;
        uint48 voteEnd;
        uint48 eta;
        uint192 yes;
        uint192 no;
        bool executed;
        bool cancelled;
        bytes payload;
    }
    uint256 public proposalCount;
    mapping(uint256 => Proposal) private proposals;
    mapping(uint256 => mapping(address => bool)) public voted;
    struct Operator { address caller; uint112 remaining; uint32 callsRemaining; uint48 expires; bool revoked; Action action; }
    mapping(uint256 => Operator) private operators;
    struct Offer { address buyer; address recipient; uint256 price; uint256 nonce; bytes32 obligations; bool settled; }
    mapping(uint256 => Offer) public offers;
    uint256 public redemptionPool;
    uint256 public outstandingNative;
    mapping(address => uint256) public refunds;
    event Deposited(address indexed issuer,address indexed account,uint64 epoch,bytes32 disclosure);
    event Proposed(uint256 indexed id,Kind indexed kind,address indexed proposer,uint64 snapshot,uint48 voteEnd,bytes payload);
    event Voted(uint256 indexed id,address indexed voter,bool support,uint256 weight);
    event Queued(uint256 indexed id,uint48 eta);
    event Executed(uint256 indexed id,bytes32 resultHash);
    event Cancelled(uint256 indexed id);
    event OperatorUsed(uint256 indexed id,address indexed caller,uint256 inputSpent,uint32 callsRemaining);
    event AssetTracked(address indexed asset);
    event BuyoutSettled(uint256 indexed id,address indexed recipient,uint256 price);
    event Redeemed(address indexed holder,address indexed recipient,uint256 shares,uint256 proceeds);
    error InvalidGovernance();
    error StaleAction();
    error BudgetExceeded();

    struct Policy { uint16 quorum; uint16 support; uint16 buyout; uint16 proposal; uint48 voting; uint48 delay; uint128 minimumBuyout; }
    constructor(address collection_,uint256 tokenId_,address issuer_,address[] memory holders,uint192[] memory amounts,address[] memory assets,Policy memory policy,bytes32 disclosure_) {
        if(collection_.code.length==0||issuer_==address(0)||holders.length==0||holders.length!=amounts.length||holders.length>64||assets.length>MAX_TRACKED_ASSETS||disclosure_==0) revert InvalidGovernance();
        if(policy.quorum==0||policy.quorum>BPS||policy.support<5001||policy.support>BPS||policy.buyout<6667||policy.buyout>BPS||policy.proposal==0||policy.proposal>BPS||policy.voting<1 days||policy.voting>30 days||policy.delay<1 hours||policy.delay>30 days||policy.minimumBuyout==0) revert InvalidGovernance();
        collection=IOperatingCollection(collection_);tokenId=tokenId_;issuer=issuer_;disclosure=disclosure_;
        account=IOperatingAccount(collection.accountOf(tokenId_));
        if(address(account).code.length==0||account.collection()!=collection_||account.tokenId()!=tokenId_) revert InvalidGovernance();
        quorumBps=policy.quorum;supportBps=policy.support;buyoutBps=policy.buyout;proposalBps=policy.proposal;votingPeriod=policy.voting;executionDelay=policy.delay;minimumBuyoutPrice=policy.minimumBuyout;
        shares=new OperatingVotingShares(holders,amounts);originalSupply=shares.originalSupply();
        for(uint256 i;i<assets.length;i++)_track(assets[i]);
    }
    function deposit() external nonReentrant {
        if(msg.sender!=issuer||deposited||collection.ownerOf(tokenId)!=issuer||account.mode()!=0||account.actionNonce()!=0||account.instrumentGrantCount()!=0)revert InvalidGovernance();
        uint64 beforeEpoch=account.sessionEpoch();receiving=true;collection.safeTransferFrom(issuer,address(this),tokenId);receiving=false;
        custodyEpoch=account.sessionEpoch();if(custodyEpoch!=beforeEpoch+1||account.currentOwner()!=address(this))revert InvalidGovernance();
        deposited=true;shares.activate();
        emit Deposited(issuer,address(account),custodyEpoch,disclosure);
    }
    function onERC721Received(address,address,uint256 id,bytes calldata) external view returns(bytes4){if(!receiving||msg.sender!=address(collection)||id!=tokenId)revert InvalidGovernance();return 0x150b7a02;}
    function balanceOf(address holder) public view returns(uint256){return shares.balanceOf(holder);}
    function pastVotes(address holder,uint256 blockNumber) public view returns(uint256){return shares.pastVotes(holder,blockNumber);}
    function proposal(uint256 id) external view returns(Proposal memory){return proposals[id];}
    function operator(uint256 id) external view returns(address caller,uint112 remaining,uint32 callsRemaining,uint48 expires,bool revoked){Operator storage o=operators[id];return(o.caller,o.remaining,o.callsRemaining,o.expires,o.revoked);}
    function trackedAssetCount() external view returns(uint256){return trackedAssets.length;}
    function _custody() private view {if(!deposited||exited||account.mode()!=0||account.currentOwner()!=address(this)||account.sessionEpoch()!=custodyEpoch)revert InvalidGovernance();}
    function _propose(Kind kind,bytes memory payload,bool funded) private returns(uint256 id){_custody();uint64 snapshot=uint64(block.number-1);if(!funded&&pastVotes(msg.sender,snapshot)*BPS<originalSupply*proposalBps)revert InvalidGovernance();id=++proposalCount;uint48 end=uint48(block.timestamp+votingPeriod);proposals[id]=Proposal(msg.sender,kind,snapshot,end,0,0,0,false,false,payload);emit Proposed(id,kind,msg.sender,snapshot,end,payload);}
    function proposeAction(Action calldata action) external returns(uint256){_validateAction(action);return _propose(Kind.Action,abi.encode(action),false);}
    function proposeOperator(address caller,Action calldata action,uint112 budget,uint32 maxCalls,uint48 expires) external returns(uint256){_validateAction(action);if(caller==address(0)||action.maxInput==0||budget<action.maxInput||maxCalls==0||maxCalls>100||expires<=block.timestamp+votingPeriod+executionDelay||expires>block.timestamp+60 days||action.priorObligations!=action.nextObligations)revert InvalidGovernance();return _propose(Kind.Operator,abi.encode(caller,action,budget,maxCalls,expires),false);}
    function proposeRevocation(uint256 operatorId) external returns(uint256){if(operators[operatorId].caller==address(0))revert InvalidGovernance();return _propose(Kind.RevokeOperator,abi.encode(operatorId),false);}
    function proposeTrackedAsset(address asset) external returns(uint256){if(asset==address(0)||asset.code.length==0||tracked[asset]||trackedAssets.length>=MAX_TRACKED_ASSETS)revert InvalidGovernance();ProtocolAssets.balance(asset,address(account));return _propose(Kind.TrackAsset,abi.encode(asset),false);}
    function proposeBuyout(address recipient) external payable nonReentrant returns(uint256 id){if(msg.value<minimumBuyoutPrice||recipient==address(0)||recipient==address(this)||recipient==address(account))revert InvalidGovernance();id=_propose(Kind.Buyout,abi.encode(recipient,msg.value,account.actionNonce(),obligationsRoot),true);offers[id]=Offer(msg.sender,recipient,msg.value,account.actionNonce(),obligationsRoot,false);outstandingNative+=msg.value;}
    function vote(uint256 id,bool support) external {Proposal storage p=proposals[id];if(p.proposer==address(0)||p.cancelled||p.executed||block.timestamp>=p.voteEnd||voted[id][msg.sender])revert InvalidGovernance();uint256 weight=pastVotes(msg.sender,p.snapshot);if(weight==0)revert InvalidGovernance();voted[id][msg.sender]=true;if(support)p.yes+=uint192(weight);else p.no+=uint192(weight);emit Voted(id,msg.sender,support,weight);}
    function successful(uint256 id) public view returns(bool){Proposal storage p=proposals[id];if(p.proposer==address(0)||p.cancelled||p.executed||block.timestamp<p.voteEnd)return false;uint256 cast=uint256(p.yes)+p.no;return cast*BPS>=originalSupply*quorumBps&&uint256(p.yes)*BPS>=cast*supportBps&&(p.kind!=Kind.Buyout||uint256(p.yes)*BPS>=originalSupply*buyoutBps);}
    function queue(uint256 id) external {Proposal storage p=proposals[id];_custody();if(!successful(id)||p.eta!=0)revert InvalidGovernance();p.eta=uint48(block.timestamp+executionDelay);emit Queued(id,p.eta);}
    function cancel(uint256 id) external nonReentrant {Proposal storage p=proposals[id];if(p.proposer==address(0)||p.executed||p.cancelled)revert InvalidGovernance();bool early=msg.sender==p.proposer&&p.yes==0&&p.no==0;bool failed=block.timestamp>=p.voteEnd&&!successful(id);bool expired=block.timestamp>uint256(p.eta==0?p.voteEnd:p.eta)+EXECUTION_GRACE;if(!early&&!failed&&!expired&&!exited)revert InvalidGovernance();p.cancelled=true;_refund(id);emit Cancelled(id);}
    function execute(uint256 id) external nonReentrant {bytes memory result;_custody();Proposal storage p=proposals[id];if(!successful(id)||p.eta==0||block.timestamp<p.eta||block.timestamp>uint256(p.eta)+EXECUTION_GRACE)revert InvalidGovernance();p.executed=true;
        if(p.kind==Kind.Action){Action memory a=abi.decode(p.payload,(Action));(result,)=_run(a,false);}
        else if(p.kind==Kind.Operator){(address caller,Action memory a,uint112 budget,uint32 calls,uint48 expires)=abi.decode(p.payload,(address,Action,uint112,uint32,uint48));if(block.timestamp>=expires||a.expectedNonce!=account.actionNonce())revert StaleAction();operators[id]=Operator(caller,budget,calls,expires,false,a);}
        else if(p.kind==Kind.RevokeOperator){operators[abi.decode(p.payload,(uint256))].revoked=true;}
        else if(p.kind==Kind.TrackAsset){_track(abi.decode(p.payload,(address)));}
        else {Offer storage o=offers[id];if(o.settled||o.nonce!=account.actionNonce()||o.obligations!=obligationsRoot)revert StaleAction();o.settled=true;exited=true;redemptionPool=o.price;collection.safeTransferFrom(address(this),o.recipient,tokenId);emit BuyoutSettled(id,o.recipient,o.price);}
        emit Executed(id,keccak256(result));
    }
    function executeOperator(uint256 id) external nonReentrant {bytes memory result;_custody();Operator storage o=operators[id];if(o.caller!=msg.sender||o.revoked||o.callsRemaining==0||block.timestamp>=o.expires||o.remaining<o.action.maxInput)revert InvalidGovernance();--o.callsRemaining;uint256 spent;(result,spent)=_run(o.action,true);o.remaining-=uint112(spent);emit OperatorUsed(id,msg.sender,spent,o.callsRemaining);}
    function renounceOperator(uint256 id) external {if(operators[id].caller!=msg.sender)revert InvalidGovernance();operators[id].revoked=true;}
    function _validateAction(Action memory a) private view {if(a.target.code.length==0||a.target==address(this)||a.target==address(account)||a.target==address(collection)||tracked[a.target]||a.target==a.inputAsset||a.targetCodeHash!=a.target.codehash||a.data.length<4||a.data.length>16384||a.deadline<=block.timestamp||a.priorObligations!=obligationsRoot)revert InvalidGovernance();if(a.inputAsset==address(0)){if(a.value>a.maxInput)revert BudgetExceeded();}else if(!tracked[a.inputAsset]||a.value!=0)revert BudgetExceeded();if(a.outputAsset!=address(0)&&!tracked[a.outputAsset])revert InvalidGovernance();if(a.conditionTarget!=address(0)&&(a.conditionTarget.code.length==0||a.conditionCodeHash!=a.conditionTarget.codehash||a.conditionData.length>4096))revert InvalidGovernance();}
    function _run(Action memory a,bool repeat) private returns(bytes memory result,uint256 spent){_validateAction(a);if(a.deadline<block.timestamp||(!repeat&&a.expectedNonce!=account.actionNonce()))revert StaleAction();if(a.conditionTarget!=address(0)){(bool ok,bytes memory ret)=a.conditionTarget.staticcall(a.conditionData);if(!ok||keccak256(ret)!=a.conditionResultHash)revert StaleAction();}
        uint256 nativeBefore=address(account).balance;uint256 inputBefore=ProtocolAssets.balance(a.inputAsset,address(account));uint256 outputBefore=ProtocolAssets.balance(a.outputAsset,address(account));uint256[] memory beforeBalances=new uint256[](trackedAssets.length);for(uint256 i;i<trackedAssets.length;i++)beforeBalances[i]=ProtocolAssets.balance(trackedAssets[i],address(account));
        result=account.executeUtility(account.actionNonce(),a.deadline,a.inputAsset,a.target,a.value,a.data,a.inputAsset==address(0)?0:a.maxInput);
        uint256 inputAfter=ProtocolAssets.balance(a.inputAsset,address(account));spent=inputBefore>inputAfter?inputBefore-inputAfter:0;if(spent>a.maxInput||address(account).balance+a.value<nativeBefore)revert BudgetExceeded();
        for(uint256 i;i<trackedAssets.length;i++){uint256 afterBalance=ProtocolAssets.balance(trackedAssets[i],address(account));uint256 debit=beforeBalances[i]>afterBalance?beforeBalances[i]-afterBalance:0;if(debit>(trackedAssets[i]==a.inputAsset?a.maxInput:0))revert BudgetExceeded();}
        if(a.minOutput!=0&&ProtocolAssets.balance(a.outputAsset,address(account))<outputBefore+a.minOutput)revert BudgetExceeded();_custody();obligationsRoot=a.nextObligations;
    }
    function _track(address asset) private {if(asset==address(0)||asset.code.length==0||tracked[asset]||trackedAssets.length>=MAX_TRACKED_ASSETS)revert InvalidGovernance();ProtocolAssets.balance(asset,address(account));tracked[asset]=true;trackedAssets.push(asset);emit AssetTracked(asset);}
    function _refund(uint256 id) private {Offer storage o=offers[id];if(o.buyer!=address(0)&&!o.settled){o.settled=true;refunds[o.buyer]+=o.price;}}
    function claimRefund(address recipient) external nonReentrant {uint256 amount=refunds[msg.sender];if(amount==0)revert InvalidGovernance();refunds[msg.sender]=0;outstandingNative-=amount;ProtocolAssets.push(address(0),recipient,amount);}
    function redeem(uint256 amountShares,address recipient) external nonReentrant {if(!exited||redemptionPool==0||amountShares==0||amountShares>balanceOf(msg.sender))revert InvalidGovernance();uint256 supply=shares.totalSupply();uint256 amount=amountShares==supply?redemptionPool:redemptionPool*amountShares/supply;shares.burn(msg.sender,amountShares);redemptionPool-=amount;outstandingNative-=amount;if(amount!=0)ProtocolAssets.push(address(0),recipient,amount);emit Redeemed(msg.sender,recipient,amountShares,amount);}
    function redeemWhole(address recipient) external nonReentrant {_custody();if(balanceOf(msg.sender)!=originalSupply||recipient==address(0)||recipient==address(this)||recipient==address(account))revert InvalidGovernance();exited=true;shares.burn(msg.sender,originalSupply);collection.safeTransferFrom(address(this),recipient,tokenId);emit Redeemed(msg.sender,recipient,originalSupply,0);}
}
