import { types } from 'node:util';
import { projectNativeTwoCycleCycleStepFailureV1, projectOwnNativeTwoCycleCycleStepFailureV1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';

export const NATIVE_GENESIS_SETUP_FAILURE_STAGES_V1 = Object.freeze([
  'session-entry', 'compiled-target-validation', 'retained-signer-validation',
  'node-origin-validation', 'request-construction', 'check-entry',
  'request-validation', 'pre-sign-observation', 'signing-context',
  'unsigned-id-validation', 'wasm-signing', 'signed-candidate-validation',
  'pre-check-observation', 'tracker-node-check', 'duplicate-prevention-node-check',
  'pooled-reserve-node-check', 'post-check-observation', 'final-request-validation',
  'check-receipt', 'retained-batch-promotion',
] as const);
export type NativeGenesisSetupFailureStageV1 = typeof NATIVE_GENESIS_SETUP_FAILURE_STAGES_V1[number];
const STAGES = new WeakMap<Error, NativeGenesisSetupFailureStageV1>();
const CONFLICTS = new WeakSet<Error>();

/** Only invocation-local diagnostic metadata; the original thrown value is unchanged. */
export function tagNativeGenesisSetupFailureStageV1<T>(value: T, stage: NativeGenesisSetupFailureStageV1): T {
  const error = asError(value);
  if (error === null) return value;
  if (!NATIVE_GENESIS_SETUP_FAILURE_STAGES_V1.includes(stage)) CONFLICTS.add(error);
  else {
    const previous = STAGES.get(error);
    if (previous === undefined) STAGES.set(error, stage);
    else if (previous !== stage) CONFLICTS.add(error);
  }
  return value;
}

export function projectOwnNativeGenesisSetupFailureStageV1(value: unknown): NativeGenesisSetupFailureStageV1 | null {
  const error = asError(value);
  return error === null || CONFLICTS.has(error) ? null : STAGES.get(error) ?? null;
}

/** Require the actual stage-bearing primary error's own cycle and step, never borrowed cleanup detail. */
export function projectNativeTwoCycleSetupFailureStageV1(value: unknown): NativeGenesisSetupFailureStageV1 | null {
  try {
    // This validates the complete bounded aggregate graph before any traversal below.
    const step = projectNativeTwoCycleCycleStepFailureV1(value);
    if (step?.cycle !== 'cycle-1' || step.step !== 'setup-check') return null;
    const pending: { value: unknown; cleanupAncestor: boolean }[] = [{ value, cleanupAncestor: false }];
    // A shared aggregate must be traversed in both ancestry contexts. Deduping
    // solely by Error identity would hide its later reachability under cleanup.
    const seen = new WeakMap<Error, number>();
    let result: NativeGenesisSetupFailureStageV1 | null = null;
    let tagged = 0;
    let inspected = 0;
    while (pending.length > 0) {
      if (++inspected > 64) return null;
      const next = pending.pop()!;
      const current = asError(next.value);
      if (current === null) return null;
      const ownPhase = projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(current);
      const cleanupAncestor = next.cleanupAncestor || ownPhase === 'cleanup';
      if (CONFLICTS.has(current)) return null;
      const stage = STAGES.get(current);
      if (stage !== undefined && cleanupAncestor) return null;
      const context = cleanupAncestor ? 2 : 1;
      const previous = seen.get(current) ?? 0;
      if ((previous & context) !== 0) continue;
      seen.set(current, previous | context);
      if (stage !== undefined) {
        if (++tagged > 1 || ownPhase !== 'cycle-1') return null;
        const ownStep = projectOwnNativeTwoCycleCycleStepFailureV1(current);
        if (ownStep?.cycle !== 'cycle-1' || ownStep.step !== 'setup-check') return null;
        result = stage;
      }
      if (current instanceof AggregateError) {
        const children: unknown = Object.getOwnPropertyDescriptor(current, 'errors')?.value;
        if (types.isProxy(children) || !Array.isArray(children)) return null;
        const length: unknown = Object.getOwnPropertyDescriptor(children, 'length')?.value;
        if (!Number.isSafeInteger(length) || (length as number) < 0
          || (length as number) > 64 - inspected) return null;
        for (let i = 0; i < (length as number); i++) {
          const descriptor = Object.getOwnPropertyDescriptor(children, String(i));
          if (descriptor === undefined || !('value' in descriptor)) return null;
          pending.push({ value: descriptor.value, cleanupAncestor });
        }
      }
    }
    return result;
  } catch { return null; }
}

function asError(value: unknown): Error | null {
  try {
    if (types.isProxy(value) || !types.isNativeError(value)) return null;
    let current: object | null = Object.getPrototypeOf(value);
    let depth = 0;
    while (current !== null) {
      if (++depth > 64 || types.isProxy(current)) return null;
      current = Object.getPrototypeOf(current);
    }
    return value instanceof Error ? value : null;
  } catch { return null; }
}
