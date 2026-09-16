#!/usr/bin/env node
/*  Splices a FIELD part into the engine's real fragment shader and puts the
    result through the same GLSL ES 3.00 parser tools/glsl-check.mjs uses.
    Delete freely.                                                        */
import { shaders, check } from "./glsl-check.mjs";

const S = shaders();
const BODY = `float a=length(q.xy)-0.72;
float b=length(q.zw)-0.36;
float d=min(max(a,b),0.0)+length(max(vec2(a,b),0.0));
vec4 r=abs(q)-vec4(0.58);
float e=length(max(r,0.0))+min(max(max(r.x,r.y),max(r.z,r.w)),0.0);
return max(d,-e*0.85);`;

const ANCHOR = "float formStep(float f)";
if (!S.FS_FIELD.includes(ANCHOR)) throw new Error("anchor moved");

const spliced = S.FS_FIELD
  .replace(ANCHOR, `float partField(vec4 q){\n${BODY}\n}\n\n` + ANCHOR)
  .replace("  if(i == 6) return sdDitorus(q, 0.86, 0.38, 0.16);",
           "  if(i == 6) return sdDitorus(q, 0.86, 0.38, 0.16);\n  if(i == 8) return partField(q);")
  .replace("float formStep(float f){ return f > 6.5 ? 0.72 : 1.0; }",
           "float formStep(float f){ return f > 7.5 ? 0.40 : (f > 6.5 ? 0.72 : 1.0); }");

const before = check("FS_FIELD (as shipped)", S.FS_FIELD);
const after  = check("FS_FIELD + partField", spliced);
console.log(`\n  as shipped        ${S.FS_FIELD.length} chars, ${before.length} problem(s)`);
console.log(`  with a FIELD part ${spliced.length} chars, ${after.length} problem(s)  (+${spliced.length - S.FS_FIELD.length} chars)`);
for (const p of after) console.log("    " + p);

/*  and the thing the gate is for: a body that calls a function declared
    BELOW the splice point must fail to compile, not silently work.      */
const FORWARD = spliced.replace("return max(d,-e*0.85);", "return map(q.xyz).x;");
const fwd = check("forward reference", FORWARD);
console.log(`\n  a body calling map() — declared 30 lines below the splice — ` +
  (fwd.length ? `refused by the compiler: ${fwd[0]}` : "ACCEPTED (bad)"));
console.log();
