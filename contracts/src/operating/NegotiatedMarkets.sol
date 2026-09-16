// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolAssets} from '../protocol/ProtocolPrimitives.sol';
import {ExperimentModule} from './ExperimentalAdapters.sol';
/// @notice Collateralized fixed-term credit with negotiated, non-oracle terms.
/// @dev No root-NFT custody, oracle liquidation, flash loan, or guaranteed collateral value.
contract FixedTermCredit is ExperimentModule {
    address public immutable collateralAsset;address public immutable loanAsset;
    enum Status{Missing,Offered,Active,Repaid,Cancelled,Defaulted}
    struct Loan{address borrower;address lender;uint112 collateral;uint112 principal;uint112 repayment;uint64 tenor;uint64 offerUntil;uint64 due;Status status;}
    mapping(uint256=>Loan) private loans;uint256 public count;
    mapping(address=>mapping(address=>uint256)) public claimable;
    event CreditChanged(uint256 indexed id,Status status,address indexed borrower,address indexed lender);
    constructor(address gate_,address collateral_,address loan_) ExperimentModule(gate_){if(collateral_.code.length==0||loan_.code.length==0||collateral_==loan_)revert InvalidTerms();collateralAsset=collateral_;loanAsset=loan_;}
    function request(uint112 collateral,uint112 principal,uint112 repayment,uint64 tenor) external newRisk nonReentrant returns(uint256 id){_amount(collateral);_amount(principal);_amount(repayment);if(repayment<principal||tenor==0||tenor>365 days)revert InvalidTerms();ProtocolAssets.pull(collateralAsset,msg.sender,collateral);id=++count;loans[id]=Loan(msg.sender,address(0),collateral,principal,repayment,tenor,uint64(block.timestamp+7 days),0,Status.Offered);_changed(id);}
    function fund(uint256 id) external newRisk nonReentrant{Loan storage l=loans[id];if(l.status!=Status.Offered||block.timestamp>=l.offerUntil||msg.sender==l.borrower)revert InvalidTerms();l.status=Status.Active;l.lender=msg.sender;l.due=uint64(block.timestamp)+l.tenor;ProtocolAssets.pull(loanAsset,msg.sender,l.principal);claimable[l.borrower][loanAsset]+=l.principal;_changed(id);}
    function repay(uint256 id) external nonReentrant{Loan storage l=loans[id];if(l.status!=Status.Active||msg.sender!=l.borrower||block.timestamp>=l.due)revert InvalidTerms();l.status=Status.Repaid;ProtocolAssets.pull(loanAsset,msg.sender,l.repayment);claimable[l.lender][loanAsset]+=l.repayment;claimable[l.borrower][collateralAsset]+=l.collateral;_changed(id);}
    function close(uint256 id) external nonReentrant{Loan storage l=loans[id];if(l.status==Status.Offered){if(msg.sender!=l.borrower&&block.timestamp<l.offerUntil)revert Unauthorized();l.status=Status.Cancelled;claimable[l.borrower][collateralAsset]+=l.collateral;}else if(l.status==Status.Active&&block.timestamp>=l.due){l.status=Status.Defaulted;claimable[l.lender][collateralAsset]+=l.collateral;}else revert InvalidTerms();_changed(id);}
    function withdrawFor(address recipient,address asset) external nonReentrant{uint256 n=claimable[recipient][asset];if(n==0)revert InvalidAmount();claimable[recipient][asset]=0;_touch(recipient,'CREDIT_WITHDRAW',abi.encode(asset,n));ProtocolAssets.push(asset,recipient,n);}
    function _changed(uint256 id) private{Loan storage l=loans[id];bytes memory data=abi.encode(id,l);_touch(l.borrower,'CREDIT',data);if(l.lender!=address(0))_touch(l.lender,'CREDIT',data);emit CreditChanged(id,l.status,l.borrower,l.lender);}
    function loan(uint256 id) external view returns(Loan memory){return loans[id];}
}

/// @notice Physically settled covered calls. No oracle, margining or naked exposure.
contract CoveredCallBook is ExperimentModule {
    address public immutable underlying;address public immutable quote;
    enum Status{Missing,Offered,Active,Exercised,Closed}
    struct Option{address writer;address buyer;uint112 cover;uint112 strike;uint112 premium;uint64 expiry;Status status;}
    mapping(uint256=>Option) private options;uint256 public count;
    mapping(address=>mapping(address=>uint256)) public claimable;
    event OptionChanged(uint256 indexed id,Status status,address indexed writer,address indexed buyer);
    constructor(address gate_,address underlying_,address quote_) ExperimentModule(gate_){if(underlying_.code.length==0||quote_.code.length==0||underlying_==quote_)revert InvalidTerms();underlying=underlying_;quote=quote_;}
    function write(uint112 cover,uint112 strike,uint112 premium,uint64 expiry) external newRisk nonReentrant returns(uint256 id){_amount(cover);_amount(strike);_amount(premium);if(expiry<=block.timestamp||expiry>block.timestamp+365 days)revert InvalidTerms();ProtocolAssets.pull(underlying,msg.sender,cover);id=++count;options[id]=Option(msg.sender,address(0),cover,strike,premium,expiry,Status.Offered);_changed(id);}
    function take(uint256 id) external newRisk nonReentrant{Option storage o=options[id];if(o.status!=Status.Offered||msg.sender==o.writer||block.timestamp>=o.expiry)revert InvalidTerms();o.status=Status.Active;o.buyer=msg.sender;ProtocolAssets.pull(quote,msg.sender,o.premium);claimable[o.writer][quote]+=o.premium;_changed(id);}
    function exercise(uint256 id) external nonReentrant{Option storage o=options[id];if(o.status!=Status.Active||msg.sender!=o.buyer||block.timestamp>=o.expiry)revert InvalidTerms();o.status=Status.Exercised;ProtocolAssets.pull(quote,msg.sender,o.strike);claimable[o.writer][quote]+=o.strike;claimable[o.buyer][underlying]+=o.cover;_changed(id);}
    function close(uint256 id) external nonReentrant{Option storage o=options[id];if(o.status!=Status.Offered&&o.status!=Status.Active)revert InvalidTerms();if(block.timestamp<o.expiry&&(o.status!=Status.Offered||msg.sender!=o.writer))revert Unauthorized();o.status=Status.Closed;claimable[o.writer][underlying]+=o.cover;_changed(id);}
    function withdrawFor(address recipient,address asset) external nonReentrant{uint256 n=claimable[recipient][asset];if(n==0)revert InvalidAmount();claimable[recipient][asset]=0;_touch(recipient,'OPTION_WITHDRAW',abi.encode(asset,n));ProtocolAssets.push(asset,recipient,n);}
    function _changed(uint256 id) private{Option storage o=options[id];bytes memory data=abi.encode(id,o);_touch(o.writer,'OPTION',data);if(o.buyer!=address(0))_touch(o.buyer,'OPTION',data);emit OptionChanged(id,o.status,o.writer,o.buyer);}
    function option(uint256 id) external view returns(Option memory){return options[id];}
}
