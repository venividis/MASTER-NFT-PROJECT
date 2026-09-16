import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),file=process.argv[2];if(!file)throw Error('Pass the npm audit JSON report path.');
const audit=JSON.parse(fs.readFileSync(file,'utf8')),inputs=JSON.parse(fs.readFileSync(path.join(root,'packages/privacy/bundle-inputs.json')));
const matches=node=>inputs.some(input=>('/'+input).includes('/packages/privacy/'+node+'/'));
const findings=Object.entries(audit.vulnerabilities||{}).map(([name,v])=>({name,severity:v.severity,range:v.range,inBrowserBundle:v.nodes.some(matches),advisories:v.via.filter(x=>typeof x==='object').map(x=>({title:x.title,url:x.url}))}));
const result={date:'2026-09-12',scope:'npm production dependency advisories cross-checked against esbuild input metadata; file inclusion is not a security audit or complete runtime reachability analysis',installed:audit.metadata.vulnerabilities,browserFindings:findings.filter(x=>x.inBrowserBundle),excludedFindings:findings.filter(x=>!x.inBrowserBundle),overrides:JSON.parse(fs.readFileSync(path.join(root,'packages/privacy/package.json'))).overrides};
fs.writeFileSync(path.join(root,'reports/privacy/dependencies.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({installed:result.installed,included:result.browserFindings.map(x=>({name:x.name,severity:x.severity}))}));
