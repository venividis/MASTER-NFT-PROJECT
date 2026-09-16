import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider,Contract,ContractFactory,Interface,keccak256,toUtf8Bytes,parseEther} from 'ethers';
import {ACTIONS,ExtensionDesk,matchesRuntime,parseActionFields} from '../../web/extensions/desk.mjs';
import {ARTIFACTS} from '../../web/extensions/artifacts.mjs';
import {ConfluenceWallet} from '../../web/confluence/wallet.mjs';
import {deployStack,loadArtifact} from '../../scripts/lib/deploy-stack.mjs';

const ADDRESS='0x0000000000000000000000000000000000000011',OTHER='0x0000000000000000000000000000000000000022';
const entry=id=>{const a=ACTIONS.find(x=>x.id===id);assert.ok(a,id);return a;};
function replaceByte(code,index,value='ff'){return code.slice(0,2+index*2)+value+code.slice(4+index*2);}
function shell(fields={},target=ADDRESS,sender='wallet'){
 const nodes={'#ex-target':{value:target},'#ex-sender':{value:sender},'#ex-summary':{textContent:''},'#ex-actions':{innerHTML:'',replaceChildren(){this.innerHTML='';}},'#cf-transaction-review':{cleared:0,replaceChildren(){this.cleared++;}}};
 return{nodes,querySelector:selector=>nodes[selector],querySelectorAll:selector=>selector==='[data-ex-field]'?Object.entries(fields).map(([name,value])=>({dataset:{exField:name},value:String(value)})):[]};
}
function deskWith(wallet,directory={chainId:'31337',modules:{}}){const reviews=[],desk=new ExtensionDesk(wallet,p=>reviews.push(p),(_key,fallback)=>directory??fallback,()=>{});return{desk,reviews};}

test('Workbench parses exact payable auction args without injecting native value into the ABI; rejects unsafe or ambiguous inputs',()=>{
 const a=entry('F01.bid'),args=parseActionFields(a,{lots:'17',limitPrice:'9007199254740993',value:'153122387330596881'});
 assert.deepEqual(args,[17n,9007199254740993n]);const iface=new Interface(ARTIFACTS.ContinuousClearingAuction.abi),data=iface.encodeFunctionData(a.method,args),decoded=iface.decodeFunctionData(a.method,data);assert.deepEqual(Array.from(decoded),args);
 assert.throws(()=>parseActionFields(a,{lots:'-1',limitPrice:'1',value:'1'}),/outside uint64/);
 assert.throws(()=>parseActionFields(a,{lots:String(2n**64n),limitPrice:'1',value:'1'}),/outside uint64/);
 assert.throws(()=>parseActionFields(a,{lots:'1.5',limitPrice:'1',value:'1'}),/whole raw units/);
 const bool={fields:[{name:'enabled',type:'bool',label:'Enabled'}]};for(const invalid of ['yes','0','',undefined])assert.throws(()=>parseActionFields(bool,{enabled:invalid}));
 assert.deepEqual(parseActionFields(bool,{enabled:'false'}),[false]);assert.deepEqual(parseActionFields(bool,{enabled:true}),[true]);
 const tuple={fields:[{name:'terms',type:'json',label:'Terms'}]};assert.throws(()=>parseActionFields(tuple,{terms:'[9007199254740993]'}),/quoted decimal strings/);assert.throws(()=>parseActionFields(tuple,{terms:'{"amount":9007199254740993}'}),/quoted decimal strings/);
 assert.deepEqual(parseActionFields(tuple,{terms:'["9007199254740993",true,7]'}),[['9007199254740993',true,7]]);
});

test('Every offered generic action encodes the released contract ABI with exact field count and payable separation',()=>{
 const sample=param=>{if(param.baseType==='array')return Array.from({length:param.arrayLength===-1?1:param.arrayLength},()=>sample(param.arrayChildren));if(param.baseType==='tuple')return param.components.map(sample);if(param.type==='address')return ADDRESS;if(param.type==='bool')return false;if(param.type==='string')return 'reviewed text';if(param.type==='bytes')return '0x1234';if(/^bytes\d+$/.test(param.type))return '0x'+'ab'.repeat(Number(param.type.slice(5)));if(/^(?:u?int)\d*$/.test(param.type))return '1';throw Error('Unhandled fixture ABI type '+param.type);};
 const seen=new Set();for(const action of ACTIONS){assert.ok(!seen.has(action.id),'Unique action ID '+action.id);seen.add(action.id);
  const artifact=ARTIFACTS[action.contract];assert.ok(artifact,'Released artifact '+action.contract);const iface=new Interface(artifact.abi),fn=iface.getFunction(action.method),fields=action.fields.filter(f=>f.name!==action.valueField);assert.ok(fn,'Released callable ABI for '+action.id);assert.equal(fields.length,fn.inputs.length,action.id);
  const values=Object.fromEntries(fields.map((f,i)=>{const value=sample(fn.inputs[i]);return[f.name,f.type==='json'||f.type.includes('[')||f.type.startsWith('tuple')?JSON.stringify(value):String(value)];}));
  if(action.valueField){values[action.valueField]='19';assert.equal(fn.stateMutability,'payable',action.id);}
  const args=parseActionFields(action,values),data=iface.encodeFunctionData(action.method,args);assert.equal(iface.parseTransaction({data,value:action.valueField?19n:0n}).name,fn.name,action.id);
 }
});

test('Workbench accepts only immutable-slot substitution and rejects opcode, length, malformed-hex and invalid-mask tampering',()=>{
 const a=ARTIFACTS.House,ref=Object.values(a.immutableReferences).flat()[0];assert.ok(ref,'House must carry compiler immutable references');
 assert.equal(matchesRuntime(a.runtime,a),true);const changed=replaceByte(a.runtime,ref.start);assert.equal(matchesRuntime(changed,a),true);
 const masked=new Set(Object.values(a.immutableReferences).flat().flatMap(({start,length})=>Array.from({length},(_,i)=>start+i))),outside=Array.from({length:(a.runtime.length-2)/2},(_,i)=>i).find(i=>!masked.has(i));
 const original=a.runtime.slice(2+outside*2,4+outside*2);assert.equal(matchesRuntime(replaceByte(a.runtime,outside,original==='ff'?'00':'ff'),a),false);
 assert.equal(matchesRuntime(a.runtime+'00',a),false);assert.equal(matchesRuntime('0xzz',{runtime:'0xzz'}),false);
 assert.equal(matchesRuntime(a.runtime,{...a,immutableReferences:{bad:[{start:-1,length:32}]}}),false);
 assert.equal(matchesRuntime(a.runtime,{...a,immutableReferences:{bad:[{start:1.5,length:32}]}}),false);
});

test('Workbench enforces the inspected full codehash even when the rendered target is passed explicitly',async()=>{
 const a=ARTIFACTS.House,ref=Object.values(a.immutableReferences).flat()[0],changed=replaceByte(a.runtime,ref.start);
 const wallet={chainId:31337n,provider:{getCode:async()=>changed},connectSigner:async()=>{},signer:null};
 const{desk}=deskWith(wallet,{chainId:'31337',modules:{House:{address:ADDRESS,runtimeCodeHash:keccak256(a.runtime)}}});
 await assert.rejects(()=>desk.contract('House',ADDRESS),/inspected deployment/);
 assert.equal(await (await desk.contract('House',OTHER)).getAddress(),OTHER,'An explicitly different manual address still needs its own immutable-term review.');
 const wrong=deskWith(wallet,{chainId:'84532',modules:{}}).desk;await assert.rejects(()=>wrong.contract('House',ADDRESS),/another chain/);
});

test('Rendered workbench forms expose every declared field once and preserve textarea/boolean controls as actual HTML',()=>{
 const container=shell(),{desk}=deskWith({connected:false,tokenId:1n},{modules:{},chainId:''});desk.container=container;const forms=[];
 for(const action of ACTIONS){desk.commonAction=action;desk.selected=action.id;desk.drawActions();forms.push({id:action.id,html:container.nodes['#ex-actions'].innerHTML,expected:action.fields.map(f=>({name:f.name,tag:f.type==='bool'?'select':['json','string','bytes'].includes(f.type)?'textarea':'input'}))});}
 const script=`import json,sys\nfrom html.parser import HTMLParser\nclass Parser(HTMLParser):\n def __init__(self):\n  super().__init__(convert_charrefs=True); self.fields=[]; self.forms=0; self.ends=0\n def handle_starttag(self,tag,attrs):\n  a=dict(attrs)\n  if tag=='form': self.forms+=1\n  if 'data-ex-field' in a: self.fields.append({'name':a['data-ex-field'],'tag':tag})\n def handle_endtag(self,tag):\n  if tag=='form': self.ends+=1\nresult=[]\nfor item in json.load(sys.stdin):\n p=Parser();p.feed(item['html']);result.append({'id':item['id'],'fields':p.fields,'forms':p.forms,'ends':p.ends})\njson.dump(result,sys.stdout)`;
 const parsed=JSON.parse(execFileSync('python',['-c',script],{input:JSON.stringify(forms),encoding:'utf8',maxBuffer:4*1024*1024}));
 for(let i=0;i<forms.length;i++){assert.equal(parsed[i].forms,1,forms[i].id);assert.equal(parsed[i].ends,1,forms[i].id);assert.deepEqual(parsed[i].fields,forms[i].expected,forms[i].id);}
});

test('Workbench discards a simulation when its amount or destination changes before review completes',async()=>{
 let release;const wait=new Promise(resolve=>release=resolve),plan={transaction:{to:ADDRESS,data:'0x1234'},gas:'21000',revision:0};
 const wallet={plan:null,prepareExternal:async()=>{await wait;return plan;}}, {desk,reviews}=deskWith(wallet);desk.container=shell();
 const pending=desk.review({transaction:{to:ADDRESS,data:'0x1234'},sender:'wallet'});desk.invalidate();release();
 await assert.rejects(()=>pending,/Terms changed/);assert.equal(wallet.plan,null);assert.equal(reviews.length,0);
});

const fixtureSource=fs.readFileSync(new URL('./experimental-fixtures.sol',import.meta.url),'utf8');
const fixtures=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Fixtures.sol':{content:fixtureSource}},settings:{optimizer:{enabled:true,runs:1000},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
assert.deepEqual((fixtures.errors||[]).filter(x=>x.severity==='error'),[]);
const mockArtifacts=fixtures.contracts['Fixtures.sol'];
async function tx(p){return(await p).wait();}
async function setup(t){
 const rpc=ganache.provider({chain:{chainId:31337,hardfork:'shanghai'},logging:{quiet:true},wallet:{totalAccounts:3}}),provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=5;
 t.after(async()=>{provider.destroy();await rpc.disconnect();});const signer=await provider.getSigner(0),borrower=await provider.getSigner(1),owner=await signer.getAddress(),borrowerAddress=await borrower.getAddress();
 async function deploy(name,args=[]){const a=mockArtifacts[name]||loadArtifact(name),c=await new ContractFactory(a.abi,a.bytecode||'0x'+a.evm.bytecode.object,signer).deploy(...args);await c.waitForDeployment();return c;}
 const stack=await deployStack({signer,attesterAddress:owner});const secret=keccak256(toUtf8Bytes('extension-desk-integration'));
 await tx(stack.collection.commitAwakening(await stack.collection.commitmentFor(owner,secret,owner),{value:parseEther('1')}));await rpc.request({method:'evm_mine',params:[]});await tx(stack.collection.revealAwakening(secret,owner));
 const accountAddress=await stack.collection.accountOf(1),account=new Contract(accountAddress,loadArtifact('SovereignAccount').abi,signer);
 const wallet=new ConfluenceWallet();Object.assign(wallet,{connected:true,revision:0,raw:rpc,provider,signer,address:owner,chainId:31337n,core:stack.collection,collection:stack.collection.target,tokenId:1n,account:accountAddress,contract:account});
 const quote=await deploy('ExperimentalTokenMock',[6]),base=await deploy('ExperimentalTokenMock',[18]),oracle=await deploy('ExperimentalOracleMock'),venue=await deploy('ExperimentalVenueMock',[quote.target,base.target,10n**18n]),gate=await deploy('ExperimentGate',[owner]);
 for(const address of[owner,borrowerAddress,accountAddress,venue.target]){await tx(quote.mint(address,10n**25n));await tx(base.mint(address,10n**25n));}
 const at=(await provider.getBlock('latest')).timestamp;await tx(oracle.set(2000n*10n**6n,at));await tx(venue.configure(2000n*10n**6n,false,false));
 const house=await deploy('House',[gate.target,quote.target,base.target,oracle.target,venue.target,10n**18n,3600,60,100,11000]);await tx(gate.set(house.target,true));await tx(quote.connect(borrower).approve(house.target,10n**20n));
 const terms=[1000n*10n**6n,2000n*10n**6n,2020n*10n**6n,1485n*10n**15n,1900n*10n**6n,2100n*10n**6n,at+1000,at+3000];await tx(house.connect(borrower).offer(terms));
 const dir={chainId:'31337',modules:{House:{address:house.target,runtimeCodeHash:keccak256(await provider.getCode(house.target))}}},{desk,reviews}=deskWith(wallet,dir);desk.group='experimental';desk.selected='F08.fund';
 return{rpc,provider,signer,owner,borrower,account,wallet,quote,base,house,terms,desk,reviews};
}

test('Workbench funds computed House principal through real SovereignAccount.executeUtility and resets its exact approval atomically',async t=>{
 const f=await setup(t);f.desk.container=shell({id:1,minimumBase:String(f.terms[3]),deadline:f.terms[7]},f.house.target,'account');
 const plan=await f.desk.submit(),decoded=f.account.interface.parseTransaction({data:plan.transaction.data});
 assert.equal(decoded.name,'executeUtility');assert.equal(decoded.args.asset,f.quote.target);assert.equal(decoded.args.target,f.house.target);assert.equal(decoded.args.allowanceAmount,f.terms[1]);
 assert.equal(plan.allowance,String(f.terms[1]));assert.ok(f.desk.container.nodes['#ex-summary'].textContent.includes('Fixed debt raw units: '+f.terms[2]));
 await f.wallet.send();assert.equal((await f.house.position(1)).lender,f.account.target);assert.equal(await f.quote.allowance(f.account.target,f.house.target),0n);assert.equal(await f.account.actionNonce(),1n);
 assert.equal(f.reviews.length,1);
});

test('Workbench personal-wallet funding reviews exact ERC20 approval first, then the intended action; a partial allowance resets before replacement',async t=>{
 const f=await setup(t);f.desk.container=shell({id:1,minimumBase:String(f.terms[3]),deadline:f.terms[7]},f.house.target,'wallet');
 await tx(f.quote.approve(f.house.target,1));const reset=await f.desk.submit(),tokenInterface=f.quote.interface;
 assert.equal(reset.target,f.quote.target);assert.equal(tokenInterface.parseTransaction({data:reset.data}).args[1],0n);await f.wallet.send();
 const approval=await f.desk.submit();assert.equal(approval.target,f.quote.target);assert.equal(tokenInterface.parseTransaction({data:approval.data}).args[1],f.terms[1]);await f.wallet.send();
 const intended=await f.desk.submit();assert.equal(intended.target,f.house.target);assert.equal(f.house.interface.parseTransaction({data:intended.data}).name,'fund');await f.wallet.send();
 assert.equal((await f.house.position(1)).lender,f.owner);assert.equal(await f.quote.allowance(f.owner,f.house.target),0n);assert.equal(f.reviews.length,3);
});
