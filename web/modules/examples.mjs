import { packageFiles, manifestHash, sha256 } from '../../packages/modules/sdk.mjs';
import { moduleKeyFor } from '../../packages/modules/chain.mjs';
const enc = new TextEncoder();
const publisher='0x'+'10'.repeat(20);
const base={schema:'anima.module-scene/1',fields:[],actions:[],visual:{kind:'orb',primary:'#8edcff',secondary:'#c7acff',seed:27}};
export const EXAMPLES=Object.freeze([
 {id:'aurora-notebook',title:'Aurora notebook',kind:'Visual + memory',description:'A luminous workspace for a small idea. Save a browser draft or propose a personal inscription.',scene:{...base,title:'Aurora notebook',description:'Give an idea somewhere to return to. Drafts stay in this browser until you export or explicitly publish them.',fields:[{id:'note',label:'A thought to keep',type:'textarea',value:''}],actions:[{kind:'save',label:'Save draft',key:'notebook'},{kind:'restore',label:'Restore draft',key:'notebook'},{kind:'journal',label:'Propose a journal entry',textField:'note'}]},capabilities:['identity.read','journal.propose','state.read','state.write']},
 {id:'resonant-garden',title:'Resonant garden',kind:'Visual + audio',description:'A seeded constellation and a brief harmonic score. Sound starts only when you choose Listen.',scene:{...base,title:'Resonant garden',description:'A quiet interval: a seeded field paired with an eight-second harmonic score.',visual:{...base.visual,kind:'garden',seed:108},audio:{frequencies:[174,261,348],durationMs:8000,volume:.08},fields:[{id:'dedication',label:'Dedication',type:'text',value:''}],actions:[{kind:'save',label:'Keep this dedication',key:'dedication'},{kind:'restore',label:'Restore dedication',key:'dedication'}]},capabilities:['identity.read','state.read','state.write']},
 {id:'gift-of-light',title:'A gift of light',kind:'Gift + explicit proposal',description:'Pair a visual dedication with an exact native-asset transfer proposal. The host keeps signing separate.',scene:{...base,title:'A gift of light',description:'Name an exact recipient and native amount in wei. Proposing a gift never sends it. Local samples can only preview the request.',visual:{...base.visual,kind:'ribbons',primary:'#90e9df',secondary:'#b1b7ff',seed:77},fields:[{id:'recipient',label:'Recipient address',type:'address',value:''},{id:'amount',label:'Native gift · wei',type:'wei',value:'0'},{id:'dedication',label:'Dedication · local draft',type:'textarea',value:''}],actions:[{kind:'save',label:'Keep gift draft',key:'gift'},{kind:'restore',label:'Restore gift draft',key:'gift'},{kind:'transaction',label:'Propose exact gift',destinationField:'recipient',valueField:'amount',description:'Native gift from this NFT account'}]},capabilities:['identity.read','state.read','state.write','transaction.propose']}
]);
/** Samples are portable packages, explicitly not published or installed releases. */
export async function examplePackage(id,{publisher:author=publisher,sharedReleaseId}={}){
 const example=EXAMPLES.find(example=>example.id===id);if(!example)throw Error('Unknown local example.');
 const scene=structuredClone(example.scene);
 if(sharedReleaseId && id !== 'gift-of-light'){delete scene.audio;scene.parts=[{kind:'audio',releaseId:sharedReleaseId,path:'score.json'}];}
 const bytes=enc.encode(JSON.stringify(scene));
 const packaged=await packageFiles([{path:'scene.json',mime:'application/json',bytes,imports:[]}],{name:example.id,version:1,publisher:author.toLowerCase(),entrypoint:'scene.json',hostAPI:'anima.host/1',dependencies:sharedReleaseId&&id!=='gift-of-light'?[sharedReleaseId]:[],capabilities:example.capabilities,stateSchema:sha256(enc.encode(example.id+':state:1')),predecessor:'0x'+'0'.repeat(64),resources:{maxRuntimeMs:300000,maxStateBytes:32768}},{compression:'raw'});
 return { ...packaged,local:true,manifest:packaged.manifest,releaseId:manifestHash(packaged.manifest),moduleKey:moduleKeyFor(author.toLowerCase(),sha256(enc.encode(example.id))),files:[{path:'scene.json',mime:'application/json',bytes}],entrypoint:'scene.json',dependencies:[],label:example.title };
}

export async function sharedScorePackage({publisher:author=publisher}={}) {
 const score={schema:'anima.module-audio/1',value:{frequencies:[174,261,348],durationMs:8000,volume:.08}};
 return packageFiles([{path:'score.json',mime:'application/json',bytes:enc.encode(JSON.stringify(score)),imports:[]}],{name:'anima-shared-score',version:1,publisher:author.toLowerCase(),entrypoint:'score.json',hostAPI:'anima.host/1',dependencies:[],capabilities:['identity.read'],stateSchema:'0x'+'0'.repeat(64),predecessor:'0x'+'0'.repeat(64)},{compression:'raw'});
}
export async function exampleModules({publisher:author=publisher,sharedReleaseId}={}) {
 if(!sharedReleaseId)throw Error('Publish the shared score first and pass its exact deployed release ID.');
 return Promise.all(EXAMPLES.map(example=>examplePackage(example.id,{publisher:author,sharedReleaseId})));
}
