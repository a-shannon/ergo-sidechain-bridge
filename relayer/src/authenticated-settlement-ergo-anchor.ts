import { createHash } from 'crypto';

import type { ErgoClient } from './ergo-client.js';
import type { PreparedAuthenticatedSettlementUnsignedTx } from './aggregate-settlement-service.js';
import type { BoxLike } from './aggregate-settlement-tx.js';
import type { AuthenticatedSettlementCandidate } from './state-tracker.js';

type AnchorErgoClient = Pick<ErgoClient, 'getCurrentHeight' | 'getBlockHeaderHash'>;
type StableViewErgoClient = Pick<
  ErgoClient,
  'getCurrentHeight' | 'getBlockHeaderHash' | 'getBoxByIdOrNull'
>;
type AnchorCandidate = Pick<
  AuthenticatedSettlementCandidate,
  'anchorHeaderHeight' | 'anchorHeaderId' | 'creationHeight'
>;
type StableViewCandidate = Pick<
  AuthenticatedSettlementCandidate,
  | 'candidateId'
  | 'anchorHeaderHeight'
  | 'anchorHeaderId'
  | 'creationHeight'
  | 'trackerBoxId'
  | 'dupInputBoxId'
  | 'vaultBoxId'
  | 'unsignedTxDigest'
>;

const STABLE_ERGO_VIEWS = new WeakSet<object>();

export interface AuthenticatedSettlementStableErgoView {
  candidateId: string;
  observedTipHeight: number;
  observedTipHeaderIdHex: string;
  anchorHeaderHeight: number;
  anchorHeaderIdHex: string;
  trackerBoxIdHex: string;
  duplicatePreventionBoxIdHex: string;
  vaultBoxIdHex: string;
  inputSetDigestHex: string;
  unsignedTxDigestHex: string;
  viewDigestHex: string;
}

export async function assertCanonicalAuthenticatedSettlementErgoAnchor(
  ergo: AnchorErgoClient,
  candidate: AnchorCandidate,
  minimumConfirmations: number,
): Promise<void> {
  if (!Number.isSafeInteger(minimumConfirmations) || minimumConfirmations <= 0) {
    throw new Error('authenticated settlement anchor confirmations must be positive');
  }
  const [currentHeight, anchorHeaderId] = await Promise.all([
    ergo.getCurrentHeight(),
    ergo.getBlockHeaderHash(candidate.anchorHeaderHeight),
  ]);
  if (
    fixedHex(anchorHeaderId, 'live anchor header ID')
    !== fixedHex(candidate.anchorHeaderId, 'candidate anchor header ID')
  ) {
    throw new Error('candidate Ergo anchor is no longer on the canonical chain');
  }
  if (currentHeight < candidate.creationHeight) {
    throw new Error('live Ergo height precedes the journaled transaction creation height');
  }
  if (currentHeight - candidate.anchorHeaderHeight < minimumConfirmations) {
    throw new Error('candidate Ergo anchor no longer has the required confirmation depth');
  }
}

export async function observeAuthenticatedSettlementStableErgoView(input: {
  ergo: StableViewErgoClient;
  candidate: StableViewCandidate;
  prepared: PreparedAuthenticatedSettlementUnsignedTx;
  minimumConfirmations: number;
}): Promise<AuthenticatedSettlementStableErgoView> {
  const candidateId = fixedHex(input.candidate.candidateId, 'candidate ID');
  const trackerBoxIdHex = fixedHex(input.candidate.trackerBoxId, 'candidate tracker box ID');
  const duplicatePreventionBoxIdHex = fixedHex(
    input.candidate.dupInputBoxId,
    'candidate DUP box ID',
  );
  const vaultBoxIdHex = fixedHex(input.candidate.vaultBoxId, 'candidate vault box ID');
  const unsignedTxDigestHex = fixedHex(
    input.candidate.unsignedTxDigest,
    'candidate unsigned transaction digest',
  );
  if (
    fixedHex(input.prepared.trackerBox.boxId, 'prepared tracker box ID') !== trackerBoxIdHex
    || fixedHex(input.prepared.authenticatedDupBox.boxId, 'prepared DUP box ID')
      !== duplicatePreventionBoxIdHex
    || fixedHex(input.prepared.unlockBox.boxId, 'prepared vault box ID') !== vaultBoxIdHex
  ) {
    throw new Error('prepared authenticated settlement inputs do not match the journaled candidate');
  }
  if (sha256Canonical(input.prepared.eip12Tx) !== unsignedTxDigestHex) {
    throw new Error('prepared authenticated settlement transaction does not match the journaled digest');
  }

  const observedTipHeightBefore = await input.ergo.getCurrentHeight();
  const observedTipHeaderIdBefore = fixedHex(
    await input.ergo.getBlockHeaderHash(observedTipHeightBefore),
    'live Ergo tip header ID',
  );
  const [anchorHeaderId, trackerBox, duplicatePreventionBox, vaultBox] = await Promise.all([
    input.ergo.getBlockHeaderHash(input.candidate.anchorHeaderHeight),
    input.ergo.getBoxByIdOrNull(trackerBoxIdHex),
    input.ergo.getBoxByIdOrNull(duplicatePreventionBoxIdHex),
    input.ergo.getBoxByIdOrNull(vaultBoxIdHex),
  ]);
  const observedTipHeightAfter = await input.ergo.getCurrentHeight();
  const observedTipHeaderIdAfter = fixedHex(
    await input.ergo.getBlockHeaderHash(observedTipHeightAfter),
    'rechecked Ergo tip header ID',
  );
  if (
    observedTipHeightBefore !== observedTipHeightAfter
    || observedTipHeaderIdBefore !== observedTipHeaderIdAfter
  ) {
    throw new Error('Ergo canonical view changed while settlement inputs were observed');
  }
  assertAnchorAtHeight(
    observedTipHeightAfter,
    anchorHeaderId,
    input.candidate,
    input.minimumConfirmations,
  );
  if (!trackerBox || !duplicatePreventionBox || !vaultBox) {
    throw new Error('authenticated settlement input is spent or unavailable in the stable Ergo view');
  }

  const normalizedInputs = {
    tracker: normalizeBox(trackerBox, 'live tracker box'),
    duplicatePrevention: normalizeBox(duplicatePreventionBox, 'live DUP box'),
    vault: normalizeBox(vaultBox, 'live vault box'),
  };
  const expectedInputs = {
    tracker: normalizeBox(input.prepared.trackerBox, 'prepared tracker box'),
    duplicatePrevention: normalizeBox(input.prepared.authenticatedDupBox, 'prepared DUP box'),
    vault: normalizeBox(input.prepared.unlockBox, 'prepared vault box'),
  };
  if (canonicalJson(normalizedInputs) !== canonicalJson(expectedInputs)) {
    throw new Error('live authenticated settlement input content does not match the checked transaction');
  }

  const viewBinding = {
    candidateId,
    observedTipHeight: observedTipHeightAfter,
    observedTipHeaderIdHex: observedTipHeaderIdAfter,
    anchorHeaderHeight: input.candidate.anchorHeaderHeight,
    anchorHeaderIdHex: fixedHex(anchorHeaderId, 'live anchor header ID'),
    trackerBoxIdHex,
    duplicatePreventionBoxIdHex,
    vaultBoxIdHex,
    inputSetDigestHex: sha256Canonical(normalizedInputs),
    unsignedTxDigestHex,
  };
  const view = Object.freeze({
    ...viewBinding,
    viewDigestHex: sha256Canonical(viewBinding),
  });
  STABLE_ERGO_VIEWS.add(view);
  return view;
}

export function assertAuthenticatedSettlementStableErgoViewProvenance(
  view: unknown,
): asserts view is AuthenticatedSettlementStableErgoView {
  if (typeof view !== 'object' || view === null || !STABLE_ERGO_VIEWS.has(view)) {
    throw new Error('authenticated settlement stable Ergo view provenance is missing');
  }
}

function assertAnchorAtHeight(
  currentHeight: number,
  anchorHeaderId: string,
  candidate: AnchorCandidate,
  minimumConfirmations: number,
): void {
  if (!Number.isSafeInteger(currentHeight) || currentHeight < 0) {
    throw new Error('live Ergo height must be a nonnegative safe integer');
  }
  if (!Number.isSafeInteger(minimumConfirmations) || minimumConfirmations <= 0) {
    throw new Error('authenticated settlement anchor confirmations must be positive');
  }
  if (
    fixedHex(anchorHeaderId, 'live anchor header ID')
    !== fixedHex(candidate.anchorHeaderId, 'candidate anchor header ID')
  ) {
    throw new Error('candidate Ergo anchor is no longer on the canonical chain');
  }
  if (currentHeight < candidate.creationHeight) {
    throw new Error('live Ergo height precedes the journaled transaction creation height');
  }
  if (currentHeight - candidate.anchorHeaderHeight < minimumConfirmations) {
    throw new Error('candidate Ergo anchor no longer has the required confirmation depth');
  }
}

function normalizeBox(box: BoxLike, label: string): unknown {
  if (!Number.isSafeInteger(box.creationHeight) || box.creationHeight < 0) {
    throw new Error(`${label} creation height must be a nonnegative safe integer`);
  }
  const value = BigInt(box.value);
  if (value < 0n) throw new Error(`${label} value must be nonnegative`);
  if (
    box.index !== undefined
    && (!Number.isSafeInteger(box.index) || box.index < 0)
  ) {
    throw new Error(`${label} index must be a nonnegative safe integer`);
  }
  return {
    boxId: fixedHex(box.boxId, `${label} ID`),
    value: value.toString(),
    ergoTree: evenHex(box.ergoTree, `${label} ErgoTree`),
    assets: (box.assets ?? []).map((asset, index) => ({
      tokenId: fixedHex(asset.tokenId, `${label} asset ${index} token ID`),
      amount: positiveBigInt(asset.amount, `${label} asset ${index} amount`).toString(),
    })),
    additionalRegisters: Object.fromEntries(
      Object.entries(box.additionalRegisters ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, evenHex(value, `${label} register ${key}`)]),
    ),
    creationHeight: box.creationHeight,
    transactionId: box.transactionId === undefined
      ? null
      : fixedHex(box.transactionId, `${label} transaction ID`),
    index: box.index === undefined ? null : box.index,
  };
}

function positiveBigInt(value: number | string | bigint, label: string): bigint {
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error(`${label} must be positive`);
  return parsed;
}

function evenHex(value: string, label: string): string {
  const clean = value?.startsWith('0x') ? value.slice(2) : value;
  if (!clean || !/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error(`${label} must be even-length hex`);
  }
  return clean.toLowerCase();
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('stable Ergo view cannot contain non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`stable Ergo view cannot serialize ${typeof value}`);
}

function fixedHex(value: string, label: string): string {
  const clean = value?.startsWith('0x') ? value.slice(2) : value;
  if (!clean || !/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`${label} must be 32 bytes of hex`);
  }
  return clean.toLowerCase();
}
