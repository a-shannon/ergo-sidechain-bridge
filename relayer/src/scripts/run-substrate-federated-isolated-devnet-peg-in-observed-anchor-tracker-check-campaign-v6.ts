import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalPathIdentity,
  isPathInside,
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
  parseSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6,
  type SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6,
} from './run-substrate-federated-isolated-devnet-peg-in-observed-anchor-tracker-check-campaign-receipt-v6.js';
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
const OUTPUT_LABEL = 'peg-in observed-anchor-tracker-check campaign receipt output';
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V6_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-observed-anchor-tracker-check-campaign-command-receipt.v6';
const COMMAND_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V6';
const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const EXPECTED_COMMAND_CHECKS = Object.freeze({
  exactRequestBytesBoundAcrossParentAndWorker: true,
  exactPegInPlanBoundAcrossParentAndWorker: true,
  explicitExternalRunnerRootsBoundAcrossParentAndWorker: true,
  executionReceiptValidatedBeforePublication: true,
  workerExitedBeforePublication: true,
  outputConfinementRevalidatedImmediatelyBeforePublication: true,
  createOnlyPublicationUsed: true,
});
const EXPECTED_COMMAND_BOUNDARIES = Object.freeze({
  localIsolatedDevnetOnly: true,
  localSetupAndPegInBroadcastExecuted: true,
  sourceLockConsumptionEstablished: true,
  reserveLineageEstablished: true,
  frontierTestClientReservationAndMintExecuted: true,
  frontierApplicationBurnExecuted: true,
  federatedCheckpointAttestationEstablished: true,
  localErgoCheckpointAnchorObserved: true,
  checkpointBoundTrackerExecutionObserved: true,
  trackerCandidateConstructed: true,
  trackerJvmReductionAccepted: true,
  trackerNodeCheckPerformed: true,
  trackerSigningPerformed: true,
  signedTrackerBytesPersisted: false,
  localPathsReturnedOrPersisted: false,
  deterministicSourceFinalityEstablished: false,
  ergoPowAuthenticated: false,
  trackerAdmissionEstablished: false,
  globalReplayInsertionEstablished: false,
  payoutAuthorized: false,
  trackerSubmissionPerformed: false,
  trackerBroadcastPerformed: false,
  publicNetworkUsed: false,
  realFundsUsed: false,
  existingWalletMaterialUsed: false,
  processLossRecoveryEstablished: false,
  profileActivated: false,
  mintAuthorized: false,
  fundsAuthorityEstablished: false,
  gate5Closed: false,
  trustlessStatusEstablished: false,
  productionReadinessEstablished: false,
});

export interface SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandV6Result {
  readonly status:
    'isolated_peg_in_observed_anchor_tracker_check_campaign_receipt_published';
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandReceiptV6 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V6_SCHEMA;
  readonly version: 6;
  readonly status:
    'request_bound_local_peg_in_observed_anchor_tracker_check_campaign_completed';
  readonly commandRequestSha256Hex: string;
  readonly pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>;
  readonly executionReceipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6
  >;
  readonly checks: Readonly<typeof EXPECTED_COMMAND_CHECKS>;
  readonly boundaries: Readonly<typeof EXPECTED_COMMAND_BOUNDARIES>;
  readonly receiptDigestHex: string;
}

export async function runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandFromArgumentsV6(
  argv: readonly string[],
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandV6Result
>> {
  const args = parseArguments(argv);
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const relayerRoot = resolve(scriptDirectory, '..', '..');
  const bridgeRoot = resolve(relayerRoot, '..');
  const worktreeRoot = resolve(bridgeRoot, '..');
  const request = readBoundedRegularFile(
    explicitExistingLocalNonSensitivePath(
      args.requestPath,
      'peg-in observed-anchor-tracker-check campaign request',
      'file',
    ),
    'peg-in observed-anchor-tracker-check campaign request',
    MAX_REQUEST_BYTES,
  );
  const commandRequestSha256Hex = createHash('sha256')
    .update(request.bytes)
    .digest('hex');
  const temporaryDirectoryRoot = explicitExistingLocalNonSensitivePath(
    args.frontierTemporaryRoot,
    'Frontier observed-anchor-tracker-check temporary root',
    'directory',
  );
  const cargoDependencyCacheDirectory = explicitExistingLocalNonSensitivePath(
    args.frontierCargoCache,
    'Frontier observed-anchor-tracker-check Cargo dependency cache',
    'directory',
  );
  const relayerCargoCacheDirectory = explicitExistingLocalNonSensitivePath(
    args.relayerCargoCache,
    'relayer artifact Cargo dependency cache',
    'directory',
  );
  if (
    pathsOverlap(temporaryDirectoryRoot, cargoDependencyCacheDirectory)
    || pathsOverlap(temporaryDirectoryRoot, relayerCargoCacheDirectory)
    || pathsOverlap(
      cargoDependencyCacheDirectory,
      relayerCargoCacheDirectory,
    )
  ) {
    throw new Error(
      'Frontier temporary root and Cargo dependency caches must differ and not overlap',
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
      'peg-in observed-anchor-tracker-check campaign request and output must differ',
    );
  }
  const workerPath = resolve(
    scriptDirectory,
    'run-substrate-federated-isolated-devnet-peg-in-observed-anchor-tracker-check-campaign-worker-v6.ts',
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
    env: childEnvironment(worktreeRoot, {
      cargoHomeDirectory: relayerCargoCacheDirectory,
    }),
    timeoutMs: WORKER_TIMEOUT_MS,
    terminationGraceMs: 30_000,
    maxOutputBytes: MAX_WORKER_OUTPUT_BYTES + 64 * 1024,
    maxStdoutBytes: MAX_WORKER_OUTPUT_BYTES,
    maxStderrBytes: 64 * 1024,
    label: 'isolated peg-in observed-anchor-tracker-check campaign worker',
  });
  if (result.stderr !== '') {
    throw new Error(
      'isolated observed-anchor-tracker-check campaign worker emitted diagnostics',
    );
  }
  const executionReceipt =
    parseSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
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
      'peg-in observed-anchor-tracker-check campaign output identity changed',
    );
  }
  publishCreateOnlyReceipt(
    revalidatedOutputPath,
    Buffer.from(`${canonicalJson(receipt)}\n`, 'utf8'),
    '.e2s-peg-in-observed-anchor-tracker-check-campaign-receipt-',
    'isolated observed-anchor-tracker-check campaign staged receipt',
  );
  return Object.freeze({
    status:
      'isolated_peg_in_observed_anchor_tracker_check_campaign_receipt_published' as const,
    receiptDigestHex: receipt.receiptDigestHex,
  });
}

export function parseSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandReceiptV6(
  serialized: string,
  expectedReceiptDigestHex: string,
  expectedRequestSha256Hex: string,
  expectedPegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandReceiptV6
> {
  fixedHex(expectedReceiptDigestHex, 32, 'expected command receipt digest');
  fixedHex(expectedRequestSha256Hex, 32, 'expected command request digest');
  const normalizedExpectedPegIn = normalizePegInPlan(
    expectedPegIn.amountNanoErg,
    expectedPegIn.recipientAddressHex,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error(
      'observed-anchor-tracker-check campaign command receipt is not JSON',
    );
  }
  if (`${canonicalJson(parsed)}\n` !== serialized) {
    throw new Error(
      'observed-anchor-tracker-check campaign command receipt is not canonical JSON',
    );
  }
  const receipt = exactRecord(parsed, [
    'boundaries',
    'checks',
    'commandRequestSha256Hex',
    'executionReceipt',
    'pegIn',
    'receiptDigestHex',
    'schema',
    'status',
    'version',
  ], 'observed-anchor-tracker-check campaign command receipt');
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V6_SCHEMA
    || receipt.version !== 6
    || receipt.status
      !== 'request_bound_local_peg_in_observed_anchor_tracker_check_campaign_completed'
    || receipt.commandRequestSha256Hex !== expectedRequestSha256Hex
    || receipt.receiptDigestHex !== expectedReceiptDigestHex
  ) {
    throw new Error(
      'observed-anchor-tracker-check campaign command receipt identity changed',
    );
  }
  const pegIn = exactRecord(
    receipt.pegIn,
    ['amountNanoErg', 'recipientAddressHex'],
    'observed-anchor-tracker-check campaign command peg-in plan',
  );
  if (
    pegIn.amountNanoErg !== normalizedExpectedPegIn.amountNanoErg
    || pegIn.recipientAddressHex !== normalizedExpectedPegIn.recipientAddressHex
  ) {
    throw new Error(
      'observed-anchor-tracker-check campaign command peg-in plan changed',
    );
  }
  const executionReceipt =
    parseSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
      `${canonicalJson(receipt.executionReceipt)}\n`,
      expectedRequestSha256Hex,
      normalizedExpectedPegIn,
    );
  assertExpectedBooleanRecord(
    receipt.checks,
    EXPECTED_COMMAND_CHECKS,
    'observed-anchor-tracker-check campaign command checks',
  );
  assertExpectedBooleanRecord(
    receipt.boundaries,
    EXPECTED_COMMAND_BOUNDARIES,
    'observed-anchor-tracker-check campaign command boundaries',
  );
  const { receiptDigestHex, ...body } = receipt;
  if (
    fixedHex(receiptDigestHex, 32, 'command receipt digest')
      !== sha256CanonicalJson(body, COMMAND_RECEIPT_DIGEST_DOMAIN)
  ) {
    throw new Error(
      'observed-anchor-tracker-check campaign command receipt digest changed',
    );
  }
  const validated = deepFreeze({
    ...receipt,
    pegIn: normalizedExpectedPegIn,
    executionReceipt,
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(validated);
  assertNoLocalPathValue(
    validated,
    'observed-anchor-tracker-check campaign command receipt',
  );
  return validated as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandReceiptV6
  >;
}

function buildCommandReceipt(
  commandRequestSha256Hex: string,
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
  executionReceipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6
  >,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandReceiptV6
> {
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V6_SCHEMA,
    version: 6 as const,
    status:
      'request_bound_local_peg_in_observed_anchor_tracker_check_campaign_completed' as const,
    commandRequestSha256Hex,
    pegIn,
    executionReceipt,
    checks: EXPECTED_COMMAND_CHECKS,
    boundaries: EXPECTED_COMMAND_BOUNDARIES,
  });
  const receipt = deepFreeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      COMMAND_RECEIPT_DIGEST_DOMAIN,
    ),
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt, 'peg-in observed-anchor-tracker-check campaign receipt');
  return receipt;
}

function parseArguments(argv: readonly string[]): Readonly<{
  requestPath: string;
  outputPath: string;
  frontierTemporaryRoot: string;
  frontierCargoCache: string;
  relayerCargoCache: string;
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>;
}> {
  if (
    argv.length !== 14
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
    || argv[10] !== '--relayer-cargo-cache'
    || argv[11] === undefined
    || argv[11].length === 0
    || argv[11].startsWith('--')
    || argv[12] !== '--output'
    || argv[13] === undefined
    || argv[13].length === 0
    || argv[13].startsWith('--')
  ) {
    throw new Error(
      'isolated peg-in observed-anchor-tracker-check campaign arguments are invalid',
    );
  }
  return Object.freeze({
    requestPath: argv[1],
    outputPath: argv[13],
    frontierTemporaryRoot: argv[7],
    frontierCargoCache: argv[9],
    relayerCargoCache: argv[11],
    pegIn: normalizePegInPlan(argv[3], argv[5]),
  });
}

function pathsOverlap(left: string, right: string): boolean {
  return canonicalPathIdentity(left) === canonicalPathIdentity(right)
    || isPathInside(left, right)
    || isPathInside(right, left);
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
      'isolated peg-in observed-anchor-tracker-check campaign plan is invalid',
    );
  }
  return Object.freeze({ amountNanoErg, recipientAddressHex });
}

function assertExpectedBooleanRecord(
  value: unknown,
  expected: Readonly<Record<string, boolean>>,
  label: string,
): void {
  const record = exactRecord(value, Object.keys(expected), label);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (record[key] !== expectedValue) throw new Error(`${label} changed`);
  }
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} fields changed`);
  }
  return value as Record<string, unknown>;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)
  ) {
    throw new Error(`${label} must be canonical fixed-width hex`);
  }
  return value;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

async function main(): Promise<void> {
  const result =
    await runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandFromArgumentsV6(
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
      'isolated peg-in observed-anchor-tracker-check campaign failed\n',
    );
    process.exitCode = 1;
  });
}
