import { getAddress, ZeroAddress, parseUnits, formatEther, toUtf8Bytes } from '../vendor/ethers.min.js';
import { workshopContext } from '../workshop/client.mjs';
import { assetDetails } from '../genesis/live-protocol.mjs';
import { normalizeInstrumentRequest, instrumentTerms, requireInstrumentApproval } from './instruments.mjs';
function ownerRequest(wallet, request) {
  request = normalizeInstrumentRequest(request);
  if (request.chainId !== String(wallet.chainId) || request.collection !== wallet.collection || request.account !== wallet.account || request.tokenId !== String(wallet.tokenId)) throw Error('Request belongs to another NFT or chain.');
  return request;
}
export async function fundGeneratedInstrument(wallet, publisher, request, { worker, reviewer, asset = ZeroAddress, amount, days = 7 }) {
  request = ownerRequest(wallet, request);
  const { escrow } = await workshopContext(wallet, publisher), a = await assetDetails(wallet.provider, asset), raw = parseUnits(String(amount), a.decimals);
  if (raw <= 0n || raw > (1n << 112n) - 1n || !Number.isInteger(Number(days)) || days < 1 || days > 90) throw Error('Choose a positive fixed budget and 1–90 days.');
  const block = await wallet.provider.getBlock('latest'), submitBy = block.timestamp + Number(days) * 86400;
  return wallet.prepareUtility({ target: escrow.target, asset: a.address, amount: a.address === ZeroAddress ? '0' : String(raw), value: a.address === ZeroAddress ? formatEther(raw) : '0', data: escrow.interface.encodeFunctionData('fund', [getAddress(worker), getAddress(reviewer || wallet.account), a.address, raw, submitBy, instrumentTerms(request)]) });
}
async function workContext(wallet, publisher, id, request) {
  request = ownerRequest(wallet, request); const context = await workshopContext(wallet, publisher), work = await context.escrow.work(id);
  if (work.fundingAccount !== wallet.account || work.terms !== instrumentTerms(request)) throw Error('Commission does not match the selected request.');
  return { ...context, work };
}
export async function decideGeneratedInstrument(wallet, publisher, id, request, artifact, approval, approve) {
  const { escrow, work } = await workContext(wallet, publisher, id, request);
  if (work.reviewer !== wallet.account) throw Error('The selected external reviewer must decide this commission.');
  if (approve) { const a = requireInstrumentApproval(artifact, approval); if (a.terms !== work.terms || a.deliverable !== work.deliverable) throw Error('Provider submission differs from the exact approved program.'); }
  return wallet.prepare({ target: escrow.target, data: escrow.interface.encodeFunctionData('decide', [id, Boolean(approve)]) });
}
export async function acquireGeneratedInstrument(wallet, publisher, id, artifact, approval) {
  const a = requireInstrumentApproval(artifact, approval), { publisher: p, work } = await workContext(wallet, publisher, id, a.request);
  if (work.status !== 4n || work.deliverable !== a.deliverable) throw Error('Exact approved work must be paid before acquisition.');
  return wallet.prepare({ target: p.target, data: p.interface.encodeFunctionData('acquire', [id, a.manifestJSON, toUtf8Bytes(a.html)]) });
}
export async function refundGeneratedInstrument(wallet, publisher, id, request) {
  const { escrow } = await workContext(wallet, publisher, id, request);
  return wallet.prepare({ target: escrow.target, data: escrow.interface.encodeFunctionData('refundExpired', [id]) });
}
