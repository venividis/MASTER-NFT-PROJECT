import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const shared=fs.readFileSync(path.join(root,'render/field.inc'),'utf8');
const header=`#version 300 es\nprecision highp float;precision highp int;\n#define V3 vec3\n#define V4 vec4\n#define v3 vec3\n#define TOU(x) uint(x)\n#define TOF(x) float(x)\n#define TOI(x) int(x)\n#define atan2(y,x) atan(y,x)\nuniform vec2 resolution;uniform float center;uniform vec4 seed,genome,root;uniform float t,sovereign,pulse,fold,cameraX,cameraY,zoom,pointerX,pointerY,eventKind,lens;out vec4 outColor;\n`;
const footer=`\nvoid main(){vec2 uv=(gl_FragCoord.xy-vec2(resolution.x*.5,resolution.y*(1.-center)))/resolution.y*3.2;outColor=vec4(radiance(uv.x,uv.y),1.);}`;
fs.writeFileSync(path.join(root,'render/field.frag'),header+shared+footer);
execFileSync(process.env.CLANG||'clang',['--target=wasm32','-O3','-fno-builtin','-ffp-contract=off','-nostdlib','-Wl,--no-entry','-Wl,--export=render','-Wl,--export=render_region','-Wl,--export=buffer_ptr','-Wl,--export=set_param','-Wl,--export-memory','-Wl,--initial-memory=3145728','-Wl,--max-memory=3145728',path.join(root,'render/field.c'),'-o',path.join(root,'render/field.wasm')],{stdio:'inherit'});
console.log('Shared C/GLSL field compiled to WebAssembly and GLSL.');
