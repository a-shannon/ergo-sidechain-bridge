import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJson } from '../strict-json.js';
import {
  assembleSubstrateFederatedIsolatedDevnetPortableBundleV1,
  type SubstrateFederatedIsolatedDevnetPortableArtifactRoleV1,
  type SubstrateFederatedIsolatedDevnetPortableBundleAssemblyV1,
} from '../substrate-federated-isolated-devnet-portable-bundle-v1.js';

const SOURCE_FLAGS = Object.freeze([
  ['--tracker-template', 'trackerTemplate'],
  ['--duplicate-prevention-template', 'duplicatePreventionTemplate'],
  ['--source-lock-template', 'sourceLockTemplate'],
  ['--pooled-reserve-template', 'pooledReserveTemplate'],
  ['--source-acceptance-report', 'sourceAcceptanceReport'],
  ['--source-reported-finalized-blocks', 'sourceReportedFinalizedBlocks'],
  ['--source-runtime-history', 'sourceRuntimeHistory'],
  ['--source-application-history', 'sourceApplicationHistory'],
  ['--source-history-receipt', 'sourceHistoryReceipt'],
  ['--ergo-greatest-work-headers-manifest', 'ergoGreatestWorkHeadersManifest'],
  ['--ergo-transactions-manifest', 'ergoTransactionsManifest'],
  ['--ergo-utxo-transitions-manifest', 'ergoUtxoTransitionsManifest'],
  ['--relayer-source-archive', 'relayerSourceArchive'],
  ['--relayer-package-lock', 'relayerPackageLock'],
  ['--relayer-runtime-entrypoints-manifest', 'relayerRuntimeEntrypointsManifest'],
  ['--relayer-build-artifact', 'relayerBuildArtifact'],
  ['--attestation-packet', 'attestationPacket'],
] as const satisfies readonly (readonly [
  string,
  SubstrateFederatedIsolatedDevnetPortableArtifactRoleV1,
])[]);

export function assembleSubstrateFederatedIsolatedDevnetPortableBundleFromArgumentsV1(
  argv: readonly string[],
): Readonly<SubstrateFederatedIsolatedDevnetPortableBundleAssemblyV1> {
  const expectedPairCount = SOURCE_FLAGS.length + 1;
  if (argv.length !== expectedPairCount * 2) {
    throw new Error(
      'isolated portable bundle assembly requires one destination and all source roles',
    );
  }
  const allowed = new Set([
    '--destination',
    ...SOURCE_FLAGS.map(([flag]) => flag),
  ]);
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === undefined || !allowed.has(flag)) {
      throw new Error('isolated portable bundle assembly option is unsupported');
    }
    if (value === undefined || value.length === 0 || value.startsWith('--')) {
      throw new Error('isolated portable bundle assembly option requires one value');
    }
    if (values.has(flag)) {
      throw new Error('isolated portable bundle assembly option must not repeat');
    }
    values.set(flag, value);
  }
  const destinationDirectory = values.get('--destination');
  if (destinationDirectory === undefined) {
    throw new Error('isolated portable bundle destination is required');
  }
  const sources = Object.fromEntries(SOURCE_FLAGS.map(([flag, role]) => {
    const value = values.get(flag);
    if (value === undefined) {
      throw new Error('isolated portable bundle source role is required');
    }
    return [role, value] as const;
  })) as Record<SubstrateFederatedIsolatedDevnetPortableArtifactRoleV1, string>;
  return assembleSubstrateFederatedIsolatedDevnetPortableBundleV1({
    destinationDirectory,
    sources,
  });
}

function main(): void {
  const result =
    assembleSubstrateFederatedIsolatedDevnetPortableBundleFromArgumentsV1(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(result)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch {
    process.stderr.write('isolated portable bundle assembly failed\n');
    process.exitCode = 1;
  }
}
