import fs from 'node:fs';import path from 'node:path';
import {Interface,getAddress} from 'ethers';
import {compileCalendar,validateCalendar,calendarICS} from '../web/workshop/calendar.mjs';
import {WORKSHOP_CONTRACTS} from '../web/workshop/contracts.mjs';
const [command,input,out,escrow,id,chain]=process.argv.slice(2);
if(!['build','verify','plan'].includes(command)||!input)throw Error('Usage: node scripts/workshop-provider.mjs build request.json output-dir | verify deliverable.json | plan deliverable.json output-dir escrow work-id chain-id');
const raw=JSON.parse(fs.readFileSync(input,'utf8'));
if(command==='verify'){const a=validateCalendar(raw);console.log(JSON.stringify({verified:true,deliverable:a.deliverable,contentHash:a.contentHash,bytes:a.bytes}));}
else {if(!out)throw Error('An output directory is required.');const a=command==='build'?compileCalendar(raw.snapshot||raw):validateCalendar(raw);fs.mkdirSync(out,{recursive:true});
  if(command==='build'){fs.writeFileSync(path.join(out,'deliverable.json'),JSON.stringify(a,null,2)+'\n');fs.writeFileSync(path.join(out,'release-calendar.html'),a.html);fs.writeFileSync(path.join(out,'release-calendar.ics'),calendarICS(a.snapshot));}
  else {if(!/^\d+$/.test(id||'')||!/^\d+$/.test(chain||''))throw Error('Work ID and chain ID must be integers.');const api=new Interface(WORKSHOP_CONTRACTS.CommissionEscrow.abi),to=getAddress(escrow);fs.writeFileSync(path.join(out,'unsigned-provider-actions.json'),JSON.stringify({schema:'anima.provider-actions/1',chainId:chain,terms:a.terms,deliverable:a.deliverable,notice:'Read and verify the escrow, work terms, budget, worker, evaluator and deadlines on the selected chain. Accept first; submit only after acceptance is included. These actions are unsigned and do not authorize any payment.',transactions:[{to,value:'0',data:api.encodeFunctionData('accept',[id])},{to,value:'0',data:api.encodeFunctionData('submit',[id,a.deliverable])}]},null,2)+'\n');}
  console.log(JSON.stringify({command,output:path.resolve(out),terms:a.terms,deliverable:a.deliverable,bytes:a.bytes}));
}
