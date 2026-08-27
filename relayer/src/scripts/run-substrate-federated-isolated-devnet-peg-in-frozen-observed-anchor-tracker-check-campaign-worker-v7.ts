import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  canonicalPathIdentity,
  isPathInside,
} from '../create-only-out-of-repository-artifact.js';
import { canonicalJson } from '../ergo-settlement-core/strict-json.js';
import {
  loadCanonicalBootstrapRequestBoundToSha256,
} from './run-substrate-federated-isolated-devnet-bootstrap-worker-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8,
  type SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8,
} from './run-substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-receipt-v8.js';
import {
  createFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseFailureV7,
  readSafeFrozenObservedAnchorTrackerCheckCampaignBindingFailureV7,
  readSafeFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7,
  type FrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7,
} from './run-substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-receipt-v7.js';
import {
  explicitExistingLocalNonSensitivePath,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js';

const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const WORKER_FAILURE_PREFIX =
  'isolated frozen-observed-anchor-tracker-check campaign worker failed';

export async function runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV7(
  argv: readonly string[],
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8
>> {
  let phase: FrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7 =
    'worker arguments';
  try {
    if (
      argv.length !== 12
      || argv[0] !== '--request'
      || argv[1] === undefined
      || argv[1].length === 0
      || argv[1].startsWith('--')
      || argv[2] !== '--expected-request-sha256'
      || argv[3] === undefined
      || !/^[0-9a-f]{64}$/u.test(argv[3])
      || argv[4] !== '--amount-nano-erg'
      || argv[5] === undefined
      || !/^[1-9][0-9]*$/u.test(argv[5])
      || BigInt(argv[5]) > ERGO_POSITIVE_LONG_MAX
      || argv[6] !== '--recipient-address-hex'
      || argv[7] === undefined
      || !/^[0-9a-f]{40}$/u.test(argv[7])
      || /^0{40}$/u.test(argv[7])
      || argv[8] !== '--frontier-temporary-root'
      || argv[9] === undefined
      || argv[9].length === 0
      || argv[9].startsWith('--')
      || argv[10] !== '--frontier-cargo-cache'
      || argv[11] === undefined
      || argv[11].length === 0
      || argv[11].startsWith('--')
    ) {
      throw new Error(
        'isolated frozen-observed-anchor-tracker-check campaign worker arguments are invalid',
      );
    }

    phase = 'worker platform';
    if (process.platform !== 'win32') {
      throw new Error(
        'isolated frozen-observed-anchor-tracker-check campaign worker requires Windows',
      );
    }

    phase = 'external roots';
    const temporaryDirectoryRoot = explicitExistingLocalNonSensitivePath(
      argv[9],
      'Frontier frozen-observed-anchor-tracker-check temporary root',
      'directory',
    );
    const cargoDependencyCacheDirectory = explicitExistingLocalNonSensitivePath(
      argv[11],
      'Frontier frozen-observed-anchor-tracker-check Cargo dependency cache',
      'directory',
    );
    if (pathsOverlap(temporaryDirectoryRoot, cargoDependencyCacheDirectory)) {
      throw new Error(
        'Frontier temporary root and Cargo dependency caches must differ and not overlap',
      );
    }

    phase = 'worker roots';
    const scriptDirectory = dirname(fileURLToPath(import.meta.url));
    const { bridgeRoot, worktreeRoot } =
      resolveCanonicalFrozenObservedAnchorTrackerCheckCampaignWorkerRootsV7(scriptDirectory);

    phase = 'worker environment';
    const relayerCargoCacheDirectory = explicitExistingLocalNonSensitivePath(
      process.env.CARGO_HOME,
      'relayer artifact Cargo dependency cache',
      'directory',
    );
    if (
      canonicalPathIdentity(relayerCargoCacheDirectory)
        === canonicalPathIdentity(worktreeRoot)
      || isPathInside(worktreeRoot, relayerCargoCacheDirectory)
    ) {
      throw new Error(
        'relayer artifact Cargo dependency cache must remain outside the worktree',
      );
    }
    if (
      pathsOverlap(temporaryDirectoryRoot, relayerCargoCacheDirectory)
      || pathsOverlap(
        cargoDependencyCacheDirectory,
        relayerCargoCacheDirectory,
      )
    ) {
      throw new Error(
        'Frontier temporary root and Cargo dependency caches must differ and not overlap',
      );
    }

    phase = 'bootstrap request';
    const input = loadCanonicalBootstrapRequestBoundToSha256(
      argv[1],
      bridgeRoot,
      worktreeRoot,
      argv[3],
    );
    const pegIn = Object.freeze({
      amountNanoErg: argv[5],
      recipientAddressHex: argv[7],
    });
    const acceptance = input.lifecycle.sourceHistory.acceptance;

    phase = 'campaign root';
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7({
        ...input,
        pegIn,
        frontierApplicationRunner: Object.freeze({
          frontierSourceDirectory: acceptance.frontierSourcePath,
          temporaryDirectoryRoot,
          cargoDependencyCacheDirectory,
          cargoExecutablePath: acceptance.cargoExecutablePath,
          rustcExecutablePath: acceptance.rustcExecutablePath,
          gitExecutablePath: acceptance.gitExecutablePath,
          offline: true as const,
        }),
      });

    phase = 'worker receipt';
    return buildSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8(
      result.receipt,
      argv[3],
      pegIn,
    );
  } catch (error) {
    if (
      readSafeFrozenObservedAnchorTrackerCheckCampaignBindingFailureV7(error)
        !== undefined
    ) {
      throw error;
    }
    throw createFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseFailureV7(
      phase,
      error,
    );
  }
}

export function resolveCanonicalFrozenObservedAnchorTrackerCheckCampaignWorkerRootsV7(
  scriptDirectory: string,
): Readonly<{ readonly bridgeRoot: string; readonly worktreeRoot: string }> {
  const bridgeRoot = realpathSync(resolve(scriptDirectory, '..', '..', '..'));
  return Object.freeze({
    bridgeRoot,
    worktreeRoot: realpathSync(resolve(bridgeRoot, '..')),
  });
}

function pathsOverlap(left: string, right: string): boolean {
  return canonicalPathIdentity(left) === canonicalPathIdentity(right)
    || isPathInside(left, right)
    || isPathInside(right, left);
}

export function formatSafeFrozenObservedAnchorTrackerCheckCampaignWorkerFailureV7(
  error: unknown,
): string {
  const binding =
    readSafeFrozenObservedAnchorTrackerCheckCampaignBindingFailureV7(error);
  if (binding !== undefined) {
    return `${WORKER_FAILURE_PREFIX}: producer-to-consumer binding changed: ${binding}\n`;
  }
  const phase =
    readSafeFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7(error);
  if (phase !== undefined) {
    return `${WORKER_FAILURE_PREFIX}: phase failed: ${phase}\n`;
  }
  return `${WORKER_FAILURE_PREFIX}\n`;
}

async function main(): Promise<void> {
  const receipt =
    await runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV7(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(receipt)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(error => {
    process.stderr.write(
      formatSafeFrozenObservedAnchorTrackerCheckCampaignWorkerFailureV7(error),
    );
    process.exitCode = 1;
  });
}
