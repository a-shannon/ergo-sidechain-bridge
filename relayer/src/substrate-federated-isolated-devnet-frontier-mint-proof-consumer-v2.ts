import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveBridgeRepositoryLayout } from './bridge-repository-layout.js';
import {
  inspectConsensusSourceBaseline,
  type ConsensusSourceBaselineReport,
} from './consensus-source-baseline.js';
import {
  createPinnedLocalNativeBuildWorkspace,
  EXPECTED_NATIVE_VERIFIER_TOOLCHAIN_LOCK_SHA256,
  runBoundedProcess,
  validateNativeVerifierToolchainLock,
  type NativeVerifierBuildToolObservation,
} from './pinned-local-native-verifier-build.js';
import {
  decodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  derivePooledReserveMintReservationRuntimeProfileV4IdHex,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
import {
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance,
  type SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2,
} from './substrate-federated-isolated-devnet-packet-producer-v1.js';
import {
  buildFederatedPooledReserveSourceProofProfileV1,
  decodeFederatedPooledReserveSourceProofProfileScaleV1Hex,
  decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex,
} from './substrate-federated-pooled-reserve-source-proof-v1.js';
import { sha256CanonicalJson } from './strict-json.js';
import {
  decodeValidityApplicationPooledReserveMintReservationStatementV4Hex,
  deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_MINT_PROOF_CONSUMER_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-frontier-mint-proof-consumer.v2' as const;

const RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_MINT_PROOF_CONSUMER_V2';
const CARGO_TEST_NAME =
  'bridge_federated_lab_reservation_tests::federated_lab_direct_parent_mint_is_atomic_and_rejects_unreserved_sibling';
const DYNAMIC_PROOF_MARKER = 'bridge-lab-dynamic-source-proof-sha256=';
const MAX_CONSUMER_RUNTIME_MS = 30 * 60_000;
const POST_CARGO_REVALIDATION_BUDGET_MS = 60_000;
const EXPECTED_CONSENSUS_SOURCE_LOCK_SHA256 =
  '7bc185ee858c49b7f0c430decee84a7dcc3aeba69f1d8906be8c97351f60b53a';
const RECEIPTS = new WeakSet<object>();
const CONSUMED_PACKET_PROOFS = new WeakSet<object>();
const CONSUMING_PACKET_PROOFS = new WeakSet<object>();

export interface RunSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2Input {
  readonly proofReceipt:
    Readonly<SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2>;
  readonly frontierSourceDirectory: string;
  readonly cargoExecutablePath: string;
  readonly rustcExecutablePath: string;
  readonly gitExecutablePath: string;
  readonly offline: boolean;
}

export type SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerPlanV2 =
  Readonly<
    Omit<
      RunSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2Input,
      'proofReceipt'
    >
  >;

export interface SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_MINT_PROOF_CONSUMER_V2_SCHEMA;
  readonly version: 2;
  readonly status: 'packet_bound_proof_consumed_by_frontier_lab';
  readonly packetProof:
    Readonly<SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2>;
  readonly packetProofReceiptDigestHex: string;
  readonly sourceProofReceiptDigestHex: string;
  readonly sourceEvidenceReceiptDigestHex: string;
  readonly targetDescriptorDigestHex: string;
  readonly runtimeProfileIdHex: string;
  readonly sourceProofProfileIdHex: string;
  readonly statementIdHex: string;
  readonly mintIdentityHex: string;
  readonly sourceLockDigestHex: string;
  readonly toolchainDigestHex: string;
  readonly dynamicSourceProofSha256Hex: string;
  readonly executionInputDigestHex: string;
  readonly stdoutSha256Hex: string;
  readonly stderrSha256Hex: string;
  readonly checks: Readonly<{
    readonly exactPacketProofProvenanceRevalidated: true;
    readonly exactCollectedSourceEvidenceBoundaryConsumed: true;
    readonly exactSourceLockRevalidatedBeforeAndAfter: true;
    readonly exactToolchainRevalidatedBeforeAndAfter: true;
    readonly exactDynamicSourceProfileConsumed: true;
    readonly exactDynamicSourceProofEnvelopeConsumed: true;
    readonly exactDynamicSourceProofMarkerConsumed: true;
    readonly exactStatementAndMintIdentityConsumed: true;
    readonly directParentReservationAndMintAcceptedAtomically: true;
    readonly unreservedSiblingRejectedAtomically: true;
    readonly callerSuppliedAuthorityFieldsAccepted: false;
    readonly oneShotProofConsumerUsed: true;
    readonly toolsAuthenticatedBeforeFirstExecution: true;
    readonly freshConsumerOwnedCargoTargetUsed: true;
    readonly configurationIsolatedCargoHomeUsed: true;
    readonly cargoProcessTreeContainedBeforeCleanup: true;
    readonly offlineCargoUsed: true;
  }>;
  readonly boundary: Readonly<{
    readonly isolatedTestClientOnly: true;
    readonly processOwnedSyntheticCustodyOnly: true;
    readonly localSourceAndToolIdentityOnly: true;
    readonly completeBuildToolClosureVerified: false;
    readonly dependencyCacheContentAttested: false;
    readonly atomicSourceAndToolSnapshotEstablished: false;
    readonly exclusiveNonAdversarialSameUserExecutionRequired: true;
    readonly callerSuppliedEvidenceBytesAccepted: false;
    readonly sourceEvidenceCollectionProvenanceEstablished: true;
    readonly sourceCanonicalityIndependentlyVerified: false;
    readonly ergoPowAuthenticated: false;
    readonly externalTargetNodeAcceptanceEstablished: false;
    readonly activationAuthorized: false;
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

export async function runSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(
  input: Readonly<
    RunSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2Input
  >,
  completionDeadline: number | undefined = undefined,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2
>> {
  const boundedCompletionDeadline = requireConsumerCompletionDeadline(
    completionDeadline,
  );
  const record = exactRecord(input, [
    'cargoExecutablePath',
    'frontierSourceDirectory',
    'gitExecutablePath',
    'offline',
    'proofReceipt',
    'rustcExecutablePath',
  ], 'Frontier packet-proof consumer input');
  const proofReceipt = record.proofReceipt as Readonly<
    SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2
  >;
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance(
    proofReceipt,
  );
  const plan = preflightSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2({
    cargoExecutablePath: record.cargoExecutablePath as string,
    frontierSourceDirectory: record.frontierSourceDirectory as string,
    gitExecutablePath: record.gitExecutablePath as string,
    offline: record.offline as boolean,
    rustcExecutablePath: record.rustcExecutablePath as string,
  });
  assertConsumerDeadline(
    boundedCompletionDeadline,
    'consumer-plan preflight',
  );
  const guardedInput = Object.freeze({
    ...plan,
    proofReceipt,
  }) as Readonly<
    RunSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2Input
  >;
  if (
    CONSUMED_PACKET_PROOFS.has(proofReceipt)
    || CONSUMING_PACKET_PROOFS.has(proofReceipt)
  ) {
    throw new Error('Frontier packet-proof consumer is already consumed or active');
  }
  CONSUMING_PACKET_PROOFS.add(proofReceipt);
  try {
    return await consumeSubstrateFederatedIsolatedDevnetFrontierMintProofV2(
      guardedInput,
      proofReceipt,
      boundedCompletionDeadline,
    );
  } finally {
    CONSUMING_PACKET_PROOFS.delete(proofReceipt);
  }
}

export function preflightSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2(
  input: Readonly<
    SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerPlanV2
  >,
): Readonly<SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerPlanV2> {
  const record = exactRecord(input, [
    'cargoExecutablePath',
    'frontierSourceDirectory',
    'gitExecutablePath',
    'offline',
    'rustcExecutablePath',
  ], 'Frontier packet-proof consumer plan');
  if (record.offline !== true) {
    throw new Error('Frontier packet-proof consumer requires offline Cargo');
  }
  return Object.freeze({
    cargoExecutablePath: requireRegularFile(
      record.cargoExecutablePath,
      'Cargo executable',
    ),
    frontierSourceDirectory: requireDirectory(
      record.frontierSourceDirectory,
      'patched Frontier source',
    ),
    gitExecutablePath: requireRegularFile(
      record.gitExecutablePath,
      'Git executable',
    ),
    offline: true,
    rustcExecutablePath: requireRegularFile(
      record.rustcExecutablePath,
      'Rust compiler executable',
    ),
  });
}

async function consumeSubstrateFederatedIsolatedDevnetFrontierMintProofV2(
  input: Readonly<
    RunSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerV2Input
  >,
  guardedProofReceipt: Readonly<
    SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2
  >,
  completionDeadline: number,
): Promise<Readonly<
  SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2
>> {
  const record = exactRecord(input, [
    'cargoExecutablePath',
    'frontierSourceDirectory',
    'gitExecutablePath',
    'offline',
    'proofReceipt',
    'rustcExecutablePath',
  ], 'Frontier packet-proof consumer input');
  const proofReceipt = record.proofReceipt as Readonly<
    SubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2
  >;
  if (proofReceipt !== guardedProofReceipt) {
    throw new Error('Frontier packet-proof consumer guarded proof changed');
  }
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance(
    proofReceipt,
  );
  if (CONSUMED_PACKET_PROOFS.has(proofReceipt)) {
    throw new Error('Frontier packet-proof consumer is already consumed');
  }
  const sourceProof = proofReceipt.sourceProof;
  if (
    proofReceipt.checks.exactSourceEvidenceReceiptBound !== true
    || sourceProof.checks.exactSourceEvidenceReceiptBound !== true
    || sourceProof.boundary.evidenceBytesCallerSupplied !== false
    || sourceProof.boundary.sourceEvidenceCollectionProvenanceEstablished
      !== true
    || sourceProof.boundary.sourceCanonicalityIndependentlyVerified !== false
  ) {
    throw new Error(
      'Frontier packet-proof consumer requires collected source evidence',
    );
  }
  const frontierSourceDirectory = requireDirectory(
    record.frontierSourceDirectory,
    'patched Frontier source',
  );
  const cargoExecutablePath = requireRegularFile(
    record.cargoExecutablePath,
    'Cargo executable',
  );
  const rustcExecutablePath = requireRegularFile(
    record.rustcExecutablePath,
    'Rust compiler executable',
  );
  const gitExecutablePath = requireRegularFile(
    record.gitExecutablePath,
    'Git executable',
  );
  if (record.offline !== true) {
    throw new Error('Frontier packet-proof consumer requires offline Cargo');
  }
  const bridgeRoot = resolveBridgeRoot();
  const repositoryRoot = resolveRepositoryRoot(bridgeRoot);
  const toolchainBefore = inspectToolchain({
    bridgeRoot,
    cargoExecutablePath,
    frontierSourceDirectory,
    gitExecutablePath,
    rustcExecutablePath,
  });
  const toolchainDigestHex = sha256CanonicalJson(
    toolchainBefore,
    `${RECEIPT_DIGEST_DOMAIN}_TOOLCHAIN`,
  );
  const sourceLockBefore = inspectSourceLock({
    bridgeRoot,
    frontierSourceDirectory,
    gitExecutablePath,
    repositoryRoot,
  });
  const sourceLockDigestHex = sha256CanonicalJson(
    sourceLockBefore,
    `${RECEIPT_DIGEST_DOMAIN}_SOURCE_LOCK`,
  );
  assertConsumerDeadline(completionDeadline, 'source and tool preflight');

  const runtimeProfile =
    decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
      sourceProof.runtimeProfileScaleHex,
    );
  const runtimeProfileIdHex =
    derivePooledReserveMintReservationRuntimeProfileV4IdHex(runtimeProfile);
  const sourceProofProfileInput =
    decodeFederatedPooledReserveSourceProofProfileScaleV1Hex(
      sourceProof.sourceProofProfileScaleHex,
    );
  const sourceProofProfile =
    buildFederatedPooledReserveSourceProofProfileV1(
      sourceProofProfileInput,
    );
  const proofEnvelope =
    decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex(
      sourceProofProfileInput,
      sourceProof.request,
      sourceProof.sourceProofEnvelopeScaleHex,
    );
  const statement =
    decodeValidityApplicationPooledReserveMintReservationStatementV4Hex(
      sourceProof.request.statementHex,
    );
  const statementIdHex =
    deriveValidityApplicationPooledReserveMintReservationStatementIdV4Hex(
      statement,
    );
  const sourceProofProfileIdHex = canonicalHex(
    sourceProof.sourceProofProfileIdHex,
    32,
    'source-proof profile ID',
  );
  if (
    runtimeProfileIdHex !== canonicalHex(
      sourceProof.runtimeProfileIdHex,
      32,
      'runtime profile ID',
    )
    || canonicalHex(
      runtimeProfile.sourceProofProfileIdHex,
      32,
      'runtime source-proof profile ID',
    ) !== sourceProofProfileIdHex
    || canonicalHex(
      runtimeProfile.sourceProofSystemIdHex,
      32,
      'runtime source-proof system ID',
    ) !== canonicalHex(
      sourceProofProfile.proofSystemIdHex,
      32,
      'decoded source-proof system ID',
    )
    || canonicalHex(
      sourceProofProfile.proofProfileIdHex,
      32,
      'decoded source-proof profile ID',
    ) !== sourceProofProfileIdHex
    || canonicalHex(
      proofEnvelope.proofProfileIdHex,
      32,
      'proof-envelope profile ID',
    ) !== sourceProofProfileIdHex
    || statementIdHex !== canonicalHex(
      sourceProof.mintReservationStatementIdHex,
      32,
      'mint-reservation statement ID',
    )
    || canonicalHex(
      statement.mintIdentityHex,
      32,
      'statement mint identity',
    ) !== canonicalHex(
      sourceProof.mintIdentityHex,
      32,
      'receipt mint identity',
    )
  ) {
    throw new Error('Frontier packet-proof consumer binding changed');
  }

  const authorityEnvironment = deepFreeze({
    BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_SCALE_HEX:
      canonicalBytes(
        sourceProof.sourceProofProfileScaleHex,
        'source-proof profile SCALE bytes',
      ),
    BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_ID_HEX:
      sourceProofProfileIdHex,
    BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_V4_HEX:
      sourceProof.request.statementHex,
    BRIDGE_LAB_FEDERATED_MINT_RESERVATION_STATEMENT_ID_V4_HEX:
      statementIdHex,
    BRIDGE_LAB_FEDERATED_MINT_IDENTITY_V4_HEX:
      canonicalHex(sourceProof.mintIdentityHex, 32, 'mint identity'),
    BRIDGE_LAB_FEDERATED_MINT_SOURCE_PROOF_ENVELOPE_V4_HEX:
      sourceProof.sourceProofEnvelopeScaleHex,
  });
  const dynamicSourceProofSha256Hex = `0x${sha256Bytes(Buffer.from(
    canonicalBytes(
      sourceProof.sourceProofEnvelopeScaleHex,
      'source-proof envelope SCALE bytes',
    ).slice(2),
    'hex',
  ))}`;
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
  ];
  const executionInputDigestHex = sha256CanonicalJson({
    cargoArguments,
    authorityEnvironment,
    dynamicSourceProofSha256Hex,
    sourceLockDigestHex,
    toolchainDigestHex,
  }, RECEIPT_DIGEST_DOMAIN);
  const workspace = createPinnedLocalNativeBuildWorkspace();
  let stdout: string;
  let stderr: string;
  try {
    const cargoTargetDirectory = requireDirectory(
      workspace.buildTargetPath,
      'consumer-owned Frontier Cargo target',
    );
    const cargoHomeDirectory = requireDirectory(
      workspace.cargoHomePath,
      'consumer-owned isolated Cargo home',
    );
    assertCargoConfigurationIsolated(
      frontierSourceDirectory,
      cargoHomeDirectory,
    );
    const cargoTimeoutMs = remainingConsumerCargoBudgetMs(
      completionDeadline,
    );
    const result = await runBoundedProcess({
      executablePath: cargoExecutablePath,
      args: cargoArguments,
      cwd: frontierSourceDirectory,
      env: buildCargoEnvironment({
        authorityEnvironment,
        cargoExecutablePath,
        cargoHomeDirectory,
        cargoTargetDirectory,
        frontierSourceDirectory,
        rustcExecutablePath,
      }),
      timeoutMs: cargoTimeoutMs,
      maxOutputBytes: 32 * 1024 * 1024,
      maxStdoutBytes: 16 * 1024 * 1024,
      maxStderrBytes: 16 * 1024 * 1024,
      label: 'Frontier packet-proof Cargo consumer',
    });
    stdout = result.stdout;
    stderr = result.stderr;
    assertExactCargoEvidence(
      stdout,
      stderr,
      `${DYNAMIC_PROOF_MARKER}${dynamicSourceProofSha256Hex}`,
    );
  } finally {
    workspace.cleanup();
  }
  assertConsumerDeadline(completionDeadline, 'Cargo cleanup');
  const toolchainAfter = inspectToolchain({
    bridgeRoot,
    cargoExecutablePath,
    frontierSourceDirectory,
    gitExecutablePath,
    rustcExecutablePath,
  });
  if (
    sha256CanonicalJson(
      toolchainAfter,
      `${RECEIPT_DIGEST_DOMAIN}_TOOLCHAIN`,
    ) !== toolchainDigestHex
  ) {
    throw new Error('Frontier toolchain changed during packet-proof consumption');
  }
  assertConsumerDeadline(completionDeadline, 'toolchain revalidation');
  const sourceLockAfter = inspectSourceLock({
    bridgeRoot,
    frontierSourceDirectory,
    gitExecutablePath,
    repositoryRoot,
  });
  if (
    sha256CanonicalJson(
      sourceLockAfter,
      `${RECEIPT_DIGEST_DOMAIN}_SOURCE_LOCK`,
    ) !== sourceLockDigestHex
  ) {
    throw new Error('Frontier source lock changed during packet-proof consumption');
  }
  assertConsumerDeadline(completionDeadline, 'source-lock revalidation');
  CONSUMED_PACKET_PROOFS.add(proofReceipt);

  const body = deepFreeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_FRONTIER_MINT_PROOF_CONSUMER_V2_SCHEMA,
    version: 2 as const,
    status: 'packet_bound_proof_consumed_by_frontier_lab' as const,
    packetProof: proofReceipt,
    packetProofReceiptDigestHex: proofReceipt.receiptDigestHex,
    sourceProofReceiptDigestHex: sourceProof.receiptDigestHex,
    sourceEvidenceReceiptDigestHex: canonicalDigestHex(
      sourceProof.sourceEvidenceReceiptDigestHex,
      'source-evidence receipt digest',
    ),
    targetDescriptorDigestHex: sourceProof.targetDescriptorDigestHex,
    runtimeProfileIdHex,
    sourceProofProfileIdHex,
    statementIdHex,
    mintIdentityHex: canonicalHex(
      sourceProof.mintIdentityHex,
      32,
      'mint identity',
    ),
    sourceLockDigestHex,
    toolchainDigestHex,
    dynamicSourceProofSha256Hex,
    executionInputDigestHex,
    stdoutSha256Hex: sha256(stdout),
    stderrSha256Hex: sha256(stderr),
    checks: {
      exactPacketProofProvenanceRevalidated: true as const,
      exactCollectedSourceEvidenceBoundaryConsumed: true as const,
      exactSourceLockRevalidatedBeforeAndAfter: true as const,
      exactToolchainRevalidatedBeforeAndAfter: true as const,
      exactDynamicSourceProfileConsumed: true as const,
      exactDynamicSourceProofEnvelopeConsumed: true as const,
      exactDynamicSourceProofMarkerConsumed: true as const,
      exactStatementAndMintIdentityConsumed: true as const,
      directParentReservationAndMintAcceptedAtomically: true as const,
      unreservedSiblingRejectedAtomically: true as const,
      callerSuppliedAuthorityFieldsAccepted: false as const,
      oneShotProofConsumerUsed: true as const,
      toolsAuthenticatedBeforeFirstExecution: true as const,
      freshConsumerOwnedCargoTargetUsed: true as const,
      configurationIsolatedCargoHomeUsed: true as const,
      cargoProcessTreeContainedBeforeCleanup: true as const,
      offlineCargoUsed: true as const,
    },
    boundary: {
      isolatedTestClientOnly: true as const,
      processOwnedSyntheticCustodyOnly: true as const,
      localSourceAndToolIdentityOnly: true as const,
      completeBuildToolClosureVerified: false as const,
      dependencyCacheContentAttested: false as const,
      atomicSourceAndToolSnapshotEstablished: false as const,
      exclusiveNonAdversarialSameUserExecutionRequired: true as const,
      callerSuppliedEvidenceBytesAccepted: false as const,
      sourceEvidenceCollectionProvenanceEstablished: true as const,
      sourceCanonicalityIndependentlyVerified: false as const,
      ergoPowAuthenticated: false as const,
      externalTargetNodeAcceptanceEstablished: false as const,
      activationAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
    limitations: [
      'The runtime is one in-memory source-locked Frontier TestClient.',
      'Source and tool identity is local exact-input evidence, not an independent build attestation.',
      'The complete build-tool closure and shared dependency-cache content are not attested.',
      'Pre/post source and tool hashes are not an atomic snapshot and require exclusive execution by a non-adversarial local OS user.',
      'The packet evidence bytes come from a one-shot process-proven collector receipt; their source canonicality remains federated.',
      'Independent Ergo PoW and source canonicality are not established.',
      'No external target, funds authority, Gate 5 closure, or trustless status follows.',
    ] as const,
  });
  const receipt = deepFreeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN),
  });
  RECEIPTS.add(receipt);
  return receipt;
}

export function assertSubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2
> {
  if (value === null || typeof value !== 'object' || !RECEIPTS.has(value)) {
    throw new Error('Frontier packet-proof consumer receipt lacks process provenance');
  }
  const receipt = value as Readonly<
    SubstrateFederatedIsolatedDevnetFrontierMintProofConsumerReceiptV2
  >;
  assertSubstrateFederatedIsolatedDevnetPacketMintSourceProofReceiptV2Provenance(
    receipt.packetProof,
  );
  const { receiptDigestHex, ...body } = receipt;
  if (
    receiptDigestHex !== sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN)
    || receipt.packetProof.receiptDigestHex
      !== receipt.packetProofReceiptDigestHex
    || receipt.packetProof.sourceProof.receiptDigestHex
      !== receipt.sourceProofReceiptDigestHex
    || receipt.packetProof.sourceProof.sourceEvidenceReceiptDigestHex
      !== receipt.sourceEvidenceReceiptDigestHex
  ) {
    throw new Error('Frontier packet-proof consumer receipt changed');
  }
}

function requireConsumerCompletionDeadline(value: unknown): number {
  const now = performance.now();
  const deadline = value === undefined
    ? now + MAX_CONSUMER_RUNTIME_MS
    : value;
  if (
    typeof deadline !== 'number'
    || !Number.isFinite(now)
    || !Number.isFinite(deadline)
    || deadline <= now
    || deadline - now > MAX_CONSUMER_RUNTIME_MS
  ) {
    throw new Error(
      `Frontier packet-proof consumer deadline must be within ${MAX_CONSUMER_RUNTIME_MS} milliseconds`,
    );
  }
  return deadline;
}

function remainingConsumerCargoBudgetMs(completionDeadline: number): number {
  const remainingMs = Math.floor(
    completionDeadline
    - performance.now()
    - POST_CARGO_REVALIDATION_BUDGET_MS,
  );
  if (!Number.isSafeInteger(remainingMs) || remainingMs <= 0) {
    throw new Error(
      'Frontier packet-proof consumer lacks time for Cargo and post-process revalidation',
    );
  }
  return remainingMs;
}

function assertConsumerDeadline(
  completionDeadline: number,
  stage: string,
): void {
  const now = performance.now();
  if (!Number.isFinite(now) || now >= completionDeadline) {
    throw new Error(
      `Frontier packet-proof consumer exceeded its deadline at ${stage}`,
    );
  }
}

function requireDirectory(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !path.isAbsolute(value)
    || value.includes('\0')
  ) {
    throw new Error(`${label} must be an existing directory`);
  }
  const resolved = path.resolve(value);
  if (pathInputIdentity(value) !== pathInputIdentity(resolved)) {
    throw new Error(`${label} path must be canonical and non-symlinked`);
  }
  if (!existsSync(resolved)) {
    throw new Error(`${label} must be an existing directory`);
  }
  const observation = lstatSync(resolved);
  if (!observation.isDirectory() || observation.isSymbolicLink()) {
    throw new Error(`${label} must be an existing directory`);
  }
  const canonical = realpathSync(resolved);
  if (pathIdentity(canonical) !== pathIdentity(resolved)) {
    throw new Error(`${label} path must be canonical and non-symlinked`);
  }
  return canonical;
}

function requireRegularFile(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !path.isAbsolute(value)
    || value.includes('\0')
  ) {
    throw new Error(`${label} must be an existing regular file`);
  }
  const resolved = path.resolve(value);
  if (pathInputIdentity(value) !== pathInputIdentity(resolved)) {
    throw new Error(`${label} path must be canonical and non-symlinked`);
  }
  if (!existsSync(resolved)) {
    throw new Error(`${label} must be an existing regular file`);
  }
  const observation = lstatSync(resolved);
  if (!observation.isFile() || observation.isSymbolicLink()) {
    throw new Error(`${label} must be an existing regular file`);
  }
  const canonical = realpathSync(resolved);
  if (pathIdentity(canonical) !== pathIdentity(resolved)) {
    throw new Error(`${label} path must be canonical and non-symlinked`);
  }
  return canonical;
}

function pathInputIdentity(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function pathIdentity(value: string): string {
  const normalized = path.resolve(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function resolveBridgeRoot(): string {
  return realpathSync(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
  ));
}

function resolveRepositoryRoot(bridgeRoot: string): string {
  const parent = path.dirname(bridgeRoot);
  const repositoryRoot = existsSync(path.join(bridgeRoot, '.git'))
    ? bridgeRoot
    : parent;
  if (!existsSync(path.join(repositoryRoot, '.git'))) {
    throw new Error('bridge Git repository root is unavailable');
  }
  resolveBridgeRepositoryLayout({ repositoryRoot, bridgeRoot });
  return realpathSync(repositoryRoot);
}

function inspectSourceLock(input: Readonly<{
  bridgeRoot: string;
  frontierSourceDirectory: string;
  gitExecutablePath: string;
  repositoryRoot: string;
}>): Readonly<{
  sourceLockSha256Hex: string;
  baselineReportDigestHex: string;
  frontierCommit: string;
  frontierPatchSha256Hex: string;
  solidityBuildManifestSha256Hex: string;
}> {
  const sourceLockPath = requireRegularFile(
    path.join(input.bridgeRoot, 'sources', 'consensus-source-lock.json'),
    'consensus source lock',
  );
  const sourceLockSha256Hex = sha256Bytes(readFileSync(sourceLockPath));
  if (sourceLockSha256Hex !== EXPECTED_CONSENSUS_SOURCE_LOCK_SHA256) {
    throw new Error('consensus source lock differs from the compiled pin');
  }
  const report = inspectConsensusSourceBaseline({
    worktreeRoot: input.repositoryRoot,
    bridgeRoot: input.bridgeRoot,
    frontierSourcePath: input.frontierSourceDirectory,
    requireFrontierCheckout: true,
    requireErgoCheckout: false,
    gitExecutablePath: input.gitExecutablePath,
  });
  assertPassingSourceLockReport(report);
  return deepFreeze({
    sourceLockSha256Hex,
    baselineReportDigestHex: sha256CanonicalJson(
      report,
      `${RECEIPT_DIGEST_DOMAIN}_SOURCE_BASELINE_REPORT`,
    ),
    frontierCommit: report.sourceIdentity.frontierCommit!,
    frontierPatchSha256Hex: report.sourceIdentity.frontierPatchSha256!,
    solidityBuildManifestSha256Hex:
      report.sourceIdentity.solidityBuildManifestSha256!,
  });
}

function assertPassingSourceLockReport(
  report: Readonly<ConsensusSourceBaselineReport>,
): void {
  if (
    report.status !== 'PASS'
    || report.errors.length !== 0
    || !report.checks.lockBindingsValidated
    || !report.checks.solidityBuildClosureArtifactsValidated
    || !report.checks.frontierCheckoutRequired
    || !report.checks.frontierCheckoutValidated
    || report.checks.ergoCheckoutRequired
    || report.sourceIdentity.frontierCommit === null
    || report.sourceIdentity.frontierPatchSha256 === null
    || report.sourceIdentity.solidityBuildManifestSha256 === null
  ) {
    throw new Error('patched Frontier checkout differs from the complete source lock');
  }
}

function inspectToolchain(input: Readonly<{
  bridgeRoot: string;
  cargoExecutablePath: string;
  frontierSourceDirectory: string;
  gitExecutablePath: string;
  rustcExecutablePath: string;
}>): Readonly<{
  lockSha256Hex: string;
  observation: Readonly<NativeVerifierBuildToolObservation>;
  cargoLockSha256Hex: string;
  rustToolchainSha256Hex: string;
}> {
  const lockPath = requireRegularFile(
    path.join(input.bridgeRoot, 'sources', 'native-verifier-toolchain-lock.json'),
    'native verifier toolchain lock',
  );
  const lockBytes = readFileSync(lockPath);
  const lockSha256Hex = sha256Bytes(lockBytes);
  if (lockSha256Hex !== EXPECTED_NATIVE_VERIFIER_TOOLCHAIN_LOCK_SHA256) {
    throw new Error('native verifier toolchain lock differs from the compiled pin');
  }
  const parsed = JSON.parse(lockBytes.toString('utf8')) as unknown;
  const platformKey = `${process.platform}-${process.arch}`;
  const profile = toolchainProfile(parsed, platformKey);
  const environment = minimalToolEnvironment();
  const preExecutionObservation = deepFreeze({
    platformKey,
    rustTarget: profile.rustTarget,
    cargo: {
      version: profile.cargo.version,
      sha256: sha256Bytes(readFileSync(input.cargoExecutablePath)),
    },
    rustc: {
      version: profile.rustc.version,
      sha256: sha256Bytes(readFileSync(input.rustcExecutablePath)),
    },
    git: {
      version: profile.git.version,
      sha256: sha256Bytes(readFileSync(input.gitExecutablePath)),
    },
  }) satisfies Readonly<NativeVerifierBuildToolObservation>;
  if (
    validateNativeVerifierToolchainLock(parsed, preExecutionObservation)
      .errors.length > 0
  ) {
    throw new Error(
      'Frontier build-tool digests differ before first execution',
    );
  }
  const observation = deepFreeze({
    platformKey,
    rustTarget: profile.rustTarget,
    cargo: {
      version: exactToolVersion(
        input.cargoExecutablePath,
        input.frontierSourceDirectory,
        environment,
        profile.cargo.version,
        'Cargo',
      ),
      sha256: sha256Bytes(readFileSync(input.cargoExecutablePath)),
    },
    rustc: {
      version: exactToolVersion(
        input.rustcExecutablePath,
        input.frontierSourceDirectory,
        environment,
        profile.rustc.version,
        'Rust compiler',
      ),
      sha256: sha256Bytes(readFileSync(input.rustcExecutablePath)),
    },
    git: {
      version: exactToolVersion(
        input.gitExecutablePath,
        input.frontierSourceDirectory,
        environment,
        profile.git.version,
        'Git',
      ),
      sha256: sha256Bytes(readFileSync(input.gitExecutablePath)),
    },
  }) satisfies Readonly<NativeVerifierBuildToolObservation>;
  if (validateNativeVerifierToolchainLock(parsed, observation).errors.length > 0) {
    throw new Error('Frontier build tools differ from the pinned toolchain lock');
  }
  return deepFreeze({
    lockSha256Hex,
    observation,
    cargoLockSha256Hex: sha256Bytes(readFileSync(requireRegularFile(
      path.join(input.frontierSourceDirectory, 'Cargo.lock'),
      'Frontier Cargo lock',
    ))),
    rustToolchainSha256Hex: sha256Bytes(readFileSync(requireRegularFile(
      path.join(input.frontierSourceDirectory, 'rust-toolchain.toml'),
      'Frontier Rust toolchain declaration',
    ))),
  });
}

function toolchainProfile(
  value: unknown,
  platformKey: string,
): Readonly<{
  rustTarget: string;
  cargo: Readonly<{ version: string }>;
  rustc: Readonly<{ version: string }>;
  git: Readonly<{ version: string }>;
}> {
  const root = exactObject(value, 'native verifier toolchain lock');
  const profiles = exactObject(root.profiles, 'native verifier toolchain profiles');
  const profile = exactObject(profiles[platformKey], 'native verifier toolchain profile');
  const tool = (name: 'cargo' | 'rustc' | 'git') => {
    const selected = exactObject(profile[name], `${name} toolchain profile`);
    if (typeof selected.version !== 'string' || selected.version.length === 0) {
      throw new Error(`${name} toolchain version is missing`);
    }
    return Object.freeze({ version: selected.version });
  };
  if (
    typeof profile.rustTarget !== 'string'
    || !/^[A-Za-z0-9_.-]+$/u.test(profile.rustTarget)
  ) {
    throw new Error('native verifier Rust target is invalid');
  }
  return Object.freeze({
    rustTarget: profile.rustTarget,
    cargo: tool('cargo'),
    rustc: tool('rustc'),
    git: tool('git'),
  });
}

function exactObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactToolVersion(
  executablePath: string,
  cwd: string,
  environment: NodeJS.ProcessEnv,
  expected: string,
  label: string,
): string {
  const result = spawnSync(executablePath, ['--version'], {
    cwd,
    encoding: 'utf8',
    env: environment,
    maxBuffer: 4096,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  const version = (result.stdout ?? '').trim();
  if (
    result.signal !== null
    || result.status !== 0
    || version !== expected
    || version.includes('\n')
    || (result.stderr ?? '').trim() !== ''
  ) {
    throw new Error(`${label} differs from the pinned toolchain lock`);
  }
  return version;
}

function minimalToolEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  if (process.platform === 'win32') {
    const configuredSystemRoot = process.env.SystemRoot
      ?? process.env.SYSTEMROOT
      ?? process.env.WINDIR;
    if (
      configuredSystemRoot === undefined
      || !path.isAbsolute(configuredSystemRoot)
    ) {
      throw new Error('SystemRoot must be one absolute Windows directory');
    }
    const canonicalSystemRoot = realpathSync(configuredSystemRoot);
    const expectedSystemDrive = path.parse(canonicalSystemRoot).root
      .replace(/[\\/]+$/u, '');
    const systemDrive = process.env.SystemDrive;
    if (
      systemDrive === undefined
      || !/^[A-Za-z]:$/u.test(systemDrive)
      || systemDrive.toUpperCase() !== expectedSystemDrive.toUpperCase()
    ) {
      throw new Error('SystemDrive must match the canonical SystemRoot drive');
    }
    environment.SystemRoot = canonicalSystemRoot;
    environment.WINDIR = canonicalSystemRoot;
    environment.SystemDrive = expectedSystemDrive;
  }
  return environment;
}

function buildCargoEnvironment(input: Readonly<{
  authorityEnvironment: Readonly<Record<string, string>>;
  cargoExecutablePath: string;
  cargoHomeDirectory: string;
  cargoTargetDirectory: string;
  frontierSourceDirectory: string;
  rustcExecutablePath: string;
}>): NodeJS.ProcessEnv {
  if (path.dirname(input.cargoExecutablePath) !== path.dirname(input.rustcExecutablePath)) {
    throw new Error('Cargo and Rust compiler must come from one pinned toolchain directory');
  }
  const environment = minimalToolEnvironment();
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
    assertPathEntryAbsent(candidate, 'Cargo configuration');
  }
}

function assertPathEntryAbsent(candidate: string, label: string): void {
  try {
    lstatSync(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`${label} must be absent from the isolated build boundary`);
}

function assertExactCargoEvidence(
  stdout: string,
  stderr: string,
  expectedMarker: string,
): void {
  const output = `${stdout}\n${stderr}`.replaceAll('\r\n', '\n');
  const escapedName = CARGO_TEST_NAME.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const exactPasses = output.match(
    new RegExp(`^test ${escapedName} \\.\\.\\. ok$`, 'gmu'),
  ) ?? [];
  if (exactPasses.length !== 1) {
    throw new Error('Frontier packet-proof consumer did not execute the exact atomic mint test');
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
    throw new Error('Frontier packet-proof consumer lacks one exact passing result');
  }
  const escapedMarker = expectedMarker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const markers = output.match(new RegExp(`^${escapedMarker}$`, 'gmu')) ?? [];
  if (markers.length !== 1) {
    throw new Error('Frontier packet-proof consumer lacks the exact dynamic proof marker');
  }
}

function canonicalBytes(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be non-empty canonical hexadecimal bytes`);
  }
  const normalized = value.toLowerCase().replace(/^0x/u, '');
  if (!/^(?:[0-9a-f]{2})+$/u.test(normalized)) {
    throw new Error(`${label} must be non-empty canonical hexadecimal bytes`);
  }
  return `0x${normalized}`;
}

function canonicalHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be ${bytes} canonical bytes`);
  }
  const normalized = value.toLowerCase().replace(/^0x/u, '');
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(normalized)) {
    throw new Error(`${label} must be ${bytes} canonical bytes`);
  }
  return `0x${normalized}`;
}

function canonicalDigestHex(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be 32 canonical bytes`);
  }
  const normalized = value.toLowerCase().replace(/^0x/u, '');
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be 32 canonical bytes`);
  }
  return normalized;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
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
  return value;
}
