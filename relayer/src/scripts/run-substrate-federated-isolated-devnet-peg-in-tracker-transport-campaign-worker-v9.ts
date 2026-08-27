import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9Provenance,
  projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9,
  runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_RECEIPT_DIGEST_DOMAIN_V9,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V9,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  canonicalPathIdentity,
  isPathInside,
} from '../create-only-out-of-repository-artifact.js';
import {
  assertNoDuplicateJsonKeys,
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1,
} from '../relayer-core/substrate-federated-isolated-devnet-receipt-data-safety-v1.js';
import {
  projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9,
} from '../relayer-core/substrate-federated-isolated-devnet-tracker-transport-managed-phase-v9.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS,
} from '../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerV1,
} from '../substrate-federated-isolated-devnet-frontier-lab-application-v1.js';
import {
  loadCanonicalBootstrapRequestBoundWithProvenanceV1,
} from './run-substrate-federated-isolated-devnet-bootstrap-worker-v1.js';
import {
  readSafeFrozenObservedAnchorTrackerCheckCampaignBindingFailureV7,
} from './run-substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-receipt-v7.js';
import {
  explicitExistingLocalNonSensitivePath,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js';

const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const WORKER_FAILURE_PREFIX =
  'isolated tracker transport campaign worker failed';
const RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V9';
const FAILURE_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V9';
const TRACKER_CANONICAL_CONFIRMATION_FAILURE_DIAGNOSTIC_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-canonical-confirmation-failure-diagnostic.v1' as const;
const TRACKER_CANONICAL_CONFIRMATION_BUDGET_MS_V1 = 2 * 60_000;
const TRACKER_TRANSPORT_WORKER_PHASES_V9 = Object.freeze([
  'worker arguments',
  'worker platform',
  'worker roots',
  'external roots',
  'bootstrap request',
  'campaign root',
  'worker receipt',
  'ergo node build',
  'setup and packet session',
  'node process construction',
  'node startup and mining',
  'managed setup execution',
  'source history collection',
  'ergo funding and history',
  'packet production',
  'setup batch construction',
  'genesis setup transport',
  'peg-in candidate construction',
  'peg-in source-lock execution',
  'peg-in committed-vault execution',
  'application checkpoint execution',
  'tracker candidate construction',
  'managed setup finalization',
  'checkpoint anchor',
  'observed tracker check',
  'frozen tracker check',
  'tracker reservation and transport',
  'campaign teardown',
] as const);
const TRACKER_TRANSPORT_WORKER_PHASE_SET_V9: ReadonlySet<string> =
  new Set(TRACKER_TRANSPORT_WORKER_PHASES_V9);
export type SubstrateFederatedIsolatedDevnetTrackerTransportWorkerPhaseV9 =
  typeof TRACKER_TRANSPORT_WORKER_PHASES_V9[number];
const TRACKER_CANONICAL_CONFIRMATION_FAILURE_CATEGORIES_V1 = Object.freeze([
  'managed_deadline_elapsed',
  'confirmation_budget_elapsed',
  'pending_at_deadline',
  'not_found_at_deadline',
  'observation_completed_after_deadline',
  'observer_failure',
  'clock_failure',
  'confirmation_phase_failure',
] as const);

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V9_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-worker-receipt.v9' as const;

export interface SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV9 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V9_SCHEMA;
  readonly version: 9;
  readonly status: 'local_tracker_transport_canonically_confirmed';
  readonly requestSha256Hex: string;
  readonly pegIn: Readonly<{
    readonly amountNanoErg: string;
    readonly recipientAddressHex: string;
  }>;
  readonly rootReceiptDigestHex: string;
  readonly freshnessReceiptDigestHex: string;
  readonly staticExecutionManifestDigestHex: string;
  readonly transport: Readonly<{
    readonly status: 'accepted' | 'ambiguous';
    readonly expectedTransactionIdHex: string;
    readonly submittedTransactionIdHex: string | null;
    readonly authorizationDigestHex: string;
    readonly durableAttemptDigestHex: string;
    readonly outcomeDigestHex: string;
    readonly responseDigestHex: string;
    readonly confirmations: number;
    readonly confirmationHeight: number;
    readonly confirmationHeaderIdHex: string;
    readonly confirmationObservationDigestHex: string;
  }>;
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly oneTransportAttemptRecorded: true;
    readonly canonicalConfirmationObserved: true;
    readonly trackerAdmissionEstablished: true;
    readonly signedTrackerBytesPersisted: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V9_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-worker-failure-receipt.v9' as const;

export interface SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V9_SCHEMA;
  readonly version: 9;
  readonly status: 'local_tracker_transport_not_canonically_confirmed';
  readonly requestSha256Hex: string;
  readonly pegIn: Readonly<{
    readonly amountNanoErg: string;
    readonly recipientAddressHex: string;
  }>;
  readonly rootFailureReceiptDigestHex: string;
  readonly staticExecutionManifestDigestHex: string;
  readonly transport: Readonly<{
    readonly authorization: Readonly<{
      readonly expectedTransactionIdHex: string;
      readonly executionTargetIdentityDigestHex: string;
      readonly authorizationDigestHex: string;
    }>;
    readonly attempt: Readonly<{
      readonly expectedTransactionIdHex: string;
      readonly durableAttemptDigestHex: string;
    }>;
    readonly outcome: Readonly<{
      readonly status: 'accepted' | 'ambiguous';
      readonly expectedTransactionIdHex: string;
      readonly submittedTransactionIdHex: string | null;
      readonly durableAttemptDigestHex: string;
      readonly outcomeDigestHex: string;
      readonly responseDigestHex: string;
    }>;
  }>;
  readonly confirmation: Readonly<{
    readonly schema:
      typeof TRACKER_CANONICAL_CONFIRMATION_FAILURE_DIAGNOSTIC_V1_SCHEMA;
    readonly version: 1;
    readonly category:
      typeof TRACKER_CANONICAL_CONFIRMATION_FAILURE_CATEGORIES_V1[number];
    readonly expectedTransactionIdHex: string;
    readonly executionTargetIdentityDigestHex: string;
    readonly confirmationBudgetMs: number;
    readonly observationCount: number;
    readonly lastObservation: Readonly<{
      readonly status: 'confirmed' | 'pending' | 'not_found';
      readonly confirmations: number;
      readonly observedAtHeight: number;
      readonly observationDigestHex: string;
    }> | null;
  }>;
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly oneTransportAttemptRecorded: true;
    readonly transportOutcomePersisted: true;
    readonly exactNodeAcceptanceObserved: boolean;
    readonly canonicalConfirmationObserved: false;
    readonly trackerAdmissionEstablished: false;
    readonly signedTrackerBytesPersisted: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

const WORKER_FAILURE_RECEIPTS = new WeakMap<Error, Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9
>>();
const WORKER_PHASE_FAILURES_V9 = new WeakMap<
  Error,
  SubstrateFederatedIsolatedDevnetTrackerTransportWorkerPhaseV9
>();

export function isKnownSubstrateFederatedIsolatedDevnetTrackerTransportWorkerPhaseV9(
  value: unknown,
): value is SubstrateFederatedIsolatedDevnetTrackerTransportWorkerPhaseV9 {
  return typeof value === 'string'
    && TRACKER_TRANSPORT_WORKER_PHASE_SET_V9.has(value);
}

function createTrackerTransportWorkerPhaseFailureV9(
  phase: SubstrateFederatedIsolatedDevnetTrackerTransportWorkerPhaseV9,
  cause: unknown,
): Error {
  if (!isKnownSubstrateFederatedIsolatedDevnetTrackerTransportWorkerPhaseV9(
    phase,
  )) {
    throw new Error('tracker transport worker phase is invalid');
  }
  const failure = cause instanceof Error
    ? cause
    : new Error('isolated tracker transport campaign worker phase failed');
  WORKER_PHASE_FAILURES_V9.set(failure, phase);
  return failure;
}

function readTrackerTransportWorkerPhaseFailureV9(
  error: unknown,
): SubstrateFederatedIsolatedDevnetTrackerTransportWorkerPhaseV9 | undefined {
  return error instanceof Error
    ? WORKER_PHASE_FAILURES_V9.get(error)
    : undefined;
}

export async function runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV9(
  argv: readonly string[],
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV9
>> {
  let phase: SubstrateFederatedIsolatedDevnetTrackerTransportWorkerPhaseV9 =
    'worker arguments';
  try {
    assertArguments(argv);

    phase = 'worker platform';
    if (process.platform !== 'win32') {
      throw new Error('isolated tracker transport campaign worker requires Windows');
    }

    phase = 'worker roots';
    const scriptDirectory = dirname(fileURLToPath(import.meta.url));
    const { bridgeRoot, worktreeRoot } = resolveCanonicalWorkerRootsV9(
      scriptDirectory,
    );

    phase = 'external roots';
    const temporaryDirectoryRoot = externalDirectory(
      argv[9]!,
      'Frontier tracker transport temporary root',
      worktreeRoot,
    );
    const cargoDependencyCacheDirectory = externalDirectory(
      argv[11]!,
      'Frontier tracker transport Cargo dependency cache',
      worktreeRoot,
    );
    const trackerTransportJournalRoot = externalDirectory(
      argv[13]!,
      'tracker transport journal root',
      worktreeRoot,
    );
    const relayerCargoCacheDirectory = externalDirectory(
      process.env.CARGO_HOME,
      'relayer artifact Cargo dependency cache',
      worktreeRoot,
    );
    const externalRoots = [
      temporaryDirectoryRoot,
      cargoDependencyCacheDirectory,
      trackerTransportJournalRoot,
      relayerCargoCacheDirectory,
    ];
    for (let left = 0; left < externalRoots.length; left += 1) {
      for (let right = left + 1; right < externalRoots.length; right += 1) {
        if (pathsOverlap(externalRoots[left]!, externalRoots[right]!)) {
          throw new Error(
            'tracker transport temporary, journal, and Cargo roots must not overlap',
          );
        }
      }
    }

    phase = 'bootstrap request';
    const loaded = loadCanonicalBootstrapRequestBoundWithProvenanceV1(
      argv[1]!,
      bridgeRoot,
      worktreeRoot,
      argv[3]!,
    );
    const input = loaded.input;
    const pegIn = Object.freeze({
      amountNanoErg: argv[5]!,
      recipientAddressHex: argv[7]!,
    });
    const acceptance = input.lifecycle.sourceHistory.acceptance;
    assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerV1({
      bridgeOwnerAddressHex: acceptance.bridgeOwnerAddress,
      recipientAddressHex: pegIn.recipientAddressHex,
    });

    phase = 'campaign root';
    let result: Awaited<ReturnType<
      typeof runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9
    >>;
    try {
      result =
        await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9({
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
          requestBinding: loaded.requestBinding,
          trackerTransportJournalRoot,
        });
    } catch (error) {
      const rootFailure =
        projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9(
          error,
        );
      if (rootFailure !== null) {
        throw createWorkerFailure(rootFailure, argv[3]!, pegIn, error);
      }
      const managedPhase =
        projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
          error,
        );
      if (managedPhase !== null) {
        throw createTrackerTransportWorkerPhaseFailureV9(
          managedPhase,
          error,
        );
      }
      throw error;
    }

    phase = 'worker receipt';
    assertSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9Provenance(
      result.receipt,
    );
    return projectReceipt(result.receipt, argv[3]!, pegIn);
  } catch (error) {
    if (
      (error instanceof Error && WORKER_FAILURE_RECEIPTS.has(error))
      || readSafeFrozenObservedAnchorTrackerCheckCampaignBindingFailureV7(error)
        !== undefined
      || readTrackerTransportWorkerPhaseFailureV9(error) !== undefined
    ) {
      throw error;
    }
    throw createTrackerTransportWorkerPhaseFailureV9(
      phase,
      error,
    );
  }
}

function projectReceipt(
  rootReceipt: Awaited<ReturnType<
    typeof runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9
  >>['receipt'],
  requestSha256Hex: string,
  pegIn: Readonly<{
    readonly amountNanoErg: string;
    readonly recipientAddressHex: string;
  }>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV9
> {
  const outcome = rootReceipt.transport.outcome;
  const confirmation = rootReceipt.transport.confirmation;
  const transactionIdHex = outcome.expectedTransactionIdHex;
  if (
    confirmation.status !== 'confirmed'
    || confirmation.confirmationHeight === null
    || confirmation.confirmationHeaderIdHex === null
    || confirmation.confirmations
      < SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS
    || confirmation.transactionIdHex !== transactionIdHex
    || rootReceipt.transport.attempt.expectedTransactionIdHex
      !== transactionIdHex
    || rootReceipt.transport.authorization.expectedTransactionIdHex
      !== transactionIdHex
    || rootReceipt.transport.confirmationExecution.confirmedTransactionIdHex
      !== transactionIdHex
    || rootReceipt.transport.authorization.executionTargetIdentityDigestHex
      !== rootReceipt.transport.execution.executionTargetIdentityDigestHex
    || rootReceipt.transport.confirmationExecution
      .trackerTransportExecutionTargetIdentityDigestHex
      !== rootReceipt.transport.execution.executionTargetIdentityDigestHex
  ) {
    throw new Error(
      'isolated tracker transport root lacks canonical confirmation',
    );
  }
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V9_SCHEMA,
    version: 9 as const,
    status: 'local_tracker_transport_canonically_confirmed' as const,
    requestSha256Hex,
    pegIn,
    rootReceiptDigestHex: rootReceipt.receiptDigestHex,
    freshnessReceiptDigestHex: rootReceipt.freshness.receiptDigestHex,
    staticExecutionManifestDigestHex:
      rootReceipt.staticExecutionManifestDigestHex,
    transport: Object.freeze({
      status: outcome.status,
      expectedTransactionIdHex: outcome.expectedTransactionIdHex,
      submittedTransactionIdHex: outcome.submittedTransactionIdHex,
      authorizationDigestHex:
        rootReceipt.transport.authorization.authorizationDigestHex,
      durableAttemptDigestHex: outcome.durableAttemptDigestHex,
      outcomeDigestHex: outcome.outcomeDigestHex,
      responseDigestHex: outcome.responseDigestHex,
      confirmations: confirmation.confirmations,
      confirmationHeight: confirmation.confirmationHeight,
      confirmationHeaderIdHex: confirmation.confirmationHeaderIdHex,
      confirmationObservationDigestHex: confirmation.observationDigestHex,
    }),
    boundaries: Object.freeze({
      localIsolatedDevnetOnly: true as const,
      oneTransportAttemptRecorded: true as const,
      canonicalConfirmationObserved: true as const,
      trackerAdmissionEstablished: true as const,
      signedTrackerBytesPersisted: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    }),
  };
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN),
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  return receipt;
}

function assertArguments(argv: readonly string[]): void {
  if (
    argv.length !== 14
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
    || argv[12] !== '--tracker-transport-journal-root'
    || argv[13] === undefined
    || argv[13].length === 0
    || argv[13].startsWith('--')
  ) {
    throw new Error('isolated tracker transport campaign worker arguments are invalid');
  }
}

export function resolveCanonicalWorkerRootsV9(
  scriptDirectory: string,
): Readonly<{ readonly bridgeRoot: string; readonly worktreeRoot: string }> {
  const bridgeRoot = realpathSync(resolve(scriptDirectory, '..', '..', '..'));
  return Object.freeze({
    bridgeRoot,
    worktreeRoot: realpathSync(resolve(bridgeRoot, '..')),
  });
}

function externalDirectory(
  value: string | undefined,
  label: string,
  worktreeRoot: string,
): string {
  const directory = explicitExistingLocalNonSensitivePath(
    value,
    label,
    'directory',
  );
  if (pathsOverlap(worktreeRoot, directory)) {
    throw new Error(`${label} must remain outside the worktree`);
  }
  return directory;
}

function pathsOverlap(left: string, right: string): boolean {
  return canonicalPathIdentity(left) === canonicalPathIdentity(right)
    || isPathInside(left, right)
    || isPathInside(right, left);
}

function createWorkerFailure(
  rootFailure: NonNullable<ReturnType<
    typeof projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9
  >>,
  requestSha256Hex: string,
  pegIn: Readonly<{
    readonly amountNanoErg: string;
    readonly recipientAddressHex: string;
  }>,
  cause: unknown,
): Error {
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V9_SCHEMA,
    version: 9 as const,
    status: 'local_tracker_transport_not_canonically_confirmed' as const,
    requestSha256Hex,
    pegIn,
    rootFailureReceiptDigestHex: rootFailure.receiptDigestHex,
    staticExecutionManifestDigestHex:
      rootFailure.staticExecutionManifestDigestHex,
    transport: rootFailure.transport,
    confirmation: rootFailure.confirmation,
    boundaries: rootFailure.boundaries,
  };
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, FAILURE_RECEIPT_DIGEST_DOMAIN),
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  const failure = new Error(WORKER_FAILURE_PREFIX, { cause });
  WORKER_FAILURE_RECEIPTS.set(failure, receipt);
  return failure;
}

export function formatSafeTrackerTransportCampaignWorkerFailureV9(
  error: unknown,
): string {
  if (error instanceof Error) {
    const receipt = WORKER_FAILURE_RECEIPTS.get(error);
    if (receipt !== undefined) return `${canonicalJson(receipt)}\n`;
  }
  const binding =
    readSafeFrozenObservedAnchorTrackerCheckCampaignBindingFailureV7(error);
  if (binding !== undefined) {
    return `${WORKER_FAILURE_PREFIX}: producer-to-consumer binding changed: ${binding}\n`;
  }
  const phase = readTrackerTransportWorkerPhaseFailureV9(error);
  if (phase !== undefined) {
    return `${WORKER_FAILURE_PREFIX}: phase failed: ${phase}\n`;
  }
  return `${WORKER_FAILURE_PREFIX}\n`;
}

export function parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV9(
  stdout: string,
  expectedRequestSha256Hex: string,
  expectedPegIn: Readonly<{
    readonly amountNanoErg: string;
    readonly recipientAddressHex: string;
  }>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV9
> {
  fixedHex(expectedRequestSha256Hex, 32, 'expected request digest');
  assertPegIn(expectedPegIn, 'expected peg-in');
  assertNoDuplicateJsonKeys(stdout);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('tracker transport worker output is not JSON');
  }
  if (`${canonicalJson(parsed)}\n` !== stdout) {
    throw new Error(
      'tracker transport worker output is not canonical JSON plus one LF',
    );
  }
  const receipt = exactRecord(parsed, [
    'boundaries',
    'freshnessReceiptDigestHex',
    'pegIn',
    'receiptDigestHex',
    'requestSha256Hex',
    'rootReceiptDigestHex',
    'schema',
    'staticExecutionManifestDigestHex',
    'status',
    'transport',
    'version',
  ], 'tracker transport worker receipt');
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V9_SCHEMA
    || receipt.version !== 9
    || receipt.status !== 'local_tracker_transport_canonically_confirmed'
    || receipt.requestSha256Hex !== expectedRequestSha256Hex
    || receipt.staticExecutionManifestDigestHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V9
  ) {
    throw new Error('tracker transport worker identity changed');
  }
  assertPegIn(receipt.pegIn, 'tracker transport worker peg-in');
  if (
    receipt.pegIn.amountNanoErg !== expectedPegIn.amountNanoErg
    || receipt.pegIn.recipientAddressHex
      !== expectedPegIn.recipientAddressHex
  ) {
    throw new Error('tracker transport worker peg-in changed');
  }
  fixedHex(receipt.rootReceiptDigestHex, 32, 'root receipt digest');
  fixedHex(receipt.freshnessReceiptDigestHex, 32, 'freshness receipt digest');

  const transport = exactRecord(receipt.transport, [
    'authorizationDigestHex',
    'confirmationHeaderIdHex',
    'confirmationHeight',
    'confirmationObservationDigestHex',
    'confirmations',
    'durableAttemptDigestHex',
    'expectedTransactionIdHex',
    'outcomeDigestHex',
    'responseDigestHex',
    'status',
    'submittedTransactionIdHex',
  ], 'tracker transport worker transport');
  const expectedTransactionIdHex = fixedHex(
    transport.expectedTransactionIdHex,
    32,
    'tracker transport transaction ID',
  );
  const transportStatus = transport.status;
  if (
    (transportStatus !== 'accepted' && transportStatus !== 'ambiguous')
    || (
      transportStatus === 'accepted'
        ? fixedHex(
          transport.submittedTransactionIdHex,
          32,
          'submitted tracker transaction ID',
        ) !== expectedTransactionIdHex
        : transport.submittedTransactionIdHex !== null
    )
    || !Number.isSafeInteger(transport.confirmations)
    || Number(transport.confirmations)
      < SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS
    || !Number.isSafeInteger(transport.confirmationHeight)
    || Number(transport.confirmationHeight) < 1
  ) {
    throw new Error('tracker transport worker confirmation changed');
  }
  for (const [value, label] of [
    [transport.authorizationDigestHex, 'tracker transport authorization digest'],
    [transport.durableAttemptDigestHex, 'tracker transport attempt digest'],
    [transport.outcomeDigestHex, 'tracker transport outcome digest'],
    [transport.responseDigestHex, 'tracker transport response digest'],
    [transport.confirmationHeaderIdHex, 'tracker confirmation header ID'],
    [transport.confirmationObservationDigestHex, 'tracker confirmation observation digest'],
  ] as const) {
    fixedHex(value, 32, label);
  }

  const expectedBoundaries = Object.freeze({
    localIsolatedDevnetOnly: true,
    oneTransportAttemptRecorded: true,
    canonicalConfirmationObserved: true,
    trackerAdmissionEstablished: true,
    signedTrackerBytesPersisted: false,
    publicNetworkUsed: false,
    realFundsUsed: false,
    existingWalletMaterialUsed: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  });
  const boundaries = exactRecord(
    receipt.boundaries,
    Object.keys(expectedBoundaries),
    'tracker transport worker boundaries',
  );
  for (const [key, expected] of Object.entries(expectedBoundaries)) {
    if (boundaries[key] !== expected) {
      throw new Error('tracker transport worker boundary changed');
    }
  }

  const { receiptDigestHex, ...body } = receipt;
  if (
    fixedHex(receiptDigestHex, 32, 'worker receipt digest')
      !== sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN)
  ) {
    throw new Error('tracker transport worker digest changed');
  }
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  return deepFreeze(receipt) as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV9
  >;
}

export function parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9(
  stdout: string,
  expectedRequestSha256Hex: string,
  expectedPegIn: Readonly<{
    readonly amountNanoErg: string;
    readonly recipientAddressHex: string;
  }>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9
> {
  fixedHex(expectedRequestSha256Hex, 32, 'expected request digest');
  assertPegIn(expectedPegIn, 'expected peg-in');
  assertNoDuplicateJsonKeys(stdout);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('tracker transport worker failure output is not JSON');
  }
  if (`${canonicalJson(parsed)}\n` !== stdout) {
    throw new Error(
      'tracker transport worker failure output is not canonical JSON plus one LF',
    );
  }
  const receipt = exactRecord(parsed, [
    'boundaries',
    'confirmation',
    'pegIn',
    'receiptDigestHex',
    'requestSha256Hex',
    'rootFailureReceiptDigestHex',
    'schema',
    'staticExecutionManifestDigestHex',
    'status',
    'transport',
    'version',
  ], 'tracker transport worker failure receipt');
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V9_SCHEMA
    || receipt.version !== 9
    || receipt.status !== 'local_tracker_transport_not_canonically_confirmed'
    || receipt.requestSha256Hex !== expectedRequestSha256Hex
    || receipt.staticExecutionManifestDigestHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V9
  ) {
    throw new Error('tracker transport worker failure identity changed');
  }
  assertPegIn(receipt.pegIn, 'tracker transport worker failure peg-in');
  if (
    receipt.pegIn.amountNanoErg !== expectedPegIn.amountNanoErg
    || receipt.pegIn.recipientAddressHex !== expectedPegIn.recipientAddressHex
  ) {
    throw new Error('tracker transport worker failure peg-in changed');
  }
  const rootFailureReceiptDigestHex = fixedHex(
    receipt.rootFailureReceiptDigestHex,
    32,
    'root failure receipt digest',
  );
  const transport = exactRecord(receipt.transport, [
    'attempt',
    'authorization',
    'outcome',
  ], 'tracker transport worker failure transport');
  const authorization = exactRecord(transport.authorization, [
    'authorizationDigestHex',
    'executionTargetIdentityDigestHex',
    'expectedTransactionIdHex',
  ], 'tracker transport worker failure authorization');
  const attempt = exactRecord(transport.attempt, [
    'durableAttemptDigestHex',
    'expectedTransactionIdHex',
  ], 'tracker transport worker failure attempt');
  const outcome = exactRecord(transport.outcome, [
    'durableAttemptDigestHex',
    'expectedTransactionIdHex',
    'outcomeDigestHex',
    'responseDigestHex',
    'status',
    'submittedTransactionIdHex',
  ], 'tracker transport worker failure outcome');
  const transactionIdHex = fixedHex(
    attempt.expectedTransactionIdHex,
    32,
    'attempted tracker transaction ID',
  );
  const durableAttemptDigestHex = fixedHex(
    attempt.durableAttemptDigestHex,
    32,
    'durable attempt digest',
  );
  if (
    fixedHex(
      authorization.expectedTransactionIdHex,
      32,
      'authorization transaction ID',
    ) !== transactionIdHex
    || fixedHex(
      outcome.expectedTransactionIdHex,
      32,
      'outcome transaction ID',
    ) !== transactionIdHex
    || fixedHex(
      outcome.durableAttemptDigestHex,
      32,
      'outcome durable attempt digest',
    ) !== durableAttemptDigestHex
    || !['accepted', 'ambiguous'].includes(String(outcome.status))
    || (
      outcome.status === 'accepted'
        ? outcome.submittedTransactionIdHex !== transactionIdHex
        : outcome.submittedTransactionIdHex !== null
    )
  ) {
    throw new Error('tracker transport worker failure binding changed');
  }
  fixedHex(authorization.authorizationDigestHex, 32, 'authorization digest');
  fixedHex(outcome.outcomeDigestHex, 32, 'outcome digest');
  fixedHex(outcome.responseDigestHex, 32, 'response digest');
  const confirmation = exactRecord(receipt.confirmation, [
    'category',
    'confirmationBudgetMs',
    'executionTargetIdentityDigestHex',
    'expectedTransactionIdHex',
    'lastObservation',
    'observationCount',
    'schema',
    'version',
  ], 'tracker transport worker failure confirmation diagnostic');
  if (
    confirmation.schema
      !== TRACKER_CANONICAL_CONFIRMATION_FAILURE_DIAGNOSTIC_V1_SCHEMA
    || confirmation.version !== 1
    || !TRACKER_CANONICAL_CONFIRMATION_FAILURE_CATEGORIES_V1.includes(
      String(confirmation.category) as
        typeof TRACKER_CANONICAL_CONFIRMATION_FAILURE_CATEGORIES_V1[number],
    )
    || confirmation.expectedTransactionIdHex !== transactionIdHex
    || fixedHex(
      confirmation.executionTargetIdentityDigestHex,
      32,
      'confirmation target identity digest',
    ) !== fixedHex(
      authorization.executionTargetIdentityDigestHex,
      32,
      'authorization target identity digest',
    )
    || confirmation.confirmationBudgetMs
      !== TRACKER_CANONICAL_CONFIRMATION_BUDGET_MS_V1
    || !Number.isSafeInteger(confirmation.observationCount)
    || Number(confirmation.observationCount) < 0
  ) {
    throw new Error('tracker transport worker failure confirmation changed');
  }
  const lastObservation = confirmation.lastObservation === null
    ? null
    : exactRecord(confirmation.lastObservation, [
        'confirmations',
        'observationDigestHex',
        'observedAtHeight',
        'status',
      ], 'tracker transport worker failure last confirmation observation');
  if (lastObservation !== null) {
    if (
      !['confirmed', 'pending', 'not_found'].includes(
        String(lastObservation.status),
      )
      || !Number.isSafeInteger(lastObservation.confirmations)
      || Number(lastObservation.confirmations) < 0
      || !Number.isSafeInteger(lastObservation.observedAtHeight)
      || Number(lastObservation.observedAtHeight) < 0
      || (lastObservation.status === 'not_found'
        && lastObservation.confirmations !== 0)
      || (lastObservation.status === 'pending'
        && Number(lastObservation.confirmations)
          >= SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS)
      || (lastObservation.status === 'confirmed'
        && Number(lastObservation.confirmations)
          < SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS)
    ) {
      throw new Error('tracker transport worker failure observation changed');
    }
    fixedHex(
      lastObservation.observationDigestHex,
      32,
      'confirmation observation digest',
    );
  }
  if (
    (confirmation.category === 'pending_at_deadline'
      && lastObservation?.status !== 'pending')
    || (confirmation.category === 'not_found_at_deadline'
      && lastObservation?.status !== 'not_found')
    || (confirmation.category === 'observation_completed_after_deadline'
      && lastObservation?.status !== 'confirmed')
    || (lastObservation !== null
      && Number(confirmation.observationCount) === 0)
    || (confirmation.category === 'observer_failure'
      && Number(confirmation.observationCount) === 0)
    || (['observer_failure', 'clock_failure'].includes(
      String(confirmation.category),
    ) && lastObservation?.status === 'confirmed')
    || (['managed_deadline_elapsed', 'confirmation_budget_elapsed',
      'confirmation_phase_failure'].includes(String(confirmation.category))
      && (Number(confirmation.observationCount) !== 0
        || lastObservation !== null))
  ) {
    throw new Error(
      'tracker transport worker failure confirmation category changed',
    );
  }
  const boundaries = exactRecord(receipt.boundaries, [
    'canonicalConfirmationObserved',
    'exactNodeAcceptanceObserved',
    'existingWalletMaterialUsed',
    'gate5Closed',
    'localIsolatedDevnetOnly',
    'oneTransportAttemptRecorded',
    'productionReadinessEstablished',
    'publicNetworkUsed',
    'realFundsUsed',
    'signedTrackerBytesPersisted',
    'trackerAdmissionEstablished',
    'transportOutcomePersisted',
    'trustlessStatusEstablished',
  ], 'tracker transport worker failure boundaries');
  const expectedBoundaries = {
    canonicalConfirmationObserved: false,
    exactNodeAcceptanceObserved: outcome.status === 'accepted',
    existingWalletMaterialUsed: false,
    gate5Closed: false,
    localIsolatedDevnetOnly: true,
    oneTransportAttemptRecorded: true,
    productionReadinessEstablished: false,
    publicNetworkUsed: false,
    realFundsUsed: false,
    signedTrackerBytesPersisted: false,
    trackerAdmissionEstablished: false,
    transportOutcomePersisted: true,
    trustlessStatusEstablished: false,
  } as const;
  for (const [key, expected] of Object.entries(expectedBoundaries)) {
    if (boundaries[key] !== expected) {
      throw new Error('tracker transport worker failure boundary changed');
    }
  }
  const rootFailureBody = {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-failure.v9',
    version: 9,
    status: 'local_tracker_transport_not_canonically_confirmed',
    staticExecutionManifestDigestHex:
      receipt.staticExecutionManifestDigestHex,
    transport,
    confirmation,
    boundaries,
  } as const;
  if (
    rootFailureReceiptDigestHex !== sha256CanonicalJson(
      rootFailureBody,
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_RECEIPT_DIGEST_DOMAIN_V9,
    )
  ) {
    throw new Error('tracker transport root failure digest changed');
  }
  const { receiptDigestHex, ...body } = receipt;
  if (
    fixedHex(receiptDigestHex, 32, 'worker failure receipt digest')
      !== sha256CanonicalJson(body, FAILURE_RECEIPT_DIGEST_DOMAIN)
  ) {
    throw new Error('tracker transport worker failure digest changed');
  }
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  return deepFreeze(receipt) as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9
  >;
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
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
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

function assertPegIn(value: unknown, label: string): asserts value is Readonly<{
  readonly amountNanoErg: string;
  readonly recipientAddressHex: string;
}> {
  const pegIn = exactRecord(value, [
    'amountNanoErg',
    'recipientAddressHex',
  ], label);
  if (
    typeof pegIn.amountNanoErg !== 'string'
    || !/^[1-9][0-9]*$/u.test(pegIn.amountNanoErg)
    || BigInt(pegIn.amountNanoErg) > ERGO_POSITIVE_LONG_MAX
  ) {
    throw new Error(`${label} amount is invalid`);
  }
  fixedHex(pegIn.recipientAddressHex, 20, `${label} recipient`);
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

async function main(): Promise<void> {
  const receipt =
    await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV9(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(receipt)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(error => {
    process.stderr.write(formatSafeTrackerTransportCampaignWorkerFailureV9(error));
    process.exitCode = 1;
  });
}
