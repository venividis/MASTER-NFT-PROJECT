#!/usr/bin/env node
/*  Block time per chain, measured, so "10 confirmations" can be stated in
    seconds rather than blocks — the DVN's confirmation setting is the
    whole reorg defence and blocks are not a unit anybody can reason with. */
import { RpcChain } from "./rpc.mjs";
const NETS = [["Ethereum","https://ethereum-rpc.publicnode.com",15],["Base","https://base-rpc.publicnode.com",10],
              ["Unichain","https://unichain-rpc.publicnode.com",20],["BNB","https://bsc-rpc.publicnode.com",15],
              ["Robinhood","https://rpc.mainnet.chain.robinhood.com",5]];
for (const [n,u,conf] of NETS) {
  try {
    const c = new RpcChain(u,"0x"+"11".repeat(32),1);
    const h = BigInt(await c.rpc("eth_blockNumber"));
    const a = await c.rpc("eth_getBlockByNumber",["0x"+h.toString(16),false]);
    const b = await c.rpc("eth_getBlockByNumber",["0x"+(h-100n).toString(16),false]);
    const dt = (Number(BigInt(a.timestamp)-BigInt(b.timestamp))/100);
    console.log(`  ${n.padEnd(10)} head ${h}  block time ${dt.toFixed(3)} s  ` +
                `default DVN confirmations ${conf} = ${(conf*dt).toFixed(1)} s of chain`);
  } catch(e){ console.log(`  ${n.padEnd(10)} unreachable ${String(e.message).slice(0,50)}`); }
}
