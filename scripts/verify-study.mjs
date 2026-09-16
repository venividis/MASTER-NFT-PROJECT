#!/usr/bin/env node
/** Check local receipt integrity. Success is NOT proof of authorship or chain finality. */
import fs from 'node:fs/promises';
import {verifyBundle} from '../web/model.mjs';
try {
  const file=process.argv[2];
  if(!file||process.argv.length!==3)throw new Error('Usage: node scripts/verify-study.mjs <receipt-book.json>');
  if((await fs.stat(file)).size>524288)throw new Error('Receipt book exceeds 512 KB.');
  const result=await verifyBundle(JSON.parse(await fs.readFile(file,'utf8')));
  console.log(JSON.stringify({consistent:true,receipts:result.receipts.length,head:result.state.audit,
    state:result.state.root,mode:result.state.sovereign?'sovereign':'bound',
    guarantee:'Unsigned browser-state consistency only. No authenticity, ZK, TEE, or onchain finality.'},null,2));
} catch(error) {
  console.error(JSON.stringify({consistent:false,error:error.message}));process.exitCode=1;
}
