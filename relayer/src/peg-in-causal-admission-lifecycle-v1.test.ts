import { describe, expect, it } from 'vitest';

import {
  MAX_PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_EVENTS,
  appendPegInCausalAdmissionLifecycleEventV1,
  createPegInCausalAdmissionLifecycleJournalV1,
  createPegInCausalAdmissionProofReferenceV1,
  createPegInCausalAdmissionSecurityRegistryV1,
  projectPegInCausalAdmissionLifecycleAfterRestartV1,
  projectPegInCausalAdmissionLifecycleV1,
  type PegInCausalAdmissionLifecycleEventDraftV1,
  type PegInCausalAdmissionLifecycleJournalV1,
  type PegInCausalAdmissionObservationEventDraftV1,
  type PegInCausalAdmissionObservationKindV1,
  type PegInCausalAdmissionObservationSourceV1,
  type PegInCausalAdmissionProofEventDraftV1,
  type PegInCausalAdmissionProofReferenceV1,
} from './peg-in-causal-admission-lifecycle-v1.js';
import {
  PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
} from './peg-in-causal-source-proof-admission-v1.js';
import {
  createValidatedPegInCausalSourceProofResultV1Fixture,
  fixtureHash,
} from './peg-in-causal-source-proof-admission-v1.test-helper.js';

const registry = createPegInCausalAdmissionSecurityRegistryV1();

describe('peg-in causal admission lifecycle V1', () => {
  it('registers only the exact federated admission profile', () => {
    expect(registry.profiles).toEqual([{
      formatVersion: 1,
      action: 'admission',
      proofSystemIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
      proofProfileIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
    }]);
    expect(registry.boundary).toEqual({
      sourceOwnedStaticRegistry: true,
      runtimeRegistrationAllowed: false,
      activeProofProfileCount: 1,
      staticFederatedAdmissionProfileActive: true,
      invalidationOrConsumptionProfileActive: false,
    });
  });

  it('initializes each candidate once under a restart reproof hold', () => {
    const candidateIdHex = fixtureHash('lifecycle-initial');
    const journal = createPegInCausalAdmissionLifecycleJournalV1(candidateIdHex);
    const projected = project(journal);

    expect(journal.events).toHaveLength(1);
    expect(journal.events[0]).toMatchObject({
      sequence: 0,
      previousEventDigestHex: journal.genesisDigestHex,
      kind: 'observation',
      source: 'reconstruction',
      observation: 'restart_reproof_required',
    });
    expect(projected).toMatchObject({
      status: 'pending',
      observationHold: true,
      observationHoldReason: 'restart_reproof_required',
    });
    expect(() => createPegInCausalAdmissionLifecycleJournalV1(candidateIdHex))
      .toThrow(/already initialized/i);
  });

  it('advances only an exact process-branded admission proof across the restart hold', () => {
    const fixture = createValidatedPegInCausalSourceProofResultV1Fixture('lifecycle-admission');
    const proof = createPegInCausalAdmissionProofReferenceV1(fixture.result);
    const appended = append(
      createPegInCausalAdmissionLifecycleJournalV1(fixture.request.candidateIdHex),
      proofEvent(fixture.request.candidateIdHex, 'admit', proof),
      '1001',
    );

    expect(appended.projection).toMatchObject({
      status: 'admitted',
      proofReference: proof,
      observationHold: false,
      observationHoldReason: null,
      boundary: {
        staticFederatedAdmissionProfileActive: true,
        invalidationOrConsumptionProfileActive: false,
        proofReferenceIsFundsAuthority: false,
        mintAuthorized: false,
        daemonAdmissionAuthorized: false,
        reconciliationHoldReleaseAuthorized: false,
        signingAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        gate5Closed: false,
        productionReadinessVerified: false,
      },
    });
    expect(proof).toMatchObject({
      action: 'admission',
      candidateIdHex: fixture.request.candidateIdHex,
      proofResultIdHex: fixture.result.sourceProofResultIdHex,
      proofDigestHex: fixture.result.sourceProofDigestHex,
      validatedAtNativeHeight: '1001',
      expiresAtNativeHeight: '1064',
    });
    expect(() => createPegInCausalAdmissionProofReferenceV1({ ...fixture.result }))
      .toThrow(/process provenance is missing/i);
    expect(() => append(appended.journal, proofEvent(
      fixture.request.candidateIdHex,
      'cloned',
      { ...proof },
    ), '1001')).toThrow(/process provenance is missing/i);
  });

  it.each([
    'stale_anchor',
    'source_reorg',
    'checkpoint_conflict',
    'rpc_disagreement',
  ] as const)('never clears a %s hold with an otherwise valid admission proof', hold => {
    const fixture = createValidatedPegInCausalSourceProofResultV1Fixture(`lifecycle-hold-${hold}`);
    const proof = createPegInCausalAdmissionProofReferenceV1(fixture.result);
    const held = append(
      createPegInCausalAdmissionLifecycleJournalV1(fixture.request.candidateIdHex),
      observation(fixture.request.candidateIdHex, `hold-${hold}`, 'rpc', hold),
    );

    expect(held.projection.observationHoldReason).toBe(hold);
    expect(() => append(
      held.journal,
      proofEvent(fixture.request.candidateIdHex, `admit-${hold}`, proof),
      '1001',
    )).toThrow(/observation hold is active/i);
    expect(project(held.journal)).toMatchObject({
      status: 'pending',
      observationHold: true,
      observationHoldReason: hold,
      proofReference: null,
    });
  });

  it('requires current-height freshness when appending or projecting a proof', () => {
    const fixture = createValidatedPegInCausalSourceProofResultV1Fixture('lifecycle-expiry');
    const proof = createPegInCausalAdmissionProofReferenceV1(fixture.result);
    const journal = createPegInCausalAdmissionLifecycleJournalV1(fixture.request.candidateIdHex);
    const event = proofEvent(fixture.request.candidateIdHex, 'expiry', proof);

    expect(() => append(journal, event)).toThrow(/current native height/i);
    expect(() => append(journal, event, '1064')).toThrow(/not fresh/i);
    const admitted = append(journal, event, '1001');
    expect(admitted.projection.status).toBe('admitted');
    expect(() => project(admitted.journal)).toThrow(/current native height/i);
    expect(() => project(admitted.journal, '1064')).toThrow(/not fresh/i);
    expect(project(admitted.journal, '1063').status).toBe('admitted');
  });

  it('keeps SQLite and ordinary RPC observations non-authoritative', () => {
    const candidateIdHex = fixtureHash('lifecycle-observation-only');
    let journal = createPegInCausalAdmissionLifecycleJournalV1(candidateIdHex);
    for (const event of [
      observation(candidateIdHex, 'sqlite', 'sqlite', 'sqlite_recovery'),
      observation(candidateIdHex, 'observed', 'rpc', 'candidate_observed'),
    ]) {
      journal = append(journal, event).journal;
    }
    expect(project(journal)).toMatchObject({
      status: 'pending',
      proofReference: null,
      observationHold: true,
      observationHoldReason: 'restart_reproof_required',
      boundary: { rpcOrSqliteIsFundsAuthority: false },
    });
  });

  it('rejects caller-owned registries and complete but forged proof references', () => {
    const candidateIdHex = fixtureHash('lifecycle-forgery');
    const journal = createPegInCausalAdmissionLifecycleJournalV1(candidateIdHex);
    const forgedRegistry = { ...registry, profiles: [] };
    expect(() => projectPegInCausalAdmissionLifecycleV1({
      journal,
      registry: forgedRegistry as typeof registry,
    })).toThrow(/source-owned static registry/i);
    expect(() => append(journal, proofEvent(
      candidateIdHex,
      'forged',
      forgedProofReference(candidateIdHex),
    ))).toThrow(/process provenance is missing/i);
  });

  it('rejects serialized, truncated, reordered, and caller-mutated journals after restart', () => {
    const candidateIdHex = fixtureHash('lifecycle-restart');
    const first = append(
      createPegInCausalAdmissionLifecycleJournalV1(candidateIdHex),
      observation(candidateIdHex, 'first', 'rpc', 'candidate_observed'),
    );
    const second = append(
      first.journal,
      observation(candidateIdHex, 'second', 'rpc', 'source_reorg'),
    );
    const persisted = structuredClone(second.journal);
    const untrusted = [
      persisted,
      { ...persisted, events: persisted.events.slice(0, 1) },
      { ...persisted, events: [...persisted.events].reverse() },
      { ...persisted, headDigestHex: persisted.genesisDigestHex },
    ];
    for (const journal of untrusted) {
      expect(() => project(journal as PegInCausalAdmissionLifecycleJournalV1))
        .toThrow(/process provenance is missing/i);
    }
    expect(projectPegInCausalAdmissionLifecycleAfterRestartV1(candidateIdHex)).toMatchObject({
      status: 'pending',
      observationHold: true,
      observationHoldReason: 'restart_reproof_required',
      boundary: {
        processJournalProvenanceVerified: false,
        restartRequiresFreshProof: true,
      },
    });
  });

  it('preserves a single append-only head and idempotent exact event IDs', () => {
    const candidateIdHex = fixtureHash('lifecycle-linear');
    const initial = createPegInCausalAdmissionLifecycleJournalV1(candidateIdHex);
    const event = observation(candidateIdHex, 'event', 'rpc', 'candidate_observed');
    const appended = append(initial, event);
    const duplicate = append(appended.journal, event);

    expect(duplicate.appended).toBe(false);
    expect(duplicate.journal).toBe(appended.journal);
    expect(duplicate.projection.duplicateEventIdsHex).toEqual([event.eventIdHex]);
    expect(() => project(initial)).toThrow(/superseded/i);
    expect(() => append(appended.journal, { ...event, evidenceIdHex: fixtureHash('different') }))
      .toThrow(/conflicting contents/i);
  });

  it('rejects foreign candidates, malformed evidence, and journal overflow', () => {
    const candidateIdHex = fixtureHash('lifecycle-bounds');
    let journal = createPegInCausalAdmissionLifecycleJournalV1(candidateIdHex);
    expect(() => append(journal, {
      ...observation(candidateIdHex, 'foreign', 'rpc', 'candidate_observed'),
      candidateIdHex: fixtureHash('foreign-candidate'),
    })).toThrow(/different candidate/i);
    expect(() => append(journal, {
      ...observation(candidateIdHex, 'malformed', 'rpc', 'candidate_observed'),
      evidenceIdHex: '0x01',
    })).toThrow(/32-byte hash/i);

    for (let index = 0; index < MAX_PEG_IN_CAUSAL_ADMISSION_LIFECYCLE_EVENTS - 1; index += 1) {
      journal = append(
        journal,
        observation(candidateIdHex, `overflow-${index}`, 'rpc', 'candidate_observed'),
      ).journal;
    }
    expect(() => append(
      journal,
      observation(candidateIdHex, 'overflow-final', 'rpc', 'candidate_observed'),
    )).toThrow(/journal exceeds/i);
  });
});

function append(
  journal: PegInCausalAdmissionLifecycleJournalV1,
  event: PegInCausalAdmissionLifecycleEventDraftV1,
  currentNativeHeight?: string,
) {
  return appendPegInCausalAdmissionLifecycleEventV1({
    journal,
    event,
    registry,
    currentNativeHeight,
  });
}

function project(
  journal: PegInCausalAdmissionLifecycleJournalV1,
  currentNativeHeight?: string,
) {
  return projectPegInCausalAdmissionLifecycleV1({ journal, registry, currentNativeHeight });
}

function observation(
  candidateIdHex: string,
  eventLabel: string,
  source: PegInCausalAdmissionObservationSourceV1,
  kind: PegInCausalAdmissionObservationKindV1,
): PegInCausalAdmissionObservationEventDraftV1 {
  return {
    formatVersion: 1,
    eventIdHex: fixtureHash(`event-${eventLabel}`),
    candidateIdHex,
    kind: 'observation',
    source,
    observation: kind,
    evidenceIdHex: fixtureHash(`evidence-${eventLabel}`),
  };
}

function proofEvent(
  candidateIdHex: string,
  eventLabel: string,
  proof: PegInCausalAdmissionProofReferenceV1,
): PegInCausalAdmissionProofEventDraftV1 {
  return {
    formatVersion: 1,
    eventIdHex: fixtureHash(`event-${eventLabel}`),
    candidateIdHex,
    kind: 'proof',
    proof,
  };
}

function forgedProofReference(candidateIdHex: string): PegInCausalAdmissionProofReferenceV1 {
  return {
    formatVersion: 1,
    action: 'admission',
    candidateIdHex,
    proofSystemIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
    proofProfileIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
    proofResultIdHex: fixtureHash('forged-result'),
    proofDigestHex: fixtureHash('forged-proof'),
    requestDigestHex: fixtureHash('forged-request'),
    verifierExecutableSha256Hex: fixtureHash('forged-executable'),
    validatedAtNativeHeight: '1001',
    expiresAtNativeHeight: '1064',
  };
}
