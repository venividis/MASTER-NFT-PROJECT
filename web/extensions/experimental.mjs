import {Contract,Interface,getAddress,keccak256,toUtf8Bytes} from '../vendor/ethers.min.js';

const epoch=()=>Math.floor(Date.now()/1000);
const field=(name,type,label,default_)=>({name,type,label,...(default_===undefined?{}:{default:default_})});
const id=field('id','uint256','Position or market ID','1');
const deadline=()=>field('deadline','uint48','Transaction deadline (Unix seconds)',String(epoch()+3600));
const tuple=(name,label,value)=>field(name,'json',label,JSON.stringify(value));
const action=(fid,contract,method,label,description,fields)=>({id:`${fid}.${method}`,feature:fid,contract,method,label,description,fields});
const h=(method,label,description,fields)=>action('F08','House',method,label,description,fields);
const w=(method,label,description,fields)=>action('F09','Wager',method,label,description,fields);
const k=(method,label,description,fields)=>action('F10','Wake',method,label,description,fields);
const digest=field('evidence','bytes32','Evidence digest (full 0x + 64 hexadecimal digits)');
const yes=field('yes','bool','YES outcome',true),side=field('makerSide','bool','Maker side (false = taker side)',true);

/** Exact onchain actions. Asset amounts are integer raw units; dates are Unix seconds.
 * Account and cell callers are supported; all rights belong to the actual msg.sender.
 * A participant using a cell must fund/adopt the adapter and act through that same cell.
 * Resolver/arbiter addresses must use their own designated wallet/account.
 */
export const ACTIONS=[
 h('offer','House · offer leveraged position','Deposit your equity into an isolated loan offer. A lender supplies the principal; the combined quote tokens buy real base tokens.',[
  tuple('terms','[collateral, principal, fixed debt, minimum base, minimum entry price, maximum entry price, accept by, maturity] — all amounts in raw units',['1000000000','2000000000','2020000000','1485000000000000000','1900000000','2100000000',epoch()+3600,epoch()+86400])]),
 h('fund','House · fund offered loan','Supply the exact principal. Your loan can lose money if the held asset falls; lender repayment is capped by realized proceeds.',[id,field('minimumBase','uint112','Minimum purchased base (raw units)'),deadline()]),
 h('cancel','House · refund unfilled offer','Return unfunded collateral to its borrower. Anyone can trigger this after offer expiry.',[id]),
 h('close','House · sell and settle','Sell the held base. Pay fixed lender debt first and the borrower the remainder. A shortfall is recorded when the sale cannot cover debt.',[id,field('minimumQuote','uint112','Minimum realized quote (raw units)'),deadline()]),
 h('repay','House · repay and recover base','The borrower pays the exact fixed quote debt and receives every held base token. Oracle availability is unnecessary.',[id]),
 h('settleInKind','House · terminal in-kind exit','After maturity plus grace, divide the held base at the agreed entry price, rounding the lender share upward. This does not certify current debt recovery.',[id]),
 w('create','Wager · create binary market','Lock your fixed stake and name the exact question/source, resolver, arbiter, bonds and every deadline.',[
  tuple('terms','[question hash, source hash, resolver, arbiter, maker stake, taker stake, bond, accept by, event close, propose by, arbitrate by, challenge seconds, maker YES]',[
   '0x'+('0'.repeat(63))+'1','0x'+('0'.repeat(63))+'2','0x0000000000000000000000000000000000000001','0x0000000000000000000000000000000000000002','4000000','6000000','1000000',epoch()+3600,epoch()+7200,epoch()+10800,epoch()+18000,3600,true])]),
 w('accept','Wager · take opposite outcome','Lock the exact opposing stake. The pooled stakes go to the winning side or return to each side on a void.',[id]),
 w('offerSide','Wager · list funded outcome','List one funded side for an exact price; its buyer inherits both the outcome payout and void-refund rights.',[id,side,field('price','uint112','Sale price (raw units)'),field('buyer','address','Reserved buyer (zero address = public)','0x0000000000000000000000000000000000000000')]),
 w('buySide','Wager · buy funded outcome','Pay only the displayed price to the displayed seller. The contract checks both before moving the funded side.',[id,side,field('expectedPrice','uint112','Exact listed price (raw units)'),field('expectedSeller','address','Exact listed seller')]),
 w('cancelSideOffer','Wager · remove listing','Remove your pending funded-side sale. Existing outcome and refund rights remain yours.',[id,side]),
 w('transferSide','Wager · give funded outcome','Give this side, including any eventual refund, to the chosen recipient without a sale payment.',[id,side,field('to','address','Recipient of outcome and refund rights')]),
 w('cancel','Wager · refund unmatched market','Return the unmatched maker stake. After the acceptance cutoff anyone can trigger it.',[id]),
 w('propose','Wager · propose answer','The named resolver posts one bond and evidence. Participants can challenge before the immutable window closes.',[id,yes,digest]),
 w('challenge','Wager · challenge answer','A current participant posts one bond to dispute the proposed answer. The named arbiter resolves the dispute.',[id,digest]),
 w('finalize','Wager · finalize unchallenged answer','After the full challenge window, return the resolver bond and credit the entire stake pool to the winning side.',[id]),
 w('arbitrate','Wager · decide disputed answer','Only the named arbiter may decide before its cutoff: 0 NO, 1 YES, 2 invalid/refund. The correct claimant receives both bonds.',[id,field('outcome','uint8','0 = NO, 1 = YES, 2 = invalid/refund'),digest]),
 w('voidExpired','Wager · refund missing authority','Refund original funded stakes when the resolver or arbiter misses its exact deadline. Disputed bonds return to their posters.',[id]),
 k('take','Wake · take keeper seat','Prepay the whole lease rent. A live takeover also pays the incumbent its seat price; unused incumbent rent becomes a pull refund.',[field('price','uint112','New self-assessed seat price (raw units)'),field('maximumPayment','uint112','Maximum compensation plus rent (raw units)'),deadline(),field('expectedEpoch','uint256','Current seat epoch')]),
 k('checkpoint','Wake · settle elapsed rent','Credit elapsed whole rent while carrying its fraction. End expired seats and release any unused prepaid rent.',[]),
 k('release','Wake · release keeper seat','End your lease, round its final rent fraction upward once and receive unused prepaid rent. Seat price itself is not a redemption claim.',[field('expectedEpoch','uint256','Current seat epoch')]),
 k('run','Wake · perform keeper task','Run only the fixed task adapter. Other keepers may use this route once the incumbent misses its liveness window or the seat expires.',[field('task','bytes32','Task identifier'),field('data','bytes','Task-specific bytes (exit adapter: ABI encoded plan ID and slice ID)'),field('expectedEpoch','uint256','Current seat epoch')]),
 ...[['F08','House'],['F09','Wager'],['F10','Wake']].map(([fid,c])=>action(fid,c,'withdrawFor',`${c} · withdraw credited funds`,'Relay an exact credited withdrawal to its fixed recipient. This function cannot redirect the recipient’s funds.',[field('account','address','Credited account (recipient is fixed)'),field('asset','address','Credited ERC-20 asset')])),
];

export const EXPERIMENTAL_VERSIONS={House:'anima/house/isolated-spot/1',Wager:'anima/wager/matched-binary/1',Wake:'anima/wake/prepaid-seat/1'};
const uint=(n,label)=>{try{const v=BigInt(n);if(v<0n||v>2n**112n-1n)throw Error();return v;}catch{throw Error(`${label} must be an unsigned integer in supported raw units.`);}};
const get=(tuple,name,index)=>tuple[name]??tuple[index];
const riskMethods={House:new Set(['offer','fund']),Wager:new Set(['create','accept','offerSide','buySide','transferSide']),Wake:new Set(['take'])};

/** Read immutable deployment identity, actual funding and named loss/exit terms before review.
 * `abi` is this release's generated ABI. Never sends or signs a transaction.
 * The caller must still enforce its account/cell nonce, ownership epoch and exact allowance.
 */
export async function prepareExperimentalAction(provider,{contract,address,method,args=[],caller,abi}){
 const spec=ACTIONS.find(a=>a.contract===contract&&a.method===method);if(!spec)throw Error('Unsupported experimental action.');
 address=getAddress(address);caller=getAddress(caller);if(await provider.getCode(address)==='0x')throw Error('No deployed executor at this address.');
 const c=new Contract(address,abi,provider);if(await c.version()!==keccak256(toUtf8Bytes(EXPERIMENTAL_VERSIONS[contract])))throw Error('Executor version does not match this release.');
 const chain=await provider.getNetwork();if(![31337n,84532n,11155111n].includes(chain.chainId))throw Error('This release activates these executors only on the specified test networks.');
 if(riskMethods[contract].has(method)){
  const gate=new Contract(await c.gate(),['function enabled(address) view returns(bool)'],provider);
  if(!await gate.enabled(address))throw Error('The experiment currently accepts no new exposure. Settlement and refunds remain available.');
 }
 const rows=[['Action',spec.label],['Caller and rights holder',caller],['Executor',address],['Chain ID',String(chain.chainId)]],inputs=[];
 let asset,spend=0n;
 if(contract==='House'){
  asset=await c.quoteAsset();const base=await c.baseAsset(),oracle=await c.oracle(),venue=await c.venue();
  rows.push(['Quote asset',asset],['Base asset',base],['Oracle',oracle],['Venue',venue],['Exit grace (seconds)',String(await c.exitGrace())],['Loss order','Borrower equity first; lender absorbs any unpaid non-recourse debt'],['Emergency exit','Held base split at entry price after maturity + grace; current value may be below debt']);
  if(['fund','close'].includes(method)){
   if(keccak256(await provider.getCode(oracle))!==await c.oracleCodeHash()||keccak256(await provider.getCode(venue))!==await c.venueCodeHash())throw Error('A pinned House dependency changed code.');
   rows.push(['Fresh quote raw units per baseUnit',String(await c.freshPrice())],['Base unit',String(await c.baseUnit())]);
  }
  if(method==='offer')spend=uint(get(args[0],'collateral',0),'Collateral');
  if(['fund','close','repay','settleInKind','cancel'].includes(method)){
   const p=await c.position(args[0]),t=p.terms;
   rows.push(['Borrower',p.borrower],['Lender',p.lender],['Principal raw units',String(t.principal)],['Fixed debt raw units',String(t.debt)],['Maturity',String(t.maturity)],['Base held raw units',String(p.heldBase)]);
   if(method==='fund')spend=t.principal;if(method==='repay')spend=t.debt;
  }
 }else if(contract==='Wager'){
  asset=await c.asset();rows.push(['Stake and bond asset',asset],['Claims','Perpetual recipient-pinned claims; no expiry or treasury escheat']);
  const t=method==='create'?args[0]:(method==='withdrawFor'?null:(await c.market(args[0])).terms);
  if(t){rows.push(['Question digest',String(get(t,'question',0))],['Resolution source digest',String(get(t,'source',1))],['Resolver',String(get(t,'resolver',2))],['Arbiter',String(get(t,'arbiter',3))],['Maker stake raw units',String(get(t,'makerStake',4))],['Taker stake raw units',String(get(t,'takerStake',5))],['Dispute bond raw units',String(get(t,'bond',6))],['Resolver cutoff',String(get(t,'proposeBy',9))],['Arbiter cutoff',String(get(t,'arbitrateBy',10))]);
   if(method==='create')spend=uint(get(t,'makerStake',4),'Maker stake');if(method==='accept')spend=get(t,'takerStake',5);if(['propose','challenge'].includes(method))spend=get(t,'bond',6);
  }
  if(method==='buySide'){spend=uint(args[2],'Sale price');const o=await c.sideOffers(args[0],args[1]);if(o.price!==spend||getAddress(o.seller)!==getAddress(args[3]))throw Error('The listed price or seller changed.');rows.push(['Sale proceeds recipient',o.seller],['Rights acquired','Outcome payout and original stake refund for this side']);}
 }else{
  asset=await c.asset();rows.push(['Payment asset',asset],['Rent treasury',await c.treasury()],['Task adapter',await c.taskTarget()],['Current holder',await c.holder()],['Seat epoch',String(await c.epoch())],['Lease duration (seconds)',String(await c.duration())],['Exclusive liveness window (seconds)',String(await c.exclusiveGrace())],['Rent rate',`${await c.rentNumerator()} / ${await c.rentDenominator()} per second × seat price`],['Rounding','Carry fractions across checkpoints; round final lease fraction upward once'],['Boundary','Exclusivity covers this task adapter, not unrelated public protocol routes']);
  if(method==='take'){const q=await c.takeQuote(args[0]);spend=q.total;if(spend>uint(args[1],'Maximum payment'))throw Error('Current takeover quote exceeds your maximum payment.');if(await c.epoch()!==BigInt(args[3]))throw Error('Seat epoch changed.');rows.push(['Incumbent compensation raw units',String(q.compensation)],['Prepaid rent raw units',String(q.rent)]);}
  if(method==='run'){const target=await c.taskTarget();if(keccak256(await provider.getCode(target))!==await c.taskCodeHash())throw Error('The task adapter changed code.');const e=await c.eligibility(caller,args[2]);if(!e.eligible)throw Error('This caller is outside the current exclusive seat or used a stale epoch.');rows.push(['Public fallback',String(e.publicFallback)]);}
 }
 if(method==='withdrawFor'){const recipient=getAddress(args[0]),token=getAddress(args[1]),amount=await c.claimable(recipient,token);if(amount===0n)throw Error('That account has no credited balance for this asset.');rows.push(['Fixed withdrawal recipient',recipient],['Withdrawal asset',token],['Withdrawal raw units',String(amount)]);}
 if(spend>0n){inputs.push({asset:getAddress(asset),maximum:String(spend)});rows.push(['Exact additional spend raw units',String(spend)],['Spend asset',getAddress(asset)]);}
 const data=new Interface(abi).encodeFunctionData(method,args);
 return{target:address,data,value:'0',caller,inputs,outputs:[],review:{title:spec.label,description:spec.description,rows},contract,method,args};
}
