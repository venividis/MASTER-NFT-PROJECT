// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ExperimentalLedger} from './ExperimentalLedger.sol';

interface IWakeTask {
    /// @dev Implementations must require msg.sender == their authorized Wake deployment.
    /// No root account permission, token approval, native value or caller-selected target is sent.
    function perform(bytes32 task,address keeper,bytes calldata data) external returns(bytes32 receipt);
}
/// @notice A prepaid keeper seat with priced takeover, rational rent, and public liveness fallback.
/// @dev Self-assessed seat price is takeover compensation, not an investment redemption promise.
contract Wake is ExperimentalLedger {
    address public immutable asset;address public immutable treasury;IWakeTask public immutable taskTarget;
    bytes32 public immutable taskCodeHash;uint112 public immutable priceFloor;uint112 public immutable priceIncrement;
    uint64 public immutable duration;uint64 public immutable exclusiveGrace;
    uint32 public immutable rentNumerator;uint64 public immutable rentDenominator;
    address public holder;uint112 public seatPrice;uint48 public startsAt;uint48 public expiresAt;uint48 public accruedAt;uint48 public lastHolderWork;
    uint256 public rentRemaining;uint256 public fractionalRent;uint256 public epoch;uint256 public runCount;
    event SeatTaken(uint256 indexed epoch,address indexed holder,uint256 price,uint256 compensation,uint256 prepaidRent,uint256 expires);
    event RentAccrued(uint256 amount,uint256 fractionalRent,uint256 through);
    event SeatEnded(uint256 indexed epoch,address indexed holder,uint256 unusedRent);
    event TaskRun(uint256 indexed epoch,uint256 indexed nonce,address indexed keeper,bytes32 task,bytes32 receipt,bool publicFallback);
    constructor(address gate_,address asset_,address treasury_,address target_,uint112 floor_,uint112 increment_,uint64 duration_,uint64 grace_,uint32 numerator_,uint64 denominator_) ExperimentalLedger(gate_) {
        if(asset_.code.length==0||treasury_==address(0)||treasury_==address(this)||target_.code.length==0||floor_==0||increment_==0||duration_==0||duration_>365 days||grace_==0||grace_>duration_||numerator_==0||denominator_==0)revert InvalidTerms();
        asset=asset_;treasury=treasury_;taskTarget=IWakeTask(target_);taskCodeHash=target_.codehash;priceFloor=floor_;priceIncrement=increment_;duration=duration_;exclusiveGrace=grace_;rentNumerator=numerator_;rentDenominator=denominator_;
    }
    function version() external pure returns(bytes32){return keccak256('anima/wake/prepaid-seat/1');}
    function rentQuote(uint112 price) public view returns(uint256){return (uint256(price)*rentNumerator*duration+rentDenominator-1)/rentDenominator;}
    function takeQuote(uint112 price) public view returns(uint256 compensation,uint256 rent,uint256 total){
        bool occupied=holder!=address(0)&&block.timestamp<expiresAt;
        if(price<priceFloor||(occupied&&uint256(price)<uint256(seatPrice)+priceIncrement))revert InvalidTerms();
        compensation=occupied?seatPrice:0;rent=rentQuote(price);total=compensation+rent;if(total>type(uint112).max)revert InvalidAmount();
    }
    function take(uint112 price,uint112 maximumPayment,uint48 deadline,uint256 expectedEpoch) external newRisk nonReentrant {
        if(block.timestamp>deadline||epoch!=expectedEpoch||msg.sender==holder)revert InvalidTerms();
        (uint256 compensation,uint256 rent,uint256 payment)=takeQuote(price);if(payment>maximumPayment)revert InvalidAmount();
        address incumbent=holder;_accrue();if(incumbent!=address(0))_end();
        _pull(asset,msg.sender,payment);if(compensation!=0)_credit(incumbent,asset,compensation);
        holder=msg.sender;seatPrice=price;startsAt=uint48(block.timestamp);accruedAt=startsAt;lastHolderWork=startsAt;expiresAt=uint48(block.timestamp+duration);rentRemaining=rent;fractionalRent=0;++epoch;
        _touch(msg.sender,'WAKE_TAKE',abi.encode(epoch,price,payment,expiresAt));emit SeatTaken(epoch,msg.sender,price,compensation,rent,expiresAt);
    }
    /// @notice Views include elapsed whole rent and carry, even before a checkpoint transaction.
    function accruedRent() public view returns(uint256 whole,uint256 fraction,uint256 through){
        if(holder==address(0))return(0,0,0);through=block.timestamp<expiresAt?block.timestamp:expiresAt;
        uint256 numerator=uint256(seatPrice)*rentNumerator*(through-accruedAt)+fractionalRent;
        whole=numerator/rentDenominator;fraction=numerator%rentDenominator;
    }
    function checkpoint() external nonReentrant {_accrue();if(holder!=address(0)&&block.timestamp>=expiresAt)_end();}
    function release(uint256 expectedEpoch) external nonReentrant {
        if(msg.sender!=holder||expectedEpoch!=epoch)revert Unauthorized();_accrue();_end();
    }
    function eligibility(address keeper,uint256 expectedEpoch) public view returns(bool eligible,bool publicFallback){
        if(expectedEpoch!=epoch)return(false,false);
        publicFallback=holder==address(0)||block.timestamp>=expiresAt||block.timestamp>=uint256(lastHolderWork)+exclusiveGrace;
        eligible=publicFallback||keeper==holder;
    }
    function run(bytes32 task,bytes calldata data,uint256 expectedEpoch) external nonReentrant returns(bytes32 receipt){
        (bool allowed,bool fallback_)=eligibility(msg.sender,expectedEpoch);
        if(!allowed||task==0||data.length>16384||address(taskTarget).codehash!=taskCodeHash)revert Unauthorized();
        _accrue();if(holder!=address(0)&&block.timestamp>=expiresAt)_end();
        // A successful incumbent call renews only the short exclusive window, never lease expiry.
        if(msg.sender==holder)lastHolderWork=uint48(block.timestamp);
        uint256 n=++runCount;receipt=taskTarget.perform(task,msg.sender,data);if(receipt==0)revert InvalidTerms();
        _touch(msg.sender,'WAKE_RUN',abi.encode(epoch,n,task,receipt));emit TaskRun(epoch,n,msg.sender,task,receipt,fallback_);
    }
    function _accrue() private {
        if(holder==address(0))return;(uint256 whole,uint256 fraction,uint256 through)=accruedRent();
        accruedAt=uint48(through);fractionalRent=fraction;rentRemaining-=whole;_credit(treasury,asset,whole);emit RentAccrued(whole,fraction,through);
    }
    function _end() private {
        // Each complete lease settles its final sub-unit fraction upward once. Checkpoint
        // frequency cannot change rent. Unused prepaid whole units belong to the incumbent.
        if(fractionalRent!=0){--rentRemaining;_credit(treasury,asset,1);}
        address old=holder;uint256 refund=rentRemaining;_credit(old,asset,refund);_touch(old,'WAKE_END',abi.encode(epoch,refund));
        holder=address(0);seatPrice=0;rentRemaining=0;fractionalRent=0;startsAt=0;expiresAt=0;accruedAt=0;lastHolderWork=0;emit SeatEnded(epoch,old,refund);++epoch;
    }
}
