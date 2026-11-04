import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CURRENT_SHA256 = 'c08b2cfa28cddf5559fa3f7c8d3ea9cede01af986748a88651a80002d55276fd';
const HISTORICAL_SHA256 = '82e96dca999244f145a67381e0037770dfd93ad61ecb29d3063a6e5ea426a8b6';
const CURRENT_MANIFEST_SHA256 = 'e67c41b3db9c40c27fe079f1b253195aa90a735181bc99c33e079e7a98438eab';
const HISTORICAL_MANIFEST_SHA256 = '16ea523a63f6b0249510a38403701b8172e596740063272bbb9f0a05df04bb45';

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function readHistoricalConsensusSourceLockBytes(): Buffer {
  const current = readFileSync(resolve(
    import.meta.dirname, '..', '..', 'sources', 'consensus-source-lock.json',
  ));
  if (sha256(current) !== CURRENT_SHA256) {
    throw new Error('current consensus source lock differs from the reviewed fixture input');
  }

  const text = new TextDecoder('utf-8', { fatal: true }).decode(current);
  const currentField = `"manifestSha256": "${CURRENT_MANIFEST_SHA256}"`;
  const historicalField = `"manifestSha256": "${HISTORICAL_MANIFEST_SHA256}"`;
  if (text.split(currentField).length !== 2) {
    throw new Error('current consensus manifest digest must occur exactly once');
  }
  const historical = Buffer.from(text.replace(currentField, historicalField), 'utf8');
  if (sha256(historical) !== HISTORICAL_SHA256) {
    throw new Error('reconstructed historical consensus source lock differs');
  }
  return historical;
}
