// Use the upstream browser WASM unchanged, embedded in the integrity-pinned worker.
import {poseidon as hash,initSync} from '../node_modules/@railgun-community/poseidon-hash-wasm/pkg-esm/poseidon_hash_wasm.js';
import wasm from '../node_modules/@railgun-community/poseidon-hash-wasm/pkg-esm/poseidon_hash_wasm_bg.wasm';
const FIELD=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export default function init(){initSync(wasm);return Promise.resolve();}
export function poseidon(values){return BigInt('0x'+hash(values.map(v=>(v%FIELD).toString(16))));}
export function poseidonHex(values){return hash(values);}
