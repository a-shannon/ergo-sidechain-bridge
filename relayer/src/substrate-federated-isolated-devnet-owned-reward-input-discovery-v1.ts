import {
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
  type SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance,
  discoverSubstrateFederatedRewardInputsV2,
  type SubstrateFederatedRewardInputDiscoveryV2,
  type SubstrateFederatedRewardSignerBindingV1,
} from './substrate-federated-isolated-devnet-reward-input-discovery-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OWNED_REWARD_INPUT_DISCOVERY_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-owned-reward-input-discovery.v1' as const;

export interface SubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OWNED_REWARD_INPUT_DISCOVERY_V1_SCHEMA;
  readonly observation: Readonly<SubstrateFederatedRewardInputDiscoveryV2>;
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
}

const OWNED_DISCOVERIES = new WeakMap<
  object,
  Readonly<{
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    binding:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
  }>
>();

/** Observe the fixed node pair while the exact managed target remains active. */
export async function discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1(
  signer: Readonly<SubstrateFederatedRewardSignerBindingV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1>> {
  const before =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  const observation = await discoverSubstrateFederatedRewardInputsV2(signer);
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance(observation);
  const after =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    after.processBindingDigestHex !== before.processBindingDigestHex
    || after.executionTargetIdentityDigestHex
      !== before.executionTargetIdentityDigestHex
  ) {
    throw new Error('owned reward-input target changed during discovery');
  }
  const owned = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OWNED_REWARD_INPUT_DISCOVERY_V1_SCHEMA,
    observation,
    processBindingDigestHex: after.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      after.executionTargetIdentityDigestHex,
  });
  OWNED_DISCOVERIES.set(owned, Object.freeze({ target, binding: after }));
  return owned;
}

export function assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1(
  owned:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<SubstrateFederatedRewardInputDiscoveryV2> {
  const material = OWNED_DISCOVERIES.get(owned);
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    material === undefined
    || material.target !== target
    || owned.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OWNED_REWARD_INPUT_DISCOVERY_V1_SCHEMA
    || material.binding.processBindingDigestHex
      !== current.processBindingDigestHex
    || material.binding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || owned.processBindingDigestHex !== current.processBindingDigestHex
    || owned.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
  ) {
    throw new Error('owned reward-input discovery lacks target provenance');
  }
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance(owned.observation);
  return owned.observation;
}
