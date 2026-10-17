import {
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1,
  type SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  assertSubstrateFederatedDepositFundingV1Provenance,
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance,
  createSubstrateFederatedDepositFundingRequirementsV1,
  discoverSubstrateFederatedDepositFundingV1,
  discoverSubstrateFederatedRewardInputsV2,
  normalizeSubstrateFederatedDepositFundingRequirementsV1,
  type SubstrateFederatedDepositFundingDiscoveryV1,
  type SubstrateFederatedDepositFundingRequirementsV1,
  type SubstrateFederatedRewardInputDiscoveryV2,
  type SubstrateFederatedRewardSignerBindingV1,
} from './substrate-federated-isolated-devnet-reward-input-discovery-v1.js';

export { createSubstrateFederatedDepositFundingRequirementsV1 };

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OWNED_REWARD_INPUT_DISCOVERY_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-owned-reward-input-discovery.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OWNED_DEPOSIT_FUNDING_DISCOVERY_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-owned-deposit-funding-discovery.v1' as const;

export interface SubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OWNED_REWARD_INPUT_DISCOVERY_V1_SCHEMA;
  readonly observation: Readonly<SubstrateFederatedRewardInputDiscoveryV2>;
  readonly processBindingDigestHex: string;
  readonly executionTargetIdentityDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetOwnedDepositFundingDiscoveryV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OWNED_DEPOSIT_FUNDING_DISCOVERY_V1_SCHEMA;
  readonly observation: Readonly<SubstrateFederatedDepositFundingDiscoveryV1>;
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

const OWNED_DEPOSIT_FUNDING_DISCOVERIES = new WeakMap<
  object,
  Readonly<{
    observation: Readonly<SubstrateFederatedDepositFundingDiscoveryV1>;
    requirements: Readonly<SubstrateFederatedDepositFundingRequirementsV1>;
    target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>;
    beforeBinding:
      Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
    afterBinding:
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
  return validateSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1(owned, target).observation;
}

/** Return the binding checked in this call, never a retained live verdict. */
export function validateSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1(
  owned: Readonly<SubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
): Readonly<{
  observation: Readonly<SubstrateFederatedRewardInputDiscoveryV2>;
  processBinding: Readonly<SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1>;
}> {
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
  return Object.freeze({ observation: owned.observation, processBinding: current });
}

/** Observe one deposit funding input while the exact managed target stays active. */
export async function discoverSubstrateFederatedDepositFundingForOwnedExecutionTargetV1(
  signer: Readonly<SubstrateFederatedRewardSignerBindingV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  requirementsInput:
    Readonly<SubstrateFederatedDepositFundingRequirementsV1>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetOwnedDepositFundingDiscoveryV1>> {
  const requirements =
    normalizeSubstrateFederatedDepositFundingRequirementsV1(requirementsInput);
  const before =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  const observation = await discoverSubstrateFederatedDepositFundingV1(
    signer,
    requirements,
  );
  assertSubstrateFederatedDepositFundingV1Provenance(observation);
  const after =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    after.processBindingDigestHex !== before.processBindingDigestHex
    || after.executionTargetIdentityDigestHex
      !== before.executionTargetIdentityDigestHex
  ) {
    throw new Error('owned deposit funding target changed during discovery');
  }
  const owned = Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OWNED_DEPOSIT_FUNDING_DISCOVERY_V1_SCHEMA,
    observation,
    processBindingDigestHex: after.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      after.executionTargetIdentityDigestHex,
  });
  OWNED_DEPOSIT_FUNDING_DISCOVERIES.set(owned, Object.freeze({
    observation,
    requirements,
    target,
    beforeBinding: before,
    afterBinding: after,
  }));
  return owned;
}

export function assertSubstrateFederatedIsolatedDevnetOwnedDepositFundingDiscoveryV1(
  owned:
    Readonly<SubstrateFederatedIsolatedDevnetOwnedDepositFundingDiscoveryV1>,
  target: Readonly<SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1>,
  expectedRequirements:
    Readonly<SubstrateFederatedDepositFundingRequirementsV1>,
): Readonly<SubstrateFederatedDepositFundingDiscoveryV1> {
  const expected =
    normalizeSubstrateFederatedDepositFundingRequirementsV1(expectedRequirements);
  const material = OWNED_DEPOSIT_FUNDING_DISCOVERIES.get(owned);
  const current =
    assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (
    material === undefined
    || material.target !== target
    || material.observation !== owned.observation
    || owned.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_OWNED_DEPOSIT_FUNDING_DISCOVERY_V1_SCHEMA
    || !sameDepositFundingRequirements(material.requirements, expected)
    || !sameDepositFundingRequirements(
      material.requirements,
      owned.observation.requirements,
    )
    || material.beforeBinding.processBindingDigestHex
      !== current.processBindingDigestHex
    || material.beforeBinding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || material.afterBinding.processBindingDigestHex
      !== current.processBindingDigestHex
    || material.afterBinding.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
    || owned.processBindingDigestHex !== current.processBindingDigestHex
    || owned.executionTargetIdentityDigestHex
      !== current.executionTargetIdentityDigestHex
  ) {
    throw new Error('owned deposit funding discovery lacks target or request provenance');
  }
  assertSubstrateFederatedDepositFundingV1Provenance(owned.observation);
  return owned.observation;
}

function sameDepositFundingRequirements(
  left: Readonly<SubstrateFederatedDepositFundingRequirementsV1>,
  right: Readonly<SubstrateFederatedDepositFundingRequirementsV1>,
): boolean {
  return left.sourceAmountNanoErg === right.sourceAmountNanoErg
    && left.sourceLockCreationFeeNanoErg
      === right.sourceLockCreationFeeNanoErg
    && left.reserveTransitionFeeNanoErg
      === right.reserveTransitionFeeNanoErg;
}
