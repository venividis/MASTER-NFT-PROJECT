// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolAssets, ProtocolGuard} from "../../protocol/ProtocolPrimitives.sol";

/// @notice Funded, bounded quadratic matching with a frozen, explicitly trusted identity registry.
/// @dev A registry entry is an attestation, not a mathematical proof of one human. No claim of permissionless Sybil resistance.
contract PublicGoodsMatching is ProtocolGuard {
    struct Project {address recipient;uint112 contributions;uint256 rootSum;uint256 matchAmount;bool claimed;}
    address public immutable sponsor;
    address public immutable registrar;
    bytes32 public immutable identityPolicyHash;
    uint64 public immutable startTime;
    uint64 public immutable endTime;
    uint112 public immutable budget;
    uint112 public immutable perPersonCap;
    uint112 public totalContributions;
    uint256 public sponsorRefund;
    uint256 public outstandingNative;
    bool public finalized;
    bool public cancelled;
    uint16 public identityCount;
    Project[] public projects;
    mapping(address=>bytes32) public identityOf;
    mapping(bytes32=>address) public walletOf;
    mapping(address=>uint256) public personTotal;
    mapping(uint256=>mapping(address=>uint112)) public contributionOf;
    event IdentityRegistered(address indexed wallet,bytes32 indexed identity);
    event Contributed(uint256 indexed project,address indexed person,uint256 amount);
    event Finalized(uint256 distributedMatch,uint256 sponsorRefund);
    event Cancelled();
    error InvalidRound();
    constructor(address registrar_,bytes32 identityPolicyHash_,address[] memory recipients,uint64 startTime_,uint64 endTime_,uint112 perPersonCap_) payable {
        if(registrar_==address(0)||identityPolicyHash_==0||recipients.length==0||recipients.length>32||startTime_<=block.timestamp||endTime_<=startTime_||endTime_-startTime_>365 days||perPersonCap_==0||msg.value==0||msg.value>type(uint112).max)revert InvalidRound();
        sponsor=msg.sender;registrar=registrar_;identityPolicyHash=identityPolicyHash_;startTime=startTime_;endTime=endTime_;budget=uint112(msg.value);perPersonCap=perPersonCap_;outstandingNative=msg.value;
        for(uint256 i;i<recipients.length;++i){if(recipients[i]==address(0)||recipients[i]==address(this))revert InvalidRound();for(uint256 j;j<i;++j)if(recipients[j]==recipients[i])revert InvalidRound();projects.push(Project(recipients[i],0,0,0,false));}
    }
    function projectCount() external view returns(uint256){return projects.length;}
    function registerIdentity(address wallet,bytes32 identity) external {
        if(msg.sender!=registrar||block.timestamp>=startTime||cancelled||wallet==address(0)||identity==0||identityOf[wallet]!=0||walletOf[identity]!=address(0)||identityCount>=256)revert InvalidRound();
        identityOf[wallet]=identity;walletOf[identity]=wallet;++identityCount;emit IdentityRegistered(wallet,identity);
    }
    function contribute(uint256 project) external payable nonReentrant {
        if(cancelled||finalized||block.timestamp<startTime||block.timestamp>=endTime||project>=projects.length||identityOf[msg.sender]==0||msg.value==0||msg.value>type(uint112).max||uint256(totalContributions)+msg.value>type(uint112).max||personTotal[msg.sender]+msg.value>perPersonCap)revert InvalidRound();
        Project storage p=projects[project];uint256 previous=contributionOf[project][msg.sender];uint256 next=previous+msg.value;
        // Sum square roots of cumulative person contributions; splitting into transactions gains no match.
        p.rootSum=p.rootSum-_sqrt(previous*1e18)+_sqrt(next*1e18);p.contributions+=uint112(msg.value);contributionOf[project][msg.sender]=uint112(next);
        totalContributions+=uint112(msg.value);personTotal[msg.sender]+=msg.value;outstandingNative+=msg.value;emit Contributed(project,msg.sender,msg.value);
    }
    function withdrawContribution(uint256 project,address recipient) external nonReentrant {
        if(project>=projects.length||finalized||(!cancelled&&block.timestamp>=endTime))revert InvalidRound();
        uint256 amount=contributionOf[project][msg.sender];if(amount==0)revert InvalidAmount();
        Project storage p=projects[project];p.rootSum-=_sqrt(amount*1e18);p.contributions-=uint112(amount);contributionOf[project][msg.sender]=0;personTotal[msg.sender]-=amount;totalContributions-=uint112(amount);outstandingNative-=amount;ProtocolAssets.push(address(0),recipient,amount);
    }
    function cancel() external {
        if(msg.sender!=sponsor||cancelled||finalized||block.timestamp>=endTime)revert InvalidRound();cancelled=true;sponsorRefund=budget;emit Cancelled();
    }
    function score(uint256 project) public view returns(uint256){Project storage p=projects[project];uint256 square=p.rootSum*p.rootSum/1e18;return square>p.contributions?square-p.contributions:0;}
    function finalize() external {
        if(cancelled||finalized||block.timestamp<endTime)revert InvalidRound();finalized=true;
        uint256 totalScore;for(uint256 i;i<projects.length;++i)totalScore+=score(i);
        uint256 allocated;
        if(totalScore!=0)for(uint256 i;i<projects.length;++i){uint256 amount=uint256(budget)*score(i)/totalScore;projects[i].matchAmount=amount;allocated+=amount;}
        sponsorRefund=uint256(budget)-allocated;emit Finalized(allocated,sponsorRefund);
    }
    function claimProject(uint256 project) external nonReentrant {
        if(!finalized||project>=projects.length)revert InvalidRound();Project storage p=projects[project];if(p.claimed)revert InvalidRound();p.claimed=true;uint256 amount=uint256(p.contributions)+p.matchAmount;
        if(amount!=0){outstandingNative-=amount;ProtocolAssets.push(address(0),p.recipient,amount);}
    }
    function claimSponsorRefund(address recipient) external nonReentrant {
        if(msg.sender!=sponsor||(!cancelled&&!finalized)||sponsorRefund==0)revert InvalidRound();uint256 amount=sponsorRefund;sponsorRefund=0;outstandingNative-=amount;ProtocolAssets.push(address(0),recipient,amount);
    }
    function _sqrt(uint256 x) internal pure returns(uint256 z){if(x==0)return 0;z=x;uint256 y=x/2+1;while(y<z){z=y;y=(x/y+y)/2;}}
}
