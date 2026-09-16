import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Contract,Interface,ZeroAddress,formatEther} from 'ethers';
import {groth16} from '../../packages/rehearsal-proof/node_modules/snarkjs/main.js';
import {loadArtifacts,proveQuote,verifyQuote,validateInput} from '../../packages/rehearsal-proof/prover.mjs';
import {createProofServer} from '../../packages/rehearsal-proof/server.mjs';
import {assertQuoteProof,proveSwapPlan,proofEndpoint} from '../../web/extensions/proof.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const artifacts=loadArtifacts();
const base={contextHi:'1',contextLo:'2',amount:'100',reserveIn:'10000',reserveOut:'30000',minimum:'200'};
// snarkjs caches its worker curve; terminate it so node:test can finish normally.
after(async()=>{if(globalThis.curve_bn128)await globalThis.curve_bn128.terminate();});

test('Groth16 verifies exact rounding and every public signal is cryptographically bound',async()=>{
  const report=await proveQuote(base,{artifacts});
  assert.equal(await verifyQuote(report,{artifacts}),true);
  assert.deepEqual(report.publicSignals.slice(0,3),['296','10100','29704']);
  for(let i=0;i<10;i++){
    const signals=report.publicSignals.slice();signals[i]=String(BigInt(signals[i])+1n);
    assert.equal(await groth16.verify(artifacts.verificationKey,signals,report.proof),false,`tampered public signal ${i}`);
  }
  const tampered=structuredClone(report);tampered.proof.pi_a[0]=String(BigInt(tampered.proof.pi_a[0])+1n);
  assert.equal(await verifyQuote(tampered,{artifacts}),false);
});

test('the circuit itself rejects impossible minimum, reserve overflow, zero output and out-of-range context',async()=>{
  for(const change of [{minimum:'297'},{reserveIn:String((1n<<112n)-1n)},{amount:'1',reserveOut:'1',minimum:'1'},
    {contextHi:String(1n<<128n)},{minimum:'0'}]){
    await assert.rejects(groth16.fullProve({...base,...change},artifacts.wasm,artifacts.zkey,undefined,undefined,{singleThread:true}));
  }
  const large={...base,amount:String(1n<<100n),reserveIn:String(1n<<110n),reserveOut:String((1n<<112n)-1n),minimum:'1'};
  const report=await proveQuote(large,{artifacts});
  const expected=BigInt(large.amount)*9970n*BigInt(large.reserveOut)/(BigInt(large.reserveIn)*10000n+BigInt(large.amount)*9970n);
  assert.equal(report.publicSignals[0],String(expected));assert.equal(await verifyQuote(report,{artifacts}),true);
});

test('prover artifact integrity and canonical input restrictions reject substitutions',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'packages/rehearsal-proof/setup-manifest.json')));
  assert.equal(manifest.circuitSha256,createHash('sha256').update(fs.readFileSync(path.join(root,'packages/rehearsal-proof/native-quote.circom'))).digest('hex'));
  assert.equal(manifest.verifierSha256,createHash('sha256').update(fs.readFileSync(path.join(root,'contracts/src/extensions/proof/NativeQuoteGroth16Verifier.sol'))).digest('hex'));
  for(const change of [{amount:'0100'},{amount:'-1'},{minimum:'0'},{reserveIn:'1e4'},{contextLo:String(1n<<128n)},{secret:'not-accepted'}])assert.throws(()=>validateInput({...base,...change}));
});

let compiled;
function compile(){
  if(compiled)return compiled;
  const fixture=`// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IEpoch {function invalidateSessionsOnTransfer() external;}
contract QuoteCollectionFixture {
 address public owner;address public account;constructor(){owner=msg.sender;}
 function ownerOf(uint256) external view returns(address){return owner;}
 function accountOf(uint256) external view returns(address){return account;}
 function setAccount(address a) external{require(msg.sender==owner);account=a;}
 function initialStateOf(uint256) external pure returns(bytes32,bytes32){return(bytes32(uint256(1)),bytes32(uint256(2)));}
 function isApprovedForAll(address,address) external pure returns(bool){return false;}
 function getApproved(uint256) external pure returns(address){return address(0);}
 function transferOwner(address next) external {require(msg.sender==owner);owner=next;IEpoch(account).invalidateSessionsOnTransfer();}
}
contract QuoteLedgerFixture {
 address public collection;address public market;address public launchpad;address public vault;bool public isSealed=true;
 constructor(address c){collection=c;launchpad=msg.sender;}
 function setMarket(address m) external {require(msg.sender==launchpad);market=m;}
 function record(uint8,address,uint256,address,uint256,uint256,bytes32) external{}
}
contract QuoteTokenFixture {
 string public symbol="Q";uint8 public decimals=0;
 mapping(address=>uint256) public balanceOf;mapping(address=>mapping(address=>uint256))public allowance;
 constructor(){balanceOf[msg.sender]=10000000;}
 function approve(address s,uint256 n) external returns(bool){allowance[msg.sender][s]=n;return true;}
 function transfer(address to,uint256 n) external returns(bool){balanceOf[msg.sender]-=n;balanceOf[to]+=n;return true;}
 function transferFrom(address from,address to,uint256 n)external returns(bool){allowance[from][msg.sender]-=n;balanceOf[from]-=n;balanceOf[to]+=n;return true;}
}`;
  const sources={'Fixture.sol':{content:fixture}};
  for(const file of ['contracts/src/protocol/NativeMarket.sol','contracts/src/core/SovereignAccount.sol','contracts/src/extensions/proof/NativeQuoteRehearsal.sol'])sources[file]={content:fs.readFileSync(path.join(root,file),'utf8')};
  const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:1000},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{import:file=>({contents:fs.readFileSync(path.join(root,file),'utf8')})}));
  const errors=(output.errors||[]).filter(x=>x.severity==='error');assert.equal(errors.length,0,errors.map(x=>x.formattedMessage).join('\n'));
  compiled=Object.assign({},...Object.values(output.contracts));return compiled;
}
async function chain(t){
  const node=ganache.provider({logging:{quiet:true},chain:{chainId:31337,hardfork:'shanghai'},wallet:{totalAccounts:3}});
  t.after(()=>node.disconnect());const provider=new BrowserProvider(node,undefined,{cacheTimeout:-1});
  const owner=await provider.getSigner(0),other=await provider.getSigner(1),code=compile();
  const deploy=async(name,args=[])=>{const a=code[name],c=await new ContractFactory(a.abi,'0x'+a.evm.bytecode.object,owner).deploy(...args);await c.waitForDeployment();return c;};
  const collection=await deploy('QuoteCollectionFixture'),ledger=await deploy('QuoteLedgerFixture',[collection.target]),token=await deploy('QuoteTokenFixture');
  const account=await deploy('SovereignAccount',[collection.target,1,await owner.getAddress()]);
  await(await collection.setAccount(account.target)).wait();
  const market=await deploy('NativeMarket',[ledger.target]);await(await ledger.setMarket(market.target)).wait();
  await(await token.approve(market.target,30000)).wait();await(await market.seed(token.target,30000,1,{value:10000})).wait();
  const checker=await deploy('NativeQuoteRehearsal',[market.target]);
  await(await owner.sendTransaction({to:account.target,value:1000})).wait();
  await node.request({method:'evm_mine',params:[]});await node.request({method:'evm_mine',params:[]});
  return {node,provider,owner,other,collection,ledger,token,account,market,checker};
}
async function makePlan(c,{input=ZeroAddress,output=c.token.target,amount=100,minimum=200,lockUntil=0}={}){
  const block=await c.provider.getBlock('latest'),nonce=await c.account.actionNonce(),epoch=await c.account.sessionEpoch();
  const data=c.market.interface.encodeFunctionData('swap',[input,output,amount,minimum,block.timestamp+600,1,lockUntil]);
  const native=input===ZeroAddress?BigInt(amount):0n;
  const transaction=await c.account.executeUtility.populateTransaction(nonce,block.timestamp+600,input,c.market.target,native,data,input===ZeroAddress?0:amount);
  transaction.from=await c.owner.getAddress();
  return {chainId:'31337',collection:c.collection.target,tokenId:'1',account:c.account.target,epoch:String(epoch),target:c.market.target,data,
    value:formatEther(native),transaction,revision:1};
}
const proofWallet=c=>({provider:c.provider,address:c.owner.address,assertReviewContext:async()=>{}});

test('real NativeMarket swap proof verifies onchain and matches actual account reserve and token effects',async t=>{
  const c=await chain(t),plan=await makePlan(c);
  const response=async(_url,request)=>({ok:true,text:async()=>JSON.stringify(await proveQuote(JSON.parse(request.body),{artifacts}))});
  const result=await proveSwapPlan(plan,proofWallet(c),{checker:c.checker.target,endpoint:'http://127.0.0.1:8791',token:'t'.repeat(32),fetcher:response});
  assert.equal(result.output,'296');await assertQuoteProof(plan,c.provider);
  const {anchor,a,b,c:proofC,signals}=plan.quoteProofBinding;
  assert.equal(await c.checker.check(anchor,a,b,proofC,signals),296n);
  const changed=structuredClone(plan);changed.transaction.data=changed.transaction.data.slice(0,-2)+'00';
  // Altering even the outer utility envelope invalidates the client binding.
  changed.transaction.from=await c.other.getAddress();await assert.rejects(assertQuoteProof(changed,c.provider),/terms changed/);
  const mutate=[{nonce:'1'},{epoch:'2'},{sourceHash:'0x'+'11'.repeat(32)},{value:'101'}];
  for(const change of mutate)await assert.rejects(c.checker.check({...anchor,...change},a,b,proofC,signals));
  const wrongSignals=signals.slice();wrongSignals[0]=String(BigInt(signals[0])+1n);await assert.rejects(c.checker.check(anchor,a,b,proofC,wrongSignals));
  await(await c.owner.sendTransaction(plan.transaction)).wait();
  const pool=await c.market.poolInfo(c.token.target);
  assert.equal(pool[0],10100n);assert.equal(pool[1],29704n);assert.equal(await c.token.balanceOf(c.account.target),296n);
  await assert.rejects(assertQuoteProof(plan,c.provider));
  await c.node.request({method:'evm_mine',params:[]});await c.node.request({method:'evm_mine',params:[]});
  const sell=await makePlan(c,{input:c.token.target,output:ZeroAddress,amount:100,minimum:30});
  const sold=await proveSwapPlan(sell,proofWallet(c),{checker:c.checker.target,endpoint:'http://127.0.0.1:8791',token:'t'.repeat(32),fetcher:response});
  assert.equal(sold.output,'33');await assertQuoteProof(sell,c.provider);
  await(await c.owner.sendTransaction(sell.transaction)).wait();
  assert.equal(await c.token.balanceOf(c.account.target),196n);
  assert.equal(await c.token.allowance(c.account.target,c.market.target),0n);
  assert.equal(await c.provider.getBalance(c.account.target),933n);
});

test('proof survives unrelated blocks but rejects changed reserves, custody epoch, expired anchors and unsupported routes',async t=>{
  const c=await chain(t),plan=await makePlan(c);
  const fetcher=async(_url,r)=>({ok:true,text:async()=>JSON.stringify(await proveQuote(JSON.parse(r.body),{artifacts}))});
  await proveSwapPlan(plan,proofWallet(c),{checker:c.checker.target,endpoint:'http://127.0.0.1:8791',token:'t'.repeat(32),fetcher});
  const snapshot=await c.node.request({method:'evm_snapshot',params:[]});
  await c.node.request({method:'evm_mine',params:[]});await assertQuoteProof(plan,c.provider);
  const block=await c.provider.getBlock('latest');await(await c.market.swap(ZeroAddress,c.token.target,10,1,block.timestamp+600,0,0,{value:10})).wait();
  await assert.rejects(assertQuoteProof(plan,c.provider));
  await c.node.request({method:'evm_revert',params:[snapshot]});
  const second=await c.node.request({method:'evm_snapshot',params:[]});
  await(await c.collection.transferOwner(await c.other.getAddress())).wait();await assert.rejects(assertQuoteProof(plan,c.provider));
  await c.node.request({method:'evm_revert',params:[second]});
  for(let i=0;i<257;i++)await c.node.request({method:'evm_mine',params:[]});
  await assert.rejects(assertQuoteProof(plan,c.provider));
  const route=await makePlan(c,{lockUntil:BigInt(block.timestamp+1000)});
  await assert.rejects(proveSwapPlan(route,proofWallet(c),{checker:c.checker.target,endpoint:'http://127.0.0.1:8791',token:'t'.repeat(32),fetcher}),/immediate delivery/);
});

test('proof service authenticates exact allowed origin and returns a genuinely verifiable proof',async t=>{
  const token='s'.repeat(32),{server}=createProofServer({token,origins:['https://anima.example'],artifacts});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const endpoint='http://127.0.0.1:'+server.address().port;
  const request=(extra={})=>fetch(endpoint+'/prove',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token,origin:'https://anima.example',...extra},body:JSON.stringify(base)});
  assert.equal((await request({authorization:'wrong'})).status,401);
  assert.equal((await request({origin:'https://evil.example'})).status,403);
  const response=await request();assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'https://anima.example');
  assert.equal(await verifyQuote(await response.json(),{artifacts}),true);
  const invalid=await fetch(endpoint+'/prove',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({...base,minimum:'999'})});
  assert.equal(invalid.status,400);
  for(const endpoint of ['http://evil.example','http://localhost:8791','http://127.0.0.1:8791/path','https://user:pass@example.com'])assert.throws(()=>proofEndpoint(endpoint));
});
