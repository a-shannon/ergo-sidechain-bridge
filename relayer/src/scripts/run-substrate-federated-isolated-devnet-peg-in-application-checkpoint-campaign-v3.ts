import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalPathIdentity,
  readBoundedRegularFile,
} from '../create-only-out-of-repository-artifact.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import { runBoundedProcess } from '../pinned-local-native-verifier-build.js';
import {
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1,
} from '../relayer-core/substrate-federated-isolated-devnet-receipt-data-safety-v1.js';
import {
  parseSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignWorkerReceiptV3,
  type SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignWorkerReceiptV3,
} from './run-substrate-federated-isolated-devnet-peg-in-application-checkpoint-campaign-receipt-v3.js';
import type {
  SubstrateFederatedIsolatedDevnetPegInPlanV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-receipt-v1.js';
import {
  assertCreateOnlyOutput,
  assertNoLocalPathValue,
  childEnvironment,
  explicitExistingLocalNonSensitivePath,
  publishCreateOnlyReceipt,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js';

const WORKER_TIMEOUT_MS = 120 * 60_000;
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_WORKER_OUTPUT_BYTES = 256 * 1024;
const OUTPUT_LABEL = 'peg-in application-checkpoint campaign receipt output';
const COMMAND_RECEIPT_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-application-checkpoint-campaign-command-receipt.v3';
const COMMAND_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_APPLICATION_CHECKPOINT_CAMPAIGN_COMMAND_RECEIPT_V3';
const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;

export interface SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignCommandV3Result {
  readonly status:
    'isolated_peg_in_application_checkpoint_campaign_receipt_published';
  readonly receiptDigestHex: string;
}

export async function runSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignCommandFromArgumentsV3(
  argv: readonly string[],
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignCommandV3Result
>> {
  const args = parseArguments(argv);
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const relayerRoot = resolve(scriptDirectory, '..', '..');
  const bridgeRoot = resolve(relayerRoot, '..');
  const worktreeRoot = resolve(bridgeRoot, '..');
  const request = readBoundedRegularFile(
    explicitExistingLocalNonSensitivePath(
      args.requestPath,
      'peg-in application-checkpoint campaign request',
      'file',
    ),
    'peg-in application-checkpoint campaign request',
    MAX_REQUEST_BYTES,
  );
  const commandRequestSha256Hex = createHash('sha256')
    .update(request.bytes)
    .digest('hex');
  const temporaryDirectoryRoot = explicitExistingLocalNonSensitivePath(
    args.frontierTemporaryRoot,
    'Frontier application-checkpoint temporary root',
    'directory',
  );
  const cargoDependencyCacheDirectory = explicitExistingLocalNonSensitivePath(
    args.frontierCargoCache,
    'Frontier application-checkpoint Cargo dependency cache',
    'directory',
  );
  if (
    canonicalPathIdentity(temporaryDirectoryRoot)
      === canonicalPathIdentity(cargoDependencyCacheDirectory)
  ) {
    throw new Error(
      'Frontier temporary root and Cargo dependency cache must differ',
    );
  }
  const outputPath = assertCreateOnlyOutput(
    args.outputPath,
    worktreeRoot,
    OUTPUT_LABEL,
  );
  if (
    canonicalPathIdentity(request.canonicalPath)
      === canonicalPathIdentity(outputPath)
  ) {
    throw new Error(
      'peg-in application-checkpoint campaign request and output must differ',
    );
  }
  const workerPath = resolve(
    scriptDirectory,
    'run-substrate-federated-isolated-devnet-peg-in-application-checkpoint-campaign-worker-v3.ts',
  );
  const result = await runBoundedProcess({
    executablePath: process.execPath,
    args: [
      'node_modules/tsx/dist/cli.mjs',
      workerPath,
      '--request',
      request.canonicalPath,
      '--expected-request-sha256',
      commandRequestSha256Hex,
      '--amount-nano-erg',
      args.pegIn.amountNanoErg,
      '--recipient-address-hex',
      args.pegIn.recipientAddressHex,
      '--frontier-temporary-root',
      temporaryDirectoryRoot,
      '--frontier-cargo-cache',
      cargoDependencyCacheDirectory,
    ],
    cwd: relayerRoot,
    env: childEnvironment(worktreeRoot),
    timeoutMs: WORKER_TIMEOUT_MS,
    terminationGraceMs: 30_000,
    maxOutputBytes: MAX_WORKER_OUTPUT_BYTES + 64 * 1024,
    maxStdoutBytes: MAX_WORKER_OUTPUT_BYTES,
    maxStderrBytes: 64 * 1024,
    label: 'isolated peg-in application-checkpoint campaign worker',
  });
  if (result.stderr !== '') {
    throw new Error(
      'isolated application-checkpoint campaign worker emitted diagnostics',
    );
  }
  const executionReceipt =
    parseSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignWorkerReceiptV3(
      result.stdout,
      commandRequestSha256Hex,
      args.pegIn,
    );
  const receipt = buildCommandReceipt(
    commandRequestSha256Hex,
    args.pegIn,
    executionReceipt,
  );
  const revalidatedOutputPath = assertCreateOnlyOutput(
    args.outputPath,
    worktreeRoot,
    OUTPUT_LABEL,
  );
  if (
    canonicalPathIdentity(revalidatedOutputPath)
      !== canonicalPathIdentity(outputPath)
  ) {
    throw new Error(
      'peg-in application-checkpoint campaign output identity changed',
    );
  }
  publishCreateOnlyReceipt(
    revalidatedOutputPath,
    Buffer.from(`${canonicalJson(receipt)}\n`, 'utf8'),
    '.e2s-peg-in-application-checkpoint-campaign-receipt-',
    'isolated application-checkpoint campaign staged receipt',
  );
  return Object.freeze({
    status:
      'isolated_peg_in_application_checkpoint_campaign_receipt_published' as const,
    receiptDigestHex: receipt.receiptDigestHex,
  });
}

function buildCommandReceipt(
  commandRequestSha256Hex: string,
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
  executionReceipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignWorkerReceiptV3
  >,
) {
  const body = Object.freeze({
    schema: COMMAND_RECEIPT_SCHEMA,
    version: 3 as const,
    status:
      'request_bound_local_peg_in_application_checkpoint_campaign_completed' as const,
    commandRequestSha256Hex,
    pegIn,
    executionReceipt,
    checks: Object.freeze({
      exactRequestBytesBoundAcrossParentAndWorker: true as const,
      exactPegInPlanBoundAcrossParentAndWorker: true as const,
      explicitExternalRunnerRootsBoundAcrossParentAndWorker: true as const,
      executionReceiptValidatedBeforePublication: true as const,
      workerExitedBeforePublication: true as const,
      outputConfinementRevalidatedImmediatelyBeforePublication: true as const,
      createOnlyPublicationUsed: true as const,
    }),
    boundaries: Object.freeze({
      localSyntheticCompatibilityOnly: true as const,
      localSetupAndValuePathBroadcastExecuted: true as const,
      sourceLockConsumptionEstablished: true as const,
      reserveLineageEstablished: true as const,
      frontierTestClientReservationAndMintExecuted: true as const,
      frontierApplicationBurnExecuted: true as const,
      federatedCheckpointAttestationEstablished: true as const,
      localPathsReturnedOrPersisted: false as const,
      externalTargetNodeAcceptanceEstablished: false as const,
      sourceCanonicalityIndependentlyVerified: false as const,
      deterministicSourceFinalityEstablished: false as const,
      ergoAnchorEstablished: false as const,
      trackerAdmissionEstablished: false as const,
      globalReplayInsertionEstablished: false as const,
      payoutAuthorized: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      profileActivated: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  });
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      COMMAND_RECEIPT_DIGEST_DOMAIN,
    ),
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt, 'peg-in application-checkpoint campaign receipt');
  return receipt;
}

function parseArguments(argv: readonly string[]): Readonly<{
  requestPath: string;
  outputPath: string;
  frontierTemporaryRoot: string;
  frontierCargoCache: string;
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>;
}> {
  if (
    argv.length !== 12
    || argv[0] !== '--request'
    || argv[1] === undefined
    || argv[1].length === 0
    || argv[1].startsWith('--')
    || argv[2] !== '--amount-nano-erg'
    || argv[3] === undefined
    || argv[4] !== '--recipient-address-hex'
    || argv[5] === undefined
    || argv[6] !== '--frontier-temporary-root'
    || argv[7] === undefined
    || argv[7].length === 0
    || argv[7].startsWith('--')
    || argv[8] !== '--frontier-cargo-cache'
    || argv[9] === undefined
    || argv[9].length === 0
    || argv[9].startsWith('--')
    || argv[10] !== '--output'
    || argv[11] === undefined
    || argv[11].length === 0
    || argv[11].startsWith('--')
  ) {
    throw new Error(
      'isolated peg-in application-checkpoint campaign arguments are invalid',
    );
  }
  return Object.freeze({
    requestPath: argv[1],
    outputPath: argv[11],
    frontierTemporaryRoot: argv[7],
    frontierCargoCache: argv[9],
    pegIn: normalizePegInPlan(argv[3], argv[5]),
  });
}

function normalizePegInPlan(
  amountNanoErg: string,
  recipientAddressHex: string,
): Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1> {
  if (
    !/^[1-9][0-9]*$/u.test(amountNanoErg)
    || BigInt(amountNanoErg) > ERGO_POSITIVE_LONG_MAX
    || !/^[0-9a-f]{40}$/u.test(recipientAddressHex)
    || /^0{40}$/u.test(recipientAddressHex)
  ) {
    throw new Error(
      'isolated peg-in application-checkpoint campaign plan is invalid',
    );
  }
  return Object.freeze({ amountNanoErg, recipientAddressHex });
}

async function main(): Promise<void> {
  const result =
    await runSubstrateFederatedIsolatedDevnetPegInApplicationCheckpointCampaignCommandFromArgumentsV3(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(result)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write(
      'isolated peg-in application-checkpoint campaign failed\n',
    );
    process.exitCode = 1;
  });
}
