import {RelayAdaptHelper, ABIRelayAdapt} from '@railgun-community/engine';
import {Interface, getAddress, keccak256, toUtf8Bytes} from 'ethers';
import {crossContractCalls} from '../../../web/v4/client.mjs';
import {unshieldGross} from '../../../web/v4/math.mjs';
import {inspectHook, verifyHookContract} from '../../../web/launchpad/hook-client.mjs';

const json = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item);

/** Commit to the selected chain, shared caller, exact call and complete asset return set. */
export function privatePlanFingerprint(plan, relay) {
  return keccak256(toUtf8Bytes(json({
    chainId: Number(plan.chainId), relay: getAddress(relay), kind: plan.kind,
    request: {to: getAddress(plan.request.to), data: plan.request.data, value: String(plan.request.value || 0)},
    spend: plan.spend.map(s => ({tokenAddress: getAddress(s.tokenAddress), amount: String(s.amount)})),
    outputs: plan.outputs.map(getAddress), deadline: plan.deadline,
    hook: plan.hook || null,
  })));
}

/** The proof commits to this nested operation. A failed application leaves only existing assets to refund. */
export async function composePrivateCalls(plan, relay, recipient, unshieldFee, shieldRandom) {
  relay = getAddress(relay);
  if (BigInt(plan.request.value || 0) !== 0n) throw Error('Private application calls must not spend public native currency.');
  if (!plan.spend.length || !plan.outputs.length) throw Error('Private operation has no complete asset accounting.');
  const spend = plan.spend.map(s => ({tokenAddress: getAddress(s.tokenAddress), amount: unshieldGross(s.amount, unshieldFee)}));
  if (new Set(spend.map(s => s.tokenAddress)).size !== spend.length) throw Error('Duplicate private input asset.');
  const outputs = [...new Set(plan.outputs.map(getAddress))].map(tokenAddress => ({tokenAddress, recipientAddress: recipient}));
  if (plan.kind === 'launch') for (const asset of [plan.summary.token, plan.summary.position])
    if (!asset || !outputs.some(o => o.tokenAddress === getAddress(asset)))
      throw Error('Created token or liquidity shares are missing from the shielded return path.');
  for (const input of spend) if (!outputs.some(o => o.tokenAddress === input.tokenAddress))
    throw Error('Input refund is missing from the shielded return path.');
  const iface = new Interface(ABIRelayAdapt);
  const shieldRequests = await RelayAdaptHelper.generateRelayShieldRequests(shieldRandom, outputs, []);
  const inner = [...crossContractCalls(plan), {to: relay, data: iface.encodeFunctionData('shield', [shieldRequests]), value: 0n}];
  const calls = [{to: relay, data: iface.encodeFunctionData('multicall', [true, inner]), value: 0n}];
  // New token and position addresses are shielded only inside the successful inner call.
  // Calling balanceOf on undeployed failed creations would otherwise break the outer refund.
  const refunds = spend.map(s => ({tokenAddress: s.tokenAddress, recipientAddress: recipient}));
  return {spend, outputs, refunds, calls, planFingerprint: privatePlanFingerprint(plan, relay)};
}

export async function verifyPrivatePlan(provider, config, plan, relay, fingerprint) {
  if (privatePlanFingerprint(plan, relay) !== fingerprint) throw Error('Terms changed. Prepare a new review.');
  if ((await provider.getNetwork()).chainId !== BigInt(plan.chainId)) throw Error('RPC or wallet chain changed.');
  if (!plan.hook) return;
  const current = await inspectHook(provider, config, {hook: plan.hook.hook});
  if (json(current) !== json(plan.hook)) throw Error('Creator fee settings changed. Prepare a new review.');
  if (plan.kind === 'launch') {
    const factory = await verifyHookContract(provider, plan.request.to, 'GenesisV4HookLaunchpad', {manager: config.manager || current.manager});
    const [token, position] = await factory.predict(plan.terms, relay, plan.hook.hook);
    if (getAddress(token) !== getAddress(plan.summary.token) || getAddress(position) !== getAddress(plan.summary.position))
      throw Error('Terms changed. Prepare a new review.');
    if (await provider.getCode(token) !== '0x' || await provider.getCode(position) !== '0x') throw Error('This launch already exists. Reconcile its transaction before preparing another.');
  }
}
