import { createHash } from 'node:crypto';
import {
  existsSync,
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
  preflight: vi.fn(),
  process: vi.fn(),
  repositoryRoots: vi.fn(),
}));

vi.mock(
  '../bridge-repository-layout.js',
  async importOriginal => {
    const original = await importOriginal<Record<string, unknown>>();
    return {
      ...original,
      resolveBridgeRepositoryRootsFromCheckoutLayout: mocked.repositoryRoots,
    };
  },
);

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

vi.mock(
  './preflight-substrate-federated-isolated-devnet-campaign-v1.js',
  () => ({
    preflightSubstrateFederatedIsolatedDevnetCampaignFromArgumentsV1:
      mocked.preflight,
  }),
);

import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_RECEIPT_DIGEST_DOMAIN_V10,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V10,
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
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V10_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V10_SCHEMA,
} from './run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-worker-v10.js';
import {
  formatSafeTrackerTransportCampaignCommandFailureV10,
  parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandReceiptV10,
  runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10,
} from './run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-v10.js';

const WORKER_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V10';
const WORKER_FAILURE_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V10';
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
const PROTOC_EXECUTABLE_PATH = 'C:\\toolchain\\protoc.exe';
const PREFLIGHT_RECEIPT_DIGEST = 'aa'.repeat(32);
const BRIDGE_ROOT = join(process.cwd(), '..');
const WORKTREE_ROOT = existsSync(join(BRIDGE_ROOT, '.git'))
  ? BRIDGE_ROOT
  : join(BRIDGE_ROOT, '..');

describe('isolated tracker transport campaign command V10', () => {
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
    mocked.process.mockReset();
    mocked.environment.mockReset();
    mocked.repositoryRoots.mockReset().mockReturnValue(Object.freeze({
      bridgeRoot: BRIDGE_ROOT,
      worktreeRoot: WORKTREE_ROOT,
    }));
    vi.stubEnv('PROTOC', PROTOC_EXECUTABLE_PATH);
    root = mkdtempSync(join(tmpdir(), 'e2s-tracker-command-v10-'));
    requestPath = join(root, 'request.json');
    outputPath = join(root, 'receipt.json');
    temporaryRoot = directory(root, 'frontier-temporary');
    frontierCargoRoot = directory(root, 'frontier-cargo');
    relayerCargoRoot = directory(root, 'relayer-cargo');
    journalRoot = directory(root, 'tracker-journal');
    const requestBytes = Buffer.from('{"request":"canonical"}\n', 'utf8');
    writeFileSync(requestPath, requestBytes);
    requestDigest = createHash('sha256').update(requestBytes).digest('hex');
    mocked.preflight.mockReset().mockImplementation(() => {
      return preflightReceipt(requestDigest);
    });
    mocked.environment.mockReturnValue(Object.freeze({
      PATH: process.env.PATH,
      CARGO_HOME: relayerCargoRoot,
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
        argumentsFor(),
      );

    expect(mocked.process).toHaveBeenCalledOnce();
    expect(mocked.preflight.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.process.mock.invocationCallOrder[0]!,
    );
    expect(mocked.preflight).toHaveBeenCalledWith([
      '--request', requestPath,
      '--expected-request-sha256', requestDigest,
      '--amount-nano-erg', AMOUNT_NANO_ERG,
      '--recipient-address-hex', RECIPIENT_ADDRESS_HEX,
      '--frontier-temporary-root', temporaryRoot,
      '--frontier-cargo-cache', frontierCargoRoot,
      '--relayer-cargo-cache', relayerCargoRoot,
    ], expect.any(Function));
    expect(result).toMatchObject({
      status:
        'isolated_peg_in_tracker_transport_canonically_confirmed_receipt_published',
      canonicalConfirmationObserved: true,
      preflightReceiptDigestHex: PREFLIGHT_RECEIPT_DIGEST,
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
      {
        cargoHomeDirectory: relayerCargoRoot,
        protocExecutablePath: PROTOC_EXECUTABLE_PATH,
      },
    );

    const published = readFileSync(outputPath, 'utf8');
    const receipt =
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandReceiptV10(
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
      runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
        argumentsFor(),
      ),
    ).rejects.toThrow(/output reservation/iu);
  });

  it('classifies checkout discovery separately from command arguments', async () => {
    mocked.repositoryRoots.mockImplementationOnce(() => {
      throw new Error('Git is intentionally absent from PATH');
    });

    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
        argumentsFor(),
      );
    } catch (error) {
      failure = error;
    }

    expect(formatSafeTrackerTransportCampaignCommandFailureV10(failure)).toBe(
      'isolated peg-in tracker transport campaign failed: command phase failed: repository layout\n',
    );
    expect(mocked.preflight).not.toHaveBeenCalled();
    expect(mocked.process).not.toHaveBeenCalled();
    expect(() => readFileSync(outputPath, 'utf8')).toThrow();
  });

  it('rejects an absent Protobuf compiler before worker launch', async () => {
    delete process.env.PROTOC;

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
        argumentsFor(),
      ),
    ).rejects.toThrow(/worker launch/iu);
    expect(mocked.environment).not.toHaveBeenCalled();
    expect(mocked.process).not.toHaveBeenCalled();
    expect(() => readFileSync(outputPath, 'utf8')).toThrow();
  });

  it('reports the bounded preflight phase without leaking its cause', async () => {
    const privateDiagnostic = `private diagnostic under ${root}`;
    mocked.preflight.mockImplementationOnce((
      _arguments: readonly string[],
      observePhase: (phase: string) => void,
    ) => {
      observePhase('offline Frontier dependency closure');
      throw new Error(privateDiagnostic);
    });

    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
        argumentsFor(),
      );
    } catch (error) {
      failure = error;
    }

    const safe = formatSafeTrackerTransportCampaignCommandFailureV10(failure);
    expect(safe).toBe(
      'isolated peg-in tracker transport campaign failed: preflight phase failed: offline Frontier dependency closure\n',
    );
    expect(safe).not.toContain(privateDiagnostic);
    expect(safe).not.toContain(root);
    expect(mocked.process).not.toHaveBeenCalled();
    expect(() => readFileSync(outputPath, 'utf8')).toThrow();
  });

  it('rejects a preflight binding mismatch before worker launch', async () => {
    mocked.preflight.mockReturnValue({
      ...preflightReceipt(requestDigest),
      requestSha256Hex: 'bb'.repeat(32),
    });

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
        argumentsFor(),
      ),
    ).rejects.toThrow(/request-bound preflight/iu);
    expect(mocked.process).not.toHaveBeenCalled();
    expect(() => readFileSync(outputPath, 'utf8')).toThrow();
  });

  it('rejects an empty Protobuf compiler before worker launch', async () => {
    vi.stubEnv('PROTOC', '');

    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
        argumentsFor(),
      ),
    ).rejects.toThrow(/worker launch/iu);
    expect(mocked.environment).not.toHaveBeenCalled();
    expect(mocked.process).not.toHaveBeenCalled();
    expect(() => readFileSync(outputPath, 'utf8')).toThrow();
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
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
        argumentsFor(),
      );

    expect(mocked.process).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status:
        'isolated_peg_in_tracker_transport_not_canonically_confirmed_receipt_published',
      canonicalConfirmationObserved: false,
    });
    const receipt =
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandReceiptV10(
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
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
        argumentsFor(),
      );
    } catch (error) {
      failure = error;
    }
    const safe = formatSafeTrackerTransportCampaignCommandFailureV10(failure);
    expect(safe).toBe(
      'isolated peg-in tracker transport campaign failed: command phase failed: worker receipt\n',
    );
    expect(safe).not.toContain(privateDiagnostic);
    expect(() => readFileSync(outputPath, 'utf8')).toThrow();
  });

  it.each([
    'campaign root',
    'ergo node build',
    'node startup and mining',
    'source history collection',
    'ergo funding and history',
    'packet production',
    'packet input and contract binding',
    'packet tracker compilation',
    'packet settlement compilation',
    'packet relayer artifact production',
    'packet launch and portable replay',
    'setup batch construction',
    'genesis setup support construction',
    'genesis setup journal construction',
    'genesis setup execution admission',
    'genesis setup signing',
    'genesis setup candidate check',
    'genesis setup post-check revalidation',
    'genesis setup pre-transport revalidation',
    'genesis setup broadcast authorization',
    'genesis setup durable reservation',
    'genesis setup checked submission',
    'genesis setup outcome persistence',
    'genesis setup execution result validation',
    'genesis setup canonical confirmation',
    'genesis setup tracker canonical confirmation pending at deadline',
    'genesis setup duplicatePrevention canonical confirmation observer failure',
    'genesis setup pooledReserve canonical confirmation confirmation budget elapsed',
    'genesis setup durable reconciliation',
    'genesis setup confirmation acknowledgement',
    'genesis setup finalization',
    'peg-in candidate construction',
    'peg-in source-lock execution',
    'peg-in committed-vault execution',
    'peg-in committed-vault check',
    'peg-in committed-vault authorization',
    'peg-in committed-vault transport',
    'peg-in committed-vault canonical confirmation',
    'peg-in committed-vault output observation',
    'application checkpoint execution',
    'tracker candidate construction',
    'managed setup finalization',
  ] as const)(
    'relays only allowlisted worker phase %s without publishing a receipt',
    async workerPhase => {
      mocked.process.mockRejectedValue(new BoundedProcessExitError({
        label: 'isolated tracker worker',
        exitCode: 1,
        stdout: '',
        stderr:
          `isolated tracker transport campaign worker failed: phase failed: ${workerPhase}\n`,
      }));

      let failure: unknown;
      try {
        await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
          argumentsFor(),
        );
      } catch (error) {
        failure = error;
      }

      expect(formatSafeTrackerTransportCampaignCommandFailureV10(failure)).toBe(
        `isolated peg-in tracker transport campaign failed: untrusted worker phase hint: ${workerPhase}\n`,
      );
      expect(() => readFileSync(outputPath, 'utf8')).toThrow();
    },
  );

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
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
        argumentsFor(),
      );
    } catch (error) {
      failure = error;
    }

    expect(formatSafeTrackerTransportCampaignCommandFailureV10(failure)).toBe(
      'isolated peg-in tracker transport campaign failed: untrusted worker binding hint: tracker candidate input\n',
    );
    expect(() => readFileSync(outputPath, 'utf8')).toThrow();
  });

  it.each([
    'authority_binding',
    'durable_attempt_claim',
    'checked_handle_consumption',
    'preflight_consumption',
    'transport_response_projection',
    'submission_result_validation',
    'result_issuance',
  ] as const)(
    'relays only allowlisted checked-submission code %s without publishing a receipt',
    async checkedSubmissionFailureCode => {
      mocked.process.mockRejectedValue(new BoundedProcessExitError({
        label: 'isolated tracker worker',
        exitCode: 1,
        stdout: '',
        stderr:
          `isolated tracker transport campaign worker failed: checked submission failed: ${checkedSubmissionFailureCode}\n`,
      }));

      let failure: unknown;
      try {
        await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
          argumentsFor(),
        );
      } catch (error) {
        failure = error;
      }

      expect(formatSafeTrackerTransportCampaignCommandFailureV10(failure)).toBe(
        `isolated peg-in tracker transport campaign failed: untrusted worker checked-submission failure hint: ${checkedSubmissionFailureCode}\n`,
      );
      expect(() => readFileSync(outputPath, 'utf8')).toThrow();
    },
  );

  it('rejects unknown or multiline worker phase diagnostics as opaque', async () => {
    for (const diagnostic of [
      'isolated tracker transport campaign worker failed: phase failed: private phase\n',
      'isolated tracker transport campaign worker failed: producer-to-consumer binding changed: private binding\n',
      'isolated tracker transport campaign worker failed: checked submission failed: private_code\n',
      'private prelude\nisolated tracker transport campaign worker failed: checked submission failed: authority_binding\n',
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
        await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
          argumentsFor(),
        );
      } catch (error) {
        failure = error;
      }

      expect(formatSafeTrackerTransportCampaignCommandFailureV10(failure)).toBe(
        'isolated peg-in tracker transport campaign failed: command phase failed: worker receipt\n',
      );
    }
    expect(() => readFileSync(outputPath, 'utf8')).toThrow();
  });

  it('fails closed on process loss without publishing or retrying', async () => {
    mocked.process.mockRejectedValueOnce(new Error(`process lost under ${root}`));

    let failure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
        argumentsFor(),
      );
    } catch (error) {
      failure = error;
    }

    expect(mocked.process).toHaveBeenCalledOnce();
    expect(formatSafeTrackerTransportCampaignCommandFailureV10(failure)).toBe(
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
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
        argumentsFor(),
      );
    } catch (error) {
      failure = error;
    }

    const safe = formatSafeTrackerTransportCampaignCommandFailureV10(failure);
    expect(safe).toBe(
      'isolated peg-in tracker transport campaign failed: command phase failed: worker receipt\n',
    );
    expect(safe).not.toContain(privateOutput);
    expect(() => readFileSync(outputPath, 'utf8')).toThrow();
  });

  it('rejects overlapping external roots before launching a worker', async () => {
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
        argumentsFor({ frontierCargoRoot: temporaryRoot }),
      ),
    ).rejects.toThrow(/external roots/iu);
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it('rejects an output placed inside a mutable runtime root', async () => {
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
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
      await runSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandFromArgumentsV10(
        argumentsFor(),
      );
    const published = JSON.parse(readFileSync(outputPath, 'utf8'));
    delete published.receiptDigestHex;
    published.boundaries.retryAuthorized = true;
    published.receiptDigestHex = sha256CanonicalJson(
      published,
      'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_COMMAND_RECEIPT_V10',
    );
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInTrackerTransportCampaignCommandReceiptV10(
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
      'npm run node:guard && tsx src/scripts/run-substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-v10.ts',
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

function preflightReceipt(requestSha256Hex: string) {
  return Object.freeze({
    schema: 'e2s.substrate-federated-isolated-devnet-campaign-preflight.v1',
    version: 1,
    status: 'request_bound_lab_campaign_preflight_passed',
    requestSha256Hex,
    requestBindings: Object.freeze({
      expectedHeadCommitSha1Hex: '01'.repeat(20),
      expectedBaseSpecSha256Hex: '02'.repeat(32),
      expectedFrontierCommit: '03'.repeat(20),
      expectedFrontierPatchSha256Hex: '04'.repeat(32),
      expectedRuntimeCodeSha256Hex: '05'.repeat(32),
    }),
    pegIn: pegIn(),
    checks: Object.freeze({
      canonicalRequestDigestBound: true,
      pinnedGitExecutableBound: true,
      exactBridgeHeadObserved: true,
      trackedWorktreeClean: true,
      exactBaseSpecBytesBound: true,
      deterministicLabApplicationBound: true,
      distinctLoopbackSourceTopologyBound: true,
      freshArtifactDestinationBound: true,
      externalRootsDisjointAndOutsideWorktree: true,
      exactPegInPlanBound: true,
      visualStudioAndOfflineFrontierPreflightPassed: true,
      workerNodeAndCampaignLaunchAbsent: true,
    }),
    boundaries: Object.freeze({
      localPreflightOnly: true,
      sourceConsensusAuthenticated: false,
      ergoConsensusAuthenticated: false,
      targetNodeAcceptanceEstablished: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      trackerAdmissionEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
      hostileSameUserMutationResistanceEstablished: false,
    }),
    receiptDigestHex: PREFLIGHT_RECEIPT_DIGEST,
  });
}

function successWorkerReceipt(requestSha256Hex: string) {
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_RECEIPT_V10_SCHEMA,
    version: 10 as const,
    status: 'local_tracker_transport_canonically_confirmed' as const,
    requestSha256Hex,
    pegIn: pegIn(),
    rootReceiptDigestHex: ROOT_RECEIPT_DIGEST,
    freshnessReceiptDigestHex: FRESHNESS_RECEIPT_DIGEST,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V10,
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
    executionTargetIdentityDigestHex: null,
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
      'e2s.substrate-federated-isolated-devnet-peg-in-tracker-transport-campaign-failure.v10' as const,
    version: 10 as const,
    status: 'local_tracker_transport_not_canonically_confirmed' as const,
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V10,
    transport,
    confirmation,
    boundaries,
  };
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_WORKER_FAILURE_RECEIPT_V10_SCHEMA,
    version: 10 as const,
    status: 'local_tracker_transport_not_canonically_confirmed' as const,
    requestSha256Hex,
    pegIn: pegIn(),
    rootFailureReceiptDigestHex: sha256CanonicalJson(
      rootFailureBody,
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_FAILURE_RECEIPT_DIGEST_DOMAIN_V10,
    ),
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_TRACKER_TRANSPORT_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V10,
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
