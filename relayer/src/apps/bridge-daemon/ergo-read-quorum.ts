import {
  ErgoReadQuorumAdapterError,
  assertErgoReadQuorumObservationProvenance,
  classifyErgoReadQuorumAdapterError,
  observeErgoReadQuorumPair,
  type ErgoReadQuorumClock,
  type ErgoReadQuorumSourcePair,
} from '../../adapters/ergo-read-quorum.js';
import {
  ErgoReadQuorumSupervisor,
  type ErgoReadCycleDecision,
  type ErgoReadQuorumFailureCode,
  type ErgoReadQuorumObservation,
} from '../../relayer-core/ergo-read-quorum-supervisor.js';

export interface ErgoReadQuorumLogger {
  warn(event: 'ergo_read_quorum_held', data: Readonly<{
    code: ErgoReadQuorumFailureCode | 'probe_stale';
    state: 'open' | 'half_open' | 'closed';
    consecutiveFailures: number;
  }>): void;
}

export interface ErgoReadQuorumReadCycleDeps {
  readonly supervisor: ErgoReadQuorumSupervisor;
  readonly sources: ErgoReadQuorumSourcePair | null;
  readonly clock: ErgoReadQuorumClock;
  readonly logger?: ErgoReadQuorumLogger;
}

const ACTIVE_GATES = new WeakSet<ErgoReadQuorumSupervisor>();
const ADMITTED_OBSERVATIONS = new WeakMap<object, Readonly<{
  pair: ErgoReadQuorumSourcePair;
  observation: ErgoReadQuorumObservation;
}>>();

export function requireErgoReadQuorumDecisionObservation(
  pair: ErgoReadQuorumSourcePair,
  decision: ErgoReadCycleDecision,
): ErgoReadQuorumObservation {
  const binding = decision && typeof decision === 'object'
    ? ADMITTED_OBSERVATIONS.get(decision)
    : undefined;
  if (
    decision.decision !== 'allow_read_cycle'
    || !binding
    || binding.pair !== pair
  ) {
    throw new ErgoReadQuorumAdapterError('invalid_response');
  }
  assertErgoReadQuorumObservationProvenance(pair, binding.observation);
  if (
    decision.tip.height !== binding.observation.tipHeight
    || decision.tip.headerIdHex !== binding.observation.tipHeaderIdHex
    || decision.tip.observationDigestHex
      !== binding.observation.observationDigestHex
  ) {
    throw new ErgoReadQuorumAdapterError('invalid_response');
  }
  return binding.observation;
}

export async function runErgoReadQuorumGate(
  deps: ErgoReadQuorumReadCycleDeps,
): Promise<ErgoReadCycleDecision> {
  const clock = deps.clock;
  const pair = deps.sources;
  if (ACTIVE_GATES.has(deps.supervisor)) {
    const concurrentToken = deps.supervisor.beginProbe(clock.now());
    deps.supervisor.recordFailure(concurrentToken, 'probe_stale', clock.now());
    return heldDecision(deps.supervisor, clock, deps.logger, 'probe_stale');
  }
  ACTIVE_GATES.add(deps.supervisor);
  try {
    const token = deps.supervisor.beginProbe(clock.now());
    try {
      if (!pair) {
        deps.supervisor.recordFailure(token, 'not_configured', clock.now());
        return heldDecision(deps.supervisor, clock, deps.logger, 'not_configured');
      }
      const observation = await observeErgoReadQuorumPair(pair, clock);
      assertErgoReadQuorumObservationProvenance(pair, observation);
      if (deps.supervisor.recordSuccess(token, observation, clock.now()) !== 'accepted') {
        return heldDecision(deps.supervisor, clock, deps.logger, 'probe_stale');
      }
      const decision = deps.supervisor.getReadCycleDecision(clock.now());
      if (decision.decision === 'allow_read_cycle') {
        ADMITTED_OBSERVATIONS.set(decision, Object.freeze({
          pair,
          observation,
        }));
        return decision;
      }
      return heldDecision(
        deps.supervisor,
        clock,
        deps.logger,
        decision.snapshot.lastFailureCode ?? 'probe_stale',
      );
    } catch (error) {
      const failure = classifyErgoReadQuorumAdapterError(error).code;
      if (deps.supervisor.recordFailure(token, failure, clock.now()) !== 'accepted') {
        return heldDecision(deps.supervisor, clock, deps.logger, 'probe_stale');
      }
      return heldDecision(deps.supervisor, clock, deps.logger, failure);
    }
  } finally {
    ACTIVE_GATES.delete(deps.supervisor);
  }
}

function heldDecision(
  supervisor: ErgoReadQuorumSupervisor,
  clock: ErgoReadQuorumClock,
  logger: ErgoReadQuorumLogger | undefined,
  code: ErgoReadQuorumFailureCode | 'probe_stale',
): ErgoReadCycleDecision {
  let decision = supervisor.getReadCycleDecision(clock.now());
  if (decision.decision === 'allow_read_cycle') {
    const token = supervisor.beginProbe(clock.now());
    supervisor.recordFailure(token, code, clock.now());
    decision = supervisor.getReadCycleDecision(clock.now());
  }
  if (decision.decision !== 'hold_read_cycle') {
    throw new Error('Ergo read-quorum hold decision could not be established');
  }
  logger?.warn('ergo_read_quorum_held', Object.freeze({
    code,
    state: decision.snapshot.state,
    consecutiveFailures: decision.snapshot.consecutiveFailures,
  }));
  return decision;
}
