import { mountWorkbench } from './app.mjs';
const params=new URLSearchParams(location.search);
const options=Object.fromEntries(['chainId','collection','tokenId','registry'].map(key=>[key,params.get(key)??'']));
const workbench=mountWorkbench(document.querySelector('#workbench'),options);
addEventListener('pagehide',()=>workbench.destroy(),{once:true});
