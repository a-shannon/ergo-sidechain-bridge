import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CURRENT_SHA256 = '228d8f9acdbd6fbb7c3f3453a744766bb43efef15eb00fe707882a9d3b803da8';
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
  const substitutions = [
    [currentField, historicalField],
    ['32ec76b0fcc9dece3c4e85d12fe1135be14a705d1ff5c833974221a5c63baeab',
      '08fb00b4c94f7db54228b6312bea58af430f13825e2b231821da3ef26e4796c3'],
    ['3a3218b31a3198300d5db975f9670c4e64602d13',
      'ddad50c8072370bcec0fad59adb4622e3be2a7f9'],
  ] as const;
  let historicalText = text;
  for (const [currentValue, historicalValue] of substitutions) {
    if (historicalText.split(currentValue).length !== 2) {
      throw new Error('current consensus binding must occur exactly once');
    }
    historicalText = historicalText.replace(currentValue, historicalValue);
  }
  const historical = Buffer.from(historicalText, 'utf8');
  if (sha256(historical) !== HISTORICAL_SHA256) {
    throw new Error('reconstructed historical consensus source lock differs');
  }
  return historical;
}
