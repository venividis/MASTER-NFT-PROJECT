#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  IPSEITY · check the shaders

  Every other suite in this repo can pass while the artwork renders nothing.
  The contracts do not know what GLSL is, the round-trip test compares bytes,
  and the shader is a string until a GPU touches it — so a shader that does
  not compile ships green.

  That happened: a change to grad3's signature landed on its call sites but
  not on its declaration, and 174 assertions passed over a document whose
  fragment shader could not compile.

  This lifts every shader out of engine/ipseity.html the same way the engine
  assembles them — by evaluating the declarations, so HEAD3 + FS_FIELD is
  concatenated here exactly as it is at runtime — and puts each through a
  GLSL ES 3.00 parser. Syntax errors throw. Semantic complaints (unknown
  function, wrong argument count, wrong types) are reported by the parser on
  the console, so the console is captured and any word from it is a failure.

    node tools/glsl-check.mjs
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { parser } from "@shaderfrog/glsl-parser";
import { preprocess } from "@shaderfrog/glsl-parser/preprocessor/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function shaders(file = path.join(ROOT, "engine/ipseity.html")) {
  const src = fs.readFileSync(file, "utf8");

  // the block that declares them, verbatim, so concatenation matches runtime
  const from = src.indexOf("const VS3 = `");
  const to = src.indexOf("const cvs = $(\"#field\")");
  if (from < 0 || to < 0) throw new Error("shader block markers moved; update tools/glsl-check.mjs");

  const ctx = vm.createContext({});
  vm.runInContext(src.slice(from, to) + "\n;globalThis.__S = {VS3, FS_FIELD, FS_ACC, FS_DOWN, FS_UP, FS_POST};", ctx);
  return ctx.__S;
}

/* The parser has no table of GLSL built-ins, so every one of them reads as
   an undefined variable. These are the ones this engine legitimately uses;
   anything else undefined is a genuine typo. */
const BUILTIN = /^Encountered undefined variable: "(gl_FragCoord|gl_Position|gl_PointCoord|gl_FrontFacing|gl_VertexID|gl_InstanceID|gl_FragDepth|gl_PointSize)"$/;

export function check(name, source) {
  const problems = [];
  const real = { warn: console.warn, error: console.error, log: console.log };
  // the parser reports semantic findings on the console rather than throwing
  console.warn = console.error = console.log = (...a) => problems.push(a.join(" "));
  try {
    // #define is a preprocessor concern; the parser never sees macros
    parser.parse(preprocess(source, { preserve: { version: () => true } }));
  } catch (e) {
    problems.push(`${e.message}`.split("\n")[0]);
  } finally {
    Object.assign(console, real);
  }
  return problems.filter((p) => !BUILTIN.test(p.trim()));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const S = shaders();
  let bad = 0;

  console.log("\n  GLSL ES 3.00\n");
  for (const [name, source] of Object.entries(S)) {
    if (typeof source !== "string") continue;
    const lines = source.split("\n").length;
    const problems = check(name, source);
    if (problems.length) {
      bad++;
      console.log(`  \x1b[31m✗\x1b[0m ${name.padEnd(10)} ${String(lines).padStart(4)} lines`);
      for (const p of problems.slice(0, 6)) console.log(`      ${p}`);
    } else {
      console.log(`  \x1b[32m✓\x1b[0m ${name.padEnd(10)} ${String(lines).padStart(4)} lines`);
    }
  }

  // #version must be the very first characters, or WebGL2 rejects the whole
  // program with a message that points at line 1 and explains nothing
  for (const [name, source] of Object.entries(S)) {
    if (typeof source !== "string") continue;
    if (!source.startsWith("#version 300 es")) {
      console.log(`  \x1b[31m✗\x1b[0m ${name}: #version must be the first token`);
      bad++;
    }
  }

  console.log(bad
    ? `\n  \x1b[31m${bad} shader(s) would not compile\x1b[0m\n`
    : `\n  \x1b[32mevery shader parses and type-checks\x1b[0m\n`);
  process.exit(bad ? 1 : 0);
}
