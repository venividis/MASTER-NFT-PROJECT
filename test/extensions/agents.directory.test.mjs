import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Wallet,keccak256,toUtf8Bytes,ZeroAddress} from 'ethers';
import {listProviderPage,inspectProviderMetadata,readProviderFeedback,prepareProviderRegistration,signProviderRegistration,validateProviderRegistration,mountProviderDirectory} from '../../web/extensions/agents.mjs';
const require=createRequire(new URL('../../agent/extensions/package.json',import.meta.url));const {parseHTML}=require('linkedom');

const a='0x'+'11'.repeat(20),b='0x'+'22'.repeat(20),c='0x'+'33'.repeat(20),d='0x'+'44'.repeat(20),hash=value=>keccak256(toUtf8Bytes(value));
function fixture(){
  const data=new Map([a,b,c].map((address,i)=>{const raw=JSON.stringify({name:['Atlas','Dormant','Builder'][i],description:'Signed service claim',services:[{name:'maps',endpoint:`https://${i}.service.example/maps`}]});return[address,{raw,metadataHash:hash(raw),uri:'data:application/json,'+encodeURIComponent(raw),capabilities:hash('maps'),revision:1n,validUntil:2000n,active:i!==1}];}));
  const calls=[];let nonce=0n;
  const registry={getAddress:async()=>d,list:async(start,limit,options)=>{calls.push({start,limit,options});return [a,b,c].slice(start,start+limit);},count:async()=>3n,provider:async address=>data.get(address),nonces:async()=>nonce,commerce:async()=>c,filters:{FeedbackGiven:(_,address)=>({address})},queryFilter:async()=>[],register:{populateTransaction:async(...args)=>({to:d,data:'0x12345678',args})}};
  const provider={getNetwork:async()=>({chainId:31337n}),getBlock:async()=>({number:12000,timestamp:1000}),getBlockNumber:async()=>12000};
  const commerce={getAddress:async()=>c};return {registry,provider,commerce,data,calls,setNonce:n=>{nonce=n;}};
}

test('Provider directory pagination filters a chain snapshot without making endpoint requests',async()=>{
  const f=fixture();const first=await listProviderPage({...f,start:0,limit:2});assert.deepEqual(first.providers.map(p=>p.address),[a]);assert.equal(first.next,2);assert.equal(first.hasNext,true);assert.equal(first.total,'3');assert.equal(f.calls[0].options.blockTag,12000);
  const next=await listProviderPage({...f,start:first.next,limit:2});assert.deepEqual(next.providers.map(p=>p.address),[c]);assert.equal(next.hasNext,false);
  const inactive=await listProviderPage({...f,start:0,limit:2,includeInactive:true,query:b});assert.deepEqual(inactive.providers.map(p=>p.address),[b]);assert.equal(inactive.providers[0].active,false);
  await assert.rejects(listProviderPage({...f,limit:101}),/1–100/);await assert.rejects(listProviderPage({...f,start:-1}),/nonnegative/);
  let networks=0;await assert.rejects(listProviderPage({...f,provider:{...f.provider,getNetwork:async()=>({chainId:++networks===1?31337n:1n})}}),/network changed/);
});

test('Provider metadata is verified byte-for-byte and full service claims remain data',()=>{
  const f=fixture(),entry=f.data.get(a);const verified=inspectProviderMetadata(entry,entry.raw);assert.equal(verified.services[0].endpoint,'https://0.service.example/maps');assert.equal(verified.endpointVerified,false);
  assert.throws(()=>inspectProviderMetadata(entry,entry.raw+' '),/signed hash/);const bad=JSON.stringify({name:'bad',services:[{name:'x',endpoint:5}]});assert.throws(()=>inspectProviderMetadata({metadataHash:hash(bad)},bad),/Invalid provider service/);
});

test('Provider feedback validates paid job source, attribution, withdrawal and reviewer scope',async()=>{
  const f=fixture();f.registry.queryFilter=async()=>[1n,2n].map(jobId=>({args:{jobId},transactionHash:hash(String(jobId))}));
  f.registry.feedback=async id=>({provider:b,reviewer:a,score:id===1n?4n:5n,evidence:hash('evidence'),revoked:id===2n});
  f.commerce.jobs=async()=>({provider:b,client:a,evaluator:c,status:3n,budget:50n,description:'Map job'});f.commerce.wasFunded=async()=>true;
  const input={...f,address:b,fromBlock:2000,toBlock:12000,trustedReviewers:[a]};const result=await readProviderFeedback(input);assert.equal(result.reviews.length,2);assert.equal(result.trustedAverage,4);assert.equal(result.trustedReviewerCount,1);assert.equal(result.reviews[0].job.description,'Map job');
  assert.equal((await readProviderFeedback({...input,trustedReviewers:[]})).trustedAverage,null);await assert.rejects(readProviderFeedback({...input,fromBlock:0}),/10,000/);await assert.rejects(readProviderFeedback({...input,commerce:{...f.commerce,getAddress:async()=>a}}),/immutable job source/);
  f.commerce.wasFunded=async()=>false;await assert.rejects(readProviderFeedback(input),/paid, settled job/);
});

test('Provider registration signatures bind exact metadata, current signer, registry, chain, expiry and nonce',async()=>{
  const f=fixture(),signer=Wallet.createRandom(),raw=f.data.get(a).raw;const options={...f,signer,metadata:raw,uri:'data:application/json,'+encodeURIComponent(raw),capabilities:hash('maps'),validUntil:2000};
  const capsule=await prepareProviderRegistration(options),signed=await signProviderRegistration({...options,capsule});assert.equal(signed.message.provider,signer.address);assert.ok(signed.signature);
  await validateProviderRegistration({...options,capsule:signed,requireSignature:true});
  await assert.rejects(signProviderRegistration({...options,capsule,signer:Wallet.createRandom()}),/another wallet/);
  await assert.rejects(signProviderRegistration({...options,capsule:{...capsule,uri:'https://changed.example'}}),/metadata URI/);
  await assert.rejects(signProviderRegistration({...options,capsule:{...capsule,domain:{...capsule.domain,chainId:'1'}}}),/chain/);
  f.setNonce(1n);await assert.rejects(signProviderRegistration({...options,capsule}),/nonce changed/);
});

test('Provider directory UI paginates, compares, verifies card data, reports errors and requires signing consent',async t=>{
  const {document,window}=parseHTML('<html><body><main></main></body></html>');const previousDocument=globalThis.document,previousFetch=globalThis.fetch;globalThis.document=document;let endpointRequests=0;globalThis.fetch=async()=>{endpointRequests++;throw Error('No endpoint request expected');};t.after(()=>{globalThis.document=previousDocument;globalThis.fetch=previousFetch;});
  const f=fixture(),signer=Wallet.createRandom(),reviews=[],container=document.querySelector('main');
  const cleanup=mountProviderDirectory(container,{...f,signer,wallet:{signer},contract:async name=>name==='ProviderDirectory'?f.registry:f.commerce,review:async value=>reviews.push(value)});t.after(cleanup);
  const button=label=>[...container.querySelectorAll('button')].find(b=>b.textContent===label),input=label=>[...container.querySelectorAll('input,textarea')].find(n=>n.getAttribute('aria-label')===label);
  const click=async element=>{assert.ok(element,'button exists');element.dispatchEvent(new window.Event('click'));for(let i=0;element.disabled&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,1));};
  input('Providers per page').value='2';await click(button('Load provider page'));assert.ok(container.textContent.includes('Showing 1 matches from 2 records'));assert.equal(button('Next providers').disabled,false);
  await click(button('Inspect card and reviews'));await click(button('Read embedded onchain metadata'));assert.ok(container.textContent.includes('https://0.service.example/maps'));assert.equal(endpointRequests,0);
  const compare=container.querySelector(`input[aria-label="Compare ${a}"]`);compare.checked=true;compare.dispatchEvent(new window.Event('change'));assert.ok(container.textContent.includes('Selected providers'));
  await click(button('Next providers'));assert.ok(container.textContent.includes(c));assert.equal(button('Next providers').disabled,true);await click(button('Previous providers'));assert.equal(button('Previous providers').disabled,true);
  input('Providers per page').value='101';await click(button('Load provider page'));assert.ok(container.textContent.includes('1–100 providers'));
  await click(button('Sign my reviewed provider card'));assert.ok(container.textContent.includes('Prepare and accept'));
  await click(button('Use a 30-day card expiry'));await click(button('Use embedded metadata URI'));await click(button('Prepare provider signing review'));
  await click(button('Sign my reviewed provider card'));assert.ok(container.textContent.includes('Prepare and accept'));
  input('I reviewed this exact provider card and signing scope').checked=true;await click(button('Sign my reviewed provider card'));await click(button('Review publication transaction'));assert.equal(reviews.length,1);assert.equal(reviews[0].sender,'wallet');assert.equal(reviews[0].transaction.args[0],signer.address);assert.equal(endpointRequests,0);
  input('My capability name').value='other';input('My capability name').dispatchEvent(new window.Event('input'));await click(button('Review publication transaction'));assert.equal(reviews.length,1);
});
