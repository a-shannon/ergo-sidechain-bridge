import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11Provenance,
  projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV11,
  runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_RECEIPT_DIGEST_DOMAIN_V10,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V10,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_PROJECTION_MANIFEST_DIGEST_V11,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1,
  type SubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1,
} from '../adapters/substrate-federated-isolated-devnet-tracker-transport-response-v1.js';
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
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_CAMPAIGN_PHASES_V1,
} from '../relayer-core/substrate-federated-isolated-devnet-managed-campaign-phase-v1.js';
import {
  isKnownSubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureCodeV1,
  projectSubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureV1,
  projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9,
} from '../relayer-core/substrate-federated-isolated-devnet-tracker-transport-managed-phase-v9.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS,
} from '../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import {
  buildAuthoritySafeLegacyMintProbeV1,
} from '../substrate-federated-authority-safe-devnet-observation-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2,
} from '../substrate-federated-isolated-devnet-frontier-lab-owner-binding-v2.js';
import {
  loadCanonicalBootstrapRequestBoundWithProvenanceV1,
} from './run-substrate-federated-isolated-devnet-bootstrap-worker-v1.js';
import {
  readSafeFrozenObservedAnchorTrackerCheckCampaignBindingFailureV7,
} from './run-substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-receipt-v7.js';
import {
  explicitExistingLocalNonSensitivePath,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js';
import {
  resolveCanonicalWorkerRootsV10,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V10_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V10_SCHEMA,
  type SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV10,
  type SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV10,
} from './run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-worker-v10.js';

const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const WORKER_FAILURE_PREFIX =
  'isolated tracker transport campaign worker V11 failed';
const RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V11';
const FAILURE_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V11';
const LEGACY_RECEIPT_DIGEST_DOMAIN_V10 =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V10';
const LEGACY_FAILURE_RECEIPT_DIGEST_DOMAIN_V10 =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V10';
const TRACKER_CANONICAL_CONFIRMATION_FAILURE_DIAGNOSTIC_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-canonical-confirmation-failure-diagnostic.v1' as const;
const TRACKER_CANONICAL_CONFIRMATION_BUDGET_MS_V1 = 2 * 60_000;
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

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V11_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-worker-receipt.v11' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V11_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-worker-failure-receipt.v11' as const;

const CHECKS = Object.freeze({
  exactRootV11ProvenanceValidatedAtProjection: true as const,
  exactLegacyV10WorkerProjectionEmbedded: true as const,
  exactResponseClassificationDigestValidated: true as const,
  exactRootResponseClassificationDigestCopied: true as const,
  exactResponseStatusBound: true as const,
  exactResponseDigestBound: true as const,
  serializedReceiptCarriesRuntimeProvenance: false as const,
  returnedValueContainsRawResponse: false as const,
  returnedValueContainsCapabilities: false as const,
});

const COMMON_BOUNDARIES = Object.freeze({
  localIsolatedDevnetOnly: true as const,
  oneTransportAttemptRecorded: true as const,
  durableOutcomeCommitmentPersistedInTransportJournal: true as const,
  responseClassificationPersistedInTransportJournal: false as const,
  responseClassificationRestartRecoverableFromTransportJournal: false as const,
  responseClassificationProjectedFromSameProcessRuntimeProvenance: true as const,
  serializedResponseClassificationCarriesRuntimeProvenance: false as const,
  responseClassificationAuthoritativeForAdmission: false as const,
  signedTrackerBytesPersisted: false as const,
  fundsAuthorityEstablished: false as const,
  gate5Closed: false as const,
  trustlessStatusEstablished: false as const,
  productionReadinessEstablished: false as const,
  publicNetworkUsed: false as const,
  realFundsUsed: false as const,
  existingWalletMaterialUsed: false as const,
});

interface PegInV11 {
  readonly amountNanoErg: string;
  readonly recipientAddressHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV11 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V11_SCHEMA;
  readonly version: 11;
  readonly status: 'local_tracker_transport_canonically_confirmed';
  readonly requestSha256Hex: string;
  readonly pegIn: Readonly<PegInV11>;
  readonly rootReceiptDigestHex: string;
  readonly rootResponseClassificationDigestHex: string;
  readonly staticProjectionManifestDigestHex: string;
  readonly legacyV10Receipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV10
  >;
  readonly responseClassification: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1
  >;
  readonly checks: typeof CHECKS;
  readonly boundaries: Readonly<typeof COMMON_BOUNDARIES & {
    readonly canonicalConfirmationObserved: true;
    readonly trackerAdmissionEstablished: true;
  }>;
  readonly receiptDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV11 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V11_SCHEMA;
  readonly version: 11;
  readonly status: 'local_tracker_transport_not_canonically_confirmed';
  readonly requestSha256Hex: string;
  readonly pegIn: Readonly<PegInV11>;
  readonly rootFailureReceiptDigestHex: string;
  readonly rootResponseClassificationDigestHex: string;
  readonly staticProjectionManifestDigestHex: string;
  readonly legacyV10Receipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV10
  >;
  readonly responseClassification: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1
  >;
  readonly checks: typeof CHECKS;
  readonly boundaries: Readonly<typeof COMMON_BOUNDARIES & {
    readonly exactNodeAcceptanceObserved: boolean;
    readonly canonicalConfirmationObserved: false;
    readonly trackerAdmissionEstablished: false;
  }>;
  readonly receiptDigestHex: string;
}

const WORKER_PHASES_V11 = Object.freeze([
  'worker arguments',
  'worker platform',
  'worker roots',
  'external roots',
  'bootstrap request',
  'campaign root',
  'worker receipt',
  ...SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_CAMPAIGN_PHASES_V1,
] as const);
const WORKER_PHASE_SET_V11: ReadonlySet<string> = new Set(WORKER_PHASES_V11);
export type SubstrateFederatedIsolatedDevnetTrackerTransportWorkerPhaseV11 =
  typeof WORKER_PHASES_V11[number];

const WORKER_FAILURE_RECEIPTS = new WeakMap<Error, Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV11
>>();
const WORKER_PHASE_FAILURES = new WeakMap<
  Error,
  SubstrateFederatedIsolatedDevnetTrackerTransportWorkerPhaseV11
>();

export function isKnownSubstrateFederatedIsolatedDevnetTrackerTransportWorkerPhaseV11(
  value: unknown,
): value is SubstrateFederatedIsolatedDevnetTrackerTransportWorkerPhaseV11 {
  return typeof value === 'string' && WORKER_PHASE_SET_V11.has(value);
}

export async function runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV11(
  argv: readonly string[],
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV11
>> {
  let phase: SubstrateFederatedIsolatedDevnetTrackerTransportWorkerPhaseV11 =
    'worker arguments';
  try {
    assertArguments(argv);
    phase = 'worker platform';
    if (process.platform !== 'win32') {
      throw new Error('isolated tracker transport campaign worker requires Windows');
    }

    phase = 'worker roots';
    const scriptDirectory = dirname(fileURLToPath(import.meta.url));
    const { bridgeRoot, worktreeRoot } = resolveCanonicalWorkerRootsV10(
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
    const pegIn = Object.freeze({
      amountNanoErg: argv[5]!,
      recipientAddressHex: argv[7]!,
    });
    const acceptance = loaded.input.lifecycle.sourceHistory.acceptance;
    const probe = buildAuthoritySafeLegacyMintProbeV1({
      signedTransactionHex: acceptance.signedLegacyOwnerMintTransactionHex,
      expectedChainId: acceptance.expectedChainId,
      expectedBridgeAddress: acceptance.bridgeAddress,
      expectedBridgeOwnerAddress: acceptance.bridgeOwnerAddress,
    });
    if (
      probe.recipientAddress !== `0x${pegIn.recipientAddressHex}`
      || probe.amount !== pegIn.amountNanoErg
    ) {
      throw new Error(
        'canonical bootstrap request owner-mint probe differs from the V11 peg-in plan',
      );
    }
    assertSubstrateFederatedIsolatedDevnetFrontierLabOwnerBindingV2({
      bridgeAddressHex: acceptance.bridgeAddress,
      bridgeOwnerAddressHex: acceptance.bridgeOwnerAddress,
      recipientAddressHex: pegIn.recipientAddressHex,
      removedBaseSudoAddressHex: acceptance.expectedSudoAddress,
      tokenAddressHex: acceptance.tokenAddress,
    });

    phase = 'campaign root';
    try {
      const result =
        await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11({
          ...loaded.input,
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
      phase = 'worker receipt';
      assertSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11Provenance(
        result.receipt,
      );
      return projectSuccessReceipt(result.receipt, argv[3]!, pegIn);
    } catch (error) {
      const rootFailure =
        projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV11(
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
        throw createPhaseFailure(managedPhase, error);
      }
      throw error;
    }
  } catch (error) {
    if (
      (error instanceof Error && WORKER_FAILURE_RECEIPTS.has(error))
      || readSafeFrozenObservedAnchorTrackerCheckCampaignBindingFailureV7(error)
        !== undefined
      || (error instanceof Error && WORKER_PHASE_FAILURES.has(error))
    ) {
      throw error;
    }
    throw createPhaseFailure(phase, error);
  }
}

function projectSuccessReceipt(
  rootReceipt: Awaited<ReturnType<
    typeof runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11
  >>['receipt'],
  requestSha256Hex: string,
  pegIn: Readonly<PegInV11>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV11
> {
  const legacyV10Receipt =
    projectLegacyWorkerReceiptV10(
      rootReceipt.legacyV10Receipt,
      requestSha256Hex,
      pegIn,
    );
  assertClassificationBinding(
    rootReceipt.responseClassification,
    legacyV10Receipt.transport,
    rootReceipt.responseClassification.classificationDigestHex,
  );
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V11_SCHEMA,
    version: 11 as const,
    status: 'local_tracker_transport_canonically_confirmed' as const,
    requestSha256Hex,
    pegIn,
    rootReceiptDigestHex: rootReceipt.receiptDigestHex,
    rootResponseClassificationDigestHex:
      rootReceipt.responseClassification.classificationDigestHex,
    staticProjectionManifestDigestHex:
      rootReceipt.staticProjectionManifestDigestHex,
    legacyV10Receipt,
    responseClassification: rootReceipt.responseClassification,
    checks: CHECKS,
    boundaries: Object.freeze({
      ...COMMON_BOUNDARIES,
      canonicalConfirmationObserved: true as const,
      trackerAdmissionEstablished: true as const,
    }),
  };
  return finalizeReceipt(body, RECEIPT_DIGEST_DOMAIN);
}

function createWorkerFailure(
  rootFailure: NonNullable<ReturnType<
    typeof projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV11
  >>,
  requestSha256Hex: string,
  pegIn: Readonly<PegInV11>,
  cause: unknown,
): Error {
  const legacyV10Receipt =
    projectLegacyWorkerFailureReceiptV10(
      rootFailure.legacyV10Receipt,
      requestSha256Hex,
      pegIn,
    );
  assertClassificationBinding(
    rootFailure.responseClassification,
    legacyV10Receipt.transport.outcome,
    rootFailure.responseClassification.classificationDigestHex,
  );
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V11_SCHEMA,
    version: 11 as const,
    status: 'local_tracker_transport_not_canonically_confirmed' as const,
    requestSha256Hex,
    pegIn,
    rootFailureReceiptDigestHex: rootFailure.receiptDigestHex,
    rootResponseClassificationDigestHex:
      rootFailure.responseClassification.classificationDigestHex,
    staticProjectionManifestDigestHex:
      rootFailure.staticProjectionManifestDigestHex,
    legacyV10Receipt,
    responseClassification: rootFailure.responseClassification,
    checks: CHECKS,
    boundaries: Object.freeze({
      ...COMMON_BOUNDARIES,
      exactNodeAcceptanceObserved:
        rootFailure.boundaries.exactNodeAcceptanceObserved,
      canonicalConfirmationObserved: false as const,
      trackerAdmissionEstablished: false as const,
    }),
  };
  const receipt = finalizeReceipt(body, FAILURE_RECEIPT_DIGEST_DOMAIN);
  const failure = new Error(WORKER_FAILURE_PREFIX, { cause });
  WORKER_FAILURE_RECEIPTS.set(failure, receipt);
  return failure;
}

function projectLegacyWorkerReceiptV10(
  rootReceipt: Awaited<ReturnType<
    typeof runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11
  >>['receipt']['legacyV10Receipt'],
  requestSha256Hex: string,
  pegIn: Readonly<PegInV11>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV10
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
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V10_SCHEMA,
    version: 10 as const,
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
  return finalizeReceipt(body, LEGACY_RECEIPT_DIGEST_DOMAIN_V10);
}

function projectLegacyWorkerFailureReceiptV10(
  rootFailure: NonNullable<ReturnType<
    typeof projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV11
  >>['legacyV10Receipt'],
  requestSha256Hex: string,
  pegIn: Readonly<PegInV11>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV10
> {
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V10_SCHEMA,
    version: 10 as const,
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
  return finalizeReceipt(body, LEGACY_FAILURE_RECEIPT_DIGEST_DOMAIN_V10);
}

export function formatSafeTrackerTransportCampaignWorkerFailureV11(
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
  const checkedSubmissionFailure =
    projectSubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureV1(
      error,
    );
  if (
    isKnownSubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureCodeV1(
      checkedSubmissionFailure,
    )
  ) {
    return `${WORKER_FAILURE_PREFIX}: checked submission failed: ${checkedSubmissionFailure}\n`;
  }
  if (error instanceof Error) {
    const phase = WORKER_PHASE_FAILURES.get(error);
    if (phase !== undefined) {
      return `${WORKER_FAILURE_PREFIX}: phase failed: ${phase}\n`;
    }
  }
  return `${WORKER_FAILURE_PREFIX}\n`;
}

export function parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV11(
  stdout: string,
  expectedRequestSha256Hex: string,
  expectedPegIn: Readonly<PegInV11>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV11
> {
  const receipt = parseCanonicalReceipt(stdout, [
    'boundaries',
    'checks',
    'legacyV10Receipt',
    'pegIn',
    'receiptDigestHex',
    'requestSha256Hex',
    'responseClassification',
    'rootReceiptDigestHex',
    'rootResponseClassificationDigestHex',
    'schema',
    'staticProjectionManifestDigestHex',
    'status',
    'version',
  ], 'tracker transport worker V11 receipt');
  assertIdentity(
    receipt,
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V11_SCHEMA,
    'local_tracker_transport_canonically_confirmed',
    expectedRequestSha256Hex,
    expectedPegIn,
  );
  const legacyV10Receipt =
    parseEmbeddedLegacyWorkerReceiptV10(
      receipt.legacyV10Receipt,
      expectedRequestSha256Hex,
      expectedPegIn,
    );
  assertClassificationBinding(
    receipt.responseClassification,
    legacyV10Receipt.transport,
    receipt.rootResponseClassificationDigestHex,
  );
  fixedHex(receipt.rootReceiptDigestHex, 32, 'root V11 receipt digest');
  assertStaticProjectionDigest(receipt.staticProjectionManifestDigestHex);
  assertChecks(receipt.checks);
  assertBoundaries(receipt.boundaries, true, undefined);
  assertReceiptDigest(receipt, RECEIPT_DIGEST_DOMAIN, 'worker V11 receipt');
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  return deepFreeze(receipt) as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV11
  >;
}

export function parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV11(
  stdout: string,
  expectedRequestSha256Hex: string,
  expectedPegIn: Readonly<PegInV11>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV11
> {
  const receipt = parseCanonicalReceipt(stdout, [
    'boundaries',
    'checks',
    'legacyV10Receipt',
    'pegIn',
    'receiptDigestHex',
    'requestSha256Hex',
    'responseClassification',
    'rootFailureReceiptDigestHex',
    'rootResponseClassificationDigestHex',
    'schema',
    'staticProjectionManifestDigestHex',
    'status',
    'version',
  ], 'tracker transport worker V11 failure receipt');
  assertIdentity(
    receipt,
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V11_SCHEMA,
    'local_tracker_transport_not_canonically_confirmed',
    expectedRequestSha256Hex,
    expectedPegIn,
  );
  const legacyV10Receipt =
    parseEmbeddedLegacyWorkerFailureReceiptV10(
      receipt.legacyV10Receipt,
      expectedRequestSha256Hex,
      expectedPegIn,
    );
  assertClassificationBinding(
    receipt.responseClassification,
    legacyV10Receipt.transport.outcome,
    receipt.rootResponseClassificationDigestHex,
  );
  fixedHex(
    receipt.rootFailureReceiptDigestHex,
    32,
    'root V11 failure receipt digest',
  );
  assertStaticProjectionDigest(receipt.staticProjectionManifestDigestHex);
  assertChecks(receipt.checks);
  assertBoundaries(
    receipt.boundaries,
    false,
    legacyV10Receipt.boundaries.exactNodeAcceptanceObserved,
  );
  assertReceiptDigest(
    receipt,
    FAILURE_RECEIPT_DIGEST_DOMAIN,
    'worker V11 failure receipt',
  );
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  return deepFreeze(receipt) as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV11
  >;
}

function parseEmbeddedLegacyWorkerReceiptV10(
  value: unknown,
  expectedRequestSha256Hex: string,
  expectedPegIn: Readonly<PegInV11>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV10
> {
  fixedHex(expectedRequestSha256Hex, 32, 'expected request digest');
  assertPegIn(expectedPegIn, 'expected peg-in');
  const receipt = exactRecord(value, [
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
  ], 'embedded legacy V10 worker receipt');
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V10_SCHEMA
    || receipt.version !== 10
    || receipt.status !== 'local_tracker_transport_canonically_confirmed'
    || receipt.requestSha256Hex !== expectedRequestSha256Hex
    || receipt.staticExecutionManifestDigestHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V10
  ) {
    throw new Error('embedded legacy V10 worker identity changed');
  }
  assertPegIn(receipt.pegIn, 'embedded legacy V10 worker peg-in');
  if (
    receipt.pegIn.amountNanoErg !== expectedPegIn.amountNanoErg
    || receipt.pegIn.recipientAddressHex
      !== expectedPegIn.recipientAddressHex
  ) {
    throw new Error('embedded legacy V10 worker peg-in changed');
  }
  fixedHex(receipt.rootReceiptDigestHex, 32, 'legacy V10 root receipt digest');
  fixedHex(
    receipt.freshnessReceiptDigestHex,
    32,
    'legacy V10 freshness receipt digest',
  );

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
  ], 'embedded legacy V10 worker transport');
  const expectedTransactionIdHex = fixedHex(
    transport.expectedTransactionIdHex,
    32,
    'legacy V10 tracker transport transaction ID',
  );
  const transportStatus = transport.status;
  if (
    (transportStatus !== 'accepted' && transportStatus !== 'ambiguous')
    || (
      transportStatus === 'accepted'
        ? fixedHex(
          transport.submittedTransactionIdHex,
          32,
          'legacy V10 submitted tracker transaction ID',
        ) !== expectedTransactionIdHex
        : transport.submittedTransactionIdHex !== null
    )
    || !Number.isSafeInteger(transport.confirmations)
    || Number(transport.confirmations)
      < SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS
    || !Number.isSafeInteger(transport.confirmationHeight)
    || Number(transport.confirmationHeight) < 1
  ) {
    throw new Error('embedded legacy V10 worker confirmation changed');
  }
  for (const [field, label] of [
    [transport.authorizationDigestHex, 'legacy V10 transport authorization digest'],
    [transport.durableAttemptDigestHex, 'legacy V10 transport attempt digest'],
    [transport.outcomeDigestHex, 'legacy V10 transport outcome digest'],
    [transport.responseDigestHex, 'legacy V10 transport response digest'],
    [transport.confirmationHeaderIdHex, 'legacy V10 confirmation header ID'],
    [transport.confirmationObservationDigestHex, 'legacy V10 confirmation observation digest'],
  ] as const) {
    fixedHex(field, 32, label);
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
    'embedded legacy V10 worker boundaries',
  );
  for (const [key, expected] of Object.entries(expectedBoundaries)) {
    if (boundaries[key] !== expected) {
      throw new Error('embedded legacy V10 worker boundary changed');
    }
  }
  assertReceiptDigest(
    receipt,
    LEGACY_RECEIPT_DIGEST_DOMAIN_V10,
    'embedded legacy V10 worker receipt',
  );
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  return deepFreeze(receipt) as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV10
  >;
}

function parseEmbeddedLegacyWorkerFailureReceiptV10(
  value: unknown,
  expectedRequestSha256Hex: string,
  expectedPegIn: Readonly<PegInV11>,
): Readonly<
  SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV10
> {
  fixedHex(expectedRequestSha256Hex, 32, 'expected request digest');
  assertPegIn(expectedPegIn, 'expected peg-in');
  const receipt = exactRecord(value, [
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
  ], 'embedded legacy V10 worker failure receipt');
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V10_SCHEMA
    || receipt.version !== 10
    || receipt.status !== 'local_tracker_transport_not_canonically_confirmed'
    || receipt.requestSha256Hex !== expectedRequestSha256Hex
    || receipt.staticExecutionManifestDigestHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V10
  ) {
    throw new Error('embedded legacy V10 worker failure identity changed');
  }
  assertPegIn(receipt.pegIn, 'embedded legacy V10 worker failure peg-in');
  if (
    receipt.pegIn.amountNanoErg !== expectedPegIn.amountNanoErg
    || receipt.pegIn.recipientAddressHex !== expectedPegIn.recipientAddressHex
  ) {
    throw new Error('embedded legacy V10 worker failure peg-in changed');
  }
  const rootFailureReceiptDigestHex = fixedHex(
    receipt.rootFailureReceiptDigestHex,
    32,
    'legacy V10 root failure receipt digest',
  );
  const transport = exactRecord(receipt.transport, [
    'attempt',
    'authorization',
    'outcome',
  ], 'embedded legacy V10 worker failure transport');
  const authorization = exactRecord(transport.authorization, [
    'authorizationDigestHex',
    'executionTargetIdentityDigestHex',
    'expectedTransactionIdHex',
  ], 'embedded legacy V10 worker failure authorization');
  const attempt = exactRecord(transport.attempt, [
    'durableAttemptDigestHex',
    'expectedTransactionIdHex',
  ], 'embedded legacy V10 worker failure attempt');
  const outcome = exactRecord(transport.outcome, [
    'durableAttemptDigestHex',
    'expectedTransactionIdHex',
    'outcomeDigestHex',
    'responseDigestHex',
    'status',
    'submittedTransactionIdHex',
  ], 'embedded legacy V10 worker failure outcome');
  const transactionIdHex = fixedHex(
    attempt.expectedTransactionIdHex,
    32,
    'legacy V10 attempted tracker transaction ID',
  );
  const durableAttemptDigestHex = fixedHex(
    attempt.durableAttemptDigestHex,
    32,
    'legacy V10 durable attempt digest',
  );
  if (
    fixedHex(
      authorization.expectedTransactionIdHex,
      32,
      'legacy V10 authorization transaction ID',
    ) !== transactionIdHex
    || fixedHex(
      outcome.expectedTransactionIdHex,
      32,
      'legacy V10 outcome transaction ID',
    ) !== transactionIdHex
    || fixedHex(
      outcome.durableAttemptDigestHex,
      32,
      'legacy V10 outcome durable attempt digest',
    ) !== durableAttemptDigestHex
    || !['accepted', 'ambiguous'].includes(String(outcome.status))
    || (
      outcome.status === 'accepted'
        ? outcome.submittedTransactionIdHex !== transactionIdHex
        : outcome.submittedTransactionIdHex !== null
    )
  ) {
    throw new Error('embedded legacy V10 worker failure binding changed');
  }
  fixedHex(
    authorization.authorizationDigestHex,
    32,
    'legacy V10 authorization digest',
  );
  fixedHex(
    authorization.executionTargetIdentityDigestHex,
    32,
    'legacy V10 authorization target identity digest',
  );
  fixedHex(outcome.outcomeDigestHex, 32, 'legacy V10 outcome digest');
  fixedHex(outcome.responseDigestHex, 32, 'legacy V10 response digest');

  const confirmation = exactRecord(receipt.confirmation, [
    'category',
    'confirmationBudgetMs',
    'executionTargetIdentityDigestHex',
    'expectedTransactionIdHex',
    'lastObservation',
    'observationCount',
    'schema',
    'version',
  ], 'embedded legacy V10 worker failure confirmation diagnostic');
  const confirmationExecutionTargetIdentityDigestHex =
    confirmation.executionTargetIdentityDigestHex === null
      ? null
      : fixedHex(
          confirmation.executionTargetIdentityDigestHex,
          32,
          'legacy V10 confirmation target identity digest',
        );
  if (
    confirmation.schema
      !== TRACKER_CANONICAL_CONFIRMATION_FAILURE_DIAGNOSTIC_V1_SCHEMA
    || confirmation.version !== 1
    || !TRACKER_CANONICAL_CONFIRMATION_FAILURE_CATEGORIES_V1.includes(
      String(confirmation.category) as
        typeof TRACKER_CANONICAL_CONFIRMATION_FAILURE_CATEGORIES_V1[number],
    )
    || confirmation.expectedTransactionIdHex !== transactionIdHex
    || (confirmation.category === 'confirmation_phase_failure'
      ? confirmationExecutionTargetIdentityDigestHex !== null
      : confirmationExecutionTargetIdentityDigestHex === null)
    || confirmation.confirmationBudgetMs
      !== TRACKER_CANONICAL_CONFIRMATION_BUDGET_MS_V1
    || !Number.isSafeInteger(confirmation.observationCount)
    || Number(confirmation.observationCount) < 0
  ) {
    throw new Error('embedded legacy V10 worker failure confirmation changed');
  }
  const lastObservation = confirmation.lastObservation === null
    ? null
    : exactRecord(confirmation.lastObservation, [
        'confirmations',
        'observationDigestHex',
        'observedAtHeight',
        'status',
      ], 'embedded legacy V10 worker failure last confirmation observation');
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
      throw new Error(
        'embedded legacy V10 worker failure observation changed',
      );
    }
    fixedHex(
      lastObservation.observationDigestHex,
      32,
      'legacy V10 confirmation observation digest',
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
      'embedded legacy V10 worker failure confirmation category changed',
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
  ], 'embedded legacy V10 worker failure boundaries');
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
      throw new Error('embedded legacy V10 worker failure boundary changed');
    }
  }
  const rootFailureBody = {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-failure.v10',
    version: 10,
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
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_RECEIPT_DIGEST_DOMAIN_V10,
    )
  ) {
    throw new Error('embedded legacy V10 root failure digest changed');
  }
  assertReceiptDigest(
    receipt,
    LEGACY_FAILURE_RECEIPT_DIGEST_DOMAIN_V10,
    'embedded legacy V10 worker failure receipt',
  );
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  return deepFreeze(receipt) as unknown as Readonly<
    SubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV10
  >;
}

function assertIdentity(
  receipt: Record<string, unknown>,
  expectedSchema: string,
  expectedStatus: string,
  expectedRequestSha256Hex: string,
  expectedPegIn: Readonly<PegInV11>,
): void {
  fixedHex(expectedRequestSha256Hex, 32, 'expected request digest');
  assertPegIn(expectedPegIn, 'expected peg-in');
  if (
    receipt.schema !== expectedSchema
    || receipt.version !== 11
    || receipt.status !== expectedStatus
    || receipt.requestSha256Hex !== expectedRequestSha256Hex
  ) {
    throw new Error('tracker transport worker V11 identity changed');
  }
  assertPegIn(receipt.pegIn, 'tracker transport worker V11 peg-in');
  if (
    receipt.pegIn.amountNanoErg !== expectedPegIn.amountNanoErg
    || receipt.pegIn.recipientAddressHex
      !== expectedPegIn.recipientAddressHex
  ) {
    throw new Error('tracker transport worker V11 peg-in changed');
  }
}

function assertClassificationBinding(
  value: unknown,
  outcome: Readonly<{
    readonly status: 'accepted' | 'ambiguous';
    readonly responseDigestHex: string;
  }>,
  expectedRootClassificationDigestHex: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1
> {
  assertSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1(
    value,
  );
  if (
    fixedHex(
      expectedRootClassificationDigestHex,
      32,
      'root response classification digest',
    ) !== value.classificationDigestHex
    ||
    value.status !== outcome.status
    || value.responseDigestHex !== outcome.responseDigestHex
  ) {
    throw new Error('tracker transport worker V11 classification binding changed');
  }
}

function assertChecks(value: unknown): void {
  const checks = exactRecord(value, Object.keys(CHECKS), 'worker V11 checks');
  for (const [key, expected] of Object.entries(CHECKS)) {
    if (checks[key] !== expected) {
      throw new Error('tracker transport worker V11 check changed');
    }
  }
}

function assertBoundaries(
  value: unknown,
  confirmed: boolean,
  exactNodeAcceptanceObserved: boolean | undefined,
): void {
  const expected = {
    ...COMMON_BOUNDARIES,
    ...(exactNodeAcceptanceObserved === undefined
      ? {}
      : { exactNodeAcceptanceObserved }),
    canonicalConfirmationObserved: confirmed,
    trackerAdmissionEstablished: confirmed,
  };
  const boundaries = exactRecord(
    value,
    Object.keys(expected),
    'worker V11 boundaries',
  );
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (boundaries[key] !== expectedValue) {
      throw new Error('tracker transport worker V11 boundary changed');
    }
  }
}

function assertStaticProjectionDigest(value: unknown): void {
  if (
    value
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_PROJECTION_MANIFEST_DIGEST_V11
  ) {
    throw new Error('tracker transport worker V11 projection identity changed');
  }
}

function assertReceiptDigest(
  receipt: Record<string, unknown>,
  domain: string,
  label: string,
): void {
  const { receiptDigestHex, ...body } = receipt;
  if (
    fixedHex(receiptDigestHex, 32, `${label} digest`)
      !== sha256CanonicalJson(body, domain)
  ) {
    throw new Error(`${label} digest changed`);
  }
}

function parseCanonicalReceipt(
  stdout: string,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  assertNoDuplicateJsonKeys(stdout);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`${label} is not JSON`);
  }
  if (`${canonicalJson(parsed)}\n` !== stdout) {
    throw new Error(`${label} is not canonical JSON plus one LF`);
  }
  return exactRecord(parsed, keys, label);
}

function finalizeReceipt<T extends Record<string, unknown>>(
  body: T,
  domain: string,
): Readonly<T & { readonly receiptDigestHex: string }> {
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, domain),
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  return receipt;
}

function createPhaseFailure(
  phase: SubstrateFederatedIsolatedDevnetTrackerTransportWorkerPhaseV11,
  cause: unknown,
): Error {
  if (!isKnownSubstrateFederatedIsolatedDevnetTrackerTransportWorkerPhaseV11(
    phase,
  )) {
    throw new Error('tracker transport worker V11 phase is invalid');
  }
  const failure = cause instanceof Error
    ? cause
    : new Error('isolated tracker transport campaign worker phase failed');
  WORKER_PHASE_FAILURES.set(failure, phase);
  return failure;
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
    throw new Error(
      'isolated tracker transport campaign worker V11 arguments are invalid',
    );
  }
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

function assertPegIn(
  value: unknown,
  label: string,
): asserts value is Readonly<PegInV11> {
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
    await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV11(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(receipt)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(error => {
    process.stderr.write(
      formatSafeTrackerTransportCampaignWorkerFailureV11(error),
    );
    process.exitCode = 1;
  });
}
