const fs = require('node:fs');
const { ethers } = require('./dependency.cjs')('ethers');

function mine(factory, initCode, start = 0n, attempts = 1_000_000) {
  const hash = ethers.keccak256(initCode);
  const flags = 0xc8n;
  const mask = 0x3fffn;
  for (let index = 0; index < attempts; index++) {
    const salt = ethers.zeroPadValue(ethers.toBeHex(start + BigInt(index)), 32);
    const address = ethers.getCreate2Address(factory, salt, hash);
    if ((BigInt(address) & mask) === flags) return { address, salt, initCodeHash: hash, attempts: index + 1, flags: '0x00c8' };
  }
  throw new Error('No matching salt in the requested search range.');
}
module.exports = { mine };
if (require.main === module) {
  const [factory, initCodeFile, start = '0'] = process.argv.slice(2);
  if (!factory || !initCodeFile) throw new Error('Usage: node scripts/mine-salt.cjs FACTORY_ADDRESS INIT_CODE_HEX_FILE [START]');
  console.log(JSON.stringify(mine(factory, fs.readFileSync(initCodeFile, 'utf8').trim(), BigInt(start)), null, 2));
}
