import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1,
  type SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  resolveBridgeRepositoryRootsFromCheckoutLayout,
} from '../bridge-repository-layout.js';
import { canonicalJson } from '../ergo-settlement-core/strict-json.js';
import {
  loadCanonicalBootstrapRequestBoundToSha256,
} from './run-substrate-federated-isolated-devnet-bootstrap-worker-v1.js';

export async function runSubstrateFederatedIsolatedDevnetGenesisSetupWorkerFromArgumentsV1(
  argv: readonly string[],
): Promise<Readonly<SubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1Receipt>> {
  if (
    argv.length !== 4
    || argv[0] !== '--request'
    || argv[1] === undefined
    || argv[1].length === 0
    || argv[1].startsWith('--')
    || argv[2] !== '--expected-request-sha256'
    || argv[3] === undefined
    || !/^[0-9a-f]{64}$/u.test(argv[3])
  ) {
    throw new Error('isolated genesis setup worker arguments are invalid');
  }
  if (process.platform !== 'win32') {
    throw new Error('isolated genesis setup worker requires Windows');
  }
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const inferredBridgeRoot = resolve(scriptDirectory, '..', '..', '..');
  const { bridgeRoot, worktreeRoot } =
    resolveBridgeRepositoryRootsFromCheckoutLayout(inferredBridgeRoot);
  const input = loadCanonicalBootstrapRequestBoundToSha256(
    argv[1],
    bridgeRoot,
    worktreeRoot,
    argv[3],
  );
  const result =
    await runSubstrateFederatedIsolatedDevnetGenesisSetupExecutionRootV1(
      input,
    );
  return result.receipt;
}

async function main(): Promise<void> {
  const receipt =
    await runSubstrateFederatedIsolatedDevnetGenesisSetupWorkerFromArgumentsV1(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(receipt)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write('isolated genesis setup worker failed\n');
    process.exitCode = 1;
  });
}
