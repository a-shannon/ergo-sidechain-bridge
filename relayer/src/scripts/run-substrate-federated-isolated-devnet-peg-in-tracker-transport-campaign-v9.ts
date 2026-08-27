import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalPathIdentity,
  isPathInside,
  readBoundedRegularFile,
} from '../create-only-out-of-repository-artifact.js';
import {
  assertNoDuplicateJsonKeys,
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
import {
  isKnownFrozenObservedAnchorTrackerCheckCampaignBindingLabelV7,
  isKnownFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7,
  type FrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7,
} from './run-substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-receipt-v7.js';
import {
  parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9,
  parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV9,
  type SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9,
  type SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV9,
} from './run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-worker-v9.js';

const WORKER_TIMEOUT_MS = 150 * 60_000;
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_WORKER_OUTPUT_BYTES = 256 * 1024;
const OUTPUT_LABEL = 'peg-in tracker transport campaign receipt output';
const COMMAND_FAILURE_PREFIX =
  'isolated peg-in tracker transport campaign failed';
const SAFE_WORKER_FAILURE_PREFIX =
  'isolated tracker transport campaign worker failed';
const SAFE_WORKER_BINDING_FAILURE_PREFIX =
  `${SAFE_WORKER_FAILURE_PREFIX}: producer-to-consumer binding changed: `;
const SAFE_WORKER_PHASE_FAILURE_PREFIX =
  `${SAFE_WORKER_FAILURE_PREFIX}: phase failed: `;
const COMMAND_RECEIPT_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-command-receipt.v9' as const;
const COMMAND_FAILURE_RECEIPT_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-command-failure-receipt.v9' as const;
const COMMAND_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_COMMAND_RECEIPT_V9';
const COMMAND_FAILURE_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_COMMAND_FAILURE_RECEIPT_V9';
const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const COMMAND_PHASES = Object.freeze([
  'command arguments',
  'request binding',
  'external roots',
  'output reservation',
  'worker launch',
  'worker receipt',
  'command receipt',
  'receipt publication',
] as const);
type CommandPhase = typeof COMMAND_PHASES[number];
const commandPhaseErrors = new WeakSet<object>();
const workerDiagnosticHints = new WeakSet<object>();

class TrackerTransportCampaignWorkerDiagnosticHintV9 extends Error {
  readonly binding: string | undefined;
  readonly phase: FrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7 | undefined;
  readonly authoritative = false;

  constructor(diagnostic: Readonly<{
    readonly binding?: string;
    readonly phase?: FrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7;
  }>) {
    super('isolated tracker transport campaign worker diagnostic hint');
    this.name = 'TrackerTransportCampaignWorkerDiagnosticHintV9';
    this.binding = diagnostic.binding;
    this.phase = diagnostic.phase;
    workerDiagnosticHints.add(this);
    Object.freeze(this);
  }
}

function isWorkerDiagnosticHint(
  error: unknown,
): error is TrackerTransportCampaignWorkerDiagnosticHintV9 {
  return typeof error === 'object'
    && error !== null
    && workerDiagnosticHints.has(error)
    && (error as { readonly authoritative?: unknown }).authoritative === false
    && (
      isKnownFrozenObservedAnchorTrackerCheckCampaignBindingLabelV7(
        (error as { readonly binding?: unknown }).binding,
      )
      || isKnownFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7(
        (error as { readonly phase?: unknown }).phase,
      )
    );
}

class TrackerTransportCampaignCommandPhaseErrorV9 extends Error {
  readonly phase: CommandPhase;

  constructor(phase: CommandPhase, cause: unknown) {
    super(phase, { cause });
    this.name = 'TrackerTransportCampaignCommandPhaseErrorV9';
    this.phase = phase;
    commandPhaseErrors.add(this);
    Object.freeze(this);
  }
}

function isCommandPhaseError(
  error: unknown,
): error is TrackerTransportCampaignCommandPhaseErrorV9 {
  return typeof error === 'object'
    && error !== null
    && commandPhaseErrors.has(error)
    && typeof (error as { readonly phase?: unknown }).phase === 'string'
    && COMMAND_PHASES.includes(
      (error as { readonly phase: CommandPhase }).phase,
    );
}

type WorkerReceipt =
  | Readonly<SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV9>
  | Readonly<SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9>;

export type SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandV9Result =
  | Readonly<{
    readonly status:
      'isolated_peg_in_tracker_transport_canonically_confirmed_receipt_published';
    readonly canonicalConfirmationObserved: true;
    readonly receiptDigestHex: string;
  }>
  | Readonly<{
    readonly status:
      'isolated_peg_in_tracker_transport_not_canonically_confirmed_receipt_published';
    readonly canonicalConfirmationObserved: false;
    readonly receiptDigestHex: string;
  }>;

export interface SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandReceiptV9 {
  readonly schema:
    | typeof COMMAND_RECEIPT_SCHEMA
    | typeof COMMAND_FAILURE_RECEIPT_SCHEMA;
  readonly version: 9;
  readonly status:
    | 'request_bound_local_peg_in_tracker_transport_canonically_confirmed'
    | 'request_bound_local_peg_in_tracker_transport_not_canonically_confirmed';
  readonly commandRequestSha256Hex: string;
  readonly pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>;
  readonly executionReceipt: WorkerReceipt;
  readonly checks: Readonly<{
    readonly exactRequestBytesBoundAcrossParentAndWorker: true;
    readonly exactPegInPlanBoundAcrossParentAndWorker: true;
    readonly explicitExternalRootsBoundAcrossParentAndWorker: true;
    readonly terminalWorkerReceiptValidatedBeforePublication: true;
    readonly workerExitedBeforePublication: true;
    readonly outputConfinementRevalidatedImmediatelyBeforePublication: true;
    readonly createOnlyPublicationUsed: true;
  }>;
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly oneTransportAttemptRecorded: true;
    readonly transportOutcomePersisted: true;
    readonly canonicalConfirmationObserved: boolean;
    readonly trackerAdmissionEstablished: boolean;
    readonly signedTrackerBytesPersisted: false;
    readonly localPathsReturnedOrPersisted: false;
    readonly retryAuthorized: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly processLossRecoveryEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export async function runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV9(
  argv: readonly string[],
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandV9Result
>> {
  let phase: CommandPhase = 'command arguments';
  try {
    const args = parseArguments(argv);
    const scriptDirectory = dirname(fileURLToPath(import.meta.url));
    const relayerRoot = resolve(scriptDirectory, '..', '..');
    const bridgeRoot = resolve(relayerRoot, '..');
    const worktreeRoot = resolve(bridgeRoot, '..');

    phase = 'request binding';
    const request = readBoundedRegularFile(
      explicitExistingLocalNonSensitivePath(
        args.requestPath,
        'peg-in tracker transport campaign request',
        'file',
      ),
      'peg-in tracker transport campaign request',
      MAX_REQUEST_BYTES,
    );
    const commandRequestSha256Hex = createHash('sha256')
      .update(request.bytes)
      .digest('hex');

    phase = 'external roots';
    const externalRoots = [
      explicitExistingLocalNonSensitivePath(
        args.frontierTemporaryRoot,
        'Frontier tracker transport temporary root',
        'directory',
      ),
      explicitExistingLocalNonSensitivePath(
        args.frontierCargoCache,
        'Frontier tracker transport Cargo dependency cache',
        'directory',
      ),
      explicitExistingLocalNonSensitivePath(
        args.relayerCargoCache,
        'relayer tracker transport Cargo dependency cache',
        'directory',
      ),
      explicitExistingLocalNonSensitivePath(
        args.trackerTransportJournalRoot,
        'tracker transport journal root',
        'directory',
      ),
    ] as const;
    assertExternalRoots(externalRoots, worktreeRoot);

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
        'peg-in tracker transport campaign request and output must differ',
      );
    }
    assertOutputOutsideRuntimeRoots(outputPath, externalRoots);
    const workerPath = resolve(
      scriptDirectory,
      'run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-worker-v9.ts',
    );

    phase = 'worker launch';
    let workerReceipt: WorkerReceipt;
    try {
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
          externalRoots[0],
          '--frontier-cargo-cache',
          externalRoots[1],
          '--tracker-transport-journal-root',
          externalRoots[3],
        ],
        cwd: relayerRoot,
        env: childEnvironment(worktreeRoot, {
          cargoHomeDirectory: externalRoots[2],
        }),
        timeoutMs: WORKER_TIMEOUT_MS,
        terminationGraceMs: 30_000,
        maxOutputBytes: MAX_WORKER_OUTPUT_BYTES + 64 * 1024,
        maxStdoutBytes: MAX_WORKER_OUTPUT_BYTES,
        maxStderrBytes: 64 * 1024,
        label: 'isolated peg-in tracker transport campaign worker',
      });
      phase = 'worker receipt';
      if (result.stderr !== '') {
        throw new Error(
          'isolated tracker transport campaign worker emitted diagnostics',
        );
      }
      workerReceipt =
        parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV9(
          result.stdout,
          commandRequestSha256Hex,
          args.pegIn,
        );
    } catch (error) {
      if (error instanceof BoundedProcessExitError) {
        phase = 'worker receipt';
      }
      if (
        !(error instanceof BoundedProcessExitError)
        || error.exitCode === 0
        || error.stdout !== ''
      ) {
        throw error;
      }
      phase = 'worker receipt';
      const diagnostic = parseSafeWorkerDiagnostic(error.stderr);
      if (diagnostic !== undefined) {
        throw new TrackerTransportCampaignWorkerDiagnosticHintV9(diagnostic);
      }
      workerReceipt =
        parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9(
          error.stderr,
          commandRequestSha256Hex,
          args.pegIn,
        );
    }

    phase = 'command receipt';
    const receipt = buildCommandReceipt(
      commandRequestSha256Hex,
      args.pegIn,
      workerReceipt,
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
      throw new Error('tracker transport campaign output identity changed');
    }
    assertOutputOutsideRuntimeRoots(revalidatedOutputPath, externalRoots);
    publishCreateOnlyReceipt(
      revalidatedOutputPath,
      Buffer.from(`${canonicalJson(receipt)}\n`, 'utf8'),
      '.e2s-peg-in-tracker-transport-campaign-receipt-',
      'isolated tracker transport campaign staged receipt',
    );
    if (receipt.boundaries.canonicalConfirmationObserved) {
      return Object.freeze({
        status:
          'isolated_peg_in_tracker_transport_canonically_confirmed_receipt_published' as const,
        canonicalConfirmationObserved: true as const,
        receiptDigestHex: receipt.receiptDigestHex,
      });
    }
    return Object.freeze({
      status:
        'isolated_peg_in_tracker_transport_not_canonically_confirmed_receipt_published' as const,
      canonicalConfirmationObserved: false as const,
      receiptDigestHex: receipt.receiptDigestHex,
    });
  } catch (error) {
    if (isCommandPhaseError(error) || isWorkerDiagnosticHint(error)) {
      throw error;
    }
    throw new TrackerTransportCampaignCommandPhaseErrorV9(phase, error);
  }
}

function parseSafeWorkerDiagnostic(
  stderr: string,
): Readonly<{
  readonly binding?: string;
  readonly phase?: FrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7;
}> | undefined {
  if (!stderr.endsWith('\n')) return undefined;
  const line = stderr.slice(0, -1);
  if (line.includes('\n') || line.includes('\r')) return undefined;
  if (line.startsWith(SAFE_WORKER_BINDING_FAILURE_PREFIX)) {
    const binding = line.slice(SAFE_WORKER_BINDING_FAILURE_PREFIX.length);
    return isKnownFrozenObservedAnchorTrackerCheckCampaignBindingLabelV7(binding)
      ? Object.freeze({ binding })
      : undefined;
  }
  if (line.startsWith(SAFE_WORKER_PHASE_FAILURE_PREFIX)) {
    const phase = line.slice(SAFE_WORKER_PHASE_FAILURE_PREFIX.length);
    return isKnownFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseV7(phase)
      ? Object.freeze({ phase })
      : undefined;
  }
  return undefined;
}

function buildCommandReceipt(
  commandRequestSha256Hex: string,
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
  executionReceipt: WorkerReceipt,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandReceiptV9
> {
  const confirmed =
    executionReceipt.status === 'local_tracker_transport_canonically_confirmed';
  const body = {
    schema: confirmed ? COMMAND_RECEIPT_SCHEMA : COMMAND_FAILURE_RECEIPT_SCHEMA,
    version: 9 as const,
    status: confirmed
      ? 'request_bound_local_peg_in_tracker_transport_canonically_confirmed' as const
      : 'request_bound_local_peg_in_tracker_transport_not_canonically_confirmed' as const,
    commandRequestSha256Hex,
    pegIn,
    executionReceipt,
    checks: Object.freeze({
      exactRequestBytesBoundAcrossParentAndWorker: true as const,
      exactPegInPlanBoundAcrossParentAndWorker: true as const,
      explicitExternalRootsBoundAcrossParentAndWorker: true as const,
      terminalWorkerReceiptValidatedBeforePublication: true as const,
      workerExitedBeforePublication: true as const,
      outputConfinementRevalidatedImmediatelyBeforePublication: true as const,
      createOnlyPublicationUsed: true as const,
    }),
    boundaries: Object.freeze({
      localIsolatedDevnetOnly: true as const,
      oneTransportAttemptRecorded: true as const,
      transportOutcomePersisted: true as const,
      canonicalConfirmationObserved: confirmed,
      trackerAdmissionEstablished: confirmed,
      signedTrackerBytesPersisted: false as const,
      localPathsReturnedOrPersisted: false as const,
      retryAuthorized: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      processLossRecoveryEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  };
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      confirmed
        ? COMMAND_RECEIPT_DIGEST_DOMAIN
        : COMMAND_FAILURE_RECEIPT_DIGEST_DOMAIN,
    ),
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt, 'peg-in tracker transport campaign receipt');
  return receipt;
}

export function parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandReceiptV9(
  serialized: string,
  expectedReceiptDigestHex: string,
  expectedRequestSha256Hex: string,
  expectedPegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandReceiptV9
> {
  fixedHex(expectedReceiptDigestHex, 32, 'expected command receipt digest');
  fixedHex(expectedRequestSha256Hex, 32, 'expected command request digest');
  const pegIn = normalizePegInPlan(
    expectedPegIn.amountNanoErg,
    expectedPegIn.recipientAddressHex,
  );
  assertNoDuplicateJsonKeys(serialized);
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('tracker transport command receipt is not JSON');
  }
  if (`${canonicalJson(parsed)}\n` !== serialized) {
    throw new Error('tracker transport command receipt is not canonical JSON');
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
  ], 'tracker transport command receipt');
  const confirmed = receipt.schema === COMMAND_RECEIPT_SCHEMA
    && receipt.status
      === 'request_bound_local_peg_in_tracker_transport_canonically_confirmed';
  const notConfirmed = receipt.schema === COMMAND_FAILURE_RECEIPT_SCHEMA
    && receipt.status
      === 'request_bound_local_peg_in_tracker_transport_not_canonically_confirmed';
  if (
    receipt.version !== 9
    || (!confirmed && !notConfirmed)
    || receipt.commandRequestSha256Hex !== expectedRequestSha256Hex
  ) {
    throw new Error('tracker transport command receipt identity changed');
  }
  assertPegIn(receipt.pegIn, 'tracker transport command receipt peg-in');
  if (
    receipt.pegIn.amountNanoErg !== pegIn.amountNanoErg
    || receipt.pegIn.recipientAddressHex !== pegIn.recipientAddressHex
  ) {
    throw new Error('tracker transport command receipt peg-in changed');
  }
  const executionReceipt = confirmed
    ? parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV9(
      `${canonicalJson(receipt.executionReceipt)}\n`,
      expectedRequestSha256Hex,
      pegIn,
    )
    : parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9(
      `${canonicalJson(receipt.executionReceipt)}\n`,
      expectedRequestSha256Hex,
      pegIn,
    );
  const expectedChecks = {
    exactRequestBytesBoundAcrossParentAndWorker: true,
    exactPegInPlanBoundAcrossParentAndWorker: true,
    explicitExternalRootsBoundAcrossParentAndWorker: true,
    terminalWorkerReceiptValidatedBeforePublication: true,
    workerExitedBeforePublication: true,
    outputConfinementRevalidatedImmediatelyBeforePublication: true,
    createOnlyPublicationUsed: true,
  } as const;
  assertExpectedBooleanRecord(receipt.checks, expectedChecks, 'command checks');
  const expectedBoundaries = {
    localIsolatedDevnetOnly: true,
    oneTransportAttemptRecorded: true,
    transportOutcomePersisted: true,
    canonicalConfirmationObserved: confirmed,
    trackerAdmissionEstablished: confirmed,
    signedTrackerBytesPersisted: false,
    localPathsReturnedOrPersisted: false,
    retryAuthorized: false,
    publicNetworkUsed: false,
    realFundsUsed: false,
    existingWalletMaterialUsed: false,
    processLossRecoveryEstablished: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  } as const;
  assertExpectedBooleanRecord(
    receipt.boundaries,
    expectedBoundaries,
    'command boundaries',
  );
  const { receiptDigestHex, ...body } = receipt;
  if (
    fixedHex(receiptDigestHex, 32, 'command receipt digest')
      !== expectedReceiptDigestHex
    || receiptDigestHex !== sha256CanonicalJson(
      body,
      confirmed
        ? COMMAND_RECEIPT_DIGEST_DOMAIN
        : COMMAND_FAILURE_RECEIPT_DIGEST_DOMAIN,
    )
  ) {
    throw new Error('tracker transport command receipt digest changed');
  }
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt, 'tracker transport command receipt');
  return deepFreeze({
    ...receipt,
    executionReceipt,
  }) as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandReceiptV9
  >;
}

function parseArguments(argv: readonly string[]): Readonly<{
  readonly requestPath: string;
  readonly outputPath: string;
  readonly frontierTemporaryRoot: string;
  readonly frontierCargoCache: string;
  readonly relayerCargoCache: string;
  readonly trackerTransportJournalRoot: string;
  readonly pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>;
}> {
  if (
    argv.length !== 16
    || argv[0] !== '--request'
    || invalidArgument(argv[1])
    || argv[2] !== '--amount-nano-erg'
    || argv[3] === undefined
    || argv[4] !== '--recipient-address-hex'
    || argv[5] === undefined
    || argv[6] !== '--frontier-temporary-root'
    || invalidArgument(argv[7])
    || argv[8] !== '--frontier-cargo-cache'
    || invalidArgument(argv[9])
    || argv[10] !== '--relayer-cargo-cache'
    || invalidArgument(argv[11])
    || argv[12] !== '--tracker-transport-journal-root'
    || invalidArgument(argv[13])
    || argv[14] !== '--output'
    || invalidArgument(argv[15])
  ) {
    throw new Error('isolated tracker transport campaign arguments are invalid');
  }
  return Object.freeze({
    requestPath: argv[1]!,
    outputPath: argv[15]!,
    frontierTemporaryRoot: argv[7]!,
    frontierCargoCache: argv[9]!,
    relayerCargoCache: argv[11]!,
    trackerTransportJournalRoot: argv[13]!,
    pegIn: normalizePegInPlan(argv[3], argv[5]),
  });
}

function invalidArgument(value: string | undefined): boolean {
  return value === undefined || value.length === 0 || value.startsWith('--');
}

function normalizePegInPlan(
  amountNanoErg: string | undefined,
  recipientAddressHex: string | undefined,
): Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1> {
  if (
    amountNanoErg === undefined
    || !/^[1-9][0-9]*$/u.test(amountNanoErg)
    || BigInt(amountNanoErg) > ERGO_POSITIVE_LONG_MAX
    || recipientAddressHex === undefined
    || !/^[0-9a-f]{40}$/u.test(recipientAddressHex)
    || /^0{40}$/u.test(recipientAddressHex)
  ) {
    throw new Error('isolated tracker transport campaign plan is invalid');
  }
  return Object.freeze({ amountNanoErg, recipientAddressHex });
}

function assertPegIn(
  value: unknown,
  label: string,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1> {
  const pegIn = exactRecord(value, [
    'amountNanoErg',
    'recipientAddressHex',
  ], label);
  normalizePegInPlan(
    typeof pegIn.amountNanoErg === 'string'
      ? pegIn.amountNanoErg
      : undefined,
    typeof pegIn.recipientAddressHex === 'string'
      ? pegIn.recipientAddressHex
      : undefined,
  );
}

function assertExternalRoots(
  roots: readonly string[],
  worktreeRoot: string,
): void {
  for (const root of roots) {
    if (pathsOverlap(root, worktreeRoot)) {
      throw new Error('tracker transport external roots must remain outside the worktree');
    }
  }
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      if (pathsOverlap(roots[left]!, roots[right]!)) {
        throw new Error('tracker transport external roots must not overlap');
      }
    }
  }
}

function pathsOverlap(left: string, right: string): boolean {
  return canonicalPathIdentity(left) === canonicalPathIdentity(right)
    || isPathInside(left, right)
    || isPathInside(right, left);
}

function assertOutputOutsideRuntimeRoots(
  outputPath: string,
  roots: readonly string[],
): void {
  if (roots.some(root => pathsOverlap(outputPath, root))) {
    throw new Error(
      'tracker transport campaign output must not overlap runtime roots',
    );
  }
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
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    keys.length !== expected.length
    || keys.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
  return value as Record<string, unknown>;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)
  ) {
    throw new Error(`${label} must be canonical lowercase hex`);
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

export function formatSafeTrackerTransportCampaignCommandFailureV9(
  error: unknown,
): string {
  if (isWorkerDiagnosticHint(error) && error.binding !== undefined) {
    return `${COMMAND_FAILURE_PREFIX}: untrusted worker binding hint: ${error.binding}\n`;
  }
  if (isWorkerDiagnosticHint(error) && error.phase !== undefined) {
    return `${COMMAND_FAILURE_PREFIX}: untrusted worker phase hint: ${error.phase}\n`;
  }
  if (isCommandPhaseError(error)) {
    return `${COMMAND_FAILURE_PREFIX}: command phase failed: ${error.phase}\n`;
  }
  return `${COMMAND_FAILURE_PREFIX}\n`;
}

async function main(): Promise<void> {
  const result =
    await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV9(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(result)}\n`);
  if (!result.canonicalConfirmationObserved) process.exitCode = 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(error => {
    process.stderr.write(formatSafeTrackerTransportCampaignCommandFailureV9(error));
    process.exitCode = 1;
  });
}
