import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
/** Bundle the independent SDK into the existing web-only archive boundary. */
export async function buildEmbeddedModules() {
  const result = await build({
    absWorkingDir: root,
    stdin: {
      contents: `import {mountWorkbench as mount} from './web/modules/app.mjs';
import style from './web/modules/workbench.css';
export function mountWorkbench(container, options={}) {
  const sheet=document.createElement('style'); sheet.textContent=style;
  const result=mount(container, options); container.prepend(sheet);
  return result;
}`,
      resolveDir: root, sourcefile: 'anima-embedded-modules.mjs', loader: 'js',
    },
    loader: {'.css': 'text'}, bundle: true, format: 'esm', platform: 'browser',
    target: 'es2022', write: false, metafile: true, legalComments: 'inline',
  });
  const output = path.join(root, 'web/modules/embedded.mjs');
  fs.writeFileSync(output, result.outputFiles[0].text);
  return {file: output, inputs: Object.keys(result.metafile.inputs).filter(n=>n!=='anima-embedded-modules.mjs')};
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const result = await buildEmbeddedModules();
  console.log('Built embedded module workbench from '+result.inputs.length+' source files.');
}
