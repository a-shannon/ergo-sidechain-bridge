import { ethers } from 'ethers';

import type { ParsedPegOut } from './sidechain-client.js';
import {
  deriveTrustlessBurnIdHex,
  encodeTrustlessBurnLeaf,
  type TrustlessBurnLeafInput,
} from './trustless-burn-proof.js';
import {
  selectSubstrateGrandpaV1AssetProfile,
} from './profiles/substrate-grandpa-v1/asset-profile.js';

const BRIDGE_ABI = [
  'event PegOut(address indexed user, uint256 amount, bytes ergoRecipientPubKey)',
] as const;

const PEG_OUT_EVENT = 'PegOut(address,uint256,bytes)';
const PEG_OUT_TOPIC = ethers.id(PEG_OUT_EVENT).toLowerCase();
const MINIMUM_PEG_OUT_NANOERG = 10_000_000n;
const MAX_U64 = (1n << 64n) - 1n;
const bridgeInterface = new ethers.Interface(BRIDGE_ABI);

export interface PegOutBurnReceiptLogLike {
  address?: string;
  topics?: readonly string[];
  data?: string;
  transactionHash?: string;
  blockNumber?: number | string | bigint;
  blockHash?: string;
  index?: number;
  logIndex?: number;
}

export interface PegOutBurnReceiptLike {
  status?: number | string | bigint | null;
  hash?: string;
  transactionHash?: string;
  blockNumber?: number | string | bigint | null;
  blockHash?: string | null;
  logs?: readonly PegOutBurnReceiptLogLike[];
}

export interface VerifiedPegOutBurn extends ParsedPegOut {
  sidechainBlockHash: string;
  sidechainLogIndex: number;
  bridgeAddress: string;
  burnId: string;
  sidechainEventId: string;
  sidechainConfirmations?: number;
  requiredSidechainConfirmations?: number;
}

export interface PegOutBurnVerificationInput {
  pegOut: ParsedPegOut;
  receipt: PegOutBurnReceiptLike | null | undefined;
  bridgeAddress: string | undefined;
  canonicalBlockHash?: string;
  sidechainIdHex?: string;
  currentSidechainHeight?: number | string | bigint;
  requiredSidechainConfirmations?: number | string | bigint;
}

export interface PegOutBurnVerificationResult {
  ok: boolean;
  errors: string[];
  missing: boolean;
  reverted: boolean;
  invalidated: boolean;
  burn?: VerifiedPegOutBurn;
}

export type PegOutBurnSettlementStatus = 'confirmed' | 'reverted' | 'unknown';

const TERMINAL_BURN_MISMATCHES: ReadonlySet<string> = new Set([
  'burn receipt not found',
  'burn receipt status is not successful',
  'burn receipt block hash does not match canonical sidechain block',
  'burn receipt does not contain a verified PegOut burn',
  'PegOut transaction hash does not match peg-out row',
  'PegOut block number does not match peg-out row',
  'PegOut amount does not match peg-out row',
  'PegOut recipient does not match peg-out row',
  'PegOut user does not match peg-out row',
  'PegOut block hash does not match peg-out row',
  'PegOut log index does not match peg-out row',
]);

export function classifyPegOutBurnForSettlement(
  result: PegOutBurnVerificationResult,
): PegOutBurnSettlementStatus {
  if (result.ok) return 'confirmed';
  return result.invalidated ? 'reverted' : 'unknown';
}

export interface TrustlessBurnLeafFromVerifiedPegOutInput {
  burn: VerifiedPegOutBurn;
  assetProfileId: string;
  sidechainIdHex: string;
  recipientErgoTreeHashHex: string;
}

export function verifyPegOutBurnReceipt(
  input: PegOutBurnVerificationInput,
): PegOutBurnVerificationResult {
  if (!input.receipt) {
    return {
      ok: false,
      errors: ['burn receipt not found'],
      missing: true,
      reverted: false,
      invalidated: true,
    };
  }

  const extraction = extractVerifiedPegOutBurnsFromReceipt(input.receipt, {
    bridgeAddress: input.bridgeAddress,
    canonicalBlockHash: input.canonicalBlockHash,
    sidechainIdHex: input.sidechainIdHex,
    currentSidechainHeight: input.currentSidechainHeight,
    requiredSidechainConfirmations: input.requiredSidechainConfirmations,
  });
  const errors = [...extraction.errors];
  if (extraction.burns.length === 0) {
    errors.push('burn receipt does not contain a verified PegOut burn');
  } else if (extraction.burns.length > 1) {
    errors.push('burn receipt contains multiple verified PegOut burns; burnId/logIndex is required');
  }

  const burn = extraction.burns.length === 1 ? extraction.burns[0] : undefined;
  if (burn) {
    compareBurnToPegOut(input.pegOut, burn, errors);
  }

  return {
    ok: errors.length === 0,
    errors,
    missing: false,
    reverted: extraction.reverted,
    invalidated: extraction.reverted
      || errors.some(error => TERMINAL_BURN_MISMATCHES.has(error)),
    burn,
  };
}

export function extractVerifiedPegOutBurnsFromReceipt(
  receipt: PegOutBurnReceiptLike,
  options: {
    bridgeAddress: string | undefined;
    canonicalBlockHash?: string;
    sidechainIdHex?: string;
    currentSidechainHeight?: number | string | bigint;
    requiredSidechainConfirmations?: number | string | bigint;
  },
): { burns: VerifiedPegOutBurn[]; errors: string[]; reverted: boolean } {
  const errors: string[] = [];
  const bridgeAddress = normalizeAddress(options.bridgeAddress, 'bridge address', errors);
  const receiptTxHash = normalizeFixedHex(
    receipt.hash ?? receipt.transactionHash,
    32,
    'burn receipt transaction hash',
    errors,
  );
  const receiptBlockNumber = toSafeInteger(receipt.blockNumber, 'burn receipt block number', errors);
  const receiptBlockHash = normalizeFixedHex(receipt.blockHash ?? undefined, 32, 'burn receipt block hash', errors);
  const canonicalBlockHash = options.canonicalBlockHash
    ? normalizeFixedHex(options.canonicalBlockHash, 32, 'canonical sidechain block hash', errors)
    : undefined;
  const sidechainIdHex = options.sidechainIdHex
    ? normalizeFixedHex(options.sidechainIdHex, 32, 'sidechain ID', errors)
    : undefined;
  const finality = resolveSidechainFinalityPolicy({
    currentSidechainHeight: options.currentSidechainHeight,
    requiredSidechainConfirmations: options.requiredSidechainConfirmations,
    receiptBlockNumber,
    errors,
  });

  const reverted = !receiptSucceeded(receipt.status);
  if (reverted) errors.push('burn receipt status is not successful');
  if (canonicalBlockHash && receiptBlockHash && canonicalBlockHash !== receiptBlockHash) {
    errors.push('burn receipt block hash does not match canonical sidechain block');
  }
  if (!bridgeAddress || !receiptTxHash || receiptBlockNumber === undefined || !receiptBlockHash || reverted) {
    return { burns: [], errors, reverted };
  }

  const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
  const burns: VerifiedPegOutBurn[] = [];

  for (const log of logs) {
    const logAddress = normalizeAddress(log.address, 'burn log address', []);
    if (logAddress !== bridgeAddress) continue;

    const topic0 = normalizeTopic(log.topics?.[0]);
    if (topic0 !== PEG_OUT_TOPIC) continue;

    const logTxHash = normalizeFixedHex(log.transactionHash, 32, 'burn log transaction hash', errors);
    const logBlockNumber = toSafeInteger(log.blockNumber, 'burn log block number', errors);
    const logBlockHash = normalizeFixedHex(log.blockHash, 32, 'burn log block hash', errors);
    const logIndex = toSafeInteger(log.logIndex ?? log.index, 'burn log index', errors);
    if (logTxHash !== receiptTxHash) errors.push('burn log transaction hash does not match receipt');
    if (logBlockNumber !== undefined && logBlockNumber !== receiptBlockNumber) {
      errors.push('burn log block number does not match receipt');
    }
    if (logBlockHash && logBlockHash !== receiptBlockHash) {
      errors.push('burn log block hash does not match receipt');
    }

    let parsed: ethers.LogDescription | null;
    try {
      parsed = bridgeInterface.parseLog({
        topics: log.topics ?? [],
        data: log.data ?? '0x',
      });
    } catch {
      errors.push('burn receipt contains an unparseable PegOut log');
      continue;
    }
    if (!parsed || parsed.name !== 'PegOut') continue;

    const user = normalizeAddress(parsed.args[0] as string, 'PegOut user', errors);
    const amount = parsed.args[1] as bigint;
    const recipient = normalizePegOutRecipient(parsed.args[2] as string, 'PegOut recipient', errors);
    validatePegOutAmount(amount, errors);
    if (!user || !recipient || !logTxHash || logBlockNumber === undefined || !logBlockHash || logIndex === undefined) {
      continue;
    }

    const sidechainEventId = `${logTxHash}:${logIndex}`;
    const burnId = sidechainIdHex
      ? deriveTrustlessBurnIdHex({
        sidechainIdHex,
        sidechainTxHashHex: logTxHash,
        eventIndex: logIndex,
      })
      : sidechainEventId;

    burns.push({
      user,
      amount,
      ergoRecipientAddress: recipient,
      sidechainTxHash: logTxHash,
      sidechainBlockNumber: logBlockNumber,
      sidechainBlockHash: logBlockHash,
      sidechainLogIndex: logIndex,
      bridgeAddress,
      burnId,
      sidechainEventId,
      ...(finality.sidechainConfirmations !== undefined
        ? { sidechainConfirmations: finality.sidechainConfirmations }
        : {}),
      ...(finality.requiredSidechainConfirmations !== undefined
        ? { requiredSidechainConfirmations: finality.requiredSidechainConfirmations }
        : {}),
    });
  }

  return { burns, errors, reverted };
}

export function buildTrustlessBurnLeafInputFromVerifiedPegOutBurn(
  input: TrustlessBurnLeafFromVerifiedPegOutInput,
): TrustlessBurnLeafInput {
  const assetProfile = selectSubstrateGrandpaV1AssetProfile(input.assetProfileId);
  const errors: string[] = [];
  const sidechainIdHex = normalizeFixedHex(input.sidechainIdHex, 32, 'sidechain ID', errors);
  const recipientErgoTreeHashHex = normalizeFixedHex(
    input.recipientErgoTreeHashHex,
    32,
    'recipientErgoTreeHash',
    errors,
  );
  if (!sidechainIdHex || !recipientErgoTreeHashHex) {
    throw new Error(errors.join('; '));
  }

  const expectedBurnId = deriveTrustlessBurnIdHex({
    sidechainIdHex,
    sidechainTxHashHex: input.burn.sidechainTxHash,
    eventIndex: input.burn.sidechainLogIndex,
  });
  if (input.burn.burnId !== expectedBurnId) {
    throw new Error('verified burnId must match derived trustless burn ID');
  }

  const leaf: TrustlessBurnLeafInput = {
    sidechainIdHex,
    sidechainBlockHashHex: input.burn.sidechainBlockHash,
    burnIdHex: input.burn.burnId,
    sidechainTxHashHex: input.burn.sidechainTxHash,
    eventIndex: input.burn.sidechainLogIndex,
    recipientErgoTreeHashHex,
    amountNanoErg: input.burn.amount,
    assetIdHex: assetProfile.assetIdHex,
  };

  const canonicalLeaf = encodeTrustlessBurnLeaf(leaf);
  return {
    sidechainIdHex: canonicalLeaf.sidechainIdHex,
    sidechainBlockHashHex: canonicalLeaf.sidechainBlockHashHex,
    burnIdHex: canonicalLeaf.burnIdHex,
    sidechainTxHashHex: canonicalLeaf.sidechainTxHashHex,
    eventIndex: canonicalLeaf.eventIndex,
    recipientErgoTreeHashHex: canonicalLeaf.recipientErgoTreeHashHex,
    amountNanoErg: canonicalLeaf.amountNanoErg,
    assetIdHex: canonicalLeaf.assetIdHex,
  };
}

function compareBurnToPegOut(
  pegOut: ParsedPegOut,
  burn: VerifiedPegOutBurn,
  errors: string[],
): void {
  const expectedTxHash = normalizeFixedHex(pegOut.sidechainTxHash, 32, 'peg-out sidechainTxHash', errors);
  if (expectedTxHash && burn.sidechainTxHash !== expectedTxHash) {
    errors.push('PegOut transaction hash does not match peg-out row');
  }
  if (burn.sidechainBlockNumber !== pegOut.sidechainBlockNumber) {
    errors.push('PegOut block number does not match peg-out row');
  }
  if (burn.amount !== BigInt(pegOut.amount)) {
    errors.push('PegOut amount does not match peg-out row');
  }

  const expectedRecipient = normalizePegOutRecipient(pegOut.ergoRecipientAddress, 'peg-out recipient', errors);
  if (expectedRecipient && burn.ergoRecipientAddress !== expectedRecipient) {
    errors.push('PegOut recipient does not match peg-out row');
  }

  if (pegOut.user) {
    const expectedUser = normalizeAddress(pegOut.user, 'peg-out user', errors);
    if (expectedUser && burn.user !== expectedUser) {
      errors.push('PegOut user does not match peg-out row');
    }
  }

  if (pegOut.sidechainBlockHash) {
    const expectedBlockHash = normalizeFixedHex(pegOut.sidechainBlockHash, 32, 'peg-out block hash', errors);
    if (expectedBlockHash && burn.sidechainBlockHash !== expectedBlockHash) {
      errors.push('PegOut block hash does not match peg-out row');
    }
  }
  if (pegOut.sidechainLogIndex !== undefined && burn.sidechainLogIndex !== pegOut.sidechainLogIndex) {
    errors.push('PegOut log index does not match peg-out row');
  }
}

function receiptSucceeded(status: PegOutBurnReceiptLike['status']): boolean {
  if (status === null || status === undefined) return false;
  if (typeof status === 'bigint') return status === 1n;
  if (typeof status === 'number') return status === 1;
  const normalized = status.toLowerCase();
  return normalized === '1' || normalized === '0x1';
}

function validatePegOutAmount(amount: bigint, errors: string[]): void {
  if (amount <= 0n) errors.push('PegOut amount must be positive');
  if (amount < MINIMUM_PEG_OUT_NANOERG) errors.push('PegOut amount is below the minimum peg-out amount');
  if (amount > MAX_U64) errors.push('PegOut amount exceeds the Ergo u64 encoding limit');
}

function resolveSidechainFinalityPolicy(input: {
  currentSidechainHeight: number | string | bigint | undefined;
  requiredSidechainConfirmations: number | string | bigint | undefined;
  receiptBlockNumber: number | undefined;
  errors: string[];
}): {
  sidechainConfirmations?: number;
  requiredSidechainConfirmations?: number;
} {
  const hasCurrentHeight = input.currentSidechainHeight !== undefined;
  const hasRequiredConfirmations = input.requiredSidechainConfirmations !== undefined;
  if (!hasCurrentHeight && !hasRequiredConfirmations) return {};

  if (!hasRequiredConfirmations) {
    input.errors.push('required sidechain confirmations is required when current sidechain height is supplied');
    return {};
  }
  if (!hasCurrentHeight) {
    input.errors.push('current sidechain height is required when required sidechain confirmations is supplied');
    return {};
  }

  const requiredConfirmations = toSafeInteger(
    input.requiredSidechainConfirmations,
    'required sidechain confirmations',
    input.errors,
  );
  const currentHeight = toSafeInteger(
    input.currentSidechainHeight,
    'current sidechain height',
    input.errors,
  );
  if (
    requiredConfirmations === undefined ||
    currentHeight === undefined ||
    input.receiptBlockNumber === undefined
  ) {
    return {};
  }

  if (requiredConfirmations < 1) {
    input.errors.push('required sidechain confirmations must be at least 1');
    return {};
  }
  if (currentHeight < input.receiptBlockNumber) {
    input.errors.push('current sidechain height must be greater than or equal to burn receipt block number');
    return { requiredSidechainConfirmations: requiredConfirmations };
  }

  const sidechainConfirmations = currentHeight - input.receiptBlockNumber + 1;
  if (sidechainConfirmations < requiredConfirmations) {
    input.errors.push(
      `burn receipt has ${sidechainConfirmations} sidechain confirmation(s), requires ${requiredConfirmations}`,
    );
  }

  return {
    sidechainConfirmations,
    requiredSidechainConfirmations: requiredConfirmations,
  };
}

function normalizePegOutRecipient(value: string, label: string, errors: string[]): string | undefined {
  const clean = normalizeBytes(value, label, errors);
  if (!clean) return undefined;

  const isCompressedPubKey = clean.length === 66 && (clean.startsWith('02') || clean.startsWith('03'));
  const isP2pkErgoTree =
    clean.length === 72 &&
    clean.startsWith('0008cd') &&
    (clean.slice(6, 8) === '02' || clean.slice(6, 8) === '03');
  if (!isCompressedPubKey && !isP2pkErgoTree) {
    errors.push(`${label} must be a 33-byte compressed key or 36-byte P2PK ErgoTree`);
    return undefined;
  }
  return clean;
}

function normalizeBytes(value: string, label: string, errors: string[]): string | undefined {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    errors.push(`${label} must be even-length hex bytes`);
    return undefined;
  }
  return clean.toLowerCase();
}

function normalizeFixedHex(
  value: string | undefined,
  expectedBytes: number,
  label: string,
  errors: string[],
): string | undefined {
  if (!value) {
    errors.push(`${label} is required`);
    return undefined;
  }
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    errors.push(`${label} must be hex`);
    return undefined;
  }
  if (clean.length !== expectedBytes * 2) {
    errors.push(`${label} must be ${expectedBytes} bytes`);
    return undefined;
  }
  return clean.toLowerCase();
}

function normalizeTopic(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.toLowerCase();
}

function normalizeAddress(value: string | undefined, label: string, errors: string[]): string | undefined {
  if (!value) {
    errors.push(`${label} is required`);
    return undefined;
  }
  try {
    const address = ethers.getAddress(value);
    if (address === ethers.ZeroAddress) {
      errors.push(`${label} must not be the zero address`);
      return undefined;
    }
    return address.toLowerCase();
  } catch {
    errors.push(`${label} must be an EVM address`);
    return undefined;
  }
}

function toSafeInteger(
  value: number | string | bigint | null | undefined,
  label: string,
  errors: string[],
): number | undefined {
  if (value === null || value === undefined) {
    errors.push(`${label} is required`);
    return undefined;
  }

  let numeric: bigint;
  if (typeof value === 'bigint') {
    numeric = value;
  } else if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      errors.push(`${label} must be an integer`);
      return undefined;
    }
    numeric = BigInt(value);
  } else if (value.startsWith('0x')) {
    numeric = BigInt(value);
  } else if (/^[0-9]+$/.test(value)) {
    numeric = BigInt(value);
  } else {
    errors.push(`${label} must be numeric`);
    return undefined;
  }

  if (numeric < 0n || numeric > BigInt(Number.MAX_SAFE_INTEGER)) {
    errors.push(`${label} must be a non-negative safe integer`);
    return undefined;
  }
  return Number(numeric);
}
