import { types } from 'node:util';

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
const MAX_PROJECTED_VALUES = 64;
const MAX_CLEANUP_ERROR_COUNT = 32;

export function tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1<T>(
  value: T,
  phase: SubstrateFederatedNativeTwoCycleRootPhaseV1,
): T {
  const error = asError(value);
  if (error !== null && !ROOT_FAILURE_PHASES.has(error)) ROOT_FAILURE_PHASES.set(error, phase);
  return value;
}

/** The error's own tag, without recursively borrowing an aggregate child's phase. */
export function projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(
  value: unknown,
): SubstrateFederatedNativeTwoCycleRootPhaseV1 | null {
  const error = asError(value);
  return error === null ? null : ROOT_FAILURE_PHASES.get(error) ?? null;
}

export function projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(
  value: unknown,
): Readonly<SubstrateFederatedNativeTwoCycleRootFailurePhaseV1> | null {
  const pending: unknown[] = [value];
  const visited = new WeakSet<Error>();
  let tagged = false;
  let conflictingPrimaryPhases = false;
  let primaryPhase: SubstrateFederatedNativeTwoCycleRootPhaseV1 | null = null;
  let cleanupErrorCount = 0;
  let inspectedValueCount = 1; // The root and every aggregate member share one budget.

  try {
    while (pending.length > 0) {
      const current = pending.shift();
      if (current === null || (typeof current !== 'object' && typeof current !== 'function')) continue;
      if (types.isProxy(current)) return null;
      let prototype: object | null = current;
      let errorPrototype = false;
      let aggregatePrototype = false;
      for (let depth = 0; prototype !== null; depth++) {
        if (depth >= MAX_PROJECTED_VALUES || types.isProxy(prototype)) return null;
        if (prototype === Error.prototype) errorPrototype = true;
        if (prototype === AggregateError.prototype) aggregatePrototype = true;
        prototype = Object.getPrototypeOf(prototype);
      }
      const errors = Object.getOwnPropertyDescriptor(current, 'errors');
      if (!types.isNativeError(current)) {
        if (errors !== undefined) return null;
        continue;
      }
      if (!errorPrototype || (!aggregatePrototype && errors !== undefined)) return null;
      if (visited.has(current)) continue;
      visited.add(current);
      const phase = ROOT_FAILURE_PHASES.get(current);
      if (phase !== undefined) {
        tagged = true;
        if (phase === 'cleanup') cleanupErrorCount++;
        else if (primaryPhase === null) primaryPhase = phase;
        else if (primaryPhase !== phase) conflictingPrimaryPhases = true;
      }
      if (aggregatePrototype) {
        if (errors === undefined || !('value' in errors)) return null;
        const nestedErrors: unknown = errors.value;
        if (types.isProxy(nestedErrors) || !Array.isArray(nestedErrors)
          || Object.getPrototypeOf(nestedErrors) !== Array.prototype) return null;
        const length = Object.getOwnPropertyDescriptor(nestedErrors, 'length');
        if (length === undefined || !('value' in length)) return null;
        const nestedCount: unknown = length.value;
        if (typeof nestedCount !== 'number' || !Number.isSafeInteger(nestedCount) || nestedCount < 0
          || nestedCount > MAX_PROJECTED_VALUES - inspectedValueCount) return null;
        inspectedValueCount += nestedCount;
        for (let index = 0; index < nestedCount; index++) {
          const nested = Object.getOwnPropertyDescriptor(nestedErrors, index);
          if (nested === undefined || !('value' in nested)) return null;
          pending.push(nested.value);
        }
        if (Object.getOwnPropertyDescriptor(nestedErrors, 'length')?.value !== nestedCount) return null;
      }
    }
  } catch {
    return null;
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
