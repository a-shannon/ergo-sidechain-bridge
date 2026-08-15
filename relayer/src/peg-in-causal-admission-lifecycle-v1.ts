import blakejs from 'blakejs';

import {
  PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
  assertPegInCausalSourceProofResultV1Provenance,
  type PegInCausalSourceProofResultV1,
} from './peg-in-causal-source-proof-admission-v1.js';

/**
 * Pure, non-authorizing projection for one causal peg-in candidate.
 *
 * The registry exposes one source-owned federated compatibility profile for
 * admission only. Observations remain deny-only, and no caller can manufacture
 * an admitted, invalidated, or consumed proof state.
 */

export const PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION = 1 as const;
export const MAX_PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_EVENTS = 256;

const JOURNAL_GENESIS_DOMAIN = 'E2S_PEG_IN_CAUSAL_LIFECYCLE_GENESIS_V1';
const JOURNAL_EVENT_DOMAIN = 'E2S_PEG_IN_CAUSAL_LIFECYCLE_EVENT_V1';
const JOURNAL_INITIAL_EVENT_ID_DOMAIN = 'E2S_PEG_IN_CAUSAL_LIFECYCLE_INITIAL_EVENT_ID_V1';
const JOURNAL_INITIAL_EVIDENCE_DOMAIN = 'E2S_PEG_IN_CAUSAL_LIFECYCLE_INITIAL_EVIDENCE_V1';
const JOURNALS = new WeakSet<object>();
const LATEST_JOURNALS = new Map<string, PegInCausalAdmissionLifecycleJournalV1>();
const PROOF_REFERENCES = new WeakSet<object>();

export type PegInCausalAdmissionLifecycleStatusV1 =
  | 'pending'
  | 'admitted'
  | 'invalidated'
  | 'consumed';

export type PegInCausalAdmissionObservationKindV1 =
  | 'candidate_observed'
  | 'stale_anchor'
  | 'source_reorg'
  | 'checkpoint_conflict'
  | 'rpc_disagreement'
  | 'sqlite_recovery'
  | 'restart_reproof_required';

export type PegInCausalAdmissionObservationSourceV1 =
  | 'rpc'
  | 'sqlite'
  | 'reconstruction';

export type PegInCausalAdmissionInvalidationReasonV1 =
  | 'stale_anchor'
  | 'source_reorg'
  | 'checkpoint_conflict';

export type PegInCausalAdmissionProofActionV1 =
  | 'admission'
  | 'invalidation'
  | 'consumption';

export interface PegInCausalAdmissionSecurityProfileV1 {
  readonly formatVersion: typeof PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION;
  readonly action: PegInCausalAdmissionProofActionV1;
  readonly proofSystemIdHex: string;
  readonly proofProfileIdHex: string;
}

export interface PegInCausalAdmissionSecurityRegistryV1 {
  readonly formatVersion: typeof PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION;
  readonly profiles: readonly PegInCausalAdmissionSecurityProfileV1[];
  readonly boundary: Readonly<{
    sourceOwnedStaticRegistry: true;
    runtimeRegistrationAllowed: false;
    activeProofProfileCount: 1;
    staticFederatedAdmissionProfileActive: true;
    invalidationOrConsumptionProfileActive: false;
  }>;
}

/**
 * Opaque proof reference. Its only public constructor consumes an exact
 * process-branded source-proof verifier result.
 */
export interface PegInCausalAdmissionProofReferenceV1 {
  readonly formatVersion: typeof PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION;
  readonly action: PegInCausalAdmissionProofActionV1;
  readonly candidateIdHex: string;
  readonly proofSystemIdHex: string;
  readonly proofProfileIdHex: string;
  readonly proofResultIdHex: string;
  readonly proofDigestHex: string;
  readonly requestDigestHex: string;
  readonly verifierExecutableSha256Hex: string;
  readonly validatedAtNativeHeight: string;
  readonly expiresAtNativeHeight: string;
}

interface PegInCausalAdmissionLifecycleEventBaseV1 {
  readonly formatVersion: typeof PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION;
  readonly sequence: number;
  readonly previousEventDigestHex: string;
  readonly eventDigestHex: string;
  readonly eventIdHex: string;
  readonly candidateIdHex: string;
}

export interface PegInCausalAdmissionObservationEventV1
  extends PegInCausalAdmissionLifecycleEventBaseV1 {
  readonly kind: 'observation';
  readonly source: PegInCausalAdmissionObservationSourceV1;
  readonly observation: PegInCausalAdmissionObservationKindV1;
  readonly evidenceIdHex: string;
}

export interface PegInCausalAdmissionProofEventV1
  extends PegInCausalAdmissionLifecycleEventBaseV1 {
  readonly kind: 'proof';
  readonly proof: PegInCausalAdmissionProofReferenceV1;
  readonly invalidationReason?: PegInCausalAdmissionInvalidationReasonV1;
}

export type PegInCausalAdmissionLifecycleEventV1 =
  | PegInCausalAdmissionObservationEventV1
  | PegInCausalAdmissionProofEventV1;

export interface PegInCausalAdmissionObservationEventDraftV1 {
  readonly formatVersion: typeof PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION;
  readonly eventIdHex: string;
  readonly candidateIdHex: string;
  readonly kind: 'observation';
  readonly source: PegInCausalAdmissionObservationSourceV1;
  readonly observation: PegInCausalAdmissionObservationKindV1;
  readonly evidenceIdHex: string;
}

export interface PegInCausalAdmissionProofEventDraftV1 {
  readonly formatVersion: typeof PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION;
  readonly eventIdHex: string;
  readonly candidateIdHex: string;
  readonly kind: 'proof';
  readonly proof: PegInCausalAdmissionProofReferenceV1;
  readonly invalidationReason?: PegInCausalAdmissionInvalidationReasonV1;
}

export type PegInCausalAdmissionLifecycleEventDraftV1 =
  | PegInCausalAdmissionObservationEventDraftV1
  | PegInCausalAdmissionProofEventDraftV1;

export interface PegInCausalAdmissionLifecycleJournalV1 {
  readonly formatVersion: typeof PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION;
  readonly candidateIdHex: string;
  readonly genesisDigestHex: string;
  readonly headDigestHex: string;
  readonly events: readonly PegInCausalAdmissionLifecycleEventV1[];
}

export interface PegInCausalAdmissionLifecycleProjectionV1 {
  readonly formatVersion: typeof PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION;
  readonly candidateIdHex: string;
  readonly status: PegInCausalAdmissionLifecycleStatusV1;
  readonly proofReference: PegInCausalAdmissionProofReferenceV1 | null;
  readonly invalidationReason: PegInCausalAdmissionInvalidationReasonV1 | null;
  readonly observationHold: boolean;
  readonly observationHoldReason: PegInCausalAdmissionObservationKindV1 | null;
  readonly consumedIncident: boolean;
  readonly journalHeadDigestHex: string | null;
  readonly journalEventCount: number;
  readonly observations: readonly PegInCausalAdmissionObservationEventV1[];
  readonly acceptedEventIdsHex: readonly string[];
  readonly duplicateEventIdsHex: readonly string[];
  readonly boundary: Readonly<{
    lifecycleCandidateOnly: true;
    processJournalProvenanceVerified: boolean;
    restartRequiresFreshProof: true;
    staticFederatedAdmissionProfileActive: true;
    invalidationOrConsumptionProfileActive: false;
    proofReferenceIsFundsAuthority: false;
    rpcOrSqliteIsFundsAuthority: false;
    mintAuthorized: false;
    daemonAdmissionAuthorized: false;
    reconciliationHoldReleaseAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
    productionReadinessVerified: false;
  }>;
}

export interface AppendPegInCausalAdmissionLifecycleEventV1Result {
  readonly journal: PegInCausalAdmissionLifecycleJournalV1;
  readonly projection: PegInCausalAdmissionLifecycleProjectionV1;
  readonly appended: boolean;
}

const SECURITY_REGISTRY = deepFreeze({
  formatVersion: PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION,
  profiles: [{
    formatVersion: PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION,
    action: 'admission' as const,
    proofSystemIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
    proofProfileIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  }] as const,
  boundary: {
    sourceOwnedStaticRegistry: true as const,
    runtimeRegistrationAllowed: false as const,
    activeProofProfileCount: 1 as const,
    staticFederatedAdmissionProfileActive: true as const,
    invalidationOrConsumptionProfileActive: false as const,
  },
});

/** Return the immutable source-owned admission-only security registry. */
export function createPegInCausalAdmissionSecurityRegistryV1():
PegInCausalAdmissionSecurityRegistryV1 {
  return SECURITY_REGISTRY;
}

/**
 * Convert one exact same-process source-proof validation into a lifecycle
 * reference. The reference remains non-authorizing outside this local
 * projection and cannot be reconstructed from serialized fields.
 */
export function createPegInCausalAdmissionProofReferenceV1(
  result: PegInCausalSourceProofResultV1,
): PegInCausalAdmissionProofReferenceV1 {
  assertPegInCausalSourceProofResultV1Provenance(result);
  const reference = deepFreeze({
    formatVersion: PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION,
    action: 'admission' as const,
    candidateIdHex: result.candidateIdHex,
    proofSystemIdHex: result.proofSystemIdHex,
    proofProfileIdHex: result.proofProfileIdHex,
    proofResultIdHex: result.sourceProofResultIdHex,
    proofDigestHex: result.sourceProofDigestHex,
    requestDigestHex: result.requestDigestHex,
    verifierExecutableSha256Hex: result.verifierExecutableSha256Hex,
    validatedAtNativeHeight: result.validatedAtNativeHeight,
    expiresAtNativeHeight: result.expiresAtNativeHeight,
  });
  PROOF_REFERENCES.add(reference);
  return reference;
}

/** Create one same-process deny-only journal bound to one candidate. */
export function createPegInCausalAdmissionLifecycleJournalV1(
  candidateIdHex: string,
): PegInCausalAdmissionLifecycleJournalV1 {
  const candidate = canonicalHash(candidateIdHex, 'candidate ID');
  if (LATEST_JOURNALS.has(candidate)) {
    throw new Error('peg-in causal admission journal is already initialized for the candidate');
  }
  const genesisDigestHex = digestFields(JOURNAL_GENESIS_DOMAIN, [candidate]);
  const initialEventWithoutDigest = {
    formatVersion: PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION,
    sequence: 0,
    previousEventDigestHex: genesisDigestHex,
    eventIdHex: digestFields(JOURNAL_INITIAL_EVENT_ID_DOMAIN, [candidate]),
    candidateIdHex: candidate,
    kind: 'observation' as const,
    source: 'reconstruction' as const,
    observation: 'restart_reproof_required' as const,
    evidenceIdHex: digestFields(JOURNAL_INITIAL_EVIDENCE_DOMAIN, [candidate]),
  };
  const initialEvent = deepFreeze({
    ...initialEventWithoutDigest,
    eventDigestHex: deriveEventDigest(initialEventWithoutDigest),
  });
  const journal = brandJournal({
    formatVersion: PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION,
    candidateIdHex: candidate,
    genesisDigestHex,
    headDigestHex: initialEvent.eventDigestHex,
    events: [initialEvent],
  });
  LATEST_JOURNALS.set(candidate, journal);
  return journal;
}

/**
 * Project only a same-process immutable journal. Persisted or cloned journals
 * are deliberately rejected; restart must recollect and re-prove authority.
 */
export function projectPegInCausalAdmissionLifecycleV1(input: {
  readonly journal: PegInCausalAdmissionLifecycleJournalV1;
  readonly registry?: PegInCausalAdmissionSecurityRegistryV1;
  readonly currentNativeHeight?: string | number | bigint;
}): PegInCausalAdmissionLifecycleProjectionV1 {
  const registry = input.registry ?? SECURITY_REGISTRY;
  assertRegistry(registry);
  assertJournalProvenance(input.journal);
  const candidateIdHex = canonicalHash(input.journal.candidateIdHex, 'candidate ID');
  const expectedGenesis = digestFields(JOURNAL_GENESIS_DOMAIN, [candidateIdHex]);
  if (input.journal.genesisDigestHex !== expectedGenesis) {
    throw new Error('peg-in causal admission journal genesis differs from the candidate');
  }
  if (input.journal.events.length > MAX_PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_EVENTS) {
    throw new Error(
      `peg-in causal admission lifecycle journal exceeds ${MAX_PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_EVENTS} events`,
    );
  }

  let expectedPreviousDigestHex = expectedGenesis;
  let status: PegInCausalAdmissionLifecycleStatusV1 = 'pending';
  let proofReference: PegInCausalAdmissionProofReferenceV1 | null = null;
  let invalidationReason: PegInCausalAdmissionInvalidationReasonV1 | null = null;
  let observationHold = false;
  let observationHoldReason: PegInCausalAdmissionObservationKindV1 | null = null;
  let consumedIncident = false;
  const currentNativeHeight = input.currentNativeHeight === undefined
    ? null
    : uint64(input.currentNativeHeight, 'current native height');
  const observations: PegInCausalAdmissionObservationEventV1[] = [];
  const acceptedEventIdsHex: string[] = [];

  for (const [sequence, event] of input.journal.events.entries()) {
    const normalized = normalizeStoredEvent(event, candidateIdHex);
    if (normalized.sequence !== sequence) {
      throw new Error('peg-in causal admission journal sequence is not contiguous');
    }
    if (normalized.previousEventDigestHex !== expectedPreviousDigestHex) {
      throw new Error('peg-in causal admission journal hash chain is broken');
    }
    const expectedDigestHex = deriveEventDigest(normalized);
    if (normalized.eventDigestHex !== expectedDigestHex) {
      throw new Error('peg-in causal admission journal event digest is invalid');
    }
    expectedPreviousDigestHex = expectedDigestHex;
    acceptedEventIdsHex.push(normalized.eventIdHex);

    if (normalized.kind === 'observation') {
      observations.push(normalized);
      if (isDenyOnlyObservation(normalized.observation)) {
        if (status === 'consumed') {
          consumedIncident = true;
        } else if (status !== 'invalidated') {
          observationHold = true;
          observationHoldReason = normalized.observation;
        }
      }
      continue;
    }

    assertProofReferenceProvenance(normalized.proof);
    assertRegisteredProof(normalized.proof, registry);
    if (currentNativeHeight === null) {
      throw new Error('peg-in causal admission proof projection requires the current native height');
    }
    const validatedAtNativeHeight = canonicalUint64(
      normalized.proof.validatedAtNativeHeight,
      'proof validation height',
    );
    const expiresAtNativeHeight = canonicalUint64(
      normalized.proof.expiresAtNativeHeight,
      'proof expiry height',
    );
    if (
      currentNativeHeight < validatedAtNativeHeight
      || currentNativeHeight >= expiresAtNativeHeight
    ) {
      throw new Error('peg-in causal admission proof is not fresh at the current native height');
    }
    if (proofReference !== null && proofProfileKey(proofReference) !== proofProfileKey(normalized.proof)) {
      throw new Error('peg-in causal admission lifecycle proof profile changed mid-candidate');
    }
    if (normalized.proof.action === 'admission') {
      if (normalized.invalidationReason !== undefined) {
        throw new Error('peg-in causal admission proof event has an unexpected invalidation reason');
      }
      if (observationHold) {
        if (observationHoldReason !== 'restart_reproof_required') {
          throw new Error('peg-in causal admission cannot be admitted while an observation hold is active');
        }
        observationHold = false;
        observationHoldReason = null;
      }
      if (status !== 'pending') {
        throw new Error(`peg-in causal admission cannot be admitted from ${status}`);
      }
      status = 'admitted';
    } else if (normalized.proof.action === 'invalidation') {
      if (normalized.invalidationReason === undefined) {
        throw new Error('peg-in causal admission invalidation proof requires an exact reason');
      }
      if (status === 'consumed') {
        throw new Error('peg-in causal admission cannot be invalidated after consumption');
      }
      if (status === 'invalidated') {
        throw new Error('peg-in causal admission is already invalidated');
      }
      status = 'invalidated';
      invalidationReason = normalized.invalidationReason;
      observationHold = false;
      observationHoldReason = null;
    } else {
      if (normalized.invalidationReason !== undefined) {
        throw new Error('peg-in causal admission consumption proof has an invalidation reason');
      }
      if (observationHold) {
        throw new Error('peg-in causal admission cannot be consumed while an observation hold is active');
      }
      if (status !== 'admitted') {
        throw new Error(`peg-in causal admission cannot be consumed from ${status}`);
      }
      status = 'consumed';
    }
    proofReference = normalized.proof;
  }

  if (input.journal.headDigestHex !== expectedPreviousDigestHex) {
    throw new Error('peg-in causal admission journal head does not match the complete event chain');
  }
  return projection({
    candidateIdHex,
    status,
    proofReference,
    invalidationReason,
    observationHold,
    observationHoldReason,
    consumedIncident,
    journalHeadDigestHex: input.journal.headDigestHex,
    journalEventCount: input.journal.events.length,
    observations,
    acceptedEventIdsHex,
    duplicateEventIdsHex: [],
    processJournalProvenanceVerified: true,
  });
}

/**
 * Fail-closed restart projection. Serialized local history is diagnostic only;
 * it cannot restore an admission, consumption, or cleared hold.
 */
export function projectPegInCausalAdmissionLifecycleAfterRestartV1(
  candidateIdHex: string,
): PegInCausalAdmissionLifecycleProjectionV1 {
  return projection({
    candidateIdHex: canonicalHash(candidateIdHex, 'candidate ID'),
    status: 'pending',
    proofReference: null,
    invalidationReason: null,
    observationHold: true,
    observationHoldReason: 'restart_reproof_required',
    consumedIncident: false,
    journalHeadDigestHex: null,
    journalEventCount: 0,
    observations: [],
    acceptedEventIdsHex: [],
    duplicateEventIdsHex: [],
    processJournalProvenanceVerified: false,
  });
}

export function appendPegInCausalAdmissionLifecycleEventV1(input: {
  readonly journal: PegInCausalAdmissionLifecycleJournalV1;
  readonly event: PegInCausalAdmissionLifecycleEventDraftV1;
  readonly registry?: PegInCausalAdmissionSecurityRegistryV1;
  readonly currentNativeHeight?: string | number | bigint;
}): AppendPegInCausalAdmissionLifecycleEventV1Result {
  const registry = input.registry ?? SECURITY_REGISTRY;
  assertRegistry(registry);
  assertJournalProvenance(input.journal);
  const candidateIdHex = canonicalHash(input.journal.candidateIdHex, 'candidate ID');
  const draft = normalizeDraft(input.event, candidateIdHex);
  const existing = input.journal.events.find(event => event.eventIdHex === draft.eventIdHex);
  if (existing !== undefined) {
    if (eventSemanticFingerprint(existing) !== eventSemanticFingerprint(draft)) {
      throw new Error('peg-in causal admission lifecycle event ID has conflicting contents');
    }
    const current = projectPegInCausalAdmissionLifecycleV1({
      journal: input.journal,
      registry,
      currentNativeHeight: input.currentNativeHeight,
    });
    return deepFreeze({
      journal: input.journal,
      projection: { ...current, duplicateEventIdsHex: [draft.eventIdHex] },
      appended: false,
    });
  }
  if (input.journal.events.length >= MAX_PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_EVENTS) {
    throw new Error(
      `peg-in causal admission lifecycle journal exceeds ${MAX_PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_EVENTS} events`,
    );
  }
  if (draft.kind === 'proof') {
    assertProofReferenceProvenance(draft.proof);
    assertRegisteredProof(draft.proof, registry);
  }
  const eventWithoutDigest = {
    ...draft,
    sequence: input.journal.events.length,
    previousEventDigestHex: input.journal.headDigestHex,
  };
  const event = deepFreeze({
    ...eventWithoutDigest,
    eventDigestHex: deriveEventDigest(eventWithoutDigest),
  }) as PegInCausalAdmissionLifecycleEventV1;
  const journal = brandJournal({
    formatVersion: PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION,
    candidateIdHex,
    genesisDigestHex: input.journal.genesisDigestHex,
    headDigestHex: event.eventDigestHex,
    events: [...input.journal.events, event],
  });
  LATEST_JOURNALS.set(candidateIdHex, journal);
  try {
    return deepFreeze({
      journal,
      projection: projectPegInCausalAdmissionLifecycleV1({
        journal,
        registry,
        currentNativeHeight: input.currentNativeHeight,
      }),
      appended: true,
    });
  } catch (error) {
    LATEST_JOURNALS.set(candidateIdHex, input.journal);
    throw error;
  }
}

function brandJournal(
  value: PegInCausalAdmissionLifecycleJournalV1,
): PegInCausalAdmissionLifecycleJournalV1 {
  const journal = deepFreeze(value);
  JOURNALS.add(journal);
  return journal;
}

function assertJournalProvenance(value: unknown): asserts value is PegInCausalAdmissionLifecycleJournalV1 {
  if (!value || typeof value !== 'object' || !JOURNALS.has(value)) {
    throw new Error('peg-in causal admission journal process provenance is missing');
  }
  const journal = value as PegInCausalAdmissionLifecycleJournalV1;
  if (LATEST_JOURNALS.get(journal.candidateIdHex) !== journal) {
    throw new Error('peg-in causal admission journal head has been superseded');
  }
}

function assertProofReferenceProvenance(
  value: unknown,
): asserts value is PegInCausalAdmissionProofReferenceV1 {
  if (!value || typeof value !== 'object' || !PROOF_REFERENCES.has(value)) {
    throw new Error('peg-in causal admission proof result process provenance is missing');
  }
}

function assertRegistry(registry: PegInCausalAdmissionSecurityRegistryV1): void {
  if (registry !== SECURITY_REGISTRY) {
    throw new Error('peg-in causal admission security registry is not the source-owned static registry');
  }
}

function assertRegisteredProof(
  proof: PegInCausalAdmissionProofReferenceV1,
  registry: PegInCausalAdmissionSecurityRegistryV1,
): void {
  const registered = registry.profiles.some(profile =>
    profile.action === proof.action && proofProfileKey(profile) === proofProfileKey(proof));
  if (!registered) {
    throw new Error('peg-in causal admission proof result uses an inactive security profile');
  }
}

function normalizeDraft(
  event: PegInCausalAdmissionLifecycleEventDraftV1,
  expectedCandidateIdHex: string,
): PegInCausalAdmissionLifecycleEventDraftV1 {
  assertFormatVersion(event.formatVersion, 'lifecycle event');
  const eventIdHex = canonicalHash(event.eventIdHex, 'lifecycle event ID');
  const candidateIdHex = canonicalHash(event.candidateIdHex, 'event candidate ID');
  if (candidateIdHex !== expectedCandidateIdHex) {
    throw new Error('peg-in causal admission lifecycle event targets a different candidate');
  }
  if (event.kind === 'observation') {
    if (!isObservationSource(event.source) || !isObservationKind(event.observation)) {
      throw new Error('peg-in causal admission observation is unsupported');
    }
    return deepFreeze({
      formatVersion: PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION,
      eventIdHex,
      candidateIdHex,
      kind: 'observation',
      source: event.source,
      observation: event.observation,
      evidenceIdHex: canonicalHash(event.evidenceIdHex, 'observation evidence ID'),
    });
  }
  const proof = normalizeProofReference(event.proof, candidateIdHex);
  if (
    event.invalidationReason !== undefined
    && !isInvalidationReason(event.invalidationReason)
  ) {
    throw new Error('peg-in causal admission invalidation reason is unsupported');
  }
  return deepFreeze({
    formatVersion: PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION,
    eventIdHex,
    candidateIdHex,
    kind: 'proof',
    proof,
    ...(event.invalidationReason === undefined
      ? {}
      : { invalidationReason: event.invalidationReason }),
  });
}

function normalizeStoredEvent(
  event: PegInCausalAdmissionLifecycleEventV1,
  expectedCandidateIdHex: string,
): PegInCausalAdmissionLifecycleEventV1 {
  const draft = normalizeDraft(event, expectedCandidateIdHex);
  return deepFreeze({
    ...draft,
    sequence: boundedSequence(event.sequence),
    previousEventDigestHex: canonicalDigest(event.previousEventDigestHex, 'previous event digest'),
    eventDigestHex: canonicalDigest(event.eventDigestHex, 'event digest'),
  }) as PegInCausalAdmissionLifecycleEventV1;
}

function normalizeProofReference(
  proof: PegInCausalAdmissionProofReferenceV1,
  expectedCandidateIdHex: string,
): PegInCausalAdmissionProofReferenceV1 {
  assertProofReferenceProvenance(proof);
  exactRecord(proof, [
    'action', 'candidateIdHex', 'expiresAtNativeHeight', 'formatVersion',
    'proofDigestHex', 'proofProfileIdHex', 'proofResultIdHex', 'proofSystemIdHex',
    'requestDigestHex', 'validatedAtNativeHeight', 'verifierExecutableSha256Hex',
  ], 'peg-in causal admission proof reference');
  assertFormatVersion(proof.formatVersion, 'proof reference');
  if (!isProofAction(proof.action)) {
    throw new Error('peg-in causal admission proof action is unsupported');
  }
  const candidateIdHex = canonicalHash(proof.candidateIdHex, 'proof candidate ID');
  if (candidateIdHex !== expectedCandidateIdHex) {
    throw new Error('peg-in causal admission proof result targets a different candidate');
  }
  canonicalHash(proof.proofSystemIdHex, 'proof-system ID');
  canonicalHash(proof.proofProfileIdHex, 'proof-profile ID');
  canonicalHash(proof.proofResultIdHex, 'proof result ID');
  canonicalHash(proof.proofDigestHex, 'proof digest');
  canonicalHash(proof.requestDigestHex, 'proof request digest');
  canonicalHash(proof.verifierExecutableSha256Hex, 'verifier executable SHA-256');
  const validatedAtNativeHeight = canonicalUint64(
    proof.validatedAtNativeHeight,
    'proof validation height',
  );
  const expiresAtNativeHeight = canonicalUint64(
    proof.expiresAtNativeHeight,
    'proof expiry height',
  );
  if (validatedAtNativeHeight >= expiresAtNativeHeight) {
    throw new Error('peg-in causal admission proof reference is expired');
  }
  return proof;
}

function deriveEventDigest(input: Omit<PegInCausalAdmissionLifecycleEventV1, 'eventDigestHex'>): string {
  return digestFields(JOURNAL_EVENT_DOMAIN, [
    eventSemanticFingerprint(input as unknown as PegInCausalAdmissionLifecycleEventDraftV1),
    String(input.sequence),
    input.previousEventDigestHex,
  ]);
}

function eventSemanticFingerprint(
  event: PegInCausalAdmissionLifecycleEventDraftV1 | PegInCausalAdmissionLifecycleEventV1,
): string {
  if (event.kind === 'observation') {
    return JSON.stringify([
      event.formatVersion,
      event.eventIdHex,
      event.candidateIdHex,
      event.kind,
      event.source,
      event.observation,
      event.evidenceIdHex,
    ]);
  }
  return JSON.stringify([
    event.formatVersion,
    event.eventIdHex,
    event.candidateIdHex,
    event.kind,
    event.proof.action,
    event.proof.candidateIdHex,
    event.proof.proofSystemIdHex,
    event.proof.proofProfileIdHex,
    event.proof.proofResultIdHex,
    event.proof.proofDigestHex,
    event.proof.requestDigestHex,
    event.proof.verifierExecutableSha256Hex,
    event.proof.validatedAtNativeHeight,
    event.proof.expiresAtNativeHeight,
    event.invalidationReason ?? null,
  ]);
}

function projection(input: Omit<PegInCausalAdmissionLifecycleProjectionV1, 'formatVersion' | 'boundary'> & {
  readonly processJournalProvenanceVerified: boolean;
}): PegInCausalAdmissionLifecycleProjectionV1 {
  const { processJournalProvenanceVerified, ...fields } = input;
  return deepFreeze({
    formatVersion: PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION,
    ...fields,
    boundary: {
      lifecycleCandidateOnly: true as const,
      processJournalProvenanceVerified,
      restartRequiresFreshProof: true as const,
      staticFederatedAdmissionProfileActive: true as const,
      invalidationOrConsumptionProfileActive: false as const,
      proofReferenceIsFundsAuthority: false as const,
      rpcOrSqliteIsFundsAuthority: false as const,
      mintAuthorized: false as const,
      daemonAdmissionAuthorized: false as const,
      reconciliationHoldReleaseAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      transactionMutationEnabled: false as const,
      gate5Closed: false as const,
      productionReadinessVerified: false as const,
    },
  });
}

function digestFields(domain: string, fields: readonly string[]): string {
  const bytes = Buffer.from(JSON.stringify([domain, ...fields]), 'utf8');
  return `0x${Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex')}`;
}

function canonicalHash(value: string, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value) || /^0x0{64}$/.test(value)) {
    throw new Error(`${label} must be a non-zero lowercase 0x-prefixed 32-byte hash`);
  }
  return value;
}

function canonicalDigest(value: string, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase 0x-prefixed 32-byte digest`);
  }
  return value;
}

function canonicalUint64(value: string, label: string): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical unsigned decimal integer`);
  }
  const parsed = BigInt(value);
  if (parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} exceeds uint64`);
  }
  return parsed;
}

function uint64(value: unknown, label: string): bigint {
  let parsed: bigint;
  try {
    parsed = typeof value === 'bigint' ? value : BigInt(value as string | number);
  } catch {
    throw new Error(`${label} must be an unsigned 64-bit integer`);
  }
  if (parsed < 0n || parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must be an unsigned 64-bit integer`);
  }
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || BigInt(value) !== parsed)) {
    throw new Error(`${label} must be an exact unsigned 64-bit integer`);
  }
  return parsed;
}

function exactRecord(value: object, fields: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
    throw new Error(`${label} has an unexpected field set`);
  }
}

function boundedSequence(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= MAX_PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_EVENTS) {
    throw new Error('peg-in causal admission journal sequence is out of bounds');
  }
  return value;
}

function assertFormatVersion(value: number, label: string): void {
  if (value !== PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_FORMAT_VERSION) {
    throw new Error(`${label} has an unsupported format version`);
  }
}

function proofProfileKey(input: {
  readonly action: PegInCausalAdmissionProofActionV1;
  readonly proofSystemIdHex: string;
  readonly proofProfileIdHex: string;
}): string {
  return `${input.action}:${input.proofSystemIdHex}:${input.proofProfileIdHex}`;
}

function isProofAction(value: string): value is PegInCausalAdmissionProofActionV1 {
  return ['admission', 'invalidation', 'consumption'].includes(value);
}

function isObservationKind(value: string): value is PegInCausalAdmissionObservationKindV1 {
  return [
    'candidate_observed',
    'stale_anchor',
    'source_reorg',
    'checkpoint_conflict',
    'rpc_disagreement',
    'sqlite_recovery',
    'restart_reproof_required',
  ].includes(value);
}

function isObservationSource(value: string): value is PegInCausalAdmissionObservationSourceV1 {
  return ['rpc', 'sqlite', 'reconstruction'].includes(value);
}

function isInvalidationReason(value: string): value is PegInCausalAdmissionInvalidationReasonV1 {
  return ['stale_anchor', 'source_reorg', 'checkpoint_conflict'].includes(value);
}

function isDenyOnlyObservation(value: PegInCausalAdmissionObservationKindV1): boolean {
  return [
    'stale_anchor',
    'source_reorg',
    'checkpoint_conflict',
    'rpc_disagreement',
    'restart_reproof_required',
  ].includes(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
