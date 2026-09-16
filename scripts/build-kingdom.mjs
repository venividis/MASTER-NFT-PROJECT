// Historical v1.4 composition; not a current build dependency.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv.includes('--historical'))throw Error('Historical command: use npm run build for current Genesis, or add --historical.');
const out=path.join(root,'history/previews');fs.mkdirSync(out,{recursive:true});
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const base=read('web/reference/four-chambers-1.3.html');
const codec=read('web/evm.mjs').replace(/^export /gm,'');
const model=read('web/kingdom/model.mjs').replace(/^import .*;\n/m,'').replace(/^export /gm,'');
const js='(function(){"use strict";\n'+codec+'\n'+model+'\n'+read('web/kingdom/scene.js')+'\n'+read('web/kingdom/app.js')+'\n})();';
// Existing archive retains its own closure; new code executes in a separate private closure.
if(/<\/script/i.test(js))throw Error('Unescaped script close in new bundle');
let result=base.replace('</head>','<style id="kingdom-style">'+read('web/kingdom/styles.css')+'</style></head>');
result=result.replace('</body>',read('web/kingdom/shell.html')+'\n<script id="kingdom-runtime">'+js+'</script></body>');
result=result.replace('<title>i dont fucking believe it!</title>','<title>i dont fucking believe it! / The Interior 1.4</title>');
fs.writeFileSync(path.join(out,'kingdom-1.4.html'),result);fs.writeFileSync(path.join(out,'kingdom-1.4.check.js'),js);
console.log(JSON.stringify({file:'history/previews/kingdom-1.4.html',bytes:Buffer.byteLength(result),mode:'unsigned local rehearsal',base:'archived v1.3 inline artifact',networkCallsAdded:0},null,2));
