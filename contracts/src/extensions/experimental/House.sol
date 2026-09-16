// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ExperimentalLedger} from './ExperimentalLedger.sol';
import {ProtocolAssets} from '../../protocol/ProtocolPrimitives.sol';

interface IHouseOracle {
    /// @return quoteRawPerBaseUnit Quote-token raw units per baseUnit, not USD or share count.
    function price() external view returns(uint256 quoteRawPerBaseUnit,uint64 updatedAt);
}
interface IHouseVenue {
    function swapExactIn(address input,address output,uint112 amount,uint112 minimum,address recipient,uint48 deadline) external returns(uint256 received);
}

/// @notice Isolated, lender-funded spot leverage. Each position holds its own purchased base.
/// @dev No common insurance pool, short exposure, pooled LP claims, or synthetic profit promise.
/// Loans are non-recourse: losses consume borrower equity, then lender debt. Oracle and venue
/// semantics must be reviewed independently; pinning proxy code does not pin its implementation.
contract House is ExperimentalLedger {
    address public immutable quoteAsset;address public immutable baseAsset;
    IHouseOracle public immutable oracle;IHouseVenue public immutable venue;
    bytes32 public immutable oracleCodeHash;bytes32 public immutable venueCodeHash;
    uint112 public immutable baseUnit;uint64 public immutable maxPriceAge;uint64 public immutable exitGrace;
    uint16 public immutable executionSlippageBps;uint16 public immutable maintenanceBps;
    enum Status { None, Offered, Active, Cancelled, Settled, Repaid, InKind }
    struct Terms {
        uint112 collateral;uint112 principal;uint112 debt;uint112 minimumBase;
        uint112 minimumPrice;uint112 maximumPrice;uint48 acceptBy;uint48 maturity;
    }
    struct Position {
        address borrower;address lender;Terms terms;uint112 heldBase;uint112 entryPrice;
        uint112 proceeds;uint112 debtShortfall;Status status;
    }
    mapping(uint256 => Position) private positions;uint256 public count;
    event Offered(uint256 indexed id,address indexed borrower,Terms terms);
    event Funded(uint256 indexed id,address indexed lender,uint256 base,uint256 entryPrice);
    event Closed(uint256 indexed id,Status status,uint256 lenderAmount,uint256 borrowerAmount,uint256 shortfall,address asset);
    constructor(address gate_,address quote_,address base_,address oracle_,address venue_,uint112 baseUnit_,uint64 maxAge_,uint64 grace_,uint16 slippage_,uint16 maintenance_) ExperimentalLedger(gate_) {
        if(quote_==base_||quote_.code.length==0||base_.code.length==0||oracle_.code.length==0||venue_.code.length==0||baseUnit_==0||maxAge_==0||maxAge_>7 days||grace_==0||grace_>30 days||slippage_>1000||maintenance_<10000||maintenance_>15000)revert InvalidTerms();
        quoteAsset=quote_;baseAsset=base_;oracle=IHouseOracle(oracle_);venue=IHouseVenue(venue_);oracleCodeHash=oracle_.codehash;venueCodeHash=venue_.codehash;
        baseUnit=baseUnit_;maxPriceAge=maxAge_;exitGrace=grace_;executionSlippageBps=slippage_;maintenanceBps=maintenance_;
    }
    function version() external pure returns(bytes32){return keccak256('anima/house/isolated-spot/1');}
    function position(uint256 id) external view returns(Position memory){return positions[id];}
    function freshPrice() public view returns(uint256 p){
        if(address(oracle).codehash!=oracleCodeHash)revert InvalidTerms();uint64 at;(p,at)=oracle.price();
        if(p==0||p>type(uint112).max||at==0||at>block.timestamp||block.timestamp-at>maxPriceAge)revert InvalidTerms();
    }
    function offer(Terms calldata t) external newRisk nonReentrant returns(uint256 id){
        _amount(t.collateral);_amount(t.principal);_amount(t.minimumBase);
        uint256 total=uint256(t.collateral)+t.principal;
        if(total>type(uint112).max||t.principal>uint256(t.collateral)*4||t.debt<t.principal||t.debt>total||t.minimumPrice==0||t.maximumPrice<t.minimumPrice||t.acceptBy<=block.timestamp||t.maturity<=t.acceptBy||t.maturity>block.timestamp+365 days)revert InvalidTerms();
        id=++count;Position storage p=positions[id];p.borrower=msg.sender;p.terms=t;p.status=Status.Offered;
        _pull(quoteAsset,msg.sender,t.collateral);_touch(msg.sender,'HOUSE_OFFER',abi.encode(id,t));emit Offered(id,msg.sender,t);
    }
    function cancel(uint256 id) external nonReentrant {
        Position storage p=positions[id];if(p.status!=Status.Offered||(msg.sender!=p.borrower&&block.timestamp<=p.terms.acceptBy))revert InvalidTerms();
        p.status=Status.Cancelled;_credit(p.borrower,quoteAsset,p.terms.collateral);
    }
    function fund(uint256 id,uint112 minimumBase,uint48 deadline) external newRisk nonReentrant {
        Position storage p=positions[id];if(p.status!=Status.Offered||msg.sender==p.borrower||block.timestamp>p.terms.acceptBy)revert InvalidTerms();
        uint256 price_=freshPrice();if(price_<p.terms.minimumPrice||price_>p.terms.maximumPrice)revert InvalidTerms();
        p.lender=msg.sender;p.status=Status.Active;p.entryPrice=uint112(price_);_pull(quoteAsset,msg.sender,p.terms.principal);
        uint112 amount=p.terms.collateral+p.terms.principal;
        uint256 expected=uint256(amount)*baseUnit/price_;uint256 floor_=expected*(10000-executionSlippageBps)/10000;
        if(floor_<p.terms.minimumBase)floor_=p.terms.minimumBase;if(floor_<minimumBase)floor_=minimumBase;
        uint256 received=_swap(quoteAsset,baseAsset,amount,floor_,deadline);
        if(received*price_/baseUnit*10000<=uint256(p.terms.debt)*maintenanceBps)revert InvalidTerms();
        p.heldBase=uint112(received);_touch(p.borrower,'HOUSE_OPEN',abi.encode(id,received));_touch(msg.sender,'HOUSE_LEND',abi.encode(id,p.terms.principal));emit Funded(id,msg.sender,received,price_);
    }
    /// @notice Borrower may close any time; anyone may close at maturity or maintenance breach.
    function close(uint256 id,uint112 minimumQuote,uint48 deadline) external nonReentrant {
        Position storage p=positions[id];if(p.status!=Status.Active)revert InvalidTerms();uint256 price_=freshPrice();
        uint256 value=uint256(p.heldBase)*price_/baseUnit;
        if(msg.sender!=p.borrower&&block.timestamp<p.terms.maturity&&value*10000>uint256(p.terms.debt)*maintenanceBps)revert Unauthorized();
        uint256 floor_=value*(10000-executionSlippageBps)/10000;if(floor_<minimumQuote)floor_=minimumQuote;
        p.status=Status.Settled;uint256 received=_swap(baseAsset,quoteAsset,p.heldBase,floor_,deadline);p.proceeds=uint112(received);
        uint256 lender=received<p.terms.debt?received:p.terms.debt;uint256 shortfall=p.terms.debt-lender;p.debtShortfall=uint112(shortfall);
        _credit(p.lender,quoteAsset,lender);_credit(p.borrower,quoteAsset,received-lender);emit Closed(id,Status.Settled,lender,received-lender,shortfall,quoteAsset);
    }
    /// @notice No oracle or trading route is needed to repay the fixed debt and recover all base.
    function repay(uint256 id) external nonReentrant {
        Position storage p=positions[id];if(p.status!=Status.Active||msg.sender!=p.borrower)revert InvalidTerms();
        p.status=Status.Repaid;_pull(quoteAsset,msg.sender,p.terms.debt);_credit(p.lender,quoteAsset,p.terms.debt);_credit(p.borrower,baseAsset,p.heldBase);
        emit Closed(id,Status.Repaid,p.terms.debt,p.heldBase,0,baseAsset);
    }
    /// @notice Deterministic terminal delivery after grace, even if oracle/venue permanently fails.
    /// @dev Agreed conversion is the ENTRY price, rounded UP for lender and capped by held base.
    /// This is an in-kind close, not a current valuation or promise to recover the quoted debt.
    function settleInKind(uint256 id) external nonReentrant {
        Position storage p=positions[id];if(p.status!=Status.Active||block.timestamp<uint256(p.terms.maturity)+exitGrace)revert InvalidTime();p.status=Status.InKind;
        uint256 lender=(uint256(p.terms.debt)*baseUnit+p.entryPrice-1)/p.entryPrice;if(lender>p.heldBase)lender=p.heldBase;
        _credit(p.lender,baseAsset,lender);_credit(p.borrower,baseAsset,p.heldBase-lender);emit Closed(id,Status.InKind,lender,p.heldBase-lender,0,baseAsset);
    }
    function _swap(address input,address output,uint112 amount,uint256 minimum,uint48 deadline) private returns(uint256 received){
        if(block.timestamp>deadline||address(venue).codehash!=venueCodeHash||minimum==0||minimum>type(uint112).max)revert InvalidTerms();
        uint256 beforeIn=ProtocolAssets.balance(input,address(this));uint256 beforeOut=ProtocolAssets.balance(output,address(this));
        ProtocolAssets.approveExact(input,address(venue),amount);received=venue.swapExactIn(input,output,amount,uint112(minimum),address(this),deadline);ProtocolAssets.approveExact(input,address(venue),0);
        if(received<minimum||received>type(uint112).max||ProtocolAssets.balance(input,address(this))+amount!=beforeIn||ProtocolAssets.balance(output,address(this))!=beforeOut+received)revert InvalidTerms();
        escrowed[input]-=amount;escrowed[output]+=received;
    }
}
