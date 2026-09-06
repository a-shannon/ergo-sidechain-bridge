import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '../ergo-settlement-core/strict-json.js';

/** Import in the request creator's process; a request file cannot restore custody. */
export async function runSubstrateFederatedIsolatedDevnetTrackerV2CampaignFromArguments(
  argv: readonly string[],
) {
  const args = Object.freeze([...argv]);
  const { runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments } =
    await import('./run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.js');
  return runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args);
}

async function main(): Promise<void> {
  const receipt = await runSubstrateFederatedIsolatedDevnetTrackerV2CampaignFromArguments(
    process.argv.slice(2),
  );
  process.stdout.write(`${canonicalJson(receipt)}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    process.stderr.write('isolated tracker V2 campaign failed; no successful receipt\n');
    process.exitCode = 1;
  });
}
