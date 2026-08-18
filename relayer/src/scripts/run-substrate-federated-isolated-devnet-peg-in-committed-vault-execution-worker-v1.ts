import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import { canonicalJson } from '../ergo-settlement-core/strict-json.js';
import {
  loadCanonicalBootstrapRequestBoundToSha256,
} from './run-substrate-federated-isolated-devnet-bootstrap-worker-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerReceiptV1,
  type SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerReceiptV1,
} from './run-substrate-federated-isolated-devnet-peg-in-committed-vault-execution-receipt-v1.js';

const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;

export async function runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerFromArgumentsV1(
  argv: readonly string[],
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerReceiptV1>> {
  if (
    argv.length !== 8
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
  ) {
    throw new Error('isolated committed-vault execution worker arguments are invalid');
  }
  if (process.platform !== 'win32') {
    throw new Error('isolated committed-vault execution worker requires Windows');
  }
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const bridgeRoot = resolve(scriptDirectory, '..', '..', '..');
  const worktreeRoot = resolve(bridgeRoot, '..');
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
  const result =
    await runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionRootV1({
      ...input,
      pegIn,
    });
  return buildSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerReceiptV1(
    result.receipt,
    argv[3],
    pegIn,
  );
}

async function main(): Promise<void> {
  const receipt =
    await runSubstrateFederatedIsolatedDevnetPegInCommittedVaultExecutionWorkerFromArgumentsV1(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(receipt)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write('isolated committed-vault execution worker failed\n');
    process.exitCode = 1;
  });
}
