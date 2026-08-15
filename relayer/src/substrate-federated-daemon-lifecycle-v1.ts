/**
 * FED-4B1 fail-closed lifecycle composition.
 *
 * Scheduling remains non-authorizing. A failed fresh reconstruction first
 * latches the process hold and only then asks the existing durable hold port to
 * persist the incident. Neither the scheduling observation nor the incident is
 * accepted as restorable funds authority.
 */

import type {
  AuthenticatedSettlementCandidateRevalidationView,
} from './relayer-core/authenticated-settlement-candidate-reconciliation.js';
import {
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  SubstrateFederatedDaemonSchedulingFailureV1,
  runSubstrateFederatedDaemonSchedulingV1,
  type SubstrateFederatedDaemonSchedulingCycleV1,
  type SubstrateFederatedDaemonSchedulingFailureStageV1,
  type SubstrateFederatedDaemonSchedulingProfileV1,
  type SubstrateFederatedDaemonSchedulingObservationV1,
  type SubstrateFederatedDaemonSchedulingV1Result,
} from './substrate-federated-daemon-scheduling-v1.js';

export const SUBSTRATE_FEDERATED_DAEMON_LIFECYCLE_V1_SCHEMA =
  'e2s.substrate-federated-daemon-lifecycle.v1' as const;
export const SUBSTRATE_FEDERATED_DAEMON_LIFECYCLE_INCIDENT_V1_SCHEMA =
  'e2s.substrate-federated-daemon-lifecycle-incident.v1' as const;
const UNEXPECTED_SCHEDULING_FAILURE_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_DAEMON_UNEXPECTED_SCHEDULING_FAILURE_V1';
const INCIDENT_PERSISTENCE_FAILURE_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_DAEMON_INCIDENT_PERSISTENCE_FAILURE_V1';
const PROCESS_HOLD_FAILURE_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_DAEMON_PROCESS_HOLD_FAILURE_V1';

export type SubstrateFederatedDaemonLifecycleFailureStageV1 =
  | SubstrateFederatedDaemonSchedulingFailureStageV1
  | 'cycle_collection'
  | 'database_reconstruction'
  | 'pre_tracker_admission_revalidation'
  | 'tracker_admission'
  | 'post_tracker_admission_revalidation'
  | 'checker'
  | 'post_check_revalidation'
  | 'submission_authorization'
  | 'post_submission_authorization_revalidation'
  | 'unexpected_scheduling_failure';

export interface SubstrateFederatedDaemonLifecycleIncidentV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_DAEMON_LIFECYCLE_INCIDENT_V1_SCHEMA;
  readonly version: 1;
  readonly failureStage: SubstrateFederatedDaemonLifecycleFailureStageV1;
  readonly failureDigestHex: string;
  readonly reason: string;
  readonly boundary: {
    readonly localRecordAuthoritative: false;
    readonly candidateSnapshotRestorable: false;
    readonly mintAuthorized: false;
    readonly payoutAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
  };
}

export interface SubstrateFederatedDaemonLifecycleIncidentPortsV1 {
  readonly latchProcessHold: () => void | Promise<void>;
  readonly persistHold: (
    incident: Readonly<SubstrateFederatedDaemonLifecycleIncidentV1>,
  ) => void | Promise<void>;
}

export interface RunSubstrateFederatedDaemonLifecycleV1Input<
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
> {
  readonly profile: SubstrateFederatedDaemonSchedulingProfileV1<Revalidation>;
  readonly collectCycle: () => Promise<
    Readonly<SubstrateFederatedDaemonSchedulingCycleV1>
  >;
  readonly reconstructNonAuthorizingState?: (
    cycle: Readonly<SubstrateFederatedDaemonSchedulingCycleV1>,
  ) => void | Promise<void>;
  readonly record: (
    observation: Readonly<SubstrateFederatedDaemonSchedulingObservationV1>,
  ) => void | Promise<void>;
  readonly incidents: SubstrateFederatedDaemonLifecycleIncidentPortsV1;
}

export type SubstrateFederatedDaemonLifecycleV1Result =
  | SubstrateFederatedDaemonSchedulingV1Result
  | Readonly<{
      readonly schema: typeof SUBSTRATE_FEDERATED_DAEMON_LIFECYCLE_V1_SCHEMA;
      readonly version: 1;
      readonly status: 'held_non_authorizing';
      readonly incident: Readonly<SubstrateFederatedDaemonLifecycleIncidentV1>;
      readonly boundary: {
        readonly processHoldLatched: true;
        readonly durableHoldPersisted: true;
        readonly localRecordAuthoritative: false;
        readonly candidateSnapshotRestorable: false;
        readonly mintAuthorized: false;
        readonly payoutAuthorized: false;
        readonly signingAuthorized: false;
        readonly submissionAuthorized: false;
        readonly broadcastAuthorized: false;
        readonly fundsAuthorityEstablished: false;
      };
    }>;

export class SubstrateFederatedDaemonLifecycleIncidentPersistenceErrorV1
  extends Error {
  readonly persistenceFailureDigestHex: string;

  constructor(
    readonly incident: Readonly<SubstrateFederatedDaemonLifecycleIncidentV1>,
    cause: unknown,
  ) {
    const persistenceFailureDigestHex = failureDigest(
      cause,
      INCIDENT_PERSISTENCE_FAILURE_DOMAIN,
    );
    super(
      `federated daemon lifecycle incident persistence failed after process hold; failure digest ${persistenceFailureDigestHex}`,
    );
    this.name = 'SubstrateFederatedDaemonLifecycleIncidentPersistenceErrorV1';
    this.persistenceFailureDigestHex = persistenceFailureDigestHex;
  }
}

export class SubstrateFederatedDaemonLifecycleProcessHoldErrorV1
  extends Error {
  readonly processHoldFailureDigestHex: string;
  readonly persistenceFailureDigestHex: string | null;

  constructor(
    readonly incident: Readonly<SubstrateFederatedDaemonLifecycleIncidentV1>,
    processHoldCause: unknown,
    persistenceFailure:
      | Readonly<{ readonly failed: false }>
      | Readonly<{ readonly failed: true; readonly cause: unknown }>,
  ) {
    const processHoldFailureDigestHex = failureDigest(
      processHoldCause,
      PROCESS_HOLD_FAILURE_DOMAIN,
    );
    const persistenceFailureDigestHex = persistenceFailure.failed
      ? failureDigest(
          persistenceFailure.cause,
          INCIDENT_PERSISTENCE_FAILURE_DOMAIN,
        )
      : null;
    super(
      `federated daemon process hold failed; failure digest ${processHoldFailureDigestHex}`,
    );
    this.name = 'SubstrateFederatedDaemonLifecycleProcessHoldErrorV1';
    this.processHoldFailureDigestHex = processHoldFailureDigestHex;
    this.persistenceFailureDigestHex = persistenceFailureDigestHex;
  }
}

export async function runSubstrateFederatedDaemonLifecycleV1<
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
>(
  input: RunSubstrateFederatedDaemonLifecycleV1Input<Revalidation>,
): Promise<Readonly<SubstrateFederatedDaemonLifecycleV1Result>> {
  let cycle: Readonly<SubstrateFederatedDaemonSchedulingCycleV1>;
  try {
    cycle = await input.collectCycle();
  } catch (error) {
    return holdAfterFailure(
      input.incidents,
      lifecycleIncident(error, 'cycle_collection'),
    );
  }
  if (input.reconstructNonAuthorizingState !== undefined) {
    try {
      await input.reconstructNonAuthorizingState(cycle);
    } catch (error) {
      return holdAfterFailure(
        input.incidents,
        lifecycleIncident(error, 'database_reconstruction'),
      );
    }
  }
  try {
    return await runSubstrateFederatedDaemonSchedulingV1({
      profile: input.profile,
      cycle,
      record: input.record,
    });
  } catch (error) {
    return holdAfterFailure(input.incidents, lifecycleIncident(error));
  }
}

export async function holdSubstrateFederatedDaemonLifecycleAfterFailureV1(
  incidents: SubstrateFederatedDaemonLifecycleIncidentPortsV1,
  failureStage: SubstrateFederatedDaemonLifecycleFailureStageV1,
  error: unknown,
): Promise<Readonly<SubstrateFederatedDaemonLifecycleV1Result>> {
  return holdAfterFailure(
    incidents,
    lifecycleIncident(error, failureStage),
  );
}

async function holdAfterFailure(
  incidents: SubstrateFederatedDaemonLifecycleIncidentPortsV1,
  incident: Readonly<SubstrateFederatedDaemonLifecycleIncidentV1>,
): Promise<Readonly<SubstrateFederatedDaemonLifecycleV1Result>> {
  let processHoldFailed = false;
  let processHoldError: unknown;
  try {
    await incidents.latchProcessHold();
  } catch (error) {
    processHoldFailed = true;
    processHoldError = error;
  }
  let persistenceFailed = false;
  let persistenceError: unknown;
  try {
    await incidents.persistHold(incident);
  } catch (error) {
    persistenceFailed = true;
    persistenceError = error;
  }
  if (processHoldFailed) {
    throw new SubstrateFederatedDaemonLifecycleProcessHoldErrorV1(
      incident,
      processHoldError,
      persistenceFailed
        ? { failed: true, cause: persistenceError }
        : { failed: false },
    );
  }
  if (persistenceFailed) {
    throw new SubstrateFederatedDaemonLifecycleIncidentPersistenceErrorV1(
      incident,
      persistenceError,
    );
  }
  return deepFreeze({
    schema: SUBSTRATE_FEDERATED_DAEMON_LIFECYCLE_V1_SCHEMA,
    version: 1 as const,
    status: 'held_non_authorizing' as const,
    incident,
    boundary: {
      processHoldLatched: true as const,
      durableHoldPersisted: true as const,
      ...falseAuthorityBoundary(),
    },
  });
}

function failureDigest(cause: unknown, domain: string): string {
  return sha256CanonicalJson({
    causeName: cause instanceof Error ? cause.name : typeof cause,
    causeMessage: cause instanceof Error ? cause.message : String(cause),
  }, domain);
}

function lifecycleIncident(
  error: unknown,
  forcedStage?: SubstrateFederatedDaemonLifecycleFailureStageV1,
): Readonly<SubstrateFederatedDaemonLifecycleIncidentV1> {
  const failureStage = forcedStage
    ?? (error instanceof SubstrateFederatedDaemonSchedulingFailureV1
      ? error.stage
      : 'unexpected_scheduling_failure');
  const failureDigestHex = forcedStage === undefined
    && error instanceof SubstrateFederatedDaemonSchedulingFailureV1
    ? error.failureDigestHex
    : sha256CanonicalJson({
        failureStage,
        causeName: error instanceof Error ? error.name : typeof error,
        causeMessage: error instanceof Error ? error.message : String(error),
      }, UNEXPECTED_SCHEDULING_FAILURE_DOMAIN);
  return deepFreeze({
    schema: SUBSTRATE_FEDERATED_DAEMON_LIFECYCLE_INCIDENT_V1_SCHEMA,
    version: 1 as const,
    failureStage,
    failureDigestHex,
    reason: `federated lifecycle failed during ${failureStage}`,
    boundary: falseAuthorityBoundary(),
  });
}

function falseAuthorityBoundary() {
  return Object.freeze({
    localRecordAuthoritative: false as const,
    candidateSnapshotRestorable: false as const,
    mintAuthorized: false as const,
    payoutAuthorized: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    fundsAuthorityEstablished: false as const,
  });
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
