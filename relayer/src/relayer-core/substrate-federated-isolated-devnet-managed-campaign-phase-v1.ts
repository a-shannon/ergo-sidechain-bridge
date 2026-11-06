import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_PRODUCTION_PHASES_V1,
} from './substrate-federated-isolated-devnet-packet-production-phase-v1.js';
import {
  SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_SOURCE_FAILURE_PHASES_V1,
} from './substrate-federated-authority-safe-devnet-source-failure-phase-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TARGET_PRE_ACTION_PHASES_V1 =
  Object.freeze([
    'tracker transport frozen snapshot revalidation',
    'tracker transport node shutdown',
    'tracker transport witness restart',
    'tracker transport primary restart',
    'tracker transport post-restart continuity',
  ] as const);

export type SubstrateFederatedIsolatedDevnetTrackerTargetPreActionPhaseV1 =
  typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TARGET_PRE_ACTION_PHASES_V1[number];

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_STARTUP_PHASES_V1 =
  Object.freeze([
    'ergo node startup artifact recheck',
    'ergo node startup port ownership',
    'ergo node startup runtime creation',
    'ergo node startup credential consumption',
    'ergo node primary spawn',
    'ergo node primary readiness',
    'ergo node primary identity',
    'ergo node witness spawn',
    'ergo node witness readiness',
    'ergo node witness identity',
    'ergo node listener ownership',
  ] as const);

export type SubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseV1 =
  typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_STARTUP_PHASES_V1[number];

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_CAMPAIGN_PHASES_V1 =
  Object.freeze([
    'ergo node build',
    'setup and packet session',
    'node process construction',
    'node startup and mining',
    ...SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_STARTUP_PHASES_V1,
    'managed setup execution',
    'source history collection',
    ...SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_SOURCE_FAILURE_PHASES_V1,
    'ergo funding and history',
    'packet production',
    ...SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_PRODUCTION_PHASES_V1,
    'setup batch construction',
    'genesis setup support construction',
    'genesis setup journal construction',
    'genesis setup execution admission',
    'genesis setup signing',
    'genesis setup candidate check',
    'genesis setup post-check revalidation',
    'genesis setup pre-transport revalidation',
    'genesis setup broadcast authorization',
    'genesis setup durable reservation',
    'genesis setup checked submission',
    'genesis setup outcome persistence',
    'genesis setup execution result validation',
    'genesis setup canonical confirmation',
    'genesis setup tracker canonical confirmation',
    'genesis setup tracker canonical confirmation managed deadline elapsed',
    'genesis setup tracker canonical confirmation confirmation budget elapsed',
    'genesis setup tracker canonical confirmation pending at deadline',
    'genesis setup tracker canonical confirmation not found at deadline',
    'genesis setup tracker canonical confirmation observation completed after deadline',
    'genesis setup tracker canonical confirmation observer failure',
    'genesis setup tracker canonical confirmation clock failure',
    'genesis setup tracker canonical confirmation phase failure',
    'genesis setup duplicatePrevention canonical confirmation',
    'genesis setup duplicatePrevention canonical confirmation managed deadline elapsed',
    'genesis setup duplicatePrevention canonical confirmation confirmation budget elapsed',
    'genesis setup duplicatePrevention canonical confirmation pending at deadline',
    'genesis setup duplicatePrevention canonical confirmation not found at deadline',
    'genesis setup duplicatePrevention canonical confirmation observation completed after deadline',
    'genesis setup duplicatePrevention canonical confirmation observer failure',
    'genesis setup duplicatePrevention canonical confirmation clock failure',
    'genesis setup duplicatePrevention canonical confirmation phase failure',
    'genesis setup pooledReserve canonical confirmation',
    'genesis setup pooledReserve canonical confirmation managed deadline elapsed',
    'genesis setup pooledReserve canonical confirmation confirmation budget elapsed',
    'genesis setup pooledReserve canonical confirmation pending at deadline',
    'genesis setup pooledReserve canonical confirmation not found at deadline',
    'genesis setup pooledReserve canonical confirmation observation completed after deadline',
    'genesis setup pooledReserve canonical confirmation observer failure',
    'genesis setup pooledReserve canonical confirmation clock failure',
    'genesis setup pooledReserve canonical confirmation phase failure',
    'genesis setup durable reconciliation',
    'genesis setup confirmation acknowledgement',
    'genesis setup finalization',
    'peg-in candidate construction',
    'peg-in source-lock execution',
    'peg-in committed-vault execution',
    'peg-in committed-vault check',
    'peg-in committed-vault authorization',
    'peg-in committed-vault transport',
    'peg-in committed-vault operational signing',
    'peg-in committed-vault operational check',
    'peg-in committed-vault pre-transport revalidation',
    'peg-in committed-vault broadcast authorization',
    'peg-in committed-vault durable reservation',
    'peg-in committed-vault checked submission',
    'peg-in committed-vault outcome persistence',
    'peg-in committed-vault execution result validation',
    'peg-in committed-vault pre-transport observation',
    'peg-in committed-vault canonical confirmation',
    'peg-in committed-vault output observation',
    'application checkpoint execution',
    'tracker candidate construction',
    'managed setup finalization',
    'checkpoint anchor',
    'observed tracker check',
    'frozen tracker check',
    'tracker reservation and transport',
    'tracker reservation authorization',
    'tracker reservation persistence',
    'tracker freshness revalidation',
    ...SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_TARGET_PRE_ACTION_PHASES_V1,
    'tracker transport target activation',
    'tracker transport authorization',
    'tracker transport journal reservation',
    'tracker transport provenance binding',
    'tracker transport preflight',
    'tracker transport submission',
    'tracker transport checked submission',
    'tracker transport outcome persistence',
    'tracker transport post-action validation',
    'tracker canonical confirmation',
    'tracker transport result finalization',
    'tracker reservation cleanup',
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
