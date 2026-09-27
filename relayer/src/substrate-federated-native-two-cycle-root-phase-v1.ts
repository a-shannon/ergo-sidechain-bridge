export const SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_ROOT_PHASES_V1 = Object.freeze([
  'setup-and-custody',
  'frontier-build',
  'ergo-build',
  'node-start',
  'cycle-1',
  'between-cycles',
  'cycle-2',
  'cleanup',
] as const);

export type SubstrateFederatedNativeTwoCycleRootPhaseV1 =
  typeof SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_ROOT_PHASES_V1[number];

export interface SubstrateFederatedNativeTwoCycleRootFailurePhaseV1 {
  readonly primaryPhase: SubstrateFederatedNativeTwoCycleRootPhaseV1 | null;
  readonly cleanupErrorCount: number;
}

const ROOT_FAILURE_PHASES = new WeakMap<Error, SubstrateFederatedNativeTwoCycleRootPhaseV1>();
const MAX_PROJECTED_ERRORS = 64;
const MAX_CLEANUP_ERROR_COUNT = 32;

export function tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1<T>(
  value: T,
  phase: SubstrateFederatedNativeTwoCycleRootPhaseV1,
): T {
  const error = asError(value);
  if (error !== null && !ROOT_FAILURE_PHASES.has(error)) ROOT_FAILURE_PHASES.set(error, phase);
  return value;
}

export function projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(
  value: unknown,
): Readonly<SubstrateFederatedNativeTwoCycleRootFailurePhaseV1> | null {
  const initial = asError(value);
  const pending: Error[] = initial === null ? [] : [initial];
  const visited = new WeakSet<Error>();
  let tagged = false;
  let conflictingPrimaryPhases = false;
  let primaryPhase: SubstrateFederatedNativeTwoCycleRootPhaseV1 | null = null;
  let cleanupErrorCount = 0;
  let visitedErrorCount = 0;

  while (pending.length > 0 && visitedErrorCount < MAX_PROJECTED_ERRORS) {
    const current = pending.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    visitedErrorCount++;
    const phase = ROOT_FAILURE_PHASES.get(current);
    if (phase !== undefined) {
      tagged = true;
      if (phase === 'cleanup') cleanupErrorCount++;
      else if (primaryPhase === null) primaryPhase = phase;
      else if (primaryPhase !== phase) conflictingPrimaryPhases = true;
    }
    if (isAggregateError(current)) {
      let nestedErrors: unknown;
      try { nestedErrors = current.errors; } catch { continue; }
      try {
        if (!Array.isArray(nestedErrors)) continue;
        for (const nested of nestedErrors) {
          if (visitedErrorCount + pending.length >= MAX_PROJECTED_ERRORS) break;
          const nestedError = asError(nested);
          if (nestedError !== null) pending.push(nestedError);
        }
      } catch { continue; }
    }
  }
  if (!tagged) return null;
  return Object.freeze({
    primaryPhase: conflictingPrimaryPhases ? null : primaryPhase,
    cleanupErrorCount: Math.min(cleanupErrorCount, MAX_CLEANUP_ERROR_COUNT),
  });
}

function asError(value: unknown): Error | null {
  try { return value instanceof Error ? value : null; } catch { return null; }
}

function isAggregateError(value: Error): value is AggregateError {
  try { return value instanceof AggregateError; } catch { return false; }
}
