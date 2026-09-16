import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {groth16} from 'snarkjs';

export const SCHEMA='anima.native-quote-proof/1';
export const artifactRoot=fileURLToPath(new URL('./artifacts/',import.meta.url));
const names=['contextHi','contextLo','amount','reserveIn','reserveOut','minimum'];
const maximum=(1n<<112n)-1n;
export function validateInput(value) {
  if(!value || Object.keys(value).sort().join(',')!==names.slice().sort().join(',')) throw Error('Expected the six exact public circuit inputs.');
  const input={};
  for(const name of names) {
    const raw=String(value[name]);
    if(!/^(0|[1-9][0-9]{0,38})$/.test(raw))throw Error('Inputs must be canonical unsigned decimal integers.');
    const n=BigInt(raw),limit=name.startsWith('context')?(1n<<128n)-1n:maximum;
    if(n>limit || (!name.startsWith('context')&&n===0n))throw Error('Input outside circuit range: '+name);
    input[name]=raw;
  }
  const a=BigInt(input.amount),rin=BigInt(input.reserveIn),rout=BigInt(input.reserveOut);
  const output=a*9970n*rout/(rin*10000n+a*9970n);
  if(rin+a>maximum || output===0n || output<BigInt(input.minimum))throw Error('Quote would overflow, round to zero or fail its minimum.');
  return input;
}
export function loadArtifacts(directory=artifactRoot) {
  const manifest=JSON.parse(readFileSync(path.join(directory,'manifest.json'),'utf8'));
  if(manifest.schema!==SCHEMA || manifest.setup!=='single-machine-development-only' || manifest.productionReady!==false)throw Error('Unrecognized proof setup.');
  for(const file of ['native-quote.wasm','native-quote.zkey','verification-key.json']) {
    const actual=createHash('sha256').update(readFileSync(path.join(directory,file))).digest('hex');
    if(actual!==manifest.files[file])throw Error('Proof artifact digest mismatch: '+file);
  }
  return {manifest,wasm:path.join(directory,'native-quote.wasm'),zkey:path.join(directory,'native-quote.zkey'),
    verificationKey:JSON.parse(readFileSync(path.join(directory,'verification-key.json'),'utf8'))};
}
export async function proveQuote(value,{artifacts=loadArtifacts()}={}) {
  const input=validateInput(value);
  const result=await groth16.fullProve(input,artifacts.wasm,artifacts.zkey,undefined,undefined,{singleThread:true});
  if(!await groth16.verify(artifacts.verificationKey,result.publicSignals,result.proof))throw Error('Generated proof failed verification.');
  const calldata=JSON.parse('['+await groth16.exportSolidityCallData(result.proof,result.publicSignals)+']');
  return {schema:SCHEMA,setup:artifacts.manifest.setup,productionReady:false,input,proof:result.proof,
    publicSignals:result.publicSignals,solidity:{a:calldata[0],b:calldata[1],c:calldata[2],signals:calldata[3]}};
}
export async function verifyQuote(report,{artifacts=loadArtifacts()}={}) {
  if(report?.schema!==SCHEMA || report.productionReady!==false || report.setup!==artifacts.manifest.setup ||
    !Array.isArray(report.publicSignals)||report.publicSignals.length!==10)return false;
  const input=validateInput(report.input);
  for(let i=0;i<names.length;i++)if(BigInt(report.publicSignals[4+i])!==BigInt(input[names[i]]))return false;
  return groth16.verify(artifacts.verificationKey,report.publicSignals,report.proof);
}
