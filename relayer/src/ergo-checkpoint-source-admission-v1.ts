import {
  computeErgoAutolykosV2SpvProfileId,
  computeErgoDifficultyContextDigest,
} from './ergo-settlement-core/ergo-autolykos-v2-spv-branch.js';
import {
  decodeErgoAutolykosV2RelayRuntimeWitnessV1,
  deriveErgoAutolykosV2RelayRuntimeWitnessIdV1Hex,
  ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_MAX_BYTES,
} from './ergo-settlement-core/ergo-autolykos-v2-relay-runtime-witness-v1.js';
import {
  replayErgoAutolykosV2RelayWitnessV1,
} from './ergo-settlement-core/ergo-autolykos-v2-relay-witness-v1.js';
import {
  computeErgoHeaderId,
  parseErgoAutolykosV2HeaderIdentity,
  serializeErgoHeaderIdentity,
} from './ergo-settlement-core/ergo-header-id.js';
import {
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  assertErgoUtxoStateRuntimeBranchCompositionV1Provenance,
  buildErgoUtxoStateRuntimeBranchCompositionV1,
} from './ergo-utxo-state-runtime-branch-composition-v1.js';
import type {
  ErgoUtxoStateRuntimeWitnessRetainedPacketV1,
} from './relayer-core/ergo-utxo-state-runtime-witness-retained-packet-v1.js';

export const ERGO_CHECKPOINT_SOURCE_POLICY_V1_SCHEMA =
  'e2s.ergo-checkpoint-source-policy.v1' as const;
export const ERGO_CHECKPOINT_SOURCE_ADMISSION_V1_SCHEMA =
  'e2s.ergo-checkpoint-source-admission.v1' as const;
export const ERGO_CHECKPOINT_SOURCE_ADMISSION_V1_STATUS =
  'NON_AUTHORIZING_REVIEWED_CHECKPOINT_SOURCE_SET_ADMITTED' as const;
export const ERGO_CHECKPOINT_SOURCE_POLICY_V1_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:ergo-checkpoint-source-policy:v1' as const;
export const ERGO_CHECKPOINT_SOURCE_SET_V1_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:ergo-checkpoint-source-set:v1' as const;
export const ERGO_CHECKPOINT_SOURCE_OBSERVATION_V1_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:ergo-checkpoint-source-observation:v1' as const;
export const ERGO_CHECKPOINT_SOURCE_ADMISSION_V1_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:ergo-checkpoint-source-admission:v1' as const;

const MAX_SOURCES = 8;
const MAX_OBSERVATION_AGE_MS = 24 * 60 * 60 * 1_000;
const MAX_HEADER_BYTES = 4_096;
const MAX_U256 = (1n << 256n) - 1n;
const REVIEWED_POLICIES = new WeakSet<object>();
const ADMISSIONS = new WeakSet<object>();

/**
 * Exact source-reviewed policy digests. The sole current entry is an inert
 * historical-conformance profile with `.invalid` origins and no runtime or
 * funds authority. A deployment profile requires a separate reviewed source
 * change; runtime JSON cannot approve its own checkpoint or source set.
 */
export const REVIEWED_ERGO_CHECKPOINT_SOURCE_POLICY_V1_DIGEST_HEXES:
readonly string[] = Object.freeze([
  '771cfe0166928e697ca50b8439cb0040e8b90a776c9d3bcd8624100a31bb0ebe',
]);

export interface ErgoCheckpointSourcePolicyV1 {
  readonly schema: typeof ERGO_CHECKPOINT_SOURCE_POLICY_V1_SCHEMA;
  readonly environment: string;
  readonly policyId: string;
  readonly checkpoint: Readonly<{
    sourceNetworkIdHex: string;
    spvProfileIdHex: string;
    checkpointHeaderIdHex: string;
    checkpointHeight: number;
    checkpointHeaderBytesHex: string;
    checkpointDifficultyContextDigestHex: string;
    checkpointCumulativeWork: string;
  }>;
  readonly sourceSet: Readonly<{
    maximumObservationAgeMs: number;
    sources: readonly Readonly<{
      sourceId: string;
      administrationId: string;
      rpcOrigin: string;
    }>[];
  }>;
  readonly activation: Readonly<{
    runtimeAuthorityEnabled: false;
    fundsAuthorityEnabled: false;
  }>;
}

export interface ReviewedErgoCheckpointSourcePolicyV1
  extends ErgoCheckpointSourcePolicyV1 {
  readonly policyDigestHex: string;
}

export interface ErgoCheckpointSourceObservationV1 {
  readonly sourceId: string;
  readonly administrationId: string;
  readonly rpcOrigin: string;
  readonly observedAtUnixMs: number;
  readonly relayWitnessBytes: Uint8Array;
}

export interface ErgoCheckpointSourceAdmissionV1 {
  readonly schema: typeof ERGO_CHECKPOINT_SOURCE_ADMISSION_V1_SCHEMA;
  readonly status: typeof ERGO_CHECKPOINT_SOURCE_ADMISSION_V1_STATUS;
  readonly policy: Readonly<{
    policyDigestHex: string;
    environment: string;
    policyId: string;
    sourceNetworkIdHex: string;
    spvProfileIdHex: string;
    checkpointHeaderIdHex: string;
    checkpointHeight: number;
    checkpointDifficultyContextDigestHex: string;
    sourceSetDigestHex: string;
  }>;
  readonly sourceSet: Readonly<{
    evaluatedAtUnixMs: number;
    maximumObservationAgeMs: number;
    observationCount: number;
    convergedRelayWitnessIdHex: string;
    selectedTipHeaderIdHex: string;
    selectedTipHeight: number;
    selectedCumulativeWork: string;
    observations: readonly Readonly<{
      sourceId: string;
      administrationId: string;
      rpcOriginDigestHex: string;
      observedAtUnixMs: number;
      observationDigestHex: string;
    }>[];
  }>;
  readonly retainedPacket: Readonly<{
    packetDigestHex: string;
    targetHeaderIdHex: string;
    targetHeight: number;
    confirmations: number;
    requiredConfirmations: number;
  }>;
  readonly runtimeStatementV3: Readonly<{
    statementIdHex: string;
    statementHex: string;
  }>;
  readonly checks: Readonly<{
    reviewedStaticPolicySelected: true;
    exactCheckpointHeaderAndContextPinned: true;
    exactBoundedSourceSetSupplied: true;
    declaredAdministrationIdentitiesDistinct: true;
    observationsFreshRelativeToSuppliedEvaluationTime: true;
    exactRelayWitnessAgreement: true;
    retainedPacketAndV3CompositionReplayed: true;
  }>;
  readonly authority: Readonly<{
    checkpointPinnedByReviewedStaticPolicy: true;
    checkpointExternallyAuthenticated: false;
    suppliedSourceSetMetadataMatchedReviewedPolicy: true;
    observationSourceProvenanceEstablished: false;
    observationClockExternallyAuthenticated: false;
    sourceOperationalIndependenceEstablished: false;
    completeCompetingBranchKnowledgeEstablished: false;
    globallyCanonicalErgoConsensusAccepted: false;
    deterministicFinalityEstablished: false;
    currentUtxoMembershipEstablished: false;
    transactionExecutionValidated: false;
    runtimeAdmissionAuthorized: false;
    mintAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    productionReady: false;
  }>;
  readonly limitations: readonly string[];
  readonly admissionDigestHex: string;
}

export interface BuildErgoCheckpointSourceAdmissionV1Input {
  readonly policy: Readonly<ReviewedErgoCheckpointSourcePolicyV1>;
  readonly retainedPacket: Readonly<ErgoUtxoStateRuntimeWitnessRetainedPacketV1>;
  readonly observations: readonly ErgoCheckpointSourceObservationV1[];
  readonly evaluatedAtUnixMs: number;
}

export function computeErgoCheckpointSourcePolicyV1Digest(
  value: unknown,
): string {
  return sha256CanonicalJson(
    normalizeErgoCheckpointSourcePolicyV1(value),
    ERGO_CHECKPOINT_SOURCE_POLICY_V1_DIGEST_DOMAIN,
  );
}

export function selectReviewedErgoCheckpointSourcePolicyV1(
  value: unknown,
): Readonly<ReviewedErgoCheckpointSourcePolicyV1> {
  const policy = normalizeErgoCheckpointSourcePolicyV1(value);
  const policyDigestHex = sha256CanonicalJson(
    policy,
    ERGO_CHECKPOINT_SOURCE_POLICY_V1_DIGEST_DOMAIN,
  );
  if (!REVIEWED_ERGO_CHECKPOINT_SOURCE_POLICY_V1_DIGEST_HEXES.includes(
    policyDigestHex,
  )) {
    throw new Error('Ergo checkpoint source policy is not source reviewed');
  }
  const selected = deepFreeze({ ...policy, policyDigestHex });
  REVIEWED_POLICIES.add(selected);
  return selected;
}

export function assertReviewedErgoCheckpointSourcePolicyV1Provenance(
  value: unknown,
): asserts value is Readonly<ReviewedErgoCheckpointSourcePolicyV1> {
  if (typeof value !== 'object' || value === null || !REVIEWED_POLICIES.has(value)) {
    throw new Error('Ergo checkpoint source policy lacks reviewed provenance');
  }
}

export function buildErgoCheckpointSourceAdmissionV1(
  value: BuildErgoCheckpointSourceAdmissionV1Input,
): Readonly<ErgoCheckpointSourceAdmissionV1> {
  const input = exactDataObject(value, [
    'policy',
    'retainedPacket',
    'observations',
    'evaluatedAtUnixMs',
  ], 'Ergo checkpoint source admission input');
  const policy = input.policy as Readonly<ReviewedErgoCheckpointSourcePolicyV1>;
  assertReviewedErgoCheckpointSourcePolicyV1Provenance(policy);
  const evaluatedAtUnixMs = unsignedSafeInteger(
    input.evaluatedAtUnixMs,
    'Ergo source-set evaluation time',
  );
  const observations = denseArray(
    input.observations,
    MAX_SOURCES,
    'Ergo checkpoint source observations',
  ).map((observation, index) => normalizeObservation(
    observation,
    `Ergo checkpoint source observation ${index}`,
  ));
  if (observations.length !== policy.sourceSet.sources.length) {
    throw new Error('Ergo checkpoint source observations are missing or excessive');
  }
  const observationBySource = new Map<string, ReturnType<typeof normalizeObservation>>();
  for (const observation of observations) {
    if (observationBySource.has(observation.sourceId)) {
      throw new Error('Ergo checkpoint source observations contain a duplicate source');
    }
    observationBySource.set(observation.sourceId, observation);
  }
  const actualOrigins = new Set(observations.map(observation => observation.rpcOrigin));
  if (actualOrigins.size !== observations.length) {
    throw new Error('Ergo checkpoint source observations require distinct RPC origins');
  }
  const actualAdministrations = new Set(
    observations.map(observation => observation.administrationId),
  );
  if (actualAdministrations.size !== observations.length) {
    throw new Error(
      'Ergo checkpoint source observations require distinct administration identities',
    );
  }

  const verified = policy.sourceSet.sources.map(expected => {
    const observation = observationBySource.get(expected.sourceId);
    if (observation === undefined) {
      throw new Error(`Ergo checkpoint source observation ${expected.sourceId} is missing`);
    }
    if (
      observation.administrationId !== expected.administrationId
      || observation.rpcOrigin !== expected.rpcOrigin
    ) {
      throw new Error(
        `Ergo checkpoint source observation ${expected.sourceId} identity drifted`,
      );
    }
    if (observation.observedAtUnixMs > evaluatedAtUnixMs) {
      throw new Error(
        `Ergo checkpoint source observation ${expected.sourceId} is from the future`,
      );
    }
    if (
      evaluatedAtUnixMs - observation.observedAtUnixMs
        > policy.sourceSet.maximumObservationAgeMs
    ) {
      throw new Error(
        `Ergo checkpoint source observation ${expected.sourceId} is stale`,
      );
    }
    const relay = decodeErgoAutolykosV2RelayRuntimeWitnessV1(
      observation.relayWitnessBytes,
      policy.checkpoint.spvProfileIdHex,
    );
    const replay = replayErgoAutolykosV2RelayWitnessV1(relay);
    assertReplayMatchesPolicy(replay, policy);
    const selectedTip = replay.currentBranch.headers.at(-1);
    if (selectedTip === undefined) {
      throw new Error('Ergo checkpoint source observation has no selected branch tip');
    }
    const relayWitnessIdHex = deriveErgoAutolykosV2RelayRuntimeWitnessIdV1Hex(
      observation.relayWitnessBytes,
      policy.checkpoint.spvProfileIdHex,
    );
    return {
      observation,
      relayWitnessIdHex,
      targetHeaderIdHex: computeErgoHeaderId(replay.targetHeader).toString('hex'),
      selectedTipHeaderIdHex: selectedTip.headerId.toString('hex'),
      selectedTipHeight: selectedTip.header.height,
      selectedCumulativeWork: replay.currentBranch.cumulativeWork.toString(),
    };
  });
  const first = verified[0];
  if (first === undefined) {
    throw new Error('Ergo checkpoint source policy has no observations');
  }
  if (verified.some(observation => (
    observation.relayWitnessIdHex !== first.relayWitnessIdHex
    || observation.targetHeaderIdHex !== first.targetHeaderIdHex
    || observation.selectedTipHeaderIdHex !== first.selectedTipHeaderIdHex
    || observation.selectedTipHeight !== first.selectedTipHeight
    || observation.selectedCumulativeWork !== first.selectedCumulativeWork
  ))) {
    throw new Error('Ergo checkpoint source observations diverge');
  }

  const composition = buildErgoUtxoStateRuntimeBranchCompositionV1({
    retainedPacket: input.retainedPacket as Readonly<
      ErgoUtxoStateRuntimeWitnessRetainedPacketV1
    >,
    relayWitnessBytes: first.observation.relayWitnessBytes,
    expectedSpvProfileIdHex: policy.checkpoint.spvProfileIdHex,
  });
  assertErgoUtxoStateRuntimeBranchCompositionV1Provenance(composition);
  if (
    composition.suppliedBranch.checkpointHeaderIdHex
      !== policy.checkpoint.checkpointHeaderIdHex
    || composition.suppliedBranch.checkpointHeight
      !== policy.checkpoint.checkpointHeight
    || composition.suppliedBranch.targetHeaderIdHex !== first.targetHeaderIdHex
  ) {
    throw new Error('reviewed checkpoint composition drifted from its policy');
  }

  const normalizedObservations = verified.map(({ observation }) => {
    const identity = {
      sourceId: observation.sourceId,
      administrationId: observation.administrationId,
      rpcOriginDigestHex: sha256CanonicalJson(
        { rpcOrigin: observation.rpcOrigin },
        ERGO_CHECKPOINT_SOURCE_OBSERVATION_V1_DIGEST_DOMAIN,
      ),
      observedAtUnixMs: observation.observedAtUnixMs,
    };
    return {
      ...identity,
      observationDigestHex: sha256CanonicalJson(
        { ...identity, relayWitnessIdHex: first.relayWitnessIdHex },
        ERGO_CHECKPOINT_SOURCE_OBSERVATION_V1_DIGEST_DOMAIN,
      ),
    };
  });
  const sourceSetDigestHex = sha256CanonicalJson(
    policy.sourceSet,
    ERGO_CHECKPOINT_SOURCE_SET_V1_DIGEST_DOMAIN,
  );
  const body = {
    schema: ERGO_CHECKPOINT_SOURCE_ADMISSION_V1_SCHEMA,
    status: ERGO_CHECKPOINT_SOURCE_ADMISSION_V1_STATUS,
    policy: {
      policyDigestHex: policy.policyDigestHex,
      environment: policy.environment,
      policyId: policy.policyId,
      sourceNetworkIdHex: policy.checkpoint.sourceNetworkIdHex,
      spvProfileIdHex: policy.checkpoint.spvProfileIdHex,
      checkpointHeaderIdHex: policy.checkpoint.checkpointHeaderIdHex,
      checkpointHeight: policy.checkpoint.checkpointHeight,
      checkpointDifficultyContextDigestHex:
        policy.checkpoint.checkpointDifficultyContextDigestHex,
      sourceSetDigestHex,
    },
    sourceSet: {
      evaluatedAtUnixMs,
      maximumObservationAgeMs: policy.sourceSet.maximumObservationAgeMs,
      observationCount: normalizedObservations.length,
      convergedRelayWitnessIdHex: first.relayWitnessIdHex,
      selectedTipHeaderIdHex: first.selectedTipHeaderIdHex,
      selectedTipHeight: first.selectedTipHeight,
      selectedCumulativeWork: first.selectedCumulativeWork,
      observations: normalizedObservations,
    },
    retainedPacket: {
      packetDigestHex: composition.retainedPacket.packetDigestHex,
      targetHeaderIdHex: composition.suppliedBranch.targetHeaderIdHex,
      targetHeight: composition.suppliedBranch.targetHeight,
      confirmations: composition.suppliedBranch.confirmations,
      requiredConfirmations: composition.suppliedBranch.requiredConfirmations,
    },
    runtimeStatementV3: composition.runtimeStatementV3,
    checks: {
      reviewedStaticPolicySelected: true as const,
      exactCheckpointHeaderAndContextPinned: true as const,
      exactBoundedSourceSetSupplied: true as const,
      declaredAdministrationIdentitiesDistinct: true as const,
      observationsFreshRelativeToSuppliedEvaluationTime: true as const,
      exactRelayWitnessAgreement: true as const,
      retainedPacketAndV3CompositionReplayed: true as const,
    },
    authority: {
      checkpointPinnedByReviewedStaticPolicy: true as const,
      checkpointExternallyAuthenticated: false as const,
      suppliedSourceSetMetadataMatchedReviewedPolicy: true as const,
      observationSourceProvenanceEstablished: false as const,
      observationClockExternallyAuthenticated: false as const,
      sourceOperationalIndependenceEstablished: false as const,
      completeCompetingBranchKnowledgeEstablished: false as const,
      globallyCanonicalErgoConsensusAccepted: false as const,
      deterministicFinalityEstablished: false as const,
      currentUtxoMembershipEstablished: false as const,
      transactionExecutionValidated: false as const,
      runtimeAdmissionAuthorized: false as const,
      mintAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
    limitations: [
      'The checkpoint is pinned by exact membership in the source-reviewed static policy registry; it is not externally authenticated and does not prove current canonicality.',
      'Observation source IDs, origins, and administration IDs are caller-supplied metadata; matching the reviewed policy does not authenticate endpoint collection provenance.',
      'Distinct configured origins and administration identifiers do not prove independent operation or complete network observation.',
      'Freshness is evaluated against a supplied process clock and is not an authenticated wall-clock statement.',
      'Exact witness agreement covers only the bounded configured source set and is not deterministic finality or global branch completeness.',
      'The selected policy disables runtime and funds authority; no daemon, mint, signer, submitter, broadcaster, Gate 5, trustless, or readiness consumer exists.',
    ] as const,
  };
  const admission = deepFreeze({
    ...body,
    admissionDigestHex: sha256CanonicalJson(
      body,
      ERGO_CHECKPOINT_SOURCE_ADMISSION_V1_DIGEST_DOMAIN,
    ),
  });
  ADMISSIONS.add(admission);
  return admission;
}

export function assertErgoCheckpointSourceAdmissionV1Provenance(
  value: unknown,
): asserts value is Readonly<ErgoCheckpointSourceAdmissionV1> {
  if (typeof value !== 'object' || value === null || !ADMISSIONS.has(value)) {
    throw new Error('Ergo checkpoint source admission lacks process provenance');
  }
}

function normalizeErgoCheckpointSourcePolicyV1(
  value: unknown,
): Readonly<ErgoCheckpointSourcePolicyV1> {
  const raw = exactDataObject(value, [
    'schema',
    'environment',
    'policyId',
    'checkpoint',
    'sourceSet',
    'activation',
  ], 'Ergo checkpoint source policy');
  if (raw.schema !== ERGO_CHECKPOINT_SOURCE_POLICY_V1_SCHEMA) {
    throw new Error('Ergo checkpoint source policy schema is unsupported');
  }
  const checkpoint = exactDataObject(raw.checkpoint, [
    'sourceNetworkIdHex',
    'spvProfileIdHex',
    'checkpointHeaderIdHex',
    'checkpointHeight',
    'checkpointHeaderBytesHex',
    'checkpointDifficultyContextDigestHex',
    'checkpointCumulativeWork',
  ], 'Ergo checkpoint source policy checkpoint');
  const checkpointHeaderBytesHex = boundedLowerHex(
    checkpoint.checkpointHeaderBytesHex,
    MAX_HEADER_BYTES,
    'Ergo checkpoint header bytes',
  );
  const checkpointHeader = parseErgoAutolykosV2HeaderIdentity(
    Buffer.from(checkpointHeaderBytesHex, 'hex'),
  );
  const checkpointHeaderIdHex = exactLowerHex(
    checkpoint.checkpointHeaderIdHex,
    32,
    'Ergo checkpoint header ID',
  );
  if (computeErgoHeaderId(checkpointHeader).toString('hex') !== checkpointHeaderIdHex) {
    throw new Error('Ergo checkpoint header bytes do not match the pinned ID');
  }
  const checkpointHeight = unsignedSafeInteger(
    checkpoint.checkpointHeight,
    'Ergo checkpoint height',
  );
  if (checkpointHeader.height !== checkpointHeight) {
    throw new Error('Ergo checkpoint header bytes do not match the pinned height');
  }
  const sourceSet = exactDataObject(raw.sourceSet, [
    'maximumObservationAgeMs',
    'sources',
  ], 'Ergo checkpoint source-set policy');
  const sources = denseArray(
    sourceSet.sources,
    MAX_SOURCES,
    'Ergo checkpoint source-set entries',
  ).map((source, index) => {
    const entry = exactDataObject(source, [
      'sourceId',
      'administrationId',
      'rpcOrigin',
    ], `Ergo checkpoint source-set entry ${index}`);
    return {
      sourceId: boundedIdentifier(entry.sourceId, 'Ergo checkpoint source ID'),
      administrationId: boundedIdentifier(
        entry.administrationId,
        'Ergo checkpoint source administration ID',
      ),
      rpcOrigin: canonicalHttpsOrigin(
        entry.rpcOrigin,
        'Ergo checkpoint source RPC origin',
      ),
    };
  });
  if (sources.length < 2) {
    throw new Error('Ergo checkpoint source policy requires at least two sources');
  }
  if (sources.some((source, index) => (
    index > 0 && source.sourceId <= sources[index - 1]!.sourceId
  ))) {
    throw new Error('Ergo checkpoint source policy sources must be ordered by ID');
  }
  if (new Set(sources.map(source => source.rpcOrigin)).size !== sources.length) {
    throw new Error('Ergo checkpoint source policy requires distinct RPC origins');
  }
  if (
    new Set(sources.map(source => source.administrationId)).size
      !== sources.length
  ) {
    throw new Error(
      'Ergo checkpoint source policy requires distinct administration identities',
    );
  }
  const maximumObservationAgeMs = positiveSafeInteger(
    sourceSet.maximumObservationAgeMs,
    'Ergo checkpoint maximum observation age',
  );
  if (maximumObservationAgeMs > MAX_OBSERVATION_AGE_MS) {
    throw new Error('Ergo checkpoint maximum observation age exceeds its bound');
  }
  const activation = exactDataObject(raw.activation, [
    'runtimeAuthorityEnabled',
    'fundsAuthorityEnabled',
  ], 'Ergo checkpoint source policy activation');
  if (
    activation.runtimeAuthorityEnabled !== false
    || activation.fundsAuthorityEnabled !== false
  ) {
    throw new Error('Ergo checkpoint source policy must remain non-authorizing');
  }
  return deepFreeze({
    schema: ERGO_CHECKPOINT_SOURCE_POLICY_V1_SCHEMA,
    environment: boundedIdentifier(
      raw.environment,
      'Ergo checkpoint source policy environment',
    ),
    policyId: boundedIdentifier(raw.policyId, 'Ergo checkpoint source policy ID'),
    checkpoint: {
      sourceNetworkIdHex: exactLowerHex(
        checkpoint.sourceNetworkIdHex,
        32,
        'Ergo checkpoint source network ID',
      ),
      spvProfileIdHex: exactLowerHex(
        checkpoint.spvProfileIdHex,
        32,
        'Ergo checkpoint SPV profile ID',
      ),
      checkpointHeaderIdHex,
      checkpointHeight,
      checkpointHeaderBytesHex,
      checkpointDifficultyContextDigestHex: exactLowerHex(
        checkpoint.checkpointDifficultyContextDigestHex,
        32,
        'Ergo checkpoint difficulty-context digest',
      ),
      checkpointCumulativeWork: positiveUint256Decimal(
        checkpoint.checkpointCumulativeWork,
        'Ergo checkpoint cumulative work',
      ),
    },
    sourceSet: { maximumObservationAgeMs, sources },
    activation: {
      runtimeAuthorityEnabled: false as const,
      fundsAuthorityEnabled: false as const,
    },
  });
}

function normalizeObservation(value: unknown, label: string) {
  const raw = exactDataObject(value, [
    'sourceId',
    'administrationId',
    'rpcOrigin',
    'observedAtUnixMs',
    'relayWitnessBytes',
  ], label);
  return {
    sourceId: boundedIdentifier(raw.sourceId, `${label} source ID`),
    administrationId: boundedIdentifier(
      raw.administrationId,
      `${label} administration ID`,
    ),
    rpcOrigin: canonicalHttpsOrigin(raw.rpcOrigin, `${label} RPC origin`),
    observedAtUnixMs: unsignedSafeInteger(
      raw.observedAtUnixMs,
      `${label} observation time`,
    ),
    relayWitnessBytes: exactBytes(
      raw.relayWitnessBytes,
      ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_MAX_BYTES,
      `${label} relay witness`,
    ),
  };
}

function assertReplayMatchesPolicy(
  replay: ReturnType<typeof replayErgoAutolykosV2RelayWitnessV1>,
  policy: Readonly<ReviewedErgoCheckpointSourcePolicyV1>,
): void {
  const checkpointHeaderBytesHex = serializeErgoHeaderIdentity(
    replay.checkpoint.header,
  ).toString('hex');
  if (
    Buffer.from(replay.profile.sourceNetworkId).toString('hex')
      !== policy.checkpoint.sourceNetworkIdHex
    || computeErgoAutolykosV2SpvProfileId(replay.profile).toString('hex')
      !== policy.checkpoint.spvProfileIdHex
    || computeErgoHeaderId(replay.checkpoint.header).toString('hex')
      !== policy.checkpoint.checkpointHeaderIdHex
    || replay.checkpoint.header.height !== policy.checkpoint.checkpointHeight
    || checkpointHeaderBytesHex !== policy.checkpoint.checkpointHeaderBytesHex
    || computeErgoDifficultyContextDigest(
      replay.checkpoint.difficultyContext,
    ).toString('hex')
      !== policy.checkpoint.checkpointDifficultyContextDigestHex
    || replay.profile.checkpointCumulativeWork.toString()
      !== policy.checkpoint.checkpointCumulativeWork
  ) {
    throw new Error('Ergo checkpoint source observation does not match policy');
  }
}

function exactDataObject(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Object.getOwnPropertyNames(descriptors).sort();
  const expectedKeys = [...fields].sort();
  if (
    Object.getOwnPropertySymbols(value).length !== 0
    || actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`${label} must contain exactly ${fields.join(', ')}`);
  }
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = descriptors[field]!;
    if (!('value' in descriptor) || descriptor.enumerable !== true) {
      throw new Error(`${label}.${field} must be an enumerable data property`);
    }
    result[field] = descriptor.value;
  }
  return result;
}

function denseArray(value: unknown, maximum: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum) {
    throw new Error(`${label} length is outside its bound`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expectedNames = [
    ...Array.from({ length: value.length }, (_, index) => String(index)),
    'length',
  ].sort();
  const actualNames = Object.getOwnPropertyNames(descriptors).sort();
  if (
    Object.getOwnPropertySymbols(value).length !== 0
    || actualNames.length !== expectedNames.length
    || actualNames.some((name, index) => name !== expectedNames[index])
  ) {
    throw new Error(`${label} must be a dense data array`);
  }
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[String(index)]!;
    if (!('value' in descriptor) || descriptor.enumerable !== true) {
      throw new Error(`${label}[${index}] must be an enumerable data property`);
    }
    return descriptor.value;
  });
}

function exactBytes(value: unknown, maximum: number, label: string): Buffer {
  if (!(value instanceof Uint8Array)) throw new Error(`${label} must be bytes`);
  const bytes = Buffer.from(value);
  if (bytes.length === 0 || bytes.length > maximum) {
    throw new Error(`${label} length is outside its bound`);
  }
  return bytes;
}

function exactLowerHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length !== bytes * 2
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be canonical ${bytes}-byte lowercase hexadecimal`);
  }
  return value;
}

function boundedLowerHex(value: unknown, maximumBytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || value.length > maximumBytes * 2
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be bounded canonical lowercase hexadecimal`);
  }
  return value;
}

function boundedIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 128
    || !/^[a-z0-9][a-z0-9._-]*$/.test(value)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function canonicalHttpsOrigin(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} is invalid`);
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.pathname !== '/'
    || parsed.search !== ''
    || parsed.hash !== ''
    || parsed.origin !== value
  ) {
    throw new Error(`${label} must be a canonical credential-free HTTPS origin`);
  }
  return parsed.origin;
}

function unsignedSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be an unsigned safe integer`);
  }
  return value as number;
}

function positiveSafeInteger(value: unknown, label: string): number {
  const normalized = unsignedSafeInteger(value, label);
  if (normalized === 0) throw new Error(`${label} must be positive`);
  return normalized;
}

function positiveUint256Decimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a canonical positive decimal`);
  }
  const parsed = BigInt(value);
  if (parsed > MAX_U256) throw new Error(`${label} exceeds UInt256`);
  return value;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
