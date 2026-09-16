import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFragment} from 'parse5';
import {renderSaleDetail,renderSaleSetup} from '../../web/launchpad/sale-ui.mjs';

const address=n=>'0x'+String(n).repeat(40),base={id:'1',name:'Community Light',symbol:'LIGHT',about:'A shared beginning',supply:'1000000000000000000000000',raised:'5000000000000000000',softCap:'2000000000000000000',hardCap:'10000000000000000000',contribution:'1000000000000000000',publicTokens:'500000000000000000000000',lpTokens:'400000000000000000000000',founderTokens:'100000000000000000000000',claimable:'100000000000000000000000',account:address(1),creator:address(2),token:address(3),launchpad:address(4),market:address(5),vault:address(6),room:'9',liquidityBps:8000,vestingDays:180,opens:1800000000,closes:1800004000,blockNumber:123,founderLock:null,treasuryLock:null};
function inspect(html){const root=parseFragment(html),nodes=[];const visit=n=>{nodes.push(n);for(const c of n.childNodes||[])visit(c);};visit(root);const attr=(n,k)=>n.attrs?.find(a=>a.name===k)?.value;return {nodes,attr,actions:nodes.map(n=>attr(n,'data-ld')).filter(Boolean),fields:nodes.map(n=>attr(n,'data-ld-field')).filter(Boolean),text:nodes.filter(n=>n.nodeName==='#text').map(n=>n.value).join(' ')};}

test('sale lifecycle exposes only available financial actions, with distinct token-claim and refund language',()=>{
  const cases=[
    ['scheduled',{},['read-sale']],
    ['funding',{contribute:true,withdraw:true},['sale-contribute','sale-withdraw','read-sale']],
    ['awaiting-settlement',{settle:true},['sale-settle','read-sale']],
    ['settled',{claim:true},['sale-claim','read-sale']],
    ['refundable',{claim:true},['sale-claim','read-sale']],
    ['settled',{},['read-sale']],
  ];
  for(const [phase,actions,expected]of cases){const doc=inspect(renderSaleDetail({...base,phase,actions},{amount:'0.25',native:'ETH'}));assert.deepEqual(doc.actions,expected,phase);assert.equal(doc.fields.includes('saleAmount'),!!(actions.contribute||actions.withdraw),phase);}
  const refund=inspect(renderSaleDetail({...base,phase:'refundable',actions:{claim:true},claimable:base.contribution}));assert.match(refund.text,/1 ETH/);assert.match(refund.text,/Claim full refund/);assert.doesNotMatch(refund.text,/Claim purchased tokens/);
  const claimed=inspect(renderSaleDetail({...base,phase:'settled',actions:{},claimed:true}));assert.match(claimed.text,/already been claimed/);assert.ok(!claimed.actions.includes('sale-claim'));
});

test('actual vested amounts and beneficiaries appear together; release controls disappear at zero entitlement',()=>{
  const founderLock={id:'4',amount:'100000000000000000000000',released:'20000000000000000000000',releasable:'30000000000000000000000',start:1800000000,cliff:1802592000,end:1815552000,beneficiary:address(2),linear:true};
  const s={...base,phase:'settled',actions:{},founderLock};const ready=inspect(renderSaleDetail(s));assert.ok(ready.actions.includes('sale-release:founder'));assert.ok(!ready.actions.includes('sale-release:treasury'));assert.match(ready.text,/30000 LIGHT/);assert.match(ready.text,/Fixed beneficiary/);assert.match(ready.text,new RegExp(address(2)));assert.match(ready.text,/Linear vesting with a cliff/);
  const done=inspect(renderSaleDetail({...s,founderLock:{...founderLock,released:founderLock.amount,releasable:'0'}}));assert.ok(!done.actions.includes('sale-release:founder'));assert.match(done.text,/Fully released/);
});

test('setup keeps its controls mounted while typing and declares their exact prerequisite fields',()=>{
  const disconnected=inspect(renderSaleSetup());assert.deepEqual(disconnected.actions,['connect']);
  const requirements={'sale-load':'saleLaunchpad','sale-setup:ledger':'saleCollection','sale-setup:market':'saleLedger','sale-setup:vault':'saleLedger','sale-setup:launchpad':'saleLedger','sale-setup:seal':'saleLedger saleMarket saleVault saleLaunchpad'};
  const connectedCases=[{}, {saleCollection:'0x1'}, {saleCollection:address(2)}, {saleCollection:address(2),saleLedger:address(3)}, {saleCollection:address(2),saleLedger:address(3),saleMarket:address(4),saleVault:address(5),saleLaunchpad:address(6)}];
  for(const values of connectedCases){const doc=inspect(renderSaleSetup({account:address(1),values}));assert.deepEqual(doc.actions,Object.keys(requirements));assert.deepEqual(new Set(doc.fields),new Set(['saleCollection','saleLedger','saleMarket','saleVault','saleLaunchpad']));for(const [action,fields]of Object.entries(requirements)){const node=doc.nodes.find(n=>doc.attr(n,'data-ld')===action);assert.equal(doc.attr(node,'data-ld-needs'),fields);assert.equal(doc.attr(node,'disabled'),undefined);}}
  const overridden=inspect(renderSaleSetup({account:address(1),config:{saleLaunchpad:address(6)},values:{saleLaunchpad:''}}));const input=overridden.nodes.find(n=>overridden.attr(n,'data-ld-field')==='saleLaunchpad');assert.equal(overridden.attr(input,'value'),'');assert.ok(overridden.actions.includes('sale-load'));
});

test('untrusted token descriptions and form values stay text, and rendered controls have accessible labels',()=>{
  const attack='\"><script>alert(1)</script><img src=x onerror=alert(2)>',doc=inspect(renderSaleDetail({...base,name:attack,symbol:attack,about:attack,phase:'funding',actions:{contribute:true}},{amount:attack}));assert.ok(!doc.nodes.some(n=>n.tagName==='script'||n.tagName==='img'));assert.ok(doc.text.includes(attack));
  for(const html of [renderSaleDetail({...base,phase:'funding',actions:{contribute:true}}),renderSaleSetup({values:{saleCollection:attack}})]){const d=inspect(html),ids=d.nodes.map(n=>d.attr(n,'id')).filter(Boolean);assert.equal(ids.length,new Set(ids).size);for(const input of d.nodes.filter(n=>n.tagName==='input'))assert.ok(d.nodes.some(n=>n.tagName==='label'&&d.attr(n,'for')===d.attr(input,'id')));for(const button of d.nodes.filter(n=>n.tagName==='button'))assert.equal(d.attr(button,'type'),'button');assert.ok(!d.nodes.some(n=>n.tagName==='script'||n.attrs?.some(a=>/^on/i.test(a.name))));}
});
