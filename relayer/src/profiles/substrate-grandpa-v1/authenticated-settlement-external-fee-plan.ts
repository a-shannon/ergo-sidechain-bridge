import {
  buildAuthenticatedSettlementPlan,
  type AuthenticatedSettlementPlan,
  type BuildAuthenticatedSettlementPlanInput,
} from './authenticated-settlement-plan.js';

export const AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PLAN_SCHEMA =
  'e2s.authenticated-settlement-external-fee-plan.v1' as const;
export const AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_CONTRACT_COMPATIBILITY =
  'authenticated-external-fee-v1' as const;
export const AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PROOF_SEMANTICS =
  'authenticated-v2-frozen' as const;

const AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PLANS = new WeakSet<object>();

export interface AuthenticatedSettlementExternalFeePlan
  extends Omit<AuthenticatedSettlementPlan, 'contractCompatibility'> {
  schema: typeof AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PLAN_SCHEMA;
  contractCompatibility:
    typeof AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_CONTRACT_COMPATIBILITY;
  proofSemantics:
    typeof AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PROOF_SEMANTICS;
}

/**
 * Reuses the frozen authenticated-V2 tracker, burn-leaf and DUP proof
 * semantics while selecting a distinct settlement contract family.
 */
export function buildAuthenticatedSettlementExternalFeePlan(
  input: BuildAuthenticatedSettlementPlanInput,
): AuthenticatedSettlementExternalFeePlan {
  const authenticatedV2 = buildAuthenticatedSettlementPlan(input);
  const detached = structuredClone(authenticatedV2);
  const plan: AuthenticatedSettlementExternalFeePlan = {
    ...detached,
    schema: AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PLAN_SCHEMA,
    contractCompatibility:
      AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_CONTRACT_COMPATIBILITY,
    proofSemantics: AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PROOF_SEMANTICS,
  };
  const frozen = deepFreeze(plan);
  AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PLANS.add(frozen);
  return frozen;
}

export function assertAuthenticatedSettlementExternalFeePlanProvenance(
  value: unknown,
): asserts value is AuthenticatedSettlementExternalFeePlan {
  if (
    value === null
    || typeof value !== 'object'
    || !AUTHENTICATED_SETTLEMENT_EXTERNAL_FEE_PLANS.has(value)
  ) {
    throw new Error(
      'external-fee settlement plan was not built in this process',
    );
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}
