import { createHash } from 'node:crypto';

import {
  computeErgoBlockTransactionsRoot,
} from '../ergo-settlement-core/ergo-block-transactions-root.js';
import {
  computeErgoHeaderId,
} from '../ergo-settlement-core/ergo-header-id.js';
import { snapshotJsonData } from './json-data-snapshot.js';

const ID_BYTES = 32;
const MAX_BLOCK_VERSION = 0x7f;
const MAX_BLOCK_TRANSACTIONS = 100_000;
const VERIFIED_BLOCK_TRANSACTION_COMMITMENTS = new WeakSet<object>();
const VERIFIED_SIGNED_TRANSACTION_SEMANTICS = new WeakSet<object>();

export interface VerifyErgoBlockTransactionCommitmentInput {
  readonly block: unknown;
  readonly expectedHeaderIdHex: string;
  readonly expectedHeight: number;
  readonly expectedTransactionIdHex: string;
  readonly expectedTransaction: unknown;
}

export interface ErgoBlockTransactionCommitmentVerification {
  readonly headerIdHex: string;
  readonly height: number;
  readonly blockVersion: number;
  readonly transactionsRootHex: string;
  readonly transactionIdHex: string;
  readonly transactionSigmaDigestHex: string;
  readonly transactionIndex: number;
  readonly transactionCount: number;
  readonly headerIdMatchedCanonicalBytes: true;
  readonly transactionsRootMatchedCanonicalHeaderBytes: true;
  readonly transactionRootMatched: true;
}

export interface VerifyErgoSignedTransactionSemanticsInput {
  readonly expectedTransaction: unknown;
  readonly expectedTransactionIdHex: string;
  readonly expectedTransactionSigmaDigestHex: string;
}

export interface ErgoSignedTransactionSemanticAsset {
  readonly tokenIdHex: string;
  readonly amount: string;
}

export interface ErgoSignedTransactionSemanticOutput {
  readonly boxIdHex: string;
  readonly valueNanoErg: string;
  readonly ergoTreeHex: string;
  readonly assets: readonly Readonly<ErgoSignedTransactionSemanticAsset>[];
  readonly additionalRegisters: Readonly<Record<string, string>>;
  readonly creationHeight: number;
  readonly transactionIdHex: string;
  readonly outputIndex: number;
}

export interface ErgoSignedTransactionSemanticsVerification {
  readonly transactionIdHex: string;
  readonly transactionSigmaDigestHex: string;
  readonly inputBoxIdsHex: readonly string[];
  readonly dataInputBoxIdsHex: readonly string[];
  readonly outputs: readonly Readonly<ErgoSignedTransactionSemanticOutput>[];
  readonly canonicalSignedBytesReparsed: true;
  readonly transactionIdMatched: true;
  readonly transactionSigmaDigestMatched: true;
}

interface ParsedSignedTransaction {
  readonly idHex: string;
  readonly sigmaDigestHex: string;
  readonly spendingProofs: readonly Buffer[];
  readonly canonical: Record<string, any>;
}

let ergoWasmPromise: Promise<any> | undefined;

/**
 * Verifies the full signed-transaction commitment of an Ergo block.
 *
 * This is intentionally a static adapter. It authenticates transaction bytes
 * against a canonically parsed header and verifies that header's serialized ID,
 * but does not establish proof of work, canonical-chain membership,
 * confirmation depth, or mint authority.
 */
export async function verifyErgoBlockTransactionCommitment(
  input: VerifyErgoBlockTransactionCommitmentInput,
): Promise<Readonly<ErgoBlockTransactionCommitmentVerification>> {
  assertExactDataObject(input, [
    'block',
    'expectedHeaderIdHex',
    'expectedHeight',
    'expectedTransactionIdHex',
    'expectedTransaction',
  ], 'Ergo block-transaction commitment input');
  const expectedHeaderIdHex = fixedHex(
    input.expectedHeaderIdHex,
    ID_BYTES,
    'expected Ergo header ID',
  );
  const expectedHeight = nonnegativeSafeInteger(
    input.expectedHeight,
    'expected Ergo block height',
  );
  const expectedTransactionIdHex = fixedHex(
    input.expectedTransactionIdHex,
    ID_BYTES,
    'expected Ergo transaction ID',
  );
  const expectedTransaction = await parseSignedTransaction(
    input.expectedTransaction,
    'indexed Ergo transaction',
  );
  if (expectedTransaction.idHex !== expectedTransactionIdHex) {
    throw new Error(
      'indexed Ergo transaction canonical bytes do not match the expected ID',
    );
  }

  const block = record(input.block, 'Ergo block');
  const header = record(block.header, 'Ergo block header');
  const headerIdHex = consistentFixedHexAlias(
    header,
    ['id', 'headerId'],
    ID_BYTES,
    'Ergo block header ID',
  );
  if (headerIdHex !== expectedHeaderIdHex) {
    throw new Error('Ergo block header ID does not match the expected header');
  }
  const height = consistentIntegerAlias(
    header,
    ['height'],
    'Ergo block header height',
  );
  if (height !== expectedHeight) {
    throw new Error('Ergo block header height does not match the expected height');
  }
  const headerVersion = blockVersion(
    header.version,
    'Ergo block header version',
  );
  const transactionsRootHex = fixedHex(
    header.transactionsRoot,
    ID_BYTES,
    'Ergo block header transactions root',
  );
  await verifyCanonicalHeaderShape(header, transactionsRootHex);
  verifyCanonicalHeaderIdentity(
    header,
    headerIdHex,
  );

  const blockTransactions = record(
    block.blockTransactions,
    'Ergo block transactions',
  );
  const transactionsHeaderIdHex = consistentFixedHexAlias(
    blockTransactions,
    ['headerId'],
    ID_BYTES,
    'Ergo block-transactions header ID',
  );
  if (transactionsHeaderIdHex !== headerIdHex) {
    throw new Error('Ergo block-transactions header ID does not match the header');
  }
  const transactionsVersion = blockVersion(
    blockTransactions.blockVersion,
    'Ergo block-transactions version',
  );
  if (transactionsVersion !== headerVersion) {
    throw new Error('Ergo block and transaction-section versions disagree');
  }
  if (!Array.isArray(blockTransactions.transactions)) {
    throw new Error('Ergo block transaction list must be an array');
  }
  if (blockTransactions.transactions.length === 0) {
    throw new Error('Ergo block transaction list must not be empty');
  }
  if (blockTransactions.transactions.length > MAX_BLOCK_TRANSACTIONS) {
    throw new Error(
      `Ergo block transaction count exceeds ${MAX_BLOCK_TRANSACTIONS}`,
    );
  }

  const rootTransactions: {
    transactionId: Buffer;
    spendingProofs: readonly Buffer[];
  }[] = [];
  let targetIndex = -1;
  let targetDigestHex = '';
  let targetCount = 0;
  for (
    let index = 0;
    index < blockTransactions.transactions.length;
    index += 1
  ) {
    const transaction = await parseSignedTransaction(
      blockTransactions.transactions[index],
      `Ergo block transaction ${index}`,
    );
    rootTransactions.push({
      transactionId: Buffer.from(transaction.idHex, 'hex'),
      spendingProofs: transaction.spendingProofs,
    });
    if (transaction.idHex === expectedTransactionIdHex) {
      targetCount += 1;
      targetIndex = index;
      targetDigestHex = transaction.sigmaDigestHex;
    }
  }
  if (targetCount !== 1) {
    throw new Error(
      'expected Ergo transaction must appear exactly once in its claimed block',
    );
  }
  if (targetDigestHex !== expectedTransaction.sigmaDigestHex) {
    throw new Error(
      'Ergo block transaction signed bytes disagree with the indexed transaction',
    );
  }

  const computedRootHex = computeErgoBlockTransactionsRoot({
    blockVersion: transactionsVersion,
    transactions: rootTransactions,
  }).toString('hex');
  if (computedRootHex !== transactionsRootHex) {
    throw new Error(
      'Ergo block transactions do not match the header transactions root',
    );
  }

  const verification = deepFreeze({
    headerIdHex,
    height,
    blockVersion: transactionsVersion,
    transactionsRootHex,
    transactionIdHex: expectedTransactionIdHex,
    transactionSigmaDigestHex: targetDigestHex,
    transactionIndex: targetIndex,
    transactionCount: rootTransactions.length,
    headerIdMatchedCanonicalBytes: true as const,
    transactionsRootMatchedCanonicalHeaderBytes: true as const,
    transactionRootMatched: true as const,
  });
  VERIFIED_BLOCK_TRANSACTION_COMMITMENTS.add(verification);
  return verification;
}

export function assertErgoBlockTransactionCommitmentVerificationProvenance(
  value: unknown,
): asserts value is Readonly<ErgoBlockTransactionCommitmentVerification> {
  if (
    typeof value !== 'object'
    || value === null
    || !VERIFIED_BLOCK_TRANSACTION_COMMITMENTS.has(value)
  ) {
    throw new Error(
      'Ergo block-transaction commitment verification was not produced by the static adapter',
    );
  }
}

/**
 * Reparse one signed transaction and expose only canonical lifecycle fields.
 * Matching both the transaction ID and Sigma digest binds these semantics to
 * the exact signed bytes already authenticated by a WP-01C verification.
 */
export async function verifyErgoSignedTransactionSemantics(
  input: VerifyErgoSignedTransactionSemanticsInput,
): Promise<Readonly<ErgoSignedTransactionSemanticsVerification>> {
  assertExactDataObject(input, [
    'expectedTransaction',
    'expectedTransactionIdHex',
    'expectedTransactionSigmaDigestHex',
  ], 'Ergo signed-transaction semantics input');
  const expectedTransaction = snapshotJsonData(
    input.expectedTransaction,
    'Ergo signed transaction',
  );
  const expectedTransactionIdHex = fixedHex(
    input.expectedTransactionIdHex,
    ID_BYTES,
    'expected Ergo transaction ID',
  );
  const expectedTransactionSigmaDigestHex = fixedHex(
    input.expectedTransactionSigmaDigestHex,
    ID_BYTES,
    'expected Ergo transaction Sigma digest',
  );
  const transaction = await parseSignedTransaction(
    expectedTransaction,
    'Ergo signed transaction',
  );
  if (transaction.idHex !== expectedTransactionIdHex) {
    throw new Error(
      'signed transaction canonical bytes do not match the expected ID',
    );
  }
  if (transaction.sigmaDigestHex !== expectedTransactionSigmaDigestHex) {
    throw new Error(
      'signed transaction canonical bytes do not match the expected Sigma digest',
    );
  }

  const canonical = transaction.canonical;
  const inputBoxIdsHex = array(
    canonical.inputs,
    'canonical signed transaction inputs',
  ).map((value, index) => fixedHex(
    record(value, `canonical signed transaction input ${index}`).boxId,
    ID_BYTES,
    `canonical signed transaction input ${index} box ID`,
  ));
  const dataInputBoxIdsHex = array(
    canonical.dataInputs,
    'canonical signed transaction data inputs',
  ).map((value, index) => fixedHex(
    record(value, `canonical signed transaction data input ${index}`).boxId,
    ID_BYTES,
    `canonical signed transaction data input ${index} box ID`,
  ));
  const outputs = array(
    canonical.outputs,
    'canonical signed transaction outputs',
  ).map((value, index) => normalizeSemanticOutput(
    value,
    index,
    expectedTransactionIdHex,
  ));
  if (inputBoxIdsHex.length === 0 || outputs.length === 0) {
    throw new Error('canonical signed transaction must have inputs and outputs');
  }

  const verification = deepFreeze({
    transactionIdHex: expectedTransactionIdHex,
    transactionSigmaDigestHex: expectedTransactionSigmaDigestHex,
    inputBoxIdsHex,
    dataInputBoxIdsHex,
    outputs,
    canonicalSignedBytesReparsed: true as const,
    transactionIdMatched: true as const,
    transactionSigmaDigestMatched: true as const,
  });
  VERIFIED_SIGNED_TRANSACTION_SEMANTICS.add(verification);
  return verification;
}

export function assertErgoSignedTransactionSemanticsVerificationProvenance(
  value: unknown,
): asserts value is Readonly<ErgoSignedTransactionSemanticsVerification> {
  if (
    typeof value !== 'object'
    || value === null
    || !VERIFIED_SIGNED_TRANSACTION_SEMANTICS.has(value)
  ) {
    throw new Error(
      'Ergo signed-transaction semantics were not produced by the static adapter',
    );
  }
}

function verifyCanonicalHeaderIdentity(
  header: Record<string, any>,
  expectedHeaderIdHex: string,
): void {
  const version = blockVersion(header.version, 'Ergo block header version');
  const powSolution = record(
    header.powSolutions,
    'Ergo block header Autolykos solution',
  );
  const computedHeaderIdHex = computeErgoHeaderId({
    version,
    parentId: fixedHexBytes(
      header.parentId,
      ID_BYTES,
      'Ergo block header parent ID',
    ),
    adProofsRoot: fixedHexBytes(
      header.adProofsRoot,
      ID_BYTES,
      'Ergo block header AD proofs root',
    ),
    stateRoot: fixedHexBytes(
      header.stateRoot,
      33,
      'Ergo block header state root',
    ),
    transactionsRoot: fixedHexBytes(
      header.transactionsRoot,
      ID_BYTES,
      'Ergo block header transactions root',
    ),
    timestamp: BigInt(nonnegativeSafeInteger(
      header.timestamp,
      'Ergo block header timestamp',
    )),
    nBits: unsigned32(header.nBits, 'Ergo block header nBits'),
    height: unsigned32(header.height, 'Ergo block header height'),
    extensionHash: fixedHexBytes(
      header.extensionHash,
      ID_BYTES,
      'Ergo block header extension hash',
    ),
    votes: fixedHexBytes(header.votes, 3, 'Ergo block header votes'),
    unparsedBytes:
      header.unparsedBytes === undefined || header.unparsedBytes === null
        ? Buffer.alloc(0)
        : byteStringHexBytes(
          header.unparsedBytes,
          'Ergo block header unparsed bytes',
        ),
    powSolution: {
      publicKey: fixedHexBytes(
        powSolution.pk,
        33,
        'Ergo block header Autolykos public key',
      ),
      nonce: fixedHexBytes(
        powSolution.n,
        8,
        'Ergo block header Autolykos nonce',
      ),
      ...(version === 1
        ? {
          oneTimePublicKey: fixedHexBytes(
            powSolution.w,
            33,
            'Ergo block header Autolykos one-time public key',
          ),
          distance: nonnegativeBigInt(
            powSolution.d,
            'Ergo block header Autolykos distance',
          ),
        }
        : {}),
    },
  }).toString('hex');
  if (computedHeaderIdHex !== expectedHeaderIdHex) {
    throw new Error(
      'Ergo block header claimed ID does not match canonical header bytes',
    );
  }
}

async function verifyCanonicalHeaderShape(
  header: Record<string, any>,
  expectedTransactionsRootHex: string,
): Promise<void> {
  const wasm = await getErgoWasm();
  let parsedHeader: any;
  try {
    parsedHeader = wasm.BlockHeader.from_json(JSON.stringify(header));
    const canonicalTransactionsRootHex = Buffer.from(
      parsedHeader.transactions_root(),
    ).toString('hex');
    if (canonicalTransactionsRootHex !== expectedTransactionsRootHex) {
      throw new Error(
        'Ergo block header transactions root does not match canonical header bytes',
      );
    }
  } catch (error) {
    if (
      error instanceof Error
      && (
        error.message.includes('transactions root does not match')
      )
    ) {
      throw error;
    }
    throw new Error(
      `Ergo block header is not canonical header JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    parsedHeader?.free?.();
  }
}

async function parseSignedTransaction(
  value: unknown,
  label: string,
): Promise<ParsedSignedTransaction> {
  const raw = record(value, label);
  const claimedIdHex = consistentFixedHexAlias(
    raw,
    ['id', 'txId'],
    ID_BYTES,
    `${label} claimed ID`,
  );
  const wasm = await getErgoWasm();
  let parsed: any;
  try {
    parsed = wasm.Transaction.from_json(JSON.stringify(raw));
  } catch (error) {
    throw new Error(
      `${label} is not canonical signed Ergo transaction JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  let parsedId: any;
  try {
    parsedId = parsed.id();
    const idHex = fixedHex(
      parsedId.to_str(),
      ID_BYTES,
      `${label} computed ID`,
    );
    if (idHex !== claimedIdHex) {
      throw new Error(`${label} claimed ID does not match canonical bytes`);
    }
    const canonical = record(parsed.to_js_eip12(), `${label} canonical JSON`);
    const inputs = array(canonical.inputs, `${label} inputs`);
    const spendingProofs = inputs.map((value, index) => {
      const input = record(value, `${label} input ${index}`);
      const spendingProof = record(
        input.spendingProof,
        `${label} input ${index} spending proof`,
      );
      return Buffer.from(byteStringHex(
        spendingProof.proofBytes,
        `${label} input ${index} proof bytes`,
      ), 'hex');
    });
    return {
      idHex,
      sigmaDigestHex: createHash('sha256')
        .update(Buffer.from(parsed.sigma_serialize_bytes()))
        .digest('hex'),
      spendingProofs,
      canonical,
    };
  } finally {
    parsedId?.free?.();
    parsed?.free?.();
  }
}

function normalizeSemanticOutput(
  value: unknown,
  expectedIndex: number,
  expectedTransactionIdHex: string,
): ErgoSignedTransactionSemanticOutput {
  const output = record(value, `canonical signed transaction output ${expectedIndex}`);
  const transactionIdHex = fixedHex(
    output.transactionId,
    ID_BYTES,
    `canonical signed transaction output ${expectedIndex} transaction ID`,
  );
  if (transactionIdHex !== expectedTransactionIdHex) {
    throw new Error('canonical signed transaction output uses another transaction ID');
  }
  const outputIndex = nonnegativeSafeInteger(
    output.index,
    `canonical signed transaction output ${expectedIndex} index`,
  );
  if (outputIndex !== expectedIndex) {
    throw new Error('canonical signed transaction output index is not contiguous');
  }
  const assets = array(
    output.assets,
    `canonical signed transaction output ${expectedIndex} assets`,
  ).map((assetValue, assetIndex) => {
    const asset = record(
      assetValue,
      `canonical signed transaction output ${expectedIndex} asset ${assetIndex}`,
    );
    return {
      tokenIdHex: fixedHex(
        asset.tokenId,
        ID_BYTES,
        `canonical signed transaction output ${expectedIndex} asset ${assetIndex} token ID`,
      ),
      amount: positiveCanonicalInteger(
        asset.amount,
        `canonical signed transaction output ${expectedIndex} asset ${assetIndex} amount`,
      ),
    };
  });
  const rawRegisters = record(
    output.additionalRegisters,
    `canonical signed transaction output ${expectedIndex} registers`,
  );
  const additionalRegisters: Record<string, string> = {};
  for (const key of Object.keys(rawRegisters).sort()) {
    if (!/^R[4-9]$/.test(key)) {
      throw new Error(
        `canonical signed transaction output ${expectedIndex} register ${key} is unsupported`,
      );
    }
    additionalRegisters[key] = byteStringHex(
      rawRegisters[key],
      `canonical signed transaction output ${expectedIndex} register ${key}`,
    );
  }
  return {
    boxIdHex: fixedHex(
      output.boxId,
      ID_BYTES,
      `canonical signed transaction output ${expectedIndex} box ID`,
    ),
    valueNanoErg: positiveCanonicalInteger(
      output.value,
      `canonical signed transaction output ${expectedIndex} value`,
    ),
    ergoTreeHex: nonemptyByteStringHex(
      output.ergoTree,
      `canonical signed transaction output ${expectedIndex} ErgoTree`,
    ),
    assets,
    additionalRegisters,
    creationHeight: nonnegativeSafeInteger(
      output.creationHeight,
      `canonical signed transaction output ${expectedIndex} creation height`,
    ),
    transactionIdHex,
    outputIndex,
  };
}

async function getErgoWasm(): Promise<any> {
  if (!ergoWasmPromise) {
    ergoWasmPromise = import('ergo-lib-wasm-nodejs')
      .then(module => module.default ?? module);
  }
  return ergoWasmPromise;
}

function record(value: unknown, label: string): Record<string, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be ${bytes}-byte hex`);
  }
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (
    clean.length !== bytes * 2
    || !/^[0-9a-fA-F]+$/.test(clean)
  ) {
    throw new Error(`${label} must be ${bytes}-byte hex`);
  }
  return clean.toLowerCase();
}

function fixedHexBytes(
  value: unknown,
  bytes: number,
  label: string,
): Buffer {
  return Buffer.from(fixedHex(value, bytes, label), 'hex');
}

function byteStringHex(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be an even-length hex string`);
  }
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error(`${label} must be an even-length hex string`);
  }
  return clean.toLowerCase();
}

function nonemptyByteStringHex(value: unknown, label: string): string {
  const clean = byteStringHex(value, label);
  if (clean.length === 0) throw new Error(`${label} must not be empty`);
  return clean;
}

function positiveCanonicalInteger(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a canonical positive integer string`);
  }
  return value;
}

function byteStringHexBytes(value: unknown, label: string): Buffer {
  return Buffer.from(byteStringHex(value, label), 'hex');
}

function consistentFixedHexAlias(
  value: Record<string, any>,
  fields: readonly string[],
  bytes: number,
  label: string,
): string {
  const aliases = fields
    .filter(field => value[field] !== undefined && value[field] !== null)
    .map(field => fixedHex(value[field], bytes, label));
  if (aliases.length === 0) {
    throw new Error(`${label} is missing`);
  }
  if (aliases.some(alias => alias !== aliases[0])) {
    throw new Error(`${label} aliases disagree`);
  }
  return aliases[0];
}

function consistentIntegerAlias(
  value: Record<string, any>,
  fields: readonly string[],
  label: string,
): number {
  const aliases = fields
    .filter(field => value[field] !== undefined && value[field] !== null)
    .map(field => nonnegativeSafeInteger(value[field], label));
  if (aliases.length === 0) throw new Error(`${label} is missing`);
  if (aliases.some(alias => alias !== aliases[0])) {
    throw new Error(`${label} aliases disagree`);
  }
  return aliases[0];
}

function nonnegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function unsigned32(value: unknown, label: string): number {
  const parsed = nonnegativeSafeInteger(value, label);
  if (parsed > 0xffff_ffff) {
    throw new Error(`${label} must fit an unsigned 32-bit integer`);
  }
  return parsed;
}

function nonnegativeBigInt(value: unknown, label: string): bigint {
  if (
    typeof value === 'string'
    && /^(?:0|[1-9][0-9]*)$/.test(value)
  ) {
    return BigInt(value);
  }
  if (Number.isSafeInteger(value) && Number(value) >= 0) {
    return BigInt(Number(value));
  }
  throw new Error(`${label} must be a canonical nonnegative integer`);
}

function blockVersion(value: unknown, label: string): number {
  if (
    !Number.isInteger(value)
    || Number(value) < 1
    || Number(value) > MAX_BLOCK_VERSION
  ) {
    throw new Error(
      `${label} must be an integer from 1 to ${MAX_BLOCK_VERSION}`,
    );
  }
  return Number(value);
}

function assertExactDataObject(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Object.keys(descriptors).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpected.length
    || actualKeys.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(
      `${label} must contain exactly ${expectedKeys.join(', ')}`,
    );
  }
  for (const key of actualKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !('value' in descriptor)
      || descriptor.enumerable !== true
    ) {
      throw new Error(`${label} fields must be own enumerable data properties`);
    }
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value as Readonly<T>;
}
