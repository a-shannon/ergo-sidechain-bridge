import blakejs from 'blakejs';

const BURN_ID_DOMAIN = Buffer.from('E2S_TRUSTLESS_BURN_ID_V1', 'ascii');

export function deriveTrustlessBurnIdHex(input: Readonly<{
  sidechainIdHex: string;
  sidechainTxHashHex: string;
  eventIndex: string | number;
}>): string {
  const sidechainIdHex = normalizeHex(input.sidechainIdHex, 32, 'sidechainId');
  const sidechainTxHashHex = normalizeHex(
    input.sidechainTxHashHex,
    32,
    'sidechainTxHash',
  );
  const eventIndex = normalizeUint32(input.eventIndex, 'eventIndex');
  return Buffer.from(blakejs.blake2b(Buffer.concat([
    BURN_ID_DOMAIN,
    Buffer.from(sidechainIdHex, 'hex'),
    Buffer.from(sidechainTxHashHex, 'hex'),
    uint32Be(eventIndex),
  ]), undefined, 32)).toString('hex');
}

function normalizeHex(hex: string, expectedBytes: number, label: string): string {
  const clean = hex?.startsWith('0x') ? hex.slice(2) : hex;
  if (!clean || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be hex`);
  }
  if (clean.length !== expectedBytes * 2) {
    throw new Error(
      `${label} must be ${expectedBytes} bytes, got ${clean.length / 2}`,
    );
  }
  return clean.toLowerCase();
}

function normalizeUint32(value: string | number, label: string): number {
  const raw = String(value);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed > 0xffff_ffff) {
    throw new Error(`${label} must fit in uint32`);
  }
  return parsed;
}

function uint32Be(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
}
