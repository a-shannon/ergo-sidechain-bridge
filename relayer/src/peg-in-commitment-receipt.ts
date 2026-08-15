import type {
  ErgoBlockTransactionCommitmentVerification,
} from './adapters/ergo-block-transaction-commitment.js';
import {
  canonicalJson,
  parseStrictJson,
  sha256CanonicalJson,
} from './strict-json.js';

export const PEG_IN_COMMITMENT_RECEIPT_SCHEMA =
  'e2s.peg-in-commitment-receipt.v1';
export const PEG_IN_COMMITMENT_RECEIPT_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:peg-in-commitment-receipt:v1';

const RECEIPT_KEYS = Object.freeze([
  'schema',
  'sourceBoxIdHex',
  'committedVaultBoxIdHex',
  'commitmentTxIdHex',
  'verification',
] as const);
const VERIFICATION_KEYS = Object.freeze([
  'headerIdHex',
  'height',
  'blockVersion',
  'transactionsRootHex',
  'transactionIdHex',
  'transactionSigmaDigestHex',
  'transactionIndex',
  'transactionCount',
  'headerIdMatchedCanonicalBytes',
  'transactionsRootMatchedCanonicalHeaderBytes',
  'transactionRootMatched',
] as const);

export interface PegInCommitmentReceipt {
  readonly schema: typeof PEG_IN_COMMITMENT_RECEIPT_SCHEMA;
  readonly sourceBoxIdHex: string;
  readonly committedVaultBoxIdHex: string;
  readonly commitmentTxIdHex: string;
  readonly verification: Readonly<ErgoBlockTransactionCommitmentVerification>;
}

export type PegInCommitmentVerification =
  Readonly<ErgoBlockTransactionCommitmentVerification>;

export interface CreatePegInCommitmentReceiptInput {
  readonly sourceBoxIdHex: string;
  readonly committedVaultBoxIdHex: string;
  readonly commitmentTxIdHex: string;
  readonly verification: unknown;
}

function exactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null)
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const actual = Object.keys(value);
  if (
    actual.length !== keys.length
    || actual.some(key => !keys.includes(key))
  ) {
    throw new Error(`${label} must contain exactly: ${keys.join(', ')}`);
  }
  return value as Record<string, unknown>;
}

function fixedHex(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`${label} must be 32-byte hex`);
  }
  return clean.toLowerCase();
}

function safeInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new Error(
      `${label} must be a safe integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function normalizeVerification(
  value: unknown,
): Readonly<ErgoBlockTransactionCommitmentVerification> {
  const raw = exactObject(
    value,
    VERIFICATION_KEYS,
    'peg-in block-transaction verification receipt',
  );
  const transactionCount = safeInteger(
    raw.transactionCount,
    'receipt transaction count',
    1,
    100_000,
  );
  const transactionIndex = safeInteger(
    raw.transactionIndex,
    'receipt transaction index',
    0,
    transactionCount - 1,
  );
  if (
    raw.headerIdMatchedCanonicalBytes !== true
    || raw.transactionsRootMatchedCanonicalHeaderBytes !== true
    || raw.transactionRootMatched !== true
  ) {
    throw new Error('peg-in commitment receipt must retain all WP-01C verification results');
  }
  return Object.freeze({
    headerIdHex: fixedHex(raw.headerIdHex, 'receipt header ID'),
    height: safeInteger(raw.height, 'receipt height', 0, Number.MAX_SAFE_INTEGER),
    blockVersion: safeInteger(raw.blockVersion, 'receipt block version', 1, 0x7f),
    transactionsRootHex: fixedHex(
      raw.transactionsRootHex,
      'receipt transactions root',
    ),
    transactionIdHex: fixedHex(raw.transactionIdHex, 'receipt transaction ID'),
    transactionSigmaDigestHex: fixedHex(
      raw.transactionSigmaDigestHex,
      'receipt transaction Sigma digest',
    ),
    transactionIndex,
    transactionCount,
    headerIdMatchedCanonicalBytes: true,
    transactionsRootMatchedCanonicalHeaderBytes: true,
    transactionRootMatched: true,
  });
}

export function createPegInCommitmentReceipt(
  input: CreatePegInCommitmentReceiptInput,
): Readonly<PegInCommitmentReceipt> {
  const sourceBoxIdHex = fixedHex(input.sourceBoxIdHex, 'peg-in source box ID');
  const committedVaultBoxIdHex = fixedHex(
    input.committedVaultBoxIdHex,
    'peg-in committed vault box ID',
  );
  const commitmentTxIdHex = fixedHex(
    input.commitmentTxIdHex,
    'peg-in commitment transaction ID',
  );
  const verification = normalizeVerification(input.verification);
  if (verification.transactionIdHex !== commitmentTxIdHex) {
    throw new Error('peg-in commitment receipt transaction ID does not match lifecycle');
  }
  return Object.freeze({
    schema: PEG_IN_COMMITMENT_RECEIPT_SCHEMA,
    sourceBoxIdHex,
    committedVaultBoxIdHex,
    commitmentTxIdHex,
    verification,
  });
}

export function parsePegInCommitmentReceiptJson(
  source: string,
): Readonly<PegInCommitmentReceipt> {
  const parsed = parseStrictJson(source, 'persisted peg-in commitment receipt');
  const raw = exactObject(
    parsed,
    RECEIPT_KEYS,
    'persisted peg-in commitment receipt',
  );
  if (raw.schema !== PEG_IN_COMMITMENT_RECEIPT_SCHEMA) {
    throw new Error('persisted peg-in commitment receipt schema is unsupported');
  }
  if (source !== canonicalJson(parsed)) {
    throw new Error('persisted peg-in commitment receipt must use canonical JSON');
  }
  const receipt = createPegInCommitmentReceipt({
    sourceBoxIdHex: raw.sourceBoxIdHex as string,
    committedVaultBoxIdHex: raw.committedVaultBoxIdHex as string,
    commitmentTxIdHex: raw.commitmentTxIdHex as string,
    verification: raw.verification,
  });
  if (source !== canonicalJson(receipt)) {
    throw new Error('persisted peg-in commitment receipt is not canonically normalized');
  }
  return receipt;
}

export function pegInCommitmentReceiptJson(
  receipt: PegInCommitmentReceipt,
): string {
  return canonicalJson(createPegInCommitmentReceipt(receipt));
}

export function pegInCommitmentReceiptDigestHex(
  receipt: PegInCommitmentReceipt,
): string {
  return sha256CanonicalJson(
    createPegInCommitmentReceipt(receipt),
    PEG_IN_COMMITMENT_RECEIPT_DIGEST_DOMAIN,
  );
}

export function pegInCommitmentReceiptsEqual(
  left: PegInCommitmentReceipt,
  right: PegInCommitmentReceipt,
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}
