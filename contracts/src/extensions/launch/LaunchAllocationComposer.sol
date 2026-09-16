// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {LaunchRegistry} from './LaunchRegistry.sol';
import {ProtocolGuard,ProtocolAssets} from '../../protocol/ProtocolPrimitives.sol';

interface IAllocationVault {
    function deposit(address,uint112,address,uint64,uint64,uint64,bool,uint256) external payable returns(uint256);
}
interface IAllocationFactory {
    struct Terms {string name;string symbol;uint256 supply;address quoteToken;uint256 tokenBudget;uint256 quoteBudget;uint24 fee;int24 tickSpacing;int24 tickLower;int24 tickUpper;uint160 sqrtPriceX96;uint128 liquidity;uint256 deadline;bytes32 salt;}
    function launch(Terms calldata) external returns(address,address);
    function launch(Terms calldata,address) external returns(address,address);
    function manager() external view returns(address);
}
interface IAllocationPosition {function poolKey() external view returns(address,address,uint24,int24,address);}

/// @notice Atomically creates a v4 pool, distributes retained tokens/LP shares, funds optional fixed-beneficiary vault schedules, and records provenance.
/// @dev Factories and vault are immutable, explicitly chosen and runtime-verified by the client. No delegatecall or general executor.
contract LaunchAllocationComposer is ProtocolGuard {
    LaunchRegistry public immutable registry;
    IAllocationVault public immutable vault;
    address public immutable factory;
    address public immutable hookFactory;
    struct Allocation {uint8 asset;address beneficiary;uint112 amount;uint64 start;uint64 cliff;uint64 end;bool linear;}
    event Composed(uint256 indexed recordId,address indexed payer,address indexed token,address position,bytes32 recipeHash);
    constructor(address registry_,address vault_,address factory_,address hookFactory_){
        require(registry_.code.length>0&&vault_.code.length>0&&factory_.code.length>0,'DEPENDENCIES');
        require(hookFactory_==address(0)||hookFactory_.code.length>0,'HOOK_FACTORY');
        registry=LaunchRegistry(registry_);vault=IAllocationVault(vault_);factory=factory_;hookFactory=hookFactory_;
        if(hookFactory_!=address(0))require(IAllocationFactory(factory_).manager()==IAllocationFactory(hookFactory_).manager(),'MANAGER');
    }
    function compose(IAllocationFactory.Terms calldata t,address hook,Allocation[] calldata allocations,address collection,uint256 tokenId) external nonReentrant returns(uint256 id,address token,address position){
        require(allocations.length<=32,'ALLOCATIONS');
        require(registry.authorizedRegistrar(msg.sender,address(this)),'AUTHORIZE_REGISTRAR');
        address selected=hook==address(0)?factory:hookFactory;require(selected!=address(0),'HOOK_FACTORY');
        uint256 quoteBefore=ProtocolAssets.balance(t.quoteToken,address(this));
        ProtocolAssets.pull(t.quoteToken,msg.sender,t.quoteBudget);ProtocolAssets.approveExact(t.quoteToken,selected,t.quoteBudget);
        if(hook==address(0))(token,position)=IAllocationFactory(selected).launch(t);
        else (token,position)=IAllocationFactory(selected).launch(t,hook);
        ProtocolAssets.approveExact(t.quoteToken,selected,0);
        LaunchRegistry.Link[] memory out=new LaunchRegistry.Link[](allocations.length);
        for(uint256 i;i<allocations.length;i++){
            Allocation calldata a=allocations[i];require(a.asset<=1&&a.amount>0&&a.beneficiary!=address(0)&&a.beneficiary!=address(this),'ALLOCATION');
            address asset=a.asset==0?token:position;uint256 lockId;
            if(a.end==0){require(a.start==0&&a.cliff==0&&!a.linear,'DIRECT_SCHEDULE');ProtocolAssets.push(asset,a.beneficiary,a.amount);}
            else {ProtocolAssets.approveExact(asset,address(vault),a.amount);lockId=vault.deposit(asset,a.amount,a.beneficiary,a.start,a.cliff,a.end,a.linear,0);ProtocolAssets.approveExact(asset,address(vault),0);}
            out[i]=LaunchRegistry.Link(a.end==0?keccak256('allocation'):keccak256('vesting'),a.end==0?a.beneficiary:address(vault),lockId,asset,a.beneficiary,a.amount,keccak256(abi.encode(a.start,a.cliff,a.end,a.linear)));
        }
        uint256 tokenLeft=ProtocolAssets.balance(token,address(this));uint256 lpLeft=ProtocolAssets.balance(position,address(this));
        if(tokenLeft>0)ProtocolAssets.push(token,msg.sender,tokenLeft);if(lpLeft>0)ProtocolAssets.push(position,msg.sender,lpLeft);
        uint256 quoteAfter=ProtocolAssets.balance(t.quoteToken,address(this));require(quoteAfter>=quoteBefore,'QUOTE_ACCOUNTING');
        if(quoteAfter>quoteBefore)ProtocolAssets.push(t.quoteToken,msg.sender,quoteAfter-quoteBefore);
        (address c0,address c1,uint24 fee,int24 spacing,address hooks)=IAllocationPosition(position).poolKey();
        bytes32 recipeHash=keccak256(abi.encode(selected,hook,t,allocations));
        LaunchRegistry.Descriptor memory d=LaunchRegistry.Descriptor(msg.sender,collection,tokenId,token,hook==address(0)?keccak256('v4'):keccak256('v4-hook'),selected,0,position,keccak256(abi.encode(c0,c1,fee,spacing,hooks)),recipeHash);
        id=registry.register(d,out);emit Composed(id,msg.sender,token,position,recipeHash);
    }
}
