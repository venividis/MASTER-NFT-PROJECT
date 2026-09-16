// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ExperimentalLedger} from './ExperimentalLedger.sol';

/// @notice A matched binary outcome book: fixed stakes, transferable claims, bonded dispute.
/// @dev Resolver/arbiter are named trusted authorities, not an objective truth proof.
/// All outcomes and timeouts credit pull balances; claims never expire or escheat.
contract Wager is ExperimentalLedger {
    address public immutable asset;
    enum Status {None, Offered, Matched, Proposed, Challenged, Resolved, Voided, Cancelled}
    struct Terms {
        bytes32 question;bytes32 source;address resolver;address arbiter;
        uint112 makerStake;uint112 takerStake;uint112 bond;
        uint48 acceptBy;uint48 closeAt;uint48 proposeBy;uint48 arbitrateBy;uint32 challengeSeconds;bool makerYes;
    }
    struct Market {
        Terms terms;address maker;address taker;address challenger;
        uint48 proposedAt;bool proposedYes;bool finalYes;Status status;bytes32 evidence;
    }
    struct SideOffer {address seller;address buyer;uint112 price;}
    mapping(uint256=>Market) private markets;uint256 public count;
    mapping(uint256=>mapping(bool=>SideOffer)) public sideOffers;
    event Created(uint256 indexed id,address indexed maker,Terms terms);
    event Matched(uint256 indexed id,address indexed taker);
    event Proposed(uint256 indexed id,bool yes,bytes32 evidence,uint256 challengeUntil);
    event Challenged(uint256 indexed id,address indexed challenger,bytes32 evidence);
    event Settled(uint256 indexed id,Status status,bool yes);
    event SideTransferred(uint256 indexed id,bool makerSide,address indexed from,address indexed to);
    event SideOffered(uint256 indexed id,bool makerSide,address seller,address buyer,uint256 price);
    constructor(address gate_,address asset_) ExperimentalLedger(gate_){if(asset_.code.length==0)revert InvalidTerms();asset=asset_;}
    function version() external pure returns(bytes32){return keccak256('anima/wager/matched-binary/1');}
    function market(uint256 id) external view returns(Market memory){return markets[id];}
    function create(Terms calldata t) external newRisk nonReentrant returns(uint256 id){
        _amount(t.makerStake);_amount(t.takerStake);_amount(t.bond);
        if(t.question==0||t.source==0||t.resolver==address(0)||t.arbiter==address(0)||t.resolver==t.arbiter||t.acceptBy<=block.timestamp||t.closeAt<=t.acceptBy||t.proposeBy<=t.closeAt||t.challengeSeconds==0||uint256(t.proposeBy)+t.challengeSeconds>=t.arbitrateBy||t.arbitrateBy>block.timestamp+365 days)revert InvalidTerms();
        id=++count;Market storage m=markets[id];m.terms=t;m.maker=msg.sender;m.status=Status.Offered;
        _pull(asset,msg.sender,t.makerStake);_touch(msg.sender,'WAGER_CREATE',abi.encode(id,t));emit Created(id,msg.sender,t);
    }
    function accept(uint256 id) external newRisk nonReentrant {
        Market storage m=markets[id];if(m.status!=Status.Offered||block.timestamp>=m.terms.acceptBy||msg.sender==m.maker)revert InvalidTerms();
        m.taker=msg.sender;m.status=Status.Matched;_pull(asset,msg.sender,m.terms.takerStake);_touch(msg.sender,'WAGER_ACCEPT',abi.encode(id));emit Matched(id,msg.sender);
    }
    /// @notice Transfers exactly one funded side and its refund rights, with no extra payment.
    function transferSide(uint256 id,bool makerSide,address to) external newRisk nonReentrant {
        Market storage m=markets[id];if(m.status!=Status.Matched||block.timestamp>=m.terms.closeAt||to==address(0)||to==address(this)||to==m.maker||to==m.taker)revert InvalidTerms();
        address from=makerSide?m.maker:m.taker;if(msg.sender!=from)revert Unauthorized();
        delete sideOffers[id][makerSide];if(makerSide)m.maker=to;else m.taker=to;
        _touch(from,'WAGER_SIDE_OUT',abi.encode(id,makerSide,to));_touch(to,'WAGER_SIDE_IN',abi.encode(id,makerSide,from));emit SideTransferred(id,makerSide,from,to);
    }
    function offerSide(uint256 id,bool makerSide,uint112 price,address buyer) external newRisk nonReentrant {
        Market storage m=markets[id];if(m.status!=Status.Matched||block.timestamp>=m.terms.closeAt||msg.sender!=(makerSide?m.maker:m.taker)||buyer==address(this))revert InvalidTerms();_amount(price);
        sideOffers[id][makerSide]=SideOffer(msg.sender,buyer,price);emit SideOffered(id,makerSide,msg.sender,buyer,price);
    }
    function cancelSideOffer(uint256 id,bool makerSide) external nonReentrant {
        if(sideOffers[id][makerSide].seller!=msg.sender)revert Unauthorized();delete sideOffers[id][makerSide];
    }
    function buySide(uint256 id,bool makerSide,uint112 expectedPrice,address expectedSeller) external newRisk nonReentrant {
        Market storage m=markets[id];SideOffer memory o=sideOffers[id][makerSide];
        if(m.status!=Status.Matched||block.timestamp>=m.terms.closeAt||o.price==0||o.price!=expectedPrice||o.seller!=expectedSeller||o.seller!=(makerSide?m.maker:m.taker)||(o.buyer!=address(0)&&o.buyer!=msg.sender)||msg.sender==m.maker||msg.sender==m.taker)revert InvalidTerms();
        delete sideOffers[id][makerSide];if(makerSide)m.maker=msg.sender;else m.taker=msg.sender;
        _pull(asset,msg.sender,o.price);_credit(o.seller,asset,o.price);_touch(o.seller,'WAGER_SIDE_SOLD',abi.encode(id,makerSide,msg.sender,o.price));_touch(msg.sender,'WAGER_SIDE_BOUGHT',abi.encode(id,makerSide,o.seller,o.price));emit SideTransferred(id,makerSide,o.seller,msg.sender);
    }
    function cancel(uint256 id) external nonReentrant {
        Market storage m=markets[id];if(m.status!=Status.Offered||(msg.sender!=m.maker&&block.timestamp<m.terms.acceptBy))revert InvalidTerms();
        m.status=Status.Cancelled;_credit(m.maker,asset,m.terms.makerStake);emit Settled(id,Status.Cancelled,false);
    }
    function propose(uint256 id,bool yes,bytes32 evidence) external nonReentrant {
        Market storage m=markets[id];if(m.status!=Status.Matched||msg.sender!=m.terms.resolver||block.timestamp<m.terms.closeAt||block.timestamp>=m.terms.proposeBy||evidence==0)revert InvalidTerms();
        m.status=Status.Proposed;m.proposedYes=yes;m.proposedAt=uint48(block.timestamp);m.evidence=evidence;_pull(asset,msg.sender,m.terms.bond);
        emit Proposed(id,yes,evidence,block.timestamp+m.terms.challengeSeconds);
    }
    function challenge(uint256 id,bytes32 evidence) external nonReentrant {
        Market storage m=markets[id];if(m.status!=Status.Proposed||(msg.sender!=m.maker&&msg.sender!=m.taker)||block.timestamp>=uint256(m.proposedAt)+m.terms.challengeSeconds||evidence==0)revert InvalidTerms();
        m.challenger=msg.sender;m.status=Status.Challenged;_pull(asset,msg.sender,m.terms.bond);emit Challenged(id,msg.sender,evidence);
    }
    function finalize(uint256 id) external nonReentrant {
        Market storage m=markets[id];if(m.status!=Status.Proposed||block.timestamp<uint256(m.proposedAt)+m.terms.challengeSeconds)revert InvalidTime();
        _credit(m.terms.resolver,asset,m.terms.bond);_resolve(id,m,m.proposedYes);
    }
    /// @param outcome 0 = NO, 1 = YES, 2 = invalid/refund. Authority ends strictly at arbitrateBy.
    function arbitrate(uint256 id,uint8 outcome,bytes32 evidence) external nonReentrant {
        Market storage m=markets[id];if(m.status!=Status.Challenged||msg.sender!=m.terms.arbiter||block.timestamp>=m.terms.arbitrateBy||outcome>2||evidence==0)revert InvalidTerms();m.evidence=evidence;
        if(outcome==2){_returnBonds(m);_void(id,m);}else{
            bool yes=outcome==1;_credit(yes==m.proposedYes?m.terms.resolver:m.challenger,asset,uint256(m.terms.bond)*2);_resolve(id,m,yes);
        }
    }
    /// @notice No resolver at proposeBy, or no arbiter at arbitrateBy, returns original stakes.
    function voidExpired(uint256 id) external nonReentrant {
        Market storage m=markets[id];if(m.status==Status.Matched&&block.timestamp>=m.terms.proposeBy){_void(id,m);return;}
        if(m.status==Status.Challenged&&block.timestamp>=m.terms.arbitrateBy){_returnBonds(m);_void(id,m);return;}revert InvalidTime();
    }
    function _resolve(uint256 id,Market storage m,bool yes) private {
        m.status=Status.Resolved;m.finalYes=yes;_credit(yes==m.terms.makerYes?m.maker:m.taker,asset,uint256(m.terms.makerStake)+m.terms.takerStake);emit Settled(id,Status.Resolved,yes);
    }
    function _returnBonds(Market storage m) private {_credit(m.terms.resolver,asset,m.terms.bond);_credit(m.challenger,asset,m.terms.bond);}
    function _void(uint256 id,Market storage m) private {
        m.status=Status.Voided;_credit(m.maker,asset,m.terms.makerStake);_credit(m.taker,asset,m.terms.takerStake);emit Settled(id,Status.Voided,false);
    }
}
