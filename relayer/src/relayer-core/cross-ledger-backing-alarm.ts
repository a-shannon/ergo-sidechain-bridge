const MAX_SIGNED_LONG = 0x7fff_ffff_ffff_ffffn;
const HEX_32_RE = /^[0-9a-f]{64}$/;

export type OutstandingPegOutLiabilityStatus =
  | 'detected'
  | 'confirmed'
  | 'phase1_created'
  | 'aggregate_submitted'
  | 'batch_submitted'
  | 'phase2_unlocked'
  | 'burn_reverted'
  | 'failed';

export const LEGACY_FAILED_PEG_OUT_CLASS_V1 =
  'legacy_failed_unclassified_v1' as const;

export interface SidechainBackingSnapshotBlock {
  readonly number: number;
  readonly hash: string | null;
}

export interface StableSidechainBackingSnapshot {
  readonly height: number;
  readonly blockHashHex: string;
}

export interface OutstandingPegOutLiabilityObservation {
  readonly burnIdHex: string;
  readonly sidechainIdHex: string;
  readonly sidechainTransactionHashHex: string;
  readonly sidechainBlockHashHex: string;
  readonly sidechainLogIndex: number;
  readonly sidechainBurnHeight: number;
  readonly amountNanoErg: bigint;
  readonly ergoRecipientAddress: string;
  readonly inFlightSettlementTransactionIdHex: string | null;
  readonly phase2UnlockTransactionIdHex: string | null;
  readonly status: OutstandingPegOutLiabilityStatus;
}

export interface CrossLedgerBackingAlarmInput {
  readonly totalSupplyNanoErg: bigint;
  readonly canonicalVaultBackingNanoErg: bigint;
  readonly outstandingPegOuts: readonly OutstandingPegOutLiabilityObservation[];
}

export interface CrossLedgerBackingAlarmProjection {
  readonly totalSupplyNanoErg: bigint;
  readonly pendingExitLiabilityNanoErg: bigint;
  readonly requiredBackingNanoErg: bigint;
  readonly canonicalVaultBackingNanoErg: bigint;
  readonly deficitNanoErg: bigint;
}

function assertNonnegativeSignedLong(value: bigint, label: string): void {
  if (value < 0n || value > MAX_SIGNED_LONG) {
    throw new Error(`${label} must be a nonnegative signed Long`);
  }
}

function assertPositiveSignedLong(value: bigint, label: string): void {
  if (value <= 0n || value > MAX_SIGNED_LONG) {
    throw new Error(`${label} must be a positive signed Long`);
  }
}

function assertHex32(value: string, label: string): void {
  if (!HEX_32_RE.test(value)) {
    throw new Error(`${label} must be canonical lowercase 32-byte hex`);
  }
}

function assertNonnegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
}

const OUTSTANDING_PEG_OUT_LIABILITY_STATUSES: ReadonlySet<string> = new Set([
  'detected',
  'confirmed',
  'phase1_created',
  'aggregate_submitted',
  'batch_submitted',
  'phase2_unlocked',
  'burn_reverted',
  'failed',
]);

export function assertOutstandingPegOutLiabilityObservation(
  observation: OutstandingPegOutLiabilityObservation,
): void {
  assertHex32(observation.burnIdHex, 'peg-out burn ID');
  assertHex32(observation.sidechainIdHex, 'peg-out sidechain ID');
  assertHex32(
    observation.sidechainTransactionHashHex,
    'peg-out sidechain transaction hash',
  );
  assertHex32(observation.sidechainBlockHashHex, 'peg-out sidechain block hash');
  assertNonnegativeSafeInteger(observation.sidechainLogIndex, 'peg-out log index');
  assertNonnegativeSafeInteger(observation.sidechainBurnHeight, 'peg-out burn height');
  assertPositiveSignedLong(observation.amountNanoErg, 'peg-out liability');
  if (
    typeof observation.ergoRecipientAddress !== 'string'
    || observation.ergoRecipientAddress.length === 0
  ) {
    throw new Error('peg-out recipient must be a non-empty string');
  }
  if (observation.inFlightSettlementTransactionIdHex !== null) {
    assertHex32(
      observation.inFlightSettlementTransactionIdHex,
      'peg-out in-flight settlement transaction ID',
    );
  }
  if (observation.phase2UnlockTransactionIdHex !== null) {
    assertHex32(
      observation.phase2UnlockTransactionIdHex,
      'peg-out phase-2 settlement transaction ID',
    );
  }
  if (!OUTSTANDING_PEG_OUT_LIABILITY_STATUSES.has(observation.status)) {
    throw new Error(`unsupported peg-out liability status ${String(observation.status)}`);
  }
  const isSubmitted = observation.status === 'aggregate_submitted'
    || observation.status === 'batch_submitted';
  if (
    isSubmitted
    !== (observation.inFlightSettlementTransactionIdHex !== null)
  ) {
    throw new Error(
      'peg-out submitted liability status and settlement transaction ID must agree',
    );
  }
}

export function normalizeSidechainBlockHashHex(
  value: string,
  label = 'sidechain block hash',
): string {
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  const lowercase = normalized.toLowerCase();
  if (!HEX_32_RE.test(lowercase)) {
    throw new Error(`${label} must be an exact 32-byte hex value`);
  }
  return lowercase;
}

export function assertStableSidechainBackingSnapshot(
  expectedHeight: number,
  before: SidechainBackingSnapshotBlock | null,
  after: SidechainBackingSnapshotBlock | null,
): StableSidechainBackingSnapshot {
  assertNonnegativeSafeInteger(expectedHeight, 'expected sidechain snapshot height');
  if (before === null || after === null) {
    throw new Error('sidechain backing snapshot block is unavailable');
  }
  assertNonnegativeSafeInteger(before.number, 'initial sidechain snapshot height');
  assertNonnegativeSafeInteger(after.number, 'final sidechain snapshot height');
  if (before.number !== expectedHeight || after.number !== expectedHeight) {
    throw new Error('sidechain backing snapshot height does not match the requested height');
  }
  if (before.hash === null || after.hash === null) {
    throw new Error('sidechain backing snapshot block hash is unavailable');
  }
  const beforeHashHex = normalizeSidechainBlockHashHex(
    before.hash,
    'initial sidechain snapshot block hash',
  );
  const afterHashHex = normalizeSidechainBlockHashHex(
    after.hash,
    'final sidechain snapshot block hash',
  );
  if (beforeHashHex !== afterHashHex) {
    throw new Error('sidechain block changed during backing observation');
  }
  return Object.freeze({
    height: expectedHeight,
    blockHashHex: beforeHashHex,
  });
}

/**
 * Project the collateral required by current sERG supply plus burns that a
 * branded upstream reconstruction has retained as pending liabilities. This is
 * a fail-closed local alarm projection, not a solvency certificate or funds
 * authority.
 */
export function projectCrossLedgerBackingAlarm(
  input: CrossLedgerBackingAlarmInput,
): CrossLedgerBackingAlarmProjection {
  assertNonnegativeSignedLong(input.totalSupplyNanoErg, 'sERG total supply');
  assertNonnegativeSignedLong(
    input.canonicalVaultBackingNanoErg,
    'canonical vault backing',
  );

  const seenBurnIds = new Set<string>();
  let pendingExitLiabilityNanoErg = 0n;
  for (const observation of input.outstandingPegOuts) {
    assertOutstandingPegOutLiabilityObservation(observation);
    if (seenBurnIds.has(observation.burnIdHex)) {
      throw new Error(`duplicate peg-out burn identity ${observation.burnIdHex}`);
    }
    seenBurnIds.add(observation.burnIdHex);

    if (observation.status !== 'detected' && observation.status !== 'confirmed') {
      throw new Error(
        `cannot project peg-out status ${observation.status} without canonical Ergo settlement reconstruction`,
      );
    }
    pendingExitLiabilityNanoErg += observation.amountNanoErg;
    assertNonnegativeSignedLong(
      pendingExitLiabilityNanoErg,
      'aggregate pending exit liability',
    );
  }

  const requiredBackingNanoErg =
    input.totalSupplyNanoErg + pendingExitLiabilityNanoErg;
  assertNonnegativeSignedLong(requiredBackingNanoErg, 'required cross-ledger backing');
  const deficitNanoErg = requiredBackingNanoErg
    > input.canonicalVaultBackingNanoErg
    ? requiredBackingNanoErg - input.canonicalVaultBackingNanoErg
    : 0n;

  return Object.freeze({
    totalSupplyNanoErg: input.totalSupplyNanoErg,
    pendingExitLiabilityNanoErg,
    requiredBackingNanoErg,
    canonicalVaultBackingNanoErg: input.canonicalVaultBackingNanoErg,
    deficitNanoErg,
  });
}
