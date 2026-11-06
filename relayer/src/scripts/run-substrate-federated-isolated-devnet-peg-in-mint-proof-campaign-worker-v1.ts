import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  resolveBridgeRepositoryRootsFromCheckoutLayout,
} from '../bridge-repository-layout.js';
import { canonicalJson } from '../ergo-settlement-core/strict-json.js';
import {
  loadCanonicalBootstrapRequestBoundToSha256,
} from './run-substrate-federated-isolated-devnet-bootstrap-worker-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1,
  type SubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1,
} from './run-substrate-federated-isolated-devnet-peg-in-mint-proof-campaign-receipt-v1.js';

const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;

export async function runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerFromArgumentsV1(
  argv: readonly string[],
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1>> {
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
    throw new Error('isolated mint-proof campaign worker arguments are invalid');
  }
  if (process.platform !== 'win32') {
    throw new Error('isolated mint-proof campaign worker requires Windows');
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
  const pegIn = Object.freeze({
    amountNanoErg: argv[5],
    recipientAddressHex: argv[7],
  });
  const acceptance = input.lifecycle.sourceHistory.acceptance;
  const result =
    await runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignRootV1({
      ...input,
      pegIn,
      frontierMintProofConsumer: Object.freeze({
        frontierSourceDirectory: acceptance.frontierSourcePath,
        cargoExecutablePath: acceptance.cargoExecutablePath,
        rustcExecutablePath: acceptance.rustcExecutablePath,
        gitExecutablePath: acceptance.gitExecutablePath,
        offline: true as const,
      }),
    });
  return buildSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerReceiptV1(
    result.receipt,
    argv[3],
    pegIn,
  );
}

async function main(): Promise<void> {
  const receipt =
    await runSubstrateFederatedIsolatedDevnetPegInMintProofCampaignWorkerFromArgumentsV1(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(receipt)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write('isolated mint-proof campaign worker failed\n');
    process.exitCode = 1;
  });
}
