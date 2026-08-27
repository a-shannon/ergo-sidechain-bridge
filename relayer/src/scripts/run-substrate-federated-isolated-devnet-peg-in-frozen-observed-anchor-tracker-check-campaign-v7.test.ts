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

const mocked = vi.hoisted(() => ({
  applicationAssert: vi.fn(),
  commandReceiptFailure: false,
  environment: vi.fn(),
  loader: vi.fn(),
  process: vi.fn(),
  receiptPublicationFailure: false,
  root: vi.fn(),
}));

vi.mock(
  '../relayer-core/substrate-federated-isolated-devnet-receipt-data-safety-v1.js',
  async importOriginal => {
    const original = await importOriginal<Record<string, unknown>>();
    const assertDataSafe = original.assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1 as (
      value: unknown,
    ) => void;
    return {
      ...original,
      assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1: (value: unknown) => {
        const schema = value !== null && typeof value === 'object'
          ? (value as { readonly schema?: unknown }).schema
          : undefined;
        if (
          mocked.commandReceiptFailure
          && schema
            === 'e2s.substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-command-receipt.v8'
        ) {
          throw new Error(`sensitive command receipt detail under ${resolve('private-source')}`);
        }
        assertDataSafe(value);
      },
    };
  },
);

vi.mock(
  '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js',
  async importOriginal => {
    const original = await importOriginal<Record<string, unknown>>();
    return {
      ...original,
      runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7:
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
vi.mock(
  '../pinned-local-native-verifier-build.js',
  async importOriginal => {
    const original = await importOriginal<Record<string, unknown>>();
    return {
      ...original,
      runBoundedProcess: mocked.process,
    };
  },
);
vi.mock(
  './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js',
  async importOriginal => {
    const original = await importOriginal<Record<string, unknown>>();
    const publishReceipt = original.publishCreateOnlyReceipt as (
      ...args: readonly unknown[]
    ) => unknown;
    return {
      ...original,
      childEnvironment: mocked.environment,
      publishCreateOnlyReceipt: (...args: readonly unknown[]) => {
        if (mocked.receiptPublicationFailure) {
          throw new Error(`sensitive publication detail under ${resolve('private-source')}`);
        }
        return publishReceipt(...args);
      },
    };
  },
);

import {
  BoundedProcessExitError,
} from '../pinned-local-native-verifier-build.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V7_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V7,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-genesis-setup-execution-root-v1.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  buildErgoExtensionMembershipProof,
} from '../ergo-settlement-core/ergo-extension-membership.js';
import {
  computeErgoHeaderId,
  serializeErgoHeaderIdentity,
} from '../ergo-settlement-core/ergo-header-id.js';
import {
  PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
  encodePegInSourceIntentV2Hex,
} from '../peg-in-causal-admission-v2.js';
import {
  deriveSubstrateFederatedIsolatedDevnetCanonicalCheckpointExtensionObservationDigestV1,
  deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1,
} from '../relayer-core/substrate-federated-isolated-devnet-checkpoint-extension-observation-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_CAMPAIGN_PHASES_V1,
} from '../relayer-core/substrate-federated-isolated-devnet-managed-campaign-phase-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_SCHEMA,
} from '../substrate-federated-isolated-devnet-checkpoint-anchor-observer-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_FROZEN_EXECUTION_V2_SCHEMA,
} from '../substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA,
} from '../substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V7_SCHEMA,
  buildSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7,
  createFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseFailureV7,
  parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7,
} from './run-substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-receipt-v7.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V8_SCHEMA,
  WORKER_RECEIPT_DIGEST_DOMAIN_V8,
  buildSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8 as buildWorkerReceipt,
  parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV8 as parseWorkerReceipt,
} from './run-substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-receipt-v8.js';
import {
  COMMAND_RECEIPT_DIGEST_DOMAIN_V7,
  COMMAND_RECEIPT_DIGEST_DOMAIN_V8,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V7_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V8_SCHEMA,
  formatSafeFrozenObservedAnchorTrackerCheckCampaignCommandFailureV7,
  parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandReceiptV7,
  parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandReceiptV8,
  runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandFromArgumentsV7,
} from './run-substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-v7.js';
import {
  formatSafeFrozenObservedAnchorTrackerCheckCampaignWorkerFailureV7,
  resolveCanonicalFrozenObservedAnchorTrackerCheckCampaignWorkerRootsV7,
  runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV7,
} from './run-substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-worker-v7.js';

const ROOT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V7';
const MINT_AMOUNT_NANO_ERG = '15000000';
const BURN_AMOUNT_NANO_ERG = '10000000';
const RECIPIENT_ADDRESS_HEX = '11'.repeat(20);
const REQUEST_DIGEST_HEX = 'f'.repeat(64);
const REVIEWED_TOOL_ROOT = resolve('reviewed-tool-root');
const REVIEWED_FRONTIER_SOURCE_PATH = join(REVIEWED_TOOL_ROOT, 'frontier');
const REVIEWED_CARGO_PATH = join(REVIEWED_TOOL_ROOT, 'cargo.exe');
const REVIEWED_RUSTC_PATH = join(REVIEWED_TOOL_ROOT, 'rustc.exe');
const REVIEWED_GIT_PATH = join(REVIEWED_TOOL_ROOT, 'git.exe');

describe('isolated devnet peg-in frozen-observed-anchor-tracker-check campaign root V7', () => {
  it('emits only a typed static binding label or a generic worker failure', () => {
    const changed = structuredClone(rootReceipt());
    changed.application.applicationCheckpoint.binding.burnIdHex = wireHex('aa');
    changed.receiptDigestHex = rootDigest(changed);
    let bindingFailure: unknown;
    try {
      buildWorkerReceipt(changed, REQUEST_DIGEST_HEX, pegInPlan());
    } catch (error) {
      bindingFailure = error;
    }
    expect(
      formatSafeFrozenObservedAnchorTrackerCheckCampaignWorkerFailureV7(
        bindingFailure,
      ),
    ).toBe(
      'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
      + 'producer-to-consumer binding changed: application burn identity\n',
    );
    expect(
      formatSafeFrozenObservedAnchorTrackerCheckCampaignWorkerFailureV7(
        new Error('Frontier semantic SHA-256 changed'),
      ),
    ).toBe('isolated frozen-observed-anchor-tracker-check campaign worker failed\n');
    expect(
      formatSafeFrozenObservedAnchorTrackerCheckCampaignWorkerFailureV7(
        new Error(`failed under ${resolve('private-source')}`),
      ),
    ).toBe('isolated frozen-observed-anchor-tracker-check campaign worker failed\n');
    expect(
      formatSafeFrozenObservedAnchorTrackerCheckCampaignWorkerFailureV7(
        new Error('first line\nsecond line'),
      ),
    ).toBe('isolated frozen-observed-anchor-tracker-check campaign worker failed\n');
    expect(
      formatSafeFrozenObservedAnchorTrackerCheckCampaignWorkerFailureV7('failure'),
    ).toBe('isolated frozen-observed-anchor-tracker-check campaign worker failed\n');
    expect(
      formatSafeFrozenObservedAnchorTrackerCheckCampaignWorkerFailureV7(
        new Error(
          'frozen-observed-anchor-tracker-check campaign producer-to-consumer '
          + 'binding changed: application burn identity',
        ),
      ),
    ).toBe('isolated frozen-observed-anchor-tracker-check campaign worker failed\n');
  });

  it('emits only the exact typed worker phase for an internal phase failure', async () => {
    let phaseFailure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV7([]);
    } catch (error) {
      phaseFailure = error;
    }
    expect(
      formatSafeFrozenObservedAnchorTrackerCheckCampaignWorkerFailureV7(
        phaseFailure,
      ),
    ).toBe(
      'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
      + 'phase failed: worker arguments\n',
    );
    expect(
      formatSafeFrozenObservedAnchorTrackerCheckCampaignWorkerFailureV7(
        new Error('worker arguments: private detail'),
      ),
    ).toBe('isolated frozen-observed-anchor-tracker-check campaign worker failed\n');
    for (const phase of [
      'worker arguments',
      'worker platform',
      'external roots',
      'worker roots',
      'worker environment',
      'bootstrap request',
      'campaign root',
      'worker receipt',
      ...SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_CAMPAIGN_PHASES_V1,
    ] as const) {
      expect(
        formatSafeFrozenObservedAnchorTrackerCheckCampaignWorkerFailureV7(
          createFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseFailureV7(
            phase,
            new Error(`private detail under ${resolve('private-source')}`),
          ),
        ),
      ).toBe(
        'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
        + `phase failed: ${phase}\n`,
      );
    }
    expect(() =>
      createFrozenObservedAnchorTrackerCheckCampaignWorkerPhaseFailureV7(
        resolve('private-source') as any,
        new Error('private detail'),
      )
    ).toThrow(/worker phase is invalid/iu);
  });

  it('does not relay diagnostics from unbound bounded process errors', () => {
    const safeFailure = new BoundedProcessExitError({
      label: 'worker',
      exitCode: 1,
      stdout: '',
      stderr:
        'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
        + 'producer-to-consumer binding changed: admission transaction\n',
    });
    expect(
      formatSafeFrozenObservedAnchorTrackerCheckCampaignCommandFailureV7(
        safeFailure,
      ),
    ).toBe('isolated peg-in frozen-observed-anchor-tracker-check campaign failed\n');
    const safePhaseFailure = new BoundedProcessExitError({
      label: 'worker',
      exitCode: 1,
      stdout: '',
      stderr:
        'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
        + 'phase failed: campaign root\n',
    });
    expect(
      formatSafeFrozenObservedAnchorTrackerCheckCampaignCommandFailureV7(
        safePhaseFailure,
      ),
    ).toBe('isolated peg-in frozen-observed-anchor-tracker-check campaign failed\n');

    for (const unsafeFailure of [
      new BoundedProcessExitError({
        label: 'worker',
        exitCode: 1,
        stdout: 'unexpected',
        stderr: safeFailure.stderr,
      }),
      new BoundedProcessExitError({
        label: 'worker',
        exitCode: 1,
        stdout: '',
        stderr:
          'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
          + `producer-to-consumer binding changed: ${resolve('private-source')}\n`,
      }),
      new BoundedProcessExitError({
        label: 'worker',
        exitCode: 1,
        stdout: '',
        stderr:
          'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
          + 'producer-to-consumer binding changed: arbitrary safe spoof\n',
      }),
      new BoundedProcessExitError({
        label: 'worker',
        exitCode: 1,
        stdout: 'unexpected',
        stderr: safePhaseFailure.stderr,
      }),
      new BoundedProcessExitError({
        label: 'worker',
        exitCode: 1,
        stdout: '',
        stderr:
          'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
          + 'phase failed: arbitrary safe spoof\n',
      }),
      new Error(safeFailure.stderr),
      new Error(safePhaseFailure.stderr),
    ]) {
      expect(
        formatSafeFrozenObservedAnchorTrackerCheckCampaignCommandFailureV7(
          unsafeFailure,
        ),
      ).toBe('isolated peg-in frozen-observed-anchor-tracker-check campaign failed\n');
    }
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mocked.commandReceiptFailure = false;
    mocked.environment.mockReturnValue(Object.freeze({ PATH: 'controlled' }));
    mocked.loader.mockReturnValue(canonicalBootstrapInput());
    mocked.receiptPublicationFailure = false;
    mocked.root.mockResolvedValue({ receipt: rootReceipt() });
  });

  it('relays only a diagnostic produced by the exact bounded worker invocation', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'fed6lab-worker-failure-'));
    try {
      const requestPath = join(fixture, 'request.json');
      const outputPath = join(fixture, 'receipt.json');
      const temporaryRoot = join(fixture, 'frontier-root');
      const cargoCache = join(fixture, 'cargo-cache');
      const relayerCargoCache = join(fixture, 'relayer-cargo-cache');
      mkdirSync(temporaryRoot);
      mkdirSync(cargoCache);
      mkdirSync(relayerCargoCache);
      writeFileSync(requestPath, '{"request":"canonical"}\n', 'utf8');
      const commandArguments = [
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
      ] as const;
      const cases = [
        {
          failure: new BoundedProcessExitError({
            label: 'exact worker invocation',
            exitCode: 1,
            stdout: '',
            stderr:
              `sensitive diagnostic under ${resolve('private-source')}\n`
              + 'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
              + 'phase failed: campaign root\n',
          }),
          expected:
            'isolated peg-in frozen-observed-anchor-tracker-check campaign failed: '
            + 'phase failed: campaign root '
            + '(preceding worker diagnostics suppressed)\n',
        },
        {
          failure: new BoundedProcessExitError({
            label: 'exact worker invocation',
            exitCode: 1,
            stdout: '',
            stderr:
              'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
              + 'phase failed: campaign root\n',
          }),
          expected:
            'isolated peg-in frozen-observed-anchor-tracker-check campaign failed: '
            + 'phase failed: campaign root\n',
        },
        {
          failure: new BoundedProcessExitError({
            label: 'exact worker invocation',
            exitCode: 1,
            stdout: 'unexpected',
            stderr:
              'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
              + 'phase failed: campaign root\n',
          }),
          expected:
            'isolated peg-in frozen-observed-anchor-tracker-check campaign failed: '
            + 'worker process output suppressed\n',
        },
        {
          failure: new BoundedProcessExitError({
            label: 'exact worker invocation',
            exitCode: 1,
            stdout: '',
            stderr:
              'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
              + 'phase failed: arbitrary safe spoof\n',
          }),
          expected:
            'isolated peg-in frozen-observed-anchor-tracker-check campaign failed: '
            + 'worker process diagnostics suppressed\n',
        },
        {
          failure: new BoundedProcessExitError({
            label: 'exact worker invocation',
            exitCode: 0,
            stdout: '',
            stderr:
              'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
              + 'phase failed: campaign root\n',
          }),
          expected:
            'isolated peg-in frozen-observed-anchor-tracker-check campaign failed: '
            + 'worker process exit status invalid\n',
        },
        {
          failure: new Error(
            'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
            + 'phase failed: campaign root\n',
          ),
          expected:
            'isolated peg-in frozen-observed-anchor-tracker-check campaign failed: '
            + 'command phase failed: worker launch\n',
        },
      ];
      let genuineWorkerProcessFailure: unknown;
      for (const testCase of cases) {
        mocked.process.mockRejectedValueOnce(testCase.failure);
        let commandFailure: unknown;
        try {
          await runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandFromArgumentsV7(
            commandArguments,
          );
        } catch (error) {
          commandFailure = error;
        }
        expect(commandFailure).not.toHaveProperty('stdout');
        expect(commandFailure).not.toHaveProperty('stderr');
        expect(
          formatSafeFrozenObservedAnchorTrackerCheckCampaignCommandFailureV7(
            commandFailure,
          ),
        ).toBe(testCase.expected);
        genuineWorkerProcessFailure ??= commandFailure;
      }
      const forgedWorkerProcessFailure = Object.create(
        Object.getPrototypeOf(genuineWorkerProcessFailure as object),
      ) as {
        binding: string;
        phase: undefined;
        processFailure: undefined;
        precedingDiagnosticsSuppressed: boolean;
      };
      forgedWorkerProcessFailure.binding = resolve('private-source');
      forgedWorkerProcessFailure.phase = undefined;
      forgedWorkerProcessFailure.processFailure = undefined;
      forgedWorkerProcessFailure.precedingDiagnosticsSuppressed = false;
      expect(
        formatSafeFrozenObservedAnchorTrackerCheckCampaignCommandFailureV7(
          forgedWorkerProcessFailure,
        ),
      ).toBe('isolated peg-in frozen-observed-anchor-tracker-check campaign failed\n');
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('reports only a privately branded finite command phase', async () => {
    let commandFailure: unknown;
    try {
      await runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandFromArgumentsV7([]);
    } catch (error) {
      commandFailure = error;
    }
    expect(
      formatSafeFrozenObservedAnchorTrackerCheckCampaignCommandFailureV7(
        commandFailure,
      ),
    ).toBe(
      'isolated peg-in frozen-observed-anchor-tracker-check campaign failed: '
      + 'command phase failed: command arguments\n',
    );
    expect(
      formatSafeFrozenObservedAnchorTrackerCheckCampaignCommandFailureV7(
        new Error('command phase failed: worker launch'),
      ),
    ).toBe('isolated peg-in frozen-observed-anchor-tracker-check campaign failed\n');
    const forgedFailure = Object.create(
      Object.getPrototypeOf(commandFailure as object),
    ) as { phase: string };
    forgedFailure.phase = resolve('private-source');
    expect(
      formatSafeFrozenObservedAnchorTrackerCheckCampaignCommandFailureV7(
        forgedFailure,
      ),
    ).toBe('isolated peg-in frozen-observed-anchor-tracker-check campaign failed\n');
  });

  it('attributes every fallible command boundary without relaying causal details', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'fed6lab-command-phases-'));
    try {
      const requestPath = join(fixture, 'request.json');
      const outputPath = join(fixture, 'receipt.json');
      const temporaryRoot = join(fixture, 'frontier-root');
      const cargoCache = join(fixture, 'frontier-cache');
      const relayerCargoCache = join(fixture, 'relayer-cache');
      mkdirSync(temporaryRoot);
      mkdirSync(cargoCache);
      mkdirSync(relayerCargoCache);
      const requestBytes = Buffer.from('{"request":"canonical"}\n', 'utf8');
      writeFileSync(requestPath, requestBytes);
      const requestDigest = createHash('sha256').update(requestBytes).digest('hex');
      const workerReceipt = buildWorkerReceipt(
        rootReceipt(),
        requestDigest,
        pegInPlan(),
      );
      const argumentsFor = (
        overrides: Readonly<{
          requestPath?: string;
          outputPath?: string;
          temporaryRoot?: string;
          cargoCache?: string;
        }> = {},
      ) => [
        '--request',
        overrides.requestPath ?? requestPath,
        '--amount-nano-erg',
        MINT_AMOUNT_NANO_ERG,
        '--recipient-address-hex',
        RECIPIENT_ADDRESS_HEX,
        '--frontier-temporary-root',
        overrides.temporaryRoot ?? temporaryRoot,
        '--frontier-cargo-cache',
        overrides.cargoCache ?? cargoCache,
        '--relayer-cargo-cache',
        relayerCargoCache,
        '--output',
        overrides.outputPath ?? outputPath,
      ] as const;
      const captureSafeFailure = async (argv: readonly string[]) => {
        let failure: unknown;
        try {
          await runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandFromArgumentsV7(
            argv,
          );
        } catch (error) {
          failure = error;
        }
        const formatted =
          formatSafeFrozenObservedAnchorTrackerCheckCampaignCommandFailureV7(
            failure,
          );
        expect(formatted).not.toContain(fixture);
        expect(failure).not.toHaveProperty('stdout');
        expect(failure).not.toHaveProperty('stderr');
        return formatted;
      };
      const prefix =
        'isolated peg-in frozen-observed-anchor-tracker-check campaign failed: '
        + 'command phase failed: ';

      await expect(captureSafeFailure(argumentsFor({
        requestPath: join(fixture, 'missing-request.json'),
      }))).resolves.toBe(`${prefix}request binding\n`);
      await expect(captureSafeFailure(argumentsFor({
        cargoCache: temporaryRoot,
      }))).resolves.toBe(`${prefix}external roots\n`);

      writeFileSync(outputPath, 'reserved', 'utf8');
      await expect(captureSafeFailure(argumentsFor())).resolves.toBe(
        `${prefix}output reservation\n`,
      );
      rmSync(outputPath);

      mocked.process.mockResolvedValueOnce({
        pid: 1234,
        exitCode: 0,
        stdout: `sensitive worker receipt under ${fixture}`,
        stderr: '',
      });
      await expect(captureSafeFailure(argumentsFor())).resolves.toBe(
        `${prefix}worker receipt\n`,
      );

      mocked.commandReceiptFailure = true;
      mocked.process.mockResolvedValueOnce({
        pid: 1234,
        exitCode: 0,
        stdout: `${canonicalJson(workerReceipt)}\n`,
        stderr: '',
      });
      await expect(captureSafeFailure(argumentsFor())).resolves.toBe(
        `${prefix}command receipt\n`,
      );
      mocked.commandReceiptFailure = false;

      mocked.receiptPublicationFailure = true;
      mocked.process.mockResolvedValueOnce({
        pid: 1234,
        exitCode: 0,
        stdout: `${canonicalJson(workerReceipt)}\n`,
        stderr: '',
      });
      await expect(captureSafeFailure(argumentsFor())).resolves.toBe(
        `${prefix}receipt publication\n`,
      );
      mocked.receiptPublicationFailure = false;
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
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
          return runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV7([
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
        resolve(process.cwd(), '..'),
        resolve(process.cwd(), '..', '..'),
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
      expect(receipt.schema).toBe(
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V8_SCHEMA,
      );
      expect(receipt.version).toBe(8);
      expect(receipt.application.amountNanoErg).toBe(BURN_AMOUNT_NANO_ERG);
      expect(receipt.application.burnIdHex).toBe(wireHex('19'));
      expect(receipt.checkpoint.statementIdHex).toBe('21'.repeat(32));
      expect(receipt.anchor.extensionKeyHex).toBe('0401');
      expect(receipt.execution.executionTargetIdentityDigestHex).toBe(
        '42'.repeat(32),
      );
      expect(receipt.anchor.executionTargetIdentityDigestHex).toBe(
        '43'.repeat(32),
      );
      expect(receipt.execution.executionTargetIdentityDigestHex).not.toBe(
        receipt.anchor.executionTargetIdentityDigestHex,
      );
      expect(receipt.trackerCandidate.inputBoxIdHex).toBe('48'.repeat(32));
      expect(receipt.trackerCheck.signedTransactionIdHex).toBe(
        receipt.trackerCheck.unsignedTransactionIdHex,
      );
      expect(receipt.trackerExecution.schema).toBe(
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_FROZEN_EXECUTION_V2_SCHEMA,
      );
      expect(receipt.trackerObservation.schema).toBe(
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_SCHEMA,
      );
      expect(receipt.trackerCheck.schema).toBe(
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA,
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
        buildWorkerReceipt(
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
        await runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandFromArgumentsV7([
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
        'isolated_peg_in_frozen_observed_anchor_tracker_check_campaign_receipt_published',
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
        resolve(process.cwd(), '..', '..'),
        { cargoHomeDirectory: relayerCargoCache },
      );
      const published = readFileSync(outputPath, 'utf8');
      expect(published).toBe(`${canonicalJson(JSON.parse(published))}\n`);
      const parsed =
        parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandReceiptV8(
          published,
          result.receiptDigestHex,
          requestDigest,
          pegInPlan(),
        );
      expect(parsed.receiptDigestHex).toBe(result.receiptDigestHex);
      expect(parsed.schema).toBe(
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V8_SCHEMA,
      );
      expect(parsed.version).toBe(8);
      expect(parsed.executionReceipt.receiptDigestHex).toBe(
        workerReceipt.receiptDigestHex,
      );
      const legacyWorkerReceipt =
        buildSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerReceiptV7(
          rootReceipt(),
          requestDigest,
          pegInPlan(),
        );
      const {
        receiptDigestHex: _v8CommandDigest,
        schema: _v8CommandSchema,
        version: _v8CommandVersion,
        executionReceipt: _v8ExecutionReceipt,
        ...commandBody
      } = parsed;
      const legacyCommandBody = {
        ...commandBody,
        schema:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V7_SCHEMA,
        version: 7 as const,
        executionReceipt: legacyWorkerReceipt,
      };
      const legacyCommandReceipt = {
        ...legacyCommandBody,
        receiptDigestHex: commandReceiptDigestV7(legacyCommandBody),
      };
      const parsedLegacy =
        parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandReceiptV7(
          `${canonicalJson(legacyCommandReceipt)}\n`,
          legacyCommandReceipt.receiptDigestHex,
          requestDigest,
          pegInPlan(),
        );
      expect(parsedLegacy.schema).toBe(
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_COMMAND_RECEIPT_V7_SCHEMA,
      );
      expect(parsedLegacy.version).toBe(7);
      expect(parsedLegacy.executionReceipt.schema).toBe(
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_WORKER_RECEIPT_V7_SCHEMA,
      );
      expect(parsedLegacy.executionReceipt.version).toBe(7);
      expect(published).not.toContain(temporaryRoot);
      expect(published).not.toContain(cargoCache);
      expect(published).not.toContain(relayerCargoCache);
      const changed = structuredClone(parsed) as any;
      changed.boundaries.trackerSubmissionPerformed = true;
      changed.receiptDigestHex = commandReceiptDigest(changed);
      expect(() =>
        parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandReceiptV8(
          `${canonicalJson(changed)}\n`,
          result.receiptDigestHex,
          requestDigest,
          pegInPlan(),
        )
      ).toThrow(/command receipt identity changed/iu);
      expect(() =>
        parseSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandReceiptV8(
          `${canonicalJson(changed)}\n`,
          changed.receiptDigestHex,
          requestDigest,
          pegInPlan(),
        )
      ).toThrow(/command boundaries changed/iu);
      await expect(
        runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandFromArgumentsV7([
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
      buildWorkerReceipt(
        changed,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(
      /producer-to-consumer binding changed: application burn identity/iu,
    );
  });

  it.each([
    [
      'checkpoint statement to 0x0401 anchor',
      'mined anchor extension value',
      (changed: any) => {
        changed.checkpointAnchor.mining.extensionValueHex = 'aa'.repeat(64);
      },
    ],
    [
      'confirmed tracker setup to candidate input',
      'tracker candidate input',
      (changed: any) => {
        changed.tracker.candidate.inputBoxIdHex = 'aa'.repeat(32);
      },
    ],
    [
      'frozen target to tracker check',
      'tracker check process binding',
      (changed: any) => {
        changed.tracker.check.target.processBindingDigestHex = 'aa'.repeat(32);
      },
    ],
    [
      'checkpoint target to frozen tracker execution',
      'tracker execution target',
      (changed: any) => {
        changed.tracker.execution.executionTargetIdentityDigestHex = 'aa'.repeat(32);
      },
    ],
    [
      'non-mining execution boundary',
      'tracker action mining boundary',
      (changed: any) => {
        changed.tracker.execution.primaryMiningDuringAction = true;
      },
    ],
    [
      'stable frozen action snapshot',
      'tracker action header stability',
      (changed: any) => {
        changed.tracker.execution.actionEndSnapshot.headerIdHex = 'aa'.repeat(32);
      },
    ],
    [
      'frozen observation format',
      'frozen observation version',
      (changed: any) => {
        changed.tracker.observation.version = 1;
      },
    ],
    [
      'frozen checker format',
      'tracker check version',
      (changed: any) => {
        changed.tracker.check.version = 1;
      },
    ],
    [
      'campaign process to setup lifecycle target',
      'campaign lifecycle execution target',
      (changed: any) => {
        changed.process.executionTargetIdentityDigestHex = 'aa'.repeat(32);
      },
    ],
    [
      'campaign setup lifecycle to process target',
      'campaign lifecycle execution target',
      (changed: any) => {
        changed.setup.lifecycle.executionTargetIdentityDigestHex = 'aa'.repeat(32);
      },
    ],
    [
      'non-persistence boundary',
      'tracker check signed bytes non-persistence',
      (changed: any) => {
        changed.tracker.check.boundaries.signedTransactionBytesPersisted = true;
      },
    ],
  ] as const)(
    'rejects changed %s binding after the V7 root digest is recomputed',
    (_label, expectedBinding, mutate) => {
      const changed = structuredClone(rootReceipt());
      mutate(changed);
      changed.receiptDigestHex = rootDigest(changed);
      expect(() =>
        buildWorkerReceipt(
          changed,
          REQUEST_DIGEST_HEX,
          pegInPlan(),
        )
      ).toThrow(new RegExp(
        `producer-to-consumer binding changed: ${expectedBinding}`,
        'iu',
      ));
    },
  );

  it.each([
    [
      'committed vault',
      'committed vault missing',
      (changed: any) => {
        delete changed.pegIn.committedVaultExecution;
      },
    ],
    [
      'frozen tip',
      'frozen tip missing',
      (changed: any) => {
        changed.tracker.observation.headers = [];
      },
    ],
  ] as const)(
    'rejects a missing %s with its exact precondition label',
    (_label, expectedBinding, mutate) => {
      const changed = structuredClone(rootReceipt());
      mutate(changed);
      changed.receiptDigestHex = rootDigest(changed);
      expect(() =>
        buildWorkerReceipt(
          changed,
          REQUEST_DIGEST_HEX,
          pegInPlan(),
        )
      ).toThrow(new RegExp(
        `producer-to-consumer binding changed: ${expectedBinding}`,
        'iu',
      ));
    },
  );

  it('reports the first failed binding before a later malformed value', () => {
    const changed = structuredClone(rootReceipt());
    changed.application.checkpointAdmissionObservation.expectedTxId = 'aa'.repeat(32);
    changed.application.applicationCheckpoint.applicationRunner.executionResult
      .applicationEvidence.sourceNativeBlock.hashHex = 'malformed';
    changed.receiptDigestHex = rootDigest(changed);
    expect(() =>
      buildWorkerReceipt(
        changed,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(
      /producer-to-consumer binding changed: admission transaction/iu,
    );
  });

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
      'frozen target to checked target',
      (changed: any) => {
        changed.trackerCheck.processBindingDigestHex = 'aa'.repeat(32);
      },
    ],
    [
      'frozen action start to action end snapshot',
      (changed: any) => {
        changed.trackerExecution.actionEndHeaderIdHex = 'aa'.repeat(32);
      },
    ],
    [
      'checkpoint target to frozen tracker execution',
      (changed: any) => {
        changed.trackerExecution.executionTargetIdentityDigestHex = 'aa'.repeat(32);
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
      'anchor context index to frozen tip height',
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
        buildWorkerReceipt(
          rootReceipt(),
          REQUEST_DIGEST_HEX,
          pegInPlan(),
        ),
      );
      mutate(changed);
      changed.receiptDigestHex = workerDigest(changed);
      expect(() =>
        parseWorkerReceipt(
          `${canonicalJson(changed)}\n`,
          REQUEST_DIGEST_HEX,
          pegInPlan(),
        )
      ).toThrow(/receipt projection binding changed/iu);
    },
  );

  it('rejects an independently recomputed worker receipt with a drifted canonical checkpoint digest', () => {
    const changed: any = structuredClone(
      buildWorkerReceipt(
        rootReceipt(),
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      ),
    );
    changed.trackerExecution.checkpointExtensionObservationDigestHex =
      'aa'.repeat(32);
    changed.receiptDigestHex = workerDigest(changed);
    expect(() =>
      parseWorkerReceipt(
        `${canonicalJson(changed)}\n`,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/canonical observation binding changed/iu);
  });

  it('rejects coordinated canonical-material and digest mutation without a matching header identity', () => {
    const changed: any = structuredClone(
      buildWorkerReceipt(rootReceipt(), REQUEST_DIGEST_HEX, pegInPlan()),
    );
    changed.anchor.canonicalHeaderBytesHex = 'aa';
    const coordinatedDigest =
      deriveSubstrateFederatedIsolatedDevnetCanonicalCheckpointExtensionObservationDigestV1({
        checkpoint: {
          network: 'devnet',
          fullHeight: changed.anchor.anchorHeight,
          indexedHeight: changed.anchor.anchorHeight,
          headerIdHex: changed.anchor.anchorHeaderIdHex,
        },
        expectedExtensionValueHex: changed.anchor.extensionValueHex,
        canonicalHeaderBytesHex: changed.anchor.canonicalHeaderBytesHex,
        extensionRootHex: changed.anchor.anchorExtensionRootHex,
        extensionFields: changed.anchor.extensionFields,
        extensionMembershipProofHex:
          changed.anchor.extensionMembershipProofHex,
      });
    changed.anchor.canonicalCheckpointExtensionObservationDigestHex =
      coordinatedDigest;
    changed.trackerExecution.checkpointExtensionObservationDigestHex =
      coordinatedDigest;
    changed.receiptDigestHex = workerDigest(changed);
    expect(() =>
      parseWorkerReceipt(
        `${canonicalJson(changed)}\n`,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/canonical anchor header binding changed/iu);
  });

  it.each([
    [
      'canonical header bytes',
      (changed: any) => {
        changed.anchor.canonicalHeaderBytesHex = 'aa';
      },
    ],
    [
      'extension side field',
      (changed: any) => {
        changed.anchor.extensionFields.unshift({
          keyHex: '0100',
          valueHex: 'aa',
        });
      },
    ],
    [
      'extension membership proof',
      (changed: any) => {
        changed.anchor.extensionMembershipProofHex = 'aa';
      },
    ],
    [
      'projected canonical digest',
      (changed: any) => {
        changed.anchor.canonicalCheckpointExtensionObservationDigestHex =
          'aa'.repeat(32);
      },
    ],
  ] as const)(
    'rejects independently recomputed worker receipt drift in %s',
    (_label, mutate) => {
      const changed: any = structuredClone(
        buildWorkerReceipt(
          rootReceipt(),
          REQUEST_DIGEST_HEX,
          pegInPlan(),
        ),
      );
      mutate(changed);
      changed.receiptDigestHex = workerDigest(changed);
      expect(() =>
        parseWorkerReceipt(
          `${canonicalJson(changed)}\n`,
          REQUEST_DIGEST_HEX,
          pegInPlan(),
        )
      ).toThrow(/canonical anchor(?: header| extension)? binding changed/iu);
    },
  );

  it.each([
    [
      'V1 tracker execution schema',
      (changed: any) => {
        changed.trackerExecution.schema =
          'e2s.substrate-federated-isolated-devnet-ergo-node-process.v1';
        changed.trackerExecution.version = 1;
      },
      /frozen tracker execution projection schema or version changed/iu,
    ],
    [
      'V1 tracker observation schema',
      (changed: any) => {
        changed.trackerObservation.schema =
          'e2s.substrate-federated-isolated-devnet-checkpoint-bound-tracker-observation.v1';
        changed.trackerObservation.version = 1;
      },
      /tracker observation projection schema or version changed/iu,
    ],
    [
      'V1 tracker check schema',
      (changed: any) => {
        changed.trackerCheck.schema =
          'e2s.substrate-federated-isolated-devnet-observed-anchor-tracker-check.v1';
        changed.trackerCheck.version = 1;
      },
      /tracker check projection schema, version, or status changed/iu,
    ],
    [
      'non-PASS tracker check status',
      (changed: any) => {
        changed.trackerCheck.status = 'FAIL';
      },
      /tracker check projection schema, version, or status changed/iu,
    ],
  ] as const)(
    'rejects a recomputed compact receipt with %s',
    (_label, mutate, expectedError) => {
      const changed: any = structuredClone(
        buildWorkerReceipt(
          rootReceipt(),
          REQUEST_DIGEST_HEX,
          pegInPlan(),
        ),
      );
      mutate(changed);
      changed.receiptDigestHex = workerDigest(changed);
      expect(() =>
        parseWorkerReceipt(
          `${canonicalJson(changed)}\n`,
          REQUEST_DIGEST_HEX,
          pegInPlan(),
        )
      ).toThrow(expectedError);
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
      buildWorkerReceipt(
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
      buildWorkerReceipt(
        changedBoundary,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/root boundaries changed/iu);

    const stale = structuredClone(rootReceipt());
    stale.application.evidenceReceipt.receiptDigestHex = 'bb'.repeat(32);
    expect(() =>
      buildWorkerReceipt(
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
      buildWorkerReceipt(
        changed,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/root boundaries changed/iu);
  });

  it('rejects a plan that differs from the root mint statement', () => {
    expect(() =>
      buildWorkerReceipt(
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
      buildWorkerReceipt(
        rootReceipt(),
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      );
    expect(() =>
      parseWorkerReceipt(
        `${JSON.stringify(receipt, null, 2)}\n`,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/canonical JSON/iu);

    const changed: any = structuredClone(receipt);
    changed.boundaries.gate5Closed = true;
    changed.receiptDigestHex = workerDigest(changed);
    expect(() =>
      parseWorkerReceipt(
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
      buildWorkerReceipt(
        rootReceipt(),
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      ),
    );
    changed.boundaries[boundary] = true;
    changed.receiptDigestHex = workerDigest(changed);
    expect(() =>
      parseWorkerReceipt(
        `${canonicalJson(changed)}\n`,
        REQUEST_DIGEST_HEX,
        pegInPlan(),
      )
    ).toThrow(/worker boundaries changed/iu);
  });

  it('rejects invalid plans before loading a request or running the root', async () => {
    await expect(
      runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV7([
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
        runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandFromArgumentsV7([
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
        runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignCommandFromArgumentsV7([
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
        runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV7([
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
      mocked.root.mockRejectedValueOnce(
        createSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
          'frozen tracker check',
          new Error(`private root detail under ${resolve('private-source')}`),
        ),
      );
      let workerFailure: unknown;
      try {
        await withCargoHome(relayerCargoCache, () =>
          runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV7([
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
          ]));
      } catch (error) {
        workerFailure = error;
      }
      expect(workerFailure).toBeInstanceOf(Error);
      expect(
        formatSafeFrozenObservedAnchorTrackerCheckCampaignWorkerFailureV7(
          workerFailure,
        ),
      ).toBe(
        'isolated frozen-observed-anchor-tracker-check campaign worker failed: '
        + 'phase failed: frozen tracker check\n',
      );
      expect(
        formatSafeFrozenObservedAnchorTrackerCheckCampaignWorkerFailureV7(
          new Error('frozen tracker check: private detail'),
        ),
      ).toBe(
        'isolated frozen-observed-anchor-tracker-check campaign worker failed\n',
      );
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
        runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV7(
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
        runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV7([
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
        runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV7([
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
      const physicalWorktreeRoot = resolve(process.cwd(), '..', '..');
      const worktreeAlias = join(fixture, 'worktree-alias');
      try {
        symlinkSync(physicalWorktreeRoot, worktreeAlias, 'junction');
      } catch (error) {
        if (['EPERM', 'EACCES', 'UNKNOWN', 'ENOTSUP'].includes(
          (error as NodeJS.ErrnoException).code ?? '',
        )) {
          skip();
          return;
        }
        throw error;
      }
      expect(resolveCanonicalFrozenObservedAnchorTrackerCheckCampaignWorkerRootsV7(
        join(
          worktreeAlias,
          'ergo-sidechain-bridge',
          'relayer',
          'src',
          'scripts',
        ),
      )).toEqual({
        bridgeRoot: realpathSync(resolve(process.cwd(), '..')),
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
        runSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignWorkerFromArgumentsV7([
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

  it('registers the distinct opt-in V7 command', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    );
    expect(
      packageJson.scripts[
        'federated:isolated:peg-in-frozen-observed-anchor-tracker-check:execute-local'
      ],
    ).toBe(
      'npm run node:guard && tsx src/scripts/run-substrate-federated-isolated-devnet-peg-in-frozen-observed-anchor-tracker-check-campaign-v7.ts',
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

function checkpointAnchorObservationFixture() {
  const extensionValueHex = `${'1b'.repeat(32)}${'21'.repeat(32)}`;
  const extensionFields = [
    { keyHex: '0100', valueHex: 'aa' },
    { keyHex: '0401', valueHex: extensionValueHex },
  ];
  const membership = buildErgoExtensionMembershipProof(
    extensionFields.map(field => ({
      key: Buffer.from(field.keyHex, 'hex'),
      value: Buffer.from(field.valueHex, 'hex'),
    })),
    Buffer.from('0401', 'hex'),
  );
  const headerIdentity = {
    version: 2,
    parentId: Buffer.alloc(32, 0x61),
    adProofsRoot: Buffer.alloc(32, 0x62),
    stateRoot: Buffer.alloc(33, 0x63),
    transactionsRoot: Buffer.alloc(32, 0x64),
    timestamp: 1n,
    nBits: 0x0102_0304,
    height: 230,
    extensionHash: membership.root,
    votes: Buffer.alloc(3, 0x65),
    powSolution: {
      publicKey: Buffer.alloc(33, 0x66),
      nonce: Buffer.alloc(8, 0x67),
    },
  };
  const canonicalHeaderBytes = serializeErgoHeaderIdentity(headerIdentity);
  const anchorHeaderIdHex = computeErgoHeaderId(headerIdentity).toString('hex');
  const anchorExtensionRootHex = membership.root.toString('hex');
  return {
    extensionKeyHex: '0401' as const,
    extensionValueHex,
    anchorHeaderIdHex,
    anchorHeight: 230,
    anchorContextIndex: 0,
    anchorExtensionRootHex,
    extensionFields,
    extensionMembershipProofHex: membership.proof.toString('hex'),
    headers: [{
      canonicalHeaderBytesHex: canonicalHeaderBytes.toString('hex'),
      idHex: anchorHeaderIdHex,
      height: 230,
      extensionRootHex: anchorExtensionRootHex,
    }],
    observationDigestHex: '45'.repeat(32),
    processBindingDigestHex: '41'.repeat(32),
    executionTargetIdentityDigestHex: '43'.repeat(32),
  };
}

function trackerFixture() {
  const anchorObservation = checkpointAnchorObservationFixture();
  const extensionValueHex = anchorObservation.extensionValueHex;
  const anchorHeaderIdHex = anchorObservation.anchorHeaderIdHex;
  const anchorExtensionRootHex = anchorObservation.anchorExtensionRootHex;
  const processBindingDigestHex = '46'.repeat(32);
  const executionTargetIdentityDigestHex = '43'.repeat(32);
  const inputBoxIdHex = '48'.repeat(32);
  const unsignedTransactionIdHex = '4c'.repeat(32);
  const signerPublicKeyHex = `02${'4d'.repeat(32)}`;
  return {
    execution: {
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_FROZEN_EXECUTION_V2_SCHEMA,
      version: 2,
      extensionKeyHex: '0401',
      extensionValueHex,
      extensionFieldsSha256Hex: '40'.repeat(32),
      processBindingDigestHex,
      executionTargetIdentityDigestHex,
      primaryMiningDuringAction: false,
      primaryReadOnlyDuringAction: true,
      witnessReadOnlyDuringAction: true,
      miningStoppedBeforeAction: true,
      exactFrozenSnapshotStableAcrossAction: true,
      checkpointExtensionBoundDuringAction: true,
      trackerAdmissionMiningCredentialConsumedOnce: true,
      checkpointSnapshotRevalidatedOnBothNodes: true,
      buildIdentityDigestHex: '56'.repeat(32),
      executableIdentityDigestHex: '57'.repeat(32),
      checkpointExtensionObservationDigestHex:
        deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1(
          anchorObservation,
        ),
      preFreezeMiningSnapshot: {
        network: 'devnet',
        fullHeight: 230,
        indexedHeight: 230,
        headerIdHex: anchorHeaderIdHex,
      },
      actionStartSnapshot: {
        network: 'devnet',
        fullHeight: 230,
        indexedHeight: 230,
        headerIdHex: anchorHeaderIdHex,
      },
      actionEndSnapshot: {
        network: 'devnet',
        fullHeight: 230,
        indexedHeight: 230,
        headerIdHex: anchorHeaderIdHex,
      },
      checkpointSnapshot: {
        network: 'devnet',
        fullHeight: 230,
        indexedHeight: 230,
        headerIdHex: anchorHeaderIdHex,
      },
    },
    observation: {
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_BOUND_TRACKER_OBSERVATION_V2_SCHEMA,
      version: 2,
      targetGenesisHeaderIdHex: '58'.repeat(32),
      extensionKeyHex: '0401',
      anchorHeaderIdHex,
      anchorHeight: 230,
      anchorContextIndex: 0,
      anchorExtensionRootHex,
      extensionValueHex,
      processBindingDigestHex,
      executionTargetIdentityDigestHex,
      observationDigestHex: '4e'.repeat(32),
      extensionFields: [{ keyHex: '0401', valueHex: extensionValueHex }],
      extensionMembershipProofHex: '59',
      headers: Array.from({ length: 10 }, (_unused, index) => ({
        idHex: index === 0
          ? anchorHeaderIdHex
          : (50 + index).toString(16).padStart(2, '0').repeat(32),
        height: 230 - index,
      })),
      boundaries: {
        primaryAndWitnessAgreed: true,
        miningStoppedDuringObservation: true,
        checkpointBoundFrozenTarget: true,
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
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OBSERVED_ANCHOR_TRACKER_CHECK_V2_SCHEMA,
      version: 2,
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
        checkpointBoundFrozenTarget: true,
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
  const checkpointAnchorObservation = checkpointAnchorObservationFixture();
  const body: any = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_ROOT_V7_SCHEMA,
    version: 7,
    status:
      'observed_anchor_tracker_candidate_accepted_by_frozen_local_node_check',
    staticExecutionManifestDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FROZEN_OBSERVED_ANCHOR_TRACKER_CHECK_CAMPAIGN_STATIC_EXECUTION_MANIFEST_DIGEST_V7,
    build: {},
    process: {
      executionTargetIdentityDigestHex: '42'.repeat(32),
    },
    setup: {
      lifecycle: {
        executionTargetIdentityDigestHex: '42'.repeat(32),
      },
    },
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
        extensionValueHex: checkpointAnchorObservation.extensionValueHex,
        extensionFieldsSha256Hex: '40'.repeat(32),
        processBindingDigestHex: '41'.repeat(32),
        executionTargetIdentityDigestHex: '43'.repeat(32),
        finalSnapshot: {
          headerIdHex: checkpointAnchorObservation.anchorHeaderIdHex,
          fullHeight: 230,
        },
      },
      observation: checkpointAnchorObservation,
    },
    tracker: trackerFixture(),
    checks: {
      setupVaultMintBurnCheckpointAnchorAndTrackerCheckCompletedInOneChainLifetime:
        true,
      exactObserved0401AnchorConsumedByTrackerCandidate: true,
      exactCheckpointBoundFrozenTargetConsumedByTrackerCheck: true,
      exactFrozenSnapshotStableAcrossTrackerCheck: true,
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
      checkpointBoundFrozenTrackerExecutionObserved: true,
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
    WORKER_RECEIPT_DIGEST_DOMAIN_V8,
  );
}

function commandReceiptDigest(receipt: any): string {
  const { receiptDigestHex: _discarded, ...body } = receipt;
  return sha256CanonicalJson(body, COMMAND_RECEIPT_DIGEST_DOMAIN_V8);
}

function commandReceiptDigestV7(receipt: any): string {
  const { receiptDigestHex: _discarded, ...body } = receipt;
  return sha256CanonicalJson(body, COMMAND_RECEIPT_DIGEST_DOMAIN_V7);
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
