import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_STARTUP_PHASES_V1,
  type SubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseV1,
} from './relayer-core/substrate-federated-isolated-devnet-managed-campaign-phase-v1.js';
import {
  projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1,
  tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1,
  type SubstrateFederatedNativeTwoCycleRootFailurePhaseV1,
  type SubstrateFederatedNativeTwoCycleRootPhaseV1,
} from './substrate-federated-native-two-cycle-root-phase-v1.js';

export interface SubstrateFederatedNativeTwoCycleRootFailurePhaseV2
  extends SubstrateFederatedNativeTwoCycleRootFailurePhaseV1 {
  readonly ergoNodeStartupPhase: SubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseV1 | null;
}

const ERGO_NODE_STARTUP_PHASE_FAILURES = new WeakMap<
  Error,
  SubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseV1
>();
const CONFLICTING_ERGO_NODE_STARTUP_PHASES = new WeakSet<Error>();
const MAX_PROJECTED_ERRORS = 64;

export function tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2<T>(
  value: T,
  phase: SubstrateFederatedNativeTwoCycleRootPhaseV1,
  ergoNodeStartupPhase: SubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseV1 | null = null,
): T {
  tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(value, phase);
  if (phase !== 'node-start' || !isStartupPhase(ergoNodeStartupPhase)) return value;
  const error = asError(value);
  if (error === null) return value;
  const previous = ERGO_NODE_STARTUP_PHASE_FAILURES.get(error);
  if (previous === undefined) ERGO_NODE_STARTUP_PHASE_FAILURES.set(error, ergoNodeStartupPhase);
  else if (previous !== ergoNodeStartupPhase) CONFLICTING_ERGO_NODE_STARTUP_PHASES.add(error);
  return value;
}

export function projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(
  value: unknown,
): Readonly<SubstrateFederatedNativeTwoCycleRootFailurePhaseV2> | null {
  const root = projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(value);
  if (root === null) return null;
  const ergoNodeStartupPhase = root.primaryPhase === 'node-start'
    ? projectStartupPhase(value)
    : null;
  return Object.freeze({ ...root, ergoNodeStartupPhase });
}

function projectStartupPhase(
  value: unknown,
): SubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseV1 | null {
  const initial = asError(value);
  if (initial === null) return null;
  const pending: Error[] = [initial];
  const visited = new WeakSet<Error>();
  let phase: SubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseV1 | null = null;
  let conflict = false;
  let incomplete = false;
  let visitedErrorCount = 0;
  let inspectedErrorValueCount = 1;

  while (pending.length > 0 && visitedErrorCount < MAX_PROJECTED_ERRORS) {
    const current = pending.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    visitedErrorCount++;
    if (CONFLICTING_ERGO_NODE_STARTUP_PHASES.has(current)) conflict = true;
    const currentPhase = ERGO_NODE_STARTUP_PHASE_FAILURES.get(current);
    if (currentPhase !== undefined) {
      if (phase === null) phase = currentPhase;
      else if (phase !== currentPhase) conflict = true;
    }
    if (!isAggregateError(current)) continue;

    let nestedErrors: unknown;
    try { nestedErrors = current.errors; } catch {
      incomplete = true;
      continue;
    }
    try {
      if (!Array.isArray(nestedErrors)) {
        incomplete = true;
        continue;
      }
      const nestedErrorCount = nestedErrors.length;
      if (!Number.isSafeInteger(nestedErrorCount) || nestedErrorCount < 0) {
        incomplete = true;
        continue;
      }
      for (let index = 0; index < nestedErrorCount; index++) {
        if (visitedErrorCount + pending.length >= MAX_PROJECTED_ERRORS
          || inspectedErrorValueCount >= MAX_PROJECTED_ERRORS) {
          incomplete = true;
          break;
        }
        inspectedErrorValueCount++;
        const nested = nestedErrors[index];
        let nestedError: Error | null;
        try { nestedError = nested instanceof Error ? nested : null; }
        catch {
          incomplete = true;
          continue;
        }
        if (nestedError !== null) pending.push(nestedError);
      }
    } catch { incomplete = true; }
  }
  if (pending.length > 0) incomplete = true;
  return conflict || incomplete ? null : phase;
}

function isStartupPhase(
  value: unknown,
): value is SubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseV1 {
  try {
    return typeof value === 'string'
      && SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_STARTUP_PHASES_V1.includes(
        value as SubstrateFederatedIsolatedDevnetErgoNodeStartupPhaseV1,
      );
  } catch { return false; }
}

function asError(value: unknown): Error | null {
  try { return value instanceof Error ? value : null; } catch { return null; }
}

function isAggregateError(value: Error): value is AggregateError {
  try { return value instanceof AggregateError; } catch { return false; }
}
