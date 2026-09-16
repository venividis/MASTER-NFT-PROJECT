// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolGuard,ProtocolAssets} from '../protocol/ProtocolPrimitives.sol';
import {IExperimentGate,IERC4626Operating} from './OperatingInterfaces.sol';

abstract contract ExperimentModule is ProtocolGuard {
    IExperimentGate public immutable gate;
    mapping(address=>bytes32) public accountCommitment;
    error ExperimentLocked();error InvalidTerms();
    constructor(address gate_){if(gate_.code.length==0)revert Unauthorized();gate=IExperimentGate(gate_);}
    modifier newRisk(){if(!gate.enabled(address(this)))revert ExperimentLocked();_;}
    function _touch(address a,bytes32 kind,bytes memory value) internal{accountCommitment[a]=keccak256(abi.encode(accountCommitment[a],kind,value));}
}

/// @notice Exact transfers, minimum receipts and a receiver fixed to the funding cell/caller.
/// @dev All dependencies are immutable. ERC-4626 liquidity and strategy risks remain external.
contract ReceiverPinnedStrategy is ExperimentModule {
    IERC4626Operating public immutable strategy;
    address public immutable asset;
    bytes32 public immutable strategyCodeHash;
    event Converted(address indexed account,bool deposit,uint256 assets,uint256 shares);
    constructor(address gate_,address strategy_) ExperimentModule(gate_){if(strategy_.code.length==0)revert InvalidTerms();strategy=IERC4626Operating(strategy_);asset=strategy.asset();if(asset.code.length==0)revert InvalidTerms();strategyCodeHash=strategy_.codehash;}
    function sow(uint112 assets,uint112 minimumShares,uint48 deadline) external newRisk nonReentrant returns(uint256 shares){_amount(assets);_amount(minimumShares);if(block.timestamp>deadline||address(strategy).codehash!=strategyCodeHash)revert InvalidTerms();
        ProtocolAssets.pull(asset,msg.sender,assets);uint256 beforeShares=ProtocolAssets.balance(address(strategy),msg.sender);ProtocolAssets.approveExact(asset,address(strategy),assets);shares=strategy.deposit(assets,msg.sender);ProtocolAssets.approveExact(asset,address(strategy),0);
        if(shares<minimumShares||ProtocolAssets.balance(address(strategy),msg.sender)!=beforeShares+shares)revert InvalidTerms();_touch(msg.sender,'SOW',abi.encode(assets,shares));emit Converted(msg.sender,true,assets,shares);
    }
    function reap(uint112 shares,uint112 minimumAssets,uint48 deadline) external nonReentrant returns(uint256 assets){_amount(shares);_amount(minimumAssets);if(block.timestamp>deadline||address(strategy).codehash!=strategyCodeHash)revert InvalidTerms();
        ProtocolAssets.pull(address(strategy),msg.sender,shares);uint256 beforeAssets=ProtocolAssets.balance(asset,msg.sender);assets=strategy.redeem(shares,msg.sender,address(this));
        if(assets<minimumAssets||ProtocolAssets.balance(asset,msg.sender)!=beforeAssets+assets)revert InvalidTerms();_touch(msg.sender,'REAP',abi.encode(assets,shares));emit Converted(msg.sender,false,assets,shares);
    }
}

/// @notice A fixed two-ERC20 recipe. This is NOT ERC-4626 and not an index-price oracle.
/// Deposit requirements ceil; redemption entitlements floor. Fees are zero, not hidden.
contract FixedBasket is ExperimentModule {
    string public name;string public symbol;uint8 public constant decimals=18;
    address public immutable asset0;address public immutable asset1;
    uint112 public immutable units0;uint112 public immutable units1;
    address public immutable dustBeneficiary;
    uint256 public totalSupply;uint256 public reserve0;uint256 public reserve1;
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    mapping(address=>uint256) public dust;
    event Transfer(address indexed from,address indexed to,uint256 amount);event Approval(address indexed owner,address indexed spender,uint256 amount);
    constructor(address gate_,address a0,address a1,uint112 u0,uint112 u1,address dustTo,string memory name_,string memory symbol_) ExperimentModule(gate_){if(a0>=a1||a0.code.length==0||a1.code.length==0||u0==0||u1==0||dustTo==address(0))revert InvalidTerms();asset0=a0;asset1=a1;units0=u0;units1=u1;dustBeneficiary=dustTo;name=name_;symbol=symbol_;}
    function depositQuote(uint112 shares) public view returns(uint256 a,uint256 b){_amount(shares);a=(uint256(shares)*units0+1e18-1)/1e18;b=(uint256(shares)*units1+1e18-1)/1e18;}
    function mint(uint112 shares,uint112 max0,uint112 max1,uint48 deadline) external newRisk nonReentrant{(uint256 a,uint256 b)=depositQuote(shares);if(block.timestamp>deadline||a>max0||b>max1||totalSupply+shares>type(uint112).max)revert InvalidTerms();ProtocolAssets.pull(asset0,msg.sender,a);ProtocolAssets.pull(asset1,msg.sender,b);reserve0+=a;reserve1+=b;totalSupply+=shares;balanceOf[msg.sender]+=shares;_touch(msg.sender,'BASKET_MINT',abi.encode(shares,a,b));emit Transfer(address(0),msg.sender,shares);}
    function redeem(uint112 shares,uint112 min0,uint112 min1,uint48 deadline) external nonReentrant{_amount(shares);if(block.timestamp>deadline||balanceOf[msg.sender]<shares)revert InvalidTerms();uint256 a=uint256(shares)*units0/1e18;uint256 b=uint256(shares)*units1/1e18;if(a<min0||b<min1)revert InvalidTerms();balanceOf[msg.sender]-=shares;totalSupply-=shares;reserve0-=a;reserve1-=b;
        if(totalSupply==0){dust[asset0]+=reserve0;dust[asset1]+=reserve1;_touch(dustBeneficiary,'BASKET_DUST',abi.encode(reserve0,reserve1));reserve0=0;reserve1=0;}
        _touch(msg.sender,'BASKET_BURN',abi.encode(shares,a,b));if(a!=0)ProtocolAssets.push(asset0,msg.sender,a);if(b!=0)ProtocolAssets.push(asset1,msg.sender,b);emit Transfer(msg.sender,address(0),shares);
    }
    function claimDust(address asset_) external nonReentrant{if(msg.sender!=dustBeneficiary)revert Unauthorized();uint256 n=dust[asset_];if(n==0)revert InvalidAmount();dust[asset_]=0;_touch(msg.sender,'DUST_CLAIM',abi.encode(asset_,n));ProtocolAssets.push(asset_,msg.sender,n);}
    function approve(address spender,uint256 n) external returns(bool){allowance[msg.sender][spender]=n;emit Approval(msg.sender,spender,n);return true;}
    function transfer(address to,uint256 n) external returns(bool){_move(msg.sender,to,n);return true;}
    function transferFrom(address from,address to,uint256 n) external returns(bool){uint256 approved=allowance[from][msg.sender];if(approved!=type(uint256).max){if(approved<n)revert Unauthorized();allowance[from][msg.sender]=approved-n;}_move(from,to,n);return true;}
    function _move(address from,address to,uint256 n) private{if(to==address(0)||to==address(this)||balanceOf[from]<n)revert InvalidAmount();balanceOf[from]-=n;balanceOf[to]+=n;_touch(from,'BASKET_OUT',abi.encode(to,n));_touch(to,'BASKET_IN',abi.encode(from,n));emit Transfer(from,to,n);}
}

/// @notice A bounded matched-rights primitive: no independently traded PT or YT is issued.
/// @dev Owns ERC-20 strategy shares. Recombination distributes a proportional share of
/// actual held shares, never a nominal asset amount that lets an early holder drain a loss.
contract MatchedRightsVault is ExperimentModule {
    address public immutable shareAsset;uint64 public immutable maturity;
    uint256 public totalPairs;mapping(address=>uint256) public pairsOf;
    event Paired(address indexed account,uint256 shares,uint256 pairs);event Recombined(address indexed account,uint256 pairs,uint256 shares);
    constructor(address gate_,address shares_,uint64 maturity_) ExperimentModule(gate_){if(shares_.code.length==0||maturity_<=block.timestamp||maturity_>block.timestamp+3650 days)revert InvalidTerms();shareAsset=shares_;maturity=maturity_;}
    function pair(uint112 shares,uint112 minimumPairs) external newRisk nonReentrant returns(uint256 pairs){_amount(shares);_amount(minimumPairs);if(block.timestamp>=maturity)revert InvalidTime();uint256 beforeShares=ProtocolAssets.balance(shareAsset,address(this));if(totalPairs!=0&&beforeShares==0)revert InvalidTerms();pairs=totalPairs==0?shares:uint256(shares)*totalPairs/beforeShares;if(pairs<minimumPairs||totalPairs+pairs>type(uint112).max)revert InvalidTerms();ProtocolAssets.pull(shareAsset,msg.sender,shares);totalPairs+=pairs;pairsOf[msg.sender]+=pairs;_touch(msg.sender,'PAIR',abi.encode(shares,pairs));emit Paired(msg.sender,shares,pairs);}
    function recombine(uint112 pairs,uint112 minimumShares) external nonReentrant returns(uint256 shares){_amount(pairs);if(pairsOf[msg.sender]<pairs)revert InvalidAmount();shares=ProtocolAssets.balance(shareAsset,address(this))*pairs/totalPairs;if(shares<minimumShares)revert InvalidTerms();pairsOf[msg.sender]-=pairs;totalPairs-=pairs;_touch(msg.sender,'RECOMBINE',abi.encode(pairs,shares));if(shares!=0)ProtocolAssets.push(shareAsset,msg.sender,shares);emit Recombined(msg.sender,pairs,shares);}
}
