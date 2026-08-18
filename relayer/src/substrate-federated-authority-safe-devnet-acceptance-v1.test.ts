import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inspectBaseline: vi.fn(),
  observe: vi.fn(),
  assertObservation: vi.fn(),
  runProcess: vi.fn(),
  validateToolchain: vi.fn(),
  withOwnedProcesses: vi.fn(),
  assertOwnedProcess: vi.fn(),
  captureRecoveryTimeline: vi.fn(),
  assertRecoveryTimeline: vi.fn(),
  collectHistory: vi.fn(),
}));

vi.mock('./consensus-source-baseline.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./consensus-source-baseline.js')
  >();
  return { ...actual, inspectConsensusSourceBaseline: mocks.inspectBaseline };
});

vi.mock('./pinned-local-native-verifier-build.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./pinned-local-native-verifier-build.js')
  >();
  return {
    ...actual,
    runBoundedProcess: mocks.runProcess,
    validateNativeVerifierToolchainLock: mocks.validateToolchain,
  };
});

vi.mock(
  './substrate-federated-authority-safe-devnet-history-action-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-authority-safe-devnet-history-action-v1.js')
    >();
    return {
      ...actual,
      collectSubstrateFederatedAuthoritySafeDevnetHistoryActionV1:
        mocks.collectHistory,
    };
  },
);

vi.mock(
  './substrate-federated-authority-safe-devnet-process-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-authority-safe-devnet-process-v1.js')
    >();
    return {
      ...actual,
      withOwnedAuthoritySafeDevnetProcessesV1: mocks.withOwnedProcesses,
      assertOwnedAuthoritySafeDevnetProcessV1Receipt: mocks.assertOwnedProcess,
      captureOwnedAuthoritySafeDevnetRecoveryTimelineV1:
        mocks.captureRecoveryTimeline,
      assertOwnedAuthoritySafeDevnetRecoveryTimelineV1Material:
        mocks.assertRecoveryTimeline,
    };
  },
);

vi.mock(
  './substrate-federated-authority-safe-devnet-observation-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-authority-safe-devnet-observation-v1.js')
    >();
    return {
      ...actual,
      observeSubstrateFederatedAuthoritySafeDevnetV1: mocks.observe,
      assertSubstrateFederatedAuthoritySafeDevnetObservationV1Provenance:
        mocks.assertObservation,
    };
  },
);

import {
  acceptSubstrateFederatedAuthoritySafeDevnetV1,
  acceptSubstrateFederatedAuthoritySafeDevnetWithHistoryV1,
  assertSubstrateFederatedAuthoritySafeDevnetAcceptedHistoryV1Provenance,
  assertSubstrateFederatedAuthoritySafeDevnetAcceptanceV1Provenance,
  assertSubstrateFederatedSourceLockedRecoveryTimelineV1,
  captureSubstrateFederatedSourceLockedRecoveryTimelineV1,
  type AcceptSubstrateFederatedAuthoritySafeDevnetV1Input,
  type SubstrateFederatedAuthoritySafeDevnetAcceptedActionContextV1,
} from './substrate-federated-authority-safe-devnet-acceptance-v1.js';
import {
  loadTrackedDeploymentIdentityArtifactProfile,
} from './read-only-deployment-identity-observer.js';
import { discoverBridgeRepositoryRoot } from './bridge-repository-layout.js';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const WORKTREE_ROOT = discoverBridgeRepositoryRoot(BRIDGE_ROOT);
const BRIDGE_ADDRESS = `0x${'06'.repeat(20)}`;
const TOKEN_ADDRESS = `0x${'07'.repeat(20)}`;
const OWNER_ADDRESS = '0xf24ff3a9cf04c71dbc94d0b566f7a27b94566cac';
const FRONTIER_PATCH_SHA256 =
  'e75150b4c7a078cfa73446da904c8d33bfb8a304c396dda09a4fb9e3031ec36b';
const FRONTIER_COMMIT = '75329a2df49e2cc7981485392c31160929d1bd48';
const RUNTIME_CODE_HEX = '0x00';
const RUNTIME_CODE_SHA256 = createHash('sha256')
  .update(Buffer.from('00', 'hex'))
  .digest('hex');
const GENESIS_HASH = `0x${'88'.repeat(32)}`;
const CARGO_VERSION = 'cargo 1.82.0 (8f40fc59f 2024-08-21)';
const RUSTC_VERSION = 'rustc 1.82.0 (f6e511eec 2024-10-15)';
const GIT_VERSION = 'git version 2.54.0.windows.1';
const BINARY_VERSION = process.platform === 'win32'
  ? 'frontier-template-node.exe 0.0.0-75329a2df49'
  : 'frontier-template-node 0.0.0-75329a2df49';

const temporaryDirectories: string[] = [];
let paths: ReturnType<typeof createPaths>;
let mutateReproducedBaseSpec: ((value: Record<string, unknown>) => void) | undefined;
let mutateAcceptedSpec: ((value: Record<string, unknown>) => void) | undefined;
let mutateDuringOwnedProcess: ((nodeBinaryPath: string) => void) | undefined;
let buildSpecStderr: string;

describe('Substrate federated authority-safe devnet acceptance V1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateReproducedBaseSpec = undefined;
    mutateAcceptedSpec = undefined;
    mutateDuringOwnedProcess = undefined;
    buildSpecStderr = '2026-08-13 17:21:14 Building chain spec    \r\n';
    paths = createPaths();
    mocks.inspectBaseline.mockReturnValue(passingBaseline());
    mocks.runProcess.mockImplementation(runProcess);
    mocks.observe.mockImplementation(observation);
    mocks.validateToolchain.mockReturnValue({ errors: [] });
    mocks.withOwnedProcesses.mockImplementation(withOwnedProcesses);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const path of temporaryDirectories.splice(0)) {
      rmSync(path, { recursive: true, force: true });
    }
  });

  it('joins the exact offline build, node-accepted spec, source tests, and two-node observation', async () => {
    const result = await acceptSubstrateFederatedAuthoritySafeDevnetV1(input());

    expect(result.status).toBe('isolated_exact_authority_safe_target_accepted');
    expect(result.source).toMatchObject({
      frontierCommit: FRONTIER_COMMIT,
      frontierPatchSha256Hex: FRONTIER_PATCH_SHA256,
    });
    expect(result.binary).toEqual({
      byteLength: paths.binaryBytes.length,
      sha256Hex: sha256(paths.binaryBytes),
      version: BINARY_VERSION,
    });
    expect(result.chainSpec).toMatchObject({
      reproducedBaseByteLength: input().baseSpecBytes.length,
      reproducedBaseSha256Hex: sha256(input().baseSpecBytes),
    });
    expect(result.runtimeTests.map(test => test.name)).toEqual([
      'bridge_atomicity_tests::authority_safe_genesis_quarantines_owner_mint_without_sudo_or_active_profile',
      'bridge_atomicity_tests::inactive_profile_rejects_direct_owner_mint_before_evm_and_preserves_authoring',
    ]);
    expect(result.checks).toMatchObject({
      sourceLockedOfflineBuildPassed: true,
      freshIsolatedCargoTargetUsed: true,
      deterministicWasmPathRemappingApplied: true,
      builtInRuntimeBaseSpecReproducedExactly: true,
      exactMutualPeerIdentityAndLoopbackIsolationObservedAtActionBoundaries: true,
      generatedSpecAcceptedByExactBinary: true,
      exactTwoNodeRuntimeObservationJoined: true,
      directOwnerMintDryRunRejected: true,
      sourceLockedForwardedOwnerMintBlockRejected: true,
      spawnedNodeListenersBoundAndReleased: true,
    });
    expect(result.boundaries).toMatchObject({
      targetHistoryIntakeEligible: true,
      targetHistoryCollected: false,
      targetHistoryAuthenticated: false,
      federatedLaunchEligible: false,
      mintAuthorized: false,
      settlementAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
    expect(mocks.runProcess.mock.calls.map(call => call[0].args[0])).toEqual([
      '--version',
      '--version',
      '--version',
      'build',
      '--version',
      'build-spec',
      'test',
      'test',
      '--version',
      '--version',
      '--version',
      'build-spec',
      '--version',
      '--version',
      '--version',
    ]);
    const buildCall = mocks.runProcess.mock.calls.find(
      call => call[0].args[0] === 'build',
    )?.[0];
    const profilePath = process.platform === 'win32'
      ? process.env.USERPROFILE
      : process.env.HOME;
    expect(profilePath).toBeTruthy();
    expect(buildCall?.env?.WASM_BUILD_RUSTFLAGS).toBe([
      `--remap-path-prefix=${profilePath}=/e2s/user-profile`,
      `--remap-path-prefix=${buildCall?.env?.CARGO_TARGET_DIR}=/e2s/build-target`,
      `--remap-path-prefix=${paths.source}=/e2s/frontier-source`,
    ].join(' '));
    expect(mocks.assertObservation).toHaveBeenCalledOnce();
    expect(mocks.assertOwnedProcess).toHaveBeenCalledOnce();
    expect(() =>
      assertSubstrateFederatedAuthoritySafeDevnetAcceptanceV1Provenance(result)
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedAuthoritySafeDevnetAcceptanceV1Provenance({ ...result })
    ).toThrow(/provenance/);
  });

  it('captures a sealed recovery timeline with the exact source-built binary and generated spec', async () => {
    const { baseSpecBytes: _baseSpecBytes, ...sourceLockedInput } = input();
    const material = Object.freeze({
      process: Object.freeze({}),
      lifecycle: Object.freeze({}),
      sources: Object.freeze({}),
      snapshots: Object.freeze({}),
      receipt: Object.freeze({
        processBindingDigestHex: '41'.repeat(32),
        lifecycleDigestHex: '45'.repeat(32),
        checks: Object.freeze({
          fourSnapshotsCapturedInsideOneOwnedProcessLifetime: true,
          boundedReadSourcesSealedBeforeReturn: true,
        }),
      }),
    });
    mocks.captureRecoveryTimeline.mockResolvedValue(material);

    const result = await captureSubstrateFederatedSourceLockedRecoveryTimelineV1({
      ...sourceLockedInput,
      recoveryObservation: {
        sidechainIdHex: '42'.repeat(32),
        expectedBridgeCodeHashHex: '43'.repeat(32),
        expectedSergCodeHashHex: '44'.repeat(32),
      },
    });

    expect(mocks.captureRecoveryTimeline).toHaveBeenCalledOnce();
    const captured = mocks.captureRecoveryTimeline.mock.calls[0]?.[0];
    expect(captured).toMatchObject({
      process: {
        expectedNodeBinarySha256Hex: sha256(paths.binaryBytes),
        primaryRpcUrl: sourceLockedInput.primaryRpcUrl,
        witnessRpcUrl: sourceLockedInput.witnessRpcUrl,
      },
      observation: {
        sidechainIdHex: '42'.repeat(32),
        expectedChainId: '42',
        bridgeAddress: BRIDGE_ADDRESS,
        expectedBridgeCodeHashHex: '43'.repeat(32),
        expectedSergAddress: TOKEN_ADDRESS,
        expectedSergCodeHashHex: '44'.repeat(32),
      },
    });
    expect(Buffer.from(captured.process.chainSpecBytes)).toEqual(
      expect.any(Buffer),
    );
    const acceptedProcess = mocks.withOwnedProcesses.mock.calls[0]?.[0];
    const acceptedSpec = JSON.parse(
      Buffer.from(acceptedProcess.chainSpecBytes).toString('utf8'),
    );
    const recoverySpec = JSON.parse(
      Buffer.from(captured.process.chainSpecBytes).toString('utf8'),
    );
    expect(acceptedSpec.genesis.runtimeGenesis.patch.manualSeal).toEqual({
      enable: false,
    });
    expect(recoverySpec).toMatchObject({
      name: 'Bridge Federated Authority-Safe Recovery Drill',
      id: 'bridge_federated_authority_safe_recovery_drill',
      protocolId: 'bridge-fed-authority-safe-recovery-drill',
      genesis: {
        runtimeGenesis: {
          patch: {
            manualSeal: { enable: true },
          },
        },
      },
    });
    expect(captured.process.expectedChainSpecSha256Hex).not.toBe(
      result.acceptance.chainSpec.generatedSha256Hex,
    );
    expect(result.material).toBe(material);
    expect(result.receipt).toMatchObject({
      status: 'source_locked_recovery_timeline_captured',
      acceptanceDigestHex: result.acceptance.acceptanceDigestHex,
      nodeBinarySha256Hex: result.acceptance.binary.sha256Hex,
      acceptedTargetChainSpecSha256Hex:
        result.acceptance.chainSpec.generatedSha256Hex,
      recoveryDrillChainSpecSha256Hex:
        captured.process.expectedChainSpecSha256Hex,
      processBindingDigestHex: '41'.repeat(32),
      lifecycleDigestHex: '45'.repeat(32),
      checks: {
        exactSourceLockedAcceptanceJoined: true,
        sameExactBuiltBinaryUsedByAcceptedTargetAndRecoveryDrill: true,
        recoveryDrillSpecDerivedOnlyFromAcceptedTargetSpec: true,
        recoveryDrillManualSealEnabledAtGenesis: true,
        recoveryDrillSpecAcceptedByExactBinary: true,
        recoveryDrillSpecDistinctFromAcceptedTarget: true,
        fourSnapshotsCapturedInsideOneOwnedProcessLifetime: true,
        boundedReadSourcesSealedBeforeReturn: true,
        noProcessOrTransportCapabilityReturned: true,
      },
      boundaries: {
        recoveryDrillIsAcceptedTarget: false,
        sourceConsensusAuthenticated: false,
        sourceFinalityAuthenticated: false,
        transactionSubmissionAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(result.receipt.receiptDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(() => assertSubstrateFederatedSourceLockedRecoveryTimelineV1(result))
      .not.toThrow();
    expect(() => assertSubstrateFederatedSourceLockedRecoveryTimelineV1({
      ...result,
    })).toThrow(/provenance/i);
    const { runSubstrateFederatedDualNodeRecoveryCampaignFromTimelineV1 } =
      await import(
        './apps/bridge-daemon/substrate-federated-dual-node-recovery-campaign-v1.js'
      );
    await expect(
      runSubstrateFederatedDualNodeRecoveryCampaignFromTimelineV1({ ...result }),
    ).rejects.toThrow(/source-locked recovery timeline provenance/i);
  });

  it.runIf(process.platform === 'win32')(
    'passes the explicit MSVC discovery environment into the isolated build',
    async () => {
      const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
      expect(systemRoot).toBeTruthy();
      const systemDrive = parse(systemRoot ?? '').root.replace(/[\\/]+$/u, '');
      vi.stubEnv('LIB', 'C:\\toolchain\\lib');
      vi.stubEnv('LIBPATH', 'C:\\toolchain\\libpath');
      vi.stubEnv('INCLUDE', 'C:\\toolchain\\include');
      vi.stubEnv('SystemDrive', systemDrive);

      await acceptSubstrateFederatedAuthoritySafeDevnetV1(input());

      const buildCall = mocks.runProcess.mock.calls.find(
        call => call[0].args[0] === 'build',
      )?.[0];
      expect(buildCall?.env).toMatchObject({
        LIB: 'C:\\toolchain\\lib',
        LIBPATH: 'C:\\toolchain\\libpath',
        INCLUDE: 'C:\\toolchain\\include',
        SystemDrive: systemDrive,
      });
    },
  );

  it.runIf(process.platform === 'win32')(
    'rejects a malformed Windows drive before launching Cargo',
    async () => {
      vi.stubEnv('SystemDrive', 'C:\\unexpected');

      await expect(
        acceptSubstrateFederatedAuthoritySafeDevnetV1(input()),
      ).rejects.toThrow('SystemDrive must be one Windows drive designator');
      expect(mocks.runProcess).not.toHaveBeenCalled();
    },
  );

  it.runIf(process.platform === 'win32')(
    'rejects a valid Windows drive that differs from SystemRoot',
    async () => {
      const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
      expect(systemRoot).toBeTruthy();
      const systemDrive = parse(systemRoot ?? '').root.replace(/[\\/]+$/u, '');
      vi.stubEnv('SystemDrive', systemDrive.toUpperCase() === 'C:' ? 'D:' : 'C:');

      await expect(
        acceptSubstrateFederatedAuthoritySafeDevnetV1(input()),
      ).rejects.toThrow('SystemDrive must match the canonical SystemRoot drive');
      expect(mocks.runProcess).not.toHaveBeenCalled();
    },
  );

  it('runs the fixed history collector against the exact process-owned accepted target', async () => {
    const marker = Object.freeze({ kind: 'history-intake' as const });
    let observedContext:
      Readonly<SubstrateFederatedAuthoritySafeDevnetAcceptedActionContextV1>
      | undefined;

    mocks.collectHistory.mockImplementation(async context => {
      expect(mocks.assertOwnedProcess).not.toHaveBeenCalled();
      observedContext = context;
      return marker;
    });

    const result = await acceptSubstrateFederatedAuthoritySafeDevnetWithHistoryV1(
      input(),
    );

    expect(observedContext).toMatchObject({
      primaryRpc: {
        role: 'primary',
      },
      witnessRpc: {
        role: 'witness',
      },
      source: {
        frontierCommit: FRONTIER_COMMIT,
        frontierPatchSha256Hex: FRONTIER_PATCH_SHA256,
        runtimeCodeSha256Hex: RUNTIME_CODE_SHA256,
      },
      application: {
        bridgeAddress: BRIDGE_ADDRESS,
        tokenAddress: TOKEN_ADDRESS,
        bridgeOwnerAddress: OWNER_ADDRESS,
      },
      observation: {
        nativeGenesisHashHex: GENESIS_HASH,
        nativeTipHeight: '2',
        nativeTipHashHex: `0x${'11'.repeat(32)}`,
        evmTipHashHex: `0x${'12'.repeat(32)}`,
      },
    });
    expect('primaryRpcUrl' in observedContext!).toBe(false);
    expect('witnessRpcUrl' in observedContext!).toBe(false);
    expect(observedContext!.primaryRpc.endpointIdentityDigestHex)
      .not.toBe(observedContext!.witnessRpc.endpointIdentityDigestHex);
    await expect(observedContext!.primaryRpc.request(
      'author_submitExtrinsic' as never,
      ['0x01'],
    )).rejects.toThrow(/method is not allowed/);
    expect(result.value).toBe(marker);
    expect(mocks.assertOwnedProcess).toHaveBeenCalledOnce();
    expect(() =>
      assertSubstrateFederatedAuthoritySafeDevnetAcceptedHistoryV1Provenance(
        result,
      )
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedAuthoritySafeDevnetAcceptedHistoryV1Provenance({
        ...result,
      })
    ).toThrow(/provenance/);
    expect(() =>
      assertSubstrateFederatedAuthoritySafeDevnetAcceptanceV1Provenance(
        result.acceptance,
      )
    ).not.toThrow();
  });

  it('does not produce an acceptance when the process-owned consumer fails', async () => {
    mocks.collectHistory.mockRejectedValueOnce(
      new Error('history intake failed'),
    );

    await expect(
      acceptSubstrateFederatedAuthoritySafeDevnetWithHistoryV1(input()),
    ).rejects.toThrow(/history intake failed/);

    expect(mocks.assertOwnedProcess).not.toHaveBeenCalled();
  });

  it('rejects Cargo success when the exact source test did not execute', async () => {
    mocks.runProcess.mockImplementation(async value => {
      const result = await runProcess(value);
      if (value.args[0] !== 'test') return result;
      return {
        ...result,
        stdout: 'running 0 tests\n\ntest result: ok. 0 passed; 0 failed; 0 ignored; 0 measured',
      };
    });

    await expect(
      acceptSubstrateFederatedAuthoritySafeDevnetV1(input()),
    ).rejects.toThrow(/did not execute exactly once/);
    expect(mocks.withOwnedProcesses).not.toHaveBeenCalled();
  });

  it('rejects a patched checkout that no longer matches the complete source lock', async () => {
    mocks.inspectBaseline.mockReturnValue({
      ...passingBaseline(),
      status: 'BLOCKED',
      errors: ['patched blob drift'],
      checks: {
        ...passingBaseline().checks,
        frontierCheckoutValidated: false,
      },
    });

    await expect(
      acceptSubstrateFederatedAuthoritySafeDevnetV1(input()),
    ).rejects.toThrow(/complete source lock/);
    expect(mocks.runProcess).not.toHaveBeenCalled();
    expect(mocks.observe).not.toHaveBeenCalled();
  });

  it('rejects node acceptance that changes one generated chain-spec field', async () => {
    mutateAcceptedSpec = value => {
      value.protocolId = 'changed-protocol';
    };

    await expect(
      acceptSubstrateFederatedAuthoritySafeDevnetV1(input()),
    ).rejects.toThrow(/changed the generated authority-safe chain-spec semantics/);
    expect(mocks.observe).not.toHaveBeenCalled();
  });

  it('rejects a fresh binary whose built-in runtime does not reproduce the pinned base spec', async () => {
    mutateReproducedBaseSpec = value => {
      value.protocolId = 'different-built-runtime';
    };

    await expect(
      acceptSubstrateFederatedAuthoritySafeDevnetV1(input()),
    ).rejects.toThrow(/did not reproduce the pinned base chain spec/);
    expect(mocks.withOwnedProcesses).not.toHaveBeenCalled();
  });

  it.each([
    ['ASCII whitespace', 'frontier source'],
    ['Unicode whitespace', 'frontier\u00a0source'],
    ['equals sign', 'frontier=source'],
  ])('rejects source paths with %s in Rust flags', async (_case, directory) => {
    const ambiguousSource = join(dirname(paths.source), directory);
    mkdirSync(ambiguousSource);

    await expect(
      acceptSubstrateFederatedAuthoritySafeDevnetV1({
        ...input(),
        frontierSourcePath: ambiguousSource,
      }),
    ).rejects.toThrow(
      /must not contain Unicode whitespace, control characters, or equals signs/,
    );
    expect(
      mocks.runProcess.mock.calls.some(call => call[0].args[0] === 'build'),
    ).toBe(false);
  });

  it('rejects any chain-spec stderr outside the exact Frontier status line', async () => {
    buildSpecStderr = 'warning: unreviewed chain-spec fallback';

    await expect(
      acceptSubstrateFederatedAuthoritySafeDevnetV1(input()),
    ).rejects.toThrow(/chain-spec acceptance wrote unexpected stderr/);
    expect(mocks.observe).not.toHaveBeenCalled();
  });

  it('rejects a two-node observation that is not the exact generated target', async () => {
    mocks.observe.mockImplementation(async value => ({
      ...await observation(value),
      target: {
        ...(await observation(value)).target,
        tokenAddress: `0x${'09'.repeat(20)}`,
      },
    }));

    await expect(
      acceptSubstrateFederatedAuthoritySafeDevnetV1(input()),
    ).rejects.toThrow(/differs from the exact generated target/);
  });

  it('rejects a built node binary changed during its owned live observation', async () => {
    mutateDuringOwnedProcess = nodeBinaryPath => {
      writeFileSync(nodeBinaryPath, 'changed-during-observation');
    };

    await expect(
      acceptSubstrateFederatedAuthoritySafeDevnetV1(input()),
    ).rejects.toThrow(/built authority-safe Frontier binary SHA-256/);
  });

  it('rejects build tools outside the repository-pinned toolchain lock', async () => {
    mocks.validateToolchain.mockReturnValueOnce({ errors: ['Cargo digest drift'] });

    await expect(
      acceptSubstrateFederatedAuthoritySafeDevnetV1(input()),
    ).rejects.toThrow(/differ from the pinned toolchain lock/);
    expect(mocks.withOwnedProcesses).not.toHaveBeenCalled();
  });

  it('rejects source drift found by the post-build revalidation', async () => {
    mocks.inspectBaseline
      .mockReturnValueOnce(passingBaseline())
      .mockReturnValueOnce({
        ...passingBaseline(),
        status: 'BLOCKED',
        errors: ['post-build source drift'],
        checks: {
          ...passingBaseline().checks,
          frontierCheckoutValidated: false,
        },
      });

    await expect(
      acceptSubstrateFederatedAuthoritySafeDevnetV1(input()),
    ).rejects.toThrow(/complete source lock after build and source tests/);
    expect(mocks.withOwnedProcesses).not.toHaveBeenCalled();
  });

  it('rejects source drift found after the owned target observation', async () => {
    mocks.inspectBaseline
      .mockReturnValueOnce(passingBaseline())
      .mockReturnValueOnce(passingBaseline())
      .mockReturnValueOnce({
        ...passingBaseline(),
        status: 'BLOCKED',
        errors: ['post-observation source drift'],
        checks: {
          ...passingBaseline().checks,
          frontierCheckoutValidated: false,
        },
      });

    await expect(
      acceptSubstrateFederatedAuthoritySafeDevnetV1(input()),
    ).rejects.toThrow(/complete source lock after target observation/);
    expect(mocks.withOwnedProcesses).toHaveBeenCalledOnce();
  });

  it('rejects toolchain drift found after the owned target observation', async () => {
    mocks.validateToolchain
      .mockReturnValueOnce({ errors: [] })
      .mockReturnValueOnce({ errors: [] })
      .mockReturnValueOnce({ errors: ['post-observation Cargo drift'] });

    await expect(
      acceptSubstrateFederatedAuthoritySafeDevnetV1(input()),
    ).rejects.toThrow(/differ from the pinned toolchain lock/);
    expect(mocks.withOwnedProcesses).toHaveBeenCalledOnce();
  });
});

function createPaths() {
  const root = mkdtempSync(join(tmpdir(), 'fed6g1c-acceptance-test-'));
  temporaryDirectories.push(root);
  const source = join(root, 'frontier');
  const tools = join(root, 'tools');
  mkdirSync(source);
  mkdirSync(tools);
  const cargo = join(tools, process.platform === 'win32' ? 'cargo.exe' : 'cargo');
  const rustc = join(tools, process.platform === 'win32' ? 'rustc.exe' : 'rustc');
  const git = join(tools, process.platform === 'win32' ? 'git.exe' : 'git');
  const binaryBytes = Buffer.from('source-locked-frontier-binary');
  writeFileSync(cargo, 'cargo');
  writeFileSync(rustc, 'rustc');
  writeFileSync(git, 'git');
  return { source, cargo, rustc, git, binaryBytes };
}

function input(): AcceptSubstrateFederatedAuthoritySafeDevnetV1Input {
  const baseSpecBytes = Buffer.from(JSON.stringify(baseSpec()));
  return {
    worktreeRoot: WORKTREE_ROOT,
    bridgeRoot: BRIDGE_ROOT,
    frontierSourcePath: paths.source,
    cargoExecutablePath: paths.cargo,
    rustcExecutablePath: paths.rustc,
    gitExecutablePath: paths.git,
    baseSpecBytes,
    expectedChainId: 42n,
    bridgeAddress: BRIDGE_ADDRESS,
    tokenAddress: TOKEN_ADDRESS,
    bridgeOwnerAddress: OWNER_ADDRESS,
    expectedBaseSpecSha256Hex: sha256(baseSpecBytes),
    expectedFrontierCommit: FRONTIER_COMMIT,
    expectedFrontierPatchSha256Hex: FRONTIER_PATCH_SHA256,
    expectedRuntimeCodeSha256Hex: RUNTIME_CODE_SHA256,
    expectedSudoAddress: OWNER_ADDRESS,
    expectedFrontierBinaryVersion: BINARY_VERSION,
    primaryRpcUrl: 'http://127.0.0.1:9955',
    witnessRpcUrl: 'http://127.0.0.1:9956',
    primaryP2pPort: 30355,
    witnessP2pPort: 30356,
    primaryPrometheusPort: 9615,
    witnessPrometheusPort: 9616,
    expectedNativeGenesisHashHex: GENESIS_HASH,
    expectedNodeName: 'Frontier Template Node',
    expectedNodeVersion: '0.0.0-75329a2df49',
    signedLegacyOwnerMintTransactionHex: '0x01',
  };
}

async function runProcess(value: Readonly<{
  executablePath: string;
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
}>): Promise<Readonly<{
  pid: number;
  exitCode: 0;
  stdout: string;
  stderr: string;
}>> {
  let stdout = '';
  let stderr = '';
  if (value.args[0] === '--version') {
    stdout = value.executablePath === paths.cargo
      ? CARGO_VERSION
      : value.executablePath === paths.rustc
        ? RUSTC_VERSION
        : value.executablePath === paths.git
          ? GIT_VERSION
          : BINARY_VERSION;
  } else if (value.args[0] === 'build') {
    const target = value.env?.CARGO_TARGET_DIR;
    if (!target) throw new Error('mocked Cargo build requires CARGO_TARGET_DIR');
    const binary = join(
      target,
      'debug',
      process.platform === 'win32'
        ? 'frontier-template-node.exe'
        : 'frontier-template-node',
    );
    mkdirSync(dirname(binary), { recursive: true });
    writeFileSync(binary, paths.binaryBytes);
    stderr = 'Finished dev profile';
  } else if (value.args[0] === 'test') {
    stdout = [
      `test ${value.args[5]} ... ok`,
      '',
      'test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out',
    ].join('\n');
  } else if (value.args[0] === 'build-spec') {
    if (value.args[2] === 'dev') {
      const spec = baseSpec();
      mutateReproducedBaseSpec?.(spec);
      stdout = JSON.stringify(spec);
    } else {
      const spec = JSON.parse(readFileSync(value.args[2], 'utf8')) as Record<string, unknown>;
      mutateAcceptedSpec?.(spec);
      stdout = `${JSON.stringify(sortObjectKeys(spec), null, 2)}\n`;
    }
    stderr = buildSpecStderr;
  } else {
    throw new Error(`unexpected mocked process: ${value.args.join(' ')}`);
  }
  return { pid: 1, exitCode: 0, stdout, stderr };
}

async function withOwnedProcesses(
  value: Readonly<{
    nodeBinaryPath: string;
    primaryRpcUrl: string;
    witnessRpcUrl: string;
  }>,
  action: (endpoints: Readonly<{
    primaryRpcUrl: string;
    witnessRpcUrl: string;
  }>) => Promise<unknown>,
) {
  const result = await action({
    primaryRpcUrl: value.primaryRpcUrl,
    witnessRpcUrl: value.witnessRpcUrl,
  });
  mutateDuringOwnedProcess?.(value.nodeBinaryPath);
  return {
    value: result,
    receipt: {
      schema: 'e2s.substrate-federated-authority-safe-devnet-process.v1',
      version: 1,
      nodeBinarySha256Hex: sha256(paths.binaryBytes),
      chainSpecSha256Hex: '31'.repeat(32),
      primaryPeerIdSha256Hex: '32'.repeat(32),
      witnessPeerIdSha256Hex: '33'.repeat(32),
      processBindingDigestHex: '34'.repeat(32),
      checks: {
        freshArchiveStateUsed: true,
        runningImageIdentityBoundForBothNodes: true,
        chainSpecFileRecheckedBeforeBothLaunchesAndAfterAction: true,
        rpcP2pAndPrometheusListenersOwnedBySpawnedProcesses: true,
        allListenersBoundToLoopback: true,
        exactMutualPeerIdentityObservedAtActionBoundaries: true,
        exactBinaryRecheckedAfterAction: true,
        bothProcessesStoppedAndListenersReleased: true,
      },
    },
  };
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortObjectKeys(child)]),
    );
  }
  return value;
}

async function observation(
  value: Readonly<Record<string, unknown>>,
) {
  const profile = loadTrackedDeploymentIdentityArtifactProfile(BRIDGE_ROOT);
  const expected = value as unknown as {
    expectedChainId: bigint;
    expectedNativeGenesisHashHex: string;
    expectedNodeName: string;
    expectedNodeVersion: string;
    expectedRuntimeCodeBytes: number;
    expectedRuntimeCodeSha256Hex: string;
    expectedStorageLayoutDigestHex: string;
    bridgeAddress: string;
    tokenAddress: string;
    bridgeOwnerAddress: string;
  };
  return {
    schema: 'e2s.substrate-federated-authority-safe-devnet-observation.v1' as const,
    version: 1 as const,
    status: 'isolated_two_node_runtime_observation' as const,
    target: {
      chainName: 'Bridge Federated Authority-Safe Target',
      chainId: expected.expectedChainId.toString(),
      nativeGenesisHashHex: expected.expectedNativeGenesisHashHex,
      nodeName: expected.expectedNodeName,
      nodeVersion: expected.expectedNodeVersion,
      runtimeCodeBytes: expected.expectedRuntimeCodeBytes,
      runtimeCodeSha256Hex: expected.expectedRuntimeCodeSha256Hex,
      storageLayoutDigestHex: expected.expectedStorageLayoutDigestHex,
      bridgeAddress: expected.bridgeAddress,
      tokenAddress: expected.tokenAddress,
      bridgeOwnerAddress: expected.bridgeOwnerAddress,
    },
    view: {
      nativeTipHeight: '2',
      nativeTipHashHex: `0x${'11'.repeat(32)}`,
      evmTipHashHex: `0x${'12'.repeat(32)}`,
      runtimeSpecName: 'frontier-template-runtime',
      runtimeSpecVersion: 1,
      bridgeRuntimeByteLength: profile.bridge.runtimeByteLength,
      bridgeRuntimeBytecodeSha256Hex: profile.bridge.runtimeBytecodeSha256Hex,
      tokenRuntimeByteLength: profile.token.runtimeByteLength,
      tokenRuntimeBytecodeSha256Hex: profile.token.runtimeBytecodeSha256Hex,
      deploymentIdentityCandidateDigestHex: '13'.repeat(32),
      viewDigestHex: '14'.repeat(32),
    },
    sourceAgreement: {
      sourceCount: 2 as const,
      sourceIdsHex: ['15'.repeat(32), '16'.repeat(32)],
      peerIds: ['peer-primary', 'peer-witness'],
      bothNodesConnected: true as const,
      consensusDigestHex: '17'.repeat(32),
    },
    legacyOwnerMintProbe: {
      ethereumTransactionHashHex: `0x${'18'.repeat(32)}`,
      signedTransactionSha256Hex: '19'.repeat(32),
      dryRunExtrinsicSha256Hex: '20'.repeat(32),
      signerAddress: OWNER_ADDRESS,
      recipientAddress: `0x${'08'.repeat(20)}`,
      amount: '1',
      ergoBoxIdHex: `0x${'21'.repeat(32)}`,
      nonce: '0',
      resultHex: '0x010007b5' as const,
    },
    checks: {
      exactNativeGenesisObserved: true as const,
      matchingNativeAndEvmTipsObserved: true as const,
      exactRuntimeCodeObserved: true as const,
      exactStorageLayoutPinVerified: true as const,
      exactApplicationRuntimeObservedAtGenesisAndTip: true as const,
      exactApplicationBindingsObservedAtGenesisAndTip: true as const,
      typedLegacyMintQuarantineObservedAtGenesisAndTip: true as const,
      sudoAbsentAtGenesisAndTip: true as const,
      allPegInProfilesAbsentAtGenesisAndTip: true as const,
      allPegInEnforcementAbsentAtGenesisAndTip: true as const,
      directLegacyOwnerMintRejectedByRuntimePolicy: true as const,
    },
    boundaries: {
      twoNodeRuntimeIdentityObserved: true as const,
      independentSourceOriginsEstablished: true as const,
      independentSourceAdministrationEstablished: false as const,
      exactBinaryIdentityObserved: false as const,
      exactGeneratedSpecAcceptanceObserved: false as const,
      indirectOwnerMintBlockRejectionObserved: false as const,
      sourceHistoryAuthenticated: false as const,
      sourceFinalityAuthenticated: false as const,
      federatedLaunchEligible: false as const,
      mintAuthorized: false as const,
      settlementAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      profileActivated: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
    observationDigestHex: '22'.repeat(32),
  };
}

function passingBaseline() {
  return {
    schemaVersion: 1 as const,
    kind: 'bridge-consensus-source-baseline-report' as const,
    status: 'PASS' as const,
    errors: [] as string[],
    checks: {
      lockBindingsValidated: true,
      solidityBuildClosureArtifactsValidated: true,
      frontierCheckoutRequired: true,
      frontierCheckoutValidated: true,
      ergoCheckoutRequired: false,
      ergoCheckoutValidated: false,
    },
    sourceIdentity: {
      solidityBuildManifestSha256: '23'.repeat(32),
      frontierCommit: FRONTIER_COMMIT,
      frontierPatchSha256: FRONTIER_PATCH_SHA256,
      ergoBaseCommit: null,
      ergoPatchSha256: null,
    },
    boundaries: {
      sidechainFinalityImplemented: false,
      runtimeCommitmentProducerImplemented: true,
      grandpaAuthorityTransitionVerificationImplemented: true,
      hashLinkedGrandpaVerificationImplemented: true,
      nativeRuntimeCommitmentStateVerificationImplemented: true,
      nativeFinalizedCheckpointVerificationImplemented: true,
      nativeRpcProofCodecImplemented: true,
      trustlessBurnVerificationImplemented: false,
      gate5Closed: false,
    },
  };
}

function baseSpec() {
  return {
    name: 'Development',
    id: 'dev',
    chainType: 'Development',
    bootNodes: [] as string[],
    telemetryEndpoints: null,
    protocolId: null,
    genesis: {
      runtimeGenesis: {
        code: RUNTIME_CODE_HEX,
        patch: {
          sudo: { key: OWNER_ADDRESS },
          manualSeal: { enable: false },
          evmChainId: { chainId: 42 },
          evm: {
            accounts: {
              '0x1000000000000000000000000000000000000001': {
                balance: '0x1', code: [0], nonce: '0x1', storage: {},
              },
            },
          },
        },
      },
    },
  };
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
