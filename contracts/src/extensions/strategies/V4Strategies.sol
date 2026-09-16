// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStrategyToken {
    function balanceOf(address) external view returns(uint256);
    function transfer(address,uint256) external returns(bool);
    function transferFrom(address,address,uint256) external returns(bool);
    function approve(address,uint256) external returns(bool);
}
library StrategyPayment {
    function callToken(address token,bytes memory data) internal {
        require(token.code.length != 0,"TOKEN"); (bool ok,bytes memory result)=token.call(data);
        require(ok && (result.length==0 || (result.length==32 && abi.decode(result,(bool)))),"PAYMENT");
    }
    function pull(address token,address from,uint256 amount) internal {
        uint256 beforeBalance=IStrategyToken(token).balanceOf(address(this));
        callToken(token,abi.encodeCall(IStrategyToken.transferFrom,(from,address(this),amount)));
        require(IStrategyToken(token).balanceOf(address(this))-beforeBalance==amount,"EXACT_INPUT");
    }
    function pay(address token,address to,uint256 amount) internal {
        if(amount!=0) callToken(token,abi.encodeCall(IStrategyToken.transfer,(to,amount)));
    }
    function approve(address token,address spender,uint256 amount) internal {
        callToken(token,abi.encodeCall(IStrategyToken.approve,(spender,amount)));
    }
}
interface IStrategyV4Router {
    struct PoolKey {address currency0;address currency1;uint24 fee;int24 tickSpacing;address hooks;}
    function manager() external view returns(address);
    function swap(PoolKey calldata,bool,uint128,uint128,uint160,uint256,bytes calldata) external returns(uint256);
}

/// @notice Exact-input, single-pool v4 conversion for OwnerFeeRouter and owner asset flows.
/// @dev Only standard ERC20 pairs, including wrapped native. No sweep or arbitrary external call.
contract V4SettlementConverter {
    IStrategyV4Router public immutable router;
    address public immutable manager;
    bytes32 public immutable routerCodeHash;
    bool private active;
    event Converted(address indexed payer,address indexed input,address indexed output,uint256 amountIn,uint256 amountOut);
    constructor(IStrategyV4Router r) {
        require(address(r).code.length!=0,"ROUTER"); router=r; manager=r.manager();
        require(manager.code.length!=0,"MANAGER"); routerCodeHash=address(r).codehash;
    }
    function convert(address tokenIn,address tokenOut,uint256 amountIn,uint256 minimum,uint256 deadline,bytes calldata route) external payable {
        require(!active && msg.value==0 && block.timestamp<=deadline && minimum>0 && amountIn>0,"TERMS");
        require(amountIn<=uint128(type(int128).max) && minimum<=uint128(type(int128).max),"AMOUNT");
        active=true;
        (IStrategyV4Router.PoolKey memory key,bool direction,uint160 priceLimit,bytes memory hookData)=abi.decode(route,(IStrategyV4Router.PoolKey,bool,uint160,bytes));
        require(tokenIn!=address(0) && tokenIn!=tokenOut && key.currency0<key.currency1,"PAIR");
        require(tokenIn==(direction?key.currency0:key.currency1) && tokenOut==(direction?key.currency1:key.currency0),"ROUTE_ASSETS");
        require(address(router).codehash==routerCodeHash && router.manager()==manager,"ROUTER_CHANGED");
        uint256 inputBefore=IStrategyToken(tokenIn).balanceOf(address(this));
        uint256 outputBefore=IStrategyToken(tokenOut).balanceOf(address(this));
        StrategyPayment.pull(tokenIn,msg.sender,amountIn);
        StrategyPayment.approve(tokenIn,address(router),0); StrategyPayment.approve(tokenIn,address(router),amountIn);
        router.swap(key,direction,uint128(amountIn),uint128(minimum),priceLimit,deadline,hookData);
        StrategyPayment.approve(tokenIn,address(router),0);
        require(IStrategyToken(tokenIn).balanceOf(address(this))==inputBefore,"INPUT_REMAINDER");
        uint256 amountOut=IStrategyToken(tokenOut).balanceOf(address(this))-outputBefore;
        require(amountOut>=minimum,"MINIMUM_OUTPUT"); StrategyPayment.pay(tokenOut,msg.sender,amountOut);
        active=false; emit Converted(msg.sender,tokenIn,tokenOut,amountIn,amountOut);
    }
}

/// @notice Funded, cancellable v4 sell schedules with exact slices and pre-funded executor rewards.
/// @dev Every output goes to the recorded beneficiary; callers can only execute a due slice.
/// No promise of execution: a funded caller must submit each transaction and minimum price may block it.
contract V4ScheduledExit {
    struct Terms {
        address tokenIn; address tokenOut; address beneficiary;
        uint128 totalInput; uint128 minimumTotalOutput;
        uint64 start; uint64 interval; uint64 expires; uint32 slices;
        uint96 rewardPerSlice; bytes route;
    }
    struct Plan {
        address owner; address tokenIn; address tokenOut; address beneficiary;
        uint128 totalInput; uint128 remaining; uint128 minimumTotalOutput;
        uint64 start; uint64 interval; uint64 expires; uint32 slices; uint32 executed;
        uint96 rewardPerSlice; uint256 rewardRemaining; bool paused; bool cancelled; bytes route;
    }
    V4SettlementConverter public immutable converter;
    bytes32 public immutable converterCodeHash;
    uint256 public nextPlanId=1;
    mapping(uint256=>Plan) private plans;
    mapping(address=>uint256) public rewardCredit;
    event RewardWithdrawn(address indexed beneficiary,address indexed recipient,uint256 amount);
    bool private active;
    event PlanCreated(uint256 indexed id,address indexed owner,address indexed beneficiary,address tokenIn,address tokenOut,uint256 totalInput,bytes32 routeHash);
    event SliceExecuted(uint256 indexed id,uint32 indexed slice,address indexed executor,uint256 input,uint256 output,uint256 reward);
    event PlanChanged(uint256 indexed id,uint128 minimumTotalOutput,bool paused);
    event PlanCancelled(uint256 indexed id,uint256 inputReturned,uint256 rewardReturned);
    event RewardFunded(uint256 indexed id,address indexed funder,uint256 amount);
    modifier locked(){require(!active,"BUSY");active=true;_;active=false;}
    constructor(V4SettlementConverter c){require(address(c).code.length!=0,"CONVERTER");converter=c;converterCodeHash=address(c).codehash;}
    function create(Terms calldata t) external payable locked returns(uint256 id){
        require(t.tokenIn.code.length!=0 && t.tokenOut.code.length!=0 && t.tokenIn!=t.tokenOut && t.beneficiary!=address(0),"ASSETS");
        require(t.totalInput>0 && t.totalInput<=uint128(type(int128).max) && t.minimumTotalOutput>0 && t.minimumTotalOutput<=uint128(type(int128).max),"AMOUNTS");
        require(t.slices>0 && t.slices<=10000 && t.totalInput>=t.slices && t.interval>0 && t.start>=block.timestamp && t.expires>=uint256(t.start)+uint256(t.interval)*(t.slices-1),"SCHEDULE");
        require(t.route.length>0 && t.route.length<=2048 && msg.value==uint256(t.rewardPerSlice)*t.slices,"FUNDING");
        (IStrategyV4Router.PoolKey memory key,bool direction,,)=abi.decode(t.route,(IStrategyV4Router.PoolKey,bool,uint160,bytes));
        require(key.currency0!=address(0) && key.currency0<key.currency1 && t.tokenIn==(direction?key.currency0:key.currency1) && t.tokenOut==(direction?key.currency1:key.currency0),"ROUTE");
        id=nextPlanId++; Plan storage p=plans[id];
        p.owner=msg.sender;p.tokenIn=t.tokenIn;p.tokenOut=t.tokenOut;p.beneficiary=t.beneficiary;
        p.totalInput=t.totalInput;p.remaining=t.totalInput;p.minimumTotalOutput=t.minimumTotalOutput;
        p.start=t.start;p.interval=t.interval;p.expires=t.expires;p.slices=t.slices;p.rewardPerSlice=t.rewardPerSlice;p.rewardRemaining=msg.value;p.route=t.route;
        StrategyPayment.pull(t.tokenIn,msg.sender,t.totalInput);
        emit PlanCreated(id,msg.sender,t.beneficiary,t.tokenIn,t.tokenOut,t.totalInput,keccak256(t.route));
    }
    function plan(uint256 id) external view returns(Plan memory){return plans[id];}
    function nextSlice(uint256 id) public view returns(uint256 input,uint256 minimum,uint256 dueAt,bool executable){
        Plan storage p=plans[id]; if(p.owner==address(0) || p.cancelled || p.remaining==0)return(0,0,0,false);
        input=p.executed+1==p.slices?p.remaining:uint256(p.totalInput)/p.slices;
        // Ceiling division preserves the selected aggregate price floor through small slices.
        minimum=(input*uint256(p.minimumTotalOutput)+p.totalInput-1)/p.totalInput;
        dueAt=uint256(p.start)+uint256(p.interval)*p.executed;
        executable=!p.paused && block.timestamp>=dueAt && block.timestamp<=p.expires && p.rewardRemaining>=p.rewardPerSlice;
    }
    function execute(uint256 id) external locked returns(uint256 output){
        Plan storage p=plans[id]; (uint256 input,uint256 minimum,,bool executable)=nextSlice(id);require(executable,"NOT_EXECUTABLE");
        require(address(converter).codehash==converterCodeHash,"CONVERTER_CHANGED");
        uint256 beforeInput=IStrategyToken(p.tokenIn).balanceOf(address(this));uint256 beforeOutput=IStrategyToken(p.tokenOut).balanceOf(address(this));
        p.remaining-=uint128(input);++p.executed;p.rewardRemaining-=p.rewardPerSlice;
        StrategyPayment.approve(p.tokenIn,address(converter),0);StrategyPayment.approve(p.tokenIn,address(converter),input);
        converter.convert(p.tokenIn,p.tokenOut,input,minimum,p.expires,p.route);
        StrategyPayment.approve(p.tokenIn,address(converter),0);
        require(beforeInput-IStrategyToken(p.tokenIn).balanceOf(address(this))==input,"INPUT");
        output=IStrategyToken(p.tokenOut).balanceOf(address(this))-beforeOutput;require(output>=minimum,"OUTPUT");
        StrategyPayment.pay(p.tokenOut,p.beneficiary,output);rewardCredit[msg.sender]+=p.rewardPerSlice;
        emit SliceExecuted(id,p.executed,msg.sender,input,output,p.rewardPerSlice);
    }
    /// @notice Only the creating wallet/NFT account may change its price floor or pause.
    function configure(uint256 id,uint128 minimumTotalOutput,bool paused) external locked {
        Plan storage p=plans[id];require(msg.sender==p.owner && !p.cancelled && p.remaining>0 && minimumTotalOutput>0 && minimumTotalOutput<=uint128(type(int128).max),"OWNER_OR_TERMS");
        p.minimumTotalOutput=minimumTotalOutput;p.paused=paused;emit PlanChanged(id,minimumTotalOutput,paused);
    }
    function fundRewards(uint256 id) external payable locked {
        Plan storage p=plans[id];require(p.owner!=address(0) && !p.cancelled && p.remaining>0 && msg.value>0,"PLAN");p.rewardRemaining+=msg.value;emit RewardFunded(id,msg.sender,msg.value);
    }
    function cancel(uint256 id) external locked {
        Plan storage p=plans[id];require(msg.sender==p.owner && !p.cancelled,"OWNER");p.cancelled=true;
        uint256 input=p.remaining;uint256 rewards=p.rewardRemaining;p.remaining=0;p.rewardRemaining=0;
        rewardCredit[p.owner]+=rewards;StrategyPayment.pay(p.tokenIn,p.owner,input);emit PlanCancelled(id,input,rewards);
    }
    /// @notice Pull payments prevent a reverting keeper from blocking the schedule.
    function withdrawReward(address payable to) external locked {
        require(to!=address(0),"RECIPIENT");uint256 amount=rewardCredit[msg.sender];require(amount>0,"CREDIT");rewardCredit[msg.sender]=0;
        (bool ok,)=to.call{value:amount}("");require(ok,"REWARD_PAYMENT");emit RewardWithdrawn(msg.sender,to,amount);
    }
}

interface IStrategyPosition is IStrategyToken {
    function poolKey() external view returns(address,address,uint24,int24,address);
    function liquidity() external view returns(uint128);
    function totalSupply() external view returns(uint256);
    function pendingFees(address) external view returns(uint256,uint256);
    function previewReinvest(address) external view returns(uint128);
    function reinvestFees(uint128,uint256,uint256,uint256,uint256) external returns(uint256);
    function collectFees(uint256,uint256,uint256) external returns(uint256,uint256);
}
/// @notice Optional single-owner LP custody for bounded, externally executed compounding.
/// @dev The owner can always pause and withdraw; this is not a time lock or shared governance.
contract V4FeeCompounder {
    struct Policy {uint128 maximumFee0;uint128 maximumFee1;uint128 minimumLiquidity;uint64 interval;uint64 expires;uint96 reward;bool enabled;}
    IStrategyPosition public immutable position;
    address public immutable owner;
    address public immutable token0;
    address public immutable token1;
    bytes32 public immutable positionCodeHash;
    Policy public policy;
    uint64 public lastExecution;
    uint256 public rewardBalance;
    mapping(address=>uint256) public rewardCredit;
    event RewardWithdrawn(address indexed beneficiary,address indexed recipient,uint256 amount);
    bool private active;
    event PolicyChanged(Policy policy);
    event SharesFunded(uint256 amount);
    event RewardsFunded(address indexed funder,uint256 amount);
    event RewardsRefunded(address indexed owner,uint256 amount);
    event SharesWithdrawn(uint256 amount);
    event Compounded(address indexed executor,uint128 liquidityAdded,uint256 shares,uint256 reward);
    modifier locked(){require(!active,"BUSY");active=true;_;active=false;}
    modifier onlyOwner(){require(msg.sender==owner,"OWNER");_;}
    constructor(IStrategyPosition p,address o){
        require(address(p).code.length!=0 && o!=address(0),"CONFIG");position=p;owner=o;positionCodeHash=address(p).codehash;
        (address a,address b,,,)=p.poolKey();require(a!=address(0)&&a<b,"PAIR");token0=a;token1=b;
    }
    function configure(Policy calldata next) external onlyOwner locked {
        require(!next.enabled || (next.interval>0 && next.expires>block.timestamp && next.minimumLiquidity>0 && (next.maximumFee0>0||next.maximumFee1>0)),"POLICY");
        policy=next;emit PolicyChanged(next);
    }
    function fundShares(uint256 amount) external onlyOwner locked {require(amount>0,"AMOUNT");StrategyPayment.pull(address(position),msg.sender,amount);emit SharesFunded(amount);}
    function withdrawShares(uint256 amount) external onlyOwner locked {require(amount>0,"AMOUNT");StrategyPayment.pay(address(position),owner,amount);emit SharesWithdrawn(amount);}
    function fundRewards() external payable locked {require(msg.value>0,"AMOUNT");rewardBalance+=msg.value;emit RewardsFunded(msg.sender,msg.value);}
    function refundRewards(uint256 amount) external onlyOwner locked {require(amount>0 && amount<=rewardBalance,"AMOUNT");rewardBalance-=amount;rewardCredit[owner]+=amount;emit RewardsRefunded(owner,amount);}
    function nextCompound() public view returns(uint128 amount,uint256 minimumShares,bool executable){
        Policy memory p=policy;uint256 possible=position.previewReinvest(address(this));
        (uint256 f0,uint256 f1)=position.pendingFees(address(this));
        if(f0>p.maximumFee0)possible=possible*uint256(p.maximumFee0)/f0;
        if(f1>p.maximumFee1){uint256 other=uint256(position.previewReinvest(address(this)))*p.maximumFee1/f1;if(other<possible)possible=other;}
        possible=possible*99/100;amount=uint128(possible);
        uint128 liquidity=position.liquidity();minimumShares=liquidity==0?0:possible*position.totalSupply()/liquidity;
        executable=p.enabled && block.timestamp<=p.expires && block.timestamp>=uint256(lastExecution)+p.interval && possible>=p.minimumLiquidity && minimumShares>0 && rewardBalance>=p.reward;
    }
    function execute() external locked returns(uint256 shares){
        require(address(position).codehash==positionCodeHash,"POSITION_CHANGED");
        (uint128 amount,uint256 minimumShares,bool executable)=nextCompound();require(executable,"NOT_EXECUTABLE");Policy memory p=policy;
        lastExecution=uint64(block.timestamp);rewardBalance-=p.reward;
        shares=position.reinvestFees(amount,p.maximumFee0,p.maximumFee1,minimumShares,block.timestamp);
        // Budget change refunds belong to the owner, never to the keeper.
        StrategyPayment.pay(token0,owner,IStrategyToken(token0).balanceOf(address(this)));
        StrategyPayment.pay(token1,owner,IStrategyToken(token1).balanceOf(address(this)));
        rewardCredit[msg.sender]+=p.reward;emit Compounded(msg.sender,amount,shares,p.reward);
    }
    function collectFees() external onlyOwner locked {
        position.collectFees(0,0,block.timestamp);
        StrategyPayment.pay(token0,owner,IStrategyToken(token0).balanceOf(address(this)));
        StrategyPayment.pay(token1,owner,IStrategyToken(token1).balanceOf(address(this)));
    }
    function withdrawReward(address payable to) external locked {
        require(to!=address(0),"RECIPIENT");uint256 amount=rewardCredit[msg.sender];require(amount>0,"CREDIT");rewardCredit[msg.sender]=0;
        (bool ok,)=to.call{value:amount}("");require(ok,"REWARD_PAYMENT");emit RewardWithdrawn(msg.sender,to,amount);
    }
}
