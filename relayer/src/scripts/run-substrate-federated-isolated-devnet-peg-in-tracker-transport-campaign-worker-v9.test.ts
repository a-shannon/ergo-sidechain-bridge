import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS,
} from '../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';

const mocks = vi.hoisted(() => ({
  assertRootReceipt: vi.fn(),
  loadRequest: vi.fn(),
  projectRootFailure: vi.fn(),
  resolveDirectory: vi.fn(),
  runRoot: vi.fn(),
}));

vi.mock(
  '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9Provenance:
      mocks.assertRootReceipt,
    projectSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignFailureV9:
      mocks.projectRootFailure,
    runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignRootV9:
      mocks.runRoot,
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_RECEIPT_DIGEST_DOMAIN_V9:
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_V9',
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V9:
      '44'.repeat(32),
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
  formatSafeTrackerTransportCampaignWorkerFailureV9,
  parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV9,
  parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9,
  resolveCanonicalWorkerRootsV9,
  runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV9,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V9_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V9_SCHEMA,
} from './run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-worker-v9.js';

const REQUEST_DIGEST = '11'.repeat(32);
const ROOT_RECEIPT_DIGEST = '22'.repeat(32);
const FRESHNESS_RECEIPT_DIGEST = '33'.repeat(32);
const MANIFEST_DIGEST = '44'.repeat(32);
const EXPECTED_TRANSACTION_ID = '55'.repeat(32);
const AUTHORIZATION_DIGEST = '66'.repeat(32);
const EXECUTION_TARGET_IDENTITY_DIGEST = '67'.repeat(32);
const ATTEMPT_DIGEST = '77'.repeat(32);
const OUTCOME_DIGEST = '88'.repeat(32);
const RESPONSE_DIGEST = '99'.repeat(32);
const CONFIRMATION_HEADER_ID = 'aa'.repeat(32);
const CONFIRMATION_OBSERVATION_DIGEST = 'bb'.repeat(32);
const RECIPIENT = 'ab'.repeat(20);
const REQUEST_BINDING = Object.freeze({
  schema:
    'e2s.substrate-federated-isolated-devnet-bootstrap-request-binding.v1',
  version: 1 as const,
  requestSha256Hex: REQUEST_DIGEST,
});
const FAILURE_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V9';
const ROOT_FAILURE_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_V9';

describe('isolated tracker transport campaign worker V9', () => {
  let root: string;
  let temporaryRoot: string;
  let frontierCargoRoot: string;
  let journalRoot: string;
  let relayerCargoRoot: string;
  let previousCargoHome: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), 'e2s-tracker-worker-v9-'));
    temporaryRoot = directory(root, 'frontier-temporary');
    frontierCargoRoot = directory(root, 'frontier-cargo');
    journalRoot = directory(root, 'tracker-journal');
    relayerCargoRoot = directory(root, 'relayer-cargo');
    previousCargoHome = process.env.CARGO_HOME;
    process.env.CARGO_HOME = relayerCargoRoot;
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
              expectedSudoAddress: `0x${RECIPIENT}`,
            },
          },
        },
      },
      requestBinding: REQUEST_BINDING,
    });
    mocks.runRoot.mockResolvedValue({
      receipt: {
        receiptDigestHex: ROOT_RECEIPT_DIGEST,
        freshness: { receiptDigestHex: FRESHNESS_RECEIPT_DIGEST },
        staticExecutionManifestDigestHex: MANIFEST_DIGEST,
        transport: {
          execution: {
            executionTargetIdentityDigestHex:
              EXECUTION_TARGET_IDENTITY_DIGEST,
          },
          authorization: {
            expectedTransactionIdHex: EXPECTED_TRANSACTION_ID,
            executionTargetIdentityDigestHex:
              EXECUTION_TARGET_IDENTITY_DIGEST,
            authorizationDigestHex: AUTHORIZATION_DIGEST,
          },
          attempt: {
            expectedTransactionIdHex: EXPECTED_TRANSACTION_ID,
          },
          outcome: {
            status: 'accepted',
            expectedTransactionIdHex: EXPECTED_TRANSACTION_ID,
            submittedTransactionIdHex: EXPECTED_TRANSACTION_ID,
            durableAttemptDigestHex: ATTEMPT_DIGEST,
            outcomeDigestHex: OUTCOME_DIGEST,
            responseDigestHex: RESPONSE_DIGEST,
          },
          confirmation: {
            schema:
              'e2s.substrate-federated-isolated-devnet-tracker-canonical-confirmation.v1',
            version: 1,
            status: 'confirmed',
            transactionIdHex: EXPECTED_TRANSACTION_ID,
            confirmations:
              SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS,
            confirmationHeight: 144,
            observedAtHeight: 145,
            confirmationHeaderIdHex: CONFIRMATION_HEADER_ID,
            observationDigestHex: CONFIRMATION_OBSERVATION_DIGEST,
          },
          confirmationExecution: {
            confirmedTransactionIdHex: EXPECTED_TRANSACTION_ID,
            trackerTransportExecutionTargetIdentityDigestHex:
              EXECUTION_TARGET_IDENTITY_DIGEST,
          },
        },
      },
    });
  });

  afterEach(() => {
    if (previousCargoHome === undefined) {
      delete process.env.CARGO_HOME;
    } else {
      process.env.CARGO_HOME = previousCargoHome;
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('projects the exact one-attempt result without paths or capabilities', async () => {
    const receipt =
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV9(
        argumentsFor(journalRoot),
      );

    expect(mocks.runRoot).toHaveBeenCalledOnce();
    expect(mocks.runRoot).toHaveBeenCalledWith(expect.objectContaining({
      requestBinding: REQUEST_BINDING,
      trackerTransportJournalRoot: realpathSync(journalRoot),
      pegIn: {
        amountNanoErg: '15000000',
        recipientAddressHex: RECIPIENT,
      },
    }));
    expect(mocks.assertRootReceipt).toHaveBeenCalledOnce();
    expect(receipt).toMatchObject({
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V9_SCHEMA,
      version: 9,
      status: 'local_tracker_transport_canonically_confirmed',
      requestSha256Hex: REQUEST_DIGEST,
      rootReceiptDigestHex: ROOT_RECEIPT_DIGEST,
      freshnessReceiptDigestHex: FRESHNESS_RECEIPT_DIGEST,
      staticExecutionManifestDigestHex: MANIFEST_DIGEST,
      transport: {
        status: 'accepted',
        expectedTransactionIdHex: EXPECTED_TRANSACTION_ID,
        submittedTransactionIdHex: EXPECTED_TRANSACTION_ID,
        authorizationDigestHex: AUTHORIZATION_DIGEST,
        durableAttemptDigestHex: ATTEMPT_DIGEST,
        outcomeDigestHex: OUTCOME_DIGEST,
        responseDigestHex: RESPONSE_DIGEST,
        confirmations:
          SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS,
        confirmationHeight: 144,
        confirmationHeaderIdHex: CONFIRMATION_HEADER_ID,
        confirmationObservationDigestHex: CONFIRMATION_OBSERVATION_DIGEST,
      },
      boundaries: {
        oneTransportAttemptRecorded: true,
        canonicalConfirmationObserved: true,
        trackerAdmissionEstablished: true,
        signedTrackerBytesPersisted: false,
        publicNetworkUsed: false,
        gate5Closed: false,
      },
    });
    expect(receipt.receiptDigestHex).toMatch(/^[0-9a-f]{64}$/u);
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain('signedTransactionBytes');
    expect(serialized).not.toContain('trackerTransportJournalRoot');
    expect(
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV9(
        `${canonicalJson(receipt)}\n`,
        REQUEST_DIGEST,
        {
          amountNanoErg: '15000000',
          recipientAddressHex: RECIPIENT,
        },
      ),
    ).toEqual(receipt);
  });

  it('rejects malformed success bindings and noncanonical output', async () => {
    const receipt =
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV9(
        argumentsFor(journalRoot),
      );
    const mutations: Array<(value: any) => void> = [
      value => { value.transport.status = 'rejected'; },
      value => { value.transport.submittedTransactionIdHex = null; },
      value => {
        value.transport.confirmations =
          SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS - 1;
      },
      value => { value.transport.confirmationHeight = 0; },
      value => { value.transport.confirmationHeaderIdHex = 'cc'; },
      value => { value.transport.responseDigestHex = 'dd'; },
      value => { value.transport.expectedTransactionIdHex = 'ee'.repeat(32); },
      value => { value.boundaries.trackerAdmissionEstablished = false; },
      value => { value.boundaries.gate5Closed = true; },
      value => { value.unexpected = true; },
    ];
    for (const mutate of mutations) {
      const { receiptDigestHex: _receiptDigestHex, ...body } =
        structuredClone(receipt) as any;
      mutate(body);
      const malformed = {
        ...body,
        receiptDigestHex: sha256CanonicalJson(
          body,
          'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V9',
        ),
      };
      expect(() =>
        parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV9(
          `${canonicalJson(malformed)}\n`,
          REQUEST_DIGEST,
          {
            amountNanoErg: '15000000',
            recipientAddressHex: RECIPIENT,
          },
        )).toThrow();
    }
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV9(
        `${JSON.stringify(receipt, null, 2)}\n`,
        REQUEST_DIGEST,
        {
          amountNanoErg: '15000000',
          recipientAddressHex: RECIPIENT,
        },
      )).toThrow(/canonical JSON/iu);
    const canonical = `${canonicalJson(receipt)}\n`;
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerReceiptV9(
        canonical.replace('"version":9', '"version":9,"version":9'),
        REQUEST_DIGEST,
        {
          amountNanoErg: '15000000',
          recipientAddressHex: RECIPIENT,
        },
      )).toThrow(/duplicate/iu);
  });

  it('rejects transaction or target drift at the final projection boundary', async () => {
    const baseline = structuredClone(await mocks.runRoot());
    mocks.runRoot.mockClear();
    const mutations: Array<(value: any) => void> = [
      value => {
        value.receipt.transport.confirmation.transactionIdHex = 'dd'.repeat(32);
      },
      value => {
        value.receipt.transport.confirmationExecution
          .trackerTransportExecutionTargetIdentityDigestHex = 'ee'.repeat(32);
      },
    ];
    for (const mutate of mutations) {
      const malformed = structuredClone(baseline);
      mutate(malformed);
      mocks.runRoot.mockResolvedValueOnce(malformed);
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV9(
          argumentsFor(journalRoot),
        ),
      ).rejects.toThrow(/canonical confirmation/iu);
    }
  });

  it('emits only a bounded receipt for a process-proven unconfirmed transport', async () => {
    const rootFailure = new Error(`private diagnostic under ${root}`);
    const rootFailureReceipt = rootFailureReceiptFixture();
    mocks.runRoot.mockRejectedValueOnce(rootFailure);
    mocks.projectRootFailure.mockImplementation((value: unknown) =>
      value === rootFailure ? rootFailureReceipt : null);

    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV9(
        argumentsFor(journalRoot),
      );
    } catch (error) {
      failure = error;
    }
    const output = formatSafeTrackerTransportCampaignWorkerFailureV9(failure);
    const receipt = JSON.parse(output) as Record<string, unknown>;
    expect(receipt).toMatchObject({
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V9_SCHEMA,
      version: 9,
      status: 'local_tracker_transport_not_canonically_confirmed',
      requestSha256Hex: REQUEST_DIGEST,
      pegIn: {
        amountNanoErg: '15000000',
        recipientAddressHex: RECIPIENT,
      },
      rootFailureReceiptDigestHex: rootFailureReceipt.receiptDigestHex,
      staticExecutionManifestDigestHex: MANIFEST_DIGEST,
      transport: {
        authorization: {
          expectedTransactionIdHex: EXPECTED_TRANSACTION_ID,
          executionTargetIdentityDigestHex:
            EXECUTION_TARGET_IDENTITY_DIGEST,
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
        executionTargetIdentityDigestHex:
          EXECUTION_TARGET_IDENTITY_DIGEST,
        confirmationBudgetMs: 120000,
        observationCount: 0,
        lastObservation: null,
      },
      boundaries: {
        oneTransportAttemptRecorded: true,
        transportOutcomePersisted: true,
        exactNodeAcceptanceObserved: false,
        canonicalConfirmationObserved: false,
        trackerAdmissionEstablished: false,
        signedTrackerBytesPersisted: false,
        publicNetworkUsed: false,
        gate5Closed: false,
      },
    });
    expect(receipt.receiptDigestHex).toMatch(/^[0-9a-f]{64}$/u);
    expect(output).not.toContain(root);
    expect(output).not.toContain('private diagnostic');
    expect(
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9(
        output,
        REQUEST_DIGEST,
        Object.freeze({
          amountNanoErg: '15000000',
          recipientAddressHex: RECIPIENT,
        }),
      ),
    ).toEqual(receipt);
    const expectedPegIn = Object.freeze({
      amountNanoErg: '15000000',
      recipientAddressHex: RECIPIENT,
    });
    const mutants: Array<(value: Record<string, any>) => void> = [
      value => { value.unknown = true; },
      value => {
        value.transport.authorization.expectedTransactionIdHex = 'dd'.repeat(32);
      },
      value => {
        value.transport.authorization.executionTargetIdentityDigestHex =
          'dd'.repeat(32);
      },
      value => {
        value.transport.attempt.expectedTransactionIdHex = 'dd'.repeat(32);
      },
      value => {
        value.transport.outcome.durableAttemptDigestHex = 'dd'.repeat(32);
      },
      value => {
        value.transport.outcome.submittedTransactionIdHex =
          EXPECTED_TRANSACTION_ID;
      },
      value => { value.confirmation.category = 'unknown'; },
      value => {
        value.confirmation.expectedTransactionIdHex = 'dd'.repeat(32);
      },
      value => {
        value.confirmation.executionTargetIdentityDigestHex = 'dd'.repeat(32);
      },
      value => { value.confirmation.confirmationBudgetMs = 120001; },
      value => {
        value.confirmation.category = 'pending_at_deadline';
      },
      value => {
        value.confirmation.category = 'pending_at_deadline';
        value.confirmation.observationCount = 1;
        value.confirmation.lastObservation = {
          status: 'pending',
          confirmations: 0,
          observedAtHeight: 1,
          observationDigestHex: 'not-hex',
        };
      },
      value => {
        value.confirmation.category = 'pending_at_deadline';
        value.confirmation.lastObservation = {
          status: 'pending',
          confirmations: 0,
          observedAtHeight: 1,
          observationDigestHex: 'dd'.repeat(32),
        };
      },
      value => {
        value.confirmation.category = 'not_found_at_deadline';
        value.confirmation.observationCount = 1;
        value.confirmation.lastObservation = {
          status: 'not_found',
          confirmations: 1,
          observedAtHeight: 1,
          observationDigestHex: 'dd'.repeat(32),
        };
      },
      value => {
        value.confirmation.category = 'observation_completed_after_deadline';
        value.confirmation.observationCount = 1;
        value.confirmation.lastObservation = {
          status: 'pending',
          confirmations: 0,
          observedAtHeight: 1,
          observationDigestHex: 'dd'.repeat(32),
        };
      },
      value => { value.boundaries.canonicalConfirmationObserved = true; },
      value => { value.boundaries.exactNodeAcceptanceObserved = true; },
    ];
    for (const mutate of mutants) {
      expect(() =>
        parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9(
          mutatedFailureOutput(receipt, mutate),
          REQUEST_DIGEST,
          expectedPegIn,
        )
      ).toThrow();
    }
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9(
        mutatedFailureOutput(receipt, value => {
          value.confirmation.category = 'managed_deadline_elapsed';
        }),
        REQUEST_DIGEST,
        expectedPegIn,
      )
    ).toThrow(/root failure digest changed/iu);
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9(
        mutatedRootBoundFailureOutput(receipt, value => {
          value.confirmation.category = 'managed_deadline_elapsed';
          value.confirmation.observationCount = 7;
        }),
        REQUEST_DIGEST,
        expectedPegIn,
      )
    ).toThrow(/confirmation category changed/iu);
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9(
        mutatedRootBoundFailureOutput(receipt, value => {
          value.confirmation.category = 'observer_failure';
          value.confirmation.observationCount = 1;
          value.confirmation.lastObservation = {
            status: 'confirmed',
            confirmations: 10,
            observedAtHeight: 11,
            observationDigestHex: 'dd'.repeat(32),
          };
        }),
        REQUEST_DIGEST,
        expectedPegIn,
      )
    ).toThrow(/confirmation category changed/iu);
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9(
        mutatedRootBoundFailureOutput(receipt, value => {
          value.confirmation.category = 'pending_at_deadline';
          value.confirmation.observationCount = 1;
          value.confirmation.lastObservation = {
            status: 'pending',
            confirmations: 10,
            observedAtHeight: 11,
            observationDigestHex: 'dd'.repeat(32),
          };
        }),
        REQUEST_DIGEST,
        expectedPegIn,
      )
    ).toThrow(/observation changed/iu);
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9(
        output.replace('{"boundaries"', '{ "boundaries"'),
        REQUEST_DIGEST,
        expectedPegIn,
      )
    ).toThrow(/canonical JSON/iu);
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFailureReceiptV9(
        output.replace('"version":9', '"version":9,"version":9'),
        REQUEST_DIGEST,
        expectedPegIn,
      )
    ).toThrow(/duplicate/iu);
  });

  it('rejects overlapping journal and build roots before loading the request', async () => {
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV9(
        argumentsFor(temporaryRoot),
      ),
    ).rejects.toThrow(
      'tracker transport temporary, journal, and Cargo roots must not overlap',
    );
    expect(mocks.loadRequest).not.toHaveBeenCalled();
    expect(mocks.runRoot).not.toHaveBeenCalled();
  });

  it('rejects a recipient outside the reviewed LAB application before launch', async () => {
    const args = argumentsFor(journalRoot);
    args[7] = 'cd'.repeat(20);

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV9(
        args,
      ),
    ).rejects.toThrow(
      'tracker transport recipient must match the reviewed LAB owner',
    );
    expect(mocks.runRoot).not.toHaveBeenCalled();
  });

  it('rejects a journal ancestor that contains the worktree', async () => {
    const scriptDirectory = dirname(fileURLToPath(import.meta.url));
    const { worktreeRoot } = resolveCanonicalWorkerRootsV9(scriptDirectory);
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV9(
        argumentsFor(dirname(worktreeRoot)),
      ),
    ).rejects.toThrow(
      'tracker transport journal root must remain outside the worktree',
    );
    expect(mocks.loadRequest).not.toHaveBeenCalled();
    expect(mocks.runRoot).not.toHaveBeenCalled();
  });

  it('rejects malformed arguments and keeps failures opaque', async () => {
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignWorkerFromArgumentsV9([]),
    ).rejects.toThrow(
      'isolated tracker transport campaign worker arguments are invalid',
    );
    expect(formatSafeTrackerTransportCampaignWorkerFailureV9(
      new Error('secret diagnostic'),
    )).toBe('isolated tracker transport campaign worker failed\n');
  });

  function argumentsFor(selectedJournalRoot: string): string[] {
    return [
      '--request',
      join(root, 'request.json'),
      '--expected-request-sha256',
      REQUEST_DIGEST,
      '--amount-nano-erg',
      '15000000',
      '--recipient-address-hex',
      RECIPIENT,
      '--frontier-temporary-root',
      temporaryRoot,
      '--frontier-cargo-cache',
      frontierCargoRoot,
      '--tracker-transport-journal-root',
      selectedJournalRoot,
    ];
  }
});

function directory(root: string, name: string): string {
  const value = join(root, name);
  mkdirSync(value);
  return realpathSync(value);
}

function rootFailureReceiptFixture(): Record<string, any> {
  const body = {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-failure.v9',
    version: 9,
    status: 'local_tracker_transport_not_canonically_confirmed',
    staticExecutionManifestDigestHex: MANIFEST_DIGEST,
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
      executionTargetIdentityDigestHex: EXECUTION_TARGET_IDENTITY_DIGEST,
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
      ROOT_FAILURE_RECEIPT_DIGEST_DOMAIN,
    ),
  };
}

function mutatedFailureOutput(
  receipt: Record<string, unknown>,
  mutate: (value: Record<string, any>) => void,
): string {
  const { receiptDigestHex: _receiptDigestHex, ...body } = structuredClone(
    receipt,
  ) as Record<string, any>;
  mutate(body);
  return `${canonicalJson({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      FAILURE_RECEIPT_DIGEST_DOMAIN,
    ),
  })}\n`;
}

function mutatedRootBoundFailureOutput(
  receipt: Record<string, unknown>,
  mutate: (value: Record<string, any>) => void,
): string {
  const { receiptDigestHex: _receiptDigestHex, ...body } = structuredClone(
    receipt,
  ) as Record<string, any>;
  mutate(body);
  body.rootFailureReceiptDigestHex = sha256CanonicalJson({
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-failure.v9',
    version: 9,
    status: 'local_tracker_transport_not_canonically_confirmed',
    staticExecutionManifestDigestHex:
      body.staticExecutionManifestDigestHex,
    transport: body.transport,
    confirmation: body.confirmation,
    boundaries: body.boundaries,
  }, ROOT_FAILURE_RECEIPT_DIGEST_DOMAIN);
  return `${canonicalJson({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      FAILURE_RECEIPT_DIGEST_DOMAIN,
    ),
  })}\n`;
}
