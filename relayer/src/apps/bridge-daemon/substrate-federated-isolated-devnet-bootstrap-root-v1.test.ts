import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocked = vi.hoisted(() => ({
  build: vi.fn(),
  lifecycle: vi.fn(),
  process: vi.fn(),
  setup: vi.fn(),
  claim: vi.fn(),
  packet: vi.fn(),
  sourceHistory: vi.fn(),
  rewardDiscovery: vi.fn(),
  ergoHistory: vi.fn(),
}));

vi.mock(
  '../../substrate-federated-isolated-devnet-ergo-node-build-v1.js',
  () => ({
    buildSubstrateFederatedIsolatedDevnetErgoNodeV1: mocked.build,
  }),
);
vi.mock(
  '../../substrate-federated-isolated-devnet-bootstrap-lifecycle-v1.js',
  () => ({
    runSubstrateFederatedIsolatedDevnetBootstrapLifecycleV1:
      mocked.lifecycle,
  }),
);
vi.mock(
  '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js',
  () => ({
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_PROCESS_V1_SCHEMA:
      'e2s.substrate-federated-isolated-devnet-ergo-node-process.v1',
    createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1: mocked.process,
  }),
);
vi.mock(
  '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js',
  () => ({
    claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2:
      mocked.claim,
    createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2: mocked.setup,
  }),
);
vi.mock(
  '../../substrate-federated-isolated-devnet-packet-producer-v1.js',
  () => ({
    createSubstrateFederatedIsolatedDevnetPacketSessionV1: mocked.packet,
  }),
);
vi.mock(
  '../../substrate-federated-authority-safe-devnet-history-v1.js',
  () => ({
    collectSubstrateFederatedAuthoritySafeDevnetHistoryV1:
      mocked.sourceHistory,
  }),
);
vi.mock(
  '../../substrate-federated-isolated-devnet-reward-input-discovery-v1.js',
  () => ({
    discoverSubstrateFederatedRewardInputsV1: mocked.rewardDiscovery,
    SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN:
      'http://127.0.0.1:9051',
    SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN:
      'http://127.0.0.1:9052',
  }),
);
vi.mock(
  '../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js',
  () => ({
    collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1:
      mocked.ergoHistory,
  }),
);

import {
  runSubstrateFederatedIsolatedDevnetBootstrapRootV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_STATIC_CALLBACK_MANIFEST_DIGEST_V1,
} from './substrate-federated-isolated-devnet-bootstrap-root-v1.js';

const PROCESS_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-ergo-node-process.v1';
const MINING_CREDENTIAL = Object.freeze({
  schema: 'e2s.substrate-federated-isolated-devnet-mining-credential.v1',
  version: 1,
});

describe('isolated devnet static bootstrap root V1', () => {
  let order: string[];
  let processReceipt: ReturnType<typeof validProcessReceipt>;
  let lifecycleReceipt: ReturnType<typeof validLifecycleReceipt>;
  let processSession: ReturnType<typeof validProcessSession>;

  beforeEach(() => {
    vi.clearAllMocks();
    order = [];
    processReceipt = validProcessReceipt();
    lifecycleReceipt = validLifecycleReceipt(processReceipt);
    processSession = validProcessSession(processReceipt, order);

    mocked.build.mockImplementation(async () => {
      order.push('build');
      return validBuild();
    });
    mocked.setup.mockImplementation(async () => {
      order.push('setup');
      return {
        signer: setupSigner(),
        dispose: vi.fn(),
        run: vi.fn(async () => ({ receiptDigestHex: digest('a') })),
      };
    });
    mocked.claim.mockReturnValue(MINING_CREDENTIAL);
    mocked.packet.mockImplementation(() => ({
      signer: {
        sourceAttestationThreshold: 2,
        sourceAttestationPublicKeysHex: [publicKey('2'), publicKey('3'), publicKey('4')],
        ergoAdmissionThreshold: 1,
        ergoAdmissionPublicKeysHex: [setupSigner().publicKeyHex],
      },
      dispose: vi.fn(),
      produce: vi.fn(async () => ({
        receipt: { receiptDigestHex: digest('9') },
      })),
    }));
    mocked.process.mockImplementation(() => {
      order.push('process');
      return processSession;
    });
    mocked.sourceHistory.mockResolvedValue({ receipt: { historyDigestHex: digest('b') } });
    mocked.rewardDiscovery.mockResolvedValue({ reportDigestHex: digest('c') });
    mocked.ergoHistory.mockResolvedValue({ receipt: { reportDigestHex: digest('d') } });
    mocked.lifecycle.mockImplementation(async (_input, ports) => {
      const setup = await ports.createSetupSession();
      const packet = ports.createPacketSession(setup.signer);
      const node = ports.createErgoNodeSession(nodeBinding());
      try {
        await node.startMining();
        await node.withMiningStoppedReadOnlyTarget(async () => {
          const source = await ports.collectSourceHistory({});
          const discovery = await ports.discoverRewardInputs(setup.signer);
          const ergo = await ports.collectErgoHistory(discovery);
          await packet.produce({ sourceHistory: source, ergoHistory: ergo });
          await setup.run({});
          return Object.freeze({ complete: true });
        });
        return lifecycleReceipt;
      } finally {
        packet.dispose();
        setup.dispose();
        await node.stop();
      }
    });
  });

  it('owns the exact static joins and returns only a path-free receipt', async () => {
    const result = await runSubstrateFederatedIsolatedDevnetBootstrapRootV1(
      rootInput(),
    );
    expect(order.slice(0, 3)).toEqual(['build', 'setup', 'process']);
    expect(mocked.setup).toHaveBeenCalledTimes(1);
    expect(mocked.claim).toHaveBeenCalledTimes(1);
    expect(mocked.process).toHaveBeenCalledWith(
      expect.any(Object),
      nodeBinding(),
      MINING_CREDENTIAL,
    );
    expect(mocked.packet).toHaveBeenCalledTimes(1);
    expect(mocked.sourceHistory).toHaveBeenCalledTimes(1);
    expect(mocked.rewardDiscovery).toHaveBeenCalledTimes(1);
    expect(mocked.ergoHistory).toHaveBeenCalledTimes(1);
    expect(result.receipt.staticCallbackManifestDigestHex)
      .toBe(
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_STATIC_CALLBACK_MANIFEST_DIGEST_V1,
      );
    expect(result.receipt.process.receipt).toEqual(processReceipt);
    expect(result.receipt.checks.staticRuntimePortsBound).toBe(true);
    expect(result.receipt.checks.producerCompletionAwaitedBeforeTeardown)
      .toBe(true);
    expect(result.receipt.checks.rootLevelTimeoutRaceAbsent).toBe(true);
    expect(result.receipt.boundaries.transitiveProducerCancellationEstablished)
      .toBe(false);
    expect(result.receipt.boundaries.submissionAuthorized).toBe(false);
    expect(result.receipt.boundaries.broadcastAuthorized).toBe(false);
    expect(result.receipt.boundaries.gate5Closed).toBe(false);
    expect(result.receipt.receiptDigestHex).toMatch(/^[0-9a-f]{64}$/u);
    expect(containsFunction(result)).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /(?:^|[^A-Za-z])[A-Za-z]:[\\/]/u,
    );
  });

  it('does not create signer or process capability when the exact build fails', async () => {
    mocked.build.mockRejectedValueOnce(new Error('build rejected'));
    await expect(
      runSubstrateFederatedIsolatedDevnetBootstrapRootV1(rootInput()),
    ).rejects.toThrow(/build rejected/);
    expect(mocked.setup).not.toHaveBeenCalled();
    expect(mocked.process).not.toHaveBeenCalled();
  });

  it('rejects a process receipt that is not joined to the lifecycle receipt', async () => {
    processReceipt = {
      ...processReceipt,
      processBindingDigestHex: digest('e'),
    };
    processSession = validProcessSession(processReceipt, order);
    mocked.process.mockReturnValue(processSession);
    await expect(
      runSubstrateFederatedIsolatedDevnetBootstrapRootV1(rootInput()),
    ).rejects.toThrow(/does not bind the exact full process receipt/);
    expect(processSession.stop).toHaveBeenCalledTimes(1);
  });

  it('rejects a lifecycle that never exercises the owned node adapter', async () => {
    mocked.lifecycle.mockResolvedValueOnce(lifecycleReceipt);
    await expect(
      runSubstrateFederatedIsolatedDevnetBootstrapRootV1(rootInput()),
    ).rejects.toThrow(/process receipt must be an object/);
  });

  it('rejects missing or unknown process-receipt fields', async () => {
    const {
      managedActionOverrunRejectedAfterJoin: _omitted,
      ...missingCheck
    } = processReceipt.checks;
    processReceipt = {
      ...processReceipt,
      checks: missingCheck,
    } as ReturnType<typeof validProcessReceipt>;
    processSession = validProcessSession(processReceipt, order);
    mocked.process.mockReturnValue(processSession);
    await expect(
      runSubstrateFederatedIsolatedDevnetBootstrapRootV1(rootInput()),
    ).rejects.toThrow(/process checks fields differ from V1/);

    processReceipt = {
      ...validProcessReceipt(),
      unexpectedAuthority: true,
    } as ReturnType<typeof validProcessReceipt>;
    processSession = validProcessSession(processReceipt, order);
    mocked.process.mockReturnValue(processSession);
    await expect(
      runSubstrateFederatedIsolatedDevnetBootstrapRootV1(rootInput()),
    ).rejects.toThrow(/process receipt fields differ from V1/);
  });

  it('rejects fixed-origin and snapshot drift in the process receipt', async () => {
    processReceipt = {
      ...processReceipt,
      primaryNodeOrigin: 'http://127.0.0.1:19051',
    } as unknown as ReturnType<typeof validProcessReceipt>;
    processSession = validProcessSession(processReceipt, order);
    mocked.process.mockReturnValue(processSession);
    await expect(
      runSubstrateFederatedIsolatedDevnetBootstrapRootV1(rootInput()),
    ).rejects.toThrow(/does not bind the exact full process receipt/);

    processReceipt = {
      ...validProcessReceipt(),
      finalSnapshot: {
        ...validProcessReceipt().finalSnapshot,
        indexedHeight: 9,
        fullHeight: 8,
      },
    } as unknown as ReturnType<typeof validProcessReceipt>;
    processSession = validProcessSession(processReceipt, order);
    mocked.process.mockReturnValue(processSession);
    await expect(
      runSubstrateFederatedIsolatedDevnetBootstrapRootV1(rootInput()),
    ).rejects.toThrow(/does not bind the exact full process receipt/);

    processReceipt = {
      ...validProcessReceipt(),
      finalSnapshot: {
        ...validProcessReceipt().finalSnapshot,
        indexedHeight: 8,
        fullHeight: 9,
      },
    } as unknown as ReturnType<typeof validProcessReceipt>;
    processSession = validProcessSession(processReceipt, order);
    mocked.process.mockReturnValue(processSession);
    await expect(
      runSubstrateFederatedIsolatedDevnetBootstrapRootV1(rootInput()),
    ).rejects.toThrow(/does not bind the exact full process receipt/);
  });

  it('keeps runtime producers static and exposes no injectable port surface', () => {
    expect(SUBSTRATE_FEDERATED_ISOLATED_DEVNET_STATIC_CALLBACK_MANIFEST_DIGEST_V1)
      .toBe('5879db9176ef7d3216b513695abbe1d211469584ed65c478bbe2c0db19ed800f');
    const source = readFileSync(
      join(
        import.meta.dirname,
        'substrate-federated-isolated-devnet-bootstrap-root-v1.ts',
      ),
      'utf8',
    );
    expect(source).toContain('const STATIC_CALLBACK_MANIFEST');
    expect(source).toContain('replacementCallbackAccepted: false');
    expect(source).toContain('Object.freeze(ports)');
    expect(source).not.toContain('Promise.race([');
    expect(source).not.toContain('boundedOperation');
    expect(source).not.toMatch(/export interface .*Deps|readonly ports:/u);
  });
});

function validBuild() {
  const receipt = {
    schema: 'e2s.substrate-federated-isolated-devnet-ergo-node-build.v1',
    version: 1,
    status: 'exact_locked_patched_node_built',
    source: {
      consensusSourceLockSha256Hex: digest('1'),
      sourceBaselineDigestHex: digest('2'),
      ergoNodeBaseCommit: '1'.repeat(40),
      ergoPatchSha256Hex: digest('3'),
    },
    toolchain: {
      platform: 'win32-x64',
      gitVersion: '2.54.0.windows.1',
      gitExecutableSha256Hex: digest('4'),
      javaMajorVersion: 17,
      javaDistribution: 'Microsoft OpenJDK 17.0.19+10-LTS',
      javaHomeSha256Hex: digest('5'),
      javaExecutableSha256Hex: digest('6'),
      sbtLauncherJarSha256Hex: digest('7'),
      projectSbtVersion: '1.11.1',
    },
    build: {
      invocation:
        'reviewed Windows Job Object -> java -jar <pinned-sbt-launcher> assembly',
      processRunner: 'reviewed-windows-job-object-v1',
      processRunnerSha256Hex: digest('9'),
      timeoutMs: 900_000,
      terminationGraceMs: 10_000,
      maxOutputBytes: 33_554_432,
      artifactName: 'ergo-reviewed-SNAPSHOT.jar',
      artifactBytes: 78_000_000,
      artifactSha256Hex: digest('8'),
    },
    checks: {
      exactTrackedRuntimeLockConsumed: true,
      exactConsensusSourceLockConsumed: true,
      exactPatchedSourceValidatedBeforeBuild: true,
      exactPatchedSourceRevalidatedAfterBuild: true,
      completeJavaDistributionValidatedBeforeAndAfterBuild: true,
      pinnedGitExecutableValidatedBeforeAndAfterBuild: true,
      pinnedSbtLauncherValidatedBeforeAndAfterBuild: true,
      reviewedWindowsJobObjectRunnerPinnedBeforeAndAfterBuild: true,
      fixedJavaArgumentsLaunchedWithoutShell: true,
      inheritedBuildEnvironmentMinimized: true,
      preexistingAssemblyCandidatesRejected: true,
      assemblyPathChainLinkFree: true,
      buildProcessTimeBound: true,
      buildProcessTreeTerminationBounded: true,
      singleFreshAssemblySelected: true,
    },
    buildIdentityDigestHex: digest('f'),
    boundaries: {
      loadedBytesAttestedAgainstHostileSameUserProcess: false,
      dependencyCacheContentAttested: false,
      independentBuildAttestationVerified: false,
      targetNodeAcceptanceEstablished: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    },
  } as const;
  return {
    receipt,
    javaExecutablePath: 'reviewed/java.exe',
    nodeAssemblyJarPath: 'reviewed/ergo.jar',
  };
}

function validProcessReceipt() {
  return {
    schema: PROCESS_SCHEMA,
    version: 1,
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    miningStoppedBeforeAction: true,
    buildIdentityDigestHex: digest('f'),
    executableIdentityDigestHex: digest('1'),
    processBindingDigestHex: digest('2'),
    finalSnapshot: {
      network: 'devnet',
      fullHeight: 8,
      indexedHeight: 8,
      headerIdHex: digest('3'),
    },
    checks: {
      directJavaAssemblyLaunch: true,
      javaImageAndPinnedFilesRechecked: true,
      isolatedFreshRuntimeStateUsed: true,
      setupSignerSecretNeverExposedToCompositionRoot: true,
      setupSignerMiningCredentialConsumedOnce: true,
      ephemeralPowSecretPassedOnlyViaProcessEnvironment: true,
      ephemeralPowSecretDiscardedBeforeAction: true,
      miningTargetBoundToSessionPublicKey: true,
      miningPhaseStoppedBeforeTargetFreeze: true,
      sameDataDirectoriesResumedNonMining: true,
      managedActionCompletionJoinedBeforeCleanup: true,
      managedActionOverrunRejectedAfterJoin: true,
      unverifiedProcessTerminationFailsStop: true,
      exactNonMiningSnapshotStableAcrossAction: true,
      spawnedProcessListenersExclusivelyLoopbackOwned: true,
      configurationAndArtifactRecheckedAfterAction: true,
    },
  } as const;
}

function validLifecycleReceipt(processReceipt: ReturnType<typeof validProcessReceipt>) {
  return {
    profilePins: {
      federationProfileIdHex: digest('6'),
      sourceAttestationKeySetDigestHex: digest('7'),
      ergoAdmissionKeySetDigestHex: digest('8'),
    },
    ergoNodeExecution: {
      primaryNodeOrigin: processReceipt.primaryNodeOrigin,
      witnessNodeOrigin: processReceipt.witnessNodeOrigin,
      miningStoppedBeforeAction: true,
      buildIdentityDigestHex: processReceipt.buildIdentityDigestHex,
      executableIdentityDigestHex: processReceipt.executableIdentityDigestHex,
      processBindingDigestHex: processReceipt.processBindingDigestHex,
    },
    packet: { receiptDigestHex: digest('9') },
    setupCheck: { receiptDigestHex: digest('a') },
    boundaries: {
      processFreeLifecycleOrderingOnly: true,
      staticRuntimePortsBound: false,
      nodeExecutableIdentityAuthenticated: false,
      targetNodeAcceptanceEstablished: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
    },
  } as const;
}

function validProcessSession(
  receipt: ReturnType<typeof validProcessReceipt>,
  order: string[],
) {
  return {
    startMining: vi.fn(async () => {
      order.push('mining');
    }),
    withMiningStoppedReadOnlyTarget: vi.fn(async action => ({
      value: await action({
        primaryNodeOrigin: 'http://127.0.0.1:9051',
        witnessNodeOrigin: 'http://127.0.0.1:9052',
        miningStopped: true,
      }),
      receipt,
    })),
    stop: vi.fn(async () => undefined),
  };
}

function setupSigner() {
  const publicKeyHex = publicKey('1');
  return {
    publicKeyHex,
    p2pkErgoTreeHex: `0008cd${publicKeyHex}`,
    rewardInputErgoTrees: {
      delay1: `10010400d801d601b2a5e4b2a5${publicKeyHex}00d802d601b2db63087201d602e4c672010404720200d803d601b2a5e4b2a5${publicKeyHex}00d802d601b2db63087201d602e4c6720104d804d601b2a5e4b2a5${publicKeyHex}00d802d601b2db63087201d602e4c6720104`,
      delay720: `10010400d801d601b2a5e4b2a5${publicKeyHex}00d802d601b2db6308d0057201d602e4c672010404720200d803d601b2a5e4b2a5${publicKeyHex}00d802d601b2db6308d0057201d602e4c6720104d804d601b2a5e4b2a5${publicKeyHex}00d802d601b2db6308d0057201d602e4c6720104`,
    },
    networkPrefix: 16,
  } as const;
}

function nodeBinding() {
  const signer = setupSigner();
  return {
    miningTargetPublicKeyHex: signer.publicKeyHex,
    p2pkErgoTreeHex: signer.p2pkErgoTreeHex,
    rewardInputErgoTrees: signer.rewardInputErgoTrees,
    networkPrefix: 16,
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
  } as const;
}

function rootInput() {
  return {
    build: {
      worktreeRoot: 'reviewed/worktree',
      bridgeRoot: 'reviewed/bridge',
      ergoSourcePath: 'reviewed/ergo',
      gitExecutablePath: 'reviewed/git.exe',
      javaExecutablePath: 'reviewed/java.exe',
      sbtLauncherJarPath: 'reviewed/sbt-launch.jar',
    },
    lifecycle: {
      sourceHistory: {},
      relayerArtifacts: {},
    },
  } as never;
}

function digest(character: string): string {
  return character.repeat(64);
}

function publicKey(character: string): string {
  return `02${character.repeat(64)}`;
}

function containsFunction(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (Array.isArray(value)) return value.some(containsFunction);
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some(containsFunction);
  }
  return false;
}
