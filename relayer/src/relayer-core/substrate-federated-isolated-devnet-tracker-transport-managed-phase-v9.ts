import {
  createSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1,
  projectSubstrateFederatedIsolatedDevnetManagedCampaignPhaseFailureV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_CAMPAIGN_PHASES_V1,
  type SubstrateFederatedIsolatedDevnetManagedCampaignPhaseV1,
} from './substrate-federated-isolated-devnet-managed-campaign-phase-v1.js';

export type SubstrateFederatedIsolatedDevnetTrackerTransportManagedCampaignPhaseV9 =
  SubstrateFederatedIsolatedDevnetManagedCampaignPhaseV1;

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
