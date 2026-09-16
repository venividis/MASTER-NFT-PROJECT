import {AbiCoder,Contract,ContractFactory,getAddress,getCreateAddress,getCreate2Address,keccak256,toBeHex,zeroPadValue,parseUnits,formatUnits,ZeroAddress} from '../vendor/ethers.min.js';
import {HOOK_ARTIFACTS} from './hook-artifacts.mjs';
import {verifiedNetwork,verifyContract,normalizeRuntime,TOKEN_ABI,POOL} from '../v4/client.mjs';
import {resolveHumanRange,sqrtAtTick,startingPrice,liquidityForBudgets,MIN_SQRT,MAX_SQRT} from '../v4/math.mjs';

const tx=(to,data)=>({to,data,value:0n});
const address=value=>getAddress(value);
const same=(a,b)=>address(a)===address(b);
function nonzero(value){const a=address(value);if(a===ZeroAddress)throw Error('Choose a nonzero address.');return a;}
function integer(value,min,max){const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('Integer setting is outside the supported bounds.');return n;}
function positive(value,decimals=18){const n=parseUnits(String(value),decimals);if(n<=0n||n>(1n<<127n)-1n)throw Error('Amount must be positive and fit v4 settlement.');return n;}
function boundedAmount(value,max){const n=value===undefined?max:BigInt(value);if(n<=0n||n>max)throw Error('Amount exceeds the earned balance.');return n;}
function splitTerms(input){
  const recipients=(input.recipients||[]).map(nonzero),weights=(input.weights||[]).map(BigInt);
  if(!recipients.length||recipients.length>64||recipients.length!==weights.length||new Set(recipients).size!==recipients.length||weights.some(n=>n<=0n||n>10n**18n))throw Error('Choose 1–64 distinct recipients and a positive weight for each.');
  return {recipients,weights};
}
async function latest(provider){const b=await provider.getBlock('latest');if(!b)throw Error('Latest block unavailable.');return b.timestamp;}
async function token(provider,value){const a=nonzero(value);if(await provider.getCode(a)==='0x')throw Error('Use a deployed standard ERC20; wrap native currency first.');const c=new Contract(a,TOKEN_ABI,provider),decimals=integer(await c.decimals(),0,36);return {address:a,decimals,c};}
function plan(config,kind,request,summary,extra={}){return {kind,chainId:Number(config.chainId),request,spend:[],outputs:[],summary,...extra};}

/** Verify executable runtime rather than accepting an address merely because it implements the ABI. */
export async function verifyHookContract(provider,value,name,scope={}){
  const a=nonzero(value),artifact=HOOK_ARTIFACTS[name];
  if(!artifact||normalizeRuntime(await provider.getCode(a),artifact)!==artifact.normalizedHash)throw Error(`${name} runtime does not match the compiled release.`);
  const c=new Contract(a,artifact.abi,provider);
  if(scope.manager){const m=name==='OwnerV4FeeHook'?await c.poolManager():await c.manager();if(!same(m,scope.manager))throw Error('Contract uses another PoolManager.');}
  if(scope.owner&&!same(await c.owner(),scope.owner))throw Error('The contract owner differs from the reviewed owner.');
  if(name==='OwnerV4FeeHook'){
    if((BigInt(a)&0x3fffn)!==0xc8n)throw Error('Hook address has incorrect permission flags.');
    if(scope.recipient&&!same(await c.recipient(),scope.recipient))throw Error('Hook fee recipient differs from the reviewed recipient.');
    if(scope.viaSplitter!==undefined&&(await c.routeToSplitter())!==scope.viaSplitter)throw Error('Hook fee route changed.');
    if(scope.feePpm!==undefined&&(await c.feePpm())!==BigInt(scope.feePpm))throw Error('Hook fee changed.');
  }
  return c;
}

/** Unsigned one-contract deployment. Expected address is tied to the explicit reviewed nonce. */
export async function hookInfrastructurePlan(provider,config,input,payer){
  config=await verifiedNetwork(provider,config);payer=nonzero(payer);
  let name,args,summary;
  if(input.kind==='factory'){name='GenesisV4HookLaunchpad';args=[config.manager];summary={purpose:'Deploy the opt-in hooked launch factory',manager:config.manager};}
  else if(input.kind==='create2'){name='HookCreate2Factory';args=[];summary={purpose:'Deploy the CREATE2 hook factory'};}
  else if(input.kind==='splitter'){const {recipients,weights}=splitTerms(input),owner=nonzero(input.owner||payer);name='OwnerFeeRouter';args=[owner,recipients,weights];summary={purpose:'Deploy recipient-owned fee claims',owner,recipients,weights:weights.map(String)};}
  else throw Error('Unknown hook infrastructure deployment.');
  const artifact=HOOK_ARTIFACTS[name],nonce=await provider.getTransactionCount(payer,'pending');
  const request={...(await new ContractFactory(artifact.abi,artifact.bytecode).getDeployTransaction(...args)),nonce,value:0n};
  const predictedAddress=getCreateAddress({from:payer,nonce});
  const verification={name,...(input.kind==='factory'?{manager:config.manager}:{}),...(input.kind==='splitter'?{owner:args[0]}:{})};
  return plan(config,'hook-setup',request,summary,{predictedAddress,verification,meta:{deploymentType:input.kind,predictedAddress,verification}});
}

/** Browser-friendly CREATE2 mining; no signing, RPC writes or private keys. */
export async function mineHookAddress(factory,initCode,{signal,onProgress,start=0n,attempts=1_000_000,chunkSize=512}={}){
  factory=nonzero(factory);const hash=keccak256(initCode);start=BigInt(start);
  for(let i=0;i<attempts;i++){
    if(signal?.aborted)throw new DOMException('Hook address search cancelled.','AbortError');
    const salt=zeroPadValue(toBeHex(start+BigInt(i)),32),found=getCreate2Address(factory,salt,hash);
    if((BigInt(found)&0x3fffn)===0xc8n){onProgress?.({attempts:i+1,address:found});return {address:found,salt,initCodeHash:hash,attempts:i+1};}
    if((i+1)%chunkSize===0){onProgress?.({attempts:i+1});await new Promise(resolve=>setTimeout(resolve,0));}
  }
  throw Error('No matching hook address in this search range; continue with another range.');
}
export async function hookDeployPlan(provider,config,input,payer,options={}){
  config=await verifiedNetwork(provider,config);const create2=nonzero(input.create2||config.create2),owner=nonzero(input.owner||payer),recipient=nonzero(input.recipient),viaSplitter=Boolean(input.viaSplitter),feePpm=integer(input.feePpm,0,999999);
  const factory=await verifyHookContract(provider,create2,'HookCreate2Factory');
  if(same(recipient,config.manager))throw Error('PoolManager cannot receive the hook fee.');
  if(viaSplitter)await verifyHookContract(provider,recipient,'OwnerFeeRouter',{owner});
  const a=HOOK_ARTIFACTS.OwnerV4FeeHook,initCode=(await new ContractFactory(a.abi,a.bytecode).getDeployTransaction(config.manager,owner,feePpm,recipient,viaSplitter)).data;
  const mined=await mineHookAddress(create2,initCode,options);
  if(await provider.getCode(mined.address)!=='0x')throw Error('This hook address already exists; inspect it or use another search range.');
  const verification={name:'OwnerV4FeeHook',manager:config.manager,owner,recipient,viaSplitter,feePpm};
  return plan(config,'hook-deploy',tx(create2,factory.interface.encodeFunctionData('deploy',[mined.salt,initCode])),{purpose:'Deploy the selected swap fee and recipient route',owner,recipient,viaSplitter,feePpm,hook:mined.address},{predictedAddress:mined.address,verification,mined,meta:{deploymentType:'hook',predictedAddress:mined.address,verification}});
}
export async function inspectSplitter(provider,{splitter,currency,beneficiary,owner}){
  const c=await verifyHookContract(provider,splitter,'OwnerFeeRouter',owner?{owner}:{}),[recipients,weights]=await c.recipients();
  const result={address:address(splitter),owner:await c.owner(),configurationVersion:await c.configurationVersion(),recipients:Array.from(recipients),weights:Array.from(weights)};
  if(currency){result.currency=address(currency);result.totalClaimable=await c.totalClaimable(currency);if(beneficiary)result.claimable=await c.claimable(currency,beneficiary);}
  return result;
}
export async function inspectHook(provider,config,input={}){
  config=await verifiedNetwork(provider,config);const hook=nonzero(input.hook||config.hook),c=await verifyHookContract(provider,hook,'OwnerV4FeeHook',{manager:config.manager,...(input.owner?{owner:input.owner}:{})});
  const [owner,pendingOwner,feePpm,recipient,viaSplitter]=await Promise.all([c.owner(),c.pendingOwner(),c.feePpm(),c.recipient(),c.routeToSplitter()]);
  const result={hook,manager:config.manager,owner,pendingOwner,feePpm,recipient,viaSplitter};
  if(viaSplitter)result.splitter=await inspectSplitter(provider,{splitter:recipient});
  if(input.currency){result.currency=address(input.currency);result.accrued=await c.accrued(input.currency,input.recipient||recipient,input.viaSplitter??viaSplitter);}
  return result;
}

export async function hookedLaunchPlan(provider,config,input,payer,{privateFunding=false}={}){
  config=await verifiedNetwork(provider,config);payer=nonzero(payer);
  const factory=await verifyHookContract(provider,config.hookFactory,'GenesisV4HookLaunchpad',{manager:config.manager});
  // The shared shielded adapter is the factory caller, not the hook's owner.
  // Never infer a creator wallet from that adapter or from a public wallet session.
  const expectedOwner=input.expectedHookOwner||config.hookOwner||(!privateFunding?payer:undefined);
  const hook=await inspectHook(provider,config,expectedOwner?{owner:expectedOwner}:{});
  if(input.expectedHookFeePpm!==undefined&&String(input.expectedHookFeePpm).trim()!==''&&hook.feePpm!==BigInt(input.expectedHookFeePpm))throw Error('The hook fee differs from the reviewed launch composition.');
  if(input.expectedHookRecipient&&!same(hook.recipient,input.expectedHookRecipient))throw Error('The hook recipient differs from the reviewed launch composition.');
  if(input.expectedHookViaSplitter!==undefined&&hook.viaSplitter!==input.expectedHookViaSplitter)throw Error('The hook routing differs from the reviewed launch composition.');
  if(input.expectedSplitRecipients||input.expectedSplitWeights){
    if(!hook.splitter||!Array.isArray(input.expectedSplitRecipients)||!Array.isArray(input.expectedSplitWeights)||input.expectedSplitRecipients.length!==hook.splitter.recipients.length||input.expectedSplitWeights.length!==hook.splitter.weights.length||input.expectedSplitRecipients.some((a,i)=>!same(a,hook.splitter.recipients[i]))||input.expectedSplitWeights.some((w,i)=>BigInt(w)!==hook.splitter.weights[i]))throw Error('The fee splitter differs from the reviewed launch composition.');
  }
  if(config.splitter&&(!hook.viaSplitter||!same(hook.recipient,config.splitter)))throw Error('The hook is not routing to your selected splitter.');
  const humanLower=String(input.humanLowerPrice??'').trim(),humanUpper=String(input.humanUpperPrice??'').trim();
  if(Boolean(humanLower)!==Boolean(humanUpper))throw Error('Enter both lower and upper human price limits, or leave both blank.');
  const humanRange=humanLower?{lower:humanLower,upper:humanUpper}:input.range;
  const quote=await token(provider,input.quoteToken),spacing=integer(input.tickSpacing??60,1,32767),lower=integer((humanRange?undefined:input.tickLower)??Math.ceil(-887272/spacing)*spacing,-887272,887272),upper=integer((humanRange?undefined:input.tickUpper)??Math.floor(887272/spacing)*spacing,-887272,887272);
  if(lower>=upper||lower%spacing||upper%spacing)throw Error('Tick bounds must be ordered and aligned to tick spacing.');
  const terms={name:String(input.name??'').trim(),symbol:String(input.symbol??'').trim(),supply:positive(input.supply),quoteToken:quote.address,tokenBudget:positive(input.tokenBudget),quoteBudget:positive(input.quoteBudget,quote.decimals),fee:integer(input.fee??3000,0,100000),tickSpacing:spacing,tickLower:lower,tickUpper:upper,sqrtPriceX96:1n<<96n,liquidity:1n,deadline:await latest(provider)+1800,salt:input.salt};
  if(!terms.name||new TextEncoder().encode(terms.name).length>128||!terms.symbol||new TextEncoder().encode(terms.symbol).length>32||terms.tokenBudget>terms.supply||!/^0x[0-9a-f]{64}$/i.test(terms.salt))throw Error('Check token identity, budgets and fresh launch salt.');
  const [newToken]=await factory.predict(terms,payer,hook.hook),tokenIs0=BigInt(newToken)<BigInt(quote.address);
  if(humanRange)Object.assign(terms,resolveHumanRange(humanRange,quote.decimals,tokenIs0,spacing));
  terms.sqrtPriceX96=startingPrice(input.price,quote.decimals,tokenIs0);
  terms.liquidity=liquidityForBudgets(terms.sqrtPriceX96,sqrtAtTick(terms.tickLower),sqrtAtTick(terms.tickUpper),tokenIs0?terms.tokenBudget:terms.quoteBudget,tokenIs0?terms.quoteBudget:terms.tokenBudget);
  const [predictedToken,position]=await factory.predict(terms,payer,hook.hook);
  if(predictedToken!==newToken)throw Error('Token prediction changed while resolving the price range.');
  if(await provider.getCode(predictedToken)!=='0x'||await provider.getCode(position)!=='0x')throw Error('Launch salt already used; generate another.');
  const key={currency0:tokenIs0?predictedToken:quote.address,currency1:tokenIs0?quote.address:predictedToken,fee:terms.fee,tickSpacing:spacing,hooks:hook.hook};
  return plan(config,'hooked-launch',tx(address(config.hookFactory),factory.interface.encodeFunctionData('launch',[terms,hook.hook])),{token:predictedToken,position,hook:hook.hook,hookOwner:hook.owner,hookFeePpm:hook.feePpm.toString(),feeRecipient:hook.recipient,viaSplitter:hook.viaSplitter,lpFee:terms.fee/10000+'%',price:String(input.price),tickLower:terms.tickLower,tickUpper:terms.tickUpper,quoteDecimals:quote.decimals,humanRange:humanRange||null,liquidity:terms.liquidity.toString(),ownership:'Fixed-supply token; LP shares redeem principal and ordinary LP fees',funding:privateFunding?'Shielded funds through shared RelayAdapt':'Public wallet transaction',...(privateFunding?{publicHookMetadata:'Hook owner, fee recipients and splitter weights remain public; reusing them can link launches. No NFT or public-wallet creator identity is added to this launch.'}:{})},{deadline:terms.deadline,terms,hook,key,spend:[{tokenAddress:quote.address,amount:terms.quoteBudget}],outputs:[quote.address,predictedToken,position]});
}
export async function hookedSwapPlan(provider,config,input){
  config=await verifiedNetwork(provider,config);
  const router=await verifyContract(provider,config.router,'GenesisV4Router',config.manager),hook=await inspectHook(provider,config);
  const [a,b]=await Promise.all([token(provider,input.inputToken),token(provider,input.outputToken)]);
  if(same(a.address,b.address))throw Error('Choose distinct input and output currencies.');
  const direction=BigInt(a.address)<BigInt(b.address),key={currency0:direction?a.address:b.address,currency1:direction?b.address:a.address,fee:integer(input.fee??3000,0,100000),tickSpacing:integer(input.tickSpacing??60,1,32767),hooks:hook.hook};
  const exact=positive(input.amount,a.decimals),slippage=integer(input.slippageBps??50,1,1000),maximumFee=integer(input.maximumHookFeePpm??hook.feePpm,0,999999),deadline=await latest(provider)+600;
  if(hook.feePpm>BigInt(maximumFee))throw Error('Current hook fee exceeds your accepted maximum.');
  const hookData=AbiCoder.defaultAbiCoder().encode(['uint24','uint64'],[maximumFee,deadline]);
  const quoter=new Contract(address(config.quoter),[`function quoteExactInputSingle(tuple(${POOL} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData)) returns(uint256 amountOut,uint256 gasEstimate)`,'function poolManager() view returns(address)'],provider);
  if(!same(await quoter.poolManager(),config.manager))throw Error('Quoter uses a different PoolManager.');
  const [expected]=await quoter.quoteExactInputSingle.staticCall([key,direction,exact,hookData]),minimum=expected*BigInt(10000-slippage)/10000n;
  if(minimum<=0n||minimum>(1n<<127n)-1n)throw Error('Output quote is outside settlement limits.');
  return plan(config,'hooked-swap',tx(address(config.router),router.interface.encodeFunctionData('swap',[key,direction,exact,minimum,direction?MIN_SQRT+1n:MAX_SQRT-1n,deadline,hookData])),{inputToken:a.address,outputToken:b.address,input:String(input.amount),expectedOutput:formatUnits(expected,b.decimals),minimumPoolOutput:formatUnits(minimum,b.decimals),maximumHookFeePpm:maximumFee,hook:hook.hook,feeRecipient:hook.recipient},{deadline,spend:[{tokenAddress:a.address,amount:exact}],outputs:[a.address,b.address],key,hookData,hook});
}
export async function hookFlushPlan(provider,config,input){
  config=await verifiedNetwork(provider,config);const hook=await inspectHook(provider,config,{hook:input.hook}),recipient=nonzero(input.recipient||hook.recipient),currency=address(input.currency),viaSplitter=input.viaSplitter??hook.viaSplitter;
  if(viaSplitter)await verifyHookContract(provider,recipient,'OwnerFeeRouter');
  const c=await verifyHookContract(provider,hook.hook,'OwnerV4FeeHook',{manager:config.manager}),amount=boundedAmount(input.amount,await c.accrued(currency,recipient,viaSplitter));
  return plan(config,'hook-flush',tx(hook.hook,c.interface.encodeFunctionData('flush',[currency,recipient,viaSplitter,amount])),{purpose:'Forward only recorded earned fees',currency,recipient,viaSplitter,amount:amount.toString()});
}
export async function hookClaimPlan(provider,config,input,payer){
  config=await verifiedNetwork(provider,config);payer=nonzero(payer);const splitter=nonzero(input.splitter),currency=address(input.currency),to=nonzero(input.to||payer),c=await verifyHookContract(provider,splitter,'OwnerFeeRouter');
  const amount=boundedAmount(input.amount,await c.claimable(currency,payer));
  return plan(config,'hook-claim',tx(splitter,c.interface.encodeFunctionData('claim',[currency,amount,to])),{purpose:'Withdraw your earned fee share',beneficiary:payer,currency,amount:amount.toString(),to});
}
export async function configureHookPlan(provider,config,input,payer){
  config=await verifiedNetwork(provider,config);const hook=nonzero(input.hook||config.hook),c=await verifyHookContract(provider,hook,'OwnerV4FeeHook',{manager:config.manager,owner:payer}),recipient=nonzero(input.recipient),viaSplitter=Boolean(input.viaSplitter),feePpm=integer(input.feePpm,0,999999);
  if(same(recipient,hook)||same(recipient,config.manager))throw Error('Choose a fee recipient distinct from the hook and manager.');
  if(viaSplitter)await verifyHookContract(provider,recipient,'OwnerFeeRouter',{owner:payer});
  return plan(config,'hook-configure',tx(hook,c.interface.encodeFunctionData('configure',[feePpm,recipient,viaSplitter])),{feePpm,recipient,viaSplitter,existingClaims:'Previously earned fees stay assigned to their recorded recipient'});
}
export async function configureSplitPlan(provider,config,input,payer){
  config=await verifiedNetwork(provider,config);const splitter=nonzero(input.splitter),c=await verifyHookContract(provider,splitter,'OwnerFeeRouter',{owner:payer}),{recipients,weights}=splitTerms(input);
  return plan(config,'split-configure',tx(splitter,c.interface.encodeFunctionData('configureSplit',[recipients,weights])),{recipients,weights:weights.map(String),existingClaims:'Existing splitter claims cannot be reassigned; new weights apply to later deposits and hook flushes'});
}
