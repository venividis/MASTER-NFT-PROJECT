import test from 'node:test';import assert from 'node:assert/strict';
import {identitySource,assertMintBinding} from '../../web/confluence/minted-identity.mjs';
const minted={chainId:'31337',collection:'0x'+'ab'.repeat(20),tokenId:'7',seed:'mint'},local={seed:'local'},snapshot={seed:'connected'};
test('disconnect and local state changes preserve minted identity unless preview is explicit',()=>{
 assert.equal(identitySource({minted,local}),minted);assert.equal(identitySource({minted,local:{seed:'changed'}}),minted);
 assert.equal(identitySource({minted,local,connected:true,snapshot}),snapshot);
 assert.deepEqual(identitySource({minted,local,preview:'sample'}),{seed:'sample',genome:'sample'});
 assert.equal(identitySource({local}),local);
});
test('minted owners cannot substitute another token, collection or network',()=>{
 assert.doesNotThrow(()=>assertMintBinding(minted,minted.collection,7n,31337n));
 assert.throws(()=>assertMintBinding(minted,minted.collection,8n,31337n),/belonging/);
 assert.throws(()=>assertMintBinding(minted,'0x'+'cd'.repeat(20),7n,31337n),/belonging/);
 assert.throws(()=>assertMintBinding(minted,minted.collection,7n,1n),/home chain/);
 assert.doesNotThrow(()=>assertMintBinding(undefined,'arbitrary',8n,1n));
});

test('legacy snapshots may update a minted form only when every binding matches',()=>{
 const legacy={...minted,genome:'evolved'};
 assert.equal(identitySource({minted,legacy,local}),legacy);
 for(const change of [{collection:'0x'+'cd'.repeat(20)},{chainId:'1'},{tokenId:'8'},{seed:'other'}])assert.equal(identitySource({minted,legacy:{...legacy,...change},local}),minted);
});
