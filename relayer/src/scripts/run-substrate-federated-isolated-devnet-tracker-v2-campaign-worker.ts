import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runSubstrateFederatedIsolatedDevnetTrackerV2CampaignRoot,
  assertSubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt,
  type SubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-tracker-v2-campaign-root.js';
import { resolveBridgeRepositoryRootsFromCheckoutLayout } from '../bridge-repository-layout.js';
import { canonicalPathIdentity, isPathInside } from '../create-only-out-of-repository-artifact.js';
import { preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1 }
  from './preflight-substrate-federated-isolated-devnet-campaign-v1.js';
import { loadCanonicalBootstrapRequestBoundWithProvenanceV1 }
  from './run-substrate-federated-isolated-devnet-bootstrap-worker-v1.js';
import { explicitExistingLocalNonSensitivePath }
  from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js';

const FLAGS = [
  '--request', '--expected-request-sha256', '--amount-nano-erg',
  '--recipient-address-hex', '--frontier-temporary-root',
  '--frontier-cargo-cache', '--tracker-transport-journal-root',
  '--relayer-cargo-cache',
] as const;

/** The request creator must retain its fresh owner in this same process. */
export async function runSubstrateFederatedIsolatedDevnetTrackerV2CampaignWorkerFromArguments(
  argv: readonly string[],
): Promise<Readonly<SubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt>> {
  const args = parseArguments(argv);
  if (process.platform !== 'win32' || process.versions.node.split('.')[0] !== '24') {
    throw new Error('tracker V2 campaign worker requires Windows and Node 24');
  }
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const { bridgeRoot, worktreeRoot } = resolveBridgeRepositoryRootsFromCheckoutLayout(
    resolve(scriptDirectory, '..', '..', '..'),
  );
  const requestPath = explicitExistingLocalNonSensitivePath(args.request, 'tracker V2 request', 'file');
  if (pathsOverlap(requestPath, worktreeRoot)) {
    throw new Error('tracker V2 request must remain outside the worktree');
  }
  const roots = [args.temporary, args.frontierCargo, args.journal, args.relayerCargo]
    .map(value => explicitExistingLocalNonSensitivePath(value, 'tracker V2 external root', 'directory'));
  for (let i = 0; i < roots.length; i += 1) {
    if (pathsOverlap(roots[i]!, worktreeRoot) || pathsOverlap(roots[i]!, requestPath)) {
      throw new Error('tracker V2 external roots must exclude the worktree and request');
    }
    for (let j = i + 1; j < roots.length; j += 1) {
      if (pathsOverlap(roots[i]!, roots[j]!)) {
        throw new Error('tracker V2 external roots must be disjoint');
      }
    }
  }
  const [temporaryDirectoryRoot, cargoDependencyCacheDirectory,
    trackerTransportJournalRoot, relayerCargoCacheDirectory] = roots as [string, string, string, string];
  const cargoHome = explicitExistingLocalNonSensitivePath(process.env.CARGO_HOME,
    'tracker V2 CARGO_HOME', 'directory');
  if (canonicalPathIdentity(cargoHome) !== canonicalPathIdentity(relayerCargoCacheDirectory)) {
    throw new Error('tracker V2 CARGO_HOME differs from the selected relayer cache');
  }

  const loaded = loadCanonicalBootstrapRequestBoundWithProvenanceV1(
    requestPath, bridgeRoot, worktreeRoot, args.digest,
  );
  if (pathsOverlap(trackerTransportJournalRoot, loaded.input.lifecycle.relayerArtifacts.destinationDirectory)
    || pathsOverlap(trackerTransportJournalRoot, loaded.input.build.ergoSourcePath)) {
    throw new Error('tracker V2 journal overlaps request-bound source or artifact');
  }
  // Reuse the fixed preflight; no caller-supplied receipt can replace execution.
  const preflight = preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1([
    '--request', requestPath, '--expected-request-sha256', args.digest,
    '--amount-nano-erg', args.amount, '--recipient-address-hex', args.recipient,
    '--frontier-temporary-root', temporaryDirectoryRoot,
    '--frontier-cargo-cache', cargoDependencyCacheDirectory,
    '--relayer-cargo-cache', relayerCargoCacheDirectory,
  ]);
  if (preflight.status !== 'request_bound_lab_campaign_preflight_passed'
    || preflight.requestSha256Hex !== args.digest
    || preflight.pegIn.amountNanoErg !== args.amount
    || preflight.pegIn.recipientAddressHex !== args.recipient
    || preflight.requestBindings.expectedHeadCommitSha1Hex
      !== loaded.input.lifecycle.relayerArtifacts.expectedHeadCommitSha1Hex) {
    throw new Error('tracker V2 preflight differs from the exact execution request');
  }
  const acceptance = loaded.input.lifecycle.sourceHistory.acceptance;
  const result = await runSubstrateFederatedIsolatedDevnetTrackerV2CampaignRoot({
    ...loaded.input,
    requestBinding: loaded.requestBinding,
    pegIn: Object.freeze({ amountNanoErg: args.amount, recipientAddressHex: args.recipient }),
    frontierApplicationRunner: Object.freeze({
      frontierSourceDirectory: acceptance.frontierSourcePath,
      temporaryDirectoryRoot, cargoDependencyCacheDirectory,
      cargoExecutablePath: acceptance.cargoExecutablePath,
      rustcExecutablePath: acceptance.rustcExecutablePath,
      gitExecutablePath: acceptance.gitExecutablePath,
      offline: true,
    }),
    trackerTransportJournalRoot,
  });
  assertSubstrateFederatedIsolatedDevnetTrackerV2CampaignReceipt(result.receipt);
  if (result.receipt.requestSha256Hex !== args.digest) {
    throw new Error('tracker V2 campaign receipt belongs to a different request');
  }
  return result.receipt;
}

function parseArguments(argv: readonly string[]) {
  const values = [...argv];
  if (values.length !== FLAGS.length * 2 || FLAGS.some((flag, index) =>
    values[index * 2] !== flag || typeof values[index * 2 + 1] !== 'string'
    || values[index * 2 + 1]!.length === 0 || values[index * 2 + 1]!.startsWith('--'))
    || !/^[0-9a-f]{64}$/u.test(values[3]!)
    || !/^[1-9][0-9]{0,18}$/u.test(values[5]!)
    || BigInt(values[5]!) > 0x7fff_ffff_ffff_ffffn
    || !/^[0-9a-f]{40}$/u.test(values[7]!) || /^0{40}$/u.test(values[7]!)) {
    throw new Error('tracker V2 campaign worker arguments are invalid');
  }
  return Object.freeze({ request: values[1]!, digest: values[3]!, amount: values[5]!,
    recipient: values[7]!, temporary: values[9]!, frontierCargo: values[11]!,
    journal: values[13]!, relayerCargo: values[15]! });
}

function pathsOverlap(left: string, right: string): boolean {
  return canonicalPathIdentity(left) === canonicalPathIdentity(right)
    || isPathInside(left, right) || isPathInside(right, left);
}
