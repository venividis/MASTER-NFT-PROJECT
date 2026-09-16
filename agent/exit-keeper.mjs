#!/usr/bin/env node
/** Explicit operator tool. Default is read-only. No browser timer is an execution service. */
import {JsonRpcProvider,Wallet,Contract,keccak256,parseUnits} from 'ethers';
import {EXIT_ABI} from '../web/exit/live.mjs';
export async function scanEligible(vault,planIds){const jobs=[];for(const id of planIds){const n=Number(await vault.sliceCount(id));if(n>64)throw Error('Unsupported installment count.');for(let i=0;i<n;i++)if(await vault.eligible(id,i))jobs.push({plan:String(id),index:i});}return jobs;}
async function main(){
 const env=process.env,execute=process.argv.includes('--execute');if(!env.EXIT_RPC_URL||!env.EXIT_VAULT||!env.EXIT_PLAN_IDS||!env.EXIT_CHAIN_ID)throw Error('Set EXIT_RPC_URL, EXIT_VAULT, EXIT_PLAN_IDS and EXIT_CHAIN_ID. Default execution is read-only.');
 const provider=new JsonRpcProvider(env.EXIT_RPC_URL,undefined,{cacheTimeout:-1});try{
  if(String((await provider.getNetwork()).chainId)!==env.EXIT_CHAIN_ID)throw Error('RPC chain does not match EXIT_CHAIN_ID.');
  const ids=env.EXIT_PLAN_IDS.split(',');if(!ids.length||ids.length>32||ids.some(n=>!/^\d{1,78}$/.test(n)||BigInt(n)<1n))throw Error('Choose 1–32 explicit plan IDs.');
  const hash=keccak256(await provider.getCode(env.EXIT_VAULT));if(execute&&(!env.EXIT_VAULT_CODE_HASH||hash.toLowerCase()!==env.EXIT_VAULT_CODE_HASH.toLowerCase()))throw Error('The deployed vault code must match an independently verified EXIT_VAULT_CODE_HASH.');
  const reader=new Contract(env.EXIT_VAULT,EXIT_ABI,provider),jobs=await scanEligible(reader,ids);console.log(JSON.stringify({mode:execute?'explicit execution':'read-only',chainId:env.EXIT_CHAIN_ID,vault:env.EXIT_VAULT,codeHash:hash,eligible:jobs}));if(!execute)return;
  if(!env.EXIT_KEEPER_PRIVATE_KEY||!env.EXIT_MAX_RUN_GAS_WEI||!env.EXIT_MAX_FEE_GWEI)throw Error('Execution requires a separately funded keeper key, EXIT_MAX_RUN_GAS_WEI and EXIT_MAX_FEE_GWEI.');
  if(!['1','11155111','31337','1337'].includes(env.EXIT_CHAIN_ID))throw Error('Only Ethereum execution-gas fee models are supported; L2 data-fee adapters are not implemented.');
  let remaining=BigInt(env.EXIT_MAX_RUN_GAS_WEI);if(remaining<=0n)throw Error('Gas budget must be positive.');const maxFee=parseUnits(env.EXIT_MAX_FEE_GWEI,'gwei');if(maxFee<=0n)throw Error('Maximum fee must be positive.');const signer=new Wallet(env.EXIT_KEEPER_PRIVATE_KEY,provider),vault=reader.connect(signer);
  for(const job of jobs){if(!await reader.eligible(job.plan,job.index))continue;
   let estimated;try{estimated=await vault.executeSlice.estimateGas(job.plan,job.index);}catch{console.log(JSON.stringify({...job,status:'not executable at the committed minimum; left pending'}));continue;}
   const gasLimit=estimated*120n/100n+1n,fees=await provider.getFeeData(),fee=fees.maxFeePerGas||fees.gasPrice;if(!fee||fee>maxFee){console.log(JSON.stringify({...job,status:'gas price above operator cap; left pending'}));continue;}
   const reserve=gasLimit*fee;if(reserve>remaining||reserve>await provider.getBalance(signer.address,'pending'))throw Error('Keeper gas budget exhausted; remaining installments left pending.');remaining-=reserve;
   // Any broadcast/receipt uncertainty stops this process. It never blindly resends or loosens minimums.
   const tx=await vault.executeSlice(job.plan,job.index,{gasLimit,...(fees.maxFeePerGas?{maxFeePerGas:fee,maxPriorityFeePerGas:fees.maxPriorityFeePerGas||0n}:{gasPrice:fee})});console.log(JSON.stringify({...job,status:'submitted',hash:tx.hash}));
   const receipt=await tx.wait(2,180000);if(!receipt||receipt.status!==1)throw Error('Execution receipt unavailable or reverted; inspect the submitted hash before restarting.');const paid=receipt.gasUsed*receipt.gasPrice;remaining+=reserve-paid;console.log(JSON.stringify({...job,status:'confirmed',hash:tx.hash,block:receipt.blockNumber,gasPaid:String(paid)}));
  }
 }finally{provider.destroy();}
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])main().catch(error=>{console.error(error.shortMessage||error.message);process.exitCode=1;});
