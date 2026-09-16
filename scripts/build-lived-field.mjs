import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const warp=`
 // A bounded, versioned life deformation. Zero traits preserve the approved field.
 float lived=abs(life0.x)+abs(life0.y)+abs(life0.z)+abs(life0.w)+abs(life1.x)+abs(life1.y)+abs(life1.z)+abs(life1.w);
 if(lived>0.000001){
  float aa=atan2(v,u),rr=sqrt(u*u+v*v);
  float lobes=1.0+life0.y*.42*sin(aa*3.0+life1.z*3.0)+life0.z*.35*cos(aa*5.0+life1.w*2.0);
  float turn=life0.w*.85*(1.0-exp(-rr*rr*1.7));
  float cu=cos(turn),su=sin(turn),oldU=u;
  u=(u*cu-v*su)/((1.0+life0.x*.6)*lobes);
  v=(oldU*su+v*cu)/((1.0-life0.x*.45)*lobes);
 }
`;
let field=read('render/field.inc').replace(' float radial=sqrt(u*u+v*v),angle=atan2(v,u);',warp+' float radial=sqrt(u*u+v*v),angle=atan2(v,u);');
if(!field.includes('float lived='))throw Error('Missing optical warp boundary');
field=field.replace('   // A fourth-coordinate slice rotates',`   if(lived>0.000001){
    float bend=life1.x*.7*sampleP.z+life1.y*.28*sin(sampleP.y*3.0);
    float xx=sampleP.x;
    sampleP.x=xx*cos(bend)-sampleP.y*sin(bend);
    sampleP.y=xx*sin(bend)+sampleP.y*cos(bend);
    sampleP.z+=life1.y*.3*sin(xx*3.0+sampleP.y*2.0);
   }
   // A fourth-coordinate slice rotates`);
fs.mkdirSync(path.join(root,'render/living'),{recursive:true});fs.writeFileSync(path.join(root,'render/living/field.inc'),field);
const base=read('render/field.frag');const start=base.slice(0,base.indexOf('// Shared optical field.')).replace('uniform vec4 seed,genome,root;','uniform vec4 seed,genome,root,life0,life1;');
const foot=base.slice(base.lastIndexOf('\nvoid main()'));
fs.writeFileSync(path.join(root,'render/living/field.frag'),start+field+foot);
let c=read('render/field.c').replace('V4 seed,genome,root;','V4 seed,genome,root,life0,life1;').replace('if(i<0||i>22)return;','if(i<0||i>30)return;\n if(i>=23&&i<27){((float*)&life0)[i-23]=f;return;}if(i>=27){((float*)&life1)[i-27]=f;return;}');
fs.writeFileSync(path.join(root,'render/living/field.c'),c);
execFileSync(process.env.CLANG||'clang',['--target=wasm32','-O3','-fno-builtin','-ffp-contract=off','-nostdlib','-Wl,--no-entry','-Wl,--export=render','-Wl,--export=render_region','-Wl,--export=buffer_ptr','-Wl,--export=set_param','-Wl,--export-memory','-Wl,--initial-memory=3145728','-Wl,--max-memory=3145728',path.join(root,'render/living/field.c'),'-o',path.join(root,'render/living/field.wasm')],{stdio:'inherit'});
console.log('Built lived field: approved volume + bounded activity domain warp, native Wasm/GLSL.');
