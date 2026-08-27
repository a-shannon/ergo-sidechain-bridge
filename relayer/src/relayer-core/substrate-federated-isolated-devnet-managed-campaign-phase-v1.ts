export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_CAMPAIGN_PHASES_V1 =
  Object.freeze([
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

export type SubstrateFederatedIsolatedDevnetManagedCampaignPhaseV1 =
  typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_CAMPAIGN_PHASES_V1[number];

const PHASE_FAILURES = new WeakMap<
  Error,
  SubstrateFederatedIsolatedDevnetManagedCampaignPhaseV1
>();

export function createSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
  phase: SubstrateFederatedIsolatedDevnetManagedCampaignPhaseV1,
  cause: unknown,
): Error {
  if (
    !SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_CAMPAIGN_PHASES_V1.includes(
      phase,
    )
  ) {
    throw new Error('isolated devnet managed campaign phase is invalid');
  }
  const failure = cause instanceof Error
    ? cause
    : new Error('isolated devnet managed campaign phase failed');
  PHASE_FAILURES.set(failure, phase);
  return failure;
}

export function projectSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1(
  value: unknown,
): SubstrateFederatedIsolatedDevnetManagedCampaignPhaseV1 | null {
  if (typeof value !== 'object' || value === null) return null;
  return PHASE_FAILURES.get(value as Error) ?? null;
}
