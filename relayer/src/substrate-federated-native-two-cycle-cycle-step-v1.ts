import { types } from 'node:util';

import {
  projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2,
} from './substrate-federated-native-two-cycle-root-phase-v2.js';
import { projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1 }
  from './substrate-federated-native-two-cycle-root-phase-v1.js';

export const NATIVE_TWO_CYCLE_CYCLE_STEPS_V1 = Object.freeze([
  'target-entry',
  'genesis-observation',
  'setup-check',
  'journal-initialization',
  'issuance-execution',
  'issuance-confirmation',
  'issuance-output-observation',
  'genesis-reobservation',
  'deposit-funding',
  'deposit-construction',
  'source-lock',
  'committed-reserve',
  'source-proof',
  'native-mint-burn',
  'withdrawal-fee-check',
  'withdrawal-fee-funding',
  'tracker-fee-check',
  'tracker-fee-funding',
  'fee-input-validation',
  'reserve-confirmation',
  'checkpoint-attestation',
  'target-exit',
  'return-preparation',
  'checkpoint-anchor',
  'tracker-observation',
  'tracker-context',
  'tracker-transaction',
  'tracker-check',
  'tracker-authorization',
  'tracker-reservation',
  'tracker-revalidation',
  'tracker-transport',
  'tracker-confirmation',
  'withdrawal-check',
  'withdrawal-authorization',
  'withdrawal-reservation',
  'withdrawal-transport',
  'withdrawal-confirmation',
  'continuation-preparation',
  'cycle-summary',
] as const);

export type NativeTwoCycleCycleStepV1 = typeof NATIVE_TWO_CYCLE_CYCLE_STEPS_V1[number];
type Cycle = 'cycle-1' | 'cycle-2';
interface CycleStepFailure {
  readonly cycle: Cycle;
  readonly step: NativeTwoCycleCycleStepV1;
}

const STEP_FAILURES = new WeakMap<Error, Readonly<CycleStepFailure>>();
const CONFLICTING_STEP_FAILURES = new WeakSet<Error>();
const MAX_INSPECTED_VALUES = 64;

/** Optional metadata only; the thrown value and existing root phases are unchanged. */
export function tagNativeTwoCycleCycleStepFailureV1<T>(
  value: T,
  cycle: Cycle,
  step: NativeTwoCycleCycleStepV1,
): T {
  const error = asError(value);
  if (error === null) return value;
  if (!isCycle(cycle) || !isStep(step)) {
    CONFLICTING_STEP_FAILURES.add(error);
    return value;
  }
  const previous = STEP_FAILURES.get(error);
  if (previous === undefined) STEP_FAILURES.set(error, Object.freeze({ cycle, step }));
  else if (previous.cycle !== cycle || previous.step !== step) {
    CONFLICTING_STEP_FAILURES.add(error);
  }
  return value;
}

export function projectNativeTwoCycleCycleStepFailureV1(
  value: unknown,
): Readonly<CycleStepFailure> | null {
  const initial = asError(value);
  if (initial === null) return null;
  const visited = new WeakSet<Error>();
  const active = new WeakSet<Error>();
  const tagged: Error[] = [];
  let inspectedValues = 0;
  let projection: Readonly<CycleStepFailure> | null = null;

  // Validate the complete bounded graph before the legacy coarse projector can
  // iterate aggregates. No getters, proxies or custom iterators enter that call.
  const inspect = (currentValue: unknown): boolean => {
    if (++inspectedValues > MAX_INSPECTED_VALUES) return false;
    const current = asError(currentValue);
    if (current === null || active.has(current)) return false;
    if (visited.has(current)) return true;
    visited.add(current);
    if (CONFLICTING_STEP_FAILURES.has(current)) return false;
    const step = STEP_FAILURES.get(current);
    if (step !== undefined) {
      if (projection !== null
        && (projection.cycle !== step.cycle || projection.step !== step.step)) return false;
      projection = step;
      tagged.push(current);
    }
    if (!(current instanceof AggregateError)) return true;
    const descriptor = Object.getOwnPropertyDescriptor(current, 'errors');
    if (descriptor === undefined || !('value' in descriptor)) return false;
    const children: unknown = descriptor.value;
    if (types.isProxy(children) || !Array.isArray(children)
      || Object.getPrototypeOf(children) !== Array.prototype
      || Object.getOwnPropertyDescriptor(children, Symbol.iterator) !== undefined) return false;
    const length = Object.getOwnPropertyDescriptor(children, 'length')?.value;
    if (!Number.isSafeInteger(length) || length < 0
      || length > MAX_INSPECTED_VALUES - inspectedValues) return false;
    active.add(current);
    try {
      for (let index = 0; index < length; index++) {
        const child = Object.getOwnPropertyDescriptor(children, String(index));
        if (child === undefined || !('value' in child) || !inspect(child.value)) return false;
      }
    } finally { active.delete(current); }
    return true;
  };

  try {
    if (!inspect(initial) || tagged.length === 0) return null;
    const resolved = STEP_FAILURES.get(tagged[0]);
    if (resolved === undefined) return null;
    const coarse = projectSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(initial);
    if (coarse?.primaryPhase !== resolved.cycle) return null;
    for (const error of tagged) {
      // A cleanup child must not borrow the cycle of another primary error.
      if (projectOwnSubstrateFederatedNativeTwoCycleRootFailurePhaseV1(error) !== resolved.cycle) return null;
    }
    return Object.freeze({ cycle: resolved.cycle, step: resolved.step });
  } catch { return null; }
}

function isCycle(value: unknown): value is Cycle {
  return value === 'cycle-1' || value === 'cycle-2';
}

function isStep(value: unknown): value is NativeTwoCycleCycleStepV1 {
  return typeof value === 'string'
    && NATIVE_TWO_CYCLE_CYCLE_STEPS_V1.includes(value as NativeTwoCycleCycleStepV1);
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
