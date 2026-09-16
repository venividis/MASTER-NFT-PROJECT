import {Contract,Interface,getAddress,ZeroAddress,parseEther,keccak256,toUtf8Bytes} from '../vendor/ethers.min.js';
import {LiveProtocol} from '../genesis/live-protocol.mjs';
import {serviceOrigin} from './service-origin.mjs';

export const PROOF_SCHEMA='anima.native-quote-proof/1';
export const PROOF_ABI=[
  'function collection() view returns(address)','function market() view returns(address)','function productionReady() view returns(bool)',
  'function contextHash((address account,uint64 epoch,uint256 nonce,uint64 sourceBlock,bytes32 sourceHash,bytes data,uint256 value,bytes transactionData)) view returns(bytes32)',
  'function check((address account,uint64 epoch,uint256 nonce,uint64 sourceBlock,bytes32 sourceHash,bytes data,uint256 value,bytes transactionData),uint256[2],uint256[2][2],uint256[2],uint256[10]) view returns(uint112)'
];
const marketABI=['function swap(address,address,uint112,uint112,uint48,uint256,uint64) payable returns(uint256,uint256)',
  'function poolInfo(address) view returns(uint112,uint112,uint64,uint256,uint256)'];
const marketInterface=new Interface(marketABI);
const utilityInterface=new Interface(['function executeUtility(uint256,uint48,address,address,uint256,bytes,uint256) payable returns(bytes)']);
const accountABI=['function actionNonce() view returns(uint256)','function sessionEpoch() view returns(uint64)'];
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const digest=plan=>keccak256(toUtf8Bytes(JSON.stringify([String(plan.chainId),plan.collection,plan.tokenId,plan.account,plan.epoch,
  plan.target,plan.data,plan.value,plan.transaction?.to,plan.transaction?.from,plan.transaction?.data,String(plan.transaction?.value||0)])));
export function proofEndpoint(endpoint) {
  const origin = serviceOrigin(endpoint, 'proof service');
  // The local prover pins its HTTP Host header to this exact loopback address.
  const url = new URL(origin);
  if (url.protocol === 'http:' && url.hostname !== '127.0.0.1') throw Error('Use 127.0.0.1 for the local proof service.');
  return origin;
}
export async function proveSwapPlan(plan,wallet,{checker:address,endpoint,token,signal,fetcher=fetch}={}) {
  if(typeof token!=='string'||token.length<32)throw Error('Enter the local proof service session token.');
  endpoint=proofEndpoint(endpoint);address=getAddress(address);
  const provider=wallet.provider,checker=new Contract(address,PROOF_ABI,provider),original=digest(plan);
  await wallet.assertReviewContext(plan.revision,plan.epoch);
  if(!same(await checker.collection(),plan.collection)||!same(await checker.market(),plan.target))throw Error('The proof checker is for a different NFT collection or market.');
  if(await checker.productionReady())throw Error('This client expects the reviewed development circuit setup.');
  const swap=marketInterface.decodeFunctionData('swap',plan.data);
  const [input,output,amount,minimum,,,lockUntil]=swap;
  if(input===output||(input!==ZeroAddress&&output!==ZeroAddress)||lockUntil!==0n)throw Error('Proofs currently support direct one-hop native/token swaps with immediate delivery.');
  const outer=utilityInterface.decodeFunctionData('executeUtility',plan.transaction.data);
  if(!same(plan.transaction.to,plan.account)||!same(plan.transaction.from,wallet.address)||BigInt(plan.transaction.value||0)!==0n)throw Error('Invalid NFT account transaction.');
  const latest=await provider.getBlockNumber();if(latest<1)throw Error('Wait for a completed source block.');
  const block=await provider.getBlock(latest-1),at={blockTag:block.number};
  const account=new Contract(plan.account,accountABI,provider),market=new Contract(plan.target,marketABI,provider);
  const [nonce,epoch,pool]=await Promise.all([account.actionNonce(at),account.sessionEpoch(at),market.poolInfo(input===ZeroAddress?output:input,at)]);
  if(String(epoch)!==String(plan.epoch)||nonce!==outer[0]||pool[2]===0n)throw Error('Wait for the account and pool to have an unchanged completed block, then prepare again.');
  const anchor={account:plan.account,epoch:String(epoch),nonce:String(nonce),sourceBlock:block.number,sourceHash:block.hash,
    data:plan.data,value:String(parseEther(String(plan.value))),transactionData:plan.transaction.data};
  const hash=BigInt(await checker.contextHash(anchor,at));
  const publicInput={contextHi:String(hash>>128n),contextLo:String(hash&((1n<<128n)-1n)),amount:String(amount),
    reserveIn:String(input===ZeroAddress?pool[0]:pool[1]),reserveOut:String(input===ZeroAddress?pool[1]:pool[0]),minimum:String(minimum)};
  const response=await fetcher(endpoint+'/prove',{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',
    headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(publicInput),signal});
  if(!response.ok)throw Error('Proof service declined this request. Check its token, allowed origin and arithmetic inputs.');
  const raw=await response.text();if(raw.length>65536)throw Error('Proof response exceeds its size limit.');
  const report=JSON.parse(raw);
  if(report.schema!==PROOF_SCHEMA||report.productionReady!==false||report.setup!=='single-machine-development-only')throw Error('Unsupported proof format or setup.');
  for(const [key,value] of Object.entries(publicInput))if(report.input?.[key]!==value)throw Error('Proof does not describe this exact request.');
  const {a,b,c,signals}=report.solidity||{};
  if(!Array.isArray(a)||a.length!==2||!Array.isArray(b)||b.length!==2||!b.every(x=>Array.isArray(x)&&x.length===2)||!Array.isArray(c)||c.length!==2||!Array.isArray(signals)||signals.length!==10)throw Error('Malformed Groth16 proof.');
  const outputAmount=await checker.check(anchor,a,b,c,signals);
  if(signal?.aborted||digest(plan)!==original)throw Error('Proof was cancelled or transaction terms changed.');
  await wallet.assertReviewContext(plan.revision,plan.epoch);
  const binding={checker:address,checkerCodeHash:keccak256(await provider.getCode(address)),anchor,a,b,c,signals,
    planDigest:original,createdAt:Date.now(),output:String(outputAmount),setup:report.setup};
  plan.quoteProofBinding=binding;
  return {plan,output:String(outputAmount),sourceBlock:block.number,checker:address,scope:'Exact one-hop quote arithmetic and current state binding',
    excluded:'EVM execution, token behavior, transfer success, gas and future state are not proved.',setup:'Development Groth16 setup; not production security'};
}
export async function assertQuoteProof(plan,provider) {
  const binding=plan.quoteProofBinding;if(!binding)return;
  if(Date.now()-binding.createdAt>120000||digest(plan)!==binding.planDigest)throw Error('Quote proof expired or transaction terms changed. Prove again.');
  if(!same(keccak256(await provider.getCode(binding.checker)),binding.checkerCodeHash))throw Error('Quote checker code changed.');
  if(String((await provider.getNetwork()).chainId)!==String(plan.chainId))throw Error('Quote proof chain changed.');
  const checker=new Contract(binding.checker,PROOF_ABI,provider);
  await checker.check(binding.anchor,binding.a,binding.b,binding.c,binding.signals);
}

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountProofDesk(container,{wallet,addresses={},review=()=>{},notify=()=>{}}={}) {
  const fields=[['Market address','market',addresses.NativeMarket||addresses.market||wallet?.modules?.market||''],
    ['Proof checker address','checker',addresses.NativeQuoteRehearsal||addresses.proof||''],
    ['Input token · zero address means native currency','input',ZeroAddress],['Output token','output',''],
    ['Amount in input token units','amount','0.01'],['Slippage percent','slippage','0.5'],
    ['Local proof service','endpoint','http://127.0.0.1:8791'],['Session token · kept only in memory','token','']];
  container.innerHTML='<h3>Quote proof research</h3><p>This optional research instrument proves the exact fee, integer rounding, minimum received and reserve updates for a one-hop swap. The checker binds it to this NFT account, custody, action and current market reserves.</p><p class="cf-small">Development setup only; every circuit input is public. This proves bounded arithmetic; the normal wallet simulation still checks execution. Balances, token behavior, transfers, gas and future state are outside this circuit.</p><form data-proof-form>'+fields.map(([label,name,value])=>`<label>${escape(label)}<input class="cf-input" name="${name}" type="${name==='token'?'password':'text'}" value="${escape(value)}" required autocomplete="off"></label>`).join('')+'<button class="cf-button" type="submit">Generate research proof & review</button></form><p data-proof-status aria-live="polite"></p><details><summary>Start the proof service</summary><p>Install the pinned dependencies in packages/rehearsal-proof, then run its serve command with ANIMA_PROOF_ORIGINS set to this application’s exact HTTP(S) origin. The service prints a session token. It holds no wallet key and sends no transactions.</p></details>';
  let generation=0,controller;
  const status=container.querySelector('[data-proof-status]');
  const cancel=()=>{generation++;controller?.abort();wallet.plan=null;};
  const submit=async event=>{
    event.preventDefault();cancel();const current=generation;controller=new AbortController();
    const requestController=controller,timeout=setTimeout(()=>requestController.abort(),60000);
    const form=new FormData(event.target),values=Object.fromEntries(form.entries());
    status.textContent='Simulating the account action and generating its proof…';
    try {
      const result=await new LiveProtocol(wallet).swap(values),plan=result.plan;
      if(wallet.plan===plan)wallet.plan=null;
      const proved=await proveSwapPlan(plan,wallet,{...values,signal:requestController.signal});
      if(current!==generation)throw Error('Terms changed during proof generation.');
      await assertQuoteProof(plan,wallet.provider);wallet.plan=plan;
      status.textContent=`Verified arithmetic proof. Quote: ${result.quote}; minimum: ${result.minimum}. Anchored at block ${proved.sourceBlock}. Normal wallet confirmation is still required.`;
      review(plan);
    }catch(error){if(current===generation){wallet.plan=null;status.textContent=error.message;notify(error.message);}}
    finally{clearTimeout(timeout);}
  };
  container.addEventListener('input',cancel);container.addEventListener('submit',submit);
  return ()=>{cancel();container.removeEventListener('input',cancel);container.removeEventListener('submit',submit);container.querySelector('[name="token"]').value='';};
}
export const ACTIONS=[];
