// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolGuard,ProtocolAssets,IWorldLedger} from "./ProtocolPrimitives.sol";
import {GenesisToken} from "./GenesisToken.sol";
interface IGenesisMarket { function seed(address token,uint112 amount,uint256 launchId) external payable; }
import {TimeVault} from "./TimeVault.sol";

/// @notice Time-boxed pro-rata batch launches: immutable terms, refundable failure, permissionless
/// settlement, matched-price permanent liquidity, locked treasury and vested founder tokens.
/// @dev This is NOT a continuous clearing auction or a claim of Sybil/MEV resistance.
contract GenesisLaunchpad is ProtocolGuard {
    IWorldLedger public immutable ledger;
    uint256 public launchCount;
    struct Sale {
        address token;address creator;uint256 identity;uint112 supply;uint112 raised;uint112 softCap;uint112 hardCap;
        uint112 publicTokens;uint112 lpTokens;uint112 founderTokens;uint64 opens;uint64 closes;
        uint32 vesting;uint16 liquidityBps;uint8 status;uint256 room;uint256 founderLock;uint256 treasuryLock;
    }
    mapping(uint256=>Sale) private sales;
    mapping(uint256=>string) public description;
    mapping(uint256=>mapping(address=>uint256)) public contribution;
    mapping(uint256=>mapping(address=>bool)) public claimed;
    event Launched(uint256 indexed id,address indexed token,address indexed creator,uint256 identity,uint256 room,string name,string symbol);
    event Contributed(uint256 indexed id,address indexed actor,uint256 amount,bool withdrawal);
    event Settled(uint256 indexed id,bool successful,uint256 raised,uint256 founderLock,uint256 treasuryLock);
    event Claimed(uint256 indexed id,address indexed actor,uint256 amount,bool refund);
    error InvalidLaunch();error Closed();error NotSettled();error AlreadyClaimed();
    constructor(address ledger_){require(ledger_.code.length!=0,"LEDGER_REQUIRED");ledger=IWorldLedger(ledger_);}
    function create(string calldata name,string calldata symbol,string calldata about,uint112 supply,uint64 opens,uint64 closes,uint112 softCap,uint112 hardCap,uint16 founderBps,uint16 liquidityBps,uint32 vesting,uint256 identity) external nonReentrant returns(uint256 id,address token){
        if(!ledger.isSealed()) revert Unauthorized();_identity(ledger.collection(),msg.sender,identity);
        _amount(supply);_amount(softCap);_amount(hardCap);
        if(opens==0) opens=uint64(block.timestamp);
        if(supply<1e18 || softCap<1e9 || opens<block.timestamp || opens>block.timestamp+30 days || closes<uint256(opens)+1 hours || closes>uint256(opens)+30 days || softCap>hardCap || founderBps>2000 || liquidityBps<5000 || liquidityBps>10000 || vesting<30 days || vesting>1825 days || bytes(about).length>1024) revert InvalidLaunch();
        // At least half the raise seeds permanent liquidity. Tokens are split to match the final
        // contributor price and initial pool price up to integer rounding; no invented price oracle.
        uint256 founder=uint256(supply)*founderBps/10000;
        uint256 publicAllocation=(uint256(supply)-founder)*10000/(10000+liquidityBps);
        uint256 lp=uint256(supply)-founder-publicAllocation;
        token=address(new GenesisToken(name,symbol,supply,address(this)));id=++launchCount;
        uint256 room=ledger.createLaunchRoom(msg.sender,token,name);
        sales[id]=Sale(token,msg.sender,identity,supply,0,softCap,hardCap,uint112(publicAllocation),uint112(lp),uint112(founder),opens,closes,vesting,liquidityBps,1,room,0,0);
        description[id]=about;emit Launched(id,token,msg.sender,identity,room,name,symbol);
        ledger.record(1,msg.sender,identity,token,supply,id,bytes32(room));
    }
    function contribute(uint256 id,uint256 identity) external payable nonReentrant {
        _identity(ledger.collection(),msg.sender,identity);Sale storage s=sales[id];
        if(s.status!=1||block.timestamp<s.opens||block.timestamp>=s.closes) revert Closed();
        _amount(msg.value);if(uint256(s.raised)+msg.value>s.hardCap) revert InvalidAmount();
        if((contribution[id][msg.sender]+msg.value)*s.publicTokens/s.hardCap==0) revert InvalidAmount();
        s.raised+=uint112(msg.value);contribution[id][msg.sender]+=msg.value;
        emit Contributed(id,msg.sender,msg.value,false);ledger.record(2,msg.sender,identity,s.token,msg.value,id,bytes32(0));
    }
    /// @notice A participant can reduce its own bid only while the contribution window is open.
    function withdrawContribution(uint256 id,uint112 amount,uint256 identity) external nonReentrant {
        _identity(ledger.collection(),msg.sender,identity);Sale storage s=sales[id];
        if(s.status!=1||block.timestamp>=s.closes) revert Closed();_amount(amount);
        if(contribution[id][msg.sender]<amount) revert InvalidAmount();contribution[id][msg.sender]-=amount;s.raised-=amount;
        if(contribution[id][msg.sender]!=0 && contribution[id][msg.sender]*s.publicTokens/s.hardCap==0) revert InvalidAmount();
        ProtocolAssets.push(address(0),msg.sender,amount);emit Contributed(id,msg.sender,amount,true);
        ledger.record(2,msg.sender,identity,s.token,amount,id,bytes32(uint256(1)));
    }
    function settle(uint256 id) external nonReentrant {
        Sale storage s=sales[id];if(s.status!=1||block.timestamp<s.closes) revert Closed();
        bool success=s.raised>=s.softCap;s.status=success?2:3;
        if(success){
            uint256 nativeLP=uint256(s.raised)*s.liquidityBps/10000;
            uint256 treasury=uint256(s.raised)-nativeLP;
            address market=ledger.market();address vault=ledger.vault();
            ProtocolAssets.approveExact(s.token,market,s.lpTokens);
            IGenesisMarket(market).seed{value:nativeLP}(s.token,s.lpTokens,id);
            ProtocolAssets.approveExact(s.token,market,0);
            uint64 start=uint64(block.timestamp);uint64 end=start+s.vesting;
            if(s.founderTokens>0){
                ProtocolAssets.approveExact(s.token,vault,s.founderTokens);
                s.founderLock=TimeVault(vault).depositFromProtocol(s.creator,s.identity,s.token,s.founderTokens,start,start+30 days,end,true);
                ProtocolAssets.approveExact(s.token,vault,0);
            }
            if(treasury>0) s.treasuryLock=TimeVault(vault).depositFromProtocol{value:treasury}(s.creator,s.identity,address(0),uint112(treasury),start,end,end,false);
        }
        emit Settled(id,success,s.raised,s.founderLock,s.treasuryLock);
        ledger.record(3,s.creator,s.identity,s.token,s.raised,id,bytes32(uint256(success?1:0)));
    }
    function claim(uint256 id,uint256 identity) external nonReentrant returns(uint256 amount){
        _identity(ledger.collection(),msg.sender,identity);Sale storage s=sales[id];
        if(s.status!=2 && s.status!=3) revert NotSettled();
        uint256 paid=contribution[id][msg.sender];if(paid==0||claimed[id][msg.sender]) revert AlreadyClaimed();
        amount=s.status==3?paid:paid*s.publicTokens/s.raised;
        // Reject a zero allocation instead of burning the participant's ability to inspect it.
        if(amount==0) revert InvalidAmount();claimed[id][msg.sender]=true;
        ProtocolAssets.push(s.status==3?address(0):s.token,msg.sender,amount);
        emit Claimed(id,msg.sender,amount,s.status==3);
        ledger.record(4,msg.sender,identity,s.status==3?address(0):s.token,amount,id,bytes32(uint256(s.status==3?1:0)));
    }
    function launchInfo(uint256 id) external view returns(address,address,uint256,uint112,uint112,uint112,uint112,uint64,uint64,uint8,uint256){Sale storage s=sales[id];return(s.token,s.creator,s.identity,s.supply,s.raised,s.softCap,s.hardCap,s.opens,s.closes,s.status,s.room);}
    function launchAllocation(uint256 id) external view returns(uint112,uint112,uint112,uint16,uint32,uint256,uint256){Sale storage s=sales[id];return(s.publicTokens,s.lpTokens,s.founderTokens,s.liquidityBps,s.vesting,s.founderLock,s.treasuryLock);}
}
