import { createHash } from 'crypto';
import { execFileSync, spawn, type ChildProcess } from 'child_process';
import {
  existsSync,
  copyFileSync,
  constants as fsConstants,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, isAbsolute, join, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { TextDecoder } from 'util';

import {
  inspectConsensusSourceBaseline,
  type ConsensusSourceBaselineReport,
} from './consensus-source-baseline.js';
import {
  assertNativeVerifiedBridgeCheckpointExecutableProvenance,
  type NativeVerifiedBridgeCheckpoint,
} from './native-finalized-bridge-checkpoint.js';

export const PINNED_LOCAL_NATIVE_VERIFIER_BUILD_SCHEMA =
  'e2s.pinned-local-native-verifier-build.v6' as const;
export const PINNED_LOCAL_NATIVE_REPRODUCIBILITY_MODE =
  'isolated-no-debuginfo' as const;
export const PINNED_LOCAL_PEG_IN_CAUSAL_MINT_TRANSITION_V3_EXECUTION_IDENTITY_SCHEMA =
  'e2s.pinned-local-peg-in-causal-mint-transition-v3-execution-identity.v1' as const;
export const PINNED_LOCAL_PEG_IN_CAUSAL_SOURCE_PROOF_RESULT_PRODUCER_V1_EXECUTION_IDENTITY_SCHEMA =
  'e2s.pinned-local-peg-in-causal-source-proof-result-producer-v1-execution-identity.v1' as const;

export const EXPECTED_CONSENSUS_SOURCE_LOCK_SHA256 =
  'ebc6f342f36e84a98dce6d7bd0930598850ff255f4e7d1850fa930163995ceb4';
export const EXPECTED_NATIVE_VERIFIER_TOOLCHAIN_LOCK_SHA256 =
  '2480775ab0f14b3389a021e2645e0e082d81ebaaef3e797063fb14d18e67f189';
const EXPECTED_FRONTIER_COMMIT = '75329a2df49e2cc7981485392c31160929d1bd48';
const EXPECTED_FRONTIER_PATCH_SHA256 =
  '9bcfe26d8e367c858f69bfafd58f47de726b95c8884ef7ef1b957bd766d5a68b';
const BUILD_TIMEOUT_MS = 10 * 60_000;
const MAX_BUILD_OUTPUT_BYTES = 1024 * 1024;
const TOOL_VERSION_TIMEOUT_MS = 10_000;
const PROCESS_TREE_TERMINATION_RETRY_MS = 1_000;
const POST_EXIT_CLOSE_TIMEOUT_MS = 1_000;
const DEFAULT_PROCESS_TREE_TERMINATION_GRACE_MS = 10_000;
const MAX_WINDOWS_PROCESS_TABLE_BYTES = 1024 * 1024;
const DESCENDANT_INSPECTION_PROBES = 20;
const DESCENDANT_INSPECTION_REQUIRED_EMPTY_PROBES = 2;
const DESCENDANT_INSPECTION_INTERVAL_MS = 250;
const WINDOWS_JOB_CANCELLATION_EXIT_CODE = 197;
const WINDOWS_JOB_TARGET_FAILURE_EXIT_CODE = 198;
const WINDOWS_JOB_CONTAINED_WRAPPER_FAILURE_EXIT_CODE = 199;
const WINDOWS_JOB_TARGET_TIMEOUT_EXIT_CODE = 200;
const WINDOWS_JOB_RUNNER_WATCHDOG_ALLOWANCE_MS = 45_000;
const MAX_NODE_TIMER_MS = 2_147_483_647;
const BUILD_TARGET_PREFIX = 'e2s-pinned-local-native-';
const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const WINDOWS_JOB_PROCESS_RUNNER_PATH = resolve(
  MODULE_DIRECTORY,
  'scripts',
  'windows-job-process.ps1',
);
const CANONICAL_BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const CANONICAL_WORKTREE_ROOT = resolve(CANONICAL_BRIDGE_ROOT, '..');
const PEG_IN_FRONTIER_EVENT_V1_VECTOR_PATH = resolve(
  CANONICAL_BRIDGE_ROOT,
  'relayer',
  'test-vectors',
  'native-finalized-peg-in-frontier-event-v1.json',
);
const PEG_IN_FRONTIER_CONTRACT_STATE_V1_VECTOR_PATH = resolve(
  CANONICAL_BRIDGE_ROOT,
  'relayer',
  'test-vectors',
  'native-finalized-peg-in-frontier-contract-state-v1.json',
);
const PEG_IN_FRONTIER_MINT_TRANSITION_V1_VECTOR_PATH = resolve(
  CANONICAL_BRIDGE_ROOT,
  'relayer',
  'test-vectors',
  'native-finalized-peg-in-frontier-mint-transition-v1.json',
);
const PEG_IN_CAUSAL_MINT_TRANSITION_V2_VECTOR_PATH = resolve(
  CANONICAL_BRIDGE_ROOT,
  'relayer',
  'test-vectors',
  'native-finalized-peg-in-causal-mint-transition-v2.json',
);
const PEG_IN_CAUSAL_MINT_TRANSITION_V3_VECTOR_PATH = resolve(
  CANONICAL_BRIDGE_ROOT,
  'relayer',
  'test-vectors',
  'native-finalized-peg-in-causal-mint-transition-v3.json',
);
const PEG_IN_CAUSAL_SOURCE_PROOF_RESULT_PRODUCER_V1_VECTOR_PATH = resolve(
  CANONICAL_BRIDGE_ROOT,
  'relayer',
  'test-vectors',
  'peg-in-causal-source-proof-result-producer-v1.json',
);
const VECTOR_GENERATION_TIMEOUT_MS = 10_000;
const MAX_VECTOR_OUTPUT_BYTES = 1024 * 1024;
const BUILD_BRAND: unique symbol = Symbol('e2s.pinned-local-native-verifier-build.verified');
const PINNED_LOCAL_BUILD_RESULTS = new WeakSet<object>();
const PINNED_LOCAL_BUILD_EXECUTION = new WeakMap<
  object,
  InternalPinnedLocalNativeVerifierExecution
>();
const PINNED_LOCAL_CAUSAL_V3_EXECUTION_IDENTITIES = new WeakMap<object, {
  build: object;
  identityDigestHex: string;
}>();
const PINNED_LOCAL_CAUSAL_SOURCE_PROOF_PRODUCER_EXECUTION_IDENTITIES =
  new WeakMap<object, {
    build: object;
    identityDigestHex: string;
  }>();
const PINNED_LOCAL_CHECKPOINT_BRAND: unique symbol = Symbol(
  'e2s.pinned-local-source-native-checkpoint.verified',
);
const PINNED_LOCAL_CHECKPOINT_RESULTS = new WeakSet<object>();

export interface NativeVerifierBuildToolObservation {
  platformKey: string;
  rustTarget: string;
  cargo: { version: string; sha256: string };
  rustc: { version: string; sha256: string };
  git: { version: string; sha256: string };
}

export interface NativeVerifierToolchainLockValidation {
  errors: string[];
}

export interface PinnedLocalNativeVerifierBuildPayload {
  schema: typeof PINNED_LOCAL_NATIVE_VERIFIER_BUILD_SCHEMA;
  status: 'PINNED_LOCAL_SOURCE_BUILD_VERIFIED';
  sourceIdentity: {
    consensusSourceLockSha256: typeof EXPECTED_CONSENSUS_SOURCE_LOCK_SHA256;
    frontierCommit: typeof EXPECTED_FRONTIER_COMMIT;
    frontierPatchSha256: typeof EXPECTED_FRONTIER_PATCH_SHA256;
  };
  toolchain: NativeVerifierBuildToolObservation;
  build: {
    cargoLocked: true;
    cargoProfile: 'dev';
    reproducibilityMode: typeof PINNED_LOCAL_NATIVE_REPRODUCIBILITY_MODE;
    isolatedTarget: true;
    incrementalCompilationEnabled: false;
    debugInformationIncluded: false;
    codegenUnits: 1;
    sourceAndTargetPathsRemapped: true;
    deterministicMsvcLinkingRequested: boolean;
    verifierSha256Hex: string;
    codecSha256Hex: string;
    pegInFrontierEventV1VerifierSha256Hex: string;
    pegInFrontierEventV1FixtureGeneratorSha256Hex: string;
    pegInFrontierEventV1VectorCanonicalSha256Hex: string;
    pegInFrontierContractStateV1VerifierSha256Hex: string;
    pegInFrontierContractStateV1FixtureGeneratorSha256Hex: string;
    pegInFrontierContractStateV1VectorCanonicalSha256Hex: string;
    pegInFrontierMintTransitionV1VerifierSha256Hex: string;
    pegInFrontierMintTransitionV1FixtureGeneratorSha256Hex: string;
    pegInFrontierMintTransitionV1VectorCanonicalSha256Hex: string;
    pegInCausalMintTransitionV2VerifierSha256Hex: string;
    pegInCausalMintTransitionV2FixtureGeneratorSha256Hex: string;
    pegInCausalMintTransitionV2VectorCanonicalSha256Hex: string;
    pegInCausalMintTransitionV3VerifierSha256Hex: string;
    pegInCausalMintTransitionV3FixtureGeneratorSha256Hex: string;
    pegInCausalMintTransitionV3VectorCanonicalSha256Hex: string;
    pegInCausalSourceProofResultV1ProducerSha256Hex: string;
    pegInCausalSourceProofResultV1FixtureGeneratorSha256Hex: string;
    pegInCausalSourceProofResultV1VectorCanonicalSha256Hex: string;
  };
  boundary: {
    canonicalSourceLockRequired: true;
    lockedToolchainRequired: true;
    sourceLockVerifiedBeforeBuild: true;
    sourceCheckoutVerifiedBeforeBuild: true;
    sourceLockVerifiedAfterBuild: true;
    sourceCheckoutVerifiedAfterBuild: true;
    pegInFrontierEventV1VectorRegeneratedAndMatched: true;
    pegInFrontierContractStateV1VectorRegeneratedAndMatched: true;
    pegInFrontierMintTransitionV1VectorRegeneratedAndMatched: true;
    pegInCausalMintTransitionV2VectorRegeneratedAndMatched: true;
    pegInCausalMintTransitionV3VectorRegeneratedAndMatched: true;
    pegInCausalSourceProofResultV1VectorRegeneratedAndMatched: true;
    preexistingBuildOutputAllowed: false;
    arbitraryExecutableAllowed: false;
    exclusiveSameUserProcessRequired: true;
    completeBuildToolClosureVerified: false;
    dependencyCacheContentAttested: false;
    independentBuildAttestationVerified: false;
    localConformanceOnly: true;
    admissionEligible: false;
    ergoAnchorVerified: false;
    onChainAcceptanceVerified: false;
    gate5Closed: false;
  };
}

export type PinnedLocalNativeVerifierBuild = PinnedLocalNativeVerifierBuildPayload & {
  readonly [BUILD_BRAND]: true;
};

export interface PinnedLocalNativeVerifierExecution {
  verifierExecutablePath: string;
  verifierSha256Hex: string;
  codecExecutablePath: string;
  codecSha256Hex: string;
  pegInFrontierEventV1VerifierExecutablePath: string;
  pegInFrontierEventV1VerifierSha256Hex: string;
  pegInFrontierContractStateV1VerifierExecutablePath: string;
  pegInFrontierContractStateV1VerifierSha256Hex: string;
  pegInFrontierMintTransitionV1VerifierExecutablePath: string;
  pegInFrontierMintTransitionV1VerifierSha256Hex: string;
  pegInCausalMintTransitionV2VerifierExecutablePath: string;
  pegInCausalMintTransitionV2VerifierSha256Hex: string;
  pegInCausalMintTransitionV3VerifierExecutablePath: string;
  pegInCausalMintTransitionV3VerifierSha256Hex: string;
  pegInCausalSourceProofResultV1ProducerExecutablePath: string;
  pegInCausalSourceProofResultV1ProducerSha256Hex: string;
}

interface InternalPinnedLocalNativeVerifierExecution extends PinnedLocalNativeVerifierExecution {
  buildTargetPath: string;
  frontierSourcePath: string;
  cargoExecutablePath: string;
  rustcExecutablePath: string;
  gitExecutablePath: string;
  cleanup: () => void;
}

export interface PinnedLocalPegInCausalMintTransitionV3ExecutionIdentity {
  readonly schema:
    typeof PINNED_LOCAL_PEG_IN_CAUSAL_MINT_TRANSITION_V3_EXECUTION_IDENTITY_SCHEMA;
  readonly status: 'PINNED_LOCAL_CAUSAL_V3_EXECUTION_IDENTITY_REFRESHED';
  readonly identityDigestHex: string;
  readonly sourceIdentity: PinnedLocalNativeVerifierBuildPayload['sourceIdentity'];
  readonly toolchain: NativeVerifierBuildToolObservation;
  readonly executable: {
    readonly sha256Hex: string;
    readonly vectorCanonicalSha256Hex: string;
  };
  readonly boundary: {
    readonly sourceLocksReloaded: true;
    readonly sourceCheckoutRevalidated: true;
    readonly toolchainReobserved: true;
    readonly executableDigestReobserved: true;
    readonly trackedVectorBuildBindingPreserved: true;
    readonly independentBuildAttestationVerified: false;
    readonly completeBuildToolClosureVerified: false;
    readonly dependencyCacheContentAttested: false;
    readonly localConformanceOnly: true;
    readonly admissionEligible: false;
    readonly gate5Closed: false;
  };
}

export interface PinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentity {
  readonly schema:
    typeof PINNED_LOCAL_PEG_IN_CAUSAL_SOURCE_PROOF_RESULT_PRODUCER_V1_EXECUTION_IDENTITY_SCHEMA;
  readonly status:
    'PINNED_LOCAL_CAUSAL_SOURCE_PROOF_RESULT_PRODUCER_V1_EXECUTION_IDENTITY_REFRESHED';
  readonly identityDigestHex: string;
  readonly sourceIdentity: PinnedLocalNativeVerifierBuildPayload['sourceIdentity'];
  readonly toolchain: NativeVerifierBuildToolObservation;
  readonly executable: {
    readonly sha256Hex: string;
    readonly vectorCanonicalSha256Hex: string;
  };
  readonly boundary: {
    readonly sourceLocksReloaded: true;
    readonly sourceCheckoutRevalidated: true;
    readonly toolchainReobserved: true;
    readonly executableDigestReobserved: true;
    readonly trackedVectorBuildBindingPreserved: true;
    readonly independentBuildAttestationVerified: false;
    readonly completeBuildToolClosureVerified: false;
    readonly dependencyCacheContentAttested: false;
    readonly localConformanceOnly: true;
    readonly admissionEligible: false;
    readonly sourceCanonicalityVerified: false;
    readonly sourceProofExecutionAuthenticated: false;
    readonly gate5Closed: false;
  };
}

export type PinnedLocalSourceNativeVerifiedBridgeCheckpoint = NativeVerifiedBridgeCheckpoint & {
  readonly [PINNED_LOCAL_CHECKPOINT_BRAND]: true;
};

export async function preparePinnedLocalNativeVerifierBuild(input: {
  frontierSourcePath: string;
  cargoExecutablePath: string;
  rustcExecutablePath: string;
  gitExecutablePath: string;
  cargoDependencyMode?: 'shared-cache' | 'private-copy-offline';
}): Promise<PinnedLocalNativeVerifierBuild> {
  assertCanonicalSourceLocks();
  const frontierSourcePath = realpathSync(requireAbsolutePath(
    input?.frontierSourcePath,
    'Frontier source path',
  ));
  const cargoExecutablePath = verifiedRegularFile(requireAbsolutePath(
    input?.cargoExecutablePath,
    'Cargo executable path',
  ));
  const rustcExecutablePath = verifiedRegularFile(requireAbsolutePath(
    input?.rustcExecutablePath,
    'rustc executable path',
  ));
  const gitExecutablePath = verifiedRegularFile(requireAbsolutePath(
    input?.gitExecutablePath,
    'Git executable path',
  ));
  const toolchain = inspectAndValidateToolchain({
    cargoExecutablePath,
    rustcExecutablePath,
    gitExecutablePath,
  });
  const expectedPegInFrontierEventV1Vector = canonicalizePinnedGeneratedJsonVectorBytes(
    readFileSync(PEG_IN_FRONTIER_EVENT_V1_VECTOR_PATH),
    'tracked peg-in Frontier event V1 vector',
  );
  const expectedPegInFrontierContractStateV1Vector =
    canonicalizePinnedGeneratedJsonVectorBytes(
      readFileSync(PEG_IN_FRONTIER_CONTRACT_STATE_V1_VECTOR_PATH),
      'tracked peg-in Frontier contract-state V1 vector',
    );
  const expectedPegInFrontierMintTransitionV1Vector =
    canonicalizePinnedGeneratedJsonVectorBytes(
      readFileSync(PEG_IN_FRONTIER_MINT_TRANSITION_V1_VECTOR_PATH),
      'tracked peg-in Frontier mint-transition V1 vector',
    );
  const expectedPegInCausalMintTransitionV2Vector =
    canonicalizePinnedGeneratedJsonVectorBytes(
      readFileSync(PEG_IN_CAUSAL_MINT_TRANSITION_V2_VECTOR_PATH),
      'tracked peg-in causal mint-transition V2 vector',
    );
  const expectedPegInCausalMintTransitionV3Vector =
    canonicalizePinnedGeneratedJsonVectorBytes(
      readFileSync(PEG_IN_CAUSAL_MINT_TRANSITION_V3_VECTOR_PATH),
      'tracked peg-in causal mint-transition V3 vector',
    );
  const expectedPegInCausalSourceProofResultProducerV1Vector =
    canonicalizePinnedGeneratedJsonVectorBytes(
      readFileSync(PEG_IN_CAUSAL_SOURCE_PROOF_RESULT_PRODUCER_V1_VECTOR_PATH),
      'tracked peg-in causal source-proof result producer V1 vector',
    );

  const inspectionInput = {
    worktreeRoot: CANONICAL_WORKTREE_ROOT,
    bridgeRoot: CANONICAL_BRIDGE_ROOT,
    frontierSourcePath,
    requireFrontierCheckout: true,
    requireErgoCheckout: false,
    gitExecutablePath,
  };
  const before = inspectConsensusSourceBaseline(inspectionInput);
  assertPinnedLocalFrontierSource(before, 'before build');

  const {
    buildTargetPath,
    cargoHomePath,
    cleanup,
  } = createPinnedLocalNativeBuildWorkspace(undefined, {
    cargoDependencyMode: input.cargoDependencyMode,
  });
  try {
    await runPinnedCargoBuild({
      frontierSourcePath,
      buildTargetPath,
      cargoExecutablePath,
      rustcExecutablePath,
      rustTarget: toolchain.rustTarget,
      cargoHomePath,
      offline: input.cargoDependencyMode === 'private-copy-offline',
    });

    const after = inspectConsensusSourceBaseline(inspectionInput);
    assertPinnedLocalFrontierSource(after, 'after build');
    if (
      before.sourceIdentity.frontierCommit !== after.sourceIdentity.frontierCommit
      || before.sourceIdentity.frontierPatchSha256 !== after.sourceIdentity.frontierPatchSha256
    ) {
      throw new Error('pinned Frontier source identity changed during local native verifier build');
    }

    const executableSuffix = process.platform === 'win32' ? '.exe' : '';
    const binaryDirectory = resolve(buildTargetPath, toolchain.rustTarget, 'debug');
    const verifierExecutablePath = verifiedNewBuildOutput(
      resolve(binaryDirectory, `bridge-checkpoint-verifier${executableSuffix}`),
      buildTargetPath,
    );
    const codecExecutablePath = verifiedNewBuildOutput(
      resolve(binaryDirectory, `bridge-rpc-proof-codec${executableSuffix}`),
      buildTargetPath,
    );
    const pegInFrontierEventV1VerifierExecutablePath = verifiedNewBuildOutput(
      resolve(
        binaryDirectory,
        `bridge-peg-in-frontier-event-v1-verifier${executableSuffix}`,
      ),
      buildTargetPath,
    );
    const pegInFrontierEventV1FixtureGeneratorExecutablePath = verifiedNewBuildOutput(
      resolve(
        binaryDirectory,
        `generate-peg-in-frontier-event-v1-fixture${executableSuffix}`,
      ),
      buildTargetPath,
    );
    const pegInFrontierContractStateV1VerifierExecutablePath = verifiedNewBuildOutput(
      resolve(
        binaryDirectory,
        `bridge-peg-in-frontier-contract-state-v1-verifier${executableSuffix}`,
      ),
      buildTargetPath,
    );
    const pegInFrontierContractStateV1FixtureGeneratorExecutablePath =
      verifiedNewBuildOutput(
        resolve(
          binaryDirectory,
          `generate-peg-in-frontier-contract-state-v1-fixture${executableSuffix}`,
        ),
        buildTargetPath,
      );
    const pegInFrontierMintTransitionV1VerifierExecutablePath = verifiedNewBuildOutput(
      resolve(
        binaryDirectory,
        `bridge-peg-in-frontier-mint-transition-v1-verifier${executableSuffix}`,
      ),
      buildTargetPath,
    );
    const pegInFrontierMintTransitionV1FixtureGeneratorExecutablePath =
      verifiedNewBuildOutput(
        resolve(
          binaryDirectory,
          `generate-peg-in-frontier-mint-transition-v1-fixture${executableSuffix}`,
        ),
        buildTargetPath,
      );
    const pegInCausalMintTransitionV2VerifierExecutablePath = verifiedNewBuildOutput(
      resolve(
        binaryDirectory,
        `bridge-peg-in-causal-mint-transition-v2-verifier${executableSuffix}`,
      ),
      buildTargetPath,
    );
    const pegInCausalMintTransitionV2FixtureGeneratorExecutablePath =
      verifiedNewBuildOutput(
        resolve(
          binaryDirectory,
          `generate-peg-in-causal-mint-transition-v2-fixture${executableSuffix}`,
        ),
        buildTargetPath,
      );
    const pegInCausalMintTransitionV3VerifierExecutablePath = verifiedNewBuildOutput(
      resolve(
        binaryDirectory,
        `bridge-peg-in-causal-mint-transition-v3-verifier${executableSuffix}`,
      ),
      buildTargetPath,
    );
    const pegInCausalMintTransitionV3FixtureGeneratorExecutablePath =
      verifiedNewBuildOutput(
        resolve(
          binaryDirectory,
          `generate-peg-in-causal-mint-transition-v3-fixture${executableSuffix}`,
        ),
        buildTargetPath,
      );
    const pegInCausalSourceProofResultV1ProducerExecutablePath =
      verifiedNewBuildOutput(
        resolve(
          binaryDirectory,
          `bridge-peg-in-causal-source-proof-result-v1-producer${executableSuffix}`,
        ),
        buildTargetPath,
      );
    const pegInCausalSourceProofResultV1FixtureGeneratorExecutablePath =
      verifiedNewBuildOutput(
        resolve(
          binaryDirectory,
          `generate-peg-in-causal-source-proof-result-v1-fixture${executableSuffix}`,
        ),
        buildTargetPath,
      );
    const verifierSha256Hex = fileSha256Hex(verifierExecutablePath);
    const codecSha256Hex = fileSha256Hex(codecExecutablePath);
    const pegInFrontierEventV1VerifierSha256Hex = fileSha256Hex(
      pegInFrontierEventV1VerifierExecutablePath,
    );
    const pegInFrontierEventV1FixtureGeneratorSha256Hex = fileSha256Hex(
      pegInFrontierEventV1FixtureGeneratorExecutablePath,
    );
    const pegInFrontierContractStateV1VerifierSha256Hex = fileSha256Hex(
      pegInFrontierContractStateV1VerifierExecutablePath,
    );
    const pegInFrontierContractStateV1FixtureGeneratorSha256Hex = fileSha256Hex(
      pegInFrontierContractStateV1FixtureGeneratorExecutablePath,
    );
    const pegInFrontierMintTransitionV1VerifierSha256Hex = fileSha256Hex(
      pegInFrontierMintTransitionV1VerifierExecutablePath,
    );
    const pegInFrontierMintTransitionV1FixtureGeneratorSha256Hex = fileSha256Hex(
      pegInFrontierMintTransitionV1FixtureGeneratorExecutablePath,
    );
    const pegInCausalMintTransitionV2VerifierSha256Hex = fileSha256Hex(
      pegInCausalMintTransitionV2VerifierExecutablePath,
    );
    const pegInCausalMintTransitionV2FixtureGeneratorSha256Hex = fileSha256Hex(
      pegInCausalMintTransitionV2FixtureGeneratorExecutablePath,
    );
    const pegInCausalMintTransitionV3VerifierSha256Hex = fileSha256Hex(
      pegInCausalMintTransitionV3VerifierExecutablePath,
    );
    const pegInCausalMintTransitionV3FixtureGeneratorSha256Hex = fileSha256Hex(
      pegInCausalMintTransitionV3FixtureGeneratorExecutablePath,
    );
    const pegInCausalSourceProofResultV1ProducerSha256Hex = fileSha256Hex(
      pegInCausalSourceProofResultV1ProducerExecutablePath,
    );
    const pegInCausalSourceProofResultV1FixtureGeneratorSha256Hex = fileSha256Hex(
      pegInCausalSourceProofResultV1FixtureGeneratorExecutablePath,
    );
    const pegInFrontierEventV1VectorCanonicalSha256Hex =
      await verifyGeneratedPegInFrontierEventV1Vector({
        generatorExecutablePath: pegInFrontierEventV1FixtureGeneratorExecutablePath,
        frontierSourcePath,
        expectedCanonicalBytes: expectedPegInFrontierEventV1Vector,
      });
    const pegInFrontierContractStateV1VectorCanonicalSha256Hex =
      await verifyGeneratedPegInFrontierContractStateV1Vector({
        generatorExecutablePath:
          pegInFrontierContractStateV1FixtureGeneratorExecutablePath,
        frontierSourcePath,
        expectedCanonicalBytes: expectedPegInFrontierContractStateV1Vector,
      });
    const pegInFrontierMintTransitionV1VectorCanonicalSha256Hex =
      await verifyGeneratedPegInFrontierMintTransitionV1Vector({
        generatorExecutablePath:
          pegInFrontierMintTransitionV1FixtureGeneratorExecutablePath,
        frontierSourcePath,
        expectedCanonicalBytes: expectedPegInFrontierMintTransitionV1Vector,
      });
    const pegInCausalMintTransitionV2VectorCanonicalSha256Hex =
      await verifyGeneratedPegInCausalMintTransitionV2Vector({
        generatorExecutablePath:
          pegInCausalMintTransitionV2FixtureGeneratorExecutablePath,
        frontierSourcePath,
        expectedCanonicalBytes: expectedPegInCausalMintTransitionV2Vector,
      });
    const pegInCausalMintTransitionV3VectorCanonicalSha256Hex =
      await verifyGeneratedPegInCausalMintTransitionV3Vector({
        generatorExecutablePath:
          pegInCausalMintTransitionV3FixtureGeneratorExecutablePath,
        frontierSourcePath,
        expectedCanonicalBytes: expectedPegInCausalMintTransitionV3Vector,
      });
    const pegInCausalSourceProofResultV1VectorCanonicalSha256Hex =
      await verifyGeneratedPegInCausalSourceProofResultV1Vector({
        generatorExecutablePath:
          pegInCausalSourceProofResultV1FixtureGeneratorExecutablePath,
        frontierSourcePath,
        expectedCanonicalBytes: expectedPegInCausalSourceProofResultProducerV1Vector,
      });

    const result = deepFreeze({
      schema: PINNED_LOCAL_NATIVE_VERIFIER_BUILD_SCHEMA,
      status: 'PINNED_LOCAL_SOURCE_BUILD_VERIFIED' as const,
      sourceIdentity: {
        consensusSourceLockSha256: EXPECTED_CONSENSUS_SOURCE_LOCK_SHA256,
        frontierCommit: EXPECTED_FRONTIER_COMMIT,
        frontierPatchSha256: EXPECTED_FRONTIER_PATCH_SHA256,
      },
      toolchain,
      build: {
        cargoLocked: true as const,
        cargoProfile: 'dev' as const,
        reproducibilityMode: PINNED_LOCAL_NATIVE_REPRODUCIBILITY_MODE,
        isolatedTarget: true as const,
        incrementalCompilationEnabled: false as const,
        debugInformationIncluded: false as const,
        codegenUnits: 1 as const,
        sourceAndTargetPathsRemapped: true as const,
        deterministicMsvcLinkingRequested:
          toolchain.rustTarget.endsWith('-pc-windows-msvc'),
        verifierSha256Hex,
        codecSha256Hex,
        pegInFrontierEventV1VerifierSha256Hex,
        pegInFrontierEventV1FixtureGeneratorSha256Hex,
        pegInFrontierEventV1VectorCanonicalSha256Hex,
        pegInFrontierContractStateV1VerifierSha256Hex,
        pegInFrontierContractStateV1FixtureGeneratorSha256Hex,
        pegInFrontierContractStateV1VectorCanonicalSha256Hex,
        pegInFrontierMintTransitionV1VerifierSha256Hex,
        pegInFrontierMintTransitionV1FixtureGeneratorSha256Hex,
        pegInFrontierMintTransitionV1VectorCanonicalSha256Hex,
        pegInCausalMintTransitionV2VerifierSha256Hex,
        pegInCausalMintTransitionV2FixtureGeneratorSha256Hex,
        pegInCausalMintTransitionV2VectorCanonicalSha256Hex,
        pegInCausalMintTransitionV3VerifierSha256Hex,
        pegInCausalMintTransitionV3FixtureGeneratorSha256Hex,
        pegInCausalMintTransitionV3VectorCanonicalSha256Hex,
        pegInCausalSourceProofResultV1ProducerSha256Hex,
        pegInCausalSourceProofResultV1FixtureGeneratorSha256Hex,
        pegInCausalSourceProofResultV1VectorCanonicalSha256Hex,
      },
      boundary: {
        canonicalSourceLockRequired: true as const,
        lockedToolchainRequired: true as const,
        sourceLockVerifiedBeforeBuild: true as const,
        sourceCheckoutVerifiedBeforeBuild: true as const,
        sourceLockVerifiedAfterBuild: true as const,
        sourceCheckoutVerifiedAfterBuild: true as const,
        pegInFrontierEventV1VectorRegeneratedAndMatched: true as const,
        pegInFrontierContractStateV1VectorRegeneratedAndMatched: true as const,
        pegInFrontierMintTransitionV1VectorRegeneratedAndMatched: true as const,
        pegInCausalMintTransitionV2VectorRegeneratedAndMatched: true as const,
        pegInCausalMintTransitionV3VectorRegeneratedAndMatched: true as const,
        pegInCausalSourceProofResultV1VectorRegeneratedAndMatched: true as const,
        preexistingBuildOutputAllowed: false as const,
        arbitraryExecutableAllowed: false as const,
        exclusiveSameUserProcessRequired: true as const,
        completeBuildToolClosureVerified: false as const,
        dependencyCacheContentAttested: false as const,
        independentBuildAttestationVerified: false as const,
        localConformanceOnly: true as const,
        admissionEligible: false as const,
        ergoAnchorVerified: false as const,
        onChainAcceptanceVerified: false as const,
        gate5Closed: false as const,
      },
    }) as unknown as PinnedLocalNativeVerifierBuild;
    PINNED_LOCAL_BUILD_RESULTS.add(result);
    PINNED_LOCAL_BUILD_EXECUTION.set(result, deepFreeze({
      verifierExecutablePath,
      verifierSha256Hex,
      codecExecutablePath,
      codecSha256Hex,
      pegInFrontierEventV1VerifierExecutablePath,
      pegInFrontierEventV1VerifierSha256Hex,
      pegInFrontierContractStateV1VerifierExecutablePath,
      pegInFrontierContractStateV1VerifierSha256Hex,
      pegInFrontierMintTransitionV1VerifierExecutablePath,
      pegInFrontierMintTransitionV1VerifierSha256Hex,
      pegInCausalMintTransitionV2VerifierExecutablePath,
      pegInCausalMintTransitionV2VerifierSha256Hex,
      pegInCausalMintTransitionV3VerifierExecutablePath,
      pegInCausalMintTransitionV3VerifierSha256Hex,
      pegInCausalSourceProofResultV1ProducerExecutablePath,
      pegInCausalSourceProofResultV1ProducerSha256Hex,
      buildTargetPath,
      frontierSourcePath,
      cargoExecutablePath,
      rustcExecutablePath,
      gitExecutablePath,
      cleanup,
    }));
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}

export function getPinnedLocalNativeVerifierExecution(
  build: PinnedLocalNativeVerifierBuild,
): PinnedLocalNativeVerifierExecution {
  assertPinnedLocalNativeVerifierBuildProvenance(build);
  const execution = PINNED_LOCAL_BUILD_EXECUTION.get(build);
  if (!execution) throw new Error('pinned local native verifier execution binding is missing');
  return deepFreeze({
    verifierExecutablePath: execution.verifierExecutablePath,
    verifierSha256Hex: execution.verifierSha256Hex,
    codecExecutablePath: execution.codecExecutablePath,
    codecSha256Hex: execution.codecSha256Hex,
    pegInFrontierEventV1VerifierExecutablePath:
      execution.pegInFrontierEventV1VerifierExecutablePath,
    pegInFrontierEventV1VerifierSha256Hex:
      execution.pegInFrontierEventV1VerifierSha256Hex,
    pegInFrontierContractStateV1VerifierExecutablePath:
      execution.pegInFrontierContractStateV1VerifierExecutablePath,
    pegInFrontierContractStateV1VerifierSha256Hex:
      execution.pegInFrontierContractStateV1VerifierSha256Hex,
    pegInFrontierMintTransitionV1VerifierExecutablePath:
      execution.pegInFrontierMintTransitionV1VerifierExecutablePath,
    pegInFrontierMintTransitionV1VerifierSha256Hex:
      execution.pegInFrontierMintTransitionV1VerifierSha256Hex,
    pegInCausalMintTransitionV2VerifierExecutablePath:
      execution.pegInCausalMintTransitionV2VerifierExecutablePath,
    pegInCausalMintTransitionV2VerifierSha256Hex:
      execution.pegInCausalMintTransitionV2VerifierSha256Hex,
    pegInCausalMintTransitionV3VerifierExecutablePath:
      execution.pegInCausalMintTransitionV3VerifierExecutablePath,
    pegInCausalMintTransitionV3VerifierSha256Hex:
      execution.pegInCausalMintTransitionV3VerifierSha256Hex,
    pegInCausalSourceProofResultV1ProducerExecutablePath:
      execution.pegInCausalSourceProofResultV1ProducerExecutablePath,
    pegInCausalSourceProofResultV1ProducerSha256Hex:
      execution.pegInCausalSourceProofResultV1ProducerSha256Hex,
  });
}

/**
 * Re-observe the exact source, toolchain, vector, and V3 executable identity.
 *
 * This refresh is local conformance evidence only. It intentionally does not
 * turn a same-host source build into an independently attested admission
 * authority.
 */
export function refreshPinnedLocalPegInCausalMintTransitionV3ExecutionIdentity(
  build: PinnedLocalNativeVerifierBuild,
): PinnedLocalPegInCausalMintTransitionV3ExecutionIdentity {
  assertPinnedLocalNativeVerifierBuildProvenance(build);
  const execution = PINNED_LOCAL_BUILD_EXECUTION.get(build);
  if (!execution) {
    throw new Error('pinned local native verifier execution binding is missing');
  }

  assertCanonicalSourceLocks();
  const source = inspectConsensusSourceBaseline({
    worktreeRoot: CANONICAL_WORKTREE_ROOT,
    bridgeRoot: CANONICAL_BRIDGE_ROOT,
    frontierSourcePath: execution.frontierSourcePath,
    requireFrontierCheckout: true,
    requireErgoCheckout: false,
    gitExecutablePath: execution.gitExecutablePath,
  });
  assertPinnedLocalFrontierSource(source, 'during V3 execution identity refresh');
  const toolchain = inspectAndValidateToolchain({
    cargoExecutablePath: execution.cargoExecutablePath,
    rustcExecutablePath: execution.rustcExecutablePath,
    gitExecutablePath: execution.gitExecutablePath,
  });
  if (!sameToolchainObservation(toolchain, build.toolchain)) {
    throw new Error('pinned local native verifier toolchain changed after build');
  }

  const executableSha256Hex = fileSha256Hex(
    execution.pegInCausalMintTransitionV3VerifierExecutablePath,
  );
  if (
    executableSha256Hex !== execution.pegInCausalMintTransitionV3VerifierSha256Hex
    || executableSha256Hex !== build.build.pegInCausalMintTransitionV3VerifierSha256Hex
  ) {
    throw new Error('pinned local causal V3 verifier executable changed after build');
  }
  if (
    source.sourceIdentity.frontierCommit !== build.sourceIdentity.frontierCommit
    || source.sourceIdentity.frontierPatchSha256
      !== build.sourceIdentity.frontierPatchSha256
  ) {
    throw new Error('pinned Frontier source identity changed after build');
  }
  const trackedVectorCanonicalSha256Hex = assertPinnedGeneratedJsonVectorDigest({
    value: readFileSync(PEG_IN_CAUSAL_MINT_TRANSITION_V3_VECTOR_PATH),
    expectedSha256Hex:
      build.build.pegInCausalMintTransitionV3VectorCanonicalSha256Hex,
    label: 'peg-in causal mint-transition V3',
  });

  const identityBody = {
    schema:
      PINNED_LOCAL_PEG_IN_CAUSAL_MINT_TRANSITION_V3_EXECUTION_IDENTITY_SCHEMA,
    sourceIdentity: build.sourceIdentity,
    toolchain,
    executable: {
      sha256Hex: executableSha256Hex,
      vectorCanonicalSha256Hex: trackedVectorCanonicalSha256Hex,
    },
  };
  const identityDigestHex = `0x${createHash('sha256')
    .update('E2S_PINNED_LOCAL_CAUSAL_V3_EXECUTION_IDENTITY_V1\0', 'utf8')
    .update(JSON.stringify(identityBody), 'utf8')
    .digest('hex')}`;
  const refresh = deepFreeze({
    ...identityBody,
    status: 'PINNED_LOCAL_CAUSAL_V3_EXECUTION_IDENTITY_REFRESHED' as const,
    identityDigestHex,
    boundary: {
      sourceLocksReloaded: true as const,
      sourceCheckoutRevalidated: true as const,
      toolchainReobserved: true as const,
      executableDigestReobserved: true as const,
      trackedVectorBuildBindingPreserved: true as const,
      independentBuildAttestationVerified: false as const,
      completeBuildToolClosureVerified: false as const,
      dependencyCacheContentAttested: false as const,
      localConformanceOnly: true as const,
      admissionEligible: false as const,
      gate5Closed: false as const,
    },
  });
  PINNED_LOCAL_CAUSAL_V3_EXECUTION_IDENTITIES.set(refresh, {
    build,
    identityDigestHex,
  });
  return refresh;
}

export function assertPinnedLocalPegInCausalMintTransitionV3ExecutionIdentityProvenance(
  input: {
    build: PinnedLocalNativeVerifierBuild;
    identity: unknown;
  },
): asserts input is {
  build: PinnedLocalNativeVerifierBuild;
  identity: PinnedLocalPegInCausalMintTransitionV3ExecutionIdentity;
} {
  assertPinnedLocalNativeVerifierBuildProvenance(input.build);
  if (!input.identity || typeof input.identity !== 'object') {
    throw new Error('pinned local causal V3 execution identity provenance is missing');
  }
  const observed = PINNED_LOCAL_CAUSAL_V3_EXECUTION_IDENTITIES.get(input.identity);
  if (
    observed?.build !== input.build
    || observed.identityDigestHex
      !== (input.identity as { identityDigestHex?: unknown }).identityDigestHex
  ) {
    throw new Error('pinned local causal V3 execution identity provenance is missing');
  }
}

/**
 * Re-observe the exact source, toolchain, vector, and unsigned source-proof
 * result producer identity. This remains same-host conformance evidence only.
 */
export function refreshPinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentity(
  build: PinnedLocalNativeVerifierBuild,
): PinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentity {
  assertPinnedLocalNativeVerifierBuildProvenance(build);
  const execution = PINNED_LOCAL_BUILD_EXECUTION.get(build);
  if (!execution) {
    throw new Error('pinned local native verifier execution binding is missing');
  }

  assertCanonicalSourceLocks();
  const source = inspectConsensusSourceBaseline({
    worktreeRoot: CANONICAL_WORKTREE_ROOT,
    bridgeRoot: CANONICAL_BRIDGE_ROOT,
    frontierSourcePath: execution.frontierSourcePath,
    requireFrontierCheckout: true,
    requireErgoCheckout: false,
    gitExecutablePath: execution.gitExecutablePath,
  });
  assertPinnedLocalFrontierSource(
    source,
    'during causal source-proof result producer execution identity refresh',
  );
  const toolchain = inspectAndValidateToolchain({
    cargoExecutablePath: execution.cargoExecutablePath,
    rustcExecutablePath: execution.rustcExecutablePath,
    gitExecutablePath: execution.gitExecutablePath,
  });
  if (!sameToolchainObservation(toolchain, build.toolchain)) {
    throw new Error('pinned local native verifier toolchain changed after build');
  }

  const executableSha256Hex = fileSha256Hex(
    execution.pegInCausalSourceProofResultV1ProducerExecutablePath,
  );
  if (
    executableSha256Hex
      !== execution.pegInCausalSourceProofResultV1ProducerSha256Hex
    || executableSha256Hex
      !== build.build.pegInCausalSourceProofResultV1ProducerSha256Hex
  ) {
    throw new Error(
      'pinned local causal source-proof result producer executable changed after build',
    );
  }
  if (
    source.sourceIdentity.frontierCommit !== build.sourceIdentity.frontierCommit
    || source.sourceIdentity.frontierPatchSha256
      !== build.sourceIdentity.frontierPatchSha256
  ) {
    throw new Error('pinned Frontier source identity changed after build');
  }
  const trackedVectorCanonicalSha256Hex = assertPinnedGeneratedJsonVectorDigest({
    value: readFileSync(PEG_IN_CAUSAL_SOURCE_PROOF_RESULT_PRODUCER_V1_VECTOR_PATH),
    expectedSha256Hex:
      build.build.pegInCausalSourceProofResultV1VectorCanonicalSha256Hex,
    label: 'peg-in causal source-proof result producer V1',
  });

  const identityBody = {
    schema:
      PINNED_LOCAL_PEG_IN_CAUSAL_SOURCE_PROOF_RESULT_PRODUCER_V1_EXECUTION_IDENTITY_SCHEMA,
    sourceIdentity: build.sourceIdentity,
    toolchain,
    executable: {
      sha256Hex: executableSha256Hex,
      vectorCanonicalSha256Hex: trackedVectorCanonicalSha256Hex,
    },
  };
  const identityDigestHex = `0x${createHash('sha256')
    .update(
      'E2S_PINNED_LOCAL_CAUSAL_SOURCE_PROOF_RESULT_PRODUCER_V1_EXECUTION_IDENTITY_V1\0',
      'utf8',
    )
    .update(JSON.stringify(identityBody), 'utf8')
    .digest('hex')}`;
  const refresh = deepFreeze({
    ...identityBody,
    status:
      'PINNED_LOCAL_CAUSAL_SOURCE_PROOF_RESULT_PRODUCER_V1_EXECUTION_IDENTITY_REFRESHED' as const,
    identityDigestHex,
    boundary: {
      sourceLocksReloaded: true as const,
      sourceCheckoutRevalidated: true as const,
      toolchainReobserved: true as const,
      executableDigestReobserved: true as const,
      trackedVectorBuildBindingPreserved: true as const,
      independentBuildAttestationVerified: false as const,
      completeBuildToolClosureVerified: false as const,
      dependencyCacheContentAttested: false as const,
      localConformanceOnly: true as const,
      admissionEligible: false as const,
      sourceCanonicalityVerified: false as const,
      sourceProofExecutionAuthenticated: false as const,
      gate5Closed: false as const,
    },
  });
  PINNED_LOCAL_CAUSAL_SOURCE_PROOF_PRODUCER_EXECUTION_IDENTITIES.set(refresh, {
    build,
    identityDigestHex,
  });
  return refresh;
}

export function assertPinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentityProvenance(
  input: {
    build: PinnedLocalNativeVerifierBuild;
    identity: unknown;
  },
): asserts input is {
  build: PinnedLocalNativeVerifierBuild;
  identity: PinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentity;
} {
  assertPinnedLocalNativeVerifierBuildProvenance(input.build);
  if (!input.identity || typeof input.identity !== 'object') {
    throw new Error(
      'pinned local causal source-proof result producer execution identity provenance is missing',
    );
  }
  const observed =
    PINNED_LOCAL_CAUSAL_SOURCE_PROOF_PRODUCER_EXECUTION_IDENTITIES.get(input.identity);
  if (
    observed?.build !== input.build
    || observed.identityDigestHex
      !== (input.identity as { identityDigestHex?: unknown }).identityDigestHex
  ) {
    throw new Error(
      'pinned local causal source-proof result producer execution identity provenance is missing',
    );
  }
}

export function disposePinnedLocalNativeVerifierBuild(
  build: PinnedLocalNativeVerifierBuild,
): void {
  assertPinnedLocalNativeVerifierBuildProvenance(build);
  const execution = PINNED_LOCAL_BUILD_EXECUTION.get(build);
  if (!execution) throw new Error('pinned local native verifier execution binding is missing');
  execution.cleanup();
  PINNED_LOCAL_BUILD_EXECUTION.delete(build);
  PINNED_LOCAL_BUILD_RESULTS.delete(build);
}

export function bindNativeCheckpointToPinnedLocalBuild(input: {
  checkpoint: NativeVerifiedBridgeCheckpoint;
  build: PinnedLocalNativeVerifierBuild;
}): PinnedLocalSourceNativeVerifiedBridgeCheckpoint {
  const execution = getPinnedLocalNativeVerifierExecution(input?.build);
  assertNativeVerifiedBridgeCheckpointExecutableProvenance(input?.checkpoint, {
    executablePath: execution.verifierExecutablePath,
    executableSha256Hex: execution.verifierSha256Hex,
  });
  const pinned = input.checkpoint as PinnedLocalSourceNativeVerifiedBridgeCheckpoint;
  PINNED_LOCAL_CHECKPOINT_RESULTS.add(pinned);
  return pinned;
}

export function assertPinnedLocalSourceNativeCheckpointProvenance(
  checkpoint: unknown,
): asserts checkpoint is PinnedLocalSourceNativeVerifiedBridgeCheckpoint {
  if (
    typeof checkpoint !== 'object'
    || checkpoint === null
    || !PINNED_LOCAL_CHECKPOINT_RESULTS.has(checkpoint)
  ) {
    throw new Error('pinned-local-source native checkpoint provenance is missing');
  }
}

export function createPinnedLocalNativeBuildWorkspace(
  onTargetAllocated?: (targetPath: string) => void,
  options: {
    cargoDependencyMode?: 'shared-cache' | 'private-copy-offline';
    sharedCargoHomeRoot?: string;
    temporaryDirectoryRoot?: string;
  } = {},
): {
  buildTargetPath: string;
  cargoHomePath: string;
  cleanup: () => void;
} {
  const temporaryDirectoryRoot = resolveBuildTargetRoot(
    options.temporaryDirectoryRoot ?? tmpdir(),
  );
  const buildTargetPath = mkdtempSync(
    join(temporaryDirectoryRoot, BUILD_TARGET_PREFIX),
  );
  const cleanup = createBuildTargetCleanup(
    buildTargetPath,
    temporaryDirectoryRoot,
  );
  process.once('exit', cleanup);
  try {
    onTargetAllocated?.(buildTargetPath);
    assertFreshIsolatedNativeBuildTarget(
      buildTargetPath,
      temporaryDirectoryRoot,
    );
    const cargoHomePath = prepareIsolatedCargoHome(
      buildTargetPath,
      options.cargoDependencyMode ?? 'shared-cache',
      options.sharedCargoHomeRoot,
    );
    return { buildTargetPath, cargoHomePath, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

export function assertFreshIsolatedNativeBuildTarget(
  targetPathInput: string,
  temporaryDirectoryRootInput: string = tmpdir(),
): void {
  const targetPath = realpathSync(requireAbsolutePath(targetPathInput, 'isolated build target'));
  const temporaryDirectoryRoot = resolveBuildTargetRoot(
    temporaryDirectoryRootInput,
  );
  assertSafeBuildTargetPath(targetPath, temporaryDirectoryRoot);
  const stat = lstatSync(targetPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('isolated native build target must be a regular directory');
  }
  if (readdirSync(targetPath).length !== 0) {
    throw new Error('isolated native build target must be empty before Cargo starts');
  }
}

export function validateNativeVerifierToolchainLock(
  value: unknown,
  observation: NativeVerifierBuildToolObservation,
): NativeVerifierToolchainLockValidation {
  const errors: string[] = [];
  const lock = asRecord(value);
  if (!lock) return { errors: ['native verifier toolchain lock must be an object'] };
  requireExact(errors, lock.schemaVersion, 1, 'toolchain lock schemaVersion must be 1');
  requireExact(
    errors,
    lock.kind,
    'bridge-native-verifier-toolchain-lock',
    'toolchain lock kind is invalid',
  );
  const profiles = asRecord(lock.profiles);
  const profile = asRecord(profiles?.[observation.platformKey]);
  if (!profile) {
    errors.push(`toolchain lock has no pinned profile for ${observation.platformKey}`);
  } else {
    requireExact(errors, profile.rustTarget, observation.rustTarget, 'pinned rust target mismatch');
    validateTool(errors, profile.cargo, observation.cargo, 'Cargo');
    validateTool(errors, profile.rustc, observation.rustc, 'rustc');
    validateTool(errors, profile.git, observation.git, 'Git');
  }
  const boundaries = asRecord(lock.boundaries);
  for (const [field, label] of [
    ['absoluteToolPathsRequired', 'absolute tool paths'],
    ['toolDigestsRequired', 'tool digests'],
    ['isolatedCargoTargetRequired', 'isolated Cargo target'],
    ['cargoLockedRequired', 'Cargo lockfile'],
    ['unsupportedPlatformsFailClosed', 'unsupported platforms'],
  ] as const) {
    if (boundaries?.[field] !== true) errors.push(`toolchain lock must require ${label}`);
  }
  for (const [field, label] of [
    ['completeBuildToolClosureVerifiedByThisLock', 'complete build tool closure'],
    ['dependencyCacheContentAttestedByThisLock', 'dependency cache content attestation'],
    ['independentBuildAttestationVerifiedByThisLock', 'independent build attestation'],
  ] as const) {
    if (boundaries?.[field] !== false) {
      errors.push(`toolchain lock must not claim ${label}`);
    }
  }
  if (boundaries?.localConformanceOnly !== true) {
    errors.push('toolchain lock must remain local-conformance-only');
  }
  if (boundaries?.admissionEligible !== false) {
    errors.push('toolchain lock must remain admission-ineligible');
  }
  return { errors };
}

function assertPinnedLocalNativeVerifierBuildProvenance(
  build: unknown,
): asserts build is PinnedLocalNativeVerifierBuild {
  if (typeof build !== 'object' || build === null || !PINNED_LOCAL_BUILD_RESULTS.has(build)) {
    throw new Error('pinned local native verifier build provenance is missing');
  }
}

function assertCanonicalSourceLocks(): void {
  const sourceLockPath = resolve(
    CANONICAL_BRIDGE_ROOT,
    'sources',
    'consensus-source-lock.json',
  );
  const sourceLockSha256 = fileSha256Hex(sourceLockPath).slice(2);
  if (sourceLockSha256 !== EXPECTED_CONSENSUS_SOURCE_LOCK_SHA256) {
    throw new Error('canonical consensus source lock digest is not the pinned identity');
  }
  const compilerLock = parseJsonObject(resolve(
    CANONICAL_BRIDGE_ROOT,
    'sources',
    'authenticated-v2-compiler-lock.json',
  ));
  if (compilerLock.consensusSourceLockSha256 !== EXPECTED_CONSENSUS_SOURCE_LOCK_SHA256) {
    throw new Error('authenticated V2 compiler lock does not bind the pinned consensus source lock');
  }
}

function inspectAndValidateToolchain(input: {
  cargoExecutablePath: string;
  rustcExecutablePath: string;
  gitExecutablePath: string;
}): NativeVerifierBuildToolObservation {
  const platformKey = `${process.platform}-${process.arch}`;
  const lockPath = resolve(
    CANONICAL_BRIDGE_ROOT,
    'sources',
    'native-verifier-toolchain-lock.json',
  );
  const lockBytes = readFileSync(lockPath);
  const lockSha256 = createHash('sha256').update(lockBytes).digest('hex');
  if (lockSha256 !== EXPECTED_NATIVE_VERIFIER_TOOLCHAIN_LOCK_SHA256) {
    throw new Error('native verifier toolchain lock digest is not the pinned identity');
  }
  const parsed = JSON.parse(lockBytes.toString('utf8')) as unknown;
  const profile = asRecord(asRecord(asRecord(parsed)?.profiles)?.[platformKey]);
  const rustTarget = typeof profile?.rustTarget === 'string' ? profile.rustTarget : '';
  const observation: NativeVerifierBuildToolObservation = {
    platformKey,
    rustTarget,
    cargo: observedTool(input.cargoExecutablePath),
    rustc: observedTool(input.rustcExecutablePath),
    git: observedTool(input.gitExecutablePath),
  };
  const validation = validateNativeVerifierToolchainLock(parsed, observation);
  if (validation.errors.length > 0) {
    throw new Error('native verifier build tools do not match the pinned toolchain lock');
  }
  return deepFreeze(observation);
}

function observedTool(executablePath: string): { version: string; sha256: string } {
  let version: string;
  try {
    version = execFileSync(executablePath, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: TOOL_VERSION_TIMEOUT_MS,
      env: minimalToolEnvironment(),
    }).trim();
  } catch {
    throw new Error('pinned local native verifier build tool version check failed');
  }
  return {
    version,
    sha256: fileSha256Hex(executablePath).slice(2),
  };
}

function sameToolchainObservation(
  left: NativeVerifierBuildToolObservation,
  right: NativeVerifierBuildToolObservation,
): boolean {
  return left.platformKey === right.platformKey
    && left.rustTarget === right.rustTarget
    && left.cargo.version === right.cargo.version
    && left.cargo.sha256 === right.cargo.sha256
    && left.rustc.version === right.rustc.version
    && left.rustc.sha256 === right.rustc.sha256
    && left.git.version === right.git.version
    && left.git.sha256 === right.git.sha256;
}

function assertPinnedLocalFrontierSource(
  report: ConsensusSourceBaselineReport,
  stage: string,
): void {
  if (
    report.status !== 'PASS'
    || !report.checks.lockBindingsValidated
    || !report.checks.frontierCheckoutRequired
    || !report.checks.frontierCheckoutValidated
    || report.sourceIdentity.frontierCommit !== EXPECTED_FRONTIER_COMMIT
    || report.sourceIdentity.frontierPatchSha256 !== EXPECTED_FRONTIER_PATCH_SHA256
    || !report.boundaries.sidechainFinalityImplemented
    || !report.boundaries.runtimeCommitmentProducerImplemented
    || !report.boundaries.grandpaAuthorityTransitionVerificationImplemented
    || !report.boundaries.hashLinkedGrandpaVerificationImplemented
    || !report.boundaries.nativeRuntimeCommitmentStateVerificationImplemented
    || !report.boundaries.nativeFinalizedCheckpointVerificationImplemented
    || !report.boundaries.nativeRpcProofCodecImplemented
  ) {
    throw new Error(`pinned Frontier source validation failed ${stage}`);
  }
}

async function runPinnedCargoBuild(input: {
  frontierSourcePath: string;
  buildTargetPath: string;
  cargoExecutablePath: string;
  rustcExecutablePath: string;
  rustTarget: string;
  cargoHomePath: string;
  offline: boolean;
}): Promise<void> {
  const args = buildPinnedLocalNativeCargoArgs({
    frontierSourcePath: input.frontierSourcePath,
    buildTargetPath: input.buildTargetPath,
    rustTarget: input.rustTarget,
    offline: input.offline,
  });
  await runBoundedNativeBuildProcess({
    executablePath: input.cargoExecutablePath,
    args,
    cwd: input.buildTargetPath,
    env: minimalCargoEnvironment({
      frontierSourcePath: input.frontierSourcePath,
      rustcExecutablePath: input.rustcExecutablePath,
      rustTarget: input.rustTarget,
      buildTargetPath: input.buildTargetPath,
      cargoHomePath: input.cargoHomePath,
      offline: input.offline,
    }),
    timeoutMs: BUILD_TIMEOUT_MS,
    maxOutputBytes: MAX_BUILD_OUTPUT_BYTES,
    label: 'pinned local native verifier cargo build',
  });
}

export function buildPinnedLocalNativeCargoArgs(input: {
  frontierSourcePath: string;
  buildTargetPath: string;
  rustTarget: string;
  offline?: boolean;
}): string[] {
  const frontierSourcePath = resolve(requireAbsolutePath(
    input?.frontierSourcePath,
    'Frontier source path for pinned Cargo build',
  ));
  const buildTargetPath = resolve(requireAbsolutePath(
    input?.buildTargetPath,
    'build target path for pinned Cargo build',
  ));
  if (typeof input?.rustTarget !== 'string' || input.rustTarget.length === 0) {
    throw new Error('Rust target for pinned Cargo build must be non-empty');
  }
  return [
    'build',
    '--locked',
    ...(input.offline ? ['--offline'] : []),
    '--target-dir',
    buildTargetPath,
    '--target',
    input.rustTarget,
    '--manifest-path',
    resolve(frontierSourcePath, 'Cargo.toml'),
    '-p',
    'bridge-checkpoint-verifier',
    '--bin',
    'bridge-checkpoint-verifier',
    '--bin',
    'bridge-rpc-proof-codec',
    '--bin',
    'bridge-peg-in-frontier-event-v1-verifier',
    '--bin',
    'generate-peg-in-frontier-event-v1-fixture',
    '--bin',
    'bridge-peg-in-frontier-contract-state-v1-verifier',
    '--bin',
    'generate-peg-in-frontier-contract-state-v1-fixture',
    '--bin',
    'bridge-peg-in-frontier-mint-transition-v1-verifier',
    '--bin',
    'generate-peg-in-frontier-mint-transition-v1-fixture',
    '--bin',
    'bridge-peg-in-causal-mint-transition-v2-verifier',
    '--bin',
    'generate-peg-in-causal-mint-transition-v2-fixture',
    '--bin',
    'bridge-peg-in-causal-mint-transition-v3-verifier',
    '--bin',
    'generate-peg-in-causal-mint-transition-v3-fixture',
    '--bin',
    'bridge-peg-in-causal-source-proof-result-v1-producer',
    '--bin',
    'generate-peg-in-causal-source-proof-result-v1-fixture',
  ];
}

/** Normalize only checkout EOLs and one optional final newline before byte comparison. */
export function canonicalizePinnedGeneratedJsonVectorBytes(
  value: Buffer | string,
  label = 'generated JSON vector',
): Buffer {
  const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    throw new Error(`${label} must not contain a UTF-8 BOM`);
  }
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} must be valid UTF-8`);
  }
  const normalized = decoded.replace(/\r\n/g, '\n');
  if (normalized.includes('\r')) {
    throw new Error(`${label} contains a non-canonical carriage return`);
  }
  const canonical = normalized.endsWith('\n')
    ? normalized.slice(0, -1)
    : normalized;
  if (canonical.endsWith('\n')) {
    throw new Error(`${label} contains more than one trailing newline`);
  }
  try {
    JSON.parse(canonical);
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
  return Buffer.from(canonical, 'utf8');
}

/** Rehash a currently tracked vector and reject drift from its pinned build identity. */
export function assertPinnedGeneratedJsonVectorDigest(input: {
  readonly value: Buffer | string;
  readonly expectedSha256Hex: string;
  readonly label?: string;
}): string {
  const label = input.label ?? 'generated JSON';
  if (!/^0x[0-9a-f]{64}$/.test(input.expectedSha256Hex)) {
    throw new Error(`pinned ${label} vector digest must be a lowercase SHA-256 digest`);
  }
  const canonical = canonicalizePinnedGeneratedJsonVectorBytes(
    input.value,
    `tracked ${label} vector during execution refresh`,
  );
  const observedSha256Hex = `0x${createHash('sha256')
    .update(canonical)
    .digest('hex')}`;
  if (observedSha256Hex !== input.expectedSha256Hex) {
    throw new Error(`tracked ${label} vector changed after pinned local build`);
  }
  return observedSha256Hex;
}

/** Reject tracked-vector drift during generation and return the matched canonical SHA-256. */
export function assertPinnedGeneratedJsonVectorMatch(input: {
  readonly initiallyTrackedCanonicalBytes: Buffer;
  readonly currentlyTrackedCanonicalBytes: Buffer;
  readonly generatedCanonicalBytes: Buffer;
  readonly label?: string;
}): string {
  const label = input.label ?? 'pinned generated JSON';
  if (!input.currentlyTrackedCanonicalBytes.equals(input.initiallyTrackedCanonicalBytes)) {
    throw new Error(`tracked ${label} vector changed during generation`);
  }
  if (!input.generatedCanonicalBytes.equals(input.currentlyTrackedCanonicalBytes)) {
    throw new Error(`generated ${label} vector differs from the tracked vector`);
  }
  return `0x${createHash('sha256').update(input.generatedCanonicalBytes).digest('hex')}`;
}

async function verifyGeneratedPegInFrontierEventV1Vector(input: {
  generatorExecutablePath: string;
  frontierSourcePath: string;
  expectedCanonicalBytes: Buffer;
}): Promise<string> {
  return await verifyGeneratedPinnedJsonVector({
    ...input,
    trackedVectorPath: PEG_IN_FRONTIER_EVENT_V1_VECTOR_PATH,
    label: 'peg-in Frontier event V1',
  });
}

async function verifyGeneratedPegInFrontierContractStateV1Vector(input: {
  generatorExecutablePath: string;
  frontierSourcePath: string;
  expectedCanonicalBytes: Buffer;
}): Promise<string> {
  return await verifyGeneratedPinnedJsonVector({
    ...input,
    trackedVectorPath: PEG_IN_FRONTIER_CONTRACT_STATE_V1_VECTOR_PATH,
    label: 'peg-in Frontier contract-state V1',
  });
}

async function verifyGeneratedPegInFrontierMintTransitionV1Vector(input: {
  generatorExecutablePath: string;
  frontierSourcePath: string;
  expectedCanonicalBytes: Buffer;
}): Promise<string> {
  return await verifyGeneratedPinnedJsonVector({
    ...input,
    trackedVectorPath: PEG_IN_FRONTIER_MINT_TRANSITION_V1_VECTOR_PATH,
    label: 'peg-in Frontier mint-transition V1',
  });
}

async function verifyGeneratedPegInCausalMintTransitionV2Vector(input: {
  generatorExecutablePath: string;
  frontierSourcePath: string;
  expectedCanonicalBytes: Buffer;
}): Promise<string> {
  return await verifyGeneratedPinnedJsonVector({
    ...input,
    trackedVectorPath: PEG_IN_CAUSAL_MINT_TRANSITION_V2_VECTOR_PATH,
    label: 'peg-in causal mint-transition V2',
  });
}

async function verifyGeneratedPegInCausalMintTransitionV3Vector(input: {
  generatorExecutablePath: string;
  frontierSourcePath: string;
  expectedCanonicalBytes: Buffer;
}): Promise<string> {
  return await verifyGeneratedPinnedJsonVector({
    ...input,
    trackedVectorPath: PEG_IN_CAUSAL_MINT_TRANSITION_V3_VECTOR_PATH,
    label: 'peg-in causal mint-transition V3',
  });
}

async function verifyGeneratedPegInCausalSourceProofResultV1Vector(input: {
  generatorExecutablePath: string;
  frontierSourcePath: string;
  expectedCanonicalBytes: Buffer;
}): Promise<string> {
  return await verifyGeneratedPinnedJsonVector({
    ...input,
    trackedVectorPath: PEG_IN_CAUSAL_SOURCE_PROOF_RESULT_PRODUCER_V1_VECTOR_PATH,
    label: 'peg-in causal source-proof result producer V1',
  });
}

async function verifyGeneratedPinnedJsonVector(input: {
  generatorExecutablePath: string;
  frontierSourcePath: string;
  expectedCanonicalBytes: Buffer;
  trackedVectorPath: string;
  label: string;
}): Promise<string> {
  const generated = await runBoundedProcess({
    executablePath: input.generatorExecutablePath,
    args: [],
    cwd: input.frontierSourcePath,
    env: minimalToolEnvironment(),
    timeoutMs: VECTOR_GENERATION_TIMEOUT_MS,
    maxOutputBytes: MAX_VECTOR_OUTPUT_BYTES,
    label: `pinned ${input.label} vector generator`,
  });
  if (generated.stderr.length > 0) {
    throw new Error(`pinned ${input.label} vector generator wrote stderr`);
  }
  const canonical = canonicalizePinnedGeneratedJsonVectorBytes(
    generated.stdout,
    `generated ${input.label} vector`,
  );
  const currentlyTrackedCanonicalBytes = canonicalizePinnedGeneratedJsonVectorBytes(
    readFileSync(input.trackedVectorPath),
    `tracked ${input.label} vector after generation`,
  );
  return assertPinnedGeneratedJsonVectorMatch({
    initiallyTrackedCanonicalBytes: input.expectedCanonicalBytes,
    currentlyTrackedCanonicalBytes,
    generatedCanonicalBytes: canonical,
    label: input.label,
  });
}

export interface BoundedProcessInput {
  executablePath: string;
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  maxOutputBytes: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  terminationGraceMs?: number;
  label: string;
}

export interface BoundedProcessResult {
  pid: number;
  exitCode: 0;
  stdoutBytes: Buffer;
  stderrBytes: Buffer;
  stdout: string;
  stderr: string;
}

export class BoundedProcessExitError extends Error {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;

  constructor(input: Readonly<{
    label: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  }>) {
    super(`${input.label} failed`);
    this.name = 'BoundedProcessExitError';
    this.exitCode = input.exitCode;
    this.stdout = input.stdout;
    this.stderr = input.stderr;
  }
}

interface BoundedProcessSpawnSpecification {
  executablePath: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export async function runBoundedNativeBuildProcess(
  input: BoundedProcessInput,
): Promise<void> {
  await runBoundedProcess(input);
}

export async function runBoundedProcess(
  input: BoundedProcessInput,
): Promise<BoundedProcessResult> {
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0) {
    throw new Error('bounded process timeout must be a positive safe integer');
  }
  const maxSupportedTimeoutMs = process.platform === 'win32'
    ? MAX_NODE_TIMER_MS - WINDOWS_JOB_RUNNER_WATCHDOG_ALLOWANCE_MS
    : MAX_NODE_TIMER_MS;
  if (input.timeoutMs > maxSupportedTimeoutMs) {
    throw new Error('bounded process timeout exceeds the supported timer range');
  }
  if (!Number.isSafeInteger(input.maxOutputBytes) || input.maxOutputBytes <= 0) {
    throw new Error('bounded process output limit must be a positive safe integer');
  }
  const maxStdoutBytes = input.maxStdoutBytes ?? input.maxOutputBytes;
  const maxStderrBytes = input.maxStderrBytes ?? input.maxOutputBytes;
  const terminationGraceMs = input.terminationGraceMs
    ?? DEFAULT_PROCESS_TREE_TERMINATION_GRACE_MS;
  for (const [label, value] of [
    ['stdout limit', maxStdoutBytes],
    ['stderr limit', maxStderrBytes],
    ['termination grace', terminationGraceMs],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`bounded process ${label} must be a positive safe integer`);
    }
  }

  return await new Promise<BoundedProcessResult>((resolvePromise, reject) => {
    let settled = false;
    let outputBytes = 0;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let completedExitCode = -1;
    let requestedFailure: Error | undefined;
    let terminationFailure: Error | undefined;
    let exitVerificationFailure: Error | undefined;
    let liveTreeTerminationConfirmed = false;
    let terminationRetry: NodeJS.Timeout | undefined;
    let terminationDeadline: NodeJS.Timeout | undefined;
    let postExitCloseTimer: NodeJS.Timeout | undefined;
    let terminationQuarantineHold: NodeJS.Timeout | undefined;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const spawnSpecification = buildBoundedProcessSpawnSpecification(input);
    const child = process.platform === 'win32'
      ? spawn(spawnSpecification.executablePath, spawnSpecification.args, {
          cwd: spawnSpecification.cwd,
          windowsHide: true,
          shell: false,
          detached: false,
          env: spawnSpecification.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      : spawn(spawnSpecification.executablePath, spawnSpecification.args, {
          cwd: spawnSpecification.cwd,
          windowsHide: true,
          shell: false,
          detached: true,
          env: spawnSpecification.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
    const watchdogTimeoutMs = process.platform === 'win32'
      ? input.timeoutMs + WINDOWS_JOB_RUNNER_WATCHDOG_ALLOWANCE_MS
      : input.timeoutMs;
    const timer = setTimeout(() => {
      requestTermination(new Error(`${input.label} timed out`));
    }, watchdogTimeoutMs);
    const consume = (
      chunks: Buffer[],
      channel: 'stdout' | 'stderr',
      channelLimit: number,
    ) => (chunk: Buffer): void => {
      const channelBytes = channel === 'stdout' ? stdoutBytes : stderrBytes;
      const remaining = Math.max(
        0,
        Math.min(input.maxOutputBytes - outputBytes, channelLimit - channelBytes),
      );
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
      outputBytes += chunk.length;
      if (channel === 'stdout') stdoutBytes += chunk.length;
      else stderrBytes += chunk.length;
      if (outputBytes > input.maxOutputBytes) {
        requestTermination(new Error(`${input.label} output exceeded the limit`));
      } else if (
        (channel === 'stdout' ? stdoutBytes : stderrBytes) > channelLimit
      ) {
        requestTermination(new Error(`${input.label} ${channel} exceeded the limit`));
      }
    };
    child.stdout.on('data', consume(stdoutChunks, 'stdout', maxStdoutBytes));
    child.stderr.on('data', consume(stderrChunks, 'stderr', maxStderrBytes));
    child.once('error', () => finish(new Error(`${input.label} failed to start`)));
    child.once('exit', code => {
      child.stdin?.destroy();
      if (
        process.platform === 'win32'
        && code === WINDOWS_JOB_TARGET_TIMEOUT_EXIT_CODE
        && !requestedFailure
      ) {
        requestedFailure = new Error(`${input.label} timed out`);
        clearTimeout(timer);
      }
      postExitCloseTimer = setTimeout(() => {
        postExitCloseTimer = undefined;
        stopTerminationRetry();
        holdCleanupAuthority();
      }, POST_EXIT_CLOSE_TIMEOUT_MS);
      if (process.platform === 'win32' && !requestedFailure) {
        exitVerificationFailure = confirmsWindowsJobContainment(code)
          ? undefined
          : new Error(
              'Windows Job Object runner did not confirm process-tree containment',
            );
        return;
      }
      if (process.platform === 'win32' && requestedFailure) {
        if (confirmsWindowsJobContainment(code)) {
          liveTreeTerminationConfirmed = true;
          terminationFailure = undefined;
          exitVerificationFailure = undefined;
          stopTerminationRetry();
        } else {
          exitVerificationFailure = new Error(
            'Windows Job Object runner did not confirm process-tree termination',
          );
        }
        return;
      }
      try {
        assertNoNativeBuildDescendants(child);
        exitVerificationFailure = undefined;
        if (requestedFailure) {
          // Stable absence after parent exit closes the race where an earlier
          // termination attempt reported failure after process exit already won.
          liveTreeTerminationConfirmed = true;
          terminationFailure = undefined;
          stopTerminationRetry();
        }
      } catch (error) {
        exitVerificationFailure = error instanceof Error
          ? error
          : new Error('native build descendant inspection failed');
      }
    });
    child.once('close', code => {
      completedExitCode = code ?? -1;
      if (postExitCloseTimer) {
        clearTimeout(postExitCloseTimer);
        postExitCloseTimer = undefined;
      }
      if (
        requestedFailure
        && process.platform === 'win32'
        && confirmsWindowsJobContainment(code)
      ) {
        liveTreeTerminationConfirmed = true;
        terminationFailure = undefined;
        exitVerificationFailure = undefined;
        stopTerminationRetry();
      }
      if (requestedFailure) {
        if (
          liveTreeTerminationConfirmed
          && !terminationFailure
          && !exitVerificationFailure
        ) {
          finish(requestedFailure);
        } else {
          stopTerminationRetry();
          holdCleanupAuthority();
        }
        return;
      }
      if (exitVerificationFailure) {
        stopTerminationRetry();
        holdCleanupAuthority();
        return;
      }
      if (code !== 0) {
        finish(new BoundedProcessExitError({
          label: input.label,
          exitCode: code ?? -1,
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
        }));
        return;
      }
      finish();
    });

    function requestTermination(error: Error): void {
      if (settled || requestedFailure) return;
      requestedFailure = error;
      clearTimeout(timer);
      attemptTermination();
      if (!liveTreeTerminationConfirmed) {
        terminationRetry = setInterval(() => {
          attemptTermination();
        }, PROCESS_TREE_TERMINATION_RETRY_MS);
      }
      terminationDeadline = setTimeout(() => {
        if (settled) return;
        terminationDeadline = undefined;
        holdCleanupAuthority();
      }, terminationGraceMs);
    }

    function attemptTermination(): void {
      try {
        if (process.platform === 'win32') {
          if (!child.stdin || child.stdin.destroyed || !child.stdin.writable) {
            throw new Error('Windows Job Object cancellation channel is unavailable');
          }
          if (!child.stdin.writableEnded) child.stdin.end();
          terminationFailure = undefined;
          return;
        }
        terminateNativeBuildProcessTree(child);
        liveTreeTerminationConfirmed = true;
        terminationFailure = undefined;
        if (terminationRetry) {
          clearInterval(terminationRetry);
          terminationRetry = undefined;
        }
      } catch (error) {
        terminationFailure = error instanceof Error
          ? error
          : new Error('native build process-tree termination failed');
      }
    }

    function stopTerminationRetry(): void {
      if (!terminationRetry) return;
      clearInterval(terminationRetry);
      terminationRetry = undefined;
    }

    function holdCleanupAuthority(): void {
      if (terminationQuarantineHold) return;
      // A pending Promise alone does not keep Node alive. Retain an explicit
      // handle so unverifiable process-tree termination fail-stops the host
      // instead of returning authority over its build/request directories.
      terminationQuarantineHold = setInterval(() => undefined, 60_000);
    }

    function finish(error?: Error): void {
      if (settled) return;
      clearTimeout(timer);
      stopTerminationRetry();
      if (terminationDeadline) clearTimeout(terminationDeadline);
      if (postExitCloseTimer) clearTimeout(postExitCloseTimer);
      if (terminationQuarantineHold) clearInterval(terminationQuarantineHold);
      if (error) {
        settled = true;
        reject(error);
        return;
      }
      if (!Number.isSafeInteger(child.pid) || !child.pid || completedExitCode !== 0) {
        settled = true;
        reject(new Error(`${input.label} did not expose a successful process identity`));
        return;
      }
      settled = true;
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const stderrBuffer = Buffer.concat(stderrChunks);
      resolvePromise({
        pid: child.pid,
        exitCode: 0,
        stdoutBytes: stdoutBuffer,
        stderrBytes: stderrBuffer,
        stdout: stdoutBuffer.toString('utf8'),
        stderr: stderrBuffer.toString('utf8'),
      });
    }
  });
}

function buildBoundedProcessSpawnSpecification(
  input: BoundedProcessInput,
): BoundedProcessSpawnSpecification {
  if (process.platform !== 'win32') {
    return {
      executablePath: input.executablePath,
      args: [...input.args],
      cwd: input.cwd,
      env: input.env,
    };
  }

  const systemRoot = input.env.SystemRoot ?? input.env.WINDIR;
  if (!systemRoot || !isAbsolute(systemRoot)) {
    throw new Error(`${input.label} Windows Job Object runner requires SystemRoot`);
  }
  if (!existsSync(WINDOWS_JOB_PROCESS_RUNNER_PATH)) {
    throw new Error(`${input.label} Windows Job Object runner is unavailable`);
  }
  const executablePath = requireProcessArgument(
    input.executablePath,
    `${input.label} executable path`,
  );
  const cwd = requireProcessArgument(input.cwd, `${input.label} working directory`);
  const args = input.args.map((arg, index) => requireProcessArgument(
    arg,
    `${input.label} argument ${index + 1}`,
  ));
  return {
    executablePath: resolve(
      systemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    ),
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      WINDOWS_JOB_PROCESS_RUNNER_PATH,
    ],
    cwd,
    env: {
      ...input.env,
      E2S_JOB_EXECUTABLE_B64: encodeWindowsJobValue(executablePath),
      E2S_JOB_ARGUMENTS_B64: encodeWindowsJobValue(JSON.stringify(args)),
      E2S_JOB_CWD_B64: encodeWindowsJobValue(cwd),
      E2S_JOB_TIMEOUT_MS_B64: encodeWindowsJobValue(String(input.timeoutMs)),
    },
  };
}

function requireProcessArgument(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error(`${label} must be a non-empty NUL-free string`);
  }
  return value;
}

function confirmsWindowsJobContainment(code: number | null): boolean {
  return code === 0
    || code === WINDOWS_JOB_CANCELLATION_EXIT_CODE
    || code === WINDOWS_JOB_TARGET_FAILURE_EXIT_CODE
    || code === WINDOWS_JOB_CONTAINED_WRAPPER_FAILURE_EXIT_CODE
    || code === WINDOWS_JOB_TARGET_TIMEOUT_EXIT_CODE;
}

function encodeWindowsJobValue(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

export function terminateNativeBuildProcessTree(
  child: ChildProcess,
): void {
  const pid = child.pid;
  if (!pid) throw new Error('native build parent PID is unavailable');
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error('native build parent has already exited');
  }

  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (!systemRoot) {
      throw new Error('Windows process-tree termination is unavailable without SystemRoot');
    }
    if (terminateWindowsProcess(pid, systemRoot)) return;
    throw new Error('live Windows native build process-tree termination failed');
  }

  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    throw new Error('POSIX process-group termination could not be verified');
  }
}

// Once the parent exits, PID reuse makes descendant termination unsafe; inspect only.
export function assertNoNativeBuildDescendants(
  child: ChildProcess,
  options: {
    collectWindowsDescendants?: (rootPid: number, systemRoot: string) => number[];
  } = {},
): void {
  const pid = child.pid;
  if (!pid) throw new Error('native build parent PID is unavailable for descendant inspection');

  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (!systemRoot) {
      throw new Error('cannot inspect native build descendants without SystemRoot');
    }
    const collectDescendants = options.collectWindowsDescendants
      ?? collectWindowsDescendantProcessIds;
    let descendants: number[] = [];
    let consecutiveEmptyProbes = 0;
    for (let probe = 0; probe < DESCENDANT_INSPECTION_PROBES; probe += 1) {
      try {
        descendants = collectDescendants(pid, systemRoot);
      } catch {
        throw new Error('cannot inspect native build descendants');
      }
      if (descendants.length === 0) consecutiveEmptyProbes += 1;
      else consecutiveEmptyProbes = 0;
      if (consecutiveEmptyProbes >= DESCENDANT_INSPECTION_REQUIRED_EMPTY_PROBES) return;
      if (probe + 1 < DESCENDANT_INSPECTION_PROBES) {
        sleepSynchronously(DESCENDANT_INSPECTION_INTERVAL_MS);
      }
    }
    throw new Error(
      descendants.length > 0
        ? 'native build descendants remain after the parent exited'
        : 'native build descendant absence could not be verified',
    );
  }

  try {
    process.kill(-pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
    throw new Error('cannot inspect native build process group');
  }
  throw new Error('native build process group remains after the parent exited');
}

function sleepSynchronously(milliseconds: number): void {
  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function collectWindowsDescendantProcessIds(rootPid: number, systemRoot: string): number[] {
  const powershellPath = resolve(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  let output: string;
  try {
    output = execFileSync(powershellPath, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process | " +
        "ForEach-Object { '{0},{1}' -f $_.ProcessId,$_.ParentProcessId }",
    ], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: TOOL_VERSION_TIMEOUT_MS,
      maxBuffer: MAX_WINDOWS_PROCESS_TABLE_BYTES,
      env: minimalToolEnvironment(),
    });
  } catch {
    throw new Error('Windows process-table snapshot failed');
  }

  const childrenByParent = new Map<number, number[]>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^(\d+),(\d+)$/.exec(line.trim());
    if (!match) continue;
    const processId = Number(match[1]);
    const parentProcessId = Number(match[2]);
    if (!Number.isSafeInteger(processId) || processId <= 0) continue;
    if (!Number.isSafeInteger(parentProcessId) || parentProcessId <= 0) continue;
    const children = childrenByParent.get(parentProcessId) ?? [];
    children.push(processId);
    childrenByParent.set(parentProcessId, children);
  }

  const descendants: number[] = [];
  const seen = new Set<number>([rootPid]);
  const queue = [rootPid];
  while (queue.length > 0) {
    const parent = queue.shift()!;
    for (const childPid of childrenByParent.get(parent) ?? []) {
      if (seen.has(childPid)) continue;
      seen.add(childPid);
      descendants.push(childPid);
      queue.push(childPid);
    }
  }
  return descendants;
}

function terminateWindowsProcess(pid: number, systemRoot: string): boolean {
  try {
    execFileSync(resolve(systemRoot, 'System32', 'taskkill.exe'), [
      '/PID',
      String(pid),
      '/T',
      '/F',
    ], {
      windowsHide: true,
      timeout: TOOL_VERSION_TIMEOUT_MS,
      stdio: 'ignore',
      env: minimalToolEnvironment(),
    });
    return true;
  } catch {
    // A process may exit between the process-table snapshot and taskkill.
    return false;
  }
}

function minimalCargoEnvironment(input: {
  frontierSourcePath: string;
  rustcExecutablePath: string;
  rustTarget: string;
  buildTargetPath: string;
  cargoHomePath: string;
  offline: boolean;
}): NodeJS.ProcessEnv {
  const environment = minimalToolEnvironment();
  for (const key of ['USERPROFILE', 'HOME', 'TEMP', 'TMP']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  environment.CARGO_HOME = input.cargoHomePath;
  environment.RUSTC = input.rustcExecutablePath;
  environment.CARGO_TARGET_DIR = input.buildTargetPath;
  environment.CARGO_NET_GIT_FETCH_WITH_CLI = 'false';
  if (input.offline) environment.CARGO_NET_OFFLINE = 'true';
  environment.CARGO_INCREMENTAL = '0';
  environment.CARGO_PROFILE_DEV_INCREMENTAL = 'false';
  environment.CARGO_PROFILE_DEV_DEBUG = '0';
  environment.CARGO_PROFILE_DEV_CODEGEN_UNITS = '1';
  environment.RUSTC_WRAPPER = '';
  environment.RUSTC_WORKSPACE_WRAPPER = '';
  environment.CARGO_ENCODED_RUSTFLAGS = buildPinnedLocalNativeReproducibleRustFlags({
    frontierSourcePath: input.frontierSourcePath,
    buildTargetPath: input.buildTargetPath,
    rustcExecutablePath: input.rustcExecutablePath,
    rustTarget: input.rustTarget,
  }).join('\x1f');
  return environment;
}

interface PinnedLocalReproducibleRustPathInput {
  frontierSourcePath: string;
  buildTargetPath: string;
  rustcExecutablePath: string;
}

export function buildPinnedLocalNativeReproducibleRustFlags(
  input: PinnedLocalReproducibleRustPathInput & {
    rustTarget: string;
  },
): readonly string[] {
  const paths = resolvePinnedLocalReproducibleRustPaths(input);
  if (typeof input?.rustTarget !== 'string' || input.rustTarget.length === 0) {
    throw new Error('Rust target for reproducible Rust flags must be non-empty');
  }
  const flags = [
    `--remap-path-prefix=${paths.frontierSourcePath}=/e2s/frontier-source`,
    `--remap-path-prefix=${paths.buildTargetPath}=/e2s/build-target`,
    `--remap-path-prefix=${paths.rustToolchainRootPath}=/e2s/rust-toolchain`,
    '-Cdebuginfo=0',
    '-Ccodegen-units=1',
  ];
  if (input.rustTarget.endsWith('-pc-windows-msvc')) {
    flags.push('-Clink-arg=/Brepro');
  }
  return Object.freeze(flags);
}

export function buildPinnedLocalWasmPathRemapRustFlags(
  input: PinnedLocalReproducibleRustPathInput,
): readonly string[] {
  const paths = resolvePinnedLocalReproducibleRustPaths(input);
  const frontierSourcePath = spaceDelimitedRustFlagPath(
    paths.frontierSourcePath,
    'Frontier source',
  );
  const buildTargetPath = spaceDelimitedRustFlagPath(
    paths.buildTargetPath,
    'build target',
  );
  const rustToolchainRootPath = spaceDelimitedRustFlagPath(
    paths.rustToolchainRootPath,
    'Rust toolchain root',
  );
  return Object.freeze([
    `--remap-path-prefix=${frontierSourcePath}=/e2s/frontier-source`,
    `--remap-path-prefix=${buildTargetPath}=/e2s/build-target`,
    `--remap-path-prefix=${rustToolchainRootPath}=/e2s/rust-toolchain`,
  ]);
}

function resolvePinnedLocalReproducibleRustPaths(
  input: PinnedLocalReproducibleRustPathInput,
): Readonly<{
  frontierSourcePath: string;
  buildTargetPath: string;
  rustToolchainRootPath: string;
}> {
  const frontierSourcePath = resolve(requireAbsolutePath(
    input?.frontierSourcePath,
    'Frontier source path for reproducible Rust flags',
  ));
  const buildTargetPath = resolve(requireAbsolutePath(
    input?.buildTargetPath,
    'build target path for reproducible Rust flags',
  ));
  const rustcExecutablePath = resolve(requireAbsolutePath(
    input?.rustcExecutablePath,
    'Rust compiler path for reproducible Rust flags',
  ));
  const rustToolchainRootPath = resolve(dirname(rustcExecutablePath), '..');
  return Object.freeze({
    frontierSourcePath,
    buildTargetPath,
    rustToolchainRootPath,
  });
}

function spaceDelimitedRustFlagPath(value: string, label: string): string {
  if (/[\p{White_Space}\p{Cc}=]/u.test(value)) {
    throw new Error(
      `${label} path must not contain Unicode whitespace, control characters, or equals signs in space-delimited Rust flags`,
    );
  }
  return value;
}

function minimalToolEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return environment;
}

function createBuildTargetCleanup(
  buildTargetPath: string,
  temporaryDirectoryRoot: string,
): () => void {
  let cleaned = false;
  function cleanup(): void {
    if (cleaned) return;
    assertSafeBuildTargetPath(buildTargetPath, temporaryDirectoryRoot);
    rmSync(buildTargetPath, { recursive: true, force: true, maxRetries: 3 });
    cleaned = true;
    process.removeListener('exit', cleanup);
  }
  return cleanup;
}

function prepareIsolatedCargoHome(
  buildTargetPath: string,
  dependencyMode: 'shared-cache' | 'private-copy-offline',
  sharedCargoHomeRootInput: string | undefined = undefined,
): string {
  const cargoHomePath = resolve(buildTargetPath, 'cargo-home');
  mkdirSync(cargoHomePath);
  const homeRoot = process.env.USERPROFILE ?? process.env.HOME;
  const sharedCargoHomeValue = sharedCargoHomeRootInput
    ?? process.env.CARGO_HOME
    ?? (homeRoot ? join(homeRoot, '.cargo') : undefined);
  if (!sharedCargoHomeValue) {
    throw new Error('shared Cargo cache location is unavailable');
  }
  const sharedCargoHome = resolveRegularDirectory(
    sharedCargoHomeValue,
    'shared Cargo home',
  );
  for (const directory of ['registry', 'git']) {
    const source = resolve(sharedCargoHome, directory);
    if (!existsSync(source)) continue;
    const sourceStat = lstatSync(source);
    if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
      throw new Error('shared Cargo cache must be a regular directory');
    }
    const target = resolve(cargoHomePath, directory);
    if (dependencyMode === 'private-copy-offline') {
      copyRegularDirectoryTree(realpathSync(source), target);
    } else {
      symlinkDirectory(realpathSync(source), target);
    }
  }
  return cargoHomePath;
}

function symlinkDirectory(source: string, target: string): void {
  symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
}

function copyRegularDirectoryTree(source: string, target: string): void {
  const sourceStat = lstatSync(source);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
    throw new Error('Cargo cache copy source must be a regular directory');
  }
  mkdirSync(target);
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourceEntry = resolve(source, entry.name);
    const targetEntry = resolve(target, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error('Cargo cache copy rejects symbolic links and junctions');
    }
    if (entry.isDirectory()) copyRegularDirectoryTree(sourceEntry, targetEntry);
    else if (entry.isFile()) {
      copyFileSync(sourceEntry, targetEntry, fsConstants.COPYFILE_EXCL);
    }
    else throw new Error('Cargo cache copy contains a non-file entry');
  }
}

function resolveBuildTargetRoot(rootPathInput: string): string {
  return resolveRegularDirectory(
    rootPathInput,
    'isolated build temporary root',
  );
}

function resolveRegularDirectory(
  directoryPathInput: string,
  label: string,
): string {
  const rootPath = realpathSync(requireAbsolutePath(
    directoryPathInput,
    label,
  ));
  const stat = lstatSync(rootPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular directory`);
  }
  return rootPath;
}

function assertSafeBuildTargetPath(
  targetPath: string,
  temporaryDirectoryRoot: string,
): void {
  const normalizedTemp = resolveBuildTargetRoot(temporaryDirectoryRoot);
  const normalizedTarget = resolve(targetPath);
  const expectedPrefix = `${normalizedTemp}${normalizedTemp.endsWith(sep) ? '' : sep}${BUILD_TARGET_PREFIX}`;
  if (
    process.platform === 'win32'
      ? !normalizedTarget.toLowerCase().startsWith(expectedPrefix.toLowerCase())
      : !normalizedTarget.startsWith(expectedPrefix)
  ) {
    throw new Error('isolated native build target is outside the guarded temporary prefix');
  }
}

function verifiedNewBuildOutput(path: string, buildTargetPath: string): string {
  const resolvedPath = realpathSync(path);
  const resolvedTarget = realpathSync(buildTargetPath);
  if (!isDescendantPath(resolvedPath, resolvedTarget)) {
    throw new Error('pinned local native verifier build output escapes the isolated target');
  }
  const stat = lstatSync(resolvedPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('pinned local native verifier build output must be a regular file');
  }
  return resolvedPath;
}

function verifiedRegularFile(path: string): string {
  const resolvedPath = realpathSync(path);
  const stat = lstatSync(resolvedPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('pinned local native verifier tool must be a regular file');
  }
  return resolvedPath;
}

function requireAbsolutePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || !isAbsolute(value)) {
    throw new Error(`${label} must be a non-empty absolute path`);
  }
  return value;
}

function isDescendantPath(path: string, parent: string): boolean {
  const prefix = `${parent}${parent.endsWith(sep) ? '' : sep}`;
  return process.platform === 'win32'
    ? path.toLowerCase().startsWith(prefix.toLowerCase())
    : path.startsWith(prefix);
}

function parseJsonObject(path: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const record = asRecord(parsed);
  if (!record) throw new Error('pinned lock must contain a JSON object');
  return record;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function validateTool(
  errors: string[],
  expectedValue: unknown,
  observed: { version: string; sha256: string },
  label: string,
): void {
  const expected = asRecord(expectedValue);
  if (!expected) {
    errors.push(`${label} toolchain lock entry must be an object`);
    return;
  }
  requireExact(errors, expected.version, observed.version, `${label} version mismatch`);
  requireExact(
    errors,
    typeof expected.sha256 === 'string' ? expected.sha256.toLowerCase() : expected.sha256,
    observed.sha256.toLowerCase(),
    `${label} executable digest mismatch`,
  );
}

function requireExact(
  errors: string[],
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  if (actual !== expected) errors.push(message);
}

function fileSha256Hex(path: string): string {
  return `0x${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}
