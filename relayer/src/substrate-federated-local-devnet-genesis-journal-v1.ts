import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  assertNoDuplicateJsonKeys,
  canonicalJson,
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
  assertSubstrateFederatedLocalDevnetGenesisDurableAttemptV1,
  assertSubstrateFederatedLocalDevnetGenesisTransportCandidateV1,
  deriveSubstrateFederatedLocalDevnetGenesisAdmissionDigestV1,
  normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1,
  type SubstrateFederatedLocalDevnetGenesisConfirmation,
  type SubstrateFederatedLocalDevnetGenesisExecutionPorts,
  type SubstrateFederatedLocalDevnetGenesisSubmission,
  type SubstrateFederatedLocalDevnetGenesisTransportCandidate,
} from './relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import {
  ERGO_OPERATIONAL_DEFINITIVE_TRANSPORT_REJECTION_REASON,
  type ErgoOperationalTransactionAttempt,
  type StateTracker,
} from './state-tracker.js';
import {
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1,
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1,
  type SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1,
} from './substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';

export const SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_JOURNAL_V1_SCHEMA =
  'e2s.substrate-federated-local-devnet-genesis-journal.v1' as const;

const MARKER_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_ATTEMPT_MARKER_V1';
const MARKER_SUFFIX = '.json';
const MAX_MARKER_BYTES = 32 * 1024;

type GenesisJournalPort =
  SubstrateFederatedLocalDevnetGenesisExecutionPorts['journal'];
type GenesisConfirmationObserver =
  SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1;

export interface SubstrateFederatedLocalDevnetGenesisJournalStateV1 {
  reserveErgoOperationalTransactionAttempt:
    StateTracker['reserveErgoOperationalTransactionAttempt'];
  getErgoOperationalTransactionAttempts:
    StateTracker['getErgoOperationalTransactionAttempts'];
  getActiveErgoOperationalTransactionAttempts:
    StateTracker['getActiveErgoOperationalTransactionAttempts'];
  getConfirmedErgoOperationalTransactionAttempts:
    StateTracker['getConfirmedErgoOperationalTransactionAttempts'];
  finalizeErgoOperationalTransactionAttempt:
    StateTracker['finalizeErgoOperationalTransactionAttempt'];
  rejectErgoOperationalTransactionAttempt:
    StateTracker['rejectErgoOperationalTransactionAttempt'];
  confirmErgoOperationalTransactionAttempt:
    StateTracker['confirmErgoOperationalTransactionAttempt'];
  rebindConfirmedErgoOperationalTransactionAttempt:
    StateTracker['rebindConfirmedErgoOperationalTransactionAttempt'];
  quarantineErgoOperationalTransactionAttempt:
    StateTracker['quarantineErgoOperationalTransactionAttempt'];
}

export interface SubstrateFederatedLocalDevnetGenesisJournalV1 {
  readonly journal: Readonly<GenesisJournalPort>;
  reconcileActive(
    observer: Readonly<GenesisConfirmationObserver>,
  ): Promise<'none' | 'confirmed'>;
  revalidateConfirmed(
    observer: Readonly<GenesisConfirmationObserver>,
  ): Promise<number>;
}

interface GenesisAttemptMarkerBodyV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_JOURNAL_V1_SCHEMA;
  readonly version: 1;
  readonly operationProfile:
    typeof SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE;
  readonly reconciliationIdentityDigestHex: string;
  readonly role: 'tracker' | 'duplicatePrevention' | 'pooledReserve';
  readonly admissionDigestHex: string;
  readonly planDigestHex: string;
  readonly targetGenesisHeaderIdHex: string;
  readonly expectedTxId: string;
  readonly sourceBoxId: string;
  readonly inputBoxIds: readonly string[];
  readonly attemptedAtHeight: number;
  readonly nodeOrigin:
    typeof SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN;
  readonly signedTransactionDigestHex: string;
  readonly checkResponseDigestHex: string;
  readonly postCheckRevalidationDigestHex: string;
  readonly preTransportRevalidationDigestHex: string;
  readonly authorizationDigestHex: string;
}

interface GenesisAttemptMarkerV1 extends GenesisAttemptMarkerBodyV1 {
  readonly markerDigestHex: string;
}

interface DurableMaterialV1 {
  readonly candidate: SubstrateFederatedLocalDevnetGenesisTransportCandidate;
  readonly marker: GenesisAttemptMarkerV1;
  readonly durableAttemptDigestHex: string;
}

const DURABLE_MATERIAL = new WeakMap<object, DurableMaterialV1>();

export function createSubstrateFederatedLocalDevnetGenesisJournalV1(input: {
  readonly state: SubstrateFederatedLocalDevnetGenesisJournalStateV1;
  readonly markerDirectory: string;
  readonly reconciliationIdentityDigestHex: string;
}): Readonly<SubstrateFederatedLocalDevnetGenesisJournalV1> {
  const state = requireState(input.state);
  const markerDirectory = canonicalMarkerDirectory(input.markerDirectory);
  const reconciliationIdentityDigestHex = fixedHex32(
    input.reconciliationIdentityDigestHex,
    'genesis reconciliation identity digest',
  );
  assertMarkerContinuity(
    state,
    markerDirectory,
    reconciliationIdentityDigestHex,
  );

  const journal: GenesisJournalPort = Object.freeze({
    reserve: candidate => {
      assertSubstrateFederatedLocalDevnetGenesisTransportCandidateV1(candidate);
      const markers = assertMarkerContinuity(
        state,
        markerDirectory,
        reconciliationIdentityDigestHex,
      );
      if (activeAttempts(state).length !== 0) {
        throw new Error(
          'unresolved genesis attempt must be reconciled before replacement',
        );
      }

      const marker = buildMarker(candidate, reconciliationIdentityDigestHex);
      assertNoHistoricalInputReuse(marker, markers.values());
      persistCreateOnlyMarker(markerDirectory, marker);
      let attempt: ErgoOperationalTransactionAttempt;
      try {
        attempt = state.reserveErgoOperationalTransactionAttempt({
          operationProfile:
            SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
          expectedTxId: marker.expectedTxId,
          sourceBoxId: marker.sourceBoxId,
          inputBoxIds: marker.inputBoxIds,
          attemptedAtHeight: marker.attemptedAtHeight,
          targetSidechainHeight: null,
          targetSidechainBlockHashHex: null,
          heartbeatKeyHex: null,
          reconciliationIdentityDigestHex,
          bindingDigestHex: marker.admissionDigestHex,
          signedTransactionDigestHex: marker.signedTransactionDigestHex,
          checkResponseDigestHex: marker.checkResponseDigestHex,
          revalidationDigestHex: marker.preTransportRevalidationDigestHex,
          authorizationDigestHex: marker.authorizationDigestHex,
        });
      } catch (cause) {
        throw new Error(
          'genesis marker was retained after durable reservation failed; reviewed recovery is required',
          { cause },
        );
      }
      assertMarkerMatchesAttempt(marker, attempt);
      const durableArtifact = Object.freeze({
        schema: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_JOURNAL_V1_SCHEMA,
        expectedTxId: marker.expectedTxId,
        markerDigestHex: marker.markerDigestHex,
      });
      DURABLE_MATERIAL.set(durableArtifact, Object.freeze({
        candidate,
        marker,
        durableAttemptDigestHex: attempt.durableAttemptDigestHex,
      }));
      return Object.freeze({
        durableAttemptDigestHex: attempt.durableAttemptDigestHex,
        reconciliationIdentityDigestHex,
        durableArtifact,
      });
    },
    finalize: ({ attempt, submission }) => {
      const material = requireDurableMaterial(attempt, reconciliationIdentityDigestHex);
      if (submission.status === 'rejected') {
        const rejected = state.rejectErgoOperationalTransactionAttempt({
          expectedTxId: material.marker.expectedTxId,
          durableAttemptDigestHex: attempt.durableAttemptDigestHex,
          responseDigestHex: submission.responseDigestHex,
        });
        assertMarkerMatchesAttempt(material.marker, rejected.attempt);
        return Object.freeze({
          status: 'rejected' as const,
          journalDigestHex: rejected.journalDigestHex,
        });
      }
      const finalized = state.finalizeErgoOperationalTransactionAttempt({
        expectedTxId: material.marker.expectedTxId,
        durableAttemptDigestHex: attempt.durableAttemptDigestHex,
        disposition: submission.status,
        submittedTxId: submission.submittedTxId,
        responseDigestHex: submission.responseDigestHex,
      });
      assertMarkerMatchesAttempt(material.marker, finalized.attempt);
      return Object.freeze({
        status: submission.status,
        journalDigestHex: finalized.journalDigestHex,
      });
    },
    confirm: ({ attempt, confirmation }) => {
      const material = requireDurableMaterial(attempt, reconciliationIdentityDigestHex);
      const exact = normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(
        confirmation,
      );
      if (
        exact.status !== 'confirmed'
        || exact.confirmationHeight === null
        || exact.confirmationHeaderIdHex === null
      ) {
        throw new Error('genesis journal confirmation lacks final canonical inclusion');
      }
      assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
        exact.observerArtifact,
        reconciliationIdentityDigestHex,
        material.marker.targetGenesisHeaderIdHex,
        material.marker.expectedTxId,
        exact.observationDigestHex,
      );
      const confirmed = state.confirmErgoOperationalTransactionAttempt({
        expectedTxId: material.marker.expectedTxId,
        confirmationHeight: exact.confirmationHeight,
        confirmationHeaderId: exact.confirmationHeaderIdHex,
      });
      assertMarkerMatchesAttempt(material.marker, confirmed);
    },
  });

  return Object.freeze({
    journal,
    reconcileActive: (observer: Readonly<GenesisConfirmationObserver>) =>
      reconcileActiveAttempt(
      state,
      markerDirectory,
      reconciliationIdentityDigestHex,
      observer,
    ),
    revalidateConfirmed: (observer: Readonly<GenesisConfirmationObserver>) =>
      revalidateConfirmedAttempts(
      state,
      markerDirectory,
      reconciliationIdentityDigestHex,
      observer,
    ),
  });
}

function requireState(
  value: SubstrateFederatedLocalDevnetGenesisJournalStateV1,
): SubstrateFederatedLocalDevnetGenesisJournalStateV1 {
  if (value === null || typeof value !== 'object') {
    throw new Error('genesis journal requires a StateTracker-compatible state');
  }
  return value;
}

function buildMarker(
  candidate: SubstrateFederatedLocalDevnetGenesisTransportCandidate,
  reconciliationIdentityDigestHex: string,
): GenesisAttemptMarkerV1 {
  const authorization = candidate.authorization;
  const checked = authorization.revalidated.checked;
  const admission = checked.signed.admission;
  const body: GenesisAttemptMarkerBodyV1 = {
    schema: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_JOURNAL_V1_SCHEMA,
    version: 1,
    operationProfile:
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
    reconciliationIdentityDigestHex,
    role: admission.role,
    admissionDigestHex: admission.admissionDigestHex,
    planDigestHex: admission.planDigestHex,
    targetGenesisHeaderIdHex: admission.targetGenesisHeaderIdHex,
    expectedTxId: admission.expectedTxId,
    sourceBoxId: admission.sourceBoxId,
    inputBoxIds: admission.inputBoxIds,
    attemptedAtHeight: admission.attemptedAtHeight,
    nodeOrigin: admission.nodeOrigin,
    signedTransactionDigestHex: checked.signed.signedTransactionDigestHex,
    checkResponseDigestHex: checked.checkResponseDigestHex,
    postCheckRevalidationDigestHex:
      authorization.revalidated.postCheckEvidence.observationDigestHex,
    preTransportRevalidationDigestHex:
      authorization.preTransportEvidence.observationDigestHex,
    authorizationDigestHex: authorization.authorizationDigestHex,
  };
  return Object.freeze({
    ...body,
    inputBoxIds: Object.freeze([...body.inputBoxIds]),
    markerDigestHex: sha256CanonicalJson(body, MARKER_DIGEST_DOMAIN),
  });
}

function requireDurableMaterial(
  attempt: Parameters<GenesisJournalPort['finalize']>[0]['attempt'],
  reconciliationIdentityDigestHex: string,
): DurableMaterialV1 {
  assertSubstrateFederatedLocalDevnetGenesisDurableAttemptV1(attempt);
  const material = DURABLE_MATERIAL.get(attempt.durableArtifact);
  if (
    !material
    || material.candidate !== attempt.candidate
    || material.durableAttemptDigestHex !== attempt.durableAttemptDigestHex
    || attempt.reconciliationIdentityDigestHex !== reconciliationIdentityDigestHex
    || material.marker.reconciliationIdentityDigestHex
      !== reconciliationIdentityDigestHex
  ) {
    throw new Error('genesis journal durable attempt lacks exact process provenance');
  }
  return material;
}

async function reconcileActiveAttempt(
  state: SubstrateFederatedLocalDevnetGenesisJournalStateV1,
  markerDirectory: string,
  reconciliationIdentityDigestHex: string,
  observer: Readonly<GenesisConfirmationObserver>,
): Promise<'none' | 'confirmed'> {
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
    observer,
    reconciliationIdentityDigestHex,
  );
  const markers = assertMarkerContinuity(
    state,
    markerDirectory,
    reconciliationIdentityDigestHex,
  );
  const active = activeAttempts(state);
  if (active.length === 0) return 'none';
  if (active.length !== 1) {
    throw new Error('multiple active genesis attempts violate the static profile');
  }
  const attempt = active[0];
  const marker = markers.get(attempt.expectedTxId);
  if (!marker) throw new Error('active genesis attempt marker is unavailable');
  const observation = await observeExact(
    observer,
    attempt.expectedTxId,
    reconciliationIdentityDigestHex,
    marker.targetGenesisHeaderIdHex,
  );
  if (
    observation.status !== 'confirmed'
    || observation.confirmationHeight === null
    || observation.confirmationHeaderIdHex === null
  ) {
    throw new Error(
      `durable genesis attempt ${attempt.expectedTxId} is unresolved `
        + `(${observation.status}); no replacement transaction will be built`,
    );
  }
  const confirmed = state.confirmErgoOperationalTransactionAttempt({
    expectedTxId: attempt.expectedTxId,
    confirmationHeight: observation.confirmationHeight,
    confirmationHeaderId: observation.confirmationHeaderIdHex,
  });
  assertMarkerMatchesAttempt(marker, confirmed);
  return 'confirmed';
}

async function revalidateConfirmedAttempts(
  state: SubstrateFederatedLocalDevnetGenesisJournalStateV1,
  markerDirectory: string,
  reconciliationIdentityDigestHex: string,
  observer: Readonly<GenesisConfirmationObserver>,
): Promise<number> {
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
    observer,
    reconciliationIdentityDigestHex,
  );
  const markers = assertMarkerContinuity(
    state,
    markerDirectory,
    reconciliationIdentityDigestHex,
  );
  const confirmed = state.getConfirmedErgoOperationalTransactionAttempts(
    SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
  );
  const definitivelyRejected = state.getErgoOperationalTransactionAttempts(
    SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
  ).filter(attempt =>
    attempt.status === 'abandoned'
    && attempt.abandonmentReason
      === ERGO_OPERATIONAL_DEFINITIVE_TRANSPORT_REJECTION_REASON);
  for (const attempt of definitivelyRejected) {
    const marker = markers.get(attempt.expectedTxId);
    if (!marker) throw new Error('rejected genesis attempt marker is unavailable');
    const observation = await observeExact(
      observer,
      attempt.expectedTxId,
      reconciliationIdentityDigestHex,
      marker.targetGenesisHeaderIdHex,
    );
    if (observation.status !== 'not_found') {
      state.quarantineErgoOperationalTransactionAttempt(
        attempt.expectedTxId,
        `definitively rejected local genesis transaction appeared on-chain (${observation.status})`,
      );
      throw new Error(
        `definitively rejected genesis transaction ${attempt.expectedTxId} appeared on-chain`,
      );
    }
  }
  for (const attempt of confirmed) {
    const marker = markers.get(attempt.expectedTxId);
    if (!marker) throw new Error('confirmed genesis attempt marker is unavailable');
    const observation = await observeExact(
      observer,
      attempt.expectedTxId,
      reconciliationIdentityDigestHex,
      marker.targetGenesisHeaderIdHex,
    );
    if (
      observation.status !== 'confirmed'
      || observation.confirmationHeight === null
      || observation.confirmationHeaderIdHex === null
    ) {
      state.quarantineErgoOperationalTransactionAttempt(
        attempt.expectedTxId,
        `confirmed local genesis transaction lost canonical inclusion (${observation.status})`,
      );
      throw new Error(
        `confirmed genesis transaction ${attempt.expectedTxId} lost canonical inclusion`,
      );
    }
    const rebound = state.rebindConfirmedErgoOperationalTransactionAttempt({
      expectedTxId: attempt.expectedTxId,
      confirmationHeight: observation.confirmationHeight,
      confirmationHeaderId: observation.confirmationHeaderIdHex,
    });
    assertMarkerMatchesAttempt(marker, rebound);
  }
  return confirmed.length;
}

async function observeExact(
  observer: Readonly<GenesisConfirmationObserver>,
  expectedTxId: string,
  reconciliationIdentityDigestHex: string,
  targetGenesisHeaderIdHex: string,
): Promise<SubstrateFederatedLocalDevnetGenesisConfirmation> {
  if (!observer || typeof observer.observe !== 'function') {
    throw new Error('genesis confirmation observer is unavailable');
  }
  let raw: SubstrateFederatedLocalDevnetGenesisConfirmation | null;
  try {
    raw = await observer.observe(
      expectedTxId,
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
    );
  } catch (cause) {
    throw new Error('genesis confirmation observation is unavailable', { cause });
  }
  if (raw === null) {
    throw new Error('genesis confirmation observation is unavailable');
  }
  const exact = normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(raw);
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
    exact.observerArtifact,
    reconciliationIdentityDigestHex,
    targetGenesisHeaderIdHex,
    expectedTxId,
    exact.observationDigestHex,
  );
  return exact;
}

function activeAttempts(
  state: SubstrateFederatedLocalDevnetGenesisJournalStateV1,
): ErgoOperationalTransactionAttempt[] {
  return state.getActiveErgoOperationalTransactionAttempts(
    SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
  );
}

function assertMarkerContinuity(
  state: SubstrateFederatedLocalDevnetGenesisJournalStateV1,
  markerDirectory: string,
  reconciliationIdentityDigestHex: string,
): ReadonlyMap<string, GenesisAttemptMarkerV1> {
  const markers = readMarkers(markerDirectory);
  const attempts = state.getErgoOperationalTransactionAttempts(
    SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
  );
  if (markers.size !== attempts.length) {
    throw new Error(
      'genesis marker/SQLite continuity differs; database-loss recovery is required',
    );
  }
  const attemptsById = new Map(attempts.map(attempt => [attempt.expectedTxId, attempt]));
  for (const [expectedTxId, marker] of markers) {
    if (marker.reconciliationIdentityDigestHex !== reconciliationIdentityDigestHex) {
      throw new Error('genesis marker belongs to another target process identity');
    }
    const attempt = attemptsById.get(expectedTxId);
    if (!attempt) {
      throw new Error(
        'genesis marker has no SQLite attempt; database-loss recovery is required',
      );
    }
    assertMarkerMatchesAttempt(marker, attempt);
    if (
      attempt.status === 'quarantined'
      || (
        attempt.status === 'abandoned'
        && attempt.abandonmentReason
          !== ERGO_OPERATIONAL_DEFINITIVE_TRANSPORT_REJECTION_REASON
      )
    ) {
      throw new Error(
        `genesis attempt ${attempt.expectedTxId} requires reviewed recovery`,
      );
    }
  }
  return markers;
}

function assertMarkerMatchesAttempt(
  marker: GenesisAttemptMarkerV1,
  attempt: ErgoOperationalTransactionAttempt,
): void {
  if (
    attempt.operationProfile
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE
    || attempt.expectedTxId !== marker.expectedTxId
    || attempt.sourceBoxId !== marker.sourceBoxId
    || !sameStrings(attempt.inputBoxIds, marker.inputBoxIds)
    || attempt.attemptedAtHeight !== marker.attemptedAtHeight
    || attempt.targetSidechainHeight !== null
    || attempt.targetSidechainBlockHashHex !== null
    || attempt.heartbeatKeyHex !== null
    || attempt.reconciliationIdentityDigestHex
      !== marker.reconciliationIdentityDigestHex
    || attempt.bindingDigestHex !== marker.admissionDigestHex
    || attempt.signedTransactionDigestHex !== marker.signedTransactionDigestHex
    || attempt.checkResponseDigestHex !== marker.checkResponseDigestHex
    || attempt.revalidationDigestHex !== marker.preTransportRevalidationDigestHex
    || attempt.authorizationDigestHex !== marker.authorizationDigestHex
    || attempt.fundsReleaseAuthorityEpochHex !== null
  ) {
    throw new Error('genesis marker differs from its exact SQLite attempt');
  }
}

function persistCreateOnlyMarker(
  markerDirectory: string,
  marker: GenesisAttemptMarkerV1,
): void {
  const path = join(markerDirectory, `${marker.expectedTxId}${MARKER_SUFFIX}`);
  const bytes = Buffer.from(`${canonicalJson(marker)}\n`, 'utf8');
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'wx', 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } catch (cause) {
    throw new Error(
      'genesis create-only marker already exists or could not be persisted',
      { cause },
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readMarkers(markerDirectory: string): Map<string, GenesisAttemptMarkerV1> {
  const markers = new Map<string, GenesisAttemptMarkerV1>();
  for (const entry of readdirSync(markerDirectory, { withFileTypes: true })) {
    if (
      !entry.isFile()
      || !/^[0-9a-f]{64}\.json$/u.test(entry.name)
    ) {
      throw new Error('genesis marker directory contains an unsupported entry');
    }
    const path = join(markerDirectory, entry.name);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_MARKER_BYTES) {
      throw new Error('genesis attempt marker is not a bounded regular file');
    }
    const source = readFileSync(path, 'utf8');
    if (!source.endsWith('\n') || source.endsWith('\n\n') || source.includes('\r')) {
      throw new Error('genesis attempt marker must have one LF terminator');
    }
    const json = source.slice(0, -1);
    assertNoDuplicateJsonKeys(json);
    const marker = normalizeMarker(JSON.parse(json));
    if (canonicalJson(marker) !== json) {
      throw new Error('genesis attempt marker must use canonical JSON');
    }
    if (entry.name !== `${marker.expectedTxId}${MARKER_SUFFIX}`) {
      throw new Error('genesis attempt marker filename differs from its transaction ID');
    }
    if (markers.has(marker.expectedTxId)) {
      throw new Error('duplicate genesis attempt marker');
    }
    markers.set(marker.expectedTxId, marker);
  }
  return markers;
}

function normalizeMarker(value: unknown): GenesisAttemptMarkerV1 {
  const record = exactRecord(value, [
    'schema',
    'version',
    'operationProfile',
    'reconciliationIdentityDigestHex',
    'role',
    'admissionDigestHex',
    'planDigestHex',
    'targetGenesisHeaderIdHex',
    'expectedTxId',
    'sourceBoxId',
    'inputBoxIds',
    'attemptedAtHeight',
    'nodeOrigin',
    'signedTransactionDigestHex',
    'checkResponseDigestHex',
    'postCheckRevalidationDigestHex',
    'preTransportRevalidationDigestHex',
    'authorizationDigestHex',
    'markerDigestHex',
  ], 'genesis attempt marker');
  if (
    record.schema !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_JOURNAL_V1_SCHEMA
    || record.version !== 1
    || record.operationProfile
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE
    || !['tracker', 'duplicatePrevention', 'pooledReserve'].includes(
      String(record.role),
    )
    || record.nodeOrigin
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN
  ) {
    throw new Error('genesis attempt marker profile is unsupported');
  }
  const expectedTxId = fixedHex32(record.expectedTxId, 'marker transaction ID');
  const sourceBoxId = fixedHex32(record.sourceBoxId, 'marker source box ID');
  const inputBoxIds = normalizeInputBoxIds(record.inputBoxIds, sourceBoxId);
  const body: GenesisAttemptMarkerBodyV1 = {
    schema: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_JOURNAL_V1_SCHEMA,
    version: 1,
    operationProfile:
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
    reconciliationIdentityDigestHex: fixedHex32(
      record.reconciliationIdentityDigestHex,
      'marker reconciliation identity',
    ),
    role: record.role as GenesisAttemptMarkerBodyV1['role'],
    admissionDigestHex: fixedHex32(record.admissionDigestHex, 'marker admission digest'),
    planDigestHex: fixedHex32(record.planDigestHex, 'marker plan digest'),
    targetGenesisHeaderIdHex: fixedHex32(
      record.targetGenesisHeaderIdHex,
      'marker target genesis header ID',
    ),
    expectedTxId,
    sourceBoxId,
    inputBoxIds,
    attemptedAtHeight: nonNegativeHeight(record.attemptedAtHeight, 'marker attempted height'),
    nodeOrigin: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
    signedTransactionDigestHex: fixedHex32(
      record.signedTransactionDigestHex,
      'marker signed transaction digest',
    ),
    checkResponseDigestHex: fixedHex32(
      record.checkResponseDigestHex,
      'marker check response digest',
    ),
    postCheckRevalidationDigestHex: fixedHex32(
      record.postCheckRevalidationDigestHex,
      'marker post-check revalidation digest',
    ),
    preTransportRevalidationDigestHex: fixedHex32(
      record.preTransportRevalidationDigestHex,
      'marker pre-transport revalidation digest',
    ),
    authorizationDigestHex: fixedHex32(
      record.authorizationDigestHex,
      'marker authorization digest',
    ),
  };
  if (
    body.admissionDigestHex
      !== deriveSubstrateFederatedLocalDevnetGenesisAdmissionDigestV1(body)
  ) {
    throw new Error('genesis attempt marker admission binding is invalid');
  }
  const markerDigestHex = fixedHex32(record.markerDigestHex, 'marker digest');
  if (markerDigestHex !== sha256CanonicalJson(body, MARKER_DIGEST_DOMAIN)) {
    throw new Error('genesis attempt marker digest is invalid');
  }
  return Object.freeze({ ...body, markerDigestHex });
}

function assertNoHistoricalInputReuse(
  marker: GenesisAttemptMarkerV1,
  historicalMarkers: Iterable<GenesisAttemptMarkerV1>,
): void {
  const candidateInputs = new Set(marker.inputBoxIds);
  for (const historical of historicalMarkers) {
    if (historical.inputBoxIds.some(boxId => candidateInputs.has(boxId))) {
      throw new Error(
        'genesis attempt cannot reuse an input from durable history',
      );
    }
  }
}

function canonicalMarkerDirectory(value: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('genesis marker directory is required');
  }
  const stat = lstatSync(value);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('genesis marker directory must be a real directory');
  }
  return realpathSync.native(value);
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (
    JSON.stringify(Object.keys(record).sort())
      !== JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} has unsupported fields`);
  }
  return record;
}

function normalizeInputBoxIds(value: unknown, sourceBoxId: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('marker input box IDs must be a non-empty array');
  }
  const inputBoxIds = value.map((boxId, index) =>
    fixedHex32(boxId, `marker inputBoxIds[${index}]`));
  if (new Set(inputBoxIds).size !== inputBoxIds.length) {
    throw new Error('marker input box IDs must be unique');
  }
  if (inputBoxIds[0] !== sourceBoxId) {
    throw new Error('marker source box must be its first input');
  }
  return Object.freeze(inputBoxIds);
}

function fixedHex32(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be 32-byte lowercase hexadecimal`);
  }
  return value;
}

function nonNegativeHeight(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
