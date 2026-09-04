import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalPathIdentity,
  isPathInside,
  readBoundedRegularFile,
} from '../create-only-out-of-repository-artifact.js';
import { resolveCanonicalBridgeRepositoryRoots } from '../bridge-repository-layout.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  BoundedProcessExitError,
  runBoundedProcess,
} from '../pinned-local-native-verifier-build.js';
import {
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1,
} from '../relayer-core/substrate-federated-isolated-devnet-receipt-data-safety-v1.js';
import {
  isKnownFrozenObservedAnchorTrackerCheckCampaignBindingLabelV7,
  isKnownFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7,
  parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7,
  type SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7,
} from './run-substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-receipt-v7.js';
import {
  parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8,
  type SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8,
} from './run-substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-receipt-v8.js';
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
const OUTPUT_LABEL = 'peg-in frozen-observed-anchor-tracker-check campaign receipt output';
const COMMAND_FAILURE_PREFIX =
  'isolated peg-in frozen-observed-anchor-tracker-check campaign failed';
const SAFE_WORKER_BINDING_FAILURE_PREFIX =
  'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
  + 'producer-to-consumer binding changed: ';
const SAFE_WORKER_PHASE_FAILURE_PREFIX =
  'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
  + 'phase failed: ';
const FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_PROCESS_FAILURES_V7 =
  Object.freeze([
    'worker process exited without diagnostic',
    'worker process output suppressed',
    'worker process diagnostics suppressed',
    'worker process exit status invalid',
  ] as const);
type FrozenObservedAnchorTrackerCheckCampaignWorkerProcessFailureV7 =
  typeof FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_PROCESS_FAILURES_V7[number];
const frozenObservedAnchorTrackerCheckCampaignWorkerProcessExitErrorsV7 =
  new WeakSet<object>();
const FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_PHASES_V7 =
  Object.freeze([
    'command arguments',
    'request binding',
    'external roots',
    'output reservation',
    'worker launch',
    'worker receipt',
    'command receipt',
    'receipt publication',
  ] as const);
type FrozenObservedAnchorTrackerCheckCampaignCommandPhaseV7 =
  typeof FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_PHASES_V7[number];
const frozenObservedAnchorTrackerCheckCampaignCommandPhaseErrorsV7 =
  new WeakSet<object>();

class FrozenObservedAnchorTrackerCheckCampaignCommandPhaseErrorV7 extends Error {
  readonly phase: FrozenObservedAnchorTrackerCheckCampaignCommandPhaseV7;

  constructor(
    phase: FrozenObservedAnchorTrackerCheckCampaignCommandPhaseV7,
    cause: unknown,
  ) {
    const detail = cause instanceof Error ? cause.message : 'unknown failure';
    super(`${phase}: ${detail}`);
    this.name = 'FrozenObservedAnchorTrackerCheckCampaignCommandPhaseErrorV7';
    this.phase = phase;
    frozenObservedAnchorTrackerCheckCampaignCommandPhaseErrorsV7.add(this);
    Object.freeze(this);
  }
}

function isFrozenObservedAnchorTrackerCheckCampaignCommandPhaseErrorV7(
  error: unknown,
): error is FrozenObservedAnchorTrackerCheckCampaignCommandPhaseErrorV7 {
  return typeof error === 'object'
    && error !== null
    && frozenObservedAnchorTrackerCheckCampaignCommandPhaseErrorsV7.has(error)
    && typeof (error as { readonly phase?: unknown }).phase === 'string'
    && FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_PHASES_V7.includes(
      (error as { readonly phase: FrozenObservedAnchorTrackerCheckCampaignCommandPhaseV7 }).phase,
    );
}

class FrozenObservedAnchorTrackerCheckCampaignWorkerProcessExitErrorV7 extends Error {
  readonly binding: string | undefined;
  readonly phase: string | undefined;
  readonly processFailure:
    FrozenObservedAnchorTrackerCheckCampaignWorkerProcessFailureV7 | undefined;
  readonly precedingDiagnosticsSuppressed: boolean;

  constructor(error: BoundedProcessExitError) {
    super('isolated frozen-observed-anchor-tracker-check campaign worker process failed');
    this.name =
      'FrozenObservedAnchorTrackerCheckCampaignWorkerProcessExitErrorV7';
    const terminalDiagnostic =
      error.exitCode !== 0 && error.stdout === ''
        ? readTerminalWorkerDiagnosticV7(error.stderr)
        : undefined;
    const binding = terminalDiagnostic?.line.startsWith(
      SAFE_WORKER_BINDING_FAILURE_PREFIX,
    )
      ? terminalDiagnostic.line.slice(SAFE_WORKER_BINDING_FAILURE_PREFIX.length)
      : undefined;
    const phase = terminalDiagnostic?.line.startsWith(
      SAFE_WORKER_PHASE_FAILURE_PREFIX,
    )
      ? terminalDiagnostic.line.slice(SAFE_WORKER_PHASE_FAILURE_PREFIX.length)
      : undefined;
    this.binding =
      isKnownFrozenObservedAnchorTrackerCheckCampaignBindingLabelV7(binding)
        ? binding
        : undefined;
    this.phase =
      isKnownFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7(phase)
        ? phase
        : undefined;
    this.precedingDiagnosticsSuppressed =
      (this.binding !== undefined || this.phase !== undefined)
      && terminalDiagnostic?.precedingOutput === true;
    this.processFailure = this.binding !== undefined || this.phase !== undefined
      ? undefined
      : error.exitCode === 0
        ? 'worker process exit status invalid'
        : error.stdout !== ''
          ? 'worker process output suppressed'
          : error.stderr === ''
            ? 'worker process exited without diagnostic'
            : 'worker process diagnostics suppressed';
    frozenObservedAnchorTrackerCheckCampaignWorkerProcessExitErrorsV7.add(this);
    Object.freeze(this);
  }
}

function isFrozenObservedAnchorTrackerCheckCampaignWorkerProcessExitErrorV7(
  error: unknown,
): error is FrozenObservedAnchorTrackerCheckCampaignWorkerProcessExitErrorV7 {
  if (
    typeof error !== 'object'
    || error === null
    || !frozenObservedAnchorTrackerCheckCampaignWorkerProcessExitErrorsV7.has(error)
  ) {
    return false;
  }
  const candidate = error as Readonly<{
    binding?: unknown;
    phase?: unknown;
    processFailure?: unknown;
    precedingDiagnosticsSuppressed?: unknown;
  }>;
  const bindingKnown = candidate.binding === undefined
    || isKnownFrozenObservedAnchorTrackerCheckCampaignBindingLabelV7(
      candidate.binding,
    );
  const phaseKnown = candidate.phase === undefined
    || isKnownFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7(
      candidate.phase,
    );
  const processFailureKnown = candidate.processFailure === undefined
    || (
      typeof candidate.processFailure === 'string'
      && FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_PROCESS_FAILURES_V7.includes(
        candidate.processFailure as FrozenObservedAnchorTrackerCheckCampaignWorkerProcessFailureV7,
      )
    );
  const selectedFailures = Number(candidate.binding !== undefined)
    + Number(candidate.phase !== undefined)
    + Number(candidate.processFailure !== undefined);
  return bindingKnown
    && phaseKnown
    && processFailureKnown
    && selectedFailures === 1
    && typeof candidate.precedingDiagnosticsSuppressed === 'boolean'
    && (
      candidate.precedingDiagnosticsSuppressed === false
      || candidate.processFailure === undefined
    );
}

function readTerminalWorkerDiagnosticV7(
  stderr: string,
): Readonly<{ readonly line: string; readonly precedingOutput: boolean }> | undefined {
  if (!stderr.endsWith('\n')) return undefined;
  const withoutTerminator = stderr.slice(0, -1);
  const separator = withoutTerminator.lastIndexOf('\n');
  const line = withoutTerminator.slice(separator + 1);
  if (line.length === 0) return undefined;
  return Object.freeze({
    line,
    precedingOutput: separator >= 0,
  });
}
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V7_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-command-receipt.v7';
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V8_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-command-receipt.v8';
export const COMMAND_RECEIPT_DIGEST_DOMAIN_V7 =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V7';
export const COMMAND_RECEIPT_DIGEST_DOMAIN_V8 =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V8';
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
  checkpointBoundFrozenTrackerExecutionObserved: true,
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

export interface SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandV7Result {
  readonly status:
    'isolated_peg_in_frozen_observed_anchor_tracker_check_campaign_receipt_published';
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandReceiptV7 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V7_SCHEMA;
  readonly version: 7;
  readonly status:
    'request_bound_local_peg_in_frozen_observed_anchor_tracker_check_campaign_completed';
  readonly commandRequestSha256Hex: string;
  readonly pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>;
  readonly executionReceipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7
  >;
  readonly checks: Readonly<typeof EXPECTED_COMMAND_CHECKS>;
  readonly boundaries: Readonly<typeof EXPECTED_COMMAND_BOUNDARIES>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandReceiptV8
  extends Omit<
    SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandReceiptV7,
    'executionReceipt' | 'schema' | 'version'
  > {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V8_SCHEMA;
  readonly version: 8;
  readonly executionReceipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8
  >;
}

export async function runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandFromArgumentsV7(
  argv: readonly string[],
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandV7Result
>> {
  let phase: FrozenObservedAnchorTrackerCheckCampaignCommandPhaseV7 =
    'command arguments';
  try {
    const args = parseArguments(argv);
    const scriptDirectory = dirname(fileURLToPath(import.meta.url));
    const { bridgeRoot, worktreeRoot } = resolveCanonicalBridgeRepositoryRoots(
      resolve(scriptDirectory, '..', '..', '..'),
    );
    const relayerRoot = resolve(bridgeRoot, 'relayer');

    phase = 'request binding';
    const request = readBoundedRegularFile(
      explicitExistingLocalNonSensitivePath(
        args.requestPath,
        'peg-in frozen-observed-anchor-tracker-check campaign request',
        'file',
      ),
      'peg-in frozen-observed-anchor-tracker-check campaign request',
      MAX_REQUEST_BYTES,
    );
    const commandRequestSha256Hex = createHash('sha256')
      .update(request.bytes)
      .digest('hex');

    phase = 'external roots';
    const temporaryDirectoryRoot = explicitExistingLocalNonSensitivePath(
      args.frontierTemporaryRoot,
      'Frontier frozen-observed-anchor-tracker-check temporary root',
      'directory',
    );
    const cargoDependencyCacheDirectory = explicitExistingLocalNonSensitivePath(
      args.frontierCargoCache,
      'Frontier frozen-observed-anchor-tracker-check Cargo dependency cache',
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

    phase = 'output reservation';
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
        'peg-in frozen-observed-anchor-tracker-check campaign request and output must differ',
      );
    }
    const workerPath = resolve(
      scriptDirectory,
      'run-substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-worker-v7.ts',
    );

    phase = 'worker launch';
    const result = await runFrozenObservedAnchorTrackerCheckCampaignWorkerProcessV7({
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
      label: 'isolated peg-in frozen-observed-anchor-tracker-check campaign worker',
    });

    phase = 'worker receipt';
    if (result.stderr !== '') {
      throw new Error(
        'isolated frozen-observed-anchor-tracker-check campaign worker emitted diagnostics',
      );
    }
    const executionReceipt =
      parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8(
        result.stdout,
        commandRequestSha256Hex,
        args.pegIn,
      );

    phase = 'command receipt';
    const receipt = buildCommandReceiptV8(
      commandRequestSha256Hex,
      args.pegIn,
      executionReceipt,
    );

    phase = 'receipt publication';
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
        'peg-in frozen-observed-anchor-tracker-check campaign output identity changed',
      );
    }
    publishCreateOnlyReceipt(
      revalidatedOutputPath,
      Buffer.from(`${canonicalJson(receipt)}\n`, 'utf8'),
      '.e2s-peg-in-frozen-observed-anchor-tracker-check-campaign-receipt-',
      'isolated frozen-observed-anchor-tracker-check campaign staged receipt',
    );
    return Object.freeze({
      status:
        'isolated_peg_in_frozen_observed_anchor_tracker_check_campaign_receipt_published' as const,
      receiptDigestHex: receipt.receiptDigestHex,
    });
  } catch (error) {
    if (
      isFrozenObservedAnchorTrackerCheckCampaignCommandPhaseErrorV7(error)
      || isFrozenObservedAnchorTrackerCheckCampaignWorkerProcessExitErrorV7(error)
    ) {
      throw error;
    }
    throw new FrozenObservedAnchorTrackerCheckCampaignCommandPhaseErrorV7(
      phase,
      error,
    );
  }
}

async function runFrozenObservedAnchorTrackerCheckCampaignWorkerProcessV7(
  input: Parameters<typeof runBoundedProcess>[0],
): Promise<Awaited<ReturnType<typeof runBoundedProcess>>> {
  try {
    return await runBoundedProcess(input);
  } catch (error) {
    if (error instanceof BoundedProcessExitError) {
      throw new FrozenObservedAnchorTrackerCheckCampaignWorkerProcessExitErrorV7(
        error,
      );
    }
    throw error;
  }
}

export function parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandReceiptV7(
  serialized: string,
  expectedReceiptDigestHex: string,
  expectedRequestSha256Hex: string,
  expectedPegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandReceiptV7
> {
  return parseCommandReceipt(
    serialized,
    expectedReceiptDigestHex,
    expectedRequestSha256Hex,
    expectedPegIn,
    {
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V7_SCHEMA,
      version: 7,
      digestDomain: COMMAND_RECEIPT_DIGEST_DOMAIN_V7,
      parseExecutionReceipt: (
        workerSerialized,
        requestDigest,
        pegIn,
      ) =>
        parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7(
          workerSerialized,
          requestDigest,
          pegIn,
        ),
    },
  ) as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandReceiptV7
  >;
}

export function parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandReceiptV8(
  serialized: string,
  expectedReceiptDigestHex: string,
  expectedRequestSha256Hex: string,
  expectedPegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandReceiptV8
> {
  return parseCommandReceipt(
    serialized,
    expectedReceiptDigestHex,
    expectedRequestSha256Hex,
    expectedPegIn,
    {
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V8_SCHEMA,
      version: 8,
      digestDomain: COMMAND_RECEIPT_DIGEST_DOMAIN_V8,
      parseExecutionReceipt: (
        workerSerialized,
        requestDigest,
        pegIn,
      ) =>
        parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8(
          workerSerialized,
          requestDigest,
          pegIn,
        ),
    },
  ) as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandReceiptV8
  >;
}

function parseCommandReceipt(
  serialized: string,
  expectedReceiptDigestHex: string,
  expectedRequestSha256Hex: string,
  expectedPegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
  profile: Readonly<{
    readonly schema: string;
    readonly version: 7 | 8;
    readonly digestDomain: string;
    readonly parseExecutionReceipt: (
      serialized: string,
      expectedRequestSha256Hex: string,
      expectedPegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
    ) => unknown;
  }>,
): Readonly<Record<string, unknown>> {
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
      'frozen-observed-anchor-tracker-check campaign command receipt is not JSON',
    );
  }
  if (`${canonicalJson(parsed)}\n` !== serialized) {
    throw new Error(
      'frozen-observed-anchor-tracker-check campaign command receipt is not canonical JSON',
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
  ], 'frozen-observed-anchor-tracker-check campaign command receipt');
  if (
    receipt.schema !== profile.schema
    || receipt.version !== profile.version
    || receipt.status
      !== 'request_bound_local_peg_in_frozen_observed_anchor_tracker_check_campaign_completed'
    || receipt.commandRequestSha256Hex !== expectedRequestSha256Hex
    || receipt.receiptDigestHex !== expectedReceiptDigestHex
  ) {
    throw new Error(
      'frozen-observed-anchor-tracker-check campaign command receipt identity changed',
    );
  }
  const pegIn = exactRecord(
    receipt.pegIn,
    ['amountNanoErg', 'recipientAddressHex'],
    'frozen-observed-anchor-tracker-check campaign command peg-in plan',
  );
  if (
    pegIn.amountNanoErg !== normalizedExpectedPegIn.amountNanoErg
    || pegIn.recipientAddressHex !== normalizedExpectedPegIn.recipientAddressHex
  ) {
    throw new Error(
      'frozen-observed-anchor-tracker-check campaign command peg-in plan changed',
    );
  }
  const executionReceipt =
    profile.parseExecutionReceipt(
      `${canonicalJson(receipt.executionReceipt)}\n`,
      expectedRequestSha256Hex,
      normalizedExpectedPegIn,
    );
  assertExpectedBooleanRecord(
    receipt.checks,
    EXPECTED_COMMAND_CHECKS,
    'frozen-observed-anchor-tracker-check campaign command checks',
  );
  assertExpectedBooleanRecord(
    receipt.boundaries,
    EXPECTED_COMMAND_BOUNDARIES,
    'frozen-observed-anchor-tracker-check campaign command boundaries',
  );
  const { receiptDigestHex, ...body } = receipt;
  if (
    fixedHex(receiptDigestHex, 32, 'command receipt digest')
      !== sha256CanonicalJson(body, profile.digestDomain)
  ) {
    throw new Error(
      'frozen-observed-anchor-tracker-check campaign command receipt digest changed',
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
    'frozen-observed-anchor-tracker-check campaign command receipt',
  );
  return validated;
}

function buildCommandReceiptV8(
  commandRequestSha256Hex: string,
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
  executionReceipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8
  >,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandReceiptV8
> {
  const body = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V8_SCHEMA,
    version: 8 as const,
    status:
      'request_bound_local_peg_in_frozen_observed_anchor_tracker_check_campaign_completed' as const,
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
      COMMAND_RECEIPT_DIGEST_DOMAIN_V8,
    ),
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt, 'peg-in frozen-observed-anchor-tracker-check campaign receipt');
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
      'isolated peg-in frozen-observed-anchor-tracker-check campaign arguments are invalid',
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
      'isolated peg-in frozen-observed-anchor-tracker-check campaign plan is invalid',
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
    await runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandFromArgumentsV7(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(result)}\n`);
}

export function formatSafeFrozenObservedAnchorTrackerCheckCampaignCommandFailureV7(
  error: unknown,
): string {
  if (
    isFrozenObservedAnchorTrackerCheckCampaignWorkerProcessExitErrorV7(error)
    && error.binding !== undefined
  ) {
    const suffix = error.precedingDiagnosticsSuppressed
      ? ' (preceding worker diagnostics suppressed)'
      : '';
    return `${COMMAND_FAILURE_PREFIX}: producer-to-consumer binding changed: ${error.binding}${suffix}\n`;
  }
  if (
    isFrozenObservedAnchorTrackerCheckCampaignWorkerProcessExitErrorV7(error)
    && error.phase !== undefined
  ) {
    const suffix = error.precedingDiagnosticsSuppressed
      ? ' (preceding worker diagnostics suppressed)'
      : '';
    return `${COMMAND_FAILURE_PREFIX}: phase failed: ${error.phase}${suffix}\n`;
  }
  if (
    isFrozenObservedAnchorTrackerCheckCampaignWorkerProcessExitErrorV7(error)
    && error.processFailure !== undefined
  ) {
    return `${COMMAND_FAILURE_PREFIX}: ${error.processFailure}\n`;
  }
  if (
    isFrozenObservedAnchorTrackerCheckCampaignCommandPhaseErrorV7(error)
  ) {
    return `${COMMAND_FAILURE_PREFIX}: command phase failed: ${error.phase}\n`;
  }
  return `${COMMAND_FAILURE_PREFIX}\n`;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(error => {
    process.stderr.write(
      formatSafeFrozenObservedAnchorTrackerCheckCampaignCommandFailureV7(error),
    );
    process.exitCode = 1;
  });
}
