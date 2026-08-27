const MANAGED_CAMPAIGN_PHASES = Object.freeze([
  'ergo node build',
  'setup and packet session',
  'node process construction',
  'node startup and mining',
  'managed setup execution',
  'source history collection',
  'ergo funding and history',
  'packet production',
  'setup batch construction',
  'genesis setup transport',
  'peg-in candidate construction',
  'peg-in source-lock execution',
  'peg-in committed-vault execution',
  'application checkpoint execution',
  'tracker candidate construction',
  'managed setup finalization',
  'checkpoint anchor',
  'observed tracker check',
  'frozen tracker check',
  'tracker reservation and transport',
  'campaign teardown',
] as const);

export type SubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseV9 =
  typeof MANAGED_CAMPAIGN_PHASES[number];

const PHASE_FAILURES = new WeakMap<
  Error,
  SubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseV9
>();

export function createSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
  phase: SubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseV9,
  cause: unknown,
): Error {
  if (!MANAGED_CAMPAIGN_PHASES.includes(phase)) {
    throw new Error('tracker transport managed campaign phase is invalid');
  }
  const failure = cause instanceof Error
    ? cause
    : new Error('isolated tracker transport managed campaign phase failed');
  PHASE_FAILURES.set(failure, phase);
  return failure;
}

export function projectSubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseFailureV9(
  value: unknown,
): SubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseV9
  | null {
  if (typeof value !== 'object' || value === null) return null;
  return PHASE_FAILURES.get(value as Error) ?? null;
}
