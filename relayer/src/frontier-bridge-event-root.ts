import blakejs from 'blakejs';

import {
  buildTrustlessBurnCommitment,
  deriveTrustlessBurnIdHex,
  type TrustlessBurnCommitment,
  type TrustlessBurnLeafInput,
} from './trustless-burn-proof.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE,
} from './profiles/substrate-grandpa-v1/asset-profile.js';

export const FRONTIER_PEG_OUT_EVENT = 'PegOut(address,uint256,bytes)';
export const FRONTIER_PEG_OUT_TOPIC =
  '0x22257318f701aff7be06ddd1ea71190b56ffc8c5c9431f202df9bf6d9bd25cf3';

const MAX_ERGO_LONG = 0x7fff_ffff_ffff_ffffn;
const MAX_U32 = 0xffff_ffff;
const ERGO_P2PK_TREE_PREFIX_HEX = '0008cd';

export interface FrontierReceiptLogLike {
  address?: string;
  topics?: readonly string[];
  data?: string;
  index?: number | string | bigint;
  logIndex?: number | string | bigint;
}

export interface FrontierBlockReceiptLike {
  status?: number | string | bigint | null;
  transactionIndex?: number | string | bigint;
  transactionHash?: string;
  hash?: string;
  logs?: readonly FrontierReceiptLogLike[];
}

export interface FrontierBridgeEventRootInput {
  sidechainIdHex: string;
  executionBlockHashHex: string;
  bridgeAddress: string;
  maxBurns: number;
  receipts: readonly FrontierBlockReceiptLike[];
}

export interface CanonicalFrontierPegOutBurn {
  transactionIndex: number;
  logIndex: number;
  eventIndex: number;
  sidechainTxHashHex: string;
  burnIdHex: string;
  userAddress: string;
  amountNanoErg: string;
  recipientErgoTreeHex: string;
  recipientErgoTreeHashHex: string;
}

export interface FrontierBridgeEventRootExtraction {
  burns: CanonicalFrontierPegOutBurn[];
  commitment: TrustlessBurnCommitment | null;
}

interface CanonicalLog {
  log: FrontierReceiptLogLike;
  logIndex: number;
  address: string;
}

interface CanonicalReceipt {
  statusSucceeded: boolean;
  transactionIndex: number;
  transactionHashHex: string;
  logs: CanonicalLog[];
}

export function extractFrontierBridgeEventRoot(
  input: FrontierBridgeEventRootInput,
): FrontierBridgeEventRootExtraction {
  const sidechainIdHex = normalizeFixedHex(input.sidechainIdHex, 32, 'sidechainId');
  const executionBlockHashHex = normalizeFixedHex(
    input.executionBlockHashHex,
    32,
    'executionBlockHash',
  );
  const bridgeAddress = normalizeAddress(input.bridgeAddress, 'bridgeAddress');
  const maxBurns = normalizePositiveSafeInteger(input.maxBurns, 'maxBurns');
  if (!Array.isArray(input.receipts)) {
    throw new Error('receipts must be an array');
  }

  const receipts = canonicalizeReceipts(input.receipts);
  const burns: CanonicalFrontierPegOutBurn[] = [];
  const leafInputs: TrustlessBurnLeafInput[] = [];
  const burnIds = new Set<string>();
  let eventIndex = 0;

  for (const receipt of receipts) {
    for (const canonicalLog of receipt.logs) {
      if (eventIndex > MAX_U32) {
        throw new Error('global eventIndex must fit in uint32');
      }

      const currentEventIndex = eventIndex;
      eventIndex += 1;
      if (!receipt.statusSucceeded || canonicalLog.address !== bridgeAddress) continue;

      const topic0 = canonicalLog.log.topics?.[0]?.toLowerCase();
      if (topic0 !== FRONTIER_PEG_OUT_TOPIC) continue;

      const parsed = parseCanonicalPegOutLog(canonicalLog.log);
      const recipientErgoTreeHashHex = blake2b256Hex(
        Buffer.from(parsed.recipientErgoTreeHex, 'hex'),
      );
      const burnIdHex = deriveTrustlessBurnIdHex({
        sidechainIdHex,
        sidechainTxHashHex: receipt.transactionHashHex,
        eventIndex: currentEventIndex,
      });
      if (burnIds.has(burnIdHex)) {
        throw new Error(`duplicate burnId in Frontier block: ${burnIdHex}`);
      }
      burnIds.add(burnIdHex);

      burns.push({
        transactionIndex: receipt.transactionIndex,
        logIndex: canonicalLog.logIndex,
        eventIndex: currentEventIndex,
        sidechainTxHashHex: receipt.transactionHashHex,
        burnIdHex,
        userAddress: parsed.userAddress,
        amountNanoErg: parsed.amountNanoErg.toString(),
        recipientErgoTreeHex: parsed.recipientErgoTreeHex,
        recipientErgoTreeHashHex,
      });
      leafInputs.push({
        sidechainIdHex,
        sidechainBlockHashHex: executionBlockHashHex,
        burnIdHex,
        sidechainTxHashHex: receipt.transactionHashHex,
        eventIndex: currentEventIndex,
        recipientErgoTreeHashHex,
        amountNanoErg: parsed.amountNanoErg,
        assetIdHex: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE.assetIdHex,
      });

      if (burns.length > maxBurns) {
        throw new Error(`Frontier block valid burn count exceeds maxBurns ${maxBurns}`);
      }
    }
  }

  return {
    burns,
    commitment: leafInputs.length === 0 ? null : buildTrustlessBurnCommitment(leafInputs),
  };
}

function canonicalizeReceipts(receipts: readonly FrontierBlockReceiptLike[]): CanonicalReceipt[] {
  const transactionIndexes = new Set<number>();
  const transactionHashes = new Set<string>();
  const logIndexes = new Set<number>();

  const canonical = receipts.map((receipt, receiptPosition) => {
    const transactionIndex = normalizeNonNegativeSafeInteger(
      receipt.transactionIndex,
      `receipt ${receiptPosition} transactionIndex`,
    );
    if (transactionIndexes.has(transactionIndex)) {
      throw new Error(`duplicate transaction index in Frontier block: ${transactionIndex}`);
    }
    transactionIndexes.add(transactionIndex);

    const transactionHashHex = normalizeFixedHex(
      receipt.transactionHash ?? receipt.hash,
      32,
      `receipt ${receiptPosition} transactionHash`,
    );
    if (transactionHashes.has(transactionHashHex)) {
      throw new Error(`duplicate transaction hash in Frontier block: ${transactionHashHex}`);
    }
    transactionHashes.add(transactionHashHex);

    if (!Array.isArray(receipt.logs)) {
      throw new Error(`receipt ${receiptPosition} logs must be an array`);
    }
    const logs = receipt.logs.map((log, logPosition) => {
      const indexValue = resolveLogIndex(log, receiptPosition, logPosition);
      if (logIndexes.has(indexValue)) {
        throw new Error(`duplicate log index in Frontier block: ${indexValue}`);
      }
      logIndexes.add(indexValue);
      return {
        log,
        logIndex: indexValue,
        address: normalizeAddress(log.address, `receipt ${receiptPosition} log ${logPosition} address`),
      };
    }).sort((left, right) => left.logIndex - right.logIndex);

    return {
      statusSucceeded: normalizeReceiptStatus(receipt.status, receiptPosition),
      transactionIndex,
      transactionHashHex,
      logs,
    };
  }).sort((left, right) => left.transactionIndex - right.transactionIndex);

  let expectedLogIndex = 0;
  for (let receiptPosition = 0; receiptPosition < canonical.length; receiptPosition += 1) {
    const receipt = canonical[receiptPosition];
    if (receipt.transactionIndex !== receiptPosition) {
      throw new Error('Frontier transaction indexes must be contiguous from zero');
    }
    for (const log of receipt.logs) {
      if (log.logIndex !== expectedLogIndex) {
        throw new Error('Frontier log indexes must be contiguous from zero in canonical transaction then log order');
      }
      expectedLogIndex += 1;
    }
  }
  return canonical;
}

function resolveLogIndex(
  log: FrontierReceiptLogLike,
  receiptPosition: number,
  logPosition: number,
): number {
  if (log.logIndex !== undefined && log.index !== undefined) {
    const logIndex = normalizeNonNegativeSafeInteger(
      log.logIndex,
      `receipt ${receiptPosition} log ${logPosition} logIndex`,
    );
    const index = normalizeNonNegativeSafeInteger(
      log.index,
      `receipt ${receiptPosition} log ${logPosition} index`,
    );
    if (logIndex !== index) {
      throw new Error(`receipt ${receiptPosition} log ${logPosition} index and logIndex must match`);
    }
    return logIndex;
  }
  return normalizeNonNegativeSafeInteger(
    log.logIndex ?? log.index,
    `receipt ${receiptPosition} log ${logPosition} index`,
  );
}

function parseCanonicalPegOutLog(log: FrontierReceiptLogLike): {
  userAddress: string;
  amountNanoErg: bigint;
  recipientErgoTreeHex: string;
} {
  if (!Array.isArray(log.topics) || log.topics.length !== 2) {
    throw new Error('matching PegOut log must contain exactly 2 topics');
  }
  const topic0 = normalizeFixedHex(log.topics[0], 32, 'PegOut topic0', true);
  if (`0x${topic0}` !== FRONTIER_PEG_OUT_TOPIC) {
    throw new Error('matching PegOut log topic0 must equal the frozen PegOut topic');
  }
  const indexedUser = normalizeFixedHex(log.topics[1], 32, 'PegOut indexed user', true);
  if (!indexedUser.startsWith('00'.repeat(12))) {
    throw new Error('PegOut user topic must be a zero-padded indexed address');
  }
  const userAddress = `0x${indexedUser.slice(24)}`;

  const dataHex = normalizeVariableHex(log.data, 'PegOut ABI data');
  if (dataHex.length !== 160 * 2) {
    throw new Error('PegOut ABI data must be exactly 160 bytes');
  }
  const amountNanoErg = BigInt(`0x${dataHex.slice(0, 64)}`);
  if (amountNanoErg <= 0n) {
    throw new Error('PegOut amount must be greater than zero');
  }
  if (amountNanoErg > MAX_ERGO_LONG) {
    throw new Error('PegOut amount must fit in the positive Ergo Long domain');
  }
  if (dataHex.slice(64, 128) !== uint256WordHex(64n)) {
    throw new Error('PegOut ABI data offset must equal canonical offset 64');
  }

  const recipientLength = BigInt(`0x${dataHex.slice(128, 192)}`);
  if (recipientLength !== 33n && recipientLength !== 36n) {
    throw new Error('PegOut ABI data recipient length must be exactly 33 or 36 bytes');
  }
  const recipientByteLength = Number(recipientLength);
  const recipientStart = 192;
  const recipientEnd = recipientStart + recipientByteLength * 2;
  const recipientHex = dataHex.slice(recipientStart, recipientEnd);
  if (!/^0*$/.test(dataHex.slice(recipientEnd))) {
    throw new Error('PegOut ABI data dynamic bytes padding must be zero');
  }

  return {
    userAddress,
    amountNanoErg,
    recipientErgoTreeHex: canonicalRecipientErgoTree(recipientHex),
  };
}

function canonicalRecipientErgoTree(recipientHex: string): string {
  if (recipientHex.length === 33 * 2) {
    if (!recipientHex.startsWith('02') && !recipientHex.startsWith('03')) {
      throw new Error('PegOut recipient compressed key must start with 02 or 03');
    }
    return `${ERGO_P2PK_TREE_PREFIX_HEX}${recipientHex}`;
  }
  if (recipientHex.length === 36 * 2) {
    if (!recipientHex.startsWith(`${ERGO_P2PK_TREE_PREFIX_HEX}02`) &&
        !recipientHex.startsWith(`${ERGO_P2PK_TREE_PREFIX_HEX}03`)) {
      throw new Error('PegOut recipient ErgoTree must start with 0008cd and a 02 or 03 key prefix');
    }
    return recipientHex;
  }
  throw new Error('PegOut recipient must be a 33-byte compressed key or 36-byte P2PK ErgoTree');
}

function normalizeReceiptStatus(
  status: FrontierBlockReceiptLike['status'],
  receiptPosition: number,
): boolean {
  if (status === 0 || status === 0n || status === '0' || status === '0x0') return false;
  if (status === 1 || status === 1n || status === '1' || status === '0x1') return true;
  throw new Error(`receipt ${receiptPosition} status must be exactly 0 or 1`);
}

function normalizeAddress(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} must be an exact 20-byte 0x-prefixed address`);
  }
  return value.toLowerCase();
}

function normalizeFixedHex(
  value: unknown,
  expectedBytes: number,
  label: string,
  requirePrefix = false,
): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  if (requirePrefix && !value.startsWith('0x')) throw new Error(`${label} must be 0x-prefixed hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean)) throw new Error(`${label} must be hex`);
  if (clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes`);
  }
  return clean.toLowerCase();
}

function normalizeVariableHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.startsWith('0x')) {
    throw new Error(`${label} must be 0x-prefixed hex`);
  }
  const clean = value.slice(2);
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must contain whole hex bytes`);
  }
  return clean.toLowerCase();
}

function normalizePositiveSafeInteger(value: unknown, label: string): number {
  const normalized = normalizeNonNegativeSafeInteger(value, label);
  if (normalized === 0) throw new Error(`${label} must be greater than zero`);
  return normalized;
}

function normalizeNonNegativeSafeInteger(value: unknown, label: string): number {
  if (typeof value === 'bigint') {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`${label} must be a non-negative safe integer`);
    }
    return Number(value);
  }
  if (typeof value === 'string') {
    let parsedBigInt: bigint;
    if (/^(0|[1-9]\d*)$/.test(value)) {
      parsedBigInt = BigInt(value);
    } else if (/^0x(0|[1-9a-f][0-9a-f]*)$/i.test(value)) {
      parsedBigInt = BigInt(value);
    } else {
      throw new Error(`${label} must be a non-negative safe integer`);
    }
    if (parsedBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`${label} must be a non-negative safe integer`);
    }
    return Number(parsedBigInt);
  }
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function uint256WordHex(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

function blake2b256Hex(value: Buffer): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
}
