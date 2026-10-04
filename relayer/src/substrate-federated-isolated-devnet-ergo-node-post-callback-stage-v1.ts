import { types } from 'node:util';

import { projectNativeTwoCycleCycleStepFailureV1, projectOwnNativeTwoCycleCycleStepFailureV1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';

export const ISOLATED_ERGO_NODE_POST_CALLBACK_STAGES_V1 = Object.freeze([
  'completion-check', 'mining-shutdown', 'ownership-recheck',
  'read-only-restart', 'read-only-validation', 'receipt-finalization',
] as const);
export type IsolatedErgoNodePostCallbackStageV1 =
  typeof ISOLATED_ERGO_NODE_POST_CALLBACK_STAGES_V1[number];

const STAGES = new WeakMap<Error, IsolatedErgoNodePostCallbackStageV1>();
const CONFLICTS = new WeakSet<Error>();
const MAX_INSPECTED_VALUES = 64;

/** Invocation-local failure detail only; it neither changes the thrown value nor grants authority. */
export function tagIsolatedErgoNodePostCallbackStageV1<T>(
  value: T, stage: IsolatedErgoNodePostCallbackStageV1,
): T {
  const error = asError(value);
  if (error === null) return value;
  if (!ISOLATED_ERGO_NODE_POST_CALLBACK_STAGES_V1.includes(stage)) {
    CONFLICTS.add(error);
    return value;
  }
  const previous = STAGES.get(error);
  if (previous === undefined) STAGES.set(error, stage);
  else if (previous !== stage) CONFLICTS.add(error);
  return value;
}

export function projectOwnIsolatedErgoNodePostCallbackStageV1(
  value: unknown,
): IsolatedErgoNodePostCallbackStageV1 | null {
  const error = asError(value);
  return error === null || CONFLICTS.has(error) ? null : STAGES.get(error) ?? null;
}

/** The owner-tagged error must itself be the cycle-1 summary failure, never a cleanup child. */
export function projectNativeTwoCycleErgoNodePostCallbackStageV1(
  value: unknown,
): IsolatedErgoNodePostCallbackStageV1 | null {
  try {
    const step = projectNativeTwoCycleCycleStepFailureV1(value);
    if (step?.cycle !== 'cycle-1' || step.step !== 'cycle-summary') return null;
    const initial = asError(value);
    if (initial === null) return null;
    const pending: { error: Error; cleanupAncestor: boolean; primaryPath: boolean }[] = [
      { error: initial, cleanupAncestor: false, primaryPath: true },
    ];
    const seen = new WeakMap<Error, number>();
    let found: IsolatedErgoNodePostCallbackStageV1 | null = null;
    let tagged = 0;
    let inspected = 0;
    while (pending.length > 0) {
      if (++inspected > MAX_INSPECTED_VALUES) return null;
      const { error, cleanupAncestor: inheritedCleanup, primaryPath } = pending.pop()!;
      const ownPhase = projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(error);
      const cleanupAncestor = inheritedCleanup || ownPhase === 'cleanup';
      if (CONFLICTS.has(error)) return null;
      const stage = STAGES.get(error);
      if (stage !== undefined && (cleanupAncestor || !primaryPath)) return null;
      const context = 1 << ((cleanupAncestor ? 2 : 0) + (primaryPath ? 1 : 0));
      const previous = seen.get(error) ?? 0;
      if ((previous & context) !== 0) continue;
      seen.set(error, previous | context);
      if (stage !== undefined) {
        const ownStep = projectOwnNativeTwoCycleCycleStepFailureV1(error);
        if (++tagged > 1 || ownPhase !== 'cycle-1'
          || ownStep?.cycle !== 'cycle-1' || ownStep.step !== 'cycle-summary') return null;
        found = stage;
      }
      if (!(error instanceof AggregateError)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(error, 'errors');
      if (descriptor === undefined || !('value' in descriptor)) return null;
      const children: unknown = descriptor.value;
      if (types.isProxy(children) || !Array.isArray(children)
        || Object.getPrototypeOf(children) !== Array.prototype
        || Object.getOwnPropertyDescriptor(children, Symbol.iterator) !== undefined) return null;
      const length: unknown = Object.getOwnPropertyDescriptor(children, 'length')?.value;
      if (!Number.isSafeInteger(length) || (length as number) < 0
        || (length as number) > MAX_INSPECTED_VALUES - inspected) return null;
      for (let index = 0; index < (length as number); index++) {
        const child = Object.getOwnPropertyDescriptor(children, String(index));
        if (child === undefined || !('value' in child)) return null;
        const nested = asError(child.value);
        if (nested === null) return null;
        pending.push({ error: nested, cleanupAncestor, primaryPath: primaryPath && index === 0 });
      }
    }
    return tagged === 1 ? found : null;
  } catch { return null; }
}

function asError(value: unknown): Error | null {
  try {
    if (types.isProxy(value) || !types.isNativeError(value)) return null;
    let prototype: object | null = Object.getPrototypeOf(value);
    let depth = 0;
    while (prototype !== null) {
      if (++depth > MAX_INSPECTED_VALUES || types.isProxy(prototype)) return null;
      prototype = Object.getPrototypeOf(prototype);
    }
    return value instanceof Error ? value : null;
  } catch { return null; }
}
