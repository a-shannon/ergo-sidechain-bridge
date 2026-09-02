import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';

import {
  inspectConsensusSourceBaseline,
} from './consensus-source-baseline.js';
import {
  verifyExecutableSha256,
} from './native-executable-pin.js';
import { validateReadOnlyNodeUrl } from './read-only-node-url.js';
import {
  createPinnedLocalNativeBuildWorkspace,
  EXPECTED_NATIVE_VERIFIER_TOOLCHAIN_LOCK_SHA256,
  runBoundedProcess,
  type NativeVerifierBuildToolObservation,
} from './pinned-local-native-verifier-build.js';
import {
  assertSubstrateFederatedAuthoritySafeBuildSpecStderrV1,
  buildSubstrateFederatedAuthoritySafeCargoEnvironmentV1,
  buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1,
  inspectSubstrateFederatedAuthoritySafePinnedToolchainV1,
} from './substrate-federated-authority-safe-devnet-build-environment-v1.js';
import {
  inspectSubstrateFederatedAuthoritySafePinnedProtocV1,
} from './substrate-federated-authority-safe-devnet-protoc-v1.js';
import {
  inspectSubstrateFederatedAuthoritySafePinnedRustSrcV1,
} from './substrate-federated-authority-safe-devnet-rust-src-v1.js';
import {
  buildSubstrateFederatedAuthoritySafeDevnetChainSpecV1,
  type BuildSubstrateFederatedAuthoritySafeDevnetChainSpecV1Input,
} from './substrate-federated-authority-safe-devnet-chain-spec-v1.js';
import {
  parseStrictJsonPreservingNumbers,
  stringifyJsonPreservingNumbers,
} from './substrate-federated-legacy-compatibility-devnet-chain-spec-v1.js';
import {
  assertSubstrateFederatedAuthoritySafeDevnetObservationV1Provenance,
  observeSubstrateFederatedAuthoritySafeDevnetV1,
  substrateFederatedAuthoritySafeStorageLayoutDigestV1,
  type ObserveSubstrateFederatedAuthoritySafeDevnetV1Input,
} from './substrate-federated-authority-safe-devnet-observation-v1.js';
import {
  assertOwnedAuthoritySafeDevnetRecoveryTimelineV1Material,
  assertOwnedAuthoritySafeDevnetProcessV1Receipt,
  captureOwnedAuthoritySafeDevnetRecoveryTimelineV1,
  withOwnedAuthoritySafeDevnetProcessesV1,
  type OwnedAuthoritySafeDevnetProcessV1Input,
  type OwnedAuthoritySafeDevnetRecoveryTimelineV1Material,
} from './substrate-federated-authority-safe-devnet-process-v1.js';
import {
  collectSubstrateFederatedAuthoritySafeDevnetHistoryActionV1,
  type CollectedHistoryActionV1,
  type SubstrateFederatedAuthoritySafeDevnetAcceptedActionContextV1,
  type SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcMethodV1,
  type SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcV1,
} from './substrate-federated-authority-safe-devnet-history-action-v1.js';
import {
  createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1,
  projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1,
  type SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1,
} from './relayer-core/substrate-federated-authority-safe-devnet-source-failure-phase-v1.js';
import { parseStrictJson } from './strict-json.js';

export type {
  SubstrateFederatedAuthoritySafeDevnetAcceptedActionContextV1,
  SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcMethodV1,
  SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcV1,
} from './substrate-federated-authority-safe-devnet-history-action-v1.js';

export const SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_ACCEPTANCE_V1_SCHEMA =
  'e2s.substrate-federated-authority-safe-devnet-acceptance.v1' as const;
export const SUBSTRATE_FEDERATED_SOURCE_LOCKED_RECOVERY_TIMELINE_V1_SCHEMA =
  'e2s.substrate-federated-source-locked-recovery-timeline.v1' as const;

const RECOVERY_DRILL_CHAIN_NAME =
  'Bridge Federated Authority-Safe Recovery Drill';
const RECOVERY_DRILL_CHAIN_ID =
  'bridge_federated_authority_safe_recovery_drill';
const RECOVERY_DRILL_PROTOCOL_ID =
  'bridge-fed-authority-safe-recovery-drill';

const BUILD_TIMEOUT_MS = 10 * 60_000;
const TEST_TIMEOUT_MS = 10 * 60_000;
const SHORT_PROCESS_TIMEOUT_MS = 30_000;
const MAX_BUILD_OUTPUT_BYTES = 1024 * 1024;
const MAX_TEST_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_CHAIN_SPEC_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_ACCEPTED_ACTION_RPC_RESPONSE_BYTES = 8 * 1024 * 1024;
const FRONTIER_PACKAGE = 'frontier-template-node';
const SOURCE_TESTS = Object.freeze([
  'bridge_atomicity_tests::authority_safe_genesis_quarantines_owner_mint_without_sudo_or_active_profile',
  'bridge_atomicity_tests::inactive_profile_rejects_direct_owner_mint_before_evm_and_preserves_authoring',
] as const);
const ACCEPTED_ACTION_RPC_METHODS = new Set<
  SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcMethodV1
>([
  'chain_getBlockHash',
  'chain_getFinalizedHead',
  'chain_getHeader',
  'state_getStorage',
  'eth_getBlockByNumber',
  'eth_getCode',
]);

const ACCEPTANCES = new WeakSet<object>();
const ACTION_RESULTS = new WeakSet<object>();
const SOURCE_LOCKED_RECOVERY_TIMELINES = new WeakSet<object>();

export interface AcceptSubstrateFederatedAuthoritySafeDevnetV1Input
  extends BuildSubstrateFederatedAuthoritySafeDevnetChainSpecV1Input,
    Omit<
      ObserveSubstrateFederatedAuthoritySafeDevnetV1Input,
      | 'bridgeRoot'
      | 'expectedChainId'
      | 'expectedChainName'
      | 'bridgeAddress'
      | 'tokenAddress'
      | 'bridgeOwnerAddress'
      | 'expectedRuntimeCodeBytes'
      | 'expectedRuntimeCodeSha256Hex'
      | 'expectedStorageLayoutDigestHex'
    > {
  readonly worktreeRoot: string;
  readonly frontierSourcePath: string;
  readonly cargoExecutablePath: string;
  readonly rustcExecutablePath: string;
  readonly gitExecutablePath: string;
  readonly expectedFrontierBinaryVersion: string;
  readonly primaryP2pPort: number;
  readonly witnessP2pPort: number;
  readonly primaryPrometheusPort: number;
  readonly witnessPrometheusPort: number;
}

export interface SubstrateFederatedAuthoritySafeDevnetBuildWorkspaceV1 {
  readonly temporaryDirectoryRoot: string;
  readonly sharedCargoHomeRoot: string;
}

export interface SubstrateFederatedAuthoritySafeDevnetAcceptanceV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_ACCEPTANCE_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'isolated_exact_authority_safe_target_accepted';
  readonly source: Readonly<{
    readonly frontierCommit: string;
    readonly frontierPatchSha256Hex: string;
    readonly checkoutDigestHex: string;
  }>;
  readonly toolchain: Readonly<{
    readonly lockSha256Hex: string;
    readonly platformKey: string;
    readonly rustTarget: string;
    readonly cargo: Readonly<{ readonly version: string; readonly sha256Hex: string }>;
    readonly rustc: Readonly<{ readonly version: string; readonly sha256Hex: string }>;
    readonly git: Readonly<{ readonly version: string; readonly sha256Hex: string }>;
  }>;
  readonly binary: Readonly<{
    readonly byteLength: number;
    readonly sha256Hex: string;
    readonly version: string;
  }>;
  readonly chainSpec: Readonly<{
    readonly reproducedBaseByteLength: number;
    readonly reproducedBaseSha256Hex: string;
    readonly generatedByteLength: number;
    readonly generatedSha256Hex: string;
    readonly nodeAcceptedByteLength: number;
    readonly nodeAcceptedSha256Hex: string;
    readonly semanticDigestHex: string;
  }>;
  readonly runtimeTests: readonly Readonly<{
    readonly name: typeof SOURCE_TESTS[number];
    readonly outputDigestHex: string;
  }>[];
  readonly observation: Readonly<{
    readonly nativeGenesisHashHex: string;
    readonly nativeTipHeight: string;
    readonly runtimeCodeSha256Hex: string;
    readonly storageLayoutDigestHex: string;
    readonly twoNodeConsensusDigestHex: string;
    readonly observationDigestHex: string;
  }>;
  readonly processes: Readonly<{
    readonly primaryPeerIdSha256Hex: string;
    readonly witnessPeerIdSha256Hex: string;
    readonly processBindingDigestHex: string;
  }>;
  readonly checks: Readonly<{
    readonly exactPatchedSourceCheckoutVerifiedBeforeAndAfter: true;
    readonly exactLockedToolchainVerifiedBeforeAndAfter: true;
    readonly sourceLockedOfflineBuildPassed: true;
    readonly freshIsolatedCargoTargetUsed: true;
    readonly deterministicWasmPathRemappingApplied: true;
    readonly builtInRuntimeBaseSpecReproducedExactly: true;
    readonly runningNodeImageIdentityBoundForBothNodesAndVerifiedBeforeAndAfter: true;
    readonly exactMutualPeerIdentityAndLoopbackIsolationObservedAtActionBoundaries: true;
    readonly spawnedNodeListenersBoundAndReleased: true;
    readonly generatedSpecAcceptedByExactBinary: true;
    readonly nodeAcceptedSpecSemanticallyMatchesGeneratedSpec: true;
    readonly exactTwoNodeRuntimeObservationJoined: true;
    readonly directOwnerMintDryRunRejected: true;
    readonly sourceLockedDirectOwnerMintBlockRejected: true;
    readonly sourceLockedForwardedOwnerMintBlockRejected: true;
    readonly typedQuarantineAndAbsentAuthorityStateObserved: true;
  }>;
  readonly boundaries: Readonly<{
    readonly exactAuthoritySafeTargetIdentityObserved: true;
    readonly targetHistoryIntakeEligible: true;
    readonly targetHistoryCollected: false;
    readonly targetHistoryAuthenticated: false;
    readonly independentSourceAdministrationEstablished: false;
    readonly sourceFinalityAuthenticated: false;
    readonly completeBuildToolClosureVerified: false;
    readonly dependencyCacheContentAttested: false;
    readonly independentBuildAttestationVerified: false;
    readonly syntheticDryRunProbeOnly: true;
    readonly probeSubmitted: false;
    readonly probeBroadcast: false;
    readonly federatedLaunchEligible: false;
    readonly mintAuthorized: false;
    readonly settlementAuthorized: false;
    readonly valueLifecycleTransactionConstructed: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly profileActivated: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly acceptanceDigestHex: string;
}

interface SubstrateFederatedAuthoritySafeDevnetAcceptedActionV1<T> {
  readonly acceptance:
    Readonly<SubstrateFederatedAuthoritySafeDevnetAcceptanceV1>;
  readonly value: T;
}

export interface SubstrateFederatedAuthoritySafeDevnetAcceptedHistoryV1 {
  readonly acceptance:
    Readonly<SubstrateFederatedAuthoritySafeDevnetAcceptanceV1>;
  readonly value: Readonly<CollectedHistoryActionV1>;
}

export type CaptureSubstrateFederatedSourceLockedRecoveryTimelineV1Input =
  Omit<AcceptSubstrateFederatedAuthoritySafeDevnetV1Input, 'baseSpecBytes'>
  & Readonly<{
    recoveryObservation: Readonly<{
      sidechainIdHex: string;
      expectedBridgeCodeHashHex: string;
      expectedSergCodeHashHex: string;
    }>;
  }>;

export interface SubstrateFederatedSourceLockedRecoveryTimelineV1 {
  readonly acceptance:
    Readonly<SubstrateFederatedAuthoritySafeDevnetAcceptanceV1>;
  readonly material:
    Readonly<OwnedAuthoritySafeDevnetRecoveryTimelineV1Material>;
  readonly receipt: Readonly<{
    readonly schema:
      typeof SUBSTRATE_FEDERATED_SOURCE_LOCKED_RECOVERY_TIMELINE_V1_SCHEMA;
    readonly version: 1;
    readonly status: 'source_locked_recovery_timeline_captured';
    readonly acceptanceDigestHex: string;
    readonly nodeBinarySha256Hex: string;
    readonly acceptedTargetChainSpecSha256Hex: string;
    readonly recoveryDrillChainSpecSha256Hex: string;
    readonly processBindingDigestHex: string;
    readonly lifecycleDigestHex: string;
    readonly timelineReceiptDigestHex: string;
    readonly receiptDigestHex: string;
    readonly checks: Readonly<{
      exactSourceLockedAcceptanceJoined: true;
      sameExactBuiltBinaryUsedByAcceptedTargetAndRecoveryDrill: true;
      recoveryDrillSpecDerivedOnlyFromAcceptedTargetSpec: true;
      recoveryDrillManualSealEnabledAtGenesis: true;
      recoveryDrillSpecAcceptedByExactBinary: true;
      recoveryDrillSpecDistinctFromAcceptedTarget: true;
      fourSnapshotsCapturedInsideOneOwnedProcessLifetime: true;
      boundedReadSourcesSealedBeforeReturn: true;
      noProcessOrTransportCapabilityReturned: true;
    }>;
    readonly boundaries: Readonly<{
      independentAdministrationEstablished: false;
      recoveryDrillIsAcceptedTarget: false;
      sourceConsensusAuthenticated: false;
      sourceFinalityAuthenticated: false;
      transactionSubmissionAuthorized: false;
      mintAuthorized: false;
      payoutAuthorized: false;
      fundsAuthorityEstablished: false;
      gate5Closed: false;
      trustlessStatusEstablished: false;
      productionReadinessEstablished: false;
    }>;
  }>;
}

export async function acceptSubstrateFederatedAuthoritySafeDevnetV1(
  input: Readonly<AcceptSubstrateFederatedAuthoritySafeDevnetV1Input>,
): Promise<Readonly<SubstrateFederatedAuthoritySafeDevnetAcceptanceV1>> {
  const result = await acceptSubstrateFederatedAuthoritySafeDevnetWithActionV1(
    input,
    async () => undefined,
  );
  return result.acceptance;
}

export async function acceptSubstrateFederatedAuthoritySafeDevnetWithHistoryV1(
  input: Readonly<AcceptSubstrateFederatedAuthoritySafeDevnetV1Input>,
  buildWorkspace?: Readonly<
    SubstrateFederatedAuthoritySafeDevnetBuildWorkspaceV1
  >,
): Promise<Readonly<SubstrateFederatedAuthoritySafeDevnetAcceptedHistoryV1>> {
  return await acceptSubstrateFederatedAuthoritySafeDevnetWithActionV1(
    input,
    collectSubstrateFederatedAuthoritySafeDevnetHistoryActionV1,
    undefined,
    buildWorkspace,
    'source history rpc and finality',
  );
}

export async function captureSubstrateFederatedSourceLockedRecoveryTimelineV1(
  input: Readonly<CaptureSubstrateFederatedSourceLockedRecoveryTimelineV1Input>,
): Promise<Readonly<SubstrateFederatedSourceLockedRecoveryTimelineV1>> {
  let material: Readonly<OwnedAuthoritySafeDevnetRecoveryTimelineV1Material>
    | undefined;
  let recoveryDrillChainSpecSha256Hex: string | undefined;
  const accepted = await acceptSubstrateFederatedAuthoritySafeDevnetWithActionV1(
    input,
    async () => undefined,
    async recoveryProcess => {
      recoveryDrillChainSpecSha256Hex =
        recoveryProcess.expectedChainSpecSha256Hex;
      material = await captureOwnedAuthoritySafeDevnetRecoveryTimelineV1({
        process: recoveryProcess,
        observation: {
          sidechainIdHex: input.recoveryObservation.sidechainIdHex,
          expectedChainId: input.expectedChainId.toString(),
          bridgeAddress: input.bridgeAddress,
          expectedBridgeCodeHashHex:
            input.recoveryObservation.expectedBridgeCodeHashHex,
          expectedSergAddress: input.tokenAddress,
          expectedSergCodeHashHex:
            input.recoveryObservation.expectedSergCodeHashHex,
        },
      });
      assertOwnedAuthoritySafeDevnetRecoveryTimelineV1Material(material);
    },
  );
  if (material === undefined) {
    throw new Error('source-locked recovery timeline capture did not run');
  }
  if (recoveryDrillChainSpecSha256Hex === undefined) {
    throw new Error('source-locked recovery drill chain spec was not retained');
  }
  const timelineReceiptDigestHex = sha256Canonical(material.receipt);
  const unsignedReceipt = {
    schema: SUBSTRATE_FEDERATED_SOURCE_LOCKED_RECOVERY_TIMELINE_V1_SCHEMA,
    version: 1 as const,
    status: 'source_locked_recovery_timeline_captured' as const,
    acceptanceDigestHex: accepted.acceptance.acceptanceDigestHex,
    nodeBinarySha256Hex: accepted.acceptance.binary.sha256Hex,
    acceptedTargetChainSpecSha256Hex:
      accepted.acceptance.chainSpec.generatedSha256Hex,
    recoveryDrillChainSpecSha256Hex,
    processBindingDigestHex: material.receipt.processBindingDigestHex,
    lifecycleDigestHex: material.receipt.lifecycleDigestHex,
    timelineReceiptDigestHex,
    checks: {
      exactSourceLockedAcceptanceJoined: true as const,
      sameExactBuiltBinaryUsedByAcceptedTargetAndRecoveryDrill: true as const,
      recoveryDrillSpecDerivedOnlyFromAcceptedTargetSpec: true as const,
      recoveryDrillManualSealEnabledAtGenesis: true as const,
      recoveryDrillSpecAcceptedByExactBinary: true as const,
      recoveryDrillSpecDistinctFromAcceptedTarget: true as const,
      fourSnapshotsCapturedInsideOneOwnedProcessLifetime: true as const,
      boundedReadSourcesSealedBeforeReturn: true as const,
      noProcessOrTransportCapabilityReturned: true as const,
    },
    boundaries: {
      independentAdministrationEstablished: false as const,
      recoveryDrillIsAcceptedTarget: false as const,
      sourceConsensusAuthenticated: false as const,
      sourceFinalityAuthenticated: false as const,
      transactionSubmissionAuthorized: false as const,
      mintAuthorized: false as const,
      payoutAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = Object.freeze({
    ...unsignedReceipt,
    receiptDigestHex: sha256Canonical(unsignedReceipt),
  });
  const result = Object.freeze({
    acceptance: accepted.acceptance,
    material,
    receipt,
  });
  SOURCE_LOCKED_RECOVERY_TIMELINES.add(result);
  return result;
}

export function assertSubstrateFederatedSourceLockedRecoveryTimelineV1(
  value: unknown,
): asserts value is SubstrateFederatedSourceLockedRecoveryTimelineV1 {
  if (
    typeof value !== 'object'
    || value === null
    || !SOURCE_LOCKED_RECOVERY_TIMELINES.has(value)
  ) {
    throw new Error('source-locked recovery timeline provenance is missing');
  }
}

async function acceptSubstrateFederatedAuthoritySafeDevnetWithActionV1<T>(
  input: Readonly<
    AcceptSubstrateFederatedAuthoritySafeDevnetV1Input
    | Omit<AcceptSubstrateFederatedAuthoritySafeDevnetV1Input, 'baseSpecBytes'>
  >,
  action: (
    context: Readonly<
      SubstrateFederatedAuthoritySafeDevnetAcceptedActionContextV1
    >,
  ) => Promise<T>,
  afterAcceptedTarget?: (
    recoveryProcess: Readonly<OwnedAuthoritySafeDevnetProcessV1Input>,
  ) => Promise<void>,
  buildWorkspaceInput?: Readonly<
    SubstrateFederatedAuthoritySafeDevnetBuildWorkspaceV1
  >,
  sourceActionFailurePhase?:
    SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1,
): Promise<Readonly<
  SubstrateFederatedAuthoritySafeDevnetAcceptedActionV1<T>
>> {
  if (typeof action !== 'function') {
    throw new Error('authority-safe accepted-target action is required');
  }
  let sourceFailurePhase:
    SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1 =
      'source target input and baseline';
  const sourceInputs = (() => {
    try {
      return {
        worktreeRoot: canonicalDirectory(
          input.worktreeRoot,
          'bridge worktree root',
        ),
        bridgeRoot: canonicalDirectory(input.bridgeRoot, 'bridge root'),
        frontierSourcePath: canonicalDirectory(
          input.frontierSourcePath,
          'patched Frontier source',
        ),
        cargoExecutablePath: canonicalRegularFile(
          input.cargoExecutablePath,
          'Cargo executable',
        ),
        rustcExecutablePath: canonicalRegularFile(
          input.rustcExecutablePath,
          'Rust compiler executable',
        ),
        gitExecutablePath: canonicalRegularFile(
          input.gitExecutablePath,
          'Git executable',
        ),
        expectedBinaryVersion: boundedLine(
          input.expectedFrontierBinaryVersion,
          'Frontier binary version',
        ),
      };
    } catch (error) {
      if (sourceActionFailurePhase !== undefined) {
        throw createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1(
          sourceFailurePhase,
          error,
        );
      }
      throw error;
    }
  })();
  const {
    worktreeRoot,
    bridgeRoot,
    frontierSourcePath,
    cargoExecutablePath,
    rustcExecutablePath,
    gitExecutablePath,
    expectedBinaryVersion,
  } = sourceInputs;

  const sourcePreparation = await (async () => {
    try {
      sourceFailurePhase = 'source target input and baseline';
      const baselineBefore = inspectConsensusSourceBaseline({
        worktreeRoot,
        bridgeRoot,
        frontierSourcePath,
        requireFrontierCheckout: true,
        requireErgoCheckout: false,
        gitExecutablePath,
      });
      assertExactSourceBaselinePins(
        baselineBefore,
        input.expectedFrontierCommit,
        input.expectedFrontierPatchSha256Hex,
        'before build',
      );
      sourceFailurePhase = 'source target toolchain and build workspace';
      const toolchainBefore =
        await inspectSubstrateFederatedAuthoritySafePinnedToolchainV1({
          bridgeRoot,
          cargoExecutablePath,
          rustcExecutablePath,
          gitExecutablePath,
          cwd: frontierSourcePath,
        });
      const protocBefore =
        inspectSubstrateFederatedAuthoritySafePinnedProtocV1({
          bridgeRoot,
          cwd: frontierSourcePath,
        });
      const rustSrcBefore =
        inspectSubstrateFederatedAuthoritySafePinnedRustSrcV1({
          bridgeRoot,
          rustcExecutablePath,
        });
      const buildWorkspace = buildWorkspaceInput === undefined
        ? createPinnedLocalNativeBuildWorkspace()
        : createPinnedLocalNativeBuildWorkspace(undefined, {
          temporaryDirectoryRoot: buildWorkspaceInput.temporaryDirectoryRoot,
          sharedCargoHomeRoot: buildWorkspaceInput.sharedCargoHomeRoot,
        });
      return {
        baselineBefore,
        toolchainBefore,
        protocBefore,
        rustSrcBefore,
        buildWorkspace,
      };
    } catch (error) {
      if (sourceActionFailurePhase !== undefined) {
        throw createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1(
          sourceFailurePhase,
          error,
        );
      }
      throw error;
    }
  })();
  const {
    baselineBefore,
    toolchainBefore,
    protocBefore,
    rustSrcBefore,
    buildWorkspace,
  } = sourcePreparation;
  const cargoTargetDirectory = buildWorkspace.buildTargetPath;
  let classifiedSourceFailure: unknown;
  try {
    sourceFailurePhase = 'source target toolchain and build workspace';
    const cargoEnvironment = buildSubstrateFederatedAuthoritySafeCargoEnvironmentV1({
      cargoTargetDirectory,
      cargoHomeDirectory: buildWorkspace.cargoHomePath,
      cargoExecutablePath,
      frontierSourcePath,
      gitExecutablePath,
      protocExecutablePath: protocBefore.executablePath,
      rustcExecutablePath,
      rustTarget: toolchainBefore.rustTarget,
    });
    sourceFailurePhase = 'source target Frontier build';
    await runBoundedProcess({
      executablePath: cargoExecutablePath,
      args: ['build', '--locked', '--offline', '-p', FRONTIER_PACKAGE],
      cwd: frontierSourcePath,
      env: cargoEnvironment,
      timeoutMs: BUILD_TIMEOUT_MS,
      maxOutputBytes: MAX_BUILD_OUTPUT_BYTES,
      label: 'source-locked authority-safe Frontier build',
    });

    sourceFailurePhase = 'source target binary and base spec';
    const binaryPath = canonicalRegularFile(
      join(
        cargoTargetDirectory,
        'debug',
        process.platform === 'win32'
          ? `${FRONTIER_PACKAGE}.exe`
          : FRONTIER_PACKAGE,
      ),
      'built Frontier binary',
    );
    const binaryStat = statSync(binaryPath);
    const builtBinaryDigest = sha256(readFileSync(binaryPath));
    const binaryVersion = await exactVersion({
      executablePath: binaryPath,
      cwd: frontierSourcePath,
      environment: buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1(),
      expected: expectedBinaryVersion,
      label: 'Frontier binary',
    });

    const reproducedBaseResult = await runBoundedProcess({
      executablePath: binaryPath,
      args: ['build-spec', '--chain', 'dev', '--disable-default-bootnode'],
      cwd: frontierSourcePath,
      env: buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1(),
      timeoutMs: SHORT_PROCESS_TIMEOUT_MS,
      maxOutputBytes: MAX_CHAIN_SPEC_OUTPUT_BYTES,
      maxStdoutBytes: MAX_CHAIN_SPEC_OUTPUT_BYTES,
      maxStderrBytes: 64 * 1024,
      label: 'freshly built Frontier base-spec reproduction',
    });
    assertSubstrateFederatedAuthoritySafeBuildSpecStderrV1(
      reproducedBaseResult.stderr,
    );
    const reproducedBaseBytes = Buffer.from(reproducedBaseResult.stdoutBytes);
    const reproducedBaseSha256Hex = sha256(reproducedBaseBytes);
    const suppliedBaseSpecBytes = 'baseSpecBytes' in input
      ? Buffer.from(input.baseSpecBytes)
      : undefined;
    if (
      suppliedBaseSpecBytes !== undefined
      && !reproducedBaseBytes.equals(suppliedBaseSpecBytes)
    ) {
      throw new Error(
        'freshly built Frontier binary did not reproduce the pinned base '
        + `chain spec: observed ${reproducedBaseSha256Hex}, expected `
        + input.expectedBaseSpecSha256Hex,
      );
    }
    if (
      suppliedBaseSpecBytes === undefined
      && reproducedBaseSha256Hex !== input.expectedBaseSpecSha256Hex
    ) {
      throw new Error(
        'freshly built Frontier binary did not reproduce the expected base '
        + `chain-spec digest: observed ${reproducedBaseSha256Hex}, expected `
        + input.expectedBaseSpecSha256Hex,
      );
    }
    sourceFailurePhase = 'source target chain spec generation';
    const generated = buildSubstrateFederatedAuthoritySafeDevnetChainSpecV1({
      bridgeRoot,
      baseSpecBytes: reproducedBaseBytes,
      expectedChainId: input.expectedChainId,
      bridgeAddress: input.bridgeAddress,
      tokenAddress: input.tokenAddress,
      bridgeOwnerAddress: input.bridgeOwnerAddress,
      expectedBaseSpecSha256Hex: input.expectedBaseSpecSha256Hex,
      expectedFrontierCommit: input.expectedFrontierCommit,
      expectedFrontierPatchSha256Hex: input.expectedFrontierPatchSha256Hex,
      expectedRuntimeCodeSha256Hex: input.expectedRuntimeCodeSha256Hex,
      expectedSudoAddress: input.expectedSudoAddress,
    });
    assertExactSourceBaseline(baselineBefore, generated.report, 'before build');

    sourceFailurePhase = 'source target runtime source tests';
    const runtimeTests = [] as Array<Readonly<{
      name: typeof SOURCE_TESTS[number];
      outputDigestHex: string;
    }>>;
    for (const name of SOURCE_TESTS) {
      const result = await runBoundedProcess({
        executablePath: cargoExecutablePath,
        args: ['test', '--locked', '--offline', '-p', FRONTIER_PACKAGE, name, '--', '--exact'],
        cwd: frontierSourcePath,
        env: cargoEnvironment,
        timeoutMs: TEST_TIMEOUT_MS,
        maxOutputBytes: MAX_TEST_OUTPUT_BYTES,
        label: `source-locked Frontier test ${name}`,
      });
      assertExactCargoTestEvidence(result.stdout, result.stderr, name);
      runtimeTests.push(Object.freeze({
        name,
        outputDigestHex: sha256Canonical({ stdout: result.stdout, stderr: result.stderr }),
      }));
    }

    sourceFailurePhase = 'source target post-build invariants';
    const baselineBeforeExecution = inspectConsensusSourceBaseline({
      worktreeRoot,
      bridgeRoot,
      frontierSourcePath,
      requireFrontierCheckout: true,
      requireErgoCheckout: false,
      gitExecutablePath,
    });
    assertExactSourceBaseline(
      baselineBeforeExecution,
      generated.report,
      'after build and source tests',
    );
    assertSameObservation(
      baselineBefore,
      baselineBeforeExecution,
      'patched Frontier source changed during build or source tests',
    );
    const toolchainBeforeExecution =
      await inspectSubstrateFederatedAuthoritySafePinnedToolchainV1({
      bridgeRoot,
      cargoExecutablePath,
      rustcExecutablePath,
      gitExecutablePath,
      cwd: frontierSourcePath,
    });
    assertSameObservation(
      toolchainBefore,
      toolchainBeforeExecution,
      'locked native toolchain changed during build or source tests',
    );
    const protocBeforeExecution =
      inspectSubstrateFederatedAuthoritySafePinnedProtocV1({
        bridgeRoot,
        cwd: frontierSourcePath,
      });
    assertSameObservation(
      protocBefore,
      protocBeforeExecution,
      'locked Protobuf compiler changed during build or source tests',
    );
    const rustSrcBeforeExecution =
      inspectSubstrateFederatedAuthoritySafePinnedRustSrcV1({
        bridgeRoot,
        rustcExecutablePath,
      });
    assertSameObservation(
      rustSrcBefore,
      rustSrcBeforeExecution,
      'locked Rust standard-library source changed during build or source tests',
    );

    const executionBinaryPath = createExactAuthoritySafeExecutionBinarySnapshot({
      binaryPath,
      expectedBinarySha256Hex: builtBinaryDigest,
      expectedBinaryByteLength: binaryStat.size,
      temporaryRoot: cargoTargetDirectory,
    });

    sourceFailurePhase = 'source target process construction and startup';
    const acceptedChainSpec = await assertExactBinaryAcceptsChainSpec({
      binaryPath: executionBinaryPath,
      expectedBinarySha256Hex: builtBinaryDigest,
      expectedBinaryByteLength: binaryStat.size,
      temporaryRoot: cargoTargetDirectory,
      chainSpecBytes: generated.chainSpecBytes,
      fileName: 'authority-safe.json',
      processLabel: 'exact Frontier chain-spec acceptance',
      sourceLabel: 'generated authority-safe chain spec',
      acceptedLabel: 'node-accepted authority-safe chain spec',
      driftMessage:
        'Frontier changed the generated authority-safe chain-spec semantics',
    });
    const nodeAcceptedBytes = acceptedChainSpec.nodeAcceptedBytes;
    const generatedSemanticBytes = acceptedChainSpec.sourceSemanticBytes;

    const ownedProcessInput = Object.freeze({
      nodeBinaryPath: executionBinaryPath,
      expectedNodeBinarySha256Hex: builtBinaryDigest,
      chainSpecBytes: generated.chainSpecBytes,
      expectedChainSpecSha256Hex: generated.report.chainSpecSha256Hex,
      primaryRpcUrl: input.primaryRpcUrl,
      witnessRpcUrl: input.witnessRpcUrl,
      primaryP2pPort: input.primaryP2pPort,
      witnessP2pPort: input.witnessP2pPort,
      primaryPrometheusPort: input.primaryPrometheusPort,
      witnessPrometheusPort: input.witnessPrometheusPort,
    });
    let recoveryProcessInput:
      Readonly<OwnedAuthoritySafeDevnetProcessV1Input> | undefined;
    if (afterAcceptedTarget !== undefined) {
      const recoveryChainSpecBytes =
        buildAuthoritySafeRecoveryDrillChainSpec(generated.chainSpecBytes);
      await assertExactBinaryAcceptsChainSpec({
        binaryPath: executionBinaryPath,
        expectedBinarySha256Hex: builtBinaryDigest,
        expectedBinaryByteLength: binaryStat.size,
        temporaryRoot: cargoTargetDirectory,
        chainSpecBytes: recoveryChainSpecBytes,
        fileName: 'authority-safe-recovery-drill.json',
        processLabel: 'exact Frontier recovery-drill chain-spec acceptance',
        sourceLabel: 'derived authority-safe recovery-drill chain spec',
        acceptedLabel: 'node-accepted authority-safe recovery-drill chain spec',
        driftMessage:
          'Frontier changed the derived recovery-drill chain-spec semantics',
      });
      recoveryProcessInput = Object.freeze({
        ...ownedProcessInput,
        chainSpecBytes: recoveryChainSpecBytes,
        expectedChainSpecSha256Hex: sha256(recoveryChainSpecBytes),
      });
    }
    const ownedProcesses = await (async () => {
      try {
        return await withOwnedAuthoritySafeDevnetProcessesV1(
          ownedProcessInput,
          async endpoints => {
            let observation: Awaited<
              ReturnType<
                typeof observeSubstrateFederatedAuthoritySafeDevnetV1
              >
            >;
            try {
              observation =
                await observeSubstrateFederatedAuthoritySafeDevnetV1({
                  bridgeRoot,
                  primaryRpcUrl: endpoints.primaryRpcUrl,
                  witnessRpcUrl: endpoints.witnessRpcUrl,
                  expectedChainName: generated.report.chain.name,
                  expectedChainId: input.expectedChainId,
                  expectedNativeGenesisHashHex:
                    input.expectedNativeGenesisHashHex,
                  expectedNodeName: input.expectedNodeName,
                  expectedNodeVersion: input.expectedNodeVersion,
                  expectedRuntimeCodeBytes:
                    generated.report.source.runtimeCodeByteLength,
                  expectedRuntimeCodeSha256Hex:
                    generated.report.source.runtimeCodeSha256Hex,
                  expectedStorageLayoutDigestHex:
                    substrateFederatedAuthoritySafeStorageLayoutDigestV1(
                      generated.report.source.runtimeCodeSha256Hex,
                    ),
                  bridgeAddress: input.bridgeAddress,
                  tokenAddress: input.tokenAddress,
                  bridgeOwnerAddress: input.bridgeOwnerAddress,
                  signedLegacyOwnerMintTransactionHex:
                    input.signedLegacyOwnerMintTransactionHex,
                });
              assertSubstrateFederatedAuthoritySafeDevnetObservationV1Provenance(
                observation,
              );
              assertJoinedTarget(generated.report, observation);
            } catch (error) {
              let observationFailure: unknown = error;
              if (
                error instanceof Error
                && error.message.startsWith(
                  'authority-safe native genesis hash differs from the explicit pin:',
                )
              ) {
                observationFailure = new Error(
                  `${error.message}; generated chain-spec SHA-256 `
                  + generated.report.chainSpecSha256Hex,
                );
              }
              if (sourceActionFailurePhase !== undefined) {
                throw createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1(
                  'source target readiness and observation',
                  observationFailure,
                );
              }
              throw observationFailure;
            }
            const actionContext = Object.freeze({
              primaryRpc: readOnlyAcceptedActionRpc(
                endpoints.primaryRpcUrl,
                'primary',
              ),
              witnessRpc: readOnlyAcceptedActionRpc(
                endpoints.witnessRpcUrl,
                'witness',
              ),
              chain: Object.freeze({
                name: generated.report.chain.name,
                id: generated.report.chain.id,
                protocolId: generated.report.chain.protocolId,
                chainId: generated.report.chain.chainId,
                generatedSpecSha256Hex: generated.report.chainSpecSha256Hex,
              }),
              source: Object.freeze({
                frontierCommit: generated.report.source.frontierCommit,
                frontierPatchSha256Hex:
                  generated.report.source.frontierPatchSha256Hex,
                runtimeCodeBytes: generated.report.source.runtimeCodeByteLength,
                runtimeCodeSha256Hex:
                  generated.report.source.runtimeCodeSha256Hex,
                storageLayoutDigestHex:
                  observation.target.storageLayoutDigestHex,
              }),
              application: Object.freeze({
                bridgeAddress: observation.target.bridgeAddress,
                tokenAddress: observation.target.tokenAddress,
                bridgeOwnerAddress: observation.target.bridgeOwnerAddress,
                bridgeRuntimeCodeBytes:
                  observation.view.bridgeRuntimeByteLength,
                bridgeRuntimeCodeSha256Hex:
                  observation.view.bridgeRuntimeBytecodeSha256Hex,
                tokenRuntimeCodeBytes: observation.view.tokenRuntimeByteLength,
                tokenRuntimeCodeSha256Hex:
                  observation.view.tokenRuntimeBytecodeSha256Hex,
              }),
              observation: Object.freeze({
                nativeGenesisHashHex: observation.target.nativeGenesisHashHex,
                nativeTipHeight: observation.view.nativeTipHeight,
                nativeTipHashHex: observation.view.nativeTipHashHex,
                evmTipHashHex: observation.view.evmTipHashHex,
                observationDigestHex: observation.observationDigestHex,
              }),
            });
            let value: T;
            try {
              value = await action(actionContext);
            } catch (error) {
              if (sourceActionFailurePhase !== undefined) {
                throw createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1(
                  sourceActionFailurePhase,
                  error,
                );
              }
              throw error;
            }
            return Object.freeze({ observation, value });
          },
        );
      } catch (error) {
        if (
          sourceActionFailurePhase === undefined
          || projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1(
            error,
          ) !== null
        ) {
          throw error;
        }
        throw createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1(
          'source target process construction and startup',
          error,
        );
      }
    })();
    assertOwnedAuthoritySafeDevnetProcessV1Receipt(ownedProcesses.receipt);
    sourceFailurePhase = 'source target readiness and observation';
    const { observation, value } = ownedProcesses.value;
    if (afterAcceptedTarget !== undefined) {
      if (recoveryProcessInput === undefined) {
        throw new Error('recovery-drill process input was not created');
      }
      await afterAcceptedTarget(recoveryProcessInput);
    }

    await verifyExecutableSha256(
      executionBinaryPath,
      `0x${builtBinaryDigest}`,
      'authority-safe Frontier execution snapshot',
    );
    assertFileByteLength(
      executionBinaryPath,
      binaryStat.size,
      'authority-safe Frontier execution snapshot after process observation',
    );
    const toolchainAfter =
      await inspectSubstrateFederatedAuthoritySafePinnedToolchainV1({
      bridgeRoot,
      cargoExecutablePath,
      rustcExecutablePath,
      gitExecutablePath,
      cwd: frontierSourcePath,
    });
    assertSameObservation(
      toolchainBefore,
      toolchainAfter,
      'locked native toolchain changed during target acceptance',
    );
    const protocAfter = inspectSubstrateFederatedAuthoritySafePinnedProtocV1({
      bridgeRoot,
      cwd: frontierSourcePath,
    });
    assertSameObservation(
      protocBefore,
      protocAfter,
      'locked Protobuf compiler changed during target acceptance',
    );
    const rustSrcAfter =
      inspectSubstrateFederatedAuthoritySafePinnedRustSrcV1({
        bridgeRoot,
        rustcExecutablePath,
      });
    assertSameObservation(
      rustSrcBefore,
      rustSrcAfter,
      'locked Rust standard-library source changed during target acceptance',
    );
    const baselineAfter = inspectConsensusSourceBaseline({
      worktreeRoot,
      bridgeRoot,
      frontierSourcePath,
      requireFrontierCheckout: true,
      requireErgoCheckout: false,
      gitExecutablePath,
    });
    assertExactSourceBaseline(baselineAfter, generated.report, 'after target observation');
    assertSameObservation(
      baselineBefore,
      baselineAfter,
      'patched Frontier source changed during target acceptance',
    );

    const checkoutDigestHex = sha256Canonical({
      frontierCommit: generated.report.source.frontierCommit,
      frontierPatchSha256Hex: generated.report.source.frontierPatchSha256Hex,
      runtimeCodeSha256Hex: generated.report.source.runtimeCodeSha256Hex,
      solidityBuildManifestSha256Hex:
        baselineBefore.sourceIdentity.solidityBuildManifestSha256,
    });
    const source = Object.freeze({
      frontierCommit: generated.report.source.frontierCommit,
      frontierPatchSha256Hex: generated.report.source.frontierPatchSha256Hex,
      checkoutDigestHex,
    });
    const toolchain = toolchainSummary(toolchainBefore);
    const binary = Object.freeze({
      byteLength: binaryStat.size,
      sha256Hex: builtBinaryDigest,
      version: binaryVersion,
    });
    const chainSpec = Object.freeze({
      reproducedBaseByteLength: reproducedBaseBytes.length,
      reproducedBaseSha256Hex: sha256(reproducedBaseBytes),
      generatedByteLength: generated.report.chainSpecBytes,
      generatedSha256Hex: generated.report.chainSpecSha256Hex,
      nodeAcceptedByteLength: nodeAcceptedBytes.length,
      nodeAcceptedSha256Hex: sha256(nodeAcceptedBytes),
      semanticDigestHex: sha256(generatedSemanticBytes),
    });
    const observationSummary = Object.freeze({
      nativeGenesisHashHex: observation.target.nativeGenesisHashHex,
      nativeTipHeight: observation.view.nativeTipHeight,
      runtimeCodeSha256Hex: observation.target.runtimeCodeSha256Hex,
      storageLayoutDigestHex: observation.target.storageLayoutDigestHex,
      twoNodeConsensusDigestHex: observation.sourceAgreement.consensusDigestHex,
      observationDigestHex: observation.observationDigestHex,
    });
    const processes = Object.freeze({
      primaryPeerIdSha256Hex: ownedProcesses.receipt.primaryPeerIdSha256Hex,
      witnessPeerIdSha256Hex: ownedProcesses.receipt.witnessPeerIdSha256Hex,
      processBindingDigestHex: ownedProcesses.receipt.processBindingDigestHex,
    });
    const checks = Object.freeze({
      exactPatchedSourceCheckoutVerifiedBeforeAndAfter: true as const,
      exactLockedToolchainVerifiedBeforeAndAfter: true as const,
      sourceLockedOfflineBuildPassed: true as const,
      freshIsolatedCargoTargetUsed: true as const,
      deterministicWasmPathRemappingApplied: true as const,
      builtInRuntimeBaseSpecReproducedExactly: true as const,
      runningNodeImageIdentityBoundForBothNodesAndVerifiedBeforeAndAfter: true as const,
      exactMutualPeerIdentityAndLoopbackIsolationObservedAtActionBoundaries: true as const,
      spawnedNodeListenersBoundAndReleased: true as const,
      generatedSpecAcceptedByExactBinary: true as const,
      nodeAcceptedSpecSemanticallyMatchesGeneratedSpec: true as const,
      exactTwoNodeRuntimeObservationJoined: true as const,
      directOwnerMintDryRunRejected: true as const,
      sourceLockedDirectOwnerMintBlockRejected: true as const,
      sourceLockedForwardedOwnerMintBlockRejected: true as const,
      typedQuarantineAndAbsentAuthorityStateObserved: true as const,
    });
    const boundaries = Object.freeze({
      exactAuthoritySafeTargetIdentityObserved: true as const,
      targetHistoryIntakeEligible: true as const,
      targetHistoryCollected: false as const,
      targetHistoryAuthenticated: false as const,
      independentSourceAdministrationEstablished: false as const,
      sourceFinalityAuthenticated: false as const,
      completeBuildToolClosureVerified: false as const,
      dependencyCacheContentAttested: false as const,
      independentBuildAttestationVerified: false as const,
      syntheticDryRunProbeOnly: true as const,
      probeSubmitted: false as const,
      probeBroadcast: false as const,
      federatedLaunchEligible: false as const,
      mintAuthorized: false as const,
      settlementAuthorized: false as const,
      valueLifecycleTransactionConstructed: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      profileActivated: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    });
    const unsigned = {
      schema: SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_ACCEPTANCE_V1_SCHEMA,
      version: 1 as const,
      status: 'isolated_exact_authority_safe_target_accepted' as const,
      source,
      toolchain,
      binary,
      chainSpec,
      runtimeTests: Object.freeze(runtimeTests),
      observation: observationSummary,
      processes,
      checks,
      boundaries,
    };
    const acceptance = Object.freeze({
      ...unsigned,
      acceptanceDigestHex: sha256Canonical(unsigned),
    });
    ACCEPTANCES.add(acceptance);
    const result = Object.freeze({ acceptance, value });
    ACTION_RESULTS.add(result);
    return result;
  } catch (error) {
    let failure: unknown = error;
    if (
      sourceActionFailurePhase !== undefined
      && projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1(error)
        === null
    ) {
      failure = createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1(
        sourceFailurePhase,
        error,
      );
    }
    if (sourceActionFailurePhase !== undefined) {
      classifiedSourceFailure = failure;
    }
    throw failure;
  } finally {
    try {
      buildWorkspace.cleanup();
    } catch (cleanupError) {
      if (sourceActionFailurePhase === undefined) throw cleanupError;
      if (classifiedSourceFailure !== undefined) {
        throw new AggregateError(
          [classifiedSourceFailure, cleanupError],
          'authority-safe source phase and build-workspace cleanup failed',
        );
      }
      throw createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1(
        'source target build workspace cleanup',
        cleanupError,
      );
    }
  }
}

export function assertSubstrateFederatedAuthoritySafeDevnetAcceptedHistoryV1Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedAuthoritySafeDevnetAcceptedHistoryV1
> {
  if (
    typeof value !== 'object'
    || value === null
    || !ACTION_RESULTS.has(value)
  ) {
    throw new Error('authority-safe accepted-target history provenance is missing');
  }
  assertSubstrateFederatedAuthoritySafeDevnetAcceptanceV1Provenance(
    (value as SubstrateFederatedAuthoritySafeDevnetAcceptedHistoryV1)
      .acceptance,
  );
}

export function assertSubstrateFederatedAuthoritySafeDevnetAcceptanceV1Provenance(
  value: unknown,
): asserts value is SubstrateFederatedAuthoritySafeDevnetAcceptanceV1 {
  if (typeof value !== 'object' || value === null || !ACCEPTANCES.has(value)) {
    throw new Error('authority-safe exact-target acceptance provenance is missing');
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readOnlyAcceptedActionRpc(
  rawUrl: string,
  role: 'primary' | 'witness',
): Readonly<SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcV1> {
  const errors = validateReadOnlyNodeUrl(rawUrl, `${role} accepted-target RPC`);
  if (errors.length > 0) throw new Error(errors.join('; '));
  const url = new URL(rawUrl);
  if (
    url.protocol !== 'http:'
    || !new Set(['127.0.0.1', 'localhost', '[::1]'])
      .has(url.hostname.toLowerCase())
  ) {
    throw new Error(`${role} accepted-target RPC must be isolated loopback HTTP`);
  }
  let requestId = 0;
  return Object.freeze({
    role,
    endpointIdentityDigestHex: sha256(Buffer.from(url.origin, 'utf8')),
    async request(
      method: SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcMethodV1,
      params: readonly unknown[],
    ): Promise<unknown> {
      if (!ACCEPTED_ACTION_RPC_METHODS.has(method)) {
        throw new Error(`accepted-target RPC method is not allowed: ${method}`);
      }
      const id = ++requestId;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(
          `${role} accepted-target RPC ${method} returned HTTP ${response.status}`,
        );
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_ACCEPTED_ACTION_RPC_RESPONSE_BYTES) {
        throw new Error(
          `${role} accepted-target RPC ${method} response exceeds the byte limit`,
        );
      }
      const body = record(parseStrictJson(
        bytes.toString('utf8'),
        `${role} accepted-target RPC ${method}`,
      ));
      if (
        body === undefined
        || body.jsonrpc !== '2.0'
        || body.id !== id
        || body.error !== undefined
      ) {
        throw new Error(
          `${role} accepted-target RPC ${method} returned an invalid envelope`,
        );
      }
      return body.result;
    },
  });
}

function boundedToken(value: unknown, label: string): string {
  const token = boundedLine(value, label);
  if (!/^[A-Za-z0-9_.-]+$/.test(token)) {
    throw new Error(`${label} must contain one canonical token`);
  }
  return token;
}

function assertExactSourceBaseline(
  baseline: ReturnType<typeof inspectConsensusSourceBaseline>,
  generated: ReturnType<
    typeof buildSubstrateFederatedAuthoritySafeDevnetChainSpecV1
  >['report'],
  stage: string,
): void {
  assertExactSourceBaselinePins(
    baseline,
    generated.source.frontierCommit,
    generated.source.frontierPatchSha256Hex,
    stage,
  );
}

function assertExactSourceBaselinePins(
  baseline: ReturnType<typeof inspectConsensusSourceBaseline>,
  expectedFrontierCommit: string,
  expectedFrontierPatchSha256Hex: string,
  stage: string,
): void {
  if (
    baseline.status !== 'PASS'
    || !baseline.checks.lockBindingsValidated
    || !baseline.checks.solidityBuildClosureArtifactsValidated
    || !baseline.checks.frontierCheckoutValidated
    || baseline.sourceIdentity.frontierCommit !== expectedFrontierCommit
    || baseline.sourceIdentity.frontierPatchSha256
      !== expectedFrontierPatchSha256Hex
  ) {
    throw new Error(
      `patched Frontier checkout differs from the complete source lock ${stage}`,
    );
  }
}

function assertSameObservation(left: unknown, right: unknown, message: string): void {
  if (sha256Canonical(left) !== sha256Canonical(right)) throw new Error(message);
}

function assertExactCargoTestEvidence(
  stdout: string,
  stderr: string,
  expectedName: typeof SOURCE_TESTS[number],
): void {
  const output = `${stdout}\n${stderr}`.replaceAll('\r\n', '\n');
  const escapedName = expectedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactPasses = output.match(new RegExp(`^test ${escapedName} \\.\\.\\. ok$`, 'gm')) ?? [];
  if (exactPasses.length !== 1) {
    throw new Error(`source-locked Frontier test ${expectedName} did not execute exactly once`);
  }
  let passed = 0;
  let failed = 0;
  let summaries = 0;
  for (const match of output.matchAll(
    /^test result: (?:ok|FAILED)\. ([0-9]+) passed; ([0-9]+) failed;/gm,
  )) {
    summaries += 1;
    passed += Number(match[1]);
    failed += Number(match[2]);
  }
  if (summaries === 0 || passed !== 1 || failed !== 0) {
    throw new Error(`source-locked Frontier test ${expectedName} lacks one exact passing result`);
  }
}

function assertFileByteLength(path: string, expected: number, label: string): void {
  if (statSync(path).size !== expected) {
    throw new Error(`${label} byte length differs from the explicit pin`);
  }
}

function createExactAuthoritySafeExecutionBinarySnapshot(input: Readonly<{
  binaryPath: string;
  expectedBinarySha256Hex: string;
  expectedBinaryByteLength: number;
  temporaryRoot: string;
}>): string {
  const sourceBytes = readFileSync(input.binaryPath);
  assertExactBinaryBytes(
    sourceBytes,
    input.expectedBinarySha256Hex,
    input.expectedBinaryByteLength,
    'built authority-safe Frontier binary before execution snapshot',
  );
  const snapshotDirectory = mkdtempSync(join(input.temporaryRoot, 'exec-'));
  try {
    const snapshotPath = join(snapshotDirectory, basename(input.binaryPath));
    writeFileSync(snapshotPath, sourceBytes, {
      flag: 'wx',
      mode: 0o700,
    });
    const canonicalSnapshotPath = canonicalRegularFile(
      snapshotPath,
      'authority-safe Frontier execution snapshot',
    );
    assertExactBinaryBytes(
      readFileSync(canonicalSnapshotPath),
      input.expectedBinarySha256Hex,
      input.expectedBinaryByteLength,
      'authority-safe Frontier execution snapshot after creation',
    );
    return canonicalSnapshotPath;
  } catch (error) {
    rmSync(snapshotDirectory, {
      recursive: true,
      force: true,
      maxRetries: 3,
    });
    throw error;
  }
}

function assertExactBinaryBytes(
  bytes: Uint8Array,
  expectedSha256Hex: string,
  expectedByteLength: number,
  label: string,
): void {
  if (bytes.length !== expectedByteLength) {
    throw new Error(`${label} byte length differs from the explicit pin`);
  }
  if (sha256(bytes) !== expectedSha256Hex) {
    throw new Error(`${label} SHA-256 digest does not match the reviewed pin`);
  }
}

function toolchainSummary(
  value: Readonly<NativeVerifierBuildToolObservation>,
): SubstrateFederatedAuthoritySafeDevnetAcceptanceV1['toolchain'] {
  return Object.freeze({
    lockSha256Hex: EXPECTED_NATIVE_VERIFIER_TOOLCHAIN_LOCK_SHA256,
    platformKey: value.platformKey,
    rustTarget: value.rustTarget,
    cargo: Object.freeze({
      version: value.cargo.version,
      sha256Hex: value.cargo.sha256,
    }),
    rustc: Object.freeze({
      version: value.rustc.version,
      sha256Hex: value.rustc.sha256,
    }),
    git: Object.freeze({
      version: value.git.version,
      sha256Hex: value.git.sha256,
    }),
  });
}

function assertJoinedTarget(
  generated: ReturnType<
    typeof buildSubstrateFederatedAuthoritySafeDevnetChainSpecV1
  >['report'],
  observation: Awaited<
    ReturnType<typeof observeSubstrateFederatedAuthoritySafeDevnetV1>
  >,
): void {
  const application = generated.application;
  if (
    observation.target.chainName !== generated.chain.name
    || observation.target.chainId !== generated.chain.chainId
    || observation.target.runtimeCodeBytes !== generated.source.runtimeCodeByteLength
    || observation.target.runtimeCodeSha256Hex !== generated.source.runtimeCodeSha256Hex
    || observation.target.bridgeAddress !== application.bridgeAddress
    || observation.target.tokenAddress !== application.tokenAddress
    || observation.target.bridgeOwnerAddress !== application.bridgeOwnerAddress
    || observation.view.bridgeRuntimeByteLength !== application.bridgeRuntimeByteLength
    || observation.view.bridgeRuntimeBytecodeSha256Hex
      !== application.bridgeRuntimeBytecodeSha256Hex
    || observation.view.tokenRuntimeByteLength !== application.tokenRuntimeByteLength
    || observation.view.tokenRuntimeBytecodeSha256Hex
      !== application.tokenRuntimeBytecodeSha256Hex
    || !observation.checks.directLegacyOwnerMintRejectedByRuntimePolicy
    || !observation.checks.typedLegacyMintQuarantineObservedAtGenesisAndTip
    || !observation.checks.sudoAbsentAtGenesisAndTip
    || !observation.checks.allPegInProfilesAbsentAtGenesisAndTip
    || !observation.checks.allPegInEnforcementAbsentAtGenesisAndTip
  ) {
    throw new Error('two-node observation differs from the exact generated target');
  }
}

async function exactVersion(input: Readonly<{
  executablePath: string;
  cwd: string;
  environment: NodeJS.ProcessEnv;
  expected: string;
  label: string;
}>): Promise<string> {
  const result = await runBoundedProcess({
    executablePath: input.executablePath,
    args: ['--version'],
    cwd: input.cwd,
    env: input.environment,
    timeoutMs: SHORT_PROCESS_TIMEOUT_MS,
    maxOutputBytes: 64 * 1024,
    label: `${input.label} version`,
  });
  if (result.stderr.trim() !== '' || result.stdout.trim() !== input.expected) {
    throw new Error(`${input.label} version differs from the explicit pin`);
  }
  return input.expected;
}

function canonicalChainSpecBytes(value: Uint8Array, label: string): Buffer {
  return Buffer.from(
    stringifyJsonPreservingNumbers(canonicalChainSpecValue(value, label)),
    'utf8',
  );
}

function canonicalChainSpecValue(value: Uint8Array, label: string): unknown {
  const parsed = parseStrictJsonPreservingNumbers(
    strictUtf8(value, label),
    label,
  );
  return sortJsonObjectKeys(parsed);
}

function buildAuthoritySafeRecoveryDrillChainSpec(
  acceptedTargetBytes: Uint8Array,
): Buffer {
  const parsed = requiredJsonRecord(
    parseStrictJsonPreservingNumbers(
      strictUtf8(acceptedTargetBytes, 'accepted authority-safe chain spec'),
      'accepted authority-safe chain spec',
    ),
    'accepted authority-safe chain spec',
  );
  const genesis = requiredJsonRecord(
    parsed.genesis,
    'accepted authority-safe chain spec genesis',
  );
  const runtimeGenesis = requiredJsonRecord(
    genesis.runtimeGenesis,
    'accepted authority-safe runtime genesis',
  );
  const patch = requiredJsonRecord(
    runtimeGenesis.patch,
    'accepted authority-safe runtime patch',
  );
  const manualSeal = requiredJsonRecord(
    patch.manualSeal,
    'accepted authority-safe manual-seal genesis',
  );
  if (manualSeal.enable !== false) {
    throw new Error(
      'accepted authority-safe target must leave manual sealing disabled',
    );
  }
  manualSeal.enable = true;
  parsed.name = RECOVERY_DRILL_CHAIN_NAME;
  parsed.id = RECOVERY_DRILL_CHAIN_ID;
  parsed.protocolId = RECOVERY_DRILL_PROTOCOL_ID;
  const recoveryBytes = Buffer.from(
    stringifyJsonPreservingNumbers(parsed),
    'utf8',
  );
  if (recoveryBytes.equals(Buffer.from(acceptedTargetBytes))) {
    throw new Error('recovery-drill chain spec must differ from the accepted target');
  }
  return recoveryBytes;
}

async function assertExactBinaryAcceptsChainSpec(input: Readonly<{
  binaryPath: string;
  expectedBinarySha256Hex: string;
  expectedBinaryByteLength: number;
  temporaryRoot: string;
  chainSpecBytes: Uint8Array;
  fileName: string;
  processLabel: string;
  sourceLabel: string;
  acceptedLabel: string;
  driftMessage: string;
}>): Promise<Readonly<{
  nodeAcceptedBytes: Buffer;
  sourceSemanticBytes: Buffer;
}>> {
  const temporaryDirectory = mkdtempSync(join(input.temporaryRoot, 'spec-'));
  let nodeAcceptedBytes: Buffer;
  try {
    const chainSpecPath = join(temporaryDirectory, input.fileName);
    writeFileSync(chainSpecPath, input.chainSpecBytes, {
      flag: 'wx',
      mode: 0o600,
    });
    await assertExactChainSpecAcceptanceBinary(
      input,
      `before ${input.processLabel}`,
    );
    const result = await runBoundedProcess({
      executablePath: input.binaryPath,
      args: [
        'build-spec',
        '--chain',
        chainSpecPath,
        '--disable-default-bootnode',
      ],
      cwd: temporaryDirectory,
      env: buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1(),
      timeoutMs: SHORT_PROCESS_TIMEOUT_MS,
      maxOutputBytes: MAX_CHAIN_SPEC_OUTPUT_BYTES,
      maxStdoutBytes: MAX_CHAIN_SPEC_OUTPUT_BYTES,
      maxStderrBytes: 64 * 1024,
      label: input.processLabel,
    });
    await assertExactChainSpecAcceptanceBinary(
      input,
      `after ${input.processLabel}`,
    );
    assertSubstrateFederatedAuthoritySafeBuildSpecStderrV1(result.stderr);
    nodeAcceptedBytes = Buffer.from(result.stdoutBytes);
  } finally {
    rmSync(temporaryDirectory, {
      recursive: true,
      force: true,
      maxRetries: 3,
    });
  }
  const sourceSemanticValue = canonicalChainSpecValue(
    input.chainSpecBytes,
    input.sourceLabel,
  );
  const acceptedSemanticValue = canonicalChainSpecValue(
    nodeAcceptedBytes,
    input.acceptedLabel,
  );
  const sourceSemanticBytes = Buffer.from(
    stringifyJsonPreservingNumbers(sourceSemanticValue),
    'utf8',
  );
  const acceptedSemanticBytes = Buffer.from(
    stringifyJsonPreservingNumbers(acceptedSemanticValue),
    'utf8',
  );
  if (!sourceSemanticBytes.equals(acceptedSemanticBytes)) {
    const firstDifference = firstJsonDifferencePath(
      sourceSemanticValue,
      acceptedSemanticValue,
    ) ?? '$';
    throw new Error(
      `${input.driftMessage}: binary SHA-256 ${sha256(readFileSync(input.binaryPath))}; `
      + `generated semantic SHA-256 ${sha256(sourceSemanticBytes)}; `
      + `node-accepted semantic SHA-256 ${sha256(acceptedSemanticBytes)}; `
      + `first difference ${firstDifference}`,
    );
  }
  return Object.freeze({ nodeAcceptedBytes, sourceSemanticBytes });
}

async function assertExactChainSpecAcceptanceBinary(input: Readonly<{
  binaryPath: string;
  expectedBinarySha256Hex: string;
  expectedBinaryByteLength: number;
}>, label: string): Promise<void> {
  await verifyExecutableSha256(
    input.binaryPath,
    `0x${input.expectedBinarySha256Hex}`,
    `built authority-safe Frontier binary ${label}`,
  );
  assertFileByteLength(
    input.binaryPath,
    input.expectedBinaryByteLength,
    `built authority-safe Frontier binary ${label}`,
  );
}

function firstJsonDifferencePath(
  left: unknown,
  right: unknown,
  path = '$',
): string | undefined {
  if (left === right) return undefined;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return path;
    if (left.length !== right.length) return `${path}.length`;
    for (let index = 0; index < left.length; index += 1) {
      const difference = firstJsonDifferencePath(
        left[index],
        right[index],
        `${path}[${index}]`,
      );
      if (difference !== undefined) return difference;
    }
    return undefined;
  }
  if (isJsonRecord(left) || isJsonRecord(right)) {
    if (!isJsonRecord(left) || !isJsonRecord(right)) return path;
    if (
      Object.getOwnPropertySymbols(left).length > 0
      || Object.getOwnPropertySymbols(right).length > 0
    ) {
      return stringifyJsonPreservingNumbers(left)
        === stringifyJsonPreservingNumbers(right)
        ? undefined
        : path;
    }
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .sort((first, second) => first.localeCompare(second));
    for (const key of keys) {
      const childPath = /^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)
        ? `${path}.${key}`
        : `${path}[${JSON.stringify(key)}]`;
      if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) {
        return childPath;
      }
      const difference = firstJsonDifferencePath(
        left[key],
        right[key],
        childPath,
      );
      if (difference !== undefined) return difference;
    }
    return undefined;
  }
  return path;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function requiredJsonRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function sortJsonObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonObjectKeys);
  if (value !== null && typeof value === 'object') {
    // Raw JSON numbers created by the strict parser carry its private symbol.
    // JSON input cannot contain symbols, so preserve those wrappers verbatim.
    if (Object.getOwnPropertySymbols(value).length > 0) return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJsonObjectKeys(child)]),
    );
  }
  return value;
}

function strictUtf8(value: Uint8Array, label: string): string {
  if (!(value instanceof Uint8Array) || value.length === 0) {
    throw new Error(`${label} must contain bytes`);
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    throw new Error(`${label} must be encoded as UTF-8`);
  }
  if (text.charCodeAt(0) === 0xfeff) {
    throw new Error(`${label} must not contain a UTF-8 BOM`);
  }
  return text;
}

function canonicalDirectory(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${label} must be one local absolute path`);
  }
  const path = resolve(value);
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be one regular directory`);
  }
  return realpathSync(path);
}

function canonicalRegularFile(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${label} must be one local absolute path`);
  }
  const path = resolve(value);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be one regular file`);
  }
  return realpathSync(path);
}

function boundedLine(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 256
    || /[\r\n\0]/.test(value)
  ) {
    throw new Error(`${label} must be one bounded line`);
  }
  return value;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be lowercase 32-byte hex`);
  }
  return value;
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Canonical(value: unknown): string {
  return sha256(Buffer.from(JSON.stringify(sortCanonical(value)), 'utf8'));
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortCanonical(child)]),
    );
  }
  return value;
}
