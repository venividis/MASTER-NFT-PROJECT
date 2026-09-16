// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ProtocolGuard,ProtocolAssets,IWorldLedger} from "../protocol/ProtocolPrimitives.sol";
import {TimeVault} from "../protocol/TimeVault.sol";
import {IV4PoolManager,PoolKey,SwapParams,ModifyLiquidityParams,V4Boundary} from "./V4Boundary.sol";
import {PhoenixLaunchHook} from "./PhoenixLaunchHook.sol";
interface ILaunchRead {
    function launchInfo(uint256 id) external view returns(address,address,uint256,uint112,uint112,uint112,uint112,uint64,uint64,uint8,uint256);
}

/// @notice Actual v4 PoolManager integration source; not a renamed constant-product AMM.
/// @dev ONLY this launchpad's native/ERC20 pairs; exact input must fill completely or revert.
/// Seed principal and rounding dust have no withdrawal path. Earned LP fees can be harvested
/// permissionlessly to the launch creator (the NFT account when launched through that account).
/// No arbitrary routes, custom hookData, aggregator, oracle price, or best-execution claim.
contract V4GenesisMarket is ProtocolGuard {
    IV4PoolManager public immutable manager;
    IWorldLedger public immutable ledger;
    address private immutable installer;
    PhoenixLaunchHook public hook;
    uint160 private constant MIN_PRICE=4295128740;
    uint160 private constant MAX_PRICE=1461446703485210103287273052203988822378723970341;
    uint256 private constant Q96=1<<96;
    struct Pool {uint128 liquidity;uint64 born;uint256 launchId;address beneficiary;uint112 nativeDust;uint112 tokenDust;}
    mapping(address=>Pool) public pools;
    address[] private tokens;
    bytes32 private callbackCommitment;
    bool private callbackUsed;
    event MarketSeeded(address indexed token,uint256 indexed launchId,bytes32 indexed poolId,uint128 liquidity,uint160 sqrtPriceX96,uint256 nativeDust,uint256 tokenDust);
    event Swapped(address indexed actor,address indexed tokenIn,address indexed tokenOut,uint256 identity,uint256 amountIn,uint256 amountOut,uint256 vaultLock);
    event FeesHarvested(address indexed token,address indexed beneficiary,uint256 nativeAmount,uint256 tokenAmount);
    error InvalidPool();error CallbackRejected();error Slippage();error PartialFill();error Expired();
    constructor(address ledger_,address manager_){
        require(ledger_.code.length!=0&&manager_.code.length!=0,"CONTRACTS_REQUIRED");
        ledger=IWorldLedger(ledger_);manager=IV4PoolManager(manager_);installer=msg.sender;
    }
    function installHook(address hook_) external {
        if(msg.sender!=installer||address(hook)!=address(0)||ledger.isSealed()||hook_.code.length==0) revert Unauthorized();
        PhoenixLaunchHook h=PhoenixLaunchHook(hook_);
        if(h.market()!=address(this)||h.poolManager()!=address(manager)) revert Unauthorized();hook=h;
    }
    function keyFor(address token) public view returns(PoolKey memory){return PoolKey(address(0),token,V4Boundary.DYNAMIC_FEE,60,address(hook));}
    function version() external pure returns(bytes32){return keccak256("idfbi/phoenix-v4-market/1.4");}
    function seed(address token,uint112 amount,uint256 launchId) external payable nonReentrant {
        if(!ledger.isSealed()||msg.sender!=ledger.launchpad()||address(hook)==address(0)||pools[token].born!=0) revert Unauthorized();
        _amount(amount);_amount(msg.value);
        (address launched,address creator,,,,,,,,,)=ILaunchRead(msg.sender).launchInfo(launchId);
        if(launched!=token||creator==address(0)) revert InvalidPool();
        // Explicitly bounded raw-unit ratio, independent of displayed token decimals.
        if(uint256(amount)>msg.value*1e12||msg.value>uint256(amount)*1e12) revert InvalidAmount();
        ProtocolAssets.pull(token,msg.sender,amount);
        // Q64.64 integer sqrt converted to Q64.96. No floating-point onchain computation.
        uint160 price=uint160(_sqrt((uint256(amount)<<128)/msg.value)<<32);
        if(price<=MIN_PRICE||price>=MAX_PRICE) revert InvalidPool();
        // Conservative full-range liquidity: omitting the finite-bound correction UNDERfills,
        // never overdraws either budget. The tiny remainder is explicitly locked as seed dust.
        uint256 l0=msg.value*price/Q96; uint256 l1=uint256(amount)*Q96/price;
        uint256 l=l0<l1?l0:l1;
        if(l==0||l>uint256(uint128(type(int128).max))) revert InvalidAmount();
        pools[token]=Pool(uint128(l),uint64(block.timestamp),launchId,creator,0,0);tokens.push(token);
        PoolKey memory key=keyFor(token);
        bytes32 manifest=keccak256(abi.encode(block.chainid,address(this),msg.sender,launchId,token,creator,msg.value,amount,l));
        hook.register(key,price,manifest);manager.initialize(key,price);
        bytes memory result=_unlock(abi.encode(uint8(0),token,address(0),uint256(amount),msg.value));
        (uint256 spent0,uint256 spent1)=abi.decode(result,(uint256,uint256));
        pools[token].nativeDust=uint112(msg.value-spent0);pools[token].tokenDust=uint112(uint256(amount)-spent1);
        emit MarketSeeded(token,launchId,V4Boundary.id(key),uint128(l),price,msg.value-spent0,uint256(amount)-spent1);
    }
    function swap(address tokenIn,address tokenOut,uint112 amount,uint112 minOut,uint48 deadline,uint256 identity,uint64 lockUntil) external payable nonReentrant returns(uint256 output,uint256 lockId){
        if(!ledger.isSealed()) revert Unauthorized();_identity(ledger.collection(),msg.sender,identity);
        if(block.timestamp>deadline) revert Expired();if(tokenIn==tokenOut) revert InvalidPool();_amount(amount);_amount(minOut);
        if(tokenIn==address(0)){if(msg.value!=amount) revert InvalidAmount();}
        else {if(msg.value!=0) revert InvalidAmount();ProtocolAssets.pull(tokenIn,msg.sender,amount);}
        output=abi.decode(_unlock(abi.encode(uint8(1),tokenIn,tokenOut,uint256(amount),uint256(0))),(uint256));
        if(output<minOut) revert Slippage();_amount(output);
        if(lockUntil!=0){
            if(lockUntil<=block.timestamp) revert InvalidTime();address target=ledger.vault();
            if(tokenOut!=address(0)) ProtocolAssets.approveExact(tokenOut,target,output);
            lockId=TimeVault(target).depositFromProtocol{value:tokenOut==address(0)?output:0}(msg.sender,identity,tokenOut,uint112(output),uint64(block.timestamp),lockUntil,lockUntil,false);
            if(tokenOut!=address(0)) ProtocolAssets.approveExact(tokenOut,target,0);
        }else ProtocolAssets.push(tokenOut,msg.sender,output);
        emit Swapped(msg.sender,tokenIn,tokenOut,identity,amount,output,lockId);
        // Attribution is made HERE from the authenticated router caller, never hookData.
        ledger.record(5,msg.sender,identity,tokenOut,output,uint256(uint160(tokenIn)),bytes32(uint256(amount)));
    }
    function harvest(address token) external nonReentrant returns(uint256 nativeFee,uint256 tokenFee){
        (nativeFee,tokenFee)=abi.decode(_unlock(abi.encode(uint8(2),token,address(0),uint256(0),uint256(0))),(uint256,uint256));
        address beneficiary=pools[token].beneficiary;
        if(nativeFee!=0) ProtocolAssets.push(address(0),beneficiary,nativeFee);
        if(tokenFee!=0) ProtocolAssets.push(token,beneficiary,tokenFee);
        emit FeesHarvested(token,beneficiary,nativeFee,tokenFee);
    }
    function _unlock(bytes memory data) private returns(bytes memory result){
        if(callbackCommitment!=bytes32(0)) revert CallbackRejected();
        callbackCommitment=keccak256(data);callbackUsed=false;result=manager.unlock(data);
        if(!callbackUsed) revert CallbackRejected();callbackCommitment=bytes32(0);
    }
    function unlockCallback(bytes calldata data) external returns(bytes memory){
        if(msg.sender!=address(manager)||callbackCommitment==bytes32(0)||keccak256(data)!=callbackCommitment||callbackUsed) revert CallbackRejected();callbackUsed=true;
        (uint8 op,address a,address b,uint256 amount,uint256 nativeBudget)=abi.decode(data,(uint8,address,address,uint256,uint256));
        if(op==0){
            Pool memory p=pools[a];
            (int256 delta,)=manager.modifyLiquidity(keyFor(a),ModifyLiquidityParams(-887220,887220,int256(uint256(p.liquidity)),bytes32(p.launchId)),"");
            int128 d0=V4Boundary.amount0(delta); int128 d1=V4Boundary.amount1(delta);
            if(d0>=0||d1>=0) revert InvalidAmount();uint256 n0=uint256(-int256(d0)); uint256 n1=uint256(-int256(d1));
            if(n0>nativeBudget||n1>amount) revert InvalidAmount();_settle(address(0),n0);_settle(a,n1);return abi.encode(n0,n1);
        }
        if(op==1){
            uint256 output=a==address(0)?_hop(b,true,amount):b==address(0)?_hop(a,false,amount):_hop(b,true,_hop(a,false,amount));return abi.encode(output);
        }
        if(op==2){
            Pool memory p=pools[a];if(p.born==0) revert InvalidPool();
            (int256 delta,)=manager.modifyLiquidity(keyFor(a),ModifyLiquidityParams(-887220,887220,0,bytes32(p.launchId)),"");
            int128 d0=V4Boundary.amount0(delta); int128 d1=V4Boundary.amount1(delta);if(d0<0||d1<0) revert InvalidAmount();
            uint256 n0=uint128(d0); uint256 n1=uint128(d1);if(n0>0) manager.take(address(0),address(this),n0);if(n1>0) manager.take(a,address(this),n1);return abi.encode(n0,n1);
        }
        revert CallbackRejected();
    }
    function _hop(address token,bool buy,uint256 amount) private returns(uint256 output){
        if(pools[token].born==0||amount==0||amount>type(uint112).max) revert InvalidPool();
        int256 delta=manager.swap(keyFor(token),SwapParams(buy,-int256(amount),buy?MIN_PRICE:MAX_PRICE),"");
        int128 debit=buy?V4Boundary.amount0(delta):V4Boundary.amount1(delta); int128 credit=buy?V4Boundary.amount1(delta):V4Boundary.amount0(delta);
        if(debit>=0||credit<=0||uint256(-int256(debit))!=amount) revert PartialFill();
        output=uint128(credit);_settle(buy?address(0):token,amount);manager.take(buy?token:address(0),address(this),output);
    }
    function _settle(address asset,uint256 amount) private {
        if(asset==address(0)){if(manager.settle{value:amount}()!=amount) revert InvalidAmount();}
        else{manager.sync(asset);ProtocolAssets.push(asset,address(manager),amount);if(manager.settle()!=amount) revert InvalidAmount();}
    }
    function _sqrt(uint256 n) private pure returns(uint256 r){
        if(n==0)return 0;uint256 x=n;r=1;while(x>1){x>>=2;r<<=1;}
        r<<=1;for(uint256 i;i<8;++i)r=(r+n/r)>>1;uint256 q=n/r;return r<q?r:q;
    }
    function poolCount() external view returns(uint256){return tokens.length;}
    function poolToken(uint256 i) external view returns(address){return tokens[i];}
    receive() external payable {if(msg.sender!=address(manager)) revert Unauthorized();}
}
