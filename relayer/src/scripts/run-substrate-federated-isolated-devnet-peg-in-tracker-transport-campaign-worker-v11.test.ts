import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1,
} from '../adapters/substrate-federated-isolated-devnet-tracker-transport-response-v1.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1,
} from '../substrate-federated-isolated-devnet-frontier-lab-application-v1.js';

const mocks = vi.hoisted(() => ({
  assertRootReceipt: vi.fn(),
  loadRequest: vi.fn(),
  projectCheckedSubmissionFailure: vi.fn(),
  projectManagedPhase: vi.fn(),
  projectRootFailure: vi.fn(),
  resolveDirectory: vi.fn(),
  runRoot: vi.fn(),
}));

const V10_MANIFEST_DIGEST = '44'.repeat(32);
const V11_PROJECTION_DIGEST = '45'.repeat(32);

vi.mock(
  '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV10Provenance:
      vi.fn(),
    assertSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11Provenance:
      mocks.assertRootReceipt,
    projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV10:
      vi.fn(),
    projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV11:
      mocks.projectRootFailure,
    runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV10:
      vi.fn(),
    runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV11:
      mocks.runRoot,
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_RECEIPT_DIGEST_DOMAIN_V10:
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_V10',
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V10:
      '44'.repeat(32),
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_PROJECTION_MANIFEST_DIGEST_V11:
      '45'.repeat(32),
  }),
);

vi.mock(
  '../relayer-core/substrate-federated-isolated-devnet-tracker-transport-managed-phase-v9.js',
  () => ({
    isKnownSubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureCodeV1:
      () => false,
    projectSubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureV1:
      mocks.projectCheckedSubmissionFailure,
    projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9:
      mocks.projectManagedPhase,
  }),
);

vi.mock(
  './run-substrate-federated-isolated-devnet-bootstrap-worker-v1.js',
  () => ({
    loadCanonicalBootstrapRequestBoundWithProvenanceV1: mocks.loadRequest,
  }),
);

vi.mock(
  './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js',
  () => ({
    explicitExistingLocalNonSensitivePath: mocks.resolveDirectory,
  }),
);

import {
  formatSafeTrackerTransportCampaignWorkerFailureV11,
  parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV11,
  parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV11,
  runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV11,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V11_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V11_SCHEMA,
} from './run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-worker-v11.js';
import {
  parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV10,
  parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV10,
} from './run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-worker-v10.js';

const REQUEST_DIGEST = '11'.repeat(32);
const ROOT_V10_RECEIPT_DIGEST = '22'.repeat(32);
const ROOT_V11_RECEIPT_DIGEST = '23'.repeat(32);
const FRESHNESS_RECEIPT_DIGEST = '33'.repeat(32);
const EXPECTED_TRANSACTION_ID = '55'.repeat(32);
const AUTHORIZATION_DIGEST = '66'.repeat(32);
const EXECUTION_TARGET_IDENTITY_DIGEST = '67'.repeat(32);
const ATTEMPT_DIGEST = '77'.repeat(32);
const OUTCOME_DIGEST = '88'.repeat(32);
const RESPONSE_DIGEST = '99'.repeat(32);
const CONFIRMATION_HEADER_ID = 'aa'.repeat(32);
const CONFIRMATION_OBSERVATION_DIGEST = 'bb'.repeat(32);
const RECIPIENT =
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1.slice(2);
const PEG_IN = Object.freeze({
  amountNanoErg: '15000000',
  recipientAddressHex: RECIPIENT,
});
const REQUEST_BINDING = Object.freeze({
  schema:
    'e2s.substrate-federated-isolated-devnet-bootstrap-request-binding.v1',
  version: 1 as const,
  requestSha256Hex: REQUEST_DIGEST,
});
const WORKER_RECEIPT_DIGEST_DOMAIN_V11 =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V11';
const WORKER_FAILURE_RECEIPT_DIGEST_DOMAIN_V11 =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V11';
const ROOT_FAILURE_RECEIPT_DIGEST_DOMAIN_V10 =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_V10';

describe('isolated tracker transport campaign worker V11', () => {
  let root: string;
  let temporaryRoot: string;
  let frontierCargoRoot: string;
  let journalRoot: string;
  let relayerCargoRoot: string;
  let previousCargoHome: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), 'e2s-tracker-worker-v11-'));
    temporaryRoot = directory(root, 'frontier-temporary');
    frontierCargoRoot = directory(root, 'frontier-cargo');
    journalRoot = directory(root, 'tracker-journal');
    relayerCargoRoot = directory(root, 'relayer-cargo');
    previousCargoHome = process.env.CARGO_HOME;
    process.env.CARGO_HOME = relayerCargoRoot;
    mocks.projectCheckedSubmissionFailure.mockReturnValue(null);
    mocks.projectManagedPhase.mockReturnValue(null);
    mocks.projectRootFailure.mockReturnValue(null);
    mocks.resolveDirectory.mockImplementation((value: string) =>
      realpathSync(value));
    mocks.loadRequest.mockReturnValue({
      input: {
        lifecycle: {
          sourceHistory: {
            acceptance: {
              frontierSourcePath: 'C:\\external\\frontier',
              cargoExecutablePath: 'C:\\tools\\cargo.exe',
              rustcExecutablePath: 'C:\\tools\\rustc.exe',
              gitExecutablePath: 'C:\\tools\\git.exe',
              bridgeOwnerAddress:
                SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_LAB_OWNER_ADDRESS_V1,
            },
          },
        },
      },
      requestBinding: REQUEST_BINDING,
    });
    mocks.runRoot.mockResolvedValue(successRootV11Fixture());
  });

  afterEach(() => {
    if (previousCargoHome === undefined) {
      delete process.env.CARGO_HOME;
    } else {
      process.env.CARGO_HOME = previousCargoHome;
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('projects one V11 root invocation with exact V10 compatibility and no authority', async () => {
    const receipt =
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV11(
        argumentsFor(root, temporaryRoot, frontierCargoRoot, journalRoot),
      );

    expect(mocks.runRoot).toHaveBeenCalledOnce();
    expect(mocks.runRoot).toHaveBeenCalledWith(expect.objectContaining({
      requestBinding: REQUEST_BINDING,
      trackerTransportJournalRoot: realpathSync(journalRoot),
      pegIn: PEG_IN,
    }));
    expect(mocks.assertRootReceipt).toHaveBeenCalledOnce();
    expect(receipt).toMatchObject({
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V11_SCHEMA,
      version: 11,
      status: 'local_tracker_transport_canonically_confirmed',
      requestSha256Hex: REQUEST_DIGEST,
      rootReceiptDigestHex: ROOT_V11_RECEIPT_DIGEST,
      staticProjectionManifestDigestHex: V11_PROJECTION_DIGEST,
      legacyV10Receipt: {
        version: 10,
        status: 'local_tracker_transport_canonically_confirmed',
        rootReceiptDigestHex: ROOT_V10_RECEIPT_DIGEST,
      },
      responseClassification: {
        status: 'accepted',
        responseCategory: 'accepted',
        httpStatus: 200,
        responseDigestHex: RESPONSE_DIGEST,
      },
      checks: {
        exactRootV11ProvenanceValidatedAtProjection: true,
        exactLegacyV10WorkerProjectionEmbedded: true,
        serializedReceiptCarriesRuntimeProvenance: false,
      },
      boundaries: {
        oneTransportAttemptRecorded: true,
        responseClassificationPersistedInTransportJournal: false,
        responseClassificationRestartRecoverableFromTransportJournal: false,
        serializedResponseClassificationCarriesRuntimeProvenance: false,
        responseClassificationAuthoritativeForAdmission: false,
        canonicalConfirmationObserved: true,
        trackerAdmissionEstablished: true,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
      },
    });
    const output = `${canonicalJson(receipt)}\n`;
    expect(
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV11(
        output,
        REQUEST_DIGEST,
        PEG_IN,
      ),
    ).toEqual(receipt);
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV10(
        output,
        REQUEST_DIGEST,
        PEG_IN,
      )
    ).toThrow();
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV11(
        `${canonicalJson(receipt.legacyV10Receipt)}\n`,
        REQUEST_DIGEST,
        PEG_IN,
      )
    ).toThrow();
    expect(output).not.toContain('C:\\external');
    expect(output).not.toContain('signedTransaction');
  });

  it('rejects classification, legacy V10, and serialized-provenance drift', async () => {
    const receipt =
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV11(
        argumentsFor(root, temporaryRoot, frontierCargoRoot, journalRoot),
      );
    const parse = (output: string) =>
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV11(
        output,
        REQUEST_DIGEST,
        PEG_IN,
      );

    expect(() => parse(mutatedOuterReceipt(
      receipt,
      WORKER_RECEIPT_DIGEST_DOMAIN_V11,
      value => {
        value.responseClassification.classificationDigestHex = '00'.repeat(32);
      },
    ))).toThrow(/classification changed/iu);
    expect(() => parse(mutatedOuterReceipt(
      receipt,
      WORKER_RECEIPT_DIGEST_DOMAIN_V11,
      value => {
        value.responseClassification =
          createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1({
            status: 'ambiguous',
            responseCategory: 'ambiguous_no_response',
            httpStatus: null,
            responseDigestHex: RESPONSE_DIGEST,
          });
      },
    ))).toThrow(/classification binding/iu);
    expect(() => parse(mutatedOuterReceipt(
      receipt,
      WORKER_RECEIPT_DIGEST_DOMAIN_V11,
      value => {
        value.responseClassification =
          createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1({
            status: 'accepted',
            responseCategory: 'accepted',
            httpStatus: 201,
            responseDigestHex: RESPONSE_DIGEST,
          });
      },
    ))).toThrow(/classification binding/iu);
    expect(() => parse(mutatedOuterReceipt(
      receipt,
      WORKER_RECEIPT_DIGEST_DOMAIN_V11,
      value => {
        value.responseClassification =
          createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1({
            status: 'accepted',
            responseCategory: 'accepted',
            httpStatus: 200,
            responseDigestHex: 'ab'.repeat(32),
          });
      },
    ))).toThrow(/classification binding/iu);
    expect(() => parse(mutatedOuterReceipt(
      receipt,
      WORKER_RECEIPT_DIGEST_DOMAIN_V11,
      value => {
        value.boundaries.serializedResponseClassificationCarriesRuntimeProvenance =
          true;
      },
    ))).toThrow(/boundary changed/iu);
    expect(() => parse(mutatedOuterReceipt(
      receipt,
      WORKER_RECEIPT_DIGEST_DOMAIN_V11,
      value => {
        value.legacyV10Receipt.status = 'changed';
      },
    ))).toThrow(/identity changed|digest changed/iu);
    expect(() => parse(mutatedOuterReceipt(
      receipt,
      WORKER_RECEIPT_DIGEST_DOMAIN_V11,
      value => { value.unknown = true; },
    ))).toThrow(/unknown or missing fields/iu);
  });

  it('emits a bounded V11 failure receipt for one durable attempt without retry authority', async () => {
    const privateFailure = new Error(`private diagnostic under ${root}`);
    const rootFailure = failureRootV11Fixture();
    mocks.runRoot.mockRejectedValueOnce(privateFailure);
    mocks.projectRootFailure.mockImplementation((value: unknown) =>
      value === privateFailure ? rootFailure : null);

    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV11(
        argumentsFor(root, temporaryRoot, frontierCargoRoot, journalRoot),
      );
    } catch (error) {
      failure = error;
    }
    const output = formatSafeTrackerTransportCampaignWorkerFailureV11(failure);
    const receipt =
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV11(
        output,
        REQUEST_DIGEST,
        PEG_IN,
      );

    expect(mocks.runRoot).toHaveBeenCalledOnce();
    expect(receipt).toMatchObject({
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V11_SCHEMA,
      version: 11,
      status: 'local_tracker_transport_not_canonically_confirmed',
      rootFailureReceiptDigestHex: rootFailure.receiptDigestHex,
      legacyV10Receipt: {
        version: 10,
        transport: {
          attempt: { durableAttemptDigestHex: ATTEMPT_DIGEST },
          outcome: {
            status: 'ambiguous',
            responseDigestHex: RESPONSE_DIGEST,
          },
        },
        boundaries: {
          oneTransportAttemptRecorded: true,
          transportOutcomePersisted: true,
          trackerAdmissionEstablished: false,
        },
      },
      responseClassification: {
        status: 'ambiguous',
        responseCategory: 'ambiguous_no_response',
        httpStatus: null,
      },
      boundaries: {
        oneTransportAttemptRecorded: true,
        exactNodeAcceptanceObserved: false,
        canonicalConfirmationObserved: false,
        trackerAdmissionEstablished: false,
        responseClassificationAuthoritativeForAdmission: false,
        fundsAuthorityEstablished: false,
      },
    });
    expect(output).not.toContain(root);
    expect(output).not.toContain('private diagnostic');
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV10(
        output,
        REQUEST_DIGEST,
        PEG_IN,
      )
    ).toThrow();
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV11(
        `${canonicalJson(receipt.legacyV10Receipt)}\n`,
        REQUEST_DIGEST,
        PEG_IN,
      )
    ).toThrow();
  });

  it('rejects failure status/category and response-digest drift even when redigested', async () => {
    const privateFailure = new Error('private');
    const rootFailure = failureRootV11Fixture();
    mocks.runRoot.mockRejectedValueOnce(privateFailure);
    mocks.projectRootFailure.mockImplementation((value: unknown) =>
      value === privateFailure ? rootFailure : null);
    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV11(
        argumentsFor(root, temporaryRoot, frontierCargoRoot, journalRoot),
      );
    } catch (error) {
      failure = error;
    }
    const receipt = JSON.parse(
      formatSafeTrackerTransportCampaignWorkerFailureV11(failure),
    ) as Record<string, unknown>;
    const parse = (output: string) =>
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV11(
        output,
        REQUEST_DIGEST,
        PEG_IN,
      );

    expect(() => parse(mutatedOuterReceipt(
      receipt,
      WORKER_FAILURE_RECEIPT_DIGEST_DOMAIN_V11,
      value => {
        value.responseClassification =
          createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1({
            status: 'ambiguous',
            responseCategory: 'ambiguous_http_response',
            httpStatus: 503,
            responseDigestHex: 'ab'.repeat(32),
          });
      },
    ))).toThrow(/classification binding/iu);
    expect(() => parse(mutatedOuterReceipt(
      receipt,
      WORKER_FAILURE_RECEIPT_DIGEST_DOMAIN_V11,
      value => {
        value.responseClassification =
          createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1({
            status: 'accepted',
            responseCategory: 'accepted',
            httpStatus: 200,
            responseDigestHex: RESPONSE_DIGEST,
          });
      },
    ))).toThrow(/classification binding/iu);
    expect(() => parse(mutatedOuterReceipt(
      receipt,
      WORKER_FAILURE_RECEIPT_DIGEST_DOMAIN_V11,
      value => {
        value.responseClassification =
          createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1({
            status: 'ambiguous',
            responseCategory: 'ambiguous_http_response',
            httpStatus: 503,
            responseDigestHex: RESPONSE_DIGEST,
          });
      },
    ))).toThrow(/classification binding/iu);
  });

  it('does not publish or retry when no V11 failure projection exists', async () => {
    const privateFailure = new Error(`private diagnostic under ${root}`);
    mocks.runRoot.mockRejectedValueOnce(privateFailure);
    mocks.projectRootFailure.mockReturnValue(null);

    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV11(
        argumentsFor(root, temporaryRoot, frontierCargoRoot, journalRoot),
      );
    } catch (error) {
      failure = error;
    }

    expect(mocks.runRoot).toHaveBeenCalledOnce();
    const output = formatSafeTrackerTransportCampaignWorkerFailureV11(failure);
    expect(output).toBe(
      'isolated tracker transport campaign worker V11 failed: phase failed: campaign root\n',
    );
    expect(output).not.toContain('failure-receipt.v10');
    expect(output).not.toContain('failure-receipt.v11');
    expect(output).not.toContain(root);
  });

  it.each([
    'peg-in committed-vault operational signing',
    'peg-in committed-vault operational check',
    'peg-in committed-vault pre-transport revalidation',
    'peg-in committed-vault broadcast authorization',
    'peg-in committed-vault durable reservation',
    'peg-in committed-vault checked submission',
    'peg-in committed-vault outcome persistence',
    'peg-in committed-vault execution result validation',
    'peg-in committed-vault pre-transport observation',
  ] as const)(
    'projects managed phase %s without relaying the root cause',
    async workerPhase => {
      const privateDiagnostic = `private ${workerPhase} under ${root}`;
      const rootFailure = new Error(privateDiagnostic);
      mocks.runRoot.mockRejectedValueOnce(rootFailure);
      mocks.projectManagedPhase.mockImplementation((value: unknown) =>
        value === rootFailure ? workerPhase : null);

      let failure: unknown;
      try {
        await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV11(
          argumentsFor(root, temporaryRoot, frontierCargoRoot, journalRoot),
        );
      } catch (error) {
        failure = error;
      }

      const output = formatSafeTrackerTransportCampaignWorkerFailureV11(failure);
      expect(output).toBe(
        `isolated tracker transport campaign worker V11 failed: phase failed: ${workerPhase}\n`,
      );
      expect(output).not.toContain(privateDiagnostic);
      expect(output).not.toContain(root);
    },
  );

  it('fails before root execution for malformed arguments and keeps diagnostics opaque', async () => {
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV11(
        [],
      ),
    ).rejects.toThrow(/arguments are invalid/iu);
    expect(mocks.runRoot).not.toHaveBeenCalled();
    expect(formatSafeTrackerTransportCampaignWorkerFailureV11(
      new Error('private diagnostic'),
    )).toBe('isolated tracker transport campaign worker V11 failed\n');
  });
});

function successRootV11Fixture(): Record<string, unknown> {
  const legacyV10Receipt = successRootV10Fixture();
  return {
    receipt: {
      schema:
        'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-root.v11',
      version: 11,
      status: 'local_tracker_transport_canonically_confirmed',
      staticProjectionManifestDigestHex: V11_PROJECTION_DIGEST,
      legacyV10Receipt,
      responseClassification:
        createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1({
          status: 'accepted',
          responseCategory: 'accepted',
          httpStatus: 200,
          responseDigestHex: RESPONSE_DIGEST,
        }),
      receiptDigestHex: ROOT_V11_RECEIPT_DIGEST,
    },
  };
}

function successRootV10Fixture(): Record<string, unknown> {
  return {
    receiptDigestHex: ROOT_V10_RECEIPT_DIGEST,
    freshness: { receiptDigestHex: FRESHNESS_RECEIPT_DIGEST },
    staticExecutionManifestDigestHex: V10_MANIFEST_DIGEST,
    transport: {
      execution: {
        executionTargetIdentityDigestHex: EXECUTION_TARGET_IDENTITY_DIGEST,
      },
      authorization: {
        expectedTransactionIdHex: EXPECTED_TRANSACTION_ID,
        executionTargetIdentityDigestHex: EXECUTION_TARGET_IDENTITY_DIGEST,
        authorizationDigestHex: AUTHORIZATION_DIGEST,
      },
      attempt: { expectedTransactionIdHex: EXPECTED_TRANSACTION_ID },
      outcome: {
        status: 'accepted',
        expectedTransactionIdHex: EXPECTED_TRANSACTION_ID,
        submittedTransactionIdHex: EXPECTED_TRANSACTION_ID,
        durableAttemptDigestHex: ATTEMPT_DIGEST,
        outcomeDigestHex: OUTCOME_DIGEST,
        responseDigestHex: RESPONSE_DIGEST,
      },
      confirmation: {
        status: 'confirmed',
        transactionIdHex: EXPECTED_TRANSACTION_ID,
        confirmations: 10,
        confirmationHeight: 144,
        confirmationHeaderIdHex: CONFIRMATION_HEADER_ID,
        observationDigestHex: CONFIRMATION_OBSERVATION_DIGEST,
      },
      confirmationExecution: {
        confirmedTransactionIdHex: EXPECTED_TRANSACTION_ID,
        trackerTransportExecutionTargetIdentityDigestHex:
          EXECUTION_TARGET_IDENTITY_DIGEST,
      },
    },
  };
}

function failureRootV11Fixture(): Record<string, any> {
  const legacyV10Receipt = failureRootV10Fixture();
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-failure.v11',
    version: 11,
    status: 'local_tracker_transport_not_canonically_confirmed',
    staticProjectionManifestDigestHex: V11_PROJECTION_DIGEST,
    legacyV10Receipt,
    responseClassification:
      createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1({
        status: 'ambiguous',
        responseCategory: 'ambiguous_no_response',
        httpStatus: null,
        responseDigestHex: RESPONSE_DIGEST,
      }),
    boundaries: { exactNodeAcceptanceObserved: false },
    receiptDigestHex: 'cd'.repeat(32),
  };
}

function failureRootV10Fixture(): Record<string, unknown> {
  const body = {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-failure.v10',
    version: 10,
    status: 'local_tracker_transport_not_canonically_confirmed',
    staticExecutionManifestDigestHex: V10_MANIFEST_DIGEST,
    transport: {
      authorization: {
        expectedTransactionIdHex: EXPECTED_TRANSACTION_ID,
        executionTargetIdentityDigestHex: EXECUTION_TARGET_IDENTITY_DIGEST,
        authorizationDigestHex: AUTHORIZATION_DIGEST,
      },
      attempt: {
        expectedTransactionIdHex: EXPECTED_TRANSACTION_ID,
        durableAttemptDigestHex: ATTEMPT_DIGEST,
      },
      outcome: {
        status: 'ambiguous',
        expectedTransactionIdHex: EXPECTED_TRANSACTION_ID,
        submittedTransactionIdHex: null,
        durableAttemptDigestHex: ATTEMPT_DIGEST,
        outcomeDigestHex: OUTCOME_DIGEST,
        responseDigestHex: RESPONSE_DIGEST,
      },
    },
    confirmation: {
      schema:
        'e2s.substrate-federated-isolated-devnet-tracker-canonical-confirmation-failure-diagnostic.v1',
      version: 1,
      category: 'confirmation_phase_failure',
      expectedTransactionIdHex: EXPECTED_TRANSACTION_ID,
      executionTargetIdentityDigestHex: null,
      confirmationBudgetMs: 120000,
      observationCount: 0,
      lastObservation: null,
    },
    boundaries: {
      localIsolatedDevnetOnly: true,
      oneTransportAttemptRecorded: true,
      transportOutcomePersisted: true,
      exactNodeAcceptanceObserved: false,
      canonicalConfirmationObserved: false,
      trackerAdmissionEstablished: false,
      signedTrackerBytesPersisted: false,
      publicNetworkUsed: false,
      realFundsUsed: false,
      existingWalletMaterialUsed: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
  };
  return {
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      ROOT_FAILURE_RECEIPT_DIGEST_DOMAIN_V10,
    ),
  };
}

function argumentsFor(
  root: string,
  temporaryRoot: string,
  frontierCargoRoot: string,
  journalRoot: string,
): string[] {
  return [
    '--request',
    join(root, 'request.json'),
    '--expected-request-sha256',
    REQUEST_DIGEST,
    '--amount-nano-erg',
    PEG_IN.amountNanoErg,
    '--recipient-address-hex',
    PEG_IN.recipientAddressHex,
    '--frontier-temporary-root',
    temporaryRoot,
    '--frontier-cargo-cache',
    frontierCargoRoot,
    '--tracker-transport-journal-root',
    journalRoot,
  ];
}

function mutatedOuterReceipt(
  receipt: Readonly<Record<string, unknown>>,
  domain: string,
  mutate: (value: Record<string, any>) => void,
): string {
  const { receiptDigestHex: _digest, ...body } = structuredClone(
    receipt,
  ) as Record<string, any>;
  mutate(body);
  return `${canonicalJson({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, domain),
  })}\n`;
}

function directory(root: string, name: string): string {
  const value = join(root, name);
  mkdirSync(value);
  return realpathSync(value);
}
