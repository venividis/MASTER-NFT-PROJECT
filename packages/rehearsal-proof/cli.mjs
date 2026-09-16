import {readFileSync,writeFileSync} from 'node:fs';
import {proveQuote,verifyQuote} from './prover.mjs';
const [operation,input,output]=process.argv.slice(2);
try {
  if(!['prove','verify'].includes(operation)||!input)throw Error('Usage: npm run prove -- prove input.json output.proof.json | npm run prove -- verify output.proof.json');
  const value=JSON.parse(readFileSync(input,'utf8'));
  if(operation==='verify') {
    if(!await verifyQuote(value))throw Error('Invalid proof.');
    console.log('Valid development-setup NativeMarket arithmetic proof. Chain/account binding requires NativeQuoteRehearsal.check.');
  } else {
    if(!output)throw Error('Choose an output file.');
    const result=await proveQuote(value);
    writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log('Created '+output);
  }
  process.exit(0);
} catch(error) {console.error(error.message);process.exit(1);}
