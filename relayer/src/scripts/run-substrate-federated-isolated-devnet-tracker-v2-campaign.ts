import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '../ergo-settlement-core/strict-json.js';

const FAILURE_DIAGNOSTICS = new WeakMap<object, string>();

export function readSubstrateFederatedIsolatedDevnetTrackerV2CampaignFailure(value: unknown): string | null {
  return value !== null && typeof value === 'object' ? FAILURE_DIAGNOSTICS.get(value) ?? null : null;
}

/** Import in the request creator's process; a request file cannot restore custody. */
export async function runSubstrateFederatedIsolatedDevnetTrackerV2CampaignFromArguments(
  argv: readonly string[],
) {
  const args = Object.freeze([...argv]);
  const { runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments,
    formatSubstrateFederatedIsolatedDevnetTrackerV2CampaignFailure } =
    await import('./run-substrate-federated-isolated-devnet-tracker-v2-campaign-worker.js');
  try {
    return await runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(args);
  } catch (error) {
    // Projection must not replace the original failure or retry the campaign.
    try {
      const diagnostic = formatSubstrateFederatedIsolatedDevnetTrackerV2CampaignFailure(error);
      if (diagnostic !== null && error !== null && typeof error === 'object') {
        FAILURE_DIAGNOSTICS.set(error, diagnostic);
      }
    } catch { /* Keep the fixed error message when diagnostic projection is unavailable. */ }
    throw error;
  }
}

async function main(): Promise<void> {
  const receipt = await runSubstrateFederatedIsolatedDevnetTrackerV2CampaignFromArguments(
    process.argv.slice(2),
  );
  process.stdout.write(`${canonicalJson(receipt)}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    process.stderr.write('isolated tracker V2 campaign failed; no successful receipt\n');
    const diagnostic = readSubstrateFederatedIsolatedDevnetTrackerV2CampaignFailure(error);
    if (diagnostic !== null) process.stderr.write(`${diagnostic}\n`);
    process.exitCode = 1;
  });
}
