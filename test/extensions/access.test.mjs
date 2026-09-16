import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider,Contract,ContractFactory,Wallet,ZeroAddress,ZeroHash,keccak256,toUtf8Bytes,namehash,parseEther} from 'ethers';
import {deployStack,loadArtifact} from '../../scripts/lib/deploy-stack.mjs';

const names=['contracts/src/extensions/access/SessionSponsor.sol','contracts/src/extensions/access/GenesisNames.sol','contracts/src/lib/Crypto.sol','contracts/src/interfaces/Interfaces.sol'];
const sources=Object.fromEntries(names.map(name=>[name,{content:fs.readFileSync(name,'utf8')}]));
sources['AccessFixture.sol']={content:`pragma solidity ^0.8.24;
contract AccessRegistry {struct Record {address owner;address resolver;}mapping(bytes32=>Record) public records;constructor(){records[bytes32(0)].owner=msg.sender;}function owner(bytes32 n) external view returns(address){return records[n].owner;}function resolver(bytes32 n) external view returns(address){return records[n].resolver;}function setSubnodeRecord(bytes32 n,bytes32 label,address who,address resolver_,uint64) external {require(records[n].owner==msg.sender);records[keccak256(abi.encodePacked(n,label))]=Record(who,resolver_);}}
contract SponsoredCounter {uint256 public count;function step() external payable {count+=msg.value+1;}function fail() external pure {revert();}}
`};
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:1000},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
assert.deepEqual((output.errors||[]).filter(e=>e.severity==='error'),[]);
const artifacts=Object.assign({},...Object.values(output.contracts));
const types={Request:[['account','address'],['target','address'],['value','uint256'],['dataHash','bytes32'],['epoch','uint64'],['accountNonce','uint256'],['nonce','uint256'],['deadline','uint48'],['sponsor','address'],['relayer','address'],['callGas','uint256'],['maxGasPrice','uint256'],['maxRefund','uint256'],['instrumentId','uint256']].map(([name,type])=>({name,type}))};
async function fixture(t){
 const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},wallet:{totalAccounts:5},logging:{quiet:true}}),provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=5;
 t.after(async()=>{provider.destroy();await rpc.disconnect();});
 const signers=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i))),addresses=await Promise.all(signers.map(s=>s.getAddress()));
 const keys=Object.values(rpc.getInitialAccounts()).map(a=>new Wallet(a.secretKey));
 async function deploy(name,args=[]){const a=artifacts[name];const c=await new ContractFactory(a.abi,'0x'+a.evm.bytecode.object,signers[0]).deploy(...args);await c.waitForDeployment();return c;}
 const stack=await deployStack({signer:signers[0],attesterAddress:addresses[0]});
 async function mint(){const secret=keccak256(toUtf8Bytes('access-test-'+await stack.collection.totalSupply()));await(await stack.collection.commitAwakening(await stack.collection.commitmentFor(addresses[0],secret,addresses[0]),{value:parseEther('1')})).wait();await rpc.request({method:'evm_mine',params:[]});await(await stack.collection.revealAwakening(secret,addresses[0])).wait();const id=await stack.collection.totalSupply();return {id,account:new Contract(await stack.collection.accountOf(id),loadArtifact('SovereignAccount').abi,signers[0])};}
 return {rpc,provider,signers,addresses,keys,deploy,...stack,mint};
}
test('F07 owner and sponsor exact signatures pay gas from deposited budget, with replay, tamper, cancellation and custody rejection',async t=>{
 const f=await fixture(t),{account,id}=await f.mint(),relay=await f.deploy('SessionSponsor'),counter=await f.deploy('SponsoredCounter');
 const relayAddress=await relay.getAddress(),target=await counter.getAddress(),data=counter.interface.encodeFunctionData('step'),now=(await f.provider.getBlock('latest')).timestamp;
 await(await account.grantAction(relayAddress,target,ZeroAddress,keccak256(data),10,50,7,now+600,5)).wait();
 await(await relay.connect(f.signers[1]).depositFor(f.addresses[1],{value:parseEther('.1')})).wait();
 const domain={name:'ANIMA Session Sponsor',version:'2',chainId:31337,verifyingContract:relayAddress};
 const request={account:await account.getAddress(),target,value:7,dataHash:keccak256(data),epoch:await account.sessionEpoch(),accountNonce:await account.actionNonce(),nonce:1,deadline:now+500,sponsor:f.addresses[1],relayer:f.addresses[2],callGas:300000,maxGasPrice:100000000000n,maxRefund:parseEther('.01'),instrumentId:1};
 async function signatures(r){return Promise.all([f.keys[0].signTypedData(domain,types,r),f.keys[1].signTypedData(domain,types,r)]);}
 const sig=await signatures(request),ownerBalance=await f.provider.getBalance(f.addresses[0]),accountBalance=await f.provider.getBalance(await account.getAddress());
 await assert.rejects(relay.connect(f.signers[2]).relay({...request,value:8},data,...sig));
 await assert.rejects(relay.connect(f.signers[3]).relay(request,data,...sig));
 await(await relay.connect(f.signers[2]).relay(request,data,...sig,{gasLimit:650000})).wait();
 assert.equal(await counter.count(),8n);assert.equal(await f.provider.getBalance(f.addresses[0]),ownerBalance);assert.equal(await f.provider.getBalance(await account.getAddress()),accountBalance-7n);
 const credit=await relay.credits(f.addresses[2]);assert.ok(credit>0n&&credit<=request.maxRefund);assert.equal(await relay.deposits(f.addresses[1])+credit,parseEther('.1'));
 await assert.rejects(relay.connect(f.signers[2]).relay(request,data,...sig));
 const next={...request,nonce:2,accountNonce:await account.actionNonce()};const nextSig=await signatures(next);
 await(await relay.connect(f.signers[1]).cancel(next)).wait();await assert.rejects(relay.connect(f.signers[2]).relay(next,data,...nextSig));
 const transferred={...next,nonce:3},transferSig=await signatures(transferred);
 await(await f.collection.transferFrom(f.addresses[0],f.addresses[3],id)).wait();await assert.rejects(relay.connect(f.signers[2]).relay(transferred,data,...transferSig));
 await(await relay.connect(f.signers[2]).withdrawCredit(f.addresses[3])).wait();assert.equal(await relay.credits(f.addresses[2]),0n);
});
test('F07 failed authorized call consumes voucher and bounded refund, insufficient and expired vouchers cannot spend',async t=>{
 const f=await fixture(t),{account}=await f.mint(),relay=await f.deploy('SessionSponsor'),counter=await f.deploy('SponsoredCounter');const data=counter.interface.encodeFunctionData('fail'),target=await counter.getAddress(),now=(await f.provider.getBlock('latest')).timestamp;
 await(await account.grantAction(await relay.getAddress(),target,ZeroAddress,keccak256(data),1,1,0,now+600,2)).wait();
 const r={account:await account.getAddress(),target,value:0,dataHash:keccak256(data),epoch:await account.sessionEpoch(),accountNonce:0,nonce:4,deadline:now+500,sponsor:f.addresses[1],relayer:f.addresses[2],callGas:250000,maxGasPrice:100000000000n,maxRefund:parseEther('.01'),instrumentId:1};
 const domain={name:'ANIMA Session Sponsor',version:'2',chainId:31337,verifyingContract:await relay.getAddress()};const sig=await Promise.all([f.keys[0].signTypedData(domain,types,r),f.keys[1].signTypedData(domain,types,r)]);
 await assert.rejects(relay.connect(f.signers[2]).relay(r,data,...sig));await(await relay.depositFor(f.addresses[1],{value:parseEther('.01')})).wait();
 const receipt=await(await relay.connect(f.signers[2]).relay(r,data,...sig,{gasLimit:600000})).wait(),event=receipt.logs.map(l=>{try{return relay.interface.parseLog(l);}catch{return null;}}).find(l=>l?.name==='Relayed');
 assert.equal(event.args.success,false);assert.equal(await account.actionNonce(),0n);assert.equal(await relay.used(await relay.requestDigest(r)),true);await assert.rejects(relay.connect(f.signers[2]).relay(r,data,...sig));
 const expired={...r,nonce:5,deadline:1};const expiredSig=await Promise.all([f.keys[0].signTypedData(domain,types,expired),f.keys[1].signTypedData(domain,types,expired)]);await assert.rejects(relay.connect(f.signers[2]).relay(expired,data,...expiredSig));
});
test('F16 delegated ENS subname resolves the exact NFT account and live owner; mint and naming are atomic',async t=>{
 const f=await fixture(t),registry=await f.deploy('AccessRegistry'),parent=namehash('anima'),names=await f.deploy('GenesisNames',[await registry.getAddress(),await f.collection.getAddress(),parent]),factory=await f.deploy('NamedMintFactory',[await names.getAddress()]);
 await(await factory.createSession()).wait();const session=new Contract(await factory.sessionOf(f.addresses[0]),artifacts.NamedMintSession.abi,f.signers[0]);
 const secret=keccak256(toUtf8Bytes('named mint')),commitment=await f.collection.commitmentFor(await session.getAddress(),secret,f.addresses[0]);await(await session.commit(commitment,{value:1000})).wait();await f.rpc.request({method:'evm_mine',params:[]});
 await assert.rejects(session.reveal(secret,f.addresses[0]));assert.equal(await f.collection.totalSupply(),0n);
 await(await registry.setSubnodeRecord(ZeroHash,keccak256(toUtf8Bytes('anima')),await names.getAddress(),ZeroAddress,0)).wait();
 await assert.rejects(session.connect(f.signers[1]).reveal(secret,f.addresses[0]));
 await(await session.reveal(secret,f.addresses[0])).wait();const node=await names.nodeFor(1),account=await f.collection.accountOf(1);
 assert.equal(node,namehash('anima-1.anima'));assert.equal(await registry.resolver(node),await names.getAddress());assert.equal(await names.addr(node),account);assert.equal(await f.provider.getBalance(account),1000n);
 assert.deepEqual(Array.from(await names.nftRecord(node)),[31337n,await f.collection.getAddress(),1n,account,f.addresses[0]]);
 await(await names.connect(f.signers[1]).bind(1)).wait();await assert.rejects(names.bind(999));
 await(await f.collection.transferFrom(f.addresses[0],f.addresses[1],1)).wait();assert.equal((await names.nftRecord(node)).holder,f.addresses[1]);assert.equal(await names.text(node,'anima.owner'),f.addresses[1].toLowerCase());assert.equal(await names.addr(node),account);
});
test('F16 expired mint endowment is recoverable when the parent is unavailable',async t=>{
 const f=await fixture(t),registry=await f.deploy('AccessRegistry'),names=await f.deploy('GenesisNames',[await registry.getAddress(),await f.collection.getAddress(),namehash('anima')]),session=await f.deploy('NamedMintSession',[f.addresses[0],await names.getAddress()]);
 const secret=keccak256(toUtf8Bytes('expired')),hash=await f.collection.commitmentFor(await session.getAddress(),secret,f.addresses[0]);await(await session.commit(hash,{value:1000})).wait();
 for(let i=0;i<201;i++)await f.rpc.request({method:'evm_mine',params:[]});
 await(await session.cancelExpired()).wait();assert.equal(await f.provider.getBalance(await session.getAddress()),1000n);const before=await f.provider.getBalance(f.addresses[1]);await(await session.refund(f.addresses[1])).wait();assert.equal(await f.provider.getBalance(f.addresses[1]),before+1000n);
});
