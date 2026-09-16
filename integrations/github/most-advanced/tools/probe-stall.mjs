import { Chain, enc, decUint, decString } from "./evm.mjs";
import { compile, artifact } from "./compile.mjs";
import { encRequest, decResponse } from "./site.mjs";
import { createAddressFromString } from "@ethereumjs/util";

const REG_INIT = "0x608060405234801561001057600080fd5b5061023b806100206000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c8063246a00211461003b5780638a54c52f1461006a575b600080fd5b61004e6100493660046101b7565b61007d565b6040516001600160a01b03909116815260200160405180910390f35b61004e6100783660046101b7565b6100e1565b600060806024608c376e5af43d82803e903d91602b57fd5bf3606c5285605d52733d60ad80600a3d3981f3363d3d373d3d3d363d7360495260ff60005360b76055206035523060601b60015284601552605560002060601b60601c60005260206000f35b600060806024608c376e5af43d82803e903d91602b57fd5bf3606c5285605d52733d60ad80600a3d3981f3363d3d373d3d3d363d7360495260ff60005360b76055206035523060601b600152846015526055600020803b61018b578560b760556000f580610157576320188a596000526004601cfd5b80606c52508284887f79f19b3655ee38b1ce526556b7731a20c8f218fbda4a3990b6cc4172fdf887226060606ca46020606cf35b8060601b60601c60005260206000f35b80356001600160a01b03811681146101b257600080fd5b919050565b600080600080600060a086880312156101cf57600080fd5b6101d88661019b565b945060208601359350604086013592506101f46060870161019b565b94979396509194608001359291505056fea2646970667358221220ea2fe53af507453c64dd7c1db05549fa47a298dfb825d6d11e1689856135f16764736f6c63430008110033";

// a hub stub whose ownerOf() answers with the deployer
const HUB_RT = "0x6000355f5260206000f3"; // not used; we deploy a solidity stub instead
const out = compile({ dirs: ["probe", "src/lib"], quiet: true });
const stall = artifact(out, "probe/Stall.sol", "Stall");

const ch = await Chain.open();
const holder = ch.from.toString();

const hubArt = artifact(out, "probe/Stall.sol", "HubStub");
const hubR = await ch.send({ data: hubArt.bytecode + enc("x(address)",[holder]).slice(10), label: "hub" });
const HUB = hubR.address;

const reg = await ch.send({ data: REG_INIT, label: "registry" });
const REG = reg.address;

// deploy the Stall implementation
const implR = await ch.send({ data: stall.bytecode + enc("x(address)",[HUB]).slice(10).replace(/^0x/,""), label: "impl" });
const IMPL = implR.address;
console.log("Stall impl deploy gas:", implR.gas, " runtime bytes:", (stall.deployed.length-2)/2);

// create the per-token account
const SALT = "0x" + "5301".padEnd(64,"0");
const COLL = "0x0000000000000000000000000000000000001234";
const mk = await ch.send({ to: REG, data: enc("createAccount(address,bytes32,uint256,address,uint256)",[IMPL,SALT,1n,COLL,7n]), label:"createAccount" });
console.log("createAccount gas:", mk.gas);
const acctHex = await ch.read(REG, "account(address,bytes32,uint256,address,uint256)", [IMPL,SALT,1n,COLL,7n]);
const STALL = "0x" + acctHex.replace(/^0x/,"").slice(24);
console.log("stall address:", STALL);

// list N items
const names = ["Black tee, heavyweight cotton","Long sleeve, ecru","Cap, embroidered sigil",
               "Hoodie, charcoal","Tote, natural canvas","Socks, pair","Poster, A2","Sticker sheet"];
for (let i=0;i<names.length;i++){
  const g = await ch.send({ to: STALL, data: enc("list(bytes,uint128,uint32,uint32)",[Buffer.from(names[i]).toString("hex"), BigInt(1e16*(i+1)), 50n, 7n]), label:"list"+i });
  if(i<2||i===names.length-1) console.log("  list item",i,"gas", g.gas, "(name", names[i].length, "bytes)");
}

// read the shop page
async function measureRequest(path){
  const data = encRequest(path);
  const r = await ch.vm.evm.runCall({
    to: createAddressFromString(STALL),
    caller: createAddressFromString(holder),
    origin: createAddressFromString(holder),
    data: Buffer.from(data.slice(2),"hex"),
    gasLimit: 500_000_000n,
    isStatic: true,
  });
  const ret = "0x" + Buffer.from(r.execResult.returnValue).toString("hex");
  return { gas: r.execResult.executionGasUsed, bytes: (ret.length-2)/2, ret };
}
for (const p of [[], ["items.json"]]) {
  const m = await measureRequest(p);
  console.log("request(", JSON.stringify(p), ") gas:", m.gas.toString(), " ABI return bytes:", m.bytes);
}
const m = await measureRequest([]);
// decode body length
const body = m.ret;
console.log("--- page preview ---");
const hex = body.replace(/^0x/,"");
// crude: find the html
const buf = Buffer.from(hex,"hex").toString("latin1");
const i = buf.indexOf("<!doctype");
console.log(buf.slice(i, i+300));
console.log("... html bytes:", buf.slice(i).replace(/\0+$/,"").length);

// buy + refund gas
const buyer = await ch.as("0x"+"22".repeat(32));
const b = await buyer.send({ to: STALL, data: enc("buy(uint256,uint32,bytes32)",[0n,1n,"0x"+"ab".repeat(32)]), value: BigInt(1e16), label:"buy" });
console.log("buy gas:", b.gas);
const s = await ch.send({ to: STALL, data: enc("ship(uint256)",[0n]), label:"ship" });
console.log("ship gas:", s.gas);
const rf = await ch.send({ to: STALL, data: enc("refund(uint256)",[0n]), label:"refund" });
console.log("refund gas:", rf.gas);

// ── how the page scales: string.concat in a loop is quadratic ──
console.log("\nitems  html bytes  request() gas");
async function pageAt(n){
  const m = await measureRequest([]);
  const buf = Buffer.from(m.ret.replace(/^0x/,""),"hex").toString("latin1");
  const i = buf.indexOf("<!doctype");
  const html = buf.slice(i).replace(/\0+$/,"");
  return { gas: m.gas, bytes: html.length };
}
let shown = new Set();
for (const k of [8,16,32,64,128,256,384,512]) {
  while ((await ch.read(STALL, "itemCount()", [])) && Number(BigInt(await ch.read(STALL,"itemCount()",[]))) < k) {
    await ch.send({ to: STALL, data: enc("list(bytes,uint128,uint32,uint32)",
      [Buffer.from("Black tee, heavyweight cotton").toString("hex"), BigInt(1e16), 50n, 7n]), label:"listN" });
  }
  const p = await pageAt(k);
  console.log(String(k).padStart(5), String(p.bytes).padStart(11), String(p.gas).padStart(14));
}
