import fs from 'node:fs/promises';
import path from 'node:path';
import { Interface, getAddress } from 'ethers';
import { compileGeneratedInstrument, validateGeneratedInstrument } from '../../worlds/instruments.mjs';
const [command, requestFile, htmlFile, output, escrow, workId, chainId] = process.argv.slice(2);
if (command === 'build') {
  if (!requestFile || !htmlFile || !output) throw Error('Usage: node agent/worlds/provider.mjs build request.json source.html output-dir');
  const request = JSON.parse(await fs.readFile(requestFile, 'utf8')), html = await fs.readFile(htmlFile, 'utf8');
  const artifact = compileGeneratedInstrument(request, html, request.capabilities || []);
  await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, 'deliverable.json'), JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify({ deliverable: artifact.deliverable, bytes: artifact.bytes, output: path.resolve(output), notice: 'Exact commitment only. Owner source review and separate escrow payment approval are required.' }));
} else if (command === 'verify') {
  const artifact = validateGeneratedInstrument(JSON.parse(await fs.readFile(requestFile, 'utf8'))); console.log(JSON.stringify({ contentHash: artifact.contentHash, deliverable: artifact.deliverable, bytes: artifact.bytes, safe: 'Not certified' }));
} else if (command === 'plan') {
  // Positions: plan deliverable.json unused output-dir escrow work-id chain-id
  if (!/^\d+$/.test(workId || '') || !/^\d+$/.test(chainId || '')) throw Error('Usage: node agent/worlds/provider.mjs plan deliverable.json - output-dir escrow work-id chain-id');
  const artifact = validateGeneratedInstrument(JSON.parse(await fs.readFile(requestFile, 'utf8'))), abi = new Interface(['function accept(uint256)', 'function submit(uint256,bytes32)']);
  await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, 'unsigned-actions.json'), JSON.stringify({ schema: 'anima.generated-provider-actions/1', chainId, notice: 'Verify work terms, addresses, worker, reviewer, funding and deadlines onchain. Accept and confirm it before submitting. No transaction is sent.', terms: artifact.terms, transactions: [{ to: getAddress(escrow), value: '0', data: abi.encodeFunctionData('accept', [workId]) }, { to: getAddress(escrow), value: '0', data: abi.encodeFunctionData('submit', [workId, artifact.deliverable]) }] }, null, 2));
} else throw Error('Use build, verify, or plan.');
