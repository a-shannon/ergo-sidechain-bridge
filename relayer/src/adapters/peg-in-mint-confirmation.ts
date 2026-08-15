import { sha256CanonicalJson } from '../ergo-settlement-core/strict-json.js';
import {
  PEG_IN_MINT_CONFIRMATIONS,
  type PegInMintAcceptedSubmission,
  type PegInMintTransportConfirmationObservation,
} from '../relayer-core/peg-in-mint-transport-lifecycle.js';

export interface FrontierMintConfirmationProvider {
  getTransactionReceipt(transactionHash: string): Promise<Readonly<{
    hash: string;
    status: number | null;
    blockNumber: number;
    blockHash: string;
  }> | null>;
  getBlockNumber(): Promise<number>;
  getBlock(blockNumber: number): Promise<Readonly<{
    hash: string | null;
  }> | null>;
}

function canonicalHex32(value: string, label: string): string {
  const normalized = value.trim().replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be canonical 32-byte hex`);
  }
  return normalized;
}

export function createPegInMintAcceptedSubmission(input: Readonly<{
  transactionHashHex: string;
  confirmationBlockNumber: number;
  confirmationBlockHashHex: string;
}>): PegInMintAcceptedSubmission {
  const transactionHashHex = canonicalHex32(
    input.transactionHashHex,
    'peg-in mint confirmed transaction hash',
  );
  const confirmationBlockHashHex = canonicalHex32(
    input.confirmationBlockHashHex,
    'peg-in mint confirmation block hash',
  );
  if (
    !Number.isSafeInteger(input.confirmationBlockNumber)
    || input.confirmationBlockNumber < 0
  ) {
    throw new Error(
      'Peg-in mint confirmation block number must be a nonnegative safe integer.',
    );
  }
  const blockHashHex = `0x${confirmationBlockHashHex}`;
  return Object.freeze({
    status: 'accepted',
    transactionHashHex,
    responseDigestHex: sha256CanonicalJson({
      transactionHashHex,
      blockHashHex,
      blockNumber: input.confirmationBlockNumber,
      confirmations: PEG_IN_MINT_CONFIRMATIONS,
    }),
    confirmationBlockNumber: input.confirmationBlockNumber,
    confirmationBlockHashHex: blockHashHex,
    confirmationCount: PEG_IN_MINT_CONFIRMATIONS,
  });
}

export async function observeFrontierPegInMintTransportConfirmation(
  provider: FrontierMintConfirmationProvider,
  expectedTransactionHashHex: string,
): Promise<PegInMintTransportConfirmationObservation> {
  const transactionHashHex = canonicalHex32(
    expectedTransactionHashHex,
    'reserved peg-in mint transaction hash',
  );
  const receipt = await provider.getTransactionReceipt(
    `0x${transactionHashHex}`,
  );
  if (!receipt) {
    return Object.freeze({ status: 'absent' });
  }
  if (
    canonicalHex32(
      receipt.hash,
      'reserved peg-in mint receipt transaction hash',
    ) !== transactionHashHex
    || receipt.status !== 1
  ) {
    throw new Error(
      'Reserved peg-in mint receipt does not prove the accepted transaction.',
    );
  }
  const confirmationBlockHashHex = canonicalHex32(
    receipt.blockHash,
    'reserved peg-in mint receipt block hash',
  );
  const [currentBlockNumber, canonicalBlock] = await Promise.all([
    provider.getBlockNumber(),
    provider.getBlock(receipt.blockNumber),
  ]);
  if (
    !Number.isSafeInteger(currentBlockNumber)
    || !Number.isSafeInteger(receipt.blockNumber)
    || currentBlockNumber < 0
    || receipt.blockNumber < 0
  ) {
    throw new Error(
      'Reserved peg-in mint confirmation heights are invalid.',
    );
  }
  if (
    !canonicalBlock?.hash
    || canonicalHex32(
      canonicalBlock.hash,
      'current peg-in mint confirmation block hash',
    ) !== confirmationBlockHashHex
  ) {
    throw new Error(
      'Reserved peg-in mint receipt is not on the current sidechain history.',
    );
  }
  const confirmationCount = currentBlockNumber - receipt.blockNumber + 1;
  if (
    !Number.isSafeInteger(confirmationCount)
    || confirmationCount <= 0
  ) {
    throw new Error(
      'Reserved peg-in mint confirmation depth is invalid.',
    );
  }
  if (confirmationCount < PEG_IN_MINT_CONFIRMATIONS) {
    return Object.freeze({
      status: 'pending',
      transactionHashHex,
      confirmationBlockNumber: receipt.blockNumber,
      confirmationBlockHashHex,
      confirmationCount,
    });
  }
  return Object.freeze({
    status: 'confirmed',
    submission: createPegInMintAcceptedSubmission({
      transactionHashHex,
      confirmationBlockNumber: receipt.blockNumber,
      confirmationBlockHashHex,
    }),
  });
}
