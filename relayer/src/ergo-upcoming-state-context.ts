export const SIMPLIFIED_UPCOMING_MINER_PK_HEX =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

export interface SimplifiedUpcomingPreHeader extends Record<string, unknown> {
  version: number;
  parentId: string;
  timestamp: number;
  nBits: number;
  height: number;
  minerPk: typeof SIMPLIFIED_UPCOMING_MINER_PK_HEX;
  votes: '';
}

export function orderAndValidateMinedHeaderWindow(
  headersInput: readonly Record<string, unknown>[],
  expectedCount = 10,
): Record<string, unknown>[] {
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 1) {
    throw new Error('expected mined header count must be a positive safe integer');
  }
  if (headersInput.length !== expectedCount) {
    throw new Error(`expected exactly ${expectedCount} mined headers`);
  }

  const headers = headersInput
    .map((header, index) => requiredRecord(header, `mined header ${index}`))
    .sort((left, right) => (
      safeInteger(right.height, 'mined header height')
      - safeInteger(left.height, 'mined header height')
    ));

  for (let index = 1; index < headers.length; index += 1) {
    const child = headers[index - 1];
    const parent = headers[index];
    const childHeight = safeInteger(child.height, `mined header ${index - 1} height`);
    const parentHeight = safeInteger(parent.height, `mined header ${index} height`);
    if (childHeight !== parentHeight + 1) {
      throw new Error(
        `mined header ${index - 1} height must be exactly one above mined header ${index}`,
      );
    }
    if (
      fixedHex(child.parentId, 32, `mined header ${index - 1} parent ID`)
      !== fixedHex(parent.id, 32, `mined header ${index} ID`)
    ) {
      throw new Error(`mined header ${index - 1} must extend mined header ${index}`);
    }
  }

  return headers;
}

export function deriveSimplifiedUpcomingPreHeader(
  tipInput: Record<string, unknown>,
): SimplifiedUpcomingPreHeader {
  const tip = requiredRecord(tipInput, 'last mined header');
  const version = byteInteger(tip.version, 'last mined header version');
  const timestamp = safeInteger(tip.timestamp, 'last mined header timestamp');
  if (timestamp === Number.MAX_SAFE_INTEGER) {
    throw new Error('last mined header timestamp cannot be incremented exactly');
  }
  const height = safeInteger(tip.height, 'last mined header height');
  if (height === Number.MAX_SAFE_INTEGER) {
    throw new Error('last mined header height cannot be incremented exactly');
  }
  return {
    version,
    parentId: fixedHex(tip.id, 32, 'last mined header ID'),
    timestamp: timestamp + 1,
    nBits: safeInteger(tip.nBits, 'last mined header nBits'),
    height: height + 1,
    minerPk: SIMPLIFIED_UPCOMING_MINER_PK_HEX,
    votes: '',
  };
}

/**
 * ergo-lib-wasm exposes PreHeader construction only through BlockHeader.
 * This carrier is discarded immediately after PreHeader.from_block_header().
 * Its three zero vote bytes are not the node's empty simplifiedUpcoming votes;
 * exact JVM conformance verifies the proof against the true empty-vote preheader.
 */
export function buildWasmSimplifiedUpcomingPreHeaderCarrier(
  tipInput: Record<string, unknown>,
): Record<string, unknown> {
  const tip = requiredRecord(tipInput, 'last mined header');
  const powSolutions = requiredRecord(tip.powSolutions, 'last mined header powSolutions');
  const predicted = deriveSimplifiedUpcomingPreHeader(tip);
  return {
    ...tip,
    version: predicted.version,
    parentId: predicted.parentId,
    timestamp: predicted.timestamp,
    nBits: predicted.nBits,
    height: predicted.height,
    powSolutions: {
      ...powSolutions,
      pk: predicted.minerPk,
    },
    votes: '000000',
  };
}

function requiredRecord(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function safeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return parsed;
}

function byteInteger(value: unknown, label: string): number {
  const parsed = safeInteger(value, label);
  if (parsed > 255) throw new Error(`${label} must fit in one byte`);
  return parsed;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (normalized.length !== bytes * 2 || !/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`${label} must be exactly ${bytes} bytes of hex`);
  }
  return normalized.toLowerCase();
}
