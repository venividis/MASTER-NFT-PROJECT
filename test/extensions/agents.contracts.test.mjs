import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Wallet,ZeroHash,ZeroAddress,keccak256,toUtf8Bytes,Signature,parseEther} from 'ethers';
import {BoundedOperator} from '../../agent/extensions/operator.mjs';
import {signRegistration,discoverProviders,providerReputation} from '../../agent/extensions/providers.mjs';
import {ExactX402Buyer,PurchaseLedger,encodeHeader,decodeHeader,eip3009ReceiptVerifier} from '../../agent/extensions/x402.mjs';
import {ACTIONS,prepareProviderRegistration,signProviderRegistration,listProviderPage} from '../../web/extensions/agents.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const mocks=`// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {SovereignAccount} from "contracts/src/core/SovereignAccount.sol";
import {ECDSA} from "contracts/src/lib/Crypto.sol";
contract AgentCollectionFixture {
 address public owner;SovereignAccount public account;
 constructor(){owner=msg.sender;}
 function makeAccount() external {account=new SovereignAccount(address(this),1,address(this));}
 function ownerOf(uint256) external view returns(address){return owner;}
 function initialStateOf(uint256) external pure returns(bytes32,bytes32){return(bytes32(uint256(1)),bytes32(uint256(2)));}
 function transfer(address next) external {require(msg.sender==owner);owner=next;account.invalidateSessionsOnTransfer();}
}
contract AgentTargetFixture {uint256 public calls;uint256 public total;address public caller;function touch(uint256 n) external payable {calls++;total+=n;caller=msg.sender;}}
contract AgentTokenFixture {
 mapping(address=>uint256) public balanceOf;mapping(address=>mapping(address=>uint256)) public allowance;mapping(address=>mapping(bytes32=>bool)) public authorizationState;
 bytes32 immutable DOMAIN;event Transfer(address indexed from,address indexed to,uint256 value);event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce);
 constructor(){DOMAIN=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),keccak256("LocalUSD"),keccak256("1"),block.chainid,address(this)));}
 function mint(address to,uint256 n) external {balanceOf[to]+=n;}
 function approve(address who,uint256 n) external returns(bool){allowance[msg.sender][who]=n;return true;}
 function transfer(address to,uint256 n) external returns(bool){_move(msg.sender,to,n);return true;}
 function transferFrom(address from,address to,uint256 n) external returns(bool){require(allowance[from][msg.sender]>=n);allowance[from][msg.sender]-=n;_move(from,to,n);return true;}
 function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s) external {
 require(block.timestamp>validAfter&&block.timestamp<validBefore&&!authorizationState[from][nonce]);
 bytes32 h=keccak256(abi.encodePacked("\\x19\\x01",DOMAIN,keccak256(abi.encode(keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"),from,to,value,validAfter,validBefore,nonce))));
 (address signer,bool ok)=ECDSA.tryRecover(h,abi.encodePacked(r,s,v));require(ok&&signer==from);authorizationState[from][nonce]=true;emit AuthorizationUsed(from,nonce);_move(from,to,value);
 }
 function _move(address from,address to,uint256 n) private {require(balanceOf[from]>=n);balanceOf[from]-=n;balanceOf[to]+=n;emit Transfer(from,to,n);}
}`;
let compiled;
function artifacts(){
  if(compiled)return compiled;
  const names=['AgentPolicyGuard','AgentCommerce','ProviderDirectory'];
  const sources=Object.fromEntries(names.map(n=>{const f=`contracts/src/extensions/agents/${n}.sol`;return[f,{content:fs.readFileSync(path.join(root,f),'utf8')}];}));sources['fixtures.sol']={content:mocks};
  const result=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:100},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{import:file=>({contents:fs.readFileSync(path.join(root,file),'utf8')})}));
  const errors=(result.errors??[]).filter(e=>e.severity==='error');assert.equal(errors.length,0,errors.map(e=>e.formattedMessage).join('\n'));compiled=Object.fromEntries(Object.values(result.contracts).flatMap(file=>Object.entries(file)));return compiled;
}
async function fixture(t){
  const chain=ganache.provider({logging:{quiet:true},wallet:{totalAccounts:7,defaultBalance:100},chain:{chainId:31337,hardfork:'shanghai'},miner:{blockGasLimit:30000000}});
  const provider=new BrowserProvider(chain,undefined,{cacheTimeout:-1});t.after(()=>chain.disconnect());
  const signers=await Promise.all(Array.from({length:7},(_,i)=>provider.getSigner(i)));const signing=Object.values(chain.getInitialAccounts()).map(x=>new Wallet(x.secretKey));
  async function deploy(name,args=[]){const a=artifacts()[name];const c=await new ContractFactory(a.abi,'0x'+a.evm.bytecode.object,signers[0]).deploy(...args);await c.waitForDeployment();return c;}
  return {chain,provider,signers,signing,deploy};
}
async function reverted(fn){await assert.rejects(async()=>{const tx=await fn();if(tx?.wait)await tx.wait();});}
const hash=x=>keccak256(toUtf8Bytes(x));

test('F03 live operator uses real asset-budgeted account grants, exact reviewed action, rate/budget limits and audit receipts',async t=>{
  const {provider,signers,deploy}=await fixture(t);const [owner,worker,nextOwner]=signers;
  const collection=await deploy('AgentCollectionFixture');await (await collection.makeAccount()).wait();
  const {Contract}=await import('ethers');const account=new Contract(await collection.account(),artifacts().SovereignAccount.abi,owner);
  const guard=await deploy('AgentPolicyGuard'),target=await deploy('AgentTargetFixture');
  await (await owner.sendTransaction({to:await account.getAddress(),value:parseEther('1')})).wait();
  const now=(await provider.getBlock('latest')).timestamp;const data=target.interface.encodeFunctionData('touch',[7]);
  await (await account.grantAction(guard.target,target.target,ZeroAddress,keccak256(data),10,20,10,now+1000,5)).wait();
  await (await guard.grantBudgeted(account.target,1,worker.address,data,now,10)).wait();
  await reverted(()=>guard.connect(worker).run(1,0,target.interface.encodeFunctionData('touch',[8])));
  const receipts=[];const operator=new BoundedOperator({provider,signer:worker,guard:await guard.getAddress(),grantId:1,data,chainId:31337,execute:true,receipt:async r=>receipts.push(r)});
  const capped=new BoundedOperator({provider,signer:worker,guard:await guard.getAddress(),grantId:1,data,chainId:31337,execute:true,maxGasPerAction:25000});await assert.rejects(capped.tick(),/gas budget/);
  const first=await operator.tick();assert.equal(first.status,'executed');assert.equal(await target.total(),7n);assert.equal(await target.caller(),await account.getAddress());assert.notEqual(first.auditRoot,ZeroHash);
  await reverted(()=>guard.connect(worker).run(1,0,data));assert.equal((await operator.tick()).status,'waiting');
  await provider.send('evm_increaseTime',[11]);await provider.send('evm_mine',[]);assert.equal((await operator.tick()).status,'executed');assert.equal((await guard.getGrant(1)).remaining,0n);
  await assert.rejects(operator.tick(),/exhausted/);assert.equal(receipts.filter(r=>r.status==='executed').length,2);
  await (await account.grantAction(guard.target,target.target,ZeroAddress,keccak256(data),1,1,0,now+1000,5)).wait();
  await (await guard.grantBudgeted(account.target,2,worker.address,data,now,0)).wait();
  const malicious=new BoundedOperator({provider,signer:worker,guard:await guard.getAddress(),grantId:2,data,chainId:31337,execute:true,propose:async s=>({grantId:2,expectedNonce:s.nonce,data:target.interface.encodeFunctionData('touch',[999])})});
  await assert.rejects(malicious.tick(),/authorization/);
  await (await account.revokeInstrument(2)).wait();await reverted(async()=>guard.connect(worker).run(2,await account.actionNonce(),data));
  await reverted(()=>account.createSession(guard.target,target.target,data.slice(0,10),10,now,now+1000,10));
  await (await collection.transfer(await nextOwner.getAddress())).wait();await reverted(async()=>guard.connect(worker).run(2,await account.actionNonce(),data));
  await assert.rejects(malicious.tick(),/custody/);
});

test('Every agent workbench form matches the compiled contract argument types',()=>{
  const compiled=artifacts();for(const action of ACTIONS){const method=compiled[action.contract].abi.find(f=>f.type==='function'&&f.name===action.method);assert.ok(method,`${action.contract}.${action.method} exists`);assert.deepEqual(action.fields.map(f=>f.type),method.inputs.map(f=>f.type),action.id);}
});

test('F11 ERC-8183 lifecycle protects funding, submitted work, evaluator decisions, refunds and replay',async t=>{
  const {provider,signers,deploy}=await fixture(t);const [client,worker,evaluator,other]=signers;
  const token=await deploy('AgentTokenFixture'),commerce=await deploy('AgentCommerce',[await token.getAddress()]);
  await (await token.mint(await client.getAddress(),1000)).wait();await (await token.approve(await commerce.getAddress(),1000)).wait();
  const now=(await provider.getBlock('latest')).timestamp;
  const newJob=async(providerAddress=worker.address)=>{await (await commerce.createJob(providerAddress,await evaluator.getAddress(),now+100,'Service terms',ZeroAddress)).wait();return await commerce.jobCounter();};
  const id=await newJob(ZeroAddress);await (await commerce.setBudget(id,100)).wait();await reverted(()=>commerce.fund(id,100));
  await (await commerce.setProvider(id,await worker.getAddress())).wait();await reverted(()=>commerce.connect(other).setBudget(id,2));await reverted(()=>commerce.fund(id,99));
  await (await commerce.fund(id,100)).wait();await reverted(()=>commerce.reject(id,ZeroHash));await reverted(()=>commerce.connect(other).submit(id,hash('work')));
  await (await commerce.connect(worker).submit(id,hash('work'))).wait();await reverted(()=>commerce.connect(worker).complete(id,ZeroHash));await (await commerce.connect(evaluator).complete(id,hash('accepted'))).wait();
  assert.equal(await token.balanceOf(await worker.getAddress()),100n);await reverted(()=>commerce.connect(evaluator).complete(id,ZeroHash));
  const bad=await newJob();await (await commerce.setBudget(bad,100)).wait();await (await commerce.fund(bad,100)).wait();await (await commerce.connect(worker).submit(bad,hash('bad'))).wait();await (await commerce.connect(evaluator).reject(bad,hash('rejected'))).wait();assert.equal((await commerce.jobs(bad)).status,4n);
  const expires=await newJob();await (await commerce.setBudget(expires,100)).wait();await (await commerce.fund(expires,100)).wait();await reverted(()=>commerce.claimRefund(expires));await provider.send('evm_increaseTime',[101]);await provider.send('evm_mine',[]);await (await commerce.connect(other).claimRefund(expires)).wait();assert.equal((await commerce.jobs(expires)).status,5n);assert.equal(await token.balanceOf(await commerce.getAddress()),0n);
});

test('F12 signed provider discovery rejects impersonation/replay and honors paid-job review attribution and revocation',async t=>{
  const {provider,signers,signing,deploy}=await fixture(t);const [client,worker,evaluator,imposter]=signers;
  const token=await deploy('AgentTokenFixture'),commerce=await deploy('AgentCommerce',[await token.getAddress()]),directory=await deploy('ProviderDirectory',[await commerce.getAddress()]);
  const now=(await provider.getBlock('latest')).timestamp;const metadata=JSON.stringify({name:'Atlas cartographer',services:[{name:'maps',endpoint:'https://provider.example/maps'}]});
  const registration=await signRegistration({signer:signing[1],chainId:31337,directory:await directory.getAddress(),metadata,uri:'ipfs://example',capabilities:hash('maps'),nonce:0,validUntil:now+1000});
  const args=Object.values(registration);await reverted(async()=>directory.register(await imposter.getAddress(),...args.slice(1)));await (await directory.register(...args)).wait();await reverted(()=>directory.register(...args));
  const page=await discoverProviders({provider,directory:await directory.getAddress(),fetchMetadata:async()=>metadata});assert.equal(page.providers.length,1);assert.equal(page.providers[0].metadata.name,'Atlas cartographer');assert.equal(page.providers[0].endpointVerified,false);
  await assert.rejects(discoverProviders({provider,directory:await directory.getAddress(),fetchMetadata:async()=>metadata+' '}),/hash mismatch/);
  await (await token.mint(await client.getAddress(),1000)).wait();await (await token.approve(await commerce.getAddress(),1000)).wait();await (await commerce.createJob(await worker.getAddress(),await evaluator.getAddress(),now+500,'Maps',ZeroAddress)).wait();await (await commerce.setBudget(1,50)).wait();await (await commerce.fund(1,50)).wait();
  await reverted(()=>directory.giveFeedback(1,5,hash('early')));await (await commerce.connect(worker).submit(1,hash('maps'))).wait();await (await commerce.connect(evaluator).complete(1,ZeroHash)).wait();
  await reverted(()=>directory.connect(imposter).giveFeedback(1,5,hash('fraud')));await (await directory.giveFeedback(1,4,hash('review'))).wait();await reverted(()=>directory.giveFeedback(1,5,hash('repeat')));
  const reputation=()=>providerReputation({provider,directory:directory.target,address:worker.address,fromBlock:0,toBlock:1000,trustedReviewers:[client.address]});assert.equal((await reputation()).average,4);await (await directory.revokeFeedback(1)).wait();assert.equal((await reputation()).average,null);
  const browserContext={registry:directory,provider,signer:signing[1]};const capsule=await prepareProviderRegistration({...browserContext,metadata,uri:'data:application/json,'+encodeURIComponent(metadata),capabilities:hash('maps'),validUntil:now+1000,active:false});const signed=await signProviderRegistration({...browserContext,capsule}),m=signed.message;await (await directory.register(m.provider,m.metadataHash,signed.uri,m.capabilities,m.nonce,m.validUntil,m.active,signed.signature)).wait();
  assert.equal((await listProviderPage(browserContext)).providers.length,0);const inactive=await listProviderPage({...browserContext,includeInactive:true});assert.equal(inactive.providers[0].revision,'2');assert.equal(inactive.providers[0].active,false);
});

test('F11 x402 SDK exact authorization settles real local tokens and rejects replay, forged receipt, mismatched price and overspend',async t=>{
  const {provider,signers,signing,deploy}=await fixture(t);const [payer,payee,facilitator]=signers;const token=await deploy('AgentTokenFixture');await (await token.mint(payer.address,100)).wait();
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'anima-x402-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
  const pin={url:'https://service.example/map',network:'eip155:31337',asset:token.target,payTo:payee.address,name:'LocalUSD',version:'1',maxAmount:'10',maxTimeoutSeconds:120};
  let amount='10',forged=false;let lastPayload;
  const transport=async(url,init)=>{
    const requirements={scheme:'exact',network:pin.network,asset:pin.asset,payTo:pin.payTo,amount,maxTimeoutSeconds:60,extra:{name:pin.name,version:pin.version}};
    if(!init.headers['PAYMENT-SIGNATURE'])return new Response('',{status:402,headers:{'PAYMENT-REQUIRED':encodeHeader({x402Version:2,resource:{url},accepts:[requirements]})}});
    const payload=decodeHeader(init.headers['PAYMENT-SIGNATURE']);lastPayload=payload;const a=payload.payload.authorization;const sig=Signature.from(payload.payload.signature);
    const tx=await token.connect(facilitator).transferWithAuthorization(a.from,a.to,a.value,a.validAfter,a.validBefore,a.nonce,sig.v,sig.r,sig.s);await tx.wait();
    return new Response(JSON.stringify({map:'generated'}),{status:200,headers:{'PAYMENT-RESPONSE':encodeHeader({success:true,network:pin.network,payer:payer.address,transaction:forged?ZeroHash:tx.hash})}});
  };
  const ledger=new PurchaseLedger(path.join(tmp,'budget.json'),{budget:25,maxPurchases:5});
  const buyer=new ExactX402Buyer({signer:signing[0],allowed:[pin],ledger,transport,verifySettlement:eip3009ReceiptVerifier(provider)});
  const first=await buyer.purchase({id:'map1',url:pin.url});assert.equal(JSON.parse(first.body).map,'generated');assert.equal(await token.balanceOf(payee.address),10n);
  await assert.rejects(buyer.purchase({id:'map1',url:pin.url}),/replay/);const a=lastPayload.payload.authorization,sig=Signature.from(lastPayload.payload.signature);await reverted(()=>token.connect(facilitator).transferWithAuthorization(a.from,a.to,a.value,a.validAfter,a.validBefore,a.nonce,sig.v,sig.r,sig.s));
  amount='11';await assert.rejects(buyer.purchase({id:'expensive',url:pin.url}),/authorized/);amount='10';forged=true;await assert.rejects(buyer.purchase({id:'unknown',url:pin.url}),/independently verified/);
  await assert.rejects(buyer.purchase({id:'overspend',url:pin.url}),/budget/);const state=JSON.parse(fs.readFileSync(path.join(tmp,'budget.json'),'utf8'));assert.equal(state.reserved,'20');assert.equal(state.purchases.unknown.status,'authorized');assert.ok(!fs.readFileSync(path.join(tmp,'budget.json'),'utf8').includes(lastPayload.payload.signature));
  await assert.rejects(buyer.purchase({id:'wrong_url',url:'https://evil.example'}),/not authorized/);
  const revoked=new ExactX402Buyer({signer:signing[0],allowed:[pin],ledger,transport,verifySettlement:eip3009ReceiptVerifier(provider),authority:async()=>false});await assert.rejects(revoked.purchase({id:'revoked',url:pin.url}),/revoked/);
});
