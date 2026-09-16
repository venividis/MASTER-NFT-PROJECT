import {archiveModule,sha256} from '../../scripts/lib/runtime-graph.mjs';
import {MODULE_IMPORT_MARKER} from '../../web/confluence/module-loader.mjs';
export async function fixtureExpanded(change='one'){
 const source={
  'web/confluence/app.js':`import {value} from '../launchpad/sample.mjs'; globalThis.sample=value;`,
  'web/launchpad/sample.mjs':`import {base} from '../vendor/base.mjs';export const value=base+' ${change}';`,
  'web/vendor/base.mjs':`export const base='blue';`,
 };
 const moduleGraph={
  'web/confluence/app.js':{sha256:sha256(source['web/confluence/app.js']),dependencies:['web/launchpad/sample.mjs']},
  'web/launchpad/sample.mjs':{sha256:sha256(source['web/launchpad/sample.mjs']),dependencies:['web/vendor/base.mjs']},
  'web/vendor/base.mjs':{sha256:sha256(source['web/vendor/base.mjs']),dependencies:[]},
 },imports={};for(const name of Object.keys(moduleGraph))imports['awe/'+name]='data:text/javascript;base64,'+Buffer.from(await archiveModule(source[name],name)).toString('base64');
 const shell=`<!doctype html><html><head><script type="importmap">${MODULE_IMPORT_MARKER}</script></head><body><script type="module">import 'awe/web/confluence/app.js';</script></body></html>`;return {shell,imports,moduleGraph,buildManifestSha256:sha256('fixture'),html:shell.replace(MODULE_IMPORT_MARKER,JSON.stringify({imports}))};
}

