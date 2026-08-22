import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  runSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3,
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
  buildSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignWorkerReceiptV3,
  type SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignWorkerReceiptV3,
} from './run-substrate-federated-isolated-devnet-peg-in-application-checkpoint-campaign-receipt-v3.js';
import {
  explicitExistingLocalNonSensitivePath,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js';

const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;

export async function runSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignWorkerFromArgumentsV3(
  argv: readonly string[],
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignWorkerReceiptV3
>> {
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
      'isolated application-checkpoint campaign worker arguments are invalid',
    );
  }
  if (process.platform !== 'win32') {
    throw new Error(
      'isolated application-checkpoint campaign worker requires Windows',
    );
  }
  const temporaryDirectoryRoot = explicitExistingLocalNonSensitivePath(
    argv[9],
    'Frontier application-checkpoint temporary root',
    'directory',
  );
  const cargoDependencyCacheDirectory = explicitExistingLocalNonSensitivePath(
    argv[11],
    'Frontier application-checkpoint Cargo dependency cache',
    'directory',
  );
  if (pathsOverlap(temporaryDirectoryRoot, cargoDependencyCacheDirectory)) {
    throw new Error(
      'Frontier temporary root and Cargo dependency caches must differ and not overlap',
    );
  }
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const { bridgeRoot, worktreeRoot } =
    resolveCanonicalApplicationCheckpointCampaignWorkerRootsV3(scriptDirectory);
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
  const result =
    await runSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignRootV3({
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
  return buildSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignWorkerReceiptV3(
    result.receipt,
    argv[3],
    pegIn,
  );
}

export function resolveCanonicalApplicationCheckpointCampaignWorkerRootsV3(
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

async function main(): Promise<void> {
  const receipt =
    await runSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignWorkerFromArgumentsV3(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(receipt)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write(
      'isolated application-checkpoint campaign worker failed\n',
    );
    process.exitCode = 1;
  });
}
