import { decodeCollByteRegister } from './ergo-helpers.js';

export const LEGACY_MCU_EMERGENCY_TIMEOUT_BLOCKS = 10_000n;

export interface LegacyMcuBoxLike {
  boxId?: unknown;
  creationHeight?: unknown;
  transactionId?: unknown;
  ergoTree?: unknown;
  additionalRegisters?: unknown;
}

export interface LegacyMcuInventoryClient {
  getCurrentHeight(): Promise<number>;
  getUnspentBoxesByAddress(address: string): Promise<unknown[]>;
}

export type LegacyMcuInventoryErrorField =
  | 'boxId'
  | 'creationHeight'
  | 'ergoTree'
  | 'R4'
  | 'R5'
  | 'R6'
  | 'R7'
  | 'R8'
  | 'timeoutHeight';

export interface LegacyMcuInventoryError {
  field: LegacyMcuInventoryErrorField;
  code: string;
  message: string;
}

export interface LegacyMcuInventoryBox {
  address: string;
  addressBoxIndex: number;
  boxId: string | null;
  transactionId: string | null;
  ergoTreeHex: string | null;
  nodeCreationHeight: number | null;
  classification: 'quarantined';
  malformed: boolean;
  burnTransactionId: string | null;
  amountNanoErg: string | null;
  recipientErgoTreeHex: string | null;
  sidechainHeight: string | null;
  registerCreationHeight: string | null;
  timeoutHeight: string | null;
  unsafeLegacyTimeoutReachable: boolean | null;
  errors: LegacyMcuInventoryError[];
}

export interface LegacyMcuAddressQuery {
  address: string;
  status: 'ok' | 'error';
  boxCount: number;
  error?: {
    code: 'unspent_box_query_failed';
    message: string;
  };
}

export interface LegacyMcuInventoryReport {
  schemaVersion: 2;
  kind: 'legacy-mcu-inventory';
  generatedAt: string;
  addressQueriesComplete: boolean;
  currentHeight: number;
  currentHeightSource: 'explicit' | 'node' | 'manifest-snapshot';
  addresses: string[];
  legacyEmergencyTimeoutBlocks: string;
  boundary: {
    readOnly: true;
    foundBoxClassification: 'quarantined';
    receiptPresenceVerified: false;
    receiptPresenceStatement: 'Receipt presence is not verified.';
    migrationInferred: false;
    migrationStatement: 'Migration cannot be inferred from this inventory.';
    exhaustiveAddressSetVerified: false;
    networkIdentityVerified: false;
    cutoverClaimed: false;
    cutoverStatement: 'Cutover readiness is not assessed without a reviewed network-bound legacy address manifest.';
    transactionOperationsPerformed: false;
  };
  summary: {
    addressesQueried: number;
    addressQueryFailures: number;
    boxesFound: number;
    quarantinedBoxes: number;
    malformedBoxes: number;
    unsafeLegacyTimeoutReachableBoxes: number;
  };
  addressQueries: LegacyMcuAddressQuery[];
  boxes: LegacyMcuInventoryBox[];
}

export interface CollectLegacyMcuInventoryInput {
  addresses: string[];
  client: LegacyMcuInventoryClient;
  currentHeight?: number;
  currentHeightSource?: 'explicit' | 'manifest-snapshot';
  generatedAt?: string;
}

interface RegisterReadResult {
  value?: string;
  error?: LegacyMcuInventoryError;
}

const MAX_SIGNED_LONG = (1n << 63n) - 1n;
const MAX_UNSIGNED_LONG = (1n << 64n) - 1n;

export function parseLegacyMcuAddresses(values: string[]): string[] {
  const addresses: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const entries = value.split(',');
    if (entries.some(entry => entry.trim().length === 0)) {
      throw new Error('--address contains an empty address entry');
    }
    for (const entry of entries) {
      const address = entry.trim();
      if (/\s/.test(address)) {
        throw new Error('--address entries must not contain whitespace');
      }
      if (!seen.has(address)) {
        seen.add(address);
        addresses.push(address);
      }
    }
  }

  if (addresses.length === 0) {
    throw new Error('At least one explicit --address is required');
  }
  return addresses;
}

export async function collectLegacyMcuInventory(
  input: CollectLegacyMcuInventoryInput,
): Promise<LegacyMcuInventoryReport> {
  const addresses = parseLegacyMcuAddresses(input.addresses);
  const currentHeightSource = input.currentHeight === undefined
    ? 'node'
    : input.currentHeightSource ?? 'explicit';
  const currentHeight = input.currentHeight ?? await input.client.getCurrentHeight();
  requireHeight(currentHeight, 'current height');

  const queryResults = await Promise.all(addresses.map(async address => {
    try {
      const boxes = await input.client.getUnspentBoxesByAddress(address);
      if (!Array.isArray(boxes)) {
        throw new Error('node response was not an array');
      }
      return { address, boxes, error: false as const };
    } catch {
      return { address, boxes: [] as unknown[], error: true as const };
    }
  }));

  const addressQueries: LegacyMcuAddressQuery[] = queryResults.map(result =>
    result.error
      ? {
          address: result.address,
          status: 'error',
          boxCount: 0,
          error: {
            code: 'unspent_box_query_failed',
            message: 'The read-only unspent-box query failed.',
          },
        }
      : {
          address: result.address,
          status: 'ok',
          boxCount: result.boxes.length,
        },
  );

  const boxes = queryResults.flatMap(result =>
    result.boxes.map((box, index) => classifyLegacyMcuBox(
      result.address,
      index,
      box,
      currentHeight,
    )),
  );
  const addressQueryFailures = addressQueries.filter(query => query.status === 'error').length;
  const malformedBoxes = boxes.filter(box => box.malformed).length;
  const reachableBoxes = boxes.filter(box => box.unsafeLegacyTimeoutReachable === true).length;

  return {
    schemaVersion: 2,
    kind: 'legacy-mcu-inventory',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    addressQueriesComplete: addressQueryFailures === 0,
    currentHeight,
    currentHeightSource,
    addresses,
    legacyEmergencyTimeoutBlocks: LEGACY_MCU_EMERGENCY_TIMEOUT_BLOCKS.toString(),
    boundary: {
      readOnly: true,
      foundBoxClassification: 'quarantined',
      receiptPresenceVerified: false,
      receiptPresenceStatement: 'Receipt presence is not verified.',
      migrationInferred: false,
      migrationStatement: 'Migration cannot be inferred from this inventory.',
      exhaustiveAddressSetVerified: false,
      networkIdentityVerified: false,
      cutoverClaimed: false,
      cutoverStatement:
        'Cutover readiness is not assessed without a reviewed network-bound legacy address manifest.',
      transactionOperationsPerformed: false,
    },
    summary: {
      addressesQueried: addresses.length,
      addressQueryFailures,
      boxesFound: boxes.length,
      quarantinedBoxes: boxes.length,
      malformedBoxes,
      unsafeLegacyTimeoutReachableBoxes: reachableBoxes,
    },
    addressQueries,
    boxes,
  };
}

export function classifyLegacyMcuBox(
  address: string,
  addressBoxIndex: number,
  value: unknown,
  currentHeight: number,
): LegacyMcuInventoryBox {
  requireHeight(currentHeight, 'current height');
  const errors: LegacyMcuInventoryError[] = [];
  const box = asRecord(value);
  const boxId = readHexIdentifier(box?.boxId, 'boxId', errors);
  const transactionId = readOptionalString(box?.transactionId);
  const ergoTreeHex = readErgoTree(box?.ergoTree, errors);
  const nodeCreationHeight = readNodeCreationHeight(box?.creationHeight, errors);
  const registers = asRecord(box?.additionalRegisters);

  const r4 = readRegister(registers, 'R4');
  const r5 = readRegister(registers, 'R5');
  const r6 = readRegister(registers, 'R6');
  const r7 = readRegister(registers, 'R7');
  const r8 = readRegister(registers, 'R8');
  for (const register of [r4, r5, r6, r7, r8]) {
    if (register.error) errors.push(register.error);
  }

  const burnTransactionId = decodeBytesRegister(r4.value, 'R4', errors, 32);
  const amount = decodeLongField(r5.value, 'R5', errors);
  const recipientErgoTreeHex = decodeBytesRegister(r6.value, 'R6', errors);
  const sidechainHeight = decodeLongField(r7.value, 'R7', errors);
  const registerCreationHeight = decodeLongField(r8.value, 'R8', errors);

  if (amount !== null && amount <= 0n) {
    errors.push({
      field: 'R5',
      code: 'non_positive_amount',
      message: 'R5 amount must be positive.',
    });
  }
  if (sidechainHeight !== null && sidechainHeight < 0n) {
    errors.push({
      field: 'R7',
      code: 'negative_sidechain_height',
      message: 'R7 sidechain height must not be negative.',
    });
  }
  if (registerCreationHeight !== null && registerCreationHeight < 0n) {
    errors.push({
      field: 'R8',
      code: 'negative_creation_height',
      message: 'R8 creation height must not be negative.',
    });
  }
  if (
    registerCreationHeight !== null &&
    registerCreationHeight >= 0n &&
    nodeCreationHeight !== null &&
    registerCreationHeight !== BigInt(nodeCreationHeight)
  ) {
    errors.push({
      field: 'creationHeight',
      code: 'creation_height_mismatch',
      message: 'R8 creation height does not match the node box creation height.',
    });
  }

  let timeoutHeight: bigint | null = null;
  if (registerCreationHeight !== null && registerCreationHeight >= 0n) {
    if (registerCreationHeight > MAX_SIGNED_LONG - LEGACY_MCU_EMERGENCY_TIMEOUT_BLOCKS) {
      errors.push({
        field: 'timeoutHeight',
        code: 'timeout_height_overflow',
        message: 'R8 creation height cannot be safely combined with the legacy timeout.',
      });
    } else {
      timeoutHeight = registerCreationHeight + LEGACY_MCU_EMERGENCY_TIMEOUT_BLOCKS;
    }
  }

  return {
    address,
    addressBoxIndex,
    boxId,
    transactionId,
    ergoTreeHex,
    nodeCreationHeight,
    classification: 'quarantined',
    malformed: errors.length > 0,
    burnTransactionId,
    amountNanoErg: amount?.toString() ?? null,
    recipientErgoTreeHex,
    sidechainHeight: sidechainHeight?.toString() ?? null,
    registerCreationHeight: registerCreationHeight?.toString() ?? null,
    timeoutHeight: timeoutHeight?.toString() ?? null,
    unsafeLegacyTimeoutReachable:
      timeoutHeight === null ? null : BigInt(currentHeight) >= timeoutHeight,
    errors,
  };
}

function readRegister(
  registers: Record<string, unknown> | undefined,
  field: 'R4' | 'R5' | 'R6' | 'R7' | 'R8',
): RegisterReadResult {
  const raw = registers?.[field];
  if (raw === undefined || raw === null) {
    return {
      error: {
        field,
        code: 'missing_register',
        message: `${field} is missing.`,
      },
    };
  }
  if (typeof raw === 'string') return { value: raw };
  const record = asRecord(raw);
  if (typeof record?.serializedValue === 'string') {
    return { value: record.serializedValue };
  }
  return {
    error: {
      field,
      code: 'invalid_register_shape',
      message: `${field} must be a serialized register string or expose serializedValue.`,
    },
  };
}

function decodeBytesRegister(
  value: string | undefined,
  field: 'R4' | 'R6',
  errors: LegacyMcuInventoryError[],
  expectedBytes?: number,
): string | null {
  if (value === undefined) return null;
  try {
    const decoded = decodeCollByteRegister(value, field);
    if (expectedBytes !== undefined && decoded.length !== expectedBytes * 2) {
      errors.push({
        field,
        code: 'invalid_byte_length',
        message: `${field} must contain exactly ${expectedBytes} bytes.`,
      });
      return null;
    }
    if (field === 'R6' && decoded.length === 0) {
      errors.push({
        field,
        code: 'empty_recipient_tree',
        message: 'R6 recipient ErgoTree must not be empty.',
      });
      return null;
    }
    return decoded;
  } catch (error) {
    errors.push({
      field,
      code: 'invalid_coll_byte_register',
      message: error instanceof Error ? error.message : `${field} is invalid.`,
    });
    return null;
  }
}

function decodeLongField(
  value: string | undefined,
  field: 'R5' | 'R7' | 'R8',
  errors: LegacyMcuInventoryError[],
): bigint | null {
  if (value === undefined) return null;
  try {
    return decodeLongRegister(value, field);
  } catch (error) {
    errors.push({
      field,
      code: 'invalid_long_register',
      message: error instanceof Error ? error.message : `${field} is invalid.`,
    });
    return null;
  }
}

function decodeLongRegister(registerHex: string, label: string): bigint {
  const clean = registerHex.startsWith('0x') ? registerHex.slice(2) : registerHex;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0 || !clean.startsWith('05')) {
    throw new Error(`${label} must be a Sigma-serialized Long.`);
  }
  const bytes = Buffer.from(clean.slice(2), 'hex');
  if (bytes.length === 0 || bytes.length > 10) {
    throw new Error(`${label} has an invalid Long payload length.`);
  }

  let encoded = 0n;
  let shift = 0n;
  let terminalIndex = -1;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    encoded |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      terminalIndex = index;
      break;
    }
    shift += 7n;
  }
  if (terminalIndex === -1 || terminalIndex !== bytes.length - 1 || encoded > MAX_UNSIGNED_LONG) {
    throw new Error(`${label} has an invalid Long encoding.`);
  }

  const decoded = (encoded >> 1n) ^ -(encoded & 1n);
  if (decoded < -(1n << 63n) || decoded > MAX_SIGNED_LONG) {
    throw new Error(`${label} is outside the signed Long range.`);
  }
  return decoded;
}

function readHexIdentifier(
  value: unknown,
  field: 'boxId',
  errors: LegacyMcuInventoryError[],
): string | null {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{64}$/.test(value)) {
    errors.push({
      field,
      code: 'invalid_box_id',
      message: 'boxId must be a 32-byte hex string.',
    });
    return null;
  }
  return value.toLowerCase();
}

function readNodeCreationHeight(
  value: unknown,
  errors: LegacyMcuInventoryError[],
): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    errors.push({
      field: 'creationHeight',
      code: 'invalid_node_creation_height',
      message: 'Node box creationHeight must be a non-negative safe integer.',
    });
    return null;
  }
  return value;
}

function readErgoTree(
  value: unknown,
  errors: LegacyMcuInventoryError[],
): string | null {
  if (
    typeof value !== 'string'
    || value.length < 2
    || value.length > 16_384
    || value.length % 2 !== 0
    || !/^[0-9a-fA-F]+$/.test(value)
  ) {
    errors.push({
      field: 'ergoTree',
      code: 'invalid_ergo_tree',
      message: 'ergoTree must be non-empty even-length hex.',
    });
    return null;
  }
  return value.toLowerCase();
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function requireHeight(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
