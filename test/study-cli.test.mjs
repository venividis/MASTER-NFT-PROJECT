import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {genesis,transition,makeBundle} from '../web/model.mjs';
const cli=path.resolve(import.meta.dirname,'..','scripts','verify-study.mjs');
test('independent receipt CLI verifies an exported study',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'idfbi-')),file=path.join(folder,'book.json');
 try{
  const s=await genesis('0x'+'42'.repeat(32),1000),r=await transition(s,'EVOLVE',{salt:'0x'+'33'.repeat(32)},1001);
  fs.writeFileSync(file,JSON.stringify(makeBundle(s,[r.receipt],r.state)));
  const out=spawnSync(process.execPath,[cli,file],{encoding:'utf8'});assert.equal(out.status,0);assert.equal(JSON.parse(out.stdout).head,r.state.audit);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('independent receipt CLI rejects malformed input and missing arguments',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'idfbi-')),file=path.join(folder,'bad.json');
 try{fs.writeFileSync(file,'{"fake":true}');assert.equal(spawnSync(process.execPath,[cli,file]).status,1);assert.equal(spawnSync(process.execPath,[cli]).status,1);}
 finally{fs.rmSync(folder,{recursive:true,force:true});}
});
