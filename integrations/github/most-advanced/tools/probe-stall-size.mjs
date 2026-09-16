import { compile, artifact } from "./compile.mjs";
const out = compile({ dirs: ["probe", "src/lib"], quiet: false });
const a = artifact(out, "probe/Stall.sol", "Stall");
console.log("Stall runtime bytes:", (a.deployed.length - 2) / 2, "of 24576");
console.log("Stall initcode bytes:", (a.bytecode.length - 2) / 2);
