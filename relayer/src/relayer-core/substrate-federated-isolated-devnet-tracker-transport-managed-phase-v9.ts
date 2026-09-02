import {
  createSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1,
  projectSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_CAMPAIGN_PHASES_V1,
  type SubstrateFederatedIsolatedDevnetManagedCampaignPhaseV1,
} from './substrate-federated-isolated-devnet-managed-campaign-phase-v1.js';

export type SubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseV9 =
  SubstrateFederatedIsolatedDevnetManagedCampaignPhaseV1;

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CHECKED_SUBMISSION_FAILURE_CODES_V1 =
  Object.freeze([
    'authority_binding',
    'durable_attempt_claim',
    'checked_handle_consumption',
    'preflight_consumption',
    'transport_response_projection',
    'submission_result_validation',
    'result_issuance',
  ] as const);

export type SubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureCodeV1 =
  typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CHECKED_SUBMISSION_FAILURE_CODES_V1[number];

const CHECKED_SUBMISSION_FAILURES_V1 = new WeakMap<
  Error,
  SubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureCodeV1
>();

export function isKnownSubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureCodeV1(
  value: unknown,
): value is SubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureCodeV1 {
  return typeof value === 'string'
    && SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_CHECKED_SUBMISSION_FAILURE_CODES_V1
      .includes(
        value as SubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureCodeV1,
      );
}

export function createSubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureV1(
  code: SubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureCodeV1,
  cause: unknown,
): Error {
  if (
    !isKnownSubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureCodeV1(
      code,
    )
  ) {
    throw new Error('tracker checked-submission failure code is invalid');
  }
  const failure = cause instanceof Error
    ? cause
    : new Error('isolated tracker checked submission failed');
  if (!CHECKED_SUBMISSION_FAILURES_V1.has(failure)) {
    CHECKED_SUBMISSION_FAILURES_V1.set(failure, code);
  }
  return failure;
}

export function projectSubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureV1(
  value: unknown,
): SubstrateFederatedIsolatedDevnetTrackerCheckedSubmissionFailureCodeV1
  | null {
  return value instanceof Error
    ? CHECKED_SUBMISSION_FAILURES_V1.get(value) ?? null
    : null;
}

export function createSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
  phase: SubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseV9,
  cause: unknown,
): Error {
  if (
    !SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_CAMPAIGN_PHASES_V1.includes(
      phase,
    )
  ) {
    throw new Error('tracker transport managed campaign phase is invalid');
  }
  const failure = cause instanceof Error
    ? cause
    : new Error('isolated tracker transport managed campaign phase failed');
  return createSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
    phase,
    failure,
  );
}

export function projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
  value: unknown,
): SubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseV9
  | null {
  return projectSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
    value,
  );
}
