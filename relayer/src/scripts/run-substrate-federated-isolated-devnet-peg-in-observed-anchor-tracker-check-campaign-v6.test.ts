import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { discoverBridgeRepositoryRoot } from '../bridge-repository-layout.js';

const CURRENT_BRIDGE_ROOT = realpathSync(resolve(process.cwd(), '..'));
const CURRENT_WORKTREE_ROOT = realpathSync(
  discoverBridgeRepositoryRoot(CURRENT_BRIDGE_ROOT),
);

const mocked = vi.hoisted(() => ({
  applicationAssert: vi.fn(),
  environment: vi.fn(),
  loader: vi.fn(),
  process: vi.fn(),
  root: vi.fn(),
}));

vi.mock(
  '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js',
  async importOriginal => {
    const original = await importOriginal<Record<string, unknown>>();
    return {
      ...original,
      runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignRootV6:
        mocked.root,
    };
  },
);
vi.mock(
  '../apps/bridge-daemon/substrate-federated-isolated-devnet-frontier-application-checkpoint-root-v3.js',
  async importOriginal => {
    const original = await importOriginal<Record<string, unknown>>();
    return {
      ...original,
      assertSubstrateFederatedIsolatedDevnetFrontierApplicationCheckpointRootReceiptV3Provenance:
        mocked.applicationAssert,
    };
  },
);
vi.mock(
  './run-substrate-federated-isolated-devnet-bootstrap-worker-v1.js',
  () => ({ loadCanonicalBootstrapRequestBoundToSha256: mocked.loader }),
);
vi.mock('../pinned-local-native-verifier-build.js', () => ({
  runBoundedProcess: mocked.process,
}));
vi.mock(
  './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js',
  async importOriginal => {
    const original = await importOriginal<Record<string, unknown>>();
    return {
      ...original,
      childEnvironment: mocked.environment,
    };
  },
);

import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V6_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V6,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
  encodePegInSourceIntentV2Hex,
} from '../peg-in-causal-admission-v2.js';
import {
  buildSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6,
  parseSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6,
} from './run-substrate-federated-isolated-devnet-peg-in-observed-anchor-tracker-check-campaign-receipt-v6.js';
import {
  parseSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandReceiptV6,
  runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandFromArgumentsV6,
} from './run-substrate-federated-isolated-devnet-peg-in-observed-anchor-tracker-check-campaign-v6.js';
import {
  formatSafeObservedAnchorTrackerCheckCampaignWorkerFailureV6,
  resolveCanonicalObservedAnchorTrackerCheckCampaignWorkerRootsV6,
  runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV6,
} from './run-substrate-federated-isolated-devnet-peg-in-observed-anchor-tracker-check-campaign-worker-v6.js';

const ROOT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V6';
const COMMAND_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V6';
const MINT_AMOUNT_NANO_ERG = '15000000';
const BURN_AMOUNT_NANO_ERG = '10000000';
const RECIPIENT_ADDRESS_HEX = '11'.repeat(20);
const REQUEST_DIGEST_HEX = 'f'.repeat(64);
const REVIEWED_TOOL_ROOT = resolve('reviewed-tool-root');
const REVIEWED_FRONTIER_SOURCE_PATH = join(REVIEWED_TOOL_ROOT, 'frontier');
const REVIEWED_CARGO_PATH = join(REVIEWED_TOOL_ROOT, 'cargo.exe');
const REVIEWED_RUSTC_PATH = join(REVIEWED_TOOL_ROOT, 'rustc.exe');
const REVIEWED_GIT_PATH = join(REVIEWED_TOOL_ROOT, 'git.exe');

describe('isolated devnet peg-in observed-anchor-tracker-check campaign command V6', () => {
  it('emits only a generic worker failure', () => {
    expect(
      formatSafeObservedAnchorTrackerCheckCampaignWorkerFailureV6(
        new Error('Frontier semantic SHA-256 changed'),
      ),
    ).toBe('isolated observed-anchor-tracker-check campaign worker failed\n');
    expect(
      formatSafeObservedAnchorTrackerCheckCampaignWorkerFailureV6(
        new Error(`failed under ${resolve('private-source')}`),
      ),
    ).toBe('isolated observed-anchor-tracker-check campaign worker failed\n');
    expect(
      formatSafeObservedAnchorTrackerCheckCampaignWorkerFailureV6(
        new Error('first line\nsecond line'),
      ),
    ).toBe('isolated observed-anchor-tracker-check campaign worker failed\n');
    expect(
      formatSafeObservedAnchorTrackerCheckCampaignWorkerFailureV6('failure'),
    ).toBe('isolated observed-anchor-tracker-check campaign worker failed\n');
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mocked.environment.mockReturnValue(Object.freeze({ PATH: 'controlled' }));
    mocked.loader.mockReturnValue(canonicalBootstrapInput());
    mocked.root.mockResolvedValue({ receipt: rootReceipt() });
  });

  it('resolves the exact application runner plan inside the worker', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'fed6lab-application-worker-'));
    try {
      const requestPath = join(fixture, 'request.json');
      const temporaryRoot = join(fixture, 'frontier-root');
      const cargoCache = join(fixture, 'frontier-cache');
      const relayerCargoCache = join(fixture, 'relayer-cache');
      mkdirSync(temporaryRoot);
      mkdirSync(cargoCache);
      mkdirSync(relayerCargoCache);
      const previousEnvironment = currentBuildEnvironment();
      const receipt =
        await withCargoHome(relayerCargoCache, async () => {
          const workerEnvironment = currentBuildEnvironment();
          mocked.root.mockImplementationOnce(async () => {
            expect(currentBuildEnvironment()).toEqual(workerEnvironment);
            return { receipt: rootReceipt() };
          });
          return runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV6([
            '--request',
            requestPath,
            '--expected-request-sha256',
            REQUEST_DIGEST_HEX,
            '--amount-nano-erg',
            MINT_AMOUNT_NANO_ERG,
            '--recipient-address-hex',
            RECIPIENT_ADDRESS_HEX,
            '--frontier-temporary-root',
            temporaryRoot,
            '--frontier-cargo-cache',
            cargoCache,
          ]);
        });

      expect(mocked.loader).toHaveBeenCalledWith(
        requestPath,
        CURRENT_BRIDGE_ROOT,
        CURRENT_WORKTREE_ROOT,
        REQUEST_DIGEST_HEX,
      );
      expect(mocked.root).toHaveBeenCalledTimes(1);
      expect(mocked.root).toHaveBeenCalledWith({
        ...canonicalBootstrapInput(),
        pegIn: pegInPlan(),
        frontierApplicationRunner: {
          frontierSourceDirectory: REVIEWED_FRONTIER_SOURCE_PATH,
          temporaryDirectoryRoot: temporaryRoot,
          cargoDependencyCacheDirectory: cargoCache,
          cargoExecutablePath: REVIEWED_CARGO_PATH,
          rustcExecutablePath: REVIEWED_RUSTC_PATH,
          gitExecutablePath: REVIEWED_GIT_PATH,
          offline: true,
        },
      });
      expect(mocked.applicationAssert).toHaveBeenCalledWith(
        rootReceipt().application.applicationCheckpoint,
      );
      expect(receipt.pegIn.amountNanoErg).toBe(MINT_AMOUNT_NANO_ERG);
      expect(receipt.application.amountNanoErg).toBe(BURN_AMOUNT_NANO_ERG);
      expect(receipt.application.burnIdHex).toBe(wireHex('19'));
      expect(receipt.checkpoint.statementIdHex).toBe('21'.repeat(32));
      expect(receipt.anchor.extensionKeyHex).toBe('0401');
      expect(receipt.trackerCandidate.inputBoxIdHex).toBe('48'.repeat(32));
      expect(receipt.trackerCheck.signedTransactionIdHex).toBe(
        receipt.trackerCheck.unsignedTransactionIdHex,
      );
      expect(receipt.boundaries.trackerSubmissionPerformed).toBe(false);
      expect(receipt.boundaries.trackerBroadcastPerformed).toBe(false);
      expect(currentBuildEnvironment()).toEqual(previousEnvironment);
      expect(canonicalJson(receipt)).not.toContain(REVIEWED_TOOL_ROOT);
      expect(canonicalJson(receipt)).not.toMatch(
        /127\.0\.0\.1|privateKey|mnemonic|signedTransactionBytesHex/iu,
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('publishes one compact request-bound receipt without runner paths', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'fed6lab-application-command-'));
    try {
      const requestPath = join(fixture, 'request.json');
      const outputPath = join(fixture, 'receipt.json');
      const temporaryRoot = join(fixture, 'frontier-root');
      const cargoCache = join(fixture, 'cargo-cache');
      const relayerCargoCache = join(fixture, 'relayer-cargo-cache');
      mkdirSync(temporaryRoot);
      mkdirSync(cargoCache);
      mkdirSync(relayerCargoCache);
      const requestBytes = Buffer.from('{"request":"canonical"}\n', 'utf8');
      writeFileSync(requestPath, requestBytes);
      const requestDigest = createHash('sha256').update(requestBytes).digest('hex');
      const workerReceipt =
        buildSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
          rootReceipt(),
          requestDigest,
          pegInPlan(),
        );
      mocked.process.mockResolvedValue({
        pid: 1234,
        exitCode: 0,
        stdout: `${canonicalJson(workerReceipt)}\n`,
        stderr: '',
      });

      const result =
        await runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandFromArgumentsV6([
          '--request',
          requestPath,
          '--amount-nano-erg',
          MINT_AMOUNT_NANO_ERG,
          '--recipient-address-hex',
          RECIPIENT_ADDRESS_HEX,
          '--frontier-temporary-root',
          temporaryRoot,
          '--frontier-cargo-cache',
          cargoCache,
          '--relayer-cargo-cache',
          relayerCargoCache,
          '--output',
          outputPath,
        ]);

      expect(result.status).toBe(
        'isolated_peg_in_observed_anchor_tracker_check_campaign_receipt_published',
      );
      const processInput = mocked.process.mock.calls[0]?.[0];
      expect(processInput.args).toEqual(expect.arrayContaining([
        '--frontier-temporary-root',
        temporaryRoot,
        '--frontier-cargo-cache',
        cargoCache,
      ]));
      expect(processInput.args).not.toContain(relayerCargoCache);
      expect(processInput.timeoutMs).toBe(120 * 60_000);
      expect(processInput.env).toEqual({ PATH: 'controlled' });
      expect(mocked.environment).toHaveBeenCalledWith(
        CURRENT_WORKTREE_ROOT,
        { cargoHomeDirectory: relayerCargoCache },
      );
      const published = readFileSync(outputPath, 'utf8');
      expect(published).toBe(`${canonicalJson(JSON.parse(published))}\n`);
      const parsed =
        parseSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandReceiptV6(
          published,
          result.receiptDigestHex,
          requestDigest,
          pegInPlan(),
        );
      expect(parsed.receiptDigestHex).toBe(result.receiptDigestHex);
      expect(parsed.executionReceipt.receiptDigestHex).toBe(
        workerReceipt.receiptDigestHex,
      );
      expect(published).not.toContain(temporaryRoot);
      expect(published).not.toContain(cargoCache);
      expect(published).not.toContain(relayerCargoCache);
      const changed = structuredClone(parsed) as any;
      changed.boundaries.trackerSubmissionPerformed = true;
      changed.receiptDigestHex = commandReceiptDigest(changed);
      expect(() =>
        parseSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandReceiptV6(
          `${canonicalJson(changed)}\n`,
          result.receiptDigestHex,
          requestDigest,
          pegInPlan(),
        )
      ).toThrow(/command receipt identity changed/iu);
      expect(() =>
        parseSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandReceiptV6(
          `${canonicalJson(changed)}\n`,
          changed.receiptDigestHex,
          requestDigest,
          pegInPlan(),
        )
      ).toThrow(/command boundaries changed/iu);
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandFromArgumentsV6([
          '--request',
          requestPath,
          '--amount-nano-erg',
          MINT_AMOUNT_NANO_ERG,
          '--recipient-address-hex',
          RECIPIENT_ADDRESS_HEX,
          '--frontier-temporary-root',
          temporaryRoot,
          '--frontier-cargo-cache',
          cargoCache,
          '--relayer-cargo-cache',
          relayerCargoCache,
          '--output',
          outputPath,
        ]),
      ).rejects.toThrow(/must not already exist/iu);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('rejects a changed application binding after the root digest is recomputed', () => {
    const changed = structuredClone(rootReceipt());
    changed.application.applicationCheckpoint.binding.burnIdHex = wireHex('aa');
    changed.receiptDigestHex = rootDigest(changed);
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
        changed,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/producer-to-consumer binding changed/iu);
  });

  it.each([
    [
      'checkpoint statement to 0x0401 anchor',
      (changed: any) => {
        changed.checkpointAnchor.mining.extensionValueHex = 'aa'.repeat(64);
      },
    ],
    [
      'confirmed tracker setup to candidate input',
      (changed: any) => {
        changed.tracker.candidate.inputBoxIdHex = 'aa'.repeat(32);
      },
    ],
    [
      'active target to tracker check',
      (changed: any) => {
        changed.tracker.check.target.processBindingDigestHex = 'aa'.repeat(32);
      },
    ],
    [
      'campaign process to anchored target',
      (changed: any) => {
        changed.process.executionTargetIdentityDigestHex = 'aa'.repeat(32);
      },
    ],
    [
      'non-persistence boundary',
      (changed: any) => {
        changed.tracker.check.boundaries.signedTransactionBytesPersisted = true;
      },
    ],
  ] as const)(
    'rejects changed %s binding after the V6 root digest is recomputed',
    (_label, mutate) => {
      const changed = structuredClone(rootReceipt());
      mutate(changed);
      changed.receiptDigestHex = rootDigest(changed);
      expect(() =>
        buildSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
          changed,
          REQUEST_DIGEST_HEX,
          pegInPlan(),
        )
      ).toThrow(/producer-to-consumer binding changed/iu);
    },
  );

  it.each([
    [
      'observed anchor to candidate',
      (changed: any) => {
        changed.trackerCandidate.anchorHeaderIdHex = 'aa'.repeat(32);
      },
    ],
    [
      'setup output to candidate input',
      (changed: any) => {
        changed.trackerSetup.outputBoxIdHex = 'aa'.repeat(32);
      },
    ],
    [
      'active target to checked target',
      (changed: any) => {
        changed.trackerCheck.processBindingDigestHex = 'aa'.repeat(32);
      },
    ],
    [
      'campaign process to anchored target',
      (changed: any) => {
        changed.execution.executionTargetIdentityDigestHex = 'aa'.repeat(32);
      },
    ],
    [
      'checkpoint admission height to statement horizon',
      (changed: any) => {
        changed.execution.checkpointAdmissionObservedAtHeight += 1;
      },
    ],
    [
      'tracker setup confirmation to anchor chronology',
      (changed: any) => {
        changed.trackerSetup.confirmationHeight = changed.anchor.anchorHeight + 1;
      },
    ],
    [
      'anchor context index to active tip height',
      (changed: any) => {
        changed.trackerObservation.anchorContextIndex = 1;
        changed.trackerCandidate.anchorContextIndex = 1;
        changed.trackerCheck.anchorContextIndex = 1;
      },
    ],
    [
      'unsigned to signed transaction',
      (changed: any) => {
        changed.trackerCheck.signedTransactionIdHex = 'aa'.repeat(32);
      },
    ],
  ] as const)(
    'rejects a recomputed compact receipt with a drifted %s binding',
    (_label, mutate) => {
      const changed: any = structuredClone(
        buildSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
          rootReceipt(),
          REQUEST_DIGEST_HEX,
          pegInPlan(),
        ),
      );
      mutate(changed);
      changed.receiptDigestHex = workerDigest(changed);
      expect(() =>
        parseSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
          `${canonicalJson(changed)}\n`,
          REQUEST_DIGEST_HEX,
          pegInPlan(),
        )
      ).toThrow(/receipt projection binding changed/iu);
    },
  );

  it.each([
    [
      'mint proof to draft',
      (changed: any) => {
        changed.application.applicationCheckpoint.mintSourceProof.sourceProof
          .mintReservationDraftDigestHex = 'aa'.repeat(32);
      },
    ],
    [
      'committed vault to fresh admission',
      (changed: any) => {
        changed.application.checkpointAdmissionObservation
          .confirmationHeaderIdHex = 'aa'.repeat(32);
      },
    ],
    [
      'fresh admission to checkpoint window',
      (changed: any) => {
        changed.application.applicationCheckpoint.checkpoint
          .checkpointAttestation.checkpointStatement
          .admissionValidFromErgoHeight = '221';
      },
    ],
    [
      'checkpoint sidechain identity to application evidence',
      (changed: any) => {
        changed.application.applicationCheckpoint.checkpoint
          .checkpointAttestation.checkpointStatement.sidechainIdHex =
            'aa'.repeat(32);
      },
    ],
    [
      'checkpoint bridge identity to application evidence',
      (changed: any) => {
        changed.application.applicationCheckpoint.checkpoint
          .checkpointAttestation.checkpointStatement.bridgeAddressHex =
            'aa'.repeat(20);
      },
    ],
    [
      'checkpoint token identity to application evidence',
      (changed: any) => {
        changed.application.applicationCheckpoint.checkpoint
          .checkpointAttestation.checkpointStatement.tokenAddressHex =
            'aa'.repeat(20);
      },
    ],
  ])('rejects changed %s binding after the root digest is recomputed', (
    _label,
    mutate,
  ) => {
    const changed = structuredClone(rootReceipt());
    mutate(changed);
    changed.receiptDigestHex = rootDigest(changed);
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
        changed,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/producer-to-consumer binding changed/iu);
  });

  it('rejects changed authority boundaries and a stale root digest', () => {
    const changedBoundary = structuredClone(rootReceipt());
    changedBoundary.boundaries.gate5Closed = true;
    changedBoundary.receiptDigestHex = rootDigest(changedBoundary);
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
        changedBoundary,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/root boundaries changed/iu);

    const stale = structuredClone(rootReceipt());
    stale.application.evidenceReceipt.receiptDigestHex = 'bb'.repeat(32);
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
        stale,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/root digest changed/iu);
  });

  it.each([
    'signedTrackerBytesPersisted',
    'deterministicSourceFinalityEstablished',
    'ergoPowAuthenticated',
    'trackerAdmissionEstablished',
    'globalReplayInsertionEstablished',
    'payoutAuthorized',
    'trackerSubmissionPerformed',
    'trackerBroadcastPerformed',
    'publicNetworkUsed',
    'realFundsUsed',
    'existingWalletMaterialUsed',
    'processLossRecoveryEstablished',
    'profileActivated',
    'mintAuthorized',
    'fundsAuthorityEstablished',
    'gate5Closed',
    'trustlessStatusEstablished',
    'productionReadinessEstablished',
  ] as const)('rejects root authority-boundary drift: %s', boundary => {
    const changed = structuredClone(rootReceipt());
    changed.boundaries[boundary] = true;
    changed.receiptDigestHex = rootDigest(changed);
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
        changed,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/root boundaries changed/iu);
  });

  it('rejects a plan that differs from the root mint statement', () => {
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
        rootReceipt(),
        REQUEST_DIGEST_HEX,
        Object.freeze({
          amountNanoErg: '15000001',
          recipientAddressHex: RECIPIENT_ADDRESS_HEX,
        }),
      )
    ).toThrow(/plan differs/iu);
  });

  it('rejects noncanonical or mutated worker output', () => {
    const receipt =
      buildSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
        rootReceipt(),
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      );
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
        `${JSON.stringify(receipt, null, 2)}\n`,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/canonical JSON/iu);

    const changed: any = structuredClone(receipt);
    changed.boundaries.gate5Closed = true;
    changed.receiptDigestHex = workerDigest(changed);
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
        `${canonicalJson(changed)}\n`,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/worker boundaries changed/iu);
  });

  it.each([
    'signedTrackerBytesPersisted',
    'deterministicSourceFinalityEstablished',
    'ergoPowAuthenticated',
    'trackerAdmissionEstablished',
    'globalReplayInsertionEstablished',
    'payoutAuthorized',
    'trackerSubmissionPerformed',
    'trackerBroadcastPerformed',
    'publicNetworkUsed',
    'realFundsUsed',
    'existingWalletMaterialUsed',
    'processLossRecoveryEstablished',
    'profileActivated',
    'mintAuthorized',
    'fundsAuthorityEstablished',
    'gate5Closed',
    'trustlessStatusEstablished',
    'productionReadinessEstablished',
  ] as const)('rejects compact authority-boundary drift: %s', boundary => {
    const changed: any = structuredClone(
      buildSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
        rootReceipt(),
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      ),
    );
    changed.boundaries[boundary] = true;
    changed.receiptDigestHex = workerDigest(changed);
    expect(() =>
      parseSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerReceiptV6(
        `${canonicalJson(changed)}\n`,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/worker boundaries changed/iu);
  });

  it('rejects invalid plans before loading a request or running the root', async () => {
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV6([
        '--request',
        'request.json',
        '--expected-request-sha256',
        REQUEST_DIGEST_HEX,
        '--amount-nano-erg',
        '0',
        '--recipient-address-hex',
        RECIPIENT_ADDRESS_HEX,
        '--frontier-temporary-root',
        'temporary',
        '--frontier-cargo-cache',
        'cache',
      ]),
    ).rejects.toThrow(/arguments are invalid/iu);
    expect(mocked.loader).not.toHaveBeenCalled();
    expect(mocked.root).not.toHaveBeenCalled();
  });

  it('rejects one directory reused as Frontier scratch and dependency cache', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'fed6lab-application-paths-'));
    try {
      const requestPath = join(fixture, 'request.json');
      const outputPath = join(fixture, 'receipt.json');
      const sharedDirectory = join(fixture, 'shared');
      const relayerCargoCache = join(fixture, 'relayer-cache');
      mkdirSync(sharedDirectory);
      mkdirSync(relayerCargoCache);
      writeFileSync(requestPath, '{"request":"canonical"}\n', 'utf8');
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandFromArgumentsV6([
          '--request',
          requestPath,
          '--amount-nano-erg',
          MINT_AMOUNT_NANO_ERG,
          '--recipient-address-hex',
          RECIPIENT_ADDRESS_HEX,
          '--frontier-temporary-root',
          sharedDirectory,
          '--frontier-cargo-cache',
          sharedDirectory,
          '--relayer-cargo-cache',
          relayerCargoCache,
          '--output',
          outputPath,
        ]),
      ).rejects.toThrow(/must differ/iu);
      expect(mocked.process).not.toHaveBeenCalled();
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it.each([
    'equal-frontier',
    'relayer-inside-frontier',
    'frontier-inside-relayer',
    'equal-temporary',
    'relayer-inside-temporary',
    'temporary-inside-relayer',
    'temporary-inside-frontier',
    'frontier-inside-temporary',
  ] as const)('rejects overlapping parent build roots: %s', async relation => {
    const fixture = mkdtempSync(join(tmpdir(), 'fed6lab-application-caches-'));
    try {
      const requestPath = join(fixture, 'request.json');
      const outputPath = join(fixture, 'receipt.json');
      let temporaryRoot = join(fixture, 'frontier-root');
      let frontierCargoCache = join(fixture, 'frontier-cache');
      let relayerCargoCache = join(fixture, 'relayer-cache');
      if (relation === 'equal-frontier') relayerCargoCache = frontierCargoCache;
      if (relation === 'relayer-inside-frontier') {
        relayerCargoCache = join(frontierCargoCache, 'relayer');
      }
      if (relation === 'frontier-inside-relayer') {
        frontierCargoCache = join(relayerCargoCache, 'frontier');
      }
      if (relation === 'equal-temporary') relayerCargoCache = temporaryRoot;
      if (relation === 'relayer-inside-temporary') {
        relayerCargoCache = join(temporaryRoot, 'relayer');
      }
      if (relation === 'temporary-inside-relayer') {
        temporaryRoot = join(relayerCargoCache, 'frontier');
      }
      if (relation === 'temporary-inside-frontier') {
        temporaryRoot = join(frontierCargoCache, 'temporary');
      }
      if (relation === 'frontier-inside-temporary') {
        frontierCargoCache = join(temporaryRoot, 'cargo');
      }
      mkdirSync(temporaryRoot, { recursive: true });
      mkdirSync(frontierCargoCache, { recursive: true });
      mkdirSync(relayerCargoCache, { recursive: true });
      writeFileSync(requestPath, '{"request":"canonical"}\n', 'utf8');
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignCommandFromArgumentsV6([
          '--request',
          requestPath,
          '--amount-nano-erg',
          MINT_AMOUNT_NANO_ERG,
          '--recipient-address-hex',
          RECIPIENT_ADDRESS_HEX,
          '--frontier-temporary-root',
          temporaryRoot,
          '--frontier-cargo-cache',
          frontierCargoCache,
          '--relayer-cargo-cache',
          relayerCargoCache,
          '--output',
          outputPath,
        ]),
      ).rejects.toThrow(/must differ/iu);
      expect(mocked.environment).not.toHaveBeenCalled();
      expect(mocked.process).not.toHaveBeenCalled();
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('rejects reused Frontier scratch and cache in the direct worker', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'fed6lab-application-worker-paths-'));
    try {
      const sharedDirectory = join(fixture, 'shared');
      mkdirSync(sharedDirectory);
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV6([
          '--request',
          join(fixture, 'request.json'),
          '--expected-request-sha256',
          REQUEST_DIGEST_HEX,
          '--amount-nano-erg',
          MINT_AMOUNT_NANO_ERG,
          '--recipient-address-hex',
          RECIPIENT_ADDRESS_HEX,
          '--frontier-temporary-root',
          sharedDirectory,
          '--frontier-cargo-cache',
          sharedDirectory,
        ]),
      ).rejects.toThrow(/must differ/iu);
      expect(mocked.loader).not.toHaveBeenCalled();
      expect(mocked.root).not.toHaveBeenCalled();
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('does not mutate the direct worker build environment after root failure', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'fed6lab-application-worker-failure-'));
    const previousEnvironment = currentBuildEnvironment();
    try {
      const temporaryRoot = join(fixture, 'frontier-root');
      const cargoCache = join(fixture, 'frontier-cache');
      const relayerCargoCache = join(fixture, 'relayer-cache');
      mkdirSync(temporaryRoot);
      mkdirSync(cargoCache);
      mkdirSync(relayerCargoCache);
      mocked.root.mockRejectedValueOnce(new Error('campaign root failed'));
      await expect(
        withCargoHome(relayerCargoCache, () =>
          runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV6([
            '--request',
            join(fixture, 'request.json'),
            '--expected-request-sha256',
            REQUEST_DIGEST_HEX,
            '--amount-nano-erg',
            MINT_AMOUNT_NANO_ERG,
            '--recipient-address-hex',
            RECIPIENT_ADDRESS_HEX,
            '--frontier-temporary-root',
            temporaryRoot,
            '--frontier-cargo-cache',
            cargoCache,
          ])),
      ).rejects.toThrow(/campaign root failed/iu);
      expect(currentBuildEnvironment()).toEqual(previousEnvironment);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('keeps overlapping direct worker roots explicit without cross-wiring process environment', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'fed6lab-application-worker-overlap-'));
    const previousEnvironment = currentBuildEnvironment();
    try {
      const firstTemporaryRoot = join(fixture, 'frontier-root-a');
      const firstCargoCache = join(fixture, 'frontier-cache-a');
      const secondTemporaryRoot = join(fixture, 'frontier-root-b');
      const secondCargoCache = join(fixture, 'frontier-cache-b');
      const relayerCargoCache = join(fixture, 'relayer-cache');
      for (const path of [
        firstTemporaryRoot,
        firstCargoCache,
        secondTemporaryRoot,
        secondCargoCache,
        relayerCargoCache,
      ]) mkdirSync(path);
      const worker = (suffix: 'a' | 'b', temporaryRoot: string, cargoCache: string) =>
        runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV6(
          [
            '--request',
            join(fixture, `request-${suffix}.json`),
            '--expected-request-sha256',
            REQUEST_DIGEST_HEX,
            '--amount-nano-erg',
            MINT_AMOUNT_NANO_ERG,
            '--recipient-address-hex',
            RECIPIENT_ADDRESS_HEX,
            '--frontier-temporary-root',
            temporaryRoot,
            '--frontier-cargo-cache',
            cargoCache,
          ],
        );
      await expect(withCargoHome(relayerCargoCache, () => Promise.all([
        worker('a', firstTemporaryRoot, firstCargoCache),
        worker('b', secondTemporaryRoot, secondCargoCache),
      ]))).resolves.toHaveLength(2);
      expect(mocked.root).toHaveBeenCalledTimes(2);
      expect(mocked.root.mock.calls.map(call => (
        call[0].frontierApplicationRunner
      ))).toEqual([
        expect.objectContaining({
            temporaryDirectoryRoot: firstTemporaryRoot,
            cargoDependencyCacheDirectory: firstCargoCache,
        }),
        expect.objectContaining({
            temporaryDirectoryRoot: secondTemporaryRoot,
            cargoDependencyCacheDirectory: secondCargoCache,
        }),
      ]);
      expect(currentBuildEnvironment()).toEqual(previousEnvironment);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it.each([
    'equal',
    'relayer-inside-frontier',
    'frontier-inside-relayer',
    'equal-temporary',
    'relayer-inside-temporary',
    'temporary-inside-relayer',
    'temporary-inside-frontier',
    'frontier-inside-temporary',
  ] as const)('rejects ambient build-root overlap in the direct worker: %s', async relation => {
    const fixture = mkdtempSync(join(tmpdir(), 'fed6lab-worker-cache-overlap-'));
    try {
      let temporaryRoot = join(fixture, 'frontier-root');
      let frontierCargoCache = join(fixture, 'frontier-cache');
      let relayerCargoCache = join(fixture, 'relayer-cache');
      if (relation === 'equal') relayerCargoCache = frontierCargoCache;
      if (relation === 'relayer-inside-frontier') {
        relayerCargoCache = join(frontierCargoCache, 'relayer');
      }
      if (relation === 'frontier-inside-relayer') {
        frontierCargoCache = join(relayerCargoCache, 'frontier');
      }
      if (relation === 'equal-temporary') relayerCargoCache = temporaryRoot;
      if (relation === 'relayer-inside-temporary') {
        relayerCargoCache = join(temporaryRoot, 'relayer');
      }
      if (relation === 'temporary-inside-relayer') {
        temporaryRoot = join(relayerCargoCache, 'frontier');
      }
      if (relation === 'temporary-inside-frontier') {
        temporaryRoot = join(frontierCargoCache, 'temporary');
      }
      if (relation === 'frontier-inside-temporary') {
        frontierCargoCache = join(temporaryRoot, 'cargo');
      }
      mkdirSync(temporaryRoot, { recursive: true });
      mkdirSync(frontierCargoCache, { recursive: true });
      mkdirSync(relayerCargoCache, { recursive: true });
      await expect(withCargoHome(relayerCargoCache, () =>
        runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV6([
          '--request',
          join(fixture, 'request.json'),
          '--expected-request-sha256',
          REQUEST_DIGEST_HEX,
          '--amount-nano-erg',
          MINT_AMOUNT_NANO_ERG,
          '--recipient-address-hex',
          RECIPIENT_ADDRESS_HEX,
          '--frontier-temporary-root',
          temporaryRoot,
          '--frontier-cargo-cache',
          frontierCargoCache,
        ]))).rejects.toThrow(/must differ and not overlap/iu);
      expect(mocked.loader).not.toHaveBeenCalled();
      expect(mocked.root).not.toHaveBeenCalled();
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('rejects an ambient direct-worker Cargo cache inside the worktree', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'fed6lab-worker-worktree-cache-'));
    try {
      const temporaryRoot = join(fixture, 'frontier-root');
      const frontierCargoCache = join(fixture, 'frontier-cache');
      mkdirSync(temporaryRoot);
      mkdirSync(frontierCargoCache);
      await expect(withCargoHome(resolve(process.cwd(), 'src'), () =>
        runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV6([
          '--request',
          join(fixture, 'request.json'),
          '--expected-request-sha256',
          REQUEST_DIGEST_HEX,
          '--amount-nano-erg',
          MINT_AMOUNT_NANO_ERG,
          '--recipient-address-hex',
          RECIPIENT_ADDRESS_HEX,
          '--frontier-temporary-root',
          temporaryRoot,
          '--frontier-cargo-cache',
          frontierCargoCache,
        ]))).rejects.toThrow(/must remain outside the worktree/iu);
      expect(mocked.loader).not.toHaveBeenCalled();
      expect(mocked.root).not.toHaveBeenCalled();
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('canonicalizes junctioned direct-worker source roots', ({ skip }) => {
    const fixture = mkdtempSync(join(tmpdir(), 'fed6lab-worker-root-link-'));
    try {
      const physicalBridgeRoot = CURRENT_BRIDGE_ROOT;
      const physicalWorktreeRoot = CURRENT_WORKTREE_ROOT;
      const bridgeAlias = join(fixture, 'bridge-alias');
      try {
        symlinkSync(physicalBridgeRoot, bridgeAlias, 'junction');
      } catch (error) {
        if (['EPERM', 'EACCES', 'UNKNOWN', 'ENOTSUP'].includes(
          (error as NodeJS.ErrnoException).code ?? '',
        )) {
          skip();
          return;
        }
        throw error;
      }
      expect(resolveCanonicalObservedAnchorTrackerCheckCampaignWorkerRootsV6(
        join(
          bridgeAlias,
          'relayer',
          'src',
          'scripts',
        ),
      )).toEqual({
        bridgeRoot: physicalBridgeRoot,
        worktreeRoot: realpathSync(physicalWorktreeRoot),
      });
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('rejects a junction alias as the ambient direct-worker Cargo cache', async ({ skip }) => {
    const fixture = mkdtempSync(join(tmpdir(), 'fed6lab-worker-cache-link-'));
    try {
      const temporaryRoot = join(fixture, 'frontier-root');
      const frontierCargoCache = join(fixture, 'frontier-cache');
      const relayerCargoCache = join(fixture, 'relayer-cache');
      const relayerCargoCacheLink = join(fixture, 'relayer-cache-link');
      mkdirSync(temporaryRoot);
      mkdirSync(frontierCargoCache);
      mkdirSync(relayerCargoCache);
      try {
        symlinkSync(relayerCargoCache, relayerCargoCacheLink, 'junction');
      } catch (error) {
        if (['EPERM', 'EACCES', 'UNKNOWN', 'ENOTSUP'].includes(
          (error as NodeJS.ErrnoException).code ?? '',
        )) {
          skip();
          return;
        }
        throw error;
      }
      await expect(withCargoHome(relayerCargoCacheLink, () =>
        runSubstrateFederatedIsolatedDevnetPegInObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV6([
          '--request',
          join(fixture, 'request.json'),
          '--expected-request-sha256',
          REQUEST_DIGEST_HEX,
          '--amount-nano-erg',
          MINT_AMOUNT_NANO_ERG,
          '--recipient-address-hex',
          RECIPIENT_ADDRESS_HEX,
          '--frontier-temporary-root',
          temporaryRoot,
          '--frontier-cargo-cache',
          frontierCargoCache,
        ]))).rejects.toThrow(/link-free/iu);
      expect(mocked.loader).not.toHaveBeenCalled();
      expect(mocked.root).not.toHaveBeenCalled();
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('registers the distinct opt-in V6 command', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    );
    expect(
      packageJson.scripts[
        'federated:isolated:peg-in-observed-anchor-tracker-check:execute-local'
      ],
    ).toBe(
      'npm run node:guard && tsx src/scripts/run-substrate-federated-isolated-devnet-peg-in-observed-anchor-tracker-check-campaign-v6.ts',
    );
  });
});

function pegInPlan() {
  return Object.freeze({
    amountNanoErg: MINT_AMOUNT_NANO_ERG,
    recipientAddressHex: RECIPIENT_ADDRESS_HEX,
  });
}

function canonicalBootstrapInput() {
  return Object.freeze({
    build: Object.freeze({ source: 'canonical-request' }),
    lifecycle: Object.freeze({
      sourceHistory: Object.freeze({
        acceptance: Object.freeze({
          frontierSourcePath: REVIEWED_FRONTIER_SOURCE_PATH,
          cargoExecutablePath: REVIEWED_CARGO_PATH,
          rustcExecutablePath: REVIEWED_RUSTC_PATH,
          gitExecutablePath: REVIEWED_GIT_PATH,
        }),
      }),
    }),
  });
}

function trackerFixture() {
  const extensionValueHex = `${'1b'.repeat(32)}${'21'.repeat(32)}`;
  const anchorHeaderIdHex = '43'.repeat(32);
  const anchorExtensionRootHex = '44'.repeat(32);
  const processBindingDigestHex = '46'.repeat(32);
  const executionTargetIdentityDigestHex = '42'.repeat(32);
  const inputBoxIdHex = '48'.repeat(32);
  const unsignedTransactionIdHex = '4c'.repeat(32);
  const signerPublicKeyHex = `02${'4d'.repeat(32)}`;
  return {
    execution: {
      extensionKeyHex: '0401',
      extensionValueHex,
      extensionFieldsSha256Hex: '40'.repeat(32),
      processBindingDigestHex,
      executionTargetIdentityDigestHex,
      primaryMiningDuringAction: true,
      witnessReadOnlyDuringAction: true,
      checkpointExtensionBoundDuringAction: true,
      trackerAdmissionMiningCredentialConsumedOnce: true,
      checkpointSnapshotRevalidatedOnBothNodes: true,
    },
    observation: {
      anchorHeaderIdHex,
      anchorHeight: 230,
      anchorContextIndex: 0,
      anchorExtensionRootHex,
      extensionValueHex,
      processBindingDigestHex,
      executionTargetIdentityDigestHex,
      observationDigestHex: '4e'.repeat(32),
      headers: Array.from({ length: 10 }, (_unused, index) => ({
        idHex: index === 0
          ? anchorHeaderIdHex
          : (50 + index).toString(16).padStart(2, '0').repeat(32),
        height: 230 - index,
      })),
      boundaries: {
        primaryAndWitnessAgreed: true,
        primaryMiningDuringObservation: true,
        checkpointBoundActiveTarget: true,
        exactCheckpointRetainedInCurrentContext: true,
        exactExtensionMembershipRecomputed: true,
        ergoPowAuthenticated: false,
        trackerAdmissionEstablished: false,
        signingPerformed: false,
        submissionPerformed: false,
        broadcastPerformed: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
      },
    },
    trackerSetup: {
      expectedTxId: '47'.repeat(32),
      outputBoxIdHex: inputBoxIdHex,
      confirmationDigestHex: '54'.repeat(32),
      confirmationHeight: 140,
      confirmationHeaderIdHex: '55'.repeat(32),
    },
    candidate: {
      schema: 'e2s.substrate-federated-v1-tracker-context',
      version: 1,
      trustModel: 'federated_non_trustless',
      contractIdHex: '49'.repeat(32),
      trackerNftIdHex: '4a'.repeat(32),
      statementIdHex: '21'.repeat(32),
      inputBoxIdHex,
      trackerKeyHex: '4b'.repeat(32),
      trackerValueHex: 'ab'.repeat(288),
      inputDigestHex: '00'.repeat(33),
      successorDigestHex: '01'.repeat(33),
      currentErgoHeight: 231,
      anchorContextIndex: 0,
      anchorHeaderIdHex,
      anchorHeaderHeight: 230,
      anchorExtensionRootHex,
      anchorContextProvenance:
        'eip0045-validity-tracker-observed-header-context',
      contextExtensionSerializedHex: '000102',
      prooflessTransactionBytes: 1_024,
      unsignedTransactionIdHex,
    },
    check: {
      status: 'PASS',
      trackerInputBoxIdHex: inputBoxIdHex,
      statementIdHex: '21'.repeat(32),
      anchorHeaderIdHex,
      anchorHeight: 230,
      anchorContextIndex: 0,
      unsignedTransactionIdHex,
      unsignedTransactionDigestHex: '4f'.repeat(32),
      signedTransactionIdHex: unsignedTransactionIdHex,
      signedTransactionCanonicalJsonSha256Hex: '50'.repeat(32),
      signedTransactionBytesSha256Hex: '51'.repeat(32),
      signedTransactionBytesLength: 2_048,
      checkResponseSha256Hex: '52'.repeat(32),
      target: {
        processBindingDigestHex,
        executionTargetIdentityDigestHex,
      },
      signer: {
        derivation: 'wasm-root',
        publicKeyHex: signerPublicKeyHex,
        p2pkErgoTreeHex: `0008cd${signerPublicKeyHex}`,
        stateContextTipHeight: 230,
        stateContextTipIdHex: anchorHeaderIdHex,
      },
      checker: {
        nodeOrigin: 'http://127.0.0.1:9051',
        path: '/transactions/check',
        method: 'POST',
        transportPolicy: 'no-redirect-no-proxy',
      },
      boundaries: {
        localIsolatedDevnetOnly: true,
        checkpointBoundActiveTarget: true,
        observedAnchorContextBound: true,
        exactTrackerInputAndTransactionBound: true,
        localWasmRootSigningPerformed: true,
        localJvmNodeCheckPassed: true,
        signedTransactionBytesPersisted: false,
        submissionAuthorityEstablished: false,
        broadcastAuthorityEstablished: false,
        trackerAdmissionEstablished: false,
        replayProtectionEstablished: false,
        payoutEstablished: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
      receiptDigestHex: '53'.repeat(32),
    },
  };
}

function rootReceipt(): any {
  const body: any = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V6_SCHEMA,
    version: 6,
    status:
      'observed_anchor_tracker_candidate_accepted_by_local_node_check',
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V6,
    build: {},
    process: {
      executionTargetIdentityDigestHex: '42'.repeat(32),
    },
    setup: {},
    pegIn: {
      committedVaultExecution: {
        expectedTxId: '02'.repeat(32),
        confirmationHeight: 140,
        confirmationHeaderIdHex: '03'.repeat(32),
        outputObservation: {
          reserveSuccessorBoxIdHex: '04'.repeat(32),
        },
      },
    },
    application: {
      draft: {
        draftDigestHex: '05'.repeat(32),
        statementIdHex: wireHex('37'),
        reservationKeyHex: wireHex('38'),
        statement: {
          sourceIntentHex: encodePegInSourceIntentV2Hex({
            formatVersion: PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
            sourceNetworkIdHex: wireHex('31'),
            sidechainIdHex: wireHex('32'),
            bridgeAddressHex: wireHex('33', 20),
            tokenAddressHex: wireHex('34', 20),
            settlementProfileIdHex: wireHex('35'),
            admissionProfileIdHex: wireHex('36'),
            sourceAssetIdHex: wireHex('00'),
            amountNanoErg: MINT_AMOUNT_NANO_ERG,
            recipientAddressHex: `0x${RECIPIENT_ADDRESS_HEX}`,
          }),
          successorReserveBoxIdHex: wireHex('04'),
        },
      },
      evidenceReceipt: {
        receiptDigestHex: '06'.repeat(32),
      },
      checkpointAdmissionObservation: {
        expectedTxId: '02'.repeat(32),
        observedAtHeight: 220,
        observationDigestHex: '07'.repeat(32),
        confirmationHeight: 140,
        confirmationHeaderIdHex: '03'.repeat(32),
      },
      applicationCheckpoint: {
        packet: {
          receipt: {
            receiptDigestHex: '08'.repeat(32),
            targetDescriptorDigestHex: '39'.repeat(32),
          },
        },
        mintSourceProof: {
          receiptDigestHex: '09'.repeat(32),
          sourceProof: {
            mintReservationDraftDigestHex: '05'.repeat(32),
            mintReservationStatementIdHex: wireHex('37'),
            mintIdentityHex: wireHex('38'),
            sourceEvidenceReceiptDigestHex: '06'.repeat(32),
          },
        },
        applicationRunner: {
          receiptDigestHex: '0a'.repeat(32),
          executionResult: {
            applicationEvidence: {
              receiptDigestHex: '0b'.repeat(32),
              application: {
                bridgeAddressHex: wireHex('17', 20),
                tokenAddressHex: wireHex('18', 20),
              },
              sourceNativeBlock: {
                height: 7,
                hashHex: wireHex('0c'),
              },
              execution: {
                blockHashHex: wireHex('0d'),
                sidechainIdHex: wireHex('32'),
              },
              burn: {
                burnIdHex: wireHex('19'),
                burnLeafHashHex: wireHex('1a'),
                bridgeEventRootHex: wireHex('1b'),
                burnLeafCount: 1,
                amountNanoErg: BURN_AMOUNT_NANO_ERG,
                recipientErgoTreeHashHex: wireHex('1c'),
              },
            },
          },
        },
        checkpoint: {
          receiptDigestHex: '1d'.repeat(32),
          checkpointAttestation: {
            attestationDigestHex: '1e'.repeat(32),
            checkpointStatement: {
              sourceNativeBlockHeight: '7',
              sourceNativeBlockHashHex: '0c'.repeat(32),
              executionBlockHashHex: '0d'.repeat(32),
              bridgeEventRootHex: '1b'.repeat(32),
              sidechainIdHex: '32'.repeat(32),
              bridgeAddressHex: '17'.repeat(20),
              tokenAddressHex: '18'.repeat(20),
              burnLeafCount: 1,
              admissionValidFromErgoHeight: '220',
              admissionExpiresAtErgoHeight: '284',
              statementIdHex: '21'.repeat(32),
            },
          },
        },
        binding: {
          targetDescriptorDigestHex: '39'.repeat(32),
          packetReceiptDigestHex: '08'.repeat(32),
          mintSourceProofReceiptDigestHex: '09'.repeat(32),
          applicationRunnerReceiptDigestHex: '0a'.repeat(32),
          checkpointReceiptDigestHex: '1d'.repeat(32),
          burnIdHex: wireHex('19'),
          bridgeEventRootHex: wireHex('1b'),
        },
      },
    },
    checkpointAnchor: {
      mining: {
        extensionKeyHex: '0401',
        extensionValueHex: `${'1b'.repeat(32)}${'21'.repeat(32)}`,
        extensionFieldsSha256Hex: '40'.repeat(32),
        processBindingDigestHex: '41'.repeat(32),
        executionTargetIdentityDigestHex: '42'.repeat(32),
        finalSnapshot: {
          headerIdHex: '43'.repeat(32),
          fullHeight: 230,
        },
      },
      observation: {
        extensionKeyHex: '0401',
        extensionValueHex: `${'1b'.repeat(32)}${'21'.repeat(32)}`,
        anchorHeaderIdHex: '43'.repeat(32),
        anchorHeight: 230,
        anchorExtensionRootHex: '44'.repeat(32),
        observationDigestHex: '45'.repeat(32),
        processBindingDigestHex: '41'.repeat(32),
        executionTargetIdentityDigestHex: '42'.repeat(32),
      },
    },
    tracker: trackerFixture(),
    checks: {
      setupVaultMintBurnCheckpointAnchorAndTrackerCheckCompletedInOneChainLifetime:
        true,
      exactObserved0401AnchorConsumedByTrackerCandidate: true,
      exactCheckpointBoundActiveTargetConsumedByTrackerCheck: true,
      exactConfirmedTrackerSetupOutputConsumed: true,
      exactSameProcessTrackerCompilerReceiptConsumed: true,
      localWasmSignatureAcceptedBySameTargetJvmCheck: true,
      everyEphemeralCapabilityDisposedBeforeReturn: true,
      returnedValueContainsCapabilities: false,
    },
    boundaries: {
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
    },
  };
  return {
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, ROOT_DIGEST_DOMAIN),
  };
}

function rootDigest(root: any): string {
  const { receiptDigestHex: _digest, ...body } = root;
  return sha256CanonicalJson(body, ROOT_DIGEST_DOMAIN);
}

function workerDigest(worker: any): string {
  const { receiptDigestHex: _digest, ...body } = worker;
  return sha256CanonicalJson(
    body,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V6',
  );
}

function commandReceiptDigest(receipt: any): string {
  const { receiptDigestHex: _discarded, ...body } = receipt;
  return sha256CanonicalJson(body, COMMAND_RECEIPT_DIGEST_DOMAIN);
}

function wireHex(byte: string, bytes = 32): string {
  return `0x${byte.repeat(bytes)}`;
}

function currentBuildEnvironment() {
  return Object.freeze({
    CARGO_HOME: process.env.CARGO_HOME,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
  });
}

async function withCargoHome<T>(
  cargoHome: string,
  action: () => Promise<T>,
): Promise<T> {
  const previous = process.env.CARGO_HOME;
  process.env.CARGO_HOME = cargoHome;
  try {
    return await action();
  } finally {
    if (previous === undefined) delete process.env.CARGO_HOME;
    else process.env.CARGO_HOME = previous;
  }
}
