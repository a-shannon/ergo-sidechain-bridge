export const SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_SOURCE_FAILURE_PHASES_V1 =
  Object.freeze([
    'source target build and source tests',
    'source target input and baseline',
    'source target toolchain and build workspace',
    'source target Frontier build',
    'source target binary and base spec',
    'source target built binary artifact',
    'source target binary identity and version',
    'source target base spec process',
    'source target base spec stderr policy',
    'source target base spec exact reproduction',
    'source target chain spec generation',
    'source target runtime source tests',
    'source target post-build invariants',
    'source target build workspace cleanup',
    'source target process construction and startup',
    'source target readiness and observation',
    'source history rpc and finality',
  ] as const);

export type SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1 =
  typeof SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_SOURCE_FAILURE_PHASES_V1[number];

const SOURCE_FAILURE_PHASES = new WeakMap<
  Error,
  SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1
>();

export function createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1(
  phase: SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1,
  cause: unknown,
): Error {
  if (
    !SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_SOURCE_FAILURE_PHASES_V1.includes(
      phase,
    )
  ) {
    throw new Error('authority-safe source failure phase is invalid');
  }
  if (
    projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1(cause)
      !== null
  ) {
    return cause as Error;
  }
  const failure = cause instanceof Error
    ? cause
    : new Error('authority-safe source phase failed');
  SOURCE_FAILURE_PHASES.set(failure, phase);
  return failure;
}

export function projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1(
  value: unknown,
): SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1 | null {
  if (!(value instanceof Error)) return null;
  const direct = SOURCE_FAILURE_PHASES.get(value);
  if (direct !== undefined) return direct;
  if (!(value instanceof AggregateError)) return null;

  let projected:
    SubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1 | null = null;
  for (const nested of value.errors) {
    const phase =
      projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1(nested);
    if (phase === null) continue;
    if (projected !== null && phase !== projected) return null;
    projected = phase;
  }
  return projected;
}
