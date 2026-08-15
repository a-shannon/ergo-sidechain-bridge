export const ERGO_READ_QUORUM_OBSERVATION_SCHEMA =
  'e2s.ergo-read-quorum-observation.v1' as const;
export const ERGO_READ_QUORUM_SNAPSHOT_SCHEMA =
  'e2s.ergo-read-quorum-snapshot.v1' as const;

export type ErgoReadQuorumState = 'open' | 'half_open' | 'closed';

export type ErgoReadQuorumFailureCode =
  | 'not_configured'
  | 'source_unavailable'
  | 'invalid_response'
  | 'source_unstable'
  | 'source_disagreement'
  | 'probe_stale'
  | 'unexpected_failure';

export interface ErgoReadQuorumObservation {
  readonly schema: typeof ERGO_READ_QUORUM_OBSERVATION_SCHEMA;
  readonly sourceIdsHex: readonly [string, string];
  readonly tipHeight: number;
  readonly tipHeaderIdHex: string;
  readonly observationDigestHex: string;
  readonly startedAtMs: number;
  readonly completedAtMs: number;
}

export interface ErgoReadQuorumProbeToken {
  readonly generation: number;
}

export interface ErgoReadQuorumSnapshot {
  readonly schema: typeof ERGO_READ_QUORUM_SNAPSHOT_SCHEMA;
  readonly state: ErgoReadQuorumState;
  readonly fundsReleaseHeld: boolean;
  readonly activeGeneration: number | null;
  readonly consecutiveFailures: number;
  readonly reason: ErgoReadQuorumFailureCode | null;
  readonly lastFailureCode: ErgoReadQuorumFailureCode | null;
  readonly lastAcceptedObservation: Readonly<{
    sourceIdsHex: readonly [string, string];
    tipHeight: number;
    tipHeaderIdHex: string;
    observationDigestHex: string;
    completedAtMs: number;
  }> | null;
}

export type ErgoReadCycleDecision =
  | Readonly<{
      decision: 'allow_read_cycle';
      tip: Readonly<{
        height: number;
        headerIdHex: string;
        observationDigestHex: string;
      }>;
      snapshot: ErgoReadQuorumSnapshot;
    }>
  | Readonly<{
      decision: 'hold_read_cycle';
      tip: null;
      snapshot: ErgoReadQuorumSnapshot;
    }>;

export type ErgoReadQuorumGateResult = ErgoReadCycleDecision;

export type ErgoReadQuorumRecordResult = 'accepted' | 'stale';

const PROBE_TOKENS = new WeakMap<object, Readonly<{
  owner: object;
  generation: number;
}>>();
const READ_CYCLE_DECISIONS = new WeakMap<object, Readonly<{
  owner: object;
  generation: number;
  observationDigestHex: string;
}>>();

const FAILURE_CODES = new Set<ErgoReadQuorumFailureCode>([
  'not_configured',
  'source_unavailable',
  'invalid_response',
  'source_unstable',
  'source_disagreement',
  'probe_stale',
  'unexpected_failure',
]);

function normalizeSafeTimestamp(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function normalizeHex32(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be 32 bytes of hex`);
  }
  const normalized = value.trim().replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${label} must be 32 bytes of hex`);
  }
  return normalized;
}

function normalizeFailureCode(value: unknown): ErgoReadQuorumFailureCode {
  if (typeof value !== 'string' || !FAILURE_CODES.has(value as ErgoReadQuorumFailureCode)) {
    throw new Error('unsupported Ergo read-quorum failure code');
  }
  return value as ErgoReadQuorumFailureCode;
}

function normalizeObservation(value: unknown): ErgoReadQuorumObservation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Ergo read-quorum observation must be an object');
  }
  const raw = value as Record<string, unknown>;
  if (raw.schema !== ERGO_READ_QUORUM_OBSERVATION_SCHEMA) {
    throw new Error('unsupported Ergo read-quorum observation schema');
  }
  if (!Array.isArray(raw.sourceIdsHex) || raw.sourceIdsHex.length !== 2) {
    throw new Error('Ergo read-quorum observation requires exactly two source IDs');
  }
  const sourceIdsHex = raw.sourceIdsHex.map((sourceId, index) =>
    normalizeHex32(sourceId, `Ergo read-quorum source ID ${index}`),
  ).sort();
  if (sourceIdsHex[0] === sourceIdsHex[1]) {
    throw new Error('Ergo read-quorum observation source IDs must be distinct');
  }
  const startedAtMs = normalizeSafeTimestamp(raw.startedAtMs, 'Ergo read-quorum probe start');
  const completedAtMs = normalizeSafeTimestamp(raw.completedAtMs, 'Ergo read-quorum probe completion');
  if (completedAtMs < startedAtMs) {
    throw new Error('Ergo read-quorum probe completion precedes its start');
  }
  const tipHeight = normalizeSafeTimestamp(raw.tipHeight, 'Ergo read-quorum tip height');
  return Object.freeze({
    schema: ERGO_READ_QUORUM_OBSERVATION_SCHEMA,
    sourceIdsHex: Object.freeze([sourceIdsHex[0], sourceIdsHex[1]]) as readonly [string, string],
    tipHeight,
    tipHeaderIdHex: normalizeHex32(raw.tipHeaderIdHex, 'Ergo read-quorum tip header ID'),
    observationDigestHex: normalizeHex32(
      raw.observationDigestHex,
      'Ergo read-quorum observation digest',
    ),
    startedAtMs,
    completedAtMs,
  });
}

export class ErgoReadQuorumSupervisor {
  private readonly owner = Object.freeze({});
  private readonly maxAgeMs: number;
  private state: ErgoReadQuorumState = 'open';
  private generation = 0;
  private activeGeneration: number | null = null;
  private activeProbeStartedAtMs: number | null = null;
  private acceptedGeneration: number | null = null;
  private consecutiveFailures = 0;
  private lastFailureCode: ErgoReadQuorumFailureCode | null = 'not_configured';
  private lastAcceptedObservation: ErgoReadQuorumObservation | null = null;

  public constructor(input: Readonly<{ maxAgeMs: number }>) {
    if (!Number.isSafeInteger(input.maxAgeMs) || input.maxAgeMs <= 0) {
      throw new Error('Ergo read-quorum maxAgeMs must be a positive safe integer');
    }
    this.maxAgeMs = input.maxAgeMs;
  }

  public beginProbe(nowMs: number): ErgoReadQuorumProbeToken {
    normalizeSafeTimestamp(nowMs, 'Ergo read-quorum probe start');
    this.expireIfNeeded(nowMs);
    this.generation += 1;
    this.activeGeneration = this.generation;
    this.activeProbeStartedAtMs = nowMs;
    this.state = 'half_open';
    const token = Object.freeze({ generation: this.generation });
    PROBE_TOKENS.set(token, Object.freeze({
      owner: this.owner,
      generation: this.generation,
    }));
    return token;
  }

  public recordSuccess(
    token: ErgoReadQuorumProbeToken,
    observation: ErgoReadQuorumObservation,
    nowMs: number,
  ): ErgoReadQuorumRecordResult {
    const now = normalizeSafeTimestamp(nowMs, 'Ergo read-quorum success time');
    if (!this.isCurrentToken(token)) return 'stale';

    let normalized: ErgoReadQuorumObservation;
    try {
      normalized = normalizeObservation(observation);
    } catch {
      this.recordCurrentFailure('invalid_response');
      return 'accepted';
    }
    if (
      this.activeProbeStartedAtMs === null
      || normalized.startedAtMs < this.activeProbeStartedAtMs
      || normalized.completedAtMs - normalized.startedAtMs > this.maxAgeMs
      || now < normalized.completedAtMs
      || now - normalized.completedAtMs > this.maxAgeMs
    ) {
      this.recordCurrentFailure('probe_stale');
      return 'accepted';
    }

    this.activeGeneration = null;
    this.activeProbeStartedAtMs = null;
    this.acceptedGeneration = token.generation;
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.lastFailureCode = null;
    this.lastAcceptedObservation = normalized;
    return 'accepted';
  }

  public recordFailure(
    token: ErgoReadQuorumProbeToken,
    failureCode: ErgoReadQuorumFailureCode,
    nowMs: number,
  ): ErgoReadQuorumRecordResult {
    normalizeSafeTimestamp(nowMs, 'Ergo read-quorum failure time');
    const normalizedFailureCode = normalizeFailureCode(failureCode);
    if (!this.isCurrentToken(token)) return 'stale';
    this.recordCurrentFailure(normalizedFailureCode);
    return 'accepted';
  }

  public getSnapshot(nowMs: number): ErgoReadQuorumSnapshot {
    const now = normalizeSafeTimestamp(nowMs, 'Ergo read-quorum snapshot time');
    this.expireIfNeeded(now);
    return this.buildSnapshot();
  }

  public peekSnapshot(): ErgoReadQuorumSnapshot {
    return this.buildSnapshot();
  }

  private buildSnapshot(): ErgoReadQuorumSnapshot {
    const accepted = this.lastAcceptedObservation;
    return Object.freeze({
      schema: ERGO_READ_QUORUM_SNAPSHOT_SCHEMA,
      state: this.state,
      fundsReleaseHeld: this.state !== 'closed',
      activeGeneration: this.activeGeneration,
      consecutiveFailures: this.consecutiveFailures,
      reason: this.lastFailureCode,
      lastFailureCode: this.lastFailureCode,
      lastAcceptedObservation: accepted === null
        ? null
        : Object.freeze({
            sourceIdsHex: accepted.sourceIdsHex,
            tipHeight: accepted.tipHeight,
            tipHeaderIdHex: accepted.tipHeaderIdHex,
            observationDigestHex: accepted.observationDigestHex,
            completedAtMs: accepted.completedAtMs,
          }),
    });
  }

  public getReadCycleDecision(nowMs: number): ErgoReadCycleDecision {
    const snapshot = this.getSnapshot(nowMs);
    const accepted = this.lastAcceptedObservation;
    if (
      snapshot.state === 'closed'
      && accepted !== null
      && this.acceptedGeneration !== null
    ) {
      const decision = Object.freeze({
        decision: 'allow_read_cycle',
        tip: Object.freeze({
          height: accepted.tipHeight,
          headerIdHex: accepted.tipHeaderIdHex,
          observationDigestHex: accepted.observationDigestHex,
        }),
        snapshot,
      }) satisfies ErgoReadCycleDecision;
      READ_CYCLE_DECISIONS.set(decision, Object.freeze({
        owner: this.owner,
        generation: this.acceptedGeneration,
        observationDigestHex: accepted.observationDigestHex,
      }));
      return decision;
    }
    return Object.freeze({ decision: 'hold_read_cycle', tip: null, snapshot });
  }

  public isReadCycleDecisionCurrent(
    decision: ErgoReadCycleDecision,
    nowMs: number,
  ): boolean {
    const now = normalizeSafeTimestamp(nowMs, 'Ergo read-quorum decision time');
    this.expireIfNeeded(now);
    if (
      decision.decision !== 'allow_read_cycle'
      || this.state !== 'closed'
      || this.acceptedGeneration === null
      || this.lastAcceptedObservation === null
    ) {
      return false;
    }
    const binding = READ_CYCLE_DECISIONS.get(decision);
    return binding?.owner === this.owner
      && binding.generation === this.acceptedGeneration
      && binding.observationDigestHex === this.lastAcceptedObservation.observationDigestHex;
  }

  private isCurrentToken(token: ErgoReadQuorumProbeToken): boolean {
    if (!token || typeof token !== 'object') return false;
    const binding = PROBE_TOKENS.get(token);
    return binding?.owner === this.owner && binding.generation === this.activeGeneration;
  }

  private recordCurrentFailure(failureCode: ErgoReadQuorumFailureCode): void {
    this.activeGeneration = null;
    this.activeProbeStartedAtMs = null;
    this.acceptedGeneration = null;
    this.state = 'open';
    this.consecutiveFailures += 1;
    this.lastFailureCode = failureCode;
  }

  private expireIfNeeded(nowMs: number): void {
    const accepted = this.lastAcceptedObservation;
    if (
      this.state === 'closed'
      && accepted !== null
      && (
        nowMs < accepted.completedAtMs
        || nowMs - accepted.completedAtMs > this.maxAgeMs
      )
    ) {
      this.state = 'open';
      this.activeGeneration = null;
      this.activeProbeStartedAtMs = null;
      this.acceptedGeneration = null;
      this.consecutiveFailures += 1;
      this.lastFailureCode = 'probe_stale';
    }
  }
}
