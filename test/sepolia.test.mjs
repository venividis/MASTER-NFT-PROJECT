import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface, keccak256} from 'ethers';
import {normalizedSteps, verifyStepPostconditions} from '../scripts/sepolia.mjs';

const factory = '0x0000000000000000000000000000000000000001';
const archive = '0x0000000000000000000000000000000000000002';
const digest = '0x' + '11'.repeat(32);
const code = '0x6000';
const abi = new Interface([
  'event ArchiveCreated(address indexed archive,uint8 schema,bytes32 indexed digest,uint256 byteLength,bytes32 codeHash)',
]);

test('Sepolia normalization retains archive integrity and factory nonce commitments', () => {
  const moduleStep = {id: 'archive', kind: 'createArchive', chainId: '11155111', from: archive, to: factory,
    nonce: 3, data: '0x12', value: '0', expectedAddress: archive, archiveHash: digest, archiveBytes: 2, archiveSchema: 1,
    preconditions: {factory, expectedFactoryNonce: 1, expectedArchive: archive}};
  const [step] = normalizedSteps({genesis: {requests: []}, modules: {steps: [moduleStep]}});
  assert.equal(step.archiveHash, digest);
  assert.equal(step.archiveBytes, 2);
  assert.equal(step.preconditions.expectedFactoryNonce, 1);
  assert.equal(step.chainId, 11155111);
});

test('Sepolia archive receipt verification rejects a front-run address substitution', async () => {
  const step = {id: 'archive', kind: 'createArchive', expectedAddress: archive, archiveHash: digest,
    archiveBytes: 2, archiveSchema: 1, preconditions: {factory}};
  const event = (created = archive) => {
    const encoded = abi.encodeEventLog(abi.getEvent('ArchiveCreated'), [created, 1, digest, 2, keccak256(code)]);
    return {address: factory, ...encoded};
  };
  const provider = {getCode: async () => code};
  await verifyStepPostconditions(provider, step, {logs: [event()]});
  await assert.rejects(() => verifyStepPostconditions(provider, step, {logs: [event(factory)]}), /diverged/);
});
