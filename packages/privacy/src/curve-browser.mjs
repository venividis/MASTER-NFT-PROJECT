import {initSync,scalarMultiply} from '../node_modules/@railgun-community/curve25519-scalarmult-wasm/pkg-esm/curve25519_scalarmult_wasm.js';
import wasm from '../node_modules/@railgun-community/curve25519-scalarmult-wasm/pkg-esm/curve25519_scalarmult_wasm_bg.wasm';
export {scalarMultiply};
export default function init(){initSync(wasm);return Promise.resolve();}
