import {Interface,getAddress,ZeroAddress,parseEther,keccak256,toUtf8Bytes} from '../vendor/ethers.min.js';
export const MINT_METHODS=Object.freeze(['mint()','mint(uint256)','mint(address,uint256)','publicMint(uint256)','safeMint(address)']);
export const burnHash=value=>keccak256(toUtf8Bytes(JSON.stringify(value)));
export function projectOrigin(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw Error('Use the project’s exact HTTPS address.');return u.origin;}
export function rpcEndpoint(value){const u=new URL(value);if(u.username||u.password||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('Use an HTTPS RPC endpoint, or a local development node.');return u.href;}
export function burnerPolicy(raw){
 const name=String(raw.name||'').trim();if(!name||name.length>72)throw Error('Give this project wallet a short name.');
 const chainId=String(raw.chainId);if(!['1','11155111','31337','1337'].includes(chainId))throw Error('This release supports Ethereum, Sepolia and local Ethereum development nodes. Other fee models need a separate adapter.');
 const target=getAddress(raw.target),recovery=getAddress(raw.recovery);if(target===ZeroAddress||recovery===ZeroAddress||target===recovery)throw Error('Use different, nonzero mint and recovery addresses.');
 const budget=String(raw.budget);if(!/^\d{1,30}$/.test(budget)||BigInt(budget)<=0n)throw Error('Set a positive native-asset budget including transaction fees.');
 return {name,origin:projectOrigin(raw.origin),chainId,target,recovery,budget,rpc:rpcEndpoint(raw.rpc)};
}
export function mintData(method,quantity,recipient){
 if(!MINT_METHODS.includes(method))throw Error('Unsupported mint method. Arbitrary calls, approvals, permits and batches are blocked.');
 recipient=getAddress(recipient);const n=Number(quantity);if(!Number.isInteger(n)||n<1||n>100)throw Error('Mint quantity must be 1–100.');
 if(['mint()','safeMint(address)'].includes(method)&&n!==1)throw Error('This method accepts only a single mint request.');
 const iface=new Interface(['function '+method+' payable']);const args=method==='mint()'?[]:method==='safeMint(address)'?[recipient]:method==='mint(address,uint256)'?[recipient,n]:[n];return iface.encodeFunctionData(method,args);
}
export function checkSite(pinned,observed){const origin=projectOrigin(observed);return {origin,matches:origin===pinned,internationalized:new URL(origin).hostname.includes('xn--'),scope:'Compares the address you entered. Does not observe browser tabs or certify a site.'};}
export function nativeBudget(value){const n=parseEther(String(value));if(n<=0n)throw Error('Budget must be positive.');return String(n);}
export function checkSpend({budget,spent,reserved='0',value,gas,fee,balance}){const worst=BigInt(value)+BigInt(gas)*BigInt(fee);if(BigInt(value)<0n||BigInt(gas)<=0n||BigInt(fee)<=0n||worst+BigInt(spent)+BigInt(reserved)>BigInt(budget))throw Error('Value plus maximum gas exceeds this project’s remaining budget.');if(worst>BigInt(balance))throw Error('Fund only this wallet; its balance cannot cover value plus maximum gas.');return String(worst);}
