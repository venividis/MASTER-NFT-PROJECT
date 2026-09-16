#!/usr/bin/env node
/*  Is the single "required DVN" on the Unichain / Robinhood lanes a real
    verifier or the dead one? Ask the chain for its code and its answer. */
import { RpcChain } from "./rpc.mjs";
const T = [
  ["Ethereum","https://ethereum-rpc.publicnode.com",
   ["0x747c741496a507e4b404b50463e691a8d692f6ac","0x380275805876ff19055ea900cdb2b46a94ecf20d",
    "0x589dedbd617e0cbcb916a9223f4d1300c294236b","0xa4fe5a5b9a846458a70cd0748228aed3bf65c2cd",
    "0xa59ba433ac34d2927232918ef5b2eaafcf130ba5","0x173272739bd7aa6e4e214714048a9fe699453059"]],
  ["Base","https://base-rpc.publicnode.com",
   ["0x6498b0632f3834d7647367334838111c8c889703","0x554833698ae0fb22ecc90b01222903fd62ca4b47",
    "0x9e059a54699a285714207b43b055483e78faac25","0xa7b5189bca84cd304d8553977c7c614329750d99",
    "0xcd37ca043f8479064e10635020c65ffc005d36f6"]],
  ["Unichain","https://unichain-rpc.publicnode.com",["0x6788f52439aca6bff597d3eec2dc9a44b8fee842"]],
];
for (const [n,u,as] of T) {
  console.log("\n  "+n);
  const c = new RpcChain(u,"0x"+"11".repeat(32),1);
  for (const a of as) {
    const sz = await c.codeSize(a).catch(()=>-1);
    let msg = "";
    for (const sig of ["getFee(uint32,uint64,address,bytes)","version()","owner()","quorum()"]) {
      try { const r = await c.read(a, sig, sig.includes("uint32")?[1n,1n,a,"0x"]:[]); msg += `${sig.split("(")[0]}=${String(r).slice(0,26)} `; }
      catch(e){ const m=String(e.message); msg += `${sig.split("(")[0]}:${m.includes("reverted:")?m.split("reverted:")[1].trim().slice(0,52):"revert"} `; }
    }
    console.log(`    ${a}  ${String(sz).padStart(6)} B  ${msg}`);
  }
}
