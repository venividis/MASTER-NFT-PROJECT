import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {EventEmitter} from 'node:events';
import {BrowserProvider,Contract,parseEther,ZeroAddress} from 'ethers';
import {LaunchChain} from '../../web/launchpad/chain.mjs';
import {CommunitySaleClient} from '../../web/launchpad/sale-client.mjs';
import {VaultStrategyClient} from '../../web/launchpad/vault-client.mjs';
import {VaultStrategyDesk} from '../../web/launchpad/vault-ui.mjs';
import {deployStack,deployContract} from '../../scripts/lib/deploy-stack.mjs';

async function environment(t){
 const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},wallet:{totalAccounts:3},logging:{quiet:true}}),provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 const signers=await Promise.all([0,1,2].map(i=>provider.getSigner(i))),addresses=await Promise.all(signers.map(s=>s.getAddress())),stack=await deployStack({signer:signers[0],attesterAddress:addresses[0],royaltyBps:0});
 class Wallet extends EventEmitter{async request({method,params=[]}){return rpc.request({method:method==='eth_requestAccounts'?'eth_accounts':method,params});}}
 const chain=new LaunchChain({storage:null,pollInterval:10,receiptTimeout:3000});await chain.connect(new Wallet());const client=new VaultStrategyClient(chain),sale=new CommunitySaleClient(chain);
 t.after(async()=>{chain.disconnect();provider.destroy();await rpc.disconnect();});
 const send=async plan=>{let record;do{await chain.reviewNext();record=await chain.sendReviewed();assert.equal(record.status,'confirmed');}while(chain.plan);return record;};
 const ledger=(await send(await sale.setup({kind:'ledger',collection:stack.collection.target}))).contractAddress,modules={};
 modules.vault=(await send(await client.setup({ledger}))).contractAddress;
 for(const kind of ['market','launchpad'])modules[kind]=(await send(await sale.setup({kind,ledger}))).contractAddress;
 await assert.rejects(client.verify(modules.vault),/sealed/);await send(await sale.setup({kind:'seal',ledger,...modules}));
 const token=await deployContract('GenesisToken',signers[0],['Retained tokens','KEEP',parseEther('1000000'),addresses[0]]);
 return {rpc,provider,signers,addresses,chain,client,sale,send,ledger,token,...modules};
}
const advance=async(x,seconds)=>{await x.rpc.request({method:'evm_increaseTime',params:[seconds]});await x.rpc.request({method:'evm_mine',params:[]});};

test('optional TimeVault strategy deploys verified infrastructure, funds exact ERC20 custody and releases only to the fixed beneficiary',async t=>{
 const x=await environment(t),beneficiary=x.addresses[1];assert.equal((await x.client.verify(x.vault)).ledger,x.ledger);
 await(await x.token.approve(x.vault,parseEther('999'))).wait();
 const plan=await x.client.deposit({vault:x.vault,asset:x.token.target,amount:'100',beneficiary,linear:true,days:'2',cliffDays:'1'});
 assert.equal(plan.payer,x.addresses[0]);assert.equal(plan.spend[0].amount,parseEther('100'));assert.equal(plan.deadline,plan.summary.start);assert.match(plan.summary.rights,/principal/);
 const reset=await x.chain.reviewNext();assert.equal(reset.approval.amount,'0');await x.chain.sendReviewed();assert.equal(await x.token.allowance(x.addresses[0],x.vault),0n);
 await x.send(x.chain.plan);assert.equal(await x.token.balanceOf(x.vault),parseEther('100'));assert.equal(await x.token.allowance(x.addresses[0],x.vault),0n);
 const lock=await x.client.read({vault:x.vault,id:'1'});assert.equal(lock.beneficiary,beneficiary);assert.equal(lock.formatted.amount,'100.0');assert.equal(lock.releasable,'0');assert.equal(lock.cliff-lock.start,86400);
 await assert.rejects(x.client.release({vault:x.vault,id:'1'}),/No assets/);await assert.rejects(x.client.extend({vault:x.vault,id:'1',additionalDays:'1'}),/Only/);
 await advance(x,300+86400);const halfway=await x.client.read({vault:x.vault,id:'1'});assert.ok(BigInt(halfway.releasable)>=parseEther('50'));assert.ok(BigInt(halfway.releasable)<parseEther('50.1'));
 const release=await x.client.release({vault:x.vault,id:'1',recipient:x.addresses[2]});assert.equal(release.summary.recipient,beneficiary);await x.send(release);assert.equal(await x.token.balanceOf(x.addresses[2]),0n);assert.ok(await x.token.balanceOf(beneficiary)>=parseEther('50'));
 await advance(x,86400);await x.send(await x.client.release({vault:x.vault,id:'1'}));assert.equal(await x.token.balanceOf(beneficiary),parseEther('100'));assert.equal(await x.token.balanceOf(x.vault),0n);
 const listed=await x.client.list({vault:x.vault,beneficiary,limit:1});assert.equal(listed.total,'1');assert.equal(listed.locks[0].released,parseEther('100').toString());assert.equal(listed.next,null);
});

test('native cliff custody supports beneficiary-only extension and honest reviewed release; wrong runtimes and impossible schedules stop preparation',async t=>{
 const x=await environment(t);await assert.rejects(x.client.verify(x.market),/bytecode/);
 const base={vault:x.vault,asset:ZeroAddress,amount:'1',beneficiary:x.addresses[0],linear:false,days:'1'};
 await assert.rejects(x.client.deposit({...base,linear:true,cliffDays:'2'}),/cliff/);await assert.rejects(x.client.deposit({...base,beneficiary:ZeroAddress}),/beneficiary/);await assert.rejects(x.client.deposit({...base,amount:'999999'}),/hold/);
 const plan=await x.client.deposit(base);assert.deepEqual(plan.spend,[]);assert.equal(plan.request.value,parseEther('1'));await x.send(plan);assert.equal(await x.provider.getBalance(x.vault),parseEther('1'));
 const old=await x.client.read({vault:x.vault,id:'1'}),extension=await x.client.extend({vault:x.vault,id:'1',additionalDays:'1'});assert.equal(extension.summary.newEnd,old.end+86400);await x.send(extension);
 const extended=await x.client.read({vault:x.vault,id:'1'});assert.equal(extended.cliff,old.end+86400);await advance(x,300+86400);await assert.rejects(x.client.release({vault:x.vault,id:'1'}),/No assets/);
 await advance(x,86400);await x.send(await x.client.release({vault:x.vault,id:'1'}));assert.equal(await x.provider.getBalance(x.vault),0n);
 const ui=new VaultStrategyDesk(x.chain);ui.configure({vault:x.vault,beneficiary:x.addresses[0]});ui.result=await x.client.read({vault:x.vault,id:'1'});assert.match(ui.render(),/principal and proportional LP fees/);assert.match(ui.render(),/Previously released/);
});
