import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveBridgeRepositoryLayout } from './bridge-repository-layout.js';
import {
  inspectConsensusSourceBaseline,
  type ConsensusSourceBaselineReport,
} from './consensus-source-baseline.js';
import {
  decodePegInSourceIntentV2Hex,
  derivePegInSourceIntentIdV2Hex,
  encodePegInSourceIntentV2Hex,
} from './peg-in-causal-admission-v2.js';
import {
  createPinnedLocalNativeBuildWorkspace,
  EXPECTED_NATIVE_VERIFIER_TOOLCHAIN_LOCK_SHA256,
  runBoundedProcess,
} from './pinned-local-native-verifier-build.js';
import {
  assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1ConsumerConstruction,
  consumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1,
  type SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceReceiptV1,
} from './substrate-federated-isolated-devnet-frontier-peg-out-application-evidence-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_V4_HEX,
} from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1-fixture.js';
import {
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_PROFILE_ID_V1_HEX,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_PROFILE_SCALE_V1_HEX,
} from './substrate-federated-pooled-reserve-source-proof-profile-v1-fixture.js';
import { sha256CanonicalJson } from './strict-json.js';
import {
  decodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex,
  encodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_RUNNER_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-frontier-peg-out-application-runner.v1' as const;

const RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_RUNNER_V1';
const CARGO_TEST_NAME =
  'bridge_federated_lab_reservation_tests::federated_lab_application_burn_produces_exact_commitment_and_conserves_supply' as const;
const CANONICAL_FRONTIER_PATCH_SHA256 =
  '47fdb34df23ebd5aad7d64885d030f67b3ae1aa25d1990bccc010903039a8813';
const APPLICATION_OVERLAY_PATCH_SHA256 =
  'b275a0e44306e465e61369d80763945e3e8a0cdf96fac2efcc7914f77eb53bb5';
const OVERLAY_APPLIED_SOURCE_LF_SHA256 =
  '1372b856b91b6c017e27e6ebf96ae95d658d3de041768ca3a90a9a2567ac4a53';
const PATCH_GIT_VERSION = 'git version 2.55.0.windows.3';
const PATCH_GIT_SHA256 =
  '7b7971dd13f0c3a284e538601f2f9770b3a87dfaccb5fb52d68141c67ed22364';
const EXPECTED_OWNER_ADDRESS =
  '0xf24ff3a9cf04c71dbc94d0b566f7a27b94566cac';
const EXPECTED_MINT_AMOUNT_NANO_ERG = '15000000';
const MAX_RUNNER_RUNTIME_MS = 45 * 60_000;
const POST_CARGO_REVALIDATION_BUDGET_MS = 90_000;
const RECEIPTS = new WeakSet<object>();
const ACTIVE_SOURCE_DIRECTORIES = new Set<string>();

export interface RunSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1Input {
  readonly frontierSourceDirectory: string;
  readonly temporaryDirectoryRoot: string;
  readonly cargoDependencyCacheDirectory: string;
  readonly cargoExecutablePath: string;
  readonly rustcExecutablePath: string;
  readonly gitExecutablePath: string;
  readonly offline: true;
}

export interface SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_RUNNER_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'same_process_application_burn_executed';
  readonly applicationEvidence:
    Readonly<SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceReceiptV1>;
  readonly source: Readonly<{
    readonly baselineReportDigestHex: string;
    readonly canonicalFrontierPatchSha256: string;
    readonly applicationOverlayPatchSha256: string;
    readonly overlayAppliedSourceLfSha256: string;
  }>;
  readonly tools: Readonly<{
    readonly toolchainDigestHex: string;
    readonly nativeToolchainLockSha256: string;
    readonly cargoSha256: string;
    readonly rustcSha256: string;
    readonly patchGitSha256: string;
  }>;
  readonly execution: Readonly<{
    readonly cargoTestName: typeof CARGO_TEST_NAME;
    readonly executionInputDigestHex: string;
    readonly stdoutSha256Hex: string;
    readonly stderrSha256Hex: string;
  }>;
  readonly checks: Readonly<{
    readonly exactSourceBaselineRevalidatedBeforeAndAfter: true;
    readonly exactToolchainRevalidatedBeforeAndAfter: true;
    readonly exactCanonicalAndOverlayPatchBytesBound: true;
    readonly overlayAppliedOnlyForBoundedExecution: true;
    readonly overlaySourceBytesVerifiedBeforeCargo: true;
    readonly exactNamedCargoTestPassedOnce: true;
    readonly sameProcessCargoExecutionProvenanceEstablished: true;
    readonly pureApplicationEvidenceConsumedInSameProcess: true;
    readonly sourceNativeBlockToExecutionLookupBoundByExactSource: true;
    readonly freshRunnerOwnedCargoTargetUsed: true;
    readonly configurationIsolatedCargoHomeUsed: true;
    readonly cargoProcessTreeContainedBeforeCleanup: true;
    readonly offlineCargoUsed: true;
  }>;
  readonly boundary: Readonly<{
    readonly isolatedTestClientOnly: true;
    readonly deterministicSyntheticAccountOnly: true;
    readonly taskOwnedScratchSourceRequired: true;
    readonly callerSuppliedStdoutAccepted: false;
    readonly completeBuildToolClosureVerified: false;
    readonly dependencyCacheContentAttested: false;
    readonly sourceConsensusEstablished: false;
    readonly sidechainFinalityEstablished: false;
    readonly ergoAnchorEstablished: false;
    readonly trackerAdmissionEstablished: false;
    readonly globalReplayInsertionEstablished: false;
    readonly payoutAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly limitations: readonly string[];
  readonly receiptDigestHex: string;
}

export function preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1(
  input: Readonly<
    RunSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1Input
  >,
): Readonly<
  RunSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1Input
> {
  const record = exactRecord(input, [
    'cargoExecutablePath',
    'cargoDependencyCacheDirectory',
    'frontierSourceDirectory',
    'gitExecutablePath',
    'offline',
    'rustcExecutablePath',
    'temporaryDirectoryRoot',
  ], 'Frontier peg-out application runner input');
  if (record.offline !== true) {
    throw new Error('Frontier peg-out application runner requires offline Cargo');
  }
  const bridgeRoot = resolveBridgeRoot();
  const repositoryRoot = resolveRepositoryRoot(bridgeRoot);
  const temporaryDirectoryRoot = requireDirectory(
    record.temporaryDirectoryRoot,
    'runner temporary directory root',
  );
  if (isSameOrDescendant(temporaryDirectoryRoot, repositoryRoot)) {
    throw new Error(
      'Frontier peg-out application runner requires an external temporary root',
    );
  }
  const frontierSourceDirectory = requireDirectory(
    record.frontierSourceDirectory,
    'task-owned Frontier scratch source',
  );
  if (isSameOrDescendant(frontierSourceDirectory, repositoryRoot)) {
    throw new Error(
      'Frontier peg-out application runner refuses to mutate the bridge worktree',
    );
  }
  if (!isStrictDescendant(frontierSourceDirectory, temporaryDirectoryRoot)) {
    throw new Error(
      'Frontier peg-out application runner source must be inside its external temporary root',
    );
  }
  const cargoDependencyCacheDirectory = requireDirectory(
    record.cargoDependencyCacheDirectory,
    'runner Cargo dependency cache',
  );
  if (isSameOrDescendant(cargoDependencyCacheDirectory, repositoryRoot)) {
    throw new Error(
      'Frontier peg-out application runner requires an external Cargo dependency cache',
    );
  }
  return Object.freeze({
    frontierSourceDirectory,
    cargoDependencyCacheDirectory,
    temporaryDirectoryRoot,
    cargoExecutablePath: requireRegularFile(
      record.cargoExecutablePath,
      'Cargo executable',
    ),
    rustcExecutablePath: requireRegularFile(
      record.rustcExecutablePath,
      'Rust compiler executable',
    ),
    gitExecutablePath: requireRegularFile(
      record.gitExecutablePath,
      'Git executable',
    ),
    offline: true,
  });
}

export async function runSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1(
  input: Readonly<
    RunSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1Input
  >,
  completionDeadline: number | undefined = undefined,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1
>> {
  const deadline = requireCompletionDeadline(completionDeadline);
  const plan =
    preflightSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1(
      input,
    );
  const sourceIdentity = pathIdentity(plan.frontierSourceDirectory);
  if (ACTIVE_SOURCE_DIRECTORIES.has(sourceIdentity)) {
    throw new Error('Frontier peg-out application runner source is already active');
  }
  ACTIVE_SOURCE_DIRECTORIES.add(sourceIdentity);
  try {
    return await executeRunner(plan, deadline);
  } finally {
    ACTIVE_SOURCE_DIRECTORIES.delete(sourceIdentity);
  }
}

export function assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1
> {
  if (value === null || typeof value !== 'object' || !RECEIPTS.has(value)) {
    throw new Error(
      'Frontier peg-out application runner receipt lacks process provenance',
    );
  }
  const receipt = value as Readonly<
    SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1
  >;
  assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1ConsumerConstruction(
    receipt.applicationEvidence,
  );
  const { receiptDigestHex, ...body } = receipt;
  if (sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN) !== receiptDigestHex) {
    throw new Error('Frontier peg-out application runner receipt changed');
  }
}

async function executeRunner(
  input: Readonly<
    RunSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerV1Input
  >,
  completionDeadline: number,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetFrontierPegOutApplicationRunnerReceiptV1
>> {
  const bridgeRoot = resolveBridgeRoot();
  const repositoryRoot = resolveRepositoryRoot(bridgeRoot);
  const canonicalPatchPath = requireRegularFile(
    path.join(
      bridgeRoot,
      'sources',
      'frontier',
      '0001-bridge-runtime-commitment.patch',
    ),
    'canonical Frontier patch',
  );
  const overlayPatchPath = requireRegularFile(
    path.join(
      bridgeRoot,
      'sources',
      'frontier',
      '0002-federated-lab-peg-out-application-proof.patch',
    ),
    'Frontier peg-out application overlay',
  );
  const canonicalFrontierPatchBytes = readFileSync(canonicalPatchPath);
  const applicationEvidenceOverlayPatchBytes = readFileSync(overlayPatchPath);
  if (
    sha256Bytes(canonicalFrontierPatchBytes) !== CANONICAL_FRONTIER_PATCH_SHA256
    || sha256Bytes(applicationEvidenceOverlayPatchBytes)
      !== APPLICATION_OVERLAY_PATCH_SHA256
  ) {
    throw new Error('Frontier peg-out application runner patch bytes changed');
  }
  const overlaySourcePath = requireRegularFile(
    path.join(
      input.frontierSourceDirectory,
      'template',
      'node',
      'src',
      'bridge_federated_lab_reservation_tests.rs',
    ),
    'Frontier source before application overlay',
  );
  const originalOverlaySourceBytes = readFileSync(overlaySourcePath);

  const toolsBefore = inspectTools({
    bridgeRoot,
    cargoExecutablePath: input.cargoExecutablePath,
    frontierSourceDirectory: input.frontierSourceDirectory,
    gitExecutablePath: input.gitExecutablePath,
    rustcExecutablePath: input.rustcExecutablePath,
  });
  const toolchainDigestHex = sha256CanonicalJson(
    toolsBefore,
    `${RECEIPT_DIGEST_DOMAIN}_TOOLCHAIN`,
  );
  const baselineBefore = inspectSourceBaseline({
    bridgeRoot,
    frontierSourceDirectory: input.frontierSourceDirectory,
    gitExecutablePath: input.gitExecutablePath,
    repositoryRoot,
  });
  const baselineReportDigestHex = sha256CanonicalJson(
    baselineBefore,
    `${RECEIPT_DIGEST_DOMAIN}_SOURCE_BASELINE`,
  );
  assertDeadline(completionDeadline, 'source and tool preflight');

  const authorityEnvironment =
    buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationAuthorityEnvironmentV1();
  const cargoArguments = [
    'test',
    '-p',
    'frontier-template-node',
    '--no-default-features',
    '--features',
    'bridge-federated-v4-lab-node',
    '--offline',
    '--locked',
    CARGO_TEST_NAME,
    '--',
    '--exact',
    '--nocapture',
  ] as const;
  const executionInputDigestHex = sha256CanonicalJson({
    authorityEnvironment,
    baselineReportDigestHex,
    cargoArguments,
    canonicalFrontierPatchSha256: CANONICAL_FRONTIER_PATCH_SHA256,
    applicationOverlayPatchSha256: APPLICATION_OVERLAY_PATCH_SHA256,
    toolchainDigestHex,
  }, RECEIPT_DIGEST_DOMAIN);

  await runExactGitApply({
    args: ['apply', '--check', '--whitespace=nowarn', overlayPatchPath],
    gitExecutablePath: input.gitExecutablePath,
    sourceDirectory: input.frontierSourceDirectory,
    temporaryDirectoryRoot: input.temporaryDirectoryRoot,
    label: 'Frontier peg-out overlay preflight',
  });

  let stdout = '';
  let stderr = '';
  let overlayApplicationAttempted = false;
  try {
    overlayApplicationAttempted = true;
    await runExactGitApply({
      args: ['apply', '--whitespace=nowarn', overlayPatchPath],
      gitExecutablePath: input.gitExecutablePath,
      sourceDirectory: input.frontierSourceDirectory,
      temporaryDirectoryRoot: input.temporaryDirectoryRoot,
      label: 'Frontier peg-out overlay application',
    });
    if (sha256LfNormalized(readFileSync(overlaySourcePath))
      !== OVERLAY_APPLIED_SOURCE_LF_SHA256) {
      throw new Error('overlay-applied Frontier source bytes changed');
    }

    const workspace = createPinnedLocalNativeBuildWorkspace(undefined, {
      sharedCargoHomeRoot: input.cargoDependencyCacheDirectory,
      temporaryDirectoryRoot: input.temporaryDirectoryRoot,
    });
    try {
      assertCargoConfigurationIsolated(
        input.frontierSourceDirectory,
        workspace.cargoHomePath,
      );
      const result = await runBoundedProcess({
        executablePath: input.cargoExecutablePath,
        args: [...cargoArguments],
        cwd: input.frontierSourceDirectory,
        env: buildCargoEnvironment({
          authorityEnvironment,
          cargoExecutablePath: input.cargoExecutablePath,
          cargoHomeDirectory: workspace.cargoHomePath,
          cargoTargetDirectory: workspace.buildTargetPath,
          frontierSourceDirectory: input.frontierSourceDirectory,
          rustcExecutablePath: input.rustcExecutablePath,
          temporaryDirectoryRoot: input.temporaryDirectoryRoot,
        }),
        timeoutMs: remainingCargoBudgetMs(completionDeadline),
        maxOutputBytes: 32 * 1024 * 1024,
        maxStdoutBytes: 16 * 1024 * 1024,
        maxStderrBytes: 16 * 1024 * 1024,
        label: 'Frontier peg-out application Cargo runner',
      });
      stdout = result.stdout;
      stderr = result.stderr;
      assertExactCargoTestPassed(stdout, stderr);
    } finally {
      workspace.cleanup();
    }
  } finally {
    if (overlayApplicationAttempted) {
      await restoreExactSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationSourceV1({
        sourcePath: overlaySourcePath,
        originalSourceBytes: originalOverlaySourceBytes,
        expectedAppliedSourceLfSha256: OVERLAY_APPLIED_SOURCE_LF_SHA256,
        reverseOverlay: async () => {
          await runExactGitApply({
            args: [
              'apply',
              '--reverse',
              '--check',
              '--whitespace=nowarn',
              overlayPatchPath,
            ],
            gitExecutablePath: input.gitExecutablePath,
            sourceDirectory: input.frontierSourceDirectory,
            temporaryDirectoryRoot: input.temporaryDirectoryRoot,
            label: 'Frontier peg-out overlay reversal preflight',
          });
          await runExactGitApply({
            args: [
              'apply',
              '--reverse',
              '--whitespace=nowarn',
              overlayPatchPath,
            ],
            gitExecutablePath: input.gitExecutablePath,
            sourceDirectory: input.frontierSourceDirectory,
            temporaryDirectoryRoot: input.temporaryDirectoryRoot,
            label: 'Frontier peg-out overlay reversal',
          });
        },
      });
    }
  }
  assertDeadline(completionDeadline, 'overlay reversal and Cargo cleanup');

  const toolsAfter = inspectTools({
    bridgeRoot,
    cargoExecutablePath: input.cargoExecutablePath,
    frontierSourceDirectory: input.frontierSourceDirectory,
    gitExecutablePath: input.gitExecutablePath,
    rustcExecutablePath: input.rustcExecutablePath,
  });
  if (sha256CanonicalJson(
    toolsAfter,
    `${RECEIPT_DIGEST_DOMAIN}_TOOLCHAIN`,
  ) !== toolchainDigestHex) {
    throw new Error('Frontier peg-out application runner tools changed');
  }
  const baselineAfter = inspectSourceBaseline({
    bridgeRoot,
    frontierSourceDirectory: input.frontierSourceDirectory,
    gitExecutablePath: input.gitExecutablePath,
    repositoryRoot,
  });
  if (sha256CanonicalJson(
    baselineAfter,
    `${RECEIPT_DIGEST_DOMAIN}_SOURCE_BASELINE`,
  ) !== baselineReportDigestHex) {
    throw new Error('Frontier peg-out application runner source changed');
  }

  const applicationEvidence =
    consumeSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1({
      stdout,
      canonicalFrontierPatchBytes,
      applicationEvidenceOverlayPatchBytes,
    });
  assertSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationEvidenceV1ConsumerConstruction(
    applicationEvidence,
  );
  const body = deepFreeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_PEG_OUT_APPLICATION_RUNNER_V1_SCHEMA,
    version: 1 as const,
    status: 'same_process_application_burn_executed' as const,
    applicationEvidence,
    source: {
      baselineReportDigestHex,
      canonicalFrontierPatchSha256: CANONICAL_FRONTIER_PATCH_SHA256,
      applicationOverlayPatchSha256: APPLICATION_OVERLAY_PATCH_SHA256,
      overlayAppliedSourceLfSha256: OVERLAY_APPLIED_SOURCE_LF_SHA256,
    },
    tools: {
      toolchainDigestHex,
      nativeToolchainLockSha256: toolsBefore.nativeToolchainLockSha256,
      cargoSha256: toolsBefore.cargo.sha256,
      rustcSha256: toolsBefore.rustc.sha256,
      patchGitSha256: toolsBefore.git.sha256,
    },
    execution: {
      cargoTestName: CARGO_TEST_NAME,
      executionInputDigestHex,
      stdoutSha256Hex: sha256Text(stdout),
      stderrSha256Hex: sha256Text(stderr),
    },
    checks: {
      exactSourceBaselineRevalidatedBeforeAndAfter: true as const,
      exactToolchainRevalidatedBeforeAndAfter: true as const,
      exactCanonicalAndOverlayPatchBytesBound: true as const,
      overlayAppliedOnlyForBoundedExecution: true as const,
      overlaySourceBytesVerifiedBeforeCargo: true as const,
      exactNamedCargoTestPassedOnce: true as const,
      sameProcessCargoExecutionProvenanceEstablished: true as const,
      pureApplicationEvidenceConsumedInSameProcess: true as const,
      sourceNativeBlockToExecutionLookupBoundByExactSource: true as const,
      freshRunnerOwnedCargoTargetUsed: true as const,
      configurationIsolatedCargoHomeUsed: true as const,
      cargoProcessTreeContainedBeforeCleanup: true as const,
      offlineCargoUsed: true as const,
    },
    boundary: {
      isolatedTestClientOnly: true as const,
      deterministicSyntheticAccountOnly: true as const,
      taskOwnedScratchSourceRequired: true as const,
      callerSuppliedStdoutAccepted: false as const,
      completeBuildToolClosureVerified: false as const,
      dependencyCacheContentAttested: false as const,
      sourceConsensusEstablished: false as const,
      sidechainFinalityEstablished: false as const,
      ergoAnchorEstablished: false as const,
      trackerAdmissionEstablished: false as const,
      globalReplayInsertionEstablished: false as const,
      payoutAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
    limitations: [
      'The result is one source-locked in-memory Frontier TestClient execution with deterministic synthetic custody.',
      'The overlay is applied only to an external task-owned scratch checkout and is removed before the receipt is returned.',
      'The complete compiler, linker, operating-system and shared dependency-cache closure is not independently attested.',
      'Source consensus, sidechain finality, Ergo anchoring, tracker admission, global replay insertion and payout remain separate joins.',
      'No signing, submission, broadcast, funds authority, Gate 5 closure, trustless status or production readiness follows.',
    ] as const,
  });
  const receipt = deepFreeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN),
  });
  RECEIPTS.add(receipt);
  return receipt;
}

export function buildSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationAuthorityEnvironmentV1(): Readonly<
  Record<string, string>
> {
  const reference =
    decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_V4_HEX,
    );
  const sourceIntent = decodePegInSourceIntentV2Hex(reference.sourceIntentHex);
  const applicationSourceIntent = Object.freeze({
    ...sourceIntent,
    amountNanoErg: EXPECTED_MINT_AMOUNT_NANO_ERG,
    recipientAddressHex: EXPECTED_OWNER_ADDRESS,
  });
  const statementHex =
    encodeValidityApplicationPooledReserveMintReservationStatementV4Hex({
      ...reference,
      sourceIntentHex: encodePegInSourceIntentV2Hex(applicationSourceIntent),
      sourceIntentIdHex: derivePegInSourceIntentIdV2Hex(applicationSourceIntent),
      successorReserveLiabilityNanoErg: EXPECTED_MINT_AMOUNT_NANO_ERG,
    });
  const statement =
    decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      statementHex,
    );
  return deepFreeze({
    BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_SCALE_HEX:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_PROFILE_SCALE_V1_HEX,
    BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_ID_HEX:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_PROFILE_ID_V1_HEX,
    BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_V4_HEX: statementHex,
    BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_ID_V4_HEX:
      deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
        statement,
      ),
    BRIDGE_LAB_FEDERATED_MINT_IDENTITY_V4_HEX: statement.mintIdentityHex,
  });
}

function inspectSourceBaseline(input: Readonly<{
  bridgeRoot: string;
  frontierSourceDirectory: string;
  gitExecutablePath: string;
  repositoryRoot: string;
}>): Readonly<ConsensusSourceBaselineReport> {
  const report = inspectConsensusSourceBaseline({
    worktreeRoot: input.repositoryRoot,
    bridgeRoot: input.bridgeRoot,
    frontierSourcePath: input.frontierSourceDirectory,
    requireFrontierCheckout: true,
    requireErgoCheckout: false,
    gitExecutablePath: input.gitExecutablePath,
  });
  if (
    report.status !== 'PASS'
    || report.errors.length !== 0
    || !report.checks.lockBindingsValidated
    || !report.checks.solidityBuildClosureArtifactsValidated
    || !report.checks.frontierCheckoutValidated
    || report.sourceIdentity.frontierCommit === null
    || report.sourceIdentity.frontierPatchSha256
      !== CANONICAL_FRONTIER_PATCH_SHA256
  ) {
    throw new Error(
      'Frontier scratch source differs from the exact canonical patched baseline',
    );
  }
  return deepFreeze(report);
}

function inspectTools(input: Readonly<{
  bridgeRoot: string;
  cargoExecutablePath: string;
  frontierSourceDirectory: string;
  gitExecutablePath: string;
  rustcExecutablePath: string;
}>): Readonly<{
  nativeToolchainLockSha256: string;
  cargo: Readonly<{ version: string; sha256: string }>;
  rustc: Readonly<{ version: string; sha256: string }>;
  git: Readonly<{ version: string; sha256: string }>;
  cargoLockSha256: string;
  rustToolchainSha256: string;
}> {
  const lockPath = requireRegularFile(
    path.join(input.bridgeRoot, 'sources', 'native-verifier-toolchain-lock.json'),
    'native verifier toolchain lock',
  );
  const lockBytes = readFileSync(lockPath);
  const nativeToolchainLockSha256 = sha256Bytes(lockBytes);
  if (nativeToolchainLockSha256
    !== EXPECTED_NATIVE_VERIFIER_TOOLCHAIN_LOCK_SHA256) {
    throw new Error('native verifier toolchain lock changed');
  }
  const lock = exactObject(JSON.parse(lockBytes.toString('utf8')), 'toolchain lock');
  const profiles = exactObject(lock.profiles, 'toolchain profiles');
  const profile = exactObject(
    profiles[`${process.platform}-${process.arch}`],
    'toolchain platform profile',
  );
  const cargoProfile = exactObject(profile.cargo, 'Cargo toolchain profile');
  const rustcProfile = exactObject(profile.rustc, 'Rust toolchain profile');
  const cargo = inspectExactTool(
    input.cargoExecutablePath,
    input.frontierSourceDirectory,
    cargoProfile.version,
    cargoProfile.sha256,
    'Cargo',
  );
  const rustc = inspectExactTool(
    input.rustcExecutablePath,
    input.frontierSourceDirectory,
    rustcProfile.version,
    rustcProfile.sha256,
    'Rust compiler',
  );
  const git = inspectExactTool(
    input.gitExecutablePath,
    input.frontierSourceDirectory,
    PATCH_GIT_VERSION,
    PATCH_GIT_SHA256,
    'patch Git',
  );
  return deepFreeze({
    nativeToolchainLockSha256,
    cargo,
    rustc,
    git,
    cargoLockSha256: sha256Bytes(readFileSync(requireRegularFile(
      path.join(input.frontierSourceDirectory, 'Cargo.lock'),
      'Frontier Cargo lock',
    ))),
    rustToolchainSha256: sha256Bytes(readFileSync(requireRegularFile(
      path.join(input.frontierSourceDirectory, 'rust-toolchain.toml'),
      'Frontier Rust toolchain declaration',
    ))),
  });
}

function inspectExactTool(
  executablePath: string,
  cwd: string,
  expectedVersion: unknown,
  expectedSha256: unknown,
  label: string,
): Readonly<{ version: string; sha256: string }> {
  if (
    typeof expectedVersion !== 'string'
    || typeof expectedSha256 !== 'string'
    || !/^[0-9a-f]{64}$/u.test(expectedSha256)
  ) {
    throw new Error(`${label} pin is invalid`);
  }
  const sha256 = sha256Bytes(readFileSync(executablePath));
  if (sha256 !== expectedSha256) {
    throw new Error(`${label} executable SHA-256 changed`);
  }
  const result = spawnSync(executablePath, ['--version'], {
    cwd,
    encoding: 'utf8',
    env: minimalToolEnvironment(),
    maxBuffer: 4096,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  const version = (result.stdout ?? '').trim();
  if (
    result.status !== 0
    || result.signal !== null
    || (result.stderr ?? '').trim() !== ''
    || version !== expectedVersion
  ) {
    throw new Error(`${label} differs from its exact runner pin`);
  }
  return Object.freeze({ version, sha256 });
}

export async function restoreExactSubstrateFederatedIsolatedDevnetFrontierPegOutApplicationSourceV1(
  input: Readonly<{
    sourcePath: string;
    originalSourceBytes: Uint8Array;
    expectedAppliedSourceLfSha256: string;
    reverseOverlay: () => Promise<void>;
  }>,
): Promise<'already_clean' | 'reversed' | 'snapshot_fallback'> {
  const sourcePath = requireRegularFile(input.sourcePath, 'overlay source');
  if (
    !(input.originalSourceBytes instanceof Uint8Array)
    || input.originalSourceBytes.byteLength === 0
    || !/^[0-9a-f]{64}$/u.test(input.expectedAppliedSourceLfSha256)
    || typeof input.reverseOverlay !== 'function'
  ) {
    throw new Error('overlay restoration input is invalid');
  }
  const originalSourceBytes = Buffer.from(input.originalSourceBytes);
  const originalSourceSha256 = sha256Bytes(originalSourceBytes);
  const before = readFileSync(sourcePath);
  if (sha256Bytes(before) === originalSourceSha256) return 'already_clean';
  if (sha256LfNormalized(before) !== input.expectedAppliedSourceLfSha256) {
    throw new Error('overlay source has unexpected bytes before restoration');
  }

  let reverseError: unknown;
  try {
    await input.reverseOverlay();
  } catch (error) {
    reverseError = error;
  }
  const afterReverse = readFileSync(sourcePath);
  if (sha256Bytes(afterReverse) === originalSourceSha256) return 'reversed';
  if (
    sha256LfNormalized(afterReverse)
    !== input.expectedAppliedSourceLfSha256
  ) {
    throw new Error(
      'overlay source has unexpected bytes after reversal',
      reverseError === undefined ? undefined : { cause: reverseError },
    );
  }

  writeFileSync(sourcePath, originalSourceBytes);
  if (sha256Bytes(readFileSync(sourcePath)) !== originalSourceSha256) {
    throw new Error(
      'overlay source snapshot restoration failed',
      reverseError === undefined ? undefined : { cause: reverseError },
    );
  }
  return 'snapshot_fallback';
}

async function runExactGitApply(input: Readonly<{
  args: readonly string[];
  gitExecutablePath: string;
  sourceDirectory: string;
  temporaryDirectoryRoot: string;
  label: string;
}>): Promise<void> {
  const result = await runBoundedProcess({
    executablePath: input.gitExecutablePath,
    args: [...input.args],
    cwd: input.sourceDirectory,
    env: minimalToolEnvironment(input.temporaryDirectoryRoot),
    timeoutMs: 30_000,
    maxOutputBytes: 1024 * 1024,
    maxStdoutBytes: 512 * 1024,
    maxStderrBytes: 512 * 1024,
    label: input.label,
  });
  if (result.stdout.trim() !== '' || result.stderr.trim() !== '') {
    throw new Error(`${input.label} emitted unexpected output`);
  }
}

function buildCargoEnvironment(input: Readonly<{
  authorityEnvironment: Readonly<Record<string, string>>;
  cargoExecutablePath: string;
  cargoHomeDirectory: string;
  cargoTargetDirectory: string;
  frontierSourceDirectory: string;
  rustcExecutablePath: string;
  temporaryDirectoryRoot: string;
}>): NodeJS.ProcessEnv {
  if (path.dirname(input.cargoExecutablePath)
    !== path.dirname(input.rustcExecutablePath)) {
    throw new Error('Cargo and Rust compiler must share one toolchain directory');
  }
  const environment = minimalToolEnvironment(input.temporaryDirectoryRoot);
  const inheritedPath = process.env.Path ?? process.env.PATH ?? '';
  delete environment.PATH;
  delete environment.Path;
  environment[process.platform === 'win32' ? 'Path' : 'PATH'] = [
    path.dirname(input.cargoExecutablePath),
    inheritedPath,
  ].filter(Boolean).join(path.delimiter);
  if (process.platform === 'win32') {
    for (const key of ['LIB', 'LIBPATH', 'INCLUDE']) {
      if (process.env[key]) environment[key] = process.env[key];
    }
  }
  environment.CARGO_HOME = input.cargoHomeDirectory;
  environment.CARGO_TARGET_DIR = input.cargoTargetDirectory;
  environment.WASM_BUILD_WORKSPACE_HINT = input.frontierSourceDirectory;
  environment.CARGO_NET_OFFLINE = 'true';
  environment.CARGO_NET_GIT_FETCH_WITH_CLI = 'false';
  environment.CARGO_INCREMENTAL = '0';
  environment.CARGO_PROFILE_DEV_INCREMENTAL = 'false';
  environment.CARGO_PROFILE_DEV_DEBUG = '0';
  environment.CARGO_PROFILE_DEV_CODEGEN_UNITS = '1';
  environment.RUSTC = input.rustcExecutablePath;
  environment.RUSTC_WRAPPER = '';
  environment.RUSTC_WORKSPACE_WRAPPER = '';
  for (const [key, value] of Object.entries(input.authorityEnvironment)) {
    environment[key] = value;
  }
  return environment;
}

function minimalToolEnvironment(
  temporaryDirectoryRoot: string | undefined = undefined,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'SystemDrive']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  if (temporaryDirectoryRoot !== undefined) {
    environment.TEMP = temporaryDirectoryRoot;
    environment.TMP = temporaryDirectoryRoot;
  }
  return environment;
}

function assertCargoConfigurationIsolated(
  frontierSourceDirectory: string,
  cargoHomeDirectory: string,
): void {
  const candidates = [
    path.join(cargoHomeDirectory, 'config'),
    path.join(cargoHomeDirectory, 'config.toml'),
  ];
  let current = frontierSourceDirectory;
  while (true) {
    candidates.push(
      path.join(current, '.cargo', 'config'),
      path.join(current, '.cargo', 'config.toml'),
    );
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      throw new Error('Cargo configuration must be absent from the runner boundary');
    }
  }
}

function assertExactCargoTestPassed(stdout: string, stderr: string): void {
  const output = `${stdout}\n${stderr}`.replaceAll('\r\n', '\n');
  const escaped = CARGO_TEST_NAME.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const passes = output.match(
    new RegExp(`^test ${escaped} \\.\\.\\. ok$`, 'gmu'),
  ) ?? [];
  if (passes.length !== 1) {
    throw new Error('Frontier peg-out runner did not pass the exact named test');
  }
  let passed = 0;
  let failed = 0;
  let summaries = 0;
  for (const match of output.matchAll(
    /^test result: (?:ok|FAILED)\. ([0-9]+) passed; ([0-9]+) failed;/gmu,
  )) {
    summaries += 1;
    passed += Number(match[1]);
    failed += Number(match[2]);
  }
  if (summaries === 0 || passed !== 1 || failed !== 0) {
    throw new Error('Frontier peg-out runner lacks one exact passing result');
  }
}

function requireCompletionDeadline(value: unknown): number {
  const now = performance.now();
  const deadline = value === undefined ? now + MAX_RUNNER_RUNTIME_MS : value;
  if (
    typeof deadline !== 'number'
    || !Number.isFinite(deadline)
    || deadline <= now
    || deadline - now > MAX_RUNNER_RUNTIME_MS
  ) {
    throw new Error(
      `Frontier peg-out runner deadline must be within ${MAX_RUNNER_RUNTIME_MS} milliseconds`,
    );
  }
  return deadline;
}

function remainingCargoBudgetMs(completionDeadline: number): number {
  const remaining = Math.floor(
    completionDeadline
    - performance.now()
    - POST_CARGO_REVALIDATION_BUDGET_MS,
  );
  if (!Number.isSafeInteger(remaining) || remaining <= 0) {
    throw new Error('Frontier peg-out runner lacks a bounded Cargo budget');
  }
  return remaining;
}

function assertDeadline(completionDeadline: number, stage: string): void {
  if (performance.now() >= completionDeadline) {
    throw new Error(`Frontier peg-out runner exceeded its deadline at ${stage}`);
  }
}

function requireDirectory(value: unknown, label: string): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${label} must be an absolute existing directory`);
  }
  const resolved = path.resolve(value);
  if (!existsSync(resolved)) {
    throw new Error(`${label} must be an absolute existing directory`);
  }
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be an absolute existing directory`);
  }
  const canonical = realpathSync(resolved);
  if (pathIdentity(canonical) !== pathIdentity(resolved)) {
    throw new Error(`${label} must be canonical and non-symlinked`);
  }
  return canonical;
}

function requireRegularFile(value: unknown, label: string): string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${label} must be an absolute existing regular file`);
  }
  const resolved = path.resolve(value);
  if (!existsSync(resolved)) {
    throw new Error(`${label} must be an absolute existing regular file`);
  }
  const stat = lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be an absolute existing regular file`);
  }
  const canonical = realpathSync(resolved);
  if (pathIdentity(canonical) !== pathIdentity(resolved)) {
    throw new Error(`${label} must be canonical and non-symlinked`);
  }
  return canonical;
}

function resolveBridgeRoot(): string {
  return realpathSync(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
  ));
}

function resolveRepositoryRoot(bridgeRoot: string): string {
  const repositoryRoot = existsSync(path.join(bridgeRoot, '.git'))
    ? bridgeRoot
    : path.dirname(bridgeRoot);
  if (!existsSync(path.join(repositoryRoot, '.git'))) {
    throw new Error('bridge Git repository root is unavailable');
  }
  resolveBridgeRepositoryLayout({ repositoryRoot, bridgeRoot });
  return realpathSync(repositoryRoot);
}

function isSameOrDescendant(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === ''
    || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function isStrictDescendant(candidate: string, root: string): boolean {
  return pathIdentity(candidate) !== pathIdentity(root)
    && isSameOrDescendant(candidate, root);
}

function pathIdentity(value: string): string {
  const normalized = path.resolve(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256LfNormalized(value: Uint8Array): string {
  const normalized = Buffer.from(value).toString('utf8').replaceAll('\r\n', '\n');
  return sha256Text(normalized);
}

function exactObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactRecord(
  value: unknown,
  expected: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort();
  const fields = [...expected].sort();
  if (
    actual.length !== fields.length
    || actual.some((field, index) => field !== fields[index])
    || Object.values(descriptors).some(
      descriptor => !descriptor.enumerable || !('value' in descriptor),
    )
  ) {
    throw new Error(`${label} must contain exactly: ${fields.join(', ')}`);
  }
  return value as Record<string, unknown>;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}
