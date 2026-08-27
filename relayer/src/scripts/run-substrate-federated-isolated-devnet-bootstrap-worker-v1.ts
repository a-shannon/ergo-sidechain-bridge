import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  bindSubstrateFederatedIsolatedDevnetCanonicalBootstrapRequestBytesV1,
  type SubstrateFederatedIsolatedDevnetBootstrapRequestBindingV1,
} from '../adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.js';
import {
  runSubstrateFederatedIsolatedDevnetBootstrapRootV1,
  type SubstrateFederatedIsolatedDevnetBootstrapRootV1Receipt,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-bootstrap-root-v1.js';
import { canonicalJson } from '../ergo-settlement-core/strict-json.js';
import {
  loadCanonicalBootstrapRequestMaterialBoundToSha256V1,
  loadCanonicalBootstrapRequestV1,
} from './substrate-federated-isolated-devnet-bootstrap-request-v1.js';

export {
  loadCanonicalBootstrapRequestBoundToSha256,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_COMMAND_REQUEST_V1_SCHEMA,
  type BootstrapCommandRequestV1,
} from './substrate-federated-isolated-devnet-bootstrap-request-v1.js';

export async function runSubstrateFederatedIsolatedDevnetBootstrapWorkerFromArgumentsV1(
  argv: readonly string[],
): Promise<Readonly<SubstrateFederatedIsolatedDevnetBootstrapRootV1Receipt>> {
  if (
    argv.length !== 2
    || argv[0] !== '--request'
    || argv[1] === undefined
    || argv[1].length === 0
    || argv[1].startsWith('--')
  ) {
    throw new Error('isolated no-submit bootstrap worker arguments are invalid');
  }
  if (process.platform !== 'win32') {
    throw new Error('isolated no-submit bootstrap worker requires Windows');
  }
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const bridgeRoot = resolve(scriptDirectory, '..', '..', '..');
  const worktreeRoot = resolve(bridgeRoot, '..');
  const input = loadCanonicalBootstrapRequestV1(
    argv[1],
    bridgeRoot,
    worktreeRoot,
  );
  const result = await runSubstrateFederatedIsolatedDevnetBootstrapRootV1(input);
  return result.receipt;
}

export function loadCanonicalBootstrapRequestBoundWithProvenanceV1(
  requestPath: string,
  bridgeRoot: string,
  worktreeRoot: string,
  expectedRequestSha256Hex: string,
): Readonly<{
  readonly input: ReturnType<
    typeof loadCanonicalBootstrapRequestMaterialBoundToSha256V1
  >['input'];
  readonly requestBinding:
    Readonly<SubstrateFederatedIsolatedDevnetBootstrapRequestBindingV1>;
}> {
  const material = loadCanonicalBootstrapRequestMaterialBoundToSha256V1(
    requestPath,
    bridgeRoot,
    worktreeRoot,
    expectedRequestSha256Hex,
  );
  const requestBinding =
    bindSubstrateFederatedIsolatedDevnetCanonicalBootstrapRequestBytesV1(
      material.requestBytes,
      expectedRequestSha256Hex,
      material.input,
    );
  return Object.freeze({ input: material.input, requestBinding });
}

async function main(): Promise<void> {
  const receipt =
    await runSubstrateFederatedIsolatedDevnetBootstrapWorkerFromArgumentsV1(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(receipt)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write('isolated no-submit bootstrap worker failed\n');
    process.exitCode = 1;
  });
}
