/** Pure Ergo BlockTransactions witness and Scorex Merkle-root computation. */
import blakejs from 'blakejs';

const DIGEST_BYTES = 32;
const WITNESS_ID_BYTES = DIGEST_BYTES - 1;
const SCOREX_LEAF_PREFIX = 0x00;
const SCOREX_INTERNAL_PREFIX = 0x01;
const MAX_BLOCK_VERSION = 0x7f;
const MAX_TRANSACTIONS = 1 << 20;
const MAX_SPENDING_PROOFS_PER_TRANSACTION = 1 << 16;
const MAX_TOTAL_SPENDING_PROOF_BYTES = 64 * 1024 * 1024;

export interface ErgoBlockTransactionRootInput {
  readonly blockVersion: number;
  readonly transactions: readonly {
    readonly transactionId: Uint8Array;
    readonly spendingProofs: readonly Uint8Array[];
  }[];
}

export function computeErgoTransactionWitnessId(
  spendingProofs: readonly Uint8Array[],
): Buffer {
  const proofs = validateSpendingProofs(
    spendingProofs,
    'transaction spending proofs',
  );
  const digest = blake2b256(Buffer.concat(proofs));
  return Buffer.from(digest.subarray(DIGEST_BYTES - WITNESS_ID_BYTES));
}

export function computeErgoBlockTransactionsRoot(
  input: ErgoBlockTransactionRootInput,
): Buffer {
  assertExactDataObject(
    input,
    ['blockVersion', 'transactions'],
    'Ergo block-transactions input',
  );
  const blockVersion = input.blockVersion;
  if (
    !Number.isInteger(blockVersion)
    || blockVersion < 1
    || blockVersion > MAX_BLOCK_VERSION
  ) {
    throw new Error(
      `Ergo block version must be an integer from 1 to ${MAX_BLOCK_VERSION}`,
    );
  }
  if (!Array.isArray(input.transactions)) {
    throw new Error('Ergo block transactions must be an array');
  }
  if (input.transactions.length === 0) {
    throw new Error('Ergo block must contain at least one transaction');
  }
  if (input.transactions.length > MAX_TRANSACTIONS) {
    throw new Error(
      `Ergo block transaction count exceeds ${MAX_TRANSACTIONS}`,
    );
  }

  const transactionIds: Buffer[] = [];
  const witnessIds: Buffer[] = [];
  let totalProofBytes = 0;
  for (let index = 0; index < input.transactions.length; index += 1) {
    const transaction = input.transactions[index];
    assertExactDataObject(
      transaction,
      ['transactionId', 'spendingProofs'],
      `Ergo block transaction ${index}`,
    );
    const transactionId = copyBytes(
      transaction.transactionId,
      `Ergo block transaction ${index} ID`,
    );
    if (transactionId.length !== DIGEST_BYTES) {
      throw new Error(
        `Ergo block transaction ${index} ID must be ${DIGEST_BYTES} bytes`,
      );
    }
    const proofs = validateSpendingProofs(
      transaction.spendingProofs,
      `Ergo block transaction ${index} spending proofs`,
    );
    for (const proof of proofs) {
      totalProofBytes += proof.length;
      if (totalProofBytes > MAX_TOTAL_SPENDING_PROOF_BYTES) {
        throw new Error(
          `Ergo block spending proofs exceed ${MAX_TOTAL_SPENDING_PROOF_BYTES} bytes`,
        );
      }
    }
    transactionIds.push(transactionId);
    if (blockVersion > 1) {
      witnessIds.push(computeErgoTransactionWitnessId(proofs));
    }
  }

  return computeScorexMerkleRoot(
    blockVersion === 1
      ? transactionIds
      : [...transactionIds, ...witnessIds],
  );
}

function computeScorexMerkleRoot(leaves: readonly Uint8Array[]): Buffer {
  let level = leaves.map(leaf =>
    blake2b256(Buffer.concat([
      Buffer.from([SCOREX_LEAF_PREFIX]),
      Buffer.from(leaf),
    ])));
  if (level.length === 1) {
    return blake2b256(Buffer.concat([
      Buffer.from([SCOREX_INTERNAL_PREFIX]),
      level[0],
    ]));
  }
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1];
      next.push(blake2b256(
        right === undefined
          ? Buffer.concat([Buffer.from([SCOREX_INTERNAL_PREFIX]), left])
          : Buffer.concat([
            Buffer.from([SCOREX_INTERNAL_PREFIX]),
            left,
            right,
          ]),
      ));
    }
    level = next;
  }
  return Buffer.from(level[0]);
}

function validateSpendingProofs(
  value: unknown,
  label: string,
): Buffer[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  if (value.length > MAX_SPENDING_PROOFS_PER_TRANSACTION) {
    throw new Error(
      `${label} count exceeds ${MAX_SPENDING_PROOFS_PER_TRANSACTION}`,
    );
  }
  let totalBytes = 0;
  return value.map((proof, index) => {
    const bytes = copyBytes(proof, `${label} entry ${index}`);
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_SPENDING_PROOF_BYTES) {
      throw new Error(
        `${label} exceed ${MAX_TOTAL_SPENDING_PROOF_BYTES} bytes`,
      );
    }
    return bytes;
  });
}

function copyBytes(value: unknown, label: string): Buffer {
  if (!(value instanceof Uint8Array)) {
    throw new Error(`${label} must be a Uint8Array`);
  }
  return Buffer.from(value);
}

function blake2b256(value: Uint8Array): Buffer {
  return Buffer.from(blakejs.blake2b(value, undefined, DIGEST_BYTES));
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
