// No signer, provider, environment credentials, signing or broadcast path.
import fs from 'node:fs';
import path from 'node:path';
import {prepareGenesisDeployment, verifyGenesisDeploymentPlan} from './lib/genesis-deployment.mjs';

const args = process.argv.slice(2);
const help = `Prepare an unsigned offline Genesis testnet plan:
  node scripts/genesis-deployment.mjs --config genesis-config.json --output genesis-plan.json
Verify a saved plan against the current compiled artifacts and both archives:
  node scripts/genesis-deployment.mjs --verify genesis-plan.json

Build first: npm run compile && npm run build && npm run archive:confluence
Then: node scripts/archive-privacy-resource.mjs
Configuration and remaining deployment steps: docs/genesis/GENESIS-DEPLOYMENT.md
This tool sends no transactions. Gas and fees are unestimated; addresses depend on the supplied EOA nonce.`;

async function main() {
  if (args.length === 1 && args[0] === '--help') { console.log(help); return; }
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--config', '--output', '--verify'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || options[args[i]]) throw Error('Invalid arguments. Use --help. There is no broadcast mode.');
    options[args[i]] = args[i + 1];
  }
  if (options['--verify']) {
    if (Object.keys(options).length !== 1) throw Error('--verify cannot be combined with other arguments.');
    const plan = await verifyGenesisDeploymentPlan(JSON.parse(fs.readFileSync(options['--verify'], 'utf8')));
    console.log(JSON.stringify({verifiedAgainstCurrentBuild: true, status: plan.status, planSha256: plan.planSha256, ...plan.summary}, null, 2));
    return;
  }
  if (!options['--config'] || !options['--output']) throw Error('--config and --output are required. Use --help.');
  const output = path.resolve(options['--output']);
  if (output === path.resolve(options['--config'])) throw Error('Plan output must differ from configuration input.');
  if (fs.existsSync(output)) throw Error('Plan output already exists. Choose a fresh filename.');
  const plan = await prepareGenesisDeployment(JSON.parse(fs.readFileSync(options['--config'], 'utf8')));
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(plan, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({plan: output, status: plan.status, chainId: plan.config.chainId, collection: plan.modules.IDontFuckingBelieveIt, planSha256: plan.planSha256, ...plan.summary}, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
