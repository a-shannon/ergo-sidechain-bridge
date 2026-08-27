import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
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

const mocked = vi.hoisted(() => ({
  environment: vi.fn(),
  process: vi.fn(),
}));

vi.mock(
  '../pinned-local-native-verifier-build.js',
  async importOriginal => {
    const original = await importOriginal<Record<string, unknown>>();
    return { ...original, runBoundedProcess: mocked.process };
  },
);

vi.mock(
  './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js',
  async importOriginal => {
    const original = await importOriginal<Record<string, unknown>>();
    return { ...original, childEnvironment: mocked.environment };
  },
);

import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_RECEIPT_DIGEST_DOMAIN_V9,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V9,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  BoundedProcessExitError,
} from '../pinned-local-native-verifier-build.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS,
} from '../relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V9_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V9_SCHEMA,
} from './run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-worker-v9.js';
import {
  formatSafeTrackerTransportCampaignCommandFailureV9,
  parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandReceiptV9,
  runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV9,
} from './run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-v9.js';

const WORKER_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V9';
const WORKER_FAILURE_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V9';
const EXPECTED_TRANSACTION_ID = '11'.repeat(32);
const ROOT_RECEIPT_DIGEST = '22'.repeat(32);
const FRESHNESS_RECEIPT_DIGEST = '33'.repeat(32);
const AUTHORIZATION_DIGEST = '44'.repeat(32);
const EXECUTION_TARGET_IDENTITY_DIGEST = '45'.repeat(32);
const ATTEMPT_DIGEST = '55'.repeat(32);
const OUTCOME_DIGEST = '66'.repeat(32);
const RESPONSE_DIGEST = '77'.repeat(32);
const CONFIRMATION_HEADER_ID = '88'.repeat(32);
const CONFIRMATION_OBSERVATION_DIGEST = '99'.repeat(32);
const RECIPIENT_ADDRESS_HEX = 'ab'.repeat(20);
const AMOUNT_NANO_ERG = '15000000';

describe('isolated tracker transport campaign command V9', () => {
  let root: string;
  let requestPath: string;
  let outputPath: string;
  let temporaryRoot: string;
  let frontierCargoRoot: string;
  let relayerCargoRoot: string;
  let journalRoot: string;
  let requestDigest: string;

  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), 'e2s-tracker-command-v9-'));
    requestPath = join(root, 'request.json');
    outputPath = join(root, 'receipt.json');
    temporaryRoot = directory(root, 'frontier-temporary');
    frontierCargoRoot = directory(root, 'frontier-cargo');
    relayerCargoRoot = directory(root, 'relayer-cargo');
    journalRoot = directory(root, 'tracker-journal');
    const requestBytes = Buffer.from('{"request":"canonical"}\n', 'utf8');
    writeFileSync(requestPath, requestBytes);
    requestDigest = createHash('sha256').update(requestBytes).digest('hex');
    mocked.environment.mockReturnValue(Object.freeze({
      PATH: process.env.PATH,
      CARGO_HOME: relayerCargoRoot,
    }));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('publishes one request-bound canonical-confirmation receipt', async () => {
    const workerReceipt = successWorkerReceipt(requestDigest);
    mocked.process.mockResolvedValue({
      pid: 1234,
      exitCode: 0,
      stdout: `${canonicalJson(workerReceipt)}\n`,
      stderr: '',
    });

    const result =
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV9(
        argumentsFor(),
      );

    expect(mocked.process).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status:
        'isolated_peg_in_tracker_transport_canonically_confirmed_receipt_published',
      canonicalConfirmationObserved: true,
    });
    const processInput = mocked.process.mock.calls[0]?.[0];
    expect(processInput.args).toEqual(expect.arrayContaining([
      '--expected-request-sha256',
      requestDigest,
      '--tracker-transport-journal-root',
      journalRoot,
    ]));
    expect(processInput.timeoutMs).toBe(150 * 60_000);
    expect(mocked.environment).toHaveBeenCalledWith(
      expect.any(String),
      { cargoHomeDirectory: relayerCargoRoot },
    );

    const published = readFileSync(outputPath, 'utf8');
    const receipt =
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandReceiptV9(
        published,
        result.receiptDigestHex,
        requestDigest,
        pegIn(),
      );
    expect(receipt.boundaries).toMatchObject({
      oneTransportAttemptRecorded: true,
      transportOutcomePersisted: true,
      canonicalConfirmationObserved: true,
      trackerAdmissionEstablished: true,
      retryAuthorized: false,
      gate5Closed: false,
    });
    expect(published).not.toContain(root);
    expect(published).not.toContain('signedTransactionBytes');
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV9(
        argumentsFor(),
      ),
    ).rejects.toThrow(/output reservation/iu);
  });

  it('publishes a terminal non-confirmation receipt and never converts it to admission', async () => {
    const workerReceipt = failureWorkerReceipt(requestDigest);
    mocked.process.mockRejectedValue(new BoundedProcessExitError({
      label: 'isolated tracker worker',
      exitCode: 1,
      stdout: '',
      stderr: `${canonicalJson(workerReceipt)}\n`,
    }));

    const result =
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV9(
        argumentsFor(),
      );

    expect(mocked.process).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status:
        'isolated_peg_in_tracker_transport_not_canonically_confirmed_receipt_published',
      canonicalConfirmationObserved: false,
    });
    const receipt =
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandReceiptV9(
        readFileSync(outputPath, 'utf8'),
        result.receiptDigestHex,
        requestDigest,
        pegIn(),
      );
    expect(receipt.boundaries).toMatchObject({
      oneTransportAttemptRecorded: true,
      transportOutcomePersisted: true,
      canonicalConfirmationObserved: false,
      trackerAdmissionEstablished: false,
      retryAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    });
  });

  it('rejects untyped worker diagnostics without publishing them', async () => {
    const privateDiagnostic = `private failure under ${root}`;
    mocked.process.mockRejectedValue(new BoundedProcessExitError({
      label: 'isolated tracker worker',
      exitCode: 1,
      stdout: '',
      stderr: `${privateDiagnostic}\n`,
    }));

    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV9(
        argumentsFor(),
      );
    } catch (error) {
      failure = error;
    }
    const safe = formatSafeTrackerTransportCampaignCommandFailureV9(failure);
    expect(safe).toBe(
      'isolated peg-in tracker transport campaign failed: command phase failed: worker receipt\n',
    );
    expect(safe).not.toContain(privateDiagnostic);
    expect(() => readFileSync(outputPath, 'utf8')).toThrow();
  });

  it('relays only allowlisted worker phases without publishing a receipt', async () => {
    mocked.process.mockRejectedValue(new BoundedProcessExitError({
      label: 'isolated tracker worker',
      exitCode: 1,
      stdout: '',
      stderr:
        'isolated tracker transport campaign worker failed: phase failed: campaign root\n',
    }));

    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV9(
        argumentsFor(),
      );
    } catch (error) {
      failure = error;
    }

    expect(formatSafeTrackerTransportCampaignCommandFailureV9(failure)).toBe(
      'isolated peg-in tracker transport campaign failed: untrusted worker phase hint: campaign root\n',
    );
    expect(() => readFileSync(outputPath, 'utf8')).toThrow();
  });

  it('relays only allowlisted worker bindings without publishing a receipt', async () => {
    mocked.process.mockRejectedValue(new BoundedProcessExitError({
      label: 'isolated tracker worker',
      exitCode: 1,
      stdout: '',
      stderr:
        'isolated tracker transport campaign worker failed: producer-to-consumer binding changed: tracker candidate input\n',
    }));

    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV9(
        argumentsFor(),
      );
    } catch (error) {
      failure = error;
    }

    expect(formatSafeTrackerTransportCampaignCommandFailureV9(failure)).toBe(
      'isolated peg-in tracker transport campaign failed: untrusted worker binding hint: tracker candidate input\n',
    );
    expect(() => readFileSync(outputPath, 'utf8')).toThrow();
  });

  it('rejects unknown or multiline worker phase diagnostics as opaque', async () => {
    for (const diagnostic of [
      'isolated tracker transport campaign worker failed: phase failed: private phase\n',
      'isolated tracker transport campaign worker failed: producer-to-consumer binding changed: private binding\n',
      'private prelude\nisolated tracker transport campaign worker failed: phase failed: campaign root\n',
    ]) {
      mocked.process.mockRejectedValueOnce(new BoundedProcessExitError({
        label: 'isolated tracker worker',
        exitCode: 1,
        stdout: '',
        stderr: diagnostic,
      }));

      let failure: unknown;
      try {
        await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV9(
          argumentsFor(),
        );
      } catch (error) {
        failure = error;
      }

      expect(formatSafeTrackerTransportCampaignCommandFailureV9(failure)).toBe(
        'isolated peg-in tracker transport campaign failed: command phase failed: worker receipt\n',
      );
    }
    expect(() => readFileSync(outputPath, 'utf8')).toThrow();
  });

  it('fails closed on process loss without publishing or retrying', async () => {
    mocked.process.mockRejectedValueOnce(new Error(`process lost under ${root}`));

    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV9(
        argumentsFor(),
      );
    } catch (error) {
      failure = error;
    }

    expect(mocked.process).toHaveBeenCalledOnce();
    expect(formatSafeTrackerTransportCampaignCommandFailureV9(failure)).toBe(
      'isolated peg-in tracker transport campaign failed: command phase failed: worker launch\n',
    );
    expect(() => readFileSync(outputPath, 'utf8')).toThrow();
  });

  it('attributes a nonzero worker exit with stdout to receipt validation', async () => {
    const privateOutput = `private stdout under ${root}`;
    mocked.process.mockRejectedValueOnce(new BoundedProcessExitError({
      label: 'isolated tracker worker',
      exitCode: 1,
      stdout: privateOutput,
      stderr: '',
    }));

    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV9(
        argumentsFor(),
      );
    } catch (error) {
      failure = error;
    }

    const safe = formatSafeTrackerTransportCampaignCommandFailureV9(failure);
    expect(safe).toBe(
      'isolated peg-in tracker transport campaign failed: command phase failed: worker receipt\n',
    );
    expect(safe).not.toContain(privateOutput);
    expect(() => readFileSync(outputPath, 'utf8')).toThrow();
  });

  it('rejects overlapping external roots before launching a worker', async () => {
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV9(
        argumentsFor({ frontierCargoRoot: temporaryRoot }),
      ),
    ).rejects.toThrow(/external roots/iu);
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it('rejects an output placed inside a mutable runtime root', async () => {
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV9(
        argumentsFor({ outputPath: join(journalRoot, 'receipt.json') }),
      ),
    ).rejects.toThrow(/output reservation/iu);
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it('rejects mutated command boundaries even with a recomputed digest', async () => {
    const workerReceipt = successWorkerReceipt(requestDigest);
    mocked.process.mockResolvedValue({
      pid: 1234,
      exitCode: 0,
      stdout: `${canonicalJson(workerReceipt)}\n`,
      stderr: '',
    });
    const result =
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV9(
        argumentsFor(),
      );
    const published = JSON.parse(readFileSync(outputPath, 'utf8'));
    delete published.receiptDigestHex;
    published.boundaries.retryAuthorized = true;
    published.receiptDigestHex = sha256CanonicalJson(
      published,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_COMMAND_RECEIPT_V9',
    );
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandReceiptV9(
        `${canonicalJson(published)}\n`,
        published.receiptDigestHex,
        requestDigest,
        pegIn(),
      )).toThrow(/command boundaries changed/iu);
    expect(result.canonicalConfirmationObserved).toBe(true);
  });

  it('registers the explicit local tracker transport command', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    );
    expect(
      packageJson.scripts[
        'federated:isolated:peg-in-tracker-transport:execute-local'
      ],
    ).toBe(
      'npm run node:guard && tsx src/scripts/run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-v9.ts',
    );
  });

  function argumentsFor(overrides: Readonly<{
    frontierCargoRoot?: string;
    outputPath?: string;
  }> = {}): string[] {
    return [
      '--request',
      requestPath,
      '--amount-nano-erg',
      AMOUNT_NANO_ERG,
      '--recipient-address-hex',
      RECIPIENT_ADDRESS_HEX,
      '--frontier-temporary-root',
      temporaryRoot,
      '--frontier-cargo-cache',
      overrides.frontierCargoRoot ?? frontierCargoRoot,
      '--relayer-cargo-cache',
      relayerCargoRoot,
      '--tracker-transport-journal-root',
      journalRoot,
      '--output',
      overrides.outputPath ?? outputPath,
    ];
  }
});

function directory(root: string, name: string): string {
  const value = join(root, name);
  mkdirSync(value);
  return value;
}

function pegIn() {
  return Object.freeze({
    amountNanoErg: AMOUNT_NANO_ERG,
    recipientAddressHex: RECIPIENT_ADDRESS_HEX,
  });
}

function successWorkerReceipt(requestSha256Hex: string) {
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V9_SCHEMA,
    version: 9 as const,
    status: 'local_tracker_transport_canonically_confirmed' as const,
    requestSha256Hex,
    pegIn: pegIn(),
    rootReceiptDigestHex: ROOT_RECEIPT_DIGEST,
    freshnessReceiptDigestHex: FRESHNESS_RECEIPT_DIGEST,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V9,
    transport: {
      status: 'accepted' as const,
      expectedTransactionIdHex: EXPECTED_TRANSACTION_ID,
      submittedTransactionIdHex: EXPECTED_TRANSACTION_ID,
      authorizationDigestHex: AUTHORIZATION_DIGEST,
      durableAttemptDigestHex: ATTEMPT_DIGEST,
      outcomeDigestHex: OUTCOME_DIGEST,
      responseDigestHex: RESPONSE_DIGEST,
      confirmations: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_CONFIRMATIONS,
      confirmationHeight: 144,
      confirmationHeaderIdHex: CONFIRMATION_HEADER_ID,
      confirmationObservationDigestHex: CONFIRMATION_OBSERVATION_DIGEST,
    },
    boundaries: {
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
    },
  };
  return {
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      WORKER_RECEIPT_DIGEST_DOMAIN,
    ),
  };
}

function failureWorkerReceipt(requestSha256Hex: string) {
  const transport = {
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
      status: 'ambiguous' as const,
      expectedTransactionIdHex: EXPECTED_TRANSACTION_ID,
      submittedTransactionIdHex: null,
      durableAttemptDigestHex: ATTEMPT_DIGEST,
      outcomeDigestHex: OUTCOME_DIGEST,
      responseDigestHex: RESPONSE_DIGEST,
    },
  };
  const confirmation = {
    schema:
      'e2s.substrate-federated-isolated-devnet-tracker-canonical-confirmation-failure-diagnostic.v1' as const,
    version: 1 as const,
    category: 'confirmation_phase_failure' as const,
    expectedTransactionIdHex: EXPECTED_TRANSACTION_ID,
    executionTargetIdentityDigestHex: EXECUTION_TARGET_IDENTITY_DIGEST,
    confirmationBudgetMs: 120_000,
    observationCount: 0,
    lastObservation: null,
  };
  const boundaries = {
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
  };
  const rootFailureBody = {
    schema:
      'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-failure.v9' as const,
    version: 9 as const,
    status: 'local_tracker_transport_not_canonically_confirmed' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V9,
    transport,
    confirmation,
    boundaries,
  };
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V9_SCHEMA,
    version: 9 as const,
    status: 'local_tracker_transport_not_canonically_confirmed' as const,
    requestSha256Hex,
    pegIn: pegIn(),
    rootFailureReceiptDigestHex: sha256CanonicalJson(
      rootFailureBody,
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_RECEIPT_DIGEST_DOMAIN_V9,
    ),
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V9,
    transport,
    confirmation,
    boundaries,
  };
  return {
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      WORKER_FAILURE_RECEIPT_DIGEST_DOMAIN,
    ),
  };
}
