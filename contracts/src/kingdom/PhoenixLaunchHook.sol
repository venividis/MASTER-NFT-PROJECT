// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {PoolKey,SwapParams,ModifyLiquidityParams,V4Boundary} from "./V4Boundary.sol";

/// @notice A narrow v4 launch hook: committed initialization, immutable time-based LP fee,
///         permanent seed-position principal lock, and non-attributed economic observations.
/// @dev No custody, arbitrary call, oracle, hook tax, return-delta, admin fee setter, or chat call.
///      Source is experimental. A matching address AND a real PoolManager are required.
contract PhoenixLaunchHook {
    address public immutable poolManager;
    address public immutable market;
    uint24 public constant START_FEE=10000; // hundredths of a basis point: 1.00%
    uint24 public constant END_FEE=3000;    // 0.30%, NOT a 3,000-basis-point fee
    uint64 public constant RAMP=1 days;
    struct Covenant {uint64 born; uint160 initialSqrtPriceX96; bytes32 launchManifest;}
    mapping(bytes32=>Covenant) public covenant;
    mapping(bytes32=>uint256) public observations;
    mapping(bytes32=>bytes32) public economicRoot;
    event PoolCommitted(bytes32 indexed poolId,uint64 born,uint160 sqrtPriceX96,bytes32 manifest);
    event EconomicObservation(bytes32 indexed poolId,address indexed router,uint256 indexed sequence,int128 amount0,int128 amount1,uint24 lpFee,bytes32 root);
    error Unauthorized(); error WrongAddressFlags(); error UnregisteredPool(); error CovenantMismatch(); error SeedPrincipalLocked();
    constructor(address manager_,address market_){
        if(manager_.code.length==0||market_.code.length==0) revert Unauthorized();
        if((uint160(address(this))&V4Boundary.ADDRESS_MASK)!=V4Boundary.HOOK_FLAGS) revert WrongAddressFlags();
        poolManager=manager_;market=market_;
    }
    modifier onlyManager(){if(msg.sender!=poolManager) revert Unauthorized();_;}
    function requiredAddressFlags() external pure returns(uint160){return V4Boundary.HOOK_FLAGS;}
    function register(PoolKey calldata key,uint160 price,bytes32 manifest) external {
        if(msg.sender!=market) revert Unauthorized();
        if(key.currency0!=address(0)||key.currency1==address(0)||key.hooks!=address(this)||key.fee!=V4Boundary.DYNAMIC_FEE||key.tickSpacing!=60||price==0||manifest==bytes32(0)) revert CovenantMismatch();
        bytes32 id=V4Boundary.id(key);if(covenant[id].born!=0) revert CovenantMismatch();
        covenant[id]=Covenant(uint64(block.timestamp),price,manifest);
        emit PoolCommitted(id,uint64(block.timestamp),price,manifest);
    }
    function feeAt(bytes32 id,uint256 timestamp) public view returns(uint24){
        uint64 born=covenant[id].born;if(born==0) revert UnregisteredPool();
        if(timestamp<=born) return START_FEE;
        if(timestamp>=uint256(born)+RAMP) return END_FEE;
        return uint24(START_FEE-(uint256(START_FEE-END_FEE)*(timestamp-born)/RAMP));
    }
    function beforeInitialize(address sender,PoolKey calldata key,uint160 price) external onlyManager returns(bytes4){
        Covenant memory c=covenant[V4Boundary.id(key)];
        if(sender!=market||c.born==0||price!=c.initialSqrtPriceX96) revert CovenantMismatch();
        return this.beforeInitialize.selector;
    }
    function beforeRemoveLiquidity(address sender,PoolKey calldata,ModifyLiquidityParams calldata params,bytes calldata) external onlyManager returns(bytes4){
        // Other LPs retain their own withdrawal rights. Only the seed adapter is locked.
        // v4 also routes zero-delta fee pokes through beforeRemoveLiquidity.
        // Block negative principal deltas only; otherwise fee harvesting would be bricked.
        if(sender==market&&params.liquidityDelta<0) revert SeedPrincipalLocked();
        return this.beforeRemoveLiquidity.selector;
    }
    function beforeSwap(address,PoolKey calldata key,SwapParams calldata,bytes calldata) external onlyManager returns(bytes4,int256,uint24){
        return(this.beforeSwap.selector,0,feeAt(V4Boundary.id(key),block.timestamp)|V4Boundary.OVERRIDE_FEE);
    }
    function afterSwap(address sender,PoolKey calldata key,SwapParams calldata,int256 delta,bytes calldata) external onlyManager returns(bytes4,int128){
        bytes32 id=V4Boundary.id(key);uint24 fee=feeAt(id,block.timestamp);uint256 seq=++observations[id];
        bytes32 root=keccak256(abi.encode(economicRoot[id],id,seq,delta,fee,block.number));economicRoot[id]=root;
        // sender is a ROUTER, never assumed to be the end user. hookData is ignored.
        emit EconomicObservation(id,sender,seq,V4Boundary.amount0(delta),V4Boundary.amount1(delta),fee,root);
        return(this.afterSwap.selector,0);
    }
}
